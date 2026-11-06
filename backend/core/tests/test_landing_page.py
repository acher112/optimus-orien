from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from core.models import (
    Organisation,
    School,
    User,
    LandingHeroSlide,
    LandingCoreFeature,
    LandingFAQ,
    LandingPlan,
    LandingSiteSetting,
    LandingContactMessage,
    Plan,
    PlanFeature,
    FeatureCatalog,
    PlatformBillingSettings,
)
from core.services.landing_cms import seed_default_landing_content, get_public_landing_data


class LandingPageCmsTests(TestCase):
    def setUp(self):
        # Platform Owner
        self.owner_org = Organisation.objects.create(name='Optimus HQ', code='optimus-hq')
        self.owner = User.objects.create_user(
            username='platform_owner',
            password='Password123!',
            role='owner',
            organisation=self.owner_org,
        )

        # School Admin and Teacher
        self.school_org = Organisation.objects.create(name='Test Org', code='test-org')
        self.school = School.objects.create(name='Test School', code='ts1', organisation=self.school_org)
        self.school_admin = User.objects.create_user(
            username='school_admin',
            password='Password123!',
            role='school_admin',
            organisation=self.school_org,
            school=self.school,
        )
        self.teacher = User.objects.create_user(
            username='teacher_jane',
            password='Password123!',
            role='teacher',
            organisation=self.school_org,
            school=self.school,
        )

    def test_public_landing_data_returns_active_only(self):
        """Public endpoint returns only active features, slides, faqs and plans."""
        # Active slide
        LandingHeroSlide.objects.create(
            title='Active Slide',
            subtitle='Welcome to Optimus',
            is_active=True,
            sort_order=1,
        )
        # Inactive slide
        LandingHeroSlide.objects.create(
            title='Hidden Slide',
            subtitle='Should not appear',
            is_active=False,
            sort_order=2,
        )

        # Active & inactive core feature
        LandingCoreFeature.objects.create(
            title='Active Feature',
            description='Shows in list',
            icon_key='academic',
            is_active=True,
            sort_order=1,
        )
        LandingCoreFeature.objects.create(
            title='Archived Feature',
            description='Archived',
            icon_key='class',
            is_active=False,
            sort_order=2,
        )

        # Active & inactive FAQ
        LandingFAQ.objects.create(
            question='Active Q',
            answer='Active A',
            is_active=True,
            sort_order=1,
        )
        LandingFAQ.objects.create(
            question='Draft Q',
            answer='Draft A',
            is_active=False,
            sort_order=2,
        )

        # Active & inactive Plan
        LandingPlan.objects.create(
            name='Active Plan',
            slug='active-plan',
            price_usd_per_student=Decimal('3.60'),
            is_active=True,
            sort_order=1,
        )
        LandingPlan.objects.create(
            name='Retired Plan',
            slug='retired-plan',
            price_usd_per_student=Decimal('1.00'),
            is_active=False,
            sort_order=2,
        )

        res = self.client.get('/api/v1/public/landing/')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        slide_titles = [s['title'] for s in data['hero_slides']]
        self.assertIn('Active Slide', slide_titles)
        self.assertNotIn('Hidden Slide', slide_titles)

        feature_titles = [f['title'] for f in data['core_features']]
        self.assertIn('Active Feature', feature_titles)
        self.assertNotIn('Archived Feature', feature_titles)

        faq_questions = [q['question'] for q in data['faqs']]
        self.assertIn('Active Q', faq_questions)
        self.assertNotIn('Draft Q', faq_questions)

        plan_slugs = [p['slug'] for p in data['plans']]
        self.assertIn('active-plan', plan_slugs)
        self.assertNotIn('retired-plan', plan_slugs)

    def test_public_landing_data_localization_en_and_ur(self):
        """Locale toggle returns English or Urdu strings and is_rtl flag."""
        LandingCoreFeature.objects.create(
            title='Academic Intelligence',
            title_ur='تعلیمی ذہانت',
            description='Detailed marks and metrics',
            description_ur='تفصیلی نمبر اور امتحانی تجزیات',
            icon_key='academic',
            is_active=True,
            sort_order=1,
        )

        # English
        res_en = self.client.get('/api/v1/public/landing/?locale=en')
        self.assertEqual(res_en.status_code, 200)
        data_en = res_en.json()
        self.assertFalse(data_en['is_rtl'])
        self.assertEqual(data_en['core_features'][0]['title'], 'Academic Intelligence')

        # Urdu
        res_ur = self.client.get('/api/v1/public/landing/?locale=ur')
        self.assertEqual(res_ur.status_code, 200)
        data_ur = res_ur.json()
        self.assertTrue(data_ur['is_rtl'])
        self.assertEqual(data_ur['core_features'][0]['title'], 'تعلیمی ذہانت')

    def test_contact_form_submission_and_validation(self):
        """Submitting contact form saves inquiry with phone as text and validates fields."""
        payload = {
            'name': 'Principal Ahmed',
            'email': 'ahmed@oxford-lahore.edu.pk',
            'phone': '+92 (042) 3578-9900',  # Stored as text string, not integer
            'company': 'Oxford Grammar Lahore',
            'subject': 'Enterprise Campus Inquiries',
            'message': 'We would like to pilot Optimus Orien for 1,200 students across 3 campuses.',
        }

        res = self.client.post('/api/v1/public/contact/', data=payload, content_type='application/json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.json()['success'])

        inquiry = LandingContactMessage.objects.filter(email='ahmed@oxford-lahore.edu.pk').first()
        self.assertIsNotNone(inquiry)
        self.assertEqual(inquiry.name, 'Principal Ahmed')
        self.assertEqual(inquiry.phone, '+92 (042) 3578-9900')
        self.assertEqual(inquiry.status, 'new')

        # Validation: missing name or invalid email returns 400
        res_bad = self.client.post(
            '/api/v1/public/contact/',
            data={'name': '', 'email': 'not-an-email', 'message': 'Hi'},
            content_type='application/json',
        )
        self.assertEqual(res_bad.status_code, 400)

    def test_contact_form_honeypot(self):
        """Bots filling in the hidden 'website' field are absorbed silently without creating inquiries."""
        payload = {
            'name': 'Spam Bot 3000',
            'email': 'spambot@marketing-crawler.xyz',
            'message': 'Buy backlinks today!',
            'website': 'https://spam-link.xyz',  # Honeypot triggered
        }

        initial_count = LandingContactMessage.objects.count()
        res = self.client.post('/api/v1/public/contact/', data=payload, content_type='application/json')
        # Returns 201 / success message so bot believes form was sent, but no record is stored
        self.assertIn(res.status_code, [200, 201])
        self.assertEqual(LandingContactMessage.objects.count(), initial_count)

    def test_contact_form_rate_limiting(self):
        """Exceeding 5 contact form submissions in one hour from the same IP is blocked."""
        payload = {
            'name': 'Test Submitter',
            'email': 'rate-tester@test.com',
            'message': 'Hello inquiry message',
        }

        # First 5 submissions succeed
        for _ in range(5):
            res = self.client.post(
                '/api/v1/public/contact/',
                data=payload,
                content_type='application/json',
                REMOTE_ADDR='198.51.100.42',
            )
            self.assertEqual(res.status_code, 201)

        # 6th submission from the same IP gets blocked by rate limiter
        res_limit = self.client.post(
            '/api/v1/public/contact/',
            data=payload,
            content_type='application/json',
            REMOTE_ADDR='198.51.100.42',
        )
        self.assertEqual(res_limit.status_code, 400)
        self.assertIn('Too many inquiries', str(res_limit.content))

    def test_platform_admin_write_permissions(self):
        """Only platform owner can write to platform CMS tables; non-owners get 403 Forbidden."""
        feature_payload = {
            'title': 'New Feature by Admin',
            'description': 'Description',
            'icon_key': 'class',
        }

        # 1. Anonymous user cannot write
        res_anon = self.client.post(
            '/api/v1/platform-admin/landing/features/',
            data=feature_payload,
            content_type='application/json',
        )
        self.assertIn(res_anon.status_code, [401, 403])

        # 2. Teacher cannot write (403)
        self.client.force_login(self.teacher)
        res_teacher = self.client.post(
            '/api/v1/platform-admin/landing/features/',
            data=feature_payload,
            content_type='application/json',
        )
        self.assertEqual(res_teacher.status_code, 403)

        # 3. School Admin cannot write (403)
        self.client.force_login(self.school_admin)
        res_school_admin = self.client.post(
            '/api/v1/platform-admin/landing/features/',
            data=feature_payload,
            content_type='application/json',
        )
        self.assertEqual(res_school_admin.status_code, 403)

        # 4. Platform Owner can write (201)
        self.client.force_login(self.owner)
        res_owner = self.client.post(
            '/api/v1/platform-admin/landing/features/',
            data=feature_payload,
            content_type='application/json',
        )
        self.assertEqual(res_owner.status_code, 201)
        self.assertTrue(LandingCoreFeature.objects.filter(title='New Feature by Admin').exists())

    def test_unscoped_platform_models_coverage_and_documentation(self):
        """
        RLS Coverage Audit:
        The following 6 models are platform-level content models and are intentionally
        UNSCOPED (no school_id foreign key):
        1. LandingHeroSlide: Public marketing slides across the entire SaaS platform.
        2. LandingCoreFeature: 6 core capability definitions across the entire SaaS platform.
        3. LandingFAQ: General platform frequently asked questions.
        4. LandingPlan: Subscription plans and pricing for the entire SaaS platform.
        5. LandingSiteSetting: Global site titles, contact emails, and wordmarks.
        6. LandingContactMessage: Inquiries received by platform landlord/owner before tenant registration.
        """
        unscoped_models = [
            LandingHeroSlide,
            LandingCoreFeature,
            LandingFAQ,
            LandingPlan,
            LandingSiteSetting,
            LandingContactMessage,
            Plan,
            PlanFeature,
            FeatureCatalog,
            PlatformBillingSettings,
        ]

        for model in unscoped_models:
            field_names = [f.name for f in model._meta.get_fields()]
            # Ensure none of these models mistakenly introduce a tenant school_id requirement
            self.assertNotIn(
                'school',
                field_names,
                f"Platform model {model.__name__} must be unscoped and not contain a school FK",
            )
