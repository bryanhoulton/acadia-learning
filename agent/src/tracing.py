"""
Tracing client for the agent project.

Sends spans to the API server over HTTP.

Usage:
    from tracing import TracingClient, text_span, audio_span, llm_span

    client = TracingClient(api_url=os.environ["API_URL"])

    # Text span
    with client.text_span("answer", input="What is 2+2?") as span:
        result = process()
        span.output(result)

    # Audio span
    with client.audio_span("voice_turn", audio_data=audio_bytes, session_id=session_id) as span:
        transcript = transcribe(audio)
        span.output(transcript)

    # LLM span
    with client.llm_span("claude_api", input=prompt, entity_id=entity_id) as span:
        response = await llm.complete(prompt)
        span.output(response)
"""

from __future__ import annotations

import base64
import logging
import os
from dataclasses import dataclass, field
from uuid import UUID

import httpx

logger = logging.getLogger(__name__)


@dataclass
class SpanData:
    """Local span data before/during send to API."""

    id: str | None = None
    trace_id: str | None = None
    name: str = ""
    span_type: str = "text"
    input_text: str | None = None
    output_text: str | None = None
    audio_data: str | None = None  # base64
    audio_url: str | None = None
    audio_duration_ms: int | None = None
    audio_format: str | None = None
    metadata: dict = field(default_factory=dict)
    entity_id: int | None = None
    session_id: str | None = None


class SpanContext:
    """Context manager for a span that sends to the API."""

    def __init__(self, client: TracingClient, data: SpanData):
        self.client = client
        self.data = data
        self._started = False

    def __enter__(self) -> SpanContext:
        # Always use client's session trace (set by start_session)
        if self.client._current_trace_id:
            self.data.trace_id = self.client._current_trace_id

        # Create span on API
        response = self.client._create_span(self.data)
        if response:
            self.data.id = response.get("id")
            self.data.trace_id = response.get("trace")
        self._started = True
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if not self._started or not self.data.id:
            return False

        # Update span with output and end it
        metadata = self.data.metadata.copy()
        if exc_type:
            metadata["error"] = str(exc_val)

        self.client._update_span(
            span_id=self.data.id,
            output_text=self.data.output_text,
            metadata=metadata if metadata else None,
            ended=True,
        )

        # Don't reset trace - keep it for the whole conversation
        return False

    def output(self, text: str) -> SpanContext:
        """Set the output text for this span."""
        self.data.output_text = text
        return self

    def set_metadata(self, **kwargs) -> SpanContext:
        """Add metadata to this span."""
        self.data.metadata.update(kwargs)
        return self


