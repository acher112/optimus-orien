from datetime import date
from django.test import TestCase
from django.core.cache import cache
from rest_framework.test import APIClient
from core.models import Organisation, School, User, Student
from core.services.cache_service import (
    build_cache_key, get_or_set_dashboard_cache, invalidate_school_cache,
    get_school_cache_version
)

class MultiTenantCachingTests(TestCase):
    """
    Validates safe caching for dashboards and analytics:
    - Never leaks data across schools or organisations.
    - Invalidates atomically on mark publication or school-level updates.
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()

        # Organisation A (School A1)
        self.org_a = Organisation.objects.create(name="Org A", code="org-a", allow_org_admin_student_access=True)
        self.school_a1 = School.objects.create(name="School Alpha", code="SCH-A1", organisation=self.org_a)
        self.admin_a = User.objects.create_user(
            username="admin_a", password="password123",
            role="organisation_admin", organisation=self.org_a, school=self.school_a1
        )
        Student.objects.create(
            school=self.school_a1, admission_number="A1-001",
            first_name="AlphaStudent", last_name="One", father_name="FatherA",
            enrolled_on=date(2026, 8, 1), active=True
        )

        # Organisation B (School B1)
        self.org_b = Organisation.objects.create(name="Org B", code="org-b", allow_org_admin_student_access=True)
        self.school_b1 = School.objects.create(name="School Beta", code="SCH-B1", organisation=self.org_b)
        self.admin_b = User.objects.create_user(
            username="admin_b", password="password123",
            role="organisation_admin", organisation=self.org_b, school=self.school_b1
        )
        Student.objects.create(
            school=self.school_b1, admission_number="B1-001",
            first_name="BetaStudent", last_name="Two", father_name="FatherB",
            enrolled_on=date(2026, 8, 1), active=True
        )

    def test_cache_keys_are_strictly_isolated(self):
        """Cache keys for different schools or orgs must never collide."""
        key_a = build_cache_key(self.org_a.id, self.school_a1.id, "dash", "admin")
        key_b = build_cache_key(self.org_b.id, self.school_b1.id, "dash", "admin")
        self.assertNotEqual(key_a, key_b)
        self.assertIn(f"sch_{self.school_a1.id}", key_a)
        self.assertIn(f"sch_{self.school_b1.id}", key_b)

    def test_dashboard_cache_does_not_leak_between_schools(self):
        """School A's cached response is never returned to School B."""
        self.client.force_authenticate(user=self.admin_a)
        res_a = self.client.get(f'/api/v1/dashboard/?school={self.school_a1.id}')
        self.assertEqual(res_a.status_code, 200)
        data_a = res_a.json()
        self.assertEqual(data_a['counts']['students'], 1)
        self.assertEqual(data_a['recent_students'][0]['first_name'], 'AlphaStudent')

        # Now authenticate as School B admin
        self.client.force_authenticate(user=self.admin_b)
        res_b = self.client.get(f'/api/v1/dashboard/?school={self.school_b1.id}')
        self.assertEqual(res_b.status_code, 200)
        data_b = res_b.json()
        self.assertEqual(data_b['counts']['students'], 1)
        self.assertEqual(data_b['recent_students'][0]['first_name'], 'BetaStudent')

        # Verify School B never received School A's student
        names_in_b = [s['first_name'] for s in data_b['recent_students']]
        self.assertNotIn('AlphaStudent', names_in_b)

    def test_school_invalidation_leaves_other_schools_intact(self):
        """Invalidating School A bumps its generation without affecting School B."""
        v_a_initial = get_school_cache_version(self.school_a1.id)
        v_b_initial = get_school_cache_version(self.school_b1.id)

        # Invalidate School A
        invalidate_school_cache(self.school_a1.id)

        v_a_after = get_school_cache_version(self.school_a1.id)
        v_b_after = get_school_cache_version(self.school_b1.id)

        self.assertGreater(v_a_after, v_a_initial)
        self.assertEqual(v_b_after, v_b_initial)
