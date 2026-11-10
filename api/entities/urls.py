from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AnnotationViewSet,
    DocumentViewSet,
    EntityContextView,
    EntityDocumentDetailView,
    EntityDocumentsView,
    EntityEmailReplyView,
    EntityEmailSendView,
    EntityEmailThreadDetailView,
    EntityEmailThreadsView,
    EntityExecuteToolView,
    EntityGoalDetailView,
    EntityGoalsView,
    EntityJoinCallView,
    EntityLeaveCallView,
    EntityListView,
    EntityMemoryView,
    EntitySMSListView,
    EntitySMSReactView,
    EntitySMSSendView,
    EntityTaskDetailView,
    EntityTasksView,
    EntityTimelineView,
    EntityUserProfilesView,
    SessionViewSet,
    livekit_webhook,
)

router = DefaultRouter()
router.register(r"documents", DocumentViewSet, basename="documents")
router.register(r"sessions", SessionViewSet, basename="sessions")
router.register(r"annotations", AnnotationViewSet, basename="annotations")

urlpatterns = [
    path("memory/<int:entity_id>/", EntityMemoryView.as_view(), name="entity_memory"),
    path(
        "join-call/",
        EntityJoinCallView.as_view(),
        name="entity_join_call",
    ),
    path(
        "leave-call/",
        EntityLeaveCallView.as_view(),
        name="entity_leave_call",
    ),
    path("livekit-webhook/", livekit_webhook, name="livekit_webhook"),
    # Entity Control Panel endpoints (admin-only)
    path("control/", EntityListView.as_view(), name="entity_list"),
    path("control/<int:entity_id>/", EntityContextView.as_view(), name="entity_context"),
    path("control/<int:entity_id>/timeline/", EntityTimelineView.as_view(), name="entity_timeline"),
    path("control/<int:entity_id>/execute/", EntityExecuteToolView.as_view(), name="entity_execute_tool"),
    path("control/<int:entity_id>/profiles/", EntityUserProfilesView.as_view(), name="entity_profiles"),
    # SMS
    path("control/<int:entity_id>/sms/", EntitySMSListView.as_view(), name="entity_sms_list"),
    path("control/<int:entity_id>/sms/send/", EntitySMSSendView.as_view(), name="entity_sms_send"),
    path("control/<int:entity_id>/sms/react/", EntitySMSReactView.as_view(), name="entity_sms_react"),
    # Email
    path("control/<int:entity_id>/email/threads/", EntityEmailThreadsView.as_view(), name="entity_email_threads"),
    path(
        "control/<int:entity_id>/email/threads/<str:thread_id>/",
        EntityEmailThreadDetailView.as_view(),
        name="entity_email_thread_detail",
    ),
    path("control/<int:entity_id>/email/reply/", EntityEmailReplyView.as_view(), name="entity_email_reply"),
    path("control/<int:entity_id>/email/send/", EntityEmailSendView.as_view(), name="entity_email_send"),
    # Documents
    path("control/<int:entity_id>/documents/", EntityDocumentsView.as_view(), name="entity_documents"),
    path(
        "control/<int:entity_id>/documents/<str:document_id>/",
        EntityDocumentDetailView.as_view(),
        name="entity_document_detail",
    ),
    # Tasks
    path("control/<int:entity_id>/tasks/", EntityTasksView.as_view(), name="entity_tasks"),
    path("control/<int:entity_id>/tasks/<str:task_id>/", EntityTaskDetailView.as_view(), name="entity_task_detail"),
    # Goals
    path("control/<int:entity_id>/goals/", EntityGoalsView.as_view(), name="entity_goals"),
    path("control/<int:entity_id>/goals/<str:goal_id>/", EntityGoalDetailView.as_view(), name="entity_goal_detail"),
    path("", include(router.urls)),
]
