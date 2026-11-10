"""LLM provider abstraction layer."""

from agent.llm.anthropic import AnthropicProvider
from agent.llm.base import (
    LLMConfig,
    LLMMessage,
    LLMProvider,
    LLMStreamEvent,
    LLMStreamResult,
    LLMToolCall,
    LLMToolDefinition,
    LLMToolResult,
    StreamEventType,
    TextBlock,
    ThinkingBlock,
    ToolCallBlock,
)
from agent.llm.gemini import GeminiProvider
from agent.llm.openai import OpenAIProvider


def create_provider(provider_name: str, config: LLMConfig) -> LLMProvider:
    """
    Factory function to create an LLM provider.

    Args:
        provider_name: Name of the provider ('anthropic', 'openai', or 'gemini')
        config: LLM configuration

    Returns:
        An instance of the appropriate LLMProvider
    """
    providers = {
        "anthropic": AnthropicProvider,
        "openai": OpenAIProvider,
        "gemini": GeminiProvider,
    }

    if provider_name not in providers:
        raise ValueError(f"Unknown provider: {provider_name}. Available: {list(providers.keys())}")

    return providers[provider_name](config)


__all__ = [
    # Factory
    "create_provider",
    # Providers
    "AnthropicProvider",
    "GeminiProvider",
    "OpenAIProvider",
    # Base types
    "LLMConfig",
    "LLMMessage",
    "LLMProvider",
    "LLMStreamEvent",
    "LLMStreamResult",
    "LLMToolCall",
    "LLMToolDefinition",
    "LLMToolResult",
    "StreamEventType",
    "TextBlock",
    "ThinkingBlock",
    "ToolCallBlock",
]
