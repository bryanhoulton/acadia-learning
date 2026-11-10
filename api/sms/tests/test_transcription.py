"""Tests for voice message transcription."""

from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.test import TestCase, tag

from lms.accounts.models import Account, UserProfile
from sms.models import SMSAttachment, SMSMessage
from sms.tasks import is_transcribable_audio, transcribe_voice_message


@tag("fast")
class TestIsTranscribableAudio(TestCase):
    """Test the is_transcribable_audio helper function."""

    def test_audio_mp4_is_transcribable(self):
        assert is_transcribable_audio("audio/mp4") is True

    def test_audio_amr_is_transcribable(self):
        assert is_transcribable_audio("audio/amr") is True

    def test_audio_aac_is_transcribable(self):
        assert is_transcribable_audio("audio/aac") is True

    def test_audio_mpeg_is_transcribable(self):
        assert is_transcribable_audio("audio/mpeg") is True

    def test_audio_wav_is_transcribable(self):
        assert is_transcribable_audio("audio/wav") is True

    def test_audio_with_charset_is_transcribable(self):
        assert is_transcribable_audio("audio/mp4; charset=utf-8") is True

    def test_unknown_audio_type_is_transcribable(self):
        # Any audio/* type should be transcribable
        assert is_transcribable_audio("audio/unknown") is True

    def test_image_is_not_transcribable(self):
        assert is_transcribable_audio("image/jpeg") is False

    def test_text_is_not_transcribable(self):
        assert is_transcribable_audio("text/html") is False

    def test_application_is_not_transcribable(self):
        assert is_transcribable_audio("application/octet-stream") is False


@tag("fast")
class TestSMSAttachmentIsAudio(TestCase):
    """Test the SMSAttachment.is_audio() method."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15551234567",
        )
        self.profile = UserProfile.objects.create(
            account=self.account,
            name="Test User",
            profile_type=UserProfile.ProfileType.PARENT,
            phone="+15551234567",
        )
        self.message = SMSMessage.objects.create(
            from_number="+15551234567",
            to_number="+14155838050",
            body="",
            direction="inbound",
            has_attachments=True,
        )

    def test_audio_mp4_is_audio(self):
        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url="https://example.com/audio.mp4",
            content_type="audio/mp4",
        )
        assert attachment.is_audio() is True

    def test_image_is_not_audio(self):
        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url="https://example.com/image.jpg",
            content_type="image/jpeg",
        )
        assert attachment.is_audio() is False

    def test_text_is_not_audio(self):
        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url="https://example.com/page.html",
            content_type="text/html",
        )
        assert attachment.is_audio() is False


@tag("fast")
class TestTranscribeVoiceMessageTask(TestCase):
    """Test the transcribe_voice_message Celery task."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser2", password="testpass123")
        self.account = Account.objects.create(
            user=self.user,
            account_phone="+15551234568",
        )
        self.profile = UserProfile.objects.create(
            account=self.account,
            name="Test User",
            profile_type=UserProfile.ProfileType.PARENT,
            phone="+15551234568",
        )
        self.message = SMSMessage.objects.create(
            from_number="+15551234568",
            to_number="+14155838050",
            body="",
            direction="inbound",
            has_attachments=True,
        )

    def test_attachment_not_found(self):
        result = transcribe_voice_message("00000000-0000-0000-0000-000000000000")
        assert result == {"error": "Attachment not found"}

    def test_already_transcribed_skips(self):
        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url="https://example.com/audio.mp4",
            content_type="audio/mp4",
            transcription="Already transcribed text",
        )
        result = transcribe_voice_message(str(attachment.id))
        assert result["status"] == "already_transcribed"
        assert result["transcription"] == "Already transcribed text"

    def test_non_audio_skips(self):
        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url="https://example.com/image.jpg",
            content_type="image/jpeg",
        )
        result = transcribe_voice_message(str(attachment.id))
        assert result["status"] == "not_audio"
        assert result["content_type"] == "image/jpeg"

    @patch("sms.tasks.gai")
    @patch("sms.tasks.requests.get")
    @patch("sms.tasks.subprocess.run")
    def test_successful_transcription(self, mock_subprocess, mock_requests, mock_gai):
        """Test successful transcription flow with mocked dependencies."""
        # Create attachment
        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url="https://example.com/audio.mp4",
            content_type="audio/mp4",
        )

        # Mock requests.get to return fake audio data
        mock_response = MagicMock()
        mock_response.content = b"fake audio data"
        mock_response.raise_for_status = MagicMock()
        mock_requests.return_value = mock_response

        # Mock subprocess.run for ffmpeg conversion
        mock_subprocess.return_value = MagicMock()

        # Mock Gemini file upload and transcription
        mock_file = MagicMock()
        mock_file.name = "files/test123"
        mock_file.state.name = "ACTIVE"
        mock_gai.files.upload.return_value = mock_file
        mock_gai.files.get.return_value = mock_file

        mock_gemini_response = MagicMock()
        mock_gemini_response.text = "This is the transcribed text"
        mock_gai.models.generate_content.return_value = mock_gemini_response

        # Run task
        result = transcribe_voice_message(str(attachment.id))

        # Verify result
        assert result["status"] == "success"
        assert result["transcription"] == "This is the transcribed text"

        # Verify attachment was updated
        attachment.refresh_from_db()
        assert attachment.transcription == "This is the transcribed text"
        assert attachment.transcription_error is None


@tag("slow", "external")
class TestTranscribeVoiceMessageIntegration:
    """Real customer audio is excluded from test fixtures."""
