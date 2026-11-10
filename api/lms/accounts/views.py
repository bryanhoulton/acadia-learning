import json
import logging
import secrets
from datetime import timedelta

import posthog
import redis
from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.exceptions import NotFound, ParseError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from api.settings import (
    FRONTEND_URL,
    STRIPE_ANNUAL_PRICE_ID,
    STRIPE_MONTHLY_PRICE_ID,
    stripe,
)
from lms.accounts.authentication import AccountAuthentication
from lms.accounts.models import Account, LearningWrapped, ReportCard, UserProfile
from lms.accounts.permissions import IsAdminPermission
from lms.accounts.serializers import (
    AccountLedgerResponseSerializer,
    AccountSerializer,
    AdminAccountListResponseSerializer,
    AdminAccountListSerializer,
    CreateLedgerShareLinkSerializer,
    CreateMagicLinkResponseSerializer,
    CreateMagicLinkSerializer,
    ExchangeMagicLinkSerializer,
    InitializeEntitySerializer,
    LearningWrappedListItemSerializer,
    LearningWrappedSerializer,
    LedgerSessionSerializer,
    LedgerShareLinkSerializer,
    ProfileStatsSerializer,
    ReferralInfoResponseSerializer,
    ReportCardSerializer,
    RequestEmailVerificationCodeSerializer,
    RequestSupportAuthSerializer,
    RequestVerificationCodeResponseSerializer,
    RequestVerificationCodeSerializer,
    SharedLedgerResponseSerializer,
    SMSMessageSerializer,
    StripeCheckoutSessionResponseSerializer,
    StripeCheckoutSessionSerializer,
    StripeWebhookSerializer,
    UserProfileSerializer,
    VerifyCodeResponseSerializer,
    VerifyCodeSerializer,
    VerifyEmailCodeSerializer,
)
from lms.calendars.models import Goal
from utils.serializers import SuccessResponseSerializer
from utils.slack import SlackChannel, send_slack_message

logger = logging.getLogger(__name__)


def create_feedback_call_goal(account: Account) -> Goal | None:
    """
    Create a goal to gauge parent's interest in a feedback call with the team.
    Called after a paid signup (subscription purchase or trial conversion).
    """
    from datetime import date, timedelta
    from textwrap import dedent

    # Find the parent profile for this account
    parent_profile = UserProfile.objects.filter(account=account, profile_type="parent").first()
    if not parent_profile:
        logger.warning(f"No parent profile found for account {account.id}, cannot create feedback call goal")
        return None

    today = date.today()
    return Goal.objects.create(
        user_profile=parent_profile,
        title="Gauge interest in feedback call",
        objective=dedent("""
            Now that this family is a paying customer, gauge their interest in doing a 
            feedback call with our team.
            
            Wait for a natural moment - ideally after a good session or positive interaction.
            Then casually mention:
            - "By the way, our team loves hearing directly from families about their experience."
            - "Would you be interested in a quick 10-15 minute call with someone from our team? 
               They'd love to hear what's working and any ideas you have."
            
            If they're interested:
            - Let them know someone will reach out to schedule at a time that works for them
            - Thank them for being willing to share feedback
            
            If they're not interested:
            - That's totally fine! Don't push it at all
            - Just note that you asked and move on
            
            The goal is to identify families who would be good candidates for feedback calls,
            not to pressure anyone.
        """).strip(),
        start_date=today,
        end_date=today + timedelta(days=14),
    )


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]
    authentication_classes = [AccountAuthentication]

    def get_queryset(self):
        if self.request.account is None:
            raise NotFound("Account not found")
        return Account.objects.filter(pk=self.request.account.pk)


class UserProfileViewSet(viewsets.ModelViewSet):
    """ViewSet for managing UserProfile objects"""

    queryset = UserProfile.objects.all()
    serializer_class = UserProfileSerializer
    authentication_classes = [AccountAuthentication]
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(account=self.request.account)

    def get_queryset(self):
        if self.request.account is None:
            raise NotFound("Account not found")
        return UserProfile.objects.filter(account=self.request.account)


class ReportCardView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=None,
        responses={200: ReportCardSerializer, 400: SuccessResponseSerializer},
    )
    def get(self, request, uuid: str):
        report_card = ReportCard.objects.get(id=uuid)
        return Response(ReportCardSerializer(report_card).data, status=status.HTTP_200_OK)


class ReportCardListView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        request=None,
        responses={200: ReportCardSerializer(many=True), 400: SuccessResponseSerializer},
    )
    def get(self, request, profile_id: str):
        """List all report cards for a given profile"""
        # Verify the profile belongs to the authenticated account
        try:
            profile = UserProfile.objects.get(id=profile_id, account=request.user)
        except UserProfile.DoesNotExist:
            raise NotFound("Profile not found")

        report_cards = ReportCard.objects.filter(user_profile=profile).order_by("-session_date", "-created_at")
        return Response(ReportCardSerializer(report_cards, many=True).data, status=status.HTTP_200_OK)


class RequestVerificationCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=RequestVerificationCodeSerializer,
        responses={200: RequestVerificationCodeResponseSerializer, 400: SuccessResponseSerializer},
    )
    def post(self, request):
        serializer = RequestVerificationCodeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                SuccessResponseSerializer.from_serializer_errors(serializer),
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_account = False

        allow_signup = serializer.validated_data["allow_signup"]
        phone_number = serializer.validated_data["phone_number"]

        # First check if this phone number belongs to an account
        existing_account = Account.objects.filter(account_phone=phone_number).first()

        # If not found, check if this phone number belongs to any user profile (parent or student)
        if not existing_account:
            profile_with_phone = UserProfile.objects.filter(phone=phone_number).first()
            if profile_with_phone:
                existing_account = profile_with_phone.account

        if not existing_account:
            if not allow_signup:
                return Response(
                    {
                        "success": False,
                        "message": "Account not found. Please book an evaluation to create a new account.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Handle referral code
            referral_code = serializer.validated_data.get("referral_code", "").strip()
            referring_account = None
            if referral_code:
                referring_account = Account.objects.filter(referral_code=referral_code).first()

            # Get timezone from request, fallback to default
            timezone = serializer.validated_data.get("timezone", "").strip() or None

            existing_account = Account(
                account_phone=serializer.validated_data["phone_number"],
                registration_source=serializer.validated_data.get("source"),
                referred_by=referring_account,
                timezone=timezone or "America/New_York",  # Set timezone during signup
                signup_metadata=serializer.validated_data.get("signup_metadata"),
            )
            existing_account.save()
            created_account = True
            UserProfile.objects.create(
                account=existing_account,
                profile_type=UserProfile.ProfileType.PARENT,
                phone=serializer.validated_data["phone_number"],
            )

        # Send verification code to the phone number the user entered, not the account's primary phone
        existing_account.send_verification_code(phone_number=phone_number)
        return Response(
            {"success": True, "message": "Verification code sent", "account_created": created_account},
            status=status.HTTP_200_OK,
        )


class VerifyCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=VerifyCodeSerializer,
        responses={200: VerifyCodeResponseSerializer, 400: SuccessResponseSerializer},
    )
    def post(self, request):
        serializer = VerifyCodeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        phone_number = serializer.validated_data["phone_number"]

        # First check if this phone number belongs to an account
        account = Account.objects.filter(account_phone=phone_number).first()

        # If not found, check if this phone number belongs to any user profile (parent or student)
        if not account:
            profile_with_phone = UserProfile.objects.filter(phone=phone_number).first()
            if profile_with_phone:
                account = profile_with_phone.account

        if not account:
            return Response({"success": False, "message": "Failed"}, status=status.HTTP_400_BAD_REQUEST)

        # Verify against the phone number the user entered, not the account's primary phone
        result = account.check_verification_code(serializer.validated_data["code"], phone_number=phone_number)
        if not result:
            return Response({"success": False, "message": "Failed."}, status=status.HTTP_400_BAD_REQUEST)

        refresh = RefreshToken.for_user(account.user)
        return Response(
            {
                "account": AccountSerializer(account).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_200_OK,
        )


class RequestEmailVerificationCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=RequestEmailVerificationCodeSerializer,
        responses={200: SuccessResponseSerializer, 400: SuccessResponseSerializer},
    )
    def post(self, request):
        serializer = RequestEmailVerificationCodeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                SuccessResponseSerializer.from_serializer_errors(serializer),
                status=status.HTTP_400_BAD_REQUEST,
            )

        account = Account.objects.filter(account_phone=serializer.validated_data["phone_number"]).first()
        if not account:
            return Response({"success": False, "message": "Account not found"}, status=status.HTTP_400_BAD_REQUEST)

        if not account.has_email_on_file():
            return Response(
                {"success": False, "message": "No email address on file for this account"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = account.send_email_verification_code()
        if code is None:
            return Response(
                {"success": False, "message": "Failed to send email verification code"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"success": True, "message": "Email verification code sent"}, status=status.HTTP_200_OK)


class VerifyEmailCodeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=VerifyEmailCodeSerializer,
        responses={200: VerifyCodeResponseSerializer, 400: SuccessResponseSerializer},
    )
    def post(self, request):
        serializer = VerifyEmailCodeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        account = Account.objects.filter(account_phone=serializer.validated_data["phone_number"]).first()
        if not account:
            return Response({"success": False, "message": "Account not found"}, status=status.HTTP_400_BAD_REQUEST)

        result = account.check_email_verification_code(serializer.validated_data["code"])
        if not result:
            return Response(
                {"success": False, "message": "Invalid or expired code"}, status=status.HTTP_400_BAD_REQUEST
            )

        refresh = RefreshToken.for_user(account.user)
        return Response(
            {
                "account": AccountSerializer(account).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_200_OK,
        )


class CreateMagicLinkView(APIView):
    """Create a one-time magic link token for cross-domain authentication"""

    permission_classes = [IsAuthenticated]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        request=CreateMagicLinkSerializer,
        responses={200: CreateMagicLinkResponseSerializer, 400: SuccessResponseSerializer},
    )
    def post(self, request):
        serializer = CreateMagicLinkSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                SuccessResponseSerializer.from_serializer_errors(serializer),
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate a secure random token
        token = secrets.token_urlsafe(32)

        # Token expires in 60 seconds
        expires_at = timezone.now() + timedelta(seconds=60)

        # Store token -> account_id mapping in Redis (shared across all instances)
        redis_client = redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
        cache_key = f"magic_link:{token}"
        token_data = {
            "account_id": str(request.account.id),
            "redirect_url": serializer.validated_data.get("redirect_url", ""),
        }
        redis_client.setex(cache_key, 60, json.dumps(token_data))  # 60 seconds TTL

        return Response(
            {
                "token": token,
                "expires_at": expires_at.isoformat(),
            },
            status=status.HTTP_200_OK,
        )


class ExchangeMagicLinkView(APIView):
    """Exchange a magic link token for JWT access and refresh tokens"""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=ExchangeMagicLinkSerializer,
        responses={200: VerifyCodeResponseSerializer, 400: SuccessResponseSerializer},
    )
    def post(self, request):
        serializer = ExchangeMagicLinkSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                SuccessResponseSerializer.from_serializer_errors(serializer),
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data["token"]
        cache_key = f"magic_link:{token}"

        # Retrieve and immediately delete the token from Redis (one-time use)
        redis_client = redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
        token_data_str = redis_client.get(cache_key)
        if not token_data_str:
            return Response(
                {"success": False, "message": "Invalid or expired magic link"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token_data = json.loads(token_data_str)

        # Delete the token to prevent reuse
        redis_client.delete(cache_key)

        # Get the account
        account_id = token_data.get("account_id")
        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            return Response(
                {"success": False, "message": "Account not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate JWT tokens
        refresh = RefreshToken.for_user(account.user)
        return Response(
            {
                "account": AccountSerializer(account).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_200_OK,
        )


class RequestSupportAuthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=RequestSupportAuthSerializer,
        responses={200: SuccessResponseSerializer, 400: SuccessResponseSerializer},
    )
    def post(self, request):
        import uuid

        from django.core.cache import cache

        serializer = RequestSupportAuthSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                SuccessResponseSerializer.from_serializer_errors(serializer),
                status=status.HTTP_400_BAD_REQUEST,
            )

        phone_number = serializer.validated_data["phone_number"]
        account = Account.objects.filter(account_phone=phone_number).first()

        if not account:
            return Response({"success": False, "message": "Account not found"}, status=status.HTTP_400_BAD_REQUEST)

        # Generate a temporary support token
        support_token = str(uuid.uuid4())[:8].upper()
        cache.set(f"support_auth:{phone_number}", support_token, timeout=1800)  # 30 minutes

        send_slack_message(
            SlackChannel.SIGNUPS,
            f"🔐 Authentication help requested\n"
            f"Phone: {phone_number}\n"
            f"Account: {account.id}\n"
            f"Support Token: {support_token}\n"
            f"User can provide this token for manual verification.\n"
            f"Token expires in 30 minutes.",
        )

        return Response(
            {
                "success": True,
                "message": "Support request sent. Please contact support with your phone number and mention you need authentication help.",
                "support_email": "bryan@acadialearning.org",
                "support_token": support_token,
            },
            status=status.HTTP_200_OK,
        )


class InitializeEntityView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        request=InitializeEntitySerializer,
        responses={200: SuccessResponseSerializer, 400: SuccessResponseSerializer},
    )
    def post(self, request):
        # Handle empty body for backward compatibility with older clients
        # that send Content-Type: application/json with no body
        try:
            data = request.data
        except ParseError:
            data = {}

        serializer = InitializeEntitySerializer(data=data)
        if not serializer.is_valid():
            return Response(
                SuccessResponseSerializer.from_serializer_errors(serializer),
                status=status.HTTP_400_BAD_REQUEST,
            )

        account = request.account
        platform = serializer.validated_data.get("platform", "mobile")

        # Update registration_source if not already set or if explicitly provided
        if not account.registration_source or data.get("platform"):
            account.registration_source = platform
            account.save(update_fields=["registration_source"])

        entity = account.initialize_entity()
        if entity is None:
            return Response({"message": "Entity already exists", "success": True}, status=status.HTTP_200_OK)

        return Response({"message": "Entity initialized", "success": True}, status=status.HTTP_200_OK)


class StripeCheckoutSessionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=StripeCheckoutSessionSerializer,
        responses={
            200: StripeCheckoutSessionResponseSerializer,
        },
    )
    def post(self, request):
        serializer = StripeCheckoutSessionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if not STRIPE_ANNUAL_PRICE_ID or not STRIPE_MONTHLY_PRICE_ID:
            return Response(
                {"error": "STRIPE_ANNUAL_PRICE_ID and STRIPE_MONTHLY_PRICE_ID must be set"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quantity = int(serializer.validated_data.get("quantity"))
        session = stripe.checkout.Session.create(
            success_url=FRONTEND_URL,
            line_items=[{"price": STRIPE_MONTHLY_PRICE_ID, "quantity": quantity}],
            automatic_tax={"enabled": True},
            mode="subscription",
            allow_promotion_codes=True,
            metadata={"account_id": request.account.id, "billing_period": "monthly"},
        )

        return Response(
            {
                "url": session.url,
            },
            status=status.HTTP_200_OK,
        )


class StripeWebhookView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=StripeWebhookSerializer,
        responses={
            200: OpenApiResponse(
                description="Stripe webhook",
            ),
        },
    )
    def post(self, request):
        try:
            if request.data.get("type") != "checkout.session.completed":
                return Response(
                    {"message": "Not a checkout session completed event"},
                    status=status.HTTP_200_OK,
                )

            metadata = request.data.get("data", {}).get("object", {}).get("metadata", {})
            account_id = metadata.get("account_id")
            if not account_id:
                return Response(
                    {"message": "No account ID found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            account = Account.objects.get(id=account_id)
            if not account:
                return Response({"message": "Account not found"}, status=status.HTTP_404_NOT_FOUND)
            account.stripe_customer_id = request.data.get("data", {}).get("object", {}).get("customer")
            account.save(update_fields=["stripe_customer_id"])
            try:
                posthog.capture(
                    distinct_id=account.account_phone,
                    event="stripe_payment_received",
                    properties={"amount": request.data.get("data", {}).get("object", {}).get("amount")},
                )
            except Exception as e:
                logger.warning(f"Failed to send PostHog stripe_payment_received event: {e}")
            send_slack_message(SlackChannel.SIGNUPS, f"New payment for account {str(account)}")

            # Create feedback call goal for new paid customer
            try:
                create_feedback_call_goal(account)
            except Exception as e:
                logger.warning(f"Failed to create feedback call goal for account {account.id}: {e}")

            return Response({"message": "Success"}, status=status.HTTP_200_OK)
        except Exception as e:
            send_slack_message(
                SlackChannel.ENTITY_ISSUES,
                f"Error processing Stripe webhook for account {account_id}: {str(e)}",
            )
            return Response({"message": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ReferralInfoView(APIView):
    """Get information about a referral code for display on the landing page"""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=None,
        responses={200: ReferralInfoResponseSerializer, 404: SuccessResponseSerializer},
    )
    def get(self, request, referral_code: str):
        referring_account = Account.objects.filter(referral_code=referral_code).first()

        if not referring_account:
            return Response(
                {"success": False, "message": "Invalid referral code"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Get the referrer's name
        referrer_profile = UserProfile.objects.filter(account=referring_account, profile_type="parent").first()
        referrer_name = referrer_profile.name if referrer_profile and referrer_profile.name else "A friend"

        return Response(
            {
                "success": True,
                "referrer_name": referrer_name,
                "referral_code": referral_code,
            },
            status=status.HTTP_200_OK,
        )


class LearningWrappedView(APIView):
    """Get Learning Wrapped data for a student profile"""

    permission_classes = [IsAuthenticated]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        request=None,
        responses={200: LearningWrappedSerializer, 404: SuccessResponseSerializer},
    )
    def get(self, request, profile_id: str, year: int):
        # Admin accounts can view any profile's wrapped
        if request.account.is_admin:
            try:
                profile = UserProfile.objects.get(id=profile_id)
            except UserProfile.DoesNotExist:
                raise NotFound("Profile not found")
        else:
            # Regular accounts can only view their own profiles
            try:
                profile = UserProfile.objects.get(id=profile_id, account=request.account)
            except UserProfile.DoesNotExist:
                raise NotFound("Profile not found")

        # Get the wrapped data for the specified year
        try:
            wrapped = LearningWrapped.objects.get(user_profile=profile, year=year)
        except LearningWrapped.DoesNotExist:
            raise NotFound(f"No wrapped data found for {year}")

        return Response(LearningWrappedSerializer(wrapped).data, status=status.HTTP_200_OK)


class LearningWrappedListView(APIView):
    """List all available Learning Wrapped for the current account's profiles"""

    permission_classes = [IsAuthenticated]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        request=None,
        responses={200: LearningWrappedListItemSerializer(many=True)},
    )
    def get(self, request):
        # Get all profiles for this account
        profiles = UserProfile.objects.filter(account=request.account)

        # Get all wraps for these profiles
        wraps = LearningWrapped.objects.filter(user_profile__in=profiles).select_related("user_profile")

        return Response(LearningWrappedListItemSerializer(wraps, many=True).data, status=status.HTTP_200_OK)


class ProfileStatsView(APIView):
    """Get learning stats for a student profile"""

    permission_classes = [IsAuthenticated]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        request=None,
        responses={200: ProfileStatsSerializer, 404: SuccessResponseSerializer},
    )
    def get(self, request, profile_id: str):
        from datetime import timedelta

        from django.db.models import Sum
        from django.utils import timezone

        from entities.models import Session

        # Verify the profile belongs to this account
        try:
            if request.account.is_admin:
                profile = UserProfile.objects.get(id=profile_id)
            else:
                profile = UserProfile.objects.get(id=profile_id, account=request.account)
        except UserProfile.DoesNotExist:
            raise NotFound("Profile not found")

        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())  # Monday

        # Get all processed sessions for this profile
        sessions = Session.objects.filter(
            profile=profile,
            processed_at__isnull=False,
        )

        # Minutes today
        today_sessions = sessions.filter(session_started_at__gte=today_start)
        minutes_today = today_sessions.aggregate(total=Sum("audio_duration_seconds"))["total"] or 0
        minutes_today = int(minutes_today / 60)

        # Sessions and minutes this week
        week_sessions = sessions.filter(session_started_at__gte=week_start)
        sessions_this_week = week_sessions.count()
        minutes_this_week = week_sessions.aggregate(total=Sum("audio_duration_seconds"))["total"] or 0
        minutes_this_week = int(minutes_this_week / 60)

        # Calculate streak (consecutive days with sessions)
        streak = 0
        check_date = today_start

        # Check today first - if no session today, start from yesterday
        has_session_today = sessions.filter(
            session_started_at__gte=today_start,
            session_started_at__lt=today_start + timedelta(days=1),
        ).exists()

        if not has_session_today:
            check_date = today_start - timedelta(days=1)

        # Count consecutive days with sessions
        while True:
            day_start = check_date
            day_end = check_date + timedelta(days=1)

            has_session = sessions.filter(
                session_started_at__gte=day_start,
                session_started_at__lt=day_end,
            ).exists()

            if has_session:
                streak += 1
                check_date -= timedelta(days=1)
            else:
                break

            # Safety limit
            if streak > 365:
                break

        return Response(
            ProfileStatsSerializer(
                {
                    "streak": streak,
                    "minutes_today": minutes_today,
                    "sessions_this_week": sessions_this_week,
                    "minutes_this_week": minutes_this_week,
                }
            ).data,
            status=status.HTTP_200_OK,
        )


class RevenueCatWebhookView(APIView):
    """
    Handle RevenueCat webhook events for subscription updates.

    RevenueCat sends webhooks for events like:
    - INITIAL_PURCHASE: New subscription
    - RENEWAL: Subscription renewed
    - CANCELLATION: Subscription cancelled
    - EXPIRATION: Subscription expired
    - PRODUCT_CHANGE: User changed subscription tier
    - BILLING_ISSUE: Payment failed

    Docs: https://www.revenuecat.com/docs/integrations/webhooks
    """

    permission_classes = [AllowAny]  # Webhooks don't have user auth

    @extend_schema(
        request=None,
        responses={200: SuccessResponseSerializer},
    )
    def post(self, request):
        from datetime import datetime

        from django.utils import timezone as django_timezone

        # Verify webhook signature (optional but recommended)
        # webhook_secret = getattr(settings, 'REVENUECAT_WEBHOOK_SECRET', None)
        # if webhook_secret:
        #     signature = request.headers.get('X-RevenueCat-Signature')
        #     # Verify signature...

        try:
            event = request.data.get("event", {})
            event_type = event.get("type")
            app_user_id = event.get("app_user_id")

            # Log the webhook for debugging
            logger.info(f"RevenueCat webhook received: {event_type} for user {app_user_id}")

            if not app_user_id:
                logger.warning("RevenueCat webhook missing app_user_id")
                return Response({"success": True}, status=status.HTTP_200_OK)

            # Find the account by app_user_id (which is the account UUID)
            try:
                account = Account.objects.get(id=app_user_id)
            except Account.DoesNotExist:
                # Try finding by revenuecat_app_user_id field
                try:
                    account = Account.objects.get(revenuecat_app_user_id=app_user_id)
                except Account.DoesNotExist:
                    logger.warning(f"RevenueCat webhook: Account not found for {app_user_id}")
                    return Response({"success": True}, status=status.HTTP_200_OK)

            # Extract subscription info from the event
            subscriber_info = event.get("subscriber_info", {})
            entitlements = subscriber_info.get("entitlements", {})

            # Check period type (TRIAL, NORMAL, INTRO)
            period_type = event.get("period_type", "NORMAL")
            is_trial = period_type == "TRIAL"
            previous_status = account.revenuecat_subscription_status

            # Check for "Acadia Learning Pro" entitlement
            pro_entitlement = entitlements.get("Acadia Learning Pro", {})

            # Determine subscription status based on event type
            if event_type in ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION"]:
                # Set status based on trial or paid
                if is_trial:
                    account.revenuecat_subscription_status = "trialing"
                else:
                    account.revenuecat_subscription_status = "active"

                account.revenuecat_app_user_id = app_user_id

                if pro_entitlement:
                    account.revenuecat_entitlement = "Acadia Learning Pro"
                    account.revenuecat_product_id = pro_entitlement.get("product_identifier")

                    # Parse expiration date
                    expires_date = pro_entitlement.get("expires_date")
                    if expires_date:
                        account.subscription_expires_at = datetime.fromisoformat(expires_date.replace("Z", "+00:00"))

                # Track trial start in PostHog
                if event_type == "INITIAL_PURCHASE" and is_trial:
                    try:
                        posthog.capture(
                            distinct_id=account.account_phone,
                            event="trial_started",
                            properties={
                                "account_id": str(account.id),
                                "product_id": account.revenuecat_product_id,
                                "source": "mobile",
                            },
                        )
                    except Exception as e:
                        logger.warning(f"Failed to track trial_started in PostHog: {e}")

                    send_slack_message(
                        SlackChannel.SIGNUPS,
                        f"🎉 *New Mobile Trial Started!*\n"
                        f"📱 Account: {account.account_phone}\n"
                        f"📦 Product: {account.revenuecat_product_id or 'Unknown'}",
                    )

                # Track trial conversion (was trialing, now paid)
                elif event_type == "RENEWAL" and previous_status == "trialing" and not is_trial:
                    try:
                        posthog.capture(
                            distinct_id=account.account_phone,
                            event="trial_converted",
                            properties={
                                "account_id": str(account.id),
                                "product_id": account.revenuecat_product_id,
                                "source": "mobile",
                            },
                        )
                    except Exception as e:
                        logger.warning(f"Failed to track trial_converted in PostHog: {e}")

                    # Send Facebook Purchase event for trial conversion
                    try:
                        from utils.facebook import send_fb_event

                        signup_metadata = account.signup_metadata or {}
                        send_fb_event(
                            event_name="Purchase",
                            user_data={
                                "phone": account.account_phone,
                                "external_id": str(account.id),
                                "fbp": signup_metadata.get("fbp"),
                                "fbc": signup_metadata.get("fbc"),
                            },
                            custom_data={
                                "content_name": account.revenuecat_product_id or "subscription",
                                "content_type": "subscription",
                                "currency": "USD",
                            },
                        )
                    except Exception as e:
                        logger.warning(f"Failed to send Facebook Purchase event: {e}")

                    send_slack_message(
                        SlackChannel.SIGNUPS,
                        f"💰 *Trial Converted to Paid!*\n"
                        f"📱 Account: {account.account_phone}\n"
                        f"📦 Product: {account.revenuecat_product_id or 'Unknown'}",
                    )

                    # Create feedback call goal for converted trial customer
                    try:
                        create_feedback_call_goal(account)
                    except Exception as e:
                        logger.warning(f"Failed to create feedback call goal for account {account.id}: {e}")

                # New paid subscription (not a trial)
                elif event_type == "INITIAL_PURCHASE" and not is_trial:
                    # Send Facebook Purchase event for new subscription
                    try:
                        from utils.facebook import send_fb_event

                        signup_metadata = account.signup_metadata or {}
                        send_fb_event(
                            event_name="Purchase",
                            user_data={
                                "phone": account.account_phone,
                                "external_id": str(account.id),
                                "fbp": signup_metadata.get("fbp"),
                                "fbc": signup_metadata.get("fbc"),
                            },
                            custom_data={
                                "content_name": account.revenuecat_product_id or "subscription",
                                "content_type": "subscription",
                                "currency": "USD",
                            },
                        )
                    except Exception as e:
                        logger.warning(f"Failed to send Facebook Purchase event: {e}")

                    send_slack_message(
                        SlackChannel.SIGNUPS,
                        f"💰 *New Mobile Subscription!*\n"
                        f"📱 Account: {account.account_phone}\n"
                        f"📦 Product: {account.revenuecat_product_id or 'Unknown'}",
                    )

                    # Create feedback call goal for new paid customer
                    try:
                        create_feedback_call_goal(account)
                    except Exception as e:
                        logger.warning(f"Failed to create feedback call goal for account {account.id}: {e}")

            elif event_type == "CANCELLATION":
                account.revenuecat_subscription_status = "cancelled"
                send_slack_message(
                    SlackChannel.SIGNUPS, f"😢 *Subscription Cancelled*\n📱 Account: {account.account_phone}"
                )

            elif event_type == "EXPIRATION":
                account.revenuecat_subscription_status = "expired"
                account.subscription_expires_at = django_timezone.now()

            elif event_type == "BILLING_ISSUE":
                logger.warning(f"Billing issue for account {account.account_phone}")
                send_slack_message(SlackChannel.SIGNUPS, f"⚠️ *Billing Issue*\n📱 Account: {account.account_phone}")

            elif event_type == "SUBSCRIBER_ALIAS":
                # User ID alias created - just update the app_user_id
                account.revenuecat_app_user_id = app_user_id

            account.save()

            # Track in PostHog
            try:
                posthog.capture(
                    distinct_id=account.account_phone,
                    event=f"revenuecat_{event_type.lower()}",
                    properties={
                        "account_id": str(account.id),
                        "product_id": account.revenuecat_product_id,
                        "status": account.revenuecat_subscription_status,
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to track RevenueCat event in PostHog: {e}")

            return Response({"success": True}, status=status.HTTP_200_OK)

        except Exception as e:
            logger.exception(f"Error processing RevenueCat webhook: {e}")
            # Return 200 to prevent retries for processing errors
            return Response({"success": True}, status=status.HTTP_200_OK)


class AdminAccountListView(APIView):
    """Admin view to list and search accounts"""

    permission_classes = [IsAdminPermission]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="search",
                type=str,
                required=False,
                description="Search by phone number or profile name",
            ),
            OpenApiParameter(
                name="page",
                type=int,
                required=False,
                description="Page number for pagination (starts at 1)",
            ),
            OpenApiParameter(
                name="page_size",
                type=int,
                required=False,
                description="Number of results per page (default: 20, max: 100)",
            ),
        ],
        responses={200: AdminAccountListResponseSerializer},
    )
    def get(self, request):
        """List accounts with optional search filter"""
        from django.db.models import Q

        queryset = Account.objects.all().prefetch_related("userprofile_set").order_by("-created_at")

        # Search filter
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(account_phone__icontains=search) | Q(userprofile__name__icontains=search)
            ).distinct()

        # Pagination
        page = int(request.query_params.get("page", 1))
        page_size = min(int(request.query_params.get("page_size", 20)), 100)
        total = queryset.count()
        total_pages = (total + page_size - 1) // page_size

        start = (page - 1) * page_size
        end = start + page_size
        accounts = queryset[start:end]

        return Response(
            {
                "results": AdminAccountListSerializer(accounts, many=True).data,
                "count": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
            },
            status=status.HTTP_200_OK,
        )


class AdminAccountLedgerView(APIView):
    """Admin view to get the ledger (SMS + sessions) for a specific account"""

    permission_classes = [IsAdminPermission]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="page",
                type=int,
                required=False,
                description="Page number for pagination (starts at 1)",
            ),
            OpenApiParameter(
                name="page_size",
                type=int,
                required=False,
                description="Number of results per page (default: 50, max: 200)",
            ),
            OpenApiParameter(
                name="sort_order",
                type=str,
                required=False,
                description="Sort order: 'desc' for newest first (default), 'asc' for oldest first",
            ),
        ],
        responses={200: AccountLedgerResponseSerializer},
    )
    def get(self, request, account_id: str):
        """Get the ledger for an account - combines SMS messages and sessions sorted by time"""
        from django.db.models import Q

        from entities.models import Session
        from sms.models import SMSMessage

        try:
            account = Account.objects.prefetch_related("userprofile_set").get(id=account_id)
        except Account.DoesNotExist:
            raise NotFound("Account not found")

        # Get all profile IDs for this account
        profile_ids = list(account.userprofile_set.values_list("id", flat=True))

        # Get SMS messages for this account (by phone number)
        sms_messages = SMSMessage.objects.filter(
            Q(from_number=account.account_phone) | Q(to_number=account.account_phone)
        ).order_by("-created_at")

        # Get sessions for this account's profiles
        sessions = Session.objects.filter(profile_id__in=profile_ids).select_related("profile").order_by("-created_at")

        # Create unified ledger entries
        entries = []

        for sms in sms_messages:
            entries.append(
                {
                    "type": "sms",
                    "timestamp": sms.created_at,
                    "sms": SMSMessageSerializer(sms).data,
                    "session": None,
                }
            )

        for session in sessions:
            # Use session_started_at if available, otherwise created_at
            timestamp = session.session_started_at or session.created_at
            entries.append(
                {
                    "type": "session",
                    "timestamp": timestamp,
                    "sms": None,
                    "session": LedgerSessionSerializer(session).data,
                }
            )

        # Sort by timestamp (descending by default, ascending if requested)
        sort_order = request.query_params.get("sort_order", "desc")
        entries.sort(key=lambda x: x["timestamp"], reverse=(sort_order != "asc"))

        # Pagination
        page = int(request.query_params.get("page", 1))
        page_size = min(int(request.query_params.get("page_size", 50)), 200)
        total = len(entries)
        total_pages = (total + page_size - 1) // page_size if total > 0 else 1

        start = (page - 1) * page_size
        end = start + page_size
        paginated_entries = entries[start:end]

        return Response(
            {
                "account": AdminAccountListSerializer(account).data,
                "entries": paginated_entries,
                "total_entries": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
            },
            status=status.HTTP_200_OK,
        )


