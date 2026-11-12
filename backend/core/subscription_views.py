"""
Views and API Endpoints for Subscriptions, Invoicing, Card Payments,
Entitlements Inspection, Upgrades/Downgrades, and Platform Admin Management.
"""
import logging
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from core.models import (
    School,
    Organisation,
    CURRENCIES,
    User,
    Plan,
    PlanFeature,
    BillingPeriod,
    FeatureCatalog,
    PlatformBillingSettings,
    SchoolSubscription,
    SubscriptionOrder,
    SchoolFeatureOverride,
    SubscriptionEvent,
    OrganisationSubscription,
    PlatformPlan,
    SchoolClass,
    StaffMember,
    Student,
    PublishedSchoolIndicator,
    SchoolConfiguration,
    SchoolConfigurationVersion,
    PlanRefundRequest,
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
    schedule_subscription_downgrade,
)
from core.services.payments import WebhookSignatureVerificationError

logger = logging.getLogger('core.subscription_views')


def _is_platform_admin(user):
    """Checks whether the user holds platform administrator authority (SaaS website owner)."""
    return bool(user and user.is_authenticated and (
        user.is_superuser or user.role in ('platform_admin', 'owner') or (
            user.is_staff and not user.school_id and not getattr(user, 'organisation_id', None)
        )
    ))


def _resolve_school_for_user(request):
    """
    Resolves the target school for a subscription/entitlements request.
    Handles multi-campus organisations, organisation admins, and specific ?school= queries.
    """
    school_id = request.query_params.get('school')
    if not school_id and hasattr(request, 'data') and isinstance(request.data, dict):
        school_id = request.data.get('school_id') or request.data.get('school')

    if school_id:
        try:
            school = School.objects.filter(id=school_id).first()
            if school:
                if request.user.is_superuser or request.user.role in ('platform_admin', 'owner'):
                    return school
                if getattr(request.user, 'organisation_id', None) and school.organisation_id == request.user.organisation_id:
                    return school
                if getattr(request.user, 'school_id', None) == school.id:
                    return school
        except (ValueError, TypeError):
            pass

    if getattr(request.user, 'school', None):
        return request.user.school

    if getattr(request.user, 'organisation', None):
        return request.user.organisation.schools.order_by('id').first()

    return None


# ==============================================================================
# 1. Public Pricing & Information Endpoints (Unauthenticated)
# ==============================================================================

