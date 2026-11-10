import logging

from django.core.management.base import BaseCommand

from entities.memory.summarizer import SummaryUpdater
from entities.models import (
    DailySummary,
    Entity,
    FiveMinuteSummary,
    HourlySummary,
    MonthlySummary,
    WeeklySummary,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Delete and recompute memory summaries for entities, one tier at a time"

    def add_arguments(self, parser):
        parser.add_argument(
            "entity_names",
            nargs="+",
            type=str,
            help="Entity names or IDs to recompute memory for (case-insensitive for names)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted and recomputed without making changes",
        )

    def handle(self, *args, **options):
        entity_identifiers = options["entity_names"]

        # Find entities by name (case-insensitive) or ID
        from django.db.models import Q

        query = Q()
        entity_ids = []
        entity_names = []

        for identifier in entity_identifiers:
            # Try to parse as integer ID
            try:
                entity_id = int(identifier)
                entity_ids.append(entity_id)
            except ValueError:
                # Not an ID, treat as name
                entity_names.append(identifier.lower())

        # Build query for names (case-insensitive)
        if entity_names:
            name_query = Q()
            for name in entity_names:
                name_query |= Q(name__iexact=name)
            query |= name_query

        # Add ID query
        if entity_ids:
            query |= Q(id__in=entity_ids)

        entities = Entity.objects.filter(query)
        found_ids = {e.id for e in entities}
        found_names = {e.name.lower() for e in entities}

        # Check for missing entities
        missing = []
        for identifier in entity_identifiers:
            try:
                entity_id = int(identifier)
                if entity_id not in found_ids:
                    missing.append(identifier)
            except ValueError:
                if identifier.lower() not in found_names:
                    missing.append(identifier)

        if missing:
            self.stdout.write(self.style.ERROR(f"Entities not found: {', '.join(missing)}"))
            return

        if not entities.exists():
            self.stdout.write(self.style.ERROR("No entities found"))
            return

        self.stdout.write(self.style.SUCCESS(f"Found {entities.count()} entity/entities:"))
        for entity in entities:
            self.stdout.write(f"  - {entity.name} (ID: {entity.id})")

        # Confirm before proceeding
        dry_run = options.get("dry_run", False)
        self.stdout.write("\n" + "=" * 60)
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE - No changes will be made"))
        else:
            self.stdout.write(
                self.style.WARNING("This will DELETE and RECOMPUTE all memory summaries for these entities.")
            )
        self.stdout.write("=" * 60)

        # Process each entity, one at a time
        total_entities = entities.count()
        for idx, entity in enumerate(entities, 1):
            self.stdout.write(f"\n{'=' * 60}")
            self.stdout.write(
                self.style.SUCCESS(f"Processing entity {idx}/{total_entities}: {entity.name} (ID: {entity.id})")
            )
            self.stdout.write("=" * 60)

            self._recompute_entity_memory_tier_by_tier(entity, dry_run=dry_run)

            # Show completion for this entity before moving to next
            if idx < total_entities:
                self.stdout.write(f"\n{'=' * 60}")
                self.stdout.write(
                    self.style.SUCCESS(f"✓ Completed entity {idx}/{total_entities}. Moving to next entity...")
                )
                self.stdout.write("=" * 60)

    def _recompute_entity_memory_tier_by_tier(self, entity: Entity, dry_run: bool = False):
        """Delete and recompute summaries one tier at a time, bottom-up."""
        current_time = entity.current_time
        summarizer = SummaryUpdater(entity)

        # Tier 1: FiveMinuteSummary (from Messages)
        self.stdout.write("\n[1/5] Processing FiveMinuteSummary...")
        count_before = FiveMinuteSummary.objects.filter(entity=entity).count()
        self.stdout.write(f"  Found {count_before} existing summaries")

        if dry_run:
            if count_before > 0:
                self.stdout.write(f"  [DRY RUN] Would delete {count_before} summaries")
            else:
                self.stdout.write("  [DRY RUN] No summaries to delete")

            # Estimate how many would be created
            from datetime import timedelta

            from entities.models import Message
            from utils.timezone import force_timezone

            cutoff = current_time.replace(second=0, microsecond=0) - timedelta(minutes=5)
            messages = Message.objects.filter(entity=entity, timestamp__lt=cutoff).values_list("timestamp", flat=True)

            five_minute_groups = set()
            for timestamp in messages:
                local_time = force_timezone(timestamp, entity.timezone)
                minute_bucket = (local_time.minute // 5) * 5
                key = (local_time.date(), local_time.hour, minute_bucket)
                five_minute_groups.add(key)

            self.stdout.write(f"  [DRY RUN] Would create ~{len(five_minute_groups)} FiveMinuteSummary records")
        else:
            if count_before > 0:
                deleted = FiveMinuteSummary.objects.filter(entity=entity).delete()[0]
                self.stdout.write(f"  Deleted {deleted} summaries")
            else:
                self.stdout.write("  No summaries to delete")

            self.stdout.write("  Recomputing FiveMinuteSummary...")
            result = summarizer.update_all(current_time)
            created = result.get("five_minute_created", 0)
            self.stdout.write(self.style.SUCCESS(f"  Created {created} FiveMinuteSummary records"))

        # Tier 2: HourlySummary (from FiveMinuteSummary)
        self.stdout.write("\n[2/5] Processing HourlySummary...")
        count_before = HourlySummary.objects.filter(entity=entity).count()
        self.stdout.write(f"  Found {count_before} existing summaries")

        if dry_run:
            if count_before > 0:
                self.stdout.write(f"  [DRY RUN] Would delete {count_before} summaries")
            else:
                self.stdout.write("  [DRY RUN] No summaries to delete")

            # Estimate based on existing FiveMinuteSummary (in dry-run, they still exist)
            # or estimate from messages if FiveMinuteSummary don't exist yet
            if FiveMinuteSummary.objects.filter(entity=entity).exists():
                five_min_summaries = (
                    FiveMinuteSummary.objects.filter(entity=entity).values_list("date", "hour").distinct()
                )
                hourly_groups = set(five_min_summaries)
            else:
                # Estimate from messages
                from datetime import timedelta

                from entities.models import Message
                from utils.timezone import force_timezone

                cutoff = current_time.replace(second=0, microsecond=0) - timedelta(minutes=5)
                messages = Message.objects.filter(entity=entity, timestamp__lt=cutoff).values_list(
                    "timestamp", flat=True
                )

                hourly_groups = set()
                for timestamp in messages:
                    local_time = force_timezone(timestamp, entity.timezone)
                    key = (local_time.date(), local_time.hour)
                    hourly_groups.add(key)

            self.stdout.write(f"  [DRY RUN] Would create ~{len(hourly_groups)} HourlySummary records")
        else:
            if count_before > 0:
                deleted = HourlySummary.objects.filter(entity=entity).delete()[0]
                self.stdout.write(f"  Deleted {deleted} summaries")
            else:
                self.stdout.write("  No summaries to delete")

            self.stdout.write("  Recomputing HourlySummary...")
            result = summarizer.update_all(current_time)
            created = result.get("hourly_created", 0)
            self.stdout.write(self.style.SUCCESS(f"  Created {created} HourlySummary records"))

        # Tier 3: DailySummary (from HourlySummary)
        self.stdout.write("\n[3/5] Processing DailySummary...")
        count_before = DailySummary.objects.filter(entity=entity).count()
        self.stdout.write(f"  Found {count_before} existing summaries")

        if dry_run:
            if count_before > 0:
                self.stdout.write(f"  [DRY RUN] Would delete {count_before} summaries")
            else:
                self.stdout.write("  [DRY RUN] No summaries to delete")

            # Estimate based on existing HourlySummary
            if HourlySummary.objects.filter(entity=entity).exists():
                daily_groups = HourlySummary.objects.filter(entity=entity).values_list("date", flat=True).distinct()
            else:
                daily_groups = []

            self.stdout.write(f"  [DRY RUN] Would create ~{len(daily_groups)} DailySummary records")
        else:
            if count_before > 0:
                deleted = DailySummary.objects.filter(entity=entity).delete()[0]
                self.stdout.write(f"  Deleted {deleted} summaries")
            else:
                self.stdout.write("  No summaries to delete")

            self.stdout.write("  Recomputing DailySummary...")
            result = summarizer.update_all(current_time)
            created = result.get("daily_created", 0)
            self.stdout.write(self.style.SUCCESS(f"  Created {created} DailySummary records"))

        # Tier 4: WeeklySummary (from DailySummary)
        self.stdout.write("\n[4/5] Processing WeeklySummary...")
        count_before = WeeklySummary.objects.filter(entity=entity).count()
        self.stdout.write(f"  Found {count_before} existing summaries")

        if dry_run:
            if count_before > 0:
                self.stdout.write(f"  [DRY RUN] Would delete {count_before} summaries")
            else:
                self.stdout.write("  [DRY RUN] No summaries to delete")

            # Estimate based on existing DailySummary
            from datetime import timedelta

            if DailySummary.objects.filter(entity=entity).exists():
                dailies = DailySummary.objects.filter(entity=entity).values_list("date", flat=True)
                weekly_groups = set()
                for day in dailies:
                    days_since_monday = day.weekday()
                    week_start = day - timedelta(days=days_since_monday)
                    weekly_groups.add(week_start)
            else:
                weekly_groups = set()

            self.stdout.write(f"  [DRY RUN] Would create ~{len(weekly_groups)} WeeklySummary records")
        else:
            if count_before > 0:
                deleted = WeeklySummary.objects.filter(entity=entity).delete()[0]
                self.stdout.write(f"  Deleted {deleted} summaries")
            else:
                self.stdout.write("  No summaries to delete")

            self.stdout.write("  Recomputing WeeklySummary...")
            result = summarizer.update_all(current_time)
            created = result.get("weekly_created", 0)
            self.stdout.write(self.style.SUCCESS(f"  Created {created} WeeklySummary records"))

        # Tier 5: MonthlySummary (from WeeklySummary)
        self.stdout.write("\n[5/5] Processing MonthlySummary...")
        count_before = MonthlySummary.objects.filter(entity=entity).count()
        self.stdout.write(f"  Found {count_before} existing summaries")

        if dry_run:
            if count_before > 0:
                self.stdout.write(f"  [DRY RUN] Would delete {count_before} summaries")
            else:
                self.stdout.write("  [DRY RUN] No summaries to delete")

            # Estimate based on existing WeeklySummary
            if WeeklySummary.objects.filter(entity=entity).exists():
                weeklies = WeeklySummary.objects.filter(entity=entity).values_list("week_start_date", flat=True)
                monthly_groups = set()
                for week_start in weeklies:
                    key = (week_start.year, week_start.month)
                    monthly_groups.add(key)
            else:
                monthly_groups = set()

            self.stdout.write(f"  [DRY RUN] Would create ~{len(monthly_groups)} MonthlySummary records")
        else:
            if count_before > 0:
                deleted = MonthlySummary.objects.filter(entity=entity).delete()[0]
                self.stdout.write(f"  Deleted {deleted} summaries")
            else:
                self.stdout.write("  No summaries to delete")

            self.stdout.write("  Recomputing MonthlySummary...")
            result = summarizer.update_all(current_time)
            created = result.get("monthly_created", 0)
            self.stdout.write(self.style.SUCCESS(f"  Created {created} MonthlySummary records"))

        # Final summary
        self.stdout.write("\n" + "=" * 60)
        if dry_run:
            self.stdout.write(self.style.SUCCESS(f"✓ [DRY RUN] Preview completed for {entity.name}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"✓ Completed memory recomputation for {entity.name}"))
        self.stdout.write("=" * 60)
