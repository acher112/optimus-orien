from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from core.models import (
    Organisation, School, SchoolClass, Subject, ClassSubject,
    AcademicYear, Student, Enrollment, User, StaffMember,
    ClassTeacherAssignment, TeachingAssignment, Attendance,
    DiscussionThread, DiscussionPost, DiscussionMute, Notification
)


class StudentPortalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()

        # Organisation & Campuses
        self.org = Organisation.objects.create(name='Global Academy Trust')
        self.school1 = School.objects.create(
            organisation=self.org, name='North Campus', code='NC',
            discussion_enabled=True, students_can_see_grade_level_average=False
        )
        self.school2 = School.objects.create(
            organisation=self.org, name='South Campus', code='SC',
            discussion_enabled=True
        )

        self.ay1 = AcademicYear.objects.create(
            school=self.school1, name='2026-2027',
            start_date=self.today - timedelta(days=60),
            end_date=self.today + timedelta(days=200),
            active=True
        )

        self.class1 = SchoolClass.objects.create(
            school=self.school1, academic_year=self.ay1, name='Grade 8', section='A'
        )
        self.class2 = SchoolClass.objects.create(
            school=self.school1, academic_year=self.ay1, name='Grade 8', section='B'
        )

        self.math = Subject.objects.create(school=self.school1, name='Mathematics', code='MATH')
        self.science = Subject.objects.create(school=self.school1, name='Science', code='SCI')

        ClassSubject.objects.create(school_class=self.class1, subject=self.math, required=True)
        ClassSubject.objects.create(school_class=self.class1, subject=self.science, required=True)

        # Users
        self.admin_user = User.objects.create_superuser(
            username='admin_boss', password='AdminPassword123!', email='admin@test.com',
            role='organisation_admin', organisation=self.org
        )

        self.principal_user = User.objects.create_user(
            username='principal_nc', password='PrincipalPassword123!', email='principal@test.com',
            role='principal', organisation=self.org, school=self.school1
        )

        # Class teacher for Class 1
        self.teacher_user = User.objects.create_user(
            username='class_teacher_nc', password='TeacherPassword123!', email='teacher@test.com',
            role='teacher', organisation=self.org, school=self.school1
        )
        self.teacher_staff = StaffMember.objects.create(
            user=self.teacher_user, school=self.school1, first_name='John', last_name='Doe',
            role='teacher', teacher_type='class_teacher', hired_on=self.today - timedelta(days=365)
        )
        ClassTeacherAssignment.objects.create(
            teacher=self.teacher_user, school_class=self.class1,
            start_date=self.today - timedelta(days=60)
        )

        # Subject teacher for Science in Class 1
        self.sub_teacher_user = User.objects.create_user(
            username='subject_teacher_nc', password='TeacherPassword123!', email='subteacher@test.com',
            role='teacher', organisation=self.org, school=self.school1
        )
        self.sub_teacher_staff = StaffMember.objects.create(
            user=self.sub_teacher_user, school=self.school1, first_name='Jane', last_name='Smith',
            role='teacher', teacher_type='subject_teacher', hired_on=self.today - timedelta(days=365)
        )
        TeachingAssignment.objects.create(
            school=self.school1, teacher=self.sub_teacher_user,
            school_class=self.class1, subject=self.science,
            start_date=self.today - timedelta(days=60)
        )

    def test_student_admission_mandatory_class_and_credentials_receipt(self):
        """Part 1: Mandatory class, auto-credentials receipt, no teacher create."""
        # 1. Teachers cannot admit students
        self.client.force_authenticate(user=self.teacher_user)
        res = self.client.post('/api/v1/students/', {
            'first_name': 'Ali', 'last_name': 'Khan', 'father_name': 'Ahmed Khan',
            'admission_number': '2026-001', 'gender': 'male', 'school_class': self.class1.id,
            'enrolled_on': str(self.today)
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Mandatory class check
        self.client.force_authenticate(user=self.principal_user)
        res = self.client.post('/api/v1/students/', {
            'first_name': 'Ali', 'last_name': 'Khan', 'father_name': 'Ahmed Khan',
            'admission_number': '2026-001', 'gender': 'male',
            'enrolled_on': str(self.today)
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('school_class', res.data)

        # 3. Successful admission by Principal
        res = self.client.post('/api/v1/students/', {
            'first_name': 'Ali', 'last_name': 'Khan', 'father_name': 'Ahmed Khan',
            'admission_number': '2026-001', 'gender': 'male', 'school_class': self.class1.id,
            'enrolled_on': str(self.today)
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('receipt', res.data)

        receipt = res.data['receipt']
        self.assertEqual(receipt['school_name'], 'North Campus')
        self.assertEqual(receipt['class_teacher_name'], 'John Doe')
        self.assertTrue(receipt['username'].startswith('NC-2026-001'))
        self.assertTrue(len(receipt['temporary_password']) >= 10)

        # Verify linked User exists and requires password change
        student = Student.objects.get(id=res.data['id'])
        self.assertIsNotNone(student.user)
        self.assertEqual(student.user.role, 'student')
        self.assertTrue(student.user.must_change_password)
        self.assertTrue(student.user.check_password(receipt['temporary_password']))

    def test_password_reset_permissions_and_receipt(self):
        """Part 2: Staff password reset restrictions and receipt issuance."""
        # Create a student with user
        self.client.force_authenticate(user=self.principal_user)
        res = self.client.post('/api/v1/students/', {
            'first_name': 'Sara', 'last_name': 'Ahmed', 'father_name': 'Tariq Ahmed',
            'admission_number': '2026-002', 'gender': 'female', 'school_class': self.class1.id,
            'enrolled_on': str(self.today)
        })
        student_id = res.data['id']
        old_pwd = res.data['receipt']['temporary_password']

        # Subject teacher tries to reset -> 403
        self.client.force_authenticate(user=self.sub_teacher_user)
        res = self.client.post(f'/api/v1/students/{student_id}/reset-password/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Class teacher of Class 1 resets -> Success
        self.client.force_authenticate(user=self.teacher_user)
        res = self.client.post(f'/api/v1/students/{student_id}/reset-password/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('receipt', res.data)
        new_pwd = res.data['receipt']['temporary_password']
        self.assertNotEqual(old_pwd, new_pwd)

        # Check user can authenticate with new password and must_change_password is true
        student = Student.objects.get(id=student_id)
        self.assertTrue(student.user.check_password(new_pwd))
        self.assertTrue(student.user.must_change_password)

    def test_first_password_change(self):
        """Part 2: First password change clears must_change_password."""
        self.client.force_authenticate(user=self.principal_user)
        res = self.client.post('/api/v1/students/', {
            'first_name': 'Bilal', 'last_name': 'Nasir', 'father_name': 'Nasir Khan',
            'admission_number': '2026-003', 'gender': 'male', 'school_class': self.class1.id,
            'enrolled_on': str(self.today)
        })
        student = Student.objects.get(id=res.data['id'])
        temp_pwd = res.data['receipt']['temporary_password']

        # Student signs in and changes password
        self.client.force_authenticate(user=student.user)
        self.assertTrue(student.user.must_change_password)

        change_res = self.client.post('/api/v1/auth/password/', {
            'current_password': temp_pwd,
            'new_password': 'MySecretPassword2026!'
        })
        self.assertEqual(change_res.status_code, status.HTTP_200_OK)

        student.user.refresh_from_db()
        self.assertFalse(student.user.must_change_password)
        self.assertTrue(student.user.check_password('MySecretPassword2026!'))

    def test_student_attendance_view_and_isolation(self):
        """Part 4: Attendance calculations, numerator/denominator formula, and role isolation."""
        self.client.force_authenticate(user=self.principal_user)
        s1_res = self.client.post('/api/v1/students/', {
            'first_name': 'Student', 'last_name': 'One', 'father_name': 'Father One',
            'admission_number': '2026-004', 'gender': 'male', 'school_class': self.class1.id,
            'enrolled_on': str(self.today)
        })
        s2_res = self.client.post('/api/v1/students/', {
            'first_name': 'Student', 'last_name': 'Two', 'father_name': 'Father Two',
            'admission_number': '2026-005', 'gender': 'female', 'school_class': self.class1.id,
            'enrolled_on': str(self.today)
        })

        s1 = Student.objects.get(id=s1_res.data['id'])
        s2 = Student.objects.get(id=s2_res.data['id'])

        # Record attendance: 8 days present, 1 late, 1 absent (Total 10 days) -> rate = 90%
        for i in range(8):
            Attendance.objects.create(
                student=s1, school_class=self.class1, date=self.today - timedelta(days=10 - i), status='present'
            )
        Attendance.objects.create(
            student=s1, school_class=self.class1, date=self.today - timedelta(days=2), status='late'
        )
        Attendance.objects.create(
            student=s1, school_class=self.class1, date=self.today - timedelta(days=1), status='absent'
        )

        # Authenticate as student 1
        self.client.force_authenticate(user=s1.user)

        # Can view own attendance
        res = self.client.get('/api/v1/student/attendance/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        summary = res.data['summary']
        self.assertEqual(summary['present_count'], 8)
        self.assertEqual(summary['late_count'], 1)
        self.assertEqual(summary['absent_count'], 1)
        self.assertEqual(summary['attended_days'], 9)
        self.assertEqual(summary['held_days'], 10)
        self.assertEqual(summary['rate'], 90.0)
        self.assertEqual(summary['status']['level'], 'on_track')

        # Cannot query other student's attendance -> 404
        other_res = self.client.get(f'/api/v1/student/attendance/?student_id={s2.id}')
        self.assertEqual(other_res.status_code, status.HTTP_404_NOT_FOUND)

    def test_inform_parent_risk(self):
        """Part 6: Inform parent risk notification and guardian fallback."""
        self.client.force_authenticate(user=self.principal_user)
        s_res = self.client.post('/api/v1/students/', {
            'first_name': 'AtRisk', 'last_name': 'Learner', 'father_name': 'Father Learner',
            'admission_number': '2026-006', 'gender': 'male', 'school_class': self.class1.id,
            'enrolled_on': str(self.today), 'guardian_phone': '+923001234567'
        })
        student = Student.objects.get(id=s_res.data['id'])

        # Class teacher triggers inform parent when no linked guardian exists
        self.client.force_authenticate(user=self.teacher_user)
        res = self.client.post(f'/api/v1/students/{student.id}/inform-parent/', {
            'category': 'attendance', 'reason': 'Attendance below 80%'
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['has_linked_guardian'])
        self.assertEqual(res.data['guardian_phone'], '+923001234567')

        # Link a parent user
        parent_user = User.objects.create_user(
            username='parent_guardian', password='ParentPassword123!', email='parent@test.com',
            role='parent', organisation=self.org
        )
        student.guardians.add(parent_user)

        # Inform parent with linked guardian
        res2 = self.client.post(f'/api/v1/students/{student.id}/inform-parent/', {
            'category': 'academic', 'reason': 'Scoring below 60% in Mathematics'
        })
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data['has_linked_guardian'])
        self.assertTrue(Notification.objects.filter(user=parent_user).exists())

    def test_class_discussion_safety_and_moderation(self):
        """Part 7: Discussion scoping, safety filters (profanity/regex), and moderation."""
        self.client.force_authenticate(user=self.principal_user)
        s_res = self.client.post('/api/v1/students/', {
            'first_name': 'Sophia', 'last_name': 'Akhtar', 'father_name': 'Akhtar Ali',
            'admission_number': '2026-007', 'gender': 'female', 'school_class': self.class1.id,
            'enrolled_on': str(self.today)
        })
        student = Student.objects.get(id=s_res.data['id'])

        self.client.force_authenticate(user=student.user)

        # 1. Blocked words check
        res_profane = self.client.post('/api/v1/discussion/threads/', {
            'class_id': self.class1.id, 'subject_id': self.math.id,
            'title': 'Stupid homework question', 'body': 'This is idiocy.'
        })
        self.assertEqual(res_profane.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Phone / Email / Link check
        res_contact = self.client.post('/api/v1/discussion/threads/', {
            'class_id': self.class1.id, 'subject_id': self.math.id,
            'title': 'Call me for homework answers', 'body': 'Message me on +92 300 1234567 or visit https://cheat.com'
        })
        self.assertEqual(res_contact.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Clean thread creation
        res_clean = self.client.post('/api/v1/discussion/threads/', {
            'class_id': self.class1.id, 'subject_id': self.math.id,
            'title': 'Clarification on Quadratic Equations',
            'body': 'Could someone explain step 2 of completing the square?'
        })
        self.assertEqual(res_clean.status_code, status.HTTP_201_CREATED)
        thread_id = res_clean.data['id']

        # 4. View thread detail (student display name privacy)
        detail_res = self.client.get(f'/api/v1/discussion/threads/{thread_id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_res.data['author']['name'], 'Sophia A.')

        # 5. Teacher replies and student accepts answer
        self.client.force_authenticate(user=self.teacher_user)
        reply_res = self.client.post(f'/api/v1/discussion/threads/{thread_id}/reply/', {
            'body': 'Remember to add and subtract (b/2)^2 inside the bracket.'
        })
        self.assertEqual(reply_res.status_code, status.HTTP_201_CREATED)
        post_id = reply_res.data['id']

        self.client.force_authenticate(user=student.user)
        accept_res = self.client.post(f'/api/v1/discussion/threads/{thread_id}/accept/', {
            'post_id': post_id
        })
        self.assertEqual(accept_res.status_code, status.HTTP_200_OK)
        thread = DiscussionThread.objects.get(id=thread_id)
        self.assertEqual(thread.status, 'answered')
        self.assertEqual(thread.accepted_post_id, post_id)
