"""API Views for OPTIMUS ORIEN Psychological Evaluation Module.

Provides endpoints for:
- Template & Questionnaire (18 items, 6 dimensions, Likert scale 1-5 + null).
- Hierarchical Dashboards (Level 1: System/School, Level 2: Campus, Level 3: Class).
- Student Profile (Level 4: 6D Radar Chart, Combined Multi-Teacher Profile, Period Comparison, Line Chart Historical Timeline).
- Student Portal: My Development Profile (Published records only, encouraging non-diagnostic language, no internal notes).
- Teacher Workspace (Weekly evaluation workflow, draft, submit, revise, duplicate prevention).
- Publication Management (Publish / unpublish weekly profile to student view).
- Confidential Safeguarding Referrals (Separate restricted workflow).
- Gender-Based Analytics (Strict privacy, no inference, N/A on small sample).
- Audit Logs & Universal Export.
"""
import csv
from datetime import date
from io import StringIO
from django.db import transaction
from django.db.models import Avg, Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
from rest_framework.response import Response

from core.models import (
    AcademicYear, ClassTeacherAssignment, Enrollment, Organisation,
    School, SchoolClass, Section, Student, Subject, TeachingAssignment, User,
    EvaluationTemplate, EvaluationDimension, EvaluationQuestion,
    WeeklyEvaluation, EvaluationResponse, EvaluationDomainScore,
    EvaluationPublication, EvaluationAuditLog, EvaluationSafeguardingReferral
)
from core.services.psychological_evaluation import (
    TEMPLATE_VERSION, VALIDATION_STATUS, ADMINISTRATION_INSTRUCTIONS, PROFILE_DISCLAIMER,
    ensure_default_template, get_current_school_week, log_audit,
    check_school_access, check_student_view_permission, check_teacher_evaluate_permission,
    calculate_evaluation_scores, get_student_combined_profile, get_student_history_timeline,
    get_hierarchical_dashboard, get_class_evaluation_summary, get_teacher_evaluation_workspace,
    save_evaluation
)
from core.services.teacher_scope import get_teacher_scope


# ==============================================================================
# 1. TEMPLATE & QUESTIONNAIRE
# ==============================================================================

@api_view(['GET'])
def evaluation_template_view(request):
    """GET /api/v1/psychological-evaluations/template/
    Return the active 18-item observation questionnaire grouped into 6 dimensions.
    """
    user = request.user
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    template = ensure_default_template()

    dimensions = []
    for dim in template.dimensions.all().order_by('display_order'):
        questions = []
        for q in dim.questions.filter(active=True).order_by('display_order'):
            questions.append({
                'id': q.id,
                'display_order': q.display_order,
                'question_text': q.question_text,
            })
        dimensions.append({
            'id': dim.id,
            'key': dim.dimension_key,
            'name': dim.dimension_name,
            'description': dim.description,
            'display_order': dim.display_order,
            'questions': questions,
        })

    return Response({
        'template_id': template.id,
        'version': template.version,
        'name': template.name,
        'instructions': template.instructions,
        'disclaimer': template.disclaimer,
        'validation_status': template.validation_status,
        'scale_options': [
            {'value': 1, 'label': 'Never observed'},
            {'value': 2, 'label': 'Rarely observed'},
            {'value': 3, 'label': 'Sometimes observed'},
            {'value': 4, 'label': 'Frequently observed'},
            {'value': 5, 'label': 'Consistently observed'},
            {'value': None, 'label': 'Not Observed / Insufficient Opportunity'},
        ],
        'dimensions': dimensions,
        'current_week': get_current_school_week(),
    })


# ==============================================================================
# 2. HIERARCHICAL OVERVIEW (LEVEL 1 & LEVEL 2)
# ==============================================================================

@api_view(['GET'])
def hierarchical_overview(request):
    """GET /api/v1/psychological-evaluations/overview/
    Levels 1 & 2 dashboard overview.
    Filters: school_id, class_id, week, gender.
    """
    user = request.user
    school_id = request.query_params.get('school_id')
    class_id = request.query_params.get('class_id')
    week = request.query_params.get('week')
    gender = request.query_params.get('gender')

    data = get_hierarchical_dashboard(
        user=user,
        school_id=school_id,
        class_id=class_id,
        evaluation_week=week,
        gender_filter=gender
    )

    log_audit(user, 'view_overview', 'Dashboard', school_id or 'all', {'week': week})
    return Response(data)


