"""Finance: a simple income / expense ledger with categories and chart-ready totals.

Not accounting or payroll (the spec defers those). Admins, school admins and principals
manage categories and entries inside their campus scope. Entries are never deleted, only
voided, and voided entries are excluded from every total.
"""
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from core.models import FinanceCategory, FinanceEntry
from core.services.access import schools_scope
from core.services.audit import record_event
from core.services.filters import apply_query_filters, sort_comparison_rows

ROLES = ('organisation_admin', 'school_admin', 'principal')
DEFAULTS = {
    'income': ['Tuition fees', 'Admission fees', 'Annual fees', 'Other income'],
    'expense': ['Salaries', 'Utilities', 'Maintenance', 'Stationery', 'Other expenses'],
}


def _require(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if user.is_superuser:
        return
    if user.role == 'principal':
        from core.models import OrganisationRolePolicy
        policy = OrganisationRolePolicy.get_effective_policy(user.organisation_id, 'principal')
        if not policy.get('finance.view_campus', False):
            raise PermissionDenied('Finance is not accessible to principals.')
        return
    if user.role not in ('organisation_admin', 'school_admin'):
        raise PermissionDenied('Finance is available to administrators')


def _school(user, value):
    """Campus to act on. Single-campus roles default to their own."""
    if not value and user.role != 'organisation_admin' and not user.is_superuser:
        value = user.school_id
    school = schools_scope(user).filter(pk=value or 0).first()
    if not school:
        raise NotFound('Campus not found.')
    return school


def _ensure_defaults(school):
    if not FinanceCategory.objects.filter(school=school).exists():
        FinanceCategory.objects.bulk_create(
            [FinanceCategory(school=school, kind=k, name=n) for k, names in DEFAULTS.items() for n in names])


def _money(value):
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        raise ValidationError({'amount': 'Enter a valid amount.'})
    if d <= 0 or d >= Decimal('10000000000'):
        raise ValidationError({'amount': 'Amount must be greater than zero.'})
    return d


def _date(value, field='date'):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({field: 'Use YYYY-MM-DD.'})


def _cat_row(c):
    return {'id': c.id, 'school': c.school_id, 'kind': c.kind, 'name': c.name, 'active': c.active}


def _entry_row(e):
    return {'id': e.id, 'school': e.school_id, 'school_name': e.school.name, 'category': e.category_id,
            'category_name': e.category.name, 'kind': e.category.kind, 'amount': str(e.amount),
            'date': e.date, 'description': e.description, 'voided': e.voided,
            'created_by': (e.created_by.get_full_name() or e.created_by.username) if e.created_by_id else None}


def _entries(user, params, request=None, target_schools=None):
    base_schools = target_schools if target_schools is not None else schools_scope(user)
    qs = FinanceEntry.objects.filter(school__in=base_schools).select_related('school', 'category', 'created_by')

    # Handle preset period if from / to not supplied
    period = params.get('period')
    start = _date(params.get('from') or params.get('date_from'), 'from')
    end = _date(params.get('to') or params.get('date_to'), 'to')
    if not start and not end and period:
        today = date.today()
        if period == 'this_month':
            start = today.replace(day=1)
            end = today
        elif period == 'last_3_months':
            from datetime import timedelta
            start = today - timedelta(days=90)
            end = today
        elif period == 'this_year':
            start = today.replace(month=1, day=1)
            end = today
        elif period == 'academic_year':
            if today.month >= 7:
                start = today.replace(month=7, day=1)
            else:
                start = today.replace(year=today.year - 1, month=7, day=1)
            end = today

    if request:
        qs, _ = apply_query_filters(
            request,
            qs,
            search_fields=['description', 'category__name', 'school__name'],
            filter_map={
                'school': 'school_id',
                'campus': 'school_id',
                'kind': 'category__kind',
                'category': 'category_id',
                'date_from': 'date__gte',
                'date_to': 'date__lte',
                'from': 'date__gte',
                'to': 'date__lte',
                'amount_min': 'amount__gte',
                'amount_max': 'amount__lte',
                'voided': 'voided',
            },
            allowed_orderings=['date', 'amount', 'created_at', 'school__name'],
            default_ordering=['-date', '-id'],
            extra_allowed_params={'include_voided', 'sort_by', 'order', 'currency', 'period'}
        )
        if start and not params.get('from') and not params.get('date_from'):
            qs = qs.filter(date__gte=start)
        if end and not params.get('to') and not params.get('date_to'):
            qs = qs.filter(date__lte=end)
        return qs

    if params.get('school') and str(params['school']).lower() not in ('all', '', 'overall', 'none'):
        qs = qs.filter(school_id=params['school'])
    if params.get('kind') in ('income', 'expense'):
        qs = qs.filter(category__kind=params['kind'])
    if params.get('category'):
        qs = qs.filter(category_id=params['category'])
    if params.get('q'):
        raw_q = str(params['q']).strip()[:100]
        qs = qs.filter(Q(description__icontains=raw_q) | Q(category__name__icontains=raw_q) | Q(school__name__icontains=raw_q))
    if start:
        qs = qs.filter(date__gte=start)
    if end:
        qs = qs.filter(date__lte=end)
    return qs


@api_view(['GET', 'POST'])
def categories(request):
    user = request.user
    _require(user)
    if request.method == 'GET':
        for s in schools_scope(user):
            if not request.query_params.get('school') or str(request.query_params.get('school')).lower() in ('all', '', 'overall', 'none') or str(s.id) == request.query_params['school']:
                _ensure_defaults(s)
        qs = FinanceCategory.objects.filter(school__in=schools_scope(user))
        if request.query_params.get('school') and str(request.query_params['school']).lower() not in ('all', '', 'overall', 'none'):
            qs = qs.filter(school_id=request.query_params['school'])
        if request.query_params.get('kind') in ('income', 'expense'):
            qs = qs.filter(kind=request.query_params['kind'])
        if request.query_params.get('q'):
            qs = qs.filter(name__icontains=request.query_params['q'].strip()[:100])
        if request.query_params.get('active'):
            act_str = str(request.query_params['active']).lower()
            if act_str in ('true', '1', 'active'):
                qs = qs.filter(active=True)
            elif act_str in ('false', '0', 'inactive'):
                qs = qs.filter(active=False)
        return Response({'results': [_cat_row(c) for c in qs]})
    school = _school(user, request.data.get('school'))
    kind = request.data.get('kind')
    name = (request.data.get('name') or '').strip()[:80]
    if kind not in ('income', 'expense'):
        raise ValidationError({'kind': 'Kind must be income or expense.'})
    if not name:
        raise ValidationError({'name': 'Give the category a name.'})
    if FinanceCategory.objects.filter(school=school, kind=kind, name__iexact=name).exists():
        raise ValidationError({'name': 'That category already exists.'})
    c = FinanceCategory.objects.create(school=school, kind=kind, name=name)
    record_event(actor=user, action='create', obj=c)
    return Response(_cat_row(c), status=201)


@api_view(['PATCH', 'DELETE'])
def category_detail(request, pk):
    user = request.user
    _require(user)
    c = FinanceCategory.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not c:
        raise NotFound()
    if request.method == 'DELETE':
        with transaction.atomic():
            c.entries.all().delete()
            record_event(actor=user, action='delete', obj=c)
            c.delete()
        return Response({'success': True, 'detail': 'Category deleted'})
    if 'name' in request.data:
        name = (request.data['name'] or '').strip()[:80]
        if not name:
            raise ValidationError({'name': 'Give the category a name.'})
        if FinanceCategory.objects.filter(school=c.school, kind=c.kind, name__iexact=name).exclude(pk=c.pk).exists():
            raise ValidationError({'name': 'That category already exists.'})
        c.name = name
    if 'active' in request.data:
        c.active = bool(request.data['active'])      # categories with history are hidden, not deleted
    c.save()
    record_event(actor=user, action='update', obj=c, changed_fields=['active'], after={'active': c.active})
    return Response(_cat_row(c))


@api_view(['GET', 'POST'])
def entries(request):
    user = request.user
    _require(user)
    if request.method == 'GET':
        qs = _entries(user, request.query_params, request=request)
        include_void = request.query_params.get('include_voided') == '1'
        if not include_void:
            qs = qs.filter(voided=False)
        return Response({'results': [_entry_row(e) for e in qs[:500]]})
    school = _school(user, request.data.get('school'))
    cat = FinanceCategory.objects.filter(pk=request.data.get('category'), school=school, active=True).first()
    if not cat:
        raise ValidationError({'category': 'Choose an active category from this campus.'})
    when = _date(request.data.get('date')) or date.today()
    with transaction.atomic():
        e = FinanceEntry.objects.create(school=school, category=cat, amount=_money(request.data.get('amount')), date=when,
                                        description=(request.data.get('description') or '').strip()[:255], created_by=user)
        record_event(actor=user, action='create', obj=e)
    return Response(_entry_row(e), status=201)


@api_view(['GET', 'DELETE'])
def entry_detail(request, pk):
    user = request.user
    _require(user)
    e = FinanceEntry.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not e:
        raise NotFound()
    if request.method == 'DELETE':
        record_event(actor=user, action='delete', obj=e)
        e.delete()
        return Response({'success': True, 'detail': 'Entry deleted'})
    return Response(_entry_row(e))


@api_view(['POST'])
def entry_void(request, pk):
    user = request.user
    _require(user)
    e = FinanceEntry.objects.filter(pk=pk, school__in=schools_scope(user)).select_related('school', 'category', 'created_by').first()
    if not e:
        raise NotFound()
    if e.voided:
        raise ValidationError({'detail': 'Already voided.'})
    e.voided = True
    e.save(update_fields=['voided'])
    record_event(actor=user, action='void', obj=e)
    return Response(_entry_row(e))


@api_view(['GET'])
def summary(request):
    """Totals plus chart-ready breakdowns: expense pie, income by category, monthly trend, multi-currency isolation."""
    user = request.user
    _require(user)

    schools_in_scope = schools_scope(user)
    selected_school = request.query_params.get('school')
    is_multi_campus = not selected_school or str(selected_school).lower() in ('all', '', 'overall', 'none')

    if not is_multi_campus:
        target_schools = schools_in_scope.filter(pk=selected_school)
    else:
        target_schools = schools_in_scope

    currencies_present = sorted(list(set(s.currency for s in target_schools if s.currency)))
    requested_currency = request.query_params.get('currency')

    currency_mismatch = False
    active_currency = 'PKR'
    if len(currencies_present) > 1:
        if requested_currency and requested_currency in currencies_present:
            active_currency = requested_currency
            target_schools = target_schools.filter(currency=active_currency)
        else:
            currency_mismatch = True
            active_currency = requested_currency if requested_currency in currencies_present else currencies_present[0]
            target_schools = target_schools.filter(currency=active_currency)
    elif currencies_present:
        active_currency = currencies_present[0]

    qs = _entries(user, request.query_params, request=request, target_schools=target_schools).filter(voided=False)
    total = {'income': Decimal('0'), 'expense': Decimal('0')}
    by_cat = {'income': defaultdict(Decimal), 'expense': defaultdict(Decimal)}
    monthly = defaultdict(lambda: {'income': Decimal('0'), 'expense': Decimal('0')})
    for e in qs:
        k = e.category.kind
        total[k] += e.amount
        by_cat[k][e.category.name] += e.amount
        monthly[e.date.strftime('%Y-%m')][k] += e.amount

    def pie(kind):
        t = total[kind]
        rows = [{'name': n, 'amount': float(a), 'share': round(float(a / t * 100), 1) if t else 0} for n, a in by_cat[kind].items() if a > 0]
        return sort_comparison_rows(rows, metric_key='amount', name_key='name', reverse=True)

    campuses = []
    for s in target_schools.order_by('name'):
        inc = sum((e.amount for e in qs if e.school_id == s.id and e.category.kind == 'income'), Decimal('0'))
        exp = sum((e.amount for e in qs if e.school_id == s.id and e.category.kind == 'expense'), Decimal('0'))
        campuses.append({'id': s.id, 'name': s.name, 'campus_name': s.name, 'currency': s.currency, 'income': float(inc), 'expense': float(exp), 'net': float(inc - exp)})

    sort_metric = request.query_params.get('sort_by') or 'income'
    order_dir = request.query_params.get('order') or 'desc'
    campuses_sorted = sort_comparison_rows(campuses, metric_key=sort_metric, name_key='name', reverse=(order_dir != 'asc'))
    income_by_campus = sort_comparison_rows(campuses, metric_key='income', name_key='name', reverse=True)
    expense_by_campus = sort_comparison_rows(campuses, metric_key='expense', name_key='name', reverse=True)

    # Calculate student fee revenue projection within scope
    from core.models import Student, StudentFee, FeePayment
    active_students = Student.objects.filter(school__in=target_schools, active=True)
    st_count = active_students.count()
    st_fees = StudentFee.objects.filter(student__school__in=target_schools).exclude(status='void')
    st_expected = sum((f.net_due for f in st_fees), Decimal('0.00'))
    st_collected = sum((p.amount for p in FeePayment.objects.filter(school__in=target_schools, voided=False, status='approved')), Decimal('0.00'))
    st_pending = sum((p.amount for p in FeePayment.objects.filter(school__in=target_schools, voided=False, status='pending')), Decimal('0.00'))
    st_remaining = max(Decimal('0.00'), st_expected - st_collected)
    st_avg = round(float(st_expected / Decimal(str(st_count))), 2) if st_count > 0 else 0.0

    monthly_rows = [{'month': m, 'income': float(v['income']), 'expense': float(v['expense']), 'net': float(v['income'] - v['expense'])} for m, v in sorted(monthly.items())]

    # Handle export if requested
    from core.services.exports import handle_export
    if request.query_params.get('export') in ('csv', 'xlsx', 'pdf') or request.query_params.get('format') in ('csv', 'xlsx', 'pdf'):
        export_rows = [
            {
                'month': r['month'],
                'currency': active_currency,
                'income': r['income'],
                'expense': r['expense'],
                'net': r['net']
            } for r in monthly_rows
        ]
        export_res = handle_export(
            request, export_rows, filename='dashboard-income-vs-expense',
            title=f'Income vs Expense Report ({active_currency})',
            columns=[
                {'key': 'month', 'label': 'Month'},
                {'key': 'currency', 'label': 'Currency'},
                {'key': 'income', 'label': 'Income'},
                {'key': 'expense', 'label': 'Expense'},
                {'key': 'net', 'label': 'Net Profit/Loss'}
            ]
        )
        if export_res:
            return export_res

    return Response({
        'total_income': float(total['income']), 'total_expense': float(total['expense']),
        'net': float(total['income'] - total['expense']), 'entries': qs.count(),
        'currency': active_currency,
        'active_currency': active_currency,
        'currencies_present': currencies_present,
        'currency_mismatch': currency_mismatch,
        'multi_currency': len(currencies_present) > 1,
        'expense_by_category': pie('expense'), 'income_by_category': pie('income'),
        'monthly': monthly_rows,
        'campuses': campuses_sorted,
        'income_by_campus': income_by_campus,
        'expense_by_campus': expense_by_campus,
        'student_projection': {
            'total_students': st_count,
            'expected': float(st_expected),
            'collected': float(st_collected),
            'remaining': float(st_remaining),
            'pending_approval': float(st_pending),
            'avg_per_student': st_avg
        },
        'note': 'Simple income and expense ledger. Voided entries are excluded. This is not full accounting or payroll.'})
