"""SMS utility functions."""

import logging
import os

from django.conf import settings

logger = logging.getLogger(__name__)

NOTIFICATION_PHONE = os.environ.get("NOTIFICATION_PHONE", "")


def send_notification_sms(message: str) -> bool:
    """Send an SMS notification without storing it in the database.

    This is used for internal notifications (e.g., when human-controlled
    accounts receive inbound messages or finish sessions).

    Args:
        message: The notification message to send.

    Returns:
        True if sent successfully, False otherwise.
    """
    if settings.TESTING:
        logger.info(f"[TEST] Would send notification SMS: {message}")
        return True

    if not NOTIFICATION_PHONE:
        logger.warning("Set NOTIFICATION_PHONE to enable account notifications.")
        return False

    try:
        from api.settings import TWILIO_PHONE_NUMBER, twilio

        twilio.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=NOTIFICATION_PHONE,
        )
        logger.info(f"Sent notification SMS to {NOTIFICATION_PHONE}")
        return True
    except Exception as e:
        logger.error(f"Failed to send notification SMS: {e}")
        return False
