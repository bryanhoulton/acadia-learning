import logging
import random
import uuid
from datetime import date, timedelta
from enum import Enum
from textwrap import dedent

import posthog
import stripe
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import models
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone
from pydantic import BaseModel, Field
from timezonefinder import TimezoneFinder

from api.settings import TWILIO_VERIFY_SID, mail, twilio
from entities.models import Entity
from utils.slack import SlackChannel, send_slack_message
from utils.timezone import is_valid_timezone

logger = logging.getLogger(__name__)

TEST_VERIFICATION_CACHE_PREFIX = "test-account-verification"
TEST_VERIFICATION_CODE = "000000"
# Phone numbers that accept any 6-digit verification code for testing/demo purposes
# Using 555 area code which is reserved for fictional use in the US
TEST_PHONE_NUMBERS = [
    "+1 (555) 012-0000",  # Formatted version
    "+15550120000",  # Unformatted version
    "+1 (555) 555-0100",  # Alternative formatted version
    "+15555550100",  # Alternative unformatted version
]


class EmailVerificationCode(models.Model):
    """
    Database model for email verification codes.
    More reliable than cache for critical authentication flows.
    """

    account = models.ForeignKey("Account", on_delete=models.CASCADE, related_name="email_verification_codes")
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def is_expired(self) -> bool:
        """Check if the code is expired (10 minutes)"""
        return timezone.now() > self.created_at + timezone.timedelta(minutes=10)

    def is_valid(self) -> bool:
        """Check if the code is valid (not used and not expired)"""
        return self.used_at is None and not self.is_expired()

    def mark_as_used(self):
        """Mark the code as used"""
        self.used_at = timezone.now()
        self.save()

    def __str__(self):
        return f"Code {self.code} for {self.account.account_phone}"


