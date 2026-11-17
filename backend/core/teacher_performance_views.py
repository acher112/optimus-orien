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
from core.services.record_permissions import resolve_record_school, check_record_capability
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
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'teacher_performance.view_summary'):
        raise PermissionDenied('Access to Teacher Performance Overview requires leadership authorization.')

    data = get_teacher_performance_overview(school, request.query_params)
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
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.data.get('campus'))
    if not check_record_capability(request.user, school, 'teacher_performance.manage_criteria'):
        raise PermissionDenied('Criteria configuration requires leadership authorization.')

    if request.method == 'GET':
        crit = get_active_criteria(school)
        history = TeacherPerformanceCriteria.objects.filter(school=school).order_by('-version')[:10]
        history_list = [{
            'version': h.version,
            'name': h.name,
            'active': h.active,
            'min_students': h.min_students,
            'min_assessments': h.min_assessments,
            'diff_campus_threshold': float(h.diff_campus_threshold),
            'drop_term_threshold': float(h.drop_term_threshold),
            'pass_rate_threshold': float(h.pass_rate_threshold),
            'explanation_of_change': h.explanation_of_change,
            'created_at': h.created_at.strftime('%Y-%m-%d %H:%M'),
        } for h in history]

        return Response({
            'active_criteria': {
                'version': crit.version,
                'name': crit.name,
                'min_students': crit.min_students,
                'min_assessments': crit.min_assessments,
                'diff_campus_threshold': float(crit.diff_campus_threshold),
                'drop_term_threshold': float(crit.drop_term_threshold),
                'pass_rate_threshold': float(crit.pass_rate_threshold),
            },
            'version_history': history_list,
        })

    # POST new criteria version
    new_crit = update_criteria_version(school, request.data, request.user)
    return Response({
        'status': 'updated',
        'version': new_crit.version,
        'message': f"Teacher performance criteria updated to version {new_crit.version}.",
    }, status=201)


@api_view(['POST'])
@requires_feature('teacher_insights')
def teacher_performance_preview_view(request):
    """POST /api/v1/teacher-performance/criteria/preview/"""
    school = resolve_record_school(request.user, request.data.get('campus'))
    if not check_record_capability(request.user, school, 'teacher_performance.manage_criteria'):
        raise PermissionDenied('Preview requires criteria management authorization.')

    result = preview_criteria_impact(school, request.data)
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
    school = resolve_record_school(request.user, request.query_params.get('campus') or request.query_params.get('school'))
    if not check_record_capability(request.user, school, 'teacher_performance.export'):
        raise PermissionDenied('Export permission required.')

    overview = get_teacher_performance_overview(school, request.query_params)
    rows = overview.get('teachers', [])

    cols = [
        {'key': 'name', 'label': 'Teacher Name', 'type': 'text'},
        {'key': 'email', 'label': 'Email Address', 'type': 'text'},
        {'key': 'assigned_classes_count', 'label': 'Assigned Classes', 'type': 'number'},
        {'key': 'total_students_evaluated', 'label': 'Students Evaluated', 'type': 'number'},
        {'key': 'composite_average', 'label': 'Composite Average %', 'type': 'number'},
        {'key': 'status_display', 'label': 'Performance Status', 'type': 'text'},
    ]

    return generate_record_excel_response(
        request, school, 'teacher_performance', 'Teacher Performance Summary',
        request.query_params.dict(), cols, rows
    )
