"""
Subscription Order Processing, Manual Offline Bank Verification,
Trial Lifecycle, and Commercial Billing Engine.
"""
import calendar
import uuid
from datetime import datetime, timedelta, date
from decimal import Decimal
from django.utils import timezone
import logging
from core.models import (
    School,
    Student,
    User,
    Plan,
    PlatformBillingSettings,
    SchoolSubscription,
    SubscriptionOrder,
    SchoolFeatureOverride,
    SubscriptionEvent,
    Notification,
)
from core.services.entitlements import (
    get_active_enrolled_student_count,
    invalidate_school_entitlements_cache,
)
from core.services.payments import (
    get_payment_provider,
    WebhookSignatureVerificationError,
)
from django.conf import settings

logger = logging.getLogger('core.subscriptions')


def add_calendar_months(dt, months):
    """
    Adds a number of months to a datetime or date without external dateutil dependencies,
    correctly clamping days at the end of the month (e.g. Jan 31 + 1 month -> Feb 28).
    """
    month = dt.month - 1 + months
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    if isinstance(dt, datetime):
        return dt.replace(year=year, month=month, day=day)
    return date(year, month, day)


def calculate_invoice_estimate(plan, billing_months, student_count, currency='USD'):
    """
    Computes pricing breakdown for a proposed subscription order.
    Prices come strictly from the Plan model in the database, never hardcoded.
    """
    if billing_months not in (1, 3, 6, 12):
        raise ValueError("Billing period must be 1, 3, 6, or 12 months.")

    currency = (currency or 'USD').upper()
    if currency not in ('USD', 'PKR'):
        raise ValueError("Currency must be USD or PKR.")

    settings = PlatformBillingSettings.get_settings()
    unit_price = plan.price_usd_per_student if currency == 'USD' else plan.price_pkr_per_student

    discount_percentage = Decimal('0.00')
    if billing_months == 12:
        discount_percentage = settings.yearly_discount_percentage or Decimal('0.00')

    gross_amount = (Decimal(student_count) * unit_price * Decimal(billing_months)).quantize(Decimal('0.01'))
    discount_amount = (gross_amount * (discount_percentage / Decimal('100.00'))).quantize(Decimal('0.01'))
    payable_amount = (gross_amount - discount_amount).quantize(Decimal('0.01'))

    return {
        'plan_code': plan.code,
        'plan_name': plan.name,
        'billing_months': billing_months,
        'student_count': student_count,
        'currency': currency,
        'unit_price': unit_price,
        'discount_percentage': discount_percentage,
        'gross_amount': gross_amount,
        'discount_amount': discount_amount,
        'payable_amount': payable_amount,
    }


def check_repeat_trial_risk(email, phone=None):
    """
    Best-effort anti-abuse check: checks if an admin email or phone has already
    received and completed a complimentary trial at any school in the platform.
    """
    if not email:
        return False
    email = email.strip().lower()

    # Find any previous users with this email who registered a school that already consumed a trial
    past_admins = User.objects.filter(
        email__iexact=email,
        role__in=['owner', 'organisation_admin', 'school_admin']
    ).select_related('school')

    for u in past_admins:
        if u.school and hasattr(u.school, 'subscription'):
            sub = u.school.subscription
            # If they had a trial that started more than 3 days ago or is no longer trial
            if sub.trial_started_at and (sub.status != 'trial' or (sub.trial_ends_at and sub.trial_ends_at < timezone.now())):
                return True

    return False


