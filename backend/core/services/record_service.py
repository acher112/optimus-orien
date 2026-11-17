"""Record Reporting Service (Spec Part A).

Provides high-performance reporting queries over existing single sources of truth
(StaffMember, Student, Enrollment, StudentFee, FeePayment, FinanceEntry, SalaryRecord)
plus append-only lifecycle event tables (StaffLifecycleEvent, StudentLifecycleEvent).
"""
from decimal import Decimal
from datetime import date, datetime
from zoneinfo import ZoneInfo
from django.db.models import Sum, Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied

from core.models import (
    School, StaffMember, Student, Enrollment, AcademicYear, SchoolClass, Section,
    StudentFee, FeePayment, FinanceCategory, FinanceEntry, SalaryRecord,
    StaffLifecycleEvent, StudentLifecycleEvent, LifecycleReasonCategory
)
from core.services.audit import record_event
from core.services.record_permissions import can_view_salary_lines, can_view_terminated_notes

D_ZERO = Decimal('0.00')
TZ_KARACHI = ZoneInfo('Asia/Karachi')


def parse_date_filters(query_params):
    """Extracts and normalizes start_date, end_date, month, and academic_year filters."""
    start_date = None
    end_date = None

    month_str = query_params.get('month')
    if month_str:
        try:
            dt = datetime.strptime(month_str.strip(), '%Y-%m')
            # First day of month
            start_date = date(dt.year, dt.month, 1)
            # Last day of month
            import calendar
            _, last_day = calendar.monthrange(dt.year, dt.month)
            end_date = date(dt.year, dt.month, last_day)
        except (ValueError, TypeError):
            pass

    start_param = query_params.get('start_date')
    if start_param:
        try:
            start_date = date.fromisoformat(str(start_param).strip())
        except ValueError:
            pass

    end_param = query_params.get('end_date')
    if end_param:
        try:
            end_date = date.fromisoformat(str(end_param).strip())
        except ValueError:
            pass

    academic_year_id = query_params.get('academic_year') or query_params.get('session')
    return {
        'start_date': start_date,
        'end_date': end_date,
        'month': month_str,
        'academic_year_id': int(academic_year_id) if academic_year_id and str(academic_year_id).isdigit() else None
    }


