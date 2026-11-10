"""
Simplified audio streaming from LiveKit to Deepgram Flux.

Replaces VAD and smart-turn logic with direct streaming.
Deepgram Flux handles all turn detection and speech recognition.
"""

import asyncio
import logging
import os
from typing import Callable, Optional

import numpy as np
from deepgram import AsyncDeepgramClient
from deepgram.core.events import EventType
from deepgram.extensions.types.sockets import ListenV2TurnInfoEvent
from livekit.rtc import AudioStream, RemoteTrack, RemoteTrackPublication, Room, TrackKind

# Configuration
RATE = 16000  # 16 kHz for Deepgram Flux
CHUNK_SAMPLES = 1280  # ~80ms at 16kHz (2560 bytes for int16)
PRE_BUFFER_SECONDS = 0.5  # Keep 500ms of audio before StartOfTurn
PRE_BUFFER_SAMPLES = int(RATE * PRE_BUFFER_SECONDS)  # 8000 samples
CONTINUOUS_BUFFER_SECONDS = 300  # 5 minutes of continuous audio for engagement coach
CONTINUOUS_BUFFER_SAMPLES = int(RATE * CONTINUOUS_BUFFER_SECONDS)


logger = logging.getLogger(__name__)


class AudioStreamer:
    """Streams LiveKit audio to Deepgram Flux in real-time."""

    def __init__(
        self,
        room: Room,
        on_transcript: Callable[[str], None],
        deepgram_connection=None,
    ):
        """
        Initialize audio streamer.

        Args:
            room: LiveKit Room instance
            on_transcript: Callback when transcript is received
            deepgram_connection: Deepgram Flux async connection (optional)
        """
        self.room = room
        self.deepgram_connection = deepgram_connection
        self.on_transcript = on_transcript
        self.track: Optional[RemoteTrack] = None

        # State
        self.audio_buffer = np.array([], dtype=np.float32)
        self._running = False
        self._task: Optional[asyncio.Task] = None

        # Rolling pre-buffer to capture audio before StartOfTurn fires
        # This solves the race condition where the chunk that triggers Deepgram's
        # StartOfTurn has already been sent before we start buffering
        self._pre_buffer = np.array([], dtype=np.float32)

        # Speech buffering for capturing user audio
        self._speech_buffer = np.array([], dtype=np.float32)
        self._is_speech_active = False

        # Continuous rolling buffer for engagement coach (5 minutes of all audio)
        self._continuous_buffer = np.array([], dtype=np.float32)

    def start_speech_buffer(self):
        """Start buffering audio for current speech segment.

        Includes the pre-buffer audio that was captured before StartOfTurn fired,
        ensuring we don't miss the initial speech that triggered the detection.
        """
        # Start with pre-buffer contents (audio before StartOfTurn)
        self._speech_buffer = self._pre_buffer.copy()
        self._is_speech_active = True
        pre_buffer_ms = int(len(self._pre_buffer) / RATE * 1000)
        logger.debug(f"Audio: Started speech buffering with {pre_buffer_ms}ms pre-buffer")

    def stop_speech_buffer(self) -> bytes:
        """Stop buffering and return audio as WAV bytes."""
        self._is_speech_active = False
        audio_data = self._speech_buffer
        self._speech_buffer = np.array([], dtype=np.float32)

        if len(audio_data) == 0:
            return b""

        # Convert to int16 and create WAV bytes
        import io
        import wave

        audio_int16 = (audio_data * 32768.0).astype(np.int16)

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(RATE)
            wav_file.writeframes(audio_int16.tobytes())

        duration_ms = int(len(audio_data) / RATE * 1000)
        logger.debug(f"Audio: Stopped speech buffering, captured {duration_ms}ms")
        return wav_buffer.getvalue()

    def get_continuous_audio_wav(self) -> bytes:
        """Get the continuous audio buffer as WAV bytes.

        Returns the last CONTINUOUS_BUFFER_SECONDS of all audio (not just speech)
        for engagement analysis.
        """
        if len(self._continuous_buffer) == 0:
            return b""

        import io
        import wave

        # Convert float32 to int16
        audio_int16 = (self._continuous_buffer * 32768.0).astype(np.int16)

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(RATE)
            wav_file.writeframes(audio_int16.tobytes())

        duration_s = len(self._continuous_buffer) / RATE
        logger.debug(f"Audio: Returning {duration_s:.1f}s of continuous audio")
        return wav_buffer.getvalue()

    def start(self):
        """Start listening for audio from LiveKit track."""

        @self.room.on("track_published")
        def on_track_published(publication: RemoteTrackPublication, participant):
            logger.info(f"Audio: Track published from {participant.identity}, kind={publication.kind}")
            if publication.kind == TrackKind.KIND_AUDIO:
                publication.set_subscribed(True)
                logger.info(f"Audio: Subscribed to audio track from {participant.identity}")

        @self.room.on("track_subscribed")
        def on_track_subscribed(track: RemoteTrack, publication: RemoteTrackPublication, participant):
            logger.info(f"Audio: Track subscribed from {participant.identity}, kind={track.kind}")
            if track.kind == TrackKind.KIND_AUDIO:
                self.track = track
                logger.info(f"Audio: Starting audio processing for {participant.identity}")
                if not self._running:
                    self._task = asyncio.create_task(self._process_audio())

        @self.room.on("track_unpublished")
        def on_track_unpublished(publication: RemoteTrackPublication, participant):
            logger.info(f"Audio: Track unpublished from {participant.identity}, kind={publication.kind}")
            if publication.kind == TrackKind.KIND_AUDIO:
                self.track = None
                self._running = False

        # Look for existing audio tracks as a fallback
        for p in self.room.remote_participants.values():
            for pub in p.track_publications.values():
                if pub.track and pub.track.kind == TrackKind.KIND_AUDIO:
                    pub.set_subscribed(True)
                    self.track = pub.track
                    logger.info(f"Audio: Found existing audio track from {p.identity}")
                    # Start audio stream only after subscription is set
                    if not self._running:
                        self._task = asyncio.create_task(self._process_audio())
                    break

    async def _process_audio(self):
        """Main audio processing loop - stream to Deepgram."""
        if not self.track:
            logger.warning("Audio: _process_audio called but no track available")
            return

        self._running = True
        logger.info(f"Audio: Starting audio processing loop for track {self.track.sid}")

        # Small delay to ensure track subscription is fully initialized by LiveKit's FFI layer
        await asyncio.sleep(0.05)

        stream = AudioStream(self.track)
        frame_count = 0

        try:
            async for event in stream:
                if not self._running:
                    logger.info("Audio: Stopping audio processing (not running)")
                    break

                frame_count += 1
                if frame_count == 1:
                    logger.debug("Audio: First audio frame received")

                # Convert to 16kHz float32
                audio_data = self._convert_frame(event.frame)

                # Always maintain rolling pre-buffer for speech onset capture
                # This ensures we have audio from before StartOfTurn fires
                self._pre_buffer = np.concatenate([self._pre_buffer, audio_data])
                if len(self._pre_buffer) > PRE_BUFFER_SAMPLES:
                    self._pre_buffer = self._pre_buffer[-PRE_BUFFER_SAMPLES:]

                # Buffer for speech capture if active
                if self._is_speech_active:
                    self._speech_buffer = np.concatenate([self._speech_buffer, audio_data])

                # Maintain continuous buffer for engagement coach (all audio, not just speech)
                self._continuous_buffer = np.concatenate([self._continuous_buffer, audio_data])
                if len(self._continuous_buffer) > CONTINUOUS_BUFFER_SAMPLES:
                    self._continuous_buffer = self._continuous_buffer[-CONTINUOUS_BUFFER_SAMPLES:]

                # Buffer and send in ~80ms chunks
                self.audio_buffer = np.concatenate([self.audio_buffer, audio_data])
                while len(self.audio_buffer) >= CHUNK_SAMPLES:
                    chunk = self.audio_buffer[:CHUNK_SAMPLES]
                    self.audio_buffer = self.audio_buffer[CHUNK_SAMPLES:]

                    # Send directly to Deepgram (all audio, no filtering)
                    await self._send_to_deepgram(chunk)

        except Exception as e:
            logger.exception(f"Audio: Processing error: {e}")
        finally:
            await stream.aclose()
            self._running = False
            logger.info(f"Audio: Stopped audio processing. Processed {frame_count} frames")

    def _convert_frame(self, frame) -> np.ndarray:
        """Convert LiveKit frame to 16kHz float32."""
        raw_data = bytes(frame.data)
        audio_np = np.frombuffer(raw_data, dtype=np.int16)
        audio_f32 = audio_np.astype(np.float32) / 32768.0

        # Downsample 48kHz → 16kHz if needed
        if frame.sample_rate != RATE:
            downsample_factor = frame.sample_rate // RATE
            audio_f32 = audio_f32[::downsample_factor]

        return audio_f32

    async def _send_to_deepgram(self, chunk: np.ndarray):
        """Send audio chunk to Deepgram Flux."""
        if self.deepgram_connection:
            try:
                # Convert float32 to int16 bytes
                chunk_int16 = (chunk * 32768.0).astype(np.int16)
                audio_bytes = chunk_int16.tobytes()
                await self.deepgram_connection._send(audio_bytes)
            except Exception:
                # Connection error - will be handled by DeepgramFluxManager reconnection
                # Don't log here to avoid spam, the reconnection handler will log
                pass

    async def cleanup(self):
        """Clean up resources."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


class DeepgramFluxManager:
    """
    Manages the Deepgram Flux ASR connection and integrates with an Agent and AudioStreamer.

    Usage:
        dg_flux = DeepgramFluxManager(ctx, agent)
        await dg_flux.start()
        # ...
        await dg_flux.cleanup()
    """

    # Reconnection settings
    MAX_RECONNECT_ATTEMPTS = 5
    RECONNECT_DELAY_BASE = 1.0  # seconds, doubles each attempt

    def __init__(self, ctx, agent):
        self.ctx = ctx
        self.agent = agent
        self.deepgram_connection = None
        self.deepgram_conn_ctx = None
        self.deepgram_listen_task = None
        self.vad = None
        self._closed = False
        self._reconnecting = False
        self._reconnect_attempts = 0

        deepgram_api_key = os.environ.get("DEEPGRAM_API_KEY")
        if not deepgram_api_key:
            msg = "DEEPGRAM_API_KEY environment variable is required"
            logger.error(msg)
            raise RuntimeError(msg)

        self.deepgram_client = AsyncDeepgramClient(api_key=deepgram_api_key)
        self.EventType = EventType

    def _create_connection_context(self):
        """Create a new Deepgram connection context."""
        return self.deepgram_client.listen.v2.connect(
            model="flux-general-en",
            encoding="linear16",
            sample_rate=str(RATE),
            eot_threshold="0.7",
            eager_eot_threshold="0.45",
            eot_timeout_ms="6000",
        )

    async def start(self):
        """Establish Deepgram connection and wire everything up."""
        # Create initial connection context
        self.deepgram_conn_ctx = self._create_connection_context()

        # Enter the context manager to get the actual connection
        self.deepgram_connection = await self.deepgram_conn_ctx.__aenter__()

        # Wire up event handlers
        self._setup_deepgram_handlers()

        # Start Deepgram listening
        self.deepgram_listen_task = asyncio.create_task(self._run_deepgram_listener())

        # Audio Streamer - connects LiveKit audio to Deepgram
        from agent.vad import AudioStreamer

        self.vad = AudioStreamer(
            room=self.ctx.room,
            on_transcript=self.agent.on_user_speech,
            deepgram_connection=self.deepgram_connection,
        )
        self.vad.start()

    def _setup_deepgram_handlers(self):
        """Set up event handlers on the Deepgram connection."""

        async def on_deepgram_message(message: ListenV2TurnInfoEvent) -> None:
            event = getattr(message, "event", None)
            transcript = getattr(message, "transcript", None)

            # Send interim transcript updates to frontend (for real-time display)
            if transcript and transcript.strip() and event != "EndOfTurn":
                self.agent.on_interim_transcript(transcript)

            # Interrupt agent on speech start
            if event == "StartOfTurn":
                logger.info(f"[Deepgram] StartOfTurn: {transcript!r}")
                # Ignore spurious "Hey," transcript
                if transcript and transcript.strip() == "Hey,":
                    logger.debug("[Deepgram] Ignoring spurious 'Hey,' interrupt")
                else:
                    # Start buffering audio for this speech segment
                    if self.vad:
                        self.vad.start_speech_buffer()
                    self.agent.on_speech_start()
            # Send transcript to agent on speech end
            if event == "EndOfTurn":
                logger.info(f"[Deepgram] EndOfTurn: {transcript!r}")
                # Get buffered audio
                audio_data = self.vad.stop_speech_buffer() if self.vad else b""

                if transcript and transcript.strip():
                    self.agent.on_user_speech(transcript, audio_data=audio_data)
                else:
                    logger.debug("[Deepgram] EndOfTurn with empty transcript - resetting state")
                    self.agent.on_speech_cancelled()

        def on_deepgram_error(err):
            """Log Deepgram errors (reconnection handled by listener loop)."""
            logger.error(f"[Deepgram] Error: {err}")

        def on_deepgram_close(_, reason=None):
            """Log connection close (reconnection handled by listener loop)."""
            logger.warning(f"[Deepgram] Connection closed: {reason}")

        self.deepgram_connection.on(self.EventType.MESSAGE, on_deepgram_message)
        self.deepgram_connection.on(self.EventType.ERROR, on_deepgram_error)
        self.deepgram_connection.on(self.EventType.CLOSE, on_deepgram_close)

    async def _run_deepgram_listener(self):
        """Run the Deepgram listener with automatic reconnection on failure."""
        logger.info("[Deepgram] Connection opened")

        while not self._closed:
            try:
                await self.deepgram_connection.start_listening()
                # If start_listening returns normally, connection closed gracefully
                if not self._closed:
                    logger.warning("[Deepgram] Listener ended unexpectedly")
                break
            except asyncio.CancelledError:
                logger.debug("[Deepgram] Listener cancelled")
                break
            except Exception as e:
                error_str = str(e)
                # Only reconnect for actual Deepgram/websocket errors
                if any(keyword in error_str.lower() for keyword in ["websocket", "connection", "timeout", "closed"]):
                    logger.error(f"[Deepgram] Connection error: {e}")
                    if not self._closed:
                        await self._reconnect()
                        if self._reconnect_attempts <= self.MAX_RECONNECT_ATTEMPTS:
                            continue  # Try again with new connection
                else:
                    # Non-connection error, just log and break
                    logger.error(f"[Deepgram] Unexpected error (not reconnecting): {e}")
                break

    async def _reconnect(self):
        """Attempt to reconnect to Deepgram with exponential backoff."""
        if self._closed or self._reconnecting:
            return

        self._reconnecting = True
        self._reconnect_attempts += 1

        if self._reconnect_attempts > self.MAX_RECONNECT_ATTEMPTS:
            logger.error(f"[Deepgram] Max reconnection attempts ({self.MAX_RECONNECT_ATTEMPTS}) exceeded")
            self._reconnecting = False
            return

        delay = self.RECONNECT_DELAY_BASE * (2 ** (self._reconnect_attempts - 1))
        logger.info(
            f"[Deepgram] Reconnecting in {delay:.1f}s (attempt {self._reconnect_attempts}/{self.MAX_RECONNECT_ATTEMPTS})"
        )

        await asyncio.sleep(delay)

        try:
            # Clean up old connection
            if self.deepgram_conn_ctx:
                try:
                    await self.deepgram_conn_ctx.__aexit__(None, None, None)
                except Exception as e:
                    logger.debug(f"[Deepgram] Error closing old connection: {e}")

            # Create new connection
            self.deepgram_conn_ctx = self._create_connection_context()
            self.deepgram_connection = await self.deepgram_conn_ctx.__aenter__()

            # Re-wire event handlers
            self._setup_deepgram_handlers()

            # Update the AudioStreamer's connection reference
            if self.vad:
                self.vad.deepgram_connection = self.deepgram_connection

            logger.info("[Deepgram] Reconnected successfully")

        except Exception as e:
            logger.error(f"[Deepgram] Reconnection failed: {e}")

        finally:
            self._reconnecting = False

    async def cleanup(self):
        """Clean up Deepgram connection and audio streamer."""
        if self._closed:
            return
        self._closed = True

        if self.vad:
            await self.vad.cleanup()

        if self.deepgram_listen_task:
            self.deepgram_listen_task.cancel()
            try:
                await self.deepgram_listen_task
            except asyncio.CancelledError:
                pass

        if self.deepgram_conn_ctx:
            await self.deepgram_conn_ctx.__aexit__(None, None, None)