def provision_school_registration_subscription(school, admin_user, plan_slug=None):
    """
    Initializes a new school's subscription upon institution registration.
    If default_trial_days == 0, complimentary trials are disabled and schools start in 'limited' mode.
    If trial_days > 0, checks repeat-trial abuse before granting a trial.
    """
    settings = PlatformBillingSettings.get_settings()
    now = timezone.now()
    plan = None
    if plan_slug:
        plan = Plan.objects.filter(code=plan_slug, is_active=True).first()
    if not plan:
        plan = Plan.objects.filter(code='standard', is_active=True).first()

    trial_days = settings.default_trial_days or 0

    if trial_days == 0:
        sub, _ = SchoolSubscription.objects.update_or_create(
            school=school,
            defaults={
                'plan': plan,
                'status': 'limited',
                'trial_started_at': None,
                'trial_ends_at': None,
                'student_count_at_last_invoice': get_active_enrolled_student_count(school),
            }
        )
        SubscriptionEvent.objects.create(
            school=school,
            event_type='status_changed',
            to_status='limited',
            actor=admin_user,
            notes="School registered. Subscription initialized in limited mode (trial disabled); payment required to activate package.",
            metadata={'admin_email': admin_user.email if admin_user else '', 'plan': plan.code if plan else None}
        )
        invalidate_school_entitlements_cache(school.id)
        return sub

    # Anti-abuse check
    is_repeat = check_repeat_trial_risk(admin_user.email if admin_user else None)

    if is_repeat:
        # Deny complimentary trial: place in limited mode until paid
        sub, _ = SchoolSubscription.objects.update_or_create(
            school=school,
            defaults={
                'plan': plan,
                'status': 'limited',
                'trial_started_at': now,
                'trial_ends_at': now,
                'student_count_at_last_invoice': get_active_enrolled_student_count(school),
            }
        )
        SubscriptionEvent.objects.create(
            school=school,
            event_type='status_changed',
            to_status='limited',
            actor=admin_user,
            notes="Repeat trial prevented for administrator email. Placed in limited mode pending payment order.",
            metadata={'admin_email': admin_user.email if admin_user else ''}
        )
    else:
        # Standard trial provision
        trial_end = now + timedelta(days=trial_days)
        sub, _ = SchoolSubscription.objects.update_or_create(
            school=school,
            defaults={
                'plan': plan,
                'status': 'trial',
                'trial_started_at': now,
                'trial_ends_at': trial_end,
                'student_count_at_last_invoice': get_active_enrolled_student_count(school),
            }
        )
        SubscriptionEvent.objects.create(
            school=school,
            event_type='trial_started',
            to_status='trial',
            to_plan=plan.code if plan else 'standard',
            actor=admin_user,
            notes=f"Complimentary {trial_days}-day evaluation trial started. Full Premium access granted.",
            metadata={'trial_days': trial_days, 'trial_ends_at': str(trial_end)}
        )

    invalidate_school_entitlements_cache(school.id)
    return sub


def create_subscription_order(school, plan, billing_months, payment_reference, paid_on,
                              amount, currency='USD', notes='', submitted_by=None):
    """
    Submits an offline payment verification order.
    Transitions school to 'pending_approval' with configurable grace period.
    """
    settings = PlatformBillingSettings.get_settings()
    now = timezone.now()
    active_students = get_active_enrolled_student_count(school)

    if isinstance(paid_on, str):
        try:
            paid_on = date.fromisoformat(paid_on.strip()[:10])
        except (ValueError, TypeError):
            paid_on = now.date()
    elif isinstance(paid_on, datetime):
        paid_on = paid_on.date()
    elif not isinstance(paid_on, date):
        paid_on = now.date()

    # Calculate system expected amount for audit
    estimate = calculate_invoice_estimate(
        plan=plan,
        billing_months=billing_months,
        student_count=active_students,
        currency=currency
    )

    # Unique human-readable order number
    order_number = f"ORD-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

    order = SubscriptionOrder.objects.create(
        order_number=order_number,
        school=school,
        plan=plan,
        billing_months=billing_months,
        student_count=active_students,
        unit_price=estimate['unit_price'],
        discount_percentage=estimate['discount_percentage'],
        amount=Decimal(str(amount)).quantize(Decimal('0.01')),
        currency=currency.upper(),
        payment_reference=str(payment_reference).strip(),
        paid_on=paid_on,
        payment_notes=str(notes).strip(),
        status='pending',
        submitted_by=submitted_by,
    )

    # Update school subscription to pending_approval with grace
    sub = getattr(school, 'subscription', None)
    if not sub:
        sub = SchoolSubscription.objects.create(school=school, plan=plan, status='pending_approval')

    old_status = sub.status
    sub.status = 'pending_approval'
    sub.grace_until = now + timedelta(days=settings.pending_grace_days)
    sub.save(update_fields=['status', 'grace_until', 'updated_at'])

    SubscriptionEvent.objects.create(
        school=school,
        event_type='order_submitted',
        from_status=old_status,
        to_status='pending_approval',
        to_plan=plan.code,
        actor=submitted_by,
        notes=f"Order #{order.order_number} submitted. Payment ref: {order.payment_reference}. Amount: {order.amount} {order.currency}.",
        metadata={
            'order_id': order.id,
            'order_number': order.order_number,
            'billing_months': billing_months,
            'expected_amount': str(estimate['payable_amount']),
            'submitted_amount': str(order.amount),
        }
    )

    invalidate_school_entitlements_cache(school.id)
    return order


