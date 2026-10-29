"""Test Suite for Campus Isolation (Exams first), Admission Fee 0, and Mandatory Class on Admission."""
from datetime import date
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Subject, Student,
    Enrollment, ExamConfiguration, ExamComponent, ExamComponentSubjectConfig,
    ExamStudentMark, CalculatedSubjectResult, CalculatedStudentResult,
    FeeHead, StudentFee, FeePayment, FinanceCategory, FinanceEntry
)


class CampusIsolationAndAdmissionTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(
            name='Orion Network', code='orion-net', allow_org_admin_student_access=True
        )
        self.school_a = School.objects.create(organisation=self.org, name='North Campus', code='NORTH')
        self.school_b = School.objects.create(organisation=self.org, name='South Campus', code='SOUTH')

        # Academic Years
        self.year_a = AcademicYear.objects.create(
            school=self.school_a, name='2026-2027', start_date=date(2026, 4, 1), end_date=date(2027, 3, 31), active=True
        )
        self.year_b = AcademicYear.objects.create(
            school=self.school_b, name='2026-2027', start_date=date(2026, 4, 1), end_date=date(2027, 3, 31), active=True
        )

        # Classes in both campuses with the same name "Class 10"
        self.class_a = SchoolClass.objects.create(
            school=self.school_a, academic_year=self.year_a, name='Class 10', section='A'
        )
        self.class_b = SchoolClass.objects.create(
            school=self.school_b, academic_year=self.year_b, name='Class 10', section='B'
        )

        # Subjects
        self.math_a = Subject.objects.create(school=self.school_a, name='Mathematics', code='MTH-N')
        self.math_b = Subject.objects.create(school=self.school_b, name='Mathematics', code='MTH-S')

        # Users
        self.admin_user = User.objects.create_user(
            username='admin_user', email='admin@orion.com', password='password123',
            role='organisation_admin', organisation=self.org
        )
        self.principal_a = User.objects.create_user(
            username='principal_a', email='pa@orion.com', password='password123',
            role='principal', organisation=self.org, school=self.school_a
        )
        self.principal_b = User.objects.create_user(
            username='principal_b', email='pb@orion.com', password='password123',
            role='principal', organisation=self.org, school=self.school_b
        )

        # Exam configurations
        self.config_a = ExamConfiguration.objects.create(
            school=self.school_a, academic_year=self.year_a, name='Annual Examination 2026',
            reporting_scale=Decimal('100.00'), status='published'
        )
        self.config_b = ExamConfiguration.objects.create(
            school=self.school_b, academic_year=self.year_b, name='Annual Examination 2026',
            reporting_scale=Decimal('100.00'), status='published'
        )

        # Clients
        self.client_admin = APIClient()
        self.client_admin.force_authenticate(user=self.admin_user)

        self.client_pa = APIClient()
        self.client_pa.force_authenticate(user=self.principal_a)

    def test_admin_campus_filtering_and_404_on_invalid(self):
        """Admin can filter to campus A, campus B, or All, and receives 404 for invalid campus ID."""
        # Query campus A
        res_a = self.client_admin.get(f'/api/v1/exams/engine/configurations/?school={self.school_a.id}')
        self.assertEqual(res_a.status_code, 200)
        ids_a = [c['id'] for c in res_a.json()['results']]
        self.assertIn(self.config_a.id, ids_a)
        self.assertNotIn(self.config_b.id, ids_a)

        # Query campus B
        res_b = self.client_admin.get(f'/api/v1/exams/engine/configurations/?school={self.school_b.id}')
        self.assertEqual(res_b.status_code, 200)
        ids_b = [c['id'] for c in res_b.json()['results']]
        self.assertIn(self.config_b.id, ids_b)
        self.assertNotIn(self.config_a.id, ids_b)

        # Query all campuses
        res_all = self.client_admin.get('/api/v1/exams/engine/configurations/?school=all')
        self.assertEqual(res_all.status_code, 200)
        ids_all = [c['id'] for c in res_all.json()['results']]
        self.assertIn(self.config_a.id, ids_all)
        self.assertIn(self.config_b.id, ids_all)

        # Query invalid / out-of-scope campus -> 404
        res_404 = self.client_admin.get('/api/v1/exams/engine/configurations/?school=999999')
        self.assertEqual(res_404.status_code, 404)

    def test_principal_campus_isolation_and_404(self):
        """Principal cannot access another campus or 'all' campuses, returning 404."""
        # Unfiltered request strictly returns only their campus
        res = self.client_pa.get('/api/v1/exams/engine/configurations/')
        self.assertEqual(res.status_code, 200)
        ids = [c['id'] for c in res.json()['results']]
        self.assertIn(self.config_a.id, ids)
        self.assertNotIn(self.config_b.id, ids)

        # Query own campus ID is valid
        res_own = self.client_pa.get(f'/api/v1/exams/engine/configurations/?school={self.school_a.id}')
        self.assertEqual(res_own.status_code, 200)

        # Query other campus ID returns 404
        res_other = self.client_pa.get(f'/api/v1/exams/engine/configurations/?school={self.school_b.id}')
        self.assertEqual(res_other.status_code, 404)

        # Requesting 'all' returns 404 for principal
        res_all = self.client_pa.get('/api/v1/exams/engine/configurations/?school=all')
        self.assertEqual(res_all.status_code, 404)

        # Accessing detail of other campus config returns 404
        res_detail = self.client_pa.get(f'/api/v1/exams/engine/configurations/{self.config_b.id}/')
        self.assertEqual(res_detail.status_code, 404)

        # Accessing classes of other campus returns 404
        res_classes = self.client_pa.get(f'/api/v1/classes/?school={self.school_b.id}')
        self.assertEqual(res_classes.status_code, 404)

    def test_exam_analytics_overall_mode_produces_separate_class_rows(self):
        """Two campuses with 'Class 10' produce two distinct rows with campus names in Overall mode."""
        # Enrol students in both campuses
        st_a = Student.objects.create(
            school=self.school_a, admission_number='ADM-A-1', first_name='Alice', last_name='A',
            father_name='Mr A', gender='female', enrolled_on=date(2026, 4, 1)
        )
        Enrollment.objects.create(student=st_a, school_class=self.class_a, start_date=date(2026, 4, 1))
        CalculatedStudentResult.objects.create(
            student=st_a, configuration=self.config_a, school_class=self.class_a, academic_year=self.year_a,
            overall_percentage=Decimal('85.00'), completed=True, passed=True
        )

        st_b = Student.objects.create(
            school=self.school_b, admission_number='ADM-B-1', first_name='Bob', last_name='B',
            father_name='Mr B', gender='male', enrolled_on=date(2026, 4, 1)
        )
        Enrollment.objects.create(student=st_b, school_class=self.class_b, start_date=date(2026, 4, 1))
        CalculatedStudentResult.objects.create(
            student=st_b, configuration=self.config_b, school_class=self.class_b, academic_year=self.year_b,
            overall_percentage=Decimal('75.00'), completed=True, passed=True
        )

        # Admin requests Overall analytics
        res = self.client_admin.get('/api/v1/exams/engine/analytics/?school=all')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        class_rows = data['class_performance']
        self.assertEqual(len(class_rows), 2)
        # Class names must include campus qualification
        class_names = [c['class_name'] for c in class_rows]
        self.assertTrue(any('North Campus' in name for name in class_names))
        self.assertTrue(any('South Campus' in name for name in class_names))

        # Check campus_performance per-campus breakdown
        campus_rows = data.get('campus_performance', [])
        self.assertEqual(len(campus_rows), 2)
        # Sorted descending by average: North Campus (85) > South Campus (75)
        self.assertEqual(campus_rows[0]['campus_name'], 'North Campus')
        self.assertEqual(campus_rows[0]['average'], 85.0)
        self.assertEqual(campus_rows[1]['campus_name'], 'South Campus')
        self.assertEqual(campus_rows[1]['average'], 75.0)

    def test_admission_fee_accepts_zero_and_rejects_negative_or_empty(self):
        """Admission fee accepts 0, '0', '0.00', creates waived fee line, no payment/finance entry."""
        st = Student.objects.create(
            school=self.school_a, admission_number='ADM-TEST-0', first_name='Test', last_name='Zero',
            father_name='Father Zero', gender='male', enrolled_on=date(2026, 4, 1)
        )

        # 1. Accepts 0
        res_zero = self.client_admin.post('/api/v1/fees/student-voucher/', {
            'student': st.id,
            'monthly_fee': '5000.00',
            'admission_fee': 0
        }, format='json')
        self.assertEqual(res_zero.status_code, 201)

        # Check fee line created with waived status
        head_adm = FeeHead.objects.filter(school=self.school_a, name='Admission Fee').first()
        self.assertIsNotNone(head_adm)
        fee_adm = StudentFee.objects.filter(student=st, head=head_adm).first()
        self.assertIsNotNone(fee_adm)
        self.assertEqual(fee_adm.amount_due, Decimal('0.00'))
        self.assertEqual(fee_adm.status, 'waived')

        # No FeePayment or FinanceEntry created
        self.assertEqual(FeePayment.objects.filter(student=st).count(), 0)
        self.assertEqual(FinanceEntry.objects.filter(school=self.school_a).count(), 0)

        # Defaulters list does NOT include student
        res_def = self.client_admin.get(f'/api/v1/fees/defaulters/?school={self.school_a.id}')
        self.assertEqual(res_def.status_code, 200)
        def_ids = [d['student_id'] for d in res_def.json().get('results', [])]
        self.assertNotIn(st.id, def_ids)

        # 2. Rejects empty string
        res_empty = self.client_admin.post('/api/v1/fees/student-voucher/', {
            'student': st.id,
            'monthly_fee': '5000.00',
            'admission_fee': ''
        }, format='json')
        self.assertEqual(res_empty.status_code, 400)
        self.assertIn('Enter the admission fee (0 if there is none)', str(res_empty.json()))

        # 3. Rejects negative
        res_neg = self.client_admin.post('/api/v1/fees/student-voucher/', {
            'student': st.id,
            'monthly_fee': '5000.00',
            'admission_fee': '-500.00'
        }, format='json')
        self.assertEqual(res_neg.status_code, 400)
        self.assertIn('Fee cannot be negative', str(res_neg.json()))

    def test_admission_requires_class_and_creates_enrollment_atomically(self):
        """Creating student requires school_class; student and enrollment created together."""
        # Missing class -> 400
        res_no_class = self.client_admin.post('/api/v1/students/', {
            'school': self.school_a.id,
            'first_name': 'NoClass',
            'last_name': 'Student',
            'father_name': 'Father Name',
            'admission_number': 'ST-NOCLASS',
            'gender': 'male',
            'enrolled_on': '2026-04-01'
        }, format='json')
        self.assertEqual(res_no_class.status_code, 400)
        self.assertIn('school_class', res_no_class.json())

        # Class from another campus -> 400
        res_cross_class = self.client_admin.post('/api/v1/students/', {
            'school': self.school_a.id,
            'school_class': self.class_b.id,  # class_b belongs to school_b!
            'first_name': 'Cross',
            'last_name': 'Student',
            'father_name': 'Father Name',
            'admission_number': 'ST-CROSS',
            'gender': 'male',
            'enrolled_on': '2026-04-01'
        }, format='json')
        self.assertEqual(res_cross_class.status_code, 400)

        # Valid class -> creates student and enrollment
        res_valid = self.client_admin.post('/api/v1/students/', {
            'school': self.school_a.id,
            'school_class': self.class_a.id,
            'first_name': 'Valid',
            'last_name': 'Student',
            'father_name': 'Father Name',
            'admission_number': 'ST-VALID-1',
            'gender': 'female',
            'enrolled_on': '2026-04-01'
        }, format='json')
        self.assertEqual(res_valid.status_code, 201)
        st_data = res_valid.json()
        new_st_id = st_data['id']

        # Verify enrollment was created
        en = Enrollment.objects.filter(student_id=new_st_id, school_class=self.class_a).first()
        self.assertIsNotNone(en)
        self.assertEqual(en.school_class_id, self.class_a.id)
        self.assertEqual(st_data['school_class_id'], self.class_a.id)
        self.assertIn('Class 10', st_data['class_name'])
