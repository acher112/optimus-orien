"""
Single Source of Truth: Central Feature Map and Plan Hierarchy.

Maps each feature key to the minimum subscription plan required:
- free: overview, campuses (limit 1), campus_setup, academic_years, classes,
        subjects, students (limit 30), attendance_basic, academics_basic,
        announcements, staff_basic, reports_basic, notifications, settings,
        plan_billing
- standard adds: homework, examinations, study_materials, timetable, student_fees,
                 data_import, communication_limited, permissions_basic,
                 reports_standard, finance (income/expense entry, categories, totals),
                 staff_salaries
- premium adds: finance_dashboard (charts, income vs expense analytics, exports),
                salary_exports, academic_quality_index, psychological_evaluation,
                students_at_risk, interventions, communication_full, audit_log,
                permissions_custom_roles, reports_drilldown_exports
- custom: everything in premium plus per-organisation overrides
          (limits and feature flags editable by superadmin)

Helper functions:
- get_org_plan(org): returns normalized plan string ('free', 'standard', 'premium', 'custom')
- has_feature(org, feature_key): returns bool whether org has feature access
- plan_rank(plan): returns integer comparison rank
- get_plan_limits(plan=None, org=None): returns dict with usage limits (max_campuses, max_students)
- check_plan_limit(org, limit_name, count): validates usage against plan limits
"""
from typing import Any, Dict, Optional, Set, Tuple
from django.utils import timezone


# -----------------------------------------------------------------------------
# Plan Constants and Ranks
# -----------------------------------------------------------------------------

PLAN_FREE = 'free'
PLAN_STANDARD = 'standard'
PLAN_PREMIUM = 'premium'
PLAN_CUSTOM = 'custom'

PLAN_RANKS: Dict[str, int] = {
    PLAN_FREE: 0,
    PLAN_STANDARD: 1,
    PLAN_PREMIUM: 2,
    PLAN_CUSTOM: 3,
}

# -----------------------------------------------------------------------------
# Plan Usage Limits
# -----------------------------------------------------------------------------

PLAN_LIMITS: Dict[str, Dict[str, Optional[int]]] = {
    PLAN_FREE: {
        'max_campuses': 1,
        'max_students': 30,
    },
    PLAN_STANDARD: {
        'max_campuses': None,  # Unlimited / governed by subscription seats
        'max_students': None,
    },
    PLAN_PREMIUM: {
        'max_campuses': None,
        'max_students': None,
    },
    PLAN_CUSTOM: {
        'max_campuses': None,  # Editable per-organisation override
        'max_students': None,
    },
}

# -----------------------------------------------------------------------------
# Central Feature Map: Feature Key -> Minimum Plan Tier
# -----------------------------------------------------------------------------

FEATURE_MAP: Dict[str, str] = {
    # Free tier features
    'overview': PLAN_FREE,
    'campuses': PLAN_FREE,
    'campus_setup': PLAN_FREE,
    'academic_years': PLAN_FREE,
    'classes': PLAN_FREE,
    'subjects': PLAN_FREE,
    'students': PLAN_FREE,
    'attendance_basic': PLAN_FREE,
    'academics_basic': PLAN_FREE,
    'announcements': PLAN_FREE,
    'staff_basic': PLAN_FREE,
    'reports_basic': PLAN_FREE,
    'notifications': PLAN_FREE,
    'settings': PLAN_FREE,
    'plan_billing': PLAN_FREE,

    # Standard tier additions
    'homework': PLAN_STANDARD,
    'examinations': PLAN_STANDARD,
    'study_materials': PLAN_STANDARD,
    'timetable': PLAN_STANDARD,
    'student_fees': PLAN_STANDARD,
    'data_import': PLAN_STANDARD,
    'communication_limited': PLAN_STANDARD,
    'permissions_basic': PLAN_STANDARD,
    'reports_standard': PLAN_STANDARD,
    'finance': PLAN_STANDARD,             # income/expense entry, categories, totals
    'staff_salaries': PLAN_STANDARD,

    # Premium tier additions
    'finance_dashboard': PLAN_PREMIUM,    # charts, income vs expense analytics, exports
    'salary_exports': PLAN_PREMIUM,
    'academic_quality_index': PLAN_PREMIUM,
    'psychological_evaluation': PLAN_PREMIUM,
    'students_at_risk': PLAN_PREMIUM,
    'interventions': PLAN_PREMIUM,
    'communication_full': PLAN_PREMIUM,
    'audit_log': PLAN_PREMIUM,
    'permissions_custom_roles': PLAN_PREMIUM,
    'reports_drilldown_exports': PLAN_PREMIUM,
}

