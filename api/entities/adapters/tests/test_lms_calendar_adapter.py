from datetime import UTC, datetime

from django.contrib.auth.models import User
from django.test import TestCase, tag

from entities.adapters.lms import LMSAdapter
from entities.adapters.lms.calendar import (
    GoalCreateTool,
    GoalDeleteTool,
    GoalListTool,
    GoalUpdateTool,
    TaskCreateTool,
    TaskDeleteTool,
    TaskListTool,
    TaskUpdateTool,
)
from entities.models import Entity
from lms.accounts.models import Account, UserProfile
from lms.calendars.models import Goal, Task


@tag("fast")
class TestTaskListTool(TestCase):
    def setUp(self):
        self.tool = TaskListTool()

        # Create real test data
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(
            user=self.user, account_phone="+1234567890", timezone="America/Los_Angeles"
        )
        self.entity = Entity.objects.create(name="Test Entity", timezone="America/Los_Angeles", account=self.account)

        # Create test tasks
        self.task1 = Task.objects.create(
            entity=self.entity,
            title="Complete homework",
            description="Math homework for student",
            due_date=datetime(2024, 1, 1, 18, 0, tzinfo=UTC),  # 10:00 AM PST
        )

        self.task2 = Task.objects.create(
            entity=self.entity,
            title="Review lesson plan",
            description="Review today's lesson plan",
            due_date=datetime(2024, 1, 1, 22, 0, tzinfo=UTC),  # 2:00 PM PST
        )

        self.task3 = Task.objects.create(
            entity=self.entity,
            title="Call parent",
            due_date=datetime(2024, 1, 2, 18, 0, tzinfo=UTC),  # Next day 10:00 AM PST
        )

        # Mock entity runtime
        class MockEntityRuntime:
            def __init__(self, entity):
                self.entity = entity

        self.entity_runtime = MockEntityRuntime(self.entity)

    def test_execute_success_with_date_range(self):
        # Test listing tasks within a specific date range
        parameters = {"start": "2024-01-01T09:00:00", "end": "2024-01-01T16:00:00"}

        result = self.tool.execute(self.entity_runtime, parameters)

        # Should return 2 tasks from Jan 1st
        assert len(result) == 2
        assert result[0]["title"] == "Complete homework"
        assert result[1]["title"] == "Review lesson plan"

    def test_execute_success_no_date_filter(self):
        # Test listing all tasks when no dates provided
        parameters = {}

        result = self.tool.execute(self.entity_runtime, parameters)

        # Should return all 3 tasks
        assert len(result) == 3
        task_titles = [task["title"] for task in result]
        assert "Complete homework" in task_titles
        assert "Review lesson plan" in task_titles
        assert "Call parent" in task_titles

    def test_execute_with_invalid_date_format(self):
        # Test with invalid date format
        parameters = {"start": "invalid-date-format"}

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result

    def test_execute_filters_by_entity(self):
        # Create another entity with tasks to ensure filtering works
        other_user = User.objects.create_user(username="otheruser3", password="testpass")
        other_account = Account.objects.create(
            user=other_user, account_phone="+1222222222", timezone="America/New_York"
        )
        other_entity = Entity.objects.create(name="Other Entity", timezone="America/New_York", account=other_account)
        Task.objects.create(
            entity=other_entity,
            title="Other Entity Task",
            due_date=datetime(2024, 1, 1, 12, 0, tzinfo=UTC),
        )

        parameters = {"start": "2024-01-01T00:00:00", "end": "2024-01-01T23:59:59"}

        result = self.tool.execute(self.entity_runtime, parameters)

        # Should only return tasks from our entity
        task_titles = [task["title"] for task in result]
        assert "Complete homework" in task_titles
        assert "Review lesson plan" in task_titles
        assert "Other Entity Task" not in task_titles

    def test_tool_schema(self):
        # Test that the tool has correct schema properties
        assert self.tool.name == "task_list"
        assert "start" in self.tool.parameters
        assert "end" in self.tool.parameters
        assert self.tool.parameters["start"]["type"] == "string"
        assert self.tool.parameters["end"]["type"] == "string"


