import uuid
from datetime import timedelta

from django.test import TestCase, tag
from django.utils import timezone

from entities.adapters.sessions import GetSessionDetailsTool, ListSessionsTool, SessionsAdapter
from entities.models import Entity, Session
from entities.runtime import EntityRuntime
from lms.accounts.models import Account, UserProfile


@tag("fast")
class TestListSessionsTool(TestCase):
    def setUp(self):
        # Create account and entity
        from django.contrib.auth.models import User

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567890")
        self.entity = Entity.objects.create(
            name="Test Entity",
            account=self.account,
            timezone="UTC",
        )

        # Create user profiles
        self.profile1 = UserProfile.objects.create(
            account=self.account,
            name="Student 1",
            profile_type=UserProfile.ProfileType.STUDENT,
        )
        self.profile2 = UserProfile.objects.create(
            account=self.account,
            name="Student 2",
            profile_type=UserProfile.ProfileType.STUDENT,
        )

        # Create sessions
        self.session1 = Session.objects.create(
            room_name="room_1",
            profile=self.profile1,
            recording_url="https://example.com/recording1.mp3",
            name="Session 1",
            description="First session",
            audio_duration_seconds=3600.0,
            session_started_at=timezone.now() - timedelta(days=2),
            session_ended_at=timezone.now() - timedelta(days=2, hours=-1),
        )
        self.session2 = Session.objects.create(
            room_name="room_2",
            profile=self.profile1,
            recording_url="https://example.com/recording2.mp3",
            name="Session 2",
            description="Second session",
            audio_duration_seconds=1800.0,
            session_started_at=timezone.now() - timedelta(days=1),
            session_ended_at=timezone.now() - timedelta(days=1, hours=-1),
        )
        self.session3 = Session.objects.create(
            room_name="room_3",
            profile=self.profile2,
            recording_url="https://example.com/recording3.mp3",
            name="Session 3",
            description="Third session",
            audio_duration_seconds=2400.0,
            session_started_at=timezone.now(),
            session_ended_at=timezone.now() + timedelta(hours=1),
        )

        self.tool = ListSessionsTool()
        self.runtime = EntityRuntime(self.entity)

    def test_list_all_sessions(self):
        """Test listing all sessions for the account"""
        result = self.tool.execute(self.runtime, {"limit": 50, "offset": 0})

        assert result["pagination"]["total_count"] == 3
        assert len(result["sessions"]) == 3
        assert result["pagination"]["offset"] == 0
        assert result["pagination"]["limit"] == 50
        assert not result["pagination"]["has_more"]

    def test_list_sessions_with_pagination(self):
        """Test pagination works correctly"""
        result = self.tool.execute(self.runtime, {"limit": 2, "offset": 0})

        assert result["pagination"]["total_count"] == 3
        assert len(result["sessions"]) == 2
        assert result["pagination"]["has_more"] is True

        # Get next page
        result2 = self.tool.execute(self.runtime, {"limit": 2, "offset": 2})
        assert len(result2["sessions"]) == 1
        assert result2["pagination"]["has_more"] is False

    def test_list_sessions_for_specific_profile(self):
        """Test filtering sessions by profile"""
        result = self.tool.execute(self.runtime, {"profile_id": str(self.profile1.id), "limit": 50, "offset": 0})

        assert result["pagination"]["total_count"] == 2
        assert len(result["sessions"]) == 2
        # Verify all sessions are from profile1
        profile1_id_str = str(self.profile1.id)
        for session in result["sessions"]:
            # Profile could be string or UUID
            assert str(session["profile"]) == profile1_id_str

    def test_list_sessions_invalid_profile(self):
        """Test error handling for non-existent profile"""
        fake_profile_id = str(uuid.uuid4())
        result = self.tool.execute(self.runtime, {"profile_id": fake_profile_id, "limit": 50, "offset": 0})

        assert "error" in result
        assert "not found" in result["error"]

    def test_list_sessions_default_limit(self):
        """Test default limit is applied"""
        result = self.tool.execute(self.runtime, {})

        assert result["pagination"]["limit"] == 20  # Default limit

    def test_list_sessions_limit_capping(self):
        """Test limit is capped at 100"""
        result = self.tool.execute(self.runtime, {"limit": 500, "offset": 0})

        assert result["pagination"]["limit"] == 100

    def test_list_sessions_ordered_by_created_at(self):
        """Test sessions are ordered by created_at descending"""
        result = self.tool.execute(self.runtime, {"limit": 50, "offset": 0})

        sessions = result["sessions"]
        # Latest session should be first
        assert sessions[0]["id"] == str(self.session3.id)
        assert sessions[1]["id"] == str(self.session2.id)
        assert sessions[2]["id"] == str(self.session1.id)

    def test_list_sessions_with_leveling_assessment(self):
        """Test that leveling assessment is included and formatted"""
        # Create session with leveling data
        leveling_data = {
            "status": "too_simple",
            "reasoning": "Student answered instantly.",
            "evidence": "Fast response time",
            "suggested_level": "Grade 5",
        }

        session = Session.objects.create(
            room_name="room_leveling",
            profile=self.profile1,
            recording_url="https://example.com/rec.mp3",
            name="Leveling Session",
            leveling_assessment=leveling_data,
            audio_duration_seconds=600.0,
        )

        # Execute tool
        result = self.tool.execute(self.runtime, {"limit": 10, "offset": 0})

        # Verify data presence
        found_session = next(s for s in result["sessions"] if s["id"] == str(session.id))
        assert found_session["leveling_assessment"] == leveling_data

        # Verify formatting
        formatted = self.tool.format_result(result)
        assert "Leveling: Too Simple - Student answered instantly." in formatted