def get_record_overview(school, query_params, user, is_all=False, schools=None):
    """Computes high-level summary cards, monthly rolling summary, and yearly table for Record Overview (A8)."""
    filters = parse_date_filters(query_params)
    start_date = filters['start_date']
    end_date = filters['end_date']
    year_id = filters['academic_year_id']
    class_id = query_params.get('class') or query_params.get('school_class')

    if is_all and schools is not None:
        target_schools = schools
        primary_school = schools.first()
        school_filter = {'school__in': target_schools}
        student_school_filter = {'student__school__in': target_schools}
        school_name = 'All Campuses (Consolidated)'
        school_code = 'ALL'
        school_id = 'all'
        campus_count = target_schools.count()
    else:
        target_schools = School.objects.filter(pk=school.pk) if hasattr(school, 'pk') else schools
        primary_school = school
        school_filter = {'school': primary_school}
        student_school_filter = {'student__school': primary_school}
        school_name = primary_school.name if primary_school else ''
        school_code = primary_school.code if primary_school else ''
        school_id = primary_school.id if primary_school else ''
        campus_count = 1

    # 1. Staff Events Summary
    staff_qs = StaffLifecycleEvent.objects.filter(**school_filter, is_void=False)
    if start_date:
        staff_qs = staff_qs.filter(effective_date__gte=start_date)
    if end_date:
        staff_qs = staff_qs.filter(effective_date__lte=end_date)

    staff_counts = {
        'joined': staff_qs.filter(event_type__in=('joined', 'rejoined')).count(),
        'resigned': staff_qs.filter(event_type='resigned').count(),
        'terminated': staff_qs.filter(event_type='terminated').count(),
        'transferred': staff_qs.filter(event_type='transferred').count(),
        'retired': staff_qs.filter(event_type='retired').count(),
        'active_current': StaffMember.objects.filter(**school_filter, status='active').count(),
    }

    # 2. Student Events Summary
    std_qs = StudentLifecycleEvent.objects.filter(**school_filter, is_void=False)
    if class_id and str(class_id).isdigit():
        std_qs = std_qs.filter(school_class_id=int(class_id))
    if start_date:
        std_qs = std_qs.filter(effective_date__gte=start_date)
    if end_date:
        std_qs = std_qs.filter(effective_date__lte=end_date)
    if year_id:
        std_qs = std_qs.filter(academic_year_id=year_id)

    if class_id and str(class_id).isdigit():
        active_student_count = Enrollment.objects.filter(school_class_id=int(class_id), end_date__isnull=True).count()
    else:
        active_student_count = Student.objects.filter(**school_filter, active=True).count()

    student_counts = {
        'admitted': std_qs.filter(event_type='admitted').count(),
        'promoted': std_qs.filter(event_type='promoted').count(),
        'not_promoted': std_qs.filter(event_type='not_promoted').count(),
        'passed_out': std_qs.filter(event_type='passed_out').count(),
        'left': std_qs.filter(event_type='left').count(),
        'active_current': active_student_count,
    }

    # 3. Fees Summary (StudentFee + FeePayment)
    fee_lines_qs = StudentFee.objects.filter(**student_school_filter)
    if class_id and str(class_id).isdigit():
        fee_lines_qs = fee_lines_qs.filter(student__enrollments__school_class_id=int(class_id), student__enrollments__end_date__isnull=True)
    if start_date:
        fee_lines_qs = fee_lines_qs.filter(due_date__gte=start_date)
    if end_date:
        fee_lines_qs = fee_lines_qs.filter(due_date__lte=end_date)

    fee_agg = fee_lines_qs.aggregate(
        billed=Sum('amount_due'),
        discounts=Sum('discount'),
    )
    total_billed = fee_agg['billed'] or D_ZERO
    total_waived = fee_agg['discounts'] or D_ZERO

    payments_qs = FeePayment.objects.filter(**school_filter, status='approved', voided=False)
    if class_id and str(class_id).isdigit():
        payments_qs = payments_qs.filter(student__enrollments__school_class_id=int(class_id), student__enrollments__end_date__isnull=True)
    if start_date:
        payments_qs = payments_qs.filter(paid_on__gte=start_date)
    if end_date:
        payments_qs = payments_qs.filter(paid_on__lte=end_date)

    total_collected = payments_qs.aggregate(total=Sum('amount'))['total'] or D_ZERO
    net_billed = max(D_ZERO, total_billed - total_waived)
    total_outstanding = max(D_ZERO, net_billed - total_collected)
    collection_rate = round((float(total_collected) / float(net_billed) * 100), 2) if net_billed > 0 else 100.0

    fees_summary = {
        'billed': total_billed,
        'waived': total_waived,
        'collected': total_collected,
        'outstanding': total_outstanding,
        'collection_rate': collection_rate,
    }

    # 4. Finance (Income vs Expense)
    finance_qs = FinanceEntry.objects.filter(**school_filter, voided=False)
    if start_date:
        finance_qs = finance_qs.filter(date__gte=start_date)
    if end_date:
        finance_qs = finance_qs.filter(date__lte=end_date)

    income_total = finance_qs.filter(category__kind='income').aggregate(t=Sum('amount'))['t'] or D_ZERO
    expense_total = finance_qs.filter(category__kind='expense').aggregate(t=Sum('amount'))['t'] or D_ZERO
    net_finance = income_total - expense_total

    finance_summary = {
        'income': income_total,
        'expense': expense_total,
        'net': net_finance,
    }

    # 5. Salaries
    salaries_qs = SalaryRecord.objects.filter(**school_filter, status='paid')
    if filters['month']:
        salaries_qs = salaries_qs.filter(month=filters['month'])
    salaries_agg = salaries_qs.aggregate(total=Sum('net'), count=Count('id'))
    total_salaries_paid = salaries_agg['total'] or D_ZERO
    salaries_staff_count = salaries_agg['count'] or 0

    salaries_summary = {
        'total_paid': total_salaries_paid,
        'staff_count': salaries_staff_count,
    }

    # 6. Monthly Rollup (Chronological)
    monthly_rows = []
    # Collect distinct months from payments and expenses
    distinct_months = set()
    for fp in payments_qs.values_list('paid_on', flat=True)[:100]:
        if fp:
            distinct_months.add(fp.strftime('%Y-%m'))
    for fe in finance_qs.values_list('date', flat=True)[:100]:
        if fe:
            distinct_months.add(fe.strftime('%Y-%m'))
    if not distinct_months:
        distinct_months.add(timezone.localdate().strftime('%Y-%m'))

    for m in sorted(distinct_months):
        m_income = finance_qs.filter(date__startswith=m, category__kind='income').aggregate(t=Sum('amount'))['t'] or D_ZERO
        m_expense = finance_qs.filter(date__startswith=m, category__kind='expense').aggregate(t=Sum('amount'))['t'] or D_ZERO
        m_salaries = SalaryRecord.objects.filter(**school_filter, month=m, status='paid').aggregate(t=Sum('net'))['t'] or D_ZERO
        m_collected = FeePayment.objects.filter(**school_filter, status='approved', voided=False, paid_on__startswith=m).aggregate(t=Sum('amount'))['t'] or D_ZERO
        m_admitted = StudentLifecycleEvent.objects.filter(**school_filter, event_type='admitted', is_void=False, effective_date__startswith=m).count()
        m_left = StudentLifecycleEvent.objects.filter(**school_filter, event_type='left', is_void=False, effective_date__startswith=m).count()

        monthly_rows.append({
            'month': m,
            'admitted': m_admitted,
            'left': m_left,
            'collected': m_collected,
            'income': m_income,
            'expense': m_expense,
            'net': m_income - m_expense,
            'salaries': m_salaries,
        })

    # 7. Yearly Rollup
    yearly_rows = []
    curr_year = timezone.localdate().year
    for y in [curr_year - 1, curr_year]:
        y_str = str(y)
        y_admitted = StudentLifecycleEvent.objects.filter(**school_filter, event_type='admitted', is_void=False, effective_date__year=y).count()
        y_left = StudentLifecycleEvent.objects.filter(**school_filter, event_type='left', is_void=False, effective_date__year=y).count()
        y_collected = FeePayment.objects.filter(**school_filter, status='approved', voided=False, paid_on__year=y).aggregate(t=Sum('amount'))['t'] or D_ZERO
        y_income = finance_qs.filter(date__year=y, category__kind='income').aggregate(t=Sum('amount'))['t'] or D_ZERO
        y_expense = finance_qs.filter(date__year=y, category__kind='expense').aggregate(t=Sum('amount'))['t'] or D_ZERO
        yearly_rows.append({
            'year': y,
            'admitted': y_admitted,
            'left': y_left,
            'collected': y_collected,
            'income': y_income,
            'expense': y_expense,
            'net': y_income - y_expense,
        })

    # Year over year growth
    yoy = {}
    if len(yearly_rows) >= 2:
        y_prev, y_curr = yearly_rows[-2], yearly_rows[-1]
        adm_growth = ((y_curr['admitted'] - y_prev['admitted']) / y_prev['admitted'] * 100) if y_prev['admitted'] > 0 else 0.0
        coll_growth = ((float(y_curr['collected']) - float(y_prev['collected'])) / float(y_prev['collected']) * 100) if y_prev['collected'] > 0 else 0.0
        yoy = {
            'admissions_growth_pct': round(adm_growth, 2),
            'collection_growth_pct': round(coll_growth, 2),
        }

    return {
        'meta': {
            'school_id': school_id,
            'school_name': school_name,
            'school_code': school_code,
            'is_all_campuses': is_all,
            'campus_count': campus_count,
            'period_label': filters['month'] or (f"{start_date} to {end_date}" if start_date and end_date else 'All time'),
            'tz': 'Asia/Karachi',
        },
        'cards': {
            'staff': staff_counts,
            'students': student_counts,
            'fees': fees_summary,
            'finance': finance_summary,
            'salaries': salaries_summary,
        },
        'monthly_summary': monthly_rows,
        'yearly_summary': yearly_rows,
        'yoy_comparison': yoy,
    }


