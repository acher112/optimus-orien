"""Parent Portal Service for OPTIMUS ORIEN.

Provides data aggregation, scope verification, and workflow management for the Parent Portal.
Adheres strictly to the Golden Rule:
A parent sees only the children linked to them through an active, verified relationship.
A third child's id, or any classmate's id, raises NotFound (HTTP 404).
Comparison is by aggregates only (class, boys, girls) subject to privacy group thresholds.
"""
from datetime import timedelta
from typing import Dict, Any, List, Optional
from django.utils import timezone
from django.db.models import Q, Count, Avg
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from core.models import (
    Student, School, SchoolClass, Subject, Enrollment, Attendance,
    Assessment, Grade, Homework, HomeworkSubmission, Observation,
    User, GuardianProfile, GuardianRelationship, ParentNotificationPreference,
    ParentRiskAlert, ParentCallbackRequest, ClassTeacherAssignment, TeachingAssignment,
    AuditEvent
)
from core.services.aqi_scope import AQIScope
from core.services.aqi_engine import get_student_aqi_profile
from core.services.audit import record_event


def get_parent_profile(user: User) -> Optional[GuardianProfile]:
    """Retrieves the GuardianProfile for an authenticated parent user."""
    return getattr(user, 'guardian_profile', None)


def get_verified_relationships_qs(user: User):
    """Returns queryset of active, verified GuardianRelationship objects for the parent."""
    profile = get_parent_profile(user)
    today = timezone.localdate()
    if profile:
        return GuardianRelationship.objects.filter(
            guardian=profile,
            status='active',
            verified_at__isnull=False,
            start_date__lte=today
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).select_related('student', 'student__school')
    return GuardianRelationship.objects.none()


def verify_child_access(user: User, student_id: int, permission_field: Optional[str] = None) -> tuple[Student, Optional[GuardianRelationship]]:
    """Verifies that the user has verified access to the requested student_id.
    
    If student does not exist or is not linked to parent with active verified status,
    ALWAYS raises NotFound (HTTP 404) to prevent ID enumeration.
    If relationship exists but specific permission (e.g. can_view_fees) is False,
    raises PermissionDenied (HTTP 403).
    """
    today = timezone.localdate()
    if user.is_superuser or user.role == 'organisation_admin':
        try:
            student = Student.objects.select_related('school').get(id=student_id)
            return student, None
        except Student.DoesNotExist:
            raise NotFound("Student not found.")

    profile = get_parent_profile(user)
    if profile:
        rel = GuardianRelationship.objects.filter(
            guardian=profile,
            student_id=student_id,
            status='active',
            verified_at__isnull=False,
            start_date__lte=today
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).select_related('student', 'student__school').first()

        if not rel:
            raise NotFound("Student not found.")

        if permission_field and not getattr(rel, permission_field, True):
            raise PermissionDenied(f"You do not have permission to access {permission_field.replace('can_view_', '')} for this student.")

        return rel.student, rel

    # Fallback to user.wards for legacy/unmigrated parents
    if user.role == 'parent':
        st = user.wards.filter(id=student_id).select_related('school').first()
        if not st:
            raise NotFound("Student not found.")
        return st, None

    raise NotFound("Student not found.")


def get_parent_children_summary(user: User) -> List[Dict[str, Any]]:
    """Family Home: Returns summary cards for all linked children.
    
    Sorted so that 'needs attention' children appear first.
    """
    profile = get_parent_profile(user)
    today = timezone.localdate()
    children_cards = []

    if profile:
        rels = GuardianRelationship.objects.filter(
            guardian=profile,
            status='active',
            verified_at__isnull=False,
            start_date__lte=today
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).select_related('student', 'student__school')

        for rel in rels:
            st = rel.student
            card = _build_child_summary_card(st, rel)
            children_cards.append(card)
    elif user.role == 'parent':
        for st in user.wards.all().select_related('school'):
            card = _build_child_summary_card(st, None)
            children_cards.append(card)

    # Sort: needs_attention first, then alphabetical by student name
    children_cards.sort(key=lambda c: (not c['needs_attention'], c['full_name']))
    return children_cards


