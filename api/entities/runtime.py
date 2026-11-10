from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Sequence

from openai.types.responses import ResponseInputItemParam, ResponseReasoningItemParam
from openai.types.shared import ChatModel

from api.settings import anthropic_client, oai
from entities.models import Entity
from entities.services import DRMService
from tracing.spans import llm_span, text_span, tool_span
from utils.llm_provider import LLMRequest, SystemPart, UnifiedLLMResponse, create_llm_response, is_claude_model
from utils.llms import retry_openai_call, track_llm_cost
from utils.timezone import force_timezone, format_datetime_for_llm

from .adapters import ADAPTER_REGISTRY, Adapter
from .constants import SYSTEM_PROMPT

if TYPE_CHECKING:
    from openai.types.responses import (
        EasyInputMessageParam,
        Response,
        ResponseFunctionToolCall,
    )

    from .models import Entity as EntityModel

logger = logging.getLogger(__name__)


# Note: sms_linq is the default for new entities (see get_default_adapters in models.py).
# Existing entities with "sms" adapter will continue to use Twilio.
# Both adapters are registered in the adapter registry.
FORCED_ADAPTERS = ["system", "LMS", "email", "documents", "sessions"]


class EntityRuntime:
    def __init__(self, entity: EntityModel):
        self.entity = entity
        self.id = entity.id
        self.model_name: ChatModel = entity.background_model or "claude-sonnet-4-5"  # type: ignore

        # Initialize DRM from stored data
        self.drm = DRMService(entity.id)

        # Build adapter instances from names stored on model (fallback to registry)
        self.adapters: list[Adapter] = [ADAPTER_REGISTRY[name] for name in entity.adapters if name in ADAPTER_REGISTRY]

        # Filter out adapters that are not in the registry
        adapters_not_in_registry = [adapter for adapter in entity.adapters if adapter not in ADAPTER_REGISTRY]
        if adapters_not_in_registry:
            logger.warning(
                f"Entity {self.entity.id} has adapters that are not in the registry: "
                f"{adapters_not_in_registry}. Removing them."
            )
            self.entity.adapters = [
                adapter for adapter in self.entity.adapters if adapter not in adapters_not_in_registry
            ]
            self.entity.save(update_fields=["adapters"])

        # Add forced adapters to entity
        for adapter_name in FORCED_ADAPTERS:
            if adapter_name not in self.entity.adapters and adapter_name in ADAPTER_REGISTRY:
                self.entity.adapters.append(adapter_name)
                self.adapters.append(ADAPTER_REGISTRY[adapter_name])
        self.entity.save(update_fields=["adapters"])

        # Compute available tool
        self.available_tools = [tool for adapter in self.adapters for tool in adapter.tools]

    # ------------------------------------------------------------------
    # Helper utilities
    # ------------------------------------------------------------------
    def _current_time(self) -> datetime:
        """Returns current time in entity's timezone."""
        utc_time = datetime.now(timezone.utc) + timedelta(minutes=self.entity.time_offset)
        return force_timezone(utc_time, self.entity.timezone)

    def _should_continue_running(self) -> bool:
        """
        Check if runtime should continue running by refreshing entity state from DB.
        Returns False if runtime was killed externally or sleep conditions are met.
        """
        self.entity.refresh_from_db()

        # Check if runtime was killed externally (e.g., by call coordinator)
        if not self.entity.status == Entity.EntityStatus.RUNNING:
            logger.info(f"Entity {self.entity.id} runtime was killed externally")
            return False

        return True

    # ------------------------------------------------------------------
    # Public behaviour
    # ------------------------------------------------------------------
    def run(self):
        """Execute the entity's autonomous loop until it decides to sleep or max iterations exceeded.

        Note: Status is already set to RUNNING by possibly_run_entity() before this task
        is queued, so we don't need to call wake() here.
        """
        with text_span("run_entity", entity=self.entity) as run_span:
            try:
                logger.info("Running entity %s", self.entity.id)

                self._add_wakeup_message()

                i = 0
                total_cost = 0.0
                while i < self.entity.max_messages and self._should_continue_running():
                    with text_span(f"turn_{i}", entity=self.entity) as turn_span:
                        i += 1
                        logger.debug("Iteration %d for entity %s", i, self.entity.id)
                        response, turn_cost = self._create_response()

                        # Add turn cost to span metadata
                        turn_span.set_metadata(cost_usd=turn_cost)
                        total_cost += turn_cost

                        # Check again after response creation (this can take several seconds)
                        if not self._should_continue_running():
                            # Something took over this entity, so we're done.
                            # We want to return instead of breaking to avoid persisting state.
                            return

                        self._process_tool_calls(response)

                # Add total cost to run_entity span metadata
                run_span.set_metadata(total_cost_usd=total_cost)
                logger.info("Entity %s finished run", self.entity.id)
            except Exception:
                self.entity.sleep(datetime.now() + timedelta(minutes=10))
                raise

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _add_wakeup_message(self):
        wake_msg: EasyInputMessageParam = {
            "type": "message",
            "role": "system",
            "content": (
                """
                You are being woken up from sleep. Gather as much information as possible about what's happening.
                Check all of your tools to get information before doing anything, and check any sections of the manual
                that might be relevant. Then, make a plan for what you're going to do given the information you have
                before executing that plan. Only sleep when you have no more information to gather or work to do.
                """
            ),
        }
        self.drm.log_messages([wake_msg])

    def _create_response(self) -> tuple[Response | UnifiedLLMResponse, float]:
        """Create LLM response and return the response with its cost."""
        # Memory context depends on summaries being current; bring them up to
        # date synchronously before building the request. This must complete
        # before the LLM call so the model sees a fully-summarized memory.
        try:
            self.drm.update_summaries()
        except Exception as e:
            logger.exception("Failed to update summaries for entity %s: %s", self.entity.id, e)

        request = self._build_llm_request()

        def make_llm_call():
            client = anthropic_client if is_claude_model(self.model_name) else oai
            return create_llm_response(client=client, model=self.model_name, request=request)

        # Prepare tracing input
        llm_input = json.dumps(
            {
                "model": request.model,
                "system_parts": [{"content": p.content, "cacheable": p.cacheable} for p in request.system_parts],
                "num_tools": len(request.tools),
                "tool_choice": request.tool_choice,
            },
            default=str,
        )
        llm_metadata = {
            "model": self.model_name,
            "effort": self.entity.reasoning_effort,
            "num_system_parts": len(request.system_parts),
            "num_tools": len(request.tools),
        }

        # Use retry mechanism for OpenAI, direct call for Claude
        provider = "claude" if is_claude_model(self.model_name) else "openai"
        cost = 0.0
        with llm_span(f"{provider}_api_call", input=llm_input, entity=self.entity, metadata=llm_metadata) as span:
            if is_claude_model(self.model_name):
                response = make_llm_call()
            else:
                response = retry_openai_call(
                    openai_call_func=make_llm_call,
                    max_retries=3,
                    entity_id=str(self.entity.id),
                )

            # Capture output summary
            output_parts = []
            if response.usage:
                output_parts.append(
                    f"tokens_in={response.usage.input_tokens}, tokens_out={response.usage.output_tokens}"
                )
            if response.output:
                output_parts.append(f"output_items={len(response.output)}")
            if output_parts:
                span.output(", ".join(output_parts))

            # Track cost and add to span metadata
            if response.usage:
                cost = track_llm_cost(
                    usage=response.usage,
                    model=self.model_name,
                    account_phone=self.entity.account.account_phone,
                    category="runtime",
                    provider=provider,
                )
                span.set_metadata(cost_usd=cost)

        return response, cost

    def _build_llm_request(self) -> LLMRequest:
        """Build a structured LLM request with explicit caching hints."""
        current_time = self._current_time()
        formatted_time = format_datetime_for_llm(current_time, self.entity.timezone)

        # Build tools list
        tools = [tool.to_schema() for tool in self.available_tools]
        tools.append({"type": "web_search"})

        # Build inbox status section (dynamic, not cached)
        inbox_status = self._get_inbox_status()

        return LLMRequest(
            model=self.model_name,
            system_parts=[
                # Stable parts - these get cached
                SystemPart(content=self._adapter_descriptions(), cacheable=True),
                SystemPart(
                    content=SYSTEM_PROMPT(
                        self.entity.name,
                        registration_source=self.entity.account.registration_source,
                    ),
                    cacheable=True,
                ),
                # Dynamic part - changes every call, not cached
                SystemPart(
                    content=(
                        f"Current date and time: {formatted_time} (Timezone: {self.entity.timezone})\n"
                        f"{inbox_status}"
                        f"----\n"
                        f"Here is your memory context:\n{self.drm.get_memory_context()}\n----\n"
                    ),
                    cacheable=False,
                ),
            ],
            tools=tools,
            tool_choice="auto",
            metadata={"entity_id": str(self.entity.id)},
            reasoning_effort=self.entity.reasoning_effort,
            entity_id=str(self.entity.id),
        )

    def _get_inbox_status(self) -> str:
        """Get a prominent inbox status section for unread messages."""
        alerts = []

        # Check unread SMS
        unread_sms = self.entity.has_unread_sms()
        if unread_sms:
            alerts.append(f"📱 UNREAD SMS from: {', '.join(unread_sms)}")

        # Check unread emails
        unread_emails = self.entity.has_unread_emails()
        if unread_emails:
            alerts.append(f"📧 UNREAD EMAILS: {len(unread_emails)} thread(s)")

        if not alerts:
            return ""

        return (
            "\n⚠️ ACTION REQUIRED - UNREAD MESSAGES ⚠️\n"
            + "\n".join(alerts)
            + "\nYou must check these before doing anything else.\n"
        )

    def _adapter_descriptions(self) -> str:
        parts = []
        for adapter in self.adapters:
            # Format adapter description with tools
            adapter_desc = f"- {adapter.name}: {adapter.description}\n  Tools:\n  "
            adapter_desc += "\n  ".join(f"- {tool.name}: {tool.description}" for tool in adapter.tools)

            detail = adapter.detail(self)
            if detail:
                adapter_desc += f"\n  {detail}"

            parts.append(adapter_desc)
        return "\n\n".join(parts)

    def _process_tool_calls(self, resp: Response | UnifiedLLMResponse):
        # Handle all tool calls.
        tcps: Sequence[ResponseInputItemParam] = []
        tcos: Sequence[ResponseInputItemParam] = []
        after_messages: list[ResponseInputItemParam] = []

        # Track if this response included a web search
        had_web_search = any(getattr(o, "type", None) == "web_search_call" for o in resp.output)

        for output in resp.output:
            if output.type == "function_call":
                tc: ResponseFunctionToolCall = output

                # Handle custom tools
                tool = next((tool for tool in self.available_tools if tool.name == tc.name), None)
                if not tool:
                    logger.error(f"Tool {tc.name} not found")
                    continue

                if tool and tc.id:
                    args: dict[str, Any] = json.loads(tc.arguments)

                    try:
                        reasoning = args.pop("reasoning", None)
                        with tool_span(tc.name, input=json.dumps({**args, "reasoning": reasoning})) as span:
                            result = tool._execute(
                                runtime=self,
                                parameters=args,
                            )
                            span.output(result)
                    except Exception as e:
                        logger.error(f"Runtime {self.entity.id}: Tool {tc.name} failed: {str(e)}")
                        result = f"Tool execution failed: {str(e)}"

                    # Add the tool call to context
                    tcps.append(
                        {
                            "id": tc.id,
                            "name": tc.name,
                            "call_id": tc.call_id,
                            "type": "function_call",
                            "arguments": tc.arguments,
                        }
                    )
                    trimmed_result = result.strip()
                    parsed_output: dict[str, Any] | None = None
                    if trimmed_result.startswith("{"):
                        try:
                            parsed_output = json.loads(trimmed_result)
                        except json.JSONDecodeError:
                            parsed_output = None

                    description_text: str | None = None
                    source_url: str | None = None
                    question_text: str | None = None

                    if isinstance(parsed_output, dict):
                        description_text = parsed_output.get("description")
                        if isinstance(description_text, str):
                            description_text = description_text.strip()
                        source_url = parsed_output.get("source_url") or parsed_output.get("image_url")
                        raw_question = parsed_output.get("question")
                        if isinstance(raw_question, str):
                            question_text = raw_question.strip() or None

                        if parsed_output.get("error"):
                            description_text = None

                        tcos.append(
                            {
                                "call_id": tc.call_id,
                                "type": "function_call_output",
                                "output": result,
                            }
                        )
                    elif trimmed_result.startswith("image_url:") or trimmed_result.startswith('"image_url:'):
                        trimmed = trimmed_result.strip('"').strip("'")
                        image_url = trimmed.split("image_url:")[1].strip()
                        tcos.append(
                            {
                                "call_id": tc.call_id,
                                "type": "function_call_output",
                                "output": "Success",
                            }
                        )
                        after_messages.append(
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "input_image",
                                        "image_url": image_url,
                                        "detail": "high",
                                    }
                                ],
                            }
                        )
                    else:
                        tcos.append(
                            {
                                "call_id": tc.call_id,
                                "type": "function_call_output",
                                "output": result,
                            }
                        )

                    if description_text and source_url:
                        reason_text = (reasoning or "").strip() if reasoning else ""
                        prefix = "Image review" if not reason_text else f"Image review ({reason_text})"
                        if question_text:
                            message_text = f"{prefix}: Question: {question_text} Answer: {description_text}"
                        else:
                            message_text = f"{prefix}: {description_text}"
                        if source_url:
                            message_text = f"{message_text} (source: {source_url})"
                        after_messages.append({"role": "user", "content": message_text})
                else:
                    logger.error(f"Tool {tc.name} not found")
            elif output.type == "web_search_call":
                # Handle OpenAI's built-in web search tool
                search_id = getattr(output, "id", None)
                search_status = getattr(output, "status", "unknown")

                logger.info(f"Web search completed: id={search_id}, status={search_status}")

                with tool_span("web_search", input=json.dumps({"id": search_id})) as span:
                    span.output(f"Web search {search_status}")

                # Log the web search call to context
                web_search_item = {
                    "type": "web_search_call",
                    "id": search_id,
                    "status": search_status,
                }
                self.drm.log_messages([web_search_item])  # type: ignore[list-item]

            elif output.type == "message":
                # Handle message output - only log as web search response if it followed a web search
                if not had_web_search:
                    # Regular message output, not from web search - skip detailed logging
                    continue

                message_content = getattr(output, "content", [])
                message_role = getattr(output, "role", "assistant")
                message_id = getattr(output, "id", None)

                # Extract text and annotations from the message
                for content_block in message_content:
                    if hasattr(content_block, "type") and content_block.type == "output_text":
                        text = getattr(content_block, "text", "")
                        annotations = getattr(content_block, "annotations", [])

                        # Log citations if present
                        if annotations:
                            citation_urls = [
                                getattr(a, "url", "") for a in annotations if getattr(a, "type", "") == "url_citation"
                            ]
                            logger.info(f"Web search response with {len(citation_urls)} citations")

                        with text_span("web_search_response", input=text) as span:
                            span.output(text)

                # Log the web search message to context
                message_item = {
                    "type": "message",
                    "id": message_id,
                    "role": message_role,
                    "content": [
                        block.model_dump() if hasattr(block, "model_dump") else block for block in message_content
                    ],
                }
                self.drm.log_messages([message_item])  # type: ignore[list-item]

            elif output.type == "reasoning":
                encrypted_content = getattr(output, "encrypted_content", None)
                summary = getattr(output, "summary", None)
                # Claude extended thinking stores the actual content in 'content' field
                thinking_content = getattr(output, "content", None)

                reasoning_item: ResponseReasoningItemParam = {
                    "id": output.id,
                    "summary": [],
                    "type": "reasoning",
                }

                if summary is not None:
                    if isinstance(summary, list):
                        reasoning_item["summary"] = [
                            item.model_dump() if hasattr(item, "model_dump") else item for item in summary
                        ]
                    elif hasattr(summary, "model_dump"):
                        reasoning_item["summary"] = summary.model_dump()
                    else:
                        reasoning_item["summary"] = summary

                if encrypted_content is not None:
                    reasoning_item["encrypted_content"] = encrypted_content

                if thinking_content is not None:
                    reasoning_item["content"] = thinking_content

                with text_span("thinking") as span:
                    # For Claude, show the actual thinking content; for OpenAI, show the summary
                    if thinking_content:
                        span.output(thinking_content)
                    else:
                        span.output(json.dumps(reasoning_item))

                self.drm.log_messages([reasoning_item])
            else:
                logger.warning(f"Unexpected output type: {output.type}")

        # Add tool calls and outputs to messages
        self.drm.log_messages([*tcps, *tcos, *after_messages])
