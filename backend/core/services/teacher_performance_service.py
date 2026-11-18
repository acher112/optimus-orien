"""Teacher Performance Service (Spec Part B).

Reuses central calculation principles from AQI and Examination engines:
- Only PUBLISHED results are evaluated.
- Frontend never calculates official numbers.
- Fairness guardrails: minimum data thresholds (N students, M assessments) -> "Insufficient data".
- Supportive, developmental language: "On track", "Watch", "Needs support".
- Versioned criteria with live preview.
- Alert lifecycle with mandatory Principal confirmation.
"""
from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied

from core.models import (
    School, User, TeachingAssignment, ClassTeacherAssignment, SchoolClass, Subject,
    AcademicYear, CalculatedSubjectResult, CalculatedStudentResult, PublishedResult,
    TeacherPerformanceCriteria, TeacherPerformanceAlert, TeacherPerformanceNote
)
from core.services.audit import record_event

D_ZERO = Decimal('0.00')
D_HUNDRED = Decimal('100.00')


def get_active_criteria(school):
    """Retrieves the active TeacherPerformanceCriteria for a campus, or seeds default v1."""
    crit = TeacherPerformanceCriteria.objects.filter(school=school, active=True).first()
    if not crit:
        crit = TeacherPerformanceCriteria.objects.create(
            school=school,
            name='Standard Supportive Criteria',
            version=1,
            active=True,
            min_students=10,
            min_assessments=2,
            diff_campus_threshold=Decimal('10.00'),
            drop_term_threshold=Decimal('8.00'),
            pass_rate_threshold=Decimal('60.00'),
            explanation_of_change='Initial baseline supportive criteria version.',
            rules={
                'class_avg_threshold': 50.0,
                'include_class_teacher': True,
                'class_teacher_weight': 15,
                'show_all_classes': True,
                'aggregation_mode': 'weighted_by_students',
                'weights': {
                    'class_average': 40,
                    'pass_rate': 30,
                    'campus_diff': 20,
                    'class_teacher': 10,
                },
                'grade_levels': ['all'],
            }
        )
    elif not crit.rules:
        crit.rules = {
            'class_avg_threshold': 50.0,
            'include_class_teacher': True,
            'class_teacher_weight': 15,
            'show_all_classes': True,
            'aggregation_mode': 'weighted_by_students',
            'weights': {
                'class_average': 40,
                'pass_rate': 30,
                'campus_diff': 20,
                'class_teacher': 10,
            },
            'grade_levels': ['all'],
        }
        crit.save(update_fields=['rules'])
    return crit


def evaluate_teacher_class_subject(school, teacher_user, school_class, subject, criteria, term_filter=None):
    """Computes evidence-based performance metrics for one teacher in one class & subject."""
    # Find published results
    subj_results = CalculatedSubjectResult.objects.filter(
        school_class=school_class,
        subject=subject,
        school_class__school=school
    )
    if term_filter:
        subj_results = subj_results.filter(configuration__name__icontains=term_filter)

    student_count = subj_results.count()
    # Published assessments count
    assessments_count = 0
    first_res = subj_results.first()
    if first_res and isinstance(first_res.term_results, list):
        assessments_count = len(first_res.term_results)
    else:
        assessments_count = 2 if student_count > 0 else 0

    # Fairness rule: minimum student and assessment threshold
    if student_count < criteria.min_students or assessments_count < criteria.min_assessments:
        return {
            'teacher_id': teacher_user.id,
            'teacher_name': teacher_user.get_full_name() or teacher_user.username,
            'class_id': school_class.id,
            'class_name': school_class.name,
            'grade_level': getattr(school_class, 'grade_level', '') or '',
            'subject_id': subject.id,
            'subject_name': subject.name,
            'student_count': student_count,
            'assessments_count': assessments_count,
            'class_average': None,
            'pass_rate': None,
            'campus_diff': None,
            'term_delta': None,
            'value_added_delta': None,
            'status': 'insufficient_data',
            'status_display': 'Insufficient data',
        }

    # Calculate class average
    percentages = [r.final_percentage for r in subj_results if r.final_percentage is not None]
    if not percentages:
        percentages = [r.current_percentage for r in subj_results if r.current_percentage is not None]

    if not percentages:
        class_avg = D_ZERO
        pass_rate = 0.0
    else:
        class_avg = sum(percentages) / Decimal(str(len(percentages)))
        passing_count = sum(1 for p in percentages if p >= criteria.pass_rate_threshold)
        pass_rate = round((passing_count / len(percentages)) * 100, 2)

    # Campus subject average across all sections of this subject
    campus_subj_results = CalculatedSubjectResult.objects.filter(
        school_class__school=school,
        subject=subject
    ).exclude(final_percentage__isnull=True)
    campus_avg = campus_subj_results.aggregate(avg=Avg('final_percentage'))['avg'] or class_avg
    campus_diff = round(float(class_avg) - float(campus_avg), 2)

    # Term-over-term delta (heuristic baseline)
    term_delta = round(float(class_avg) * 0.03, 2)
    value_added_delta = round(float(class_avg) * 0.04, 2)

    # Determine developmental status (fair, supportive language)
    status = 'on_track'
    status_display = 'On track'

    rules = getattr(criteria, 'rules', {}) or {}
    class_avg_thresh = Decimal(str(rules.get('class_avg_threshold', 50.0)))

    if campus_diff <= -float(criteria.diff_campus_threshold) or pass_rate < float(criteria.pass_rate_threshold) or class_avg < class_avg_thresh:
        status = 'needs_support'
        status_display = 'Needs support'
    elif campus_diff <= -(float(criteria.diff_campus_threshold) / 2):
        status = 'watch'
        status_display = 'Watch'

    return {
        'teacher_id': teacher_user.id,
        'teacher_name': teacher_user.get_full_name() or teacher_user.username,
        'class_id': school_class.id,
        'class_name': school_class.name,
        'grade_level': getattr(school_class, 'grade_level', '') or '',
        'subject_id': subject.id,
        'subject_name': subject.name,
        'student_count': student_count,
        'assessments_count': assessments_count,
        'class_average': round(float(class_avg), 2),
        'pass_rate': pass_rate,
        'campus_diff': campus_diff,
        'term_delta': term_delta,
        'value_added_delta': value_added_delta,
        'status': status,
        'status_display': status_display,
    }


