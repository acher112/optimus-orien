"""Teacher scope service for OPTIMUS ORIEN.

Evaluates and caches role scope per class and subject:
- Class teacher: in charge of one (or more) homeroom classes, sees full student profile,
  views all subjects, marks daily register, has authority over own class.
- Subject teacher: teaches particular subject(s) in particular class(es), sees limited student
  profile (data minimization), accesses only assigned subjects.
- Both (mixed): evaluated strictly PER CLASS without merging privileges.
"""
from datetime import date
from django.db.models import Q
from django.utils import timezone


class TeacherScope:
    def __init__(self, user, today=None):
        self.user = user
        self.today = today or timezone.localdate()
        self._compute()

    def _compute(self):
        from core.models import ClassTeacherAssignment, TeachingAssignment, SchoolClass

        if not self.user or not self.user.is_authenticated or self.user.role != 'teacher':
            self.full_class_ids = set()
            self.subject_pairs = set()
            self.subject_class_ids = set()
            self.assigned_subject_ids = set()
            self.class_ids = set()
            self.teacher_type = ''
            return

        # 1. Active class teacher assignments
        cta_qs = ClassTeacherAssignment.objects.filter(
            teacher=self.user,
            start_date__lte=self.today
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=self.today)
        )
        self.full_class_ids = set(cta_qs.values_list('school_class_id', flat=True))

        # Compatibility fallback: if SchoolClass.teacher is set to user and no CTA exists
        legacy_classes = set(SchoolClass.objects.filter(teacher=self.user).values_list('id', flat=True))
        self.full_class_ids.update(legacy_classes)

        # 2. Active teaching assignments (subject teacher)
        ta_qs = TeachingAssignment.objects.filter(
            teacher=self.user,
            start_date__lte=self.today
        ).filter(
            Q(end_date__isnull=True) | Q(end_date__gte=self.today)
        )
        self.subject_pairs = set(ta_qs.values_list('school_class_id', 'subject_id'))
        self.subject_class_ids = {pair[0] for pair in self.subject_pairs}
        self.assigned_subject_ids = {pair[1] for pair in self.subject_pairs}

        # 3. All classes in scope
        self.class_ids = self.full_class_ids | self.subject_class_ids

        # 4. Computed teacher type
        if self.full_class_ids and self.subject_pairs:
            self.teacher_type = 'both'
        elif self.full_class_ids:
            self.teacher_type = 'class_teacher'
        elif self.subject_pairs:
            self.teacher_type = 'subject_teacher'
        else:
            self.teacher_type = ''

    @property
    def classes_qs(self):
        from core.models import SchoolClass
        return SchoolClass.objects.filter(id__in=self.class_ids)

    @property
    def full_classes_qs(self):
        from core.models import SchoolClass
        return SchoolClass.objects.filter(id__in=self.full_class_ids)

    @property
    def subject_classes_qs(self):
        from core.models import SchoolClass
        return SchoolClass.objects.filter(id__in=self.subject_class_ids)

    def is_class_teacher(self, school_class_id):
        return school_class_id in self.full_class_ids

    def teaches_subject(self, school_class_id, subject_id):
        return (school_class_id, subject_id) in self.subject_pairs

    def can_view_subject(self, school_class_id, subject_id):
        if self.is_class_teacher(school_class_id):
            return True
        return self.teaches_subject(school_class_id, subject_id)

    def can_edit_subject_marks(self, school_class_id, subject_id):
        if self.teaches_subject(school_class_id, subject_id):
            return True
        if self.is_class_teacher(school_class_id):
            org = getattr(self.user, 'organisation', None)
            return bool(getattr(org, 'class_teacher_can_edit_all_subject_marks', False))
        return False

    def can_mark_daily_attendance(self, school_class_id):
        return self.is_class_teacher(school_class_id)

    @property
    def keeps_history_read_access(self):
        org = getattr(self.user, 'organisation', None)
        return bool(getattr(org, 'teachers_keep_read_access_to_own_history', True))

    def get_assignment_badges(self):
        """Returns human-readable badges for headers and navigation."""
        from core.models import SchoolClass, Subject, TeachingAssignment, ClassTeacherAssignment
        badges = []
        # Class teacher badges
        for cid in sorted(self.full_class_ids):
            sc = SchoolClass.objects.filter(pk=cid).select_related('school').first()
            if sc:
                badges.append({
                    'type': 'class_teacher',
                    'label': f"Class teacher – {sc.display_name}",
                    'class_id': sc.id,
                    'class_name': sc.display_name,
                    'school_id': sc.school_id,
                    'school_name': sc.school.name if sc.school else ''
                })
        # Subject teacher badges
        for cid, sid in sorted(self.subject_pairs):
            sc = SchoolClass.objects.filter(pk=cid).select_related('school').first()
            subj = Subject.objects.filter(pk=sid).first()
            if sc and subj:
                badges.append({
                    'type': 'subject_teacher',
                    'label': f"Subject teacher – {subj.name}, {sc.display_name}",
                    'class_id': sc.id,
                    'class_name': sc.display_name,
                    'subject_id': subj.id,
                    'subject_name': subj.name,
                    'school_id': sc.school_id,
                    'school_name': sc.school.name if sc.school else ''
                })
        return badges


def get_teacher_scope(user, request=None) -> TeacherScope:
    if request is not None:
        if not hasattr(request, '_teacher_scope_cache'):
            request._teacher_scope_cache = {}
        if user.id not in request._teacher_scope_cache:
            request._teacher_scope_cache[user.id] = TeacherScope(user)
        return request._teacher_scope_cache[user.id]
    return TeacherScope(user)
