import asyncio
import os
import time
from contextlib import suppress
from typing import Optional

from livekit.agents import JobContext
from livekit.agents.tts.tts import SynthesizeStream
from livekit.rtc import AudioFrame, AudioSource, LocalAudioTrack, TrackPublishOptions, TrackSource

from agent.tts import TTSConfig, TTSProvider, create_tts_provider


class Voice:
    """
    Simple TTS wrapper.
    Plays audio and supports interruption.
    No state management - just audio in/out.
    """

    def __init__(self, ctx: JobContext, voice_id: str):
        self.ctx = ctx

        # Parse provider from voice_id format: "provider/id" or just "id" (defaults to elevenlabs)
        # Examples:
        #   "cartesia/f786b574-daa5-4673-aa0c-cbe3e8534c02" -> cartesia provider
        #   "elevenlabs/UgBBYS2sOqTuMpoF3BR0" -> elevenlabs provider
        #   "UgBBYS2sOqTuMpoF3BR0" -> elevenlabs provider (backward compatible)
        tts_provider, tts_voice_id = self._parse_voice_id(voice_id)

        # Get provider-specific model from environment (e.g., CARTESIA_MODEL, ELEVENLABS_MODEL)
        # Falls back to TTS_MODEL for backward compatibility, but only if it matches the provider
        tts_model = os.environ.get(f"{tts_provider.upper()}_MODEL")
        if tts_model is None:
            # Don't use TTS_MODEL as fallback - let provider use its default
            # This prevents using a Cartesia model name with ElevenLabs or vice versa
            pass

        self.voice_id = tts_voice_id
        self.tts_provider_name = tts_provider

        # Create TTS provider using the abstraction
        config = TTSConfig(
            voice_id=tts_voice_id,
            model=tts_model,
            enable_ssml=True,
        )
        self._provider: TTSProvider = create_tts_provider(tts_provider, config)

        print(
            f"TTS provider: {tts_provider}, sample_rate: {self._provider.sample_rate}, num_channels: {self._provider.num_channels}"
        )
        self.source = AudioSource(self._provider.sample_rate, self._provider.num_channels)
        self.track = LocalAudioTrack.create_audio_track("agent-mic", self.source)
        self.options = TrackPublishOptions(source=TrackSource.SOURCE_MICROPHONE)
        self.playout_queue: asyncio.Queue[Optional[AudioFrame]] = asyncio.Queue()
        self.is_playing = False
        self._active_stream_session: "VoiceStreamSession | None" = None

    @staticmethod
    def _parse_voice_id(voice_id: str) -> tuple[str, str]:
        """
        Parse voice_id to extract provider and actual voice ID.

        Format: "provider/voice_id" or just "voice_id"
        Supported providers: elevenlabs, cartesia
        Default provider (no prefix): elevenlabs

        Returns:
            tuple of (provider_name, voice_id)
        """
        supported_providers = {"elevenlabs", "cartesia"}

        if "/" in voice_id:
            parts = voice_id.split("/", 1)
            provider = parts[0].lower()
            actual_id = parts[1]

            if provider in supported_providers:
                return provider, actual_id
            else:
                # Unknown provider prefix, treat whole thing as voice ID
                print(f"Unknown TTS provider prefix '{provider}', defaulting to elevenlabs")
                return "elevenlabs", voice_id
        else:
            # No prefix, default to elevenlabs for backward compatibility
            return "elevenlabs", voice_id

    async def start(self):
        """Initialize and publish audio track."""
        await self.ctx.room.local_participant.publish_track(self.track, self.options)
        asyncio.create_task(self._playout_loop())

        async def _handle_voice_change(reader, participant_identity: str):
            """Process voice change message."""
            from livekit.rtc import TextStreamReader

            if not isinstance(reader, TextStreamReader):
                return
            voice_id = await reader.read_all()
            print(f"Voice change request from {participant_identity}: {voice_id}")
            self.change_voice(voice_id)

        def handle_voice_change(reader, participant_identity: str):
            """Handle incoming voice change messages from users."""
            asyncio.create_task(_handle_voice_change(reader, participant_identity))

        self.ctx.room.register_text_stream_handler("voice", handle_voice_change)

    async def _playout_loop(self):
        """Background loop that plays audio frames."""
        first_frame = True
        while True:
            frame = await self.playout_queue.get()
            if frame is None:
                # Marker for end of utterance
                self.is_playing = False
                self.playout_queue.task_done()
                first_frame = True  # Reset for next utterance
                continue

            # Check if interrupted
            if not self.is_playing:
                self.playout_queue.task_done()
                continue

            # Debug: log frame properties on first frame
            if first_frame:
                print(
                    f"Frame properties: sample_rate={frame.sample_rate}, num_channels={frame.num_channels}, samples_per_channel={frame.samples_per_channel}"
                )
                print(
                    f"AudioSource expects: sample_rate={self.source.sample_rate}, num_channels={self.source.num_channels}"
                )
                first_frame = False

            await self.source.capture_frame(frame)
            self.playout_queue.task_done()

    async def speak(self, text: str) -> bool:
        """
        Speak a message aloud.
        Blocks until audio finishes playing (or is interrupted).

        Returns:
            True if speech completed fully, False if interrupted
        """
        import time

        speak_start = time.time()
        self.is_playing = True
        was_interrupted = False

        try:
            # Generate audio directly (no SSML formatting)
            synth_start = time.time()
            stream = self._provider.synthesize(text=text)
            chunk_count = 0
            first_chunk_time = None
            async for chunk in stream:
                if chunk_count == 0:
                    first_chunk_time = time.time()
                    print(f"⏱️ [{int((first_chunk_time - synth_start) * 1000)}ms] First audio chunk received")
                chunk_count += 1

                if not self.is_playing:
                    print(
                        "⏱️ ["
                        f"{int((time.time() - speak_start) * 1000)}"
                        "ms] 🛑🛑🛑 ACTUAL INTERRUPT DETECTED 🛑🛑🛑 Speech interrupted (after "
                        f"{chunk_count}"
                        " chunks)"
                    )
                    was_interrupted = True
                    break
                await self.playout_queue.put(chunk.frame)

            if not was_interrupted:
                print(f"⏱️ [{int((time.time() - synth_start) * 1000)}ms] All {chunk_count} audio chunks generated")

            # Mark end of utterance
            await self.playout_queue.put(None)

            # Wait for playout to finish
            playout_start = time.time()
            if not was_interrupted:
                await self.playout_queue.join()
                print(f"⏱️ [{int((time.time() - playout_start) * 1000)}ms] Playout complete")
                # Add delay before state change to account for audio buffer latency
                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            self.is_playing = False
            was_interrupted = True
            raise
        except Exception as e:
            print(f"TTS error: {e}")
            self.is_playing = False
        finally:
            self.is_playing = False

        print(f"⏱️ [{int((time.time() - speak_start) * 1000)}ms] speak() total (interrupted={was_interrupted})")
        return not was_interrupted

    async def start_stream_session(self) -> "VoiceStreamSession":
        """Start a streaming TTS session, cancelling any existing one."""

        if self._active_stream_session is not None:
            await self._active_stream_session.cancel()
            self._active_stream_session = None

        session = await VoiceStreamSession.create(self)
        self._active_stream_session = session
        return session

    def interrupt(self):
        """Stop current speech and clear queue."""
        self.is_playing = False
        if self._active_stream_session is not None:
            asyncio.create_task(self._active_stream_session.cancel())
            self._active_stream_session = None
        # Clear queue
        while not self.playout_queue.empty():
            try:
                self.playout_queue.get_nowait()
                self.playout_queue.task_done()
            except asyncio.QueueEmpty:
                break

    def change_voice(self, voice_id: str):
        """Change the voice (and optionally provider) of the TTS."""
        new_provider, new_voice_id = self._parse_voice_id(voice_id)
        print(f"Changing voice to {new_voice_id} (provider: {new_provider})")

        if new_provider != self.tts_provider_name:
            # Provider changed, need to recreate the provider
            print(f"Switching TTS provider from {self.tts_provider_name} to {new_provider}")
            old_sample_rate = self._provider.sample_rate

            self.tts_provider_name = new_provider
            tts_model = os.environ.get(f"{new_provider.upper()}_MODEL")
            # Use the same sample rate as the existing AudioSource to ensure compatibility
            config = TTSConfig(
                voice_id=new_voice_id,
                model=tts_model,
                enable_ssml=True,
                sample_rate=old_sample_rate,
            )
            self._provider = create_tts_provider(new_provider, config)

            # Verify the new provider matches AudioSource configuration
            if self._provider.sample_rate != self.source.sample_rate:
                print(
                    f"WARNING: TTS sample rate mismatch! Provider: {self._provider.sample_rate}, "
                    f"AudioSource: {self.source.sample_rate}. Audio may not play correctly."
                )
            if self._provider.num_channels != self.source.num_channels:
                print(
                    f"WARNING: TTS channel count mismatch! Provider: {self._provider.num_channels}, "
                    f"AudioSource: {self.source.num_channels}. Audio may not play correctly."
                )
        else:
            # Same provider, just update the voice
            self._provider.update_voice(new_voice_id)

        self.voice_id = new_voice_id


