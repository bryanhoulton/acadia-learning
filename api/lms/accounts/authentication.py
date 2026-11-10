from django.contrib.auth.models import User
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication

from lms.accounts.models import Account, UserProfile


class AuthenticatedRequest(Request):
    account: Account
    profile: UserProfile | None


class AuthenticatedAndSelectedRequest(AuthenticatedRequest):
    profile: UserProfile


class AccountAuthentication(JWTAuthentication):
    def authenticate(self, request):
        resp = super().authenticate(request)
        if resp is None:
            return None

        user: User = resp[0]

        try:
            account = Account.objects.get(user=user)
            request.account = account  # type: ignore

            selected_profile_id = request.headers.get("X-Selected-Profile-Id")
            if selected_profile_id:
                selected_profile = UserProfile.objects.filter(id=selected_profile_id, account=account).first()
                if selected_profile:
                    request.profile = selected_profile  # type: ignore
                else:
                    request.profile = None  # type: ignore
            else:
                request.profile = None  # type: ignore

            return resp
        except Account.DoesNotExist:
            return None


class AccountAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "lms.accounts.authentication.AccountAuthentication"
    name = "AccountAuthentication"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
