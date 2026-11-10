"""
Onboarding Agent for SMS

A fast, lightweight agent that handles the first few messages from new parents.
Uses claude-haiku-4-5 for quick response times with typing indicators.
Same rich context as the full Entity (system prompt, goals, SMS history, sessions, memory)
but no tools or agentic loop - just a single fast LLM call.

After ~5 message exchanges, hands off to the full EntityRuntime.

Supports debouncing to batch multiple rapid messages before responding.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

import anthropic
from celery import shared_task
from django.conf import settings
from django.db import models
from django.utils import timezone

from api.settings import anthropic_client
from lms.accounts.models import UserProfile
from lms.calendars.models import Goal
from sms.models import SMSAttachment, SMSMessage
from utils.debounce import debounce, debounced_wrap
from utils.linq import LinqClient
from utils.llms import track_llm_cost
from utils.slack import SlackChannel, send_slack_message
from utils.timezone import format_datetime_for_llm

from .constants import SYSTEM_PROMPT
from .services import DRMService

if TYPE_CHECKING:
    from .models import Entity

logger = logging.getLogger(__name__)

# Number of inbound messages before switching to full Entity
ONBOARDING_MESSAGE_THRESHOLD = 5

# Model for fast onboarding responses
ONBOARDING_MODEL = "claude-opus-4-5"

# Debounce delay in seconds - wait for additional messages before responding
ONBOARDING_DEBOUNCE_DELAY = 4


def should_use_onboarding_agent(entity: "Entity") -> bool:
    """
    Check if the account is in the onboarding phase.

    Returns True if:
    - Entity is not currently running or on a call
    - Account has fewer than ONBOARDING_MESSAGE_THRESHOLD inbound messages

    Args:
        entity: The Entity to check

    Returns:
        True if onboarding agent should handle the message
    """
    from .models import Entity as EntityModel

    entity.refresh_from_db()

    # Don't use onboarding agent if entity is already running or on a call
    if entity.status in (EntityModel.EntityStatus.RUNNING, EntityModel.EntityStatus.ON_CALL):
        logger.debug(f"Entity {entity.id} is {entity.status}, skipping onboarding agent")
        return False

    # Count inbound SMS messages for this account
    account_phone_numbers = list(UserProfile.objects.filter(account=entity.account).values_list("phone", flat=True))

    inbound_count = SMSMessage.objects.filter(
        from_number__in=account_phone_numbers,
        direction="inbound",
    ).count()

    should_use = inbound_count < ONBOARDING_MESSAGE_THRESHOLD

    if should_use:
        logger.info(f"Entity {entity.id} has {inbound_count} inbound messages, using onboarding agent")
    else:
        logger.debug(f"Entity {entity.id} has {inbound_count} inbound messages, using full entity")

    return should_use


def run_onboarding_agent(
    entity: "Entity",
    body: str,
    linq_chat_id: int | None,
    media_attachments: list[dict] | None = None,
) -> None:
    """
    Run the onboarding agent to respond to an SMS message.

    Uses claude-haiku-4-5 for fast response with:
    - Typing indicators while generating
    - Full system prompt
    - Goals/tasks from account
    - SMS history
    - Sessions (if any)
    - Memory context from DRM

    Args:
        entity: The Entity handling this conversation
        body: The message body from the user
        linq_chat_id: Linq chat ID for typing indicators and sending
        media_attachments: Optional list of attachments with 'url' and 'mime_type'
    """
    from .models import Session

    linq_client = None
    linq_phone = settings.LINQ_PHONE_NUMBER if hasattr(settings, "LINQ_PHONE_NUMBER") else None
    if not linq_phone:
        import os

        linq_phone = os.environ.get("LINQ_PHONE_NUMBER", "")

    try:
        # Get recipient phone number for Linq operations
        account_phone_numbers = list(UserProfile.objects.filter(account=entity.account).values_list("phone", flat=True))
        recipient_phone = next((p for p in account_phone_numbers if p), None)

        typing_started_at = None

        if not settings.TESTING:
            from utils.linq import format_e164

            linq_client = LinqClient()

            # If linq_chat_id not provided, try to find existing chat
            if not linq_chat_id and recipient_phone:
                formatted_phone = format_e164(recipient_phone)
                existing_chat = linq_client.find_chat([formatted_phone])
                if existing_chat:
                    linq_chat_id = existing_chat.id
                    logger.info(f"Found existing chat {linq_chat_id} for {recipient_phone}")
                else:
                    logger.info(f"No existing Linq chat found for {recipient_phone} - typing indicator unavailable")

            # Mark as read and start typing indicator if we have a chat
            if linq_chat_id:
                try:
                    linq_client.mark_as_read(linq_chat_id)
                    logger.info(f"Marked chat {linq_chat_id} as read")
                except Exception as e:
                    logger.warning(f"Failed to mark chat as read: {e}")

                try:
                    linq_client.start_typing(linq_chat_id)
                    typing_started_at = time.time()
                    logger.info(f"Started typing indicator for chat {linq_chat_id}")
                except Exception as e:
                    logger.warning(f"Failed to start typing indicator: {e}")

        # Build context for LLM
        system_prompt = SYSTEM_PROMPT(
            entity.name,
            registration_source=entity.account.registration_source,
        )

        # Get memory context from DRM
        drm = DRMService(entity.id)
        memory_context = drm.get_memory_context(max_tokens=10000, update=False)

        # Get account goals
        goals = Goal.objects.filter(
            user_profile__account=entity.account,
            status=Goal.GoalStatus.INCOMPLETE,
        ).select_related("user_profile")

        goals_text = ""
        if goals.exists():
            goals_list = []
            for goal in goals[:10]:  # Limit to 10 goals
                profile_name = goal.user_profile.name or "Unknown"
                goals_list.append(f"- {goal.title} (for {profile_name}): {goal.objective}")
            goals_text = "\n".join(goals_list)

        # Get SMS history for this account (account_phone_numbers defined earlier)
        sms_history = SMSMessage.objects.filter(
            models.Q(from_number__in=account_phone_numbers) | models.Q(to_number__in=account_phone_numbers)
        ).order_by("-created_at")[:30]  # Last 30 messages

        sms_text = ""
        if sms_history.exists():
            sms_lines = []
            for msg in reversed(sms_history):  # Chronological order
                direction = "→" if msg.direction == "outbound" else "←"
                time_str = msg.created_at.strftime("%Y-%m-%d %H:%M")
                sms_lines.append(f"[{time_str}] {direction} {msg.from_number}: {msg.body}")

                # Include attachment info
                if msg.has_attachments:
                    attachments = SMSAttachment.objects.filter(message=msg)
                    for att in attachments:
                        if att.is_audio() and att.transcription:
                            sms_lines.append(f'    🎤 Voice message: "{att.transcription}"')
                        else:
                            sms_lines.append(f"    📎 {att.content_type}: {att.media_url}")

            sms_text = "\n".join(sms_lines)

        # Get recent sessions (if any)
        profiles = UserProfile.objects.filter(account=entity.account)
        sessions = Session.objects.filter(
            profile__in=profiles,
            processed_at__isnull=False,
        ).order_by("-session_started_at")[:5]

        sessions_text = ""
        if sessions.exists():
            sessions_list = []
            for session in sessions:
                if session.name and session.description:
                    profile_name = session.profile.name if session.profile else "Unknown"
                    date_str = (
                        session.session_started_at.strftime("%Y-%m-%d")
                        if session.session_started_at
                        else "Unknown date"
                    )
                    sessions_list.append(f"- {date_str} with {profile_name}: {session.name} - {session.description}")
            if sessions_list:
                sessions_text = "\n".join(sessions_list)

        # Build current time context
        current_time = entity.current_time
        formatted_time = format_datetime_for_llm(current_time, entity.timezone)

        # Handle attachments in the current message
        attachment_context = ""
        if media_attachments:
            att_parts = []
            for att in media_attachments:
                mime_type = att.get("mime_type", "unknown")
                url = att.get("url", "")
                if mime_type.startswith("audio/"):
                    att_parts.append("The user sent a voice message (transcription may still be processing)")
                elif mime_type.startswith("image/"):
                    att_parts.append(f"The user sent an image: {url}")
                else:
                    att_parts.append(f"The user sent an attachment ({mime_type}): {url}")
            attachment_context = "\n".join(att_parts)

        # Build the full system context
        dynamic_context = f"""Current date and time: {formatted_time} (Timezone: {entity.timezone})

