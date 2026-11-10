# Generated manually to remove unused field

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("lms_accounts", "0019_merge_20260201_0613"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="userprofile",
            name="classroom_canvas_blocks",
        ),
    ]
