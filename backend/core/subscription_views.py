"""
Views and API Endpoints for Subscriptions, Offline Invoicing, Card Payments,
Entitlements Inspection, and Platform Admin Billing Management.
"""
import logging
from decimal import Decimal
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from core.models import (
    School,
    User,
    Plan,
    PlanFeature,
    FeatureCatalog,
    PlatformBillingSettings,
    SchoolSubscription,
    SubscriptionOrder,
    SchoolFeatureOverride,
    SubscriptionEvent,
)
from core.services.entitlements import (
    get_school_entitlements,
    get_effective_subscription_status,
    get_active_enrolled_student_count,
    invalidate_school_entitlements_cache,
)
from core.services.subscriptions import (
    calculate_invoice_estimate,
    create_subscription_order,
    create_card_subscription_order,
    process_payment_webhook,
    approve_subscription_order,
    reject_subscription_order,
    extend_school_trial,
)
from core.services.payments import WebhookSignatureVerificationError

logger = logging.getLogger('core.subscription_views')


def _is_platform_admin(user):
    """Checks whether the user holds platform administrator authority."""
    return bool(user and user.is_authenticated and (
        user.is_superuser or user.role in ('platform_admin', 'owner') or (user.is_staff and not user.school_id)
    ))


# ==============================================================================
# 1. Public Pricing & Information Endpoints (Unauthenticated)
# ==============================================================================

