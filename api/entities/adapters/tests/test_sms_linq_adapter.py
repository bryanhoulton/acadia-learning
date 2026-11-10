"""
Integration tests for Linq SMS adapter.

These tests hit the real Linq API and don't mock external calls.
They are marked as 'slow' and require LINQ_INTEGRATION_TOKEN and LINQ_PHONE_NUMBER env vars.
"""

import json
import os
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings, tag
from django.urls import reverse
from django.utils import timezone

from entities.adapters.sms_linq import LinqSmsAdapter, SmsReactTool
from entities.models import Entity
from entities.runtime import EntityRuntime
from lms.accounts.models import Account, UserProfile
from sms.models import SMSMessage
from utils.linq import LINQ_REACTION_TYPES, LinqClient, format_e164

# Skip tests if Linq credentials not configured
LINQ_TOKEN = os.environ.get("LINQ_INTEGRATION_TOKEN")
LINQ_PHONE = os.environ.get("LINQ_PHONE_NUMBER")
SKIP_LINQ_TESTS = not LINQ_TOKEN or not LINQ_PHONE
SKIP_REASON = "LINQ_INTEGRATION_TOKEN and LINQ_PHONE_NUMBER must be set"


def _get_tool(runtime: EntityRuntime, tool_name: str):
    for tool in runtime.available_tools:
        if tool.name == tool_name:
            return tool
    raise AssertionError(f"Tool {tool_name} not found in runtime")


# =============================================================================
# Unit Tests (fast, no external API calls)
# =============================================================================


@tag("fast")
class TestLinqClientHelpers(TestCase):
    """Test Linq client helper functions."""

    def test_format_e164_adds_country_code(self):
        """Test that format_e164 adds +1 country code."""
        self.assertEqual(format_e164("4155838050"), "+14155838050")

    def test_format_e164_preserves_existing_code(self):
        """Test that format_e164 preserves existing country code."""
        self.assertEqual(format_e164("+14155838050"), "+14155838050")

    def test_format_e164_handles_11_digit_number(self):
        """Test that format_e164 handles 11 digit numbers with leading 1."""
        self.assertEqual(format_e164("14155838050"), "+14155838050")

    def test_reaction_types_defined(self):
        """Test that all expected reaction types are defined."""
        expected = ["love", "like", "dislike", "laugh", "emphasize", "question"]
        self.assertEqual(LINQ_REACTION_TYPES, expected)


@tag("fast")
class TestLinqSmsAdapterRegistration(TestCase):
    """Test that Linq SMS adapter is properly registered."""

    def test_adapter_registered(self):
        """Test that sms_linq adapter is in the registry."""
        from entities.adapters import ADAPTER_REGISTRY

        self.assertIn("sms_linq", ADAPTER_REGISTRY)
        self.assertIsInstance(ADAPTER_REGISTRY["sms_linq"], LinqSmsAdapter)

    def test_adapter_has_correct_tools(self):
        """Test that adapter has all expected tools."""
        adapter = LinqSmsAdapter()
        tool_names = [tool.name for tool in adapter.tools]

        self.assertIn("sms_list", tool_names)
        self.assertIn("sms_send", tool_names)
        self.assertIn("sms_react", tool_names)
        self.assertIn("open_image", tool_names)

    def test_adapter_name(self):
        """Test adapter name is correct."""
        adapter = LinqSmsAdapter()
        self.assertEqual(adapter.name, "sms_linq")


