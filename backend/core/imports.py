"""CSV Import engine for bulk uploading Students, Staff, and Exam Marks.

Provides:
- Strict dry-run preview mode before any commit
- Exact column validation and duplicate detection
- Clear line-numbered error reports
- Atomic commit with complete rollback on any error
"""
import csv
import io
from datetime import datetime, date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    School, SchoolClass, AcademicYear, Student, Enrollment, StaffMember,
    ExamPaper, Grade, User
)
from core.services.access import schools_scope
from core.services.audit import record_event

MANAGERS = ('organisation_admin', 'school_admin', 'principal')


def _require_manager(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')
    if not user.is_superuser and user.role not in MANAGERS:
        raise PermissionDenied('CSV Import requires administrator permission.')


@api_view(['POST'])
def csv_import(request):
    """Processes CSV import with validation and dry-run preview support."""
    user = request.user
    _require_manager(user)

    entity_type = request.data.get('entity_type')
    if entity_type not in ('students', 'staff', 'marks'):
        raise ValidationError({'entity_type': 'entity_type must be students, staff, or marks.'})

    dry_run = str(request.data.get('dry_run', 'true')).lower() in ('true', '1')

    school_id = request.data.get('school') or user.school_id
    school = schools_scope(user).filter(pk=school_id or 0).first()
    if not school:
        raise ValidationError({'school': 'Valid school campus required.'})

    csv_content = request.data.get('csv_data')
    if not csv_content and 'file' in request.FILES:
        csv_content = request.FILES['file'].read().decode('utf-8', errors='replace')

    if not csv_content or not csv_content.strip():
        raise ValidationError({'csv_data': 'CSV content is empty.'})

    reader = csv.DictReader(io.StringIO(csv_content.strip()))
    if not reader.fieldnames:
        raise ValidationError({'csv_data': 'CSV header row is missing.'})

    # Clean header names
    fieldnames = [f.strip().lower() for f in reader.fieldnames if f]

    errors = []
    validated_rows = []

    if entity_type == 'students':
        required_cols = {'first_name', 'last_name', 'admission_number', 'date_of_birth', 'gender'}
        missing = required_cols - set(fieldnames)
        if missing:
            raise ValidationError({'headers': f"Missing required columns: {', '.join(sorted(missing))}"})

        existing_admissions = set(Student.objects.filter(school=school).values_list('admission_number', flat=True))
        seen_admissions = set()

        for idx, row in enumerate(reader, start=2):
            row_clean = {k.strip().lower(): (v.strip() if v else '') for k, v in row.items() if k}
            adm = row_clean.get('admission_number')

            if not adm:
                errors.append({'row': idx, 'column': 'admission_number', 'message': 'Admission number is required.'})
                continue

            if adm in existing_admissions:
                errors.append({'row': idx, 'column': 'admission_number', 'message': f"Admission number '{adm}' already exists in this campus."})
            if adm in seen_admissions:
                errors.append({'row': idx, 'column': 'admission_number', 'message': f"Duplicate admission number '{adm}' within CSV."})
            seen_admissions.add(adm)

            first_name = row_clean.get('first_name')
            last_name = row_clean.get('last_name')
            if not first_name or not last_name:
                errors.append({'row': idx, 'column': 'name', 'message': 'First and last name are required.'})

            dob_str = row_clean.get('date_of_birth')
            dob = None
            try:
                dob = datetime.strptime(dob_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                errors.append({'row': idx, 'column': 'date_of_birth', 'message': f"Invalid date '{dob_str}', expected YYYY-MM-DD."})

            gender = row_clean.get('gender', '').lower()
            if gender not in ('male', 'female', 'other'):
                errors.append({'row': idx, 'column': 'gender', 'message': f"Invalid gender '{gender}', expected male, female, or other."})

            validated_rows.append({
                'first_name': first_name,
                'last_name': last_name,
                'father_name': row_clean.get('father_name', ''),
                'mother_name': row_clean.get('mother_name', ''),
                'guardian_phone': row_clean.get('guardian_phone', ''),
                'admission_number': adm,
                'roll_number': row_clean.get('roll_number', ''),
                'date_of_birth': dob,
                'gender': gender,
                'class_name': row_clean.get('class', ''),
                'section': row_clean.get('section', '')
            })

    elif entity_type == 'staff':
        required_cols = {'first_name', 'last_name', 'position', 'hired_on'}
        missing = required_cols - set(fieldnames)
        if missing:
            raise ValidationError({'headers': f"Missing required columns: {', '.join(sorted(missing))}"})

        for idx, row in enumerate(reader, start=2):
            row_clean = {k.strip().lower(): (v.strip() if v else '') for k, v in row.items() if k}
            first_name = row_clean.get('first_name')
            last_name = row_clean.get('last_name')
            if not first_name or not last_name:
                errors.append({'row': idx, 'column': 'name', 'message': 'First and last name required.'})

            hired_str = row_clean.get('hired_on')
            hired = None
            try:
                hired = datetime.strptime(hired_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                errors.append({'row': idx, 'column': 'hired_on', 'message': f"Invalid date '{hired_str}', expected YYYY-MM-DD."})

            role = row_clean.get('role', 'teacher')
            if role not in ('teacher', 'principal', 'school_admin'):
                role = 'teacher'

            validated_rows.append({
                'first_name': first_name,
                'last_name': last_name,
                'position': row_clean.get('position', 'Teacher')[:120],
                'role': role,
                'email': row_clean.get('email', '')[:100],
                'phone': row_clean.get('phone', '')[:40],
                'hired_on': hired
            })

    elif entity_type == 'marks':
        paper_id = request.data.get('paper_id')
        paper = ExamPaper.objects.filter(pk=paper_id, session__school=school).select_related('session', 'school_class', 'assessment').first()
        if not paper:
            raise ValidationError({'paper_id': 'Valid exam paper required for marks import.'})

        required_cols = {'admission_number', 'marks'}
        missing = required_cols - set(fieldnames)
        if missing:
            raise ValidationError({'headers': f"Missing required columns: {', '.join(sorted(missing))}"})

        students_map = {s.admission_number: s for s in Student.objects.filter(school=school)}

        for idx, row in enumerate(reader, start=2):
            row_clean = {k.strip().lower(): (v.strip() if v else '') for k, v in row.items() if k}
            adm = row_clean.get('admission_number')
            student = students_map.get(adm)
            if not student:
                errors.append({'row': idx, 'column': 'admission_number', 'message': f"Student with admission #{adm} not found."})
                continue

            raw_marks = row_clean.get('marks')
            res_status = row_clean.get('status', 'recorded').lower()
            try:
                marks_val = Decimal(str(raw_marks)) if raw_marks else Decimal('0.00')
                if marks_val < 0 or marks_val > paper.max_marks:
                    errors.append({'row': idx, 'column': 'marks', 'message': f"Marks must be between 0 and {paper.max_marks}."})
            except InvalidOperation:
                errors.append({'row': idx, 'column': 'marks', 'message': f"Invalid marks number '{raw_marks}'."})
                marks_val = Decimal('0.00')

            validated_rows.append({
                'student': student,
                'marks': marks_val,
                'status': res_status if res_status in dict(Grade.RESULT_STATUS) else 'recorded',
                'feedback': row_clean.get('feedback', '')
            })

    # Return preview if dry_run
    if dry_run or errors:
        return Response({
            'dry_run': dry_run,
            'total_rows': len(validated_rows) + len(errors),
            'valid_rows_count': len(validated_rows),
            'errors_count': len(errors),
            'errors': errors[:50],  # cap first 50 errors
            'preview': validated_rows[:10]
        }, status=400 if (not dry_run and errors) else 200)

    # Commit execution
    created_count = 0
    with transaction.atomic():
        if entity_type == 'students':
            ay = AcademicYear.objects.filter(school=school, active=True).first()
            for r in validated_rows:
                st = Student.objects.create(
                    school=school,
                    first_name=r['first_name'],
                    last_name=r['last_name'],
                    father_name=r.get('father_name', ''),
                    mother_name=r.get('mother_name', ''),
                    guardian_phone=r.get('guardian_phone', ''),
                    admission_number=r['admission_number'],
                    date_of_birth=r['date_of_birth'],
                    gender=r['gender'],
                    enrolled_on=r.get('date_of_birth') or date.today()
                )
                if r['class_name'] and ay:
                    cls_qs = SchoolClass.objects.filter(school=school, academic_year=ay, name__iexact=r['class_name'])
                    if r.get('section'):
                        cls_qs = cls_qs.filter(section__iexact=r['section'])
                    cls = cls_qs.first()
                    if cls:
                        Enrollment.objects.create(student=st, school_class=cls, start_date=st.date_of_birth)
                record_event(actor=user, action='import_student', obj=st)
                created_count += 1

        elif entity_type == 'staff':
            for r in validated_rows:
                sm = StaffMember.objects.create(
                    school=school,
                    first_name=r['first_name'],
                    last_name=r['last_name'],
                    position=r['position'],
                    role=r['role'],
                    email=r['email'],
                    phone=r['phone'],
                    hired_on=r['hired_on'],
                    status='active'
                )
                record_event(actor=user, action='import_staff', obj=sm)
                created_count += 1

        elif entity_type == 'marks':
            for r in validated_rows:
                g, _ = Grade.objects.update_or_create(
                    assessment=paper.assessment,
                    student=r['student'],
                    defaults={
                        'marks': r['marks'],
                        'result_status': r['status'],
                        'feedback': r['feedback']
                    }
                )
                created_count += 1
            record_event(actor=user, action='import_marks', obj=paper)

    return Response({
        'status': 'committed',
        'created_count': created_count,
        'message': f"Successfully imported {created_count} {entity_type} records."
    }, status=201)
