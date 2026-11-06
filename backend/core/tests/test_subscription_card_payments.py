"""
Unit and Integration Tests for Card Payments, Hosted Checkout, Webhooks,
Idempotency, and Entitlements Enforcement.
All tests run against PostgreSQL test database.
"""
from datetime import date, timedelta
from decimal import Decimal
import json

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import (
    Organisation,
    School,
    User,
    AcademicYear,
    SchoolClass,
    Student,
    Enrollment,
    Plan,
    PlanFeature,
    FeatureCatalog,
    PlatformBillingSettings,
    SchoolSubscription,
    SubscriptionOrder,
    SubscriptionEvent,
)
from core.services.entitlements import (
    get_school_entitlements,
    get_effective_subscription_status,
    invalidate_school_entitlements_cache,
)
from core.services.payments.fake import FakeProvider


class SubscriptionCardPaymentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.fake_provider = FakeProvider()

        # 1. Platform Settings
        self.settings = PlatformBillingSettings.get_settings()
        self.settings.bank_name = 'National Bank Limited'
        self.settings.account_title = 'Optimus Orien EdTech'
        self.settings.account_number = '112233445566'
        self.settings.default_trial_days = 3
        self.settings.pending_grace_days = 3
        self.settings.past_due_grace_days = 7
        self.settings.yearly_discount_percentage = Decimal('10.00')
        self.settings.save()

        # 2. Plans
        self.standard_plan, _ = Plan.objects.get_or_create(
            code='standard',
            defaults={
                'name': 'Standard Plan',
                'price_usd_per_student': Decimal('3.60'),
                'price_pkr_per_student': Decimal('1000.00'),
                'is_active': True,
                'display_order': 1,
            }
        )
        self.premium_plan, _ = Plan.objects.get_or_create(
            code='premium',
            defaults={
                'name': 'Premium Plan',
                'price_usd_per_student': Decimal('7.20'),
                'price_pkr_per_student': Decimal('2000.00'),
                'is_active': True,
                'display_order': 2,
            }
        )

        # 3. Organisations & Schools (Tenants)
        self.org_a = Organisation.objects.create(name='Alpha Trust', code='alpha-trust', allow_org_admin_student_access=True)
        self.school_a = School.objects.create(name='Alpha School', code='ALPHA-1', organisation=self.org_a)

        self.org_b = Organisation.objects.create(name='Beta Trust', code='beta-trust', allow_org_admin_student_access=True)
        self.school_b = School.objects.create(name='Beta School', code='BETA-1', organisation=self.org_b)

        # 4. Users
        self.platform_admin = User.objects.create_user(
            username='platform_superadmin',
            email='admin@optimusorien.com',
            password='SecurePassword123!',
            role='owner',
            is_staff=True,
            is_superuser=True,
        )
        self.admin_a = User.objects.create_user(
            username='admin_alpha',
            email='admin@alpha.edu.pk',
            password='SecurePassword123!',
            role='organisation_admin',
            organisation=self.org_a,
            school=self.school_a,
        )
        self.admin_b = User.objects.create_user(
            username='admin_beta',
            email='admin@beta.edu.pk',
            password='SecurePassword123!',
            role='organisation_admin',
            organisation=self.org_b,
            school=self.school_b,
        )

        # 5. Populate active enrolled students for school A (10 students)
        self.academic_year_a = AcademicYear.objects.create(
            school=self.school_a,
            name='2026-2027',
            start_date=date(2026, 1, 1),
            end_date=date(2026, 12, 31),
        )
        self.class_a = SchoolClass.objects.create(
            school=self.school_a,
            academic_year=self.academic_year_a,
            name='Grade 6',
            grade_level='6',
        )
        for i in range(1, 11):
            st = Student.objects.create(
                school=self.school_a,
                admission_number=f"ALPHA-CARD-{i}",
                first_name=f"Student{i}",
                last_name="Card",
                enrolled_on=date(2026, 1, 15),
                active=True,
            )
            Enrollment.objects.create(
                student=st,
                school_class=self.class_a,
                start_date=date(2026, 1, 15),
            )

    # --------------------------------------------------------------------------
    # 1. Plan x Feature Matrix Tests
    # --------------------------------------------------------------------------

    def test_plan_by_feature_matrix_standard_locked_premium_unlocked(self):
        """
        Standard school gets 403 feature_locked on Premium endpoints.
        Trial and Premium schools get 200.
        """
        # Set school A to Standard
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.standard_plan, 'status': 'active', 'paid_until': timezone.now() + timedelta(days=30)}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)
        res = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data.get('code'), 'feature_locked')
        self.assertEqual(res.data.get('feature_key'), 'aqi_history')
        self.assertEqual(res.data.get('required_plan'), 'premium')

        # Upgrade to Premium: now accessible
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.premium_plan, 'status': 'active'}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        res_prem = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_prem.status_code, 200)

    # --------------------------------------------------------------------------
    # 2. Server-Side Price & Checkout Session Creation
    # --------------------------------------------------------------------------

    def test_card_order_creation_computes_amount_server_side(self):
        """
        Amounts are computed strictly on the server from the database:
        10 active students x 7.20 USD x 12 months with 10% discount = 777.60 USD.
        Client cannot spoof amount.
        """
        self.client.force_authenticate(user=self.admin_a)

        # Attempt to spoof amount by submitting amount=1.00
        res = self.client.post('/api/v1/subscription/orders/', {
            'plan_code': 'premium',
            'billing_months': 12,
            'payment_method': 'card',
            'currency': 'USD',
            'amount': '1.00',  # Spoofed attempt
        }, format='json')

        self.assertEqual(res.status_code, 201)
        order_data = res.data['order']
        self.assertEqual(Decimal(order_data['amount']), Decimal('777.60'))
        self.assertEqual(order_data['student_count'], 10)
        self.assertEqual(order_data['status'], 'pending')
        self.assertIn('checkout_url', order_data)
        self.assertTrue(order_data['checkout_url'].startswith('http'))

    # --------------------------------------------------------------------------
    # 3. Webhook Signature Verification Tests
    # --------------------------------------------------------------------------

    def test_webhook_signature_verification_valid_and_invalid(self):
        """
        Webhook rejects missing or invalid signatures with HTTP 400.
        Valid signatures are processed with HTTP 200.
        """
        order = SubscriptionOrder.objects.create(
            order_number='ORD-TEST-SIG-01',
            school=self.school_a,
            plan=self.premium_plan,
            billing_months=1,
            student_count=10,
            unit_price=Decimal('7.20'),
            discount_percentage=Decimal('0.00'),
            amount=Decimal('72.00'),
            currency='USD',
            provider='fake',
            status='pending',
        )

        payload_bytes = self.fake_provider.build_test_webhook_payload(order, event_type='order.paid')

        # 1. Missing signature -> 400
        res_no_sig = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload_bytes,
            content_type='application/json'
        )
        self.assertEqual(res_no_sig.status_code, 400)

        # 2. Tampered / wrong signature -> 400
        res_bad_sig = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload_bytes,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE='sha256=invalid_hash_signature_12345'
        )
        self.assertEqual(res_bad_sig.status_code, 400)

        # 3. Valid signature -> 200
        valid_sig = self.fake_provider.generate_signature(payload_bytes)
        res_valid = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload_bytes,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE=valid_sig
        )
        self.assertEqual(res_valid.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        self.assertIsNotNone(order.paid_at)

    # --------------------------------------------------------------------------
    # 4. Webhook Idempotency & Replay Protection
    # --------------------------------------------------------------------------

    def test_webhook_idempotency_same_event_twice_no_double_activation(self):
        """
        Duplicate delivery of the exact same event delivers HTTP 200 and
        does not extend the paid_until period twice.
        """
        order = SubscriptionOrder.objects.create(
            order_number='ORD-TEST-IDEMP-01',
            school=self.school_a,
            plan=self.premium_plan,
            billing_months=1,
            student_count=10,
            unit_price=Decimal('7.20'),
            discount_percentage=Decimal('0.00'),
            amount=Decimal('72.00'),
            currency='USD',
            provider='fake',
            status='pending',
        )

        payload_bytes = self.fake_provider.build_test_webhook_payload(
            order, event_type='order.paid', event_id='evt_unique_1001'
        )
        sig = self.fake_provider.generate_signature(payload_bytes)

        # First delivery: activates subscription
        res1 = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload_bytes,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE=sig
        )
        self.assertEqual(res1.status_code, 200)

        sub = SchoolSubscription.objects.get(school=self.school_a)
        first_paid_until = sub.paid_until

        # Second delivery with same event_id: returns 200 idempotent
        res2 = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload_bytes,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE=sig
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data.get('status'), 'idempotent')

        # Ensure paid_until has NOT been extended twice
        sub.refresh_from_db()
        self.assertEqual(sub.paid_until, first_paid_until)

    # --------------------------------------------------------------------------
    # 5. Amount and Currency Mismatch Rejection
    # --------------------------------------------------------------------------

    def test_webhook_amount_mismatch_rejected_with_400(self):
        """
        If webhook event amount differs from database order amount,
        it is rejected with HTTP 400 and order is marked failed.
        """
        order = SubscriptionOrder.objects.create(
            order_number='ORD-TEST-MISMATCH-01',
            school=self.school_a,
            plan=self.premium_plan,
            billing_months=1,
            student_count=10,
            unit_price=Decimal('7.20'),
            discount_percentage=Decimal('0.00'),
            amount=Decimal('72.00'),
            currency='USD',
            provider='fake',
            status='pending',
        )

        # Webhook payload reports only 10.00 USD paid
        tampered_payload = self.fake_provider.build_test_webhook_payload(
            order, event_type='order.paid', amount=Decimal('10.00')
        )
        sig = self.fake_provider.generate_signature(tampered_payload)

        res = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=tampered_payload,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE=sig
        )
        self.assertEqual(res.status_code, 400)

        order.refresh_from_db()
        self.assertEqual(order.status, 'failed')
        self.assertIn('mismatch', order.failure_reason.lower())

    # --------------------------------------------------------------------------
    # 6. Database Reflection: Prices Come Strictly From DB Models
    # --------------------------------------------------------------------------

    def test_prices_come_only_from_database_models(self):
        """
        Changing the plan's price in the database dynamically changes
        the invoice estimate without any Python code change.
        """
        self.client.force_authenticate(user=self.admin_a)

        # Baseline: 10 students * 7.20 * 1 = 72.00
        res1 = self.client.get('/api/v1/subscription/invoice-estimate/?plan=premium&months=1&currency=USD')
        self.assertEqual(Decimal(res1.data['payable_amount']), Decimal('72.00'))

        # Update DB price: 8.50 USD
        self.premium_plan.price_usd_per_student = Decimal('8.50')
        self.premium_plan.save(update_fields=['price_usd_per_student'])

        res2 = self.client.get('/api/v1/subscription/invoice-estimate/?plan=premium&months=1&currency=USD')
        self.assertEqual(Decimal(res2.data['payable_amount']), Decimal('85.00'))

    # --------------------------------------------------------------------------
    # 7. Multi-Tenant Cache Isolation: School A Never Affects School B
    # --------------------------------------------------------------------------

    def test_multi_tenant_isolation_school_a_never_affects_school_b(self):
        """
        School A on Standard plan cannot access Premium features.
        School B on Premium plan CAN access Premium features.
        School A's plan change never unlocks School B or vice-versa.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.standard_plan, 'status': 'active'}
        )
        SchoolSubscription.objects.update_or_create(
            school=self.school_b,
            defaults={'plan': self.premium_plan, 'status': 'active'}
        )
        invalidate_school_entitlements_cache(self.school_a.id)
        invalidate_school_entitlements_cache(self.school_b.id)

        # Admin A (Standard) gets 403
        self.client.force_authenticate(user=self.admin_a)
        res_a = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_a.status_code, 403)

        # Admin B (Premium) gets 200
        self.client.force_authenticate(user=self.admin_b)
        res_b = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_b.status_code, 200)

    # --------------------------------------------------------------------------
    # 8. Limited Mode Read-Only With Exports Allowed
    # --------------------------------------------------------------------------

    def test_limited_mode_read_only_with_exports_working(self):
        """
        When a school is in limited mode:
        - GET reads return 200
        - Data exports return 200
        - Mutating writes return 403 'limited_read_only'
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.standard_plan, 'status': 'limited'}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)

        # Reads allowed
        res_read = self.client.get('/api/v1/students/')
        self.assertEqual(res_read.status_code, 200)

        # Exports allowed
        res_export = self.client.get('/api/v1/exports/students.csv')
        self.assertEqual(res_export.status_code, 200)

        # Non-allowlisted write blocked
        res_write = self.client.post('/api/v1/students/', {
            'first_name': 'Blocked',
            'last_name': 'Student',
        }, format='json')
        self.assertEqual(res_write.status_code, 403)
        self.assertEqual(res_write.json().get('code'), 'limited_read_only')

    # --------------------------------------------------------------------------
    # 9. FakeProvider Full End-to-End Flow
    # --------------------------------------------------------------------------

    def test_fake_provider_end_to_end_card_flow_unlocks_premium(self):
        """
        Full lifecycle:
        1. School A is initially Standard (locked out of AQI).
        2. School A initiates card order for Premium.
        3. Webhook arrives with verified signature.
        4. Subscription upgrades to Premium.
        5. School A accesses AQI immediately with HTTP 200.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.standard_plan, 'status': 'active'}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)

        # 1. Feature locked
        res_locked = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_locked.status_code, 403)

        # 2. Initiate card order
        res_order = self.client.post('/api/v1/subscription/orders/', {
            'plan_code': 'premium',
            'billing_months': 3,
            'payment_method': 'card',
            'currency': 'USD',
        }, format='json')
        self.assertEqual(res_order.status_code, 201)
        order_num = res_order.data['order']['order_number']
        order = SubscriptionOrder.objects.get(order_number=order_num)

        # 3. Webhook simulates successful payment
        payload = self.fake_provider.build_test_webhook_payload(order, event_type='order.paid')
        sig = self.fake_provider.generate_signature(payload)

        self.client.logout()  # Webhook is an unauthenticated public callback
        res_hook = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE=sig
        )
        self.assertEqual(res_hook.status_code, 200)

        # 4. Verify subscription is now active Premium
        sub = SchoolSubscription.objects.get(school=self.school_a)
        self.assertEqual(sub.status, 'active')
        self.assertEqual(sub.plan.code, 'premium')

        # 5. School A now accesses AQI
        self.client.force_authenticate(user=self.admin_a)
        res_unlocked = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_unlocked.status_code, 200)

    # --------------------------------------------------------------------------
    # 10. Refund / Chargeback Downgrade Flow
    # --------------------------------------------------------------------------

    def test_refund_webhook_downgrades_subscription(self):
        """
        Refund or chargeback webhook marks order refunded and downgrades
        school to limited read-only mode with audit trail.
        """
        order = SubscriptionOrder.objects.create(
            order_number='ORD-TEST-REFUND-01',
            school=self.school_a,
            plan=self.premium_plan,
            billing_months=1,
            student_count=10,
            unit_price=Decimal('7.20'),
            discount_percentage=Decimal('0.00'),
            amount=Decimal('72.00'),
            currency='USD',
            provider='fake',
            status='paid',
        )
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.premium_plan, 'status': 'active'}
        )

        payload = self.fake_provider.build_test_webhook_payload(order, event_type='order.refunded')
        sig = self.fake_provider.generate_signature(payload)

        res = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE=sig
        )
        self.assertEqual(res.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.status, 'refunded')

        sub = SchoolSubscription.objects.get(school=self.school_a)
        self.assertEqual(sub.status, 'limited')

    # --------------------------------------------------------------------------
    # 11. Printable Order Receipt
    # --------------------------------------------------------------------------

    def test_printable_order_receipt_endpoint(self):
        """
        School admin can retrieve structured receipt data for an order.
        """
        order = SubscriptionOrder.objects.create(
            order_number='ORD-TEST-REC-01',
            school=self.school_a,
            plan=self.premium_plan,
            billing_months=6,
            student_count=10,
            unit_price=Decimal('7.20'),
            discount_percentage=Decimal('0.00'),
            amount=Decimal('432.00'),
            currency='USD',
            provider='paddle',
            provider_reference='txn_paddle_12345',
            status='paid',
            paid_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.admin_a)
        res = self.client.get(f'/api/v1/subscription/orders/{order.id}/receipt/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['order_number'], 'ORD-TEST-REC-01')
        self.assertEqual(res.data['plan_name'], 'Premium Plan')
        self.assertEqual(res.data['provider'], 'paddle')
        self.assertIn('platform_merchant', res.data)
