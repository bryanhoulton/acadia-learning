# Generated manually to backfill referral codes and make field required

import random
import string

from django.db import migrations, models


def generate_referral_codes(apps, schema_editor):
    """Generate referral codes for accounts that don't have them."""
    Account = apps.get_model("lms_accounts", "Account")

    # Get all accounts without referral codes
    accounts_without_codes = Account.objects.filter(models.Q(referral_code__isnull=True) | models.Q(referral_code=""))

    print(f"Generating referral codes for {accounts_without_codes.count()} accounts...")

    for account in accounts_without_codes:
        # Generate a unique referral code
        while True:
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
            # Check if it's unique
            if not Account.objects.filter(referral_code=code).exists():
                account.referral_code = code
                account.save(update_fields=["referral_code"])
                break

    print(f"Successfully generated {accounts_without_codes.count()} referral codes")


class Migration(migrations.Migration):
    dependencies = [
        ("lms_accounts", "0011_add_referral_system"),
    ]

    operations = [
        # First, backfill existing accounts with referral codes
        migrations.RunPython(generate_referral_codes, migrations.RunPython.noop),
        # Then, alter the field to be NOT NULL
        migrations.AlterField(
            model_name="account",
            name="referral_code",
            field=models.CharField(
                help_text="Unique referral code for this account",
                max_length=10,
                unique=True,
            ),
        ),
    ]
