import logging
import os
from datetime import datetime
from typing import Any

import requests
from anthropic.types.beta import BetaMessageParam
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


class APIService:
    """Service class to handle all API interactions for the agent."""

    def __init__(self, entity_id: int, api_key: str, user_profile_id: str):
        """
        Initialize API service with entity authentication.

        Args:
            entity_id: The entity ID for this agent
            api_key: The entity's API key for authentication
        """
        api_url = os.environ.get("API_URL")
        if not api_url:
            raise ValueError("API_URL environment variable is required")
        self.api_url = api_url.rstrip("/")

        # Store authentication credentials
        self.entity_id = entity_id
        self.api_key = api_key
        self.user_profile_id = user_profile_id

    def _get_auth_headers(self) -> dict[str, str]:
        """Generate authentication headers for API requests."""
        return {
            "X-Entity-API-Key": self.api_key,
            "Content-Type": "application/json",
        }

    def update_call_state(self, entity_id: int, on_call: bool) -> dict[str, Any] | None:
        """Update the entity's call state."""
        try:
            if on_call:
                endpoint = f"{self.api_url}/api/entities/join-call/"
            else:
                endpoint = f"{self.api_url}/api/entities/leave-call/"

            response = requests.post(
                endpoint,
                json={
                    "entity_id": entity_id,
                },
                headers=self._get_auth_headers(),
            )
            response.raise_for_status()
            logger.debug(f"Call state updated: {response.status_code}")
            return response.json()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                logger.error("Authentication failed - invalid entity API key")
            elif e.response.status_code == 403:
                logger.error("Access denied - insufficient permissions")
            else:
                logger.error(f"HTTP error updating call state for entity {entity_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error updating call state for entity {entity_id}: {e}")
            return None

    def sync_context(self, entity_id: int, new_messages: list[BetaMessageParam]) -> dict[str, Any] | None:
        """Sync context by sending only new messages since last sync."""

        if not new_messages:
            return {"status": "no_changes"}

        try:
            logger.debug(f"Syncing {len(new_messages)} new messages for entity {entity_id}")
            response = requests.post(
                f"{self.api_url}/api/entities/memory/{entity_id}/",
                json={"messages": new_messages},
                headers=self._get_auth_headers(),
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                logger.error("Authentication failed - invalid entity API key")
            elif e.response.status_code == 403:
                logger.error("Access denied - insufficient permissions")
            else:
                logger.error(f"HTTP error syncing context for entity {entity_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error syncing context for entity {entity_id}: {e}")
            return None

    def ingest_data(self, user_profile_id: str, data: str, nodes: list[str]) -> bool:
        """Ingest data into the knowledge graph."""
        try:
            date_of_work = datetime.now().date()
            response = requests.post(
                f"{self.api_url}/api/lms/graphs/ingest-data/",
                json={
                    "user_profile_id": user_profile_id,
                    "data": data,
                    "nodes": nodes,
                    "date_of_work": date_of_work.isoformat(),
                },
                headers=self._get_auth_headers(),
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Error ingesting data: {e}")
            return False

    def list_documents(self, limit: int = 10, offset: int = 0) -> dict[str, Any] | None:
        """List documents for an entity."""
        try:
            response = requests.get(
                f"{self.api_url}/api/entities/documents/",
                headers=self._get_auth_headers(),
            )
            response.raise_for_status()
            data = response.json()[offset : offset + limit]
            return {
                "documents": data,
                "total": len(response.json()),
                "limit": limit,
                "offset": offset,
            }
        except Exception as e:
            logger.error(f"Error listing documents: {e}")
            return None

    def view_document(self, document_id: str) -> dict[str, Any] | None:
        """View a document for an entity."""
        try:
            response = requests.get(
                f"{self.api_url}/api/entities/documents/{document_id}/",
                headers=self._get_auth_headers(),
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error viewing document: {e}")
            return None