def get_staff_records(school, query_params, user, is_all=False, schools=None):
    """Retrieves paginated and filtered staff lifecycle records (A3-A6)."""
    if is_all and schools is not None:
        qs = StaffLifecycleEvent.objects.filter(school__in=schools, is_void=False)
    else:
        qs = StaffLifecycleEvent.objects.filter(school=school, is_void=False)
    qs = qs.select_related(
        'school', 'staff', 'from_campus', 'to_campus', 'reason_category', 'recorded_by'
    )

    ev_type = query_params.get('event_type')
    if ev_type and ev_type != 'all':
        qs = qs.filter(event_type=ev_type)

    search = query_params.get('search')
    if search:
        s = search.strip()
        qs = qs.filter(
            Q(staff__first_name__icontains=s) |
            Q(staff__last_name__icontains=s) |
            Q(staff__position__icontains=s)
        )

    filters = parse_date_filters(query_params)
    if filters['start_date']:
        qs = qs.filter(effective_date__gte=filters['start_date'])
    if filters['end_date']:
        qs = qs.filter(effective_date__lte=filters['end_date'])

    show_term_notes = can_view_terminated_notes(user)

    rows = []
    for ev in qs:
        # Notes restriction: terminated notes visible ONLY to owner and org admin
        notes_val = ''
        if ev.event_type == 'terminated':
            notes_val = ev.restricted_notes if show_term_notes else '[Confidential]'
        else:
            notes_val = ev.notes or ev.reason_text

        rows.append({
            'id': ev.id,
            'campus_id': ev.school_id,
            'campus_name': ev.school.name,
            'campus_code': ev.school.code,
            'staff_id': ev.staff_id,
            'staff_name': ev.staff.full_name,
            'position': ev.staff.position,
            'role': ev.staff.role,
            'event_type': ev.event_type,
            'event_type_display': ev.get_event_type_display(),
            'effective_date': str(ev.effective_date),
            'reason_category': ev.reason_category.name_en if ev.reason_category else '',
            'from_campus': ev.from_campus.name if ev.from_campus else '',
            'to_campus': ev.to_campus.name if ev.to_campus else '',
            'notes': notes_val,
            'recorded_by': ev.recorded_by.get_full_name() or ev.recorded_by.username if ev.recorded_by else '',
            'created_at': ev.created_at.strftime('%Y-%m-%d %H:%M'),
        })

    return rows


