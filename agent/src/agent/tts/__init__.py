"""TTS provider abstraction layer."""

from agent.tts.base import TTSConfig, TTSProvider
from agent.tts.cartesia import CartesiaTTSProvider
from agent.tts.elevenlabs import ElevenLabsTTSProvider


def create_tts_provider(provider_name: str, config: TTSConfig) -> TTSProvider:
    """
    Factory function to create a TTS provider.

    Args:
        provider_name: Name of the provider ('elevenlabs' or 'cartesia')
        config: TTS configuration

    Returns:
        An instance of the appropriate TTSProvider
    """
    providers = {
        "elevenlabs": ElevenLabsTTSProvider,
        "cartesia": CartesiaTTSProvider,
    }

    if provider_name not in providers:
        raise ValueError(f"Unknown TTS provider: {provider_name}. Available: {list(providers.keys())}")

    return providers[provider_name](config)


__all__ = [
    # Factory
    "create_tts_provider",
    # Providers
    "CartesiaTTSProvider",
    "ElevenLabsTTSProvider",
    # Base types
    "TTSConfig",
    "TTSProvider",
]
