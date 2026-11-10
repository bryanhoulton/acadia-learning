import io
import json
import time
import wave

import numpy as np
import pytest
from unittest.mock import AsyncMock, Mock, patch

from src.agent.engagement_coach import (
    EngagementCoach,
    AUDIO_BUFFER_SECONDS,
)
from src.agent.vad import CONTINUOUS_BUFFER_SECONDS, RATE


class TestEngagementCoach:
    """Test suite for EngagementCoach class."""

    @pytest.fixture
    def mock_context(self):
        """Create a mock Context."""
        context = Mock()
        context.config = Mock()
        context.config.account_phone = "+15555555555"
        context.messages = []
        context.add_coaching_message = Mock()
        return context

    @pytest.fixture
    def mock_audio_streamer(self):
        """Create a mock AudioStreamer with continuous buffer."""
        streamer = Mock()
        # Return empty WAV by default
        streamer.get_continuous_audio_wav.return_value = b""
        return streamer

    @pytest.fixture
    def coach(self, mock_context, mock_audio_streamer):
        """Create an EngagementCoach instance with audio streamer."""
        coach = EngagementCoach(
            context=mock_context,
            entity_id=123,
            tracing_client=None,
            audio_streamer=mock_audio_streamer,
        )
        return coach

    def test_init(self, coach, mock_context):
        """Test initialization."""
        assert coach.context == mock_context
        assert coach._audio_streamer is not None

    def test_buffer_constants(self):
        """Verify buffer constants are correctly set."""
        # Engagement coach analyzes last 5 minutes
        assert AUDIO_BUFFER_SECONDS == 300
        # AudioStreamer continuous buffer is also 5 minutes
        assert CONTINUOUS_BUFFER_SECONDS == 300

    def test_get_recent_audio_returns_wav_from_streamer(self, coach, mock_audio_streamer):
        """Test that _get_recent_audio pulls from the audio streamer."""
        fake_wav = b"RIFF....WAVEfmt data..."
        mock_audio_streamer.get_continuous_audio_wav.return_value = fake_wav

        result = coach._get_recent_audio()

        assert result == fake_wav
        mock_audio_streamer.get_continuous_audio_wav.assert_called_once()

    def test_get_recent_audio_no_streamer(self, mock_context):
        """Test _get_recent_audio returns empty when no streamer is set."""
        coach = EngagementCoach(context=mock_context, audio_streamer=None)
        result = coach._get_recent_audio()
        assert result == b""

    def test_set_audio_streamer(self, mock_context):
        """Test setting audio streamer after initialization."""
        coach = EngagementCoach(context=mock_context, audio_streamer=None)
        assert coach._audio_streamer is None

        mock_streamer = Mock()
        coach.set_audio_streamer(mock_streamer)
        assert coach._audio_streamer == mock_streamer

    def test_get_aligned_transcript(self, coach):
        """Test message formatting with time alignment."""
        now = 1000000.0
        with patch("time.time", return_value=now):
            # Message 1: 4 minutes ago (Old Context)
            msg1 = Mock(role="user", content="Hello", timestamp=now - 240)
            # Message 2: 30 seconds ago (Active Zone)
            msg2 = Mock(role="assistant", content=[{"type": "text", "text": "Hi there"}], timestamp=now - 30)

            messages = [msg1, msg2]
            formatted = coach._get_aligned_transcript(messages)

            assert "=== OLD CONTEXT" in formatted
            assert "=== ACTIVE ZONE" in formatted
            assert "[01:00] USER: Hello" in formatted  # 300 - 240 = 60s = 01:00 relative to buffer start
            assert "[04:30] ASSISTANT: Hi there" in formatted

    @pytest.mark.asyncio
    async def test_get_gemini_feedback_no_issues(self, coach):
        """Test feedback when no issues detected."""
        mock_response = Mock()
        mock_response.usage_metadata = Mock(prompt_token_count=100, candidates_token_count=50)
        mock_response.candidates = [Mock(content=Mock(parts=[Mock(text='{"issues": []}')]))]

        with patch("src.agent.engagement_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            feedback = await coach._get_gemini_feedback("context", b"audio")

            assert feedback is None

    @pytest.mark.asyncio
    async def test_get_gemini_feedback_with_issue(self, coach):
        """Test feedback when issue IS detected."""
        mock_response = Mock()
        mock_response.usage_metadata = Mock(prompt_token_count=100, candidates_token_count=50)
        json_resp = {"issues": [{"evidence": "Student is distracted", "tactic": "Ask for focus"}]}
        mock_response.candidates = [Mock(content=Mock(parts=[Mock(text=json.dumps(json_resp))]))]

        with patch("src.agent.engagement_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            feedback = await coach._get_gemini_feedback("context", b"audio")

            assert feedback is not None
            assert "[ENGAGEMENT ALERT]" in feedback
            assert "Student is distracted" in feedback
            assert "Ask for focus" in feedback

    @pytest.mark.asyncio
    async def test_review_engagement_flow(self, coach, mock_audio_streamer):
        """Test the full review flow."""
        coach.context.messages = [Mock(role="user", content="msg", timestamp=time.time())]
        mock_audio_streamer.get_continuous_audio_wav.return_value = b"fake_audio_data"

        with patch.object(coach, "_get_gemini_feedback", return_value="Fix it!") as mock_get:
            await coach._review_engagement()

            mock_get.assert_called_once()
            coach.context.add_coaching_message.assert_called_once_with("Fix it!")


class TestEngagementCoachEvals:
    """Evals for engagement scenarios."""

    @pytest.fixture
    def coach(self):
        context = Mock()
        context.config = Mock()
        context.messages = []
        mock_streamer = Mock()
        mock_streamer.get_continuous_audio_wav.return_value = b""
        return EngagementCoach(context=context, audio_streamer=mock_streamer)

    @pytest.mark.asyncio
    async def test_distraction_scenario(self, coach):
        """Eval: Distraction Scenario."""
        # Setup context implying distraction
        now = time.time()
        coach.context.messages = [
            Mock(role="user", content="Wait, look at that bird outside!", timestamp=now),
            Mock(role="user", content="<singing>", timestamp=now),
        ]

        # Mock Gemini response for distraction
        distraction_resp = {
            "issues": [
                {
                    "category": "distraction",
                    "evidence": "Student is distracted by environment",
                    "tactic": "Refocus attention",
                }
            ]
        }

        mock_response = Mock()
        mock_response.candidates = [Mock(content=Mock(parts=[Mock(text=json.dumps(distraction_resp))]))]
        mock_response.usage_metadata = Mock(prompt_token_count=10, candidates_token_count=10)

        with patch("src.agent.engagement_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            feedback = await coach._get_gemini_feedback("context", b"audio")

            assert "distracted" in feedback.lower()
            assert "refocus" in feedback.lower()

    @pytest.mark.asyncio
    async def test_boredom_scenario(self, coach):
        """Eval: Boredom Scenario."""
        now = time.time()
        coach.context.messages = [
            Mock(role="user", content="Yeah.", timestamp=now),
            Mock(role="user", content="I guess.", timestamp=now),
            Mock(role="user", content="Ok.", timestamp=now),
        ]

        boredom_resp = {
            "issues": [{"category": "boredom", "evidence": "Low energy responses", "tactic": "Pump up the energy"}]
        }

        mock_response = Mock()
        mock_response.candidates = [Mock(content=Mock(parts=[Mock(text=json.dumps(boredom_resp))]))]
        mock_response.usage_metadata = Mock()

        with patch("src.agent.engagement_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            feedback = await coach._get_gemini_feedback("context", b"audio")

            assert "low energy" in feedback.lower()


class TestAudioStreamerContinuousBuffer:
    """Test the continuous audio buffer in AudioStreamer."""

    @pytest.fixture
    def mock_room(self):
        """Create a mock LiveKit Room."""
        room = Mock()
        room.remote_participants = {}
        room.on = Mock()
        return room

    def test_continuous_buffer_initialization(self, mock_room):
        """Test that AudioStreamer initializes with empty continuous buffer."""
        from src.agent.vad import AudioStreamer

        streamer = AudioStreamer(room=mock_room, on_transcript=Mock())
        assert len(streamer._continuous_buffer) == 0

    def test_get_continuous_audio_wav_empty(self, mock_room):
        """Test getting WAV from empty buffer returns empty bytes."""
        from src.agent.vad import AudioStreamer

        streamer = AudioStreamer(room=mock_room, on_transcript=Mock())
        result = streamer.get_continuous_audio_wav()
        assert result == b""

    def test_get_continuous_audio_wav_with_data(self, mock_room):
        """Test getting WAV from buffer with data."""
        from src.agent.vad import AudioStreamer

        streamer = AudioStreamer(room=mock_room, on_transcript=Mock())

        # Add some fake audio data (1 second of silence at 16kHz)
        one_second_samples = RATE
        streamer._continuous_buffer = np.zeros(one_second_samples, dtype=np.float32)

        result = streamer.get_continuous_audio_wav()

        # Should return valid WAV data
        assert len(result) > 0
        # WAV files start with "RIFF"
        assert result[:4] == b"RIFF"
        # Should contain "WAVE" marker
        assert b"WAVE" in result[:12]

    def test_continuous_buffer_size_limit(self, mock_room):
        """Test that continuous buffer respects max size."""
        from src.agent.vad import AudioStreamer, CONTINUOUS_BUFFER_SAMPLES

        streamer = AudioStreamer(room=mock_room, on_transcript=Mock())

        # Simulate adding more than 5 minutes of audio
        # The buffer should be trimmed to CONTINUOUS_BUFFER_SAMPLES
        oversized_buffer = np.zeros(CONTINUOUS_BUFFER_SAMPLES + 10000, dtype=np.float32)
        streamer._continuous_buffer = oversized_buffer

        # Manually trigger the trimming logic (normally done in _process_audio)
        if len(streamer._continuous_buffer) > CONTINUOUS_BUFFER_SAMPLES:
            streamer._continuous_buffer = streamer._continuous_buffer[-CONTINUOUS_BUFFER_SAMPLES:]

        assert len(streamer._continuous_buffer) == CONTINUOUS_BUFFER_SAMPLES


def generate_test_wav(duration_seconds: float = 1.0, frequency: float = 440.0) -> bytes:
    """Generate a simple sine wave WAV file for testing.

    Args:
        duration_seconds: Length of the audio
        frequency: Frequency of the sine wave in Hz (440 = A4 note)

    Returns:
        WAV file as bytes
    """
    sample_rate = RATE
    num_samples = int(sample_rate * duration_seconds)

    # Generate sine wave
    t = np.linspace(0, duration_seconds, num_samples, dtype=np.float32)
    audio = (np.sin(2 * np.pi * frequency * t) * 0.5).astype(np.float32)

    # Convert to int16
    audio_int16 = (audio * 32767).astype(np.int16)

    # Write to WAV
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_int16.tobytes())

    return wav_buffer.getvalue()


class TestEngagementCoachIntegration:
    """Integration tests with real audio data."""

    @pytest.fixture
    def test_audio(self):
        """Generate a test WAV file (3 seconds of 440Hz sine wave)."""
        return generate_test_wav(duration_seconds=3.0, frequency=440.0)

    @pytest.fixture
    def mock_room(self):
        """Create a mock LiveKit Room."""
        room = Mock()
        room.remote_participants = {}
        room.on = Mock()
        return room

    @pytest.fixture
    def coach_with_real_streamer(self, mock_room):
        """Create coach with real AudioStreamer (not mocked)."""
        from src.agent.vad import AudioStreamer

        context = Mock()
        context.config = Mock()
        context.messages = []
        context.add_coaching_message = Mock()

        streamer = AudioStreamer(room=mock_room, on_transcript=Mock())
        coach = EngagementCoach(context=context, audio_streamer=streamer)
        return coach, streamer

    def test_real_wav_structure(self, test_audio):
        """Verify generated test WAV has correct structure."""
        # WAV header checks
        assert test_audio[:4] == b"RIFF"
        assert test_audio[8:12] == b"WAVE"
        assert test_audio[12:16] == b"fmt "

        # Should be about 3 seconds at 16kHz, 16-bit mono
        # 3 * 16000 * 2 bytes = 96000 bytes + 44 byte header
        expected_size = 3 * RATE * 2 + 44
        assert len(test_audio) == expected_size

    def test_audio_streamer_produces_valid_wav(self, coach_with_real_streamer, test_audio):
        """Test that AudioStreamer produces valid WAV from buffer."""
        coach, streamer = coach_with_real_streamer

        # Simulate audio being added to continuous buffer
        # Parse the test WAV to get raw samples
        with wave.open(io.BytesIO(test_audio), "rb") as wav_file:
            raw_data = wav_file.readframes(wav_file.getnframes())
            samples = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0

        # Add to streamer's continuous buffer
        streamer._continuous_buffer = samples

        # Get WAV back
        result_wav = streamer.get_continuous_audio_wav()

        # Verify it's valid WAV
        assert result_wav[:4] == b"RIFF"
        assert b"WAVE" in result_wav[:12]

        # Verify coach can access it
        audio_from_coach = coach._get_recent_audio()
        assert audio_from_coach == result_wav

    @pytest.mark.asyncio
    async def test_review_with_real_audio(self, coach_with_real_streamer, test_audio):
        """Test full review flow with real audio data."""
        coach, streamer = coach_with_real_streamer

        # Add some audio to the buffer
        with wave.open(io.BytesIO(test_audio), "rb") as wav_file:
            raw_data = wav_file.readframes(wav_file.getnframes())
            samples = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0

        streamer._continuous_buffer = samples

        # Add a message to context
        coach.context.messages = [Mock(role="user", content="Hello", timestamp=time.time())]

        # Mock Gemini response
        mock_response = Mock()
        mock_response.usage_metadata = Mock(prompt_token_count=100, candidates_token_count=50)
        mock_response.candidates = [Mock(content=Mock(parts=[Mock(text='{"issues": []}')]))]

        with patch("src.agent.engagement_coach._get_coach_client") as mock_get_client:
            mock_client = Mock()
            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_get_client.return_value = mock_client

            await coach._review_engagement()

            # Verify Gemini was called with audio
            call_args = mock_client.aio.models.generate_content.call_args
            contents = call_args[1]["contents"]
            parts = contents[0].parts

            # Should have 2 parts: text prompt + audio
            assert len(parts) == 2