=== ACCOUNT GOALS ===
{goals_text if goals_text else "No active goals set yet."}

=== RECENT SMS HISTORY ===
{sms_text if sms_text else "No previous messages."}

=== RECENT TUTORING SESSIONS ===
{sessions_text if sessions_text else "No tutoring sessions yet."}

=== MEMORY CONTEXT ===
{memory_context if memory_context else "No memory context available."}

---

IMPORTANT: This is a new family in the onboarding phase. They signed up through our website at acadialearning.org. Your job is to accomplish your account goals.

Be conversational and human. Match their texting style. Don't overwhelm them with information, only one question at a time.
Respond briefly when appropriate - you're texting, not writing an essay.

OUTPUT FORMAT: You can send multiple text messages by separating them with "---" on its own line.
This makes your responses feel more natural, like a human texting. For example:
Hey! Thanks for reaching out 😊
---
I'd love to help get your child started with tutoring.
---
What subject are they working on right now?

Keep each message short (1-2 sentences max). 1-3 messages is usually enough. Never ask more than 1 question at a time.

Always have a clear next action for them to do. Don't ask questions that they might not know off the top of their head. You don't
want the user to think too hard.

Don't include your thinking in the response. Everything you say will be sent directly to the user.
"""

        # Build the user message
        user_content = body
        if attachment_context:
            user_content = f"{body}\n\n[{attachment_context}]" if body else attachment_context

        # Make the LLM call
        response = anthropic_client.messages.create(
            model=ONBOARDING_MODEL,
            max_tokens=500,  # Keep responses concise
            system=[
                {"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": dynamic_context},
            ],
            messages=[
                {"role": "user", "content": user_content},
            ],
        )

        # Track cost
        if response.usage:
            track_llm_cost(
                usage=response.usage,
                model=ONBOARDING_MODEL,
                account_phone=entity.account.account_phone,
                category="onboarding",
                provider="claude",
            )

        # Extract response text
        response_text = ""
        for block in response.content:
            if hasattr(block, "text"):
                response_text += block.text

        if not response_text:
            logger.error(f"Onboarding agent returned empty response for entity {entity.id}")
            return

        # Parse into multiple messages (split by --- on its own line)
        raw_messages = response_text.split("\n---\n")
        messages = [msg.strip() for msg in raw_messages if msg.strip()]

        if not messages:
            logger.error(f"Onboarding agent returned no valid messages for entity {entity.id}")
            return

        logger.info(f"Onboarding agent response for entity {entity.id}: {len(messages)} message(s)")

        # Send the response(s)
        if linq_client and recipient_phone:
            from utils.linq import format_e164

            formatted_phone = format_e164(recipient_phone)
            TYPING_DURATION = 3.0

            for i, msg_text in enumerate(messages):
                # For first message, account for time already spent typing
                if i == 0 and typing_started_at:
                    elapsed = time.time() - typing_started_at
                    if elapsed < TYPING_DURATION:
                        remaining = TYPING_DURATION - elapsed
                        logger.debug(f"Waiting {remaining:.1f}s to meet minimum typing duration")
                        time.sleep(remaining)
                else:
                    # For subsequent messages, start typing and wait
                    if linq_chat_id:
                        try:
                            linq_client.start_typing(linq_chat_id)
                        except Exception as e:
                            logger.warning(f"Failed to start typing indicator: {e}")
                    time.sleep(TYPING_DURATION)

                # Stop typing before sending
                if linq_chat_id:
                    try:
                        linq_client.stop_typing(linq_chat_id)
                    except Exception as e:
                        logger.warning(f"Failed to stop typing indicator: {e}")

                # Send the message - create chat if needed (only for first message)
                if linq_chat_id:
                    message = linq_client.send_message(linq_chat_id, msg_text)
                    linq_message_id = message.id
                else:
                    # Create new chat with initial message
                    chat, message = linq_client.create_chat([formatted_phone], msg_text)
                    linq_chat_id = chat.id
                    linq_message_id = message.id
                    logger.info(f"Created new chat {linq_chat_id} for {recipient_phone}")

                # Store the outgoing message
                SMSMessage.objects.create(
                    from_number=linq_phone,
                    to_number=recipient_phone,
                    body=msg_text.replace("\x00", ""),
                    linq_chat_id=linq_chat_id,
                    linq_message_id=linq_message_id,
                    direction="outbound",
                )

                logger.info(f"Onboarding agent sent message {i + 1}/{len(messages)} to chat {linq_chat_id}")

            # Send single Slack notification with all messages
            combined_for_slack = " | ".join(messages)
            send_slack_message(
                SlackChannel.SMS_MESSAGES,
                f"[Linq/Onboarding] Sending {len(messages)} SMS to {recipient_phone}: {combined_for_slack}",
            )

        elif settings.TESTING:
            # In testing, just log the response
            for i, msg_text in enumerate(messages):
                logger.info(f"[TEST] Onboarding agent would send ({i + 1}/{len(messages)}): {msg_text}")

    except anthropic.APIError as e:
        logger.exception(f"Anthropic API error in onboarding agent: {e}")
        # Stop typing indicator on error
        if linq_client and linq_chat_id:
            try:
                linq_client.stop_typing(linq_chat_id)
            except Exception:
                pass
        raise

    except Exception as e:
        logger.exception(f"Error in onboarding agent: {e}")
        # Stop typing indicator on error
        if linq_client and linq_chat_id:
            try:
                linq_client.stop_typing(linq_chat_id)
            except Exception:
                pass
        raise


# =============================================================================
# Debounced Task for Onboarding Agent
# =============================================================================


@shared_task(name="entities.run_onboarding_agent_task")
@debounced_wrap
def _run_onboarding_agent_task(entity_id: int, linq_chat_id: int | None = None):
    """
    Debounced Celery task that runs the onboarding agent.

    Instead of receiving the message body, this task looks up recent unread
    inbound messages from the database. This allows it to process all messages
    that arrived during the debounce window.
    """
    from datetime import timedelta

    from .models import Entity

    try:
        entity = Entity.objects.get(pk=entity_id)
    except Entity.DoesNotExist:
        logger.warning(f"Entity {entity_id} not found for debounced onboarding agent")
        return

    # Check if we should still use onboarding agent
    if not should_use_onboarding_agent(entity):
        logger.info(f"Entity {entity_id} no longer eligible for onboarding agent, skipping")
        return

    # Get account phone numbers
    account_phone_numbers = list(UserProfile.objects.filter(account=entity.account).values_list("phone", flat=True))

    # Find recent unread inbound messages (within last 30 seconds to catch the debounce window)
    cutoff_time = timezone.now() - timedelta(seconds=30)
    recent_messages = SMSMessage.objects.filter(
        from_number__in=account_phone_numbers,
        direction="inbound",
        created_at__gte=cutoff_time,
    ).order_by("created_at")

    if not recent_messages.exists():
        logger.warning(f"No recent messages found for entity {entity_id} in debounced task")
        return

    # Combine message bodies
    message_bodies = []
    media_attachments = []

    for msg in recent_messages:
        if msg.body:
            message_bodies.append(msg.body)

        # Get attachments for this message
        attachments = SMSAttachment.objects.filter(message=msg)
        for att in attachments:
            media_attachments.append(
                {
                    "url": att.media_url,
                    "mime_type": att.content_type,
                }
            )

    # Combine bodies into single message
    combined_body = "\n".join(message_bodies) if message_bodies else ""

    if not combined_body and not media_attachments:
        logger.warning(f"No content found in recent messages for entity {entity_id}")
        return

    logger.info(f"Debounced onboarding agent processing {len(list(recent_messages))} messages for entity {entity_id}")

    # Run the actual onboarding agent
    run_onboarding_agent(
        entity=entity,
        body=combined_body,
        linq_chat_id=linq_chat_id,
        media_attachments=media_attachments if media_attachments else None,
    )


# Create the debounced scheduling function
# When called, this increments a counter and schedules _run_onboarding_agent_task
# with a delay. Only the last scheduled task will actually run.
schedule_onboarding_agent = debounce(
    keys=["entity_id"],
    delay=ONBOARDING_DEBOUNCE_DELAY,
)(_run_onboarding_agent_task)
