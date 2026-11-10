"""
Utilities for integration tests.

This package provides comprehensive utilities for integration testing including:
- ServiceManager: Manages service lifecycle (API, Celery, Agent, Portal)
- Base test classes: Ready-to-use test base classes
- Browser utilities: Selenium/Chrome setup and helpers
- Test data utilities: Factory functions for common test data

Usage:
    from tests.integration.utils import ServiceManager, FullStackIntegrationTest
    from tests.integration.utils.test_data import create_complete_test_setup

    class MyTest(FullStackIntegrationTest):
        def setUp(self):
            super().setUp()
            self.test_data = create_complete_test_setup()
"""

# Service Management
# Base Test Classes
from .base import (
    BrowserIntegrationTest,
    FullStackIntegrationTest,
    MultiServiceIntegrationTest,
)

# Browser Utilities
from .browser_utils import (
    BrowserTestHelper,
    check_selenium_available,
    create_chrome_driver,
    ensure_selenium_available,
    get_chrome_options,
)
from .service_manager import ServiceManager, ServiceProcess, find_free_port

# Test Data Utilities
from .test_data import (
    create_complete_test_setup,
    create_test_entity,
    create_test_user_and_profile,
)

__all__ = [
    # Service Management
    "ServiceManager",
    "ServiceProcess",
    "find_free_port",
    # Base Test Classes
    "MultiServiceIntegrationTest",
    "BrowserIntegrationTest",
    "FullStackIntegrationTest",
    # Browser Utilities
    "BrowserTestHelper",
    "get_chrome_options",
    "create_chrome_driver",
    "check_selenium_available",
    "ensure_selenium_available",
    # Test Data Utilities
    "create_test_entity",
    "create_test_user_and_profile",
    "create_complete_test_setup",
]
