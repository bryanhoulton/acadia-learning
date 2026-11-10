"""
Unit tests for accounts app models and functionality.

Tests the email verification and support authentication methods
added to the Account model.
"""

from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from lms.accounts.models import Account, UserProfile


class AccountEmailVerificationTest(TestCase):
    """Test email verification methods on Account model."""

    def setUp(self):
        """Set up test data."""
        # Create test account
        self.phone_number = "+15551234567"
        self.account = Account.objects.create(account_phone=self.phone_number, is_active=True)

        # Create profile with email
        self.test_email = "test@example.com"
        self.profile = UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=self.phone_number,
            email=self.test_email,
            name="Test Parent",
        )

        # Clear cache before each test
        cache.clear()

    def test_has_email_on_file_true(self):
        """Test has_email_on_file returns True when profile has email."""
        self.assertTrue(self.account.has_email_on_file())

    def test_has_email_on_file_false(self):
        """Test has_email_on_file returns False when no profile has email."""
        # Remove email from profile
        self.profile.email = None
        self.profile.save()

        self.assertFalse(self.account.has_email_on_file())

    def test_has_email_on_file_multiple_profiles(self):
        """Test has_email_on_file with multiple profiles."""
        # Create another profile without email (no phone to avoid unique constraint)
        UserProfile.objects.create(
            account=self.account, profile_type=UserProfile.ProfileType.STUDENT, name="Test Student"
        )

        # Should still return True because one profile has email
        self.assertTrue(self.account.has_email_on_file())

    @override_settings(TESTING=True)
    def test_send_email_verification_code_testing_mode(self):
        """Test sending email verification code in testing mode."""
        code = self.account.send_email_verification_code()

        # Should return the code in testing mode
        self.assertIsNotNone(code)
        self.assertEqual(len(code), 6)
        self.assertTrue(code.isdigit())

        # Should be stored in database
        verification_codes = self.account.email_verification_codes.filter(code=code)
        self.assertTrue(verification_codes.exists())
        self.assertTrue(verification_codes.first().is_valid())

    def test_send_email_verification_code_no_email(self):
        """Test sending email verification code when no email on file."""
        # Remove email from profile
        self.profile.email = None
        self.profile.save()

        code = self.account.send_email_verification_code()
        self.assertIsNone(code)

    @patch("api.settings.mail.inboxes.messages.send")
    @patch("utils.emails.get_or_create_inbox")
    def test_send_email_verification_code_success(self, mock_inbox, mock_send):
        """Test successfully sending email verification code."""
        # Mock inbox
        mock_inbox_obj = MagicMock()
        mock_inbox_obj.inbox_id = "test-inbox-id"
        mock_inbox.return_value = mock_inbox_obj

        # Mock email send
        mock_send.return_value = MagicMock()

        with override_settings(TESTING=False):
            code = self.account.send_email_verification_code()

        # Should return code
        self.assertIsNotNone(code)
        self.assertEqual(len(code), 6)
        self.assertTrue(code.isdigit())

        # Should be stored in database
        verification_codes = self.account.email_verification_codes.all()
        self.assertEqual(verification_codes.count(), 1)
        self.assertEqual(verification_codes.first().code, code)
        self.assertTrue(verification_codes.first().is_valid())

        # Should send email
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args.kwargs
        self.assertEqual(call_kwargs["inbox_id"], "test-inbox-id")
        self.assertEqual(call_kwargs["to"], [self.test_email])
        self.assertEqual(call_kwargs["subject"], "Acadia Learning - Verification Code")
        self.assertIn(code, call_kwargs["text"])
        self.assertIn("expire in 10 minutes", call_kwargs["text"])

    @patch("api.settings.mail.inboxes.messages.send")
    @patch("utils.emails.get_or_create_inbox")
    def test_send_email_verification_code_email_failure(self, mock_inbox, mock_send):
        """Test handling email sending failure."""
        # Mock inbox
        mock_inbox_obj = MagicMock()
        mock_inbox_obj.inbox_id = "test-inbox-id"
        mock_inbox.return_value = mock_inbox_obj

        # Mock email send failure
        mock_send.side_effect = Exception("Email service unavailable")

        with override_settings(TESTING=False):
            with patch("logging.getLogger") as mock_logger:
                mock_log_instance = MagicMock()
                mock_logger.return_value = mock_log_instance

                code = self.account.send_email_verification_code()

                # Should return None on failure
                self.assertIsNone(code)

                # Should not have any verification codes in database (cleaned up on failure)
                self.assertEqual(self.account.email_verification_codes.count(), 0)

                # Should log error
                mock_log_instance.error.assert_called()
                error_calls = [call[0][0] for call in mock_log_instance.error.call_args_list]
                self.assertTrue(any("Failed to send email verification code" in call for call in error_calls))

    @override_settings(TESTING=True)
    def test_check_email_verification_code_testing_mode(self):
        """Test checking email verification code in testing mode."""
        from lms.accounts.models import EmailVerificationCode

        # Set up test code in database
        test_code = "123456"
        EmailVerificationCode.objects.create(account=self.account, code=test_code)

        # Should accept correct code
        self.assertTrue(self.account.check_email_verification_code(test_code))

        # Should reject wrong code
        self.assertFalse(self.account.check_email_verification_code("654321"))

        # Should also accept the default test code
        self.assertTrue(self.account.check_email_verification_code("000000"))

    def test_check_email_verification_code_normal_mode(self):
        """Test checking email verification code in normal mode."""
        from lms.accounts.models import EmailVerificationCode

        # Set up test code in database
        test_code = "123456"
        verification_code = EmailVerificationCode.objects.create(account=self.account, code=test_code)

        with override_settings(TESTING=False):
            # Should accept correct code
            self.assertTrue(self.account.check_email_verification_code(test_code))

            # Code should be marked as used
            verification_code.refresh_from_db()
            self.assertIsNotNone(verification_code.used_at)

            # Should reject wrong code
            self.assertFalse(self.account.check_email_verification_code("654321"))

    def test_check_email_verification_code_expired(self):
        """Test checking expired email verification code."""
        with override_settings(TESTING=False):
            # No code in cache (expired)
            self.assertFalse(self.account.check_email_verification_code("123456"))

    def test_check_email_verification_code_whitespace(self):
        """Test checking email verification code with whitespace."""
        from lms.accounts.models import EmailVerificationCode

        test_code = "123456"
        EmailVerificationCode.objects.create(account=self.account, code=test_code)

        with override_settings(TESTING=False):
            # Should handle whitespace (gets stripped)
            self.assertTrue(self.account.check_email_verification_code(" 123456 "))

        # Create another code for the newline test
        EmailVerificationCode.objects.create(account=self.account, code="654321")
        with override_settings(TESTING=False):
            self.assertTrue(self.account.check_email_verification_code("654321\n"))

    def test_email_verification_database_storage(self):
        """Test email verification code database storage."""
        from lms.accounts.models import EmailVerificationCode

        # Create verification code
        test_code = "123456"
        verification_code = EmailVerificationCode.objects.create(account=self.account, code=test_code)

        # Verify it's stored correctly
        self.assertEqual(verification_code.account, self.account)
        self.assertEqual(verification_code.code, test_code)
        self.assertIsNone(verification_code.used_at)
        self.assertTrue(verification_code.is_valid())

    def test_email_verification_code_expiration(self):
        """Test email verification code expiration logic."""
        from lms.accounts.models import EmailVerificationCode
        from django.utils import timezone

        # Create an old verification code
        test_code = "123456"
        old_code = EmailVerificationCode.objects.create(account=self.account, code=test_code)

        # Simulate it being 15 minutes old (expired)
        old_code.created_at = timezone.now() - timezone.timedelta(minutes=15)
        old_code.save()

        with override_settings(TESTING=False):
            # Should reject expired code
            self.assertFalse(self.account.check_email_verification_code(test_code))


