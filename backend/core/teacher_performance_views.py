"""Teacher Performance API Views (Spec Part B).

Provides evidence-based teaching performance evaluations:
- Overview: Benchmarks, distribution, evaluated teachers roll
- Detail: Assigned classes metrics, term sparklines, alerts, notes
- Self-View: Teacher-isolated reflection view
- Criteria: Versioned rules with live preview before publish
- Alerts: Supportive workflow requiring Principal confirmation
- Export: Formula-sanitized streaming Excel downloads
"""
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
from rest_framework.response import Response

from core.models import User, School, TeacherPerformanceAlert, TeacherPerformanceCriteria, TeacherPerformanceNote
from core.services.feature_permissions import requires_feature
from core.services.record_permissions import resolve_record_school, resolve_record_schools, check_record_capability
from core.services.teacher_performance_service import (
    get_teacher_performance_overview, get_teacher_performance_detail,
    preview_criteria_impact, update_criteria_version, update_alert_status,
    get_active_criteria
)
from core.services.record_exports import generate_record_excel_response


@api_view(['GET'])
@requires_feature('teacher_insights')
def teacher_performance_overview_view(request):
    """GET /api/v1/teacher-performance/overview/"""
    is_all, school, schools = resolve_record_schools(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'teacher_performance.view_summary'):
        raise PermissionDenied('Access to Teacher Performance Overview requires leadership authorization.')

    data = get_teacher_performance_overview(school, request.query_params, is_all=is_all, schools=schools)
    return Response(data)


@api_view(['GET'])
@requires_feature('teacher_insights')
def teacher_performance_detail_view(request, teacher_id):
    """GET /api/v1/teacher-performance/teachers/<int:teacher_id>/"""
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))

    # If teacher is requesting, they may only see their own detail if enabled
    if request.user.role == 'teacher':
        if request.user.id != int(teacher_id):
            raise PermissionDenied('Teachers are strictly prohibited from viewing peer performance.')
        if not getattr(school, 'teachers_can_view_own_performance', True):
            raise PermissionDenied('Teacher self-performance view is currently disabled by institution policy.')
    else:
        if not check_record_capability(request.user, school, 'teacher_performance.view_detail'):
            raise PermissionDenied('Access to Teacher Performance Detail requires leadership authorization.')

    teacher_user = User.objects.filter(pk=teacher_id, school=school).first()
    if not teacher_user:
        raise NotFound('Teacher not found in this campus.')

    data = get_teacher_performance_detail(school, teacher_user, request.user)
    return Response(data)


@api_view(['GET'])
@requires_feature('teacher_insights')
def teacher_performance_self_view(request):
    """GET /api/v1/teacher-performance/me/ (Teacher self-view endpoint)"""
    if request.user.role != 'teacher':
        raise PermissionDenied('Endpoint reserved for authenticated teachers.')

    school = request.user.school
    if not school:
        raise NotFound('No campus associated with this teacher account.')
    if not getattr(school, 'teachers_can_view_own_performance', True):
        raise PermissionDenied('Teacher performance view is not enabled for your campus.')

    data = get_teacher_performance_detail(school, request.user, request.user)
    return Response(data)


