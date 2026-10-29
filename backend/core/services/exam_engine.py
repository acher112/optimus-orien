"""Configurable Examination and Academic Performance Calculation Engine for Optimus Orien.

Implements the official calculation formulas:
1. Normalization: Term Percentage = (Marks Obtained / Maximum Marks) * 100
2. Subject Percentage: Final = Sum(Term Percentage_t * Weight_t / 100)
3. Reporting Scale: Scaled Marks = Final Percentage * (Reporting Scale / 100)
4. Overall Student Average: Equal weighting or Custom subject weighting (Sum(P_s * W_s) / Sum(W_s))
5. Group Averages: Subject, Class, Branch, School (Student-weighted, Class-weighted, Branch-weighted)
6. Gender Analytics: Boys' average, Girls' average, Gender Gap (percentage points = Girls - Boys)
7. Incomplete Examinations: Pending annual average, separate current performance & assessed weight
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import List, Dict, Any, Optional
from django.db import transaction
from django.db.models import Q
from rest_framework.exceptions import ValidationError

D_ZERO = Decimal('0.0000')
D_HUNDRED = Decimal('100.0000')
EPSILON = Decimal('0.0001')


def to_decimal(val: Any) -> Decimal:
    """Safely converts an input value to Decimal."""
    if isinstance(val, Decimal):
        return val
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError(f"Invalid decimal value: {val}")


def calculate_subject_result(
    student_id: int,
    subject_id: int,
    terms: List[Dict[str, Any]],
    reporting_scale: Decimal = Decimal('100.00')
) -> Dict[str, Any]:
    """Calculates full-precision normalized subject result across examination terms.

    Formula:
      Term Percentage = (Marks Obtained / Maximum Marks) * 100
      Final Percentage = Sum(Term Percentage_t * (Weight_t / 100))
      Final Scaled Marks = Final Percentage * (Reporting Scale / 100)

    Validation rules:
      - Terms list must not be empty.
      - Term weights must sum to exactly 100.00%.
      - Maximum marks must be positive (> 0).
      - Term weights must be non-negative (>= 0).
      - Marks obtained must be between 0 and maximum marks (if entered).

    Incomplete handling:
      - If any required term is missing/unentered:
        final_percentage = None
        completed = False
        accumulated_contribution = Sum(term_pct * weight/100) for completed terms
        assessed_weight = Sum(weight) for completed terms
        current_percentage = (accumulated_contribution / (assessed_weight / 100)) if assessed_weight > 0 else None
    """
    if not terms:
        raise ValidationError("At least one examination term is required.")

    total_weight = Decimal('0.0000')
    term_details = []
    all_completed = True
    assessed_weight = Decimal('0.0000')
    accumulated_contribution = Decimal('0.0000')

    # First pass: validate all terms
    for term in terms:
        component_id = term.get('component_id') or term.get('term_id')
        component_name = str(term.get('component_name') or term.get('name') or f"Term {component_id}")
        raw_max = term.get('maximum_marks')
        raw_weight = term.get('weight_percentage')
        raw_marks = term.get('marks_obtained')
        is_exempt = bool(term.get('is_exempt', False))
        res_status = term.get('result_status', 'recorded')

        if raw_max is None:
            raise ValidationError("Maximum marks must be positive.")
        max_marks = to_decimal(raw_max)
        if max_marks <= Decimal('0.00'):
            raise ValidationError("Maximum marks must be positive.")

        if raw_weight is None:
            raise ValidationError("Term weight must be non-negative.")
        weight_pct = to_decimal(raw_weight)
        if weight_pct < Decimal('0.00'):
            raise ValidationError("Term weight must be non-negative.")

        total_weight += weight_pct

        marks_obtained: Optional[Decimal] = None
        if raw_marks is not None and str(raw_marks).strip() != '':
            marks_obtained = to_decimal(raw_marks)
            if marks_obtained < Decimal('0.00') or marks_obtained > max_marks:
                raise ValidationError(f"Obtained marks are outside the valid range (0 to {max_marks}).")

        # Exemption handling
        if is_exempt or res_status == 'exempt':
            term_details.append({
                'component_id': component_id,
                'component_name': component_name,
                'maximum_marks': str(max_marks),
                'weight_percentage': str(weight_pct),
                'marks_obtained': None,
                'term_percentage': None,
                'contribution': '0.0000',
                'status': 'exempt',
                'completed': True
            })
            continue

        # Incomplete or pending
        if marks_obtained is None or res_status in ('incomplete', 'not_entered'):
            all_completed = False
            term_details.append({
                'component_id': component_id,
                'component_name': component_name,
                'maximum_marks': str(max_marks),
                'weight_percentage': str(weight_pct),
                'marks_obtained': None,
                'term_percentage': None,
                'contribution': '0.0000',
                'status': 'pending',
                'completed': False
            })
            continue

        # Valid marks (including genuine 0.00)
        # Term percentage: (marks_obtained / max_marks) * 100
        term_pct = (marks_obtained / max_marks) * Decimal('100.0000')
        contribution = term_pct * (weight_pct / Decimal('100.0000'))

        assessed_weight += weight_pct
        accumulated_contribution += contribution

        term_details.append({
            'component_id': component_id,
            'component_name': component_name,
            'maximum_marks': str(max_marks),
            'weight_percentage': str(weight_pct),
            'marks_obtained': str(marks_obtained),
            'term_percentage': str(term_pct),
            'contribution': str(contribution),
            'status': res_status,
            'completed': True
        })

    # Validate weight totals
    if abs(total_weight - Decimal('100.00')) > EPSILON:
        raise ValidationError(f"Examination weights must total 100%. Current total: {total_weight}%")

    current_percentage = None
    if assessed_weight > Decimal('0.00'):
        current_percentage = (accumulated_contribution / (assessed_weight / Decimal('100.0000')))

    remaining_weight = Decimal('100.0000') - assessed_weight

    if not all_completed:
        return {
            'student_id': student_id,
            'subject_id': subject_id,
            'completed': False,
            'final_percentage': None,
            'scaled_marks': None,
            'current_percentage': current_percentage,
            'accumulated_contribution': accumulated_contribution,
            'assessed_weight': assessed_weight,
            'remaining_weight': remaining_weight,
            'final_result_status': 'pending',
            'term_results': term_details
        }

    # All completed
    final_percentage = accumulated_contribution
    scaled_marks = final_percentage * (reporting_scale / Decimal('100.0000'))

    return {
        'student_id': student_id,
        'subject_id': subject_id,
        'completed': True,
        'final_percentage': final_percentage,
        'scaled_marks': scaled_marks,
        'current_percentage': final_percentage,
        'accumulated_contribution': accumulated_contribution,
        'assessed_weight': assessed_weight,
        'remaining_weight': Decimal('0.0000'),
        'final_result_status': 'completed',
        'term_results': term_details
    }


def calculate_student_average(
    results: List[Dict[str, Any]],
    weights: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Calculates overall student performance across subjects.

    Supports:
    - Equal weighting: arithmetic mean of subject percentages.
    - Custom weighting: Sum(Percentage_s * Weight_s) / Sum(Weight_s).

    Validation rules:
    - Results must not contain duplicate subjects.
    - Percentages must be between 0 and 100.
    - If any required subject is incomplete, final overall_percentage is None.
    - Custom weights must be positive and present for every subject.
    """
    if not results:
        return {
            'completed': False,
            'overall_percentage': None,
            'current_overall_percentage': None,
            'weighting_method': 'equal' if not weights else 'custom'
        }

    # Check duplicate subjects
    subject_ids = [r['subject_id'] for r in results]
    if len(subject_ids) != len(set(subject_ids)):
        raise ValidationError("Duplicate subjects found in student results.")

    # Validate percentages where present
    for r in results:
        pct = r.get('final_percentage')
        if pct is not None:
            pct_d = to_decimal(pct)
            if pct_d < Decimal('0.00') or pct_d > Decimal('100.0001'):
                raise ValidationError(f"Invalid subject percentage: {pct_d}")

        curr_pct = r.get('current_percentage')
        if curr_pct is not None:
            curr_d = to_decimal(curr_pct)
            if curr_d < Decimal('0.00') or curr_d > Decimal('100.0001'):
                raise ValidationError(f"Invalid current subject percentage: {curr_d}")

    # Subject weight map
    weight_map = {}
    method = 'equal'
    if weights:
        method = 'custom'
        for w in weights:
            s_id = w['subject_id']
            val = to_decimal(w['weight'])
            if val <= Decimal('0.00'):
                raise ValidationError(f"Subject weight for subject {s_id} must be positive.")
            weight_map[s_id] = val

        for s_id in subject_ids:
            if s_id not in weight_map:
                raise ValidationError(f"Missing subject weight for subject {s_id}.")

    all_completed = all(r.get('completed', False) for r in results)

    # Calculate current overall percentage across available subjects
    active_current_items = [r for r in results if r.get('current_percentage') is not None]
    current_overall = None
    if active_current_items:
        if method == 'equal':
            curr_sum = sum(to_decimal(r['current_percentage']) for r in active_current_items)
            current_overall = curr_sum / Decimal(len(active_current_items))
        else:
            total_w = sum(weight_map[r['subject_id']] for r in active_current_items)
            if total_w > Decimal('0.00'):
                curr_w_sum = sum(to_decimal(r['current_percentage']) * weight_map[r['subject_id']] for r in active_current_items)
                current_overall = curr_w_sum / total_w

    if not all_completed:
        return {
            'completed': False,
            'overall_percentage': None,
            'current_overall_percentage': current_overall,
            'weighting_method': method
        }

    # Final overall percentage
    if method == 'equal':
        total = sum(to_decimal(r['final_percentage']) for r in results)
        final_overall = total / Decimal(len(results))
    else:
        total_w = sum(weight_map[r['subject_id']] for r in results)
        if total_w <= Decimal('0.00'):
            raise ValidationError("Total subject weight must be positive.")
        weighted_total = sum(to_decimal(r['final_percentage']) * weight_map[r['subject_id']] for r in results)
        final_overall = weighted_total / total_w

    return {
        'completed': True,
        'overall_percentage': final_overall,
        'current_overall_percentage': final_overall,
        'weighting_method': method
    }


