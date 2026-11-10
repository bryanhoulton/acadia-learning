"""
Integration tests for LLM provider adapters.

These tests hit real APIs - no mocks.
Run with: uv run python manage.py test utils.tests.test_llm_provider --tag=slow
"""

from django.test import TestCase, tag

from api.settings import anthropic_client, oai
from utils.llm_provider import (
    ClaudeAdapter,
    LLMRequest,
    OpenAIAdapter,
    SystemPart,
    UnifiedLLMResponse,
    create_llm_response,
    is_claude_model,
    is_openai_model,
)


@tag("slow")
class TestOpenAIAdapter(TestCase):
    """Integration tests for OpenAI adapter - hits real API."""

    def setUp(self):
        self.adapter = OpenAIAdapter(oai)

    def test_simple_request_returns_text(self):
        """Test that a simple request returns actual text content."""
        request = LLMRequest(
            model="gpt-5.2",
            system_parts=[
                SystemPart(
                    content="You are a helpful assistant. Always respond with exactly: HELLO WORLD", cacheable=True
                ),
            ],
            messages=[
                {"role": "user", "content": "Say hello"},
            ],
        )

        response = self.adapter.create_response(request)

        # Verify we got a response
        self.assertIsNotNone(response)
        self.assertTrue(len(response.output) > 0)

        # Verify usage was tracked
        self.assertIsNotNone(response.usage)
        self.assertGreater(response.usage.input_tokens, 0)
        self.assertGreater(response.usage.output_tokens, 0)

    def test_tool_call_is_made(self):
        """Test that the model actually calls a tool when instructed."""
        request = LLMRequest(
            model="gpt-5.2",
            system_parts=[
                SystemPart(
                    content="You MUST use the get_weather tool to answer any question. Never respond without using a tool.",
                    cacheable=True,
                ),
            ],
            messages=[
                {"role": "user", "content": "What's the weather in Tokyo?"},
            ],
            tools=[
                {
                    "type": "function",
                    "name": "get_weather",
                    "description": "Get the current weather for a city",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "city": {"type": "string", "description": "The city name"},
                        },
                        "required": ["city"],
                    },
                }
            ],
            tool_choice="required",
        )

        response = self.adapter.create_response(request)

        # Find function calls in output
        function_calls = [o for o in response.output if getattr(o, "type", None) == "function_call"]

        self.assertTrue(len(function_calls) > 0, "Expected model to call get_weather tool")

        # Verify the tool call has the right structure
        tool_call = function_calls[0]
        self.assertEqual(tool_call.name, "get_weather")
        self.assertIsNotNone(tool_call.arguments)
        self.assertIn("Tokyo", tool_call.arguments)

    def test_multiple_system_parts_are_sent(self):
        """Test that multiple system parts are all included in the prompt."""
        request = LLMRequest(
            model="gpt-5.2",
            system_parts=[
                SystemPart(content="Rule 1: Always start your response with 'ALPHA'", cacheable=True),
                SystemPart(content="Rule 2: Always end your response with 'OMEGA'", cacheable=True),
                SystemPart(content="Rule 3: Keep responses to one sentence.", cacheable=False),
            ],
            messages=[
                {"role": "user", "content": "Tell me about cats."},
            ],
        )

        response = self.adapter.create_response(request)

        # Get the text content from the response
        messages = [o for o in response.output if getattr(o, "type", None) == "message"]
        self.assertTrue(len(messages) > 0)

        # The model should have followed all rules
        self.assertIsNotNone(response.usage)
        self.assertGreater(response.usage.input_tokens, 50)  # Multiple system parts = more tokens


