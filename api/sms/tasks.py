import asyncio
import logging
import os
import subprocess
import tempfile
import time
from decimal import Decimal

import requests
from celery import shared_task
from twilio.rest import Client as TwilioClient

from api.settings import gai
from lms.accounts.models import Account
from sms.models import SMSAttachment, SMSMessage
from utils.posthog import track_cost

logger = logging.getLogger(__name__)

# Audio content types that can be transcribed
TRANSCRIBABLE_AUDIO_TYPES = {
    "audio/mp4",  # iPhone voice messages
    "audio/amr",  # Android voice messages
    "audio/aac",
    "audio/ogg",
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/3gpp",
    "audio/x-m4a",
}


def get_async_twilio_client():
    """Create an async Twilio client dynamically."""
    return TwilioClient(
        os.environ.get("TWILIO_ACCOUNT_SID"),
        os.environ.get("TWILIO_AUTH_TOKEN"),
    )


def find_account_from_phone(phone_number: str) -> Account | None:
    """Find an account by phone number, trying various formats."""
    # Try original format
    account = Account.objects.filter(account_phone=phone_number).first()
    if account:
        return account

    # Try with +1 prefix
    if not phone_number.startswith("+1"):
        account = Account.objects.filter(account_phone=f"+1{phone_number}").first()
        if account:
            return account

    # Try without +1 prefix
    if phone_number.startswith("+1"):
        account = Account.objects.filter(account_phone=phone_number[2:]).first()
        if account:
            return account

    return None


async def fetch_sms_price_async(message_id: int, async_client) -> dict | None:
    """
    Async function to fetch price for a single SMS message from Twilio.

    Args:
        message_id: ID of the SMSMessage to fetch price for
        async_client: Async Twilio client

    Returns:
        Dictionary with message_id and success status, or None if failed
    """
    try:
        message = await asyncio.to_thread(lambda: SMSMessage.objects.get(id=message_id))

        if not message.twilio_sid:
            logger.warning(f"Message {message_id} has no Twilio SID")
            return None

        # Fetch from Twilio API
        twilio_msg = await asyncio.to_thread(lambda: async_client.messages(message.twilio_sid).fetch())

        if twilio_msg.price:
            # Price is negative for outbound in Twilio API, we store absolute value
            price = abs(Decimal(str(twilio_msg.price)))

            # Find associated account and log to PostHog
            def get_account_and_log():
                # Try to find account from the phone numbers in the message
                account = None
                account_phone = None

                # For inbound, from_number is the user's phone
                # For outbound, to_number is the user's phone
                phone_to_check = message.from_number if message.direction == "inbound" else message.to_number

                account = find_account_from_phone(phone_to_check)
                if account:
                    account_phone = account.account_phone

                # Log cost to PostHog
                track_cost(
                    cost=float(price),
                    category="sms",
                    account_phone=account_phone,
                )

                # Update message with price
                SMSMessage.objects.filter(id=message_id).update(price=price, price_unit="USD")

            await asyncio.to_thread(get_account_and_log)

            logger.info(f"Updated price for message {message_id}: ${price}")
            return {"message_id": message_id, "price": float(price), "success": True}
        else:
            # No price available, set to 0
            await asyncio.to_thread(
                lambda: SMSMessage.objects.filter(id=message_id).update(price=Decimal("0.00"), price_unit="USD")
            )
            logger.info(f"No price available for message {message_id}, set to 0")
            return {"message_id": message_id, "price": 0.0, "success": True}

    except Exception as e:
        logger.error(f"Error fetching price for message {message_id}: {e}")
        await asyncio.to_thread(
            lambda: SMSMessage.objects.filter(id=message_id).update(price=Decimal("0.00"), price_unit="USD")
        )
        return {"message_id": message_id, "error": str(e), "success": False}


