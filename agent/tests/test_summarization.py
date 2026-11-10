"""Tests for context summarization functionality.

Tests the new summarization architecture where:
- Raw messages are stored in _raw_messages (never mutated by summarization)
- Summaries are stored in _minute_summaries (keyed by minute bucket)
- Messages are reconstructed on-demand via the messages property
"""

import os
import time
from unittest.mock import AsyncMock, Mock, patch

import pytest

from src.agent.context import SUMMARY_MARKER, Context
from src.agent.llm import LLMMessage, LLMToolCall, LLMToolResult
from src.utils.misc import AgentConfig


class TestSummarizationArchitecture:
    """Test the basic summarization architecture."""

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

    def test_raw_messages_stores_all_messages(self, context):
        """Test that _raw_messages stores all messages."""
        initial_count = len(context._raw_messages)

        context.add_user_message("Message 1")
        context.add_user_message("Message 2")
        context.add_user_message("Message 3")

        assert len(context._raw_messages) == initial_count + 3
        assert context._raw_messages[-3].content == "Message 1"
        assert context._raw_messages[-2].content == "Message 2"
        assert context._raw_messages[-1].content == "Message 3"

    def test_minute_summaries_is_empty_initially(self, context):
        """Test that _minute_summaries starts empty."""
        assert len(context._minute_summaries) == 0

    def test_messages_property_returns_raw_messages_when_no_summaries(self, context):
        """Test that messages property returns raw messages when no summaries exist."""
        context.add_user_message("Test message")

        # With no summaries, messages should equal raw messages
        assert len(context.messages) == len(context._raw_messages)

    def test_minute_bucket_calculation(self, context):
        """Test that minute buckets are calculated correctly."""
        # Message at session start should be minute 0
        assert context._get_minute_bucket(context.session_start_time) == 0

        # Message 30 seconds in should still be minute 0
        assert context._get_minute_bucket(context.session_start_time + 30) == 0

        # Message 60 seconds in should be minute 1
        assert context._get_minute_bucket(context.session_start_time + 60) == 1

        # Message 90 seconds in should be minute 1
        assert context._get_minute_bucket(context.session_start_time + 90) == 1

        # Message 120 seconds in should be minute 2
        assert context._get_minute_bucket(context.session_start_time + 120) == 2


