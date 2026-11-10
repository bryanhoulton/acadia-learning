import json
import logging
import os
from urllib.parse import urlparse, urlunparse

import requests
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import permission_classes
from rest_framework.permissions import AllowAny
from twilio.twiml.messaging_response import MessagingResponse

from api.settings import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
from entities.onboarding_agent import schedule_onboarding_agent, should_use_onboarding_agent
from entities.tasks import possibly_run_entity
from lms.accounts.models import Account, UserProfile
from utils.posthog import track_first_sms_reply, track_inbound_sms
from utils.slack import SlackChannel, send_slack_message

from .models import SMSAttachment, SMSMessage
from .tasks import is_transcribable_audio, transcribe_voice_message
from .utils import send_notification_sms

logger = logging.getLogger(__name__)

LINQ_PHONE_NUMBER = os.environ.get("LINQ_PHONE_NUMBER", "")


def get_authorized_twilio_url(url: str) -> str:
    """Convert a Twilio media URL to include Basic Auth credentials.

    This allows the URL to be accessed by external services like Slack.
    """
    if "api.twilio.com" not in url:
        return url

    parsed = urlparse(url)
    # Embed credentials in the URL: https://sid:token@api.twilio.com/...
    authorized_netloc = f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}@{parsed.netloc}"
    authorized_url = urlunparse(parsed._replace(netloc=authorized_netloc))
    return authorized_url


def find_or_assign_profile(phone_number: str) -> UserProfile | None:
    """
    Find a UserProfile by phone number, trying various format variations.
    If no profile is found, check if the phone belongs to an account and assign it
    to a parent profile without a phone number.

    Args:
        phone_number: The phone number to search for

    Returns:
        UserProfile if found or successfully assigned, None otherwise
    """
    # Try to find existing profile with various phone number formats
    profile = UserProfile.objects.filter(phone=phone_number).first()

    # Check with +1 prefix
    if not profile and not phone_number.startswith("+1"):
        profile = UserProfile.objects.filter(phone=f"+1{phone_number}").first()

    # Check without +1 prefix
    if not profile and phone_number.startswith("+1"):
        profile = UserProfile.objects.filter(phone=phone_number[2:]).first()

    # If no profile found, check if phone belongs to an account
    if not profile:
        account = None
        phone_to_assign = None

        # Try original format
        account = Account.objects.filter(account_phone=phone_number).first()
        if account:
            phone_to_assign = phone_number

        # Try with +1 prefix
        if not account and not phone_number.startswith("+1"):
            account = Account.objects.filter(account_phone=f"+1{phone_number}").first()
            if account:
                phone_to_assign = f"+1{phone_number}"

        # Try without +1 prefix
        if not account and phone_number.startswith("+1"):
            account = Account.objects.filter(account_phone=phone_number[2:]).first()
            if account:
                phone_to_assign = phone_number[2:]

        if account and phone_to_assign:
            # Find a parent profile on this account without a phone number
            parent_profile = UserProfile.objects.filter(
                account=account, profile_type=UserProfile.ProfileType.PARENT, phone__isnull=True
            ).first()

            if not parent_profile:
                # Also check for empty string phone
                parent_profile = UserProfile.objects.filter(
                    account=account, profile_type=UserProfile.ProfileType.PARENT, phone=""
                ).first()

            if parent_profile:
                # Assign the phone number to this parent profile
                parent_profile.phone = phone_to_assign
                parent_profile.save()
                logger.info(
                    f"Assigned phone {phone_to_assign} to parent profile {parent_profile.id} on account {account.id}"
                )
                send_slack_message(
                    SlackChannel.SMS_MESSAGES,
                    f"Auto-assigned phone {phone_to_assign} to parent profile "
                    f"{parent_profile.name or parent_profile.id} on account {account.account_phone}",
                )
                profile = parent_profile
            else:
                logger.info(
                    f"Account {account.id} found with phone {phone_to_assign}, "
                    f"but no parent profile without a phone number"
                )
                send_slack_message(
                    SlackChannel.SMS_MESSAGES,
                    f"Account {account.account_phone} found for {phone_to_assign}, "
                    f"but no parent profile available to assign",
                )

    return profile


