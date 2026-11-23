"""Comprehensive Automated Test Suite: Public Directory & Campus Leaderboard ("Find a School").

Verifies:
1. Opt-in governance & platform admin approval workflow.
2. Immediate unpublish effect (instant removal and cache invalidation).
3. Strict tenant isolation & unscoped public tables boundary.
4. Privacy protection: Zero student or teacher names/data in public payloads.
5. Principal privacy and explicit consent enforcement.
6. Rate-limited contact reveal gate and honeypot bot trap.
7. Ranking math, competition ties (1, 2, 2, 4), percentile tiers, and deltas ("Most improved").
8. Eligibility thresholds and "Not ranked yet (not enough published data)" handling.
9. Enquiry inbox isolation and 90-day retention purge command.
10. Banned-word / neutrality scanner ensuring strictly positive band labeling.
"""
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework import status

from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Subject, ClassSubject,
    Student, Enrollment, Assessment, Grade, ExamConfiguration, CalculatedStudentResult,
    PublicCampusListing, PublicRankSnapshot, PublicEnquiry, PublicListingConsent,
    PublicListingEvent, SchoolPublicProfileDraft, PlatformPublicDirectoryConfig
)
from core.services.public_directory_service import (
    get_or_create_platform_config,
    refresh_public_snapshots,
    submit_listing_for_approval,
    moderate_listing,
    unpublish_listing,
    reveal_campus_contact,
    submit_public_enquiry,
    purge_expired_enquiries,
    update_principal_consent,
    BANNED_WORDS
)


