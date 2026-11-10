import uuid
from dataclasses import dataclass
from datetime import date
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, tag

from entities.adapters.lms.accounts import (
    CreateReportCardTool,
    CreateUserProfileTool,
    DeleteReportCardTool,
    DeleteUserProfileTool,
    ListReportCardsTool,
    ShowAccountTool,
)
from entities.models import Entity
from lms.accounts.models import Account, ReportCard, UserProfile


@tag("fast")
class TestShowAccountTool(TestCase):
    @dataclass
    class Runtime:
        entity: Entity

    @dataclass
    class TwilioMessage:
        sid: str

    def setUp(self):
        self.tool = ShowAccountTool()

        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = self.TwilioMessage(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="testuser")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+1234567890",
            timezone="America/New_York",
            tutor_name="Test Tutor",
            zip_code="12345",
        )
        self.entity = Entity.objects.create(name="Test Entity", account=self.account, timezone="America/New_York")

        # Create user profiles
        self.parent_profile = UserProfile.objects.create(
            name="Parent Name",
            profile_type=UserProfile.ProfileType.PARENT,
            email="parent@example.com",
            phone="+1234567890",
            account=self.account,
        )

        self.student_profile = UserProfile.objects.create(
            name="Student Name",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="student@example.com",
            phone="+1987654321",
            account=self.account,
        )

        # Create mock entity runtime
        self.mock_entity_runtime = self.Runtime(entity=self.entity)

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_success_with_account(self):
        """Test successful execution when entity has an account."""
        result = self.tool.execute(self.mock_entity_runtime, {})

        # Verify the result contains account data
        self.assertIsInstance(result, dict)
        self.assertIn("id", result)
        self.assertIn("account_phone", result)
        self.assertIn("timezone", result)
        self.assertIn("tutor_name", result)
        self.assertIn("zip_code", result)

        # Verify the actual values
        self.assertEqual(result["account_phone"], "+1234567890")
        self.assertEqual(result["timezone"], "America/New_York")
        self.assertEqual(result["tutor_name"], "Test Tutor")
        self.assertEqual(result["zip_code"], "12345")

    def test_execute_no_account(self):
        """Test execution when entity has no account."""

        # Create a mock entity with no account
        @dataclass
        class NoAccountEntity:
            account: Account | None = None

        mock_runtime_no_account = self.Runtime(entity=NoAccountEntity())

        result = self.tool.execute(mock_runtime_no_account, {})

        self.assertEqual(result, "No LMS account is attached to you.")

    def test_tool_schema(self):
        """Test that the tool has correct schema properties."""
        self.assertEqual(self.tool.name, "show_account")
        self.assertEqual(self.tool.parameters, {})

    def test_serializer_includes_related_data(self):
        """Test that the serializer includes all expected account data."""
        result = self.tool.execute(self.mock_entity_runtime, {})

        # Check that basic account fields are present
        expected_fields = [
            "id",
            "account_phone",
            "timezone",
            "tutor_name",
            "zip_code",
            "is_active",
            "is_admin",
            "created_at",
            "updated_at",
            "referral_link",
        ]

        for field in expected_fields:
            self.assertIn(field, result, f"Field {field} missing from serialized account data")

        # Check that referral_code is NOT included (should show referral_link instead)
        self.assertNotIn("referral_code", result, "referral_code should not be in serialized data")

    def test_parent_profiles_are_listed_first(self):
        """Parent profiles should be serialized before other profiles."""

        self.parent_profile.name = "Zeta Parent"
        self.parent_profile.save(update_fields=["name"])
        self.student_profile.name = "Alpha Student"
        self.student_profile.save(update_fields=["name"])

        # Additional student to ensure ordering logic is enforced
        UserProfile.objects.create(
            name="Beta Student",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="beta.student@example.com",
            phone="+15555550100",
            account=self.account,
        )

        result = self.tool.execute(self.mock_entity_runtime, {})
        profiles = result["profiles"]

        self.assertGreaterEqual(len(profiles), 2)
        seen_student = False
        for profile in profiles:
            if profile["profile_type"] == UserProfile.ProfileType.STUDENT:
                seen_student = True
            if profile["profile_type"] == UserProfile.ProfileType.PARENT:
                self.assertFalse(seen_student, "Parent profile appeared after a student profile")

    def test_account_with_minimal_data(self):
        """Test account serialization with minimal required data."""
        # Create account with minimal data
        minimal_user = User.objects.create_user(username="minimal")
        minimal_account = Account.objects.create(
            user=minimal_user,
            account_phone="+1111111111",
            # No timezone, zip_code, etc.
        )
        minimal_entity = Entity.objects.create(name="Minimal Entity", account=minimal_account)

        mock_minimal_runtime = self.Runtime(entity=minimal_entity)

        result = self.tool.execute(mock_minimal_runtime, {})

        # Should still return valid serialized data
        self.assertIsInstance(result, dict)
        self.assertEqual(result["account_phone"], "+1111111111")
        self.assertIn("id", result)

        # Optional fields should be present but may be None/default
        self.assertIn("timezone", result)
        self.assertIn("zip_code", result)