@tag("fast")
class TestGetSessionDetailsTool(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567890")
        self.entity = Entity.objects.create(
            name="Test Entity",
            account=self.account,
            timezone="UTC",
        )

        self.profile = UserProfile.objects.create(
            account=self.account,
            name="Student 1",
            profile_type=UserProfile.ProfileType.STUDENT,
        )

        self.session = Session.objects.create(
            room_name="room_1",
            profile=self.profile,
            recording_url="https://example.com/recording1.mp3",
            name="Test Session",
            description="Test description",
            transcript="This is a test transcript",
            timestamped_summary="00:00 - Session started\n00:30 - Student asked about fractions",
            audio_duration_seconds=3600.0,
            session_started_at=timezone.now(),
            session_ended_at=timezone.now() + timedelta(hours=1),
        )

        self.tool = GetSessionDetailsTool()
        self.runtime = EntityRuntime(self.entity)

    def test_get_session_details(self):
        """Test retrieving session details (transcript and summary)"""
        result = self.tool.execute(self.runtime, {"session_id": str(self.session.id)})

        assert result["id"] == str(self.session.id)
        assert result["name"] == "Test Session"
        assert result["transcript"] == "This is a test transcript"
        assert "00:00 - Session started" in result["timestamped_summary"]
        # Metadata should not be included in details view
        assert "description" not in result
        assert "audio_duration_seconds" not in result

    def test_get_session_details_not_found(self):
        """Test error handling for non-existent session"""
        fake_session_id = str(uuid.uuid4())
        result = self.tool.execute(self.runtime, {"session_id": fake_session_id})

        assert "error" in result
        assert "not found" in result["error"]


@tag("fast")
class TestSessionsAdapter(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User

        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.account = Account.objects.create(user=self.user, account_phone="+1234567890")
        self.entity = Entity.objects.create(
            name="Test Entity",
            account=self.account,
            timezone="UTC",
        )

    def test_adapter_attributes(self):
        """Test adapter has correct attributes"""
        adapter = SessionsAdapter()

        assert adapter.name == "sessions"
        assert len(adapter.tools) == 2
        assert isinstance(adapter.tools[0], ListSessionsTool)
        assert isinstance(adapter.tools[1], GetSessionDetailsTool)

    def test_adapter_description(self):
        """Test adapter has a meaningful description"""
        adapter = SessionsAdapter()

        assert "session" in adapter.description.lower()
        assert len(adapter.description) > 0
