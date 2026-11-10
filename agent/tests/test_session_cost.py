"""
Test that simulates a tutoring session with 20+ LLM turns and calculates total cost.

This test verifies:
1. The cost calculation logic works correctly across multiple turns
2. Token tracking accumulates properly over a session
3. Cache usage is properly tracked and priced
"""

import asyncio
import os
from dataclasses import dataclass
from unittest.mock import Mock, patch

import pytest

from src.agent.context import Context
from src.agent.llm import (
    LLMConfig,
    LLMStreamEvent,
    LLMStreamResult,
    StreamEventType,
    TextBlock,
    ToolCallBlock,
)
from src.utils.misc import AgentConfig


@dataclass
class SimulatedTurn:
    """Represents a single turn in a simulated session."""

    user_message: str
    assistant_response: str
    tool_calls: list[dict] | None = None
    input_tokens: int = 500
    output_tokens: int = 150
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0


# Simulate a realistic 25-turn tutoring session
SIMULATED_SESSION = [
    SimulatedTurn(
        user_message="Hi! I need help with math.",
        assistant_response="Hello! I'd love to help you with math. What topic are you working on?",
        input_tokens=800,
        output_tokens=45,
    ),
    SimulatedTurn(
        user_message="Fractions. I don't really get them.",
        assistant_response="Fractions can be tricky at first! Let's start with the basics.",
        tool_calls=[{"name": "set_playground", "id": "tool_1"}],
        input_tokens=1200,
        output_tokens=65,
        cache_creation_tokens=500,
    ),
    SimulatedTurn(
        user_message="Okay, what's a fraction?",
        assistant_response="A fraction represents parts of a whole. See the circle on screen?",
        input_tokens=1400,
        output_tokens=80,
        cache_read_tokens=500,
    ),
    SimulatedTurn(
        user_message="Yeah, I see it.",
        assistant_response="Great! The circle is divided into 4 equal parts. That's our denominator.",
        tool_calls=[{"name": "playground_action", "id": "tool_2"}],
        input_tokens=1600,
        output_tokens=95,
        cache_read_tokens=500,
    ),
    SimulatedTurn(
        user_message="So the bottom number is 4?",
        assistant_response="Exactly! And if we shade 1 part, what fraction would that be?",
        input_tokens=1800,
        output_tokens=55,
        cache_read_tokens=500,
    ),
    SimulatedTurn(
        user_message="One fourth?",
        assistant_response="Perfect! 1/4. The numerator tells us how many parts we have.",
        tool_calls=[{"name": "speak", "id": "tool_3"}],
        input_tokens=2000,
        output_tokens=70,
        cache_read_tokens=500,
    ),
    SimulatedTurn(
        user_message="What if we shade 2 parts?",
        assistant_response="Good question! What do you think the fraction would be?",
        input_tokens=2200,
        output_tokens=40,
        cache_read_tokens=500,
    ),
    SimulatedTurn(
        user_message="Two fourths?",
        assistant_response="Yes! And can you think of another way to say 2/4?",
        tool_calls=[{"name": "playground_action", "id": "tool_4"}],
        input_tokens=2400,
        output_tokens=55,
        cache_read_tokens=500,
    ),
    SimulatedTurn(
        user_message="Hmm... is it the same as half?",
        assistant_response="Excellent thinking! 2/4 equals 1/2. These are called equivalent fractions.",
        input_tokens=2600,
        output_tokens=75,
        cache_read_tokens=500,
    ),
    SimulatedTurn(
        user_message="Oh cool! So you can simplify fractions?",
        assistant_response="Exactly! You divide both top and bottom by the same number.",
        tool_calls=[{"name": "set_playground", "id": "tool_5"}],
        input_tokens=2800,
        output_tokens=85,
        cache_read_tokens=500,
        cache_creation_tokens=300,
    ),
    SimulatedTurn(
        user_message="Can you show me another example?",
        assistant_response="Sure! Look at this new diagram. We have 6 parts total.",
        tool_calls=[{"name": "playground_action", "id": "tool_6"}],
        input_tokens=3000,
        output_tokens=65,
        cache_read_tokens=800,
    ),
    SimulatedTurn(
        user_message="And 3 are shaded, so 3/6?",
        assistant_response="Right! Can you simplify 3/6?",
        input_tokens=3200,
        output_tokens=35,
        cache_read_tokens=800,
    ),
    SimulatedTurn(
        user_message="Both can divide by 3... so 1/2!",
        assistant_response="Fantastic work! You're getting the hang of this.",
        input_tokens=3400,
        output_tokens=50,
        cache_read_tokens=800,
    ),
    SimulatedTurn(
        user_message="Thanks! What about adding fractions?",
        assistant_response="Good question! Let's look at adding fractions with the same denominator first.",
        tool_calls=[{"name": "set_playground", "id": "tool_7"}],
        input_tokens=3600,
        output_tokens=80,
        cache_read_tokens=800,
        cache_creation_tokens=400,
    ),
    SimulatedTurn(
        user_message="Like 1/4 + 2/4?",
        assistant_response="Exactly! When denominators match, you just add the numerators. What's 1 + 2?",
        input_tokens=3800,
        output_tokens=70,
        cache_read_tokens=1200,
    ),
    SimulatedTurn(
        user_message="3! So it's 3/4?",
        assistant_response="Perfect! The denominator stays the same.",
        tool_calls=[{"name": "playground_action", "id": "tool_8"}],
        input_tokens=4000,
        output_tokens=45,
        cache_read_tokens=1200,
    ),
    SimulatedTurn(
        user_message="What if the denominators are different?",
        assistant_response="Great question! We need to find a common denominator first.",
        input_tokens=4200,
        output_tokens=55,
        cache_read_tokens=1200,
    ),
    SimulatedTurn(
        user_message="How do you do that?",
        assistant_response="Let me show you with 1/2 + 1/4. What number works for both 2 and 4?",
        tool_calls=[{"name": "set_playground", "id": "tool_9"}],
        input_tokens=4400,
        output_tokens=85,
        cache_read_tokens=1200,
        cache_creation_tokens=350,
    ),
    SimulatedTurn(
        user_message="4 works for both!",
        assistant_response="Yes! So we convert 1/2 to fourths. 1/2 equals how many fourths?",
        input_tokens=4600,
        output_tokens=60,
        cache_read_tokens=1550,
    ),
    SimulatedTurn(
        user_message="2/4!",
        assistant_response="Excellent! So 2/4 + 1/4 = ?",
        input_tokens=4800,
        output_tokens=35,
        cache_read_tokens=1550,
    ),
    SimulatedTurn(
        user_message="3/4!",
        assistant_response="Perfect! You've really understood this concept.",
        tool_calls=[{"name": "speak", "id": "tool_10"}],
        input_tokens=5000,
        output_tokens=50,
        cache_read_tokens=1550,
    ),
    SimulatedTurn(
        user_message="This is actually making sense now!",
        assistant_response="I'm glad! You're doing fantastic work with fractions.",
        input_tokens=5200,
        output_tokens=45,
        cache_read_tokens=1550,
    ),
    SimulatedTurn(
        user_message="Can we do one more practice problem?",
        assistant_response="Of course! Try this: 1/3 + 1/6. First, find a common denominator.",
        tool_calls=[{"name": "set_playground", "id": "tool_11"}],
        input_tokens=5400,
        output_tokens=75,
        cache_read_tokens=1550,
        cache_creation_tokens=400,
    ),
    SimulatedTurn(
        user_message="6 is common since 3 goes into 6.",
        assistant_response="Exactly right! So 1/3 becomes how many sixths?",
        input_tokens=5600,
        output_tokens=45,
        cache_read_tokens=1950,
    ),
    SimulatedTurn(
        user_message="2/6! So 2/6 + 1/6 = 3/6 = 1/2!",
        assistant_response="Outstanding! You solved it completely on your own. That's excellent progress!",
        tool_calls=[{"name": "speak", "id": "tool_12"}],
        input_tokens=5800,
        output_tokens=65,
        cache_read_tokens=1950,
    ),
]


