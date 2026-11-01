"""Service for automatically alerting parents, class teachers, principals, and admins
when a student falls below attendance criteria or academic passing grade criteria.
"""
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.db import models

from core.models import (
    Student, School, SchoolClass, Attendance, Grade, Assessment,
    Notification, User, ClassTeacherAssignment, Enrollment
)


def get_school_attendance_threshold(school: School) -> float:
    """Returns required attendance percentage threshold (e.g. 70.0, 75.0, 80.0)."""
    if hasattr(school, 'configuration') and school.configuration:
        ap = school.configuration.attendance_policy or {}
        if ap.get('required_percentage'):
            try:
                return float(ap['required_percentage'])
            except (ValueError, TypeError):
                pass
    if school.attendance_alert_threshold is not None:
        try:
            return float(school.attendance_alert_threshold)
        except (ValueError, TypeError):
            pass
    return 75.0


def get_school_passing_grade_threshold(school: School) -> float:
    """Returns required passing grade percentage threshold (e.g. 50.0, 60.0)."""
    if hasattr(school, 'configuration') and school.configuration:
        gp = school.configuration.grading_policy or {}
        if gp.get('passing_percentage'):
            try:
                return float(gp['passing_percentage'])
            except (ValueError, TypeError):
                pass
    if school.grade_alert_threshold is not None:
        try:
            return float(school.grade_alert_threshold)
        except (ValueError, TypeError):
            pass
    return 50.0


def get_student_class_display(student: Student, school_class: SchoolClass = None) -> tuple[str, SchoolClass | None]:
    if not school_class:
        enr = student.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
        school_class = enr.school_class if enr else None
    if school_class:
        if hasattr(school_class, 'display_name') and school_class.display_name:
            return school_class.display_name, school_class
        section_part = f" - {school_class.section}" if school_class.section else ""
        return f"{school_class.name}{section_part}", school_class
    return "Class Unassigned", None


def get_alert_recipients(student: Student, school_class: SchoolClass = None) -> list[User]:
    """Collects unique recipients for student risk alerts:
    1. Parents / Guardians
    2. Class Teacher
    3. Principal
    4. School Admin & Organisation Admin
    """
    recipients: dict[int, User] = {}
    school = student.school

    # 1. Parents / Guardians
    guardians = student.guardians.filter(is_active=True)
    for g in guardians:
        recipients[g.id] = g

    # Also parents who have this student in wards
    ward_parents = User.objects.filter(role='parent', wards=student, is_active=True)
    for wp in ward_parents:
        recipients[wp.id] = wp

    # 2. Class Teacher
    if not school_class:
        enr = student.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
        school_class = enr.school_class if enr else None

    if school_class:
        cta = ClassTeacherAssignment.objects.filter(
            school_class=school_class
        ).filter(
            models.Q(end_date__isnull=True) | models.Q(end_date__gte=timezone.localdate())
        ).select_related('teacher').first()
        if cta and cta.teacher and cta.teacher.is_active:
            recipients[cta.teacher.id] = cta.teacher
        elif getattr(school_class, 'teacher', None) and school_class.teacher.is_active:
            recipients[school_class.teacher.id] = school_class.teacher

    # 3. Principal
    principals = User.objects.filter(school=school, role='principal', is_active=True)
    for p in principals:
        recipients[p.id] = p

    # 4. School Admin & Org Admin
    school_admins = User.objects.filter(school=school, role='school_admin', is_active=True)
    for sa in school_admins:
        recipients[sa.id] = sa

    if school.organisation_id:
        org_admins = User.objects.filter(organisation_id=school.organisation_id, role='organisation_admin', is_active=True)
        for oa in org_admins:
            recipients[oa.id] = oa

    return list(recipients.values())


def dispatch_risk_notifications(student: Student, title: str, body: str, school_class: SchoolClass = None, dedupe_hours: int = 12) -> int:
    """Dispatches notifications to all stakeholders with deduplication."""
    recipients = get_alert_recipients(student, school_class)
    if not recipients:
        return 0

    cutoff = timezone.now() - timedelta(hours=dedupe_hours)
    sent_count = 0

    for user in recipients:
        # Check if identical alert was sent recently to avoid notification flooding
        already_notified = Notification.objects.filter(
            user=user,
            title=title,
            created_at__gte=cutoff
        ).exists()

        if not already_notified:
            Notification.objects.create(
                user=user,
                title=title[:180],
                body=body[:400]
            )
            sent_count += 1

    return sent_count