def calculate_group_average(percentages: List[Decimal]) -> Optional[Decimal]:
    """Calculates the arithmetic mean of performance percentages.

    Used uniformly for subjects, classes, sections, branches, and gender groups.
    Returns None if no eligible percentages exist (never returns 0% for empty).
    """
    if not percentages:
        return None

    for p in percentages:
        if p < Decimal('0.00') or p > Decimal('100.0001'):
            raise ValidationError(f"Invalid performance percentage: {p}")

    total = sum(percentages)
    return total / Decimal(len(percentages))


def calculate_subject_average(
    eligible_percentages: List[Decimal],
    enrolled_count: int = 0
) -> Dict[str, Any]:
    """Calculates subject average percentage and assessment coverage metrics (Spec §6).

    Formula:
      Subject Average = SUM(Eligible Students' Final Subject Percentages) / Eligible Student Count

    Returns:
      average_percentage: Decimal or None (empty population returns None / N/A, never 0)
      eligible_count: number of students with completed valid subject results
      enrolled_count: total enrolled students for the subject in scope
      pending_count: number of pending / unentered results
      coverage_percentage: (eligible_count / enrolled_count) * 100
    """
    eligible_count = len(eligible_percentages)
    pending_count = max(0, enrolled_count - eligible_count)
    if eligible_count == 0:
        return {
            'average_percentage': None,
            'eligible_count': 0,
            'enrolled_count': enrolled_count,
            'pending_count': pending_count,
            'coverage_percentage': None
        }

    for p in eligible_percentages:
        if p < Decimal('0.00') or p > Decimal('100.0001'):
            raise ValidationError(f"Invalid subject percentage: {p}")

    avg = sum(eligible_percentages) / Decimal(eligible_count)
    coverage = (Decimal(eligible_count) / Decimal(enrolled_count) * Decimal('100.0000')) if enrolled_count > 0 else Decimal('100.0000')

    return {
        'average_percentage': avg,
        'eligible_count': eligible_count,
        'enrolled_count': enrolled_count,
        'pending_count': pending_count,
        'coverage_percentage': coverage
    }


