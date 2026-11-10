"""Integration tests for tracing with other modules."""

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

import entities.adapters.documents  # noqa: F401
import entities.adapters.emails  # noqa: F401
import entities.adapters.lms  # noqa: F401
import entities.adapters.sms  # noqa: F401
import entities.adapters.system  # noqa: F401
from entities.adapters import ADAPTER_REGISTRY
from entities.models import Entity
from entities.runtime import EntityRuntime
from lms.accounts.models import Account
from tracing.models import Span, SpanType, Trace
from tracing.spans import text_span


@override_settings(TESTING=True)
class RuntimeTracingIntegrationTests(TestCase):
    """Tests that verify tracing works correctly with EntityRuntime."""

    def test_entity_runtime_creates_traces(self):
        """Test that EntityRuntime creates traces for its execution."""
        user = User.objects.create_user(username="runtime-tracing-user")
        account = Account.objects.create(user=user, account_phone="+15550000020", timezone="UTC")
        entity = Entity.objects.create(
            name="Runtime Tracing Entity",
            account=account,
            timezone="UTC",
            max_messages=1,
            background_model="o4-mini",
            reasoning_effort="medium",
        )
        entity.adapters = sorted(ADAPTER_REGISTRY.keys())
        entity.save(update_fields=["adapters"])

        # Get initial counts
        initial_trace_count = Trace.objects.count()
        initial_span_count = Span.objects.count()

        # Run the entity
        runtime = EntityRuntime(entity)
        runtime.run()

        # Verify traces were created
        new_trace_count = Trace.objects.count() - initial_trace_count
        new_span_count = Span.objects.count() - initial_span_count

        self.assertGreater(new_trace_count, 0, "Expected at least one trace to be created")
        self.assertGreater(new_span_count, 0, "Expected at least one span to be created")

        # Check that traces are linked to the entity
        entity_traces = Trace.objects.filter(entity=entity)
        self.assertGreater(entity_traces.count(), 0, "Expected traces to be linked to entity")

        # Check that we have a run_entity span
        run_entity_spans = Span.objects.filter(trace__entity=entity, name="run_entity")
        self.assertGreater(run_entity_spans.count(), 0, "Expected a 'run_entity' span for the runtime execution")


class SpanContextIntegrationTests(TestCase):
    """Tests for span context behavior in realistic scenarios."""

    def test_deeply_nested_spans(self):
        """Test that deeply nested spans maintain correct relationships."""
        initial_trace_count = Trace.objects.count()
        initial_span_count = Span.objects.count()

        with text_span("level1_nested") as l1:
            l1.output("L1 output")
            with text_span("level2_nested") as l2:
                l2.output("L2 output")
                with text_span("level3_nested") as l3:
                    l3.output("L3 output")
                    with text_span("level4_nested") as l4:
                        l4.output("L4 output")

        # Should have 1 trace and 4 spans
        self.assertEqual(Trace.objects.count() - initial_trace_count, 1)
        self.assertEqual(Span.objects.count() - initial_span_count, 4)

        # Verify hierarchy
        l1_span = Span.objects.get(name="level1_nested")
        l2_span = Span.objects.get(name="level2_nested")
        l3_span = Span.objects.get(name="level3_nested")
        l4_span = Span.objects.get(name="level4_nested")

        self.assertIsNone(l1_span.parent)
        self.assertEqual(l2_span.parent, l1_span)
        self.assertEqual(l3_span.parent, l2_span)
        self.assertEqual(l4_span.parent, l3_span)

    def test_sibling_spans(self):
        """Test that sibling spans share the same parent."""
        with text_span("parent_sibling") as parent_ctx:
            parent_ctx.output("Parent")

            with text_span("child1_sibling") as c1:
                c1.output("Child 1")

            with text_span("child2_sibling") as c2:
                c2.output("Child 2")

            with text_span("child3_sibling") as c3:
                c3.output("Child 3")

        # All children should have the same parent
        parent_span = Span.objects.get(name="parent_sibling")
        child_spans = Span.objects.filter(parent=parent_span)

        self.assertEqual(child_spans.count(), 3)
        self.assertEqual(
            set(child_spans.values_list("name", flat=True)), {"child1_sibling", "child2_sibling", "child3_sibling"}
        )

    def test_exception_in_nested_span_records_error(self):
        """Test that exceptions in nested spans are properly recorded."""
        try:
            with text_span("outer_error_test") as outer:
                outer.output("Outer OK")
                with text_span("inner_error_test") as inner:
                    raise RuntimeError("Inner error")
        except RuntimeError:
            pass

        outer_span = Span.objects.get(name="outer_error_test")
        inner_span = Span.objects.get(name="inner_error_test")

        # Inner span should have error
        self.assertIn("error", inner_span.metadata)
        self.assertIn("Inner error", inner_span.metadata["error"])

        # Both spans should be ended
        self.assertIsNotNone(outer_span.ended_at)
        self.assertIsNotNone(inner_span.ended_at)

    def test_parallel_traces_are_independent(self):
        """Test that traces created in parallel don't interfere."""
        import threading
        import time
        import uuid

        # Use a unique prefix for this test
        test_id = str(uuid.uuid4())[:8]
        initial_trace_count = Trace.objects.count()
        initial_span_count = Span.objects.count()
        results = {}

        def create_trace(name):
            span_name = f"thread_{test_id}_{name}"
            with text_span(span_name) as span:
                span.output(f"Output from {name}")
                time.sleep(0.1)  # Simulate work
                results[name] = Span.objects.filter(name=span_name).count()

        threads = [threading.Thread(target=create_trace, args=(i,)) for i in range(3)]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Each thread should have created exactly one trace and span
        new_traces = Trace.objects.count() - initial_trace_count
        new_spans = Span.objects.count() - initial_span_count
        self.assertEqual(new_traces, 3)
        self.assertEqual(new_spans, 3)

        # Each result should show 1 span created
        for name, count in results.items():
            self.assertEqual(count, 1, f"Thread {name} should have created 1 span")


class SpanTypesIntegrationTests(TestCase):
    """Tests for different span types working together."""

    def test_mixed_span_types_in_trace(self):
        """Test that different span types can coexist in the same trace."""
        from tracing.spans import audio_span, tool_span

        # Track initial counts
        initial_trace_count = Trace.objects.count()
        initial_span_count = Span.objects.count()

        with text_span("main_operation") as main:
            main.output("Starting operation")

            # Simulate voice input
            with audio_span(
                "voice_input",
                audio_url="https://example.com/audio.mp3",
                duration_ms=3000,
            ) as audio:
                audio.output("User said: Hello world")

            # Simulate tool execution
            with tool_span("send_message", input='{"to": "user"}') as tool:
                tool.output("Message sent")

            # Simulate LLM call
            with text_span("llm_response") as llm:
                llm.output("Claude responded with helpful information")

        # Verify single trace with multiple span types
        new_traces = Trace.objects.count() - initial_trace_count
        new_spans = Span.objects.count() - initial_span_count

        self.assertEqual(new_traces, 1, "Expected exactly 1 new trace to be created")
        self.assertEqual(new_spans, 4, "Expected exactly 4 new spans to be created")

        # Get the trace we just created
        main_trace = Trace.objects.get(name="main_operation")

        # Verify span types for our trace
        our_spans = Span.objects.filter(trace=main_trace)
        self.assertEqual(our_spans.filter(span_type=SpanType.TEXT).count(), 2)
        self.assertEqual(our_spans.filter(span_type=SpanType.AUDIO).count(), 1)
        self.assertEqual(our_spans.filter(span_type=SpanType.TOOL).count(), 1)