@tag("fast")
class TestCreateReportCardTool(TestCase):
    @dataclass
    class Runtime:
        entity: Entity

    @dataclass
    class TwilioMessage:
        sid: str

    def setUp(self):
        self.tool = CreateReportCardTool()

        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        self.mock_twilio.messages.create.return_value = self.TwilioMessage(sid="test_sid")

        self.user = User.objects.create_user(username="reportcarduser")
        self.account = Account.objects.create(user=self.user, account_phone="+12223334444")
        self.entity = Entity.objects.create(name="Report Card Entity", account=self.account)

        self.student_profile = UserProfile.objects.create(
            name="Student Report",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="student.report@example.com",
            phone="+12223334445",
            account=self.account,
        )

        self.mock_runtime = self.Runtime(entity=self.entity)

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def _valid_parameters(self) -> dict:
        return {
            "user_profile_id": str(self.student_profile.id),
            "session_date": date.today().isoformat(),
            "session_duration_minutes": 60,
            "immediate_action_items": [
                {
                    "title": "Practice Fractions",
                    "description": "Review adding fractions with unlike denominators",
                    "priority": "high",
                }
            ],
            "skill_assessments": [
                {
                    "skill_name": "Fractions",
                    "skill_description": "Adding fractions",
                    "skill_level": "learning",
                }
            ],
            "recommended_course_name": "Fractions Mastery",
            "recommended_course_description": "A focused course on mastering fractions",
            "recommended_course_duration_weeks": 6,
            "recommended_course_objectives": [
                {
                    "title": "Fractions Week 1",
                    "description": "Understand numerators and denominators",
                    "week_number": 1,
                }
            ],
            "tutor_notes": "Student showed improvement this week.",
        }

    def test_execute_creates_report_card(self):
        parameters = self._valid_parameters()

        result = self.tool.execute(self.mock_runtime, parameters)

        self.assertEqual(ReportCard.objects.count(), 1)
        report_card = ReportCard.objects.get()

        self.assertEqual(report_card.user_profile, self.student_profile)
        self.assertEqual(report_card.session_duration_minutes, 60)
        self.assertEqual(report_card.recommended_course_name, "Fractions Mastery")
        self.assertEqual(report_card.immediate_action_items[0]["priority"], "high")

        self.assertIsInstance(result, dict)
        self.assertEqual(str(result["user_profile"]), str(self.student_profile.id))
        self.assertEqual(len(result["immediate_action_items"]), 1)
        self.assertEqual(result["immediate_action_items"][0]["title"], "Practice Fractions")
        self.assertEqual(result["skill_assessments"][0]["skill_level"], "learning")

    def test_execute_with_unknown_profile(self):
        parameters = self._valid_parameters()
        parameters["user_profile_id"] = str(uuid.uuid4())

        with self.assertRaises(UserProfile.DoesNotExist):
            self.tool.execute(self.mock_runtime, parameters)

        self.assertEqual(ReportCard.objects.count(), 0)