# ==============================================================================
# 3. CLASS SUMMARY (LEVEL 3)
# ==============================================================================

@api_view(['GET'])
def class_evaluation_summary(request):
    """GET /api/v1/psychological-evaluations/class-summary/
    Level 3 class overview with student completion status and domain averages.
    Params: class_id, week.
    """
    user = request.user
    class_id = request.query_params.get('class_id')
    if not class_id:
        raise ValidationError("class_id query parameter is required.")

    week = request.query_params.get('week')
    data = get_class_evaluation_summary(user, class_id=class_id, evaluation_week=week)

    log_audit(user, 'view_class_summary', 'SchoolClass', class_id, {'week': week})
    return Response(data)


# ==============================================================================
# 4. STUDENT PROFILE (LEVEL 4: RADAR CHART, TIMELINE, TEACHER OBS)
# ==============================================================================

@api_view(['GET'])
def student_profile_view(request, student_id):
    """GET /api/v1/psychological-evaluations/student-profile/<student_id>/
    Level 4 student behavioural & developmental profile.
    Returns:
      - 6D Radar chart data for selected week
      - Optional period comparison (radar overlay with compare_week)
      - Line chart weekly historical trends
      - Contributing teacher observations
      - Tabular data representation for accessibility
    """
    user = request.user
    try:
        student = Student.objects.select_related('school').get(id=student_id)
    except Student.DoesNotExist:
        raise NotFound("Student not found.")

    # Server-side view permission check
    check_student_view_permission(user, student, allow_unpublished=True)

    week = request.query_params.get('week')
    compare_week = request.query_params.get('compare_week')

    # Main profile for selected week
    profile = get_student_combined_profile(student, evaluation_week=week)

    # Optional comparison profile
    comparison_profile = None
    if compare_week and compare_week != profile['evaluation_week']:
        comparison_profile = get_student_combined_profile(student, evaluation_week=compare_week)

    # Weekly history timeline (Line chart)
    history = get_student_history_timeline(student, current_week=profile['evaluation_week'])

    # Determine caller's permission to see internal notes (only staff/admin/principal/teachers; NEVER students/parents)
    can_view_internal_notes = user.role in ('organisation_admin', 'school_admin', 'principal', 'teacher') or user.is_superuser
    if not can_view_internal_notes:
        for obs in profile['teacher_observations']:
            obs['teacher_notes'] = ''
        if comparison_profile:
            for obs in comparison_profile['teacher_observations']:
                obs['teacher_notes'] = ''

    log_audit(user, 'view_student_profile', 'Student', student.id, {'week': profile['evaluation_week']})

    return Response({
        'profile': profile,
        'comparison': comparison_profile,
        'history': history,
        'can_publish': user.role in ('organisation_admin', 'school_admin', 'principal', 'teacher') or user.is_superuser,
    })


# ==============================================================================
# 5. STUDENT PORTAL: MY DEVELOPMENT PROFILE (Section 11)
# ==============================================================================

