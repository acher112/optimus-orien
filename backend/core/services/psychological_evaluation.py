"""Central Psychological Evaluation Service for OPTIMUS ORIEN.

School-based behavioural observation and student developmental profiling.
Strictly non-clinical, non-diagnostic observational framework.

Enforces:
- 18-item 6-dimension questionnaire administration and template versioning.
- Strict scoring engine: ((avg_response - 1) / 4) * 100 with minimum 2 valid items out of 3.
- Exclusion of unobserved items (null is never converted to 0).
- Multi-teacher evaluation aggregation (minimum 2 teachers for combined multi-teacher score).
- Server-side role-based authorization across Optimus Orien hierarchy.
- Gender-based aggregate privacy compliance without inferring missing values.
- Comprehensive audit trails and confidential safeguarding referral workflows.
"""
from datetime import date
from decimal import Decimal
from django.db import transaction
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from core.models import (
    AcademicYear, ClassTeacherAssignment, Enrollment, Organisation,
    School, SchoolClass, Section, Student, Subject, TeachingAssignment, User,
    EvaluationTemplate, EvaluationDimension, EvaluationQuestion,
    WeeklyEvaluation, EvaluationResponse, EvaluationDomainScore,
    EvaluationPublication, EvaluationAuditLog, EvaluationSafeguardingReferral
)
from core.services.teacher_scope import get_teacher_scope


# Standard Questionnaire Definition (Section 3 of specification)
TEMPLATE_VERSION = '1.0'
TEMPLATE_NAME = '18-Item Student Behavioural & Developmental Framework'
VALIDATION_STATUS = 'Developmental observation framework — validation in progress.'
ADMINISTRATION_INSTRUCTIONS = (
    "Evaluate the student's observable behaviour during the previous five school days. "
    "Base your responses on actual interactions and classroom observations. "
    "Do not make assumptions about the student's personality, family circumstances, "
    "mental health, or behaviour outside the setting you observed."
)
PROFILE_DISCLAIMER = (
    "Based on teacher observations during the selected period. "
    "This profile reflects observed behaviours, not a psychological diagnosis or fixed personality assessment."
)

DIMENSIONS_SPEC = [
    {
        'key': 'learning_engagement',
        'name': 'Learning Engagement',
        'description': 'Observes classroom participation, curiosity, and persistence when challenged.',
        'order': 1,
        'questions': [
            (1, 'Participates in classroom learning activities.'),
            (2, 'Shows interest or curiosity when introduced to new topics.'),
            (3, 'Makes an effort to continue working when a learning task becomes challenging.'),
        ]
    },
    {
        'key': 'self_regulation',
        'name': 'Self-Regulation',
        'description': 'Observes sustained attention, adherence to routines, and impulse management.',
        'order': 2,
        'questions': [
            (4, 'Maintains attention during appropriate learning activities.'),
            (5, 'Follows classroom instructions and agreed routines.'),
            (6, 'Manages impulses in a way that supports learning and classroom activities.'),
        ]
    },
    {
        'key': 'emotional_regulation',
        'name': 'Emotional Regulation',
        'description': 'Observes constructive responses to setbacks, feeling communication, and refocusing.',
        'order': 3,
        'questions': [
            (7, 'Responds constructively when facing mistakes or setbacks.'),
            (8, 'Communicates feelings in an appropriate and understandable way.'),
            (9, 'Uses appropriate strategies to regain focus after becoming upset or frustrated.'),
        ]
    },
    {
        'key': 'social_interaction',
        'name': 'Social Interaction',
        'description': 'Observes respect, teamwork, and consideration for others.',
        'order': 4,
        'questions': [
            (10, 'Treats classmates and teachers with respect.'),
            (11, 'Cooperates with others during group activities.'),
            (12, 'Demonstrates consideration for other people\'s feelings and perspectives.'),
        ]
    },
    {
        'key': 'responsibility_independence',
        'name': 'Responsibility & Independence',
        'description': 'Observes task ownership, timely completion, and resource care.',
        'order': 5,
        'questions': [
            (13, 'Takes responsibility for assigned tasks.'),
            (14, 'Makes an effort to complete work within reasonable timeframes.'),
            (15, 'Takes care of personal learning materials and shared classroom resources.'),
        ]
    },
    {
        'key': 'communication_help_seeking',
        'name': 'Communication & Help-Seeking',
        'description': 'Observes idea expression, appropriate help-seeking, and receptiveness to feedback.',
        'order': 6,
        'questions': [
            (16, 'Expresses ideas, questions, or needs clearly.'),
            (17, 'Seeks assistance when experiencing difficulty with a task.'),
            (18, 'Listens to feedback and makes an effort to respond constructively.'),
        ]
    },
]