class AccountWithoutEmailTest(TestCase):
    """Test Account behavior when no profiles have email addresses."""

    def setUp(self):
        """Set up account without email."""
        self.phone_number = "+15559876543"
        self.account = Account.objects.create(account_phone=self.phone_number, is_active=True)

        # Create profile without email
        UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=self.phone_number,
            name="No Email Parent",
        )

        cache.clear()

    def test_has_email_on_file_false(self):
        """Test has_email_on_file returns False."""
        self.assertFalse(self.account.has_email_on_file())

    def test_send_email_verification_code_returns_none(self):
        """Test send_email_verification_code returns None when no email."""
        code = self.account.send_email_verification_code()
        self.assertIsNone(code)

    def test_check_email_verification_code_always_false(self):
        """Test check_email_verification_code returns False when no email setup."""
        # Even if we manually put something in cache, should still fail
        # because no email was ever sent
        self.assertFalse(self.account.check_email_verification_code("123456"))


class AccountMultipleProfilesTest(TestCase):
    """Test Account behavior with multiple profiles."""

    def setUp(self):
        """Set up account with multiple profiles."""
        self.phone_number = "+15555555555"
        self.account = Account.objects.create(account_phone=self.phone_number, is_active=True)

        # Parent profile with email
        self.parent_email = "parent@example.com"
        UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=self.phone_number,
            email=self.parent_email,
            name="Parent",
        )

        # Student profile without email
        UserProfile.objects.create(
            account=self.account, profile_type=UserProfile.ProfileType.STUDENT, name="Student Child"
        )

        # Another student with email
        self.student_email = "student@example.com"
        UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.STUDENT,
            email=self.student_email,
            name="Student With Email",
        )

        cache.clear()

    def test_has_email_on_file_true_with_multiple_profiles(self):
        """Test has_email_on_file returns True when any profile has email."""
        self.assertTrue(self.account.has_email_on_file())

    @patch("api.settings.mail.inboxes.messages.send")
    @patch("utils.emails.get_or_create_inbox")
    def test_send_email_uses_first_profile_with_email(self, mock_inbox, mock_send):
        """Test that send_email_verification_code uses first profile with email."""
        # Mock inbox
        mock_inbox_obj = MagicMock()
        mock_inbox_obj.inbox_id = "test-inbox-id"
        mock_inbox.return_value = mock_inbox_obj

        # Mock email send
        mock_send.return_value = MagicMock()

        with override_settings(TESTING=False):
            code = self.account.send_email_verification_code()

        self.assertIsNotNone(code)

        # Should send to first profile with email (parent)
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args.kwargs
        self.assertEqual(call_kwargs["to"], [self.parent_email])


