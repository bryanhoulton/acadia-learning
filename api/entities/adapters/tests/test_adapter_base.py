import json
import uuid
from unittest.mock import Mock

from django.test import TestCase, tag

from entities.adapters import (
    ADAPTER_REGISTRY,
    Adapter,
    Tool,
    register_adapter,
)
from utils.serializers import UUIDJSONEncoder


@tag("fast")
class TestUUIDJSONEncoder(TestCase):
    def setUp(self):
        self.encoder = UUIDJSONEncoder()

    def test_encode_uuid(self):
        # Arrange
        test_uuid = uuid.uuid4()
        data = {"id": test_uuid, "name": "test"}

        # Act
        result = json.dumps(data, cls=UUIDJSONEncoder)

        # Assert
        parsed = json.loads(result)
        assert parsed["id"] == str(test_uuid)
        assert parsed["name"] == "test"

    def test_encode_regular_data(self):
        # Arrange
        data = {"name": "test", "value": 123, "active": True}

        # Act
        result = json.dumps(data, cls=UUIDJSONEncoder)

        # Assert
        parsed = json.loads(result)
        assert parsed == data

    def test_encode_nested_uuid(self):
        # Arrange
        test_uuid = uuid.uuid4()
        data = {"user": {"id": test_uuid, "details": {"session_id": uuid.uuid4()}}}

        # Act
        result = json.dumps(data, cls=UUIDJSONEncoder)

        # Assert
        parsed = json.loads(result)
        assert parsed["user"]["id"] == str(data["user"]["id"])
        assert parsed["user"]["details"]["session_id"] == str(data["user"]["details"]["session_id"])


class MockTool(Tool):
    """Mock tool for testing purposes."""

    name = "mock_tool"
    description = "A mock tool for testing"
    parameters = {"test_param": {"type": "string", "description": "Test parameter"}}

    def execute(self, entity, parameters):
        return {"result": f"Executed with {parameters.get('test_param')}"}


class MockToolWithError(Tool):
    """Mock tool that raises an error for testing."""

    name = "error_tool"
    description = "A tool that raises errors"
    parameters = {}

    def execute(self, entity, parameters):
        raise ValueError("Test error message")


class MockToolReturningNone(Tool):
    """Mock tool that returns None."""

    name = "none_tool"
    description = "A tool that returns None"
    parameters = {}

    def execute(self, entity, parameters):
        return None


@tag("fast")
class TestTool(TestCase):
    def setUp(self):
        self.tool = MockTool()
        self.mock_entity_runtime = Mock()

    def test_to_schema(self):
        # Act
        schema = self.tool.to_schema()

        # Assert
        assert schema["type"] == "function"
        assert schema["name"] == "mock_tool"
        assert schema["description"] == "A mock tool for testing"
        assert schema["strict"] is True

        parameters = schema["parameters"]
        assert parameters["type"] == "object"
        assert "reasoning" in parameters["properties"]
        assert "test_param" in parameters["properties"]
        assert "test_param" in parameters["required"]
        assert "reasoning" in parameters["required"]
        assert parameters["additionalProperties"] is False

    def test_execute_wrapper_success(self):
        # Arrange
        parameters = {"test_param": "hello", "reasoning": "Testing the tool"}

        # Act
        result = self.tool._execute(self.mock_entity_runtime, parameters)

        # Assert - format_result uses indent=2 for pretty JSON
        parsed = json.loads(result)
        assert parsed == {"result": "Executed with hello"}

    def test_execute_wrapper_with_exception(self):
        # Arrange
        error_tool = MockToolWithError()
        parameters = {"reasoning": "Testing error handling"}

        # Act
        result = error_tool._execute(self.mock_entity_runtime, parameters)

        # Assert - errors now return plain text format
        assert result == "Error: Test error message"

    def test_execute_wrapper_with_string_return(self):
        # Arrange
        class StringTool(Tool):
            name = "string_tool"

            def execute(self, entity, parameters):
                return "Simple string result"

        string_tool = StringTool()
        parameters = {"reasoning": "Testing string return"}

        # Act
        result = string_tool._execute(self.mock_entity_runtime, parameters)

        # Assert
        assert result == "Simple string result"

    def test_execute_wrapper_with_list_return(self):
        # Arrange
        class ListTool(Tool):
            name = "list_tool"

            def execute(self, entity, parameters):
                return [1, 2, 3]

        list_tool = ListTool()
        parameters = {"reasoning": "Testing list return"}

        # Act
        result = list_tool._execute(self.mock_entity_runtime, parameters)

        # Assert - format_result uses indent=2 for pretty JSON
        parsed = json.loads(result)
        assert parsed == [1, 2, 3]


