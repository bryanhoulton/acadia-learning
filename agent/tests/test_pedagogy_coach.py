import os
from unittest.mock import AsyncMock, Mock, patch

import pytest

from src.agent.llm.gemini import GeminiProvider
from src.agent.pedagogy_coach import (
    COACH_MODEL,
    PedagogyCoach,
)


class TestPedagogyCoach:
    """Test suite for PedagogyCoach class."""

    @pytest.fixture
    def mock_config(self):
        """Create a mock AgentConfig for testing."""
        config = Mock()
        config.entity_id = 123
        config.entity_api_key = "test_key"
        config.user_profile_id = "test_profile"
        config.entity_memory = "Test memory context"
        config.timezone = "America/New_York"
        config.tutor_name = "Test Tutor"
        config.account_phone = "+15555555555"
        config.registration_source = "web"
        return config

    @pytest.fixture
    def mock_context(self, mock_config):
        """Create a mock Context for testing."""
        context = Mock()
        context.config = mock_config
        context.messages = []
        context.add_coaching_message = Mock()
        return context

    @pytest.fixture
    def coach(self, mock_context):
        """Create a PedagogyCoach instance with mocked dependencies."""
        return PedagogyCoach(
            context=mock_context,
            entity_id=123,
            tracing_client=None,
        )

    def test_init(self, coach, mock_context):
        """Test PedagogyCoach initialization."""
        assert coach.context == mock_context
        assert coach.entity_id == 123
        assert coach._task is None
        assert coach._last_message_count == 0

    def test_pricing_from_provider(self):
        """Test that pricing is retrieved from GeminiProvider."""
        # Get pricing from provider (same way coach does)
        pricing = GeminiProvider._get_pricing(COACH_MODEL)
        # Gemini 3 Flash pricing
        assert pricing.get("input") == 0.50  # $0.50 per million input tokens
        assert pricing.get("output") == 3.00  # $3.00 per million output tokens

    def test_track_cost_calculation(self, coach):
        """Test that cost calculation is correct."""
        # Create mock usage object (Gemini format)
        mock_usage = Mock()
        mock_usage.prompt_token_count = 1000
        mock_usage.candidates_token_count = 500

        # Get pricing from provider
        pricing = GeminiProvider._get_pricing(COACH_MODEL)
        input_price = pricing.get("input", 0.50)
        output_price = pricing.get("output", 3.00)

        with patch("src.agent.pedagogy_coach.track_cost") as mock_track_cost:
            coach._track_cost(mock_usage)

            # Expected cost calculation using provider pricing
            expected_cost = (1000 * input_price + 500 * output_price) / 1_000_000

            mock_track_cost.assert_called_once_with(
                expected_cost,
                "pedagogy-coach",
                "+15555555555",
                input_tokens=1000,
                output_tokens=500,
                provider="google",
                model=COACH_MODEL,
            )

    def test_track_cost_with_large_token_counts(self, coach):
        """Test cost calculation with larger token counts."""
        mock_usage = Mock()
        mock_usage.prompt_token_count = 10000  # 10k input tokens
        mock_usage.candidates_token_count = 2000  # 2k output tokens

        # Get pricing from provider
        pricing = GeminiProvider._get_pricing(COACH_MODEL)
        input_price = pricing.get("input", 0.50)
        output_price = pricing.get("output", 3.00)

        with patch("src.agent.pedagogy_coach.track_cost") as mock_track_cost:
            coach._track_cost(mock_usage)

            # Expected cost using provider pricing
            expected_cost = (10000 * input_price + 2000 * output_price) / 1_000_000

            mock_track_cost.assert_called_once()
            actual_cost = mock_track_cost.call_args[0][0]
            assert abs(actual_cost - expected_cost) < 0.0001

    def test_track_cost_handles_missing_config(self, mock_context):
        """Test that cost tracking handles missing config gracefully."""
        mock_context.config = None
        coach = PedagogyCoach(context=mock_context, entity_id=123)

        mock_usage = Mock()
        mock_usage.prompt_token_count = 100
        mock_usage.candidates_token_count = 50

        with patch("src.agent.pedagogy_coach.track_cost") as mock_track_cost:
            # Should not raise
            coach._track_cost(mock_usage)
            mock_track_cost.assert_called_once()
            # account_phone should be None
            assert mock_track_cost.call_args[0][2] is None

    @pytest.mark.asyncio
    async def test_get_coaching_feedback_uses_gemini_model(self, coach):
        """Test that _get_coaching_feedback uses Gemini 3 Flash."""
        mock_response = Mock()
        mock_response.candidates = [Mock(content=Mock(parts=[Mock(text='{"critique": null, "ideas": null}')]))]
        mock_response.usage_metadata = Mock(prompt_token_count=100, candidates_token_count=50)

        with patch("src.agent.pedagogy_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            await coach._get_coaching_feedback("Test conversation")

            # Verify the model used
            mock_client.aio.models.generate_content.assert_called_once()
            call_kwargs = mock_client.aio.models.generate_content.call_args[1]
            assert call_kwargs["model"] == COACH_MODEL

    @pytest.mark.asyncio
    async def test_get_coaching_feedback_tracks_cost(self, coach):
        """Test that _get_coaching_feedback tracks cost after API call."""
        mock_response = Mock()
        mock_response.candidates = [Mock(content=Mock(parts=[Mock(text='{"critique": null, "ideas": null}')]))]
        mock_response.usage_metadata = Mock(prompt_token_count=500, candidates_token_count=200)

        with patch("src.agent.pedagogy_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            with patch.object(coach, "_track_cost") as mock_track:
                await coach._get_coaching_feedback("Test conversation")

                # Verify cost tracking was called with the usage metadata
                mock_track.assert_called_once_with(mock_response.usage_metadata)

    @pytest.mark.asyncio
    async def test_get_coaching_feedback_parses_critique(self, coach):
        """Test that critique is extracted from response."""
        mock_response = Mock()
        mock_response.candidates = [
            Mock(content=Mock(parts=[Mock(text='{"critique": "Tutor gave away the answer", "ideas": null}')]))
        ]
        mock_response.usage_metadata = Mock(prompt_token_count=100, candidates_token_count=50)

        with patch("src.agent.pedagogy_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            with patch("src.agent.pedagogy_coach.track_cost"):
                feedback = await coach._get_coaching_feedback("Test conversation")

            assert feedback is not None
            assert "[CRITIQUE]" in feedback
            assert "Tutor gave away the answer" in feedback

    @pytest.mark.asyncio
    async def test_get_coaching_feedback_parses_ideas(self, coach):
        """Test that teaching ideas are extracted from response."""
        mock_response = Mock()
        mock_response.candidates = [
            Mock(
                content=Mock(
                    parts=[
                        Mock(
                            text="""{
                "critique": null,
                "ideas": {
                    "topic": "Quadratic equations",
                    "teaching_ideas": ["Use visual graphs", "Break into steps"],
                    "key_ideas": ["Factoring", "Completing the square"],
                    "aha_moments": ["Realizing the formula pattern"]
                }
            }"""
                        )
                    ]
                )
            )
        ]
        mock_response.usage_metadata = Mock(prompt_token_count=100, candidates_token_count=150)

        with patch("src.agent.pedagogy_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            with patch("src.agent.pedagogy_coach.track_cost"):
                feedback = await coach._get_coaching_feedback("Test conversation")

            assert feedback is not None
            assert "Quadratic equations" in feedback
            assert "Approaches that work" in feedback

    @pytest.mark.asyncio
    async def test_get_coaching_feedback_handles_clean_json(self, coach):
        """Test that clean JSON response is parsed correctly."""
        mock_response = Mock()
        mock_response.candidates = [
            Mock(content=Mock(parts=[Mock(text='{"critique": "Test critique", "ideas": null}')]))
        ]
        mock_response.usage_metadata = Mock(prompt_token_count=100, candidates_token_count=50)

        with patch("src.agent.pedagogy_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            with patch("src.agent.pedagogy_coach.track_cost"):
                feedback = await coach._get_coaching_feedback("Test conversation")

            assert feedback is not None
            assert "Test critique" in feedback

    @pytest.mark.asyncio
    async def test_get_coaching_feedback_returns_none_on_error(self, coach):
        """Test that errors are handled gracefully."""
        with patch("src.agent.pedagogy_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(side_effect=Exception("API error"))
            mock_get_client.return_value = mock_client

            feedback = await coach._get_coaching_feedback("Test conversation")

            assert feedback is None

    def test_format_messages_for_review(self, coach):
        """Test message formatting for review."""
        new_messages = [
            {"role": "user", "content": "What is 2+2?"},
            {"role": "assistant", "content": "Let me help you think about that."},
        ]

        formatted = coach._format_messages_for_review(new_messages=new_messages)

        assert "USER: What is 2+2?" in formatted
        assert "ASSISTANT: Let me help you think about that." in formatted

    def test_format_messages_with_context(self, coach):
        """Test message formatting with context messages."""
        context_messages = [
            {"role": "user", "content": "Earlier message"},
        ]
        new_messages = [
            {"role": "user", "content": "New message"},
        ]

        formatted = coach._format_messages_for_review(
            new_messages=new_messages,
            context_messages=context_messages,
        )

        assert "=== CONTEXT (earlier in session) ===" in formatted
        assert "=== RECENT EXCHANGE (analyze for issues) ===" in formatted
        assert "Earlier message" in formatted
        assert "New message" in formatted

    def test_strip_ssml(self, coach):
        """Test SSML tag stripping."""
        ssml_text = "<speak>Hello <break time='500ms'/> world</speak>"
        clean_text = coach._strip_ssml(ssml_text)
        assert clean_text == "Hello world"


@pytest.mark.slow
@pytest.mark.skipif(
    not os.environ.get("GOOGLE_API_KEY"),
    reason="GOOGLE_API_KEY not set - skipping integration tests",
)
class TestPedagogyCoachIntegration:
    """Integration tests that make real API calls."""

    @pytest.fixture
    def mock_config(self):
        """Create a mock AgentConfig for testing."""
        config = Mock()
        config.entity_id = 123
        config.account_phone = "+15555555555"
        return config

    @pytest.fixture
    def mock_context(self, mock_config):
        """Create a mock Context for testing."""
        context = Mock()
        context.config = mock_config
        context.messages = []
        return context

    @pytest.fixture
    def coach(self, mock_context):
        """Create a PedagogyCoach instance."""
        return PedagogyCoach(
            context=mock_context,
            entity_id=123,
            tracing_client=None,
        )

    @pytest.mark.asyncio
    async def test_real_api_call(self, coach):
        """Test that the real Gemini 3 Flash API call works."""
        conversation = """
        === RECENT EXCHANGE (analyze for issues) ===
        USER: What is 2 + 2?
        TUTOR SPEAKS: The answer is 4.
        """

        with patch("src.agent.pedagogy_coach.track_cost") as mock_track_cost:
            feedback = await coach._get_coaching_feedback(conversation)

            # Should have tracked cost
            mock_track_cost.assert_called_once()
            call_args = mock_track_cost.call_args[0]
            cost = call_args[0]
            category = call_args[1]

            # Cost should be positive and reasonable for Gemini Flash
            assert cost > 0
            assert cost < 0.1  # Should be well under $0.10 for this small request
            assert category == "pedagogy-coach"

            # Feedback should either be None or contain coaching notes
            # The tutor "gave away the answer" so we expect a critique
            if feedback:
                print(f"Feedback received: {feedback}")
                # Should contain some response (critique or ideas)
                assert len(feedback) > 0
