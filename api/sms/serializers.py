from rest_framework import serializers

from .models import SMSMessage


class SMSMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = SMSMessage
        fields = ["id", "from_number", "to_number", "body", "direction", "created_at"]
        read_only_fields = ["id", "created_at"]
