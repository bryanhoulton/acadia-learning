from lms.calendars.models import Goal, Task
from lms.calendars.serializers import GoalSerializer, TaskSerializer
from utils.timezone import parse_datetime_from_llm

from ...runtime import EntityRuntime
from .. import Tool


def _format_task(task: dict) -> str:
    """Format a single task for display."""
    task_id = str(task.get("id", "unknown"))
    title = task.get("title", "(untitled)")
    description = task.get("description", "")
    due_date = task.get("due_date", "no deadline")

    lines = [f"• {title}"]
    lines.append(f"   task_id: {task_id}")
    lines.append(f"   Due: {due_date}")
    if description:
        lines.append(f"   {description}")
    return "\n".join(lines)


def _format_goal(goal: dict) -> str:
    """Format a single goal for display."""
    goal_id = str(goal.get("id", "unknown"))
    title = goal.get("title", "(untitled)")
    objective = goal.get("objective", "")
    status = goal.get("status", "incomplete")
    start_date = goal.get("start_date", "")
    end_date = goal.get("end_date", "")
    user_profile_id = goal.get("user_profile", "")
    user_profile_name = goal.get("user_profile_name", "")

    status_icon = "✓" if status == "complete" else "○"
    lines = [f"{status_icon} {title}"]
    lines.append(f"   goal_id: {goal_id}")
    if user_profile_id:
        profile_display = user_profile_name if user_profile_name else "Unnamed"
        lines.append(f"   Profile: {profile_display} (user_profile_id: {user_profile_id})")
    if start_date or end_date:
        lines.append(f"   Period: {start_date} → {end_date}")
    if objective:
        lines.append(f"   Objective: {objective}")
    return "\n".join(lines)


