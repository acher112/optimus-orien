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
    PlatformPlan, SupportAccessGrant, UserInvitation, Announcement
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

    # =========================================================================
    # 7. NEW OWNER/ADMIN CAPABILITY TESTS
    # =========================================================================
    def test_announcements_crud_and_scoping(self):
        # 1. School Admin broadcasts announcement for all
        res = self.call(self.school_admin, 'announcements', {
            'school': self.s1.id,
            'title': 'School Closed on Friday',
            'content': 'Campus will remain closed for maintenance.',
            'target_role': 'all',
            'priority': 'urgent',
            'pinned': True
        })
        self.assertEqual(res.status_code, 201)
        ann_id = res.json()['id']
        self.assertEqual(res.json()['priority'], 'urgent')

        # 2. Teacher can read the broadcast
        t_res = self.call(self.teacher, 'announcements', method='get')
        self.assertEqual(t_res.status_code, 200)
        self.assertTrue(any(a['id'] == ann_id for a in t_res.json()['results']))

        # 3. Create teacher-only announcement
        res2 = self.call(self.school_admin, 'announcements', {
            'school': self.s1.id,
            'title': 'Staff Meeting at 3pm',
            'content': 'Agenda: upcoming midterm exams.',
            'target_role': 'teachers',
            'priority': 'important'
        })
        self.assertEqual(res2.status_code, 201)
        ann_staff_id = res2.json()['id']

        # Teacher sees it
        t_res2 = self.call(self.teacher, 'announcements', method='get')
        self.assertTrue(any(a['id'] == ann_staff_id for a in t_res2.json()['results']))

        # Update announcement
        up_res = self.call(self.school_admin, f'announcements/{ann_id}', {'title': 'Updated Title', 'pinned': False}, method='patch')
        self.assertEqual(up_res.status_code, 200)
        self.assertEqual(up_res.json()['title'], 'Updated Title')
        self.assertFalse(up_res.json()['pinned'])

        # Delete announcement returns 200 with JSON payload
        del_res = self.call(self.school_admin, f'announcements/{ann_id}', method='delete')
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json().get('success'))
        self.assertFalse(Announcement.objects.filter(pk=ann_id).exists())

    def test_staff_creation_with_salary_and_linked_expense(self):
        # Create staff with salary
        res = self.call(self.school_admin, 'staff', {
            'school': self.s1.id,
            'first_name': 'Rashid',
            'last_name': 'Mehmood',
            'position': 'Head Librarian',
            'role': 'librarian',
            'salary': '42000.00',
            'record_expense': True
        })
        self.assertEqual(res.status_code, 201)
        staff_id = res.json()['id']

        # Verify SalaryStructure created
        struct = SalaryStructure.objects.filter(staff_id=staff_id).first()
        self.assertIsNotNone(struct)
        self.assertEqual(struct.basic, Decimal('42000.00'))

        # Verify SalaryRecord created
        record = SalaryRecord.objects.filter(staff_id=staff_id).first()
        self.assertIsNotNone(record)
        self.assertEqual(record.status, 'paid')
        self.assertEqual(record.net, Decimal('42000.00'))

        # Verify FinanceEntry (expense) created
        entry = FinanceEntry.objects.filter(
            school=self.s1,
            kind='expense',
            amount=Decimal('42000.00')
        ).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.category.name, 'Staff salaries')

    def test_mandatory_student_gender_and_fee_income(self):
        # 1. Attempt to create student without gender -> 400
        res = self.call(self.school_admin, 'students', {
            'school': self.s1.id,
            'first_name': 'Fatima',
            'last_name': 'Noor',
            'admission_number': 'FAT-1001',
            'gender': '',
            'enrolled_on': str(self.today)
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('gender', res.json())

        # 2. Create student with valid gender -> 201
        res = self.call(self.school_admin, 'students', {
            'school': self.s1.id,
            'first_name': 'Fatima',
            'last_name': 'Noor',
            'admission_number': 'FAT-1001',
            'gender': 'female',
            'enrolled_on': str(self.today)
        })
        self.assertEqual(res.status_code, 201)
        student_id = res.json()['id']
        self.assertEqual(res.json()['gender'], 'female')

        # 3. Pay fee for student without pre-existing voucher: auto-creates voucher and linked finance income
        pay_res = self.call(self.school_admin, 'fees/payments', {
            'student': student_id,
            'amount': '15000.00',
            'method': 'cash',
            'reference': 'ADM-INITIAL-FEES'
        })
        self.assertEqual(pay_res.status_code, 201)
        receipt_num = pay_res.json()['receipt_number']

        # Verify FinanceEntry (income) created
        income_entry = FinanceEntry.objects.filter(
            school=self.s1,
            kind='income',
            amount=Decimal('15000.00')
        ).first()
        self.assertIsNotNone(income_entry)
        self.assertIn(receipt_num, income_entry.reference)

    def test_delete_endpoints_return_json(self):
        # 1. ScopedViewSet (e.g. classes)
        cls = SchoolClass.objects.create(school=self.s1, academic_year=self.year1, name='Test Class Delete')
        del_cls = self.call(self.school_admin, f'classes/{cls.id}', method='delete')
        self.assertEqual(del_cls.status_code, 200)
        self.assertTrue(del_cls.json().get('success'))

        # 2. Fee structure
        head = FeeHead.objects.create(school=self.s1, name='Sports Fee', category=self.income_cat)
        fs = FeeStructure.objects.create(school=self.s1, academic_year=self.year1, head=head, amount=Decimal('500.00'))
        del_fs = self.call(self.school_admin, f'fees/structures/{fs.id}', method='delete')
        self.assertEqual(del_fs.status_code, 200)
        self.assertTrue(del_fs.json().get('success'))

        # 3. Concession
        conc = Concession.objects.create(
            student=self.a, head=head, discount_type='percent',
            discount_value=Decimal('10.00'), reason='Sports', approved_by=self.school_admin, valid_from=date.today()
        )
        del_conc = self.call(self.school_admin, f'fees/concessions/{conc.id}', method='delete')
        self.assertEqual(del_conc.status_code, 200)
        self.assertTrue(del_conc.json().get('success'))

        # 4. Exam Session & Paper
        sess = ExamSession.objects.create(
            school=self.s1, academic_year=self.year1, name='Pre-Board 2026',
            start_date=date.today(), end_date=date.today() + timedelta(days=5)
        )
        sub = Subject.objects.create(school=self.s1, name='Physics', code='PHY-9')
        paper = ExamPaper.objects.create(
            session=sess, school_class=self.c1, subject=sub,
            date=date.today(), start_time='09:00:00', max_marks=Decimal('75.00')
        )
        del_paper = self.call(self.school_admin, f'exams/papers/{paper.id}', method='delete')
        self.assertEqual(del_paper.status_code, 200)
        self.assertTrue(del_paper.json().get('success'))

        del_sess = self.call(self.school_admin, f'exams/sessions/{sess.id}', method='delete')
        self.assertEqual(del_sess.status_code, 200)
        self.assertTrue(del_sess.json().get('success'))
