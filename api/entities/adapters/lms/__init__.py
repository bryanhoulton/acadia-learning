from entities.adapters import Adapter, register_adapter

from .accounts import (
    CreateReportCardTool,
    CreateUserProfileTool,
    DeleteReportCardTool,
    DeleteUserProfileTool,
    ListReportCardsTool,
    ShowAccountTool,
    UpdateProfileTool,
)
from .calendar import (
    GoalCreateTool,
    GoalDeleteTool,
    GoalListTool,
    GoalUpdateTool,
    TaskCreateTool,
    TaskDeleteTool,
    TaskListTool,
    TaskUpdateTool,
)


@register_adapter
class LMSAdapter(Adapter):
    name = "LMS"
    description = """
    Learning Management System adapter. Allows you to interact with your tasks and goals. You are the only one who can see or change these tasks and goals.

    Use them to help with internal planning and organization.

    Instructions:
    - Goals allow you to plan longer term objectives for the student. Goals are generally tied to skill
      mastery and progress, like "show mastery of fractions by the end of the week". They are only visible
      to you and are for your internal planning.
    - Tasks are smaller objective that are usually for your planning. Think of them like a TODO list for things
      you need to remember across days. Any time you need to do somethings LATER (after sleeping), create a task.
    """
    tools = [
        ShowAccountTool(),
        CreateUserProfileTool(),
        DeleteUserProfileTool(),
        UpdateProfileTool(),
        ListReportCardsTool(),
        CreateReportCardTool(),
        DeleteReportCardTool(),
        TaskListTool(),
        TaskCreateTool(),
        TaskUpdateTool(),
        TaskDeleteTool(),
        GoalListTool(),
        GoalCreateTool(),
        GoalUpdateTool(),
        GoalDeleteTool(),
    ]
