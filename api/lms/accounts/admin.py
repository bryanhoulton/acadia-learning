from django.contrib import admin
from django.db import models
from django.db.models import Count

from entities.models import Entity
from lms.accounts.models import Account, EmailVerificationCode, ReportCard, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ["name", "profile_type", "account", "email", "phone", "created_at"]
    list_filter = ["profile_type", "account", "created_at"]
    search_fields = ["name", "email", "account__entity__name"]
    ordering = ["-created_at"]
    readonly_fields = [
        "id",
        "created_at",
        "updated_at",
    ]

    fieldsets = (
        (None, {"fields": ("name", "profile_type", "account", "email", "phone")}),
        (
            "Metadata",
            {
                "fields": (
                    "id",
                    "created_at",
                    "updated_at",
                    "metadata",
                    "voice_id",
                ),
                "classes": ("collapse",),
            },
        ),
    )


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    fields = ["name", "profile_type", "account", "email", "phone"]
    readonly_fields = ["created_at", "updated_at", "id"]
    show_change_link = True
    extra = 0


class EntityInline(admin.StackedInline):
    model = Entity
    fields = ["id", "timezone", "sleep_until", "status"]
    readonly_fields = ["created_at", "updated_at"]
    show_change_link = True
    extra = 0


@admin.register(ReportCard)
class ReportCardAdmin(admin.ModelAdmin):
    list_display = ["__str__", "session_date", "session_duration_minutes", "recommended_course_name"]
    list_filter = ["session_date", "recommended_course_name"]
    search_fields = ["session_date", "recommended_course_name"]
    ordering = ["-session_date"]

    fieldsets = (
        (
            None,
            {
                "fields": (
                    "session_date",
                    "session_duration_minutes",
                )
            },
        ),
        ("Immediate Action Items", {"fields": ("immediate_action_items",)}),
        ("Skill Assessments", {"fields": ("skill_assessments",)}),
        (
            "Recommended Course",
            {
                "fields": (
                    "recommended_course_name",
                    "recommended_course_duration_weeks",
                    "recommended_course_description",
                    "recommended_course_objectives",
                )
            },
        ),
        ("Tutor Notes", {"fields": ("tutor_notes",)}),
    )


@admin.register(EmailVerificationCode)
class EmailVerificationCodeAdmin(admin.ModelAdmin):
    list_display = ("account", "code", "created_at", "used_at", "is_expired", "is_valid")
    list_filter = ("created_at", "used_at")
    search_fields = ("account__account_phone", "code")
    readonly_fields = ("created_at",)

    def is_expired(self, obj):
        return obj.is_expired()

    is_expired.boolean = True

    def is_valid(self, obj):
        return obj.is_valid()

    is_valid.boolean = True


