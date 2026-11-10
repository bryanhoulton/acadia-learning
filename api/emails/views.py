import json
import logging
import re

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework.decorators import permission_classes
from rest_framework.permissions import AllowAny

from api.settings import AGENTMAIL_DOMAIN
from entities.models import Entity
from entities.tasks import possibly_run_entity
from utils.slack import SlackChannel, send_slack_message

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
@permission_classes([AllowAny])
def webhook(request):
    try:
        data = json.loads(request.body)
        message = data.get("message")
        inbox_id: str = message.get("inbox_id")
        from_name: str = message.get("from")

        # Extract email address from "Name <email@domain.com>" format or plain email
        if "<" in from_name:
            from_email = from_name.split("<")[1].split(">")[0]
        else:
            email_match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", from_name)
            from_email = email_match.group(0) if email_match else from_name

        # If the message is from *@agentmail.to or our domain, don't do anything
        if from_email.endswith("@agentmail.to") or (
            from_email.endswith(f"@{AGENTMAIL_DOMAIN}") and from_email.startswith("acadia-")
        ):
            logger.info(f"Skipping message from {from_email}")
            return HttpResponse(status=200)

        # Handle both test-acadia and acadia formats
        match = re.search(r"(?:test-)?acadia-(\d+)@" + AGENTMAIL_DOMAIN, inbox_id)
        if not match:
            logger.error(f"Invalid inbox ID format: {inbox_id}")
            return HttpResponse(status=200)
        entity_id = match.group(1)
        entity = get_object_or_404(Entity, id=entity_id)

        # Send Slack notification for inbound email
        from_email = message.get("from_email", "Unknown")
        from_name = message.get("from", "Unknown")
        subject = message.get("subject", "No Subject")
        body = message.get("text", "")
        attachments = message.get("attachments", [])

        # Log attachment info if present
        if attachments:
            logger.info(f"Email has {len(attachments)} attachments: {attachments}")

        # Build notification message
        notification = (
            f"📧 Inbound email to Entity {entity_id} from {from_name} ({from_email})\nSubject: {subject}\nBody: {body}"
        )
        if attachments:
            attachment_info = ", ".join(
                [f"{att.get('filename', 'unknown')} ({att.get('content_type', 'unknown')})" for att in attachments]
            )
            notification += f"\n📎 Attachments: {attachment_info}"

        send_slack_message(
            SlackChannel.EMAIL_NOTIFICATIONS,
            notification,
        )

        possibly_run_entity(entity.id, wakeup=True)
        return HttpResponse(status=200)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse webhook data: {e}")
        return HttpResponse(status=400)
