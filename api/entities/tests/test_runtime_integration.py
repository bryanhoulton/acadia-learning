"""
Full integration tests for EntityRuntime with OpenAI and Claude.

These tests hit real APIs and go through the complete flow:
Entity → DRM/Memory → Runtime → LLM Adapter → API → Response → Message logging

Run with: uv run python manage.py test entities.tests.test_runtime_integration --tag=slow
"""

from datetime import datetime, timedelta, timezone

from django.contrib.auth.models import User
from django.test import TestCase, override_settings, tag

from entities.models import Entity, Message
from entities.runtime import EntityRuntime
from lms.accounts.models import Account
from utils.llm_provider import is_claude_model


@tag("slow")
@override_settings(TESTING=True)
class OpenAIRuntimeIntegrationTest(TestCase):
    """Full integration test for OpenAI gpt-5.2 through the runtime."""

    def setUp(self):
        self.user = User.objects.create_user(username="openai-integration-user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15559990001",
            timezone="America/New_York",
        )
        self.entity = Entity.objects.create(
            name="OpenAI Integration Entity",
            account=self.account,
            timezone="America/New_York",
            max_messages=2,
            background_model="gpt-5.2",
            reasoning_effort="low",
            adapters=["system"],
        )

    def test_full_runtime_flow(self):
        """Test complete flow: entity → runtime → LLM → response → message logging."""
        now = datetime.now(timezone.utc)
        Message.objects.create(
            entity=self.entity,
            timestamp=now - timedelta(hours=1),
            message_data={
                "type": "message",
                "role": "user",
                "content": "Remember that my favorite color is blue.",
            },
        )
        Message.objects.create(
            entity=self.entity,
            timestamp=now,
            message_data={
                "type": "message",
                "role": "user",
                "content": "What is my favorite color?",
            },
        )

        initial_count = Message.objects.filter(entity=self.entity).count()

        self.entity.wake()  # Set status to RUNNING (normally done by possibly_run_entity)
        runtime = EntityRuntime(self.entity)
        runtime.run()

        final_count = Message.objects.filter(entity=self.entity).count()
        self.assertGreater(final_count, initial_count)

    def test_request_structure(self):
        """Verify the runtime builds LLMRequest with correct structure."""
        runtime = EntityRuntime(self.entity)
        request = runtime._build_llm_request()

        # Should have system parts with cacheable and non-cacheable
        cacheable = [p for p in request.system_parts if p.cacheable]
        dynamic = [p for p in request.system_parts if not p.cacheable]

        self.assertGreater(len(cacheable), 0)
        self.assertGreater(len(dynamic), 0)
        self.assertGreater(len(request.tools), 0)

    def test_tool_calls_logged(self):
        """Verify that tool calls are properly logged."""
        Message.objects.create(
            entity=self.entity,
            timestamp=datetime.now(timezone.utc),
            message_data={
                "type": "message",
                "role": "user",
                "content": "Go to sleep now. Use the sleep tool.",
            },
        )

        self.entity.wake()  # Set status to RUNNING (normally done by possibly_run_entity)
        runtime = EntityRuntime(self.entity)
        runtime.run()

        function_calls = Message.objects.filter(
            entity=self.entity,
            message_data__type="function_call",
        )
        self.assertTrue(function_calls.exists())