class TaskListTool(Tool):
    name = "task_list"
    description = """
    List your tasks between start and end dates/times in your timezone. These are tasks that have been created by you in the past to 
    help you remember things. You are the only one who can see or change these tasks.
    
    Do not call this multiple times in a row. The data this returns is up to date. Do not loop over this tool.
    """
    parameters = {
        "start": {
            "type": "string",
            "description": "ISO datetime string in entity's timezone (optional)",
        },
        "end": {
            "type": "string",
            "description": "ISO datetime string in entity's timezone (optional)",
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        from django.db.models import Q

        entity_timezone = entity_runtime.entity.timezone

        try:
            # Parse dates with timezone handling if provided
            start = None
            end = None
            if parameters.get("start"):
                start = parse_datetime_from_llm(parameters["start"], default_timezone=entity_timezone)
            if parameters.get("end"):
                end = parse_datetime_from_llm(parameters["end"], default_timezone=entity_timezone)
        except ValueError as e:
            return {"error": str(e)}

        # Get tasks filtered by entity
        qs = Task.objects.filter(entity=entity_runtime.entity)
        # Include tasks with NULL due_date (no deadline) alongside date-filtered tasks
        if start:
            qs = qs.filter(Q(due_date__gte=start) | Q(due_date__isnull=True))
        if end:
            qs = qs.filter(Q(due_date__lte=end) | Q(due_date__isnull=True))
        qs = qs.order_by("due_date")[:100]

        # Get serialized data
        return TaskSerializer(qs, many=True, context={"timezone": entity_runtime.entity.timezone}).data

    def format_result(self, result):
        if isinstance(result, dict) and "error" in result:
            return f"Error: {result['error']}"

        if isinstance(result, list):
            if not result:
                return "No tasks found."

            lines = [f"TASKS ({len(result)} found)", "─" * 40]
            for task in result:
                lines.append(_format_task(task))
                lines.append("")
            return "\n".join(lines)

        return str(result)


class TaskCreateTool(Tool):
    name = "task_create"
    description = "Create a task with due date in your timezone. Don't create duplicate tasks - check you tasks first."
    parameters = {
        "title": {"type": "string", "description": "Task title"},
        "due_date": {
            "type": "string",
            "description": "ISO datetime for when the task is due in entity's timezone",
        },
        "description": {
            "type": ["string", "null"],
            "description": "Optional task description",
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        entity_timezone = entity_runtime.entity.timezone

        try:
            # Parse due date with timezone handling
            due_date = parse_datetime_from_llm(parameters["due_date"], default_timezone=entity_timezone)

            # Create task
            task = Task.objects.create(
                title=parameters["title"],
                description=parameters.get("description", ""),
                due_date=due_date,
                entity=entity_runtime.entity,
            )

            return TaskSerializer(task, context={"timezone": entity_timezone}).data
        except ValueError as e:
            return {"error": "Task not created. " + str(e)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            return f"Task created:\n{_format_task(result)}"
        return str(result)


class TaskUpdateTool(Tool):
    name = "task_update"
    description = "Update a task by ID. Tasks are only viewable by agents."
    parameters = {
        "task_id": {"type": "string", "description": "Task ID"},
        "title": {
            "type": ["string", "null"],
            "description": "Task title",
        },
        "description": {
            "type": ["string", "null"],
            "description": "Task description",
        },
        "due_date": {
            "type": ["string", "null"],
            "description": "ISO datetime for when the task is due in entity's timezone",
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        try:
            task = Task.objects.get(pk=parameters.get("task_id"), entity=entity_runtime.entity)

            # Update fields if provided
            if parameters.get("title") is not None:
                task.title = parameters["title"]
            if parameters.get("description") is not None:
                task.description = parameters["description"]
            if "due_date" in parameters:
                if parameters["due_date"] is None:
                    # Explicitly clear the due_date
                    task.due_date = None
                else:
                    try:
                        task.due_date = parse_datetime_from_llm(
                            parameters["due_date"], default_timezone=entity_runtime.entity.timezone
                        )
                    except ValueError as e:
                        return {"error": str(e)}

            task.save()
            return TaskSerializer(task, context={"timezone": entity_runtime.entity.timezone}).data
        except Task.DoesNotExist:
            return {"error": "Task not found"}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            return f"Task updated:\n{_format_task(result)}"
        return str(result)


class TaskDeleteTool(Tool):
    name = "task_delete"
    description = "Delete a task by ID. Tasks are only viewable by agents."
    parameters = {"task_id": {"type": "string", "description": "Task ID"}}

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        try:
            task = Task.objects.get(pk=parameters.get("task_id"), entity=entity_runtime.entity)
            task.delete()
            return {"status": "deleted"}
        except Task.DoesNotExist:
            return {"error": "Task not found"}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            if result.get("status") == "deleted":
                return "Task deleted successfully."
        return str(result)


class GoalListTool(Tool):
    name = "goal_list"
    description = """List your goals between start and end dates in your timezone."""
    parameters = {
        "start": {
            "type": "string",
            "description": "ISO date string (YYYY-MM-DD) in entity's timezone (optional)",
        },
        "end": {
            "type": "string",
            "description": "ISO date string (YYYY-MM-DD) in entity's timezone (optional)",
        },
        "status": {
            "type": "string",
            "enum": ["incomplete", "complete"],
            "description": "Filter by status: 'incomplete' or 'complete' (optional)",
        },
        "user_profile_id": {"type": ["string", "null"], "description": "The user profile associated with the goals"},
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        try:
            # Parse dates if provided
            start_date = None
            end_date = None
            if parameters.get("start"):
                from datetime import datetime

                start_date = datetime.fromisoformat(parameters["start"]).date()
            if parameters.get("end"):
                from datetime import datetime

                end_date = datetime.fromisoformat(parameters["end"]).date()
        except ValueError as e:
            return {"error": str(e)}

        user_profile_id = parameters.get("user_profile_id", None)

        # Get filtered goals
        qs = Goal.objects.all()
        if user_profile_id:
            qs = qs.filter(user_profile_id=user_profile_id)
        else:
            # Filter by user profile associated with the entity's account
            qs = qs.filter(user_profile__account=entity_runtime.entity.account)
        # Filter for goals that OVERLAP with the date range (not entirely within)
        if start_date:
            qs = qs.filter(end_date__gte=start_date)  # Goal ends on or after query start
        if end_date:
            qs = qs.filter(start_date__lte=end_date)  # Goal starts on or before query end
        if parameters.get("status"):
            qs = qs.filter(status=parameters["status"])
        qs = qs.order_by("start_date")[:100]

        # Get serialized data
        return GoalSerializer(qs, many=True, context={"timezone": entity_runtime.entity.timezone}).data

    def format_result(self, result):
        if isinstance(result, dict) and "error" in result:
            return f"Error: {result['error']}"

        if isinstance(result, list):
            if not result:
                return "No goals found."

            lines = [f"GOALS ({len(result)} found)", "─" * 40]
            for goal in result:
                lines.append(_format_goal(goal))
                lines.append("")
            return "\n".join(lines)

        return str(result)


class GoalCreateTool(Tool):
    name = "goal_create"
    description = "Create a goal with start and end dates. Don't create duplicate goals - check your goals first."
    parameters = {
        "title": {"type": "string", "description": "Goal title"},
        "start_date": {
            "type": "string",
            "description": "ISO date string (YYYY-MM-DD) for when the goal period starts",
        },
        "end_date": {
            "type": "string",
            "description": "ISO date string (YYYY-MM-DD) for when the goal period ends",
        },
        "objective": {
            "type": "string",
            "description": "The objective of the goal to be achieved",
        },
        "parent_goal_id": {
            "type": ["string", "null"],
            "description": "Optional parent goal ID for nested goals",
        },
        "user_profile_id": {
            "type": ["string", "null"],
            "description": "Optional user profile ID to associate the goal with. If not provided, uses the first profile.",
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        try:
            from datetime import datetime

            # Parse dates
            start_date = datetime.fromisoformat(parameters["start_date"]).date()
            end_date = datetime.fromisoformat(parameters["end_date"]).date()

            # Validate parent goal if provided
            parent_goal = None
            if parameters.get("parent_goal_id"):
                try:
                    parent_goal = Goal.objects.get(
                        pk=parameters["parent_goal_id"], user_profile__account=entity_runtime.entity.account
                    )
                except Goal.DoesNotExist:
                    return {"error": "Parent goal not found"}

            # Get the user profile for this entity
            from lms.accounts.models import UserProfile

            user_profile_id = parameters.get("user_profile_id")
            if user_profile_id:
                try:
                    user_profile = UserProfile.objects.get(pk=user_profile_id, account=entity_runtime.entity.account)
                except UserProfile.DoesNotExist:
                    return {"error": "User profile not found"}
            else:
                user_profile = UserProfile.objects.filter(account=entity_runtime.entity.account).first()
                if not user_profile:
                    return {"error": "No user profile found for this entity"}

            # Create goal
            goal = Goal.objects.create(
                title=parameters["title"],
                objective=parameters["objective"],
                start_date=start_date,
                end_date=end_date,
                user_profile=user_profile,
                parent_goal=parent_goal,
            )

            return GoalSerializer(goal, context={"timezone": entity_runtime.entity.timezone}).data
        except ValueError as e:
            return {"error": "Goal not created. " + str(e)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            return f"Goal created:\n{_format_goal(result)}"
        return str(result)


class GoalUpdateTool(Tool):
    name = "goal_update"
    description = "Update a goal by ID."
    parameters = {
        "goal_id": {"type": "string", "description": "Goal ID"},
        "title": {
            "type": ["string", "null"],
            "description": "Goal title",
        },
        "objective": {
            "type": ["string", "null"],
            "description": "Goal objective",
        },
        "start_date": {
            "type": ["string", "null"],
            "description": "ISO date string (YYYY-MM-DD) for when the goal period starts",
        },
        "end_date": {
            "type": ["string", "null"],
            "description": "ISO date string (YYYY-MM-DD) for when the goal period ends",
        },
        "status": {
            "type": ["string", "null"],
            "enum": ["incomplete", "complete"],
            "description": "Goal status: 'incomplete' or 'complete'",
        },
        "parent_goal_id": {
            "type": ["string", "null"],
            "description": "Parent goal ID for nested goals (use empty string to remove parent)",
        },
    }

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        try:
            goal = Goal.objects.get(pk=parameters.get("goal_id"), user_profile__account=entity_runtime.entity.account)

            # Update fields if provided
            if parameters.get("title") is not None:
                goal.title = parameters["title"]
            if parameters.get("objective") is not None:
                goal.objective = parameters["objective"]
            if parameters.get("status") is not None:
                if parameters["status"] == "complete":
                    goal.complete()
                else:
                    goal.status = parameters["status"]

            # Handle date updates
            if parameters.get("start_date") is not None:
                try:
                    from datetime import datetime

                    goal.start_date = datetime.fromisoformat(parameters["start_date"]).date()
                except ValueError as e:
                    return {"error": f"Invalid start_date format: {str(e)}"}

            if parameters.get("end_date") is not None:
                try:
                    from datetime import datetime

                    goal.end_date = datetime.fromisoformat(parameters["end_date"]).date()
                except ValueError as e:
                    return {"error": f"Invalid end_date format: {str(e)}"}

            # Handle parent goal update
            if parameters.get("parent_goal_id") is not None:
                if parameters["parent_goal_id"] == "":
                    goal.parent_goal = None
                else:
                    try:
                        parent_goal = Goal.objects.get(
                            pk=parameters["parent_goal_id"], user_profile__account=entity_runtime.entity.account
                        )
                        # Prevent circular references
                        if parent_goal.id == goal.id:
                            return {"error": "Goal cannot be its own parent"}
                        goal.parent_goal = parent_goal
                    except Goal.DoesNotExist:
                        return {"error": "Parent goal not found"}

            goal.save()
            return GoalSerializer(goal, context={"timezone": entity_runtime.entity.timezone}).data
        except Goal.DoesNotExist:
            return {"error": "Goal not found"}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            return f"Goal updated:\n{_format_goal(result)}"
        return str(result)


class GoalDeleteTool(Tool):
    name = "goal_delete"
    description = "Delete a goal by ID. This will also delete all sub-goals."
    parameters = {"goal_id": {"type": "string", "description": "Goal ID"}}

    def execute(self, entity_runtime: "EntityRuntime", parameters):
        try:
            goal = Goal.objects.get(pk=parameters.get("goal_id"), user_profile__account=entity_runtime.entity.account)
            goal.delete()
            return {"status": "deleted"}
        except Goal.DoesNotExist:
            return {"error": "Goal not found"}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            if result.get("status") == "deleted":
                return "Goal deleted successfully."
        return str(result)