def _build_child_summary_card(student: Student, rel: Optional[GuardianRelationship]) -> Dict[str, Any]:
    """Builds a single child's overview card with 3-stat strip and status badge."""
    # Active enrollment and class
    enr = Enrollment.objects.filter(student=student, end_date__isnull=True).select_related('school_class').first()
    school_class = enr.school_class if enr else None
    class_display = school_class.display_name if school_class else (f"{school_class.name} - {school_class.section}" if school_class and school_class.section else (school_class.name if school_class else "Unassigned"))

    # Homeroom teacher
    teacher_name = "Not Assigned"
    if school_class:
        cta = ClassTeacherAssignment.objects.filter(
            school_class=school_class
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=timezone.localdate())
        ).select_related('teacher').first()
        if cta and cta.teacher:
            teacher_name = cta.teacher.get_full_name() or cta.teacher.username
        elif getattr(school_class, 'teacher', None):
            teacher_name = school_class.teacher.get_full_name() or school_class.teacher.username

    # Stat 1: Attendance percentage (last 60 days / term)
    sixty_days_ago = timezone.localdate() - timedelta(days=60)
    att_qs = Attendance.objects.filter(student=student, date__gte=sixty_days_ago)
    total_att = att_qs.count()
    present_att = att_qs.filter(status__in=['present', 'late']).count()
    att_rate = round((present_att / total_att) * 100, 1) if total_att > 0 else 100.0

    # Stat 2: Academic Standing / AQI Level
    # Look at recent grades
    grades_qs = Grade.objects.filter(student=student, assessment__published=True)
    recent_grades = list(grades_qs.order_by('-assessment__date')[:5])
    if recent_grades:
        avg_pct = sum((float(g.marks) / float(g.assessment.max_marks) * 100) for g in recent_grades if g.assessment.max_marks and g.marks is not None) / len(recent_grades)
        avg_pct = round(avg_pct, 1)
        if avg_pct >= 85:
            academic_standing = f"Advanced ({avg_pct}%)"
        elif avg_pct >= 70:
            academic_standing = f"Proficient ({avg_pct}%)"
        elif avg_pct >= 50:
            academic_standing = f"Developing ({avg_pct}%)"
        else:
            academic_standing = f"Focus Area ({avg_pct}%)"
    else:
        academic_standing = "In Progress"

    # Stat 3: Active risk alerts
    active_alerts = ParentRiskAlert.objects.filter(
        student=student,
        status__in=['active', 'pending_review', 'read']
    ).count()

    primary_alert = None
    if active_alerts > 0:
        latest = ParentRiskAlert.objects.filter(
            student=student,
            status__in=['active', 'pending_review', 'read']
        ).order_by('-created_at').first()
        primary_alert = latest.title if latest else None

    # Needs attention logic: attendance < 85% or active alerts > 0
    needs_attention = (att_rate < 85.0) or (active_alerts > 0)

    return {
        'id': student.id,
        'full_name': student.full_name,
        'admission_number': student.admission_number,
        'gender': student.gender,
        'campus_id': student.school_id,
        'campus_name': student.school.name if student.school else '',
        'class_id': school_class.id if school_class else None,
        'class_display': class_display,
        'class_teacher_name': teacher_name,
        'relationship_type': rel.relationship if rel else 'guardian',
        'is_primary': rel.is_primary if rel else True,
        'permissions': {
            'can_view_academics': rel.can_view_academics if rel else True,
            'can_view_attendance': rel.can_view_attendance if rel else True,
            'can_view_homework': rel.can_view_homework if rel else True,
            'can_view_fees': rel.can_view_fees if rel else True,
            'receive_notifications': rel.receive_notifications if rel else True,
        },
        'attendance_rate': att_rate,
        'attendance_badge': 'Critical' if att_rate < 75 else ('Warning' if att_rate < 85 else 'On Track'),
        'academic_standing': academic_standing,
        'active_alerts_count': active_alerts,
        'primary_alert': primary_alert,
        'needs_attention': needs_attention,
    }


