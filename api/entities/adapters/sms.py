from __future__ import annotations

import base64
import logging
import os
import time
import uuid
from datetime import timedelta
from textwrap import dedent
from typing import TYPE_CHECKING
from urllib.parse import unquote_to_bytes

import requests
from django.conf import settings
from django.utils import timezone

from api.settings import TWILIO_PHONE_NUMBER, oai, twilio
from entities.adapters import Adapter, Tool, format_time_ago, register_adapter
from lms.accounts.models import UserProfile
from sms.models import SMSAttachment, SMSMessage
from utils.slack import SlackChannel, send_slack_message

if TYPE_CHECKING:
    pass


logger = logging.getLogger(__name__)


def clean_sms_text(text: str) -> str:
    """Clean SMS text to ensure it is safe for sending via Twilio.

    Handles:
    1. Known control character artifacts from LLM generation
    2. Stripping of control characters that could display as null/weird

    UTF-8 characters (emojis, curly quotes, accented chars) are preserved.
    """
    if not text:
        return ""

    # Replace known control character artifacts that sometimes appear in LLM output
    # These map specific control characters to their likely intended punctuation
    control_char_replacements = {
        "\x19": "'",  # often replaces '
        "\x14": "-",  # often replaces - or —
        "\x11": "-",  # often replaces -
        "\x12": "'",
        "\x13": "-",
        "\x10": "-",
    }
    for k, v in control_char_replacements.items():
        text = text.replace(k, v)

    # Strip control characters (C0) except newlines/tabs - these can show as null/weird
    chars = []
    for char in text:
        if ord(char) < 32 and char not in ("\n", "\r", "\t"):
            continue
        chars.append(char)

    return "".join(chars).strip()


