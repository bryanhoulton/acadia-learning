"""
Playground management for agent.
Handles playground state, guide storage, and communication with frontend.
"""

import asyncio
import json
import logging
import uuid
from enum import Enum
from typing import Any

from jsonschema import Draft7Validator, ValidationError
from livekit.rtc import Room, TextStreamReader
from pydantic import BaseModel

from services.api_service import APIService
from tracing import TracingClient
from utils.CallbackHandler import CallbackHandler
from utils.misc import AgentConfig

logger = logging.getLogger(__name__)


class PlaygroundJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles UUID objects and Enum objects."""

    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, Enum):
            return obj.value
        return super().default(obj)


class PlaygroundJsonSchema(BaseModel):
    """JSON Schema for playground config, state, and action validation."""

    configSchema: dict[str, Any]
    stateSchema: dict[str, Any]
    actionsSchema: dict[str, Any] | None = None


class PlaygroundGuide(BaseModel):
    """Serialized playground guide received from frontend."""

    id: str
    name: str
    icon: str
    gradeRange: dict[str, str]
    interactionModel: str
    cognitiveLevel: str
    bestFor: list[str]
    whenToUse: list[str]
    whenNotToUse: list[str]
    exampleScenarios: list[dict[str, str]]
    visualDetails: dict[str, Any]
    # Human-readable schema documentation
    configSchema: dict[str, Any]
    stateSchema: dict[str, Any]
    # JSON Schema for formal validation (may be null)
    jsonSchema: PlaygroundJsonSchema | None = None
    configurationTips: dict[str, list[str]]
    interactionPresets: dict[str, dict[str, Any]]
    exampleConfigurations: list[dict[str, Any]]
    commonMistakes: list[str]
    # Available ephemeral actions
    actions: dict[str, dict[str, Any]] | None = None


class PlaygroundState(BaseModel):
    """Current playground state."""

    type: str  # "canvas", "number-line", etc.
    config: dict[str, Any] | None = None  # Configuration (permissions, display options, etc.)
    state: dict[str, Any] | None = (
        None  # State data (for canvas: {blocks: [...]}, for number-line: {points: [], jumps: [], regions: []})
    )


class PlaygroundActionItem(BaseModel):
    """Single ephemeral action to trigger on the playground."""

    action: str  # "highlight_value", "animate_jump", etc.
    params: dict[str, Any]


class PlaygroundAction(BaseModel):
    """Ephemeral action(s) to trigger on the playground. Supports batching multiple actions."""

    actions: list[PlaygroundActionItem]


class PlaygroundEvent(BaseModel):
    """Event emitted by a playground (e.g., race complete, drill finished)."""

    type: str
    # Additional fields are allowed
    model_config = {"extra": "allow"}


class PlaygroundManager(CallbackHandler):
    """
    Manages playground state and communication for the agent.

    Responsibilities:
    - Store playground guides received from frontend
    - Manage current playground state
    - Send state updates to frontend
    - Send actions to frontend
    - Provide guide information for LLM tool descriptions
    """

    def __init__(
        self,
        config: AgentConfig,
        room: Room,
        api_service: APIService,
        tracing_client: TracingClient | None = None,
    ):
        self.config = config
        self.room = room
        self.api_service = api_service
        self.tracing_client = tracing_client

        # Guides received from frontend
        self.guides: dict[str, PlaygroundGuide] = {}
        # JSON Schemas for validation (keyed by playground type)
        self.schemas: dict[str, PlaygroundJsonSchema] = {}
        self._guides_received = False

        # Current playground state (None until set by agent or received from frontend)
        self.current_state: PlaygroundState | None = None

        # Separate callback handler for playground events (e.g., race complete, drill finished)
        # Events trigger interrupts, state changes do not
        self._event_callbacks: CallbackHandler = CallbackHandler()

        # Register text stream handlers
        self.room.register_text_stream_handler("playground-guides", self._handle_guides_stream)
        self.room.register_text_stream_handler("playground", self._handle_playground_stream)
        self.room.register_text_stream_handler("playground-events", self._handle_event_stream)

        super().__init__()

    def register_event_callback(self, id: str, callback):
        """Register a callback for playground events (triggers interrupts)."""
        self._event_callbacks.register(id, callback)

    async def emit_event(self, event: PlaygroundEvent):
        """Emit a playground event to all registered event callbacks."""
        await self._event_callbacks.emit(event)

    def __str__(self) -> str:
        """Return JSON representation of current playground state."""
        if self.current_state is None:
            return "null"
        return json.dumps(self.current_state.model_dump(), cls=PlaygroundJSONEncoder)

    def get(self) -> str:
        """Get current playground state as JSON string."""
        return str(self)

    def get_current_type(self) -> str | None:
        """Get the current playground type."""
        return self.current_state.type if self.current_state else None

    def has_guides(self) -> bool:
        """Check if guides have been received from frontend."""
        return self._guides_received

    def get_available_types(self) -> list[str]:
        """Get list of available playground types."""
        return list(self.schemas.keys())

    def get_guide(self, playground_type: str) -> PlaygroundGuide | None:
        """Get the guide for a specific playground type."""
        return self.guides.get(playground_type)

    def get_guides_summary(self) -> str:
        """Get a summary of available playgrounds for tool descriptions."""
        if not self.guides and not self.schemas:
            return "No playground guides available yet. Wait for frontend to send guides."

        summary_parts = ["Available playground types:\n"]

        # Playgrounds with guides
        for guide in self.guides.values():
            summary_parts.append(f"- {guide.id}: {guide.name} - {guide.interactionModel}")

        # Playgrounds with schemas only (no guide)
        for schema_type in self.schemas.keys():
            if schema_type not in self.guides:
                has_actions = " (supports actions)" if self.schemas[schema_type].actionsSchema else ""
                summary_parts.append(f"- {schema_type}: Schema available{has_actions}")

        return "\n".join(summary_parts)

    def get_playground_selection_context(self) -> str:
        """
        Generate context to help the model choose the right playground.
        This should be added to context when guides are received.

        DEPRECATED: Use get_set_playground_description() instead, which embeds
        this information in the tool description rather than as a coaching message.
        """
        if not self.guides and not self.schemas:
            return ""

        parts = [
            "# Available Playgrounds",
            "",
            "You have access to interactive playgrounds to help teach. Choose the right one based on the concept:",
            "",
        ]

        # Include playgrounds with guides (full documentation)
        for guide in self.guides.values():
            parts.append(f"## {guide.icon} {guide.name} ({guide.id})")
            parts.append(f"Grades: {guide.gradeRange.get('primary', 'N/A')}")
            parts.append(f"{guide.interactionModel}")
            parts.append("")

            # When to use (most important for selection)
            parts.append("**Use when:**")
            for item in guide.whenToUse[:4]:
                parts.append(f"- {item}")
            parts.append("")

            # When NOT to use (helps avoid wrong choices)
            parts.append("**Don't use when:**")
            for item in guide.whenNotToUse[:3]:
                parts.append(f"- {item}")
            parts.append("")

        # Include playgrounds with schemas but no guides (basic info only)
        schema_only_types = [t for t in self.schemas.keys() if t not in self.guides]
        if schema_only_types:
            for playground_type in schema_only_types:
                schema = self.schemas[playground_type]
                parts.append(f"## {playground_type}")
                parts.append("Schema available for this playground type.")
                if schema.actionsSchema:
                    parts.append("Supports ephemeral actions.")
                parts.append("")

        parts.append("---")
        parts.append(
            "Before using a playground, call `get_playground_guide(type)` to get the full schema and examples."
        )
        parts.append("Use `set_playground` to display a playground to the student.")

        return "\n".join(parts)

    def get_set_playground_description(self) -> str:
        """
        Generate a complete description for the set_playground tool that includes
        playground selection guidance embedded in it.

        This replaces the coaching message approach - all info needed for
        playground selection is now in the tool description itself.
        """
        types_str = ", ".join(self.get_available_types())

        parts = [
            "Sets the playground content. The playground is the interactive area displayed to the user.",
            "",
            f"Available playground types: {types_str}",
            "",
            "All playground types use the same structure: {type, config, state}",
            "- config: Configuration options (permissions, display settings)",
            "- state: The actual content/data",
            "",
            "IMPORTANT: Before using this tool, call get_playground_guide with the type you want to use",
            "to get the full schema and examples.",
            "",
            "=== STATE SYNCHRONIZATION ===",
            "When the user interacts with the playground (dragging points, filling in answers, etc.),",
            "the state updates silently - you will NOT be interrupted or notified of every change.",
            "However, certain significant events (like completing a race or finishing a drill) WILL interrupt you.",
            "",
            "If you need to check the current state of the playground (e.g., to see what the user has done),",
            "call get_playground to fetch the latest state.",
            "",
        ]

        # Add playground selection guidance if we have guides
        if self.guides:
            parts.append("=== PLAYGROUND SELECTION GUIDE ===")
            parts.append("Choose the right playground based on the concept:")
            parts.append("")

            for guide in self.guides.values():
                parts.append(f"## {guide.id}")
                parts.append(f"Grades: {guide.gradeRange.get('primary', 'N/A')}")
                parts.append(f"{guide.interactionModel}")
                parts.append("")

                # Best for (quick summary of ideal use cases)
                parts.append("Best for:")
                for item in guide.bestFor[:3]:
                    parts.append(f"  - {item}")

                # When to use (most important for selection)
                parts.append("Use when:")
                for item in guide.whenToUse[:4]:
                    parts.append(f"  - {item}")

                # When NOT to use (helps avoid wrong choices)
                parts.append("Don't use when:")
                for item in guide.whenNotToUse[:3]:
                    parts.append(f"  - {item}")
                parts.append("")

        # Mention schema-only types
        schema_only_types = [t for t in self.schemas.keys() if t not in self.guides]
        if schema_only_types:
            for playground_type in schema_only_types:
                schema = self.schemas[playground_type]
                parts.append(f"## {playground_type}")
                parts.append("  Schema available. Use get_playground_guide() for details.")
                if schema.actionsSchema:
                    parts.append("  Supports ephemeral actions.")
                parts.append("")

        return "\n".join(parts)

    def get_playground_action_description(self) -> str | None:
        """
        Generate description for playground_action tool based on current playground.

        Returns None if no playground is active or current playground doesn't support actions.
        """
        if self.current_state is None:
            return None
        playground_type = self.current_state.type

        # Check if current playground has actions schema
        schema = self.schemas.get(playground_type)
        if not schema or not schema.actionsSchema:
            return None

        # Get the guide for detailed action descriptions
        guide = self.guides.get(playground_type)

        parts = [
            f"Triggers one or more ephemeral actions on the current {playground_type} playground.",
            "",
            "Use this to draw attention to specific elements or demonstrate concepts visually.",
            "Actions will animate briefly and then disappear without changing the playground state.",
            "You can trigger multiple actions simultaneously.",
            "",
            f"=== Available Actions for {playground_type} ===",
            "",
        ]

        if guide and guide.actions:
            for action_name, action_info in guide.actions.items():
                parts.append(f"### {action_name}")
                parts.append(f"  {action_info.get('description', '')}")
                parts.append(f"  Use case: {action_info.get('useCase', '')}")

                if action_info.get("params"):
                    parts.append("  Parameters:")
                    for param_name, param_info in action_info["params"].items():
                        req = "(required)" if param_info.get("required") else "(optional)"
                        default = f", default: {param_info.get('default')}" if "default" in param_info else ""
                        parts.append(
                            f"    - {param_name} [{param_info.get('type')}] {req}: {param_info.get('description')}{default}"
                        )

                if action_info.get("example"):
                    parts.append(f"  Example: {json.dumps(action_info['example'])}")
                parts.append("")
        else:
            # Fall back to schema info
            parts.append("Actions schema available. Check get_playground_guide() for details.")

        parts.append("Single action example:")
        parts.append('  playground_action(actions=[{"action": "action_name", "params": {...}}])')
        parts.append("")
        parts.append("Multiple actions example (all trigger simultaneously):")
        parts.append(
            '  playground_action(actions=[{"action": "...", "params": {...}}, {"action": "...", "params": {...}}])'
        )

        return "\n".join(parts)

    def has_active_playground_with_actions(self) -> bool:
        """Check if current playground supports ephemeral actions."""
        if self.current_state is None:
            return False
        schema = self.schemas.get(self.current_state.type)
        return schema is not None and schema.actionsSchema is not None

    def get_guide_for_tool(self, playground_type: str) -> str:
        """Get detailed guide info for the LLM when setting a playground.

        Returns the full guide data received from the frontend.
        All documentation lives in the frontend guide.ts files.
        """
        guide = self.guides.get(playground_type)
        schema = self.schemas.get(playground_type)

        # If no guide but we have a schema, return schema-based info
        if not guide:
            if schema:
                return self._get_schema_only_guide(playground_type, schema)
            return f"No guide or schema available for playground type: {playground_type}. Available: {list(self.schemas.keys())}"

        # Return the full guide data as formatted text
        # All this information comes from the frontend guide.ts files
        parts = [
            f"# {guide.name} Playground ({guide.id})",
            f"\n{guide.interactionModel}",
            f"\nGrade Range: {guide.gradeRange.get('primary', 'N/A')} (extended: {guide.gradeRange.get('extended', 'N/A')})",
            f"Cognitive Level: {guide.cognitiveLevel}",
        ]

        # When to use
        parts.append("\n## When To Use:")
        for item in guide.whenToUse:
            parts.append(f"- {item}")

        # When NOT to use
        parts.append("\n## When NOT To Use:")
        for item in guide.whenNotToUse:
            parts.append(f"- {item}")

        # Best for
        parts.append("\n## Best For:")
        for item in guide.bestFor:
            parts.append(f"- {item}")

        # Example scenarios (quick pedagogical ideas)
        parts.append("\n## Example Scenarios:")
        for scenario in guide.exampleScenarios:
            parts.append(f"- [{scenario.get('grade', '')}] {scenario.get('concept', '')}")
            parts.append(f"  Setup: {scenario.get('setup', '')}")

        # Visual details - what the student sees
        if guide.visualDetails:
            parts.append("\n## Visual Details (what the student sees):")
            parts.append(guide.visualDetails.get("layout", ""))
            if guide.visualDetails.get("elements"):
                parts.append("\nElements:")
                for name, desc in guide.visualDetails["elements"].items():
                    parts.append(f"- {name}: {desc}")
            if guide.visualDetails.get("automaticBehaviors"):
                parts.append("\nAutomatic Behaviors:")
                for behavior in guide.visualDetails["automaticBehaviors"]:
                    parts.append(f"- {behavior}")

        # Interaction presets
        if guide.interactionPresets:
            parts.append("\n## Interaction Presets:")
            for preset_name, preset in guide.interactionPresets.items():
                parts.append(f"\n### {preset_name}")
                parts.append(f"Description: {preset.get('description', '')}")
                parts.append(f"Permissions: {json.dumps(preset.get('permissions', {}))}")

        # Configuration tips
        if guide.configurationTips:
            parts.append("\n## Configuration Tips:")
            for category, tips in guide.configurationTips.items():
                parts.append(f"\n### {category.replace('_', ' ').title()}:")
                for tip in tips:
                    parts.append(f"- {tip}")

        # Config schema (human-readable documentation)
        parts.append("\n## Config Schema (Documentation):")
        parts.append(json.dumps(guide.configSchema, indent=2))

        # State schema (human-readable documentation)
        parts.append("\n## State Schema (Documentation):")
        parts.append(json.dumps(guide.stateSchema, indent=2))

        # JSON Schema (formal schema used for validation)
        if schema:
            parts.append("\n## JSON Schema (Formal Validation Schema):")
            parts.append("This is the exact schema your state will be validated against:")
            parts.append(f"```json\n{json.dumps(schema.stateSchema, indent=2)}\n```")

        # Example configurations
        parts.append("\n## Example Configurations:")
        for example in guide.exampleConfigurations:
            parts.append(f"\n### {example.get('name', 'Unnamed')}")
            parts.append(f"Concept: {example.get('concept', '')}")
            parts.append(f"Pedagogy: {example.get('pedagogy', '')}")
            parts.append(f"```json\n{json.dumps(example.get('props', {}), indent=2)}\n```")

        # Common mistakes
        parts.append("\n## Common Mistakes to Avoid:")
        for mistake in guide.commonMistakes:
            parts.append(f"- {mistake}")

        # Available actions (ephemeral visual effects)
        if guide.actions:
            parts.append("\n## Available Actions (Ephemeral Effects)")
            parts.append("Use playground_action(actions=[...]) to trigger these without modifying state.")
            parts.append(
                "You can trigger multiple actions simultaneously by passing multiple items in the actions array."
            )
            parts.append("")
            for action_name, action_info in guide.actions.items():
                parts.append(f"\n### {action_name}")
                parts.append(f"Description: {action_info.get('description', '')}")
                parts.append(f"Use case: {action_info.get('useCase', '')}")
                if action_info.get("params"):
                    parts.append("Parameters:")
                    for param_name, param_info in action_info["params"].items():
                        req = "(required)" if param_info.get("required") else "(optional)"
                        default = f", default: {param_info.get('default')}" if "default" in param_info else ""
                        parts.append(
                            f"  - {param_name} [{param_info.get('type')}] {req}: {param_info.get('description')}{default}"
                        )
                if action_info.get("example"):
                    parts.append(f"Example: {json.dumps(action_info['example'])}")

        return "\n".join(parts)

    def _get_schema_only_guide(self, playground_type: str, schema: PlaygroundJsonSchema) -> str:
        """Generate guide-like documentation from schema only (no guide file)."""
        parts = [
            f"# {playground_type} Playground",
            "",
            "This playground has a schema but no detailed guide documentation.",
            "",
        ]

        # Config schema
        parts.append("## Config Schema:")
        parts.append(f"```json\n{json.dumps(schema.configSchema, indent=2)}\n```")

        # State schema
        parts.append("\n## State Schema:")
        parts.append(f"```json\n{json.dumps(schema.stateSchema, indent=2)}\n```")

        # Actions schema (if available)
        if schema.actionsSchema:
            parts.append("\n## Available Actions (Ephemeral Effects)")
            parts.append("Use playground_action(actions=[...]) to trigger visual effects without modifying state.")
            parts.append(f"```json\n{json.dumps(schema.actionsSchema, indent=2)}\n```")

        return "\n".join(parts)

    def _validate_against_schema(
        self, playground_type: str, config: dict[str, Any] | None, state: dict[str, Any] | None
    ) -> tuple[bool, str | None]:
        """
        Validate config and state against JSON Schema.

        Returns:
            Tuple of (is_valid, error_message)

        Self-healing: When validation fails, returns the full schema and guide
        so the LLM can correct itself.
        """
        schema = self.schemas.get(playground_type)
        if not schema:
            # No schema available, skip validation
            logger.debug(f"No schema available for {playground_type}, skipping validation")
            return True, None

        errors = []
        validation_path = []

        # Validate config if provided
        if config is not None:
            try:
                Draft7Validator(schema.configSchema).validate(config)
            except ValidationError as e:
                path = ".".join(str(p) for p in e.absolute_path) or "root"
                errors.append(f"Config validation error at '{path}': {e.message}")
                validation_path.append(("config", path, e.message))

        # Validate state (required)
        if state is None:
            errors.append("State is required but was not provided")
        else:
            try:
                Draft7Validator(schema.stateSchema).validate(state)
            except ValidationError as e:
                path = ".".join(str(p) for p in e.absolute_path) or "root"
                errors.append(f"State validation error at '{path}': {e.message}")
                validation_path.append(("state", path, e.message))

        if errors:
            # Build self-healing error message with schema AND guide
            error_parts = [
                "# Validation Failed - Self-Correction Required",
                "",
                "## Errors:",
            ]
            for err in errors:
                error_parts.append(f"  - {err}")

            # Include the schemas to help correct
            error_parts.append("\n## Expected State Schema:")
            error_parts.append(f"```json\n{json.dumps(schema.stateSchema, indent=2)}\n```")

            if config is not None:
                error_parts.append("\n## Expected Config Schema:")
                error_parts.append(f"```json\n{json.dumps(schema.configSchema, indent=2)}\n```")

            # Include the guide summary for context
            guide = self.guides.get(playground_type)
            if guide:
                error_parts.append(f"\n## Quick Reference for {guide.name}:")
                error_parts.append(f"- Interaction Model: {guide.interactionModel}")
                if guide.commonMistakes:
                    error_parts.append("\n### Common Mistakes to Avoid:")
                    for mistake in guide.commonMistakes:
                        error_parts.append(f"  - {mistake}")
                if guide.exampleConfigurations:
                    error_parts.append("\n### Example Configuration:")
                    example = guide.exampleConfigurations[0]
                    error_parts.append(f"```json\n{json.dumps(example.get('props', {}), indent=2)}\n```")

            error_parts.append("\nPlease fix the errors above and try again.")
            return False, "\n".join(error_parts)

        return True, None

    async def set(self, playground_data: dict[str, Any] | PlaygroundState) -> str:
        """
        Set the playground state.

        Args:
            playground_data: The playground state to set

        Returns:
            Success message or error description
        """
        try:
            if isinstance(playground_data, dict):
                playground_state = PlaygroundState.model_validate(playground_data)
            else:
                playground_state = playground_data
        except Exception as e:
            logger.error(f"Error validating playground state: {e}")
            return f"Invalid playground state: {e}"

        # Validate type is known
        playground_type = playground_state.type
        available = self.get_available_types()
        if not available:
            return "No playground types available yet. Waiting for frontend to send schemas."
        if playground_type not in available:
            return f"Unknown playground type: {playground_type}. Available types: {available}"

        # Validate against JSON Schema
        is_valid, error_msg = self._validate_against_schema(
            playground_type, playground_state.config, playground_state.state
        )
        if not is_valid:
            msg = error_msg[:500] if error_msg else "Playground validation failed"
            logger.warning(f"Playground validation failed: {msg[:500]}")
            return msg

        # Update state
        self.current_state = playground_state

        # Send to frontend
        asyncio.create_task(self._send_to_frontend(playground_state))

        # Log the update
        self._log_playground_update(
            playground_data if isinstance(playground_data, dict) else playground_data.model_dump(),
            {"result": "success"},
        )

        return f"Playground updated to {playground_type}."

    def _validate_action_against_schema(
        self, playground_type: str, action_name: str, params: dict[str, Any]
    ) -> tuple[bool, str | None]:
        """
        Validate an action against its JSON Schema.

        Returns:
            Tuple of (is_valid, error_message)

        Self-healing: When validation fails, returns the full actions schema
        and action guide so the LLM can correct itself.
        """
        schema = self.schemas.get(playground_type)
        if not schema:
            # No schema available, skip validation
            logger.debug(f"No schema available for {playground_type}, skipping action validation")
            return True, None

        if not schema.actionsSchema:
            return False, f"Playground type '{playground_type}' does not support actions"

        # Build the action object to validate
        action_obj = {"action": action_name, "params": params}

        try:
            Draft7Validator(schema.actionsSchema).validate(action_obj)
        except ValidationError as e:
            path = ".".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"

            # Build self-healing error message
            error_parts = [
                "# Action Validation Failed - Self-Correction Required",
                "",
                f"## Error at '{path}':",
                f"  {e.message}",
                "",
                "## You tried:",
                f"  action: {action_name}",
                f"  params: {json.dumps(params)}",
            ]

            # Include actions schema
            error_parts.append("\n## Expected Actions Schema:")
            error_parts.append(f"```json\n{json.dumps(schema.actionsSchema, indent=2)}\n```")

            # Include specific action guide if available
            guide = self.guides.get(playground_type)
            if guide and guide.actions and action_name in guide.actions:
                action_info = guide.actions[action_name]
                error_parts.append(f"\n## Guide for '{action_name}' action:")
                error_parts.append(f"Description: {action_info.get('description', 'N/A')}")
                error_parts.append(f"Use case: {action_info.get('useCase', 'N/A')}")
                if action_info.get("params"):
                    error_parts.append("Parameters:")
                    for param_name, param_info in action_info["params"].items():
                        req = "(required)" if param_info.get("required") else "(optional)"
                        error_parts.append(
                            f"  - {param_name} [{param_info.get('type')}] {req}: {param_info.get('description')}"
                        )
                if action_info.get("example"):
                    error_parts.append(f"Example: {json.dumps(action_info['example'])}")
            elif guide and guide.actions:
                # Action name might be wrong - show available actions
                error_parts.append(f"\n## Available actions for {playground_type}:")
                for act_name in guide.actions.keys():
                    error_parts.append(f"  - {act_name}")

            error_parts.append("\nPlease fix the error above and try again.")
            return False, "\n".join(error_parts)

        return True, None

    async def action(self, actions: list[dict[str, Any]]) -> str:
        """
        Trigger one or more ephemeral actions on the current playground.

        Args:
            actions: List of actions to trigger. Each action is a dict with:
                     - action: The action name (e.g., "highlight_value")
                     - params: Parameters for the action

        Returns:
            Success message or error description
        """
        # Check if playground is active
        if self.current_state is None:
            return "No playground is currently active. Use set_playground first."

        # Get current playground type
        playground_type = self.current_state.type

        # Validate each action against schema
        validated_actions: list[PlaygroundActionItem] = []
        for i, action_data in enumerate(actions):
            action_name = action_data.get("action")
            params = action_data.get("params", {})

            if not action_name:
                return f"Action at index {i} is missing 'action' field"

            is_valid, error_msg = self._validate_action_against_schema(playground_type, action_name, params)
            if not is_valid:
                msg = error_msg[:500] if error_msg else "Action validation failed"
                logger.warning(f"Action validation failed for '{action_name}': {msg}")
                return f"Action '{action_name}' at index {i} failed validation: {msg}"

            validated_actions.append(PlaygroundActionItem(action=action_name, params=params))

        # Create batched action payload
        action_payload = PlaygroundAction(actions=validated_actions)

        # Send to frontend
        await self._send_action_to_frontend(action_payload)

        action_names = [a.action for a in validated_actions]

        # Log the action to tracing
        self._log_playground_action(
            action_payload.model_dump(),
            {"result": "success", "actions": action_names},
        )

        if len(action_names) == 1:
            return f"Triggered action: {action_names[0]}"
        return f"Triggered {len(action_names)} actions: {', '.join(action_names)}"

    async def _send_to_frontend(self, state: PlaygroundState):
        """Send playground state to frontend via LiveKit."""
        await self.room.local_participant.send_text(
            json.dumps(state.model_dump(), cls=PlaygroundJSONEncoder),
            topic="playground",
        )

    async def _send_action_to_frontend(self, action: PlaygroundAction):
        """Send playground action to frontend via LiveKit."""
        await self.room.local_participant.send_text(
            json.dumps(action.model_dump(), cls=PlaygroundJSONEncoder),
            topic="playground-action",
        )

    async def _send_guides_acknowledgment(self):
        """Send acknowledgment to frontend that guides were received."""
        ack_payload = {
            "status": "received",
            "guides": list(self.guides.keys()),
            "schemas": list(self.schemas.keys()),
        }
        logger.info(f"Sending guides acknowledgment: {ack_payload}")
        await self.room.local_participant.send_text(
            json.dumps(ack_payload),
            topic="playground-guides-ack",
        )

    def _handle_guides_stream(self, reader: TextStreamReader, participant_identity: str):
        """Entry point for playground-guides text stream handler."""
        asyncio.create_task(self._process_guides_stream(reader))

    async def _process_guides_stream(self, reader: TextStreamReader):
        """Process incoming playground guides from frontend."""
        try:
            message = await reader.read_all()
            payload = json.loads(message)

            # New format: {guides: [...], schemas: {...}}
            guides_data = payload.get("guides", [])
            schemas_data = payload.get("schemas", {})

            logger.info(f"Received {len(guides_data)} playground guides and {len(schemas_data)} schemas from frontend")

            # Load guides
            for guide_data in guides_data:
                try:
                    guide = PlaygroundGuide.model_validate(guide_data)
                    self.guides[guide.id] = guide
                    logger.debug(f"Loaded guide: {guide.id}")
                except Exception as e:
                    logger.warning(f"Failed to parse guide: {e}")

            # Load schemas (includes canvas and all interactive types)
            for type_id, schema_data in schemas_data.items():
                try:
                    schema = PlaygroundJsonSchema.model_validate(schema_data)
                    self.schemas[type_id] = schema
                    logger.debug(f"Loaded schema: {type_id}")
                except Exception as e:
                    logger.warning(f"Failed to parse schema for {type_id}: {e}")

            self._guides_received = True
            logger.info(f"Successfully loaded guides for: {list(self.guides.keys())}")
            logger.info(f"Successfully loaded schemas for: {list(self.schemas.keys())}")

            # Send acknowledgment back to frontend
            await self._send_guides_acknowledgment()

            # Emit event so context can be updated with playground selection info
            # Include schemas for proper tool typing
            schemas_for_context = {}
            for type_id, schema in self.schemas.items():
                schemas_for_context[type_id] = {
                    "configSchema": schema.configSchema,
                    "stateSchema": schema.stateSchema,
                }

            await self.emit(
                {
                    "event": "guides_loaded",
                    "context": self.get_playground_selection_context(),
                    "available_types": self.get_available_types(),
                    "schemas": schemas_for_context,
                }
            )

        except Exception as e:
            logger.error(f"Error processing playground guides: {e}")

    def _handle_playground_stream(self, reader: TextStreamReader, participant_identity: str):
        """Entry point for playground state text stream handler."""
        asyncio.create_task(self._process_playground_stream(reader))

    async def _process_playground_stream(self, reader: TextStreamReader):
        """Process incoming playground state from frontend (user interactions).

        Note: State changes do NOT trigger interrupts. They just update the local state silently.
        Use playground-events for events that should interrupt the agent.
        """
        try:
            message = await reader.read_all()
            state_data = json.loads(message)
            self.current_state = PlaygroundState.model_validate(state_data)
            # Silently update state - no logging for state changes
            await self.emit(self.current_state)
        except Exception as e:
            logger.error(f"Error processing playground state: {e}")

    def _handle_event_stream(self, reader: TextStreamReader, participant_identity: str):
        """Entry point for playground events text stream handler."""
        asyncio.create_task(self._process_event_stream(reader))

    async def _process_event_stream(self, reader: TextStreamReader):
        """Process incoming playground events from frontend.

        Events (e.g., race complete, drill finished) DO trigger interrupts.
        """
        try:
            message = await reader.read_all()
            event_data = json.loads(message)
            event = PlaygroundEvent.model_validate(event_data)
            logger.info(f"Playground event received: {event.type}")
            # Emit event (DOES interrupt)
            await self.emit_event(event)
        except Exception as e:
            logger.error(f"Error processing playground event: {e}")

    def _log_playground_update(self, input_payload: Any, result_payload: dict[str, Any]):
        """Log playground update to tracing."""
        if self.tracing_client is None:
            return

        try:
            with self.tracing_client.text_span(
                "playground_update",
                input=json.dumps(input_payload, cls=PlaygroundJSONEncoder)
                if isinstance(input_payload, dict)
                else str(input_payload),
            ) as span:
                span.output(
                    json.dumps(result_payload, cls=PlaygroundJSONEncoder)
                    if isinstance(result_payload, dict)
                    else str(result_payload)
                )
        except Exception:
            logger.exception("Failed to log playground update")

    def _log_playground_action(self, input_payload: Any, result_payload: dict[str, Any]):
        """Log playground action to tracing."""
        if self.tracing_client is None:
            return

        try:
            with self.tracing_client.text_span(
                "playground_action",
                input=json.dumps(input_payload, cls=PlaygroundJSONEncoder)
                if isinstance(input_payload, dict)
                else str(input_payload),
            ) as span:
                span.output(
                    json.dumps(result_payload, cls=PlaygroundJSONEncoder)
                    if isinstance(result_payload, dict)
                    else str(result_payload)
                )
        except Exception:
            logger.exception("Failed to log playground action")