def calculate_class_average(included_subject_averages: List[Decimal]) -> Optional[Decimal]:
    """Calculates official class performance average using the equal-subject model (Spec §7).

    Formula:
      Class Average = SUM(Included Subject Averages) / Number of Included Subjects

    Each included subject contributes equally to the class metric.
    Returns None if no included subject averages exist (never returns zero for empty).
    """
    if not included_subject_averages:
        return None
    for s_avg in included_subject_averages:
        if s_avg < Decimal('0.00') or s_avg > Decimal('100.0001'):
            raise ValidationError(f"Invalid subject average percentage: {s_avg}")
    return sum(included_subject_averages) / Decimal(len(included_subject_averages))


def calculate_class_weighted_average(class_averages: List[Decimal]) -> Optional[Decimal]:
    """Calculates class-weighted school or branch average (Spec §8A).

    Formula:
      School/Branch Average = SUM(Eligible Class Averages) / Number of Eligible Classes
      Each eligible class contributes equally regardless of class size.
    """
    if not class_averages:
        return None
    for ca in class_averages:
        if ca < Decimal('0.00') or ca > Decimal('100.0001'):
            raise ValidationError(f"Invalid class average percentage: {ca}")
    return sum(class_averages) / Decimal(len(class_averages))


def calculate_student_weighted_average(student_percentages: List[Decimal]) -> Optional[Decimal]:
    """Calculates student-weighted school or branch average (Spec §8B).

    Formula:
      School/Branch Average = SUM(Eligible Students' Overall Percentages) / Eligible Student Count
      Each eligible student contributes equally.
    """
    if not student_percentages:
        return None
    for sp in student_percentages:
        if sp < Decimal('0.00') or sp > Decimal('100.0001'):
            raise ValidationError(f"Invalid student overall percentage: {sp}")
    return sum(student_percentages) / Decimal(len(student_percentages))