@shared_task
def fetch_all_sms_prices_batch(batch_size: int = 100) -> dict:
    """
    Fetch prices for all SMS messages that have a Twilio SID but no price.
    Processes messages in batches asynchronously using asyncio.gather.

    Args:
        batch_size: Number of messages to process per batch (default: 100)

    Returns:
        Dictionary with summary statistics
    """
    # Get all messages with SID but no price
    messages = list(
        SMSMessage.objects.filter(twilio_sid__isnull=False)
        .exclude(twilio_sid="")
        .filter(price__isnull=True)
        .values_list("id", flat=True)
    )

    total_messages = len(messages)
    logger.info(f"Found {total_messages} messages to fetch prices for")

    if total_messages == 0:
        return {"total": 0, "processed": 0, "successful": 0, "failed": 0, "total_cost": 0.0}

    successful = 0
    failed = 0
    total_cost = Decimal("0.00")

    # Create async Twilio client
    async_client = get_async_twilio_client()

    # Use asyncio to process messages in batches
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Process messages in batches
        for i in range(0, total_messages, batch_size):
            batch = messages[i : i + batch_size]
            batch_num = (i // batch_size) + 1
            logger.info(f"Processing batch {batch_num} ({len(batch)} messages)")

            # Create async tasks for this batch
            tasks = [fetch_sms_price_async(msg_id, async_client) for msg_id in batch]

            # Execute batch concurrently
            batch_results = loop.run_until_complete(asyncio.gather(*tasks, return_exceptions=True))

            # Process results
            for result in batch_results:
                if isinstance(result, Exception):
                    logger.error(f"Exception in batch processing: {result}")
                    failed += 1
                elif isinstance(result, dict) and result.get("success"):
                    successful += 1
                    if "price" in result:
                        total_cost += Decimal(str(result["price"]))
                else:
                    failed += 1
    finally:
        loop.close()

    logger.info(f"Completed price fetch: {successful} successful, {failed} failed, total cost: ${total_cost}")

    return {
        "total": total_messages,
        "processed": successful + failed,
        "successful": successful,
        "failed": failed,
        "total_cost": float(total_cost),
    }


def is_transcribable_audio(content_type: str) -> bool:
    """Check if the content type is a transcribable audio format."""
    # Normalize content type (remove charset, etc.)
    base_type = content_type.split(";")[0].strip().lower()
    return base_type in TRANSCRIBABLE_AUDIO_TYPES or base_type.startswith("audio/")


@shared_task(name="sms.transcribe_voice_message")
def transcribe_voice_message(attachment_id: str) -> dict:
    """
    Transcribe a voice message attachment using Gemini.

    Args:
        attachment_id: UUID of the SMSAttachment to transcribe

    Returns:
        Dictionary with transcription result
    """
    try:
        attachment = SMSAttachment.objects.get(id=attachment_id)
    except SMSAttachment.DoesNotExist:
        logger.error(f"Attachment {attachment_id} not found")
        return {"error": "Attachment not found"}

    # Skip if already transcribed
    if attachment.transcription:
        logger.info(f"Attachment {attachment_id} already transcribed")
        return {"status": "already_transcribed", "transcription": attachment.transcription}

    # Check if it's an audio file
    if not is_transcribable_audio(attachment.content_type):
        logger.info(f"Attachment {attachment_id} is not audio: {attachment.content_type}")
        return {"status": "not_audio", "content_type": attachment.content_type}

    temp_path = None
    try:
        # Download the audio file
        logger.info(f"Downloading voice message from {attachment.media_url}")

        # Handle Twilio URLs with authentication
        auth = None
        if "api.twilio.com" in attachment.media_url:
            sid = os.environ.get("TWILIO_ACCOUNT_SID")
            token = os.environ.get("TWILIO_AUTH_TOKEN")
            if sid and token:
                auth = (sid, token)

        response = requests.get(attachment.media_url, timeout=30, auth=auth)
        response.raise_for_status()

        # Determine file extension from content type
        content_type = attachment.content_type.split(";")[0].strip().lower()
        ext_map = {
            "audio/mp4": ".mp4",
            "audio/amr": ".amr",
            "audio/aac": ".aac",
            "audio/ogg": ".ogg",
            "audio/mpeg": ".mp3",
            "audio/wav": ".wav",
            "audio/webm": ".webm",
            "audio/3gpp": ".3gp",
            "audio/x-m4a": ".m4a",
        }
        ext = ext_map.get(content_type, ".mp4")

        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(response.content)
            temp_path = tmp.name

        logger.info(f"Downloaded voice message to {temp_path}")

        # Convert to MP3 for faster Gemini processing
        # (MP4/AAC files can take much longer for Gemini to process)
        mp3_path = temp_path.rsplit(".", 1)[0] + ".mp3"
        logger.info(f"Converting to MP3: {mp3_path}")
        try:
            subprocess.run(
                ["ffmpeg", "-i", temp_path, "-q:a", "9", "-y", mp3_path],
                check=True,
                capture_output=True,
            )
            upload_path = mp3_path
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.warning(f"FFmpeg conversion failed, using original file: {e}")
            upload_path = temp_path
            mp3_path = None  # Don't try to clean it up

        # Upload to Gemini and transcribe
        logger.info(f"Uploading audio to Gemini for transcription: {upload_path}")
        audio_file = gai.files.upload(file=upload_path)
        logger.info(f"Uploaded audio file: {audio_file.name}, state: {audio_file.state}")

        # Wait for the file to become ACTIVE (it may take a moment to process)
        max_wait_seconds = 60
        wait_interval = 2
        elapsed = 0
        while audio_file.state.name != "ACTIVE" and elapsed < max_wait_seconds:
            logger.info(f"Waiting for file to become ACTIVE (current state: {audio_file.state.name})...")
            time.sleep(wait_interval)
            elapsed += wait_interval
            audio_file = gai.files.get(name=audio_file.name)

        if audio_file.state.name != "ACTIVE":
            raise Exception(f"File did not become ACTIVE within {max_wait_seconds}s (state: {audio_file.state.name})")

        logger.info("File is ACTIVE, generating transcription")
        response = gai.models.generate_content(
            model="gemini-2.5-pro",
            contents=[
                audio_file,
                "Please provide a direct, word-for-word transcript of this voice message. "
                "If there are multiple speakers, identify them. Be as accurate as possible "
                "with the exact words spoken. If the audio is unclear or contains no speech, "
                "indicate that. Keep the transcription concise and accurate.",
            ],
        )

        transcription = response.text.strip() if response.text else ""
        logger.info(f"Transcribed voice message ({len(transcription)} chars): {transcription[:100]}...")

        # Save transcription to attachment
        attachment.transcription = transcription
        attachment.transcription_error = None
        attachment.save(update_fields=["transcription", "transcription_error"])

        return {"status": "success", "transcription": transcription}

    except requests.RequestException as e:
        error_msg = f"Failed to download audio: {e}"
        logger.error(f"Error transcribing attachment {attachment_id}: {error_msg}")
        attachment.transcription_error = error_msg
        attachment.save(update_fields=["transcription_error"])
        return {"error": error_msg}

    except Exception as e:
        error_msg = f"Transcription failed: {e}"
        logger.exception(f"Error transcribing attachment {attachment_id}: {error_msg}")
        attachment.transcription_error = error_msg
        attachment.save(update_fields=["transcription_error"])
        return {"error": error_msg}

    finally:
        # Clean up temp files
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
            logger.info(f"Cleaned up temp file {temp_path}")
        if "mp3_path" in dir() and mp3_path and os.path.exists(mp3_path):
            os.remove(mp3_path)
            logger.info(f"Cleaned up temp file {mp3_path}")
