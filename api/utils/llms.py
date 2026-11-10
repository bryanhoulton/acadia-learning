import logging
import time
from collections.abc import Callable
from typing import Any

import tiktoken
from openai.types.responses import Response, ResponseUsage
from openai.types.shared import ChatModel
from pydantic import BaseModel

from api.settings import oai
from utils.posthog import track_cost

logger = logging.getLogger(__name__)


class Price(BaseModel):
    """All in USD/million tokens"""

    input_price: float
    cached_input_price: float  # Cache read price
    cache_write_price: float = 0.0  # Cache creation price (defaults to 0 for OpenAI)
    output_price: float


PRICES: dict[ChatModel | str, Price] = {
    # OpenAI models (no separate cache write pricing)
    "o3": Price(input_price=2, cached_input_price=0.3125, output_price=8),
    "gpt-5": Price(input_price=1.25, cached_input_price=0.125, output_price=10),
    "gpt-5.2": Price(input_price=1.25, cached_input_price=0.125, output_price=10),
    "o4-mini": Price(input_price=1.1, cached_input_price=0.275, output_price=4.4),
    "gpt-4o-mini": Price(input_price=0.15, cached_input_price=0.075, output_price=0.6),
    "gpt-4.1": Price(input_price=2.0, cached_input_price=0.5, output_price=8.0),
    "gpt-4.1-mini": Price(input_price=0.4, cached_input_price=0.1, output_price=1.6),
    "gpt-4.1-nano": Price(input_price=0.1, cached_input_price=0.025, output_price=0.4),
    # Claude models (prices per million tokens from https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
    "claude-opus-4-6": Price(input_price=5, cached_input_price=0.5, cache_write_price=6.25, output_price=25),
    "claude-opus-4-5": Price(input_price=5, cached_input_price=0.5, cache_write_price=6.25, output_price=25),
    "claude-opus-4": Price(input_price=15, cached_input_price=1.5, cache_write_price=18.75, output_price=75),
    "claude-sonnet-4-5": Price(input_price=3, cached_input_price=0.3, cache_write_price=3.75, output_price=15),
    "claude-sonnet-4": Price(input_price=3, cached_input_price=0.3, cache_write_price=3.75, output_price=15),
    "claude-3-7-sonnet": Price(input_price=3, cached_input_price=0.3, cache_write_price=3.75, output_price=15),
    "claude-haiku-4-5": Price(input_price=1, cached_input_price=0.1, cache_write_price=1.25, output_price=5),
    "claude-3-5-haiku": Price(input_price=0.8, cached_input_price=0.08, cache_write_price=1.0, output_price=4),
}


def retry_openai_call(
    openai_call_func: Callable[[], Any],
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    backoff_multiplier: float = 2.0,
    entity_id: str | None = None,
) -> Response:
    """
    Retry an OpenAI call with exponential backoff when it gets flagged or encounters retryable errors.

    Args:
        openai_call_func: Function that makes the OpenAI API call
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay between retries in seconds
        max_delay: Maximum delay between retries in seconds
        backoff_multiplier: Multiplier for exponential backoff
        entity_id: Optional entity ID for logging context

    Returns:
        The response from the OpenAI call

    Raises:
        Exception: If all retries are exhausted or a non-retryable error occurs
    """
    last_exception = None
    delay = base_delay

    for attempt in range(max_retries + 1):  # +1 for initial attempt
        try:
            response = openai_call_func()

            # Check if the response has an error
            if hasattr(response, "error") and response.error:
                error_message = response.error.message if hasattr(response.error, "message") else str(response.error)

                # Check for retryable errors
                if _is_retryable_error(error_message):
                    if attempt < max_retries:
                        logger.warning(
                            f"OpenAI call failed with retryable error (attempt {attempt + 1}/{max_retries + 1})"
                            f"{f' for entity {entity_id}' if entity_id else ''}: {error_message}. "
                            f"Retrying in {delay} seconds..."
                        )
                        time.sleep(delay)
                        delay = min(delay * backoff_multiplier, max_delay)
                        continue
                    else:
                        logger.error(
                            f"OpenAI call failed after {max_retries + 1} attempts"
                            f"{f' for entity {entity_id}' if entity_id else ''}: {error_message}"
                        )
                        # Ensure we raise a proper exception
                        if isinstance(response.error, Exception):
                            raise response.error
                        else:
                            raise Exception(error_message)
                else:
                    # Non-retryable error, raise immediately
                    logger.error(
                        f"OpenAI call failed with non-retryable error"
                        f"{f' for entity {entity_id}' if entity_id else ''}: {error_message}"
                    )
                    # Ensure we raise a proper exception
                    if isinstance(response.error, Exception):
                        raise response.error
                    else:
                        raise Exception(error_message)

            # Success case
            if attempt > 0:
                logger.info(
                    f"OpenAI call succeeded on attempt {attempt + 1}{f' for entity {entity_id}' if entity_id else ''}"
                )
            return response

        except Exception as e:
            last_exception = e

            # Check if this is a retryable exception
            if _is_retryable_exception(e):
                if attempt < max_retries:
                    logger.warning(
                        f"OpenAI call raised retryable exception (attempt {attempt + 1}/{max_retries + 1})"
                        f"{f' for entity {entity_id}' if entity_id else ''}: {str(e)}. "
                        f"Retrying in {delay} seconds..."
                    )
                    time.sleep(delay)
                    delay = min(delay * backoff_multiplier, max_delay)
                    continue
                else:
                    logger.error(
                        f"OpenAI call failed after {max_retries + 1} attempts"
                        f"{f' for entity {entity_id}' if entity_id else ''}: {str(e)}"
                    )
                    raise
            else:
                # Non-retryable exception, raise immediately
                logger.error(
                    f"OpenAI call failed with non-retryable exception"
                    f"{f' for entity {entity_id}' if entity_id else ''}: {str(e)}"
                )
                raise

    # This should never be reached, but just in case
    if last_exception:
        raise last_exception
    else:
        raise RuntimeError("Unexpected state in retry_openai_call")


