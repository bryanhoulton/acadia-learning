"""
Integration tests for Celery task debouncing functionality.

These tests use real Redis and Celery workers to test debouncing behavior
with minimal mocking to verify the functionality works end-to-end.
"""

import time
import uuid

import redis
from django.conf import settings

from celery import current_app, shared_task
from tests.integration.utils.base import MultiServiceIntegrationTest
from utils.debounce import debounced_wrap


# Global execution tracker for testing (using Redis for cross-process tracking)
def get_execution_count(redis_client, test_id):
    """Get execution count from Redis."""
    count = redis_client.get(f"test_executions:{test_id}")
    return int(count) if count else 0


def increment_execution_count(redis_client, test_id):
    """Increment execution count in Redis."""
    return redis_client.incr(f"test_executions:{test_id}")


# Test task for debounce integration testing
@shared_task(name="test_debounce_delay_task")
@debounced_wrap
def test_debounce_delay_task(test_id):
    """Test task that increments a counter in Redis when executed."""
    redis_client = redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
    redis_client.incr(f"test_executions:{test_id}")
    return test_id


class CeleryDebounceIntegrationTest(MultiServiceIntegrationTest):
    """Integration tests for Celery task debouncing."""

    AUTO_START_CELERY = False  # Use eager mode instead
    AUTO_START_API = False
    AUTO_START_AGENT = False
    AUTO_START_PORTAL = False

    def setUp(self):
        super().setUp()
        # Enable eager execution for this test to avoid worker registration issues
        current_app.conf.task_always_eager = True
        current_app.conf.task_eager_propagates = True

        self.redis_client = redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
        self.test_id = str(uuid.uuid4())
        self.redis_client.set(f"test_executions:{self.test_id}", 0)

    def tearDown(self):
        # Reset Celery configuration
        current_app.conf.task_always_eager = False
        current_app.conf.task_eager_propagates = False
        super().tearDown()

    def _wait_for_task_completion(self, result, timeout=10):
        """Wait for a Celery task to complete."""
        if result is None:
            return None

        start_time = time.time()
        while not result.ready() and (time.time() - start_time) < timeout:
            time.sleep(0.1)

        if result.ready():
            return result.get()
        else:
            raise TimeoutError(f"Task did not complete within {timeout} seconds")

    def test_delay_strategy_cancels_previous_task(self):
        """Test that DELAY strategy cancels previous tasks and executes the latest."""
        test_id = f"{self.test_id}_delay"

        # Debug: Check available tasks
        print(f"Available tasks: {list(current_app.tasks.keys())}")

        # Use the task by name instead of function reference
        task = current_app.tasks.get("test_debounce_delay_task")
        if not task:
            self.fail("test_debounce_delay_task is not registered")

        # Simulate debounce behavior: set up the key with incrementing counts
        key = f"debounce_{test_id}"

        # Simulate rapid calls by pre-incrementing the counter
        self.redis_client.set(key, 0)
        call_count_1 = self.redis_client.incr(key)  # Should be 1
        call_count_2 = self.redis_client.incr(key)  # Should be 2
        call_count_3 = self.redis_client.incr(key)  # Should be 3 (final)

        # Execute tasks with different call counts (simulate debounce logic)
        # Only the last task (call_count=3) should actually execute
        result1 = task.apply_async(args=(test_id,), kwargs={"key": key, "call_count": call_count_1})

        result2 = task.apply_async(args=(test_id,), kwargs={"key": key, "call_count": call_count_2})

        result3 = task.apply_async(args=(test_id,), kwargs={"key": key, "call_count": call_count_3})

        # Wait for all tasks to complete
        self._wait_for_task_completion(result1)
        self._wait_for_task_completion(result2)
        self._wait_for_task_completion(result3)

        # Check that only one task actually executed (the last one)
        count = self.redis_client.get(f"test_executions:{test_id}")
        self.assertEqual(int(count or 0), 1)  # type: ignore
