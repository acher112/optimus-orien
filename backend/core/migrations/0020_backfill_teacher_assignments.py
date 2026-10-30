from django.db import migrations


def backfill_assignments(apps, schema_editor):
    SchoolClass = apps.get_model('core', 'SchoolClass')
    ClassTeacherAssignment = apps.get_model('core', 'ClassTeacherAssignment')
    Assessment = apps.get_model('core', 'Assessment')
    StaffMember = apps.get_model('core', 'StaffMember')

    for sc in SchoolClass.objects.filter(teacher__isnull=False).select_related('academic_year', 'teacher'):
        start_date = sc.academic_year.start_date if sc.academic_year else None
        if not start_date:
            from datetime import date
            start_date = date.today()
        if not ClassTeacherAssignment.objects.filter(school_class=sc, teacher=sc.teacher, end_date__isnull=True).exists():
            ClassTeacherAssignment.objects.create(
                school_class=sc,
                teacher=sc.teacher,
                start_date=start_date,
                end_date=None
            )

    for asm in Assessment.objects.filter(created_by__isnull=True).select_related('school_class__teacher'):
        if asm.school_class and asm.school_class.teacher:
            asm.created_by = asm.school_class.teacher
            asm.save(update_fields=['created_by'])

    for staff in StaffMember.objects.filter(user__isnull=False, role='teacher'):
        has_class = ClassTeacherAssignment.objects.filter(teacher=staff.user, end_date__isnull=True).exists()
        if has_class:
            staff.teacher_type = 'class_teacher'
            staff.save(update_fields=['teacher_type'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_assessment_created_by_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_assignments, noop),
    ]
