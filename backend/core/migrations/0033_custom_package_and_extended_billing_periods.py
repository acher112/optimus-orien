# Generated migration for custom package support and extended multi-year billing periods

from decimal import Decimal
from django.db import migrations


def seed_custom_plan_and_extended_periods(apps, schema_editor):
    Plan = apps.get_model('core', 'Plan')
    BillingPeriod = apps.get_model('core', 'BillingPeriod')

    # Seed Custom Plan
    Plan.objects.get_or_create(
        code='custom',
        defaults={
            'name': 'Custom Package',
            'name_ur': 'کسٹم پیکیج',
            'tagline': 'Tailored Modular Suite',
            'tagline_ur': 'آپ کی ضروریات کے مطابق تیار کردہ پیکیج',
            'description': 'Configure student count, choose individual academic and operations modules, and pick multi-year terms with volume savings.',
            'description_ur': 'طلباء کی تعداد، درکار ماڈیولز اور کثیر سالہ مدت کا انتخاب کریں اور اپنی مرضی کے مطابق پیکیج بنائیں۔',
            'price_usd_per_student': Decimal('0.70'),
            'price_pkr_per_student': Decimal('195.00'),
            'display_order': 3,
            'is_active': True,
        }
    )

    # Seed extended multi-year billing periods (24, 36, 60 months)
    extended_periods = [
        (24, Decimal('20.00'), 5),
        (36, Decimal('25.00'), 6),
        (60, Decimal('30.00'), 7),
    ]
    for months, discount, order in extended_periods:
        BillingPeriod.objects.get_or_create(
            months=months,
            defaults={
                'discount_percentage': discount,
                'is_active': True,
                'display_order': order,
            }
        )


def reverse_custom_plan_and_extended_periods(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0032_no_trial_billing_periods_upgrade_credit'),
    ]

    operations = [
        migrations.RunPython(seed_custom_plan_and_extended_periods, reverse_custom_plan_and_extended_periods),
    ]
