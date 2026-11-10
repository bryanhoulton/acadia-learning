from __future__ import annotations

import json
import logging
from zoneinfo import ZoneInfo

from entities.models import Message
from utils import safe_delete

logger = logging.getLogger(__name__)


class Compression:
    def __init__(self, entity):
        self.entity = entity

    def format_message(self, msg: Message) -> str | None:
        return self.format_message_with_filter_level(msg, 0)

    def format_message_with_filter_level(self, msg: Message, filter_level: int) -> str | None:
        # Always apply base filtering first
        if "thought_planning" in msg.message_data:
            return None
        if "show_account" in msg.message_data or "profiles" in msg.message_data:
            return None
        if "This is your memory context" in msg.message_data.get("content", ""):
            return None
        if "function_call_output" in msg.message_data:
            return None

        # Strip ID from message data
        if "id" in msg.message_data:
            del msg.message_data["id"]

        # Check for check_everything/tool noise
        if "content" in msg.message_data and isinstance(msg.message_data["content"], list):
            for block in msg.message_data["content"]:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    content = block.get("content", "")
                    if "current time:" in str(content).lower() and "canvas content" in str(content).lower():
                        return None

        # Apply filter level specific rules
        if filter_level >= 1:
            if "content" in msg.message_data and isinstance(msg.message_data["content"], list):
                for block in msg.message_data["content"]:
                    if isinstance(block, dict):
                        if block.get("type") == "tool_use" and block.get("name") == "wait":
                            return None
                        if (
                            block.get("type") == "tool_result"
                            and "interrupted by user" in str(block.get("content", "")).lower()
                        ):
                            return None
                        if block.get("type") == "tool_result" and "waited for" in str(block.get("content", "")).lower():
                            return None

            if msg.message_data.get("content") == "The user updated the canvas.":
                return None

        if filter_level >= 2:
            if "content" in msg.message_data and isinstance(msg.message_data["content"], list):
                for block in msg.message_data["content"]:
                    if isinstance(block, dict):
                        if block.get("type") == "tool_result" and len(str(block.get("content", ""))) > 200:
                            content = str(block.get("content", ""))
                            if "skills check - question" in content.lower() and content.count("question") > 1:
                                return None

        if filter_level >= 3:
            if "content" in msg.message_data and isinstance(msg.message_data["content"], list):
                for block in msg.message_data["content"]:
                    if isinstance(block, dict):
                        if block.get("type") == "tool_use" and block.get("name") == "speak":
                            input_data = block.get("input", {})
                            if isinstance(input_data, dict):
                                message_text = input_data.get("message", "")
                                if len(str(message_text)) < 20:
                                    return None
                        if block.get("type") == "tool_result" and len(str(block.get("content", ""))) > 500:
                            return None

        optimized_data = self._apply_always_on_compression(msg.message_data)
        if not optimized_data:
            return None

        if filter_level >= 4:
            if "content" in optimized_data and isinstance(optimized_data["content"], list):
                essential_blocks = []
                for block in optimized_data["content"]:
                    if isinstance(block, dict):
                        if block.get("type") == "tool_use" and block.get("name") == "speak":
                            input_data = block.get("input", {})
                            if isinstance(input_data, dict):
                                message_text = input_data.get("message", "")
                                if len(str(message_text)) > 30 and any(
                                    word in str(message_text).lower()
                                    for word in [
                                        "correct",
                                        "perfect",
                                        "excellent",
                                        "good",
                                        "right",
                                        "question",
                                        "problem",
                                    ]
                                ):
                                    essential_blocks.append(block)
                        elif block.get("type") == "tool_result":
                            content = str(block.get("content", ""))
                            if "user_answer" in content and content.count("user_answer") == 1:
                                try:
                                    import re

                                    answer_match = re.search(r'"user_answer":\s*"([^"]*)"', content)
                                    if answer_match and answer_match.group(1).strip():
                                        compressed_block = {
                                            "type": "tool_result",
                                            "content": f"Answer: {answer_match.group(1)}",
                                            "tool_use_id": block.get("tool_use_id", ""),
                                        }
                                        essential_blocks.append(compressed_block)
                                except Exception as e:
                                    logger.error(f"Error parsing tool result: {content} {e}")
                                    pass

                if not essential_blocks:
                    return None
                optimized_data["content"] = essential_blocks
            else:
                content = optimized_data.get("content", "")
                if isinstance(content, str) and len(content) < 10:
                    return None

        time_str = msg.timestamp.astimezone(ZoneInfo(self.entity.timezone)).strftime("%H:%M:%S")

        data = json.loads(json.dumps(optimized_data))
        safe_delete(data, "id", "call_id", "type", "signature")
        if "content" in data and hasattr(data["content"], "__len__"):
            for part in data["content"]:
                if isinstance(part, dict):
                    safe_delete(part, "signature")

        content = json.dumps(data)
        return f"\n{time_str}: {content}"

    def _apply_always_on_compression(self, msg_data: dict) -> dict | None:
        data = json.loads(json.dumps(msg_data))

        if self._is_tool_result_confirmation(data):
            return None

        if "content" in data and isinstance(data["content"], list):
            compressed_content = []
            for block in data["content"]:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    compressed_block = {
                        "type": "tool_use",
                        "name": block.get("name", "unknown"),
                    }
                    if "input" in block:
                        input_str = str(block["input"])
                        if len(input_str) < 100:
                            compressed_block["input"] = block["input"]
                        elif len(input_str) < 500:
                            compressed_block["input_summary"] = input_str[:100] + "..."
                    compressed_content.append(compressed_block)
                else:
                    compressed_content.append(block)
            data["content"] = compressed_content

        return data

    def _truncate_message_to_tokens(self, message: str, max_tokens: int, enc) -> str:
        current_tokens = len(enc.encode(message))
        if current_tokens <= max_tokens:
            return message
        left, right = 0, len(message)
        while left < right:
            mid = (left + right + 1) // 2
            truncated = message[:mid] + "... (truncated due to token limit)"
            if len(enc.encode(truncated)) <= max_tokens:
                left = mid
            else:
                right = mid - 1
        return message[:left] + "... (truncated due to token limit)"

    def apply_compression_strategies(self, messages: list[Message], available_tokens: int, enc) -> list[str]:
        formatted_messages = []
        for msg in messages:
            formatted = self.format_message(msg)
            if formatted:
                formatted_messages.append(formatted)

        total_tokens = sum(len(enc.encode(msg)) for msg in formatted_messages)
        if total_tokens <= available_tokens:
            logger.debug(f"Always-on compression sufficient: {total_tokens}/{available_tokens} tokens")
            return formatted_messages

        final_messages = []
        remaining_budget = available_tokens
        for msg in formatted_messages:
            msg_tokens = len(enc.encode(msg))
            if msg_tokens <= remaining_budget:
                final_messages.append(msg)
                remaining_budget -= msg_tokens
            else:
                if remaining_budget > 100:
                    truncated = self._truncate_message_to_tokens(msg, remaining_budget - 50, enc)
                    final_messages.append(truncated)
                break
        return final_messages

    def _is_tool_result_confirmation(self, msg_data: dict) -> bool:
        if "content" in msg_data and isinstance(msg_data["content"], list):
            for block in msg_data["content"]:
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    content = str(block.get("content", ""))
                    confirmations = [
                        "spoke message to user",
                        "message sent",
                        "action completed",
                        "tool executed successfully",
                    ]
                    if any(conf in content.lower() for conf in confirmations):
                        return True
        return False