def get_student_records(school, query_params, is_all=False, schools=None):
    """Retrieves paginated and filtered student lifecycle records (A3-A6)."""
    if is_all and schools is not None:
        qs = StudentLifecycleEvent.objects.filter(school__in=schools, is_void=False)
    else:
        qs = StudentLifecycleEvent.objects.filter(school=school, is_void=False)
    qs = qs.select_related(
        'school', 'student', 'school_class', 'section', 'academic_year', 'reason_category', 'recorded_by'
    )

    ev_type = query_params.get('event_type')
    if ev_type and ev_type != 'all':
        qs = qs.filter(event_type=ev_type)

    class_id = query_params.get('class') or query_params.get('school_class')
    if class_id and str(class_id).isdigit():
        qs = qs.filter(school_class_id=int(class_id))

    section_id = query_params.get('section')
    if section_id and str(section_id).isdigit():
        qs = qs.filter(section_id=int(section_id))

    search = query_params.get('search')
    if search:
        s = search.strip()
        qs = qs.filter(
            Q(student__first_name__icontains=s) |
            Q(student__last_name__icontains=s) |
            Q(student__admission_number__icontains=s)
        )

    filters = parse_date_filters(query_params)
    if filters['start_date']:
        qs = qs.filter(effective_date__gte=filters['start_date'])
    if filters['end_date']:
        qs = qs.filter(effective_date__lte=filters['end_date'])
    if filters['academic_year_id']:
        qs = qs.filter(academic_year_id=filters['academic_year_id'])

    rows = []
    for ev in qs:
        rows.append({
            'id': ev.id,
            'campus_id': ev.school_id,
            'campus_name': ev.school.name,
            'campus_code': ev.school.code,
            'student_id': ev.student_id,
            'admission_number': ev.student.admission_number,
            'student_name': ev.student.full_name,
            'class_name': ev.school_class.name if ev.school_class else '',
            'section_name': ev.section.name if ev.section else '',
            'session_name': ev.academic_year.name if ev.academic_year else '',
            'event_type': ev.event_type,
            'event_type_display': ev.get_event_type_display(),
            'leave_subtype': ev.leave_subtype,
            'effective_date': str(ev.effective_date),
            'reason': ev.reason_category.name_en if ev.reason_category else (ev.reason_text or ''),
            'notes': ev.notes,
            'recorded_by': ev.recorded_by.get_full_name() or ev.recorded_by.username if ev.recorded_by else '',
            'created_at': ev.created_at.strftime('%Y-%m-%d %H:%M'),
        })
    return rows


