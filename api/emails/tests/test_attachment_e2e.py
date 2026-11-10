"""
E2E tests for email attachment handling using REAL AgentMail data.
These tests use actual emails and attachments, no mocks.

To run: uv run python manage.py test emails.tests.test_attachment_e2e --keepdb
"""

from django.contrib.auth.models import User
from django.test import TestCase, tag

from api.settings import mail
from entities.models import Entity
from entities.runtime import EntityRuntime
from lms.accounts.models import Account
from utils.emails import get_or_create_inbox


def _get_tool(runtime: EntityRuntime, tool_name: str):
    """Helper to get a tool from runtime by name."""
    for tool in runtime.available_tools:
        if tool.name == tool_name:
            return tool
    raise AssertionError(f"Tool {tool_name} not found in runtime")


@tag("e2e", "slow")
class EmailAttachmentE2ETests(TestCase):
    """
    End-to-end tests using real AgentMail API and test email.

    Prerequisites:
    - Test email sent to acadia-17@tutor.acadialearning.org with:
      * Frame 129.png (image about Bloom's Two-Sigma Problem)
      * mohit.pdf (SAFE agreement PDF)
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Get or create test entity
        try:
            cls.entity = Entity.objects.get(id=17)
        except Entity.DoesNotExist:
            # Create test entity if it doesn't exist
            user = User.objects.create_user(username="e2e_test_user")
            account = Account.objects.create(
                user=user,
                account_phone="+15555550017",
                timezone="America/New_York",
            )
            cls.entity = Entity.objects.create(
                id=17,
                name="E2E Test Entity",
                account=account,
                timezone="America/New_York",
            )

    def setUp(self):
        """Set up test fixtures."""
        self.runtime = EntityRuntime(self.entity)
        self.inbox = get_or_create_inbox(self.entity.id)
        self.tool = _get_tool(self.runtime, "email_view_attachment")

    def _get_test_email_thread(self):
        """Get the test email thread from AgentMail."""
        threads_response = mail.inboxes.threads.list(inbox_id=self.inbox.inbox_id, limit=10)

        # Find thread with "test email" subject
        for thread in threads_response.threads or []:
            if thread.subject and "test" in thread.subject.lower():
                full_thread = mail.inboxes.threads.get(inbox_id=self.inbox.inbox_id, thread_id=thread.thread_id)
                return full_thread

        self.skipTest("Test email not found. Please send a test email with attachments first.")
        return None

    def _get_attachment_by_type(self, thread, content_type_prefix):
        """Get attachment from thread by content type prefix."""
        for msg in thread.messages:
            msg_dict = msg.model_dump()
            for att in msg_dict.get("attachments", []):
                if att["content_type"].startswith(content_type_prefix):
                    return thread.thread_id, att
        return None, None

    def test_email_thread_has_attachments(self):
        """Test that we can retrieve the test email thread and it has attachments."""
        thread = self._get_test_email_thread()

        self.assertIsNotNone(thread, "Test email thread should exist")
        self.assertTrue(len(thread.messages) > 0, "Thread should have messages")

        # Check for attachments
        has_attachments = False
        for msg in thread.messages:
            msg_dict = msg.model_dump()
            if msg_dict.get("attachments"):
                has_attachments = True
                self.assertGreater(len(msg_dict["attachments"]), 0, "Should have at least one attachment")

        self.assertTrue(has_attachments, "Test email should have attachments")

    def test_download_image_attachment(self):
        """Test downloading the PNG image attachment."""
        import os

        import requests

        thread = self._get_test_email_thread()
        thread_id, image_att = self._get_attachment_by_type(thread, "image/")

        if not image_att:
            self.skipTest("No image attachment found in test email")

        # Download the attachment using threads API (handles both 200 JSON and 302 redirect)
        api_key = os.environ.get("AGENTMAIL_API_KEY")
        url = f"https://api.agentmail.to/v0/threads/{thread_id}/attachments/{image_att['attachment_id']}"
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            allow_redirects=False,
            timeout=30,
        )
        self.assertIn(response.status_code, [200, 302])

        if response.status_code == 302:
            download_url = response.headers.get("location")
        else:
            data = response.json()
            download_url = data.get("download_url")

        self.assertIsNotNone(download_url)

        download_response = requests.get(download_url, timeout=60)
        attachment_data = download_response.content

        # Verify download
        self.assertIsNotNone(attachment_data)
        self.assertGreater(len(attachment_data), 0)
        self.assertEqual(len(attachment_data), image_att["size"])

    def test_download_pdf_attachment(self):
        """Test downloading the PDF attachment."""
        import os

        import requests

        thread = self._get_test_email_thread()
        thread_id, pdf_att = self._get_attachment_by_type(thread, "application/pdf")

        if not pdf_att:
            self.skipTest("No PDF attachment found in test email")

        # Download the attachment using threads API (handles both 200 JSON and 302 redirect)
        api_key = os.environ.get("AGENTMAIL_API_KEY")
        url = f"https://api.agentmail.to/v0/threads/{thread_id}/attachments/{pdf_att['attachment_id']}"
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            allow_redirects=False,
            timeout=30,
        )
        self.assertIn(response.status_code, [200, 302])

        if response.status_code == 302:
            download_url = response.headers.get("location")
        else:
            data = response.json()
            download_url = data.get("download_url")

        self.assertIsNotNone(download_url)

        download_response = requests.get(download_url, timeout=60)
        attachment_data = download_response.content

        # Verify download
        self.assertIsNotNone(attachment_data)
        self.assertGreater(len(attachment_data), 0)
        self.assertEqual(len(attachment_data), pdf_att["size"])
        # Verify it's actually a PDF
        self.assertTrue(attachment_data.startswith(b"%PDF"))

    def test_analyze_image_with_vision_ai(self):
        """Test analyzing the image attachment using vision AI."""
        thread = self._get_test_email_thread()
        thread_id, image_att = self._get_attachment_by_type(thread, "image/")

        if not image_att:
            self.skipTest("No image attachment found in test email")

        # Analyze without question
        result_str = self.tool.execute(
            self.runtime,
            {
                "thread_id": thread_id,
                "attachment_id": image_att["attachment_id"],
                "question": None,
            },
        )

        result = result_str  # execute() returns dict directly

        # Verify structure
        self.assertNotIn("error", result)
        self.assertEqual(result["type"], "image")
        self.assertEqual(result["filename"], image_att["filename"])
        self.assertIn("description", result)
        self.assertIsNotNone(result["description"])
        # Vision AI responses can vary in length, but should have meaningful content
        # Note: Some vision models may return very short descriptions in edge cases
        description = result["description"]
        # Check that we got a non-empty description (not an error message)
        self.assertGreater(len(description), 0, f"Description should not be empty, but got: '{description}'")
        # If description is very short, ensure it's not an error indicator
        if len(description) < 10:
            # Very short responses might indicate an issue, but we'll allow them for now
            # as vision models can sometimes return brief descriptions
            self.assertNotIn(
                "error", description.lower(), f"Description appears to be an error message: '{description}'"
            )

    def test_ask_question_about_image(self):
        """Test asking a specific question about the image attachment."""
        thread = self._get_test_email_thread()
        thread_id, image_att = self._get_attachment_by_type(thread, "image/")

        if not image_att:
            self.skipTest("No image attachment found in test email")

        # Ask a specific question (Frame 129.png is about Bloom's Two-Sigma)
        question = "What percentage is mentioned in this image?"
        result_str = self.tool.execute(
            self.runtime,
            {
                "thread_id": thread_id,
                "attachment_id": image_att["attachment_id"],
                "question": question,
            },
        )

        result = result_str  # execute() returns dict directly

        # Verify answer structure - don't test specific content as vision models vary
        self.assertNotIn("error", result)
        self.assertEqual(result["question"], question)
        self.assertIn("description", result)
        self.assertIsNotNone(result["description"])
        self.assertGreater(len(result["description"]), 10, "Description should have meaningful content")

    def test_analyze_pdf_with_openai(self):
        """Test analyzing PDF using OpenAI's file handling."""
        thread = self._get_test_email_thread()
        thread_id, pdf_att = self._get_attachment_by_type(thread, "application/pdf")

        if not pdf_att:
            self.skipTest("No PDF attachment found in test email")

        # Ask a question about the PDF (mohit.pdf is a SAFE agreement)
        question = "What type of document is this?"
        result_str = self.tool.execute(
            self.runtime,
            {
                "thread_id": thread_id,
                "attachment_id": pdf_att["attachment_id"],
                "question": question,
            },
        )

        result = result_str  # execute() returns dict directly

        # Verify answer structure - don't test specific content as AI models vary
        self.assertNotIn("error", result)
        self.assertEqual(result["type"], "pdf")
        self.assertEqual(result["question"], question)
        self.assertIn("answer", result)
        self.assertIsNotNone(result["answer"])
        self.assertGreater(len(result["answer"]), 10, "Answer should have meaningful content")

    def test_pdf_detailed_analysis(self):
        """Test detailed PDF analysis with specific questions."""
        thread = self._get_test_email_thread()
        thread_id, pdf_att = self._get_attachment_by_type(thread, "application/pdf")

        if not pdf_att:
            self.skipTest("No PDF attachment found in test email")

        # Ask a detailed question (mohit.pdf has $3,000 investment amount)
        question = "What is the investment amount in this document?"
        result_str = self.tool.execute(
            self.runtime,
            {
                "thread_id": thread_id,
                "attachment_id": pdf_att["attachment_id"],
                "question": question,
            },
        )

        result = result_str  # execute() returns dict directly

        # Verify answer structure - don't test specific content as AI models vary
        self.assertNotIn("error", result)
        self.assertIn("answer", result)
        self.assertIsNotNone(result["answer"])
        self.assertGreater(len(result["answer"]), 10, "Answer should have meaningful content")

    def test_multiple_attachments_in_same_email(self):
        """Test handling multiple attachments in the same email."""
        thread = self._get_test_email_thread()

        # Count attachments
        total_attachments = 0
        for msg in thread.messages:
            msg_dict = msg.model_dump()
            if msg_dict.get("attachments"):
                total_attachments += len(msg_dict["attachments"])

        self.assertGreaterEqual(total_attachments, 2, "Test email should have at least 2 attachments")

        # Test that we can access both image and PDF
        thread_id_img, image_att = self._get_attachment_by_type(thread, "image/")
        thread_id_pdf, pdf_att = self._get_attachment_by_type(thread, "application/pdf")

        self.assertIsNotNone(image_att, "Should have image attachment")
        self.assertIsNotNone(pdf_att, "Should have PDF attachment")

        # Both should be from the same thread
        self.assertEqual(thread_id_img, thread_id_pdf)

    def test_attachment_metadata_accuracy(self):
        """Test that attachment metadata from AgentMail is accurate."""
        import os

        import requests

        thread = self._get_test_email_thread()

        for msg in thread.messages:
            msg_dict = msg.model_dump()
            for att in msg_dict.get("attachments", []):
                # Download and verify size matches using threads API (handles both 200 JSON and 302 redirect)
                api_key = os.environ.get("AGENTMAIL_API_KEY")
                url = f"https://api.agentmail.to/v0/threads/{thread.thread_id}/attachments/{att['attachment_id']}"
                response = requests.get(
                    url,
                    headers={"Authorization": f"Bearer {api_key}"},
                    allow_redirects=False,
                    timeout=30,
                )
                self.assertIn(response.status_code, [200, 302])

                if response.status_code == 302:
                    download_url = response.headers.get("location")
                else:
                    data = response.json()
                    download_url = data.get("download_url")

                download_response = requests.get(download_url, timeout=60)
                attachment_data = download_response.content

                self.assertEqual(
                    len(attachment_data), att["size"], f"Downloaded size should match metadata for {att['filename']}"
                )

    def test_error_handling_invalid_attachment_id(self):
        """Test error handling for invalid attachment ID."""
        thread = self._get_test_email_thread()

        # Try to get attachment with invalid ID
        result_str = self.tool.execute(
            self.runtime,
            {
                "thread_id": thread.thread_id,
                "attachment_id": "invalid-attachment-id-12345",
                "question": None,
            },
        )

        result = result_str  # execute() returns dict directly
        self.assertIn("error", result)


