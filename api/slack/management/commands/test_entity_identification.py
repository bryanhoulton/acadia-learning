import logging

from django.core.management.base import BaseCommand

from ...tasks import process_entity_identification

logger = logging.getLogger("django")
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Test entity identification workflow with a sample question"  # noqa: A003

    def add_arguments(self, parser):
        parser.add_argument(
            "question",
            type=str,
            help="Question or statement to identify entities with (e.g., 'Who likes math?')",
        )
        parser.add_argument(
            "--channel",
            type=str,
            default="C08C3JA0YRW",
            help="Slack channel ID - find this by right-clicking channel > View details",
        )
        parser.add_argument(
            "--thread",
            type=str,
            default=None,
            help="Slack thread timestamp (optional, will post in channel if not provided)",
        )
        parser.add_argument(
            "--paid",
            action="store_true",
            help="Only search entities from paid accounts (accounts with stripe_customer_id)",
        )

    def handle(self, *args, **options):
        question = options["question"]
        channel_id = options["channel"]
        thread_ts = options["thread"]
        paid_only = options["paid"]

        logger.info("=" * 80)
        logger.info("TESTING ENTITY IDENTIFICATION WORKFLOW")
        logger.info("=" * 80)
        logger.info(f"Question: {question}")
        logger.info(f"Channel: {channel_id}")
        logger.info(f"Thread: {thread_ts or 'None (will post to channel)'}")
        logger.info(f"Paid only: {paid_only}")
        logger.info("=" * 80)

        # Trigger the Celery task
        logger.info("Triggering process_entity_identification task...")
        process_entity_identification.delay(question, channel_id, thread_ts, paid_only)

        logger.info("✅ Task queued successfully!")
        logger.info("Check Slack for real-time progress updates.")
        logger.info("=" * 80)
