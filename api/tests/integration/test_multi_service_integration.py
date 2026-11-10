"""
Refactored Multi-Service Integration Test

This is an example of how the original test_multi_service_integration.py
can be simplified using the new service management utilities.

Compare this file with test_multi_service_integration.py to see the benefits:
- Much less boilerplate code
- Automatic service management and cleanup
- Reusable test data setup
- Better separation of concerns
- Easier to maintain and extend

NOTE: Most tests in this file are currently skipped because the Lesson and Room
models have been removed from the codebase. These tests were designed to test
room-based lesson functionality that no longer exists.
"""

import logging
import os
import time
import unittest

from django.db import connection

from tests.integration.utils import BrowserTestHelper, FullStackIntegrationTest, create_complete_test_setup

logger = logging.getLogger("utils")


@unittest.skip("Lesson and Room models have been removed - these tests need to be redesigned")
class RefactoredMultiServiceIntegrationTest(FullStackIntegrationTest):
    """
    Refactored version of the multi-service integration test.

    This demonstrates how the new utilities dramatically simplify
    integration test setup and cleanup.

    NOTE: Currently skipped because Lesson and Room models have been removed.
    """

    def setUp(self):
        """Set up test with automatic service management."""
        super().setUp()

        # Create all test data with a single function call
        self.test_data = create_complete_test_setup()

        # Extract commonly used objects for convenience
        self.entity = self.test_data["entity"]
        self.student = self.test_data["student"]
        self.lesson = self.test_data["lesson"]

        # Commit transaction so services can see the data

        connection.commit()

        logger.info(
            f"🔧 Test setup complete - Entity {self.entity.id}, "
            f"Room {self.lesson.room_code}, API key {self.entity.api_key}"
        )

    def test_debug_login_page(self):
        """
        Debug test to see what's actually rendered on the login page.
        """
        logger.info("\n🔍 Debug: Login page elements")

        # Verify services are running
        self.assertTrue(self.service_manager.is_service_running("api"))
        self.assertTrue(self.service_manager.is_service_running("portal"))

        # Create browser in headless mode
        driver = self.create_browser(headless=True)
        helper = BrowserTestHelper(driver)

        portal_url = self.get_portal_url()
        login_url = f"{portal_url}/login"

        logger.info(f"🌐 Navigating to: {login_url}")
        driver.get(login_url)

        # Wait for page to load
        import time

        time.sleep(5)

        # Take screenshot
        helper.take_screenshot("logs/debug_login_page.png")

        # Debug: Find all input elements
        inputs = driver.find_elements("css selector", "input")
        logger.info(f"🔍 Found {len(inputs)} input elements:")
        for i, inp in enumerate(inputs):
            logger.info(
                f"  Input {i}: type={inp.get_attribute('type')}, placeholder={inp.get_attribute('placeholder')}"
            )
            logger.info(f"    data-testid={inp.get_attribute('data-testid')}, class={inp.get_attribute('class')}")

        # Debug: Find all buttons
        buttons = driver.find_elements("css selector", "button")
        logger.info(f"🔍 Found {len(buttons)} button elements:")
        for i, btn in enumerate(buttons):
            logger.info(f"  Button {i}: text='{btn.text}', data-testid={btn.get_attribute('data-testid')}")
            logger.info(f"    class={btn.get_attribute('class')}")

        # Try to login with more basic selectors
        try:
            # Find email input by type and placeholder
            email_input = None
            for inp in inputs:
                if inp.get_attribute("type") == "email" or "email" in (inp.get_attribute("placeholder") or "").lower():
                    email_input = inp
                    break

            if email_input:
                logger.info("✅ Found email input using basic selectors")
                email_input.clear()
                email_input.send_keys(self.student.email)
                logger.info(f"✅ Entered email: {self.student.email}")

                # Find password input
                password_input = None
                for inp in inputs:
                    if (
                        inp.get_attribute("type") == "password"
                        or "password" in (inp.get_attribute("placeholder") or "").lower()
                    ):
                        password_input = inp
                        break

                if password_input:
                    logger.info("✅ Found password input using basic selectors")
                    password_input.clear()
                    password_input.send_keys("testpass123")
                    logger.info("✅ Entered password")

                    # Find login button
                    login_button = None
                    for btn in buttons:
                        if "sign in" in btn.text.lower():
                            login_button = btn
                            break

                    if login_button:
                        logger.info("✅ Found login button using basic selectors")
                        helper.take_screenshot("logs/debug_before_login.png")
                        login_button.click()
                        logger.info("✅ Clicked login button")

                        # Wait for redirect
                        time.sleep(5)
                        helper.take_screenshot("logs/debug_after_login.png")
                        logger.info(f"🔍 After login URL: {driver.current_url}")

                    else:
                        logger.error("❌ Could not find login button")
                else:
                    logger.error("❌ Could not find password input")
            else:
                logger.error("❌ Could not find email input")

        except Exception as e:
            logger.error(f"❌ Debug test failed: {e}")

        # Keep browser open for manual inspection
        time.sleep(10)
        helper.leave_room()

    def test_browser_authentication_flow(self):
        """
        Test the new browser authentication flow for room joining.

        This test verifies that unauthenticated users are properly redirected
        to login when accessing rooms, and that authentication works correctly.
        """
        logger.info("\n🚀 Starting Browser Authentication Flow Test")
        logger.info(f"Testing with room code: {self.lesson.room_code}")
        logger.info(f"Student email: {self.student.email}")
        logger.info("=" * 60)

        # === VERIFY SERVICES ARE RUNNING ===

        self.assertTrue(self.service_manager.is_service_running("api"))
        self.assertTrue(self.service_manager.is_service_running("portal"))
        logger.info("✅ Required services are running")

        # === TEST BROWSER AUTHENTICATION FLOW ===

        # Create browser in headless mode
        driver = self.create_browser(headless=True)
        helper = BrowserTestHelper(driver)

        portal_url = self.get_portal_url()
        if not portal_url:
            self.fail("Portal URL is not available")

        logger.info(f"🌐 Portal URL: {portal_url}")

        # Test the new authentication flow
        success = helper.authenticate_and_join_room(
            portal_url=portal_url or "",
            room_code=self.lesson.room_code,
            username=self.student.email,
            password="testpass123",  # Default password from test data setup
            display_name="Test Student",
        )

        self.assertTrue(success, "Should successfully authenticate and join room")
        logger.info("✅ Authentication and room join successful")

        # Take a screenshot for verification
        helper.take_screenshot("logs/authenticated_room_join.png")

        # Wait a moment to see the room in action
        helper.wait_in_room(10)

        # === VERIFY ENTITY STATE ===

        self.entity.refresh_from_db()
        logger.info(f"🔍 Entity on_call after join: {self.entity.on_call}")

        # Leave room
        logger.info("🚪 Leaving room...")
        helper.leave_room()

        logger.info("🎉 Browser Authentication Flow Test completed successfully!")

    def test_agent_api_communication_refactored(self):
        """
        Test agent to API communication.

        This test is functionally identical to the original but uses
        far less code and is much easier to understand.
        """
        logger.info("\n🚀 Starting Refactored Multi-Service Integration Test")
        logger.info(f"Entity ID: {self.entity.id}")
        logger.info("=" * 60)

        # === VERIFY SERVICES ARE RUNNING ===

        # All services are automatically started by FullStackIntegrationTest
        self.assertTrue(self.service_manager.is_service_running("api"))
        self.assertTrue(self.service_manager.is_service_running("celery"))
        self.assertTrue(self.service_manager.is_service_running("agent"))
        self.assertTrue(self.service_manager.is_service_running("portal"))

        logger.info("✅ All services are running")

        # === TEST BROWSER INTERACTION ===

        # Create browser and helper with automatic cleanup
        driver = self.create_browser(headless=True)
        helper = BrowserTestHelper(driver)

        # Verify initial entity state
        self.entity.refresh_from_db()
        initial_on_call = self.entity.on_call
        logger.info(f"🔍 Initial entity on_call: {initial_on_call}")

        # Authenticate and join room via portal
        portal_url = self.get_portal_url()
        if not portal_url:
            self.fail("Portal URL is not available")

        success = helper.authenticate_and_join_room(
            portal_url=portal_url,
            room_code=self.lesson.room_code,
            username=self.student.email,
            password="testpass123",  # Default password from test data setup
            display_name="Test User",
        )
        self.assertTrue(success, "Should successfully authenticate and join room")

        # Wait for agent to join and interact
        logger.info("⏳ Waiting for agent-portal interaction...")
        wait_time = 20 if not os.environ.get("CI") else 40
        time.sleep(wait_time)

        # === VERIFY AGENT JOINED ===

        # Check that entity is on call
        self.entity.refresh_from_db()
        logger.info(f"🔍 After join - entity on_call: {self.entity.on_call}")
        self.assertTrue(self.entity.on_call, "Entity should be on call after agent joins")
        logger.info("✅ Agent successfully joined and entity is on call")

        # === SIMULATE USER LEAVING ===

        # Leave room by closing browser
        logger.info("🔄 Simulating user leaving room...")
        helper.leave_room()  # This quits the driver

        # Wait for agent to detect user left and clean up
        logger.info("⏳ Waiting for agent to detect user left and clean up...")
        time.sleep(30)  # Increased from 15 to 30 seconds to allow agent cleanup

        # === VERIFY DATABASE STATE CHANGES ===

        logger.info("\n🔍 Verifying database state changes...")

        # Check entity state changes
        self.entity.refresh_from_db()
        logger.info(f"🔍 Final entity on_call: {self.entity.on_call}")
        logger.info(f"🔍 Entity sleep_until: {self.entity.sleep_until}")

        # If entity is still on call, print agent logs to debug
        if self.entity.on_call:
            logger.error("❌ Entity is still on call after user left - printing agent logs:")
            try:
                agent_log_path = os.path.join(os.path.dirname(__file__), "../../../agent/agent_test_output.log")
                if os.path.exists(agent_log_path):
                    with open(agent_log_path, "r") as f:
                        agent_logs = f.read()
                        logger.error(f"Agent logs:\n{agent_logs}")
                else:
                    logger.error("Agent log file not found at: " + agent_log_path)
            except Exception as e:
                logger.error(f"Error reading agent logs: {e}")

            # Also check if agent service is still running
            if hasattr(self, "service_manager") and self.service_manager.is_service_running("agent"):
                logger.error("Agent service is still running")
            else:
                logger.error("Agent service is not running")

        # Verify entity is no longer on call
        self.assertFalse(self.entity.on_call, "Entity should not be on call after user leaves")
        logger.info("✅ Entity correctly marked as not on call")

        # === VERIFY MEMORY MANAGEMENT ===

        # Poll for memory to be enshrined (up to 10 attempts)
        enshrined = False
        for attempt in range(10):
            self.entity.refresh_from_db()
            drm = self.entity.get_drm()
            stm = drm.get_stm()
            logger.info(f"🔍 STM length (attempt {attempt + 1}/10): {len(stm)}")

            if len(stm) == 0:
                logger.info(f"✅ STM cleared after {attempt + 1} attempts")
                self.assertGreater(len(drm.direct_interactions), 0, "Should have direct interactions")
                enshrined = True
                break

            if attempt < 9:  # Don't sleep on last attempt
                time.sleep(10)

        if not enshrined:
            self.fail("❌ Memory was not enshrined within timeout")

        logger.info("✅ Memory correctly enshrined")

        # === VERIFY EVENT TRACKING ===

        # Check lesson event tracking
        self.lesson.refresh_from_db()
        logger.info(f"🔍 Lesson student_joined_at: {self.lesson.student_joined_at}")
        logger.info(f"🔍 Lesson student_left_at: {self.lesson.student_left_at}")

        self.assertIsNotNone(self.lesson.student_joined_at, "Lesson should record when student joined")
        self.assertIsNotNone(self.lesson.student_left_at, "Lesson should record when student left")
        logger.info("✅ Lesson correctly tracked join/leave events")

        # === TEST COMPLETE ===

        logger.info("\n🎉 Refactored Multi-Service Integration Test completed!")
        logger.info("All verifications passed successfully.")
        logger.info("Services will be automatically cleaned up by tearDown.")