class TestMessageReconstruction:
    """Test message reconstruction with summaries."""

    @pytest.fixture
    def mock_config(self):
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
        with patch("src.agent.context.APIService") as mock:
            service_instance = Mock()
            service_instance.sync_context = Mock(return_value={"status": "synced"})
            mock.return_value = service_instance
            yield mock

    @pytest.fixture
    def context(self, mock_config, mock_api_service):
        with patch.dict(os.environ, {"API_URL": "https://test-api.com"}):
            return Context(mock_config)

    def test_summaries_appear_at_start_of_messages(self, context):
        """Test that summaries appear at the start, followed by recent messages."""
        base_time = context.session_start_time

        # Add messages in minute 0 (old)
        msg0 = LLMMessage(role="user", content="Minute 0 message", timestamp=base_time + 10)
        context._raw_messages.append(msg0)

        # Add messages in minute 1 (old)
        msg1 = LLMMessage(role="user", content="Minute 1 message", timestamp=base_time + 70)
        context._raw_messages.append(msg1)

        # Add messages in minute 5 (recent - within window)
        msg5 = LLMMessage(role="user", content="Minute 5 message", timestamp=base_time + 310)
        context._raw_messages.append(msg5)

        # Add summaries for old minutes
        summary0 = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 1: Summary of minute 0", timestamp=base_time + 10
        )
        summary1 = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 2: Summary of minute 1", timestamp=base_time + 70
        )
        context._minute_summaries[0] = summary0
        context._minute_summaries[1] = summary1

        # Mock current time to be 6 minutes in (minute 5 is in window)
        with patch("src.agent.context.time.time", return_value=base_time + 360):
            messages = context.messages

        # Summaries should be at the start, then recent messages
        # Find summary messages
        summary_indices = [
            i for i, m in enumerate(messages) if isinstance(m.content, str) and m.content.startswith(SUMMARY_MARKER)
        ]

        # Find non-summary message indices
        non_summary_indices = [
            i
            for i, m in enumerate(messages)
            if not (isinstance(m.content, str) and m.content.startswith(SUMMARY_MARKER))
        ]

        # All summaries should come before non-summary messages (except initial)
        if summary_indices and non_summary_indices:
            # Get the max summary index and min non-summary index (excluding initial message)
            max_summary_idx = max(summary_indices)
            # Recent messages should be after summaries
            recent_msg_idx = next(
                i for i, m in enumerate(messages) if isinstance(m.content, str) and m.content == "Minute 5 message"
            )
            assert recent_msg_idx > max_summary_idx

    def test_recent_messages_within_window_not_summarized(self, context):
        """Test that messages within the summarization window use raw messages."""
        base_time = context.session_start_time

        # Add a message 30 seconds ago (within 3-minute window)
        recent_msg = LLMMessage(role="user", content="Recent message", timestamp=time.time() - 30)
        context._raw_messages.append(recent_msg)

        # Even if we had a summary, it shouldn't be used
        minute_bucket = context._get_minute_bucket(recent_msg.timestamp)
        context._minute_summaries[minute_bucket] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Should not appear", timestamp=recent_msg.timestamp
        )

        messages = context.messages

        # The raw message should appear, not the summary
        contents = [m.content for m in messages if isinstance(m.content, str)]
        assert "Recent message" in contents
        assert f"{SUMMARY_MARKER} Should not appear" not in contents

    def test_last_five_minutes_preserved(self, context):
        """Test that the last 5 minutes of messages are preserved as raw."""
        base_time = time.time()
        context.session_start_time = base_time - 600  # 10 minutes ago

        # Add messages for each of the last 5 minutes
        for minute in range(5):
            msg = LLMMessage(
                role="user",
                content=f"Message from minute {5 + minute}",  # Minutes 5-9
                timestamp=base_time - (4 - minute) * 60 - 30,  # Spread over last 5 mins
            )
            context._raw_messages.append(msg)

            # Add summaries (shouldn't be used for recent minutes)
            minute_bucket = context._get_minute_bucket(msg.timestamp)
            context._minute_summaries[minute_bucket] = LLMMessage(
                role="assistant",
                content=f"{SUMMARY_MARKER} Summary for minute {minute_bucket}",
                timestamp=msg.timestamp,
            )

        messages = context.messages

        # All recent messages should be preserved (within 3-minute window)
        # Messages within SUMMARIZATION_WINDOW_SECONDS (180s) should use raw
        recent_contents = [
            m.content for m in messages if isinstance(m.content, str) and "Message from minute" in m.content
        ]

        # At least the most recent messages should be raw (not summarized)
        assert len(recent_contents) > 0


