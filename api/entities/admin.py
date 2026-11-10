from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from .models import (
    Annotation,
    DailySummary,
    Document,
    Entity,
    FiveMinuteSummary,
    HourlySummary,
    Message,
    MonthlySummary,
    Session,
    WeeklySummary,
)


class IsGradeFilter(admin.SimpleListFilter):
    title = "Is Grade"
    parameter_name = "is_grade"

    def lookups(self, request, model_admin):
        return (
            ("yes", "Yes"),
            ("no", "No"),
        )

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.filter(notes__startswith="[SESSION_GRADE]")
        if self.value() == "no":
            return queryset.exclude(notes__startswith="[SESSION_GRADE]")


class SeverityFilter(admin.SimpleListFilter):
    title = "severity type"
    parameter_name = "severity_type"

    def lookups(self, request, model_admin):
        return (
            ("preference", "Preference"),
            ("non_preference", "Non-Preference (All)"),
            ("recoverable_failure", "Recoverable Failure"),
            ("total_failure", "Total Failure"),
        )

    def queryset(self, request, queryset):
        if self.value() == "preference":
            return queryset.filter(severity="preference")
        if self.value() == "non_preference":
            return queryset.exclude(severity="preference")
        if self.value() == "recoverable_failure":
            return queryset.filter(severity="recoverable_failure")
        if self.value() == "total_failure":
            return queryset.filter(severity="total_failure")


@admin.register(Annotation)
class AnnotationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "session_link",
        "start_time",
        "end_time",
        "severity",
        "category",
        "sentiment",
        "is_grade",
        "created_at",
    )
    list_filter = (
        SeverityFilter,
        "severity",
        "category",
        "sentiment",
        IsGradeFilter,
        "created_at",
    )
    search_fields = (
        "notes",
        "session__name",
        "session__room_name",
        "category",
        "severity",
    )
    readonly_fields = ("id", "created_at")
    list_per_page = 50
    ordering = ("-created_at",)

    fieldsets = (
        (
            "Basic Info",
            {
                "fields": (
                    "id",
                    "session",
                    "start_time",
                    "end_time",
                    "created_at",
                )
            },
        ),
        (
            "Classification",
            {
                "fields": (
                    "severity",
                    "category",
                    "sentiment",
                )
            },
        ),
        (
            "Details",
            {"fields": ("notes",)},
        ),
    )

    def session_link(self, obj):
        if obj.session:
            url = reverse("admin:entities_session_change", args=[obj.session.id])
            return format_html(
                '<a href="{}" target="_blank">{}</a>',
                url,
                obj.session.name or obj.session.room_name or "Unnamed Session",
            )
        return "-"

    session_link.short_description = "Session"
    session_link.admin_order_field = "session__name"

    def is_grade(self, obj):
        return obj.notes and obj.notes.startswith("[SESSION_GRADE]")

    is_grade.boolean = True


class GradeInline(admin.TabularInline):
    model = Annotation
    extra = 0
    fields = ("start_time", "end_time", "sentiment", "category", "notes")
    verbose_name = "Session Grade"
    verbose_name_plural = "Session Grades"

    def get_queryset(self, request):
        return super().get_queryset(request).filter(notes__startswith="[SESSION_GRADE]")


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ("__str__", "session_model", "background_model", "created_at", "timezone")
    search_fields = ("name", "description")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("entity", "timestamp", "message_data")
    search_fields = ("entity__name", "message_data")
    readonly_fields = ("created_at",)


@admin.register(FiveMinuteSummary)
class FiveMinuteSummaryAdmin(admin.ModelAdmin):
    list_display = ("entity", "date", "hour", "minute", "summary", "message_count", "created_at")
    search_fields = ("entity__name", "summary")
    readonly_fields = ("created_at",)


@admin.register(HourlySummary)
class HourlySummaryAdmin(admin.ModelAdmin):
    list_display = ("entity", "date", "hour", "summary", "message_count", "created_at")
    search_fields = ("entity__name", "summary")
    readonly_fields = ("created_at",)


