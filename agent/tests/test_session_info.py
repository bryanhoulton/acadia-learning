"""Tests for session_info module."""

import time
import unittest

from utils.session_info import get_session_info, reset_session


class TestSessionInfo(unittest.TestCase):
    """Test cases for SessionInfo class."""

    def setUp(self):
        reset_session()

    def test_get_info_dict_no_input(self):
        """Test info dict before any user input."""
        session = get_session_info()
        info = session.get_info_dict()

        assert info["session_start_time"] > 0
        assert info["session_start_datetime"] is not None
        assert info["first_input_time"] is None
        assert info["first_input_datetime"] is None
        assert info["first_input_type"] is None
        assert info["time_to_first_input_seconds"] is None
        assert info["session_elapsed_time_seconds"] >= 0

    def test_record_first_input_chat(self):
        """Test recording first chat input."""
        session = get_session_info()
        time.sleep(0.05)
        session.record_first_input("chat")
        info = session.get_info_dict()

        assert info["first_input_type"] == "chat"
        assert info["first_input_time"] is not None
        assert info["time_to_first_input_seconds"] >= 0.04

    def test_record_first_input_voice(self):
        """Test recording first voice input."""
        session = get_session_info()
        session.record_first_input("voice")
        info = session.get_info_dict()

        assert info["first_input_type"] == "voice"

    def test_first_input_only_recorded_once(self):
        """Test that first input is only recorded once."""
        session = get_session_info()
        session.record_first_input("chat")
        first_info = session.get_info_dict()

        time.sleep(0.05)
        session.record_first_input("voice")
        second_info = session.get_info_dict()

        assert first_info["first_input_time"] == second_info["first_input_time"]
        assert second_info["first_input_type"] == "chat"

    def test_global_session(self):
        """Test global session singleton."""
        session1 = get_session_info()
        session2 = get_session_info()
        assert session1 is session2


if __name__ == "__main__":
    unittest.main()