@api_view(['GET'])
@permission_classes([AllowAny])
def public_pricing_view(request):
    """
    Public pricing table endpoint.
    Returns active plans, rates (USD and PKR), billing periods, and feature breakdown from database.
    Prices and discounts are dynamic DATA, never hardcoded.
    """
    settings_obj = PlatformBillingSettings.get_settings()
    plans = Plan.objects.filter(is_active=True).prefetch_related('plan_features').order_by('display_order', 'id')
    catalog = FeatureCatalog.objects.all().order_by('display_order', 'key')
    billing_periods = BillingPeriod.get_active_periods()

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

    periods_data = [{
        'months': bp.months,
        'discount_percentage': str(bp.discount_percentage),
        'display_order': bp.display_order,
    } for bp in billing_periods]

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
        'billing_periods': periods_data,
        'features': features_data,
        'exchange_rate_note_en': settings_obj.exchange_rate_note_en,
        'exchange_rate_note_ur': settings_obj.exchange_rate_note_ur,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def public_billing_info_view(request):
    """
    Public metadata for platform billing policies and periods.
    """
    settings_obj = PlatformBillingSettings.get_settings()
    billing_periods = BillingPeriod.get_active_periods()
    return Response({
        'pending_grace_days': settings_obj.pending_grace_days,
        'past_due_grace_days': settings_obj.past_due_grace_days,
        'basic_access_features': settings_obj.basic_access_features or list(PlatformBillingSettings.DEFAULT_BASIC_ACCESS_FEATURES),
        'billing_periods': [{
            'months': bp.months,
            'discount_percentage': str(bp.discount_percentage)
        } for bp in billing_periods],
        'exchange_rate_note_en': settings_obj.exchange_rate_note_en,
        'exchange_rate_note_ur': settings_obj.exchange_rate_note_ur,
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
    school = _resolve_school_for_user(request)
    if not school:
        is_platform_superadmin = (request.user.role == 'platform_admin' and not getattr(request.user, 'organisation_id', None))
        if is_platform_superadmin:
            return Response({
                'school_id': None,
                'school_name': 'Platform Administrator',
                'status': 'active',
                'plan': {
                    'code': 'premium',
                    'name': 'Platform Admin Access',
                    'name_ur': 'پلیٹ فارم ایڈمن رسائی',
                    'tagline': 'Internal Operations',
                    'tagline_ur': 'اندرونی انتظام',
                    'price_usd_per_student': '0.00',
                    'price_pkr_per_student': '0.00',
                },
                'effective_tier': 'premium',
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
            })
        org_name = getattr(request.user.organisation, 'name', 'No Campus Selected') if getattr(request.user, 'organisation', None) else 'No Campus Selected'
        return Response({
            'school_id': None,
            'school_name': org_name,
            'status': 'no_plan',
            'plan': None,
            'effective_tier': 'no_plan',
            'is_no_plan': True,
            'is_limited': True,
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
        })

    entitlements = get_school_entitlements(school)
    sub = SchoolSubscription.objects.filter(school=school).select_related('plan', 'pending_downgrade_to_plan').first()
    plan_obj = sub.plan if (sub and sub.plan) else None

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
        'is_no_plan': entitlements['is_no_plan'],
        'is_limited': entitlements['is_limited'],
        'is_suspended': entitlements['is_suspended'],
        'is_write_allowed': entitlements['is_write_allowed'],
        'active_students': entitlements['active_students'],
        'student_count_at_last_invoice': entitlements['student_count_at_last_invoice'],
        'has_student_growth': entitlements['has_student_growth'],
        'current_period_start': sub.current_period_start.isoformat() if (sub and sub.current_period_start) else None,
        'paid_until': entitlements['paid_until'],
        'grace_until': entitlements['grace_until'],
        'grace_days_remaining': entitlements['grace_days_remaining'],
        'pending_downgrade_to_plan': entitlements.get('pending_downgrade_to_plan'),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_entitlements_view(request):
    """
    Authoritative server-side feature entitlements check for the school.
    Consumed by the frontend to render feature lock screens and badges.
    """
    school = _resolve_school_for_user(request)
    if not school:
        return Response(get_school_entitlements(None))

    data = get_school_entitlements(school)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_invoice_estimate_view(request):
    """
    Computes real-time invoice estimate for school based on active enrolled student headcount.
    Query parameters: plan ('standard' or 'premium'), months (1, 4, 8, 12), currency ('USD' or 'PKR').
    Calculates upgrade credit if upgrading from Standard to Premium during active period.
    """
    school = _resolve_school_for_user(request)
    if not school:
        return Response({
            'student_count': 0,
            'subtotal': '0.00',
            'discount_amount': '0.00',
            'upgrade_credit_amount': '0.00',
            'payable_amount': '0.00',
            'currency': request.query_params.get('currency', 'USD').upper(),
            'discount_percentage': '0.00'
        })

    plan_code = request.query_params.get('plan', 'standard')
    months = int(request.query_params.get('months', 1))
    currency = request.query_params.get('currency', 'USD').upper()
    raw_features = request.query_params.getlist('features') or request.query_params.getlist('selected_features')
    selected_features = []
    for item in raw_features:
        for part in str(item).split(','):
            part = part.strip()
            if part and part not in selected_features:
                selected_features.append(part)
    custom_students = request.query_params.get('student_count') or request.query_params.get('students')

    plan = Plan.objects.filter(code=plan_code, is_active=True).first()
    if not plan:
        return Response({'detail': f"Plan '{plan_code}' not found."}, status=status.HTTP_404_NOT_FOUND)

    active_students = int(custom_students) if custom_students else get_active_enrolled_student_count(school)
    try:
        estimate = calculate_invoice_estimate(
            plan=plan,
            billing_months=months,
            student_count=active_students,
            currency=currency,
            school=school,
            selected_features=selected_features
        )
    except ValueError as err:
        return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        **estimate,
        'unit_price': str(estimate['unit_price']),
        'subtotal': str(estimate['subtotal']),
        'discount_percentage': str(estimate['discount_percentage']),
        'discount_amount': str(estimate['discount_amount']),
        'upgrade_credit_amount': str(estimate['upgrade_credit_amount']),
        'tax_amount': str(estimate['tax_amount']),
        'payable_amount': str(estimate['payable_amount']),
        'gross_amount': str(estimate['subtotal']),  # Compatibility alias
        'net_amount': str(estimate['payable_amount']),  # Compatibility alias
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_bank_details_view(request):
    """
    Returns platform offline bank deposit details for printable invoice/challan generation.
    Bank details are retrieved strictly from database configuration.
    """
    settings_obj = PlatformBillingSettings.get_settings()
    return Response({
        'bank_name': settings_obj.bank_name,
        'account_title': settings_obj.account_title,
        'account_number': settings_obj.account_number,
        'iban': settings_obj.iban,
        'branch_code': settings_obj.branch_code,
        'swift_bic': settings_obj.swift_bic,
        'payment_instructions_en': settings_obj.payment_instructions_en,
        'payment_instructions_ur': settings_obj.payment_instructions_ur,
        'exchange_rate_note_en': settings_obj.exchange_rate_note_en,
        'exchange_rate_note_ur': settings_obj.exchange_rate_note_ur,
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def school_subscription_orders_view(request):
    """
    GET: Lists historical and pending payment orders for this school.
    POST: Submits an order (Card hosted checkout OR offline bank deposit).
    """
    school = _resolve_school_for_user(request)
    if not school:
        if request.method == 'GET':
            return Response({'results': []})
        raise PermissionDenied("User is not associated with an educational institution.")

    if request.method == 'GET':
        orders = SubscriptionOrder.objects.filter(school=school).select_related('plan', 'reviewed_by').order_by('-created_at')
        now = timezone.now()
        refunds_by_order = {
            r.order_id: r for r in PlanRefundRequest.objects.filter(school=school).order_by('created_at')
        }

        results = []
        for o in orders:
            ref = refunds_by_order.get(o.id)
            is_within_48h = (now - o.created_at).total_seconds() <= 48 * 3600
            can_request_refund = (o.status in ('paid', 'approved')) and is_within_48h and (not ref or ref.status == 'rejected')

            results.append({
                'id': o.id,
                'order_number': o.order_number,
                'plan_code': o.plan.code if o.plan else 'custom',
                'plan_name': o.plan.name if o.plan else 'Custom Package',
                'billing_months': o.billing_months,
                'student_count': o.student_count,
                'unit_price': str(o.unit_price),
                'subtotal': str(o.subtotal),
                'discount_percentage': str(o.discount_percentage),
                'discount_amount': str(o.discount_amount),
                'upgrade_credit_amount': str(o.upgrade_credit_amount),
                'tax_amount': str(o.tax_amount),
                'amount': str(o.amount),
                'currency': o.currency,
                'period_start': o.period_start.isoformat() if o.period_start else None,
                'period_end': o.period_end.isoformat() if o.period_end else None,
                'card_brand': o.card_brand,
                'card_last4': o.card_last4,
                'payment_reference': o.payment_reference,
                'paid_on': o.paid_on.isoformat() if (o.paid_on and hasattr(o.paid_on, 'isoformat')) else (str(o.paid_on) if o.paid_on else None),
                'payment_notes': o.payment_notes,
                'metadata': o.metadata,
                'status': o.status,
                'reviewed_at': o.reviewed_at.isoformat() if o.reviewed_at else None,
                'review_note': o.review_note,
                'created_at': o.created_at.isoformat(),
                'is_within_48h': is_within_48h,
                'can_request_refund': can_request_refund,
                'refund_request': {
                    'id': ref.id,
                    'status': ref.status,
                    'reason': ref.reason,
                    'intended_change': ref.intended_change,
                    'bank_name': ref.bank_name,
                    'account_title': ref.account_title,
                    'account_number': ref.account_number,
                    'admin_notes': ref.admin_notes,
                    'refund_transaction_reference': ref.refund_transaction_reference,
                    'created_at': ref.created_at.isoformat(),
                    'reviewed_at': ref.reviewed_at.isoformat() if ref.reviewed_at else None,
                } if ref else None,
            })
        return Response({'results': results})

    # POST: Submit new order
    if request.user.role not in ('owner', 'organisation_admin', 'school_admin'):
        raise PermissionDenied("Only school administrators can submit subscription orders.")

    data = request.data or {}
    plan_code = data.get('plan_code') or data.get('plan')
    billing_months = data.get('billing_months') or data.get('months')
    payment_method = (data.get('payment_method') or '').lower()
    currency = (data.get('currency') or 'USD').upper()
    selected_features = data.get('selected_features') or data.get('features')
    custom_student_count = data.get('student_count') or data.get('students')

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

    is_direct_activation = payment_method in ('direct', 'instant', 'activate') or data.get('auto_activate')
    if is_direct_activation:
        try:
            order = create_card_subscription_order(
                school=school,
                plan=plan,
                billing_months=months_int,
                return_url='',
                cancel_url='',
                currency=currency,
                submitted_by=request.user,
                provider_name='direct',
                selected_features=selected_features,
                custom_student_count=custom_student_count,
            )
            approve_subscription_order(order, reviewer=request.user, review_note='Direct institutional activation')
        except ValueError as err:
            return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f"Plan '{plan.name}' has been successfully activated for {school.name}.",
            'activated': True,
            'order': {
                'id': order.id,
                'order_number': order.order_number,
                'status': order.status,
                'amount': str(order.amount),
                'subtotal': str(order.subtotal),
                'discount_amount': str(order.discount_amount),
                'upgrade_credit_amount': str(order.upgrade_credit_amount),
                'currency': order.currency,
                'billing_months': order.billing_months,
                'student_count': order.student_count,
                'provider': 'direct',
                'created_at': order.created_at.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)

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
                selected_features=selected_features,
                custom_student_count=custom_student_count,
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
                'subtotal': str(order.subtotal),
                'discount_amount': str(order.discount_amount),
                'upgrade_credit_amount': str(order.upgrade_credit_amount),
                'currency': order.currency,
                'billing_months': order.billing_months,
                'student_count': order.student_count,
                'provider': order.provider,
                'checkout_url': order.checkout_url,
                'created_at': order.created_at.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)

    # Offline Bank Deposit Workflow
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
            selected_features=selected_features,
            custom_student_count=custom_student_count,
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
@permission_classes([IsAuthenticated])
def school_subscription_downgrade_view(request):
    """
    Schedules a downgrade from Premium to Standard taking effect at the end of the paid period.
    Full Premium access remains intact until paid_until.
    No data is deleted.
    """
    school = _resolve_school_for_user(request)
    if not school:
        raise PermissionDenied("User is not associated with an educational institution.")

    if request.user.role not in ('owner', 'organisation_admin', 'school_admin'):
        raise PermissionDenied("Only school administrators can manage subscription tiers.")

    target_plan = Plan.objects.filter(code='standard', is_active=True).first()
    if not target_plan:
        raise NotFound("Standard plan not found.")

    reason = (request.data or {}).get('reason', '')
    try:
        sub = schedule_subscription_downgrade(school, target_plan, actor=request.user, reason=reason)
    except ValueError as err:
        return Response({'detail': str(err)}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'message': f"Downgrade to Standard plan scheduled for end of billing period ({sub.paid_until.date() if sub.paid_until else 'N/A'}).",
        'pending_downgrade_to_plan': target_plan.code,
        'paid_until': sub.paid_until.isoformat() if sub.paid_until else None,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def subscription_payment_webhook_view(request):
    """
    Public webhook receiver for payment provider notifications.
    Cryptographically verifies signatures.
    Rejects bad signatures with 400.
    Rejects tampered amounts with 400.
    Guarantees idempotent processing.
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
    Plain language receipt / invoice endpoint.
    Exposes every receipt item specified in Section 5 with student count explanation and bilingual support.
    """
    school = _resolve_school_for_user(request)
    if not school and not request.user.is_superuser:
        raise PermissionDenied("A school affiliation is required to view order receipts.")

    qs = SubscriptionOrder.objects.all() if request.user.is_superuser else SubscriptionOrder.objects.filter(school=school)
    order = qs.filter(pk=pk).select_related('school', 'plan').first()
    if not order:
        raise NotFound("Subscription order not found.")

    settings_obj = PlatformBillingSettings.get_settings()
    active_students_now = get_active_enrolled_student_count(order.school)
    has_growth = active_students_now > order.student_count

    # Payment method string
    if order.card_brand and order.card_last4:
        payment_method_str = f"{order.card_brand} ending in {order.card_last4}"
    elif order.card_last4:
        payment_method_str = f"Card ending in {order.card_last4}"
    elif order.provider in ('fake', 'paddle'):
        payment_method_str = "Card Payment (Provider Hosted)"
    else:
        payment_method_str = "Bank Transfer (Direct Deposit)"

    receipt_date = order.paid_on or (order.paid_at.date() if order.paid_at else order.created_at.date())

    receipt_data = {
        'receipt_number': f"REC-{order.order_number}",
        'date': receipt_date.isoformat(),
        'order_number': order.order_number,
        'school_name': order.school.name,
        'school_code': order.school.code,
        'payment_reference': order.payment_reference or order.provider_reference or order.order_number,
        'payment_method': payment_method_str,
        'card_brand': order.card_brand,
        'card_last4': order.card_last4,
        'plan_name': order.plan.name,
        'plan_code': order.plan.code,
        'billing_period_start': order.period_start.isoformat() if order.period_start else None,
        'billing_period_end': order.period_end.isoformat() if order.period_end else None,
        'students_counted': order.student_count,
        'students_counted_help_text_en': "You are charged per active student, so this number is multiplied by the monthly price.",
        'students_counted_help_text_ur': "آپ سے فی فعال طالب علم چارج کیا جاتا ہے، اس لیے اس تعداد کو ماہانہ قیمت سے ضرب دیا جاتا ہے۔",
        'unit_price': str(order.unit_price),
        'months': order.billing_months,
        'subtotal': str(order.subtotal),
        'discount_percentage': str(order.discount_percentage),
        'discount_amount': str(order.discount_amount),
        'upgrade_credit_amount': str(order.upgrade_credit_amount),
        'tax_amount': str(order.tax_amount),
        'total_paid': str(order.amount),
        'amount': str(order.amount),
        'currency': order.currency,
        'status': order.status,
        'provider': order.provider,
        'active_students_now': active_students_now,
        'has_student_growth': has_growth,
        'growth_notice_en': "Your student enrollment has grown beyond this invoice. Additional students are never blocked and will be included in your next renewal invoice." if has_growth else "",
        'growth_notice_ur': "طالب علموں کی تعداد میں اضافہ ہوا ہے۔ اضافی طلباء کبھی بھی مسدود نہیں ہوں گے اور آپ کے اگلے تجدیدی بل میں شامل کیے جائیں گے۔" if has_growth else "",
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
    Platform admin endpoint to inspect or update platform billing parameters,
    basic access features, grace periods, and bank instructions.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    settings_obj = PlatformBillingSettings.get_settings()
    billing_periods = BillingPeriod.get_active_periods()

    if request.method == 'GET':
        return Response({
            'bank_name': settings_obj.bank_name,
            'account_title': settings_obj.account_title,
            'account_number': settings_obj.account_number,
            'iban': settings_obj.iban,
            'branch_code': settings_obj.branch_code,
            'swift_bic': settings_obj.swift_bic,
            'payment_instructions_en': settings_obj.payment_instructions_en,
            'payment_instructions_ur': settings_obj.payment_instructions_ur,
            'pending_grace_days': settings_obj.pending_grace_days,
            'past_due_grace_days': settings_obj.past_due_grace_days,
            'basic_access_features': settings_obj.basic_access_features or list(PlatformBillingSettings.DEFAULT_BASIC_ACCESS_FEATURES),
            'billing_periods': [{
                'months': bp.months,
                'discount_percentage': str(bp.discount_percentage),
                'display_order': bp.display_order
            } for bp in billing_periods],
            'exchange_rate_note_en': settings_obj.exchange_rate_note_en,
            'exchange_rate_note_ur': settings_obj.exchange_rate_note_ur,
            'updated_at': settings_obj.updated_at.isoformat() if settings_obj.updated_at else None,
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
            setattr(settings_obj, f, str(data[f]).strip())

    if 'pending_grace_days' in data:
        settings_obj.pending_grace_days = max(0, int(data['pending_grace_days']))
    if 'past_due_grace_days' in data:
        settings_obj.past_due_grace_days = max(0, int(data['past_due_grace_days']))
    if 'basic_access_features' in data and isinstance(data['basic_access_features'], list):
        settings_obj.basic_access_features = data['basic_access_features']

    settings_obj.updated_by = request.user
    settings_obj.save()
    return Response({'message': 'Platform billing settings updated successfully.'})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def platform_admin_billing_periods_view(request):
    """
    Platform admin endpoint to manage billing period tiers and discounts (DATA, not hardcoded).
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    if request.method == 'GET':
        periods = BillingPeriod.get_active_periods()
        results = [{
            'id': p.id,
            'months': p.months,
            'discount_percentage': str(p.discount_percentage),
            'is_active': p.is_active,
            'display_order': p.display_order,
        } for p in periods]
        return Response({'results': results})

    # POST / PUT: Update or create billing period
    data = request.data or {}
    months = data.get('months')
    discount = data.get('discount_percentage', '0.00')
    if not months:
        return Response({'detail': 'months is required.'}, status=status.HTTP_400_BAD_REQUEST)

    period, created = BillingPeriod.objects.update_or_create(
        months=int(months),
        defaults={
            'discount_percentage': Decimal(str(discount)).quantize(Decimal('0.01')),
            'is_active': bool(data.get('is_active', True)),
            'display_order': int(data.get('display_order', 0))
        }
    )
    return Response({
        'message': f"Billing period {period.months} months saved.",
        'id': period.id,
        'months': period.months,
        'discount_percentage': str(period.discount_percentage),
    }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_plans_view(request):
    """Platform admin endpoint to list all available subscription plans."""
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    plans = Plan.objects.all().prefetch_related('plan_features').order_by('display_order', 'id')
    results = []
    for p in plans:
        feature_keys = set(p.plan_features.filter(is_included=True).values_list('feature_key', flat=True))
        results.append({
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
            'display_order': p.display_order,
            'is_active': p.is_active,
            'included_feature_keys': sorted(list(feature_keys)),
        })
    return Response({'results': results})


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def platform_admin_plan_detail_view(request, pk):
    """Platform admin endpoint to inspect or update a specific plan's details, pricing, and features."""
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    plan = get_object_or_404(Plan, pk=pk)

    if request.method == 'GET':
        feature_keys = set(plan.plan_features.filter(is_included=True).values_list('feature_key', flat=True))
        return Response({
            'id': plan.id,
            'code': plan.code,
            'name': plan.name,
            'name_ur': plan.name_ur,
            'tagline': plan.tagline,
            'tagline_ur': plan.tagline_ur,
            'description': plan.description,
            'description_ur': plan.description_ur,
            'price_usd_per_student': str(plan.price_usd_per_student),
            'price_pkr_per_student': str(plan.price_pkr_per_student),
            'display_order': plan.display_order,
            'is_active': plan.is_active,
            'included_feature_keys': sorted(list(feature_keys)),
        })

    data = request.data or {}
    for attr in ['name', 'name_ur', 'tagline', 'tagline_ur', 'description', 'description_ur']:
        if attr in data:
            setattr(plan, attr, str(data[attr]).strip())

    if 'price_usd_per_student' in data:
        plan.price_usd_per_student = Decimal(str(data['price_usd_per_student'])).quantize(Decimal('0.01'))
    if 'price_pkr_per_student' in data:
        plan.price_pkr_per_student = Decimal(str(data['price_pkr_per_student'])).quantize(Decimal('0.01'))
    if 'is_active' in data:
        plan.is_active = bool(data['is_active'])
    if 'display_order' in data:
        plan.display_order = int(data['display_order'])

    plan.save()

    if 'included_feature_keys' in data and isinstance(data['included_feature_keys'], list):
        target_keys = set(data['included_feature_keys'])
        PlanFeature.objects.filter(plan=plan).delete()
        for k in target_keys:
            PlanFeature.objects.create(plan=plan, feature_key=k, is_included=True)

    for sub in plan.school_subscriptions.all():
        invalidate_school_entitlements_cache(sub.school_id)

    return Response({'message': f"Plan '{plan.name}' updated successfully."})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_features_view(request):
    """Platform admin endpoint to list the system feature catalog."""
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_schools_view(request):
    """Platform admin comprehensive directory of institutional subscribers, statuses, counts, and financial performance."""
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    from django.db.models import Sum
    now = timezone.now()
    schools = School.objects.select_related('subscription', 'subscription__plan', 'organisation').all().order_by('name')
    results = []

    for s in schools:
        sub = getattr(s, 'subscription', None)
        active_count = get_active_enrolled_student_count(s)
        invoiced_count = sub.student_count_at_last_invoice if sub else 0
        has_growth = active_count > invoiced_count

        plan_code = (sub.plan.code if (sub and sub.plan) else 'free').lower()
        sub_status = (sub.status if sub else 'trial').lower()

        # Resolve display names and trial status
        if plan_code == 'standard':
            plan_name = 'Standard Plan'
            monthly_rate_usd = Decimal('3.60')
            monthly_rate_pkr = Decimal('1000.00')
        elif plan_code == 'premium':
            plan_name = 'Premium Plan'
            monthly_rate_usd = Decimal('7.20')
            monthly_rate_pkr = Decimal('2000.00')
        elif plan_code == 'custom':
            plan_name = sub.plan.name if (sub and sub.plan) else 'Custom Package'
            monthly_rate_usd = sub.plan.price_usd_per_student if (sub and sub.plan) else Decimal('0.00')
            monthly_rate_pkr = sub.plan.price_pkr_per_student if (sub and sub.plan) else Decimal('0.00')
        else:
            plan_name = '30-Day Free Trial'
            monthly_rate_usd = Decimal('0.00')
            monthly_rate_pkr = Decimal('0.00')

        is_trial = plan_code in ('free', 'no_plan') or sub_status in ('trial', 'no_plan')

        # Status display
        if is_trial:
            status_display = '30-Day Trial'
        elif sub_status == 'active':
            status_display = 'Active'
        elif sub_status == 'past_due':
            status_display = 'Past Due'
        elif sub_status == 'suspended':
            status_display = 'Suspended'
        else:
            status_display = sub_status.capitalize()

        # Dates & Day tracking
        start_dt = (sub.current_period_start if sub and sub.current_period_start else (sub.created_at if sub else None))
        days_passed = max(0, (now - start_dt).days) if start_dt else 0

        paid_until = sub.paid_until if (sub and sub.paid_until) else None
        if paid_until:
            diff_days = (paid_until - now).days
            days_remaining = max(0, diff_days)
            is_expired = paid_until < now
        else:
            if is_trial or sub_status == 'active':
                days_remaining = max(0, 30 - days_passed)
                is_expired = False
            else:
                days_remaining = 0
                is_expired = True

        # Monthly income calculation
        monthly_usd = round(Decimal(str(active_count)) * monthly_rate_usd, 2)
        monthly_pkr = round(Decimal(str(active_count)) * monthly_rate_pkr, 2)

        # Historical earnings from approved/paid orders
        sch_orders = SubscriptionOrder.objects.filter(school=s, status__in=['approved', 'paid'])
        total_paid_usd = sch_orders.filter(currency='USD').aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
        total_paid_pkr = sch_orders.filter(currency='PKR').aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
        all_orders_count = SubscriptionOrder.objects.filter(school=s).count()

        # Primary admin contact
        admin_user = User.objects.filter(school=s).order_by('id').first()
        if not admin_user and s.organisation_id:
            admin_user = User.objects.filter(organisation_id=s.organisation_id).order_by('id').first()

        # Recent subscription and package events
        recent_evs = SubscriptionEvent.objects.filter(school=s).order_by('-created_at')[:4]
        events_list = [
            {
                'id': ev.id,
                'event_type': ev.event_type,
                'event_type_display': ev.get_event_type_display(),
                'to_plan': ev.to_plan,
                'to_status': ev.to_status,
                'actor_name': (ev.actor.get_full_name() or ev.actor.username) if ev.actor else 'System',
                'notes': ev.notes,
                'created_at': ev.created_at.isoformat(),
            }
            for ev in recent_evs
        ]

        registered_at_dt = admin_user.date_joined if admin_user else (sub.created_at if sub else start_dt)

        results.append({
            'school_id': s.id,
            'school_name': s.name,
            'school_code': s.code,
            'city': s.city or '',
            'currency': getattr(s, 'currency', 'PKR'),
            'organisation_id': s.organisation_id,
            'organisation_name': s.organisation.name if s.organisation else None,
            'campuses_count': s.organisation.schools.count() if s.organisation else 1,
            'classes_count': s.schoolclass_set.count(),
            'staff_count': s.staff.count(),
            'admin_id': admin_user.id if admin_user else None,
            'admin_email': admin_user.email if admin_user else '',
            'admin_username': admin_user.username if admin_user else '',
            'admin_name': (admin_user.get_full_name() or admin_user.username) if admin_user else '',
            'registered_by': {
                'id': admin_user.id if admin_user else None,
                'name': (admin_user.get_full_name() or admin_user.username) if admin_user else 'Unknown',
                'username': admin_user.username if admin_user else '',
                'email': admin_user.email if admin_user else '',
                'role': admin_user.role if admin_user else '',
                'date_joined': admin_user.date_joined.isoformat() if admin_user else None,
            },
            'registered_at': registered_at_dt.isoformat() if registered_at_dt else None,
            'plan_code': plan_code,
            'plan_name': plan_name,
            'status': sub_status,
            'status_display': status_display,
            'is_trial': is_trial,
            'is_expired': is_expired,
            'start_date': start_dt.isoformat() if start_dt else None,
            'paid_until': paid_until.isoformat() if paid_until else None,
            'grace_until': sub.grace_until.isoformat() if (sub and sub.grace_until) else None,
            'days_passed': days_passed,
            'days_remaining': days_remaining,
            'active_students': active_count,
            'student_count_at_last_invoice': invoiced_count,
            'has_student_growth': has_growth,
            'growth_count': max(0, active_count - invoiced_count),
            'monthly_rate_usd': str(monthly_rate_usd),
            'monthly_rate_pkr': str(monthly_rate_pkr),
            'monthly_revenue_usd': str(monthly_usd),
            'monthly_revenue_pkr': str(monthly_pkr),
            'total_paid_usd': str(total_paid_usd),
            'total_paid_pkr': str(total_paid_pkr),
            'orders_count': all_orders_count,
            'recent_events': events_list,
            'events_count': SubscriptionEvent.objects.filter(school=s).count(),
        })

    return Response({'results': results})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def platform_admin_alter_school_subscription_view(request, school_id):
    """
    Platform admin action: alters a school's package tier, subscription status, expiration date, or seats.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    school = get_object_or_404(School, id=school_id)
    sub, _ = SchoolSubscription.objects.get_or_create(school=school)

    data = request.data or {}
    plan_code = str(data.get('plan_code', '')).strip().lower()
    new_status = str(data.get('status', '')).strip().lower()
    extend_days = data.get('extend_days')
    paid_until_str = data.get('paid_until')
    student_count_override = data.get('active_students_override')
    notes = str(data.get('notes', '')).strip()

    if plan_code:
        if plan_code in ('free', 'trial', 'no_plan'):
            free_plan = Plan.objects.filter(code='free').first()
            sub.plan = free_plan
            if not new_status:
                sub.status = 'no_plan'
        else:
            plan = Plan.objects.filter(code=plan_code).first() or Plan.objects.filter(code__iexact=plan_code).first()
            if plan:
                sub.plan = plan

    if new_status:
        valid_map = {'active': 'active', 'past_due': 'past_due', 'suspended': 'suspended', 'no_plan': 'no_plan', 'trial': 'no_plan'}
        sub.status = valid_map.get(new_status, sub.status)

    if extend_days:
        try:
            days = int(extend_days)
            base_time = sub.paid_until if (sub.paid_until and sub.paid_until > timezone.now()) else timezone.now()
            sub.paid_until = base_time + timezone.timedelta(days=days)
            if sub.status in ('past_due', 'suspended', 'no_plan'):
                sub.status = 'active'
        except (ValueError, TypeError):
            pass
    elif paid_until_str is not None:
        if str(paid_until_str).strip() in ('', 'null', 'None'):
            sub.paid_until = None
        else:
            from django.utils.dateparse import parse_datetime, parse_date
            dt = parse_datetime(str(paid_until_str).strip())
            if not dt:
                d = parse_date(str(paid_until_str).strip())
                if d:
                    from datetime import datetime, time
                    dt = timezone.make_aware(datetime.combine(d, time(23, 59, 59)))
            if dt:
                sub.paid_until = dt

    if student_count_override is not None:
        try:
            sub.student_count_at_last_invoice = max(0, int(student_count_override))
        except (ValueError, TypeError):
            pass

    if not sub.current_period_start:
        sub.current_period_start = timezone.now()

    sub.save()

    # Synchronize OrganisationSubscription if organisation exists
    if school.organisation:
        org_sub = OrganisationSubscription.objects.filter(organisation=school.organisation).first()
        if org_sub:
            if sub.plan:
                platform_plan = PlatformPlan.objects.filter(name__icontains=sub.plan.code).first()
                if platform_plan:
                    org_sub.plan = platform_plan
            org_sub.status = 'active' if sub.status == 'active' else sub.status
            if sub.paid_until:
                org_sub.renewal_date = sub.paid_until.date()
            org_sub.save()

    invalidate_school_entitlements_cache(school.id)

    SubscriptionEvent.objects.create(
        school=school,
        event_type='admin_altered',
        actor=request.user,
        notes=f"Owner altered package: Plan={sub.plan.code if sub.plan else 'none'}, Status={sub.status}, PaidUntil={sub.paid_until}. {notes}",
        metadata={
            'plan_code': plan_code,
            'status': new_status,
            'extend_days': extend_days,
            'paid_until': str(sub.paid_until),
            'notes': notes,
        }
    )

    return Response({
        'message': f"Subscription for '{school.name}' altered successfully.",
        'school_id': school.id,
        'school_name': school.name,
        'plan_code': sub.plan.code if sub.plan else 'no_plan',
        'plan_name': sub.plan.name if sub.plan else '30-Day Free Trial',
        'status': sub.status,
        'paid_until': sub.paid_until.isoformat() if sub.paid_until else None,
        'student_count_at_last_invoice': sub.student_count_at_last_invoice,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_school_detail_view(request, school_id):
    """
    Platform admin action: fetches comprehensive details of a school including
    who registered it, organisation details, package information, and full activity history.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    school = get_object_or_404(School.objects.select_related('organisation', 'subscription', 'subscription__plan'), id=school_id)
    sub = getattr(school, 'subscription', None)
    admin_user = User.objects.filter(school=school).order_by('id').first()
    if not admin_user and school.organisation_id:
        admin_user = User.objects.filter(organisation_id=school.organisation_id).order_by('id').first()

    now = timezone.now()
    plan_code = (sub.plan.code if (sub and sub.plan) else 'free').lower()
    sub_status = (sub.status if sub else 'trial').lower()
    is_trial = plan_code in ('free', 'no_plan') or sub_status in ('trial', 'no_plan')

    paid_until = sub.paid_until if (sub and sub.paid_until) else None
    if paid_until:
        diff_days = (paid_until - now).days
        days_remaining = max(0, diff_days)
        is_expired = paid_until < now
    else:
        days_remaining = 30 if (is_trial or sub_status == 'active') else 0
        is_expired = False if (is_trial or sub_status == 'active') else True

    events = SubscriptionEvent.objects.filter(school=school).order_by('-created_at')[:50]
    orders = SubscriptionOrder.objects.filter(school=school).order_by('-created_at')[:50]

    return Response({
        'school': {
            'id': school.id,
            'name': school.name,
            'code': school.code,
            'city': school.city or '',
            'currency': getattr(school, 'currency', 'PKR'),
            'active_students': get_active_enrolled_student_count(school),
            'classes_count': school.schoolclass_set.count(),
            'staff_count': school.staff.count(),
            'organisation_id': school.organisation_id,
            'organisation_name': school.organisation.name if school.organisation else None,
        },
        'registered_by': {
            'id': admin_user.id if admin_user else None,
            'first_name': admin_user.first_name if admin_user else '',
            'last_name': admin_user.last_name if admin_user else '',
            'name': (admin_user.get_full_name() or admin_user.username) if admin_user else 'Unknown',
            'username': admin_user.username if admin_user else '',
            'email': admin_user.email if admin_user else '',
            'role': admin_user.role if admin_user else '',
            'date_joined': admin_user.date_joined.isoformat() if admin_user else None,
        },
        'subscription': {
            'plan_code': plan_code,
            'plan_name': sub.plan.name if (sub and sub.plan) else '30-Day Free Trial',
            'status': sub_status,
            'is_trial': is_trial,
            'is_expired': is_expired,
            'days_remaining': days_remaining,
            'current_period_start': sub.current_period_start.isoformat() if (sub and sub.current_period_start) else None,
            'paid_until': paid_until.isoformat() if paid_until else None,
            'student_count_at_last_invoice': sub.student_count_at_last_invoice if sub else 0,
        },
        'events': [
            {
                'id': ev.id,
                'event_type': ev.event_type,
                'event_type_display': ev.get_event_type_display(),
                'from_status': ev.from_status,
                'to_status': ev.to_status,
                'from_plan': ev.from_plan,
                'to_plan': ev.to_plan,
                'actor_name': (ev.actor.get_full_name() or ev.actor.username) if ev.actor else 'System',
                'actor_email': ev.actor.email if ev.actor else '',
                'notes': ev.notes,
                'metadata': ev.metadata,
                'created_at': ev.created_at.isoformat(),
            }
            for ev in events
        ],
        'orders': [
            {
                'id': o.id,
                'order_number': o.order_number,
                'plan_name': o.plan.name if o.plan else 'Plan',
                'billing_months': o.billing_months,
                'student_count': o.student_count,
                'amount': str(o.amount),
                'currency': o.currency,
                'status': o.status,
                'paid_on': o.paid_on.isoformat() if o.paid_on else None,
                'created_at': o.created_at.isoformat(),
            }
            for o in orders
        ]
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def platform_admin_create_school_view(request):
    """
    Platform admin action: directly registers a new institution campus,
    administrator credentials, and assigns the chosen subscription package.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    data = request.data or {}
    org_name = str(data.get('organisation_name') or '').strip()
    school_name = str(data.get('school_name') or '').strip()
    city = str(data.get('city') or '').strip()
    admin_first_name = str(data.get('admin_first_name') or '').strip()
    admin_last_name = str(data.get('admin_last_name') or '').strip()
    admin_email = str(data.get('admin_email') or '').strip().lower()
    admin_username = str(data.get('admin_username') or '').strip()
    admin_password = str(data.get('admin_password') or '').strip()
    plan_code = str(data.get('plan_code') or 'trial').strip().lower()
    status = str(data.get('status') or ('active' if plan_code in ('standard', 'premium', 'custom') else 'trial')).strip().lower()
    paid_until_str = data.get('paid_until')

    if not org_name:
        return Response({'detail': 'Organisation name is required.'}, status=400)
    if not admin_email or not admin_username:
        return Response({'detail': 'Administrator username and email are required.'}, status=400)
    if User.objects.filter(username__iexact=admin_username).exists():
        return Response({'detail': f"Username '{admin_username}' is already in use. Please choose another."}, status=400)
    if User.objects.filter(email__iexact=admin_email).exists():
        return Response({'detail': f"Email '{admin_email}' is already registered with an account."}, status=400)

    from django.utils.text import slugify
    from django.utils.crypto import get_random_string

    with transaction.atomic():
        base_slug = slugify(org_name)[:40] or 'edu-org'
        slug = base_slug
        c = 1
        while Organisation.objects.filter(code=slug).exists():
            slug = f"{base_slug}-{c}"
            c += 1

        org = Organisation.objects.create(name=org_name, code=slug, allow_org_admin_student_access=True)

        campus_display = school_name or f"{org_name} - Main Campus"
        campus_code = f"CAMPUS-{get_random_string(4).upper()}"
        school = School.objects.create(
            organisation=org,
            name=campus_display,
            code=campus_code,
            city=city,
            attendance_alert_threshold=80.0,
            grade_alert_threshold=60.0
        )

        SchoolConfiguration.objects.get_or_create(school=school, defaults={'status': 'draft'})

        new_user = User(
            username=admin_username,
            email=admin_email,
            first_name=admin_first_name,
            last_name=admin_last_name,
            role='organisation_admin',
            organisation=org,
            school=school,
            is_active=True,
        )
        if admin_password:
            new_user.set_password(admin_password)
        else:
            new_user.set_password(get_random_string(12))
        new_user.full_clean()
        new_user.save()

        # Subscription setup
        target_plan = None
        if plan_code in ('standard', 'premium', 'custom'):
            target_plan = Plan.objects.filter(code=plan_code).first()

        now = timezone.now()
        paid_until = None
        if paid_until_str:
            from django.utils.dateparse import parse_datetime, parse_date
            dt = parse_datetime(str(paid_until_str).strip())
            if not dt:
                d = parse_date(str(paid_until_str).strip())
                if d:
                    from datetime import datetime, time
                    dt = timezone.make_aware(datetime.combine(d, time(23, 59, 59)))
            paid_until = dt
        else:
            paid_until = now + timedelta(days=30)

        sub = SchoolSubscription.objects.create(
            school=school,
            plan=target_plan,
            status=status,
            current_period_start=now,
            paid_until=paid_until,
            student_count_at_last_invoice=0,
        )

        plan_display = target_plan.name if target_plan else '30-Day Free Trial'
        SubscriptionEvent.objects.create(
            school=school,
            event_type='status_changed',
            to_status=status,
            to_plan=plan_display,
            actor=request.user,
            notes=f"Created by platform owner ({request.user.username}) for {admin_first_name} {admin_last_name} ({admin_email}) on {plan_display}.",
            metadata={'created_by_platform_admin': True, 'admin_username': admin_username, 'plan_code': plan_code}
        )

        invalidate_school_entitlements_cache(school.id)

    return Response({
        'ok': True,
        'message': f"School '{school.name}' registered successfully.",
        'school_id': school.id,
        'school_name': school.name,
        'school_code': school.code,
        'admin_username': admin_username,
        'admin_email': admin_email,
        'plan_code': target_plan.code if target_plan else 'free',
        'plan_name': plan_display,
        'status': status,
    }, status=201)


@api_view(['PATCH', 'PUT', 'POST'])
@permission_classes([IsAuthenticated])
def platform_admin_update_school_view(request, school_id):
    """
    Platform admin action: updates a school's core details (name, code, city, organisation,
    admin contact, and subscription tier/dates).
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    school = get_object_or_404(School, id=school_id)
    sub, _ = SchoolSubscription.objects.get_or_create(school=school)
    data = request.data or {}

    with transaction.atomic():
        if 'name' in data and data['name']:
            school.name = str(data['name']).strip()[:160]
        if 'code' in data and data['code']:
            school.code = str(data['code']).strip()[:32]
        if 'city' in data:
            school.city = str(data['city']).strip()[:120]
        if 'currency' in data and data['currency']:
            curr = str(data['currency']).strip().upper()[:8]
            if curr in CURRENCIES:
                school.currency = curr
        school.save()

        # Update organisation name if provided
        if school.organisation and 'organisation_name' in data and data['organisation_name']:
            school.organisation.name = str(data['organisation_name']).strip()[:160]
            school.organisation.save()

        # Update primary admin user if provided
        admin_user = User.objects.filter(school=school).order_by('id').first()
        if not admin_user and school.organisation_id:
            admin_user = User.objects.filter(organisation_id=school.organisation_id).order_by('id').first()

        if admin_user:
            if 'admin_first_name' in data and data['admin_first_name']:
                admin_user.first_name = str(data['admin_first_name']).strip()[:150]
            if 'admin_last_name' in data and data['admin_last_name']:
                admin_user.last_name = str(data['admin_last_name']).strip()[:150]
            if 'admin_name' in data and data['admin_name']:
                parts = str(data['admin_name']).strip().split(' ', 1)
                admin_user.first_name = parts[0]
                admin_user.last_name = parts[1] if len(parts) > 1 else ''
            if 'admin_email' in data and data['admin_email']:
                email_val = str(data['admin_email']).strip().lower()[:254]
                if email_val != admin_user.email:
                    if not User.objects.filter(email__iexact=email_val).exclude(id=admin_user.id).exists():
                        admin_user.email = email_val
            if 'admin_username' in data and data['admin_username']:
                uname = str(data['admin_username']).strip()[:150]
                if uname != admin_user.username:
                    if not User.objects.filter(username__iexact=uname).exclude(id=admin_user.id).exists():
                        admin_user.username = uname
            admin_user.save()

        # Update plan/package if provided
        plan_code = str(data.get('plan_code', '')).strip().lower()
        if plan_code:
            if plan_code in ('free', 'trial', 'no_plan'):
                sub.plan = None
                sub.status = 'trial' if plan_code != 'no_plan' else 'no_plan'
            else:
                p = Plan.objects.filter(code=plan_code).first() or Plan.objects.filter(code__iexact=plan_code).first()
                if p:
                    sub.plan = p

        # Update status if provided
        if 'status' in data and data['status']:
            st = str(data['status']).strip().lower()
            valid_statuses = ['active', 'trial', 'past_due', 'suspended', 'no_plan']
            if st in valid_statuses:
                sub.status = st

        # Update paid_until if provided
        if 'paid_until' in data:
            val = data['paid_until']
            if str(val).strip() in ('', 'null', 'None'):
                sub.paid_until = None
            else:
                from django.utils.dateparse import parse_datetime, parse_date
                dt = parse_datetime(str(val).strip())
                if not dt:
                    d = parse_date(str(val).strip())
                    if d:
                        from datetime import datetime, time
                        dt = timezone.make_aware(datetime.combine(d, time(23, 59, 59)))
                if dt:
                    sub.paid_until = dt

        sub.save()
        invalidate_school_entitlements_cache(school.id)

        SubscriptionEvent.objects.create(
            school=school,
            event_type='admin_altered',
            actor=request.user,
            notes=f"School profile updated by {request.user.username}. Plan: {sub.plan.name if sub.plan else 'Free Trial'} ({sub.status})",
            metadata={'updated_fields': list(data.keys()), 'updated_by': request.user.username}
        )

    return Response({
        'ok': True,
        'message': f"School '{school.name}' updated successfully.",
        'school_id': school.id,
        'school_name': school.name,
        'school_code': school.code,
        'city': school.city,
        'plan_code': sub.plan.code if sub.plan else 'free',
        'plan_name': sub.plan.name if sub.plan else '30-Day Free Trial',
        'status': sub.status,
        'paid_until': sub.paid_until.isoformat() if sub.paid_until else None,
    })


@api_view(['DELETE', 'POST'])
@permission_classes([IsAuthenticated])
def platform_admin_delete_school_view(request, school_id):
    """
    Platform admin action: safely and completely deletes a school and all associated
    tenant records, preventing foreign key ProtectedError exceptions.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    school = get_object_or_404(School, id=school_id)
    school_name = school.name
    org = school.organisation

    with transaction.atomic():
        from core.models import (
            Attendance, Grade, Assessment, HomeworkSubmission, Homework,
            Enrollment, Student, Subject, SchoolClass, AcademicYear,
            StaffMember, StaffAttendance, RoleAssignment, HolidayCalendar, ClassTimetable,
            AuditEvent, Notification, TeachingAssignment, ReviewCase, Intervention,
            SchoolConfiguration, SchoolConfigurationVersion, PublishedSchoolIndicator,
            FinanceCategory, FinanceEntry, FeeHead, FeeStructure, FeePayment, StudentFee, Concession, FeePaymentAllocation,
            SalaryRecord, SalaryStructure, SalaryAdjustment, ExamSession, ExamPaper, AssessmentCategory, GradingScale, PublishedResult,
            ClassTeacherAssignment, ClassSubject, Observation, EvaluationSafeguardingReferral, SupportAccessGrant
        )

        # Pre-delete dependent allocations & papers that PROTECT parent records
        FeePaymentAllocation.objects.filter(payment__school=school).delete()
        FeePaymentAllocation.objects.filter(student_fee__student__school=school).delete()
        ExamPaper.objects.filter(session__school=school).delete()
        ExamPaper.objects.filter(school_class__school=school).delete()
        Intervention.objects.filter(case__school=school).delete()

        # Class level relationships
        Attendance.objects.filter(school_class__school=school).delete()
        Grade.objects.filter(student__school=school).delete()
        Assessment.objects.filter(school_class__school=school).delete()
        HomeworkSubmission.objects.filter(homework__school_class__school=school).delete()
        Homework.objects.filter(school_class__school=school).delete()
        Enrollment.objects.filter(school_class__school=school).delete()
        ClassTimetable.objects.filter(school_class__school=school).delete()
        ClassTeacherAssignment.objects.filter(school_class__school=school).delete()
        ClassSubject.objects.filter(school_class__school=school).delete()

        # Direct school and student/staff PROTECT models
        StudentFee.objects.filter(student__school=school).delete()
        Concession.objects.filter(student__school=school).delete()
        Observation.objects.filter(student__school=school).delete()
        Observation.objects.filter(teacher__school=school).delete()
        EvaluationSafeguardingReferral.objects.filter(school=school).delete()
        SupportAccessGrant.objects.filter(school=school).delete()
        StaffAttendance.objects.filter(school=school).delete()
        TeachingAssignment.objects.filter(school=school).delete()
        ReviewCase.objects.filter(school=school).delete()
        AuditEvent.objects.filter(school=school).delete()
        Notification.objects.filter(user__school=school).delete()
        PublishedSchoolIndicator.objects.filter(school=school).delete()
        SchoolConfigurationVersion.objects.filter(configuration__school=school).delete()
        SchoolConfiguration.objects.filter(school=school).delete()
        FeePayment.objects.filter(school=school).delete()
        FeeStructure.objects.filter(school=school).delete()
        FeeHead.objects.filter(school=school).delete()
        FinanceEntry.objects.filter(school=school).delete()
        FinanceCategory.objects.filter(school=school).delete()
        SalaryAdjustment.objects.filter(staff__school=school).delete()
        SalaryStructure.objects.filter(staff__school=school).delete()
        SalaryRecord.objects.filter(school=school).delete()
        PublishedResult.objects.filter(school=school).delete()
        ExamSession.objects.filter(school=school).delete()
        AssessmentCategory.objects.filter(school=school).delete()
        GradingScale.objects.filter(school=school).delete()
        HolidayCalendar.objects.filter(school=school).delete()

        # Students & staff
        students = list(Student.objects.filter(school=school))
        for st in students:
            u = st.user
            st.delete()
            if u and u.role == 'student':
                u.delete()

        staff_members = list(StaffMember.objects.filter(school=school))
        for sm in staff_members:
            u = sm.user
            sm.delete()
            if u and u.role == 'teacher' and not u.is_superuser:
                u.delete()

        # Classes, subjects, years
        SchoolClass.objects.filter(school=school).delete()
        Subject.objects.filter(school=school).delete()
        AcademicYear.objects.filter(school=school).delete()

        # Clean users assigned to this school
        users = list(User.objects.filter(school=school))
        for u in users:
            if not u.is_superuser and u.role != 'platform_admin':
                u.delete()
            else:
                u.school = None
                u.save(update_fields=['school'])

        # Now school can be safely deleted (cascading subscriptions, orders, events, overrides)
        school.delete()

        # If organisation has no more schools, clean up the empty organisation
        if org and org.schools.count() == 0:
            AuditEvent.objects.filter(organisation=org).delete()
            SupportAccessGrant.objects.filter(organisation=org).delete()
            Notification.objects.filter(user__organisation=org).delete()
            User.objects.filter(organisation=org).exclude(is_superuser=True).exclude(role='platform_admin').delete()
            OrganisationSubscription.objects.filter(organisation=org).delete()
            org.delete()

    return Response({
        'ok': True,
        'message': f"School '{school_name}' and all associated records deleted successfully."
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_finance_analytics_view(request):
    """
    Platform admin comprehensive finance and revenue analytics endpoint.
    Aggregates total earnings (USD & PKR), MRR run rate, plan distribution, monthly revenue trend, and top earning schools.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    from django.db.models import Sum, Count

    approved_orders = SubscriptionOrder.objects.filter(status__in=['approved', 'paid'])
    total_revenue_usd = approved_orders.filter(currency='USD').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    total_revenue_pkr = approved_orders.filter(currency='PKR').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    pending_orders = SubscriptionOrder.objects.filter(status='pending')
    pending_revenue_usd = pending_orders.filter(currency='USD').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    pending_revenue_pkr = pending_orders.filter(currency='PKR').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    schools = School.objects.select_related('subscription', 'subscription__plan', 'organisation').all()
    total_schools = len(schools)

    total_students = 0
    active_schools_count = 0
    trial_schools_count = 0
    past_due_schools_count = 0
    suspended_schools_count = 0

    free_trial_count = 0
    standard_count = 0
    premium_count = 0
    custom_count = 0

    monthly_run_rate_usd = Decimal('0.00')
    monthly_run_rate_pkr = Decimal('0.00')

    per_school_stats = []

    for s in schools:
        sub = getattr(s, 'subscription', None)
        active_count = get_active_enrolled_student_count(s)
        total_students += active_count

        plan_code = (sub.plan.code if (sub and sub.plan) else 'free').lower()
        sub_status = (sub.status if sub else 'trial').lower()

        is_trial = plan_code in ('free', 'no_plan') or sub_status in ('trial', 'no_plan')
        if is_trial:
            trial_schools_count += 1
            free_trial_count += 1
        elif plan_code == 'standard':
            standard_count += 1
        elif plan_code == 'premium':
            premium_count += 1
        else:
            custom_count += 1

        if sub_status == 'active':
            active_schools_count += 1
        elif sub_status == 'past_due':
            past_due_schools_count += 1
        elif sub_status == 'suspended':
            suspended_schools_count += 1

        rate_usd = Decimal('3.60') if plan_code == 'standard' else (Decimal('7.20') if plan_code == 'premium' else Decimal('0.00'))
        rate_pkr = Decimal('1000.00') if plan_code == 'standard' else (Decimal('2000.00') if plan_code == 'premium' else Decimal('0.00'))

        m_usd = round(Decimal(str(active_count)) * rate_usd, 2)
        m_pkr = round(Decimal(str(active_count)) * rate_pkr, 2)

        if sub_status == 'active' and not is_trial:
            monthly_run_rate_usd += m_usd
            monthly_run_rate_pkr += m_pkr

        sch_orders = approved_orders.filter(school=s)
        sch_paid_usd = sch_orders.filter(currency='USD').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        sch_paid_pkr = sch_orders.filter(currency='PKR').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        per_school_stats.append({
            'school_id': s.id,
            'school_name': s.name,
            'school_code': s.code,
            'city': s.city or '',
            'plan_code': plan_code,
            'plan_name': 'Standard Plan' if plan_code == 'standard' else ('Premium Plan' if plan_code == 'premium' else '30-Day Free Trial'),
            'status': sub_status,
            'active_students': active_count,
            'monthly_revenue_usd': str(m_usd),
            'monthly_revenue_pkr': str(m_pkr),
            'total_paid_usd': str(sch_paid_usd),
            'total_paid_pkr': str(sch_paid_pkr),
        })

    per_school_stats.sort(key=lambda x: (float(x['total_paid_usd']) + float(x['monthly_revenue_usd'])), reverse=True)

    # Monthly Revenue Trend (Last 6 months)
    revenue_by_month = []
    now = timezone.now()
    for i in range(5, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1

        month_label = f"{timezone.datetime(year, month, 1).strftime('%b %Y')}"
        month_key = f"{year}-{month:02d}"

        month_orders = approved_orders.filter(
            created_at__year=year,
            created_at__month=month
        )
        m_usd = month_orders.filter(currency='USD').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        m_pkr = month_orders.filter(currency='PKR').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        order_count = month_orders.count()

        revenue_by_month.append({
            'month': month_label,
            'month_key': month_key,
            'usd': str(m_usd),
            'pkr': str(m_pkr),
            'orders_count': order_count,
        })

    return Response({
        'kpis': {
            'total_revenue_usd': str(total_revenue_usd),
            'total_revenue_pkr': str(total_revenue_pkr),
            'monthly_run_rate_usd': str(monthly_run_rate_usd),
            'monthly_run_rate_pkr': str(monthly_run_rate_pkr),
            'total_schools': total_schools,
            'total_students': total_students,
            'active_schools_count': active_schools_count,
            'trial_schools_count': trial_schools_count,
            'past_due_schools_count': past_due_schools_count,
            'suspended_schools_count': suspended_schools_count,
            'pending_orders_count': pending_orders.count(),
            'pending_orders_usd': str(pending_revenue_usd),
            'pending_orders_pkr': str(pending_revenue_pkr),
            'approved_orders_count': approved_orders.count(),
        },
        'plan_distribution': {
            'free_trial': free_trial_count,
            'standard': standard_count,
            'premium': premium_count,
            'custom': custom_count,
            'total': total_schools,
        },
        'revenue_by_month': revenue_by_month,
        'per_school_ranking': per_school_stats[:10],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_orders_view(request):
    """Platform admin review queue of pending and historical offline subscription orders."""
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
        'subtotal': str(o.subtotal),
        'discount_percentage': str(o.discount_percentage),
        'discount_amount': str(o.discount_amount),
        'upgrade_credit_amount': str(o.upgrade_credit_amount),
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
    """Platform admin action: approves an offline bank payment order and activates the subscription."""
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
    """Platform admin action: rejects an offline bank payment order with required audit note."""
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


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def school_refund_requests_view(request):
    """
    GET: Returns refund and package change requests submitted by this school.
    POST: Submits a new refund/plan change request within the 2-day policy window.
    """
    school = _resolve_school_for_user(request)
    if not school:
        raise PermissionDenied("An educational institution affiliation is required.")

    if request.method == 'GET':
        requests = PlanRefundRequest.objects.filter(school=school).select_related('order', 'reviewed_by').order_by('-created_at')
        results = [{
            'id': r.id,
            'order_id': r.order.id,
            'order_number': r.order.order_number,
            'plan_name': r.order.plan.name if r.order.plan else 'Custom Plan',
            'amount': str(r.order.amount),
            'currency': r.order.currency,
            'reason': r.reason,
            'intended_change': r.intended_change,
            'bank_name': r.bank_name,
            'account_title': r.account_title,
            'account_number': r.account_number,
            'status': r.status,
            'admin_notes': r.admin_notes,
            'refund_transaction_reference': r.refund_transaction_reference,
            'created_at': r.created_at.isoformat(),
            'reviewed_at': r.reviewed_at.isoformat() if r.reviewed_at else None,
        } for r in requests]
        return Response({'results': results})

    # POST: Submit new request
    if request.user.role not in ('owner', 'organisation_admin', 'school_admin'):
        raise PermissionDenied("Only institutional administrators can request plan changes or refunds.")

    data = request.data or {}
    order_id = data.get('order_id')
    reason = str(data.get('reason', '')).strip()
    intended_change = str(data.get('intended_change', '')).strip()
    bank_name = str(data.get('bank_name', '')).strip()
    account_title = str(data.get('account_title', '')).strip()
    account_number = str(data.get('account_number', '')).strip()

    if not order_id:
        return Response({'detail': 'order_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not reason:
        return Response({'detail': 'Please provide a reason for the plan change / refund request.'}, status=status.HTTP_400_BAD_REQUEST)

    order = SubscriptionOrder.objects.filter(school=school, id=order_id).first()
    if not order:
        return Response({'detail': 'Order not found for this school.'}, status=status.HTTP_404_NOT_FOUND)

    if order.status not in ('paid', 'approved'):
        return Response({'detail': f"Orders with status '{order.status}' cannot be refunded."}, status=status.HTTP_400_BAD_REQUEST)

    # 2-day policy check: 48 hours from order creation
    now = timezone.now()
    elapsed_seconds = (now - order.created_at).total_seconds()
    if elapsed_seconds > (48 * 3600):
        return Response({
            'detail': "Under our 2-day package change and refund policy, refund requests must be submitted within 48 hours of purchase."
        }, status=status.HTTP_400_BAD_REQUEST)

    # Check for active request
    existing = PlanRefundRequest.objects.filter(order=order, status__in=['pending', 'approved']).first()
    if existing:
        return Response({
            'detail': f"A refund request (Status: {existing.status}) is already on file for Order #{order.order_number}."
        }, status=status.HTTP_400_BAD_REQUEST)

    refund_req = PlanRefundRequest.objects.create(
        order=order,
        school=school,
        requested_by=request.user,
        reason=reason,
        intended_change=intended_change,
        bank_name=bank_name,
        account_title=account_title,
        account_number=account_number,
        status='pending'
    )

    SubscriptionEvent.objects.create(
        school=school,
        event_type='refund_requested',
        from_status=order.status,
        to_status=order.status,
        from_plan=order.plan.code if order.plan else '',
        to_plan=order.plan.code if order.plan else '',
        actor=request.user,
        notes=f"Refund / Plan Change requested for Order #{order.order_number}. Reason: {reason[:120]}",
        metadata={
            'refund_request_id': refund_req.id,
            'order_id': order.id,
            'order_number': order.order_number,
            'amount': str(order.amount),
            'currency': order.currency,
            'intended_change': intended_change,
        }
    )

    return Response({
        'message': f"Plan change & refund request for Order #{order.order_number} submitted successfully. Platform administrators will review your request.",
        'refund_request_id': refund_req.id,
        'status': refund_req.status,
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def platform_admin_refund_requests_view(request):
    """
    Platform admin endpoint: lists all plan change & refund requests across the entire system.
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    qs = PlanRefundRequest.objects.select_related('school', 'order', 'order__plan', 'requested_by', 'reviewed_by').order_by('-created_at')
    results = [{
        'id': r.id,
        'school_id': r.school.id,
        'school_name': r.school.name,
        'school_code': r.school.code,
        'order_id': r.order.id,
        'order_number': r.order.order_number,
        'plan_name': r.order.plan.name if r.order.plan else 'Custom Plan',
        'order_amount': str(r.order.amount),
        'currency': r.order.currency,
        'order_created_at': r.order.created_at.isoformat(),
        'reason': r.reason,
        'intended_change': r.intended_change,
        'bank_name': r.bank_name,
        'account_title': r.account_title,
        'account_number': r.account_number,
        'status': r.status,
        'admin_notes': r.admin_notes,
        'refund_transaction_reference': r.refund_transaction_reference,
        'requested_by_name': r.requested_by.get_full_name() if r.requested_by else (r.requested_by.username if r.requested_by else 'Admin'),
        'reviewed_by_name': r.reviewed_by.get_full_name() if r.reviewed_by else None,
        'created_at': r.created_at.isoformat(),
        'reviewed_at': r.reviewed_at.isoformat() if r.reviewed_at else None,
    } for r in qs]

    return Response({'results': results})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def platform_admin_refund_action_view(request, pk):
    """
    Platform admin endpoint: Approves or Rejects a refund request.
    If Approved:
      - Sets order status to 'refunded'
      - Records admin transfer reference and notes
      - Resets the school's active subscription to trial so customer can re-subscribe cleanly
      - Invalidates entitlements cache
      - Logs audit event
    """
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    refund_req = get_object_or_404(PlanRefundRequest, pk=pk)
    data = request.data or {}
    action = data.get('action') # 'approve' or 'reject'
    admin_notes = str(data.get('admin_notes', '')).strip()
    refund_ref = str(data.get('refund_transaction_reference', '')).strip()

    if action not in ('approve', 'reject'):
        return Response({'detail': "action must be 'approve' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    if action == 'approve':
        refund_req.status = 'approved'
        refund_req.reviewed_by = request.user
        refund_req.reviewed_at = now
        refund_req.admin_notes = admin_notes
        refund_req.refund_transaction_reference = refund_ref
        refund_req.save()

        # Update order
        order = refund_req.order
        order.status = 'refunded'
        order.refunded_at = now
        order.review_note = f"Refund approved by {request.user.get_full_name() or request.user.username}. Ref: {refund_ref}. Notes: {admin_notes}".strip()
        order.save(update_fields=['status', 'refunded_at', 'review_note', 'updated_at'])

        # Reset school's active subscription so user can subscribe to new package cleanly
        school = refund_req.school
        sub = getattr(school, 'subscription', None)
        if sub:
            old_plan = sub.plan.code if sub.plan else 'none'
            old_status = sub.status
            sub.status = 'trial'
            sub.plan = None
            # Give 7-day grace/trial buffer so school is not locked while picking new package
            sub.paid_until = now + timedelta(days=7)
            sub.grace_until = None
            sub.save()

            SubscriptionEvent.objects.create(
                school=school,
                event_type='refund_approved',
                from_status=old_status,
                to_status='trial',
                from_plan=old_plan,
                to_plan='trial',
                actor=request.user,
                notes=f"Order #{order.order_number} refunded ({order.amount} {order.currency}). Ref: {refund_ref}. School subscription reset to trial for new package selection.",
                metadata={
                    'order_id': order.id,
                    'order_number': order.order_number,
                    'refund_transaction_reference': refund_ref,
                    'admin_notes': admin_notes,
                }
            )
            invalidate_school_entitlements_cache(school.id)

        return Response({
            'message': f"Refund request #{refund_req.id} approved. Order #{order.order_number} marked as refunded and subscription reset.",
            'status': 'approved',
            'order_id': order.id,
        })

    else: # reject
        refund_req.status = 'rejected'
        refund_req.reviewed_by = request.user
        refund_req.reviewed_at = now
        refund_req.admin_notes = admin_notes
        refund_req.save()

        return Response({
            'message': f"Refund request #{refund_req.id} rejected.",
            'status': 'rejected',
        })

