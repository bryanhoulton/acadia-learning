import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import boto3
from agentmail.threads.types.thread_preview import ThreadPreview
from botocore.exceptions import ClientError
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone as django_timezone

from api.settings import mail
from sms.models import SMSMessage
from utils.emails import get_or_create_inbox

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_s3_client():
    """Cached S3 client to avoid repeated credential discovery."""
    return boto3.client("s3")


User = get_user_model()


def generate_slug():
    return str(uuid.uuid4())[:8]


def get_default_adapters():
    return ["sms_linq", "system", "email", "LMS", "documents", "sessions"]


class Entity(models.Model):
    """
    Entity model with a unique access key
    """

    class EntityStatus(models.TextChoices):
        RUNNING = "running"
        ON_CALL = "on_call"
        SLEEPING = "sleeping"

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    session_model = models.CharField(max_length=255, default="claude-haiku-4-5")
    background_model = models.CharField(max_length=255, default="claude-sonnet-4-5")
    reasoning_effort = models.CharField(max_length=255, default="high")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    adapters = models.JSONField(default=get_default_adapters)
    sleep_until = models.DateTimeField(blank=True, null=True)
    time_offset = models.IntegerField(default=0, help_text="Minutes offset used for simulated time shifts in testing")
    timezone = models.CharField(
        max_length=255,
        help_text="Timezone in IANA format (e.g., America/New_York)",
        default="UTC",
        blank=True,
        null=True,
    )
    max_messages = models.IntegerField(default=50)
    status = models.CharField(max_length=255, choices=EntityStatus.choices, default=EntityStatus.SLEEPING)
    run_started_at = models.DateTimeField(blank=True, null=True)
    last_email_read_time = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Timestamp when entity last read email messages",
    )
    account = models.ForeignKey("lms_accounts.Account", on_delete=models.CASCADE)
    api_key = models.CharField(max_length=128, unique=True, db_index=True, null=True, blank=True)

    def __str__(self):
        return str(self.account)

    class Meta:
        verbose_name_plural = "Entities"

    def should_wakeup(self):
        if self.sleep_until is None:
            return True

        # Apply the time offset to the current time
        return self.sleep_until <= self.current_time

    @property
    def current_time(self) -> datetime:
        return django_timezone.now().astimezone(
            ZoneInfo(self.timezone or "UTC"),
        ) + timedelta(minutes=self.time_offset)

    def sleep(self, until: datetime):
        self.sleep_until = until
        self.status = Entity.EntityStatus.SLEEPING
        self.run_started_at = None
        self.save(update_fields=["sleep_until", "status", "run_started_at"])

    def wake(self):
        self.sleep_until = None
        self.status = Entity.EntityStatus.RUNNING
        self.run_started_at = django_timezone.now()
        self.save(update_fields=["sleep_until", "status", "run_started_at"])

    def join_call(self):
        from entities.services import DRMService

        self.status = Entity.EntityStatus.ON_CALL
        self.save(update_fields=["status"])
        drm = DRMService(self.id)
        drm.log_messages(
            [
                {
                    "type": "message",
                    "role": "system",
                    "content": "The user just joined the call, causing you to be pulled into it automatically.",
                }
            ]
        )

    def leave_call(self):
        from entities.services import DRMService

        self.status = Entity.EntityStatus.SLEEPING
        self.save(update_fields=["status"])
        drm = DRMService(self.id)
        drm.log_messages(
            [
                {
                    "type": "message",
                    "role": "system",
                    "content": "You just left a call",
                }
            ]
        )

    def has_unread_sms(self) -> list[str]:
        """Return a list of contact names that have unread SMS messages."""
        from lms.accounts.models import Account, UserProfile

        contacts_with_unread = []
        account = Account.objects.filter(entity=self).first()
        if not account:
            return []

        # Get all profiles for this entity
        profiles = UserProfile.objects.filter(account=account)

        # Check each contact for unread messages
        for profile in profiles:
            has_unread = False

            if not profile.last_sms_read_time:
                # If never read before, check if any messages exist
                messages_exist = SMSMessage.objects.filter(Q(from_number=profile.phone)).exists()
                if messages_exist:
                    has_unread = True
            else:
                # Check if any messages are newer than last read time
                unread_exists = SMSMessage.objects.filter(
                    Q(from_number=profile.phone),
                    created_at__gt=profile.last_sms_read_time,
                ).exists()
                if unread_exists:
                    has_unread = True

            if has_unread:
                # Use contact name if available, otherwise use phone number
                contact_name = profile.name or profile.phone
                contacts_with_unread.append(contact_name)

        return contacts_with_unread

    def has_unread_emails(self) -> list[ThreadPreview]:
        """Check if entity has any unread emails and return their thread previews."""
        inbox = get_or_create_inbox(self.id)
        threads_response = mail.inboxes.threads.list(inbox_id=inbox.inbox_id)
        compare_time = self.last_email_read_time or datetime(1970, 1, 1, tzinfo=UTC)

        # Ensure compare_time is timezone-aware
        if compare_time.tzinfo is None:
            compare_time = django_timezone.make_aware(compare_time)

        return [
            thread.preview
            for thread in threads_response.threads or []
            if thread.preview is not None and self._is_thread_newer_than(thread.timestamp, compare_time)
        ]

    def _is_thread_newer_than(self, thread_timestamp, compare_time):
        """Helper method to safely compare thread timestamp with compare time."""
        # Ensure both datetimes are timezone-aware
        if thread_timestamp.tzinfo is None:
            thread_timestamp = django_timezone.make_aware(thread_timestamp)

        if compare_time.tzinfo is None:
            compare_time = django_timezone.make_aware(compare_time)

        return thread_timestamp > compare_time

    def mins_sleeping(self) -> float:
        """
        Return the number of minutes the entity will sleep for.
        """
        if self.sleep_until is None:
            return 0

        return max(
            0,
            (self.sleep_until - self.current_time).total_seconds() / 60,
        )

    def save(self, *args, **kwargs):
        """Generate API key if not exists"""
        if not self.api_key:
            self.api_key = self._generate_api_key()

        # Ensure timezone is never null
        if not self.timezone:
            if self.account and self.account.timezone:
                self.timezone = self.account.timezone
            else:
                self.timezone = "UTC"

        super().save(*args, **kwargs)

    def _generate_api_key(self):
        """Generate a unique API key for this entity"""
        return f"entity_{secrets.token_urlsafe(32)}"