def get_fees_records(school, query_params, is_all=False, schools=None):
    """Retrieves fee rolls, collections, and defaulters history (A3, A6)."""
    filters = parse_date_filters(query_params)
    defaulters_only = query_params.get('defaulters_only') in ('true', '1', 'True')
    payment_mode = query_params.get('payment_mode')
    class_id = query_params.get('class') or query_params.get('school_class')

    if defaulters_only:
        # Outstanding dues
        if is_all and schools is not None:
            fee_qs = StudentFee.objects.filter(
                student__school__in=schools,
                status__in=['unpaid', 'partial']
            )
        else:
            fee_qs = StudentFee.objects.filter(
                student__school=school,
                status__in=['unpaid', 'partial']
            )
        fee_qs = fee_qs.select_related('student', 'student__school', 'head').order_by('-due_date')

        if class_id and str(class_id).isdigit():
            fee_qs = fee_qs.filter(student__enrollments__school_class_id=int(class_id), student__enrollments__end_date__isnull=True)

        rows = []
        for f in fee_qs[:500]:
            c_name = f.student.school.name if f.student and f.student.school else ''
            rows.append({
                'id': f.id,
                'campus_name': c_name,
                'admission_number': f.student.admission_number,
                'student_name': f.student.full_name,
                'fee_head': f.head.name,
                'period': f.period,
                'amount_due': f.amount_due,
                'discount': f.discount,
                'net_due': f.net_due,
                'status': f.get_status_display(),
                'due_date': str(f.due_date),
            })
        return rows

    # Standard Payments History
    if is_all and schools is not None:
        pay_qs = FeePayment.objects.filter(school__in=schools, status='approved', voided=False)
    else:
        pay_qs = FeePayment.objects.filter(school=school, status='approved', voided=False)
    pay_qs = pay_qs.select_related('student', 'student__school', 'school', 'received_by').order_by('-paid_on', '-id')

    if class_id and str(class_id).isdigit():
        pay_qs = pay_qs.filter(student__enrollments__school_class_id=int(class_id), student__enrollments__end_date__isnull=True)

    if payment_mode and payment_mode != 'all':
        pay_qs = pay_qs.filter(method=payment_mode)
    if filters['start_date']:
        pay_qs = pay_qs.filter(paid_on__gte=filters['start_date'])
    if filters['end_date']:
        pay_qs = pay_qs.filter(paid_on__lte=filters['end_date'])

    rows = []
    for p in pay_qs[:1000]:
        c_name = p.school.name if getattr(p, 'school', None) else (p.student.school.name if getattr(p, 'student', None) and p.student.school else '')
        rows.append({
            'id': p.id,
            'campus_name': c_name,
            'receipt_number': p.receipt_number,
            'admission_number': p.student.admission_number,
            'student_name': p.student.full_name,
            'amount': p.amount,
            'method': p.get_method_display(),
            'paid_on': str(p.paid_on),
            'reference': p.reference,
            'received_by': p.received_by.get_full_name() or p.received_by.username if p.received_by else '',
        })
    return rows


