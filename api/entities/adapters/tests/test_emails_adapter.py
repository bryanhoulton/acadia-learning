import time
import uuid
from datetime import UTC, datetime

from agentmail.messages.types.message import Message
from agentmail.threads.types.thread import Thread
from agentmail.threads.types.thread_item import ThreadItem
from django.test import TestCase, tag

from api.settings import mail
from entities.adapters.emails import (
    EmailAdapter,
    ListThreadsTool,
    LookAtThreadTool,
)
from utils.emails import get_or_create_test_inbox

NOW = datetime(2024, 6, 15, 12, 0, 0, tzinfo=UTC)


def _make_thread_item(**overrides) -> ThreadItem:
    """Build a real SDK ThreadItem with sensible defaults."""
    defaults = dict(
        inbox_id="test-inbox@example.com",
        thread_id="thread-1",
        labels=[],
        timestamp=NOW,
        senders=["sender@example.com"],
        recipients=["recipient@example.com"],
        subject="Test Subject",
        preview="Preview text",
        last_message_id="msg-1",
        message_count=1,
        size=100,
        updated_at=NOW,
        created_at=NOW,
    )
    defaults.update(overrides)
    return ThreadItem(**defaults)


def _make_message(**overrides) -> Message:
    """Build a real SDK Message with sensible defaults.

    Note: the SDK field is ``from_`` (Python name) with alias ``"from"``.
    We must pass it via the alias using model_validate so pydantic resolves it.
    """
    defaults = {
        "inbox_id": "test-inbox@example.com",
        "thread_id": "thread-1",
        "message_id": "msg-1",
        "labels": [],
        "timestamp": NOW,
        "from": "sender@example.com",
        "to": ["recipient@example.com"],
        "subject": "Test Subject",
        "text": "Hello, world!",
        "size": 50,
        "updated_at": NOW,
        "created_at": NOW,
    }
    defaults.update(overrides)
    return Message.model_validate(defaults)


def _make_thread(**overrides) -> Thread:
    """Build a real SDK Thread (with messages) with sensible defaults."""
    messages = overrides.pop("messages", None)
    if messages is None:
        messages = [_make_message()]

    defaults = dict(
        inbox_id="test-inbox@example.com",
        thread_id="thread-1",
        labels=[],
        timestamp=NOW,
        senders=["sender@example.com"],
        recipients=["recipient@example.com"],
        subject="Test Subject",
        preview="Preview text",
        last_message_id="msg-1",
        message_count=len(messages),
        size=100,
        updated_at=NOW,
        created_at=NOW,
        messages=messages,
    )
    defaults.update(overrides)
    return Thread(**defaults)


@tag("fast")
class TestListThreadsToolFormatResult(TestCase):
    """Test format_result using real SDK ThreadItem.model_dump() output."""

    def setUp(self):
        self.tool = ListThreadsTool()

    def test_shows_sender_address(self):
        thread_item = _make_thread_item(senders=["bryan@acadialearning.org"])
        thread_dict = thread_item.model_dump()
        thread_dict["is_unread"] = True

        result = {"threads": [thread_dict]}
        formatted = self.tool.format_result(result)

        assert "bryan@acadialearning.org" in formatted
        assert "From: unknown" not in formatted

    def test_shows_multiple_senders(self):
        thread_item = _make_thread_item(
            senders=["alice@example.com", "bob@example.com"],
        )
        thread_dict = thread_item.model_dump()
        thread_dict["is_unread"] = False

        result = {"threads": [thread_dict]}
        formatted = self.tool.format_result(result)

        assert "alice@example.com" in formatted
        assert "bob@example.com" in formatted

    def test_shows_unknown_when_senders_empty(self):
        thread_item = _make_thread_item(senders=[])
        thread_dict = thread_item.model_dump()
        thread_dict["is_unread"] = False

        result = {"threads": [thread_dict]}
        formatted = self.tool.format_result(result)

        assert "From: unknown" in formatted

    def test_unread_marker(self):
        thread_item = _make_thread_item()
        thread_dict = thread_item.model_dump()
        thread_dict["is_unread"] = True

        result = {"threads": [thread_dict]}
        formatted = self.tool.format_result(result)

        assert "[UNREAD]" in formatted

    def test_empty_threads(self):
        result = {"threads": []}
        formatted = self.tool.format_result(result)
        assert "No email threads found" in formatted

    def test_error_result(self):
        result = {"error": "Mail service error"}
        formatted = self.tool.format_result(result)
        assert "Error: Mail service error" in formatted


