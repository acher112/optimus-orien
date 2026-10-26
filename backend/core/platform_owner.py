"""Platform owner console, SaaS subscriptions, audited support-access grants,
admin-issued invitations, holiday calendar, and timetables.
"""
import secrets
from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.contrib.auth.hashers import make_password
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    Organisation, School, SchoolClass, Subject, AcademicYear, Student, StaffMember, User,
    AuditEvent, PlatformPlan, OrganisationSubscription, SupportAccessGrant, UserInvitation,
    HolidayCalendar, ClassTimetable
)
from core.services.access import schools_scope
from core.services.audit import record_event


def _require_superuser(user):
    if not user.is_authenticated or not user.is_active or not user.is_superuser:
        raise PermissionDenied('Platform owner access required.')


def _require_org_or_superuser(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')
    if not user.is_superuser and user.role != 'organisation_admin':
        raise PermissionDenied('Organisation administrator access required.')


# ------------------------------------------------------------------ Platform Overview & Plans
@api_view(['GET'])
def platform_overview(request):
    """High-level SaaS health metrics for the platform owner."""
    user = request.user
    _require_superuser(user)

    orgs_count = Organisation.objects.count()
    schools_count = School.objects.count()
    students_count = Student.objects.count()
    staff_count = StaffMember.objects.filter(status='active').count()

    subscriptions = OrganisationSubscription.objects.select_related('organisation', 'plan')
    subs_list = [{
        'id': s.id,
        'organisation_name': s.organisation.name,
        'organisation_code': s.organisation.code,
        'plan_name': s.plan.name,
        'billing_basis': s.plan.billing_basis,
        'status': s.status,
        'active_students_count': s.active_students_count,
        'monthly_amount': str(s.monthly_amount),
        'started_on': str(s.started_on),
        'renewal_date': str(s.renewal_date) if s.renewal_date else None,
    } for s in subscriptions]

    plans = PlatformPlan.objects.all()
    plans_list = [{
        'id': p.id,
        'name': p.name,
        'billing_basis': p.billing_basis,
        'price_per_unit': str(p.price_per_unit),
        'currency': p.currency,
        'active': p.active,
        'subscribers_count': p.subscriptions.count()
    } for p in plans]

    recent_audits = AuditEvent.objects.order_by('-created_at')[:15]
    audits_list = [{
        'id': a.id,
        'actor': a.actor.username if a.actor else 'System',
        'action': a.action,
        'resource': a.resource,
        'school_name': a.school.name if a.school else (a.organisation.name if a.organisation else 'Global'),
        'created_at': a.created_at.isoformat()
    } for a in recent_audits]

    return Response({
        'kpis': {
            'organisations_count': orgs_count,
            'schools_count': schools_count,
            'students_count': students_count,
            'active_staff_count': staff_count,
        },
        'subscriptions': subs_list,
        'plans': plans_list,
        'recent_audits': audits_list
    })


@api_view(['GET', 'POST'])
def platform_plans(request):
    user = request.user
    _require_superuser(user)

    if request.method == 'GET':
        plans = PlatformPlan.objects.all()
        return Response({'results': [{
            'id': p.id, 'name': p.name, 'billing_basis': p.billing_basis,
            'price_per_unit': str(p.price_per_unit), 'currency': p.currency, 'active': p.active
        } for p in plans]})

    name = (request.data.get('name') or '').strip()[:80]
    basis = request.data.get('billing_basis', 'per_student')
    price = Decimal(str(request.data.get('price_per_unit', '1.00')))
    currency = request.data.get('currency', 'USD')

    plan = PlatformPlan.objects.create(
        name=name,
        billing_basis=basis,
        price_per_unit=price,
        currency=currency,
        active=True
    )
    record_event(actor=user, action='create', obj=plan)
    return Response({'id': plan.id, 'name': plan.name}, status=201)


# ------------------------------------------------------------------ Support Access Grants
@api_view(['GET', 'POST'])
def support_grants(request):
    """Institutional support grants: allow external platform support into school data."""
    user = request.user
    _require_org_or_superuser(user)

    if request.method == 'GET':
        qs = SupportAccessGrant.objects.all().select_related('organisation', 'school', 'granted_by', 'granted_to')
        if not user.is_superuser:
            qs = qs.filter(organisation_id=user.organisation_id)

        now = timezone.now()
        results = [{
            'id': g.id,
            'organisation_name': g.organisation.name,
            'school_name': g.school.name if g.school else 'All Campuses',
            'granted_by': g.granted_by.username,
            'granted_to': g.granted_to.username,
            'reason': g.reason,
            'starts_at': g.starts_at.isoformat(),
            'expires_at': g.expires_at.isoformat(),
            'is_valid': g.is_active and (g.starts_at <= now <= g.expires_at) and not g.revoked_at,
            'revoked_at': g.revoked_at.isoformat() if g.revoked_at else None
        } for g in qs]
        return Response({'results': results})

    # POST: create a new support grant
    org = user.organisation if not user.is_superuser else Organisation.objects.filter(pk=request.data.get('organisation')).first()
    if not org:
        raise ValidationError({'organisation': 'Valid organisation required.'})

    granted_to_id = request.data.get('granted_to')
    granted_to = User.objects.filter(pk=granted_to_id, is_active=True).first()
    if not granted_to:
        raise ValidationError({'granted_to': 'Select a valid support agent user.'})

    hours = int(request.data.get('duration_hours', 24))
    reason = (request.data.get('reason') or '').strip()[:255]
    if not reason:
        raise ValidationError({'reason': 'Audit justification reason is required.'})

    school = None
    if request.data.get('school'):
        school = School.objects.filter(pk=request.data['school'], organisation=org).first()

    starts_at = timezone.now()
    expires_at = starts_at + timedelta(hours=hours)

    grant = SupportAccessGrant.objects.create(
        organisation=org,
        school=school,
        granted_by=user,
        granted_to=granted_to,
        reason=reason,
        starts_at=starts_at,
        expires_at=expires_at,
        is_active=True
    )
    record_event(actor=user, action='grant_support_access', obj=grant)
    return Response({'id': grant.id, 'expires_at': grant.expires_at.isoformat()}, status=201)


@api_view(['POST'])
def support_grant_revoke(request, pk):
    user = request.user
    _require_org_or_superuser(user)

    grant = SupportAccessGrant.objects.filter(pk=pk).first()
    if not grant:
        raise NotFound()
    if not user.is_superuser and grant.organisation_id != user.organisation_id:
        raise PermissionDenied()

    grant.is_active = False
    grant.revoked_at = timezone.now()
    grant.save(update_fields=['is_active', 'revoked_at'])
    record_event(actor=user, action='revoke_support_access', obj=grant)
    return Response({'id': grant.id, 'revoked': True})


# ------------------------------------------------------------------ User Invitations (Replacing open register)
@api_view(['GET', 'POST'])
def invitations(request):
    """Admin-issued invitations. Open registration is forbidden by spec 19 §3."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')
    if not user.is_superuser and user.role not in ('organisation_admin', 'school_admin', 'principal'):
        raise PermissionDenied('Administrator permission required to invite users.')

    if request.method == 'GET':
        qs = UserInvitation.objects.all().select_related('organisation', 'school', 'created_by')
        if not user.is_superuser:
            qs = qs.filter(organisation_id=user.organisation_id)
            if user.role != 'organisation_admin' and user.school_id:
                qs = qs.filter(school_id=user.school_id)

        results = [{
            'id': inv.id,
            'email': inv.email,
            'role': inv.role,
            'school_name': inv.school.name if inv.school else 'Org Level',
            'created_by': inv.created_by.username,
            'token': inv.token,
            'expires_at': inv.expires_at.isoformat(),
            'is_used': bool(inv.used_at),
            'used_at': inv.used_at.isoformat() if inv.used_at else None
        } for inv in qs]
        return Response({'results': results})

    # POST: create invitation
    email = (request.data.get('email') or '').strip().lower()
    if not email or '@' not in email:
        raise ValidationError({'email': 'A valid email address is required.'})

    role = request.data.get('role', 'teacher')
    if role not in dict(User.ROLE_CHOICES):
        raise ValidationError({'role': 'Choose a valid user role.'})

    org = user.organisation if not user.is_superuser else Organisation.objects.filter(pk=request.data.get('organisation')).first()
    if not org:
        raise ValidationError({'organisation': 'Organisation is required.'})

    school = None
    if request.data.get('school'):
        school = School.objects.filter(pk=request.data['school'], organisation=org).first()
    elif user.school:
        school = user.school

    token = secrets.token_urlsafe(32)
    expires_at = timezone.now() + timedelta(days=7)

    inv = UserInvitation.objects.create(
        token=token,
        email=email,
        role=role,
        organisation=org,
        school=school,
        created_by=user,
        expires_at=expires_at
    )
    record_event(actor=user, action='issue_invitation', obj=inv)

    return Response({
        'id': inv.id,
        'email': inv.email,
        'role': inv.role,
        'token': inv.token,
        'invite_url': f"/accept-invite?token={inv.token}",
        'expires_at': inv.expires_at.isoformat()
    }, status=201)


@api_view(['POST'])
@permission_classes([AllowAny])
def accept_invitation(request):
    """Accept an invitation token to set up an account password and activate login."""
    token = (request.data.get('token') or '').strip()
    if not token:
        raise ValidationError({'token': 'Invitation token is required.'})

    inv = UserInvitation.objects.filter(token=token).select_related('organisation', 'school').first()
    if not inv:
        raise ValidationError({'token': 'Invalid or expired invitation token.'})

    if inv.used_at:
        raise ValidationError({'token': 'This invitation token has already been accepted.'})

    if timezone.now() > inv.expires_at:
        raise ValidationError({'token': 'This invitation has expired. Request a new invite from your administrator.'})

    username = (request.data.get('username') or '').strip()
    if not username:
        username = inv.email.split('@')[0]

    password = request.data.get('password')
    if not password or len(password) < 8:
        raise ValidationError({'password': 'Password must be at least 8 characters.'})

    first_name = (request.data.get('first_name') or '').strip()
    last_name = (request.data.get('last_name') or '').strip()

    if User.objects.filter(username=username).exists():
        username = f"{username}_{secrets.token_hex(2)}"

    with transaction.atomic():
        user = User.objects.create(
            username=username,
            email=inv.email,
            first_name=first_name,
            last_name=last_name,
            role=inv.role,
            organisation=inv.organisation,
            school=inv.school,
            is_active=True,
            password=make_password(password)
        )
        inv.used_at = timezone.now()
        inv.save(update_fields=['used_at'])
        record_event(actor=user, action='accept_invitation', obj=user)

    return Response({
        'status': 'success',
        'username': user.username,
        'email': user.email,
        'role': user.role,
        'message': 'Account created successfully. You can now log in.'
    })


# ------------------------------------------------------------------ Holiday Calendar
@api_view(['GET', 'POST', 'DELETE'])
def holiday_calendar(request, pk=None):
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    if request.method == 'GET':
        qs = HolidayCalendar.objects.filter(school__in=schools_scope(user)).select_related('school', 'academic_year')
        if request.query_params.get('school'):
            qs = qs.filter(school_id=request.query_params['school'])
        return Response({'results': [{
            'id': h.id,
            'school_id': h.school_id,
            'school_name': h.school.name,
            'name': h.name,
            'start_date': str(h.start_date),
            'end_date': str(h.end_date),
            'description': h.description
        } for h in qs]})

    _require_org_or_superuser(user) if user.role == 'organisation_admin' else None
    if user.role not in ('organisation_admin', 'school_admin', 'principal') and not user.is_superuser:
        raise PermissionDenied()

    if request.method == 'POST':
        school_id = request.data.get('school') or user.school_id
        school = schools_scope(user).filter(pk=school_id or 0).first()
        if not school:
            raise ValidationError({'school': 'Valid school campus required.'})

        ay = AcademicYear.objects.filter(school=school, active=True).first()
        if not ay:
            raise ValidationError({'detail': 'No active academic year for this campus.'})

        name = (request.data.get('name') or '').strip()[:100]
        s_date = datetime.strptime(request.data.get('start_date', ''), '%Y-%m-%d').date()
        e_date = datetime.strptime(request.data.get('end_date', ''), '%Y-%m-%d').date()
        desc = (request.data.get('description') or '').strip()[:255]

        h = HolidayCalendar.objects.create(
            school=school,
            academic_year=ay,
            name=name,
            start_date=s_date,
            end_date=e_date,
            description=desc
        )
        record_event(actor=user, action='create', obj=h)
        return Response({'id': h.id, 'name': h.name}, status=201)

    if request.method == 'DELETE' and pk:
        h = HolidayCalendar.objects.filter(pk=pk, school__in=schools_scope(user)).first()
        if not h:
            raise NotFound()
        record_event(actor=user, action='delete', obj=h)
        h.delete()
        return Response(status=204)


# ------------------------------------------------------------------ Timetable
@api_view(['GET', 'POST'])
def class_timetables(request):
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    if request.method == 'GET':
        class_id = request.query_params.get('class')
        teacher_id = request.query_params.get('teacher')
        school_id = request.query_params.get('school')

        qs = ClassTimetable.objects.filter(school_class__school__in=schools_scope(user)).select_related('school_class', 'subject', 'teacher')
        if class_id:
            qs = qs.filter(school_class_id=class_id)
        if teacher_id:
            qs = qs.filter(teacher_id=teacher_id)
        elif user.role == 'teacher' and not class_id and not school_id:
            qs = qs.filter(teacher=user)
        if school_id:
            qs = qs.filter(school_class__school_id=school_id)

        results = [{
            'id': t.id,
            'school_class_id': t.school_class_id,
            'school_class_name': t.school_class.name,
            'day_of_week': t.day_of_week,
            'day_name': t.get_day_of_week_display(),
            'period_number': t.period_number,
            'start_time': t.start_time.strftime('%H:%M'),
            'end_time': t.end_time.strftime('%H:%M'),
            'subject_id': t.subject_id,
            'subject_name': t.subject.name,
            'subject_code': t.subject.code,
            'teacher_id': t.teacher_id,
            'teacher_name': (t.teacher.get_full_name() or t.teacher.username) if t.teacher else None,
            'room': t.room
        } for t in qs]
        return Response({'results': results})

    # POST create or update timetable entry
    if user.role not in ('organisation_admin', 'school_admin', 'principal') and not user.is_superuser:
        raise PermissionDenied('Timetable editing requires administrator permission.')

    class_id = request.data.get('school_class')
    school_class = SchoolClass.objects.filter(pk=class_id, school__in=schools_scope(user)).first()
    if not school_class:
        raise ValidationError({'school_class': 'Valid class required.'})

    day = int(request.data.get('day_of_week', 0))
    period = int(request.data.get('period_number', 1))
    start_str = (request.data.get('start_time', '09:00') or '09:00')[:5]
    end_str = (request.data.get('end_time', '09:45') or '09:45')[:5]
    start_t = datetime.strptime(start_str, '%H:%M').time()
    end_t = datetime.strptime(end_str, '%H:%M').time()

    subj_id = request.data.get('subject')
    subject = Subject.objects.filter(pk=subj_id, school=school_class.school).first()
    if not subject:
        raise ValidationError({'subject': 'Valid subject required.'})

    teacher = None
    if request.data.get('teacher'):
        teacher = User.objects.filter(pk=request.data['teacher'], school=school_class.school).first()

    room = (request.data.get('room') or '').strip()[:40]

    with transaction.atomic():
        entry, _ = ClassTimetable.objects.update_or_create(
            school_class=school_class,
            day_of_week=day,
            period_number=period,
            defaults={
                'start_time': start_t,
                'end_time': end_t,
                'subject': subject,
                'teacher': teacher,
                'room': room
            }
        )
        record_event(actor=user, action='update_timetable', obj=entry)

    return Response({
        'id': entry.id,
        'school_class_id': school_class.id,
        'school_class_name': school_class.name,
        'period_number': period,
        'day_of_week': day,
        'start_time': entry.start_time.strftime('%H:%M'),
        'end_time': entry.end_time.strftime('%H:%M'),
        'subject_id': subject.id,
        'subject_name': subject.name,
        'teacher_id': teacher.id if teacher else None,
        'teacher_name': (teacher.get_full_name() or teacher.username) if teacher else None,
        'room': room
    }, status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
def timetable_detail(request, pk):
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required.')

    entry = ClassTimetable.objects.filter(pk=pk, school_class__school__in=schools_scope(user)).select_related('school_class', 'subject', 'teacher').first()
    if not entry:
        raise NotFound('Timetable period not found.')

    if request.method == 'GET':
        return Response({
            'id': entry.id,
            'school_class_id': entry.school_class_id,
            'school_class_name': entry.school_class.name,
            'day_of_week': entry.day_of_week,
            'day_name': entry.get_day_of_week_display(),
            'period_number': entry.period_number,
            'start_time': entry.start_time.strftime('%H:%M'),
            'end_time': entry.end_time.strftime('%H:%M'),
            'subject_id': entry.subject_id,
            'subject_name': entry.subject.name,
            'teacher_id': entry.teacher_id,
            'teacher_name': (entry.teacher.get_full_name() or entry.teacher.username) if entry.teacher else None,
            'room': entry.room
        })

    if user.role not in ('organisation_admin', 'school_admin', 'principal') and not user.is_superuser:
        raise PermissionDenied('Timetable editing requires administrator permission.')

    if request.method == 'DELETE':
        record_event(actor=user, action='delete_timetable_period', obj=entry)
        entry.delete()
        return Response({'success': True, 'detail': 'Timetable period cleared successfully'}, status=200)

    if request.method == 'PATCH':
        if 'start_time' in request.data:
            s = (request.data['start_time'] or '09:00')[:5]
            entry.start_time = datetime.strptime(s, '%H:%M').time()
        if 'end_time' in request.data:
            s = (request.data['end_time'] or '09:45')[:5]
            entry.end_time = datetime.strptime(s, '%H:%M').time()
        if 'subject' in request.data:
            subj = Subject.objects.filter(pk=request.data['subject'], school=entry.school_class.school).first()
            if not subj:
                raise ValidationError({'subject': 'Valid subject required.'})
            entry.subject = subj
        if 'teacher' in request.data:
            t_id = request.data['teacher']
            entry.teacher = User.objects.filter(pk=t_id, school=entry.school_class.school).first() if t_id else None
        if 'room' in request.data:
            entry.room = (request.data['room'] or '').strip()[:40]
        entry.save()
        record_event(actor=user, action='update_timetable_period', obj=entry)
        return Response({'success': True, 'id': entry.id})
