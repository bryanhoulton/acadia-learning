from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Literal

from agent.llm import (
    LLMConfig,
    LLMMessage,
    LLMProvider,
    LLMStreamResult,
    LLMToolCall,
    LLMToolDefinition,
    LLMToolResult,
    ToolCallBlock,
    create_provider,
)
from agent.prompts import get_alt_prompt, get_system_prompt
from services.api_service import APIService
from utils.misc import AgentConfig, track_cost

if TYPE_CHECKING:
    from agent.playground import PlaygroundManager

logger = logging.getLogger(__name__)

# Marker prefix for summary messages so we don't re-summarize them
SUMMARY_MARKER = "[SESSION SUMMARY]"

# How long to keep messages before summarizing (in seconds)
SUMMARIZATION_WINDOW_SECONDS = 300  # 5 minutes

# How often to run background summarization (in seconds)
SUMMARIZATION_INTERVAL_SECONDS = 120  # 2 minutes


def _get_provider_from_model(model: str) -> str:
    """Derive the LLM provider from the model name."""
    if model.startswith("claude-"):
        return "anthropic"
    elif model.startswith("gemini-"):
        return "gemini"
    else:
        return "openai"


# Alt-tutor speak tool description — aligned with ElevenLabs Turbo v2.5 best practices.
# Used only when config.alt_tutor is True. See get_tools() for the swap logic.
ALT_SPEAK_DESCRIPTION = """
        Speak a message aloud to the student.

        Write naturally. Pacing comes from sentence structure, not markup.
        - One idea per sentence. Shorter sentences = better pacing.
        - Use <break time="1.5s" /> for deliberate pauses (up to 3s). Use sparingly — excessive breaks cause audio instability and artifacts.
        - Ellipses (...) for hesitation: "So... what do you think?"
        - Dashes (—) for quick pivots: "Wait — that's not right."

        Emphasis and delivery:
        - CAPS for stress on key words: "That's a REALLY good point"
        - Emotion comes from word choice, not markup. Write how you'd actually talk.
        - Questions rise naturally. Short exclamations get energy: "Nice!" vs "nice"

        Math and symbols — spell out for pronunciation:
        - 3x + 5 = 20 → "Three X plus five equals twenty"
        - x^2 → "X squared", 2/3 → "Two thirds"
        - √x → "Square root of X", |x| → "Absolute value of X"

        Keep it short. Mirror the student's response length. One or two sentences is often enough.
"""

