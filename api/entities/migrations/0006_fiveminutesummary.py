import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("entities", "0005_document"),
    ]

    operations = [
        migrations.CreateModel(
            name="FiveMinuteSummary",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("date", models.DateField()),
                ("hour", models.IntegerField()),
                ("minute", models.IntegerField()),
                ("summary", models.TextField()),
                ("message_count", models.IntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "entity",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, to="entities.entity"),
                ),
            ],
            options={
                "verbose_name": "Five Minute Summary",
                "verbose_name_plural": "Five Minute Summaries",
                "indexes": [
                    models.Index(fields=["entity", "date", "hour", "minute"], name="idx_5m_entity_date_hour_min"),
                ],
                "unique_together": {("entity", "date", "hour", "minute")},
            },
        ),
    ]
