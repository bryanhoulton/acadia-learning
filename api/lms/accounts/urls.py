from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from . import views

router = DefaultRouter()
router.register(r"accounts", views.AccountViewSet)
router.register(r"profiles", views.UserProfileViewSet)

urlpatterns = [
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    path("initialize-entity/", views.InitializeEntityView.as_view(), name="initialize_entity"),
    path("request-verification-code/", views.RequestVerificationCodeView.as_view(), name="request_verification_code"),
    path("verify-code/", views.VerifyCodeView.as_view(), name="verify_code"),
    path(
        "request-email-verification-code/",
        views.RequestEmailVerificationCodeView.as_view(),
        name="request_email_verification_code",
    ),
    path("verify-email-code/", views.VerifyEmailCodeView.as_view(), name="verify_email_code"),
    path("create-magic-link/", views.CreateMagicLinkView.as_view(), name="create_magic_link"),
    path("exchange-magic-link/", views.ExchangeMagicLinkView.as_view(), name="exchange_magic_link"),
    path("request-support-auth/", views.RequestSupportAuthView.as_view(), name="request_support_auth"),
    path("stripe/webhook/", views.StripeWebhookView.as_view(), name="stripe_webhook"),
    path("stripe/checkout-session/", views.StripeCheckoutSessionView.as_view(), name="stripe_checkout_session"),
    path("revenuecat/webhook/", views.RevenueCatWebhookView.as_view(), name="revenuecat_webhook"),
    path("report-cards/<str:uuid>/", views.ReportCardView.as_view(), name="report_card"),
    path("profiles/<str:profile_id>/report-cards/", views.ReportCardListView.as_view(), name="report_card_list"),
    path("referral-info/<str:referral_code>/", views.ReferralInfoView.as_view(), name="referral_info"),
    path("profiles/<str:profile_id>/wrapped/<int:year>/", views.LearningWrappedView.as_view(), name="learning_wrapped"),
    path("profiles/<str:profile_id>/stats/", views.ProfileStatsView.as_view(), name="profile_stats"),
    path("wrapped/", views.LearningWrappedListView.as_view(), name="learning_wrapped_list"),
    # Admin endpoints
    path("admin/accounts/", views.AdminAccountListView.as_view(), name="admin_account_list"),
    path(
        "admin/accounts/<str:account_id>/ledger/", views.AdminAccountLedgerView.as_view(), name="admin_account_ledger"
    ),
    # Share link endpoints
    path("admin/share-links/", views.LedgerShareLinkListView.as_view(), name="share_link_list"),
    path("admin/share-links/<str:link_id>/", views.LedgerShareLinkDetailView.as_view(), name="share_link_detail"),
    # Public shared ledger endpoint (no auth required)
    path("shared-ledger/<str:token>/", views.SharedLedgerView.as_view(), name="shared_ledger"),
    path("", include(router.urls)),
]
