"""
Facebook Conversions API utility for sending server-side events.

Usage:
    from utils.facebook import send_fb_event

    send_fb_event(
        event_name="Lead",
        user_data={
            "email": "user@example.com",
            "phone": "+15551234567",
            "ip": request.META.get("REMOTE_ADDR"),
            "user_agent": request.META.get("HTTP_USER_AGENT"),
            "fbc": request.data.get("fbc"),  # FB click ID cookie
            "fbp": request.data.get("fbp"),  # FB browser ID cookie
        },
        custom_data={"content_name": "Student Profile Created"},
    )
"""

import hashlib
import logging
import time
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _hash_pii(value: str | None) -> str | None:
    """Hash PII data as required by Facebook Conversions API."""
    if not value:
        return None
    # Normalize: lowercase, strip whitespace
    normalized = value.lower().strip()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _normalize_phone(phone: str | None) -> str | None:
    """Normalize phone number for hashing (digits only, no leading zeros)."""
    if not phone:
        return None
    # Remove all non-digit characters
    digits = "".join(c for c in phone if c.isdigit())
    # Remove leading zeros (but keep at least one digit)
    digits = digits.lstrip("0") or "0"
    return digits


def send_fb_event(
    event_name: str,
    user_data: dict[str, Any],
    custom_data: dict[str, Any] | None = None,
    event_id: str | None = None,
) -> dict[str, Any] | None:
    """
    Send an event to Facebook Conversions API.

    Args:
        event_name: Facebook standard event name (e.g., "Lead", "Purchase", "CompleteRegistration")
        user_data: User identification data. Can include:
            - email: User's email address (will be hashed)
            - phone: User's phone number (will be hashed)
            - ip: Client IP address
            - user_agent: Client user agent
            - fbc: Facebook click ID cookie (_fbc)
            - fbp: Facebook browser ID cookie (_fbp)
            - external_id: Your internal user ID (will be hashed)
        custom_data: Additional event data (e.g., value, currency, content_name)
        event_id: Optional event ID for deduplication with browser pixel

    Returns:
        API response dict or None if the call failed or is disabled.
    """
    pixel_id = getattr(settings, "FB_PIXEL_ID", None)
    access_token = getattr(settings, "FB_CONVERSIONS_API_TOKEN", None)

    if not pixel_id or not access_token:
        logger.debug("Facebook Conversions API not configured, skipping event")
        return None

    # Don't send events during testing
    if getattr(settings, "TESTING", False):
        logger.debug("Skipping FB event in test mode")
        return None

    try:
        # Build user_data payload with hashed PII
        fb_user_data = {}

        if user_data.get("email"):
            fb_user_data["em"] = _hash_pii(user_data["email"])

        if user_data.get("phone"):
            normalized_phone = _normalize_phone(user_data["phone"])
            fb_user_data["ph"] = _hash_pii(normalized_phone)

        if user_data.get("ip"):
            fb_user_data["client_ip_address"] = user_data["ip"]

        if user_data.get("user_agent"):
            fb_user_data["client_user_agent"] = user_data["user_agent"]

        if user_data.get("fbc"):
            fb_user_data["fbc"] = user_data["fbc"]

        if user_data.get("fbp"):
            fb_user_data["fbp"] = user_data["fbp"]

        if user_data.get("external_id"):
            fb_user_data["external_id"] = _hash_pii(str(user_data["external_id"]))

        # Build event payload
        event_payload = {
            "event_name": event_name,
            "event_time": int(time.time()),
            "action_source": "website",
            "user_data": fb_user_data,
        }

        if event_id:
            event_payload["event_id"] = event_id

        if custom_data:
            event_payload["custom_data"] = custom_data

        payload = {
            "data": [event_payload],
            "access_token": access_token,
        }

        response = requests.post(
            f"https://graph.facebook.com/v21.0/{pixel_id}/events",
            json=payload,
            timeout=10,
        )

        result = response.json()

        if response.status_code != 200:
            logger.warning(f"Facebook Conversions API error: {result}")

        return result

    except Exception as e:
        logger.exception(f"Failed to send Facebook event '{event_name}': {e}")
        return None