class LedgerShareLinkListView(APIView):
    """Admin view to list and create ledger share links"""

    permission_classes = [IsAdminPermission]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        responses={200: LedgerShareLinkSerializer(many=True)},
    )
    def get(self, request):
        """List all share links created by the current admin"""
        from .models import LedgerShareLink

        share_links = LedgerShareLink.objects.filter(created_by=request.user.account).select_related("account")
        return Response(LedgerShareLinkSerializer(share_links, many=True).data)

    @extend_schema(
        request=CreateLedgerShareLinkSerializer,
        responses={201: LedgerShareLinkSerializer},
    )
    def post(self, request):
        """Create a new share link for an account's ledger"""
        from datetime import timedelta

        from django.utils import timezone

        from .models import LedgerShareLink

        serializer = CreateLedgerShareLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        account_id = serializer.validated_data["account_id"]
        description = serializer.validated_data.get("description", "")
        expires_in_days = serializer.validated_data.get("expires_in_days")

        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            raise NotFound("Account not found")

        expires_at = None
        if expires_in_days:
            expires_at = timezone.now() + timedelta(days=expires_in_days)

        share_link = LedgerShareLink.objects.create(
            account=account,
            description=description,
            expires_at=expires_at,
            created_by=request.user.account,
        )

        return Response(LedgerShareLinkSerializer(share_link).data, status=status.HTTP_201_CREATED)