class StripeCustomerFilter(admin.SimpleListFilter):
    """Filter accounts by Stripe customer status."""

    title = "Stripe Customer"
    parameter_name = "has_stripe"

    def lookups(self, request, model_admin):
        return [
            ("yes", "Has Stripe Customer ID"),
            ("no", "No Stripe Customer ID"),
        ]

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.exclude(stripe_customer_id__isnull=True).exclude(stripe_customer_id="")
        elif self.value() == "no":
            return queryset.filter(models.Q(stripe_customer_id__isnull=True) | models.Q(stripe_customer_id=""))
        return queryset


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = [
        "__str__",
        "subscription_status_display",
        "has_stripe_customer",
        "referral_count_display",
    ]
    list_filter = ["is_admin", "registration_source", "revenuecat_subscription_status", StripeCustomerFilter]
    search_fields = [
        "id",
        "referral_code",
        "account_phone",
        "userprofile__name",
        "stripe_customer_id",
        "revenuecat_app_user_id",
    ]
    ordering = ["id"]

    inlines = [EntityInline, UserProfileInline]

    fieldsets = (
        (
            None,
            {
                "fields": (
                    "user",
                    "account_phone",
                    "is_admin",
                    "stripe_customer_id",
                    "zip_code",
                    "timezone",
                    "tutor_name",
                    "attribution",
                    "registration_source",
                )
            },
        ),
        (
            "Feature Flags",
            {
                "fields": (
                    "is_locked",
                    "is_human_controlled",
                    "playgrounds_enabled",
                    "speed_lab_enabled",
                    "alt_tutor",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "RevenueCat Subscription",
            {
                "fields": (
                    "revenuecat_app_user_id",
                    "revenuecat_subscription_status",
                    "revenuecat_product_id",
                    "revenuecat_entitlement",
                    "subscription_expires_at",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Referral System",
            {
                "fields": (
                    "referral_code",
                    "referral_link_display",
                    "referred_by",
                    "referral_count_display",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    readonly_fields = ["referral_link_display", "referral_count_display", "revenuecat_app_user_id"]

    def get_queryset(self, request):
        """Annotate queryset with referral count for sorting."""
        queryset = super().get_queryset(request)
        return queryset.annotate(referral_count=Count("referrals"))

    def has_stripe_customer(self, obj):
        """Display whether the account has a Stripe customer ID."""
        return bool(obj.stripe_customer_id)

    has_stripe_customer.boolean = True
    has_stripe_customer.short_description = "Stripe"

    def subscription_status_display(self, obj):
        """Display subscription status with colored badge."""
        from django.utils.html import format_html

        # Get the overall account status
        account_status = obj.account_status()

        if account_status == "paid":
            # Check specific platform status for display
            if obj.revenuecat_subscription_status in ["active", "in_trial"]:
                if obj.revenuecat_subscription_status == "in_trial":
                    return format_html('<span style="color: #2563eb; font-weight: bold;">● Trial (RC)</span>')
                return format_html('<span style="color: #16a34a; font-weight: bold;">● Active (RC)</span>')
            elif obj.stripe_customer_id:
                stripe_status = obj.get_stripe_subscription_status()
                if stripe_status == "trialing":
                    return format_html('<span style="color: #2563eb; font-weight: bold;">● Trial (Stripe)</span>')
                return format_html('<span style="color: #16a34a; font-weight: bold;">● Active (Stripe)</span>')
        elif account_status == "delinquent":
            return format_html('<span style="color: #f97316; font-weight: bold;">⚠ Delinquent</span>')

        # Show cancelled/expired RevenueCat subscriptions
        if obj.revenuecat_subscription_status == "cancelled":
            return format_html('<span style="color: #dc2626; font-weight: bold;">● Cancelled</span>')
        elif obj.revenuecat_subscription_status == "expired":
            return format_html('<span style="color: #737373; font-weight: bold;">● Expired</span>')

        # Check if they have a Stripe customer ID but no active subscription
        if obj.stripe_customer_id:
            stripe_status = obj.get_stripe_subscription_status()
            if stripe_status == "canceled":
                return format_html('<span style="color: #dc2626; font-weight: bold;">● Canceled (Stripe)</span>')
            elif stripe_status:
                return format_html(
                    '<span style="color: #737373; font-weight: bold;">● {} (Stripe)</span>', stripe_status.title()
                )

        # Free account
        return format_html('<span style="color: #a3a3a3;">—</span>')

    subscription_status_display.short_description = "Subscription"

    def referral_link_display(self, obj):
        """Display the full referral link."""
        if obj.referral_code:
            from django.conf import settings
            from django.utils.html import format_html

            # Try to get the frontend URL from settings
            frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
            link = f"{frontend_url}/referral/{obj.referral_code}"
            return format_html('<a href="{}" target="_blank">{}</a>', link, link)
        return "-"

    referral_link_display.short_description = "Referral Link"

    def referral_count_display(self, obj):
        """Display the number of referrals this account has made."""
        # Use annotated count if available, otherwise fall back to counting
        count = getattr(obj, "referral_count", None)
        if count is None:
            count = obj.referrals.count()
        if count > 0:
            from django.urls import reverse
            from django.utils.html import format_html

            url = reverse("admin:lms_accounts_account_changelist") + f"?referred_by__id__exact={obj.id}"
            return format_html('<a href="{}">{} referral{}</a>', url, count, "s" if count != 1 else "")
        return "0"

    referral_count_display.short_description = "Referrals Made"
    referral_count_display.admin_order_field = "referral_count"