class TestSessionCost:
    """Test suite for session cost calculation."""

    @pytest.fixture
    def mock_config(self):
        """Create a mock AgentConfig for testing."""
        return AgentConfig(
            entity_id=123,
            entity_api_key="test_key",
            user_profile_id="test_profile",
            entity_memory="Test memory context for a tutoring session.",
            timezone="America/New_York",
            tutor_name="Test Tutor",
            account_phone="+15555555555",
            user_name="Test Student",
            voice_id="test_voice",
            registration_source="web",
            session_model="claude-haiku-4-5",
        )

    @pytest.fixture
    def mock_api_service(self):
        """Mock APIService to avoid real API calls."""
        with patch("src.agent.context.APIService") as mock:
            service_instance = Mock()
            service_instance.sync_context = Mock(return_value={"status": "synced"})
            mock.return_value = service_instance
            yield mock

    def _create_mock_stream_result(self, turn: SimulatedTurn) -> LLMStreamResult:
        """Create a mock LLMStreamResult from a SimulatedTurn."""
        text_blocks = [TextBlock(text=turn.assistant_response)]
        tool_calls = []

        if turn.tool_calls:
            for tc in turn.tool_calls:
                tool_calls.append(
                    ToolCallBlock(
                        id=tc["id"],
                        name=tc["name"],
                        input={"message": "test"} if tc["name"] == "speak" else {},
                    )
                )

        return LLMStreamResult(
            text_blocks=text_blocks,
            tool_calls=tool_calls,
            input_tokens=turn.input_tokens,
            output_tokens=turn.output_tokens,
            cache_read_tokens=turn.cache_read_tokens,
            cache_creation_tokens=turn.cache_creation_tokens,
        )

    async def _create_mock_event_stream(self, turn: SimulatedTurn):
        """Create a mock async event stream."""
        # Yield message start
        yield LLMStreamEvent(type=StreamEventType.MESSAGE_START)

        # Yield content block for text
        yield LLMStreamEvent(
            type=StreamEventType.CONTENT_BLOCK_START,
            index=0,
            block_type="text",
        )
        yield LLMStreamEvent(
            type=StreamEventType.CONTENT_BLOCK_DELTA,
            index=0,
            text_delta=turn.assistant_response,
        )
        yield LLMStreamEvent(
            type=StreamEventType.CONTENT_BLOCK_STOP,
            index=0,
        )

        # Yield tool calls if any
        if turn.tool_calls:
            for i, tc in enumerate(turn.tool_calls):
                yield LLMStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_START,
                    index=i + 1,
                    block_type="tool_use",
                    block_id=tc["id"],
                    tool_name=tc["name"],
                )
                yield LLMStreamEvent(
                    type=StreamEventType.CONTENT_BLOCK_STOP,
                    index=i + 1,
                )

        yield LLMStreamEvent(type=StreamEventType.MESSAGE_STOP)

    @pytest.mark.asyncio
    async def test_session_cost_calculation_with_25_turns(self, mock_config, mock_api_service):
        """
        Test that simulates a 25-turn session and calculates total cost.

        This test:
        1. Creates a Context with a mocked provider
        2. Simulates 25 turns of user messages and LLM responses
        3. Calculates costs using the actual provider pricing logic
        4. Verifies total cost is reasonable and tracks all turns
        """
        with patch.dict(os.environ, {"API_URL": "https://test-api.com"}):
            context = Context(mock_config)

        # Track costs for reporting
        turn_costs: list[dict] = []
        total_input_tokens = 0
        total_output_tokens = 0
        total_cache_read = 0
        total_cache_write = 0
        total_cost = 0.0

        # Mock track_cost to capture calls
        tracked_costs = []
        with patch("src.agent.context.track_cost") as mock_track_cost:
            mock_track_cost.side_effect = lambda cost, *args, **kwargs: tracked_costs.append(
                {"cost": cost, "kwargs": kwargs}
            )

            for i, turn in enumerate(SIMULATED_SESSION):
                # Add user message
                context.add_user_message(turn.user_message)

                # Create mock result for this turn
                result = self._create_mock_stream_result(turn)

                # Calculate cost using the provider's actual pricing
                cost = context.provider.calculate_cost(
                    input_tokens=turn.input_tokens,
                    output_tokens=turn.output_tokens,
                    cache_creation_tokens=turn.cache_creation_tokens,
                    cache_read_tokens=turn.cache_read_tokens,
                )

                # Process result (this adds the assistant message to context)
                # We need to mock the stream_complete to return our mock result
                async def mock_stream_complete(*args, **kwargs):
                    async def event_gen():
                        async for event in self._create_mock_event_stream(turn):
                            yield event

                    future = asyncio.Future()
                    future.set_result(result)
                    return event_gen(), future, {}

                context.provider.stream_complete = mock_stream_complete

                # Process the result to update context and track cost
                context.process_result(result)

                # Track this turn's stats
                turn_costs.append(
                    {
                        "turn": i + 1,
                        "input_tokens": turn.input_tokens,
                        "output_tokens": turn.output_tokens,
                        "cache_read": turn.cache_read_tokens,
                        "cache_write": turn.cache_creation_tokens,
                        "cost": cost,
                    }
                )

                total_input_tokens += turn.input_tokens
                total_output_tokens += turn.output_tokens
                total_cache_read += turn.cache_read_tokens
                total_cache_write += turn.cache_creation_tokens
                total_cost += cost

                # Add tool results if there were tool calls
                if turn.tool_calls:
                    tool_results = [(tc["id"], "Tool executed successfully.") for tc in turn.tool_calls]
                    context.add_tool_results(tool_results)

        # Verify we processed all 25 turns
        assert len(turn_costs) == 25, f"Expected 25 turns, got {len(turn_costs)}"

        # Verify tracked_costs matches turns
        assert len(tracked_costs) == 25, f"Expected 25 tracked costs, got {len(tracked_costs)}"

        # Calculate expected costs using Claude Haiku 4.5 pricing
        # Input: $1.00/M, Output: $5.00/M, Cache write: $1.25/M, Cache read: $0.10/M
        expected_input_cost = total_input_tokens * 1.00 / 1_000_000
        expected_output_cost = total_output_tokens * 5.00 / 1_000_000
        expected_cache_write_cost = total_cache_write * 1.25 / 1_000_000
        expected_cache_read_cost = total_cache_read * 0.10 / 1_000_000
        expected_total = (
            expected_input_cost + expected_output_cost + expected_cache_write_cost + expected_cache_read_cost
        )

        # Verify total cost matches expected
        assert abs(total_cost - expected_total) < 0.0001, f"Cost mismatch: {total_cost} vs {expected_total}"

        # Print session summary for visibility
        print("\n" + "=" * 60)
        print("SESSION COST SIMULATION SUMMARY")
        print("=" * 60)
        print(f"Model: {mock_config.session_model}")
        print(f"Total Turns: {len(turn_costs)}")
        print("-" * 60)
        print("TOKEN USAGE:")
        print(f"  Input tokens:        {total_input_tokens:,}")
        print(f"  Output tokens:       {total_output_tokens:,}")
        print(f"  Cache read tokens:   {total_cache_read:,}")
        print(f"  Cache write tokens:  {total_cache_write:,}")
        print("-" * 60)
        print("COST BREAKDOWN:")
        print(f"  Input cost:          ${expected_input_cost:.6f}")
        print(f"  Output cost:         ${expected_output_cost:.6f}")
        print(f"  Cache write cost:    ${expected_cache_write_cost:.6f}")
        print(f"  Cache read cost:     ${expected_cache_read_cost:.6f}")
        print("-" * 60)
        print(f"  TOTAL SESSION COST:  ${total_cost:.6f}")
        print("=" * 60)

        # Calculate cache savings
        if total_cache_read > 0:
            cache_savings = total_cache_read * (1.00 - 0.10) / 1_000_000  # Savings vs full input rate
            print(f"\nCache savings: ${cache_savings:.6f} ({total_cache_read:,} tokens at 90% discount)")

        # Verify cost is reasonable for a tutoring session
        # A 25-turn session with Haiku should be under $0.10
        assert total_cost < 0.10, f"Session cost ${total_cost:.4f} exceeds reasonable threshold"
        assert total_cost > 0, "Session cost should be positive"

    @pytest.mark.asyncio
    async def test_cost_comparison_across_models(self, mock_config, mock_api_service):
        """
        Test that compares session costs across different Anthropic models.

        This helps understand the cost implications of model selection.
        """
        # Models to compare (from MODEL_PRICING in anthropic.py)
        models_to_test = [
            ("claude-haiku-4-5", {"input": 1.00, "output": 5.00, "cache_write": 1.25, "cache_read": 0.10}),
            ("claude-sonnet-4-5", {"input": 3.00, "output": 15.00, "cache_write": 3.75, "cache_read": 0.30}),
            ("claude-opus-4-5", {"input": 5.00, "output": 25.00, "cache_write": 6.25, "cache_read": 0.50}),
        ]

        # Calculate totals from session
        total_input = sum(t.input_tokens for t in SIMULATED_SESSION)
        total_output = sum(t.output_tokens for t in SIMULATED_SESSION)
        total_cache_read = sum(t.cache_read_tokens for t in SIMULATED_SESSION)
        total_cache_write = sum(t.cache_creation_tokens for t in SIMULATED_SESSION)

        print("\n" + "=" * 70)
        print("COST COMPARISON ACROSS ANTHROPIC MODELS (25-turn session)")
        print("=" * 70)
        print(f"Token usage: {total_input:,} input, {total_output:,} output")
        print(f"             {total_cache_read:,} cache read, {total_cache_write:,} cache write")
        print("-" * 70)

        costs = {}
        for model_name, pricing in models_to_test:
            cost = (
                total_input * pricing["input"] / 1_000_000
                + total_output * pricing["output"] / 1_000_000
                + total_cache_write * pricing["cache_write"] / 1_000_000
                + total_cache_read * pricing["cache_read"] / 1_000_000
            )
            costs[model_name] = cost
            print(f"{model_name:25s}: ${cost:.6f}")

        print("-" * 70)

        # Haiku should be significantly cheaper than Opus
        assert costs["claude-haiku-4-5"] < costs["claude-sonnet-4-5"] < costs["claude-opus-4-5"]

        # Calculate cost ratios
        haiku_cost = costs["claude-haiku-4-5"]
        sonnet_ratio = costs["claude-sonnet-4-5"] / haiku_cost
        opus_ratio = costs["claude-opus-4-5"] / haiku_cost

        print(f"Sonnet is {sonnet_ratio:.1f}x more expensive than Haiku")
        print(f"Opus is {opus_ratio:.1f}x more expensive than Haiku")
        print("=" * 70)

    def test_pricing_accuracy(self):
        """Test that our pricing constants match the provider implementation."""
        from src.agent.llm.anthropic import AnthropicProvider

        # Test Haiku 4.5 pricing
        config = LLMConfig(model="claude-haiku-4-5")
        provider = AnthropicProvider(config)

        # Test cost calculation
        cost = provider.calculate_cost(
            input_tokens=1_000_000,  # 1M tokens
            output_tokens=1_000_000,
            cache_creation_tokens=1_000_000,
            cache_read_tokens=1_000_000,
        )

        # Expected: $1 input + $5 output + $1.25 cache write + $0.10 cache read = $7.35
        expected = 1.00 + 5.00 + 1.25 + 0.10
        assert abs(cost - expected) < 0.001, f"Cost {cost} doesn't match expected {expected}"

    @pytest.mark.asyncio
    async def test_session_with_heavy_caching(self, mock_config, mock_api_service):
        """Test a session that heavily utilizes caching to show cost savings."""
        with patch.dict(os.environ, {"API_URL": "https://test-api.com"}):
            context = Context(mock_config)

        # Simulate a session where caching is heavily used after initial setup
        heavy_cache_session = [
            # First turn - no cache
            SimulatedTurn(
                user_message="Start",
                assistant_response="Hello!",
                input_tokens=2000,
                output_tokens=50,
                cache_creation_tokens=1800,  # Cache the system prompt
            ),
        ]

        # Add 19 more turns that all read from cache
        for i in range(19):
            heavy_cache_session.append(
                SimulatedTurn(
                    user_message=f"Question {i + 1}",
                    assistant_response=f"Answer {i + 1}",
                    input_tokens=200 + (i * 50),  # Small additional input
                    output_tokens=100,
                    cache_read_tokens=1800,  # Read cached system prompt
                )
            )

        total_cost_with_cache = 0.0
        total_cost_without_cache = 0.0

        with patch("src.agent.context.track_cost"):
            for turn in heavy_cache_session:
                # Add user message
                context.add_user_message(turn.user_message)

                # Cost with caching
                cost_with_cache = context.provider.calculate_cost(
                    input_tokens=turn.input_tokens,
                    output_tokens=turn.output_tokens,
                    cache_creation_tokens=turn.cache_creation_tokens,
                    cache_read_tokens=turn.cache_read_tokens,
                )

                # Cost without caching (all cache_read would be full input)
                cost_without_cache = context.provider.calculate_cost(
                    input_tokens=turn.input_tokens + turn.cache_read_tokens,
                    output_tokens=turn.output_tokens,
                    cache_creation_tokens=0,
                    cache_read_tokens=0,
                )

                total_cost_with_cache += cost_with_cache
                total_cost_without_cache += cost_without_cache

                # Process result
                result = self._create_mock_stream_result(turn)
                context.process_result(result)

        savings = total_cost_without_cache - total_cost_with_cache
        savings_pct = (savings / total_cost_without_cache) * 100

        print("\n" + "=" * 60)
        print("CACHING IMPACT ANALYSIS (20-turn session)")
        print("=" * 60)
        print(f"Cost WITH caching:    ${total_cost_with_cache:.6f}")
        print(f"Cost WITHOUT caching: ${total_cost_without_cache:.6f}")
        print(f"Savings:              ${savings:.6f} ({savings_pct:.1f}%)")
        print("=" * 60)

        # Verify caching provides significant savings (should be >40% for this scenario)
        assert savings_pct > 40, f"Expected >40% savings from caching, got {savings_pct:.1f}%"


