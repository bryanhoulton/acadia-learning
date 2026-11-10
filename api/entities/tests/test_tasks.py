from __future__ import annotations

from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from entities.models import Entity
from entities.tasks import MAX_RUN_DURATION, check_entities_wakeup
from lms.accounts.models import Account


class CheckEntitiesWakeupTestCase(TestCase):
    """Tests for the check_entities_wakeup task."""

    def setUp(self):
        self.user = User.objects.create_user(username="test-wakeup-user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15550000000",
            timezone="UTC",
        )
        self.entity = Entity.objects.create(
            name="Test Entity",
            account=self.account,
            timezone="UTC",
        )

    def test_on_call_entity_not_forced_to_sleep(self):
        """Entity on a call should NOT be forced to sleep even if run_started_at exceeds MAX_RUN_DURATION."""
        # Set entity to ON_CALL with run_started_at exceeding max duration
        self.entity.status = Entity.EntityStatus.ON_CALL
        self.entity.run_started_at = timezone.now() - MAX_RUN_DURATION - timedelta(minutes=10)
        self.entity.save()

        # Run the wakeup check
        check_entities_wakeup()

        # Refresh and verify entity is still ON_CALL
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.status, Entity.EntityStatus.ON_CALL)
        self.assertIsNotNone(self.entity.run_started_at)

    def test_running_entity_forced_to_sleep_after_max_duration(self):
        """Entity NOT on a call should be forced to sleep if run_started_at exceeds MAX_RUN_DURATION."""
        # Set entity to RUNNING with run_started_at exceeding max duration
        self.entity.status = Entity.EntityStatus.RUNNING
        self.entity.run_started_at = timezone.now() - MAX_RUN_DURATION - timedelta(minutes=10)
        self.entity.save()

        # Run the wakeup check
        check_entities_wakeup()

        # Refresh and verify entity was forced to sleep
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.status, Entity.EntityStatus.SLEEPING)
        self.assertIsNone(self.entity.run_started_at)
        self.assertIsNotNone(self.entity.sleep_until)

    def test_human_controlled_entity_skipped(self):
        """Human-controlled entities should be skipped entirely."""
        # Set account to human controlled
        self.account.is_human_controlled = True
        self.account.save()

        # Set entity to RUNNING with run_started_at exceeding max duration
        self.entity.status = Entity.EntityStatus.RUNNING
        self.entity.run_started_at = timezone.now() - MAX_RUN_DURATION - timedelta(minutes=10)
        self.entity.save()

        # Run the wakeup check
        check_entities_wakeup()

        # Refresh and verify entity is still RUNNING (not forced to sleep)
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.status, Entity.EntityStatus.RUNNING)
        self.assertIsNotNone(self.entity.run_started_at)

    def test_entity_within_max_duration_not_forced_to_sleep(self):
        """Entity within MAX_RUN_DURATION should not be forced to sleep."""
        # Set entity to RUNNING with run_started_at within max duration
        self.entity.status = Entity.EntityStatus.RUNNING
        self.entity.run_started_at = timezone.now() - timedelta(minutes=10)
        self.entity.save()

        # Run the wakeup check
        check_entities_wakeup()

        # Refresh and verify entity is still RUNNING
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.status, Entity.EntityStatus.RUNNING)
        self.assertIsNotNone(self.entity.run_started_at)
