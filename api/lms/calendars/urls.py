from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import GoalViewSet, TaskViewSet, TokenView

router = DefaultRouter()
router.register(r"tasks", TaskViewSet, basename="task")
router.register(r"goals", GoalViewSet, basename="goal")

urlpatterns = [
    path("", include(router.urls)),
    path("token/", TokenView.as_view(), name="token"),
]
