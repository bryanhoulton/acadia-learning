"""
End-to-end test for process_session_recording Celery task.

This test validates the complete session recording processing pipeline:
1. Downloads MP4 from S3 (real S3 or local mock)
2. Converts MP4 to MP3 using ffmpeg
3. Sends audio to Gemini for analysis
4. Extracts audio duration from MP3 file
5. Updates Session record
6. Sends Slack notification (mocked)

Run with: uv run python manage.py test entities.tests.test_process_session_recording_e2e --keepdb
"""

import os
import tempfile
import uuid
from unittest import mock, skipUnless

from django.contrib.auth.models import User
from django.test import TestCase

from entities.models import Session
from entities.tasks import process_session_recording
from lms.accounts.models import Account


def _check_ffmpeg_available():
    """Check if ffmpeg and ffprobe are available in the system."""
    import shutil

    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


class ProcessSessionRecordingE2ETest(TestCase):
    """End-to-end tests for session recording processing."""

    def setUp(self):
        """Set up test fixtures."""
        # Create test account and user
        self.user = User.objects.create_user(username="session_test_user")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15551234567",
            timezone="America/New_York",
        )

        # Create test session
        self.session_id = str(uuid.uuid4())
        self.session = Session.objects.create(
            id=self.session_id,
            room_name="test-room-123",
            recording_url="https://s3.amazonaws.com/acadia-recordings/test/session.mp4",
        )

    def _create_test_mp3(self, duration_seconds: float = 300.0) -> str:
        """Create a minimal MP3 file for testing."""
        if not _check_ffmpeg_available():
            self.skipTest("ffmpeg and ffprobe are required for this test but not available in the environment")

        # Create a temporary MP3 file with ffmpeg
        temp_dir = tempfile.mkdtemp()
        mp3_path = os.path.join(temp_dir, "test.mp3")

        # Use ffmpeg to generate silence at the specified duration
        import subprocess

        try:
            # Generate a more robust MP3 using proper codec settings
            # Using aac codec with proper bitrate for better ffprobe compatibility
            subprocess.run(
                [
                    "ffmpeg",
                    "-f",
                    "lavfi",
                    "-i",
                    "anullsrc=r=44100:cl=mono",
                    "-t",
                    str(duration_seconds),
                    "-c:a",
                    "libmp3lame",  # Use libmp3lame for better MP3 encoding
                    "-b:a",
                    "128k",  # Set bitrate
                    "-q:a",
                    "4",  # Quality setting
                    "-y",  # Overwrite
                    mp3_path,
                ],
                capture_output=True,
                check=True,
            )
            return mp3_path
        except subprocess.CalledProcessError as e:
            self.skipTest(f"ffmpeg failed to create test MP3: {e.stderr}")
        except FileNotFoundError as e:
            self.skipTest(f"ffmpeg not found: {e}")

    def _mock_s3_download(self, mp3_path: str):
        """Mock S3 download to return test MP3 file."""

        def mock_download(bucket, key, local_path):
            # Copy our test MP3 to the expected location
            import shutil

            shutil.copy(mp3_path, local_path)

        return mock_download

    @mock.patch("entities.tasks.send_slack_message")
    @mock.patch("boto3.client")
    @mock.patch("entities.tasks.gai.files.upload")
    @mock.patch("entities.tasks.gai.models.generate_content")
    @skipUnless(_check_ffmpeg_available, "ffmpeg and ffprobe are required for this test")
    def test_process_session_recording_complete_flow(
        self,
        mock_generate_content,
        mock_files_upload,
        mock_boto3_client,
        mock_send_slack,
    ):
        """Test complete session recording processing workflow."""
        # Create test MP3
        test_mp3_path = self._create_test_mp3(duration_seconds=120.0)

        # Mock S3 client
        mock_s3_client = mock.MagicMock()
        mock_boto3_client.return_value = mock_s3_client
        mock_s3_client.download_file.side_effect = self._mock_s3_download(test_mp3_path)
        mock_s3_client.generate_presigned_url.return_value = "https://example.com/presigned"

        # Mock Gemini file upload
        mock_audio_file = mock.MagicMock()
        mock_audio_file.name = "files/test-audio-123"
        mock_files_upload.return_value = mock_audio_file

        # Mock Gemini generate_content responses
        def generate_content_side_effect(model, contents, **kwargs):
            """Return appropriate mock responses based on prompt content."""
            response = mock.MagicMock()

            # Detect what kind of response is being requested
            prompt_text = ""
            for content in contents:
                if isinstance(content, str):
                    prompt_text = content

            if "word-for-word transcript" in prompt_text:
                response.text = "Agent: Hello, how are you today?\nUser: Great! Let's work on algebra."
            elif "timestamped summary" in prompt_text:
                response.text = """00:00 - Session begins, student greets tutor
00:15 - Discussion about algebra problems
00:45 - Working through quadratic equations
02:10 - Student shows understanding
Total duration: 120 seconds"""
            elif "session name" in prompt_text:
                response.text = "NAME: Algebra Problem Solving Session\nDESCRIPTION: Student and tutor worked through algebra problems focusing on quadratic equations. Student demonstrated good understanding."
            elif "QA grader" in prompt_text:
                # Annotations prompt
                response.parsed = {
                    "annotations": [],
                    "leveling_assessment": {"status": "appropriate", "suggested_level": "N/A"},
                }
            else:
                response.text = "Default response"
                response.parsed = None

            return response

        mock_generate_content.side_effect = generate_content_side_effect

        # Run the task
        process_session_recording(self.session_id, "test/session.mp4")

        # Verify session was updated
        self.session.refresh_from_db()

        # Check basic fields
        self.assertIsNotNone(self.session.name)
        self.assertIsNotNone(self.session.description)
        self.assertIn("algebra", self.session.name.lower())

        # Check transcript exists
        self.assertIsNotNone(self.session.transcript)
        self.assertIn("Hello", self.session.transcript)

        # Check timestamped summary exists
        self.assertIsNotNone(self.session.timestamped_summary)
        self.assertIn("00:00", self.session.timestamped_summary)

        # Check audio duration was extracted from MP3
        self.assertIsNotNone(self.session.audio_duration_seconds)
        self.assertGreater(self.session.audio_duration_seconds, 0)
        # Duration should be close to 120 seconds (allowing some tolerance for encoding)
        self.assertGreater(self.session.audio_duration_seconds, 115)
        self.assertLess(self.session.audio_duration_seconds, 125)

        # Check session times were calculated
        self.assertIsNotNone(self.session.session_started_at)
        self.assertIsNotNone(self.session.session_ended_at)

        # session_started_at should be before session_ended_at
        self.assertLess(self.session.session_started_at, self.session.session_ended_at)

        # Duration between start and end should match audio_duration
        time_diff = (self.session.session_ended_at - self.session.session_started_at).total_seconds()
        self.assertAlmostEqual(time_diff, self.session.audio_duration_seconds, delta=1.0)

        # Check processed_at was set
        self.assertIsNotNone(self.session.processed_at)

        # Verify Slack was called (mocked, so just checking mock was called)
        mock_send_slack.assert_called_once()
        call_args = mock_send_slack.call_args
        # Check that the Slack message contains expected info
        slack_message = call_args[0][1] if call_args else ""
        self.assertIn("algebra", slack_message.lower())

        # Cleanup
        import shutil

        shutil.rmtree(os.path.dirname(test_mp3_path), ignore_errors=True)

    @mock.patch("entities.tasks.send_slack_message")
    @mock.patch("boto3.client")
    @mock.patch("entities.tasks.gai.files.upload")
    @mock.patch("entities.tasks.gai.models.generate_content")
    def test_process_session_recording_with_s3_error(
        self,
        mock_generate_content,
        mock_files_upload,
        mock_boto3_client,
        mock_send_slack,
    ):
        """Test error handling when S3 download fails."""
        # Mock S3 client to raise error
        mock_s3_client = mock.MagicMock()
        mock_boto3_client.return_value = mock_s3_client
        mock_s3_client.download_file.side_effect = Exception("S3 download failed")

        # Run the task
        process_session_recording(self.session_id, "test/session.mp4")

        # Verify session has error recorded
        self.session.refresh_from_db()
        self.assertIsNotNone(self.session.processing_error)
        self.assertIn("S3 download failed", self.session.processing_error)

        # Verify error was sent to Slack
        mock_send_slack.assert_called_once()
        call_args = mock_send_slack.call_args
        slack_message = call_args[0][1] if call_args else ""
        self.assertIn("Error", slack_message)

    @mock.patch("entities.tasks.send_slack_message")
    @mock.patch("boto3.client")
    @mock.patch("entities.tasks.gai.files.upload")
    @mock.patch("entities.tasks.gai.models.generate_content")
    @skipUnless(_check_ffmpeg_available, "ffmpeg and ffprobe are required for this test")
    def test_process_session_recording_with_gemini_error(
        self,
        mock_generate_content,
        mock_files_upload,
        mock_boto3_client,
        mock_send_slack,
    ):
        """Test error handling when Gemini analysis fails."""
        # Create test MP3
        test_mp3_path = self._create_test_mp3(duration_seconds=60.0)

        # Mock S3 client
        mock_s3_client = mock.MagicMock()
        mock_boto3_client.return_value = mock_s3_client
        mock_s3_client.download_file.side_effect = self._mock_s3_download(test_mp3_path)
        mock_s3_client.generate_presigned_url.return_value = "https://example.com/presigned"

        # Mock Gemini file upload
        mock_audio_file = mock.MagicMock()
        mock_audio_file.name = "files/test-audio-456"
        mock_files_upload.return_value = mock_audio_file

        # Mock generate_content to raise error
        mock_generate_content.side_effect = Exception("Gemini API error")

        # Run the task
        process_session_recording(self.session_id, "test/session.mp4")

        # Verify session has error recorded
        self.session.refresh_from_db()
        self.assertIsNotNone(self.session.processing_error)

        # Error should be sent to Slack
        mock_send_slack.assert_called_once()

        # Cleanup
        import shutil

        shutil.rmtree(os.path.dirname(test_mp3_path), ignore_errors=True)

    @mock.patch("entities.tasks.send_slack_message")
    @mock.patch("boto3.client")
    @mock.patch("entities.tasks.gai.files.upload")
    @mock.patch("entities.tasks.gai.models.generate_content")
    def test_process_session_recording_nonexistent_session(
        self,
        mock_generate_content,
        mock_files_upload,
        mock_boto3_client,
        mock_send_slack,
    ):
        """Test handling of nonexistent session."""
        fake_session_id = str(uuid.uuid4())

        # Run the task with fake session ID
        process_session_recording(fake_session_id, "test/session.mp4")

        # No exceptions should be raised; task should log and return gracefully
        self.assertTrue(True)  # Just verify no exception

    @mock.patch("entities.tasks.send_slack_message")
    @mock.patch("boto3.client")
    @mock.patch("entities.tasks.gai.files.upload")
    @mock.patch("entities.tasks.gai.models.generate_content")
    @skipUnless(_check_ffmpeg_available, "ffmpeg and ffprobe are required for this test")
    def test_mp3_duration_extraction_via_ffprobe(
        self,
        mock_generate_content,
        mock_files_upload,
        mock_boto3_client,
        mock_send_slack,
    ):
        """Test that MP3 duration is correctly extracted using ffprobe."""
        # Create test MP3 with specific duration
        duration = 256.5  # Test with decimal duration
        test_mp3_path = self._create_test_mp3(duration_seconds=duration)

        # Mock S3 client
        mock_s3_client = mock.MagicMock()
        mock_boto3_client.return_value = mock_s3_client
        mock_s3_client.download_file.side_effect = self._mock_s3_download(test_mp3_path)
        mock_s3_client.generate_presigned_url.return_value = "https://example.com/presigned"

        # Mock Gemini
        mock_audio_file = mock.MagicMock()
        mock_audio_file.name = "files/test-audio-789"
        mock_files_upload.return_value = mock_audio_file

        def generate_content_side_effect(model, contents, **kwargs):
            response = mock.MagicMock()
            response.text = "NAME: Test Session\nDESCRIPTION: A test session."
            response.parsed = {
                "annotations": [],
                "leveling_assessment": {"status": "no_signal", "suggested_level": "N/A"},
            }
            return response

        mock_generate_content.side_effect = generate_content_side_effect

        # Run the task
        process_session_recording(self.session_id, "test/session.mp4")

        # Verify duration was extracted
        self.session.refresh_from_db()
        self.assertIsNotNone(self.session.audio_duration_seconds)
        # Allow some tolerance for ffmpeg encoding/rounding
        self.assertAlmostEqual(self.session.audio_duration_seconds, duration, delta=2.0)

        # Cleanup
        import shutil

        shutil.rmtree(os.path.dirname(test_mp3_path), ignore_errors=True)