@api_view(['GET'])
@permission_classes([AllowAny])
def public_pricing_view(request):
    """
    Public pricing table endpoint.
    Returns active plans, rates (USD and PKR), and feature breakdown directly from database.
    Prices are data-driven, never hardcoded.
    """
    settings = PlatformBillingSettings.get_settings()
    plans = Plan.objects.filter(is_active=True).prefetch_related('plan_features').order_by('display_order', 'id')
    catalog = FeatureCatalog.objects.all().order_by('display_order', 'key')

    plans_data = []
    for p in plans:
        feature_keys = set(p.plan_features.filter(is_included=True).values_list('feature_key', flat=True))
        plans_data.append({
            'code': p.code,
            'name': p.name,
            'name_ur': p.name_ur,
            'tagline': p.tagline,
            'tagline_ur': p.tagline_ur,
            'description': p.description,
            'description_ur': p.description_ur,
            'price_usd_per_student': str(p.price_usd_per_student),
            'price_pkr_per_student': str(p.price_pkr_per_student),
            'display_order': p.display_order,
            'included_feature_keys': sorted(list(feature_keys)),
        })

    features_data = [{
        'key': f.key,
        'name': f.name,
        'name_ur': f.name_ur,
        'description': f.description,
        'description_ur': f.description_ur,
        'category': f.category,
        'status': f.status,
        'is_premium_only': f.is_premium_only,
    } for f in catalog]

    return Response({
        'plans': plans_data,
        'features': features_data,
        'trial_days': settings.default_trial_days,
        'yearly_discount_percentage': str(settings.yearly_discount_percentage),
        'exchange_rate_note_en': settings.exchange_rate_note_en,
        'exchange_rate_note_ur': settings.exchange_rate_note_ur,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def public_billing_info_view(request):
    """
    Public metadata for platform trial policies and offline bank transfer notice.
    """
    settings = PlatformBillingSettings.get_settings()
    return Response({
        'trial_days': settings.default_trial_days,
        'pending_grace_days': settings.pending_grace_days,
        'past_due_grace_days': settings.past_due_grace_days,
        'yearly_discount_percentage': str(settings.yearly_discount_percentage),
        'trial_text_en': f"Experience the full platform with a complimentary {settings.default_trial_days}-day Premium trial. No upfront payment required.",
        'trial_text_ur': f"تمام جدید خصوصیات کے ساتھ {settings.default_trial_days} روزہ اعزازی پریمیم ٹرائل حاصل کریں۔ بغیر کسی پیشگی ادائیگی کے۔",
        'exchange_rate_note_en': settings.exchange_rate_note_en,
        'exchange_rate_note_ur': settings.exchange_rate_note_ur,
    })


# ==============================================================================
# 2. School Tenant Billing Endpoints
# ==============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_subscription_current_view(request):
    """
    Returns current subscription status, plan details, paid dates, and active student headcount.
    """
    school = request.user.school
    if not school:
        raise PermissionDenied("User is not associated with an educational institution.")

    entitlements = get_school_entitlements(school)
    sub = SchoolSubscription.objects.filter(school=school).select_related('plan').first()
    plan_obj = sub.plan if (sub and sub.plan) else Plan.objects.filter(code='standard').first()

    plan_info = None
    if plan_obj:
        plan_info = {
            'code': plan_obj.code,
            'name': plan_obj.name,
            'name_ur': plan_obj.name_ur,
            'tagline': plan_obj.tagline,
            'tagline_ur': plan_obj.tagline_ur,
            'price_usd_per_student': str(plan_obj.price_usd_per_student),
            'price_pkr_per_student': str(plan_obj.price_pkr_per_student),
        }

    return Response({
        'school_id': school.id,
        'school_name': school.name,
        'status': entitlements['status'],
        'plan': plan_info,
        'effective_tier': entitlements['effective_tier'],
        'is_limited': entitlements['is_limited'],
        'is_suspended': entitlements['is_suspended'],
        'is_write_allowed': entitlements['is_write_allowed'],
        'active_students': entitlements['active_students'],
        'student_count_at_last_invoice': entitlements['student_count_at_last_invoice'],
        'has_student_growth': entitlements['has_student_growth'],
        'trial_started_at': entitlements['trial_started_at'],
        'trial_ends_at': entitlements['trial_ends_at'],
        'trial_days_remaining': entitlements['trial_days_remaining'],
        'current_period_start': sub.current_period_start.isoformat() if (sub and sub.current_period_start) else None,
        'paid_until': entitlements['paid_until'],
        'grace_until': entitlements['grace_until'],
        'grace_days_remaining': entitlements['grace_days_remaining'],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_entitlements_view(request):
    """
    Authoritative server-side feature entitlements check for the school.
    Consumed by the frontend to render feature lock screens and badges.
    """
    school = request.user.school
    if not school:
        # Platform admin or superuser without school
        return Response(get_school_entitlements(None))

    data = get_school_entitlements(school)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_invoice_estimate_view(request):
    """
    Computes real-time invoice estimate for school based on active enrolled student headcount.
    Query parameters: plan (e.g. 'premium'), months (1, 3, 6, 12), currency ('USD' or 'PKR').
    """
    school = request.user.school
    if not school:
        raise PermissionDenied("User is not associated with an educational institution.")

    plan_code = request.query_params.get('plan', 'standard')
    months = int(request.query_params.get('months', 1))
    currency = request.query_params.get('currency', 'USD').upper()

    plan = Plan.objects.filter(code=plan_code, is_active=True).first()
    if not plan:
        return Response({'detail': f"Plan '{plan_code}' not found."}, status=status.HTTP_404_NOT_FOUND)

    active_students = get_active_enrolled_student_count(school)
    try:
        estimate = calculate_invoice_estimate(
            plan=plan,
            billing_months=months,
            student_count=active_students,
            currency=currency
        )
    except ValueError as err:
        return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        **estimate,
        'unit_price': str(estimate['unit_price']),
        'discount_percentage': str(estimate['discount_percentage']),
        'gross_amount': str(estimate['gross_amount']),
        'discount_amount': str(estimate['discount_amount']),
        'payable_amount': str(estimate['payable_amount']),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_bank_details_view(request):
    """
    Returns platform offline bank deposit details for printable invoice/challan generation.
    Bank details are retrieved strictly from database configuration.
    """
    settings = PlatformBillingSettings.get_settings()
    return Response({
        'bank_name': settings.bank_name,
        'account_title': settings.account_title,
        'account_number': settings.account_number,
        'iban': settings.iban,
        'branch_code': settings.branch_code,
        'swift_bic': settings.swift_bic,
        'payment_instructions_en': settings.payment_instructions_en,
        'payment_instructions_ur': settings.payment_instructions_ur,
        'exchange_rate_note_en': settings.exchange_rate_note_en,
        'exchange_rate_note_ur': settings.exchange_rate_note_ur,
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def school_subscription_orders_view(request):
    """
    GET: Lists historical and pending payment orders for this school.
    POST: Submits an offline bank deposit payment verification order.
    """
    school = request.user.school
    if not school:
        raise PermissionDenied("User is not associated with an educational institution.")

    if request.method == 'GET':
        orders = SubscriptionOrder.objects.filter(school=school).select_related('plan', 'reviewed_by').order_by('-created_at')
        results = [{
            'id': o.id,
            'order_number': o.order_number,
            'plan_code': o.plan.code,
            'plan_name': o.plan.name,
            'billing_months': o.billing_months,
            'student_count': o.student_count,
            'unit_price': str(o.unit_price),
            'discount_percentage': str(o.discount_percentage),
            'amount': str(o.amount),
            'currency': o.currency,
            'payment_reference': o.payment_reference,
            'paid_on': o.paid_on.isoformat() if hasattr(o.paid_on, 'isoformat') else str(o.paid_on),
            'payment_notes': o.payment_notes,
            'status': o.status,
            'reviewed_at': o.reviewed_at.isoformat() if o.reviewed_at else None,
            'review_note': o.review_note,
            'created_at': o.created_at.isoformat(),
        } for o in orders]
        return Response({'results': results})

    # POST: Submit new order (Card hosted checkout OR offline bank deposit)
    if request.user.role not in ('owner', 'organisation_admin', 'school_admin'):
        raise PermissionDenied("Only school administrators can submit subscription orders.")

    data = request.data or {}
    plan_code = data.get('plan_code') or data.get('plan')
    billing_months = data.get('billing_months') or data.get('months')
    payment_method = (data.get('payment_method') or '').lower()
    currency = (data.get('currency') or 'USD').upper()

    payment_reference = data.get('payment_reference') or data.get('reference')
    paid_on = data.get('paid_on') or data.get('payment_date')
    amount = data.get('amount')
    notes = data.get('payment_notes') or data.get('notes') or ''

    if not plan_code or not billing_months:
        return Response({
            'detail': 'plan_code and billing_months are required.'
        }, status=status.HTTP_400_BAD_REQUEST)

    plan = Plan.objects.filter(code=plan_code, is_active=True).first()
    if not plan:
        return Response({'detail': f"Plan '{plan_code}' is not recognized or active."}, status=status.HTTP_404_NOT_FOUND)

    try:
        months_int = int(billing_months)
    except (ValueError, TypeError):
        return Response({'detail': 'billing_months must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

    # Branch A: Card payment (Hosted Checkout: Paddle / FakeProvider)
    # Default payment method is 'card' unless an offline payment_reference is explicitly supplied
    is_card = (payment_method == 'card') or (payment_method != 'offline' and not payment_reference)

    if is_card:
        return_url = data.get('return_url') or f"{settings.FRONTEND_BASE_URL}/billing?order_complete=1"
        cancel_url = data.get('cancel_url') or f"{settings.FRONTEND_BASE_URL}/billing?order_cancelled=1"
        provider_name = data.get('provider')

        try:
            order = create_card_subscription_order(
                school=school,
                plan=plan,
                billing_months=months_int,
                return_url=return_url,
                cancel_url=cancel_url,
                currency=currency,
                submitted_by=request.user,
                provider_name=provider_name,
            )
        except ValueError as err:
            return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f"Order #{order.order_number} initiated. Redirect to provider to complete payment.",
            'order': {
                'id': order.id,
                'order_number': order.order_number,
                'status': order.status,
                'amount': str(order.amount),
                'currency': order.currency,
                'billing_months': order.billing_months,
                'student_count': order.student_count,
                'provider': order.provider,
                'checkout_url': order.checkout_url,
                'created_at': order.created_at.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)

    # Branch B: Offline Bank Deposit Workflow
    if not payment_reference or not paid_on or amount is None:
        return Response({
            'detail': 'For offline orders: payment_reference, paid_on, and amount are required.'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        order = create_subscription_order(
            school=school,
            plan=plan,
            billing_months=months_int,
            payment_reference=payment_reference,
            paid_on=paid_on,
            amount=amount,
            currency=currency,
            notes=notes,
            submitted_by=request.user,
        )
    except ValueError as err:
        return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'message': f"Order #{order.order_number} submitted successfully and is pending review.",
        'order': {
            'id': order.id,
            'order_number': order.order_number,
            'status': order.status,
            'amount': str(order.amount),
            'currency': order.currency,
            'billing_months': order.billing_months,
            'payment_reference': order.payment_reference,
            'paid_on': order.paid_on.isoformat() if hasattr(order.paid_on, 'isoformat') else str(order.paid_on),
        }
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def subscription_payment_webhook_view(request):
    """
    Public webhook receiver for payment provider notifications (Paddle Billing, FakeProvider, etc.).
    Cryptographically verifies signatures using the provider secret.
    Rejects bad signatures with 400.
    Rejects tampered amounts with 400.
    Guarantees idempotent processing (duplicate event returns 200 without double-activation).
    """
    raw_payload = request.body
    headers = {k: v for k, v in request.headers.items()}
    for k, v in request.META.items():
        if isinstance(v, str):
            headers[k] = v

    provider_param = request.query_params.get('provider')

    try:
        result = process_payment_webhook(raw_payload, headers, provider_name=provider_param)
        return Response(result, status=status.HTTP_200_OK)
    except WebhookSignatureVerificationError as sig_err:
        logger.warning("Webhook signature verification failed: %s", str(sig_err))
        return Response({'detail': 'Invalid or unverified webhook signature.'}, status=status.HTTP_400_BAD_REQUEST)
    except ValueError as val_err:
        logger.warning("Webhook processing error: %s", str(val_err))
        return Response({'detail': str(val_err)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        logger.error("Unexpected error in payment webhook: %s", str(exc), exc_info=True)
        return Response({'detail': 'Webhook processing error.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_order_receipt_view(request, pk):
    """
    School-scoped endpoint returning printable receipt / invoice details for a completed or approved order.
    """
    school = getattr(request.user, 'school', None)
    if not school and getattr(request.user, 'organisation_id', None):
        school = School.objects.filter(organisation=request.user.organisation).first()

    if not school and not request.user.is_superuser:
        raise PermissionDenied("A school affiliation is required to view order receipts.")

    qs = SubscriptionOrder.objects.all() if request.user.is_superuser else SubscriptionOrder.objects.filter(school=school)
    order = qs.filter(pk=pk).select_related('school', 'plan').first()
    if not order:
        raise NotFound("Subscription order not found.")

    settings_obj = PlatformBillingSettings.get_settings()

    receipt_data = {
        'receipt_number': f"REC-{order.order_number}",
        'order_number': order.order_number,
        'school_name': order.school.name,
        'school_code': order.school.code,
        'plan_name': order.plan.name,
        'plan_code': order.plan.code,
        'billing_months': order.billing_months,
        'student_count': order.student_count,
        'unit_price': str(order.unit_price),
        'discount_percentage': str(order.discount_percentage),
        'amount': str(order.amount),
        'currency': order.currency,
        'status': order.status,
        'provider': order.provider,
        'provider_reference': order.provider_reference,
        'payment_reference': order.payment_reference,
        'paid_at': order.paid_at.isoformat() if order.paid_at else (order.paid_on.isoformat() if order.paid_on else None),
        'created_at': order.created_at.isoformat(),
        'platform_merchant': {
            'name': 'OPTIMUS ORIEN EdTech Platform',
            'support_email': 'billing@optimusorien.com',
            'tax_note': 'Merchant of Record handles all applicable global sales tax/VAT.' if order.provider in ('paddle', 'fake') else settings_obj.exchange_rate_note_en
        }
    }
    return Response(receipt_data)


# ==============================================================================
# 3. Platform Admin Management Endpoints
# ==============================================================================

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def platform_admin_billing_settings_view(request):
    """
    Platform admin endpoint to inspect or update platform billing bank credentials,
    trial days, grace periods, and yearly discounts.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    settings = PlatformBillingSettings.get_settings()

    if request.method == 'GET':
        return Response({
            'bank_name': settings.bank_name,
            'account_title': settings.account_title,
            'account_number': settings.account_number,
            'iban': settings.iban,
            'branch_code': settings.branch_code,
            'swift_bic': settings.swift_bic,
            'payment_instructions_en': settings.payment_instructions_en,
            'payment_instructions_ur': settings.payment_instructions_ur,
            'default_trial_days': settings.default_trial_days,
            'pending_grace_days': settings.pending_grace_days,
            'past_due_grace_days': settings.past_due_grace_days,
            'yearly_discount_percentage': str(settings.yearly_discount_percentage),
            'exchange_rate_note_en': settings.exchange_rate_note_en,
            'exchange_rate_note_ur': settings.exchange_rate_note_ur,
            'updated_at': settings.updated_at.isoformat() if settings.updated_at else None,
        })

    # PUT: Update settings
    data = request.data or {}
    fields = [
        'bank_name', 'account_title', 'account_number', 'iban',
        'branch_code', 'swift_bic', 'payment_instructions_en',
        'payment_instructions_ur', 'exchange_rate_note_en', 'exchange_rate_note_ur'
    ]
    for f in fields:
        if f in data:
            setattr(settings, f, str(data[f]).strip())

    if 'default_trial_days' in data:
        settings.default_trial_days = max(1, int(data['default_trial_days']))
    if 'pending_grace_days' in data:
        settings.pending_grace_days = max(0, int(data['pending_grace_days']))
    if 'past_due_grace_days' in data:
        settings.past_due_grace_days = max(0, int(data['past_due_grace_days']))
    if 'yearly_discount_percentage' in data:
        settings.yearly_discount_percentage = Decimal(str(data['yearly_discount_percentage'])).quantize(Decimal('0.01'))

    settings.updated_by = request.user
    settings.save()
    return Response({'message': 'Platform billing settings updated successfully.'})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def platform_admin_plans_view(request):
    """
    Platform admin endpoint to list or create subscription plans.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    if request.method == 'GET':
        plans = Plan.objects.all().order_by('display_order', 'id')
        results = [{
            'id': p.id,
            'code': p.code,
            'name': p.name,
            'name_ur': p.name_ur,
            'tagline': p.tagline,
            'tagline_ur': p.tagline_ur,
            'description': p.description,
            'description_ur': p.description_ur,
            'price_usd_per_student': str(p.price_usd_per_student),
            'price_pkr_per_student': str(p.price_pkr_per_student),
            'is_active': p.is_active,
            'display_order': p.display_order,
        } for p in plans]
        return Response({'results': results})

    # POST: Create plan
    data = request.data or {}
    code = str(data.get('code', '')).strip().lower()
    name = str(data.get('name', '')).strip()
    if not code or not name:
        return Response({'detail': 'code and name are required.'}, status=status.HTTP_400_BAD_REQUEST)

    if Plan.objects.filter(code=code).exists():
        return Response({'detail': f"Plan with code '{code}' already exists."}, status=status.HTTP_400_BAD_REQUEST)

    plan = Plan.objects.create(
        code=code,
        name=name,
        name_ur=str(data.get('name_ur', '')).strip(),
        tagline=str(data.get('tagline', '')).strip(),
        tagline_ur=str(data.get('tagline_ur', '')).strip(),
        description=str(data.get('description', '')).strip(),
        description_ur=str(data.get('description_ur', '')).strip(),
        price_usd_per_student=Decimal(str(data.get('price_usd_per_student', '0.00'))),
        price_pkr_per_student=Decimal(str(data.get('price_pkr_per_student', '0.00'))),
        is_active=bool(data.get('is_active', True)),
        display_order=int(data.get('display_order', 0)),
    )
    return Response({'id': plan.id, 'code': plan.code, 'name': plan.name}, status=status.HTTP_201_CREATED)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def platform_admin_plan_detail_view(request, pk):
    """
    Platform admin endpoint to edit an existing plan, its USD/PKR pricing, and texts.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    plan = get_object_or_404(Plan, pk=pk)
    data = request.data or {}

    for field in ('name', 'name_ur', 'tagline', 'tagline_ur', 'description', 'description_ur'):
        if field in data:
            setattr(plan, field, str(data[field]).strip())

    if 'price_usd_per_student' in data:
        plan.price_usd_per_student = Decimal(str(data['price_usd_per_student'])).quantize(Decimal('0.01'))
    if 'price_pkr_per_student' in data:
        plan.price_pkr_per_student = Decimal(str(data['price_pkr_per_student'])).quantize(Decimal('0.01'))
    if 'is_active' in data:
        plan.is_active = bool(data['is_active'])
    if 'display_order' in data:
        plan.display_order = int(data['display_order'])

    plan.save()
    return Response({'message': f"Plan '{plan.code}' updated successfully."})


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def platform_admin_features_view(request):
    """
    Platform admin endpoint to list or update feature catalog items.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    if request.method == 'GET':
        features = FeatureCatalog.objects.all().order_by('display_order', 'key')
        results = [{
            'key': f.key,
            'name': f.name,
            'name_ur': f.name_ur,
            'description': f.description,
            'description_ur': f.description_ur,
            'category': f.category,
            'status': f.status,
            'is_premium_only': f.is_premium_only,
            'display_order': f.display_order,
        } for f in features]
        return Response({'results': results})

    # PUT: Update a feature
    data = request.data or {}
    key = data.get('key')
    feat = get_object_or_404(FeatureCatalog, key=key)

    if 'name' in data:
        feat.name = str(data['name']).strip()
    if 'name_ur' in data:
        feat.name_ur = str(data['name_ur']).strip()
    if 'status' in data:
        if data['status'] in ('available', 'beta', 'coming_soon'):
            feat.status = data['status']
    if 'is_premium_only' in data:
        feat.is_premium_only = bool(data['is_premium_only'])

    feat.save()
    return Response({'message': f"Feature '{feat.key}' updated successfully."})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_schools_view(request):
    """
    Platform admin roster of all tenant schools with subscription tier, status,
    trial/paid dates, active student headcount, and flagged student growth.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    schools = School.objects.select_related('subscription__plan', 'organisation').order_by('name')
    results = []

    for s in schools:
        sub = getattr(s, 'subscription', None)
        active_count = get_active_enrolled_student_count(s)
        invoiced_count = sub.student_count_at_last_invoice if sub else 0
        has_growth = active_count > invoiced_count

        results.append({
            'school_id': s.id,
            'school_name': s.name,
            'school_code': s.code,
            'organisation_name': s.organisation.name if s.organisation else None,
            'plan_code': sub.plan.code if (sub and sub.plan) else 'standard',
            'plan_name': sub.plan.name if (sub and sub.plan) else 'Standard Plan',
            'status': sub.status if sub else 'trial',
            'trial_ends_at': sub.trial_ends_at.isoformat() if (sub and sub.trial_ends_at) else None,
            'paid_until': sub.paid_until.isoformat() if (sub and sub.paid_until) else None,
            'grace_until': sub.grace_until.isoformat() if (sub and sub.grace_until) else None,
            'active_students': active_count,
            'student_count_at_last_invoice': invoiced_count,
            'has_student_growth': has_growth,
            'growth_count': max(0, active_count - invoiced_count),
        })

    return Response({'results': results})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_orders_view(request):
    """
    Platform admin review queue of pending and historical offline subscription orders.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    status_filter = request.query_params.get('status')
    qs = SubscriptionOrder.objects.select_related('school', 'plan', 'submitted_by', 'reviewed_by').order_by('-created_at')
    if status_filter:
        qs = qs.filter(status=status_filter)

    results = [{
        'id': o.id,
        'order_number': o.order_number,
        'school_id': o.school.id,
        'school_name': o.school.name,
        'plan_code': o.plan.code,
        'plan_name': o.plan.name,
        'billing_months': o.billing_months,
        'student_count': o.student_count,
        'unit_price': str(o.unit_price),
        'discount_percentage': str(o.discount_percentage),
        'amount': str(o.amount),
        'currency': o.currency,
        'payment_reference': o.payment_reference,
        'paid_on': o.paid_on.isoformat() if hasattr(o.paid_on, 'isoformat') else str(o.paid_on),
        'payment_notes': o.payment_notes,
        'status': o.status,
        'submitted_by_name': o.submitted_by.get_full_name() if o.submitted_by else None,
        'reviewed_by_name': o.reviewed_by.get_full_name() if o.reviewed_by else None,
        'reviewed_at': o.reviewed_at.isoformat() if o.reviewed_at else None,
        'review_note': o.review_note,
        'created_at': o.created_at.isoformat(),
    } for o in qs]

    return Response({'results': results})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def platform_admin_order_approve_view(request, order_id):
    """
    Platform admin action: approves an offline bank payment order and activates the subscription.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    order = get_object_or_404(SubscriptionOrder, id=order_id)
    review_note = (request.data or {}).get('review_note', '')

    try:
        approved_order = approve_subscription_order(
            order=order,
            reviewer=request.user,
            review_note=review_note
        )
    except ValueError as err:
        return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'message': f"Order #{approved_order.order_number} approved successfully. Subscription activated.",
        'order_id': approved_order.id,
        'status': approved_order.status,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def platform_admin_order_reject_view(request, order_id):
    """
    Platform admin action: rejects an offline bank payment order with required audit note.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    order = get_object_or_404(SubscriptionOrder, id=order_id)
    review_note = (request.data or {}).get('review_note', '')

    try:
        rejected_order = reject_subscription_order(
            order=order,
            reviewer=request.user,
            review_note=review_note
        )
    except ValueError as err:
        return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'message': f"Order #{rejected_order.order_number} rejected.",
        'order_id': rejected_order.id,
        'status': rejected_order.status,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def platform_admin_extend_trial_view(request, school_id):
    """
    Platform admin action: extends a school's trial by N days with mandatory audit reason.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    school = get_object_or_404(School, id=school_id)
    data = request.data or {}
    days = data.get('days') or data.get('extra_days')
    reason = data.get('reason')

    if not days or not reason:
        return Response({'detail': 'extra_days (number > 0) and reason (string) are required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        days_int = int(days)
        sub = extend_school_trial(
            school=school,
            extra_days=days_int,
            reason=reason,
            actor=request.user
        )
    except ValueError as err:
        return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'message': f"Trial for '{school.name}' extended by {days_int} days.",
        'trial_ends_at': sub.trial_ends_at.isoformat(),
        'status': sub.status,
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def platform_admin_feature_overrides_view(request, school_id):
    """
    GET: Lists feature overrides for a school.
    POST: Grants or revokes a feature override for a school.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    school = get_object_or_404(School, id=school_id)

    if request.method == 'GET':
        overrides = SchoolFeatureOverride.objects.filter(school=school).select_related('granted_by')
        results = [{
            'id': ov.id,
            'feature_key': ov.feature_key,
            'is_granted': ov.is_granted,
            'expires_at': ov.expires_at.isoformat() if ov.expires_at else None,
            'reason': ov.reason,
            'granted_by_name': ov.granted_by.get_full_name() if ov.granted_by else None,
            'created_at': ov.created_at.isoformat(),
        } for ov in overrides]
        return Response({'results': results})

    # POST: Grant or revoke
    data = request.data or {}
    feature_key = str(data.get('feature_key', '')).strip()
    is_granted = bool(data.get('is_granted', True))
    reason = str(data.get('reason', '')).strip()
    expires_at = data.get('expires_at')

    if not feature_key or not reason:
        return Response({'detail': 'feature_key and reason are required.'}, status=status.HTTP_400_BAD_REQUEST)

    override, created = SchoolFeatureOverride.objects.update_or_create(
        school=school,
        feature_key=feature_key,
        defaults={
            'is_granted': is_granted,
            'expires_at': expires_at,
            'reason': reason,
            'granted_by': request.user,
        }
    )

    SubscriptionEvent.objects.create(
        school=school,
        event_type='override_applied',
        actor=request.user,
        notes=f"{'Granted' if is_granted else 'Revoked'} feature '{feature_key}'. Reason: {reason}",
        metadata={'feature_key': feature_key, 'is_granted': is_granted, 'expires_at': str(expires_at)}
    )

    invalidate_school_entitlements_cache(school.id)
    return Response({
        'message': f"Feature override for '{feature_key}' saved.",
        'override_id': override.id,
        'feature_key': override.feature_key,
        'is_granted': override.is_granted,
    }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def platform_admin_feature_override_delete_view(request, school_id, override_id):
    """Platform admin action: deletes a specific feature override."""
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    override = get_object_or_404(SchoolFeatureOverride, id=override_id, school_id=school_id)
    key = override.feature_key
    override.delete()
    invalidate_school_entitlements_cache(school_id)
    return Response({'message': f"Feature override for '{key}' deleted."})