# Compatibility aliases mapping legacy or alternative feature keys to canonical keys
FEATURE_ALIASES: Dict[str, str] = {
    # Free aliases
    'school_setup': 'campus_setup',
    'single_campus': 'campuses',
    'people_accounts': 'staff_basic',
    'attendance_daily': 'attendance_basic',
    'notices': 'announcements',
    'result_cards': 'academics_basic',
    'basic_reports_csv': 'reports_basic',
    'portals_basic': 'overview',
    'subscription_management': 'plan_billing',
    'order_submission': 'plan_billing',

    # Standard aliases
    'tasks_homework': 'homework',
    'exams_datesheets': 'examinations',
    'marks_grading': 'examinations',
    'fees_offline': 'student_fees',
    'csv_import': 'data_import',
    'roles_permissions': 'permissions_basic',
    'class_subject_performance': 'reports_standard',
    'trends_basic': 'reports_standard',
    'participation_skills_entry': 'homework',
    'hr_payroll': 'staff_salaries',
    'salaries': 'staff_salaries',
    'accounts_ledger': 'finance',

    # Premium aliases
    'aqi': 'academic_quality_index',
    'aqi_history': 'academic_quality_index',
    'psych_eval': 'psychological_evaluation',
    'early_intervention': 'interventions',
    'attention_indicators': 'students_at_risk',
    'audit_log_viewer': 'audit_log',
    'advanced_reports_export': 'reports_drilldown_exports',
    'campus_comparison': 'reports_drilldown_exports',
    'advanced_class_intelligence': 'reports_drilldown_exports',
    'teacher_insights': 'reports_drilldown_exports',
    'skills_analytics': 'reports_drilldown_exports',
    'behaviour_analytics': 'reports_drilldown_exports',
    'gender_equity_analytics': 'reports_drilldown_exports',
    'longitudinal_5y': 'reports_drilldown_exports',
}


# -----------------------------------------------------------------------------
# Plan Normalization and Ranking
# -----------------------------------------------------------------------------

def normalize_plan_name(plan: Any) -> str:
    """
    Normalizes a plan identifier (string, Plan instance, PlatformPlan, or None)
    to one of: 'free', 'standard', 'premium', 'custom'.
    """
    if plan is None:
        return PLAN_FREE

    raw = ''
    if isinstance(plan, str):
        raw = plan
    elif hasattr(plan, 'code') and not callable(getattr(plan, 'code')):
        raw = str(plan.code)
    elif hasattr(plan, 'name') and not callable(getattr(plan, 'name')):
        raw = str(plan.name)
    else:
        raw = str(plan)

    clean = raw.strip().lower()

    if clean in PLAN_RANKS:
        return clean

    # Check common aliases
    if clean in ('no_plan', 'basic', 'starter', 'unpaid', 'none', 'null', ''):
        return PLAN_FREE
    if 'custom' in clean:
        return PLAN_CUSTOM
    if 'premium' in clean:
        return PLAN_PREMIUM
    if 'standard' in clean:
        return PLAN_STANDARD
    if 'free' in clean:
        return PLAN_FREE

    return PLAN_FREE


def plan_rank(plan: Any) -> int:
    """
    Returns the integer rank of the given plan (0 for Free, 1 for Standard,
    2 for Premium, 3 for Custom). Higher rank indicates higher entitlement tier.
    """
    normalized = normalize_plan_name(plan)
    return PLAN_RANKS.get(normalized, PLAN_RANKS[PLAN_FREE])


# -----------------------------------------------------------------------------
# Organisation Plan Resolver
# -----------------------------------------------------------------------------