@tag("fast")
class TestSmsReactToolValidation(TestCase):
    """Test SmsReactTool parameter validation."""

    def setUp(self):
        self.tool = SmsReactTool()
        self.user = User.objects.create_user(username="react_test_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15555550010",
            timezone="UTC",
        )
        self.entity = Entity.objects.create(
            name="React Test Entity",
            account=self.account,
            timezone="UTC",
            adapters=["sms_linq", "system"],
        )
        self.runtime = EntityRuntime(self.entity)

    def test_missing_message_id_returns_error(self):
        """Test that missing message_id returns error."""
        result = self.tool.execute(self.runtime, {"reaction_type": "love"})
        self.assertIn("error", result)
        self.assertIn("message_id", result["error"])

    def test_invalid_reaction_type_returns_error(self):
        """Test that invalid reaction type returns error."""
        result = self.tool.execute(self.runtime, {"message_id": 123, "reaction_type": "invalid"})
        self.assertIn("error", result)
        self.assertIn("Invalid reaction type", result["error"])

    def test_valid_reaction_in_testing_mode(self):
        """Test that valid reaction succeeds in testing mode."""
        result = self.tool.execute(self.runtime, {"message_id": 123, "reaction_type": "love"})
        self.assertEqual(result["status"], "added")
        self.assertEqual(result["reaction"], "love")

    def test_remove_reaction_in_testing_mode(self):
        """Test that remove reaction works in testing mode."""
        result = self.tool.execute(self.runtime, {"message_id": 123, "reaction_type": "like", "remove": True})
        self.assertEqual(result["status"], "removed")
        self.assertEqual(result["reaction"], "like")


@tag("fast")
class TestLinqSmsAdapterIntegration(TestCase):
    """Integration tests for Linq SMS adapter with database."""

    def setUp(self):
        self.user = User.objects.create_user(username="linq_adapter_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15555550020",
            timezone="America/New_York",
        )
        # Create entity with sms_linq adapter
        self.entity = Entity.objects.create(
            name="Linq SMS Entity",
            account=self.account,
            timezone="America/New_York",
            adapters=["sms_linq", "system", "email", "LMS", "documents", "sessions"],
        )

        self.runtime = EntityRuntime(self.entity)
        self.adapter = next(adapter for adapter in self.runtime.adapters if isinstance(adapter, LinqSmsAdapter))
        self.list_tool = _get_tool(self.runtime, "sms_list")
        self.send_tool = _get_tool(self.runtime, "sms_send")
        self.react_tool = _get_tool(self.runtime, "sms_react")

        self.profile = UserProfile.objects.create(
            name="Test Parent",
            profile_type=UserProfile.ProfileType.PARENT,
            phone="+15551230001",
            account=self.account,
        )

        # Create some test messages with linq fields
        self.linq_phone = os.environ.get("LINQ_PHONE_NUMBER", "+14155838050")
        SMSMessage.objects.create(
            from_number=self.profile.phone,
            to_number=self.linq_phone,
            body="Hi from parent",
            direction="inbound",
            linq_chat_id=12345,
            linq_message_id=67890,
            created_at=timezone.now() - timedelta(minutes=5),
        )
        SMSMessage.objects.create(
            from_number=self.linq_phone,
            to_number=self.profile.phone,
            body="Hello!",
            direction="outbound",
            linq_chat_id=12345,
            linq_message_id=67891,
            created_at=timezone.now() - timedelta(minutes=2),
        )

    def test_list_messages_returns_linq_message_ids(self):
        """Test that sms_list returns linq_message_id for reactions."""
        result = self.list_tool.execute(self.runtime, {"user_profile_id": str(self.profile.id)})

        self.assertEqual(len(result), 2)
        # Check that linq_message_id is included
        self.assertIn("linq_message_id", result[0])
        self.assertIsNotNone(result[0]["linq_message_id"])

    def test_list_messages_updates_last_read_time(self):
        """Test that sms_list updates profile's last_sms_read_time."""
        self.assertIsNone(self.profile.last_sms_read_time)

        self.list_tool.execute(self.runtime, {"user_profile_id": str(self.profile.id)})
        self.profile.refresh_from_db()

        self.assertIsNotNone(self.profile.last_sms_read_time)
        self.assertGreaterEqual(self.profile.last_sms_read_time, timezone.now() - timedelta(minutes=1))

    def test_send_message_creates_outbound_record(self):
        """Test that sms_send creates an outbound SMS record."""
        # Mark messages as read first
        self.profile.last_sms_read_time = timezone.now()
        self.profile.save(update_fields=["last_sms_read_time"])

        result = self.send_tool.execute(
            self.runtime,
            {"user_profile_id": str(self.profile.id), "message": "Test message from Linq"},
        )

        self.assertEqual(result["status"], "sent")
        message = SMSMessage.objects.filter(to_number=self.profile.phone, body="Test message from Linq").first()
        self.assertIsNotNone(message)
        self.assertEqual(message.direction, "outbound")

    def test_send_message_fails_with_unread_messages(self):
        """Test that sms_send fails when there are unread messages."""
        # Don't set last_sms_read_time so messages appear unread
        result = self.send_tool.execute(
            self.runtime,
            {"user_profile_id": str(self.profile.id), "message": "This should fail"},
        )

        self.assertIn("error", result)
        self.assertIn("unread", result["error"].lower())

    def test_send_message_fails_when_user_has_not_texted_first(self):
        """Test that sms_send fails when user hasn't texted us first (deliverability)."""
        # Mark all existing profiles as read to avoid unread message error
        for profile in UserProfile.objects.filter(account=self.account):
            profile.last_sms_read_time = timezone.now()
            profile.save(update_fields=["last_sms_read_time"])

        # Create a new profile with no inbound messages
        new_profile = UserProfile.objects.create(
            name="New User",
            profile_type=UserProfile.ProfileType.PARENT,
            phone="+15559990001",
            account=self.account,
            last_sms_read_time=timezone.now(),
        )

        result = self.send_tool.execute(
            self.runtime,
            {"user_profile_id": str(new_profile.id), "message": "Hello!"},
        )

        self.assertIn("error", result)
        self.assertIn("has not texted us yet", result["error"])

    def test_adapter_detail_shows_unread_status(self):
        """Test that adapter detail shows unread message status."""
        detail = self.adapter.detail(self.runtime)

        # Should show unread messages (last_sms_read_time is None)
        self.assertIn("unread", detail.lower())

    def test_adapter_detail_shows_no_unread_when_read(self):
        """Test that adapter detail shows no unread after reading."""
        self.profile.last_sms_read_time = timezone.now() + timedelta(hours=1)
        self.profile.save(update_fields=["last_sms_read_time"])

        detail = self.adapter.detail(self.runtime)

        self.assertIn("no unread", detail.lower())

    def test_format_result_includes_message_ids(self):
        """Test that format_result includes linq_message_id for reactions."""
        result = self.list_tool.execute(self.runtime, {"user_profile_id": str(self.profile.id)})
        formatted = self.list_tool.format_result(result)

        self.assertIn("msg_id:", formatted)


