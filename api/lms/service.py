from lms.accounts.service import AccountService


class LMSService:
    def __init__(self, entity_id: int):
        self.entity_id = entity_id
        self.accounts = AccountService(entity_id)