class LedgerShareLinkDetailView(APIView):
    """Admin view to manage individual share links"""

    permission_classes = [IsAdminPermission]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        responses={204: None},
    )
    def delete(self, request, link_id: str):
        """Delete a share link"""
        from .models import LedgerShareLink

        try:
            share_link = LedgerShareLink.objects.get(id=link_id, created_by=request.user.account)
        except LedgerShareLink.DoesNotExist:
            raise NotFound("Share link not found")

        share_link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SharedLedgerView(APIView):
    """Public view to access a shared ledger via token (no authentication required)"""

    permission_classes = []
    authentication_classes = []

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="page",
                type=int,
                required=False,
                description="Page number for pagination (starts at 1)",
            ),
            OpenApiParameter(
                name="page_size",
                type=int,
                required=False,
                description="Number of results per page (default: 50, max: 200)",
            ),
            OpenApiParameter(
                name="sort_order",
                type=str,
                required=False,
                description="Sort order: 'desc' for newest first (default), 'asc' for oldest first",
            ),
        ],
        responses={200: SharedLedgerResponseSerializer},
    )
    def get(self, request, token: str):
        """Get the shared ledger for a given token"""
        from django.db.models import Q

        from entities.models import Session
        from sms.models import SMSMessage

        from .models import LedgerShareLink

        try:
            share_link = LedgerShareLink.objects.select_related("account").get(token=token)
        except LedgerShareLink.DoesNotExist:
            raise NotFound("Share link not found or has expired")

        if not share_link.is_valid():
            raise NotFound("Share link not found or has expired")

        # Increment view count
        share_link.increment_view_count()

        account = share_link.account

        # Get account display name
        profile = account.userprofile_set.filter(name__isnull=False).first()
        account_name = profile.name if profile else account.account_phone

        # Get all profile IDs for this account
        profile_ids = list(account.userprofile_set.values_list("id", flat=True))

        # Filter cutoff date for shared ledger (Dec 30, 2025)
        from datetime import datetime
        from datetime import timezone as dt_timezone

        cutoff_date = datetime(2025, 12, 30, tzinfo=dt_timezone.utc)

        # Get SMS messages for this account (by phone number) - only from cutoff date onwards
        sms_messages = SMSMessage.objects.filter(
            Q(from_number=account.account_phone) | Q(to_number=account.account_phone),
            created_at__gte=cutoff_date,
        ).order_by("-created_at")

        # Get sessions for this account's profiles - only from cutoff date onwards
        sessions = (
            Session.objects.filter(profile_id__in=profile_ids, created_at__gte=cutoff_date)
            .select_related("profile")
            .order_by("-created_at")
        )

        # Create unified ledger entries
        entries = []

        for sms in sms_messages:
            entries.append(
                {
                    "type": "sms",
                    "timestamp": sms.created_at,
                    "sms": SMSMessageSerializer(sms).data,
                    "session": None,
                }
            )

        for session in sessions:
            timestamp = session.session_started_at or session.created_at
            entries.append(
                {
                    "type": "session",
                    "timestamp": timestamp,
                    "sms": None,
                    "session": LedgerSessionSerializer(session).data,
                }
            )

        # Sort by timestamp
        sort_order = request.query_params.get("sort_order", "desc")
        entries.sort(key=lambda x: x["timestamp"], reverse=(sort_order != "asc"))

        # Pagination
        page = int(request.query_params.get("page", 1))
        page_size = min(int(request.query_params.get("page_size", 50)), 200)
        total = len(entries)
        total_pages = (total + page_size - 1) // page_size if total > 0 else 1

        start = (page - 1) * page_size
        end = start + page_size
        paginated_entries = entries[start:end]

        # Get profiles for display
        profiles = [{"name": p.name, "profile_type": p.profile_type} for p in account.userprofile_set.all()]

        return Response(
            {
                "account_name": account_name,
                "profiles": profiles,
                "entries": paginated_entries,
                "total_entries": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
            },
            status=status.HTTP_200_OK,
        )
