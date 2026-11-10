from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from lms.accounts.models import Account, LearningWrapped, ReportCard, UserProfile


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for the UserProfile model"""

    class Meta:
        model = UserProfile
        fields = "__all__"
        read_only_fields = ["account"]

    def validate_phone(self, value):
        """Prevent phone number from being cleared once it's set"""
        if self.instance and self.instance.phone and not value:
            raise serializers.ValidationError(
                "Phone number cannot be removed once set. Please contact support if you need to change it."
            )
        return value


class AccountSerializer(serializers.ModelSerializer):
    profiles = serializers.SerializerMethodField()
    account_status = serializers.SerializerMethodField()
    stripe_subscription_status = serializers.SerializerMethodField()
    referral_count = serializers.SerializerMethodField()
    referral_link = serializers.SerializerMethodField()
    has_texted_tutor = serializers.SerializerMethodField()

    @extend_schema_field(serializers.CharField())
    def get_account_status(self, obj: Account) -> str:
        """Return the status of the account (paid, delinquent, or free)"""
        return obj.account_status()

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_stripe_subscription_status(self, obj: Account) -> str | None:
        """Return the Stripe subscription status (active, past_due, trialing, canceled, etc.) or None if no Stripe customer"""
        return obj.get_stripe_subscription_status()

    @extend_schema_field(serializers.IntegerField())
    def get_referral_count(self, obj: Account) -> int:
        """Return the number of successful referrals"""
        return obj.referrals.count()

    @extend_schema_field(serializers.CharField())
    def get_referral_link(self, obj: Account) -> str:
        """Return the full referral link"""
        return obj.referral_link

    @extend_schema_field(serializers.BooleanField())
    def get_has_texted_tutor(self, obj: Account) -> bool:
        """Check if the user has sent any inbound SMS messages"""
        from sms.models import SMSMessage

        return SMSMessage.objects.filter(
            from_number=obj.account_phone,
            direction="inbound",
        ).exists()

    class Meta:
        model = Account
        exclude = ["referral_code"]

    @extend_schema_field(UserProfileSerializer(many=True))
    def get_profiles(self, obj: Account):
        """Return profiles with parents first so they are not truncated."""

        profiles = list(obj.userprofile_set.all())
        parent_profiles = [p for p in profiles if p.profile_type == UserProfile.ProfileType.PARENT]
        other_profiles = [p for p in profiles if p.profile_type != UserProfile.ProfileType.PARENT]
        ordered_profiles = parent_profiles + other_profiles
        return UserProfileSerializer(ordered_profiles, many=True).data


class ActionItemSerializer(serializers.Serializer):
    """Serializer for action items"""

    title = serializers.CharField()
    description = serializers.CharField()
    priority = serializers.ChoiceField(choices=["high", "medium", "low"])


class SkillAssessmentSerializer(serializers.Serializer):
    """Serializer for skill assessments"""

    skill_name = serializers.CharField()
    skill_description = serializers.CharField()
    skill_level = serializers.ChoiceField(choices=["automatic", "mastered", "reinforcing", "learning", "untouched"])


class CourseObjectiveSerializer(serializers.Serializer):
    """Serializer for course objectives"""

    title = serializers.CharField()
    description = serializers.CharField()
    week_number = serializers.IntegerField()


class ReportCardSerializer(serializers.ModelSerializer):
    """Serializer for the ReportCard model"""

    immediate_action_items = ActionItemSerializer(many=True)
    skill_assessments = SkillAssessmentSerializer(many=True)
    recommended_course_objectives = CourseObjectiveSerializer(many=True)

    class Meta:
        model = ReportCard
        fields = "__all__"


class RequestVerificationCodeSerializer(serializers.Serializer):
    phone_number = serializers.CharField(required=True)
    allow_signup = serializers.BooleanField(required=False, default=True)
    source = serializers.ChoiceField(  # type: ignore
        choices=["web", "mobile"],
        required=False,
        default="web",
        help_text="Platform where the registration is happening (web or mobile)",
    )
    referral_code = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Referral code from another user",
    )
    timezone = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Browser/device timezone in IANA format (e.g., America/New_York)",
    )
    signup_metadata = serializers.JSONField(
        required=False,
        help_text="Metadata captured at signup (UTM params, referrer, fbp, etc.)",
    )


