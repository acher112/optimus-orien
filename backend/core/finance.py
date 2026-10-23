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

ROLES = ('organisation_admin', 'school_admin', 'principal')
DEFAULTS = {
    'income': ['Tuition fees', 'Admission fees', 'Annual fees', 'Other income'],
    'expense': ['Salaries', 'Utilities', 'Maintenance', 'Stationery', 'Other expenses'],
}


def _require(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if not user.is_superuser and user.role not in ROLES:
        raise PermissionDenied('Finance is available to administrators and principals')


def _school(user, value):
    """Campus to act on. Single-campus roles default to their own."""
    if not value and user.role != 'organisation_admin' and not user.is_superuser:
        value = user.school_id
    school = schools_scope(user).filter(pk=value or 0).first()
    if not school:
        raise ValidationError({'school': 'Choose a campus within your scope.'})
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


def _entries(user, params):
    qs = FinanceEntry.objects.filter(school__in=schools_scope(user)).select_related('school', 'category', 'created_by')
    if params.get('school'):
        qs = qs.filter(school_id=params['school'])
    if params.get('kind') in ('income', 'expense'):
        qs = qs.filter(category__kind=params['kind'])
    if params.get('category'):
        qs = qs.filter(category_id=params['category'])
    start, end = _date(params.get('from'), 'from'), _date(params.get('to'), 'to')
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
            if not request.query_params.get('school') or str(s.id) == request.query_params['school']:
                _ensure_defaults(s)
        qs = FinanceCategory.objects.filter(school__in=schools_scope(user))
        if request.query_params.get('school'):
            qs = qs.filter(school_id=request.query_params['school'])
        if request.query_params.get('kind') in ('income', 'expense'):
            qs = qs.filter(kind=request.query_params['kind'])
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


@api_view(['PATCH'])
def category_detail(request, pk):
    user = request.user
    _require(user)
    c = FinanceCategory.objects.filter(pk=pk, school__in=schools_scope(user)).first()
    if not c:
        raise NotFound()
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
        qs = _entries(user, request.query_params)
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
    """Totals plus chart-ready breakdowns: expense pie, income by category, monthly trend."""
    user = request.user
    _require(user)
    qs = _entries(user, request.query_params).filter(voided=False)
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
        rows = sorted(by_cat[kind].items(), key=lambda kv: -kv[1])
        return [{'name': n, 'amount': float(a), 'share': round(float(a / t * 100), 1) if t else 0} for n, a in rows if a > 0]

    campuses = []
    for s in schools_scope(user).order_by('name'):
        if request.query_params.get('school') and str(s.id) != request.query_params['school']:
            continue
        inc = sum((e.amount for e in qs if e.school_id == s.id and e.category.kind == 'income'), Decimal('0'))
        exp = sum((e.amount for e in qs if e.school_id == s.id and e.category.kind == 'expense'), Decimal('0'))
        campuses.append({'id': s.id, 'name': s.name, 'income': float(inc), 'expense': float(exp), 'net': float(inc - exp)})
    return Response({
        'total_income': float(total['income']), 'total_expense': float(total['expense']),
        'net': float(total['income'] - total['expense']), 'entries': qs.count(),
        'expense_by_category': pie('expense'), 'income_by_category': pie('income'),
        'monthly': [{'month': m, 'income': float(v['income']), 'expense': float(v['expense'])} for m, v in sorted(monthly.items())],
        'campuses': campuses,
        'note': 'Simple income and expense ledger. Voided entries are excluded. This is not full accounting or payroll.'})
