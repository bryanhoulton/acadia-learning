"""
Engagement Coach: Background multimodal agent that monitors student engagement.

Runs periodically, analyzes recent conversation AND audio for engagement issues,
and injects steering feedback into the tutor's context.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import TYPE_CHECKING

from google import genai
from google.genai import types

if TYPE_CHECKING:
    from agent.context import Context
    from agent.vad import AudioStreamer
    from tracing import TracingClient

from agent.llm.gemini import GeminiProvider
from utils.misc import track_cost

logger = logging.getLogger(__name__)

COACH_MODEL = "gemini-3-flash-preview"
# Audio input is 2x text input price for Gemini models
AUDIO_INPUT_MULTIPLIER = 2.0

# Client for the coach
_coach_client = None


def _get_coach_client() -> genai.Client:
    global _coach_client
    if _coach_client is None:
        _coach_client = genai.Client()
    return _coach_client


COACH_INTERVAL_SECONDS = 120  # Check every 2 minutes
CONTEXT_WINDOW_MESSAGES = 100  # Safety limit for fetching messages
AUDIO_BUFFER_SECONDS = 300  # Analyze last 5 minutes of audio

COACH_SYSTEM_PROMPT = f"""You are an expert engagement coach monitoring a tutoring session.
You are analyzing the LAST {AUDIO_BUFFER_SECONDS // 60} MINUTES of the session.

## IMPORTANT: DEFAULT TO NO ISSUES
Your default output should be {{"issues": []}}. Only flag something if there is **clear, unmistakable evidence** of a serious engagement problem. When in doubt, do NOT flag. False positives are far worse than missed detections — they interrupt the tutor and disrupt the session flow.

## CONTEXT & DATA STRUCTURE
This script runs every {COACH_INTERVAL_SECONDS // 60} minutes. The input text represents a {AUDIO_BUFFER_SECONDS // 60}-minute sliding window:
1.  **Old Context (Minutes 0-{AUDIO_BUFFER_SECONDS // 60 - COACH_INTERVAL_SECONDS // 60}):** Use this ONLY to establish baseline energy or detect long-term patterns. Do NOT flag isolated events here (they have likely already been handled).
2.  **Active Zone (Minutes {AUDIO_BUFFER_SECONDS // 60 - COACH_INTERVAL_SECONDS // 60}-{AUDIO_BUFFER_SECONDS // 60}):** This is your PRIORITY MONITORING ZONE. Only report **clear, sustained** issues found here.

## YOUR GOAL
Detect if the student is **severely** Disengaged, Distracted, or Confused in the *Active Zone*, or if a clear pattern from the *Context* is worsening.

## WHAT TO FLAG (high threshold — must be obvious and sustained)
1.  **DISTRACTIONS:** Only flag if the student is **clearly and repeatedly** talking to someone else, or actively doing something unrelated (e.g., sustained conversation with a parent, watching a video). Do NOT flag:
    - Normal household background noise (TV in another room, family talking nearby, pets, etc.)
    - Brief ambient sounds, hums, or single off-topic remarks
    - Any noise that the student is NOT actively participating in
2.  **COGNITIVE LOAD / CONFUSION:** Only flag if the student has **repeatedly** expressed confusion or frustration over **multiple exchanges** (not just one "huh?" or "what?").
    - A single clarifying question is normal — do not flag it.
    - Only flag if there is a clear pattern: e.g., 3+ confused responses, or audible distress.
3.  **LOW ENERGY / BOREDOM:** Only flag if the student has been **consistently** disengaged for the **entire** active zone window with minimal participation. Brief quiet moments or short answers are normal, especially for younger students.

## WHAT NOT TO FLAG
- Background noise of any kind (music, TV, siblings, dogs, traffic, etc.) unless the student is actively engaged with it instead of the lesson
- Normal pauses, thinking silences, or brief hesitations
- A single "huh?" or "what?" (students ask for clarification — that's fine)
- Short answers that still demonstrate engagement (e.g., correct answers, even if terse)
- Any ambiguous signal — if you're not sure, it's not worth flagging

## TACTICS (CRITICAL CONSTRAINT)
**Do NOT give teaching advice** (e.g., "Use an analogy," "Explain differently"). That is the Pedagogy Coach's job.
**Your tactics must be BEHAVIORAL and STATE-FOCUSED:**
* **Validate:** "Acknowledge their frustration before moving on."
* **Focus:** "Politely ask them to close other tabs/turn off TV."

## INSTRUCTIONS
1.  Scan the **Old Context** to see if the student was *already* struggling.
2.  Scan the **Active Zone** for current status.
3.  **DECISION LOGIC:**
    * If the student *was* confused but is now solving problems → **Return empty issues** (Issue resolved).
    * If the student is actively participating, even minimally → **Return empty issues** (Student is fine).
    * If there is **clear, sustained, unmistakable** evidence of disengagement → **Flag Issue**.
    * When in doubt → **Return empty issues**.

## OUTPUT FORMAT (JSON)
If all is well (this should be the MOST COMMON output): {{"issues": []}}
If intervention is clearly needed, return:

{{
  "issues": [
    {{
      "timestamp_approx": "Near end / 30s ago",
      "category": "distraction" | "confusion" | "boredom",
      "severity": "medium",
      "evidence": "Specific, concrete evidence — not just 'background noise detected'",
      "tactic": "A specific behavioral suggestion for the tutor."
    }}
  ]
}}
"""


class EngagementCoach:
    """Background coach that monitors student engagement using audio + text."""

    def __init__(
        self,
        context: Context,
        entity_id: int | None = None,
        tracing_client: TracingClient | None = None,
        audio_streamer: AudioStreamer | None = None,
    ):
        self.context = context
        self.entity_id = entity_id
        self.tracing_client = tracing_client
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._last_review_time = time.time()

        # Reference to audio streamer for continuous audio access
        self._audio_streamer = audio_streamer

    def start(self):
        """Start the background coaching loop."""
        if self._task is not None:
            return
        self._stop_event.clear()
        self._last_review_time = time.time()
        self._task = asyncio.create_task(self._run_loop(), name="engagement-coach")
        logger.info("Engagement coach started")

    def stop(self):
        """Stop the background coaching loop."""
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            self._task = None
        logger.info("Engagement coach stopped")

    def set_audio_streamer(self, audio_streamer: AudioStreamer):
        """Set the audio streamer reference (can be set after init)."""
        self._audio_streamer = audio_streamer

    def _get_recent_audio(self) -> bytes:
        """Get continuous audio from the audio streamer as WAV."""
        if self._audio_streamer is None:
            return b""
        return self._audio_streamer.get_continuous_audio_wav()

    async def _run_loop(self):
        """Main loop that runs every COACH_INTERVAL_SECONDS."""
        logger.info(f"Engagement coach starting loop (interval={COACH_INTERVAL_SECONDS}s)")
        try:
            while not self._stop_event.is_set():
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(),
                        timeout=COACH_INTERVAL_SECONDS,
                    )
                    # If we got here, stop_event was set
                    break
                except asyncio.TimeoutError:
                    # Timeout reached, run review
                    pass
                except asyncio.CancelledError:
                    raise  # Re-raise to exit outer loop

                # Run review with its own error handling to prevent loop crash
                try:
                    await self._review_engagement()
                except Exception as e:
                    logger.error(f"Error in engagement review cycle: {e}", exc_info=True)
                    # Continue loop despite error

        except asyncio.CancelledError:
            logger.debug("Engagement coach cancelled")
        except Exception as e:
            # This catches errors in the loop structure itself
            logger.error(f"Engagement coach main loop crashed: {e}", exc_info=True)

    async def _review_engagement(self):
        """Review recent context + audio for engagement issues."""
        # Get recent text messages (fetch more to ensure we cover the time window)
        current_message_count = len(self.context.messages)
        start_idx = max(0, current_message_count - CONTEXT_WINDOW_MESSAGES)
        potential_messages = self.context.messages[start_idx:]

        # Format text context with time alignment
        text_context = self._get_aligned_transcript(potential_messages)

        # Get audio context
        audio_data = self._get_recent_audio()

        # Check if we have enough data (either audio or relevant text)
        # Note: text_context always has headers, check if it has content
        has_content = len(text_context) > 200  # Arbitrary length check to ensure it's not just headers

        if not has_content and not audio_data:
            return

        number_of_messages = len(potential_messages) if "potential_messages" in locals() else 0
        logger.info(f"Reviewing engagement: {number_of_messages} msgs, {len(audio_data)} bytes audio")

        try:
            feedback = await self._get_gemini_feedback(text_context, audio_data)
            if feedback:
                logger.info(f"Engagement coach feedback: {feedback}")
                self.context.add_coaching_message(feedback)
            else:
                logger.debug("No engagement issues detected")
        except Exception as e:
            logger.error(f"Failed to get engagement feedback: {e}")

    def _get_aligned_transcript(self, messages: list) -> str:
        """Format messages relative to the audio buffer window."""
        current_time = time.time()
        cutoff_time = current_time - AUDIO_BUFFER_SECONDS
        active_cutoff = current_time - COACH_INTERVAL_SECONDS

        # Filter relevant messages
        relevant_messages = [msg for msg in messages if getattr(msg, "timestamp", 0) >= cutoff_time]

        context_lines = []
        active_lines = []

        for msg in relevant_messages:
            # Calculate relative timestamp
            msg_time = getattr(msg, "timestamp", 0)
            rel_time = int(msg_time - cutoff_time)
            rel_time = max(0, rel_time)  # Clamp to 0

            time_str = f"{rel_time // 60:02d}:{rel_time % 60:02d}"

            role = getattr(msg, "role", "unknown")
            content = getattr(msg, "content", "")

            # Handle list content
            if isinstance(content, list):
                text_parts = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        text_parts.append(part.get("text", ""))
                content = " ".join(text_parts)

            if isinstance(content, str) and content:
                formatted_line = f"[{time_str}] {role.upper()}: {content}"

                if msg_time < active_cutoff:
                    context_lines.append(formatted_line)
                else:
                    active_lines.append(formatted_line)

        # Handle silence in active zone
        if not active_lines:
            active_lines.append("(No speech detected in this section)")

        return f"""
=== OLD CONTEXT (Minutes 0-{AUDIO_BUFFER_SECONDS // 60 - COACH_INTERVAL_SECONDS // 60}) ===
{chr(10).join(context_lines)}

=== ACTIVE ZONE (Minutes {AUDIO_BUFFER_SECONDS // 60 - COACH_INTERVAL_SECONDS // 60}-{AUDIO_BUFFER_SECONDS // 60}) ===
{chr(10).join(active_lines)}
"""

    async def _get_gemini_feedback(self, text_context: str, audio_data: bytes) -> str | None:
        """Call Gemini to review the session."""
        try:
            # Add text context is handled via the prompt in this structure?
            # Or we can pass it as a text part.
            prompt_text = f"Review this recent exchange:\n\n{text_context}"

            parts = [types.Part.from_text(text=prompt_text)]

            # Add audio if available
            if audio_data:
                # Assuming PCM audio or WAV. If raw PCM, we need to wrap it or specify mime type carefully.
                # Common format from VAD is often raw 16hz mono.
                # Gemini often prefers WAV. Let's assume it's WAV for now or check runner.
                # Runner sends 'wav' format in tracing, so likely wav.
                parts.append(types.Part.from_bytes(data=audio_data, mime_type="audio/wav"))

            # Generate content
            client = _get_coach_client()
            response = await client.aio.models.generate_content(
                model=COACH_MODEL,
                contents=[types.Content(role="user", parts=parts)],
                config=types.GenerateContentConfig(
                    system_instruction=COACH_SYSTEM_PROMPT, temperature=0.4, response_mime_type="application/json"
                ),
            )

            # Track cost (approximate)
            if response.usage_metadata:
                self._track_cost(response.usage_metadata)

            # Parse result
            if not response.candidates or not response.candidates[0].content.parts:
                return None

            response_text = response.candidates[0].content.parts[0].text
            result = json.loads(response_text)

            issues = result.get("issues", [])
            if not issues:
                self._log_review(text_context, response_text, None)
                return None

            # Format feedback
            issue = issues[0]
            evidence = issue.get("evidence", "Issue detected")
            tactic = issue.get("tactic", "Check in with student")
            feedback = f"[ENGAGEMENT ALERT] {evidence}. SUGGESTION: {tactic}"

            self._log_review(text_context, response_text, feedback)
            return feedback

        except Exception as e:
            logger.error(f"Engagement LLM call failed: {e}")
            self._log_review(text_context, None, None, error=str(e))
            return None

    def _track_cost(self, usage) -> None:
        """Track LLM cost in PostHog."""
        try:
            # Gemini/Vertex usage object structure might vary, adapting to common fields
            input_tokens = usage.prompt_token_count or 0
            output_tokens = usage.candidates_token_count or 0

            # Get pricing from GeminiProvider
            pricing = GeminiProvider._get_pricing(COACH_MODEL)
            # Use audio input price since this coach processes audio
            # (text is a small portion of the input compared to 5 min of audio)
            audio_input_price = pricing.get("input", 0.50) * AUDIO_INPUT_MULTIPLIER
            output_price = pricing.get("output", 3.00)

            total_cost = ((input_tokens * audio_input_price) + (output_tokens * output_price)) / 1_000_000

            account_phone = self.context.config.account_phone if self.context.config else None
            track_cost(
                total_cost,
                "engagement-coach",
                account_phone,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                provider="google",
                model=COACH_MODEL,
            )
        except Exception as e:
            logger.warning(f"Failed to track engagement coach cost: {e}")

    def _log_review(
        self,
        context: str,
        response: str | None,
        feedback: str | None,
        error: str | None = None,
    ):
        """Log the review to tracing."""
        if self.tracing_client is None:
            return

        try:
            output = {"feedback": feedback} if feedback else {"issue_detected": False}
            if error:
                output["error"] = error

            with self.tracing_client.text_span(
                "engagement_review",
                input=context[:500] + "..." if len(context) > 500 else context,
            ) as span:
                span.output(json.dumps(output))
        except Exception:
            logger.exception("Failed to log engagement review")
