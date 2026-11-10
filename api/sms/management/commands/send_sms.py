import logging
import os

from django.core.management.base import BaseCommand

from api.settings import TWILIO_PHONE_NUMBER, twilio
from lms.accounts.models import UserProfile
from sms.models import SMSMessage
from sms.views import handle_incoming_linq_sms, handle_incoming_sms
from utils.linq import LinqClient, format_e164

logger = logging.getLogger("django")
logger.setLevel(logging.INFO)

LINQ_PHONE_NUMBER = os.environ.get("LINQ_PHONE_NUMBER", "")


def get_sms_provider_for_phone(phone_number: str) -> str:
    """Determine which SMS provider to use based on the entity's adapters.

    Returns 'linq' or 'twilio' based on the entity configuration.
    Linq is the default for new entities; Twilio is used for legacy entities.
    """
    # Find profile by phone number (try various formats)
    profile = UserProfile.objects.filter(phone=phone_number).first()

    if not profile and not phone_number.startswith("+1"):
        profile = UserProfile.objects.filter(phone=f"+1{phone_number}").first()

    if not profile and phone_number.startswith("+1"):
        profile = UserProfile.objects.filter(phone=phone_number[2:]).first()

    if not profile:
        # No profile found - default to Linq for new contacts
        logger.info(f"No profile found for {phone_number}, defaulting to Linq")
        return "linq"

    entity = profile.entity
    if not entity:
        logger.info(f"No entity for profile {profile.id}, defaulting to Linq")
        return "linq"

    # Check adapters - sms_linq takes precedence, then sms (Twilio)
    adapters = entity.adapters or []
    if "sms_linq" in adapters:
        return "linq"
    elif "sms" in adapters:
        return "twilio"
    else:
        # No SMS adapter configured - default to Linq
        return "linq"


def send_via_linq(to_number: str, body: str) -> dict:
    """Send SMS via Linq API."""
    client = LinqClient()
    formatted_phone = format_e164(to_number)

    # Check if we have an existing chat
    existing_chat = client.find_chat([formatted_phone])

    if existing_chat:
        message = client.send_message(existing_chat.id, body)
        linq_chat_id = existing_chat.id
        linq_message_id = message.id
    else:
        # Create new chat with initial message
        chat, message = client.create_chat([formatted_phone], body)
        linq_chat_id = chat.id
        linq_message_id = message.id

    # Store outgoing SMS
    SMSMessage.objects.create(
        from_number=LINQ_PHONE_NUMBER,
        to_number=formatted_phone,
        body=body.replace("\x00", ""),
        linq_chat_id=linq_chat_id,
        linq_message_id=linq_message_id,
        direction="outbound",
    )

    return {"status": "sent", "provider": "linq", "message_id": linq_message_id}


def send_via_twilio(to_number: str, body: str) -> dict:
    """Send SMS via Twilio API."""
    message = twilio.messages.create(
        body=body,
        from_=TWILIO_PHONE_NUMBER,
        to=to_number,
    )

    # Store outgoing SMS
    SMSMessage.objects.create(
        from_number=TWILIO_PHONE_NUMBER,
        to_number=to_number,
        body=body.replace("\x00", ""),
        twilio_sid=message.sid,
        direction="outbound",
    )

    return {"status": "sent", "provider": "twilio", "sid": message.sid}


class Command(BaseCommand):
    help = "Send an SMS message using Linq (default) or Twilio based on entity adapters"  # noqa: A003

    def add_arguments(self, parser):
        parser.add_argument("body", type=str, help="The content of the SMS message")
        parser.add_argument("--from", type=str, help="Simulate an incoming message from this phone number")
        parser.add_argument("--to", type=str, help="Send an outgoing message to this phone number")
        parser.add_argument(
            "--provider",
            type=str,
            choices=["linq", "twilio", "auto"],
            default="auto",
            help="Force a specific provider (default: auto-detect from entity adapters)",
        )
        parser.add_argument(
            "--message-id",
            type=str,
            help="Optional message ID (Twilio SID or Linq message ID)",
            default="manual-command",
        )

    def handle(self, *args, **options):
        from_number = options.get("from")
        to_number = options.get("to")
        body = options["body"]
        provider = options.get("provider", "auto")
        message_id = options.get("message_id", "manual-command")

        if from_number:
            # Simulate incoming message
            logger.info(f"Simulating incoming SMS from {from_number}")

            # Determine provider based on entity adapters
            if provider == "auto":
                provider = get_sms_provider_for_phone(from_number)

            if provider == "linq":
                handle_incoming_linq_sms(
                    from_number=from_number,
                    body=body,
                    linq_chat_id=None,
                    linq_message_id=None,
                )
            else:
                handle_incoming_sms(
                    from_number=from_number,
                    body=body,
                    twilio_sid=message_id,
                )

            logger.info(f"Incoming SMS processed via {provider}")

        elif to_number:
            # Send outgoing message
            logger.info(f"Sending SMS to {to_number}")

            # Determine provider based on entity adapters
            if provider == "auto":
                provider = get_sms_provider_for_phone(to_number)

            try:
                if provider == "linq":
                    result = send_via_linq(to_number, body)
                else:
                    result = send_via_twilio(to_number, body)

                logger.info(f"SMS sent successfully via {result['provider']}: {result}")
            except Exception as e:
                # If Linq fails and we were using auto, try Twilio as fallback
                if provider == "linq" and options.get("provider") == "auto":
                    logger.warning(f"Linq failed ({e}), falling back to Twilio")
                    try:
                        result = send_via_twilio(to_number, body)
                        logger.info(f"SMS sent via Twilio fallback: {result}")
                    except Exception as twilio_error:
                        logger.error(f"Both Linq and Twilio failed: {twilio_error}")
                        raise
                else:
                    raise

        else:
            logger.error("Either --from or --to must be specified")
            self.stderr.write(self.style.ERROR("Either --from or --to must be specified"))
