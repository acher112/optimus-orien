"""API endpoints for role-based permissions management."""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

from core.models import School
from core.services.access import schools_scope
from core.services.permissions import (
    ROLES_METADATA,
    PERMISSIONS_MODULES,
    ALL_PERMISSIONS_MAP,
    get_all_roles_matrix,
    get_effective_permissions,
    update_role_permissions,
    reset_role_permissions,
)

MANAGERS = ('organisation_admin', 'school_admin', 'principal')


def _require_admin(user):
    """Permissions management requires organisation_admin, school_admin, principal, or superuser."""
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active authenticated account required.')
    if not user.is_superuser and user.role not in MANAGERS:
        raise PermissionDenied('Permissions administration is restricted to system administrators.')


def _resolve_school(user, school_id=None):
    """Resolves target school within the authorized scope of the calling user."""
    if school_id:
        scoped = schools_scope(user)
        school = scoped.filter(pk=school_id).first()
        if not school and not user.is_superuser:
            raise ValidationError({'school': 'Campus not found within your authorized scope.'})
        if not school and user.is_superuser:
            school = School.objects.filter(pk=school_id).first()
        return school
    if user.is_superuser:
        return School.objects.first()
    if user.school_id:
        return user.school
    return schools_scope(user).first()


@api_view(['GET', 'POST'])
def permissions_list(request):
    """GET: Returns full permissions catalog, role list, effective permissions per role, and override stats.
    POST: Atomically saves customized permission overrides for a specific role.
    """
    user = request.user
    _require_admin(user)

    school_id = request.query_params.get('school') or request.data.get('school')
    school = _resolve_school(user, school_id)

    if request.method == 'GET':
        matrix = get_all_roles_matrix(school)
        return Response({
            'success': True,
            'school_id': school.id if school else None,
            'school_name': school.name if school else 'Global / Multi-Campus',
            **matrix,
        })

    # POST: Update permissions for a specific role
    data = request.data
    role = data.get('role')
    valid_roles = {r['key'] for r in ROLES_METADATA}
    if role not in valid_roles:
        raise ValidationError({'role': f"Invalid role. Expected one of: {', '.join(sorted(valid_roles))}"})
    if user.role == 'principal' and role in ('organisation_admin', 'school_admin', 'principal'):
        raise PermissionDenied('Principals can only manage permissions for subordinate campus staff roles.')

    permissions_map = data.get('permissions')
    if not isinstance(permissions_map, dict):
        raise ValidationError({'permissions': 'Dictionary of {permission_key: boolean} required.'})

    # Update database overrides
    overrides_saved = update_role_permissions(school, role, permissions_map, user)
    effective = get_effective_permissions(school, role)

    return Response({
        'success': True,
        'role': role,
        'school_id': school.id if school else None,
        'overrides_saved': overrides_saved,
        'effective_permissions': effective,
        'detail': f"Permissions successfully updated for role '{role}'.",
    })


@api_view(['POST'])
def permissions_reset(request):
    """POST: Resets custom permission overrides for a role (or all roles), reverting to system defaults."""
    user = request.user
    _require_admin(user)

    data = request.data
    school_id = data.get('school')
    school = _resolve_school(user, school_id)

    role = data.get('role')
    if role and role != 'all':
        valid_roles = {r['key'] for r in ROLES_METADATA}
        if role not in valid_roles:
            raise ValidationError({'role': f"Invalid role. Expected one of: {', '.join(sorted(valid_roles))} or 'all'"})

    if user.role == 'principal' and (not role or role == 'all' or role in ('organisation_admin', 'school_admin', 'principal')):
        raise PermissionDenied('Principals can only manage permissions for subordinate campus staff roles.')

    reset_count = reset_role_permissions(school, role if role != 'all' else None, user)

    # Return fresh state
    matrix = get_all_roles_matrix(school)
    return Response({
        'success': True,
        'role': role or 'all',
        'school_id': school.id if school else None,
        'overrides_cleared': reset_count,
        'detail': f"Permissions successfully reset to system defaults for {role or 'all roles'}.",
        **matrix,
    })