def ensure_default_template():
    """Ensure standard Template v1.0 and its 18 questions exist."""
    template, _ = EvaluationTemplate.objects.get_or_create(
        version=TEMPLATE_VERSION,
        defaults={
            'name': TEMPLATE_NAME,
            'status': 'active',
            'effective_from': date(2026, 1, 1),
            'validation_status': VALIDATION_STATUS,
            'instructions': ADMINISTRATION_INSTRUCTIONS,
            'disclaimer': PROFILE_DISCLAIMER,
        }
    )

    for dim_data in DIMENSIONS_SPEC:
        dim, _ = EvaluationDimension.objects.get_or_create(
            template=template,
            dimension_key=dim_data['key'],
            defaults={
                'dimension_name': dim_data['name'],
                'description': dim_data['description'],
                'display_order': dim_data['order'],
            }
        )
        for q_order, q_text in dim_data['questions']:
            EvaluationQuestion.objects.get_or_create(
                dimension=dim,
                display_order=q_order,
                defaults={
                    'question_text': q_text,
                    'active': True,
                }
            )
    return template


def get_current_school_week():
    """Return current ISO evaluation week, e.g. '2026-W44'."""
    today = timezone.localdate()
    iso_year, iso_week, _ = today.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


def log_audit(actor, action, record_type, record_id, metadata=None):
    """Record an audit trail event for sensitive psychological evaluation actions."""
    try:
        EvaluationAuditLog.objects.create(
            actor=actor if (actor and actor.is_authenticated) else None,
            action=action,
            record_type=record_type,
            record_id=str(record_id),
            relevant_metadata=metadata or {}
        )
    except Exception:
        pass


# ==============================================================================
# AUTHORIZATION & SCOPE HELPERS (Server-Side Enforced)
# ==============================================================================

def check_school_access(user, school_id):
    """Enforce school-level hierarchy isolation."""
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied("Authentication required.")
    if user.is_superuser:
        return True
    if user.role == 'organisation_admin':
        if not user.organisation_id:
            raise PermissionDenied("Organisation context required.")
        if not School.objects.filter(id=school_id, organisation_id=user.organisation_id).exists():
            raise PermissionDenied("Access to school outside organisation is denied.")
        return True
    # Principal or School Admin or Teacher or Student:
    if user.school_id != int(school_id):
        raise PermissionDenied("Access to records of another school is denied.")
    return True


def check_student_view_permission(user, student, allow_unpublished=False):
    """Check whether the requesting user is authorized to view a student's evaluation profile."""
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied("Authentication required.")
    if user.is_superuser:
        return True

    # Organisation admin
    if user.role == 'organisation_admin':
        if student.school.organisation_id != user.organisation_id:
            raise PermissionDenied("Student outside organisation.")
        if not getattr(user.organisation, 'allow_org_admin_student_access', False):
            raise PermissionDenied("Organisation policy prohibits individual student inspection.")
        return True

    # Principal / School Admin
    if user.role in ('principal', 'school_admin'):
        if student.school_id != user.school_id:
            raise PermissionDenied("Principal cannot access students from other schools.")
        return True

    # Teacher
    if user.role == 'teacher':
        if student.school_id != user.school_id:
            raise PermissionDenied("Teacher cannot access students from other schools.")
        scope = get_teacher_scope(user)
        # Check active enrollment in teacher's assigned classes
        today = timezone.localdate()
        enrolled_class_ids = set(Enrollment.objects.filter(
            student=student,
            start_date__lte=today
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).values_list('school_class_id', flat=True))

        if not (enrolled_class_ids & scope.class_ids):
            raise PermissionDenied("Teachers may only view records for students in their assigned classes or subjects.")
        return True

    # Student
    if user.role == 'student':
        student_record = getattr(user, 'student_record', None)
        if not student_record or student_record.id != student.id:
            raise PermissionDenied("Students may view only their own evaluation records.")
        return True

    # Parent
    if user.role == 'parent':
        if not student.guardians.filter(id=user.id).exists():
            raise PermissionDenied("Parents may view only their assigned ward's records.")
        return True

    raise PermissionDenied("Access not authorized.")


def check_teacher_evaluate_permission(user, student, school_class, subject=None):
    """Verify that a teacher has active assignment to evaluate this student."""
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied("Authentication required.")
    if user.is_superuser:
        return True
    if user.role != 'teacher':
        raise PermissionDenied("Only assigned teachers can submit student evaluations.")
    if user.school_id != student.school_id or user.school_id != school_class.school_id:
        raise PermissionDenied("Teacher and student must belong to the same school.")

    scope = get_teacher_scope(user)
    today = timezone.localdate()

    # Check that student is actively enrolled in this class
    is_enrolled = Enrollment.objects.filter(
        student=student,
        school_class=school_class,
        start_date__lte=today
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).exists()

    if not is_enrolled:
        raise PermissionDenied(f"Student {student.full_name} is not actively enrolled in class {school_class.display_name}.")

    if subject:
        # Subject teacher assignment check
        if not scope.teaches_subject(school_class.id, subject.id):
            raise PermissionDenied(f"You are not assigned to teach subject {subject.name} to class {school_class.display_name}.")
    else:
        # Class teacher assignment check
        if not scope.is_class_teacher(school_class.id):
            raise PermissionDenied(f"You are not the assigned Class Teacher for {school_class.display_name}.")

    return True