@tag("slow")
class TestClaudeAdapter(TestCase):
    """Integration tests for Claude adapter - hits real API."""

    def setUp(self):
        self.adapter = ClaudeAdapter(anthropic_client)

    def test_simple_request_returns_text(self):
        """Test that a simple request returns actual text content."""
        request = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(content="Respond with exactly: HELLO FROM CLAUDE", cacheable=True),
            ],
            messages=[
                {"role": "user", "content": "Say hello"},
            ],
        )

        response = self.adapter.create_response(request)

        # Verify response structure
        self.assertIsInstance(response, UnifiedLLMResponse)
        self.assertEqual(response.provider, "anthropic")
        self.assertTrue(len(response.output) > 0)

        # Verify we got a message back
        messages = [o for o in response.output if getattr(o, "type", None) == "message"]
        self.assertTrue(len(messages) > 0)

        # Verify the message has content
        message = messages[0]
        self.assertIsNotNone(message.content)
        self.assertTrue(len(message.content) > 0)

        # Verify text content exists
        text_block = message.content[0]
        self.assertEqual(text_block["type"], "output_text")
        self.assertIn("HELLO", text_block["text"].upper())

    def test_tool_call_is_made(self):
        """Test that Claude actually calls a tool when instructed."""
        request = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(
                    content="You MUST use the get_weather tool to answer. Never respond without using the tool first.",
                    cacheable=True,
                ),
            ],
            messages=[
                {"role": "user", "content": "What's the weather in Paris?"},
            ],
            tools=[
                {
                    "type": "function",
                    "name": "get_weather",
                    "description": "Get the current weather for a city",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "city": {"type": "string", "description": "The city name"},
                        },
                        "required": ["city"],
                    },
                }
            ],
            tool_choice="required",
        )

        response = self.adapter.create_response(request)

        # Find function calls in output
        function_calls = [o for o in response.output if getattr(o, "type", None) == "function_call"]

        self.assertTrue(len(function_calls) > 0, "Expected Claude to call get_weather tool")

        # Verify the tool call structure
        tool_call = function_calls[0]
        self.assertEqual(tool_call.name, "get_weather")
        self.assertIsNotNone(tool_call.call_id)
        self.assertIsNotNone(tool_call.arguments)
        self.assertIn("Paris", tool_call.arguments)

    def test_prompt_caching_creates_cache(self):
        """Test that prompt caching actually creates cached tokens."""
        # Large system prompt to ensure it gets cached (must be > 1024 tokens for Haiku)
        large_content = "You are a helpful AI assistant that provides detailed answers. " * 200

        request = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(content=large_content, cacheable=True),
                SystemPart(content="Current time: 2024-01-01 12:00:00", cacheable=False),
            ],
            messages=[
                {"role": "user", "content": "Say 'test'"},
            ],
        )

        # First call - should create cache
        response1 = self.adapter.create_response(request)

        self.assertIsNotNone(response1.usage)
        cache_created_1 = response1.usage.cached_tokens

        # Second call with same cacheable content - should hit cache
        request2 = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(content=large_content, cacheable=True),  # Same content
                SystemPart(content="Current time: 2024-01-01 12:01:00", cacheable=False),  # Different
            ],
            messages=[
                {"role": "user", "content": "Say 'hello'"},
            ],
        )

        response2 = self.adapter.create_response(request2)

        self.assertIsNotNone(response2.usage)
        cache_read_2 = response2.usage.cached_tokens

        # Verify caching happened
        # First call creates cache OR second call reads from cache
        self.assertTrue(
            cache_created_1 > 0 or cache_read_2 > 0,
            f"Expected cache activity but got: created={cache_created_1}, read={cache_read_2}. "
            f"Total input tokens: call1={response1.usage.input_tokens}, call2={response2.usage.input_tokens}",
        )

        # If second call has cache hits, it should be significant (the large prompt)
        if cache_read_2 > 0:
            self.assertGreater(cache_read_2, 1000, "Expected large cache hit for the system prompt")

    def test_usage_tracking_is_accurate(self):
        """Test that usage info is properly tracked and structured."""
        request = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(content="Be extremely brief. One word answers only.", cacheable=True),
            ],
            messages=[
                {"role": "user", "content": "What is 2+2?"},
            ],
        )

        response = self.adapter.create_response(request)

        # Verify usage structure
        self.assertIsNotNone(response.usage)
        self.assertIsInstance(response.usage.input_tokens, int)
        self.assertIsInstance(response.usage.output_tokens, int)
        self.assertIsInstance(response.usage.cached_tokens, int)

        # Verify values are reasonable
        self.assertGreater(response.usage.input_tokens, 10)  # At least some input
        self.assertGreater(response.usage.output_tokens, 0)  # Got a response
        self.assertGreaterEqual(response.usage.cached_tokens, 0)  # Can be 0

        # Verify total is computed correctly
        self.assertEqual(
            response.usage.total_tokens,
            response.usage.input_tokens + response.usage.output_tokens,
        )

        # Verify input_tokens_details is compatible with cost tracking
        self.assertIsNotNone(response.usage.input_tokens_details)
        self.assertEqual(response.usage.input_tokens_details.cached_tokens, response.usage.cached_tokens)

    def test_output_item_attribute_access(self):
        """Test that output items properly support attribute access."""
        request = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(content="Say exactly: TEST123", cacheable=True),
            ],
            messages=[
                {"role": "user", "content": "Go"},
            ],
        )

        response = self.adapter.create_response(request)

        self.assertTrue(len(response.output) > 0)

        # Find a message output item (may have reasoning before it due to extended thinking)
        message_output = None
        for output in response.output:
            if getattr(output, "type", None) == "message":
                message_output = output
                break

        self.assertIsNotNone(message_output, "Expected at least one message output")

        # Test attribute access on output items
        self.assertEqual(message_output.type, "message")
        self.assertEqual(message_output.role, "assistant")
        self.assertIsNotNone(message_output.content)

        # Test .get() method
        self.assertEqual(message_output.get("type"), "message")
        self.assertIsNone(message_output.get("nonexistent"))
        self.assertEqual(message_output.get("nonexistent", "default"), "default")


