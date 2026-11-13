# Generated migration for seeding 6-month billing period with 5% discount

from decimal import Decimal
from django.db import migrations


def seed_six_month_billing_period(apps, schema_editor):
    BillingPeriod = apps.get_model('core', 'BillingPeriod')

    # Seed 6-month billing period (5.00% discount)
    BillingPeriod.objects.get_or_create(
        months=6,
        defaults={
            'discount_percentage': Decimal('5.00'),
            'is_active': True,
            'display_order': 2,
        }
    )


def reverse_six_month_billing_period(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0036_alter_announcement_target_role_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_six_month_billing_period, reverse_six_month_billing_period),
    ]
