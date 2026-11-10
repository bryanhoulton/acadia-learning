"""
Browser utilities for integration tests.

Provides standardized Chrome/Selenium setup for UI testing with proper
configuration for both local development and CI environments.
"""

import logging
import os
import time
from typing import Optional

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
    from webdriver_manager.chrome import ChromeDriverManager

    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

logger = logging.getLogger("utils")


def get_chrome_options(headless: bool = True) -> "webdriver.ChromeOptions":
    """
    Get Chrome options configured for integration testing.

    Args:
        headless: Whether to run in headless mode

    Returns:
        Configured ChromeOptions instance

    Raises:
        ImportError: If selenium is not available
    """
    if not SELENIUM_AVAILABLE:
        raise ImportError(
            "Selenium and webdriver-manager are required for browser tests. "
            "Install with: pip install selenium webdriver-manager"
        )

    options = webdriver.ChromeOptions()

    # Basic options
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")

    # Media stream options for WebRTC testing
    options.add_argument("--use-fake-ui-for-media-stream")
    options.add_argument("--use-fake-device-for-media-stream")
    options.add_argument("--allow-running-insecure-content")
    options.add_argument("--disable-web-security")
    options.add_argument("--disable-features=VizDisplayCompositor")

    # Headless mode
    if headless or os.environ.get("CI"):
        options.add_argument("--headless")

    # Additional CI-specific options for stability
    if os.environ.get("CI"):
        ci_options = [
            "--disable-extensions",
            "--disable-plugins",
            "--disable-images",
            "--disable-javascript",
            "--no-first-run",
            "--disable-default-apps",
            "--disable-sync",
            "--disable-translate",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=TranslateUI",
            "--disable-ipc-flooding-protection",
        ]
        for option in ci_options:
            options.add_argument(option)

    return options


def create_chrome_driver(options: Optional["webdriver.ChromeOptions"] = None) -> "webdriver.Chrome":
    """
    Create a Chrome WebDriver instance with automatic driver management.

    Args:
        options: Chrome options to use. If None, uses default options.

    Returns:
        Configured Chrome WebDriver instance

    Raises:
        ImportError: If selenium is not available
    """
    if not SELENIUM_AVAILABLE:
        raise ImportError(
            "Selenium and webdriver-manager are required for browser tests. "
            "Install with: pip install selenium webdriver-manager"
        )

    if options is None:
        options = get_chrome_options()

    # Set up Chrome service with automatic driver management
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)

    return driver


