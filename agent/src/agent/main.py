import asyncio
import json
import logging
import os

from dotenv import load_dotenv
from livekit import api
from livekit.agents import AutoSubscribe, JobContext

from agent.runner import Agent
from agent.vad import DeepgramFluxManager
from agent.voice import Voice
from utils.misc import AgentConfig

load_dotenv()

logger = logging.getLogger(__name__)

PARTICIPANT_WAIT_TIMEOUT = 10  # seconds to wait for a participant before exiting


async def setup_egress(ctx: JobContext):
    """
    Setup egress recording for the session.
    """
    try:
        lkapi = api.LiveKitAPI(
            url=os.environ.get("LIVEKIT_URL", "http://localhost:7880"),
            api_key=os.environ.get("LIVEKIT_API_KEY"),
            api_secret=os.environ.get("LIVEKIT_API_SECRET"),
        )

        # Configure storage destination for LiveKit egress recordings.
        s3_bucket = os.environ.get("AWS_STORAGE_BUCKET_NAME")
        s3_access_key = os.environ.get("AWS_ACCESS_KEY_ID")
        s3_secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        s3_region = os.environ.get("AWS_REGION") or "us-east-1"

        if not all([s3_bucket, s3_access_key, s3_secret_key]):
            raise RuntimeError(
                "LiveKit S3 egress storage is not configured. Set AWS_STORAGE_BUCKET_NAME, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY."
            )

        logger.info("Starting LiveKit egress targeting S3 bucket")

        egress_req = api.RoomCompositeEgressRequest(
            room_name=ctx.room.name,
            audio_only=True,
            webhooks=[
                api.WebhookConfig(
                    url=os.environ.get("LIVEKIT_WEBHOOK_URL"),
                    signing_key=os.environ.get("LIVEKIT_WEBHOOK_SIGNING_KEY"),
                )
            ],
            file_outputs=[
                api.EncodedFileOutput(
                    file_type=api.EncodedFileType.MP4,
                    filepath=f"{ctx.room.name}/recording.mp4",
                    s3=api.S3Upload(
                        bucket=s3_bucket,
                        access_key=s3_access_key,
                        secret=s3_secret_key,
                        region=s3_region,
                    ),
                )
            ],
        )

        egress_res = await lkapi.egress.start_room_composite_egress(egress_req)
        logger.info(f"Started egress recording: {egress_res.egress_id}")
    except Exception as e:
        logger.error(f"Failed to start egress recording: {e}")


async def entrypoint(ctx: JobContext):
    """
    Simplified agent entrypoint.

    Flow:
    1. Connect to the room
    2. Wait for a participant to be in the room
    3. Create voice (TTS)
    4. Create agent
    5. Create Deepgram Flux connection
    6. Create audio streamer (connects Deepgram → agent)
    7. Run agent loop
    """
    # Connect to the room first so we can see participants
    await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_ALL)

    # Wait for a participant to actually be in the room before starting.
    # This prevents orphaned agents when a student joins and leaves quickly.
    start_time = asyncio.get_event_loop().time()
    while len(ctx.room.remote_participants) == 0:
        elapsed = asyncio.get_event_loop().time() - start_time
        if elapsed > PARTICIPANT_WAIT_TIMEOUT:
            logger.info(f"No participants joined room {ctx.room.name} within {PARTICIPANT_WAIT_TIMEOUT}s, exiting")
            ctx.shutdown()
            return
        await asyncio.sleep(0.5)

    logger.info(f"Participant detected in room {ctx.room.name}, starting agent setup")

    config = AgentConfig(**json.loads(ctx.job.metadata))

    await setup_egress(ctx)

    voice = Voice(ctx, config.voice_id)
    await voice.start()

    # Agent
    agent = Agent(room=ctx.room, voice=voice, config=config)

    dfm = DeepgramFluxManager(ctx, agent)
    await dfm.start()

    # Wire the audio streamer to the engagement coach for continuous audio access
    if dfm.vad:
        agent.engagement_coach.set_audio_streamer(dfm.vad)

    # Cleanup
    async def on_shutdown():
        await dfm.cleanup()
        agent.cleanup()

    ctx.add_shutdown_callback(on_shutdown)
    await agent.run()
    ctx.shutdown()
