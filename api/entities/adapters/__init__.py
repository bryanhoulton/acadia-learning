from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

from utils.llms import format_schema_for_openai
from utils.serializers import UUIDJSONEncoder

if TYPE_CHECKING:
    from entities.runtime import EntityRuntime
logger = logging.getLogger(__name__)


def format_time_ago(seconds: float | int | None) -> str:
    """Format seconds ago into a human-readable string."""
    if seconds is None:
        return "unknown time ago"

    seconds = abs(float(seconds))
    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f"{minutes} min ago"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"{hours}h ago"
    else:
        days = int(seconds / 86400)
        return f"{days}d ago"


def format_duration(seconds: float | int | None) -> str:
    """Format duration in seconds to human-readable string."""
    if seconds is None:
        return "unknown"

    seconds = abs(float(seconds))
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        secs = int(seconds % 60)
        return f"{minutes}m {secs}s" if secs else f"{minutes}m"
    else:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        return f"{hours}h {minutes}m" if minutes else f"{hours}h"


__all__ = [
    "Tool",
    "Adapter",
    "ADAPTER_REGISTRY",
    "format_time_ago",
    "format_duration",
]


class Tool:
    """Base class for a tool that can be exposed to the LLM."""

    # Override in subclasses
    name: str = "tool"
    description: str = ""
    parameters: dict[str, dict[str, Any]] = {}
    pydantic: dict | None = None

    def execute(self, runtime: EntityRuntime, parameters: dict[str, Any]) -> str | dict | list | int | float | bool:
        """Subclasses implement their logic here and return a string response."""
        raise NotImplementedError

    def format_result(self, result: str | dict | list | int | float | bool) -> str:
        """Format the result into a human-readable string.

        Override this in subclasses to provide custom formatting for tool outputs.
        This makes the agent's context cleaner and easier to understand than raw JSON.

        Args:
            result: The raw result from execute()

        Returns:
            A human-readable string representation of the result
        """
        # Default implementation: JSON for complex types, str for simple types
        if isinstance(result, dict | list):
            return json.dumps(result, cls=UUIDJSONEncoder, indent=2)
        return str(result)

    # ------------------------------------------------------------------
    # Helper utilities
    # ------------------------------------------------------------------
    def _ensure_strict_schema(self, schema: dict[str, Any]) -> dict[str, Any]:
        """
        Recursively ensure all objects in the schema have additionalProperties: false
        for OpenAI's strict mode.
        """
        if isinstance(schema, dict):
            # If this is an object type, ensure it has additionalProperties: false
            if schema.get("type") == "object":
                schema = schema.copy()
                if "additionalProperties" not in schema:
                    schema["additionalProperties"] = False
                # Recursively process properties
                if "properties" in schema:
                    schema["properties"] = {
                        key: self._ensure_strict_schema(value) for key, value in schema["properties"].items()
                    }
            # Recursively process other dict values
            else:
                schema = {
                    key: self._ensure_strict_schema(value) if isinstance(value, dict) else value
                    for key, value in schema.items()
                }
        return schema

    def to_schema(self) -> dict[str, Any]:
        """Return JSON schema for OpenAI tool specification."""
        if self.pydantic:
            return {
                "type": "function",
                "name": self.name,
                "description": self.description,
                "parameters": format_schema_for_openai(self.pydantic),
                "strict": True,
            }

        # Build the base parameters schema
        properties = {
            "reasoning": {
                "type": "string",
                "description": "A detailed explanation of the tool's reasoning.",
            },
            **self.parameters,
        }

        # Ensure all nested objects have additionalProperties: false
        properties = {key: self._ensure_strict_schema(value) for key, value in properties.items()}

        # In strict mode, objects without defined properties cannot be required
        # Filter out such parameters from the required list
        required_params = ["reasoning"]
        for key in self.parameters.keys():
            param = properties[key]
            # Only require parameters that are not objects without properties
            if param.get("type") != "object" or "properties" in param:
                required_params.append(key)

        return {
            "type": "function",
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "additionalProperties": False,
                "required": required_params,
            },
            "strict": True,
        }

    def _execute(self, runtime: EntityRuntime, parameters: dict[str, Any]) -> str:
        """Wrapper around execute catching exceptions and formatting output."""
        logger.info("Executing tool %s with parameters %s", self.name, parameters)
        try:
            result = self.execute(runtime, parameters)
            return self.format_result(result)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Tool %s execution error", self.name)
            return f"Error: {exc}"


class Adapter:
    """Base adapter which aggregates a list of tools."""

    name: str = "adapter"
    description: str = ""
    tools: list[Tool] = []

    def detail(self, entity: EntityRuntime) -> str:  # type: ignore
        pass


# Registry handling ----------------------------------------------------------
ADAPTER_REGISTRY: dict[str, Adapter] = {}


def register_adapter(adapter_cls):
    instance = adapter_cls()
    ADAPTER_REGISTRY[instance.name] = instance
    return adapter_cls
