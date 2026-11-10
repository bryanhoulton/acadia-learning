from rest_framework import serializers

from .models import Eval, Span, SpanType, Trace


class SpanSerializer(serializers.ModelSerializer):
    duration_ms = serializers.ReadOnlyField()

    class Meta:
        model = Span
        fields = [
            "id",
            "trace",
            "parent",
            "name",
            "span_type",
            "started_at",
            "ended_at",
            "duration_ms",
            "input_text",
            "output_text",
            "audio_url",
            "audio_data",
            "audio_duration_ms",
            "audio_format",
            "metadata",
        ]
        read_only_fields = ["id", "started_at"]


class SpanLightSerializer(serializers.ModelSerializer):
    """Span serializer without audio_data to reduce memory usage."""

    duration_ms = serializers.ReadOnlyField()

    class Meta:
        model = Span
        fields = [
            "id",
            "trace",
            "parent",
            "name",
            "span_type",
            "started_at",
            "ended_at",
            "duration_ms",
            "input_text",
            "output_text",
            "audio_url",
            "audio_duration_ms",
            "audio_format",
            "metadata",
        ]
        read_only_fields = ["id", "started_at"]


class SpanTimelineSerializer(serializers.ModelSerializer):
    """Minimal span fields for timeline rendering -- no text payloads."""

    duration_ms = serializers.ReadOnlyField()

    class Meta:
        model = Span
        fields = ["id", "trace", "parent", "name", "span_type", "started_at", "ended_at", "duration_ms"]
        read_only_fields = ["id", "started_at"]


class SpanCreateSerializer(serializers.Serializer):
    """Serializer for creating spans via API (used by agent)."""

    trace_id = serializers.UUIDField(required=False, allow_null=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    name = serializers.CharField(max_length=255)
    span_type = serializers.ChoiceField(choices=SpanType.choices, default=SpanType.TEXT)

    # Text I/O
    input_text = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    output_text = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    # Audio I/O
    audio_url = serializers.URLField(required=False, allow_null=True, allow_blank=True)
    audio_data = serializers.CharField(required=False, allow_null=True, allow_blank=True)  # base64
    audio_duration_ms = serializers.IntegerField(required=False, allow_null=True)
    audio_format = serializers.CharField(required=False, allow_null=True, max_length=20)

    # Metadata
    metadata = serializers.JSONField(required=False, default=dict)

    # Entity/Session linking
    entity_id = serializers.IntegerField(required=False, allow_null=True)
    session_id = serializers.UUIDField(required=False, allow_null=True)


class SpanUpdateSerializer(serializers.Serializer):
    """Serializer for updating a span (setting output, ending)."""

    output_text = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    metadata = serializers.JSONField(required=False, default=dict)
    ended = serializers.BooleanField(required=False, default=False)


class SpanFlagSerializer(serializers.Serializer):
    """Serializer for flagging a span with incorrect transcription."""

    corrected_transcription = serializers.CharField(required=True, allow_blank=False)


class TraceSerializer(serializers.ModelSerializer):
    """
    Full trace serializer with spans.
    Note: Uses SpanLightSerializer (excludes audio_data) to prevent memory issues.
    To get audio_data, fetch individual spans via the get_span endpoint.
    """

    spans = SpanLightSerializer(many=True, read_only=True)

    class Meta:
        model = Trace
        fields = [
            "id",
            "name",
            "entity",
            "session",
            "started_at",
            "ended_at",
            "metadata",
            "spans",
        ]
        read_only_fields = ["id", "started_at", "spans"]


class TraceDetailSerializer(serializers.ModelSerializer):
    """Trace serializer without nested spans (spans handled separately for pagination)."""

    class Meta:
        model = Trace
        fields = [
            "id",
            "name",
            "entity",
            "session",
            "started_at",
            "ended_at",
            "metadata",
        ]
        read_only_fields = ["id", "started_at"]


class TraceListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing traces (without nested spans)."""

    entity_name = serializers.SerializerMethodField()
    account_name = serializers.SerializerMethodField()
    span_count = serializers.SerializerMethodField()
    duration_ms = serializers.SerializerMethodField()
    has_error = serializers.SerializerMethodField()

    class Meta:
        model = Trace
        fields = [
            "id",
            "name",
            "entity",
            "entity_name",
            "account_name",
            "session",
            "started_at",
            "ended_at",
            "duration_ms",
            "metadata",
            "span_count",
            "has_error",
        ]
        read_only_fields = ["id", "started_at"]

    def get_entity_name(self, obj) -> str | None:
        return obj.entity.name if obj.entity else None

    def get_account_name(self, obj) -> str | None:
        if obj.entity and obj.entity.account:
            return obj.entity.account.account_phone
        return None

    def get_span_count(self, obj) -> int:
        # Use annotated value if available, otherwise count
        if hasattr(obj, "span_count") and isinstance(obj.span_count, int):
            return obj.span_count
        return obj.spans.count()

    def get_duration_ms(self, obj) -> int | None:
        if obj.started_at and obj.ended_at:
            delta = obj.ended_at - obj.started_at
            return int(delta.total_seconds() * 1000)
        return None

    def get_has_error(self, obj) -> bool:
        return bool(obj.metadata.get("error"))


class TraceCreateSerializer(serializers.Serializer):
    """Serializer for creating a trace."""

    name = serializers.CharField(max_length=255)
    room_name = serializers.CharField(max_length=255, required=False, allow_null=True, allow_blank=True)
    entity_id = serializers.IntegerField(required=False, allow_null=True)
    session_id = serializers.UUIDField(required=False, allow_null=True)
    metadata = serializers.JSONField(required=False, default=dict)


class EvalSerializer(serializers.ModelSerializer):
    """Serializer for Eval model."""

    class Meta:
        model = Eval
        fields = [
            "id",
            "name",
            "input",
            "rubric",
            "category",
            "source_span",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EvalListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing evals."""

    input_preview = serializers.SerializerMethodField()

    class Meta:
        model = Eval
        fields = [
            "id",
            "name",
            "input_preview",
            "rubric",
            "category",
            "source_span",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_input_preview(self, obj) -> str:
        """Return a truncated preview of the input JSON."""
        import json

        input_str = json.dumps(obj.input)
        if len(input_str) > 100:
            return input_str[:100] + "..."
        return input_str


class EvalCreateSerializer(serializers.Serializer):
    """Serializer for creating an eval."""

    name = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    input = serializers.JSONField()
    rubric = serializers.CharField(required=False, allow_blank=True, default="")
    category = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    source_span_id = serializers.UUIDField(required=False, allow_null=True)


class EvalUpdateSerializer(serializers.Serializer):
    """Serializer for updating an eval."""

    name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    input = serializers.JSONField(required=False)
    rubric = serializers.CharField(required=False, allow_blank=True)
    category = serializers.CharField(max_length=255, required=False, allow_blank=True)
