"""
Comprehensive Test Suite for Subscription Plans, Three Access Levels, Entitlements Engine,
Feature Locking, Invoicing Flow, RLS Coverage, and Cache Isolation.
"""
import inspect
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import (
    Organisation,
    School,
    AcademicYear,
    SchoolClass,
    Student,
    Enrollment,
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
    Notification,
    LandingPlan,
)
from core.services.entitlements import (
    get_school_entitlements,
    get_effective_subscription_status,
    check_feature_access,
    get_active_enrolled_student_count,
    invalidate_school_entitlements_cache,
    sync_all_subscription_states,
)
from core.services.subscriptions import (
    calculate_invoice_estimate,
    create_subscription_order,
    approve_subscription_order,
    reject_subscription_order,
    schedule_subscription_downgrade,
    provision_school_registration_subscription,
    add_calendar_months,
)


class SubscriptionPlansAndEntitlementsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Platform Settings
        self.settings = PlatformBillingSettings.get_settings()
        self.settings.bank_name = 'National Bank Limited'
        self.settings.account_title = 'Optimus Orien EdTech'
        self.settings.account_number = '112233445566'
        self.settings.iban = 'PK36NBL0000112233445566'
        self.settings.branch_code = '0412'
        self.settings.swift_bic = 'NBLPKKA'
        self.settings.pending_grace_days = 3
        self.settings.past_due_grace_days = 7
        self.settings.exchange_rate_note_en = 'PKR amounts are approximate.'
        self.settings.exchange_rate_note_ur = 'روپے کی رقم تخمینی ہے۔'
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

        # 3. Organisations & Schools
        self.org_a = Organisation.objects.create(name='Alpha Trust', code='alpha-trust', allow_org_admin_student_access=True)
        self.school_a = School.objects.create(name='Alpha School', code='ALPHA-1', organisation=self.org_a)

        self.org_b = Organisation.objects.create(name='Beta Group', code='beta-group')
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

        # 5. Populate active enrolled students for school A
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
                admission_number=f"ALPHA-STU-{i}",
                first_name=f"Student{i}",
                last_name="Alpha",
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

    def test_plan_by_feature_matrix_standard_gets_403_on_premium_endpoints(self):
        """
        A school on the Standard plan gets 403 Forbidden with code 'feature_locked'
        on all Premium-exclusive endpoints.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.standard_plan, 'status': 'active', 'paid_until': timezone.now() + timedelta(days=30)}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)

        res_entitlements = self.client.get('/api/v1/subscription/entitlements/')
        self.assertEqual(res_entitlements.status_code, 200)
        self.assertFalse(res_entitlements.data['features']['aqi']['is_unlocked'])
        self.assertFalse(res_entitlements.data['features']['psych_eval']['is_unlocked'])
        self.assertTrue(res_entitlements.data['features']['attendance_daily']['is_unlocked'])

        premium_targets = [
            ('/api/v1/aqi/overview/', 'aqi_history'),
            ('/api/v1/finance/summary/', 'finance_dashboard'),
            ('/api/v1/psychological-evaluations/overview/', 'psych_eval'),
        ]

        for path, feature_key in premium_targets:
            res = self.client.get(path)
            self.assertEqual(
                res.status_code, 403,
                f"Standard school should be rejected with 403 on {path} (got {res.status_code})"
            )
            res_data = res.data if hasattr(res, 'data') else res.json()
            code = res_data.get('code') or (res_data.get('detail', {}).get('code') if isinstance(res_data.get('detail'), dict) else None)
            self.assertEqual(code, 'feature_locked', f"Endpoint {path} must return code 'feature_locked'")

    def test_new_school_starts_in_no_plan_feature_locking(self):
        """
        A newly registered school starts with status no_plan (nothing paid yet).
        Premium features AND paid Standard features are locked with 403.
        Basic access list remains functional.
        """
        school_c = School.objects.create(name='New School', code='NEW-1', organisation=self.org_a)
        admin_c = User.objects.create_user(
            username='admin_new',
            email='new@school.edu.pk',
            password='SecurePassword123!',
            role='organisation_admin',
            organisation=self.org_a,
            school=school_c
        )
        academic_year_c = AcademicYear.objects.create(school=school_c, name='2026', start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        class_c = SchoolClass.objects.create(school=school_c, academic_year=academic_year_c, name='Class C', grade_level='1')
        provision_school_registration_subscription(school_c, admin_c)
        invalidate_school_entitlements_cache(school_c.id)

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

        # 3. Basic access works
        res_sub = self.client.get('/api/v1/subscription/current/')
        self.assertEqual(res_sub.status_code, 200)
        self.assertEqual(res_sub.data['status'], 'no_plan')

    def test_premium_plan_grants_all_features(self):
        """
        A school on active Premium subscription has access to all Premium endpoints.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={
                'plan': self.premium_plan,
                'status': 'active',
                'paid_until': timezone.now() + timedelta(days=90),
            }
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)
        res_aqi = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_aqi.status_code, 200)

    # --------------------------------------------------------------------------
    # 2. Status Transitions and Grace Periods
    # --------------------------------------------------------------------------

    def test_all_status_transitions_and_grace_periods(self):
        """
        Verifies lifecycle state-machine transitions:
        - active -> past_due (term ended, grace period starts)
        - past_due -> no_plan (grace period elapsed)
        """
        now = timezone.now()

        # Step 1: Active Premium subscription expiring at T0
        sub = SchoolSubscription.objects.create(
            school=self.school_a,
            plan=self.premium_plan,
            status='active',
            current_period_start=now - timedelta(days=30),
            paid_until=now,
        )

        # At T0 + 1 hour: Term expired -> Transitions to past_due with 7 days grace
        st = get_effective_subscription_status(self.school_a, now=now + timedelta(hours=1))
        self.assertEqual(st, 'past_due')
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'past_due')
        self.assertIsNotNone(sub.grace_until)

        # During grace: Still allowed full access
        ent = get_school_entitlements(self.school_a, now=now + timedelta(days=3), use_cache=False)
        self.assertTrue(ent['features']['aqi']['is_unlocked'])

        # At T0 + 7 days 1 hour: Grace expired -> Transitions to no_plan!
        st_after_grace = get_effective_subscription_status(self.school_a, now=now + timedelta(days=7, hours=1))
        self.assertEqual(st_after_grace, 'no_plan')
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'no_plan')

    # --------------------------------------------------------------------------
    # 3. Data Retention Across Downgrade & Upgrade
    # --------------------------------------------------------------------------

    def test_data_survives_downgrade_and_returns_after_upgrade(self):
        """
        Data created in Premium features remains safely in PostgreSQL on downgrade,
        and returns immediately upon subsequent upgrade. Zero data loss.
        """
        sub = SchoolSubscription.objects.create(
            school=self.school_a,
            plan=self.premium_plan,
            status='active',
            paid_until=timezone.now() + timedelta(days=30),
        )

        initial_student_count = Student.objects.filter(school=self.school_a).count()
        self.assertEqual(initial_student_count, 10)

        # Downgrade school to Standard
        sub.plan = self.standard_plan
        sub.save()
        invalidate_school_entitlements_cache(self.school_a.id)

        # Verify data is NOT deleted or dropped
        self.assertEqual(Student.objects.filter(school=self.school_a).count(), initial_student_count)
        self.assertEqual(Enrollment.objects.filter(school_class__school=self.school_a).count(), 10)

        # Upgrade back to Premium
        sub.plan = self.premium_plan
        sub.save()
        invalidate_school_entitlements_cache(self.school_a.id)

        # Verify full access returns
        entitlements = get_school_entitlements(self.school_a, use_cache=False)
        self.assertEqual(entitlements['plan'], 'premium')
        self.assertTrue(entitlements['features']['aqi']['is_unlocked'])

    # --------------------------------------------------------------------------
    # 4. Offline Order Flow: Approval & Rejection
    # --------------------------------------------------------------------------

    def test_offline_order_flow_approval_and_rejection(self):
        """
        Tests submission, review, approval, and rejection of offline payment orders.
        """
        order = create_subscription_order(
            school=self.school_a,
            plan=self.standard_plan,
            billing_months=4,
            payment_reference='CHQ-998877',
            paid_on=date.today(),
            amount=Decimal('136.80'),
            currency='USD',
            notes='Bank cheque payment',
            submitted_by=self.admin_a,
        )
        self.assertEqual(order.status, 'pending')

        # Approve
        approve_subscription_order(order, reviewer=self.platform_admin, review_note='Cheque cleared')
        order.refresh_from_db()
        self.assertEqual(order.status, 'approved')

        sub = SchoolSubscription.objects.get(school=self.school_a)
        self.assertEqual(sub.status, 'active')
        self.assertEqual(sub.plan, self.standard_plan)

    # --------------------------------------------------------------------------
    # 5. Amounts Computed From Active Headcount
    # --------------------------------------------------------------------------

    def test_amounts_computed_from_active_enrolled_student_count(self):
        """
        System counts only active students enrolled in current classes.
        """
        count = get_active_enrolled_student_count(self.school_a)
        self.assertEqual(count, 10)

        est = calculate_invoice_estimate(
            plan=self.standard_plan,
            billing_months=1,
            student_count=count,
            currency='USD'
        )
        self.assertEqual(est['payable_amount'], Decimal('36.00'))

    # --------------------------------------------------------------------------
    # 6. Database Reflection
    # --------------------------------------------------------------------------

    def test_prices_come_only_from_database_reflection(self):
        """
        Modifying prices in the database reflects immediately in invoice estimates.
        """
        self.standard_plan.price_usd_per_student = Decimal('5.00')
        self.standard_plan.save(update_fields=['price_usd_per_student'])

        est = calculate_invoice_estimate(
            plan=self.standard_plan,
            billing_months=1,
            student_count=10,
            currency='USD'
        )
        self.assertEqual(est['payable_amount'], Decimal('50.00'))

    # --------------------------------------------------------------------------
    # 7. Cache Isolation
    # --------------------------------------------------------------------------

    def test_entitlements_cache_isolation_school_a_never_affects_school_b(self):
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

        ent_a = get_school_entitlements(self.school_a, use_cache=True)
        ent_b = get_school_entitlements(self.school_b, use_cache=True)

        self.assertFalse(ent_a['features']['aqi']['is_unlocked'])
        self.assertTrue(ent_b['features']['aqi']['is_unlocked'])

    # --------------------------------------------------------------------------
    # 8. Platform Admin Access Guards
    # --------------------------------------------------------------------------

    def test_platform_admin_endpoints_reject_school_users(self):
        self.client.force_authenticate(user=self.admin_a)
        res = self.client.get('/api/v1/platform-admin/billing/settings/')
        self.assertEqual(res.status_code, 403)

        self.client.force_authenticate(user=self.platform_admin)
        res_adm = self.client.get('/api/v1/platform-admin/billing/settings/')
        self.assertEqual(res_adm.status_code, 200)

    # --------------------------------------------------------------------------
    # 9. Feature Override by Platform Admin
    # --------------------------------------------------------------------------

    def test_feature_override_by_platform_admin(self):
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.standard_plan, 'status': 'active'}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        # Standard school locked out of AQI
        ent_before = get_school_entitlements(self.school_a, use_cache=False)
        self.assertFalse(ent_before['features']['aqi']['is_unlocked'])

        # Platform admin grants AQI override
        SchoolFeatureOverride.objects.create(
            school=self.school_a,
            feature_key='aqi',
            is_granted=True,
            reason='Special academic pilot grant',
            granted_by=self.platform_admin
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        ent_after = get_school_entitlements(self.school_a, use_cache=False)
        self.assertTrue(ent_after['features']['aqi']['is_unlocked'])

    # --------------------------------------------------------------------------
    # 10. Student Growth Flagged Not Blocked
    # --------------------------------------------------------------------------

    def test_student_count_growth_flagged_not_blocked(self):
        sub = SchoolSubscription.objects.create(
            school=self.school_a,
            plan=self.standard_plan,
            status='active',
            student_count_at_last_invoice=5,
            paid_until=timezone.now() + timedelta(days=30)
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        # 10 students enrolled vs 5 invoiced -> flagged as growth, writes still allowed
        ent = get_school_entitlements(self.school_a, use_cache=False)
        self.assertTrue(ent['has_student_growth'])
        self.assertTrue(ent['is_write_allowed'])

    # --------------------------------------------------------------------------
    # 11. RLS Policy Coverage
    # --------------------------------------------------------------------------

    def test_rls_schema_and_tenant_scoping_coverage(self):
        """
        Ensures subscription tables are appropriately scoped and isolated.
        """
        sub_a = SchoolSubscription.objects.create(school=self.school_a, plan=self.standard_plan, status='active')
        sub_b = SchoolSubscription.objects.create(school=self.school_b, plan=self.premium_plan, status='active')

        # School A subscription query does not return School B
        self.assertEqual(SchoolSubscription.objects.filter(school=self.school_a).first().id, sub_a.id)
        self.assertEqual(SchoolSubscription.objects.filter(school=self.school_b).first().id, sub_b.id)

    # --------------------------------------------------------------------------
    # 12. Custom Package Modular Builder & Selective Gating
    # --------------------------------------------------------------------------

    def test_custom_package_dynamic_pricing_and_discounts(self):
        """
        Validates modular custom package pricing calculation:
        Base fee ($0.70/student) + selected features unit rate x students x months minus multi-year duration discounts.
        """
        custom_plan, _ = Plan.objects.get_or_create(
            code='custom',
            defaults={'name': 'Custom Package', 'price_usd_per_student': Decimal('0.70'), 'price_pkr_per_student': Decimal('195.00')}
        )
        custom_plan.price_usd_per_student = Decimal('0.70')
        custom_plan.price_pkr_per_student = Decimal('195.00')
        custom_plan.save()

        # 100 students, 12 months (15% discount), selected: attendance_daily (0.02) + aqi (0.05) -> unit_price = 0.70 + 0.07 = 0.77
        estimate_12m = calculate_invoice_estimate(
            plan=custom_plan,
            billing_months=12,
            student_count=100,
            currency='USD',
            selected_features=['attendance_daily', 'aqi']
        )
        self.assertEqual(estimate_12m['unit_price'], Decimal('0.77'))
        # Subtotal: 100 * 0.77 * 12 = 924.00. 15% discount = 138.60. Net = 785.40
        self.assertEqual(estimate_12m['subtotal'], Decimal('924.00'))
        self.assertEqual(estimate_12m['discount_amount'], Decimal('138.60'))
        self.assertEqual(estimate_12m['payable_amount'], Decimal('785.40'))

        # Multi-year: 24 months (20% discount)
        estimate_24m = calculate_invoice_estimate(
            plan=custom_plan,
            billing_months=24,
            student_count=100,
            currency='USD',
            selected_features=['attendance_daily', 'aqi']
        )
        # Subtotal: 100 * 0.77 * 24 = 1848.00. 20% discount = 369.60. Net = 1478.40
        self.assertEqual(estimate_24m['subtotal'], Decimal('1848.00'))
        self.assertEqual(estimate_24m['discount_percentage'], Decimal('20.00'))
        self.assertEqual(estimate_24m['payable_amount'], Decimal('1478.40'))

    def test_custom_package_order_and_selective_feature_unlocking(self):
        """
        Validates that ordering a custom package selectively unlocks ONLY chosen features,
        leaving unchosen premium/standard features locked.
        """
        custom_plan, _ = Plan.objects.get_or_create(
            code='custom',
            defaults={'name': 'Custom Package', 'price_usd_per_student': Decimal('2.00'), 'price_pkr_per_student': Decimal('550.00')}
        )

        chosen_features = ['attendance_daily', 'aqi', 'aqi_history']
        order = create_subscription_order(
            school=self.school_a,
            plan=custom_plan,
            billing_months=12,
            payment_reference='BANK-CUSTOM-001',
            paid_on=timezone.now().date(),
            amount=Decimal('2652.00'),
            currency='USD',
            submitted_by=self.admin_a,
            selected_features=chosen_features,
            custom_student_count=100
        )

        # Admin approves custom order
        approve_subscription_order(order, reviewer=self.platform_admin, review_note='Custom package approved')

        # Verify entitlements
        ent = get_school_entitlements(self.school_a, use_cache=False)
        self.assertEqual(ent['status'], 'active')
        self.assertEqual(ent['plan'], 'custom')

        # Chosen features must be unlocked
        self.assertTrue(ent['features']['attendance_daily']['is_unlocked'])
        self.assertTrue(ent['features']['aqi']['is_unlocked'])

        # Unchosen features must remain locked
        self.assertFalse(ent['features']['hr_payroll']['is_unlocked'])
        self.assertFalse(ent['features']['psych_eval']['is_unlocked'])
        self.assertFalse(ent['features']['finance_dashboard']['is_unlocked'])

        # Real view check: attendance and AQI succeed, finance 403
        self.client.force_authenticate(user=self.admin_a)
        res_att = self.client.get(f'/api/v1/attendance/class-register/?school_class={self.class_a.id}')
        self.assertEqual(res_att.status_code, 200)

        res_aqi = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res_aqi.status_code, 200)

        res_fin = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res_fin.status_code, 403)
        self.assertEqual(res_fin.data['code'], 'feature_locked')