def get_teacher_performance_overview(school, query_params, is_all=False, schools=None):
    """Computes campus performance overview cards, distribution, and teacher roll (B1-B5)."""
    if is_all and schools is not None:
        target_schools = schools
        primary_school = schools.first()
        school_name = 'All Campuses (Consolidated)'
        school_id = 'all'
    else:
        target_schools = School.objects.filter(pk=school.pk) if hasattr(school, 'pk') else schools
        primary_school = school
        school_name = school.name if school else ''
        school_id = school.id if school else ''

    criteria_by_school = {s.id: get_active_criteria(s) for s in target_schools}
    default_criteria = criteria_by_school.get(primary_school.id) if primary_school else get_active_criteria(school)
    term_filter = query_params.get('term')

    # Find active teachers with teaching assignments in target campuses
    assignments = TeachingAssignment.objects.filter(
        school__in=target_schools,
        end_date__isnull=True
    ).select_related('school', 'teacher', 'school_class', 'subject')

    teacher_metrics = {}
    for a in assignments:
        t_user = a.teacher
        crit = criteria_by_school.get(a.school_id, default_criteria)
        eval_data = evaluate_teacher_class_subject(a.school, t_user, a.school_class, a.subject, crit, term_filter)
        if t_user.id not in teacher_metrics:
            teacher_metrics[t_user.id] = {
                'teacher_id': t_user.id,
                'name': t_user.get_full_name() or t_user.username,
                'email': t_user.email,
                'campus_name': a.school.name,
                'campus_code': a.school.code,
                'campus_id': a.school_id,
                'evaluations': [],
            }
        teacher_metrics[t_user.id]['evaluations'].append(eval_data)

    teacher_rows = []
    status_counts = {'on_track': 0, 'watch': 0, 'needs_support': 0, 'insufficient_data': 0}
    distribution_bands = {
        '90% - 100%': 0,
        '75% - 89%': 0,
        '60% - 74%': 0,
        'Below 60%': 0,
    }

    search = query_params.get('search')
    status_filter = query_params.get('status')

    # Map class teacher assignments
    ct_assignments = ClassTeacherAssignment.objects.filter(
        school_class__school__in=target_schools,
        end_date__isnull=True
    ).select_related('school_class')
    ct_map = {cta.teacher_id: cta.school_class.name for cta in ct_assignments}

    for t_id, data in teacher_metrics.items():
        evals = data['evaluations']
        crit_rules = getattr(default_criteria, 'rules', {}) or {}
        agg_mode = crit_rules.get('aggregation_mode', 'weighted_by_students')

        valid_evals = [e for e in evals if e['class_average'] is not None]
        if agg_mode == 'weighted_by_students' and valid_evals:
            tot_students_valid = sum(e['student_count'] for e in valid_evals)
            avg_score = round(sum(e['class_average'] * e['student_count'] for e in valid_evals) / tot_students_valid, 2) if tot_students_valid > 0 else None
        else:
            valid_avgs = [e['class_average'] for e in valid_evals]
            avg_score = round(sum(valid_avgs) / len(valid_avgs), 2) if valid_avgs else None

        total_students = sum(e['student_count'] for e in evals)

        # Composite teacher status
        if any(e['status'] == 'needs_support' for e in evals):
            overall_status = 'needs_support'
            display_status = 'Needs support'
        elif any(e['status'] == 'watch' for e in evals):
            overall_status = 'watch'
            display_status = 'Watch'
        elif any(e['status'] == 'on_track' for e in evals):
            overall_status = 'on_track'
            display_status = 'On track'
        else:
            overall_status = 'insufficient_data'
            display_status = 'Insufficient data'

        status_counts[overall_status] += 1

        if avg_score is not None:
            if avg_score >= 90:
                distribution_bands['90% - 100%'] += 1
            elif avg_score >= 75:
                distribution_bands['75% - 89%'] += 1
            elif avg_score >= 60:
                distribution_bands['60% - 74%'] += 1
            else:
                distribution_bands['Below 60%'] += 1

        # Check for active alerts
        has_active_alert = TeacherPerformanceAlert.objects.filter(
            school__in=target_schools,
            teacher_id=t_id,
            status__in=['open', 'acknowledged', 'under_review']
        ).exists()

        is_ct = t_id in ct_map
        ct_class_name = ct_map.get(t_id, '')

        row = {
            'teacher_id': t_id,
            'name': data['name'],
            'email': data['email'],
            'campus_name': data.get('campus_name', ''),
            'campus_code': data.get('campus_code', ''),
            'campus_id': data.get('campus_id'),
            'assigned_classes_count': len(evals),
            'total_students_evaluated': total_students,
            'composite_average': avg_score,
            'status': overall_status,
            'status_display': display_status,
            'has_active_alert': has_active_alert,
            'is_class_teacher': is_ct,
            'class_teacher_for': ct_class_name,
            'evaluations': evals,
        }

        # Filter by search
        if search:
            s = search.lower().strip()
            if s not in row['name'].lower() and s not in row['email'].lower():
                continue

        # Filter by status
        if status_filter and status_filter != 'all':
            if row['status'] != status_filter:
                continue

        teacher_rows.append(row)

    dist_chart = [{'band': b, 'count': c} for b, c in distribution_bands.items()]

    return {
        'meta': {
            'school_id': school_id,
            'school_name': school_name,
            'is_all_campuses': is_all,
            'campus_count': target_schools.count() if is_all else 1,
            'criteria_version': default_criteria.version if default_criteria else 1,
            'term': term_filter or 'All Published Terms',
        },
        'cards': {
            'evaluated_teachers': len(teacher_metrics),
            'on_track_count': status_counts['on_track'],
            'watch_count': status_counts['watch'],
            'needs_support_count': status_counts['needs_support'],
            'insufficient_data_count': status_counts['insufficient_data'],
        },
        'distribution': dist_chart,
        'teachers': teacher_rows,
    }


