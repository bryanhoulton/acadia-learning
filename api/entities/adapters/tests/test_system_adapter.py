from datetime import UTC, datetime, timedelta
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.test import TestCase, tag
from django.utils import timezone

from entities.adapters.system import (
    AskForHelpTool,
    ChangeTimezoneTool,
    CreateVerificationCodeTool,
    GetVerificationCodesTool,
    SleepTool,
    SystemAdapter,
)
from entities.models import Entity
from lms.accounts.models import Account, EmailVerificationCode, UserProfile


@tag("fast")
class TestSleepTool(TestCase):
    def setUp(self):
        self.tool = SleepTool()

        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = Mock(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="testuser")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567890", timezone="America/New_York")
        self.entity = Entity.objects.create(name="Test Entity", account=self.account, timezone="America/New_York")

        # Create mock entity runtime
        self.mock_entity_runtime = Mock()
        self.mock_entity_runtime.entity = self.entity

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_success_with_valid_time(self):
        """Test successful sleep execution with valid time string."""
        parameters = {"until": "2024-12-25T10:00:00"}

        with patch("entities.adapters.system.parse_datetime_from_llm") as mock_parse:
            mock_parse.return_value = datetime(2024, 12, 25, 10, 0, 0, tzinfo=UTC)

            result = self.tool.execute(self.mock_entity_runtime, parameters)

            # Verify the entity was updated
            self.entity.refresh_from_db()
            self.assertEqual(self.entity.status, Entity.EntityStatus.SLEEPING)
            self.assertIsNotNone(self.entity.sleep_until)
            self.assertIn("You will sleep until", result)
            self.assertIn("America/New_York", result)

    def test_execute_no_sleep_time_provided(self):
        """Test execution when no sleep time is provided."""
        parameters = {}

        result = self.tool.execute(self.mock_entity_runtime, parameters)

        self.assertEqual(result, "No sleep time provided")

    def test_execute_with_unread_sms(self):
        """Test execution when entity has unread SMS messages."""
        # Create a user profile with SMS messages
        profile = UserProfile.objects.create(
            name="Test Student", profile_type=UserProfile.ProfileType.STUDENT, phone="+1987654321", account=self.account
        )

        # Mock has_unread_sms to return True
        with patch.object(self.entity, "has_unread_sms", return_value=["Test Student"]):
            parameters = {"until": "2024-12-25T10:00:00"}

            result = self.tool.execute(self.mock_entity_runtime, parameters)

            self.assertEqual(result, "You have unread SMS messages. Please read them before sleeping.")

    @patch("entities.adapters.system.send_slack_message")
    def test_execute_with_invalid_time_format(self, mock_slack):
        """Test execution with invalid time format falls back to 10 minute sleep."""
        parameters = {"until": "invalid-time-format"}

        with patch("entities.adapters.system.parse_datetime_from_llm") as mock_parse:
            mock_parse.side_effect = ValueError("Invalid time format")

            with patch("entities.adapters.system.timezone") as mock_timezone:
                mock_now = timezone.now()
                mock_timezone.now.return_value = mock_now

                result = self.tool.execute(self.mock_entity_runtime, parameters)

                # Verify entity was set to sleep for 10 minutes
                self.entity.refresh_from_db()
                self.assertEqual(self.entity.status, Entity.EntityStatus.SLEEPING)
                self.assertIsNotNone(self.entity.sleep_until)

                # Verify Slack message was sent
                mock_slack.assert_called_once()
                self.assertIn("Error setting sleep time", result)

    def test_tool_schema(self):
        """Test that the tool has correct schema properties."""
        self.assertEqual(self.tool.name, "sleep")
        self.assertIn("until", self.tool.parameters)
        self.assertEqual(self.tool.parameters["until"]["type"], "string")


@tag("fast")
class TestChangeTimezoneTool(TestCase):
    def setUp(self):
        self.tool = ChangeTimezoneTool()

        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = Mock(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="testuser2")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567891", timezone="America/New_York")
        self.entity = Entity.objects.create(name="Test Entity 2", account=self.account, timezone="America/New_York")

        # Create mock entity runtime
        self.mock_entity_runtime = Mock()
        self.mock_entity_runtime.entity = self.entity

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_success(self):
        """Test successful timezone change."""
        parameters = {"timezone": "Europe/London"}

        result = self.tool.execute(self.mock_entity_runtime, parameters)

        # Verify both entity and account timezone were updated
        self.entity.refresh_from_db()
        self.account.refresh_from_db()

        self.assertEqual(self.entity.timezone, "Europe/London")
        self.assertEqual(self.account.timezone, "Europe/London")
        self.assertIn("Timezone successfully changed from America/New_York to Europe/London", result)

    def test_execute_no_timezone_provided(self):
        """Test execution when no timezone is provided."""
        parameters = {}

        result = self.tool.execute(self.mock_entity_runtime, parameters)

        self.assertEqual(result, "No timezone provided")

    def test_execute_with_exception(self):
        """Test execution when an exception occurs."""
        parameters = {"timezone": "Invalid/Timezone"}

        # Mock save to raise an exception
        with patch.object(self.entity, "save", side_effect=Exception("Database error")):
            result = self.tool.execute(self.mock_entity_runtime, parameters)

            self.assertIn("Error changing timezone: Database error", result)

    def test_tool_schema(self):
        """Test that the tool has correct schema properties."""
        self.assertEqual(self.tool.name, "change_timezone")
        self.assertIn("timezone", self.tool.parameters)
        self.assertEqual(self.tool.parameters["timezone"]["type"], "string")