def get_child_overview(user: User, student_id: int) -> Dict[str, Any]:
    """Tab A: Child Overview."""
    student, rel = verify_child_access(user, student_id)
    today = timezone.localdate()

    # 1. Recent Attendance (Last 10 school days)
    recent_att = Attendance.objects.filter(
        student=student
    ).order_by('-date')[:10]
    attendance_records = [{
        'date': att.date.isoformat(),
        'status': att.status,
        'notes': att.notes or ''
    } for att in recent_att]

    # 2. Recent Assessments (Last 3)
    recent_grades = Grade.objects.filter(
        student=student,
        assessment__published=True
    ).select_related('assessment', 'assessment__subject').order_by('-assessment__date')[:3]

    assessments_list = []
    for g in recent_grades:
        pct = round((float(g.marks) / float(g.assessment.max_marks) * 100), 1) if g.assessment.max_marks and g.marks is not None else 0
        assessments_list.append({
            'subject_name': g.assessment.subject.name if g.assessment.subject else 'General',
            'assessment_title': g.assessment.title,
            'marks_obtained': float(g.marks) if g.marks is not None else 0,
            'max_marks': float(g.assessment.max_marks),
            'percentage': pct,
            'feedback': g.feedback or 'Completed',
            'date': g.assessment.date.isoformat() if g.assessment.date else ''
        })

    # 3. Upcoming Items (next 7 days)
    enr = Enrollment.objects.filter(student=student, end_date__isnull=True).first()
    upcoming_homework = []
    upcoming_assessments = []
    if enr:
        next_week = today + timedelta(days=7)
        hw_qs = Homework.objects.filter(
            school_class_id=enr.school_class_id,
            due_date__gte=today,
            due_date__lte=next_week
        ).select_related('subject')
        for hw in hw_qs:
            upcoming_homework.append({
                'id': hw.id,
                'title': hw.title,
                'subject': hw.subject.name if hw.subject else 'General',
                'due_date': hw.due_date.isoformat(),
            })

        ass_qs = Assessment.objects.filter(
            school_class_id=enr.school_class_id,
            date__gte=today,
            date__lte=next_week,
            published=True
        ).select_related('subject')
        for a in ass_qs:
            upcoming_assessments.append({
                'id': a.id,
                'title': a.title,
                'subject': a.subject.name if a.subject else 'General',
                'date': a.date.isoformat() if a.date else '',
            })

    # 4. Positive Shoutouts / Observations (where remarks indicate strength)
    observations = Observation.objects.filter(
        student=student
    ).order_by('-date')[:3]
    shoutouts = [{
        'date': obs.date.isoformat(),
        'note': obs.notes,
        'subject': obs.subject.name if obs.subject else 'Homeroom'
    } for obs in observations if obs.notes and any(w in obs.notes.lower() for w in ['good', 'great', 'excellent', 'well', 'participat', 'effort', 'helpful', 'improved'])]

    return {
        'student': {
            'id': student.id,
            'full_name': student.full_name,
            'admission_number': student.admission_number,
            'gender': student.gender,
            'campus_name': student.school.name if student.school else '',
        },
        'recent_attendance': attendance_records,
        'recent_assessments': assessments_list,
        'upcoming_homework': upcoming_homework,
        'upcoming_assessments': upcoming_assessments,
        'positive_shoutouts': shoutouts,
    }


def get_child_results(user: User, student_id: int, academic_year_id: Optional[int] = None) -> Dict[str, Any]:
    """Tab B: Results & Progress (Integrated with AQI Engine Level 5).
    
    Provides aggregate-only comparisons (Class, Boys, Girls) subject to privacy threshold,
    difference in percentage points, anonymous distribution histogram, and specified color palette.
    """
    student, rel = verify_child_access(user, student_id, permission_field='can_view_academics')
    scope = AQIScope(user)
    aqi_profile = get_student_aqi_profile(scope, student_id, academic_year_id=academic_year_id)

    # Calculate Anonymous Distribution Histogram for Child's Class
    histogram = _compute_class_histogram(student, aqi_profile.get('overall_percentage'))

    # Color palette guidelines
    color_palette = {
        'child': '#6b7280',    # Neutral gray
        'boys': '#3b82f6',     # Soft blue
        'girls': '#ec4899',    # Warm pink
        'class': '#94a3b8',    # Slate neutral
    }

    return {
        'student_id': student.id,
        'student_name': student.full_name,
        'academic_year': aqi_profile.get('academic_year'),
        'overall_percentage': aqi_profile.get('overall_percentage'),
        'class_average': aqi_profile.get('class_average'),
        'difference': aqi_profile.get('difference'),
        'difference_text': aqi_profile.get('difference_text'),
        'boys_class_average': aqi_profile.get('boys_class_average'),
        'boys_privacy_notice': aqi_profile.get('boys_privacy_notice'),
        'girls_class_average': aqi_profile.get('girls_class_average'),
        'girls_privacy_notice': aqi_profile.get('girls_privacy_notice'),
        'gender_gap_pp': aqi_profile.get('gender_gap_pp'),
        'subjects': aqi_profile.get('subjects', []),
        'histogram': histogram,
        'color_palette': color_palette,
    }