# Tools - Provider agnostic format
TOOLS: list[LLMToolDefinition] = [
    LLMToolDefinition(
        name="speak",
        description="""
        Speak a message aloud to the user. Use this to communicate with the student.

        Write naturally with break tags for pauses:
        - Use <break time="300ms"/> for short pauses (up to 3s): "Okay <break time="400ms"/> what do you think?"
        - Use ellipses (...) for hesitation: "So... what do you think?"
        - Use dashes (— or --) for brief dramatic pauses: "Wait — what's that?"
        - One idea per sentence. Shorter sentences = better pacing.

        Emphasis and emotion:
        - Emotion comes through word choice and phrasing.
        - Questions naturally get rising intonation.
        - Exclamations get energy: "Nice!" vs "nice"

        Math pronunciation - spell it out:
        - 3x + 5 = 20 → "Three X plus five equals twenty"
        - x^2 → "X squared"
        - 2/3 → "Two thirds"
        - √x → "Square root of X"
        - |x| → "Absolute value of X"
        - π → "Pi"

        Before speaking, think about whether the student should visualize what you're about to say. If so, update the canvas.

        Speaking style:
        - Quick, to the point, and concise. Don't repeat yourself or congratulate too much.
        - Don't offer tons of information in a single response. Prioritize short responses that engage the student.
        - NEVER solve the problem for the student. Guide them through step by step.
        - Your responses can simply ask a leading question or make a short comment.
        - Your responses should be short and mirror the length of the student's response.
        - Be casual and conversational. Don't be too formal.
        """,
        input_schema={
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The message to speak to the user",
                }
            },
            "required": ["message"],
        },
    ),
    LLMToolDefinition(
        name="wait",
        description="""
        Waits for a duration. You must wait for at least 5 seconds. Use this when you have nothing else to do.

        When the user is doing a problem, wait for 10-30s.

        If the user is not responding, wait for longer and longer durations. We'll wake you up when they respond.
        """,
        input_schema={
            "type": "object",
            "properties": {
                "duration": {
                    "type": "number",
                    "description": "The duration to wait in seconds",
                }
            },
            "required": ["duration"],
        },
    ),
    LLMToolDefinition(
        name="check_time",
        description="""
        Checks the actual current time in the user's timezone. 
        
        IMPORTANT: Do NOT assume elapsed time based on lesson plans, schedules, or activity completion. 
        Plans may include time estimates (e.g., "warm-up: 3-4 minutes"), but these are estimates, not actual elapsed time. 
        Sessions may start late, activities may take longer or shorter than planned, and you cannot accurately track time 
        by counting activities. Always call check_time to verify the actual current time when you need to know how long 
        a session has been running or how much time remains.
        """,
        input_schema={
            "type": "object",
            "properties": {},
        },
    ),
    LLMToolDefinition(
        name="list_room_participants",
        description="""
        Lists the participants currently in the room (not including you). If this is empty, there
        is no one else in the room.
        """,
        input_schema={
            "type": "object",
            "properties": {},
        },
    ),
    LLMToolDefinition(
        name="set_playground",
        description="""
        Sets the playground content. The playground is the interactive area displayed to the user.
        
        All playground types use the same structure: {type, config, state}
        - config: Configuration options (permissions, display settings)
        - state: The actual content/data

        You must think about the student's visual perspective and journey when setting the playground. What
        information is disappearing? What information is new? You want to use these visual empathy skills to
        teach better.
        
        IMPORTANT: Before using this tool, call get_playground_guide with the type you want to use
        to get the full schema and examples.
        """,
        input_schema={
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "description": "The playground type: canvas, number-line, coordinate-plane, etc.",
                },
                "config": {
                    "type": "object",
                    "description": "Configuration object (permissions, display options)",
                },
                "state": {
                    "type": "object",
                    "description": "State object (for canvas: {blocks: [...]}, for number-line: {points: [], jumps: [], regions: []})",
                },
            },
            "required": ["type", "state"],
        },
    ),
    LLMToolDefinition(
        name="get_playground",
        description="""Gets the current playground state (type, config, and state).

Use this to check what the user has done in the playground. Since user interactions
(dragging, typing, selecting) update the state silently without interrupting you,
call this tool whenever you need to see the current state.

Note: You WILL be interrupted for significant events (e.g., race complete, drill finished),
but routine interactions happen silently in the background.""",
        input_schema={
            "type": "object",
            "properties": {},
        },
    ),
    LLMToolDefinition(
        name="get_playground_guide",
        description="""
        Gets the detailed guide for a specific playground type.
        
        Call this BEFORE using set_playground with an interactive playground type to understand:
        - What the playground is for (best use cases)
        - Config schema (how to configure it)
        - State schema (how to set initial state)
        - Example configurations with pedagogy notes
        - Common mistakes to avoid
        
        Example: get_playground_guide(type="number-line")
        """,
        input_schema={
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "description": "The playground type to get the guide for (e.g., 'number-line', 'coordinate-plane')",
                },
            },
            "required": ["type"],
        },
    ),
    # NOTE: playground_action is added dynamically based on current playground type
    # See get_tools() method in Context class
    LLMToolDefinition(
        name="leave_call",
        description="""
        Leaves the call. You should only use this if the user has asked you to leave or if
        they've been inactive for more than ~5 minutes. If they want to continue, you should
        continue.

        You should not leave unless your are SURE that you have completed a session of proper duration. You may use get_session_info to
        verify the session duration.
        """,
        input_schema={
            "type": "object",
            "properties": {
                "session_started_on_time": {
                    "type": "boolean",
                    "description": "Whether the session started on time.",
                },
                "filled_full_time": {
                    "type": "boolean",
                    "description": """Whether you have filled the full time of the session. If the session did not start on time,
                    did you fill the full INTENDED duration of the session? For example if you started 20m late but the parent requested
                    an hour, did you do an hour of tutoring?""",
                },
                "student_not_interested_in_continuing": {
                    "type": "boolean",
                    "description": "Whether the student is not interested in continuing the session beyond the current time. If they are interested in continuing, feel free to!",
                },
            },
        },
    ),
    LLMToolDefinition(
        name="list_documents",
        description="""
        Lists the documents in your document store. This is where previously prepared documents will be, like lesson plans,
        practice problems, and other artifacts that you want to keep track of or bring into lessons.
        """,
        input_schema={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "number",
                    "description": "The number of documents to return.",
                    "default": 3,
                },
                "offset": {
                    "type": "number",
                    "description": "The offset of the documents to return.",
                    "default": 0,
                },
            },
            "required": ["limit", "offset"],
        },
    ),
    LLMToolDefinition(
        name="view_document",
        description="""
        Views a document.
        """,
        input_schema={
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "description": "The ID of the document to view.",
                },
            },
            "required": ["document_id"],
        },
    ),
    LLMToolDefinition(
        name="get_session_info",
        description="""
        Gets information about the current session, including:
        - When the session started
        - When the user first provided input (chat or voice)
        - Time elapsed since session start
        - Time to first user input

        This is useful for tracking session timing, understanding how long the session has been running,
        and knowing when the user first engaged with the agent.
        """,
        input_schema={
            "type": "object",
            "properties": {},
        },
    ),
]


