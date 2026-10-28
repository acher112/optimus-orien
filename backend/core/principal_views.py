"""Isolated Principal Portal Dashboard API.

Provides campus-specific overview metrics, attendance register tracking,
results awaiting approval, review case monitoring, class-by-class comparisons,
and academic subject averages for the principal's assigned campus.
Enforces strict campus isolation: out-of-scope queries return 404 Not Found.
"""
from collections import defaultdict
from decimal import Decimal
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from core.models import (
    School, Student, Enrollment, SchoolClass, StaffMember,
    Attendance, Grade, Assessment, Subject, ReviewCase,
    ExamConfiguration, CalculatedStudentResult
)
from core.services.access import schools_scope


@api_view(['GET'])
def principal_dashboard(request):
    """
    GET /api/v1/principal/dashboard/
    Dedicated principal dashboard providing KPI strip, needs attention panel,
    class comparison metrics, subject averages, and gender performance distribution.
    """
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    if user.role not in ('principal', 'school_admin', 'organisation_admin') and not user.is_superuser:
        raise PermissionDenied('Principal dashboard requires principal or administrator credentials.')

    accessible_schools = schools_scope(user)
    requested_school_id = request.query_params.get('school') or request.query_params.get('campus')

    if user.role == 'principal':
        if not user.school_id:
            raise NotFound('No campus assigned to this principal.')
        school = accessible_schools.filter(pk=user.school_id).first()
        if not school:
            raise NotFound('Campus not found or assignment has expired.')
        if requested_school_id and str(requested_school_id) != str(user.school_id):
            raise NotFound('Campus not found.')
    else:
        if requested_school_id:
            try:
                school = accessible_schools.get(pk=int(requested_school_id))
            except (ValueError, School.DoesNotExist):
                raise NotFound('Campus not found.')
        else:
            school = accessible_schools.first()
            if not school:
                raise NotFound('No accessible campus found.')

    today = timezone.localdate()

    # 1. Classes and Enrollment
    classes = list(SchoolClass.objects.filter(school=school).select_related('teacher', 'academic_year').order_by('grade_level', 'name'))
    class_ids = [c.id for c in classes]

    active_enrollments = Enrollment.objects.filter(
        school_class__in=class_ids,
        end_date__isnull=True
    ).select_related('student')
    total_students = active_enrollments.values('student').distinct().count()

    # Staff count
    staff_qs = StaffMember.objects.filter(school=school, status='active')
    total_teachers = staff_qs.filter(Q(role='teacher') | Q(position__icontains='teacher')).count()
    total_staff = staff_qs.count()

    # 2. Attendance Metrics
    # Today's attendance
    today_att = Attendance.objects.filter(school_class__in=class_ids, date=today)
    submitted_class_ids = set(today_att.values_list('school_class_id', flat=True))

    today_recorded = today_att.count()
    today_present = today_att.filter(status__in=['present', 'late']).count()
    today_attendance_rate = round((today_present / today_recorded) * 100, 1) if today_recorded > 0 else None

    # Unsubmitted registers today
    unsubmitted_registers = []
    for c in classes:
        if c.id not in submitted_class_ids:
            unsubmitted_registers.append({
                'class_id': c.id,
                'class_name': c.name,
                'grade_level': c.grade_level,
                'teacher': (c.teacher.get_full_name() or c.teacher.username) if c.teacher else 'Unassigned'
            })

    # Overall attendance per class
    att_by_class = defaultdict(lambda: {'present': 0, 'recorded': 0})
    all_att = Attendance.objects.filter(school_class__in=class_ids).values('school_class_id', 'status').annotate(cnt=Count('id'))
    for row in all_att:
        cid = row['school_class_id']
        att_by_class[cid]['recorded'] += row['cnt']
        if row['status'] in ('present', 'late'):
            att_by_class[cid]['present'] += row['cnt']

    # 3. Academic Metrics & Results Awaiting Approval
    # Draft exam configurations or unapproved results
    draft_configs = list(ExamConfiguration.objects.filter(school=school, status='draft').values('id', 'name', 'academic_year__name', 'version'))
    unpublished_assessments = Assessment.objects.filter(school_class__in=class_ids, published=False).count()

    results_awaiting_approval = []
    for dc in draft_configs:
        yr = dc.get('academic_year__name') or 'Current Session'
        results_awaiting_approval.append({
            'type': 'exam_configuration',
            'id': dc['id'],
            'title': f"{dc['name']} ({yr})",
            'detail': f"Examination configuration v{dc['version']} in draft"
        })
    if unpublished_assessments > 0:
        results_awaiting_approval.append({
            'type': 'unpublished_assessments',
            'id': None,
            'title': f"{unpublished_assessments} Unpublished Assessment(s)",
            'detail': 'Teacher assessments marked but awaiting publication to students'
        })

    # Open review cases
    open_cases_qs = ReviewCase.objects.filter(school=school, status__in=['open', 'in_progress']).select_related('student', 'assignee')
    open_review_cases_count = open_cases_qs.count()
    open_review_cases = [{
        'id': rc.id,
        'student_name': rc.student.full_name,
        'reason': rc.reason,
        'status': rc.status,
        'priority': rc.priority,
        'assignee': (rc.assignee.get_full_name() or rc.assignee.username) if rc.assignee else 'Unassigned',
        'created_at': rc.created_at.isoformat()
    } for rc in open_cases_qs[:10]]

    # 4. Academic Performance Rollup
    # Check published calculated results first
    calc_results = CalculatedStudentResult.objects.filter(
        configuration__school=school,
        configuration__status='published'
    ).select_related('student')

    student_percentages = {}
    class_averages_map = defaultdict(list)
    subject_scores_map = defaultdict(lambda: {'total': Decimal('0.00'), 'count': 0})
    student_genders = dict(Student.objects.filter(school=school).values_list('id', 'gender'))

    if calc_results.exists():
        for cr in calc_results:
            pct = float(cr.overall_percentage)
            student_percentages[cr.student_id] = pct
            if cr.enrollment and cr.enrollment.school_class_id:
                class_averages_map[cr.enrollment.school_class_id].append(pct)
            # Subject breakdown
            for s_code, s_info in (cr.subject_breakdown or {}).items():
                if isinstance(s_info, dict) and 'percentage' in s_info:
                    try:
                        p_val = Decimal(str(s_info['percentage']))
                        subject_scores_map[s_code]['total'] += p_val
                        subject_scores_map[s_code]['count'] += 1
                        subject_scores_map[s_code]['name'] = s_info.get('name', s_code)
                    except Exception:
                        pass
        academic_average = round(sum(student_percentages.values()) / len(student_percentages), 1) if student_percentages else None
    else:
        # Fallback to published assessments and grades
        grades = Grade.objects.filter(
            assessment__school_class__in=class_ids,
            assessment__published=True
        ).select_related('assessment', 'assessment__school_class', 'assessment__subject', 'student')
        
        per_student_grades = defaultdict(list)
        for g in grades:
            max_m = float(g.assessment.max_marks or 100)
            if max_m > 0 and g.marks is not None:
                p = (float(g.marks) / max_m) * 100.0
                per_student_grades[g.student_id].append(p)
                class_averages_map[g.assessment.school_class_id].append(p)
                subj = g.assessment.subject
                if subj:
                    subject_scores_map[subj.code]['total'] += Decimal(str(round(p, 2)))
                    subject_scores_map[subj.code]['count'] += 1
                    subject_scores_map[subj.code]['name'] = subj.name

        for sid, p_list in per_student_grades.items():
            if p_list:
                student_percentages[sid] = sum(p_list) / len(p_list)
        academic_average = round(sum(student_percentages.values()) / len(student_percentages), 1) if student_percentages else None

    # Class comparison rows
    class_rows = []
    class_student_counts = defaultdict(int)
    for enr in active_enrollments:
        class_student_counts[enr.school_class_id] += 1

    for c in classes:
        c_att = att_by_class[c.id]
        c_att_rate = round((c_att['present'] / c_att['recorded']) * 100, 1) if c_att['recorded'] > 0 else None
        c_avg_list = class_averages_map.get(c.id, [])
        c_avg = round(sum(c_avg_list) / len(c_avg_list), 1) if c_avg_list else None

        class_rows.append({
            'id': c.id,
            'name': c.name,
            'grade_level': c.grade_level,
            'teacher': (c.teacher.get_full_name() or c.teacher.username) if c.teacher else 'Unassigned',
            'students': class_student_counts[c.id],
            'attendance_rate': c_att_rate,
            'academic_average': c_avg
        })

    # Subject averages list
    subject_rows = []
    for code, s_data in sorted(subject_scores_map.items()):
        cnt = s_data['count']
        sub_avg = round(float(s_data['total']) / cnt, 1) if cnt > 0 else None
        subject_rows.append({
            'code': code,
            'name': s_data.get('name', code),
            'average': sub_avg,
            'students_assessed': cnt
        })

    # 5. Gender Performance Analysis (Objective, non-blaming language)
    boys_scores = []
    girls_scores = []
    for sid, score in student_percentages.items():
        g = (student_genders.get(sid) or '').lower()
        if g in ('male', 'boy', 'm'):
            boys_scores.append(score)
        elif g in ('female', 'girl', 'f'):
            girls_scores.append(score)

    boys_avg = round(sum(boys_scores) / len(boys_scores), 1) if boys_scores else None
    girls_avg = round(sum(girls_scores) / len(girls_scores), 1) if girls_scores else None

    gender_diff = None
    gender_note = 'Data across student groups is being compiled as assessments are published.'
    if boys_avg is not None and girls_avg is not None:
        gender_diff = round(abs(boys_avg - girls_avg), 1)
        if gender_diff <= 2.0:
            gender_note = f'Even performance distribution across student groups (difference: {gender_diff}%).'
        else:
            gender_note = (
                f'Performance variance between cohorts is {gender_diff}%. '
                'Review classroom engagement and targeted subject support opportunities across cohorts.'
            )

    payload = {
        'campus': {
            'id': school.id,
            'name': school.name,
            'code': school.code,
            'city': school.city,
            'currency': school.currency
        },
        'kpi': {
            'total_students': total_students,
            'today_attendance_rate': today_attendance_rate,
            'total_teachers': total_teachers,
            'total_staff': total_staff,
            'total_classes': len(classes),
            'academic_average': academic_average
        },
        'needs_attention': {
            'unsubmitted_registers_count': len(unsubmitted_registers),
            'unsubmitted_registers': unsubmitted_registers,
            'results_awaiting_approval_count': len(results_awaiting_approval),
            'results_awaiting_approval': results_awaiting_approval,
            'open_review_cases_count': open_review_cases_count,
            'open_review_cases': open_review_cases
        },
        'class_comparison': class_rows,
        'subject_averages': subject_rows,
        'gender_performance': {
            'boys_average': boys_avg,
            'boys_count': len(boys_scores),
            'girls_average': girls_avg,
            'girls_count': len(girls_scores),
            'difference': gender_diff,
            'note': gender_note
        }
    }

    return Response(payload)
