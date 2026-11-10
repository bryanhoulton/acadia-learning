import logging

from entities.models import Entity
from lms.accounts.models import Account, UserProfile

logger = logging.getLogger(__name__)


def verify_account_ownership(account_id: str, entity_id: int):
    entity = Entity.objects.get(pk=entity_id)
    if entity.account.id != account_id:
        raise ValueError("Account does not belong to entity")


class UserProfileService:
    def __init__(self, entity_id: int):
        self.entity_id = entity_id

    def list(self, account_id: str, **kwargs):
        verify_account_ownership(account_id, self.entity_id)
        return UserProfile.objects.filter(account_id=account_id, **kwargs).order_by("name")

    def create(self, account_id: str, **kwargs):
        verify_account_ownership(account_id, self.entity_id)
        return UserProfile.objects.create(account_id=account_id, **kwargs)

    def get(self, account_id: str, profile_id: str):
        verify_account_ownership(account_id, self.entity_id)
        return UserProfile.objects.get(pk=profile_id, account_id=account_id)

    def update(self, account_id: str, profile_id: str, **kwargs):
        verify_account_ownership(account_id, self.entity_id)
        profile = self.get(account_id, profile_id)
        for key, value in kwargs.items():
            setattr(profile, key, value)
        profile.save()
        return profile

    def delete(self, account_id: str, profile_id: str):
        verify_account_ownership(account_id, self.entity_id)
        profile = self.get(account_id, profile_id)
        profile.delete()
        return True

    def get_students(self, account_id: str, **kwargs):
        verify_account_ownership(account_id, self.entity_id)
        return UserProfile.objects.filter(account_id=account_id, profile_type="student", **kwargs).order_by("name")

    def get_parents(self, account_id: str, **kwargs):
        verify_account_ownership(account_id, self.entity_id)
        return UserProfile.objects.filter(account_id=account_id, profile_type="parent", **kwargs).order_by("name")


class AccountService:
    def __init__(self, entity_id: int):
        self.entity_id = entity_id
        self.profiles = UserProfileService(entity_id)

    def list(self, **kwargs):
        return Account.objects.filter(entity_id=self.entity_id, **kwargs).order_by("name")

    def get(self, account_id: str):
        return Account.objects.get(pk=account_id, entity_id=self.entity_id)
