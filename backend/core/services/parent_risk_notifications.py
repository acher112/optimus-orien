"""Parent Risk Notification Engine for OPTIMUS ORIEN.

Evaluates student attendance and academic indicators against school policies,
creates lifecycle-tracked ParentRiskAlerts according to school mode:
- auto: Immediately active and delivered to guardians with receive_notifications=True
- after_staff_confirmation: Pending confirmation by homeroom teacher or principal
- manual: Triggered only via staff action

Features:
- Deduplication: At most one active alert per condition per 7 days
- Weekly cap: Max 2 new alerts per student per 7-day rolling window
- Resolution tracking: Automatically marks alerts resolved when criteria improve
- Non-punitive, supportive language adhering to system guidelines
"""
from datetime import timedelta
from typing import Dict, Any, List, Optional
from django.utils import timezone
from django.db.models import Q

from core.models import (
    Student, School, Attendance, Grade, Assessment, Subject,
    GuardianProfile, GuardianRelationship, ParentRiskAlert,
    Notification, AuditEvent, User, ClassTeacherAssignment
)
from core.services.audit import record_event


def evaluate_student_risk_alerts(student: Student) -> List[ParentRiskAlert]:
    """Runs risk evaluation for a single student.
    
    Returns list of newly created or updated ParentRiskAlert instances.
    """
    school = student.school
    mode = getattr(school, 'parent_risk_notification_mode', 'auto')
    if mode == 'manual':
        return []

    today = timezone.localdate()
    created_alerts = []

    # Check weekly cap: max 2 new alerts per child in past 7 days
    seven_days_ago = timezone.now() - timedelta(days=7)
    recent_new_alerts_count = ParentRiskAlert.objects.filter(
        student=student,
        created_at__gte=seven_days_ago
    ).count()

    if recent_new_alerts_count >= 2:
        return []

    # 1. Evaluate Attendance Risk
    thirty_days_ago = today - timedelta(days=30)
    att_qs = Attendance.objects.filter(student=student, date__gte=thirty_days_ago).order_by('-date')
    total_sessions = att_qs.count()
    if total_sessions >= 5:
        absent_count = att_qs.filter(status='absent').count()
        present_count = att_qs.filter(status__in=['present', 'late']).count()
        rate = round((present_count / total_sessions * 100), 1)

        # Check consecutive unexcused absences
        last_3 = list(att_qs[:3])
        consecutive_absent = len(last_3) == 3 and all(r.status == 'absent' for r in last_3)

        if rate < 80.0 or consecutive_absent:
            alert = _handle_risk_condition(
                student=student,
                condition_type='attendance',
                condition_key='attendance_drop',
                title='Attendance Support: Attendance below recommended target',
                description=(
                    f"Over the last 30 school days, attendance was {rate}% "
                    f"({absent_count} absences recorded). "
                    "Consistent daily participation is important for academic progress."
                ),
                suggested_action=(
                    "Please review recent attendance records in the portal. "
                    "If absences were due to illness or family leave, please notify the school office."
                ),
                mode=mode
            )
            if alert:
                created_alerts.append(alert)
        else:
            # Condition resolved: resolve any open attendance alerts
            _resolve_open_alerts(student, 'attendance', f"Attendance improved to {rate}%.")

    # 2. Evaluate Academic Risk (Recent Assessment Marks < 40%)
    recent_grades = Grade.objects.filter(
        student=student,
        assessment__published=True
    ).select_related('assessment', 'assessment__subject').order_by('-assessment__date')[:5]

    for g in recent_grades:
        if not g.assessment.max_marks or g.marks is None:
            continue
        pct = round((float(g.marks) / float(g.assessment.max_marks) * 100), 1)
        subj_name = g.assessment.subject.name if g.assessment.subject else "General"

        if pct < 40.0:
            alert = _handle_risk_condition(
                student=student,
                condition_type='academic',
                condition_key=f"academic_drop_{g.assessment.subject_id or 'gen'}",
                subject=g.assessment.subject,
                title=f'Academic Guidance: Additional practice recommended in {subj_name}',
                description=(
                    f"A recent assessment in {subj_name} resulted in {pct}%. "
                    "Targeted review of foundational concepts is recommended."
                ),
                suggested_action=(
                    "Encourage regular homework review and check topic study guides. "
                    "You may also request a call-back from the subject teacher through the portal."
                ),
                mode=mode
            )
            if alert:
                created_alerts.append(alert)
            break  # Cap to one academic alert per evaluation run

    return created_alerts


