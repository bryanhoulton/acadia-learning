"""Base classes and types for TTS provider abstraction."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from livekit.agents.tts.tts import TTS, SynthesizeStream


@dataclass
class TTSConfig:
    """Configuration for a TTS provider."""

    voice_id: str
    model: str | None = None  # Provider-specific model name
    sample_rate: int = 44100  # Use 44100 Hz for compatibility across providers
    enable_ssml: bool = True
    language: str = "en"

    # Provider-specific options
    extra_options: dict[str, Any] = field(default_factory=dict)


class TTSProvider(ABC):
    """Abstract base class for TTS providers."""

    def __init__(self, config: TTSConfig):
        self.config = config
        self._tts: TTS | None = None

    @abstractmethod
    def _create_tts(self) -> "TTS":
        """Create the underlying TTS instance. Must be implemented by subclasses."""
        raise NotImplementedError

    @property
    def tts(self) -> "TTS":
        """Get the underlying TTS instance, creating it if necessary."""
        if self._tts is None:
            self._tts = self._create_tts()
        return self._tts

    @property
    def sample_rate(self) -> int:
        """Get the sample rate for audio output."""
        return self.tts.sample_rate

    @property
    def num_channels(self) -> int:
        """Get the number of audio channels."""
        return self.tts.num_channels

    def synthesize(self, text: str):
        """
        Synthesize speech from text.

        Args:
            text: The text to synthesize

        Returns:
            An async iterator of audio chunks
        """
        return self.tts.synthesize(text=text)

    def stream(self) -> "SynthesizeStream":
        """
        Create a streaming synthesis session.

        Returns:
            A SynthesizeStream for streaming TTS
        """
        return self.tts.stream()

    def update_voice(self, voice_id: str):
        """
        Update the voice ID and recreate the TTS instance.

        Args:
            voice_id: The new voice ID to use
        """
        self.config.voice_id = voice_id
        self._tts = self._create_tts()

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of this provider (e.g., 'elevenlabs', 'cartesia')."""
        raise NotImplementedError

    @property
    @abstractmethod
    def default_model(self) -> str:
        """Default model for this provider."""
        raise NotImplementedError