class PublicDirectoryTestSuite(TestCase):

    def setUp(self):
        cache.clear()
        self.client = APIClient()

        # Platform Admin (Role: owner)
        self.platform_admin = User.objects.create_user(
            username='platform_owner_test',
            email='owner@optimus-test.internal',
            password='TestPassword123!',
            role='owner',
            is_staff=True,
            is_superuser=True
        )

        # Fictional Organisation
        self.org = Organisation.objects.create(name='Test Education Trust', code='test-trust')

        # Campus A (Lahore)
        self.school_a = School.objects.create(
            organisation=self.org,
            name='Evergreen Falcon Academy',
            code='LHR-EVE',
            city='Lahore'
        )
        self.owner_a = User.objects.create_user(
            username='owner_a_test',
            email='owner_a@evergreen-test.edu.pk',
            password='TestPassword123!',
            role='school_admin',
            school=self.school_a
        )
        self.principal_a = User.objects.create_user(
            username='principal_a_test',
            first_name='Dr. Fictional',
            last_name='Principal A',
            email='principal_a@evergreen-test.edu.pk',
            password='TestPassword123!',
            role='principal',
            school=self.school_a
        )

        # Campus B (Lahore - for tie testing)
        self.school_b = School.objects.create(
            organisation=self.org,
            name='Crescent Valley Grammar',
            code='LHR-CRE',
            city='Lahore'
        )
        self.owner_b = User.objects.create_user(
            username='owner_b_test',
            email='owner_b@crescent-test.edu.pk',
            password='TestPassword123!',
            role='school_admin',
            school=self.school_b
        )

        # Campus C (Karachi - for geographic filtering)
        self.school_c = School.objects.create(
            organisation=self.org,
            name='Jasmine Harbor Collegiate',
            code='KHI-JAS',
            city='Karachi'
        )

        # Seed Academic Structures
        self._seed_campus_academic_data(self.school_a, aqi=Decimal('90.00'), student_count=20)
        self._seed_campus_academic_data(self.school_b, aqi=Decimal('90.00'), student_count=20)
        self._seed_campus_academic_data(self.school_c, aqi=Decimal('82.00'), student_count=20)

    def _seed_campus_academic_data(self, school: School, aqi: Decimal, student_count: int):
        """Helper to seed valid published examination data for a campus."""
        ay, _ = AcademicYear.objects.get_or_create(
            school=school,
            name='2025-2026',
            defaults={
                'start_date': timezone.now().date() - timedelta(days=120),
                'end_date': timezone.now().date() + timedelta(days=180),
                'active': True
            }
        )
        s_class = SchoolClass.objects.create(school=school, name='Grade 8', academic_year=ay)

        subjects = []
        for sname in ['Mathematics', 'Science', 'English', 'History']:
            subj = Subject.objects.create(school=school, name=sname, code=f"{sname[:3].upper()}-{school.code}")
            ClassSubject.objects.create(school_class=s_class, subject=subj)
            subjects.append(subj)

        for i in range(student_count):
            st = Student.objects.create(
                school=school,
                first_name=f"Student{i}",
                last_name=f"Cohort{school.code[:3]}",
                admission_number=f"{school.code}-{i:03d}",
                gender='male' if i % 2 == 0 else 'female',
                enrolled_on=ay.start_date,
                active=True
            )
            Enrollment.objects.create(student=st, school_class=s_class, start_date=ay.start_date)

        config = ExamConfiguration.objects.create(
            school=school,
            name=f"Annual Exams - {school.name}",
            academic_year=ay,
            school_class=s_class,
            status='published',
            reporting_scale=Decimal('100.00')
        )

        for subj in subjects:
            Assessment.objects.create(
                school_class=s_class,
                subject=subj,
                title=f"{subj.name} Component",
                date=timezone.now().date() - timedelta(days=20),
                max_marks=Decimal('100.00'),
                weight=Decimal('1.00'),
                published=True
            )

        for st in Student.objects.filter(school=school):
            CalculatedStudentResult.objects.create(
                student=st,
                school_class=s_class,
                configuration=config,
                academic_year=ay,
                completed=True,
                overall_percentage=aqi,
                passed=True
            )

    # -------------------------------------------------------------------------
    # 1. OPT-IN GOVERNANCE & APPROVAL WORKFLOW
    # -------------------------------------------------------------------------

    def test_opt_in_governance_and_approval_workflow(self):
        """
        Scenario:
        1. School starts in draft (default OFF).
        2. School owner signs consent and submits for approval -> status='pending_approval'.
        3. Listing does NOT appear in public search while pending.
        4. Platform admin approves listing -> status='live'.
        5. Listing appears in public search.
        6. Full legal consent and audit events recorded.
        """
        # Initially not listed
        res_init = self.client.get('/api/v1/public/schools/')
        self.assertEqual(res_init.status_code, status.HTTP_200_OK)
        self.assertEqual(res_init.data['count'], 0)

        # 1. School owner configures draft profile
        self.client.force_authenticate(user=self.owner_a)
        put_res = self.client.put(f'/api/v1/schools/{self.school_a.id}/public-profile/', {
            'display_name': 'Evergreen Falcon Academy',
            'tagline': 'Curiosity and character.',
            'about': 'Fictional model school for testing.',
            'country': 'Pakistan',
            'province': 'Punjab',
            'city': 'Lahore',
            'boards': ['Cambridge', 'Federal Board'],
            'levels': ['Primary', 'Secondary'],
            'gender_type': 'co-ed',
            'medium': 'english',
            'official_phone': '+92-42-5550100',
            'official_email': 'contact@evergreen-test.edu.pk',
        }, format='json')
        self.assertEqual(put_res.status_code, status.HTTP_200_OK)

        # 2. Submit for approval
        sub_res = self.client.post(f'/api/v1/schools/{self.school_a.id}/public-profile/submit/')
        self.assertEqual(sub_res.status_code, status.HTTP_200_OK)
        self.assertEqual(sub_res.data['status'], 'pending_approval')

        listing = PublicCampusListing.objects.get(school=self.school_a)
        self.assertEqual(listing.status, 'pending_approval')

        # 3. Must NOT appear publicly yet
        self.client.force_authenticate(user=None)
        res_pending = self.client.get('/api/v1/public/schools/')
        self.assertEqual(res_pending.data['count'], 0)

        # 4. Platform admin reviews moderation queue and approves
        self.client.force_authenticate(user=self.platform_admin)
        queue_res = self.client.get('/api/v1/admin/public-directory/listings/?status=pending_approval')
        self.assertEqual(len(queue_res.data['listings']), 1)
        self.assertEqual(queue_res.data['listings'][0]['id'], listing.id)

        app_res = self.client.post(f'/api/v1/admin/public-directory/listings/{listing.id}/approve/', {
            'reason': 'Verified educational criteria.'
        })
        self.assertEqual(app_res.status_code, status.HTTP_200_OK)

        listing.refresh_from_db()
        self.assertEqual(listing.status, 'live')
        self.assertIsNotNone(listing.approved_at)

        # 5. Must now appear in public directory
        self.client.force_authenticate(user=None)
        res_live = self.client.get('/api/v1/public/schools/')
        self.assertEqual(res_live.data['count'], 1)
        self.assertEqual(res_live.data['results'][0]['display_name'], 'Evergreen Falcon Academy')

        # 6. Consent & Audit Events verified
        self.assertTrue(PublicListingConsent.objects.filter(listing=listing, consent_type='school_publish', agreed=True).exists())
        self.assertTrue(PublicListingEvent.objects.filter(listing=listing, event_type='opt_in_submitted').exists())
        self.assertTrue(PublicListingEvent.objects.filter(listing=listing, event_type='approved').exists())

    # -------------------------------------------------------------------------
    # 2. IMMEDIATE UNPUBLISH EFFECT
    # -------------------------------------------------------------------------

    def test_immediate_unpublish_effect(self):
        """
        Scenario:
        1. A live listing is immediately removed from public endpoints when school owner unpublishes.
        2. A live listing is immediately removed when platform admin unpublishes with a reason.
        3. Cache is instantly invalidated; no stale public reads.
        """
        listing = submit_listing_for_approval(school=self.school_a, user=self.owner_a)
        moderate_listing(listing_id=listing.id, action='approve', actor=self.platform_admin)
        refresh_public_snapshots()

        # Publicly visible
        r1 = self.client.get('/api/v1/public/schools/')
        self.assertEqual(r1.data['count'], 1)

        # A) School owner unpublishes
        self.client.force_authenticate(user=self.owner_a)
        unp_res = self.client.post(f'/api/v1/schools/{self.school_a.id}/public-profile/unpublish/', {
            'reason': 'Temporary admissions pause.'
        })
        self.assertEqual(unp_res.status_code, status.HTTP_200_OK)
        self.assertEqual(unp_res.data['status'], 'unpublished')

        # Publicly disappears immediately
        self.client.force_authenticate(user=None)
        r2 = self.client.get('/api/v1/public/schools/')
        self.assertEqual(r2.data['count'], 0)

        # Detail view returns 404
        r_det = self.client.get(f'/api/v1/public/schools/{listing.slug}/')
        self.assertEqual(r_det.status_code, status.HTTP_404_NOT_FOUND)

        # Re-publish and test platform admin unpublish
        moderate_listing(listing_id=listing.id, action='approve', actor=self.platform_admin)
        r3 = self.client.get('/api/v1/public/schools/')
        self.assertEqual(r3.data['count'], 1)

        # B) Platform admin unpublishes
        self.client.force_authenticate(user=self.platform_admin)
        adm_unp = self.client.post(f'/api/v1/admin/public-directory/listings/{listing.id}/unpublish/', {
            'reason': 'Administrative review required.'
        })
        self.assertEqual(adm_unp.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=None)
        r4 = self.client.get('/api/v1/public/schools/')
        self.assertEqual(r4.data['count'], 0)

    # -------------------------------------------------------------------------
    # 3. TENANT ISOLATION & RLS BOUNDARY
    # -------------------------------------------------------------------------

    def test_tenant_isolation_and_no_tenant_tables_accessed_by_public(self):
        """
        Public requests query ONLY platform-level unscoped tables.
        Tenant-scoped helper table SchoolPublicProfileDraft enforces school_id isolation.
        """
        # School A creates draft
        draft_a, _ = SchoolPublicProfileDraft.objects.get_or_create(
            school=self.school_a,
            defaults={'display_name': 'Draft A'}
        )
        # School B creates draft
        draft_b, _ = SchoolPublicProfileDraft.objects.get_or_create(
            school=self.school_b,
            defaults={'display_name': 'Draft B'}
        )

        # Owner A accessing School A succeeds
        self.client.force_authenticate(user=self.owner_a)
        res_a = self.client.get(f'/api/v1/schools/{self.school_a.id}/public-profile/')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        self.assertEqual(res_a.data['school_id'], self.school_a.id)

        # Owner A probing School B returns 403 Forbidden
        res_hack = self.client.get(f'/api/v1/schools/{self.school_b.id}/public-profile/')
        self.assertEqual(res_hack.status_code, status.HTTP_403_FORBIDDEN)

        # Public endpoints query works without requiring tenant auth credentials
        self.client.force_authenticate(user=None)
        pub_res = self.client.get('/api/v1/public/schools/')
        self.assertEqual(pub_res.status_code, status.HTTP_200_OK)

    # -------------------------------------------------------------------------
    # 4. PRIVACY: ZERO STUDENT OR TEACHER NAMES IN PUBLIC
    # -------------------------------------------------------------------------

    def test_privacy_no_student_teacher_personal_data_in_public(self):
        """
        Verifies that no student names, teacher names, or internal IDs leak in any public endpoint.
        """
        listing = submit_listing_for_approval(school=self.school_a, user=self.owner_a)
        moderate_listing(listing_id=listing.id, action='approve', actor=self.platform_admin)
        refresh_public_snapshots()

        # Public list payload
        res_list = self.client.get('/api/v1/public/schools/')
        list_str = str(res_list.data).lower()
        self.assertNotIn('student0', list_str)
        self.assertNotIn('cohortlhr', list_str)
        self.assertNotIn('teacher', list_str)

        # Public detail payload
        res_det = self.client.get(f'/api/v1/public/schools/{listing.slug}/')
        det_str = str(res_det.data).lower()
        self.assertNotIn('student0', det_str)
        self.assertNotIn('cohortlhr', det_str)

    # -------------------------------------------------------------------------
    # 5. PRINCIPAL PRIVACY & CONSENT
    # -------------------------------------------------------------------------

    def test_principal_name_and_contact_consent_rules(self):
        """
        Principal name is shown ONLY if that principal gave consent in their own account.
        Principal direct contact is disclosed ONLY if that principal explicitly agreed.
        """
        listing = submit_listing_for_approval(school=self.school_a, user=self.owner_a)
        listing.contact_mode = 'principal_direct'
        listing.principal_direct_phone = '+92-300-5550999'
        listing.principal_direct_email = 'dr.principal@evergreen-test.edu.pk'
        listing.save()
        moderate_listing(listing_id=listing.id, action='approve', actor=self.platform_admin)
        refresh_public_snapshots()

        # By default, principal name is NOT consented
        res_public = self.client.get(f'/api/v1/public/schools/{listing.slug}/')
        self.assertIsNone(res_public.data['principal_name'])

        # Reveal contact endpoint before consent does NOT expose principal direct contact
        reveal_pre = self.client.post(f'/api/v1/public/schools/{listing.slug}/reveal-contact/')
        self.assertEqual(reveal_pre.data['principal_direct_phone'], '')
        self.assertEqual(reveal_pre.data['principal_direct_email'], '')

        # Principal authenticates and grants name consent ONLY
        self.client.force_authenticate(user=self.principal_a)
        consent_res = self.client.post('/api/v1/principal/public-directory-consent/', {
            'show_principal_name': True,
            'show_principal_direct_contact': False,
        })
        self.assertEqual(consent_res.status_code, status.HTTP_200_OK)

        # Now public profile shows principal name, but direct contact remains withheld
        self.client.force_authenticate(user=None)
        res_public_after = self.client.get(f'/api/v1/public/schools/{listing.slug}/')
        self.assertIsNotNone(res_public_after.data['principal_name'])
        self.assertIn('Principal A', res_public_after.data['principal_name'])

        reveal_mid = self.client.post(f'/api/v1/public/schools/{listing.slug}/reveal-contact/')
        self.assertEqual(reveal_mid.data['principal_direct_phone'], '')

        # Principal now explicitly grants direct contact consent
        self.client.force_authenticate(user=self.principal_a)
        self.client.post('/api/v1/principal/public-directory-consent/', {
            'show_principal_name': True,
            'show_principal_direct_contact': True,
        })

        # Now reveal contact returns principal direct phone and email
        self.client.force_authenticate(user=None)
        reveal_post = self.client.post(f'/api/v1/public/schools/{listing.slug}/reveal-contact/')
        self.assertEqual(reveal_post.data['principal_direct_phone'], '+92-300-5550999')
        self.assertEqual(reveal_post.data['principal_direct_email'], 'dr.principal@evergreen-test.edu.pk')

    # -------------------------------------------------------------------------
    # 6. CONTACT REVEAL RATE LIMITING & HONEYPOT
    # -------------------------------------------------------------------------

    def test_contact_reveal_rate_limiting_and_honeypot(self):
        """
        Phone and email are never present in default payloads.
        Contact reveal endpoint is rate-limited (max 5 calls/min).
        Honeypot catches spam bots without persisting to database.
        """
        listing = submit_listing_for_approval(school=self.school_a, user=self.owner_a)
        listing.official_phone = '+92-42-5550100'
        listing.official_email = 'info@evergreen-test.edu.pk'
        listing.contact_mode = 'official_contact'
        listing.save()
        moderate_listing(listing_id=listing.id, action='approve', actor=self.platform_admin)

        # 1. Verify default payload omits phone and email
        res_card = self.client.get(f'/api/v1/public/schools/{listing.slug}/')
        self.assertNotIn('official_phone', res_card.data)
        self.assertNotIn('official_email', res_card.data)

        # 2. Rate limit test on reveal endpoint (calls 1-5 succeed, call 6 denied)
        for i in range(5):
            r = self.client.post(f'/api/v1/public/schools/{listing.slug}/reveal-contact/')
            self.assertEqual(r.status_code, status.HTTP_200_OK)

        r_blocked = self.client.post(f'/api/v1/public/schools/{listing.slug}/reveal-contact/')
        self.assertEqual(r_blocked.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Honeypot Bot Trap: Bot fills hidden field 'hp_code'
        cache.clear()
        enquiry_count_before = PublicEnquiry.objects.count()
        bot_res = self.client.post(f'/api/v1/public/schools/{listing.slug}/enquiry/', {
            'parent_name': 'Spam Bot 3000',
            'phone': '+1-800-SPAM',
            'child_grade': 'Grade 5',
            'message': 'Buy cheap crypto now',
            'hp_code': 'I am a malicious bot',  # Honeypot tripped!
        })
        self.assertEqual(bot_res.status_code, status.HTTP_201_CREATED)
        # Verify it was NOT persisted to DB
        self.assertEqual(PublicEnquiry.objects.count(), enquiry_count_before)

        # Legitimate parent submission succeeds and persists
        valid_res = self.client.post(f'/api/v1/public/schools/{listing.slug}/enquiry/', {
            'parent_name': 'Zainab Qasim',
            'phone': '+92-300-1234567',
            'email': 'zainab@example.com',
            'child_grade': 'Grade 8',
            'message': 'We would like to schedule an admissions campus tour.',
            'hp_code': '',  # Legitimate empty honeypot
        })
        self.assertEqual(valid_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PublicEnquiry.objects.count(), enquiry_count_before + 1)

    # -------------------------------------------------------------------------
    # 7. RANKING MATH & COMPETITION TIES (1, 2, 2, 4)
    # -------------------------------------------------------------------------

    def test_ranking_math_and_competition_ties(self):
        """
        Descending order by AQI.
        Ties share rank: if School A (90.0) and School B (90.0) tie for #1, School C (82.0) is #3.
        Score delta vs previous period computed for 'Most improved'.
        """
        # Campus A: AQI 90.0
        la = submit_listing_for_approval(school=self.school_a, user=self.owner_a)
        moderate_listing(listing_id=la.id, action='approve', actor=self.platform_admin)

        # Campus B: AQI 90.0 (tied with A)
        lb = submit_listing_for_approval(school=self.school_b, user=self.owner_b)
        moderate_listing(listing_id=lb.id, action='approve', actor=self.platform_admin)

        # Campus C: AQI 82.0
        owner_c = User.objects.create_user(username='owner_c_test', role='owner', school=self.school_c)
        lc = submit_listing_for_approval(school=self.school_c, user=owner_c)
        moderate_listing(listing_id=lc.id, action='approve', actor=self.platform_admin)

        # Seed previous period for Campus A to test delta
        PublicRankSnapshot.objects.create(
            listing=la,
            period_name='2024-2025 Term 2',
            academic_year='2024-2025',
            aqi_score=Decimal('85.00'),
            band='Outstanding',
            is_eligible=True
        )

        refresh_public_snapshots(period_name='2025-2026 Term 2')

        snap_a = PublicRankSnapshot.objects.get(listing=la, period_name='2025-2026 Term 2')
        snap_b = PublicRankSnapshot.objects.get(listing=lb, period_name='2025-2026 Term 2')
        snap_c = PublicRankSnapshot.objects.get(listing=lc, period_name='2025-2026 Term 2')

        # Tied for rank 1
        self.assertEqual(snap_a.rank_overall, 1)
        self.assertEqual(snap_b.rank_overall, 1)

        # Next campus shares competition rank 3 (NOT 2)
        self.assertEqual(snap_c.rank_overall, 3)

        # Campus A delta: 90.00 - 85.00 = +5.00
        self.assertEqual(snap_a.score_delta, Decimal('5.00'))

    # -------------------------------------------------------------------------
    # 8. ELIGIBILITY BOUNDARIES & POSITIVE BANDS
    # -------------------------------------------------------------------------

    def test_eligibility_boundaries(self):
        """
        Campus with fewer than min_active_students (e.g. 8 < 15) is not eligible.
        Shows positive band 'Not ranked yet (not enough published data)'.
        Rank is None.
        """
        school_small = School.objects.create(organisation=self.org, name='Small Pilot School', code='PK-SMAL', city='Lahore')
        owner_sm = User.objects.create_user(username='owner_sm_test', role='owner', school=school_small)

        # Only 5 students (minimum is 15)
        self._seed_campus_academic_data(school_small, aqi=Decimal('92.00'), student_count=5)

        listing = submit_listing_for_approval(school=school_small, user=owner_sm)
        moderate_listing(listing_id=listing.id, action='approve', actor=self.platform_admin)

        refresh_public_snapshots()

        snap = PublicRankSnapshot.objects.get(listing=listing)
        self.assertFalse(snap.is_eligible)
        self.assertEqual(snap.band, 'Not ranked yet (not enough published data)')
        self.assertIsNone(snap.rank_overall)
        self.assertTrue(len(snap.eligibility_reasons) > 0)

        # Public card display
        res = self.client.get(f'/api/v1/public/schools/{listing.slug}/')
        self.assertEqual(res.data['band'], 'Not ranked yet (not enough published data)')
        self.assertIsNone(res.data['rank_overall'])

    # -------------------------------------------------------------------------
    # 9. ENQUIRY PURGE & TENANT INBOX ISOLATION
    # -------------------------------------------------------------------------

    def test_enquiry_retention_purge_and_campus_inbox_scoping(self):
        """
        Campuses read only their own enquiries.
        Enquiries past 90 days retention are purged by management command.
        """
        la = submit_listing_for_approval(school=self.school_a, user=self.owner_a)
        lb = submit_listing_for_approval(school=self.school_b, user=self.owner_b)

        # Parent enquiries
        e_a = PublicEnquiry.objects.create(
            listing=la,
            parent_name='Parent for School A',
            phone='+92-42-1111111',
            child_grade='Grade 8',
            message='Inquiry for campus A',
            retention_expires_at=timezone.now() + timedelta(days=90)
        )
        e_b = PublicEnquiry.objects.create(
            listing=lb,
            parent_name='Parent for School B',
            phone='+92-42-2222222',
            child_grade='Grade 7',
            message='Inquiry for campus B',
            retention_expires_at=timezone.now() + timedelta(days=90)
        )

        # Owner A queries their inbox
        self.client.force_authenticate(user=self.owner_a)
        inbox_a = self.client.get(f'/api/v1/schools/{self.school_a.id}/public-enquiries/')
        self.assertEqual(len(inbox_a.data['enquiries']), 1)
        self.assertEqual(inbox_a.data['enquiries'][0]['parent_name'], 'Parent for School A')

        # Owner B queries their inbox
        self.client.force_authenticate(user=self.owner_b)
        inbox_b = self.client.get(f'/api/v1/schools/{self.school_b.id}/public-enquiries/')
        self.assertEqual(len(inbox_b.data['enquiries']), 1)
        self.assertEqual(inbox_b.data['enquiries'][0]['parent_name'], 'Parent for School B')

        # Retention expiration test: create an expired enquiry
        PublicEnquiry.objects.create(
            listing=la,
            parent_name='Expired Old Lead',
            phone='+92-42-9999999',
            child_grade='Grade 6',
            message='Old message from 100 days ago',
            retention_expires_at=timezone.now() - timedelta(days=10)
        )
        self.assertEqual(PublicEnquiry.objects.count(), 3)

        purged_count = purge_expired_enquiries()
        self.assertEqual(purged_count, 1)
        self.assertEqual(PublicEnquiry.objects.count(), 2)

    # -------------------------------------------------------------------------
    # 10. BANNED WORDS & NEUTRALITY SCANNER
    # -------------------------------------------------------------------------

    def test_banned_words_and_neutrality_scan(self):
        """
        Deep recursive scan across all public responses (list, detail, compare, methodology).
        Ensures NO punitive, diagnostic, or negative terms exist in public payloads.
        """
        la = submit_listing_for_approval(school=self.school_a, user=self.owner_a)
        moderate_listing(listing_id=la.id, action='approve', actor=self.platform_admin)

        lb = submit_listing_for_approval(school=self.school_b, user=self.owner_b)
        moderate_listing(listing_id=lb.id, action='approve', actor=self.platform_admin)

        refresh_public_snapshots()

        endpoints = [
            '/api/v1/public/schools/',
            f'/api/v1/public/schools/{la.slug}/',
            f'/api/v1/public/schools/compare/?slugs={la.slug},{lb.slug}',
            '/api/v1/public/schools/methodology/',
            '/api/v1/public/schools/sitemap/',
        ]

        for url in endpoints:
            res = self.client.get(url)
            self.assertEqual(res.status_code, status.HTTP_200_OK, f"Endpoint {url} failed with {res.status_code}")
            payload_str = str(res.data).lower()

            for banned in BANNED_WORDS:
                self.assertNotIn(
                    banned,
                    payload_str,
                    f"Banned punitive or negative word '{banned}' detected in public endpoint {url}!"
                )

    def test_campus_configuration_sync_to_public_directory(self):
        """
        Verifies that when a school has country='US', jurisdiction='Usa', and programmes in SchoolConfiguration,
        these details are automatically collected and reflected in public profile draft, public listing,
        and public leaderboard.
        """
        from core.models import SchoolConfiguration
        from core.services.public_directory_service import (
            ensure_all_registered_campuses_synced,
            sync_school_configuration_to_public_directory
        )

        config, _ = SchoolConfiguration.objects.get_or_create(school=self.school_a)
        config.country = 'US'
        config.jurisdiction = 'Usa'
        config.programmes = ['American High School Diploma (AP)', 'IB Diploma']
        config.save()

        sync_school_configuration_to_public_directory(self.school_a, config)

        draft = SchoolPublicProfileDraft.objects.get(school=self.school_a)
        self.assertEqual(draft.country, 'United States')
        self.assertEqual(draft.city, 'Usa')
        self.assertIn('American High School Diploma (AP)', draft.boards)
        self.assertNotEqual(draft.province, 'Punjab')

        ensure_all_registered_campuses_synced()
        listing = PublicCampusListing.objects.get(school=self.school_a)
        self.assertEqual(listing.country, 'United States')
        self.assertEqual(listing.city, 'Usa')
        self.assertIn('American High School Diploma (AP)', listing.boards)
        self.assertNotEqual(listing.province, 'Punjab')

        # Check public endpoint
        res = self.client.get('/api/v1/public/schools/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        found = [r for r in res.data['results'] if r['slug'] == listing.slug]
        self.assertTrue(len(found) > 0)
        self.assertEqual(found[0]['country'], 'United States')
        self.assertEqual(found[0]['city'], 'Usa')
        self.assertIn('American High School Diploma (AP)', found[0]['boards'])

    def test_auto_create_live_listing_from_campus_setup_without_separate_public_profile(self):
        """
        Verifies that campus details from SchoolConfiguration automatically create
        a live PublicCampusListing and PublicRankSnapshot for 'Find a School' without
        needing any separate public profile editor or approval steps.
        """
        from core.models import SchoolConfiguration
        from core.services.public_directory_service import sync_school_configuration_to_public_directory

        new_school = School.objects.create(
            name="Apex Academy",
            organisation=self.org,
            city="New York"
        )
        config, _ = SchoolConfiguration.objects.get_or_create(school=new_school)
        config.country = 'US'
        config.jurisdiction = 'New York, USA'
        config.language = 'en'
        config.programmes = ['US Common Core', 'AP / College Board']
        config.save()

        # Sync campus configuration
        listing = sync_school_configuration_to_public_directory(new_school, config)

        self.assertIsNotNone(listing)
        self.assertEqual(listing.status, 'live')
        self.assertEqual(listing.display_name, "Apex Academy")
        self.assertEqual(listing.country, 'United States')
        self.assertEqual(listing.city, 'New York')
        self.assertEqual(listing.address, 'New York, USA')
        self.assertEqual(listing.medium, 'english')
        self.assertIn('US Common Core', listing.boards)
        self.assertIn('AP / College Board', listing.boards)

        # Verify it is immediately accessible via public listing API
        res = self.client.get('/api/v1/public/schools/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        slug_match = [r for r in res.data['results'] if r['slug'] == listing.slug]
        self.assertEqual(len(slug_match), 1)
        self.assertEqual(slug_match[0]['display_name'], "Apex Academy")
        self.assertEqual(slug_match[0]['country'], "United States")
        self.assertEqual(slug_match[0]['city'], "New York")
        self.assertIn("US Common Core", slug_match[0]['boards'])
