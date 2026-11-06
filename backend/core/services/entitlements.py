"""
Centralized Subscription Entitlements and Feature Locking Service.
Authoritative server-side evaluation of school subscription status,
tier capabilities, platform-admin feature overrides, and caching.

Three Access Levels:
1. no_plan: New schools start here. Basic access list only. Paid Standard and Premium features locked.
2. standard: Unlocks Standard features. Premium-only features locked.
3. premium: Unlocks all features.
"""
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.core.cache import cache
from core.models import (
    School,
    Student,
    Enrollment,
    Plan,
    PlanFeature,
    FeatureCatalog,
    PlatformBillingSettings,
    SchoolSubscription,
    SubscriptionOrder,
    SchoolFeatureOverride,
    SubscriptionEvent,
    Notification,
    User,
)

CACHE_TTL_SECONDS = 300
CACHE_PREFIX = "entitlements:school:"

# Essential security and system capabilities that can NEVER be locked on any plan or status
NEVER_LOCKED_FEATURES = {
    'authentication',
    'password_change',
    'profile_view',
    'subscription_management',
    'order_submission',
    'support_contact',
    'compliance_export',
    'english_urdu',
}


def get_active_enrolled_student_count(school):
    """
    Returns the number of ACTIVE ENROLLED students in the school:
    Students where active=True and having an open enrollment (end_date__isnull=True)
    in a class belonging to the school. If none, falls back to active student count.
    """
    if not school:
        return 0
    count = Student.objects.filter(
        school=school,
        active=True,
        enrollments__end_date__isnull=True,
        enrollments__school_class__school=school
    ).distinct().count()

    if count == 0:
        count = Student.objects.filter(school=school, active=True).count()
    return count


def get_or_create_school_subscription(school):
    """
    Retrieves or initializes a SchoolSubscription record for a school.
    New schools start with status 'no_plan' (nothing paid yet).
    """
    sub = SchoolSubscription.objects.filter(school=school).select_related('plan').first()
    if sub:
        return sub

    sub = SchoolSubscription.objects.create(
        school=school,
        plan=None,
        status='no_plan',
        student_count_at_last_invoice=get_active_enrolled_student_count(school),
    )
    SubscriptionEvent.objects.create(
        school=school,
        event_type='status_changed',
        from_status='',
        to_status='no_plan',
        notes="Subscription initialized in no_plan state.",
        metadata={}
    )
    return sub


def get_effective_subscription_status(school, now=None):
    """
    Evaluates and applies just-in-time time-based state transitions for a school subscription.
    Handles transitions:
    - active -> past_due (if paid period ended) with grace period
    - active (with pending_downgrade_to_plan) -> downgrade takes effect at end of paid period
    - past_due -> no_plan (if grace ended)
    """
    if not school:
        return 'no_plan'

    sub = SchoolSubscription.objects.filter(school=school).select_related('plan', 'pending_downgrade_to_plan').first()
    if not sub:
        sub = get_or_create_school_subscription(school)

    current_time = now or timezone.now()
    settings = PlatformBillingSettings.get_settings()
    old_status = sub.status
    new_status = old_status

    if old_status == 'active':
        if sub.paid_until and current_time >= sub.paid_until:
            # Check if there is a scheduled downgrade
            if sub.pending_downgrade_to_plan:
                downgraded_plan = sub.pending_downgrade_to_plan
                prev_plan_code = sub.plan.code if sub.plan else 'premium'
                sub.plan = downgraded_plan
                sub.pending_downgrade_to_plan = None
                sub.save(update_fields=['plan', 'pending_downgrade_to_plan', 'updated_at'])
                SubscriptionEvent.objects.create(
                    school=school,
                    event_type='downgraded',
                    from_plan=prev_plan_code,
                    to_plan=downgraded_plan.code,
                    notes=f"Scheduled downgrade to {downgraded_plan.name} applied at end of paid period."
                )

            # Move to past_due
            new_status = 'past_due'
            sub.grace_until = sub.paid_until + timedelta(days=settings.past_due_grace_days)
            SubscriptionEvent.objects.create(
                school=school,
                event_type='past_due',
                from_status=old_status,
                to_status=new_status,
                notes=f"Subscription paid term ended on {sub.paid_until.date()}. Transitioned to past_due ({settings.past_due_grace_days} days grace).",
                metadata={'grace_until': str(sub.grace_until)}
            )
            _notify_school_admins(
                school,
                title="Subscription Term Expired — Grace Period Active",
                body=f"Your subscription expired on {sub.paid_until.date()}. Full access remains active during your {settings.past_due_grace_days}-day grace period. Please submit renewal payment."
            )

    elif old_status == 'past_due':
        if sub.grace_until and current_time >= sub.grace_until:
            new_status = 'no_plan'
            sub.grace_until = None
            SubscriptionEvent.objects.create(
                school=school,
                event_type='expired_to_no_plan',
                from_status=old_status,
                to_status=new_status,
                notes=f"Past due grace period elapsed. School transitioned to no_plan mode."
            )
            _notify_school_admins(
                school,
                title="Subscription Grace Period Concluded",
                body="Your subscription grace period has ended. The school account is now in no_plan mode. All existing data is safe and viewable."
            )

    if new_status != old_status:
        sub.status = new_status
        sub.save(update_fields=['status', 'grace_until', 'updated_at'])
        invalidate_school_entitlements_cache(school.id)

    return new_status


