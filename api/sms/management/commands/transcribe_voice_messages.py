"""Management command to backfill transcriptions for existing voice messages."""

import logging

import requests
from django.core.management.base import BaseCommand

from sms.models import SMSAttachment
from sms.tasks import is_transcribable_audio, transcribe_voice_message

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Transcribe existing voice message attachments that don't have transcriptions yet"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be transcribed without actually doing it",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of attachments to process",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously instead of queuing Celery tasks",
        )
        parser.add_argument(
            "--fix-content-types",
            action="store_true",
            help="Fix incorrect content types by fetching the actual content type from URLs",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = options["limit"]
        sync = options["sync"]
        fix_content_types = options["fix_content_types"]

        # Fix content types if requested
        if fix_content_types:
            self._fix_content_types(dry_run)

        # Find all audio attachments without transcriptions
        attachments = SMSAttachment.objects.filter(
            transcription__isnull=True,
            transcription_error__isnull=True,
        )

        # Filter to only audio types
        audio_attachments = []
        for att in attachments:
            if is_transcribable_audio(att.content_type):
                audio_attachments.append(att)

        total = len(audio_attachments)
        if limit:
            audio_attachments = audio_attachments[:limit]

        self.stdout.write(f"Found {total} audio attachments without transcriptions")
        if limit:
            self.stdout.write(f"Processing first {limit} attachments")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no transcriptions will be performed"))
            for att in audio_attachments:
                self.stdout.write(f"  Would transcribe: {att.id} ({att.content_type}) - {att.media_url[:60]}...")
            return

        queued = 0
        for att in audio_attachments:
            self.stdout.write(f"Processing attachment {att.id} ({att.content_type})...")

            if sync:
                # Run synchronously
                result = transcribe_voice_message(str(att.id))
                if result.get("status") == "success":
                    self.stdout.write(self.style.SUCCESS(f"  Transcribed: {result.get('transcription', '')[:50]}..."))
                else:
                    self.stdout.write(self.style.ERROR(f"  Error: {result.get('error', 'Unknown error')}"))
            else:
                # Queue as Celery task
                transcribe_voice_message.delay(str(att.id))
                self.stdout.write(f"  Queued task for attachment {att.id}")

            queued += 1

        if sync:
            self.stdout.write(self.style.SUCCESS(f"Processed {queued} attachments synchronously"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Queued {queued} transcription tasks"))

    def _fix_content_types(self, dry_run: bool):
        """Fix incorrect content types by fetching actual content from URLs."""

        from api.settings import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN

        # Find attachments with potentially wrong content types
        # (text/html or application/xml are commonly wrong for Linq/Twilio)
        suspicious_types = ["text/html", "application/xml", "application/octet-stream"]
        attachments = SMSAttachment.objects.filter(content_type__in=suspicious_types)

        self.stdout.write(f"Found {attachments.count()} attachments with potentially incorrect content types")

        fixed = 0
        for att in attachments:
            try:
                # Handle Twilio URLs with authentication
                auth = None
                if "api.twilio.com" in att.media_url:
                    sid = TWILIO_ACCOUNT_SID
                    token = TWILIO_AUTH_TOKEN
                    if sid and token:
                        auth = (sid, token)

                # Fetch actual content to get real content type
                response = requests.get(att.media_url, timeout=30, auth=auth, stream=True)
                response.raise_for_status()
                actual_content_type = response.headers.get("content-type", "").split(";")[0].strip()

                if actual_content_type and actual_content_type != att.content_type:
                    self.stdout.write(f"  {att.id}: {att.content_type} -> {actual_content_type}")
                    if not dry_run:
                        att.content_type = actual_content_type
                        att.save(update_fields=["content_type"])
                    fixed += 1

            except requests.RequestException as e:
                self.stdout.write(self.style.WARNING(f"  {att.id}: Failed to fetch - {e}"))

        action = "Would fix" if dry_run else "Fixed"
        self.stdout.write(self.style.SUCCESS(f"{action} {fixed} content types"))
