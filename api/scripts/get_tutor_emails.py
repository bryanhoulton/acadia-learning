#!/usr/bin/env python
"""
Script to get tutor email addresses for specified students.

Usage:
    cd api && python scripts/get_tutor_emails.py Student Student Student Student
"""

import os
import sys

import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "api.settings")
django.setup()

from entities.models import Entity  # noqa: E402
from lms.accounts.models import UserProfile  # noqa: E402


def get_tutor_email(entity_id: int) -> str:
    """Construct tutor email from entity ID."""
    return f"acadia-{entity_id}@tutor.acadialearning.org"


def find_students_by_name(student_names: list[str]) -> None:
    """Find students by name and print their tutor emails."""
    for name in student_names:
        # Find student profiles matching the name (case-insensitive)
        profiles = UserProfile.objects.filter(
            name__icontains=name,
            profile_type=UserProfile.ProfileType.STUDENT,
        )

        if not profiles.exists():
            print(f"❌ No student found with name containing '{name}'")
            continue

        for profile in profiles:
            # Get the entity for this account
            entity = Entity.objects.filter(account=profile.account).first()

            if not entity:
                print(f"❌ No entity found for {profile.name} (Account: {profile.account})")
                continue

            email = get_tutor_email(entity.id)
            print(f"✅ {profile.name}: {email}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/get_tutor_emails.py <name1> <name2> ...")
        print("Example: python scripts/get_tutor_emails.py Student Student Student Student")
        sys.exit(1)

    names = sys.argv[1:]
    find_students_by_name(names)
