"""Staff management: add, promote, assign role, terminate / reinstate, with full history.

Staff records are HR records, separate from sign-in accounts. Managers are organisation
admins, school admins and principals, each limited to their own campus scope. Terminating
a staff member switches off any linked login at once; nothing is ever hard-deleted.
"""
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    StaffEvent, StaffMember, StaffAttendance, User,
    SalaryStructure, SalaryRecord, FinanceCategory, FinanceEntry, RoleAssignment
)
from core.services.access import schools_scope
from core.services.audit import record_event

MANAGERS = ('organisation_admin', 'school_admin', 'principal')
LOGIN_ROLES = ('school_admin', 'principal', 'teacher')       # roles that map to a sign-in role
LEADERSHIP = ('school_admin', 'principal')                    # only senior managers may grant these
STAFF_ROLES = ['teacher', 'principal', 'school_admin', 'accountant', 'librarian', 'counsellor', 'support', 'additional', 'other']


def _require_manager(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if not user.is_superuser and user.role not in MANAGERS:
        raise PermissionDenied('Staff management requires an administrator or principal')


def _scope(user):
    return StaffMember.objects.filter(school__in=schools_scope(user)).select_related('school', 'user')


def _get(user, pk):
    obj = _scope(user).filter(pk=pk).first()
    if not obj:
        raise NotFound()
    return obj


def _row(s):
    return {'id': s.id, 'first_name': s.first_name, 'last_name': s.last_name, 'full_name': s.full_name,
            'email': s.email, 'phone': s.phone, 'position': s.position, 'role': s.role,
            'status': s.status, 'hired_on': s.hired_on, 'terminated_on': s.terminated_on,
            'school': s.school_id, 'school_name': s.school.name,
            'has_login': bool(s.user_id), 'username': s.user.username if s.user_id else None}


def _event_row(e):
    return {'id': e.id, 'kind': e.kind, 'from_value': e.from_value, 'to_value': e.to_value, 'note': e.note,
            'actor': (e.actor.get_full_name() or e.actor.username) if e.actor_id else None,
            'created_at': e.created_at.isoformat()}


def _log(staff, kind, actor, frm='', to='', note=''):
    return StaffEvent.objects.create(staff=staff, kind=kind, actor=actor, from_value=frm, to_value=to, note=note[:255])


def _text(data, key, required=False, maxlen=120):
    v = (data.get(key) or '').strip()
    if required and not v:
        raise ValidationError({key: 'This field is required.'})
    return v[:maxlen]


def _check_role(actor, role):
    if role not in STAFF_ROLES:
        raise ValidationError({'role': f'Role must be one of: {", ".join(STAFF_ROLES)}'})
    if role in LEADERSHIP and not actor.is_superuser and actor.role not in ('organisation_admin', 'school_admin'):
        raise PermissionDenied('Only an organisation or school administrator can assign leadership roles')


def _own_record(actor, staff):
    if staff.user_id and staff.user_id == actor.id:
        raise PermissionDenied('You cannot change your own staff record')


def _sync_login(staff, role):
    """Keep the linked sign-in role aligned when a login-capable role is assigned."""
    if staff.user_id and role in LOGIN_ROLES and staff.user.role != role:
        staff.user.role = role
        staff.user.save(update_fields=['role'])


def resolve_salary_category(school, staff):
    """
    Resolve role-specific finance expense category for salary disbursement:
    - Teacher / Faculty -> 'Teacher Salary'
    - Principal / Headmaster -> 'Principal Salary'
    - Admin / Accountant / Clerk -> 'Administration Salary'
    - All other staff -> 'Staff Salary'
    """
    pos = (getattr(staff, 'position', '') or '').lower()
    role = (getattr(staff, 'role', '') or '').lower()

    if 'teacher' in pos or 'faculty' in pos or 'teacher' in role:
        cat_name = 'Teacher Salary'
    elif 'principal' in pos or 'headmaster' in pos or 'headmistress' in pos or 'principal' in role:
        cat_name = 'Principal Salary'
    elif 'admin' in pos or 'administrator' in pos or 'accountant' in pos or 'clerk' in pos or 'admin' in role:
        cat_name = 'Administration Salary'
    else:
        cat_name = 'Staff salaries'

    cat = FinanceCategory.objects.filter(school=school, kind='expense', name__iexact=cat_name).first()
    if not cat:
        cat = FinanceCategory.objects.create(school=school, kind='expense', name=cat_name, active=True)
    return cat


@api_view(['GET', 'POST'])
def staff_list(request):
    user = request.user
    _require_manager(user)
    if request.method == 'GET':
        qs = _scope(user)
        for key in ('status', 'role', 'school'):
            v = request.query_params.get(key)
            if v:
                qs = qs.filter(**{(key if key != 'school' else 'school_id'): v})
        q = (request.query_params.get('q') or '').strip()
        if q:
            from django.db.models import Q
            qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(position__icontains=q))
        rows = [_row(s) for s in qs]
        from core.services.exports import handle_export
        export_res = handle_export(
            request, rows, filename='staff-directory', title='Staff Directory',
            columns=[
                {'key': 'first_name', 'label': 'First Name'},
                {'key': 'last_name', 'label': 'Last Name'},
                {'key': 'role', 'label': 'Role'},
                {'key': 'position', 'label': 'Position'},
                {'key': 'school_name', 'label': 'Campus'},
                {'key': 'email', 'label': 'Email'},
                {'key': 'phone', 'label': 'Phone'},
                {'key': 'status', 'label': 'Status'},
                {'key': 'hired_on', 'label': 'Hired On'}
            ]
        )
        if export_res:
            return export_res
        return Response({'results': rows, 'summary': {
            'total': len(rows), 'active': sum(r['status'] == 'active' for r in rows),
            'terminated': sum(r['status'] == 'terminated' for r in rows)}, 'roles': STAFF_ROLES})
    data = request.data
    school = schools_scope(user).filter(pk=data.get('school') or (user.school_id if user.role != 'organisation_admin' else None)).first()
    if not school:
        raise NotFound('Campus not found.')
    role = (data.get('role') or 'teacher').strip()
    _check_role(user, role)
    try:
        hired = date.fromisoformat(data.get('hired_on') or date.today().isoformat())
    except ValueError:
        raise ValidationError({'hired_on': 'Use YYYY-MM-DD.'})
    link = None
    if data.get('user'):
        link = User.objects.filter(pk=data['user'], school=school, organisation=school.organisation).first()
        if not link:
            raise ValidationError({'user': 'Login account not found on this campus.'})
        if StaffMember.objects.filter(user=link).exists():
            raise ValidationError({'user': 'That login is already linked to a staff record.'})
    elif data.get('password') and (data.get('email') or data.get('username')):
        raw_pwd = str(data.get('password'))
        if len(raw_pwd) < 8:
            raise ValidationError({'password': 'Password must be at least 8 characters.'})
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_password(raw_pwd)
        except DjangoValidationError as e:
            raise ValidationError({'password': ' '.join(e.messages)})
        
        email_val = (data.get('email') or '').strip().lower()
        uname = (data.get('username') or '').strip()
        if not uname and email_val:
            base_uname = email_val.split('@')[0]
            uname = base_uname
            idx = 1
            while User.objects.filter(username=uname).exists():
                uname = f"{base_uname}{idx}"
                idx += 1
        if not uname:
            raise ValidationError({'username': 'Username or email required to create sign-in account.'})
        if User.objects.filter(username=uname).exists():
            raise ValidationError({'username': 'Username is already taken.'})
        if email_val and User.objects.filter(email=email_val).exists():
            raise ValidationError({'email': 'Email is already registered.'})
        
        u_role = role if role in LOGIN_ROLES else 'teacher'
        link = User(
            username=uname,
            email=email_val,
            first_name=_text(data, 'first_name', True, 100),
            last_name=_text(data, 'last_name', True, 100),
            role=u_role,
            school=school,
            organisation=school.organisation,
            is_active=True
        )
        link.set_password(raw_pwd)
        link.full_clean()
        link.save()
        if u_role == 'principal':
            RoleAssignment.objects.get_or_create(
                user=link,
                role='principal',
                school=school,
                defaults={'effective_from': hired}
            )
    with transaction.atomic():
        s = StaffMember.objects.create(
            school=school, user=link, first_name=_text(data, 'first_name', True, 100),
            last_name=_text(data, 'last_name', True, 100), email=_text(data, 'email', maxlen=254),
            phone=_text(data, 'phone', maxlen=40), position=_text(data, 'position', True), role=role, hired_on=hired)
        _log(s, 'hired', user, to=f'{s.position} ({role})')
        _sync_login(s, role)

        salary_str = str(data.get('salary') or '').strip()
        if not salary_str:
            raise ValidationError({'salary': 'Base salary is required.'})
        try:
            salary_val = Decimal(salary_str)
            if salary_val <= 0:
                raise ValidationError({'salary': 'Base salary must be greater than zero.'})
        except InvalidOperation:
            raise ValidationError({'salary': 'Enter a valid base salary amount.'})
        if salary_val > 0:
                currency = getattr(school, 'currency', None) or 'PKR'
                SalaryStructure.objects.create(
                    staff=s,
                    effective_from=hired,
                    basic=salary_val,
                    allowances=[],
                    fixed_deductions=[],
                    currency=currency
                )
                salary_status = (data.get('salary_status') or '').strip().lower()
                record_exp = data.get('record_expense')
                if salary_status == 'paid' or str(record_exp).lower() in ('true', '1'):
                    final_status = 'paid'
                elif salary_status in ('pending', 'draft', 'cancelled'):
                    final_status = salary_status
                else:
                    final_status = 'pending'

                due_date_raw = data.get('salary_due_date') or data.get('due_date')
                parsed_due_date = None
                if due_date_raw:
                    try:
                        parsed_due_date = date.fromisoformat(str(due_date_raw)[:10])
                    except ValueError:
                        pass
                if not parsed_due_date:
                    parsed_due_date = hired

                f_entry = None
                if final_status == 'paid':
                    cat = resolve_salary_category(school, s)
                    f_entry = FinanceEntry.objects.create(
                        school=school,
                        category=cat,
                        amount=salary_val,
                        date=hired,
                        description=f"Salary disbursement for {s.full_name} ({s.position})",
                        created_by=user
                    )

                SalaryRecord.objects.create(
                    staff=s,
                    school=school,
                    month=hired.strftime('%Y-%m'),
                    basic=salary_val,
                    gross=salary_val,
                    deductions_total=Decimal('0.00'),
                    additions_total=Decimal('0.00'),
                    advance_recovered=Decimal('0.00'),
                    net=salary_val,
                    status=final_status,
                    due_date=parsed_due_date,
                    paid_on=hired if final_status == 'paid' else None,
                    method=data.get('payment_method') or 'bank',
                    reference=f"HIRE-SAL-{s.id}",
                    finance_entry=f_entry
                )

        record_event(actor=user, action='create', obj=s)
    return Response(_row(s), status=201)


