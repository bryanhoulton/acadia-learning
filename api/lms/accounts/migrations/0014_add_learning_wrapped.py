# Generated manually for Learning Wrapped feature

import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("lms_accounts", "0013_account_is_locked"),
    ]

    operations = [
        migrations.CreateModel(
            name="LearningWrapped",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "year",
                    models.IntegerField(help_text="The year this wrapped is for (e.g., 2025)"),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "data",
                    models.JSONField(
                        help_text="Complete wrapped data including time stats, progress, patterns, breakthroughs, and tutor observations"
                    ),
                ),
                (
                    "user_profile",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="learning_wrapped",
                        to="lms_accounts.userprofile",
                    ),
                ),
            ],
            options={
                "verbose_name": "Learning Wrapped",
                "verbose_name_plural": "Learning Wrappeds",
                "ordering": ["-year", "-created_at"],
                "unique_together": {("user_profile", "year")},
            },
        ),
    ]
