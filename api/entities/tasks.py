from __future__ import annotations

import logging
import os
import signal
import tempfile
import time
from datetime import timedelta
from typing import Literal

import boto3
from celery import shared_task, signals
from django.conf import settings
from django.utils import timezone
from pydantic import BaseModel

from api.settings import gai
from sms.utils import send_notification_sms
from tracing.spans import traced
from utils.llms import format_schema_for_google
from utils.slack import SlackChannel, send_slack_message

from .models import Annotation, Entity, Session
from .runtime import EntityRuntime

logger = logging.getLogger(__name__)

# Cache for Gemini profile to avoid repeated DB lookups
_gemini_profile_cache = None


class AnnotationSuggestion(BaseModel):
    start_time: float
    end_time: float
    category: Literal[
        "off_topic",
        "unclear",
        "canvas_rendering",
        "canvas_coherence",
        "unresponsive",
        "premature_answer",
        "bad_explanation",
        "ignoring_student_misunderstanding",
        "misleveling",
        "not_reading_the_room",
        "not_changing_pedagogical_method",
        "canvas_misuse",
        "missing_motivational_techniques",
        "incomplete_scaffolding",
        "premature_end",
        "bad_pedagogy",
        "other",
    ]
    severity: Literal["preference", "recoverable_failure", "total_failure"]
    sentiment: Literal["negative"]
    notes: str

    model_config = {"extra": "ignore"}

    model_config = {"extra": "ignore"}


class LevelingAssessment(BaseModel):
    status: Literal["too_advanced", "too_simple", "appropriate", "no_signal"]
    reasoning: str
    evidence: str
    suggested_level: str

    model_config = {"extra": "ignore"}


class AnnotationResponse(BaseModel):
    annotations: list[AnnotationSuggestion]
    leveling_assessment: LevelingAssessment

    model_config = {"extra": "ignore"}


ANNOTATION_SCHEMA = format_schema_for_google(AnnotationResponse.model_json_schema())


def get_gemini_profile():
    """Get or create the Gemini user profile for automated annotations."""
    global _gemini_profile_cache
    if _gemini_profile_cache is not None:
        return _gemini_profile_cache

    from django.contrib.auth.models import User

    from lms.accounts.models import Account, UserProfile

    gemini_profile = UserProfile.objects.filter(name="Gemini").first()
    if not gemini_profile:
        # Create system account if it doesn't exist
        system_account = Account.objects.filter(account_phone="+0000000000").first()
        if not system_account:
            system_user = User.objects.create_user(username="system-gemini", is_active=False)
            system_account = Account.objects.create(
                user=system_user,
                account_phone="+0000000000",
                is_active=False,
                referral_code="SYSTEM00",
            )
        gemini_profile = UserProfile.objects.create(
            name="Gemini",
            profile_type="parent",
            account=system_account,
        )
        logger.info(f"Created Gemini profile: {gemini_profile.id}")

    _gemini_profile_cache = gemini_profile
    return gemini_profile


def _generate_transcript(audio_file) -> str:
    """Generate transcript from audio file."""
    logger.info("Generating transcript with Gemini")
    response = gai.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            audio_file,
            "Please provide a direct, word-for-word transcript of this audio recording. "
            "Include speaker labels if you can identify multiple speakers (e.g., 'Agent:', 'User:'). "
            "Be as accurate as possible with the exact words spoken.",
        ],
    )
    transcript = response.text if response.text else ""
    logger.info(f"Generated transcript ({len(transcript)} chars)")
    return transcript


def _generate_timestamped_summary(audio_file) -> str:
    """Generate timestamped summary from audio file."""
    logger.info("Generating timestamped summary with Gemini")
    response = gai.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            audio_file,
            "Please provide a detailed timestamped summary of this audio recording. "
            "Format each entry as 'MM:SS - Brief description of what happened'. "
            "Include key moments, topic changes, questions asked, explanations given, etc. "
            "Be thorough and capture the flow of the conversation. "
            "Also, at the end, please provide the actual duration of audio content "
            "(excluding any significant silence) in seconds.",
        ],
    )
    summary = response.text if response.text else ""
    logger.info(f"Generated timestamped summary ({len(summary)} chars)")
    return summary