@tag("fast")
class TestListReportCardsTool(TestCase):
    @dataclass
    class Runtime:
        entity: Entity

    @dataclass
    class TwilioMessage:
        sid: str

    def setUp(self):
        self.tool = ListReportCardsTool()

        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        self.mock_twilio.messages.create.return_value = self.TwilioMessage(sid="test_sid")

        self.user = User.objects.create_user(username="listreportcards")
        self.account = Account.objects.create(user=self.user, account_phone="+13334445555")
        self.entity = Entity.objects.create(name="List Report Card Entity", account=self.account)

        self.student_profile = UserProfile.objects.create(
            name="Student One",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="student.one@example.com",
            phone="+13334445556",
            account=self.account,
        )

        self.other_student_profile = UserProfile.objects.create(
            name="Student Two",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="student.two@example.com",
            phone="+13334445557",
            account=self.account,
        )

        other_account_user = User.objects.create_user(username="otheraccount")
        other_account = Account.objects.create(user=other_account_user, account_phone="+19998887777")
        other_profile = UserProfile.objects.create(
            name="Other Account Student",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="other.student@example.com",
            phone="+19998887778",
            account=other_account,
        )

        self.report_card_one = ReportCard.objects.create(
            user_profile=self.student_profile,
            session_date=date(2024, 1, 1),
            session_duration_minutes=45,
            immediate_action_items=[
                {
                    "title": "Review Reading",
                    "description": "Practice reading comprehension",
                    "priority": "medium",
                }
            ],
            skill_assessments=[
                {
                    "skill_name": "Reading",
                    "skill_description": "Comprehension",
                    "skill_level": "reinforcing",
                }
            ],
            recommended_course_name="Reading Booster",
            recommended_course_duration_weeks=8,
            recommended_course_description="Improve reading skills",
            recommended_course_objectives=[
                {
                    "title": "Reading Week 1",
                    "description": "Identify main ideas",
                    "week_number": 1,
                }
            ],
            tutor_notes="Great participation.",
        )

        self.report_card_two = ReportCard.objects.create(
            user_profile=self.other_student_profile,
            session_date=date(2024, 1, 8),
            session_duration_minutes=50,
            immediate_action_items=[
                {
                    "title": "Practice Multiplication",
                    "description": "Focus on times tables",
                    "priority": "high",
                }
            ],
            skill_assessments=[
                {
                    "skill_name": "Multiplication",
                    "skill_description": "Times tables",
                    "skill_level": "learning",
                }
            ],
            recommended_course_name="Math Fundamentals",
            recommended_course_duration_weeks=10,
            recommended_course_description="Strengthen math basics",
            recommended_course_objectives=[
                {
                    "title": "Math Week 1",
                    "description": "Understand multiplication",
                    "week_number": 1,
                }
            ],
            tutor_notes="Needs more practice.",
        )

        ReportCard.objects.create(
            user_profile=other_profile,
            session_date=date(2024, 2, 1),
            session_duration_minutes=40,
            immediate_action_items=[{"title": "Practice", "description": "General practice", "priority": "low"}],
            skill_assessments=[
                {
                    "skill_name": "General",
                    "skill_description": "Overview",
                    "skill_level": "automatic",
                }
            ],
            recommended_course_name="General Skills",
            recommended_course_duration_weeks=4,
            recommended_course_description="Course for other account",
            recommended_course_objectives=[
                {
                    "title": "General Week 1",
                    "description": "Overview",
                    "week_number": 1,
                }
            ],
            tutor_notes="Other account notes.",
        )

        self.mock_runtime = self.Runtime(entity=self.entity)

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_lists_report_cards_for_account(self):
        parameters = {"user_profile_id": None}

        result = self.tool.execute(self.mock_runtime, parameters)

        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 2)
        returned_ids = {str(item["id"]) for item in result}
        self.assertSetEqual(
            returned_ids,
            {str(self.report_card_one.id), str(self.report_card_two.id)},
        )

    def test_execute_filters_by_user_profile(self):
        parameters = {"user_profile_id": str(self.student_profile.id)}

        result = self.tool.execute(self.mock_runtime, parameters)

        self.assertEqual(len(result), 1)
        self.assertEqual(str(result[0]["id"]), str(self.report_card_one.id))
        self.assertEqual(str(result[0]["user_profile"]), str(self.student_profile.id))