@admin.register(DailySummary)
class DailySummaryAdmin(admin.ModelAdmin):
    list_display = ("entity", "summary", "message_count", "created_at")
    search_fields = ("entity__name", "summary")
    readonly_fields = ("created_at",)


@admin.register(WeeklySummary)
class WeeklySummaryAdmin(admin.ModelAdmin):
    list_display = ("entity", "week_start_date", "summary", "message_count", "created_at")
    search_fields = ("entity__name", "summary")
    readonly_fields = ("created_at",)


@admin.register(MonthlySummary)
class MonthlySummaryAdmin(admin.ModelAdmin):
    list_display = ("entity", "year", "month", "summary", "message_count", "created_at")
    search_fields = ("entity__name", "summary")
    readonly_fields = ("created_at",)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("entity", "title", "created_at")
    search_fields = ("entity__name", "title")
    readonly_fields = ("created_at",)


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("name", "room_name", "audio_duration_seconds", "session_started_at", "processed_at")
    search_fields = ("name", "description", "room_name", "transcript", "timestamped_summary")
    readonly_fields = (
        "created_at",
        "processed_at",
        "aws_recording_link",
        "view_all_annotations_link",
        "formatted_leveling_assessment",
    )
    list_filter = ("processed_at", "created_at", "session_started_at")
    inlines = [GradeInline]
    fieldsets = (
        (
            "Session Info",
            {
                "fields": (
                    "name",
                    "profile",
                    "description",
                    "room_name",
                    "recording_url",
                    "aws_recording_link",
                    "view_all_annotations_link",
                    "audio_duration_seconds",
                    "session_started_at",
                    "session_ended_at",
                    "created_at",
                    "processed_at",
                )
            },
        ),
        ("Leveling Assessment", {"fields": ("formatted_leveling_assessment",)}),
        ("Transcript", {"fields": ("transcript",)}),
        ("Timestamped Summary", {"fields": ("timestamped_summary",)}),
        ("Errors", {"fields": ("processing_error",)}),
    )

    def formatted_leveling_assessment(self, obj):
        if not obj.leveling_assessment:
            return "-"

        la = obj.leveling_assessment
        status = la.get("status", "N/A")
        reasoning = la.get("reasoning", "N/A")
        evidence = la.get("evidence", "N/A")
        suggested_level = la.get("suggested_level", "N/A")

        # Color coding for status
        colors = {
            "too_advanced": "red",
            "too_simple": "orange",
            "appropriate": "green",
            "no_signal": "gray",
        }
        color = colors.get(status, "black")

        return format_html(
            "<div>"
            '<strong>Status:</strong> <span style="color: {}; text-transform: uppercase;">{}</span><br>'
            "<strong>Suggested Level:</strong> {}<br>"
            "<strong>Reasoning:</strong> {}<br>"
            "<strong>Evidence:</strong> {}"
            "</div>",
            color,
            status,
            suggested_level,
            reasoning,
            evidence,
        )

    formatted_leveling_assessment.short_description = "Leveling Assessment"

    def view_all_annotations_link(self, obj):
        count = obj.annotations.count()
        url = reverse("admin:entities_annotation_changelist") + f"?session__id__exact={obj.id}"
        return format_html('<a href="{}" target="_blank">View all {} annotations</a>', url, count)

    view_all_annotations_link.short_description = "All Annotations"

    def aws_recording_link(self, obj):
        """Display a clickable link to the S3 recording with refreshed credentials."""
        if not obj or not obj.recording_url:
            return "-"

        presigned_url = obj.get_presigned_url(expiration=3600)  # 1 hour expiration

        if presigned_url:
            return format_html(
                '<a href="{}" target="_blank" style="color: #0066cc; text-decoration: underline;">'
                "🔗 Open Recording in AWS (Valid for 1 hour)</a>",
                presigned_url,
            )
        else:
            return format_html('<span style="color: #cc0000;">❌ Unable to generate presigned URL</span>')

    aws_recording_link.short_description = "AWS Recording Link (Refreshed Credentials)"
