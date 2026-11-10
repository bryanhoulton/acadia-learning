"""ElevenLabs TTS provider implementation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from livekit.plugins import elevenlabs

from agent.tts.base import TTSProvider

if TYPE_CHECKING:
    from livekit.agents.tts.tts import TTS


# Map sample rates to ElevenLabs encoding formats
_SAMPLE_RATE_TO_ENCODING = {
    22050: "mp3_22050_32",
    44100: "mp3_44100_32",
}


class ElevenLabsTTSProvider(TTSProvider):
    """TTS provider using ElevenLabs."""

    DEFAULT_MODEL = "eleven_turbo_v2_5"
    # Use 44100 Hz for compatibility with Cartesia when switching providers
    DEFAULT_SAMPLE_RATE = 44100

    def _create_tts(self) -> "TTS":
        """Create an ElevenLabs TTS instance."""
        model = self.config.model or self.DEFAULT_MODEL

        # Determine encoding based on sample rate for compatibility with other providers
        sample_rate = self.config.sample_rate if self.config.sample_rate else self.DEFAULT_SAMPLE_RATE
        encoding = _SAMPLE_RATE_TO_ENCODING.get(sample_rate, "mp3_44100_32")

        return elevenlabs.TTS(
            model=model,
            voice_id=self.config.voice_id,
            encoding=encoding,
            enable_ssml_parsing=self.config.enable_ssml,
            **self.config.extra_options,
        )

    @property
    def name(self) -> str:
        return "elevenlabs"

    @property
    def default_model(self) -> str:
        return self.DEFAULT_MODEL
