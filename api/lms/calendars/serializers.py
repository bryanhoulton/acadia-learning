from datetime import datetime, timezone

from rest_framework import serializers

from utils.timezone import force_timezone

from .models import Goal, Task


class TaskSerializer(serializers.ModelSerializer):
    is_overdue = serializers.SerializerMethodField()

    def get_is_overdue(self, obj: Task) -> bool:
        """Check if the task is overdue"""
        if obj.due_date is None:
            return False
        # Get timezone from context, fallback to entity timezone, then UTC
        tz = self.context.get("timezone", obj.entity.timezone or "UTC")
        now = force_timezone(datetime.now(timezone.utc), tz)
        due_date = force_timezone(obj.due_date, tz)
        return due_date < now

    def to_representation(self, instance: Task):
        data = super().to_representation(instance)
        # Get timezone from context, fallback to entity timezone, then UTC
        tz = self.context.get("timezone", instance.entity.timezone or "UTC")
        if instance.due_date:
            tz_aware_due_date = force_timezone(instance.due_date, tz)
            data["due_date"] = tz_aware_due_date.isoformat()
        else:
            data["due_date"] = None
        return data

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "due_date",
            "created_at",
            "updated_at",
            "entity",
            "is_overdue",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "entity",
        ]


class GoalSerializer(serializers.ModelSerializer):
    sub_goals = serializers.SerializerMethodField()
    is_root_goal = serializers.ReadOnlyField()
    has_sub_goals = serializers.ReadOnlyField()
    user_profile_name = serializers.SerializerMethodField()

    def get_sub_goals(self, obj: Goal):
        """Serialize sub-goals as a list of goal data"""
        sub_goals_qs = obj.sub_goals.all()
        return GoalSerializer(sub_goals_qs, many=True, context=self.context).data

    def get_user_profile_name(self, obj: Goal) -> str | None:
        """Get the name of the user profile associated with this goal"""
        if obj.user_profile:
            return obj.user_profile.name or "Unnamed"
        return None

    class Meta:
        model = Goal
        fields = [
            "id",
            "title",
            "objective",
            "start_date",
            "end_date",
            "status",
            "parent_goal",
            "user_profile",
            "user_profile_name",
            "created_at",
            "updated_at",
            "is_root_goal",
            "has_sub_goals",
            "sub_goals",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "user_profile",
        ]


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField()