def approve_subscription_order(order, reviewer, review_note=''):
    """
    Platform Administrator action: confirms bank receipt and activates/extends the subscription.
    """
    if order.status == 'approved':
        raise ValueError("Order is already approved.")

    now = timezone.now()
    order.status = 'approved'
    order.reviewed_by = reviewer
    order.reviewed_at = now
    order.review_note = str(review_note).strip()
    order.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_note', 'updated_at'])

    school = order.school
    sub = getattr(school, 'subscription', None)
    if not sub:
        sub = SchoolSubscription.objects.create(school=school, plan=order.plan, status='active')

    old_status = sub.status
    old_plan = sub.plan.code if sub.plan else 'none'

    # Determine period start and new paid_until
    if sub.paid_until and sub.paid_until > now:
        start_date = sub.paid_until
    else:
        start_date = now

    new_paid_until = add_calendar_months(start_date, order.billing_months)

    sub.plan = order.plan
    sub.status = 'active'
    sub.current_period_start = start_date
    sub.paid_until = new_paid_until
    sub.grace_until = None
    sub.student_count_at_last_invoice = order.student_count
    sub.save()

    SubscriptionEvent.objects.create(
        school=school,
        event_type='order_approved',
        from_status=old_status,
        to_status='active',
        from_plan=old_plan,
        to_plan=order.plan.code,
        actor=reviewer,
        notes=f"Order #{order.order_number} approved. Paid term active until {new_paid_until.date()}. {review_note}".strip(),
        metadata={
            'order_id': order.id,
            'order_number': order.order_number,
            'paid_until': str(new_paid_until),
            'student_count': order.student_count,
        }
    )

    # In-app notification to school administrators
    admins = User.objects.filter(
        school=school,
        role__in=['owner', 'organisation_admin', 'school_admin'],
        is_active=True
    )
    for admin in admins:
        Notification.objects.create(
            user=admin,
            title=f"Payment Approved — {order.plan.name} Activated",
            body=f"Your offline payment for order #{order.order_number} has been verified. Your subscription is active until {new_paid_until.date()}."
        )

    invalidate_school_entitlements_cache(school.id)
    return order


def reject_subscription_order(order, reviewer, review_note):
    """
    Platform Administrator action: rejects an invalid or unverified offline deposit order.
    """
    if order.status != 'pending':
        raise ValueError("Only pending orders can be rejected.")
    if not review_note or not review_note.strip():
        raise ValueError("A rejection reason/note is required.")

    now = timezone.now()
    order.status = 'rejected'
    order.reviewed_by = reviewer
    order.reviewed_at = now
    order.review_note = str(review_note).strip()
    order.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_note', 'updated_at'])

    school = order.school
    sub = getattr(school, 'subscription', None)

    # If this was their only pending order and grace has expired, downgrade to limited
    if sub and sub.status == 'pending_approval':
        other_pending = SubscriptionOrder.objects.filter(
            school=school,
            status='pending'
        ).exclude(id=order.id).exists()

        if not other_pending:
            # Check if active paid_until exists in the future
            if sub.paid_until and sub.paid_until > now:
                sub.status = 'active'
            elif sub.trial_ends_at and sub.trial_ends_at > now:
                sub.status = 'trial'
            else:
                sub.status = 'limited'
                sub.grace_until = None
            sub.save(update_fields=['status', 'grace_until', 'updated_at'])

    SubscriptionEvent.objects.create(
        school=school,
        event_type='order_rejected',
        actor=reviewer,
        notes=f"Order #{order.order_number} rejected. Reason: {review_note.strip()}",
        metadata={'order_id': order.id, 'order_number': order.order_number}
    )

    # In-app notification to school administrators
    admins = User.objects.filter(
        school=school,
        role__in=['owner', 'organisation_admin', 'school_admin'],
        is_active=True
    )
    for admin in admins:
        Notification.objects.create(
            user=admin,
            title="Subscription Payment Not Approved",
            body=f"Your offline payment for order #{order.order_number} could not be verified. Note: {review_note.strip()}"
        )

    invalidate_school_entitlements_cache(school.id)
    return order