# ==============================================================================
# SCORING ENGINE (Section 5 of specification)
# ==============================================================================

def calculate_evaluation_scores(evaluation):
    """Compute normalized 0-100 domain scores for a WeeklyEvaluation.
    
    Formula:
      Domain Score = ((Average Response - 1) / 4) * 100
    
    Rules:
      - Valid responses: 1 to 5.
      - Unobserved / null is excluded, NEVER treated as 0.
      - Minimum 2 valid responses out of 3 required per domain.
      - If fewer than 2 valid responses: normalized_score = None, status = 'insufficient'.
      - No overall psychological score calculated.
      - Preserves individual item responses.
    """
    template = EvaluationTemplate.objects.filter(version=evaluation.template_version).first()
    if not template:
        template = ensure_default_template()

    dimensions = list(template.dimensions.all().order_by('display_order'))
    responses = {r.question_id: r.response_value for r in evaluation.responses.all()}

    calculated_scores = []
    for dim in dimensions:
        questions = list(dim.questions.filter(active=True).order_by('display_order'))
        valid_vals = []
        for q in questions:
            val = responses.get(q.id)
            if val is not None and 1 <= val <= 5:
                valid_vals.append(val)

        valid_count = len(valid_vals)
        if valid_count >= 2:
            avg_resp = float(sum(valid_vals)) / float(valid_count)
            # Normalized 0-100 score without intermediate rounding
            norm_score = ((avg_resp - 1.0) / 4.0) * 100.0
            score_status = 'valid'
        else:
            avg_resp = None
            norm_score = None
            score_status = 'insufficient'

        domain_score_obj, _ = EvaluationDomainScore.objects.update_or_create(
            evaluation=evaluation,
            dimension=dim,
            defaults={
                'valid_response_count': valid_count,
                'average_response': avg_resp,
                'normalized_score': norm_score,
                'score_status': score_status,
            }
        )
        calculated_scores.append(domain_score_obj)

    return calculated_scores


# ==============================================================================
# MULTI-TEACHER COMBINED PROFILE & HISTORICAL TRACKING (Sections 6, 7, 8)
# ==============================================================================

