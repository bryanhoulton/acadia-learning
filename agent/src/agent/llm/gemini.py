"""Google Gemini LLM provider implementation."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any, AsyncIterator

from google import genai  # type: ignore[attr-defined]
from google.genai import types

from agent.llm.base import (
    LLMConfig,
    LLMMessage,
    LLMProvider,
    LLMStreamEvent,
    LLMStreamResult,
    LLMToolDefinition,
    StreamEventType,
    TextBlock,
    ThinkingBlock,
    ToolCallBlock,
)

logger = logging.getLogger(__name__)


# Keys not supported by Gemini's Schema
_UNSUPPORTED_SCHEMA_KEYS = {
    "$defs",
    "$ref",
    "discriminator",
    "oneOf",
    "anyOf",
    "allOf",
    "not",
    "if",
    "then",
    "else",
    "const",
    "additionalProperties",
}


def _simplify_schema(schema: dict[str, Any], defs: dict[str, Any] | None = None) -> dict[str, Any]:
    """Simplify JSON schema for Gemini compatibility by removing unsupported features."""
    # Get definitions from schema if not provided
    resolved_defs: dict[str, Any] = defs if defs is not None else schema.get("$defs", {})

    # Handle $ref - resolve it inline
    if "$ref" in schema:
        ref_name = schema["$ref"].split("/")[-1]
        if ref_name in resolved_defs:
            return _simplify_schema(resolved_defs[ref_name], resolved_defs)
        # Can't resolve, return generic object
        return {"type": "object"}

    # Handle oneOf/anyOf - just use the first option as a simplification
    for union_key in ("oneOf", "anyOf"):
        if union_key in schema and isinstance(schema[union_key], list) and schema[union_key]:
            # Use first option and merge with other properties
            first_option = _simplify_schema(schema[union_key][0], resolved_defs)
            other_props = {k: v for k, v in schema.items() if k not in _UNSUPPORTED_SCHEMA_KEYS}
            return {**other_props, **first_option}

    # Remove unsupported keys and recursively process
    resolved: dict[str, Any] = {}
    for key, value in schema.items():
        if key in _UNSUPPORTED_SCHEMA_KEYS:
            continue
        elif isinstance(value, dict):
            resolved[key] = _simplify_schema(value, resolved_defs)
        elif isinstance(value, list):
            resolved[key] = [
                _simplify_schema(item, resolved_defs) if isinstance(item, dict) else item for item in value
            ]
        else:
            resolved[key] = value

    return resolved


class GeminiProvider(LLMProvider):
    """Google Gemini provider with thinking support."""

    # Pricing per 1M tokens by model (from https://ai.google.dev/pricing)
    MODEL_PRICING = {
        # Gemini 3 series
        "gemini-3-pro": {
            "input_small": 2.00,  # prompts <= 200k tokens
            "input_large": 4.00,  # prompts > 200k tokens
            "output_small": 12.00,
            "output_large": 18.00,
            "cache_read_small": 0.20,
            "cache_read_large": 0.40,
        },
        "gemini-3-flash": {
            "input": 0.50,  # text/image/video; audio is 2x ($1.00)
            "output": 3.00,
            "cache_read": 0.05,  # text/image/video; audio is 2x ($0.10)
        },
        # Gemini 2.5 series
        "gemini-2.5-pro": {
            "input_small": 1.25,  # prompts <= 200k tokens
            "input_large": 2.50,  # prompts > 200k tokens
            "output_small": 10.00,
            "output_large": 15.00,
            "cache_read_small": 0.125,
            "cache_read_large": 0.25,
        },
        "gemini-2.5-flash": {
            "input": 0.30,  # text/image/video; audio is ~3.3x ($1.00)
            "output": 2.50,
            "cache_read": 0.03,  # text/image/video; audio is ~3.3x ($0.10)
        },
    }
    # Default pricing (flash)
    DEFAULT_PRICING = MODEL_PRICING["gemini-3-flash"]

    def __init__(self, config: LLMConfig):
        super().__init__(config)
        self.client = genai.Client()

        # Get pricing for this model
        self._pricing = self._get_pricing(config.model)

    @classmethod
    def _get_pricing(cls, model: str) -> dict[str, float]:
        """Get pricing for a model, supporting exact and prefix matching."""
        # Exact match
        if model in cls.MODEL_PRICING:
            return cls.MODEL_PRICING[model]
        # Prefix match (e.g., "gemini-3-flash-preview" matches "gemini-3-flash")
        for key in cls.MODEL_PRICING:
            if model.startswith(key):
                return cls.MODEL_PRICING[key]
        return cls.DEFAULT_PRICING

    @property
    def name(self) -> str:
        return "gemini"

    def convert_tools(self, tools: list[LLMToolDefinition]) -> list[types.Tool]:
        """Convert to Gemini tool format."""
        function_declarations = []
        for tool in tools:
            # Simplify schema for Gemini compatibility and convert to Schema object
            parameters = None
            if tool.input_schema:
                simplified_schema = _simplify_schema(tool.input_schema)
                parameters = types.Schema.model_validate(simplified_schema)
            function_declarations.append(
                types.FunctionDeclaration(
                    name=tool.name,
                    description=tool.description,
                    parameters=parameters,
                )
            )
        return [types.Tool(function_declarations=function_declarations)]

    def convert_messages(self, messages: list[LLMMessage]) -> list[types.Content]:
        """Convert provider-agnostic messages to Gemini format."""
        result: list[types.Content] = []

        for msg in messages:
            if msg.role == "system":
                # System messages are handled separately in Gemini
                continue

            parts: list[types.Part] = []

            if msg.tool_results:
                # Tool results - use tool_call_id which contains the function name
                for tr in msg.tool_results:
                    # Extract function name from tool_call_id (format: "call_{name}_{idx}")
                    name_parts = tr.tool_call_id.split("_")
                    func_name = "_".join(name_parts[1:-1]) if len(name_parts) > 2 else tr.tool_call_id
                    parts.append(
                        types.Part.from_function_response(
                            name=func_name,
                            response={"result": tr.content},
                        )
                    )
                result.append(types.Content(role="user", parts=parts))

            elif msg.images or msg.audio:
                # Message with media (images or audio)
                if msg.images:
                    for img in msg.images:
                        media_type = img.get("media_type", "image/jpeg")
                        data = img["data"]
                        parts.append(
                            types.Part.from_bytes(
                                data=data if isinstance(data, bytes) else data.encode(),
                                mime_type=media_type,
                            )
                        )

                if msg.audio:
                    for aud in msg.audio:
                        media_type = aud.get("media_type", "audio/wav")  # Default to WAV for raw audio
                        data = aud["data"]
                        # Audio data is likely bytes or base64 string
                        parts.append(
                            types.Part.from_bytes(
                                data=data if isinstance(data, bytes) else data.encode(),
                                mime_type=media_type,
                            )
                        )

                if isinstance(msg.content, str) and msg.content:
                    parts.append(types.Part.from_text(text=msg.content))

                result.append(types.Content(role="user", parts=parts))

            elif msg.role == "assistant" and msg.tool_calls:
                # Assistant message with tool calls
                for i, tc in enumerate(msg.tool_calls):
                    # Build function call
                    func_call = types.FunctionCall(
                        name=tc.name,
                        args=tc.arguments if isinstance(tc.arguments, dict) else {},
                    )
                    # Include thought signature if present (required for Gemini 3)
                    # Per docs, only the first function call in each step needs the signature
                    if i == 0 and tc.thought_signature:
                        # thought_signature is stored as base64 string, decode back to bytes
                        if isinstance(tc.thought_signature, str):
                            sig_bytes = base64.b64decode(tc.thought_signature)
                        else:
                            sig_bytes = tc.thought_signature
                        parts.append(types.Part(functionCall=func_call, thoughtSignature=sig_bytes))
                    else:
                        parts.append(types.Part(functionCall=func_call))

                if isinstance(msg.content, str) and msg.content:
                    parts.insert(0, types.Part.from_text(text=msg.content))

                result.append(types.Content(role="model", parts=parts))

            elif isinstance(msg.content, str):
                # Simple text message
                if msg.content.strip():
                    role = "model" if msg.role == "assistant" else "user"
                    result.append(
                        types.Content(
                            role=role,
                            parts=[types.Part.from_text(text=msg.content)],
                        )
                    )

        return result

    async def stream(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        tools: list[LLMToolDefinition],
    ) -> AsyncIterator[LLMStreamEvent]:
        """Stream responses from Gemini."""
        # Local accumulation
        accumulated_text = []
        accumulated_thinking = []
        accumulated_tool_calls = {}

        converted_messages = self.convert_messages(messages)
        converted_tools = self.convert_tools(tools)

        # Build generation config
        generation_config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=self.config.max_tokens,
            tools=converted_tools if converted_tools else None,
        )

        # Force function calling when tools are available
        if converted_tools:
            generation_config.tool_config = types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode=types.FunctionCallingConfigMode.ANY)
            )

        if self.config.temperature is not None:
            generation_config.temperature = self.config.temperature

        # Add thinking config for thinking-capable models (2.5+, 3)
        # Note: Setting a low thinking_budget (e.g., 1024) breaks thought summaries with tools!
        # Either omit thinking_budget (dynamic thinking) or use a high value (8192+)
        is_thinking_model = any(x in self.config.model for x in ["2.5", "3-pro", "3-flash"])
        if is_thinking_model:
            thinking_config_kwargs: dict[str, Any] = {
                "include_thoughts": True,
                "thinking_level": "high",
            }
            # Only set thinking_budget if it's high enough to not break thought summaries
            if self.config.thinking_budget and self.config.thinking_budget >= 8192:
                thinking_config_kwargs["thinking_budget"] = self.config.thinking_budget
            generation_config.thinking_config = types.ThinkingConfig(**thinking_config_kwargs)

        # Emit message start
        yield LLMStreamEvent(type=StreamEventType.MESSAGE_START)

        text_block_started = False
        thinking_block_started = False
        active_tool_indices: set[int] = set()
        tool_index = 0

        response_stream = await self.client.aio.models.generate_content_stream(
            model=self.config.model,
            contents=converted_messages,
            config=generation_config,
        )
        async for chunk in response_stream:
            # Safely get parts - content or parts can be None
            parts = []
            if chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts:
                parts = chunk.candidates[0].content.parts
            for part in parts:
                # Handle thinking/thought summaries
                is_thought = getattr(part, "thought", False)
                if is_thought:
                    if not thinking_block_started:
                        yield LLMStreamEvent(
                            type=StreamEventType.CONTENT_BLOCK_START,
                            index=0,
                            block_type="thinking",
                        )
                        thinking_block_started = True

                    if part.text:
                        yield LLMStreamEvent(
                            type=StreamEventType.CONTENT_BLOCK_DELTA,
                            index=0,
                            thinking_delta=part.text,
                        )
                        accumulated_thinking.append(part.text)

                # Handle text content
                elif part.text:
                    block_idx = 1 if thinking_block_started else 0
                    if not text_block_started:
                        yield LLMStreamEvent(
                            type=StreamEventType.CONTENT_BLOCK_START,
                            index=block_idx,
                            block_type="text",
                        )
                        text_block_started = True
                    yield LLMStreamEvent(
                        type=StreamEventType.CONTENT_BLOCK_DELTA,
                        index=block_idx,
                        text_delta=part.text,
                    )
                    accumulated_text.append(part.text)

                # Handle function calls
                elif hasattr(part, "function_call") and part.function_call:
                    fc = part.function_call
                    base_idx = (1 if thinking_block_started else 0) + (1 if text_block_started else 0)
                    stream_idx = base_idx + tool_index

                    # Capture thought signature if present (required for Gemini 3)
                    thought_sig = None
                    if hasattr(part, "thought_signature") and part.thought_signature:
                        # Base64 encode bytes for storage (thought_signature is binary, not UTF-8)
                        if isinstance(part.thought_signature, bytes):
                            thought_sig = base64.b64encode(part.thought_signature).decode("ascii")
                        else:
                            thought_sig = part.thought_signature

                    # Store tool call with thought signature
                    accumulated_tool_calls[tool_index] = {
                        "id": f"call_{fc.name}_{tool_index}",
                        "name": fc.name,
                        "arguments": dict(fc.args) if fc.args else {},
                        "thought_signature": thought_sig,
                    }

                    yield LLMStreamEvent(
                        type=StreamEventType.CONTENT_BLOCK_START,
                        index=stream_idx,
                        block_type="tool_use",
                        block_id=accumulated_tool_calls[tool_index]["id"],
                        tool_name=fc.name,
                    )

                    # Emit the arguments as JSON delta
                    args_json = json.dumps(accumulated_tool_calls[tool_index]["arguments"])
                    yield LLMStreamEvent(
                        type=StreamEventType.CONTENT_BLOCK_DELTA,
                        index=stream_idx,
                        input_json_delta=args_json,
                    )

                    active_tool_indices.add(stream_idx)
                    tool_index += 1

        # Emit stops for any active blocks
        if thinking_block_started:
            yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=0)

        if text_block_started:
            block_idx = 1 if thinking_block_started else 0
            yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=block_idx)

        for idx in sorted(active_tool_indices):
            yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=idx)

        yield LLMStreamEvent(type=StreamEventType.MESSAGE_STOP)

    async def stream_complete(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        tools: list[LLMToolDefinition],
    ) -> tuple[AsyncIterator[LLMStreamEvent], asyncio.Future[LLMStreamResult], dict[str, Any]]:
        """Stream and collect the final result."""
        # Local accumulation
        accumulated_text = []
        accumulated_thinking = []
        accumulated_tool_calls = {}

        converted_messages = self.convert_messages(messages)
        converted_tools = self.convert_tools(tools)

        # Build generation config
        generation_config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=self.config.max_tokens,
            tools=converted_tools if converted_tools else None,
        )

        # Force function calling when tools are available
        if converted_tools:
            generation_config.tool_config = types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode=types.FunctionCallingConfigMode.ANY)
            )

        if self.config.temperature is not None:
            generation_config.temperature = self.config.temperature

        # Add thinking config for thinking-capable models (2.5+, 3)
        # Note: Setting a low thinking_budget (e.g., 1024) breaks thought summaries with tools!
        # Either omit thinking_budget (dynamic thinking) or use a high value (8192+)
        is_thinking_model = any(x in self.config.model for x in ["2.5", "3-pro", "3-flash"])
        if is_thinking_model:
            thinking_config_kwargs: dict[str, Any] = {
                "include_thoughts": True,
                "thinking_level": "high",
            }
            # Only set thinking_budget if it's high enough to not break thought summaries
            if self.config.thinking_budget and self.config.thinking_budget >= 8192:
                thinking_config_kwargs["thinking_budget"] = self.config.thinking_budget
            generation_config.thinking_config = types.ThinkingConfig(**thinking_config_kwargs)
            logger.info(f"🧠 Thinking enabled for {self.config.model} with config: {thinking_config_kwargs}")

        # Build kwargs representation for tracing (what we're sending to the API)
        # Serialize messages to dicts for JSON compatibility
        serialized_messages = []
        for msg in converted_messages:
            msg_dict: dict[str, Any] = {"role": msg.role, "parts": []}
            if msg.parts:
                for part in msg.parts:
                    if hasattr(part, "text") and part.text:
                        msg_dict["parts"].append({"type": "text", "text": part.text})
                    elif hasattr(part, "function_call") and part.function_call:
                        msg_dict["parts"].append(
                            {
                                "type": "function_call",
                                "name": part.function_call.name,
                                "args": dict(part.function_call.args) if part.function_call.args else {},
                            }
                        )
                    elif hasattr(part, "function_response") and part.function_response:
                        msg_dict["parts"].append(
                            {
                                "type": "function_response",
                                "name": part.function_response.name,
                                "response": part.function_response.response,
                            }
                        )
            serialized_messages.append(msg_dict)

        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": serialized_messages,
            "system": system_prompt,
            "max_output_tokens": self.config.max_tokens,
        }
        if self.config.temperature is not None:
            kwargs["temperature"] = self.config.temperature
        if self.config.thinking_budget:
            kwargs["thinking_budget"] = self.config.thinking_budget

        result_future: asyncio.Future[LLMStreamResult] = asyncio.Future()

        async def event_generator() -> AsyncIterator[LLMStreamEvent]:
            try:
                # Emit message start
                yield LLMStreamEvent(type=StreamEventType.MESSAGE_START)

                text_block_started = False
                thinking_block_started = False
                active_tool_indices: set[int] = set()
                tool_index = 0
                input_tokens = 0
                output_tokens = 0
                chunk_count = 0

                response_stream = await self.client.aio.models.generate_content_stream(
                    model=self.config.model,
                    contents=converted_messages,
                    config=generation_config,
                )
                async for chunk in response_stream:
                    chunk_count += 1

                    # Track usage
                    if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                        input_tokens = chunk.usage_metadata.prompt_token_count or 0
                        output_tokens = chunk.usage_metadata.candidates_token_count or 0

                    # Safely get parts - content or parts can be None
                    parts = []
                    if chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts:
                        parts = chunk.candidates[0].content.parts

                    for part in parts:
                        # Handle thinking/thought summaries
                        # Per Gemini docs: part.thought is a boolean, part.text contains the thought summary
                        is_thought = getattr(part, "thought", False)

                        if is_thought:
                            if not thinking_block_started:
                                yield LLMStreamEvent(
                                    type=StreamEventType.CONTENT_BLOCK_START,
                                    index=0,
                                    block_type="thinking",
                                )
                                thinking_block_started = True

                            if part.text:
                                yield LLMStreamEvent(
                                    type=StreamEventType.CONTENT_BLOCK_DELTA,
                                    index=0,
                                    thinking_delta=part.text,
                                )
                                accumulated_thinking.append(part.text)

                        # Handle text content
                        elif part.text:
                            block_idx = 1 if thinking_block_started else 0
                            if not text_block_started:
                                yield LLMStreamEvent(
                                    type=StreamEventType.CONTENT_BLOCK_START,
                                    index=block_idx,
                                    block_type="text",
                                )
                                text_block_started = True
                            yield LLMStreamEvent(
                                type=StreamEventType.CONTENT_BLOCK_DELTA,
                                index=block_idx,
                                text_delta=part.text,
                            )
                            accumulated_text.append(part.text)

                        # Handle function calls
                        elif hasattr(part, "function_call") and part.function_call:
                            fc = part.function_call
                            base_idx = (1 if thinking_block_started else 0) + (1 if text_block_started else 0)
                            stream_idx = base_idx + tool_index

                            # Capture thought signature if present (required for Gemini 3)
                            thought_sig = None
                            if hasattr(part, "thought_signature") and part.thought_signature:
                                # Base64 encode bytes for storage (thought_signature is binary, not UTF-8)
                                if isinstance(part.thought_signature, bytes):
                                    thought_sig = base64.b64encode(part.thought_signature).decode("ascii")
                                else:
                                    thought_sig = part.thought_signature

                            # Store tool call with thought signature
                            accumulated_tool_calls[tool_index] = {
                                "id": f"call_{fc.name}_{tool_index}",
                                "name": fc.name,
                                "arguments": dict(fc.args) if fc.args else {},
                                "thought_signature": thought_sig,
                            }

                            yield LLMStreamEvent(
                                type=StreamEventType.CONTENT_BLOCK_START,
                                index=stream_idx,
                                block_type="tool_use",
                                block_id=accumulated_tool_calls[tool_index]["id"],
                                tool_name=fc.name,
                            )

                            # Emit the arguments as JSON delta
                            args_json = json.dumps(accumulated_tool_calls[tool_index]["arguments"])
                            yield LLMStreamEvent(
                                type=StreamEventType.CONTENT_BLOCK_DELTA,
                                index=stream_idx,
                                input_json_delta=args_json,
                            )

                            active_tool_indices.add(stream_idx)
                            tool_index += 1

                # Emit stops for any active blocks
                if thinking_block_started:
                    yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=0)

                if text_block_started:
                    block_idx = 1 if thinking_block_started else 0
                    yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=block_idx)

                for idx in sorted(active_tool_indices):
                    yield LLMStreamEvent(type=StreamEventType.CONTENT_BLOCK_STOP, index=idx)

                yield LLMStreamEvent(type=StreamEventType.MESSAGE_STOP)

                # Build final result
                thinking_text = "".join(accumulated_thinking)
                text_content = "".join(accumulated_text)

                logger.info(
                    f"🧠 Gemini stream complete - {chunk_count} chunks, thinking: {len(thinking_text)} chars, text: {len(text_content)} chars, tools: {len(accumulated_tool_calls)}"
                )

                thinking_blocks = [ThinkingBlock(thinking=thinking_text)] if thinking_text else []
                text_blocks = [TextBlock(text=text_content)] if text_content else []
                tool_calls = [
                    ToolCallBlock(
                        id=tc["id"],
                        name=tc["name"],
                        input=tc["arguments"],
                        thought_signature=tc.get("thought_signature"),
                    )
                    for tc in accumulated_tool_calls.values()
                ]

                result = LLMStreamResult(
                    thinking_blocks=thinking_blocks,
                    text_blocks=text_blocks,
                    tool_calls=tool_calls,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
                result_future.set_result(result)

            except Exception as e:
                logger.error(f"Gemini API error: {e}")
                result_future.set_exception(e)
                raise

        return event_generator(), result_future, kwargs

    def calculate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
        cache_creation_tokens: int = 0,
        cache_read_tokens: int = 0,
    ) -> float:
        """Calculate cost for Gemini request based on model pricing."""
        cost = 0.0

        # Total input tokens including cache read/creation
        total_input = input_tokens + cache_read_tokens + cache_creation_tokens

        # Check if we have tiered pricing (Gemini 3 Pro)
        if "input_small" in self._pricing:
            is_large = total_input > 200_000
            input_rate = self._pricing["input_large"] if is_large else self._pricing["input_small"]
            output_rate = self._pricing["output_large"] if is_large else self._pricing["output_small"]
            cache_rate = self._pricing["cache_read_large"] if is_large else self._pricing["cache_read_small"]

            cost += input_tokens * input_rate / 1_000_000
            cost += output_tokens * output_rate / 1_000_000
            cost += cache_read_tokens * cache_rate / 1_000_000
            # Note: cache creation is typically charged at full input rate
            cost += cache_creation_tokens * input_rate / 1_000_000
        else:
            # Standard single-tier pricing
            cost += input_tokens * self._pricing.get("input", 0) / 1_000_000
            cost += output_tokens * self._pricing.get("output", 0) / 1_000_000
            cost += cache_read_tokens * self._pricing.get("cache_read", 0) / 1_000_000
            # Note: cache creation is typically charged at full input rate
            cost += cache_creation_tokens * self._pricing.get("input", 0) / 1_000_000

        return cost
