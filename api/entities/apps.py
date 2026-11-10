import logging

import posthog
import stripe
from django.apps import AppConfig
from django.conf import settings

logger = logging.getLogger(__name__)


class EntitiesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "entities"

    def ready(self):
        posthog.api_key = settings.POSTHOG_API_KEY
        posthog.host = settings.POSTHOG_HOST
        posthog.sync_mode = False  # Async mode for better performance, now that we have error handling

        if settings.DEBUG or settings.TESTING:
            logger.info("Disabling PostHog in debug mode")
            posthog.disabled = True

        stripe.api_key = settings.STRIPE_SECRET_KEY

        try:
            from .adapters import (
                documents,  # noqa: F401
                emails,  # noqa: F401
                lms,  # noqa: F401
                sessions,  # noqa: F401
                sms,  # noqa: F401
                sms_linq,  # noqa: F401
                system,  # noqa: F401
            )

            logger.info("Adapters imported successfully")
        except Exception as import_exc:  # noqa: BLE001
            # Avoid crashing if dependencies missing during e.g. migrations
            logger.debug("Adapter import failed: %s", import_exc)