class RequestVerificationCodeResponseSerializer(serializers.Serializer):
    account_created = serializers.BooleanField(required=True)
    message = serializers.CharField(required=True)
    success = serializers.BooleanField(required=True)


class VerifyCodeSerializer(serializers.Serializer):
    phone_number = serializers.CharField(required=True)
    code = serializers.CharField(required=True)


class RequestEmailVerificationCodeSerializer(serializers.Serializer):
    phone_number = serializers.CharField(required=True)


class VerifyEmailCodeSerializer(serializers.Serializer):
    phone_number = serializers.CharField(required=True)
    code = serializers.CharField(required=True)


class RequestSupportAuthSerializer(serializers.Serializer):
    phone_number = serializers.CharField(required=True)


class VerifyCodeResponseSerializer(serializers.Serializer):
    account = AccountSerializer()
    refresh = serializers.CharField()
    access = serializers.CharField()


class MetadataSerializer(serializers.Serializer):
    entity_id = serializers.CharField(required=True)


class ObjectSerializer(serializers.Serializer):
    metadata = MetadataSerializer(required=True)


class DataSerializer(serializers.Serializer):
    object = ObjectSerializer(required=True)


class StripeWebhookSerializer(serializers.Serializer):
    """Serializer for stripe webhook events."""

    event = serializers.CharField(required=True)
    data = DataSerializer(required=True)  # type: ignore


class StripeCheckoutSessionSerializer(serializers.Serializer):
    """Serializer for stripe checkout session."""

    quantity = serializers.IntegerField(required=True)


class StripeCheckoutSessionResponseSerializer(serializers.Serializer):
    """Serializer for stripe checkout session response."""

    url = serializers.CharField(required=True)


class ReferralInfoResponseSerializer(serializers.Serializer):
    """Serializer for referral info response"""

    success = serializers.BooleanField(required=True)
    referrer_name = serializers.CharField(required=True)
    referral_code = serializers.CharField(required=True)


class InitializeEntitySerializer(serializers.Serializer):
    """Serializer for entity initialization"""

    platform = serializers.ChoiceField(
        choices=[("web", "Web"), ("mobile", "Mobile")],
        required=False,
        default="mobile",
        help_text="Platform where the entity is being initialized (web or mobile)",
    )


class LearningWrappedSerializer(serializers.ModelSerializer):
    """Serializer for the LearningWrapped model"""

    class Meta:
        model = LearningWrapped
        fields = ["id", "user_profile", "year", "data", "created_at", "updated_at"]
        read_only_fields = ["id", "user_profile", "created_at", "updated_at"]


class LearningWrappedListItemSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing wraps (without the full data payload)"""

    profile_name = serializers.CharField(source="user_profile.name", read_only=True)
    profile_id = serializers.UUIDField(source="user_profile.id", read_only=True)

    class Meta:
        model = LearningWrapped
        fields = ["id", "profile_id", "profile_name", "year", "created_at"]
        read_only_fields = ["id", "profile_id", "profile_name", "year", "created_at"]


class ProfileStatsSerializer(serializers.Serializer):
    """Serializer for profile learning stats"""

    streak = serializers.IntegerField(help_text="Current streak in days")
    minutes_today = serializers.IntegerField(help_text="Total minutes of learning today")
    sessions_this_week = serializers.IntegerField(help_text="Number of sessions this week")
    minutes_this_week = serializers.IntegerField(help_text="Total minutes of learning this week")


# Admin serializers for account ledger
class AdminAccountListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing accounts in admin views"""

    profiles = serializers.SerializerMethodField()
    profile_names = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            "id",
            "account_phone",
            "is_active",
            "is_admin",
            "is_locked",
            "created_at",
            "profiles",
            "profile_names",
        ]

    @extend_schema_field(UserProfileSerializer(many=True))
    def get_profiles(self, obj: Account):
        """Return profiles for this account."""
        return UserProfileSerializer(obj.userprofile_set.all(), many=True).data

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_profile_names(self, obj: Account) -> list[str]:
        """Return list of profile names for search display"""
        return [p.name for p in obj.userprofile_set.all() if p.name]


