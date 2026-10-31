import re
import secrets
from django.utils import timezone
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from core.models import User, ClassTeacherAssignment, AcademicYear

UNAMBIGUOUS_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
UNAMBIGUOUS_LOWER = 'abcdefghijkmnpqrstuvwxyz'
UNAMBIGUOUS_DIGITS = '23456789'
UNAMBIGUOUS_SYMBOLS = '#@!$*&'
ALL_CHARS = UNAMBIGUOUS_UPPER + UNAMBIGUOUS_LOWER + UNAMBIGUOUS_DIGITS + UNAMBIGUOUS_SYMBOLS

def generate_temporary_password(length=12):
    """
    Generates a cryptographically strong, unambiguous temporary password (12+ characters)
    guaranteed to pass Django password policy.
    """
    while True:
        pw = [
            secrets.choice(UNAMBIGUOUS_UPPER),
            secrets.choice(UNAMBIGUOUS_LOWER),
            secrets.choice(UNAMBIGUOUS_DIGITS),
            secrets.choice(UNAMBIGUOUS_SYMBOLS),
        ] + [secrets.choice(ALL_CHARS) for _ in range(max(length - 4, 8))]
        secrets.SystemRandom().shuffle(pw)
        pw_str = ''.join(pw)
        try:
            validate_password(pw_str)
            return pw_str
        except Exception:
            continue

def generate_student_username(school, admission_number):
    """
    Generates a unique, readable system username: <campus code>-<admission number>.
    E.g. NC-2026-0412.
    """
    code = (school.code or 'SCH').strip().upper()
    adm = re.sub(r'[^A-Za-z0-9_-]', '', (admission_number or '').strip())
    if not adm:
        adm = secrets.token_hex(3).upper()
    base_username = f"{code}-{adm}"
    username = base_username
    suffix = 1
    while User.objects.filter(username__iexact=username).exists():
        username = f"{base_username}-{suffix}"
        suffix += 1
    return username

def make_credentials_receipt(student, school_class, username, temporary_password, issued_by):
    """
    Builds the credentials receipt dictionary according to specification.
    """
    school = student.school
    cta = None
    if school_class:
        cta = ClassTeacherAssignment.objects.filter(
            school_class=school_class
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=timezone.localdate())
        ).select_related('teacher').first()
    teacher_name = "Not assigned yet"
    if cta and cta.teacher:
        staff_rec = getattr(cta.teacher, 'staff_record', None)
        if staff_rec and (staff_rec.first_name or staff_rec.last_name):
            teacher_name = f"{staff_rec.first_name} {staff_rec.last_name}".strip()
        else:
            teacher_name = cta.teacher.get_full_name() or cta.teacher.username
    class_teacher_name = teacher_name
    ay = AcademicYear.objects.filter(school=school, active=True).first()
    academic_year_name = ay.name if ay else "Current Academic Year"
    class_display = (getattr(school_class, 'display_name', '') or (f"{school_class.name} - {school_class.section}" if school_class.section else school_class.name)) if school_class else 'Unassigned'

    return {
        'school_name': school.name,
        'campus_code': school.code or '',
        'student_id': student.id,
        'admission_number': student.admission_number,
        'student_name': student.full_name,
        'class_name': class_display,
        'section': (school_class.section or '') if school_class else '',
        'class_teacher_name': class_teacher_name,
        'academic_year': academic_year_name,
        'username': username,
        'temporary_password': temporary_password,
        'login_url': '/login',
        'issued_date': timezone.localdate().isoformat(),
        'issued_by': issued_by,
        'instructions': 'Sign in with your username and temporary password, then choose a new password — keep it private.',
        'warning': 'This temporary password is shown only once and cannot be retrieved again.'
    }
