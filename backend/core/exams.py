"""Examinations module: sessions, date sheets with clash detection, mark-entry grid,
grading scales, moderator publishing, results matrix, mark corrections, and student report cards.
"""
from datetime import datetime, date, time, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Q, Sum, Avg
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    School, SchoolClass, Subject, AcademicYear, Student, Enrollment, StaffMember,
    Assessment, Grade, Attendance,
    ExamSession, AssessmentCategory, GradingScale, GradeBand, ExamPaper, ExamMarkCorrection, User
)
from core.services.access import schools_scope
from core.services.audit import record_event

MANAGERS = ('organisation_admin', 'school_admin', 'principal')


def _require_manager(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if not user.is_superuser and user.role not in MANAGERS:
        raise PermissionDenied('Examination management requires administrator or principal role')


def _money_decimal(val, max_v=Decimal('1000.00'), min_v=Decimal('0.00')):
    try:
        d = Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValidationError({'marks': 'Enter a valid decimal number.'})
    if d < min_v or d > max_v:
        raise ValidationError({'marks': f'Must be between {min_v} and {max_v}.'})
    return d


def _calculate_grade_band(school, percentage):
    """Maps a percentage to a GradeBand from the school default scale or standard fallback."""
    scale = GradingScale.objects.filter(school=school, is_default=True).first()
    if not scale:
        scale = GradingScale.objects.filter(school=school).first()

    if scale:
        band = GradeBand.objects.filter(
            grading_scale=scale,
            min_percent__lte=percentage,
            max_percent__gte=percentage
        ).order_by('-min_percent').first()
        if band:
            return {'letter': band.letter, 'grade_point': str(band.grade_point), 'description': band.description}

    # Standard fallback
    p = float(percentage)
    if p >= 90:
        return {'letter': 'A+', 'grade_point': '4.00', 'description': 'Outstanding'}
    if p >= 80:
        return {'letter': 'A', 'grade_point': '3.70', 'description': 'Excellent'}
    if p >= 70:
        return {'letter': 'B', 'grade_point': '3.00', 'description': 'Good'}
    if p >= 60:
        return {'letter': 'C', 'grade_point': '2.00', 'description': 'Satisfactory'}
    if p >= 50:
        return {'letter': 'D', 'grade_point': '1.00', 'description': 'Pass'}
    return {'letter': 'F', 'grade_point': '0.00', 'description': 'Fail'}


# ------------------------------------------------------------------ Exam Sessions
@api_view(['GET', 'POST'])
def exam_sessions(request):
    user = request.user
    _require_manager(user)

    if request.method == 'GET':
        qs = ExamSession.objects.filter(school__in=schools_scope(user)).select_related('school', 'academic_year')
        if request.query_params.get('school'):
            qs = qs.filter(school_id=request.query_params['school'])
        if request.query_params.get('status'):
            qs = qs.filter(status=request.query_params['status'])

        results = [{
            'id': s.id,
            'name': s.name,
            'school_id': s.school_id,
            'school_name': s.school.name,
            'academic_year_id': s.academic_year_id,
            'academic_year_name': s.academic_year.name,
            'reporting_period': s.reporting_period,
            'start_date': str(s.start_date),
            'end_date': str(s.end_date),
            'status': s.status,
            'ranking_enabled': s.ranking_enabled,
            'papers_count': s.papers.count()
        } for s in qs]
        return Response({'results': results})

    # POST: create new session
    school_id = request.data.get('school') or (user.school_id if user.role != 'organisation_admin' and not user.is_superuser else None)
    school = schools_scope(user).filter(pk=school_id or 0).first()
    if not school:
        raise ValidationError({'school': 'Select a valid school campus.'})

    name = (request.data.get('name') or '').strip()[:100]
    if not name:
        raise ValidationError({'name': 'Exam session name is required.'})

    ay_id = request.data.get('academic_year')
    ay = AcademicYear.objects.filter(pk=ay_id, school=school).first()
    if not ay:
        ay = AcademicYear.objects.filter(school=school, active=True).first()
        if not ay:
            raise ValidationError({'academic_year': 'Active academic year required for campus.'})

    try:
        s_date = datetime.strptime(request.data.get('start_date', ''), '%Y-%m-%d').date()
        e_date = datetime.strptime(request.data.get('end_date', ''), '%Y-%m-%d').date()
    except (ValueError, TypeError):
        raise ValidationError({'dates': 'Valid start_date and end_date in YYYY-MM-DD required.'})

    if e_date < s_date:
        raise ValidationError({'end_date': 'End date must be on or after start date.'})

    ranking_enabled = bool(request.data.get('ranking_enabled', False))
    rep_period = (request.data.get('reporting_period') or '').strip()[:60]

    session = ExamSession.objects.create(
        school=school,
        academic_year=ay,
        name=name,
        reporting_period=rep_period,
        start_date=s_date,
        end_date=e_date,
        status='draft',
        ranking_enabled=ranking_enabled
    )
    record_event(actor=user, action='create', obj=session)

    return Response({
        'id': session.id,
        'name': session.name,
        'school_name': school.name,
        'status': session.status,
        'start_date': str(session.start_date),
        'end_date': str(session.end_date)
    }, status=201)


@api_view(['GET', 'PATCH', 'POST', 'DELETE'])
def exam_session_detail(request, pk):
    user = request.user
    _require_manager(user)

    session = ExamSession.objects.filter(pk=pk, school__in=schools_scope(user)).select_related('school', 'academic_year').first()
    if not session:
        raise NotFound()

    if request.method == 'GET':
        return Response({
            'id': session.id,
            'name': session.name,
            'school_id': session.school_id,
            'school_name': session.school.name,
            'academic_year_id': session.academic_year_id,
            'academic_year_name': session.academic_year.name,
            'reporting_period': session.reporting_period,
            'start_date': str(session.start_date),
            'end_date': str(session.end_date),
            'status': session.status,
            'ranking_enabled': session.ranking_enabled
        })

    if request.method == 'PATCH':
        if 'name' in request.data:
            session.name = str(request.data['name']).strip()[:100]
        if 'ranking_enabled' in request.data:
            session.ranking_enabled = bool(request.data['ranking_enabled'])
        if 'status' in request.data:
            st = request.data['status']
            if st in dict(ExamSession.STATUSES):
                session.status = st
        session.save()
        record_event(actor=user, action='update', obj=session)
    if request.method == 'DELETE':
        with transaction.atomic():
            record_event(actor=user, action='delete', obj=session)
            session.delete()
        return Response({'success': True, 'detail': 'Exam session deleted successfully'})

    return Response({'error': 'Method not allowed'}, status=405)


@api_view(['GET', 'PATCH', 'DELETE'])
def exam_paper_detail(request, pk):
    user = request.user
    _require_manager(user)
    paper = ExamPaper.objects.filter(pk=pk).select_related('session__school', 'assessment').first()
    if not paper:
        raise NotFound()
    if paper.session.school not in schools_scope(user):
        raise PermissionDenied('Outside your authorised campus scope.')

    if request.method == 'DELETE':
        with transaction.atomic():
            if paper.assessment:
                Grade.objects.filter(assessment=paper.assessment).delete()
                paper.assessment.delete()
            record_event(actor=user, action='delete', obj=paper)
            paper.delete()
        return Response({'success': True, 'detail': 'Paper deleted successfully'})

    if request.method == 'PATCH':
        if 'room' in request.data:
            paper.room = str(request.data['room']).strip()[:40]
        if 'max_marks' in request.data:
            paper.max_marks = Decimal(str(request.data['max_marks']))
            if paper.assessment:
                paper.assessment.max_marks = paper.max_marks
                paper.assessment.save(update_fields=['max_marks'])
        paper.save()
        record_event(actor=user, action='update', obj=paper)
        return Response({'id': paper.id, 'room': paper.room, 'max_marks': str(paper.max_marks)})

    return Response({
        'id': paper.id,
        'date': str(paper.date),
        'start_time': paper.start_time.strftime('%H:%M'),
        'duration_min': paper.duration_min,
        'max_marks': str(paper.max_marks),
        'room': paper.room
    })


@api_view(['POST'])
def exam_session_publish(request, pk):
    """Moderator approval: mark session as published, making grades visible to students/parents."""
    user = request.user
    _require_manager(user)

    session = ExamSession.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not session:
        raise NotFound()

    with transaction.atomic():
        session.status = 'published'
        session.save(update_fields=['status'])

        # Publish all underlying assessments
        for paper in session.papers.select_related('assessment'):
            if paper.assessment:
                paper.assessment.published = True
                paper.assessment.save(update_fields=['published'])

        record_event(actor=user, action='publish', obj=session)

    return Response({'id': session.id, 'status': 'published'})


# ------------------------------------------------------------------ Date Sheet / Papers (With Clash Detection)
@api_view(['GET', 'POST'])
def exam_papers(request):
    user = request.user
    _require_manager(user)

    if request.method == 'GET':
        qs = ExamPaper.objects.filter(session__school__in=schools_scope(user)).select_related(
            'session', 'school_class', 'subject', 'invigilator', 'assessment'
        )
        if request.query_params.get('session'):
            qs = qs.filter(session_id=request.query_params['session'])
        if request.query_params.get('class'):
            qs = qs.filter(school_class_id=request.query_params['class'])
        if request.query_params.get('date'):
            qs = qs.filter(date=request.query_params['date'])

        results = [{
            'id': p.id,
            'session_id': p.session_id,
            'session_name': p.session.name,
            'session_status': p.session.status,
            'class_id': p.school_class_id,
            'class_name': p.school_class.name,
            'subject_id': p.subject_id,
            'subject_name': p.subject.name,
            'date': str(p.date),
            'start_time': p.start_time.strftime('%H:%M'),
            'duration_min': p.duration_min,
            'max_marks': str(p.max_marks),
            'room': p.room,
            'invigilator_id': p.invigilator_id,
            'invigilator_name': p.invigilator.full_name if p.invigilator else None,
            'assessment_id': p.assessment_id,
        } for p in qs]
        from core.services.exports import handle_export
        export_res = handle_export(
            request, results, filename='exam-date-sheet', title='Exam Date Sheet & Papers',
            columns=[
                {'key': 'session_name', 'label': 'Exam Session'},
                {'key': 'class_name', 'label': 'Class'},
                {'key': 'subject_name', 'label': 'Subject'},
                {'key': 'date', 'label': 'Date'},
                {'key': 'start_time', 'label': 'Start Time'},
                {'key': 'duration_min', 'label': 'Duration (min)'},
                {'key': 'max_marks', 'label': 'Max Marks'},
                {'key': 'room', 'label': 'Room'},
                {'key': 'invigilator_name', 'label': 'Invigilator'}
            ]
        )
        if export_res:
            return export_res
        return Response({'results': results})

    # POST: create new paper with clash check
    session_id = request.data.get('session')
    session = ExamSession.objects.filter(pk=session_id, school__in=schools_scope(user)).first()
    if not session:
        raise ValidationError({'session': 'Select a valid exam session.'})

    class_id = request.data.get('school_class')
    school_class = SchoolClass.objects.filter(pk=class_id, school=session.school).first()
    if not school_class:
        raise ValidationError({'school_class': 'Select a valid class for this campus.'})

    subject_id = request.data.get('subject')
    subject = Subject.objects.filter(pk=subject_id, school=session.school).first()
    if not subject:
        raise ValidationError({'subject': 'Select a valid subject.'})

    try:
        p_date = datetime.strptime(request.data.get('date', ''), '%Y-%m-%d').date()
    except (ValueError, TypeError):
        raise ValidationError({'date': 'Valid date in YYYY-MM-DD required.'})

    time_str = request.data.get('start_time', '09:00')
    try:
        start_t = datetime.strptime(time_str.strip(), '%H:%M').time()
    except ValueError:
        raise ValidationError({'start_time': 'Time format must be HH:MM.'})

    try:
        duration_min = int(request.data.get('duration_min', 120))
        if duration_min < 15 or duration_min > 480:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValidationError({'duration_min': 'Duration must be between 15 and 480 minutes.'})

    max_marks = _money_decimal(request.data.get('max_marks', '100.00'), max_v=Decimal('1000.00'), min_v=Decimal('1.00'))
    room = (request.data.get('room') or '').strip()[:60]

    invigilator = None
    if request.data.get('invigilator'):
        invigilator = StaffMember.objects.filter(pk=request.data['invigilator'], school=session.school).first()

    # --- CLASH DETECTION ---
    # Time overlap check: start_time to start_time + duration
    def _times_overlap(t1_start, dur1, t2_start, dur2):
        d1_start = datetime.combine(date.min, t1_start)
        d1_end = d1_start + timedelta(minutes=dur1)
        d2_start = datetime.combine(date.min, t2_start)
        d2_end = d2_start + timedelta(minutes=dur2)
        return max(d1_start, d2_start) < min(d1_end, d2_end)

    same_day_papers = ExamPaper.objects.filter(session=session, date=p_date)
    for existing in same_day_papers:
        if _times_overlap(start_t, duration_min, existing.start_time, existing.duration_min):
            # Check class clash
            if existing.school_class_id == school_class.id:
                raise ValidationError({
                    'clash': f"Class clash: {school_class.name} already has paper '{existing.subject.name}' scheduled at {existing.start_time.strftime('%H:%M')} on {p_date}."
                })
            # Check invigilator clash
            if invigilator and existing.invigilator_id == invigilator.id:
                raise ValidationError({
                    'clash': f"Invigilator clash: {invigilator.full_name} is already assigned to paper '{existing.subject.name}' in {existing.room or 'Room'} at {existing.start_time.strftime('%H:%M')}."
                })

    with transaction.atomic():
        # Create or link assessment
        assessment = Assessment.objects.create(
            school_class=school_class,
            subject=subject,
            title=f"{session.name} - {subject.name}",
            max_marks=max_marks,
            weight=Decimal('1.00'),
            date=p_date,
            published=(session.status == 'published')
        )

        paper = ExamPaper.objects.create(
            session=session,
            school_class=school_class,
            subject=subject,
            date=p_date,
            start_time=start_t,
            duration_min=duration_min,
            max_marks=max_marks,
            room=room,
            invigilator=invigilator,
            assessment=assessment
        )
        record_event(actor=user, action='create', obj=paper)

    return Response({
        'id': paper.id,
        'session_id': session.id,
        'class_name': school_class.name,
        'subject_name': subject.name,
        'date': str(paper.date),
        'start_time': paper.start_time.strftime('%H:%M'),
        'max_marks': str(paper.max_marks),
        'room': paper.room
    }, status=201)


# ------------------------------------------------------------------ Mark Entry Grid
@api_view(['GET', 'PUT'])
def exam_marks_grid(request, paper_id):
    """Bulk mark entry grid for an exam paper.

    GET: Returns enrolled students and their recorded grades/statuses.
    PUT: Updates marks and status for students in bulk. If session is published, requires corrections flow.
    """
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')

    paper = ExamPaper.objects.filter(pk=paper_id).select_related('session', 'school_class', 'subject', 'assessment').first()
    if not paper:
        raise NotFound()

    # Permission: teachers can mark their subjects/classes; managers can mark anything in their scope
    is_mgr = user.is_superuser or (user.role in MANAGERS and paper.session.school_id in schools_scope(user).values_list('id', flat=True))
    is_teacher = user.role == 'teacher' and user.school_id == paper.session.school_id
    if not is_mgr and not is_teacher:
        raise PermissionDenied('Access denied to mark sheet.')

    if request.method == 'GET':
        # Enrolled students on paper date
        enrollments = Enrollment.objects.filter(
            school_class=paper.school_class,
            start_date__lte=paper.date
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=paper.date)
        ).select_related('student').order_by('student__last_name', 'student__first_name')

        existing_grades = {}
        if paper.assessment:
            for g in Grade.objects.filter(assessment=paper.assessment):
                existing_grades[g.student_id] = g

        rows = []
        for idx, en in enumerate(enrollments, start=1):
            st = en.student
            grade = existing_grades.get(st.id)
            rows.append({
                'student_id': st.id,
                'name': st.full_name,
                'roll_number': getattr(st, 'roll_number', str(idx)),
                'admission_number': st.admission_number,
                'marks': str(grade.marks) if grade else '',
                'result_status': grade.result_status if grade else 'recorded',
                'feedback': grade.feedback if grade else '',
                'percentage': grade.percentage if grade else None
            })

        return Response({
            'paper': {
                'id': paper.id,
                'session_name': paper.session.name,
                'session_status': paper.session.status,
                'class_name': paper.school_class.name,
                'subject_name': paper.subject.name,
                'date': str(paper.date),
                'max_marks': str(paper.max_marks)
            },
            'students': rows
        })

    # PUT: Bulk update
    if paper.session.status in ('published', 'closed') and not is_mgr:
        raise PermissionDenied('Results are already published/closed. Mark changes require administrative correction.')

    entries = request.data.get('marks', [])
    if not isinstance(entries, list):
        raise ValidationError({'marks': 'Expected a list of mark objects.'})

    updated_count = 0
    with transaction.atomic():
        if not paper.assessment:
            paper.assessment = Assessment.objects.create(
                school_class=paper.school_class,
                subject=paper.subject,
                title=f"{paper.session.name} - {paper.subject.name}",
                max_marks=paper.max_marks,
                date=paper.date
            )
            paper.save(update_fields=['assessment'])

        for row in entries:
            student_id = row.get('student_id')
            student = Student.objects.filter(pk=student_id, school=paper.session.school).first()
            if not student:
                continue

            raw_marks = row.get('marks')
            res_status = row.get('result_status', 'recorded')
            if res_status not in dict(Grade.RESULT_STATUS):
                res_status = 'recorded'

            if res_status in ('absent', 'exempt', 'incomplete', 'withdrawn'):
                marks_val = Decimal('0.00')
            else:
                if raw_marks is None or str(raw_marks).strip() == '':
                    continue
                marks_val = _money_decimal(raw_marks, max_v=paper.max_marks, min_v=Decimal('0.00'))

            feedback = (row.get('feedback') or '').strip()

            grade, created = Grade.objects.get_or_create(
                assessment=paper.assessment,
                student=student,
                defaults={'marks': marks_val, 'result_status': res_status, 'feedback': feedback}
            )
            if not created:
                grade.marks = marks_val
                grade.result_status = res_status
                grade.feedback = feedback
                grade.save(update_fields=['marks', 'result_status', 'feedback'])

            updated_count += 1

        record_event(actor=user, action='update_marks', obj=paper)

    return Response({'updated': updated_count})


