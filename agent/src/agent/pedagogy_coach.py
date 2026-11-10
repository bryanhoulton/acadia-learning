"""
Pedagogy Coach: Background LLM that periodically reviews tutoring quality.

Runs every ~2 minutes, analyzes recent conversation for pedagogical issues,
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
    from tracing import TracingClient

from agent.llm.gemini import GeminiProvider
from utils.misc import track_cost

logger = logging.getLogger(__name__)

COACH_MODEL = "gemini-3-flash-preview"

# Use a separate client for the coach to avoid contention
_coach_client: genai.Client | None = None


def _get_coach_client() -> genai.Client:
    global _coach_client
    if _coach_client is None:
        _coach_client = genai.Client()
    return _coach_client


COACH_INTERVAL_SECONDS = 120  # Run every 2 minutes
CONTEXT_WINDOW_MESSAGES = 25  # ~5 minutes of context (assuming ~5 messages/min)

COACH_SYSTEM_PROMPT = """You are a master teacher giving notes to a tutor mid-session. 

You'll see CONTEXT (earlier conversation) and RECENT EXCHANGE (last minute or so).

Your notes have two parts:

## PART 1: CRITIQUE — What could have gone better?

Look for these in the RECENT EXCHANGE:

- GAVE AWAY ANSWER: Tutor told instead of guided ("The answer is 5", solving steps for them)
- EMPTY PRAISE: Said "Correct!" without checking understanding  
- SKIPPED REASONING: Didn't ask "How did you get that?" or "Why?"

Be direct but brief. If nothing wrong, say null.

## PART 2: IDEAS — Resources for the tutor to draw from

Don't tell the tutor what to do. Instead, give them useful ideas they can use however they want:

- TOPIC: What concept is being taught?
- TEACHING IDEAS: 2-3 approaches that work well for this topic (analogies, visuals, example sequences, question types). These are options, not instructions.
- KEY IDEAS: The core understandings for this concept — what matters most for the student to grasp
- CLASSIC AHA MOMENTS: Breakthroughs that commonly happen when learning this — what realizations unlock understanding? What misconceptions, once cleared up, create insight?

Think: "Here's what I know about teaching this topic that might be useful to you."

RESPOND IN JSON:
{
  "critique": "Brief note on what could improve (or null)",
  "ideas": {
    "topic": "The concept being taught",
    "teaching_ideas": ["Approach that works well", "Another option"],
    "key_ideas": ["Core understanding 1", "Core understanding 2"],
    "aha_moments": ["Common breakthrough and what triggers it"]
  }
}

