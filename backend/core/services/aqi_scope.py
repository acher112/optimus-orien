"""Academic Quality Index (AQI) Scoping and Access Authorization.

Strictly enforces the Golden Rule across all AQI endpoints, exports, and aggregations:
- Admin (organisation_admin / superuser): School-wide (all campuses) -> Campus -> Class -> Subject -> Student.
- Campus Admin (school_admin): Own campus only (starts at Level 2). Other campuses -> 404.
- Principal: Own campus only (home = campus dashboard). Class -> Subject -> Student inside campus. Other campuses -> 404.
- Class teacher: Only the homeroom class(es) they lead. All subjects within that class. Other classes -> 404.
- Subject teacher: Only their assigned (class, subject) pairs. Only student rows for that subject. Other subjects/classes -> 404.
- Student: Only their own academic profile (Level 5). Other students/classes -> 404.
- Parent: Only their own linked children (Level 5). Other students/classes -> 404.

Out-of-scope requests ALWAYS raise NotFound (HTTP 404), never 403 with data or empty 200.
"""
from typing import Set, List, Tuple, Optional
from rest_framework.exceptions import NotFound, PermissionDenied, NotAuthenticated
from django.db.models import Q
from core.models import (
    School, SchoolClass, Subject, Student, Enrollment, User,
    ClassTeacherAssignment, TeachingAssignment
)
from core.services.access import schools_scope