def _is_retryable_error(error_message: str) -> bool:
    """
    Check if an OpenAI error message indicates a retryable error.

    Args:
        error_message: The error message from OpenAI

    Returns:
        True if the error is retryable, False otherwise
    """
    error_message_lower = error_message.lower()

    # Common retryable error patterns
    retryable_patterns = [
        "flagged",
        "content policy violation",
        "rate limit",
        "server error",
        "internal error",
        "temporarily unavailable",
        "timeout",
        "service unavailable",
        "bad gateway",
        "gateway timeout",
        "invalid prompt:",  # Keep existing pattern from runtime.py
    ]

    return any(pattern in error_message_lower for pattern in retryable_patterns)


def _is_retryable_exception(exception: Exception) -> bool:
    """
    Check if an exception indicates a retryable error.

    Args:
        exception: The exception that was raised

    Returns:
        True if the exception is retryable, False otherwise
    """
    exception_str = str(exception).lower()

    # Common retryable exception patterns
    retryable_patterns = [
        "flagged",
        "content policy violation",
        "rate limit",
        "timeout",
        "connection",
        "network",
        "server error",
        "service unavailable",
        "bad gateway",
        "gateway timeout",
    ]

    return any(pattern in exception_str for pattern in retryable_patterns)


# Public function for testing
def is_retryable_error(error) -> bool:
    """
    Public interface to check if an error is retryable.

    Args:
        error: Either an error message string or an exception

    Returns:
        True if the error is retryable, False otherwise
    """
    if isinstance(error, Exception):
        return _is_retryable_exception(error)
    else:
        return _is_retryable_error(str(error))


def track_llm_cost(
    usage: ResponseUsage | Any,  # Also accepts UsageInfo from llm_provider or CompletionUsage
    model: ChatModel | str,
    account_phone: str | None = None,
    category: str = "llm",
    provider: str = "openai",
) -> float:
    """Track LLM cost and return the total cost in USD."""
    # Skip if model is not in PRICES
    if model not in PRICES:
        return 0.0

    price = PRICES[model]

    # Handle both ResponseUsage (input_tokens/output_tokens) and CompletionUsage (prompt_tokens/completion_tokens)
    input_tokens = getattr(usage, "input_tokens", None) or getattr(usage, "prompt_tokens", 0)
    output_tokens = getattr(usage, "output_tokens", None) or getattr(usage, "completion_tokens", 0)

    input_tokens_details = getattr(usage, "input_tokens_details", None) or getattr(usage, "prompt_tokens_details", None)
    cache_read_tokens = getattr(input_tokens_details, "cached_tokens", 0) if input_tokens_details else 0
    cache_creation_tokens = getattr(input_tokens_details, "cache_creation_tokens", 0) if input_tokens_details else 0

    # For Anthropic: input_tokens = uncached + cache_creation (cache_read is separate)
    # For OpenAI: input_tokens includes cached, so we subtract to get uncached
    if provider == "anthropic" or model.startswith("claude-"):
        # Anthropic: input_tokens already excludes cache_read, but includes cache_creation
        uncached_tokens = input_tokens - cache_creation_tokens
        total_input = input_tokens + cache_read_tokens
    else:
        # OpenAI: input_tokens includes cached tokens
        uncached_tokens = input_tokens - cache_read_tokens
        total_input = input_tokens

    # Safety check: uncached_tokens should never be negative
    if uncached_tokens < 0:
        logger.warning(
            f"Negative uncached_tokens ({uncached_tokens}) calculated. "
            f"input_tokens={input_tokens}, cache_read={cache_read_tokens}, "
            f"cache_creation={cache_creation_tokens}. Setting to 0. Model: {model}, Provider: {provider}"
        )
        uncached_tokens = 0

    # Calculate costs separately for each token type
    uncached_cost = uncached_tokens * price.input_price
    cache_read_cost = cache_read_tokens * price.cached_input_price
    cache_write_cost = cache_creation_tokens * price.cache_write_price
    output_cost = output_tokens * price.output_price

    total_cost = (uncached_cost + cache_read_cost + cache_write_cost + output_cost) / 1_000_000

    cache_hit_rate = (cache_read_tokens / total_input * 100) if total_input > 0 else 0

    track_cost(
        total_cost,
        category,
        account_phone,
        input_tokens=uncached_tokens,
        output_tokens=output_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_creation_tokens,
        total_input_tokens=total_input,
        cache_hit_rate=round(cache_hit_rate, 1),
        provider=provider,
        model=model,
    )

    return total_cost


