from typing import Union

from django.core.handlers.wsgi import WSGIRequest
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request

from .models import Entity


class EntityRequest(Request):
    user: Entity


class EntityAuthentication(BaseAuthentication):
    """
    Authentication for autonomous entities/agents.
    Uses entity-specific API keys with agent identification.
    """

    def authenticate(self, request: Union[WSGIRequest, Request]) -> tuple[Entity, str] | None:
        entity_key = request.META.get("HTTP_X_ENTITY_API_KEY")
        if not entity_key:
            return None

        try:
            entity = Entity.objects.get(api_key=entity_key)
            return (entity, "entity")
        except Entity.DoesNotExist:
            raise AuthenticationFailed("Invalid entity API key")


class EntityAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "entities.authentication.EntityAuthentication"  # full import path OR class ref
    name = "EntityAuthentication"  # name used in the schema

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "X-ENTITY-API-KEY",
        }
