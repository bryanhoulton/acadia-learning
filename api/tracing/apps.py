import os

from django.apps import AppConfig


class TracingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "tracing"
    verbose_name = "Tracing"

    def ready(self) -> None:
        # Only instrument if OTEL is configured
        if not os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
            return

        from opentelemetry.instrumentation.celery import CeleryInstrumentor
        from opentelemetry.instrumentation.django import DjangoInstrumentor
        from opentelemetry.instrumentation.requests import RequestsInstrumentor

        DjangoInstrumentor().instrument()
        CeleryInstrumentor().instrument()
        RequestsInstrumentor().instrument()
