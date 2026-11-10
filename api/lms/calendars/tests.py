import json
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.test import TestCase, tag
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from entities.models import Entity
from lms.accounts.models import Account, UserProfile
from lms.calendars.models import Goal
from lms.calendars.serializers import GoalSerializer
from sms.models import SMSMessage


@tag("fast")
class TestGoalSerializer(TestCase):
    def setUp(self):
        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = Mock(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="testuser", email="test@example.com")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567890", timezone="America/New_York")
        self.entity = Entity.objects.create(name="Test Entity", account=self.account, timezone="America/New_York")
        self.user_profile = UserProfile.objects.create(
            account=self.account, name="Test User", profile_type=UserProfile.ProfileType.STUDENT
        )

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_goal_serialization_with_sub_goals(self):
        """Test that GoalSerializer properly serializes goals with sub_goals"""
        # Create parent goal
        parent_goal = Goal.objects.create(
            title="Parent Goal",
            objective="Complete parent objective",
            start_date="2025-09-01",
            end_date="2025-09-30",
            user_profile=self.user_profile,
            status="incomplete",
        )

        # Create sub-goal
        sub_goal = Goal.objects.create(
            title="Sub Goal",
            objective="Complete sub objective",
            start_date="2025-09-01",
            end_date="2025-09-15",
            user_profile=self.user_profile,
            parent_goal=parent_goal,
            status="incomplete",
        )

        # Test serialization
        serializer = GoalSerializer(parent_goal, context={"timezone": "America/New_York"})
        data = serializer.data

        # Use DRF's JSONRenderer to handle UUIDs properly (simulates real API behavior)
        json_data = JSONRenderer().render(data)

        # Parse back to verify structure
        parsed_data = json.loads(json_data)

        # Verify parent goal data
        self.assertEqual(parsed_data["title"], "Parent Goal")
        self.assertEqual(parsed_data["status"], "incomplete")
        self.assertEqual(parsed_data["is_root_goal"], True)
        self.assertEqual(parsed_data["has_sub_goals"], True)

        # Verify sub_goals is properly serialized (this was the main issue)
        self.assertIn("sub_goals", parsed_data)
        self.assertIsInstance(parsed_data["sub_goals"], list)
        self.assertEqual(len(parsed_data["sub_goals"]), 1)

        # Verify sub-goal data
        sub_goal_data = parsed_data["sub_goals"][0]
        self.assertEqual(sub_goal_data["title"], "Sub Goal")
        self.assertEqual(sub_goal_data["status"], "incomplete")
        self.assertEqual(sub_goal_data["is_root_goal"], False)
        self.assertEqual(sub_goal_data["has_sub_goals"], False)
        self.assertEqual(sub_goal_data["sub_goals"], [])  # No sub-sub-goals

    def test_goal_serialization_without_sub_goals(self):
        """Test serialization of a goal without sub-goals"""
        goal = Goal.objects.create(
            title="Simple Goal",
            objective="Complete simple objective",
            start_date="2025-09-01",
            end_date="2025-09-30",
            user_profile=self.user_profile,
            status="complete",
        )

        serializer = GoalSerializer(goal, context={"timezone": "America/New_York"})
        data = serializer.data

        # Use DRF's JSONRenderer
        json_data = JSONRenderer().render(data)
        parsed_data = json.loads(json_data)

        # Verify goal data
        self.assertEqual(parsed_data["title"], "Simple Goal")
        self.assertEqual(parsed_data["status"], "complete")
        self.assertEqual(parsed_data["is_root_goal"], True)
        self.assertEqual(parsed_data["has_sub_goals"], False)
        self.assertEqual(parsed_data["sub_goals"], [])

    def test_nested_sub_goals_serialization(self):
        """Test serialization with nested sub-goals (sub-sub-goals)"""
        # Create parent goal
        parent_goal = Goal.objects.create(
            title="Parent Goal",
            objective="Complete parent objective",
            start_date="2025-09-01",
            end_date="2025-09-30",
            user_profile=self.user_profile,
            status="incomplete",
        )

        # Create sub-goal
        sub_goal = Goal.objects.create(
            title="Sub Goal",
            objective="Complete sub objective",
            start_date="2025-09-01",
            end_date="2025-09-15",
            user_profile=self.user_profile,
            parent_goal=parent_goal,
            status="incomplete",
        )

        # Create sub-sub-goal
        sub_sub_goal = Goal.objects.create(
            title="Sub-Sub Goal",
            objective="Complete sub-sub objective",
            start_date="2025-09-01",
            end_date="2025-09-07",
            user_profile=self.user_profile,
            parent_goal=sub_goal,
            status="complete",
        )

        # Test serialization
        serializer = GoalSerializer(parent_goal, context={"timezone": "America/New_York"})
        data = serializer.data

        # Use DRF's JSONRenderer
        json_data = JSONRenderer().render(data)
        parsed_data = json.loads(json_data)

        # Verify nested structure
        self.assertEqual(len(parsed_data["sub_goals"]), 1)
        sub_goal_data = parsed_data["sub_goals"][0]
        self.assertEqual(sub_goal_data["title"], "Sub Goal")
        self.assertEqual(sub_goal_data["has_sub_goals"], True)
        self.assertEqual(len(sub_goal_data["sub_goals"]), 1)

        # Verify sub-sub-goal
        sub_sub_goal_data = sub_goal_data["sub_goals"][0]
        self.assertEqual(sub_sub_goal_data["title"], "Sub-Sub Goal")
        self.assertEqual(sub_sub_goal_data["status"], "complete")
        self.assertEqual(sub_sub_goal_data["has_sub_goals"], False)
        self.assertEqual(sub_sub_goal_data["sub_goals"], [])


