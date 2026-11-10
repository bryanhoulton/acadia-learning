"""Base classes and types for LLM provider abstraction."""

from __future__ import annotations

import time
import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncIterator, Literal


class StreamEventType(str, Enum):
    """Types of events that can occur during streaming."""

    MESSAGE_START = "message_start"
    CONTENT_BLOCK_START = "content_block_start"
    CONTENT_BLOCK_DELTA = "content_block_delta"
    CONTENT_BLOCK_STOP = "content_block_stop"
    MESSAGE_DELTA = "message_delta"
    MESSAGE_STOP = "message_stop"
    ERROR = "error"


@dataclass
class TextBlock:
    """A text content block from the LLM response."""

    text: str


@dataclass
class ThinkingBlock:
    """A thinking/reasoning block from the LLM response (if supported)."""

    thinking: str
    signature: str | None = None


@dataclass
class ToolCallBlock:
    """A tool call block from the LLM response."""

    id: str
    name: str
    input: dict[str, Any]
    thought_signature: str | None = None  # Required for Gemini 3 models


@dataclass
class LLMToolDefinition:
    """Provider-agnostic tool definition."""

    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass
class LLMToolResult:
    """Result from executing a tool."""

    tool_call_id: str
    content: str


@dataclass
class LLMToolCall:
    """A tool call requested by the LLM."""

    id: str
    name: str
    arguments: dict[str, Any]
    thought_signature: str | None = None  # Required for Gemini 3 models


@dataclass
class LLMMessage:
    """Provider-agnostic message format."""

    role: Literal["user", "assistant", "system"]
    content: str | list[dict[str, Any]]

    # For assistant messages with tool calls
    tool_calls: list[LLMToolCall] | None = None

    # For user messages that are tool results
    tool_results: list[LLMToolResult] | None = None

    # For messages with images
    images: list[dict[str, Any]] | None = None

    # For messages with audio
    audio: list[dict[str, Any]] | None = None

    # For assistant messages with thinking blocks (Anthropic extended thinking)
    thinking_blocks: list["ThinkingBlock"] | None = None

    # Timestamp of when the message was created
    timestamp: float = field(default_factory=time.time)


@dataclass
class LLMStreamEvent:
    """A single event from the LLM stream."""

    type: StreamEventType
    index: int | None = None

    # For content block events
    block_type: str | None = None  # "text", "tool_use", "thinking"
    block_id: str | None = None
    tool_name: str | None = None

    # For delta events
    text_delta: str | None = None
    input_json_delta: str | None = None
    thinking_delta: str | None = None

    # For errors
    error: str | None = None


@dataclass
class LLMStreamResult:
    """Final result after consuming the stream."""

    thinking_blocks: list[ThinkingBlock] = field(default_factory=list)
    text_blocks: list[TextBlock] = field(default_factory=list)
    tool_calls: list[ToolCallBlock] = field(default_factory=list)

    # Raw provider response for debugging
    raw_response: Any = None

    # Usage info
    input_tokens: int | None = None
    output_tokens: int | None = None

    # Cache usage (provider-specific)
    cache_creation_tokens: int | None = None
    cache_read_tokens: int | None = None


@dataclass
class LLMConfig:
    """Configuration for an LLM provider."""

    model: str
    max_tokens: int = 16384
    temperature: float | None = None
    timeout: int = 60

    # Provider-specific options
    thinking_budget: int | None = None  # For Anthropic extended thinking
    extra_options: dict[str, Any] = field(default_factory=dict)


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    def __init__(self, config: LLMConfig):
        self.config = config

    @abstractmethod
    async def stream(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        tools: list[LLMToolDefinition],
    ) -> AsyncIterator[LLMStreamEvent]:
        """
        Stream a response from the LLM.

        Yields LLMStreamEvent objects as they arrive.
        """
        raise NotImplementedError

    @abstractmethod
    async def stream_complete(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        tools: list[LLMToolDefinition],
    ) -> tuple[AsyncIterator[LLMStreamEvent], asyncio.Future[LLMStreamResult], dict[str, Any]]:
        """
        Stream a response and get both the event stream and final result.

        Returns:
            A tuple of (event_iterator, result_future, api_kwargs).
            - event_iterator: Yields LLMStreamEvent objects as they arrive
            - result_future: Resolves when the stream is complete
            - api_kwargs: The exact kwargs passed to the LLM API (for tracing)
        """
        raise NotImplementedError

    @abstractmethod
    def convert_messages(self, messages: list[LLMMessage]) -> list[dict[str, Any]]:
        """Convert provider-agnostic messages to provider-specific format."""
        raise NotImplementedError

    @abstractmethod
    def convert_tools(self, tools: list[LLMToolDefinition]) -> list[dict[str, Any]]:
        """Convert provider-agnostic tools to provider-specific format."""
        raise NotImplementedError

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of this provider (e.g., 'anthropic', 'openai')."""
        raise NotImplementedError

    def calculate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
    ) -> float:
        """Calculate the cost for a request. Override in subclasses with pricing."""
        return 0.0
