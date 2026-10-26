"""Comprehensive tests for Owner/Admin gap features:
Fees, Salaries, Examinations, Platform Owner, Invitations, and CSV Import.
"""
import json
from datetime import date, timedelta
from decimal import Decimal

from core.models import (
    School, SchoolClass, Subject, AcademicYear, Student, Enrollment, StaffMember, User,
    FinanceCategory, FinanceEntry, FeeHead, FeeStructure, Concession, StudentFee, FeePayment,
    SalaryStructure, SalaryRecord, SalaryAdjustment,
    ExamSession, ExamPaper, Grade, ExamMarkCorrection,
    PlatformPlan, SupportAccessGrant, UserInvitation
)
from core.tests.test_phase1 import AccessFixture


class OwnerAdminGapsTests(AccessFixture):
    def setUp(self):
        super().setUp()
        self.sign(self.school_admin)
        # Create staff record with hire date at beginning of year (no mid-month proration)
        r = self.post('staff', {
            'school': self.s1.id,
            'first_name': 'Zahid',
            'last_name': 'Khan',
            'position': 'Senior Science Teacher',
            'role': 'teacher',
            'user': self.teacher.id
        })
        self.assertEqual(r.status_code, 201)
        self.staff_member = StaffMember.objects.get(pk=r.json()['id'])
        self.staff_member.hired_on = date(2026, 1, 1)
        self.staff_member.save(update_fields=['hired_on'])

        # Create income category for tests
        self.income_cat = FinanceCategory.objects.create(
            school=self.s1, kind='income', name='Fee Collections'
        )

    def call(self, user, path, data=None, method='post'):
        self.sign(user)
        url = '/api/v1/' + path + '/'
        if method == 'get':
            return self.client.get(url, data or {})
        if method == 'delete':
            return self.client.delete(url)
        payload = json.dumps(data or {})
        return getattr(self.client, method)(url, data=payload, content_type='application/json')

    # =========================================================================
    # 1. FEES MANAGEMENT TESTS
    # =========================================================================
    def test_fee_heads_and_structures(self):
        # Teacher cannot access fees
        self.assertEqual(self.call(self.teacher, 'fees/heads', method='get').status_code, 403)

        # School admin creates fee head
        res = self.call(self.school_admin, 'fees/heads', {'name': 'Tuition Fee', 'school': self.s1.id})
        self.assertEqual(res.status_code, 201)
        head_id = res.json()['id']

        # Create fee structure
        res = self.call(self.school_admin, 'fees/structures', {
            'head': head_id,
            'school': self.s1.id,
            'academic_year': self.year1.id,
            'amount': '5000.00',
            'frequency': 'monthly',
            'due_day': 10
        })
        self.assertEqual(res.status_code, 201)

        # Generate vouchers for current month
        today_period = date.today().strftime('%Y-%m')
        res = self.call(self.school_admin, 'fees/vouchers/generate', {
            'period': today_period,
            'school': self.s1.id
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(StudentFee.objects.filter(student=self.a, period=today_period).exists())

    def test_fee_payment_creates_linked_finance_entry_and_void_voids_both(self):
        # Setup head & fee line
        head = FeeHead.objects.create(school=self.s1, name='Admission', category=self.income_cat)
        fee_line = StudentFee.objects.create(
            student=self.a, head=head, period='2026-10',
            amount_due=Decimal('10000.00'), due_date=date.today()
        )

        # Collect fee payment
        res = self.call(self.school_admin, 'fees/payments', {
            'student': self.a.id,
            'amount': '10000.00',
            'method': 'bank',
            'reference': 'TXN-998877'
        })
        self.assertEqual(res.status_code, 201)
        payment_id = res.json()['id']
        receipt_no = res.json()['receipt_number']

        payment = FeePayment.objects.get(pk=payment_id)
        self.assertIsNotNone(payment.finance_entry)
        self.assertEqual(payment.finance_entry.kind, 'income')
        self.assertEqual(payment.finance_entry.amount, Decimal('10000.00'))
        self.assertFalse(payment.finance_entry.voided)

        # Student fee line marked paid
        fee_line.refresh_from_db()
        self.assertEqual(fee_line.status, 'paid')

        # Void payment
        res = self.call(self.school_admin, f'fees/payments/{payment_id}/void', {'reason': 'Bank cheque bounced'})
        self.assertEqual(res.status_code, 200)

        payment.refresh_from_db()
        self.assertTrue(payment.voided)
        self.assertTrue(payment.finance_entry.voided)

        # Student fee line reverts to unpaid
        fee_line.refresh_from_db()
        self.assertEqual(fee_line.status, 'unpaid')

    def test_fee_defaulters_endpoint(self):
        head = FeeHead.objects.create(school=self.s1, name='Exam Fee', category=self.income_cat)
        StudentFee.objects.create(
            student=self.a, head=head, period='2026-09',
            amount_due=Decimal('3500.00'), due_date=date.today() - timedelta(days=15),
            status='unpaid'
        )
        res = self.call(self.school_admin, 'fees/defaulters', method='get')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.json()['total_defaulters'], 1)

    # =========================================================================
    # 2. SALARIES TESTS
    # =========================================================================
    def test_salary_structure_and_sheet_generation(self):
        # Define compensation structure
        res = self.call(self.school_admin, 'salaries/structures', {
            'staff': self.staff_member.id,
            'effective_from': '2026-01-01',
            'basic': '60000.00',
            'allowances': [{'name': 'House Rent', 'amount': '15000.00'}, {'name': 'Transport', 'amount': '5000.00'}],
            'fixed_deductions': [{'name': 'Tax Deduction', 'amount': '2500.00'}]
        })
        self.assertEqual(res.status_code, 201)

        # Generate monthly sheet
        month_str = '2026-10'
        res = self.call(self.school_admin, 'salaries/generate', {
            'month': month_str,
            'school': self.s1.id
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['created_records'], 1)

        record = SalaryRecord.objects.get(staff=self.staff_member, month=month_str)
        self.assertEqual(record.status, 'draft')
        # Gross = 60000 + 20000 = 80000
        # Net = 80000 - 2500 = 77500
        self.assertEqual(record.gross, Decimal('80000.00'))
        self.assertEqual(record.net, Decimal('77500.00'))

        # Bulk approve
        res = self.call(self.school_admin, 'salaries/sheet', {'records': [record.id], 'status': 'approved'}, method='patch')
        self.assertEqual(res.status_code, 200)
        record.refresh_from_db()
        self.assertEqual(record.status, 'approved')

        # Pay salary: auto-creates linked FinanceEntry (Expense)
        res = self.call(self.school_admin, f'salaries/sheet/{record.id}/pay', {
            'paid_on': '2026-10-31',
            'method': 'bank',
            'reference': 'SAL-OCT-01'
        })
        self.assertEqual(res.status_code, 200)
        record.refresh_from_db()
        self.assertEqual(record.status, 'paid')
        self.assertIsNotNone(record.finance_entry)
        self.assertEqual(record.finance_entry.kind, 'expense')
        self.assertEqual(record.finance_entry.amount, Decimal('77500.00'))

        # Teacher can view own payslip
        res = self.call(self.teacher, f'salaries/sheet/{record.id}/payslip', method='get')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['net'], '77500.00')

        # Teacher my-payslips endpoint
        res = self.call(self.teacher, 'salaries/my-payslips', method='get')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()['results']), 1)

        # Void salary voids linked FinanceEntry
        res = self.call(self.school_admin, f'salaries/sheet/{record.id}/void', {'reason': 'Payroll adjustment needed'})
        self.assertEqual(res.status_code, 200)
        record.refresh_from_db()
        self.assertEqual(record.status, 'void')
        self.assertTrue(record.finance_entry.voided)

    # =========================================================================
    # 3. EXAMINATIONS TESTS
    # =========================================================================
    def test_exam_sessions_date_sheet_clash_and_marking(self):
        # Create session
        res = self.call(self.school_admin, 'exams/sessions', {
            'name': 'Mid-Term 2026',
            'school': self.s1.id,
            'academic_year': self.year1.id,
            'start_date': '2026-10-15',
            'end_date': '2026-10-25',
            'ranking_enabled': True
        })
        self.assertEqual(res.status_code, 201)
        sess_id = res.json()['id']

        # Schedule paper 1: Math at 09:00 for 120 min
        res = self.call(self.school_admin, 'exams/papers', {
            'session': sess_id,
            'school_class': self.c1.id,
            'subject': self.math.id,
            'date': '2026-10-16',
            'start_time': '09:00',
            'duration_min': 120,
            'max_marks': '100.00',
            'room': 'Hall A'
        })
        self.assertEqual(res.status_code, 201)
        paper_id = res.json()['id']

        # Attempt to schedule clashing paper for same class at 10:00 (overlaps with 09:00 - 11:00)
        subj2 = Subject.objects.create(school=self.s1, name='English', code='ENG')
        res = self.call(self.school_admin, 'exams/papers', {
            'session': sess_id,
            'school_class': self.c1.id,
            'subject': subj2.id,
            'date': '2026-10-16',
            'start_time': '10:00',
            'duration_min': 90,
            'max_marks': '100.00'
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('clash', res.json())

        # Bulk mark entry grid
        res = self.call(self.school_admin, f'exams/papers/{paper_id}/marks', method='get')
        self.assertEqual(res.status_code, 200)

        # Submit mark for student
        res = self.call(self.school_admin, f'exams/papers/{paper_id}/marks', {
            'marks': [{
                'student_id': self.a.id,
                'marks': '85.50',
                'result_status': 'recorded',
                'feedback': 'Great effort'
            }]
        }, method='put')
        self.assertEqual(res.status_code, 200)

        # Moderator publishes exam session
        res = self.call(self.school_admin, f'exams/sessions/{sess_id}/publish')
        self.assertEqual(res.status_code, 200)

        # Results sheet matrix
        res = self.call(self.school_admin, 'exams/results-sheet', {'session': sess_id, 'class': self.c1.id}, method='get')
        self.assertEqual(res.status_code, 200)
        st_row = res.json()['students'][0]
        self.assertEqual(st_row['student_id'], self.a.id)
        self.assertEqual(st_row['grade_letter'], 'A')

        # Student report card
        res = self.call(self.school_admin, 'exams/report-card', {'student': self.a.id, 'session': sess_id}, method='get')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['summary']['overall_letter'], 'A')

        # Audited mark correction
        paper = ExamPaper.objects.get(id=paper_id)
        grade = Grade.objects.get(student=self.a, assessment=paper.assessment)
        res = self.call(self.school_admin, 'exams/corrections', {
            'grade': grade.id,
            'marks': '92.00',
            'result_status': 'recorded',
            'reason': 'Recounting error in section B'
        })
        self.assertEqual(res.status_code, 201)
        self.assertTrue(ExamMarkCorrection.objects.filter(grade=grade).exists())

    # =========================================================================
    # 4. PLATFORM OWNER, INVITATIONS & CSV IMPORT TESTS
    # =========================================================================
    def test_platform_owner_overview_restricted_to_superuser(self):
        # Org admin is forbidden from platform owner console
        self.assertEqual(self.call(self.org_admin, 'platform/overview', method='get').status_code, 403)

        # Superuser can access
        su = User.objects.create_superuser('super_owner', 'owner@platform.org', 'Pass1234!')
        self.assertEqual(self.call(su, 'platform/overview', method='get').status_code, 200)

    def test_invitation_issuance_and_acceptance(self):
        # Admin issues invitation
        res = self.call(self.org_admin, 'invitations', {
            'email': 'newteacher@school.edu',
            'role': 'teacher',
            'school': self.s1.id
        })
        self.assertEqual(res.status_code, 201)
        token = res.json()['token']

        # Accept invitation without authentication (public onboarding)
        self.client.logout()
        res = self.client.post('/api/v1/invitations/accept/', {
            'token': token,
            'username': 'new_teacher_user',
            'password': 'StrongPassword2026!',
            'first_name': 'New',
            'last_name': 'Teacher'
        }, format='json')
        self.assertEqual(res.status_code, 200)

        # Check user created and invitation marked used
        user_created = User.objects.filter(username='new_teacher_user').first()
        self.assertIsNotNone(user_created)
        self.assertEqual(user_created.email, 'newteacher@school.edu')
        self.assertEqual(user_created.role, 'teacher')

        # Token cannot be reused
        res2 = self.client.post('/api/v1/invitations/accept/', {
            'token': token,
            'password': 'StrongPassword2026!'
        }, format='json')
        self.assertEqual(res2.status_code, 400)

    def test_csv_import_dry_run_and_commit(self):
        csv_text = """first_name,last_name,admission_number,roll_number,date_of_birth,gender,class
Haris,Ali,ADM-9901,1,2013-04-10,male,Grade 8A
Maryam,Khan,ADM-9902,2,2013-07-15,female,Grade 8A"""

        # Dry run preview: should validate without creating DB rows
        res = self.call(self.school_admin, 'imports/csv', {
            'entity_type': 'students',
            'csv_data': csv_text,
            'dry_run': True,
            'school': self.s1.id
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['valid_rows_count'], 2)
        self.assertEqual(res.json()['errors_count'], 0)
        self.assertFalse(Student.objects.filter(admission_number='ADM-9901').exists())

        # Commit import
        res = self.call(self.school_admin, 'imports/csv', {
            'entity_type': 'students',
            'csv_data': csv_text,
            'dry_run': False,
            'school': self.s1.id
        })
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['created_count'], 2)
        self.assertTrue(Student.objects.filter(admission_number='ADM-9901').exists())
        self.assertTrue(Student.objects.filter(admission_number='ADM-9902').exists())
