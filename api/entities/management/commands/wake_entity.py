import logging

from django.core.management.base import BaseCommand, CommandError

from ...models import Entity
from ...tasks import possibly_run_entity

logger = logging.getLogger("django")
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Wake a single entity by ID"  # noqa: A003

    def add_arguments(self, parser):
        parser.add_argument("entity_id", type=int, help="ID of the entity to wake")

    def handle(self, *args, **options):
        entity_id = options["entity_id"]
        if not Entity.objects.filter(pk=entity_id).exists():
            raise CommandError(f"Entity {entity_id} does not exist")
        logger.info(f"Scheduling entity {entity_id} wakeup")
        possibly_run_entity(entity_id, wakeup=True)
        logger.info(f"Entity {entity_id} wakeup task scheduled")
