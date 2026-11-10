from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import TestCase, tag

from entities.adapters.sms import OpenImageTool
from entities.runtime import EntityRuntime
from sms.models import SMSAttachment, SMSMessage


@tag("fast")
class OpenImageToolTestCase(TestCase):
    """Tests for the open_image tool and its runtime integration."""

    def test_execute_includes_question_and_returns_description(self):
        """open_image should include the optional question when calling the vision model."""
        tool = OpenImageTool()
        fake_bytes = b"fake-image-bytes"
        question = "What animal is shown?"

        mock_response = MagicMock()
        mock_response.content = fake_bytes
        mock_response.headers = {"Content-Type": "image/png"}
        mock_response.raise_for_status.return_value = None

        with (
            patch("entities.adapters.sms.requests.get", return_value=mock_response) as mock_get,
            patch("entities.adapters.sms.oai.responses.create") as mock_create,
        ):
            mock_create.return_value = SimpleNamespace(output_text="It is a cartoon pig.")

            result = tool.execute(
                entity_runtime=MagicMock(), parameters={"url": "https://foo.bar/img.png", "question": question}
            )

        self.assertEqual(result["description"], "It is a cartoon pig.")
        self.assertEqual(result["question"], question)
        self.assertEqual(result["content_type"], "image/png")
        self.assertEqual(result["source_url"], "https://foo.bar/img.png")

        mock_get.assert_called_once_with("https://foo.bar/img.png", timeout=15, auth=None)

        create_kwargs = mock_create.call_args.kwargs
        self.assertIn("input", create_kwargs)
        vision_input = create_kwargs["input"][0]["content"]

        self.assertTrue(
            any(
                block["type"] == "input_text" and block["text"].startswith("Describe this image")
                for block in vision_input
            )
        )
        self.assertTrue(
            any(block["type"] == "input_text" and block["text"] == f"Question: {question}" for block in vision_input)
        )
        image_blocks = [block for block in vision_input if block["type"] == "input_image"]
        self.assertEqual(len(image_blocks), 1)
        self.assertTrue(image_blocks[0]["image_url"].startswith("data:image/png;base64,"))

    def test_runtime_injects_question_and_answer_message(self):
        """Runtime should add a synthesized user message summarizing the question and answer."""
        tool = OpenImageTool()
        answer = "A cartoon pig head with rosy cheeks."
        question = "What animal is depicted?"

        runtime = EntityRuntime.__new__(EntityRuntime)
        runtime.entity = SimpleNamespace(id=123)
        runtime.available_tools = [tool]

        logged_messages: list[list[dict]] = []

        def fake_log_messages(messages, timestamp=None):
            logged_messages.append(messages)

        runtime.drm = SimpleNamespace(log_messages=fake_log_messages)

        with patch.object(
            tool,
            "execute",
            return_value={
                "description": answer,
                "source_url": "https://foo.bar/img.png",
                "content_type": "image/png",
                "question": question,
            },
        ):
            fake_tool_call = SimpleNamespace(
                type="function_call",
                name="open_image",
                id="tool-123",
                call_id="call-123",
                arguments=json.dumps(
                    {
                        "reasoning": "Need to verify the screenshot",
                        "url": "https://foo.bar/img.png",
                        "question": question,
                    }
                ),
            )

            runtime._process_tool_calls(SimpleNamespace(output=[fake_tool_call]))

        self.assertGreaterEqual(len(logged_messages), 1)
        combined_messages = logged_messages[-1]
        summary_message = next(item for item in combined_messages if item.get("role") == "user")

        self.assertIn("Question: What animal is depicted?", summary_message["content"])
        self.assertIn("Answer: A cartoon pig head with rosy cheeks.", summary_message["content"])
        self.assertIn("source: https://foo.bar/img.png", summary_message["content"])

    @tag("slow")
    def test_open_image_with_real_api_twilio_url(self):
        self.skipTest("Requires separately provisioned synthetic media.")

    @tag("slow")
    def test_open_image_with_real_api_base64_data_uri(self):
        """Test open_image with real OpenAI API and base64 data URI."""
        tool = OpenImageTool()

        # Create a small test image as base64 (1x1 red pixel PNG)
        # This is a minimal valid PNG
        red_pixel_base64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        )
        data_uri = f"data:image/png;base64,{red_pixel_base64}"
        question = "What color is the pixel?"

        result = tool.execute(entity_runtime=MagicMock(), parameters={"url": data_uri, "question": question})

        # Verify result structure
        self.assertIn("description", result)
        self.assertIn("source_url", result)
        self.assertIn("content_type", result)
        self.assertIn("question", result)

        # Verify actual response
        self.assertIsInstance(result["description"], str)
        self.assertGreater(len(result["description"]), 0, "Description should not be empty")
        self.assertIsNone(result["source_url"], "source_url should be None for data URIs")
        self.assertEqual(result["question"], question)
        self.assertEqual(result["content_type"], "image/png")


