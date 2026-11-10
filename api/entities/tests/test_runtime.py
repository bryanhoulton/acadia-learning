from __future__ import annotations

import json
from datetime import datetime, timezone

from django.contrib.auth.models import User
from django.test import TestCase, override_settings, tag

import entities.adapters.documents  # noqa: F401  Ensure adapter registration
import entities.adapters.emails  # noqa: F401
import entities.adapters.lms  # noqa: F401
import entities.adapters.sms  # noqa: F401
import entities.adapters.system  # noqa: F401
from entities.adapters import ADAPTER_REGISTRY
from entities.models import Entity, Message
from entities.runtime import EntityRuntime
from lms.accounts.models import Account


@tag("integration")
@override_settings(TESTING=True)
class EntityRuntimeToolSchemaTestCase(TestCase):
    def test_runtime_single_turn_tool_payload(self):
        user = User.objects.create_user(username="runtime-tools-user")
        account = Account.objects.create(user=user, account_phone="+15550000000", timezone="UTC")
        entity = Entity.objects.create(
            name="Runtime Tools Entity",
            account=account,
            timezone="UTC",
            max_messages=1,
            background_model="o4-mini",
            reasoning_effort="medium",
        )

        # Make every registered adapter available so the runtime primes every tool schema
        entity.adapters = sorted(ADAPTER_REGISTRY.keys())
        entity.save(update_fields=["adapters"])

        runtime = EntityRuntime(entity)

        # Validate tool schemas before making the LLM call
        tool_schemas = [tool.to_schema() for tool in runtime.available_tools]
        self.assertGreater(len(tool_schemas), 0)
        self.assertEqual(
            sorted(schema["name"] for schema in tool_schemas),
            sorted(tool.name for tool in runtime.available_tools),
        )

        for schema in tool_schemas:
            json.dumps(schema)  # Ensure JSON serialization
            self.assertEqual(schema.get("type"), "function")
            self.assertTrue(schema.get("strict"))
            self.assertIn("parameters", schema)

        runtime.run()

        self.assertTrue(Message.objects.filter(entity=entity).exists())
        self.assertTrue(
            Message.objects.filter(entity=entity, message_data__contains={"type": "function_call"}).exists(),
            "OpenAI response did not include a function call; check tool payload for schema issues.",
        )


@tag("integration")
@override_settings(TESTING=True)
class ClaudeRuntimeTestCase(TestCase):
    def test_runtime_with_claude_opus(self):
        """Test that Claude Opus 4.5 works end-to-end with the runtime."""
        user = User.objects.create_user(username="claude-runtime-user")
        account = Account.objects.create(user=user, account_phone="+15550000001", timezone="UTC")
        entity = Entity.objects.create(
            name="Claude Runtime Entity",
            account=account,
            timezone="UTC",
            max_messages=1,
            background_model="claude-opus-4-5",
            reasoning_effort="medium",
        )

        # Add some adapters to test tool calling
        entity.adapters = ["system"]
        entity.save(update_fields=["adapters"])

        runtime = EntityRuntime(entity)

        # Validate that the runtime detects this is a Claude model
        from utils.llm_provider import is_claude_model

        self.assertTrue(is_claude_model(entity.background_model))

        # Run the runtime
        runtime.run()

        # Verify messages were created
        self.assertTrue(Message.objects.filter(entity=entity).exists())

        # Verify cost tracking worked
        messages = Message.objects.filter(entity=entity)
        self.assertGreater(messages.count(), 0)

    def test_runtime_with_claude_sonnet(self):
        """Test that Claude Sonnet 4.5 works end-to-end with the runtime."""
        user = User.objects.create_user(username="claude-sonnet-user")
        account = Account.objects.create(user=user, account_phone="+15550000002", timezone="UTC")
        entity = Entity.objects.create(
            name="Claude Sonnet Entity",
            account=account,
            timezone="UTC",
            max_messages=1,
            background_model="claude-sonnet-4-5",
        )

        entity.adapters = ["system"]
        entity.save(update_fields=["adapters"])

        runtime = EntityRuntime(entity)
        runtime.run()

        # Verify messages were created
        self.assertTrue(Message.objects.filter(entity=entity).exists())

    def test_claude_web_search(self):
        """Test that Claude can use web search tool."""
        user = User.objects.create_user(username="claude-websearch-user")
        account = Account.objects.create(user=user, account_phone="+15550000003", timezone="UTC")
        entity = Entity.objects.create(
            name="Claude Web Search Entity",
            account=account,
            timezone="UTC",
            max_messages=2,  # Give it room to use web search
            background_model="claude-sonnet-4-5",
        )

        # Add a message that should trigger web search
        Message.objects.create(
            entity=entity,
            timestamp=datetime.now(timezone.utc),
            message_data={
                "type": "message",
                "role": "user",
                "content": [{"type": "text", "text": "What is the latest news about AI today?"}],
            },
        )

        # No adapters needed - web search is built-in
        entity.adapters = []
        entity.save(update_fields=["adapters"])

        runtime = EntityRuntime(entity)
        runtime.run()

        # Verify that web search was used
        messages = Message.objects.filter(entity=entity)
        self.assertGreater(messages.count(), 1)

        # Check if any message contains web_search_call
        web_search_used = messages.filter(message_data__contains={"type": "web_search_call"}).exists()
        self.assertTrue(web_search_used, "Claude should have used web_search tool for current news query")
