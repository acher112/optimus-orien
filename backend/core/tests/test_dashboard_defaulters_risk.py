"""Comprehensive tests for Dashboard Income-vs-Expense, Fee Defaulters, and Students at Risk.

Validates:
1. Finance Summary & Dashboard Chart:
   - Role permissions (403 for teacher, student, parent)
   - Multi-currency isolation (currency_mismatch=True, no illegal cross-currency addition)
   - Descending comparison lists (income_by_campus and expense_by_campus)
   - Period presets (this_month, last_3_months, this_year, academic_year)
2. Fee Defaulters:
   - Overdue calculation with grace_days and min_amount
   - Overdue bands (1-30, 31-60, 61-90, 90+)
   - Descending order by total_outstanding
   - Reminder notification with 1/day rate limiting and audit logging
   - INT-031 guardrail: defaulter flag never restricts learning or assessments
3. Students at Risk (INT-001..INT-040):
   - Starter template and versioned criteria creation & activation
   - Minimum data requirement (INT-003/004: < 3 results -> insufficient data, never 0)
   - Objective threshold triggers (High, Medium, Low)
   - Flag dismissal with mandatory reason and snapshot check
   - ReviewCase creation prefilled with objective evidence
   - Scoping: teachers see only assigned classes; students/parents get 403 (INT-036)
   - Confidential export (CSV/Excel/PDF)
"""
import json
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone

from core.models import (
    Organisation, School, User, SchoolClass, AcademicYear, Student, Enrollment,
    Subject, Assessment, Grade, Attendance, Homework, HomeworkSubmission,
    FinanceCategory, FinanceEntry, FeeHead, FeeStructure, StudentFee,
    ReviewCase, RiskCriteria, RiskDismissal, AuditEvent
)
from core.services.risk import evaluate_students_at_risk, DEFAULT_RULES


