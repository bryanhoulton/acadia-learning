"""OpenAI LLM provider implementation."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionChunk

from agent.llm.base import (
    LLMConfig,
    LLMMessage,
    LLMProvider,
    LLMStreamEvent,
    LLMStreamResult,
    LLMToolDefinition,
    StreamEventType,
    TextBlock,
    ThinkingBlock,
    ToolCallBlock,
)

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """OpenAI GPT provider."""

    # Pricing per 1M tokens by model
    MODEL_PRICING = {
        # GPT-5.2 series
        "gpt-5.2": {"input": 1.75, "output": 14.00, "cache_read": 0.175},
        # GPT-4.1 series
        "gpt-4.1": {"input": 3.00, "output": 12.00, "cache_read": 0.30},
        "gpt-4.1-mini": {"input": 0.80, "output": 3.20, "cache_read": 0.08},
        "gpt-4.1-nano": {"input": 0.20, "output": 0.80, "cache_read": 0.02},
        # GPT-4o series
        "gpt-4o": {"input": 2.50, "output": 10.00, "cache_read": 0.25},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60, "cache_read": 0.015},
        # o-series reasoning models
        "o1": {"input": 15.00, "output": 60.00, "cache_read": 1.50},
        "o1-mini": {"input": 3.00, "output": 12.00, "cache_read": 0.30},
        "o3-mini": {"input": 1.10, "output": 4.40, "cache_read": 0.11},
    }
    # Default pricing (GPT-4.1-mini as a reasonable default)
    DEFAULT_PRICING = {"input": 0.80, "output": 3.20, "cache_read": 0.08}

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        self.client = AsyncOpenAI(timeout=config.timeout, max_retries=10)

        # Get pricing for this model (check exact match first, then prefix match)
        self._pricing = self._get_pricing(config.model)

        # Track tool calls being built during streaming
        self._current_tool_calls: dict[int, dict[str, Any]] = {}
        self._current_text: str = ""
        self._current_reasoning: str = ""

    def _get_pricing(self, model: str) -> dict[str, float]:
        """Get pricing for a model, supporting exact and prefix matching."""
        # Exact match
        if model in self.MODEL_PRICING:
            return self.MODEL_PRICING[model]
        # Prefix match (e.g., "gpt-4o-2024-11-20" matches "gpt-4o")
        for key in self.MODEL_PRICING:
            if model.startswith(key):
                return self.MODEL_PRICING[key]
        return self.DEFAULT_PRICING

    @property
    def name(self) -> str:
        return "openai"

    def convert_tools(self, tools: list[LLMToolDefinition]) -> list[dict[str, Any]]:
        """Convert to OpenAI tool format."""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                },
            }
            for tool in tools
        ]

    def convert_messages(self, messages: list[LLMMessage]) -> list[dict[str, Any]]:
        """Convert provider-agnostic messages to OpenAI format."""
        result: list[dict[str, Any]] = []

        for msg in messages:
            if msg.role == "system":
                result.append({"role": "system", "content": msg.content if isinstance(msg.content, str) else ""})
                continue

            if msg.tool_results:
                # Tool results in OpenAI format
                for tr in msg.tool_results:
                    result.append(
                        {
                            "role": "tool",
                            "tool_call_id": tr.tool_call_id,
                            "content": tr.content,
                        }
                    )

            elif msg.images:
                # Message with images (vision)
                content: list[dict[str, Any]] = []
                for img in msg.images:
                    media_type = img.get("media_type", "image/jpeg")
                    data = img["data"]
                    content.append(
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{media_type};base64,{data}"},
                        }
                    )

                if isinstance(msg.content, str) and msg.content:
                    content.append({"type": "text", "text": msg.content})

                result.append({"role": msg.role, "content": content})

            elif msg.role == "assistant" and msg.tool_calls:
                # Assistant message with tool calls
                tool_calls = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": json.dumps(tc.arguments),
                        },
                    }
                    for tc in msg.tool_calls
                ]

                assistant_msg: dict[str, Any] = {
                    "role": "assistant",
                    "tool_calls": tool_calls,
                }
                if isinstance(msg.content, str) and msg.content:
                    assistant_msg["content"] = msg.content

                result.append(assistant_msg)

            elif isinstance(msg.content, str):
                # Simple text message
                if msg.content.strip():
                    result.append({"role": msg.role, "content": msg.content})

            elif isinstance(msg.content, list):
                # Structured content
                result.append({"role": msg.role, "content": msg.content})

        return result

    async def stream(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        tools: list[LLMToolDefinition],
    ) -> AsyncIterator[LLMStreamEvent]:
        """Stream responses from OpenAI."""
        # Reset tracking state
        self._current_tool_calls = {}
        self._current_text = ""
        self._current_reasoning = ""

        converted_messages = self.convert_messages(messages)
        converted_tools = self.convert_tools(tools)

        # Prepend system message
        all_messages = [{"role": "system", "content": system_prompt}] + converted_messages

        # Build request kwargs
        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": all_messages,
            "max_completion_tokens": self.config.max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        if converted_tools:
            kwargs["tools"] = converted_tools

        if self.config.temperature is not None:
            kwargs["temperature"] = self.config.temperature

        # Check if model supports reasoning (o1, o3, etc.)
        if self.config.thinking_budget and self._model_supports_reasoning():
            kwargs["reasoning_effort"] = self._get_reasoning_effort()

        response = await self.client.chat.completions.create(**kwargs)

        # Emit message start
        yield LLMStreamEvent(type=StreamEventType.MESSAGE_START)

        text_block_started = False
        active_tool_indices: set[int] = set()

        async for chunk in response:
            events = self._process_chunk(chunk, text_block_started, active_tool_indices)
            for event in events:
                if event.type == StreamEventType.CONTENT_BLOCK_START and event.block_type == "text":
                    text_block_started = True
                elif event.type == StreamEventType.CONTENT_BLOCK_START and event.block_type == "tool_use":
                    if event.index is not None:
                        active_tool_indices.add(event.index)
                yield event

        # Emit stops for any active blocks
        if text_block_started:
            yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=0)

        for idx in sorted(active_tool_indices):
            yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=idx)

        yield LLMStreamEvent(type=StreamEventType.MESSAGE_STOP)

    async def stream_complete(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        tools: list[LLMToolDefinition],
    ) -> tuple[AsyncIterator[LLMStreamEvent], asyncio.Future[LLMStreamResult], dict[str, Any]]:
        """Stream and collect the final result."""
        # Reset tracking state
        self._current_tool_calls = {}
        self._current_text = ""
        self._current_reasoning = ""

        converted_messages = self.convert_messages(messages)
        converted_tools = self.convert_tools(tools)

        # Prepend system message
        all_messages = [{"role": "system", "content": system_prompt}] + converted_messages

        # Build request kwargs
        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": all_messages,
            "max_completion_tokens": self.config.max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        if converted_tools:
            kwargs["tools"] = converted_tools

        if self.config.temperature is not None:
            kwargs["temperature"] = self.config.temperature

        # Check if model supports reasoning (o1, o3, etc.)
        if self.config.thinking_budget and self._model_supports_reasoning():
            kwargs["reasoning_effort"] = self._get_reasoning_effort()

        result_future: asyncio.Future[LLMStreamResult] = asyncio.Future()

        async def event_generator() -> AsyncIterator[LLMStreamEvent]:
            try:
                response = await self.client.chat.completions.create(**kwargs)

                # Emit message start
                yield LLMStreamEvent(type=StreamEventType.MESSAGE_START)

                text_block_started = False
                active_tool_indices: set[int] = set()
                input_tokens = 0
                output_tokens = 0

                async for chunk in response:
                    # Track usage from final chunk
                    if chunk.usage:
                        input_tokens = chunk.usage.prompt_tokens
                        output_tokens = chunk.usage.completion_tokens

                    events = self._process_chunk(chunk, text_block_started, active_tool_indices)
                    for event in events:
                        if event.type == StreamEventType.CONTENT_BLOCK_START and event.block_type == "text":
                            text_block_started = True
                        elif event.type == StreamEventType.CONTENT_BLOCK_START and event.block_type == "tool_use":
                            if event.index is not None:
                                active_tool_indices.add(event.index)
                        yield event

                # Emit stops for any active blocks
                if text_block_started:
                    yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=0)

                for idx in sorted(active_tool_indices):
                    yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=idx)

                yield LLMStreamEvent(type=StreamEventType.MESSAGE_STOP)

                # Build final result
                result = self._build_result(input_tokens, output_tokens)
                result_future.set_result(result)

            except Exception as e:
                result_future.set_exception(e)
                raise

        return event_generator(), result_future, kwargs

    def _process_chunk(
        self,
        chunk: ChatCompletionChunk,
        text_started: bool,
        active_tools: set[int],
    ) -> list[LLMStreamEvent]:
        """Process a single chunk and return events."""
        events: list[LLMStreamEvent] = []

        if not chunk.choices:
            return events

        choice = chunk.choices[0]
        delta = choice.delta

        # Handle text content
        if delta.content:
            if not text_started:
                events.append(
                    LLMStreamEvent(
                        type=StreamEventType.CONTENT_BLOCK_START,
                        index=0,
                        block_type="text",
                    )
                )
            events.append(
                LLMStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_DELTA,
                    index=0,
                    text_delta=delta.content,
                )
            )
            self._current_text += delta.content

        # Handle tool calls
        if delta.tool_calls:
            for tc_delta in delta.tool_calls:
                idx = tc_delta.index
                # Offset by 1 to account for potential text block at index 0
                stream_idx = idx + 1

                if idx not in self._current_tool_calls:
                    # New tool call
                    self._current_tool_calls[idx] = {
                        "id": tc_delta.id or "",
                        "name": tc_delta.function.name if tc_delta.function and tc_delta.function.name else "",
                        "arguments": "",
                    }

                    if stream_idx not in active_tools:
                        events.append(
                            LLMStreamEvent(
                                type=StreamEventType.CONTENT_BLOCK_START,
                                index=stream_idx,
                                block_type="tool_use",
                                block_id=self._current_tool_calls[idx]["id"],
                                tool_name=self._current_tool_calls[idx]["name"],
                            )
                        )

                # Update tool call
                if tc_delta.id:
                    self._current_tool_calls[idx]["id"] = tc_delta.id
                if tc_delta.function:
                    if tc_delta.function.name:
                        self._current_tool_calls[idx]["name"] = tc_delta.function.name
                    if tc_delta.function.arguments:
                        self._current_tool_calls[idx]["arguments"] += tc_delta.function.arguments
                        events.append(
                            LLMStreamEvent(
                                type=StreamEventType.CONTENT_BLOCK_DELTA,
                                index=stream_idx,
                                input_json_delta=tc_delta.function.arguments,
                            )
                        )

        return events

    def _build_result(self, input_tokens: int, output_tokens: int) -> LLMStreamResult:
        """Build the final result from accumulated data."""
        thinking_blocks: list[ThinkingBlock] = []
        text_blocks: list[TextBlock] = []
        tool_calls: list[ToolCallBlock] = []

        # Add reasoning as thinking block if present
        if self._current_reasoning:
            thinking_blocks.append(ThinkingBlock(thinking=self._current_reasoning))

        # Add text block if present
        if self._current_text.strip():
            text_blocks.append(TextBlock(text=self._current_text))

        # Add tool calls
        for tc_data in self._current_tool_calls.values():
            try:
                arguments = json.loads(tc_data["arguments"]) if tc_data["arguments"] else {}
            except json.JSONDecodeError:
                arguments = {}

            tool_calls.append(
                ToolCallBlock(
                    id=tc_data["id"],
                    name=tc_data["name"],
                    input=arguments,
                )
            )

        return LLMStreamResult(
            thinking_blocks=thinking_blocks,
            text_blocks=text_blocks,
            tool_calls=tool_calls,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    def _model_supports_reasoning(self) -> bool:
        """Check if the current model supports reasoning/thinking."""
        reasoning_models = ["o1", "o3", "o1-mini", "o1-preview"]
        return any(self.config.model.startswith(m) for m in reasoning_models)

    def _get_reasoning_effort(self) -> str:
        """Convert thinking budget to OpenAI reasoning_effort."""
        if not self.config.thinking_budget:
            return "medium"
        if self.config.thinking_budget < 1000:
            return "low"
        elif self.config.thinking_budget < 5000:
            return "medium"
        else:
            return "high"

    def calculate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
    ) -> float:
        """Calculate cost for OpenAI request based on model pricing."""
        cost = 0.0
        cost += input_tokens * self._pricing["input"] / 1_000_000
        cost += output_tokens * self._pricing["output"] / 1_000_000
        cost += cache_read_tokens * self._pricing["cache_read"] / 1_000_000
        return cost