@tag("fast")
class TestTaskCreateTool(TestCase):
    def setUp(self):
        self.tool = TaskCreateTool()

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(
            user=self.user, account_phone="+1234567890", timezone="America/Los_Angeles"
        )
        self.entity = Entity.objects.create(name="Test Entity", timezone="America/Los_Angeles", account=self.account)

        class MockEntityRuntime:
            def __init__(self, entity):
                self.entity = entity

        self.entity_runtime = MockEntityRuntime(self.entity)

    def test_execute_success(self):
        # Test creating a task
        parameters = {
            "title": "New Task",
            "description": "Task description",
            "due_date": "2024-01-01T15:00:00",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert result["title"] == "New Task"
        assert result["description"] == "Task description"
        assert "2024-01-01" in result["due_date"]

        # Verify task was created in database
        task = Task.objects.get(title="New Task")
        assert task.entity == self.entity

    def test_execute_with_invalid_date(self):
        # Test with invalid date format
        parameters = {
            "title": "New Task",
            "due_date": "invalid-date",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result

    def test_tool_schema(self):
        assert self.tool.name == "task_create"
        assert "title" in self.tool.parameters
        assert "due_date" in self.tool.parameters
        assert "description" in self.tool.parameters


@tag("fast")
class TestTaskUpdateTool(TestCase):
    def setUp(self):
        self.tool = TaskUpdateTool()

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(
            user=self.user, account_phone="+1234567890", timezone="America/Los_Angeles"
        )
        self.entity = Entity.objects.create(name="Test Entity", timezone="America/Los_Angeles", account=self.account)

        self.task = Task.objects.create(
            entity=self.entity,
            title="Original Title",
            description="Original description",
            due_date=datetime(2024, 1, 1, 18, 0, tzinfo=UTC),
        )

        class MockEntityRuntime:
            def __init__(self, entity):
                self.entity = entity

        self.entity_runtime = MockEntityRuntime(self.entity)

    def test_execute_success_update_title(self):
        # Test updating task title
        parameters = {
            "task_id": str(self.task.id),
            "title": "Updated Title",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert result["title"] == "Updated Title"

        # Verify in database
        self.task.refresh_from_db()
        assert self.task.title == "Updated Title"

    def test_execute_success_update_due_date(self):
        # Test updating due date
        parameters = {
            "task_id": str(self.task.id),
            "due_date": "2024-01-02T15:00:00",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert "2024-01-02" in result["due_date"]

    def test_execute_success_clear_due_date(self):
        # Test clearing due_date by setting it to null
        parameters = {
            "task_id": str(self.task.id),
            "due_date": None,
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert result["due_date"] is None
        assert result["is_overdue"] is False

        # Verify in database
        self.task.refresh_from_db()
        assert self.task.due_date is None

    def test_execute_with_nonexistent_task(self):
        # Test with non-existent task ID
        parameters = {
            "task_id": "00000000-0000-0000-0000-000000000000",
            "title": "Updated Title",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result
        assert "not found" in result["error"]

    def test_tool_schema(self):
        assert self.tool.name == "task_update"
        assert "task_id" in self.tool.parameters
        assert "title" in self.tool.parameters
        assert "description" in self.tool.parameters
        assert "due_date" in self.tool.parameters


@tag("fast")
class TestTaskDeleteTool(TestCase):
    def setUp(self):
        self.tool = TaskDeleteTool()

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(
            user=self.user, account_phone="+1234567890", timezone="America/Los_Angeles"
        )
        self.entity = Entity.objects.create(name="Test Entity", timezone="America/Los_Angeles", account=self.account)

        self.task = Task.objects.create(
            entity=self.entity,
            title="Task to Delete",
            due_date=datetime(2024, 1, 1, 18, 0, tzinfo=UTC),
        )

        class MockEntityRuntime:
            def __init__(self, entity):
                self.entity = entity

        self.entity_runtime = MockEntityRuntime(self.entity)

    def test_execute_success(self):
        # Test deleting a task
        parameters = {"task_id": str(self.task.id)}

        result = self.tool.execute(self.entity_runtime, parameters)

        assert result["status"] == "deleted"

        # Verify task was deleted from database
        assert not Task.objects.filter(id=self.task.id).exists()

    def test_execute_with_nonexistent_task(self):
        # Test with non-existent task ID
        parameters = {"task_id": "00000000-0000-0000-0000-000000000000"}

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result
        assert "not found" in result["error"]

    def test_tool_schema(self):
        assert self.tool.name == "task_delete"
        assert "task_id" in self.tool.parameters


@tag("fast")
class TestGoalListTool(TestCase):
    def setUp(self):
        self.tool = GoalListTool()

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(
            user=self.user, account_phone="+1234567890", timezone="America/Los_Angeles"
        )
        self.entity = Entity.objects.create(name="Test Entity", timezone="America/Los_Angeles", account=self.account)
        self.user_profile = UserProfile.objects.create(
            account=self.account, name="Test User", profile_type=UserProfile.ProfileType.STUDENT
        )

        # Create test goals
        self.goal1 = Goal.objects.create(
            user_profile=self.user_profile,
            title="Learn Python",
            objective="Master Python programming",
            start_date=datetime(2024, 1, 1).date(),
            end_date=datetime(2024, 3, 31).date(),
            status=Goal.GoalStatus.INCOMPLETE,
        )

        self.goal2 = Goal.objects.create(
            user_profile=self.user_profile,
            title="Complete Math Course",
            objective="Finish all math assignments",
            start_date=datetime(2024, 2, 1).date(),
            end_date=datetime(2024, 4, 30).date(),
            status=Goal.GoalStatus.COMPLETE,
        )

        self.goal3 = Goal.objects.create(
            user_profile=self.user_profile,
            title="Read 10 Books",
            objective="Read 10 books for personal development",
            start_date=datetime(2024, 6, 1).date(),
            end_date=datetime(2024, 12, 31).date(),
            status=Goal.GoalStatus.INCOMPLETE,
        )

        class MockEntityRuntime:
            def __init__(self, entity):
                self.entity = entity

        self.entity_runtime = MockEntityRuntime(self.entity)

    def test_execute_success_with_date_range(self):
        # Test listing goals within a specific date range
        parameters = {"start": "2024-01-01", "end": "2024-04-30"}

        result = self.tool.execute(self.entity_runtime, parameters)

        # Should return 2 goals that overlap with the range
        assert len(result) == 2
        goal_titles = [goal["title"] for goal in result]
        assert "Learn Python" in goal_titles
        assert "Complete Math Course" in goal_titles
        assert "Read 10 Books" not in goal_titles

    def test_execute_finds_goals_spanning_query_date(self):
        # Test that goals spanning across the query date are found
        # This was a bug where querying for "today" wouldn't find goals
        # that started before and ended after today
        # e.g. Goal: Jan 1 - Mar 31, Query: Feb 15 -> should find the goal

        # Query for a date in the middle of goal1's range
        # goal1 runs from Jan 1 to Mar 31
        parameters = {"start": "2024-02-15", "end": "2024-02-15"}

        result = self.tool.execute(self.entity_runtime, parameters)

        # Should find goal1 (Jan 1 - Mar 31) and goal2 (Feb 1 - Apr 30)
        # because they both span Feb 15
        assert len(result) == 2
        goal_titles = [goal["title"] for goal in result]
        assert "Learn Python" in goal_titles  # Jan 1 - Mar 31, spans Feb 15
        assert "Complete Math Course" in goal_titles  # Feb 1 - Apr 30, spans Feb 15
        assert "Read 10 Books" not in goal_titles  # Jun 1 - Dec 31, doesn't span Feb 15

    def test_execute_success_with_status_filter(self):
        # Test filtering by status
        parameters = {"status": "complete"}

        result = self.tool.execute(self.entity_runtime, parameters)

        # Should return only completed goals
        assert len(result) == 1
        assert result[0]["title"] == "Complete Math Course"
        assert result[0]["status"] == "complete"

    def test_execute_success_no_filters(self):
        # Test listing all goals when no filters provided
        parameters = {}

        result = self.tool.execute(self.entity_runtime, parameters)

        # Should return all 3 goals
        assert len(result) == 3

    def test_execute_with_invalid_date_format(self):
        # Test with invalid date format
        parameters = {"start": "invalid-date-format"}

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result

    def test_execute_filters_by_entity(self):
        # Create another entity with goals
        other_user = User.objects.create_user(username="otheruser2", password="testpass")
        other_account = Account.objects.create(
            user=other_user, account_phone="+1111111111", timezone="America/New_York"
        )
        other_entity = Entity.objects.create(name="Other Entity", timezone="America/New_York", account=other_account)
        other_user_profile = UserProfile.objects.create(
            account=other_account, name="Other User", profile_type=UserProfile.ProfileType.STUDENT
        )
        Goal.objects.create(
            user_profile=other_user_profile,
            title="Other Entity Goal",
            objective="Other entity objective",
            start_date=datetime(2024, 1, 1).date(),
            end_date=datetime(2024, 3, 31).date(),
        )

        parameters = {}

        result = self.tool.execute(self.entity_runtime, parameters)

        # Should only return goals from our entity
        goal_titles = [goal["title"] for goal in result]
        assert "Learn Python" in goal_titles
        assert "Other Entity Goal" not in goal_titles

    def test_tool_schema(self):
        assert self.tool.name == "goal_list"
        assert "start" in self.tool.parameters
        assert "end" in self.tool.parameters
        assert "status" in self.tool.parameters


@tag("fast")
class TestGoalCreateTool(TestCase):
    def setUp(self):
        self.tool = GoalCreateTool()

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(
            user=self.user, account_phone="+1234567890", timezone="America/Los_Angeles"
        )
        self.entity = Entity.objects.create(name="Test Entity", timezone="America/Los_Angeles", account=self.account)
        self.user_profile = UserProfile.objects.create(
            account=self.account, name="Test User", profile_type=UserProfile.ProfileType.STUDENT
        )

        class MockEntityRuntime:
            def __init__(self, entity):
                self.entity = entity

        self.entity_runtime = MockEntityRuntime(self.entity)

    def test_execute_success(self):
        # Test creating a goal
        parameters = {
            "title": "New Goal",
            "objective": "Goal objective",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert result["title"] == "New Goal"
        assert result["objective"] == "Goal objective"
        assert result["start_date"] == "2024-01-01"
        assert result["end_date"] == "2024-03-31"
        assert result["status"] == "incomplete"

        # Verify goal was created in database
        goal = Goal.objects.get(title="New Goal")
        assert goal.user_profile == self.user_profile

    def test_execute_success_with_parent_goal(self):
        # Create a parent goal first
        parent_goal = Goal.objects.create(
            user_profile=self.user_profile,
            title="Parent Goal",
            objective="Parent goal objective",
            start_date=datetime(2024, 1, 1).date(),
            end_date=datetime(2024, 12, 31).date(),
        )

        parameters = {
            "title": "Sub Goal",
            "objective": "Sub goal objective",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
            "parent_goal_id": str(parent_goal.id),
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert result["title"] == "Sub Goal"

        # Verify parent relationship
        goal = Goal.objects.get(title="Sub Goal")
        assert goal.parent_goal == parent_goal

    def test_execute_with_invalid_parent_goal(self):
        # Test with non-existent parent goal
        parameters = {
            "title": "Sub Goal",
            "objective": "Sub goal objective",
            "start_date": "2024-01-01",
            "end_date": "2024-03-31",
            "parent_goal_id": "00000000-0000-0000-0000-000000000000",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result
        assert "Parent goal not found" in result["error"]

    def test_execute_with_invalid_date(self):
        # Test with invalid date format
        parameters = {
            "title": "New Goal",
            "objective": "New goal objective",
            "start_date": "invalid-date",
            "end_date": "2024-03-31",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result

    def test_tool_schema(self):
        assert self.tool.name == "goal_create"
        assert "title" in self.tool.parameters
        assert "start_date" in self.tool.parameters
        assert "end_date" in self.tool.parameters
        assert "parent_goal_id" in self.tool.parameters


@tag("fast")
class TestGoalUpdateTool(TestCase):
    def setUp(self):
        self.tool = GoalUpdateTool()

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(
            user=self.user, account_phone="+1234567890", timezone="America/Los_Angeles"
        )
        self.entity = Entity.objects.create(name="Test Entity", timezone="America/Los_Angeles", account=self.account)
        self.user_profile = UserProfile.objects.create(
            account=self.account, name="Test User", profile_type=UserProfile.ProfileType.STUDENT
        )

        self.goal = Goal.objects.create(
            user_profile=self.user_profile,
            title="Original Goal",
            objective="Original objective",
            start_date=datetime(2024, 1, 1).date(),
            end_date=datetime(2024, 3, 31).date(),
            status=Goal.GoalStatus.INCOMPLETE,
        )

        class MockEntityRuntime:
            def __init__(self, entity):
                self.entity = entity

        self.entity_runtime = MockEntityRuntime(self.entity)

    def test_execute_success_update_title(self):
        # Test updating goal title
        parameters = {
            "goal_id": str(self.goal.id),
            "title": "Updated Goal Title",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert result["title"] == "Updated Goal Title"

        # Verify in database
        self.goal.refresh_from_db()
        assert self.goal.title == "Updated Goal Title"

    def test_execute_success_update_status(self):
        # Test updating status
        parameters = {
            "goal_id": str(self.goal.id),
            "status": "complete",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert result["status"] == "complete"

        # Verify in database
        self.goal.refresh_from_db()
        assert self.goal.status == Goal.GoalStatus.COMPLETE

    def test_execute_success_update_dates(self):
        # Test updating dates
        parameters = {
            "goal_id": str(self.goal.id),
            "start_date": "2024-02-01",
            "end_date": "2024-04-30",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result
        assert result["start_date"] == "2024-02-01"
        assert result["end_date"] == "2024-04-30"

    def test_execute_success_update_parent_goal(self):
        # Create a parent goal
        parent_goal = Goal.objects.create(
            user_profile=self.user_profile,
            title="Parent Goal",
            objective="Parent goal objective",
            start_date=datetime(2024, 1, 1).date(),
            end_date=datetime(2024, 12, 31).date(),
        )

        parameters = {
            "goal_id": str(self.goal.id),
            "parent_goal_id": str(parent_goal.id),
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result

        # Verify parent relationship
        self.goal.refresh_from_db()
        assert self.goal.parent_goal == parent_goal

    def test_execute_success_remove_parent_goal(self):
        # First set a parent goal
        parent_goal = Goal.objects.create(
            user_profile=self.user_profile,
            title="Parent Goal",
            objective="Parent goal objective",
            start_date=datetime(2024, 1, 1).date(),
            end_date=datetime(2024, 12, 31).date(),
        )
        self.goal.parent_goal = parent_goal
        self.goal.save()

        # Now remove the parent
        parameters = {
            "goal_id": str(self.goal.id),
            "parent_goal_id": "",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" not in result

        # Verify parent was removed
        self.goal.refresh_from_db()
        assert self.goal.parent_goal is None

    def test_execute_with_circular_reference(self):
        # Test preventing circular reference (goal as its own parent)
        parameters = {
            "goal_id": str(self.goal.id),
            "parent_goal_id": str(self.goal.id),
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result
        assert "cannot be its own parent" in result["error"]

    def test_execute_with_nonexistent_goal(self):
        # Test with non-existent goal ID
        parameters = {
            "goal_id": "00000000-0000-0000-0000-000000000000",
            "title": "Updated Title",
        }

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result
        assert "not found" in result["error"]

    def test_tool_schema(self):
        assert self.tool.name == "goal_update"
        assert "goal_id" in self.tool.parameters
        assert "title" in self.tool.parameters
        assert "status" in self.tool.parameters
        assert "parent_goal_id" in self.tool.parameters


@tag("fast")
class TestGoalDeleteTool(TestCase):
    def setUp(self):
        self.tool = GoalDeleteTool()

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(
            user=self.user, account_phone="+1234567890", timezone="America/Los_Angeles"
        )
        self.entity = Entity.objects.create(name="Test Entity", timezone="America/Los_Angeles", account=self.account)
        self.user_profile = UserProfile.objects.create(
            account=self.account, name="Test User", profile_type=UserProfile.ProfileType.STUDENT
        )

        self.parent_goal = Goal.objects.create(
            user_profile=self.user_profile,
            title="Parent Goal",
            start_date=datetime(2024, 1, 1).date(),
            end_date=datetime(2024, 12, 31).date(),
        )

        self.sub_goal = Goal.objects.create(
            user_profile=self.user_profile,
            title="Sub Goal",
            start_date=datetime(2024, 1, 1).date(),
            end_date=datetime(2024, 3, 31).date(),
            parent_goal=self.parent_goal,
        )

        class MockEntityRuntime:
            def __init__(self, entity):
                self.entity = entity

        self.entity_runtime = MockEntityRuntime(self.entity)

    def test_execute_success_delete_parent_cascades(self):
        # Test deleting parent goal cascades to sub-goals
        parameters = {"goal_id": str(self.parent_goal.id)}

        result = self.tool.execute(self.entity_runtime, parameters)

        assert result["status"] == "deleted"

        # Verify both parent and sub-goal were deleted (cascade)
        assert not Goal.objects.filter(id=self.parent_goal.id).exists()
        assert not Goal.objects.filter(id=self.sub_goal.id).exists()

    def test_execute_success_delete_sub_goal(self):
        # Test deleting just a sub-goal
        parameters = {"goal_id": str(self.sub_goal.id)}

        result = self.tool.execute(self.entity_runtime, parameters)

        assert result["status"] == "deleted"

        # Verify sub-goal was deleted but parent remains
        assert not Goal.objects.filter(id=self.sub_goal.id).exists()
        assert Goal.objects.filter(id=self.parent_goal.id).exists()

    def test_execute_with_nonexistent_goal(self):
        # Test with non-existent goal ID
        parameters = {"goal_id": "00000000-0000-0000-0000-000000000000"}

        result = self.tool.execute(self.entity_runtime, parameters)

        assert "error" in result
        assert "not found" in result["error"]

    def test_tool_schema(self):
        assert self.tool.name == "goal_delete"
        assert "goal_id" in self.tool.parameters


@tag("fast")
class TestLMSAdapterIntegration(TestCase):
    def setUp(self):
        self.adapter = LMSAdapter()

    def test_adapter_contains_all_calendar_tools(self):
        # Test that the LMS adapter contains all calendar tools
        tool_names = [tool.name for tool in self.adapter.tools]

        # Task tools
        assert "task_list" in tool_names
        assert "task_create" in tool_names
        assert "task_update" in tool_names
        assert "task_delete" in tool_names

        # Goal tools
        assert "goal_list" in tool_names
        assert "goal_create" in tool_names
        assert "goal_update" in tool_names
        assert "goal_delete" in tool_names

    def test_adapter_tool_instances(self):
        # Test that the tools are properly instantiated
        tool_classes = [type(tool) for tool in self.adapter.tools]

        assert TaskListTool in tool_classes
        assert TaskCreateTool in tool_classes
        assert TaskUpdateTool in tool_classes
        assert TaskDeleteTool in tool_classes
        assert GoalListTool in tool_classes
        assert GoalCreateTool in tool_classes
        assert GoalUpdateTool in tool_classes
        assert GoalDeleteTool in tool_classes

    def test_adapter_properties(self):
        # Test adapter basic properties
        assert self.adapter.name == "LMS"
        assert "learning management system" in self.adapter.description.lower()
        assert "goals allow you to plan" in self.adapter.description.lower()
        assert len(self.adapter.tools) >= 12  # At least all the calendar tools plus others
