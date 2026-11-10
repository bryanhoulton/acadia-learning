"""
Linq V2 API Client

Client for interacting with the Linq messaging API.
See: https://apidocs.linqapp.com/v2/reference/chats
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

import requests

logger = logging.getLogger(__name__)

LINQ_API_BASE_URL = "https://api.linqapp.com/api/partner/v2"


@dataclass
class LinqChat:
    """Represents a Linq chat."""

    id: int
    display_name: str
    service: str
    group: bool
    message_count: int
    chat_handles: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> LinqChat:
        return cls(
            id=data["id"],
            display_name=data.get("display_name", ""),
            service=data.get("service", ""),
            group=data.get("group", False),
            message_count=data.get("message_count", 0),
            chat_handles=data.get("chat_handles", []),
        )


@dataclass
class LinqMessage:
    """Represents a Linq chat message."""

    id: int
    text: str
    sent_at: str
    delivered_at: str | None
    delivery_status: str
    is_read: bool
    is_from_me: bool
    attachments: list[dict[str, Any]]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> LinqMessage:
        return cls(
            id=data["id"],
            text=data.get("text", ""),
            sent_at=data.get("sent_at", ""),
            delivered_at=data.get("delivered_at"),
            delivery_status=data.get("delivery_status", ""),
            is_read=data.get("is_read", False),
            is_from_me=data.get("is_from_me", False),
            attachments=data.get("attachments", []),
        )


class LinqClient:
    """Client for Linq V2 API."""

    def __init__(self, token: str | None = None, phone_number: str | None = None):
        """Initialize Linq client.

        Args:
            token: Linq integration token. Defaults to LINQ_INTEGRATION_TOKEN env var.
            phone_number: Linq phone number. Defaults to LINQ_PHONE_NUMBER env var.
        """
        self.token = token or os.environ.get("LINQ_INTEGRATION_TOKEN")
        self.phone_number = phone_number or os.environ.get("LINQ_PHONE_NUMBER")

        if not self.token:
            raise ValueError("LINQ_INTEGRATION_TOKEN must be set")
        if not self.phone_number:
            raise ValueError("LINQ_PHONE_NUMBER must be set")

    def _headers(self) -> dict[str, str]:
        """Get request headers with authentication."""
        return {
            "X-LINQ-INTEGRATION-TOKEN": self.token,
            "Accept": "application/json",
        }

    def _request(
        self,
        method: str,
        endpoint: str,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        data: Any = None,
        files: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make a request to the Linq API.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint (without base URL)
            params: Query parameters
            json: JSON body
            data: Form data
            files: Files to upload

        Returns:
            Response JSON or empty dict for 204 responses
        """
        url = f"{LINQ_API_BASE_URL}{endpoint}"
        headers = self._headers()

        # Don't set Content-Type for multipart/form-data (let requests handle it)
        if json is not None:
            headers["Content-Type"] = "application/json"

        logger.debug(f"Linq API {method} {url} params={params}")

        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json,
            data=data,
            files=files,
            timeout=30,
        )

        # Handle no-content responses
        if response.status_code == 204:
            return {}

        # Handle errors
        if not response.ok:
            logger.error(f"Linq API error: {response.status_code} {response.text}")
            response.raise_for_status()

        # Handle empty response bodies (some endpoints return 200 with no body)
        if not response.content:
            return {}

        return response.json()

    # -------------------------------------------------------------------------
    # Chat endpoints
    # -------------------------------------------------------------------------

    def list_chats(self, page: int = 1, per_page: int = 25) -> list[LinqChat]:
        """List all chats for the configured phone number.

        Args:
            page: Page number (default 1)
            per_page: Items per page (default 25, max 100)

        Returns:
            List of LinqChat objects
        """
        # Phone number needs to be URL-encoded
        response = self._request(
            "GET",
            "/chats",
            params={
                "phone_number": self.phone_number,
                "page": page,
                "per_page": per_page,
            },
        )
        return [LinqChat.from_dict(chat) for chat in response.get("data", [])]

    def get_chat(self, chat_id: int) -> LinqChat:
        """Get details for a specific chat.

        Args:
            chat_id: The chat ID

        Returns:
            LinqChat object
        """
        response = self._request("GET", f"/chats/{chat_id}")
        return LinqChat.from_dict(response.get("data", {}))

    def find_chat(self, phone_numbers: list[str]) -> LinqChat | None:
        """Find a chat by participant phone numbers.

        Args:
            phone_numbers: List of participant phone numbers (E.164 format)

        Returns:
            LinqChat if found, None otherwise
        """
        response = self._request(
            "GET",
            "/chats/find",
            params={
                "phone_number": self.phone_number,
                "phone_numbers[]": phone_numbers,
            },
        )
        data = response.get("data", {})
        chat_data = data.get("chat")
        if chat_data:
            return LinqChat.from_dict(chat_data)
        return None

    def create_chat(
        self,
        phone_numbers: list[str],
        text: str,
        display_name: str | None = None,
        idempotency_key: str | None = None,
    ) -> tuple[LinqChat, LinqMessage]:
        """Create a new chat or return existing one with initial message.

        Args:
            phone_numbers: List of recipient phone numbers (E.164 format)
            text: Initial message text
            display_name: Optional display name for the chat
            idempotency_key: Optional idempotency key to prevent duplicate messages

        Returns:
            Tuple of (LinqChat, LinqMessage) for the created chat and message
        """
        body: dict[str, Any] = {
            "send_from": self.phone_number,
            "chat": {
                "phone_numbers": phone_numbers,
            },
            "message": {
                "text": text,
            },
        }

        if display_name:
            body["chat"]["display_name"] = display_name

        if idempotency_key:
            body["message"]["idempotency_key"] = idempotency_key

        response = self._request("POST", "/chats", json=body)
        data = response.get("data", {})

        chat = LinqChat.from_dict(data)
        message = LinqMessage.from_dict(data.get("chat_messages", {}))

        return chat, message

    def mark_as_read(self, chat_id: int) -> None:
        """Mark all messages in a chat as read.

        Args:
            chat_id: The chat ID
        """
        self._request("PUT", f"/chats/{chat_id}/mark_as_read")

    def start_typing(self, chat_id: int) -> None:
        """Start typing indicator in a chat.

        Args:
            chat_id: The chat ID
        """
        self._request("POST", f"/chats/{chat_id}/start_typing")

    def stop_typing(self, chat_id: int) -> None:
        """Stop typing indicator in a chat.

        Args:
            chat_id: The chat ID
        """
        self._request("DELETE", f"/chats/{chat_id}/stop_typing")

    def share_contact(self, chat_id: int) -> None:
        """Share contact card in a chat.

        Args:
            chat_id: The chat ID
        """
        self._request("POST", f"/chats/{chat_id}/share_contact")

    # -------------------------------------------------------------------------
    # Message endpoints
    # -------------------------------------------------------------------------

    def get_chat_messages(
        self,
        chat_id: int,
        page: int = 1,
        per_page: int = 25,
    ) -> list[LinqMessage]:
        """Get messages in a chat.

        Args:
            chat_id: The chat ID
            page: Page number (default 1)
            per_page: Items per page (default 25, max 100)

        Returns:
            List of LinqMessage objects
        """
        response = self._request(
            "GET",
            f"/chats/{chat_id}/chat_messages",
            params={"page": page, "per_page": per_page},
        )
        return [LinqMessage.from_dict(msg) for msg in response.get("data", [])]

    def send_message(
        self,
        chat_id: int,
        text: str,
        idempotency_key: str | None = None,
    ) -> LinqMessage:
        """Send a message to an existing chat.

        Args:
            chat_id: The chat ID
            text: Message text
            idempotency_key: Optional idempotency key

        Returns:
            LinqMessage for the sent message
        """
        # V2 API uses multipart/form-data for messages
        data = {"message[text]": text}
        if idempotency_key:
            data["message[idempotency_key]"] = idempotency_key

        response = self._request(
            "POST",
            f"/chats/{chat_id}/chat_messages",
            data=data,
        )
        return LinqMessage.from_dict(response.get("data", {}))

    # -------------------------------------------------------------------------
    # Reaction endpoints
    # -------------------------------------------------------------------------

    def add_reaction(self, message_id: int, reaction_type: str) -> None:
        """Add a reaction to a message.

        Args:
            message_id: The message ID
            reaction_type: Reaction type (love, like, dislike, laugh, emphasize, question)
        """
        self._request(
            "POST",
            f"/chat_messages/{message_id}/reactions",
            json={"type": reaction_type, "operation": "add"},
        )

    def remove_reaction(self, message_id: int, reaction_type: str) -> None:
        """Remove a reaction from a message.

        Args:
            message_id: The message ID
            reaction_type: Reaction type (love, like, dislike, laugh, emphasize, question)
        """
        self._request(
            "POST",
            f"/chat_messages/{message_id}/reactions",
            json={"type": reaction_type, "operation": "remove"},
        )


# Reaction types supported by Linq
LINQ_REACTION_TYPES = ["love", "like", "dislike", "laugh", "emphasize", "question"]


def format_e164(phone_number: str) -> str:
    """Format phone number to E.164 format.

    Args:
        phone_number: Phone number in any format

    Returns:
        Phone number in E.164 format (+14155838050)
    """
    # Remove all non-digit characters
    digits = "".join(c for c in phone_number if c.isdigit())

    # Add US country code if not present
    if len(digits) == 10:
        digits = "1" + digits
    elif len(digits) == 11 and digits[0] == "1":
        pass  # Already has country code
    else:
        # Assume it's already formatted or international
        pass

    return f"+{digits}"
