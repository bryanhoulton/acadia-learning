"""LLM provider adapter layer to handle OpenAI and Claude APIs."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from anthropic import Anthropic
from openai import OpenAI
from openai.types.responses import Response

logger = logging.getLogger(__name__)


# =============================================================================
# Data Models
# =============================================================================


@dataclass
class SystemPart:
    """A part of the system prompt with caching metadata."""

    content: str
    cacheable: bool = False


@dataclass
class LLMRequest:
    """Unified request format for LLM calls."""

    model: str
    system_parts: list[SystemPart] = field(default_factory=list)
    messages: list[dict[str, Any]] = field(default_factory=list)
    tools: list[dict[str, Any]] = field(default_factory=list)
    tool_choice: str = "auto"
    metadata: dict[str, Any] = field(default_factory=dict)
    reasoning_effort: str | None = None
    entity_id: str | None = None


@dataclass
class UsageInfo:
    """Usage info compatible with OpenAI's ResponseUsage."""

    input_tokens: int
    output_tokens: int
    cached_tokens: int = 0  # Cache read tokens
    cache_creation_tokens: int = 0  # Cache write tokens

    def __post_init__(self):
        self.total_tokens = self.input_tokens + self.output_tokens
        self.input_tokens_details = type(
            "obj",
            (object,),
            {"cached_tokens": self.cached_tokens, "cache_creation_tokens": self.cache_creation_tokens},
        )()
        self.output_tokens_details = None


@dataclass
class UnifiedLLMResponse:
    """Unified response format that works with both OpenAI and Claude."""

    output: list[Any]
    usage: UsageInfo | None
    error: Any = None
    provider: str = "openai"


class OutputItem:
    """Wrapper class to make dict output items accessible via attributes."""

    def __init__(self, data: dict[str, Any]):
        self._data = data
        for key, value in data.items():
            setattr(self, key, value)

    def __getattr__(self, name: str) -> Any:
        return self._data.get(name)

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)


# =============================================================================
# Provider Detection
# =============================================================================


def is_claude_model(model: str) -> bool:
    """Check if a model name is a Claude model."""
    return model.startswith("claude-")


def is_openai_model(model: str) -> bool:
    """Check if a model name is an OpenAI model."""
    return not is_claude_model(model)


# =============================================================================
# Main Entry Point
# =============================================================================


def create_llm_response(
    client: OpenAI | Anthropic,
    model: str,
    messages: list[dict[str, Any]] | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str = "auto",
    metadata: dict[str, Any] | None = None,
    reasoning_effort: str | None = None,
    entity_id: str | None = None,
    *,
    request: LLMRequest | None = None,
) -> Response | UnifiedLLMResponse:
    """
    Create an LLM response using the appropriate provider.

    Can be called with either:
    - Legacy style: individual parameters (messages, tools, etc.)
    - New style: a structured LLMRequest object

    Returns:
        Response object (OpenAI) or UnifiedLLMResponse (Claude)
    """
    # Build request from legacy params if not provided
    if request is None:
        request = LLMRequest(
            model=model,
            messages=messages or [],
            tools=tools or [],
            tool_choice=tool_choice,
            metadata=metadata or {},
            reasoning_effort=reasoning_effort,
            entity_id=entity_id,
        )

    if is_openai_model(request.model):
        return OpenAIAdapter(client).create_response(request)  # type: ignore
    else:
        return ClaudeAdapter(client).create_response(request)  # type: ignore


# =============================================================================
# OpenAI Adapter
# =============================================================================


