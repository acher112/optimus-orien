"""Academic Quality Index (AQI) & Examination Calculation API Views.

Implements all 5 levels of the AQI hierarchy with strict server-side scoping:
- Level 1: School-wide Overview (organisation_admin / superuser only; others -> 404)
- Level 2: Campus Dashboard (organisation_admin / campus principal / school_admin; others -> 404)
- Level 3: Class Dashboard (admin / principal / class teacher; others -> 404)
- Level 4: Subject Dashboard (admin / principal / class teacher / subject teacher; others -> 404)
- Level 5: Student Profile (authorized staff / own student / own parent; others -> 404)

Also handles:
- "Explain this number" Drawer traces
- Exam structure & term configuration
- Quick marks-entry grid
- Scoped universal exports (CSV, Excel, PDF)
"""
import hashlib
import json
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    School, SchoolClass, Subject, AcademicYear, Student, Enrollment, User,
    Assessment, Grade, TeachingAssignment, ClassTeacherAssignment,
    ExamStructure, ExamStructureVersion, ExamTerm, TermSubjectMax,
    AssessmentExemption, SubjectResult, StudentOverallResult, PublishedResult,
    Section, ClassSubject
)
from core.services.aqi_scope import aqi_scope, AQIScope
from core.services.aqi_engine import (
    get_school_wide_aqi, get_campus_aqi, get_class_aqi, get_subject_aqi,
    get_student_aqi_profile, get_trace_explanation, round_display, to_decimal,
    D_ZERO, D_HUNDRED
)
from core.services.audit import record_event
from core.services.exports import export_response


# ---------------------------------------------------------------------------
# Level 1: School-wide Consolidated Overview
# ---------------------------------------------------------------------------
@api_view(['GET'])
def aqi_overview(request):
    """Level 1: School-wide AQI Overview across all campuses.

    Strictly restricted to Organisation Admin and Superusers. All other roles -> 404.
    """
    scope = aqi_scope(request.user)
    scope.check_level(1)

    academic_year_id = request.query_params.get('academic_year')
    data = get_school_wide_aqi(
        scope,
        academic_year_id=int(academic_year_id) if academic_year_id else None
    )
    return Response(data)


# ---------------------------------------------------------------------------
# Level 2: Campus Dashboard
# ---------------------------------------------------------------------------
@api_view(['GET'])
def aqi_campus(request, school_id):
    """Level 2: Campus AQI Dashboard.

    Permitted for Organisation Admin and Principal/Campus Admin of this campus.
    Other campuses or unauthorized roles -> 404.
    """
    scope = aqi_scope(request.user)
    scope.check_level(2)

    academic_year_id = request.query_params.get('academic_year')
    data = get_campus_aqi(
        scope,
        school_id=school_id,
        academic_year_id=int(academic_year_id) if academic_year_id else None
    )
    return Response(data)


# ---------------------------------------------------------------------------
# Level 3: Class Dashboard
# ---------------------------------------------------------------------------
@api_view(['GET'])
def aqi_class(request, class_id):
    """Level 3: Class AQI Dashboard.

    Permitted for Admin, Principal, and the assigned Class Teacher.
    Other classes or unauthorized roles -> 404.
    """
    scope = aqi_scope(request.user)
    scope.check_level(3)

    academic_year_id = request.query_params.get('academic_year')
    data = get_class_aqi(
        scope,
        class_id=class_id,
        academic_year_id=int(academic_year_id) if academic_year_id else None
    )
    return Response(data)


# ---------------------------------------------------------------------------
# Level 4: Subject Dashboard
# ---------------------------------------------------------------------------
@api_view(['GET'])
def aqi_subject(request, class_id, subject_id):
    """Level 4: Subject AQI Dashboard.

    Permitted for Admin, Principal, Class Teacher, and assigned Subject Teacher.
    Other subjects/classes -> 404.
    """
    scope = aqi_scope(request.user)
    scope.check_level(4)

    academic_year_id = request.query_params.get('academic_year')
    data = get_subject_aqi(
        scope,
        class_id=class_id,
        subject_id=subject_id,
        academic_year_id=int(academic_year_id) if academic_year_id else None
    )
    return Response(data)