def get_org_plan(org: Any) -> str:
    """
    Retrieves the active plan tier for an organisation.
    Accepts:
    - Organisation model instance
    - School model instance (resolves school's organisation and subscription)
    - Organisation ID (int)
    - Plan name or code string
    - None (returns 'free')

    Returns:
    - 'free' | 'standard' | 'premium' | 'custom'
    """
    if org is None:
        return PLAN_FREE

    # Direct plan name or code string
    if isinstance(org, str):
        clean = org.strip().lower()
        if clean in PLAN_RANKS or clean in ('no_plan', 'basic', 'starter', 'unpaid'):
            return normalize_plan_name(clean)

    # Check for direct attribute on mock or dynamically assigned object
    # Prefer explicit plan attribute
    if hasattr(org, 'plan') and not callable(getattr(org, 'plan')):
        val = getattr(org, 'plan')
        if isinstance(val, (str, int)) or (hasattr(val, 'code') and not callable(val.code)):
            return normalize_plan_name(val)
    if hasattr(org, 'plan_code') and not callable(getattr(org, 'plan_code')):
        val = getattr(org, 'plan_code')
        if isinstance(val, (str, int)) or (hasattr(val, 'code') and not callable(val.code)):
            return normalize_plan_name(val)

    org_obj = None
    school_obj = None

    try:
        from core.models import Organisation, School, SchoolSubscription, OrganisationSubscription
    except ImportError:
        return PLAN_FREE

    if isinstance(org, School):
        school_obj = org
        org_obj = getattr(school_obj, 'organisation', None)
    elif isinstance(org, Organisation):
        org_obj = org
    elif isinstance(org, int):
        org_obj = Organisation.objects.filter(id=org).first()
    elif isinstance(org, str):
        org_obj = Organisation.objects.filter(code=org).first() or Organisation.objects.filter(name=org).first()

    # 1. Check OrganisationSubscription if present
    if org_obj:
        try:
            org_sub = getattr(org_obj, 'subscription', None)
            if not org_sub:
                org_sub = OrganisationSubscription.objects.filter(organisation=org_obj).select_related('plan').first()
            if org_sub and getattr(org_sub, 'status', None) in ('active', 'trial') and org_sub.plan:
                return normalize_plan_name(getattr(org_sub.plan, 'name', ''))
        except Exception:
            pass

    # 2. Check SchoolSubscription for schools in organisation
    try:
        sub_qs = None
        if school_obj:
            sub_qs = SchoolSubscription.objects.filter(school=school_obj)
        elif org_obj:
            sub_qs = SchoolSubscription.objects.filter(school__organisation=org_obj)

        if sub_qs is not None:
            # Check for active or past_due subscription
            sub = sub_qs.filter(status__in=['active', 'past_due']).select_related('plan').order_by('-paid_until', '-id').first()
            if sub and sub.plan:
                return normalize_plan_name(sub.plan.code)
    except Exception:
        pass

    return PLAN_FREE


# -----------------------------------------------------------------------------
# Feature Access Checker
# -----------------------------------------------------------------------------

def _resolve_feature_key(feature_key: str) -> str:
    """Normalizes and maps aliases to the canonical feature key."""
    if not feature_key:
        return ''
    clean = str(feature_key).strip().lower()
    return FEATURE_ALIASES.get(clean, clean)