def calculate_gender_performance(
    students: List[Dict[str, Any]],
    requested_gender: str
) -> Optional[Decimal]:
    """Calculates group average for a specified authorized gender category (Spec §9)."""
    eligible = [
        to_decimal(s['overall_percentage'])
        for s in students
        if s.get('gender') == requested_gender and s.get('overall_percentage') is not None
    ]
    return calculate_group_average(eligible)


def validate_configuration_for_publication(config: Any) -> None:
    """Strict configuration validation before publication (Spec §3).

    Rules:
    - Defined academic scope (school and academic year).
    - Reporting scale must be positive (> 0).
    - Passing percentage must be within 0.00% and 100.00%.
    - At least one valid examination term must exist.
    - Each required term must have a valid non-empty name.
    - Term contributions must be non-negative and sum to exactly 100.00%.
    - Maximum marks must be greater than zero for every applicable subject.
    - Applicable subjects must exist for the configuration scope.
    - Reject invalid configurations explicitly. Never silently normalize weights.
    """
    from core.models import ExamComponentSubjectConfig, Subject

    if not getattr(config, 'school_id', None):
        raise ValidationError("Configuration must have a defined school / campus scope.")
    if not getattr(config, 'academic_year_id', None):
        raise ValidationError("Configuration must have a defined academic year.")

    if config.reporting_scale <= Decimal('0.00'):
        raise ValidationError("Final reporting scale must be positive (> 0).")

    if config.passing_threshold < Decimal('0.00') or config.passing_threshold > Decimal('100.00'):
        raise ValidationError("Passing percentage must be within permitted range (0.00% to 100.00%).")

    components = list(config.components.all().order_by('sequence', 'id'))
    if not components:
        raise ValidationError("At least one valid examination term/component must exist.")

    total_weight = sum(c.weight_percentage for c in components)
    if abs(total_weight - Decimal('100.00')) > EPSILON:
        raise ValidationError(f"Term contributions must total 100.00% to publish. Current total: {total_weight}%.")

    # Scope subjects
    if config.subject_id:
        target_subjects = [config.subject]
    else:
        target_subjects = list(Subject.objects.filter(school_id=config.school_id))

    if not target_subjects:
        raise ValidationError("No applicable subjects found for configuration scope.")

    subject_configs = {
        (sc.component_id, sc.subject_id): sc.maximum_marks
        for sc in ExamComponentSubjectConfig.objects.filter(component__in=components)
    }

    for comp in components:
        if not comp.name or not comp.name.strip():
            raise ValidationError(f"Examination component #{comp.id} must have a valid name.")
        if comp.weight_percentage < Decimal('0.00'):
            raise ValidationError(f"Term '{comp.name}' contribution must be non-negative (>= 0).")
        if comp.default_max_marks <= Decimal('0.00'):
            raise ValidationError(f"Term '{comp.name}' maximum marks must be greater than zero.")

        # Validate maximum marks for each applicable subject
        for subj in target_subjects:
            max_m = subject_configs.get((comp.id, subj.id), comp.default_max_marks)
            if max_m <= Decimal('0.00'):
                raise ValidationError(f"Maximum marks for subject '{subj.name}' in term '{comp.name}' must be greater than zero.")