@api_view(['GET', 'PATCH', 'DELETE'])
def staff_detail(request, pk):
    user = request.user
    _require_manager(user)
    s = _get(user, pk)
    if request.method == 'DELETE':
        _own_record(user, s)
        if s.role in LEADERSHIP and not user.is_superuser and user.role not in ('organisation_admin', 'school_admin'):
            raise PermissionDenied('Only an organisation or school administrator can delete a leader')
        with transaction.atomic():
            s.events.all().delete()
            record_event(actor=user, action='delete', obj=s)
            s.delete()
        return Response({'success': True, 'detail': 'Staff member deleted.'})
    if request.method == 'PATCH':
        _own_record(user, s)
        changed = []
        for key, maxlen in (('first_name', 100), ('last_name', 100), ('email', 254), ('phone', 40), ('position', 120)):
            if key in request.data:
                setattr(s, key, _text(request.data, key, key in ('first_name', 'last_name', 'position'), maxlen))
                changed.append(key)
        if 'role' in request.data:
            role = str(request.data['role']).strip()
            _check_role(user, role)
            s.role = role
            changed.append('role')
            _sync_login(s, role)
        if 'hired_on' in request.data and request.data['hired_on']:
            try:
                s.hired_on = date.fromisoformat(request.data['hired_on'])
                changed.append('hired_on')
            except ValueError:
                pass
        if changed:
            s.save(update_fields=changed)
            _log(s, 'updated', user, note='Updated: ' + ', '.join(changed))
    return Response({**_row(s), 'history': [_event_row(e) for e in s.events.select_related('actor')]})


