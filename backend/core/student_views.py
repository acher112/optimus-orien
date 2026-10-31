import csv
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, Http404
from django.utils import timezone
from django.core.cache import cache
from django.contrib.sessions.models import Session
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from core.models import (
    Student, SchoolClass, Enrollment, Attendance, Notification,
    AcademicYear, Homework, User, ClassTeacherAssignment, AuditEvent
)
from core.services.access import students_scope
from core.services.teacher_scope import get_teacher_scope
from core.services.audit import record_event
from core.services.student_credentials import (
    generate_temporary_password, generate_student_username, make_credentials_receipt
)
from core.services.aqi_scope import aqi_scope, AQIScope
from core.services.aqi_engine import get_student_aqi_profile


def _resolve_student_for_user(request, student_id=None):
    """
    Resolves the target Student for the current request user according to the Golden Rule:
    - student: only their own Student record. student_id parameter is ignored or must match own id.
    - parent: only their own linked wards.
    - staff (org_admin, principal, teacher): student must be within students_scope.
    """
    user = request.user
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    if user.role == 'student':
        student = Student.objects.filter(user=user).select_related('school', 'school__organisation').first()
        if not student:
            raise NotFound("Student profile not found.")
        if student_id and int(student_id) != student.id:
            raise Http404("Student record not found.")
        return student

    if user.role == 'parent':
        wards = user.wards.all().select_related('school', 'school__organisation')
        if not wards.exists():
            raise NotFound("No linked children profiles found.")
        if student_id:
            student = wards.filter(id=student_id).first()
            if not student:
                raise Http404("Student record not found.")
            return student
        return wards.first()

    # Staff role
    if not student_id:
        raise ValidationError({"detail": "Student ID is required."})

    s_scope = students_scope(user)
    student = s_scope.filter(id=student_id).select_related('school', 'school__organisation').first()
    if not student:
        raise Http404("Student record not found.")
    return student


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reset_student_password(request, pk):
    """
    Part 2: Reset student temporary password.
    Allowed for:
    - Superuser / Organisation Admin (of matching organisation)
    - School Admin / Principal (of matching campus)
    - Assigned Class Teacher (of the student's active class)
    All others: 403 Forbidden (or 404 if out-of-scope campus/org).
    Rate limit: max 10 resets per staff user per hour.
    """
    user = request.user
    if user.role in ('student', 'parent'):
        raise PermissionDenied("Students and parents cannot reset credentials.")

    # Rate limiting: max 10/hour
    cache_key = f"staff_student_pwd_reset_{user.id}"
    reset_count = cache.get(cache_key, 0)
    if reset_count >= 10:
        return Response(
            {'detail': 'Password reset rate limit exceeded (maximum 10 per hour). Please try again later.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    try:
        student = Student.objects.select_related('school', 'school__organisation', 'user').get(pk=pk)
    except Student.DoesNotExist:
        raise Http404("Student not found.")

    # Scope validation
    active_enr = student.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
    school_class = active_enr.school_class if active_enr else None

    if user.is_superuser:
        pass
    elif user.role == 'organisation_admin':
        if user.organisation_id != student.school.organisation_id:
            raise Http404("Student not found.")
    elif user.role in ('principal', 'school_admin'):
        if user.school_id != student.school_id:
            raise Http404("Student not found.")
    elif user.role == 'teacher':
        if not school_class:
            raise PermissionDenied("Only the assigned class teacher may reset passwords for this student.")
        scope = get_teacher_scope(user, request)
        if not scope.is_class_teacher(school_class.id):
            raise PermissionDenied("Only the assigned class teacher may reset passwords for this class.")
    else:
        raise PermissionDenied("You do not have permission to reset student passwords.")

    # Generate new temporary password
    temp_password = generate_temporary_password(12)

    with transaction.atomic():
        if not student.user:
            username = generate_student_username(student.school, student.admission_number)
            student_user = User(
                username=username,
                first_name=student.first_name,
                last_name=student.last_name,
                role='student',
                school=student.school,
                organisation=student.school.organisation,
                must_change_password=True,
                is_active=True
            )
            student_user.set_password(temp_password)
            student_user.full_clean()
            student_user.save()
            student.user = student_user
            student.save(update_fields=['user'])
        else:
            student.user.set_password(temp_password)
            student.user.must_change_password = True
            student.user.save(update_fields=['password', 'must_change_password'])

        # Revoke active sessions for that student
        if student.user_id:
            for s in Session.objects.iterator():
                try:
                    data = s.get_decoded()
                    if str(data.get('_auth_user_id')) == str(student.user_id):
                        s.delete()
                except Exception:
                    pass

        # Increment rate limit cache
        cache.set(cache_key, reset_count + 1, timeout=3600)

        # Audit event - NEVER include the password
        record_event(
            actor=user,
            action='student_password_reset',
            obj=student
        )

        issued_by = user.get_full_name() or user.username
        receipt = make_credentials_receipt(
            student=student,
            school_class=school_class,
            username=student.user.username,
            temporary_password=temp_password,
            issued_by=issued_by
        )

    return Response({
        'ok': True,
        'detail': 'Password has been successfully reset. A new credentials receipt has been issued.',
        'receipt': receipt
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_dashboard(request):
    """
    Part 3 & 4: Overview dashboard for student portal.
    """
    student_id = request.query_params.get('student_id')
    student = _resolve_student_for_user(request, student_id)

    active_enr = student.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
    school_class = active_enr.school_class if active_enr else None
    class_name = school_class.display_name if school_class and hasattr(school_class, 'display_name') else (
        f"{school_class.name} - {school_class.section}" if school_class and school_class.section else (school_class.name if school_class else 'Unassigned')
    )

    # Attendance summary (last 90 days or active year)
    att_qs = Attendance.objects.filter(student=student)
    total_days = att_qs.values('date').distinct().count()
    present_cnt = att_qs.filter(status='present').count()
    late_cnt = att_qs.filter(status='late').count()
    absent_cnt = att_qs.filter(status='absent').count()
    leave_cnt = att_qs.filter(status__in=['leave', 'excused']).count()

    denominator = max(total_days - leave_cnt, 0)
    attended = present_cnt + late_cnt
    if denominator > 0:
        att_rate = round((attended / denominator) * 100, 1)
    else:
        att_rate = 100.0 if total_days == 0 else 0.0

    if att_rate >= 90.0:
        att_status = {'level': 'on_track', 'label': 'On Track', 'color': '#10b981', 'message': 'Regular attendance helps keep your studies on track.'}
    elif att_rate >= 80.0:
        att_status = {'level': 'needs_attention', 'label': 'Needs Attention', 'color': '#f59e0b', 'message': 'A few more attended days will bring you back on track.'}
    else:
        att_status = {'level': 'needs_support', 'label': 'Needs Support', 'color': '#ef4444', 'message': 'Additional attendance support is recommended. Please connect with your class teacher.'}

    # AQI Profile
    aqi_sc = aqi_scope(request.user)
    profile_data = None
    try:
        profile_data = get_student_aqi_profile(aqi_sc, student.id)
    except Exception:
        profile_data = None

    # Homework items for this class
    homework_items = []
    if school_class:
        hw_qs = Homework.objects.filter(school_class=school_class).select_related('subject').order_by('-due_date')[:5]
        for hw in hw_qs:
            homework_items.append({
                'id': hw.id,
                'title': hw.title,
                'subject': hw.subject.name if hw.subject else 'General',
                'due_date': hw.due_date.isoformat() if hw.due_date else None,
                'description': hw.description
            })

    # Unread notifications
    unread_notifs = Notification.objects.filter(user=request.user, read=False).count()

    payload = {
        'student': {
            'id': student.id,
            'name': student.full_name,
            'first_name': student.first_name,
            'last_name': student.last_name,
            'admission_number': student.admission_number,
            'gender': student.gender,
            'campus_name': student.school.name,
            'campus_id': student.school.id,
            'class_id': school_class.id if school_class else None,
            'class_name': class_name,
            'section': school_class.section if school_class else '',
            'avatar_color': getattr(student.user, 'avatar_color', '#8276da') if student.user else '#8276da'
        },
        'attendance': {
            'rate': att_rate,
            'attended_days': attended,
            'held_days': total_days,
            'leave_days': leave_cnt,
            'absent_days': absent_cnt,
            'formula': f"{attended} of {denominator} days attended ({att_rate}%)",
            'status': att_status
        },
        'academic': {
            'overall_percentage': profile_data.get('overall_percentage') if profile_data else None,
            'class_average': profile_data.get('class_average') if profile_data else None,
            'difference': profile_data.get('difference') if profile_data else None,
            'difference_text': profile_data.get('difference_text') if profile_data else None,
            'status': profile_data.get('status') if profile_data else 'No marks yet',
            'status_color': profile_data.get('status_color') if profile_data else '#64748b',
            'subjects_count': len(profile_data.get('subjects', [])) if profile_data else 0,
        },
        'homework': homework_items,
        'unread_notifications_count': unread_notifs,
        'discussion_enabled': student.school.discussion_enabled
    }

    return Response(payload)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_attendance(request):
    """
    Part 4: My Attendance view for student/parent.
    Displays numerator/denominator formula, rates, calendar heatmap, monthly trend,
    consecutive absences alert, and CSV export.
    """
    student_id = request.query_params.get('student_id')
    student = _resolve_student_for_user(request, student_id)

    # Date range calculation
    range_type = request.query_params.get('range', 'academic_year')
    today = timezone.localdate()
    start_date = None
    end_date = today

    if range_type == 'last_30_days':
        start_date = today - timedelta(days=30)
    elif range_type == 'term':
        # approximate 90-day term or term config
        start_date = today - timedelta(days=90)
    elif range_type == 'custom':
        s_raw = request.query_params.get('start_date')
        e_raw = request.query_params.get('end_date')
        if s_raw:
            try:
                start_date = timezone.datetime.fromisoformat(s_raw).date()
            except ValueError:
                pass
        if e_raw:
            try:
                end_date = timezone.datetime.fromisoformat(e_raw).date()
            except ValueError:
                pass
    else:  # academic_year default
        ay = AcademicYear.objects.filter(school=student.school, active=True).first()
        if ay:
            start_date = ay.start_date
            end_date = min(ay.end_date, today)
        else:
            start_date = today - timedelta(days=180)

    qs = Attendance.objects.filter(student=student)
    if start_date:
        qs = qs.filter(date__gte=start_date)
    if end_date:
        qs = qs.filter(date__lte=end_date)
    qs = qs.order_by('date')

    # CSV Export format
    if request.query_params.get('format') == 'csv':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="attendance_{student.admission_number}.csv"'
        writer = csv.writer(response)
        writer.writerow(['Date', 'Day', 'Status', 'Remarks'])
        for a in qs:
            writer.writerow([a.date.isoformat(), a.date.strftime('%A'), a.status.title(), a.remarks or ''])
        return response

    records = list(qs)
    total_records = len(records)
    present_cnt = sum(1 for r in records if r.status == 'present')
    late_cnt = sum(1 for r in records if r.status == 'late')
    absent_cnt = sum(1 for r in records if r.status == 'absent')
    leave_cnt = sum(1 for r in records if r.status in ('leave', 'excused'))

    held_days = len(set(r.date for r in records))
    attended = present_cnt + late_cnt
    denominator = max(held_days - leave_cnt, 0)
    if denominator > 0:
        att_rate = round((attended / denominator) * 100, 1)
    else:
        att_rate = 100.0 if held_days == 0 else 0.0

    if att_rate >= 90.0:
        att_status = {'level': 'on_track', 'label': 'On Track', 'color': '#10b981', 'message': 'Regular attendance helps keep your studies on track.'}
    elif att_rate >= 80.0:
        att_status = {'level': 'needs_attention', 'label': 'Needs Attention', 'color': '#f59e0b', 'message': 'A few more attended days will bring you back on track.'}
    else:
        att_status = {'level': 'needs_support', 'label': 'Needs Support', 'color': '#ef4444', 'message': 'Additional attendance support is recommended. Please connect with your class teacher.'}

    # Calendar heatmap days
    calendar_days = [{'date': r.date.isoformat(), 'status': r.status} for r in records]

    # Monthly Trend
    monthly_map = {}
    for r in records:
        m_key = r.date.strftime('%Y-%m')
        m_label = r.date.strftime('%b %Y')
        if m_key not in monthly_map:
            monthly_map[m_key] = {'month': m_label, 'month_code': m_key, 'present': 0, 'late': 0, 'absent': 0, 'leave': 0, 'held': 0}
        monthly_map[m_key]['held'] += 1
        if r.status == 'present':
            monthly_map[m_key]['present'] += 1
        elif r.status == 'late':
            monthly_map[m_key]['late'] += 1
        elif r.status == 'absent':
            monthly_map[m_key]['absent'] += 1
        elif r.status in ('leave', 'excused'):
            monthly_map[m_key]['leave'] += 1

    monthly_trend = []
    for m_key in sorted(monthly_map.keys()):
        item = monthly_map[m_key]
        m_denom = max(item['held'] - item['leave'], 0)
        m_att = item['present'] + item['late']
        item['rate'] = round((m_att / m_denom * 100), 1) if m_denom > 0 else 100.0
        monthly_trend.append(item)

    # Consecutive Absences Check
    consecutive_absences = 0
    current_streak = 0
    for r in records:
        if r.status == 'absent':
            current_streak += 1
            if current_streak > consecutive_absences:
                consecutive_absences = current_streak
        else:
            current_streak = 0

    consecutive_alert = None
    if consecutive_absences >= 3:
        consecutive_alert = f"{consecutive_absences} consecutive absences recorded. Please submit leave documentation to your class teacher if applicable."

    return Response({
        'summary': {
            'rate': att_rate,
            'attended_days': attended,
            'held_days': held_days,
            'present_count': present_cnt,
            'late_count': late_cnt,
            'absent_count': absent_cnt,
            'leave_count': leave_cnt,
            'denominator': denominator,
            'formula': f"{attended} of {denominator} days attended ({att_rate}%)",
            'policy_note': "Approved leave days are excluded from the attendance denominator per school policy.",
            'status': att_status,
            'consecutive_absences': consecutive_absences,
            'consecutive_alert': consecutive_alert,
        },
        'calendar_days': calendar_days,
        'monthly_trend': monthly_trend,
        'start_date': start_date.isoformat() if start_date else None,
        'end_date': end_date.isoformat() if end_date else None,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_results(request):
    """
    Part 5: My Results & Progress view for student/parent.
    AQI Level 5 profile:
    - Compares own % (gray), class average, boys average (blue), girls average (pink).
    - Privacy masking: group averages hidden if group < aqi_min_group_size.
    - Grade-level/campus comparison hidden if school.students_can_see_grade_level_average is False.
    - Subject risk badges & supportive guidance.
    """
    student_id = request.query_params.get('student_id')
    student = _resolve_student_for_user(request, student_id)

    academic_year_id = request.query_params.get('academic_year')
    ay_id = int(academic_year_id) if academic_year_id and str(academic_year_id).isdigit() else None

    aqi_sc = aqi_scope(request.user)
    profile = get_student_aqi_profile(aqi_sc, student.id, academic_year_id=ay_id)

    # Respect school.students_can_see_grade_level_average
    if not student.school.students_can_see_grade_level_average:
        profile['grade_level_average'] = None
        profile['campus_average'] = None
        profile['can_see_grade_level_average'] = False
    else:
        profile['can_see_grade_level_average'] = True

    # Subject risk levels and guidance
    subjects = profile.get('subjects', [])
    for s in subjects:
        pct = s.get('final_percentage')
        if pct is not None:
            if pct >= 75.0:
                s['risk_level'] = 'secure'
                s['risk_label'] = 'Secure'
                s['risk_color'] = '#10b981'
                s['guidance'] = 'Strong performance across assessments. Keep up the consistent effort!'
            elif pct >= 60.0:
                s['risk_level'] = 'progressing'
                s['risk_label'] = 'Progressing'
                s['risk_color'] = '#f59e0b'
                s['guidance'] = 'Consistent progress. Focus revision on weaker topic areas to advance.'
            else:
                s['risk_level'] = 'needs_support'
                s['risk_label'] = 'Needs Support'
                s['risk_color'] = '#ef4444'
                s['guidance'] = 'Focus area: review core concepts and practice sessions with your teacher.'
        else:
            s['risk_level'] = 'no_marks'
            s['risk_label'] = 'Pending'
            s['risk_color'] = '#94a3b8'
            s['guidance'] = 'No assessment marks published yet.'

    return Response(profile)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_profile(request):
    """
    Student profile details (read-only for student/parent).
    """
    student_id = request.query_params.get('student_id')
    student = _resolve_student_for_user(request, student_id)

    active_enr = student.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
    school_class = active_enr.school_class if active_enr else None
    class_display = school_class.display_name if school_class and hasattr(school_class, 'display_name') else (
        f"{school_class.name} - {school_class.section}" if school_class and school_class.section else (school_class.name if school_class else 'Unassigned')
    )

    guardians = []
    for g in student.guardians.all():
        guardians.append({
            'id': g.id,
            'name': g.get_full_name() or g.username,
            'email': g.email,
        })

    return Response({
        'id': student.id,
        'full_name': student.full_name,
        'first_name': student.first_name,
        'last_name': student.last_name,
        'admission_number': student.admission_number,
        'father_name': student.father_name,
        'mother_name': student.mother_name,
        'guardian_phone': student.guardian_phone,
        'gender': student.gender,
        'date_of_birth': student.date_of_birth.isoformat() if student.date_of_birth else None,
        'enrolled_on': student.enrolled_on.isoformat() if student.enrolled_on else None,
        'school_name': student.school.name,
        'school_code': student.school.code,
        'class_name': class_display,
        'section': school_class.section if school_class else '',
        'username': student.user.username if student.user else None,
        'guardians': guardians,
        'must_change_password': getattr(student.user, 'must_change_password', False) if student.user else False
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def inform_parent_risk(request, pk):
    """
    Part 6: Staff notification to parents for students requiring support.
    Allowed for:
    - Assigned Class Teacher of student's class
    - Campus Principal / School Admin
    - Organisation Admin / Superuser
    Rate limit: at most 1 notification per student per category per 7 days.
    """
    user = request.user
    if user.role in ('student', 'parent'):
        raise PermissionDenied("Students and parents cannot send risk notifications.")

    try:
        student = Student.objects.select_related('school', 'school__organisation').get(pk=pk)
    except Student.DoesNotExist:
        raise Http404("Student not found.")

    active_enr = student.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
    school_class = active_enr.school_class if active_enr else None

    # Permission check
    if user.is_superuser:
        pass
    elif user.role == 'organisation_admin':
        if user.organisation_id != student.school.organisation_id:
            raise Http404("Student not found.")
    elif user.role in ('principal', 'school_admin'):
        if user.school_id != student.school_id:
            raise Http404("Student not found.")
    elif user.role == 'teacher':
        if not school_class:
            raise PermissionDenied("You are not the class teacher of this student.")
        scope = get_teacher_scope(user, request)
        if not scope.is_class_teacher(school_class.id):
            raise PermissionDenied("Only the designated class teacher may notify parents of this student.")
    else:
        raise PermissionDenied("Access denied.")

    category = request.data.get('category', 'general')  # attendance | academic | general
    reason = request.data.get('reason', 'Academic or attendance progress update')
    custom_msg = request.data.get('message', '').strip()

    # Rate limit: 1 notification per student per category per week
    cache_key = f"inform_parent_rate_{student.id}_{category}"
    if cache.get(cache_key):
        return Response(
            {'detail': f"A parent notification for {category} has already been sent for this student in the last 7 days."},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    guardians = student.guardians.filter(is_active=True)
    if not guardians.exists():
        return Response({
            'ok': False,
            'has_linked_guardian': False,
            'guardian_phone': student.guardian_phone or 'No phone number on record',
            'detail': f"No guardian portal account linked. Guardian phone: {student.guardian_phone or 'N/A'}. Please contact by phone."
        })

    title = f"Academic / Attendance Update: {student.full_name}"
    body = custom_msg or (
        f"Dear Parent/Guardian, this is an update regarding {student.full_name}. "
        f"Reason: {reason}. We encourage reviewing study progress together and connecting with the class teacher if support is needed."
    )

    with transaction.atomic():
        for g in guardians:
            Notification.objects.create(
                user=g,
                title=title,
                body=body
            )

        # Set 7-day rate limit
        cache.set(cache_key, True, timeout=7 * 86400)

        record_event(
            actor=user,
            action='inform_parent_risk',
            obj=student
        )

    return Response({
        'ok': True,
        'has_linked_guardian': True,
        'detail': f"Support notification successfully sent to {guardians.count()} linked guardian(s)."
    })