class MockAdapter(Adapter):
    """Mock adapter for testing purposes."""

    name = "mock_adapter"
    description = "A mock adapter for testing"
    tools = [MockTool()]

    def detail(self, entity_runtime):
        return f"Mock adapter detail for entity {entity_runtime.entity.id}"


@tag("fast")
class TestAdapter(TestCase):
    def setUp(self):
        self.adapter = MockAdapter()
        self.mock_entity_runtime = Mock()
        self.mock_entity_runtime.entity.id = 123

    def test_adapter_basic_properties(self):
        # Assert
        assert self.adapter.name == "mock_adapter"
        assert self.adapter.description == "A mock adapter for testing"
        assert len(self.adapter.tools) == 1
        assert isinstance(self.adapter.tools[0], MockTool)

    def test_adapter_detail_method(self):
        # Act
        result = self.adapter.detail(self.mock_entity_runtime)

        # Assert
        assert result == "Mock adapter detail for entity 123"


@tag("fast")
class TestAdapterRegistry(TestCase):
    def setUp(self):
        # Save the current registry state and clear it for isolated testing
        self._original_registry = ADAPTER_REGISTRY.copy()
        ADAPTER_REGISTRY.clear()

    def tearDown(self):
        # Restore the original registry state
        ADAPTER_REGISTRY.clear()
        ADAPTER_REGISTRY.update(self._original_registry)

    def test_register_adapter_decorator(self):
        # Arrange & Act
        @register_adapter
        class TestAdapter(Adapter):
            name = "test_adapter"
            description = "Test adapter"
            tools = []

        # Assert
        assert "test_adapter" in ADAPTER_REGISTRY
        assert isinstance(ADAPTER_REGISTRY["test_adapter"], TestAdapter)

    def test_register_multiple_adapters(self):
        # Arrange & Act
        @register_adapter
        class FirstAdapter(Adapter):
            name = "first_adapter"
            description = "First test adapter"
            tools = []

        @register_adapter
        class SecondAdapter(Adapter):
            name = "second_adapter"
            description = "Second test adapter"
            tools = []

        # Assert
        assert len(ADAPTER_REGISTRY) == 2
        assert "first_adapter" in ADAPTER_REGISTRY
        assert "second_adapter" in ADAPTER_REGISTRY
        assert isinstance(ADAPTER_REGISTRY["first_adapter"], FirstAdapter)
        assert isinstance(ADAPTER_REGISTRY["second_adapter"], SecondAdapter)

    def test_register_adapter_overwrites_existing(self):
        # Arrange
        @register_adapter
        class OriginalAdapter(Adapter):
            name = "test_adapter"
            description = "Original adapter"
            tools = []

        original_instance = ADAPTER_REGISTRY["test_adapter"]

        # Act
        @register_adapter
        class NewAdapter(Adapter):
            name = "test_adapter"  # Same name
            description = "New adapter"
            tools = []

        # Assert
        assert len(ADAPTER_REGISTRY) == 1
        assert "test_adapter" in ADAPTER_REGISTRY
        assert isinstance(ADAPTER_REGISTRY["test_adapter"], NewAdapter)
        assert ADAPTER_REGISTRY["test_adapter"] is not original_instance
        assert ADAPTER_REGISTRY["test_adapter"].description == "New adapter"

    def test_register_adapter_returns_class(self):
        # Arrange & Act
        @register_adapter
        class ReturnTestAdapter(Adapter):
            name = "return_test_adapter"
            description = "Testing return value"
            tools = []

        # Assert - The decorator should return the class
        assert ReturnTestAdapter.name == "return_test_adapter"
        assert ReturnTestAdapter.description == "Testing return value"
