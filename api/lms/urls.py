from django.urls import include, path

urlpatterns = [
    path("calendars/", include("lms.calendars.urls")),
    path("accounts/", include("lms.accounts.urls")),
    path("sessions/", include("lms.sessions.urls")),
]
