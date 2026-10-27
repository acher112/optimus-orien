"""Staff salaries: structures, monthly generation, approvals, payments, adjustments, payslips.

Every paid salary creates a linked FinanceEntry (kind 'expense'). Voiding a salary record
immediately voids the linked FinanceEntry, preventing orphaned finance records.
Access scoping:
  - Superuser / Org Admin: all organisation campuses
  - School Admin / Principal: assigned campus
  - Teachers: only view their own payslips via /api/salaries/my-payslips/
"""
import calendar
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum, Q
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    School, StaffMember, FinanceCategory, FinanceEntry,
    SalaryStructure, SalaryRecord, SalaryAdjustment, User
)
from core.services.access import schools_scope
from core.services.audit import record_event
from core.services.filters import apply_query_filters, sort_comparison_rows
from core.staff import resolve_salary_category

MANAGERS = ('organisation_admin', 'school_admin', 'principal')


def _require_manager(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if not user.is_superuser and user.role not in MANAGERS:
        raise PermissionDenied('Salary management requires administrator or principal role')


def _school(user, value):
    if not value and user.role != 'organisation_admin' and not user.is_superuser:
        value = user.school_id
    school = schools_scope(user).filter(pk=value or 0).first()
    if not school:
        raise ValidationError({'school': 'Choose a campus within your scope.'})
    return school


def _money(value, field='amount'):
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise ValidationError({field: 'Enter a valid decimal amount.'})
    if d < 0 or d >= Decimal('10000000000'):
        raise ValidationError({field: 'Amount must be positive and within reasonable limits.'})
    return d


def _parse_month(month_str):
    try:
        dt = datetime.strptime(month_str.strip(), '%Y-%m')
        return dt.year, dt.month, month_str.strip()
    except (ValueError, AttributeError):
        raise ValidationError({'month': 'Month must be in YYYY-MM format (e.g. 2026-10).'})


# ------------------------------------------------------------------ Salary Structures
@api_view(['GET', 'POST'])
def salary_structures(request):
    user = request.user
    _require_manager(user)

    if request.method == 'GET':
        staff_id = request.query_params.get('staff')
        qs = SalaryStructure.objects.filter(staff__school__in=schools_scope(user)).select_related('staff', 'staff__school')
        if staff_id:
            qs = qs.filter(staff_id=staff_id)
        if request.query_params.get('school'):
            qs = qs.filter(staff__school_id=request.query_params['school'])

        results = []
        for s in qs:
            results.append({
                'id': s.id,
                'staff_id': s.staff_id,
                'staff_name': s.staff.full_name,
                'school_id': s.staff.school_id,
                'school_name': s.staff.school.name,
                'effective_from': str(s.effective_from),
                'basic': str(s.basic),
                'allowances': s.allowances,
                'fixed_deductions': s.fixed_deductions,
                'currency': s.currency,
                'created_at': s.created_at.isoformat(),
            })
        return Response({'results': results})

    # POST: create a new structure revision
    staff_id = request.data.get('staff')
    staff = StaffMember.objects.filter(pk=staff_id, school__in=schools_scope(user)).first()
    if not staff:
        raise ValidationError({'staff': 'Select a valid staff member within your campus scope.'})

    eff_str = request.data.get('effective_from')
    try:
        effective_from = datetime.strptime(eff_str, '%Y-%m-%d').date() if eff_str else date.today()
    except (ValueError, TypeError):
        raise ValidationError({'effective_from': 'Format must be YYYY-MM-DD.'})

    basic = _money(request.data.get('basic'), 'basic')

    raw_allowances = request.data.get('allowances', [])
    allowances = []
    if isinstance(raw_allowances, list):
        for item in raw_allowances:
            if isinstance(item, dict) and item.get('name'):
                allowances.append({
                    'name': str(item['name'])[:60],
                    'amount': str(_money(item.get('amount', 0), 'allowance amount'))
                })

    raw_deductions = request.data.get('fixed_deductions', [])
    fixed_deductions = []
    if isinstance(raw_deductions, list):
        for item in raw_deductions:
            if isinstance(item, dict) and item.get('name'):
                fixed_deductions.append({
                    'name': str(item['name'])[:60],
                    'amount': str(_money(item.get('amount', 0), 'deduction amount'))
                })

    currency = request.data.get('currency') or staff.school.currency or 'PKR'

    struct = SalaryStructure.objects.create(
        staff=staff,
        effective_from=effective_from,
        basic=basic,
        allowances=allowances,
        fixed_deductions=fixed_deductions,
        currency=currency,
        created_by=user
    )
    record_event(actor=user, action='create', obj=struct)

    return Response({
        'id': struct.id,
        'staff_id': struct.staff_id,
        'staff_name': staff.full_name,
        'effective_from': str(struct.effective_from),
        'basic': str(struct.basic),
        'allowances': struct.allowances,
        'fixed_deductions': struct.fixed_deductions,
        'currency': struct.currency
    }, status=201)


# ------------------------------------------------------------------ Salary Adjustments (Bonuses, Deductions, Advances)
@api_view(['GET', 'POST'])
def salary_adjustments(request):
    user = request.user
    _require_manager(user)

    if request.method == 'GET':
        qs = SalaryAdjustment.objects.filter(staff__school__in=schools_scope(user)).select_related('staff', 'staff__school')
        if request.query_params.get('month'):
            qs = qs.filter(month=request.query_params['month'])
        if request.query_params.get('staff'):
            qs = qs.filter(staff_id=request.query_params['staff'])
        if request.query_params.get('school'):
            qs = qs.filter(staff__school_id=request.query_params['school'])

        results = [{
            'id': a.id,
            'staff_id': a.staff_id,
            'staff_name': a.staff.full_name,
            'school_name': a.staff.school.name,
            'month': a.month,
            'kind': a.kind,
            'kind_display': a.get_kind_display(),
            'amount': str(a.amount),
            'reason': a.reason,
            'created_at': a.created_at.isoformat()
        } for a in qs]
        return Response({'results': results})

    staff_id = request.data.get('staff')
    staff = StaffMember.objects.filter(pk=staff_id, school__in=schools_scope(user)).first()
    if not staff:
        raise ValidationError({'staff': 'Select a valid staff member within your scope.'})

    _, _, month_str = _parse_month(request.data.get('month') or '')
    kind = request.data.get('kind')
    if kind not in ('bonus', 'deduction', 'advance'):
        raise ValidationError({'kind': 'Kind must be bonus, deduction, or advance.'})

    amount = _money(request.data.get('amount'), 'amount')
    reason = (request.data.get('reason') or '').strip()[:255]
    if not reason:
        raise ValidationError({'reason': 'Reason is required for salary adjustment.'})

    adj = SalaryAdjustment.objects.create(
        staff=staff,
        month=month_str,
        kind=kind,
        amount=amount,
        reason=reason,
        approved_by=user
    )
    record_event(actor=user, action='create', obj=adj)
    return Response({
        'id': adj.id,
        'staff_id': adj.staff_id,
        'month': adj.month,
        'kind': adj.kind,
        'amount': str(adj.amount),
        'reason': adj.reason
    }, status=201)


# ------------------------------------------------------------------ Monthly Generation
@api_view(['POST'])
def salaries_generate(request):
    """Generates draft salary records for active staff for a given month (YYYY-MM).

    Idempotent: skips staff who already have a record for this month.
    Applies proration for mid-month hires and mid-month terminations.
    Pulls allowances from latest SalaryStructure and adjustments from SalaryAdjustment.
    """
    user = request.user
    _require_manager(user)

    school = _school(user, request.data.get('school'))
    year, month, month_str = _parse_month(request.data.get('month') or '')

    _, days_in_month = calendar.monthrange(year, month)
    month_start = date(year, month, 1)
    month_end = date(year, month, days_in_month)

    due_date_str = request.data.get('due_date')
    gen_due_date = None
    if due_date_str:
        try:
            gen_due_date = date.fromisoformat(str(due_date_str)[:10])
        except ValueError:
            pass
    if not gen_due_date:
        if month == 12:
            gen_due_date = date(year + 1, 1, 5)
        else:
            gen_due_date = date(year, month + 1, 5)

    # Active staff who were employed at some point in this month
    staff_qs = StaffMember.objects.filter(
        school=school,
        hired_on__lte=month_end
    ).filter(
        Q(terminated_on__isnull=True) | Q(terminated_on__gte=month_start)
    ).select_related('school')

    created_count = 0
    skipped_count = 0

    with transaction.atomic():
        for st in staff_qs:
            # Check existing
            if SalaryRecord.objects.filter(staff=st, month=month_str).exists():
                skipped_count += 1
                continue

            # Latest salary structure effective on or before month_end
            struct = SalaryStructure.objects.filter(
                staff=st,
                effective_from__lte=month_end
            ).order_by('-effective_from', '-id').first()

            if not struct:
                # No compensation structure defined yet
                skipped_count += 1
                continue

            # Proration calculation
            active_start = max(month_start, st.hired_on)
            active_end = min(month_end, st.terminated_on) if st.terminated_on else month_end
            if active_start > active_end:
                skipped_count += 1
                continue

            active_days = (active_end - active_start).days + 1
            is_prorated = active_days < days_in_month

            ratio = Decimal(active_days) / Decimal(days_in_month) if is_prorated else Decimal('1.00')

            base_basic = (struct.basic * ratio).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            # Allowances
            allowances_total = Decimal('0.00')
            allowance_details = []
            for al in struct.allowances or []:
                amt = Decimal(str(al.get('amount', 0))) * ratio
                amt = amt.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                allowances_total += amt
                allowance_details.append({'name': al.get('name'), 'amount': str(amt)})

            # Fixed Deductions
            deductions_total = Decimal('0.00')
            deduction_details = []
            for fd in struct.fixed_deductions or []:
                amt = Decimal(str(fd.get('amount', 0))) * ratio
                amt = amt.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                deductions_total += amt
                deduction_details.append({'name': fd.get('name'), 'amount': str(amt)})

            # Adjustments for this month
            adjustments = SalaryAdjustment.objects.filter(staff=st, month=month_str)
            additions_total = Decimal('0.00')
            advance_recovered = Decimal('0.00')
            adjustment_details = []

            for adj in adjustments:
                if adj.kind == 'bonus':
                    additions_total += adj.amount
                elif adj.kind == 'deduction':
                    deductions_total += adj.amount
                elif adj.kind == 'advance':
                    advance_recovered += adj.amount
                adjustment_details.append({
                    'id': adj.id, 'kind': adj.kind, 'amount': str(adj.amount), 'reason': adj.reason
                })

            gross = base_basic + allowances_total + additions_total
            net = max(Decimal('0.00'), gross - deductions_total - advance_recovered)

            rec = SalaryRecord.objects.create(
                staff=st,
                school=school,
                month=month_str,
                basic=base_basic,
                allowances_total=allowances_total,
                deductions_total=deductions_total,
                additions_total=additions_total,
                advance_recovered=advance_recovered,
                gross=gross,
                net=net,
                status='draft',
                due_date=gen_due_date,
                details={
                    'days_in_month': days_in_month,
                    'active_days': active_days,
                    'prorated': is_prorated,
                    'original_basic': str(struct.basic),
                    'allowances': allowance_details,
                    'deductions': deduction_details,
                    'adjustments': adjustment_details,
                    'currency': struct.currency
                }
            )
            record_event(actor=user, action='create', obj=rec)
            created_count += 1

    return Response({
        'month': month_str,
        'school': school.name,
        'created_records': created_count,
        'skipped_records': skipped_count
    })


# ------------------------------------------------------------------ Salary Sheet & Bulk Approvals
@api_view(['GET', 'PATCH'])
def salaries_sheet(request):
    user = request.user
    _require_manager(user)

    if request.method == 'GET':
        qs = SalaryRecord.objects.filter(school__in=schools_scope(user)).select_related('staff', 'school')
        qs, _ = apply_query_filters(
            request,
            qs,
            search_fields=['staff__first_name', 'staff__last_name', 'staff__position', 'reference'],
            filter_map={
                'month': 'month',
                'school': 'school_id',
                'campus': 'school_id',
                'status': 'status',
                'staff': 'staff_id',
                'position': 'staff__position',
                'amount_min': 'net__gte',
                'amount_max': 'net__lte',
            },
            allowed_orderings=['month', 'net', 'gross', 'paid_on', 'status'],
            default_ordering=['-month', 'staff__first_name']
        )

        results = [{
            'id': r.id,
            'staff_id': r.staff_id,
            'staff_name': r.staff.full_name,
            'position': r.staff.position,
            'school_id': r.school_id,
            'school_name': r.school.name,
            'month': r.month,
            'basic': str(r.basic),
            'allowances_total': str(r.allowances_total),
            'deductions_total': str(r.deductions_total),
            'additions_total': str(r.additions_total),
            'advance_recovered': str(r.advance_recovered),
            'gross': str(r.gross),
            'net': str(r.net),
            'status': r.status,
            'due_date': str(r.due_date) if r.due_date else None,
            'paid_on': str(r.paid_on) if r.paid_on else None,
            'method': r.method,
            'reference': r.reference,
            'has_finance_entry': bool(r.finance_entry_id)
        } for r in qs]
        from core.services.exports import handle_export
        export_res = handle_export(
            request, results, filename='salaries-sheet', title='Staff Salaries & Payroll Sheet',
            columns=[
                {'key': 'staff_name', 'label': 'Staff Member'},
                {'key': 'position', 'label': 'Position'},
                {'key': 'school_name', 'label': 'Campus'},
                {'key': 'month', 'label': 'Payroll Month'},
                {'key': 'basic', 'label': 'Base (Rs)'},
                {'key': 'allowances_total', 'label': 'Allowances (Rs)'},
                {'key': 'deductions_total', 'label': 'Deductions (Rs)'},
                {'key': 'gross', 'label': 'Gross (Rs)'},
                {'key': 'net', 'label': 'Net Salary (Rs)'},
                {'key': 'status', 'label': 'Status'},
                {'key': 'due_date', 'label': 'Due Date'},
                {'key': 'paid_on', 'label': 'Paid On'},
                {'key': 'method', 'label': 'Method'},
            ]
        )
        if export_res:
            return export_res
        return Response({'results': results})

    # PATCH: bulk approve records
    record_ids = request.data.get('records', [])
    if not isinstance(record_ids, list) or not record_ids:
        raise ValidationError({'records': 'List of record IDs required for bulk update.'})

    target_status = request.data.get('status', 'approved')
    if target_status not in ('approved', 'draft'):
        raise ValidationError({'status': 'Only draft or approved statuses can be set in bulk.'})

    with transaction.atomic():
        records = SalaryRecord.objects.filter(
            id__in=record_ids,
            school__in=schools_scope(user),
            status='draft' if target_status == 'approved' else 'approved'
        )
        count = 0
        for rec in records:
            rec.status = target_status
            rec.save(update_fields=['status'])
            record_event(actor=user, action='update', obj=rec)
            count += 1

    return Response({'updated': count, 'status': target_status})


# ------------------------------------------------------------------ Pay & Void Actions
@api_view(['POST'])
def salary_pay(request, pk):
    """Mark a salary record paid and create linked FinanceEntry (Expense)."""
    user = request.user
    _require_manager(user)

    record = SalaryRecord.objects.filter(pk=pk, school__in=schools_scope(user)).select_related('staff', 'school').first()
    if not record:
        raise NotFound()

    if record.status == 'paid':
        raise ValidationError({'detail': 'Salary record is already marked paid.'})
    if record.status == 'void':
        raise ValidationError({'detail': 'Cannot pay a voided salary record.'})

    paid_on_str = request.data.get('paid_on')
    try:
        paid_on = datetime.strptime(paid_on_str, '%Y-%m-%d').date() if paid_on_str else date.today()
    except (ValueError, TypeError):
        raise ValidationError({'paid_on': 'Enter valid date in YYYY-MM-DD format.'})

    method = request.data.get('method') or 'bank'
    reference = (request.data.get('reference') or '').strip()[:100]

    with transaction.atomic():
        # Find or create role-specific expense category ("Teacher Salary", "Principal Salary", etc.)
        cat = resolve_salary_category(record.school, record.staff)

        finance_entry = FinanceEntry.objects.create(
            school=record.school,
            category=cat,
            amount=record.net,
            date=paid_on,
            description=f"Salary {record.month}: {record.staff.full_name} ({record.staff.position})",
            created_by=user
        )
        record_event(actor=user, action='create', obj=finance_entry)

        record.status = 'paid'
        record.paid_on = paid_on
        record.method = method
        record.reference = reference
        record.finance_entry = finance_entry
        record.save(update_fields=['status', 'paid_on', 'method', 'reference', 'finance_entry'])
        record_event(actor=user, action='pay', obj=record)

    return Response({
        'id': record.id,
        'status': record.status,
        'paid_on': str(record.paid_on),
        'net': str(record.net),
        'finance_entry_id': finance_entry.id
    })


@api_view(['POST'])
def salary_status_update(request, pk):
    """
    Update status of salary record (pending, paid, cancelled, draft) and optionally due_date.
    When marked 'paid', creates linked FinanceEntry (Expense) under role-specific category.
    When reverted from 'paid' to 'pending' or 'cancelled', voids/removes linked FinanceEntry so expenses are not inflated.
    """
    user = request.user
    _require_manager(user)

    record = SalaryRecord.objects.filter(pk=pk, school__in=schools_scope(user)).select_related('staff', 'school', 'finance_entry').first()
    if not record:
        raise NotFound()

    target_status = (request.data.get('status') or '').strip().lower()
    valid_statuses = [s[0] for s in SalaryRecord.STATUSES]
    if target_status and target_status not in valid_statuses:
        raise ValidationError({'status': f"Invalid status. Must be one of: {', '.join(valid_statuses)}"})

    due_date_str = request.data.get('due_date')
    if due_date_str:
        try:
            record.due_date = date.fromisoformat(str(due_date_str)[:10])
        except ValueError:
            raise ValidationError({'due_date': 'Use YYYY-MM-DD format.'})

    if not target_status:
        record.save()
        return Response({
            'id': record.id,
            'status': record.status,
            'due_date': str(record.due_date) if record.due_date else None,
            'paid_on': str(record.paid_on) if record.paid_on else None,
            'net': str(record.net)
        })

    with transaction.atomic():
        if target_status == 'paid':
            paid_on_str = request.data.get('paid_on')
            try:
                paid_on = datetime.strptime(paid_on_str, '%Y-%m-%d').date() if paid_on_str else date.today()
            except (ValueError, TypeError):
                paid_on = date.today()
            method = request.data.get('method') or record.method or 'bank'
            ref = (request.data.get('reference') or record.reference or '').strip()[:100]

            cat = resolve_salary_category(record.school, record.staff)
            if not record.finance_entry:
                f_entry = FinanceEntry.objects.create(
                    school=record.school,
                    category=cat,
                    amount=record.net,
                    date=paid_on,
                    description=f"Salary {record.month}: {record.staff.full_name} ({record.staff.position})",
                    created_by=user
                )
                record.finance_entry = f_entry
            else:
                record.finance_entry.voided = False
                record.finance_entry.category = cat
                record.finance_entry.amount = record.net
                record.finance_entry.date = paid_on
                record.finance_entry.save(update_fields=['voided', 'category', 'amount', 'date'])

            record.status = 'paid'
            record.paid_on = paid_on
            record.method = method
            record.reference = ref
            record.save()
            record_event(actor=user, action='pay', obj=record)

        elif target_status in ('pending', 'cancelled', 'draft'):
            if record.finance_entry:
                old_f = record.finance_entry
                record.finance_entry = None
                record.save(update_fields=['finance_entry'])
                old_f.delete()

            record.status = target_status
            record.paid_on = None
            record.save()
            record_event(actor=user, action='update_status', obj=record)

        elif target_status == 'void':
            record.status = 'void'
            record.void_reason = (request.data.get('reason') or 'Voided').strip()[:255]
            if record.finance_entry and not record.finance_entry.voided:
                record.finance_entry.voided = True
                record.finance_entry.save(update_fields=['voided'])
            record.save()
            record_event(actor=user, action='void', obj=record)

    return Response({
        'id': record.id,
        'status': record.status,
        'due_date': str(record.due_date) if record.due_date else None,
        'paid_on': str(record.paid_on) if record.paid_on else None,
        'net': str(record.net),
        'finance_entry_id': record.finance_entry_id
    })


@api_view(['POST'])
def salary_void(request, pk):
    """Void a salary record and void its linked FinanceEntry."""
    user = request.user
    _require_manager(user)

    record = SalaryRecord.objects.filter(pk=pk, school__in=schools_scope(user)).select_related('finance_entry').first()
    if not record:
        raise NotFound()

    if record.status == 'void':
        raise ValidationError({'detail': 'Salary record is already voided.'})

    reason = (request.data.get('reason') or '').strip()[:255]
    if not reason:
        raise ValidationError({'reason': 'A reason must be given to void a salary record.'})

    with transaction.atomic():
        record.status = 'void'
        record.void_reason = reason
        record.save(update_fields=['status', 'void_reason'])

        if record.finance_entry and not record.finance_entry.voided:
            record.finance_entry.voided = True
            record.finance_entry.save(update_fields=['voided'])
            record_event(actor=user, action='void', obj=record.finance_entry)

        record_event(actor=user, action='void', obj=record)

    return Response({'id': record.id, 'status': 'void', 'void_reason': reason})


# ------------------------------------------------------------------ Payslips & My Payslips
@api_view(['GET'])
def salary_payslip(request, pk):
    """Full printable payslip data for a salary record."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')

    record = SalaryRecord.objects.filter(pk=pk).select_related('staff', 'school').first()
    if not record:
        raise NotFound()

    # Permission check: manager within school scope, or the staff member themselves
    is_mgr = user.is_superuser or (user.role in MANAGERS and record.school_id in schools_scope(user).values_list('id', flat=True))
    is_self = record.staff.user_id == user.id

    if not is_mgr and not is_self:
        raise PermissionDenied('You can only view your own payslips.')

    return Response({
        'id': record.id,
        'month': record.month,
        'school_name': record.school.name,
        'school_city': record.school.city,
        'currency': record.school.currency,
        'staff': {
            'id': record.staff_id,
            'name': record.staff.full_name,
            'position': record.staff.position,
            'hired_on': str(record.staff.hired_on),
            'email': record.staff.email,
        },
        'basic': str(record.basic),
        'allowances_total': str(record.allowances_total),
        'deductions_total': str(record.deductions_total),
        'additions_total': str(record.additions_total),
        'advance_recovered': str(record.advance_recovered),
        'gross': str(record.gross),
        'net': str(record.net),
        'status': record.status,
        'paid_on': str(record.paid_on) if record.paid_on else None,
        'method': record.method,
        'reference': record.reference,
        'details': record.details
    })


@api_view(['GET'])
def my_payslips(request):
    """Endpoint for teachers/staff to view their own paid payslips."""
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')

    staff = StaffMember.objects.filter(user=user).first()
    if not staff:
        return Response({'results': []})

    qs = SalaryRecord.objects.filter(staff=staff).exclude(status='void').order_by('-month')
    results = [{
        'id': r.id,
        'month': r.month,
        'gross': str(r.gross),
        'net': str(r.net),
        'status': r.status,
        'paid_on': str(r.paid_on) if r.paid_on else None,
        'method': r.method,
    } for r in qs]
    return Response({'results': results})


# ------------------------------------------------------------------ Salaries Summary (Rollup KPI)
@api_view(['GET'])
def salaries_summary(request):
    user = request.user
    _require_manager(user)

    schools = schools_scope(user)
    if request.query_params.get('school'):
        schools = schools.filter(pk=request.query_params['school'])

    records = SalaryRecord.objects.filter(school__in=schools).exclude(status='void')

    paid_records = records.filter(status='paid')
    total_paid = paid_records.aggregate(s=Sum('net'))['s'] or Decimal('0.00')
    total_pending = records.filter(status__in=['draft', 'approved']).aggregate(s=Sum('net'))['s'] or Decimal('0.00')

    # Monthly breakdown
    monthly = {}
    for r in records:
        m = r.month
        if m not in monthly:
            monthly[m] = {'month': m, 'paid': Decimal('0.00'), 'pending': Decimal('0.00'), 'count': 0}
        if r.status == 'paid':
            monthly[m]['paid'] += r.net
        else:
            monthly[m]['pending'] += r.net
        monthly[m]['count'] += 1

    monthly_list = []
    for m in sorted(monthly.keys()):
        monthly_list.append({
            'month': m,
            'paid': float(monthly[m]['paid']),
            'pending': float(monthly[m]['pending']),
            'count': monthly[m]['count']
        })

    campus_breakdown = []
    for s in schools:
        s_recs = records.filter(school=s)
        s_paid = s_recs.filter(status='paid').aggregate(s=Sum('net'))['s'] or Decimal('0.00')
        s_pending = s_recs.filter(status__in=['draft', 'approved']).aggregate(s=Sum('net'))['s'] or Decimal('0.00')
        campus_breakdown.append({
            'school_id': s.id,
            'name': s.name,
            'paid': float(s_paid),
            'pending': float(s_pending),
            'total': float(s_paid + s_pending)
        })
    campus_breakdown = sort_comparison_rows(campus_breakdown, metric_key='paid', name_key='name', reverse=True)

    return Response({
        'total_paid': str(total_paid),
        'total_pending': str(total_pending),
        'monthly': monthly_list,
        'campuses': campus_breakdown
    })
