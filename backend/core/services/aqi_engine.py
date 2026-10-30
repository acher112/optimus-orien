"""Authoritative Academic Quality Index (AQI) and Examination Calculation Engine.

Strictly follows the OPTIMUS ORIEN AQI Specification:
1. Normalization & Subject Final %:
   Final Subject % = Sum((Marks Obtained / Max Marks) * Term Contribution Fraction) * 100
2. Student Overall Average:
   Sum(Final Subject %) / Number of Required Subjects (Equal weighting default, no multipliers)
3. Subject Average:
   Mean of eligible students' final subject % (Section / Class / Campus / School-wide)
4. Class Average:
   Mean of included subject averages (Equal weighting to each included subject)
5. Campus Average:
   - Class-weighted = Mean of eligible class averages
   - Student-weighted = Mean of eligible students' overall %
6. School-wide Average:
   - Class-weighted = Mean of eligible class averages across the entire school directly
   - Student-weighted = Mean of eligible students' overall % across the entire school directly
   (Never average of campus averages)
7. Gender Performance:
   Boys (male), Girls (female), other/not_recorded in totals.
   Gap = Girls' Average - Boys' Average in percentage points ('pp')
8. Relative Performance:
   Student Overall - Class Overall; Student Subject - Class Subject
9. Ongoing Current Performance:
   Accumulated Points, Assessed Weight, Current Performance %
10. Full Decimal precision without intermediate rounding; round only for display.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Dict, List, Optional, Any, Tuple, Set
from django.db import transaction
from django.db.models import Q
from rest_framework.exceptions import ValidationError, NotFound

from core.models import (
    School, SchoolClass, Subject, AcademicYear, Student, Enrollment, User,
    Assessment, Grade, TeachingAssignment, ClassTeacherAssignment,
    ExamStructure, ExamStructureVersion, ExamTerm, TermSubjectMax,
    AssessmentExemption, SubjectResult, StudentOverallResult, PublishedResult,
    Section, ClassSubject
)
from core.services.aqi_scope import AQIScope

D_ZERO = Decimal('0.0000')
D_HUNDRED = Decimal('100.0000')
EPSILON = Decimal('0.0001')


def to_decimal(val: Any) -> Decimal:
    """Safely converts input value to full-precision Decimal."""
    if isinstance(val, Decimal):
        return val
    if val is None or val == '':
        return D_ZERO
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError(f"Invalid decimal value: {val}")


def round_display(val: Optional[Decimal], places: int = 2) -> Optional[float]:
    """Rounds a Decimal for final presentation/display only.

    Underlying computations remain in Decimal.
    """
    if val is None:
        return None
    q = Decimal('10') ** -places
    rounded = val.quantize(q, rounding=ROUND_HALF_UP)
    return float(rounded)


def calculate_term_normalized_percentage(obtained: Optional[Decimal], maximum: Decimal) -> Optional[Decimal]:
    """Calculates term percentage = (Marks Obtained / Max Marks) * 100.

    Genuine 0 is valid (returns Decimal('0.0000')). Missing marks (None) returns None.
    """
    if obtained is None:
        return None
    if maximum <= D_ZERO:
        raise ValidationError("Maximum marks must be greater than zero.")
    return (obtained / maximum) * D_HUNDRED


def calculate_final_subject_percentage(
    term_results: List[Dict[str, Any]],
    reporting_scale: Decimal = D_HUNDRED
) -> Dict[str, Any]:
    """Calculates final subject percentage and ongoing performance across terms.

    term_results format:
    [
        {
            'term_name': 'First Term',
            'obtained_marks': Decimal('40.00') or None (missing),
            'max_marks': Decimal('50.00'),
            'contribution_percentage': Decimal('20.00'),  # 20%
            'is_exempt': False,
            'result_status': 'recorded' | 'missing' | 'absent' | 'exempt'
        }, ...
    ]

    Returns dict with final_percentage, scaled_marks, status, accumulated_points,
    assessed_weight, remaining_weight, current_performance, trace.
    """
    total_contribution = D_ZERO
    accumulated_points = D_ZERO
    assessed_weight = D_ZERO
    has_missing = False
    terms_trace = []

    for t in term_results:
        c_pct = to_decimal(t.get('contribution_percentage') or 0)
        max_m = to_decimal(t.get('max_marks') or 100)
        obt_raw = t.get('obtained_marks')
        is_exempt = bool(t.get('is_exempt') or t.get('result_status') == 'exempt')
        status = t.get('result_status', 'recorded')

        total_contribution += c_pct

        if is_exempt:
            terms_trace.append({
                'term': t.get('term_name'),
                'status': 'exempt',
                'contribution': c_pct,
                'points_earned': D_ZERO
            })
            continue

        if obt_raw is None or status == 'missing':
            has_missing = True
            terms_trace.append({
                'term': t.get('term_name'),
                'status': 'missing',
                'contribution': c_pct,
                'points_earned': None
            })
            continue

        obt_m = to_decimal(obt_raw)
        if obt_m < D_ZERO:
            raise ValidationError("Marks cannot be negative.")
        if obt_m > max_m:
            raise ValidationError(f"Marks ({obt_m}) exceed maximum ({max_m}).")

        # Normalized percentage for this term
        term_pct = (obt_m / max_m) * D_HUNDRED
        # Contribution points earned = (obt / max) * contribution_percentage
        points_earned = (obt_m / max_m) * c_pct

        accumulated_points += points_earned
        assessed_weight += c_pct

        terms_trace.append({
            'term': t.get('term_name'),
            'status': status,
            'obtained': obt_m,
            'max': max_m,
            'contribution': c_pct,
            'term_percentage': term_pct,
            'points_earned': points_earned
        })

    remaining_weight = max(D_ZERO, D_HUNDRED - assessed_weight)
    current_performance = (accumulated_points / assessed_weight * D_HUNDRED) if assessed_weight > D_ZERO else None

    # If any non-exempt term is missing, final result remains pending
    if has_missing or (assessed_weight + (D_HUNDRED - total_contribution) < (D_HUNDRED - EPSILON)):
        status = 'pending'
        final_percentage = None
        scaled_marks = None
    else:
        status = 'complete'
        # Under standard policy where evaluated contributions total 100% (or normalized if exempt)
        if assessed_weight > D_ZERO and assessed_weight < (D_HUNDRED - EPSILON):
            # Pro-rate across completed non-exempt terms
            final_percentage = (accumulated_points / assessed_weight) * D_HUNDRED
        else:
            final_percentage = accumulated_points

        scaled_marks = (final_percentage * (reporting_scale / D_HUNDRED))

    return {
        'final_percentage': final_percentage,
        'scaled_marks': scaled_marks,
        'status': status,
        'accumulated_points': accumulated_points,
        'assessed_weight': assessed_weight,
        'remaining_weight': remaining_weight,
        'current_performance': current_performance,
        'terms_trace': terms_trace
    }


def calculate_student_overall_average(
    subject_results: List[Dict[str, Any]],
    required_subject_count: Optional[int] = None
) -> Dict[str, Any]:
    """Calculates student overall academic average.

    Formula: SUM(Final Subject Percentages) / Number of Required Subjects (Equal weighting)
    Missing / incomplete subjects keep overall status as 'pending'.
    """
    total_percentage = D_ZERO
    eligible_count = 0
    pending_count = 0
    exempt_count = 0
    subjects_trace = []

    for s in subject_results:
        pct = s.get('final_percentage')
        status = s.get('status', 'complete')
        is_required = s.get('required', True)
        name = s.get('subject_name', 'Subject')

        if not is_required:
            continue

        if status == 'exempt':
            exempt_count += 1
            subjects_trace.append({'subject': name, 'status': 'exempt', 'percentage': None})
            continue

        if pct is None or status == 'pending':
            pending_count += 1
            subjects_trace.append({'subject': name, 'status': 'pending', 'percentage': None})
            continue

        pct_dec = to_decimal(pct)
        total_percentage += pct_dec
        eligible_count += 1
        subjects_trace.append({'subject': name, 'status': 'complete', 'percentage': pct_dec})

    effective_required = required_subject_count if required_subject_count is not None else (eligible_count + pending_count)

    # Incomplete annual result remains pending
    if pending_count > 0 or effective_required == 0 or (eligible_count < effective_required):
        overall_percentage = None
        status = 'pending'
    else:
        divisor = Decimal(str(eligible_count))
        overall_percentage = (total_percentage / divisor) if divisor > D_ZERO else None
        status = 'complete'

    return {
        'overall_percentage': overall_percentage,
        'status': status,
        'eligible_subjects': eligible_count,
        'pending_subjects': pending_count,
        'exempt_subjects': exempt_count,
        'required_subjects': effective_required,
        'subjects_trace': subjects_trace
    }


def calculate_subject_average(
    eligible_percentages: List[Decimal]
) -> Dict[str, Any]:
    """Calculates subject average across eligible students in the selected scope.

    Formula: SUM(Eligible Students' Final Subject %) / Eligible Student Count
    """
    if not eligible_percentages:
        return {'average': None, 'eligible_count': 0}

    total = sum((to_decimal(p) for p in eligible_percentages), D_ZERO)
    count = Decimal(str(len(eligible_percentages)))
    avg = total / count
    return {'average': avg, 'eligible_count': len(eligible_percentages)}


def calculate_class_average(
    included_subject_averages: List[Decimal],
    total_subject_count: int
) -> Dict[str, Any]:
    """Calculates official class performance metric as the mean of included subject averages.

    Formula: SUM(Included Subject Averages) / Number of Included Subjects (Equal weighting)
    A required subject is included when it has >= 1 eligible student.
    Coverage = included_subjects / total_subjects
    """
    valid_averages = [to_decimal(a) for a in included_subject_averages if a is not None]
    included_count = len(valid_averages)

    if included_count == 0:
        return {
            'class_average': None,
            'included_subjects': 0,
            'total_subjects': total_subject_count,
            'coverage': D_ZERO
        }

    total = sum(valid_averages, D_ZERO)
    avg = total / Decimal(str(included_count))
    coverage = (Decimal(str(included_count)) / Decimal(str(max(1, total_subject_count)))) * D_HUNDRED

    return {
        'class_average': avg,
        'included_subjects': included_count,
        'total_subjects': total_subject_count,
        'coverage': coverage
    }


def calculate_campus_averages(
    class_averages: List[Decimal],
    student_overall_percentages: List[Decimal]
) -> Dict[str, Any]:
    """Calculates distinct Class-weighted and Student-weighted campus averages.

    Class-weighted = SUM(Eligible Class Averages) / Number of Eligible Classes
    Student-weighted = SUM(Eligible Students' Overall %) / Eligible Student Count
    """
    valid_classes = [to_decimal(a) for a in class_averages if a is not None]
    class_weighted = (sum(valid_classes, D_ZERO) / Decimal(str(len(valid_classes)))) if valid_classes else None

    valid_students = [to_decimal(p) for p in student_overall_percentages if p is not None]
    student_weighted = (sum(valid_students, D_ZERO) / Decimal(str(len(valid_students)))) if valid_students else None

    return {
        'class_weighted_average': class_weighted,
        'eligible_classes_count': len(valid_classes),
        'student_weighted_average': student_weighted,
        'eligible_students_count': len(valid_students)
    }


def calculate_school_wide_averages(
    all_eligible_class_averages: List[Decimal],
    all_eligible_student_percentages: List[Decimal]
) -> Dict[str, Any]:
    """Calculates school-wide (organisation) class-weighted and student-weighted averages.

    Computed directly across all eligible classes/students in the organisation.
    NEVER computed by averaging campus averages.
    """
    valid_classes = [to_decimal(a) for a in all_eligible_class_averages if a is not None]
    class_weighted = (sum(valid_classes, D_ZERO) / Decimal(str(len(valid_classes)))) if valid_classes else None

    valid_students = [to_decimal(p) for p in all_eligible_student_percentages if p is not None]
    student_weighted = (sum(valid_students, D_ZERO) / Decimal(str(len(valid_students)))) if valid_students else None

    return {
        'class_weighted_average': class_weighted,
        'eligible_classes_count': len(valid_classes),
        'student_weighted_average': student_weighted,
        'eligible_students_count': len(valid_students)
    }


def calculate_gender_analytics(
    boys_percentages: List[Decimal],
    girls_percentages: List[Decimal]
) -> Dict[str, Any]:
    """Computes gender averages and Gender Performance Gap (Girls - Boys) in percentage points ('pp').

    Empty groups return None (N/A) and contribute nothing (never zero).
    """
    valid_boys = [to_decimal(p) for p in boys_percentages if p is not None]
    valid_girls = [to_decimal(p) for p in girls_percentages if p is not None]

    boys_avg = (sum(valid_boys, D_ZERO) / Decimal(str(len(valid_boys)))) if valid_boys else None
    girls_avg = (sum(valid_girls, D_ZERO) / Decimal(str(len(valid_girls)))) if valid_girls else None

    # Gap = Girls - Boys in percentage points
    if boys_avg is not None and girls_avg is not None:
        gap = girls_avg - boys_avg
    else:
        gap = None

    return {
        'boys_average': boys_avg,
        'boys_count': len(valid_boys),
        'girls_average': girls_avg,
        'girls_count': len(valid_girls),
        'gender_gap_pp': gap
    }


def calculate_relative_performance(
    student_value: Optional[Decimal],
    benchmark_average: Optional[Decimal]
) -> Optional[Decimal]:
    """Calculates difference in percentage points between student performance and benchmark.

    Positive = above average, Negative = below average.
    """
    if student_value is None or benchmark_average is None:
        return None
    return to_decimal(student_value) - to_decimal(benchmark_average)


# ---------------------------------------------------------------------------
# Database Sync & Aggregation Layer
# ---------------------------------------------------------------------------

def get_class_applicable_subjects(school_class: SchoolClass) -> List[Subject]:
    """Resolves the applicable required subjects for a class."""
    cs_qs = list(ClassSubject.objects.filter(school_class=school_class).select_related('subject'))
    if cs_qs:
        return [cs.subject for cs in cs_qs]
    # Fallback to TeachingAssignments or all subjects in the school
    taught_sub_ids = list(TeachingAssignment.objects.filter(school_class=school_class).values_list('subject_id', flat=True))
    if taught_sub_ids:
        return list(Subject.objects.filter(id__in=taught_sub_ids))
    return list(Subject.objects.filter(school=school_class.school))


def compute_student_subject_result_from_db(
    enrollment: Enrollment,
    subject: Subject,
    structure: Optional[ExamStructure] = None
) -> Dict[str, Any]:
    """Calculates subject result for a student enrollment from recorded assessments/grades."""
    school_class = enrollment.school_class
    student = enrollment.student

    if not structure:
        structure = ExamStructure.objects.filter(
            classes=school_class,
            status__in=['published', 'locked']
        ).first() or ExamStructure.objects.filter(
            school=school_class.school,
            status__in=['published', 'locked']
        ).first()

    terms_data = []

    if structure:
        terms = list(structure.terms.all().order_by('order', 'id'))
        scale = structure.reporting_scale
        for term in terms:
            # Check maximum marks override
            max_obj = TermSubjectMax.objects.filter(term=term, subject=subject).first()
            max_marks = max_obj.max_marks if max_obj else Decimal('100.00')

            # Check explicit exemption
            is_exempt = AssessmentExemption.objects.filter(
                enrollment=enrollment,
                subject=subject
            ).filter(Q(term=term) | Q(term__isnull=True)).exists()

            # Find assessment and grade
            grade = Grade.objects.filter(
                student=student,
                assessment__school_class=school_class,
                assessment__subject=subject,
                assessment__exam_term=term
            ).first()

            if not grade:
                # Also check by assessment title or date matching term
                grade = Grade.objects.filter(
                    student=student,
                    assessment__school_class=school_class,
                    assessment__subject=subject,
                    assessment__title__icontains=term.name
                ).first()

            obtained = grade.marks if (grade and grade.marks is not None) else None
            status = grade.result_status if grade else ('exempt' if is_exempt else 'missing')
            if is_exempt:
                status = 'exempt'

            terms_data.append({
                'term_name': term.name,
                'obtained_marks': obtained,
                'max_marks': max_marks,
                'contribution_percentage': term.contribution,
                'is_exempt': is_exempt,
                'result_status': status
            })
    else:
        # Fallback: calculate from standard published assessments directly
        scale = Decimal('100.00')
        assessments = list(Assessment.objects.filter(
            school_class=school_class,
            subject=subject,
            published=True
        ))
        total_weight = sum([a.weight for a in assessments], D_ZERO)
        for a in assessments:
            contrib = (a.weight / total_weight * D_HUNDRED) if total_weight > D_ZERO else D_ZERO
            grade = Grade.objects.filter(student=student, assessment=a).first()
            terms_data.append({
                'term_name': a.title,
                'obtained_marks': grade.marks if (grade and grade.marks is not None) else None,
                'max_marks': a.max_marks,
                'contribution_percentage': contrib,
                'is_exempt': grade.result_status == 'exempt' if grade else False,
                'result_status': grade.result_status if grade else 'missing'
            })

    res = calculate_final_subject_percentage(terms_data, reporting_scale=scale)
    res['subject_id'] = subject.id
    res['subject_name'] = subject.name
    res['subject_code'] = getattr(subject, 'code', '')
    res['required'] = True
    return res


def compute_student_full_profile(
    student: Student,
    academic_year: Optional[AcademicYear] = None,
    restrict_to_subject_id: Optional[int] = None
) -> Dict[str, Any]:
    """Generates complete Level 5 academic profile for a student."""
    enr_qs = Enrollment.objects.filter(student=student).select_related('school_class__school', 'school_class__academic_year')
    if academic_year:
        enr_qs = enr_qs.filter(school_class__academic_year=academic_year)
    active_enr = enr_qs.filter(end_date__isnull=True).first() or enr_qs.order_by('-start_date').first()

    if not active_enr:
        return {
            'student_id': student.id,
            'student_name': student.full_name,
            'admission_number': student.admission_number,
            'gender': student.gender,
            'campus_name': student.school.name,
            'class_name': 'Unassigned',
            'overall_percentage': None,
            'class_average': None,
            'difference': None,
            'subjects': [],
            'status': 'pending'
        }

    school_class = active_enr.school_class
    all_subjects = get_class_applicable_subjects(school_class)

    # Filter subjects if restricted (e.g. subject teacher)
    if restrict_to_subject_id:
        subjects_to_calc = [s for s in all_subjects if s.id == restrict_to_subject_id]
    else:
        subjects_to_calc = all_subjects

    subject_results = []
    for subj in subjects_to_calc:
        s_res = compute_student_subject_result_from_db(active_enr, subj)
        subject_results.append(s_res)

    # Calculate overall average across all applicable subjects
    if not restrict_to_subject_id:
        all_s_results = [compute_student_subject_result_from_db(active_enr, s) for s in all_subjects]
        overall_res = calculate_student_overall_average(all_s_results, required_subject_count=len(all_subjects))
        student_overall = overall_res['overall_percentage']
        student_status = overall_res['status']
    else:
        student_overall = None
        student_status = subject_results[0]['status'] if subject_results else 'pending'

    # Compute class benchmarks for each subject
    class_enrs = list(Enrollment.objects.filter(school_class=school_class, end_date__isnull=True).select_related('student'))
    class_subj_averages = {}

    for subj in subjects_to_calc:
        subj_pcts = []
        for c_enr in class_enrs:
            cr = compute_student_subject_result_from_db(c_enr, subj)
            if cr['status'] == 'complete' and cr['final_percentage'] is not None:
                subj_pcts.append(cr['final_percentage'])
        s_avg_res = calculate_subject_average(subj_pcts)
        class_subj_averages[subj.id] = s_avg_res['average']

    # Attach benchmark differences to subject results
    enhanced_subjects = []
    for sr in subject_results:
        sid = sr['subject_id']
        c_avg = class_subj_averages.get(sid)
        diff = calculate_relative_performance(sr['final_percentage'], c_avg)
        sr['class_subject_average'] = c_avg
        sr['difference'] = diff
        sr['difference_display'] = f"{round_display(diff):+g} pp" if diff is not None else None
        enhanced_subjects.append(sr)

    # Class overall average
    all_included_subj_avgs = []
    for subj in all_subjects:
        pcts = []
        for c_enr in class_enrs:
            cr = compute_student_subject_result_from_db(c_enr, subj)
            if cr['status'] == 'complete' and cr['final_percentage'] is not None:
                pcts.append(cr['final_percentage'])
        if pcts:
            all_included_subj_avgs.append(calculate_subject_average(pcts)['average'])

    class_avg_res = calculate_class_average(all_included_subj_avgs, len(all_subjects))
    class_overall_avg = class_avg_res['class_average']

    overall_diff = calculate_relative_performance(student_overall, class_overall_avg)
    diff_text = None
    if overall_diff is not None:
        diff_val = round_display(overall_diff)
        diff_text = f"{abs(diff_val):.2f} percentage points {'above' if diff_val >= 0 else 'below'} the class average"

    # Gender benchmarks for student's class
    boys_overalls = []
    girls_overalls = []
    if not restrict_to_subject_id:
        for c_enr in class_enrs:
            st = c_enr.student
            c_all_sr = [compute_student_subject_result_from_db(c_enr, s) for s in all_subjects]
            cov = calculate_student_overall_average(c_all_sr, len(all_subjects))['overall_percentage']
            if cov is not None:
                if st.gender == 'male':
                    boys_overalls.append(cov)
                elif st.gender == 'female':
                    girls_overalls.append(cov)

    gender_res = calculate_gender_analytics(boys_overalls, girls_overalls)

    # Class section label: "Class 7 – A"
    sec_name = active_enr.section.name if (active_enr.section_id and active_enr.section) else school_class.section
    class_label = f"{school_class.name} – {sec_name}" if sec_name else school_class.name

    return {
        'student_id': student.id,
        'student_name': student.full_name,
        'admission_number': student.admission_number,
        'gender': student.gender,
        'campus_name': school_class.school.name,
        'class_id': school_class.id,
        'class_name': class_label,
        'academic_year': school_class.academic_year.name if school_class.academic_year else '',
        'overall_percentage': student_overall,
        'class_average': class_overall_avg,
        'difference': overall_diff,
        'difference_text': diff_text,
        'status': student_status,
        'subjects': enhanced_subjects,
        'boys_class_average': gender_res['boys_average'],
        'boys_count': gender_res['boys_count'],
        'girls_class_average': gender_res['girls_average'],
        'girls_count': gender_res['girls_count'],
        'gender_gap_pp': gender_res['gender_gap_pp'],
        'eligible_class_students': len([p for p in (boys_overalls + girls_overalls)])
    }


# ---------------------------------------------------------------------------
# Hierarchy Scoped Dashboards
# ---------------------------------------------------------------------------

def get_class_aqi(
    scope: AQIScope,
    class_id: int,
    academic_year_id: Optional[int] = None
) -> Dict[str, Any]:
    """Level 3: Class Academic Quality Index Dashboard."""
    cid = scope.check_class(class_id)
    try:
        school_class = SchoolClass.objects.select_related('school', 'academic_year').get(id=cid)
    except SchoolClass.DoesNotExist:
        raise NotFound("Class not found.")

    applicable_subjects = get_class_applicable_subjects(school_class)
    enrollments = list(Enrollment.objects.filter(school_class=school_class, end_date__isnull=True).select_related('student', 'section'))

    subject_rows = []
    included_subj_averages = []

    for subj in applicable_subjects:
        pcts = []
        boys_pcts = []
        girls_pcts = []
        for enr in enrollments:
            sr = compute_student_subject_result_from_db(enr, subj)
            if sr['status'] == 'complete' and sr['final_percentage'] is not None:
                pcts.append(sr['final_percentage'])
                if enr.student.gender == 'male':
                    boys_pcts.append(sr['final_percentage'])
                elif enr.student.gender == 'female':
                    girls_pcts.append(sr['final_percentage'])

        s_avg_res = calculate_subject_average(pcts)
        s_gender_res = calculate_gender_analytics(boys_pcts, girls_pcts)

        if s_avg_res['average'] is not None:
            included_subj_averages.append(s_avg_res['average'])

        subject_rows.append({
            'subject_id': subj.id,
            'subject_name': subj.name,
            'subject_code': getattr(subj, 'code', ''),
            'average_percentage': round_display(s_avg_res['average']),
            'average_scaled_marks': round_display(s_avg_res['average'] * Decimal('1.00')) if s_avg_res['average'] is not None else None,
            'boys_average': round_display(s_gender_res['boys_average']),
            'girls_average': round_display(s_gender_res['girls_average']),
            'gender_gap_pp': round_display(s_gender_res['gender_gap_pp']),
            'eligible_students_count': s_avg_res['eligible_count'],
            'total_enrolled': len(enrollments),
            'status': 'complete' if s_avg_res['eligible_count'] == len(enrollments) and len(enrollments) > 0 else 'pending'
        })

    class_avg_res = calculate_class_average(included_subj_averages, len(applicable_subjects))

    # Calculate student overalls and gender analytics for class
    student_overalls = []
    boys_overalls = []
    girls_overalls = []
    student_rows = []

    can_see_students = scope.can_view_student_list(cid)

    for enr in enrollments:
        all_s_results = [compute_student_subject_result_from_db(enr, s) for s in applicable_subjects]
        ov_res = calculate_student_overall_average(all_s_results, len(applicable_subjects))
        cov = ov_res['overall_percentage']
        if cov is not None:
            student_overalls.append(cov)
            if enr.student.gender == 'male':
                boys_overalls.append(cov)
            elif enr.student.gender == 'female':
                girls_overalls.append(cov)

        if can_see_students:
            diff_from_class = calculate_relative_performance(cov, class_avg_res['class_average'])
            sec_name = enr.section.name if (enr.section_id and enr.section) else school_class.section
            student_rows.append({
                'student_id': enr.student.id,
                'student_name': enr.student.full_name,
                'admission_number': enr.student.admission_number,
                'gender': enr.student.gender,
                'section_name': sec_name or '',
                'overall_percentage': round_display(cov),
                'status': ov_res['status'],
                'difference_pp': round_display(diff_from_class),
                'difference_display': f"{round_display(diff_from_class):+g} pp" if diff_from_class is not None else None
            })

    class_gender_res = calculate_gender_analytics(boys_overalls, girls_overalls)

    # Campus comparison difference (only for leadership)
    diff_from_campus = None
    if scope.can_view_school(school_class.school_id) and (scope.role in ('organisation_admin', 'school_admin', 'principal') or scope.is_superuser):
        campus_data = get_campus_aqi(scope, school_class.school_id, academic_year_id=academic_year_id)
        campus_avg = campus_data.get('class_weighted_average')
        if campus_avg is not None and class_avg_res['class_average'] is not None:
            diff_from_campus = to_decimal(class_avg_res['class_average']) - to_decimal(campus_avg)

    sec_name = school_class.section or ''
    class_label = f"{school_class.name} – {sec_name}" if sec_name else school_class.name

    return {
        'class_id': school_class.id,
        'class_name': class_label,
        'raw_name': school_class.name,
        'section': sec_name,
        'campus_id': school_class.school.id,
        'campus_name': school_class.school.name,
        'academic_year': school_class.academic_year.name if school_class.academic_year else '',
        'class_average': round_display(class_avg_res['class_average']),
        'coverage': round_display(class_avg_res['coverage']),
        'included_subjects_count': class_avg_res['included_subjects'],
        'total_required_subjects': class_avg_res['total_subjects'],
        'total_students': len(enrollments),
        'difference_from_campus_avg': round_display(diff_from_campus),
        'difference_from_campus_display': f"{round_display(diff_from_campus):+g} pp" if diff_from_campus is not None else None,
        'boys_average': round_display(class_gender_res['boys_average']),
        'boys_count': class_gender_res['boys_count'],
        'girls_average': round_display(class_gender_res['girls_average']),
        'girls_count': class_gender_res['girls_count'],
        'gender_gap_pp': round_display(class_gender_res['gender_gap_pp']),
        'subjects': subject_rows,
        'students': student_rows if can_see_students else []
    }


def get_campus_aqi(
    scope: AQIScope,
    school_id: int,
    academic_year_id: Optional[int] = None
) -> Dict[str, Any]:
    """Level 2: Campus Academic Quality Index Dashboard."""
    sid = scope.check_school(school_id)
    try:
        school = School.objects.get(id=sid)
    except School.DoesNotExist:
        raise NotFound("Campus not found.")

    classes_qs = SchoolClass.objects.filter(school=school).select_related('academic_year')
    if academic_year_id:
        classes_qs = classes_qs.filter(academic_year_id=academic_year_id)

    class_objs = list(classes_qs)

    eligible_class_averages = []
    campus_student_overalls = []
    campus_boys_overalls = []
    campus_girls_overalls = []
    class_comparison_rows = []

    for c in class_objs:
        applicable_subjects = get_class_applicable_subjects(c)
        enrollments = list(Enrollment.objects.filter(school_class=c, end_date__isnull=True).select_related('student', 'section'))

        inc_subj_avgs = []
        for subj in applicable_subjects:
            s_pcts = []
            for enr in enrollments:
                sr = compute_student_subject_result_from_db(enr, subj)
                if sr['status'] == 'complete' and sr['final_percentage'] is not None:
                    s_pcts.append(sr['final_percentage'])
            if s_pcts:
                s_avg = sum(s_pcts, D_ZERO) / Decimal(str(len(s_pcts)))
                inc_subj_avgs.append(s_avg)

        c_avg_res = calculate_class_average(inc_subj_avgs, len(applicable_subjects))
        c_avg = c_avg_res['class_average']
        if c_avg is not None:
            eligible_class_averages.append(c_avg)

        c_boys_ov = []
        c_girls_ov = []
        for enr in enrollments:
            all_sr = [compute_student_subject_result_from_db(enr, s) for s in applicable_subjects]
            ov = calculate_student_overall_average(all_sr, len(applicable_subjects))['overall_percentage']
            if ov is not None:
                campus_student_overalls.append(ov)
                if enr.student.gender == 'male':
                    c_boys_ov.append(ov)
                    campus_boys_overalls.append(ov)
                elif enr.student.gender == 'female':
                    c_girls_ov.append(ov)
                    campus_girls_overalls.append(ov)

        c_gender = calculate_gender_analytics(c_boys_ov, c_girls_ov)

        sec_names = list(Section.objects.filter(school_class=c).values_list('name', flat=True))
        if not sec_names and c.section:
            sec_names = [c.section]
        sections_str = ", ".join(sorted(sec_names)) if sec_names else "-"

        class_comparison_rows.append({
            'class_id': c.id,
            'class_name': c.name,
            'sections': sections_str,
            'total_students': len(enrollments),
            'class_average': c_avg,
            'coverage': c_avg_res['coverage'],
            'gender_gap_pp': c_gender['gender_gap_pp']
        })

    campus_avgs = calculate_campus_averages(eligible_class_averages, campus_student_overalls)
    campus_gender = calculate_gender_analytics(campus_boys_overalls, campus_girls_overalls)

    cw_avg = campus_avgs['class_weighted_average']
    for row in class_comparison_rows:
        ca = row['class_average']
        diff = (to_decimal(ca) - to_decimal(cw_avg)) if (ca is not None and cw_avg is not None) else None
        row['difference_from_campus_avg'] = round_display(diff)
        row['difference_from_campus_display'] = f"{round_display(diff):+g} pp" if diff is not None else None
        row['class_average'] = round_display(ca)
        row['coverage'] = round_display(row['coverage'])
        row['gender_gap_pp'] = round_display(row['gender_gap_pp'])

    class_comparison_rows.sort(
        key=lambda x: (x['class_average'] is not None, x['class_average'] if x['class_average'] is not None else -9999),
        reverse=True
    )

    return {
        'campus_id': school.id,
        'campus_name': school.name,
        'class_weighted_average': round_display(cw_avg),
        'student_weighted_average': round_display(campus_avgs['student_weighted_average']),
        'total_classes': len(class_objs),
        'eligible_classes_count': campus_avgs['eligible_classes_count'],
        'total_students': len(campus_student_overalls),
        'boys_average': round_display(campus_gender['boys_average']),
        'boys_count': campus_gender['boys_count'],
        'girls_average': round_display(campus_gender['girls_average']),
        'girls_count': campus_gender['girls_count'],
        'gender_gap_pp': round_display(campus_gender['gender_gap_pp']),
        'classes': class_comparison_rows
    }


def get_school_wide_aqi(
    scope: AQIScope,
    academic_year_id: Optional[int] = None
) -> Dict[str, Any]:
    """Level 1: School-wide Consolidated AQI Overview across all campuses."""
    scope.check_level(1)

    schools = list(School.objects.filter(id__in=scope.school_ids))

    all_eligible_class_averages = []
    all_eligible_student_overalls = []
    all_boys_overalls = []
    all_girls_overalls = []
    campus_rows = []

    for sch in schools:
        camp_res = get_campus_aqi(scope, sch.id, academic_year_id=academic_year_id)
        classes = SchoolClass.objects.filter(school=sch)
        if academic_year_id:
            classes = classes.filter(academic_year_id=academic_year_id)

        for c in classes:
            applicable_subjects = get_class_applicable_subjects(c)
            enrollments = list(Enrollment.objects.filter(school_class=c, end_date__isnull=True).select_related('student'))
            inc_subjs = []
            for subj in applicable_subjects:
                s_pcts = []
                for enr in enrollments:
                    sr = compute_student_subject_result_from_db(enr, subj)
                    if sr['status'] == 'complete' and sr['final_percentage'] is not None:
                        s_pcts.append(sr['final_percentage'])
                if s_pcts:
                    inc_subjs.append(sum(s_pcts, D_ZERO) / Decimal(str(len(s_pcts))))

            c_avg = calculate_class_average(inc_subjs, len(applicable_subjects))['class_average']
            if c_avg is not None:
                all_eligible_class_averages.append(c_avg)

            for enr in enrollments:
                all_sr = [compute_student_subject_result_from_db(enr, s) for s in applicable_subjects]
                ov = calculate_student_overall_average(all_sr, len(applicable_subjects))['overall_percentage']
                if ov is not None:
                    all_eligible_student_overalls.append(ov)
                    if enr.student.gender == 'male':
                        all_boys_overalls.append(ov)
                    elif enr.student.gender == 'female':
                        all_girls_overalls.append(ov)

        campus_rows.append({
            'campus_id': sch.id,
            'campus_name': sch.name,
            'class_weighted_average': camp_res['class_weighted_average'],
            'student_weighted_average': camp_res['student_weighted_average'],
            'active_classes': camp_res['total_classes'],
            'total_students': camp_res['total_students'],
            'gender_gap_pp': camp_res['gender_gap_pp']
        })

    school_avgs = calculate_school_wide_averages(all_eligible_class_averages, all_eligible_student_overalls)
    school_gender = calculate_gender_analytics(all_boys_overalls, all_girls_overalls)

    sw_cw_avg = school_avgs['class_weighted_average']

    for row in campus_rows:
        cwa = row['class_weighted_average']
        diff = (to_decimal(cwa) - to_decimal(sw_cw_avg)) if (cwa is not None and sw_cw_avg is not None) else None
        row['difference_from_school_avg'] = round_display(diff)
        row['difference_from_school_display'] = f"{round_display(diff):+g} pp" if diff is not None else None

    campus_rows.sort(
        key=lambda x: (x['class_weighted_average'] is not None, x['class_weighted_average'] if x['class_weighted_average'] is not None else -9999),
        reverse=True
    )

    return {
        'class_weighted_average': round_display(sw_cw_avg),
        'student_weighted_average': round_display(school_avgs['student_weighted_average']),
        'total_campuses': len(schools),
        'total_classes': len(all_eligible_class_averages),
        'total_students': len(all_eligible_student_overalls),
        'boys_average': round_display(school_gender['boys_average']),
        'boys_count': school_gender['boys_count'],
        'girls_average': round_display(school_gender['girls_average']),
        'girls_count': school_gender['girls_count'],
        'gender_gap_pp': round_display(school_gender['gender_gap_pp']),
        'campuses': campus_rows
    }


def get_subject_aqi(
    scope: AQIScope,
    class_id: int,
    subject_id: int,
    academic_year_id: Optional[int] = None
) -> Dict[str, Any]:
    """Level 4: Subject Academic Quality Index Dashboard."""
    cid, sid = scope.check_subject(class_id, subject_id)
    try:
        school_class = SchoolClass.objects.select_related('school').get(id=cid)
        subject = Subject.objects.get(id=sid)
    except (SchoolClass.DoesNotExist, Subject.DoesNotExist):
        raise NotFound("Subject or Class not found.")

    structure = ExamStructure.objects.filter(
        classes=school_class,
        status__in=['published', 'locked']
    ).first() or ExamStructure.objects.filter(
        school=school_class.school,
        status__in=['published', 'locked']
    ).first()

    reporting_scale = structure.reporting_scale if structure else Decimal('100.00')

    enrollments = list(Enrollment.objects.filter(school_class=school_class, end_date__isnull=True).select_related('student', 'section'))

    pcts = []
    boys_pcts = []
    girls_pcts = []
    student_rows = []

    for enr in enrollments:
        sr = compute_student_subject_result_from_db(enr, subject, structure=structure)
        pct = sr['final_percentage']
        if sr['status'] == 'complete' and pct is not None:
            pcts.append(pct)
            if enr.student.gender == 'male':
                boys_pcts.append(pct)
            elif enr.student.gender == 'female':
                girls_pcts.append(pct)

        sec_name = enr.section.name if (enr.section_id and enr.section) else school_class.section
        student_rows.append({
            'student_id': enr.student.id,
            'student_name': enr.student.full_name,
            'admission_number': enr.student.admission_number,
            'gender': enr.student.gender,
            'section_name': sec_name or '',
            'terms_trace': sr.get('terms_trace', []),
            'final_percentage': round_display(pct),
            'scaled_marks': round_display(sr.get('scaled_marks')),
            'status': sr['status'],
            'accumulated_points': round_display(sr.get('accumulated_points')),
            'current_performance': round_display(sr.get('current_performance'))
        })

    s_avg_res = calculate_subject_average(pcts)
    s_avg = s_avg_res['average']
    gender_res = calculate_gender_analytics(boys_pcts, girls_pcts)

    for row in student_rows:
        fp = to_decimal(row['final_percentage']) if row['final_percentage'] is not None else None
        diff = (fp - s_avg) if (fp is not None and s_avg is not None) else None
        row['difference_from_subject_avg'] = round_display(diff)
        row['difference_display'] = f"{round_display(diff):+g} pp" if diff is not None else None

    distribution = [
        {'bin': '0–39%', 'count': len([p for p in pcts if p < Decimal('40.00')])},
        {'bin': '40–59%', 'count': len([p for p in pcts if Decimal('40.00') <= p < Decimal('60.00')])},
        {'bin': '60–79%', 'count': len([p for p in pcts if Decimal('60.00') <= p < Decimal('80.00')])},
        {'bin': '80–100%', 'count': len([p for p in pcts if p >= Decimal('80.00')])}
    ]

    sec_name = school_class.section or ''
    class_label = f"{school_class.name} – {sec_name}" if sec_name else school_class.name

    return {
        'class_id': school_class.id,
        'class_name': class_label,
        'subject_id': subject.id,
        'subject_name': subject.name,
        'subject_code': getattr(subject, 'code', ''),
        'campus_name': school_class.school.name,
        'reporting_scale': round_display(reporting_scale),
        'subject_average': round_display(s_avg),
        'average_scaled_marks': round_display(s_avg * (reporting_scale / Decimal('100.00'))) if s_avg is not None else None,
        'eligible_students_count': s_avg_res['eligible_count'],
        'total_enrolled': len(enrollments),
        'boys_average': round_display(gender_res['boys_average']),
        'boys_count': gender_res['boys_count'],
        'girls_average': round_display(gender_res['girls_average']),
        'girls_count': gender_res['girls_count'],
        'gender_gap_pp': round_display(gender_res['gender_gap_pp']),
        'distribution': distribution,
        'students': student_rows
    }


def get_student_aqi_profile(
    scope: AQIScope,
    student_id: int,
    academic_year_id: Optional[int] = None
) -> Dict[str, Any]:
    """Level 5: Student Academic Profile."""
    sid = scope.check_student(student_id)
    try:
        student = Student.objects.select_related('school').get(id=sid)
    except Student.DoesNotExist:
        raise NotFound("Student not found.")

    academic_year = None
    if academic_year_id:
        academic_year = AcademicYear.objects.filter(id=academic_year_id).first()

    restrict_subj = None
    if scope.role == 'teacher':
        active_enr = Enrollment.objects.filter(student=student, end_date__isnull=True).first()
        if active_enr and not scope.can_view_student_list(active_enr.school_class_id):
            assigned_subjs = [p[1] for p in scope.subject_pairs if p[0] == active_enr.school_class_id]
            if len(assigned_subjs) == 1:
                restrict_subj = assigned_subjs[0]

    profile = compute_student_full_profile(
        student,
        academic_year=academic_year,
        restrict_to_subject_id=restrict_subj
    )

    if scope.role in ('student', 'parent'):
        min_size = scope.min_group_size
        if profile['boys_count'] < min_size:
            profile['boys_class_average'] = None
            profile['boys_privacy_notice'] = "Not enough students to show"
        else:
            profile['boys_privacy_notice'] = None

        if profile['girls_count'] < min_size:
            profile['girls_class_average'] = None
            profile['girls_privacy_notice'] = "Not enough students to show"
        else:
            profile['girls_privacy_notice'] = None

        if profile['eligible_class_students'] < min_size:
            profile['class_average'] = None
            profile['class_privacy_notice'] = "Not enough students to show"
            profile['difference'] = None
            profile['difference_text'] = None
        else:
            profile['class_privacy_notice'] = None

    profile['overall_percentage'] = round_display(profile['overall_percentage'])
    profile['class_average'] = round_display(profile['class_average'])
    profile['difference'] = round_display(profile['difference'])
    profile['boys_class_average'] = round_display(profile['boys_class_average'])
    profile['girls_class_average'] = round_display(profile['girls_class_average'])
    profile['gender_gap_pp'] = round_display(profile['gender_gap_pp'])

    for s in profile.get('subjects', []):
        s['final_percentage'] = round_display(s.get('final_percentage'))
        s['scaled_marks'] = round_display(s.get('scaled_marks'))
        s['class_subject_average'] = round_display(s.get('class_subject_average'))
        s['difference'] = round_display(s.get('difference'))
        s['accumulated_points'] = round_display(s.get('accumulated_points'))
        s['assessed_weight'] = round_display(s.get('assessed_weight'))
        s['remaining_weight'] = round_display(s.get('remaining_weight'))
        s['current_performance'] = round_display(s.get('current_performance'))
        for t in s.get('terms_trace', []):
            if 'obtained' in t and t['obtained'] is not None:
                t['obtained'] = round_display(t['obtained'])
            if 'max' in t and t['max'] is not None:
                t['max'] = round_display(t['max'])
            if 'contribution' in t and t['contribution'] is not None:
                t['contribution'] = round_display(t['contribution'])
            if 'term_percentage' in t and t['term_percentage'] is not None:
                t['term_percentage'] = round_display(t['term_percentage'])
            if 'points_earned' in t and t['points_earned'] is not None:
                t['points_earned'] = round_display(t['points_earned'])

    return profile


def get_trace_explanation(
    scope: AQIScope,
    trace_type: str,
    class_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    student_id: Optional[int] = None
) -> Dict[str, Any]:
    """Generates detailed arithmetic breakdown and formula steps for the Explain Drawer."""
    if trace_type == 'student_subject':
        if not student_id or not subject_id:
            raise ValidationError("student_id and subject_id are required for student_subject trace.")
        sid = scope.check_student(student_id)
        student = Student.objects.get(id=sid)
        active_enr = Enrollment.objects.filter(student=student, end_date__isnull=True).first()
        if not active_enr:
            raise NotFound("Student is not currently enrolled.")
        cid = active_enr.school_class_id
        scope.check_subject(cid, subject_id)
        subject = Subject.objects.get(id=subject_id)
        res = compute_student_subject_result_from_db(active_enr, subject)

        steps = []
        for t in res.get('terms_trace', []):
            st = t.get('status')
            if st == 'exempt':
                steps.append({
                    'term': t.get('term'),
                    'description': "Exempt from term assessment (zero penalty)",
                    'calculation': "Exempt",
                    'points': "0.00"
                })
            elif st == 'missing' or t.get('obtained') is None:
                steps.append({
                    'term': t.get('term'),
                    'description': "Result pending / missing marks",
                    'calculation': "Missing",
                    'points': "-"
                })
            else:
                obt = t['obtained']
                mx = t['max']
                cb = t['contribution']
                pe = t['points_earned']
                pct = t['term_percentage']
                steps.append({
                    'term': t.get('term'),
                    'description': f"Marks: {obt} / {mx} ({round_display(pct)}%) × {cb}% contribution",
                    'calculation': f"({obt} ÷ {mx}) × {cb}%",
                    'points': f"{round_display(pe):.2f}%"
                })

        return {
            'title': f"{student.full_name} — {subject.name} Final Calculation",
            'metric': "Final Subject Percentage",
            'formula': "Final Subject % = Σ ((Marks Obtained ÷ Max Marks) × Term Contribution %)",
            'steps': steps,
            'accumulated_points': f"{round_display(res.get('accumulated_points')):.2f}%" if res.get('accumulated_points') is not None else None,
            'assessed_weight': f"{round_display(res.get('assessed_weight')):.2f}%" if res.get('assessed_weight') is not None else None,
            'remaining_weight': f"{round_display(res.get('remaining_weight')):.2f}%" if res.get('remaining_weight') is not None else None,
            'current_performance': f"{round_display(res.get('current_performance')):.2f}%" if res.get('current_performance') is not None else None,
            'final_result': f"{round_display(res.get('final_percentage')):.2f}%" if res.get('final_percentage') is not None else "Pending"
        }

    elif trace_type == 'student_overall':
        if not student_id:
            raise ValidationError("student_id is required.")
        sid = scope.check_student(student_id)
        student = Student.objects.get(id=sid)
        profile = get_student_aqi_profile(scope, student_id)
        steps = []
        for s in profile.get('subjects', []):
            steps.append({
                'item': s['subject_name'],
                'status': s['status'],
                'percentage': f"{s['final_percentage']:.2f}%" if s['final_percentage'] is not None else "Pending"
            })
        return {
            'title': f"{student.full_name} — Overall Academic Average",
            'metric': "Overall Average",
            'formula': "Student Overall % = Σ (Final Subject %) ÷ Number of Required Subjects",
            'steps': steps,
            'final_result': f"{profile['overall_percentage']:.2f}%" if profile['overall_percentage'] is not None else "Pending"
        }

    elif trace_type == 'class_average':
        if not class_id:
            raise ValidationError("class_id is required.")
        cid = scope.check_class(class_id)
        class_res = get_class_aqi(scope, cid)
        steps = []
        for s in class_res.get('subjects', []):
            steps.append({
                'item': s['subject_name'],
                'eligible_students': s['eligible_students_count'],
                'average': f"{s['average_percentage']:.2f}%" if s['average_percentage'] is not None else "No eligible students"
            })
        return {
            'title': f"{class_res['class_name']} — Class Average Calculation",
            'metric': "Class Performance Metric",
            'formula': "Class Average % = Σ (Included Subject Averages) ÷ Number of Included Subjects (Subjects with ≥ 1 eligible student)",
            'steps': steps,
            'final_result': f"{class_res['class_average']:.2f}%" if class_res['class_average'] is not None else "N/A"
        }

    raise ValidationError(f"Unknown trace_type: {trace_type}")

