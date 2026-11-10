"""
URL patterns for utility endpoints.
"""

from django.urls import path

from .views import (
    BlogView,
    HealthCheckView,
)

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health_check"),
    path("blog/", BlogView.as_view(), name="blog"),
]