def extend_school_trial(school, extra_days, reason, actor):
    """
    Platform Administrator action: extends a school's trial by N days.
    Mandatory audited reason logged in SubscriptionEvent.
    """
    if extra_days <= 0:
        raise ValueError("Extension duration must be at least 1 day.")
    if not reason or not reason.strip():
        raise ValueError("A reason for trial extension is required for audit purposes.")

    now = timezone.now()
    sub = getattr(school, 'subscription', None)
    if not sub:
        sub = SchoolSubscription.objects.create(school=school, status='trial')

    old_status = sub.status
    base_end = sub.trial_ends_at if (sub.trial_ends_at and sub.trial_ends_at > now) else now
    new_trial_end = base_end + timedelta(days=extra_days)

    sub.trial_ends_at = new_trial_end
    sub.status = 'trial'
    sub.grace_until = None
    sub.save(update_fields=['trial_ends_at', 'status', 'grace_until', 'updated_at'])

    SubscriptionEvent.objects.create(
        school=school,
        event_type='trial_extended',
        from_status=old_status,
        to_status='trial',
        actor=actor,
        notes=f"Trial extended by {extra_days} days. Reason: {reason.strip()}",
        metadata={'days_added': extra_days, 'new_trial_ends_at': str(new_trial_end)}
    )

    invalidate_school_entitlements_cache(school.id)
    return sub


def create_card_subscription_order(school, plan, billing_months, return_url, cancel_url,
                                   currency='USD', submitted_by=None, provider_name=None):
    """
    Initiates a hosted card payment checkout session (Paddle Billing, FakeProvider, etc.).
    Amounts are computed on the server from the database, never taken from the browser.
    Card details NEVER touch our frontend, backend, database or logs.
    """
    now = timezone.now()
    active_students = get_active_enrolled_student_count(school)

    # Server-side calculation from database Plan model
    estimate = calculate_invoice_estimate(
        plan=plan,
        billing_months=billing_months,
        student_count=active_students,
        currency=currency
    )

    order_number = f"ORD-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
    provider = get_payment_provider(provider_name)
    resolved_provider_name = getattr(provider, 'provider_name', provider_name or getattr(settings, 'PAYMENT_PROVIDER', 'fake'))

    order = SubscriptionOrder.objects.create(
        order_number=order_number,
        school=school,
        plan=plan,
        billing_months=billing_months,
        student_count=active_students,
        unit_price=estimate['unit_price'],
        discount_percentage=estimate['discount_percentage'],
        amount=estimate['payable_amount'],
        currency=currency.upper(),
        provider=resolved_provider_name,
        status='pending',
        submitted_by=submitted_by,
    )

    # Generate provider checkout URL
    checkout_res = provider.create_checkout(order, return_url=return_url, cancel_url=cancel_url)
    order.checkout_url = checkout_res.checkout_url
    order.provider_reference = checkout_res.provider_reference
    order.save(update_fields=['checkout_url', 'provider_reference', 'updated_at'])

    SubscriptionEvent.objects.create(
        school=school,
        event_type='order_created',
        from_status=getattr(getattr(school, 'subscription', None), 'status', 'unknown'),
        to_status='pending',
        actor=submitted_by,
        notes=f"Card checkout session initiated for {order.plan.name} ({order.billing_months} months, {order.amount} {order.currency}).",
        metadata={
            'order_number': order.order_number,
            'provider': resolved_provider_name,
            'amount': str(order.amount),
            'currency': order.currency,
        }
    )

    return order


