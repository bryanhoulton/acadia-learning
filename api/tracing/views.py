from datetime import datetime, timezone

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from entities.authentication import EntityAuthentication
from entities.models import Entity, Session
from lms.accounts.authentication import AccountAuthentication
from lms.accounts.permissions import EntityOrIsAuthenticatedPermission

from .models import Eval, Span, Trace
from .serializers import (
    EvalCreateSerializer,
    EvalListSerializer,
    EvalSerializer,
    EvalUpdateSerializer,
    SpanCreateSerializer,
    SpanFlagSerializer,
    SpanLightSerializer,
    SpanSerializer,
    SpanTimelineSerializer,
    SpanUpdateSerializer,
    TraceCreateSerializer,
    TraceDetailSerializer,
    TraceListSerializer,
    TraceSerializer,
)

# Common auth setup for all tracing endpoints
# Supports both entity API key (for agents) and JWT (for admin/debug)
TRACING_AUTH_CLASSES = [EntityAuthentication, AccountAuthentication]
TRACING_PERMISSION_CLASSES = [EntityOrIsAuthenticatedPermission]


@extend_schema(
    request=TraceCreateSerializer,
    responses={201: TraceSerializer},
)
@api_view(["POST"])
@authentication_classes(TRACING_AUTH_CLASSES)
@permission_classes(TRACING_PERMISSION_CLASSES)
def create_trace(request):
    """Create a new trace."""
    serializer = TraceCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    entity = None
    session = None

    if data.get("entity_id"):
        entity = get_object_or_404(Entity, id=data["entity_id"])
    if data.get("session_id"):
        session = get_object_or_404(Session, id=data["session_id"])

    trace = Trace.objects.create(
        name=data["name"],
        room_name=data.get("room_name"),
        entity=entity,
        session=session,
        metadata=data.get("metadata", {}),
    )

    return Response(TraceSerializer(trace).data, status=status.HTTP_201_CREATED)


@extend_schema(
    parameters=[
        OpenApiParameter(
            name="limit", type=int, required=False, description="Number of spans to return (default: 100, max: 500)"
        ),
        OpenApiParameter(name="offset", type=int, required=False, description="Number of spans to skip (default: 0)"),
        OpenApiParameter(
            name="include_audio",
            type=str,
            required=False,
            description="Whether to include audio_data in response (default: false)",
        ),
    ],
    responses={200: TraceDetailSerializer},
)
@api_view(["GET"])
@authentication_classes(TRACING_AUTH_CLASSES)
@permission_classes(TRACING_PERMISSION_CLASSES)
def get_trace(request, trace_id):
    """
    Get a trace with its spans (paginated).

    Query parameters:
    - limit: Number of spans to return (default: 100, max: 500)
    - offset: Number of spans to skip (default: 0)
    - include_audio: Whether to include audio_data in response (default: false)
    """
    trace = get_object_or_404(Trace, id=trace_id)

    # Parse pagination params
    try:
        limit = min(int(request.query_params.get("limit", 100)), 500)
        offset = int(request.query_params.get("offset", 0))
    except ValueError:
        limit = 100
        offset = 0

    include_audio = request.query_params.get("include_audio", "").lower() == "true"

    # Get total span count efficiently
    total_spans = trace.spans.count()

    # Build span queryset with pagination and field optimization
    span_queryset = trace.spans.order_by("started_at")

    # CRITICAL: Defer audio_data from DB query when not needed - this field
    # contains large base64 audio blobs that can cause OOM with many spans
    if not include_audio:
        # Only load fields we actually need (excluding audio_data)
        span_queryset = span_queryset.only(
            "id",
            "trace_id",
            "parent_id",
            "name",
            "span_type",
            "started_at",
            "ended_at",
            "input_text",
            "output_text",
            "audio_url",
            "audio_duration_ms",
            "audio_format",
            "metadata",
        )
    else:
        # When including audio, still use defer to explicitly load all fields
        span_queryset = span_queryset.defer(None)

    spans = span_queryset[offset : offset + limit]

    # Serialize trace without spans (we'll add them separately)
    trace_data = TraceDetailSerializer(trace).data

    # Serialize spans with or without audio data
    if include_audio:
        spans_data = SpanSerializer(spans, many=True).data
    else:
        spans_data = SpanLightSerializer(spans, many=True).data

    trace_data["spans"] = spans_data
    trace_data["spans_pagination"] = {
        "total_count": total_spans,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < total_spans,
    }

    return Response(trace_data)