class OpenAIAdapter:
    """Handles OpenAI-specific API interactions."""

    def __init__(self, client: OpenAI):
        self.client = client

    def create_response(self, request: LLMRequest) -> Response:
        """Create a response using OpenAI's API."""
        # Convert structured system parts to messages if present
        messages = self._build_messages(request)

        call_params: dict[str, Any] = {
            "model": request.model,
            "input": messages,
            "store": True,
        }

        if request.metadata:
            call_params["metadata"] = request.metadata

        if request.reasoning_effort:
            call_params["reasoning"] = {"effort": request.reasoning_effort, "summary": "auto"}

        if request.tools:
            call_params["tools"] = request.tools
            call_params["tool_choice"] = request.tool_choice

        return self.client.responses.create(**call_params)

    def _build_messages(self, request: LLMRequest) -> list[dict[str, Any]]:
        """Build messages list, incorporating system parts."""
        messages = []

        # Add system parts as system messages
        for part in request.system_parts:
            messages.append({"type": "message", "role": "system", "content": part.content})

        # Add regular messages
        messages.extend(request.messages)

        return messages


# =============================================================================
# Claude Adapter
# =============================================================================


class ClaudeAdapter:
    """Handles Claude-specific API interactions with prompt caching."""

    # Models that support extended thinking
    THINKING_MODELS = {"claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"}

    def __init__(self, client: Anthropic):
        self.client = client

    def create_response(self, request: LLMRequest) -> UnifiedLLMResponse:
        """Create a response using Claude's API."""
        call_params = self._build_call_params(request)
        response = self.client.messages.create(**call_params)
        return self._convert_response(response)

    def _build_call_params(self, request: LLMRequest) -> dict[str, Any]:
        """Build the complete API call parameters."""
        is_thinking_model = request.model in self.THINKING_MODELS
        max_tokens = 16000 if is_thinking_model else 8192

        params: dict[str, Any] = {
            "model": request.model,
            "max_tokens": max_tokens,
            "messages": self._build_messages(request),
        }

        # Add system prompt with caching
        system_blocks = self._build_system_blocks(request.system_parts)
        if system_blocks:
            params["system"] = system_blocks

        # Add tools with caching
        if request.tools:
            params["tools"] = self._build_tools(request.tools)
            tool_choice = self._convert_tool_choice(request.tool_choice)
            # NOTE: Thinking cannot be enabled when tool_choice forces tool use.
            # For thinking models, we use "auto" instead - they're smart enough
            # to follow tool instructions without being forced.
            if is_thinking_model and tool_choice.get("type") == "any":
                tool_choice = {"type": "auto"}
            params["tool_choice"] = tool_choice

        # Add metadata (Claude only supports user_id)
        if request.metadata.get("user_id"):
            params["metadata"] = {"user_id": request.metadata["user_id"]}

        # Enable extended thinking for supported models
        if is_thinking_model:
            params["thinking"] = {"type": "enabled", "budget_tokens": 10000}

        return params

    def _build_system_blocks(self, parts: list[SystemPart]) -> list[dict[str, Any]]:
        """
        Build system prompt blocks with cache_control on cacheable parts.

        Claude caches all content up to and including a cache_control marker.
        We place markers at the end of cacheable sections for optimal caching.
        """
        if not parts:
            return []

        blocks = []
        last_cacheable_idx = -1

        # Find the last cacheable part
        for i, part in enumerate(parts):
            if part.cacheable:
                last_cacheable_idx = i

        # Build blocks with cache_control on the last cacheable part
        for i, part in enumerate(parts):
            block: dict[str, Any] = {"type": "text", "text": part.content}
            if i == last_cacheable_idx:
                block["cache_control"] = {"type": "ephemeral"}
            blocks.append(block)

        return blocks

    def _build_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Convert tools to Claude format with caching on the last tool."""
        claude_tools = []

        for tool in tools:
            if tool.get("type") == "web_search":
                claude_tools.append(
                    {
                        "type": "web_search_20250305",
                        "name": "web_search",
                        "max_uses": 5,
                    }
                )
            elif tool.get("type") == "function":
                claude_tools.append(self._convert_function_tool(tool))

        # Add cache_control to last tool
        if claude_tools:
            claude_tools[-1]["cache_control"] = {"type": "ephemeral"}

        return claude_tools

    def _convert_function_tool(self, tool: dict[str, Any]) -> dict[str, Any]:
        """Convert a single function tool to Claude format."""
        # Handle nested format: {"type": "function", "function": {...}}
        if "function" in tool:
            func = tool["function"]
            return {
                "name": func.get("name"),
                "description": func.get("description", ""),
                "input_schema": func.get("parameters", {}),
            }
        # Handle flat format: {"type": "function", "name": "...", ...}
        return {
            "name": tool.get("name"),
            "description": tool.get("description", ""),
            "input_schema": tool.get("parameters", {}),
        }

    def _convert_tool_choice(self, choice: str) -> dict[str, str]:
        """Convert tool choice to Claude format."""
        if choice == "required":
            return {"type": "any"}
        return {"type": "auto"}

    def _build_messages(self, request: LLMRequest) -> list[dict[str, Any]]:
        """
        Build messages in Claude format.

        Extracts system messages from the messages list and ensures
        proper alternating user/assistant structure.
        """
        claude_messages = []

        for msg in request.messages:
            role = msg.get("role")
            if role == "system":
                # System messages should be in system_parts, skip here
                continue
            claude_messages.append({"role": role, "content": msg.get("content")})

        # Claude requires at least one message
        if not claude_messages:
            claude_messages.append(
                {
                    "role": "user",
                    "content": "Please proceed based on the system instructions.",
                }
            )

        return claude_messages

    def _convert_response(self, response: Any) -> UnifiedLLMResponse:
        """Convert Claude response to unified format."""
        output_items = []

        for block in response.content:
            if block.type == "text":
                output_items.append(
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": block.text}],
                    }
                )
            elif block.type == "thinking":
                output_items.append(
                    {
                        "type": "reasoning",
                        "content": block.thinking,
                    }
                )
            elif block.type == "tool_use":
                if block.name == "web_search":
                    output_items.append(
                        {
                            "type": "web_search_call",
                            "id": block.id,
                            "status": "completed",
                        }
                    )
                else:
                    output_items.append(
                        {
                            "type": "function_call",
                            "id": block.id,
                            "call_id": block.id,
                            "name": block.name,
                            "arguments": json.dumps(block.input),
                        }
                    )
            elif block.type == "server_tool_use" and block.name == "web_search":
                output_items.append(
                    {
                        "type": "web_search_call",
                        "id": block.id,
                        "status": "completed",
                    }
                )
            # web_search_tool_result blocks are informational, skip them

        # Convert to OutputItem objects for attribute access
        output_items = [OutputItem(item) if isinstance(item, dict) else item for item in output_items]

        # Build usage info with cache stats
        usage = self._extract_usage(response)

        return UnifiedLLMResponse(output=output_items, usage=usage, provider="anthropic")

    def _extract_usage(self, response: Any) -> UsageInfo | None:
        """Extract usage info including cache statistics.

        Anthropic token breakdown:
        - input_tokens: Total input tokens (includes uncached + cache_creation, but NOT cache_read)
        - cache_read_input_tokens: Tokens read from cache (charged at discounted rate)
        - cache_creation_input_tokens: Tokens written to cache (charged at premium rate)

        Note: Anthropic's input_tokens = uncached + cache_creation (cache_read is separate)
        """
        if not response.usage:
            return None

        cache_read = getattr(response.usage, "cache_read_input_tokens", 0) or 0
        cache_creation = getattr(response.usage, "cache_creation_input_tokens", 0) or 0

        # Log cache stats for monitoring
        if cache_read > 0 or cache_creation > 0:
            # Total tokens processed = input_tokens + cache_read
            total_input = response.usage.input_tokens + cache_read
            hit_rate = (cache_read / total_input * 100) if total_input > 0 else 0
            logger.info(
                f"Claude cache: read={cache_read}, created={cache_creation}, "
                f"uncached={response.usage.input_tokens - cache_creation}, "
                f"total={total_input}, hit_rate={hit_rate:.1f}%"
            )

        return UsageInfo(
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cached_tokens=cache_read,
            cache_creation_tokens=cache_creation,
        )