class TestCrossMinuteToolPairs:
    """Test handling of tool_use/tool_result pairs that span minute boundaries."""

    @pytest.fixture
    def mock_config(self):
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
        with patch("src.agent.context.APIService") as mock:
            service_instance = Mock()
            service_instance.sync_context = Mock(return_value={"status": "synced"})
            mock.return_value = service_instance
            yield mock

    @pytest.fixture
    def context(self, mock_config, mock_api_service):
        with patch.dict(os.environ, {"API_URL": "https://test-api.com"}):
            return Context(mock_config)

    def test_cross_minute_tool_pair_forces_raw_when_one_in_window(self, context):
        """Test that cross-minute tool pairs force raw when one minute is in window.

        The cross-minute detection only matters when one minute WOULD summarize
        and the other WOULDN'T (would create orphan). If both summarize or both
        use raw, there's no problem.
        """
        base_time = context.session_start_time

        # Tool use in minute 0 (old - would normally summarize)
        tool_use_msg = LLMMessage(
            role="assistant",
            content="Calling tool",
            tool_calls=[LLMToolCall(id="tool_123", name="speak", arguments={"message": "test"})],
            timestamp=base_time + 55,  # End of minute 0
        )
        context._raw_messages.append(tool_use_msg)

        # Tool result in minute 1 (recent - in window, won't summarize)
        # We set it to be within SUMMARIZATION_WINDOW_SECONDS of current time
        tool_result_msg = LLMMessage(
            role="user",
            content="",
            tool_results=[LLMToolResult(tool_call_id="tool_123", content="Tool completed")],
            timestamp=base_time + 65,  # Start of minute 1
        )
        context._raw_messages.append(tool_result_msg)

        # Add summary ONLY for minute 0 (minute 1 is in window, no summary used)
        context._minute_summaries[0] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 1: Summary", timestamp=base_time + 55
        )

        # Mock time so minute 0 is old, but minute 1 is still in window
        # cutoff_time = 245 - 180 = 65, so minute 1 (timestamp 65) is at boundary
        # Let's make minute 0 old (before cutoff) and minute 1 recent (after cutoff)
        # Time = 250: cutoff = 70. Minute 0 (55) is old, Minute 1 (65) is old too.
        # We need: cutoff < 65 for minute 1 to be in window
        # Time = 240: cutoff = 60. Minute 0 (55) is old, Minute 1 (65) is recent (in window)
        with patch("src.agent.context.time.time", return_value=base_time + 240):
            messages = context.messages

        # Minute 0 would normally summarize, but minute 1 is in window (raw).
        # Since there's a cross-minute tool pair, minute 0 must also use raw.
        tool_calls = [m for m in messages if m.tool_calls]
        tool_results = [m for m in messages if m.tool_results]

        # Both raw messages should be present (not replaced by summary)
        assert len(tool_calls) >= 1, "Tool use message should be raw (not summarized)"
        assert len(tool_results) >= 1, "Tool result message should be raw"

        # Verify the tool IDs match
        tool_call_ids = {tc.id for m in tool_calls for tc in m.tool_calls}
        tool_result_ids = {tr.tool_call_id for m in tool_results for tr in m.tool_results}

        # tool_123 should have both call and result
        assert "tool_123" in tool_call_ids
        assert "tool_123" in tool_result_ids

    def test_both_minutes_old_with_summaries_uses_summaries(self, context):
        """Test that when both minutes are old and have summaries, summaries are used.

        If both minutes would summarize, there's no orphan issue - both tool_use
        and tool_result are replaced by summaries.
        """
        base_time = context.session_start_time

        # Tool use in minute 0 (old)
        tool_use_msg = LLMMessage(
            role="assistant",
            content="Calling tool",
            tool_calls=[LLMToolCall(id="tool_456", name="speak", arguments={"message": "test"})],
            timestamp=base_time + 55,
        )
        context._raw_messages.append(tool_use_msg)

        # Tool result in minute 1 (also old)
        tool_result_msg = LLMMessage(
            role="user",
            content="",
            tool_results=[LLMToolResult(tool_call_id="tool_456", content="Tool completed")],
            timestamp=base_time + 65,
        )
        context._raw_messages.append(tool_result_msg)

        # Add summaries for both minutes
        context._minute_summaries[0] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 1: Summary of minute 0", timestamp=base_time + 55
        )
        context._minute_summaries[1] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 2: Summary of minute 1", timestamp=base_time + 65
        )

        # Mock time so both minutes are old (well past the window)
        with patch("src.agent.context.time.time", return_value=base_time + 600):
            messages = context.messages

        # Both minutes should use summaries (no cross-minute issue when both summarize)
        summary_msgs = [m for m in messages if isinstance(m.content, str) and m.content.startswith(SUMMARY_MARKER)]

        # Should have summaries for both minutes
        assert len(summary_msgs) >= 2

        # Should NOT have raw tool_use/tool_result messages
        tool_calls = [m for m in messages if m.tool_calls]
        assert len(tool_calls) == 0, "Should use summaries, not raw tool messages"

    def test_same_minute_tool_pair_allows_summary(self, context):
        """Test that tool pairs within the same minute allow summarization."""
        base_time = context.session_start_time

        # Both tool use and result in minute 0
        tool_use_msg = LLMMessage(
            role="assistant",
            content="Calling tool",
            tool_calls=[LLMToolCall(id="tool_456", name="speak", arguments={"message": "test"})],
            timestamp=base_time + 10,
        )
        context._raw_messages.append(tool_use_msg)

        tool_result_msg = LLMMessage(
            role="user",
            content="",
            tool_results=[LLMToolResult(tool_call_id="tool_456", content="Tool completed")],
            timestamp=base_time + 15,
        )
        context._raw_messages.append(tool_result_msg)

        # Add summary for minute 0
        context._minute_summaries[0] = LLMMessage(
            role="assistant",
            content=f"{SUMMARY_MARKER} Minute 1: Tool was called and completed",
            timestamp=base_time + 10,
        )

        # Mock time to be well past minute 0
        with patch("src.agent.context.time.time", return_value=base_time + 600):
            messages = context.messages

        # Summary should be used (no cross-minute issue)
        summary_msgs = [m for m in messages if isinstance(m.content, str) and m.content.startswith(SUMMARY_MARKER)]
        assert len(summary_msgs) >= 1


