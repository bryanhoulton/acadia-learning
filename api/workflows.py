"""
Render Workflows tasks for Acadia Learning.

Run locally with:
    render workflows dev "uv run python workflows.py"

Trigger a task:
    render workflows run get_account_stats
"""

import os

from asgiref.sync import sync_to_async
from render_sdk.workflows import start, task

# Setup Django before importing models
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "api.settings")

import django  # noqa: E402

django.setup()


from lms.accounts.models import Account, UserProfile  # noqa: E402


def _get_account_stats_sync() -> dict:
    """Synchronous implementation of get_account_stats."""
    total_accounts = Account.objects.count()
    active_accounts = Account.objects.filter(is_active=True).count()
    paid_accounts = Account.objects.exclude(stripe_customer_id__isnull=True).count()

    total_profiles = UserProfile.objects.count()
    parent_profiles = UserProfile.objects.filter(profile_type="parent").count()
    student_profiles = UserProfile.objects.filter(profile_type="student").count()

    return {
        "accounts": {
            "total": total_accounts,
            "active": active_accounts,
            "paid": paid_accounts,
        },
        "profiles": {
            "total": total_profiles,
            "parents": parent_profiles,
            "students": student_profiles,
        },
    }


@task()
async def get_account_stats() -> dict:
    """Get basic account statistics from the database."""
    return await sync_to_async(_get_account_stats_sync, thread_sensitive=True)()


def _get_recent_signups_sync(days: int) -> list[dict]:
    """Synchronous implementation of get_recent_signups."""
    from datetime import timedelta

    from django.utils import timezone

    cutoff = timezone.now() - timedelta(days=days)
    recent_accounts = Account.objects.filter(created_at__gte=cutoff).order_by("-created_at")

    return [
        {
            "id": str(account.id),
            "phone": account.account_phone,
            "created_at": account.created_at.isoformat(),
            "is_paid": account.stripe_customer_id is not None,
            "registration_source": account.registration_source,
        }
        for account in recent_accounts[:50]  # Limit to 50
    ]


@task()
async def get_recent_signups(days: int = 7) -> list[dict]:
    """Get accounts created in the last N days."""
    return await sync_to_async(_get_recent_signups_sync, thread_sensitive=True)(days)


if __name__ == "__main__":
    start()
