"""Teacher Portal API views for OPTIMUS ORIEN.

Provides isolated endpoints for:
- Teacher Dashboard (My Home): assignment cards, actionable tasks (registers, marks, homework),
  subject averages with coverage (missing results never treated as 0), decline indicators with
  evidence, and recent activity. Strictly isolated: no school-wide metrics, no comparison with
  other teachers (TDB-020), activity indicators separate from academic outcomes (TDB-021).
- My Class: available only to class teachers; shows full student profiles, all-subject averages,
  daily register status, and review cases for the class.
- My Subjects: cards per assigned (class, subject) with performance, coverage, and pending tasks.
- Teacher Scope: exposes assigned classes, subjects, roles, and capability flags to the frontend.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from core.models import (
    Assessment, Attendance, ClassTeacherAssignment, Enrollment, Grade,
    Homework, HomeworkSubmission, Observation, ReviewCase, SchoolClass,
    Student, Subject, TeachingAssignment
)
from core.services.access import classes_scope, schools_scope, students_scope
from core.services.teacher_scope import get_teacher_scope


def _mean(values):
    vals = [float(v) for v in values if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


@api_view(['GET'])
def teacher_dashboard(request):
    """GET /api/v1/teacher/dashboard/
    Dedicated teacher home dashboard matching Part 4 §2 and TDB-001..021.
    """
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Authentication required.')
    if user.role != 'teacher' and not user.is_superuser:
        raise PermissionDenied('Teacher dashboard requires teacher credentials.')

    scope = get_teacher_scope(user, request)
    today = timezone.localdate()

    if not scope.class_ids:
        return Response({
            'has_assignments': False,
            'message': 'You have no active teaching assignments yet — contact your principal.',
            'teacher_type': '',
            'badges': [],
            'kpis': {
                'classes': 0, 'subjects': 0, 'students': 0,
                'unsubmitted_registers': 0, 'pending_marks': 0, 'homework_to_review': 0
            },
            'assignments': [],
            'tasks': {
                'registers_to_submit': [], 'marks_to_enter': [],
                'homework_to_review': [], 'awaiting_approval': []
            },
            'subject_averages': [],
            'students_with_decline': [],
            'recent_activity': []
        })

    # 1. Assignment Cards
    assignment_cards = []
    # Class teacher cards
    for cid in sorted(scope.full_class_ids):
        sc = SchoolClass.objects.filter(pk=cid).select_related('school').first()
        if sc:
            stu_count = Enrollment.objects.filter(school_class=sc, start_date__lte=today).filter(
                Q(end_date__isnull=True) | Q(end_date__gte=today)
            ).count()
            att_done = Attendance.objects.filter(school_class=sc, date=today).exists()
            assignment_cards.append({
                'id': f"ct-{sc.id}",
                'kind': 'class_teacher',
                'role_label': f"Class teacher – {sc.display_name}",
                'class_id': sc.id,
                'class_name': sc.display_name,
                'school_id': sc.school_id,
                'school_name': sc.school.name if sc.school else '',
                'subject_id': None,
                'subject_name': 'All subjects (Homeroom)',
                'student_count': stu_count,
                'register_today': 'submitted' if att_done else 'pending'
            })

    # Subject teacher cards
    for cid, sid in sorted(scope.subject_pairs):
        sc = SchoolClass.objects.filter(pk=cid).select_related('school').first()
        subj = Subject.objects.filter(pk=sid).first()
        if sc and subj:
            stu_count = Enrollment.objects.filter(school_class=sc, start_date__lte=today).filter(
                Q(end_date__isnull=True) | Q(end_date__gte=today)
            ).count()
            assignment_cards.append({
                'id': f"st-{sc.id}-{subj.id}",
                'kind': 'subject_teacher',
                'role_label': f"Subject teacher – {subj.name}, {sc.display_name}",
                'class_id': sc.id,
                'class_name': sc.display_name,
                'school_id': sc.school_id,
                'school_name': sc.school.name if sc.school else '',
                'subject_id': subj.id,
                'subject_name': subj.name,
                'student_count': stu_count,
                'register_today': None
            })

    # 2. Actionable Tasks (activity separate from academic outcomes - TDB-021)
    # Registers to submit (only for classes where user is class teacher)
    registers_to_submit = []
    for cid in scope.full_class_ids:
        sc = SchoolClass.objects.filter(pk=cid).first()
        if sc and not Attendance.objects.filter(school_class=sc, date=today).exists():
            registers_to_submit.append({
                'class_id': sc.id,
                'class_name': sc.display_name,
                'date': today.isoformat()
            })

    # Marks to enter
    marks_to_enter = []
    my_assessments = Assessment.objects.filter(
        Q(school_class_id__in=scope.full_class_ids) |
        Q(school_class_id__in=scope.subject_class_ids, subject_id__in=scope.assigned_subject_ids) |
        Q(created_by=user)
    ).distinct().select_related('school_class', 'subject').order_by('-date')

    for a in my_assessments[:20]:
        # Count eligible enrolled students vs graded students
        elig_count = Enrollment.objects.filter(
            school_class_id=a.school_class_id,
            start_date__lte=a.date
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=a.date)).count()
        graded_count = Grade.objects.filter(assessment=a).count()
        if elig_count > 0 and graded_count < elig_count:
            marks_to_enter.append({
                'assessment_id': a.id,
                'title': a.title,
                'class_id': a.school_class_id,
                'class_name': a.school_class.display_name,
                'subject_id': a.subject_id,
                'subject_name': a.subject.name,
                'date': a.date.isoformat(),
                'missing_count': elig_count - graded_count,
                'eligible_count': elig_count,
                'graded_count': graded_count
            })

    # Homework to review
    homework_to_review = []
    pending_subs = HomeworkSubmission.objects.filter(
        homework__school_class_id__in=scope.class_ids,
        status='submitted',
        confirmed_by__isnull=True
    ).select_related('homework__school_class', 'homework__subject', 'student')
    if not user.is_superuser:
        pending_subs = pending_subs.filter(
            Q(homework__school_class_id__in=scope.full_class_ids) |
            Q(homework__school_class_id__in=scope.subject_class_ids, homework__subject_id__in=scope.assigned_subject_ids) |
            Q(homework__created_by=user)
        ).distinct()

    for sub in pending_subs[:15]:
        homework_to_review.append({
            'submission_id': sub.id,
            'homework_id': sub.homework_id,
            'title': sub.homework.title,
            'class_name': sub.homework.school_class.display_name,
            'subject_name': sub.homework.subject.name,
            'student_name': sub.student.full_name,
            'due_date': sub.homework.due_date.isoformat()
        })

    # Awaiting approval (created by teacher, graded, not published)
    awaiting_approval = []
    for a in my_assessments.filter(created_by=user, published=False)[:10]:
        if Grade.objects.filter(assessment=a).exists():
            awaiting_approval.append({
                'assessment_id': a.id,
                'title': a.title,
                'class_name': a.school_class.display_name,
                'subject_name': a.subject.name,
                'date': a.date.isoformat(),
                'grades_count': Grade.objects.filter(assessment=a).count()
            })

    # 3. Subject Averages with Coverage (missing results never treated as 0)
    subject_averages = []
    # Build list of (class_id, subject_id) pairs to calculate
    pairs_to_calc = set(scope.subject_pairs)
    # If class teacher, also include all subjects taught in full_classes
    for cid in scope.full_class_ids:
        subj_ids = Assessment.objects.filter(school_class_id=cid).values_list('subject_id', flat=True).distinct()
        for sid in subj_ids:
            pairs_to_calc.add((cid, sid))

    for cid, sid in sorted(pairs_to_calc):
        sc = SchoolClass.objects.filter(pk=cid).first()
        subj = Subject.objects.filter(pk=sid).first()
        if not sc or not subj:
            continue
        asms = Assessment.objects.filter(school_class_id=cid, subject_id=sid, published=True)
        if not asms.exists():
            # Fallback to unpublished if none published yet
            asms = Assessment.objects.filter(school_class_id=cid, subject_id=sid)
        if not asms.exists():
            continue

        # Active students in class
        active_students = list(Enrollment.objects.filter(
            school_class_id=cid, start_date__lte=today
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).values_list('student_id', flat=True).distinct())

        total_students = len(active_students)
        if total_students == 0:
            continue

        student_pcts = []
        for st_id in active_students:
            st_grades = Grade.objects.filter(assessment__in=asms, student_id=st_id)
            if st_grades.exists():
                # Weighted percentage for student
                total_weight = Decimal('0.00')
                weighted_sum = Decimal('0.00')
                for g in st_grades:
                    w = g.assessment.weight
                    p = (g.marks / g.assessment.max_marks) * Decimal('100.0')
                    weighted_sum += (p * w)
                    total_weight += w
                if total_weight > Decimal('0.00'):
                    student_pcts.append(float(weighted_sum / total_weight))

        valid_count = len(student_pcts)
        avg_score = _mean(student_pcts) if valid_count > 0 else None
        coverage_pct = round((valid_count / total_students) * 100, 1) if total_students > 0 else 0

        subject_averages.append({
            'class_id': sc.id,
            'class_name': sc.display_name,
            'subject_id': subj.id,
            'subject_name': subj.name,
            'average': avg_score,
            'valid_students': valid_count,
            'total_students': total_students,
            'coverage_pct': coverage_pct,
            'coverage_text': f"{valid_count} of {total_students} students have valid results ({coverage_pct}%)",
            'is_class_teacher': scope.is_class_teacher(sc.id),
            'teaches_subject': scope.teaches_subject(sc.id, subj.id)
        })

    # 4. Students with Academic Decline (neutral evidence, no diagnosis - INT-030/031)
    students_with_decline = []
    for cid, sid in sorted(scope.subject_pairs):
        subj_asms = list(Assessment.objects.filter(school_class_id=cid, subject_id=sid).order_by('-date', '-id')[:5])
        if len(subj_asms) >= 2:
            latest_asm = subj_asms[0]
            prior_asms = subj_asms[1:]
            for st_id in Enrollment.objects.filter(school_class_id=cid, end_date__isnull=True).values_list('student_id', flat=True):
                latest_grade = Grade.objects.filter(assessment=latest_asm, student_id=st_id).first()
                prior_grades = Grade.objects.filter(assessment__in=prior_asms, student_id=st_id)
                if latest_grade and prior_grades.exists():
                    latest_pct = latest_grade.percentage
                    prior_pcts = [g.percentage for g in prior_grades]
                    prior_avg = round(sum(prior_pcts) / len(prior_pcts), 1)
                    if prior_avg - latest_pct >= 10.0:  # 10 point drop
                        student_obj = Student.objects.filter(pk=st_id).first()
                        if student_obj:
                            students_with_decline.append({
                                'student_id': student_obj.id,
                                'student_name': student_obj.full_name,
                                'admission_number': student_obj.admission_number,
                                'gender': student_obj.gender,
                                'class_name': latest_asm.school_class.display_name,
                                'subject_name': latest_asm.subject.name,
                                'latest_score': latest_pct,
                                'prior_average': prior_avg,
                                'decline_delta': round(prior_avg - latest_pct, 1),
                                'assessment_title': latest_asm.title
                            })

    # 5. Recent Activity
    recent_activity = []
    for a in my_assessments.filter(created_by=user)[:5]:
        recent_activity.append({
            'kind': 'assessment',
            'title': f"Created assessment: {a.title} ({a.subject.name})",
            'date': a.date.isoformat(),
            'target': a.school_class.display_name
        })

    # KPIs
    unique_students_count = students_scope(user).count()
    kpis = {
        'classes': len(scope.class_ids),
        'subjects': len(scope.assigned_subject_ids),
        'students': unique_students_count,
        'unsubmitted_registers': len(registers_to_submit),
        'pending_marks': len(marks_to_enter),
        'homework_to_review': len(homework_to_review)
    }

    return Response({
        'has_assignments': True,
        'teacher_type': scope.teacher_type,
        'badges': scope.get_assignment_badges(),
        'kpis': kpis,
        'assignments': assignment_cards,
        'tasks': {
            'registers_to_submit': registers_to_submit,
            'marks_to_enter': marks_to_enter,
            'homework_to_review': homework_to_review,
            'awaiting_approval': awaiting_approval
        },
        'subject_averages': subject_averages,
        'students_with_decline': students_with_decline[:10],
        'recent_activity': recent_activity
    })


@api_view(['GET'])
def teacher_my_class(request):
    """GET /api/v1/teacher/my-class/
    Only accessible to class teachers. Shows full student profile and all-subject results.
    """
    user = request.user
    if not user.is_authenticated or user.role != 'teacher':
        raise PermissionDenied('Teacher authentication required.')

    scope = get_teacher_scope(user, request)
    if not scope.full_class_ids:
        raise PermissionDenied('My Class is accessible only to Class Teachers.')

    class_id = request.query_params.get('class_id')
    if class_id:
        try:
            cid = int(class_id)
        except ValueError:
            raise NotFound('Invalid class ID.')
        if not scope.is_class_teacher(cid):
            raise NotFound('Class not found or you are not the class teacher.')
        target_class = SchoolClass.objects.filter(pk=cid).select_related('school', 'academic_year').first()
    else:
        target_class = SchoolClass.objects.filter(pk=sorted(scope.full_class_ids)[0]).select_related('school', 'academic_year').first()

    if not target_class:
        raise NotFound('Class not found.')

    today = timezone.localdate()

    # Active enrollments
    active_enrollments = Enrollment.objects.filter(
        school_class=target_class,
        start_date__lte=today
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).select_related('student')
    students = [e.student for e in active_enrollments]

    # Attendance today
    att_today_qs = Attendance.objects.filter(school_class=target_class, date=today)
    att_today_status = 'submitted' if att_today_qs.exists() else 'pending'

    # Attendance rate overall
    total_att = Attendance.objects.filter(school_class=target_class).count()
    present_att = Attendance.objects.filter(school_class=target_class, status__in=['present', 'late']).count()
    overall_att_rate = round((present_att / total_att) * 100, 1) if total_att > 0 else None

    # All subjects for this class
    asms = Assessment.objects.filter(school_class=target_class).select_related('subject')
    subject_map = {}
    for a in asms:
        if a.subject_id not in subject_map:
            subject_map[a.subject_id] = a.subject

    # Calculate subject averages and coverage for all subjects in class
    subjects_data = []
    total_st_count = len(students)
    for sid, subj in subject_map.items():
        s_asms = [a for a in asms if a.subject_id == sid]
        st_pcts = []
        for s in students:
            st_grades = Grade.objects.filter(assessment__in=s_asms, student=s)
            if st_grades.exists():
                tot_w = Decimal('0.00')
                w_sum = Decimal('0.00')
                for g in st_grades:
                    tot_w += g.assessment.weight
                    w_sum += (g.marks / g.assessment.max_marks * Decimal('100.0')) * g.assessment.weight
                if tot_w > 0:
                    st_pcts.append(float(w_sum / tot_w))

        valid_c = len(st_pcts)
        avg_val = _mean(st_pcts) if valid_c > 0 else None
        cov_pct = round((valid_c / total_st_count) * 100, 1) if total_st_count > 0 else 0
        subjects_data.append({
            'subject_id': subj.id,
            'subject_name': subj.name,
            'code': subj.code,
            'average': avg_val,
            'valid_students': valid_c,
            'total_students': total_st_count,
            'coverage_pct': cov_pct,
            'coverage_text': f"{valid_c} of {total_st_count} students have valid results"
        })

    # Student rows with full profile (father_name, DOB, phone, etc.)
    student_rows = []
    for s in students:
        # Per-student subject marks
        st_sub_marks = {}
        for sid, subj in subject_map.items():
            s_asms = [a for a in asms if a.subject_id == sid]
            st_grades = Grade.objects.filter(assessment__in=s_asms, student=s)
            if st_grades.exists():
                tot_w = Decimal('0.00')
                w_sum = Decimal('0.00')
                for g in st_grades:
                    tot_w += g.assessment.weight
                    w_sum += (g.marks / g.assessment.max_marks * Decimal('100.0')) * g.assessment.weight
                if tot_w > 0:
                    st_sub_marks[subj.code] = round(float(w_sum / tot_w), 1)

        # Student attendance rate
        s_att_tot = Attendance.objects.filter(student=s, school_class=target_class).count()
        s_att_pres = Attendance.objects.filter(student=s, school_class=target_class, status__in=['present', 'late']).count()
        s_att_rate = round((s_att_pres / s_att_tot) * 100, 1) if s_att_tot > 0 else None

        student_rows.append({
            'id': s.id,
            'admission_number': s.admission_number,
            'first_name': s.first_name,
            'last_name': s.last_name,
            'full_name': s.full_name,
            'father_name': s.father_name,
            'mother_name': s.mother_name,
            'guardian_phone': s.guardian_phone,
            'date_of_birth': s.date_of_birth.isoformat() if s.date_of_birth else None,
            'gender': s.gender,
            'enrolled_on': s.enrolled_on.isoformat(),
            'attendance_rate': s_att_rate,
            'overall_average': _mean(st_sub_marks.values()),
            'subjects': st_sub_marks
        })

    # Review cases for this class
    review_cases = ReviewCase.objects.filter(
        student__in=students
    ).select_related('student', 'assignee').order_by('-created_at')[:10]

    return Response({
        'class_info': {
            'id': target_class.id,
            'name': target_class.name,
            'section': target_class.section,
            'display_name': target_class.display_name,
            'grade_level': target_class.grade_level,
            'academic_year': target_class.academic_year.name if target_class.academic_year else ''
        },
        'my_classes': [
            {'id': c.id, 'name': c.display_name}
            for c in SchoolClass.objects.filter(id__in=scope.full_class_ids)
        ],
        'total_students': total_st_count,
        'attendance_today': att_today_status,
        'attendance_rate': overall_att_rate,
        'subjects': subjects_data,
        'students': student_rows,
        'review_cases': [{
            'id': rc.id,
            'title': rc.title,
            'student_name': rc.student.full_name,
            'priority': rc.priority,
            'status': rc.status,
            'created_at': rc.created_at.isoformat()
        } for rc in review_cases]
    })


@api_view(['GET'])
def teacher_my_subjects(request):
    """GET /api/v1/teacher/my-subjects/
    Subject teacher view: returns cards for assigned (class × subject) pairs.
    """
    user = request.user
    if not user.is_authenticated or user.role != 'teacher':
        raise PermissionDenied('Teacher authentication required.')

    scope = get_teacher_scope(user, request)
    today = timezone.localdate()

    subject_cards = []
    for cid, sid in sorted(scope.subject_pairs):
        sc = SchoolClass.objects.filter(pk=cid).select_related('school').first()
        subj = Subject.objects.filter(pk=sid).first()
        if not sc or not subj:
            continue

        active_enrollments = list(Enrollment.objects.filter(
            school_class=sc, start_date__lte=today
        ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).values_list('student_id', flat=True))

        total_st = len(active_enrollments)
        asms = list(Assessment.objects.filter(school_class=sc, subject=subj).order_by('-date'))

        # Subject average & coverage
        st_pcts = []
        for st_id in active_enrollments:
            st_grades = Grade.objects.filter(assessment__in=asms, student_id=st_id)
            if st_grades.exists():
                tot_w = Decimal('0.00')
                w_sum = Decimal('0.00')
                for g in st_grades:
                    tot_w += g.assessment.weight
                    w_sum += (g.marks / g.assessment.max_marks * Decimal('100.0')) * g.assessment.weight
                if tot_w > 0:
                    st_pcts.append(float(w_sum / tot_w))

        valid_c = len(st_pcts)
        avg_val = _mean(st_pcts) if valid_c > 0 else None
        cov_pct = round((valid_c / total_st) * 100, 1) if total_st > 0 else 0

        # Pending marks count
        pending_marks = 0
        for a in asms:
            if a.date <= today:
                graded_c = Grade.objects.filter(assessment=a).count()
                if total_st > graded_c:
                    pending_marks += (total_st - graded_c)

        subject_cards.append({
            'class_id': sc.id,
            'class_name': sc.display_name,
            'subject_id': subj.id,
            'subject_name': subj.name,
            'code': subj.code,
            'student_count': total_st,
            'average': avg_val,
            'valid_students': valid_c,
            'coverage_pct': cov_pct,
            'coverage_text': f"{valid_c} of {total_st} students assessed ({cov_pct}%)",
            'assessments_count': len(asms),
            'pending_marks': pending_marks,
            'recent_assessments': [{
                'id': a.id,
                'title': a.title,
                'date': a.date.isoformat(),
                'max_marks': float(a.max_marks),
                'published': a.published
            } for a in asms[:5]]
        })

    return Response({
        'teacher_type': scope.teacher_type,
        'badges': scope.get_assignment_badges(),
        'cards': subject_cards
    })


@api_view(['GET'])
def teacher_scope_view(request):
    """GET /api/v1/teacher/scope/
    Provides client-side navigation and filter dropdown sources strictly scoped to the teacher.
    """
    user = request.user
    if not user.is_authenticated or user.role != 'teacher':
        raise PermissionDenied('Teacher authentication required.')

    scope = get_teacher_scope(user, request)

    classes_list = [{
        'id': c.id,
        'name': c.name,
        'section': c.section,
        'display_name': c.display_name,
        'is_class_teacher': scope.is_class_teacher(c.id)
    } for c in scope.classes_qs.select_related('school')]

    assigned_subjects = []
    for cid, sid in sorted(scope.subject_pairs):
        subj = Subject.objects.filter(pk=sid).first()
        sc = SchoolClass.objects.filter(pk=cid).first()
        if subj and sc:
            assigned_subjects.append({
                'id': subj.id,
                'name': subj.name,
                'code': subj.code,
                'class_id': sc.id,
                'class_name': sc.display_name
            })

    # Campuses where teacher has assignments or assigned school
    assigned_schools = schools_scope(user)

    return Response({
        'teacher_type': scope.teacher_type,
        'badges': scope.get_assignment_badges(),
        'classes': classes_list,
        'full_classes': [{'id': c.id, 'name': c.display_name} for c in scope.full_classes_qs],
        'subject_classes': [{'id': c.id, 'name': c.display_name} for c in scope.subject_classes_qs],
        'assigned_subjects': assigned_subjects,
        'can_view_my_class': bool(scope.full_class_ids),
        'can_view_my_subjects': bool(scope.subject_pairs),
        'can_mark_daily_attendance': bool(scope.full_class_ids),
        'can_export': getattr(getattr(user, 'organisation', None), 'teachers_can_export', True),
        'campuses': [{'id': s.id, 'name': s.name} for s in assigned_schools]
    })