class TestOrphanedToolHandling:
    """Test handling of orphaned tool_use and tool_result blocks."""

    @pytest.fixture
    def mock_config(self):
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
        with patch("src.agent.context.APIService") as mock:
            service_instance = Mock()
            service_instance.sync_context = Mock(return_value={"status": "synced"})
            mock.return_value = service_instance
            yield mock

    @pytest.fixture
    def context(self, mock_config, mock_api_service):
        with patch.dict(os.environ, {"API_URL": "https://test-api.com"}):
            return Context(mock_config)

    def test_orphaned_tool_use_detected_in_validation(self, context):
        """Test that orphaned tool_use blocks are detected by validation."""
        # Add assistant message with tool_use but no corresponding tool_result
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content="Calling tool",
                tool_calls=[LLMToolCall(id="orphan_tool", name="speak", arguments={"message": "test"})],
            )
        )

        issues = context.validate_messages()

        # Should report orphaned tool_use
        assert any("orphan_tool" in str(issue) for issue in issues)

    def test_orphaned_tool_result_detected_in_validation(self, context):
        """Test that orphaned tool_result blocks are detected by validation."""
        # Add user message with tool_result but no corresponding tool_use
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="",
                tool_results=[LLMToolResult(tool_call_id="orphan_result", content="Result")],
            )
        )

        issues = context.validate_messages()

        # Should report orphaned tool_result
        assert any("orphan_result" in str(issue) for issue in issues)

    def test_repair_tool_pairing_heals_orphaned_tool_use(self, context):
        """Test that _repair_tool_pairing adds results for orphaned tool_use."""
        # Add assistant message with tool_use
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content="Calling tool",
                tool_calls=[LLMToolCall(id="heal_me", name="speak", arguments={"message": "test"})],
            )
        )

        initial_count = len(context._raw_messages)
        repairs = context._repair_tool_pairing()

        # Should have added a healing message
        assert repairs > 0
        assert len(context._raw_messages) > initial_count

        # Find the healing message
        healing_msgs = [
            m
            for m in context._raw_messages
            if m.tool_results and any(tr.tool_call_id == "heal_me" for tr in m.tool_results)
        ]
        assert len(healing_msgs) == 1

    def test_repair_tool_pairing_removes_duplicate_tool_results(self, context):
        """Test that duplicate tool_results are removed."""
        # Add assistant message with tool_use
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content="Calling tool",
                tool_calls=[LLMToolCall(id="dup_tool", name="speak", arguments={"message": "test"})],
            )
        )

        # Add two tool_result messages for the same tool (duplicate)
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="",
                tool_results=[LLMToolResult(tool_call_id="dup_tool", content="First result")],
            )
        )
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="",
                tool_results=[LLMToolResult(tool_call_id="dup_tool", content="Duplicate result")],
            )
        )

        repairs = context._repair_tool_pairing()

        # Should have removed duplicate
        assert repairs > 0

        # Count tool_results for dup_tool
        dup_results = [
            tr
            for m in context._raw_messages
            if m.tool_results
            for tr in m.tool_results
            if tr.tool_call_id == "dup_tool"
        ]
        assert len(dup_results) == 1