# ---------------------------------------------------------------------------
# Level 5: Student Profile
# ---------------------------------------------------------------------------
@api_view(['GET'])
def aqi_student(request, student_id):
    """Level 5: Student Academic Profile.

    Permitted for authorized staff, the student themselves, or their parent.
    Other students -> 404.
    """
    scope = aqi_scope(request.user)
    scope.check_level(5)

    academic_year_id = request.query_params.get('academic_year')
    data = get_student_aqi_profile(
        scope,
        student_id=student_id,
        academic_year_id=int(academic_year_id) if academic_year_id else None
    )
    return Response(data)


@api_view(['GET'])
def aqi_my_profile(request):
    """Convenience landing endpoint for Student or Parent roles to view their profile."""
    scope = aqi_scope(request.user)
    scope.check_level(5)

    if scope.role == 'student':
        student = Student.objects.filter(user=request.user).first()
        if not student:
            raise NotFound("Student profile not found.")
        data = get_student_aqi_profile(scope, student.id)
        return Response(data)

    if scope.role == 'parent':
        req_student_id = request.query_params.get('student_id')
        if req_student_id:
            target_id = int(req_student_id)
        else:
            first_ward = request.user.wards.first()
            if not first_ward:
                raise NotFound("No linked students found.")
            target_id = first_ward.id

        data = get_student_aqi_profile(scope, target_id)
        # Include list of all wards for child selector tabs
        data['all_wards'] = [
            {'id': w.id, 'name': w.full_name, 'admission_number': w.admission_number}
            for w in request.user.wards.all()
        ]
        return Response(data)

    raise NotFound("This endpoint is intended for student and parent users.")


# ---------------------------------------------------------------------------
# Explain Trace Endpoint
# ---------------------------------------------------------------------------
@api_view(['GET'])
def aqi_explain(request):
    """Provides transparent step-by-step arithmetic traces for the Explain Drawer."""
    scope = aqi_scope(request.user)
    trace_type = request.query_params.get('type')
    if not trace_type:
        raise ValidationError("Query parameter 'type' is required.")

    class_id = request.query_params.get('class_id')
    subject_id = request.query_params.get('subject_id')
    student_id = request.query_params.get('student_id')

    data = get_trace_explanation(
        scope,
        trace_type=trace_type,
        class_id=int(class_id) if class_id else None,
        subject_id=int(subject_id) if subject_id else None,
        student_id=int(student_id) if student_id else None
    )
    return Response(data)


