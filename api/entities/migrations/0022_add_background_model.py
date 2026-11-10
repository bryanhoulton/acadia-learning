# Generated migration to add background_model field to Entity

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("entities", "0021_rename_model_to_session_model"),
    ]

    operations = [
        migrations.AddField(
            model_name="entity",
            name="background_model",
            field=models.CharField(max_length=255, default="claude-sonnet-4-5"),
        ),
    ]
