"""
Subscription Order Processing, Manual Offline Bank Verification,
Card Payment Workflows, Billing Engine, and Upgrades/Downgrades.
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
    BillingPeriod,
    FeatureCatalog,
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


def calculate_invoice_estimate(plan, billing_months, student_count, currency='USD', school=None, selected_features=None):
    """
    Computes pricing breakdown for a proposed subscription order.
    Periods, discounts, and prices are dynamic DATA in the database, never hardcoded.
    Supports Standard, Premium, and Custom modular packages.
    Formula:
      subtotal = student_count x unit_price x months
      discount_amount = subtotal x (discount_percentage / 100)
      upgrade_credit = unused value of active Standard subscription (if upgrading to Premium)
      total = subtotal - discount_amount - upgrade_credit
    """
    period = BillingPeriod.objects.filter(months=billing_months, is_active=True).first()
    if not period:
        # Fallback to get_active_periods seeding
        active_periods = BillingPeriod.get_active_periods()
        period = next((p for p in active_periods if p.months == billing_months), None)
        if not period:
            raise ValueError(f"Invalid billing period: {billing_months} months.")

    currency = (currency or 'USD').upper()
    if currency not in ('USD', 'PKR'):
        raise ValueError("Currency must be USD or PKR.")

    student_count = max(1, int(student_count or 1))

    if plan.code == 'custom':
        # Modular dynamic pricing for Custom Package:
        # Base platform fee: $0.70 USD / Rs 195 PKR per student per month
        base_rate_usd = Decimal(str(getattr(plan, 'price_usd_per_student', '0.70') or '0.70'))
        base_rate_pkr = Decimal(str(getattr(plan, 'price_pkr_per_student', '195.00') or '195.00'))
        addon_usd = Decimal('0.00')
        addon_pkr = Decimal('0.00')

        if selected_features:
            cat_map = {f.key: f for f in FeatureCatalog.objects.filter(key__in=selected_features)}
            for key in selected_features:
                cat = cat_map.get(key)
                if cat:
                    if cat.is_premium_only:
                        addon_usd += Decimal('0.05')
                        addon_pkr += Decimal('15.00')
                    else:
                        addon_usd += Decimal('0.02')
                        addon_pkr += Decimal('5.00')

        unit_price = (base_rate_usd + addon_usd if currency == 'USD' else base_rate_pkr + addon_pkr).quantize(Decimal('0.01'))
    else:
        unit_price = plan.price_usd_per_student if currency == 'USD' else plan.price_pkr_per_student

    subtotal = (Decimal(student_count) * unit_price * Decimal(billing_months)).quantize(Decimal('0.01'))
    discount_percentage = period.discount_percentage
    discount_amount = (subtotal * (discount_percentage / Decimal('100.00'))).quantize(Decimal('0.01'))

    # Package charges are calculated on full payable price.
    # Package changes / refunds are handled via the 2-day plan adjustment policy.
    upgrade_credit_amount = Decimal('0.00')
    tax_amount = Decimal('0.00')
    payable_amount = max(Decimal('0.00'), subtotal - discount_amount).quantize(Decimal('0.01'))

    return {
        'plan_code': plan.code,
        'plan_name': plan.name,
        'billing_months': billing_months,
        'student_count': student_count,
        'currency': currency,
        'unit_price': unit_price,
        'subtotal': subtotal,
        'discount_percentage': discount_percentage,
        'discount_amount': discount_amount,
        'upgrade_credit_amount': upgrade_credit_amount,
        'tax_amount': tax_amount,
        'payable_amount': payable_amount,
        'selected_features': selected_features or [],
        'selected_features_count': len(selected_features) if selected_features else 0,
    }


def provision_school_registration_subscription(school, admin_user, plan_slug=None):
    """
    Initializes a new school's subscription upon institution registration.
    If a plan is selected (e.g. standard or premium), provisions a 30-day trial period
    for that plan; otherwise defaults to a 30-Day Free Trial.
    """
    now = timezone.now()
    trial_period_end = now + timedelta(days=30)

    target_plan = None
    plan_code = (plan_slug or '').strip().lower()
    if plan_code in ('standard', 'premium', 'custom'):
        target_plan = Plan.objects.filter(code=plan_code).first()

    status = 'active' if target_plan else 'trial'
    plan_display = target_plan.name if target_plan else '30-Day Free Trial'

    sub, _ = SchoolSubscription.objects.update_or_create(
        school=school,
        defaults={
            'plan': target_plan,
            'status': status,
            'current_period_start': now,
            'paid_until': trial_period_end,
            'grace_until': None,
            'student_count_at_last_invoice': get_active_enrolled_student_count(school),
        }
    )

    admin_name = (admin_user.get_full_name() or admin_user.username) if admin_user else 'Administrator'
    admin_email = admin_user.email if admin_user else ''

    SubscriptionEvent.objects.create(
        school=school,
        event_type='status_changed',
        from_status='',
        to_status=status,
        from_plan='',
        to_plan=plan_display,
        actor=admin_user,
        notes=f"Institution registered by {admin_name} ({admin_email}) on {plan_display}.",
        metadata={
            'admin_id': admin_user.id if admin_user else None,
            'admin_username': admin_user.username if admin_user else '',
            'admin_email': admin_email,
            'plan_code': target_plan.code if target_plan else 'trial',
            'plan_name': plan_display,
            'trial_days': 30,
        }
    )
    invalidate_school_entitlements_cache(school.id)
    return sub



def create_subscription_order(school, plan, billing_months, payment_reference, paid_on,
                              amount, currency='USD', notes='', submitted_by=None,
                              selected_features=None, custom_student_count=None):
    """
    Submits an offline payment verification order.
    """
    now = timezone.now()
    if custom_student_count:
        active_students = int(custom_student_count)
    else:
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

    estimate = calculate_invoice_estimate(
        plan=plan,
        billing_months=billing_months,
        student_count=active_students,
        currency=currency,
        school=school,
        selected_features=selected_features
    )

    order_number = f"ORD-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
    period_start = now.date()
    period_end = add_calendar_months(now, billing_months).date()

    order = SubscriptionOrder.objects.create(
        order_number=order_number,
        school=school,
        plan=plan,
        billing_months=billing_months,
        student_count=active_students,
        unit_price=estimate['unit_price'],
        subtotal=estimate['subtotal'],
        discount_percentage=estimate['discount_percentage'],
        discount_amount=estimate['discount_amount'],
        upgrade_credit_amount=estimate['upgrade_credit_amount'],
        tax_amount=estimate['tax_amount'],
        amount=Decimal(str(amount)).quantize(Decimal('0.01')),
        currency=currency.upper(),
        period_start=period_start,
        period_end=period_end,
        payment_reference=str(payment_reference).strip(),
        paid_on=paid_on,
        payment_notes=str(notes).strip(),
        metadata={
            'custom_features': selected_features or [],
            'is_custom': plan.code == 'custom',
        },
        status='pending',
        submitted_by=submitted_by,
    )

    SubscriptionEvent.objects.create(
        school=school,
        event_type='order_submitted',
        from_status=getattr(getattr(school, 'subscription', None), 'status', 'no_plan'),
        to_status='pending',
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
    order.paid_at = now
    order.paid_on = now.date()
    order.review_note = str(review_note).strip()
    order.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'paid_at', 'paid_on', 'review_note', 'updated_at'])

    school = order.school
    sub = getattr(school, 'subscription', None)
    if not sub:
        sub = SchoolSubscription.objects.create(school=school, plan=order.plan, status='active')

    old_status = sub.status
    old_plan = sub.plan.code if sub.plan else 'none'

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
    sub.pending_downgrade_to_plan = None
    sub.student_count_at_last_invoice = order.student_count
    sub.save()

    # Synchronize feature overrides for custom packages or clear for standard/premium
    if order.plan.code == 'custom' or (order.metadata and order.metadata.get('custom_features')):
        chosen_features = set(order.metadata.get('custom_features') or [])
        all_catalog = FeatureCatalog.objects.all()
        for feat in all_catalog:
            is_granted = feat.key in chosen_features
            SchoolFeatureOverride.objects.update_or_create(
                school=school,
                feature_key=feat.key,
                defaults={'is_granted': is_granted, 'expires_at': new_paid_until}
            )
    else:
        SchoolFeatureOverride.objects.filter(school=school).delete()

    event_type = 'upgraded' if old_plan == 'standard' and order.plan.code == 'premium' else 'order_approved'
    SubscriptionEvent.objects.create(
        school=school,
        event_type=event_type,
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

    # Also synchronize organisation-level subscription if present
    if getattr(school, 'organisation', None):
        try:
            from core.models import OrganisationSubscription, PlatformPlan
            org_sub = OrganisationSubscription.objects.filter(organisation=school.organisation).first()
            if org_sub:
                org_sub.status = 'active'
                plat_plan = PlatformPlan.objects.filter(name__icontains=order.plan.code).first()
                if plat_plan:
                    org_sub.plan = plat_plan
                org_sub.renewal_date = new_paid_until.date()
                org_sub.save()
        except Exception:
            pass

    admins = User.objects.filter(
        school=school,
        role__in=['owner', 'organisation_admin', 'school_admin'],
        is_active=True
    )
    for admin in admins:
        Notification.objects.create(
            user=admin,
            title=f"Payment Approved — {order.plan.name} Activated",
            body=f"Your payment for order #{order.order_number} has been verified. Your subscription is active until {new_paid_until.date()}."
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
    SubscriptionEvent.objects.create(
        school=school,
        event_type='order_rejected',
        actor=reviewer,
        notes=f"Order #{order.order_number} rejected. Reason: {review_note.strip()}",
        metadata={'order_id': order.id, 'order_number': order.order_number}
    )

    admins = User.objects.filter(
        school=school,
        role__in=['owner', 'organisation_admin', 'school_admin'],
        is_active=True
    )
    for admin in admins:
        Notification.objects.create(
            user=admin,
            title="Subscription Payment Not Approved",
            body=f"Your payment order #{order.order_number} could not be verified. Note: {review_note.strip()}"
        )

    invalidate_school_entitlements_cache(school.id)
    return order


def schedule_subscription_downgrade(school, target_plan, actor=None, reason=''):
    """
    Schedules a downgrade from Premium to Standard taking effect at the end of the paid period.
    Full Premium access remains intact until paid_until.
    No data is ever deleted.
    """
    sub = getattr(school, 'subscription', None)
    if not sub or sub.status != 'active':
        raise ValueError("An active subscription is required to schedule a downgrade.")

    if not target_plan or target_plan.code != 'standard':
        raise ValueError("Downgrades can only be scheduled to the Standard plan.")

    sub.pending_downgrade_to_plan = target_plan
    sub.save(update_fields=['pending_downgrade_to_plan', 'updated_at'])

    SubscriptionEvent.objects.create(
        school=school,
        event_type='downgrade_scheduled',
        from_plan=sub.plan.code if sub.plan else 'premium',
        to_plan=target_plan.code,
        actor=actor,
        notes=f"Downgrade to {target_plan.name} scheduled for end of paid period ({sub.paid_until.date() if sub.paid_until else 'N/A'}). {reason}".strip(),
        metadata={
            'target_plan': target_plan.code,
            'effective_date': str(sub.paid_until.date() if sub.paid_until else None),
        }
    )

    invalidate_school_entitlements_cache(school.id)
    return sub


def create_card_subscription_order(school, plan, billing_months, return_url, cancel_url,
                                   currency='USD', submitted_by=None, provider_name=None,
                                   selected_features=None, custom_student_count=None):
    """
    Initiates a hosted card payment checkout session.
    Amounts are computed on the server from the database, never taken from the browser.
    Card details NEVER touch our frontend, backend, database or logs.
    """
    now = timezone.now()
    if custom_student_count:
        active_students = int(custom_student_count)
    else:
        active_students = get_active_enrolled_student_count(school)

    estimate = calculate_invoice_estimate(
        plan=plan,
        billing_months=billing_months,
        student_count=active_students,
        currency=currency,
        school=school,
        selected_features=selected_features
    )

    order_number = f"ORD-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"
    provider = get_payment_provider(provider_name)
    resolved_provider_name = getattr(provider, 'provider_name', provider_name or getattr(settings, 'PAYMENT_PROVIDER', 'fake'))

    period_start = now.date()
    period_end = add_calendar_months(now, billing_months).date()

    order = SubscriptionOrder.objects.create(
        order_number=order_number,
        school=school,
        plan=plan,
        billing_months=billing_months,
        student_count=active_students,
        unit_price=estimate['unit_price'],
        subtotal=estimate['subtotal'],
        discount_percentage=estimate['discount_percentage'],
        discount_amount=estimate['discount_amount'],
        upgrade_credit_amount=estimate['upgrade_credit_amount'],
        tax_amount=estimate['tax_amount'],
        amount=estimate['payable_amount'],
        currency=currency.upper(),
        period_start=period_start,
        period_end=period_end,
        provider=resolved_provider_name,
        metadata={
            'custom_features': selected_features or [],
            'is_custom': plan.code == 'custom',
        },
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
        event_type='order_submitted',
        from_status=getattr(getattr(school, 'subscription', None), 'status', 'no_plan'),
        to_status='pending',
        actor=submitted_by,
        notes=f"Card checkout initiated for {order.plan.name} ({order.billing_months} mo, {order.amount} {order.currency}).",
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
    - Upgrades school to active tier automatically only upon verified payment.
    - Downgrades on refund/chargeback.
    """
    provider = get_payment_provider(provider_name)

    # 1. Cryptographic signature check
    if not provider.verify_webhook(payload_bytes, headers):
        raise WebhookSignatureVerificationError("Invalid or forged webhook signature.")

    # 2. Parse event DTO
    event = provider.parse_event(payload_bytes, headers)

    # 3. Idempotency / Replay protection check
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
        sub = SchoolSubscription.objects.create(school=school, plan=order.plan, status='no_plan')

    now = timezone.now()

    # 5. Handle Event Types
    if event.event_type in ('order.paid', 'transaction.completed'):
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

        # Mark order paid and record card info if provided
        order.status = 'paid'
        order.paid_at = now
        order.paid_on = now.date()
        order.provider_event_id = event.event_id
        order.failure_reason = ''
        if not order.card_brand:
            order.card_brand = getattr(event, 'card_brand', '') or 'Visa'
        if not order.card_last4:
            order.card_last4 = getattr(event, 'card_last4', '') or '4242'
        order.save(update_fields=['status', 'paid_at', 'paid_on', 'provider_event_id', 'failure_reason', 'card_brand', 'card_last4', 'updated_at'])

        # Activate or extend subscription
        old_status = sub.status
        old_plan = sub.plan.code if sub.plan else 'none'
        base_start = sub.paid_until if (sub.paid_until and sub.paid_until > now) else now
        new_paid_until = add_calendar_months(base_start, order.billing_months)

        order.period_start = base_start.date()
        order.period_end = new_paid_until.date()
        order.save(update_fields=['period_start', 'period_end'])

        sub.plan = order.plan
        sub.status = 'active'
        sub.current_period_start = base_start
        sub.paid_until = new_paid_until
        sub.grace_until = None
        sub.pending_downgrade_to_plan = None
        sub.student_count_at_last_invoice = order.student_count
        sub.save(update_fields=['plan', 'status', 'current_period_start', 'paid_until', 'grace_until', 'pending_downgrade_to_plan', 'student_count_at_last_invoice', 'updated_at'])

        # Synchronize custom feature overrides
        if order.plan.code == 'custom' or (order.metadata and order.metadata.get('custom_features')):
            chosen_features = set(order.metadata.get('custom_features') or [])
            all_catalog = FeatureCatalog.objects.all()
            for feat in all_catalog:
                is_granted = feat.key in chosen_features
                SchoolFeatureOverride.objects.update_or_create(
                    school=school,
                    feature_key=feat.key,
                    defaults={'is_granted': is_granted, 'expires_at': new_paid_until}
                )
        else:
            SchoolFeatureOverride.objects.filter(school=school).delete()

        event_type = 'upgraded' if old_plan == 'standard' and order.plan.code == 'premium' else 'order_approved'
        SubscriptionEvent.objects.create(
            school=school,
            event_type=event_type,
            from_status=old_status,
            to_status='active',
            from_plan=old_plan,
            to_plan=order.plan.code,
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
            event_type='order_rejected',
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

        old_status = sub.status
        sub.status = 'no_plan'
        sub.paid_until = now
        sub.save(update_fields=['status', 'paid_until', 'updated_at'])

        SubscriptionEvent.objects.create(
            school=school,
            event_type='downgraded',
            from_status=old_status,
            to_status='no_plan',
            notes=f"Order {order.order_number} was refunded. Subscription returned to no_plan mode.",
            metadata={'event_id': event.event_id}
        )

        invalidate_school_entitlements_cache(school.id)

        return {
            'status': 'refunded',
            'order_number': order.order_number,
            'message': 'Order refunded and subscription set to no_plan'
        }

    return {
        'status': 'unhandled',
        'event_type': event.event_type,
        'order_number': order.order_number
    }
