import json
import uuid
from unittest.mock import Mock

from django.test import TestCase, tag

from entities.adapters import Adapter, Tool, register_adapter


class TestTool(Tool):
    """Tool for testing scenarios."""

    name = "test_tool"
    description = "test tool"
    parameters = {
        "action": {"type": "string", "description": "Action to perform"},
        "data": {"type": "object", "description": "Data object"},
    }

    def execute(self, entity_runtime, parameters):
        action = parameters.get("action")
        data = parameters.get("data", {})

        if action == "return_dict":
            return {"success": True, "data": data}
        elif action == "return_string":
            return f"Action completed: {action}"
        elif action == "return_list":
            return [1, 2, 3, data]
        elif action == "return_with_uuid":
            return {"id": uuid.uuid4(), "action": action}
        elif action == "raise_error":
            raise ValueError("Intentional test error")
        elif action == "return_none":
            return None
        else:
            return {"error": "Unknown action"}


@register_adapter
class TestAdapter(Adapter):
    name = "_test"
    description = "test adapter"
    tools = [TestTool()]

    def detail(self, entity_runtime):
        return f" test adapter for entity {entity_runtime.entity.id}"


@tag("fast")
class TestToolExecution(TestCase):
    def setUp(self):
        self.tool = TestTool()
        self.mock_entity_runtime = Mock()
        self.mock_entity = Mock()
        self.mock_entity.id = 456
        self.mock_entity_runtime.entity = self.mock_entity

    def test_successful_dict_return(self):
        # Arrange
        parameters = {
            "action": "return_dict",
            "data": {"name": "test", "value": 42},
            "reasoning": "Testing dict return",
        }

        # Act
        result = self.tool._execute(self.mock_entity_runtime, parameters)

        # Assert
        assert isinstance(result, str), f"Expected string result, got {type(result)}"
        parsed_result = json.loads(result)
        assert parsed_result["success"] is True
        assert parsed_result["data"]["name"] == "test"
        assert parsed_result["data"]["value"] == 42

    def test_successful_string_return(self):
        # Arrange
        parameters = {"action": "return_string", "reasoning": "Testing string return"}

        # Act
        result = self.tool._execute(self.mock_entity_runtime, parameters)

        # Assert
        assert result == "Action completed: return_string"

    def test_successful_list_return(self):
        # Arrange
        parameters = {"action": "return_list", "data": {"nested": "value"}, "reasoning": "Testing list return"}

        # Act
        result = self.tool._execute(self.mock_entity_runtime, parameters)

        # Assert
        assert isinstance(result, str), f"Expected string result, got {type(result)}"
        parsed_result = json.loads(result)
        assert parsed_result == [1, 2, 3, {"nested": "value"}]

    def test_uuid_serialization(self):
        # Arrange
        parameters = {"action": "return_with_uuid", "reasoning": "Testing UUID serialization"}

        # Act
        result = self.tool._execute(self.mock_entity_runtime, parameters)

        # Assert
        assert isinstance(result, str), f"Expected string result, got {type(result)}"
        parsed_result = json.loads(result)
        assert "id" in parsed_result
        assert "action" in parsed_result
        assert parsed_result["action"] == "return_with_uuid"
        # Check that the UUID was serialized as a string
        assert isinstance(parsed_result["id"], str)
        # Validate it's a valid UUID string
        uuid.UUID(parsed_result["id"])  # Should not raise an exception

    def test_error_handling(self):
        # Arrange
        parameters = {"action": "raise_error", "reasoning": "Testing error handling"}

        # Act
        result = self.tool._execute(self.mock_entity_runtime, parameters)

        # Assert
        assert isinstance(result, str), f"Expected string result, got {type(result)}"
        assert result == "Error: Intentional test error"

    def test_unknown_action_handling(self):
        # Arrange
        parameters = {"action": "unknown_action", "reasoning": "Testing unknown action handling"}

        # Act
        result = self.tool._execute(self.mock_entity_runtime, parameters)

        # Assert
        assert isinstance(result, str), f"Expected string result, got {type(result)}"
        parsed_result = json.loads(result)
        assert parsed_result["error"] == "Unknown action"

    def test_complex_nested_data(self):
        # Arrange
        complex_data = {
            "user": {
                "id": uuid.uuid4(),
                "profile": {
                    "preferences": [
                        {"key": "theme", "value": "dark", "id": uuid.uuid4()},
                        {"key": "lang", "value": "en", "id": uuid.uuid4()},
                    ]
                },
            }
        }

        parameters = {
            "action": "return_dict",
            "data": complex_data,
            "reasoning": "Testing complex nested data with UUIDs",
        }

        # Act
        result = self.tool._execute(self.mock_entity_runtime, parameters)

        # Assert
        assert isinstance(result, str), f"Expected string result, got {type(result)}"
        parsed_result = json.loads(result)
        assert parsed_result["success"] is True

        returned_data = parsed_result["data"]
        assert "user" in returned_data
        assert "profile" in returned_data["user"]
        assert "preferences" in returned_data["user"]["profile"]

        # Check that UUIDs were serialized as strings
        assert isinstance(returned_data["user"]["id"], str)
        for pref in returned_data["user"]["profile"]["preferences"]:
            assert isinstance(pref["id"], str)
            uuid.UUID(pref["id"])  # Validate UUID string format


@tag("fast")
class TestAdapterCase(TestCase):
    def setUp(self):
        self.adapter = TestAdapter()
        self.mock_entity_runtime = Mock()
        self.mock_entity = Mock()
        self.mock_entity.id = 789
        self.mock_entity_runtime.entity = self.mock_entity

    def test_adapter_tool_access(self):
        # Test that adapter provides access to its tools
        assert len(self.adapter.tools) == 1
        tool = self.adapter.tools[0]
        assert isinstance(tool, TestTool)
        assert tool.name == "test_tool"

    def test_adapter_detail_method(self):
        # Act
        result = self.adapter.detail(self.mock_entity_runtime)

        # Assert
        assert result == " test adapter for entity 789"

    def test_tool_schema_generation(self):
        # Arrange
        tool = self.adapter.tools[0]

        # Act
        schema = tool.to_schema()

        # Assert
        assert schema["type"] == "function"
        assert schema["name"] == "test_tool"
        assert schema["description"] == "test tool"
        assert "parameters" in schema
        assert schema["strict"] is True

        parameters = schema["parameters"]
        assert "action" in parameters["properties"]
        assert "data" in parameters["properties"]
        assert "reasoning" in parameters["properties"]
        # Note: "data" is optional because it's an object without defined properties
        # In OpenAI strict mode, such objects cannot be required
        assert set(parameters["required"]) == {"action", "reasoning"}
