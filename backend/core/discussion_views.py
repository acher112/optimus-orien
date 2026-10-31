from datetime import timedelta
from django.db import transaction
from django.db.models import Q, Count
from django.http import Http404
from django.utils import timezone
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError

from core.models import (
    DiscussionThread, DiscussionPost, DiscussionReport, DiscussionMute,
    School, SchoolClass, Subject, ClassSubject, Student, User
)
from core.services.teacher_scope import get_teacher_scope
from core.services.discussion_safety import check_discussion_content, check_student_mute


def _format_author(user, student=None, school_class=None, subject=None):
    """
    Formats the author display name:
    - Students: 'Sophia A.' (First Name + Last Initial.) to protect privacy.
    - Staff: Full name + explicit role badge ('Mathematics Teacher', 'Class Teacher', 'Principal').
    """
    if student:
        initial = f" {student.last_name[0]}." if student.last_name else ""
        return {
            'id': user.id,
            'name': f"{student.first_name}{initial}",
            'is_student': True,
            'role_label': 'Student'
        }

    full_name = user.get_full_name() or user.username
    role_label = 'Staff'
    if user.role == 'principal':
        role_label = 'Principal'
    elif user.role in ('school_admin', 'organisation_admin') or user.is_superuser:
        role_label = 'Administrator'
    elif user.role == 'teacher' and school_class:
        scope = get_teacher_scope(user)
        if subject and scope.teaches_subject(school_class.id, subject.id):
            role_label = f"{subject.name} Teacher"
        elif scope.is_class_teacher(school_class.id):
            role_label = "Class Teacher"
        else:
            role_label = "Teacher"

    return {
        'id': user.id,
        'name': f"{full_name} ({role_label})",
        'is_student': False,
        'role_label': role_label
    }


