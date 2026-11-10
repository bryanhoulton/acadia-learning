from django.urls import path

from .views import announce, ask, identify, handle_interaction

urlpatterns = [
    path("announce/", announce, name="announce"),
    path("ask/", ask, name="ask"),
    path("identify/", identify, name="identify"),
    path("handle-interaction/", handle_interaction, name="handle_interaction"),
]
