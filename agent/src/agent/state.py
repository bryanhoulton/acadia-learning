import asyncio
import json
import time
from enum import Enum

from livekit.rtc import Room, TextStreamReader


class AgentState(Enum):
    """Agent state machine."""

    LISTENING = "listening"  # Waiting for user speech
    THINKING = "thinking"  # LLM is generating response
    SPEAKING = "speaking"  # Agent is playing audio
    WAITING = "waiting"  # Agent is waiting (via wait tool)
    AWAY = "away"  # Agent is away
    CONNECTING = "connecting"  # Agent is connecting


class StateManager:
    """
    Manages agent state transitions with logging.

    Enforces state machine rules and provides clear visibility
    into state changes.
    """

    def __init__(
        self,
        room: Room,
        initial_state: AgentState = AgentState.AWAY,
    ):
        self._room = room
        self._state = initial_state
        print(f"🔄 Initial state: {self._state.value}")

        # Register ping handler for health checks
        # Wrap async handler since register_text_stream_handler doesn't await
        self._room.register_text_stream_handler(
            "ping", lambda stream, info: asyncio.create_task(self._handle_ping(stream, info))
        )
        print("✅ Ping handler registered for health checks")

        # Broadcast initial state
        self._broadcast_state(self._state)

    @property
    def state(self) -> AgentState:
        """Get current state."""
        return self._state

    async def _handle_ping(self, stream: TextStreamReader, participant_info):
        """Handle ping requests from frontend for health checks."""
        data = await stream.read_all()
        print(f"📡 Received ping from {participant_info.identity}: {data}")
        # Always respond with current state (acts as pong)
        self._broadcast_state(self._state)

    def _broadcast_state(self, state: AgentState):
        """Broadcast agent state to frontend via LiveKit data channel."""
        asyncio.create_task(
            self._room.local_participant.send_text(
                json.dumps({"state": state.value, "timestamp": time.time()}),
                topic="agent-state",
            )
        )

    def transition_to(self, new_state: AgentState):
        """Transition to a new state with logging."""
        if new_state != self._state:
            old_state = self._state
            self._state = new_state
            print(f"🔄 State: {old_state.value} → {new_state.value}")

            # Broadcast state change
            self._broadcast_state(new_state)

    def is_listening(self) -> bool:
        """Check if agent is in listening state (user is speaking)."""
        return self._state == AgentState.LISTENING

    def is_thinking(self) -> bool:
        """Check if agent is in thinking state."""
        return self._state == AgentState.THINKING

    def is_speaking(self) -> bool:
        """Check if agent is in speaking state."""
        return self._state == AgentState.SPEAKING

    def is_waiting(self) -> bool:
        """Check if agent is in waiting state (idle, ready for user)."""
        return self._state == AgentState.WAITING

    def can_be_interrupted(self) -> bool:
        """Check if agent can be interrupted (speaking or thinking)."""
        return self._state in (AgentState.SPEAKING, AgentState.THINKING)
