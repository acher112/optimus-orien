"""Central campus resolution and isolation service.

Enforces strict multi-campus isolation and permissions across all APIs:
- Admin (organisation_admin / superuser): can view 'all' campuses (overall) or filter to any specific campus in their organisation scope.
- Single-campus roles (principal, school_admin, teacher, student, parent): can ONLY view their own campus. Requesting any other campus ID returns 404.
"""
from rest_framework.exceptions import NotFound, ValidationError, PermissionDenied
from rest_framework.filters import BaseFilterBackend
from core.services.access import schools_scope
from core.models import School

SINGLE_CAMPUS_ROLES = {'principal', 'school_admin', 'teacher', 'student', 'parent'}


def resolve_campus(request):
    """Resolve allowed school IDs from request.

    Returns a list of school integer IDs.
    Raises NotFound (HTTP 404) if an out-of-scope or invalid campus ID is requested.
    """
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')

    allowed_qs = schools_scope(user)
    allowed_ids = list(allowed_qs.values_list('id', flat=True))

    raw_val = None
    if hasattr(request, 'query_params'):
        raw_val = request.query_params.get('school') or request.query_params.get('campus')
    elif hasattr(request, 'GET'):
        raw_val = request.GET.get('school') or request.GET.get('campus')

    is_all_request = (
        raw_val is None or
        str(raw_val).strip() == '' or
        str(raw_val).strip().lower() in ('all', 'overall', 'consolidated', 'none')
    )

    is_admin = user.is_superuser or user.role == 'organisation_admin'

    if is_admin:
        if is_all_request:
            return allowed_ids
        try:
            target_id = int(str(raw_val).strip())
        except (ValueError, TypeError):
            raise NotFound('Invalid campus ID')
        if target_id not in allowed_ids:
            raise NotFound('Campus not found or outside authorized scope')
        return [target_id]

    # Single-campus role
    user_school_id = getattr(user, 'school_id', None)
    if not user_school_id and allowed_ids:
        user_school_id = allowed_ids[0]

    if not user_school_id:
        return []

    if not is_all_request:
        try:
            target_id = int(str(raw_val).strip())
        except (ValueError, TypeError):
            raise NotFound('Invalid campus ID')
        if target_id != user_school_id or target_id not in allowed_ids:
            raise NotFound('Campus not found or outside authorized scope')
    elif raw_val is not None and str(raw_val).strip().lower() in ('all', 'overall', 'consolidated'):
        # Single campus roles cannot request 'all' campuses
        raise NotFound('Campus not found or outside authorized scope')

    return [user_school_id]


def is_overall_mode(request):
    """Check if the current request is for 'All campuses (Overall)' by an admin."""
    user = getattr(request, 'user', None)
    if not user or not (user.is_superuser or user.role == 'organisation_admin'):
        return False
    raw_val = None
    if hasattr(request, 'query_params'):
        raw_val = request.query_params.get('school') or request.query_params.get('campus')
    elif hasattr(request, 'GET'):
        raw_val = request.GET.get('school') or request.GET.get('campus')
    return (
        raw_val is None or
        str(raw_val).strip() == '' or
        str(raw_val).strip().lower() in ('all', 'overall', 'consolidated', 'none')
    )


def get_selected_campus_id(request):
    """Return single selected campus ID, or None if in 'all campuses' mode for admin."""
    if is_overall_mode(request):
        return None
    ids = resolve_campus(request)
    return ids[0] if ids else None


def apply_campus(queryset, request, field='school'):
    """Filter queryset by resolved campus IDs for the current request.
    Raises NotFound (HTTP 404) if out-of-scope campus is requested.
    """
    school_ids = resolve_campus(request)
    if field in ('id', 'pk'):
        return queryset.filter(pk__in=school_ids)
    lookup = f"{field}__in"
    return queryset.filter(**{lookup: school_ids})


def get_campus_for_write(request, data=None):
    """Resolve and validate the campus for create/update operations.
    For admin: campus is required.
    For single-campus roles: campus is automatically forced to their assigned school.
    """
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')

    is_admin = user.is_superuser or user.role == 'organisation_admin'
    if not is_admin:
        if not user.school_id:
            raise ValidationError({'school': 'User does not have an assigned campus.'})
        return user.school

    payload = data if data is not None else getattr(request, 'data', {})
    school_id = payload.get('school') or (
        request.query_params.get('school') if hasattr(request, 'query_params') else None
    )
    if not school_id or str(school_id).lower() in ('all', 'overall', ''):
        raise ValidationError({'school': 'Campus is required for this operation.'})

    try:
        sid = int(str(school_id).strip())
    except (ValueError, TypeError):
        raise ValidationError({'school': 'Invalid campus ID.'})

    school = schools_scope(user).filter(pk=sid).first()
    if not school:
        raise NotFound('Campus not found or outside authorized scope.')
    return school


class CampusFilterBackend(BaseFilterBackend):
    def filter_queryset(self, request, queryset, view):
        model = getattr(queryset, 'model', None)
        if not model:
            return queryset
        if model is School:
            return apply_campus(queryset, request, field='pk')
        if hasattr(model, 'school'):
            return apply_campus(queryset, request, field='school')
        if hasattr(model, 'school_class'):
            return apply_campus(queryset, request, field='school_class__school')
        if hasattr(model, 'student'):
            return apply_campus(queryset, request, field='student__school')
        return queryset
