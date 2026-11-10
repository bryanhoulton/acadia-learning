from rest_framework import serializers

from .models import Annotation, Document, Entity, Session


class EntitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Entity
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]


class EntityMemorySerializer(serializers.Serializer):
    """Serializer for entity memory updates.

    This is used to update the entity memory for an entity.
    """

    messages = serializers.ListField(
        child=serializers.DictField(),
        required=True,
        min_length=1,
        error_messages={
            "min_length": "At least one message must be provided",
            "required": "Messages are required",
        },
    )


class EntityCallStateSerializer(serializers.Serializer):
    """Serializer for entity joining a call."""

    entity_id = serializers.IntegerField(required=True)


class SessionMergeSerializer(serializers.Serializer):
    """Serializer for merging multiple sessions."""

    session_ids = serializers.ListField(
        child=serializers.CharField(),
        required=True,
        help_text="List of session IDs to merge",
    )


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]


class AnnotationSerializer(serializers.ModelSerializer):
    """Serializer for session annotations."""

    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Annotation
        fields = [
            "id",
            "session",
            "start_time",
            "end_time",
            "sentiment",
            "category",
            "severity",
            "notes",
            "created_by",
            "created_by_name",
            "created_at",
        ]
        read_only_fields = ["id", "created_by_name", "created_at"]

    def get_created_by_name(self, obj) -> str | None:
        if obj.created_by:
            return obj.created_by.name
        return None


class SessionSerializer(serializers.ModelSerializer):
    """Serializer for session recordings."""

    annotations = AnnotationSerializer(many=True, read_only=True)
    presigned_url = serializers.SerializerMethodField()
    profile_name = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            "id",
            "room_name",
            "profile",
            "profile_name",
            "recording_url",
            "presigned_url",
            "name",
            "description",
            "transcript",
            "timestamped_summary",
            "audio_duration_seconds",
            "session_started_at",
            "session_ended_at",
            "created_at",
            "processed_at",
            "processing_error",
            "leveling_assessment",
            "annotations",
        ]
        read_only_fields = ["id", "created_at", "processed_at", "presigned_url", "annotations"]

    def get_presigned_url(self, obj):
        return obj.get_presigned_url()

    def get_profile_name(self, obj):
        if obj.profile:
            return obj.profile.name
        return None


class SessionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for session list view."""

    profile_name = serializers.SerializerMethodField()
    annotation_count = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            "id",
            "room_name",
            "profile",
            "profile_name",
            "name",
            "description",
            "audio_duration_seconds",
            "session_started_at",
            "session_ended_at",
            "created_at",
            "processed_at",
            "processing_error",
            "annotation_count",
        ]
        read_only_fields = ["id", "created_at", "processed_at"]

    def get_profile_name(self, obj) -> str | None:
        if obj.profile:
            return obj.profile.name
        return None

    def get_annotation_count(self, obj) -> int:
        return obj.annotations.count()


class PaginatedSessionListSerializer(serializers.Serializer):
    """Serializer for paginated session list response."""

    results = SessionListSerializer(many=True)
    count = serializers.IntegerField(help_text="Total number of sessions")
    page = serializers.IntegerField(help_text="Current page number")
    page_size = serializers.IntegerField(help_text="Number of results per page")
    total_pages = serializers.IntegerField(help_text="Total number of pages")
