"""Central authorization and scoping service for Record and Teacher Performance modules.

Enforces:
1. Strict server-side campus isolation (Principals cannot tamper with other campus IDs).
2. Granular capability keys validated against OrganisationRolePolicy.
3. Salary line masking (totals vs individual lines).
4. Restricted termination notes privacy (Owner/Org Admin only).
5. Teacher self-view isolation (can only see self, never peers).
"""
from rest_framework.exceptions import PermissionDenied, NotFound
from core.models import School, OrganisationRolePolicy
from core.services.access import schools_scope


RECORD_CAPABILITIES = {
    'records.view_staff',
    'records.view_students',
    'records.view_fees',
    'records.view_finance',
    'records.view_salaries',
    'records.view_salary_lines',
    'records.view_terminated_notes',
    'records.manage',
    'records.export',
    'teacher_performance.view_summary',
    'teacher_performance.view_detail',
    'teacher_performance.manage_criteria',
    'teacher_performance.manage_alerts',
    'teacher_performance.export',
    'teacher_performance.view_own',
    'teacher_performance.private_notes',
}


def resolve_record_schools(user, requested_school_id=None):
    """Resolves the campus scope for Record and Teacher Performance queries.

    Returns:
        (is_all_campuses: bool, primary_school: School, schools_qs: QuerySet[School])

    - Principals: strictly restricted to their single assigned campus. Any attempt to pass 'all' or a foreign campus ID raises PermissionDenied.
    - Organisation Admins / Owners / Platform Admins: can pass 'all' or 'all_campuses' to query across all campuses in their organization.
    """
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active authenticated account required.')

    # Platform admin / Superuser
    if user.is_superuser or user.role == 'platform_admin':
        if requested_school_id and str(requested_school_id).lower() in ('all', 'all_campuses', '0'):
            all_s = School.objects.all()
            first_s = all_s.first()
            if not first_s:
                raise NotFound('No campus available.')
            return True, first_s, all_s
        if requested_school_id:
            try:
                school = School.objects.get(pk=int(requested_school_id))
                return False, school, School.objects.filter(pk=school.pk)
            except (ValueError, School.DoesNotExist):
                raise NotFound('Campus not found.')
        school = School.objects.first()
        if not school:
            raise NotFound('No campus available.')
        return False, school, School.objects.filter(pk=school.pk)

    # Principal / School Admin: RIGID campus binding
    if user.role in ('principal', 'school_admin'):
        if not user.school_id:
            raise PermissionDenied('No campus assigned to this administrator.')
        if requested_school_id:
            if str(requested_school_id).lower() in ('all', 'all_campuses', '0'):
                raise PermissionDenied('Principals may only access their own assigned campus.')
            req_str = str(requested_school_id).strip()
            is_match = False
            if req_str.isdigit() and int(req_str) == user.school_id:
                is_match = True
            elif user.school and user.school.code.lower() == req_str.lower():
                is_match = True
            if not is_match:
                # Anti-tampering check
                raise PermissionDenied('Principals may only access their own assigned campus.')
        return False, user.school, School.objects.filter(pk=user.school_id)

    # Organisation Admin / Owner
    if user.role == 'organisation_admin':
        if not user.organisation_id:
            raise PermissionDenied('No organisation associated with account.')
        org_schools = schools_scope(user)
        if not org_schools.exists():
            raise NotFound('No accessible campus found for this organisation.')

        if requested_school_id and str(requested_school_id).lower() in ('all', 'all_campuses', '0'):
            return True, org_schools.first(), org_schools

        if requested_school_id:
            req_str = str(requested_school_id).strip()
            school = None
            if req_str.isdigit():
                school = org_schools.filter(pk=int(req_str)).first()
            if not school:
                school = org_schools.filter(code__iexact=req_str).first()
            if not school:
                raise PermissionDenied('Campus outside authorised organisation.')
            return False, school, org_schools.filter(pk=school.pk)

        school = org_schools.first()
        return False, school, org_schools.filter(pk=school.pk)

    # Teacher
    if user.role == 'teacher':
        if requested_school_id and str(requested_school_id).lower() in ('all', 'all_campuses'):
            raise PermissionDenied('Teachers may only access their assigned campus.')
        if user.school:
            return False, user.school, School.objects.filter(pk=user.school_id)
        raise PermissionDenied('No campus assigned to this teacher.')

    # Accountant (Custom staff role)
    if getattr(user, 'position', '').lower() == 'accountant' or user.role == 'staff':
        if requested_school_id and str(requested_school_id).lower() in ('all', 'all_campuses'):
            raise PermissionDenied('Accountants may only access their assigned campus.')
        if requested_school_id and user.school_id and int(requested_school_id) != user.school_id:
            raise PermissionDenied('Accountants may only access their assigned campus.')
        if user.school:
            return False, user.school, School.objects.filter(pk=user.school_id)

    raise PermissionDenied('Access to Record module is restricted to school leadership.')


def resolve_record_school(user, requested_school_id=None):
    """Resolves and validates single target campus for Record / Teacher Performance actions."""
    is_all, primary_school, schools_qs = resolve_record_schools(user, requested_school_id)
    return primary_school


def check_record_capability(user, school, capability_key):
    """Validates whether a user has a specific record capability key."""
    if not user.is_authenticated or not user.is_active:
        return False

    if user.is_superuser or user.role == 'platform_admin':
        return True

    # Owner / Org admin
    if user.role == 'organisation_admin':
        if school and school.organisation_id != user.organisation_id:
            return False
        return True

    # Principal
    if user.role in ('principal', 'school_admin'):
        if school and user.school_id != school.pk:
            return False
        if capability_key == 'records.view_terminated_notes':
            # Termination notes are strictly restricted to Owner / Org Admin
            return False
        policy = OrganisationRolePolicy.get_effective_policy(user.organisation_id, 'principal')
        return policy.get(capability_key, False)

    # Teacher
    if user.role == 'teacher':
        if capability_key == 'teacher_performance.view_own':
            return getattr(school, 'teachers_can_view_own_performance', True)
        return False

    # Accountant (Only fees and finance)
    if getattr(user, 'position', '').lower() == 'accountant':
        if capability_key in ('records.view_fees', 'records.view_finance', 'records.export'):
            return True
        return False

    return False


def can_view_salary_lines(user, school):
    """Determines whether individual salary line details (gross, deductions, net) are exposed.

    Owners and Org Admins always see lines.
    Principals see lines ONLY if the Owner has explicitly toggled 'records.view_salary_lines'.
    Otherwise, Principals see only campus salary totals.
    """
    if user.is_superuser or user.role == 'platform_admin' or user.role == 'organisation_admin':
        return True
    if user.role in ('principal', 'school_admin'):
        policy = OrganisationRolePolicy.get_effective_policy(user.organisation_id, 'principal')
        return policy.get('records.view_salary_lines', False)
    return False


def can_view_terminated_notes(user):
    """Termination notes are confidential and restricted strictly to Owner and Org Admin."""
    if user.is_superuser or user.role == 'platform_admin' or user.role == 'organisation_admin':
        return True
    return False
