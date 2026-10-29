from datetime import date
from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, StaffMember, StaffAttendance, RoleAssignment,
    SalaryStructure, FinanceCategory, FinanceEntry
)


class StaffAttendanceAndPrincipalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = date.today()

        self.org = Organisation.objects.create(name='Federal Educators')
        self.school_a = School.objects.create(
            organisation=self.org, name='Campus Islamabad', code='ISB-01', currency='PKR'
        )
        self.school_b = School.objects.create(
            organisation=self.org, name='Campus Lahore', code='LHR-01', currency='PKR'
        )

        self.org_admin = User.objects.create_user(
            username='org_admin', email='org@fed.edu', password='TestPassword123!',
            role='organisation_admin', organisation=self.org
        )

        self.principal_a = User.objects.create_user(
            username='principal_a', email='prin_a@fed.edu', password='TestPassword123!',
            role='principal', organisation=self.org, school=self.school_a
        )
        RoleAssignment.objects.create(
            user=self.principal_a, role='principal', school=self.school_a, effective_from=self.today
        )

        # Staff in School A
        self.staff_a1 = StaffMember.objects.create(
            school=self.school_a, first_name='Ali', last_name='Khan',
            position='Maths Teacher', role='teacher', hired_on=self.today
        )
        self.staff_a2 = StaffMember.objects.create(
            school=self.school_a, first_name='Sara', last_name='Ahmed',
            position='Physics Teacher', role='teacher', hired_on=self.today
        )

        # Staff in School B
        self.staff_b1 = StaffMember.objects.create(
            school=self.school_b, first_name='Zain', last_name='Malik',
            position='Chemistry Teacher', role='teacher', hired_on=self.today
        )

    def test_mandatory_salary_validation(self):
        """Staff creation requires a valid base salary greater than zero."""
        self.client.force_authenticate(user=self.org_admin)

        # Missing salary
        res = self.client.post('/api/v1/staff/', {
            'school': self.school_a.id,
            'first_name': 'No',
            'last_name': 'Salary',
            'role': 'teacher',
            'position': 'Teacher',
            'hired_on': self.today.isoformat()
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('salary', res.data)

        # Zero salary
        res = self.client.post('/api/v1/staff/', {
            'school': self.school_a.id,
            'first_name': 'Zero',
            'last_name': 'Salary',
            'role': 'teacher',
            'position': 'Teacher',
            'salary': '0',
            'hired_on': self.today.isoformat()
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('salary', res.data)

        # Valid salary
        res = self.client.post('/api/v1/staff/', {
            'school': self.school_a.id,
            'first_name': 'Valid',
            'last_name': 'Salary',
            'role': 'teacher',
            'position': 'Teacher',
            'salary': '60000.00',
            'hired_on': self.today.isoformat()
        }, format='json')
        self.assertEqual(res.status_code, 201)
        staff_id = res.data['id']
        self.assertTrue(SalaryStructure.objects.filter(staff_id=staff_id, basic=Decimal('60000.00')).exists())

    def test_additional_custom_role_support(self):
        """Creating a staff member with 'additional' role succeeds."""
        self.client.force_authenticate(user=self.principal_a)
        res = self.client.post('/api/v1/staff/', {
            'school': self.school_a.id,
            'first_name': 'Tariq',
            'last_name': 'Mehmood',
            'role': 'additional',
            'position': 'Lab Coordinator & Assistant',
            'salary': '45000.00',
            'hired_on': self.today.isoformat()
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['role'], 'additional')
        self.assertEqual(res.data['position'], 'Lab Coordinator & Assistant')

    def test_staff_attendance_get_and_post(self):
        """Principal can view campus staff and mark attendance in bulk."""
        self.client.force_authenticate(user=self.principal_a)

        # GET attendance for today
        res = self.client.get('/api/v1/staff/attendance/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['school'], self.school_a.id)
        records = res.data['records']
        self.assertEqual(len(records), 2)  # staff_a1 and staff_a2
        self.assertEqual(res.data['summary']['total'], 2)

        # POST attendance marking
        payload = {
            'date': self.today.isoformat(),
            'records': [
                {'staff_id': self.staff_a1.id, 'status': 'present', 'note': 'On time'},
                {'staff_id': self.staff_a2.id, 'status': 'late', 'note': '15 mins traffic delay'}
            ]
        }
        res_post = self.client.post('/api/v1/staff/attendance/', payload, format='json')
        self.assertEqual(res_post.status_code, 200)
        self.assertTrue(res_post.data['success'])
        self.assertEqual(res_post.data['updated_count'], 2)

        # Verify DB records
        att1 = StaffAttendance.objects.get(staff=self.staff_a1, date=self.today)
        self.assertEqual(att1.status, 'present')
        self.assertEqual(att1.note, 'On time')
        self.assertEqual(att1.marked_by, self.principal_a)

        att2 = StaffAttendance.objects.get(staff=self.staff_a2, date=self.today)
        self.assertEqual(att2.status, 'late')
        self.assertEqual(att2.note, '15 mins traffic delay')

        # GET again reflects saved attendance
        res_get2 = self.client.get('/api/v1/staff/attendance/')
        self.assertEqual(res_get2.data['summary']['present'], 1)
        self.assertEqual(res_get2.data['summary']['late'], 1)

    def test_staff_attendance_campus_isolation(self):
        """Principal A cannot mark attendance for staff member belonging to School B."""
        self.client.force_authenticate(user=self.principal_a)

        # Attempt to mark staff_b1 (belongs to School B)
        payload = {
            'date': self.today.isoformat(),
            'records': [
                {'staff_id': self.staff_b1.id, 'status': 'present', 'note': 'Hacked entry'}
            ]
        }
        res = self.client.post('/api/v1/staff/attendance/', payload, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['updated_count'], 0)  # staff_b1 was ignored because out of campus
        self.assertFalse(StaffAttendance.objects.filter(staff=self.staff_b1).exists())

    def test_principal_can_view_campus_finance(self):
        """Principal A can access campus finance ledger summary and entries."""
        cat = FinanceCategory.objects.create(school=self.school_a, kind='income', name='Tuition fees')
        FinanceEntry.objects.create(
            school=self.school_a, category=cat, amount=Decimal('50000.00'),
            date=self.today, description='Term fees', created_by=self.principal_a
        )

        self.client.force_authenticate(user=self.principal_a)
        res = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['total_income'], 50000.0)
        self.assertEqual(len(res.data['campuses']), 1)

        # Entries endpoint
        res_entries = self.client.get('/api/v1/finance/entries/')
        self.assertEqual(res_entries.status_code, 200)
        self.assertEqual(len(res_entries.data['results']), 1)

    def test_principal_can_view_reports_overview_for_own_campus(self):
        """Principal A can access reports overview, strictly scoped to their own campus."""
        self.client.force_authenticate(user=self.principal_a)
        res = self.client.get('/api/v1/reports/overview/')
        self.assertEqual(res.status_code, 200)
        campuses = res.data.get('campuses', [])
        self.assertEqual(len(campuses), 1)
        self.assertEqual(campuses[0]['id'], self.school_a.id)