@tag("slow")
@override_settings(TESTING=True)
class ClaudeSonnetRuntimeIntegrationTest(TestCase):
    """Full integration test for Claude Sonnet 4.5 through the runtime."""

    def setUp(self):
        self.user = User.objects.create_user(username="claude-sonnet-user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15559990002",
            timezone="America/Los_Angeles",
        )
        self.entity = Entity.objects.create(
            name="Claude Sonnet Entity",
            account=self.account,
            timezone="America/Los_Angeles",
            max_messages=2,
            background_model="claude-sonnet-4-5",
            adapters=["system"],
        )

    def test_full_runtime_flow(self):
        """Test complete flow: entity → runtime → Claude → response → message logging."""
        now = datetime.now(timezone.utc)
        Message.objects.create(
            entity=self.entity,
            timestamp=now - timedelta(hours=1),
            message_data={
                "type": "message",
                "role": "user",
                "content": "My name is Alice.",
            },
        )
        Message.objects.create(
            entity=self.entity,
            timestamp=now,
            message_data={
                "type": "message",
                "role": "user",
                "content": "What was my name?",
            },
        )

        self.assertTrue(is_claude_model(self.entity.background_model))

        initial_count = Message.objects.filter(entity=self.entity).count()

        self.entity.wake()  # Set status to RUNNING (normally done by possibly_run_entity)
        runtime = EntityRuntime(self.entity)
        runtime.run()

        final_count = Message.objects.filter(entity=self.entity).count()
        self.assertGreater(final_count, initial_count)

    def test_tool_calls_logged(self):
        """Verify Claude tool calls are converted and logged."""
        Message.objects.create(
            entity=self.entity,
            timestamp=datetime.now(timezone.utc),
            message_data={
                "type": "message",
                "role": "user",
                "content": "Go to sleep now. Use the sleep tool.",
            },
        )

        self.entity.wake()  # Set status to RUNNING (normally done by possibly_run_entity)
        runtime = EntityRuntime(self.entity)
        runtime.run()

        function_calls = Message.objects.filter(
            entity=self.entity,
            message_data__type="function_call",
        )
        self.assertTrue(function_calls.exists())

        call = function_calls.first()
        self.assertIn("name", call.message_data)
        self.assertIn("call_id", call.message_data)

    def test_cacheable_system_parts(self):
        """Test that Claude runtime builds cacheable system parts correctly."""
        runtime = EntityRuntime(self.entity)
        request = runtime._build_llm_request()

        cacheable = [p for p in request.system_parts if p.cacheable]
        dynamic = [p for p in request.system_parts if not p.cacheable]

        self.assertGreater(len(cacheable), 0)
        self.assertGreater(len(dynamic), 0)


@tag("slow")
@override_settings(TESTING=True)
class ClaudeOpusRuntimeIntegrationTest(TestCase):
    """Full integration test for Claude Opus 4.5 with extended thinking."""

    def setUp(self):
        self.user = User.objects.create_user(username="claude-opus-user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15559990003",
            timezone="UTC",
        )
        self.entity = Entity.objects.create(
            name="Claude Opus Entity",
            account=self.account,
            timezone="UTC",
            max_messages=1,
            background_model="claude-opus-4-5",
            adapters=["system"],
        )

    def test_full_runtime_flow(self):
        """Test complete flow with Opus."""
        Message.objects.create(
            entity=self.entity,
            timestamp=datetime.now(timezone.utc),
            message_data={
                "type": "message",
                "role": "user",
                "content": "What is 15 * 17?",
            },
        )

        initial_count = Message.objects.filter(entity=self.entity).count()

        self.entity.wake()  # Set status to RUNNING (normally done by possibly_run_entity)
        runtime = EntityRuntime(self.entity)
        runtime.run()

        final_count = Message.objects.filter(entity=self.entity).count()
        self.assertGreater(final_count, initial_count)

    def test_extended_thinking_logged(self):
        """Verify that Opus extended thinking is captured and logged."""
        Message.objects.create(
            entity=self.entity,
            timestamp=datetime.now(timezone.utc),
            message_data={
                "type": "message",
                "role": "user",
                "content": "Think carefully: What is 15 * 17?",
            },
        )

        self.entity.wake()  # Set status to RUNNING (normally done by possibly_run_entity)
        runtime = EntityRuntime(self.entity)
        runtime.run()

        reasoning_messages = Message.objects.filter(
            entity=self.entity,
            message_data__type="reasoning",
        )

        self.assertTrue(reasoning_messages.exists(), "Opus should produce reasoning messages")

        reasoning = reasoning_messages.first()
        self.assertEqual(reasoning.message_data["type"], "reasoning")

        # Verify thinking content is actually saved (not just a placeholder summary)
        self.assertIn("content", reasoning.message_data, "Thinking content should be saved")
        self.assertIsInstance(reasoning.message_data["content"], str)
        self.assertGreater(len(reasoning.message_data["content"]), 10, "Thinking content should not be empty")