@tag("fast")
class TestLookAtThreadToolFormatResult(TestCase):
    """Test format_result using real SDK Thread.model_dump() output."""

    def setUp(self):
        self.tool = LookAtThreadTool()

    def test_shows_sender_address(self):
        thread = _make_thread(
            messages=[_make_message(**{"from": "bryan@acadialearning.org"})],
        )
        result = thread.model_dump()
        formatted = self.tool.format_result(result)

        assert "bryan@acadialearning.org" in formatted
        assert "From: unknown" not in formatted

    def test_shows_recipient_address(self):
        thread = _make_thread(
            messages=[_make_message(to=["student@example.com"])],
        )
        result = thread.model_dump()
        formatted = self.tool.format_result(result)

        assert "student@example.com" in formatted

    def test_shows_message_body(self):
        thread = _make_thread(
            messages=[_make_message(text="Please review the assignment.")],
        )
        result = thread.model_dump()
        formatted = self.tool.format_result(result)

        assert "Please review the assignment." in formatted

    def test_multiple_messages(self):
        thread = _make_thread(
            messages=[
                _make_message(
                    message_id="msg-1",
                    **{"from": "parent@example.com"},
                    text="Is my child doing well?",
                ),
                _make_message(
                    message_id="msg-2",
                    **{"from": "tutor@acadialearning.org"},
                    text="Yes, great progress!",
                ),
            ],
        )
        result = thread.model_dump()
        formatted = self.tool.format_result(result)

        assert "parent@example.com" in formatted
        assert "tutor@acadialearning.org" in formatted
        assert "[Message 1]" in formatted
        assert "[Message 2]" in formatted

    def test_thread_subject_displayed(self):
        thread = _make_thread(subject="Safety Concerns")
        result = thread.model_dump()
        formatted = self.tool.format_result(result)

        assert "Safety Concerns" in formatted

    def test_error_result(self):
        result = {"error": "Thread not found"}
        formatted = self.tool.format_result(result)
        assert "Error: Thread not found" in formatted


@tag("fast")
class TestToolSchemas(TestCase):
    def test_list_threads_schema(self):
        tool = ListThreadsTool()
        assert tool.name == "email_list_threads"
        assert "limit" in tool.parameters
        assert "page_token" in tool.parameters

    def test_look_at_thread_schema(self):
        tool = LookAtThreadTool()
        assert tool.name == "email_look_at_thread"
        assert "thread_id" in tool.parameters


@tag("fast")
class TestEmailsAdapter(TestCase):
    def setUp(self):
        self.adapter = EmailAdapter()

    def test_adapter_properties(self):
        assert hasattr(self.adapter, "name")
        assert "email" in self.adapter.description.lower()
        assert len(self.adapter.tools) >= 2

    def test_adapter_contains_expected_tools(self):
        tool_names = [tool.name for tool in self.adapter.tools]
        expected_tools = ["email_list_threads", "email_look_at_thread", "email_respond_to_message"]

        for expected_tool in expected_tools:
            assert expected_tool in tool_names, f"Tool {expected_tool} not found in adapter"


# ---------------------------------------------------------------------------
# E2E tests — hit the real AgentMail API with a test inbox
# ---------------------------------------------------------------------------

TEST_ENTITY_ID = 99999  # Dedicated ID so we don't collide with real entities


