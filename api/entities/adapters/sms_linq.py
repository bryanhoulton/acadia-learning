"""
Linq SMS Adapter

SMS adapter using Linq API instead of Twilio.
Provides same tools as Twilio adapter (sms_list, sms_send, open_image) plus sms_react.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import timedelta
from textwrap import dedent
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import models
from django.utils import timezone

from entities.adapters import Adapter, Tool, format_time_ago, register_adapter
from entities.adapters.sms import OpenImageTool, clean_sms_text
from lms.accounts.models import UserProfile
from sms.models import SMSAttachment, SMSMessage
from utils.linq import LINQ_REACTION_TYPES, LinqClient, format_e164
from utils.slack import SlackChannel, send_slack_message

if TYPE_CHECKING:
    from entities.runtime import EntityRuntime

logger = logging.getLogger(__name__)


def _get_linq_client() -> LinqClient:
    """Get a configured Linq client."""
    return LinqClient()


def _get_linq_phone_number() -> str:
    """Get the configured Linq phone number."""
    return os.environ.get("LINQ_PHONE_NUMBER", "")


class SmsListTool(Tool):
    """List SMS messages - same interface as Twilio adapter."""

    name = "sms_list"
    description = (
        "List SMS messages exchanged with a user profile (or all user profiles if omitted). Returns latest first."
    )
    parameters = {
        "user_profile_id": {
            "type": "string",
            "description": "Optional user profile ID to filter messages",
        },
        "limit": {
            "type": "integer",
            "description": "Optional limit on the number of messages to return",
        },
    }

    def execute(self, entity_runtime: EntityRuntime, parameters: dict) -> list | dict:
        user_profile_id = parameters.get("user_profile_id")
        entity = entity_runtime.entity

        if user_profile_id:
            # Full conversation view for a specific contact
            try:
                profile = UserProfile.objects.get(pk=user_profile_id, account=entity.account)
                phone_numbers = [profile.phone]
                # Update last read time for this contact
                profile.last_sms_read_time = timezone.now() + timedelta(minutes=entity.time_offset)
                profile.save()

                # Send read receipt to Linq for this chat
                self._send_read_receipts(profile.phone)

            except UserProfile.DoesNotExist:
                return {"error": "User profile not found"}

            limit = parameters.get("limit", 100)
            messages_qs = SMSMessage.objects.filter(
                models.Q(from_number__in=phone_numbers) | models.Q(to_number__in=phone_numbers)
            ).order_by("-created_at")
            if limit:
                messages_qs = messages_qs[:limit]

            results = []
            for m in messages_qs:
                result = {
                    "id": str(m.pk),
                    "linq_message_id": m.linq_message_id,
                    "from": m.from_number,
                    "to": m.to_number,
                    "body": m.body,
                    "direction": m.direction,
                    "seconds_ago": (timezone.now() - m.created_at).total_seconds(),
                }
                if m.has_attachments:
                    attachments = SMSAttachment.objects.filter(message=m)
                    attachment_data = []
                    for a in attachments:
                        att_info = {
                            "url": a.media_url,
                            "content_type": a.content_type,
                        }
                        # Include transcription for voice messages
                        if a.is_audio() and a.transcription:
                            att_info["transcription"] = a.transcription
                        attachment_data.append(att_info)
                    result["attachments"] = attachment_data
                results.append(result)
            return results

        # General inbox view - all messages (same as Twilio adapter)
        profiles = UserProfile.objects.filter(account=entity.account)
        phone_numbers = list(profiles.values_list("phone", flat=True))

        # Update last read time for all profiles (bulk update for efficiency)
        profiles.update(last_sms_read_time=timezone.now() + timedelta(minutes=entity.time_offset))

        # NOTE: We don't send read receipts here - that would require N API calls
        # (one per chat), which is too slow. Read receipts are sent when viewing
        # a specific conversation via user_profile_id parameter.

        limit = parameters.get("limit", 100)
        messages_qs = SMSMessage.objects.filter(
            models.Q(from_number__in=phone_numbers) | models.Q(to_number__in=phone_numbers)
        ).order_by("-created_at")
        if limit:
            messages_qs = messages_qs[:limit]

        results = []
        for m in messages_qs:
            result = {
                "id": str(m.pk),
                "linq_message_id": m.linq_message_id,
                "from": m.from_number,
                "to": m.to_number,
                "body": m.body,
                "direction": m.direction,
                "seconds_ago": (timezone.now() - m.created_at).total_seconds(),
            }
            if m.has_attachments:
                attachments = SMSAttachment.objects.filter(message=m)
                attachment_data = []
                for a in attachments:
                    att_info = {
                        "url": a.media_url,
                        "content_type": a.content_type,
                    }
                    # Include transcription for voice messages
                    if a.is_audio() and a.transcription:
                        att_info["transcription"] = a.transcription
                    attachment_data.append(att_info)
                result["attachments"] = attachment_data
            results.append(result)
        return results

    def _send_read_receipts(self, phone_number: str) -> None:
        """Send read receipt for chats with a phone number."""
        if settings.TESTING:
            return

        try:
            client = _get_linq_client()
            formatted_phone = format_e164(phone_number)

            # Get unique linq_chat_ids from stored messages (more reliable than find_chat)
            chat_ids = set(
                SMSMessage.objects.filter(
                    models.Q(from_number=formatted_phone) | models.Q(to_number=formatted_phone),
                    linq_chat_id__isnull=False,
                ).values_list("linq_chat_id", flat=True)
            )

            for chat_id in chat_ids:
                try:
                    client.mark_as_read(chat_id)
                    logger.info(f"Sent read receipt for chat {chat_id}")
                except Exception as e:
                    logger.warning(f"Failed to send read receipt for chat {chat_id}: {e}")

            # Fallback: try find_chat if no stored chat IDs
            if not chat_ids:
                chat = client.find_chat([formatted_phone])
                if chat:
                    client.mark_as_read(chat.id)
                    logger.info(f"Sent read receipt for chat {chat.id} (via find_chat)")
        except Exception as e:
            # Don't fail the list operation if read receipt fails
            logger.warning(f"Failed to send read receipt: {e}")

    def format_result(self, result):
        if isinstance(result, dict) and "error" in result:
            return f"Error: {result['error']}"

        if not result:
            return "No messages found."

        lines = [f"SMS INBOX ({len(result)} messages)", "─" * 40]

        for msg in result:
            direction = "→" if msg["direction"] == "outbound" else "←"
            time_ago = format_time_ago(msg.get("seconds_ago"))

            # Format: [direction] from → to (time)
            header = f"{direction} {msg['from']} → {msg['to']}  ({time_ago})"
            lines.append(header)

            # Show message ID if available (for reactions)
            if msg.get("linq_message_id"):
                lines.append(f"   [msg_id: {msg['linq_message_id']}]")

            # Message body, indented
            body = msg.get("body", "").strip()
            if body:
                lines.append(f'   "{body}"')

            # Attachments if present
            if msg.get("attachments"):
                lines.append(f"   📎 {len(msg['attachments'])} attachment(s)")
                for att in msg["attachments"]:
                    if isinstance(att, dict):
                        content_type = att.get("content_type", "")
                        if content_type.startswith("audio/"):
                            # Voice message
                            transcription = att.get("transcription")
                            if transcription:
                                lines.append(f'      🎤 Voice message: "{transcription}"')
                            else:
                                lines.append(f"      🎤 Voice message (transcription pending): {att.get('url')}")
                        else:
                            lines.append(f"      {att.get('url')}")
                    else:
                        # Backwards compatibility with old format (just URL string)
                        lines.append(f"      {att}")

            lines.append("")  # Blank line between messages

        return "\n".join(lines)


class SmsSendTool(Tool):
    """Send SMS message - same interface as Twilio adapter."""

    name = "sms_send"
    description = """
    Send an SMS message to a user profile. Always check the previous messages before sending a new one so you have full context.

    You should sound like a friend rather than a traditional chatbot. Prefer not to use corporate jargon or overly formal language.
    Respond briefly when it makes sense to.

    When the user is just chatting, do not unnecessarily offer help or to explain anything; this sounds robotic.
    Humor or sass is a much better choice, but use your judgement.

    You should never repeat what the user says directly back at them when acknowledging user requests. Instead, acknowledge
    it naturally. Think about how easy your message is to read and understand, and optimize for that.

    Examples of human texting voice:
    - How's it going?
    - Sounds good, I'll focus on that next.
    - Is 4:45pm on Thursday okay for next week?

    Do not curse or use any offensive language.

    When needed, sequence multiple messages one after another. You should mimic normal texting behavior and favor
    sending short messages, even if you need multiple. Whenever you want to do newline breaks in a single message, it
    should probably be separated into multiple messages. Most texts should be a single line.
    """
    parameters = {
        "user_profile_id": {"type": "string", "description": "ID of the user profile"},
        "message": {"type": "string", "description": "Message to send"},
    }

    def execute(self, entity_runtime: EntityRuntime, parameters: dict) -> dict:
        user_profile_id = parameters.get("user_profile_id")
        text = parameters.get("message")
        if not user_profile_id or not text:
            return {"error": "user_profile_id and message required"}

        # Clean the text before sending
        text = clean_sms_text(text)
        linq_phone = _get_linq_phone_number()

        # Fail with unread messages
        if entity_runtime.entity.has_unread_sms():
            return {
                "error": dedent(
                    """
                    You have unread messages since you last checked.
                    Check those first before sending more messages.
                    """
                )
            }

        try:
            contact = UserProfile.objects.get(pk=user_profile_id, account=entity_runtime.entity.account)
        except UserProfile.DoesNotExist:
            # Try to handle truncated UUIDs by attempting common completions
            contact = self._find_profile_with_truncated_id(user_profile_id, entity_runtime.entity.account)
            if not contact:
                return {"error": "User profile not found"}

        # Check if user has texted us first (required for deliverability)
        has_inbound = SMSMessage.objects.filter(
            from_number=contact.phone,
            direction="inbound",
        ).exists()

        if not has_inbound:
            return {
                "error": "Cannot send message: this user has not texted us yet. "
                "For deliverability reasons, we can only respond to users who text us first. You must wait."
            }

        try:
            # Add delay to simulate more natural typing cadence
            time.sleep(2)

            linq_message_id = None
            linq_chat_id = None

            if not settings.TESTING:
                client = _get_linq_client()
                formatted_phone = format_e164(contact.phone)

                # Check if we have an existing chat with this contact
                existing_chat = client.find_chat([formatted_phone])

                if existing_chat:
                    # Send to existing chat
                    linq_chat_id = existing_chat.id
                    message = client.send_message(existing_chat.id, text)
                    linq_message_id = message.id

                    # Check if this is our first outbound message - share contact card
                    first_outbound = not SMSMessage.objects.filter(
                        to_number=contact.phone,
                        direction="outbound",
                        linq_chat_id__isnull=False,
                    ).exists()

                    if first_outbound:
                        try:
                            client.share_contact(existing_chat.id)
                            logger.info(f"Shared contact card in chat {existing_chat.id}")
                        except Exception as e:
                            logger.warning(f"Failed to share contact card: {e}")
                else:
                    # Create new chat with initial message
                    chat, message = client.create_chat([formatted_phone], text)
                    linq_chat_id = chat.id
                    linq_message_id = message.id

                    # Share contact card on new chat
                    try:
                        client.share_contact(chat.id)
                        logger.info(f"Shared contact card in new chat {chat.id}")
                    except Exception as e:
                        logger.warning(f"Failed to share contact card: {e}")

            send_slack_message(
                SlackChannel.SMS_MESSAGES,
                f"[Linq] Sending SMS to {str(contact)}: {text}",
            )

            # Store outgoing SMS
            SMSMessage.objects.create(
                from_number=linq_phone,
                to_number=contact.phone,
                body=text.replace("\x00", ""),  # Remove NUL characters
                linq_chat_id=linq_chat_id,
                linq_message_id=linq_message_id,
                direction="outbound",
            )

            return {"status": "sent", "message_id": linq_message_id}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to send Linq message")
            return {"error": str(exc)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            if result.get("status") == "sent":
                return "Message sent successfully."
        return str(result)

    @staticmethod
    def _find_profile_with_truncated_id(truncated_id: str, account) -> UserProfile | None:
        """Attempt to find a UserProfile when the ID may be truncated by the LLM."""
        for suffix in "0123456789abcdef":
            candidate_id = truncated_id + suffix
            try:
                return UserProfile.objects.get(pk=candidate_id, account=account)
            except UserProfile.DoesNotExist:
                continue
        return None


class SmsReactTool(Tool):
    """Add or remove a reaction to a message."""

    name = "sms_react"
    description = """
    Add or remove a reaction to an SMS message. Use this to respond to messages with emoji reactions
    instead of or in addition to text replies. This is a great way to acknowledge messages quickly
    or show appreciation without sending a full response.

    Don't use them a ton, maybe 1 in every 10-ish messages is enough.

    Available reaction types:
    - love: ❤️ heart (user says something clearly wholesome or amazing)
    - like: 👍 thumbs up (acknowledge a message without responding directly to it)
    - dislike: 👎 thumbs down (don't use this)
    - laugh: 😂 laughing (user says something that is clearly a joke)
    - emphasize: ‼️ double exclamation (user says something surprising)
    - question: ❓ question mark (if someone doesn't answer a question for a while, add this reaction to remind them)

    You need the linq_message_id from sms_list to react to a message. Be *sure* the reaction is appropriate before sending.
    """
    parameters = {
        "message_id": {
            "type": "integer",
            "description": "The linq_message_id of the message to react to (from sms_list)",
        },
        "reaction_type": {
            "type": "string",
            "description": "Type of reaction: love, like, dislike, laugh, emphasize, question",
        },
        "remove": {
            "type": "boolean",
            "description": "If true, remove the reaction instead of adding it. Default is false (add).",
        },
    }

    def execute(self, entity_runtime: EntityRuntime, parameters: dict) -> dict:
        message_id = parameters.get("message_id")
        reaction_type = parameters.get("reaction_type", "").lower()
        remove = parameters.get("remove", False)

        if not message_id:
            return {"error": "message_id is required"}

        if reaction_type not in LINQ_REACTION_TYPES:
            return {"error": f"Invalid reaction type. Must be one of: {', '.join(LINQ_REACTION_TYPES)}"}

        if settings.TESTING:
            return {"status": "removed" if remove else "added", "reaction": reaction_type}

        try:
            client = _get_linq_client()

            if remove:
                client.remove_reaction(message_id, reaction_type)
                logger.info(f"Removed {reaction_type} reaction from message {message_id}")
            else:
                client.add_reaction(message_id, reaction_type)
                logger.info(f"Added {reaction_type} reaction to message {message_id}")

            return {"status": "removed" if remove else "added", "reaction": reaction_type}

        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to react to message")
            return {"error": str(exc)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            if result.get("status") in ("added", "removed"):
                action = "Removed" if result["status"] == "removed" else "Added"
                return f"{action} {result['reaction']} reaction."
        return str(result)


@register_adapter
class LinqSmsAdapter(Adapter):
    """SMS adapter using Linq API."""

    name = "sms_linq"
    description = f"""Allows you to send and read SMS messages via Linq (iMessage).
    Having access to this means great responsibility. Do not spam people,
    do not send unsolicited messages, and be very careful about who you text
    and when. Don't repeat yourself.

    Also, make sure you don't text someone late at night in their timezone!
    That's rude (unless you have evidence that they're awake and available to chat, like
    them texting you first, or signing up).

    Match the tone of the messages for the person you're texting. If they're a parent,
    be more formal and professional. If they're a student, be more casual. Be very clear
    when talking with parents - avoid abbreviations and use full sentences.

    Your phone number is {os.environ.get("LINQ_PHONE_NUMBER")}

    Write casual texts - don't greet the user every message.

    UTF-8 characters are supported, including emojis and special punctuation like curly quotes. Don't use emoji's unless the user does.

    You can also react to messages with emoji reactions (love, like, laugh, etc.) using the sms_react tool.

    Voice messages are automatically transcribed - you can hear what they said. When someone sends
    a voice message, respond naturally as if you listened to it. Don't mention "transcription" or
    that it was converted to text - just respond to what they said.
    """
    tools = [SmsListTool(), SmsSendTool(), SmsReactTool(), OpenImageTool()]

    def detail(self, entity_runtime: EntityRuntime) -> str:
        unread_sms = entity_runtime.entity.has_unread_sms()
        if unread_sms:
            return f"You have unread SMS messages from {unread_sms}"
        else:
            return "You have no unread SMS messages"