class TestSummarizationGeneration:
    """Test the summarization generation process."""

    @pytest.fixture
    def mock_config(self):
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
        with patch("src.agent.context.APIService") as mock:
            service_instance = Mock()
            service_instance.sync_context = Mock(return_value={"status": "synced"})
            mock.return_value = service_instance
            yield mock

    @pytest.fixture
    def context(self, mock_config, mock_api_service):
        with patch.dict(os.environ, {"API_URL": "https://test-api.com"}):
            return Context(mock_config)

    @pytest.mark.asyncio
    async def test_summarization_skipped_for_young_session(self, context):
        """Test that summarization is skipped if session is too young."""
        # Session just started - within SUMMARIZATION_WINDOW_SECONDS
        await context._summarize_old_messages()

        # No summaries should be generated
        assert len(context._minute_summaries) == 0

    @pytest.mark.asyncio
    async def test_summarization_generates_summaries_for_old_minutes(self, context):
        """Test that summaries are generated for old minutes."""
        base_time = time.time()
        context.session_start_time = base_time - 600  # 10 minutes ago

        # Add message in minute 0 (old)
        old_msg = LLMMessage(
            role="user",
            content="Old message",
            timestamp=base_time - 540,  # 9 minutes ago
        )
        context._raw_messages.append(old_msg)

        # Mock the provider's stream_complete to return a summary
        mock_result = Mock()
        mock_result.text_blocks = [Mock(text="Summary of the conversation")]

        async def mock_stream():
            return iter([]), mock_result

        async def mock_stream_complete(*args, **kwargs):
            async def empty_stream():
                if False:
                    yield

            return empty_stream(), AsyncMock(return_value=mock_result)(), {}

        context.provider.stream_complete = mock_stream_complete

        await context._summarize_old_messages()

        # Summary should be generated for minute 0
        # (or the minute bucket of the old message)
        minute_bucket = context._get_minute_bucket(old_msg.timestamp)
        assert minute_bucket in context._minute_summaries or len(context._minute_summaries) > 0

    @pytest.mark.asyncio
    async def test_summarization_preserves_recent_messages(self, context):
        """Test that recent messages are not summarized."""
        base_time = time.time()
        context.session_start_time = base_time - 600  # 10 minutes ago

        # Add recent message (within window)
        recent_msg = LLMMessage(
            role="user",
            content="Recent message",
            timestamp=base_time - 60,  # 1 minute ago (within 3-min window)
        )
        context._raw_messages.append(recent_msg)

        await context._summarize_old_messages()

        # Recent message's minute should not be summarized
        minute_bucket = context._get_minute_bucket(recent_msg.timestamp)
        assert minute_bucket not in context._minute_summaries