def get_student_combined_profile(student, evaluation_week=None):
    """Compute the combined developmental profile across eligible teacher evaluations.
    
    Rules:
      - Requires at least 2 valid teacher evaluations for a 'Combined multi-teacher observation'.
      - If only 1 valid evaluation: label as 'Single-teacher observation'.
      - If 0 valid: 'Insufficient observations'.
      - Preserves individual teacher evaluations.
    """
    template = ensure_default_template()
    if not evaluation_week:
        # Pick latest available week with evaluations
        latest_eval = WeeklyEvaluation.objects.filter(
            student=student,
            status__in=['submitted', 'revised']
        ).order_by('-evaluation_week').first()
        evaluation_week = latest_eval.evaluation_week if latest_eval else get_current_school_week()

    # Query all submitted/revised evaluations for student in this week
    evals = WeeklyEvaluation.objects.filter(
        student=student,
        evaluation_week=evaluation_week,
        status__in=['submitted', 'revised']
    ).select_related('teacher', 'school_class', 'subject')

    total_teachers = evals.count()
    dimensions = list(template.dimensions.all().order_by('display_order'))

    radar_axes = []
    dimension_summaries = {}

    for dim in dimensions:
        # Collect valid scores from all evaluations for this dimension
        domain_scores = EvaluationDomainScore.objects.filter(
            evaluation__in=evals,
            dimension=dim,
            score_status='valid',
            normalized_score__isnull=False
        )
        valid_scores = [ds.normalized_score for ds in domain_scores]
        contributing_teachers = len(valid_scores)

        if contributing_teachers >= 2:
            combined_score = round(sum(valid_scores) / contributing_teachers, 1)
            status = 'combined'
            status_label = f"Combined ({contributing_teachers} teachers)"
        elif contributing_teachers == 1:
            combined_score = round(valid_scores[0], 1)
            status = 'single'
            status_label = "Single-teacher observation"
        else:
            combined_score = None
            status = 'insufficient'
            status_label = "Insufficient observations"

        radar_axes.append({
            'dimension_key': dim.dimension_key,
            'dimension_name': dim.dimension_name,
            'score': combined_score,
            'status': status,
            'status_label': status_label,
            'contributing_teachers': contributing_teachers,
            'display_order': dim.display_order,
        })

        dimension_summaries[dim.dimension_key] = {
            'dimension_name': dim.dimension_name,
            'score': combined_score,
            'status': status,
            'status_label': status_label,
            'contributing_teachers': contributing_teachers,
        }

    # Teacher observations details
    teacher_observations = []
    for ev in evals:
        # Individual scores
        scores = {}
        for ds in ev.domain_scores.select_related('dimension'):
            scores[ds.dimension.dimension_key] = {
                'name': ds.dimension.dimension_name,
                'score': round(ds.normalized_score, 1) if ds.normalized_score is not None else None,
                'status': ds.score_status,
                'valid_count': ds.valid_response_count,
            }

        teacher_observations.append({
            'evaluation_id': ev.id,
            'teacher_id': ev.teacher_id,
            'teacher_name': ev.teacher.get_full_name() or ev.teacher.username,
            'observation_context': ev.observation_context,
            'subject_name': ev.subject.name if ev.subject else 'General Classroom',
            'status': ev.status,
            'submitted_at': ev.submitted_at.isoformat() if ev.submitted_at else None,
            'strengths_observed': ev.strengths_observed,
            'support_areas': ev.support_areas,
            'support_action': ev.support_action,
            'student_visible_feedback': ev.student_visible_feedback,
            # Confidential internal note: only included if caller explicitly allows
            'teacher_notes': ev.teacher_notes,
            'scores': scores,
        })

    # Publication check
    pub = EvaluationPublication.objects.filter(student=student, evaluation_week=evaluation_week).first()
    is_published = bool(pub and pub.visibility_status == 'published')

    return {
        'student_id': student.id,
        'student_name': student.full_name,
        'admission_number': student.admission_number,
        'gender': student.gender,
        'school_id': student.school_id,
        'school_name': student.school.name,
        'evaluation_week': evaluation_week,
        'total_contributing_evaluations': total_teachers,
        'is_published': is_published,
        'published_at': pub.published_at.isoformat() if (pub and pub.published_at) else None,
        'template_version': template.version,
        'validation_status': template.validation_status,
        'disclaimer': PROFILE_DISCLAIMER,
        'radar_axes': radar_axes,
        'dimensions': dimension_summaries,
        'teacher_observations': teacher_observations,
    }


def get_student_history_timeline(student, current_week=None, limit_weeks=12):
    """Weekly timeline tracking changes in observed scores with neutral phrasing."""
    template = ensure_default_template()
    dimensions = list(template.dimensions.all().order_by('display_order'))

    # Find distinct submitted evaluation weeks for this student
    weeks_qs = WeeklyEvaluation.objects.filter(
        student=student,
        status__in=['submitted', 'revised']
    ).values_list('evaluation_week', flat=True).distinct().order_by('-evaluation_week')[:limit_weeks]

    distinct_weeks = sorted(list(weeks_qs))
    if not distinct_weeks and current_week:
        distinct_weeks = [current_week]

    history_points = []
    for wk in distinct_weeks:
        wk_profile = get_student_combined_profile(student, evaluation_week=wk)
        point = {
            'evaluation_week': wk,
            'is_published': wk_profile['is_published'],
            'total_teachers': wk_profile['total_contributing_evaluations'],
        }
        for axis in wk_profile['radar_axes']:
            point[axis['dimension_key']] = axis['score']
            point[f"{axis['dimension_key']}_status"] = axis['status']
        history_points.append(point)

    # Compute neutral trajectory descriptions (e.g. comparing last 2 available weeks)
    trajectory_analysis = []
    if len(history_points) >= 2:
        prev_point = history_points[-2]
        curr_point = history_points[-1]
        for dim in dimensions:
            prev_s = prev_point.get(dim.dimension_key)
            curr_s = curr_point.get(dim.dimension_key)
            if prev_s is not None and curr_s is not None:
                delta = round(curr_s - prev_s, 1)
                if delta >= 3.0:
                    description = "Observed score increased"
                    trend = "increased"
                elif delta <= -3.0:
                    description = "Observed score decreased"
                    trend = "decreased"
                else:
                    description = "Relatively stable observed pattern"
                    trend = "stable"
            else:
                delta = None
                description = "Insufficient comparison data"
                trend = "insufficient"

            trajectory_analysis.append({
                'dimension_key': dim.dimension_key,
                'dimension_name': dim.dimension_name,
                'previous_score': prev_s,
                'current_score': curr_s,
                'delta': delta,
                'trend': trend,
                'description': description,
            })

    return {
        'student_id': student.id,
        'student_name': student.full_name,
        'timeline': history_points,
        'trajectory': trajectory_analysis,
        'available_weeks': distinct_weeks,
    }


