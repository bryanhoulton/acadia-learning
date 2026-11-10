import os
import uuid

from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone

from api.settings import TWILIO_PHONE_NUMBER


class SMSMessage(models.Model):
    from_number = models.CharField(max_length=20)
    to_number = models.CharField(max_length=20)
    body = models.TextField()
    # Twilio fields (nullable for Linq messages)
    twilio_sid = models.CharField(max_length=50, null=True, blank=True)
    # Linq fields (nullable for Twilio messages)
    linq_chat_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    linq_message_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    direction = models.CharField(max_length=10, choices=[("inbound", "Inbound"), ("outbound", "Outbound")])
    created_at = models.DateTimeField(default=timezone.now)
    has_attachments = models.BooleanField(default=False)
    price = models.DecimalField(max_digits=10, decimal_places=5, null=True, blank=True)
    price_unit = models.CharField(max_length=3, default="USD")  # Always USD

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.from_number} -> {self.to_number}: {self.body}"


class SMSAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)  # noqa: A003
    message = models.ForeignKey(SMSMessage, on_delete=models.CASCADE, related_name="attachments")
    media_url = models.URLField()
    content_type = models.CharField(max_length=100)
    created_at = models.DateTimeField(default=timezone.now)
    # Transcription for audio attachments (voice messages)
    transcription = models.TextField(null=True, blank=True)
    transcription_error = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        msg_id = self.message.twilio_sid or self.message.linq_message_id or self.message.id
        return f"Attachment for {msg_id}"

    def is_audio(self) -> bool:
        """Check if this attachment is an audio file (voice message)."""
        return self.content_type.startswith("audio/")


@receiver(post_delete, sender="lms_accounts.Account")
def delete_account_sms_messages(sender, instance, **kwargs):
    # Don't delete messages for system phone numbers - this would wipe ALL messages
    linq_phone = os.environ.get("LINQ_PHONE_NUMBER")
    if instance.account_phone == TWILIO_PHONE_NUMBER:
        return
    if linq_phone and instance.account_phone == linq_phone:
        return
    SMSMessage.objects.filter(to_number=instance.account_phone).delete()
    SMSMessage.objects.filter(from_number=instance.account_phone).delete()
