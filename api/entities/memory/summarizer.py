from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import date, datetime, time, timedelta
from textwrap import dedent
from typing import Any

import tiktoken
from openai import AsyncOpenAI

from entities.memory.compression import Compression
from entities.memory.context import MemoryContextBuilder
from entities.memory.types import PERIOD_META, PeriodType
from entities.models import DailySummary, FiveMinuteSummary, HourlySummary, Message, MonthlySummary, WeeklySummary
from tracing.spans import async_text_span, get_tracing_context, set_tracing_context
from utils.llms import track_llm_cost
from utils.timezone import force_timezone

logger = logging.getLogger(__name__)


MAX_CONCURRENT_LLM_CALLS = max(1, int(os.environ.get("SUMMARY_MAX_CONCURRENT_LLM_CALLS", "5")))


class SummaryUpdater:
    """Handles creation and updating of all summary levels for an entity."""

    def __init__(self, entity):
        self.entity = entity
        self.total_usage = {"input_tokens": 0, "output_tokens": 0}

    def _get_async_oai(self) -> AsyncOpenAI:
        """Create an async OpenAI client on demand."""
        return AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    async def _gather_with_limit(self, coros, max_concurrent: int = MAX_CONCURRENT_LLM_CALLS):
        """Run coroutines with a concurrency limit to bound memory usage."""
        semaphore = asyncio.Semaphore(max_concurrent)

        async def _limited(coro):
            async with semaphore:
                return await coro

        return await asyncio.gather(*[_limited(c) for c in coros])

    def _get_memory_context(
        self,
        min_resolution: PeriodType,
        current_time: datetime,
        max_tokens: int = 10000,
    ) -> str:
        """
        Build memory context for summarization, including summaries at the specified
        resolution and higher (coarser) levels.

        Args:
            min_resolution: The minimum resolution to include (e.g., HOURLY means
                include HOURLY, DAILY, WEEKLY, MONTHLY but not FIVE_MINUTE)
            current_time: The time cap - only include summaries from before this time
            max_tokens: Maximum tokens for the context

        Returns:
            Formatted memory context string
        """
        compression = Compression(self.entity)
        context_builder = MemoryContextBuilder(self.entity, compression)
        return context_builder.build(
            max_tokens=max_tokens,
            min_resolution=min_resolution,
            current_time=current_time,
        )

    def _prepare_content_with_token_limit(self, messages_data: list[dict], max_tokens: int = 150000) -> str:
        """
        Prepare message content with intelligent token limiting.

        Strategy:
        1. Always include the most recent messages (preserve recency)
        2. If too many tokens, sample from older messages to stay within limit
        3. Preserve temporal distribution when possible

        Args:
            messages_data: List of message dictionaries
            max_tokens: Maximum tokens allowed in the content

        Returns:
            JSON string of messages within token limit
        """
        if not messages_data:
            return json.dumps([])

        enc = tiktoken.get_encoding("o200k_base")

        # Pre-compute token counts for each message (optimization: encode each message only once)
        message_tokens = []
        total_tokens = 0
        for msg in messages_data:
            msg_json = json.dumps(msg)
            tokens = len(enc.encode(msg_json))
            message_tokens.append((msg, msg_json, tokens))
            total_tokens += tokens

        # Account for JSON array overhead (brackets, commas, etc.)
        # Rough estimate: 2 for brackets + (n-1) commas + some spacing
        json_overhead = 2 + max(0, len(messages_data) - 1) * 2  # 2 chars per comma+space
        full_tokens = total_tokens + json_overhead

        if full_tokens <= max_tokens:
            return json.dumps(messages_data)

        logger.warning(
            f"5-minute bucket has {len(messages_data)} messages ({full_tokens} tokens), "
            f"exceeds limit of {max_tokens}. Applying intelligent sampling."
        )

        # Sort messages by timestamp if they have one, otherwise preserve order
        try:
            # Try to sort by timestamp if available
            message_tokens.sort(key=lambda item: item[0].get("timestamp", ""), reverse=True)
        except (KeyError, TypeError):
            # If no timestamp or sorting fails, reverse to get most recent first
            message_tokens.reverse()

        # Start with most recent messages and add older ones until we hit the limit
        selected_messages = []
        selected_tokens = []
        current_tokens = json_overhead  # Start with JSON array overhead

        # Always include at least the most recent message
        if message_tokens:
            msg, msg_json, msg_token_count = message_tokens[0]
            selected_messages.append(msg)
            selected_tokens.append(msg_json)
            current_tokens += msg_token_count

        # Add more messages while staying under the token limit
        for msg, msg_json, msg_token_count in message_tokens[1:]:
            if current_tokens + msg_token_count <= max_tokens:
                selected_messages.append(msg)
                selected_tokens.append(msg_json)
                current_tokens += msg_token_count
            else:
                break

        # If we still have room and didn't include all messages, try to sample from remaining
        if len(selected_messages) < len(message_tokens) and current_tokens < max_tokens * 0.9:
            remaining_messages = message_tokens[len(selected_messages) :]

            # Sample additional messages from the remaining ones
            step_size = max(1, len(remaining_messages) // 10)
            for i in range(0, len(remaining_messages), step_size):
                msg, msg_json, msg_token_count = remaining_messages[i]
                if current_tokens + msg_token_count <= max_tokens:
                    selected_messages.append(msg)
                    selected_tokens.append(msg_json)
                    current_tokens += msg_token_count
                else:
                    break

        # Sort selected messages back to chronological order for better context
        try:
            # Create tuples of (msg, index) to maintain order after sorting
            msg_with_timestamps = [(msg, i) for i, msg in enumerate(selected_messages)]
            msg_with_timestamps.sort(key=lambda item: item[0].get("timestamp", ""))
            selected_messages = [msg for msg, _ in msg_with_timestamps]
        except (KeyError, TypeError):
            pass  # Keep existing order if sorting fails

        final_content = json.dumps(selected_messages)
        final_tokens = len(enc.encode(final_content))

        logger.debug(
            f"Reduced from {len(messages_data)} to {len(selected_messages)} messages "
            f"({full_tokens} to {final_tokens} tokens)"
        )

        return final_content

    def update_all(self, current_time: datetime) -> dict[str, Any]:
        """Update all summary levels (sync facade over async flow)."""
        logger.debug(f"Starting summary updates for entity {self.entity.id}")

        # Capture tracing context to pass through asyncio.run()
        tracing_ctx = get_tracing_context()
        result = asyncio.run(self.update_all_async(current_time, tracing_ctx=tracing_ctx))

        return result

    async def update_all_async(self, current_time: datetime, tracing_ctx: tuple | None = None) -> dict[str, Any]:
        """Async orchestration: update summaries with batching within each level."""
        logger.debug(f"[ASYNC] Starting async summary updates for entity {self.entity.id}")

        # Restore tracing context from sync caller (asyncio.run breaks context)
        if tracing_ctx:
            set_tracing_context(*tracing_ctx)
        async_client = self._get_async_oai()

        # Reset usage tracker
        self.total_usage = {"input_tokens": 0, "output_tokens": 0}

        updated_5m = await self._update_five_minute_summaries_async(current_time, async_client)
        updated_hour = await self._update_hourly_summaries_async(current_time, async_client)
        updated_day = await self._update_daily_summaries_async(current_time, async_client)
        updated_week = await self._update_weekly_summaries_async(current_time, async_client)
        updated_month = await self._update_monthly_summaries_async(current_time, async_client)

        logger.debug(f"Total accumulated usage: {self.total_usage}")
        return {
            "five_minute_created": len(updated_5m),
            "hourly_created": len(updated_hour),
            "daily_created": len(updated_day),
            "weekly_created": len(updated_week),
            "monthly_created": len(updated_month),
            "llm_usage": self.total_usage,
        }

    async def _update_five_minute_summaries_async(
        self, current_time: datetime, async_client: AsyncOpenAI
    ) -> list[FiveMinuteSummary]:
        """Async: batch-create 5-minute summaries for all completed buckets."""
        logger.debug(f"[ASYNC] Updating 5-minute summaries for entity {self.entity.id}")
        from asgiref.sync import sync_to_async

        cutoff = current_time.replace(second=0, microsecond=0) - timedelta(minutes=5)

        # Pre-fetch all existing summary keys so we can skip them without N+1 queries
        existing_keys: set[tuple[date, int, int]] = set(
            await sync_to_async(list)(
                FiveMinuteSummary.objects.filter(entity=self.entity).values_list("date", "hour", "minute")
            )
        )

        messages = await sync_to_async(list)(
            Message.objects.filter(
                entity=self.entity,
                timestamp__lt=cutoff,
            ).values_list("timestamp", "message_data")
        )

        five_minute_groups: dict[tuple[date, int, int], list[dict]] = {}
        for timestamp, message_data in messages:
            local_time = force_timezone(timestamp, self.entity.timezone)
            minute_bucket = (local_time.minute // 5) * 5
            key = (local_time.date(), local_time.hour, minute_bucket)
            if key in existing_keys:
                continue
            if key not in five_minute_groups:
                five_minute_groups[key] = []
            five_minute_groups[key].append(message_data)

        pending = list(five_minute_groups.items())

        if not pending:
            return []

        async with async_text_span("update_five_minute_summaries", entity=self.entity) as five_min_span:
            logger.debug(
                f"[ASYNC] Creating {len(pending)} five-minute summaries (max {MAX_CONCURRENT_LLM_CALLS} concurrent)"
            )
            tasks = []
            for (_date, hour, minute), messages_data in pending:
                content = self._prepare_content_with_token_limit(messages_data, max_tokens=200_000)
                tasks.append(self._create_summary_async(async_client, content, PeriodType.FIVE_MINUTE))

            summaries_text = await self._gather_with_limit(tasks)

            # Bulk insert - skip empty summaries
            updated = []
            for i, ((_date, hour, minute), messages_data) in enumerate(pending):
                summary_text = summaries_text[i]
                if not summary_text or not summary_text.strip():
                    logger.error(
                        f"Failed to create 5-minute summary for entity {self.entity.id} "
                        f"at {_date} {hour:02d}:{minute:02d} - summary is empty, skipping"
                    )
                    continue
                summary_obj = await sync_to_async(FiveMinuteSummary.objects.create)(
                    entity=self.entity,
                    date=_date,
                    hour=hour,
                    minute=minute,
                    summary=summary_text,
                    message_count=len(messages_data),
                )
                updated.append(summary_obj)

            five_min_span.output(f"created_count={len(updated)}")
            return updated

    async def _update_hourly_summaries_async(
        self, current_time: datetime, async_client: AsyncOpenAI
    ) -> list[HourlySummary]:
        """Async: batch-create hourly summaries from 5-minute summaries."""
        logger.debug(f"[ASYNC] Updating hourly summaries for entity {self.entity.id}")
        from asgiref.sync import sync_to_async

        # Pre-fetch existing hourly keys to avoid N+1 queries
        existing_keys: set[tuple[date, int]] = set(
            await sync_to_async(list)(HourlySummary.objects.filter(entity=self.entity).values_list("date", "hour"))
        )

        # Determine which (date, hour) pairs still need an hourly summary, using
        # a lightweight distinct query so we don't load every historical
        # FiveMinuteSummary row (and its `summary` text) into memory.
        current_hour_start = current_time.replace(minute=0, second=0, microsecond=0)
        candidate_hours: list[tuple[date, int]] = await sync_to_async(list)(
            FiveMinuteSummary.objects.filter(entity=self.entity).values_list("date", "hour").distinct()
        )

        pending_hours: list[tuple[date, int]] = []
        for hour_key in candidate_hours:
            if hour_key in existing_keys:
                continue
            _date, hour = hour_key
            hour_dt = datetime.combine(_date, time(hour, 0, 0))
            hour_dt = force_timezone(hour_dt, self.entity.timezone)
            if hour_dt >= current_hour_start:
                continue
            pending_hours.append(hour_key)

        if not pending_hours:
            return []

        # Now load only the 5-minute summaries for the pending hours.
        pending_dates = {d for d, _ in pending_hours}
        pending_set = set(pending_hours)
        five_min_summaries = await sync_to_async(list)(
            FiveMinuteSummary.objects.filter(entity=self.entity, date__in=pending_dates).order_by(
                "date", "hour", "minute"
            )
        )

        hourly_groups: dict[tuple[date, int], list[FiveMinuteSummary]] = {}
        for summary_5m in five_min_summaries:
            hour_key = (summary_5m.date, summary_5m.hour)
            if hour_key not in pending_set:
                continue
            if hour_key not in hourly_groups:
                hourly_groups[hour_key] = []
            hourly_groups[hour_key].append(summary_5m)

        pending = []
        for (_date, hour), summaries_5m in hourly_groups.items():
            parts = []
            for s in summaries_5m:
                timestamp = f"{s.hour:02d}:{s.minute:02d}"
                parts.append(f"[{timestamp}] {s.summary}")
            combined_content = "\n\n".join(parts)
            total_messages = sum([s.message_count for s in summaries_5m])
            pending.append(((_date, hour), combined_content, total_messages))

        if not pending:
            return []

        async with async_text_span("update_hourly_summaries", entity=self.entity) as hourly_span:
            logger.debug(
                f"[ASYNC] Creating {len(pending)} hourly summaries (max {MAX_CONCURRENT_LLM_CALLS} concurrent)"
            )
            from asgiref.sync import sync_to_async

            tasks = []
            for (_date, hour), content, _ in pending:
                hour_start = datetime.combine(_date, time(hour, 0, 0))
                hour_start = force_timezone(hour_start, self.entity.timezone)
                memory_context = await sync_to_async(self._get_memory_context)(
                    min_resolution=PeriodType.HOURLY,
                    current_time=hour_start,
                    max_tokens=8000,
                )
                tasks.append(
                    self._create_summary_async(async_client, content, PeriodType.HOURLY, existing_memory=memory_context)
                )
            summaries_text = await self._gather_with_limit(tasks)

            updated = []
            for i, ((_date, hour), _, total_messages) in enumerate(pending):
                summary_text = summaries_text[i]
                if not summary_text or not summary_text.strip():
                    logger.error(
                        f"Failed to create hourly summary for entity {self.entity.id} "
                        f"at {_date} {hour:02d}:00 - summary is empty, skipping"
                    )
                    continue
                summary_obj = await sync_to_async(HourlySummary.objects.create)(
                    entity=self.entity,
                    date=_date,
                    hour=hour,
                    summary=summary_text,
                    message_count=total_messages,
                )
                updated.append(summary_obj)

            hourly_span.output(f"created_count={len(updated)}")
            return updated

    async def _update_daily_summaries_async(
        self, current_time: datetime, async_client: AsyncOpenAI
    ) -> list[DailySummary]:
        """Async: batch-create daily summaries."""
        logger.debug(f"[ASYNC] Updating daily summaries for entity {self.entity.id}")
        from asgiref.sync import sync_to_async

        today = current_time.date()

        existing_days: set[date] = set(
            await sync_to_async(list)(DailySummary.objects.filter(entity=self.entity).values_list("date", flat=True))
        )

        hourly_days = await sync_to_async(list)(
            HourlySummary.objects.filter(entity=self.entity, date__lt=today).values_list("date", flat=True).distinct()
        )

        pending = []
        for day in hourly_days:
            if day in existing_days:
                continue
            hour_summaries = await sync_to_async(list)(
                HourlySummary.objects.filter(entity=self.entity, date=day).order_by("hour")
            )
            if hour_summaries:
                parts = []
                for hs in hour_summaries:
                    timestamp = f"{hs.hour:02d}:00"
                    parts.append(f"[{timestamp}] {hs.summary}")
                combined_content = "\n\n".join(parts)
                total_messages = sum([hs.message_count for hs in hour_summaries])
                pending.append((day, combined_content, total_messages))

        if not pending:
            return []

        async with async_text_span("update_daily_summaries", entity=self.entity) as daily_span:
            logger.debug(f"[ASYNC] Creating {len(pending)} daily summaries (max {MAX_CONCURRENT_LLM_CALLS} concurrent)")
            from asgiref.sync import sync_to_async

            tasks = []
            for day, content, _ in pending:
                day_start = datetime.combine(day, time(0, 0, 0))
                day_start = force_timezone(day_start, self.entity.timezone)
                memory_context = await sync_to_async(self._get_memory_context)(
                    min_resolution=PeriodType.DAILY,
                    current_time=day_start,
                    max_tokens=10000,
                )
                tasks.append(
                    self._create_summary_async(async_client, content, PeriodType.DAILY, existing_memory=memory_context)
                )
            summaries_text = await self._gather_with_limit(tasks)

            updated = []
            for i, (day, _, total_messages) in enumerate(pending):
                summary_text = summaries_text[i]
                if not summary_text or not summary_text.strip():
                    logger.error(
                        f"Failed to create daily summary for entity {self.entity.id} "
                        f"at {day} - summary is empty, skipping"
                    )
                    continue
                summary_obj = await sync_to_async(DailySummary.objects.create)(
                    entity=self.entity,
                    date=day,
                    summary=summary_text,
                    message_count=total_messages,
                )
                updated.append(summary_obj)

            daily_span.output(f"created_count={len(updated)}")
            return updated

    async def _update_weekly_summaries_async(
        self, current_time: datetime, async_client: AsyncOpenAI
    ) -> list[WeeklySummary]:
        """Async: batch-create weekly summaries."""
        logger.debug(f"[ASYNC] Updating weekly summaries for entity {self.entity.id}")
        from asgiref.sync import sync_to_async

        this_week_start = self._get_week_start(current_time.date())

        existing_weeks: set[date] = set(
            await sync_to_async(list)(
                WeeklySummary.objects.filter(entity=self.entity).values_list("week_start_date", flat=True)
            )
        )

        dailies = await sync_to_async(list)(
            DailySummary.objects.filter(entity=self.entity, date__lt=this_week_start).order_by("date")
        )

        weekly_groups: dict[date, list[DailySummary]] = {}
        for d in dailies:
            week_start = self._get_week_start(d.date)
            if week_start in existing_weeks:
                continue
            if week_start not in weekly_groups:
                weekly_groups[week_start] = []
            weekly_groups[week_start].append(d)

        pending = []
        for week_start, dailies_in_week in weekly_groups.items():
            parts = []
            for d in dailies_in_week:
                parts.append(f"[{d.date}] {d.summary}")
            combined_content = "\n\n".join(parts)
            total_messages = sum([d.message_count for d in dailies_in_week])
            pending.append((week_start, combined_content, total_messages))

        if not pending:
            return []

        async with async_text_span("update_weekly_summaries", entity=self.entity) as weekly_span:
            logger.debug(
                f"[ASYNC] Creating {len(pending)} weekly summaries (max {MAX_CONCURRENT_LLM_CALLS} concurrent)"
            )
            from asgiref.sync import sync_to_async

            tasks = []
            for week_start, content, _ in pending:
                week_start_dt = datetime.combine(week_start, time(0, 0, 0))
                week_start_dt = force_timezone(week_start_dt, self.entity.timezone)
                memory_context = await sync_to_async(self._get_memory_context)(
                    min_resolution=PeriodType.WEEKLY,
                    current_time=week_start_dt,
                    max_tokens=12000,
                )
                tasks.append(
                    self._create_summary_async(async_client, content, PeriodType.WEEKLY, existing_memory=memory_context)
                )
            summaries_text = await self._gather_with_limit(tasks)

            updated = []
            for i, (week_start, _, total_messages) in enumerate(pending):
                summary_text = summaries_text[i]
                if not summary_text or not summary_text.strip():
                    logger.error(
                        f"Failed to create weekly summary for entity {self.entity.id} "
                        f"for week starting {week_start} - summary is empty, skipping"
                    )
                    continue
                summary_obj = await sync_to_async(WeeklySummary.objects.create)(
                    entity=self.entity,
                    week_start_date=week_start,
                    summary=summary_text,
                    message_count=total_messages,
                )
                updated.append(summary_obj)

            weekly_span.output(f"created_count={len(updated)}")
            return updated

    async def _update_monthly_summaries_async(
        self, current_time: datetime, async_client: AsyncOpenAI
    ) -> list[MonthlySummary]:
        """Async: batch-create monthly summaries."""
        logger.debug(f"[ASYNC] Updating monthly summaries for entity {self.entity.id}")
        from asgiref.sync import sync_to_async

        this_month_start = current_time.replace(day=1).date()

        existing_months: set[tuple[int, int]] = set(
            await sync_to_async(list)(MonthlySummary.objects.filter(entity=self.entity).values_list("year", "month"))
        )

        weeklies = await sync_to_async(list)(
            WeeklySummary.objects.filter(entity=self.entity, week_start_date__lt=this_month_start)
        )

        monthly_groups: dict[tuple[int, int], list[WeeklySummary]] = {}
        for w in weeklies:
            key = (w.week_start_date.year, w.week_start_date.month)
            if key in existing_months:
                continue
            if key not in monthly_groups:
                monthly_groups[key] = []
            monthly_groups[key].append(w)

        pending = []
        for (year, month), weeklies_in_month in monthly_groups.items():
            parts = []
            for w in weeklies_in_month:
                parts.append(f"[Week of {w.week_start_date}] {w.summary}")
            combined_content = "\n\n".join(parts)
            total_messages = sum([w.message_count for w in weeklies_in_month])
            pending.append(((year, month), combined_content, total_messages))

        if not pending:
            return []

        async with async_text_span("update_monthly_summaries", entity=self.entity) as monthly_span:
            logger.debug(
                f"[ASYNC] Creating {len(pending)} monthly summaries (max {MAX_CONCURRENT_LLM_CALLS} concurrent)"
            )
            from asgiref.sync import sync_to_async

            tasks = []
            for (year, month), content, _ in pending:
                month_start = datetime(year, month, 1, 0, 0, 0)
                month_start = force_timezone(month_start, self.entity.timezone)
                memory_context = await sync_to_async(self._get_memory_context)(
                    min_resolution=PeriodType.MONTHLY,
                    current_time=month_start,
                    max_tokens=15000,
                )
                tasks.append(
                    self._create_summary_async(
                        async_client, content, PeriodType.MONTHLY, existing_memory=memory_context
                    )
                )
            summaries_text = await self._gather_with_limit(tasks)

            updated = []
            for i, ((year, month), _, total_messages) in enumerate(pending):
                summary_text = summaries_text[i]
                if not summary_text or not summary_text.strip():
                    logger.error(
                        f"Failed to create monthly summary for entity {self.entity.id} "
                        f"for {year}-{month:02d} - summary is empty, skipping"
                    )
                    continue
                summary_obj = await sync_to_async(MonthlySummary.objects.create)(
                    entity=self.entity,
                    year=year,
                    month=month,
                    summary=summary_text,
                    message_count=total_messages,
                )
                updated.append(summary_obj)

            monthly_span.output(f"created_count={len(updated)}")
            return updated

    def _get_week_start(self, date: date) -> date:
        """Get Monday of the week for a given date."""
        days_since_monday = date.weekday()
        return date - timedelta(days=days_since_monday)

    async def _create_summary_async(
        self,
        async_client: AsyncOpenAI,
        content: str,
        period_type: PeriodType,
        existing_memory: str | None = None,
        max_retries: int = 3,
    ) -> str | None:
        """Create a summary using the async OpenAI client."""
        logger.debug(f"[ASYNC] Creating {period_type.value} summary")

        async with async_text_span(
            f"create_{period_type.value}_summary",
            metadata={
                "period_type": period_type.value,
                "content_chars": len(content),
                "existing_memory_chars": len(existing_memory or ""),
            },
            entity=self.entity,
        ) as summary_span:
            meta = PERIOD_META[period_type]

            # 5-minute summaries use a simpler, factual extraction prompt
            if period_type == PeriodType.FIVE_MINUTE:
                prompt = dedent(
                    f"""
                    Extract key facts from these messages. Be factual and lossless - preserve all important details.

                    MESSAGES:
                    {content}

                    Extract and preserve:
                    - Student info (name, grade, course) if mentioned
                    - Specific content/topics worked on with difficulty level
                    - Performance observations (correct/incorrect, needed help, self-corrected)
                    - Exact errors made (the actual mistake, not just "struggled")
                    - Behavioral notes (engagement, preferences, mood)
                    - Session events (joined, left, changed activity)

                    Write 1-3 concise sentences. State facts directly without narrative framing.
                    Do NOT infer or add information not explicitly in the messages.

                    Summary:
                    """
                )
            else:
                # Higher-level summaries use narrative style with historical context
                has_history = existing_memory and existing_memory.strip()
                history_instruction = ""
                if has_history:
                    history_instruction = dedent(
                        """
                        IMPORTANT - Use the historical context to:
                        - Note any PROGRESSION or REGRESSION compared to past performance on the same content
                        - Identify patterns that are CONTINUING or BREAKING from previous sessions
                        - Highlight connections to topics or skills worked on before
                        - Call out if something that was previously difficult is now easier (or vice versa)
                        - Reference specific past context when relevant (e.g., "improved from last week's struggles with X")
                        """
                    )

                prompt = dedent(
                    f"""
                    You are an AI assistant creating a memory summary from {meta.time_period}. Write in
                    FIRST PERSON ("I worked with...", "I helped with...").

                    Keep your summary to {meta.max_length} maximum.

                    {"=== HISTORICAL CONTEXT ===" if has_history else ""}
                    {"This is your memory from previous sessions. Use this to identify patterns, progressions, or connections:" if has_history else ""}

                    {existing_memory if has_history else ""}

                    {"=== END HISTORICAL CONTEXT ===" if has_history else ""}

                    {history_instruction}

                    === NEW CONTENT TO SUMMARIZE ===
                    {content}
                    === END NEW CONTENT ===

                    For your summary focus on things like:
                    {meta.focus}

                    A good summary for this time period looks like this:
                    {meta.example}

                    CRITICAL: Only use information explicitly stated above. Do NOT add details or infer anything.
                    When referencing historical patterns, only mention them if directly relevant to the new content.

                    Your summary:
                    """
                )

            last_err: Exception | None = None
            for attempt in range(max_retries):
                try:
                    resp = await async_client.responses.create(
                        model="gpt-5.2",
                        reasoning={"effort": "medium"},
                        input=[{"role": "system", "content": prompt}],
                        max_output_tokens=500,
                    )
                    # Accumulate usage
                    usage = getattr(resp, "usage", None)
                    if usage is not None:
                        in_tokens = getattr(usage, "input_tokens", 0)
                        out_tokens = getattr(usage, "output_tokens", 0)
                        self.total_usage["input_tokens"] += in_tokens
                        self.total_usage["output_tokens"] += out_tokens

                        # Track cost for this summary
                        try:
                            account_phone = self.entity.account.account_phone if self.entity.account else None
                            track_llm_cost(
                                usage=usage,
                                model="gpt-5.2",
                                account_phone=account_phone,
                                category="memory_summarization",
                                provider="openai",
                            )
                        except Exception as e:
                            logger.warning(f"Failed to track memory summarization cost: {e}")

                    text = getattr(resp, "output_text", None)
                    result = text.strip() if text else None
                    summary_span.output(result or "")
                    return result
                except Exception as e:
                    last_err = e
                    await asyncio.sleep(min(2**attempt, 8) + (attempt * 0.1))

            logger.error(f"Async summary creation failed after {max_retries} attempts: {last_err}")
            summary_span.set_metadata(error=str(last_err))
            return None
