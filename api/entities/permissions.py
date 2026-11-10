from typing import Union

from django.core.handlers.wsgi import WSGIRequest
from rest_framework.permissions import BasePermission
from rest_framework.request import Request


class EntityOnlyPermission(BasePermission):
    """
    Permission for entity-only endpoints.
    Only autonomous agents can access these.
    """

    def has_permission(self, request: Union[WSGIRequest, Request], view):
        if not hasattr(request, "auth"):
            return False

        return request.auth == "entity" and hasattr(request.user, "api_key")  # type: ignore
