import logging

import posthog
from django.conf import settings
from posthog import Posthog

logger = logging.getLogger(__name__)

# Create a separate sync PostHog client for use in Celery tasks
# The main posthog module (used in views) is configured with async mode in apps.py
posthog_sync = Posthog(
    project_api_key=settings.POSTHOG_API_KEY,
    host=settings.POSTHOG_HOST,
    sync_mode=True,  # Sync mode for Celery tasks
    disabled=settings.DEBUG or settings.TESTING,
)

# Main async posthog instance for API views
posthog_async = posthog  # Uses the global posthog configured in apps.py with async mode


def track_inbound_sms(account_phone: str, profile_id: str, is_first_response: bool = False):
    """Track when an inbound SMS is received (called from API views - uses async)"""
    try:
        posthog_async.capture(
            distinct_id=account_phone,
            event="inbound_sms",
            properties={
                "account_phone": account_phone,
                "profile_id": profile_id,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to track inbound_sms event: {e}")


def track_first_sms_reply(account_phone: str, profile_id: str):
    """Track when a user sends their first message in response to an AI message.

    This event fires once per account when someone responds after we've sent them
    at least one message. This measures whether users engage with AI-initiated
    conversations.
    """
    try:
        posthog_async.capture(
            distinct_id=account_phone,
            event="first_sms_reply",
            properties={
                "account_phone": account_phone,
                "profile_id": profile_id,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to track first_sms_reply event: {e}")


def track_lesson_completed(account_phone: str):
    """Track when a lesson is completed (called from API views - uses async)"""
    try:
        posthog_async.capture(
            distinct_id=account_phone,
            event="lesson_completed",
            properties={
                "account_phone": account_phone,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to track lesson_completed event: {e}")


def track_cost(
    cost: float,
    category: str,
    account_phone: str | None = None,
    **extra_properties,
):
    """Track when a cost is incurred (called from Celery tasks - uses sync)

    Args:
        cost: Total cost in dollars
        category: Cost category (e.g., "llm", "sms")
        account_phone: Phone number for the account
        **extra_properties: Additional properties to track (e.g., token counts)
    """
    try:
        properties = {
            "cost": cost,
            "account_phone": account_phone,
            "category": category,
            **extra_properties,
        }
        posthog_sync.capture(
            distinct_id=account_phone if account_phone else "unknown",
            event="account_cost",
            properties=properties,
        )
    except Exception as e:
        logger.warning(f"Failed to track account_cost event: {e}")


def track_tutoring_session(
    account_phone: str,
    profile_id: str,
    profile_name: str,
    duration_seconds: float,
    session_started_at,
):
    """Track when a tutoring session completes with duration (called from Celery tasks - uses sync)"""
    try:
        posthog_sync.capture(
            distinct_id=account_phone,
            event="tutoring_session_completed",
            properties={
                "account_phone": account_phone,
                "profile_id": profile_id,
                "profile_name": profile_name,
                "duration_seconds": duration_seconds,
                "duration_minutes": round(duration_seconds / 60, 2),
                "session_date": session_started_at.isoformat() if session_started_at else None,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to track tutoring_session_completed event: {e}")