class SMSVerificationCodeTest(TestCase):
    """Test SMS verification code methods on Account model."""

    def setUp(self):
        """Set up test data."""
        self.account_phone = "+15551234567"
        self.profile_phone = "+15559999999"
        self.account = Account.objects.create(account_phone=self.account_phone, is_active=True)

        # Create parent profile with a different phone number
        self.parent_profile = UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=self.profile_phone,
            name="Test Parent",
        )

        cache.clear()

    @override_settings(TESTING=True)
    def test_send_verification_code_default_phone(self):
        """Test send_verification_code uses account_phone by default."""
        # In testing mode, it just sets a cache key
        result = self.account.send_verification_code()
        self.assertEqual(result, "000000")

    @override_settings(TESTING=True)
    def test_send_verification_code_custom_phone(self):
        """Test send_verification_code accepts custom phone number."""
        result = self.account.send_verification_code(phone_number=self.profile_phone)
        self.assertEqual(result, "000000")

    @override_settings(TESTING=True)
    def test_check_verification_code_default_phone(self):
        """Test check_verification_code uses account_phone by default."""
        # Send code first
        self.account.send_verification_code()

        # Verify with test code
        result = self.account.check_verification_code("000000")
        self.assertTrue(result)

    @override_settings(TESTING=True)
    def test_check_verification_code_custom_phone(self):
        """Test check_verification_code accepts custom phone number."""
        # Send code to custom phone
        self.account.send_verification_code(phone_number=self.profile_phone)

        # Verify with test code and custom phone
        result = self.account.check_verification_code("000000", phone_number=self.profile_phone)
        self.assertTrue(result)

    @override_settings(TESTING=True)
    def test_check_verification_code_accepts_database_code(self):
        """Test that check_verification_code accepts database codes (for agent-created codes)."""
        from lms.accounts.models import EmailVerificationCode

        # Create a database verification code (like the agent would)
        db_code = "123456"
        EmailVerificationCode.objects.create(account=self.account, code=db_code)

        # Should accept the database code even through the SMS verification path
        result = self.account.check_verification_code(db_code)
        self.assertTrue(result)

        # Code should be marked as used
        verification_code = EmailVerificationCode.objects.get(account=self.account, code=db_code)
        self.assertIsNotNone(verification_code.used_at)

    @override_settings(TESTING=True)
    def test_check_verification_code_database_code_takes_priority(self):
        """Test that database codes are checked before Twilio codes."""
        from lms.accounts.models import EmailVerificationCode

        # Create a database code
        db_code = "999888"
        EmailVerificationCode.objects.create(account=self.account, code=db_code)

        # The database code should work even if it's not the Twilio test code
        result = self.account.check_verification_code(db_code)
        self.assertTrue(result)

    @override_settings(TESTING=True)
    def test_check_verification_code_falls_back_to_twilio(self):
        """Test that check_verification_code falls back to Twilio if no database code."""
        # No database code created, should fall back to test code
        result = self.account.check_verification_code("000000")
        self.assertTrue(result)

        # Wrong code should fail
        result = self.account.check_verification_code("111111")
        self.assertFalse(result)

    @override_settings(TESTING=True)
    def test_check_verification_code_expired_database_code_falls_back(self):
        """Test that expired database codes fall back to Twilio."""
        from lms.accounts.models import EmailVerificationCode
        from django.utils import timezone

        # Create an expired database code
        db_code = "777666"
        verification_code = EmailVerificationCode.objects.create(account=self.account, code=db_code)
        # Make it expired (15 minutes old)
        verification_code.created_at = timezone.now() - timezone.timedelta(minutes=15)
        verification_code.save()

        # Expired database code should not work
        result = self.account.check_verification_code(db_code)
        self.assertFalse(result)

        # But Twilio test code should still work
        result = self.account.check_verification_code("000000")
        self.assertTrue(result)