# ------------------------------------------------------------------ Mark Corrections
@api_view(['POST'])
def exam_corrections(request):
    """Audited mark correction for an already published grade."""
    user = request.user
    _require_manager(user)

    grade_id = request.data.get('grade')
    grade = Grade.objects.filter(pk=grade_id).select_related('assessment', 'student', 'assessment__exam_paper').first()
    if not grade:
        raise NotFound()

    reason = (request.data.get('reason') or '').strip()[:255]
    if not reason:
        raise ValidationError({'reason': 'Audit reason is required for mark correction.'})

    new_marks = _money_decimal(request.data.get('marks'), max_v=grade.assessment.max_marks, min_v=Decimal('0.00'))
    new_status = request.data.get('result_status', 'recorded')

    old_marks = grade.marks
    old_status = grade.result_status

    with transaction.atomic():
        correction = ExamMarkCorrection.objects.create(
            grade=grade,
            old_marks=old_marks,
            new_marks=new_marks,
            old_status=old_status,
            new_status=new_status,
            reason=reason,
            actor=user
        )
        grade.marks = new_marks
        grade.result_status = new_status
        grade.save(update_fields=['marks', 'result_status'])
        record_event(actor=user, action='mark_correction', obj=correction)

    return Response({
        'id': correction.id,
        'old_marks': str(old_marks),
        'new_marks': str(new_marks),
        'reason': correction.reason
    }, status=201)