# ------------------------------------------------------------------ Recalculation Service Pipeline
def recalculate_configuration(config_id: int) -> Dict[str, Any]:
    """Recalculates all dependent subject and student results for a given ExamConfiguration.

    Transactional and reproducible:
    1. Loads the configuration and its components, subject marks configs, and subject weights.
    2. Identifies all eligible enrolled students in the configuration's scope.
    3. Calculates subject results using calculate_subject_result().
    4. Calculates overall student results using calculate_student_average().
    5. Updates or creates CalculatedSubjectResult and CalculatedStudentResult records.
    6. Increments version and creates an audit snapshot in ResultPublicationHistory.
    """
    from core.models import (
        ExamConfiguration, ExamComponent, ExamComponentSubjectConfig,
        ExamSubjectWeight, ExamStudentMark, CalculatedSubjectResult,
        CalculatedStudentResult, ResultPublicationHistory, SchoolClass,
        Subject, Enrollment, Student
    )

    with transaction.atomic():
        config = ExamConfiguration.objects.select_for_update().filter(pk=config_id).first()
        if not config:
            raise ValidationError(f"Configuration #{config_id} not found.")

        components = list(config.components.all().order_by('sequence', 'id'))
        if not components:
            raise ValidationError("Configuration has no examination components.")

        # Validate total weight
        total_w = sum(c.weight_percentage for c in components)
        if abs(total_w - Decimal('100.00')) > EPSILON:
            raise ValidationError(f"Configuration examination weights must total 100%. Current total: {total_w}%.")

        # Subject configs map: (component_id, subject_id) -> max_marks
        subject_configs = {}
        for sc in ExamComponentSubjectConfig.objects.filter(component__in=components):
            subject_configs[(sc.component_id, sc.subject_id)] = sc

        # Subject weights map: subject_id -> weight
        subject_weights = [
            {'subject_id': sw.subject_id, 'weight': sw.weight}
            for sw in config.subject_weights.all()
        ]

        # Scope classes
        if config.school_class:
            target_classes = [config.school_class]
        else:
            target_classes = list(SchoolClass.objects.filter(
                school=config.school,
                academic_year=config.academic_year
            ))

        # Scope subjects
        if config.subject:
            target_subjects = [config.subject]
        else:
            target_subjects = list(Subject.objects.filter(school=config.school))

        subjects_by_id = {s.id: s for s in target_subjects}
        passing_threshold = config.passing_threshold
        reporting_scale = config.reporting_scale

        subject_results_updated = 0
        student_results_updated = 0
        seen_student_ids = set()

        for klass in target_classes:
            # Active enrolled students deduplicated by student ID (Spec §8, §14 #19)
            enrollments = Enrollment.objects.filter(
                school_class=klass
            ).filter(
                Q(end_date__isnull=True) | Q(end_date__gte=config.academic_year.start_date)
            ).select_related('student').order_by('student_id', '-start_date')

            students = []
            for en in enrollments:
                if en.student_id not in seen_student_ids:
                    seen_student_ids.add(en.student_id)
                    students.append(en.student)

            # Fetch all existing marks for this scope
            marks_qs = ExamStudentMark.objects.filter(
                component__in=components,
                school_class=klass
            ).select_related('student', 'component', 'subject')

            marks_lookup = {}
            for m in marks_qs:
                marks_lookup[(m.student_id, m.subject_id, m.component_id)] = m

            for student in students:
                student_subject_summaries = []

                for subject in target_subjects:
                    terms_input = []
                    for comp in components:
                        sc = subject_configs.get((comp.id, subject.id))
                        max_marks = sc.maximum_marks if sc else comp.default_max_marks
                        is_exempt = sc.is_exempt if sc else False

                        mark_rec = marks_lookup.get((student.id, subject.id, comp.id))
                        marks_val = mark_rec.marks_obtained if mark_rec else None
                        res_status = mark_rec.result_status if mark_rec else 'not_entered'
                        if mark_rec and mark_rec.is_exempt:
                            is_exempt = True

                        terms_input.append({
                            'component_id': comp.id,
                            'component_name': comp.name,
                            'maximum_marks': max_marks,
                            'weight_percentage': comp.weight_percentage,
                            'marks_obtained': marks_val,
                            'result_status': res_status,
                            'is_exempt': is_exempt
                        })

                    sub_res = calculate_subject_result(
                        student_id=student.id,
                        subject_id=subject.id,
                        terms=terms_input,
                        reporting_scale=reporting_scale
                    )

                    CalculatedSubjectResult.objects.update_or_create(
                        student=student,
                        subject=subject,
                        configuration=config,
                        defaults={
                            'school_class': klass,
                            'academic_year': config.academic_year,
                            'configuration_version': config.version,
                            'calculation_version': 1,
                            'completed': sub_res['completed'],
                            'final_percentage': sub_res['final_percentage'],
                            'scaled_marks': sub_res['scaled_marks'],
                            'current_percentage': sub_res['current_percentage'],
                            'accumulated_contribution': sub_res['accumulated_contribution'],
                            'assessed_weight': sub_res['assessed_weight'],
                            'term_results': sub_res['term_results'],
                        }
                    )
                    subject_results_updated += 1
                    student_subject_summaries.append(sub_res)

                # Now calculate student overall performance
                weights_arg = subject_weights if config.subject_weighting_mode == 'custom' else None
                overall_res = calculate_student_average(student_subject_summaries, weights=weights_arg)

                # Find highest and lowest subject
                completed_subs = [
                    s for s in student_subject_summaries
                    if s.get('final_percentage') is not None
                ]
                highest_sub = None
                lowest_sub = None
                if completed_subs:
                    sorted_subs = sorted(completed_subs, key=lambda x: to_decimal(x['final_percentage']), reverse=True)
                    highest_sub = subjects_by_id.get(sorted_subs[0]['subject_id'])
                    lowest_sub = subjects_by_id.get(sorted_subs[-1]['subject_id'])

                missing_count = sum(1 for s in student_subject_summaries if not s.get('completed', False))
                is_passed = None
                if overall_res['overall_percentage'] is not None:
                    is_passed = overall_res['overall_percentage'] >= passing_threshold

                CalculatedStudentResult.objects.update_or_create(
                    student=student,
                    configuration=config,
                    defaults={
                        'school_class': klass,
                        'academic_year': config.academic_year,
                        'configuration_version': config.version,
                        'calculation_version': 1,
                        'weighting_method': overall_res['weighting_method'],
                        'completed': overall_res['completed'],
                        'overall_percentage': overall_res['overall_percentage'],
                        'current_overall_percentage': overall_res['current_overall_percentage'],
                        'highest_subject': highest_sub,
                        'lowest_subject': lowest_sub,
                        'missing_subjects_count': missing_count,
                        'passed': is_passed,
                    }
                )
                student_results_updated += 1

        return {
            'configuration_id': config.id,
            'version': config.version,
            'subject_results_updated': subject_results_updated,
            'student_results_updated': student_results_updated
        }


