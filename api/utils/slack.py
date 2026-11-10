import os
import logging
from enum import Enum

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class SlackChannel(str, Enum):
    """Enum for Slack channels used in the application."""

    SMS_MESSAGES = "SLACK_WEBHOOK_SMS_MESSAGES"  # For SMS messages
    CALL_RECORDINGS = "SLACK_WEBHOOK_CALL_RECORDINGS"  # For call recordings
    ENTITY_ISSUES = "SLACK_WEBHOOK_ENTITY_ISSUES"  # For entity issues
    EMAIL_NOTIFICATIONS = "SLACK_WEBHOOK_EMAIL_NOTIFICATIONS"  # For email notifications
    SIGNUPS = "SLACK_WEBHOOK_SIGNUPS"  # For signups
    BLOCK_REQUESTS = "SLACK_WEBHOOK_BLOCK_REQUESTS"  # For block requests
    DAILY_REPORTS = "SLACK_WEBHOOK_CALL_RECORDINGS"  # For daily session reports (using call recordings channel for now)


def send_slack_message(channel: SlackChannel, message: str) -> None:
    """
    Send a message to a Slack channel.

    Args:
        channel: The SlackChannel enum value specifying which channel to send to
        message: The message text to send

    Note:
        This function will not send messages during testing.
    """
    if settings.TESTING or settings.DEBUG:
        return

    try:
        response = requests.post(
            os.environ[channel.value],
            json={"text": message},
            headers={"Content-type": "application/json"},
        )
        if response.status_code != 200:
            logger.error(f"Error sending Slack message: {response.text}")
    except Exception as e:
        logger.error(f"Error sending Slack message: {e}")