# ---------------------------------------------------------------------------
# Exam Structure Setup & Management
# ---------------------------------------------------------------------------
@api_view(['GET', 'POST'])
def aqi_structures(request):
    """List or create ExamStructures scoped to user's campus permissions."""
    scope = aqi_scope(request.user)

    if request.method == 'GET':
        qs = ExamStructure.objects.filter(school_id__in=scope.school_ids).prefetch_related('terms', 'classes')
        campus_id = request.query_params.get('campus')
        if campus_id:
            cid = scope.check_school(int(campus_id))
            qs = qs.filter(school_id=cid)

        results = []
        for s in qs:
            results.append({
                'id': s.id,
                'name': s.name,
                'school_id': s.school_id,
                'school_name': s.school.name,
                'academic_year_id': s.academic_year_id,
                'academic_year_name': s.academic_year.name if s.academic_year else '',
                'reporting_scale': round_display(s.reporting_scale),
                'pass_percentage': round_display(s.pass_percentage),
                'status': s.status,
                'version': s.version,
                'published_at': s.published_at,
                'classes': [{'id': c.id, 'name': c.name} for c in s.classes.all()],
                'terms': [
                    {
                        'id': t.id,
                        'name': t.name,
                        'order': t.order,
                        'contribution': round_display(t.contribution)
                    } for t in s.terms.all().order_by('order', 'id')
                ]
            })
        return Response(results)

    if request.method == 'POST':
        if scope.role not in ('organisation_admin', 'school_admin', 'principal') and not scope.is_superuser:
            raise PermissionDenied("Only administrators and principals can create examination structures.")

        data = request.data
        school_id = data.get('school_id') or data.get('school')
        if not school_id:
            school_id = request.user.school_id
        sid = scope.check_school(school_id)
        school = School.objects.get(id=sid)

        name = data.get('name')
        if not name:
            raise ValidationError({'name': 'Structure name is required.'})

        ay_id = data.get('academic_year_id') or data.get('academic_year')
        academic_year = AcademicYear.objects.filter(id=ay_id).first() if ay_id else None

        reporting_scale = to_decimal(data.get('reporting_scale') or 100)
        pass_percentage = to_decimal(data.get('pass_percentage') or 40)

        with transaction.atomic():
            struct = ExamStructure.objects.create(
                organisation=school.organisation,
                school=school,
                academic_year=academic_year,
                name=name,
                reporting_scale=reporting_scale,
                pass_percentage=pass_percentage,
                created_by=request.user,
                updated_by=request.user
            )

            # Assign classes
            class_ids = data.get('class_ids', [])
            if class_ids:
                classes = SchoolClass.objects.filter(id__in=class_ids, school=school)
                struct.classes.set(classes)

            # Initial terms if provided
            terms_data = data.get('terms', [])
            for idx, t in enumerate(terms_data, start=1):
                ExamTerm.objects.create(
                    structure=struct,
                    name=t.get('name', f"Term {idx}"),
                    order=t.get('order', idx),
                    contribution=to_decimal(t.get('contribution', 0))
                )

            record_event(
                actor=request.user,
                action='create',
                obj=struct
            )

        return Response({'id': struct.id, 'name': struct.name, 'status': struct.status}, status=201)


@api_view(['GET', 'PUT', 'DELETE'])
def aqi_structure_detail(request, pk):
    """Retrieve, update, or archive an ExamStructure."""
    scope = aqi_scope(request.user)
    try:
        struct = ExamStructure.objects.prefetch_related('terms', 'classes').get(pk=pk)
    except ExamStructure.DoesNotExist:
        raise NotFound("Exam structure not found.")

    scope.check_school(struct.school_id)

    if request.method == 'GET':
        terms = []
        for t in struct.terms.all().order_by('order', 'id'):
            max_marks_list = [
                {'subject_id': m.subject_id, 'subject_name': m.subject.name, 'max_marks': round_display(m.max_marks)}
                for m in t.subject_maxes.all().select_related('subject')
            ]
            terms.append({
                'id': t.id,
                'name': t.name,
                'order': t.order,
                'contribution': round_display(t.contribution),
                'max_marks_overrides': max_marks_list
            })

        return Response({
            'id': struct.id,
            'name': struct.name,
            'school_id': struct.school_id,
            'school_name': struct.school.name,
            'academic_year_id': struct.academic_year_id,
            'reporting_scale': round_display(struct.reporting_scale),
            'pass_percentage': round_display(struct.pass_percentage),
            'status': struct.status,
            'version': struct.version,
            'published_at': struct.published_at,
            'classes': [{'id': c.id, 'name': c.name} for c in struct.classes.all()],
            'terms': terms
        })

    if scope.role not in ('organisation_admin', 'school_admin', 'principal') and not scope.is_superuser:
        raise PermissionDenied("Only administrators and principals can modify examination structures.")

    if struct.status == 'locked':
        raise ValidationError("Locked structures cannot be modified.")

    if request.method == 'PUT':
        data = request.data
        if 'name' in data:
            struct.name = data['name']
        if 'reporting_scale' in data:
            struct.reporting_scale = to_decimal(data['reporting_scale'])
        if 'pass_percentage' in data:
            struct.pass_percentage = to_decimal(data['pass_percentage'])
        if 'class_ids' in data:
            classes = SchoolClass.objects.filter(id__in=data['class_ids'], school=struct.school)
            struct.classes.set(classes)

        struct.updated_by = request.user
        struct.save()

        record_event(actor=request.user, action='update', obj=struct)
        return Response({'message': 'Exam structure updated.'})

    if request.method == 'DELETE':
        struct.status = 'locked'
        struct.save()
        record_event(actor=request.user, action='archive', obj=struct)
        return Response({'message': 'Exam structure locked/archived.'})


