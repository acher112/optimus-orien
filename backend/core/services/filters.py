"""Universal Query Filter Service for OPTIMUS ORIEN.

Provides safe, permission-scoped filtering, partial-word search,
strict parameter validation, and ordering across models.
"""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from django.db.models import Q
from rest_framework.exceptions import ValidationError

STANDARD_PARAMS = {
    'q', 'ordering', 'sort_by', 'order', 'page', 'page_size',
    'format', 'export', 'school', 'campus', 'month', 'period',
    'csrfToken', 'v'
}


def apply_query_filters(
    request,
    queryset,
    search_fields=None,
    filter_map=None,
    allowed_orderings=None,
    default_ordering=None,
    extra_allowed_params=None
):
    """
    Applies search, field filters, and ordering to a scoped queryset.
    
    :param request: DRF Request
    :param queryset: Django QuerySet (already permission-scoped)
    :param search_fields: list of field lookups for text search 'q'
    :param filter_map: dict of param_name -> field lookup or callable(qs, value)
    :param allowed_orderings: list/set of allowed ordering strings
    :param default_ordering: default ordering list or string
    :param extra_allowed_params: optional set of additional allowed query params
    :return: (filtered_queryset, meta_dict)
    """
    search_fields = search_fields or []
    filter_map = filter_map or {}
    allowed_orderings = set(allowed_orderings or [])
    extra_allowed = set(extra_allowed_params or [])
    allowed_params = STANDARD_PARAMS | set(filter_map.keys()) | extra_allowed

    # 1. Reject unknown filter parameters
    for param in request.query_params.keys():
        if param not in allowed_params:
            valid_list = sorted([k for k in filter_map.keys() if k not in STANDARD_PARAMS])
            raise ValidationError({
                'detail': f"Unknown filter parameter '{param}'. Allowed filters: {', '.join(valid_list) if valid_list else 'None'}"
            })

    filters_applied = {}

    # 2. Apply Text Search (q)
    raw_q = (request.query_params.get('q') or '').strip()
    if raw_q:
        q = raw_q[:100]  # Cap length at 100 characters
        filters_applied['q'] = q
        words = q.split()
        if words and search_fields:
            # Match each word across any of the search fields
            search_clause = Q()
            for w in words:
                word_clause = Q()
                for f in search_fields:
                    word_clause |= Q(**{f"{f}__icontains": w})
                search_clause &= word_clause
            queryset = queryset.filter(search_clause)

    # 3. Apply Field Filters
    for param, lookup in filter_map.items():
        if param not in request.query_params:
            continue

        raw_values = request.query_params.getlist(param)
        # Support comma-separated values in single query param: ?class=1,2
        values = []
        for rv in raw_values:
            if isinstance(rv, str):
                parts = [p.strip() for p in rv.split(',') if p.strip()]
                values.extend(parts)
            elif rv is not None:
                values.append(rv)

        if not values:
            continue

        filters_applied[param] = values if len(values) > 1 else values[0]

        # Callable custom filter handler
        if callable(lookup):
            queryset = lookup(queryset, values if len(values) > 1 else values[0])
            continue

        # Boolean conversion for status/active flags
        if lookup.endswith('active') or lookup.endswith('published') or lookup.endswith('voided'):
            first_val = str(values[0]).lower()
            if first_val in ('active', 'true', '1', 'yes', 'published'):
                bool_val = True
            elif first_val in ('inactive', 'false', '0', 'no', 'unpublished', 'void'):
                bool_val = False
            else:
                bool_val = None
            if bool_val is not None:
                queryset = queryset.filter(**{lookup: bool_val})
            continue

        # Multi-value OR filter (__in)
        if len(values) > 1:
            queryset = queryset.filter(**{f"{lookup}__in": values})
        else:
            queryset = queryset.filter(**{lookup: values[0]})

    # 4. Apply Ordering
    ordering_param = (request.query_params.get('ordering') or '').strip()
    applied_ordering = None

    if ordering_param:
        fields = [f.strip() for f in ordering_param.split(',') if f.strip()]
        valid_fields = []
        for f in fields:
            raw_field = f.lstrip('-')
            if f in allowed_orderings or raw_field in allowed_orderings:
                valid_fields.append(f)
        if valid_fields:
            applied_ordering = valid_fields
            queryset = queryset.order_by(*valid_fields)

    if not applied_ordering and default_ordering:
        if isinstance(default_ordering, (list, tuple)):
            queryset = queryset.order_by(*default_ordering)
        else:
            queryset = queryset.order_by(default_ordering)

    # Distinct if joins may cause duplicate rows (e.g. searching across many-to-many or reverse relations)
    if any('__' in f for f in search_fields) or any('__' in str(l) for l in filter_map.values() if isinstance(l, str)):
        queryset = queryset.distinct()

    return queryset, {
        'total': queryset.count(),
        'filters_applied': filters_applied
    }


def sort_comparison_rows(rows, metric_key, name_key='name', reverse=True):
    """
    Sorts a list of dictionaries by numeric metric value with strict numeric comparison.
    - Ties broken by name_key in alphabetical order (A->Z).
    - Missing/None/empty values placed at the bottom.
    - Default reverse=True (descending: highest on top).
    """
    def key_fn(item):
        val = item.get(metric_key)
        name = str(item.get(name_key) or '').strip().lower()
        if val is None or val == '' or val == 'N/A' or val == 'No data':
            return (1, 0, name)
        try:
            num = Decimal(str(val))
        except (InvalidOperation, TypeError, ValueError):
            return (1, 0, name)

        if reverse:
            return (0, -num, name)
        else:
            return (0, num, name)

    return sorted(rows, key=key_fn)