def _resolve_scope_for_discussion(user, request):
    """
    Returns allowed school_class ids and student record for the user.
    """
    if user.role == 'student':
        student = Student.objects.filter(user=user).select_related('school').first()
        if not student:
            raise NotFound("Student profile not found.")
        enr = student.enrollments.filter(end_date__isnull=True).first()
        if not enr:
            return student.school, [], student
        return student.school, [enr.school_class_id], student

    if user.role == 'parent':
        child_id = request.query_params.get('student_id')
        ward = user.wards.filter(id=child_id).first() if child_id else user.wards.first()
        if not ward:
            raise NotFound("Ward not found.")
        if not ward.school.parents_can_view_discussion:
            raise PermissionDenied("Class discussion viewing is not enabled for parents by your school.")
        enr = ward.enrollments.filter(end_date__isnull=True).first()
        if not enr:
            return ward.school, [], None
        return ward.school, [enr.school_class_id], None

    if user.role == 'teacher':
        scope = get_teacher_scope(user, request)
        school = School.objects.filter(id=user.school_id).first()
        return school, list(scope.class_ids), None

    if user.role in ('principal', 'school_admin'):
        school = School.objects.filter(id=user.school_id).first()
        cids = list(SchoolClass.objects.filter(school=school).values_list('id', flat=True))
        return school, cids, None

    # Org admin / Superuser
    campus_id = request.query_params.get('school') or request.query_params.get('school_id')
    if campus_id:
        school = School.objects.filter(id=campus_id).first()
    else:
        school = School.objects.filter(organisation_id=user.organisation_id).first() if user.organisation_id else School.objects.first()
    cids = list(SchoolClass.objects.filter(school=school).values_list('id', flat=True)) if school else []
    return school, cids, None


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def discussion_threads(request):
    """
    Part 7: Moderated Class Discussion Threads list and create.
    """
    user = request.user
    school, allowed_class_ids, student = _resolve_scope_for_discussion(user, request)
    if not school:
        raise NotFound("School campus not found.")

    # Campus switch
    if not school.discussion_enabled:
        return Response({
            'enabled': False,
            'message': 'Class discussion is currently disabled by your school administration.',
            'threads': []
        })

    if request.method == 'GET':
        class_id = request.query_params.get('class_id')
        subject_id = request.query_params.get('subject_id')
        status_filter = request.query_params.get('status')

        qs = DiscussionThread.objects.filter(school_class_id__in=allowed_class_ids).select_related(
            'school_class', 'subject', 'author_student', 'author_user'
        )

        if class_id and int(class_id) in allowed_class_ids:
            qs = qs.filter(school_class_id=int(class_id))
        if subject_id:
            qs = qs.filter(subject_id=int(subject_id))
        if status_filter:
            qs = qs.filter(status=status_filter)

        # Non-staff users never see hidden threads
        if user.role in ('student', 'parent'):
            qs = qs.filter(hidden_at__isnull=True)

        threads_data = []
        for t in qs.annotate(posts_total=Count('posts')):
            threads_data.append({
                'id': t.id,
                'title': t.title,
                'body': t.body if not t.hidden_at else "[This discussion was hidden by a moderator]",
                'status': t.status,
                'is_locked': t.is_locked,
                'is_hidden': bool(t.hidden_at),
                'hidden_reason': t.hidden_reason if (user.role not in ('student', 'parent')) else '',
                'posts_count': t.posts_total,
                'has_accepted_answer': bool(t.accepted_post_id),
                'created_at': t.created_at.isoformat(),
                'subject': {'id': t.subject.id, 'name': t.subject.name},
                'school_class': {'id': t.school_class.id, 'name': t.school_class.display_name if hasattr(t.school_class, 'display_name') else t.school_class.name},
                'author': _format_author(t.author_user, t.author_student, t.school_class, t.subject),
                'is_mine': t.author_user_id == user.id
            })

        return Response({
            'enabled': True,
            'threads': threads_data,
            'allowed_classes': allowed_class_ids
        })

    # POST: Create thread
    if user.role == 'parent':
        raise PermissionDenied("Parents have read-only access to class discussions.")

    class_id = request.data.get('school_class') or request.data.get('class_id')
    subject_id = request.data.get('subject') or request.data.get('subject_id')
    title = (request.data.get('title') or '').strip()
    body = (request.data.get('body') or '').strip()

    if not class_id or not subject_id or not title or not body:
        raise ValidationError({'detail': 'Class, subject, title, and question body are required.'})

    cid = int(class_id)
    sid = int(subject_id)

    if cid not in allowed_class_ids:
        raise PermissionDenied("You are not enrolled in or assigned to this class.")

    # Validate subject belongs to this class
    if not ClassSubject.objects.filter(school_class_id=cid, subject_id=sid).exists():
        raise ValidationError({'detail': 'Selected subject is not part of this class curriculum.'})

    # If student: check active mute and rate limits
    if user.role == 'student':
        check_student_mute(student)
        today = timezone.localdate()
        today_threads = DiscussionThread.objects.filter(author_user=user, created_at__date=today).count()
        if today_threads >= 5:
            raise ValidationError({'detail': 'You have reached the maximum limit of 5 new questions per day.'})

    # Safety checks: blocked words and phone/email/links
    check_discussion_content(f"{title} {body}", school)

    school_class = SchoolClass.objects.get(id=cid)
    subject = Subject.objects.get(id=sid)

    thread = DiscussionThread.objects.create(
        school=school,
        academic_year=school_class.academic_year,
        school_class=school_class,
        subject=subject,
        author_user=user,
        author_student=student,
        title=title,
        body=body,
        status='open'
    )

    return Response({
        'ok': True,
        'id': thread.id,
        'title': thread.title,
        'detail': 'Question posted successfully.'
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def discussion_thread_detail(request, pk):
    """
    Part 7: View thread details with replies.
    """
    user = request.user
    school, allowed_class_ids, student = _resolve_scope_for_discussion(user, request)

    try:
        thread = DiscussionThread.objects.select_related(
            'school_class', 'subject', 'author_student', 'author_user', 'accepted_post'
        ).get(pk=pk)
    except DiscussionThread.DoesNotExist:
        raise Http404("Thread not found.")

    if thread.school_class_id not in allowed_class_ids:
        raise Http404("Thread not found.")

    if thread.hidden_at and user.role in ('student', 'parent'):
        raise Http404("Thread not found.")

    posts_qs = thread.posts.select_related('author_user', 'author_student').order_by('created_at')
    if user.role in ('student', 'parent'):
        posts_qs = posts_qs.filter(hidden_at__isnull=True)

    posts_data = []
    for p in posts_qs:
        posts_data.append({
            'id': p.id,
            'body': p.body if not p.hidden_at else "[This reply was hidden by a moderator]",
            'is_accepted': thread.accepted_post_id == p.id,
            'is_hidden': bool(p.hidden_at),
            'hidden_reason': p.hidden_reason if (user.role not in ('student', 'parent')) else '',
            'created_at': p.created_at.isoformat(),
            'author': _format_author(p.author_user, p.author_student, thread.school_class, thread.subject),
            'is_mine': p.author_user_id == user.id
        })

    is_staff = user.role in ('teacher', 'principal', 'school_admin', 'organisation_admin') or user.is_superuser
    can_moderate = is_staff
    can_accept = (thread.author_user_id == user.id) or is_staff

    return Response({
        'id': thread.id,
        'title': thread.title,
        'body': thread.body if not thread.hidden_at else "[This discussion was hidden by a moderator]",
        'status': thread.status,
        'is_locked': thread.is_locked,
        'is_hidden': bool(thread.hidden_at),
        'created_at': thread.created_at.isoformat(),
        'subject': {'id': thread.subject.id, 'name': thread.subject.name},
        'school_class': {'id': thread.school_class.id, 'name': thread.school_class.display_name if hasattr(thread.school_class, 'display_name') else thread.school_class.name},
        'author': _format_author(thread.author_user, thread.author_student, thread.school_class, thread.subject),
        'posts': posts_data,
        'can_reply': not thread.is_locked and user.role != 'parent',
        'can_moderate': can_moderate,
        'can_accept': can_accept,
        'accepted_post_id': thread.accepted_post_id
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def discussion_thread_reply(request, pk):
    """
    Part 7: Post a reply to a discussion thread.
    """
    user = request.user
    if user.role == 'parent':
        raise PermissionDenied("Parents cannot post replies.")

    school, allowed_class_ids, student = _resolve_scope_for_discussion(user, request)

    try:
        thread = DiscussionThread.objects.select_related('school_class', 'subject', 'school').get(pk=pk)
    except DiscussionThread.DoesNotExist:
        raise Http404("Thread not found.")

    if thread.school_class_id not in allowed_class_ids:
        raise Http404("Thread not found.")

    if thread.is_locked:
        raise ValidationError({'detail': 'This discussion thread is locked and cannot receive new replies.'})

    body = (request.data.get('body') or '').strip()
    if not body:
        raise ValidationError({'detail': 'Reply content is required.'})

    # Student checks: mute & daily limit (max 30 replies/day)
    if user.role == 'student':
        check_student_mute(student)
        today = timezone.localdate()
        today_replies = DiscussionPost.objects.filter(author_user=user, created_at__date=today).count()
        if today_replies >= 30:
            raise ValidationError({'detail': 'Daily reply limit reached (maximum 30 replies per day).'})

    # Safety filters
    check_discussion_content(body, thread.school)

    post = DiscussionPost.objects.create(
        thread=thread,
        author_user=user,
        author_student=student,
        body=body
    )

    thread.updated_at = timezone.now()
    thread.save(update_fields=['updated_at'])

    return Response({
        'ok': True,
        'id': post.id,
        'detail': 'Reply posted successfully.'
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def discussion_thread_accept(request, pk):
    """
    Part 7: Mark an answer as accepted.
    Allowed for thread author or assigned teacher / principal / admin.
    """
    user = request.user
    school, allowed_class_ids, student = _resolve_scope_for_discussion(user, request)

    try:
        thread = DiscussionThread.objects.select_related('school_class').get(pk=pk)
    except DiscussionThread.DoesNotExist:
        raise Http404("Thread not found.")

    if thread.school_class_id not in allowed_class_ids:
        raise Http404("Thread not found.")

    is_staff = user.role in ('teacher', 'principal', 'school_admin', 'organisation_admin') or user.is_superuser
    if thread.author_user_id != user.id and not is_staff:
        raise PermissionDenied("Only the question author or a teacher can accept an answer.")

    post_id = request.data.get('post_id')
    try:
        post = thread.posts.get(id=post_id)
    except DiscussionPost.DoesNotExist:
        raise ValidationError({'detail': 'Post does not belong to this thread.'})

    thread.accepted_post = post
    thread.status = 'answered'
    thread.save(update_fields=['accepted_post', 'status'])

    return Response({'ok': True, 'detail': 'Answer marked as accepted.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def discussion_thread_lock(request, pk):
    """
    Moderation: Lock/unlock a thread. Staff only.
    """
    user = request.user
    if user.role in ('student', 'parent'):
        raise PermissionDenied("Permission denied.")

    thread = DiscussionThread.objects.filter(pk=pk).first()
    if not thread:
        raise Http404("Thread not found.")

    thread.is_locked = not thread.is_locked
    thread.save(update_fields=['is_locked'])
    return Response({'ok': True, 'is_locked': thread.is_locked})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def discussion_thread_hide(request, pk):
    """
    Moderation: Hide a thread with reason. Staff only.
    """
    user = request.user
    if user.role in ('student', 'parent'):
        raise PermissionDenied("Permission denied.")

    thread = DiscussionThread.objects.filter(pk=pk).first()
    if not thread:
        raise Http404("Thread not found.")

    reason = request.data.get('reason', 'Hidden by moderator').strip()
    thread.hidden_at = timezone.now()
    thread.hidden_by = user
    thread.hidden_reason = reason
    thread.save(update_fields=['hidden_at', 'hidden_by', 'hidden_reason'])
    return Response({'ok': True, 'detail': 'Thread hidden by moderator.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def discussion_post_hide(request, pk):
    """
    Moderation: Hide a post with reason. Staff only.
    """
    user = request.user
    if user.role in ('student', 'parent'):
        raise PermissionDenied("Permission denied.")

    post = DiscussionPost.objects.filter(pk=pk).first()
    if not post:
        raise Http404("Post not found.")

    reason = request.data.get('reason', 'Hidden by moderator').strip()
    post.hidden_at = timezone.now()
    post.hidden_by = user
    post.hidden_reason = reason
    post.save(update_fields=['hidden_at', 'hidden_by', 'hidden_reason'])
    return Response({'ok': True, 'detail': 'Post hidden by moderator.'})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def discussion_reports(request):
    """
    Part 7: Moderation reports queue.
    - POST: Students, parents, staff can submit a report.
    - GET: Staff only, list pending reports.
    """
    user = request.user
    if request.method == 'POST':
        thread_id = request.data.get('thread_id')
        post_id = request.data.get('post_id')
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            raise ValidationError({'detail': 'Report reason is required.'})

        thread = None
        post = None
        school = None

        if post_id:
            try:
                post = DiscussionPost.objects.select_related('thread__school').get(pk=post_id)
                thread = post.thread
                school = thread.school
            except DiscussionPost.DoesNotExist:
                raise NotFound("Post not found.")
        elif thread_id:
            try:
                thread = DiscussionThread.objects.select_related('school').get(pk=thread_id)
                school = thread.school
            except DiscussionThread.DoesNotExist:
                raise NotFound("Thread not found.")
        else:
            raise ValidationError({'detail': 'Either thread_id or post_id is required.'})

        DiscussionReport.objects.create(
            school=school,
            thread=thread,
            post=post,
            reporter=user,
            reason=reason,
            status='pending'
        )
        return Response({'ok': True, 'detail': 'Report submitted to moderators.'}, status=status.HTTP_201_CREATED)

    # GET: Staff list pending reports
    if user.role in ('student', 'parent'):
        raise PermissionDenied("Access denied.")

    school, allowed_class_ids, _ = _resolve_scope_for_discussion(user, request)
    qs = DiscussionReport.objects.filter(school=school, status='pending').select_related(
        'thread', 'post', 'reporter'
    ).order_by('-created_at')

    reports = []
    for r in qs:
        reports.append({
            'id': r.id,
            'reason': r.reason,
            'created_at': r.created_at.isoformat(),
            'reporter_name': r.reporter.get_full_name() or r.reporter.username,
            'thread_id': r.thread_id,
            'thread_title': r.thread.title if r.thread else '',
            'post_id': r.post_id,
            'post_snippet': r.post.body[:80] if r.post else ''
        })

    return Response(reports)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def discussion_report_resolve(request, pk):
    """
    Moderation: Staff resolves or dismisses a report.
    """
    user = request.user
    if user.role in ('student', 'parent'):
        raise PermissionDenied("Access denied.")

    report = DiscussionReport.objects.filter(pk=pk).first()
    if not report:
        raise Http404("Report not found.")

    action = request.data.get('action', 'resolved')  # resolved | dismissed
    report.status = action
    report.handled_by = user
    report.handled_at = timezone.now()
    report.save(update_fields=['status', 'handled_by', 'handled_at'])
    return Response({'ok': True, 'detail': f"Report marked as {action}."})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def discussion_student_mute(request, student_id):
    """
    Part 7: Staff mutes a student from discussions for 1, 3, or 7 days.
    """
    user = request.user
    if user.role in ('student', 'parent'):
        raise PermissionDenied("Access denied.")

    try:
        student = Student.objects.get(pk=student_id)
    except Student.DoesNotExist:
        raise Http404("Student not found.")

    days = int(request.data.get('days', 1))
    if days not in (1, 3, 7):
        days = 1
    reason = (request.data.get('reason') or 'Violation of discussion guidelines').strip()

    until = timezone.now() + timedelta(days=days)
    DiscussionMute.objects.create(
        student=student,
        until=until,
        reason=reason,
        by=user
    )

    return Response({
        'ok': True,
        'detail': f"{student.full_name} has been muted from discussions until {until.strftime('%b %d, %Y at %I:%M %p')}."
    })