@tag("fast")
class TestDeleteReportCardTool(TestCase):
    @dataclass
    class Runtime:
        entity: Entity

    @dataclass
    class TwilioMessage:
        sid: str

    def setUp(self):
        self.tool = DeleteReportCardTool()

        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        self.mock_twilio.messages.create.return_value = self.TwilioMessage(sid="test_sid")

        self.user = User.objects.create_user(username="deletereportcard")
        self.account = Account.objects.create(user=self.user, account_phone="+14445556666")
        self.entity = Entity.objects.create(name="Delete Report Card Entity", account=self.account)

        self.student_profile = UserProfile.objects.create(
            name="Delete Student",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="delete.student@example.com",
            phone="+14445556667",
            account=self.account,
        )

        self.report_card = ReportCard.objects.create(
            user_profile=self.student_profile,
            session_date=date(2024, 3, 1),
            session_duration_minutes=55,
            immediate_action_items=[
                {
                    "title": "Practice Writing",
                    "description": "Focus on essay structure",
                    "priority": "medium",
                }
            ],
            skill_assessments=[
                {
                    "skill_name": "Writing",
                    "skill_description": "Essay structure",
                    "skill_level": "learning",
                }
            ],
            recommended_course_name="Writing Workshop",
            recommended_course_duration_weeks=5,
            recommended_course_description="Improve essay writing",
            recommended_course_objectives=[
                {
                    "title": "Writing Week 1",
                    "description": "Plan essays",
                    "week_number": 1,
                }
            ],
            tutor_notes="Continue practicing.",
        )

        self.mock_runtime = self.Runtime(entity=self.entity)

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_deletes_report_card(self):
        parameters = {"report_card_id": str(self.report_card.id)}

        result = self.tool.execute(self.mock_runtime, parameters)

        self.assertIsNone(result)
        self.assertFalse(ReportCard.objects.filter(id=self.report_card.id).exists())

    def test_execute_with_unknown_report_card(self):
        parameters = {"report_card_id": str(uuid.uuid4())}

        with self.assertRaises(ReportCard.DoesNotExist):
            self.tool.execute(self.mock_runtime, parameters)


@tag("fast")
class TestCreateUserProfileTool(TestCase):
    @dataclass
    class Runtime:
        entity: Entity

    @dataclass
    class TwilioMessage:
        sid: str

    def setUp(self):
        self.tool = CreateUserProfileTool()

        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = self.TwilioMessage(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="createprofileuser")
        self.account = Account.objects.create(user=self.user, account_phone="+15556667777")
        self.entity = Entity.objects.create(name="Create Profile Entity", account=self.account)

        self.mock_runtime = self.Runtime(entity=self.entity)

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_creates_student_profile(self):
        """Test creating a student profile."""
        initial_count = UserProfile.objects.filter(account=self.account).count()

        parameters = {
            "profile_type": "student",
            "name": "Test Student",
        }

        result = self.tool.execute(self.mock_runtime, parameters)

        # Verify profile was created
        self.assertEqual(UserProfile.objects.filter(account=self.account).count(), initial_count + 1)

        # Verify returned data
        self.assertIsInstance(result, dict)
        self.assertEqual(result["name"], "Test Student")
        self.assertEqual(result["profile_type"], "student")
        self.assertIn("id", result)

        # Verify profile exists in database
        profile = UserProfile.objects.get(id=result["id"])
        self.assertEqual(profile.name, "Test Student")
        self.assertEqual(profile.profile_type, "student")
        self.assertEqual(profile.account, self.account)

    def test_execute_creates_parent_profile(self):
        """Test creating a parent profile."""
        parameters = {
            "profile_type": "parent",
            "name": "Test Parent",
        }

        result = self.tool.execute(self.mock_runtime, parameters)

        # Verify returned data
        self.assertIsInstance(result, dict)
        self.assertEqual(result["name"], "Test Parent")
        self.assertEqual(result["profile_type"], "parent")

        # Verify profile exists in database
        profile = UserProfile.objects.get(id=result["id"])
        self.assertEqual(profile.profile_type, "parent")

    def test_execute_multiple_profiles(self):
        """Test creating multiple profiles for the same account."""
        # Create first profile
        parameters_1 = {
            "profile_type": "parent",
            "name": "Parent One",
        }
        result_1 = self.tool.execute(self.mock_runtime, parameters_1)

        # Create second profile
        parameters_2 = {
            "profile_type": "student",
            "name": "Student One",
        }
        result_2 = self.tool.execute(self.mock_runtime, parameters_2)

        # Verify both profiles exist
        self.assertNotEqual(result_1["id"], result_2["id"])
        self.assertEqual(UserProfile.objects.filter(account=self.account).count(), 2)

        # Verify both profiles are associated with the correct account
        profile_1 = UserProfile.objects.get(id=result_1["id"])
        profile_2 = UserProfile.objects.get(id=result_2["id"])
        self.assertEqual(profile_1.account, self.account)
        self.assertEqual(profile_2.account, self.account)

    def test_tool_schema(self):
        """Test that the tool has correct schema properties."""
        self.assertEqual(self.tool.name, "create_user_profile")
        self.assertIn("profile_type", self.tool.parameters)
        self.assertIn("name", self.tool.parameters)


