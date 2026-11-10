import json
import logging

from openai.types.responses import FunctionToolParam, ResponseInputItemParam
from openai.types.shared import ChatModel

from api.settings import oai
from entities.models import Entity
from tracing.spans import tool_span, traced
from utils.llms import retry_openai_call, track_llm_cost

logger = logging.getLogger(__name__)


class AgentTool:
    name: str
    description: str
    parameters: dict

    @property
    def function_schema(self) -> FunctionToolParam:
        schema = {
            "type": "function",
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }
        return FunctionToolParam(**schema)

    def execute(self, **kwargs):
        raise NotImplementedError("Subclasses must implement this method")


class TerminationException(Exception):
    def __init__(self, output: str):
        self.output = output


class TerminateTool(AgentTool):
    name: str = "terminate"
    description: str = "Terminate the conversation"
    parameters: dict = {
        "type": "object",
        "properties": {
            "reason": {
                "type": "string",
                "description": "Reason for terminating the conversation",
            }
        },
        "required": ["reason"],
        "additionalProperties": False,
    }

    def execute(self, **kwargs):
        raise TerminationException(kwargs["reason"])


@traced
def run_agent_with_tools(
    prompt: str,
    tools: list[AgentTool] = [],
    max_depth: int = 20,
    model: ChatModel = "o3",
    max_retries: int = 2,
    metadata: dict = {},
) -> str | None:
    """
    Helper function to run an agent with tools.

    Args:
        prompt: The prompt to send to the agent
        tools: List of tool definitions for the agent to use
        max_depth: Maximum number of tool calls to make
        model: The model to use (default: "o3")
        max_retries: Maximum number of retries for the OpenAI call
        metadata: Additional metadata to include in the request

    Returns:
        True if the agent terminated, False otherwise
    """

    input: list[ResponseInputItemParam] = [
        {
            "role": "user",
            "content": prompt,
        }
    ]
    last_response_id = None

    i = 0
    while i < max_depth:

        def make_openai_call():
            return oai.responses.create(
                model=model,
                input=input,
                tools=[tool.function_schema for tool in tools],
                tool_choice="required",
                previous_response_id=last_response_id,
                store=True,
                metadata=metadata or {},
            )

        # Use retry mechanism to handle flagged content and other errors
        resp = retry_openai_call(
            openai_call_func=make_openai_call,
            max_retries=max_retries,
            entity_id=(metadata.get("entity_id", "unknown") if metadata else "unknown"),
        )
        last_response_id = resp.id
        i += 1

        if resp.usage:
            entity_id = metadata.get("entity_id")
            account_phone: str | None = None
            if entity_id:
                entity = Entity.objects.filter(id=entity_id).first()
                if entity:
                    account_phone = entity.account.account_phone

            track_llm_cost(
                usage=resp.usage,
                model=model,
                account_phone=account_phone,
                category="agent",
            )

        # Process the response and return the final result
        input = []
        for obj in resp.output:
            if obj.type == "function_call":
                tool_call = obj
                tool_name = tool_call.name
                tool = next((t for t in tools if t.name == tool_name), None)
                if not tool:
                    raise ValueError(f"Tool {tool_name} not found")
                args = json.loads(tool_call.arguments)
                with tool_span(tool_name, input=json.dumps(args)) as span:
                    try:
                        result = tool.execute(**args)
                        span.output(result)
                        input.append(
                            {
                                "type": "function_call_output",
                                "output": result,
                                "call_id": tool_call.call_id,
                            }
                        )
                    except TerminationException as e:
                        logger.info("Terminating agent.")
                        span.output("Terminated by tool.")
                        return e.output

    return None
