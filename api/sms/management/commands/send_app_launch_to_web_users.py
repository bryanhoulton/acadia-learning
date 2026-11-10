import logging
import time

from django.core.management.base import BaseCommand

from api.settings import TWILIO_PHONE_NUMBER, twilio
from lms.accounts.models import Account
from sms.models import SMSMessage
from utils.slack import SlackChannel, send_slack_message

logger = logging.getLogger("django")
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Send app launch announcement SMS to all non-mobile account phone numbers"  # noqa: A003

    def add_arguments(self, parser):
        parser.add_argument(
            "--message",
            type=str,
            help="Custom message to send (default: app launch announcement)",
            default=None,
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

    def get_app_launch_message(self) -> tuple[str, str]:
        """Generate the app launch announcement messages (text message and link message)"""
        text_message = (
            "We've launched the Acadia Learning mobile app for iOS! "
            "Download it from the App Store. Questions? Reply here."
        )
        link_message = "https://apps.apple.com/us/app/acadia-learning/id6754585266"
        return (text_message, link_message)

    def handle(self, *args, **options):
        custom_message = options.get("message")
        dry_run = options.get("dry_run", False)
        no_confirm = options.get("no_confirm", False)
        phone = options.get("phone", None)

        # Get all non-mobile accounts (registration_source != "mobile")
        non_mobile_accounts = Account.objects.exclude(registration_source=Account.RegistrationSource.MOBILE)

        # Filter by phone if specified
        if phone:
            non_mobile_accounts = non_mobile_accounts.filter(account_phone=phone)

        count = non_mobile_accounts.count()
        self.stdout.write(f"\n📊 Found {count} non-mobile accounts\n")

        # Determine messages to send
        if custom_message:
            text_message = custom_message
            link_message = None
        else:
            text_message, link_message = self.get_app_launch_message()

        # Show preview
        self.stdout.write(self.style.WARNING("=" * 60))
        self.stdout.write(self.style.WARNING("APP LAUNCH ANNOUNCEMENT"))
        self.stdout.write(self.style.WARNING("=" * 60))
        self.stdout.write(f"\nMessage 1:\n{text_message}\n")
        if link_message:
            self.stdout.write(f"\nMessage 2 (link preview):\n{link_message}\n")
        self.stdout.write(self.style.WARNING("=" * 60))
        self.stdout.write(f"Recipients: {count} non-mobile accounts\n")
        self.stdout.write(f"Total messages per recipient: {2 if link_message else 1}\n")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE - No messages will be sent"))
            total_messages = count * (2 if link_message else 1)
            self.stdout.write(
                f"Would send {total_messages} messages ({count} recipients × {2 if link_message else 1} messages each) to:\n"
            )
            for account in non_mobile_accounts[:10]:  # Show first 10
                self.stdout.write(f"  • {account.account_phone}")
            if count > 10:
                self.stdout.write(f"  ... and {count - 10} more\n")
            return

        # Confirmation step
        if not no_confirm:
            total_messages = count * (2 if link_message else 1)
            self.stdout.write(self.style.ERROR("⚠️  WARNING: This will send messages to all non-mobile accounts!"))
            confirm = (
                input(
                    f"\nSend {total_messages} messages ({count} recipients × {2 if link_message else 1} messages each)? Type 'yes' to confirm: "
                )
                .strip()
                .lower()
            )
            if confirm != "yes":
                self.stdout.write(self.style.WARNING("\n❌ Operation cancelled."))
                return
            self.stdout.write("")

        if count == 0:
            self.stdout.write(self.style.WARNING("No non-mobile accounts found to send messages to"))
            return

        # Send messages
        successful = 0
        failed = 0
        failed_numbers = []
        message_count = 0

        self.stdout.write("📤 Sending messages...\n")

        for i, account in enumerate(non_mobile_accounts, 1):
            try:
                # Send first message (text)
                message_count += 1
                twilio_message1 = twilio.messages.create(
                    to=account.account_phone,
                    from_=TWILIO_PHONE_NUMBER,
                    body=text_message,
                )

                # Store in database
                SMSMessage.objects.create(
                    from_number=TWILIO_PHONE_NUMBER,
                    to_number=account.account_phone,
                    body=text_message,
                    twilio_sid=twilio_message1.sid,
                    direction="outbound",
                )

                # Send Slack notification for first message
                send_slack_message(
                    SlackChannel.SMS_MESSAGES,
                    f"📤 App Launch SMS (1/2)\nTo: {account.account_phone}\nMessage: {text_message}\n(SID: {twilio_message1.sid})",
                )

                # Send second message (link) if we have one
                if link_message:
                    message_count += 1
                    twilio_message2 = twilio.messages.create(
                        to=account.account_phone,
                        from_=TWILIO_PHONE_NUMBER,
                        body=link_message,
                    )

                    # Store in database
                    SMSMessage.objects.create(
                        from_number=TWILIO_PHONE_NUMBER,
                        to_number=account.account_phone,
                        body=link_message,
                        twilio_sid=twilio_message2.sid,
                        direction="outbound",
                    )

                    # Send Slack notification for second message
                    send_slack_message(
                        SlackChannel.SMS_MESSAGES,
                        f"📤 App Launch SMS (2/2 - Link)\nTo: {account.account_phone}\nMessage: {link_message}\n(SID: {twilio_message2.sid})",
                    )

                successful += 1
                messages_sent = 2 if link_message else 1
                self.stdout.write(f"  [{i}/{count}] ✓ {account.account_phone} ({messages_sent} messages)")
                logger.info(f"App launch messages sent to {account.account_phone} ({messages_sent} messages)")

                # Rate limiting: small delay for toll-free numbers (they have higher limits but still need some throttling)
                # Toll-free can typically handle ~1 msg/sec, so 0.5s delay between accounts is conservative
                if i < count:  # Don't wait after the last account
                    time.sleep(0.5)
            except Exception as e:  # noqa: BLE001
                failed += 1
                failed_numbers.append(account.account_phone)
                self.stdout.write(self.style.ERROR(f"  [{i}/{count}] ✗ {account.account_phone}: {str(e)}"))
                logger.error(f"Failed to send app launch messages to {account.account_phone}: {str(e)}")

        # Summary
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS(f"✓ Accounts processed successfully: {successful}"))
        self.stdout.write(self.style.SUCCESS(f"✓ Total messages sent: {message_count}"))
        if failed > 0:
            self.stdout.write(self.style.ERROR(f"✗ Accounts failed: {failed}"))
            for number in failed_numbers:
                self.stdout.write(f"  - {number}")
        else:
            self.stdout.write(self.style.SUCCESS("All app launch messages sent successfully!"))
        self.stdout.write("=" * 60 + "\n")