# ==============================================================================
# HIERARCHICAL OVERVIEW (LEVELS 1, 2, 3) & GENDER ANALYTICS (Sections 9, 10)
# ==============================================================================

def get_hierarchical_dashboard(user, school_id=None, class_id=None, evaluation_week=None, gender_filter=None):
    """Compile Level 1 & Level 2 hierarchical dashboards with strict privacy and scope."""
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied("Authentication required.")

    if not evaluation_week:
        evaluation_week = get_current_school_week()

    # Determine schools in scope
    if user.is_superuser:
        schools_qs = School.objects.all()
    elif user.role == 'organisation_admin':
        schools_qs = School.objects.filter(organisation_id=user.organisation_id)
    elif user.role in ('principal', 'school_admin', 'teacher'):
        schools_qs = School.objects.filter(id=user.school_id)
    else:
        raise PermissionDenied("Role not permitted to view institutional overview.")

    if school_id:
        check_school_access(user, school_id)
        schools_qs = schools_qs.filter(id=school_id)

    # Base active students
    students_qs = Student.objects.filter(school__in=schools_qs, active=True)
    if class_id:
        today = timezone.localdate()
        students_qs = students_qs.filter(
            enrollments__school_class_id=class_id,
            enrollments__start_date__lte=today
        ).filter(Q(enrollments__end_date__isnull=True) | Q(enrollments__end_date__gte=today))

    if gender_filter and gender_filter in ('male', 'female', 'other', 'not_recorded'):
        students_qs = students_qs.filter(gender=gender_filter)

    total_students = students_qs.count()

    # Evaluations in scope for the requested week
    evals_qs = WeeklyEvaluation.objects.filter(
        school__in=schools_qs,
        evaluation_week=evaluation_week
    )
    if class_id:
        evals_qs = evals_qs.filter(school_class_id=class_id)

    submitted_evals_qs = evals_qs.filter(status__in=['submitted', 'revised'])
    evaluated_student_ids = set(submitted_evals_qs.values_list('student_id', flat=True))
    students_evaluated_count = len(evaluated_student_ids & set(students_qs.values_list('id', flat=True)))

    completion_rate = round((students_evaluated_count / total_students * 100.0), 1) if total_students > 0 else 0.0
    insufficient_observations_count = max(0, total_students - students_evaluated_count)

    # Campus comparison summary (Level 1)
    campus_comparisons = []
    for sc in schools_qs:
        sc_students = students_qs.filter(school=sc).count()
        sc_evals = submitted_evals_qs.filter(school=sc)
        sc_evaluated_ids = set(sc_evals.values_list('student_id', flat=True))
        sc_eval_count = len(sc_evaluated_ids)
        sc_comp_rate = round((sc_eval_count / sc_students * 100.0), 1) if sc_students > 0 else 0.0
        campus_comparisons.append({
            'school_id': sc.id,
            'school_name': sc.name,
            'city': sc.city,
            'total_students': sc_students,
            'evaluated_students': sc_eval_count,
            'completion_rate': sc_comp_rate,
            'insufficient_count': max(0, sc_students - sc_eval_count),
        })

    # Class breakdown summary (Level 2)
    classes_summary = []
    classes_qs = SchoolClass.objects.filter(school__in=schools_qs)
    if class_id:
        classes_qs = classes_qs.filter(id=class_id)

    today = timezone.localdate()
    for cls in classes_qs:
        cls_student_ids = set(Enrollment.objects.filter(
            school_class=cls,
            start_date__lte=today
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).values_list('student_id', flat=True))
        cls_total = len(cls_student_ids)
        cls_eval_student_ids = set(submitted_evals_qs.filter(school_class=cls).values_list('student_id', flat=True))
        cls_eval_count = len(cls_student_ids & cls_eval_student_ids)
        cls_rate = round((cls_eval_count / cls_total * 100.0), 1) if cls_total > 0 else 0.0

        # Class domain averages
        cls_domain_scores = EvaluationDomainScore.objects.filter(
            evaluation__school_class=cls,
            evaluation__evaluation_week=evaluation_week,
            evaluation__status__in=['submitted', 'revised'],
            score_status='valid',
            normalized_score__isnull=False
        ).values('dimension__dimension_key').annotate(avg_score=Avg('normalized_score'))

        dim_avgs = {item['dimension__dimension_key']: round(item['avg_score'], 1) for item in cls_domain_scores}

        classes_summary.append({
            'class_id': cls.id,
            'class_name': cls.display_name,
            'grade_level': cls.grade_level,
            'school_id': cls.school_id,
            'school_name': cls.school.name,
            'teacher_name': cls.teacher.get_full_name() if cls.teacher else 'Unassigned',
            'total_students': cls_total,
            'evaluated_students': cls_eval_count,
            'completion_rate': cls_rate,
            'domain_averages': dim_avgs,
        })

    # Gender-Based Aggregate Analytics (Section 10 of specification)
    # Strictly respect recorded gender, never infer, sample size >= 2, N/A when insufficient data
    gender_analytics = calculate_gender_aggregates(schools_qs, evaluation_week=evaluation_week, class_id=class_id)

    # Recent evaluation trends (last 6 weeks)
    recent_weeks_trend = []
    cur_year, cur_wk_num, _ = timezone.localdate().isocalendar()
    for offset in range(5, -1, -1):
        target_wk_num = max(1, cur_wk_num - offset)
        wk_str = f"{cur_year}-W{target_wk_num:02d}"
        wk_evals = WeeklyEvaluation.objects.filter(
            school__in=schools_qs,
            evaluation_week=wk_str,
            status__in=['submitted', 'revised']
        )
        if class_id:
            wk_evals = wk_evals.filter(school_class_id=class_id)
        wk_count = wk_evals.values('student_id').distinct().count()
        recent_weeks_trend.append({
            'week': wk_str,
            'evaluated_count': wk_count,
        })

    return {
        'evaluation_week': evaluation_week,
        'total_students': total_students,
        'evaluated_students_count': students_evaluated_count,
        'completion_rate': completion_rate,
        'insufficient_observations_count': insufficient_observations_count,
        'validation_status': VALIDATION_STATUS,
        'disclaimer': PROFILE_DISCLAIMER,
        'campus_comparisons': campus_comparisons,
        'classes_summary': classes_summary,
        'gender_analytics': gender_analytics,
        'recent_trends': recent_weeks_trend,
    }


