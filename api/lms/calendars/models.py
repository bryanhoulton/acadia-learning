import uuid

from django.db import models
from django.db.models import QuerySet

from entities.models import Entity
from lms.accounts.models import UserProfile
from utils.timezone import ensure_timezone_aware


class Task(models.Model):
    """
    Task model for internal agent use only.
    Tasks have titles, descriptions, and due dates.
    """

    created_at = models.DateTimeField(auto_now_add=True, help_text="When the task was created")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the task was last updated")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, help_text="Task title")
    description = models.TextField(blank=True, null=True, help_text="Optional description of the task")

    due_date = models.DateTimeField(null=True, blank=True, help_text="When the task is due (in ISO format)")

    entity = models.ForeignKey(Entity, on_delete=models.CASCADE, help_text="The entity this task belongs to")

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # Ensure due_date is timezone-aware
        if self.due_date:
            self.due_date = ensure_timezone_aware(self.due_date)

        super().save(*args, **kwargs)

    class Meta:
        ordering = ["due_date"]


class Goal(models.Model):
    """
    Goal model with start and end dates, status tracking, and hierarchical structure.
    Goals can have parent goals and nested sub-goals.
    """

    class GoalStatus(models.TextChoices):
        INCOMPLETE = "incomplete", "Incomplete"
        COMPLETE = "complete", "Complete"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, help_text="Goal title")
    objective = models.TextField(help_text="The objective of the goal to be achieved")
    user_profile = models.ForeignKey(UserProfile, on_delete=models.CASCADE)

    start_date = models.DateField(help_text="When the goal period starts (date only)")
    end_date = models.DateField(help_text="When the goal period ends (date only)")

    created_at = models.DateTimeField(auto_now_add=True, help_text="When the goal was created")
    updated_at = models.DateTimeField(auto_now=True, help_text="When the goal was last updated")

    status = models.CharField(
        max_length=20, choices=GoalStatus.choices, default=GoalStatus.INCOMPLETE, help_text="Current status of the goal"
    )

    parent_goal = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sub_goals",
        help_text="Parent goal if this is a sub-goal",
    )

    @property
    def sub_goals(self) -> QuerySet["Goal"]:
        """Returns all sub-goals"""
        return Goal.objects.filter(parent_goal=self)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # Validate start_date < end_date
        if self.start_date and self.end_date and self.start_date >= self.end_date:
            raise ValueError("Goal start date must be before end date")

        super().save(*args, **kwargs)

    def complete(self):
        """Mark the goal as complete"""
        self.status = self.GoalStatus.COMPLETE
        self.save()

        # Complete all sub-goals
        for sub_goal in self.sub_goals.all():
            sub_goal.complete()

    @property
    def is_root_goal(self) -> bool:
        """Returns True if this is a root goal (no parent)"""
        return self.parent_goal is None

    @property
    def has_sub_goals(self) -> bool:
        """Returns True if this goal has sub-goals"""
        return self.sub_goals.exists()

    class Meta:
        ordering = ["start_date"]