@api_view(['GET'])
def student_my_profile_view(request):
    """GET /api/v1/psychological-evaluations/my-profile/
    Student-facing self-service development profile.
    Strictly isolated:
      - Only published evaluation records visible.
      - Internal notes, safeguarding records, and staff discussions are completely hidden.
      - Uses encouraging, constructive language.
    """
    user = request.user
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    student = getattr(user, 'student_record', None)
    if not student:
        # If user is parent, allow viewing ward
        if user.role == 'parent':
            ward = user.wards.first()
            if not ward:
                raise NotFound("No student ward linked to your account.")
            student = ward
        else:
            raise PermissionDenied("This endpoint is reserved for students and their guardians.")

    week = request.query_params.get('week')

    # Query published weeks for this student
    published_weeks_qs = EvaluationPublication.objects.filter(
        student=student,
        visibility_status='published'
    ).order_by('-evaluation_week').values_list('evaluation_week', flat=True)

    published_weeks = list(published_weeks_qs)

    if not published_weeks:
        return Response({
            'has_published_evaluations': False,
            'message': 'Your development profile has not been published yet. Please check back after your teachers have completed observations.',
            'validation_status': VALIDATION_STATUS,
            'disclaimer': PROFILE_DISCLAIMER,
        })

    if not week or week not in published_weeks:
        week = published_weeks[0]

    profile = get_student_combined_profile(student, evaluation_week=week)

    # Strictly strip internal notes and non-approved fields
    clean_teacher_feedback = []
    for obs in profile['teacher_observations']:
        if obs.get('student_visible_feedback'):
            clean_teacher_feedback.append({
                'teacher_name': obs['teacher_name'],
                'subject_name': obs['subject_name'],
                'feedback': obs['student_visible_feedback'],
            })

    # Timeline of published weeks only
    history = get_student_history_timeline(student, current_week=week)
    filtered_timeline = [pt for pt in history['timeline'] if pt['evaluation_week'] in published_weeks]
    history['timeline'] = filtered_timeline

    # Constructive encouraging descriptions for each dimension
    encouraging_guidance = {
        'learning_engagement': "You demonstrate positive participation and enthusiasm in learning tasks. Keep asking questions when curious!",
        'self_regulation': "You show dependable focus and respect for agreed classroom routines during learning activities.",
        'emotional_regulation': "You handle challenges with resilience and use constructive strategies to refocus when tasks are tough.",
        'social_interaction': "You treat classmates and teachers respectfully and collaborate productively in group settings.",
        'responsibility_independence': "You take strong personal responsibility for completing your tasks and caring for materials.",
        'communication_help_seeking': "You express your thoughts clearly and seek guidance proactively whenever you need support.",
    }

    log_audit(user, 'view_my_profile', 'Student', student.id, {'week': week})

    return Response({
        'has_published_evaluations': True,
        'student_id': student.id,
        'student_name': student.full_name,
        'admission_number': student.admission_number,
        'evaluation_week': week,
        'published_weeks': published_weeks,
        'radar_axes': profile['radar_axes'],
        'dimensions': profile['dimensions'],
        'teacher_feedback': clean_teacher_feedback,
        'timeline': filtered_timeline,
        'trajectory': history.get('trajectory', []),
        'encouraging_guidance': encouraging_guidance,
        'validation_status': VALIDATION_STATUS,
        'disclaimer': PROFILE_DISCLAIMER,
    })


# ==============================================================================
# 6. TEACHER WORKSPACE & EVALUATION SUBMISSION (Section 12)
# ==============================================================================

@api_view(['GET'])
def teacher_workspace_view(request):
    """GET /api/v1/psychological-evaluations/workspace/
    Weekly evaluation workspace for teachers.
    Params: class_id, subject_id, week.
    """
    user = request.user
    class_id = request.query_params.get('class_id')
    subject_id = request.query_params.get('subject_id')
    week = request.query_params.get('week')

    data = get_teacher_evaluation_workspace(
        user=user,
        selected_class_id=int(class_id) if class_id else None,
        selected_subject_id=int(subject_id) if subject_id else None,
        evaluation_week=week
    )
    return Response(data)


@api_view(['GET'])
def get_evaluation_detail(request):
    """GET /api/v1/psychological-evaluations/evaluations/find/
    Retrieve an evaluation record or create an initial draft.
    Params: student_id, class_id, subject_id, week.
    """
    user = request.user
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    student_id = request.query_params.get('student_id')
    class_id = request.query_params.get('class_id')
    subject_id = request.query_params.get('subject_id')
    week = request.query_params.get('week') or get_current_school_week()

    if not student_id or not class_id:
        raise ValidationError("student_id and class_id are required.")

    try:
        student = Student.objects.select_related('school').get(id=student_id)
        school_class = SchoolClass.objects.select_related('school').get(id=class_id)
    except (Student.DoesNotExist, SchoolClass.DoesNotExist):
        raise NotFound("Student or Class not found.")

    subject = None
    if subject_id:
        try:
            subject = Subject.objects.get(id=subject_id, school_id=school_class.school_id)
        except Subject.DoesNotExist:
            raise NotFound("Subject not found.")

    # Authorization
    check_teacher_evaluate_permission(user, student, school_class, subject)

    observation_context = f"Subject: {subject.name}" if subject else "Homeroom / Classroom Observation"

    evaluation = WeeklyEvaluation.objects.filter(
        teacher=user,
        student=student,
        evaluation_week=week,
        observation_context=observation_context
    ).first()

    responses_data = {}
    if evaluation:
        for resp in evaluation.responses.all():
            responses_data[resp.question_id] = resp.response_value

    return Response({
        'evaluation_id': evaluation.id if evaluation else None,
        'student_id': student.id,
        'student_name': student.full_name,
        'class_id': school_class.id,
        'class_name': school_class.display_name,
        'subject_id': subject.id if subject else None,
        'subject_name': subject.name if subject else 'Homeroom / General',
        'observation_context': observation_context,
        'evaluation_week': week,
        'status': evaluation.status if evaluation else 'not_started',
        'submitted_at': evaluation.submitted_at.isoformat() if (evaluation and evaluation.submitted_at) else None,
        'responses': responses_data,
        'strengths_observed': evaluation.strengths_observed if evaluation else '',
        'support_areas': evaluation.support_areas if evaluation else '',
        'support_action': evaluation.support_action if evaluation else '',
        'teacher_notes': evaluation.teacher_notes if evaluation else '',
        'student_visible_feedback': evaluation.student_visible_feedback if evaluation else '',
    })


