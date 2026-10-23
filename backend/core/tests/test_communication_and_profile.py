from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from core.models import (
    AcademicYear,
    ClassSubjectTeacher,
    Enrollment,
    FinanceCategory,
    FinanceEntry,
    Organisation,
    School,
    SchoolClass,
    Student,
    Subject,
    SubjectMessage,
    User,
)


class CommunicationAndProfileTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name='Test Org', code='test-org')
        self.school = School.objects.create(organisation=self.org, name='Main Campus', code='MAIN')

        # Admin
        self.admin = User.objects.create_user(
            username='admin_user', password='Password123!', role='organisation_admin',
            organisation=self.org, school=self.school, is_staff=True
        )

        # Teachers
        self.math_teacher = User.objects.create_user(
            username='math_teacher', password='Password123!', role='teacher',
            organisation=self.org, school=self.school, first_name='John', last_name='Euler'
        )
        self.english_teacher = User.objects.create_user(
            username='eng_teacher', password='Password123!', role='teacher',
            organisation=self.org, school=self.school, first_name='Jane', last_name='Austen'
        )

        # Year, Class, Subjects
        self.year = AcademicYear.objects.create(
            school=self.school, name='2026-2027', start_date='2026-09-01', end_date='2027-06-30'
        )
        self.klass = SchoolClass.objects.create(
            school=self.school, academic_year=self.year, name='Grade 10-A', teacher=self.math_teacher
        )
        self.math_subject = Subject.objects.create(school=self.school, name='Mathematics', code='MAT')
        self.eng_subject = Subject.objects.create(school=self.school, name='English', code='ENG')

        # Assign teachers to subjects
        ClassSubjectTeacher.objects.create(
            school_class=self.klass, subject=self.math_subject, teacher=self.math_teacher
        )
        ClassSubjectTeacher.objects.create(
            school_class=self.klass, subject=self.eng_subject, teacher=self.english_teacher
        )

        # Student
        self.student_user = User.objects.create_user(
            username='pupil_one', password='Password123!', role='student',
            organisation=self.org, school=self.school, first_name='Alice', last_name='Smith'
        )
        self.student = Student.objects.create(
            school=self.school, admission_number='ADM-001', first_name='Alice', last_name='Smith',
            enrolled_on='2026-09-01', user=self.student_user
        )
        Enrollment.objects.create(
            student=self.student, school_class=self.klass, start_date='2026-09-01'
        )

    def test_profile_update_and_password_change(self):
        self.client.force_authenticate(user=self.admin)

        # Update name and avatar_color
        res = self.client.patch('/api/v1/auth/me/', {
            'first_name': 'Super',
            'last_name': 'Administrator',
            'email': 'superadmin@example.com',
            'avatar_color': '#10b981'
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['first_name'], 'Super')
        self.assertEqual(res.data['avatar_color'], '#10b981')

        # Test wrong current password
        bad_pw = self.client.patch('/api/v1/auth/me/', {
            'current_password': 'WrongPassword!',
            'password': 'NewPassword123!'
        }, format='json')
        self.assertEqual(bad_pw.status_code, 400)

        # Test valid password change
        good_pw = self.client.patch('/api/v1/auth/me/', {
            'current_password': 'Password123!',
            'password': 'NewPassword123!'
        }, format='json')
        self.assertEqual(good_pw.status_code, 200)

        # Verify new password works
        self.client.logout()
        login_res = self.client.post('/api/v1/auth/login/', {
            'username': 'admin_user',
            'password': 'NewPassword123!'
        }, format='json')
        self.assertEqual(login_res.status_code, 200)

    def test_student_communication_channels(self):
        self.client.force_authenticate(user=self.student_user)
        res = self.client.get('/api/v1/communication/channels/')
        self.assertEqual(res.status_code, 200)
        classes = res.data['classes']
        self.assertEqual(len(classes), 1)
        self.assertEqual(classes[0]['name'], 'Grade 10-A')
        # Student should see all subjects in their class
        subj_codes = [s['code'] for s in classes[0]['subjects']]
        self.assertIn('MAT', subj_codes)
        self.assertIn('ENG', subj_codes)

        # Student posts a message in Math
        msg_res = self.client.post('/api/v1/communication/messages/', {
            'school_class': self.klass.id,
            'subject': self.math_subject.id,
            'message': 'Can you clarify question 5 on the worksheet?'
        }, format='json')
        self.assertEqual(msg_res.status_code, 201)
        self.assertFalse(msg_res.data['is_teacher_answer'])
        self.assertEqual(msg_res.data['sender_role'], 'student')

    def test_teacher_subject_restriction(self):
        # Math teacher logs in
        self.client.force_authenticate(user=self.math_teacher)
        res = self.client.get('/api/v1/communication/channels/')
        self.assertEqual(res.status_code, 200)
        classes = res.data['classes']
        self.assertEqual(len(classes), 1)
        # Math teacher only sees Math, NOT English
        subj_codes = [s['code'] for s in classes[0]['subjects']]
        self.assertIn('MAT', subj_codes)
        self.assertNotIn('ENG', subj_codes)

        # Math teacher CANNOT post to English subject discussion
        forbidden_res = self.client.post('/api/v1/communication/messages/', {
            'school_class': self.klass.id,
            'subject': self.eng_subject.id,
            'message': 'Trying to post in English'
        }, format='json')
        self.assertEqual(forbidden_res.status_code, 403)

        # Math teacher CAN post in Mathematics
        ok_res = self.client.post('/api/v1/communication/messages/', {
            'school_class': self.klass.id,
            'subject': self.math_subject.id,
            'message': 'Remember to show your working for full credit.'
        }, format='json')
        self.assertEqual(ok_res.status_code, 201)
        self.assertTrue(ok_res.data['is_teacher_answer'])

    def test_finance_summary_all_categories(self):
        # Create categories: Rent, Salaries, Utilities
        cat_sal = FinanceCategory.objects.create(school=self.school, kind='expense', name='Salaries')
        cat_rent = FinanceCategory.objects.create(school=self.school, kind='expense', name='Rent')
        cat_util = FinanceCategory.objects.create(school=self.school, kind='expense', name='Utilities')

        # Add expense for Salaries and Rent
        FinanceEntry.objects.create(
            school=self.school, category=cat_sal, amount=Decimal('50000.00'),
            date='2026-10-01', description='Staff payroll', created_by=self.admin
        )
        FinanceEntry.objects.create(
            school=self.school, category=cat_rent, amount=Decimal('20000.00'),
            date='2026-10-01', description='Building lease', created_by=self.admin
        )

        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res.status_code, 200)
        exp_cats = [c['name'] for c in res.data['expense_by_category']]
        self.assertIn('Salaries', exp_cats)
        self.assertIn('Rent', exp_cats)
        self.assertEqual(res.data['total_expense'], 70000.0)
