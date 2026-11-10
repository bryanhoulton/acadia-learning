import logging

from django.core.management.base import BaseCommand

from api.settings import TWILIO_PHONE_NUMBER, twilio
from lms.accounts.models import Account
from sms.models import SMSMessage
from utils.slack import SlackChannel, send_slack_message

logger = logging.getLogger("django")
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Send an SMS message to all paid user account phone numbers and store in database"  # noqa: A003

    def add_arguments(self, parser):
        parser.add_argument(
            "message",
            type=str,
            help="The content of the SMS message to send to all paid users",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be sent without actually sending messages",
        )
        parser.add_argument(
            "--no-confirm",
            action="store_true",
            help="Skip confirmation prompt (use with caution)",
        )
        parser.add_argument(
            "--phone",
            type=str,
            help="Send to a single account by phone number (e.g., +12025550113)",
        )

    def handle(self, *args, **options):
        message_body = options["message"]
        dry_run = options.get("dry_run", False)
        no_confirm = options.get("no_confirm", False)
        phone = options.get("phone", None)

        # Get all paid users (those with stripe_customer_id)
        paid_accounts = Account.objects.filter(stripe_customer_id__isnull=False).exclude(stripe_customer_id="")

        # Filter by phone if specified
        if phone:
            paid_accounts = paid_accounts.filter(account_phone=phone)

        count = paid_accounts.count()
        self.stdout.write(f"\n📊 Found {count} paid user accounts\n")

        # Show preview
        self.stdout.write(self.style.WARNING("=" * 60))
        self.stdout.write(self.style.WARNING("MESSAGE PREVIEW"))
        self.stdout.write(self.style.WARNING("=" * 60))
        self.stdout.write(f"\n{message_body}\n")
        self.stdout.write(self.style.WARNING("=" * 60))
        self.stdout.write(f"Recipients: {count} paid users\n")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE - No messages will be sent"))
            self.stdout.write(f"Would send {count} messages to:\n")
            for account in paid_accounts[:10]:  # Show first 10
                self.stdout.write(f"  • {account.account_phone}")
            if count > 10:
                self.stdout.write(f"  ... and {count - 10} more\n")
            return

        # Confirmation step
        if not no_confirm:
            self.stdout.write(self.style.ERROR("⚠️  WARNING: This will send messages to all paid users!"))
            confirm = input(f"\nSend {count} messages? Type 'yes' to confirm: ").strip().lower()
            if confirm != "yes":
                self.stdout.write(self.style.WARNING("\n❌ Operation cancelled."))
                return
            self.stdout.write("")

        if count == 0:
            self.stdout.write(self.style.WARNING("No paid users found to send messages to"))
            return

        # Send messages
        successful = 0
        failed = 0
        failed_numbers = []

        self.stdout.write("📤 Sending messages...\n")

        for i, account in enumerate(paid_accounts, 1):
            try:
                # Send via Twilio
                twilio_message = twilio.messages.create(
                    to=account.account_phone,
                    from_=TWILIO_PHONE_NUMBER,
                    body=message_body,
                )

                # Store in database
                SMSMessage.objects.create(
                    from_number=TWILIO_PHONE_NUMBER,
                    to_number=account.account_phone,
                    body=message_body,
                    twilio_sid=twilio_message.sid,
                    direction="outbound",
                )

                # Send Slack notification
                send_slack_message(
                    SlackChannel.SMS_MESSAGES,
                    f"📤 Outbound SMS\nTo: {account.account_phone}\nMessage: {message_body}\n(SID: {twilio_message.sid})",
                )

                successful += 1
                self.stdout.write(f"  [{i}/{count}] ✓ {account.account_phone}")
                logger.info(f"Message sent to {account.account_phone} (SID: {twilio_message.sid})")
            except Exception as e:  # noqa: BLE001
                failed += 1
                failed_numbers.append(account.account_phone)
                self.stdout.write(self.style.ERROR(f"  [{i}/{count}] ✗ {account.account_phone}: {str(e)}"))
                logger.error(f"Failed to send message to {account.account_phone}: {str(e)}")

        # Summary
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS(f"✓ Messages sent successfully: {successful}"))
        if failed > 0:
            self.stdout.write(self.style.ERROR(f"✗ Messages failed to send: {failed}"))
            for number in failed_numbers:
                self.stdout.write(f"  - {number}")
        else:
            self.stdout.write(self.style.SUCCESS("All messages sent successfully!"))
        self.stdout.write("=" * 60 + "\n")
