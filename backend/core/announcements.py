"""Institutional and campus announcements targeted by audience role.

Provides broadcast messaging for:
- All users
- Students
- Staff
- Teachers
- Principals
- Parents
"""
from datetime import date
from django.db import transaction
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import Announcement, Notification, School, User
from core.services.access import schools_scope
from core.services.audit import record_event

MANAGERS = ('organisation_admin', 'school_admin', 'principal')
VALID_TARGETS = ['all', 'students', 'staff', 'teachers', 'principals', 'parents']
VALID_PRIORITIES = ['normal', 'important', 'urgent']


def _require_manager(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Authentication required')
    if not user.is_superuser and user.role not in MANAGERS:
        raise PermissionDenied('Managing announcements requires administrator or principal privileges.')


def _serialize(a):
    return {
        'id': a.id,
        'school_id': a.school_id,
        'school_name': a.school.name if a.school else 'All Campuses (Organisation-wide)',
        'title': a.title,
        'content': a.content,
        'target_role': a.target_role,
        'priority': a.priority,
        'pinned': a.pinned,
        'created_by': (a.created_by.get_full_name() or a.created_by.username) if a.created_by else 'System',
        'created_at': a.created_at.isoformat(),
        'updated_at': a.updated_at.isoformat(),
        'expires_at': a.expires_at.isoformat() if a.expires_at else None,
    }


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def announcements_list(request):
    user = request.user
    today = date.today()

    if request.method == 'GET':
        user_schools = schools_scope(user)
        qs = Announcement.objects.filter(Q(school__in=user_schools) | Q(school__isnull=True))

        if request.query_params.get('include_expired') != '1':
            qs = qs.filter(Q(expires_at__gte=today) | Q(expires_at__isnull=True))

        if not user.is_superuser and user.role not in MANAGERS:
            if user.role == 'student':
                qs = qs.filter(target_role__in=['all', 'students'])
            elif user.role == 'teacher':
                qs = qs.filter(target_role__in=['all', 'teachers', 'staff'])
            elif user.role == 'parent':
                qs = qs.filter(target_role__in=['all', 'parents'])
            else:
                qs = qs.filter(target_role__in=['all', 'staff'])

        target = request.query_params.get('target')
        if target and target in VALID_TARGETS:
            qs = qs.filter(target_role=target)

        priority = request.query_params.get('priority')
        if priority and priority in VALID_PRIORITIES:
            qs = qs.filter(priority=priority)

        school_id = request.query_params.get('school')
        if school_id:
            try:
                qs = qs.filter(school_id=int(school_id))
            except (ValueError, TypeError):
                pass

        search = (request.query_params.get('q') or '').strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(content__icontains=search))

        results = [_serialize(a) for a in qs]
        return Response({
            'results': results,
            'summary': {
                'total': len(results),
                'urgent': sum(1 for r in results if r['priority'] == 'urgent'),
                'pinned': sum(1 for r in results if r['pinned']),
            }
        })

    # POST: Create announcement
    _require_manager(user)
    data = request.data or {}
    title = (data.get('title') or '').strip()
    if not title:
        raise ValidationError({'title': 'Announcement title is required.'})

    content = (data.get('content') or '').strip()
    if not content:
        raise ValidationError({'content': 'Announcement content message is required.'})

    target_role = (data.get('target_role') or 'all').strip().lower()
    if target_role not in VALID_TARGETS:
        raise ValidationError({'target_role': f"Target role must be one of: {', '.join(VALID_TARGETS)}"})

    priority = (data.get('priority') or 'normal').strip().lower()
    if priority not in VALID_PRIORITIES:
        raise ValidationError({'priority': f"Priority must be one of: {', '.join(VALID_PRIORITIES)}"})

    pinned = bool(data.get('pinned', False))

    school = None
    school_id = data.get('school')
    if school_id:
        school = schools_scope(user).filter(pk=school_id).first()
        if not school:
            raise ValidationError({'school': 'Campus not found in your authorised scope.'})
    elif user.role != 'organisation_admin' and not user.is_superuser:
        school = user.school

    expires_at = None
    if data.get('expires_at'):
        try:
            expires_at = date.fromisoformat(data['expires_at'])
        except ValueError:
            raise ValidationError({'expires_at': 'Use YYYY-MM-DD format.'})

    with transaction.atomic():
        ann = Announcement.objects.create(
            school=school,
            title=title[:200],
            content=content,
            target_role=target_role,
            priority=priority,
            pinned=pinned,
            created_by=user,
            expires_at=expires_at
        )
        record_event(actor=user, action='create', obj=ann)

        if priority in ('important', 'urgent'):
            notif_users = User.objects.filter(is_active=True)
            if school:
                notif_users = notif_users.filter(school=school)
            elif user.organisation:
                notif_users = notif_users.filter(organisation=user.organisation)

            if target_role == 'students':
                notif_users = notif_users.filter(role='student')
            elif target_role == 'teachers':
                notif_users = notif_users.filter(role='teacher')
            elif target_role == 'principals':
                notif_users = notif_users.filter(role='principal')
            elif target_role == 'parents':
                notif_users = notif_users.filter(role='parent')

            notifications = [
                Notification(
                    user=u,
                    title=f"[{priority.upper()}] {title}",
                    body=content[:250]
                )
                for u in notif_users[:500]
            ]
            if notifications:
                Notification.objects.bulk_create(notifications)

    return Response(_serialize(ann), status=201)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def announcement_detail(request, pk):
    user = request.user
    ann = Announcement.objects.filter(pk=pk).first()
    if not ann:
        raise NotFound('Announcement not found.')

    if ann.school and ann.school not in schools_scope(user):
        raise PermissionDenied('Outside your authorised campus scope.')

    if request.method == 'GET':
        return Response(_serialize(ann))

    _require_manager(user)

    if request.method == 'DELETE':
        with transaction.atomic():
            record_event(actor=user, action='delete', obj=ann)
            ann.delete()
        return Response({'success': True, 'detail': 'Announcement deleted successfully.'})

    data = request.data or {}
    changed = []
    if 'title' in data:
        t = (data['title'] or '').strip()
        if not t:
            raise ValidationError({'title': 'Title cannot be blank.'})
        ann.title = t[:200]
        changed.append('title')

    if 'content' in data:
        c = (data['content'] or '').strip()
        if not c:
            raise ValidationError({'content': 'Content cannot be blank.'})
        ann.content = c
        changed.append('content')

    if 'target_role' in data:
        tr = str(data['target_role']).strip().lower()
        if tr not in VALID_TARGETS:
            raise ValidationError({'target_role': f"Must be one of: {', '.join(VALID_TARGETS)}"})
        ann.target_role = tr
        changed.append('target_role')

    if 'priority' in data:
        p = str(data['priority']).strip().lower()
        if p not in VALID_PRIORITIES:
            raise ValidationError({'priority': f"Must be one of: {', '.join(VALID_PRIORITIES)}"})
        ann.priority = p
        changed.append('priority')

    if 'pinned' in data:
        ann.pinned = bool(data['pinned'])
        changed.append('pinned')

    if 'expires_at' in data:
        if data['expires_at']:
            try:
                ann.expires_at = date.fromisoformat(data['expires_at'])
            except ValueError:
                raise ValidationError({'expires_at': 'Use YYYY-MM-DD format.'})
        else:
            ann.expires_at = None
        changed.append('expires_at')

    with transaction.atomic():
        ann.save()
        record_event(actor=user, action='update', obj=ann, changed_fields=changed)

    return Response(_serialize(ann))
