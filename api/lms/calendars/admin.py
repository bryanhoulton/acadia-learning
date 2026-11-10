from django.contrib import admin

from .models import Goal, Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["title", "entity", "due_date", "created_at"]
    list_filter = ["due_date", "created_at", "entity"]
    search_fields = ["title", "description", "entity__name"]
    ordering = ["due_date"]
    readonly_fields = ["id", "created_at", "updated_at"]
    autocomplete_fields = ["entity"]

    fieldsets = (
        (None, {"fields": ("title", "description", "entity")}),
        ("Schedule", {"fields": ("due_date",)}),
        (
            "Metadata",
            {"fields": ("id", "created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("entity")


@admin.register(Goal)
class GoalAdmin(admin.ModelAdmin):
    list_display = ["title", "user_profile", "status", "start_date", "end_date", "parent_goal"]
    list_filter = ["status", "start_date", "end_date", "created_at", "user_profile__name"]
    search_fields = ["title", "objective", "user_profile__name"]
    ordering = ["start_date"]
    readonly_fields = ["id", "created_at", "updated_at"]
    autocomplete_fields = ["user_profile", "parent_goal"]

    fieldsets = (
        (None, {"fields": ("title", "user_profile", "objective")}),
        ("Schedule", {"fields": ("start_date", "end_date", "status")}),
        ("Hierarchy", {"fields": ("parent_goal",)}),
        (
            "Metadata",
            {"fields": ("id", "created_at", "updated_at"), "classes": ("collapse",)},
        ),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user_profile", "parent_goal")
