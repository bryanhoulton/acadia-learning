from datetime import date
import pytest
from utils.timezone import parse_date_from_llm


class TestParseDateFromLLM:
    """Test cases for parse_date_from_llm function."""

    def test_parse_date_only_string(self):
        """Test parsing a date-only string."""
        result = parse_date_from_llm("2023-06-15")
        assert result == date(2023, 6, 15)

    def test_parse_datetime_with_timezone_offset(self):
        """Test parsing a datetime string with timezone offset."""
        result = parse_date_from_llm("2023-06-15T23:59:00-07:00")
        assert result == date(2023, 6, 15)

    def test_parse_datetime_with_utc_timezone(self):
        """Test parsing a datetime string with UTC timezone."""
        result = parse_date_from_llm("2023-06-15T23:59:00Z")
        assert result == date(2023, 6, 15)

    def test_parse_datetime_with_positive_timezone_offset(self):
        """Test parsing a datetime string with positive timezone offset."""
        result = parse_date_from_llm("2023-06-16T02:30:00+05:30")
        assert result == date(2023, 6, 16)

    def test_parse_datetime_without_timezone_with_default(self):
        """Test parsing a datetime string without timezone but with default timezone."""
        result = parse_date_from_llm("2023-06-15T14:30:00", default_timezone="America/Los_Angeles")
        assert result == date(2023, 6, 15)

    def test_parse_datetime_without_timezone_no_default_raises_error(self):
        """Test that parsing a datetime string without timezone and no default raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            parse_date_from_llm("2023-06-15T14:30:00")

        assert "Timezone information is required for datetime input" in str(exc_info.value)
        assert "Please specify the timezone offset" in str(exc_info.value)
        assert "or provide just a date" in str(exc_info.value)

    def test_parse_invalid_date_format(self):
        """Test that parsing an invalid date format raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            parse_date_from_llm("invalid-date")

        assert "Invalid date format" in str(exc_info.value)
        assert "Expected ISO date format" in str(exc_info.value)

    def test_parse_invalid_date_values(self):
        """Test that parsing invalid date values raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            parse_date_from_llm("2023-02-30")  # February 30th doesn't exist

        assert "Invalid date format" in str(exc_info.value)

    def test_parse_datetime_near_midnight_boundary(self):
        """Test parsing datetime strings that cross date boundaries due to timezone conversion."""
        # This is 11:59 PM on June 15th in Pacific Time, but it's already June 16th in UTC
        result = parse_date_from_llm("2023-06-15T23:59:00-07:00")
        assert result == date(2023, 6, 15)  # Should return the local date, not UTC date

    def test_parse_with_microseconds(self):
        """Test parsing datetime strings with microseconds."""
        result = parse_date_from_llm("2023-06-15T14:30:45.123456-04:00")
        assert result == date(2023, 6, 15)

    def test_parse_with_different_default_timezones(self):
        """Test parsing with different default timezones."""
        datetime_str = "2023-06-15T23:30:00"

        result_utc = parse_date_from_llm(datetime_str, default_timezone="UTC")
        result_pst = parse_date_from_llm(datetime_str, default_timezone="America/Los_Angeles")
        result_ist = parse_date_from_llm(datetime_str, default_timezone="Asia/Kolkata")

        # All should return the same date since we're only extracting the date part
        assert result_utc == date(2023, 6, 15)
        assert result_pst == date(2023, 6, 15)
        assert result_ist == date(2023, 6, 15)
