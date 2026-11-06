"""
Comprehensive Test Suite for Subscription Plans, 3-Day Trial, Entitlements Engine,
Feature Locking, Offline Invoicing Flow, RLS Coverage, and Cache Isolation.
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
    extend_school_trial,
    check_repeat_trial_risk,
    provision_school_registration_subscription,
    add_calendar_months,
)


class SubscriptionPlansAndEntitlementsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Platform Settings
        self.settings = PlatformBillingSettings.get_solo()
        self.settings.bank_name = 'National Bank Limited'
        self.settings.account_title = 'Optimus Orien EdTech'
        self.settings.account_number = '112233445566'
        self.settings.iban = 'PK36NBL0000112233445566'
        self.settings.branch_code = '0412'
        self.settings.swift_bic = 'NBLPKKA'
        self.settings.default_trial_days = 3
        self.settings.pending_grace_days = 3
        self.settings.past_due_grace_days = 7
        self.settings.yearly_discount_percentage = Decimal('10.00')
        self.settings.exchange_rate_note_en = 'PKR amounts are approximate.'
        self.settings.exchange_rate_note_ur = 'روپے کی رقم تخمینی ہے۔'
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
        self.teacher_a = User.objects.create_user(
            username='teacher_alpha',
            email='teacher@alpha.edu.pk',
            password='SecurePassword123!',
            role='teacher',
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
                admission_number=f"ALPHA-ST-{i}",
                first_name=f"Student{i}",
                last_name="Alpha",
                enrolled_on=date(2026, 1, 15),
                active=True,
            )
            Enrollment.objects.create(
                student=st,
                school_class=self.class_a,
                start_date=date(2026, 1, 15),
                end_date=None,  # Active open enrollment
            )

    # --------------------------------------------------------------------------
    # 1. Plan By Feature Matrix Tests
    # --------------------------------------------------------------------------

    def test_plan_by_feature_matrix_standard_gets_403_on_premium_endpoints(self):
        """
        A school on active Standard plan can access Standard endpoints,
        but hits HTTP 403 with machine-readable code 'feature_locked' on Premium endpoints.
        """
        # Place School A on active Standard subscription
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={
                'plan': self.standard_plan,
                'status': 'active',
                'paid_until': timezone.now() + timedelta(days=30),
            }
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)

        # A) Standard Endpoints: Accessible (200 OK)
        res_students = self.client.get('/api/v1/students/')
        self.assertEqual(res_students.status_code, 200)

        res_entitlements = self.client.get('/api/v1/subscription/entitlements/')
        self.assertEqual(res_entitlements.status_code, 200)
        self.assertFalse(res_entitlements.data['features']['aqi']['is_unlocked'])
        self.assertFalse(res_entitlements.data['features']['psych_eval']['is_unlocked'])
        self.assertTrue(res_entitlements.data['features']['attendance_daily']['is_unlocked'])

        # B) Premium Endpoints: Return 403 with code 'feature_locked' and required_plan 'premium'
        premium_targets = [
            ('/api/v1/aqi/overview/', 'aqi_history'),
            ('/api/v1/salaries/sheet/', 'hr_payroll'),
            ('/api/v1/finance/summary/', 'finance_dashboard'),
            ('/api/v1/students/at-risk/', 'early_intervention'),
            ('/api/v1/psychological-evaluations/overview/', 'psych_eval'),
            ('/api/v1/audit/', 'audit_log_viewer'),
        ]

        for path, feature_key in premium_targets:
            res = self.client.get(path)
            self.assertEqual(
                res.status_code, 403,
                f"Standard school should be rejected with 403 on {path} (got {res.status_code})"
            )
            # Machine-readable error code check
            res_data = res.data if hasattr(res, 'data') else res.json()
            code = res_data.get('code') or (res_data.get('detail', {}).get('code') if isinstance(res_data.get('detail'), dict) else None)
            self.assertEqual(code, 'feature_locked', f"Endpoint {path} must return code 'feature_locked'")

    def test_trial_subscription_grants_all_premium_features(self):
        """
        A school with status='trial' receives complete access to all Premium features.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={
                'plan': self.standard_plan,
                'status': 'trial',
                'trial_started_at': timezone.now(),
                'trial_ends_at': timezone.now() + timedelta(days=3),
            }
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)

        res_entitlements = self.client.get('/api/v1/subscription/entitlements/')
        self.assertEqual(res_entitlements.status_code, 200)
        self.assertEqual(res_entitlements.data['effective_tier'], 'premium')
        self.assertTrue(res_entitlements.data['features']['aqi']['is_unlocked'])
        self.assertTrue(res_entitlements.data['features']['psych_eval']['is_unlocked'])
        self.assertTrue(res_entitlements.data['features']['hr_payroll']['is_unlocked'])

        # Premium endpoints are now accessible (e.g. 200 instead of 403)
        res_aqi = self.client.get('/api/v1/aqi/overview/')
        self.assertNotEqual(res_aqi.status_code, 403)

        res_audit = self.client.get('/api/v1/audit/')
        self.assertNotEqual(res_audit.status_code, 403)

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
        res_audit = self.client.get('/api/v1/audit/')
        self.assertEqual(res_audit.status_code, 200)

    # --------------------------------------------------------------------------
    # 2. Limited Mode Read-Only and Write-Guard Tests
    # --------------------------------------------------------------------------

    def test_limited_mode_blocks_writes_allows_reads_and_exports(self):
        """
        In limited mode:
        - Reads (GET) and data exports stay allowed.
        - Non-allowlisted writes (POST, PUT, DELETE) are blocked with HTTP 403 'limited_read_only'.
        - Allowlisted writes (login, password change, subscription orders) stay allowed.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={
                'plan': self.standard_plan,
                'status': 'limited',
            }
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        self.client.force_authenticate(user=self.admin_a)

        # 1. Reads are allowed
        res_read = self.client.get('/api/v1/students/')
        self.assertEqual(res_read.status_code, 200)

        # 2. Data exports are allowed
        res_export = self.client.get('/api/v1/exports/students.csv')
        self.assertEqual(res_export.status_code, 200)

        # 3. Non-allowlisted writes are blocked with 403 'limited_read_only'
        res_write = self.client.post('/api/v1/students/', {
            'first_name': 'Blocked',
            'last_name': 'Student',
            'admission_number': 'BLOCKED-01',
            'enrolled_on': '2026-11-05',
        }, format='json')
        self.assertEqual(res_write.status_code, 403)
        self.assertEqual(res_write.json().get('code'), 'limited_read_only')

        # 4. Allowlisted writes are NOT blocked by limited mode
        # Password change endpoint
        res_pwd = self.client.post('/api/v1/auth/password/', {
            'current_password': 'SecurePassword123!',
            'password': 'NewSecurePassword123!',
        }, format='json')
        # Even if validation fails or succeeds, it must NOT be blocked with limited_read_only!
        self.assertNotEqual(res_pwd.status_code, 403)

    # --------------------------------------------------------------------------
    # 3. Status Transitions and Grace Periods (Controllable Clock)
    # --------------------------------------------------------------------------

    def test_all_status_transitions_and_grace_periods(self):
        """
        Verifies complete lifecycle state-machine transitions:
        - trial -> limited (expired without order)
        - trial -> pending_approval (order submitted before expiry)
        - pending_approval -> limited (grace expired)
        - active -> past_due (paid period expired, grace starts)
        - past_due -> limited (grace expired)
        """
        now = timezone.now()

        # Step 1: School in trial with 3-day window
        sub = SchoolSubscription.objects.create(
            school=self.school_a,
            plan=self.standard_plan,
            status='trial',
            trial_started_at=now,
            trial_ends_at=now + timedelta(days=3),
        )

        # At T0 + 2 days: Still trial
        st = get_effective_subscription_status(self.school_a, now=now + timedelta(days=2))
        self.assertEqual(st, 'trial')

        # At T0 + 3 days 1 hour: No pending order -> Transitions to limited!
        st = get_effective_subscription_status(self.school_a, now=now + timedelta(days=3, hours=1))
        self.assertEqual(st, 'limited')
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'limited')
        self.assertTrue(SubscriptionEvent.objects.filter(school=self.school_a, to_status='limited').exists())

        # Step 2: Submit order while in limited -> Status becomes pending_approval with 3-day grace
        order = create_subscription_order(
            school=self.school_a,
            plan=self.premium_plan,
            billing_months=3,
            payment_reference='REF-001122',
            paid_on=date(2026, 11, 5),
            amount=Decimal('216.00'),
            currency='USD',
            submitted_by=self.admin_a,
        )
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'pending_approval')
        self.assertIsNotNone(sub.grace_until)

        # Before grace expires (T_order + 2 days): Still pending_approval
        t_order = sub.grace_until - timedelta(days=1)
        st = get_effective_subscription_status(self.school_a, now=t_order)
        self.assertEqual(st, 'pending_approval')

        # After grace expires (T_order + 4 days): Transitions back to limited
        t_grace_expired = sub.grace_until + timedelta(hours=1)
        st = get_effective_subscription_status(self.school_a, now=t_grace_expired)
        self.assertEqual(st, 'limited')

        # Step 3: Platform Admin approves order -> Status becomes active
        approve_subscription_order(order=order, reviewer=self.platform_admin, review_note='Bank verified')
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'active')
        self.assertEqual(sub.plan.code, 'premium')
        self.assertIsNotNone(sub.paid_until)

        # Step 4: Time reaches paid_until -> Transitions to past_due (7 days grace)
        t_paid_until = sub.paid_until + timedelta(hours=1)
        st = get_effective_subscription_status(self.school_a, now=t_paid_until)
        self.assertEqual(st, 'past_due')
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'past_due')
        self.assertIsNotNone(sub.grace_until)

        # Past-due grace active: full access retained
        entitlements = get_school_entitlements(self.school_a, now=t_paid_until, use_cache=False)
        self.assertEqual(entitlements['status'], 'past_due')
        self.assertTrue(entitlements['is_write_allowed'])
        self.assertTrue(entitlements['features']['aqi']['is_unlocked'])

        # After past_due grace expires (grace_until + 1 hour) -> Transitions to limited
        t_past_due_grace_expired = sub.grace_until + timedelta(hours=1)
        st = get_effective_subscription_status(self.school_a, now=t_past_due_grace_expired)
        self.assertEqual(st, 'limited')

    # --------------------------------------------------------------------------
    # 4. Data Preservation and Retention Guarantee
    # --------------------------------------------------------------------------

    def test_data_survives_downgrade_and_returns_after_upgrade(self):
        """
        Data created in Premium features remains safely in PostgreSQL on downgrade,
        and returns immediately upon subsequent renewal/upgrade. Zero data loss.
        """
        # Step 1: Start on active Premium
        sub = SchoolSubscription.objects.create(
            school=self.school_a,
            plan=self.premium_plan,
            status='active',
            paid_until=timezone.now() + timedelta(days=30),
        )

        # Create a SubscriptionEvent and check student count
        initial_student_count = Student.objects.filter(school=self.school_a).count()
        self.assertEqual(initial_student_count, 10)

        # Step 2: Downgrade school to Standard
        sub.plan = self.standard_plan
        sub.save()
        invalidate_school_entitlements_cache(self.school_a.id)

        # Verify data is NOT deleted or dropped
        self.assertEqual(Student.objects.filter(school=self.school_a).count(), initial_student_count)
        self.assertEqual(Enrollment.objects.filter(school_class__school=self.school_a).count(), 10)

        # Step 3: Upgrade back to Premium
        sub.plan = self.premium_plan
        sub.save()
        invalidate_school_entitlements_cache(self.school_a.id)

        # Verify full data access returns
        entitlements = get_school_entitlements(self.school_a, use_cache=False)
        self.assertEqual(entitlements['plan'], 'premium')
        self.assertTrue(entitlements['features']['aqi']['is_unlocked'])

    # --------------------------------------------------------------------------
    # 5. One Trial Per School & Repeat-Trial Guard
    # --------------------------------------------------------------------------

    def test_one_trial_per_school_and_repeat_trial_guard(self):
        """
        Best-effort anti-abuse check:
        Same administrator email cannot get multiple 3-day trials across new school registrations.
        """
        admin_email = 'repeat_director@network.edu.pk'

        # First registration: gets complimentary trial
        user_1 = User.objects.create_user(
            username='dir_1',
            email=admin_email,
            password='Password123!',
            role='organisation_admin',
            organisation=self.org_a,
            school=self.school_a,
        )
        sub_1 = provision_school_registration_subscription(self.school_a, user_1)
        self.assertEqual(sub_1.status, 'trial')

        # Fast forward / expire trial on school A
        sub_1.trial_ends_at = timezone.now() - timedelta(days=1)
        sub_1.status = 'limited'
        sub_1.save()

        # Second registration by the same email at school B:
        user_2 = User.objects.create_user(
            username='dir_2',
            email=admin_email,
            password='Password123!',
            role='organisation_admin',
            organisation=self.org_b,
            school=self.school_b,
        )
        sub_2 = provision_school_registration_subscription(self.school_b, user_2)

        # Must be initialized in 'limited' mode directly, NOT granting a second free trial!
        self.assertEqual(sub_2.status, 'limited')
        self.assertTrue(SubscriptionEvent.objects.filter(
            school=self.school_b,
            to_status='limited',
            notes__icontains='Repeat trial prevented'
        ).exists())

    # --------------------------------------------------------------------------
    # 6. Audited Trial Extension
    # --------------------------------------------------------------------------

    def test_trial_extension_is_audited_and_requires_reason(self):
        """
        Platform admin can extend school trial with mandatory reason logged in audit trail.
        """
        sub = SchoolSubscription.objects.create(
            school=self.school_a,
            plan=self.standard_plan,
            status='trial',
            trial_started_at=timezone.now(),
            trial_ends_at=timezone.now() + timedelta(days=3),
        )

        self.client.force_authenticate(user=self.platform_admin)

        # Missing reason fails (400)
        res_fail = self.client.post(f"/api/v1/platform-admin/billing/schools/{self.school_a.id}/extend-trial/", {
            'days': 5,
            'reason': '',
        }, format='json')
        self.assertEqual(res_fail.status_code, 400)

        # Successful extension
        reason = "Board demonstration and evaluation granted by CEO"
        res_ok = self.client.post(f"/api/v1/platform-admin/billing/schools/{self.school_a.id}/extend-trial/", {
            'days': 5,
            'reason': reason,
        }, format='json')
        self.assertEqual(res_ok.status_code, 200)

        sub.refresh_from_db()
        self.assertEqual(sub.status, 'trial')

        # Verify audit event in SubscriptionEvent
        event = SubscriptionEvent.objects.filter(
            school=self.school_a,
            event_type='trial_extended'
        ).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.actor, self.platform_admin)
        self.assertIn(reason, event.notes)

    # --------------------------------------------------------------------------
    # 7. Offline Bank Order Flow and Manual Approval
    # --------------------------------------------------------------------------

    def test_offline_order_flow_approval_and_rejection(self):
        """
        Complete offline order lifecycle:
        1. School views platform bank credentials
        2. School views invoice estimate based on student count
        3. School submits order (status=pending, subscription=pending_approval)
        4. Platform admin reviews queue and approves (status=active, paid_until set)
        """
        # 1. School bank credentials
        self.client.force_authenticate(user=self.admin_a)
        res_bank = self.client.get('/api/v1/subscription/bank-details/')
        self.assertEqual(res_bank.status_code, 200)
        self.assertEqual(res_bank.data['bank_name'], 'National Bank Limited')

        # 2. Invoice estimate (10 active students x 7.20 USD x 12 months with 10% discount)
        # Gross = 10 * 7.20 * 12 = 864.00. Discount 10% = 86.40. Net = 777.60
        res_est = self.client.get('/api/v1/subscription/invoice-estimate/?plan=premium&months=12&currency=USD')
        self.assertEqual(res_est.status_code, 200)
        self.assertEqual(res_est.data['student_count'], 10)
        self.assertEqual(Decimal(res_est.data['payable_amount']), Decimal('777.60'))

        # 3. School submits order
        res_order = self.client.post('/api/v1/subscription/orders/', {
            'plan_code': 'premium',
            'billing_months': 12,
            'payment_reference': 'DEP-SLIP-778899',
            'paid_on': '2026-11-05',
            'amount': '777.60',
            'currency': 'USD',
            'notes': 'Deposited via NBL blue area branch counter.',
        }, format='json')
        self.assertEqual(res_order.status_code, 201)
        order_id = res_order.data['order']['id']

        sub = SchoolSubscription.objects.get(school=self.school_a)
        self.assertEqual(sub.status, 'pending_approval')

        # 4. Platform Admin sees order in queue
        self.client.force_authenticate(user=self.platform_admin)
        res_queue = self.client.get('/api/v1/platform-admin/billing/orders/?status=pending')
        self.assertEqual(res_queue.status_code, 200)
        self.assertTrue(any(o['id'] == order_id for o in res_queue.data['results']))

        # 5. Platform Admin approves order
        res_approve = self.client.post(
            f"/api/v1/platform-admin/billing/orders/{order_id}/approve/",
            {'review_note': 'Verified against bank ledger statement.'},
            format='json'
        )
        self.assertEqual(res_approve.status_code, 200)

        # School subscription is now active Premium!
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'active')
        self.assertEqual(sub.plan.code, 'premium')
        self.assertEqual(sub.student_count_at_last_invoice, 10)
        self.assertTrue(sub.paid_until > timezone.now() + timedelta(days=350))

        # Notification received by School Admin
        self.assertTrue(Notification.objects.filter(
            user=self.admin_a,
            title__icontains='Payment Approved'
        ).exists())

    # --------------------------------------------------------------------------
    # 8. Active Student Count Billing & Dynamic Pricing Reflection
    # --------------------------------------------------------------------------

    def test_amounts_computed_from_active_enrolled_student_count(self):
        """
        Billing amount reflects active enrolled students at invoice time,
        never staff, teachers, or parents.
        """
        active_count = get_active_enrolled_student_count(self.school_a)
        self.assertEqual(active_count, 10)

        # Teachers and parents exist in the school but are not counted
        self.assertEqual(User.objects.filter(school=self.school_a).count(), 2)

        est = calculate_invoice_estimate(
            plan=self.standard_plan,
            billing_months=1,
            student_count=active_count,
            currency='USD'
        )
        # 10 students * 3.60 USD = 36.00 USD
        self.assertEqual(est['payable_amount'], Decimal('36.00'))

    def test_prices_come_only_from_database_reflection(self):
        """
        Prices and plan rates are data models, never hardcoded numbers in Python logic.
        Altering price in database immediately reflects in calculation output.
        """
        # Dynamic database price mutation
        self.standard_plan.price_usd_per_student = Decimal('4.50')
        self.standard_plan.save()

        est = calculate_invoice_estimate(
            plan=self.standard_plan,
            billing_months=1,
            student_count=100,
            currency='USD'
        )
        self.assertEqual(est['payable_amount'], Decimal('450.00'))

        # Inspect python view file to ensure 3.60 is not hardcoded inside calculation functions
        import core.services.subscriptions as sub_service
        source = inspect.getsource(sub_service.calculate_invoice_estimate)
        self.assertNotIn("3.60", source)
        self.assertNotIn("7.20", source)

    # --------------------------------------------------------------------------
    # 9. Entitlements Cache Isolation Between Schools
    # --------------------------------------------------------------------------

    def test_entitlements_cache_isolation_school_a_never_affects_school_b(self):
        """
        Cache entries are strictly segregated by school ID.
        School A's status transition or plan change never leaks into School B.
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

        # Warm cache for both
        ent_a = get_school_entitlements(self.school_a, use_cache=True)
        ent_b = get_school_entitlements(self.school_b, use_cache=True)

        self.assertFalse(ent_a['features']['aqi']['is_unlocked'])
        self.assertTrue(ent_b['features']['aqi']['is_unlocked'])

        # Mutate school A to limited
        sub_a = SchoolSubscription.objects.get(school=self.school_a)
        sub_a.status = 'limited'
        sub_a.save()
        invalidate_school_entitlements_cache(self.school_a.id)

        # School A reflects limited mode
        ent_a_updated = get_school_entitlements(self.school_a, use_cache=True)
        self.assertTrue(ent_a_updated['is_limited'])

        # School B remains untouched and active in its own cache!
        ent_b_cached = get_school_entitlements(self.school_b, use_cache=True)
        self.assertFalse(ent_b_cached['is_limited'])
        self.assertTrue(ent_b_cached['features']['aqi']['is_unlocked'])
        self.assertEqual(ent_b_cached['school_id'], self.school_b.id)

    # --------------------------------------------------------------------------
    # 10. Platform Admin Authorization Enforcement
    # --------------------------------------------------------------------------

    def test_platform_admin_endpoints_reject_school_users(self):
        """
        School administrators and teachers attempting to access platform-admin endpoints
        receive HTTP 403 Forbidden.
        """
        school_users = [self.admin_a, self.teacher_a, self.admin_b]
        admin_endpoints = [
            '/api/v1/platform-admin/billing/settings/',
            '/api/v1/platform-admin/billing/plans/',
            '/api/v1/platform-admin/billing/features/',
            '/api/v1/platform-admin/billing/schools/',
            '/api/v1/platform-admin/billing/orders/',
        ]

        for user in school_users:
            self.client.force_authenticate(user=user)
            for ep in admin_endpoints:
                res = self.client.get(ep)
                self.assertEqual(res.status_code, 403, f"User {user.username} must be forbidden from {ep}")

    # --------------------------------------------------------------------------
    # 11. Per-School Feature Override
    # --------------------------------------------------------------------------

    def test_feature_override_by_platform_admin(self):
        """
        Platform admin can selectively grant a Premium feature to a Standard school
        (e.g. for a commercial demo or evaluation pilot).
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={'plan': self.standard_plan, 'status': 'active'}
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        # AQI initially locked on Standard
        allowed, _, _ = check_feature_access(self.school_a, 'aqi')
        self.assertFalse(allowed)

        # Platform Admin grants override
        SchoolFeatureOverride.objects.create(
            school=self.school_a,
            feature_key='aqi',
            is_granted=True,
            reason='Executive commercial pilot',
            granted_by=self.platform_admin,
        )
        invalidate_school_entitlements_cache(self.school_a.id)

        # AQI is now unlocked!
        allowed, _, _ = check_feature_access(self.school_a, 'aqi')
        self.assertTrue(allowed)

    # --------------------------------------------------------------------------
    # 12. Student Count Growth Flagging in Platform Admin
    # --------------------------------------------------------------------------

    def test_student_count_growth_flagged_not_blocked(self):
        """
        When student enrollment grows beyond the invoiced headcount,
        the growth is flagged to the platform admin without blocking the school.
        """
        SchoolSubscription.objects.update_or_create(
            school=self.school_a,
            defaults={
                'plan': self.standard_plan,
                'status': 'active',
                'student_count_at_last_invoice': 5,  # Invoiced for 5, but currently has 10!
            }
        )

        self.client.force_authenticate(user=self.platform_admin)
        res = self.client.get('/api/v1/platform-admin/billing/schools/')
        self.assertEqual(res.status_code, 200)

        school_entry = next((s for s in res.data['results'] if s['school_id'] == self.school_a.id), None)
        self.assertIsNotNone(school_entry)
        self.assertTrue(school_entry['has_student_growth'])
        self.assertEqual(school_entry['growth_count'], 5)

        # School still retains write access and is not blocked
        entitlements = get_school_entitlements(self.school_a, use_cache=False)
        self.assertTrue(entitlements['is_write_allowed'])

    # --------------------------------------------------------------------------
    # 13. RLS Schema & Model Coverage Audit
    # --------------------------------------------------------------------------

    def test_rls_schema_and_tenant_scoping_coverage(self):
        """
        Audits all subscription models:
        - Platform tables must be intentionally UNSCOPED (no school FK).
        - Tenant tables must be strictly TENANT-SCOPED (must have school FK).
        """
        unscoped_models = [
            Plan,
            PlanFeature,
            FeatureCatalog,
            PlatformBillingSettings,
            LandingPlan,
        ]
        for m in unscoped_models:
            fields = [f.name for f in m._meta.get_fields()]
            self.assertNotIn('school', fields, f"Model {m.__name__} must be unscoped")

        tenant_models = [
            SchoolSubscription,
            SubscriptionOrder,
            SchoolFeatureOverride,
            SubscriptionEvent,
        ]
        for m in tenant_models:
            fields = [f.name for f in m._meta.get_fields()]
            self.assertIn('school', fields, f"Model {m.__name__} must be tenant-scoped with school FK")
