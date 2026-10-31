from datetime import date
from decimal import Decimal
from django.test import TestCase
from django.core import mail
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, StaffMember, StaffAttendance,
    Student, SchoolClass, Enrollment, Attendance, SalaryStructure, AcademicYear
)
from core.services.student_credentials import generate_student_username


class AttendanceHistoryAndStaffUpdatesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = date.today()

        self.org = Organisation.objects.create(name='Federal Educators')
        self.school = School.objects.create(
            organisation=self.org, name='City Campus', code='CAMPUS-KZGI', currency='PKR'
        )

        self.admin = User.objects.create_user(
            username='admin_boss', email='admin@test.com', password='AdminPassword123!',
            role='school_admin', organisation=self.org, school=self.school
        )
        self.client.force_authenticate(user=self.admin)

    def test_student_username_format(self):
        """SS 1: Username format must be OO-STU-(Number)."""
        uname = generate_student_username(self.school, '23')
        self.assertEqual(uname, 'OO-STU-23')

        uname2 = generate_student_username(self.school, '2026-0412')
        self.assertEqual(uname2, 'OO-STU-2026-0412')

    def test_staff_creation_sends_email_and_fast_deletion(self):
        """SS 2: Staff creation sends email with credentials; staff deletion removes dependents cleanly."""
        mail.outbox = []

        # Create staff with email and password
        res = self.client.post('/api/v1/staff/', {
            'school': self.school.id,
            'first_name': 'Tariq',
            'last_name': 'Jamil',
            'email': 'tariq@test.com',
            'position': 'Senior Teacher',
            'role': 'teacher',
            'hired_on': self.today.isoformat(),
            'salary': '65000',
            'payment_method': 'bank',
            'teacher_type': 'subject_teacher',
            'assign_later': True,
            'password': 'SecureStaffPassword123!'
        }, format='json')
        self.assertEqual(res.status_code, 201)
        staff_id = res.data['id']

        # Verify email was dispatched to staff member
        self.assertTrue(len(mail.outbox) >= 1)
        sent_mail = [m for m in mail.outbox if 'tariq@test.com' in m.to]
        self.assertTrue(len(sent_mail) >= 1)
        self.assertIn('SecureStaffPassword123!', sent_mail[0].body)
        self.assertIn('tariq@test.com', sent_mail[0].body)

        # Fast deletion test
        s = StaffMember.objects.get(id=staff_id)
        # Create an attendance record and verify deletion
        StaffAttendance.objects.create(staff=s, school=self.school, date=self.today, status='present')
        del_res = self.client.delete(f'/api/v1/staff/{staff_id}/')
        self.assertEqual(del_res.status_code, 200)
        self.assertFalse(StaffMember.objects.filter(id=staff_id).exists())
        self.assertFalse(StaffAttendance.objects.filter(staff_id=staff_id).exists())

    def test_staff_edit_password_reset(self):
        """SS 3: Staff PATCH supports password reset and email dispatch."""
        mail.outbox = []

        staff = StaffMember.objects.create(
            school=self.school, first_name='Zoya', last_name='Khan',
            position='Head Teacher', role='teacher', hired_on=self.today,
            email='zoya@test.com'
        )

        patch_res = self.client.patch(f'/api/v1/staff/{staff.id}/', {
            'position': 'Principal Advisor',
            'password': 'NewResetPassword789!',
            'send_email': True
        }, format='json')
        self.assertEqual(patch_res.status_code, 200)

        # Verify linked user has new password
        staff.refresh_from_db()
        self.assertIsNotNone(staff.user)
        self.assertTrue(staff.user.check_password('NewResetPassword789!'))

        # Verify email was dispatched
        sent_mail = [m for m in mail.outbox if 'zoya@test.com' in m.to]
        self.assertTrue(len(sent_mail) >= 1)
        self.assertIn('NewResetPassword789!', sent_mail[0].body)

    def test_student_and_staff_attendance_history_calendar(self):
        """SS 4: Attendance history returns per-date color statuses and monthly statistics."""
        ay = AcademicYear.objects.create(
            school=self.school, name='2026-2027', start_date=date(2026, 1, 1), end_date=date(2026, 12, 31)
        )
        student = Student.objects.create(
            school=self.school, first_name='Alu', last_name='Gajar',
            admission_number='23', gender='female', enrolled_on=self.today
        )
        sclass = SchoolClass.objects.create(
            school=self.school, academic_year=ay, name='Grade 10', section='A'
        )
        Enrollment.objects.create(
            student=student, school_class=sclass, start_date=self.today
        )

        Attendance.objects.create(
            student=student, school_class=sclass, date=date(2026, 10, 5), status='present'
        )
        Attendance.objects.create(
            student=student, school_class=sclass, date=date(2026, 10, 6), status='late', note='Traffic delay'
        )
        Attendance.objects.create(
            student=student, school_class=sclass, date=date(2026, 10, 7), status='absent'
        )
        Attendance.objects.create(
            student=student, school_class=sclass, date=date(2026, 10, 8), status='excused', note='Sick leave'
        )

        # Query Student History
        res_stu = self.client.get(f'/api/v1/attendance/history/?type=student&id={student.id}&year=2026&month=10')
        self.assertEqual(res_stu.status_code, 200)
        self.assertEqual(res_stu.data['user_info']['name'], 'Alu Gajar')
        self.assertEqual(res_stu.data['summary']['present'], 1)
        self.assertEqual(res_stu.data['summary']['late'], 1)
        self.assertEqual(res_stu.data['summary']['absent'], 1)
        self.assertEqual(res_stu.data['summary']['excused'], 1)
        self.assertEqual(len(res_stu.data['records']), 4)

        # Setup staff with attendance
        staff = StaffMember.objects.create(
            school=self.school, first_name='Bilal', last_name='Ahmad',
            position='Science Teacher', role='teacher', hired_on=self.today,
            email='bilal@test.com'
        )
        StaffAttendance.objects.create(
            staff=staff, school=self.school, date=date(2026, 10, 12), status='present'
        )
        StaffAttendance.objects.create(
            staff=staff, school=self.school, date=date(2026, 10, 13), status='late'
        )

        # Query Staff History
        res_staff = self.client.get(f'/api/v1/attendance/history/?type=staff&id={staff.id}&year=2026&month=10')
        self.assertEqual(res_staff.status_code, 200)
        self.assertEqual(res_staff.data['user_info']['name'], 'Bilal Ahmad')
        self.assertEqual(res_staff.data['summary']['present'], 1)
        self.assertEqual(res_staff.data['summary']['late'], 1)
        self.assertEqual(len(res_staff.data['records']), 2)