def check_and_notify_attendance_risk(student: Student, school_class: SchoolClass = None) -> bool:
    """Evaluates student's attendance records against the school attendance criteria.
    Dispatches alerts to parents portal, class teacher, principal, and admin if below criteria.
    """
    school = student.school
    threshold = get_school_attendance_threshold(school)

    att_qs = Attendance.objects.filter(student=student)
    total_days = att_qs.count()
    if total_days < 1:
        return False

    present_count = att_qs.filter(status='present').count()
    late_count = att_qs.filter(status='late').count()
    absent_count = att_qs.filter(status='absent').count()
    excused_count = att_qs.filter(status__in=['leave', 'excused']).count()

    denominator = max(total_days - excused_count, 0)
    attended_count = present_count + late_count

    if denominator > 0:
        current_rate = round((attended_count / denominator) * 100, 1)
    else:
        current_rate = 100.0

    recent_statuses = list(att_qs.order_by('-date')[:3].values_list('status', flat=True))
    is_consecutive_absent = len(recent_statuses) >= 3 and all(s == 'absent' for s in recent_statuses)

    is_below_criteria = current_rate < threshold or is_consecutive_absent

    if not is_below_criteria:
        return False

    class_name, sc = get_student_class_display(student, school_class)

    if is_consecutive_absent:
        title = f"[ATTENDANCE ALERT] {student.full_name} has 3+ consecutive absences"
        body = (
            f"Attendance Alert: {student.full_name} (Roll: {student.admission_number}, {class_name}) "
            f"has missed 3 consecutive school sessions. Current attendance rate: {current_rate}% "
            f"(required: {threshold}%). Please review and contact parents."
        )
    else:
        title = f"[ATTENDANCE ALERT] {student.full_name} below attendance criteria ({current_rate}% vs {threshold}%)"
        body = (
            f"Attendance Alert: {student.full_name} (Roll: {student.admission_number}, {class_name}) "
            f"has fallen below the school attendance criteria of {threshold}%. "
            f"Current rate is {current_rate}% ({attended_count} attended / {denominator} held sessions). "
            f"Timely attention is required."
        )

    dispatch_risk_notifications(student, title, body, sc)
    return True


def check_and_notify_grade_risk(student: Student, grade: Grade = None, assessment: Assessment = None) -> bool:
    """Evaluates student's assessment marks against the school passing grade criteria.
    Dispatches alerts to parents portal, class teacher, principal, and admin if below criteria.
    """
    if not grade and not assessment:
        return False

    if grade and not assessment:
        assessment = grade.assessment

    if not assessment:
        return False

    school = student.school
    passing_threshold = get_school_passing_grade_threshold(school)

    max_marks = float(assessment.max_marks or 0.0)
    marks = float(grade.marks) if grade and grade.marks is not None else None
    result_status = getattr(grade, 'result_status', 'recorded')

    is_fail = False
    score_percentage = None

    if marks is not None and max_marks > 0:
        score_percentage = round((marks / max_marks) * 100, 1)
        if score_percentage < passing_threshold:
            is_fail = True

    if result_status in ('fail', 'incomplete'):
        is_fail = True

    if not is_fail:
        return False

    class_name, sc = get_student_class_display(student, assessment.school_class)
    subject_name = assessment.subject.name if assessment.subject else "Subject"
    score_info = f"{marks}/{max_marks} ({score_percentage}%)" if score_percentage is not None else "Did not meet criteria"

    title = f"[ACADEMIC ALERT] {student.full_name} scored below passing criteria in {subject_name}"
    body = (
        f"Academic Alert: {student.full_name} (Roll: {student.admission_number}, {class_name}) "
        f"scored {score_info} in assessment '{assessment.title}' ({subject_name}), "
        f"falling below the school passing criteria of {passing_threshold}%. "
        f"Academic support and teacher consultation recommended."
    )

    dispatch_risk_notifications(student, title, body, sc)
    return True