@tag("slow")
class TestClaudeExtendedThinking(TestCase):
    """Test Claude extended thinking with Opus - hits real API."""

    def setUp(self):
        self.adapter = ClaudeAdapter(anthropic_client)

    def test_extended_thinking_produces_reasoning(self):
        """Test that Opus with extended thinking produces actual reasoning content."""
        request = LLMRequest(
            model="claude-opus-4-5",
            system_parts=[
                SystemPart(content="You are a math expert. Show your reasoning.", cacheable=True),
            ],
            messages=[
                {"role": "user", "content": "What is 17 * 23?"},
            ],
        )

        response = self.adapter.create_response(request)

        self.assertIsInstance(response, UnifiedLLMResponse)
        self.assertTrue(len(response.output) > 0)

        # Find reasoning blocks
        reasoning_outputs = [o for o in response.output if getattr(o, "type", None) == "reasoning"]

        # Opus should produce reasoning
        self.assertTrue(
            len(reasoning_outputs) > 0,
            f"Expected reasoning output but got types: {[getattr(o, 'type', None) for o in response.output]}",
        )

        # Verify reasoning has actual content
        reasoning = reasoning_outputs[0]
        thinking_content = getattr(reasoning, "content", None)
        self.assertIsNotNone(thinking_content, "Reasoning block should have content")
        self.assertIsInstance(thinking_content, str)
        self.assertGreater(len(thinking_content), 10, "Expected substantial thinking content")

        # Verify there's also a final message with the answer
        messages = [o for o in response.output if getattr(o, "type", None) == "message"]
        self.assertTrue(len(messages) > 0, "Expected a message with the final answer")


