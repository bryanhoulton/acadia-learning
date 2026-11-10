from datetime import datetime
from zoneinfo import ZoneInfo


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
