import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.test import TestCase, tag
from django.utils import timezone

from emails.tests.test_mocks import AgentMailMocker
from entities.adapters.emails import EmailAdapter
from entities.adapters.sms import SmsAdapter
from entities.adapters.system import SystemAdapter
from entities.models import Entity
from entities.runtime import EntityRuntime
from lms.accounts.models import Account, UserProfile
from sms.models import SMSMessage
from utils.timezone import parse_datetime_from_llm


def _get_tool(runtime: EntityRuntime, tool_name: str):
    for tool in runtime.available_tools:
        if tool.name == tool_name:
            return tool
    raise AssertionError(f"Tool {tool_name} not found in runtime")


@tag("integration")
class EmailAdapterIntegrationTests(TestCase):
    def setUp(self):
        self.mail_mocker = AgentMailMocker()
        self.mail_mocker.start()

        self.user = User.objects.create_user(username="email_adapter_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15555550000",
            timezone="UTC",
        )
        self.entity = Entity.objects.create(name="Email Entity", account=self.account, timezone="UTC")

        self.runtime = EntityRuntime(self.entity)
        self.adapter = next(adapter for adapter in self.runtime.adapters if isinstance(adapter, EmailAdapter))
        self.list_tool = _get_tool(self.runtime, "email_list_threads")
        self.thread_tool = _get_tool(self.runtime, "email_look_at_thread")

        self.mail_mocker.set_inbox_for_entity(self.entity.id)

    def tearDown(self):
        self.mail_mocker.stop()

    def test_list_threads_updates_last_read_time(self):
        # Mock a ThreadItem with model_dump()
        mock_thread = MagicMock()
        mock_thread.model_dump.return_value = {"thread_id": "thread-1", "subject": "Test"}

        # Mock SyncPager as an iterable (list)
        for client in self.mail_mocker.mock_clients.values():
            client.inboxes.threads.list.return_value = [mock_thread]

        result = self.list_tool.execute(self.runtime, {"limit": 5})
        self.entity.refresh_from_db()

        result_data = json.loads(result)
        self.assertEqual(result_data["threads"][0]["thread_id"], "thread-1")
        self.assertIsNotNone(self.entity.last_email_read_time)
        self.assertLessEqual(
            abs(self.entity.last_email_read_time - timezone.now()),
            timedelta(minutes=1),
        )

    def test_detail_reports_unread_threads(self):
        with patch.object(
            Entity,
            "has_unread_emails",
            return_value=[SimpleNamespace(preview="New lesson scheduled", timestamp=timezone.now())],
        ):
            detail = self.adapter.detail(self.runtime)

        self.assertIn("You have 1 unread emails", detail)

    def test_look_at_thread_returns_payload(self):
        thread_payload = {"thread_id": "thread-123", "messages": ["hello"]}
        response = MagicMock()
        response.model_dump_json.return_value = json.dumps(thread_payload)
        for client in self.mail_mocker.mock_clients.values():
            client.inboxes.threads.get.return_value = response

        result = self.thread_tool.execute(self.runtime, {"thread_id": "thread-123"})

        self.assertEqual(json.loads(result)["thread_id"], "thread-123")


@tag("integration")
class SmsAdapterIntegrationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="sms_adapter_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15555550001",
            timezone="America/New_York",
        )
        self.entity = Entity.objects.create(name="SMS Entity", account=self.account, timezone="America/New_York")

        self.runtime = EntityRuntime(self.entity)
        self.adapter = next(adapter for adapter in self.runtime.adapters if isinstance(adapter, SmsAdapter))
        self.list_tool = _get_tool(self.runtime, "sms_list")
        self.send_tool = _get_tool(self.runtime, "sms_send")

        self.profile = UserProfile.objects.create(
            name="Parent One",
            profile_type=UserProfile.ProfileType.PARENT,
            phone="+15551230000",
            account=self.account,
        )

        SMSMessage.objects.create(
            from_number=self.profile.phone,
            to_number="+15555550001",
            body="Hi there",
            direction="inbound",
            created_at=timezone.now() - timedelta(minutes=5),
        )
        SMSMessage.objects.create(
            from_number="+15555550001",
            to_number=self.profile.phone,
            body="Welcome!",
            direction="outbound",
            created_at=timezone.now() - timedelta(minutes=2),
        )

    def test_list_messages_for_profile(self):
        result = self.list_tool.execute(self.runtime, {"user_profile_id": str(self.profile.id)})
        self.profile.refresh_from_db()

        self.assertEqual(len(result), 2)
        self.assertGreaterEqual(result[0]["seconds_ago"], 0)
        self.assertIsNotNone(self.profile.last_sms_read_time)
        self.assertGreaterEqual(self.profile.last_sms_read_time, timezone.now() - timedelta(minutes=1))

    def test_send_message_creates_outbound_record(self):
        self.profile.last_sms_read_time = timezone.now()
        self.profile.save(update_fields=["last_sms_read_time"])

        result = self.send_tool.execute(
            self.runtime,
            {"user_profile_id": str(self.profile.id), "message": "Checking in"},
        )

        self.assertEqual(result["status"], "sent")
        message = SMSMessage.objects.filter(to_number=self.profile.phone, body="Checking in").first()
        self.assertIsNotNone(message)
        self.assertEqual(message.direction, "outbound")


@tag("integration")
class SystemAdapterIntegrationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="system_adapter_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15555550002",
            timezone="America/Los_Angeles",
        )
        self.entity = Entity.objects.create(name="System Entity", account=self.account, timezone="America/Los_Angeles")

        self.runtime = EntityRuntime(self.entity)
        self.adapter = next(adapter for adapter in self.runtime.adapters if isinstance(adapter, SystemAdapter))
        self.sleep_tool = _get_tool(self.runtime, "sleep")
        self.timezone_tool = _get_tool(self.runtime, "change_timezone")

    def test_sleep_tool_sets_sleep_until(self):
        until_str = "2025-01-01T08:30:00-05:00"
        result = self.sleep_tool.execute(self.runtime, {"until": until_str})

        self.entity.refresh_from_db()
        expected = parse_datetime_from_llm(until_str)

        self.assertEqual(self.entity.status, Entity.EntityStatus.SLEEPING)
        self.assertEqual(self.entity.sleep_until, expected)
        self.assertIn("America/Los_Angeles", result)

    def test_sleep_tool_blocks_with_unread_sms(self):
        profile = UserProfile.objects.create(
            name="Student",
            profile_type=UserProfile.ProfileType.STUDENT,
            phone="+15550009999",
            account=self.account,
        )
        SMSMessage.objects.create(
            from_number=profile.phone,
            to_number="+15555550002",
            body="Need help",
            direction="inbound",
        )

        result = self.sleep_tool.execute(self.runtime, {"until": "2025-01-01T08:30:00-05:00"})
        self.entity.refresh_from_db()

        self.assertEqual(result, "You have unread SMS messages. Please read them before sleeping.")
        self.assertIsNone(self.entity.sleep_until)

    def test_change_timezone_updates_account_and_entity(self):
        result = self.timezone_tool.execute(self.runtime, {"timezone": "Europe/London"})

        self.entity.refresh_from_db()
        self.account.refresh_from_db()

        self.assertEqual(self.entity.timezone, "Europe/London")
        self.assertEqual(self.account.timezone, "Europe/London")
        self.assertIn("Europe/London", result)
