"""
Span tracing utilities with typed constructors.

Usage:
    from tracing.spans import text_span, audio_span, async_text_span, llm_span, async_llm_span, traced

    # Text span (linked to entity) - sync context
    with text_span("answer_question", input="What is 2+2?", entity=entity) as span:
        result = llm.complete(question)
        span.output(result)

    # Text span in async context
    async with async_text_span("answer_question", entity=entity) as span:
        result = await async_llm.complete(question)
        span.output(result)

    # LLM span for tracking API calls
    with llm_span("openai_api_call", input=prompt, entity=entity, metadata={"model": "o3"}) as span:
        response = oai.responses.create(input=prompt)
        span.output(response.output_text)

    # Async LLM span
    async with async_llm_span("claude_api_call", input=prompt, entity=entity) as span:
        response = await claude.messages.create(messages=prompt)
        span.output(response.content)

    # Audio span (linked to session)
    with audio_span("voice_turn", audio_data=audio_bytes, session=session) as span:
        transcript = transcribe(audio)
        span.output(transcript)

    # Decorator
    @traced
    def process_question(q: str) -> str:
        return answer
"""

from __future__ import annotations

import base64
import functools
import logging
import traceback
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Callable, TypeVar

from .models import Span, SpanType, Trace

logger = logging.getLogger(__name__)

# Context variables for tracking current trace and span
_current_trace: ContextVar[Trace | None] = ContextVar("current_trace", default=None)
_current_span: ContextVar[Span | None] = ContextVar("current_span", default=None)

F = TypeVar("F", bound=Callable[..., Any])


class SpanContext:
    """Context manager for a span with fluent output methods."""

    def __init__(
        self,
        name: str,
        span_type: SpanType,
        input_text: str | None = None,
        audio_data: bytes | None = None,
        audio_url: str | None = None,
        audio_duration_ms: int | None = None,
        audio_format: str | None = None,
        metadata: dict | None = None,
        entity: Any | None = None,
        session: Any | None = None,
    ):
        self.name = name
        self.span_type = span_type
        self.input_text = input_text
        self.audio_data = audio_data
        self.audio_url = audio_url
        self.audio_duration_ms = audio_duration_ms
        self.audio_format = audio_format
        self.metadata = metadata or {}
        self.entity = entity
        self.session = session

        self._span: Span | None = None
        self._trace: Trace | None = None
        self._parent_span: Span | None = None
        self._trace_token: Any = None
        self._span_token: Any = None
        self._created_trace = False

    def __enter__(self) -> SpanContext:
        # Get or create trace
        self._trace = _current_trace.get()
        if self._trace is None:
            entity_instance = self._resolve_entity(self.entity)
            session_instance = self._resolve_session(self.session)

            self._trace = Trace.objects.create(
                name=self.name,
                entity=entity_instance,
                session=session_instance,
            )
            self._trace_token = _current_trace.set(self._trace)
            self._created_trace = True

        # Get parent span if exists
        self._parent_span = _current_span.get()

        # Encode audio data if present
        audio_data_b64 = None
        if self.audio_data:
            audio_data_b64 = base64.b64encode(self.audio_data).decode("utf-8")

        # Create the span
        self._span = Span.objects.create(
            trace=self._trace,
            parent=self._parent_span,
            name=self.name,
            span_type=self.span_type,
            input_text=self.input_text,
            audio_data=audio_data_b64,
            audio_url=self.audio_url,
            audio_duration_ms=self.audio_duration_ms,
            audio_format=self.audio_format,
            metadata=self.metadata,
        )

        # Set as current span
        self._span_token = _current_span.set(self._span)

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # End the span
        if self._span:
            self._span.ended_at = datetime.now(timezone.utc)
            if exc_type:
                # Capture full error details
                self._span.metadata["error"] = str(exc_val)
                self._span.metadata["error_type"] = exc_type.__name__
                self._span.metadata["traceback"] = "".join(traceback.format_exception(exc_type, exc_val, exc_tb))
                logger.error(
                    f"Error in span '{self.name}': {exc_type.__name__}: {exc_val}",
                    exc_info=(exc_type, exc_val, exc_tb),
                )
            self._span.save(update_fields=["ended_at", "output_text", "metadata"])

        # Restore parent span
        if self._span_token:
            _current_span.reset(self._span_token)

        # End trace if we created it
        if self._created_trace and self._trace:
            self._trace.ended_at = datetime.now(timezone.utc)
            if exc_type:
                self._trace.metadata["error"] = str(exc_val)
                self._trace.metadata["error_type"] = exc_type.__name__
            self._trace.save(update_fields=["ended_at", "metadata"])
            if self._trace_token:
                _current_trace.reset(self._trace_token)

        return False  # Don't suppress exceptions

    def _resolve_entity(self, entity: Any) -> Any:
        """Resolve entity ID to instance if needed."""
        if entity is None:
            return None
        if isinstance(entity, int):
            from entities.models import Entity

            return Entity.objects.filter(id=entity).first()
        return entity

    def _resolve_session(self, session: Any) -> Any:
        """Resolve session ID to instance if needed."""
        if session is None:
            return None
        if isinstance(session, (str, uuid.UUID)):
            from entities.models import Session

            return Session.objects.filter(id=session).first()
        return session

    def output(self, text: str) -> SpanContext:
        """Set the output text for this span."""
        if self._span:
            self._span.output_text = text
            self._span.save(update_fields=["output_text"])
        return self

    def set_metadata(self, **kwargs) -> SpanContext:
        """Add metadata to this span."""
        if self._span:
            self._span.metadata.update(kwargs)
            self._span.save(update_fields=["metadata"])
        return self

    @property
    def span(self) -> Span | None:
        """Access the underlying Span model."""
        return self._span

    @property
    def trace(self) -> Trace | None:
        """Access the underlying Trace model."""
        return self._trace


