"""
Test data utilities for integration tests.

Provides factory functions and utilities for creating common test data
patterns used across integration tests.
"""

from typing import Any, Dict, Optional

from django.contrib.auth.models import User

from entities.models import Entity
from lms.accounts.models import Account, UserProfile


def create_test_entity(
    name: str = "Test Entity",
    description: str = "Test entity for integration testing",
    timezone: str = "America/New_York",
    adapters: Optional[list] = None,
    **kwargs,
) -> Entity:
    """
    Create a test entity with sensible defaults.

    Args:
        name: Entity name
        description: Entity description
        timezone: Entity timezone
        adapters: List of adapters to enable
        **kwargs: Additional fields for Entity model

    Returns:
        Created Entity instance
    """
    if adapters is None:
        adapters = ["sms", "email"]

    defaults = {
        "name": name,
        "description": description,
        "timezone": timezone,
        "adapters": adapters,
        "max_messages": 10,
    }
    defaults.update(kwargs)

    entity = Entity.objects.create(**defaults)
    entity.save()
    return entity


def create_test_user_and_profile(
    email: str = "teststudent@example.com",
    username: Optional[str] = None,
    first_name: str = "Test",
    last_name: str = "Student",
    profile_type: str = "student",
    profile_name: Optional[str] = None,
    account: Optional[Account] = None,
    entity: Optional[Entity] = None,
    password: str = "testpass123",
    **kwargs,
) -> tuple[User, UserProfile]:
    """
    Create a test user and associated profile.

    Args:
        email: User email address
        username: Username (defaults to email if not provided)
        first_name: User's first name
        last_name: User's last name
        profile_type: Type of profile ('student', 'parent', 'teacher')
        profile_name: Profile display name (defaults to first_name last_name)
        account: Account to associate with (creates one if not provided)
        entity: Entity to associate account with (creates one if not provided)
        password: Password for the user account (defaults to 'testpass123')
        **kwargs: Additional fields for UserProfile model

    Returns:
        Tuple of (User, UserProfile)
    """
    if username is None:
        username = email

    if profile_name is None:
        profile_name = f"{first_name} {last_name}"

    # Create entity if not provided
    if entity is None:
        entity = create_test_entity()

    # Create account if not provided
    if account is None:
        account = Account.objects.create(entity=entity)

    # Create user with password
    user = User.objects.create_user(
        username=username, email=email, first_name=first_name, last_name=last_name, password=password
    )

    # Create profile
    profile_defaults = {
        "name": profile_name,
        "profile_type": profile_type,
        "email": email,
        "account": account,
    }
    profile_defaults.update(kwargs)

    profile = UserProfile.objects.create(**profile_defaults)

    return user, profile


def create_complete_test_setup(
    entity_name: str = "Multi-Service Test Entity",
    student_email: str = "teststudent@example.com",
) -> Dict[str, Any]:
    """
    Create a complete test setup with entity, user, profile.

    This is a convenience function that creates all the common objects
    needed for a typical integration test.

    Args:
        entity_name: Name for the test entity
        student_email: Email for the test student
        lesson_title: Title for the test lesson
        room_code: Room code for the lesson

    Returns:
        Dictionary containing all created objects:
        {
            'entity': Entity,
            'account': Account,
            'user': User,
            'student': UserProfile,
            'contact': Contact
        }
    """
    # Create a user for the account first
    account_user = User.objects.create_user(
        username=f"test_user_{entity_name.lower().replace(' ', '_')}", email="test@example.com", password="testpass123"
    )

    # Create account
    account = Account.objects.create(user=account_user, account_phone="+1234567890", timezone="America/New_York")

    # Create entity with the account
    entity = create_test_entity(
        name=entity_name, description="Entity for multi-service integration testing", account=account
    )

    # Create user and student profile
    user, student = create_test_user_and_profile(
        email=student_email,
        first_name="Test",
        last_name="Student",
        profile_type="student",
        account=account,
        entity=entity,
    )

    # Contact model has been removed - no longer creating contacts

    return {
        "entity": entity,
        "account": account,
        "user": user,
        "student": student,
    }


def create_parent_child_setup(
    entity_name: str = "Family Test Entity",
    parent_email: str = "testparent@example.com",
    student_email: str = "teststudent@example.com",
) -> Dict[str, Any]:
    """
    Create a parent-child test setup.

    Args:
        entity_name: Name for the test entity
        parent_email: Email for the parent user
        student_email: Email for the student user

    Returns:
        Dictionary containing all created objects:
        {
            'entity': Entity,
            'account': Account,
            'parent_user': User,
            'parent': UserProfile,
            'student_user': User,
            'student': UserProfile,
        }
    """
    # Create entity and account
    entity = create_test_entity(name=entity_name)
    account = Account.objects.create(entity=entity)

    # Create parent
    parent_user, parent = create_test_user_and_profile(
        email=parent_email, first_name="Test", last_name="Parent", profile_type="parent", account=account, entity=entity
    )

    # Create student
    student_user, student = create_test_user_and_profile(
        email=student_email,
        first_name="Test",
        last_name="Student",
        profile_type="student",
        account=account,
        entity=entity,
    )

    return {
        "entity": entity,
        "account": account,
        "parent_user": parent_user,
        "parent": parent,
        "student_user": student_user,
        "student": student,
    }
