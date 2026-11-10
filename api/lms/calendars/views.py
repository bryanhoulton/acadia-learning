import json
import uuid

from drf_spectacular.utils import extend_schema
from livekit.api import (
    RoomAgentDispatch,
    RoomConfiguration,
    VideoGrants,
)
from livekit.api.access_token import AccessToken
from rest_framework import status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from api.settings import LIVEKIT_API_KEY, LIVEKIT_API_SECRET
from entities.authentication import EntityAuthentication
from entities.models import Entity
from entities.services import DRMService
from lms.accounts.authentication import AccountAuthentication
from lms.accounts.models import UserProfile
from lms.accounts.permissions import (
    EntityOrIsAuthenticatedAndSelectedPermission,
    EntityOrIsAuthenticatedPermission,
    IsAuthenticatedAndSelected,
)
from lms.calendars.models import Goal, Task
from lms.calendars.serializers import GoalSerializer, TaskSerializer, TokenSerializer
from sms.models import SMSMessage
from utils.serializers import ErrorSerializer, UUIDJSONEncoder


class TaskViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing tasks.
    Only accessible by entities (internal agent use only).
    """

    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    authentication_classes = [EntityAuthentication]
    permission_classes = [EntityOrIsAuthenticatedPermission]
    lookup_field = "id"

    def get_queryset(self):
        """
        Filter tasks based on the authenticated entity.
        """
        if hasattr(self.request, "auth") and self.request.auth == "entity":
            return Task.objects.filter(entity=self.request.user)
        else:
            # Tasks are only accessible by entities, not user accounts
            return Task.objects.none()

    def perform_create(self, serializer):
        """
        Set the entity when creating a task.
        """
        serializer.save(entity=self.request.user)

    def get_serializer_context(self):
        """
        Add timezone to serializer context.
        """
        context = super().get_serializer_context()
        if hasattr(self.request, "auth") and self.request.auth == "entity":
            user: UserProfile = self.request.user  # type: ignore
            if user:
                context["timezone"] = user.account.timezone
        else:
            try:
                context["timezone"] = self.request.profile.account.entity.timezone
            except (UserProfile.DoesNotExist, AttributeError):
                pass
        return context


class GoalViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing goals.
    Accessible by both entities and authenticated users.
    """

    queryset = Goal.objects.all()
    serializer_class = GoalSerializer
    authentication_classes = [AccountAuthentication, EntityAuthentication]
    permission_classes = [EntityOrIsAuthenticatedAndSelectedPermission]
    lookup_field = "id"

    def get_queryset(self):
        """
        Filter goals based on the authenticated user/entity.
        """
        if hasattr(self.request, "auth") and self.request.auth == "entity":
            return Goal.objects.filter(user_profile__account=self.request.user.account)  # type: ignore
        else:
            try:
                return Goal.objects.filter(user_profile=self.request.profile)
            except (UserProfile.DoesNotExist, AttributeError):
                return Goal.objects.none()

    def perform_create(self, serializer):
        """
        Set the entity when creating a goal.
        """
        if hasattr(self.request, "auth") and self.request.auth == "entity":
            serializer.save(entity=self.request.user)
        else:
            try:
                serializer.save(entity=self.request.profile.account.entity)
            except (UserProfile.DoesNotExist, AttributeError):
                pass

    def get_serializer_context(self):
        """
        Add timezone to serializer context.
        """
        context = super().get_serializer_context()
        if hasattr(self.request, "auth") and self.request.auth == "entity":
            user: UserProfile = self.request.user  # type: ignore
            if user:
                context["timezone"] = user.account.timezone
        else:
            try:
                context["timezone"] = self.request.profile.account.entity.timezone
            except (UserProfile.DoesNotExist, AttributeError):
                pass
        return context


class TokenView(APIView):
    """
    ViewSet for generating tokens for rooms.
    """

    permission_classes = [IsAuthenticatedAndSelected]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        summary="Get a token for a room",
        description="Get a token for a room",
        responses={200: TokenSerializer, 400: ErrorSerializer},
    )
    def get(self, request):
        account = request.account

        # Check if account is locked and not paid
        if account.is_locked and not account.stripe_customer_id:
            return Response(
                {"error": "Account is locked. Please upgrade to a paid plan to start new classroom sessions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if user has sent at least one inbound SMS
        has_sent_sms = SMSMessage.objects.filter(from_number=account.account_phone, direction="inbound").exists()

        if not has_sent_sms:
            return Response(
                {"error": "Please send a text message to get started before joining a session."},
                status=status.HTTP_403_FORBIDDEN,
            )

        entity = Entity.objects.select_related("account").get(account=account)
        drm = DRMService(entity.id)
        profile: UserProfile = request.profile
        # Use profile name if available, otherwise fall back to profile ID
        identity = profile.name if profile.name else str(profile.id)
        metadata = {
            "entity_id": entity.id,
            "entity_api_key": entity.api_key,
            "user_name": identity,
            "user_profile_id": profile.id,
            "timezone": entity.timezone or "America/New_York",
            "entity_memory": drm.get_memory_context(update=False),
            "tutor_name": entity.account.tutor_name,
            "account_phone": entity.account.account_phone,
            "voice_id": profile.voice_id,
            "registration_source": entity.account.registration_source,
            "session_model": entity.session_model,
            "alt_tutor": entity.account.alt_tutor,
        }
        # Include profile_id in room name: "profile-{uuid}_room-{uuid}"
        room_name = f"profile-{profile.id}_room-{uuid.uuid4()}"
        token = (
            AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_grants(VideoGrants(room_join=True, room=room_name))
            .with_room_config(
                RoomConfiguration(
                    agents=[
                        RoomAgentDispatch(
                            agent_name="learning-agent",
                            metadata=json.dumps(metadata, cls=UUIDJSONEncoder),
                        )
                    ],
                )
            )
        )
        return Response({"token": token.to_jwt()})