class AsyncSpanContext:
    """Async context manager for a span - use in async code."""

    def __init__(
        self,
        name: str,
        span_type: SpanType,
        input_text: str | None = None,
        audio_data: bytes | None = None,
        audio_url: str | None = None,
        audio_duration_ms: int | None = None,
        audio_format: str | None = None,
        metadata: dict | None = None,
        entity: Any | None = None,
        session: Any | None = None,
    ):
        self.name = name
        self.span_type = span_type
        self.input_text = input_text
        self.audio_data = audio_data
        self.audio_url = audio_url
        self.audio_duration_ms = audio_duration_ms
        self.audio_format = audio_format
        self.metadata = metadata or {}
        self.entity = entity
        self.session = session

        self._span: Span | None = None
        self._trace: Trace | None = None
        self._parent_span: Span | None = None
        self._trace_token: Any = None
        self._span_token: Any = None
        self._created_trace = False

    async def __aenter__(self) -> AsyncSpanContext:
        from asgiref.sync import sync_to_async

        # Get or create trace
        self._trace = _current_trace.get()
        if self._trace is None:
            entity_instance = await sync_to_async(self._resolve_entity)(self.entity)
            session_instance = await sync_to_async(self._resolve_session)(self.session)

            self._trace = await sync_to_async(Trace.objects.create)(
                name=self.name,
                entity=entity_instance,
                session=session_instance,
            )
            self._trace_token = _current_trace.set(self._trace)
            self._created_trace = True

        # Get parent span if exists
        self._parent_span = _current_span.get()

        # Encode audio data if present
        audio_data_b64 = None
        if self.audio_data:
            audio_data_b64 = base64.b64encode(self.audio_data).decode("utf-8")

        # Create the span
        self._span = await sync_to_async(Span.objects.create)(
            trace=self._trace,
            parent=self._parent_span,
            name=self.name,
            span_type=self.span_type,
            input_text=self.input_text,
            audio_data=audio_data_b64,
            audio_url=self.audio_url,
            audio_duration_ms=self.audio_duration_ms,
            audio_format=self.audio_format,
            metadata=self.metadata,
        )

        # Set as current span
        self._span_token = _current_span.set(self._span)

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        from asgiref.sync import sync_to_async

        # End the span
        if self._span:
            self._span.ended_at = datetime.now(timezone.utc)
            if exc_type:
                # Capture full error details
                self._span.metadata["error"] = str(exc_val)
                self._span.metadata["error_type"] = exc_type.__name__
                self._span.metadata["traceback"] = "".join(traceback.format_exception(exc_type, exc_val, exc_tb))
                logger.error(
                    f"Error in span '{self.name}': {exc_type.__name__}: {exc_val}",
                    exc_info=(exc_type, exc_val, exc_tb),
                )
            await sync_to_async(self._span.save)(update_fields=["ended_at", "output_text", "metadata"])

        # Restore parent span
        if self._span_token:
            _current_span.reset(self._span_token)

        # End trace if we created it
        if self._created_trace and self._trace:
            self._trace.ended_at = datetime.now(timezone.utc)
            if exc_type:
                self._trace.metadata["error"] = str(exc_val)
                self._trace.metadata["error_type"] = exc_type.__name__
            await sync_to_async(self._trace.save)(update_fields=["ended_at", "metadata"])
            if self._trace_token:
                _current_trace.reset(self._trace_token)

        return False  # Don't suppress exceptions

    def _resolve_entity(self, entity: Any) -> Any:
        """Resolve entity ID to instance if needed."""
        if entity is None:
            return None
        if isinstance(entity, int):
            from entities.models import Entity

            return Entity.objects.filter(id=entity).first()
        return entity

    def _resolve_session(self, session: Any) -> Any:
        """Resolve session ID to instance if needed."""
        if session is None:
            return None
        if isinstance(session, (str, uuid.UUID)):
            from entities.models import Session

            return Session.objects.filter(id=session).first()
        return session

    def output(self, text: str) -> AsyncSpanContext:
        """Set the output text for this span (call before exiting context)."""
        if self._span:
            self._span.output_text = text
        return self

    def set_metadata(self, **kwargs) -> AsyncSpanContext:
        """Add metadata to this span."""
        if self._span:
            self._span.metadata.update(kwargs)
        return self

    @property
    def span(self) -> Span | None:
        """Access the underlying Span model."""
        return self._span

    @property
    def trace(self) -> Trace | None:
        """Access the underlying Trace model."""
        return self._trace


