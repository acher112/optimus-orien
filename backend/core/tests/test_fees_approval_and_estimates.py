from decimal import Decimal
from datetime import date
from core.models import Student, StudentFee, FeePayment, FinanceEntry, SchoolClass, AcademicYear
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
