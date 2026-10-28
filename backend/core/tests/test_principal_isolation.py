from datetime import date, timedelta
from decimal import Decimal
import hashlib

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, StaffMember, SchoolClass, AcademicYear,
    Subject, Student, Enrollment, Attendance, Grade, Assessment,
    ReviewCase, RoleAssignment, UserInvitation, OrganisationRolePolicy,
    ExamConfiguration, CalculatedStudentResult
)
from core.services.access import schools_scope


class PrincipalIsolationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()

        # Organisation
        self.org = Organisation.objects.create(name='Test Org', code='TORG')

        # School A (Principal's assigned school)
        self.school_a = School.objects.create(
            organisation=self.org, name='Campus Alpha', code='ALPH', city='Lahore', currency='PKR'
        )

        # School B (Another school in the same org - isolated from Principal)
        self.school_b = School.objects.create(
            organisation=self.org, name='Campus Beta', code='BETA', city='Karachi', currency='PKR'
        )

        # Academic Years
        self.year_a = AcademicYear.objects.create(
            school=self.school_a, name='2026-2027',
            start_date=self.today - timedelta(days=60),
            end_date=self.today + timedelta(days=300),
            active=True
        )
        self.year_b = AcademicYear.objects.create(
            school=self.school_b, name='2026-2027',
            start_date=self.today - timedelta(days=60),
            end_date=self.today + timedelta(days=300),
            active=True
        )

        # Org Admin
        self.org_admin = User.objects.create_user(
            username='orgadmin', email='orgadmin@test.org', password='password123',
            role='organisation_admin', organisation=self.org, is_active=True
        )

        # Principal for School A
        self.principal_user = User.objects.create_user(
            username='principal_a', email='principal.a@test.org', password='password123',
            role='principal', organisation=self.org, school=self.school_a, is_active=True
        )
        self.principal_staff = StaffMember.objects.create(
            school=self.school_a, user=self.principal_user,
            first_name='Principal', last_name='Alpha',
            email='principal.a@test.org', position='Headmaster', role='principal',
            hired_on=self.today - timedelta(days=365)
        )
        self.principal_assignment = RoleAssignment.objects.create(
            user=self.principal_user, role='principal', school=self.school_a,
            effective_from=self.today - timedelta(days=365),
            effective_to=None
        )

        # Teachers and Classes in School A
        self.teacher_a_user = User.objects.create_user(
            username='teacher_a', email='teacher.a@test.org', password='password123',
            role='teacher', organisation=self.org, school=self.school_a, is_active=True
        )
        self.teacher_a = StaffMember.objects.create(
            school=self.school_a, user=self.teacher_a_user,
            first_name='Teacher', last_name='Alpha',
            email='teacher.a@test.org', position='Mathematics Teacher', role='teacher',
            hired_on=self.today - timedelta(days=200)
        )
        self.class_a1 = SchoolClass.objects.create(
            school=self.school_a, academic_year=self.year_a,
            name='Class 8-A', grade_level='Grade 8', section='A', teacher=self.teacher_a_user
        )
        self.class_a2 = SchoolClass.objects.create(
            school=self.school_a, academic_year=self.year_a,
            name='Class 8-B', grade_level='Grade 8', section='B'
        )

        # Teacher and Class in School B
        self.teacher_b_user = User.objects.create_user(
            username='teacher_b', email='teacher.b@test.org', password='password123',
            role='teacher', organisation=self.org, school=self.school_b, is_active=True
        )
        self.teacher_b = StaffMember.objects.create(
            school=self.school_b, user=self.teacher_b_user,
            first_name='Teacher', last_name='Beta',
            email='teacher.b@test.org', position='Science Teacher', role='teacher',
            hired_on=self.today - timedelta(days=200)
        )
        self.class_b1 = SchoolClass.objects.create(
            school=self.school_b, academic_year=self.year_b,
            name='Class 8-Beta', grade_level='Grade 8', section='A', teacher=self.teacher_b_user
        )

        # Students in School A
        self.student_user_1 = User.objects.create_user(
            username='student1', email='s1@test.org', password='password123',
            role='student', organisation=self.org, school=self.school_a, is_active=True
        )
        self.student_1 = Student.objects.create(
            school=self.school_a, user=self.student_user_1,
            first_name='Ali', last_name='Khan', admission_number='ADM-001',
            gender='male', enrolled_on=self.today - timedelta(days=50)
        )
        Enrollment.objects.create(
            student=self.student_1, school_class=self.class_a1,
            start_date=self.today - timedelta(days=50)
        )

        self.student_user_2 = User.objects.create_user(
            username='student2', email='s2@test.org', password='password123',
            role='student', organisation=self.org, school=self.school_a, is_active=True
        )
        self.student_2 = Student.objects.create(
            school=self.school_a, user=self.student_user_2,
            first_name='Fatima', last_name='Ahmed', admission_number='ADM-002',
            gender='female', enrolled_on=self.today - timedelta(days=50)
        )
        Enrollment.objects.create(
            student=self.student_2, school_class=self.class_a1,
            start_date=self.today - timedelta(days=50)
        )

    # ------------------------------------------------------------------ 1. Server-Side Scope Isolation
    def test_out_of_scope_campus_returns_404_never_403(self):
        """Out-of-scope campus IDs must strictly return 404 Not Found (never 403),
        ensuring existence of other campuses is never disclosed."""
        self.client.force_authenticate(user=self.principal_user)

        # Detail of out-of-scope school
        res = self.client.get(f'/api/v1/schools/{self.school_b.id}/')
        self.assertEqual(res.status_code, 404, "Access to other campus must return 404")

        # Setup of out-of-scope school
        res = self.client.get(f'/api/v1/schools/{self.school_b.id}/setup/')
        self.assertEqual(res.status_code, 404, "Setup of other campus must return 404")

        # Campus report for out-of-scope school
        res = self.client.get(f'/api/v1/reports/campuses/{self.school_b.id}/')
        self.assertEqual(res.status_code, 404, "Campus report of other campus must return 404")

        # Staff detail for out-of-scope staff
        res = self.client.get(f'/api/v1/staff/{self.teacher_b.id}/')
        self.assertEqual(res.status_code, 404, "Other campus staff must return 404")

        # Principal dashboard querying out-of-scope school
        res = self.client.get(f'/api/v1/principal/dashboard/?school={self.school_b.id}')
        self.assertEqual(res.status_code, 404, "Principal dashboard for other campus must return 404")

    # ------------------------------------------------------------------ 2. Finance, Fees & Salaries Lockout
    def test_principal_locked_out_of_finance_and_fees(self):
        """Principal is denied access to campus finance, fee structures, vouchers, and defaulters (403)."""
        self.client.force_authenticate(user=self.principal_user)

        res = self.client.get('/api/v1/finance/categories/')
        self.assertEqual(res.status_code, 403, "Finance categories must return 403 for principal")

        res = self.client.get('/api/v1/finance/entries/')
        self.assertEqual(res.status_code, 403, "Finance entries must return 403 for principal")

        res = self.client.get('/api/v1/fees/heads/')
        self.assertEqual(res.status_code, 403, "Fee heads must return 403 for principal")

        res = self.client.get('/api/v1/fees/structures/')
        self.assertEqual(res.status_code, 403, "Fee structures must return 403 for principal")

        res = self.client.get('/api/v1/fees/defaulters/')
        self.assertEqual(res.status_code, 403, "Fee defaulters must return 403 for principal")

        res = self.client.get('/api/v1/fees/summary/')
        self.assertEqual(res.status_code, 403, "Fee summary must return 403 for principal")

    def test_principal_locked_out_of_salaries_except_own_payslip(self):
        """Principal cannot manage staff salaries or view summaries, but can view own payslips."""
        self.client.force_authenticate(user=self.principal_user)

        res = self.client.get('/api/v1/salaries/structures/')
        self.assertEqual(res.status_code, 403, "Salary structures must return 403 for principal")

        res = self.client.post('/api/v1/salaries/generate/', {'month': '2026-10'}, format='json')
        self.assertEqual(res.status_code, 403, "Salary generation must return 403 for principal")

        res = self.client.get('/api/v1/salaries/summary/')
        self.assertEqual(res.status_code, 403, "Salary summary must return 403 for principal")

        # Own payslip endpoint works
        res = self.client.get('/api/v1/salaries/my-payslips/')
        self.assertEqual(res.status_code, 200, "Principal can view own payslips via my-payslips")

    # ------------------------------------------------------------------ 3. HR Promote/Terminate Restrictions
    def test_principal_cannot_promote_or_terminate_staff(self):
        """Principals are not authorized to promote, terminate, or reinstate staff (returns 403)."""
        self.client.force_authenticate(user=self.principal_user)

        # In-campus staff listing is permitted (academic leadership duty)
        res = self.client.get('/api/v1/staff/')
        self.assertEqual(res.status_code, 200)

        # Promote staff denied
        res = self.client.post(
            f'/api/v1/staff/{self.teacher_a.id}/promote/',
            {'new_position': 'Senior Math Teacher'}, format='json'
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn('not authorized to promote or terminate staff', res.data.get('detail', ''))

        # Terminate staff denied
        res = self.client.post(
            f'/api/v1/staff/{self.teacher_a.id}/terminate/',
            {'reason': 'Budget cuts'}, format='json'
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn('not authorized to promote or terminate staff', res.data.get('detail', ''))

        # Assign role denied
        res = self.client.post(
            f'/api/v1/staff/{self.teacher_a.id}/assign-role/',
            {'role': 'school_admin'}, format='json'
        )
        self.assertEqual(res.status_code, 403)

        # Configuring salary on staff creation denied
        res = self.client.post(
            '/api/v1/staff/',
            {
                'first_name': 'New', 'last_name': 'Teacher', 'position': 'Physics Teacher',
                'role': 'teacher', 'salary': '50000.00'
            }, format='json'
        )
        self.assertEqual(res.status_code, 403)

    # ------------------------------------------------------------------ 4. Structure & Reports Restrictions
    def test_principal_cannot_manage_academic_years(self):
        """Principals cannot create or delete academic years (structure.manage_academic_years is OFF by default)."""
        self.client.force_authenticate(user=self.principal_user)

        res = self.client.post(
            '/api/v1/years/',
            {
                'school': self.school_a.id, 'name': '2027-2028',
                'start_date': '2027-08-01', 'end_date': '2028-06-30'
            }, format='json'
        )
        self.assertEqual(res.status_code, 403)

        res = self.client.delete(f'/api/v1/years/{self.year_a.id}/')
        self.assertEqual(res.status_code, 403)

    def test_multi_campus_overview_denied_for_principal(self):
        """Principals cannot view multi-campus organisation overview reports."""
        self.client.force_authenticate(user=self.principal_user)

        res = self.client.get('/api/v1/reports/overview/')
        self.assertEqual(res.status_code, 403)

    # ------------------------------------------------------------------ 5. Secure Principal Invitation & Hashing
    def test_principal_invitation_token_hash_and_single_use(self):
        """Invitation creates inactive user, stores token_hash (raw token not in DB), and enforces single use."""
        self.client.force_authenticate(user=self.org_admin)

        inv_email = 'new.principal@test.org'
        res = self.client.post(
            '/api/v1/invitations/',
            {
                'email': inv_email,
                'role': 'principal',
                'school': self.school_a.id,
                'first_name': 'Zainab',
                'last_name': 'Bibi'
            }, format='json'
        )
        self.assertEqual(res.status_code, 201)
        raw_token = res.data.get('raw_token')
        self.assertTrue(raw_token, "API response must provide raw token for invitation link")

        # Database check: raw token must NOT be in DB, only token_hash
        invitation = UserInvitation.objects.get(email=inv_email)
        self.assertEqual(invitation.token, '', "Raw token must not be in token field")
        self.assertNotEqual(invitation.token, raw_token)
        expected_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        self.assertEqual(invitation.token_hash, expected_hash, "DB must store SHA-256 hash of raw token")

        # Inactive user, staff record, and RoleAssignment created
        self.assertIsNotNone(invitation.invited_user)
        self.assertFalse(invitation.invited_user.is_active, "User must initially be inactive")
        self.assertEqual(invitation.invited_user.school_id, self.school_a.id)

        self.assertIsNotNone(invitation.staff_member)
        self.assertEqual(invitation.staff_member.position, 'Campus Principal')

        self.assertTrue(
            RoleAssignment.objects.filter(
                user=invitation.invited_user, role='principal', school=self.school_a
            ).exists()
        )

        # Accept invitation with raw token
        self.client.force_authenticate(user=None)
        accept_res = self.client.post(
            '/api/v1/invitations/accept/',
            {'token': raw_token, 'password': 'SecuredPassword123!'}, format='json'
        )
        self.assertEqual(accept_res.status_code, 200)

        # User is now active
        invitation.refresh_from_db()
        self.assertIsNotNone(invitation.used_at)
        self.assertTrue(invitation.invited_user.is_active)

        # Single-use enforcement: re-accepting token fails
        repeat_res = self.client.post(
            '/api/v1/invitations/accept/',
            {'token': raw_token, 'password': 'AnotherPassword123!'}, format='json'
        )
        self.assertEqual(repeat_res.status_code, 400)

    # ------------------------------------------------------------------ 6. Authentication: Case-Insensitive & Public Reg Closed
    def test_case_insensitive_email_and_username_login(self):
        """Principals can sign in with case-insensitive email or username."""
        # Email login with UPPERCASE email
        res = self.client.post(
            '/api/v1/auth/signin/',
            {'username': 'PRINCIPAL.A@TEST.ORG', 'password': 'password123'}, format='json'
        )
        self.assertEqual(res.status_code, 200, "Sign-in with uppercase email must succeed")
        self.assertEqual(res.data['role'], 'principal')

        # Username login
        res = self.client.post(
            '/api/v1/auth/signin/',
            {'username': 'principal_a', 'password': 'password123'}, format='json'
        )
        self.assertEqual(res.status_code, 200, "Sign-in with username must succeed")

    def test_closed_public_registration_returns_410(self):
        """Self-registration is closed and returns HTTP 410 Gone."""
        res = self.client.post(
            '/api/v1/auth/register/',
            {'email': 'stranger@example.com', 'password': 'password123'}, format='json'
        )
        self.assertEqual(res.status_code, 410)

    # ------------------------------------------------------------------ 7. RoleAssignment Historical Expiry
    def test_expired_role_assignment_terminates_campus_access(self):
        """When a RoleAssignment expires (effective_to < today), principal's campus scope is revoked."""
        # Set assignment expired yesterday
        self.principal_assignment.effective_to = self.today - timedelta(days=1)
        self.principal_assignment.save()

        # schools_scope returns empty
        scope = schools_scope(self.principal_user)
        self.assertEqual(scope.count(), 0, "Expired role assignment must produce empty schools_scope")

        # API requests to former school return 404
        self.client.force_authenticate(user=self.principal_user)
        res = self.client.get(f'/api/v1/schools/{self.school_a.id}/')
        self.assertEqual(res.status_code, 404)

        res = self.client.get('/api/v1/principal/dashboard/')
        self.assertEqual(res.status_code, 404)

    # ------------------------------------------------------------------ 8. Dedicated Principal Dashboard
    def test_principal_dashboard_payload(self):
        """Principal dashboard returns KPI strip, attention items, class comparison, and neutral gender notes."""
        self.client.force_authenticate(user=self.principal_user)

        # Record today's attendance for class_a1
        Attendance.objects.create(
            student=self.student_1, school_class=self.class_a1,
            date=self.today, status='present'
        )
        Attendance.objects.create(
            student=self.student_2, school_class=self.class_a1,
            date=self.today, status='present'
        )

        # Create an open review case
        ReviewCase.objects.create(
            student=self.student_1, school=self.school_a,
            reason='Academic support needed in Algebra',
            status='open', priority='high'
        )

        # Call dashboard
        res = self.client.get('/api/v1/principal/dashboard/')
        self.assertEqual(res.status_code, 200)

        data = res.data
        # Campus metadata
        self.assertEqual(data['campus']['id'], self.school_a.id)
        self.assertEqual(data['campus']['name'], self.school_a.name)

        # KPI strip
        self.assertEqual(data['kpi']['total_students'], 2)
        self.assertEqual(data['kpi']['total_classes'], 2)
        self.assertEqual(data['kpi']['today_attendance_rate'], 100.0)

        # Needs attention
        # class_a2 had no attendance submitted today, so unsubmitted_registers should have class_a2
        self.assertEqual(data['needs_attention']['unsubmitted_registers_count'], 1)
        unsubmitted_cids = [r['class_id'] for r in data['needs_attention']['unsubmitted_registers']]
        self.assertIn(self.class_a2.id, unsubmitted_cids)

        # Open review cases
        self.assertEqual(data['needs_attention']['open_review_cases_count'], 1)

        # Class comparisons
        self.assertEqual(len(data['class_comparison']), 2)

        # Gender performance guidance note
        self.assertIn('gender_performance', data)
        self.assertIn('note', data['gender_performance'])

    # ------------------------------------------------------------------ 9. Direct Creation, Immediate Login & Password Reset
    def test_direct_principal_creation_and_immediate_login(self):
        """Org Admin provisions a principal with email and initial password; principal logs in immediately and accesses dashboard."""
        self.client.force_authenticate(user=self.org_admin)
        payload = {
            'first_name': 'Hamza',
            'last_name': 'Ali',
            'email': 'hamza.principal@school.edu',
            'username': 'hamza_prin',
            'password': 'FirstTimePass2026!',
            'role': 'principal',
            'school': self.school_a.id
        }
        res = self.client.post('/api/v1/accounts/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['role'], 'principal')
        self.assertEqual(res.data['email'], 'hamza.principal@school.edu')

        # Verify linked StaffMember and RoleAssignment exist
        u = User.objects.get(username='hamza_prin')
        self.assertEqual(u.role, 'principal')
        self.assertEqual(u.school, self.school_a)
        self.assertTrue(StaffMember.objects.filter(user=u, school=self.school_a, role='principal').exists())
        self.assertTrue(RoleAssignment.objects.filter(user=u, school=self.school_a, role='principal').exists())

        # Unauthenticate and log in using email and first-time password
        self.client.logout()
        login_res = self.client.post('/api/v1/auth/login/', {
            'username': 'hamza.principal@school.edu',
            'password': 'FirstTimePass2026!'
        }, format='json')
        self.assertEqual(login_res.status_code, 200, "Principal must be able to log in with email and first-time password")
        self.assertEqual(login_res.data['role'], 'principal')

        # Principal can view their campus dashboard
        dash_res = self.client.get('/api/v1/principal/dashboard/')
        self.assertEqual(dash_res.status_code, 200)
        self.assertEqual(dash_res.data['campus']['id'], self.school_a.id)

    def test_school_admin_can_provision_principal_for_own_campus(self):
        """School Admin can provision a principal for their assigned campus, but is rejected for foreign campuses."""
        # Create school admin for school_a
        sch_admin = User.objects.create_user(
            username='sch_admin_a',
            email='sch_admin_a@school.edu',
            password='AdminPassword2026!',
            role='school_admin',
            organisation=self.org,
            school=self.school_a
        )
        self.client.force_authenticate(user=sch_admin)

        # Provision principal for own campus
        payload = {
            'first_name': 'Nadia',
            'last_name': 'Hussain',
            'email': 'nadia.h@school.edu',
            'password': 'InitialPassword123!',
            'role': 'principal',
            'school': self.school_a.id
        }
        res = self.client.post('/api/v1/accounts/', payload, format='json')
        self.assertEqual(res.status_code, 201)

        # Nadia can log in immediately
        self.client.logout()
        login_res = self.client.post('/api/v1/auth/login/', {
            'username': 'nadia.h@school.edu',
            'password': 'InitialPassword123!'
        }, format='json')
        self.assertEqual(login_res.status_code, 200)

    def test_principal_password_reset_flow(self):
        """Principal can reset their password using their first-time password, and subsequent sign-in requires the new password."""
        # Create a principal
        prin = User.objects.create_user(
            username='reset_prin',
            email='reset_prin@school.edu',
            password='InitialPassword123!',
            role='principal',
            organisation=self.org,
            school=self.school_a
        )
        RoleAssignment.objects.create(
            user=prin, role='principal', school=self.school_a, effective_from=self.today
        )

        # Principal logs in with first-time password
        self.client.force_authenticate(user=prin)

        # Attempt password change with incorrect current password -> rejected
        bad_change = self.client.post('/api/v1/auth/password/', {
            'current_password': 'WrongPassword!',
            'password': 'NewSecurePassword2026!'
        }, format='json')
        self.assertEqual(bad_change.status_code, 400)
        self.assertIn('Current password does not match', bad_change.data['detail'])

        # Attempt password change with too short new password -> rejected
        short_change = self.client.post('/api/v1/auth/password/', {
            'current_password': 'InitialPassword123!',
            'password': 'short'
        }, format='json')
        self.assertEqual(short_change.status_code, 400)

        # Successful password reset
        good_change = self.client.post('/api/v1/auth/password/', {
            'current_password': 'InitialPassword123!',
            'password': 'NewSecurePassword2026!'
        }, format='json')
        self.assertEqual(good_change.status_code, 200)

        # Log out and verify old password fails
        self.client.logout()
        old_login = self.client.post('/api/v1/auth/login/', {
            'username': 'reset_prin@school.edu',
            'password': 'InitialPassword123!'
        }, format='json')
        self.assertEqual(old_login.status_code, 400)

        # Verify new password succeeds
        new_login = self.client.post('/api/v1/auth/login/', {
            'username': 'reset_prin@school.edu',
            'password': 'NewSecurePassword2026!'
        }, format='json')
        self.assertEqual(new_login.status_code, 200)

    def test_staff_creation_with_direct_login(self):
        """Creating a staff member with password provisions both the StaffMember and active User login."""
        self.client.force_authenticate(user=self.org_admin)
        payload = {
            'school': self.school_a.id,
            'first_name': 'Kamran',
            'last_name': 'Akmal',
            'role': 'principal',
            'position': 'Campus Principal',
            'email': 'kamran.prin@school.edu',
            'password': 'DirectPassword2026!',
            'hired_on': self.today.isoformat()
        }
        res = self.client.post('/api/v1/staff/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['role'], 'principal')

        # Verify User and RoleAssignment were created
        u = User.objects.get(email='kamran.prin@school.edu')
        self.assertEqual(u.role, 'principal')
        self.assertTrue(RoleAssignment.objects.filter(user=u, school=self.school_a, role='principal').exists())

        # Kamran logs in immediately
        self.client.logout()
        res = self.client.post('/api/v1/auth/login/', {
            'username': 'kamran.prin@school.edu',
            'password': 'DirectPassword2026!'
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['role'], 'principal')