@tag("fast")
class TestGoalListToolSerialization(TestCase):
    """Test the actual GoalListTool that was failing with serialization errors"""

    def setUp(self):
        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = Mock(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="testuser", email="test@example.com")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567890", timezone="America/New_York")
        self.entity = Entity.objects.create(name="Test Entity", account=self.account, timezone="America/New_York")
        self.user_profile = UserProfile.objects.create(
            account=self.account, name="Test User", profile_type=UserProfile.ProfileType.STUDENT
        )

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_goal_list_tool_with_sub_goals(self):
        """Test the GoalListTool that was originally failing with 'RelatedManager is not JSON serializable'"""
        from entities.adapters.lms.calendar import GoalListTool

        # Create goals with the exact scenario that was failing
        goal1 = Goal.objects.create(
            title="Goal 1",
            objective="Complete first objective",
            start_date="2025-09-01",
            end_date="2025-09-30",
            user_profile=self.user_profile,
            status="incomplete",
        )

        goal2 = Goal.objects.create(
            title="Goal 2",
            objective="Complete second objective",
            start_date="2025-09-15",
            end_date="2025-10-15",
            user_profile=self.user_profile,
            status="complete",
        )

        # Create sub-goal for goal1 (this was causing the RelatedManager error)
        sub_goal = Goal.objects.create(
            title="Sub Goal",
            objective="Complete sub objective",
            start_date="2025-09-01",
            end_date="2025-09-15",
            user_profile=self.user_profile,
            parent_goal=goal1,
            status="incomplete",
        )

        # Test the tool with the exact parameters that were failing
        tool = GoalListTool()
        mock_runtime = Mock()
        mock_runtime.entity = self.entity

        parameters = {"start": "2025-09-01", "end": "2025-09-30", "status": "incomplete"}

        # This should not raise "Object of type RelatedManager is not JSON serializable"
        result = tool.execute(mock_runtime, parameters)

        # Verify the result can be JSON serialized (this was the main issue)
        json_result = JSONRenderer().render(result)
        parsed_result = json.loads(json_result)

        # Should return only incomplete goals within date range
        self.assertIsInstance(parsed_result, list)
        # Both goal1 and sub_goal are incomplete and within date range, but sub_goal is a child of goal1
        # The filter gets goals by entity, so both will be returned since they're both top-level incomplete goals
        # Actually, let me check the date ranges: goal1 (2025-09-01 to 2025-09-30) and goal2 (2025-09-15 to 2025-10-15)
        # With filter start=2025-09-01, end=2025-09-30, status=incomplete:
        # - goal1: start_date=2025-09-01 (>= 2025-09-01 ✓), end_date=2025-09-30 (<= 2025-09-30 ✓), status=incomplete ✓
        # - goal2: start_date=2025-09-15 (>= 2025-09-01 ✓), end_date=2025-10-15 (<= 2025-09-30 ✗), status=complete ✗
        # - sub_goal: start_date=2025-09-01 (>= 2025-09-01 ✓), end_date=2025-09-15 (<= 2025-09-30 ✓), status=incomplete ✓
        # So we expect 2 results: goal1 and sub_goal
        self.assertEqual(len(parsed_result), 2)  # goal1 and sub_goal both match the criteria

        # Find the parent goal (Goal 1) in the results
        goal_1_data = next((g for g in parsed_result if g["title"] == "Goal 1"), None)
        sub_goal_data = next((g for g in parsed_result if g["title"] == "Sub Goal"), None)

        self.assertIsNotNone(goal_1_data)
        self.assertIsNotNone(sub_goal_data)

        self.assertEqual(goal_1_data["status"], "incomplete")
        self.assertEqual(sub_goal_data["status"], "incomplete")

        # Verify sub_goals is properly serialized (not a RelatedManager) on the parent goal
        self.assertIn("sub_goals", goal_1_data)
        self.assertIsInstance(goal_1_data["sub_goals"], list)
        self.assertEqual(len(goal_1_data["sub_goals"]), 1)
        self.assertEqual(goal_1_data["sub_goals"][0]["title"], "Sub Goal")

    def test_goal_list_tool_all_parameters(self):
        """Test GoalListTool with various parameter combinations"""
        from entities.adapters.lms.calendar import GoalListTool

        # Create test goals
        Goal.objects.create(
            title="Early Goal",
            objective="Early objective",
            start_date="2025-08-01",
            end_date="2025-08-31",
            user_profile=self.user_profile,
            status="complete",
        )

        Goal.objects.create(
            title="September Goal",
            objective="September objective",
            start_date="2025-09-01",
            end_date="2025-09-30",
            user_profile=self.user_profile,
            status="incomplete",
        )

        Goal.objects.create(
            title="Late Goal",
            objective="Late objective",
            start_date="2025-10-01",
            end_date="2025-10-31",
            user_profile=self.user_profile,
            status="incomplete",
        )

        tool = GoalListTool()
        mock_runtime = Mock()
        mock_runtime.entity = self.entity

        # Test with no filters
        result = tool.execute(mock_runtime, {})
        self.assertEqual(len(result), 3)

        # Test with date range filter
        result = tool.execute(mock_runtime, {"start": "2025-09-01", "end": "2025-09-30"})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["title"], "September Goal")

        # Test with status filter
        result = tool.execute(mock_runtime, {"status": "complete"})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["title"], "Early Goal")

        # Test with combined filters
        result = tool.execute(mock_runtime, {"start": "2025-09-01", "end": "2025-12-31", "status": "incomplete"})
        self.assertEqual(len(result), 2)  # September Goal and Late Goal

        # All results should be JSON serializable
        for test_result in [result]:
            json_data = JSONRenderer().render(test_result)
            self.assertIsInstance(json.loads(json_data), list)


