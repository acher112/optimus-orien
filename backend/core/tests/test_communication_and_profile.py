from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient
from core.models import (
    AcademicYear,
    ClassSubjectTeacher,
    Enrollment,
    FinanceCategory,
    FinanceEntry,
    Notification,
    Organisation,
    School,
    SchoolClass,
    Student,
    Subject,
    SubjectMessage,
    User,
    ConnectionRequest,
    Connection,
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

    def test_cross_campus_and_cross_org_student_connection_and_notifications(self):
        """
        Verify sending connection requests across campuses & other registered accounts
        resolves the student's actual user (never colliding Student.id vs User.id),
        dispatches Notification objects to both recipient and requester, and updates statuses.
        """
        # Another campus in same org + another registered institution with its own student
        other_campus = School.objects.create(organisation=self.org, name='South Campus', code='SOUTH')
        other_org = Organisation.objects.create(name='Bright Future Academy', code='bright-future')
        other_org_school = School.objects.create(organisation=other_org, name='Islamabad Flagship', code='ISB-1')

        # Unlinked seed student whose Student.id will collide with a low User.id (like self.admin.id)
        unlinked_student = Student.objects.create(
            school=other_campus, admission_number='UNLINKED-1', first_name='NoAccount', last_name='Learner',
            enrolled_on='2026-09-01', user=None
        )

        other_student_user = User.objects.create_user(
            username='isb_student_1', password='Password123!', role='student',
            organisation=other_org, school=other_org_school, first_name='Zara', last_name='Tariq'
        )
        other_student = Student.objects.create(
            school=other_org_school, admission_number='ISB-ADM-9', first_name='Zara', last_name='Tariq',
            enrolled_on='2026-09-01', user=other_student_user
        )

        # 1. Admin searches directory for Zara Tariq
        self.client.force_authenticate(user=self.admin)
        dir_res = self.client.get('/api/v1/communication/community/directory/?category=students&search=Zara+Tariq')
        self.assertEqual(dir_res.status_code, 200)
        results = dir_res.data['results']
        self.assertEqual(len(results), 1)
        item = results[0]
        self.assertEqual(item['user_id'], other_student_user.id)
        self.assertTrue(item['has_account'])
        self.assertEqual(item['status'], 'not_connected')

        # 2. Unlinked student shows status 'no_account' and rejects connect with 400 (never hits unrelated User.id!)
        dir_unlinked = self.client.get('/api/v1/communication/community/directory/?category=students&search=NoAccount')
        self.assertEqual(dir_unlinked.status_code, 200)
        self.assertEqual(dir_unlinked.data['results'][0]['status'], 'no_account')
        bad_conn = self.client.post('/api/v1/communication/community/connections/', {
            'action': 'connect',
            'target_id': unlinked_student.id,
            'target_type': 'student',
            'target_user_id': None,
        }, format='json')
        self.assertEqual(bad_conn.status_code, 400)
        self.assertFalse(ConnectionRequest.objects.filter(from_user=self.admin).exists())

        # 3. Admin sends connection request to other registered account's student
        conn_res = self.client.post('/api/v1/communication/community/connections/', {
            'action': 'connect',
            'target_id': other_student.id,
            'target_user_id': other_student_user.id,
            'target_type': 'student',
        }, format='json')
        self.assertEqual(conn_res.status_code, 200)
        req_id = conn_res.data['request_id']
        self.assertTrue(ConnectionRequest.objects.filter(id=req_id, from_user=self.admin, to_user=other_student_user, status='pending').exists())

        # Directory now shows 'sent_request'
        dir_after = self.client.get('/api/v1/communication/community/directory/?category=students&search=Zara')
        self.assertEqual(dir_after.data['results'][0]['status'], 'sent_request')

        # 4. Verify Notification created for recipient student AND visible in /api/v1/notifications/
        self.client.force_authenticate(user=other_student_user)
        notif_res = self.client.get('/api/v1/notifications/')
        self.assertEqual(notif_res.status_code, 200)
        notif_titles = [n['title'] for n in notif_res.data['results']]
        self.assertTrue(any('Connection Request' in t for t in notif_titles))

        # Recipient sees incoming request & accepts it
        inbox_res = self.client.get('/api/v1/communication/community/connections/')
        self.assertEqual(inbox_res.data['received_count'], 1)
        self.assertEqual(inbox_res.data['received'][0]['request_id'], req_id)

        accept_res = self.client.post('/api/v1/communication/community/connections/', {
            'action': 'accept',
            'target_id': req_id,
            'request_id': req_id,
        }, format='json')
        self.assertEqual(accept_res.status_code, 200)

        # Mutual Connection is active & Admin got acceptance notification
        u_a, u_b = min(self.admin.id, other_student_user.id), max(self.admin.id, other_student_user.id)
        self.assertTrue(Connection.objects.filter(user_a_id=u_a, user_b_id=u_b, status='active').exists())
        self.assertTrue(Notification.objects.filter(user=self.admin, title__icontains='Connection Accepted').exists())