def handle_incoming_sms(from_number, body, twilio_sid, media_urls=None):
    # Find the contact
    profile = UserProfile.objects.filter(phone=from_number).first()

    if profile:
        entity = profile.entity

        # Store the message
        message = SMSMessage.objects.create(
            from_number=from_number,
            to_number=TWILIO_PHONE_NUMBER,
            body=body,
            twilio_sid=twilio_sid,
            direction="inbound",
            has_attachments=bool(media_urls),
        )
        # Store attachments if any
        attachments: list[SMSAttachment] = []
        if media_urls:
            for media_url in media_urls:
                # Twilio URLs require Basic Auth
                auth = (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if "api.twilio.com" in media_url else None
                content_type = requests.head(media_url, auth=auth).headers.get(
                    "content-type", "application/octet-stream"
                )
                attachment = SMSAttachment.objects.create(
                    message=message, media_url=media_url, content_type=content_type
                )
                attachments.append(attachment)

                # Trigger transcription for audio attachments (voice messages)
                if is_transcribable_audio(content_type):
                    logger.info(f"Queuing voice message transcription for attachment {attachment.id}")
                    transcribe_voice_message.delay(str(attachment.id))

        if entity:
            # Send notification if this is a human-controlled account
            if entity.account.is_human_controlled:
                notification_msg = f"[Human Account] New SMS from {profile.name or profile.phone}: {body[:100]}"
                send_notification_sms(notification_msg)

            logger.info(f"Waking entity for contact: {entity.id}")

            possibly_run_entity(entity.id, wakeup=True)
        else:
            send_slack_message(
                SlackChannel.SMS_MESSAGES,
                f"No entity found for profile: {profile.id}",
            )
            return

        track_inbound_sms(entity.account.account_phone, str(profile.id))

        # Track first reply to AI message.
        # This fires once per account when someone responds after we've sent them at least one message.
        first_outbound = (
            SMSMessage.objects.filter(
                to_number=from_number,
                direction="outbound",
            )
            .order_by("created_at")
            .first()
        )

        if first_outbound:
            # We've sent them at least one message. Check if this is their first reply after that.
            has_previous_reply = (
                SMSMessage.objects.filter(
                    from_number=from_number,
                    direction="inbound",
                    created_at__gt=first_outbound.created_at,
                )
                .exclude(
                    id=message.id  # Exclude the message we just created
                )
                .exists()
            )

            if not has_previous_reply:
                track_first_sms_reply(entity.account.account_phone, str(profile.id))

        authorized_attachment_urls = [get_authorized_twilio_url(a.media_url) for a in attachments]
        message_text = f"New SMS from {profile}: {body}"
        if authorized_attachment_urls:
            message_text += f"\n\nAttachments: {authorized_attachment_urls}"
        send_slack_message(
            SlackChannel.SMS_MESSAGES,
            message_text,
        )


@csrf_exempt
@require_http_methods(["POST"])
@permission_classes([AllowAny])
def twilio_webhook(request):
    """Handle incoming SMS/MMS from Twilio webhook"""
    from_number = request.POST.get("From")
    body = request.POST.get("Body", "")
    twilio_sid = request.POST.get("MessageSid")

    # Try to find or assign a profile for this phone number
    profile = find_or_assign_profile(from_number)

    if not profile:
        # Unknown number - don't create accounts from inbound texts.
        # Users must sign up through acadialearning.org first.
        logger.info(f"[Twilio] Ignoring message from unknown number {from_number} - must sign up via website")
        send_slack_message(
            SlackChannel.SMS_MESSAGES,
            f"[Twilio] Ignored SMS from unregistered number {from_number}: {body[:100]}",
        )
        resp = MessagingResponse()
        return HttpResponse(str(resp), content_type="text/xml")

    # Handle MMS attachments
    media_urls = []
    num_media = int(request.POST.get("NumMedia", 0))
    if num_media > 0:
        for i in range(num_media):
            media_url = request.POST.get(f"MediaUrl{i}")
            if media_url:
                media_urls.append(media_url)

    handle_incoming_sms(from_number, body, twilio_sid, media_urls)

    # Return empty TwiML response
    resp = MessagingResponse()
    return HttpResponse(str(resp), content_type="text/xml")


def handle_incoming_linq_sms(
    from_number: str,
    body: str,
    linq_chat_id: int | None,
    linq_message_id: int | None,
    media_attachments: list[dict] | None = None,
) -> bool:
    """Handle an incoming SMS from Linq webhook.

    Similar to handle_incoming_sms but stores Linq-specific fields.

    Args:
        media_attachments: List of dicts with 'url' and 'mime_type' keys
    """
    # Find the contact
    profile = UserProfile.objects.filter(phone=from_number).first()
    if not profile:
        return False

    entity = profile.entity
    if not entity:
        # Profile exists but no entity - initialize one (e.g., mobile signup)
        logger.info(f"[Linq] No entity found for profile {profile.id}, initializing one")
        account = profile.account
        entity = account.initialize_entity()

        if entity:
            # Use linq adapter instead of twilio
            if "sms" in entity.adapters:
                entity.adapters.remove("sms")
            if "sms_linq" not in entity.adapters:
                entity.adapters.append("sms_linq")
            entity.save(update_fields=["adapters"])
            logger.info(f"[Linq] Created entity {entity.id} for profile {profile.id}")
        else:
            send_slack_message(
                SlackChannel.SMS_MESSAGES,
                f"[Linq] Failed to create entity for profile: {profile.id}",
            )
            return False

    # Gate inbound Linq webhooks: do not persist messages for entities without sms_linq enabled.
    if "sms_linq" not in entity.adapters:
        logger.info(f"[Linq] Entity {entity.id} doesn't have sms_linq adapter, ignoring message from {from_number}")
        return False

    # Check if this is the first inbound message from this number
    is_first_response = not SMSMessage.objects.filter(from_number=from_number, direction="inbound").exists()

    # Store the message with Linq fields
    message = SMSMessage.objects.create(
        from_number=from_number,
        to_number=LINQ_PHONE_NUMBER,
        body=body,
        linq_chat_id=linq_chat_id,
        linq_message_id=linq_message_id,
        direction="inbound",
        has_attachments=bool(media_attachments),
    )

    # Store attachments if any
    attachments: list[SMSAttachment] = []
    if media_attachments:
        for att in media_attachments:
            media_url = att["url"]
            # Use mime_type from payload - Linq HEAD requests return incorrect content-type
            content_type = att.get("mime_type", "application/octet-stream")
            attachment = SMSAttachment.objects.create(message=message, media_url=media_url, content_type=content_type)
            attachments.append(attachment)

            # Trigger transcription for audio attachments (voice messages)
            if is_transcribable_audio(content_type):
                logger.info(f"[Linq] Queuing voice message transcription for attachment {attachment.id}")
                transcribe_voice_message.delay(str(attachment.id))

    # Send notification if this is a human-controlled account
    if entity.account.is_human_controlled:
        notification_msg = f"[Human Account] New SMS from {profile.name or profile.phone}: {body[:100]}"
        send_notification_sms(notification_msg)

    # Check if we should use the fast onboarding agent
    if should_use_onboarding_agent(entity):
        logger.info(f"[Linq] Scheduling debounced onboarding agent for entity: {entity.id}")
        # Schedule debounced task - it will read messages from DB when it runs
        schedule_onboarding_agent(entity_id=entity.id, linq_chat_id=linq_chat_id)
    else:
        logger.info(f"[Linq] Waking entity for contact: {entity.id}")
        possibly_run_entity(entity.id, wakeup=True)

    track_inbound_sms(entity.account.account_phone, str(profile.id), is_first_response=is_first_response)

    # Track first reply to AI message.
    # This fires once per account when someone responds after we've sent them at least one message.
    first_outbound = (
        SMSMessage.objects.filter(
            to_number=from_number,
            direction="outbound",
        )
        .order_by("created_at")
        .first()
    )

    if first_outbound:
        # We've sent them at least one message. Check if this is their first reply after that.
        has_previous_reply = (
            SMSMessage.objects.filter(
                from_number=from_number,
                direction="inbound",
                created_at__gt=first_outbound.created_at,
            )
            .exclude(
                id=message.id  # Exclude the message we just created
            )
            .exists()
        )

        if not has_previous_reply:
            track_first_sms_reply(entity.account.account_phone, str(profile.id))

    message_text = f"[Linq] New SMS from {profile}: {body}"
    if media_attachments:
        attachment_urls = [att["url"] for att in media_attachments]
        message_text += f"\n\nAttachments: {attachment_urls}"
    send_slack_message(SlackChannel.SMS_MESSAGES, message_text)
    return True


@csrf_exempt
@require_http_methods(["POST"])
@permission_classes([AllowAny])
def linq_webhook(request):
    """Handle incoming SMS/MMS from Linq webhook.

    Linq V2 Webhook payload format (from https://apidocs.linqapp.com/v2/reference/webhook-events-documentation):
    {
        "api_version": "v2",
        "created_at": "2025-07-10T15:30:00-06:00",
        "event_type": "message.received",
        "event_id": "wh_evt_123abc",
        "data": {
            "id": "67890",
            "chat_id": "11111",
            "text": "Hello, how are you?",
            "is_from_me": false,
            "sent_at": "2025-07-10 15:30:00 -0600",
            "chat_handle": {
                "id": "22222",
                "identifier": "+15551234567"
            },
            "chat_handles": [...],
            "attachments": [{"url": "...", "mime_type": "..."}]
        }
    }
    """
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError:
        logger.warning("[Linq] Invalid JSON in webhook payload")
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    event_type = payload.get("event_type", "")
    event_id = payload.get("event_id", "")
    logger.info(f"[Linq] Received webhook: {event_type} (event_id: {event_id})")

    # Handle message.received events (incoming messages)
    if event_type == "message.received":
        data = payload.get("data", {})

        # Skip messages from ourselves (shouldn't happen for message.received but check anyway)
        if data.get("is_from_me", False):
            logger.debug("[Linq] Skipping outbound message webhook")
            return JsonResponse({"status": "skipped", "reason": "outbound"})

        # Extract message details
        chat_id = data.get("chat_id")
        message_id = data.get("id")
        text = data.get("text", "")

        # Get sender phone number - Linq sends it in from_phone field
        from_number = data.get("from_phone", "")

        if not from_number:
            # Fallback: try chat_handle.identifier
            chat_handle = data.get("chat_handle", {})
            from_number = chat_handle.get("identifier", "")

        if not from_number:
            # Fallback: try to find non-me handle in chat_handles
            for handle in data.get("chat_handles", []):
                if not handle.get("is_me", False):
                    from_number = handle.get("identifier", "")
                    break

        if not from_number:
            logger.warning("[Linq] No sender phone number in webhook")
            return JsonResponse({"error": "No sender phone number"}, status=400)

        # Extract attachment URLs with their mime types
        media_attachments = []
        for attachment in data.get("attachments", []):
            url = attachment.get("url")
            if url:
                media_attachments.append(
                    {
                        "url": url,
                        "mime_type": attachment.get("mime_type", "application/octet-stream"),
                    }
                )

        # Try to find existing profile for this phone number
        profile = find_or_assign_profile(from_number)

        if not profile:
            # Unknown number - ignore it, don't create accounts from inbound texts
            logger.info(f"[Linq] Ignoring message from unknown number {from_number}")
            return JsonResponse({"status": "ignored", "reason": "unknown number"})

        # Convert IDs to int if they're strings
        try:
            chat_id_int = int(chat_id) if chat_id else None
            message_id_int = int(message_id) if message_id else None
        except (ValueError, TypeError):
            chat_id_int = None
            message_id_int = None

        processed = handle_incoming_linq_sms(from_number, text, chat_id_int, message_id_int, media_attachments or None)
        if not processed:
            return JsonResponse({"status": "ignored", "reason": "adapter not enabled", "event_id": event_id})

        return JsonResponse({"status": "ok", "event_id": event_id})

    # Handle message.sent events (our outbound messages confirmed)
    elif event_type == "message.sent":
        logger.debug(f"[Linq] Message sent confirmed: {event_id}")
        return JsonResponse({"status": "ok", "event": event_type})

    # Handle reaction events
    elif event_type in ("reaction.sent", "reaction.received"):
        logger.info(f"[Linq] Reaction event: {event_type}")
        return JsonResponse({"status": "ok", "event": event_type})

    # Log other event types for debugging
    logger.info(f"[Linq] Unhandled event type: {event_type}")
    return JsonResponse({"status": "ok", "event": event_type})