class BrowserTestHelper:
    """
    Helper class for common browser testing operations.
    """

    def __init__(self, driver: "webdriver.Chrome", default_timeout: int = 15):
        self.driver = driver
        self.wait = WebDriverWait(driver, default_timeout)
        self.default_timeout = default_timeout

    def login_if_redirected(self, username: str, password: str) -> bool:
        """
        Check if we're on the login page and login if so.

        Args:
            username: Email/username for login
            password: Password for login

        Returns:
            True if login was successful or not needed
        """
        current_url = self.driver.current_url

        # Check if we're on the login page
        if "/login" not in current_url:
            logger.info("ℹ️ Not on login page, no authentication needed")
            return True

        logger.info("🔐 Detected login page, attempting to authenticate")

        try:
            # Wait for login form (data-testid is on the input element itself)
            email_input = self.wait.until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "input[data-testid='email-input']"))
            )

            # Enter credentials
            email_input.clear()
            email_input.send_keys(username)
            logger.info(f"✅ Entered email: {username}")

            password_input = self.driver.find_element(By.CSS_SELECTOR, "input[data-testid='password-input']")
            password_input.clear()
            password_input.send_keys(password)
            logger.info("✅ Entered password")

            # Submit login form
            login_button = self.driver.find_element(By.CSS_SELECTOR, "button[data-testid='login-button']")
            login_button.click()
            logger.info("✅ Clicked login button")

            # Wait for redirect away from login page
            WebDriverWait(self.driver, 10).until(lambda driver: "/login" not in driver.current_url)

            logger.info("✅ Successfully authenticated and redirected")
            return True

        except Exception as e:
            logger.error(f"❌ Login failed: {e}")
            return False

    def navigate_to_room_with_auth(self, portal_url: str, room_code: str, username: str, password: str) -> bool:
        """
        Navigate to a room, handling authentication if needed.

        Args:
            portal_url: Base URL of the portal service
            room_code: Room code to join
            username: Email/username for login (if authentication needed)
            password: Password for login (if authentication needed)

        Returns:
            True if successfully navigated to room
        """
        room_url = f"{portal_url}/room/{room_code}"
        logger.info(f"🌐 Navigating to room: {room_url}")

        try:
            # Navigate to room URL
            self.driver.get(room_url)

            # Wait a moment for any redirects to complete
            time.sleep(2)

            # Handle authentication if redirected to login
            if not self.login_if_redirected(username, password):
                return False

            # Navigate to room URL again
            self.driver.get(room_url)

            # Wait a moment for the room page to load
            time.sleep(3)

            return True

        except Exception as e:
            logger.error(f"❌ Failed to navigate to room: {e}")
            return False

    def join_room_with_username(self, username: str = "Test User") -> bool:
        """
        Join a room by handling both new Room page structure and PreJoin form.

        Args:
            username: Username to enter in the join form

        Returns:
            True if successfully joined the room
        """
        try:
            join_button = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='join-room']")))
            logger.info("📝 Found Join button on Room page, clicking it...")

            # Ensure button is clickable and click it
            self.driver.execute_script("arguments[0].scrollIntoView(true);", join_button)
            join_button.click()
            logger.info("✅ Clicked Join button on Room page")
            time.sleep(2)
            return True

        except Exception as e:
            logger.info(f"ℹ️ No Join button found on Room page: {e}")

        # If we get here, we couldn't join via either method
        logger.warning("⚠️ Could not join room via any method")
        return False

    def authenticate_and_join_room(
        self, portal_url: str, room_code: str, username: str, password: str, display_name: str = "Test User"
    ) -> bool:
        """
        Complete flow: navigate to room (with auth handling) and join.

        Args:
            portal_url: Base URL of the portal service
            room_code: Room code to join
            username: Email/username for login
            password: Password for login
            display_name: Display name to use in the room

        Returns:
            True if successfully authenticated and joined room
        """
        logger.info(f"🚀 Starting authenticated room join flow for room: {room_code}")

        # Step 1: Navigate to room (handles auth redirect if needed)
        if not self.navigate_to_room_with_auth(portal_url, room_code, username, password):
            logger.error("❌ Room navigation/authentication failed")
            return False

        # Step 2: Join room (handle PreJoin if shown)
        if not self.join_room_with_username(display_name):
            logger.error("❌ Room join failed")
            return False

        logger.info("✅ Successfully completed authenticated room join flow")
        return True

    # Legacy methods for compatibility
    def login(self, portal_url: str, username: str, password: str) -> bool:
        """Legacy method - use authenticate_and_join_room instead."""
        login_url = f"{portal_url}/login"
        self.driver.get(login_url)
        return self.login_if_redirected(username, password)

    def navigate_to_room(self, portal_url: str, room_code: str) -> bool:
        """Legacy method - use navigate_to_room_with_auth instead."""
        room_url = f"{portal_url}/room/{room_code}"
        self.driver.get(room_url)
        return True

    def login_and_join_room(
        self, portal_url: str, room_code: str, username: str, password: str, display_name: str = "Test User"
    ) -> bool:
        """Legacy method - use authenticate_and_join_room instead."""
        return self.authenticate_and_join_room(portal_url, room_code, username, password, display_name)

    def wait_in_room(self, duration: int = 10):
        """
        Wait in the room for a specified duration.

        Args:
            duration: How long to wait in seconds
        """
        logger.info(f"⏳ Waiting in room for {duration} seconds...")
        time.sleep(duration)

    def leave_room(self):
        """Leave the room by closing the browser."""
        logger.info("🚪 Leaving room (closing browser)")
        try:
            self.driver.quit()
        except Exception as e:
            logger.error(f"❌ Failed to close browser: {e}")

    def take_screenshot(self, filename: str) -> bool:
        """
        Take a screenshot for debugging.

        Args:
            filename: Path to save the screenshot

        Returns:
            True if screenshot was taken successfully
        """
        try:
            self.driver.save_screenshot(filename)
            logger.info(f"📸 Screenshot saved: {filename}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to take screenshot: {e}")
            return False


def check_selenium_available() -> bool:
    """Check if Selenium dependencies are available."""
    return SELENIUM_AVAILABLE


def ensure_selenium_available():
    """Ensure Selenium dependencies are available, raise ImportError if not."""
    if not SELENIUM_AVAILABLE:
        raise ImportError(
            "Selenium and webdriver-manager are required for browser-based integration tests. "
            "Install with: pip install selenium webdriver-manager"
        )
