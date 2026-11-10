from django.urls import path

from . import views

urlpatterns = [
    # Admin list endpoints
    path("traces/list/", views.list_traces, name="list_traces"),
    path("entities/list/", views.list_entities_for_filter, name="list_entities_for_filter"),
    # Traces
    path("traces/", views.create_trace, name="create_trace"),
    path("traces/<uuid:trace_id>/", views.get_trace, name="get_trace"),
    path("traces/<uuid:trace_id>/end/", views.end_trace, name="end_trace"),
    path("traces/<uuid:trace_id>/timeline/", views.get_trace_timeline, name="get_trace_timeline"),
    # Spans
    path("spans/", views.create_span, name="create_span"),
    path("spans/<uuid:span_id>/", views.get_span, name="get_span"),
    path("spans/<uuid:span_id>/update/", views.update_span, name="update_span"),
    path("spans/<uuid:span_id>/flag/", views.flag_span, name="flag_span"),
    path("spans/<uuid:span_id>/unflag/", views.unflag_span, name="unflag_span"),
    # Entity/Session lookups
    path("entities/<int:entity_id>/traces/", views.list_entity_traces, name="list_entity_traces"),
    path("sessions/<uuid:session_id>/traces/", views.list_session_traces, name="list_session_traces"),
    # Evals
    path("evals/", views.create_eval, name="create_eval"),
    path("evals/list/", views.list_evals, name="list_evals"),
    path("evals/categories/", views.list_eval_categories, name="list_eval_categories"),
    path("evals/<uuid:eval_id>/", views.get_eval, name="get_eval"),
    path("evals/<uuid:eval_id>/update/", views.update_eval, name="update_eval"),
    path("evals/<uuid:eval_id>/delete/", views.delete_eval, name="delete_eval"),
]