@extend_schema(
    request=None,
    responses={200: TraceSerializer},
)
@api_view(["PATCH"])
@authentication_classes(TRACING_AUTH_CLASSES)
@permission_classes(TRACING_PERMISSION_CLASSES)
def end_trace(request, trace_id):
    """End a trace."""
    from django.db.models import Prefetch

    trace = get_object_or_404(Trace, id=trace_id)
    trace.ended_at = datetime.now(timezone.utc)
    trace.save(update_fields=["ended_at"])

    # Refetch with deferred audio_data to avoid loading large blobs into memory
    trace = Trace.objects.prefetch_related(Prefetch("spans", queryset=Span.objects.defer("audio_data"))).get(
        id=trace_id
    )

    return Response(TraceSerializer(trace).data)


@extend_schema(
    responses={
        200: inline_serializer(
            name="TraceTimelineResponse",
            fields={
                "id": serializers.UUIDField(),
                "name": serializers.CharField(),
                "started_at": serializers.DateTimeField(),
                "ended_at": serializers.DateTimeField(allow_null=True),
                "spans": SpanTimelineSerializer(many=True),
            },
        ),
    },
)
@api_view(["GET"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def get_trace_timeline(request, trace_id):
    """
    Get a trace with minimal span data for timeline rendering.
    Returns all spans with only positional fields (no text payloads).
    Admin-only endpoint.
    """
    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response({"error": "Admin access required"}, status=status.HTTP_403_FORBIDDEN)

    trace = get_object_or_404(Trace, id=trace_id)
    spans = trace.spans.only("id", "trace_id", "parent_id", "name", "span_type", "started_at", "ended_at").order_by(
        "started_at"
    )

    return Response(
        {
            "id": str(trace.id),
            "name": trace.name,
            "started_at": trace.started_at,
            "ended_at": trace.ended_at,
            "spans": SpanTimelineSerializer(spans, many=True).data,
        }
    )


@extend_schema(
    request=SpanCreateSerializer,
    responses={201: SpanSerializer},
)
@api_view(["POST"])
@authentication_classes(TRACING_AUTH_CLASSES)
@permission_classes(TRACING_PERMISSION_CLASSES)
def create_span(request):
    """Create a new span."""
    serializer = SpanCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data

    # Get or create trace
    trace = None
    if data.get("trace_id"):
        trace = get_object_or_404(Trace, id=data["trace_id"])
    else:
        # Create a new trace
        entity = None
        session = None
        if data.get("entity_id"):
            entity = get_object_or_404(Entity, id=data["entity_id"])
        if data.get("session_id"):
            session = get_object_or_404(Session, id=data["session_id"])

        trace = Trace.objects.create(
            name=data["name"],
            entity=entity,
            session=session,
        )

    # Get parent span if specified
    parent = None
    if data.get("parent_id"):
        parent = get_object_or_404(Span, id=data["parent_id"])
        # Validate that parent belongs to the same trace
        if parent.trace_id != trace.id:
            return Response(
                {"error": "Parent span must belong to the same trace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    span = Span.objects.create(
        trace=trace,
        parent=parent,
        name=data["name"],
        span_type=data["span_type"],
        input_text=data.get("input_text"),
        output_text=data.get("output_text"),
        audio_url=data.get("audio_url"),
        audio_data=data.get("audio_data"),
        audio_duration_ms=data.get("audio_duration_ms"),
        audio_format=data.get("audio_format"),
        metadata=data.get("metadata", {}),
    )

    return Response(SpanSerializer(span).data, status=status.HTTP_201_CREATED)


@extend_schema(
    request=SpanUpdateSerializer,
    responses={200: SpanSerializer},
)
@api_view(["PATCH"])
@authentication_classes(TRACING_AUTH_CLASSES)
@permission_classes(TRACING_PERMISSION_CLASSES)
def update_span(request, span_id):
    """Update a span (set output, add metadata, end it)."""
    span = get_object_or_404(Span, id=span_id)
    serializer = SpanUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    update_fields = []

    if "output_text" in data and data["output_text"] is not None:
        span.output_text = data["output_text"]
        update_fields.append("output_text")

    if data.get("metadata"):
        span.metadata.update(data["metadata"])
        update_fields.append("metadata")

    if data.get("ended"):
        span.ended_at = datetime.now(timezone.utc)
        update_fields.append("ended_at")

    if update_fields:
        span.save(update_fields=update_fields)

    return Response(SpanSerializer(span).data)


@extend_schema(
    responses={200: SpanSerializer},
)
@api_view(["GET"])
@authentication_classes(TRACING_AUTH_CLASSES)
@permission_classes(TRACING_PERMISSION_CLASSES)
def get_span(request, span_id):
    """Get a single span."""
    span = get_object_or_404(Span, id=span_id)
    return Response(SpanSerializer(span).data)


@extend_schema(request=SpanFlagSerializer, responses=SpanSerializer)
@api_view(["POST"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def flag_span(request, span_id):
    """Flag a span as having incorrect transcription and provide correction."""
    span = get_object_or_404(Span, id=span_id)
    serializer = SpanFlagSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data

    # Store flag data in metadata
    span.metadata["flagged"] = True
    span.metadata["corrected_transcription"] = data["corrected_transcription"]
    span.metadata["flagged_at"] = datetime.now(timezone.utc).isoformat()
    span.metadata["flagged_by"] = str(request.account.id) if hasattr(request, "account") and request.account else None
    span.save(update_fields=["metadata"])

    return Response(SpanSerializer(span).data)


@extend_schema(request=None, responses={200: SpanSerializer})
@api_view(["POST"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def unflag_span(request, span_id):
    """Remove flag from a span."""
    span = get_object_or_404(Span, id=span_id)

    # Remove flag data from metadata
    span.metadata.pop("flagged", None)
    span.metadata.pop("corrected_transcription", None)
    span.metadata.pop("flagged_at", None)
    span.metadata.pop("flagged_by", None)
    span.save(update_fields=["metadata"])

    return Response(SpanSerializer(span).data)


@extend_schema(
    parameters=[
        OpenApiParameter(
            name="limit", type=int, required=False, description="Number of traces to return (default: 50, max: 100)"
        ),
        OpenApiParameter(name="offset", type=int, required=False, description="Number of traces to skip (default: 0)"),
    ],
    responses={
        200: inline_serializer(
            name="EntityTracesListResponse",
            fields={
                "results": TraceListSerializer(many=True),
                "pagination": inline_serializer(
                    name="TracePagination",
                    fields={
                        "total_count": serializers.IntegerField(),
                        "limit": serializers.IntegerField(),
                        "offset": serializers.IntegerField(),
                        "has_more": serializers.BooleanField(),
                    },
                ),
            },
        ),
    },
)
@api_view(["GET"])
@authentication_classes(TRACING_AUTH_CLASSES)
@permission_classes(TRACING_PERMISSION_CLASSES)
def list_entity_traces(request, entity_id):
    """
    List traces for an entity with pagination.

    Query parameters:
    - limit: Number of traces to return (default: 50, max: 100)
    - offset: Number of traces to skip (default: 0)
    """
    # Parse pagination params
    try:
        limit = min(int(request.query_params.get("limit", 50)), 100)
        offset = int(request.query_params.get("offset", 0))
    except ValueError:
        limit = 50
        offset = 0

    queryset = Trace.objects.filter(entity_id=entity_id).order_by("-started_at")
    total_count = queryset.count()

    # Paginate traces
    traces = queryset[offset : offset + limit]

    # Use TraceListSerializer (no nested spans) for the list view
    return Response(
        {
            "results": TraceListSerializer(traces, many=True).data,
            "pagination": {
                "total_count": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total_count,
            },
        }
    )


@extend_schema(
    parameters=[
        OpenApiParameter(
            name="limit", type=int, required=False, description="Number of traces to return (default: 10, max: 50)"
        ),
        OpenApiParameter(name="offset", type=int, required=False, description="Number of traces to skip (default: 0)"),
    ],
    responses={
        200: inline_serializer(
            name="SessionTracesListResponse",
            fields={
                "results": TraceListSerializer(many=True),
                "pagination": inline_serializer(
                    name="SessionTracePagination",
                    fields={
                        "total_count": serializers.IntegerField(),
                        "limit": serializers.IntegerField(),
                        "offset": serializers.IntegerField(),
                        "has_more": serializers.BooleanField(),
                    },
                ),
            },
        ),
    },
)
@api_view(["GET"])
@authentication_classes(TRACING_AUTH_CLASSES)
@permission_classes(TRACING_PERMISSION_CLASSES)
def list_session_traces(request, session_id):
    """
    List traces for a session with pagination.

    Query parameters:
    - limit: Number of traces to return (default: 10, max: 50)
    - offset: Number of traces to skip (default: 0)
    """
    # Parse pagination params
    try:
        limit = min(int(request.query_params.get("limit", 10)), 50)
        offset = int(request.query_params.get("offset", 0))
    except ValueError:
        limit = 10
        offset = 0

    queryset = Trace.objects.filter(session_id=session_id).order_by("-started_at")
    total_count = queryset.count()

    # Paginate traces
    traces = queryset[offset : offset + limit]

    # Use TraceListSerializer (no nested spans) for the list view
    # Frontend should fetch individual trace details via get_trace for spans
    return Response(
        {
            "results": TraceListSerializer(traces, many=True).data,
            "pagination": {
                "total_count": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total_count,
            },
        }
    )


@extend_schema(
    parameters=[
        OpenApiParameter(name="entity_id", type=int, required=False, description="Filter by entity ID"),
        OpenApiParameter(name="session_id", type=str, required=False, description="Filter by session ID"),
        OpenApiParameter(
            name="name", type=str, required=False, description="Filter by trace name (contains, case-insensitive)"
        ),
        OpenApiParameter(
            name="started_after", type=str, required=False, description="Filter traces started after this ISO datetime"
        ),
        OpenApiParameter(
            name="sort",
            type=str,
            required=False,
            description="Sort field (started_at, ended_at, name, duration_ms, span_count) - default: -started_at",
        ),
        OpenApiParameter(
            name="limit", type=int, required=False, description="Number of results per page (default: 50, max: 100)"
        ),
        OpenApiParameter(name="offset", type=int, required=False, description="Number of results to skip (default: 0)"),
    ],
    responses={
        200: inline_serializer(
            name="TracesListResponse",
            fields={
                "results": TraceListSerializer(many=True),
                "pagination": inline_serializer(
                    name="TracesListPagination",
                    fields={
                        "total_count": serializers.IntegerField(),
                        "limit": serializers.IntegerField(),
                        "offset": serializers.IntegerField(),
                        "has_more": serializers.BooleanField(),
                    },
                ),
            },
        ),
        403: OpenApiResponse(description="Admin access required"),
    },
)
@api_view(["GET"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def list_traces(request):
    """
    List all traces with pagination and filtering.
    Admin-only endpoint.

    Query parameters:
    - entity_id: Filter by entity ID
    - session_id: Filter by session ID
    - name: Filter by trace name (contains, case-insensitive)
    - started_after: Filter traces started after this ISO datetime
    - sort: Sort field (started_at, ended_at, name, duration_ms, span_count) - default: -started_at
    - limit: Number of results per page (default: 50, max: 100)
    - offset: Number of results to skip (default: 0)
    """
    from django.db.models import Count, F, OuterRef, Subquery
    from django.utils.dateparse import parse_datetime

    # Check admin permission
    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response(
            {"error": "Admin access required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Build base query with optimized select_related
    # Only load the fields we actually need from related models
    queryset = Trace.objects.select_related("entity", "entity__account").only(
        "id",
        "name",
        "started_at",
        "ended_at",
        "metadata",
        "entity_id",
        "session_id",
        "entity__name",
        "entity__account__account_phone",
    )

    # Apply filters BEFORE annotation for better performance
    entity_id = request.query_params.get("entity_id")
    if entity_id:
        queryset = queryset.filter(entity_id=entity_id)

    session_id = request.query_params.get("session_id")
    if session_id:
        queryset = queryset.filter(session_id=session_id)

    # Time range filter (apply early to reduce dataset)
    started_after = request.query_params.get("started_after")
    if started_after:
        parsed_date = parse_datetime(started_after)
        if parsed_date:
            queryset = queryset.filter(started_at__gte=parsed_date)

    # Optimized search filter - avoid expensive distinct() when possible
    search = request.query_params.get("name")  # Keep param name for backwards compatibility
    if search:
        from django.db.models import Q

        # Only use distinct() when searching across related tables
        # If searching by trace name only, no distinct needed
        search_filter = Q(name__icontains=search)
        needs_distinct = False

        # Only search related tables if search doesn't look like a trace name pattern
        if not search.startswith("entity.") and len(search) > 2:
            search_filter |= Q(entity__account__account_phone__icontains=search)
            needs_distinct = True

        queryset = queryset.filter(search_filter)
        if needs_distinct:
            queryset = queryset.distinct()

    # Use Subquery for span_count - more efficient than Count() annotation
    # This only counts spans for the traces we're actually returning
    span_count_subquery = (
        Span.objects.filter(trace_id=OuterRef("pk")).values("trace_id").annotate(count=Count("id")).values("count")
    )
    queryset = queryset.annotate(span_count=Subquery(span_count_subquery))

    # Apply sorting
    sort = request.query_params.get("sort", "-started_at")
    valid_sorts = [
        "started_at",
        "-started_at",
        "ended_at",
        "-ended_at",
        "name",
        "-name",
        "duration_ms",
        "-duration_ms",
        "span_count",
        "-span_count",
    ]
    if sort not in valid_sorts:
        sort = "-started_at"

    # Handle duration_ms sorting (computed field)
    if "duration_ms" in sort:
        # Sort by (ended_at - started_at), nulls last
        desc = sort.startswith("-")
        queryset = queryset.annotate(duration_computed=F("ended_at") - F("started_at"))
        if desc:
            queryset = queryset.order_by(F("duration_computed").desc(nulls_last=True))
        else:
            queryset = queryset.order_by(F("duration_computed").asc(nulls_last=True))
    else:
        queryset = queryset.order_by(sort)

    # Get total count before pagination - use efficient count query
    total_count = queryset.count()

    # Apply pagination
    try:
        limit = min(int(request.query_params.get("limit", 50)), 100)
        offset = int(request.query_params.get("offset", 0))
    except ValueError:
        limit = 50
        offset = 0

    queryset = queryset[offset : offset + limit]

    return Response(
        {
            "results": TraceListSerializer(queryset, many=True).data,
            "pagination": {
                "total_count": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total_count,
            },
        }
    )


@extend_schema(
    parameters=[
        OpenApiParameter(name="search", type=str, required=False, description="Search by name, phone, or profile name"),
    ],
    responses={
        200: inline_serializer(
            name="EntitiesForFilterResponse",
            fields={
                "id": serializers.IntegerField(),
                "name": serializers.CharField(),
                "display": serializers.CharField(),
                "account_name": serializers.CharField(allow_null=True),
                "profile_names": serializers.ListField(child=serializers.CharField()),
            },
            many=True,
        ),
        403: OpenApiResponse(description="Admin access required"),
    },
)
@api_view(["GET"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def list_entities_for_filter(request):
    """
    List entities for filter dropdown with optional server-side search.
    Admin-only endpoint. Returns max 20 results.
    """
    from collections import defaultdict

    from django.db.models import Q

    from lms.accounts.models import UserProfile

    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response(
            {"error": "Admin access required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    search = request.query_params.get("search", "").strip()

    queryset = (
        Entity.objects.select_related("account")
        .only("id", "name", "account__account_phone", "account__id")
        .order_by("-id")
    )

    if search:
        queryset = queryset.filter(
            Q(name__icontains=search)
            | Q(account__account_phone__icontains=search)
            | Q(id__icontains=search)
            | Q(account__userprofile__name__icontains=search)
        ).distinct()

    entities = list(queryset[:20])

    account_ids = [e.account_id for e in entities if e.account_id]
    profile_names_by_account = defaultdict(list)
    for name, acct_id in UserProfile.objects.filter(account_id__in=account_ids).values_list("name", "account_id"):
        if name:
            profile_names_by_account[acct_id].append(name)

    result = []
    for e in entities:
        profiles = profile_names_by_account.get(e.account_id, [])
        phone = e.account.account_phone if e.account else None
        first_profile = profiles[0] if profiles else None
        display = f"{first_profile} ({phone})" if first_profile and phone else (phone or e.name)
        result.append(
            {
                "id": e.id,
                "name": e.name,
                "display": display,
                "account_name": phone,
                "profile_names": profiles,
            }
        )

    return Response(result)


# =============================================================================
# Eval endpoints
# =============================================================================


@extend_schema(
    request=EvalCreateSerializer,
    responses={
        201: EvalSerializer,
        403: OpenApiResponse(description="Admin access required"),
    },
)
@api_view(["POST"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def create_eval(request):
    """
    Create a new eval.
    Admin-only endpoint.
    """
    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response(
            {"error": "Admin access required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = EvalCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    source_span = None
    if data.get("source_span_id"):
        source_span = get_object_or_404(Span, id=data["source_span_id"])

    eval_obj = Eval.objects.create(
        name=data.get("name", ""),
        input=data["input"],
        rubric=data.get("rubric", ""),
        category=data.get("category", ""),
        source_span=source_span,
    )

    return Response(EvalSerializer(eval_obj).data, status=status.HTTP_201_CREATED)


@extend_schema(
    parameters=[
        OpenApiParameter(name="category", type=str, required=False, description="Filter by category"),
        OpenApiParameter(
            name="search", type=str, required=False, description="Search by name or rubric (contains, case-insensitive)"
        ),
        OpenApiParameter(
            name="limit", type=int, required=False, description="Number of results per page (default: 50, max: 100)"
        ),
        OpenApiParameter(name="offset", type=int, required=False, description="Number of results to skip (default: 0)"),
    ],
    responses={
        200: inline_serializer(
            name="EvalsListResponse",
            fields={
                "results": EvalListSerializer(many=True),
                "pagination": inline_serializer(
                    name="EvalsPagination",
                    fields={
                        "total_count": serializers.IntegerField(),
                        "limit": serializers.IntegerField(),
                        "offset": serializers.IntegerField(),
                        "has_more": serializers.BooleanField(),
                    },
                ),
            },
        ),
        403: OpenApiResponse(description="Admin access required"),
    },
)
@api_view(["GET"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def list_evals(request):
    """
    List all evals with pagination and filtering.
    Admin-only endpoint.

    Query parameters:
    - category: Filter by category
    - search: Search by name or rubric (contains, case-insensitive)
    - limit: Number of results per page (default: 50, max: 100)
    - offset: Number of results to skip (default: 0)
    """
    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response(
            {"error": "Admin access required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    queryset = Eval.objects.all()

    # Filter by category
    category = request.query_params.get("category")
    if category:
        queryset = queryset.filter(category=category)

    # Search filter
    search = request.query_params.get("search")
    if search:
        from django.db.models import Q

        queryset = queryset.filter(Q(name__icontains=search) | Q(rubric__icontains=search))

    # Get total count before pagination
    total_count = queryset.count()

    # Apply pagination
    try:
        limit = min(int(request.query_params.get("limit", 50)), 100)
        offset = int(request.query_params.get("offset", 0))
    except ValueError:
        limit = 50
        offset = 0

    queryset = queryset[offset : offset + limit]

    return Response(
        {
            "results": EvalListSerializer(queryset, many=True).data,
            "pagination": {
                "total_count": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total_count,
            },
        }
    )


@extend_schema(
    responses={
        200: EvalSerializer,
        403: OpenApiResponse(description="Admin access required"),
    },
)
@api_view(["GET"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def get_eval(request, eval_id):
    """Get a single eval."""
    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response(
            {"error": "Admin access required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    eval_obj = get_object_or_404(Eval, id=eval_id)
    return Response(EvalSerializer(eval_obj).data)


@extend_schema(
    request=EvalUpdateSerializer,
    responses={
        200: EvalSerializer,
        403: OpenApiResponse(description="Admin access required"),
    },
)
@api_view(["PATCH"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def update_eval(request, eval_id):
    """Update an eval."""
    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response(
            {"error": "Admin access required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    eval_obj = get_object_or_404(Eval, id=eval_id)
    serializer = EvalUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    update_fields = []

    if "name" in data:
        eval_obj.name = data["name"]
        update_fields.append("name")

    if "input" in data:
        eval_obj.input = data["input"]
        update_fields.append("input")

    if "rubric" in data:
        eval_obj.rubric = data["rubric"]
        update_fields.append("rubric")

    if "category" in data:
        eval_obj.category = data["category"]
        update_fields.append("category")

    if update_fields:
        eval_obj.save(update_fields=update_fields + ["updated_at"])

    return Response(EvalSerializer(eval_obj).data)


@extend_schema(
    responses={
        204: OpenApiResponse(description="Eval deleted successfully"),
        403: OpenApiResponse(description="Admin access required"),
    },
)
@api_view(["DELETE"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def delete_eval(request, eval_id):
    """Delete an eval."""
    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response(
            {"error": "Admin access required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    eval_obj = get_object_or_404(Eval, id=eval_id)
    eval_obj.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    responses={
        200: inline_serializer(
            name="EvalCategoriesResponse",
            fields={
                "categories": serializers.ListField(child=serializers.CharField()),
            },
        ),
        403: OpenApiResponse(description="Admin access required"),
    },
)
@api_view(["GET"])
@authentication_classes([AccountAuthentication])
@permission_classes([EntityOrIsAuthenticatedPermission])
def list_eval_categories(request):
    """
    List all unique eval categories.
    Admin-only endpoint.
    """
    if not getattr(request, "account", None) or not request.account.is_admin:
        return Response(
            {"error": "Admin access required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    categories = Eval.objects.exclude(category="").values_list("category", flat=True).distinct().order_by("category")
    return Response(list(categories))