class AdminAccountListResponseSerializer(serializers.Serializer):
    """Paginated response for admin account list"""

    results = AdminAccountListSerializer(many=True)
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_pages = serializers.IntegerField()


class SMSMessageSerializer(serializers.Serializer):
    """Serializer for SMS messages in ledger view"""

    id = serializers.IntegerField()
    from_number = serializers.CharField()
    to_number = serializers.CharField()
    body = serializers.CharField()
    direction = serializers.CharField()
    created_at = serializers.DateTimeField()
    has_attachments = serializers.BooleanField()


class LedgerSessionSerializer(serializers.Serializer):
    """Lightweight serializer for sessions in ledger view"""

    id = serializers.UUIDField()
    name = serializers.CharField(allow_null=True)
    description = serializers.CharField(allow_null=True)
    profile_id = serializers.UUIDField(source="profile.id", allow_null=True)
    profile_name = serializers.CharField(source="profile.name", allow_null=True)
    session_started_at = serializers.DateTimeField(allow_null=True)
    session_ended_at = serializers.DateTimeField(allow_null=True)
    audio_duration_seconds = serializers.FloatField(allow_null=True)
    created_at = serializers.DateTimeField()


class LedgerEntrySerializer(serializers.Serializer):
    """Unified serializer for ledger entries (SMS or Session)"""

    type = serializers.ChoiceField(choices=["sms", "session"])
    timestamp = serializers.DateTimeField()
    sms = SMSMessageSerializer(allow_null=True, required=False)
    session = LedgerSessionSerializer(allow_null=True, required=False)


class AccountLedgerResponseSerializer(serializers.Serializer):
    """Response serializer for account ledger"""

    account = AdminAccountListSerializer()
    entries = LedgerEntrySerializer(many=True)
    total_entries = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_pages = serializers.IntegerField()


class LedgerShareLinkSerializer(serializers.Serializer):
    """Serializer for ledger share links"""

    id = serializers.UUIDField(read_only=True)
    account_id = serializers.UUIDField(read_only=True, source="account.id")
    account_name = serializers.SerializerMethodField()
    token = serializers.CharField(read_only=True)
    description = serializers.CharField(allow_blank=True, required=False)
    created_at = serializers.DateTimeField(read_only=True)
    expires_at = serializers.DateTimeField(allow_null=True, required=False)
    view_count = serializers.IntegerField(read_only=True)
    share_url = serializers.SerializerMethodField()

    def get_account_name(self, obj) -> str:
        profile = obj.account.userprofile_set.filter(name__isnull=False).first()
        if profile:
            return profile.name
        return obj.account.account_phone

    def get_share_url(self, obj) -> str:
        from django.conf import settings

        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        return f"{frontend_url}/shared-ledger/{obj.token}"


class CreateLedgerShareLinkSerializer(serializers.Serializer):
    """Serializer for creating a ledger share link"""

    account_id = serializers.UUIDField()
    description = serializers.CharField(allow_blank=True, required=False, default="")
    expires_in_days = serializers.IntegerField(
        min_value=1,
        max_value=365,
        required=False,
        allow_null=True,
        help_text="Number of days until the link expires. Null means never expires.",
    )


class SharedLedgerProfileSerializer(serializers.Serializer):
    """Lightweight profile serializer for shared ledger"""

    name = serializers.CharField(allow_null=True)
    profile_type = serializers.CharField()


class SharedLedgerResponseSerializer(serializers.Serializer):
    """Response serializer for public shared ledger view"""

    account_name = serializers.CharField()
    profiles = SharedLedgerProfileSerializer(many=True)
    entries = LedgerEntrySerializer(many=True)
    total_entries = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_pages = serializers.IntegerField()


class CreateMagicLinkSerializer(serializers.Serializer):
    """Serializer for creating a magic link token for cross-domain auth"""

    redirect_url = serializers.URLField(
        required=False,
        allow_blank=True,
        help_text="Optional URL to redirect to after authentication",
    )


class CreateMagicLinkResponseSerializer(serializers.Serializer):
    """Response serializer for magic link creation"""

    token = serializers.CharField()
    expires_at = serializers.DateTimeField()


class ExchangeMagicLinkSerializer(serializers.Serializer):
    """Serializer for exchanging a magic link token for JWT"""

    token = serializers.CharField(required=True)
