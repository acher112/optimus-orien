"""
Data Import engine for bulk uploading School Data:
- Students
- Staff / Faculty
- Classes & Sections
- Campus Subjects
- Attendance Records
- Exam Marks
- Full School Setup (Multi-Tab Excel Workbook)

Features:
- Dual Excel (.xlsx, .xls) and CSV format support
- Tolerant column mapping: gracefully skips unmapped/extra columns (e.g., 'address', 'city') without raising errors
- Header alias resolution (e.g., 'DOB', 'Admission No', 'Student Name')
- Strict dry-run preview mode before any commit
- Atomic commit with complete rollback on errors
- Multi-sheet workbook detection and all-tabs school import
"""
import csv
import io
import re
from datetime import datetime, date
from decimal import Decimal, InvalidOperation

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from django.db import transaction
from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    School, SchoolClass, AcademicYear, Student, Enrollment, StaffMember,
    ExamPaper, Grade, User, Subject, Section, Attendance
)
from core.services.access import schools_scope
from core.services.audit import record_event

MANAGERS = ('organisation_admin', 'school_admin', 'principal', 'platform_admin')


def _require_manager(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')
    if not user.is_superuser and getattr(user, 'role', '') not in MANAGERS:
        raise PermissionDenied('Data Import requires administrator permission.')


# =============================================================================
# COLUMN ALIAS MAPPINGS & TOLERANT NORMALIZER
# =============================================================================
FIELD_ALIASES = {
    'students': {
        'first_name': ['first_name', 'firstname', 'first name', 'first'],
        'last_name': ['last_name', 'lastname', 'last name', 'surname', 'last'],
        'name': ['name', 'student_name', 'student name', 'full_name', 'fullname'],
        'admission_number': ['admission_number', 'admission_no', 'adm_no', 'admission no', 'admission num', 'admission #', 'gr_number', 'gr_no', 'gr no', 'student_id', 'id'],
        'roll_number': ['roll_number', 'roll_no', 'roll no', 'roll'],
        'date_of_birth': ['date_of_birth', 'dob', 'birth_date', 'birthdate', 'date of birth', 'birthday'],
        'gender': ['gender', 'sex'],
        'class_name': ['class_name', 'class', 'grade', 'grade_level', 'standard'],
        'section': ['section', 'sec'],
        'father_name': ['father_name', 'father', "father's name", 'father name', 'parent_name', 'guardian_name'],
        'mother_name': ['mother_name', 'mother', "mother's name", 'mother name'],
        'guardian_phone': ['guardian_phone', 'phone', 'mobile', 'contact', 'phone_number', 'cell', 'guardian phone'],
    },
    'staff': {
        'first_name': ['first_name', 'firstname', 'first name', 'first'],
        'last_name': ['last_name', 'lastname', 'last name', 'surname', 'last'],
        'name': ['name', 'staff_name', 'teacher_name', 'full_name', 'fullname'],
        'position': ['position', 'designation', 'job_title', 'title', 'role_name'],
        'role': ['role', 'system_role', 'user_role', 'access_level'],
        'email': ['email', 'email_address', 'mail'],
        'phone': ['phone', 'mobile', 'phone_number', 'contact', 'cell'],
        'hired_on': ['hired_on', 'hire_date', 'joining_date', 'start_date', 'date_of_joining'],
    },
    'classes': {
        'name': ['name', 'class_name', 'class', 'grade', 'standard'],
        'section': ['section', 'sec'],
        'grade_level': ['grade_level', 'level', 'category'],
        'curriculum': ['curriculum', 'board', 'syllabus'],
    },
    'subjects': {
        'name': ['name', 'subject_name', 'subject', 'title'],
        'code': ['code', 'subject_code', 'course_code', 'id'],
    },
    'attendance': {
        'admission_number': ['admission_number', 'admission_no', 'adm_no', 'student_id', 'roll_number', 'id'],
        'date': ['date', 'attendance_date', 'day'],
        'status': ['status', 'attendance_status', 'attendance', 'present_absent'],
        'class_name': ['class_name', 'class', 'grade'],
    },
    'marks': {
        'admission_number': ['admission_number', 'admission_no', 'adm_no', 'student_id', 'id'],
        'marks': ['marks', 'score', 'obtained_marks', 'result'],
        'status': ['status', 'result_status'],
        'feedback': ['feedback', 'remarks', 'comments', 'notes'],
    }
}


def normalize_header(header):
    """Cleans up a column header into a lowercase alphanumeric snake_case string."""
    if not header:
        return ''
    cleaned = str(header).strip().lower()
    cleaned = re.sub(r'[\s\-_#]+', '_', cleaned).strip('_')
    return cleaned


def map_row_columns(row_dict, entity_type):
    """
    Maps arbitrary incoming headers into canonical field names using alias lists.
    Identifies any extra/unmapped columns (e.g. 'address') and safely separates them.
    """
    aliases_dict = FIELD_ALIASES.get(entity_type, {})
    canonical_map = {}
    for canonical, alias_list in aliases_dict.items():
        for alias in alias_list:
            canonical_map[normalize_header(alias)] = canonical

    mapped_row = {}
    unmapped_cols = set()

    for raw_k, v in row_dict.items():
        if not raw_k:
            continue
        norm_k = normalize_header(raw_k)
        if not norm_k:
            continue

        canonical_field = canonical_map.get(norm_k)
        if canonical_field:
            mapped_row[canonical_field] = v
        else:
            unmapped_cols.add(str(raw_k).strip().lower())

    # Fallback: if 'name' exists but 'first_name'/'last_name' missing, split name
    if 'name' in mapped_row and not mapped_row.get('first_name'):
        parts = str(mapped_row['name']).strip().split(' ', 1)
        mapped_row['first_name'] = parts[0]
        mapped_row['last_name'] = parts[1] if len(parts) > 1 else '.'

    return mapped_row, unmapped_cols


def parse_date_flexible(val):
    """Converts diverse date representations into a python datetime.date or None."""
    if not val:
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val

    s = str(val).strip()
    if not s:
        return None

    # Common date formats
    for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d', '%d.%m.%Y', '%d %b %Y'):
        try:
            return datetime.strptime(s, fmt).date()
        except (ValueError, TypeError):
            continue

    # Try ISO timestamp slice
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        try:
            return datetime.strptime(s[:10], '%Y-%m-%d').date()
        except Exception:
            pass

    return None


# =============================================================================
# EXCEL / CSV EXTRACTION HELPERS
# =============================================================================
def extract_sheets_and_rows(request):
    """
    Extracts rows from either an uploaded Excel file, an uploaded CSV file,
    or pasted csv_data string. Returns (format_type, available_sheets, active_sheet_name, rows_list).
    """
    file_obj = request.FILES.get('file')
    csv_data = request.data.get('csv_data')

    if file_obj:
        filename = getattr(file_obj, 'name', '').lower()
        if filename.endswith('.xlsx') or filename.endswith('.xls') or file_obj.content_type in (
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ):
            try:
                wb = openpyxl.load_workbook(file_obj, data_only=True)
            except Exception as e:
                raise ValidationError({'file': f"Failed to parse Excel workbook: {str(e)}"})

            available_sheets = wb.sheetnames
            requested_sheet = request.data.get('sheet_name') or request.query_params.get('sheet_name')
            entity_type = request.data.get('entity_type', '')

            # Match sheet name if possible
            chosen_sheet = None
            if requested_sheet and requested_sheet in available_sheets:
                chosen_sheet = requested_sheet
            elif entity_type:
                for s in available_sheets:
                    if s.lower() == entity_type.lower() or entity_type.lower() in s.lower():
                        chosen_sheet = s
                        break

            if not chosen_sheet:
                chosen_sheet = available_sheets[0]

            sheet = wb[chosen_sheet]
            all_rows = list(sheet.iter_rows(values_only=True))
            if not all_rows:
                return 'xlsx', available_sheets, chosen_sheet, []

            # Find first non-empty row as header
            header_idx = 0
            while header_idx < len(all_rows) and not any(all_rows[header_idx]):
                header_idx += 1

            if header_idx >= len(all_rows):
                return 'xlsx', available_sheets, chosen_sheet, []

            raw_headers = [str(c).strip() if c is not None else '' for c in all_rows[header_idx]]
            data_rows = []
            for r in all_rows[header_idx + 1:]:
                if not any(r):
                    continue  # skip empty rows
                row_dict = {}
                for col_idx, val in enumerate(r):
                    if col_idx < len(raw_headers) and raw_headers[col_idx]:
                        row_dict[raw_headers[col_idx]] = val if val is not None else ''
                if any(str(v).strip() for v in row_dict.values()):
                    data_rows.append(row_dict)

            return 'xlsx', available_sheets, chosen_sheet, data_rows

        # It's an uploaded CSV file
        try:
            content = file_obj.read().decode('utf-8', errors='replace')
        except Exception as e:
            raise ValidationError({'file': f"Failed to read CSV file: {str(e)}"})
        return _parse_csv_string(content)

    if csv_data and str(csv_data).strip():
        return _parse_csv_string(str(csv_data).strip())

    raise ValidationError({'data': 'Please upload an Excel/CSV file or provide CSV text.'})


def _parse_csv_string(content):
    reader = csv.DictReader(io.StringIO(content.strip()))
    if not reader.fieldnames:
        raise ValidationError({'csv_data': 'CSV header row is missing.'})
    rows = []
    for r in reader:
        if any(str(v).strip() for v in r.values() if v is not None):
            rows.append(r)
    return 'csv', ['Sheet1'], 'Sheet1', rows


# =============================================================================
# MAIN IMPORT API VIEW
# =============================================================================
@api_view(['POST'])
def csv_import(request):
    """
    Universal bulk data import supporting Students, Staff, Classes, Subjects,
    Attendance, Exam Marks, and Full School setup via Excel (.xlsx) and CSV.
    Safely ignores unmapped/extra columns (e.g. 'address') without throwing errors.
    """
    user = request.user
    _require_manager(user)

    entity_type = request.data.get('entity_type', 'students').lower().strip()
    valid_entities = ('students', 'staff', 'classes', 'subjects', 'attendance', 'marks', 'full_school')
    if entity_type not in valid_entities:
        raise ValidationError({'entity_type': f"entity_type must be one of: {', '.join(valid_entities)}"})

    dry_run = str(request.data.get('dry_run', 'true')).lower() in ('true', '1')

    school_id = request.data.get('school') or user.school_id
    school = schools_scope(user).filter(pk=school_id or 0).first()
    if not school:
        raise ValidationError({'school': 'Valid school campus required.'})

    file_format, available_sheets, active_sheet, raw_rows = extract_sheets_and_rows(request)

    if not raw_rows:
        return Response({
            'dry_run': dry_run,
            'entity_type': entity_type,
            'file_format': file_format,
            'sheet_name': active_sheet,
            'available_sheets': available_sheets,
            'total_rows': 0,
            'valid_rows_count': 0,
            'errors_count': 0,
            'skipped_columns': [],
            'errors': [{'row': 1, 'column': 'file', 'message': 'File contains no data rows.'}],
            'preview': []
        }, status=400 if not dry_run else 200)

    # If full_school workbook requested, handle multi-sheet orchestrator
    if entity_type == 'full_school' and file_format == 'xlsx':
        return _handle_full_school_import(request, school, dry_run)

    # Process single entity type
    return _process_entity_import(
        raw_rows=raw_rows,
        entity_type=entity_type,
        school=school,
        user=user,
        dry_run=dry_run,
        request=request,
        file_format=file_format,
        available_sheets=available_sheets,
        active_sheet=active_sheet
    )


def _process_entity_import(raw_rows, entity_type, school, user, dry_run, request,
                           file_format='csv', available_sheets=None, active_sheet='Sheet1'):
    errors = []
    validated_rows = []
    all_unmapped_columns = set()

    # Active academic year for student/class linkage
    active_year = AcademicYear.objects.filter(school=school, active=True).first()

    # -------------------------------------------------------------------------
    # 1. STUDENTS
    # -------------------------------------------------------------------------
    if entity_type == 'students':
        existing_admissions = set(Student.objects.filter(school=school).values_list('admission_number', flat=True))
        seen_admissions = set()

        for idx, row in enumerate(raw_rows, start=2):
            mapped, unmapped = map_row_columns(row, 'students')
            all_unmapped_columns.update(unmapped)

            adm = str(mapped.get('admission_number', '')).strip()
            if not adm:
                errors.append({'row': idx, 'column': 'admission_number', 'message': 'Admission number is required.'})
                continue

            if adm in existing_admissions:
                errors.append({'row': idx, 'column': 'admission_number', 'message': f"Admission number '{adm}' already exists in this campus."})
            if adm in seen_admissions:
                errors.append({'row': idx, 'column': 'admission_number', 'message': f"Duplicate admission number '{adm}' in file."})
            seen_admissions.add(adm)

            first_name = str(mapped.get('first_name', '')).strip()
            last_name = str(mapped.get('last_name', '')).strip()
            if not first_name:
                errors.append({'row': idx, 'column': 'first_name', 'message': 'First name is required.'})

            # Date of Birth: graceful fallback
            dob_val = mapped.get('date_of_birth')
            dob = parse_date_flexible(dob_val)
            if dob_val and not dob:
                # If they explicitly provided an invalid date string, log warning
                errors.append({'row': idx, 'column': 'date_of_birth', 'message': f"Invalid date '{dob_val}'. Expected YYYY-MM-DD or DD/MM/YYYY."})

            gender_raw = str(mapped.get('gender', '')).strip().lower()
            if gender_raw in ('male', 'm', 'boy'):
                gender = 'male'
            elif gender_raw in ('female', 'f', 'girl'):
                gender = 'female'
            elif gender_raw in ('other', 'o'):
                gender = 'other'
            else:
                gender = 'not_recorded'

            validated_rows.append({
                'first_name': first_name,
                'last_name': last_name or '.',
                'father_name': str(mapped.get('father_name', '')).strip(),
                'mother_name': str(mapped.get('mother_name', '')).strip(),
                'guardian_phone': str(mapped.get('guardian_phone', '')).strip(),
                'admission_number': adm,
                'roll_number': str(mapped.get('roll_number', '')).strip(),
                'date_of_birth': dob,
                'gender': gender,
                'class_name': str(mapped.get('class_name', '')).strip(),
                'section': str(mapped.get('section', '')).strip()
            })

    # -------------------------------------------------------------------------
    # 2. STAFF / TEACHERS
    # -------------------------------------------------------------------------
    elif entity_type == 'staff':
        for idx, row in enumerate(raw_rows, start=2):
            mapped, unmapped = map_row_columns(row, 'staff')
            all_unmapped_columns.update(unmapped)

            first_name = str(mapped.get('first_name', '')).strip()
            last_name = str(mapped.get('last_name', '')).strip()
            if not first_name:
                errors.append({'row': idx, 'column': 'first_name', 'message': 'First name is required.'})

            position = str(mapped.get('position', '')).strip() or 'Teacher'

            role_raw = str(mapped.get('role', '')).strip().lower()
            if role_raw in ('principal', 'headmaster', 'head'):
                role = 'principal'
            elif role_raw in ('admin', 'school_admin'):
                role = 'school_admin'
            else:
                role = 'teacher'

            hired_val = mapped.get('hired_on')
            hired = parse_date_flexible(hired_val) or date.today()

            validated_rows.append({
                'first_name': first_name,
                'last_name': last_name or '.',
                'position': position[:120],
                'role': role,
                'email': str(mapped.get('email', '')).strip()[:100],
                'phone': str(mapped.get('phone', '')).strip()[:40],
                'hired_on': hired
            })

    # -------------------------------------------------------------------------
    # 3. CLASSES & SECTIONS
    # -------------------------------------------------------------------------
    elif entity_type == 'classes':
        seen_classes = set()
        for idx, row in enumerate(raw_rows, start=2):
            mapped, unmapped = map_row_columns(row, 'classes')
            all_unmapped_columns.update(unmapped)

            class_name = str(mapped.get('name', '')).strip()
            if not class_name:
                errors.append({'row': idx, 'column': 'name', 'message': 'Class name is required (e.g. Grade 10).'})
                continue

            sec = str(mapped.get('section', '')).strip()
            key = f"{class_name.lower()}::{sec.lower()}"
            if key in seen_classes:
                errors.append({'row': idx, 'column': 'name', 'message': f"Duplicate class/section '{class_name} {sec}' in file."})
            seen_classes.add(key)

            validated_rows.append({
                'name': class_name,
                'section': sec,
                'grade_level': str(mapped.get('grade_level', '')).strip()[:40],
                'curriculum': str(mapped.get('curriculum', '')).strip()[:120]
            })

    # -------------------------------------------------------------------------
    # 4. CAMPUS SUBJECTS
    # -------------------------------------------------------------------------
    elif entity_type == 'subjects':
        existing_codes = set(Subject.objects.filter(school=school).values_list('code', flat=True))
        seen_codes = set()

        for idx, row in enumerate(raw_rows, start=2):
            mapped, unmapped = map_row_columns(row, 'subjects')
            all_unmapped_columns.update(unmapped)

            name = str(mapped.get('name', '')).strip()
            if not name:
                errors.append({'row': idx, 'column': 'name', 'message': 'Subject name is required.'})
                continue

            code = str(mapped.get('code', '')).strip().upper()
            if not code:
                # Auto-generate a code e.g. "MATH-10" or "SUB-XXX"
                clean_name = re.sub(r'[^A-Za-z0-9]', '', name).upper()[:4]
                code = f"{clean_name or 'SUB'}-{idx}"

            if code in existing_codes:
                errors.append({'row': idx, 'column': 'code', 'message': f"Subject code '{code}' already exists in this campus."})
            if code in seen_codes:
                errors.append({'row': idx, 'column': 'code', 'message': f"Duplicate subject code '{code}' in file."})
            seen_codes.add(code)

            validated_rows.append({
                'name': name,
                'code': code[:20]
            })

    # -------------------------------------------------------------------------
    # 5. ATTENDANCE RECORDS
    # -------------------------------------------------------------------------
    elif entity_type == 'attendance':
        students_map = {s.admission_number: s for s in Student.objects.filter(school=school)}
        classes_map = {c.name.lower(): c for c in SchoolClass.objects.filter(school=school)}

        for idx, row in enumerate(raw_rows, start=2):
            mapped, unmapped = map_row_columns(row, 'attendance')
            all_unmapped_columns.update(unmapped)

            adm = str(mapped.get('admission_number', '')).strip()
            student = students_map.get(adm)
            if not student:
                errors.append({'row': idx, 'column': 'admission_number', 'message': f"Student admission '{adm}' not found in campus."})
                continue

            att_date = parse_date_flexible(mapped.get('date')) or date.today()

            st_raw = str(mapped.get('status', 'present')).strip().lower()
            if st_raw in ('present', 'p', '1'):
                att_status = 'present'
            elif st_raw in ('absent', 'a', '0'):
                att_status = 'absent'
            elif st_raw in ('late', 'l'):
                att_status = 'late'
            elif st_raw in ('leave', 'excused'):
                att_status = 'excused'
            else:
                att_status = 'present'

            # Determine class
            target_class = None
            class_req = str(mapped.get('class_name', '')).strip().lower()
            if class_req and class_req in classes_map:
                target_class = classes_map[class_req]
            else:
                # Fetch student active enrollment
                enr = Enrollment.objects.filter(student=student, end_date__isnull=True).first()
                if enr:
                    target_class = enr.school_class

            if not target_class:
                errors.append({'row': idx, 'column': 'class_name', 'message': f"No enrolled class found for student '{adm}'."})
                continue

            validated_rows.append({
                'student': student,
                'school_class': target_class,
                'date': att_date,
                'status': att_status
            })

    # -------------------------------------------------------------------------
    # 6. EXAM MARKS
    # -------------------------------------------------------------------------
    elif entity_type == 'marks':
        paper_id = request.data.get('paper_id')
        paper = ExamPaper.objects.filter(pk=paper_id, session__school=school).select_related('session', 'school_class', 'assessment').first()
        if not paper:
            raise ValidationError({'paper_id': 'Valid exam paper required for marks import.'})

        students_map = {s.admission_number: s for s in Student.objects.filter(school=school)}

        for idx, row in enumerate(raw_rows, start=2):
            mapped, unmapped = map_row_columns(row, 'marks')
            all_unmapped_columns.update(unmapped)

            adm = str(mapped.get('admission_number', '')).strip()
            student = students_map.get(adm)
            if not student:
                errors.append({'row': idx, 'column': 'admission_number', 'message': f"Student admission '{adm}' not found in campus."})
                continue

            raw_marks = mapped.get('marks')
            try:
                marks_val = Decimal(str(raw_marks)) if raw_marks is not None and str(raw_marks).strip() != '' else Decimal('0.00')
                if marks_val < 0 or marks_val > paper.max_marks:
                    errors.append({'row': idx, 'column': 'marks', 'message': f"Marks must be between 0 and {paper.max_marks}."})
            except InvalidOperation:
                errors.append({'row': idx, 'column': 'marks', 'message': f"Invalid numeric marks '{raw_marks}'."})
                marks_val = Decimal('0.00')

            res_status = str(mapped.get('status', 'recorded')).strip().lower()
            validated_rows.append({
                'student': student,
                'marks': marks_val,
                'status': res_status if res_status in dict(Grade.RESULT_STATUS) else 'recorded',
                'feedback': str(mapped.get('feedback', '')).strip()
            })

    # Informative note about safely skipped columns
    skipped_list = sorted(list(all_unmapped_columns))
    skipped_note = ""
    if skipped_list:
        skipped_note = (
            f"Note: {len(skipped_list)} unmapped column(s) ({', '.join(skipped_list)}) "
            f"were safely skipped because they are not part of {entity_type} storage schema. "
            f"All recognized fields will be processed without error."
        )

    # Return preview if dry_run or validation errors exist
    if dry_run or errors:
        return Response({
            'dry_run': dry_run,
            'entity_type': entity_type,
            'file_format': file_format,
            'sheet_name': active_sheet,
            'available_sheets': available_sheets or ['Sheet1'],
            'total_rows': len(validated_rows) + len(errors),
            'valid_rows_count': len(validated_rows),
            'errors_count': len(errors),
            'skipped_columns': skipped_list,
            'skipped_columns_note': skipped_note,
            'errors': errors[:50],
            'preview': validated_rows[:10]
        }, status=400 if (not dry_run and errors) else 200)

    # Execute DB commit
    created_count = 0
    with transaction.atomic():
        if entity_type == 'students':
            ay = active_year
            for r in validated_rows:
                st = Student.objects.create(
                    school=school,
                    first_name=r['first_name'],
                    last_name=r['last_name'],
                    father_name=r.get('father_name', ''),
                    mother_name=r.get('mother_name', ''),
                    guardian_phone=r.get('guardian_phone', ''),
                    admission_number=r['admission_number'],
                    date_of_birth=r.get('date_of_birth'),
                    gender=r.get('gender', 'not_recorded'),
                    enrolled_on=r.get('date_of_birth') or date.today()
                )
                if r['class_name'] and ay:
                    cls_qs = SchoolClass.objects.filter(school=school, academic_year=ay, name__iexact=r['class_name'])
                    if r.get('section'):
                        cls_qs = cls_qs.filter(section__iexact=r['section'])
                    cls = cls_qs.first()
                    if cls:
                        Enrollment.objects.create(student=st, school_class=cls, start_date=st.enrolled_on)
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

        elif entity_type == 'classes':
            ay = active_year or AcademicYear.objects.create(
                school=school,
                name=f"{date.today().year}-{date.today().year + 1}",
                start_date=date(date.today().year, 1, 1),
                end_date=date(date.today().year, 12, 31),
                active=True
            )
            for r in validated_rows:
                cls, _ = SchoolClass.objects.update_or_create(
                    school=school,
                    academic_year=ay,
                    name=r['name'],
                    section=r.get('section', ''),
                    defaults={
                        'grade_level': r.get('grade_level', ''),
                        'curriculum': r.get('curriculum', '')
                    }
                )
                record_event(actor=user, action='import_class', obj=cls)
                created_count += 1

        elif entity_type == 'subjects':
            for r in validated_rows:
                sub, _ = Subject.objects.update_or_create(
                    school=school,
                    code=r['code'],
                    defaults={'name': r['name']}
                )
                record_event(actor=user, action='import_subject', obj=sub)
                created_count += 1

        elif entity_type == 'attendance':
            for r in validated_rows:
                att, _ = Attendance.objects.update_or_create(
                    student=r['student'],
                    school_class=r['school_class'],
                    date=r['date'],
                    defaults={'status': r['status']}
                )
                created_count += 1

        elif entity_type == 'marks':
            for r in validated_rows:
                Grade.objects.update_or_create(
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
        'entity_type': entity_type,
        'created_count': created_count,
        'skipped_columns': skipped_list,
        'skipped_columns_note': skipped_note,
        'message': f"Successfully imported {created_count} {entity_type} records.{f' (Skipped unmapped: {chr(44).join(skipped_list)})' if skipped_list else ''}"
    }, status=201)


