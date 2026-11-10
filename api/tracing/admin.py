from django.contrib import admin

from .models import Eval, Span, Trace


class SpanInline(admin.TabularInline):
    model = Span
    extra = 0
    readonly_fields = ["id", "name", "span_type", "started_at", "ended_at", "duration_ms"]
    fields = ["id", "name", "span_type", "started_at", "ended_at", "duration_ms"]
    show_change_link = True
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Trace)
class TraceAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "entity", "session", "started_at", "ended_at", "span_count"]
    list_filter = ["name", "started_at"]
    search_fields = ["id", "name", "entity__name", "session__room_name"]
    readonly_fields = ["id", "started_at", "ended_at", "metadata"]
    inlines = [SpanInline]
    raw_id_fields = ["entity", "session"]

    def span_count(self, obj):
        return obj.spans.count()

    span_count.short_description = "Spans"


@admin.register(Span)
class SpanAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "span_type", "trace", "parent", "started_at", "duration_ms"]
    list_filter = ["span_type", "started_at"]
    search_fields = ["id", "name", "trace__name"]
    readonly_fields = [
        "id",
        "trace",
        "parent",
        "started_at",
        "ended_at",
        "duration_ms",
        "input_text",
        "output_text",
        "audio_url",
        "audio_duration_ms",
        "metadata",
    ]
    raw_id_fields = ["trace", "parent"]

    fieldsets = [
        (None, {"fields": ["id", "name", "span_type", "trace", "parent"]}),
        ("Timing", {"fields": ["started_at", "ended_at", "duration_ms"]}),
        ("Text I/O", {"fields": ["input_text", "output_text"], "classes": ["collapse"]}),
        (
            "Audio I/O",
            {"fields": ["audio_url", "audio_duration_ms", "audio_format"], "classes": ["collapse"]},
        ),
        ("Metadata", {"fields": ["metadata"], "classes": ["collapse"]}),
    ]


@admin.register(Eval)
class EvalAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "category", "source_span", "created_at", "updated_at"]
    list_filter = ["category", "created_at"]
    search_fields = ["id", "name", "rubric", "category"]
    readonly_fields = ["id", "created_at", "updated_at"]
    raw_id_fields = ["source_span"]

    fieldsets = [
        (None, {"fields": ["id", "name", "category", "source_span"]}),
        ("Content", {"fields": ["input", "rubric"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at"]}),
    ]
