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
    BillingPeriod,
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
from core.services.subscriptions import (
    calculate_invoice_estimate,
    schedule_subscription_downgrade,
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
        self.settings.pending_grace_days = 3
        self.settings.past_due_grace_days = 7
        self.settings.save()

        # Ensure active billing periods exist
        BillingPeriod.get_active_periods()

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
    # 1. Three Access Levels: no_plan, Standard, Premium
    # --------------------------------------------------------------------------

    def test_new_school_starts_in_no_plan_feature_locking(self):
        """
        A newly registered school starts with status no_plan (nothing paid yet).
        Premium features AND paid Standard features are locked with 403 feature_locked.
        Basic access list (viewing plan/billing, school setup, export) remains open.
        """
        # Create un-subscribed / no_plan school
        school_c = School.objects.create(name='Gamma School', code='GAMMA-1', organisation=self.org_a)
        admin_c = User.objects.create_user(
            username='admin_gamma',
            email='gamma@alpha.edu.pk',
            password='SecurePassword123!',
            role='organisation_admin',
            organisation=self.org_a,
            school=school_c
        )
        sub = SchoolSubscription.objects.create(school=school_c, status='no_plan')
        invalidate_school_entitlements_cache(school_c.id)

        academic_year_c = AcademicYear.objects.create(school=school_c, name='2026', start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        class_c = SchoolClass.objects.create(school=school_c, academic_year=academic_year_c, name='Class C', grade_level='1')

        self.client.force_authenticate(user=admin_c)

        # 1. Premium endpoint locked
        res_prem = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_prem.status_code, 403)
        self.assertEqual(res_prem.data.get('code'), 'feature_locked')
        self.assertEqual(res_prem.data.get('required_plan'), 'premium')

        # 2. Paid Standard endpoint locked
        res_std = self.client.get(f'/api/v1/attendance/class-register/?school_class={class_c.id}')
        self.assertEqual(res_std.status_code, 403)
        self.assertEqual(res_std.data.get('code'), 'feature_locked')
        self.assertEqual(res_std.data.get('required_plan'), 'standard')

        # 3. Basic access endpoint open (own plan and billing page)
        res_basic = self.client.get('/api/v1/subscription/current/')
        self.assertEqual(res_basic.status_code, 200)
        self.assertEqual(res_basic.data.get('status'), 'no_plan')

    def test_paying_standard_unlocks_standard_keeps_premium_locked(self):
        """
        Paying for Standard unlocks Standard features. Premium features stay locked with 403.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.standard_plan, 'status': 'active', 'paid_until': timezone.now() + timedelta(days=30)}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)

        # Standard endpoint works
        res_std = self.client.get(f'/api/v1/attendance/class-register/?school_class={self.class_a.id}')
        self.assertEqual(res_std.status_code, 200)

        # Premium endpoint locked
        res_prem = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_prem.status_code, 403)
        self.assertEqual(res_prem.data.get('code'), 'feature_locked')
        self.assertEqual(res_prem.data.get('required_plan'), 'premium')

    def test_paying_premium_unlocks_all_endpoints(self):
        """
        Paying for Premium unlocks all features.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.premium_plan, 'status': 'active', 'paid_until': timezone.now() + timedelta(days=30)}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)
        res_std = self.client.get(f'/api/v1/attendance/class-register/?school_class={self.class_a.id}')
        self.assertEqual(res_std.status_code, 200)

        res_prem = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_prem.status_code, 200)

    # --------------------------------------------------------------------------
    # 2. Exact Amounts for 1, 4, 8, 12 Months for 100 Students
    # --------------------------------------------------------------------------

    def test_exact_worked_amounts_for_1_4_8_12_months_for_100_students(self):
        """
        Exact test cases matching user prompt:
        100 students, Standard 3.60 USD:
          1 month (0%): 360.00
          4 months (5%): 1,440.00 - 5% = 1,368.00
          8 months (10%): 2,880.00 - 10% = 2,592.00
          12 months (15%): 4,320.00 - 15% = 3,672.00
        Premium 7.20 USD:
          1 month (0%): 720.00
          4 months (5%): 2,736.00
          8 months (10%): 5,184.00
          12 months (15%): 7,344.00
        """
        # Standard Plan Tests
        std_cases = [
            (1, Decimal('360.00'), Decimal('0.00'), Decimal('360.00')),
            (4, Decimal('1440.00'), Decimal('72.00'), Decimal('1368.00')),
            (8, Decimal('2880.00'), Decimal('288.00'), Decimal('2592.00')),
            (12, Decimal('4320.00'), Decimal('648.00'), Decimal('3672.00')),
        ]
        for months, expected_subtotal, expected_discount, expected_total in std_cases:
            est = calculate_invoice_estimate(
                plan=self.standard_plan,
                billing_months=months,
                student_count=100,
                currency='USD'
            )
            self.assertEqual(est['subtotal'], expected_subtotal, f"Standard {months} mo subtotal mismatch")
            self.assertEqual(est['discount_amount'], expected_discount, f"Standard {months} mo discount mismatch")
            self.assertEqual(est['payable_amount'], expected_total, f"Standard {months} mo total mismatch")

        # Premium Plan Tests
        prem_cases = [
            (1, Decimal('720.00'), Decimal('0.00'), Decimal('720.00')),
            (4, Decimal('2880.00'), Decimal('144.00'), Decimal('2736.00')),
            (8, Decimal('5760.00'), Decimal('576.00'), Decimal('5184.00')),
            (12, Decimal('8640.00'), Decimal('1296.00'), Decimal('7344.00')),
        ]
        for months, expected_subtotal, expected_discount, expected_total in prem_cases:
            est = calculate_invoice_estimate(
                plan=self.premium_plan,
                billing_months=months,
                student_count=100,
                currency='USD'
            )
            self.assertEqual(est['subtotal'], expected_subtotal, f"Premium {months} mo subtotal mismatch")
            self.assertEqual(est['discount_amount'], expected_discount, f"Premium {months} mo discount mismatch")
            self.assertEqual(est['payable_amount'], expected_total, f"Premium {months} mo total mismatch")

    # --------------------------------------------------------------------------
    # 3. Upgrade Credit: Standard -> Premium During Active Period
    # --------------------------------------------------------------------------

    def test_upgrade_credit_calculated_and_subtracted_on_upgrade(self):
        """
        When upgrading from Standard to Premium during an active period:
        credit the unused value (remaining days x daily price) against the new Premium order.
        Credit appears as its own line on the invoice.
        """
        now = timezone.now()
        # School has 10 students active on Standard, paid for 30 days total, with 20 days remaining
        sub = SchoolSubscription.objects.create(
            school=self.school_a,
            plan=self.standard_plan,
            status='active',
            current_period_start=now - timedelta(days=10),
            paid_until=now + timedelta(days=20),
            student_count_at_last_invoice=10
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        # Calculate upgrade to Premium for 1 month
        # Standard daily rate = (3.60 * 10) / 30 = 1.20 USD / day
        # Remaining credit = 20 days * 1.20 = 24.00 USD
        # Premium 1 month = 10 * 7.20 * 1 = 72.00 USD
        # Payable amount = 72.00 - 24.00 = 48.00 USD
        est = calculate_invoice_estimate(
            plan=self.premium_plan,
            billing_months=1,
            student_count=10,
            currency='USD',
            school=self.school_a
        )
        self.assertEqual(est['upgrade_credit_amount'], Decimal('24.00'))
        self.assertEqual(est['payable_amount'], Decimal('48.00'))

    # --------------------------------------------------------------------------
    # 4. Period-End Downgrade & Zero Data Loss
    # --------------------------------------------------------------------------

    def test_downgrade_scheduled_for_period_end_and_data_retention(self):
        """
        Premium -> Standard downgrade takes effect at the end of the paid period.
        Prior to paid_until, Premium access remains.
        After paid_until, switches to Standard.
        No data is deleted; data created in Premium features reappears on upgrade.
        """
        now = timezone.now()
        paid_end = now + timedelta(days=5)
        sub = SchoolSubscription.objects.create(
            school=self.school_a,
            plan=self.premium_plan,
            status='active',
            current_period_start=now,
            paid_until=paid_end,
            student_count_at_last_invoice=10
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        # 1. Schedule downgrade to Standard
        self.client.force_authenticate(user=self.admin_a)
        res_downgrade = self.client.post('/api/v1/subscription/downgrade/', {'reason': 'Cost saving'}, format='json')
        self.assertEqual(res_downgrade.status_code, 200)

        sub.refresh_from_db()
        self.assertEqual(sub.pending_downgrade_to_plan, self.standard_plan)

        # 2. Before period end: Premium access remains intact
        res_prem_active = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_prem_active.status_code, 200)

        # 3. Simulate period end: state sync applies downgrade
        future_time = paid_end + timedelta(hours=1)
        new_status = get_effective_subscription_status(self.school_a, now=future_time)
        sub.refresh_from_db()

        self.assertEqual(sub.plan, self.standard_plan)
        self.assertIsNone(sub.pending_downgrade_to_plan)

        # 4. Premium feature is now locked
        invalidate_school_entitlements_cache(self.school_a.id)
        res_prem_locked = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_prem_locked.status_code, 403)

        # 5. Verify zero data loss: 10 students and enrollments are intact
        self.assertEqual(Student.objects.filter(school=self.school_a).count(), 10)

        # 6. Re-upgrade restores full access immediately
        sub.plan = self.premium_plan
        sub.paid_until = future_time + timedelta(days=30)
        sub.status = 'active'
        sub.save()
        invalidate_school_entitlements_cache(self.school_a.id)

        res_restored = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_restored.status_code, 200)

    # --------------------------------------------------------------------------
    # 5. Reflection Test: No Hardcoded Prices, Discounts or Plan Names
    # --------------------------------------------------------------------------

    def test_reflection_no_hardcoded_prices_or_discounts(self):
        """
        Asserts that prices, discount tiers, and plan configurations come
        strictly from database models.
        """
        # Dynamically alter standard price and billing period discount in DB
        self.standard_plan.price_usd_per_student = Decimal('4.00')
        self.standard_plan.save(update_fields=['price_usd_per_student'])

        period_4m = BillingPeriod.objects.get(months=4)
        period_4m.discount_percentage = Decimal('7.00')
        period_4m.save(update_fields=['discount_percentage'])

        # 100 students x 4.00 x 4 months = 1,600.00
        # Discount 7% = 112.00 -> Total = 1,488.00
        est = calculate_invoice_estimate(
            plan=self.standard_plan,
            billing_months=4,
            student_count=100,
            currency='USD'
        )
        self.assertEqual(est['subtotal'], Decimal('1600.00'))
        self.assertEqual(est['discount_amount'], Decimal('112.00'))
        self.assertEqual(est['payable_amount'], Decimal('1488.00'))

    # --------------------------------------------------------------------------
    # 6. Printable Order Receipt Matching Section 5
    # --------------------------------------------------------------------------

    def test_printable_order_receipt_plain_language_structure(self):
        """
        Receipt matches Section 5 lines, help text, and card details.
        """
        order = SubscriptionOrder.objects.create(
            order_number='ORD-TEST-REC-01',
            school=self.school_a,
            plan=self.premium_plan,
            billing_months=4,
            student_count=10,
            unit_price=Decimal('7.20'),
            subtotal=Decimal('288.00'),
            discount_percentage=Decimal('5.00'),
            discount_amount=Decimal('14.40'),
            upgrade_credit_amount=Decimal('0.00'),
            tax_amount=Decimal('0.00'),
            amount=Decimal('273.60'),
            currency='USD',
            provider='fake',
            card_brand='Visa',
            card_last4='4242',
            status='paid',
            paid_on=date(2026, 11, 1),
        )

        self.client.force_authenticate(user=self.admin_a)
        res = self.client.get(f'/api/v1/subscription/orders/{order.id}/receipt/')
        self.assertEqual(res.status_code, 200)
        data = res.data

        self.assertEqual(data['receipt_number'], f"REC-{order.order_number}")
        self.assertEqual(data['school_name'], 'Alpha School')
        self.assertIn('Visa ending in 4242', data['payment_method'])
        self.assertEqual(data['plan_name'], 'Premium Plan')
        self.assertEqual(data['students_counted'], 10)
        self.assertIn('per active student', data['students_counted_help_text_en'])
        self.assertIn('طالب علم', data['students_counted_help_text_ur'])
        self.assertEqual(data['months'], 4)
        self.assertEqual(data['subtotal'], '288.00')
        self.assertEqual(data['discount_amount'], '14.40')
        self.assertEqual(data['total_paid'], '273.60')

    # --------------------------------------------------------------------------
    # 7. Webhook Signature Verification and Idempotency
    # --------------------------------------------------------------------------

    def test_webhook_signature_and_idempotency(self):
        order = SubscriptionOrder.objects.create(
            order_number='ORD-TEST-SIG-02',
            school=self.school_a,
            plan=self.premium_plan,
            billing_months=1,
            student_count=10,
            unit_price=Decimal('7.20'),
            amount=Decimal('72.00'),
            currency='USD',
            provider='fake',
            status='pending',
        )
        payload = self.fake_provider.build_test_webhook_payload(order, event_type='order.paid', event_id='evt_9988')
        sig = self.fake_provider.generate_signature(payload)

        # First call succeeds
        res1 = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE=sig
        )
        self.assertEqual(res1.status_code, 200)

        # Duplicate call returns idempotent
        res2 = self.client.post(
            '/api/v1/subscription/webhook/?provider=fake',
            data=payload,
            content_type='application/json',
            HTTP_X_PROVIDER_SIGNATURE=sig
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data.get('status'), 'idempotent')