# ------------------------------------------------------------------ Results Sheet & Class Matrix
@api_view(['GET'])
def exam_results_sheet(request):
    """Returns matrix of students x subjects for a class in an exam session."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')

    session_id = request.query_params.get('session')
    class_id = request.query_params.get('class')
    if not session_id or not class_id:
        raise ValidationError({'detail': 'session and class query parameters required.'})

    session = ExamSession.objects.filter(pk=session_id).select_related('school').first()
    school_class = SchoolClass.objects.filter(pk=class_id, school=session.school if session else None).first()
    if not session or not school_class:
        raise NotFound()

    papers = ExamPaper.objects.filter(session=session, school_class=school_class).select_related('subject', 'assessment')
    subjects_header = [{
        'id': p.subject_id,
        'name': p.subject.name,
        'paper_id': p.id,
        'max_marks': str(p.max_marks)
    } for p in papers]

    enrollments = Enrollment.objects.filter(
        school_class=school_class,
        start_date__lte=session.end_date
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=session.start_date)
    ).select_related('student').order_by('student__last_name', 'student__first_name')

    assessment_ids = [p.assessment_id for p in papers if p.assessment_id]
    grades_by_student_subj = {}
    for g in Grade.objects.filter(assessment_id__in=assessment_ids).select_related('assessment'):
        grades_by_student_subj[(g.student_id, g.assessment.subject_id)] = g

    student_rows = []
    for idx, en in enumerate(enrollments, start=1):
        st = en.student
        subj_scores = {}
        total_obtained = Decimal('0.00')
        total_max = Decimal('0.00')

        for p in papers:
            g = grades_by_student_subj.get((st.id, p.subject_id))
            if g and g.result_status in ('recorded', 'present'):
                subj_scores[p.subject_id] = {
                    'marks': str(g.marks),
                    'status': g.result_status,
                    'percentage': g.percentage
                }
                total_obtained += g.marks
                total_max += p.max_marks
            elif g:
                subj_scores[p.subject_id] = {
                    'marks': '0.00',
                    'status': g.result_status,
                    'percentage': 0.0
                }
                total_max += p.max_marks
            else:
                subj_scores[p.subject_id] = {'marks': '-', 'status': 'not_entered', 'percentage': None}

        overall_pct = round(float((total_obtained / total_max * 100) if total_max > Decimal('0.00') else 0.0), 1)
        grade_info = _calculate_grade_band(session.school, overall_pct)

        student_rows.append({
            'student_id': st.id,
            'name': st.full_name,
            'roll_number': getattr(st, 'roll_number', str(idx)),
            'gender': st.gender,
            'subject_scores': subj_scores,
            'total_obtained': str(total_obtained),
            'total_max': str(total_max),
            'percentage': overall_pct,
            'grade_letter': grade_info['letter'],
            'grade_point': grade_info['grade_point'],
        })

    # Optional ranking
    if session.ranking_enabled:
        sorted_by_marks = sorted(student_rows, key=lambda x: -x['percentage'])
        for rank, row in enumerate(sorted_by_marks, 1):
            row['rank'] = rank

    return Response({
        'session': {'id': session.id, 'name': session.name, 'ranking_enabled': session.ranking_enabled},
        'school_class': {'id': school_class.id, 'name': school_class.name},
        'subjects': subjects_header,
        'students': student_rows
    })


# ------------------------------------------------------------------ Student Report Card
@api_view(['GET'])
def student_report_card(request):
    """Complete transcript / report card for a single student in an exam session."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')

    student_id = request.query_params.get('student')
    session_id = request.query_params.get('session')
    if not student_id or not session_id:
        raise ValidationError({'detail': 'student and session query parameters required.'})

    student = Student.objects.filter(pk=student_id).select_related('school').first()
    session = ExamSession.objects.filter(pk=session_id).select_related('school', 'academic_year').first()
    if not student or not session:
        raise NotFound()

    # Permission check: student/parent can only view own; teachers can view student in their school; managers in scope
    if user.role == 'student' and user.id != student.user_id:
        raise PermissionDenied('Access to other student report cards is denied.')
    if user.role == 'parent' and not student.parents.filter(id=user.id).exists():
        raise PermissionDenied('Access denied.')

    enrollment = Enrollment.objects.filter(
        student=student,
        school_class__school=session.school,
        start_date__lte=session.end_date
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=session.start_date)
    ).select_related('school_class').first()

    cls = enrollment.school_class if enrollment else None

    # Get papers for that class and session
    papers = ExamPaper.objects.filter(session=session, school_class=cls).select_related('subject', 'assessment') if cls else []

    assessment_ids = [p.assessment_id for p in papers if p.assessment_id]
    grades = {g.assessment.subject_id: g for g in Grade.objects.filter(assessment_id__in=assessment_ids, student=student).select_related('assessment')}

    results = []
    total_obtained = Decimal('0.00')
    total_max = Decimal('0.00')

    for p in papers:
        g = grades.get(p.subject_id)
        if g:
            pct = g.percentage
            band = _calculate_grade_band(session.school, pct)
            results.append({
                'subject': p.subject.name,
                'max_marks': str(p.max_marks),
                'obtained_marks': str(g.marks),
                'percentage': pct,
                'status': g.result_status,
                'letter': band['letter'],
                'grade_point': band['grade_point'],
                'feedback': g.feedback
            })
            total_obtained += g.marks
            total_max += p.max_marks
        else:
            results.append({
                'subject': p.subject.name,
                'max_marks': str(p.max_marks),
                'obtained_marks': '-',
                'percentage': None,
                'status': 'not_entered',
                'letter': '-',
                'grade_point': '-',
                'feedback': ''
            })

    overall_pct = round(float((total_obtained / total_max * 100) if total_max > Decimal('0.00') else 0.0), 1)
    overall_band = _calculate_grade_band(session.school, overall_pct)

    # Attendance summary for session period
    att_qs = Attendance.objects.filter(student=student, date__gte=session.start_date, date__lte=session.end_date)
    total_days = att_qs.count()
    present_days = att_qs.filter(status='present').count()
    att_pct = round(float((present_days / total_days * 100) if total_days > 0 else 100.0), 1)

    return Response({
        'student': {
            'id': student.id,
            'name': student.full_name,
            'admission_number': student.admission_number,
            'roll_number': getattr(student, 'roll_number', ''),
            'gender': student.gender,
            'class_name': cls.name if cls else 'Unassigned'
        },
        'session': {
            'name': session.name,
            'reporting_period': session.reporting_period,
            'academic_year': session.academic_year.name,
            'school_name': session.school.name
        },
        'results': results,
        'summary': {
            'total_obtained': str(total_obtained),
            'total_max': str(total_max),
            'overall_percentage': overall_pct,
            'overall_letter': overall_band['letter'],
            'overall_gpa': overall_band['grade_point'],
            'attendance_rate': att_pct,
            'total_school_days': total_days,
            'days_present': present_days
        }
    })


