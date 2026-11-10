import logging

from django.core.management.base import BaseCommand, CommandError

from entities.models import Entity

logger = logging.getLogger("django")
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Shift an entity's time by a certain number of minutes"  # noqa: A003

    def add_arguments(self, parser):
        parser.add_argument("entity_id", type=int, help="ID of entity")
        parser.add_argument("minutes", type=int, help="Number of minutes to shift")

    def handle(self, *args, **options):
        entity_id = options["entity_id"]
        minutes = options["minutes"]

        try:
            entity = Entity.objects.get(pk=entity_id)
        except Entity.DoesNotExist as e:
            raise CommandError(f"Entity with ID {entity_id} does not exist") from e

        entity.time_offset += minutes
        entity.save(update_fields=["time_offset"])

        logger.info(f"Time offset for entity {entity_id} shifted by {minutes} minutes")