@api_view(['POST'])
def aqi_structure_publish(request, pk):
    """Validates and publishes an ExamStructure, freezing an immutable ExamStructureVersion snapshot."""
    scope = aqi_scope(request.user)
    try:
        struct = ExamStructure.objects.prefetch_related('terms', 'classes').get(pk=pk)
    except ExamStructure.DoesNotExist:
        raise NotFound("Exam structure not found.")

    scope.check_school(struct.school_id)

    if scope.role not in ('organisation_admin', 'school_admin', 'principal') and not scope.is_superuser:
        raise PermissionDenied("Only administrators and principals can publish examination structures.")

    terms = list(struct.terms.all())
    if not terms:
        raise ValidationError("Cannot publish an examination structure without at least one term.")

    # Validation: Contributions must sum exactly to 100.00%
    total_contribution = sum([t.contribution for t in terms], D_ZERO)
    if abs(total_contribution - D_HUNDRED) > Decimal('0.001'):
        raise ValidationError(
            f"Term contributions must sum exactly to 100.00%. Current total: {total_contribution:.2f}%."
        )

    # Validation: All terms must have contribution > 0
    for t in terms:
        if t.contribution <= D_ZERO:
            raise ValidationError(f"Term '{t.name}' must have contribution > 0%.")

    with transaction.atomic():
        new_version_num = struct.version + 1 if struct.status == 'published' else 1

        # Build snapshot data
        snapshot_terms = []
        for t in terms:
            max_overrides = {
                str(m.subject_id): str(m.max_marks)
                for m in t.subject_maxes.all()
            }
            snapshot_terms.append({
                'id': t.id,
                'name': t.name,
                'order': t.order,
                'contribution': str(t.contribution),
                'max_marks_overrides': max_overrides
            })

        snapshot_data = {
            'structure_id': struct.id,
            'name': struct.name,
            'school_id': struct.school_id,
            'academic_year_id': struct.academic_year_id,
            'reporting_scale': str(struct.reporting_scale),
            'pass_percentage': str(struct.pass_percentage),
            'classes': list(struct.classes.values_list('id', flat=True)),
            'terms': snapshot_terms
        }

        snapshot_json = json.dumps(snapshot_data, sort_keys=True)
        hash_val = hashlib.sha256(snapshot_json.encode('utf-8')).hexdigest()

        version_obj = ExamStructureVersion.objects.create(
            structure=struct,
            version_number=new_version_num,
            snapshot=snapshot_data,
            snapshot_hash=hash_val,
            published_by=request.user
        )

        struct.status = 'published'
        struct.version = new_version_num
        struct.published_at = timezone.now()
        struct.updated_by = request.user
        struct.save()

        record_event(
            actor=request.user,
            action='publish',
            obj=struct
        )

    return Response({
        'message': f"Exam structure published successfully as version {new_version_num}.",
        'version': new_version_num,
        'snapshot_hash': hash_val
    })


@api_view(['POST'])
def aqi_structure_terms(request, pk):
    """Add a term to an exam structure."""
    scope = aqi_scope(request.user)
    try:
        struct = ExamStructure.objects.get(pk=pk)
    except ExamStructure.DoesNotExist:
        raise NotFound("Exam structure not found.")

    scope.check_school(struct.school_id)
    if scope.role not in ('organisation_admin', 'school_admin', 'principal') and not scope.is_superuser:
        raise PermissionDenied("Only administrators and principals can add terms.")

    data = request.data
    name = data.get('name')
    if not name:
        raise ValidationError({'name': 'Term name is required.'})

    contribution = to_decimal(data.get('contribution', 0))
    order = int(data.get('order', struct.terms.count() + 1))

    term = ExamTerm.objects.create(
        structure=struct,
        name=name,
        order=order,
        contribution=contribution
    )

    return Response({
        'id': term.id,
        'name': term.name,
        'order': term.order,
        'contribution': round_display(term.contribution)
    }, status=201)