@tag("fast")
class TestTokenView(TestCase):
    """Test the TokenView endpoint that generates LiveKit room tokens"""

    def setUp(self):
        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")
        self.livekit_patcher = patch("lms.calendars.views.AccessToken")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()
        self.mock_livekit = self.livekit_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = Mock(sid="test_sid")

        # Mock LiveKit token generation
        mock_token = Mock()
        mock_token.to_jwt.return_value = "mock_jwt_token"
        self.mock_livekit.return_value = mock_token
        mock_token.with_identity.return_value = mock_token
        mock_token.with_grants.return_value = mock_token
        mock_token.with_room_config.return_value = mock_token

        # Create test database objects
        self.user = User.objects.create_user(username="testuser", email="test@example.com", password="testpass123")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567890", timezone="America/New_York")
        self.entity = Entity.objects.create(name="Test Entity", account=self.account, timezone="America/New_York")
        self.user_profile = UserProfile.objects.create(
            account=self.account, name="Test User", profile_type=UserProfile.ProfileType.STUDENT
        )

        # Create API client
        self.client = APIClient()

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()
        self.livekit_patcher.stop()

    def _get_auth_token(self):
        """Helper to generate a JWT token for the test user"""
        refresh = RefreshToken.for_user(self.user)
        return str(refresh.access_token)

    def test_token_requires_sms_verification(self):
        """Test that users cannot get a token without sending an SMS first"""
        # Get JWT token for authentication
        token = self._get_auth_token()

        # Make request with JWT and selected profile header
        response = self.client.get(
            "/api/lms/calendars/token/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_SELECTED_PROFILE_ID=str(self.user_profile.id),
        )

        # Should be forbidden
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("text message", response.data["error"].lower())

    def test_token_succeeds_after_sms_sent(self):
        """Test that users can get a token after sending an SMS"""
        # Create an inbound SMS message from the user
        SMSMessage.objects.create(
            from_number=self.account.account_phone,
            to_number="+10987654321",
            body="Test message",
            direction="inbound",
        )

        # Get JWT token for authentication
        token = self._get_auth_token()

        # Try to get a token
        response = self.client.get(
            "/api/lms/calendars/token/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_SELECTED_PROFILE_ID=str(self.user_profile.id),
        )

        # Should succeed
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertEqual(response.data["token"], "mock_jwt_token")

    def test_token_requires_inbound_sms_not_outbound(self):
        """Test that outbound SMS messages don't count for verification"""
        # Create an outbound SMS message (system sent to user)
        SMSMessage.objects.create(
            from_number="+10987654321",
            to_number=self.account.account_phone,
            body="Welcome message",
            direction="outbound",
        )

        # Get JWT token for authentication
        token = self._get_auth_token()

        # Try to get a token
        response = self.client.get(
            "/api/lms/calendars/token/",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_SELECTED_PROFILE_ID=str(self.user_profile.id),
        )

        # Should be forbidden (outbound messages don't count)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("text message", response.data["error"].lower())
