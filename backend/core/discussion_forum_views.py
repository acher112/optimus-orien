"""
Academic Q&A and Community Discussion Forum Views.
Provides multi-scope academic query sharing:
- Our Campus Teachers Only (campus_teachers)
- Our Campus Students Only (campus_students)
- Our Campus Staff & Students All (campus_staff_all)
- All Campuses / Branches (all_campuses)
- Worldwide / Global Network (worldwide)
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.db.models import Q, Count
from django.shortcuts import get_object_or_404

from core.models import (
    User, School, Subject, SchoolClass,
    QADiscussionQuestion, QADiscussionAnswer
)


def can_user_participate_in_scope(user, question):
    """
    Evaluates whether the given user has permission to post answers/replies
    based on the question's audience_scope and the user's role & campus affiliation.
    """
    if not user or not user.is_authenticated:
        return False, "Authentication required."

    if question.status == 'closed':
        return False, "This discussion is closed for further answers."

    scope = question.audience_scope

    # Worldwide: Open to all authenticated users
    if scope == 'worldwide':
        return True, "Eligible"

    # Superuser or platform admin has global bypass
    if getattr(user, 'is_superuser', False) or getattr(user, 'role', '') == 'platform_admin':
        return True, "Platform administrator privilege"

    # All Campuses: Open to users belonging to the same organisation
    if scope == 'all_campuses':
        if question.school and question.school.organisation_id:
            if user.organisation_id == question.school.organisation_id:
                return True, "Eligible"
            return False, "Only staff and students within the same school network/organisation can answer this question."
        return True, "Eligible"

    # Campus-specific scopes require matching campus
    if not user.school_id or user.school_id != question.school_id:
        return False, "This question is restricted to members of the publishing campus."

    # Scope: Our Campus Teachers Only
    if scope == 'campus_teachers':
        faculty_roles = {'teacher', 'principal', 'school_admin', 'organisation_admin'}
        if user.role in faculty_roles:
            return True, "Eligible"
        return False, "This discussion is restricted to faculty and teachers of this campus only."

    # Scope: Our Campus Students Only
    if scope == 'campus_students':
        if user.role == 'student':
            return True, "Eligible"
        # Faculty can also guide/moderate student queries
        if user.role in {'teacher', 'principal', 'school_admin'}:
            return True, "Eligible (Faculty Moderator)"
        return False, "This discussion is aimed at students of this campus."

    # Scope: Our Campus Staff & Students (All)
    if scope == 'campus_staff_all':
        return True, "Eligible"

    return False, "Permission denied."


def can_user_view_question(user, question):
    """
    Determines visibility of a question.
    """
    if not user or not user.is_authenticated:
        return False

    if getattr(user, 'is_superuser', False) or getattr(user, 'role', '') == 'platform_admin':
        return True

    scope = question.audience_scope
    if scope == 'worldwide':
        return True

    if scope == 'all_campuses':
        if question.school and question.school.organisation_id:
            return user.organisation_id == question.school.organisation_id
        return True

    # For campus-level questions:
    if question.school_id and user.school_id == question.school_id:
        return True

    # Organisation admin can inspect campus discussions
    if getattr(user, 'role', '') == 'organisation_admin' and question.school:
        return user.organisation_id == question.school.organisation_id

    return False


def serialize_author(user, role_fallback=''):
    if not user:
        return {
            'id': None,
            'name': 'Anonymous',
            'username': 'anonymous',
            'role': role_fallback or 'member',
            'avatar_color': '#64748b',
            'avatar_image': ''
        }
    full_name = f"{user.first_name} {user.last_name}".strip()
    return {
        'id': user.id,
        'name': full_name or user.username,
        'username': user.username,
        'role': getattr(user, 'role', '') or role_fallback,
        'avatar_color': getattr(user, 'avatar_color', '#06b6d4'),
        'avatar_image': getattr(user, 'avatar_image', '') or ''
    }


def serialize_question_summary(q, current_user=None):
    subject_display = q.subject.name if q.subject else (q.custom_subject or 'General / Interdisciplinary')
    class_display = q.school_class.name if q.school_class else (q.class_grade_label or '')
    campus_name = q.school.name if q.school else 'Global Network'
    
    # Check answers count
    answers_count = getattr(q, 'answers_count', None)
    if answers_count is None:
        answers_count = q.answers.count()

    has_accepted = getattr(q, 'has_accepted', None)
    if has_accepted is None:
        has_accepted = q.answers.filter(is_accepted_solution=True).exists()

    can_reply, reply_reason = can_user_participate_in_scope(current_user, q) if current_user else (False, '')

    return {
        'id': q.id,
        'title': q.title,
        'body_preview': (q.body[:180] + '...') if len(q.body) > 180 else q.body,
        'category': q.category,
        'subject_id': q.subject_id,
        'subject_name': subject_display,
        'is_custom_subject': bool(q.custom_subject and not q.subject),
        'class_id': q.school_class_id,
        'class_name': class_display,
        'school_id': q.school_id,
        'school_name': campus_name,
        'audience_scope': q.audience_scope,
        'audience_scope_label': q.get_audience_scope_display(),
        'status': q.status,
        'status_label': q.get_status_display(),
        'author': serialize_author(q.author_user, q.author_role),
        'upvotes_count': q.upvotes_count,
        'views_count': q.views_count,
        'answers_count': answers_count,
        'has_accepted_solution': has_accepted,
        'can_reply': can_reply,
        'created_at': q.created_at.isoformat(),
        'updated_at': q.updated_at.isoformat(),
    }


class QADiscussionListView(APIView):
    """
    GET /api/v1/communication/discussions/
    Lists questions filtered by scope, category, subject, status, campus, or search query.
    Also returns overall forum statistics.

    POST /api/v1/communication/discussions/
    Creates a new academic discussion question with targeted scope and subject.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        qs = QADiscussionQuestion.objects.select_related(
            'subject', 'school_class', 'school', 'author_user'
        ).annotate(
            answers_count=Count('answers')
        )

        # Basic visibility filtering
        if not getattr(user, 'is_superuser', False) and getattr(user, 'role', '') != 'platform_admin':
            visibility_q = Q(audience_scope='worldwide')
            if user.school_id:
                visibility_q |= Q(school_id=user.school_id)
            if user.organisation_id:
                visibility_q |= Q(audience_scope='all_campuses', school__organisation_id=user.organisation_id)
            qs = qs.filter(visibility_q)

        # Scope filter
        scope = request.query_params.get('scope', '').strip()
        if scope and scope != 'all':
            if scope == 'my_campus':
                qs = qs.filter(school_id=user.school_id)
            else:
                qs = qs.filter(audience_scope=scope)

        # Status filter
        status_param = request.query_params.get('status', '').strip()
        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param)

        # Category filter
        category = request.query_params.get('category', '').strip()
        if category and category != 'all':
            qs = qs.filter(category__iexact=category)

        # Subject filter (id or text match)
        subject_filter = request.query_params.get('subject', '').strip()
        if subject_filter and subject_filter != 'all':
            if subject_filter.isdigit():
                qs = qs.filter(subject_id=int(subject_filter))
            else:
                qs = qs.filter(Q(subject__name__icontains=subject_filter) | Q(custom_subject__icontains=subject_filter))

        # Search filter
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(body__icontains=search) | Q(custom_subject__icontains=search))

        # Campus filter
        campus_id = request.query_params.get('campus_id')
        if campus_id and campus_id.isdigit():
            qs = qs.filter(school_id=int(campus_id))

        # Ordering
        ordering = request.query_params.get('ordering', '-created_at')
        if ordering in ['-created_at', 'created_at', '-upvotes_count', '-views_count']:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by('-created_at')

        # Limit to recent 100 for performance
        questions = qs[:100]

        # Calculate high-level stats for forum header
        base_qs = QADiscussionQuestion.objects.all()
        if not getattr(user, 'is_superuser', False) and getattr(user, 'role', '') != 'platform_admin':
            vis = Q(audience_scope='worldwide')
            if user.school_id:
                vis |= Q(school_id=user.school_id)
            if user.organisation_id:
                vis |= Q(audience_scope='all_campuses', school__organisation_id=user.organisation_id)
            base_qs = base_qs.filter(vis)

        total_queries = base_qs.count()
        worldwide_count = base_qs.filter(audience_scope='worldwide').count()
        campus_queries = base_qs.filter(school_id=user.school_id).count() if user.school_id else 0
        solved_count = base_qs.filter(status='answered').count()
        my_queries = base_qs.filter(author_user=user).count()

        results = [serialize_question_summary(q, current_user=user) for q in questions]

        return Response({
            'stats': {
                'total_queries': total_queries,
                'worldwide_count': worldwide_count,
                'campus_queries': campus_queries,
                'solved_count': solved_count,
                'my_queries': my_queries,
            },
            'count': len(results),
            'results': results,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        user = request.user
        data = request.data

        title = str(data.get('title', '')).strip()
        body = str(data.get('body', '')).strip()
        category = str(data.get('category', 'Academic Doubt')).strip() or 'Academic Doubt'
        audience_scope = str(data.get('audience_scope', 'worldwide')).strip()

        if not title:
            return Response({'detail': 'Question title is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not body:
            return Response({'detail': 'Question description/body is required.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_scopes = {choice[0] for choice in QADiscussionQuestion.SCOPE_CHOICES}
        if audience_scope not in valid_scopes:
            audience_scope = 'worldwide'

        # Subject resolution
        subject = None
        custom_subject = str(data.get('custom_subject', '')).strip()
        subject_id = data.get('subject_id')
        if subject_id:
            subject = Subject.objects.filter(id=subject_id).first()

        # Class / Grade resolution
        school_class = None
        class_grade_label = str(data.get('class_grade_label', '')).strip()
        class_id = data.get('class_id')
        if class_id:
            school_class = SchoolClass.objects.filter(id=class_id).first()
            if school_class and not class_grade_label:
                class_grade_label = school_class.name

        # Campus affiliation
        school = user.school
        if not school and data.get('school_id'):
            school = School.objects.filter(id=data.get('school_id')).first()

        # Campus-specific scopes require school
        if audience_scope in {'campus_teachers', 'campus_students', 'campus_staff_all'} and not school:
            return Response({
                'detail': 'Campus-scoped questions require an associated campus affiliation.'
            }, status=status.HTTP_400_BAD_REQUEST)

        question = QADiscussionQuestion.objects.create(
            title=title,
            body=body,
            category=category,
            subject=subject,
            custom_subject=custom_subject,
            school_class=school_class,
            class_grade_label=class_grade_label,
            school=school,
            audience_scope=audience_scope,
            author_user=user,
            author_role=getattr(user, 'role', ''),
            status='open',
            upvotes_count=0,
            views_count=1
        )

        return Response(serialize_question_summary(question, current_user=user), status=status.HTTP_201_CREATED)


class QADiscussionDetailView(APIView):
    """
    GET /api/v1/communication/discussions/<pk>/
    Returns full question thread including all answers and reply permissions.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        user = request.user
        question = get_object_or_404(
            QADiscussionQuestion.objects.select_related('subject', 'school_class', 'school', 'author_user'),
            pk=pk
        )

        if not can_user_view_question(user, question):
            return Response({'detail': 'You do not have permission to view this discussion.'}, status=status.HTTP_403_FORBIDDEN)

        # Increment view count
        QADiscussionQuestion.objects.filter(pk=pk).update(views_count=question.views_count + 1)
        question.views_count += 1

        can_reply, reply_reason = can_user_participate_in_scope(user, question)

        # Check if user can mark solution
        is_author = (user.id == question.author_user_id)
        is_faculty_leader = user.role in {'teacher', 'principal', 'school_admin', 'platform_admin'}
        can_mark_solution = (is_author or is_faculty_leader)

        answers_qs = question.answers.select_related('author_user').order_by('-is_accepted_solution', 'created_at')
        answers_data = []
        for ans in answers_qs:
            answers_data.append({
                'id': ans.id,
                'author': serialize_author(ans.author_user, ans.author_role),
                'body': ans.body,
                'is_accepted_solution': ans.is_accepted_solution,
                'helpful_count': ans.helpful_count,
                'created_at': ans.created_at.isoformat(),
                'updated_at': ans.updated_at.isoformat(),
            })

        summary = serialize_question_summary(question, current_user=user)
        summary['body'] = question.body
        summary['can_reply'] = can_reply
        summary['reply_permission_reason'] = reply_reason
        summary['can_mark_solution'] = can_mark_solution
        summary['answers'] = answers_data

        return Response(summary, status=status.HTTP_200_OK)


class QADiscussionAnswerCreateView(APIView):
    """
    POST /api/v1/communication/discussions/<pk>/answers/
    Adds an answer or opinion to the discussion thread after enforcing audience_scope permissions.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        question = get_object_or_404(
            QADiscussionQuestion.objects.select_related('school'),
            pk=pk
        )

        can_reply, reason = can_user_participate_in_scope(user, question)
        if not can_reply:
            return Response({'detail': reason}, status=status.HTTP_403_FORBIDDEN)

        body = str(request.data.get('body', '')).strip()
        if not body or len(body) < 2:
            return Response({'detail': 'Answer body is required (minimum 2 characters).'}, status=status.HTTP_400_BAD_REQUEST)

        answer = QADiscussionAnswer.objects.create(
            question=question,
            author_user=user,
            author_role=getattr(user, 'role', ''),
            body=body,
            is_accepted_solution=False,
            helpful_count=0
        )

        return Response({
            'id': answer.id,
            'question_id': question.id,
            'author': serialize_author(user, getattr(user, 'role', '')),
            'body': answer.body,
            'is_accepted_solution': False,
            'helpful_count': 0,
            'created_at': answer.created_at.isoformat(),
            'updated_at': answer.updated_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class QADiscussionAcceptSolutionView(APIView):
    """
    POST /api/v1/communication/discussions/<pk>/accept-solution/
    Marks a specific answer as the accepted solution and marks the question answered.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        user = request.user
        question = get_object_or_404(QADiscussionQuestion, pk=pk)

        is_author = (user.id == question.author_user_id)
        is_faculty_leader = user.role in {'teacher', 'principal', 'school_admin', 'platform_admin'}
        if not (is_author or is_faculty_leader):
            return Response({
                'detail': 'Only the question author or campus faculty can mark an accepted solution.'
            }, status=status.HTTP_403_FORBIDDEN)

        answer_id = request.data.get('answer_id')
        if not answer_id:
            return Response({'detail': 'answer_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        answer = get_object_or_404(QADiscussionAnswer, pk=answer_id, question=question)

        # Clear existing accepted solution if any, and set this one
        question.answers.all().update(is_accepted_solution=False)
        answer.is_accepted_solution = True
        answer.save(update_fields=['is_accepted_solution'])

        question.status = 'answered'
        question.save(update_fields=['status'])

        return Response({
            'detail': 'Solution accepted successfully.',
            'question_status': question.status,
            'accepted_answer_id': answer.id
        }, status=status.HTTP_200_OK)


class QADiscussionHelpfulView(APIView):
    """
    POST /api/v1/communication/discussions/<pk>/helpful/
    Upvotes a question or marks an answer helpful.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        question = get_object_or_404(QADiscussionQuestion, pk=pk)
        answer_id = request.data.get('answer_id')

        if answer_id:
            answer = get_object_or_404(QADiscussionAnswer, pk=answer_id, question=question)
            answer.helpful_count += 1
            answer.save(update_fields=['helpful_count'])
            return Response({
                'detail': 'Answer upvoted.',
                'helpful_count': answer.helpful_count
            }, status=status.HTTP_200_OK)

        # Upvote question
        question.upvotes_count += 1
        question.save(update_fields=['upvotes_count'])
        return Response({
            'detail': 'Question upvoted.',
            'upvotes_count': question.upvotes_count
        }, status=status.HTTP_200_OK)