class SMSVerificationViewTest(TestCase):
    """Test SMS verification API views with profile phone numbers."""

    def setUp(self):
        """Set up test data with account and profile having different phone numbers."""
        self.account_phone = "+15551234567"
        self.parent_profile_phone = "+15559999999"
        self.student_profile_phone = "+15558888888"

        self.account = Account.objects.create(account_phone=self.account_phone, is_active=True)

        # Create parent profile with different phone
        self.parent_profile = UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=self.parent_profile_phone,
            name="Test Parent",
        )

        # Create student profile with different phone
        self.student_profile = UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.STUDENT,
            phone=self.student_profile_phone,
            name="Test Student",
        )

        cache.clear()

    @override_settings(TESTING=True)
    def test_request_verification_code_with_account_phone(self):
        """Test requesting verification code with account's primary phone."""
        from django.test import Client

        client = Client()
        response = client.post(
            "/api/lms/accounts/request-verification-code/",
            data={"phone_number": self.account_phone, "allow_signup": False},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertFalse(data["account_created"])

    @override_settings(TESTING=True)
    def test_request_verification_code_with_parent_profile_phone(self):
        """Test requesting verification code with parent profile's phone number."""
        from django.test import Client

        client = Client()
        response = client.post(
            "/api/lms/accounts/request-verification-code/",
            data={"phone_number": self.parent_profile_phone, "allow_signup": False},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertFalse(data["account_created"])

    @override_settings(TESTING=True)
    def test_request_verification_code_with_student_profile_phone(self):
        """Test requesting verification code with student profile's phone number."""
        from django.test import Client

        client = Client()
        response = client.post(
            "/api/lms/accounts/request-verification-code/",
            data={"phone_number": self.student_profile_phone, "allow_signup": False},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertFalse(data["account_created"])

    @override_settings(TESTING=True)
    def test_verify_code_with_account_phone(self):
        """Test verifying code with account's primary phone."""
        from django.test import Client

        client = Client()

        # Request code first
        client.post(
            "/api/lms/accounts/request-verification-code/",
            data={"phone_number": self.account_phone, "allow_signup": False},
            content_type="application/json",
        )

        # Verify code
        response = client.post(
            "/api/lms/accounts/verify-code/",
            data={"phone_number": self.account_phone, "code": "000000"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access", data)
        self.assertIn("refresh", data)
        self.assertEqual(data["account"]["id"], str(self.account.id))

    @override_settings(TESTING=True)
    def test_verify_code_with_parent_profile_phone(self):
        """Test verifying code with parent profile's phone - should return same account."""
        from django.test import Client

        client = Client()

        # Request code using parent profile phone
        client.post(
            "/api/lms/accounts/request-verification-code/",
            data={"phone_number": self.parent_profile_phone, "allow_signup": False},
            content_type="application/json",
        )

        # Verify code using parent profile phone
        response = client.post(
            "/api/lms/accounts/verify-code/",
            data={"phone_number": self.parent_profile_phone, "code": "000000"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access", data)
        self.assertIn("refresh", data)
        # Should return the same account that the profile belongs to
        self.assertEqual(data["account"]["id"], str(self.account.id))

    @override_settings(TESTING=True)
    def test_verify_code_with_student_profile_phone(self):
        """Test verifying code with student profile's phone - should return same account."""
        from django.test import Client

        client = Client()

        # Request code using student profile phone
        client.post(
            "/api/lms/accounts/request-verification-code/",
            data={"phone_number": self.student_profile_phone, "allow_signup": False},
            content_type="application/json",
        )

        # Verify code using student profile phone
        response = client.post(
            "/api/lms/accounts/verify-code/",
            data={"phone_number": self.student_profile_phone, "code": "000000"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access", data)
        self.assertIn("refresh", data)
        # Should return the same account that the profile belongs to
        self.assertEqual(data["account"]["id"], str(self.account.id))

    @override_settings(TESTING=True)
    def test_request_verification_unknown_phone_no_signup(self):
        """Test requesting verification with unknown phone when signup not allowed."""
        from django.test import Client

        client = Client()
        response = client.post(
            "/api/lms/accounts/request-verification-code/",
            data={"phone_number": "+15550000000", "allow_signup": False},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertFalse(data["success"])

    @override_settings(TESTING=True)
    def test_verify_code_unknown_phone(self):
        """Test verifying code with unknown phone number fails."""
        from django.test import Client

        client = Client()
        response = client.post(
            "/api/lms/accounts/verify-code/",
            data={"phone_number": "+15550000000", "code": "000000"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertFalse(data["success"])