def _check_override(org: Any, feature_key: str) -> Optional[bool]:
    """
    Checks for per-organisation or per-school superadmin overrides.
    Returns:
    - True if explicitly granted
    - False if explicitly revoked
    - None if no override is configured
    """
    if org is None:
        return None

    # 1. In-memory dictionary on org object (e.g. unit tests or dynamic mocks)
    if hasattr(org, 'feature_overrides') and isinstance(org.feature_overrides, dict):
        if feature_key in org.feature_overrides:
            return bool(org.feature_overrides[feature_key])

    if hasattr(org, 'custom_features'):
        custom_feats = getattr(org, 'custom_features', None)
        if isinstance(custom_feats, (set, list, tuple)):
            if feature_key in custom_feats:
                return True
        elif isinstance(custom_feats, dict):
            if feature_key in custom_feats:
                return bool(custom_feats[feature_key])

    # 2. Database SchoolFeatureOverride records
    try:
        from core.models import School, SchoolFeatureOverride
        school_id = None
        if isinstance(org, School):
            school_id = org.id
        elif hasattr(org, 'school_id') and org.school_id:
            school_id = org.school_id
        elif hasattr(org, 'schools'):
            first_school = org.schools.first()
            if first_school:
                school_id = first_school.id

        if school_id:
            now = timezone.now()
            # Check both canonical and raw key in overrides
            ov = SchoolFeatureOverride.objects.filter(
                school_id=school_id,
                feature_key=feature_key
            ).first()
            if ov:
                if ov.expires_at and now >= ov.expires_at:
                    return None
                return bool(ov.is_granted)
    except Exception:
        pass

    return None


def has_feature(org: Any, feature_key: str) -> bool:
    """
    Evaluates whether an organisation (or school) has access to a specific feature key.

    Logic:
    1. Resolve feature key and its minimum required plan from FEATURE_MAP.
    2. Check superadmin per-organisation overrides (if override exists, it takes precedence).
    3. If plan is 'custom': all features in premium are included by default, subject to overrides.
    4. Otherwise, compare organization's plan rank with feature's required plan rank.
    """
    if not feature_key:
        return False

    clean_key = str(feature_key).strip().lower()
    canonical_key = _resolve_feature_key(clean_key)

    min_plan = FEATURE_MAP.get(canonical_key)
    if min_plan is None:
        # Fallback check for raw key in FEATURE_MAP
        min_plan = FEATURE_MAP.get(clean_key)

    # If unknown feature, default to premium requirement
    if min_plan is None:
        min_plan = PLAN_PREMIUM

    # Check for superadmin override on either canonical key or raw key
    override = _check_override(org, canonical_key)
    if override is None and canonical_key != clean_key:
        override = _check_override(org, clean_key)

    if override is not None:
        return override

    # Resolve organization plan
    org_plan = get_org_plan(org)

    # Custom tier includes everything up to premium by default
    if org_plan == PLAN_CUSTOM:
        return True

    return plan_rank(org_plan) >= plan_rank(min_plan)


# -----------------------------------------------------------------------------
# Usage Limits Helpers
# -----------------------------------------------------------------------------

def get_plan_limits(plan: Any = None, org: Any = None) -> Dict[str, Optional[int]]:
    """
    Returns usage limits (e.g. max_students, max_campuses) for a plan or organisation.
    Supports per-organisation overrides for Custom plans.
    """
    if org is not None and plan is None:
        plan_str = get_org_plan(org)
    else:
        plan_str = normalize_plan_name(plan)

    limits = dict(PLAN_LIMITS.get(plan_str, PLAN_LIMITS[PLAN_FREE]))

    # Allow custom overrides on org object
    if org is not None and plan_str == PLAN_CUSTOM:
        if hasattr(org, 'custom_limits') and isinstance(org.custom_limits, dict):
            limits.update(org.custom_limits)
        if hasattr(org, 'max_students') and getattr(org, 'max_students', None) is not None:
            limits['max_students'] = org.max_students
        if hasattr(org, 'max_campuses') and getattr(org, 'max_campuses', None) is not None:
            limits['max_campuses'] = org.max_campuses

    return limits


def check_plan_limit(org: Any, limit_name: str, count: int) -> Tuple[bool, Optional[int]]:
    """
    Checks if a given count is within the plan's limit for the organisation.
    Returns:
    - (is_allowed: bool, max_allowed: int or None)
    """
    limits = get_plan_limits(org=org)
    max_allowed = limits.get(limit_name)
    if max_allowed is None:
        return True, None
    return count <= max_allowed, max_allowed


def get_features_for_plan(plan: Any) -> Set[str]:
    """
    Returns the set of all canonical feature keys included in the specified plan tier.
    """
    target_rank = plan_rank(plan)
    return {
        key for key, required_plan in FEATURE_MAP.items()
        if plan_rank(required_plan) <= target_rank
    }