def _handle_risk_condition(
    student: Student,
    condition_type: str,
    condition_key: str,
    title: str,
    description: str,
    suggested_action: str,
    mode: str,
    subject: Optional[Subject] = None
) -> Optional[ParentRiskAlert]:
    """Handles deduplication and dispatch of a detected risk condition."""
    seven_days_ago = timezone.now() - timedelta(days=7)

    # Find guardians of this student who should receive notifications
    active_rels = GuardianRelationship.objects.filter(
        student=student,
        status='active',
        verified_at__isnull=False,
        receive_notifications=True
    ).select_related('guardian', 'guardian__user')

    guardians = [r.guardian for r in active_rels if r.guardian]

    # Deduplication check: check if an alert for this student and condition_type exists in last 7 days
    existing = ParentRiskAlert.objects.filter(
        student=student,
        condition_type=condition_type,
        status__in=['active', 'read', 'acknowledged'],
        created_at__gte=seven_days_ago
    ).first()

    evidence_text = f"{description} | Recommendation: {suggested_action}"

    if existing:
        existing.evidence_text = evidence_text
        existing.save(update_fields=['evidence_text', 'updated_at'])
        return None

    # Primary guardian
    primary_guardian = None
    for r in active_rels:
        if r.is_primary:
            primary_guardian = r.guardian
            break
    if not primary_guardian and guardians:
        primary_guardian = guardians[0]

    # If student has no guardian profile yet, find any GuardianProfile or skip
    if not primary_guardian:
        first_rel = student.guardian_relationships.select_related('guardian').first()
        if first_rel:
            primary_guardian = first_rel.guardian
        else:
            return None

    # Homeroom teacher display
    class_teacher_name = 'Homeroom Teacher'
    enr = student.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
    if enr and enr.school_class:
        cta = ClassTeacherAssignment.objects.filter(
            school_class=enr.school_class
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=timezone.localdate())
        ).select_related('teacher').first()
        if cta and cta.teacher:
            class_teacher_name = cta.teacher.get_full_name() or cta.teacher.username

    confirmation_status = 'confirmed' if mode == 'auto' else 'pending'

    alert = ParentRiskAlert.objects.create(
        guardian=primary_guardian,
        student=student,
        school=student.school,
        condition_type=condition_type,
        condition_key=condition_key,
        subject=subject,
        title=title,
        evidence_text=evidence_text,
        class_teacher_name=class_teacher_name,
        subject_teacher_name=subject.name if subject else '',
        status='active',
        staff_confirmation_status=confirmation_status
    )

    # If confirmed, dispatch in-portal notifications to verified guardians
    if confirmation_status == 'confirmed':
        for g in guardians:
            if g.user:
                Notification.objects.create(
                    user=g.user,
                    title=f"Support Notice: {student.full_name}",
                    body=f"{title}. {description[:100]}"
                )

    record_event(
        actor=None,
        action='parent_risk_alert_created',
        obj=alert,
        changed_fields=['status', 'title'],
        before=None,
        after={'status': 'active', 'student_id': student.id}
    )

    return alert


def _resolve_open_alerts(student: Student, condition_type: str, reason: str):
    """Marks open alerts as resolved when criteria improve."""
    open_alerts = ParentRiskAlert.objects.filter(
        student=student,
        condition_type=condition_type,
        status__in=['active', 'read', 'acknowledged']
    )
    for alert in open_alerts:
        old_status = alert.status
        alert.status = 'resolved'
        alert.resolved_at = timezone.now()
        alert.resolution_note = reason
        alert.save(update_fields=['status', 'resolved_at', 'resolution_note', 'updated_at'])

        record_event(
            actor=None,
            action='parent_risk_alert_resolved',
            obj=alert,
            changed_fields=['status'],
            before={'status': old_status},
            after={'status': 'resolved', 'reason': reason}
        )
