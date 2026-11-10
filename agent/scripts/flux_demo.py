"""Deepgram Flux streaming demo.

Real-time conversational speech recognition with microphone input.
Prints only EndOfTurn events with full transcripts.

Prerequisites:
- Environment variable `DEEPGRAM_API_KEY` (or in `.env` file).
- `portaudio` (system library) for microphone access.
- Dependencies: `deepgram-sdk`, `python-dotenv`, `sounddevice` (install with uv/pip).
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import suppress

import sounddevice as sd
from deepgram import AsyncDeepgramClient
from deepgram.core.events import EventType
from dotenv import load_dotenv

# Configure logging - INFO only
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
CHUNK_DURATION_SECONDS = 0.08
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_DURATION_SECONDS)


def ensure_api_key() -> str:
    load_dotenv()
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPGRAM_API_KEY not set. Create a .env with your key or set it in the environment.")
    return api_key


async def stream_audio_to_flux() -> None:
    api_key = ensure_api_key()
    client = AsyncDeepgramClient(api_key=api_key)

    async with client.listen.v2.connect(
        model="flux-general-en",
        encoding="linear16",
        sample_rate=str(SAMPLE_RATE),
        eot_threshold="0.7",
        eager_eot_threshold="0.45",
        eot_timeout_ms="6000",
    ) as connection:

        async def on_message(message) -> None:
            msg_type = type(message).__name__

            # Only log EndOfTurn events
            if msg_type == "ListenV2TurnInfoEvent":
                event = getattr(message, "event", None)

                if event in ("EndOfTurn", "EagerEndOfTurn"):
                    transcript = getattr(message, "transcript", "")
                    confidence = getattr(message, "end_of_turn_confidence", 0)
                    logger.info(f"[{event}] {transcript} (confidence: {confidence:.3f})")

        connection.on(EventType.MESSAGE, on_message)
        connection.on(EventType.OPEN, lambda _: logger.info("🎙️ Listening... (Ctrl+C to stop)\n"))
        connection.on(EventType.CLOSE, lambda _: logger.info("\n✓ Stopped"))
        connection.on(EventType.ERROR, lambda error: logger.error(f"❌ Error: {error}\n"))

        audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=8)
        stop_event = asyncio.Event()
        loop = asyncio.get_running_loop()

        def audio_callback(indata, frames, time_info, status) -> None:
            if status:
                logger.warning(f"Microphone: {status}")

            chunk = bytes(indata)

            def enqueue() -> None:
                if stop_event.is_set():
                    return
                if audio_queue.full():
                    audio_queue.get_nowait()
                audio_queue.put_nowait(chunk)

            loop.call_soon_threadsafe(enqueue)

        async def pump_audio() -> None:
            try:
                with sd.RawInputStream(
                    samplerate=SAMPLE_RATE,
                    channels=1,
                    dtype="int16",
                    blocksize=CHUNK_SAMPLES,
                    callback=audio_callback,
                ):
                    while not stop_event.is_set():
                        chunk = await audio_queue.get()
                        await connection._send(chunk)
            except sd.PortAudioError as exc:
                logger.error("Microphone unavailable or permission denied")
                raise RuntimeError("Microphone unavailable") from exc
            finally:
                stop_event.set()

        listen_task = asyncio.create_task(connection.start_listening())
        pump_task = asyncio.create_task(pump_audio())

        try:
            await listen_task
        finally:
            stop_event.set()
            for task in (pump_task, listen_task):
                if not task.done():
                    task.cancel()
            with suppress(asyncio.CancelledError):
                await asyncio.gather(pump_task, listen_task, return_exceptions=True)


def main() -> None:
    try:
        asyncio.run(stream_audio_to_flux())
    except KeyboardInterrupt:
        logger.info("Stopped.")


if __name__ == "__main__":
    main()
