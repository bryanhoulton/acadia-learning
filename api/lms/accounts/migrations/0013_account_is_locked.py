# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("lms_accounts", "0012_backfill_and_require_referral_codes"),
    ]

    operations = [
        migrations.AddField(
            model_name="account",
            name="is_locked",
            field=models.BooleanField(
                default=False,
                help_text="If True, account cannot start new classroom sessions unless paid",
            ),
        ),
    ]