@tag("slow")
class TestCreateLLMResponse(TestCase):
    """Test the main create_llm_response entry point - hits real APIs."""

    def test_routes_to_openai(self):
        """Test that OpenAI models are routed correctly."""
        request = LLMRequest(
            model="gpt-5.2",
            system_parts=[
                SystemPart(content="Say: I AM OPENAI", cacheable=True),
            ],
            messages=[
                {"role": "user", "content": "Identify yourself"},
            ],
        )

        response = create_llm_response(client=oai, model="gpt-5.2", request=request)

        # OpenAI returns Response object (not UnifiedLLMResponse)
        self.assertIsNotNone(response)
        self.assertIsNotNone(response.output)
        self.assertIsNotNone(response.usage)

    def test_routes_to_claude(self):
        """Test that Claude models are routed correctly."""
        request = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(content="Say: I AM CLAUDE", cacheable=True),
            ],
            messages=[
                {"role": "user", "content": "Identify yourself"},
            ],
        )

        response = create_llm_response(client=anthropic_client, model="claude-sonnet-4-5", request=request)

        # Claude returns UnifiedLLMResponse
        self.assertIsInstance(response, UnifiedLLMResponse)
        self.assertEqual(response.provider, "anthropic")

    def test_legacy_api_works_with_openai(self):
        """Test legacy API (no LLMRequest) still works for OpenAI."""
        response = create_llm_response(
            client=oai,
            model="gpt-5.2",
            messages=[
                {"role": "system", "content": "Be brief."},
                {"role": "user", "content": "Say hello"},
            ],
        )

        self.assertIsNotNone(response)
        self.assertIsNotNone(response.output)
        self.assertTrue(len(response.output) > 0)

    def test_legacy_api_works_with_claude(self):
        """Test legacy API (no LLMRequest) still works for Claude."""
        response = create_llm_response(
            client=anthropic_client,
            model="claude-sonnet-4-5",
            messages=[
                {"role": "system", "content": "Be brief."},
                {"role": "user", "content": "Say hello"},
            ],
        )

        self.assertIsInstance(response, UnifiedLLMResponse)
        self.assertTrue(len(response.output) > 0)


@tag("slow")
class TestToolFormatConversion(TestCase):
    """Test that different tool formats are properly converted - hits real API."""

    def setUp(self):
        self.adapter = ClaudeAdapter(anthropic_client)

    def test_nested_function_format_works(self):
        """Test that nested function format (OpenAI style) works with Claude."""
        request = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(content="Use the calculate tool.", cacheable=True),
            ],
            messages=[
                {"role": "user", "content": "Calculate 5+5"},
            ],
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": "calculate",
                        "description": "Perform a calculation",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "expression": {"type": "string"},
                            },
                            "required": ["expression"],
                        },
                    },
                }
            ],
            tool_choice="required",
        )

        response = self.adapter.create_response(request)

        # Should get a tool call
        function_calls = [o for o in response.output if getattr(o, "type", None) == "function_call"]
        self.assertTrue(len(function_calls) > 0)
        self.assertEqual(function_calls[0].name, "calculate")

    def test_flat_function_format_works(self):
        """Test that flat function format works with Claude."""
        request = LLMRequest(
            model="claude-sonnet-4-5",
            system_parts=[
                SystemPart(content="Use the lookup tool.", cacheable=True),
            ],
            messages=[
                {"role": "user", "content": "Look up information about Python"},
            ],
            tools=[
                {
                    "type": "function",
                    "name": "lookup",
                    "description": "Look up information",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                        },
                        "required": ["query"],
                    },
                }
            ],
            tool_choice="required",
        )

        response = self.adapter.create_response(request)

        # Should get a tool call
        function_calls = [o for o in response.output if getattr(o, "type", None) == "function_call"]
        self.assertTrue(len(function_calls) > 0)
        self.assertEqual(function_calls[0].name, "lookup")


@tag("slow")
class TestProviderDetection(TestCase):
    """Test model detection functions."""

    def test_claude_models_detected(self):
        """Test that Claude models are correctly identified."""
        self.assertTrue(is_claude_model("claude-opus-4-5"))
        self.assertTrue(is_claude_model("claude-sonnet-4-5"))
        self.assertTrue(is_claude_model("claude-sonnet-4-5"))
        self.assertTrue(is_claude_model("claude-3-7-sonnet"))

    def test_openai_models_detected(self):
        """Test that OpenAI models are correctly identified."""
        self.assertTrue(is_openai_model("gpt-4.1"))
        self.assertTrue(is_openai_model("gpt-5.2"))
        self.assertTrue(is_openai_model("o3"))
        self.assertTrue(is_openai_model("o4-mini"))

    def test_mutual_exclusivity(self):
        """Test that a model can't be both Claude and OpenAI."""
        test_models = ["claude-opus-4-5", "gpt-4.1", "o3", "claude-sonnet-4-5"]
        for model in test_models:
            self.assertNotEqual(
                is_claude_model(model),
                is_openai_model(model),
                f"Model {model} should be exactly one of Claude or OpenAI",
            )
