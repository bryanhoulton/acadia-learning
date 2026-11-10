"""Tests for subscription status checking with Stripe."""

from unittest.mock import MagicMock, patch

import stripe as stripe_lib
from django.test import TestCase

from lms.accounts.models import Account


class SubscriptionStatusTest(TestCase):
    """Test account subscription status checking with Stripe."""

    def setUp(self):
        """Create test account."""
        self.account = Account.objects.create(
            account_phone="+15551234567",
            stripe_customer_id="cus_test123",
        )

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_active_stripe_subscription(self, mock_cache, mock_stripe_list):
        """Test account with active Stripe subscription returns paid status."""
        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API response with active subscription
        mock_subscription = MagicMock()
        mock_subscription.status = "active"
        mock_stripe_list.return_value = MagicMock(data=[mock_subscription])

        # Check status
        status = self.account.account_status()
        self.assertEqual(status, "paid")

        # Verify cache was set
        mock_cache.set.assert_called_once_with(
            f"stripe_subscription_status:{self.account.stripe_customer_id}",
            "active",
            300,
        )

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_past_due_stripe_subscription(self, mock_cache, mock_stripe_list):
        """Test account with past_due Stripe subscription returns delinquent status."""
        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API response with past_due subscription
        mock_subscription = MagicMock()
        mock_subscription.status = "past_due"
        mock_stripe_list.return_value = MagicMock(data=[mock_subscription])

        # Check status
        status = self.account.account_status()
        self.assertEqual(status, "delinquent")

        # Verify stripe status was fetched correctly
        stripe_status = self.account.get_stripe_subscription_status()
        self.assertEqual(stripe_status, "past_due")

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_unpaid_stripe_subscription(self, mock_cache, mock_stripe_list):
        """Test account with unpaid Stripe subscription returns delinquent status."""
        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API response with unpaid subscription
        mock_subscription = MagicMock()
        mock_subscription.status = "unpaid"
        mock_stripe_list.return_value = MagicMock(data=[mock_subscription])

        # Check status
        status = self.account.account_status()
        self.assertEqual(status, "delinquent")

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_canceled_stripe_subscription(self, mock_cache, mock_stripe_list):
        """Test account with canceled Stripe subscription returns free status."""
        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API response with canceled subscription
        mock_subscription = MagicMock()
        mock_subscription.status = "canceled"
        mock_stripe_list.return_value = MagicMock(data=[mock_subscription])

        # Check status
        status = self.account.account_status()
        self.assertEqual(status, "free")

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_trialing_stripe_subscription(self, mock_cache, mock_stripe_list):
        """Test account with trialing Stripe subscription returns paid status."""
        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API response with trialing subscription
        mock_subscription = MagicMock()
        mock_subscription.status = "trialing"
        mock_stripe_list.return_value = MagicMock(data=[mock_subscription])

        # Check status
        status = self.account.account_status()
        self.assertEqual(status, "paid")

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_no_stripe_subscriptions(self, mock_cache, mock_stripe_list):
        """Test account with Stripe customer ID but no subscriptions returns free status."""
        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API response with no subscriptions
        mock_stripe_list.return_value = MagicMock(data=[])

        # Check status
        status = self.account.account_status()
        self.assertEqual(status, "free")

    def test_no_stripe_customer_id(self):
        """Test account without Stripe customer ID returns free status."""
        account = Account.objects.create(
            account_phone="+15559876543",
            stripe_customer_id=None,
        )

        status = account.account_status()
        self.assertEqual(status, "free")

        # Should not query Stripe at all
        stripe_status = account.get_stripe_subscription_status()
        self.assertIsNone(stripe_status)

    @patch("lms.accounts.models.cache")
    def test_stripe_status_uses_cache(self, mock_cache):
        """Test that Stripe subscription status uses cache to avoid excessive API calls."""
        # Mock cache hit
        mock_cache.get.return_value = "active"

        # Get status
        stripe_status = self.account.get_stripe_subscription_status()

        # Verify cache was checked
        mock_cache.get.assert_called_once_with(f"stripe_subscription_status:{self.account.stripe_customer_id}")

        # Should return cached value
        self.assertEqual(stripe_status, "active")

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_stripe_api_error_returns_none(self, mock_cache, mock_stripe_list):
        """Test that Stripe API errors are handled gracefully."""
        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API error
        mock_stripe_list.side_effect = stripe_lib.error.StripeError("API Error")  # type: ignore

        # Should return None on error
        stripe_status = self.account.get_stripe_subscription_status()
        self.assertIsNone(stripe_status)

        # Account status should fall back to free
        status = self.account.account_status()
        self.assertEqual(status, "free")

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_multiple_subscriptions_priority(self, mock_cache, mock_stripe_list):
        """Test that active subscriptions take priority over canceled ones."""
        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API response with multiple subscriptions
        mock_canceled = MagicMock()
        mock_canceled.status = "canceled"
        mock_active = MagicMock()
        mock_active.status = "active"
        mock_stripe_list.return_value = MagicMock(data=[mock_canceled, mock_active])

        # Should return active status (higher priority)
        stripe_status = self.account.get_stripe_subscription_status()
        self.assertEqual(stripe_status, "active")

        # Account should be paid
        status = self.account.account_status()
        self.assertEqual(status, "paid")

    def test_revenuecat_takes_priority_over_stripe(self):
        """Test that RevenueCat subscription status takes priority over Stripe."""
        # Set both RevenueCat and Stripe
        self.account.revenuecat_subscription_status = "active"
        self.account.stripe_customer_id = "cus_test123"
        self.account.save()

        # Should return paid based on RevenueCat, without querying Stripe
        status = self.account.account_status()
        self.assertEqual(status, "paid")

    def test_is_subscribed_method(self):
        """Test is_subscribed() method returns correct boolean."""
        # Free account
        account = Account.objects.create(
            account_phone="+15551111111",
            stripe_customer_id=None,
        )
        self.assertFalse(account.is_subscribed())

        # RevenueCat active account
        account.revenuecat_subscription_status = "active"
        account.save()
        self.assertTrue(account.is_subscribed())

    @patch("lms.accounts.models.stripe.Subscription.list")
    @patch("lms.accounts.models.cache")
    def test_serializer_includes_stripe_status(self, mock_cache, mock_stripe_list):
        """Test that AccountSerializer includes stripe_subscription_status field."""
        from lms.accounts.serializers import AccountSerializer

        # Mock cache miss
        mock_cache.get.return_value = None

        # Mock Stripe API response with past_due subscription
        mock_subscription = MagicMock()
        mock_subscription.status = "past_due"
        mock_stripe_list.return_value = MagicMock(data=[mock_subscription])

        # Serialize the account
        serializer = AccountSerializer(self.account)
        data = serializer.data

        # Check that both fields are present
        self.assertIn("account_status", data)
        self.assertIn("stripe_subscription_status", data)

        # Verify values
        self.assertEqual(data["account_status"], "delinquent")
        self.assertEqual(data["stripe_subscription_status"], "past_due")

    def test_serializer_stripe_status_null_when_no_customer(self):
        """Test that stripe_subscription_status is null when no Stripe customer ID."""
        from lms.accounts.serializers import AccountSerializer

        account = Account.objects.create(
            account_phone="+15559999999",
            stripe_customer_id=None,
        )

        serializer = AccountSerializer(account)
        data = serializer.data

        # Should be null when no Stripe customer
        self.assertIsNone(data["stripe_subscription_status"])
        self.assertEqual(data["account_status"], "free")