@tag("fast")
class TestDeleteUserProfileTool(TestCase):
    @dataclass
    class Runtime:
        entity: Entity

    @dataclass
    class TwilioMessage:
        sid: str

    def setUp(self):
        self.tool = DeleteUserProfileTool()

        # Mock Twilio and entity tasks before creating objects
        self.twilio_patcher = patch("lms.accounts.models.twilio")
        self.entity_task_patcher = patch("entities.tasks.possibly_run_entity")

        self.mock_twilio = self.twilio_patcher.start()
        self.mock_entity_task = self.entity_task_patcher.start()

        # Mock Twilio message creation
        self.mock_twilio.messages.create.return_value = self.TwilioMessage(sid="test_sid")

        # Create test database objects
        self.user = User.objects.create_user(username="deleteprofileuser")
        self.account = Account.objects.create(user=self.user, account_phone="+18889990000")
        self.entity = Entity.objects.create(name="Delete Profile Entity", account=self.account)

        # Create profiles to delete
        self.student_profile = UserProfile.objects.create(
            name="Delete Test Student",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="delete.student@example.com",
            phone="+18889990001",
            account=self.account,
        )

        self.parent_profile = UserProfile.objects.create(
            name="Delete Test Parent",
            profile_type=UserProfile.ProfileType.PARENT,
            email="delete.parent@example.com",
            phone="+18889990002",
            account=self.account,
        )

        self.mock_runtime = self.Runtime(entity=self.entity)

    def tearDown(self):
        self.twilio_patcher.stop()
        self.entity_task_patcher.stop()

    def test_execute_deletes_student_profile(self):
        """Test deleting a student profile."""
        initial_count = UserProfile.objects.filter(account=self.account).count()
        profile_id = str(self.student_profile.id)

        parameters = {"profile_id": profile_id}

        result = self.tool.execute(self.mock_runtime, parameters)

        # Verify result message
        self.assertEqual(result, "User profile deleted successfully")

        # Verify profile was deleted
        self.assertEqual(UserProfile.objects.filter(account=self.account).count(), initial_count - 1)
        self.assertFalse(UserProfile.objects.filter(id=profile_id).exists())

        # Verify other profile still exists
        self.assertTrue(UserProfile.objects.filter(id=self.parent_profile.id).exists())

    def test_execute_deletes_parent_profile(self):
        """Test deleting a parent profile."""
        profile_id = str(self.parent_profile.id)

        parameters = {"profile_id": profile_id}

        result = self.tool.execute(self.mock_runtime, parameters)

        # Verify result message
        self.assertEqual(result, "User profile deleted successfully")

        # Verify profile was deleted
        self.assertFalse(UserProfile.objects.filter(id=profile_id).exists())

        # Verify other profile still exists
        self.assertTrue(UserProfile.objects.filter(id=self.student_profile.id).exists())

    def test_execute_with_unknown_profile(self):
        """Test deleting a profile that doesn't exist."""
        parameters = {"profile_id": str(uuid.uuid4())}

        with self.assertRaises(UserProfile.DoesNotExist):
            self.tool.execute(self.mock_runtime, parameters)

    def test_execute_with_profile_from_different_account(self):
        """Test that you can only delete profiles from your own account."""
        # Create another account with a profile
        other_user = User.objects.create_user(username="otheraccount2")
        other_account = Account.objects.create(user=other_user, account_phone="+17778889999")
        other_profile = UserProfile.objects.create(
            name="Other Account Profile",
            profile_type=UserProfile.ProfileType.STUDENT,
            email="other@example.com",
            phone="+17778889998",
            account=other_account,
        )

        parameters = {"profile_id": str(other_profile.id)}

        # This should raise an error since the profile doesn't belong to this account
        with self.assertRaises(UserProfile.DoesNotExist):
            self.tool.execute(self.mock_runtime, parameters)

        # Verify the other profile wasn't deleted
        self.assertTrue(UserProfile.objects.filter(id=other_profile.id).exists())

    def test_tool_schema(self):
        """Test that the tool has correct schema properties."""
        self.assertEqual(self.tool.name, "delete_user_profile")
        self.assertIn("profile_id", self.tool.parameters)