def _require_active(s):
    if s.status != 'active':
        raise ValidationError({'detail': 'This staff member is terminated. Reinstate them first.'})


@api_view(['POST'])
def staff_promote(request, pk):
    user = request.user
    _require_manager(user)
    if user.role == 'principal':
        from core.models import OrganisationRolePolicy
        policy = OrganisationRolePolicy.get_effective_policy(user.organisation_id, 'principal')
        if not policy.get('staff.promote_terminate', False):
            raise PermissionDenied('Principals are not authorized to promote or terminate staff.')
    s = _get(user, pk)
    _own_record(user, s)
    _require_active(s)
    new_pos = _text(request.data, 'new_position', True)
    new_role = (request.data.get('new_role') or '').strip()
    with transaction.atomic():
        old = s.position
        s.position = new_pos
        fields = ['position']
        if new_role and new_role != s.role:
            _check_role(user, new_role)
            old_role, s.role = s.role, new_role
            fields.append('role')
            _log(s, 'role_changed', user, old_role, new_role, 'Changed with promotion')
            _sync_login(s, new_role)
        s.save(update_fields=fields)
        _log(s, 'promoted', user, old, new_pos, _text(request.data, 'note', maxlen=255))
        record_event(actor=user, action='promote', obj=s)
    return Response(_row(s))