def _compute_class_histogram(student: Student, child_pct: Optional[float]) -> List[Dict[str, Any]]:
    """Calculates anonymous grade distribution histogram without naming other students."""
    bands = [
        {'band': '0-49%', 'min': 0.0, 'max': 49.99, 'count': 0, 'is_child_band': False},
        {'band': '50-59%', 'min': 50.0, 'max': 59.99, 'count': 0, 'is_child_band': False},
        {'band': '60-69%', 'min': 60.0, 'max': 69.99, 'count': 0, 'is_child_band': False},
        {'band': '70-79%', 'min': 70.0, 'max': 79.99, 'count': 0, 'is_child_band': False},
        {'band': '80-89%', 'min': 80.0, 'max': 89.99, 'count': 0, 'is_child_band': False},
        {'band': '90-100%', 'min': 90.0, 'max': 100.0, 'count': 0, 'is_child_band': False},
    ]

    enr = Enrollment.objects.filter(student=student, end_date__isnull=True).first()
    if not enr:
        return bands

    class_students = list(Enrollment.objects.filter(
        school_class_id=enr.school_class_id,
        end_date__isnull=True
    ).values_list('student_id', flat=True))

    if not class_students:
        return bands

    # Calculate average per student in the class
    for s_id in class_students:
        s_grades = Grade.objects.filter(student_id=s_id, assessment__published=True)
        if not s_grades.exists():
            continue
        pcts = [(float(g.marks) / float(g.assessment.max_marks) * 100) for g in s_grades if g.assessment.max_marks and g.marks is not None]
        if not pcts:
            continue
        avg = sum(pcts) / len(pcts)

        for b in bands:
            if b['min'] <= avg <= b['max'] or (b['band'] == '90-100%' and avg >= 90.0):
                b['count'] += 1
                break

    if child_pct is not None:
        try:
            val = float(child_pct)
            for b in bands:
                if b['min'] <= val <= b['max'] or (b['band'] == '90-100%' and val >= 90.0):
                    b['is_child_band'] = True
                    break
        except (ValueError, TypeError):
            pass

    return bands


def get_child_attendance(user: User, student_id: int) -> Dict[str, Any]:
    """Tab C: Child Attendance statistics and calendar records."""
    student, rel = verify_child_access(user, student_id, permission_field='can_view_attendance')
    school = student.school

    records = Attendance.objects.filter(student=student).order_by('-date')
    total_days = records.count()
    present_days = records.filter(status='present').count()
    absent_days = records.filter(status='absent').count()
    late_days = records.filter(status='late').count()
    leave_days = records.filter(status='leave').count()

    attendance_rate = round(((present_days + late_days) / total_days * 100), 1) if total_days > 0 else 100.0
    school_target = 85.0
    if school and hasattr(school, 'attendance_alert_threshold') and school.attendance_alert_threshold:
        school_target = float(school.attendance_alert_threshold)

    calendar_data = [{
        'date': r.date.isoformat(),
        'status': r.status,
        'notes': r.notes or ''
    } for r in records[:60]]  # last 60 entries for calendar

    return {
        'student_id': student.id,
        'attendance_rate': attendance_rate,
        'school_target': school_target,
        'total_sessions': total_days,
        'present': present_days,
        'absent': absent_days,
        'late': late_days,
        'leave': leave_days,
        'in_warning_zone': attendance_rate < school_target,
        'records': calendar_data
    }


def get_child_risk_and_support(user: User, student_id: int) -> Dict[str, Any]:
    """Tab D: Risk & Support notifications and interventions."""
    student, rel = verify_child_access(user, student_id)
    profile = get_parent_profile(user)

    alerts_qs = ParentRiskAlert.objects.filter(student=student)
    if profile:
        # If alerts belong to this guardian specifically or are general active alerts for the child
        alerts_qs = alerts_qs.filter(Q(guardian=profile) | Q(guardian__isnull=True))

    active_alerts = []
    past_alerts = []

    for alert in alerts_qs.order_by('-created_at'):
        item = {
            'id': alert.id,
            'alert_type': alert.condition_type,
            'condition_type': alert.condition_type,
            'severity': 'high' if 'drop' in alert.condition_key else 'medium',
            'title': alert.title,
            'description': alert.evidence_text,
            'evidence_data': {'condition_key': alert.condition_key},
            'suggested_action': alert.evidence_text,
            'status': alert.status,
            'created_at': alert.created_at.isoformat(),
            'read_at': alert.read_at.isoformat() if alert.read_at else None,
            'acknowledged_at': alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
            'resolved_at': alert.resolved_at.isoformat() if alert.resolved_at else None,
        }
        if alert.status in ['active', 'pending_review', 'read']:
            active_alerts.append(item)
        else:
            past_alerts.append(item)

    return {
        'student_id': student.id,
        'student_name': student.full_name,
        'active_alerts': active_alerts,
        'past_alerts': past_alerts,
    }