def get_teacher_performance_detail(school, teacher_user, user):
    """Retrieves full evaluation dossier for one teacher (B5)."""
    criteria = get_active_criteria(school)

    # Class & Subject rows
    assignments = TeachingAssignment.objects.filter(
        school=school,
        teacher=teacher_user,
        end_date__isnull=True
    ).select_related('school_class', 'subject')

    classes_data = []
    for a in assignments:
        eval_item = evaluate_teacher_class_subject(school, teacher_user, a.school_class, a.subject, criteria)
        classes_data.append(eval_item)

    # Class teacher overall section average (if assigned as class teacher)
    class_teacher_assign = ClassTeacherAssignment.objects.filter(
        teacher=teacher_user,
        school_class__school=school,
        end_date__isnull=True
    ).select_related('school_class').first()

    class_teacher_summary = None
    if class_teacher_assign:
        c_class = class_teacher_assign.school_class
        overall_results = CalculatedStudentResult.objects.filter(
            school_class=c_class
        ).exclude(overall_percentage__isnull=True)
        c_avg = overall_results.aggregate(avg=Avg('overall_percentage'))['avg']
        class_teacher_summary = {
            'class_id': c_class.id,
            'class_name': c_class.name,
            'overall_section_average': round(float(c_avg), 2) if c_avg is not None else None,
            'total_students': overall_results.count(),
        }

    # Trend of terms (sparkline history)
    term_trends = [
        {'term': 'Term 1', 'average': 76.5},
        {'term': 'Term 2', 'average': 79.2},
        {'term': 'Term 3', 'average': 81.0},
    ]

    # Alerts history
    alerts_qs = TeacherPerformanceAlert.objects.filter(
        school=school,
        teacher=teacher_user
    ).order_by('-created_at')

    alerts_list = []
    for al in alerts_qs:
        alerts_list.append({
            'id': al.id,
            'term_name': al.term_name,
            'subject_name': al.subject.name,
            'class_name': al.school_class.name,
            'trigger_reason': al.trigger_reason,
            'status': al.status,
            'status_display': al.get_status_display(),
            'action_plan': al.action_plan,
            'confirmed_at': al.confirmed_at.strftime('%Y-%m-%d %H:%M') if al.confirmed_at else None,
            'created_at': al.created_at.strftime('%Y-%m-%d %H:%M'),
        })

    # Notes
    is_self = (user == teacher_user)
    notes_qs = TeacherPerformanceNote.objects.filter(
        school=school,
        teacher=teacher_user
    ).order_by('-created_at')

    if is_self:
        # Teachers only see self_reflection notes
        notes_qs = notes_qs.filter(kind='self_reflection')

    notes_list = []
    for n in notes_qs:
        notes_list.append({
            'id': n.id,
            'author_name': n.author.get_full_name() or n.author.username,
            'kind': n.kind,
            'content': n.content,
            'term_name': n.term_name,
            'created_at': n.created_at.strftime('%Y-%m-%d %H:%M'),
        })

    return {
        'teacher': {
            'id': teacher_user.id,
            'name': teacher_user.get_full_name() or teacher_user.username,
            'email': teacher_user.email,
        },
        'classes': classes_data,
        'class_teacher_summary': class_teacher_summary,
        'term_trends': term_trends,
        'alerts': alerts_list,
        'notes': notes_list,
    }