@api_view(['POST'])
def save_evaluation_view(request):
    """POST /api/v1/psychological-evaluations/evaluations/save/
    Draft or submit an evaluation.
    Payload:
      student_id, class_id, subject_id, evaluation_week, status ('draft' | 'submitted'),
      responses: { question_id: value (1-5 or null) },
      strengths_observed, support_areas, support_action, teacher_notes, student_visible_feedback,
      is_revision (boolean)
    """
    user = request.user
    evaluation = save_evaluation(user, request.data)

    return Response({
        'ok': True,
        'evaluation_id': evaluation.id,
        'status': evaluation.status,
        'submitted_at': evaluation.submitted_at.isoformat() if evaluation.submitted_at else None,
        'message': f"Evaluation successfully saved as {evaluation.status}."
    })


@api_view(['POST'])
def revise_evaluation_view(request, pk):
    """POST /api/v1/psychological-evaluations/evaluations/<pk>/revise/
    Authorized amendment of a previously submitted evaluation.
    """
    user = request.user
    try:
        ev = WeeklyEvaluation.objects.get(id=pk)
    except WeeklyEvaluation.DoesNotExist:
        raise NotFound("Evaluation not found.")

    if ev.teacher_id != user.id and not user.is_superuser:
        raise PermissionDenied("You can only revise evaluations you submitted.")

    data = request.data.copy()
    data['is_revision'] = True
    data['status'] = 'submitted'
    data['student_id'] = ev.student_id
    data['class_id'] = ev.school_class_id
    data['subject_id'] = ev.subject_id
    data['evaluation_week'] = ev.evaluation_week

    revised_ev = save_evaluation(user, data)

    return Response({
        'ok': True,
        'evaluation_id': revised_ev.id,
        'status': revised_ev.status,
        'message': "Evaluation revision saved successfully with audit record."
    })


# ==============================================================================
# 7. PUBLICATION MANAGEMENT (PUBLISH / UNPUBLISH)
# ==============================================================================

@api_view(['POST'])
def publish_evaluation_view(request):
    """POST /api/v1/psychological-evaluations/publications/publish/
    Publish or unpublish weekly profile to make it visible to the student.
    Payload: student_id, evaluation_week, visibility_status ('published' | 'unpublished'), notes
    """
    user = request.user
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    student_id = request.data.get('student_id')
    evaluation_week = request.data.get('evaluation_week')
    visibility = request.data.get('visibility_status', 'published')
    notes = request.data.get('notes', '')

    if not student_id or not evaluation_week:
        raise ValidationError("student_id and evaluation_week are required.")

    try:
        student = Student.objects.select_related('school').get(id=student_id)
    except Student.DoesNotExist:
        raise NotFound("Student not found.")

    # Only authorized staff/principals/class teachers can publish
    check_student_view_permission(user, student)
    if user.role not in ('organisation_admin', 'school_admin', 'principal', 'teacher') and not user.is_superuser:
        raise PermissionDenied("You do not have permission to publish evaluation profiles.")

    pub, created = EvaluationPublication.objects.update_or_create(
        student=student,
        evaluation_week=evaluation_week,
        defaults={
            'published_by': user,
            'published_at': timezone.now(),
            'visibility_status': visibility,
            'notes': notes,
        }
    )

    action_name = 'publish' if visibility == 'published' else 'unpublish'
    log_audit(
        actor=user,
        action=action_name,
        record_type='EvaluationPublication',
        record_id=pub.id,
        metadata={'student_id': student.id, 'week': evaluation_week, 'visibility': visibility}
    )

    return Response({
        'ok': True,
        'student_id': student.id,
        'evaluation_week': evaluation_week,
        'visibility_status': pub.visibility_status,
        'published_at': pub.published_at.isoformat(),
        'message': f"Student evaluation profile for {evaluation_week} has been {visibility}."
    })


