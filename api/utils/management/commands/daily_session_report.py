#!/usr/bin/env python3
"""
Django management command to generate daily session reports.

This command:
1. Finds all recordings from today (Pacific Time) in the acadia-recordings S3 bucket
2. Downloads MP4s and converts them to MP3s
3. Scores each session using Gemini 2.5 Flash with the tutoring rubric
4. Generates an overall daily summary with trends and insights
5. Posts the summary to Slack with individual session details in threads

Usage:
    python manage.py daily_session_report [--date YYYY-MM-DD] [--dry-run]
"""

import asyncio
import json
import logging
import os
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import boto3
import pytz
from django.core.management.base import BaseCommand
from google.genai import Client

# Set up logging
logger = logging.getLogger(__name__)


class SessionScorer:
    """Async session scoring with Gemini 2.5 Flash"""

    RUBRIC = """
# Tutoring Session Evaluation Rubric

## 1. SESSION DURATION & EFFICIENCY (Scale: 1-5)
- 5: Session is appropriately long (15+ min) with minimal off-task time. All time is used productively.
- 4: Session is adequately long (12-15 min) with little wasted time. Most time spent on instruction.
- 3: Session is adequate length (8-12 min) but includes some off-task discussion or breaks.
- 2: Session is short (5-8 min) or has significant off-task time. Limited instruction.
- 1: Session is very short (<5 min) or mostly off-task. Minimal instruction time.

## 2. STUDENT ENGAGEMENT LEVEL (Scale: 1-5)
- 5: Student is highly engaged: asks questions, volunteers answers, shows enthusiasm, maintains focus throughout.
- 4: Student is mostly engaged: responds to prompts, follows along, occasional distractions but refocuses quickly.
- 3: Student shows moderate engagement: responds when called upon, some participation but with visible effort to focus.
- 2: Student is minimally engaged: short responses, needs repeated prompts, frequent off-task comments.
- 1: Student is disengaged: reluctant participation, frequent distractions, resistance to learning.

## 3a. STUDENT MISTAKES (Scale: 1-5)
- 5: Very few mistakes (0-1); when errors occur, student self-corrects or learns from feedback.
- 4: Few mistakes (1-2); errors are learning opportunities; student responds well to correction.
- 3: Moderate mistakes (3-5); some confusion during correction; mixed understanding.
- 2: Multiple mistakes (6+); repeated errors on same concept; difficulty retaining corrections.
- 1: Severe/frequent mistakes; unable to grasp concepts after correction; no improvement shown.

## 3b. TUTOR MISTAKES/ERRORS (Scale: 1-5)
- 5: No errors observed; tutor is accurate and clear.
- 4: 1 minor mistake or slight imprecision; quickly self-corrected.
- 3: 1-2 errors or imprecisions; may or may not be corrected; minor impact on student.
- 2: Multiple errors or imprecisions; some confusion caused; not all corrected.
- 1: Significant errors or repeated inaccuracies; substantial confusion caused to student.

## 4. TUTOR-CAUSED CONFUSION (Interface & Instruction Issues) (Scale: 1-5)
- 5: Exceptional clarity. Explanations are clear, step-by-step, well-organized. No confusion. No technical issues.
- 4: Clear instruction with minor moments where clarification is needed. Excellent navigation. No/minimal technical issues.
- 3: Generally clear but some moments of confusion due to unclear explanations or pacing issues. Occasional technical glitches handled well.
- 2: Multiple instances of confusion: unclear explanations, poor sequencing, or technical issues that disrupt learning.
- 1: Frequent confusion: very unclear instruction, poor organization, significant technical problems affecting learning.
"""

    def __init__(self, api_key: str):
        client = Client(api_key=api_key)
        self.client = client.aio
        self.model = "gemini-2.5-flash"

    async def score_session_async(self, mp3_file: str, session_id: str) -> Dict[str, Any]:
        """Score a single session"""
        session_start = time.time()
        logger.info(f"Starting scoring for session {session_id}")

        try:
            # Upload file
            upload_start = time.time()
            logger.info(f"Uploading {session_id} to Gemini...")

            audio_file = await self.client.files.upload(file=mp3_file)
            upload_duration = time.time() - upload_start
            logger.info(f"Upload complete for {session_id} in {upload_duration:.1f}s: {audio_file.uri}")

            await asyncio.sleep(1)  # Brief delay after upload

            # Score on rubric AND collect examples in one call
            scoring_start = time.time()
            logger.info(f"Starting rubric scoring with examples for {session_id}")

            combined_prompt = f"""
You are evaluating a tutoring session using the following rubric:

{self.RUBRIC}

Please analyze this audio recording and provide:
1. Scores (1-5) for EACH of these 5 categories
2. For any category that scores less than 5, provide 2-3 SPECIFIC EXAMPLES of where it fell short

Return your response in this exact JSON format:
{{
    "session_duration_efficiency": {{
        "score": <1-5>,
        "reasoning": "<brief explanation>",
        "examples": "<specific examples if score < 5, otherwise 'Perfect score'>"
    }},
    "student_engagement": {{
        "score": <1-5>,
        "reasoning": "<brief explanation>",
        "examples": "<specific examples if score < 5, otherwise 'Perfect score'>"
    }},
    "student_mistakes": {{
        "score": <1-5>,
        "reasoning": "<brief explanation>",
        "examples": "<specific examples if score < 5, otherwise 'Perfect score'>"
    }},
    "tutor_mistakes": {{
        "score": <1-5>,
        "reasoning": "<brief explanation>",
        "examples": "<specific examples if score < 5, otherwise 'Perfect score'>"
    }},
    "tutor_caused_confusion": {{
        "score": <1-5>,
        "reasoning": "<brief explanation>",
        "examples": "<specific examples if score < 5, otherwise 'Perfect score'>"
    }}
}}

For examples, include:
- What specifically happened (quote or specific behavior)
- Approximate timing or context
- Why this was problematic
- How it could have been better
"""

            response = await self.client.models.generate_content(
                model=self.model,
                contents=[combined_prompt, {"file_data": {"file_uri": audio_file.uri, "mime_type": "audio/mpeg"}}],
            )
            scoring_duration = time.time() - scoring_start
            logger.info(f"Combined scoring and examples complete for {session_id} in {scoring_duration:.1f}s")

            # Parse response
            import re

            json_match = re.search(r"\{.*\}", response.text, re.DOTALL)
            if json_match:
                full_response = json.loads(json_match.group())

                # Extract scores and examples
                scores = {}
                examples = {}

                for category, data in full_response.items():
                    if isinstance(data, dict):
                        scores[category] = {"score": data.get("score"), "reasoning": data.get("reasoning")}
                        examples[category] = data.get("examples", "No examples provided")
            else:
                scores = {"error": "Could not parse response"}
                examples = {}

            # Calculate overall score
            score_values = [v["score"] for v in scores.values() if isinstance(v, dict) and "score" in v]
            overall_score = sum(score_values) / len(score_values) if score_values else 0

            file_size = os.path.getsize(mp3_file)
            file_size_mb = file_size / (1024 * 1024)

            session_duration = time.time() - session_start
            logger.info(
                f"Session {session_id} complete: {overall_score:.1f}/5 in {session_duration:.1f}s (upload: {upload_duration:.1f}s, analysis: {scoring_duration:.1f}s)"
            )

            return {
                "session_id": session_id,
                "file_size_mb": file_size_mb,
                "overall_score": overall_score,
                "scores": scores,
                "detailed_examples": examples,
                "success": True,
            }

        except Exception as e:
            session_duration = time.time() - session_start
            logger.error(f"Session {session_id} scoring failed after {session_duration:.1f}s: {str(e)}")
            return {"session_id": session_id, "error": str(e), "success": False}


