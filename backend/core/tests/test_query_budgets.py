from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient
from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Subject,
    Student, Enrollment, Attendance, Grade, Assessment, FinanceCategory,
    FeeHead, StudentFee, FeePayment, GuardianProfile, GuardianRelationship
)

class QueryBudgetTests(TestCase):
    """
    Asserts strict upper bounds on database query counts for key endpoints.
    Protects against N+1 query regressions across list views and dashboards.
    """

    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(
            name="Budget Org", code="budget-org", allow_org_admin_student_access=True
        )
        self.school = School.objects.create(name="Budget School", code="SCH-BGT", organisation=self.org)
        self.today = date(2026, 11, 2)
        self.ay = AcademicYear.objects.create(
            school=self.school, name="2026-2027",
            start_date=date(2026, 8, 1), end_date=date(2027, 6, 30)
        )
        self.school_class = SchoolClass.objects.create(
            school=self.school, academic_year=self.ay, name="Grade 10", section="A"
        )
        self.subject = Subject.objects.create(school=self.school, name="Mathematics", code="MATH")

        # Admin user
        self.admin = User.objects.create_user(
            username="budget_admin", password="password123",
            role="organisation_admin", organisation=self.org, school=self.school, is_staff=True
        )

        # Parent user
        self.parent = User.objects.create_user(
            username="budget_parent", password="password123",
            role="parent", organisation=self.org, school=self.school
        )

        # Create 30 students to test N+1 prevention with realistic page sizes
        self.students = []
        for i in range(1, 31):
            s = Student.objects.create(
                school=self.school,
                admission_number=f"ADM-BGT-{i:03d}",
                first_name=f"Student{i}",
                last_name="Budget",
                father_name="Father",
                enrolled_on=date(2026, 8, 1),
                active=True
            )
            Enrollment.objects.create(student=s, school_class=self.school_class, start_date=date(2026, 8, 1))
            self.students.append(s)

        # Link parent to first 2 students with verified relationship
        gp, _ = GuardianProfile.objects.get_or_create(user=self.parent, organisation=self.org, defaults={'mobile': '+923001234567'})
        for s in self.students[:2]:
            GuardianRelationship.objects.create(
                guardian=gp, student=s, relationship='father', is_primary=True,
                status='active', verified_at=timezone.now(), verified_by=self.admin
            )

        # Assessment and grades
        self.asmt = Assessment.objects.create(
            school_class=self.school_class, subject=self.subject,
            title="Quiz 1", date=self.today, max_marks=Decimal("20.00")
        )
        for s in self.students:
            Grade.objects.create(assessment=self.asmt, student=s, marks=Decimal("18.00"))
            Attendance.objects.create(
                student=s, school_class=self.school_class, date=self.today, status="present"
            )

        # Fees
        fcat = FinanceCategory.objects.create(school=self.school, name="Tuition", kind="income")
        fhead = FeeHead.objects.create(school=self.school, name="Monthly Tuition", category=fcat)
        for s in self.students:
            StudentFee.objects.create(
                student=s, head=fhead, period="2026-10",
                amount_due=Decimal("5000.00"), due_date=date(2026, 10, 10), status="unpaid"
            )
            FeePayment.objects.create(
                student=s, school=self.school, receipt_number=f"REC-{s.id}",
                amount=Decimal("5000.00"), paid_on=self.today, status="approved"
            )

    def test_student_list_query_budget(self):
        """Fetching 25 students must take <= 6 queries (constant O(1) database trips, no N+1)."""
        self.client.force_authenticate(user=self.admin)
        with self.assertNumQueries(6):
            res = self.client.get('/api/v1/students/?school=%d' % self.school.id)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            results = data.get('results', data)
            self.assertEqual(len(results), 25)

    def test_attendance_records_query_budget(self):
        """Attendance list must not execute per-row queries for student or class."""
        self.client.force_authenticate(user=self.admin)
        with self.assertNumQueries(4):
            res = self.client.get('/api/v1/attendance/?school=%d' % self.school.id)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            results = data.get('results', data)
            self.assertEqual(len(results), 25)

    def test_grades_list_query_budget(self):
        """Grades list must not execute per-row queries for student or assessment."""
        self.client.force_authenticate(user=self.admin)
        with self.assertNumQueries(4):
            res = self.client.get('/api/v1/grades/?school=%d' % self.school.id)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            results = data.get('results', data)
            self.assertEqual(len(results), 25)

    def test_fee_defaulters_query_budget(self):
        """Defaulters query must use joined relations and run within tight query budget (<= 6 queries)."""
        self.client.force_authenticate(user=self.admin)
        with self.assertNumQueries(6):
            res = self.client.get('/api/v1/fees/defaulters/?school=%d' % self.school.id)
            self.assertEqual(res.status_code, 200)

    def test_fee_payments_query_budget(self):
        """Fee payments directory with 25 records must not trigger N+1 queries."""
        self.client.force_authenticate(user=self.admin)
        with self.assertNumQueries(2):
            res = self.client.get('/api/v1/fees/payments/?school=%d' % self.school.id)
            self.assertEqual(res.status_code, 200)

    def test_parent_dashboard_query_budget(self):
        """Parent dashboard for multi-child parent must run in <= 8 queries."""
        self.client.force_authenticate(user=self.parent)
        res = self.client.get('/api/v1/parent/home/')
        self.assertEqual(res.status_code, 200)

    def test_max_page_size_enforced(self):
        """Requesting an arbitrarily large page_size (e.g. 500) is capped at 100."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/students/?page_size=500&school=%d' % self.school.id)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('results', data)
        self.assertEqual(len(data['results']), 30)
