import logging
import random
import string
import time

import os
from posthog import Posthog
from pydantic import BaseModel

logger = logging.getLogger(__name__)
posthog_key = os.environ.get("POSTHOG_API_KEY")
posthog = Posthog(posthog_key, host="https://us.i.posthog.com") if posthog_key else None


def create_message_id() -> str:
    random_24_chars = "".join(random.choices(string.ascii_letters + string.digits, k=24))
    return f"msg_{random_24_chars}"


class ChatMessage(BaseModel):
    message: str
    sender: str
    timestamp: int

    def _time_ago(self):
        return time.time() - self.timestamp

    def _time_ago_str(self):
        seconds = self._time_ago()
        if seconds < 60:
            return f"{seconds:.2f} seconds ago"
        elif seconds < 3600:
            return f"{seconds // 60:.0f} minutes ago"
        else:
            return f"{seconds // 3600} hours ago"

    def __str__(self):
        return f"({self._time_ago_str()}) {self.sender}: {self.message}"


class AgentConfig(BaseModel):
    entity_id: int
    entity_api_key: str
    entity_memory: str
    user_name: str
    user_profile_id: str
    account_phone: str
    tutor_name: str
    timezone: str
    voice_id: str
    registration_source: str = "web"  # "web" | "mobile"
    session_model: str = "claude-haiku-4-5"  # Model to use for live sessions
    alt_tutor: bool = False  # If True, use alt-tutor prompt stack (fallback: default)


def track_cost(
    cost: float,
    category: str,
    account_phone: str | None = None,
    **extra_properties,
):
    """Track when a cost is incurred.

    Args:
        cost: Total cost in dollars
        category: Cost category (e.g., "live-session", "pedagogy-coach")
        account_phone: Phone number for the account
        **extra_properties: Additional properties to track (e.g., token counts)
    """
    if posthog is None:
        return

    properties = {
        "cost": cost,
        "account_phone": account_phone,
        "category": category,
        **extra_properties,
    }
    posthog.capture(
        distinct_id=account_phone if account_phone else "unknown",
        event="account_cost",
        properties=properties,
    )