class DailyReportGenerator:
    """Generate daily summary reports from session data"""

    def __init__(self, api_key: str):
        client = Client(api_key=api_key)
        self.client = client.aio
        self.model = "gemini-2.5-flash"

    async def generate_daily_summary(self, session_results: List[Dict[str, Any]], report_date: str) -> Dict[str, Any]:
        """Generate structured daily summary data from session results"""

        # Prepare data summary for Gemini
        successful_sessions = [s for s in session_results if s.get("success", False)]
        failed_sessions = [s for s in session_results if not s.get("success", False)]

        # Filter out sessions under 1 minute (60 seconds)
        sessions_before_filter = len(successful_sessions)
        successful_sessions = [
            s for s in successful_sessions if s.get("duration_seconds") is None or s.get("duration_seconds", 0) >= 60
        ]
        filtered_count = sessions_before_filter - len(successful_sessions)
        if filtered_count > 0:
            logger.info(f"Filtered out {filtered_count} session(s) under 1 minute from daily summary")

        summary_data = {
            "report_date": report_date,
            "total_sessions": len(session_results),
            "successful_analyses": len(successful_sessions),
            "failed_analyses": len(failed_sessions),
            "session_scores": [s["overall_score"] for s in successful_sessions],
            "session_details": [],
        }

        for session in successful_sessions:
            session_summary = {
                "session_id": session["session_id"],
                "overall_score": session["overall_score"],
                "file_size_mb": session["file_size_mb"],
                "category_scores": {
                    cat: data.get("score", 0) if isinstance(data, dict) else 0
                    for cat, data in session.get("scores", {}).items()
                    if cat != "error"
                },
                "detailed_examples": session.get("detailed_examples", {}),
                "score_reasoning": {
                    cat: data.get("reasoning", "") if isinstance(data, dict) else ""
                    for cat, data in session.get("scores", {}).items()
                    if cat != "error"
                },
            }
            summary_data["session_details"].append(session_summary)

        # Generate structured summary with Gemini - focus on specific insights
        summary_prompt = f"""
You are analyzing daily tutoring session data for {report_date}. Here's the complete session data including individual scores, reasoning, and detailed examples:

{json.dumps(summary_data, indent=2)}

Note: Some sessions may be very short if students left early or joined accidentally. Students can end sessions by simply leaving.

You have access to detailed_examples for each session which contain specific quotes, timings, and issues that occurred. Use these to create concrete insights.

Please analyze this data and return specific insights in this exact JSON format:

{{
    "overall_stats": {{
        "total_sessions": <number>,
        "average_score": <number>,
        "high_quality_count": <number of sessions 3.5+>,
        "concerning_count": <number of sessions <3.0>
    }},
    "engagement_analysis": {{
        "average_engagement_score": <number>,
        "specific_issues": [
            "<bullet point about specific engagement issue>",
            "<bullet point about another engagement pattern>"
        ]
    }},
    "critical_issues": [
        "<specific issue 1 with session ID and what exactly happened>",
        "<specific issue 2 with session ID and what exactly happened>",
        "<specific issue 3 with session ID and what exactly happened>"
    ]
}}

For critical_issues, be very specific and actionable. Examples of the kind of analysis we want:
- "Tutor repeatedly comes to the session unprepared or gets the homework questions wrong"
- "Tutor not engaging students very well" 
- "There's frequent mishearings of certain words from the students"
- "Session 01f458d8: Tutor started with wrong homework problem (4÷350 instead of 9.81÷0.3), wasting 15 minutes"
- "Session abc123: Student said '67' for 6×7, showing fundamental multiplication confusion that tutor didn't address"

For engagement_analysis.specific_issues, use bullet points that identify concrete patterns:
- "3 sessions had students who stopped responding after 5+ minutes"
- "Students in 2 sessions relied on texting for answers instead of working through problems"
- "Session xyz had 30+ second silences without tutor scaffolding"

Be concrete and actionable, not generic or prose-heavy.
"""

        response = await self.client.models.generate_content(
            model=self.model,
            contents=[summary_prompt],
        )

        # Parse the structured response
        import re

        json_match = re.search(r"\{.*\}", response.text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        else:
            # Fallback if parsing fails
            return {"error": "Could not parse structured summary"}

    async def generate_session_description(self, session: Dict[str, Any]) -> str:
        """Generate detailed description for a session"""
        session_id = session["session_id"]

        # Get examples from the session
        examples = session.get("detailed_examples", {})
        scores = session.get("scores", {})

        description_prompt = f"""
Based on this tutoring session analysis, write a detailed timestamped log of what happened in this session.

Session ID: {session_id}
Overall Score: {session.get("overall_score", 0):.1f}/5
File Size: {session.get("file_size_mb", 0):.1f} MB (indicates approximate duration)
Category Scores: {json.dumps({k: v.get("score") if isinstance(v, dict) else v for k, v in scores.items()}, indent=2)}
Examples: {json.dumps(examples, indent=2)}

Context: Students can end sessions by simply leaving. Some sessions might be accidental joins or very short if the student left early.

Write less than 250 words about what happened in the sessions at each timestamp. This may be a broad overview if needed to fit in the word limit.

This should give someone a clear picture of exactly what happened in this tutoring session.
"""

        response = await self.client.models.generate_content(
            model=self.model,
            contents=[description_prompt],
        )

        return response.text.strip()


class Command(BaseCommand):
    help = "Generate daily session reports from S3 recordings"

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=str,
            help="Date to analyze (YYYY-MM-DD format). Defaults to today in Pacific Time.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Run without posting to Slack",
        )

    def handle(self, *args, **options):
        """Main command handler"""
        try:
            # Set a timeout of 10 minutes for the entire process
            asyncio.run(asyncio.wait_for(self.async_handle(*args, **options), timeout=600))
        except asyncio.TimeoutError:
            self.stdout.write(self.style.ERROR("❌ Command timed out after 10 minutes"))
            logger.error("Daily session report timed out after 10 minutes")

    async def async_handle(self, *args, **options):
        """Async main handler"""
        start_time = time.time()

        # Determine target date
        pacific_tz = pytz.timezone("US/Pacific")
        if options["date"]:
            target_date = datetime.strptime(options["date"], "%Y-%m-%d").date()
        else:
            target_date = datetime.now(pacific_tz).date()

        self.stdout.write(f"🔍 Generating daily session report for {target_date}")
        logger.info(f"Starting daily session report for {target_date}")

        # Initialize components
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            self.stdout.write(self.style.ERROR("❌ GEMINI_API_KEY not found"))
            return

        scorer = SessionScorer(api_key)
        report_generator = DailyReportGenerator(api_key)

        # Create temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            try:
                # Step 1: Find and download recordings from S3
                step1_start = time.time()
                self.stdout.write("📥 Finding recordings from S3...")
                logger.info("Step 1: Finding and downloading recordings from S3")

                recordings = await self.find_todays_recordings(target_date, pacific_tz, temp_path)
                step1_duration = time.time() - step1_start

                if not recordings:
                    self.stdout.write(self.style.WARNING(f"⚠️  No recordings found for {target_date}"))
                    logger.info(f"No recordings found for {target_date}")
                    return

                self.stdout.write(f"✅ Found {len(recordings)} recordings (took {step1_duration:.1f}s)")
                logger.info(f"Step 1 complete: Found {len(recordings)} recordings in {step1_duration:.1f}s")

                # Step 2: Convert MP4s to MP3s
                step2_start = time.time()
                self.stdout.write("🔄 Converting MP4s to MP3s...")
                logger.info("Step 2: Converting MP4s to MP3s")

                mp3_files = await self.convert_to_mp3s(recordings)
                step2_duration = time.time() - step2_start

                self.stdout.write(f"✅ Converted {len(mp3_files)} files (took {step2_duration:.1f}s)")
                logger.info(f"Step 2 complete: Converted {len(mp3_files)} files in {step2_duration:.1f}s")

                # Step 3: Score all sessions concurrently
                step3_start = time.time()
                self.stdout.write("🤖 Scoring sessions with Gemini 2.5 Flash...")
                logger.info("Step 3: Scoring sessions with Gemini AI")

                session_results = await self.score_all_sessions(scorer, mp3_files)
                step3_duration = time.time() - step3_start
                successful_count = sum(1 for r in session_results if r.get("success", False))

                self.stdout.write(
                    f"✅ Scored {successful_count}/{len(session_results)} sessions (took {step3_duration:.1f}s)"
                )
                logger.info(
                    f"Step 3 complete: Scored {successful_count}/{len(session_results)} sessions in {step3_duration:.1f}s"
                )

                # Step 4: Generate daily summary
                step4_start = time.time()
                self.stdout.write("📊 Generating daily summary...")
                logger.info("Step 4: Generating daily summary")

                summary_data = await report_generator.generate_daily_summary(session_results, str(target_date))
                step4_duration = time.time() - step4_start

                self.stdout.write(f"✅ Generated summary (took {step4_duration:.1f}s)")
                logger.info(f"Step 4 complete: Generated summary in {step4_duration:.1f}s")

                # Step 5: Post to Slack
                step5_start = time.time()
                if not options["dry_run"]:
                    self.stdout.write("💬 Posting to Slack...")
                    logger.info("Step 5: Posting to Slack")

                    await self.post_to_slack(summary_data, session_results, target_date)
                    step5_duration = time.time() - step5_start

                    self.stdout.write(f"✅ Posted to Slack (took {step5_duration:.1f}s)")
                    logger.info(f"Step 5 complete: Posted to Slack in {step5_duration:.1f}s")
                else:
                    formatted_preview = self.format_structured_summary(summary_data, str(target_date))
                    self.stdout.write("🔍 DRY RUN - Would post to Slack:")
                    self.stdout.write(formatted_preview[:500] + "...")
                    step5_duration = 0
                    logger.info("Step 5: Dry run - would post to Slack")

                total_duration = time.time() - start_time
                self.stdout.write(f"🎉 Daily session report complete for {target_date} (total: {total_duration:.1f}s)")
                logger.info(f"Daily session report complete for {target_date} - Total time: {total_duration:.1f}s")

                # Log timing breakdown
                logger.info(
                    f"Timing breakdown: S3({step1_duration:.1f}s) + Convert({step2_duration:.1f}s) + Score({step3_duration:.1f}s) + Summary({step4_duration:.1f}s) + Slack({step5_duration:.1f}s) = {total_duration:.1f}s"
                )

            except Exception as e:
                total_duration = time.time() - start_time
                self.stdout.write(self.style.ERROR(f"❌ Error after {total_duration:.1f}s: {str(e)}"))
                logger.error(f"Error in daily session report after {total_duration:.1f}s: {str(e)}")
                import traceback

                traceback.print_exc()

    async def find_todays_recordings(self, target_date, pacific_tz, temp_path: Path) -> List[Dict[str, str]]:
        """Find and download all recordings from target date"""
        s3_client = boto3.client("s3")
        bucket_name = "acadia-recordings"

        recordings = []

        try:
            # List all objects in the bucket
            list_start = time.time()
            logger.info("Starting S3 object listing...")

            paginator = s3_client.get_paginator("list_objects_v2")
            page_iterator = paginator.paginate(Bucket=bucket_name)

            total_objects = 0
            matching_objects = 0

            for page in page_iterator:
                if "Contents" not in page:
                    continue

                for obj in page["Contents"]:
                    total_objects += 1
                    key = obj["Key"]

                    # Skip if not an MP4 file
                    if not key.endswith(".mp4"):
                        continue

                    # Check if file was uploaded today (Pacific Time)
                    last_modified = obj["LastModified"]
                    # Convert to Pacific time
                    pacific_time = last_modified.astimezone(pacific_tz)

                    if pacific_time.date() == target_date:
                        matching_objects += 1
                        session_id = key.split("/")[0] if "/" in key else key.replace(".mp4", "")
                        local_mp4_path = temp_path / f"{session_id}.mp4"

                        download_start = time.time()
                        self.stdout.write(f"  📥 Downloading {session_id}...")
                        logger.info(f"Downloading {session_id} from {key}")

                        s3_client.download_file(bucket_name, key, str(local_mp4_path))
                        download_duration = time.time() - download_start

                        file_size_mb = os.path.getsize(local_mp4_path) / (1024 * 1024)
                        logger.info(f"Downloaded {session_id}: {file_size_mb:.1f}MB in {download_duration:.1f}s")

                        recordings.append(
                            {
                                "session_id": session_id,
                                "s3_key": key,
                                "local_mp4_path": str(local_mp4_path),
                                "upload_time": pacific_time.strftime("%Y-%m-%d %H:%M:%S %Z"),
                            }
                        )

            list_duration = time.time() - list_start
            logger.info(
                f"S3 listing complete: Found {matching_objects} matching MP4s out of {total_objects} total objects in {list_duration:.1f}s"
            )

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"❌ Error accessing S3: {str(e)}"))
            logger.error(f"S3 error: {str(e)}")
            raise

        return recordings

    def get_audio_duration(self, mp3_path: str) -> float | None:
        """Get audio duration in seconds from MP3 file using ffprobe"""
        import subprocess

        try:
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
            if result.returncode == 0 and result.stdout.strip():
                return float(result.stdout.strip())
            return None
        except (ValueError, subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.warning(f"Could not extract audio duration from {mp3_path}: {e}")
            return None

    async def convert_to_mp3s(self, recordings: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Convert MP4 files to MP3 using ffmpeg"""
        import subprocess

        mp3_files = []

        for recording in recordings:
            mp4_path = recording["local_mp4_path"]
            mp3_path = mp4_path.replace(".mp4", ".mp3")

            try:
                # Convert using ffmpeg
                subprocess.run(["ffmpeg", "-i", mp4_path, "-q:a", "9", "-n", mp3_path], check=True, capture_output=True)

                # Get audio duration
                duration_seconds = self.get_audio_duration(mp3_path)

                mp3_files.append(
                    {
                        "session_id": recording["session_id"],
                        "mp3_path": mp3_path,
                        "upload_time": recording["upload_time"],
                        "duration_seconds": duration_seconds,
                    }
                )

            except subprocess.CalledProcessError as e:
                self.stdout.write(self.style.WARNING(f"⚠️  Failed to convert {recording['session_id']}: {e}"))

        return mp3_files

    async def score_all_sessions(self, scorer: SessionScorer, mp3_files: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """Score all sessions concurrently"""
        logger.info(f"Starting concurrent scoring of {len(mp3_files)} sessions")

        tasks = []
        for i, mp3_file in enumerate(mp3_files):
            logger.info(f"Creating scoring task {i + 1}/{len(mp3_files)} for {mp3_file['session_id']}")
            task = scorer.score_session_async(mp3_file["mp3_path"], mp3_file["session_id"])
            tasks.append(task)

        logger.info(f"Starting concurrent execution of {len(tasks)} scoring tasks")
        scoring_start = time.time()

        results = await asyncio.gather(*tasks)

        scoring_duration = time.time() - scoring_start
        successful_results = sum(1 for r in results if r.get("success", False))
        logger.info(
            f"Concurrent scoring complete: {successful_results}/{len(results)} successful in {scoring_duration:.1f}s"
        )

        # Add upload time and duration to results
        for result, mp3_file in zip(results, mp3_files):
            result["upload_time"] = mp3_file["upload_time"]
            result["duration_seconds"] = mp3_file.get("duration_seconds")

        return results

    def format_structured_summary(self, summary_data: Dict[str, Any], target_date: str) -> str:
        """Format structured summary data into Slack-friendly text"""

        if "error" in summary_data:
            return f"❌ Error generating summary: {summary_data['error']}"

        try:
            stats = summary_data.get("overall_stats", {})
            engagement = summary_data.get("engagement_analysis", {})
            critical_issues = summary_data.get("critical_issues", [])

            # Color coding based on average score
            avg_score = stats.get("average_score", 0)
            if avg_score >= 4.0:
                quality_color = "🟢"
            elif avg_score >= 3.0:
                quality_color = "🟡"
            else:
                quality_color = "🔴"

            # Format engagement issues as bullets
            engagement_issues = engagement.get("specific_issues", [])
            engagement_bullets = (
                chr(10).join(f"• {issue}" for issue in engagement_issues)
                if engagement_issues
                else "• No specific engagement issues detected"
            )

            formatted_message = f"""*OVERALL SESSION STATS* {quality_color}
• Total Sessions: {stats.get("total_sessions", 0)}
• Average Score: {avg_score:.1f}/5
• High Quality (3.5+): {stats.get("high_quality_count", 0)} sessions
• Needs Attention (<3.0): {stats.get("concerning_count", 0)} sessions 🔴

*STUDENT ENGAGEMENT ANALYSIS* 📈
• Average Engagement: {engagement.get("average_engagement_score", 0):.1f}/5
{engagement_bullets}

*🚨 CRITICAL ISSUES FROM TODAY*
{chr(10).join(f"• {issue}" for issue in critical_issues) if critical_issues else "• No critical issues detected"}"""

            return formatted_message

        except Exception as e:
            logger.error(f"Error formatting summary: {e}")
            return f"❌ Error formatting summary: {str(e)}"

    async def post_to_slack(self, summary_data: Dict[str, Any], session_results: List[Dict[str, Any]], target_date):
        """Post daily summary to Slack with individual session threads"""

        # Get the Slack client from settings
        import api.settings as api_settings

        slack_client = api_settings.slack_client

        # Use the general channel
        channel_id = "C08C3JA0YRW"  # #general channel

        # Format the structured summary for Slack
        formatted_summary = self.format_structured_summary(summary_data, target_date)

        # Main message with daily summary (using proper Slack formatting)
        main_message = f"📊 *Daily Session Report - {target_date}*\n\n<!channel>\n\n{formatted_summary}"

        try:
            logger.info("Posting main summary to Slack...")

            # Post main message
            main_response = slack_client.chat_postMessage(
                channel=channel_id, text=main_message, unfurl_links=False, unfurl_media=False
            )

            if not main_response["ok"]:
                raise Exception(f"Slack API error: {main_response.get('error', 'Unknown error')}")

            # Get the timestamp for threading
            main_ts = main_response["ts"]
            logger.info(f"Main message posted successfully, ts: {main_ts}")

            # Generate detailed descriptions for all sessions concurrently
            # Filter out sessions under 1 minute (same filter as in generate_daily_summary)
            successful_sessions = [
                s
                for s in session_results
                if s.get("success", False) and (s.get("duration_seconds") is None or s.get("duration_seconds", 0) >= 60)
            ]
            logger.info(f"Generating descriptions for {len(successful_sessions)} sessions...")

            # We need the report generator to generate descriptions
            report_generator = DailyReportGenerator(os.environ.get("GEMINI_API_KEY"))

            # Create description tasks for all sessions
            description_tasks = []
            for session in successful_sessions:
                task = report_generator.generate_session_description(session)
                description_tasks.append(task)

            # Generate all descriptions concurrently
            descriptions = await asyncio.gather(*description_tasks)

            # Post individual session summaries as threaded replies
            for i, (session, description) in enumerate(zip(successful_sessions, descriptions)):
                logger.info(f"Posting session {i + 1}/{len(successful_sessions)}: {session['session_id']}")

                session_message = self.format_session_summary(session, description)

                # Post as threaded reply
                thread_response = slack_client.chat_postMessage(
                    channel=channel_id,
                    text=session_message,
                    thread_ts=main_ts,  # This makes it a threaded reply
                    unfurl_links=False,
                    unfurl_media=False,
                )

                if not thread_response["ok"]:
                    logger.warning(f"Failed to post session {session['session_id']}: {thread_response.get('error')}")
                else:
                    logger.info(f"Session {session['session_id']} posted successfully")

            logger.info(f"Posted {len(successful_sessions)} session summaries as threaded replies")

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"❌ Error posting to Slack: {str(e)}"))
            logger.error(f"Slack posting error: {str(e)}")

    def format_session_summary(self, session: Dict[str, Any], description: str = "") -> str:
        """Format individual session summary for Slack"""
        session_id = session["session_id"]
        overall_score = session["overall_score"]
        scores = session.get("scores", {})

        # Create star rating
        stars = "⭐" * round(overall_score)

        # Extract category scores
        duration_score = scores.get("session_duration_efficiency", {}).get("score", "N/A")
        engagement_score = scores.get("student_engagement", {}).get("score", "N/A")
        student_mistakes_score = scores.get("student_mistakes", {}).get("score", "N/A")
        tutor_mistakes_score = scores.get("tutor_mistakes", {}).get("score", "N/A")
        tutor_confusion_score = scores.get("tutor_caused_confusion", {}).get("score", "N/A")

        # Identify red flags (scores < 3)
        red_flags = []
        if isinstance(duration_score, (int, float)) and duration_score < 3:
            red_flags.append("⚠️ Duration/Efficiency")
        if isinstance(engagement_score, (int, float)) and engagement_score < 3:
            red_flags.append("🚨 Student Engagement")
        if isinstance(tutor_mistakes_score, (int, float)) and tutor_mistakes_score < 3:
            red_flags.append("❌ Tutor Errors")
        if isinstance(tutor_confusion_score, (int, float)) and tutor_confusion_score < 3:
            red_flags.append("🔧 Technical Issues")

        # Estimate duration from file size (rough approximation: 1MB ≈ 1 minute for audio)
        file_size_mb = session.get("file_size_mb", 0)
        estimated_duration = f"~{file_size_mb:.0f} min" if file_size_mb > 0 else "Unknown"

        message = f"""🎯 *Session: {session_id}*

*Overall Score:* {overall_score:.1f}/5 {stars}
*Upload Time:* {session.get("upload_time", "Unknown")}
*Duration:* {estimated_duration}

*What Happened:*
{description}

*Category Scores:*
• Duration & Efficiency: {duration_score}/5
• Student Engagement: {engagement_score}/5
• Student Mistakes: {student_mistakes_score}/5
• Tutor Mistakes: {tutor_mistakes_score}/5
• Tutor Confusion: {tutor_confusion_score}/5

{f"🚨 *Red Flags:* {', '.join(red_flags)}" if red_flags else "✅ No major issues detected"}"""

        return message.strip()
