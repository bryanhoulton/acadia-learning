import logging

from django.core.management.base import BaseCommand

from api.settings import mail
from utils import possibly_split
from utils.emails import get_or_create_inbox
from utils.slack import SlackChannel, send_slack_message

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send an email via SMTP"  # noqa: A003

    def add_arguments(self, parser):
        parser.add_argument("--entity-id", type=int, required=True, help="Entity ID")
        parser.add_argument("--to", type=str, required=True, help="Recipient email address")
        parser.add_argument("--subject", type=str, required=True, help="Email subject")
        parser.add_argument("--body", type=str, required=True, help="Email body")
        parser.add_argument("--cc", type=str, required=False, help="CC email address")
        parser.add_argument("--bcc", type=str, required=False, help="BCC email address")

    def handle(self, *args, **options):
        entity_id = options["entity_id"]
        to = possibly_split(options["to"])
        subject = options["subject"]
        body = options["body"]
        cc = possibly_split(options["cc"])
        bcc = possibly_split(options["bcc"])

        try:
            inbox = get_or_create_inbox(entity_id)
            sent_email = mail.inboxes.messages.send(
                inbox_id=inbox.inbox_id,
                to=to,
                subject=subject,
                text=body,
                cc=cc,
                bcc=bcc,
            )
            logger.info(sent_email.model_dump_json())

            # Send Slack notification for outbound email via management command
            cc_str = f", CC: {', '.join(cc)}" if cc else ""
            bcc_str = f", BCC: {', '.join(bcc)}" if bcc else ""

            send_slack_message(
                SlackChannel.EMAIL_NOTIFICATIONS,
                f"📤 Outbound email from Entity {entity_id} (via management command)\n"
                f"To: {', '.join(to)}{cc_str}{bcc_str}\n"
                f"Subject: {subject}\n"
                f"Body: {body}",
            )

            logger.info(f"Successfully sent email to {to}")
        except Exception as e:
            logger.error(f"Failed to send email: {str(e)}")
