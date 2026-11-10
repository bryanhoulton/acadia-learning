import os
from unittest.mock import AsyncMock, Mock, patch

import pytest

from src.agent.context import Context
from src.agent.llm import LLMMessage
from src.utils.misc import AgentConfig


class TestContext:
    """Test suite for Context class, focusing on empty content handling."""

    @pytest.fixture
    def mock_config(self):
        """Create a mock AgentConfig for testing."""
        config = Mock(spec=AgentConfig)
        config.entity_id = 123
        config.entity_api_key = "test_key"
        config.user_profile_id = "test_profile"
        config.entity_memory = "Test memory context"
        config.timezone = "America/New_York"
        config.tutor_name = "Test Tutor"
        config.account_phone = "+15555555555"
        config.registration_source = "web"
        config.session_model = "claude-haiku-4-5"
        config.alt_tutor = False
        return config

    @pytest.fixture
    def mock_api_service(self):
        """Mock APIService to avoid real API calls."""
        with patch("src.agent.context.APIService") as mock:
            service_instance = Mock()
            service_instance.sync_context = Mock(return_value={"status": "synced"})
            mock.return_value = service_instance
            yield mock

    @pytest.fixture
    def context(self, mock_config, mock_api_service):
        """Create a Context instance with mocked dependencies."""
        with patch.dict(os.environ, {"API_URL": "https://test-api.com"}):
            return Context(mock_config)

    def test_add_user_message_with_valid_content(self, context):
        """Test adding a user message with valid content."""
        initial_count = len(context.messages)
        context.add_user_message("Hello, this is a test message")

        assert len(context.messages) == initial_count + 1
        assert context.messages[-1].role == "user"
        # Check that the message contains the expected text
        assert context.messages[-1].content == "Hello, this is a test message"

    def test_add_user_message_with_empty_string(self, context):
        """Test that empty string messages are rejected."""
        initial_count = len(context.messages)

        with patch("src.agent.context.logger") as mock_logger:
            context.add_user_message("")

            # Message should not be added
            assert len(context.messages) == initial_count
            # Warning should be logged
            mock_logger.warning.assert_called_once_with("Skipping empty user message")

    def test_add_user_message_with_whitespace_only(self, context):
        """Test that whitespace-only messages are rejected."""
        initial_count = len(context.messages)

        with patch("src.agent.context.logger") as mock_logger:
            context.add_user_message("   \n\t   ")

            # Message should not be added
            assert len(context.messages) == initial_count
            # Warning should be logged
            mock_logger.warning.assert_called_once_with("Skipping empty user message")

    def test_add_user_message_with_none(self, context):
        """Test that None content is handled safely."""
        initial_count = len(context.messages)

        with patch("src.agent.context.logger") as mock_logger:
            # This should handle gracefully
            try:
                context.add_user_message(None)  # type: ignore
                # If it doesn't raise, check that message wasn't added
                assert len(context.messages) == initial_count
            except (TypeError, AttributeError):
                # It's also acceptable to raise an error for None
                pass

    def test_add_tool_results_with_valid_content(self, context):
        """Test adding tool results with valid content."""
        initial_count = len(context.messages)
        tool_results = [
            ("tool_1", "Result from tool 1"),
            ("tool_2", "Result from tool 2"),
        ]

        context.add_tool_results(tool_results)

        assert len(context.messages) == initial_count + 1
        assert context.messages[-1].role == "user"
        assert context.messages[-1].tool_results is not None
        assert len(context.messages[-1].tool_results) == 2

    def test_add_tool_results_with_empty_content(self, context):
        """Test that empty tool results get placeholder text."""
        initial_count = len(context.messages)
        tool_results = [
            ("tool_1", ""),  # Empty string
        ]

        with patch("src.agent.context.logger") as mock_logger:
            context.add_tool_results(tool_results)

            # Message should be added with placeholder
            assert len(context.messages) == initial_count + 1
            result = context.messages[-1].tool_results[0]
            assert result.content == "Tool completed with no output."
            # Warning should be logged
            mock_logger.warning.assert_called_once()

    def test_add_tool_results_with_whitespace_content(self, context):
        """Test that whitespace-only tool results get placeholder text."""
        initial_count = len(context.messages)
        tool_results = [
            ("tool_1", "   \n\t   "),  # Whitespace only
        ]

        with patch("src.agent.context.logger") as mock_logger:
            context.add_tool_results(tool_results)

            # Message should be added with placeholder
            assert len(context.messages) == initial_count + 1
            result = context.messages[-1].tool_results[0]
            assert result.content == "Tool completed with no output."

    def test_add_tool_results_filters_healed_tools(self, context):
        """Test that tool results for healed tools are filtered out."""
        # Mark tool as healed
        context.healed_tool_ids.add("tool_1")

        initial_count = len(context.messages)
        tool_results = [
            ("tool_1", "This should be filtered"),
            ("tool_2", "This should be kept"),
        ]

        context.add_tool_results(tool_results)

        # Only one tool result should be added
        assert len(context.messages) == initial_count + 1
        assert len(context.messages[-1].tool_results) == 1
        assert context.messages[-1].tool_results[0].tool_call_id == "tool_2"
        # Healed tool ID should be removed
        assert "tool_1" not in context.healed_tool_ids

    def test_add_tool_results_with_all_healed_tools(self, context):
        """Test that no message is added when all tools are healed."""
        # Mark both tools as healed
        context.healed_tool_ids.add("tool_1")
        context.healed_tool_ids.add("tool_2")

        initial_count = len(context.messages)
        tool_results = [
            ("tool_1", "Filtered"),
            ("tool_2", "Filtered"),
        ]

        context.add_tool_results(tool_results)

        # No message should be added
        assert len(context.messages) == initial_count

    def test_sanitize_messages_removes_empty_string_content(self, context):
        """Test that _sanitize_messages filters out empty string content."""
        # Add messages directly to bypass validation
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="",
            )
        )
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="Valid message",
            )
        )

        with patch("src.agent.context.logger") as mock_logger:
            sanitized = context._sanitize_messages()

            # Only valid message should remain
            assert len(sanitized) == 2  # Initial message + valid message
            assert all(msg.content for msg in sanitized)
            # Warning should be logged
            mock_logger.warning.assert_called()

    def test_sanitize_messages_removes_whitespace_content(self, context):
        """Test that _sanitize_messages filters out whitespace-only content."""
        # Add messages directly to bypass validation
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="   \n\t   ",
            )
        )
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="Valid message",
            )
        )

        with patch("src.agent.context.logger") as mock_logger:
            sanitized = context._sanitize_messages()

            # Only valid message should remain
            assert len(sanitized) == 2  # Initial message + valid message
            # Warning should be logged
            mock_logger.warning.assert_called()

    def test_sanitize_messages_filters_empty_text_blocks(self, context):
        """Test that messages with list content are preserved as-is (not filtered)."""
        # Add a message with empty text block
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content=[
                    {"type": "text", "text": ""},
                    {"type": "text", "text": "Valid text"},
                    {"type": "tool_use", "id": "tool_1", "name": "test"},
                ],
            )
        )

        sanitized = context._sanitize_messages()

        # Find the assistant message
        assistant_msg = next(m for m in sanitized if m.role == "assistant")

        # List content is preserved as-is
        assert len(assistant_msg.content) == 3
        assert assistant_msg.content[0]["type"] == "text"
        assert assistant_msg.content[1]["text"] == "Valid text"
        assert assistant_msg.content[2]["type"] == "tool_use"

    def test_sanitize_messages_removes_messages_with_no_valid_blocks(self, context):
        """Test that messages with list content are preserved as-is."""
        # Add a message with only empty blocks
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content=[
                    {"type": "text", "text": ""},
                    {"type": "text", "text": "   "},
                ],
            )
        )

        initial_count = len(context._raw_messages)

        sanitized = context._sanitize_messages()

        # Message with list content is preserved
        assert len(sanitized) == initial_count

    def test_sanitize_messages_preserves_tool_results(self, context):
        """Test that list content is preserved as-is."""
        # Add a message with tool results
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content=[
                    {"type": "tool_result", "tool_use_id": "tool_1", "content": "Result"},
                    {"type": "text", "text": ""},  # Preserved as-is
                ],
            )
        )

        sanitized = context._sanitize_messages()

        # Find the user message
        user_msg = next(m for m in sanitized if m.role == "user" and isinstance(m.content, list))

        # List content is preserved as-is
        assert len(user_msg.content) == 2
        assert user_msg.content[0]["type"] == "tool_result"
        assert user_msg.content[1]["type"] == "text"

    def test_sanitize_messages_with_mixed_content(self, context):
        """Test sanitization with a mix of valid and invalid content."""
        # Create a complex scenario
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="Valid user message",
            )
        )
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content=[
                    {"type": "text", "text": "Valid response"},
                    {"type": "text", "text": ""},  # Preserved as-is
                    {"type": "tool_use", "id": "tool_1", "name": "test"},
                ],
            )
        )
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="",  # Should be filtered (empty string)
            )
        )
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content=[
                    {"type": "tool_result", "tool_use_id": "tool_1", "content": "Result"},
                ],
            )
        )

        with patch("src.agent.context.logger") as mock_logger:
            sanitized = context._sanitize_messages()

            # Should have: initial + valid user + assistant + tool result
            # (empty string user message should be removed)
            user_msgs = [m for m in sanitized if m.role == "user"]
            assert len(user_msgs) >= 2
            assert len([m for m in sanitized if m.role == "assistant"]) == 1

            # Find assistant message - list content is preserved as-is
            assistant_msg = next(m for m in sanitized if m.role == "assistant")
            assert len(assistant_msg.content) == 3  # all blocks preserved

            # Warning should be logged for empty string
            mock_logger.warning.assert_called()

    @pytest.mark.asyncio
    async def test_next_stream_uses_sanitized_messages(self, context):
        """Test that stream calls _sanitize_messages before creating stream."""
        # Add a message that would need sanitization
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="",  # This should be sanitized out
            )
        )

        # Mock the provider's stream_complete method
        mock_stream = AsyncMock()
        context.provider.stream_complete = mock_stream

        await context.stream()

        # Verify stream_complete was called
        mock_stream.assert_called_once()

        # Get the messages argument that was passed
        call_kwargs = mock_stream.call_args[1]
        messages_arg = call_kwargs["messages"]

        # Verify empty message was filtered out
        assert all(msg.content or msg.tool_results or msg.tool_calls for msg in messages_arg)
        # Should not contain any empty string content
        for msg in messages_arg:
            if isinstance(msg.content, str):
                assert msg.content.strip() != ""

    def test_sanitize_messages_preserves_all_blocks(self, context):
        """Test that all blocks in list content are preserved as-is."""
        # Add assistant message with thinking block
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content=[
                    {"type": "text", "text": "Here's my response"},
                    {"type": "thinking", "thinking": "Internal reasoning"},
                ],
            )
        )

        sanitized = context._sanitize_messages()

        # Find the assistant message
        assistant_msg = next(m for m in sanitized if m.role == "assistant")

        # All blocks are preserved as-is
        assert len(assistant_msg.content) == 2
        assert assistant_msg.content[0]["type"] == "text"
        assert assistant_msg.content[1]["type"] == "thinking"

    def test_sanitize_messages_preserves_order(self, context):
        """Test that block order is preserved."""
        # Add assistant message with thinking block
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content=[
                    {"type": "thinking", "thinking": "Internal reasoning"},
                    {"type": "text", "text": "Here's my response"},
                ],
            )
        )

        sanitized = context._sanitize_messages()

        # Find the assistant message
        assistant_msg = next(m for m in sanitized if m.role == "assistant")

        # Order is preserved
        assert len(assistant_msg.content) == 2
        assert assistant_msg.content[0]["type"] == "thinking"
        assert assistant_msg.content[1]["type"] == "text"

    def test_sanitize_messages_preserves_single_thinking_block(self, context):
        """Test that messages with a thinking block are preserved."""
        initial_count = len(context._raw_messages)

        # Add assistant message with ONLY a thinking block
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content=[
                    {"type": "thinking", "thinking": "Internal reasoning"},
                ],
            )
        )

        sanitized = context._sanitize_messages()

        # Message is preserved
        assert len(sanitized) == initial_count + 1
        # Find the thinking message
        thinking_msg = next(
            (m for m in sanitized if m.role == "assistant" and isinstance(m.content, list) and len(m.content) == 1),
            None,
        )
        assert thinking_msg is not None
        assert thinking_msg.content[0]["type"] == "thinking"