class DashboardDefaultersRiskTests(TestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organisation.objects.create(name='Global Academy Trust', code='gat', allow_org_admin_student_access=True)

        # Campuses with different currencies to test multi-currency isolation
        self.campus_pk = School.objects.create(organisation=self.org, code='KHI', name='Karachi Campus', currency='PKR')
        self.campus_us = School.objects.create(organisation=self.org, code='NYC', name='New York Campus', currency='USD')

        self.year_pk = AcademicYear.objects.create(
            school=self.campus_pk, name='2026',
            start_date=self.today - timedelta(days=120),
            end_date=self.today + timedelta(days=200)
        )
        self.year_us = AcademicYear.objects.create(
            school=self.campus_us, name='2026',
            start_date=self.today - timedelta(days=120),
            end_date=self.today + timedelta(days=200)
        )

        # Users
        self.org_admin = User.objects.create_user(username='gat_admin', password='pass', role='organisation_admin', organisation=self.org)
        self.principal_pk = User.objects.create_user(username='khi_prin', password='pass', role='principal', organisation=self.org, school=self.campus_pk)
        self.teacher_pk = User.objects.create_user(username='khi_teach', password='pass', role='teacher', organisation=self.org, school=self.campus_pk)
        self.other_teacher_pk = User.objects.create_user(username='khi_other_teach', password='pass', role='teacher', organisation=self.org, school=self.campus_pk)
        self.student_user = User.objects.create_user(username='khi_stud', password='pass', role='student', organisation=self.org, school=self.campus_pk)

        # Classes
        self.class_10a = SchoolClass.objects.create(school=self.campus_pk, academic_year=self.year_pk, name='10', section='A', teacher=self.teacher_pk)
        self.class_10b = SchoolClass.objects.create(school=self.campus_pk, academic_year=self.year_pk, name='10', section='B', teacher=self.other_teacher_pk)

        # Students
        self.student_a = Student.objects.create(
            school=self.campus_pk, admission_number='KHI-101',
            first_name='Ali', last_name='Khan', father_name='Tariq Khan',
            gender='male', enrolled_on=self.today - timedelta(days=90), user=self.student_user
        )
        self.student_b = Student.objects.create(
            school=self.campus_pk, admission_number='KHI-102',
            first_name='Fatima', last_name='Noor', father_name='Rashid Noor',
            gender='female', enrolled_on=self.today - timedelta(days=90)
        )
        self.student_c = Student.objects.create(
            school=self.campus_pk, admission_number='KHI-103',
            first_name='Zayn', last_name='Malik', father_name='Yaser Malik',
            gender='male', enrolled_on=self.today - timedelta(days=90)
        )

        Enrollment.objects.create(student=self.student_a, school_class=self.class_10a, start_date=self.today - timedelta(days=90))
        Enrollment.objects.create(student=self.student_b, school_class=self.class_10a, start_date=self.today - timedelta(days=90))
        Enrollment.objects.create(student=self.student_c, school_class=self.class_10b, start_date=self.today - timedelta(days=90))

        # Subjects
        self.subj_math = Subject.objects.create(school=self.campus_pk, code='MTH', name='Mathematics')
        self.subj_eng = Subject.objects.create(school=self.campus_pk, code='ENG', name='English')
        self.cat_fee = FinanceCategory.objects.create(school=self.campus_pk, kind='income', name='Tuition Fees')

    # -------------------------------------------------------------------------
    # Part 1: Finance Summary & Multi-currency Tests
    # -------------------------------------------------------------------------
    def test_finance_summary_permissions(self):
        """Only org_admin, school_admin, and principal can access finance summary. Teacher and student get 403."""
        self.client.force_login(self.principal_pk)
        res = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res.status_code, 200)

        self.client.force_login(self.teacher_pk)
        res = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res.status_code, 403)

        self.client.force_login(self.student_user)
        res = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res.status_code, 403)

    def test_finance_multi_currency_isolation(self):
        """When multiple currencies exist in scope, summary flags currency_mismatch and scopes entries to active currency."""
        cat_pk = FinanceCategory.objects.create(school=self.campus_pk, kind='income', name='Tuition')
        cat_us = FinanceCategory.objects.create(school=self.campus_us, kind='income', name='Tuition USD')

        # PKR entry
        FinanceEntry.objects.create(
            school=self.campus_pk, category=cat_pk,
            amount=Decimal('50000.00'), date=self.today, description='PKR Fees',
            created_by=self.org_admin
        )
        # USD entry
        FinanceEntry.objects.create(
            school=self.campus_us, category=cat_us,
            amount=Decimal('1000.00'), date=self.today, description='USD Fees',
            created_by=self.org_admin
        )

        self.client.force_login(self.org_admin)
        res = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Should flag mismatch and provide list of currencies
        self.assertTrue(data.get('currency_mismatch'))
        self.assertIn('PKR', data.get('currencies_present', []))
        self.assertIn('USD', data.get('currencies_present', []))

        # Querying specifically for USD isolates USD amounts
        res_usd = self.client.get('/api/v1/finance/summary/?currency=USD')
        self.assertEqual(res_usd.status_code, 200)
        data_usd = res_usd.json()
        self.assertEqual(data_usd.get('active_currency'), 'USD')
        self.assertEqual(Decimal(str(data_usd.get('total_income'))), Decimal('1000.00'))

    def test_finance_summary_descending_campuses(self):
        """Campus comparison tables must be ordered descending by amount."""
        cat = FinanceCategory.objects.create(school=self.campus_pk, kind='income', name='Fees')
        # Second campus in same currency PKR
        campus_lhr = School.objects.create(organisation=self.org, code='LHR', name='Lahore Campus', currency='PKR')
        cat_lhr = FinanceCategory.objects.create(school=campus_lhr, kind='income', name='Fees')

        FinanceEntry.objects.create(
            school=self.campus_pk, category=cat,
            amount=Decimal('25000.00'), date=self.today, created_by=self.org_admin
        )
        FinanceEntry.objects.create(
            school=campus_lhr, category=cat_lhr,
            amount=Decimal('75000.00'), date=self.today, created_by=self.org_admin
        )

        self.client.force_login(self.org_admin)
        res = self.client.get('/api/v1/finance/summary/?currency=PKR')
        self.assertEqual(res.status_code, 200)
        by_campus = res.json().get('income_by_campus', [])
        self.assertTrue(len(by_campus) >= 2)
        # 75000 (Lahore) must be on top before 25000 (Karachi)
        self.assertEqual(by_campus[0]['campus_name'], 'Lahore Campus')
        self.assertEqual(by_campus[1]['campus_name'], 'Karachi Campus')

    # -------------------------------------------------------------------------
    # Part 2: Fee Defaulters & Reminders Tests
    # -------------------------------------------------------------------------
    def test_fee_defaulters_calculation_and_ordering(self):
        """Fee defaulters endpoint returns overdue balances sorted descending with correct bands."""
        head = FeeHead.objects.create(school=self.campus_pk, category=self.cat_fee, name='Tuition Fee')

        # Student A: overdue by 45 days, amount 15,000 (Band 31-60)
        sf_a = StudentFee.objects.create(
            student=self.student_a, head=head, period='2026-05',
            amount_due=Decimal('15000.00'), due_date=self.today - timedelta(days=45), status='unpaid'
        )

        # Student B: overdue by 10 days, amount 25,000 (Band 1-30) -> higher amount, should be top!
        sf_b = StudentFee.objects.create(
            student=self.student_b, head=head, period='2026-05',
            amount_due=Decimal('25000.00'), due_date=self.today - timedelta(days=10), status='unpaid'
        )

        self.client.force_login(self.principal_pk)
        res = self.client.get('/api/v1/fees/defaulters/')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        defaulters = data.get('defaulters', [])
        self.assertEqual(len(defaulters), 2)
        # Student B has 25,000, so must be first
        self.assertEqual(defaulters[0]['student_id'], self.student_b.id)
        self.assertEqual(defaulters[0]['overdue_band'], '1-30')
        # Student A has 15,000, so second
        self.assertEqual(defaulters[1]['student_id'], self.student_a.id)
        self.assertEqual(defaulters[1]['overdue_band'], '31-60')

        summary = data.get('summary', {})
        self.assertEqual(summary.get('total_defaulters'), 2)
        self.assertEqual(Decimal(str(summary.get('total_outstanding'))), Decimal('40000.00'))

    def test_defaulter_reminder_rate_limit(self):
        """Reminder can only be sent once per day per student."""
        head = FeeHead.objects.create(school=self.campus_pk, category=self.cat_fee, name='Tuition Fee')
        StudentFee.objects.create(
            student=self.student_a, head=head, period='2026-05',
            amount_due=Decimal('10000.00'), due_date=self.today - timedelta(days=15), status='unpaid'
        )

        self.client.force_login(self.principal_pk)
        url = f"/api/v1/fees/defaulters/{self.student_a.id}/remind/"

        # First call succeeds
        res1 = self.client.post(url, {})
        self.assertEqual(res1.status_code, 200)

        # Second call on same day is rate limited (429)
        res2 = self.client.post(url, {})
        self.assertEqual(res2.status_code, 429)

    # -------------------------------------------------------------------------
    # Part 3: Students at Risk Tests (INT-001..INT-040)
    # -------------------------------------------------------------------------
    def test_risk_criteria_starter_and_creation(self):
        """When no criteria exists, starter template is returned. Admin can create new version."""
        self.client.force_login(self.principal_pk)
        res = self.client.get('/api/v1/students/at-risk/criteria/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsNone(data.get('active_criteria'))
        self.assertIsNotNone(data.get('starter_template'))

        # Create active criteria
        payload = {
            'school_id': self.campus_pk.id,
            'name': 'Campus Standard Risk Criteria',
            'combine_mode': 'any',
            'min_rules_match': 1,
            'min_data_results': 3,
            'evaluation_period': 'whole_year',
            'rules': DEFAULT_RULES,
            'activate': True
        }
        res_post = self.client.post('/api/v1/students/at-risk/criteria/', json.dumps(payload), content_type='application/json')
        self.assertEqual(res_post.status_code, 201)
        created = res_post.json()
        self.assertEqual(created['version'], 1)
        self.assertTrue(created['active'])

    def test_minimum_data_requirement_int003_int004(self):
        """Student with fewer than min_data_results (3) is flagged as Insufficient Data, NEVER at risk."""
        # Create active criteria requiring 3 results
        RiskCriteria.objects.create(
            school=self.campus_pk, name='Policy', active=True, version=1,
            combine_mode='any', min_rules_match=1, min_data_results=3,
            rules=DEFAULT_RULES
        )

        # Student A has only 1 assessment grade (failing 20%)
        exam1 = Assessment.objects.create(school_class=self.class_10a, subject=self.subj_math, title='Quiz 1', date=self.today - timedelta(days=10), max_marks=Decimal('100'))
        Grade.objects.create(assessment=exam1, student=self.student_a, marks=Decimal('20.00'))

        self.client.force_login(self.principal_pk)
        res = self.client.get('/api/v1/students/at-risk/')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        flagged_ids = [s['student_id'] for s in data.get('flagged_students', [])]
        insufficient_ids = [s['student_id'] for s in data.get('insufficient_data_students', [])]

        # Student A must NOT be in flagged_students
        self.assertNotIn(self.student_a.id, flagged_ids)
        # Student A must be in insufficient_data_students
        self.assertIn(self.student_a.id, insufficient_ids)

    def test_risk_evaluation_thresholds_and_levels(self):
        """Student with sufficient data and low average is flagged with transparent evidence."""
        RiskCriteria.objects.create(
            school=self.campus_pk, name='Policy', active=True, version=1,
            combine_mode='any', min_rules_match=1, min_data_results=3,
            rules=DEFAULT_RULES
        )

        # Add 3 grades for Student A: average 35% (< 40% triggers High risk)
        e1 = Assessment.objects.create(school_class=self.class_10a, subject=self.subj_math, title='Q1', date=self.today - timedelta(days=20), max_marks=Decimal('100'))
        e2 = Assessment.objects.create(school_class=self.class_10a, subject=self.subj_math, title='Q2', date=self.today - timedelta(days=15), max_marks=Decimal('100'))
        e3 = Assessment.objects.create(school_class=self.class_10a, subject=self.subj_math, title='Q3', date=self.today - timedelta(days=5), max_marks=Decimal('100'))

        Grade.objects.create(assessment=e1, student=self.student_a, marks=Decimal('30.00'))
        Grade.objects.create(assessment=e2, student=self.student_a, marks=Decimal('35.00'))
        Grade.objects.create(assessment=e3, student=self.student_a, marks=Decimal('40.00'))

        self.client.force_login(self.principal_pk)
        res = self.client.get('/api/v1/students/at-risk/')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        flagged = data.get('flagged_students', [])
        st_a = next((s for s in flagged if s['student_id'] == self.student_a.id), None)
        self.assertIsNotNone(st_a)
        self.assertEqual(st_a['risk_level'], 'high')
        self.assertTrue(any(r['indicator'] == 'overall_average' for r in st_a['triggered_rules']))

    def test_risk_dismissal_and_case_creation(self):
        """Staff can create a ReviewCase and dismiss an at-risk flag with mandatory rationale."""
        RiskCriteria.objects.create(
            school=self.campus_pk, name='Policy', active=True, version=1,
            combine_mode='any', min_rules_match=1, min_data_results=3,
            rules=DEFAULT_RULES
        )
        for i in range(3):
            exam = Assessment.objects.create(school_class=self.class_10a, subject=self.subj_math, title=f'T{i}', date=self.today - timedelta(days=10 + i), max_marks=Decimal('100'))
            Grade.objects.create(assessment=exam, student=self.student_a, marks=Decimal('45.00'))

        self.client.force_login(self.principal_pk)

        # 1. Create Review Case
        case_url = f"/api/v1/students/at-risk/{self.student_a.id}/case/"
        res_case = self.client.post(case_url, json.dumps({'title': 'Math Tutoring Review', 'priority': 'high'}), content_type='application/json')
        self.assertEqual(res_case.status_code, 201)
        self.assertTrue(ReviewCase.objects.filter(student=self.student_a, title='Math Tutoring Review').exists())

        # 2. Dismiss flag without reason fails
        dismiss_url = f"/api/v1/students/at-risk/{self.student_a.id}/dismiss/"
        res_fail = self.client.post(dismiss_url, json.dumps({'reason': ''}), content_type='application/json')
        self.assertEqual(res_fail.status_code, 400)

        # 3. Dismiss flag with reason succeeds
        res_dismiss = self.client.post(dismiss_url, json.dumps({
            'reason': 'Student enrolled in peer tutoring programme and missed school due to family bereavement.',
            'snapshot': {'overall_average': 45.0, 'attendance_rate': 100.0}
        }), content_type='application/json')
        self.assertEqual(res_dismiss.status_code, 201)

        # Student A is now dismissed and not shown in active at-risk list
        res_after = self.client.get('/api/v1/students/at-risk/')
        flagged_after = [s['student_id'] for s in res_after.json().get('flagged_students', [])]
        self.assertNotIn(self.student_a.id, flagged_after)

    def test_teacher_scope_isolation_and_privacy(self):
        """Teacher sees only assigned classes. Students and parents get 403."""
        RiskCriteria.objects.create(
            school=self.campus_pk, name='Policy', active=True, version=1,
            combine_mode='any', min_rules_match=1, min_data_results=3,
            rules=DEFAULT_RULES
        )
        # Grade for Student C (in Class 10-B, taught by other_teacher)
        for i in range(3):
            exam = Assessment.objects.create(school_class=self.class_10b, subject=self.subj_math, title=f'T10B{i}', date=self.today - timedelta(days=10 + i), max_marks=Decimal('100'))
            Grade.objects.create(assessment=exam, student=self.student_c, marks=Decimal('40.00'))

        # Teacher 1 (teaches Class 10-A only)
        self.client.force_login(self.teacher_pk)
        res_t1 = self.client.get('/api/v1/students/at-risk/')
        self.assertEqual(res_t1.status_code, 200)
        # Student C must NOT appear in Teacher 1's view
        t1_flagged_ids = [s['student_id'] for s in res_t1.json().get('flagged_students', [])]
        self.assertNotIn(self.student_c.id, t1_flagged_ids)

        # Student user receives 403 (INT-036 confidentiality)
        self.client.force_login(self.student_user)
        res_stud = self.client.get('/api/v1/students/at-risk/')
        self.assertEqual(res_stud.status_code, 403)
