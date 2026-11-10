import asyncio
import json
import logging
import time

from livekit.rtc import Room, TextStreamReader

from services.api_service import APIService
from tracing import TracingClient
from utils.CallbackHandler import CallbackHandler
from utils.misc import AgentConfig, ChatMessage

logger = logging.getLogger(__name__)


class Chat(CallbackHandler):
    """Manages chat messages between agent and user."""

    def __init__(
        self,
        config: AgentConfig,
        room: Room,
        api_service: APIService,
        tracing_client: TracingClient | None = None,
    ):
        self.room = room
        self.config = config
        self.api_service = api_service
        self.tracing_client = tracing_client
        self.chat_messages: list[ChatMessage] = []
        self.last_read_time = time.time()
        self.room.register_text_stream_handler("chat", self.handle_chat_stream)

        super().__init__()

    def add(self, message: str, sender: str = "Agent"):
        """Add a message to the chat history."""
        cm = ChatMessage(message=message, sender=sender, timestamp=int(time.time()))
        self.chat_messages.append(cm)
        self._log_chat_message(cm)

    async def send(self, message: str, sender: str = "Agent"):
        """
        Send a message to the chat (adds to history and broadcasts to room).
        Note: Does NOT speak the message - that's handled by the speak tool.
        """
        self.add(message, sender)
        await self.room.local_participant.send_text(message, topic="chat")

    def __str__(self):
        """Get all chat messages as string (marks them as read)."""
        self.last_read_time = time.time()
        return json.dumps([str(m) for m in self.chat_messages])

    def has_unread_messages(self) -> bool:
        """Check if there are unread messages from non-agent users."""
        return any(m.timestamp > self.last_read_time and m.sender != "Agent" for m in self.chat_messages)

    async def _handle_chat_stream(self, reader: TextStreamReader, participant_identity: str):
        """Handle incoming chat messages from the room."""
        message = await reader.read_all()
        self.add(message, sender=participant_identity)
        cm = ChatMessage(message=message, sender=participant_identity, timestamp=int(time.time()))
        await self.emit(cm)

    def handle_chat_stream(self, reader: TextStreamReader, participant_identity: str):
        """Entry point for text stream handler."""
        asyncio.create_task(self._handle_chat_stream(reader, participant_identity))

    def _log_chat_message(self, chat_message: ChatMessage):
        """Log chat message to tracing."""
        if self.tracing_client is None:
            return

        try:
            with self.tracing_client.text_span(
                "chat_message",
                input=f"sender={chat_message.sender}, message={chat_message.message}",
            ) as span:
                span.output(f"timestamp={chat_message.timestamp}")
        except Exception:  # noqa: BLE001
            logger.exception("Failed to log chat message")
