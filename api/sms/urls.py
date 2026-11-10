from django.urls import path

from .views import linq_webhook, twilio_webhook

# SMS webhooks for different providers
# All entity-related functionality now handled by adapters and tools
urlpatterns = [
    path("webhook/", twilio_webhook, name="twilio_webhook"),
    path("linq/webhook/", linq_webhook, name="linq_webhook"),
]
