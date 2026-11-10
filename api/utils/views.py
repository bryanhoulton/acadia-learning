"""
API views for utility functions.
"""

import logging

import os
import requests
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        responses={
            200: OpenApiResponse(
                description="Health check",
            ),
        },
    )
    def get(self, request):
        """
        Simple health check endpoint for service monitoring.

        Returns:
            JsonResponse with status "ok"
        """
        return Response({"status": "ok", "service": "api"})


class BlogSerializer(serializers.Serializer):
    id = serializers.CharField()
    title = serializers.CharField()
    subtitle = serializers.CharField(allow_blank=True, required=False)
    authors = serializers.ListField(child=serializers.CharField(), required=False)
    created = serializers.IntegerField()
    status = serializers.ChoiceField(choices=["draft", "confirmed", "archived", "all"])
    publish_date = serializers.IntegerField()
    displayed_date = serializers.CharField(allow_null=True, required=False)
    split_tested = serializers.BooleanField()
    subject_line = serializers.CharField(allow_blank=True, required=False)
    preview_text = serializers.CharField(allow_blank=True, required=False)
    slug = serializers.CharField()
    thumbnail_url = serializers.CharField(allow_blank=True, required=False)
    web_url = serializers.CharField()
    audience = serializers.CharField()
    platform = serializers.ChoiceField(choices=[("web", "Web"), ("email", "Email"), ("both", "Both")])
    content_tags = serializers.ListField(child=serializers.CharField(), required=False)
    meta_default_description = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    meta_default_title = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    hidden_from_feed = serializers.BooleanField()


class BlogPageSerializer(serializers.Serializer):
    data = BlogSerializer(many=True)  # type: ignore
    page = serializers.IntegerField()
    limit = serializers.IntegerField()
    total_results = serializers.IntegerField()
    total_pages = serializers.IntegerField()


class BlogView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        responses={
            200: BlogPageSerializer,
        },
    )
    def get(self, request):
        url = "https://api.beehiiv.com/v2/publications/pub_fe5464d2-e879-4a92-b0e1-2af356ab8c79/posts?limit=100"
        headers = {"Authorization": "Bearer " + os.environ["BEEHIIV_API_KEY"]}
        response = requests.get(url, headers=headers)
        return Response(response.json())