class TracingClient:
    """HTTP client for sending spans to the API."""

    def __init__(
        self,
        api_url: str | None = None,
        entity_api_key: str | None = None,
        timeout: float = 30.0,
    ):
        self.api_url = (api_url or os.environ.get("API_URL", "http://localhost:8000")).rstrip("/")
        self.entity_api_key = entity_api_key or os.environ.get("ENTITY_API_KEY")
        self.timeout = timeout
        self._client = httpx.Client(timeout=timeout)
        self._current_trace_id: str | None = None  # Session trace ID

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.entity_api_key:
            headers["X-Entity-API-Key"] = self.entity_api_key
        return headers

    def start_session(
        self,
        entity_id: int | None = None,
        room_name: str | None = None,
        metadata: dict | None = None,
    ) -> str | None:
        """
        Start a new session trace. Call this once when the agent session begins.
        All subsequent spans will be added to this trace.

        Args:
            entity_id: Optional entity ID to link the trace to
            room_name: LiveKit room name - used to link trace to Session after it's created
            metadata: Additional metadata for the trace

        Returns the trace_id or None if creation failed.
        """
        try:
            payload = {
                "name": "session",
                "metadata": metadata or {},
            }
            if entity_id:
                payload["entity_id"] = entity_id
            if room_name:
                payload["room_name"] = room_name

            response = self._client.post(
                f"{self.api_url}/api/tracing/traces/",
                json=payload,
                headers=self._headers(),
            )
            response.raise_for_status()
            data = response.json()
            self._current_trace_id = data.get("id")
            logger.info(f"Started session trace: {self._current_trace_id}")
            return self._current_trace_id
        except Exception as e:
            logger.error(f"Failed to start session trace: {e}")
            return None

    def end_session(self) -> None:
        """End the current session trace."""
        if not self._current_trace_id:
            return

        try:
            response = self._client.patch(
                f"{self.api_url}/api/tracing/traces/{self._current_trace_id}/end/",
                headers=self._headers(),
            )
            response.raise_for_status()
            logger.info(f"Ended session trace: {self._current_trace_id}")
        except Exception as e:
            logger.error(f"Failed to end session trace: {e}")
        finally:
            self._current_trace_id = None

    def _create_span(self, data: SpanData) -> dict | None:
        """Create a span on the API."""
        try:
            payload = {
                "name": data.name,
                "span_type": data.span_type,
                "input_text": data.input_text,
                "output_text": data.output_text,
                "audio_url": data.audio_url,
                "audio_data": data.audio_data,
                "audio_duration_ms": data.audio_duration_ms,
                "audio_format": data.audio_format,
                "metadata": data.metadata,
            }

            if data.trace_id:
                payload["trace_id"] = data.trace_id
            if data.entity_id:
                payload["entity_id"] = data.entity_id
            if data.session_id:
                payload["session_id"] = data.session_id

            response = self._client.post(
                f"{self.api_url}/api/tracing/spans/",
                json=payload,
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to create span: {e}")
            return None

    def _update_span(
        self,
        span_id: str,
        output_text: str | None = None,
        metadata: dict | None = None,
        ended: bool = False,
    ) -> dict | None:
        """Update a span on the API."""
        try:
            payload: dict = {"ended": ended}
            if output_text is not None:
                payload["output_text"] = output_text
            if metadata:
                payload["metadata"] = metadata

            response = self._client.patch(
                f"{self.api_url}/api/tracing/spans/{span_id}/update/",
                json=payload,
                headers=self._headers(),
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to update span: {e}")
            return None

    def text_span(
        self,
        name: str,
        input: str | None = None,
        metadata: dict | None = None,
        entity_id: int | None = None,
        session_id: str | UUID | None = None,
    ) -> SpanContext:
        """
        Create a text span context manager.

        Args:
            name: Name of the span
            input: Input text
            metadata: Additional metadata
            entity_id: Entity ID to link trace to
            session_id: Session ID to link trace to
        """
        data = SpanData(
            name=name,
            span_type="text",
            input_text=input,
            metadata=metadata or {},
            entity_id=entity_id,
            session_id=str(session_id) if session_id else None,
        )
        return SpanContext(self, data)

    def audio_span(
        self,
        name: str,
        audio_data: bytes | None = None,
        audio_url: str | None = None,
        duration_ms: int | None = None,
        audio_format: str = "mp3",
        metadata: dict | None = None,
        entity_id: int | None = None,
        session_id: str | UUID | None = None,
    ) -> SpanContext:
        """
        Create an audio span context manager.

        Args:
            name: Name of the span
            audio_data: Raw audio bytes (will be base64 encoded)
            audio_url: URL to audio file (alternative to audio_data)
            duration_ms: Audio duration in milliseconds
            audio_format: Audio format (mp3, wav, etc.)
            metadata: Additional metadata
            entity_id: Entity ID to link trace to
            session_id: Session ID to link trace to
        """
        audio_data_b64 = None
        if audio_data:
            audio_data_b64 = base64.b64encode(audio_data).decode("utf-8")

        data = SpanData(
            name=name,
            span_type="audio",
            audio_data=audio_data_b64,
            audio_url=audio_url,
            audio_duration_ms=duration_ms,
            audio_format=audio_format,
            metadata=metadata or {},
            entity_id=entity_id,
            session_id=str(session_id) if session_id else None,
        )
        return SpanContext(self, data)

    def tool_span(
        self,
        name: str,
        input: str | None = None,
        metadata: dict | None = None,
    ) -> SpanContext:
        """
        Create a tool execution span context manager.

        Args:
            name: Name of the tool
            input: Tool input/arguments
            metadata: Additional metadata
        """
        data = SpanData(
            name=name,
            span_type="tool",
            input_text=input,
            metadata=metadata or {},
        )
        return SpanContext(self, data)

    def llm_span(
        self,
        name: str,
        input: str | None = None,
        metadata: dict | None = None,
        entity_id: int | None = None,
        session_id: str | UUID | None = None,
    ) -> SpanContext:
        """
        Create an LLM call span context manager.

        Args:
            name: Name of the LLM call (e.g., "claude_api_call")
            input: Input to the LLM (system prompt + messages)
            metadata: Additional metadata (model, tokens, etc.)
            entity_id: Entity ID to link trace to
            session_id: Session ID to link trace to
        """
        data = SpanData(
            name=name,
            span_type="llm",
            input_text=input,
            metadata=metadata or {},
            entity_id=entity_id,
            session_id=str(session_id) if session_id else None,
        )
        return SpanContext(self, data)


# Default client instance (initialized lazily)
_default_client: TracingClient | None = None


def get_client() -> TracingClient:
    """Get the default tracing client."""
    global _default_client
    if _default_client is None:
        _default_client = TracingClient()
    return _default_client


# Convenience functions using the default client
def text_span(
    name: str,
    input: str | None = None,
    metadata: dict | None = None,
    entity_id: int | None = None,
    session_id: str | UUID | None = None,
) -> SpanContext:
    """Create a text span using the default client."""
    return get_client().text_span(name, input, metadata, entity_id, session_id)


def audio_span(
    name: str,
    audio_data: bytes | None = None,
    audio_url: str | None = None,
    duration_ms: int | None = None,
    audio_format: str = "mp3",
    metadata: dict | None = None,
    entity_id: int | None = None,
    session_id: str | UUID | None = None,
) -> SpanContext:
    """Create an audio span using the default client."""
    return get_client().audio_span(
        name, audio_data, audio_url, duration_ms, audio_format, metadata, entity_id, session_id
    )


def tool_span(
    name: str,
    input: str | None = None,
    metadata: dict | None = None,
) -> SpanContext:
    """Create a tool span using the default client."""
    return get_client().tool_span(name, input, metadata)


def llm_span(
    name: str,
    input: str | None = None,
    metadata: dict | None = None,
    entity_id: int | None = None,
    session_id: str | UUID | None = None,
) -> SpanContext:
    """Create an LLM span using the default client."""
    return get_client().llm_span(name, input, metadata, entity_id, session_id)