def get_finance_records(school, query_params, is_all=False, schools=None):
    """Retrieves income & expense ledger transactions with category totals (A3, A6)."""
    filters = parse_date_filters(query_params)
    kind = query_params.get('kind')
    cat_id = query_params.get('category_id')

    if is_all and schools is not None:
        qs = FinanceEntry.objects.filter(school__in=schools, voided=False)
    else:
        qs = FinanceEntry.objects.filter(school=school, voided=False)
    qs = qs.select_related('school', 'category', 'created_by').order_by('-date', '-id')

    if kind in ('income', 'expense'):
        qs = qs.filter(category__kind=kind)
    if cat_id and str(cat_id).isdigit():
        qs = qs.filter(category_id=int(cat_id))
    if filters['start_date']:
        qs = qs.filter(date__gte=filters['start_date'])
    if filters['end_date']:
        qs = qs.filter(date__lte=filters['end_date'])

    rows = []
    for fe in qs[:1000]:
        rows.append({
            'id': fe.id,
            'campus_name': fe.school.name,
            'kind': fe.category.get_kind_display(),
            'category_name': fe.category.name,
            'amount': fe.amount,
            'date': str(fe.date),
            'description': fe.description,
            'created_by': fe.created_by.get_full_name() or fe.created_by.username if fe.created_by else '',
        })
    return rows


def get_salary_records(school, query_params, user, is_all=False, schools=None):
    """Retrieves monthly salary records with principal line item masking (A3, A5, A6)."""
    month = query_params.get('month')
    if is_all and schools is not None:
        qs = SalaryRecord.objects.filter(school__in=schools, status='paid')
        target_s = schools.first()
    else:
        qs = SalaryRecord.objects.filter(school=school, status='paid')
        target_s = school
    qs = qs.select_related('school', 'staff').order_by('staff__last_name', 'staff__first_name')

    if month:
        qs = qs.filter(month=month)

    show_lines = can_view_salary_lines(user, target_s)

    rows = []
    for sr in qs[:500]:
        rows.append({
            'id': sr.id,
            'campus_name': sr.school.name,
            'staff_name': sr.staff.full_name,
            'position': sr.staff.position,
            'month': sr.month,
            'basic': sr.basic if show_lines else None,
            'gross': sr.gross if show_lines else None,
            'deductions': sr.deductions_total if show_lines else None,
            'net': sr.net if show_lines else None,
            'paid_on': str(sr.paid_on) if sr.paid_on else '',
            'method': sr.get_method_display(),
            'masked': not show_lines,
        })
    return rows


