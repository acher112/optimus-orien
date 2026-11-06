"""
Views and API Endpoints for Subscriptions, Invoicing, Card Payments,
Entitlements Inspection, Upgrades/Downgrades, and Platform Admin Management.
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
    BillingPeriod,
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
    schedule_subscription_downgrade,
)
from core.services.payments import WebhookSignatureVerificationError

logger = logging.getLogger('core.subscription_views')


def _is_platform_admin(user):
    """Checks whether the user holds platform administrator authority."""
    return bool(user and user.is_authenticated and (
        user.is_superuser or user.role in ('platform_admin', 'owner') or (user.is_staff and not user.school_id)
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
        return Response({
            'school_id': None,
            'school_name': 'Organisation / Platform Admin',
            'status': 'active',
            'plan': {
                'code': 'premium',
                'name': 'Premium Plan',
                'name_ur': 'پریمیم پلان',
                'tagline': 'Platform Admin Access',
                'tagline_ur': 'ایڈمن رسائی',
                'price_usd_per_student': '7.20',
                'price_pkr_per_student': '2000.00',
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
        results = [{
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
        } for o in orders]
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
    """Platform admin directory of institutional subscribers, statuses, and counts."""
    if not _is_platform_admin(request.user):
        raise PermissionDenied("Platform administration access required.")

    schools = School.objects.select_related('subscription', 'subscription__plan', 'organisation').all().order_by('name')
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
            'plan_code': sub.plan.code if (sub and sub.plan) else 'no_plan',
            'plan_name': sub.plan.name if (sub and sub.plan) else 'No Plan',
            'status': sub.status if sub else 'no_plan',
            'paid_until': sub.paid_until.isoformat() if (sub and sub.paid_until) else None,
            'grace_until': sub.grace_until.isoformat() if (sub and sub.grace_until) else None,
            'pending_downgrade_to_plan': sub.pending_downgrade_to_plan.code if (sub and sub.pending_downgrade_to_plan) else None,
            'active_students': active_count,
            'student_count_at_last_invoice': invoiced_count,
            'has_student_growth': has_growth,
            'growth_count': max(0, active_count - invoiced_count),
        })

    return Response({'results': results})


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
