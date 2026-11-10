from django.urls import path

from .views import ActiveSessionsView, ShadowTokenView

urlpatterns = [
    path("active/", ActiveSessionsView.as_view(), name="active-sessions"),
    path("shadow-token/", ShadowTokenView.as_view(), name="shadow-token"),
]