def recalculate_student(student_id: int, configuration_id: int) -> Dict[str, Any]:
    """Recalculates a single student's subject and overall results after a mark change."""
    from core.models import (
        ExamConfiguration, ExamComponent, ExamComponentSubjectConfig,
        ExamStudentMark, CalculatedSubjectResult, CalculatedStudentResult,
        Subject, Enrollment, Student
    )

    with transaction.atomic():
        config = ExamConfiguration.objects.filter(pk=configuration_id).first()
        student = Student.objects.filter(pk=student_id).first()
        if not config or not student:
            return {'error': 'Config or student not found'}

        components = list(config.components.all().order_by('sequence', 'id'))
        if not components:
            return {'error': 'No components'}

        # Get student's class
        enrollment = Enrollment.objects.filter(
            student=student,
            school_class__school=config.school
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=config.academic_year.start_date)
        ).select_related('school_class').first()

        klass = enrollment.school_class if enrollment else config.school_class
        if not klass:
            return {'error': 'No class found for student'}

        subject_configs = {}
        for sc in ExamComponentSubjectConfig.objects.filter(component__in=components):
            subject_configs[(sc.component_id, sc.subject_id)] = sc

        subject_weights = [
            {'subject_id': sw.subject_id, 'weight': sw.weight}
            for sw in config.subject_weights.all()
        ]

        target_subjects = list(Subject.objects.filter(school=config.school)) if not config.subject else [config.subject]
        subjects_by_id = {s.id: s for s in target_subjects}

        marks_qs = ExamStudentMark.objects.filter(
            student=student,
            component__in=components
        ).select_related('component', 'subject')

        marks_lookup = {(m.subject_id, m.component_id): m for m in marks_qs}

        student_subject_summaries = []
        for subject in target_subjects:
            terms_input = []
            for comp in components:
                sc = subject_configs.get((comp.id, subject.id))
                max_marks = sc.maximum_marks if sc else comp.default_max_marks
                is_exempt = sc.is_exempt if sc else False

                mark_rec = marks_lookup.get((subject.id, comp.id))
                marks_val = mark_rec.marks_obtained if mark_rec else None
                res_status = mark_rec.result_status if mark_rec else 'not_entered'
                if mark_rec and mark_rec.is_exempt:
                    is_exempt = True

                terms_input.append({
                    'component_id': comp.id,
                    'component_name': comp.name,
                    'maximum_marks': max_marks,
                    'weight_percentage': comp.weight_percentage,
                    'marks_obtained': marks_val,
                    'result_status': res_status,
                    'is_exempt': is_exempt
                })

            sub_res = calculate_subject_result(
                student_id=student.id,
                subject_id=subject.id,
                terms=terms_input,
                reporting_scale=config.reporting_scale
            )

            CalculatedSubjectResult.objects.update_or_create(
                student=student,
                subject=subject,
                configuration=config,
                defaults={
                    'school_class': klass,
                    'academic_year': config.academic_year,
                    'configuration_version': config.version,
                    'calculation_version': 1,
                    'completed': sub_res['completed'],
                    'final_percentage': sub_res['final_percentage'],
                    'scaled_marks': sub_res['scaled_marks'],
                    'current_percentage': sub_res['current_percentage'],
                    'accumulated_contribution': sub_res['accumulated_contribution'],
                    'assessed_weight': sub_res['assessed_weight'],
                    'term_results': sub_res['term_results'],
                }
            )
            student_subject_summaries.append(sub_res)

        weights_arg = subject_weights if config.subject_weighting_mode == 'custom' else None
        overall_res = calculate_student_average(student_subject_summaries, weights=weights_arg)

        completed_subs = [s for s in student_subject_summaries if s.get('final_percentage') is not None]
        highest_sub = None
        lowest_sub = None
        if completed_subs:
            sorted_subs = sorted(completed_subs, key=lambda x: to_decimal(x['final_percentage']), reverse=True)
            highest_sub = subjects_by_id.get(sorted_subs[0]['subject_id'])
            lowest_sub = subjects_by_id.get(sorted_subs[-1]['subject_id'])

        missing_count = sum(1 for s in student_subject_summaries if not s.get('completed', False))
        is_passed = None
        if overall_res['overall_percentage'] is not None:
            is_passed = overall_res['overall_percentage'] >= config.passing_threshold

        CalculatedStudentResult.objects.update_or_create(
            student=student,
            configuration=config,
            defaults={
                'school_class': klass,
                'academic_year': config.academic_year,
                'configuration_version': config.version,
                'calculation_version': 1,
                'weighting_method': overall_res['weighting_method'],
                'completed': overall_res['completed'],
                'overall_percentage': overall_res['overall_percentage'],
                'current_overall_percentage': overall_res['current_overall_percentage'],
                'highest_subject': highest_sub,
                'lowest_subject': lowest_sub,
                'missing_subjects_count': missing_count,
                'passed': is_passed,
            }
        )

        return {'success': True, 'student_id': student.id}