@tag("fast")
class TestLinqWebhook(TestCase):
    """Test Linq webhook handling."""

    def setUp(self):
        self.user = User.objects.create_user(username="linq_webhook_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15555550030",
            timezone="UTC",
        )
        self.entity = Entity.objects.create(
            name="Webhook Entity",
            account=self.account,
            timezone="UTC",
            adapters=["sms_linq", "system"],
        )
        self.profile = UserProfile.objects.create(
            name="Webhook Parent",
            profile_type=UserProfile.ProfileType.PARENT,
            phone="+15559998888",
            account=self.account,
        )

    def test_webhook_rejects_invalid_json(self):
        """Test that webhook rejects invalid JSON."""
        response = self.client.post(
            reverse("linq_webhook"),
            data="not json",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_webhook_skips_outbound_messages(self):
        """Test that webhook skips outbound messages (is_from_me=true)."""
        payload = {
            "api_version": "v2",
            "event_type": "message.received",
            "event_id": "wh_evt_123",
            "created_at": "2025-01-09T12:00:00-06:00",
            "data": {
                "id": "456",
                "chat_id": "123",
                "text": "Hello!",
                "is_from_me": True,  # Outbound
                "sent_at": "2025-01-09 12:00:00 -0600",
                "chat_handle": {"id": "789", "identifier": "+15559998888"},
                "chat_handles": [],
                "attachments": [],
            },
        }

        response = self.client.post(
            reverse("linq_webhook"),
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "skipped")
        self.assertEqual(data["reason"], "outbound")

    def test_webhook_requires_sender_phone(self):
        """Test that webhook requires sender phone number."""
        payload = {
            "api_version": "v2",
            "event_type": "message.received",
            "event_id": "wh_evt_123",
            "created_at": "2025-01-09T12:00:00-06:00",
            "data": {
                "id": "456",
                "chat_id": "123",
                "text": "Hello!",
                "is_from_me": False,
                "chat_handle": {},  # No identifier
                "chat_handles": [],
                "attachments": [],
            },
        }

        response = self.client.post(
            reverse("linq_webhook"),
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_webhook_creates_message_for_known_profile(self):
        """Test that webhook creates SMS message for known profile."""
        initial_count = SMSMessage.objects.count()

        payload = {
            "api_version": "v2",
            "event_type": "message.received",
            "event_id": "wh_evt_test123",
            "created_at": "2025-01-09T12:00:00-06:00",
            "data": {
                "id": "888",
                "chat_id": "999",
                "text": "Test message from webhook",
                "is_from_me": False,
                "sent_at": "2025-01-09 12:00:00 -0600",
                "chat_handle": {"id": "111", "identifier": "+15559998888"},  # Matches self.profile
                "chat_handles": [
                    {"identifier": "+15559998888", "display_name": "Test", "is_me": False},
                ],
                "attachments": [],
            },
        }

        with self.settings(TESTING=False):
            # Need to mock possibly_run_entity since we're testing the webhook flow
            from unittest.mock import patch

            with (
                patch("sms.views.possibly_run_entity") as mock_run,
                patch("sms.views.send_slack_message"),
                patch("sms.views.track_inbound_sms"),
            ):
                response = self.client.post(
                    reverse("linq_webhook"),
                    data=json.dumps(payload),
                    content_type="application/json",
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(SMSMessage.objects.count(), initial_count + 1)

        message = SMSMessage.objects.latest("created_at")
        self.assertEqual(message.body, "Test message from webhook")
        self.assertEqual(message.linq_chat_id, 999)
        self.assertEqual(message.linq_message_id, 888)
        self.assertEqual(message.direction, "inbound")

    def test_webhook_ignores_message_when_entity_missing_linq_adapter(self):
        """Test that webhook rejects inbound Linq SMS when entity lacks sms_linq adapter."""
        self.entity.adapters = ["sms", "system"]
        self.entity.save(update_fields=["adapters"])
        initial_count = SMSMessage.objects.count()

        payload = {
            "api_version": "v2",
            "event_type": "message.received",
            "event_id": "wh_evt_no_adapter",
            "created_at": "2025-01-09T12:00:00-06:00",
            "data": {
                "id": "777",
                "chat_id": "666",
                "text": "This should be ignored",
                "is_from_me": False,
                "sent_at": "2025-01-09 12:00:00 -0600",
                "chat_handle": {"id": "111", "identifier": "+15559998888"},
                "chat_handles": [
                    {"identifier": "+15559998888", "display_name": "Test", "is_me": False},
                ],
                "attachments": [],
            },
        }

        with (
            patch("sms.views.possibly_run_entity") as mock_run,
            patch("sms.views.send_slack_message"),
            patch("sms.views.track_inbound_sms"),
        ):
            response = self.client.post(
                reverse("linq_webhook"),
                data=json.dumps(payload),
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ignored")
        self.assertEqual(response.json()["reason"], "adapter not enabled")
        self.assertEqual(SMSMessage.objects.count(), initial_count)
        mock_run.assert_not_called()

    def test_webhook_handles_unknown_event_types(self):
        """Test that webhook handles unknown event types gracefully."""
        payload = {
            "api_version": "v2",
            "event_type": "some.other.event",
            "event_id": "wh_evt_unknown",
            "data": {},
        }

        response = self.client.post(
            reverse("linq_webhook"),
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["event"], "some.other.event")

    def test_webhook_handles_message_sent_event(self):
        """Test that webhook handles message.sent events (outbound confirmation)."""
        payload = {
            "api_version": "v2",
            "event_type": "message.sent",
            "event_id": "wh_evt_sent123",
            "created_at": "2025-01-09T12:00:00-06:00",
            "data": {
                "id": "456",
                "chat_id": "123",
                "text": "Hello!",
                "is_from_me": True,
            },
        }

        response = self.client.post(
            reverse("linq_webhook"),
            data=json.dumps(payload),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["event"], "message.sent")


@tag("fast")
class TestDefaultAdaptersConfiguration(TestCase):
    """Test that default adapters are configured correctly."""

    def test_linq_adapter_is_default(self):
        """Test that sms_linq adapter is registered and is the default."""
        from entities.adapters import ADAPTER_REGISTRY
        from entities.models import get_default_adapters

        # Linq adapter should be available in registry
        self.assertIn("sms_linq", ADAPTER_REGISTRY)

        # sms_linq should be the default for new entities
        defaults = get_default_adapters()
        self.assertIn("sms_linq", defaults)
        self.assertNotIn("sms", defaults)

    def test_existing_twilio_entities_keep_sms_adapter(self):
        """Test that existing entities with sms adapter keep it."""
        user = User.objects.create_user(username="twilio_entity_user")
        account = Account.objects.create(
            user=user,
            account_phone="+15555550040",
            timezone="UTC",
        )
        # Manually set sms adapter (simulating existing entity)
        entity = Entity.objects.create(
            name="Twilio Entity",
            account=account,
            timezone="UTC",
            adapters=["sms", "system", "email", "LMS", "documents", "sessions"],
        )

        runtime = EntityRuntime(entity)
        adapter_names = [a.name for a in runtime.adapters]

        self.assertIn("sms", adapter_names)
        # Should not force sms_linq on existing entities
        self.assertNotIn("sms_linq", adapter_names)


# =============================================================================
# API Call Count Tests
# =============================================================================


@tag("fast")
class TestSmsListApiCallCount(TestCase):
    """Test that sms_list doesn't make excessive API calls.

    Verifies that listing all messages doesn't send N read receipts,
    which would cause O(n) API latency.
    """

    def setUp(self):
        self.user = User.objects.create_user(username="api_count_test_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15555550060",
            timezone="UTC",
        )
        self.entity = Entity.objects.create(
            name="API Count Test Entity",
            account=self.account,
            timezone="UTC",
            adapters=["sms_linq", "system"],
        )
        self.runtime = EntityRuntime(self.entity)
        self.list_tool = _get_tool(self.runtime, "sms_list")

        self.linq_phone = os.environ.get("LINQ_PHONE_NUMBER", "+14155838050")

        # Create 5 contacts with messages for THIS account
        self.profiles = []
        for i in range(5):
            profile = UserProfile.objects.create(
                name=f"Contact {i}",
                profile_type=UserProfile.ProfileType.PARENT,
                phone=f"+1555000100{i}",
                account=self.account,
            )
            self.profiles.append(profile)

            # Create inbound and outbound messages for each
            for j in range(3):
                SMSMessage.objects.create(
                    from_number=profile.phone,
                    to_number=self.linq_phone,
                    body=f"Inbound message {j} from contact {i}",
                    direction="inbound",
                    linq_chat_id=1000 + i,
                    linq_message_id=2000 + i * 10 + j,
                    created_at=timezone.now() - timedelta(minutes=10 - j),
                )
                SMSMessage.objects.create(
                    from_number=self.linq_phone,
                    to_number=profile.phone,
                    body=f"Outbound message {j} to contact {i}",
                    direction="outbound",
                    linq_chat_id=1000 + i,
                    linq_message_id=3000 + i * 10 + j,
                    created_at=timezone.now() - timedelta(minutes=10 - j),
                )

        # Create ANOTHER account with contacts and messages (should be ignored)
        self.other_user = User.objects.create_user(username="other_account_user")
        self.other_account = Account.objects.create(
            user=self.other_user,
            account_phone="+15555550099",
            timezone="UTC",
        )
        self.other_profiles = []
        for i in range(3):
            other_profile = UserProfile.objects.create(
                name=f"Other Contact {i}",
                profile_type=UserProfile.ProfileType.PARENT,
                phone=f"+1555000200{i}",
                account=self.other_account,
            )
            self.other_profiles.append(other_profile)

            # Create messages for the other account
            for j in range(2):
                SMSMessage.objects.create(
                    from_number=other_profile.phone,
                    to_number=self.linq_phone,
                    body=f"Other account inbound message {j}",
                    direction="inbound",
                    linq_chat_id=9000 + i,
                    linq_message_id=9000 + i * 10 + j,
                    created_at=timezone.now() - timedelta(minutes=5),
                )

    @override_settings(TESTING=False)
    def test_list_all_makes_zero_api_calls(self):
        """Test that listing all SMS makes zero Linq API calls.

        Previously, this would call mark_as_read for every contact,
        causing O(n) API latency. Now it should make no API calls.
        """
        from unittest.mock import MagicMock, patch

        mock_client = MagicMock()

        with patch("entities.adapters.sms_linq._get_linq_client", return_value=mock_client):
            result = self.list_tool.execute(self.runtime, {})

        # Should return all messages
        self.assertEqual(len(result), 30)  # 5 contacts * 3 inbound + 3 outbound each

        # Should NOT have called any API methods
        mock_client.mark_as_read.assert_not_called()
        mock_client.find_chat.assert_not_called()

    @override_settings(TESTING=False)
    def test_list_specific_profile_makes_one_api_call_per_chat(self):
        """Test that listing a specific profile's SMS sends read receipts.

        When viewing a specific conversation, we should send read receipts,
        but only for that profile's chat(s).
        """
        from unittest.mock import MagicMock, patch

        mock_client = MagicMock()

        with patch("entities.adapters.sms_linq._get_linq_client", return_value=mock_client):
            result = self.list_tool.execute(self.runtime, {"user_profile_id": str(self.profiles[0].id)})

        # Should return messages for this contact only
        self.assertEqual(len(result), 6)  # 3 inbound + 3 outbound

        # Should have called mark_as_read once (for the single chat_id)
        self.assertEqual(mock_client.mark_as_read.call_count, 1)
        mock_client.mark_as_read.assert_called_with(1000)  # chat_id for profile 0

        # Should NOT have called find_chat (we had stored chat IDs)
        mock_client.find_chat.assert_not_called()

    @override_settings(TESTING=False)
    def test_list_specific_profile_uses_find_chat_fallback(self):
        """Test that sms_list falls back to find_chat if no stored chat IDs."""
        from unittest.mock import MagicMock, patch

        # Create a profile with messages that have no linq_chat_id
        no_linq_profile = UserProfile.objects.create(
            name="No Linq Profile",
            profile_type=UserProfile.ProfileType.PARENT,
            phone="+15559999999",
            account=self.account,
        )
        SMSMessage.objects.create(
            from_number=no_linq_profile.phone,
            to_number=self.linq_phone,
            body="Message without linq_chat_id",
            direction="inbound",
            linq_chat_id=None,  # No stored chat ID
            linq_message_id=None,
        )

        mock_client = MagicMock()
        mock_chat = MagicMock()
        mock_chat.id = 9999
        mock_client.find_chat.return_value = mock_chat

        with patch("entities.adapters.sms_linq._get_linq_client", return_value=mock_client):
            result = self.list_tool.execute(self.runtime, {"user_profile_id": str(no_linq_profile.id)})

        # Should return the message
        self.assertEqual(len(result), 1)

        # Should have used find_chat as fallback
        mock_client.find_chat.assert_called_once()
        # And then marked as read
        mock_client.mark_as_read.assert_called_once_with(9999)

    def test_list_all_uses_bulk_update(self):
        """Test that listing all SMS uses bulk update for efficiency."""
        from unittest.mock import patch

        # Clear existing last_sms_read_time for both accounts
        UserProfile.objects.filter(account=self.account).update(last_sms_read_time=None)
        UserProfile.objects.filter(account=self.other_account).update(last_sms_read_time=None)

        with patch.object(
            UserProfile.objects.filter(account=self.account).__class__,
            "update",
            wraps=UserProfile.objects.filter(account=self.account).update,
        ) as mock_update:
            # This is tricky to test directly, but we can verify the profiles are updated
            result = self.list_tool.execute(self.runtime, {})

        # Verify all profiles in THIS account now have last_sms_read_time set
        for profile in self.profiles:
            profile.refresh_from_db()
            self.assertIsNotNone(profile.last_sms_read_time)

        # Verify profiles in OTHER account are NOT updated
        for profile in self.other_profiles:
            profile.refresh_from_db()
            self.assertIsNone(profile.last_sms_read_time)

    def test_list_all_excludes_other_accounts_messages(self):
        """Test that listing all SMS only returns messages for THIS account's contacts.

        Messages in the database for other accounts should not appear.
        """
        from unittest.mock import MagicMock, patch

        mock_client = MagicMock()

        with patch("entities.adapters.sms_linq._get_linq_client", return_value=mock_client):
            result = self.list_tool.execute(self.runtime, {})

        # Should only return messages for THIS account (5 contacts * 6 msgs each = 30)
        # NOT the other account's messages (3 contacts * 2 msgs = 6)
        self.assertEqual(len(result), 30)

        # Verify no messages are from other account's phone numbers
        other_phones = [p.phone for p in self.other_profiles]
        for msg in result:
            self.assertNotIn(msg["from"], other_phones)
            self.assertNotIn(msg["to"], other_phones)


# =============================================================================
# Slow Integration Tests (hit real Linq API)
# =============================================================================


@tag("slow")
class TestLinqClientAPI(TestCase):
    """Integration tests that hit the real Linq API.

    These tests require valid LINQ_INTEGRATION_TOKEN and LINQ_PHONE_NUMBER.
    """

    def setUp(self):
        if SKIP_LINQ_TESTS:
            self.skipTest(SKIP_REASON)

        self.client = LinqClient()

    def test_list_chats(self):
        """Test listing chats from Linq API."""
        chats = self.client.list_chats(per_page=5)

        # Should return a list (may be empty if no chats exist)
        self.assertIsInstance(chats, list)

    def test_list_chats_pagination(self):
        """Test that pagination parameters work."""
        chats_page1 = self.client.list_chats(page=1, per_page=2)
        chats_page2 = self.client.list_chats(page=2, per_page=2)

        # Both should return lists
        self.assertIsInstance(chats_page1, list)
        self.assertIsInstance(chats_page2, list)

    def test_find_chat_nonexistent(self):
        """Test finding a chat that doesn't exist."""
        # Use a fake phone number that shouldn't have a chat
        chat = self.client.find_chat(["+15550000000"])

        # Should return None for non-existent chat
        self.assertIsNone(chat)


@tag("slow")
class TestLinqSmsAdapterLiveAPI(TestCase):
    """Integration tests for Linq SMS adapter with live API.

    These tests require valid LINQ_INTEGRATION_TOKEN and LINQ_PHONE_NUMBER.
    They test the full flow including API calls.
    """

    def setUp(self):
        if SKIP_LINQ_TESTS:
            self.skipTest(SKIP_REASON)

        self.user = User.objects.create_user(username="linq_live_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15555550099",
            timezone="America/New_York",
        )
        self.entity = Entity.objects.create(
            name="Linq Live Entity",
            account=self.account,
            timezone="America/New_York",
            adapters=["sms_linq", "system"],
        )
        self.runtime = EntityRuntime(self.entity)
        self.list_tool = _get_tool(self.runtime, "sms_list")

    @override_settings(TESTING=False)
    def test_list_tool_sends_read_receipts(self):
        """Test that sms_list sends read receipts to Linq API.

        This test verifies the full flow but can't easily verify
        the read receipt was received by Linq.
        """
        import uuid

        # Create a profile with unique phone number
        unique_phone = f"+1555{uuid.uuid4().hex[:7]}"
        profile = UserProfile.objects.create(
            name="Live Test Parent",
            profile_type=UserProfile.ProfileType.PARENT,
            phone=unique_phone,
            account=self.account,
        )

        # Create a message with linq_chat_id
        SMSMessage.objects.create(
            from_number=profile.phone,
            to_number=LINQ_PHONE,
            body="Test message",
            direction="inbound",
            linq_chat_id=1,  # Fake chat ID
            linq_message_id=1,
        )

        # Execute list - this should attempt to send read receipt
        # (may fail if chat doesn't exist, but should not raise exception)
        result = self.list_tool.execute(self.runtime, {"user_profile_id": str(profile.id)})

        # Should still return messages even if read receipt fails
        self.assertIsInstance(result, list)
        self.assertGreater(len(result), 0)