def acknowledge_risk_alert(user: User, alert_id: int) -> Dict[str, Any]:
    """Parent acknowledges an active risk alert ('I have reviewed this alert')."""
    profile = get_parent_profile(user)
    try:
        if profile:
            alert = ParentRiskAlert.objects.get(id=alert_id, guardian=profile)
        else:
            alert = ParentRiskAlert.objects.get(id=alert_id, student__guardians=user)
    except ParentRiskAlert.DoesNotExist:
        raise NotFound("Risk alert not found.")

    alert.status = 'acknowledged'
    alert.acknowledged_at = timezone.now()
    alert.save(update_fields=['status', 'acknowledged_at', 'updated_at'])

    record_event(
        actor=user,
        action='acknowledge_risk_alert',
        obj=alert,
        changed_fields=['status'],
        before={'status': 'read'},
        after={'status': 'acknowledged'}
    )
    return {'status': 'acknowledged', 'acknowledged_at': alert.acknowledged_at.isoformat()}


def get_child_teachers(user: User, student_id: int) -> List[Dict[str, Any]]:
    """Tab E: Teachers teaching this child."""
    student, rel = verify_child_access(user, student_id)
    school = student.school
    show_contact = bool(getattr(school, 'show_teacher_contact_to_parents', False))

    enr = Enrollment.objects.filter(student=student, end_date__isnull=True).select_related('school_class').first()
    if not enr:
        return []

    school_class = enr.school_class
    teachers_list = []
    seen_teachers = set()

    # 1. Homeroom / Class Teacher
    cta = ClassTeacherAssignment.objects.filter(
        school_class=school_class
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=timezone.localdate())
    ).select_related('teacher').first()

    class_teacher = cta.teacher if cta else getattr(school_class, 'teacher', None)
    if class_teacher and class_teacher.is_active:
        teachers_list.append({
            'id': class_teacher.id,
            'name': class_teacher.get_full_name() or class_teacher.username,
            'role': 'Homeroom Teacher',
            'subject': 'All Class Guidance',
            'is_homeroom': True,
            'email': class_teacher.email if show_contact else None,
            'contact_allowed': show_contact,
        })
        seen_teachers.add(class_teacher.id)

    # 2. Subject Teachers
    tas = TeachingAssignment.objects.filter(
        school_class=school_class
    ).select_related('teacher', 'subject')

    for ta in tas:
        t = ta.teacher
        if t and t.is_active and t.id not in seen_teachers:
            teachers_list.append({
                'id': t.id,
                'name': t.get_full_name() or t.username,
                'role': 'Subject Teacher',
                'subject': ta.subject.name if ta.subject else 'General',
                'is_homeroom': False,
                'email': t.email if show_contact else None,
                'contact_allowed': show_contact,
            })
            seen_teachers.add(t.id)

    return teachers_list


def create_callback_request(
    user: User,
    student_id: int,
    teacher_id: int,
    topic: str,
    preferred_time: str,
    message: str
) -> Dict[str, Any]:
    """Submits a call-back request to a teacher and dispatches in-app notification."""
    student, rel = verify_child_access(user, student_id)
    profile = get_parent_profile(user)

    try:
        teacher = User.objects.get(id=teacher_id, role='teacher', is_active=True)
    except User.DoesNotExist:
        raise NotFound("Teacher not found.")

    valid_topics = ['academic', 'attendance', 'wellbeing', 'general']
    if topic not in valid_topics:
        topic = 'general'

    valid_times = ['morning', 'afternoon', 'anytime']
    if preferred_time not in valid_times:
        preferred_time = 'morning'

    if not profile:
        first_rel = student.guardian_relationships.select_related('guardian').first()
        profile = first_rel.guardian if first_rel else None

    cb = ParentCallbackRequest.objects.create(
        guardian=profile,
        student=student,
        teacher=teacher,
        topic=topic,
        preferred_time=preferred_time,
        message=message.strip()
    )

    # In-app notification to teacher
    from core.models import Notification
    parent_name = profile.full_name if profile else (user.get_full_name() or user.username)
    Notification.objects.create(
        user=teacher,
        title=f"Call-back Request: {student.full_name}",
        body=f"{parent_name} requested a call-back regarding {topic.title()} ({preferred_time}). Note: {message[:120]}"
    )

    record_event(
        actor=user,
        action='parent_callback_requested',
        obj=cb,
        changed_fields=['status'],
        before=None,
        after={'status': 'pending', 'teacher': teacher.id}
    )

    return {
        'id': cb.id,
        'status': cb.status,
        'message': 'Call-back request submitted successfully.'
    }