def calculate_gender_aggregates(schools_qs, evaluation_week, class_id=None):
    """Aggregate statistics strictly by recorded gender.
    
    Rules:
      - Uses student's existing recorded gender field.
      - Never infers gender.
      - Unknown / not_recorded kept separate.
      - Sample size n < 2 -> N/A (insufficient data).
      - No individual student data leaked.
    """
    genders = ['male', 'female', 'other', 'not_recorded']
    result = {}

    template = ensure_default_template()
    dimensions = list(template.dimensions.all().order_by('display_order'))

    for g in genders:
        students = Student.objects.filter(school__in=schools_qs, gender=g, active=True)
        if class_id:
            today = timezone.localdate()
            students = students.filter(
                enrollments__school_class_id=class_id,
                enrollments__start_date__lte=today
            ).filter(Q(enrollments__end_date__isnull=True) | Q(enrollments__end_date__gte=today))

        total_in_group = students.count()
        evals = WeeklyEvaluation.objects.filter(
            student__in=students,
            evaluation_week=evaluation_week,
            status__in=['submitted', 'revised']
        )
        evaluated_in_group = evals.values('student_id').distinct().count()

        domain_avgs = {}
        for dim in dimensions:
            scores_qs = EvaluationDomainScore.objects.filter(
                evaluation__in=evals,
                dimension=dim,
                score_status='valid',
                normalized_score__isnull=False
            )
            sample_size = scores_qs.count()
            if sample_size >= 2:
                avg_val = scores_qs.aggregate(Avg('normalized_score'))['normalized_score__avg']
                domain_avgs[dim.dimension_key] = {
                    'dimension_name': dim.dimension_name,
                    'average_score': round(avg_val, 1) if avg_val is not None else 'N/A',
                    'sample_size': sample_size,
                    'status': 'sufficient',
                }
            else:
                domain_avgs[dim.dimension_key] = {
                    'dimension_name': dim.dimension_name,
                    'average_score': 'N/A',
                    'sample_size': sample_size,
                    'status': 'insufficient',
                }

        result[g] = {
            'gender_label': dict(Student.GENDER).get(g, g.capitalize()),
            'total_students': total_in_group,
            'evaluated_students': evaluated_in_group,
            'has_sufficient_data': evaluated_in_group >= 2,
            'domain_averages': domain_avgs,
        }

    return result