def process_payment_webhook(payload_bytes, headers, provider_name=None):
    """
    Signature-verified, idempotent processing of provider payment webhooks.
    Non-negotiable rules:
    - Rejects invalid signatures with 400.
    - Idempotent: duplicate delivery returns 200 without double-activation.
    - Validates amount and currency against database order.
    - Upgrades school to active Premium automatically only upon verified payment.
    - Downgrades on refund/chargeback.
    """
    provider = get_payment_provider(provider_name)

    # 1. Cryptographic signature check
    if not provider.verify_webhook(payload_bytes, headers):
        raise WebhookSignatureVerificationError("Invalid or forged webhook signature.")

    # 2. Parse event DTO
    event = provider.parse_event(payload_bytes, headers)

    # 3. Idempotency / Replay protection check
    # Check if this exact provider_event_id has already been successfully processed
    if event.event_id:
        existing_order = SubscriptionOrder.objects.filter(provider_event_id=event.event_id).first()
        if existing_order:
            logger.info("Webhook event %s already processed for order %s (idempotent noop)", event.event_id, existing_order.order_number)
            return {
                'status': 'idempotent',
                'order_number': existing_order.order_number,
                'message': 'Event already processed'
            }

    # 4. Lookup order by order_number or provider_reference
    order = SubscriptionOrder.objects.filter(order_number=event.order_reference).first()
    if not order and event.order_reference:
        order = SubscriptionOrder.objects.filter(provider_reference=event.order_reference).first()

    if not order:
        raise ValueError(f"Subscription order not found for reference: {event.order_reference}")

    school = order.school
    sub = getattr(school, 'subscription', None)
    if not sub:
        sub = SchoolSubscription.objects.create(school=school, plan=order.plan, status='trial')

    now = timezone.now()

    # 5. Handle Event Types
    if event.event_type in ('order.paid', 'transaction.completed'):
        # Validate exact amount and currency to prevent tampering
        if event.amount != order.amount or event.currency != order.currency:
            order.status = 'failed'
            order.failure_reason = (
                f"Amount/currency mismatch. Expected {order.amount} {order.currency}, "
                f"received {event.amount} {event.currency}."
            )
            order.provider_event_id = event.event_id
            order.save(update_fields=['status', 'failure_reason', 'provider_event_id', 'updated_at'])

            SubscriptionEvent.objects.create(
                school=school,
                event_type='payment_mismatch_alert',
                from_status=sub.status,
                to_status=sub.status,
                notes=f"CRITICAL: Webhook amount mismatch for order {order.order_number}!",
                metadata={
                    'order_amount': str(order.amount),
                    'event_amount': str(event.amount),
                    'order_currency': order.currency,
                    'event_currency': event.currency,
                    'event_id': event.event_id
                }
            )
            raise ValueError(f"Amount or currency mismatch: {order.amount} {order.currency} != {event.amount} {event.currency}")

        # Mark order paid
        order.status = 'paid'
        order.paid_at = now
        order.paid_on = now.date()
        order.provider_event_id = event.event_id
        order.failure_reason = ''
        order.save(update_fields=['status', 'paid_at', 'paid_on', 'provider_event_id', 'failure_reason', 'updated_at'])

        # Activate or extend subscription
        old_status = sub.status
        base_start = sub.paid_until if (sub.paid_until and sub.paid_until > now) else now
        new_paid_until = add_calendar_months(base_start, order.billing_months)

        sub.plan = order.plan
        sub.status = 'active'
        sub.current_period_start = base_start
        sub.paid_until = new_paid_until
        sub.grace_until = None
        sub.student_count_at_last_invoice = order.student_count
        sub.save(update_fields=['plan', 'status', 'current_period_start', 'paid_until', 'grace_until', 'student_count_at_last_invoice', 'updated_at'])

        SubscriptionEvent.objects.create(
            school=school,
            event_type='order_paid',
            from_status=old_status,
            to_status='active',
            notes=f"Subscription activated via verified card payment ({order.plan.name}, {order.billing_months} months).",
            metadata={
                'order_number': order.order_number,
                'paid_until': str(new_paid_until),
                'amount': str(order.amount),
                'currency': order.currency,
                'event_id': event.event_id,
            }
        )

        invalidate_school_entitlements_cache(school.id)

        return {
            'status': 'paid',
            'order_number': order.order_number,
            'paid_until': new_paid_until.isoformat(),
            'plan': order.plan.code
        }

    elif event.event_type in ('order.failed', 'transaction.canceled'):
        order.status = 'failed'
        order.failure_reason = 'Transaction declined or failed at provider.'
        order.provider_event_id = event.event_id
        order.save(update_fields=['status', 'failure_reason', 'provider_event_id', 'updated_at'])

        SubscriptionEvent.objects.create(
            school=school,
            event_type='order_failed',
            from_status=sub.status,
            to_status=sub.status,
            notes=f"Card payment failed for order {order.order_number}.",
            metadata={'event_id': event.event_id}
        )

        return {
            'status': 'failed',
            'order_number': order.order_number,
            'message': 'Order marked failed'
        }

    elif event.event_type in ('order.refunded', 'adjustment.created'):
        order.status = 'refunded'
        order.refunded_at = now
        order.provider_event_id = event.event_id
        order.save(update_fields=['status', 'refunded_at', 'provider_event_id', 'updated_at'])

        # Adjust subscription: if active on this plan, revoke or downgrade
        old_status = sub.status
        sub.status = 'limited'
        sub.paid_until = now
        sub.save(update_fields=['status', 'paid_until', 'updated_at'])

        SubscriptionEvent.objects.create(
            school=school,
            event_type='order_refunded',
            from_status=old_status,
            to_status='limited',
            notes=f"Order {order.order_number} was refunded. Subscription downgraded to limited read-only.",
            metadata={'event_id': event.event_id}
        )

        invalidate_school_entitlements_cache(school.id)

        return {
            'status': 'refunded',
            'order_number': order.order_number,
            'message': 'Order refunded and subscription downgraded'
        }

    return {
        'status': 'unhandled',
        'event_type': event.event_type,
        'order_number': order.order_number
    }