# ==============================================================================
# 8. SAFEGUARDING REFERRAL WORKFLOW (Section 13)
# ==============================================================================

@api_view(['POST'])
def create_safeguarding_referral(request):
    """POST /api/v1/psychological-evaluations/safeguarding/refer/
    Create an immediate confidential safeguarding escalation to school leads.
    Payload: student_id, evaluation_id (optional), concern_description, urgency_level
    """
    user = request.user
    if not user.is_authenticated or user.role not in ('teacher', 'principal', 'school_admin', 'organisation_admin') and not user.is_superuser:
        raise PermissionDenied("Staff credentials required.")

    student_id = request.data.get('student_id')
    evaluation_id = request.data.get('evaluation_id')
    concern_description = request.data.get('concern_description', '').strip()
    urgency_level = request.data.get('urgency_level', 'standard')

    if not student_id or not concern_description:
        raise ValidationError("student_id and concern_description are required.")

    try:
        student = Student.objects.select_related('school').get(id=student_id)
    except Student.DoesNotExist:
        raise NotFound("Student not found.")

    evaluation = None
    if evaluation_id:
        evaluation = WeeklyEvaluation.objects.filter(id=evaluation_id).first()

    referral = EvaluationSafeguardingReferral.objects.create(
        student=student,
        evaluation=evaluation,
        referred_by=user,
        school=student.school,
        concern_description=concern_description,
        urgency_level=urgency_level,
        status='submitted',
    )

    log_audit(
        actor=user,
        action='safeguarding_referral',
        record_type='EvaluationSafeguardingReferral',
        record_id=referral.id,
        metadata={'student_id': student.id, 'urgency_level': urgency_level}
    )

    return Response({
        'ok': True,
        'referral_id': referral.id,
        'urgency_level': referral.urgency_level,
        'status': referral.status,
        'created_at': referral.created_at.isoformat(),
        'message': "Confidential safeguarding referral successfully submitted to designated personnel."
    })


@api_view(['GET'])
def list_safeguarding_referrals(request):
    """GET /api/v1/psychological-evaluations/safeguarding/list/
    Restricted view for safeguarding leads, principals, and admins.
    """
    user = request.user
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    if user.role not in ('organisation_admin', 'school_admin', 'principal') and not user.is_superuser:
        raise PermissionDenied("Access restricted to designated safeguarding leads and administrators.")

    qs = EvaluationSafeguardingReferral.objects.select_related('student', 'referred_by', 'school')

    if not user.is_superuser:
        if user.role == 'organisation_admin':
            qs = qs.filter(school__organisation_id=user.organisation_id)
        else:
            qs = qs.filter(school_id=user.school_id)

    referrals = []
    for ref in qs:
        referrals.append({
            'id': ref.id,
            'student_id': ref.student_id,
            'student_name': ref.student.full_name,
            'admission_number': ref.student.admission_number,
            'referred_by_name': ref.referred_by.get_full_name() or ref.referred_by.username,
            'school_name': ref.school.name,
            'concern_description': ref.concern_description,
            'urgency_level': ref.urgency_level,
            'status': ref.status,
            'designated_lead_notes': ref.designated_lead_notes,
            'created_at': ref.created_at.isoformat(),
        })

    return Response({'referrals': referrals})


# ==============================================================================
# 9. GENDER-BASED ANALYTICS (Section 10)
# ==============================================================================

@api_view(['GET'])
def gender_analytics_view(request):
    """GET /api/v1/psychological-evaluations/gender-analytics/
    Dedicated gender aggregate statistics endpoint.
    Filters: school_id, class_id, week.
    """
    user = request.user
    if not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    school_id = request.query_params.get('school_id')
    class_id = request.query_params.get('class_id')
    week = request.query_params.get('week') or get_current_school_week()

    if user.is_superuser:
        schools_qs = School.objects.all()
    elif user.role == 'organisation_admin':
        schools_qs = School.objects.filter(organisation_id=user.organisation_id)
    else:
        schools_qs = School.objects.filter(id=user.school_id)

    if school_id:
        check_school_access(user, school_id)
        schools_qs = schools_qs.filter(id=school_id)

    from core.services.psychological_evaluation import calculate_gender_aggregates
    gender_data = calculate_gender_aggregates(schools_qs, evaluation_week=week, class_id=class_id)

    return Response({
        'evaluation_week': week,
        'gender_analytics': gender_data,
        'disclaimer': "Gender-based aggregate statistics for equity and developmental research. Individual identities are never exposed.",
    })