def get_class_evaluation_summary(user, class_id, evaluation_week=None):
    """Level 3 Class Overview: student list, completion status, and teacher coverage."""
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied("Authentication required.")

    try:
        school_class = SchoolClass.objects.select_related('school').get(id=class_id)
    except SchoolClass.DoesNotExist:
        raise NotFound("Class not found.")

    check_school_access(user, school_class.school_id)

    if not evaluation_week:
        evaluation_week = get_current_school_week()

    # Teacher scope verification
    if user.role == 'teacher' and not user.is_superuser:
        scope = get_teacher_scope(user)
        if school_class.id not in scope.class_ids:
            raise PermissionDenied("You do not teach this class.")

    today = timezone.localdate()
    enrollments = Enrollment.objects.filter(
        school_class=school_class,
        start_date__lte=today
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).select_related('student', 'section')

    students_list = []
    for enr in enrollments:
        st = enr.student
        evals = WeeklyEvaluation.objects.filter(
            student=st,
            school_class=school_class,
            evaluation_week=evaluation_week
        ).select_related('teacher', 'subject')

        class_teacher_eval = evals.filter(subject__isnull=True).first()
        subject_evals = evals.filter(subject__isnull=False)

        # Status priority: revised > submitted > draft > not_started
        if evals.filter(status='revised').exists():
            overall_status = 'Revised'
        elif evals.filter(status='submitted').exists():
            overall_status = 'Submitted'
        elif evals.filter(status='draft').exists():
            overall_status = 'Draft'
        else:
            overall_status = 'Not Started'

        # Publication status
        pub = EvaluationPublication.objects.filter(student=st, evaluation_week=evaluation_week).first()
        is_published = bool(pub and pub.visibility_status == 'published')

        # Combined profile quick check
        valid_eval_count = evals.filter(status__in=['submitted', 'revised']).count()

        students_list.append({
            'student_id': st.id,
            'full_name': st.full_name,
            'admission_number': st.admission_number,
            'gender': st.gender,
            'section': enr.section.name if enr.section else '',
            'status': overall_status,
            'has_class_teacher_eval': bool(class_teacher_eval and class_teacher_eval.status in ['submitted', 'revised']),
            'subject_eval_count': subject_evals.filter(status__in=['submitted', 'revised']).count(),
            'total_evaluations': valid_eval_count,
            'is_published': is_published,
        })

    # Class-level domain averages
    cls_domain_scores = EvaluationDomainScore.objects.filter(
        evaluation__school_class=school_class,
        evaluation__evaluation_week=evaluation_week,
        evaluation__status__in=['submitted', 'revised'],
        score_status='valid',
        normalized_score__isnull=False
    ).values('dimension__dimension_key').annotate(avg_score=Avg('normalized_score'))

    dim_avgs = {item['dimension__dimension_key']: round(item['avg_score'], 1) for item in cls_domain_scores}

    return {
        'class_id': school_class.id,
        'class_name': school_class.display_name,
        'school_id': school_class.school_id,
        'school_name': school_class.school.name,
        'evaluation_week': evaluation_week,
        'students': students_list,
        'domain_averages': dim_avgs,
        'validation_status': VALIDATION_STATUS,
        'disclaimer': PROFILE_DISCLAIMER,
    }


# ==============================================================================
# TEACHER WORKSPACE & EVALUATION SUBMISSION (Section 12 of specification)
# ==============================================================================

def get_teacher_evaluation_workspace(user, selected_class_id=None, selected_subject_id=None, evaluation_week=None):
    """Teacher weekly evaluation workspace with class/subject filters and student progress."""
    if not user.is_authenticated or user.role != 'teacher' and not user.is_superuser:
        raise PermissionDenied("Teacher credentials required.")

    if not evaluation_week:
        evaluation_week = get_current_school_week()

    scope = get_teacher_scope(user)

    assigned_classes = []
    for cls in SchoolClass.objects.filter(id__in=scope.class_ids).select_related('school'):
        assigned_classes.append({
            'id': cls.id,
            'name': cls.display_name,
            'is_class_teacher': scope.is_class_teacher(cls.id),
        })

    # Default to first assigned class if none provided
    if not selected_class_id and assigned_classes:
        selected_class_id = assigned_classes[0]['id']

    selected_class = None
    assigned_subjects = []
    students = []

    if selected_class_id:
        try:
            selected_class = SchoolClass.objects.get(id=selected_class_id)
        except SchoolClass.DoesNotExist:
            raise NotFound("Class not found.")

        if selected_class.id not in scope.class_ids and not user.is_superuser:
            raise PermissionDenied("You do not teach this class.")

        # Subjects taught by this teacher in this class
        taught_subject_ids = {pair[1] for pair in scope.subject_pairs if pair[0] == selected_class.id}
        for sub in Subject.objects.filter(id__in=taught_subject_ids):
            assigned_subjects.append({
                'id': sub.id,
                'name': sub.name,
                'code': sub.code,
            })

        is_ct = scope.is_class_teacher(selected_class.id)

        # Active students in this class
        today = timezone.localdate()
        enrollments = Enrollment.objects.filter(
            school_class=selected_class,
            start_date__lte=today
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).select_related('student', 'section')

        context_label = f"Subject: {Subject.objects.get(id=selected_subject_id).name}" if selected_subject_id else "Homeroom / Classroom Observation"

        for enr in enrollments:
            st = enr.student
            # Teacher's own evaluation for this student in this context
            ev = WeeklyEvaluation.objects.filter(
                teacher=user,
                student=st,
                school_class=selected_class,
                subject_id=selected_subject_id,
                evaluation_week=evaluation_week
            ).first()

            students.append({
                'student_id': st.id,
                'full_name': st.full_name,
                'admission_number': st.admission_number,
                'gender': st.gender,
                'section': enr.section.name if enr.section else '',
                'evaluation_id': ev.id if ev else None,
                'status': ev.status if ev else 'not_started',
                'submitted_at': ev.submitted_at.isoformat() if (ev and ev.submitted_at) else None,
            })

    return {
        'evaluation_week': evaluation_week,
        'assigned_classes': assigned_classes,
        'selected_class_id': selected_class_id,
        'selected_subject_id': selected_subject_id,
        'assigned_subjects': assigned_subjects,
        'is_class_teacher': scope.is_class_teacher(selected_class_id) if selected_class_id else False,
        'students': students,
        'instructions': ADMINISTRATION_INSTRUCTIONS,
        'validation_status': VALIDATION_STATUS,
    }