@tag("fast")
class TestAskForHelpTool(TestCase):
    def setUp(self):
        self.tool = AskForHelpTool()

        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = Mock(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="testuser3")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567892", timezone="America/New_York")
        self.entity = Entity.objects.create(name="Test Entity 3", account=self.account, timezone="America/New_York")

        # Create mock entity runtime
        self.mock_entity_runtime = Mock()
        self.mock_entity_runtime.entity = self.entity

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    @patch("entities.adapters.system.send_slack_message")
    def test_execute_success(self, mock_slack):
        """Test successful help request."""
        parameters = {"help": "The student is having trouble with fractions"}

        result = self.tool.execute(self.mock_entity_runtime, parameters)

        # Verify Slack message was sent
        mock_slack.assert_called_once()
        call_args = mock_slack.call_args
        self.assertIn("Asked for help", call_args[0][1])
        self.assertIn("fractions", call_args[0][1])

        self.assertIn("Message sent to support team", result)
        self.assertIn("fractions", result)

    @patch("entities.adapters.system.send_slack_message")
    def test_execute_with_exception(self, mock_slack):
        """Test execution when Slack message fails."""
        mock_slack.side_effect = Exception("Slack API error")
        parameters = {"help": "Need help with calculus"}

        result = self.tool.execute(self.mock_entity_runtime, parameters)

        self.assertIn("Failed to ask for help: Slack API error", result)

    def test_tool_schema(self):
        """Test that the tool has correct schema properties."""
        self.assertEqual(self.tool.name, "ask_for_help")
        self.assertIn("help", self.tool.parameters)
        self.assertEqual(self.tool.parameters["help"]["type"], "string")


@tag("fast")
class TestGetVerificationCodesTool(TestCase):
    def setUp(self):
        self.tool = GetVerificationCodesTool()

        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = Mock(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="testuser_verification")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567893", timezone="America/New_York")
        self.entity = Entity.objects.create(
            name="Test Entity Verification", account=self.account, timezone="America/New_York"
        )

        # Create mock entity runtime
        self.mock_entity_runtime = Mock()
        self.mock_entity_runtime.entity = self.entity

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_no_codes_found(self):
        """Test execution when no verification codes exist."""
        result = self.tool.execute(self.mock_entity_runtime, {})

        self.assertIn("No verification codes found", result)
        self.assertIn("create_verification_code", result)

    def test_execute_returns_valid_codes(self):
        """Test execution returns valid codes from the last hour."""
        # Create a valid verification code
        code = EmailVerificationCode.objects.create(
            account=self.account,
            code="123456",
        )

        result = self.tool.execute(self.mock_entity_runtime, {})

        self.assertIn("123456", result)
        self.assertIn("VALID", result)

    def test_execute_shows_expired_status(self):
        """Test execution shows expired status for old codes."""
        # Create an expired verification code (created more than 10 minutes ago)
        code = EmailVerificationCode.objects.create(
            account=self.account,
            code="654321",
        )
        # Manually set created_at to be expired
        EmailVerificationCode.objects.filter(id=code.id).update(created_at=timezone.now() - timedelta(minutes=15))

        result = self.tool.execute(self.mock_entity_runtime, {})

        self.assertIn("654321", result)
        self.assertIn("EXPIRED", result)

    def test_execute_shows_used_status(self):
        """Test execution shows used status for used codes."""
        # Create a used verification code
        code = EmailVerificationCode.objects.create(
            account=self.account,
            code="111222",
        )
        code.mark_as_used()

        result = self.tool.execute(self.mock_entity_runtime, {})

        self.assertIn("111222", result)
        self.assertIn("USED", result)

    def test_execute_filters_old_codes(self):
        """Test that codes older than 1 hour are not returned."""
        # Create a code from 2 hours ago
        code = EmailVerificationCode.objects.create(
            account=self.account,
            code="999888",
        )
        EmailVerificationCode.objects.filter(id=code.id).update(created_at=timezone.now() - timedelta(hours=2))

        result = self.tool.execute(self.mock_entity_runtime, {})

        self.assertIn("No verification codes found", result)

    def test_execute_returns_multiple_codes(self):
        """Test execution returns multiple codes in order."""
        # Create multiple codes
        EmailVerificationCode.objects.create(account=self.account, code="111111")
        EmailVerificationCode.objects.create(account=self.account, code="222222")
        EmailVerificationCode.objects.create(account=self.account, code="333333")

        result = self.tool.execute(self.mock_entity_runtime, {})

        self.assertIn("111111", result)
        self.assertIn("222222", result)
        self.assertIn("333333", result)

    def test_tool_schema(self):
        """Test that the tool has correct schema properties."""
        self.assertEqual(self.tool.name, "get_verification_codes")
        self.assertEqual(self.tool.parameters, {})