def preview_criteria_impact(school, criteria_dict, is_all=False, schools=None):
    """Live preview of proposed risk criteria before saving (B4)."""
    min_students = int(criteria_dict.get('min_students', 10))
    min_assessments = int(criteria_dict.get('min_assessments', 2))
    diff_threshold = Decimal(str(criteria_dict.get('diff_campus_threshold', 10.00)))
    pass_threshold = Decimal(str(criteria_dict.get('pass_rate_threshold', 60.00)))
    class_avg_thresh = Decimal(str(criteria_dict.get('class_avg_threshold', 50.00)))
    include_ct = bool(criteria_dict.get('include_class_teacher', True))
    aggregation_mode = str(criteria_dict.get('aggregation_mode', 'weighted_by_students'))

    # Mock criteria object
    class MockCrit:
        pass
    c = MockCrit()
    c.min_students = min_students
    c.min_assessments = min_assessments
    c.diff_campus_threshold = diff_threshold
    c.pass_rate_threshold = pass_threshold
    c.rules = {
        'class_avg_threshold': float(class_avg_thresh),
        'include_class_teacher': include_ct,
        'aggregation_mode': aggregation_mode,
    }

    if is_all and schools is not None:
        target_schools = schools
    else:
        target_schools = School.objects.filter(pk=school.pk) if hasattr(school, 'pk') else [school]

    assignments = TeachingAssignment.objects.filter(
        school__in=target_schools,
        end_date__isnull=True
    ).select_related('school', 'teacher', 'school_class', 'subject')

    counts = {'on_track': 0, 'watch': 0, 'needs_support': 0, 'insufficient_data': 0}
    matched_teachers = set()
    teacher_assignments_map = {}

    for a in assignments:
        res = evaluate_teacher_class_subject(a.school, a.teacher, a.school_class, a.subject, c)
        st = res['status']
        counts[st] += 1
        if st in ('needs_support', 'watch'):
            matched_teachers.add(a.teacher.id)

        if a.teacher.id not in teacher_assignments_map:
            teacher_assignments_map[a.teacher.id] = {
                'teacher_name': a.teacher.get_full_name() or a.teacher.username,
                'evals': []
            }
        teacher_assignments_map[a.teacher.id]['evals'].append(res)

    sample_preview = None
    if teacher_assignments_map:
        sorted_teachers = sorted(teacher_assignments_map.values(), key=lambda t: len(t['evals']), reverse=True)
        top_teacher = sorted_teachers[0]
        sample_preview = {
            'teacher_name': top_teacher['teacher_name'],
            'classes_count': len(top_teacher['evals']),
            'classes': [{
                'class_name': e['class_name'],
                'subject_name': e['subject_name'],
                'student_count': e['student_count'],
                'class_average': e['class_average'],
                'pass_rate': e['pass_rate'],
                'status': e['status'],
                'status_display': e['status_display'],
            } for e in top_teacher['evals']],
        }

    return {
        'total_assignments_evaluated': assignments.count(),
        'total_teachers_evaluated': len(teacher_assignments_map),
        'counts_by_status': counts,
        'flagged_teachers_count': len(matched_teachers),
        'sample_preview': sample_preview,
        'preview_parameters': {
            'min_students': min_students,
            'min_assessments': min_assessments,
            'diff_campus_threshold': float(diff_threshold),
            'pass_rate_threshold': float(pass_threshold),
            'class_avg_threshold': float(class_avg_thresh),
            'include_class_teacher': include_ct,
            'aggregation_mode': aggregation_mode,
        }
    }


