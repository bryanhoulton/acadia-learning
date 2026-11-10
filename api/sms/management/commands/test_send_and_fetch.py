import logging

from django.core.management.base import BaseCommand

from api.settings import TWILIO_PHONE_NUMBER, twilio
from sms.models import SMSMessage
from sms.tasks import fetch_all_sms_prices_batch

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send 10 test SMS messages and fetch prices with specified batch size"

    def add_arguments(self, parser):
        parser.add_argument(
            "--to",
            type=str,
            default="+12025550113",
            help="Phone number to send messages to",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=4,
            help="Batch size for fetching prices",
        )
        parser.add_argument(
            "--skip-send",
            action="store_true",
            help="Skip sending messages and just fetch prices",
        )

    def handle(self, *args, **options):
        to_number = options["to"]
        batch_size = options["batch_size"]
        skip_send = options["skip_send"]

        if not skip_send:
            self.stdout.write(self.style.SUCCESS(f"Sending 10 test messages to {to_number}..."))

            # Send 10 test messages
            messages_created = 0
            for i in range(1, 11):
                try:
                    msg_body = f"Test message #{i} - This is a test SMS for batch processing"

                    # Send via Twilio
                    twilio_msg = twilio.messages.create(
                        to=to_number,
                        from_=TWILIO_PHONE_NUMBER,
                        body=msg_body,
                    )

                    # Store in database
                    db_msg = SMSMessage.objects.create(
                        from_number=TWILIO_PHONE_NUMBER,
                        to_number=to_number,
                        body=msg_body,
                        twilio_sid=twilio_msg.sid,
                        direction="outbound",
                    )

                    messages_created += 1
                    self.stdout.write(f"  ✓ Message {i}: {twilio_msg.sid} (DB ID: {db_msg.id})")
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"  ✗ Message {i} failed: {e}"))

            self.stdout.write(self.style.SUCCESS(f"\nSuccessfully created {messages_created}/10 messages\n"))
        else:
            self.stdout.write("Skipping message send, fetching prices...\n")

        # Fetch prices with specified batch size
        self.stdout.write(self.style.SUCCESS(f"Fetching prices with batch size of {batch_size}..."))
        result = fetch_all_sms_prices_batch(batch_size=batch_size)

        self.stdout.write(self.style.SUCCESS("\n=== RESULTS ==="))
        self.stdout.write(f"Total messages: {result['total']}")
        self.stdout.write(f"Processed: {result['processed']}")
        self.stdout.write(f"Successful: {result['successful']}")
        self.stdout.write(f"Failed: {result['failed']}")
        self.stdout.write(f"Total cost: ${result['total_cost']:.4f}")
