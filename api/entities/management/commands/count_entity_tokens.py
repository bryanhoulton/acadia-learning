import json

import tiktoken
from django.core.management.base import BaseCommand
from django.db.models import Count

from entities.models import Entity, Message


class Command(BaseCommand):
    help = "Find the entity with the most messages and count total tokens via tiktoken"

    def log(self, msg):
        self.stdout.write(msg)
        self.stdout.flush()

    def handle(self, *args, **options):
        self.log("Querying top 20 entities by message count...")

        top = list(Message.objects.values("entity_id").annotate(msg_count=Count("id")).order_by("-msg_count")[:20])

        if not top:
            self.log("No messages found.")
            return

        self.log("\nTop 20 entities by message count:")
        for row in top:
            entity = Entity.objects.get(id=row["entity_id"])
            self.log(f"  Entity {row['entity_id']:>4} ({entity.name:>20}): {row['msg_count']:>7,} messages")

        enc = tiktoken.get_encoding("o200k_base")
        results = []

        self.log("\nCounting tokens for each entity...\n")

        for i, row in enumerate(top):
            entity_id = row["entity_id"]
            msg_count = row["msg_count"]
            entity = Entity.objects.get(id=entity_id)
            self.log(f"[{i + 1}/20] Entity {entity_id} ({entity.name}) — {msg_count:,} messages...")

            total_tokens = 0
            processed = 0
            for msg in Message.objects.filter(entity_id=entity_id).iterator(chunk_size=1000):
                total_tokens += len(enc.encode(json.dumps(msg.message_data)))
                processed += 1
                if processed % 10000 == 0:
                    self.log(f"    {processed:,}/{msg_count:,} msgs, {total_tokens:,} tokens so far")

            results.append((entity_id, entity.name, msg_count, total_tokens))
            self.log(f"    => {total_tokens:,} tokens\n")

        results.sort(key=lambda x: -x[3])
        self.log(f"{'=' * 70}")
        self.log("RANKED BY TOKEN COUNT:")
        for entity_id, name, msg_count, total_tokens in results:
            self.log(f"  Entity {entity_id:>4} ({name:>20}): {total_tokens:>12,} tokens | {msg_count:>7,} msgs")
