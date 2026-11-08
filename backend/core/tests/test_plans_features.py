"""
Unit and Integration Tests for plans/features.py Single Source of Truth.
"""
from unittest.mock import MagicMock
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta

from core.models import Organisation, School, Plan, SchoolSubscription, SchoolFeatureOverride
from plans.features import (
    PLAN_FREE,
    PLAN_STANDARD,
    PLAN_PREMIUM,
    PLAN_CUSTOM,
    PLAN_RANKS,
    PLAN_LIMITS,
    FEATURE_MAP,
    plan_rank,
    get_org_plan,
    has_feature,
    get_plan_limits,
    check_plan_limit,
    get_features_for_plan,
)


class PlansFeaturesTests(TestCase):
    def setUp(self):
        self.org_free = Organisation.objects.create(name='Free Org', code='free-org')
        self.school_free = School.objects.create(name='Free School', code='FREE-1', organisation=self.org_free)

        self.org_standard = Organisation.objects.create(name='Standard Org', code='std-org')
        self.school_standard = School.objects.create(name='Standard School', code='STD-1', organisation=self.org_standard)

        self.org_premium = Organisation.objects.create(name='Premium Org', code='prem-org')
        self.school_premium = School.objects.create(name='Premium School', code='PREM-1', organisation=self.org_premium)

        self.org_custom = Organisation.objects.create(name='Custom Org', code='custom-org')
        self.school_custom = School.objects.create(name='Custom School', code='CUST-1', organisation=self.org_custom)

        self.plan_standard, _ = Plan.objects.get_or_create(code='standard', defaults={'name': 'Standard Plan'})
        self.plan_premium, _ = Plan.objects.get_or_create(code='premium', defaults={'name': 'Premium Plan'})
        self.plan_custom, _ = Plan.objects.get_or_create(code='custom', defaults={'name': 'Custom Plan'})

        SchoolSubscription.objects.create(
            school=self.school_standard,
            plan=self.plan_standard,
            status='active',
            paid_until=timezone.now() + timedelta(days=30)
        )
        SchoolSubscription.objects.create(
            school=self.school_premium,
            plan=self.plan_premium,
            status='active',
            paid_until=timezone.now() + timedelta(days=30)
        )
        SchoolSubscription.objects.create(
            school=self.school_custom,
            plan=self.plan_custom,
            status='active',
            paid_until=timezone.now() + timedelta(days=30)
        )

    def test_feature_map_completeness(self):
        """All required keys from the specification exist in FEATURE_MAP."""
        expected_free = [
            'overview', 'campuses', 'campus_setup', 'academic_years', 'classes',
            'subjects', 'students', 'attendance_basic', 'academics_basic',
            'announcements', 'staff_basic', 'reports_basic', 'notifications',
            'settings', 'plan_billing'
        ]
        for feat in expected_free:
            self.assertIn(feat, FEATURE_MAP)
            self.assertEqual(FEATURE_MAP[feat], PLAN_FREE, f"{feat} must be in free tier")

        expected_standard = [
            'homework', 'examinations', 'study_materials', 'timetable',
            'student_fees', 'data_import', 'communication_limited',
            'permissions_basic', 'reports_standard', 'finance', 'staff_salaries'
        ]
        for feat in expected_standard:
            self.assertIn(feat, FEATURE_MAP)
            self.assertEqual(FEATURE_MAP[feat], PLAN_STANDARD, f"{feat} must be in standard tier")

        expected_premium = [
            'finance_dashboard', 'salary_exports', 'academic_quality_index',
            'psychological_evaluation', 'students_at_risk', 'interventions',
            'communication_full', 'audit_log', 'permissions_custom_roles',
            'reports_drilldown_exports'
        ]
        for feat in expected_premium:
            self.assertIn(feat, FEATURE_MAP)
            self.assertEqual(FEATURE_MAP[feat], PLAN_PREMIUM, f"{feat} must be in premium tier")

    def test_plan_rank(self):
        """plan_rank helper returns correct integer ranks for plans and aliases."""
        self.assertEqual(plan_rank('free'), 0)
        self.assertEqual(plan_rank('no_plan'), 0)
        self.assertEqual(plan_rank(None), 0)
        self.assertEqual(plan_rank('standard'), 1)
        self.assertEqual(plan_rank('premium'), 2)
        self.assertEqual(plan_rank('custom'), 3)
        self.assertEqual(plan_rank(self.plan_standard), 1)
        self.assertEqual(plan_rank(self.plan_premium), 2)
        self.assertEqual(plan_rank(self.plan_custom), 3)

    def test_get_org_plan(self):
        """get_org_plan correctly resolves plan from models and fallbacks."""
        self.assertEqual(get_org_plan(self.org_free), PLAN_FREE)
        self.assertEqual(get_org_plan(self.school_free), PLAN_FREE)
        self.assertEqual(get_org_plan(self.org_standard), PLAN_STANDARD)
        self.assertEqual(get_org_plan(self.school_standard), PLAN_STANDARD)
        self.assertEqual(get_org_plan(self.org_premium), PLAN_PREMIUM)
        self.assertEqual(get_org_plan(self.school_premium), PLAN_PREMIUM)
        self.assertEqual(get_org_plan(self.org_custom), PLAN_CUSTOM)
        self.assertEqual(get_org_plan(self.school_custom), PLAN_CUSTOM)

        # Mock / custom object testing
        class MockOrg:
            def __init__(self, plan=None):
                self.plan = plan
        mock_org = MockOrg(plan='standard')
        self.assertEqual(get_org_plan(mock_org), PLAN_STANDARD)

    def test_has_feature_across_tiers(self):
        """has_feature accurately enforces access per plan tier."""
        # Free Org:
        self.assertTrue(has_feature(self.org_free, 'overview'))
        self.assertTrue(has_feature(self.org_free, 'students'))
        self.assertFalse(has_feature(self.org_free, 'finance'))
        self.assertFalse(has_feature(self.org_free, 'staff_salaries'))
        self.assertFalse(has_feature(self.org_free, 'finance_dashboard'))
        self.assertFalse(has_feature(self.org_free, 'academic_quality_index'))

        # Standard Org:
        self.assertTrue(has_feature(self.org_standard, 'overview'))
        self.assertTrue(has_feature(self.org_standard, 'finance'))
        self.assertTrue(has_feature(self.org_standard, 'staff_salaries'))
        self.assertTrue(has_feature(self.org_standard, 'homework'))
        self.assertFalse(has_feature(self.org_standard, 'finance_dashboard'))
        self.assertFalse(has_feature(self.org_standard, 'salary_exports'))
        self.assertFalse(has_feature(self.org_standard, 'academic_quality_index'))

        # Premium Org:
        self.assertTrue(has_feature(self.org_premium, 'overview'))
        self.assertTrue(has_feature(self.org_premium, 'finance'))
        self.assertTrue(has_feature(self.org_premium, 'staff_salaries'))
        self.assertTrue(has_feature(self.org_premium, 'finance_dashboard'))
        self.assertTrue(has_feature(self.org_premium, 'salary_exports'))
        self.assertTrue(has_feature(self.org_premium, 'academic_quality_index'))

        # Custom Org:
        self.assertTrue(has_feature(self.org_custom, 'finance_dashboard'))
        self.assertTrue(has_feature(self.org_custom, 'academic_quality_index'))

    def test_has_feature_aliases(self):
        """Feature aliases seamlessly map to canonical features."""
        # 'hr_payroll' -> 'staff_salaries' (Standard)
        self.assertFalse(has_feature(self.org_free, 'hr_payroll'))
        self.assertTrue(has_feature(self.org_standard, 'hr_payroll'))

        # 'accounts_ledger' -> 'finance' (Standard)
        self.assertFalse(has_feature(self.org_free, 'accounts_ledger'))
        self.assertTrue(has_feature(self.org_standard, 'accounts_ledger'))

        # 'aqi' -> 'academic_quality_index' (Premium)
        self.assertFalse(has_feature(self.org_standard, 'aqi'))
        self.assertTrue(has_feature(self.org_premium, 'aqi'))

    def test_custom_plan_overrides(self):
        """Custom plan inherits premium and respects superadmin overrides."""
        # Revoke 'salary_exports' on school_custom
        SchoolFeatureOverride.objects.create(
            school=self.school_custom,
            feature_key='salary_exports',
            is_granted=False
        )
        self.assertFalse(has_feature(self.school_custom, 'salary_exports'))
        # Other premium features remain granted
        self.assertTrue(has_feature(self.school_custom, 'finance_dashboard'))

        # Grant 'salary_exports' to standard school via override
        SchoolFeatureOverride.objects.create(
            school=self.school_standard,
            feature_key='salary_exports',
            is_granted=True
        )
        self.assertTrue(has_feature(self.school_standard, 'salary_exports'))

    def test_usage_limits(self):
        """Usage limits for Free, Standard, Premium, and Custom."""
        free_limits = get_plan_limits(PLAN_FREE)
        self.assertEqual(free_limits['max_campuses'], 1)
        self.assertEqual(free_limits['max_students'], 30)

        std_limits = get_plan_limits(PLAN_STANDARD)
        self.assertIsNone(std_limits['max_campuses'])
        self.assertIsNone(std_limits['max_students'])

        # Check plan limit helper
        is_ok, max_allowed = check_plan_limit(self.org_free, 'max_students', 25)
        self.assertTrue(is_ok)
        self.assertEqual(max_allowed, 30)

        is_exceeded, max_allowed = check_plan_limit(self.org_free, 'max_students', 35)
        self.assertFalse(is_exceeded)
        self.assertEqual(max_allowed, 30)

        # Custom per-organisation limit override
        class MockCustomOrg:
            def __init__(self):
                self.plan = 'custom'
                self.custom_limits = {'max_students': 500}
        mock_custom_org = MockCustomOrg()
        self.assertEqual(get_plan_limits(org=mock_custom_org)['max_students'], 500)