def embed(text: str) -> list[float]:
    return (
        oai.embeddings.create(
            input=text,
            model="text-embedding-3-small",
        )
        .data[0]
        .embedding
    )


def possibly_log_run_id():
    """
    Log the run id if in GitHub Actions. Used for tracking CI logs.

    Note: This is now a no-op since we migrated from Braintrust.
    Run ID tracking can be added via span metadata if needed.
    """
    pass


# Recursively resolve all references
def resolve_refs(obj: dict, defs: dict):
    if isinstance(obj, dict):
        if "$ref" in obj:
            ref = obj["$ref"]
            ref_name = ref.split("/")[-1]
            if ref_name in defs:
                resolved = defs[ref_name].copy()
                return resolve_refs(resolved, defs)
            else:
                return obj
        else:
            resolved = {}
            for key, value in obj.items():
                resolved[key] = resolve_refs(value, defs)
            return resolved
    elif isinstance(obj, list):
        return [resolve_refs(item, defs) for item in obj]
    else:
        return obj


def replace_oneof_with_anyof(obj):
    if isinstance(obj, dict):
        if "oneOf" in obj:
            obj["anyOf"] = obj.pop("oneOf")
        for v in obj.values():
            replace_oneof_with_anyof(v)
    elif isinstance(obj, list):
        for item in obj:
            replace_oneof_with_anyof(item)


def format_schema_for_openai(schema: dict):
    """Format JSON schema for OpenAI API compatibility."""
    schema = schema.copy()
    replace_oneof_with_anyof(schema)

    # Save definitions before resolving
    defs = schema.get("$defs", {})

    # Resolve references in the schema
    schema = resolve_refs(schema, defs)

    # Remove $defs as they're now resolved
    if "$defs" in schema:
        del schema["$defs"]  # type: ignore

    # Fix schema for OpenAI compatibility
    def fix_schema_for_openai(obj):
        if isinstance(obj, dict):
            # Add additionalProperties: false for OpenAI
            if obj.get("type") == "object" and "additionalProperties" not in obj:
                obj["additionalProperties"] = False
            # Make all properties required for OpenAI structured calling
            if obj.get("type") == "object" and "properties" in obj:
                if "required" not in obj:
                    obj["required"] = []
                # Add all property keys to required array
                all_props = set(obj["properties"].keys())
                existing_required = set(obj.get("required", []))
                obj["required"] = list(existing_required.union(all_props))
            # OpenAI supports discriminator fields, so keep them
            for key, value in obj.items():
                fix_schema_for_openai(value)
        elif isinstance(obj, list):
            for item in obj:
                fix_schema_for_openai(item)

    fix_schema_for_openai(schema)
    return schema


def format_schema_for_google(schema: dict):
    """Format JSON schema for Google Generative AI API compatibility."""
    schema = schema.copy()
    replace_oneof_with_anyof(schema)

    # Save definitions before resolving
    defs = schema.get("$defs", {})

    # Resolve references in the schema
    schema = resolve_refs(schema, defs)

    # Remove $defs as they're now resolved
    if "$defs" in schema:
        del schema["$defs"]  # type: ignore

    # Fix schema for Google Generative AI compatibility
    def fix_schema_for_google(obj):
        if isinstance(obj, dict):
            # Don't add additionalProperties for Google Gemini API - it's not supported
            # Remove additionalProperties if it exists
            if "additionalProperties" in obj:
                del obj["additionalProperties"]
            # Make all properties required for structured calling
            if obj.get("type") == "object" and "properties" in obj:
                if "required" not in obj:
                    obj["required"] = []
                # Add all property keys to required array
                all_props = set(obj["properties"].keys())
                existing_required = set(obj.get("required", []))
                obj["required"] = list(existing_required.union(all_props))
            # Remove discriminator fields for Google Generative AI API compatibility
            if "discriminator" in obj:
                del obj["discriminator"]
            for key, value in obj.items():
                fix_schema_for_google(value)
        elif isinstance(obj, list):
            for item in obj:
                fix_schema_for_google(item)

    fix_schema_for_google(schema)
    return schema


def compress(content: str) -> str:
    enc = tiktoken.get_encoding("o200k_base")
    new_content = content

    length = len(enc.encode(new_content))
    while length > 200_000:
        new_content = new_content[: -length - 200_000]
        length = len(enc.encode(new_content))
    return new_content
