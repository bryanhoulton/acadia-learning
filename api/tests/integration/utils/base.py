"""
Base classes for integration tests.

Provides common setup and utilities for integration tests that need to
spin up multiple services with proper cleanup.
"""

import logging
from typing import Optional

from django.db import connection
from django.test import TransactionTestCase, override_settings, tag
from selenium import webdriver

from .browser_utils import (
    BrowserTestHelper,
    check_selenium_available,
    create_chrome_driver,
    ensure_selenium_available,
    get_chrome_options,
)
from .service_manager import ServiceManager, ServiceProcess

logger = logging.getLogger("utils")


@override_settings(CELERY_ALWAYS_EAGER=True)
@tag("integration")
class MultiServiceIntegrationTest(TransactionTestCase):
    """
    Base class for integration tests that need multiple services.

    Automatically manages service lifecycle (start/stop) and provides
    common utilities for browser testing and service interaction.

    Services available:
    - API server (Django)
    - Celery worker
    - LiveKit agent
    - Portal (React frontend)

    Usage:
        class MyIntegrationTest(MultiServiceIntegrationTest):
            def test_my_feature(self):
                # Services are automatically started
                self.assertTrue(self.service_manager.is_service_running("api"))

                # Browser testing
                driver = self.create_browser()
                helper = BrowserTestHelper(driver)
                helper.navigate_to_room(self.get_portal_url(), "12345678")

                # Your test logic here
    """

    # Override these in subclasses to control which services start automatically
    AUTO_START_API = True
    AUTO_START_CELERY = True
    AUTO_START_AGENT = False  # Often not needed for basic tests
    AUTO_START_PORTAL = False  # Only start when browser testing

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # Validate required environment variables for agent/LiveKit if needed
        cls._validate_environment()

    @classmethod
    def _validate_environment(cls):
        """Validate required environment variables are present."""
        required_vars = [
            "LIVEKIT_URL",
            "LIVEKIT_API_KEY",
            "LIVEKIT_API_SECRET",
            "DEEPGRAM_API_KEY",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "GOOGLE_API_KEY",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "ELEVEN_API_KEY",
            "DB_NAME",
            "DB_USER",
            "DB_PASSWORD",
            "DB_HOST",
            "DB_PORT",
        ]

        # Only validate if we plan to use the agent
        if cls.AUTO_START_AGENT:
            import os

            missing_vars = [var for var in required_vars if not os.environ.get(var)]
            if missing_vars:
                raise ValueError(f"🔴 Missing environment variables: {missing_vars}")

    def setUp(self):
        """Set up services and test data."""
        super().setUp()

        # Initialize service manager
        self.service_manager = ServiceManager()

        # Get test database name
        test_db_name = connection.settings_dict["NAME"]
        logger.info(f"[DEBUG] Using test database: {test_db_name}")

        # Start services based on configuration
        services_started = []

        if self.AUTO_START_API:
            if self.service_manager.start_api_server(test_db_name):
                services_started.append("API")
            else:
                raise RuntimeError("Failed to start API server")

        if self.AUTO_START_CELERY:
            if self.service_manager.start_celery_worker(test_db_name):
                services_started.append("Celery")
            else:
                raise RuntimeError("Failed to start Celery worker")

        if self.AUTO_START_AGENT:
            if self.service_manager.start_agent_service():
                services_started.append("Agent")
            else:
                raise RuntimeError("Failed to start Agent service")

        if self.AUTO_START_PORTAL:
            if self.service_manager.start_portal_service():
                services_started.append("Portal")
            else:
                raise RuntimeError("Failed to start Portal service")

        if services_started:
            logger.info(f"✅ Started services: {', '.join(services_started)}")

        # Store browser instances for cleanup
        self.browser_instances = []

    def tearDown(self):
        """Clean up services and browsers."""
        # Clean up any browser instances
        for driver in self.browser_instances:
            try:
                driver.quit()
            except:
                pass
        self.browser_instances.clear()

        # Clean up services
        self.service_manager.cleanup()

        super().tearDown()

    def start_service_if_needed(self, service_name: str) -> Optional[ServiceProcess]:
        """
        Start a service if it's not already running.

        Args:
            service_name: Name of service ('api', 'celery', 'agent', 'portal')

        Returns:
            ServiceProcess instance if successful, None otherwise
        """
        if self.service_manager.is_service_running(service_name):
            return self.service_manager.get_service(service_name)

        test_db_name = connection.settings_dict["NAME"]

        if service_name == "api":
            return self.service_manager.start_api_server(test_db_name)
        elif service_name == "celery":
            return self.service_manager.start_celery_worker(test_db_name)
        elif service_name == "agent":
            return self.service_manager.start_agent_service()
        elif service_name == "portal":
            return self.service_manager.start_portal_service()
        else:
            logger.error(f"Unknown service: {service_name}")
            return None

    def create_browser(self, headless: bool = True) -> webdriver.Chrome:
        """
        Create a browser instance for testing.

        Args:
            headless: Whether to run in headless mode

        Returns:
            Chrome WebDriver instance

        Note:
            Browser will be automatically cleaned up in tearDown
        """
        ensure_selenium_available()

        options = get_chrome_options(headless=headless)
        driver = create_chrome_driver(options)

        # Track for cleanup
        self.browser_instances.append(driver)

        return driver

    def create_browser_helper(self, driver: Optional[webdriver.Chrome] = None, timeout: int = 15) -> BrowserTestHelper:
        """
        Create a browser helper for common operations.

        Args:
            driver: WebDriver instance. If None, creates a new one.
            timeout: Default timeout for operations

        Returns:
            BrowserTestHelper instance
        """
        if driver is None:
            driver = self.create_browser()

        return BrowserTestHelper(driver, default_timeout=timeout)

    def get_api_url(self) -> Optional[str]:
        """Get the API URL."""
        return self.service_manager.get_api_url()

    def get_portal_url(self) -> Optional[str]:
        """Get the portal URL."""
        return self.service_manager.get_portal_url()

    def ensure_portal_running(self) -> Optional[str]:
        """
        Ensure portal service is running and return its URL.

        Returns:
            Portal URL

        Raises:
            RuntimeError: If portal cannot be started
        """
        if not self.service_manager.is_service_running("portal"):
            if not self.start_service_if_needed("portal"):
                raise RuntimeError("Failed to start portal service")

        return self.get_portal_url()

    def wait_for_service_interaction(self, duration: int = 10):
        """
        Wait for services to interact (useful for async operations).

        Args:
            duration: How long to wait in seconds
        """
        import time

        logger.info(f"⏳ Waiting for service interaction ({duration}s)...")
        time.sleep(duration)


class BrowserIntegrationTest(MultiServiceIntegrationTest):
    """
    Base class for integration tests that need browser automation.

    Automatically starts API, portal services, and provides browser utilities.
    """

    AUTO_START_API = True
    AUTO_START_CELERY = True
    AUTO_START_PORTAL = True  # Always start portal for browser tests
    AUTO_START_AGENT = False

    def setUp(self):
        """Set up with browser-specific defaults."""
        super().setUp()

        # Ensure Selenium is available
        if not check_selenium_available():
            self.skipTest("Selenium not available for browser testing")


class FullStackIntegrationTest(MultiServiceIntegrationTest):
    """
    Base class for full-stack integration tests.

    Starts all services (API, Celery, Agent, Portal) for comprehensive testing.
    """

    AUTO_START_API = True
    AUTO_START_CELERY = True
    AUTO_START_AGENT = True
    AUTO_START_PORTAL = True

    def setUp(self):
        """Set up with all services enabled."""
        super().setUp()

        # Ensure Selenium is available since portal is running
        if not check_selenium_available():
            self.skipTest("Selenium not available for full-stack testing")