def _generate_name_description(audio_file) -> tuple[str | None, str | None]:
    """Generate session name and description from audio file."""
    import re

    logger.info("Generating session name and description with Gemini")
    response = gai.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            audio_file,
            "Based on this tutoring session audio, please provide:\n"
            "1. A short, descriptive name for this session (5-8 words max)\n"
            "2. A brief 2-3 sentence description of what happened in the session\n\n"
            "If nothing happened, note that nothing happened. Do not make up information that you do not have."
            "Format your response as:\n"
            "NAME: [your session name]\n"
            "DESCRIPTION: [your 2-3 sentence description]",
        ],
    )

    name = None
    description = None
    if response.text:
        name_match = re.search(r"NAME:\s*(.+?)(?:\n|$)", response.text, re.IGNORECASE)
        desc_match = re.search(r"DESCRIPTION:\s*(.+?)(?:\n\n|\Z)", response.text, re.IGNORECASE | re.DOTALL)
        if name_match:
            name = name_match.group(1).strip()
        if desc_match:
            description = desc_match.group(1).strip()

    logger.info(f"Generated session name: {name}")
    return name, description


def _generate_annotations_data(audio_file) -> dict:
    """Generate annotation data and leveling assessment from audio file (does not create DB records)."""
    import json

    logger.info("Generating Gemini annotations")
    response = gai.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[
            audio_file,
            """
        You are an expert QA grader for US middle school and high school tutoring (audio sessions). Your task is to find tutor behaviors that reduce learning, engagement, or trust.

        Listen to the ENTIRE tutoring session carefully. Identify ALL moments where the tutor makes a pedagogical mistake or misses an important opportunity to support the student. For each issue, output one JSON annotation with a time span covering the tutor’s problematic behavior.
        
        Also, evaluate the appropriate leveling of the content for this specific student.

        CATEGORIES (use EXACTLY one of these strings):
            - "premature_answer" Tutor gives away the final answer or a key step too early.
            Includes: solving it for the student, revealing the correct choice, providing the key formula/approach before eliciting the student’s thinking.
            Not this: giving a small hint after the student has genuinely tried and explained their reasoning.
            - "bad_explanation" Explanation is confusing, incorrect, too abstract, too fast, or not grounded in the student’s level.
            Includes: jargon without defining it, skipping critical steps, inconsistent notation, explaining in a way that doesn’t connect to the problem at hand.
            - "ignoring_student_misunderstanding” Student shows a misconception or says they’re confused, and the tutor fails to address it.
            Includes: correcting the answer without probing the underlying reasoning, moving on without fixing the misconception, not checking comprehension after confusion.
            - "misleveling" Tutor chooses problems or steps that are clearly too hard or too easy for where the student is right now.
            Includes: jumping difficulty too quickly, giving busywork that’s trivial, pushing advanced methods before basics are stable.
            - "not_reading_the_room" Tutor misses obvious cues about the student’s emotional state or engagement (confusion, frustration, boredom, distraction, overwhelm).
            Includes: ignoring long silences, student’s repeated uncertainty, signs of disengagement, student asking to slow down, student sounding upset.
            - "not_changing_pedagogical_method" Student is not progressing, but the tutor keeps using the same approach instead of switching strategies.
            Includes: repeating the same explanation, failing to try a different representation (example, analogy, visual breakdown, simpler numbers, step-by-step prompts), not offering alternative paths.
            - "canvas_misuse" Tutor fails to use the canvas/whiteboard effectively when it would materially help learning.
            Includes: not writing the problem/steps when needed, cluttered/unclear writing, missing labels/units, inconsistent variables, not showing work, or writing things that conflict with what’s said aloud.
            - "missing_motivational_techniques" Tutor misses chances to build confidence, reinforce effort, or create momentum.
            Includes: no positive reinforcement when earned, not acknowledging effort, overly blunt/negative tone, missing relationship-building moments, not using encouragement or “small wins,” not framing mistakes as learning opportunities.
            - "incomplete_scaffolding" Tutor does not provide enough structure for the student to succeed independently.
            Includes: unclear instructions, too many steps at once, not giving choices (“want a hint or try one more time?”), not chunking, not setting up the next action, not confirming what the student will do next.
            - "premature_end" Tutor ends the session early while there is still time left, or gives up on a problem too soon.
            - "bad_pedagogy" General negative pedagogical practice not covered by other categories.
            - "other" Any other significant issue that doesn't fit the above categories.

        SEVERITY (enum only, pick EXACTLY one):
            - "preference" Minor issue; better handling would improve experience, but lesson likely still succeeds (roughly 2–4/10 impact).
            - "recoverable_failure" Meaningful detractor; caused lost learning, unnecessary confusion, or gave away too much too soon, but session can continue (roughly 5–7/10 impact).
            - "total_failure" Major breakdown; likely causes loss of trust, strong disengagement, or effectively ends the learning value of the segment/session (8+/10 impact).

        LEVELING ASSESSMENT:
        Assess if the content was appropriate for the student's current skill level.
        - status: "too_advanced" (student noticeably lost/frustrated), "too_simple" (student bored/finding it trivial), "appropriate" (student challenged but making progress), or "no_signal" (disengaged/no relevant interaction).
        - suggested_level: A 1-sentence description of what the *correct* level/topic would be for this student based on what you heard.

        OUTPUT FORMAT:
        Return ONLY a JSON object matching the Schema.
        
        {
          "annotations": [
             {
                “start_time”: 135.0,
                “end_time”: 145.0,
                “category”: “premature_answer”,
                “severity”: “recoverable_failure”,
                “sentiment”: “negative”,
                “notes”: “Issue: <1 sentence>. Evidence (tutor words): ‘’. Student context: <what student said/did that matters>. Why it hurts learning/engagement: <1 sentence>. Better approach: <what the tutor should have done instead, ideally with a concrete alternate line>.”
             }
          ],
          "leveling_assessment": {
              "status": "appropriate",
              "reasoning": "...",
              "evidence": "...",
              "suggested_level": "..."
          }
        }

        ANNOTATION RULES:
            - start_time and end_time are in SECONDS (e.g., 2:15 = 135.0).
            - Tag ONLY tutor mistakes or missed tutor opportunities (not student mistakes).
            - Be thorough: find ALL instances across the full session.
            - If an issue continues over a stretch, use one annotation for the continuous stretch. If it happens in separate moments, make separate annotations.
            - Use one primary category per annotation. If multiple issues happen at once, pick the most important one and mention the others in notes.
            - Keep annotations ordered by start_time ascending.
            - sentiment is always “negative”.
            - If there are no issues, return empty list for annotations.

        Return ONLY the JSON object, nothing else.""",
        ],
        config={
            "response_mime_type": "application/json",
            "response_schema": ANNOTATION_SCHEMA,
        },
    )

    try:
        if response.parsed is not None:
            # response.parsed should be a dict matching AnnotationResponse
            parsed_data = response.parsed  # type: ignore
            # Handle both object (if Pydantic model) and dict
            if hasattr(parsed_data, "model_dump"):
                result_data = parsed_data.model_dump()
            else:
                result_data = parsed_data

            logger.info(f"Generated {len(result_data.get('annotations', []))} annotation suggestions")
            return result_data
    except Exception as e:
        logger.error(f"Failed to parse structured Gemini annotations: {e}")

    response_text = response.text.strip() if response.text else "{}"

    # Remove markdown code blocks if present
    if response_text.startswith("```"):
        response_text = response_text.split("\n", 1)[1]
        response_text = response_text.rsplit("\n", 1)[0]
        if response_text.startswith("json"):
            response_text = response_text[4:].strip()

    try:
        annotations_data = json.loads(response_text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini annotations JSON: {e}")
        logger.error(f"Response text: {response_text[:500]}")
        return {"annotations": [], "leveling_assessment": None}

    if not isinstance(annotations_data, dict):
        logger.error(f"Expected dict of annotations, got: {type(annotations_data)}")
        # Check if it's the old list format
        if isinstance(annotations_data, list):
            return {"annotations": annotations_data, "leveling_assessment": None}
        return {"annotations": [], "leveling_assessment": None}

    return annotations_data


def save_gemini_annotations(session: Session, analysis_result: dict) -> int:
    """Save annotation data and leveling assessment to database."""
    if not analysis_result:
        return 0

    # Save leveling assessment to session
    leveling = analysis_result.get("leveling_assessment")
    if leveling:
        try:
            session.leveling_assessment = leveling
            session.save(update_fields=["leveling_assessment"])
            logger.info(f"Saved leveling assessment for session {session.id}: {leveling.get('status')}")
        except Exception as e:
            logger.error(f"Failed to save leveling assessment: {e}")

    annotations_data = analysis_result.get("annotations", [])
    if not annotations_data:
        return 0

    gemini_profile = get_gemini_profile()
    created_count = 0

    for ann in annotations_data:
        try:
            Annotation.objects.create(
                session=session,
                start_time=float(ann["start_time"]),
                end_time=float(ann["end_time"]),
                sentiment=ann.get("sentiment", "negative"),
                category=ann.get("category"),
                severity=ann.get("severity"),
                notes=ann.get("notes", ""),
                created_by=gemini_profile,
            )
            created_count += 1
        except (KeyError, ValueError, TypeError) as e:
            logger.warning(f"Skipping invalid annotation: {e} - {ann}")
            continue

    logger.info(f"Created {created_count} Gemini annotations for session {session.id}")
    return created_count


MAX_RUN_DURATION = timedelta(minutes=30)
FORCED_SLEEP_DURATION = timedelta(minutes=5)


@shared_task(name="entities.check_wakeup")
def check_entities_wakeup():
    """Celery task that scans all entities and schedules run tasks if needed."""

    logger.info("Checking entities for wakeup")

    entities = (
        Entity.objects.select_related("account")
        .exclude(
            account__is_human_controlled=True,  # Human-controlled accounts operate manually
        )
        .exclude(
            status=Entity.EntityStatus.ON_CALL,  # Entities on a call should stay active
        )
    )

    for entity in entities:
        if entity.run_started_at and timezone.now() - entity.run_started_at > MAX_RUN_DURATION:
            logger.warning("Entity %s exceeded max run duration; forcing sleep", entity.id)
            entity.sleep(timezone.now() + FORCED_SLEEP_DURATION)
            continue

        if entity.should_wakeup() or len(entity.has_unread_sms()) > 0:
            possibly_run_entity(entity.pk, wakeup=True)


def possibly_run_entity(entity_id: int, wakeup: bool = False) -> bool:
    """Run an entity if it's not already running, on a call, or sleeping.

    Uses select_for_update() to prevent race conditions where multiple
    concurrent calls could all see status=SLEEPING and queue duplicate tasks.
    Status is set to RUNNING before queuing to ensure idempotency.
    """
    from django.db import transaction

    with transaction.atomic():
        entity = Entity.objects.select_for_update().select_related("account").get(pk=entity_id)

        # Skip human-controlled accounts - they operate manually via control panel
        if entity.account.is_human_controlled:
            logger.info("Entity %s is human-controlled, skipping", entity.id)
            return False

        if entity.status == Entity.EntityStatus.RUNNING:
            logger.info("Entity %s is already running, skipping", entity.id)
            return False

        if entity.status == Entity.EntityStatus.ON_CALL:
            logger.info("Entity %s is on a call, skipping", entity.id)
            return False

        if not wakeup and not entity.should_wakeup():
            logger.info("Entity %s is sleeping, skipping", entity.id)
            return False

        # Set status to RUNNING before queuing to prevent race conditions
        entity.wake()

    run_entity.delay(entity_id)
    return True


@signals.worker_process_shutdown.connect
def log_recycle_reason(pid=None, exitcode=None, **kwargs):
    logger.warning(f"[Celery] Child {pid} shutting down with exitcode={exitcode}")


@shared_task(name="entities.run_entity")
def run_entity(entity_id: int):
    """Run a single entity."""
    try:
        entity = Entity.objects.select_related("account").get(pk=entity_id)
    except Entity.DoesNotExist:
        logger.warning("Entity %s not found", entity_id)
        return

    # Idempotency check: verify status is RUNNING (set by possibly_run_entity)
    # If status changed since queuing (e.g., another task took over), abort
    if entity.status != Entity.EntityStatus.RUNNING:
        logger.info(
            "Entity %s status is %s (not RUNNING), skipping duplicate task",
            entity.id,
            entity.status,
        )
        return

    def handle_sigterm(signum, frame):
        logger.info("Received SIGTERM, shutting down entity %s", entity.id)
        if entity.status == Entity.EntityStatus.RUNNING:
            logger.info("Entity %s is running, forcing sleep", entity.id)
            entity.sleep(timezone.now() + timedelta(minutes=10))
        raise SystemExit(0)

    logger.info("Running entity %s", entity.id)
    runtime = EntityRuntime(entity)
    try:
        # Run runtime directly
        signal.signal(signal.SIGTERM, handle_sigterm)
        runtime.run()
        time.sleep(1)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error running entity %s: %s", entity.id, exc)


@shared_task(
    name="entities.merge_and_process_sessions",
    soft_time_limit=1800,
    time_limit=2700,
)
def merge_and_process_sessions(target_session_id: str, recording_keys: list[str]):
    """
    Download multiple recording files from S3, merge them, upload back to target session's key,
    and trigger processing.
    """
    logger.info(f"Merging {len(recording_keys)} sessions into {target_session_id}")

    temp_files = []
    try:
        s3_client = boto3.client("s3")
        bucket = "acadia-recordings"

        # Download all files
        input_txt_content = ""
        for key in recording_keys:
            # Basic check for extension, default to .mp4 if unknown
            ext = os.path.splitext(key)[1] or ".mp4"
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                logger.info(f"Downloading {key}")
                s3_client.download_file(bucket, key, tmp.name)
                temp_files.append(tmp.name)
                # Escape path for ffmpeg concat file
                # ffmpeg concat requires safe paths. Simple absolute paths usually work with -safe 0
                input_txt_content += f"file '{tmp.name}'\n"

        # Create concat list file
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as list_file:
            list_file.write(input_txt_content)
            list_file_path = list_file.name
            temp_files.append(list_file_path)

        # Target key is the first one (original target session file)
        target_key = recording_keys[0]

        # Output file
        merged_output_path = temp_files[0] + "_merged.mp4"
        temp_files.append(merged_output_path)

        # FFmpeg concat
        logger.info("Concatenating audio files")
        import subprocess

        subprocess.run(
            ["ffmpeg", "-f", "concat", "-safe", "0", "-i", list_file_path, "-c", "copy", "-y", merged_output_path],
            check=True,
            capture_output=True,
        )

        # Upload back to S3
        logger.info(f"Uploading merged file to {target_key}")
        s3_client.upload_file(merged_output_path, bucket, target_key)

        # Trigger processing
        process_session_recording.delay(target_session_id, target_key)

    except Exception as e:
        logger.exception(f"Error merging sessions: {e}")
        # Optionally notify via Slack or update session error state
    finally:
        # Cleanup
        for f in temp_files:
            if os.path.exists(f):
                try:
                    os.remove(f)
                except OSError:
                    pass


@shared_task(
    name="entities.process_session_recording",
    soft_time_limit=1800,  # 30 minutes - allows graceful cleanup
    time_limit=2700,  # 45 minutes - hard kill if exceeded
)
@traced
def process_session_recording(session_id: str, file_path: str):
    """
    Process a LiveKit session recording:
    1. Download mp4 from S3
    2. Convert to mp3
    3. Use Gemini to analyze (transcript, timestamped summary)
    4. Extract audio duration from MP3 file
    5. Update Session record
    6. Send Slack notification
    7. Clean up temporary files
    """
    logger.info(f"Processing session recording {session_id} from {file_path}")

    try:
        session = Session.objects.get(id=session_id)
    except Session.DoesNotExist:
        logger.error(f"Session {session_id} not found")
        return

    mp4_path = None
    mp3_path = None

    try:
        # Step 1: Download mp4 from S3
        logger.info(f"Downloading {file_path} from S3")
        s3_client = boto3.client("s3")

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_mp4:
            mp4_path = tmp_mp4.name
            s3_client.download_file("acadia-recordings", file_path, mp4_path)
            logger.info(f"Downloaded to {mp4_path}")

        # Step 2: Convert mp4 to mp3 using ffmpeg
        logger.info("Converting mp4 to mp3")
        import subprocess

        mp3_path = mp4_path.replace(".mp4", ".mp3")
        subprocess.run(
            ["ffmpeg", "-i", mp4_path, "-q:a", "9", "-n", mp3_path],
            check=True,
            capture_output=True,
        )
        logger.info(f"Converted to {mp3_path}")

        # Step 3: Upload mp3 to Gemini and analyze in parallel
        logger.info("Uploading audio to Gemini for analysis")

        # Upload the audio file
        audio_file = gai.files.upload(file=mp3_path)
        logger.info(f"Uploaded audio file: {audio_file.name}")

        # Run all Gemini analysis tasks in parallel
        logger.info("Running Gemini analysis tasks in parallel")
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=4) as executor:
            future_transcript = executor.submit(_generate_transcript, audio_file)
            future_summary = executor.submit(_generate_timestamped_summary, audio_file)
            future_name_desc = executor.submit(_generate_name_description, audio_file)
            future_annotations = executor.submit(_generate_annotations_data, audio_file)

            # Collect results
            transcript = future_transcript.result()
            timestamped_summary = future_summary.result()
            name, description = future_name_desc.result()
            annotations_data = future_annotations.result()

        logger.info("All Gemini analysis tasks completed")

        # Extract audio duration from the MP3 file using ffprobe
        audio_duration = None
        try:
            import subprocess

            # Use ffprobe to get audio duration
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "csv=p=0",
                    mp3_path,
                ],
                capture_output=True,
                text=True,
            )
            # Check for successful execution
            if result.returncode == 0 and result.stdout.strip():
                audio_duration = float(result.stdout.strip())
                logger.info(f"Extracted audio duration from MP3: {audio_duration} seconds")
            elif result.returncode != 0:
                logger.warning(f"ffprobe returned exit code {result.returncode}: {result.stderr}")
                audio_duration = None
            else:
                logger.warning("ffprobe returned empty output")
                audio_duration = None
        except (ValueError, subprocess.CalledProcessError) as e:
            logger.warning(f"Could not extract audio duration from MP3: {e}")
            audio_duration = None
        except FileNotFoundError:
            logger.warning("ffprobe not found in system PATH")
            audio_duration = None

        # Step 4: Calculate session start/end times
        # If session_started_at exists (e.g. from a merge or previous processing), preserve it and adjust end time.
        # Otherwise, assume created_at is the end time (webhook logic).
        session_ended_at = session.created_at
        session_started_at = session.session_started_at

        if session_started_at and audio_duration:
            # Re-calculating end time based on preserved start time + new duration
            from datetime import timedelta

            session_ended_at = session_started_at + timedelta(seconds=audio_duration)
            logger.info(f"Updated session end time based on existing start: {session_ended_at}")
        elif audio_duration:
            from datetime import timedelta

            # Default: created_at is end
            session_started_at = session_ended_at - timedelta(seconds=audio_duration)
            logger.info(f"Calculated session start time: {session_started_at}")

        # Step 5: Update Session record
        logger.info("Updating session record")
        session.name = name
        session.description = description
        session.transcript = transcript
        session.timestamped_summary = timestamped_summary
        session.audio_duration_seconds = audio_duration
        session.session_started_at = session_started_at
        session.session_ended_at = session_ended_at
        session.processed_at = timezone.now()
        session.processing_error = None  # Clear any previous error on success
        session.save()

        # Track in PostHog if we have a profile and duration
        if session.profile and session.audio_duration_seconds is not None:
            try:
                from utils.posthog import track_tutoring_session

                duration = session.audio_duration_seconds  # Type narrowing for linter
                track_tutoring_session(
                    account_phone=session.profile.account.account_phone,
                    profile_id=str(session.profile.id),
                    profile_name=session.profile.name or "Unknown",
                    duration_seconds=duration or 0,
                    session_started_at=session.session_started_at,
                )
                logger.info(f"Tracked session in PostHog for profile {session.profile.name}")
            except Exception as e:
                logger.error(f"Failed to track session in PostHog: {e}")

        # Step 5b: Save Gemini annotations for pedagogical review (data already generated in parallel)
        annotation_count = 0
        try:
            annotation_count = save_gemini_annotations(session, annotations_data)
        except Exception as e:
            logger.error(f"Failed to save Gemini annotations: {e}")

        # Step 6: Send Slack notification
        logger.info("Sending Slack notification")

        # Format duration nicely
        if audio_duration:
            total_seconds = int(audio_duration)
            hours, remainder = divmod(total_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            if hours > 0:
                duration_str = f"{hours} hr {minutes} min"
            elif minutes > 0:
                duration_str = f"{minutes} min {seconds} sec"
            else:
                duration_str = f"{seconds} sec"
        else:
            duration_str = "Unknown"

        # Step 6b: Send notification if this is a human-controlled account
        if session.profile and session.profile.account.is_human_controlled:
            notification_msg = (
                f"[Human Account] Session ended with {session.profile.name or 'Unknown'}: "
                f"{name or 'Tutoring session'} ({duration_str})"
            )
            send_notification_sms(notification_msg)

        # Format session times
        session_time_str = ""
        if session_started_at:
            session_time_str = (
                f"\n*Session Time:* {session_started_at.strftime('%I:%M %p')} - {session_ended_at.strftime('%I:%M %p')}"
            )

        # Get profile name if available
        profile_name_str = ""
        if session.profile:
            profile_name_str = f"\n*Profile:* {session.profile.name or 'Unknown'}"

        # Construct URLs
        admin_url = f"{settings.API_URL}/admin/entities/session/{session_id}/change/"
        annotate_url = f"{settings.FRONTEND_URL}/annotate?session={session_id}"

        annotation_str = f"\n*Gemini Annotations:* {annotation_count} issues found" if annotation_count > 0 else ""

        leveling_str = ""
        if session.leveling_assessment:
            status = session.leveling_assessment.get("status", "unknown")
            suggested = session.leveling_assessment.get("suggested_level", "")

            status_icon = (
                "✅"
                if status == "appropriate"
                else "⚠️"
                if status == "too_simple"
                else "🚨"
                if status == "too_advanced"
                else "❓"
            )
            leveling_str = f"\n*Leveling:* {status_icon} {status.replace('_', ' ').title()}"
            if suggested and status != "appropriate":
                leveling_str += f"\n> Suggestion: {suggested}"

        slack_message = f"""
📅 *{name or "Session Recording Processed"}*
*Audio Duration:* {duration_str}{session_time_str}{profile_name_str}{leveling_str}{annotation_str}

{description or "No description available"}

<{annotate_url}|Listen to session>
<{admin_url}|View in Admin>
        """.strip()

        send_slack_message(SlackChannel.CALL_RECORDINGS, slack_message)

        logger.info(f"Successfully processed session {session_id}")

    except Exception as e:
        logger.exception(f"Error processing session {session_id}: {e}")
        # Update session with error
        session.processing_error = str(e)
        session.processed_at = timezone.now()
        session.save()

        # Send error notification to Slack
        send_slack_message(
            SlackChannel.CALL_RECORDINGS,
            f"❌ Error processing session {session.room_name}: {str(e)}",
        )

    finally:
        # Step 7: Clean up temporary files
        if mp4_path and os.path.exists(mp4_path):
            os.remove(mp4_path)
            logger.info(f"Cleaned up {mp4_path}")
        if mp3_path and os.path.exists(mp3_path):
            os.remove(mp3_path)
            logger.info(f"Cleaned up {mp3_path}")