class AQIScope:
    """Encapsulates authorization and filtering boundaries for an authenticated user in AQI."""

    def __init__(self, user: User):
        self.user = user
        self.role = getattr(user, 'role', '')
        self.is_superuser = bool(getattr(user, 'is_superuser', False))

        self.allowed_levels: List[int] = []
        self.school_ids: Set[int] = set()
        self.class_ids: Set[int] = set()
        self.class_teacher_class_ids: Set[int] = set()
        self.subject_pairs: Set[Tuple[int, int]] = set()  # (class_id, subject_id)
        self.student_ids: Set[int] = set()

        self.can_view_schoolwide = False
        self.can_view_all_campuses = False
        self.min_group_size = 5  # default group size threshold to protect individual child privacy

        self._compute_scope()

    def _compute_scope(self):
        if not self.user or not self.user.is_authenticated:
            raise NotAuthenticated('Authentication credentials were not provided.')
        if not self.user.is_active:
            raise PermissionDenied('Account is inactive.')

        # 1. Organisation Admin / Superuser
        if self.is_superuser or self.role == 'organisation_admin':
            self.allowed_levels = [1, 2, 3, 4, 5]
            self.can_view_schoolwide = True
            self.can_view_all_campuses = True
            allowed_schools = schools_scope(self.user)
            self.school_ids = set(allowed_schools.values_list('id', flat=True))
            self.class_ids = set(SchoolClass.objects.filter(school_id__in=self.school_ids).values_list('id', flat=True))
            # Admin can access all subjects in all scoped classes
            pairs = TeachingAssignment.objects.filter(school_id__in=self.school_ids).values_list('school_class_id', 'subject_id')
            self.subject_pairs = set(pairs)
            # Also include any subjects attached to classes via assessments or ClassSubject
            from core.models import ClassSubject, Assessment
            cs_pairs = ClassSubject.objects.filter(school_class_id__in=self.class_ids).values_list('school_class_id', 'subject_id')
            self.subject_pairs.update(cs_pairs)
            ass_pairs = Assessment.objects.filter(school_class_id__in=self.class_ids).values_list('school_class_id', 'subject_id')
            self.subject_pairs.update(ass_pairs)
            # If a subject belongs to the same campus, admin can view it with any class of that campus
            all_subjs = Subject.objects.filter(school_id__in=self.school_ids).values_list('school_id', 'id')
            school_to_subjs = {}
            for sc_id, sub_id in all_subjs:
                school_to_subjs.setdefault(sc_id, []).append(sub_id)
            for c_id, sc_id in SchoolClass.objects.filter(id__in=self.class_ids).values_list('id', 'school_id'):
                for sub_id in school_to_subjs.get(sc_id, []):
                    self.subject_pairs.add((c_id, sub_id))

            self.student_ids = set(Student.objects.filter(school_id__in=self.school_ids).values_list('id', flat=True))
            return

        # 2. Campus Admin / Principal (Own Campus Only)
        if self.role in ('school_admin', 'principal'):
            self.allowed_levels = [2, 3, 4, 5]
            self.can_view_schoolwide = False
            self.can_view_all_campuses = False
            own_school_id = getattr(self.user, 'school_id', None)
            if not own_school_id:
                raise PermissionDenied('No campus assigned to this account.')
            self.school_ids = {own_school_id}
            self.class_ids = set(SchoolClass.objects.filter(school_id=own_school_id).values_list('id', flat=True))

            all_subjs = Subject.objects.filter(school_id=own_school_id).values_list('id', flat=True)
            for c_id in self.class_ids:
                for sub_id in all_subjs:
                    self.subject_pairs.add((c_id, sub_id))

            self.student_ids = set(Student.objects.filter(school_id=own_school_id).values_list('id', flat=True))
            return

        # 3. Teacher
        if self.role == 'teacher':
            self.can_view_schoolwide = False
            self.can_view_all_campuses = False
            own_school_id = getattr(self.user, 'school_id', None)
            if own_school_id:
                self.school_ids = {own_school_id}

            from core.services.teacher_scope import TeacherScope
            ts = TeacherScope(self.user)
            self.class_teacher_class_ids = set(ts.full_class_ids)
            self.subject_pairs = set(ts.subject_pairs)
            self.class_ids = set(ts.class_ids)

            # For class teacher classes, teacher can view ALL subjects of their homeroom class
            if self.class_teacher_class_ids and own_school_id:
                all_campus_subjs = Subject.objects.filter(school_id=own_school_id).values_list('id', flat=True)
                for c_id in self.class_teacher_class_ids:
                    for sub_id in all_campus_subjs:
                        self.subject_pairs.add((c_id, sub_id))

            # Levels:
            # If teacher is class teacher of at least one class, can access Level 3, 4, 5
            # If subject teacher only, can access Level 4 (subject dashboard) and Level 5 (students taking their subject)
            if self.class_teacher_class_ids:
                self.allowed_levels = [3, 4, 5]
            else:
                self.allowed_levels = [4, 5]

            # Allowed students: all students currently enrolled in the teacher's accessible classes
            self.student_ids = set(
                Enrollment.objects.filter(
                    school_class_id__in=self.class_ids,
                    end_date__isnull=True
                ).values_list('student_id', flat=True)
            )
            return

        # 4. Student (Own Profile Only)
        if self.role == 'student':
            self.allowed_levels = [5]
            self.can_view_schoolwide = False
            self.can_view_all_campuses = False
            st = Student.objects.filter(user=self.user).first()
            if not st:
                raise NotFound('Student profile not found.')
            self.student_ids = {st.id}
            self.school_ids = {st.school_id}
            active_enr = Enrollment.objects.filter(student=st, end_date__isnull=True).first()
            if active_enr:
                self.class_ids = {active_enr.school_class_id}
            return

        # 5. Parent / Guardian (Own Children Only)
        if self.role == 'parent':
            self.allowed_levels = [5]
            self.can_view_schoolwide = False
            self.can_view_all_campuses = False
            wards = list(self.user.wards.all())
            if not wards:
                raise NotFound('No linked student profiles found for this parent account.')
            self.student_ids = {w.id for w in wards}
            self.school_ids = {w.school_id for w in wards}
            self.class_ids = set(
                Enrollment.objects.filter(
                    student_id__in=self.student_ids,
                    end_date__isnull=True
                ).values_list('school_class_id', flat=True)
            )
            return

        # Any other unhandled role
        raise PermissionDenied('AQI access not permitted for this role.')

    def check_level(self, level: int):
        """Validates if user can access the given AQI hierarchy level (1 to 5)."""
        if level not in self.allowed_levels:
            raise NotFound(f"Level {level} dashboard not accessible.")

    def check_school(self, school_id: Optional[int]) -> int:
        """Validates campus access. Raises 404 on any out-of-scope campus."""
        if school_id is None:
            if self.can_view_schoolwide:
                return 0  # 0 indicates consolidated school-wide view
            raise NotFound('Specific campus must be selected.')
        if int(school_id) not in self.school_ids:
            raise NotFound(f"Campus ID {school_id} not found in authorized scope.")
        return int(school_id)

    def check_class(self, class_id: int) -> int:
        """Validates class access. Raises 404 if class is out of scope."""
        cid = int(class_id)
        if cid not in self.class_ids:
            raise NotFound(f"Class ID {class_id} not found in authorized scope.")
        return cid

    def check_subject(self, class_id: int, subject_id: int) -> Tuple[int, int]:
        """Validates (class, subject) pair access. Raises 404 if out of scope."""
        cid = self.check_class(class_id)
        sid = int(subject_id)
        # Check if subject belongs to campus and allowed for this role
        if self.is_superuser or self.role in ('organisation_admin', 'school_admin', 'principal'):
            # Campus leadership sees all subjects in their classes
            if not Subject.objects.filter(id=sid, school_id__in=self.school_ids).exists():
                raise NotFound(f"Subject ID {subject_id} not found in campus scope.")
            return cid, sid

        if self.role == 'teacher':
            # Homeroom teacher can see all subjects in their homeroom class
            if cid in self.class_teacher_class_ids:
                if not Subject.objects.filter(id=sid, school_id__in=self.school_ids).exists():
                    raise NotFound(f"Subject ID {subject_id} not found in campus scope.")
                return cid, sid
            # Subject teacher can only see assigned pairs
            if (cid, sid) not in self.subject_pairs:
                raise NotFound(f"Subject {subject_id} is not assigned to you for Class {class_id}.")
            return cid, sid

        raise NotFound(f"Subject access not authorized.")

    def check_student(self, student_id: int) -> int:
        """Validates student profile access. Raises 404 if out of scope."""
        sid = int(student_id)
        if sid not in self.student_ids:
            raise NotFound(f"Student ID {student_id} not found in authorized scope.")
        return sid

    def can_view_school(self, school_id: int) -> bool:
        return int(school_id) in self.school_ids

    def can_view_class(self, class_id: int) -> bool:
        return int(class_id) in self.class_ids

    def can_view_class_subject(self, class_id: int, subject_id: int) -> bool:
        try:
            self.check_subject(class_id, subject_id)
            return True
        except NotFound:
            return False

    def can_view_student(self, student_id: int) -> bool:
        return int(student_id) in self.student_ids

    def can_view_student_list(self, class_id: int) -> bool:
        """Determines if the user is authorized to see individual student roster/overalls in a class."""
        if self.is_superuser or self.role in ('organisation_admin', 'school_admin', 'principal'):
            return True
        if self.role == 'teacher' and int(class_id) in self.class_teacher_class_ids:
            return True
        return False


def aqi_scope(user: User) -> AQIScope:
    """Primary factory function for AQI access control."""
    return AQIScope(user)