@api_view(['PUT', 'DELETE'])
def aqi_term_detail(request, pk):
    """Update or delete an individual ExamTerm."""
    scope = aqi_scope(request.user)
    try:
        term = ExamTerm.objects.select_related('structure').get(pk=pk)
    except ExamTerm.DoesNotExist:
        raise NotFound("Term not found.")

    scope.check_school(term.structure.school_id)
    if scope.role not in ('organisation_admin', 'school_admin', 'principal') and not scope.is_superuser:
        raise PermissionDenied("Only administrators and principals can modify terms.")

    if term.structure.status == 'locked':
        raise ValidationError("Locked structures cannot be modified.")

    if request.method == 'PUT':
        data = request.data
        if 'name' in data:
            term.name = data['name']
        if 'contribution' in data:
            term.contribution = to_decimal(data['contribution'])
        if 'order' in data:
            term.order = int(data['order'])
        term.save()
        return Response({'message': 'Term updated.'})

    if request.method == 'DELETE':
        term.delete()
        return Response({'message': 'Term deleted.'})


# ---------------------------------------------------------------------------
# Marks Entry Grid (Quick Grading)
# ---------------------------------------------------------------------------
@api_view(['GET', 'POST'])
def aqi_marks_grid(request):
    """Read and bulk-save student examination marks by (class, subject, exam_term)."""
    scope = aqi_scope(request.user)

    if request.method == 'GET':
        class_id = request.query_params.get('class_id')
        subject_id = request.query_params.get('subject_id')
        term_id = request.query_params.get('term_id')

        if not class_id or not subject_id or not term_id:
            raise ValidationError("class_id, subject_id, and term_id are required.")

        cid, sid = scope.check_subject(int(class_id), int(subject_id))
        school_class = SchoolClass.objects.select_related('school').get(id=cid)
        subject = Subject.objects.get(id=sid)

        try:
            term = ExamTerm.objects.select_related('structure').get(id=int(term_id))
        except ExamTerm.DoesNotExist:
            raise NotFound("Exam term not found.")

        # Resolve maximum marks for this term and subject
        max_obj = TermSubjectMax.objects.filter(term=term, subject=subject).first()
        max_marks = max_obj.max_marks if max_obj else Decimal('100.00')

        # Find or create Assessment for this class, subject, and term
        assessment, _ = Assessment.objects.get_or_create(
            school_class=school_class,
            subject=subject,
            exam_term=term,
            defaults={
                'title': f"{term.name} - {subject.name}",
                'date': timezone.now().date(),
                'max_marks': max_marks,
                'weight': term.contribution,
                'published': True,
                'created_by': request.user
            }
        )

        enrollments = list(
            Enrollment.objects.filter(
                school_class=school_class,
                end_date__isnull=True
            ).select_related('student', 'section').order_by('student__first_name', 'student__last_name')
        )

        # Map existing grades
        grades_map = {
            g.student_id: g
            for g in Grade.objects.filter(assessment=assessment)
        }

        students_data = []
        for enr in enrollments:
            st = enr.student
            grade = grades_map.get(st.id)

            is_exempt = AssessmentExemption.objects.filter(
                enrollment=enr,
                subject=subject
            ).filter(models_q_exempt := (AssessmentExemption.objects.filter(term=term) | AssessmentExemption.objects.filter(term__isnull=True))).exists() if False else False

            sec_name = enr.section.name if (enr.section_id and enr.section) else school_class.section
            students_data.append({
                'student_id': st.id,
                'student_name': st.full_name,
                'admission_number': st.admission_number,
                'gender': st.gender,
                'section_name': sec_name or '',
                'marks': round_display(grade.marks) if (grade and grade.marks is not None) else None,
                'result_status': grade.result_status if grade else 'missing'
            })

        return Response({
            'class_id': school_class.id,
            'class_name': school_class.name,
            'subject_id': subject.id,
            'subject_name': subject.name,
            'term_id': term.id,
            'term_name': term.name,
            'max_marks': round_display(max_marks),
            'contribution_percentage': round_display(term.contribution),
            'students': students_data
        })

    if request.method == 'POST':
        data = request.data
        class_id = data.get('class_id')
        subject_id = data.get('subject_id')
        term_id = data.get('term_id')
        entries = data.get('entries', [])

        if not class_id or not subject_id or not term_id:
            raise ValidationError("class_id, subject_id, and term_id are required.")

        cid, sid = scope.check_subject(int(class_id), int(subject_id))
        school_class = SchoolClass.objects.select_related('school').get(id=cid)
        subject = Subject.objects.get(id=sid)

        try:
            term = ExamTerm.objects.select_related('structure').get(id=int(term_id))
        except ExamTerm.DoesNotExist:
            raise NotFound("Exam term not found.")

        max_obj = TermSubjectMax.objects.filter(term=term, subject=subject).first()
        max_marks = max_obj.max_marks if max_obj else Decimal('100.00')

        assessment, _ = Assessment.objects.get_or_create(
            school_class=school_class,
            subject=subject,
            exam_term=term,
            defaults={
                'title': f"{term.name} - {subject.name}",
                'date': timezone.now().date(),
                'max_marks': max_marks,
                'weight': term.contribution,
                'published': True,
                'created_by': request.user
            }
        )

        saved_count = 0
        with transaction.atomic():
            for entry in entries:
                student_id = entry.get('student_id')
                raw_marks = entry.get('marks')
                status = entry.get('result_status', 'recorded')

                if raw_marks is None or raw_marks == '':
                    obt_marks = None
                    if status == 'recorded':
                        status = 'missing'
                else:
                    obt_marks = to_decimal(raw_marks)
                    if obt_marks < D_ZERO:
                        raise ValidationError(f"Student ID {student_id}: Marks cannot be negative.")
                    if obt_marks > max_marks:
                        raise ValidationError(
                            f"Student ID {student_id}: Marks ({obt_marks}) exceed maximum allowed ({max_marks})."
                        )
                    status = 'recorded'

                Grade.objects.update_or_create(
                    assessment=assessment,
                    student_id=student_id,
                    defaults={
                        'marks': obt_marks,
                        'result_status': status,
                        'recorded_by': request.user
                    }
                )
                saved_count += 1

            record_event(
                actor=request.user,
                action='update',
                obj=assessment
            )

        return Response({
            'message': f"Saved marks for {saved_count} students successfully.",
            'saved_count': saved_count
        })