def _handle_full_school_import(request, school, dry_run):
    """Multi-tab orchestrator: imports Classes -> Subjects -> Staff -> Students from a single workbook."""
    file_obj = request.FILES.get('file')
    if not file_obj:
        raise ValidationError({'file': 'Excel workbook file (.xlsx) required for full school setup.'})

    wb = openpyxl.load_workbook(file_obj, data_only=True)
    sheets_lower = {s.lower().strip(): s for s in wb.sheetnames}

    results = {}
    total_created = 0
    total_errors = []

    entity_order = ['classes', 'subjects', 'staff', 'students']
    for ent in entity_order:
        sheet_match = None
        for k, real_name in sheets_lower.items():
            if k == ent or ent in k:
                sheet_match = real_name
                break

        if not sheet_match:
            continue

        sheet = wb[sheet_match]
        all_rows = list(sheet.iter_rows(values_only=True))
        if len(all_rows) < 2:
            continue

        headers = [str(c).strip() if c is not None else '' for c in all_rows[0]]
        rows = []
        for r in all_rows[1:]:
            if not any(r):
                continue
            row_dict = {headers[i]: r[i] for i in range(min(len(headers), len(r))) if headers[i]}
            if any(str(v).strip() for v in row_dict.values()):
                rows.append(row_dict)

        if not rows:
            continue

        sub_res = _process_entity_import(
            raw_rows=rows,
            entity_type=ent,
            school=school,
            user=request.user,
            dry_run=dry_run,
            request=request,
            file_format='xlsx',
            available_sheets=wb.sheetnames,
            active_sheet=sheet_match
        )

        sub_data = sub_res.data
        results[ent] = sub_data
        if sub_data.get('errors'):
            total_errors.extend([{'tab': sheet_match, **e} for e in sub_data['errors']])
        total_created += sub_data.get('created_count', 0)

    return Response({
        'status': 'committed' if not dry_run else 'preview',
        'dry_run': dry_run,
        'total_created': total_created,
        'errors_count': len(total_errors),
        'errors': total_errors[:50],
        'tabs_processed': list(results.keys()),
        'results_per_tab': results,
        'message': f"Full School setup {'preview complete' if dry_run else 'committed successfully'}. Total records: {total_created} across {len(results)} tabs."
    }, status=200 if dry_run else 201)