class TestProviderCostCalculation:
    """Unit tests for provider cost calculation methods."""

    def test_anthropic_cost_calculation(self):
        """Test Anthropic provider cost calculation."""
        from src.agent.llm.anthropic import AnthropicProvider

        config = LLMConfig(model="claude-haiku-4-5")
        provider = AnthropicProvider(config)

        # Test with round numbers
        cost = provider.calculate_cost(
            input_tokens=1000,
            output_tokens=500,
            cache_creation_tokens=200,
            cache_read_tokens=300,
        )

        # Expected breakdown:
        # Input: 1000 * 1.00 / 1M = 0.001
        # Output: 500 * 5.00 / 1M = 0.0025
        # Cache write: 200 * 1.25 / 1M = 0.00025
        # Cache read: 300 * 0.10 / 1M = 0.00003
        expected = 0.001 + 0.0025 + 0.00025 + 0.00003
        assert abs(cost - expected) < 0.000001

    def test_zero_token_cost(self):
        """Test that zero tokens result in zero cost."""
        from src.agent.llm.anthropic import AnthropicProvider

        config = LLMConfig(model="claude-haiku-4-5")
        provider = AnthropicProvider(config)

        cost = provider.calculate_cost(
            input_tokens=0,
            output_tokens=0,
            cache_creation_tokens=0,
            cache_read_tokens=0,
        )

        assert cost == 0.0
