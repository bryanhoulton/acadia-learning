"""
Shared mocking utilities for email tests.

This module provides consistent mocking of AgentMail API calls to prevent
actual API calls during testing while maintaining realistic test behavior.
"""

import json
from contextlib import contextmanager
from unittest.mock import patch


class MockInbox:
    """Mock inbox object that mimics AgentMail Inbox behavior"""

    def __init__(self, entity_id, is_test=False):
        self.entity_id = entity_id
        prefix = "test-acadia" if is_test else "acadia"
        self.inbox_id = f"{prefix}-{entity_id}@mail.acadialearning.org"
        self.display_name = "Test Acadia" if is_test else "Acadia"
        self.username = f"{prefix}-{entity_id}"
        self.domain = "mail.acadialearning.org"


class MockThreadsResponse:
    """Mock response for threads.list() calls"""

    def __init__(self, threads=None):
        self.threads = threads or []

    def model_dump_json(self):
        return json.dumps({"threads": self.threads})


class MockThread:
    """Mock thread object for threads.get() calls"""

    def __init__(self, thread_id, messages=None):
        self.thread_id = thread_id
        self.messages = messages or []
        self.subject = "Mock Thread Subject"
        self.preview = "Mock thread preview text"

    def model_dump_json(self):
        return json.dumps(
            {
                "thread_id": self.thread_id,
                "messages": self.messages,
                "subject": self.subject,
                "preview": self.preview,
            }
        )


class MockMessage:
    """Mock message object for message operations"""

    def __init__(self, message_id, to=None, subject=None, text=None):
        self.message_id = message_id
        self.to = to or []
        self.subject = subject or "Mock Message Subject"
        self.text = text or "Mock message text"
        self.from_email = "test@example.com"
        self.timestamp = "2025-01-14T10:00:00.000Z"


class AgentMailMocker:
    """Comprehensive AgentMail API mocker"""

    def __init__(self):
        self.patchers = []
        self.mock_clients = {}
        self.mock_inboxes = {}
        self.mock_threads = {}
        self.mock_messages = {}
        for mock_client in self.mock_clients.values():
            mock_client.reset_mock()
            self._setup_mock_client(mock_client)

    def start(self):
        """Start all patches and set up mock behavior"""
        # Patch all locations where mail client is imported
        locations = [
            "api.settings.mail",
            "entities.adapters.emails.mail",
            "entities.models.mail",
            "utils.emails.mail",
            "emails.views.mail",  # If webhook uses mail client
        ]

        for location in locations:
            try:
                patcher = patch(location)
                mock_client = patcher.start()
                self.patchers.append(patcher)
                self.mock_clients[location] = mock_client
                self._setup_mock_client(mock_client)
            except (ImportError, AttributeError):
                # Skip if the location doesn't exist
                pass

    def stop(self):
        """Stop all patches"""
        for patcher in self.patchers:
            patcher.stop()
        self.patchers.clear()
        self.mock_clients.clear()

    def _setup_mock_client(self, mock_client):
        """Set up default behavior for a mock client"""
        # Set up inbox operations
        mock_client.inboxes.get.return_value = MockInbox(1)
        mock_client.inboxes.create.return_value = MockInbox(1)
        mock_client.inboxes.delete.return_value = None

        # Set up thread operations
        mock_client.inboxes.threads.list.return_value = MockThreadsResponse([])
        mock_client.inboxes.threads.get.return_value = MockThread("mock-thread-id")

        # Set up message operations
        mock_client.inboxes.messages.send.return_value = None
        mock_client.inboxes.messages.reply.return_value = MockMessage("mock-message-id")

    def get_mock_client(self, location="api.settings.mail"):
        """Get a specific mock client"""
        return self.mock_clients.get(location)

    def set_inbox_for_entity(self, entity_id, is_test=False):
        """Set up a mock inbox for a specific entity"""
        inbox = MockInbox(entity_id, is_test=is_test)
        self.mock_inboxes[entity_id] = inbox

        # Update all mock clients to return this inbox
        for mock_client in self.mock_clients.values():
            mock_client.inboxes.get.return_value = inbox
            mock_client.inboxes.create.return_value = inbox

        return inbox

    def set_threads_for_entity(self, entity_id, threads=None):
        """Set up mock threads for a specific entity"""
        threads = threads or []
        response = MockThreadsResponse(threads)
        self.mock_threads[entity_id] = response

        # Update all mock clients to return these threads
        for mock_client in self.mock_clients.values():
            mock_client.inboxes.threads.list.return_value = response

        return response

    def simulate_api_error(self, operation, error_type=Exception, error_message="API Error"):
        """Simulate an API error for testing error handling"""
        error = error_type(error_message)

        for mock_client in self.mock_clients.values():
            if operation == "inbox_get":
                mock_client.inboxes.get.side_effect = error
            elif operation == "inbox_create":
                mock_client.inboxes.create.side_effect = error
            elif operation == "threads_list":
                mock_client.inboxes.threads.list.side_effect = error
            elif operation == "threads_get":
                mock_client.inboxes.threads.get.side_effect = error
            elif operation == "messages_send":
                mock_client.inboxes.messages.send.side_effect = error
            elif operation == "messages_reply":
                mock_client.inboxes.messages.reply.side_effect = error

    def reset_mocks(self):
        """Reset all mocks to their default state"""
        for mock_client in self.mock_clients.values():
            mock_client.reset_mock()
            self._setup_mock_client(mock_client)


@contextmanager
def mock_agentmail():
    """Context manager for mocking AgentMail API calls"""
    mocker = AgentMailMocker()
    mocker.start()
    try:
        yield mocker
    finally:
        mocker.stop()


# Convenience functions for common test scenarios
def create_mock_inbox(entity_id, is_test=False):
    """Create a mock inbox for testing"""
    return MockInbox(entity_id, is_test=is_test)


def create_mock_threads_response(threads=None):
    """Create a mock threads response for testing"""
    return MockThreadsResponse(threads)


def create_mock_thread(thread_id, messages=None):
    """Create a mock thread for testing"""
    return MockThread(thread_id, messages)


def create_mock_message(message_id, to=None, subject=None, text=None):
    """Create a mock message for testing"""
    return MockMessage(message_id, to=to, subject=subject, text=text)


# Test fixtures for common scenarios
SAMPLE_THREADS = [
    {
        "thread_id": "thread-1",
        "subject": "Sample Thread 1",
        "preview": "This is a sample thread",
    },
    {
        "thread_id": "thread-2",
        "subject": "Sample Thread 2",
        "preview": "Another sample thread",
    },
]

SAMPLE_MESSAGES = [
    {
        "message_id": "msg-1",
        "from_email": "sender@example.com",
        "to": ["recipient@example.com"],
        "subject": "Sample Message 1",
        "text": "This is a sample message",
        "timestamp": "2025-01-14T10:00:00.000Z",
    },
    {
        "message_id": "msg-2",
        "from_email": "sender2@example.com",
        "to": ["recipient2@example.com"],
        "subject": "Sample Message 2",
        "text": "This is another sample message",
        "timestamp": "2025-01-14T11:00:00.000Z",
    },
]
