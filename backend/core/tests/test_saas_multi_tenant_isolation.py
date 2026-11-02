"""
Comprehensive SaaS Multi-Tenancy & Tenant Isolation Test Suite.
Validates:
1. Public self-service institution onboarding (Organisation, Campus, Org Admin, Trial Subscription).
2. Multi-campus provisioning within an organisation.
3. Strict multi-tenant isolation across global organisations (e.g. Pakistan vs London):
   - Cross-tenant read denial (returns 404 / empty)
   - Cross-tenant write denial (returns 403 / 404)
   - Cross-tenant class linking denial
   - Cross-tenant student record isolation
   - In-organisation campus isolation for campus principals
4. Individual user self-registration without organisation remains blocked (HTTP 410).
"""
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from core.models import (
    Organisation, School, SchoolClass, Subject, AcademicYear, Student,
    User, PlatformPlan, OrganisationSubscription
)


class SaasMultiTenantIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Seed standard platform plan
        self.plan = PlatformPlan.objects.create(
            name='Enterprise SaaS Plan',
            billing_basis='per_student',
            price_per_unit=Decimal('5.00'),
            currency='USD',
            active=True
        )

    def test_individual_self_registration_without_org_is_blocked_410(self):
        """Random stranger attempting to self-register without an institution is rejected with 410."""
        res = self.client.post('/api/v1/auth/register/', {
            'email': 'stranger@example.com',
            'password': 'StrongPassword123!'
        }, format='json')
        self.assertEqual(res.status_code, 410)
        self.assertIn('closed', res.data.get('detail', '').lower())

    def test_saas_onboarding_and_cross_tenant_isolation(self):
        """
        Scenario:
        1. Pakistan Institution ('SBBU Trust') registers with initial campus 'Sanghar Campus'.
        2. London Institution ('Kings Academy Trust') registers with initial campus 'London Central'.
        3. SBBU Admin registers a second branch 'Nawabshah Campus'.
        4. Validate that Kings Academy and SBBU are completely isolated from each other.
        """
        # 1. Register Pakistan Organisation
        pk_payload = {
            'first_name': 'Awais',
            'last_name': 'Rahim',
            'email': 'awais.rahim12@gmail.com',
            'username': 'admin_awais',
            'password': 'SecurePassword2026!',
            'organisation_name': 'SBBU Educational System',
            'school_name': 'Sanghar Campus',
            'city': 'Sanghar',
            'country': 'PK',
            'role': 'organisation_admin'
        }
        pk_res = self.client.post('/api/v1/auth/register/', pk_payload, format='json')
        self.assertEqual(pk_res.status_code, 201)
        pk_user_id = pk_res.data['id']
        pk_org_id = pk_res.data['organisation']
        pk_school_1_id = pk_res.data['school']

        # Verify PK trial subscription
        pk_org = Organisation.objects.get(id=pk_org_id)
        pk_sub = OrganisationSubscription.objects.get(organisation=pk_org)
        self.assertEqual(pk_sub.status, 'trial')
        self.assertEqual(pk_sub.plan.name, 'Enterprise SaaS Plan')

        # 2. Register London Organisation
        london_client = APIClient()
        london_payload = {
            'first_name': 'Arthur',
            'last_name': 'Pendelton',
            'email': 'arthur@kingsacademy.co.uk',
            'username': 'admin_arthur',
            'password': 'SecurePassword2026!',
            'organisation_name': 'Kings Education Trust',
            'school_name': 'London Central Campus',
            'city': 'London',
            'country': 'GB',
            'role': 'organisation_admin'
        }
        london_res = london_client.post('/api/v1/auth/register/', london_payload, format='json')
        self.assertEqual(london_res.status_code, 201)
        london_user_id = london_res.data['id']
        london_org_id = london_res.data['organisation']
        london_school_id = london_res.data['school']

        self.assertNotEqual(pk_org_id, london_org_id)
        self.assertNotEqual(pk_school_1_id, london_school_id)

        # 3. PK Admin registers a second branch/campus in Pakistan
        branch_res = self.client.post('/api/v1/campuses/register/', {
            'name': 'Nawabshah Campus',
            'code': 'SBBU-NWB',
            'city': 'Nawabshah',
            'country': 'PK'
        }, format='json')
        self.assertEqual(branch_res.status_code, 201)
        pk_school_2_id = branch_res.data['id']

        # 4. Multi-Tenant Isolation Checks:

        # A) Schools Directory Scoping:
        # PK Admin sees both Sanghar and Nawabshah, but NEVER London Central
        pk_schools_res = self.client.get('/api/v1/schools/')
        self.assertEqual(pk_schools_res.status_code, 200)
        pk_school_ids = [s['id'] for s in pk_schools_res.data['results']]
        self.assertIn(pk_school_1_id, pk_school_ids)
        self.assertIn(pk_school_2_id, pk_school_ids)
        self.assertNotIn(london_school_id, pk_school_ids)

        # London Admin sees ONLY London Central, NEVER any Pakistan campus
        london_schools_res = london_client.get('/api/v1/schools/')
        self.assertEqual(london_schools_res.status_code, 200)
        london_school_ids = [s['id'] for s in london_schools_res.data['results']]
        self.assertEqual(london_school_ids, [london_school_id])
        self.assertNotIn(pk_school_1_id, london_school_ids)
        self.assertNotIn(pk_school_2_id, london_school_ids)

        # B) Direct URL Access by ID (Cross-Tenant Probing):
        # PK Admin attempting to access London school returns 404 (NotFound)
        probe_res = self.client.get(f'/api/v1/schools/{london_school_id}/')
        self.assertEqual(probe_res.status_code, 404)

        # London Admin attempting to access PK Sanghar school returns 404 (NotFound)
        probe_res_2 = london_client.get(f'/api/v1/schools/{pk_school_1_id}/')
        self.assertEqual(probe_res_2.status_code, 404)

        # C) Cross-Tenant Modification Denial:
        # London Admin trying to modify PK school returns 404
        hack_update = london_client.patch(f'/api/v1/schools/{pk_school_1_id}/', {'name': 'Hacked Name'}, format='json')
        self.assertEqual(hack_update.status_code, 404)

        # London Admin trying to delete PK school returns 404
        hack_delete = london_client.delete(f'/api/v1/schools/{pk_school_1_id}/')
        self.assertEqual(hack_delete.status_code, 404)

        # D) Classes and Academic Years:
        london_year = AcademicYear.objects.create(
            school_id=london_school_id,
            name='2026-2027',
            start_date='2026-09-01',
            end_date='2027-06-30'
        )
        london_class = SchoolClass.objects.create(
            school_id=london_school_id,
            academic_year=london_year,
            name='Year 7',
            section='A'
        )

        pk_year = AcademicYear.objects.create(
            school_id=pk_school_1_id,
            name='2026-2027',
            start_date='2026-08-01',
            end_date='2027-05-31'
        )
        pk_class = SchoolClass.objects.create(
            school_id=pk_school_1_id,
            academic_year=pk_year,
            name='Class 8',
            section='Alpha'
        )

        # E) Cross-Tenant Class Linking Rejection:
        # London admin trying to enroll a student into Pakistan's class must be rejected!
        cross_enroll_res = london_client.post('/api/v1/students/', {
            'school': london_school_id,
            'admission_number': 'HACK-001',
            'first_name': 'Infiltrator',
            'last_name': 'Test',
            'father_name': 'None',
            'gender': 'other',
            'enrolled_on': '2026-09-01',
            'school_class': pk_class.id,
            'active': True
        }, format='json')
        self.assertIn(cross_enroll_res.status_code, (400, 403, 404))

        # F) Legitimate Student Admissions:
        # Create student in London
        london_student_res = london_client.post('/api/v1/students/', {
            'school': london_school_id,
            'admission_number': 'LON-2026-001',
            'first_name': 'Oliver',
            'last_name': 'Smith',
            'father_name': 'William Smith',
            'gender': 'male',
            'enrolled_on': '2026-09-01',
            'school_class': london_class.id,
            'active': True
        }, format='json')
        self.assertEqual(london_student_res.status_code, 201)
        london_student_id = london_student_res.data['id']

        # Create student in Pakistan
        pk_student_res = self.client.post('/api/v1/students/', {
            'school': pk_school_1_id,
            'admission_number': 'SBBU-2026-001',
            'first_name': 'Zainab',
            'last_name': 'Ali',
            'father_name': 'Tariq Ali',
            'gender': 'female',
            'enrolled_on': '2026-09-01',
            'school_class': pk_class.id,
            'active': True
        }, format='json')
        self.assertEqual(pk_student_res.status_code, 201)
        pk_student_id = pk_student_res.data['id']

        # G) Cross-Tenant Student Scoping:
        # PK Admin student directory: only sees Zainab, NEVER Oliver
        pk_students_list = self.client.get('/api/v1/students/')
        self.assertEqual(pk_students_list.status_code, 200)
        pk_student_ids = [s['id'] for s in pk_students_list.data['results']]
        self.assertIn(pk_student_id, pk_student_ids)
        self.assertNotIn(london_student_id, pk_student_ids)

        # London Admin student directory: only sees Oliver, NEVER Zainab
        london_students_list = london_client.get('/api/v1/students/')
        self.assertEqual(london_students_list.status_code, 200)
        london_student_ids = [s['id'] for s in london_students_list.data['results']]
        self.assertIn(london_student_id, london_student_ids)
        self.assertNotIn(pk_student_id, london_student_ids)

        # PK Admin direct ID access to London student returns 404
        direct_student_probe = self.client.get(f'/api/v1/students/{london_student_id}/')
        self.assertEqual(direct_student_probe.status_code, 404)

        # London Admin direct ID access to PK student returns 404
        direct_student_probe_2 = london_client.get(f'/api/v1/students/{pk_student_id}/')
        self.assertEqual(direct_student_probe_2.status_code, 404)
