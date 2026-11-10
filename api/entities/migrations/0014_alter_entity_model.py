# Generated migration to update entity model default from gpt-5.1 to gpt-5.2 and migrate all non-gpt-5.2 entities to gpt-5.2

from django.db import migrations, models


def migrate_entity_models(apps, schema_editor):
    """Migrate all entities that aren't gpt-5.2 to gpt-5.2"""
    Entity = apps.get_model("entities", "Entity")
    Entity.objects.exclude(model="gpt-5.2").update(model="gpt-5.2")


def reverse_migrate_entity_models(apps, schema_editor):
    """Reverse migration: migrate all entities from gpt-5.2 back to gpt-5.1"""
    Entity = apps.get_model("entities", "Entity")
    Entity.objects.filter(model="gpt-5.2").update(model="gpt-5.1")


class Migration(migrations.Migration):
    dependencies = [
        ("entities", "0013_add_annotation_created_by"),
    ]

    operations = [
        migrations.RunPython(migrate_entity_models, reverse_migrate_entity_models),
        migrations.AlterField(
            model_name="entity",
            name="model",
            field=models.CharField(default="gpt-5.2", max_length=255),
        ),
    ]
