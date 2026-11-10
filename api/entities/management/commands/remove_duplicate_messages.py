import hashlib
import json
import logging
import random

from django.core.management.base import BaseCommand
from tqdm import tqdm

from ...models import Message

logger = logging.getLogger("django")
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Remove duplicate messages, keeping only the first instance"  # noqa: A003

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be deleted without actually deleting",
        )
        parser.add_argument(
            "--entity-id",
            type=int,
            help="Limit to a specific entity ID",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        entity_id = options.get("entity_id")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE - No changes will be made"))

        # Build queryset
        messages_qs = Message.objects.all()
        if entity_id:
            messages_qs = messages_qs.filter(entity_id=entity_id)
            self.stdout.write(f"Filtering for entity ID: {entity_id}")

        # Get all messages ordered by created_at
        messages = messages_qs.select_related("entity").order_by("entity", "created_at")
        total_messages = messages.count()
        self.stdout.write(f"Total messages to process: {total_messages}")

        # Track seen message signatures
        seen_signatures = set()
        duplicates_to_delete = []

        for message in tqdm(messages.iterator(chunk_size=500), total=total_messages):
            if message.entity is None:
                continue
            if "system" in message.message_data:
                continue

            # Create a signature for the message based on entity, message_data, and timestamp
            signature_data = {
                "entity_id": message.entity.id,
                "message_data": message.message_data,
            }
            # Create a hash of the signature
            signature_json = json.dumps(signature_data, sort_keys=True)
            signature_hash = hashlib.sha256(signature_json.encode()).hexdigest()

            if signature_hash in seen_signatures:
                # This is a duplicate
                duplicates_to_delete.append(message.id)
            else:
                # This is the first instance, keep it
                seen_signatures.add(signature_hash)

        # Report findings
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write(f"Total messages processed: {total_messages}")
        self.stdout.write(f"Unique messages: {len(seen_signatures)}")
        self.stdout.write(f"Duplicates found: {len(duplicates_to_delete)}")
        self.stdout.write("=" * 80 + "\n")

        if not duplicates_to_delete:
            self.stdout.write(self.style.SUCCESS("No duplicate messages found!"))
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(f"\nDRY RUN: Would delete {len(duplicates_to_delete)} duplicate messages")
            )

            # Randomly select 10 duplicates to print
            random.shuffle(duplicates_to_delete)
            for i in range(10):
                if i >= len(duplicates_to_delete):
                    break
                message = Message.objects.get(id=duplicates_to_delete[i])
                self.stdout.write(f"Duplicate: {message}: {message.message_data}")

            self.stdout.write("Run without --dry-run to actually delete them")
        else:
            # Actually delete the duplicates
            self.stdout.write("Deleting duplicate messages...")
            deleted_count = Message.objects.filter(id__in=duplicates_to_delete).delete()[0]
            self.stdout.write(self.style.SUCCESS(f"Successfully deleted {deleted_count} duplicate messages"))