class VoiceStreamSession:
    """Manage a streaming TTS session for the voice."""

    def __init__(self, voice: Voice, stream_cm: SynthesizeStream, stream: SynthesizeStream):
        self.voice = voice
        self._stream_cm = stream_cm
        self._stream = stream
        self._drain_task: asyncio.Task | None = None
        self._finish_event = asyncio.Event()
        self._closed = False
        self._interrupted = False
        self._chunk_count = 0
        self._first_chunk_time: float | None = None
        self._start_time = time.time()

    @classmethod
    async def create(cls, voice: Voice) -> "VoiceStreamSession":
        stream_cm = voice._provider.stream()
        stream = await stream_cm.__aenter__()
        session = cls(voice, stream_cm, stream)
        session.voice.is_playing = True
        session._drain_task = asyncio.create_task(session._drain(), name="voice-stream-drain")
        return session

    async def _drain(self):
        try:
            async for audio in self._stream:
                if not self.voice.is_playing:
                    self._interrupted = True
                    break

                if audio.frame is None:
                    continue

                if self._chunk_count == 0:
                    self._first_chunk_time = time.time()
                    print(f"⏱️ [{int((self._first_chunk_time - self._start_time) * 1000)}ms] First audio chunk received")

                self._chunk_count += 1

                await self.voice.playout_queue.put(audio.frame)

                if audio.is_final:
                    break

        except asyncio.CancelledError:
            self._interrupted = True
            raise
        except Exception as e:  # noqa: BLE001
            self._interrupted = True
            print(f"TTS stream error: {e}")
        finally:
            await self.voice.playout_queue.put(None)
            self._finish_event.set()

    def push_text(self, text: str):
        if self._closed or self._interrupted:
            return
        if not text:
            return
        self._stream.push_text(text)

    def flush(self):
        if self._closed or self._interrupted:
            return
        self._stream.flush()

    async def finish(self) -> bool:
        if self._closed:
            return not self._interrupted

        self._stream.end_input()

        await self._finish_event.wait()

        if self._drain_task is not None:
            with suppress(Exception):
                await self._drain_task

        await self.voice.playout_queue.join()

        if not self._interrupted and self._chunk_count:
            print(
                f"⏱️ [{int((time.time() - self._start_time) * 1000)}ms] All {self._chunk_count} audio chunks generated"
            )
            print(f"⏱️ [{int((time.time() - self._start_time) * 1000)}ms] Playout complete")

        await asyncio.sleep(0.5)

        self.voice.is_playing = False

        await self._close_stream()
        self.voice._active_stream_session = None

        print(f"⏱️ [{int((time.time() - self._start_time) * 1000)}ms] speak() total (interrupted={self._interrupted})")

        return not self._interrupted

    async def cancel(self):
        if self._closed:
            return

        self._interrupted = True
        self.voice.is_playing = False

        self.voice._active_stream_session = None

        with suppress(Exception):
            await self._stream.aclose()

        if self._drain_task is not None:
            self._drain_task.cancel()
            with suppress(Exception):
                await self._drain_task

        if not self._finish_event.is_set():
            await self.voice.playout_queue.put(None)
            self._finish_event.set()

        await self._close_stream()

    async def _close_stream(self):
        if self._closed:
            return

        with suppress(Exception):
            await self._stream_cm.__aexit__(None, None, None)

        self._closed = True