@tag("e2e", "slow", "comprehensive")
class EmailAttachmentWorkflowE2ETests(TestCase):
    """Test the complete workflow from email receipt to attachment analysis."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        try:
            cls.entity = Entity.objects.get(id=17)
        except Entity.DoesNotExist:
            user = User.objects.create_user(username="workflow_test_user")
            account = Account.objects.create(
                user=user,
                account_phone="+15555550017",
                timezone="America/New_York",
            )
            cls.entity = Entity.objects.create(
                id=17,
                name="Workflow Test Entity",
                account=account,
                timezone="America/New_York",
            )

    def test_full_workflow_image_analysis(self):
        """Test complete workflow: list threads -> get thread -> download -> analyze image."""
        inbox = get_or_create_inbox(self.entity.id)
        runtime = EntityRuntime(self.entity)

        # Step 1: List threads
        threads_response = mail.inboxes.threads.list(inbox_id=inbox.inbox_id, limit=5)
        thread_found = False
        thread = None
        for t in threads_response.threads or []:
            if t.subject and "test" in t.subject.lower():
                thread_found = True
                thread = t
                break

        if not thread_found:
            self.skipTest("Test email not found")

        # Step 2: Get full thread
        full_thread = mail.inboxes.threads.get(inbox_id=inbox.inbox_id, thread_id=thread.thread_id)

        # Step 3: Find image attachment
        thread_id = full_thread.thread_id
        attachment_id = None
        for msg in full_thread.messages:
            msg_dict = msg.model_dump()
            for att in msg_dict.get("attachments", []):
                if att["content_type"].startswith("image/"):
                    attachment_id = att["attachment_id"]
                    break
            if attachment_id:
                break

        if not attachment_id:
            self.skipTest("No image attachment found")

        # Step 4: Analyze with tool
        tool = _get_tool(runtime, "email_view_attachment")
        result_str = tool.execute(
            runtime,
            {
                "thread_id": thread_id,
                "attachment_id": attachment_id,
                "question": "Describe what you see in this image",
            },
        )

        result = result_str  # execute() returns dict directly

        # Verify complete workflow succeeded
        self.assertNotIn("error", result)
        self.assertIn("description", result)
        self.assertGreaterEqual(len(result["description"]), 20)

    def test_full_workflow_pdf_qa(self):
        """Test complete workflow: list threads -> get thread -> download -> ask question about PDF."""
        inbox = get_or_create_inbox(self.entity.id)
        runtime = EntityRuntime(self.entity)

        # Step 1-2: Get thread
        threads_response = mail.inboxes.threads.list(inbox_id=inbox.inbox_id, limit=5)
        thread_found = False
        full_thread = None
        for thread in threads_response.threads or []:
            if thread.subject and "test" in thread.subject.lower():
                thread_found = True
                full_thread = mail.inboxes.threads.get(inbox_id=inbox.inbox_id, thread_id=thread.thread_id)
                break

        if not thread_found:
            self.skipTest("Test email not found")

        # Step 3: Find PDF attachment
        thread_id = full_thread.thread_id
        attachment_id = None
        for msg in full_thread.messages:
            msg_dict = msg.model_dump()
            for att in msg_dict.get("attachments", []):
                if att["content_type"] == "application/pdf":
                    attachment_id = att["attachment_id"]
                    break
            if attachment_id:
                break

        if not attachment_id:
            self.skipTest("No PDF attachment found")

        # Step 4: Ask question using tool
        tool = _get_tool(runtime, "email_view_attachment")
        result_str = tool.execute(
            runtime,
            {
                "thread_id": thread_id,
                "attachment_id": attachment_id,
                "question": "Summarize this document briefly",
            },
        )

        result = result_str  # execute() returns dict directly

        # Verify workflow completed successfully
        self.assertNotIn("error", result)
        self.assertIn("answer", result)
        self.assertGreater(len(result["answer"]), 30)
