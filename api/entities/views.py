import json
import logging
import os
import uuid
from urllib.parse import urlparse

from django.db.models import F
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from entities.adapters import ADAPTER_REGISTRY
from entities.authentication import EntityAuthentication
from entities.models import Annotation, Document, Entity, Session
from entities.permissions import (
    EntityOnlyPermission,
)
from entities.runtime import EntityRuntime
from entities.serializers import (
    AnnotationSerializer,
    DocumentSerializer,
    EntityCallStateSerializer,
    EntityMemorySerializer,
    SessionListSerializer,
    SessionMergeSerializer,
    SessionSerializer,
)
from entities.services import DRMService
from entities.tasks import (
    get_gemini_profile,
    merge_and_process_sessions,
    process_session_recording,
)
from lms.accounts.authentication import AccountAuthentication
from lms.accounts.permissions import IsAdminPermission
from utils.posthog import track_lesson_completed

logger = logging.getLogger(__name__)


class EntityMemoryView(APIView):
    """
    View to access and update entity memory data.
    ENTITY-ONLY: Only autonomous agents can access this endpoint.
    """

    authentication_classes = [EntityAuthentication]
    permission_classes = [EntityOnlyPermission]

    @extend_schema(
        responses={
            200: OpenApiResponse(
                description="Entity memory",
            ),
        },
    )
    def get(self, request, entity_id):
        """Get entity memory by entity ID"""
        # Verify entity is accessing its own memory
        if request.user.id != entity_id:
            return Response({"error": "Access denied"}, status=status.HTTP_403_FORBIDDEN)

        entity = get_object_or_404(Entity, id=entity_id)
        drm = DRMService(entity.id)
        # Get memory immediately without waiting for summarization
        # Summaries are updated asynchronously when messages are logged
        return Response(
            {
                "id": entity.id,
                "memory_context": drm.get_memory_context(),
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=EntityMemorySerializer,
        responses={
            200: OpenApiResponse(
                description="Entity memory updated",
            ),
        },
    )
    def post(self, request, entity_id):
        """Update entity call memory by entity ID"""
        # Verify entity is accessing its own memory
        if request.user.id != entity_id:
            return Response({"error": "Access denied"}, status=status.HTTP_403_FORBIDDEN)

        entity = get_object_or_404(Entity, id=entity_id)

        # Validate incoming data with serializer
        serializer = EntityMemorySerializer(data=request.data)
        if not serializer.is_valid():
            logger.error(f"Invalid call memory update: {serializer.errors}")
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get validated messages
        messages = serializer.validated_data["messages"]

        drm = DRMService(entity.id)
        # log_messages() automatically triggers async summary update
        drm.log_messages(messages)

        return Response(
            {"success": True, "message_count": len(messages)},
            status=status.HTTP_200_OK,
        )


class EntityJoinCallView(APIView):
    """
    View to handle entity joining a call.
    ENTITY-ONLY: Only autonomous agents can access this endpoint.
    """

    authentication_classes = [EntityAuthentication]
    permission_classes = [EntityOnlyPermission]

    @extend_schema(
        request=EntityCallStateSerializer,
        responses={
            200: OpenApiResponse(
                description="Entity joined call",
            ),
        },
    )
    def post(self, request):
        serializer = EntityCallStateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        entity_id = serializer.validated_data.get("entity_id", None)
        if request.user.id != entity_id:
            return Response({"error": "Access denied"}, status=status.HTTP_403_FORBIDDEN)

        entity = get_object_or_404(Entity, id=entity_id)
        entity.join_call()

        return Response(
            {"success": True, "message": "Entity joined call"},
            status=status.HTTP_200_OK,
        )


class EntityLeaveCallView(APIView):
    """
    View to handle entity leaving a call.
    ENTITY-ONLY: Only autonomous agents can access this endpoint.
    """

    authentication_classes = [EntityAuthentication]
    permission_classes = [EntityOnlyPermission]

    @extend_schema(
        request=EntityCallStateSerializer,
        responses={
            200: OpenApiResponse(
                description="Entity left call",
            ),
        },
    )
    def post(self, request):
        serializer = EntityCallStateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        entity_id = serializer.validated_data.get("entity_id", None)

        # Verify entity is accessing its own call management
        if request.user.id != entity_id:
            return Response({"error": "Access denied"}, status=status.HTTP_403_FORBIDDEN)

        entity = get_object_or_404(Entity, id=entity_id)
        entity.leave_call()

        if entity.account and entity.account.account_phone:
            track_lesson_completed(entity.account.account_phone)

        return Response(
            {"success": True, "message": "Entity left call"},
            status=status.HTTP_200_OK,
        )


class DocumentViewSet(ModelViewSet):
    """
    View to handle entity documents.
    ENTITY-ONLY: Only autonomous agents can access this endpoint.
    """

    authentication_classes = [EntityAuthentication]
    permission_classes = [EntityOnlyPermission]
    serializer_class = DocumentSerializer
    queryset = Document.objects.all()

    def get_queryset(self):
        """
        Filter documents based on the authenticated entity.
        """
        if hasattr(self.request, "auth") and self.request.auth == "entity":
            return Document.objects.filter(entity=self.request.user).order_by("-updated_at")
        else:
            return Document.objects.none()


@csrf_exempt
@require_http_methods(["POST"])
def livekit_webhook(request):
    """Handle LiveKit egress_ended webhook to process session recordings."""
    # Parse the request body
    body = request.body.decode("utf-8")
    payload = json.loads(body)

    if payload.get("event") == "egress_ended":
        info = payload.get("egressInfo")
        file_path = info.get("file").get("filename")
        signing_key = info.get("roomComposite").get("webhooks")[0].get("signingKey")

        if signing_key != os.environ.get("LIVEKIT_WEBHOOK_SIGNING_KEY"):
            logger.warning(f"Invalid signing key: {signing_key}")
            return JsonResponse({})

        # Get room name from the payload
        room_name = info.get("roomName", "unknown")

        # Extract profile_id from room_name format: "profile-{uuid}_room-{uuid}"
        profile_id = None
        try:
            if room_name.startswith("profile-"):
                profile_id = room_name.split("_")[0].replace("profile-", "")
                logger.info(f"Extracted profile_id: {profile_id} from room_name: {room_name}")
        except Exception as e:
            logger.warning(f"Could not parse profile_id from room_name {room_name}: {e}")

        # Generate S3 URL for the recording
        recording_url = f"s3://acadia-recordings/{file_path}"

        # Create Session record with profile link
        session = Session.objects.create(
            room_name=room_name,
            recording_url=recording_url,
            session_ended_at=None,  # Will be set after processing
            profile_id=profile_id if profile_id else None,
        )

        # Link any traces that were created during this session
        from tracing.models import Trace

        linked_count = Trace.objects.filter(room_name=room_name, session__isnull=True).update(session=session)
        if linked_count > 0:
            logger.info(f"Linked {linked_count} traces to session {session.id}")

        # Trigger Celery task to process the recording
        from entities.tasks import process_session_recording

        process_session_recording.delay(str(session.id), file_path)

        logger.info(f"Created session {session.id} for room {room_name} with profile {profile_id}")

    return JsonResponse({})


class SessionViewSet(ModelViewSet):
    """
    ViewSet for viewing and managing session recordings.
    Requires admin authentication.

    Supports:
    - ?search=query - Search by session name, description, or profile name
    - ?page=1&page_size=20 - Pagination
    - ?processed_only=true - Filter to only processed sessions
    """

    authentication_classes = [AccountAuthentication]
    permission_classes = [IsAdminPermission]
    queryset = Session.objects.all().select_related("profile").prefetch_related("annotations")

    def get_serializer_class(self):
        if self.action == "list":
            return SessionListSerializer
        return SessionSerializer

    def get_queryset(self):
        queryset = Session.objects.all().select_related("profile").prefetch_related("annotations")

        # Filter by processed sessions only (have audio)
        processed_only = self.request.query_params.get("processed_only", "false").lower() == "true"
        if processed_only:
            queryset = queryset.filter(processed_at__isnull=False)

        # Search filter
        search = self.request.query_params.get("search", "").strip()
        if search:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(description__icontains=search)
                | Q(profile__name__icontains=search)
                | Q(room_name__icontains=search)
            )

        return queryset.order_by("-created_at")

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="search",
                type=str,
                required=False,
                description="Search by session name, description, profile name, or room name",
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
            OpenApiParameter(
                name="processed_only",
                type=str,
                required=False,
                description="Filter to only processed sessions (true/false)",
            ),
        ],
        responses={
            200: inline_serializer(
                name="PaginatedSessionListResponse",
                fields={
                    "results": SessionListSerializer(many=True),
                    "count": serializers.IntegerField(help_text="Total number of sessions"),
                    "page": serializers.IntegerField(help_text="Current page number"),
                    "page_size": serializers.IntegerField(help_text="Number of results per page"),
                    "total_pages": serializers.IntegerField(help_text="Total number of pages"),
                },
            ),
        },
    )
    def list(self, request, *args, **kwargs):
        """List sessions with pagination."""
        queryset = self.filter_queryset(self.get_queryset())

        # Pagination
        page = request.query_params.get("page")
        page_size = request.query_params.get("page_size", "20")

        if page is not None:
            try:
                page = int(page)
                page_size = min(int(page_size), 100)  # Max 100 per page
                offset = (page - 1) * page_size
                total_count = queryset.count()
                queryset = queryset[offset : offset + page_size]

                serializer = self.get_serializer(queryset, many=True)
                return Response(
                    {
                        "results": serializer.data,
                        "count": total_count,
                        "page": page,
                        "page_size": page_size,
                        "total_pages": (total_count + page_size - 1) // page_size,
                    }
                )
            except (ValueError, TypeError):
                pass

        # No pagination - return all (for backward compatibility)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @csrf_exempt
    @extend_schema(
        request=SessionMergeSerializer,
        responses={200: SessionSerializer},
        description="Merge multiple sessions into the earliest one, moving annotations and appending transcripts.",
    )
    @action(detail=False, methods=["post"])
    def merge(self, request):
        session_ids = request.data.get("session_ids", [])
        if len(session_ids) < 2:
            return Response(
                {"error": "At least 2 session IDs are required for merging"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sessions = list(Session.objects.filter(id__in=session_ids).order_by("created_at"))
        if len(sessions) != len(session_ids):
            return Response(
                {"error": "One or more sessions not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        target_session = sessions[0]
        source_sessions = sessions[1:]

        # Collect keys for audio merging
        recording_keys = []

        # Helper to extract key from s3:// url
        def get_key(url):
            if not url:
                return None
            parsed = urlparse(url)
            if parsed.scheme == "s3":
                return parsed.path.lstrip("/")
            return None

        # Add target key first
        t_key = get_key(target_session.recording_url)
        if t_key:
            recording_keys.append(t_key)

        # Keep track of current total duration to calculate offsets for annotation shifting
        current_duration = target_session.audio_duration_seconds or 0.0

        for source in source_sessions:
            source_duration = source.audio_duration_seconds or 0.0

            # Add source key
            s_key = get_key(source.recording_url)
            if s_key:
                recording_keys.append(s_key)

            # Move annotations with time shift
            source.annotations.all().update(
                session=target_session,
                start_time=F("start_time") + current_duration,
                end_time=F("end_time") + current_duration,
            )

            # Move traces (and their spans) to target session
            source.traces.all().update(session=target_session)

            # Update duration accumulator
            current_duration += source_duration

            # Delete source session
            source.delete()

        # Mark target as processing (it will be updated by the task)
        target_session.processed_at = None
        # We update duration temporarily so the UI might reflect the merge size,
        # but process_session_recording will overwrite with exact file duration.
        target_session.audio_duration_seconds = current_duration
        target_session.save()

        # Trigger async merge and re-processing
        if recording_keys:
            merge_and_process_sessions.delay(str(target_session.id), recording_keys)

        return Response(SessionSerializer(target_session).data)

    @extend_schema(
        description="Re-run Gemini processing for a session. Clears existing Gemini annotations (non-grade) then reprocesses the recording.",
        request=None,
        responses={200: inline_serializer("RerunGeminiResponse", {"cleared": serializers.IntegerField()})},
    )
    @action(detail=True, methods=["post"], url_path="rerun-gemini")
    def rerun_gemini(self, request, pk=None):
        session = self.get_object()

        gemini_profile = get_gemini_profile()
        cleared, _ = (
            Annotation.objects.filter(session=session, created_by=gemini_profile)
            .exclude(notes__startswith="[SESSION_GRADE]")
            .delete()
        )

        if not session.recording_url:
            return Response(
                {"error": "Recording URL not available for this session"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        parsed = urlparse(session.recording_url)
        file_path = parsed.path.lstrip("/")
        if not file_path:
            return Response(
                {"error": "Could not determine recording path for reprocessing"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        process_session_recording.delay(str(session.id), file_path)

        return Response({"cleared": cleared}, status=status.HTTP_200_OK)


class AnnotationViewSet(ModelViewSet):
    """
    ViewSet for creating and managing session annotations.
    Requires admin authentication.
    """

    authentication_classes = [AccountAuthentication]
    permission_classes = [IsAdminPermission]
    serializer_class = AnnotationSerializer
    queryset = Annotation.objects.all()

    def get_queryset(self):
        queryset = Annotation.objects.all()
        session_id = self.request.query_params.get("session")
        if session_id:
            queryset = queryset.filter(session_id=session_id)
        return queryset.order_by("start_time")

    def perform_create(self, serializer):
        profile = getattr(self.request, "profile", None)
        serializer.save(created_by=profile)


# =============================================================================
# Entity Control Panel Views (Admin-only)
# =============================================================================


class EntityControlBaseView(APIView):
    """Base class for entity control panel views."""

    authentication_classes = [AccountAuthentication]
    permission_classes = [IsAdminPermission]

    def get_entity(self, entity_id):
        return get_object_or_404(Entity, id=entity_id)

    def get_runtime(self, entity):
        return EntityRuntime(entity)

    def log_tool_execution(self, entity, tool_name, parameters, result):
        """Log tool execution to entity memory for continuity."""
        drm = DRMService(entity.id)
        call_id = str(uuid.uuid4())
        drm.log_messages(
            [
                {
                    "type": "function_call",
                    "name": tool_name,
                    "call_id": call_id,
                    "arguments": json.dumps(parameters),
                },
                {
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": result if isinstance(result, str) else json.dumps(result),
                },
            ]
        )


class EntityListView(EntityControlBaseView):
    """List all entities for admin selection."""

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="human_controlled",
                type=str,
                required=False,
                description="Filter by human_controlled status (true/false)",
            ),
        ],
        responses={
            200: inline_serializer(
                name="EntityListResponse",
                fields={
                    "id": serializers.IntegerField(),
                    "name": serializers.CharField(),
                    "str": serializers.CharField(),
                    "status": serializers.CharField(),
                    "timezone": serializers.CharField(),
                    "account_phone": serializers.CharField(allow_null=True),
                },
                many=True,
            ),
        },
    )
    def get(self, request):
        entities = Entity.objects.all().select_related("account")

        # Filter by human_controlled if specified
        human_controlled = request.query_params.get("human_controlled")
        if human_controlled is not None:
            human_controlled = human_controlled.lower() == "true"
            entities = entities.filter(account__is_human_controlled=human_controlled)

        return Response(
            [
                {
                    "id": e.id,
                    "name": e.name,
                    "str": str(e),
                    "status": e.status,
                    "timezone": e.timezone,
                    "account_phone": e.account.account_phone if e.account else None,
                }
                for e in entities
            ]
        )


class EntityTimelineView(EntityControlBaseView):
    """Return a unified timeline of user-facing events for an entity."""

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="days",
                type=int,
                required=False,
                description="Number of past days to include (default: 90)",
            ),
        ],
        responses={
            200: inline_serializer(
                name="EntityTimelineResponse",
                fields={
                    "entity": inline_serializer(
                        name="EntityTimelineEntity",
                        fields={
                            "id": serializers.IntegerField(),
                            "name": serializers.CharField(),
                            "created_at": serializers.DateTimeField(),
                        },
                    ),
                    "events": serializers.ListField(),
                },
            ),
        },
    )
    def get(self, request, entity_id):
        from datetime import timedelta

        from django.db.models import Q
        from django.utils import timezone as tz

        from lms.accounts.models import UserProfile
        from sms.models import SMSMessage

        entity = self.get_entity(entity_id)

        days = int(request.query_params.get("days", 90))
        cutoff = tz.now() - timedelta(days=days)

        # --- Sessions via profile__account ---
        from django.db.models.functions import Coalesce

        sessions = (
            Session.objects.filter(profile__account=entity.account)
            .annotate(effective_start=Coalesce("session_started_at", "created_at"))
            .filter(effective_start__gte=cutoff)
            .select_related("profile")
            .order_by("effective_start")
        )

        session_events = [
            {
                "type": "session",
                "id": str(s.id),
                "started_at": (s.session_started_at or s.created_at).isoformat(),
                "ended_at": s.session_ended_at.isoformat() if s.session_ended_at else None,
                "name": s.name,
                "description": s.description,
                "profile_name": s.profile.name if s.profile else None,
                "audio_duration_seconds": s.audio_duration_seconds,
                "annotation_count": s.annotations.count(),
            }
            for s in sessions
        ]

        # --- SMS via phone numbers ---
        account_phone = entity.account.account_phone if entity.account else None
        profile_phones = list(
            UserProfile.objects.filter(account=entity.account)
            .exclude(phone__isnull=True)
            .exclude(phone="")
            .values_list("phone", flat=True)
        )
        phone_numbers = [p for p in ([account_phone] + profile_phones) if p]

        sms_events = []
        if phone_numbers:
            sms_qs = SMSMessage.objects.filter(
                Q(from_number__in=phone_numbers) | Q(to_number__in=phone_numbers),
                created_at__gte=cutoff,
            ).order_by("created_at")
            sms_events = [
                {
                    "type": "sms",
                    "id": m.id,
                    "timestamp": m.created_at.isoformat(),
                    "direction": m.direction,
                    "body": m.body,
                    "from_number": m.from_number,
                    "to_number": m.to_number,
                    "has_attachments": m.has_attachments,
                }
                for m in sms_qs
            ]

        # --- Emails via AgentMail (using messages.list to catch outbound-only threads) ---
        email_events = []
        try:
            from api.settings import AGENTMAIL_DOMAIN, mail
            from utils.emails import get_or_create_inbox

            inbox = get_or_create_inbox(entity.id)
            inbox_addr = f"acadia-{entity.id}@{AGENTMAIL_DOMAIN}"

            page_token = None
            while True:
                kwargs = {"inbox_id": inbox.inbox_id, "limit": 50, "after": cutoff}
                if page_token:
                    kwargs["page_token"] = page_token
                resp = mail.inboxes.messages.list(**kwargs)
                for msg in resp.messages or []:
                    m = msg.model_dump() if hasattr(msg, "model_dump") else (msg if isinstance(msg, dict) else {})
                    msg_ts = m.get("created_at") or m.get("timestamp")
                    if not msg_ts:
                        continue
                    if isinstance(msg_ts, str):
                        from dateutil import parser as dateutil_parser

                        msg_ts = dateutil_parser.parse(msg_ts)
                    msg_ts_str = msg_ts.isoformat() if hasattr(msg_ts, "isoformat") else str(msg_ts)

                    from_addr = m.get("from_", m.get("from", ""))
                    to_addrs = m.get("to", []) or []
                    is_outbound = inbox_addr in str(from_addr)
                    direction = "outbound" if is_outbound else "inbound"
                    body = m.get("text", "") or m.get("body", "") or ""

                    email_events.append(
                        {
                            "type": "email",
                            "id": m.get("message_id", "") or m.get("id", "") or "",
                            "timestamp": msg_ts_str,
                            "subject": m.get("subject", "(no subject)") or "(no subject)",
                            "snippet": body[:200] if body else "",
                            "from_address": str(from_addr),
                            "to_addresses": [str(a) for a in to_addrs] if to_addrs else [],
                            "direction": direction,
                            "thread_id": m.get("thread_id", "") or "",
                        }
                    )

                page_token = getattr(resp, "next_page_token", None) or getattr(resp, "page_token", None)
                if not page_token or not (resp.messages or []):
                    break
        except Exception as e:
            logger.warning(f"Failed to fetch emails for entity {entity_id}: {e}")

        # In DEBUG mode, generate sample emails if none were fetched
        if not email_events:
            from django.conf import settings

            if settings.DEBUG:
                email_events = self._generate_sample_emails(cutoff, tz.now())

        # --- Merge and sort by time ---
        def event_time(e):
            return e.get("started_at") or e.get("timestamp") or ""

        events = sorted(session_events + sms_events + email_events, key=event_time)

        return Response(
            {
                "entity": {
                    "id": entity.id,
                    "name": entity.name,
                    "created_at": entity.created_at.isoformat(),
                },
                "events": events,
            }
        )

    @staticmethod
    def _generate_sample_emails(cutoff, now):
        import random
        import uuid

        subjects_in = [
            (
                "Alex's Math Progress Report",
                "Here is the weekly progress report for Alex. Overall strong improvement in fractions.",
                ["teacher@school.edu"],
            ),
            (
                "Re: Homework Assignment #12",
                "Thank you for sending the extra practice problems. Alex completed them all!",
                ["learner@example.invalid"],
            ),
            (
                "Schedule Change Request",
                "Hi, we need to move Tuesday's session to Thursday if possible. Alex has a doctor's appointment.",
                ["learner@example.invalid"],
            ),
            (
                "Math Competition Registration",
                "Alex has been selected to participate in the regional math competition next month.",
                ["mathclub@school.edu"],
            ),
            (
                "Re: Fraction Word Problems",
                "These are great! Alex said the pizza examples really helped.",
                ["learner@example.invalid"],
            ),
            (
                "Report Card - Q3",
                "Attached is Alex's third quarter report card. Math grade improved from B- to B+!",
                ["teacher@school.edu"],
            ),
            (
                "Re: Extra Practice Materials",
                "Could you send more decimal worksheets? Alex wants to get ahead.",
                ["learner@example.invalid"],
            ),
            (
                "Field Trip Permission Form",
                "Please sign and return the attached permission form for the science museum trip.",
                ["admin@school.edu"],
            ),
            (
                "Re: Session Recording",
                "Thanks for sharing the recording. It's helpful for review at home.",
                ["learner@example.invalid"],
            ),
            (
                "IEP Meeting Follow-up",
                "Following up on our meeting - Alex's math accommodations have been updated.",
                ["counselor@school.edu"],
            ),
        ]

        subjects_out = [
            (
                "Weekly Progress Update for Alex",
                "Hi! Here's a summary of what Alex and I covered this week. Great progress on fractions!",
            ),
            (
                "Re: Schedule Change Request",
                "Thursday works great! I've updated our calendar. See you at the usual time.",
            ),
            (
                "Practice Problems - Decimals",
                "Attached are some extra decimal practice problems for Alex to work through before our next session.",
            ),
            (
                "Re: Math Competition Registration",
                "That's fantastic news! I'd love to help Alex prepare. I'll add some competition-style problems to our sessions.",
            ),
            (
                "Session Summary - Mixed Numbers",
                "Today Alex mastered converting between mixed numbers and improper fractions. Really impressive progress!",
            ),
            (
                "Re: Report Card - Q3",
                "That's wonderful to see! The improvement is well-deserved. Alex has been working very hard.",
            ),
            (
                "Recommended Resources",
                "Here are some online resources and apps that Alex might enjoy for extra math practice.",
            ),
            (
                "Re: IEP Meeting Follow-up",
                "Thank you for the update. I'll incorporate the new accommodations into our tutoring sessions.",
            ),
            (
                "Monthly Learning Summary",
                "Here's Alex's monthly tutoring summary with key achievements and areas for continued focus.",
            ),
            (
                "Holiday Break Study Plan",
                "I've put together a light study plan for the break so Alex stays sharp without feeling overwhelmed.",
            ),
        ]

        events = []
        day = (now - cutoff).days
        tutor_addr = "acadia-tutor@tutor.acadialearning.org"

        while day > 0:
            if random.random() < 0.3:
                ts = now - __import__("datetime").timedelta(
                    days=day,
                    hours=random.randint(6, 20),
                    minutes=random.randint(0, 59),
                )
                thread_id = str(uuid.uuid4())
                if random.random() < 0.5:
                    subj, snippet, senders = random.choice(subjects_in)
                    events.append(
                        {
                            "type": "email",
                            "id": str(uuid.uuid4()),
                            "timestamp": ts.isoformat(),
                            "subject": subj,
                            "snippet": snippet,
                            "direction": "inbound",
                            "from_address": senders[0],
                            "to_addresses": [tutor_addr],
                            "thread_id": thread_id,
                        }
                    )
                else:
                    subj, snippet = random.choice(subjects_out)
                    events.append(
                        {
                            "type": "email",
                            "id": str(uuid.uuid4()),
                            "timestamp": ts.isoformat(),
                            "subject": subj,
                            "snippet": snippet,
                            "direction": "outbound",
                            "from_address": tutor_addr,
                            "to_addresses": ["learner@example.invalid"],
                            "thread_id": thread_id,
                        }
                    )
            day -= 1

        return events


class EntityContextView(EntityControlBaseView):
    """Get entity context including memory, inbox status, and available tools."""

    @extend_schema(
        responses={
            200: inline_serializer(
                name="EntityContextResponse",
                fields={
                    "entity": inline_serializer(
                        name="EntityContextEntity",
                        fields={
                            "id": serializers.IntegerField(),
                            "name": serializers.CharField(),
                            "status": serializers.CharField(),
                            "timezone": serializers.CharField(),
                            "account_phone": serializers.CharField(allow_null=True),
                        },
                    ),
                    "memory_context": serializers.CharField(),
                    "inbox": inline_serializer(
                        name="EntityContextInbox",
                        fields={
                            "unread_sms": serializers.BooleanField(),
                            "unread_emails": serializers.IntegerField(),
                        },
                    ),
                    "tools": serializers.ListField(
                        child=inline_serializer(
                            name="EntityContextTool",
                            fields={
                                "adapter": serializers.CharField(),
                                "name": serializers.CharField(),
                                "description": serializers.CharField(),
                                "schema": serializers.DictField(),
                            },
                        )
                    ),
                },
            ),
        },
    )
    def get(self, request, entity_id):
        entity = self.get_entity(entity_id)
        drm = DRMService(entity.id)

        # Build adapter list with tools
        adapters = [ADAPTER_REGISTRY[name] for name in entity.adapters if name in ADAPTER_REGISTRY]

        return Response(
            {
                "entity": {
                    "id": entity.id,
                    "name": entity.name,
                    "status": entity.status,
                    "timezone": entity.timezone,
                    "account_phone": entity.account.account_phone if entity.account else None,
                },
                "memory_context": drm.get_memory_context(),
                "inbox": {
                    "unread_sms": entity.has_unread_sms(),
                    "unread_emails": len(entity.has_unread_emails()),
                },
                "tools": [
                    {
                        "adapter": adapter.name,
                        "name": tool.name,
                        "description": tool.description,
                        "schema": tool.to_schema(),
                    }
                    for adapter in adapters
                    for tool in adapter.tools
                ],
            }
        )


class EntityExecuteToolView(EntityControlBaseView):
    """Execute a tool as the entity."""

    @extend_schema(
        request=inline_serializer(
            name="EntityExecuteToolRequest",
            fields={
                "tool_name": serializers.CharField(help_text="Name of the tool to execute"),
                "parameters": serializers.DictField(required=False, help_text="Tool parameters"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityExecuteToolResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request - tool_name required or tool not found"),
        },
    )
    def post(self, request, entity_id):
        entity = self.get_entity(entity_id)
        tool_name = request.data.get("tool_name")
        parameters = request.data.get("parameters", {})

        if not tool_name:
            return Response({"error": "tool_name is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Create runtime for tool execution
        runtime = self.get_runtime(entity)
        tool = next((t for t in runtime.available_tools if t.name == tool_name), None)

        if not tool:
            return Response({"error": f"Tool {tool_name} not found"}, status=status.HTTP_400_BAD_REQUEST)

        # Execute tool
        result = tool._execute(runtime, parameters)

        # Log to entity memory
        self.log_tool_execution(entity, tool_name, parameters, result)

        return Response({"result": result})


# SMS Control Views
class EntitySMSListView(EntityControlBaseView):
    """List SMS messages for entity."""

    @extend_schema(
        parameters=[
            OpenApiParameter(name="user_profile_id", type=str, required=False, description="Filter by user profile ID"),
            OpenApiParameter(
                name="limit", type=int, required=False, description="Max messages to return (default 100)"
            ),
        ],
        responses={
            200: inline_serializer(
                name="EntitySMSListResponse",
                fields={
                    "messages": serializers.ListField(child=serializers.DictField()),
                },
            ),
            400: OpenApiResponse(description="SMS adapter not available"),
        },
    )
    def get(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        user_profile_id = request.query_params.get("user_profile_id")
        limit = int(request.query_params.get("limit", 100))

        # Find the sms_list tool
        tool = next((t for t in runtime.available_tools if t.name == "sms_list"), None)
        if not tool:
            return Response({"error": "SMS adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"limit": limit}
        if user_profile_id:
            params["user_profile_id"] = user_profile_id

        result = tool.execute(runtime, params)
        return Response({"messages": result})


class EntitySMSSendView(EntityControlBaseView):
    """Send SMS as entity."""

    @extend_schema(
        request=inline_serializer(
            name="EntitySMSSendRequest",
            fields={
                "user_profile_id": serializers.CharField(help_text="User profile ID to send to"),
                "message": serializers.CharField(help_text="Message content"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntitySMSSendResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request or SMS adapter not available"),
        },
    )
    def post(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        user_profile_id = request.data.get("user_profile_id")
        message = request.data.get("message")

        if not user_profile_id or not message:
            return Response({"error": "user_profile_id and message are required"}, status=status.HTTP_400_BAD_REQUEST)

        tool = next((t for t in runtime.available_tools if t.name == "sms_send"), None)
        if not tool:
            return Response({"error": "SMS adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"user_profile_id": user_profile_id, "message": message}
        result = tool._execute(runtime, params)

        # Log to memory
        self.log_tool_execution(entity, "sms_send", params, result)

        return Response({"result": result})


class EntitySMSReactView(EntityControlBaseView):
    """React to SMS message as entity."""

    @extend_schema(
        request=inline_serializer(
            name="EntitySMSReactRequest",
            fields={
                "message_id": serializers.CharField(help_text="Message ID to react to"),
                "reaction_type": serializers.CharField(help_text="Type of reaction"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntitySMSReactResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request or SMS react tool not available"),
        },
    )
    def post(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        message_id = request.data.get("message_id")
        reaction_type = request.data.get("reaction_type")

        if not message_id or not reaction_type:
            return Response({"error": "message_id and reaction_type are required"}, status=status.HTTP_400_BAD_REQUEST)

        tool = next((t for t in runtime.available_tools if t.name == "sms_react"), None)
        if not tool:
            return Response({"error": "SMS react tool not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"message_id": message_id, "reaction_type": reaction_type}
        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "sms_react", params, result)

        return Response({"result": result})


# Email Control Views
class EntityEmailThreadsView(EntityControlBaseView):
    """List email threads for entity."""

    @extend_schema(
        parameters=[
            OpenApiParameter(name="limit", type=int, required=False, description="Max threads to return (default 10)"),
        ],
        responses={
            200: inline_serializer(
                name="EntityEmailThreadsResponse",
                fields={
                    "threads": serializers.ListField(child=serializers.DictField(), required=False),
                },
            ),
            400: OpenApiResponse(description="Email adapter not available"),
        },
    )
    def get(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        limit = int(request.query_params.get("limit", 10))

        tool = next((t for t in runtime.available_tools if t.name == "email_list_threads"), None)
        if not tool:
            return Response({"error": "Email adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        result = tool.execute(runtime, {"limit": limit})
        return Response(result)


class EntityEmailThreadDetailView(EntityControlBaseView):
    """Get email thread detail."""

    @extend_schema(
        responses={
            200: inline_serializer(
                name="EntityEmailThreadDetailResponse",
                fields={
                    "thread_id": serializers.CharField(required=False),
                    "messages": serializers.ListField(child=serializers.DictField(), required=False),
                },
            ),
            400: OpenApiResponse(description="Email adapter not available"),
        },
    )
    def get(self, request, entity_id, thread_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        tool = next((t for t in runtime.available_tools if t.name == "email_look_at_thread"), None)
        if not tool:
            return Response({"error": "Email adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        result = tool.execute(runtime, {"thread_id": thread_id})
        return Response(result)


class EntityEmailReplyView(EntityControlBaseView):
    """Reply to email as entity."""

    @extend_schema(
        request=inline_serializer(
            name="EntityEmailReplyRequest",
            fields={
                "message_id": serializers.CharField(help_text="Message ID to reply to"),
                "to": serializers.CharField(help_text="Recipient email address"),
                "text": serializers.CharField(help_text="Reply content"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityEmailReplyResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request or email adapter not available"),
        },
    )
    def post(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        message_id = request.data.get("message_id")
        to = request.data.get("to")
        text = request.data.get("text")

        if not message_id or not to or not text:
            return Response({"error": "message_id, to, and text are required"}, status=status.HTTP_400_BAD_REQUEST)

        tool = next((t for t in runtime.available_tools if t.name == "email_respond_to_message"), None)
        if not tool:
            return Response({"error": "Email adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"message_id": message_id, "to": to, "text": text}
        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "email_respond_to_message", params, result)

        return Response({"result": result})


class EntityEmailSendView(EntityControlBaseView):
    """Send new email as entity."""

    @extend_schema(
        request=inline_serializer(
            name="EntityEmailSendRequest",
            fields={
                "to": serializers.CharField(help_text="Recipient email address"),
                "subject": serializers.CharField(help_text="Email subject"),
                "text": serializers.CharField(help_text="Email body"),
                "cc": serializers.CharField(required=False, help_text="CC recipients"),
                "bcc": serializers.CharField(required=False, help_text="BCC recipients"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityEmailSendResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request or email adapter not available"),
        },
    )
    def post(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        to = request.data.get("to")
        subject = request.data.get("subject")
        text = request.data.get("text")
        cc = request.data.get("cc")
        bcc = request.data.get("bcc")

        if not to or not subject or not text:
            return Response({"error": "to, subject, and text are required"}, status=status.HTTP_400_BAD_REQUEST)

        tool = next((t for t in runtime.available_tools if t.name == "email_send_new_message"), None)
        if not tool:
            return Response({"error": "Email adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"to": to, "subject": subject, "text": text}
        if cc:
            params["cc"] = cc
        if bcc:
            params["bcc"] = bcc

        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "email_send_new_message", params, result)

        return Response({"result": result})


# Document Control Views
class EntityDocumentsView(EntityControlBaseView):
    """List and create documents for entity."""

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="limit", type=int, required=False, description="Max documents to return (default 50)"
            ),
            OpenApiParameter(name="offset", type=int, required=False, description="Offset for pagination (default 0)"),
        ],
        responses={
            200: inline_serializer(
                name="EntityDocumentsListResponse",
                fields={
                    "documents": serializers.ListField(child=serializers.DictField()),
                },
            ),
            400: OpenApiResponse(description="Documents adapter not available"),
        },
    )
    def get(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        limit = int(request.query_params.get("limit", 50))
        offset = int(request.query_params.get("offset", 0))

        tool = next((t for t in runtime.available_tools if t.name == "list_documents"), None)
        if not tool:
            return Response({"error": "Documents adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        result = tool.execute(runtime, {"limit": limit, "offset": offset})
        return Response({"documents": result})

    @extend_schema(
        request=inline_serializer(
            name="EntityDocumentCreateRequest",
            fields={
                "title": serializers.CharField(help_text="Document title"),
                "content": serializers.CharField(required=False, help_text="Document content"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityDocumentCreateResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request or documents adapter not available"),
        },
    )
    def post(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        title = request.data.get("title")
        content = request.data.get("content", "")

        if not title:
            return Response({"error": "title is required"}, status=status.HTTP_400_BAD_REQUEST)

        tool = next((t for t in runtime.available_tools if t.name == "create_document"), None)
        if not tool:
            return Response({"error": "Documents adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"title": title, "content": content}
        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "create_document", params, result)

        return Response({"result": result})


class EntityDocumentDetailView(EntityControlBaseView):
    """Update and delete documents for entity."""

    @extend_schema(
        request=inline_serializer(
            name="EntityDocumentUpdateRequest",
            fields={
                "title": serializers.CharField(help_text="Document title"),
                "content": serializers.CharField(help_text="Document content"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityDocumentUpdateResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request or documents adapter not available"),
        },
    )
    def put(self, request, entity_id, document_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        title = request.data.get("title")
        content = request.data.get("content")

        if not title or content is None:
            return Response({"error": "title and content are required"}, status=status.HTTP_400_BAD_REQUEST)

        tool = next((t for t in runtime.available_tools if t.name == "update_document"), None)
        if not tool:
            return Response({"error": "Documents adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"document_id": document_id, "title": title, "content": content}
        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "update_document", params, result)

        return Response({"result": result})

    @extend_schema(
        responses={
            200: inline_serializer(
                name="EntityDocumentDeleteResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Documents adapter not available"),
        },
    )
    def delete(self, request, entity_id, document_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        tool = next((t for t in runtime.available_tools if t.name == "delete_document"), None)
        if not tool:
            return Response({"error": "Documents adapter not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"document_id": document_id}
        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "delete_document", params, result)

        return Response({"result": result})


# Task Control Views
class EntityTasksView(EntityControlBaseView):
    """List and create tasks for entity."""

    @extend_schema(
        parameters=[
            OpenApiParameter(name="start", type=str, required=False, description="Start date filter (ISO format)"),
            OpenApiParameter(name="end", type=str, required=False, description="End date filter (ISO format)"),
        ],
        responses={
            200: inline_serializer(
                name="EntityTasksListResponse",
                fields={
                    "tasks": serializers.ListField(child=serializers.DictField()),
                },
            ),
            400: OpenApiResponse(description="Tasks not available"),
        },
    )
    def get(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        start = request.query_params.get("start")
        end = request.query_params.get("end")

        tool = next((t for t in runtime.available_tools if t.name == "task_list"), None)
        if not tool:
            return Response({"error": "Tasks not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end

        result = tool.execute(runtime, params)
        return Response({"tasks": result})

    @extend_schema(
        request=inline_serializer(
            name="EntityTaskCreateRequest",
            fields={
                "title": serializers.CharField(help_text="Task title"),
                "due_date": serializers.CharField(help_text="Due date (ISO format)"),
                "description": serializers.CharField(required=False, help_text="Task description"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityTaskCreateResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request or tasks not available"),
        },
    )
    def post(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        title = request.data.get("title")
        due_date = request.data.get("due_date")
        description = request.data.get("description")

        if not title or not due_date:
            return Response({"error": "title and due_date are required"}, status=status.HTTP_400_BAD_REQUEST)

        tool = next((t for t in runtime.available_tools if t.name == "task_create"), None)
        if not tool:
            return Response({"error": "Tasks not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"title": title, "due_date": due_date}
        if description:
            params["description"] = description

        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "task_create", params, result)

        return Response({"result": result})


class EntityTaskDetailView(EntityControlBaseView):
    """Update and delete tasks for entity."""

    @extend_schema(
        request=inline_serializer(
            name="EntityTaskUpdateRequest",
            fields={
                "title": serializers.CharField(required=False, help_text="Task title"),
                "description": serializers.CharField(required=False, allow_null=True, help_text="Task description"),
                "due_date": serializers.CharField(required=False, help_text="Due date (ISO format)"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityTaskUpdateResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Tasks not available"),
        },
    )
    def put(self, request, entity_id, task_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        tool = next((t for t in runtime.available_tools if t.name == "task_update"), None)
        if not tool:
            return Response({"error": "Tasks not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"task_id": task_id}
        if request.data.get("title"):
            params["title"] = request.data["title"]
        if request.data.get("description") is not None:
            params["description"] = request.data["description"]
        if request.data.get("due_date"):
            params["due_date"] = request.data["due_date"]

        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "task_update", params, result)

        return Response({"result": result})

    @extend_schema(
        responses={
            200: inline_serializer(
                name="EntityTaskDeleteResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Tasks not available"),
        },
    )
    def delete(self, request, entity_id, task_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        tool = next((t for t in runtime.available_tools if t.name == "task_delete"), None)
        if not tool:
            return Response({"error": "Tasks not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"task_id": task_id}
        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "task_delete", params, result)

        return Response({"result": result})


# Goal Control Views
class EntityGoalsView(EntityControlBaseView):
    """List and create goals for entity."""

    @extend_schema(
        parameters=[
            OpenApiParameter(name="start", type=str, required=False, description="Start date filter (ISO format)"),
            OpenApiParameter(name="end", type=str, required=False, description="End date filter (ISO format)"),
            OpenApiParameter(name="status", type=str, required=False, description="Goal status filter"),
            OpenApiParameter(name="user_profile_id", type=str, required=False, description="Filter by user profile ID"),
        ],
        responses={
            200: inline_serializer(
                name="EntityGoalsListResponse",
                fields={
                    "goals": serializers.ListField(child=serializers.DictField()),
                },
            ),
            400: OpenApiResponse(description="Goals not available"),
        },
    )
    def get(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        start = request.query_params.get("start")
        end = request.query_params.get("end")
        goal_status = request.query_params.get("status")
        user_profile_id = request.query_params.get("user_profile_id")

        tool = next((t for t in runtime.available_tools if t.name == "goal_list"), None)
        if not tool:
            return Response({"error": "Goals not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end
        if goal_status:
            params["status"] = goal_status
        if user_profile_id:
            params["user_profile_id"] = user_profile_id

        result = tool.execute(runtime, params)
        return Response({"goals": result})

    @extend_schema(
        request=inline_serializer(
            name="EntityGoalCreateRequest",
            fields={
                "title": serializers.CharField(help_text="Goal title"),
                "objective": serializers.CharField(help_text="Goal objective"),
                "start_date": serializers.CharField(help_text="Start date (ISO format)"),
                "end_date": serializers.CharField(help_text="End date (ISO format)"),
                "user_profile_id": serializers.CharField(required=False, help_text="User profile ID"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityGoalCreateResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Bad request or goals not available"),
        },
    )
    def post(self, request, entity_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        title = request.data.get("title")
        objective = request.data.get("objective")
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")
        user_profile_id = request.data.get("user_profile_id")

        if not title or not objective or not start_date or not end_date:
            return Response(
                {"error": "title, objective, start_date, and end_date are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tool = next((t for t in runtime.available_tools if t.name == "goal_create"), None)
        if not tool:
            return Response({"error": "Goals not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {
            "title": title,
            "objective": objective,
            "start_date": start_date,
            "end_date": end_date,
        }
        if user_profile_id:
            params["user_profile_id"] = user_profile_id

        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "goal_create", params, result)

        return Response({"result": result})


class EntityGoalDetailView(EntityControlBaseView):
    """Update and delete goals for entity."""

    @extend_schema(
        request=inline_serializer(
            name="EntityGoalUpdateRequest",
            fields={
                "title": serializers.CharField(required=False, help_text="Goal title"),
                "objective": serializers.CharField(required=False, help_text="Goal objective"),
                "start_date": serializers.CharField(required=False, help_text="Start date (ISO format)"),
                "end_date": serializers.CharField(required=False, help_text="End date (ISO format)"),
                "status": serializers.CharField(required=False, help_text="Goal status"),
            },
        ),
        responses={
            200: inline_serializer(
                name="EntityGoalUpdateResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Goals not available"),
        },
    )
    def put(self, request, entity_id, goal_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        tool = next((t for t in runtime.available_tools if t.name == "goal_update"), None)
        if not tool:
            return Response({"error": "Goals not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"goal_id": goal_id}
        if request.data.get("title"):
            params["title"] = request.data["title"]
        if request.data.get("objective"):
            params["objective"] = request.data["objective"]
        if request.data.get("start_date"):
            params["start_date"] = request.data["start_date"]
        if request.data.get("end_date"):
            params["end_date"] = request.data["end_date"]
        if request.data.get("status"):
            params["status"] = request.data["status"]

        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "goal_update", params, result)

        return Response({"result": result})

    @extend_schema(
        responses={
            200: inline_serializer(
                name="EntityGoalDeleteResponse",
                fields={
                    "result": serializers.JSONField(),
                },
            ),
            400: OpenApiResponse(description="Goals not available"),
        },
    )
    def delete(self, request, entity_id, goal_id):
        entity = self.get_entity(entity_id)
        runtime = self.get_runtime(entity)

        tool = next((t for t in runtime.available_tools if t.name == "goal_delete"), None)
        if not tool:
            return Response({"error": "Goals not available"}, status=status.HTTP_400_BAD_REQUEST)

        params = {"goal_id": goal_id}
        result = tool._execute(runtime, params)

        self.log_tool_execution(entity, "goal_delete", params, result)

        return Response({"result": result})


# User Profiles View (for SMS contact selection)
class EntityUserProfilesView(EntityControlBaseView):
    """List user profiles for entity's account."""

    @extend_schema(
        responses={
            200: inline_serializer(
                name="EntityUserProfilesResponse",
                fields={
                    "profiles": serializers.ListField(
                        child=inline_serializer(
                            name="EntityUserProfile",
                            fields={
                                "id": serializers.CharField(),
                                "name": serializers.CharField(),
                                "phone": serializers.CharField(allow_null=True),
                                "email": serializers.CharField(allow_null=True),
                                "role": serializers.CharField(),
                            },
                        )
                    ),
                },
            ),
        },
    )
    def get(self, request, entity_id):
        from lms.accounts.models import UserProfile

        entity = self.get_entity(entity_id)
        profiles = UserProfile.objects.filter(account=entity.account)

        return Response(
            {
                "profiles": [
                    {
                        "id": str(p.id),
                        "name": p.name,
                        "phone": p.phone,
                        "email": p.email,
                        "role": p.profile_type,
                    }
                    for p in profiles
                ]
            }
        )