def get_school_entitlements(school, now=None, use_cache=True):
    """
    Computes and returns the complete effective entitlements dictionary for a school.
    Results are cached per school with zero cross-tenant leakage.
    """
    if not school:
        return _empty_entitlements()

    cache_key = f"{CACHE_PREFIX}{school.id}"
    if use_cache:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    current_time = now or timezone.now()
    status = get_effective_subscription_status(school, now=current_time)
    sub = SchoolSubscription.objects.filter(school=school).select_related('plan', 'pending_downgrade_to_plan').first()
    settings = PlatformBillingSettings.get_settings()
    active_students = get_active_enrolled_student_count(school)

    plan_code = None
    if sub and sub.plan:
        plan_code = sub.plan.code

    is_no_plan = (status == 'no_plan')
    is_suspended = (status == 'suspended')
    is_write_allowed = not is_suspended

    # Effective tier access:
    # - no_plan: basic access only
    # - past_due: grants full access to their prior plan during grace
    # - active: grants active plan tier (standard or premium)
    # - suspended: 0 features
    if is_suspended:
        effective_tier = 'none'
    elif is_no_plan:
        effective_tier = 'no_plan'
    elif status in ('active', 'past_due'):
        effective_tier = plan_code or 'standard'
    else:
        effective_tier = 'no_plan'

    all_catalog = list(FeatureCatalog.objects.all())
    allowed_keys = set(NEVER_LOCKED_FEATURES)

    basic_features = settings.basic_access_features or list(PlatformBillingSettings.DEFAULT_BASIC_ACCESS_FEATURES)
    allowed_keys.update(basic_features)

    if effective_tier == 'premium':
        # Unlocks all available catalog features
        allowed_keys.update(f.key for f in all_catalog if f.status != 'coming_soon')
    elif effective_tier == 'standard':
        plan_obj = Plan.objects.filter(code='standard').first()
        if plan_obj:
            included_keys = PlanFeature.objects.filter(
                plan=plan_obj,
                is_included=True
            ).values_list('feature_key', flat=True)
            allowed_keys.update(included_keys)
        else:
            # Standard features from catalog
            allowed_keys.update(f.key for f in all_catalog if not f.is_premium_only and f.status != 'coming_soon')

    # Apply per-school platform-admin overrides
    overrides = SchoolFeatureOverride.objects.filter(school=school)
    for ov in overrides:
        if ov.expires_at and current_time >= ov.expires_at:
            continue
        if ov.is_granted:
            allowed_keys.add(ov.feature_key)
        else:
            allowed_keys.discard(ov.feature_key)

    # Calculate grace days remaining
    grace_days_remaining = None
    if sub and sub.grace_until:
        diff = sub.grace_until - current_time
        grace_days_remaining = max(0, diff.days + (1 if diff.seconds > 0 else 0))

    # Build detailed feature dictionary
    features_dict = {}
    for feat in all_catalog:
        is_unlocked = (feat.key in allowed_keys) and (feat.status != 'coming_soon')
        req_plan = 'premium' if feat.is_premium_only else 'standard'
        features_dict[feat.key] = {
            'key': feat.key,
            'name': feat.name,
            'name_ur': feat.name_ur,
            'category': feat.category,
            'status': feat.status,
            'is_unlocked': is_unlocked,
            'is_premium_only': feat.is_premium_only,
            'requires_plan': req_plan
        }

    payload = {
        'school_id': school.id,
        'school_name': school.name,
        'plan': plan_code,
        'effective_tier': effective_tier,
        'status': status,
        'is_no_plan': is_no_plan,
        'is_limited': is_no_plan,  # Compatibility alias
        'is_suspended': is_suspended,
        'is_write_allowed': is_write_allowed,
        'active_students': active_students,
        'student_count_at_last_invoice': sub.student_count_at_last_invoice if sub else 0,
        'has_student_growth': active_students > (sub.student_count_at_last_invoice if sub else 0),
        'current_period_start': sub.current_period_start.isoformat() if (sub and sub.current_period_start) else None,
        'paid_until': sub.paid_until.isoformat() if (sub and sub.paid_until) else None,
        'grace_until': sub.grace_until.isoformat() if (sub and sub.grace_until) else None,
        'grace_days_remaining': grace_days_remaining,
        'pending_downgrade_to_plan': sub.pending_downgrade_to_plan.code if (sub and sub.pending_downgrade_to_plan) else None,
        'features': features_dict,
        'allowed_feature_keys': sorted(list(allowed_keys)),
    }

    cache.set(cache_key, payload, CACHE_TTL_SECONDS)
    return payload


