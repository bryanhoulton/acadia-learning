import json
import os
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand

from entities.models import Entity, Message


def write_jsonl(path: str, rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


class Command(BaseCommand):
    help = "Export all messages for an entity into an eval dataset JSONL file"

    def add_arguments(self, parser):
        parser.add_argument("--entity-id", type=int, default=None, help="Entity ID to export")
        parser.add_argument(
            "--outfile",
            type=str,
            default="example_all_messages.jsonl",
            help="Output dataset filename (under entities/memory_evals/datasets)",
        )
        parser.add_argument(
            "--max-date",
            type=str,
            default=None,
            help="Maximum date to export messages (ISO format, e.g., 2024-01-31)",
        )

    def handle(self, *args, **options):
        base_dir = os.path.join(settings.BASE_DIR, "entities", "memory_evals", "datasets")
        outfile = (
            os.path.join(base_dir, options["outfile"]) if not options["outfile"].startswith("/") else options["outfile"]
        )

        entity_id = options["entity_id"]
        if entity_id is None:
            # Pick most active entity overall
            counts: dict[int, int] = defaultdict(int)
            for eid in Message.objects.values_list("entity_id", flat=True):
                counts[int(eid)] += 1
            if not counts:
                self.stdout.write("No messages found; aborting export.")
                return
            entity_id = max(counts, key=lambda k: counts[k])

        entity = Entity.objects.get(id=entity_id)
        tz = ZoneInfo(entity.timezone)

        # Build query filters
        query_filters = {"entity": entity}
        max_date = options.get("max_date")
        if max_date:
            max_datetime = datetime.fromisoformat(max_date).replace(tzinfo=tz)
            query_filters["timestamp__lte"] = max_datetime

        rows: list[dict] = []
        for m in Message.objects.filter(**query_filters).order_by("timestamp"):
            rows.append(
                {
                    "timestamp": m.timestamp.astimezone(tz).isoformat(),
                    "message_data": m.message_data,
                }
            )

        write_jsonl(outfile, rows)
        self.stdout.write(self.style.SUCCESS(f"Exported {len(rows)} messages for entity {entity_id} to {outfile}"))
