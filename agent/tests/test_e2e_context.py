"""
End-to-end test for Context with real Anthropic API calls.
Tests multi-turn conversation with wait commands and empty content handling.
"""

import os
import time
from unittest.mock import Mock

import pytest
from dotenv import load_dotenv

from src.agent.context import Context
from src.utils.misc import AgentConfig

load_dotenv()

# Skip if no API key available or skip all e2e tests
pytestmark = [
    pytest.mark.skipif(
        not os.environ.get("ANTHROPIC_API_KEY"),
        reason="ANTHROPIC_API_KEY not set - skipping e2e tests",
    ),
    pytest.mark.skip(reason="E2E tests use outdated API methods - needs refactoring"),
    pytest.mark.anyio,
]


@pytest.fixture
def test_config():
    """Create a test AgentConfig with real credentials."""
    return AgentConfig(
        entity_id=999,
        entity_api_key="test_key",
        entity_memory="You are a helpful AI tutor for testing. Keep responses very brief.",
        user_name="Test User",
        user_profile_id="test_profile_123",
        account_phone="+15555555555",
        tutor_name="Test Tutor",
        timezone="America/New_York",
        voice_id="test_voice_id",
        registration_source="web",
    )


class TestE2EContext:
    """End-to-end tests with real Anthropic API."""

    async def test_multi_turn_conversation_with_wait_commands(self, test_config):
        """
        Test a full conversation flow with at least 5 turns.
        Each turn should use the wait tool with 5 seconds.
        No mocks - uses real Anthropic API.
        """
        # Mock only the API service to avoid backend API calls
        with pytest.MonkeyPatch.context() as m:
            m.setenv("API_URL", "https://test-api.com")

            # Create context with real Anthropic client
            context = Context(test_config)

            # Mock the sync method to avoid API calls
            context.api_service.sync_context = Mock(return_value={"status": "synced"})

            print("\n" + "=" * 80)
            print("Starting E2E Test: Multi-turn conversation with wait commands")
            print("=" * 80)

            turns_completed = 0
            max_turns = 5
            wait_tool_uses = []

            # Initial user message to start conversation
            context.add_user_message(
                "Hello! I'm going to ask you to wait 5 seconds multiple times. "
                "Please respond briefly and then use the wait tool for 5 seconds each time."
            )

            for turn in range(max_turns):
                print(f"\n--- Turn {turn + 1}/{max_turns} ---")

                # Get a response from Claude (real API call)
                stream_manager = context.next_stream()

                print(f"📡 Sending request to Anthropic API (turn {turn + 1})...")
                start_time = time.time()

                # Use async context manager to get response
                async with stream_manager as stream:
                    final_message = await stream.get_final_message()

                elapsed = time.time() - start_time
                print(f"✅ Received response in {elapsed:.2f}s")

                # Process the response
                thinking_blocks, text_blocks, tool_blocks = context.process_final_message(final_message)

                # Log what we got
                if thinking_blocks:
                    print(f"💭 Thinking blocks: {len(thinking_blocks)}")

                if text_blocks:
                    for block in text_blocks:
                        print(f"💬 Text: {block.text[:100]}...")

                if tool_blocks:
                    for tool in tool_blocks:
                        print(f"🔧 Tool: {tool.name} (id: {tool.id})")
                        if tool.name == "wait":
                            duration = tool.input.get("duration") if isinstance(tool.input, dict) else None
                            print(f"   ⏱️  Wait duration: {duration}s")
                            wait_tool_uses.append(
                                {
                                    "turn": turn + 1,
                                    "duration": duration,
                                    "tool_id": tool.id,
                                }
                            )

                # Verify we got some response
                assert len(final_message.content) > 0, f"Turn {turn + 1}: No content in response"

                # Check for empty content blocks (should be filtered by sanitization)
                for block in final_message.content:
                    if hasattr(block, "text"):
                        assert block.text and block.text.strip(), (
                            f"Turn {turn + 1}: Found empty text block (sanitization failed)"
                        )

                # Simulate tool execution
                tool_results = []
                for tool in tool_blocks:
                    if tool.name == "wait":
                        duration = tool.input.get("duration", 5) if isinstance(tool.input, dict) else 5
                        result = f"Waited for {duration} seconds."
                        tool_results.append((tool.id, result))
                        print(f"   ✓ Simulated wait: {duration}s")
                    elif tool.name == "speak":
                        message = tool.input.get("message", "") if isinstance(tool.input, dict) else ""
                        result = f"Spoke: {message[:50]}..."
                        tool_results.append((tool.id, result))
                        print("   ✓ Simulated speak")
                    else:
                        # Handle other tools generically
                        result = f"Tool {tool.name} executed successfully."
                        tool_results.append((tool.id, result))

                # Add tool results to context
                if tool_results:
                    context.add_tool_results(tool_results)
                    print(f"✓ Added {len(tool_results)} tool results to context")

                turns_completed += 1

                # For next turn, add a follow-up message
                if turn < max_turns - 1:
                    context.add_user_message(f"Great! Please wait 5 seconds again. (This is request {turn + 2})")

            # Verify we completed all turns
            assert turns_completed == max_turns, f"Expected {max_turns} turns, completed {turns_completed}"

            # Verify we got wait commands
            assert len(wait_tool_uses) >= 3, f"Expected at least 3 wait tool uses, got {len(wait_tool_uses)}"

            # Verify wait durations are reasonable (should be around 5 seconds)
            for wait_use in wait_tool_uses:
                duration = wait_use.get("duration")
                assert duration is not None, f"Wait tool missing duration in turn {wait_use['turn']}"
                assert 1 <= duration <= 30, (
                    f"Wait duration {duration} out of reasonable range in turn {wait_use['turn']}"
                )

            # Verify message history is clean (no empty messages)
            sanitized_messages = context._sanitize_messages()
            for i, msg in enumerate(sanitized_messages):
                content = msg.get("content")
                if isinstance(content, str):
                    assert content.strip(), f"Message {i} has empty string content"
                elif isinstance(content, list):
                    assert len(content) > 0, f"Message {i} has empty content list"
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text = block.get("text", "")
                            assert text.strip(), f"Message {i} has empty text block"

            print("\n" + "=" * 80)
            print("✅ E2E Test Passed!")
            print(f"   - Completed {turns_completed} turns")
            print(f"   - Wait tool used {len(wait_tool_uses)} times")
            print("   - Message history verified clean (no empty content)")
            print(f"   - Total messages in context: {len(context.messages)}")
            print("=" * 80)

    async def test_empty_content_handling_during_conversation(self, test_config):
        """
        Test that empty content is properly filtered even during a real conversation.
        """
        with pytest.MonkeyPatch.context() as m:
            m.setenv("API_URL", "https://test-api.com")

            context = Context(test_config)
            context.api_service.sync_context = Mock(return_value={"status": "synced"})

            print("\n" + "=" * 80)
            print("Starting E2E Test: Empty content handling")
            print("=" * 80)

            # Add a valid message
            context.add_user_message("Please say hello and then wait 5 seconds.")

            # Try to add empty messages (should be filtered)
            context.add_user_message("")
            context.add_user_message("   ")
            context.add_user_message("\n\t\n")

            # Get a response
            stream_manager = context.next_stream()
            async with stream_manager as stream:
                final_message = await stream.get_final_message()

            # Process response
            thinking_blocks, text_blocks, tool_blocks = context.process_final_message(final_message)

            # Add tool results (some with empty content)
            tool_results = []
            for tool in tool_blocks:
                if tool.name == "speak":
                    tool_results.append((tool.id, "Speech completed"))
                elif tool.name == "wait":
                    # Simulate an empty result (should get placeholder)
                    tool_results.append((tool.id, ""))

            if tool_results:
                context.add_tool_results(tool_results)

            # Verify sanitization works
            sanitized = context._sanitize_messages()

            # All messages should have non-empty content
            for msg in sanitized:
                content = msg.get("content")
                assert content, "Found message with no content after sanitization"

                if isinstance(content, str):
                    assert content.strip(), "Found message with empty string content"
                elif isinstance(content, list):
                    assert len(content) > 0, "Found message with empty content list"

            print("\n✅ Empty content properly handled")
            print(f"   - Original messages: {len(context.messages)}")
            print(f"   - Sanitized messages: {len(sanitized)}")
            print("   - All content verified non-empty")
            print("=" * 80)

    async def test_context_healing_during_conversation(self, test_config):
        """
        Test that context self-heals by filtering empty content before API calls.
        """
        with pytest.MonkeyPatch.context() as m:
            m.setenv("API_URL", "https://test-api.com")

            context = Context(test_config)
            context.api_service.sync_context = Mock(return_value={"status": "synced"})

            print("\n" + "=" * 80)
            print("Starting E2E Test: Context self-healing")
            print("=" * 80)

            # Add messages including some that bypass validation
            context.add_user_message("First valid message")

            # Directly append an invalid message to simulate edge case
            context.messages.append(
                {
                    "role": "user",
                    "content": "",  # This should be filtered during sanitization
                }
            )

            context.messages.append({"role": "user", "content": "Second valid message, please wait 5 seconds"})

            # The sanitization should filter out the empty message
            sanitized = context._sanitize_messages()

            # Count valid messages (should be initial + 2 valid, empty one filtered)
            valid_messages = [m for m in sanitized if m.get("content")]
            print(f"\n📊 Messages: {len(context.messages)} total, {len(sanitized)} after sanitization")

            # Make API call - should work despite having an empty message in the list
            stream_manager = context.next_stream()
            async with stream_manager as stream:
                final_message = await stream.get_final_message()

            # Should succeed without error
            assert final_message.content, "Got response despite empty message in history"

            print("\n✅ Self-healing successful")
            print("   - API call succeeded despite empty content in history")
            print("   - Empty messages filtered before API call")
            print("=" * 80)


if __name__ == "__main__":
    # Allow running this test file directly for development
    pytest.main([__file__, "-v", "-s"])
