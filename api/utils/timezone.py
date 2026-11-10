from datetime import date, datetime
from typing import Union
from zoneinfo import ZoneInfo

import pytz
from django.core.exceptions import ValidationError


def is_valid_timezone(timezone_str: str):
    """
    Check if a timezone string is valid.
    """
    # Allow None/empty strings since the field is nullable
    if not timezone_str:
        return

    try:
        ZoneInfo(timezone_str)
    except (ValueError, IsADirectoryError, OSError):
        raise ValidationError(f"Invalid timezone: {timezone_str}")


def ensure_timezone_aware(dt: datetime | None) -> datetime | None:
    """
    Ensure a datetime is timezone-aware. If it's naive (no timezone info),
    assumes it's in UTC and makes it timezone-aware.

    Args:
        dt: The datetime to make timezone-aware, or None

    Returns:
        The timezone-aware datetime, or None if input was None
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return pytz.utc.localize(dt)
    return dt


def local_to_utc(local_dt, timezone_str):
    """
    Convert local timezone datetime to UTC.
    If input is not timezone-aware, assumes it's in the specified timezone.
    """
    if local_dt.tzinfo is None:
        local_tz = pytz.timezone(timezone_str)
        local_dt = local_tz.localize(local_dt)
    return local_dt.astimezone(pytz.utc)


def format_datetime_for_llm(dt: datetime, timezone_str: str):
    """
    Format a datetime for LLM consumption in the entity's timezone.
    Returns a formatted string with date, time, timezone, and day of week.
    """
    local_dt = force_timezone(dt, timezone_str)
    # Get day of week name
    day_name = local_dt.strftime("%A")
    # Format: "Monday, 2025-01-06T14:30:00-05:00"
    return f"{day_name}, {local_dt.isoformat()}"


def parse_datetime_from_llm(dt_str: str, default_timezone: Union[str, None] = None):
    """
    Parse a datetime string from LLM in the entity's timezone.
    Returns a UTC datetime object for database storage.

    Raises ValueError if the datetime string is invalid or not timezone-aware (and no default timezone is provided)
    """
    try:
        # Try to parse with timezone info
        dt = datetime.fromisoformat(dt_str)

        # Reject timezone-naive datetimes
        if dt.tzinfo is None and default_timezone is None:
            raise ValueError(
                f"Timezone information is required: {dt_str}. "
                f"Please specify the timezone offset (e.g., 2023-06-15T14:30:00-04:00 or 2023-06-15T14:30:00Z)"
            )
        if dt.tzinfo is None and default_timezone is not None:
            tz = pytz.timezone(default_timezone)
            dt = tz.localize(dt)

        # Convert to UTC for storage
        return dt.astimezone(pytz.utc)
    except ValueError as e:
        if "Timezone information is required" in str(e):
            raise e
        raise ValueError(
            f"Invalid datetime format: {dt_str}. Expected ISO format with timezone information "
            f"(e.g., 2023-06-15T14:30:00-04:00 or 2023-06-15T14:30:00Z)"
        ) from None


def parse_date_from_llm(date_str: str, default_timezone: Union[str, None] = None) -> date:
    """
    Parse a date or datetime string from LLM and return a date object.
    Handles both date-only strings (e.g., "2023-06-15") and datetime strings with timezone info.

    Args:
        date_str: Date string in ISO format, either date-only or datetime with timezone
        default_timezone: Default timezone to use if datetime is provided without timezone info

    Returns:
        date: The parsed date object

    Raises:
        ValueError: If the date string is invalid or datetime without timezone and no default provided
    """
    try:
        # First try to parse as date-only (e.g., "2023-06-15")
        try:
            return date.fromisoformat(date_str)
        except ValueError:
            # Not a date-only string, try parsing as datetime
            pass

        # Parse as datetime and extract date part
        dt = datetime.fromisoformat(date_str)

        # Handle timezone-naive datetimes
        if dt.tzinfo is None and default_timezone is None:
            raise ValueError(
                f"Timezone information is required for datetime input: {date_str}. "
                f"Please specify the timezone offset (e.g., 2023-06-15T14:30:00-04:00 or 2023-06-15T14:30:00Z) "
                f"or provide just a date (e.g., 2023-06-15)"
            )
        if dt.tzinfo is None and default_timezone is not None:
            tz = pytz.timezone(default_timezone)
            dt = tz.localize(dt)

        # Return the date part
        return dt.date()

    except ValueError as e:
        if "Timezone information is required" in str(e):
            raise e
        raise ValueError(
            f"Invalid date format: {date_str}. Expected ISO date format "
            f"(e.g., 2023-06-15) or ISO datetime with timezone information "
            f"(e.g., 2023-06-15T14:30:00-04:00 or 2023-06-15T14:30:00Z)"
        ) from None


def force_timezone(dt: datetime, target_tz: ZoneInfo | str) -> datetime:
    """
    Force a datetime object to a specific timezone. If the datetime object is naive, it will be set to the specified
    timezone. If the datetime object is timezone-aware, it will be converted to the specified timezone.

    Args:
        dt: The datetime object to force.
        target_tz: The timezone to force the datetime object to.

    Returns:
        The datetime object with the timezone forced.
    """

    if isinstance(target_tz, str):
        try:
            target_tz = ZoneInfo(target_tz)
        except ValueError:
            raise ValueError(f"Unknown timezone: {target_tz}")

    if dt.tzinfo is None:
        # Naive datetime - assume it's in the target timezone
        return dt.replace(tzinfo=target_tz)
    else:
        # Timezone-aware datetime - convert to target timezone
        return dt.astimezone(target_tz)