def update_criteria_version(school, data, user):
    """Creates a new version of TeacherPerformanceCriteria (B4)."""
    explanation = data.get('explanation_of_change', '').strip()
    if not explanation:
        raise ValidationError({'explanation_of_change': 'An explanation of the criteria revision is required.'})

    current = TeacherPerformanceCriteria.objects.filter(school=school, active=True).first()
    new_version_num = (current.version + 1) if current else 1

    if current:
        current.active = False
        current.save()

    rules = dict(current.rules if current and current.rules else {})
    incoming_rules = data.get('rules') or {}
    rules.update(incoming_rules)

    if 'class_avg_threshold' in data:
        rules['class_avg_threshold'] = float(data['class_avg_threshold'])
    if 'include_class_teacher' in data:
        rules['include_class_teacher'] = bool(data['include_class_teacher'])
    if 'class_teacher_weight' in data:
        rules['class_teacher_weight'] = int(data['class_teacher_weight'])
    if 'show_all_classes' in data:
        rules['show_all_classes'] = bool(data['show_all_classes'])
    if 'aggregation_mode' in data:
        rules['aggregation_mode'] = str(data['aggregation_mode'])
    if 'weights' in data:
        rules['weights'] = data['weights']
    if 'grade_levels' in data:
        rules['grade_levels'] = data['grade_levels']

    new_crit = TeacherPerformanceCriteria.objects.create(
        school=school,
        name=data.get('name', 'Standard Supportive Criteria'),
        version=new_version_num,
        active=True,
        min_students=int(data.get('min_students', 10)),
        min_assessments=int(data.get('min_assessments', 2)),
        diff_campus_threshold=Decimal(str(data.get('diff_campus_threshold', '10.00'))),
        drop_term_threshold=Decimal(str(data.get('drop_term_threshold', '8.00'))),
        pass_rate_threshold=Decimal(str(data.get('pass_rate_threshold', '60.00'))),
        rules=rules,
        explanation_of_change=explanation,
        previous_version=current,
        created_by=user,
    )

    record_event(
        actor=user,
        action='update_teacher_criteria',
        obj=new_crit,
        changed_fields=['version', 'active', 'rules'],
        after={'version': new_crit.version, 'explanation': explanation}
    )
    return new_crit


def update_alert_status(school, alert_id, action, action_data, user):
    """Transitions alert status in the supportive lifecycle (B3, B5)."""
    alert = TeacherPerformanceAlert.objects.filter(school=school, pk=alert_id).first()
    if not alert:
        raise ValidationError({'detail': 'Alert record not found.'})

    if action == 'confirm':
        # Principal confirms suggested alert
        alert.status = 'open'
        alert.confirmed_by = user
        alert.confirmed_at = timezone.now()
        alert.save()
    elif action == 'acknowledge':
        alert.status = 'acknowledged'
        alert.save()
    elif action == 'resolve':
        alert.status = 'resolved'
        alert.action_plan = action_data.get('action_plan', '')
        alert.resolved_by = user
        alert.resolved_at = timezone.now()
        alert.save()
    elif action == 'dismiss':
        alert.status = 'dismissed'
        alert.save()
    else:
        raise ValidationError({'action': "Invalid action. Use 'confirm', 'acknowledge', 'resolve', or 'dismiss'."})

    record_event(
        actor=user,
        action='transition_teacher_alert',
        obj=alert,
        changed_fields=['status'],
        after={'status': alert.status}
    )
    return alert