@api_view(['GET', 'POST'])
@requires_feature('teacher_insights')
def teacher_performance_criteria_view(request):
    """GET, POST /api/v1/teacher-performance/criteria/"""
    requested_campus = request.query_params.get('campus') or request.data.get('campus')
    is_all, school, schools = resolve_record_schools(request.user, requested_campus)
    if not check_record_capability(request.user, school, 'teacher_performance.manage_criteria'):
        raise PermissionDenied('Criteria configuration requires leadership authorization.')

    if request.method == 'GET':
        crit = get_active_criteria(school)
        history = TeacherPerformanceCriteria.objects.filter(school=school).order_by('-version')[:15]
        rules = crit.rules or {}
        active_crit_dict = {
            'version': crit.version,
            'name': crit.name,
            'min_students': crit.min_students,
            'min_assessments': crit.min_assessments,
            'diff_campus_threshold': float(crit.diff_campus_threshold),
            'drop_term_threshold': float(crit.drop_term_threshold),
            'pass_rate_threshold': float(crit.pass_rate_threshold),
            'class_avg_threshold': float(rules.get('class_avg_threshold', 50.0)),
            'include_class_teacher': bool(rules.get('include_class_teacher', True)),
            'class_teacher_weight': int(rules.get('class_teacher_weight', 15)),
            'show_all_classes': bool(rules.get('show_all_classes', True)),
            'aggregation_mode': rules.get('aggregation_mode', 'weighted_by_students'),
            'weights': rules.get('weights', {
                'class_average': 40,
                'pass_rate': 30,
                'campus_diff': 20,
                'class_teacher': 10,
            }),
            'grade_levels': rules.get('grade_levels', ['all']),
            'rules': rules,
        }

        history_list = [{
            'version': h.version,
            'name': h.name,
            'active': h.active,
            'min_students': h.min_students,
            'min_assessments': h.min_assessments,
            'diff_campus_threshold': float(h.diff_campus_threshold),
            'drop_term_threshold': float(h.drop_term_threshold),
            'pass_rate_threshold': float(h.pass_rate_threshold),
            'class_avg_threshold': float((h.rules or {}).get('class_avg_threshold', 50.0)),
            'include_class_teacher': bool((h.rules or {}).get('include_class_teacher', True)),
            'aggregation_mode': (h.rules or {}).get('aggregation_mode', 'weighted_by_students'),
            'explanation_of_change': h.explanation_of_change,
            'created_by': h.created_by.get_full_name() if h.created_by else 'System Leadership',
            'created_at': h.created_at.strftime('%Y-%m-%d %H:%M'),
        } for h in history]

        campuses_list = [{'id': s.id, 'name': s.name, 'code': s.code} for s in schools]

        return Response({
            'active_criteria': active_crit_dict,
            'version_history': history_list,
            'is_all_campuses': is_all,
            'campus_id': school.id if not is_all else 'all',
            'campus_name': school.name if not is_all else 'All Campuses (Consolidated)',
            'campuses': campuses_list,
        })

    # POST new criteria version
    apply_all = bool(request.data.get('apply_to_all_campuses') or is_all)
    can_apply_all = request.user.role in ('organisation_admin', 'platform_admin') or request.user.is_superuser
    if apply_all and can_apply_all:
        target_schools = list(schools)
    else:
        target_schools = [school]

    new_crit = None
    for s in target_schools:
        new_crit = update_criteria_version(s, request.data, request.user)

    return Response({
        'status': 'updated',
        'version': new_crit.version,
        'applied_campuses_count': len(target_schools),
        'message': f"Teacher performance criteria updated to version {new_crit.version} across {len(target_schools)} campus(es).",
    }, status=201)


@api_view(['POST'])
@requires_feature('teacher_insights')
def teacher_performance_preview_view(request):
    """POST /api/v1/teacher-performance/criteria/preview/"""
    requested_campus = request.data.get('campus')
    is_all, school, schools = resolve_record_schools(request.user, requested_campus)
    if not check_record_capability(request.user, school, 'teacher_performance.manage_criteria'):
        raise PermissionDenied('Preview requires criteria management authorization.')

    result = preview_criteria_impact(school, request.data, is_all=is_all, schools=schools)
    return Response(result)


