from datetime import date
from django.db import transaction, models
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from core.models import (
    SchoolClass, Enrollment, Attendance
)
from core.views import record_event


def _check_class_access(user, school_class):
    """Ensure user has permission to view or manage attendance for this class."""
    if user.is_superuser or user.role == 'organisation_admin':
        if not user.is_superuser and school_class.school.organisation_id != user.organisation_id:
            raise PermissionDenied('Access denied to campus.')
        return
    if user.role in ('school_admin', 'principal'):
        if school_class.school_id != user.school_id:
            raise PermissionDenied('Access restricted to your assigned campus.')
        return
    if user.role == 'teacher':
        if school_class.school_id != user.school_id:
            raise PermissionDenied('Access restricted to your assigned campus.')
        return
    raise PermissionDenied('You do not have permission to access attendance registers.')


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def class_attendance_register(request):
    """
    Daily attendance register for a specific classroom and date.
    Supports viewing past attendance (with who conducted it),
    and taking/altering attendance by authorized teachers, principals, and admins.
    """
    user = request.user
    class_id = request.query_params.get('school_class') or request.data.get('school_class')
    if not class_id:
        raise ValidationError({'school_class': 'Class ID is required.'})

    try:
        school_class = SchoolClass.objects.select_related('school', 'teacher').get(pk=class_id)
    except SchoolClass.DoesNotExist:
        raise NotFound('Classroom not found.')

    _check_class_access(user, school_class)

    date_raw = request.query_params.get('date') or request.data.get('date') or date.today().isoformat()
    try:
        att_date = date.fromisoformat(str(date_raw)[:10])
    except ValueError:
        raise ValidationError({'date': 'Invalid date format. Use YYYY-MM-DD.'})

    if request.method == 'GET':
        enrollments = Enrollment.objects.filter(
            school_class=school_class,
            student__active=True
        ).filter(
            models.Q(end_date__isnull=True) | models.Q(end_date__gte=att_date)
        ).select_related('student').order_by('student__admission_number', 'student__last_name', 'student__first_name')

        student_list = [e.student for e in enrollments]
        if not student_list:
            all_enrols = Enrollment.objects.filter(
                school_class=school_class, student__active=True
            ).select_related('student').order_by('student__admission_number', 'student__last_name', 'student__first_name')
            student_list = [e.student for e in all_enrols]

        existing_recs = {
            a.student_id: a
            for a in Attendance.objects.filter(
                school_class=school_class, date=att_date
            ).select_related('recorded_by')
        }

        is_conducted = len(existing_recs) > 0
        conducted_by_user = None
        conducted_at = None
        for a in existing_recs.values():
            if a.recorded_by:
                conducted_by_user = (a.recorded_by.get_full_name() or a.recorded_by.username).strip()
            if getattr(a, 'updated_at', None):
                conducted_at = a.updated_at.isoformat()
            if conducted_by_user:
                break

        if is_conducted and not conducted_by_user and school_class.teacher:
            conducted_by_user = (school_class.teacher.get_full_name() or school_class.teacher.username).strip()

        records = []
        for s in student_list:
            rec = existing_recs.get(s.id)
            records.append({
                'student_id': s.id,
                'admission_number': s.admission_number,
                'student_name': s.full_name,
                'gender': s.gender,
                'status': rec.status if rec else 'not_taken',
                'is_recorded': bool(rec),
                'note': rec.note if rec else '',
            })

        total = len(records)
        present = sum(1 for r in records if r['status'] == 'present')
        absent = sum(1 for r in records if r['status'] == 'absent')
        late = sum(1 for r in records if r['status'] == 'late')
        excused = sum(1 for r in records if r['status'] == 'excused')
        not_taken = sum(1 for r in records if r['status'] == 'not_taken')
        taken_total = total - not_taken
        att_rate = round(((present + late) / taken_total) * 100, 1) if taken_total > 0 else None

        return Response({
            'class_id': school_class.id,
            'class_name': school_class.name,
            'section': school_class.section,
            'display_name': school_class.display_name,
            'grade_level': school_class.grade_level,
            'teacher_name': (school_class.teacher.get_full_name() or school_class.teacher.username) if school_class.teacher else 'Unassigned',
            'date': att_date.isoformat(),
            'is_conducted': is_conducted,
            'conducted_by': conducted_by_user,
            'conducted_at': conducted_at,
            'records': records,
            'summary': {
                'total': total,
                'present': present,
                'absent': absent,
                'late': late,
                'excused': excused,
                'not_taken': not_taken,
                'attendance_rate': att_rate,
                'recorded_count': len(existing_recs),
            }
        })

    # POST: Save / alter student attendance
    records_data = request.data.get('records')
    if not isinstance(records_data, list):
        raise ValidationError({'records': 'List of student attendance records required.'})

    valid_statuses = {'present', 'absent', 'late', 'excused'}
    enrolled_student_ids = set(
        Enrollment.objects.filter(school_class=school_class).values_list('student_id', flat=True)
    )

    updated_count = 0
    was_conducted = Attendance.objects.filter(school_class=school_class, date=att_date).exists()

    with transaction.atomic():
        for item in records_data:
            s_id = item.get('student_id')
            if not s_id or s_id not in enrolled_student_ids:
                continue
            status = str(item.get('status') or '').lower()
            if status not in valid_statuses:
                continue
            note = str(item.get('note') or '').strip()[:255]

            enrol = Enrollment.objects.filter(student_id=s_id, school_class=school_class).first()
            if enrol and enrol.start_date > att_date:
                enrol.start_date = att_date
                enrol.save(update_fields=['start_date'])

            Attendance.objects.update_or_create(
                student_id=s_id,
                school_class=school_class,
                date=att_date,
                defaults={
                    'status': status,
                    'note': note,
                    'recorded_by': user,
                }
            )
            updated_count += 1

        record_event(
            actor=user,
            action='update_student_attendance' if was_conducted else 'mark_student_attendance',
            obj=school_class
        )

    actor_name = (user.get_full_name() or user.username).strip()
    return Response({
        'success': True,
        'message': f'Attendance saved for {updated_count} student(s).',
        'date': att_date.isoformat(),
        'updated_count': updated_count,
        'conducted_by': actor_name,
        'is_conducted': True,
    })