def create_manual_lifecycle_event(school, target_type, data, user):
    """Manually records an append-only lifecycle event (A4)."""
    if target_type == 'staff':
        staff_id = data.get('staff_id')
        staff = StaffMember.objects.filter(school=school, pk=staff_id).first()
        if not staff:
            raise ValidationError({'staff_id': 'Staff member not found in this campus.'})

        ev = StaffLifecycleEvent(
            staff=staff,
            school=school,
            event_type=data.get('event_type'),
            effective_date=data.get('effective_date'),
            reason_category_id=data.get('reason_category_id'),
            reason_text=data.get('reason_text', ''),
            notes=data.get('notes', ''),
            restricted_notes=data.get('restricted_notes', ''),
            from_campus_id=data.get('from_campus_id'),
            to_campus_id=data.get('to_campus_id'),
            recorded_by=user,
        )
        ev.full_clean()
        ev.save()

        # Update staff status if separation event
        if ev.event_type in ('resigned', 'terminated', 'contract_ended', 'retired'):
            staff.status = 'terminated'
            staff.terminated_on = ev.effective_date
            staff.save()
            if staff.user:
                staff.user.is_active = False
                staff.user.save()
        elif ev.event_type in ('joined', 'rejoined'):
            staff.status = 'active'
            staff.terminated_on = None
            staff.save()
            if staff.user:
                staff.user.is_active = True
                staff.user.save()

        record_event(
            actor=user,
            action='create_staff_event',
            obj=ev,
            changed_fields=['event_type', 'effective_date'],
            after={'event_type': ev.event_type, 'effective_date': str(ev.effective_date)}
        )
        return ev

    elif target_type == 'student':
        student_id = data.get('student_id')
        student = Student.objects.filter(school=school, pk=student_id).first()
        if not student:
            raise ValidationError({'student_id': 'Student not found in this campus.'})

        school_class_id = data.get('school_class_id')
        school_class = SchoolClass.objects.filter(school=school, pk=school_class_id).first()
        if not school_class:
            raise ValidationError({'school_class_id': 'School class required.'})

        academic_year = school_class.academic_year
        section_id = data.get('section_id')

        ev = StudentLifecycleEvent(
            student=student,
            school=school,
            school_class=school_class,
            section_id=section_id,
            academic_year=academic_year,
            event_type=data.get('event_type'),
            leave_subtype=data.get('leave_subtype', ''),
            effective_date=data.get('effective_date'),
            reason_category_id=data.get('reason_category_id'),
            reason_text=data.get('reason_text', ''),
            notes=data.get('notes', ''),
            recorded_by=user,
        )
        ev.full_clean()
        ev.save()

        # Update student active flag
        if ev.event_type in ('left', 'passed_out'):
            student.active = False
            student.save()
            # Close active enrollment
            Enrollment.objects.filter(student=student, end_date__isnull=True).update(end_date=ev.effective_date)
            if student.user:
                student.user.is_active = False
                student.user.save()
        elif ev.event_type in ('admitted', 'promoted'):
            student.active = True
            student.save()

        record_event(
            actor=user,
            action='create_student_event',
            obj=ev,
            changed_fields=['event_type', 'effective_date'],
            after={'event_type': ev.event_type, 'effective_date': str(ev.effective_date)}
        )
        return ev

    raise ValidationError({'target_type': "Target must be 'staff' or 'student'."})


def void_lifecycle_event(event_model, event_id, school, reason, user):
    """Voids an append-only lifecycle event with a mandatory justification reason (A4)."""
    if not reason or not reason.strip():
        raise ValidationError({'void_reason': 'A mandatory reason is required to void a record.'})

    ev = event_model.objects.filter(school=school, pk=event_id, is_void=False).first()
    if not ev:
        raise ValidationError({'detail': 'Record not found or already voided.'})

    ev.is_void = True
    ev.void_reason = reason.strip()
    ev.voided_by = user
    ev.voided_at = timezone.now()
    ev.save()

    record_event(
        actor=user,
        action='void_lifecycle_event',
        obj=ev,
        changed_fields=['is_void', 'void_reason'],
        after={'is_void': True, 'void_reason': ev.void_reason}
    )
    return ev
