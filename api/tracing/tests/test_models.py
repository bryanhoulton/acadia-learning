"""Tests for tracing models."""

from django.contrib.auth.models import User
from django.test import TestCase

from lms.accounts.models import Account
from entities.models import Entity
from tracing.models import Span, SpanType, Trace


class TraceModelTests(TestCase):
    """Tests for the Trace model."""

    def test_create_trace(self):
        """Test creating a basic trace."""
        trace = Trace.objects.create(name="test_trace")

        self.assertIsNotNone(trace.id)
        self.assertEqual(trace.name, "test_trace")
        self.assertIsNotNone(trace.started_at)
        self.assertIsNone(trace.ended_at)
        self.assertEqual(trace.metadata, {})

    def test_trace_with_entity(self):
        """Test creating a trace linked to an entity."""
        user = User.objects.create_user(username="trace-entity-user")
        account = Account.objects.create(user=user, account_phone="+15550000001", timezone="UTC")
        entity = Entity.objects.create(name="Test Entity", account=account, timezone="UTC")

        trace = Trace.objects.create(name="entity_trace", entity=entity)

        self.assertEqual(trace.entity, entity)
        self.assertIn(trace, entity.traces.all())

    def test_trace_with_metadata(self):
        """Test creating a trace with metadata."""
        trace = Trace.objects.create(name="metadata_trace", metadata={"key": "value", "number": 42})

        self.assertEqual(trace.metadata["key"], "value")
        self.assertEqual(trace.metadata["number"], 42)


class SpanModelTests(TestCase):
    """Tests for the Span model."""

    def setUp(self):
        self.trace = Trace.objects.create(name="test_trace")

    def test_create_text_span(self):
        """Test creating a text span."""
        span = Span.objects.create(
            trace=self.trace,
            name="text_span",
            span_type=SpanType.TEXT,
            input_text="Hello, world!",
            output_text="Response text",
        )

        self.assertIsNotNone(span.id)
        self.assertEqual(span.name, "text_span")
        self.assertEqual(span.span_type, SpanType.TEXT)
        self.assertEqual(span.input_text, "Hello, world!")
        self.assertEqual(span.output_text, "Response text")
        self.assertIsNone(span.parent)

    def test_create_audio_span(self):
        """Test creating an audio span."""
        span = Span.objects.create(
            trace=self.trace,
            name="audio_span",
            span_type=SpanType.AUDIO,
            audio_url="https://example.com/audio.mp3",
            audio_duration_ms=5000,
            audio_format="mp3",
            output_text="Transcription text",
        )

        self.assertEqual(span.span_type, SpanType.AUDIO)
        self.assertEqual(span.audio_url, "https://example.com/audio.mp3")
        self.assertEqual(span.audio_duration_ms, 5000)
        self.assertEqual(span.audio_format, "mp3")

    def test_create_tool_span(self):
        """Test creating a tool span."""
        span = Span.objects.create(
            trace=self.trace,
            name="send_sms",
            span_type=SpanType.TOOL,
            input_text='{"to": "+1555000000", "message": "Hello"}',
            output_text="Message sent",
        )

        self.assertEqual(span.span_type, SpanType.TOOL)
        self.assertEqual(span.name, "send_sms")

    def test_nested_spans(self):
        """Test parent-child span relationships."""
        parent_span = Span.objects.create(
            trace=self.trace,
            name="parent_span",
            span_type=SpanType.FUNCTION,
        )

        child_span = Span.objects.create(
            trace=self.trace,
            name="child_span",
            span_type=SpanType.TOOL,
            parent=parent_span,
        )

        grandchild_span = Span.objects.create(
            trace=self.trace,
            name="grandchild_span",
            span_type=SpanType.TEXT,
            parent=child_span,
        )

        self.assertEqual(child_span.parent, parent_span)
        self.assertEqual(grandchild_span.parent, child_span)
        self.assertIn(child_span, parent_span.children.all())
        self.assertIn(grandchild_span, child_span.children.all())

    def test_span_duration(self):
        """Test span duration calculation."""
        from datetime import timedelta

        span = Span.objects.create(
            trace=self.trace,
            name="duration_span",
            span_type=SpanType.TEXT,
        )

        # Duration should be None when ended_at is not set
        self.assertIsNone(span.duration_ms)

        # Set ended_at
        span.ended_at = span.started_at + timedelta(milliseconds=1500)
        span.save()

        self.assertEqual(span.duration_ms, 1500)

    def test_span_with_base64_audio(self):
        """Test creating a span with base64 audio data."""
        import base64

        audio_bytes = b"fake audio data"
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        span = Span.objects.create(
            trace=self.trace,
            name="base64_audio_span",
            span_type=SpanType.AUDIO,
            audio_data=audio_b64,
            audio_duration_ms=1200,
        )

        self.assertEqual(span.audio_data, audio_b64)
        # Verify we can decode it back
        decoded = base64.b64decode(span.audio_data)
        self.assertEqual(decoded, audio_bytes)