class Message(models.Model):
    id = models.AutoField(primary_key=True)
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE)
    message_data = models.JSONField()  # Stores OpenAI message format
    timestamp = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["entity", "timestamp"]),
        ]

    def __str__(self):
        return f"Message {self.id} for {self.entity}"


class FiveMinuteSummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE)
    date = models.DateField()
    hour = models.IntegerField()  # 0-23
    minute = models.IntegerField()  # 0-59 (multiples of 5)
    summary = models.TextField()
    message_count = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Five Minute Summary"
        verbose_name_plural = "Five Minute Summaries"
        unique_together = ["entity", "date", "hour", "minute"]
        indexes = [
            models.Index(fields=["entity", "date", "hour", "minute"]),
        ]

    def __str__(self):
        return f"5m {self.date} {self.hour:02d}:{self.minute:02d} for {self.entity}"


class HourlySummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE)
    date = models.DateField()
    hour = models.IntegerField()  # 0-23
    summary = models.TextField()
    message_count = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Hourly Summary"
        verbose_name_plural = "Hourly Summaries"
        unique_together = ["entity", "date", "hour"]
        indexes = [
            models.Index(fields=["entity", "date", "hour"]),
        ]

    def __str__(self):
        return f"Hourly {self.date} {self.hour}:00 for {self.entity}"


class DailySummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE)
    date = models.DateField()
    summary = models.TextField()
    message_count = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Daily Summary"
        verbose_name_plural = "Daily Summaries"
        unique_together = ["entity", "date"]
        indexes = [
            models.Index(fields=["entity", "date"]),
        ]

    def __str__(self):
        return f"Daily {self.date} for {self.entity}"


class WeeklySummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE)
    week_start_date = models.DateField()  # Monday of the week
    summary = models.TextField()
    message_count = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Weekly Summary"
        verbose_name_plural = "Weekly Summaries"
        unique_together = ["entity", "week_start_date"]
        indexes = [
            models.Index(fields=["entity", "week_start_date"]),
        ]

    def __str__(self):
        return f"Weekly {self.week_start_date} for {self.entity}"


class MonthlySummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE)
    year = models.IntegerField()
    month = models.IntegerField()  # 1-12
    summary = models.TextField()
    message_count = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Monthly Summary"
        verbose_name_plural = "Monthly Summaries"
        unique_together = ["entity", "year", "month"]
        indexes = [
            models.Index(fields=["entity", "year", "month"]),
        ]

    def __str__(self):
        return f"Monthly {self.year}-{self.month:02d} for {self.entity}"


class Document(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity = models.ForeignKey(Entity, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Document"
        verbose_name_plural = "Documents"


class Session(models.Model):
    """LiveKit session recording with AI-generated transcript and analysis."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room_name = models.CharField(max_length=255, help_text="LiveKit room name")
    profile = models.ForeignKey(
        "lms_accounts.UserProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sessions",
        help_text="Student profile for this session",
    )
    recording_url = models.URLField(max_length=500, help_text="S3 URL to the audio file")
    name = models.CharField(max_length=255, blank=True, null=True, help_text="AI-generated session name")
    description = models.TextField(blank=True, null=True, help_text="AI-generated 2-3 sentence description")
    transcript = models.TextField(blank=True, null=True, help_text="Direct word-for-word transcript from Gemini")
    timestamped_summary = models.TextField(
        blank=True, null=True, help_text="Detailed timestamped summary/timeline of session events"
    )
    audio_duration_seconds = models.FloatField(blank=True, null=True, help_text="Actual audio duration (non-silent)")
    session_started_at = models.DateTimeField(blank=True, null=True, help_text="When session started (calculated)")
    session_ended_at = models.DateTimeField(blank=True, null=True, help_text="When session ended")
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(blank=True, null=True, help_text="When Gemini processing completed")
    processing_error = models.TextField(blank=True, null=True, help_text="Any errors during processing")
    leveling_assessment = models.JSONField(
        blank=True,
        null=True,
        help_text="AI assessment of teaching level appropriateness (status, reasoning, evidence, suggested_level)",
    )

    class Meta:
        verbose_name = "Session"
        verbose_name_plural = "Sessions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["room_name"]),
        ]

    def __str__(self):
        if self.name:
            return f"{self.name}"
        return f"Session {self.room_name} at {self.created_at}"

    def get_presigned_url(self, expiration: int = 3600) -> str | None:
        """
        Generate a presigned URL for the S3 recording with refreshed credentials.

        Args:
            expiration: Time in seconds for the presigned URL to remain valid (default: 1 hour)

        Returns:
            Presigned URL string or None if unable to generate
        """
        if not self.recording_url:
            return None

        try:
            # Parse the S3 URL to extract bucket and key
            parsed_url = urlparse(self.recording_url)

            # Handle both s3:// and https://bucket.s3.region.amazonaws.com/ formats
            if parsed_url.scheme == "s3":
                bucket = parsed_url.netloc
                key = parsed_url.path.lstrip("/")
            else:
                # Extract bucket from hostname (format: bucket.s3.region.amazonaws.com)
                bucket = parsed_url.netloc.split(".")[0]
                key = parsed_url.path.lstrip("/")

            # Generate presigned URL using cached client
            presigned_url = _get_s3_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expiration,
            )
            return presigned_url

        except (ClientError, Exception) as e:
            logger.error(f"Error generating presigned URL for session {self.id}: {e}")
            return None


class Annotation(models.Model):
    class Sentiment(models.TextChoices):
        POSITIVE = "positive"
        NEGATIVE = "negative"

    class Category(models.TextChoices):
        OFF_TOPIC = "off_topic"
        UNCLEAR = "unclear"
        CANVAS_RENDERING = "canvas_rendering"
        CANVAS_COHERENCE = "canvas_coherence"
        UNRESPONSIVE = "unresponsive"
        PREMATURE_ANSWER = "premature_answer"
        BAD_EXPLANATION = "bad_explanation"
        IGNORING_STUDENT_MISUNDERSTANDING = "ignoring_student_misunderstanding"
        MISLEVELING = "misleveling"
        NOT_READING_THE_ROOM = "not_reading_the_room"
        NOT_CHANGING_PEDAGOGICAL_METHOD = "not_changing_pedagogical_method"
        CANVAS_MISUSE = "canvas_misuse"
        MISSING_MOTIVATIONAL_TECHNIQUES = "missing_motivational_techniques"
        INCOMPLETE_SCAFFOLDING = "incomplete_scaffolding"
        PREMATURE_END = "premature_end"
        BAD_PEDAGOGY = "bad_pedagogy"
        OTHER = "other"

    class Severity(models.TextChoices):
        PREFERENCE = "preference"
        RECOVERABLE_FAILURE = "recoverable_failure"
        TOTAL_FAILURE = "total_failure"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="annotations")
    start_time = models.FloatField(help_text="Start time in seconds")
    end_time = models.FloatField(help_text="End time in seconds")
    sentiment = models.CharField(max_length=255, choices=Sentiment.choices)
    category = models.CharField(max_length=255, choices=Category.choices, blank=True, null=True)
    severity = models.CharField(max_length=255, choices=Severity.choices, default=Severity.PREFERENCE)
    notes = models.TextField(blank=True, null=True, help_text="Additional notes about this annotation")
    created_by = models.ForeignKey(
        "lms_accounts.UserProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="annotations",
        help_text="Profile that created this annotation",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Annotation"
        verbose_name_plural = "Annotations"
        ordering = ["start_time"]


@receiver(post_save, sender=Session)
def send_fb_event_on_first_long_session(sender, instance: Session, **kwargs):
    """
    Send a Facebook Conversions API event when an account's first session
    over 5 minutes is completed. This indicates meaningful engagement.
    """
    MIN_DURATION_SECONDS = 300  # 5 minutes

    # Only trigger for processed sessions with sufficient duration
    if not instance.processed_at:
        return

    if not instance.audio_duration_seconds or instance.audio_duration_seconds < MIN_DURATION_SECONDS:
        return

    # Must have a profile (and therefore an account)
    if not instance.profile or not instance.profile.account:
        return

    account = instance.profile.account

    # Check if this is the first qualifying session for this account
    # (any student profile under this account)
    qualifying_session_count = Session.objects.filter(
        profile__account=account,
        processed_at__isnull=False,
        audio_duration_seconds__gte=MIN_DURATION_SECONDS,
    ).count()

    if qualifying_session_count != 1:
        return

    # Get signup metadata from account for fbp/fbc cookies
    signup_metadata = account.signup_metadata or {}

    try:
        from utils.facebook import send_fb_event

        send_fb_event(
            event_name="FirstSession",
            user_data={
                "phone": account.account_phone,
                "email": instance.profile.email,
                "external_id": str(account.id),
                "fbp": signup_metadata.get("fbp"),
                "fbc": signup_metadata.get("fbc"),
            },
            custom_data={
                "session_duration_seconds": instance.audio_duration_seconds,
                "student_name": instance.profile.name,
            },
        )
        if not settings.TESTING:
            logger.info(f"Sent FB FirstSession event for account {account.id}")
    except Exception as e:
        logger.warning(f"Failed to send FB FirstSession event: {e}")