from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.decorators import api_view, renderer_classes

class CSVExportRenderer(BaseRenderer):
    media_type = 'text/csv'
    format = 'csv'
    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data

class ExcelExportRenderer(BaseRenderer):
    media_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    format = 'xlsx'
    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data

class PDFExportRenderer(BaseRenderer):
    media_type = 'application/pdf'
    format = 'pdf'
    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


# ---------------------------------------------------------------------------
# Scoped Universal Export (CSV, XLSX, PDF)
# ---------------------------------------------------------------------------
@api_view(['GET'])
@renderer_classes([CSVExportRenderer, ExcelExportRenderer, PDFExportRenderer, JSONRenderer])
def aqi_export(request):
    """Scoped universal export for AQI data at any hierarchy level."""
    scope = aqi_scope(request.user)
    level = request.query_params.get('level', '1')
    fmt = request.query_params.get('format') or request.query_params.get('export_format', 'csv')
    fmt = fmt.lower()

    if level == '1':
        scope.check_level(1)
        data = get_school_wide_aqi(scope)
        columns = [
            {'key': 'campus_name', 'label': 'Campus Name'},
            {'key': 'class_weighted_average', 'label': 'Class-Weighted Avg %'},
            {'key': 'student_weighted_average', 'label': 'Student-Weighted Avg %'},
            {'key': 'difference_from_school_display', 'label': 'Diff from School Avg'},
            {'key': 'active_classes', 'label': 'Active Classes'},
            {'key': 'total_students', 'label': 'Total Students'},
            {'key': 'gender_gap_pp', 'label': 'Gender Gap (pp)'}
        ]
        rows = data['campuses']
        filename = 'aqi-school-wide-overview'
        title = 'Academic Quality Index — School-wide Consolidated Overview'

    elif level == '2':
        scope.check_level(2)
        school_id = request.query_params.get('school_id') or request.user.school_id
        if not school_id:
            raise ValidationError("school_id is required.")
        data = get_campus_aqi(scope, int(school_id))
        columns = [
            {'key': 'class_name', 'label': 'Class'},
            {'key': 'sections', 'label': 'Sections'},
            {'key': 'total_students', 'label': 'Students'},
            {'key': 'class_average', 'label': 'Class Average %'},
            {'key': 'difference_from_campus_display', 'label': 'Diff from Campus Avg'},
            {'key': 'coverage', 'label': 'Coverage %'},
            {'key': 'gender_gap_pp', 'label': 'Gender Gap (pp)'}
        ]
        rows = data['classes']
        filename = f"aqi-campus-{school_id}"
        title = f"Academic Quality Index — {data['campus_name']} Campus Dashboard"

    elif level == '3':
        scope.check_level(3)
        class_id = request.query_params.get('class_id')
        if not class_id:
            raise ValidationError("class_id is required.")
        data = get_class_aqi(scope, int(class_id))
        columns = [
            {'key': 'subject_name', 'label': 'Subject'},
            {'key': 'average_percentage', 'label': 'Average %'},
            {'key': 'boys_average', 'label': 'Boys Average %'},
            {'key': 'girls_average', 'label': 'Girls Average %'},
            {'key': 'gender_gap_pp', 'label': 'Gender Gap (pp)'},
            {'key': 'eligible_students_count', 'label': 'Assessed Students'},
            {'key': 'status', 'label': 'Status'}
        ]
        rows = data['subjects']
        filename = f"aqi-class-{class_id}"
        title = f"Academic Quality Index — {data['class_name']}"

    elif level == '4':
        scope.check_level(4)
        class_id = request.query_params.get('class_id')
        subject_id = request.query_params.get('subject_id')
        if not class_id or not subject_id:
            raise ValidationError("class_id and subject_id are required.")
        data = get_subject_aqi(scope, int(class_id), int(subject_id))
        columns = [
            {'key': 'student_name', 'label': 'Student Name'},
            {'key': 'admission_number', 'label': 'Admission No'},
            {'key': 'gender', 'label': 'Gender'},
            {'key': 'section_name', 'label': 'Section'},
            {'key': 'final_percentage', 'label': 'Final %'},
            {'key': 'scaled_marks', 'label': 'Scaled Marks'},
            {'key': 'difference_display', 'label': 'Diff from Subject Avg'},
            {'key': 'status', 'label': 'Status'}
        ]
        rows = data['students']
        filename = f"aqi-class-{class_id}-subject-{subject_id}"
        title = f"Academic Quality Index — {data['class_name']} — {data['subject_name']}"

    elif level == '5':
        scope.check_level(5)
        student_id = request.query_params.get('student_id')
        if not student_id:
            raise ValidationError("student_id is required.")
        data = get_student_aqi_profile(scope, int(student_id))
        columns = [
            {'key': 'subject_name', 'label': 'Subject'},
            {'key': 'final_percentage', 'label': 'Final Subject %'},
            {'key': 'scaled_marks', 'label': 'Scaled Marks'},
            {'key': 'class_subject_average', 'label': 'Class Subject Avg %'},
            {'key': 'difference_display', 'label': 'Diff (pp)'},
            {'key': 'status', 'label': 'Status'}
        ]
        rows = data.get('subjects', [])
        filename = f"aqi-student-{student_id}"
        title = f"Academic Quality Profile — {data['student_name']} ({data['admission_number']})"

    else:
        raise ValidationError(f"Invalid level: {level}")

    return export_response(
        request=request,
        filename=filename,
        title=title,
        columns=columns,
        rows=rows,
        fmt=fmt,
        meta={'level': level, 'format': fmt}
    )
