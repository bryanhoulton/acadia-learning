from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta

import tiktoken

from entities.memory.types import RESOLUTION_LEVELS, PeriodType
from entities.models import DailySummary, FiveMinuteSummary, HourlySummary, Message, MonthlySummary, WeeklySummary
from utils.timezone import force_timezone

logger = logging.getLogger(__name__)


class MemoryContextBuilder:
    """Builds memory context from summaries and recent messages."""

    def __init__(self, entity, compression):
        self.entity = entity
        self.compression = compression

    def build(
        self,
        max_tokens: int = 50000,
        min_resolution: PeriodType | None = None,
        current_time: datetime | None = None,
    ) -> str:
        """
        Build formatted memory context using summaries and recent messages.

        Args:
            max_tokens: Maximum tokens for the context
            min_resolution: Minimum resolution level to include (e.g., HOURLY means
                include HOURLY, DAILY, WEEKLY, MONTHLY but not FIVE_MINUTE).
                If None, includes all resolutions.
            current_time: Time cap for summaries - only include summaries before this time.
                If None, uses entity's current_time.
        """
        enc = tiktoken.get_encoding("o200k_base")
        effective_time = current_time if current_time is not None else self.entity.current_time
        effective_date = effective_time.date()

        # Determine last_summarized_time from 5-minute summaries
        last_summarized_time = self._get_last_five_minute_summary_time(effective_time)

        # Build core summaries (monthly → weekly → daily → hourly → 5-minute)
        core_parts = self._build_core_summaries(
            effective_time, effective_date, last_summarized_time, min_resolution=min_resolution
        )
        core_text = "\n".join(core_parts)
        core_tokens = len(enc.encode(core_text))

        # Compute token budget for messages
        remaining_tokens = max_tokens - core_tokens
        if remaining_tokens <= 0:
            logger.warning(f"Core summaries use {core_tokens} tokens, leaving no budget for messages")
            remaining_tokens = 0

        # Add messages strictly after last_summarized_time (only if we're including the finest resolution)
        message_parts = []
        include_messages = min_resolution is None or min_resolution == PeriodType.FIVE_MINUTE
        if remaining_tokens > 0 and include_messages:
            formatted_messages = self._get_messages(
                start_time=last_summarized_time,
                end_time=effective_time,
                available_tokens=remaining_tokens,
                enc=enc,
            )
            if formatted_messages:
                message_parts.append("\n\n=== MOST RECENT MESSAGES ===")
                formatted_messages.reverse()  # chronological order
                message_parts.extend(formatted_messages)

        all_parts = core_parts + message_parts
        final_text = "\n".join(all_parts)
        final_tokens = len(enc.encode(final_text))

        logger.debug(f"Memory context: {final_tokens}/{max_tokens} tokens used")
        return final_text

    def _get_last_five_minute_summary_time(self, current_time: datetime) -> datetime:
        """Return the end time of the most recent completed 5-minute summary bucket."""
        local_time = force_timezone(current_time, self.entity.timezone)
        current_date = local_time.date()
        current_hour = local_time.hour

        summaries = FiveMinuteSummary.objects.filter(entity=self.entity, date=current_date, hour=current_hour).order_by(
            "minute"
        )

        if summaries.exists():
            last_summary = summaries.last()
            if last_summary is not None:
                start_dt = datetime.combine(current_date, time(current_hour, last_summary.minute, 0))
                start_dt = force_timezone(start_dt, self.entity.timezone)
                end_dt = start_dt + timedelta(minutes=5)
                return end_dt

        # No five-minute summaries in this hour yet → top of current hour
        hour_start = datetime.combine(current_date, time(current_hour, 0, 0))
        return force_timezone(hour_start, self.entity.timezone)

    def _get_messages(self, start_time: datetime, end_time: datetime, available_tokens: int, enc) -> list[str]:
        """Return formatted messages in (start_time, end_time] within the token budget."""
        recent_messages = Message.objects.filter(
            entity=self.entity,
            timestamp__gt=start_time,
            timestamp__lte=end_time,
        ).order_by("-timestamp")

        messages = list(recent_messages[:200])
        return self.compression.apply_compression_strategies(messages, available_tokens, enc)

    def _should_include_resolution(self, period_type: PeriodType, min_resolution: PeriodType | None) -> bool:
        """Check if a resolution level should be included based on min_resolution."""
        if min_resolution is None:
            return True
        return RESOLUTION_LEVELS[period_type] >= RESOLUTION_LEVELS[min_resolution]

    def _build_core_summaries(
        self,
        current_time: datetime,
        current_date: date,
        last_summarized_time: datetime | None = None,
        min_resolution: PeriodType | None = None,
    ) -> list[str]:
        """
        Build the core summaries that should always be included.

        Args:
            current_time: The effective current time for context building
            current_date: The effective current date
            last_summarized_time: Time of the last 5-minute summary
            min_resolution: Minimum resolution to include (e.g., HOURLY excludes FIVE_MINUTE)
        """
        context_parts = []

        # Calculate date ranges
        this_week_start = self._get_week_start(current_date)
        last_week_start = this_week_start - timedelta(days=7)
        this_month_start = current_date.replace(day=1)
        if this_month_start.month == 1:
            last_month_start = this_month_start.replace(year=this_month_start.year - 1, month=12)
        else:
            last_month_start = this_month_start.replace(month=this_month_start.month - 1)

        # Monthly summaries (oldest first) - always included if resolution allows
        if self._should_include_resolution(PeriodType.MONTHLY, min_resolution):
            monthly_summaries = (
                MonthlySummary.objects.filter(entity=self.entity)
                .exclude(year=last_month_start.year, month=last_month_start.month)
                .exclude(year=this_month_start.year, month=this_month_start.month)
                .exclude(summary="")
                .order_by("year", "month")[:6]
            )

            if monthly_summaries.exists():
                context_parts.append("=== MONTHLY SUMMARIES ===")
                for monthly in monthly_summaries:
                    context_parts.append(f"\n{monthly.year}-{monthly.month:02d}: {monthly.summary}")

        # Weekly summaries
        if self._should_include_resolution(PeriodType.WEEKLY, min_resolution):
            weekly_summaries = (
                WeeklySummary.objects.filter(
                    entity=self.entity,
                    week_start_date__gte=last_month_start,
                    week_start_date__lt=this_week_start,  # Use this_week_start for cleaner cutoff
                )
                .exclude(summary="")
                .order_by("week_start_date")
            )

            if weekly_summaries.exists():
                context_parts.append("\n\n=== RECENT WEEKLY SUMMARIES ===")
                for weekly in weekly_summaries:
                    context_parts.append(f"\nWeek of {weekly.week_start_date}: {weekly.summary}")

        # Daily summaries
        if self._should_include_resolution(PeriodType.DAILY, min_resolution):
            daily_summaries = (
                DailySummary.objects.filter(
                    entity=self.entity,
                    date__gte=last_week_start,
                    date__lt=current_date,
                )
                .exclude(summary="")
                .order_by("date")
            )

            if daily_summaries.exists():
                context_parts.append("\n\n=== RECENT DAILY SUMMARIES ===")
                for daily in daily_summaries:
                    context_parts.append(f"\n{daily.date}: {daily.summary}")

        # Today's hourly summaries (only up to current_time)
        if self._should_include_resolution(PeriodType.HOURLY, min_resolution):
            local_time = force_timezone(current_time, self.entity.timezone)
            current_hour = local_time.hour

            today_hourly_summaries = (
                HourlySummary.objects.filter(entity=self.entity, date=current_date, hour__lt=current_hour)
                .exclude(summary="")
                .order_by("hour")
            )

            if today_hourly_summaries.exists():
                context_parts.append("\n\n=== TODAY'S HOURLY SUMMARIES ===")
                for hourly in today_hourly_summaries:
                    dt = datetime.combine(hourly.date, time(hourly.hour, 0, 0))
                    dt = force_timezone(dt, self.entity.timezone)
                    dt = dt + timedelta(minutes=self.entity.time_offset)
                    context_parts.append(f"\n{dt.strftime('%H:%M:%S')}: {hourly.summary}")

        # Today's 5-minute summaries (current hour), up to last_summarized_time
        if self._should_include_resolution(PeriodType.FIVE_MINUTE, min_resolution) and last_summarized_time is not None:
            local_time = force_timezone(current_time, self.entity.timezone)
            current_hour = local_time.hour
            summaries_5m = (
                FiveMinuteSummary.objects.filter(entity=self.entity, date=current_date, hour=current_hour)
                .exclude(summary="")
                .order_by("minute")
            )

            if summaries_5m.exists():
                context_parts.append("\n\n=== LAST HOUR'S 5-MINUTE SUMMARIES ===")
                for s in summaries_5m:
                    start_dt = datetime.combine(s.date, time(s.hour, s.minute, 0))
                    start_dt = force_timezone(start_dt, self.entity.timezone)
                    end_dt = start_dt + timedelta(minutes=5)
                    if start_dt >= last_summarized_time:
                        break
                    if self.entity.time_offset:
                        start_dt = start_dt + timedelta(minutes=self.entity.time_offset)
                        end_dt = end_dt + timedelta(minutes=self.entity.time_offset)
                    context_parts.append(f"\n{start_dt.strftime('%H:%M')}–{end_dt.strftime('%H:%M')}: {s.summary}")

        return context_parts

    def _get_week_start(self, date: date) -> date:
        """Get Monday of the week for a given date."""
        days_since_monday = date.weekday()
        return date - timedelta(days=days_since_monday)
