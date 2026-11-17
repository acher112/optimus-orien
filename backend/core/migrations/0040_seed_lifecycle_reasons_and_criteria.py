# Generated migration for seeding default lifecycle reasons

from django.db import migrations


def seed_default_lifecycle_reasons(apps, schema_editor):
    LifecycleReasonCategory = apps.get_model('core', 'LifecycleReasonCategory')

    DEFAULT_STAFF_REASONS = [
        ('hired', 'New Appointment', 'نئی تقرری', 1),
        ('resigned_relocation', 'Resigned - Relocation / Personal', 'استعفیٰ - نقل مکانی / ذاتی', 2),
        ('resigned_career', 'Resigned - Career Growth', 'استعفیٰ - کیریئر کی ترقی', 3),
        ('contract_ended', 'Contract Completion', 'معاہدہ کی تکمیل', 4),
        ('retired', 'Retirement', 'ریٹائرمنٹ', 5),
        ('terminated_disciplinary', 'Separation - Disciplinary', 'علیحدگی - تادیبی', 6),
        ('terminated_performance', 'Separation - Administrative', 'علیحدگی - انتظامی', 7),
        ('transferred_campus', 'Inter-Campus Transfer', 'بین الکیمپس تبادلہ', 8),
        ('rejoined', 'Rejoined Institution', 'دوبارہ شمولیت', 9),
    ]

    DEFAULT_STUDENT_REASONS = [
        ('new_admission', 'New Admission', 'نیا داخلہ', 1),
        ('promoted_annual', 'Annual Promotion', 'سالانہ ترقی', 2),
        ('passed_out_graduated', 'Graduation / Passed Out', 'فارغ التحصیل / تکمیلِ تعلیم', 3),
        ('not_promoted_repeat', 'Not promoted (repeating)', 'اسی جماعت میں برقرار', 4),
        ('withdrawn_relocation', 'Withdrawn - Family Relocation', 'خارج - خاندانی نقل مکانی', 5),
        ('withdrawn_financial', 'Withdrawn - Financial', 'خارج - مالی وجوہات', 6),
        ('transferred_campus', 'Campus Transfer', 'کیمپس کا تبادلہ', 7),
        ('struck_off_absenteeism', 'Struck Off - Chronic Absence', 'خارج - طویل غیر حاضری', 8),
        ('migrated', 'Migrated to Other Board/School', 'دوسرے بورڈ یا اسکول میں منتقلی', 9),
    ]

    for code, name_en, name_ur, order in DEFAULT_STAFF_REASONS:
        LifecycleReasonCategory.objects.get_or_create(
            school=None,
            target_type='staff',
            code=code,
            defaults={
                'name_en': name_en,
                'name_ur': name_ur,
                'display_order': order,
                'is_active': True,
            }
        )

    for code, name_en, name_ur, order in DEFAULT_STUDENT_REASONS:
        LifecycleReasonCategory.objects.get_or_create(
            school=None,
            target_type='student',
            code=code,
            defaults={
                'name_en': name_en,
                'name_ur': name_ur,
                'display_order': order,
                'is_active': True,
            }
        )


def reverse_default_lifecycle_reasons(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0039_school_teachers_can_view_own_performance_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_default_lifecycle_reasons, reverse_default_lifecycle_reasons),
    ]
