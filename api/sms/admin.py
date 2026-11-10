from django.contrib import admin
from django.utils.html import format_html

from .models import SMSAttachment, SMSMessage


class SMSAttachmentInline(admin.TabularInline):
    model = SMSAttachment
    extra = 0
    readonly_fields = ("media_url", "content_type", "transcription_preview", "created_at")
    fields = ("media_url", "content_type", "transcription_preview", "created_at")

    def transcription_preview(self, obj):
        if obj.transcription:
            return obj.transcription[:100] + "..." if len(obj.transcription) > 100 else obj.transcription
        elif obj.transcription_error:
            return format_html('<span style="color: red;">Error: {}</span>', obj.transcription_error[:50])
        elif obj.is_audio():
            return format_html('<span style="color: orange;">Pending</span>')
        return "-"

    transcription_preview.short_description = "Transcription"


@admin.register(SMSMessage)
class SMSMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "from_number", "to_number", "body_preview", "direction", "has_attachments", "created_at")
    list_filter = ("direction", "has_attachments", "created_at")
    search_fields = ("from_number", "to_number", "body")
    readonly_fields = ("twilio_sid", "linq_chat_id", "linq_message_id", "created_at")
    inlines = [SMSAttachmentInline]

    def body_preview(self, obj):
        if obj.body:
            return obj.body[:50] + "..." if len(obj.body) > 50 else obj.body
        return "(empty)"

    body_preview.short_description = "Body"


@admin.register(SMSAttachment)
class SMSAttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "content_type", "has_transcription", "created_at")
    list_filter = ("content_type", "created_at")
    search_fields = ("message__body", "media_url", "content_type", "transcription")
    readonly_fields = ("created_at",)

    fieldsets = (
        (None, {"fields": ("message", "media_url", "content_type")}),
        ("Transcription", {"fields": ("transcription", "transcription_error")}),
        ("Metadata", {"fields": ("created_at",), "classes": ("collapse",)}),
    )

    def has_transcription(self, obj):
        if obj.transcription:
            return format_html('<span style="color: green;">✓</span>')
        elif obj.transcription_error:
            return format_html('<span style="color: red;">✗</span>')
        elif obj.is_audio():
            return format_html('<span style="color: orange;">⏳</span>')
        return "-"

    has_transcription.short_description = "Transcribed"
