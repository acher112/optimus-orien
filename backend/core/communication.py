"""Communication: Subject-based discussion channels for classrooms.

Allows students of a class to communicate within each subject, and assigned subject
teachers to communicate with and answer their students.
Access rules:
- Students can access all subjects in the class they are enrolled in.
- Teachers can ONLY access the subjects and classes they are assigned to teach.
- Principals and Administrators can view discussions and manage teacher assignments.
"""
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    ClassSubjectTeacher,
    Enrollment,
    SchoolClass,
    Student,
    Subject,
    SubjectMessage,
    User,
)
from core.services.access import schools_scope


def _require_user(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Authentication required')


def _can_access_subject_chat(user, school_class, subject):
    """Returns True if the user is authorized to read and participate in this subject channel."""
    if user.is_superuser:
        return True

    # Organisation and School Admins, Principals
    if user.role in ('organisation_admin', 'school_admin', 'principal'):
        return school_class.school_id in schools_scope(user).values_list('id', flat=True)

    # Students: must be currently enrolled in this school class
    if user.role == 'student':
        return Enrollment.objects.filter(
            student__user=user,
            school_class=school_class,
            end_date__isnull=True
        ).exists()

    # Parents: if their ward is enrolled in this class
    if user.role == 'parent':
        return Enrollment.objects.filter(
            student__guardians=user,
            school_class=school_class,
            end_date__isnull=True
        ).exists()

    # Teachers: must be specifically assigned to this subject in this class
    if user.role == 'teacher':
        if ClassSubjectTeacher.objects.filter(school_class=school_class, subject=subject, teacher=user).exists():
            return True
        # Fallback: If no explicit assignment exists in ClassSubjectTeacher and teacher is lead teacher of the class
        has_assignment = ClassSubjectTeacher.objects.filter(school_class=school_class, subject=subject).exists()
        if not has_assignment and school_class.teacher_id == user.id:
            return True
        return False

    return False


def _message_row(m):
    reply_snippet = None
    if m.reply_to:
        reply_snippet = {
            'id': m.reply_to_id,
            'sender_name': m.reply_to.get_full_name() or m.reply_to.username,
            'message': m.reply_to.message[:80],
        }

    return {
        'id': m.id,
        'school_class': m.school_class_id,
        'subject': m.subject_id,
        'sender_id': m.sender_id,
        'sender_name': m.sender.get_full_name() or m.sender.username,
        'sender_role': m.sender.role,
        'sender_avatar_color': getattr(m.sender, 'avatar_color', '#8276da'),
        'message': m.message,
        'is_teacher_answer': m.is_teacher_answer,
        'reply_to': reply_snippet,
        'created_at': m.created_at.isoformat(),
    }


@api_view(['GET'])
def channels(request):
    """Returns available classes and subjects for the current user."""
    user = request.user
    _require_user(user)

    classes_data = []

    if user.role == 'student':
        # Classes the student is enrolled in
        enrolled_class_ids = Enrollment.objects.filter(
            student__user=user,
            end_date__isnull=True
        ).values_list('school_class_id', flat=True)
        classes_qs = SchoolClass.objects.filter(id__in=enrolled_class_ids).select_related('school')
    elif user.role == 'teacher':
        # Classes where teacher is assigned to at least one subject (or is lead teacher)
        assigned_class_ids = set(
            ClassSubjectTeacher.objects.filter(teacher=user).values_list('school_class_id', flat=True)
        )
        lead_class_ids = set(
            SchoolClass.objects.filter(teacher=user).values_list('id', flat=True)
        )
        all_class_ids = assigned_class_ids | lead_class_ids
        classes_qs = SchoolClass.objects.filter(id__in=all_class_ids).select_related('school')
    elif user.role == 'parent':
        ward_class_ids = Enrollment.objects.filter(
            student__guardians=user,
            end_date__isnull=True
        ).values_list('school_class_id', flat=True)
        classes_qs = SchoolClass.objects.filter(id__in=ward_class_ids).select_related('school')
    else:
        # Admins & Principals
        classes_qs = SchoolClass.objects.filter(school__in=schools_scope(user)).select_related('school')

    for sc in classes_qs:
        subjects_qs = Subject.objects.filter(school=sc.school).order_by('name')
        assignments = {
            cst.subject_id: cst.teacher
            for cst in ClassSubjectTeacher.objects.filter(school_class=sc).select_related('teacher')
        }

        subj_list = []
        for s in subjects_qs:
            assigned_teacher = assignments.get(s.id) or (sc.teacher if s.id not in assignments else None)
            can_access = _can_access_subject_chat(user, sc, s)

            # Teachers only see subjects they can access
            if user.role == 'teacher' and not can_access:
                continue

            subj_list.append({
                'id': s.id,
                'name': s.name,
                'code': s.code,
                'teacher_id': assigned_teacher.id if assigned_teacher else None,
                'teacher_name': (assigned_teacher.get_full_name() or assigned_teacher.username) if assigned_teacher else 'Unassigned',
                'can_chat': can_access,
            })

        if subj_list or user.role in ('organisation_admin', 'school_admin', 'principal'):
            classes_data.append({
                'id': sc.id,
                'name': sc.name,
                'grade_level': sc.grade_level,
                'school_id': sc.school_id,
                'school_name': sc.school.name,
                'subjects': subj_list,
            })

    return Response({'classes': classes_data})


@api_view(['GET', 'POST'])
def messages(request):
    """Fetch messages or post a new message in a class subject discussion."""
    user = request.user
    _require_user(user)

    if request.method == 'GET':
        class_id = request.query_params.get('school_class')
        subject_id = request.query_params.get('subject')
        if not class_id or not subject_id:
            raise ValidationError({'detail': 'Both school_class and subject are required.'})

        school_class = SchoolClass.objects.filter(pk=class_id).first()
        subject = Subject.objects.filter(pk=subject_id).first()
        if not school_class or not subject:
            raise NotFound('Class or subject not found.')

        if not _can_access_subject_chat(user, school_class, subject):
            raise PermissionDenied('You do not have access to this subject discussion channel.')

        msgs = SubjectMessage.objects.filter(
            school_class=school_class,
            subject=subject
        ).select_related('sender', 'reply_to', 'reply_to__sender')[:200]

        return Response({'results': [_message_row(m) for m in msgs]})

    # POST - Create message
    class_id = request.data.get('school_class')
    subject_id = request.data.get('subject')
    text = (request.data.get('message') or '').strip()
    reply_to_id = request.data.get('reply_to')

    if not class_id or not subject_id:
        raise ValidationError({'detail': 'Both school_class and subject are required.'})
    if not text:
        raise ValidationError({'message': 'Message cannot be empty.'})

    school_class = SchoolClass.objects.filter(pk=class_id).first()
    subject = Subject.objects.filter(pk=subject_id).first()
    if not school_class or not subject:
        raise NotFound('Class or subject not found.')

    if not _can_access_subject_chat(user, school_class, subject):
        raise PermissionDenied('You do not have permission to post in this subject discussion.')

    reply_to = None
    if reply_to_id:
        reply_to = SubjectMessage.objects.filter(pk=reply_to_id, school_class=school_class, subject=subject).first()

    # Automatically flag teacher responses as answers
    is_teacher = user.role == 'teacher' or (user.role in ('principal', 'school_admin', 'organisation_admin') and request.data.get('is_answer'))

    msg = SubjectMessage.objects.create(
        school_class=school_class,
        subject=subject,
        sender=user,
        message=text,
        is_teacher_answer=is_teacher,
        reply_to=reply_to
    )

    return Response(_message_row(msg), status=201)


@api_view(['POST'])
def assign_teacher(request):
    """Assigns or updates a teacher for a specific subject in a class."""
    user = request.user
    _require_user(user)

    if user.role not in ('organisation_admin', 'school_admin', 'principal') and not user.is_superuser:
        raise PermissionDenied('Only administrators and principals can assign subject teachers.')

    class_id = request.data.get('school_class')
    subject_id = request.data.get('subject')
    teacher_id = request.data.get('teacher')

    if not class_id or not subject_id or not teacher_id:
        raise ValidationError({'detail': 'school_class, subject, and teacher are required.'})

    school_class = SchoolClass.objects.filter(pk=class_id, school__in=schools_scope(user)).first()
    if not school_class:
        raise NotFound('Class not found within your scope.')

    subject = Subject.objects.filter(pk=subject_id, school=school_class.school).first()
    if not subject:
        raise NotFound('Subject does not belong to this school.')

    teacher = User.objects.filter(pk=teacher_id, role='teacher', school=school_class.school).first()
    if not teacher:
        raise ValidationError({'teacher': 'Selected user must be an active teacher in this school campus.'})

    cst, _ = ClassSubjectTeacher.objects.update_or_create(
        school_class=school_class,
        subject=subject,
        defaults={'teacher': teacher}
    )

    return Response({
        'id': cst.id,
        'school_class': school_class.id,
        'subject': subject.id,
        'teacher_id': teacher.id,
        'teacher_name': teacher.get_full_name() or teacher.username,
        'status': 'assigned'
    })
