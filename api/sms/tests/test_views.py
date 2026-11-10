from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from lms.accounts.models import Account, UserProfile


class TwilioWebhookAccountPhoneTest(TestCase):
    """Test that phone numbers matching account_phone are assigned to parent profiles"""

    def setUp(self):
        # Create a user and account with a phone number
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15551234567",
            zip_code="12345",
        )

        # Create a parent profile WITHOUT a phone number
        self.parent_profile = UserProfile.objects.create(
            account=self.account,
            name="Test Parent",
            profile_type=UserProfile.ProfileType.PARENT,
            phone=None,  # No phone number yet
        )

        # Create a student profile
        self.student_profile = UserProfile.objects.create(
            account=self.account,
            name="Test Student",
            profile_type=UserProfile.ProfileType.STUDENT,
            phone="+15559999999",  # Already has a phone
        )

    @patch("sms.views.possibly_run_entity")
    @patch("sms.views.send_slack_message")
    @patch("sms.views.track_inbound_sms")
    def test_account_phone_assigned_to_parent_profile(self, mock_track, mock_slack, mock_entity):
        """Test that SMS from account_phone gets assigned to parent profile without phone"""

        # Create an entity for this account
        from entities.models import Entity

        entity = Entity.objects.create(
            account=self.account,
        )

        # Send SMS from the account phone number (which is not yet on any profile)
        response = self.client.post(
            reverse("twilio_webhook"),
            data={
                "From": "+15551234567",  # This matches account_phone
                "Body": "Hello, this is a test message",
                "MessageSid": "test_sid_123",
                "NumMedia": "0",
            },
        )

        # Check that response is successful
        self.assertEqual(response.status_code, 200)

        # Verify that the parent profile now has the phone number assigned
        self.parent_profile.refresh_from_db()
        self.assertEqual(self.parent_profile.phone, "+15551234567")

        # Verify Slack notification was sent about the assignment
        slack_calls = [call[0] for call in mock_slack.call_args_list]
        assignment_messages = [call for call in slack_calls if "Auto-assigned phone" in str(call)]
        self.assertTrue(len(assignment_messages) > 0)

        # Verify entity was woken up for processing
        mock_entity.assert_called_once_with(entity.id, wakeup=True)

    @patch("sms.views.send_slack_message")
    def test_account_phone_no_available_parent(self, mock_slack):
        """Test behavior when account_phone matches but no parent profile is available"""

        # Assign phone to the parent profile so it's not available
        self.parent_profile.phone = "+15559876543"
        self.parent_profile.save()

        # Send SMS from the account phone number
        response = self.client.post(
            reverse("twilio_webhook"),
            data={
                "From": "+15551234567",  # This matches account_phone
                "Body": "Hello, this is a test message",
                "MessageSid": "test_sid_123",
                "NumMedia": "0",
            },
        )

        # Check that response is successful
        self.assertEqual(response.status_code, 200)

        # Verify that the parent profile's phone was NOT changed
        self.parent_profile.refresh_from_db()
        self.assertEqual(self.parent_profile.phone, "+15559876543")

        # Verify Slack notification was sent about no available parent
        slack_calls = [call[0] for call in mock_slack.call_args_list]
        no_parent_messages = [call for call in slack_calls if "no parent profile available" in str(call)]
        self.assertTrue(len(no_parent_messages) > 0)

    @patch("sms.views.send_slack_message")
    def test_account_phone_with_empty_string_phone(self, mock_slack):
        """Test that parent profiles with empty string phone are also considered"""

        # Create an entity for this account
        from entities.models import Entity

        Entity.objects.create(account=self.account)

        # Set parent profile phone to empty string instead of None
        self.parent_profile.phone = ""
        self.parent_profile.save()

        # Send SMS from the account phone number
        response = self.client.post(
            reverse("twilio_webhook"),
            data={
                "From": "+15551234567",  # This matches account_phone
                "Body": "Hello, this is a test message",
                "MessageSid": "test_sid_123",
                "NumMedia": "0",
            },
        )

        # Check that response is successful
        self.assertEqual(response.status_code, 200)

        # Verify that the parent profile now has the phone number assigned
        self.parent_profile.refresh_from_db()
        self.assertEqual(self.parent_profile.phone, "+15551234567")

    @patch("sms.views.send_slack_message")
    @patch("sms.views.track_inbound_sms")
    def test_no_account_match_creates_new_account(self, mock_track, mock_slack):
        """Test that unrecognized numbers get a new account created"""

        # Send SMS from a completely unrecognized number
        response = self.client.post(
            reverse("twilio_webhook"),
            data={
                "From": "+15559999888",  # Does not match any account or profile
                "Body": "Hello, this is a test message",
                "MessageSid": "test_sid_123",
                "NumMedia": "0",
            },
        )

        # Check that response is successful
        self.assertEqual(response.status_code, 200)

        # Verify that a new account was created for this phone number
        new_account = Account.objects.filter(account_phone="+15559999888").first()
        self.assertIsNotNone(new_account)
        self.assertEqual(new_account.registration_source, "mobile")

        # Verify that a parent profile was created with the phone number
        parent_profile = UserProfile.objects.filter(
            account=new_account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone="+15559999888",
        ).first()
        self.assertIsNotNone(parent_profile)

    def test_existing_profile_phone_match_works_normally(self):
        """Test that existing profile phone matching still works as before"""

        # Create an entity for this account
        from entities.models import Entity

        entity = Entity.objects.create(account=self.account)

        # Send SMS from the student's phone (which already has a profile with phone)
        with (
            patch("sms.views.possibly_run_entity") as mock_entity,
            patch("sms.views.send_slack_message"),
            patch("sms.views.track_inbound_sms"),
        ):
            response = self.client.post(
                reverse("twilio_webhook"),
                data={
                    "From": "+15559999999",  # This matches student_profile.phone
                    "Body": "Hello from student",
                    "MessageSid": "test_sid_456",
                    "NumMedia": "0",
                },
            )

            # Check that response is successful
            self.assertEqual(response.status_code, 200)

            # Verify entity was woken up
            mock_entity.assert_called_once_with(entity.id, wakeup=True)

            # Verify parent profile phone was NOT modified
            self.parent_profile.refresh_from_db()
            self.assertIsNone(self.parent_profile.phone)