def get_child_homework(user: User, student_id: int) -> List[Dict[str, Any]]:
    """Tab F: Homework assignments and submission status."""
    student, rel = verify_child_access(user, student_id, permission_field='can_view_homework')
    enr = Enrollment.objects.filter(student=student, end_date__isnull=True).first()
    if not enr:
        return []

    homeworks = Homework.objects.filter(
        school_class_id=enr.school_class_id
    ).select_related('subject').order_by('-due_date')[:15]

    submissions = {
        sub.homework_id: sub
        for sub in HomeworkSubmission.objects.filter(student=student, homework__in=homeworks)
    }

    results = []
    for hw in homeworks:
        sub = submissions.get(hw.id)
        results.append({
            'id': hw.id,
            'title': hw.title,
            'subject_name': hw.subject.name if hw.subject else 'General',
            'description': hw.description,
            'due_date': hw.due_date.isoformat(),
            'submission_status': 'submitted' if sub else ('overdue' if hw.due_date < timezone.localdate() else 'pending'),
            'score': float(sub.score) if sub and sub.score is not None else None,
            'teacher_feedback': sub.feedback if sub else None,
        })
    return results


def get_child_fees(user: User, student_id: int) -> Dict[str, Any]:
    """Tab G: Fees information if enabled."""
    student, rel = verify_child_access(user, student_id, permission_field='can_view_fees')
    school = student.school

    if not getattr(school, 'parents_can_view_fees', True):
        return {
            'fees_enabled': False,
            'message': 'Fee portal access is disabled by the school administration.'
        }

    # Generate sample / mock structured vouchers for current term
    vouchers = [
        {
            'voucher_no': f"VCH-{student.id}-2026-01",
            'term': 'Spring Term 2026',
            'tuition_fee': 15000,
            'transport_fee': 4000,
            'total_amount': 19000,
            'due_date': '2026-03-10',
            'status': 'Paid',
            'payment_date': '2026-03-05'
        },
        {
            'voucher_no': f"VCH-{student.id}-2026-02",
            'term': 'Summer Term 2026',
            'tuition_fee': 15000,
            'transport_fee': 4000,
            'total_amount': 19000,
            'due_date': '2026-06-10',
            'status': 'Pending',
            'payment_date': None
        }
    ]

    return {
        'fees_enabled': True,
        'vouchers': vouchers
    }


def generate_child_report_card(user: User, student_id: int) -> Dict[str, Any]:
    """Generates printable report card / progress summary data and records audit event."""
    student, rel = verify_child_access(user, student_id, permission_field='can_view_academics')
    scope = AQIScope(user)
    aqi_profile = get_student_aqi_profile(scope, student_id)

    # Attendance
    att_qs = Attendance.objects.filter(student=student)
    total_days = att_qs.count()
    present_days = att_qs.filter(status__in=['present', 'late']).count()
    att_rate = round((present_days / total_days * 100), 1) if total_days > 0 else 100.0

    report = {
        'school_name': student.school.name if student.school else 'OPTIMUS ORIEN',
        'student_name': student.full_name,
        'admission_number': student.admission_number,
        'gender': student.gender,
        'class_name': aqi_profile.get('class_name', 'Class'),
        'academic_year': aqi_profile.get('academic_year', ''),
        'generated_date': timezone.localdate().isoformat(),
        'attendance_percentage': att_rate,
        'overall_percentage': aqi_profile.get('overall_percentage'),
        'class_average': aqi_profile.get('class_average'),
        'subjects': aqi_profile.get('subjects', []),
        'disclaimer': 'This progress summary is generated for developmental tracking and parent communication. It is not an official public transcript.'
    }

    record_event(
        actor=user,
        action='export_report_card',
        obj=student,
        changed_fields=['report_card'],
        before=None,
        after={'student_id': student.id}
    )

    return report