# ------------------------------------------------------------------ Grading Scales CRUD
@api_view(['GET', 'POST'])
def grading_scales(request):
    user = request.user
    _require_manager(user)

    if request.method == 'GET':
        qs = GradingScale.objects.filter(school__in=schools_scope(user)).prefetch_related('bands')
        results = [{
            'id': s.id,
            'name': s.name,
            'school_id': s.school_id,
            'school_name': s.school.name,
            'is_default': s.is_default,
            'bands': [{
                'id': b.id,
                'min_percent': str(b.min_percent),
                'max_percent': str(b.max_percent),
                'letter': b.letter,
                'grade_point': str(b.grade_point),
                'description': b.description
            } for b in s.bands.all()]
        } for s in qs]
        return Response({'results': results})

    # POST create scale
    school_id = request.data.get('school') or user.school_id
    school = schools_scope(user).filter(pk=school_id or 0).first()
    if not school:
        raise ValidationError({'school': 'Valid school campus required.'})

    name = (request.data.get('name') or '').strip()[:80]
    if not name:
        raise ValidationError({'name': 'Scale name required.'})

    is_default = bool(request.data.get('is_default', False))

    with transaction.atomic():
        if is_default:
            GradingScale.objects.filter(school=school, is_default=True).update(is_default=False)

        scale = GradingScale.objects.create(school=school, name=name, is_default=is_default)
        raw_bands = request.data.get('bands', [])
        for b in raw_bands:
            GradeBand.objects.create(
                grading_scale=scale,
                min_percent=Decimal(str(b.get('min_percent', 0))),
                max_percent=Decimal(str(b.get('max_percent', 100))),
                letter=str(b.get('letter', 'P'))[:8],
                grade_point=Decimal(str(b.get('grade_point', 0.0))),
                description=str(b.get('description', ''))[:60]
            )
        record_event(actor=user, action='create', obj=scale)

    return Response({'id': scale.id, 'name': scale.name}, status=201)