If just routine homework help, ideas can be null.
Be specific to the actual content. Generic pedagogy advice is useless."""


class PedagogyCoach:
    """Background coach that monitors tutoring quality and provides steering feedback."""

    def __init__(
        self,
        context: "Context",
        entity_id: int | None = None,
        tracing_client: "TracingClient | None" = None,
    ):
        self.context = context
        self.entity_id = entity_id
        self.tracing_client = tracing_client
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()
        self._last_review_time = time.time()
        self._last_message_count = 0

    def start(self):
        """Start the background coaching loop."""
        if self._task is not None:
            return
        self._stop_event.clear()
        self._last_review_time = time.time()
        self._last_message_count = len(self.context.messages)
        self._task = asyncio.create_task(self._run_loop(), name="pedagogy-coach")
        logger.info("Pedagogy coach started")

    def stop(self):
        """Stop the background coaching loop."""
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            self._task = None
        logger.info("Pedagogy coach stopped")

    async def _run_loop(self):
        """Main loop that runs every COACH_INTERVAL_SECONDS."""
        try:
            while not self._stop_event.is_set():
                # Wait for the interval (or until stopped)
                try:
                    await asyncio.wait_for(
                        self._stop_event.wait(),
                        timeout=COACH_INTERVAL_SECONDS,
                    )
                    # If we get here, stop was requested
                    break
                except asyncio.TimeoutError:
                    # Interval elapsed, time to review
                    pass

                await self._review_and_coach()

        except asyncio.CancelledError:
            logger.debug("Pedagogy coach cancelled")
        except Exception as e:
            logger.error(f"Pedagogy coach error: {e}", exc_info=True)

    async def _review_and_coach(self):
        """Review recent messages and inject coaching if needed."""
        current_message_count = len(self.context.messages)

        # Skip if no new messages since last review
        if current_message_count <= self._last_message_count:
            logger.debug("No new messages since last review, skipping")
            self._last_review_time = time.time()
            return

        # Get messages since last review (for issue detection)
        new_messages = self.context.messages[self._last_message_count :]

        # Skip if too few new messages (need at least a couple exchanges)
        if len(new_messages) < 2:
            self._last_message_count = current_message_count
            self._last_review_time = time.time()
            return

        # Get context messages from ~5 minutes ago for better topic understanding
        context_start = max(0, current_message_count - CONTEXT_WINDOW_MESSAGES)
        context_messages = self.context.messages[context_start : self._last_message_count]

        self._last_message_count = current_message_count
        self._last_review_time = time.time()

        # Format messages for review (context + new)
        formatted = self._format_messages_for_review(
            context_messages=context_messages,
            new_messages=new_messages,
        )
        if not formatted.strip():
            return

        logger.info(
            f"Reviewing {len(new_messages)} new messages "
            f"(with {len(context_messages)} context messages) for pedagogy issues"
        )

        try:
            feedback = await self._get_coaching_feedback(formatted)
            if feedback:
                logger.info(f"Pedagogy coach feedback: {feedback}")
                self.context.add_coaching_message(feedback)
            else:
                logger.debug("No pedagogy issues detected")
        except Exception as e:
            logger.error(f"Failed to get coaching feedback: {e}")

    def _format_messages_for_review(
        self,
        new_messages: list,
        context_messages: list | None = None,
    ) -> str:
        """Format messages into readable text for the coach LLM.

        Args:
            new_messages: Recent messages to analyze for issues
            context_messages: Earlier messages for topic/context understanding
        """
        lines = []

        # Add context messages first (if any)
        if context_messages:
            lines.append("=== CONTEXT (earlier in session) ===")
            lines.extend(self._format_message_list(context_messages))
            lines.append("")
            lines.append("=== RECENT EXCHANGE (analyze for issues) ===")

        # Add new messages
        lines.extend(self._format_message_list(new_messages))

        return "\n".join(lines)

    def _format_message_list(self, messages: list) -> list[str]:
        """Format a list of messages into readable lines."""
        lines = []

        for msg in messages:
            # Handle both dict-style messages and LLMMessage dataclass
            if isinstance(msg, dict):
                role = msg.get("role", "unknown")
                content = msg.get("content", "")
            else:
                # LLMMessage dataclass
                role = getattr(msg, "role", "unknown")
                content = getattr(msg, "content", "")

            if isinstance(content, str) and content:
                lines.append(f"{role.upper()}: {content}")

            # Handle tool calls from LLMMessage
            tool_calls = getattr(msg, "tool_calls", None) if not isinstance(msg, dict) else None
            if tool_calls:
                for tc in tool_calls:
                    if tc.name == "speak":
                        message = tc.arguments.get("message", "") if isinstance(tc.arguments, dict) else ""
                        message = self._strip_ssml(message)
                        lines.append(f"TUTOR SPEAKS: {message}")

            # Handle list content (for dict-style messages)
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        block_type = block.get("type", "")
                        if block_type == "text":
                            text = block.get("text", "")
                            if text:
                                lines.append(f"{role.upper()}: {text}")
                        elif block_type == "tool_use":
                            tool_name = block.get("name", "")
                            tool_input = block.get("input", {})
                            if tool_name == "speak":
                                message = tool_input.get("message", "")
                                message = self._strip_ssml(message)
                                lines.append(f"TUTOR SPEAKS: {message}")
                        elif block_type == "tool_result":
                            # Skip tool results in review
                            pass
                    elif hasattr(block, "type"):
                        if block.type == "tool_use" and block.name == "speak":
                            message = block.input.get("message", "") if isinstance(block.input, dict) else ""
                            message = self._strip_ssml(message)
                            lines.append(f"TUTOR SPEAKS: {message}")

        return lines

    def _strip_ssml(self, text: str) -> str:
        """Remove SSML tags from text for readability."""
        import re

        # Remove SSML tags like <speak>, <prosody>, <break>, etc.
        text = re.sub(r"<[^>]+>", "", text)
        # Clean up extra whitespace
        text = re.sub(r"\s+", " ", text).strip()
        return text

    async def _get_coaching_feedback(self, conversation: str) -> str | None:
        """Call the coach LLM to review the conversation."""
        try:
            client = _get_coach_client()
            response = await client.aio.models.generate_content(
                model=COACH_MODEL,
                contents=[
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=f"Review this recent tutoring exchange:\n\n{conversation}")],
                    )
                ],
                config=types.GenerateContentConfig(
                    system_instruction=COACH_SYSTEM_PROMPT,
                    temperature=0.4,
                    response_mime_type="application/json",
                ),
            )

            # Track cost in PostHog
            if response.usage_metadata:
                self._track_cost(response.usage_metadata)

            # Parse response
            if not response.candidates or not response.candidates[0].content.parts:
                return None

            response_text = response.candidates[0].content.parts[0].text

            # Try to parse as JSON
            try:
                result = json.loads(response_text)

                # Build coach notes from critique and ideas
                notes_parts = []

                # Add critique if present
                critique = result.get("critique")
                if critique:
                    notes_parts.append(f"[CRITIQUE] {critique}")

                # Add teaching ideas if present
                ideas = result.get("ideas")
                if ideas and ideas.get("topic"):
                    ideas_text = self._format_teaching_ideas(ideas)
                    if ideas_text:
                        notes_parts.append(ideas_text)

                feedback = " ".join(notes_parts) if notes_parts else None

                # Log the review to tracing
                self._log_review(conversation, response_text, feedback)

                return feedback
            except json.JSONDecodeError:
                logger.warning(f"Could not parse coach response: {response_text[:200]}")
                self._log_review(conversation, response_text, None, error="JSON parse failed")
                return None

        except Exception as e:
            logger.error(f"Coach LLM call failed: {e}")
            self._log_review(conversation, None, None, error=str(e))
            return None

    def _format_teaching_ideas(self, ideas: dict) -> str | None:
        """Format teaching ideas into notes for the tutor."""
        topic = ideas.get("topic")
        if not topic:
            return None

        lines = [f"[IDEAS for teaching {topic}]"]

        # Teaching approaches (options, not instructions)
        teaching_ideas = ideas.get("teaching_ideas", [])
        if teaching_ideas:
            if isinstance(teaching_ideas, list):
                lines.append(f"Approaches that work: {'; '.join(teaching_ideas[:2])}")
            else:
                lines.append(f"Approaches that work: {teaching_ideas}")

        # Key ideas for this concept
        key_ideas = ideas.get("key_ideas", [])
        if key_ideas:
            if isinstance(key_ideas, list):
                lines.append(f"Key ideas: {'; '.join(key_ideas[:3])}")
            else:
                lines.append(f"Key ideas: {key_ideas}")

        # Classic aha moments
        aha_moments = ideas.get("aha_moments", [])
        if aha_moments:
            if isinstance(aha_moments, list):
                lines.append(f"Classic aha moment: {aha_moments[0]}")
            else:
                lines.append(f"Classic aha moment: {aha_moments}")

        return " | ".join(lines) if len(lines) > 1 else None

    def _track_cost(self, usage) -> None:
        """Track LLM cost in PostHog."""
        try:
            input_tokens = usage.prompt_token_count or 0
            output_tokens = usage.candidates_token_count or 0

            # Get pricing from GeminiProvider
            pricing = GeminiProvider._get_pricing(COACH_MODEL)
            input_price = pricing.get("input", 0.50)
            output_price = pricing.get("output", 3.00)

            total_cost = ((input_tokens * input_price) + (output_tokens * output_price)) / 1_000_000

            account_phone = self.context.config.account_phone if self.context.config else None
            track_cost(
                total_cost,
                "pedagogy-coach",
                account_phone,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                provider="google",
                model=COACH_MODEL,
            )

            logger.debug(f"Pedagogy coach cost: ${total_cost:.6f} (input: {input_tokens}, output: {output_tokens})")
        except Exception as e:
            logger.warning(f"Failed to track pedagogy coach cost: {e}")

    def _log_review(
        self,
        conversation: str,
        response: str | None,
        feedback: str | None,
        error: str | None = None,
    ):
        """Log the pedagogy review to tracing."""
        if self.tracing_client is None:
            return

        try:
            output: dict[str, str | bool | None] = {"feedback": feedback} if feedback else {"issues_found": False}
            if error:
                output["error"] = error

            with self.tracing_client.text_span(
                "pedagogy_coach_review",
                input=conversation,
            ) as span:
                span.output(json.dumps(output))
        except Exception:
            logger.exception("Failed to log pedagogy review")