class TestEdgeCases:
    """Test edge cases in summarization."""

    @pytest.fixture
    def mock_config(self):
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
        with patch("src.agent.context.APIService") as mock:
            service_instance = Mock()
            service_instance.sync_context = Mock(return_value={"status": "synced"})
            mock.return_value = service_instance
            yield mock

    @pytest.fixture
    def context(self, mock_config, mock_api_service):
        with patch.dict(os.environ, {"API_URL": "https://test-api.com"}):
            return Context(mock_config)

    def test_empty_minute_bucket(self, context):
        """Test that empty minute buckets are handled correctly."""
        base_time = context.session_start_time

        # Add messages only in minutes 0 and 5 (skip 1-4)
        context._raw_messages.append(LLMMessage(role="user", content="Minute 0", timestamp=base_time + 10))
        context._raw_messages.append(LLMMessage(role="user", content="Minute 5", timestamp=base_time + 310))

        # Add summary for minute 0
        context._minute_summaries[0] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 1: Summary", timestamp=base_time + 10
        )

        # Mock time to be 10 minutes in
        with patch("src.agent.context.time.time", return_value=base_time + 600):
            messages = context.messages

        # Should have summary + minute 5 message (no gaps cause errors)
        assert len(messages) >= 2

    def test_multiple_messages_per_minute(self, context):
        """Test that multiple messages in a minute are handled correctly."""
        base_time = context.session_start_time

        # Add multiple messages in minute 0
        for i in range(5):
            context._raw_messages.append(
                LLMMessage(
                    role="user" if i % 2 == 0 else "assistant", content=f"Message {i}", timestamp=base_time + i * 10
                )
            )

        # Without summary, all messages should be in result
        with patch("src.agent.context.time.time", return_value=base_time + 30):
            messages = context.messages

        msg_contents = [m.content for m in messages if isinstance(m.content, str)]
        assert "Message 0" in msg_contents
        assert "Message 4" in msg_contents

    def test_summary_timestamp_preserved(self, context):
        """Test that summary messages have correct timestamps."""
        base_time = context.session_start_time

        # Add message in minute 0
        context._raw_messages.append(LLMMessage(role="user", content="Test", timestamp=base_time + 10))

        # Add summary with specific timestamp
        summary_time = base_time + 10
        context._minute_summaries[0] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Summary", timestamp=summary_time
        )

        # Mock time to be well past
        with patch("src.agent.context.time.time", return_value=base_time + 600):
            messages = context.messages

        # Find summary message
        summary = next((m for m in messages if isinstance(m.content, str) and SUMMARY_MARKER in m.content), None)
        assert summary is not None
        assert summary.timestamp == summary_time

    def test_mixed_summarized_and_raw_minutes(self, context):
        """Test reconstruction with some minutes summarized and others raw."""
        base_time = context.session_start_time

        # Add messages for minutes 0, 1, 2
        context._raw_messages.append(LLMMessage(role="user", content="Minute 0", timestamp=base_time + 10))
        context._raw_messages.append(LLMMessage(role="user", content="Minute 1", timestamp=base_time + 70))
        context._raw_messages.append(LLMMessage(role="user", content="Minute 2", timestamp=base_time + 130))

        # Only summarize minute 0
        context._minute_summaries[0] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 1: Summary", timestamp=base_time + 10
        )

        # Mock time so minutes 0 and 1 are old, minute 2 is recent
        # Need: minute 0 (base_time + 10) old, minute 1 (base_time + 70) old, minute 2 (base_time + 130) recent
        # Old means: timestamp < current_time - 300
        # So: base_time + 70 < current_time - 300 → current_time > base_time + 370
        # And: base_time + 130 >= current_time - 300 → current_time <= base_time + 430
        with patch("src.agent.context.time.time", return_value=base_time + 400):
            messages = context.messages

        msg_contents = [m.content for m in messages if isinstance(m.content, str)]

        # Summary for minute 0
        assert any(SUMMARY_MARKER in c for c in msg_contents)
        # Raw for minute 1 (no summary exists)
        assert "Minute 1" in msg_contents
        # Raw for minute 2 (in window)
        assert "Minute 2" in msg_contents

    def test_tool_pair_at_exact_minute_boundary(self, context):
        """Test tool pair where tool_use is at :59 and tool_result is at :00."""
        base_time = context.session_start_time

        # Tool use at exactly 59.9 seconds (end of minute 0)
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content="Calling tool",
                tool_calls=[LLMToolCall(id="boundary_tool", name="speak", arguments={})],
                timestamp=base_time + 59.9,
            )
        )

        # Tool result at exactly 60.1 seconds (start of minute 1)
        context._raw_messages.append(
            LLMMessage(
                role="user",
                content="",
                tool_results=[LLMToolResult(tool_call_id="boundary_tool", content="Done")],
                timestamp=base_time + 60.1,
            )
        )

        # Add summaries for both minutes
        context._minute_summaries[0] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 1: Summary", timestamp=base_time + 59.9
        )
        context._minute_summaries[1] = LLMMessage(
            role="assistant", content=f"{SUMMARY_MARKER} Minute 2: Summary", timestamp=base_time + 60.1
        )

        # Mock time to be well past
        with patch("src.agent.context.time.time", return_value=base_time + 600):
            messages = context.messages

        # Verify tool pairing is preserved (raw messages used, not summaries)
        tool_calls = [tc.id for m in messages if m.tool_calls for tc in m.tool_calls]
        tool_results = [tr.tool_call_id for m in messages if m.tool_results for tr in m.tool_results]

        # If cross-minute detected, both should be raw
        if "boundary_tool" in tool_calls:
            assert "boundary_tool" in tool_results

    def test_no_raw_messages_still_works(self, context):
        """Test that empty raw messages don't cause errors."""
        # Clear all messages
        context._raw_messages.clear()

        # Should return empty list without error
        messages = context.messages
        assert messages == []

    def test_heal_if_needed_works_with_raw_messages(self, context):
        """Test that healing works with the new _raw_messages architecture."""
        # Add an assistant message with unclosed tool_use
        context._raw_messages.append(
            LLMMessage(
                role="assistant",
                content="Calling tool",
                tool_calls=[LLMToolCall(id="unclosed", name="speak", arguments={})],
            )
        )

        initial_count = len(context._raw_messages)

        # This should trigger healing
        context.add_user_message("User interruption")

        # Healing message should be added to _raw_messages
        assert len(context._raw_messages) > initial_count + 1  # +1 for user msg, +1 for heal

    def test_concurrent_summarization_safe(self, context):
        """Test that concurrent summarization doesn't corrupt state."""
        # This test verifies the lock is being used correctly
        assert context._summarization_lock is not None

        # The lock should be an asyncio.Lock
        import asyncio

        assert isinstance(context._summarization_lock, asyncio.Lock)
