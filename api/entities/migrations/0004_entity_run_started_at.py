from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("entities", "0003_alter_entity_timezone"),
    ]

    operations = [
        migrations.AddField(
            model_name="entity",
            name="run_started_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