@tag("fast")
class TestCreateVerificationCodeTool(TestCase):
    def setUp(self):
        self.tool = CreateVerificationCodeTool()

        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = Mock(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="testuser_create_code")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567894", timezone="America/New_York")
        self.entity = Entity.objects.create(
            name="Test Entity Create Code", account=self.account, timezone="America/New_York"
        )

        # Create mock entity runtime
        self.mock_entity_runtime = Mock()
        self.mock_entity_runtime.entity = self.entity

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_creates_code(self):
        """Test that execution creates a new verification code."""
        # Ensure no codes exist initially
        self.assertEqual(EmailVerificationCode.objects.filter(account=self.account).count(), 0)

        result = self.tool.execute(self.mock_entity_runtime, {})

        # Verify a code was created
        self.assertEqual(EmailVerificationCode.objects.filter(account=self.account).count(), 1)
        self.assertIn("Created new verification code", result)
        self.assertIn("valid for 10 minutes", result)

    def test_execute_returns_6_digit_code(self):
        """Test that the created code is a 6-digit number."""
        result = self.tool.execute(self.mock_entity_runtime, {})

        # Get the created code from database
        code = EmailVerificationCode.objects.filter(account=self.account).first()
        self.assertIsNotNone(code)
        self.assertEqual(len(code.code), 6)
        self.assertTrue(code.code.isdigit())

        # Verify the code appears in the result
        self.assertIn(code.code, result)

    def test_execute_creates_valid_code(self):
        """Test that the created code is valid (not used, not expired)."""
        self.tool.execute(self.mock_entity_runtime, {})

        code = EmailVerificationCode.objects.filter(account=self.account).first()
        self.assertTrue(code.is_valid())
        self.assertIsNone(code.used_at)
        self.assertFalse(code.is_expired())

    def test_execute_can_create_multiple_codes(self):
        """Test that multiple codes can be created."""
        self.tool.execute(self.mock_entity_runtime, {})
        self.tool.execute(self.mock_entity_runtime, {})
        self.tool.execute(self.mock_entity_runtime, {})

        self.assertEqual(EmailVerificationCode.objects.filter(account=self.account).count(), 3)

    def test_tool_schema(self):
        """Test that the tool has correct schema properties."""
        self.assertEqual(self.tool.name, "create_verification_code")
        self.assertEqual(self.tool.parameters, {})


@tag("fast")
class TestSystemAdapter(TestCase):
    def setUp(self):
        self.adapter = SystemAdapter()

    def test_adapter_properties(self):
        """Test adapter basic properties."""
        self.assertEqual(self.adapter.name, "system")
        self.assertEqual(len(self.adapter.tools), 5)

    def test_adapter_contains_expected_tools(self):
        """Test that adapter contains all expected tools."""
        tool_names = [tool.name for tool in self.adapter.tools]
        expected_tools = [
            "sleep",
            "change_timezone",
            "ask_for_help",
            "get_verification_codes",
            "create_verification_code",
        ]

        for expected_tool in expected_tools:
            self.assertIn(expected_tool, tool_names, f"Tool {expected_tool} not found in adapter")

    def test_all_tools_are_correct_instances(self):
        """Test that all tools are instances of the correct classes."""
        tool_classes = {
            "sleep": SleepTool,
            "change_timezone": ChangeTimezoneTool,
            "ask_for_help": AskForHelpTool,
            "get_verification_codes": GetVerificationCodesTool,
            "create_verification_code": CreateVerificationCodeTool,
        }

        for tool in self.adapter.tools:
            expected_class = tool_classes.get(tool.name)
            self.assertIsNotNone(expected_class, f"Unexpected tool: {tool.name}")
            self.assertIsInstance(tool, expected_class, f"Tool {tool.name} is not instance of {expected_class}")
