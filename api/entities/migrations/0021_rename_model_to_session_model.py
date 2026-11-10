# Generated migration to rename entity model field to session_model

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("entities", "0020_session_leveling_assessment"),
    ]

    operations = [
        migrations.RenameField(
            model_name="entity",
            old_name="model",
            new_name="session_model",
        ),
        migrations.AlterField(
            model_name="entity",
            name="session_model",
            field=models.CharField(max_length=255, default="claude-haiku-4-5"),
        ),
    ]
