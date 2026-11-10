"""Tests for tracing REST API endpoints."""

import json
import uuid

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from entities.models import Entity
from lms.accounts.models import Account
from tracing.models import Span, SpanType, Trace


def unique_name(prefix: str) -> str:
    """Generate a unique name for test isolation."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


class TracingAPITests(TestCase):
    """Tests for the tracing REST API."""

    def setUp(self):
        self.client = APIClient()

        # Create test entity with unique username
        self.user = User.objects.create_user(username=unique_name("api-test-user"))
        self.account = Account.objects.create(user=self.user, account_phone="+15550000010", timezone="UTC")
        self.entity = Entity.objects.create(name="API Test Entity", account=self.account, timezone="UTC")

        # Authenticate requests with entity API key
        self.client.credentials(HTTP_X_ENTITY_API_KEY=self.entity.api_key)

    def test_create_trace(self):
        """Test creating a trace via API."""
        response = self.client.post(
            "/api/tracing/traces/",
            data=json.dumps({"name": "api_trace", "metadata": {"source": "test"}}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()

        self.assertIn("id", data)
        self.assertEqual(data["name"], "api_trace")
        self.assertEqual(data["metadata"]["source"], "test")

        # Verify in database
        trace = Trace.objects.get(id=data["id"])
        self.assertEqual(trace.name, "api_trace")

    def test_create_trace_with_entity(self):
        """Test creating a trace linked to an entity."""
        response = self.client.post(
            "/api/tracing/traces/",
            data=json.dumps({"name": "entity_trace", "entity_id": self.entity.id}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()

        trace = Trace.objects.get(id=data["id"])
        self.assertEqual(trace.entity, self.entity)

    def test_get_trace(self):
        """Test getting a trace with its spans."""
        trace = Trace.objects.create(name="get_test_trace")
        span1 = Span.objects.create(trace=trace, name="span1", span_type=SpanType.TEXT)
        span2 = Span.objects.create(trace=trace, name="span2", span_type=SpanType.TOOL)

        response = self.client.get(f"/api/tracing/traces/{trace.id}/")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["name"], "get_test_trace")
        self.assertEqual(len(data["spans"]), 2)

    def test_end_trace(self):
        """Test ending a trace."""
        trace = Trace.objects.create(name="end_test_trace")
        self.assertIsNone(trace.ended_at)

        response = self.client.patch(f"/api/tracing/traces/{trace.id}/end/")

        self.assertEqual(response.status_code, 200)

        trace.refresh_from_db()
        self.assertIsNotNone(trace.ended_at)

    def test_create_span(self):
        """Test creating a span via API."""
        response = self.client.post(
            "/api/tracing/spans/",
            data=json.dumps(
                {
                    "name": "api_span",
                    "span_type": "text",
                    "input_text": "Test input",
                    "entity_id": self.entity.id,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()

        self.assertEqual(data["name"], "api_span")
        self.assertEqual(data["span_type"], "text")
        self.assertEqual(data["input_text"], "Test input")

        # Should have created a trace automatically
        span = Span.objects.get(id=data["id"])
        self.assertIsNotNone(span.trace)
        self.assertEqual(span.trace.entity, self.entity)

    def test_create_span_with_existing_trace(self):
        """Test creating a span under an existing trace."""
        trace = Trace.objects.create(name="existing_trace")

        response = self.client.post(
            "/api/tracing/spans/",
            data=json.dumps(
                {
                    "name": "child_span",
                    "span_type": "tool",
                    "trace_id": str(trace.id),
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()

        span = Span.objects.get(id=data["id"])
        self.assertEqual(span.trace, trace)

    def test_create_audio_span(self):
        """Test creating an audio span with base64 data."""
        import base64

        audio_b64 = base64.b64encode(b"fake audio").decode("utf-8")

        response = self.client.post(
            "/api/tracing/spans/",
            data=json.dumps(
                {
                    "name": "voice_span",
                    "span_type": "audio",
                    "audio_data": audio_b64,
                    "audio_duration_ms": 2500,
                    "audio_format": "mp3",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()

        self.assertEqual(data["span_type"], "audio")
        self.assertEqual(data["audio_duration_ms"], 2500)
        self.assertEqual(data["audio_data"], audio_b64)

    def test_update_span(self):
        """Test updating a span with output and ending it."""
        trace = Trace.objects.create(name="update_trace")
        span = Span.objects.create(
            trace=trace,
            name="update_span",
            span_type=SpanType.TEXT,
            input_text="Input",
        )

        response = self.client.patch(
            f"/api/tracing/spans/{span.id}/update/",
            data=json.dumps(
                {
                    "output_text": "Output result",
                    "metadata": {"key": "value"},
                    "ended": True,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)

        span.refresh_from_db()
        self.assertEqual(span.output_text, "Output result")
        self.assertEqual(span.metadata["key"], "value")
        self.assertIsNotNone(span.ended_at)

    def test_get_span(self):
        """Test getting a single span."""
        trace = Trace.objects.create(name="get_span_trace")
        span = Span.objects.create(
            trace=trace,
            name="get_span",
            span_type=SpanType.TOOL,
            input_text="test input",
        )

        response = self.client.get(f"/api/tracing/spans/{span.id}/")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["name"], "get_span")
        self.assertEqual(data["input_text"], "test input")

    def test_list_entity_traces(self):
        """Test listing traces for an entity."""
        # Create traces for this entity
        trace1 = Trace.objects.create(name="entity_trace_1", entity=self.entity)
        trace2 = Trace.objects.create(name="entity_trace_2", entity=self.entity)

        # Create a trace for different entity (should not be returned)
        other_user = User.objects.create_user(username="other-user")
        other_account = Account.objects.create(user=other_user, account_phone="+15550000011", timezone="UTC")
        other_entity = Entity.objects.create(name="Other Entity", account=other_account, timezone="UTC")
        Trace.objects.create(name="other_trace", entity=other_entity)

        response = self.client.get(f"/api/tracing/entities/{self.entity.id}/traces/")

        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Response is paginated with "results" and "pagination" keys
        self.assertIn("results", data)
        self.assertIn("pagination", data)
        self.assertEqual(len(data["results"]), 2)
        trace_names = [t["name"] for t in data["results"]]
        self.assertIn("entity_trace_1", trace_names)
        self.assertIn("entity_trace_2", trace_names)
        self.assertNotIn("other_trace", trace_names)

    def test_create_span_with_parent(self):
        """Test creating a span with a parent span."""
        trace = Trace.objects.create(name="parent_trace")
        parent_span = Span.objects.create(
            trace=trace,
            name="parent",
            span_type=SpanType.FUNCTION,
        )

        response = self.client.post(
            "/api/tracing/spans/",
            data=json.dumps(
                {
                    "name": "child",
                    "span_type": "tool",
                    "trace_id": str(trace.id),
                    "parent_id": str(parent_span.id),
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()

        child_span = Span.objects.get(id=data["id"])
        self.assertEqual(child_span.parent, parent_span)

    def test_reject_parent_from_different_trace(self):
        """Test that creating a span rejects a parent from a different trace."""
        trace1 = Trace.objects.create(name="trace1")
        trace2 = Trace.objects.create(name="trace2")

        # Create a parent span in trace1
        parent_span = Span.objects.create(
            trace=trace1,
            name="parent",
            span_type=SpanType.FUNCTION,
        )

        # Try to create a child span in trace2 with parent from trace1
        response = self.client.post(
            "/api/tracing/spans/",
            data=json.dumps(
                {
                    "name": "child",
                    "span_type": "tool",
                    "trace_id": str(trace2.id),
                    "parent_id": str(parent_span.id),
                }
            ),
            content_type="application/json",
        )

        # Should be rejected with 400
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("error", data)
        self.assertIn("same trace", data["error"])
