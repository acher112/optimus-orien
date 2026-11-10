"""
Tests for Platform Admin Website Owner Console:
- School directory with day tracking and per-school financials
- Package / subscription alterations (plan, status, date extensions, student overrides)
- Financial analytics (total revenue, MRR, plan distribution, trends, rankings)
"""
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status

from core.models import Organisation, School, User, Plan, SchoolSubscription, SubscriptionOrder


class PlatformAdminWebsiteOwnerTests(APITestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name='Global Apex Network', code='APEX')
        self.school = School.objects.create(organisation=self.org, name='Apex Campus Lahore', code='APEX-LHR', city='Lahore')

        self.superuser = User.objects.create_superuser(
            username='siteowner',
            email='owner@optimusorien.com',
            password='OwnerSecret123!'
        )

        self.standard_plan, _ = Plan.objects.get_or_create(
            code='standard',
            defaults={
                'name': 'Standard Plan',
                'price_usd_per_student': Decimal('3.60'),
                'price_pkr_per_student': Decimal('1000.00'),
                'is_active': True,
            }
        )

        self.premium_plan, _ = Plan.objects.get_or_create(
            code='premium',
            defaults={
                'name': 'Premium Plan',
                'price_usd_per_student': Decimal('7.20'),
                'price_pkr_per_student': Decimal('2000.00'),
                'is_active': True,
            }
        )

        self.free_plan, _ = Plan.objects.get_or_create(
            code='free',
            defaults={
                'name': '30-Day Free Trial',
                'price_usd_per_student': Decimal('0.00'),
                'price_pkr_per_student': Decimal('0.00'),
                'is_active': True,
            }
        )

    def test_schools_directory_endpoint(self):
        self.client.force_authenticate(user=self.superuser)
        res = self.client.get('/api/v1/platform-admin/billing/schools/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', [])
        self.assertTrue(len(results) >= 1)

        sch_data = next((x for x in results if x['school_id'] == self.school.id), None)
        self.assertIsNotNone(sch_data)
        self.assertIn('days_passed', sch_data)
        self.assertIn('days_remaining', sch_data)
        self.assertIn('monthly_revenue_usd', sch_data)
        self.assertIn('monthly_revenue_pkr', sch_data)
        self.assertIn('total_paid_usd', sch_data)
        self.assertIn('total_paid_pkr', sch_data)

    def test_alter_school_subscription_endpoint(self):
        self.client.force_authenticate(user=self.superuser)

        # Alter to Standard plan with 60 days extension
        payload = {
            'plan_code': 'standard',
            'status': 'active',
            'extend_days': 60,
            'active_students_override': 150,
            'notes': 'Granted promotional period',
        }
        res = self.client.post(f'/api/v1/platform-admin/billing/schools/{self.school.id}/alter/', data=payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['plan_code'], 'standard')
        self.assertEqual(res.data['status'], 'active')
        self.assertIsNotNone(res.data['paid_until'])

        # Verify in database
        sub = SchoolSubscription.objects.get(school=self.school)
        self.assertEqual(sub.plan.code, 'standard')
        self.assertEqual(sub.status, 'active')
        self.assertEqual(sub.student_count_at_last_invoice, 150)
        self.assertTrue(sub.paid_until > timezone.now() + timezone.timedelta(days=50))

        # Alter to Premium plan
        res2 = self.client.post(f'/api/v1/platform-admin/billing/schools/{self.school.id}/alter/', data={'plan_code': 'premium'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        sub.refresh_from_db()
        self.assertEqual(sub.plan.code, 'premium')

    def test_finance_analytics_endpoint(self):
        self.client.force_authenticate(user=self.superuser)

        # Create sample approved orders
        SubscriptionOrder.objects.create(
            order_number='ORD-TEST-001',
            school=self.school,
            plan=self.standard_plan,
            billing_months=1,
            student_count=100,
            unit_price=Decimal('3.60'),
            amount=Decimal('360.00'),
            currency='USD',
            status='approved',
        )

        SubscriptionOrder.objects.create(
            order_number='ORD-TEST-002',
            school=self.school,
            plan=self.premium_plan,
            billing_months=6,
            student_count=50,
            unit_price=Decimal('2000.00'),
            amount=Decimal('100000.00'),
            currency='PKR',
            status='approved',
        )

        res = self.client.get('/api/v1/platform-admin/billing/finance-analytics/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        kpis = res.data.get('kpis', {})
        self.assertIn('total_revenue_usd', kpis)
        self.assertIn('total_revenue_pkr', kpis)
        self.assertIn('monthly_run_rate_usd', kpis)
        self.assertIn('monthly_run_rate_pkr', kpis)

        # Check total revenues
        self.assertEqual(Decimal(kpis['total_revenue_usd']), Decimal('360.00'))
        self.assertEqual(Decimal(kpis['total_revenue_pkr']), Decimal('100000.00'))

        # Check plan distribution & monthly trends
        self.assertIn('plan_distribution', res.data)
        self.assertIn('revenue_by_month', res.data)
        self.assertIn('per_school_ranking', res.data)