@tag("e2e")
class TestEmailToolsE2E(TestCase):
    """
    End-to-end tests that send a real email via AgentMail, then verify
    ListThreadsTool and LookAtThreadTool display the sender correctly.

    Run with:  uv run python manage.py test entities.adapters.tests.test_emails_adapter --tag=e2e --noinput
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.inbox = get_or_create_test_inbox(TEST_ENTITY_ID)
        cls.inbox_id = cls.inbox.inbox_id

        # Send a message from this inbox to itself so we control the sender.
        cls.unique_subject = f"e2e-sender-test-{uuid.uuid4().hex[:8]}"
        mail.inboxes.messages.send(
            inbox_id=cls.inbox_id,
            to=[cls.inbox_id],
            subject=cls.unique_subject,
            text="This is an automated e2e test message.",
        )

        # Give AgentMail a moment to index the thread.
        cls.thread_id = None
        for _ in range(10):
            time.sleep(2)
            resp = mail.inboxes.threads.list(inbox_id=cls.inbox_id, limit=20)
            for t in resp.threads or []:
                if t.subject == cls.unique_subject:
                    cls.thread_id = t.thread_id
                    break
            if cls.thread_id:
                break

        if not cls.thread_id:
            raise RuntimeError(
                f"Timed out waiting for e2e test thread '{cls.unique_subject}' to appear in inbox {cls.inbox_id}"
            )

    # -- ListThreadsTool -------------------------------------------------------

    def test_list_threads_senders_populated(self):
        """The raw API response should contain senders for the thread."""
        resp = mail.inboxes.threads.list(inbox_id=self.inbox_id, limit=20)
        thread = next(t for t in resp.threads if t.thread_id == self.thread_id)
        dumped = thread.model_dump()

        assert "senders" in dumped, f"model_dump() keys: {list(dumped.keys())}"
        assert len(dumped["senders"]) > 0, "senders should not be empty"

    def test_list_threads_format_result_shows_sender(self):
        """format_result should display the real sender, not 'unknown'."""
        resp = mail.inboxes.threads.list(inbox_id=self.inbox_id, limit=20)
        thread = next(t for t in resp.threads if t.thread_id == self.thread_id)
        thread_dict = thread.model_dump()
        thread_dict["is_unread"] = False

        tool = ListThreadsTool()
        formatted = tool.format_result({"threads": [thread_dict]})

        assert "From: unknown" not in formatted, f"Sender missing in:\n{formatted}"
        assert self.inbox_id in formatted or "@" in formatted.split("From:")[1].split("\n")[0]

    # -- LookAtThreadTool ------------------------------------------------------

    def test_look_at_thread_message_has_from(self):
        """The raw API response should contain from_ on each message."""
        thread = mail.inboxes.threads.get(inbox_id=self.inbox_id, thread_id=self.thread_id)
        dumped = thread.model_dump()

        messages = dumped.get("messages", [])
        assert len(messages) > 0, "Thread should have at least one message"

        first_msg = messages[0]
        # Pydantic serializes the aliased field as "from_"
        from_value = first_msg.get("from_", first_msg.get("from"))
        assert from_value is not None, f"No from/from_ key in message: {list(first_msg.keys())}"
        assert from_value != "unknown"

    def test_look_at_thread_format_result_shows_sender(self):
        """format_result should display the real sender address."""
        thread = mail.inboxes.threads.get(inbox_id=self.inbox_id, thread_id=self.thread_id)
        result = thread.model_dump()

        tool = LookAtThreadTool()
        formatted = tool.format_result(result)

        assert "From: unknown" not in formatted, f"Sender missing in:\n{formatted}"
        # The sender should be our inbox address
        assert self.inbox_id in formatted or "@" in formatted.split("From:")[1].split("\n")[0]

    def test_look_at_thread_format_result_shows_body(self):
        """format_result should show the message body."""
        thread = mail.inboxes.threads.get(inbox_id=self.inbox_id, thread_id=self.thread_id)
        result = thread.model_dump()

        tool = LookAtThreadTool()
        formatted = tool.format_result(result)

        assert "automated e2e test message" in formatted