def async_text_span(
    name: str,
    input: str | None = None,
    metadata: dict | None = None,
    entity: Any | None = None,
    session: Any | None = None,
) -> AsyncSpanContext:
    """
    Create an async text span context manager for use in async code.

    Usage:
        async with async_text_span("answer_question", entity=entity) as span:
            result = await process(input)
            span.output(result)
    """
    return AsyncSpanContext(
        name=name,
        span_type=SpanType.TEXT,
        input_text=input,
        metadata=metadata,
        entity=entity,
        session=session,
    )


def text_span(
    name: str,
    input: str | None = None,
    metadata: dict | None = None,
    entity: Any | None = None,
    session: Any | None = None,
) -> SpanContext:
    """
    Create a text span context manager.

    Args:
        name: Name of the span
        input: Input text
        metadata: Additional metadata
        entity: Entity instance or ID (sets on trace if creating new trace)
        session: Session instance or ID (sets on trace if creating new trace)

    Usage:
        with text_span("answer_question", input="What is 2+2?", entity=entity) as span:
            result = process(input)
            span.output(result)
    """
    return SpanContext(
        name=name,
        span_type=SpanType.TEXT,
        input_text=input,
        metadata=metadata,
        entity=entity,
        session=session,
    )


def audio_span(
    name: str,
    audio_data: bytes | None = None,
    audio_url: str | None = None,
    duration_ms: int | None = None,
    audio_format: str = "mp3",
    metadata: dict | None = None,
    entity: Any | None = None,
    session: Any | None = None,
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
        entity: Entity instance or ID (sets on trace if creating new trace)
        session: Session instance or ID (sets on trace if creating new trace)

    Usage:
        with audio_span("transcribe", audio_data=audio_bytes, session=session) as span:
            transcript = transcribe(audio)
            span.output(transcript)
    """
    return SpanContext(
        name=name,
        span_type=SpanType.AUDIO,
        audio_data=audio_data,
        audio_url=audio_url,
        audio_duration_ms=duration_ms,
        audio_format=audio_format,
        metadata=metadata,
        entity=entity,
        session=session,
    )


def tool_span(
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

    Usage:
        with tool_span("send_sms", input=json.dumps(args)) as span:
            result = send_sms(**args)
            span.output(result)
    """
    return SpanContext(
        name=name,
        span_type=SpanType.TOOL,
        input_text=input,
        metadata=metadata,
    )


def llm_span(
    name: str,
    input: str | None = None,
    metadata: dict | None = None,
    entity: Any | None = None,
    session: Any | None = None,
) -> SpanContext:
    """
    Create an LLM call span context manager.

    Args:
        name: Name of the LLM call (e.g., "openai_api_call", "claude_api_call")
        input: Input to the LLM (prompt, messages, etc.)
        metadata: Additional metadata (model, tokens, etc.)
        entity: Entity instance or ID (sets on trace if creating new trace)
        session: Session instance or ID (sets on trace if creating new trace)

    Usage:
        with llm_span("openai_api_call", input=prompt, entity=entity, metadata={"model": "o3"}) as span:
            response = openai.api.complete(prompt)
            span.output(response)
    """
    return SpanContext(
        name=name,
        span_type=SpanType.LLM,
        input_text=input,
        metadata=metadata,
        entity=entity,
        session=session,
    )


def async_llm_span(
    name: str,
    input: str | None = None,
    metadata: dict | None = None,
    entity: Any | None = None,
    session: Any | None = None,
) -> AsyncSpanContext:
    """
    Create an async LLM call span context manager for use in async code.

    Args:
        name: Name of the LLM call (e.g., "openai_api_call", "claude_api_call")
        input: Input to the LLM (prompt, messages, etc.)
        metadata: Additional metadata (model, tokens, etc.)
        entity: Entity instance or ID (sets on trace if creating new trace)
        session: Session instance or ID (sets on trace if creating new trace)

    Usage:
        async with async_llm_span("openai_api_call", entity=entity, metadata={"model": "o3"}) as span:
            response = await openai.api.complete(prompt)
            span.output(response)
    """
    return AsyncSpanContext(
        name=name,
        span_type=SpanType.LLM,
        input_text=input,
        metadata=metadata,
        entity=entity,
        session=session,
    )


def traced(
    func: F | None = None,
    *,
    name: str | None = None,
    span_type: SpanType = SpanType.FUNCTION,
) -> F | Callable[[F], F]:
    """
    Decorator to trace a function.

    Args:
        func: Function to wrap
        name: Optional span name (defaults to function name)
        span_type: Span type (default: FUNCTION)

    Usage:
        @traced
        def process_question(q: str) -> str:
            return answer

        @traced(name="custom_name", span_type=SpanType.TOOL)
        def my_tool():
            pass
    """

    def decorator(fn: F) -> F:
        span_name = name or fn.__name__

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            # Build input representation
            input_parts = []
            if args:
                input_parts.append(f"args={args}")
            if kwargs:
                input_parts.append(f"kwargs={kwargs}")
            input_text = ", ".join(input_parts) if input_parts else None

            with SpanContext(
                name=span_name,
                span_type=span_type,
                input_text=input_text,
            ) as ctx:
                result = fn(*args, **kwargs)
                if result is not None:
                    ctx.output(str(result))
                return result

        return wrapper  # type: ignore

    if func is not None:
        return decorator(func)
    return decorator


def get_current_span() -> Span | None:
    """Get the current active span, if any."""
    return _current_span.get()


def get_current_trace() -> Trace | None:
    """Get the current active trace, if any."""
    return _current_trace.get()


def get_tracing_context() -> tuple[Trace | None, Span | None]:
    """
    Get the current trace and span context.

    Use this to capture context before calling asyncio.run(), then pass
    it to set_tracing_context() at the start of your async code.

    Returns:
        Tuple of (current_trace, current_span)
    """
    return (_current_trace.get(), _current_span.get())


def set_tracing_context(trace: Trace | None, span: Span | None) -> tuple[Any, Any]:
    """
    Set the trace and span context.

    Use this at the start of async code that was called via asyncio.run()
    to restore the tracing context from the caller.

    Args:
        trace: The trace to set as current
        span: The span to set as current (will be parent for new spans)

    Returns:
        Tuple of tokens that can be used to reset the context later
    """
    trace_token = _current_trace.set(trace) if trace else None
    span_token = _current_span.set(span) if span else None
    return (trace_token, span_token)


def reset_tracing_context(tokens: tuple[Any, Any]) -> None:
    """
    Reset the tracing context using tokens from set_tracing_context().

    Args:
        tokens: The tuple of tokens returned by set_tracing_context()
    """
    trace_token, span_token = tokens
    if trace_token:
        _current_trace.reset(trace_token)
    if span_token:
        _current_span.reset(span_token)
