import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from livekit.rtc import Room

from agent.chat import Chat
from agent.context import Context
from agent.engagement_coach import EngagementCoach
from agent.llm import ToolCallBlock
from agent.pedagogy_coach import PedagogyCoach
from agent.playground import PlaygroundEvent, PlaygroundManager, PlaygroundState
from agent.state import AgentState, StateManager
from agent.streaming import LLMStreamSession
from agent.voice import Voice
from services.api_service import APIService
from tracing import TracingClient
from utils.misc import AgentConfig, ChatMessage
from utils.session_info import get_session_info
from utils.time import force_timezone

logger = logging.getLogger(__name__)


class Agent:
    def __init__(
        self,
        room: Room,
        voice: Voice,
        config: AgentConfig,
    ):
        self.config = config
        self.room = room
        self.voice = voice
        self.api_service = APIService(config.entity_id, config.entity_api_key, config.user_profile_id)
        self.tracing = TracingClient(entity_api_key=config.entity_api_key)
        self._conversation_span = None  # Will be started in run()
        self.context = Context(config)
        self.playground = PlaygroundManager(config, room, self.api_service, tracing_client=self.tracing)
        self.chat = Chat(config, room, self.api_service, tracing_client=self.tracing)
        self.pedagogy_coach = PedagogyCoach(self.context, entity_id=config.entity_id, tracing_client=self.tracing)
        self.engagement_coach = EngagementCoach(self.context, entity_id=config.entity_id, tracing_client=self.tracing)

        # State management
        self.state_manager = StateManager(room, AgentState.CONNECTING)
        self._llm_task: asyncio.Task | None = None  # Track LLM request for cancellation

        # Lifecycle
        self._active_tasks: set[asyncio.Task] = set()
        self._leave_flag = False
        self._has_cleaned_up = False
        self._interrupt_flag = False  # Signal to abort tool execution
        self._shadow_present = False  # Track if a shadow participant is present

        # Room events
        self.room.on("participant_disconnected", self._on_participant_disconnected)
        self.room.on("participant_connected", self._on_participant_connected)

        # Register text stream handlers
        self.room.register_text_stream_handler("photo", self.handle_photo_stream)
        self.room.register_text_stream_handler("coaching", self.handle_coaching_stream)

        print("✅ Agent initialized - text stream handlers registered")
        logger.info("Agent initialized - text stream handlers registered")

        # Chat and playground callbacks
        self.chat.register("chat", self.on_chat_message)
        self.playground.register("playground", self.on_playground_change)
        self.playground.register_event_callback("playground_events", self.on_playground_event)

    def _inject_playground_context(self, playground_type: str):
        """
        Inject playground-specific context when switching to a new playground.

        This helps the LLM understand how to use the current playground effectively
        by providing the guide and available actions.
        """
        guide = self.playground.get_guide(playground_type)
        if not guide:
            return

        # Build concise context for the active playground
        context_parts = [
            f"[Active Playground: {guide.name} ({playground_type})]",
            f"Interaction Model: {guide.interactionModel}",
        ]

        # Include available actions if any
        if guide.actions:
            action_names = list(guide.actions.keys())
            context_parts.append(f"Available Actions: {', '.join(action_names)}")

        # Include key tips
        if guide.whenToUse:
            context_parts.append(f"Best used for: {guide.whenToUse[0]}")

        context_text = "\n".join(context_parts)
        self.context.add_coaching_message(context_text)
        logger.info(f"Injected playground context for: {playground_type}")

    def on_interim_transcript(self, transcript: str):
        """
        Called when Deepgram provides an interim (partial) transcript.
        Sends it to the frontend for real-time display.
        """
        asyncio.create_task(self._send_transcript_to_frontend(transcript, is_final=False))

    def on_speech_start(self):
        """
        Called when VAD detects speech START (before transcription).

        This transitions to LISTENING state which blocks all agent activity
        until speech ends (on_user_speech or on_speech_cancelled).
        """
        print("👂 User started speaking")

        # Transition to LISTENING - this blocks the main loop
        self.state_manager.transition_to(AgentState.LISTENING)

        # Cancel any ongoing activity (TTS, LLM request, wait tasks)
        self._interrupt()

        print("👂 Now in LISTENING state - blocked until speech ends")

    def on_speech_cancelled(self):
        """
        Called when VAD determines speech ended but no transcript was produced
        (e.g., noise or too-short utterance).

        Exits LISTENING state back to THINKING so the main loop can continue.
        No transcript is added since none was produced.
        """
        print("📝 Speech cancelled (no transcript produced)")
        if self.state_manager.is_listening():
            self.state_manager.transition_to(AgentState.THINKING)
            print("📝 Exited LISTENING → THINKING (no new context added)")

    def on_user_speech(self, transcript: str, audio_data: bytes | None = None):
        """
        Called when VAD has transcribed complete user speech.

        This exits LISTENING state by:
        1. Adding transcript to context
        2. Transitioning to THINKING (unblocks main loop to make new LLM request)

        Args:
            transcript: The transcribed text
            audio_data: Optional WAV audio bytes of the user's speech
        """
        print(
            f"📝 User speech complete: '{transcript[:100]}...'"
            if len(transcript) > 100
            else f"📝 User speech complete: '{transcript}'"
        )

        # Send final (committed) transcript to frontend for display
        asyncio.create_task(self._send_transcript_to_frontend(transcript, is_final=True))

        # Record first user input
        session_info = get_session_info()
        session_info.record_first_input("voice")

        # Add transcript to context (context will handle healing any interrupted tools)
        self.context.add_user_message(transcript)
        print(f"📝 Transcript added to context. Total messages: {len(self.context.messages)}")

        # Log user speech with audio if available
        if audio_data:
            duration_ms = None
            # Calculate duration from WAV data (44 byte header + 16-bit samples at 16kHz)
            if len(audio_data) > 44:
                audio_bytes = len(audio_data) - 44  # Subtract WAV header
                duration_ms = int((audio_bytes / 2) / 16000 * 1000)  # 2 bytes per sample, 16kHz

            with self.tracing.audio_span(
                "user_speech",
                audio_data=audio_data,
                duration_ms=duration_ms,
                audio_format="wav",
                entity_id=self.config.entity_id,
            ) as span:
                span.output(transcript)
        else:
            # Fallback to text span if no audio
            with self.tracing.text_span("user_speech", input=transcript, entity_id=self.config.entity_id) as span:
                span.output("Transcript received")

        # Transition to THINKING - this unblocks the main loop to make a new LLM request
        # The new request will have the transcript in context
        self.state_manager.transition_to(AgentState.THINKING)
        print("📝 Exited LISTENING → THINKING. Main loop will now make new LLM request with transcript.")

    async def _send_transcript_to_frontend(self, transcript: str, is_final: bool = False):
        """Send the user's transcript to the frontend for display.

        Args:
            transcript: The transcribed text
            is_final: Whether this is a final (committed) transcript from Deepgram EndOfTurn
        """
        try:
            payload = json.dumps({"transcript": transcript, "is_final": is_final})
            await self.room.local_participant.send_text(payload, topic="transcript")
        except Exception as e:
            logger.warning(f"Failed to send transcript to frontend: {e}")

    def _interrupt(self):
        """
        Interrupt agent's current activity (TTS and LLM request).
        Used by chat messages, photos, and participant disconnect.
        For speech interruption, use on_speech_start() instead.
        """
        # Set interrupt flag to abort tool execution loop
        self._interrupt_flag = True

        # Stop TTS playback
        self.voice.interrupt()

        # Cancel ongoing LLM request
        if self._llm_task and not self._llm_task.done():
            print("🛑 Cancelling ongoing LLM request")
            self._llm_task.cancel()
            self._llm_task = None

        # Cancel any waiting/sleeping tasks
        self._cancel_active_tasks()

    def _cancel_active_tasks(self):
        """Cancel all active async tasks."""
        if self._active_tasks:
            print(f"Cancelling {len(self._active_tasks)} active tasks")
            for task in self._active_tasks:
                task.cancel()
            self._active_tasks.clear()

    async def _handle_tool(self, tool: ToolCallBlock) -> str:
        """Execute a tool and return the result."""
        if tool.name == "speak":
            import time

            t0 = time.time()
            message = tool.input.get("message", "")
            print(f"⏱️ [0ms] Starting TTS: '{message[:500]}...'")

            self.state_manager.transition_to(AgentState.SPEAKING)

            # Speak and check if it was interrupted
            tts_start = time.time()
            _speak_task = asyncio.create_task(self.voice.speak(message))
            try:
                completed = await _speak_task
            except asyncio.CancelledError:
                completed = False
            print(f"⏱️ [{int((time.time() - tts_start) * 1000)}ms] TTS {'completed' if completed else 'interrupted'}")

            if self.state_manager.is_speaking():
                self.state_manager.transition_to(AgentState.THINKING)

            print(f"⏱️ [{int((time.time() - t0) * 1000)}ms] speak() total")

            if completed:
                result = "Spoke message to user."
            else:
                # Speech was interrupted mid-sentence
                result = f"Started to say: '{message}' but was interrupted by user."

            return result

        elif tool.name == "wait":
            if self.chat.has_unread_messages():
                return "You have unread messages. Please check the chat."

            duration = tool.input.get("duration", 5)
            duration = max(5, float(duration))  # Ensure at least 5 seconds
            print(f"⏱️ Waiting for {duration} seconds...")

            self.state_manager.transition_to(AgentState.WAITING)

            try:
                # Create a task that we can track and cancel
                wait_task = asyncio.create_task(asyncio.sleep(duration))
                self._active_tasks.add(wait_task)

                await wait_task

                # If we get here, wait completed without interruption
                self._active_tasks.discard(wait_task)

                # Return to waiting state after waiting
                if self.state_manager.is_waiting():
                    self.state_manager.transition_to(AgentState.THINKING)

                return f"Waited for {duration} seconds."
            except asyncio.CancelledError:
                # Wait was interrupted
                self._active_tasks.discard(wait_task)
                return "Wait was interrupted by user."

        elif tool.name == "check_time":
            now = force_timezone(datetime.now(timezone.utc), self.config.timezone)
            return json.dumps(now.isoformat())

        elif tool.name == "list_room_participants":
            # Filter out shadow participants (admin observers)
            participants = [p.identity for p in self._get_non_shadow_participants()]
            if len(participants) == 0:
                return "No one else is in the room. You are alone and should leave the call."
            return json.dumps(participants)

        elif tool.name == "check_everything":
            now = force_timezone(datetime.now(timezone.utc), self.config.timezone)
            # Filter out shadow participants (admin observers)
            participants = [p.identity for p in self._get_non_shadow_participants()]

            if len(participants) == 0:
                participants_str = "No one else is in the room. You are alone and should leave the call."
            else:
                participants_str = "\n".join(participants)

            return f"""
            Current time:
            {now.isoformat()}

            The playground state is:
            {self.playground.get()}

            The chat messages are:
            {self.chat}

            The room participants are:
            {participants_str}

            The recent documents are:
            {self.api_service.list_documents(10, 0)}
            """

        elif tool.name == "set_playground":
            result = await self.playground.set(tool.input)

            # On success, inject guide context for the new playground type
            if "updated" in result.lower():
                playground_type = tool.input.get("type")
                if playground_type:
                    self._inject_playground_context(playground_type)

            return result

        elif tool.name == "get_playground":
            return self.playground.get()

        elif tool.name == "playground_action":
            actions = tool.input.get("actions", [])
            return await self.playground.action(actions)

        elif tool.name == "get_playground_guide":
            playground_type = tool.input.get("type", "")
            return self.playground.get_guide_for_tool(playground_type)

        elif tool.name == "leave_call":
            self._leave_flag = True
            return "Leaving call."

        elif tool.name == "check_chat":
            return str(self.chat)

        elif tool.name == "send_chat":
            if self.chat.has_unread_messages():
                return "You have unread messages. Please check the chat first."
            message = tool.input.get("message", "")
            await self.chat.send(message)
            return "Message sent to chat."

        elif tool.name == "list_documents":
            limit = tool.input.get("limit", 10)
            offset = tool.input.get("offset", 0)
            return json.dumps(
                self.api_service.list_documents(
                    limit,
                    offset,
                )
            )

        elif tool.name == "view_document":
            document_id = tool.input.get("document_id", "")
            if not document_id:
                return "No document ID provided."
            return json.dumps(self.api_service.view_document(document_id))

        elif tool.name == "get_session_info":
            session_info = get_session_info()
            return json.dumps(session_info.get_info_dict())

        else:
            logger.warning(f"Unknown tool: {tool.name}")
            return f"Unknown tool: {tool.name}"

    async def run(self):
        """Main agent loop."""
        print(f"Agent starting for entity {self.config.entity_id}")

        # Start session trace for this conversation
        self.tracing.start_session(
            entity_id=self.config.entity_id,
            room_name=self.room.name,
            metadata={"user": self.config.user_name},
        )

        # Transition to connecting state
        self.state_manager.transition_to(AgentState.CONNECTING)

        # Notify API
        self.api_service.update_call_state(
            entity_id=self.config.entity_id,
            on_call=True,
        )

        # Now ready - start thinking to proactively greet user or continue conversation
        self.state_manager.transition_to(AgentState.THINKING)

        # Start background tasks
        self.pedagogy_coach.start()
        self.engagement_coach.start()
        self.context.start_background_summarization()

        while not self._leave_flag:
            try:
                import time

                # Block while in LISTENING state (user is speaking)
                # Only proceed when in THINKING state (ready to make LLM request)
                while not self.state_manager.is_thinking() and not self._leave_flag:
                    await asyncio.sleep(0.1)

                if self._leave_flag:
                    break

                # Reset interrupt flag at start of each LLM cycle
                self._interrupt_flag = False

                # Create LLM streaming session so it can be cancelled if interrupted
                llm_start = time.time()
                print("⏱️ [0ms] Starting LLM request")
                stream_session = LLMStreamSession(
                    self.context, self.voice, self.state_manager, self.room, self.tracing, self.config.entity_id
                )
                self._llm_task = asyncio.create_task(stream_session.run())

                # Get next response from LLM
                resp = await self._llm_task
                print(f"⏱️ [{int((time.time() - llm_start) * 1000)}ms] LLM response received")
                self._llm_task = None

                if resp is None:
                    self.state_manager.transition_to(AgentState.THINKING)
                    continue

                _thinking_blocks, text_blocks, tool_blocks = (
                    resp.thinking_blocks,
                    resp.text_blocks,
                    resp.tool_blocks,
                )
                streamed_tool_results = resp.streamed_tool_results
                pending_tool_tasks = list(resp.pending_tool_tasks)

                # If no tool_use blocks, add error message and continue
                # This prevents orphaned thinking blocks in context
                if not tool_blocks:
                    text_content = " ".join(b.text for b in text_blocks) if text_blocks else ""
                    logger.warning(
                        f"LLM returned no tool_use blocks. Text was: '{text_content[:200]}...'"
                        if len(text_content) > 200
                        else f"LLM returned no tool_use blocks. Text was: '{text_content}'"
                    )
                    self.context.add_user_message(
                        "You must use a tool to take action. Use 'speak' to talk to the user, "
                        "'wait' to pause, or another available tool. Returning only text without "
                        "a tool call has no effect."
                    )
                    self.state_manager.transition_to(AgentState.THINKING)
                    continue

                # Execute tools
                if tool_blocks:
                    # Sort tools: speak and wait should come last, with wait being absolutely last
                    def tool_priority(tool: ToolCallBlock) -> int:
                        if tool.name == "wait":
                            return 2  # Always last
                        elif tool.name == "speak":
                            return 1  # Second to last
                        else:
                            return 0  # Everything else comes first

                    tool_blocks = sorted(tool_blocks, key=tool_priority)

                    tools_start = time.time()
                    tool_results_map: dict[str, str] = {}
                    speak_start_times: dict[str, float] = {}

                    # First, execute non-speak, non-wait tools (they don't change state)
                    for tool in tool_blocks:
                        if tool.name in ("speak", "wait"):
                            if tool.name == "speak":
                                speak_start_times.setdefault(tool.id, time.time())
                            # Skip speak and wait - speak is streamed, wait must come after speak finishes
                            continue

                        tool_start = time.time()
                        if tool.id in streamed_tool_results:
                            result = streamed_tool_results[tool.id]
                        else:
                            result = await self._handle_tool(tool)

                        # Broadcast tool call to frontend
                        await self.room.local_participant.send_text(
                            json.dumps({"name": tool.name, "input": tool.input}),
                            topic="tool-calls",
                        )

                        # Log tool execution
                        with self.tracing.tool_span(
                            tool.name,
                            input=json.dumps(tool.input) if tool.input else None,
                        ) as span:
                            span.output(result)

                        print(f"⏱️ [{int((time.time() - tool_start) * 1000)}ms] Tool '{tool.name}' executed")
                        tool_results_map[tool.id] = result

                    # Build a map of speak tool_id -> tool input for tracing
                    speak_tool_inputs: dict[str, dict] = {t.id: t.input for t in tool_blocks if t.name == "speak"}

                    # Wait for speak to finish BEFORE executing wait tool
                    # This ensures we stay in SPEAKING state until audio completes
                    speak_task_results: list[tuple[str, str]] = []
                    if pending_tool_tasks:
                        try:
                            pending_task_outputs = await asyncio.gather(
                                *pending_tool_tasks,
                                return_exceptions=True,
                            )
                            for tool_task_output in pending_task_outputs:
                                if isinstance(tool_task_output, Exception):
                                    logger.warning(
                                        "Speak tool finalize failed: %s",
                                        tool_task_output,
                                    )
                                    continue

                                tool_id, result_text = tool_task_output  # type: ignore
                                streamed_tool_results[tool_id] = result_text
                                speak_task_results.append((tool_id, result_text))
                                elapsed = int((time.time() - speak_start_times.get(tool_id, time.time())) * 1000)
                                print(f"⏱️ [{elapsed}ms] Tool 'speak' executed")

                                # Log speak tool execution
                                tool_input = speak_tool_inputs.get(tool_id, {})
                                with self.tracing.tool_span(
                                    "speak",
                                    input=json.dumps(tool_input) if tool_input else None,
                                ) as span:
                                    span.output(result_text)
                        finally:
                            # Ensure cancelled tasks are awaited to avoid warnings
                            for task in pending_tool_tasks:
                                if task.cancelled():
                                    try:
                                        await task
                                    except Exception:  # noqa: BLE001
                                        pass

                    for tool_id, result_text in speak_task_results:
                        tool_results_map[tool_id] = result_text

                    # Check if we were interrupted (e.g., by chat message) - skip remaining tools
                    if self._interrupt_flag:
                        print("🛑 Interrupt detected - skipping remaining tools")
                        # Heal context since we have incomplete tool results
                        self.context.heal()
                        continue

                    # Now execute wait tools (after speak has finished so we don't interrupt SPEAKING state)
                    for tool in tool_blocks:
                        if tool.name == "wait":
                            # Check for interrupt before executing wait
                            if self._interrupt_flag:
                                print("🛑 Interrupt detected - skipping wait tool")
                                break
                            tool_start = time.time()
                            result = await self._handle_tool(tool)
                            with self.tracing.tool_span(
                                tool.name,
                                input=json.dumps(tool.input) if tool.input else None,
                            ) as span:
                                span.output(result)
                            print(f"⏱️ [{int((time.time() - tool_start) * 1000)}ms] Tool '{tool.name}' executed")
                            tool_results_map[tool.id] = result

                    # Check again after wait tools - if interrupted, bail out
                    if self._interrupt_flag:
                        print("🛑 Interrupt detected - skipping context update")
                        self.context.heal()
                        continue

                    tool_results: list[tuple[str, str]] = []
                    for tool in tool_blocks:
                        if tool.id in tool_results_map:
                            tool_results.append((tool.id, tool_results_map[tool.id]))
                        elif tool.name == "speak":
                            if tool.id in streamed_tool_results:
                                tool_results.append((tool.id, streamed_tool_results[tool.id]))
                            else:
                                tool_results.append((tool.id, "Speech did not complete."))
                        else:
                            logger.warning("Tool '%s' did not produce a result", tool.name)

                    # Add tool results to context (context handles deduplication)
                    self.context.add_tool_results(tool_results)
                    print(f"⏱️ [{int((time.time() - tools_start) * 1000)}ms] All tools completed")

            except asyncio.CancelledError:
                print("🛑 LLM request cancelled - waiting for LISTENING state to end")
                self._llm_task = None
                # State is LISTENING (set by on_speech_start)
                # Loop will block at the top until on_user_speech transitions to THINKING
                continue
            except Exception as e:
                print(f"Unexpected error: {e}")
                self.context.heal()
                await asyncio.sleep(5)
                self.state_manager.transition_to(AgentState.THINKING)
                continue

        self.cleanup()

    async def on_chat_message(self, message: ChatMessage):
        """Handle incoming chat messages from users."""
        print(f"💬 Chat message from {message.sender}: {message.message}")

        # Record first user input
        session_info = get_session_info()
        session_info.record_first_input("chat")

        # Cancel any ongoing activity
        self._interrupt()

        # Mark the chat as read since we've consumed it
        self.chat.last_read_time = time.time()

        chat_context = (
            f"The user sent a chat message while you were speaking. Message from {message.sender}: {message.message}"
        )
        self.context.add_user_message(chat_context)
        self.state_manager.transition_to(AgentState.THINKING)

    async def on_playground_change(self, data: PlaygroundState | dict):
        """Handle playground state changes or guides loaded.

        Note: State changes do NOT interrupt the agent. They just update state silently.
        For events that should interrupt (e.g., race complete), use on_playground_event.
        """
        # Handle guides_loaded event
        if isinstance(data, dict) and data.get("event") == "guides_loaded":
            available_types = data.get("available_types", [])
            schemas = data.get("schemas", {})
            if available_types:
                logger.info(f"Setting available playground types: {available_types}")
                logger.info(f"Setting playground schemas for: {list(schemas.keys())}")
                # Pass the playground manager reference so context can use its methods
                # for dynamic tool descriptions (selection guidance is now in set_playground description)
                self.context.set_available_playground_types(available_types, schemas, self.playground)
            return

        # Handle playground state change from user interaction
        playground = data
        if not isinstance(playground, PlaygroundState):
            logger.warning(f"Unexpected playground event data: {type(data)}")
            return

        # Log user-initiated playground updates for trace replay
        self.playground._log_playground_update(
            playground.model_dump(),
            {"result": "user_update"},
        )

    async def on_playground_event(self, event):
        """Handle playground events that should interrupt the agent.

        Events like "race_complete", "drill_finished", etc. interrupt the agent
        and add context about what happened.
        """
        if not isinstance(event, PlaygroundEvent):
            logger.warning(f"Unexpected playground event type: {type(event)}")
            return

        logger.info(f"Playground event: {event.type}")

        # Log playground event as a span for trace replay
        event_data = event.model_dump()
        try:
            with self.tracing.text_span(
                "playground_event",
                input=json.dumps(event_data),
            ) as span:
                span.output(json.dumps({"event_type": event.type}))
        except Exception:
            logger.debug("Failed to log playground event span", exc_info=True)

        # Cancel any ongoing activity
        self._interrupt()

        # Build context message from the event
        event_data = event.model_dump()
        event_type = event_data.pop("type")
        if event_data:
            # Include additional event data
            context = f"Playground event: {event_type}. Details: {event_data}"
        else:
            context = f"Playground event: {event_type}"

        self.context.add_user_message(context)
        self.state_manager.transition_to(AgentState.THINKING)

    def handle_voice_change(self, reader, participant_identity: str):
        """Handle incoming voice change messages from users."""
        asyncio.create_task(self._handle_voice_change(reader, participant_identity))

    async def _handle_voice_change(self, reader, participant_identity: str):
        """Process voice change message."""
        from livekit.rtc import TextStreamReader

        if not isinstance(reader, TextStreamReader):
            return

        voice_id = await reader.read_all()
        print(f"Voice change request from {participant_identity}: {voice_id}")
        self.voice.change_voice(voice_id)

        with self.tracing.text_span("voice_changed", input=voice_id) as span:
            span.output("Voice changed")

    def _is_shadow_participant(self, participant) -> bool:
        """Check if a participant is a shadow observer (admin listening in)."""
        # Check by identity prefix
        if participant.identity.startswith("shadow_"):
            return True
        # Check by metadata
        try:
            metadata = json.loads(participant.metadata or "{}")
            return metadata.get("shadow", False)
        except (json.JSONDecodeError, TypeError):
            return False

    def _get_non_shadow_participants(self) -> list:
        """Get list of participants excluding shadow observers."""
        return [p for p in self.room.remote_participants.values() if not self._is_shadow_participant(p)]

    def handle_coaching_stream(self, reader, participant_identity: str):
        """Entry point for coaching text stream handler from shadow participants."""
        print(f"🎯 Coaching stream received from {participant_identity}")
        logger.info(f"Coaching stream received from {participant_identity}")
        asyncio.create_task(self._handle_coaching_stream(reader, participant_identity))

    async def _handle_coaching_stream(self, reader, participant_identity: str):
        """Process coaching message from shadow participant."""
        try:
            # Only accept coaching from shadow participants
            if not participant_identity.startswith("shadow_"):
                print(f"⚠️ Ignoring coaching from non-shadow participant: {participant_identity}")
                return

            coaching_message = await reader.read_all()
            print(f"🎯 Coaching message from {participant_identity}: {coaching_message[:100]}...")
            logger.info(f"Coaching message from {participant_identity}: {coaching_message[:100]}...")

            # Inject the coaching message into the context
            self.context.add_coaching_message(coaching_message)

            # Interrupt current activity to process the coaching
            self._interrupt()

            # Transition to thinking state to process the coaching message
            self.state_manager.transition_to(AgentState.THINKING)
            print("🎯 Coaching injected - transitioning to THINKING to process")

        except Exception as e:
            print(f"❌ Error handling coaching stream: {e}")
            logger.error(f"Error handling coaching stream: {e}", exc_info=True)

    def _on_participant_connected(self, participant):
        """Handle when a participant joins the room."""
        # Check if this is a shadow participant (human coach)
        if self._is_shadow_participant(participant):
            print(f"👁️ Human coach {participant.identity} joined (invisible to tutor)")
            logger.info(f"Human coach {participant.identity} joined room")
            logger.info(f"Human coach metadata: {participant.metadata}")
            self._shadow_present = True
            # Stop auto-coaches when human coach is present
            self.pedagogy_coach.stop()
            self.engagement_coach.stop()
            print("🛑 Auto-coaching disabled - human coach present")
            logger.info("Auto-coaching disabled - human coach present")
            # Log to tracing
            with self.tracing.text_span("human_coach_joined", input=participant.identity) as span:
                span.output("Human coach joined, auto-coaching disabled")
            return  # Don't announce human coach to the tutor

        print(f"Participant {participant.identity} joined room")
        self.chat.add(
            message=f"[SYSTEM]: Participant {participant.identity} joined room",
            sender="System",
        )
        self._cancel_active_tasks()

    def handle_photo_stream(self, reader, participant_identity: str):
        """Entry point for photo text stream handler."""
        print(f"📸 Photo stream received from {participant_identity}")
        logger.info(f"Photo stream received from {participant_identity}")
        asyncio.create_task(self._handle_photo_stream(reader, participant_identity))

    async def _handle_photo_stream(self, reader, participant_identity: str):
        """Process photo text stream received from a participant."""
        print("=== 📸 Starting photo stream processing ===")
        logger.info("=== Starting photo stream processing ===")
        try:
            print(f"📸 Photo from participant: {participant_identity}")
            logger.info(f"Photo from participant: {participant_identity}")

            # Read the entire text stream
            json_str = await reader.read_all()

            print(f"✅ Successfully read text stream (length: {len(json_str)})")
            logger.info(f"Successfully read text stream (length: {len(json_str)})")

            # Parse JSON
            try:
                payload = json.loads(json_str)
                print(f"✅ Successfully parsed JSON payload with keys: {list(payload.keys())}")
                logger.info(f"Successfully parsed JSON payload with keys: {list(payload.keys())}")
            except Exception as json_error:
                print(f"❌ Failed to parse JSON: {json_error}")
                print(f"JSON string preview (first 500 chars): {json_str[:500]}")
                logger.error(f"Failed to parse JSON: {json_error}")
                logger.error(f"JSON string preview (first 500 chars): {json_str[:500]}")
                raise

            # Extract photo information
            base64_data = payload.get("data", "")
            timestamp = payload.get("timestamp", 0)

            print(f"📊 Extracted base64 data length: {len(base64_data)} chars")
            print(f"⏰ Timestamp: {timestamp}")
            logger.info(f"Extracted base64 data length: {len(base64_data)} chars")
            logger.info(f"Timestamp: {timestamp}")

            if not base64_data:
                print("⚠️  Received photo with no image data in payload")
                logger.warning("Received photo with no image data in payload")
                return

            # Log base64 header to detect format
            base64_preview = base64_data[:50] if len(base64_data) > 50 else base64_data
            print(f"🔍 Base64 data preview (first 50 chars): {base64_preview}")
            logger.info(f"Base64 data preview (first 50 chars): {base64_preview}")

            print(f"📸 Photo received from {participant_identity} at {timestamp} (size: {len(base64_data)} chars)")
            logger.info(f"Received photo from {participant_identity} at {timestamp}")

            # Add photo to context so Claude can analyze it
            print("💾 Adding photo to context with image...")
            logger.info("Adding photo to context with image...")
            try:
                self.context.add_user_message_with_image(
                    text="The user just sent you a photo.",
                    image_base64=base64_data,
                    media_type="image/jpeg",
                )
                print("✅ Successfully added photo to context")
                logger.info("✅ Successfully added photo to context")
            except Exception as context_error:
                print(f"❌ Failed to add photo to context: {context_error}")
                logger.error(f"Failed to add photo to context: {context_error}")
                raise

            # Interrupt current activity to process the photo
            self._interrupt()

            # Transition to thinking state to process the photo
            self.state_manager.transition_to(AgentState.THINKING)

            print("=== ✅ Photo processing completed successfully ===")
            logger.info("=== Photo processing completed successfully ===")

        except Exception as e:
            print(f"❌ Error handling photo data: {e}")
            logger.error(f"❌ Error handling photo data: {e}", exc_info=True)

    def _on_participant_disconnected(self, participant):
        """Handle participant leaving. If all users have left, force the tutor to leave."""
        # Check if this is a human coach (shadow participant)
        if self._is_shadow_participant(participant):
            print(f"👁️ Human coach {participant.identity} left")
            logger.info(f"Human coach {participant.identity} disconnected")
            # Check if any other human coaches remain (exclude the one that just disconnected)
            shadow_count = sum(
                1
                for p in self.room.remote_participants.values()
                if self._is_shadow_participant(p) and p.identity != participant.identity
            )
            if shadow_count == 0:
                self._shadow_present = False
                # Restart auto-coaches when no human coaches present
                self.pedagogy_coach.start()
                self.engagement_coach.start()
                print("✅ Auto-coaching re-enabled - no human coaches present")
                logger.info("Auto-coaching re-enabled - no human coaches present")
                with self.tracing.text_span("human_coach_left", input=participant.identity) as span:
                    span.output("Human coach left, auto-coaching re-enabled")
            return  # Don't announce human coach leaving to the tutor

        print(f"Participant {participant.identity} disconnected")
        self.chat.add(
            f"[SYSTEM]: Participant {participant.identity} disconnected from room",
            sender="System",
        )

        # Check if there are any remote participants left (excluding shadows)
        non_shadow_participants = self._get_non_shadow_participants()
        remaining_participants = len(non_shadow_participants)
        print(f"Remaining non-shadow participants in room: {remaining_participants}")

        # If no real users are left, force the tutor to leave
        if remaining_participants == 0:
            print("No users remaining in room. Forcing tutor to leave.")
            self._interrupt()
            self._leave_flag = True

    def cleanup(self):
        """Cleanup resources."""
        if self._has_cleaned_up:
            return

        print("Cleaning up agent")
        self._has_cleaned_up = True

        # Stop background tasks
        self.pedagogy_coach.stop()
        self.engagement_coach.stop()
        self.context.stop_background_summarization()

        # End session trace
        self.tracing.end_session()

        self.api_service.update_call_state(
            entity_id=self.config.entity_id,
            on_call=False,
        )
