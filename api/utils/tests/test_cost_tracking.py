"""
Tests for LLM cost tracking to ensure negative costs don't occur.
"""

from django.test import TestCase
from unittest.mock import patch

from utils.llm_provider import UsageInfo
from utils.llms import track_llm_cost, PRICES


class TestCostTracking(TestCase):
    """Test cost tracking logic to ensure no negative costs are tracked."""

    @patch("utils.llms.track_cost")
    def test_normal_cost_calculation(self, mock_track_cost):
        """Test that cost is calculated correctly with normal usage."""
        # Mock usage with some cached tokens (Anthropic style: input_tokens excludes cache_read)
        # Scenario: 800 uncached + 200 cache_creation = 1000 input_tokens, plus 300 cache_read
        usage = UsageInfo(
            input_tokens=1000,  # uncached + cache_creation
            output_tokens=500,
            cached_tokens=300,  # cache_read
            cache_creation_tokens=200,  # cache_write
        )

        # Call track_llm_cost
        track_llm_cost(
            usage=usage,
            model="claude-sonnet-4-5",
            account_phone="test",
            provider="anthropic",
        )

        # Verify track_cost was called
        mock_track_cost.assert_called_once()

        # Get the cost argument (first positional argument)
        cost_arg = mock_track_cost.call_args[0][0]

        # Cost should be positive
        self.assertGreater(cost_arg, 0, "Cost should be positive")
        self.assertLess(cost_arg, 1, "Cost should be reasonable (less than $1)")

        # Verify the breakdown
        kwargs = mock_track_cost.call_args[1]
        self.assertEqual(kwargs["input_tokens"], 800)  # uncached
        self.assertEqual(kwargs["cache_read_tokens"], 300)
        self.assertEqual(kwargs["cache_write_tokens"], 200)

    @patch("utils.llms.track_cost")
    def test_cache_creation_cost_is_higher(self, mock_track_cost):
        """Test that cache creation tokens are charged at the higher rate."""
        price = PRICES["claude-sonnet-4-5"]

        # Test with only cache creation tokens
        usage = UsageInfo(
            input_tokens=1000,  # All cache creation
            output_tokens=0,
            cached_tokens=0,
            cache_creation_tokens=1000,
        )

        track_llm_cost(
            usage=usage,
            model="claude-sonnet-4-5",
            account_phone="test",
            provider="anthropic",
        )

        cost_arg = mock_track_cost.call_args[0][0]
        # Cost should be: 1000 * cache_write_price / 1_000_000
        expected_cost = 1000 * price.cache_write_price / 1_000_000
        self.assertAlmostEqual(cost_arg, expected_cost, places=10)

    @patch("utils.llms.track_cost")
    def test_negative_uncached_prevented(self, mock_track_cost):
        """Test that negative costs are prevented when calculation would result in negative uncached."""
        # Edge case: cache_creation_tokens > input_tokens (shouldn't happen but be defensive)
        usage = UsageInfo(
            input_tokens=1000,
            output_tokens=500,
            cached_tokens=0,
            cache_creation_tokens=1500,  # More than input_tokens
        )

        # Log warning should be captured
        with self.assertLogs("utils.llms", level="WARNING") as logs:
            track_llm_cost(
                usage=usage,
                model="claude-sonnet-4-5",
                account_phone="test",
                provider="anthropic",
            )

        # Verify warning was logged
        warning_logs = [log for log in logs.output if "Negative uncached_tokens" in log]
        self.assertEqual(len(warning_logs), 1, "Should log exactly one warning")

        # Verify track_cost was still called with a valid cost
        mock_track_cost.assert_called_once()
        cost_arg = mock_track_cost.call_args[0][0]
        self.assertGreaterEqual(cost_arg, 0, "Cost should not be negative")

    @patch("utils.llms.track_cost")
    def test_zero_cached_tokens(self, mock_track_cost):
        """Test that zero cached tokens works correctly."""
        usage = UsageInfo(
            input_tokens=1000,
            output_tokens=500,
            cached_tokens=0,
            cache_creation_tokens=0,
        )

        # Should not raise any errors
        track_llm_cost(
            usage=usage,
            model="claude-sonnet-4-5",
            account_phone="test",
            provider="anthropic",
        )

        # Verify track_cost was called
        mock_track_cost.assert_called_once()
        cost_arg = mock_track_cost.call_args[0][0]
        self.assertGreater(cost_arg, 0, "Cost should be positive")

    @patch("utils.llms.track_cost")
    def test_all_tokens_cache_read(self, mock_track_cost):
        """Test that when all tokens are from cache read, cost is minimal."""
        # Anthropic: input_tokens=0 (no uncached or cache_creation), cached_tokens=1000
        usage = UsageInfo(
            input_tokens=0,
            output_tokens=500,
            cached_tokens=1000,
            cache_creation_tokens=0,
        )

        # Should not raise any errors
        track_llm_cost(
            usage=usage,
            model="claude-sonnet-4-5",
            account_phone="test",
            provider="anthropic",
        )

        # Verify track_cost was called with minimal input cost
        mock_track_cost.assert_called_once()
        cost_arg = mock_track_cost.call_args[0][0]

        # Cost should be from cache read + output tokens
        self.assertGreater(cost_arg, 0, "Cost should be positive")

        # Verify the cached tokens argument is correct
        kwargs = mock_track_cost.call_args[1]
        self.assertEqual(kwargs["cache_read_tokens"], 1000)
        self.assertEqual(kwargs["input_tokens"], 0)

    @patch("utils.llms.track_cost")
    def test_openai_cost_calculation(self, mock_track_cost):
        """Test that OpenAI models use the correct calculation path."""
        usage = UsageInfo(
            input_tokens=1000,
            output_tokens=500,
            cached_tokens=200,
            cache_creation_tokens=0,  # OpenAI doesn't have separate cache creation
        )

        track_llm_cost(
            usage=usage,
            model="gpt-4.1",
            account_phone="test",
            provider="openai",
        )

        mock_track_cost.assert_called_once()
        kwargs = mock_track_cost.call_args[1]

        # OpenAI: uncached = input_tokens - cached_tokens
        self.assertEqual(kwargs["input_tokens"], 800)
        self.assertEqual(kwargs["cache_read_tokens"], 200)

    def test_unknown_model_skipped(self):
        """Test that tracking is skipped for unknown models."""
        usage = UsageInfo(
            input_tokens=1000,
            output_tokens=500,
            cached_tokens=200,
        )

        # Should not raise any errors or call track_cost
        with patch("utils.llms.track_cost") as mock_track_cost:
            track_llm_cost(
                usage=usage,
                model="unknown-model",
                account_phone="test",
            )

            # Verify track_cost was NOT called
            mock_track_cost.assert_not_called()
