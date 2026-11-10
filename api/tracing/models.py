import uuid

from django.db import models


class Trace(models.Model):
    """
    Represents a top-level execution context (e.g., a request, task, or agent run).
    Contains multiple spans that form a tree structure.

    Can be linked to an Entity (for runtime traces) or Session (for call traces).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    # Room name for linking to Session after it's created
    room_name = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_index=True,
        help_text="LiveKit room name - used to link trace to Session after session completes",
    )

    # Optional links to domain objects
    entity = models.ForeignKey(
        "entities.Entity",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="traces",
    )
    session = models.ForeignKey(
        "entities.Session",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="traces",
    )

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["-started_at"]),
            models.Index(fields=["name"]),
            models.Index(fields=["entity"]),
            models.Index(fields=["session"]),
            # Composite indexes for query optimization
            models.Index(fields=["entity", "-started_at"], name="idx_trace_entity_time"),
            models.Index(fields=["-ended_at"], name="idx_trace_ended"),
            models.Index(fields=["started_at", "ended_at"], name="idx_trace_timerange"),
        ]

    def __str__(self):
        return f"{self.name} ({self.id})"


class SpanType(models.TextChoices):
    TEXT = "text", "Text"
    AUDIO = "audio", "Audio"
    TOOL = "tool", "Tool"
    FUNCTION = "function", "Function"
    LLM = "llm", "LLM"


class Span(models.Model):
    """
    Represents a single unit of work within a trace.
    Supports parent-child relationships for nested tracing.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trace = models.ForeignKey(Trace, on_delete=models.CASCADE, related_name="spans")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
    )
    name = models.CharField(max_length=255)
    span_type = models.CharField(max_length=20, choices=SpanType.choices, default=SpanType.TEXT)

    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    # Text I/O
    input_text = models.TextField(null=True, blank=True)
    output_text = models.TextField(null=True, blank=True)

    # Audio I/O
    audio_url = models.URLField(max_length=2048, null=True, blank=True)
    audio_data = models.TextField(null=True, blank=True)  # base64 encoded
    audio_duration_ms = models.IntegerField(null=True, blank=True)
    audio_format = models.CharField(max_length=20, null=True, blank=True)  # mp3, wav, etc.

    # Generic metadata
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["started_at"]
        indexes = [
            models.Index(fields=["trace", "started_at"]),
            models.Index(fields=["parent"]),
            models.Index(fields=["span_type"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.span_type})"

    @property
    def duration_ms(self) -> int | None:
        """Calculate span duration in milliseconds."""
        if self.started_at and self.ended_at:
            delta = self.ended_at - self.started_at
            return int(delta.total_seconds() * 1000)
        return None


class Eval(models.Model):
    """
    Represents an evaluation case for testing LLM outputs.
    Contains input data and a rubric for assessing quality.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, blank=True, default="")
    input = models.JSONField(help_text="JSON input data for the evaluation")
    rubric = models.TextField(blank=True, default="", help_text="Evaluation criteria/rubric")
    category = models.CharField(max_length=255, blank=True, default="", db_index=True)

    # Optional link to the source span
    source_span = models.ForeignKey(
        Span,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="evals",
        help_text="The span this eval was created from",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self):
        if self.name:
            return f"{self.name} ({self.id})"
        return f"Eval ({self.id})"
