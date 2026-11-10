from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING

from agent.llm import LLMStreamResult, StreamEventType, ToolCallBlock
from agent.state import AgentState, StateManager
from tracing import TracingClient

if TYPE_CHECKING:  # pragma: no cover - typing only
    from agent.context import Context
    from agent.voice import Voice, VoiceStreamSession

logger = logging.getLogger(__name__)


@dataclass
class StreamRunResult:
    thinking_blocks: Sequence[object]
    text_blocks: Sequence[object]
    tool_blocks: Sequence[ToolCallBlock]
    streamed_tool_results: dict[str, str]
    pending_tool_tasks: Sequence[asyncio.Task[tuple[str, str]]]


class SpeakStreamHandler:
    def __init__(
        self,
        voice: "Voice",
        state_manager: StateManager,
        tool_id: str,
        tracing_client: TracingClient | None = None,
        entity_id: int | None = None,
    ):
        self.voice = voice
        self.state_manager = state_manager
        self.tool_id = tool_id
        self.tracing_client = tracing_client
        self.entity_id = entity_id

        self._session: "VoiceStreamSession | None" = None
        self._buffer = ""
        self._latest_message = ""
        self._last_sent_length = 0
        self._finalized = False
        self._start_time = time.time()
        self._logged_message = False
        self._first_chunk_sent = False

    async def start(self):
        if self._session is not None:
            return

        print("⏱️ [0ms] Starting streaming TTS (speak)")
        self._session = await self.voice.start_stream_session()
        self.state_manager.transition_to(AgentState.SPEAKING)

    async def handle_delta(self, partial_json: str):
        if self._session is None:
            await self.start()

        self._buffer += partial_json
        try:
            data = json.loads(self._buffer)
        except json.JSONDecodeError:
            return

        message = data.get("message")
        if message is None:
            return

        self._latest_message = message

        # Log when we first receive message content
        if not self._logged_message:
            elapsed = int((time.time() - self._start_time) * 1000)
            snippet = message[:200]
            print(f"⏱️ [{elapsed}ms] Streaming speak message ready: '{snippet}...'")
            self._logged_message = True

        # Stream new content to TTS as it arrives
        if self._session and len(message) > self._last_sent_length:
            new_text = message[self._last_sent_length :]
            self._session.push_text(new_text)
            self._last_sent_length = len(message)

            if not self._first_chunk_sent:
                elapsed = int((time.time() - self._start_time) * 1000)
                print(f"⏱️ [{elapsed}ms] First text chunk sent to TTS")
                self._first_chunk_sent = True

            # Flush periodically to ensure low latency
            self._session.flush()

    async def finalize(self) -> tuple[str, str]:
        if self._finalized:
            return self.tool_id, "Spoke message to user."

        self._finalized = True

        if self._session is None:
            # No session was ever created; nothing to finish.
            return self.tool_id, "No audio was generated."

        # No need to send remaining text here - we've been streaming it incrementally
        # Just finish the session
        completed = await self._session.finish()

        # After speaking, stay in THINKING state so main loop continues
        if completed and self.state_manager.is_speaking():
            self.state_manager.transition_to(AgentState.THINKING)

        if completed:
            result = "Spoke message to user."
        else:
            preview = self._latest_message[:200] if self._latest_message else ""
            result = f"Started to say: '{preview}' but was interrupted by user."

        # Track agent speech
        if self.tracing_client is not None:
            with self.tracing_client.text_span(
                "agent_speech",
                input=self._latest_message,
                entity_id=self.entity_id,
            ) as span:
                span.output(f"completed={completed}, result={result}")

        return self.tool_id, result

    async def cancel(self):
        if self._finalized:
            return
        self._finalized = True
        if self._session is not None:
            await self._session.cancel()