# ==============================================================================
# 10. AUDIT LOGS (Section 13)
# ==============================================================================

@api_view(['GET'])
def evaluation_audit_logs_view(request):
    """GET /api/v1/psychological-evaluations/audit-logs/
    Admin audit logs for psychological evaluation activities.
    """
    user = request.user
    if not user.is_authenticated or (user.role not in ('organisation_admin', 'school_admin', 'principal') and not user.is_superuser):
        raise PermissionDenied("Administrator credentials required.")

    logs_qs = EvaluationAuditLog.objects.select_related('actor').order_by('-timestamp')[:100]

    logs = []
    for log in logs_qs:
        logs.append({
            'id': log.id,
            'actor_name': log.actor.get_full_name() or log.actor.username if log.actor else 'System',
            'actor_role': log.actor.role if log.actor else 'System',
            'action': log.action,
            'record_type': log.record_type,
            'record_id': log.record_id,
            'timestamp': log.timestamp.isoformat(),
            'metadata': log.relevant_metadata,
        })

    return Response({'audit_logs': logs})


# ==============================================================================
# 11. UNIVERSAL CSV EXPORT (Section 13)
# ==============================================================================

@api_view(['GET'])
def export_evaluations_csv(request):
    """GET /api/v1/psychological-evaluations/export/
    Export evaluations as CSV with strict permission enforcement.
    """
    user = request.user
    if not user.is_authenticated or (user.role not in ('organisation_admin', 'school_admin', 'principal', 'teacher') and not user.is_superuser):
        raise PermissionDenied("Export permission required.")

    school_id = request.query_params.get('school_id')
    week = request.query_params.get('week') or get_current_school_week()

    if user.is_superuser:
        schools_qs = School.objects.all()
    elif user.role == 'organisation_admin':
        schools_qs = School.objects.filter(organisation_id=user.organisation_id)
    else:
        schools_qs = School.objects.filter(id=user.school_id)

    if school_id:
        check_school_access(user, school_id)
        schools_qs = schools_qs.filter(id=school_id)

    evals = WeeklyEvaluation.objects.filter(
        school__in=schools_qs,
        evaluation_week=week,
        status__in=['submitted', 'revised']
    ).select_related('student', 'teacher', 'school_class', 'subject')

    # Teacher scope filter
    if user.role == 'teacher' and not user.is_superuser:
        scope = get_teacher_scope(user)
        evals = evals.filter(school_class_id__in=scope.class_ids)

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Evaluation ID', 'Week', 'School', 'Class', 'Student ID', 'Student Name',
        'Admission Number', 'Gender', 'Teacher', 'Observation Context', 'Status',
        'Learning Engagement', 'Self-Regulation', 'Emotional Regulation',
        'Social Interaction', 'Responsibility & Independence', 'Communication & Help-Seeking',
        'Submitted At'
    ])

    for ev in evals:
        scores_map = {}
        for ds in ev.domain_scores.select_related('dimension'):
            scores_map[ds.dimension.dimension_key] = ds.normalized_score if ds.score_status == 'valid' else 'Insufficient'

        writer.writerow([
            ev.id,
            ev.evaluation_week,
            ev.school.name,
            ev.school_class.display_name,
            ev.student_id,
            ev.student.full_name,
            ev.student.admission_number,
            ev.student.gender,
            ev.teacher.get_full_name() or ev.teacher.username,
            ev.observation_context,
            ev.status,
            scores_map.get('learning_engagement', 'N/A'),
            scores_map.get('self_regulation', 'N/A'),
            scores_map.get('emotional_regulation', 'N/A'),
            scores_map.get('social_interaction', 'N/A'),
            scores_map.get('responsibility_independence', 'N/A'),
            scores_map.get('communication_help_seeking', 'N/A'),
            ev.submitted_at.isoformat() if ev.submitted_at else '',
        ])

    log_audit(user, 'export_evaluations', 'WeeklyEvaluation', week, {'school_id': school_id})

    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="psychological_evaluations_{week}.csv"'
    return response
