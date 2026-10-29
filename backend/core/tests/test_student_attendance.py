from datetime import date, timedelta
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Student,
    Enrollment, Attendance, RoleAssignment
)


class StudentAttendanceRegisterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = date.today()
        self.yesterday = self.today - timedelta(days=1)

        self.org = Organisation.objects.create(name='Global Academy')
        self.school_a = School.objects.create(
            organisation=self.org, name='Campus Islamabad', code='ISB-01', currency='PKR'
        )
        self.school_b = School.objects.create(
            organisation=self.org, name='Campus Lahore', code='LHR-01', currency='PKR'
        )

        self.year = AcademicYear.objects.create(
            school=self.school_a, name='2026-2027',
            start_date=self.today - timedelta(days=60),
            end_date=self.today + timedelta(days=300)
        )

        # Teachers
        self.teacher_a = User.objects.create_user(
            username='teacher_a', email='teacher_a@ga.edu', password='TestPassword123!',
            role='teacher', organisation=self.org, school=self.school_a,
            first_name='Rashid', last_name='Minhas'
        )

        # Principal
        self.principal_a = User.objects.create_user(
            username='principal_a', email='principal_a@ga.edu', password='TestPassword123!',
            role='principal', organisation=self.org, school=self.school_a,
            first_name='Dr. Tariq', last_name='Mahmood'
        )
        RoleAssignment.objects.create(
            user=self.principal_a, role='principal', school=self.school_a, effective_from=self.today
        )

        # Principal B
        self.principal_b = User.objects.create_user(
            username='principal_b', email='principal_b@ga.edu', password='TestPassword123!',
            role='principal', organisation=self.org, school=self.school_b
        )

        # Classes in School A
        self.class_9 = SchoolClass.objects.create(
            school=self.school_a, academic_year=self.year, name='Class 9th',
            section='A', grade_level='9', teacher=self.teacher_a
        )

        # Students in Class 9th
        self.student_1 = Student.objects.create(
            school=self.school_a, admission_number='ADM-901',
            first_name='Ahmed', last_name='Raza', gender='male',
            enrolled_on=self.today - timedelta(days=60)
        )
        Enrollment.objects.create(
            student=self.student_1, school_class=self.class_9,
            start_date=self.today - timedelta(days=60)
        )

        self.student_2 = Student.objects.create(
            school=self.school_a, admission_number='ADM-902',
            first_name='Fatima', last_name='Zahra', gender='female',
            enrolled_on=self.today - timedelta(days=60)
        )
        Enrollment.objects.create(
            student=self.student_2, school_class=self.class_9,
            start_date=self.today - timedelta(days=60)
        )

    def test_get_attendance_not_taken_returns_not_taken_status(self):
        """When attendance hasn't been conducted, records show not_taken and is_conducted is False."""
        self.client.force_authenticate(user=self.teacher_a)
        res = self.client.get(f'/api/v1/attendance/class-register/?school_class={self.class_9.id}&date={self.today.isoformat()}')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['is_conducted'])
        self.assertIsNone(res.data['conducted_by'])
        self.assertEqual(len(res.data['records']), 2)
        for r in res.data['records']:
            self.assertEqual(r['status'], 'not_taken')
            self.assertFalse(r['is_recorded'])
        self.assertEqual(res.data['summary']['not_taken'], 2)
        self.assertEqual(res.data['summary']['present'], 0)

    def test_teacher_can_conduct_attendance(self):
        """Teacher conducts attendance, records are created and conducted_by is set."""
        self.client.force_authenticate(user=self.teacher_a)
        payload = {
            'school_class': self.class_9.id,
            'date': self.today.isoformat(),
            'records': [
                {'student_id': self.student_1.id, 'status': 'present', 'note': 'On time'},
                {'student_id': self.student_2.id, 'status': 'absent', 'note': 'Sick leave'}
            ]
        }
        res_post = self.client.post('/api/v1/attendance/class-register/', payload, format='json')
        self.assertEqual(res_post.status_code, 200)
        self.assertTrue(res_post.data['success'])
        self.assertEqual(res_post.data['updated_count'], 2)

        # GET confirms attendance was conducted by teacher
        res_get = self.client.get(f'/api/v1/attendance/class-register/?school_class={self.class_9.id}&date={self.today.isoformat()}')
        self.assertTrue(res_get.data['is_conducted'])
        self.assertIn('Rashid Minhas', res_get.data['conducted_by'])
        self.assertEqual(res_get.data['summary']['present'], 1)
        self.assertEqual(res_get.data['summary']['absent'], 1)
        self.assertEqual(res_get.data['summary']['attendance_rate'], 50.0)

    def test_principal_can_view_and_alter_attendance(self):
        """Principal can view attendance conducted by teacher and alter/update it."""
        # 1. Teacher marks attendance
        self.client.force_authenticate(user=self.teacher_a)
        self.client.post('/api/v1/attendance/class-register/', {
            'school_class': self.class_9.id,
            'date': self.yesterday.isoformat(),
            'records': [
                {'student_id': self.student_1.id, 'status': 'present'},
                {'student_id': self.student_2.id, 'status': 'absent'}
            ]
        }, format='json')

        # 2. Principal logs in, views attendance
        self.client.force_authenticate(user=self.principal_a)
        res_view = self.client.get(f'/api/v1/attendance/class-register/?school_class={self.class_9.id}&date={self.yesterday.isoformat()}')
        self.assertEqual(res_view.status_code, 200)
        self.assertTrue(res_view.data['is_conducted'])

        # 3. Principal alters student 2 from absent to late (or present)
        res_alter = self.client.post('/api/v1/attendance/class-register/', {
            'school_class': self.class_9.id,
            'date': self.yesterday.isoformat(),
            'records': [
                {'student_id': self.student_1.id, 'status': 'present'},
                {'student_id': self.student_2.id, 'status': 'late', 'note': 'Arrived after morning assembly'}
            ]
        }, format='json')
        self.assertEqual(res_alter.status_code, 200)
        self.assertTrue(res_alter.data['success'])

        # 4. Verify in DB
        att2 = Attendance.objects.get(student=self.student_2, school_class=self.class_9, date=self.yesterday)
        self.assertEqual(att2.status, 'late')
        self.assertEqual(att2.recorded_by, self.principal_a)

    def test_campus_isolation_principal_cannot_access_other_campus(self):
        """Principal B from Lahore Campus cannot view or alter Class 9 in Islamabad Campus."""
        self.client.force_authenticate(user=self.principal_b)
        res = self.client.get(f'/api/v1/attendance/class-register/?school_class={self.class_9.id}&date={self.today.isoformat()}')
        self.assertEqual(res.status_code, 403)

        res_post = self.client.post('/api/v1/attendance/class-register/', {
            'school_class': self.class_9.id,
            'date': self.today.isoformat(),
            'records': [{'student_id': self.student_1.id, 'status': 'present'}]
        }, format='json')
        self.assertEqual(res_post.status_code, 403)