@tag("slow")
class OpenImageToolWithSMSTestCase(TestCase):
    """Tests for open_image tool with real SMS attachments."""

    def setUp(self):
        """Create test SMS message with attachments."""
        self.tool = OpenImageTool()
        self.message = SMSMessage.objects.create(
            from_number="+1234567890",
            to_number="+0987654321",
            body="Check out this image",
            twilio_sid="SM123456789",
            direction="inbound",
            has_attachments=True,
        )

    def test_open_image_with_sms_attachment_twilio_url(self):
        """Test open_image with a real Twilio SMS attachment URL."""
        # Real Twilio media URL that requires Twilio auth
        twilio_media_url = "https://api.twilio.com/2010-04-01/Accounts/AC00000000000000000000000000000000/Messages/MM00000000000000000000000000000000/Media/ME00000000000000000000000000000000"

        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url=twilio_media_url,
            content_type="image/jpeg",
        )

        question = "What's in this SMS image?"

        result = self.tool.execute(
            entity_runtime=MagicMock(), parameters={"url": attachment.media_url, "question": question}
        )

        # Verify result structure
        self.assertIn("description", result)
        self.assertIn("source_url", result)
        self.assertIn("content_type", result)
        self.assertIn("question", result)

        # If successful, verify the content (may fail due to auth or network)
        if "error" not in result:
            self.assertIsInstance(result["description"], str)
            self.assertGreater(len(result["description"]), 0)
            self.assertEqual(result["source_url"], attachment.media_url)
            self.assertEqual(result["question"], question)

    def test_open_image_with_sms_attachment_data_uri(self):
        """Test open_image with SMS attachment converted to data URI."""
        # Create a small test image as base64
        red_pixel_base64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        )
        data_uri = f"data:image/png;base64,{red_pixel_base64}"

        # Create attachment with mock media_url (in real scenario, this would be Twilio URL)
        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url="https://twilio.com/api/media/SM123/sample.png",
            content_type="image/png",
        )

        question = "What color is this?"

        # Use the data URI instead of the media_url
        result = self.tool.execute(entity_runtime=MagicMock(), parameters={"url": data_uri, "question": question})

        # Verify result
        self.assertIsInstance(result["description"], str)
        self.assertGreater(len(result["description"]), 0)
        self.assertIsNone(result["source_url"])
        self.assertEqual(result["question"], question)
        self.assertEqual(result["content_type"], "image/png")

    def test_sms_list_tool_returns_attachment_urls(self):
        """Test that SmsListTool returns attachment URLs from SMS messages."""
        from entities.adapters.sms import SmsListTool
        from lms.accounts.models import Account, UserProfile
        from entities.models import Entity

        # Create account, entity and user profile
        account = Account.objects.create(account_phone="+1234567890")
        entity = Entity.objects.create(account=account, name="Test Entity")
        profile = UserProfile.objects.create(
            account=account,
            phone="+1234567890",
            name="Test User",
            profile_type=UserProfile.ProfileType.PARENT,
        )

        # Create SMS with attachment
        attachment = SMSAttachment.objects.create(
            message=self.message,
            media_url="https://example.com/test-image.png",
            content_type="image/png",
        )

        # Create proper entity runtime mock with time_offset
        mock_entity_runtime = MagicMock()
        mock_entity_runtime.entity = entity
        mock_entity_runtime.entity.time_offset = 0

        tool = SmsListTool()
        result = tool.execute(entity_runtime=mock_entity_runtime, parameters={"user_profile_id": str(profile.id)})

        # Should return messages with attachment URLs
        self.assertGreater(len(result), 0)
        messages_with_attachments = [m for m in result if "attachments" in m]
        if messages_with_attachments:
            attachment_urls = [a["url"] for a in messages_with_attachments[0]["attachments"]]
            self.assertIn(attachment.media_url, attachment_urls)