def check_feature_access(school, feature_key, now=None):
    """
    Evaluates whether a school has access to a specific feature key.
    Returns: (is_allowed: bool, reason: str, required_plan: str)
    """
    if not school:
        return True, "", ""

    if feature_key in NEVER_LOCKED_FEATURES:
        return True, "", ""

    entitlements = get_school_entitlements(school, now=now)
    if entitlements['is_suspended']:
        return False, "School account is suspended.", "premium"

    feature_info = entitlements['features'].get(feature_key)
    if not feature_info:
        cat = FeatureCatalog.objects.filter(key=feature_key).first()
        req_plan = 'premium' if (cat and cat.is_premium_only) else 'standard'
        return False, f"Feature '{feature_key}' is not recognized.", req_plan

    if feature_info['status'] == 'coming_soon':
        return False, f"Feature '{feature_key}' is coming soon and not yet active.", feature_info['requires_plan']

    if feature_info['is_unlocked']:
        return True, "", ""

    return False, f"Feature '{feature_key}' requires an active {feature_info['requires_plan']} plan.", feature_info['requires_plan']


def is_limited_mode(school, now=None):
    """Returns True if the school is currently in no_plan mode."""
    if not school:
        return False
    status = get_effective_subscription_status(school, now=now)
    return status == 'no_plan'


def invalidate_school_entitlements_cache(school_id):
    """Evicts cached entitlements for a given school ID."""
    if school_id:
        cache.delete(f"{CACHE_PREFIX}{school_id}")


def sync_all_subscription_states(now=None):
    """
    Idempotent maintenance command execution.
    Evaluates all school subscriptions and updates statuses if deadlines have elapsed.
    """
    current_time = now or timezone.now()
    subs = SchoolSubscription.objects.select_related('school').all()
    transitions_count = 0

    for sub in subs:
        prev_status = sub.status
        new_status = get_effective_subscription_status(sub.school, now=current_time)
        if prev_status != new_status:
            transitions_count += 1

    return {
        'total_evaluated': subs.count(),
        'transitions_applied': transitions_count,
        'evaluated_at': current_time.isoformat(),
    }


def _empty_entitlements():
    return {
        'school_id': None,
        'school_name': '',
        'plan': None,
        'effective_tier': 'premium',
        'status': 'active',
        'is_no_plan': False,
        'is_limited': False,
        'is_suspended': False,
        'is_write_allowed': True,
        'active_students': 0,
        'student_count_at_last_invoice': 0,
        'has_student_growth': False,
        'current_period_start': None,
        'paid_until': None,
        'grace_until': None,
        'grace_days_remaining': None,
        'pending_downgrade_to_plan': None,
        'features': {},
        'allowed_feature_keys': sorted(list(NEVER_LOCKED_FEATURES)),
    }


def _notify_school_admins(school, title, body):
    """Creates in-app notification records for all administrators of a school."""
    admins = User.objects.filter(
        school=school,
        role__in=['owner', 'organisation_admin', 'school_admin'],
        is_active=True
    )
    for admin in admins:
        Notification.objects.create(
            user=admin,
            title=title,
            body=body
        )