# =============================================================================
# TEMPLATE DOWNLOAD & FILE INSPECTION ENDPOINTS
# =============================================================================
def download_import_template(request):
    """
    Generates a beautifully styled, downloadable sample Excel (.xlsx) or CSV template
    for Students, Staff, Classes, Subjects, Attendance, Marks, or Master Full School Workbook.
    """
    params = getattr(request, 'GET', {}) or getattr(request, 'query_params', {})
    entity_type = (params.get('entity_type') or 'students').lower().strip()
    fmt = (params.get('export_format') or params.get('file_format') or params.get('format') or 'xlsx').lower().strip()

    templates = {
        'students': {
            'headers': ['First Name', 'Last Name', 'Admission No', 'Roll No', 'Date of Birth', 'Gender', 'Class', 'Section', 'Father Name', 'Mother Name', 'Guardian Phone'],
            'rows': [
                ['Hamza', 'Ali', 'STU-2026-001', '1', '2012-05-14', 'Male', 'Grade 8', 'A', 'Ali Raza', 'Fatima Bibi', '03001234567'],
                ['Ayesha', 'Khan', 'STU-2026-002', '2', '2012-08-22', 'Female', 'Grade 8', 'A', 'Tariq Khan', 'Zainab Bibi', '03007654321'],
                ['Zainab', 'Tariq', 'STU-2026-003', '3', '2012-11-05', 'Female', 'Grade 8', 'B', 'Tariq Mehmood', 'Sadia Tariq', '03009988776'],
            ]
        },
        'staff': {
            'headers': ['First Name', 'Last Name', 'Position', 'Role', 'Email', 'Phone', 'Hired On'],
            'rows': [
                ['Bilal', 'Ahmed', 'Senior Mathematics Teacher', 'teacher', 'bilal.ahmed@school.edu', '03001234567', '2024-08-15'],
                ['Fatima', 'Noor', 'Head of Science Department', 'teacher', 'fatima.noor@school.edu', '03007654321', '2023-01-10'],
                ['Dr. Asim', 'Farooq', 'Campus Vice Principal', 'principal', 'asim.farooq@school.edu', '03005544332', '2022-06-01'],
            ]
        },
        'classes': {
            'headers': ['Class Name', 'Section', 'Grade Level', 'Curriculum'],
            'rows': [
                ['Grade 8', 'A', 'Middle School', 'Matriculation'],
                ['Grade 8', 'B', 'Middle School', 'Matriculation'],
                ['Grade 9', 'A', 'High School', 'Cambridge O-Levels'],
                ['Grade 10', 'A', 'High School', 'Cambridge O-Levels'],
            ]
        },
        'subjects': {
            'headers': ['Subject Name', 'Subject Code'],
            'rows': [
                ['Mathematics', 'MATH-101'],
                ['English Literature', 'ENG-102'],
                ['Computer Science', 'CS-103'],
                ['Physics', 'PHY-104'],
            ]
        },
        'attendance': {
            'headers': ['Admission No', 'Date', 'Status', 'Class Name'],
            'rows': [
                ['STU-2026-001', '2026-11-25', 'Present', 'Grade 8'],
                ['STU-2026-002', '2026-11-25', 'Present', 'Grade 8'],
                ['STU-2026-003', '2026-11-25', 'Late', 'Grade 8'],
            ]
        },
        'marks': {
            'headers': ['Admission No', 'Marks', 'Status', 'Feedback'],
            'rows': [
                ['STU-2026-001', '88.5', 'recorded', 'Excellent problem solving'],
                ['STU-2026-002', '92.0', 'recorded', 'Outstanding performance'],
                ['STU-2026-003', '0.0', 'absent', 'Medical leave'],
            ]
        }
    }

    # Return CSV format if explicitly requested
    if fmt == 'csv' and entity_type in templates:
        t = templates[entity_type]
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(t['headers'])
        writer.writerows(t['rows'])
        response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="optimus_{entity_type}_template.csv"'
        return response

    # Otherwise return beautiful Excel (.xlsx) workbook
    wb = Workbook()

    header_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
    header_fill = PatternFill(start_color='0284C7', end_color='0284C7', fill_type='solid')
    data_font = Font(name='Segoe UI', size=10)
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    if entity_type == 'full_school':
        # Create Master Multi-Sheet Template
        sheets_to_build = ['Classes', 'Subjects', 'Staff', 'Students']
        for i, sheet_key in enumerate(sheets_to_build):
            t_key = sheet_key.lower()
            t = templates.get(t_key, {'headers': [], 'rows': []})
            if i == 0:
                ws = wb.active
                ws.title = sheet_key
            else:
                ws = wb.create_sheet(title=sheet_key)

            # Add header
            ws.append(t['headers'])
            for col_idx in range(1, len(t['headers']) + 1):
                cell = ws.cell(row=1, column=col_idx)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal='center', vertical='center')

            # Add sample rows
            for row_data in t['rows']:
                ws.append(row_data)

            # Auto-fit columns
            for col in ws.columns:
                max_len = max(len(str(c.value or '')) for c in col)
                col_letter = get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

        filename = "optimus_full_school_setup_template.xlsx"
    else:
        ws = wb.active
        t = templates.get(entity_type, templates['students'])
        ws.title = entity_type.capitalize()

        ws.append(t['headers'])
        for col_idx in range(1, len(t['headers']) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal='center', vertical='center')

        for row_data in t['rows']:
            ws.append(row_data)

        for col in ws.columns:
            max_len = max(len(str(c.value or '')) for c in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

        filename = f"optimus_{entity_type}_template.xlsx"

    out = io.BytesIO()
    wb.save(out)
    out.seek(0)

    response = HttpResponse(
        out.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@api_view(['POST'])
def inspect_import_file(request):
    """
    Inspects an uploaded file (.xlsx or .csv) without altering database state.
    Returns detected format, list of sheets, headers, sample row preview, and column mappings.
    """
    _require_manager(request.user)
    file_format, available_sheets, active_sheet, raw_rows = extract_sheets_and_rows(request)
    headers = list(raw_rows[0].keys()) if raw_rows else []

    entity_type = request.data.get('entity_type', 'students')
    sample_mapped, unmapped = map_row_columns(raw_rows[0], entity_type) if raw_rows else ({}, set())

    return Response({
        'file_format': file_format,
        'available_sheets': available_sheets,
        'active_sheet': active_sheet,
        'headers': headers,
        'total_rows': len(raw_rows),
        'preview': raw_rows[:5],
        'detected_mappings': sample_mapped,
        'unmapped_columns': sorted(list(unmapped)),
    }, status=200)
