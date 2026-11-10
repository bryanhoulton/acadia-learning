"""
Integration tests for email verification and support authentication flows.

Tests the complete flow of alternative authentication methods when SMS OTP is delayed:
1. Email verification as backup authentication
2. Support-assisted authentication
3. Frontend integration with browser tests
"""

import logging
import time
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.db import connection
from django.test import override_settings, tag
from rest_framework.test import APIClient
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from lms.accounts.models import Account, EmailVerificationCode, UserProfile
from tests.integration.utils import BrowserIntegrationTest, MultiServiceIntegrationTest
from utils.slack import SlackChannel

logger = logging.getLogger("utils")


@tag("integration")
@override_settings(CELERY_ALWAYS_EAGER=True)
class EmailVerificationAPITest(MultiServiceIntegrationTest):
    """Test email verification API endpoints without browser."""

    AUTO_START_API = True
    AUTO_START_CELERY = False
    AUTO_START_AGENT = False
    AUTO_START_PORTAL = False

    def setUp(self):
        """Set up test data and API client."""
        super().setUp()

        # Create test account with email
        self.phone_number = "+15551234567"
        self.test_email = "test@example.com"

        # Create account
        self.account = Account.objects.create(account_phone=self.phone_number, is_active=True)

        # Create profile with email
        self.profile = UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=self.phone_number,
            email=self.test_email,
            name="Test Parent",
        )

        # Create account without email for negative tests
        self.no_email_phone = "+15559876543"
        self.no_email_account = Account.objects.create(account_phone=self.no_email_phone, is_active=True)

        UserProfile.objects.create(
            account=self.no_email_account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=self.no_email_phone,
            name="No Email Parent",
        )

        # Commit so API server can see the data
        connection.commit()

        # API client for making requests
        self.client = APIClient()

        # Clear cache before each test
        cache.clear()

    def test_request_email_verification_code_success(self):
        """Test successfully requesting email verification code."""
        logger.info("🧪 Testing email verification code request - success case")

        response = self.client.post(
            "/api/lms/accounts/request-email-verification-code/", {"phone_number": self.phone_number}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertEqual(response.data["message"], "Email verification code sent")

        # Verify code was stored in database (in test mode, it uses db not email)
        verification_code = EmailVerificationCode.objects.filter(account=self.account).first()
        self.assertIsNotNone(verification_code)
        self.assertEqual(len(verification_code.code), 6)
        self.assertTrue(verification_code.code.isdigit())

    def test_request_email_verification_code_no_email(self):
        """Test requesting email verification when account has no email."""
        logger.info("🧪 Testing email verification code request - no email case")

        response = self.client.post(
            "/api/lms/accounts/request-email-verification-code/", {"phone_number": self.no_email_phone}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["message"], "No email address on file for this account")

    def test_request_email_verification_code_account_not_found(self):
        """Test requesting email verification for non-existent account."""
        logger.info("🧪 Testing email verification code request - account not found")

        response = self.client.post(
            "/api/lms/accounts/request-email-verification-code/", {"phone_number": "+15550000000"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["message"], "Account not found")

    def test_verify_email_code_success(self):
        """Test successfully verifying email code."""
        logger.info("🧪 Testing email code verification - success case")

        # First, set up a verification code in the database
        test_code = "123456"
        EmailVerificationCode.objects.create(account=self.account, code=test_code)

        response = self.client.post(
            "/api/lms/accounts/verify-email-code/",
            {"phone_number": self.phone_number, "code": test_code},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("account", response.data)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

        # Verify account data
        account_data = response.data["account"]
        self.assertEqual(account_data["account_phone"], self.phone_number)
        self.assertEqual(len(account_data["profiles"]), 1)

    def test_verify_email_code_invalid(self):
        """Test verifying invalid email code."""
        logger.info("🧪 Testing email code verification - invalid code")

        # Set up a code in the database
        EmailVerificationCode.objects.create(account=self.account, code="123456")

        response = self.client.post(
            "/api/lms/accounts/verify-email-code/",
            {
                "phone_number": self.phone_number,
                "code": "654321",  # Wrong code
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["message"], "Invalid or expired code")

    def test_verify_email_code_expired(self):
        """Test verifying expired email code."""
        logger.info("🧪 Testing email code verification - expired code")

        response = self.client.post(
            "/api/lms/accounts/verify-email-code/",
            {
                "phone_number": self.phone_number,
                "code": "123456",  # No code in cache
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["message"], "Invalid or expired code")

    @patch("lms.accounts.views.send_slack_message")
    def test_request_support_auth_success(self, mock_slack):
        """Test successfully requesting support authentication."""
        logger.info("🧪 Testing support auth request - success case")

        response = self.client.post(
            "/api/lms/accounts/request-support-auth/", {"phone_number": self.phone_number}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertIn("Support request sent", response.data["message"])
        self.assertEqual(response.data["support_email"], "bryan@acadialearning.org")
        self.assertIn("support_token", response.data)

        # Verify support token format
        support_token = response.data["support_token"]
        self.assertEqual(len(support_token), 8)
        self.assertTrue(support_token.isupper())

        # Verify Slack notification was sent
        mock_slack.assert_called_once()
        call_args = mock_slack.call_args
        self.assertEqual(call_args[0][0], SlackChannel.SIGNUPS)
        message = call_args[0][1]
        self.assertIn("🔐 Authentication help requested", message)
        self.assertIn(self.phone_number, message)
        self.assertIn(str(self.account.id), message)
        self.assertIn(support_token, message)

        # Verify support token was cached
        cached_token = cache.get(f"support_auth:{self.phone_number}")
        self.assertEqual(cached_token, support_token)

    def test_request_support_auth_account_not_found(self):
        """Test requesting support auth for non-existent account."""
        logger.info("🧪 Testing support auth request - account not found")

        response = self.client.post(
            "/api/lms/accounts/request-support-auth/", {"phone_number": "+15550000000"}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(response.data["message"], "Account not found")


@tag("integration")
@override_settings(CELERY_ALWAYS_EAGER=True)
class EmailVerificationBrowserTest(BrowserIntegrationTest):
    """Test email verification flow with browser automation."""

    AUTO_START_API = True
    AUTO_START_CELERY = False
    AUTO_START_AGENT = False
    AUTO_START_PORTAL = True

    def setUp(self):
        """Set up test data for browser testing."""
        super().setUp()

        # Create test account with email
        self.phone_number = "+15551234567"
        self.display_phone = "5551234567"  # How it appears in UI
        self.test_email = "test@example.com"

        # Create account
        self.account = Account.objects.create(account_phone=self.phone_number, is_active=True)

        # Create profile with email
        self.profile = UserProfile.objects.create(
            account=self.account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=self.phone_number,
            email=self.test_email,
            name="Test Parent",
        )

        # Commit so services can see the data
        connection.commit()

        # Clear cache
        cache.clear()

    def test_sms_to_email_fallback_flow(self):
        """Test complete flow from SMS failure to email verification."""
        logger.info("🧪 Testing SMS to email fallback flow")

        portal_url = self.get_portal_url()
        self.assertIsNotNone(portal_url, "Portal should be running")

        driver = self.create_browser(headless=True)
        wait = WebDriverWait(driver, 15)

        try:
            # Navigate to login page
            driver.get(f"{portal_url}/login")
            logger.info(f"📱 Navigated to login page: {portal_url}/login")

            # Enter phone number
            phone_input = wait.until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "input[placeholder='(555) 123-4567']"))
            )
            phone_input.clear()
            phone_input.send_keys(self.display_phone)
            logger.info(f"📞 Entered phone number: {self.display_phone}")

            # Click send verification code
            send_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='login-button']")))
            send_button.click()
            logger.info("📤 Clicked send verification code")

            # Wait for verification code screen (use body to avoid issues with multiple p tags)
            wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Enter the code sent to your phone"))
            logger.info("📱 Reached verification code screen")

            # Simulate failed SMS attempts by entering wrong code twice
            for attempt in range(2):
                logger.info(f"🔢 Attempt {attempt + 1}: Entering wrong code")

                # Find verification code input (single input field)
                code_input = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "input[name='one-time-code']")))

                # Enter wrong code
                code_input.clear()
                code_input.send_keys("999999")

                # Wait for error message
                wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Invalid code"))
                logger.info("❌ Got expected error message")

            # After 2 failures, alternative options should appear
            logger.info("🔍 Looking for alternative authentication options")

            email_button = wait.until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Send code to email instead')]"))
            )
            self.assertTrue(email_button.is_displayed(), "Email option should be visible after 2 failures")
            logger.info("📧 Email verification option appeared")

            # Mock email sending for the test
            with patch("api.settings.mail.inboxes.messages.send") as mock_send:
                mock_send.return_value = MagicMock()

                # Click email verification
                email_button.click()
                logger.info("📧 Clicked email verification option")

                # Wait for success message
                wait.until(
                    EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Verification code sent to your email")
                )
                logger.info("✅ Got email sent confirmation")

                # Verify the UI updated to show email instructions
                wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Enter the code sent to your email"))
                logger.info("📧 UI updated to show email instructions")

            # Get the verification code from database (simulating user getting it from email)
            # Refresh the database connection to ensure we see the API server's writes
            connection.close()
            verification_code = (
                EmailVerificationCode.objects.filter(account=self.account).order_by("-created_at").first()
            )
            self.assertIsNotNone(verification_code, "Email verification code should be in database")
            email_code = verification_code.code
            logger.info(f"🔑 Retrieved email verification code: {email_code}")

            # IMPORTANT: Add delay to ensure React has fully re-rendered with emailCodeSent=true
            # The onComplete callback checks emailCodeSent to decide which endpoint to call
            # Without this delay, the stale closure might still have emailCodeSent=false
            time.sleep(0.5)

            # Enter the email verification code
            # Wait for the input to be clickable (UI may still be updating)
            code_input = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "input[name='one-time-code']")))

            # Use same approach as wrong code entry - clear then type
            code_input.clear()
            time.sleep(0.1)  # Small delay between clear and type
            code_input.send_keys(email_code)
            logger.info(f"📧 Entered email verification code: {email_code}")

            # Log the current input value for debugging
            input_value = code_input.get_attribute("value")
            logger.info(f"📝 Input value after typing: '{input_value}' (expected: '{email_code}')")

            # The onComplete callback fires automatically when 6 digits are entered
            # which calls verifyEmailCode() - no need to click submit button

            # Wait for successful auth - either "Signing you in" briefly shows
            # OR we get redirected to the post-login page
            # The "Signing you in" screen only shows for 1.5 seconds before redirect
            long_wait = WebDriverWait(driver, 30)
            try:
                # Check for either the signing in screen OR successful redirect
                long_wait.until(
                    lambda d: "Signing you in" in d.page_source
                    or "One last step" in d.page_source  # Post-login onboarding page
                    or "Dashboard" in d.page_source  # Existing user redirect
                    or "/login" not in d.current_url  # No longer on login page
                )
                logger.info("✅ Successfully authenticated via email verification")
                logger.info(f"📍 Current URL: {driver.current_url}")
            except Exception as wait_error:
                # Log debugging info if we timeout
                logger.error("❌ Timeout waiting for successful auth. Current page source snippet:")
                logger.error(driver.page_source[:2000])
                logger.error(f"📍 Current URL: {driver.current_url}")
                # Check for any error toasts or messages
                if "Invalid" in driver.page_source:
                    logger.error("⚠️ 'Invalid' found in page - verification may have failed")
                if "error" in driver.page_source.lower():
                    logger.error("⚠️ Possible error message detected in page source")
                # Log network/console errors if available
                try:
                    logs = driver.get_log("browser")
                    if logs:
                        logger.error(f"🔍 Browser console logs: {logs}")
                except Exception:
                    pass
                raise wait_error

            # Verify we're no longer on the login page (indicates successful auth)
            self.assertNotIn("/login", driver.current_url, "Should have navigated away from login page")

        except Exception as e:
            # Take screenshot on failure for debugging
            screenshot_path = "logs/email_verification_test_failure.png"
            driver.save_screenshot(screenshot_path)
            logger.error(f"❌ Test failed, screenshot saved to {screenshot_path}")
            # Also log the page source for debugging
            logger.error(f"📄 Page source at failure:\n{driver.page_source[:3000]}")
            raise e

    def test_support_request_flow(self):
        """Test support authentication request flow."""
        logger.info("🧪 Testing support request flow")

        portal_url = self.get_portal_url()
        self.assertIsNotNone(portal_url, "Portal should be running")

        driver = self.create_browser(headless=True)
        wait = WebDriverWait(driver, 15)

        try:
            # Navigate to login page
            driver.get(f"{portal_url}/login")

            # Enter phone number and request SMS code
            phone_input = wait.until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "input[placeholder='(555) 123-4567']"))
            )
            phone_input.clear()
            phone_input.send_keys(self.display_phone)

            send_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='login-button']")))
            send_button.click()

            # Wait for verification screen
            wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Enter the code sent to your phone"))

            # Fail SMS verification twice to show alternatives
            for attempt in range(2):
                code_input = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "input[name='one-time-code']")))
                code_input.clear()
                code_input.send_keys("999999")

                wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Invalid code"))

            # Click support option
            # Note: Cannot mock Slack in separate API process, so we just verify UI flow
            support_button = wait.until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Contact support for help')]"))
            )
            support_button.click()
            logger.info("💬 Clicked support request option")

            # Wait for success message
            wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Support request sent"))
            logger.info("✅ Got support request confirmation")

            # Should show support screen
            wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Support Requested"))

            # Should show contact information
            wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "bryan@acadialearning.org"))
            logger.info("📧 Support contact information displayed")

            # Should have try again button
            try_again_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Try Again')]")
            self.assertTrue(try_again_button.is_displayed())
            logger.info("🔄 Try again button is available")

        except Exception as e:
            screenshot_path = "logs/support_request_test_failure.png"
            driver.save_screenshot(screenshot_path)
            logger.error(f"❌ Test failed, screenshot saved to {screenshot_path}")
            raise e

    def test_email_verification_without_email_on_file(self):
        """Test email verification when user has no email address."""
        logger.info("🧪 Testing email verification without email on file")

        # Create account without email
        no_email_phone = "+15559876543"
        no_email_account = Account.objects.create(account_phone=no_email_phone, is_active=True)
        UserProfile.objects.create(
            account=no_email_account,
            profile_type=UserProfile.ProfileType.PARENT,
            phone=no_email_phone,
            name="No Email Parent",
        )
        connection.commit()

        portal_url = self.get_portal_url()
        driver = self.create_browser(headless=True)
        wait = WebDriverWait(driver, 15)

        try:
            # Navigate to login and get to verification screen
            driver.get(f"{portal_url}/login")

            phone_input = wait.until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "input[placeholder='(555) 123-4567']"))
            )
            phone_input.clear()
            phone_input.send_keys("5559876543")  # Display format (10 digits for US)

            send_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='login-button']")))
            send_button.click()

            # Fail SMS twice to show alternatives
            wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Enter the code sent to your phone"))

            for attempt in range(2):
                code_input = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "input[name='one-time-code']")))
                code_input.clear()
                code_input.send_keys("999999")

                wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "Invalid code"))

            # Try to click email option
            email_button = wait.until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Send code to email instead')]"))
            )
            email_button.click()

            # Should get error message about no email
            wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), "No email address on file"))
            logger.info("❌ Got expected 'no email' error message")

        except Exception as e:
            screenshot_path = "logs/no_email_test_failure.png"
            driver.save_screenshot(screenshot_path)
            logger.error(f"❌ Test failed, screenshot saved to {screenshot_path}")
            raise e
