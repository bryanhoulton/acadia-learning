import logging

from django.core.management.base import BaseCommand

from sms.tasks import fetch_all_sms_prices_batch

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Fetch prices from Twilio for all SMS messages that have a SID but no price"

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-size",
            type=int,
            default=100,
            help="Number of messages to process per batch (default: 100)",
        )

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        self.stdout.write(self.style.SUCCESS(f"Starting SMS price fetch with batch size of {batch_size}..."))

        # Run the Celery task
        result = fetch_all_sms_prices_batch.delay(batch_size=batch_size)

        self.stdout.write(self.style.SUCCESS(f"Task started with ID: {result.id}"))
        self.stdout.write(self.style.SUCCESS("Fetching prices in batches. Check logs for progress."))