class Context:
    """Manages conversation context with LLM providers."""

    def __init__(self, config: AgentConfig):
        self.config = config
        self.api_service = APIService(config.entity_id, config.entity_api_key, config.user_profile_id)
        self.last_message_time = time.time()
        self._raw_messages: list[LLMMessage] = self._initial_messages()
        self.healed_tool_ids: set[str] = set()  # Track tools that were healed

        # Available playground types and schemas (updated by PlaygroundManager)
        self.available_playground_types: list[str] = []
        self.playground_schemas: dict[str, dict] = {}  # type -> {configSchema, stateSchema}

        # Reference to PlaygroundManager for dynamic tool descriptions
        self._playground_manager: PlaygroundManager | None = None

        # Session timing for summarization
        self.session_start_time = time.time()
        self._summarization_task: asyncio.Task | None = None
        self._summarization_lock = asyncio.Lock()
        # Summaries keyed by minute bucket - reconstructed into messages on demand
        self._minute_summaries: dict[int, LLMMessage] = {}

        # Create LLM provider based on config model (overrides env vars)
        model = config.session_model

        # Derive provider from model name
        provider_name = _get_provider_from_model(model)

        llm_config = LLMConfig(
            model=model,
            max_tokens=2048 * 8,
            timeout=60,
            thinking_budget=1024 if provider_name in ("anthropic", "gemini") else None,
        )
        self.provider: LLMProvider = create_provider(provider_name, llm_config)

    def _initial_messages(self) -> list[LLMMessage]:
        """Create initial context messages."""
        memory_context = self.config.entity_memory

        return [
            LLMMessage(
                role="user",
                content=f"""
                This is your memory context:
                {memory_context}
                
                The user just joined the call. All playgrounds have been cleared - the canvas is blank.
                
                You can use the 'speak' tool to talk to the user. Use <break time="Xms"/> tags for pauses.
                
                Use the 'check_time' tool if you need to know the current time.
                """,
            ),
        ]

    @property
    def messages(self) -> list[LLMMessage]:
        """
        Reconstruct messages from raw messages and summaries.
        For summarized minutes: use the summary message.
        For non-summarized minutes: use raw messages.
        """
        return self._build_messages()

    def _build_messages(self) -> list[LLMMessage]:
        """
        Build the message list by combining raw messages and summaries.

        For each minute bucket:
        - If summarized AND all messages are old: include only the summary message
        - Otherwise: include all raw messages from that bucket

        IMPORTANT: Handles cross-minute tool pairs. If a tool_use is in minute X
        and its tool_result is in minute Y, and one minute would use a summary
        while the other uses raw messages, we must use raw messages for both
        to avoid orphaned tool_use/tool_result blocks.

        Returns messages sorted by timestamp.
        """
        current_time = time.time()
        cutoff_time = current_time - SUMMARIZATION_WINDOW_SECONDS

        # Group raw messages by minute bucket
        messages_by_minute: dict[int, list[LLMMessage]] = {}
        for msg in self._raw_messages:
            minute_bucket = self._get_minute_bucket(msg.timestamp)
            if minute_bucket not in messages_by_minute:
                messages_by_minute[minute_bucket] = []
            messages_by_minute[minute_bucket].append(msg)

        # First pass: determine which minutes COULD use summaries
        minutes_could_use_summary: set[int] = set()
        for minute_bucket, bucket_messages in messages_by_minute.items():
            if minute_bucket in self._minute_summaries:
                all_old = all(msg.timestamp < cutoff_time for msg in bucket_messages)
                if all_old:
                    minutes_could_use_summary.add(minute_bucket)

        # Second pass: find cross-minute tool pairs and force raw messages if needed
        # Track which minutes have tool_uses and tool_results
        tool_use_minute: dict[str, int] = {}  # tool_id -> minute bucket
        tool_result_minute: dict[str, int] = {}  # tool_id -> minute bucket

        for minute_bucket, bucket_messages in messages_by_minute.items():
            for msg in bucket_messages:
                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        tool_use_minute[tc.id] = minute_bucket
                if msg.tool_results:
                    for tr in msg.tool_results:
                        tool_result_minute[tr.tool_call_id] = minute_bucket

        # Find minutes that MUST use raw messages due to cross-minute tool pairs
        # Only force raw messages when there's a mismatch between minutes:
        # - If both minutes can use summaries → allow summaries for both
        # - If neither can use summaries → raw for both (default behavior)
        # - If there's a mismatch → force both to use raw to preserve pairing
        minutes_must_use_raw: set[int] = set()
        for tool_id, use_minute in tool_use_minute.items():
            result_minute = tool_result_minute.get(tool_id)
            if result_minute is None:
                # Orphaned tool_use (no matching result), skip - handled elsewhere
                continue

            use_can_summary = use_minute in minutes_could_use_summary
            result_can_summary = result_minute in minutes_could_use_summary

            # Only force raw if there's a mismatch (one can summarize, one can't)
            if use_can_summary != result_can_summary:
                minutes_must_use_raw.add(use_minute)
                minutes_must_use_raw.add(result_minute)

        # Final pass: build result using summaries or raw messages
        result: list[LLMMessage] = []

        for minute_bucket in sorted(messages_by_minute.keys()):
            messages_in_bucket = messages_by_minute[minute_bucket]

            # Use summary if: could use summary AND not forced to use raw
            if minute_bucket in minutes_could_use_summary and minute_bucket not in minutes_must_use_raw:
                result.append(self._minute_summaries[minute_bucket])
            else:
                result.extend(messages_in_bucket)

        return result

    def add_user_message(self, content: str):
        """
        Add a user message to the context.
        Automatically heals any unclosed tool_use blocks first.
        """
        # Skip empty messages to avoid API errors
        if not content or not content.strip():
            logger.warning("Skipping empty user message")
            return

        # Heal any interrupted tools before adding user message
        self._heal_if_needed()

        self._raw_messages.append(
            LLMMessage(
                role="user",
                content=content,
            )
        )
        self.last_message_time = time.time()

    def add_coaching_message(self, feedback: str):
        """
        Add a coaching message from the pedagogy coach.
        This is injected as a system-level nudge to steer tutor behavior.
        """
        if not feedback or not feedback.strip():
            return

        # Heal any interrupted tools before adding
        self._heal_if_needed()

        coaching_content = (
            f"[INTERNAL COACHING - not from student]: {feedback} "
            "Do NOT mention this coaching to the student. Silently apply this feedback for the rest of the session."
        )

        self._raw_messages.append(
            LLMMessage(
                role="user",
                content=coaching_content,
            )
        )
        logger.info(f"Coaching message injected: {feedback[:100]}...")

    def add_user_message_with_image(
        self,
        text: str,
        image_base64: str,
        media_type: Literal["image/jpeg", "image/png", "image/gif", "image/webp"] = "image/jpeg",
    ):
        """
        Add a user message with an image to the context.
        Automatically heals any unclosed tool_use blocks first.

        Args:
            text: The text message to include with the image
            image_base64: Base64-encoded image data
            media_type: MIME type of the image (e.g., "image/jpeg", "image/png")
        """
        logger.info(
            f"Adding user message with image - text: '{text}', media_type: {media_type}, image_size: {len(image_base64)} chars"
        )

        # Heal any interrupted tools before adding user message
        self._heal_if_needed()

        self._raw_messages.append(
            LLMMessage(
                role="user",
                content=text,
                images=[{"data": image_base64, "media_type": media_type}],
            )
        )
        logger.info(f"Image message added to context. Total messages: {len(self._raw_messages)}")

        self.last_message_time = time.time()

    def add_tool_results(self, tool_results: list[tuple[str, str]]):
        """
        Add tool execution results to context.

        Args:
            tool_results: List of (tool_use_id, result_content) tuples
        """
        # Build a set of tool_result IDs that already exist in history
        existing_tool_results: set[str] = set()
        for msg in self._raw_messages:
            if msg.tool_results:
                for tr in msg.tool_results:
                    existing_tool_results.add(tr.tool_call_id)

        # Filter out any tools that were already healed (interrupted) or already have results
        valid_results: list[LLMToolResult] = []
        for tool_id, content in tool_results:
            if tool_id in self.healed_tool_ids:
                print(f"Skipping tool result for {tool_id} (already healed)")
                self.healed_tool_ids.remove(tool_id)  # Clean up
                continue

            if tool_id in existing_tool_results:
                logger.warning(f"Skipping duplicate tool result for {tool_id} (already exists in history)")
                continue

            # Ensure content is not empty (API requirement)
            if not content or not content.strip():
                logger.warning(f"Tool {tool_id} returned empty content, using placeholder")
                content = "Tool completed with no output."

            valid_results.append(LLMToolResult(tool_call_id=tool_id, content=content))

        # Only add message if there are valid results
        if valid_results:
            self._raw_messages.append(
                LLMMessage(
                    role="user",
                    content="",  # Content is in tool_results
                    tool_results=valid_results,
                )
            )
            self.last_message_time = time.time()

    def _heal_if_needed(self):
        """
        Internal method to heal context before adding user messages.
        Finds any tool_use blocks that don't have corresponding tool_result blocks
        and adds "Interrupted" results for them.
        """
        if not self._raw_messages:
            return

        # Scan backwards to find the most recent assistant message with tool_use blocks
        tool_use_ids = set()
        tool_result_ids = set()
        found_assistant = False

        # Look at recent messages (going backwards from the end)
        for i in range(len(self._raw_messages) - 1, -1, -1):
            msg = self._raw_messages[i]

            if msg.role == "assistant" and not found_assistant:
                # Extract tool_use IDs from the most recent assistant message
                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        tool_use_ids.add(tc.id)
                found_assistant = True

            elif msg.role == "user" and found_assistant:
                # We've found user messages that come AFTER the assistant message
                # (remember we're going backwards), so these are BEFORE in time
                # This means we went too far back
                break

            elif msg.role == "user" and not found_assistant:
                # Extract tool_result IDs from user messages after the assistant
                if msg.tool_results:
                    for tr in msg.tool_results:
                        tool_result_ids.add(tr.tool_call_id)

        # Find unclosed tools
        unclosed_tool_ids = tool_use_ids - tool_result_ids

        # Add healing results for unclosed tools
        if unclosed_tool_ids:
            print(f"🩹 Context healing: {len(unclosed_tool_ids)} unclosed tool(s)")
            tool_results = [
                LLMToolResult(tool_call_id=tool_id, content="Interrupted by user.") for tool_id in unclosed_tool_ids
            ]
            # Track these tool IDs as healed
            self.healed_tool_ids.update(unclosed_tool_ids)

            self._raw_messages.append(
                LLMMessage(
                    role="user",
                    content="",
                    tool_results=tool_results,
                )
            )

    def heal(self):
        """
        Emergency healing - fix any tool_use/tool_result mismatches in the entire message history.
        This is critical for preventing API errors after summarization or interrupts.
        """
        healed_count = self._repair_tool_pairing()

        # Also remove trailing assistant messages without user responses
        while self._raw_messages and self._raw_messages[-1].role == "assistant":
            self._raw_messages.pop()
            healed_count += 1

        if healed_count > 0:
            print(f"Context healed ({healed_count} repairs)")
        else:
            print("Context healed (no repairs needed)")

    def _repair_tool_pairing(self) -> int:
        """
        Scan entire message history and repair any tool_use/tool_result mismatches.

        Returns:
            Number of repairs made.
        """
        repairs_made = 0

        # First pass: collect all tool_use IDs and their positions
        # Also track ALL tool_result occurrences to find duplicates
        tool_use_positions: dict[str, int] = {}  # tool_id -> message index
        tool_result_positions: dict[str, int] = {}  # tool_id -> first message index
        tool_result_all_positions: dict[
            str, list[tuple[int, int]]
        ] = {}  # tool_id -> [(msg_idx, result_idx_in_msg), ...]

        for i, msg in enumerate(self._raw_messages):
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    tool_use_positions[tc.id] = i
            if msg.tool_results:
                for j, tr in enumerate(msg.tool_results):
                    if tr.tool_call_id not in tool_result_positions:
                        tool_result_positions[tr.tool_call_id] = i
                    # Track all occurrences for duplicate detection
                    if tr.tool_call_id not in tool_result_all_positions:
                        tool_result_all_positions[tr.tool_call_id] = []
                    tool_result_all_positions[tr.tool_call_id].append((i, j))

        # Find duplicate tool_results (same tool_call_id appears more than once)
        duplicate_tool_results: dict[str, list[tuple[int, int]]] = {}
        for tool_id, positions in tool_result_all_positions.items():
            if len(positions) > 1:
                duplicate_tool_results[tool_id] = positions
                logger.warning(f"Found duplicate tool_results for {tool_id}: {positions}")

        # Remove duplicate tool_results (keep only the first one)
        if duplicate_tool_results:
            # Build a set of (msg_idx, result_idx) to remove
            results_to_remove: set[tuple[int, int]] = set()
            for tool_id, positions in duplicate_tool_results.items():
                # Keep the first, remove the rest
                for pos in positions[1:]:
                    results_to_remove.add(pos)

            # Process messages in reverse order to avoid index shifting
            # Group by message index
            removals_by_msg: dict[int, list[int]] = {}
            for msg_idx, result_idx in results_to_remove:
                if msg_idx not in removals_by_msg:
                    removals_by_msg[msg_idx] = []
                removals_by_msg[msg_idx].append(result_idx)

            for msg_idx in sorted(removals_by_msg.keys(), reverse=True):
                msg = self._raw_messages[msg_idx]
                if msg.tool_results:
                    # Remove in reverse order within the message
                    indices_to_remove = sorted(removals_by_msg[msg_idx], reverse=True)
                    for result_idx in indices_to_remove:
                        if result_idx < len(msg.tool_results):
                            removed = msg.tool_results.pop(result_idx)
                            repairs_made += 1
                            logger.info(
                                f"🩹 Removed duplicate tool_result {removed.tool_call_id} from message {msg_idx}"
                            )

        # Find orphaned tool_use blocks (no matching tool_result)
        orphaned_tool_uses = set(tool_use_positions.keys()) - set(tool_result_positions.keys())

        # Find orphaned tool_results (no matching tool_use) - these should be removed
        orphaned_tool_results = set(tool_result_positions.keys()) - set(tool_use_positions.keys())

        # Group orphaned tool_uses by message index to add results efficiently
        orphaned_by_msg: dict[int, list[str]] = {}
        for tool_id in orphaned_tool_uses:
            msg_idx = tool_use_positions[tool_id]
            if msg_idx not in orphaned_by_msg:
                orphaned_by_msg[msg_idx] = []
            orphaned_by_msg[msg_idx].append(tool_id)

        # Insert healing tool_result messages for orphaned tool_uses
        # We need to insert them right after the assistant message that used the tool
        # Process in reverse order to avoid index shifting issues
        insertions: list[tuple[int, LLMMessage]] = []
        for msg_idx, tool_ids in sorted(orphaned_by_msg.items(), reverse=True):
            # Create a healing message with tool results
            healing_results = [
                LLMToolResult(tool_call_id=tool_id, content="[Interrupted - result not available]")
                for tool_id in tool_ids
            ]
            healing_message = LLMMessage(
                role="user",
                content="",
                tool_results=healing_results,
            )
            # Insert right after the assistant message
            insert_at = msg_idx + 1
            insertions.append((insert_at, healing_message))
            repairs_made += len(tool_ids)
            logger.info(f"🩹 Adding healing results for {len(tool_ids)} orphaned tool(s) after message {msg_idx}")

        # Apply insertions (already in reverse order)
        for insert_at, healing_message in insertions:
            if insert_at > len(self._raw_messages):
                insert_at = len(self._raw_messages)
            self._raw_messages.insert(insert_at, healing_message)

        # Remove orphaned tool_results from messages
        if orphaned_tool_results:
            for i, msg in enumerate(self._raw_messages):
                if msg.tool_results:
                    original_count = len(msg.tool_results)
                    msg.tool_results = [tr for tr in msg.tool_results if tr.tool_call_id not in orphaned_tool_results]
                    removed = original_count - len(msg.tool_results)
                    if removed > 0:
                        repairs_made += removed
                        logger.info(f"🩹 Removed {removed} orphaned tool_result(s) from message {i}")

        # Also check for tool_result not immediately after tool_use (API requirement)
        # This is harder to fix - for now just log a warning
        for tool_id in tool_use_positions:
            if tool_id in tool_result_positions:
                use_idx = tool_use_positions[tool_id]
                result_idx = tool_result_positions[tool_id]
                if result_idx != use_idx + 1:
                    logger.warning(
                        f"Tool {tool_id}: tool_use at msg {use_idx}, tool_result at msg {result_idx} "
                        f"(expected {use_idx + 1})"
                    )

        return repairs_made

    def validate_messages(self) -> list[str]:
        """
        Validate message history for API compliance.
        Returns list of issues found (empty if valid).
        """
        issues = []

        # Collect all tool_use and tool_result positions
        # Track all occurrences to detect duplicates
        tool_use_positions: dict[str, int] = {}
        tool_result_positions: dict[str, int] = {}
        tool_result_counts: dict[str, int] = {}  # Count occurrences

        for i, msg in enumerate(self._raw_messages):
            if msg.tool_calls:
                for tc in msg.tool_calls:
                    tool_use_positions[tc.id] = i
            if msg.tool_results:
                for tr in msg.tool_results:
                    if tr.tool_call_id not in tool_result_positions:
                        tool_result_positions[tr.tool_call_id] = i
                    # Count all occurrences
                    tool_result_counts[tr.tool_call_id] = tool_result_counts.get(tr.tool_call_id, 0) + 1

        # Check for duplicate tool_results (CRITICAL - causes API errors)
        duplicates = {tid: count for tid, count in tool_result_counts.items() if count > 1}
        if duplicates:
            issues.append(f"Duplicate tool_result blocks: {duplicates}")

        # Check for orphaned tool_uses
        orphaned_uses = set(tool_use_positions.keys()) - set(tool_result_positions.keys())
        if orphaned_uses:
            issues.append(f"Orphaned tool_use blocks: {orphaned_uses}")

        # Check for orphaned tool_results
        orphaned_results = set(tool_result_positions.keys()) - set(tool_use_positions.keys())
        if orphaned_results:
            issues.append(f"Orphaned tool_result blocks: {orphaned_results}")

        # Check for non-adjacent pairs
        for tool_id in tool_use_positions:
            if tool_id in tool_result_positions:
                use_idx = tool_use_positions[tool_id]
                result_idx = tool_result_positions[tool_id]
                if result_idx != use_idx + 1:
                    issues.append(f"Tool {tool_id}: result at {result_idx}, expected {use_idx + 1}")

        return issues

    # ==================== Background Summarization ====================

    def start_background_summarization(self):
        """Start the background summarization task. Call this when the session starts."""
        if self._summarization_task is None or self._summarization_task.done():
            self._summarization_task = asyncio.create_task(self._run_summarization_loop())
            logger.info("Started background summarization task")

    def stop_background_summarization(self):
        """Stop the background summarization task. Call this when the session ends."""
        if self._summarization_task is not None and not self._summarization_task.done():
            self._summarization_task.cancel()
            logger.info("Stopped background summarization task")

    async def _run_summarization_loop(self):
        """Background loop that runs summarization every minute."""
        try:
            while True:
                await asyncio.sleep(SUMMARIZATION_INTERVAL_SECONDS)
                try:
                    await self._summarize_old_messages()
                except Exception as e:
                    logger.error(f"Error in background summarization: {e}", exc_info=True)
        except asyncio.CancelledError:
            logger.info("Summarization loop cancelled")
            raise

    async def _summarize_old_messages(self):
        """
        Summarize messages older than SUMMARIZATION_WINDOW_SECONDS, grouped by minute.

        Generates summaries and stores them in _minute_summaries. The _build_messages()
        method handles reconstructing the message list with summaries replacing old messages.

        Raw messages are never mutated - summaries are stored separately and merged on demand.
        """
        async with self._summarization_lock:
            current_time = time.time()
            cutoff_time = current_time - SUMMARIZATION_WINDOW_SECONDS
            session_elapsed = current_time - self.session_start_time

            # Don't summarize if session is less than SUMMARIZATION_WINDOW_SECONDS old
            if session_elapsed < SUMMARIZATION_WINDOW_SECONDS:
                return

            # Group raw messages by minute bucket
            messages_by_minute: dict[int, list[LLMMessage]] = {}
            for msg in self._raw_messages:
                minute_bucket = self._get_minute_bucket(msg.timestamp)
                if minute_bucket not in messages_by_minute:
                    messages_by_minute[minute_bucket] = []
                messages_by_minute[minute_bucket].append(msg)

            # Find minute buckets that need summarization:
            # - All messages in the bucket are older than cutoff
            # - No summary exists yet for this bucket
            minutes_to_summarize: list[int] = []
            for minute_bucket, bucket_messages in messages_by_minute.items():
                # Skip if already summarized
                if minute_bucket in self._minute_summaries:
                    continue

                # Only summarize if ALL messages in the bucket are old enough
                all_old = all(msg.timestamp < cutoff_time for msg in bucket_messages)
                if all_old:
                    minutes_to_summarize.append(minute_bucket)

            if not minutes_to_summarize:
                return

            total_messages = sum(len(messages_by_minute[m]) for m in minutes_to_summarize)
            logger.info(f"📝 Summarizing {len(minutes_to_summarize)} minute(s) ({total_messages} messages)")

            # Generate summaries for each minute bucket
            for minute_bucket in sorted(minutes_to_summarize):
                bucket_messages = messages_by_minute[minute_bucket]

                # Generate summary for this minute
                summary_text = await self._generate_minute_summary(minute_bucket, bucket_messages)

                if summary_text:
                    # Create and store the summary message
                    # Use the timestamp of the first message in the group
                    summary_timestamp = min(msg.timestamp for msg in bucket_messages)
                    summary_message = LLMMessage(
                        role="assistant",
                        content=f"{SUMMARY_MARKER} Minute {minute_bucket + 1}: {summary_text}",
                        timestamp=summary_timestamp,
                    )

                    # Store the summary - _build_messages() will use it during reconstruction
                    self._minute_summaries[minute_bucket] = summary_message
                    logger.info(f"✅ Summarized minute {minute_bucket + 1} ({len(bucket_messages)} messages)")

    async def _generate_minute_summary(self, minute_bucket: int, messages: list[LLMMessage]) -> str | None:
        """
        Generate a summary for a minute's worth of messages using the LLM provider.

        Args:
            minute_bucket: The minute number (0-indexed) since session start
            messages: The messages to summarize

        Returns:
            The summary text, or None if summarization failed
        """
        if not messages:
            return None

        # Format messages for summarization
        formatted_parts = []
        for msg in messages:
            role = msg.role.upper()
            content = msg.content if isinstance(msg.content, str) else str(msg.content)

            # Include tool calls if present
            if msg.tool_calls:
                tool_names = [tc.name for tc in msg.tool_calls]
                content += f" [Tool calls: {', '.join(tool_names)}]"

            # Include tool results if present
            if msg.tool_results:
                content += f" [Tool results: {len(msg.tool_results)} result(s)]"

            if content.strip():
                formatted_parts.append(f"{role}: {content.strip()}")

        if not formatted_parts:
            return None

        messages_text = "\n".join(formatted_parts)

        # Create summarization prompt
        summary_prompt = f"""Summarize this minute of tutoring session conversation in 1-2 concise sentences. 
Focus on: what was discussed, any progress made, key student responses.
Write in first person (e.g., "Student worked on...", "I explained...").

You should keep details that are relevant to the session - what specific content was covered, student responses and engagement trends, etc.

When in doubt, keep details in the summary. We are just trying to compress the amount of characters a lot without losing much meaning.

You may ignore internal coaching messages and validation errors.

Conversation:
{messages_text}

Summary:"""

        try:
            # Use a simple non-streaming call for summarization
            # We'll create a minimal message for summarization
            summary_messages = [LLMMessage(role="user", content=summary_prompt)]

            # Use the provider's stream_complete but just get the result
            event_stream, result_future, _ = await self.provider.stream_complete(
                messages=summary_messages,
                system_prompt="You are a helpful assistant that creates concise summaries.",
                tools=[],  # No tools for summarization
            )

            # Consume the stream to get the result
            async for _ in event_stream:
                pass

            result = await result_future

            # Extract text from result
            if result.text_blocks:
                summary = " ".join(tb.text for tb in result.text_blocks).strip()
                return summary

            return None

        except Exception as e:
            logger.error(f"Failed to generate summary for minute {minute_bucket}: {e}")
            return None

    def _get_minute_bucket(self, timestamp: float) -> int:
        """Get the minute bucket (0-indexed) for a timestamp."""
        elapsed = timestamp - self.session_start_time
        return int(elapsed // 60)

    def _is_summary_message(self, msg: LLMMessage) -> bool:
        """Check if a message is a summary message."""
        if isinstance(msg.content, str):
            return msg.content.startswith(SUMMARY_MARKER)
        return False

    # ==================== End Background Summarization ====================

    def _sanitize_messages(self) -> list[LLMMessage]:
        """
        Pre-flight message preparation: Clean messages to ensure API compliance.
        - Repairs tool_use/tool_result mismatches (self-healing)
        - Removes empty content blocks
        Returns a sanitized copy of messages ready for API.
        """
        # CRITICAL: Repair any tool pairing issues before making API calls
        # This is the last line of defense against summarization-induced breakage
        validation_issues = self.validate_messages()
        if validation_issues:
            logger.warning(f"Pre-flight validation found issues: {validation_issues}")
            repairs = self._repair_tool_pairing()
            if repairs > 0:
                logger.info(f"Pre-flight self-healing made {repairs} repairs")
                # Re-validate to confirm fixes
                remaining_issues = self.validate_messages()
                if remaining_issues:
                    logger.error(f"Issues remain after repair: {remaining_issues}")

        sanitized: list[LLMMessage] = []

        for msg in self.messages:
            content = msg.content

            # Handle string content
            if isinstance(content, str):
                if content and content.strip():
                    sanitized.append(msg)
                elif msg.tool_results or msg.images or msg.tool_calls or msg.thinking_blocks:
                    # Keep messages with tool results, images, tool calls, or thinking blocks even if text is empty
                    sanitized.append(msg)
                else:
                    logger.warning(f"Filtering out {msg.role} message with empty string content")

            elif isinstance(content, list):
                # Handle structured content
                sanitized.append(msg)

            else:
                # Unknown content type, keep it
                sanitized.append(msg)

        return sanitized

    def get_system_prompt(self) -> str:
        """Get the system prompt for this context. Uses alt-tutor prompt when config.alt_tutor else default."""
        if self.config.alt_tutor:
            return get_alt_prompt(self.config.tutor_name)
        return get_system_prompt(self.config.tutor_name, self.config.registration_source)

    def set_available_playground_types(
        self,
        types: list[str],
        schemas: dict[str, dict] | None = None,
        playground_manager: PlaygroundManager | None = None,
    ):
        """Update the available playground types and their schemas.

        Args:
            types: List of available playground type IDs
            schemas: Dict mapping type ID to {configSchema, stateSchema}
            playground_manager: Reference to PlaygroundManager for dynamic tool descriptions
        """
        self.available_playground_types = types if types else []
        self.playground_schemas = schemas if schemas else {}
        if playground_manager is not None:
            self._playground_manager = playground_manager

    def _build_playground_schema(self) -> dict:
        """Build a JSON schema for set_playground with proper typing per playground type."""
        types_str = ", ".join(self.available_playground_types)

        # Build description with schema info for each type
        schema_descriptions = []
        for pg_type in self.available_playground_types:
            schema = self.playground_schemas.get(pg_type)
            if schema:
                config_props = list(schema.get("configSchema", {}).get("properties", {}).keys())
                state_props = list(schema.get("stateSchema", {}).get("properties", {}).keys())
                schema_descriptions.append(f"- {pg_type}: config has {config_props}, state has {state_props}")

        state_desc = "State object. "
        if schema_descriptions:
            state_desc += "Schema per type:\n" + "\n".join(schema_descriptions)

        return {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": self.available_playground_types,
                    "description": f"The playground type. Available: {types_str}",
                },
                "config": {
                    "type": "object",
                    "description": "Configuration object (permissions, display options)",
                },
                "state": {
                    "type": "object",
                    "description": state_desc,
                },
            },
            "required": ["type", "state"],
        }

    def get_tools(self) -> list[LLMToolDefinition]:
        """Get the tools available to the LLM with dynamic playground types."""
        tools = []

        for tool in TOOLS:
            if tool.name == "speak" and self.config.alt_tutor:
                # Use improved speak description for alt-tutor sessions
                tools.append(
                    LLMToolDefinition(
                        name="speak",
                        description=ALT_SPEAK_DESCRIPTION,
                        input_schema=tool.input_schema,
                    )
                )
            elif tool.name == "set_playground":
                # Update set_playground with available types, schemas, AND selection guidance
                if self._playground_manager:
                    description = self._playground_manager.get_set_playground_description()
                else:
                    logger.warning("No playground manager found, using fallback description")
                    # Fallback if no playground manager
                    types_str = ", ".join(self.available_playground_types)
                    description = f"""
        Sets the playground content. The playground is the interactive area displayed to the user.
        
        Available playground types: {types_str}
        
        All playground types use the same structure: {{type, config, state}}
        - config: Configuration options (permissions, display settings)
        - state: The actual content/data
        
        IMPORTANT: Before using this tool, call get_playground_guide with the type you want to use
        to get the full schema and examples.
        """

                updated_tool = LLMToolDefinition(
                    name=tool.name,
                    description=description,
                    input_schema=self._build_playground_schema(),
                )
                tools.append(updated_tool)
            else:
                tools.append(tool)

        # Dynamically add playground_action if current playground supports actions
        if self._playground_manager and self._playground_manager.has_active_playground_with_actions():
            action_description = self._playground_manager.get_playground_action_description()
            if action_description:
                playground_action_tool = LLMToolDefinition(
                    name="playground_action",
                    description=action_description,
                    input_schema={
                        "type": "object",
                        "properties": {
                            "actions": {
                                "type": "array",
                                "description": "List of actions to trigger simultaneously",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "action": {
                                            "type": "string",
                                            "description": "The action name",
                                        },
                                        "params": {
                                            "type": "object",
                                            "description": "Parameters for the action",
                                        },
                                    },
                                    "required": ["action", "params"],
                                },
                                "minItems": 1,
                            },
                        },
                        "required": ["actions"],
                    },
                )
                tools.append(playground_action_tool)

        return tools

    async def stream(self):
        """Return a streaming session for the next LLM response.

        Returns:
            Tuple of (event_stream, result_future, api_kwargs) where api_kwargs
            contains the exact arguments passed to the LLM API.
        """
        clean_messages = self._sanitize_messages()
        system_prompt = self.get_system_prompt()
        tools = self.get_tools()

        return await self.provider.stream_complete(
            messages=clean_messages,
            system_prompt=system_prompt,
            tools=tools,
        )

    def process_result(self, result: LLMStreamResult) -> tuple[list, list, list[ToolCallBlock]]:
        """
        Update context with the final result and return parsed blocks.

        Returns:
            Tuple of (thinking_blocks, text_blocks, tool_blocks)
        """
        # Calculate and track cost (including cache tokens if available)
        if result.input_tokens and result.output_tokens:
            cache_read = result.cache_read_tokens or 0
            cache_write = result.cache_creation_tokens or 0
            uncached_input = result.input_tokens
            total_input = cache_read + cache_write + uncached_input

            # Calculate cache hit rate
            cache_hit_pct = (cache_read / total_input * 100) if total_input > 0 else 0

            # Log cache performance
            if cache_read > 0 or cache_write > 0:
                print(
                    f"💾 Cache: {cache_read:,} read, {cache_write:,} write, {uncached_input:,} uncached ({cache_hit_pct:.1f}% hit rate)"
                )

            cost = self.provider.calculate_cost(
                input_tokens=uncached_input,
                output_tokens=result.output_tokens,
                cache_creation_tokens=cache_write,
                cache_read_tokens=cache_read,
            )
            track_cost(
                cost,
                "live-session",
                self.config.account_phone,
                # Token breakdown
                input_tokens=uncached_input,
                output_tokens=result.output_tokens,
                cache_read_tokens=cache_read,
                cache_write_tokens=cache_write,
                total_input_tokens=total_input,
                cache_hit_rate=round(cache_hit_pct, 1),
                # Provider info
                provider=self.provider.name,
                model=self.provider.config.model,
            )

        thinking_blocks = result.thinking_blocks
        text_blocks = result.text_blocks
        tool_blocks = result.tool_calls

        # Build assistant message for context
        if tool_blocks or text_blocks or thinking_blocks:
            # Create tool calls for the message (include thought_signature for Gemini 3)
            tool_calls = [
                LLMToolCall(
                    id=tc.id,
                    name=tc.name,
                    arguments=tc.input,
                    thought_signature=tc.thought_signature,
                )
                for tc in tool_blocks
            ]

            # Get text content
            text_content = " ".join(tb.text for tb in text_blocks) if text_blocks else ""

            message = LLMMessage(
                role="assistant",
                content=text_content,
                tool_calls=tool_calls if tool_calls else None,
                thinking_blocks=thinking_blocks if thinking_blocks else None,
            )
            self._raw_messages.append(message)

            # Sync to API (convert to dict format for API)
            self._sync_to_api(message)

        return (thinking_blocks, text_blocks, tool_blocks)

    def _sync_to_api(self, message: LLMMessage):
        """Sync a message to the API."""
        # Convert to API format
        serializable_content = []

        if message.content and isinstance(message.content, str) and message.content.strip():
            serializable_content.append({"type": "text", "text": message.content})

        if message.tool_calls:
            for tc in message.tool_calls:
                serializable_content.append(
                    {
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments,
                    }
                )

        if serializable_content:
            api_message = {
                "role": "assistant",
                "content": serializable_content,
            }
            self.api_service.sync_context(entity_id=self.config.entity_id, new_messages=[api_message])

    def sync(self, new_messages: list[dict]):
        """Sync context to API."""
        self.api_service.sync_context(entity_id=self.config.entity_id, new_messages=new_messages)
