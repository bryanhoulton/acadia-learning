import asyncio
import json

from drf_spectacular.utils import OpenApiParameter, extend_schema
from livekit import api
from livekit.api import VideoGrants
from livekit.api.access_token import AccessToken
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.settings import LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL
from lms.accounts.authentication import AccountAuthentication
from lms.accounts.permissions import IsAdminPermission
from utils.serializers import ErrorSerializer


async def _fetch_livekit_rooms():
    """Fetch rooms from LiveKit API (async helper)."""
    lk_api = api.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    try:
        rooms = await lk_api.room.list_rooms(api.ListRoomsRequest())
        return rooms.rooms
    finally:
        await lk_api.aclose()


class ActiveSessionsView(APIView):
    """
    List all active LiveKit rooms for admin human coaching.
    """

    permission_classes = [IsAdminPermission]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        summary="List active sessions",
        description="List all active LiveKit rooms (admin only)",
        responses={200: dict, 403: ErrorSerializer},
    )
    def get(self, request):
        try:
            # Run async LiveKit API call in sync context
            rooms = asyncio.run(_fetch_livekit_rooms())

            sessions = []
            for room in rooms:
                # Extract profile_id from room name format: "profile-{uuid}_room-{uuid}"
                profile_id = None
                if room.name.startswith("profile-"):
                    parts = room.name.split("_")
                    if len(parts) >= 1:
                        profile_id = parts[0].replace("profile-", "")

                sessions.append(
                    {
                        "room_name": room.name,
                        "profile_id": profile_id,
                        "num_participants": room.num_participants,
                        "created_at": room.creation_time,
                    }
                )

            return Response({"sessions": sessions})
        except Exception as e:
            return Response(
                {"error": f"Failed to fetch active sessions: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ShadowTokenView(APIView):
    """
    Generate a shadow participant token for admin to observe a session.
    """

    permission_classes = [IsAdminPermission]
    authentication_classes = [AccountAuthentication]

    @extend_schema(
        summary="Get shadow token",
        description="Generate a token to join a room as a shadow observer (admin only)",
        parameters=[
            OpenApiParameter(
                name="room",
                type=str,
                location=OpenApiParameter.QUERY,
                required=True,
                description="The LiveKit room name to join as shadow observer",
            )
        ],
        responses={200: dict, 400: ErrorSerializer, 403: ErrorSerializer},
    )
    def get(self, request):
        room_name = request.query_params.get("room")
        if not room_name:
            return Response(
                {"error": "room query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        account = request.account
        identity = f"shadow_{account.id}"
        metadata = json.dumps({"shadow": True, "admin_id": str(account.id)})

        # Create token with subscribe-only permissions (no publish)
        token = (
            AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_metadata(metadata)
            .with_grants(
                VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=False,
                    can_subscribe=True,
                    can_publish_data=True,  # Allow sending coaching messages via data channel
                )
            )
        )

        return Response({"token": token.to_jwt(), "identity": identity})
