"""Fees management: fee heads, structures, student vouchers, payments, concessions, defaulters.

Every fee payment creates a linked FinanceEntry (kind 'income'). Voiding a payment immediately
voids the linked FinanceEntry so there is zero double counting or orphaned entries.
Access is strictly scoped by campus and role. Teachers have no access to fees.
Students and parents can only see their own ledger and receipts.
"""
from datetime import date
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Sum, Q
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import (
    School, SchoolClass, AcademicYear, Student, Enrollment,
    FinanceCategory, FinanceEntry,
    FeeHead, FeeStructure, Concession, StudentFee, FeePayment, FeePaymentAllocation, User
)
from core.services.access import schools_scope, students_scope
from core.services.audit import record_event

MANAGERS = ('organisation_admin', 'school_admin', 'principal')


def _require_manager(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if not user.is_superuser and user.role not in MANAGERS:
        raise PermissionDenied('Fee management requires administrator or principal role')


def _school(user, value):
    if not value and user.role != 'organisation_admin' and not user.is_superuser:
        value = user.school_id
    school = schools_scope(user).filter(pk=value or 0).first()
    if not school:
        raise ValidationError({'school': 'Choose a campus within your scope.'})
    return school


def _money(value, field='amount'):
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        raise ValidationError({field: 'Enter a valid decimal amount.'})
    if d < 0 or d >= Decimal('10000000000'):
        raise ValidationError({field: 'Amount must be positive and within reasonable limits.'})
    return d


# ------------------------------------------------------------------ Fee Heads
@api_view(['GET', 'POST'])
def heads(request):
    user = request.user
    _require_manager(user)
    if request.method == 'GET':
        qs = FeeHead.objects.filter(school__in=schools_scope(user)).select_related('school', 'category')
        if request.query_params.get('school'):
            qs = qs.filter(school_id=request.query_params['school'])
        rows = [{
            'id': h.id, 'school': h.school_id, 'school_name': h.school.name,
            'name': h.name, 'category': h.category_id, 'category_name': h.category.name,
            'active': h.active
        } for h in qs]
        return Response({'results': rows})

    school = _school(user, request.data.get('school'))
    name = (request.data.get('name') or '').strip()[:80]
    if not name:
        raise ValidationError({'name': 'Fee head name is required.'})

    cat_id = request.data.get('category')
    category = FinanceCategory.objects.filter(pk=cat_id, school=school, kind='income').first()
    if not category:
        category = FinanceCategory.objects.filter(school=school, kind='income', name__icontains='fee').first()
        if not category:
            category = FinanceCategory.objects.create(school=school, kind='income', name='Fee Collections')

    if FeeHead.objects.filter(school=school, name__iexact=name).exists():
        raise ValidationError({'name': 'A fee head with this name already exists for this campus.'})

    head = FeeHead.objects.create(school=school, name=name, category=category)
    record_event(actor=user, action='create', obj=head)
    return Response({
        'id': head.id, 'school': head.school_id, 'school_name': head.school.name,
        'name': head.name, 'category': head.category_id, 'category_name': head.category.name,
        'active': head.active
    }, status=201)


@api_view(['PATCH'])
def head_detail(request, pk):
    user = request.user
    _require_manager(user)
    head = FeeHead.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not head:
        raise NotFound()

    if 'active' in request.data:
        head.active = bool(request.data['active'])
        head.save(update_fields=['active'])
        record_event(actor=user, action='update', obj=head, changed_fields=['active'])
    return Response({'id': head.id, 'name': head.name, 'active': head.active})


# ------------------------------------------------------------------ Fee Structures
@api_view(['GET', 'POST'])
def structures(request):
    user = request.user
    _require_manager(user)
    if request.method == 'GET':
        qs = FeeStructure.objects.filter(school__in=schools_scope(user)).select_related('school', 'academic_year', 'school_class', 'head')
        if request.query_params.get('school'):
            qs = qs.filter(school_id=request.query_params['school'])
        if request.query_params.get('class'):
            qs = qs.filter(Q(school_class_id=request.query_params['class']) | Q(school_class__isnull=True))
        rows = [{
            'id': s.id, 'school': s.school_id, 'school_name': s.school.name,
            'academic_year': s.academic_year_id, 'academic_year_name': s.academic_year.name,
            'school_class': s.school_class_id, 'school_class_name': s.school_class.name if s.school_class else 'All Classes',
            'head': s.head_id, 'head_name': s.head.name,
            'amount': str(s.amount), 'frequency': s.frequency, 'due_day': s.due_day
        } for s in qs]
        return Response({'results': rows})

    school = _school(user, request.data.get('school'))
    head_id = request.data.get('head')
    head = FeeHead.objects.filter(pk=head_id, school=school, active=True).first()
    if not head:
        raise ValidationError({'head': 'Choose an active fee head for this campus.'})

    year_id = request.data.get('academic_year')
    year = AcademicYear.objects.filter(pk=year_id, school=school).first()
    if not year:
        year = AcademicYear.objects.filter(school=school, active=True).first()
    if not year:
        raise ValidationError({'academic_year': 'Academic year is required.'})

    class_id = request.data.get('school_class')
    school_class = None
    if class_id:
        school_class = SchoolClass.objects.filter(pk=class_id, school=school).first()
        if not school_class:
            raise ValidationError({'school_class': 'Invalid class for this campus.'})

    amount = _money(request.data.get('amount'))
    freq = request.data.get('frequency') or 'monthly'
    if freq not in ('one_time', 'monthly', 'term', 'annual'):
        raise ValidationError({'frequency': 'Frequency must be one_time, monthly, term, or annual.'})
    due_day = int(request.data.get('due_day') or 10)
    due_day = max(1, min(31, due_day))

    fs, created = FeeStructure.objects.update_or_create(
        school=school, academic_year=year, school_class=school_class, head=head,
        defaults={'amount': amount, 'frequency': freq, 'due_day': due_day}
    )
    record_event(actor=user, action='create' if created else 'update', obj=fs)
    return Response({
        'id': fs.id, 'school': fs.school_id, 'school_name': fs.school.name,
        'academic_year': fs.academic_year_id, 'school_class': fs.school_class_id,
        'head': fs.head_id, 'head_name': fs.head.name, 'amount': str(fs.amount),
        'frequency': fs.frequency, 'due_day': fs.due_day
    }, status=201 if created else 200)


@api_view(['GET', 'PATCH', 'DELETE'])
def structure_detail(request, pk):
    user = request.user
    _require_manager(user)
    fs = FeeStructure.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not fs:
        raise NotFound()

    if request.method == 'GET':
        return Response({
            'id': fs.id, 'school': fs.school_id, 'head': fs.head_id,
            'amount': str(fs.amount), 'frequency': fs.frequency, 'due_day': fs.due_day
        })

    if request.method == 'PATCH':
        if 'amount' in request.data:
            fs.amount = _money(request.data['amount'])
        if 'due_day' in request.data:
            fs.due_day = max(1, min(31, int(request.data['due_day'])))
        fs.save()
        record_event(actor=user, action='update', obj=fs)
        return Response({'id': fs.id, 'amount': str(fs.amount), 'due_day': fs.due_day})

    if request.method == 'DELETE':
        record_event(actor=user, action='delete', obj=fs)
        fs.delete()
        return Response({'success': True, 'detail': 'Fee structure deleted successfully'}, status=200)


# ------------------------------------------------------------------ Concessions / Discounts
@api_view(['GET', 'POST'])
def concessions(request):
    user = request.user
    _require_manager(user)

    if request.method == 'GET':
        qs = Concession.objects.filter(student__school__in=schools_scope(user)).select_related('student', 'head', 'approved_by')
        if request.query_params.get('student'):
            qs = qs.filter(student_id=request.query_params['student'])
        results = [{
            'id': c.id,
            'student_id': c.student_id,
            'student_name': c.student.full_name,
            'head_id': c.head_id,
            'head_name': c.head.name if c.head else 'All Fee Heads',
            'discount_type': c.discount_type,
            'discount_value': str(c.discount_value),
            'reason': c.reason,
            'approved_by': c.approved_by.username,
            'valid_from': str(c.valid_from),
            'valid_to': str(c.valid_to) if c.valid_to else None,
        } for c in qs]
        return Response({'results': results})

    student_id = request.data.get('student')
    student = Student.objects.filter(pk=student_id, school__in=schools_scope(user)).first()
    if not student:
        raise ValidationError({'student': 'Valid student required.'})

    head_id = request.data.get('head')
    head = FeeHead.objects.filter(pk=head_id, school=student.school).first() if head_id else None

    disc_type = request.data.get('discount_type', 'percent')
    if disc_type not in ('percent', 'fixed'):
        raise ValidationError({'discount_type': 'Discount type must be percent or fixed.'})

    disc_val = _money(request.data.get('discount_value', '0.00'), 'discount_value')
    reason = (request.data.get('reason') or '').strip()[:200]
    if not reason:
        raise ValidationError({'reason': 'Reason for concession is required.'})

    from_str = request.data.get('valid_from')
    valid_from = date.fromisoformat(from_str) if from_str else date.today()
    to_str = request.data.get('valid_to')
    valid_to = date.fromisoformat(to_str) if to_str else None

    c = Concession.objects.create(
        student=student,
        head=head,
        discount_type=disc_type,
        discount_value=disc_val,
        reason=reason,
        approved_by=user,
        valid_from=valid_from,
        valid_to=valid_to
    )
    record_event(actor=user, action='create', obj=c)
    return Response({'id': c.id, 'student_id': c.student_id, 'discount_value': str(c.discount_value)}, status=201)


@api_view(['DELETE'])
def concession_detail(request, pk):
    user = request.user
    _require_manager(user)
    c = Concession.objects.filter(pk=pk, student__school__in=schools_scope(user)).first()
    if not c:
        raise NotFound()
    record_event(actor=user, action='delete', obj=c)
    c.delete()
    return Response({'success': True, 'detail': 'Concession deleted successfully'}, status=200)


# ------------------------------------------------------------------ Billing Generator
@api_view(['POST'])
def generate_vouchers(request):
    """Idempotently generates StudentFee line items for a given period and class/school."""
    user = request.user
    _require_manager(user)
    school = _school(user, request.data.get('school'))
    period = (request.data.get('period') or '').strip()
    if not period:
        raise ValidationError({'period': 'Billing period is required (e.g. 2026-10).'})

    class_id = request.data.get('school_class')
    classes = SchoolClass.objects.filter(school=school)
    if class_id:
        classes = classes.filter(pk=class_id)

    enrollments = Enrollment.objects.filter(school_class__in=classes, end_date__isnull=True).select_related('student', 'school_class')
    created_count = 0
    with transaction.atomic():
        for en in enrollments:
            st = en.student
            sc = en.school_class
            structures = FeeStructure.objects.filter(
                school=school, academic_year=sc.academic_year, head__active=True
            ).filter(Q(school_class=sc) | Q(school_class__isnull=True))

            for fs in structures:
                concession = Concession.objects.filter(
                    student=st
                ).filter(Q(head=fs.head) | Q(head__isnull=True)).first()

                discount = Decimal('0.00')
                if concession:
                    if concession.discount_type == 'percent':
                        discount = (fs.amount * (concession.discount_value / Decimal('100.00'))).quantize(Decimal('0.01'))
                    else:
                        discount = min(fs.amount, concession.discount_value)

                try:
                    parts = period.split('-')
                    if len(parts) == 2 and len(parts[0]) == 4:
                        due_date = date(int(parts[0]), int(parts[1]), min(fs.due_day, 28))
                    else:
                        due_date = date.today()
                except Exception:
                    due_date = date.today()

                _, created = StudentFee.objects.get_or_create(
                    student=st, head=fs.head, period=period,
                    defaults={'amount_due': fs.amount, 'discount': discount, 'status': 'unpaid', 'due_date': due_date}
                )
                if created:
                    created_count += 1

    return Response({'success': True, 'period': period, 'vouchers_created': created_count})


# ------------------------------------------------------------------ Student Ledger
@api_view(['GET'])
def student_ledger(request, student_id):
    user = request.user
    if not user.is_authenticated:
        raise PermissionDenied('Authentication required')

    if user.role == 'student':
        student = Student.objects.filter(pk=student_id, user=user).first()
    elif user.role == 'parent':
        student = Student.objects.filter(pk=student_id, guardians=user).first()
    else:
        _require_manager(user)
        student = Student.objects.filter(pk=student_id, school__in=schools_scope(user)).first()

    if not student:
        raise NotFound('Student record not found or outside your scope.')

    fees = StudentFee.objects.filter(student=student).select_related('head')
    payments = FeePayment.objects.filter(student=student, voided=False).prefetch_related('allocations__student_fee__head')

    total_billed = sum((f.net_due for f in fees if f.status != 'void'), Decimal('0.00'))
    total_paid = sum((p.amount for p in payments), Decimal('0.00'))
    balance = total_billed - total_paid

    return Response({
        'student': {'id': student.id, 'name': student.full_name, 'admission_number': student.admission_number, 'school': student.school_id, 'school_name': student.school.name},
        'summary': {'total_billed': str(total_billed), 'total_paid': str(total_paid), 'outstanding_balance': str(max(Decimal('0.00'), balance)), 'credit_balance': str(max(Decimal('0.00'), -balance))},
        'fee_lines': [{
            'id': f.id, 'head_id': f.head_id, 'head_name': f.head.name, 'period': f.period,
            'amount_due': str(f.amount_due), 'discount': str(f.discount), 'net_due': str(f.net_due),
            'status': f.status, 'due_date': str(f.due_date)
        } for f in fees],
        'payments': [{
            'id': p.id, 'receipt_number': p.receipt_number, 'amount': str(p.amount),
            'method': p.method, 'paid_on': str(p.paid_on), 'reference': p.reference
        } for p in payments]
    })


# ------------------------------------------------------------------ Fee Collection & Receipts
@api_view(['GET', 'POST'])
def payments(request):
    user = request.user
    _require_manager(user)
    if request.method == 'GET':
        qs = FeePayment.objects.filter(school__in=schools_scope(user)).select_related('student', 'school', 'received_by')
        if request.query_params.get('school'):
            qs = qs.filter(school_id=request.query_params['school'])
        if request.query_params.get('student'):
            qs = qs.filter(student_id=request.query_params['student'])
        if request.query_params.get('voided') != '1':
            qs = qs.filter(voided=False)
        rows = [{
            'id': p.id, 'receipt_number': p.receipt_number, 'student_id': p.student_id,
            'student_name': p.student.full_name, 'admission_number': p.student.admission_number,
            'school_name': p.school.name, 'amount': str(p.amount), 'method': p.method,
            'paid_on': str(p.paid_on), 'reference': p.reference, 'voided': p.voided,
            'received_by': (p.received_by.get_full_name() or p.received_by.username) if p.received_by else None
        } for p in qs[:200]]
        return Response({'results': rows})

    data = request.data
    student_id = data.get('student')
    student = Student.objects.filter(pk=student_id, school__in=schools_scope(user)).select_related('school').first()
    if not student:
        raise ValidationError({'student': 'Student not found in your authorised campus scope.'})

    amount = _money(data.get('amount'))
    method = data.get('method') or 'cash'
    paid_on = date.fromisoformat(data.get('paid_on') or date.today().isoformat())
    ref = (data.get('reference') or '').strip()[:100]

    with transaction.atomic():
        count = FeePayment.objects.filter(school=student.school).count() + 1
        code = student.school.code or f"SCH{student.school.id}"
        receipt_num = f"REC-{code}-{count:05d}"
        while FeePayment.objects.filter(receipt_number=receipt_num).exists():
            count += 1
            receipt_num = f"REC-{code}-{count:05d}"

        head_cat = None
        alloc_ids = data.get('allocation_ids') or []
        unpaid_fees = StudentFee.objects.filter(student=student, status__in=['unpaid', 'partial']).select_related('head__category')
        if alloc_ids:
            unpaid_fees = unpaid_fees.filter(id__in=alloc_ids)

        if unpaid_fees.exists() and unpaid_fees.first().head.category:
            head_cat = unpaid_fees.first().head.category
        if not head_cat:
            head_cat = FinanceCategory.objects.filter(school=student.school, kind='income', name__icontains='fee').first()
            if not head_cat:
                head_cat = FinanceCategory.objects.create(school=student.school, kind='income', name='Tuition fees')

        f_entry = FinanceEntry.objects.create(
            school=student.school, category=head_cat, amount=amount, date=paid_on,
            description=f"Fee payment #{receipt_num} - {student.full_name} ({student.admission_number})",
            created_by=user
        )

        payment = FeePayment.objects.create(
            student=student, school=student.school, receipt_number=receipt_num,
            amount=amount, method=method, paid_on=paid_on, reference=ref,
            received_by=user, finance_entry=f_entry
        )

        remaining = amount
        for fee in unpaid_fees:
            if remaining <= Decimal('0.00'):
                break
            line_due = fee.net_due
            already_alloc = fee.allocations.filter(payment__voided=False).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
            unpaid_balance = max(Decimal('0.00'), line_due - already_alloc)
            if unpaid_balance > Decimal('0.00'):
                alloc_amt = min(remaining, unpaid_balance)
                FeePaymentAllocation.objects.create(payment=payment, student_fee=fee, amount=alloc_amt)
                remaining -= alloc_amt
                if (already_alloc + alloc_amt) >= line_due:
                    fee.status = 'paid'
                else:
                    fee.status = 'partial'
                fee.save(update_fields=['status'])
        if remaining > Decimal('0.00'):
            head = FeeHead.objects.filter(school=student.school, active=True).first()
            if not head:
                cat = FinanceCategory.objects.filter(school=student.school, kind='income', name__icontains='fee').first()
                if not cat:
                    cat = FinanceCategory.objects.filter(school=student.school, kind='income').first()
                if not cat:
                    cat = FinanceCategory.objects.create(school=student.school, kind='income', name='Fee Collections')
                head = FeeHead.objects.create(school=student.school, name='Admission Fee', category=cat, active=True)
            cur_period = paid_on.strftime('%Y-%m')
            sf, _ = StudentFee.objects.get_or_create(
                student=student, head=head, period=cur_period,
                defaults={'amount_due': remaining, 'discount': Decimal('0.00'), 'status': 'paid', 'due_date': paid_on}
            )
            FeePaymentAllocation.objects.create(payment=payment, student_fee=sf, amount=remaining)
            sf.status = 'paid'
            sf.save(update_fields=['status'])

        record_event(actor=user, action='create', obj=payment)
        record_event(actor=user, action='create', obj=f_entry)

    return Response({
        'id': payment.id, 'receipt_number': payment.receipt_number,
        'student_id': payment.student_id, 'student_name': student.full_name,
        'amount': str(payment.amount), 'paid_on': str(payment.paid_on),
        'method': payment.method, 'reference': payment.reference
    }, status=201)


@api_view(['POST'])
def payment_void(request, pk):
    user = request.user
    _require_manager(user)
    payment = FeePayment.objects.filter(pk=pk, school__in=schools_scope(user)).select_related('finance_entry').first()
    if not payment:
        raise NotFound()
    if payment.voided:
        raise ValidationError({'detail': 'Payment is already voided.'})

    reason = (request.data.get('reason') or 'Cancelled receipt').strip()[:255]
    with transaction.atomic():
        payment.voided = True
        payment.void_reason = reason
        payment.save(update_fields=['voided', 'void_reason'])

        for alloc in payment.allocations.select_related('student_fee'):
            sf = alloc.student_fee
            active_allocs = sf.allocations.filter(payment__voided=False).exclude(id=alloc.id).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
            if active_allocs <= Decimal('0.00'):
                sf.status = 'unpaid'
            elif active_allocs < sf.net_due:
                sf.status = 'partial'
            else:
                sf.status = 'paid'
            sf.save(update_fields=['status'])

        if payment.finance_entry and not payment.finance_entry.voided:
            payment.finance_entry.voided = True
            payment.finance_entry.save(update_fields=['voided'])
            record_event(actor=user, action='void', obj=payment.finance_entry)

        record_event(actor=user, action='void', obj=payment)

    return Response({'id': payment.id, 'receipt_number': payment.receipt_number, 'voided': True, 'void_reason': reason})


# ------------------------------------------------------------------ Defaulters & Summary
@api_view(['GET'])
def defaulters(request):
    user = request.user
    _require_manager(user)
    today = date.today()
    qs = StudentFee.objects.filter(
        student__school__in=schools_scope(user),
        status__in=['unpaid', 'partial'],
        due_date__lt=today
    ).select_related('student', 'student__school', 'head')

    if request.query_params.get('school'):
        qs = qs.filter(student__school_id=request.query_params['school'])
    if request.query_params.get('class'):
        qs = qs.filter(student__enrollments__school_class_id=request.query_params['class'], student__enrollments__end_date__isnull=True)

    student_map = {}
    for fee in qs:
        sid = fee.student_id
        if sid not in student_map:
            en = fee.student.enrollments.filter(end_date__isnull=True).select_related('school_class').first()
            student_map[sid] = {
                'student_id': sid, 'student_name': fee.student.full_name,
                'admission_number': fee.student.admission_number, 'school_name': fee.student.school.name,
                'class_name': en.school_class.name if en else 'Unassigned',
                'overdue_count': 0, 'total_overdue': Decimal('0.00'), 'oldest_due_date': fee.due_date
            }
        already_paid = fee.allocations.filter(payment__voided=False).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')
        unpaid = max(Decimal('0.00'), fee.net_due - already_paid)
        student_map[sid]['overdue_count'] += 1
        student_map[sid]['total_overdue'] += unpaid
        if fee.due_date < student_map[sid]['oldest_due_date']:
            student_map[sid]['oldest_due_date'] = fee.due_date

    results = []
    for s in student_map.values():
        days = (today - s['oldest_due_date']).days
        results.append({
            **s, 'total_overdue': str(s['total_overdue']),
            'oldest_due_date': str(s['oldest_due_date']), 'days_overdue': days
        })
    results.sort(key=lambda x: -x['days_overdue'])
    return Response({'results': results, 'total_defaulters': len(results)})


@api_view(['GET'])
def fees_summary(request):
    user = request.user
    _require_manager(user)
    schools = schools_scope(user)
    if request.query_params.get('school'):
        schools = schools.filter(pk=request.query_params['school'])

    fees = StudentFee.objects.filter(student__school__in=schools).exclude(status='void')
    payments = FeePayment.objects.filter(school__in=schools, voided=False)

    expected = sum((f.net_due for f in fees), Decimal('0.00'))
    collected = sum((p.amount for p in payments), Decimal('0.00'))
    outstanding = max(Decimal('0.00'), expected - collected)
    collection_rate = round(float((collected / expected * Decimal('100.00')) if expected > Decimal('0.00') else Decimal('0.00')), 1)

    monthly = {}
    for p in payments:
        m = p.paid_on.strftime('%Y-%m')
        monthly[m] = monthly.get(m, Decimal('0.00')) + p.amount

    return Response({
        'expected': str(expected), 'collected': str(collected), 'outstanding': str(outstanding),
        'collection_rate': collection_rate,
        'monthly': [{'month': m, 'collected': float(a)} for m, a in sorted(monthly.items())]
    })
