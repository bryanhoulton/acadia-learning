"""Anthropic Claude LLM provider implementation."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any, AsyncIterator

from anthropic import AsyncAnthropic
from anthropic.types.beta import (
    BetaBase64ImageSourceParam,
    BetaImageBlockParam,
    BetaMessage,
    BetaTextBlockParam,
    BetaToolParam,
)

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


class AnthropicProvider(LLMProvider):
    """Anthropic Claude provider with extended thinking support."""

    # Pricing per 1M tokens by model (from https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
    MODEL_PRICING = {
        # Claude 4.6 series
        "claude-opus-4-6": {"input": 5.00, "output": 25.00, "cache_write": 6.25, "cache_read": 0.50},
        # Claude 4.5 series
        "claude-opus-4-5": {"input": 5.00, "output": 25.00, "cache_write": 6.25, "cache_read": 0.50},
        "claude-sonnet-4-5": {"input": 3.00, "output": 15.00, "cache_write": 3.75, "cache_read": 0.30},
        "claude-haiku-4-5": {"input": 1.00, "output": 5.00, "cache_write": 1.25, "cache_read": 0.10},
        # Claude 4 series
        "claude-opus-4": {"input": 15.00, "output": 75.00, "cache_write": 18.75, "cache_read": 1.50},
        "claude-sonnet-4": {"input": 3.00, "output": 15.00, "cache_write": 3.75, "cache_read": 0.30},
        "claude-haiku-4": {"input": 0.80, "output": 4.00, "cache_write": 1.00, "cache_read": 0.08},
        # Claude 3.5 series
        "claude-3-5-sonnet": {"input": 3.00, "output": 15.00, "cache_write": 3.75, "cache_read": 0.30},
        "claude-3-5-haiku": {"input": 0.80, "output": 4.00, "cache_write": 1.00, "cache_read": 0.08},
        # Legacy Claude 3 series
        "claude-3-opus": {"input": 15.00, "output": 75.00, "cache_write": 18.75, "cache_read": 1.50},
        "claude-3-sonnet": {"input": 3.00, "output": 15.00, "cache_write": 3.75, "cache_read": 0.30},
        "claude-3-haiku": {"input": 0.25, "output": 1.25, "cache_write": 0.30, "cache_read": 0.03},
    }
    # Default pricing (Haiku 3.5)
    DEFAULT_PRICING = {"input": 0.80, "output": 4.00, "cache_write": 1.00, "cache_read": 0.08}

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        self.client = AsyncAnthropic(timeout=config.timeout, max_retries=10)

        # Get pricing for this model
        self._pricing = self._get_pricing(config.model)

    def _get_pricing(self, model: str) -> dict[str, float]:
        """Get pricing for a model, supporting exact and prefix matching."""
        # Exact match
        if model in self.MODEL_PRICING:
            return self.MODEL_PRICING[model]
        # Prefix match (e.g., "claude-3-5-sonnet-20241022" matches "claude-3-5-sonnet")
        for key in self.MODEL_PRICING:
            if model.startswith(key):
                return self.MODEL_PRICING[key]
        return self.DEFAULT_PRICING

    @property
    def name(self) -> str:
        return "anthropic"

    def convert_tools(self, tools: list[LLMToolDefinition]) -> list[BetaToolParam]:
        """Convert to Anthropic tool format."""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            }
            for tool in tools
        ]

    def convert_messages(self, messages: list[LLMMessage], enable_caching: bool = True) -> list[dict[str, Any]]:
        """Convert provider-agnostic messages to Anthropic format.

        Args:
            messages: List of provider-agnostic messages
            enable_caching: If True, adds cache_control breakpoint to the second-to-last message
        """
        result: list[dict[str, Any]] = []

        for msg in messages:
            if msg.role == "system":
                # System messages are handled separately in Anthropic
                continue

            if msg.tool_results:
                # This is a tool result message
                tool_result_blocks = [
                    {
                        "type": "tool_result",
                        "tool_use_id": tr.tool_call_id,
                        "content": tr.content,
                    }
                    for tr in msg.tool_results
                ]
                result.append({"role": "user", "content": tool_result_blocks})

            elif msg.images:
                # Message with images
                content_blocks: list[BetaImageBlockParam | BetaTextBlockParam] = []
                for img in msg.images:
                    image_source: BetaBase64ImageSourceParam = {
                        "type": "base64",
                        "media_type": img.get("media_type", "image/jpeg"),
                        "data": img["data"],
                    }
                    content_blocks.append({"type": "image", "source": image_source})

                if isinstance(msg.content, str) and msg.content:
                    content_blocks.append({"type": "text", "text": msg.content})

                result.append({"role": msg.role, "content": content_blocks})

            elif msg.role == "assistant" and (msg.tool_calls or msg.thinking_blocks):
                # Assistant message with tool calls and/or thinking blocks
                content_blocks_mixed: list[dict[str, Any]] = []

                # Thinking blocks MUST come first (Anthropic requirement for extended thinking)
                if msg.thinking_blocks:
                    for tb in msg.thinking_blocks:
                        content_blocks_mixed.append(
                            {
                                "type": "thinking",
                                "thinking": tb.thinking,
                                "signature": tb.signature,
                            }
                        )

                if isinstance(msg.content, str) and msg.content:
                    content_blocks_mixed.append({"type": "text", "text": msg.content})

                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        content_blocks_mixed.append(
                            {
                                "type": "tool_use",
                                "id": tc.id,
                                "name": tc.name,
                                "input": tc.arguments,
                            }
                        )

                result.append({"role": "assistant", "content": content_blocks_mixed})

            elif isinstance(msg.content, str):
                # Simple text message
                if msg.content.strip():
                    result.append({"role": msg.role, "content": msg.content})

            elif isinstance(msg.content, list):
                # Already structured content (pass through)
                result.append({"role": msg.role, "content": msg.content})

        # Sanitize: remove orphaned tool_result blocks whose tool_use_id
        # doesn't exist in the preceding assistant message. This prevents
        # the "unexpected tool_use_id found in tool_result blocks" API error.
        result = self._sanitize_tool_results(result)

        # Add cache_control breakpoint to the last message
        # This caches the entire conversation history including the latest message
        if enable_caching and len(result) >= 1:
            last_msg = result[-1]
            content = last_msg.get("content")

            if isinstance(content, list) and len(content) > 0:
                # Add cache_control to the last block in the content list
                content[-1]["cache_control"] = {"type": "ephemeral"}
            elif isinstance(content, str):
                # Convert string content to block format with cache_control
                last_msg["content"] = [{"type": "text", "text": content, "cache_control": {"type": "ephemeral"}}]

        return result

    def _sanitize_tool_results(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Remove orphaned tool_result blocks that reference non-existent tool_use ids.

        Anthropic requires every tool_result to have a matching tool_use in the
        immediately preceding assistant message. When message history gets corrupted
        (e.g. a streaming error drops tool_use blocks), this cleans it up so the
        conversation can continue.
        """
        sanitized: list[dict[str, Any]] = []

        for i, msg in enumerate(messages):
            content = msg.get("content")

            # Only check user messages that contain tool_result blocks
            if msg.get("role") != "user" or not isinstance(content, list):
                sanitized.append(msg)
                continue

            has_tool_results = any(isinstance(block, dict) and block.get("type") == "tool_result" for block in content)
            if not has_tool_results:
                sanitized.append(msg)
                continue

            # Collect tool_use ids from the preceding assistant message
            valid_tool_use_ids: set[str] = set()
            if sanitized:
                prev = sanitized[-1]
                prev_content = prev.get("content")
                if prev.get("role") == "assistant" and isinstance(prev_content, list):
                    for block in prev_content:
                        if isinstance(block, dict) and block.get("type") == "tool_use":
                            valid_tool_use_ids.add(block["id"])

            # Filter out orphaned tool_result blocks
            cleaned_content: list[dict[str, Any]] = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    tool_use_id = block.get("tool_use_id")
                    if tool_use_id not in valid_tool_use_ids:
                        logger.warning(
                            f"Removing orphaned tool_result with tool_use_id={tool_use_id} "
                            f"(no matching tool_use in previous assistant message)"
                        )
                        continue
                cleaned_content.append(block)

            if cleaned_content:
                sanitized.append({**msg, "content": cleaned_content})
            else:
                # All tool_results were orphaned; drop the entire message
                logger.warning("Dropping user message entirely — all tool_results were orphaned")

        return sanitized

    async def stream(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        tools: list[LLMToolDefinition],
    ) -> AsyncIterator[LLMStreamEvent]:
        """Stream responses from Claude."""
        converted_messages = self.convert_messages(messages)
        converted_tools = self.convert_tools(tools)

        kwargs: dict[str, Any] = {
            "max_tokens": self.config.max_tokens,
            "messages": converted_messages,
            "system": system_prompt,
            "tools": converted_tools,
            "model": self.config.model,
            "timeout": self.config.timeout,
        }

        # Beta features to enable
        betas = ["prompt-caching-2024-07-31"]

        # Add thinking if configured
        if self.config.thinking_budget:
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": self.config.thinking_budget,
            }
            betas.extend(
                [
                    "interleaved-thinking-2025-05-14",
                    "fine-grained-tool-streaming-2025-05-14",
                ]
            )

        kwargs["betas"] = betas

        async with self.client.beta.messages.stream(**kwargs) as stream:
            async for event in stream:
                yield self._convert_event(event)

    async def stream_complete(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        tools: list[LLMToolDefinition],
    ) -> tuple[AsyncIterator[LLMStreamEvent], asyncio.Future[LLMStreamResult], dict[str, Any]]:
        """Stream and collect the final result."""
        converted_messages = self.convert_messages(messages)
        converted_tools = self.convert_tools(tools)

        # See: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
        kwargs: dict[str, Any] = {
            "max_tokens": self.config.max_tokens,
            "messages": converted_messages,
            "system": system_prompt,
            "tools": converted_tools,
            "model": self.config.model,
            "timeout": self.config.timeout,
        }

        # Beta features to enable
        betas = ["prompt-caching-2024-07-31"]

        # Add thinking if configured
        if self.config.thinking_budget:
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": self.config.thinking_budget,
            }
            betas.extend(
                [
                    "interleaved-thinking-2025-05-14",
                    "fine-grained-tool-streaming-2025-05-14",
                ]
            )

        kwargs["betas"] = betas

        result_future: asyncio.Future[LLMStreamResult] = asyncio.Future()

        async def event_generator() -> AsyncIterator[LLMStreamEvent]:
            try:
                async with self.client.beta.messages.stream(**kwargs) as stream:
                    async for event in stream:
                        yield self._convert_event(event)

                    # Get final message and convert to result
                    final_message: BetaMessage = await stream.get_final_message()
                    result = self._convert_final_message(final_message)
                    result_future.set_result(result)

            except Exception as e:
                logger.error(f"Anthropic API error: {e}")
                # Dump kwargs to file for debugging
                try:
                    log_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "logs", "llm_errors")
                    os.makedirs(log_dir, exist_ok=True)
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                    log_file = os.path.join(log_dir, f"anthropic_error_{timestamp}.json")
                    with open(log_file, "w") as f:
                        json.dump(kwargs, f, indent=2, default=str)
                    logger.error(f"LLM input dumped to: {log_file}")
                except Exception as log_err:
                    logger.error(f"Failed to dump LLM input: {log_err}")
                result_future.set_exception(e)
                raise

        return event_generator(), result_future, kwargs

    def _convert_event(self, event: Any) -> LLMStreamEvent:
        """Convert Anthropic event to provider-agnostic format."""
        event_type = getattr(event, "type", "")

        if event_type == "message_start":
            return LLMStreamEvent(type=StreamEventType.MESSAGE_START)

        elif event_type == "content_block_start":
            block = getattr(event, "content_block", None)
            index = getattr(event, "index", None)
            if block:
                block_type = getattr(block, "type", "")
                return LLMStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_START,
                    index=index,
                    block_type=block_type,
                    block_id=getattr(block, "id", None),
                    tool_name=getattr(block, "name", None) if block_type == "tool_use" else None,
                )
            return LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_START, index=index)

        elif event_type == "content_block_delta":
            index = getattr(event, "index", None)
            delta = getattr(event, "delta", None)
            delta_type = getattr(delta, "type", "") if delta else ""

            return LLMStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_DELTA,
                index=index,
                text_delta=getattr(delta, "text", None) if delta_type == "text_delta" else None,
                input_json_delta=getattr(delta, "partial_json", None) if delta_type == "input_json_delta" else None,
                thinking_delta=getattr(delta, "thinking", None) if delta_type == "thinking_delta" else None,
            )

        elif event_type == "content_block_stop":
            return LLMStreamEvent(
                type=StreamEventType.CONTENT_BLOCK_STOP,
                index=getattr(event, "index", None),
            )

        elif event_type == "message_delta":
            return LLMStreamEvent(type=StreamEventType.MESSAGE_DELTA)

        elif event_type == "message_stop":
            return LLMStreamEvent(type=StreamEventType.MESSAGE_STOP)

        # Unknown event type
        return LLMStreamEvent(type=StreamEventType.MESSAGE_DELTA)

    def _convert_final_message(self, message: BetaMessage) -> LLMStreamResult:
        """Convert Anthropic final message to provider-agnostic result."""
        thinking_blocks: list[ThinkingBlock] = []
        text_blocks: list[TextBlock] = []
        tool_calls: list[ToolCallBlock] = []

        for block in message.content:
            if block.type == "thinking":
                thinking_blocks.append(
                    ThinkingBlock(
                        thinking=block.thinking,
                        signature=getattr(block, "signature", None),
                    )
                )
            elif block.type == "text":
                if block.text and block.text.strip():
                    text_blocks.append(TextBlock(text=block.text))
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCallBlock(
                        id=block.id,
                        name=block.name,
                        input=block.input if isinstance(block.input, dict) else {},
                    )
                )

        # Extract cache usage from response
        cache_creation = None
        cache_read = None
        if message.usage:
            cache_creation = getattr(message.usage, "cache_creation_input_tokens", None)
            cache_read = getattr(message.usage, "cache_read_input_tokens", None)

        return LLMStreamResult(
            thinking_blocks=thinking_blocks,
            text_blocks=text_blocks,
            tool_calls=tool_calls,
            raw_response=message,
            input_tokens=message.usage.input_tokens if message.usage else None,
            output_tokens=message.usage.output_tokens if message.usage else None,
            cache_creation_tokens=cache_creation,
            cache_read_tokens=cache_read,
        )

    def calculate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
    ) -> float:
        """Calculate cost for Anthropic request based on model pricing.

        Token breakdown from Anthropic's API:
        - input_tokens: Tokens AFTER the last cache breakpoint (not cached, charged at full input rate)
        - cache_read_tokens: Tokens read from cache (charged at discounted cache_read rate)
        - cache_creation_tokens: Tokens written to cache (charged at cache_write rate)

        Total input tokens processed = input_tokens + cache_read_tokens + cache_creation_tokens
        """
        cost = 0.0
        # Tokens after cache breakpoint - charged at regular input price
        cost += input_tokens * self._pricing["input"] / 1_000_000
        # Output tokens
        cost += output_tokens * self._pricing["output"] / 1_000_000
        # Cache writes - tokens being cached for the first time
        cost += cache_creation_tokens * self._pricing["cache_write"] / 1_000_000
        # Cache reads - tokens retrieved from cache (much cheaper)
        cost += cache_read_tokens * self._pricing["cache_read"] / 1_000_000
        return cost
