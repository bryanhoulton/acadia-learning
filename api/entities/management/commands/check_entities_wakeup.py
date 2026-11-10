import logging

from django.core.management.base import BaseCommand

from ...tasks import check_entities_wakeup

logger = logging.getLogger("django")
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Enqueue a Celery task to check whether entities should wake up"  # noqa: A003

    def handle(self, *args, **options):
        logger.info("Scheduling entities.check_wakeup task")
        check_entities_wakeup.delay()
        logger.info("Task scheduled")
