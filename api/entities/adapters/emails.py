from __future__ import annotations

import base64
import logging
from datetime import UTC, datetime

import requests
from dateutil import parser as dateutil_parser
from django.utils import timezone as django_timezone

from api.settings import mail, oai
from entities.adapters import Adapter, Tool, format_time_ago, register_adapter
from utils import possibly_split
from utils.emails import get_or_create_inbox
from utils.slack import SlackChannel, send_slack_message

logger = logging.getLogger(__name__)


class ListThreadsTool(Tool):
    name = "email_list_threads"
    description = "List email threads in your inbox. Unread threads are marked with [UNREAD]. Use email_look_at_thread to read them."
    parameters = {
        "limit": {
            "type": "integer",
            "description": "Optional limit on the number of messages to return.",
        },
        "page_token": {
            "type": "string",
            "description": "Optional page token to return a specific page of messages.",
        },
    }

    def execute(self, entity_runtime, parameters):
        entity = entity_runtime.entity
        limit = parameters.get("limit", 10)
        page_token = parameters.get("page_token", None)
        # Handle cases where LLM passes "null" as a string
        if page_token in (None, "", "null"):
            page_token = None
        inbox = get_or_create_inbox(entity_runtime.entity.id)

        # Get the compare time for marking unread threads
        compare_time = entity.last_email_read_time or datetime(1970, 1, 1, tzinfo=UTC)

        try:
            threads_response = mail.inboxes.threads.list(
                inbox_id=inbox.inbox_id,
                limit=limit,
                page_token=page_token,
            )
            # Convert response to list of thread dictionaries
            # Mark threads as unread if they're newer than last_email_read_time
            threads_list = []
            for thread in threads_response.threads or []:
                thread_dict = thread.model_dump()
                # Check if thread is unread based on timestamp
                thread_timestamp = thread.timestamp
                if thread_timestamp and thread_timestamp.tzinfo is None:
                    thread_timestamp = django_timezone.make_aware(thread_timestamp)
                if compare_time.tzinfo is None:
                    compare_time = django_timezone.make_aware(compare_time)
                thread_dict["is_unread"] = thread_timestamp > compare_time if thread_timestamp else False
                threads_list.append(thread_dict)
            return {"threads": threads_list}
        except Exception as e:
            logger.error(f"Error listing email threads: {e}")
            return {"error": str(e)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"

            threads = result.get("threads", [])
            if not threads:
                return "No email threads found."

            unread_count = sum(1 for t in threads if t.get("is_unread"))
            lines = [f"EMAIL INBOX ({len(threads)} threads, {unread_count} unread)", "─" * 40]

            for thread in threads:
                thread_id = thread.get("thread_id", thread.get("id", "unknown"))
                subject = thread.get("subject", "(no subject)")
                snippet = thread.get("snippet", "")
                message_count = thread.get("message_count", 0)
                is_unread = thread.get("is_unread", False)
                timestamp = thread.get("timestamp")

                # Format timestamp as relative time
                time_str = ""
                if timestamp:
                    try:
                        if isinstance(timestamp, str):
                            ts = dateutil_parser.parse(timestamp)
                        else:
                            ts = timestamp
                        if ts.tzinfo is None:
                            ts = django_timezone.make_aware(ts)
                        seconds_ago = (django_timezone.now() - ts).total_seconds()
                        time_str = format_time_ago(seconds_ago)
                    except (ValueError, TypeError):
                        time_str = ""

                # Format senders
                senders = thread.get("senders", [])
                participant_str = ", ".join(senders[:3]) if senders else "unknown"
                if len(senders) > 3:
                    participant_str += f" +{len(senders) - 3} more"

                unread_marker = "📬 [UNREAD] " if is_unread else ""
                time_suffix = f" ({time_str})" if time_str else ""
                lines.append(f"• {unread_marker}{subject}{time_suffix}")
                lines.append(f"   thread_id: {thread_id}")
                lines.append(f"   From: {participant_str}")
                if message_count:
                    lines.append(f"   Messages: {message_count}")
                if snippet:
                    lines.append(f'   Preview: "{snippet}"')
                lines.append("")

            if unread_count > 0:
                lines.append("─" * 40)
                lines.append(f"⚠️ You have {unread_count} unread thread(s). Use email_look_at_thread to read them.")

            return "\n".join(lines)

        return str(result)


class LookAtThreadTool(Tool):
    name = "email_look_at_thread"
    description = (
        "Look at a thread in your inbox, seeing all of the messages in the thread. This marks the thread as read."
    )
    parameters = {
        "thread_id": {"type": "string", "description": "ID of the thread to look at"},
    }

    def execute(self, entity_runtime, parameters):
        thread_id = parameters.get("thread_id", None)
        if not thread_id:
            return {"error": "thread_id is required"}

        entity = entity_runtime.entity
        inbox = get_or_create_inbox(entity.id)
        try:
            thread = mail.inboxes.threads.get(
                inbox_id=inbox.inbox_id,
                thread_id=thread_id,
            )

            # Update last_email_read_time to mark this thread as read
            # Use the thread's timestamp if it's newer than current last_email_read_time
            thread_timestamp = thread.timestamp
            current_read_time = entity.last_email_read_time or datetime(1970, 1, 1, tzinfo=UTC)

            if thread_timestamp:
                if thread_timestamp.tzinfo is None:
                    thread_timestamp = django_timezone.make_aware(thread_timestamp)
                if current_read_time.tzinfo is None:
                    current_read_time = django_timezone.make_aware(current_read_time)

                # Update read time to the thread's timestamp if it's newer
                if thread_timestamp > current_read_time:
                    entity.last_email_read_time = thread_timestamp
                    entity.save(update_fields=["last_email_read_time"])

            return thread.model_dump()
        except Exception as e:
            return {"error": str(e)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"

            thread_id = result.get("thread_id", result.get("id", "unknown"))
            subject = result.get("subject", "(no subject)")
            messages = result.get("messages", [])

            lines = [
                f"EMAIL THREAD: {subject}",
                f"Thread ID: {thread_id}",
                "─" * 40,
            ]

            for i, msg in enumerate(messages, 1):
                msg_id = msg.get("message_id", msg.get("id", "unknown"))
                from_addr = msg.get("from_", msg.get("from", "unknown"))
                to_addrs = msg.get("to", [])
                date = msg.get("date", msg.get("created_at", ""))
                body = msg.get("text", msg.get("body", ""))
                attachments = msg.get("attachments", [])

                # Format date as relative time
                time_str = ""
                if date:
                    try:
                        if isinstance(date, str):
                            ts = dateutil_parser.parse(date)
                        else:
                            ts = date
                        if ts.tzinfo is None:
                            ts = django_timezone.make_aware(ts)
                        seconds_ago = (django_timezone.now() - ts).total_seconds()
                        time_str = format_time_ago(seconds_ago)
                    except (ValueError, TypeError):
                        time_str = str(date)  # Fallback to original if parsing fails

                to_str = ", ".join(to_addrs) if isinstance(to_addrs, list) else to_addrs
                lines.append(f"[Message {i}]")
                lines.append(f"   message_id: {msg_id}")
                lines.append(f"   From: {from_addr}")
                lines.append(f"   To: {to_str}")
                if time_str:
                    lines.append(f"   Sent: {time_str}")

                if attachments:
                    lines.append(f"   📎 Attachments ({len(attachments)}):")
                    lines.append(f"      (use thread_id: {thread_id} with email_view_attachment)")
                    for att in attachments:
                        att_id = att.get("attachment_id", att.get("id", "unknown"))
                        filename = att.get("filename", "unknown")
                        lines.append(f"      - {filename}")
                        lines.append(f"        attachment_id: {att_id}")

                if body:
                    lines.append(f"   Body:\n   {body}")

                lines.append("")

            return "\n".join(lines)

        return str(result)


class RespondToMessageTool(Tool):
    name = "email_respond_to_message"
    description = "Respond to a message in your inbox."
    parameters = {
        "message_id": {
            "type": "string",
            "description": "ID of the message to respond to",
        },
        "text": {"type": "string", "description": "Email body"},
        "to": {
            "type": "string",
            "description": "Email address(es) to send the reply to. If multiple, separate with commas (e.g., 'bryan@acadialearning.org, other@example.com')",
        },
    }

    def execute(self, entity_runtime, parameters):
        message_id = parameters.get("message_id", None)
        text = parameters.get("text", None)
        to = parameters.get("to", None)

        if not text or not message_id or not to:
            return {"error": "text, message_id, and to are required"}

        # Handle comma-delimited email addresses
        to = possibly_split(to)

        inbox = get_or_create_inbox(entity_runtime.entity.id)
        try:
            mail.inboxes.messages.reply(
                inbox_id=inbox.inbox_id,
                message_id=message_id,
                text=text,
                to=to,
            )

            # Send Slack notification for outbound email reply
            to_str = ", ".join(to) if isinstance(to, list) else to
            send_slack_message(
                SlackChannel.EMAIL_NOTIFICATIONS,
                f"📤 Outbound email reply from Entity {entity_runtime.entity.id}\nTo: {to_str}\nBody: {text}",
            )

            return {"success": True}
        except Exception as e:
            return {"error": str(e)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            if result.get("success"):
                return "Email reply sent successfully."

        return str(result)


class SendNewMessageTool(Tool):
    name = "email_send_new_message"
    description = "Send a new email message to a contact, creating a new thread."
    parameters = {
        "to": {
            "type": "string",
            "description": "To email address. If multiple, separate with commas.",
        },
        "subject": {"type": "string", "description": "Email subject"},
        "text": {"type": "string", "description": "Email body"},
        "cc": {
            "type": "string",
            "description": "CC email address. If multiple, separate with commas.",
        },
        "bcc": {
            "type": "string",
            "description": "BCC email address. If multiple, separate with commas.",
        },
    }

    def execute(self, entity_runtime, parameters):
        to = parameters.get("to")
        subject = parameters.get("subject")
        body = parameters.get("text")
        cc = parameters.get("cc")
        bcc = parameters.get("bcc")

        if not to or not subject or not body:
            return {"error": "to, subject, and text required"}

        to = possibly_split(to)
        cc = possibly_split(cc) if cc else None
        bcc = possibly_split(bcc) if bcc else None

        inbox = get_or_create_inbox(entity_runtime.entity.id)

        try:
            mail.inboxes.messages.send(
                inbox_id=inbox.inbox_id,
                to=to,
                subject=subject,
                text=body,
                cc=cc,
                bcc=bcc,
            )

            # Send Slack notification for outbound email
            cc_str = f", CC: {', '.join(cc)}" if cc else ""
            bcc_str = f", BCC: {', '.join(bcc)}" if bcc else ""

            send_slack_message(
                SlackChannel.EMAIL_NOTIFICATIONS,
                f"📤 Outbound email from Entity {entity_runtime.entity.id}\n"
                f"To: {', '.join(to)}{cc_str}{bcc_str}\n"
                f"Subject: {subject}\n"
                f"Body: {body}...",
            )

            return {"success": True}
        except Exception as e:
            return {"error": str(e)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                return f"Error: {result['error']}"
            if result.get("success"):
                return "Email sent successfully."

        return str(result)


class ViewEmailAttachmentTool(Tool):
    name = "email_view_attachment"
    description = """View and analyze email attachments with AI-powered Q&A capabilities using OpenAI's file handling.
    
    Supported file types:
    • Images (PNG, JPG, GIF, WebP): Full vision AI analysis with question-answering
    • Text files (TXT, MD, CSV, JSON): Content extraction with question-answering
    • PDFs: AI-powered question-answering (uses OpenAI file handling)
    • Office Documents (DOCX, XLSX, PPTX): AI-powered analysis with question-answering
    • Other files: Basic metadata only
    
    Use the 'question' parameter to ask about any supported file type. The AI will analyze the content and provide answers.
    Use the thread_id and attachment_id from the email thread.
    
    If it doesn't work initially, maybe call it again. It's finnicky."""
    parameters = {
        "thread_id": {
            "type": "string",
            "description": "ID of the thread containing the attachment",
        },
        "attachment_id": {
            "type": "string",
            "description": "ID of the attachment to view (from the message's attachments list)",
        },
        "question": {
            "type": ["string", "null"],
            "description": "Optional specific question to answer about the attachment. Works for images (vision AI) and text files (LLM analysis). Examples: 'What is shown in this image?', 'Summarize the main points', 'What percentage is mentioned?'",
        },
    }

    def execute(self, entity_runtime, parameters):
        thread_id = parameters.get("thread_id")
        attachment_id = parameters.get("attachment_id")
        question = parameters.get("question")

        if not thread_id or not attachment_id:
            return {"error": "thread_id and attachment_id are required"}

        try:
            # Use the threads API to get attachment
            # Note: AgentMail is transitioning from returning raw bytes to returning
            # JSON with download_url. Handle both cases for compatibility.
            attachment_data, content_type, filename = self._download_attachment(thread_id, attachment_id)

            # Handle different content types
            if content_type.startswith("image/"):
                # For images, use vision model to describe
                description = self._describe_image(attachment_data, content_type, question)
                return {
                    "filename": filename,
                    "content_type": content_type,
                    "type": "image",
                    "description": description,
                    "question": question,
                }

            elif content_type == "application/pdf":
                # For PDFs, use OpenAI file handling or fallback to page-by-page image analysis
                if question and question.strip():
                    answer = self._analyze_pdf(attachment_data, filename, question)
                    return {
                        "filename": filename,
                        "content_type": content_type,
                        "type": "pdf",
                        "size": len(attachment_data),
                        "question": question,
                        "answer": answer,
                    }
                else:
                    return {
                        "filename": filename,
                        "content_type": content_type,
                        "type": "pdf",
                        "size": len(attachment_data),
                        "note": "PDF downloaded. Use 'question' parameter to analyze content.",
                    }

            elif content_type.startswith("text/"):
                # For text files, return the content and optionally answer questions
                try:
                    text_content = attachment_data.decode("utf-8")

                    # If there's a question, use LLM to answer based on the text
                    if question and question.strip():
                        answer = self._answer_text_question(text_content, question)
                        return {
                            "filename": filename,
                            "content_type": content_type,
                            "type": "text",
                            "content": text_content[:5000],  # Limit to first 5000 chars
                            "question": question,
                            "answer": answer,
                        }

                    return {
                        "filename": filename,
                        "content_type": content_type,
                        "type": "text",
                        "content": text_content[:5000],  # Limit to first 5000 chars
                    }
                except UnicodeDecodeError:
                    return {
                        "filename": filename,
                        "content_type": content_type,
                        "type": "text",
                        "error": "Unable to decode text content",
                    }

            else:
                # For other document types (DOCX, XLSX, PPTX, etc.)
                if self._is_document_type(content_type) and question and question.strip():
                    answer = self._analyze_document(attachment_data, filename, content_type, question)
                    return {
                        "filename": filename,
                        "content_type": content_type,
                        "type": "document",
                        "size": len(attachment_data),
                        "question": question,
                        "answer": answer,
                    }
                else:
                    return {
                        "filename": filename,
                        "content_type": content_type,
                        "type": "other",
                        "size": len(attachment_data),
                        "note": "File downloaded. Use 'question' parameter to analyze if it's a supported document type.",
                    }

        except Exception as e:
            logger.error(f"Failed to view attachment: {str(e)}")
            return {"error": str(e)}

    def format_result(self, result):
        if isinstance(result, dict):
            if "error" in result:
                error_msg = f"Error: {result['error']}"
                if result.get("hint"):
                    error_msg += f"\nHint: {result['hint']}"
                if result.get("note"):
                    error_msg += f"\nNote: {result['note']}"
                return error_msg

            lines = ["ATTACHMENT ANALYSIS", "─" * 40]

            filename = result.get("filename", "unknown")
            file_type = result.get("type", "unknown")
            content_type = result.get("content_type", "")

            lines.append(f"File: {filename}")
            lines.append(f"Type: {file_type} ({content_type})")

            if result.get("size"):
                size_kb = result["size"] / 1024
                lines.append(f"Size: {size_kb:.1f} KB")

            if result.get("question"):
                lines.append(f"\nQuestion: {result['question']}")

            if result.get("description"):
                lines.append(f"\nDescription:\n{result['description']}")

            if result.get("answer"):
                lines.append(f"\nAnswer:\n{result['answer']}")

            if result.get("content"):
                content = result["content"]
                lines.append(f"\nContent:\n{content}")

            if result.get("note"):
                lines.append(f"\nNote: {result['note']}")

            return "\n".join(lines)

        return str(result)

    @staticmethod
    def _describe_image(image_data: bytes, content_type: str, question: str | None = None) -> str:
        """Use vision model to describe an image attachment."""
        try:
            base64_image = base64.b64encode(image_data).decode("utf-8")

            prompt = """
            Describe this image in incredible detail. A tutor is going to attempt to use
            your description of the image to answer questions, walk through it if it's an
            assignment, or review the material.

            You should include every detail in your description, especially details about
            the exact text, problems, or content of the image.
            """

            user_content = [{"type": "input_text", "text": prompt}]

            if question and question.strip():
                user_content.append({"type": "input_text", "text": f"Specific question: {question}"})

            data_uri = f"data:{content_type};base64,{base64_image}"
            user_content.append({"type": "input_image", "image_url": data_uri})

            response = oai.responses.create(
                model="o4-mini",
                input=[{"role": "user", "content": user_content}],  # type: ignore
                max_output_tokens=500,
            )

            return (response.output_text or "").strip() or "Unable to describe image"

        except Exception as e:
            logger.warning(f"Failed to describe image: {e}")
            return f"Image present but description failed: {str(e)}"

    @staticmethod
    def _answer_text_question(text_content: str, question: str) -> str:
        """Use LLM to answer a question about text content."""
        try:
            prompt = """
            Describe this text content in incredible detail. A tutor is going to attempt to use
            your description of the content to answer questions, walk through it if it's an
            assignment, or review the material.

            You should include every detail in your description, especially details about
            the exact text, problems, or content of the file.
            """

            # Build the full prompt
            full_prompt = prompt
            if question and question.strip():
                full_prompt += f"\n\nSpecific question: {question}"
            full_prompt += f"\n\nFile content:\n{text_content[:4000]}"  # Limit context

            response = oai.responses.create(
                model="o4-mini",
                input=[{"role": "user", "content": full_prompt}],
            )

            return (response.output_text or "").strip() or "Unable to answer question"

        except Exception as e:
            logger.warning(f"Failed to answer text question: {e}")
            return f"Question answering failed: {str(e)}"

    @staticmethod
    def _analyze_pdf(pdf_data: bytes, filename: str, question: str) -> str:
        """Analyze PDF using OpenAI's Responses API with base64 encoding."""
        try:
            # Encode PDF as base64
            base64_pdf = base64.b64encode(pdf_data).decode("utf-8")

            prompt = """
            Describe this PDF content in incredible detail. A tutor is going to attempt to use
            your description of the content to answer questions, walk through it if it's an
            assignment, or review the material.

            You should include every detail in your description, especially details about
            the exact text, problems, or content of the PDF.
            """

            # Build the full question text
            full_question = prompt
            if question and question.strip():
                full_question += f"\n\nSpecific question: {question}"

            # Use Responses API with input_file type
            response = oai.responses.create(
                model="o4-mini",
                input=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_file",
                                "filename": filename,
                                "file_data": f"data:application/pdf;base64,{base64_pdf}",
                            },
                            {
                                "type": "input_text",
                                "text": full_question,
                            },
                        ],
                    }
                ],
            )

            # Log response details for debugging
            output_text = getattr(response, "output_text", None)
            logger.info(f"PDF analysis response: {output_text}")
            logger.info(f"PDF analysis response type: {type(output_text)}")
            logger.info(f"PDF analysis response length: {len(output_text) if output_text else 0}")

            if not output_text or not output_text.strip():
                logger.warning(f"PDF analysis returned empty response. Response object: {response}")
                return "PDF analysis returned empty response. The PDF may be too large, corrupted, or contain unsupported content."

            return output_text.strip()

        except Exception as e:
            logger.warning(f"Failed to analyze PDF: {e}")
            return f"PDF analysis failed: {str(e)}"

    @staticmethod
    def _analyze_document(doc_data: bytes, filename: str, content_type: str, question: str) -> str:
        """Analyze document files (DOCX, XLSX, PPTX, etc.) using OpenAI's Responses API."""
        try:
            # Encode document as base64
            base64_doc = base64.b64encode(doc_data).decode("utf-8")

            prompt = """
            Describe this document content in incredible detail. A tutor is going to attempt to use
            your description of the content to answer questions, walk through it if it's an
            assignment, or review the material.

            You should include every detail in your description, especially details about
            the exact text, problems, or content of the document.
            """

            # Build the full question text
            full_question = prompt
            if question and question.strip():
                full_question += f"\n\nSpecific question: {question}"

            # Use Responses API with input_file type
            response = oai.responses.create(
                model="o4-mini",
                input=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_file",
                                "filename": filename,
                                "file_data": f"data:{content_type};base64,{base64_doc}",
                            },
                            {
                                "type": "input_text",
                                "text": full_question,
                            },
                        ],
                    }
                ],
            )

            return (response.output_text or "").strip() or "Unable to analyze document"

        except Exception as e:
            logger.warning(f"Failed to analyze document: {e}")
            return f"Document analysis failed: {str(e)}"

    @staticmethod
    def _is_document_type(content_type: str) -> bool:
        """Check if content type is a supported document format."""
        document_types = [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # XLSX
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # PPTX
            "application/msword",  # DOC
            "application/vnd.ms-excel",  # XLS
            "application/vnd.ms-powerpoint",  # PPT
        ]
        return content_type in document_types

    @staticmethod
    def _download_attachment(thread_id: str, attachment_id: str) -> tuple[bytes, str, str]:
        """Download attachment using the threads API.

        The API returns a 302 redirect to an S3 presigned URL. We extract the
        download URL from the Location header and fetch the file from there.

        Returns:
            tuple of (attachment_data, content_type, filename)
        """
        import os
        import urllib.parse

        # Make direct HTTP request without following redirects
        api_key = os.environ.get("AGENTMAIL_API_KEY")
        url = f"https://api.agentmail.to/v0/threads/{thread_id}/attachments/{attachment_id}"

        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            allow_redirects=False,
            timeout=30,
        )

        if response.status_code == 302:
            # API returns 302 redirect to S3 presigned URL
            download_url = response.headers.get("location")
            if not download_url:
                raise ValueError("No redirect location in 302 response")

            # Extract filename from content-disposition in URL if present
            filename = "unknown"
            parsed = urllib.parse.urlparse(download_url)
            query_params = urllib.parse.parse_qs(parsed.query)
            if "response-content-disposition" in query_params:
                disposition = query_params["response-content-disposition"][0]
                if "filename=" in disposition:
                    # Parse filename="something.ext" - handle quoted filenames
                    import re

                    # Try quoted filename first
                    match = re.search(r'filename="([^"]+)"', disposition)
                    if match:
                        filename = match.group(1)
                    else:
                        # Try unquoted filename
                        match = re.search(r"filename=([^;\s]+)", disposition)
                        if match:
                            filename = match.group(1)

            # Download the actual file
            download_response = requests.get(download_url, timeout=60)
            download_response.raise_for_status()
            attachment_data = download_response.content

            # Get content type from the download response
            content_type = download_response.headers.get("content-type", "application/octet-stream")

            return attachment_data, content_type, filename

        elif response.status_code == 200:
            # API might return JSON with download_url (future behavior)
            try:
                data = response.json()
                download_url = data.get("download_url")
                filename = data.get("filename", "unknown")
                content_type_hint = data.get("content_type", "application/octet-stream")

                if download_url:
                    download_response = requests.get(download_url, timeout=60)
                    download_response.raise_for_status()
                    content_type = download_response.headers.get("content-type", content_type_hint)
                    return download_response.content, content_type, filename
            except Exception:
                pass

            raise ValueError("Unexpected 200 response format")

        else:
            response.raise_for_status()
            raise ValueError(f"Unexpected status code: {response.status_code}")


@register_adapter
class EmailAdapter(Adapter):
    name = "email"
    description = """Allows you to send and read email messages.
    Having access to this means great responsibility. Do not spam people,
    do not send unsolicited messages, and be very careful about who you email
    and when.

    Match the tone of the messages for the person you're emailing. If they're a parent
    or professional contact, be more formal. If they're a student or casual contact,
    you can be more relaxed.

    Always use appropriate subject lines and professional email formatting.
    
    When viewing email threads, check for attachments. If present, use the email_view_attachment
    tool to analyze them, especially for images or documents that might contain important information.
    """
    tools = [
        ListThreadsTool(),
        LookAtThreadTool(),
        RespondToMessageTool(),
        SendNewMessageTool(),
        ViewEmailAttachmentTool(),
    ]

    def detail(self, entity_runtime) -> str:
        previews = entity_runtime.entity.has_unread_emails()
        detail = f"Your email address is 'acadia-{entity_runtime.id}@tutor.acadialearning.org'."
        if len(previews) == 0:
            detail += " You have no unread emails."
        else:
            detail += f" You have {len(previews)} unread emails."
        return detail
