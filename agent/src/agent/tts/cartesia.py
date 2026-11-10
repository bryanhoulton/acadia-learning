"""Cartesia TTS provider implementation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from livekit.plugins import cartesia

from agent.tts.base import TTSProvider

if TYPE_CHECKING:
    from livekit.agents.tts.tts import TTS


class CartesiaTTSProvider(TTSProvider):
    """TTS provider using Cartesia."""

    DEFAULT_MODEL = "sonic-3"
    # Default voice - Katie (stable, realistic voice good for voice agents)
    DEFAULT_VOICE = "f786b574-daa5-4673-aa0c-cbe3e8534c02"
    # Use 44100 Hz for compatibility with ElevenLabs when switching providers
    DEFAULT_SAMPLE_RATE = 44100

    def _create_tts(self) -> "TTS":
        """Create a Cartesia TTS instance."""
        model = self.config.model or self.DEFAULT_MODEL

        # Use the configured sample rate (default is 44100 Hz for compatibility)
        sample_rate = self.config.sample_rate if self.config.sample_rate else self.DEFAULT_SAMPLE_RATE

        # Build kwargs for Cartesia TTS
        kwargs = {
            "model": model,
            "voice": self.config.voice_id,
            "language": self.config.language,
            "sample_rate": sample_rate,
            **self.config.extra_options,
        }

        # Add optional parameters if provided in extra_options
        if "speed" in self.config.extra_options:
            kwargs["speed"] = self.config.extra_options.pop("speed")
        if "emotion" in self.config.extra_options:
            kwargs["emotion"] = self.config.extra_options.pop("emotion")

        return cartesia.TTS(**kwargs)

    @property
    def name(self) -> str:
        return "cartesia"

    @property
    def default_model(self) -> str:
        return self.DEFAULT_MODEL