class SmsListTool(Tool):
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

    def execute(self, entity_runtime, parameters):
        user_profile_id = parameters.get("user_profile_id")
        entity = entity_runtime.entity

        if user_profile_id:
            try:
                profile = UserProfile.objects.get(pk=user_profile_id, account=entity.account)
                phone_numbers = [profile.phone]
                # Update last read time for this contact
                profile.last_sms_read_time = timezone.now() + timedelta(minutes=entity.time_offset)
                profile.save()
            except UserProfile.DoesNotExist:
                return {"error": "User profile not found"}
        else:
            profiles = UserProfile.objects.filter(account=entity.account)
            phone_numbers = list(profiles.values_list("phone", flat=True))
            # Update last read time for all profiles
            for profile in profiles:
                profile.last_sms_read_time = timezone.now() + timedelta(minutes=entity.time_offset)
                profile.save()

        limit = parameters.get("limit", 100)

        messages_qs = SMSMessage.objects.filter(from_number__in=phone_numbers) | SMSMessage.objects.filter(
            to_number__in=phone_numbers
        )
        messages_qs = messages_qs.order_by("-created_at")
        if limit:
            messages_qs = messages_qs[:limit]

        results = []
        for m in messages_qs:
            result = {
                "id": str(m.pk),
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

            # Message body, indented
            body = msg.get("body", "").strip()
            if body:
                # Wrap long messages
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

    def execute(self, entity_runtime, parameters):
        user_profile_id = parameters.get("user_profile_id")
        text = parameters.get("message")
        if not user_profile_id or not text:
            return {"error": "user_profile_id and message required"}

        # Clean the text before sending
        text = clean_sms_text(text)

        # Fail with unread messages.
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

        try:
            # Add delay to simulate more natural typing cadence
            time.sleep(2)

            sid = None
            if not settings.TESTING:
                message = twilio.messages.create(body=text, from_=TWILIO_PHONE_NUMBER, to=contact.phone)
                sid = message.sid
            else:
                sid = str(uuid.uuid4())

            send_slack_message(
                SlackChannel.SMS_MESSAGES,
                f"Sending SMS to {str(contact)}: {text}",
            )

            # Store outgoing SMS
            SMSMessage.objects.create(
                from_number=TWILIO_PHONE_NUMBER,
                to_number=contact.phone,
                body=text.replace("\x00", ""),  # Remove NUL characters
                twilio_sid=sid,
                direction="outbound",
            )

            return {"status": "sent", "sid": sid}
        except Exception as exc:  # noqa: BLE001
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
        """Attempt to find a UserProfile when the ID may be truncated by the LLM.

        Models often leave off the last character of UUIDs. This tries common
        completions (0-9, a-f) to find a match.
        """
        # Try appending hex characters (0-9, a-f)
        for suffix in "0123456789abcdef":
            candidate_id = truncated_id + suffix
            try:
                return UserProfile.objects.get(pk=candidate_id, account=account)
            except UserProfile.DoesNotExist:
                continue

        return None


class OpenImageTool(Tool):
    name = "open_image"
    description = "Open an image from a URL and optionally answer a specific question about it"
    parameters = {
        "url": {"type": "string", "description": "URL of the image to open"},
        "question": {
            "type": ["string", "null"],
            "description": "Optional question to answer about the image. If omitted, the image will be described without a specific context.",
        },
    }

    def execute(self, entity_runtime, parameters):
        url = parameters.get("url")
        question = parameters.get("question")
        if not url:
            return {"error": "url is required"}

        try:
            image_bytes, content_type, source_url = self._load_image_bytes(url)
        except requests.RequestException as exc:
            logger.warning("Failed to download image from %s: %s", url, exc)
            return {"error": f"Failed to download image: {exc}"}
        except ValueError as exc:
            logger.warning("Invalid image data for %s: %s", url, exc)
            return {"error": str(exc)}

        base64_image = base64.b64encode(image_bytes).decode("utf-8")

        description = self._describe_image(base64_image, content_type, question)
        if not description:
            description = "Unable to generate a description for the image."

        result: dict[str, str | None] = {
            "description": description,
            "source_url": source_url,
            "content_type": content_type,
            "question": question,
        }

        return result

    # Note: OpenImageTool intentionally uses the default JSON format_result
    # because EntityRuntime._process_tool_calls parses the JSON output to
    # extract description/question/source_url for synthesizing user messages
    # about images. Human-readable formatting would break this integration.

    @staticmethod
    def _load_image_bytes(url: str) -> tuple[bytes, str, str | None]:
        """Fetch image bytes from an HTTP URL or data URI."""
        if url.startswith("data:"):
            header, _, data = url.partition(",")
            if not data:
                raise ValueError("Invalid data URI: missing payload")

            metadata = header[5:]
            parts = metadata.split(";") if metadata else []
            content_type = parts[0] if parts and parts[0] else "image/jpeg"
            is_base64 = any(part.strip().lower() == "base64" for part in parts[1:])

            if is_base64:
                try:
                    image_bytes = base64.b64decode(data)
                except Exception as exc:  # noqa: BLE001
                    raise ValueError("Invalid base64 data in data URI") from exc
            else:
                image_bytes = unquote_to_bytes(data)

            return image_bytes, content_type, None

        # Handle Twilio URLs with authentication
        auth = None
        if "api.twilio.com" in url:
            sid = os.environ.get("TWILIO_ACCOUNT_SID")
            token = os.environ.get("TWILIO_AUTH_TOKEN")
            if sid and token:
                auth = (sid, token)

        response = requests.get(url, timeout=15, auth=auth)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "image/jpeg")
        if ";" in content_type:
            content_type = content_type.split(";", 1)[0]
        return response.content, content_type or "image/jpeg", url

    @staticmethod
    def _describe_image(base64_image: str, content_type: str, question: str | None = None) -> str | None:
        """Generate a textual description for an image using an LLM."""
        model_name = os.environ.get("OPEN_IMAGE_CAPTION_MODEL", "o4-mini")
        prompt = (
            "Describe this image in a concise way that highlights any relevant context, on-screen text, "
            "interface states, or numerical values. Focus on details that would help a tutor understand "
            "the situation.\n\n"
            "IMPORTANT: If the image resolution is too low to read text clearly or make out important details, "
            "say so explicitly rather than guessing. It's better to say 'The image resolution is too low to read "
            "the text' than to hallucinate content that may not be there."
        )

        sanitized_question = question.strip() if isinstance(question, str) and question.strip() else None
        user_content = [{"type": "input_text", "text": prompt}]
        if sanitized_question:
            user_content.append({"type": "input_text", "text": f"Question: {sanitized_question}"})
        data_uri = f"data:{content_type or 'image/jpeg'};base64,{base64_image}"
        user_content.append({"type": "input_image", "image_url": data_uri})

        try:
            response = oai.responses.create(
                model=model_name,
                input=[{"role": "user", "content": user_content}],
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("OpenAI image description failed: %s", exc)
            return None

        text = (response.output_text or "").strip()
        return text or None


@register_adapter
class SmsAdapter(Adapter):
    name = "sms"
    description = f"""Allows you to send and read SMS messages via Twilio.
    Having access to this means great responsibility. Do not spam people,
    do not send unsolicited messages, and be very careful about who you text
    and when. Don't repeat yourself.

    Also, make sure you don't text someone late at night in their timezone!
    That's rude (unless you have evidence that they're awake and available to chat, like
    them texting you first, or signing up).

    Match the tone of the messages for the person you're texting. If they're a parent,
    be more formal and professional. If they're a student, be more casual. Be very clear
    when talking with parents - avoid abbreviations and use full sentences.

    Your phone number is {os.environ.get("TWILIO_PHONE_NUMBER")}

    Write casual texts - don't greet the user every message.

    UTF-8 characters are supported, including emojis and special punctuation like curly quotes. Don't use emoji's unless the user does.
    """
    tools = [SmsListTool(), SmsSendTool(), OpenImageTool()]

    def detail(self, entity_runtime) -> str:
        unread_sms = entity_runtime.entity.has_unread_sms()
        if unread_sms:
            return f"You have unread SMS messages from {unread_sms}"
        else:
            return "You have no unread SMS messages"