class Account(models.Model):
    """
    Represents an account in the system.
    Each Account is backed by a Django User for proper authentication.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="account")
    account_phone = models.CharField(max_length=255, unique=True)
    zip_code = models.CharField(max_length=255, blank=True, null=True)
    timezone = models.CharField(max_length=255, blank=True, null=True, validators=[is_valid_timezone])
    is_active = models.BooleanField(default=True)
    is_admin = models.BooleanField(default=False)
    is_locked = models.BooleanField(
        default=False,
        help_text="If True, account cannot start new classroom sessions unless paid",
    )
    is_human_controlled = models.BooleanField(
        default=False,
        help_text="If True, entity won't wake autonomously - human operates via control panel",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    tutor_name = models.CharField(max_length=255, default="Acadia")

    attribution = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Attribution",
    )

    # UTM tracking - stored as JSON for flexibility
    signup_metadata = models.JSONField(
        blank=True,
        null=True,
        help_text="Metadata captured at signup (UTM params, referrer, etc.)",
    )

    stripe_customer_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Stripe customer ID for this account.",
    )

    # RevenueCat subscription fields
    revenuecat_app_user_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="RevenueCat app user ID (usually account UUID)",
    )
    revenuecat_subscription_status = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        choices=[
            ("active", "Active"),
            ("expired", "Expired"),
            ("in_trial", "In Trial"),
            ("cancelled", "Cancelled"),
            ("paused", "Paused"),
        ],
        help_text="Current RevenueCat subscription status",
    )
    revenuecat_product_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="RevenueCat product identifier (e.g., 'monthly', 'yearly')",
    )
    revenuecat_entitlement = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="RevenueCat entitlement ID (e.g., 'Acadia Learning Pro')",
    )
    subscription_expires_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="When the current subscription period expires",
    )

    class RegistrationSource(models.TextChoices):
        WEB = "web", "Web"
        MOBILE = "mobile", "Mobile"

    registration_source = models.CharField(
        max_length=10,
        choices=RegistrationSource.choices,
        default=RegistrationSource.WEB,
        help_text="Platform where the account was registered (web or mobile)",
    )

    playgrounds_enabled = models.BooleanField(
        default=False,
        help_text="If True, all playgrounds are enabled. If False, only the canvas playground is available.",
    )

    speed_lab_enabled = models.BooleanField(
        default=False,
        help_text="If True, the Speed Lab playground is enabled for this account.",
    )

    alt_tutor = models.BooleanField(
        default=False,
        help_text="If True, use the alt-tutor prompt stack for live classroom sessions.",
    )

    referral_code = models.CharField(
        max_length=10,
        unique=True,
        help_text="Unique referral code for this account",
    )

    referred_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referrals",
        help_text="Account that referred this user",
    )

    def __str__(self):
        profile = UserProfile.objects.filter(account=self, name__isnull=False).first()
        if profile:
            return f"{profile.name} ({self.account_phone})"
        return f"{self.account_phone}"

    def save(self, *args, **kwargs):
        """Override save to ensure User is created/updated and extract timezone from zip code"""
        # Check if this is a new Account without a User
        if not hasattr(self, "user") or self.user is None:
            self.user = User.objects.create_user(username=str(self.id), is_active=self.is_active)
        elif hasattr(self, "user") and self.user:
            self.user.is_active = self.is_active
            self.user.save()

        # Generate referral code if this is a new account and doesn't have one
        if not self.referral_code:
            self.referral_code = self._generate_unique_referral_code()

        # Extract timezone from zip code if provided
        if self.zip_code and not self.timezone:
            try:
                import ziptimezone

                latitude, longitude = ziptimezone.get_lat_long_for_zip(self.zip_code)
                tf = TimezoneFinder(in_memory=True)
                timezone = tf.timezone_at(lat=float(latitude), lng=float(longitude))
                if timezone:
                    self.timezone = timezone
            except Exception:
                pass  # Silently ignore timezone extraction failures
        super().save(*args, **kwargs)

    def _generate_unique_referral_code(self) -> str:
        """Generate a unique referral code"""
        import string

        while True:
            # Generate a random 8-character code (letters and numbers)
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
            # Check if it's unique
            if not Account.objects.filter(referral_code=code).exists():
                return code

    def _get_test_verification_cache_key(self) -> str:
        return f"{TEST_VERIFICATION_CACHE_PREFIX}:{self.pk}"

    def send_verification_code(self, phone_number: str | None = None) -> str | None:
        """
        Send a verification code to the specified phone number.

        Args:
            phone_number: The phone number to send the code to. If not provided,
                         defaults to the account's primary phone number.
        """
        target_phone = phone_number or self.account_phone

        if getattr(settings, "TESTING", False):
            cache.set(self._get_test_verification_cache_key(), TEST_VERIFICATION_CODE, timeout=300)
            return TEST_VERIFICATION_CODE

        # Allow test phone numbers to verify without sending SMS
        if target_phone in TEST_PHONE_NUMBERS:
            cache.set(self._get_test_verification_cache_key(), TEST_VERIFICATION_CODE, timeout=300)
            return TEST_VERIFICATION_CODE

        if TWILIO_VERIFY_SID is None:
            raise ValueError("TWILIO_VERIFY_SID is not set")
        verification = twilio.verify.v2.services(TWILIO_VERIFY_SID).verifications.create(to=target_phone, channel="sms")
        return verification.sid

    def check_verification_code(self, code: str, phone_number: str | None = None) -> bool:
        """
        Check a verification code for the specified phone number.

        First checks database codes (EmailVerificationCode), then falls back to Twilio.
        This allows support agents to create codes that work with the normal SMS flow.

        Args:
            code: The verification code to check.
            phone_number: The phone number to verify against. If not provided,
                         defaults to the account's primary phone number.
        """
        target_phone = phone_number or self.account_phone

        if getattr(settings, "TESTING", False):
            # In testing mode, first check database codes
            verification_codes = self.email_verification_codes.filter(code=code.strip(), used_at__isnull=True)
            if verification_codes.exists():
                verification_code = verification_codes.first()
                if verification_code.is_valid():
                    verification_code.mark_as_used()
                    return True

            # Fall back to cache-based test code
            expected_code = cache.get(self._get_test_verification_cache_key(), TEST_VERIFICATION_CODE)
            return str(code).strip() == str(expected_code)

        # Allow test phone numbers to verify with any 6-digit code
        if target_phone in TEST_PHONE_NUMBERS:
            # Accept any code that is exactly 6 digits
            return len(str(code).strip()) == 6 and str(code).strip().isdigit()

        # First, check database codes (allows agent-created codes to work)
        verification_codes = self.email_verification_codes.filter(code=code.strip(), used_at__isnull=True)
        if verification_codes.exists():
            verification_code = verification_codes.first()
            if verification_code.is_valid():
                verification_code.mark_as_used()
                logger.info(f"Verification successful using database code for account {self.pk}")
                return True

        # Fall back to Twilio verification
        try:
            if TWILIO_VERIFY_SID is None:
                raise ValueError("TWILIO_VERIFY_SID is not set")
            verification = twilio.verify.v2.services(TWILIO_VERIFY_SID).verification_checks.create(
                to=target_phone, code=code
            )
            return verification.status == "approved"
        except Exception:
            return False

    def send_email_verification_code(self) -> str | None:
        """Send verification code via email if user has email on file"""
        import logging

        logger = logging.getLogger(__name__)

        logger.info(f"Attempting to send email verification code for account {self.pk}")

        # Find a profile with an email address
        profile_with_email = self.userprofile_set.filter(email__isnull=False).first()

        if not profile_with_email:
            logger.warning(f"No email profile found for account {self.pk}")
            return None

        logger.info(f"Found email profile for account {self.pk}: {profile_with_email.email}")

        # Generate a 6-digit code
        code = str(random.randint(100000, 999999))

        # Store in database instead of cache for reliability
        logger.info(f"Creating EmailVerificationCode record for account {self.pk}")
        verification_code = EmailVerificationCode.objects.create(account=self, code=code)
        logger.info(f"Created verification code record with ID: {verification_code.id}")

        if getattr(settings, "TESTING", False):
            return code

        try:
            # Get or create an inbox for sending emails
            from utils.emails import get_or_create_inbox

            # Try to get entity inbox, fallback to a default
            entity = None
            try:
                entity = Entity.objects.get(account=self)
                inbox = get_or_create_inbox(entity.id)
            except Entity.DoesNotExist:
                # Use a default entity ID for system emails
                inbox = get_or_create_inbox(1)

            # Send email with verification code
            mail.inboxes.messages.send(
                inbox_id=inbox.inbox_id,
                to=[profile_with_email.email],
                subject="Acadia Learning - Verification Code",
                text=f"Your Acadia Learning verification code is: {code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.",
            )

            logger.info(f"Email sent successfully for account {self.pk}")
            return code

        except Exception as e:
            # Log the error but don't expose it to the user
            import logging
            import traceback

            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send email verification code for account {self.pk}: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")

            # Clean up the verification code record since email failed
            verification_code.delete()
            return None

    def check_email_verification_code(self, code: str) -> bool:
        """Check email verification code using database model"""
        import logging

        logger = logging.getLogger(__name__)

        logger.info(f"Checking email verification code for account {self.pk}")

        if getattr(settings, "TESTING", False):
            # In testing mode, check if there's a valid code in the database or use test code
            verification_codes = self.email_verification_codes.filter(code=code.strip(), used_at__isnull=True)

            if verification_codes.exists():
                verification_code = verification_codes.first()
                if verification_code.is_valid():
                    verification_code.mark_as_used()
                    logger.info("Testing mode: Valid code found and marked as used")
                    return True

            # Fallback to test code
            if str(code).strip() == TEST_VERIFICATION_CODE:
                logger.info("Testing mode: Test code accepted")
                return True

            logger.info("Testing mode: Invalid code")
            return False

        # Find the most recent unused verification code for this account
        verification_codes = self.email_verification_codes.filter(code=code.strip(), used_at__isnull=True).order_by(
            "-created_at"
        )

        if not verification_codes.exists():
            logger.warning(f"No matching verification code found for account {self.pk}")
            return False

        verification_code = verification_codes.first()

        if not verification_code.is_valid():
            if verification_code.is_expired():
                logger.warning(f"Verification code expired for account {self.pk}")
            else:
                logger.warning(f"Verification code already used for account {self.pk}")
            return False

        # Mark the code as used
        verification_code.mark_as_used()
        logger.info(f"Code verification successful for account {self.pk}")

        # Clean up old verification codes for this account
        self.email_verification_codes.filter(created_at__lt=timezone.now() - timezone.timedelta(hours=1)).delete()

        return True

    def has_email_on_file(self) -> bool:
        """Check if account has any profile with an email address"""
        return self.userprofile_set.filter(email__isnull=False).exists()

    def get_stripe_subscription_status(self) -> str | None:
        """
        Get the current Stripe subscription status by querying Stripe API.
        Returns: 'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', or None

        Note: 'past_due' means the customer missed their payment and subscription is delinquent.
        """
        if not self.stripe_customer_id:
            return None

        # Cache the result for 5 minutes to avoid excessive API calls
        cache_key = f"stripe_subscription_status:{self.stripe_customer_id}"
        cached_status = cache.get(cache_key)
        if cached_status is not None:
            return cached_status

        try:
            # Get all subscriptions for this customer
            subscriptions = stripe.Subscription.list(
                customer=self.stripe_customer_id,
                limit=10,
                status="all",  # Get all subscriptions to find the most relevant one
            )

            # Priority order: active/trialing > past_due > others
            # We want to return the most "active" subscription status
            statuses = [sub.status for sub in subscriptions.data]

            if not statuses:
                cache.set(cache_key, None, 300)  # Cache for 5 minutes
                return None

            # Check for active subscriptions first
            if "active" in statuses:
                cache.set(cache_key, "active", 300)
                return "active"
            if "trialing" in statuses:
                cache.set(cache_key, "trialing", 300)
                return "trialing"

            # Check for delinquent subscriptions
            if "past_due" in statuses:
                cache.set(cache_key, "past_due", 300)
                return "past_due"
            if "unpaid" in statuses:
                cache.set(cache_key, "unpaid", 300)
                return "unpaid"

            # Return the first status if none of the priority ones match
            status = statuses[0]
            cache.set(cache_key, status, 300)
            return status

        except stripe.error.StripeError as e:
            logger.warning(f"Failed to fetch Stripe subscription status for customer {self.stripe_customer_id}: {e}")
            # Return None on error rather than failing
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching Stripe subscription status: {e}")
            return None

    def account_status(self) -> str:
        """
        Get account subscription status.
        Returns: 'paid', 'delinquent', or 'free'
        """
        # Check RevenueCat subscription first (mobile)
        if self.revenuecat_subscription_status in ["active", "in_trial"]:
            return "paid"

        # Check Stripe (web)
        if self.stripe_customer_id:
            stripe_status = self.get_stripe_subscription_status()

            # Active or trialing subscriptions are paid
            if stripe_status in ["active", "trialing"]:
                return "paid"

            # Past due or unpaid subscriptions are delinquent
            if stripe_status in ["past_due", "unpaid"]:
                return "delinquent"

            # Other statuses (canceled, incomplete, etc.) are treated as free

        return "free"

    def is_subscribed(self) -> bool:
        """Check if account has an active subscription (RevenueCat or Stripe)"""
        return self.account_status() == "paid"

    @property
    def referral_link(self) -> str:
        """Generate the full referral link for this account"""
        from django.conf import settings

        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        return f"{frontend_url}/referral/{self.referral_code}"

    def initialize_entity(self) -> "Entity | None":
        """
        Initialize an entity for this account, creating tasks and goals.
        Returns the entity if created, None if it already exists.
        """
        from lms.calendars.models import Goal

        # Set sleep_until far in the future to prevent check_entities_wakeup from waking it.
        # The onboarding agent will handle initial messages (it only checks status, not sleep_until).
        # After onboarding, the SMS webhook will call possibly_run_entity with wakeup=True to wake it.
        far_future = timezone.now() + timedelta(days=365)

        entity, created = Entity.objects.get_or_create(
            account=self,
            defaults={
                "name": self.tutor_name,
                "timezone": self.timezone or "America/New_York",
                "sleep_until": far_future,
            },
        )
        entity.sleep(far_future)
        if not created:
            logger.info(f"Entity already exists for account {self.id}")
            return None

        # Get or create parent profile for goals
        parent_profile = UserProfile.objects.filter(account=self, profile_type="parent").first()

        # Create initial goals for the parent using experiment-driven approach
        # Strategy: Each funnel stage can have experiments that replace default goals
        if parent_profile:
            today = date.today()

            from experiments.treatments import (
                DEFAULT_GOALS_BY_STAGE,
                FUNNEL_EXPERIMENTS,
                get_default_goals_for_stage,
                get_treatment,
            )

            experiments_assigned = {}
            all_goals = []

            # Process each funnel stage
            for stage in DEFAULT_GOALS_BY_STAGE.keys():
                experiment = FUNNEL_EXPERIMENTS.get(stage)

                if experiment:
                    # This stage has an experiment - check PostHog for the variant
                    variant = posthog.get_feature_flag(
                        experiment.flag_key,
                        distinct_id=self.account_phone,
                        person_properties={
                            "registration_source": self.registration_source,
                            "timezone": self.timezone,
                        },
                    )

                    # Default to control if no variant assigned, ensure it's a string
                    variant_str = str(variant) if variant else "control"
                    treatment = get_treatment(stage, variant_str)

                    experiments_assigned[stage] = {
                        "flag": experiment.flag_key,
                        "variant": variant_str,
                        "metric": experiment.primary_metric,
                    }

                    # Get goals for this stage:
                    # - If treatment.goals is None (control), use default goals
                    # - If treatment.goals is a list, use those instead
                    if treatment.goals is None:
                        stage_goals = get_default_goals_for_stage(stage)
                    else:
                        stage_goals = treatment.goals
                else:
                    # No experiment for this stage - just use default goals
                    stage_goals = get_default_goals_for_stage(stage)

                all_goals.extend(stage_goals)

            # 3. Create all goals in the database
            for goal_config in all_goals:
                start_day = goal_config.get("start_day", 0)
                duration_days = goal_config.get("duration_days", 7)

                Goal.objects.create(
                    user_profile=parent_profile,
                    title=goal_config["title"],
                    objective=goal_config["objective"].strip(),
                    start_date=today + timedelta(days=start_day),
                    end_date=today + timedelta(days=start_day + duration_days),
                )

            # 4. Track which experiments/variants were applied
            try:
                posthog.capture(
                    distinct_id=self.account_phone,
                    event="experiments_assigned",
                    properties=experiments_assigned,
                )
            except Exception as e:
                logger.warning(f"Failed to send PostHog experiments_assigned event: {e}")

            # 5. Store experiment assignments as person properties so they persist forever
            # This allows us to analyze behavior by experiment variant at any point in time
            try:
                experiment_person_properties = {}
                for stage, assignment in experiments_assigned.items():
                    # Store as flat properties like "experiment_signup_to_reply_variant"
                    experiment_person_properties[f"experiment_{stage}_variant"] = assignment["variant"]
                    experiment_person_properties[f"experiment_{stage}_flag"] = assignment["flag"]

                posthog.identify(
                    distinct_id=self.account_phone,
                    properties=experiment_person_properties,
                )
            except Exception as e:
                logger.warning(f"Failed to set PostHog experiment person properties: {e}")

            # Goal: Find out where they heard about us (only if no UTM source)
            # Check if signup_metadata has no utm_source
            has_utm_source = (
                self.signup_metadata
                and isinstance(self.signup_metadata, dict)
                and self.signup_metadata.get("utm_source")
            )
            if not has_utm_source:
                Goal.objects.create(
                    user_profile=parent_profile,
                    title="Find out where they heard about us",
                    objective=dedent("""
                        We don't know how this family found Acadia. After the first session is scheduled
                        and confirmed, casually ask how they heard about us.
                        
                        Keep it natural and conversational - something like:
                        - "By the way, how did you find out about Acadia?"
                        - "I'm curious - what made you decide to try Acadia?"
                        
                        Common answers might be:
                        - Friend/family referral
                        - Social media (Facebook, Instagram, TikTok)
                        - Google search
                        - School recommendation
                        - Online ad
                        
                        Don't push if they don't want to answer. This is just helpful info for us
                        to know what's working. Prioritize other goals first if you don't think
                        you can get this info.
                    """).strip(),
                    start_date=today,
                    end_date=today + timedelta(days=3),
                )

        notification_parts = ["✨ *New Signup!*\n"]
        notification_parts.append(f"📞 *Phone:* {self.account_phone}")

        if self.signup_metadata:
            utm_source = self.signup_metadata.get("utm_source")
            utm_campaign = self.signup_metadata.get("utm_campaign")
            if utm_source:
                notification_parts.append(f"📊 *Source:* {utm_source}")
            if utm_campaign:
                notification_parts.append(f"🎯 *Campaign:* {utm_campaign}")

        if self.referred_by:
            referrer_profile = UserProfile.objects.filter(account=self.referred_by, profile_type="parent").first()
            referrer_name = (
                referrer_profile.name if referrer_profile and referrer_profile.name else self.referred_by.account_phone
            )
            notification_parts.append(f"🎉 *Referred by:* {referrer_name} ({self.referred_by.account_phone})")

        send_slack_message(SlackChannel.SIGNUPS, "\n".join(notification_parts))

        # Track entity initialization in PostHog
        try:
            properties = {
                "account_id": str(self.id),
                "entity_id": entity.id,
                "platform": self.registration_source,
                "referred_by": str(self.referred_by.id) if self.referred_by else None,
                "attribution": self.attribution,
            }
            # Include signup metadata (UTM params, etc.)
            if self.signup_metadata:
                properties.update(self.signup_metadata)

            posthog.capture(
                distinct_id=self.account_phone,
                event="entity_initialized",
                properties=properties,
            )
        except Exception as e:
            logger.warning(f"Failed to send PostHog entity_initialized event: {e}")

        # Don't start the entity here - let the onboarding agent handle first messages
        # The entity will be started when needed via SMS webhook or explicit wakeup

        return entity


@receiver(post_delete, sender=Account)
def delete_user_and_entity(sender, instance, **kwargs):
    Entity.objects.filter(account=instance).delete()
    instance.user.delete()


@receiver(post_save, sender=Account)
def sync_timezone_with_entity(sender, instance, **kwargs):
    entity = Entity.objects.filter(account=instance).first()
    if entity:
        entity.timezone = instance.timezone
        entity.save()


class UserProfile(models.Model):
    """
    Represents a user profile in the system (parent or student).
    """

    class ProfileType(models.TextChoices):
        PARENT = "parent", "Parent"
        STUDENT = "student", "Student"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, null=True, blank=True)  # Make name optional
    profile_type = models.CharField(max_length=10, choices=ProfileType.choices)
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=255, unique=True, blank=True, null=True)
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    last_sms_read_time = models.DateTimeField(
        blank=True,
        null=True,
    )

    voice_id = models.CharField(
        max_length=255,
        default="cartesia/228fca29-3a0a-435c-8728-5cb483251068",
        help_text="ElevenLabs voice ID for TTS",
    )

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"
        ordering = ["name"]

    def __str__(self):
        if self.name is None:
            return f"{self.profile_type} ({self.account})"
        return f"{self.name} ({self.profile_type})"

    @property
    def is_student(self):
        return self.profile_type == self.ProfileType.STUDENT

    @property
    def entity(self) -> "Entity | None":
        try:
            return Entity.objects.get(account=self.account)
        except Entity.DoesNotExist:
            return None


@receiver(post_save, sender=UserProfile)
def send_fb_event_on_first_student_profile(sender, instance: UserProfile, created: bool, **kwargs):
    """
    Send a Facebook Conversions API event when an account's first student profile is created.
    This is a good proxy for an engaged lead.
    """
    if not created:
        return

    if instance.profile_type != UserProfile.ProfileType.STUDENT:
        return

    # Check if this is the first student profile for this account
    student_count = UserProfile.objects.filter(
        account=instance.account,
        profile_type=UserProfile.ProfileType.STUDENT,
    ).count()

    if student_count != 1:
        return

    # Get signup metadata from account for fbp/fbc cookies
    signup_metadata = instance.account.signup_metadata or {}

    try:
        from utils.facebook import send_fb_event

        send_fb_event(
            event_name="ProfileCreated",
            user_data={
                "phone": instance.account.account_phone,
                "email": instance.email,
                "external_id": str(instance.account.id),
                "fbp": signup_metadata.get("fbp"),
                "fbc": signup_metadata.get("fbc"),
            },
            custom_data={
                "student_name": instance.name,
            },
        )
        if not settings.TESTING:
            logger.info(f"Sent FB ProfileCreated event for account {instance.account.id}")
    except Exception as e:
        logger.warning(f"Failed to send FB Lead event: {e}")

    # Send PostHog event for first student profile
    try:
        posthog.capture(
            distinct_id=instance.account.account_phone,
            event="first_student_profile_created",
            properties={
                "account_id": str(instance.account.id),
                "student_name": instance.name,
                "platform": instance.account.registration_source,
            },
        )
        if not settings.TESTING:
            logger.info(f"Sent PostHog first_student_profile_created event for account {instance.account.id}")
    except Exception as e:
        logger.warning(f"Failed to send PostHog first_student_profile_created event: {e}")


class ReportCard(models.Model):
    class PriorityEnum(Enum):
        HIGH = "high"
        MEDIUM = "medium"
        LOW = "low"

    class ActionItem(BaseModel):
        """
        An action item is a specific action that you will do with the student within the next week or two.
        These are meant to be the hooks for parents to convert to your paid plan. This answers the question:
        "What will I get this week and next?"
        """

        title: str
        description: str
        priority: "ReportCard.PriorityEnum"

    class SkillLevelEnum(Enum):
        AUTOMATIC = "automatic"
        MASTERED = "mastered"
        REINFORCING = "reinforcing"
        LEARNING = "learning"
        UNTOUCHED = "untouched"

    class SkillAssessment(BaseModel):
        """
        A skill assessment is a point in time evaluation of a student's mastery of a specific skill.
        """

        skill_name: str
        skill_description: str
        skill_level: "ReportCard.SkillLevelEnum"

    class CourseObjective(BaseModel):
        """
        A course objective is a specific skill that the student will learn in a specific week of the course.

        Examples:
        - "Compound Sentences", "Reading and writing compound sentences", "Week 4"
        - "Double Digit Multiplication", "Multiplying two-digit numbers using the standard algorithm", "Week 8"
        - "Division", "Dividing two single-digit numbers quickly", "Week 3"

        Course objectives answer the question:
        "What will the ultimate outcome be for my student after this?"
        """

        title: str = Field(description="The title of the course objective")
        description: str = Field(description="The description of the course objective")
        week_number: int = Field(description="The week number of the course objective")

    class Pydantic(BaseModel):
        user_profile_id: str = Field(description="The ID of the user profile to create the report card for")
        session_date: date = Field(description="The date of the session")
        session_duration_minutes: int = Field(description="The duration of the session in minutes")

        immediate_action_items: list["ReportCard.ActionItem"] = Field(
            description="The immediate action items for the report card"
        )
        skill_assessments: list["ReportCard.SkillAssessment"] = Field(
            description="The skill assessments for the report card"
        )
        recommended_course_name: str = Field(description="The name of the recommended course")
        recommended_course_description: str = Field(description="The description of the recommended course")
        recommended_course_duration_weeks: int = Field(description="The duration of the recommended course in weeks")
        recommended_course_objectives: list["ReportCard.CourseObjective"] = Field(
            description="The course objectives for the recommended course"
        )
        tutor_notes: str = Field(description="The notes from the tutor")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    session_date = models.DateField()
    session_duration_minutes = models.IntegerField()

    immediate_action_items = models.JSONField(default=list)
    skill_assessments = models.JSONField(default=list)

    recommended_course_name = models.CharField(max_length=255)
    recommended_course_duration_weeks = models.IntegerField()
    recommended_course_description = models.TextField()
    recommended_course_objectives = models.JSONField(default=list)

    tutor_notes = models.TextField()

    class Meta:
        verbose_name = "Report Card"
        verbose_name_plural = "Report Cards"

    def to_pydantic(self) -> Pydantic:
        return self.Pydantic.model_validate(self)

    @classmethod
    def from_pydantic(cls, pydantic: Pydantic):
        return cls(
            user_profile_id=pydantic.user_profile_id,
            session_date=pydantic.session_date,
            session_duration_minutes=pydantic.session_duration_minutes,
            immediate_action_items=[i.model_dump(mode="json") for i in pydantic.immediate_action_items],
            skill_assessments=[i.model_dump(mode="json") for i in pydantic.skill_assessments],
            recommended_course_name=pydantic.recommended_course_name,
            recommended_course_duration_weeks=pydantic.recommended_course_duration_weeks,
            recommended_course_description=pydantic.recommended_course_description,
            recommended_course_objectives=[i.model_dump(mode="json") for i in pydantic.recommended_course_objectives],
            tutor_notes=pydantic.tutor_notes,
        )

    def __str__(self):
        return f"{self.user_profile} - {self.session_date}"


class LearningWrapped(models.Model):
    """
    A "Spotify Wrapped" style summary of a student's learning journey for a given year.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="learning_wrapped")
    year = models.IntegerField(help_text="The year this wrapped is for (e.g., 2025)")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # All the wrapped data stored as JSON
    data = models.JSONField(
        help_text="Complete wrapped data including time stats, progress, patterns, breakthroughs, and tutor observations"
    )

    class Meta:
        verbose_name = "Learning Wrapped"
        verbose_name_plural = "Learning Wrappeds"
        unique_together = ["user_profile", "year"]
        ordering = ["-year", "-created_at"]

    def __str__(self):
        return f"{self.user_profile.name}'s {self.year} Wrapped"


class LedgerShareLink(models.Model):
    """
    A shareable link for viewing an account's ledger without authentication.
    Useful for sharing with investors or other stakeholders.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="share_links")
    token = models.CharField(max_length=64, unique=True, db_index=True)
    description = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional description for this share link (e.g., 'For investor demo')",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this link expires. Null means never expires.",
    )
    created_by = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_share_links",
        help_text="Admin who created this share link",
    )
    view_count = models.IntegerField(default=0, help_text="Number of times this link has been viewed")

    class Meta:
        verbose_name = "Ledger Share Link"
        verbose_name_plural = "Ledger Share Links"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Share link for {self.account} (expires: {self.expires_at or 'never'})"

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = self._generate_token()
        super().save(*args, **kwargs)

    def _generate_token(self) -> str:
        """Generate a secure random token"""
        import secrets

        return secrets.token_urlsafe(32)

    def is_expired(self) -> bool:
        """Check if this share link has expired"""
        if self.expires_at is None:
            return False
        return timezone.now() > self.expires_at

    def is_valid(self) -> bool:
        """Check if this share link is still valid"""
        return not self.is_expired()

    def increment_view_count(self):
        """Increment the view count"""
        self.view_count += 1
        self.save(update_fields=["view_count"])
