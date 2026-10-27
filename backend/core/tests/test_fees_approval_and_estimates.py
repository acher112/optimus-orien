from decimal import Decimal
from datetime import date
from core.models import Student, StudentFee, FeePayment, FinanceEntry, SchoolClass, AcademicYear, StaffMember, SalaryRecord, FinanceCategory
from core.tests.test_phase1 import AccessFixture


class FeesApprovalAndEstimatesTests(AccessFixture):
    def setUp(self):
        super().setUp()
        self.sign(self.school_admin)
        self.ay = AcademicYear.objects.create(school=self.s1, name='2026-2027', start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        self.sc = SchoolClass.objects.create(school=self.s1, name='Grade 10-A', academic_year=self.ay)

    def call(self, user, path, data=None, method='post'):
        self.sign(user)
        url = '/api/v1/' + path + '/'
        if method == 'get':
            return self.client.get(url, data or {})
        return self.client.post(url, data or {}, content_type='application/json')

    def test_multi_fee_challan_generation(self):
        # 1. Create a student
        st_res = self.call(self.school_admin, 'students', {
            'school': self.s1.id,
            'first_name': 'Ali',
            'last_name': 'Raza',
            'father_name': 'Raza Ali',
            'admission_number': 'ALI-001',
            'enrolled_on': '2026-10-01'
        })
        self.assertEqual(st_res.status_code, 201)
        st_id = st_res.json()['id']

        # 2. Generate initial student challan with monthly, admission, annual, and extra charges
        res = self.call(self.school_admin, 'fees/student-voucher', {
            'student': st_id,
            'monthly_fee': 4500,
            'admission_fee': 8000,
            'annual_fee': 2000,
            'extra_charges': 500,
            'extra_charges_reason': 'Lab Uniform',
            'school_class': self.sc.id
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['vouchers_count'], 4)
        self.assertEqual(data['total_challan_amount'], '15000.00')

        # Verify NO FinanceEntry (Income) was created yet
        student = Student.objects.get(pk=st_id)
        self.assertEqual(FinanceEntry.objects.filter(school=self.s1, category__kind='income').count(), 0)

        # Verify all 4 voucher lines exist and are unpaid
        vouchers = StudentFee.objects.filter(student=student)
        self.assertEqual(vouchers.count(), 4)
        for v in vouchers:
            self.assertEqual(v.status, 'unpaid')

    def test_payment_pending_and_admin_approval_workflow(self):
        # Create student and challan
        st = Student.objects.create(school=self.s1, first_name='Sara', last_name='Khan', admission_number='SAR-002', enrolled_on=date.today())
        res = self.call(self.school_admin, 'fees/student-voucher', {
            'student': st.id,
            'monthly_fee': 5000,
            'admission_fee': 3000
        })
        self.assertEqual(res.status_code, 201)

        # Student / cashier submits payment (default is pending)
        pay_res = self.call(self.school_admin, 'fees/payments', {
            'student': st.id,
            'amount': 8000,
            'method': 'bank',
            'reference': 'CHALLAN-DEP-1234'
        })
        self.assertEqual(pay_res.status_code, 201)
        pay_id = pay_res.json()['id']
        self.assertEqual(pay_res.json()['status'], 'pending')

        # Ensure NO FinanceEntry created while pending
        payment = FeePayment.objects.get(pk=pay_id)
        self.assertIsNone(payment.finance_entry)
        self.assertEqual(FinanceEntry.objects.filter(school=self.s1).count(), 0)

        # Check fees summary shows pending_approval
        sum_res = self.call(self.school_admin, 'fees/summary', method='get')
        self.assertEqual(sum_res.status_code, 200)
        sdata = sum_res.json()
        active_count = Student.objects.filter(school=self.s1, active=True).count()
        self.assertEqual(sdata['total_students'], active_count)
        self.assertEqual(float(sdata['pending_approval']), 8000.0)
        self.assertEqual(float(sdata['collected']), 0.0)

        # Admin approves the payment
        app_res = self.call(self.school_admin, f'fees/payments/{pay_id}/approve')
        self.assertEqual(app_res.status_code, 200)
        self.assertEqual(app_res.json()['status'], 'approved')

        # Now FinanceEntry MUST exist
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'approved')
        self.assertIsNotNone(payment.finance_entry)
        self.assertEqual(payment.finance_entry.amount, Decimal('8000.00'))
        self.assertEqual(payment.finance_entry.category.kind, 'income')

        # Vouchers should now be paid
        for v in StudentFee.objects.filter(student=st):
            self.assertEqual(v.status, 'paid')

        # Fees summary reflects collected income
        sum_res2 = self.call(self.school_admin, 'fees/summary', method='get')
        sdata2 = sum_res2.json()
        self.assertEqual(float(sdata2['collected']), 8000.0)
        self.assertEqual(float(sdata2['pending_approval']), 0.0)
        self.assertEqual(float(sdata2['outstanding']), 0.0)

        # Finance summary reflects student projection
        fin_res = self.call(self.school_admin, 'finance/summary', method='get')
        self.assertEqual(fin_res.status_code, 200)
        fdata = fin_res.json()
        self.assertIn('student_projection', fdata)
        self.assertEqual(fdata['student_projection']['total_students'], active_count)
        self.assertEqual(fdata['student_projection']['collected'], 8000.0)

    def test_dynamic_custom_charges_and_due_date(self):
        st = Student.objects.create(school=self.s1, first_name='Zayn', last_name='Malik', admission_number='ZAYN-001', enrolled_on=date.today())
        custom_date = '2026-11-20'
        res = self.call(self.school_admin, 'fees/student-voucher', {
            'student': st.id,
            'monthly_fee': 6000,
            'admission_fee': 4000,
            'due_date': custom_date,
            'custom_charges': [
                {'name': 'Science Lab Equipment', 'amount': 1200},
                {'name': 'Sports Uniform', 'amount': 800}
            ]
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data['vouchers_count'], 4)
        self.assertEqual(data['total_challan_amount'], '12000.00')

        vouchers = StudentFee.objects.filter(student=st)
        self.assertEqual(vouchers.count(), 4)
        for v in vouchers:
            self.assertEqual(str(v.due_date), custom_date)
            self.assertEqual(v.status, 'unpaid')

    def test_salary_lifecycle_and_role_categories(self):
        # 1. Add teacher staff member with pending salary
        res_t = self.call(self.school_admin, 'staff', {
            'school': self.s1.id,
            'first_name': 'Ahmad',
            'last_name': 'Teacher',
            'position': 'Senior Science Teacher',
            'role': 'teacher',
            'salary': 75000,
            'salary_status': 'pending',
            'salary_due_date': '2026-11-05'
        })
        self.assertEqual(res_t.status_code, 201)
        t_id = res_t.json()['id']
        staff_t = StaffMember.objects.get(pk=t_id)

        # Check salary record was created with pending status and due_date, but NO FinanceEntry
        sal_rec = SalaryRecord.objects.filter(staff=staff_t).first()
        self.assertIsNotNone(sal_rec)
        self.assertEqual(sal_rec.status, 'pending')
        self.assertEqual(str(sal_rec.due_date), '2026-11-05')
        self.assertIsNone(sal_rec.finance_entry)

        # 2. Update status to paid via status endpoint
        status_res = self.call(self.school_admin, f'salaries/sheet/{sal_rec.id}/status', {
            'status': 'paid',
            'method': 'bank',
            'paid_on': '2026-11-05'
        })
        self.assertEqual(status_res.status_code, 200)
        sal_rec.refresh_from_db()
        self.assertEqual(sal_rec.status, 'paid')
        self.assertIsNotNone(sal_rec.finance_entry)
        self.assertEqual(sal_rec.finance_entry.amount, Decimal('75000.00'))
        self.assertEqual(sal_rec.finance_entry.category.name, 'Teacher Salary')

        # 3. Cancel salary status -> removes / clears finance entry
        cancel_res = self.call(self.school_admin, f'salaries/sheet/{sal_rec.id}/status', {
            'status': 'cancelled'
        })
        self.assertEqual(cancel_res.status_code, 200)
        sal_rec.refresh_from_db()
        self.assertEqual(sal_rec.status, 'cancelled')
        self.assertIsNone(sal_rec.finance_entry)

    def test_multicampus_finance_summary(self):
        # Create income in s1 and s2
        cat1 = FinanceCategory.objects.create(school=self.s1, kind='income', name='Campus 1 Income', active=True)
        cat2 = FinanceCategory.objects.create(school=self.s2, kind='income', name='Campus 2 Income', active=True)
        FinanceEntry.objects.create(school=self.s1, category=cat1, amount=Decimal('5000.00'), date=date.today(), created_by=self.org_admin)
        FinanceEntry.objects.create(school=self.s2, category=cat2, amount=Decimal('3000.00'), date=date.today(), created_by=self.org_admin)

        # Org admin calls summary for s1
        res_s1 = self.call(self.org_admin, 'finance/summary', {'school': str(self.s1.id)}, method='get')
        self.assertEqual(res_s1.status_code, 200)
        self.assertEqual(float(res_s1.json()['total_income']), 5000.0)

        # Org admin calls summary for all campuses combined
        res_all = self.call(self.org_admin, 'finance/summary', {'school': 'all'}, method='get')
        self.assertEqual(res_all.status_code, 200)
        self.assertEqual(float(res_all.json()['total_income']), 8000.0)

