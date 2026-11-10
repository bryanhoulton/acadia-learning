from agentmail.errors import NotFoundError
from agentmail.inboxes.types import CreateInboxRequest
from agentmail.inboxes.types.inbox import Inbox

from api.settings import AGENTMAIL_DOMAIN, mail


def get_or_create_inbox(entity_id: int) -> Inbox:
    from entities.models import Entity

    entity = Entity.objects.get(id=entity_id)
    try:
        inbox = mail.inboxes.get(inbox_id=f"acadia-{entity_id}@{AGENTMAIL_DOMAIN}")
    except NotFoundError:
        inbox = mail.inboxes.create(
            request=CreateInboxRequest(
                domain=AGENTMAIL_DOMAIN,
                display_name=entity.name,
                username=f"acadia-{entity_id}",
            )
        )
    return inbox


def get_or_create_test_inbox(entity_id: int):
    """
    Create a test-specific inbox to avoid colliding with production.
    Uses 'test-acadia-{entity_id}@{AGENTMAIL_DOMAIN}' instead of production format.
    Note: Test inboxes cannot be deleted via AgentMail API yet, so they will persist.
    """
    test_inbox_id = f"test-acadia-{entity_id}@{AGENTMAIL_DOMAIN}"

    try:
        inbox = mail.inboxes.get(inbox_id=test_inbox_id)
    except Exception:
        inbox = mail.inboxes.create(
            request=CreateInboxRequest(
                domain=AGENTMAIL_DOMAIN,
                display_name="Test Inbox",
                username=f"test-acadia-{entity_id}",
            )
        )
    return inbox