@api_view(['POST'])
def staff_assign_role(request, pk):
    user = request.user
    _require_manager(user)
    if user.role == 'principal':
        from core.models import OrganisationRolePolicy
        policy = OrganisationRolePolicy.get_effective_policy(user.organisation_id, 'principal')
        if not policy.get('staff.promote_terminate', False):
            raise PermissionDenied('Principals are not authorized to assign staff roles.')
    s = _get(user, pk)
    _own_record(user, s)
    _require_active(s)
    role = (request.data.get('role') or '').strip()
    _check_role(user, role)
    if s.role in LEADERSHIP and not user.is_superuser and user.role not in ('organisation_admin', 'school_admin'):
        raise PermissionDenied('Only an organisation or school administrator can change a leadership role')
    if role == s.role:
        raise ValidationError({'role': 'That is already their role.'})
    with transaction.atomic():
        old, s.role = s.role, role
        s.save(update_fields=['role'])
        _sync_login(s, role)
        _log(s, 'role_changed', user, old, role, _text(request.data, 'note', maxlen=255))
        record_event(actor=user, action='assign_role', obj=s)
    return Response(_row(s))


@api_view(['POST'])
def staff_terminate(request, pk):
    user = request.user
    _require_manager(user)
    if user.role == 'principal':
        from core.models import OrganisationRolePolicy
        policy = OrganisationRolePolicy.get_effective_policy(user.organisation_id, 'principal')
        if not policy.get('staff.promote_terminate', False):
            raise PermissionDenied('Principals are not authorized to promote or terminate staff.')
    s = _get(user, pk)
    _own_record(user, s)
    _require_active(s)
    if s.role in LEADERSHIP and not user.is_superuser and user.role not in ('organisation_admin', 'school_admin'):
        raise PermissionDenied('Only an organisation or school administrator can terminate a leader')
    with transaction.atomic():
        s.status, s.terminated_on = 'terminated', date.today()
        s.save(update_fields=['status', 'terminated_on'])
        if s.user_id:                                  # access is switched off immediately
            s.user.is_active = False
            s.user.save(update_fields=['is_active'])
        _log(s, 'terminated', user, 'active', 'terminated', _text(request.data, 'reason', maxlen=255))
        record_event(actor=user, action='terminate', obj=s)
    return Response(_row(s))


@api_view(['POST'])
def staff_reinstate(request, pk):
    user = request.user
    _require_manager(user)
    if user.role == 'principal':
        from core.models import OrganisationRolePolicy
        policy = OrganisationRolePolicy.get_effective_policy(user.organisation_id, 'principal')
        if not policy.get('staff.promote_terminate', False):
            raise PermissionDenied('Principals are not authorized to promote or terminate staff.')
    s = _get(user, pk)
    _own_record(user, s)
    if s.status != 'terminated':
        raise ValidationError({'detail': 'Only terminated staff can be reinstated.'})
    with transaction.atomic():
        s.status, s.terminated_on = 'active', None
        s.save(update_fields=['status', 'terminated_on'])
        if s.user_id:
            s.user.is_active = True
            s.user.save(update_fields=['is_active'])
        _log(s, 'reinstated', user, 'terminated', 'active', _text(request.data, 'note', maxlen=255))
        record_event(actor=user, action='reinstate', obj=s)
    return Response(_row(s))