@api_view(['GET'])
@requires_feature('teacher_insights')
def teacher_performance_alerts_view(request):
    """GET /api/v1/teacher-performance/alerts/"""
    school = resolve_record_school(request.user, request.query_params.get('campus'))
    if not check_record_capability(request.user, school, 'teacher_performance.manage_alerts'):
        raise PermissionDenied('Alerts management requires leadership authorization.')

    alerts_qs = TeacherPerformanceAlert.objects.filter(school=school).select_related(
        'teacher', 'school_class', 'subject'
    ).order_by('-created_at')

    rows = []
    for al in alerts_qs[:100]:
        rows.append({
            'id': al.id,
            'teacher_name': al.teacher.get_full_name() or al.teacher.username,
            'class_name': al.school_class.name,
            'subject_name': al.subject.name,
            'term_name': al.term_name,
            'trigger_reason': al.trigger_reason,
            'status': al.status,
            'status_display': al.get_status_display(),
            'action_plan': al.action_plan,
            'created_at': al.created_at.strftime('%Y-%m-%d %H:%M'),
        })
    return Response({'alerts': rows, 'total_count': len(rows)})


@api_view(['POST'])
@requires_feature('teacher_insights')
def teacher_performance_alert_action_view(request, alert_id):
    """POST /api/v1/teacher-performance/alerts/<int:alert_id>/action/"""
    school = resolve_record_school(request.user, request.data.get('campus'))
    if not check_record_capability(request.user, school, 'teacher_performance.manage_alerts'):
        raise PermissionDenied('Alert action requires leadership authorization.')

    action = request.data.get('action')
    al = update_alert_status(school, alert_id, action, request.data, request.user)
    return Response({
        'status': 'success',
        'alert_id': al.id,
        'alert_status': al.status,
    })


@api_view(['POST'])
@requires_feature('teacher_insights')
def teacher_performance_notes_view(request):
    """POST /api/v1/teacher-performance/notes/"""
    school = resolve_record_school(request.user, request.data.get('campus'))
    teacher_id = request.data.get('teacher_id')
    content = request.data.get('content', '').strip()
    kind = request.data.get('kind', 'private_leadership')

    if not content:
        raise ValidationError({'content': 'Note text cannot be empty.'})

    teacher = User.objects.filter(pk=teacher_id, school=school).first()
    if not teacher:
        raise NotFound('Teacher not found.')

    if kind == 'self_reflection':
        if request.user != teacher:
            raise PermissionDenied('Self-reflections can only be authored by the teacher.')
    else:
        if not check_record_capability(request.user, school, 'teacher_performance.private_notes'):
            raise PermissionDenied('Private leadership notes require leadership authorization.')

    note = TeacherPerformanceNote.objects.create(
        school=school,
        teacher=teacher,
        author=request.user,
        kind=kind,
        term_name=request.data.get('term_name', ''),
        content=content
    )
    return Response({'status': 'created', 'note_id': note.id}, status=201)


@api_view(['GET'])
@requires_feature('teacher_insights')
def teacher_performance_export_view(request):
    """GET /api/v1/teacher-performance/export/ (Excel .xlsx download)"""
    is_all, school, schools = resolve_record_schools(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'teacher_performance.export'):
        raise PermissionDenied('Export permission required.')

    overview = get_teacher_performance_overview(school, request.query_params, is_all=is_all, schools=schools)
    rows = overview.get('teachers', [])

    cols = [
        {'key': 'name', 'label': 'Teacher Name', 'type': 'text'},
    ]
    if is_all:
        cols.append({'key': 'campus_name', 'label': 'Campus', 'type': 'text'})
    cols.extend([
        {'key': 'email', 'label': 'Email Address', 'type': 'text'},
        {'key': 'assigned_classes_count', 'label': 'Assigned Classes', 'type': 'number'},
        {'key': 'total_students_evaluated', 'label': 'Students Evaluated', 'type': 'number'},
        {'key': 'composite_average', 'label': 'Composite Average %', 'type': 'number'},
        {'key': 'status_display', 'label': 'Performance Status', 'type': 'text'},
    ])

    return generate_record_excel_response(
        request, school, 'teacher_performance', 'Teacher Performance Summary',
        request.query_params.dict(), cols, rows, is_all=is_all
    )
