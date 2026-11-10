"""Session information tracking for agent sessions."""

import time
from datetime import datetime, timezone
from typing import Optional


class SessionInfo:
    """Tracks session start and first user input."""

    def __init__(self):
        self._session_start_time: float = time.time()
        self._session_start_datetime: datetime = datetime.now(timezone.utc)
        self._first_input_time: Optional[float] = None
        self._first_input_datetime: Optional[datetime] = None
        self._first_input_type: Optional[str] = None

    def record_first_input(self, input_type: str) -> None:
        """Record the first user input (only records once)."""
        if self._first_input_time is None:
            self._first_input_time = time.time()
            self._first_input_datetime = datetime.now(timezone.utc)
            self._first_input_type = input_type

    def get_info_dict(self) -> dict:
        """Get session info as a dictionary for the agent."""
        time_to_first_input = None
        if self._first_input_time is not None:
            time_to_first_input = self._first_input_time - self._session_start_time

        return {
            "session_start_time": self._session_start_time,
            "session_start_datetime": self._session_start_datetime.isoformat(),
            "first_input_time": self._first_input_time,
            "first_input_datetime": self._first_input_datetime.isoformat() if self._first_input_datetime else None,
            "first_input_type": self._first_input_type,
            "time_to_first_input_seconds": time_to_first_input,
            "session_elapsed_time_seconds": time.time() - self._session_start_time,
        }


_session_instance: Optional[SessionInfo] = None


def get_session_info() -> SessionInfo:
    """Get or create the global session info instance."""
    global _session_instance
    if _session_instance is None:
        _session_instance = SessionInfo()
    return _session_instance


def reset_session() -> None:
    """Reset the global session (for testing)."""
    global _session_instance
    _session_instance = None
