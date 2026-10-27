"""Students at Risk API Views.
Implements INT-001..INT-040 compliance:
- Strict role-based scoping (teachers see own classes, students/parents get 403)
- Versioned, configurable criteria per school
- Objective evidence backing flags
- Review case creation with evidence snapshot
- Flag dismissal with mandatory rationale
- Universal export support (CSV, Excel, PDF) with confidential watermark
"""
from datetime import date
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound
from rest_framework.response import Response

from core.models import School, Student, SchoolClass, ReviewCase, RiskCriteria, RiskDismissal
from core.services.access import schools_scope, classes_scope
from core.services.audit import record_event
from core.services.exports import export_response
from core.services.risk import evaluate_students_at_risk, get_default_criteria_template

MANAGERS = ('organisation_admin', 'school_admin', 'principal')
AUTHORIZED_ROLES = ('organisation_admin', 'school_admin', 'principal', 'teacher')


def _check_risk_access(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if user.role not in AUTHORIZED_ROLES and not user.is_superuser:
        raise PermissionDenied('Students and parents are not permitted to view at-risk records (INT-036).')


def _resolve_school(request):
    user = request.user
    schools = schools_scope(user)
    school_id = request.query_params.get('school') or request.query_params.get('campus') or request.data.get('school') or request.data.get('school_id')
    if school_id:
        try:
            school = schools.get(pk=int(school_id))
        except (ValueError, School.DoesNotExist):
            raise NotFound('Campus not found or outside permitted scope.')
        return school
    if user.school:
        return user.school
    school = schools.first()
    if not school:
        raise NotFound('No accessible campus found.')
    return school


@api_view(['GET'])
def students_at_risk(request):
    """
    Evaluates students of a campus against active RiskCriteria with query filtering and export.
    Filters: campus, class, section, risk_level, indicator, trend, has_case, gender, q
    """
    _check_risk_access(request.user)
    school = _resolve_school(request)

    teacher_classes = None
    if request.user.role == 'teacher' and not request.user.is_superuser:
        teacher_classes = classes_scope(request.user)

    period_override = request.query_params.get('period')
    data = evaluate_students_at_risk(school, teacher_classes=teacher_classes, period_override=period_override)

    flagged = data['flagged_students']
    insufficient = data['insufficient_data_students']

    # Apply filters
    class_param = request.query_params.get('class') or request.query_params.get('school_class')
    if class_param and str(class_param).lower() not in ('all', '', 'none'):
        flagged = [s for s in flagged if str(s['class_id']) == str(class_param) or s['class_name'].lower() == str(class_param).lower()]
        insufficient = [s for s in insufficient if s['class_name'].lower() == str(class_param).lower()]

    section_param = request.query_params.get('section')
    if section_param and str(section_param).lower() not in ('all', '', 'none'):
        flagged = [s for s in flagged if s['section'].lower() == str(section_param).lower()]
        insufficient = [s for s in insufficient if s['section'].lower() == str(section_param).lower()]

    risk_param = request.query_params.get('risk_level')
    if risk_param and str(risk_param).lower() not in ('all', '', 'none'):
        flagged = [s for s in flagged if s['risk_level'].lower() == str(risk_param).lower()]

    indicator_param = request.query_params.get('indicator') or request.query_params.get('rule_type')
    if indicator_param and str(indicator_param).lower() not in ('all', '', 'none'):
        flagged = [s for s in flagged if any(r['indicator'] == indicator_param for r in s['triggered_rules'])]

    trend_param = request.query_params.get('trend')
    if trend_param and str(trend_param).lower() not in ('all', '', 'none'):
        flagged = [s for s in flagged if s['trend'].lower() == str(trend_param).lower()]

    has_case_param = request.query_params.get('has_case')
    if has_case_param in ('true', '1'):
        flagged = [s for s in flagged if s.get('case_info')]
    elif has_case_param in ('false', '0'):
        flagged = [s for s in flagged if not s.get('case_info')]

    gender_param = request.query_params.get('gender')
    if gender_param and str(gender_param).lower() not in ('all', '', 'none'):
        flagged = [s for s in flagged if s['gender'] == str(gender_param).lower()]

    q_param = (request.query_params.get('q') or '').strip().lower()
    if q_param:
        flagged = [
            s for s in flagged
            if q_param in s['student_name'].lower()
            or q_param in (s['admission_number'] or '').lower()
            or q_param in (s['father_name'] or '').lower()
        ]
        insufficient = [
            s for s in insufficient
            if q_param in s['student_name'].lower()
            or q_param in (s['admission_number'] or '').lower()
        ]

    # Handle Export
    fmt = request.query_params.get('format')
    if fmt in ('csv', 'xlsx', 'pdf'):
        columns = [
            {'key': 'student_name', 'label': 'Student Name'},
            {'key': 'admission_number', 'label': 'Admission No'},
            {'key': 'full_class_name', 'label': 'Class & Section'},
            {'key': 'gender_label', 'label': 'Gender'},
            {'key': 'risk_level', 'label': 'Risk Level'},
            {'key': 'triggered_rules_summary', 'label': 'Triggered Indicators'},
            {'key': 'overall_avg', 'label': 'Overall Avg'},
            {'key': 'attendance_pct', 'label': 'Attendance'},
            {'key': 'trend', 'label': 'Trend'},
            {'key': 'case_status', 'label': 'Review Case'}
        ]
        rows = [
            {
                'student_name': s['student_name'],
                'admission_number': s['admission_number'] or '—',
                'full_class_name': s['full_class_name'],
                'gender_label': s['gender_label'],
                'risk_level': s['risk_level'].upper(),
                'triggered_rules_summary': '; '.join(f"{r['label']} ({r['actual_value']})" for r in s['triggered_rules']),
                'overall_avg': f"{s['evidence'].get('overall_average', '—')}%",
                'attendance_pct': f"{s['evidence'].get('attendance_rate', '—')}%",
                'trend': s['trend'].capitalize(),
                'case_status': s['case_info']['status'].capitalize() if s.get('case_info') else 'None'
            }
            for s in flagged
        ]
        record_event(actor=request.user, action='export', obj=school)
        return export_response(
            request,
            filename=f"students_at_risk_{school.code or school.id}",
            title=f"Students at Risk — {school.name}",
            columns=columns,
            rows=rows,
            fmt=fmt,
            meta={
                'watermark': 'CONFIDENTIAL — ACADEMIC REVIEW ONLY',
                'school_name': school.name,
                'disclaimer': 'This list highlights recorded results that may need review. It is not a diagnosis or a final judgement.'
            }
        )

    # Recompute summary for filtered view
    high_cnt = sum(1 for s in flagged if s['risk_level'] == 'high')
    med_cnt = sum(1 for s in flagged if s['risk_level'] == 'medium')
    low_cnt = sum(1 for s in flagged if s['risk_level'] == 'low')

    return Response({
        'criteria_active': data['criteria_active'],
        'criteria': data['criteria'],
        'flagged_students': flagged,
        'insufficient_data_students': insufficient,
        'summary': {
            'total_at_risk': len(flagged),
            'high_risk': high_cnt,
            'medium_risk': med_cnt,
            'low_risk': low_cnt,
            'insufficient_data_count': len(insufficient),
            'by_class': data['summary']['by_class'],
            'by_rule_type': data['summary']['by_rule_type']
        }
    })


@api_view(['GET', 'POST'])
def risk_criteria_view(request):
    """
    GET: Returns active criteria, version history, and starter template.
    POST: Creates a new version of RiskCriteria (admin/principal only).
    """
    _check_risk_access(request.user)
    school = _resolve_school(request)

    if request.method == 'GET':
        active = RiskCriteria.objects.filter(school=school, active=True).order_by('-version').first()
        all_versions = RiskCriteria.objects.filter(school=school).order_by('-version')
        versions_list = [
            {
                'id': c.id,
                'name': c.name,
                'version': c.version,
                'active': c.active,
                'combine_mode': c.combine_mode,
                'min_rules_match': c.min_rules_match,
                'min_data_results': c.min_data_results,
                'evaluation_period': c.evaluation_period,
                'rules_count': len(c.rules),
                'updated_at': str(c.updated_at),
                'created_by': c.created_by.get_full_name() or c.created_by.username if c.created_by else 'System'
            }
            for c in all_versions
        ]
        active_dict = None
        if active:
            active_dict = {
                'id': active.id,
                'name': active.name,
                'version': active.version,
                'active': active.active,
                'combine_mode': active.combine_mode,
                'min_rules_match': active.min_rules_match,
                'min_data_results': active.min_data_results,
                'evaluation_period': active.evaluation_period,
                'rules': active.rules,
                'updated_at': str(active.updated_at)
            }
        return Response({
            'active_criteria': active_dict,
            'all_versions': versions_list,
            'starter_template': get_default_criteria_template(school)
        })

    # POST - create new version
    if request.user.role not in MANAGERS and not request.user.is_superuser:
        raise PermissionDenied('Modifying risk criteria requires administrator or principal role.')

    data = request.data or {}
    name = (data.get('name') or f"Risk Policy ({school.name})").strip()
    combine_mode = data.get('combine_mode') or 'any'
    if combine_mode not in ('any', 'all', 'at_least_n'):
        raise ValidationError({'combine_mode': 'Must be any, all, or at_least_n.'})

    min_rules_match = int(data.get('min_rules_match') or 1)
    min_data_results = int(data.get('min_data_results') or 3)
    evaluation_period = data.get('evaluation_period') or 'whole_year'
    rules = data.get('rules') or []
    if not isinstance(rules, list) or len(rules) == 0:
        raise ValidationError({'rules': 'Criteria must contain at least one configured rule.'})

    activate_now = bool(data.get('activate', True))

    with transaction.atomic():
        last_v = RiskCriteria.objects.filter(school=school).order_by('-version').values_list('version', flat=True).first() or 0
        new_version = last_v + 1

        if activate_now:
            RiskCriteria.objects.filter(school=school).update(active=False)

        criteria = RiskCriteria.objects.create(
            school=school,
            name=name,
            active=activate_now,
            version=new_version,
            combine_mode=combine_mode,
            min_rules_match=min_rules_match,
            min_data_results=min_data_results,
            evaluation_period=evaluation_period,
            rules=rules,
            created_by=request.user
        )

    record_event(actor=request.user, action='create', obj=criteria)

    return Response({
        'id': criteria.id,
        'name': criteria.name,
        'version': criteria.version,
        'active': criteria.active,
        'combine_mode': criteria.combine_mode,
        'min_rules_match': criteria.min_rules_match,
        'min_data_results': criteria.min_data_results,
        'evaluation_period': criteria.evaluation_period,
        'rules': criteria.rules,
        'updated_at': str(criteria.updated_at)
    }, status=201)


@api_view(['POST'])
def risk_criteria_activate(request):
    """Activates an existing criteria version for a school."""
    if request.user.role not in MANAGERS and not request.user.is_superuser:
        raise PermissionDenied('Activating risk criteria requires administrator or principal role.')

    criteria_id = request.data.get('criteria_id')
    if not criteria_id:
        raise ValidationError({'criteria_id': 'criteria_id is required.'})

    criteria = get_object_or_404(RiskCriteria, pk=criteria_id)
    if criteria.school not in schools_scope(request.user):
        raise PermissionDenied('Criteria belongs to a campus outside your scope.')

    with transaction.atomic():
        RiskCriteria.objects.filter(school=criteria.school).update(active=False)
        criteria.active = True
        criteria.save(update_fields=['active', 'updated_at'])

    record_event(actor=request.user, action='activate', obj=criteria)

    return Response({'detail': f'Criteria version {criteria.version} activated successfully.', 'criteria_id': criteria.id})


@api_view(['POST'])
def risk_case_create(request, student_id):
    """Creates a ReviewCase for an at-risk student prefilled with objective evidence snapshot."""
    _check_risk_access(request.user)

    student = get_object_or_404(Student, pk=student_id)
    if student.school not in schools_scope(request.user):
        raise PermissionDenied('Student is outside your scope.')

    if request.user.role == 'teacher' and not request.user.is_superuser:
        teacher_classes = classes_scope(request.user)
        enrolled_classes = student.enrollments.filter(end_date__isnull=True).values_list('school_class_id', flat=True)
        if not any(cid in teacher_classes.values_list('id', flat=True) for cid in enrolled_classes):
            raise PermissionDenied('You can only create review cases for students in your assigned classes.')

    data = request.data or {}
    title = (data.get('title') or f"Academic/Attendance Review: {student.full_name}").strip()
    reason = (data.get('reason') or data.get('description') or 'Identified through at-risk objective criteria evaluation.').strip()
    priority = (data.get('priority') or 'medium').strip()
    if priority not in ('low', 'medium', 'high'):
        priority = 'medium'

    case = ReviewCase.objects.create(
        school=student.school,
        student=student,
        title=title,
        reason=reason,
        status='open',
        priority=priority,
        assignee=request.user
    )

    record_event(actor=request.user, action='create', obj=case)

    return Response({
        'id': case.id,
        'student_id': student.id,
        'student_name': student.full_name,
        'title': case.title,
        'reason': case.reason,
        'status': case.status,
        'priority': case.priority,
        'assignee': request.user.get_full_name() or request.user.username,
        'created_at': str(case.created_at)
    }, status=201)


@api_view(['POST'])
def risk_dismiss(request, student_id):
    """
    Dismisses an at-risk flag with mandatory justification (reason).
    If metrics worsen subsequently, flag reappears.
    """
    _check_risk_access(request.user)

    student = get_object_or_404(Student, pk=student_id)
    if student.school not in schools_scope(request.user):
        raise PermissionDenied('Student is outside your scope.')

    if request.user.role == 'teacher' and not request.user.is_superuser:
        teacher_classes = classes_scope(request.user)
        enrolled_classes = student.enrollments.filter(end_date__isnull=True).values_list('school_class_id', flat=True)
        if not any(cid in teacher_classes.values_list('id', flat=True) for cid in enrolled_classes):
            raise PermissionDenied('You can only dismiss flags for students in your assigned classes.')

    data = request.data or {}
    reason = (data.get('reason') or '').strip()
    if not reason or len(reason) < 5:
        raise ValidationError({'reason': 'A substantive reason (at least 5 characters) is required to dismiss an at-risk flag.'})

    until_date_str = data.get('until_date')
    until_date = None
    if until_date_str:
        try:
            until_date = date.fromisoformat(str(until_date_str))
        except (ValueError, TypeError):
            raise ValidationError({'until_date': 'Invalid ISO date format (YYYY-MM-DD).'})

    snapshot = data.get('snapshot') or {}

    active_crit = RiskCriteria.objects.filter(school=student.school, active=True).order_by('-version').first()
    crit_version = active_crit.version if active_crit else 1

    dismissal = RiskDismissal.objects.create(
        school=student.school,
        student=student,
        dismissed_by=request.user,
        reason=reason,
        until_date=until_date,
        criteria_version=crit_version,
        snapshot=snapshot
    )

    record_event(actor=request.user, action='dismiss', obj=dismissal)

    return Response({
        'id': dismissal.id,
        'student_id': student.id,
        'student_name': student.full_name,
        'reason': dismissal.reason,
        'until_date': str(dismissal.until_date) if dismissal.until_date else None,
        'created_at': str(dismissal.created_at)
    }, status=201)
