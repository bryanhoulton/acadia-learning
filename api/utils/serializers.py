import json
import uuid
from enum import Enum

from rest_framework import serializers


class SuccessResponseSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    message = serializers.CharField()

    @classmethod
    def from_serializer_errors(cls, serializer: serializers.Serializer):
        return {
            "success": serializer.is_valid(),
            "message": json.dumps(serializer.errors),
        }


class ErrorSerializer(serializers.Serializer):
    error = serializers.CharField()


class UUIDJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles UUID objects and Enum objects by converting them to strings."""

    def default(self, obj):
        if isinstance(obj, uuid.UUID):
            return str(obj)
        if isinstance(obj, Enum):
            return obj.value
        return super().default(obj)