@transaction.atomic
def save_evaluation(user, data):
    """Draft, submit, or revise a teacher's weekly evaluation.
    
    Accepts:
      student_id, class_id, subject_id (optional), evaluation_week, status ('draft' | 'submitted')
      responses: dict mapping question_id -> value (1-5 or null)
      strengths_observed, support_areas, support_action, teacher_notes, student_visible_feedback
    """
    student_id = data.get('student_id')
    class_id = data.get('class_id')
    subject_id = data.get('subject_id')
    evaluation_week = data.get('evaluation_week') or get_current_school_week()
    new_status = data.get('status', 'draft')

    if new_status not in ('draft', 'submitted'):
        raise ValidationError("Status must be either 'draft' or 'submitted'.")

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

    # Server-side evaluation authorization
    check_teacher_evaluate_permission(user, student, school_class, subject)

    observation_context = f"Subject: {subject.name}" if subject else "Homeroom / Classroom Observation"

    # Find existing evaluation
    evaluation = WeeklyEvaluation.objects.filter(
        teacher=user,
        student=student,
        evaluation_week=evaluation_week,
        observation_context=observation_context
    ).first()

    action_label = 'submit' if new_status == 'submitted' else 'draft'

    if evaluation:
        # Check immutability of submitted evaluations without revision workflow
        if evaluation.status in ('submitted', 'revised') and not data.get('is_revision'):
            raise ValidationError("Submitted evaluations are immutable. Use the authorized revision workflow to amend.")
        if evaluation.status in ('submitted', 'revised') and data.get('is_revision'):
            new_status = 'revised'
            action_label = 'revise'
    else:
        evaluation = WeeklyEvaluation(
            teacher=user,
            student=student,
            school=student.school,
            campus=student.school,
            school_class=school_class,
            section=Enrollment.objects.filter(student=student, school_class=school_class).values_list('section', flat=True).first(),
            subject=subject,
            observation_context=observation_context,
            evaluation_week=evaluation_week,
            template_version=TEMPLATE_VERSION,
        )

    evaluation.status = new_status
    if new_status in ('submitted', 'revised'):
        evaluation.submitted_at = timezone.now()

    # Reflection fields
    if 'strengths_observed' in data:
        evaluation.strengths_observed = str(data['strengths_observed']).strip()
    if 'support_areas' in data:
        evaluation.support_areas = str(data['support_areas']).strip()
    if 'support_action' in data:
        evaluation.support_action = str(data['support_action']).strip()
    if 'teacher_notes' in data:
        evaluation.teacher_notes = str(data['teacher_notes']).strip()
    if 'student_visible_feedback' in data:
        evaluation.student_visible_feedback = str(data['student_visible_feedback']).strip()

    evaluation.save()

    # Save item responses
    responses_dict = data.get('responses', {})
    template = ensure_default_template()

    for q in EvaluationQuestion.objects.filter(dimension__template=template):
        val = responses_dict.get(str(q.id), responses_dict.get(q.id, responses_dict.get(q.display_order, responses_dict.get(str(q.display_order)))))
        # Ensure 1-5 or null (unobserved). Stored as null, never treated as zero.
        clean_val = None
        if val is not None and str(val).strip() != '' and str(val).strip() != '0':
            try:
                parsed = int(val)
                if 1 <= parsed <= 5:
                    clean_val = parsed
            except (ValueError, TypeError):
                clean_val = None

        EvaluationResponse.objects.update_or_create(
            evaluation=evaluation,
            question=q,
            defaults={'response_value': clean_val}
        )

    # Compute domain scores automatically
    calculate_evaluation_scores(evaluation)

    # Audit logging
    log_audit(
        actor=user,
        action=action_label,
        record_type='WeeklyEvaluation',
        record_id=evaluation.id,
        metadata={
            'student_id': student.id,
            'week': evaluation_week,
            'status': new_status,
            'observation_context': observation_context,
            'is_revision': data.get('is_revision', False)
        }
    )

    return evaluation
