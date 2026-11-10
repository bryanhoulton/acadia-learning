"""Tests for the spans API (text_span, audio_span, tool_span, @traced)."""

import uuid

from django.contrib.auth.models import User
from django.test import TestCase

from entities.models import Entity
from lms.accounts.models import Account
from tracing.models import Span, SpanType, Trace
from tracing.spans import (
    audio_span,
    get_current_span,
    get_current_trace,
    text_span,
    tool_span,
    traced,
)


def unique_name(prefix: str) -> str:
    """Generate a unique name for test isolation."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


class TextSpanTests(TestCase):
    """Tests for text_span context manager."""

    def test_text_span_creates_trace_and_span(self):
        """Test that text_span creates both a trace and span."""
        span_name = unique_name("test_operation")
        initial_trace_count = Trace.objects.count()
        initial_span_count = Span.objects.count()

        with text_span(span_name, input="test input") as ctx:
            ctx.output("test output")

        # Verify trace was created
        self.assertEqual(Trace.objects.count() - initial_trace_count, 1)
        trace = Trace.objects.get(name=span_name)
        self.assertIsNotNone(trace.ended_at)

        # Verify span was created
        self.assertEqual(Span.objects.count() - initial_span_count, 1)
        span = Span.objects.get(name=span_name)
        self.assertEqual(span.span_type, SpanType.TEXT)
        self.assertEqual(span.input_text, "test input")
        self.assertEqual(span.output_text, "test output")
        self.assertIsNotNone(span.ended_at)

    def test_text_span_with_entity(self):
        """Test that text_span links to entity."""
        span_name = unique_name("entity_operation")
        user = User.objects.create_user(username=unique_name("user"))
        account = Account.objects.create(user=user, account_phone="+15550000002", timezone="UTC")
        entity = Entity.objects.create(name="Test Entity", account=account, timezone="UTC")

        with text_span(span_name, entity=entity) as ctx:
            ctx.output("done")

        trace = Trace.objects.get(name=span_name)
        self.assertEqual(trace.entity, entity)

    def test_text_span_with_entity_id(self):
        """Test that text_span works with entity ID instead of instance."""
        span_name = unique_name("entity_id_operation")
        user = User.objects.create_user(username=unique_name("user"))
        account = Account.objects.create(user=user, account_phone="+15550000003", timezone="UTC")
        entity = Entity.objects.create(name="Test Entity", account=account, timezone="UTC")

        with text_span(span_name, entity=entity.id) as ctx:
            ctx.output("done")

        trace = Trace.objects.get(name=span_name)
        self.assertEqual(trace.entity, entity)

    def test_nested_text_spans(self):
        """Test that nested spans share the same trace and have proper parent relationships."""
        outer_name = unique_name("outer")
        inner_name = unique_name("inner")
        initial_trace_count = Trace.objects.count()
        initial_span_count = Span.objects.count()

        with text_span(outer_name) as outer_ctx:
            outer_ctx.output("outer output")

            with text_span(inner_name) as inner_ctx:
                inner_ctx.output("inner output")

        # Should create only one trace
        self.assertEqual(Trace.objects.count() - initial_trace_count, 1)

        # Should create two spans
        self.assertEqual(Span.objects.count() - initial_span_count, 2)

        outer_span = Span.objects.get(name=outer_name)
        inner_span = Span.objects.get(name=inner_name)

        # Inner span should have outer span as parent
        self.assertEqual(inner_span.parent, outer_span)
        self.assertIsNone(outer_span.parent)

        # Both spans should belong to same trace
        self.assertEqual(outer_span.trace, inner_span.trace)

    def test_text_span_with_metadata(self):
        """Test that metadata is stored correctly."""
        span_name = unique_name("metadata_op")

        with text_span(span_name, metadata={"key": "value"}) as ctx:
            ctx.set_metadata(extra="data")
            ctx.output("done")

        span = Span.objects.get(name=span_name)
        self.assertEqual(span.metadata["key"], "value")
        self.assertEqual(span.metadata["extra"], "data")

    def test_text_span_records_errors(self):
        """Test that exceptions are recorded in span metadata."""
        span_name = unique_name("error_op")

        try:
            with text_span(span_name) as ctx:
                raise ValueError("Test error")
        except ValueError:
            pass

        span = Span.objects.get(name=span_name)
        self.assertIn("error", span.metadata)
        self.assertIn("Test error", span.metadata["error"])


class AudioSpanTests(TestCase):
    """Tests for audio_span context manager."""

    def test_audio_span_with_url(self):
        """Test audio_span with URL."""
        span_name = unique_name("transcription")

        with audio_span(
            span_name,
            audio_url="https://example.com/audio.mp3",
            duration_ms=5000,
        ) as ctx:
            ctx.output("Transcribed text")

        span = Span.objects.get(name=span_name)
        self.assertEqual(span.span_type, SpanType.AUDIO)
        self.assertEqual(span.audio_url, "https://example.com/audio.mp3")
        self.assertEqual(span.audio_duration_ms, 5000)
        self.assertEqual(span.output_text, "Transcribed text")

    def test_audio_span_with_bytes(self):
        """Test audio_span with raw bytes (base64 encoded)."""
        import base64

        span_name = unique_name("voice_input")
        audio_bytes = b"fake audio content here"

        with audio_span(
            span_name,
            audio_data=audio_bytes,
            duration_ms=3000,
            audio_format="wav",
        ) as ctx:
            ctx.output("Voice transcription")

        span = Span.objects.get(name=span_name)
        self.assertEqual(span.span_type, SpanType.AUDIO)
        self.assertEqual(span.audio_format, "wav")
        self.assertEqual(span.audio_duration_ms, 3000)

        # Verify audio data is base64 encoded
        decoded = base64.b64decode(span.audio_data)
        self.assertEqual(decoded, audio_bytes)


class ToolSpanTests(TestCase):
    """Tests for tool_span context manager."""

    def test_tool_span(self):
        """Test tool_span creates correct span type."""
        span_name = unique_name("send_sms")

        with tool_span(span_name, input='{"to": "+1555000000"}') as ctx:
            ctx.output("Message sent successfully")

        span = Span.objects.get(name=span_name)
        self.assertEqual(span.span_type, SpanType.TOOL)
        self.assertEqual(span.input_text, '{"to": "+1555000000"}')
        self.assertEqual(span.output_text, "Message sent successfully")


class TracedDecoratorTests(TestCase):
    """Tests for the @traced decorator."""

    def test_traced_decorator_basic(self):
        """Test @traced decorator creates span for function call."""
        func_name = unique_name("my_function")
        initial_span_count = Span.objects.count()

        @traced(name=func_name)
        def my_function(x, y):
            return x + y

        result = my_function(2, 3)

        self.assertEqual(result, 5)

        # Verify span was created
        self.assertEqual(Span.objects.count() - initial_span_count, 1)
        span = Span.objects.get(name=func_name)
        self.assertEqual(span.span_type, SpanType.FUNCTION)
        self.assertIn("args=(2, 3)", span.input_text)
        self.assertEqual(span.output_text, "5")

    def test_traced_decorator_with_name(self):
        """Test @traced decorator with custom name."""
        custom_name = unique_name("custom_name")

        @traced(name=custom_name)
        def another_function():
            return "hello"

        result = another_function()

        self.assertEqual(result, "hello")

        span = Span.objects.get(name=custom_name)
        self.assertEqual(span.name, custom_name)

    def test_traced_decorator_with_kwargs(self):
        """Test @traced decorator captures kwargs."""
        func_name = unique_name("kwargs_function")

        @traced(name=func_name)
        def kwargs_function(a, b=10):
            return a * b

        result = kwargs_function(5, b=20)

        self.assertEqual(result, 100)

        span = Span.objects.get(name=func_name)
        self.assertIn("args=(5,)", span.input_text)
        self.assertIn("kwargs={'b': 20}", span.input_text)


class CurrentSpanTests(TestCase):
    """Tests for get_current_span and get_current_trace."""

    def test_get_current_span_inside_context(self):
        """Test get_current_span returns the active span."""
        span_name = unique_name("outer_span")

        with text_span(span_name) as ctx:
            current = get_current_span()
            self.assertIsNotNone(current)
            self.assertEqual(current.name, span_name)

    def test_get_current_span_outside_context(self):
        """Test get_current_span returns None outside context."""
        current = get_current_span()
        self.assertIsNone(current)

    def test_get_current_trace_inside_context(self):
        """Test get_current_trace returns the active trace."""
        span_name = unique_name("test_span")

        with text_span(span_name) as ctx:
            current_trace = get_current_trace()
            self.assertIsNotNone(current_trace)
            self.assertEqual(current_trace.name, span_name)

    def test_current_span_changes_with_nesting(self):
        """Test that current span changes with nesting."""
        outer_name = unique_name("outer")
        inner_name = unique_name("inner")

        with text_span(outer_name) as outer_ctx:
            outer_span = get_current_span()
            self.assertEqual(outer_span.name, outer_name)

            with text_span(inner_name) as inner_ctx:
                inner_span = get_current_span()
                self.assertEqual(inner_span.name, inner_name)

            # After inner context exits, current should be outer again
            restored_span = get_current_span()
            self.assertEqual(restored_span.name, outer_name)