@api_view(['GET'])
def staff_history(request):
    """Newest employment events across the actor's campuses."""
    user = request.user
    _require_manager(user)
    events = StaffEvent.objects.filter(staff__in=_scope(user)).select_related('staff', 'staff__school', 'actor')
    kind = request.query_params.get('kind')
    if kind in dict(StaffEvent.KINDS):
        events = events.filter(kind=kind)
    return Response({'results': [{**_event_row(e), 'staff_id': e.staff_id, 'staff_name': e.staff.full_name,
                                   'school_name': e.staff.school.name} for e in events[:300]]})


@api_view(['GET', 'POST'])
def staff_attendance(request):
    """Staff attendance register: view or record daily attendance for campus staff."""
    user = request.user
    _require_manager(user)

    school_val = request.query_params.get('school') or request.data.get('school')
    if not school_val and user.role != 'organisation_admin' and not user.is_superuser:
        school_val = user.school_id

    school = schools_scope(user).filter(pk=school_val or 0).first()
    if not school:
        raise NotFound('Campus not found.')

    date_raw = request.query_params.get('date') or request.data.get('date') or date.today().isoformat()
    try:
        att_date = date.fromisoformat(str(date_raw)[:10])
    except ValueError:
        raise ValidationError({'date': 'Use YYYY-MM-DD.'})

    if request.method == 'GET':
        staff_qs = list(StaffMember.objects.filter(school=school, status='active').order_by('last_name', 'first_name'))
        existing_recs = {
            a.staff_id: a for a in StaffAttendance.objects.filter(school=school, date=att_date).select_related('marked_by')
        }

        conducted_by_user = None
        conducted_at = None
        for a in existing_recs.values():
            if a.marked_by:
                conducted_by_user = (a.marked_by.get_full_name() or a.marked_by.username).strip()
            if a.updated_at:
                conducted_at = a.updated_at.isoformat()
            if conducted_by_user:
                break

        records = []
        for s in staff_qs:
            rec = existing_recs.get(s.id)
            records.append({
                'staff_id': s.id,
                'staff_name': s.full_name,
                'position': s.position,
                'role': s.role,
                'email': s.email,
                'status': rec.status if rec else 'not_taken',
                'is_recorded': bool(rec),
                'note': rec.note if rec else '',
            })

        total = len(records)
        present = sum(1 for r in records if r['status'] == 'present')
        absent = sum(1 for r in records if r['status'] == 'absent')
        late = sum(1 for r in records if r['status'] == 'late')
        excused = sum(1 for r in records if r['status'] == 'excused')
        not_taken = sum(1 for r in records if r['status'] == 'not_taken')

        return Response({
            'date': att_date.isoformat(),
            'school': school.id,
            'school_name': school.name,
            'is_conducted': bool(existing_recs),
            'conducted_by': conducted_by_user,
            'conducted_at': conducted_at,
            'records': records,
            'summary': {
                'total': total,
                'present': present,
                'absent': absent,
                'late': late,
                'excused': excused,
                'not_taken': not_taken,
                'recorded_count': len(existing_recs),
            }
        })

    # POST: Save bulk attendance records
    records_data = request.data.get('records')
    if not isinstance(records_data, list):
        raise ValidationError({'records': 'List of staff attendance records required.'})

    valid_statuses = {'present', 'absent', 'late', 'excused'}
    campus_staff_ids = set(StaffMember.objects.filter(school=school, status='active').values_list('id', flat=True))

    updated_count = 0
    with transaction.atomic():
        for item in records_data:
            s_id = item.get('staff_id')
            if not s_id or s_id not in campus_staff_ids:
                continue
            status = str(item.get('status') or 'present').lower()
            if status not in valid_statuses:
                continue
            note = str(item.get('note') or '').strip()[:255]

            StaffAttendance.objects.update_or_create(
                staff_id=s_id,
                date=att_date,
                defaults={
                    'school': school,
                    'status': status,
                    'note': note,
                    'marked_by': user,
                }
            )
            updated_count += 1

        record_event(
            actor=user,
            action='mark_staff_attendance',
            obj=school
        )

    actor_name = (user.get_full_name() or user.username).strip()
    return Response({
        'success': True,
        'message': f'Attendance saved for {updated_count} staff member(s).',
        'date': att_date.isoformat(),
        'updated_count': updated_count,
        'conducted_by': actor_name,
        'is_conducted': True,
    })