class LLMStreamSession:
    def __init__(
        self,
        context: "Context",
        voice: "Voice",
        state_manager: StateManager,
        room=None,
        tracing_client: TracingClient | None = None,
        entity_id: int | None = None,
    ):
        self.context = context
        self.voice = voice
        self.state_manager = state_manager
        self.room = room
        self.tracing_client = tracing_client
        self.entity_id = entity_id
        self._streamed_tool_results: dict[str, str] = {}

    async def run(self) -> StreamRunResult:
        start_time = time.time()
        provider_name = self.context.provider.name
        print(f"⏱️ [0ms] Sending request to {provider_name.upper()} API")

        # Get stream, result future, and api kwargs from context
        event_stream, result_future, api_kwargs = await self.context.stream()

        # Use the exact API kwargs for tracing (this is what was sent to the LLM)
        llm_input = None
        llm_metadata = {}
        if self.tracing_client:
            # Store the exact kwargs as JSON string for tracing
            llm_input = json.dumps(api_kwargs, default=str)

            # Add metadata about the request
            llm_metadata = {
                "num_messages": len(api_kwargs.get("messages", [])),
                "entity_id": self.entity_id,
                "provider": provider_name,
            }

        speak_handlers: dict[int, SpeakStreamHandler] = {}
        finalize_tasks: list[asyncio.Task[tuple[str, str]]] = []
        first_token_logged = False

        async def _consume_stream() -> StreamRunResult:
            nonlocal first_token_logged

            event_count = 0
            async for event in event_stream:
                event_count += 1

                # Yield on every event to ensure audio playback tasks get CPU time
                await asyncio.sleep(0)

                if not first_token_logged and event.type in {
                    StreamEventType.MESSAGE_START,
                    StreamEventType.MESSAGE_DELTA,
                    StreamEventType.CONTENT_BLOCK_START,
                    StreamEventType.CONTENT_BLOCK_DELTA,
                }:
                    first_token_logged = True
                    ttft = int((time.time() - start_time) * 1000)
                    print(f"⏱️ [{ttft}ms] First token received (TTFT)")

                if event.type == StreamEventType.CONTENT_BLOCK_START:
                    if event.index is not None and event.block_type:
                        # Log all tool uses
                        if event.block_type == "tool_use":
                            tool_name = event.tool_name or ""
                            tool_id = event.block_id or ""
                            elapsed = int((time.time() - start_time) * 1000)
                            print(f"⏱️ [{elapsed}ms] Tool call started: {tool_name}")

                            # Only stream the 'speak' tool
                            if tool_name == "speak":
                                handler = SpeakStreamHandler(
                                    self.voice,
                                    self.state_manager,
                                    tool_id,
                                    self.tracing_client,
                                    self.entity_id,
                                )
                                await handler.start()
                                speak_handlers[event.index] = handler

                elif event.type == StreamEventType.CONTENT_BLOCK_DELTA:
                    if event.index is not None:
                        maybe_handler = speak_handlers.get(event.index)
                        if maybe_handler is not None and event.input_json_delta:
                            await maybe_handler.handle_delta(event.input_json_delta)

                elif event.type == StreamEventType.CONTENT_BLOCK_STOP:
                    if event.index is not None and event.index in speak_handlers:
                        handler = speak_handlers.pop(event.index)
                        finalize_tasks.append(asyncio.create_task(handler.finalize()))

            # Wait for the result future
            llm_result: LLMStreamResult = await result_future

            api_time = int((time.time() - start_time) * 1000)
            print(f"⏱️ [{api_time}ms] {provider_name.upper()} API response received (full stream)")

            # Process the final result
            thinking_blocks, text_blocks, tool_blocks = self.context.process_result(llm_result)

            if len(thinking_blocks) > 0 and self.tracing_client is not None:
                # Extract just the thinking text from each block
                thinking_texts = [block.thinking for block in thinking_blocks]
                thinking_content = " ".join(thinking_texts)

                with self.tracing_client.text_span(
                    "thinking",
                    input=thinking_content,
                    entity_id=self.entity_id,
                ) as span:
                    span.output("LLM thinking complete")

            return StreamRunResult(
                thinking_blocks=thinking_blocks,
                text_blocks=text_blocks,
                tool_blocks=tool_blocks,
                streamed_tool_results=self._streamed_tool_results,
                pending_tool_tasks=tuple(finalize_tasks),
            )

        try:
            # Wrap LLM call in a span if tracing is enabled
            if self.tracing_client:
                with self.tracing_client.llm_span(
                    f"{provider_name}_api_call",
                    input=llm_input,
                    metadata=llm_metadata,
                    entity_id=self.entity_id,
                ) as span:
                    result = await _consume_stream()
                    # Format output with token counts if available
                    output_summary = (
                        f"Completed: {len(result.text_blocks)} text blocks, {len(result.tool_blocks)} tool calls"
                    )
                    span.output(output_summary)
            else:
                result = await _consume_stream()
        except asyncio.CancelledError:
            print("🛑 LLM stream cancelled - cleaning up handlers")
            # Clean up any active speak handlers
            await asyncio.gather(
                *(handler.cancel() for handler in speak_handlers.values()),
                return_exceptions=True,
            )
            # Cancel any pending finalize tasks
            for task in finalize_tasks:
                task.cancel()
            if finalize_tasks:
                await asyncio.gather(*finalize_tasks, return_exceptions=True)
            # Re-raise so the main loop knows this was a cancellation
            raise

        # Ensure any handlers without stop events are cancelled
        if speak_handlers:
            await asyncio.gather(
                *(handler.cancel() for handler in speak_handlers.values()),
                return_exceptions=True,
            )

        return result
