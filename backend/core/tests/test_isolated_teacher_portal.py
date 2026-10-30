from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import (
    AcademicYear, Assessment, Attendance, ClassTeacherAssignment, Enrollment,
    Grade, Homework, HomeworkSubmission, Organisation, OrganisationRolePolicy,
    ReviewCase, School, SchoolClass, StaffMember, Student, Subject,
    TeachingAssignment, User, UserInvitation
)


class IsolatedTeacherPortalTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Create Organisation
        self.org = Organisation.objects.create(
            name='Test Org',
            code='test-org',
            allow_temporary_passwords=False,
            class_teacher_can_edit_all_subject_marks=False,
            teachers_keep_read_access_to_own_history=True,
            max_classes_per_class_teacher=1,
            teachers_can_export=True
        )

        # Campus A and Campus B
        self.campus_a = School.objects.create(organisation=self.org, name='Campus A', code='CA')
        self.campus_b = School.objects.create(organisation=self.org, name='Campus B', code='CB')

        # Academic Years
        self.year_a = AcademicYear.objects.create(school=self.campus_a, name='2026', start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        self.year_b = AcademicYear.objects.create(school=self.campus_b, name='2026', start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))

        # Classes
        self.class_7a = SchoolClass.objects.create(school=self.campus_a, academic_year=self.year_a, name='Class 7', section='A', grade_level='7')
        self.class_8a = SchoolClass.objects.create(school=self.campus_a, academic_year=self.year_a, name='Class 8', section='A', grade_level='8')
        self.class_8b = SchoolClass.objects.create(school=self.campus_a, academic_year=self.year_a, name='Class 8', section='B', grade_level='8')
        self.class_b_10 = SchoolClass.objects.create(school=self.campus_b, academic_year=self.year_b, name='Class 10', section='A', grade_level='10')

        # Subjects
        self.math_a = Subject.objects.create(school=self.campus_a, name='Mathematics', code='MTH7')
        self.science_a = Subject.objects.create(school=self.campus_a, name='Science', code='SCI7')
        self.english_a = Subject.objects.create(school=self.campus_a, name='English', code='ENG7')
        self.math_b = Subject.objects.create(school=self.campus_b, name='Mathematics', code='MTH10')

        # Org Admin User
        self.admin = User.objects.create_user(
            username='admin@test.org', email='admin@test.org', password='Password123!',
            role='organisation_admin', organisation=self.org
        )

        # Principal User on Campus A
        self.principal = User.objects.create_user(
            username='principal@test.org', email='principal@test.org', password='Password123!',
            role='principal', organisation=self.org, school=self.campus_a
        )
        self.principal_staff = StaffMember.objects.create(
            school=self.campus_a, user=self.principal, first_name='Campus', last_name='Principal',
            email='principal@test.org', position='Principal', role='principal', hired_on=date(2026, 1, 1)
        )

        # Students on Campus A
        self.student_7a_1 = Student.objects.create(
            school=self.campus_a, admission_number='ADM-701', first_name='Alice', last_name='Smith',
            father_name='John Smith', mother_name='Mary Smith', guardian_phone='1234567890',
            date_of_birth=date(2013, 5, 10), gender='female', enrolled_on=date(2026, 1, 1)
        )
        Enrollment.objects.create(student=self.student_7a_1, school_class=self.class_7a, start_date=date(2026, 1, 1))

        self.student_8a_1 = Student.objects.create(
            school=self.campus_a, admission_number='ADM-801', first_name='Bob', last_name='Jones',
            father_name='Robert Jones', mother_name='Sarah Jones', guardian_phone='0987654321',
            date_of_birth=date(2012, 4, 15), gender='male', enrolled_on=date(2026, 1, 1)
        )
        Enrollment.objects.create(student=self.student_8a_1, school_class=self.class_8a, start_date=date(2026, 1, 1))

        self.student_8b_1 = Student.objects.create(
            school=self.campus_a, admission_number='ADM-802', first_name='Charlie', last_name='Brown',
            father_name='David Brown', mother_name='Lucy Brown', guardian_phone='1122334455',
            date_of_birth=date(2012, 9, 20), gender='male', enrolled_on=date(2026, 1, 1)
        )
        Enrollment.objects.create(student=self.student_8b_1, school_class=self.class_8b, start_date=date(2026, 1, 1))

    # =========================================================================
    # PART 2 TESTS — Creating Teachers & Login Credentials
    # =========================================================================
    def test_add_teacher_class_teacher(self):
        """Admin creates a Class Teacher: class assignment created and invitation issued."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/staff/', {
            'first_name': 'Clara',
            'last_name': 'Oswald',
            'email': 'clara@test.org',
            'phone': '123456',
            'school': self.campus_a.id,
            'role': 'teacher',
            'teacher_type': 'class_teacher',
            'class_teacher_class': self.class_7a.id,
            'position': 'Class Teacher 7A',
            'salary': '50000.00'
        }, format='json')
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data['teacher_type'], 'class_teacher')
        self.assertTrue(data['has_login'])
        self.assertIn('invitation_token', data)

        # Check models created
        user = User.objects.get(email='clara@test.org')
        self.assertEqual(user.role, 'teacher')
        self.assertFalse(user.has_usable_password())
        cta = ClassTeacherAssignment.objects.filter(teacher=user, school_class=self.class_7a, end_date__isnull=True).first()
        self.assertIsNotNone(cta)
        self.class_7a.refresh_from_db()
        self.assertEqual(self.class_7a.teacher, user)

    def test_add_teacher_subject_teacher(self):
        """Admin creates a Subject Teacher with (class, subject) rows."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/staff/', {
            'first_name': 'Sam',
            'last_name': 'Maths',
            'email': 'sam@test.org',
            'school': self.campus_a.id,
            'role': 'teacher',
            'teacher_type': 'subject_teacher',
            'subject_assignments': [
                {'class_id': self.class_8a.id, 'subject_id': self.math_a.id},
                {'class_id': self.class_8b.id, 'subject_id': self.math_a.id}
            ],
            'position': 'Maths Teacher',
            'salary': '45000.00'
        }, format='json')
        self.assertEqual(res.status_code, 201)
        user = User.objects.get(email='sam@test.org')
        assignments = TeachingAssignment.objects.filter(teacher=user, end_date__isnull=True)
        self.assertEqual(assignments.count(), 2)

    def test_add_teacher_both(self):
        """Admin creates a teacher with Both types: class teacher of 7A and subject teacher in 8A."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/staff/', {
            'first_name': 'Mixed',
            'last_name': 'Teacher',
            'email': 'mixed@test.org',
            'school': self.campus_a.id,
            'role': 'teacher',
            'teacher_type': 'both',
            'class_teacher_class': self.class_7a.id,
            'subject_assignments': [
                {'class_id': self.class_8a.id, 'subject_id': self.science_a.id}
            ],
            'position': 'Faculty Member',
            'salary': '55000.00'
        }, format='json')
        self.assertEqual(res.status_code, 201)
        staff = StaffMember.objects.get(email='mixed@test.org')
        self.assertEqual(staff.teacher_type, 'both')

    def test_class_teacher_conflict_and_replace(self):
        """If class already has a class teacher, 409 conflict returned unless replace_existing is true."""
        self.client.force_authenticate(user=self.admin)
        # Create first teacher
        self.client.post('/api/v1/staff/', {
            'first_name': 'Old', 'last_name': 'Teacher', 'email': 'old@test.org',
            'school': self.campus_a.id, 'role': 'teacher', 'teacher_type': 'class_teacher',
            'class_teacher_class': self.class_7a.id, 'position': 'Teacher', 'salary': '40000.00'
        }, format='json')

        # Try creating second teacher on same class without replace
        res = self.client.post('/api/v1/staff/', {
            'first_name': 'New', 'last_name': 'Teacher', 'email': 'new@test.org',
            'school': self.campus_a.id, 'role': 'teacher', 'teacher_type': 'class_teacher',
            'class_teacher_class': self.class_7a.id, 'position': 'Teacher', 'salary': '40000.00'
        }, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertTrue(res.json().get('conflict'))

        # Now create with replace_existing=True
        res2 = self.client.post('/api/v1/staff/', {
            'first_name': 'New', 'last_name': 'Teacher', 'email': 'new@test.org',
            'school': self.campus_a.id, 'role': 'teacher', 'teacher_type': 'class_teacher',
            'class_teacher_class': self.class_7a.id, 'replace_existing': True,
            'effective_date': '2026-06-01', 'position': 'Teacher', 'salary': '40000.00'
        }, format='json')
        self.assertEqual(res2.status_code, 201)
        old_user = User.objects.get(email='old@test.org')
        new_user = User.objects.get(email='new@test.org')
        old_cta = ClassTeacherAssignment.objects.filter(teacher=old_user, school_class=self.class_7a).first()
        self.assertEqual(old_cta.end_date, date(2026, 6, 1))
        new_cta = ClassTeacherAssignment.objects.filter(teacher=new_user, school_class=self.class_7a, end_date__isnull=True).first()
        self.assertIsNotNone(new_cta)

    def test_temporary_password_policy_enforcement(self):
        """Setting temporary password is blocked when allow_temporary_passwords is False, allowed when True."""
        self.client.force_authenticate(user=self.admin)
        # Attempt when OFF
        res = self.client.post('/api/v1/staff/', {
            'first_name': 'Temp', 'last_name': 'Teacher', 'email': 'temp@test.org',
            'school': self.campus_a.id, 'role': 'teacher', 'teacher_type': 'subject_teacher',
            'assign_later': True, 'position': 'Teacher', 'salary': '40000.00',
            'set_temporary_password': True, 'temporary_password': 'TempPassword123!'
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('temporary_password', res.json())

        # Enable policy
        self.org.allow_temporary_passwords = True
        self.org.save()

        res2 = self.client.post('/api/v1/staff/', {
            'first_name': 'Temp', 'last_name': 'Teacher', 'email': 'temp@test.org',
            'school': self.campus_a.id, 'role': 'teacher', 'teacher_type': 'subject_teacher',
            'assign_later': True, 'position': 'Teacher', 'salary': '40000.00',
            'set_temporary_password': True, 'temporary_password': 'TempPassword123!'
        }, format='json')
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(res2.json()['temporary_password'], 'TempPassword123!')
        user = User.objects.get(email='temp@test.org')
        self.assertTrue(user.must_change_password)
        self.assertTrue(user.check_password('TempPassword123!'))

    def test_principal_and_teacher_permissions_on_staff_creation(self):
        """Principal can invite teachers for own campus only; teacher gets 403."""
        self.client.force_authenticate(user=self.principal)
        # Principal creating teacher on Campus B -> forbidden or not found (out-of-scope)
        res = self.client.post('/api/v1/staff/', {
            'first_name': 'T', 'last_name': 'B', 'email': 'tb@test.org',
            'school': self.campus_b.id, 'role': 'teacher', 'teacher_type': 'subject_teacher',
            'assign_later': True, 'position': 'Teacher', 'salary': '30000.00'
        }, format='json')
        self.assertIn(res.status_code, (403, 404))

        # Principal creating teacher on own campus A -> succeeds
        res2 = self.client.post('/api/v1/staff/', {
            'first_name': 'T', 'last_name': 'A', 'email': 'ta@test.org',
            'school': self.campus_a.id, 'role': 'teacher', 'teacher_type': 'subject_teacher',
            'assign_later': True, 'position': 'Teacher', 'salary': '30000.00'
        }, format='json')
        self.assertEqual(res2.status_code, 201)

        # Teacher attempting to create staff -> 403
        teacher_user = User.objects.get(email='ta@test.org')
        self.client.force_authenticate(user=teacher_user)
        res3 = self.client.post('/api/v1/staff/', {
            'first_name': 'X', 'last_name': 'Y', 'email': 'xy@test.org',
            'school': self.campus_a.id, 'role': 'teacher', 'teacher_type': 'subject_teacher',
            'assign_later': True, 'position': 'Teacher', 'salary': '30000.00'
        }, format='json')
        self.assertEqual(res3.status_code, 403)

    # =========================================================================
    # PART 3 TESTS — Server-side Scope & Data Minimization
    # =========================================================================
    def test_subject_teacher_limited_student_profile(self):
        """Subject teacher only receives limited student profile (data minimization)."""
        math_teacher = User.objects.create_user(
            username='mathteacher@test.org', email='mathteacher@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        TeachingAssignment.objects.create(
            school=self.campus_a, teacher=math_teacher, school_class=self.class_8a,
            subject=self.math_a, start_date=date(2026, 1, 1)
        )

        self.client.force_authenticate(user=math_teacher)
        res = self.client.get('/api/v1/students/')
        self.assertEqual(res.status_code, 200)
        results = res.json()['results']
        # Sees 8A student Bob, but NOT 7A Alice or 8B Charlie
        self.assertEqual(len(results), 1)
        student_data = results[0]
        self.assertEqual(student_data['admission_number'], 'ADM-801')
        self.assertEqual(student_data['first_name'], 'Bob')
        # SENSITIVE FIELDS STRIPPED / ABSENT
        self.assertNotIn('father_name', student_data)
        self.assertNotIn('mother_name', student_data)
        self.assertNotIn('guardian_phone', student_data)
        self.assertNotIn('date_of_birth', student_data)
        self.assertNotIn('guardians', student_data)

    def test_class_teacher_full_student_profile(self):
        """Class teacher of 7A receives full student profile for 7A students."""
        class_teacher = User.objects.create_user(
            username='classteacher@test.org', email='classteacher@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        ClassTeacherAssignment.objects.create(
            school_class=self.class_7a, teacher=class_teacher, start_date=date(2026, 1, 1)
        )

        self.client.force_authenticate(user=class_teacher)
        res = self.client.get('/api/v1/students/')
        self.assertEqual(res.status_code, 200)
        results = res.json()['results']
        self.assertEqual(len(results), 1)
        student_data = results[0]
        self.assertEqual(student_data['admission_number'], 'ADM-701')
        # FULL PROFILE PRESENT
        self.assertEqual(student_data['father_name'], 'John Smith')
        self.assertEqual(student_data['mother_name'], 'Mary Smith')
        self.assertEqual(student_data['guardian_phone'], '1234567890')
        self.assertEqual(student_data['date_of_birth'], '2013-05-10')

    def test_mixed_teacher_isolation_across_classes(self):
        """Teacher who is class teacher of 7A and subject teacher of 8A gets full profile in 7A, limited in 8A."""
        mixed_teacher = User.objects.create_user(
            username='mixed2@test.org', email='mixed2@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        ClassTeacherAssignment.objects.create(
            school_class=self.class_7a, teacher=mixed_teacher, start_date=date(2026, 1, 1)
        )
        TeachingAssignment.objects.create(
            school=self.campus_a, teacher=mixed_teacher, school_class=self.class_8a,
            subject=self.math_a, start_date=date(2026, 1, 1)
        )

        self.client.force_authenticate(user=mixed_teacher)
        res = self.client.get('/api/v1/students/')
        self.assertEqual(res.status_code, 200)
        results = res.json()['results']
        self.assertEqual(len(results), 2)

        data_7a = next(r for r in results if r['admission_number'] == 'ADM-701')
        data_8a = next(r for r in results if r['admission_number'] == 'ADM-801')

        # 7A student has father_name
        self.assertEqual(data_7a.get('father_name'), 'John Smith')
        # 8A student has father_name stripped
        self.assertNotIn('father_name', data_8a)

    def test_marks_and_assessment_isolation(self):
        """Subject teacher can only see and enter marks for their assigned subject."""
        math_teacher = User.objects.create_user(
            username='mathonly@test.org', email='mathonly@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        TeachingAssignment.objects.create(
            school=self.campus_a, teacher=math_teacher, school_class=self.class_8a,
            subject=self.math_a, start_date=date(2026, 1, 1)
        )

        # Assessments: one Math, one Science
        asm_math = Assessment.objects.create(
            school_class=self.class_8a, subject=self.math_a, title='Math Quiz 1',
            date=date(2026, 3, 1), max_marks=Decimal('50.00'), weight=Decimal('1.00'),
            created_by=math_teacher
        )
        asm_science = Assessment.objects.create(
            school_class=self.class_8a, subject=self.science_a, title='Science Quiz 1',
            date=date(2026, 3, 1), max_marks=Decimal('50.00'), weight=Decimal('1.00')
        )
        Grade.objects.create(assessment=asm_math, student=self.student_8a_1, marks=Decimal('45.00'))
        Grade.objects.create(assessment=asm_science, student=self.student_8a_1, marks=Decimal('35.00'))

        self.client.force_authenticate(user=math_teacher)
        # Can see Math assessment, cannot see Science assessment
        res_asm = self.client.get('/api/v1/assessments/')
        self.assertEqual(res_asm.status_code, 200)
        self.assertEqual(len(res_asm.json()['results']), 1)
        self.assertEqual(res_asm.json()['results'][0]['id'], asm_math.id)

        # Direct access to Science assessment -> 404
        res_sci = self.client.get(f'/api/v1/assessments/{asm_science.id}/')
        self.assertEqual(res_sci.status_code, 404)

        # Grades: only sees Math grade
        res_grd = self.client.get('/api/v1/grades/')
        self.assertEqual(res_grd.status_code, 200)
        self.assertEqual(len(res_grd.json()['results']), 1)
        self.assertEqual(res_grd.json()['results'][0]['assessment'], asm_math.id)

        # Attempt to create assessment for unassigned subject -> 403
        res_bad_asm = self.client.post('/api/v1/assessments/', {
            'school_class': self.class_8a.id,
            'subject': self.science_a.id,
            'title': 'Illegal Science Exam',
            'date': '2026-04-01',
            'max_marks': '50.00',
            'weight': '1.00'
        }, format='json')
        self.assertEqual(res_bad_asm.status_code, 403)

    def test_attendance_register_isolation(self):
        """Only Class Teacher can mark the daily register; subject teacher cannot."""
        math_teacher = User.objects.create_user(
            username='mathatt@test.org', email='mathatt@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        TeachingAssignment.objects.create(
            school=self.campus_a, teacher=math_teacher, school_class=self.class_8a,
            subject=self.math_a, start_date=date(2026, 1, 1)
        )

        self.client.force_authenticate(user=math_teacher)
        # Attempt to mark daily attendance as subject teacher -> 403
        res = self.client.post('/api/v1/attendance/', {
            'student': self.student_8a_1.id,
            'school_class': self.class_8a.id,
            'date': '2026-05-01',
            'status': 'present'
        }, format='json')
        self.assertEqual(res.status_code, 403)

        # Class teacher can mark daily attendance
        class_teacher = User.objects.create_user(
            username='classatt@test.org', email='classatt@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        ClassTeacherAssignment.objects.create(
            school_class=self.class_8a, teacher=class_teacher, start_date=date(2026, 1, 1)
        )
        self.client.force_authenticate(user=class_teacher)
        res2 = self.client.post('/api/v1/attendance/', {
            'student': self.student_8a_1.id,
            'school_class': self.class_8a.id,
            'date': '2026-05-01',
            'status': 'present'
        }, format='json')
        self.assertEqual(res2.status_code, 201)

    def test_teacher_forbidden_routes_leak_harness(self):
        """Leak harness: verify that a teacher gets 403 or 404 across all forbidden areas."""
        teacher = User.objects.create_user(
            username='leakcheck@test.org', email='leakcheck@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        TeachingAssignment.objects.create(
            school=self.campus_a, teacher=teacher, school_class=self.class_8a,
            subject=self.math_a, start_date=date(2026, 1, 1)
        )

        self.client.force_authenticate(user=teacher)

        forbidden_endpoints = [
            # Finance
            '/api/v1/finance/summary/',
            '/api/v1/finance/categories/',
            '/api/v1/finance/entries/',
            # Fees
            '/api/v1/fees/summary/',
            '/api/v1/fees/defaulters/',
            '/api/v1/fees/structures/',
            # Salaries
            '/api/v1/salaries/structures/',
            '/api/v1/salaries/summary/',
            '/api/v1/salaries/sheet/',
            # Staff directory
            '/api/v1/staff/',
            '/api/v1/teachers/',
            # Audit log
            '/api/v1/audit/',
            # School-wide / Org reports
            '/api/v1/reports/overview/',
            f'/api/v1/reports/campus/{self.campus_a.id}/',
            # Out of scope class/campus
            f'/api/v1/classes/{self.class_b_10.id}/',
        ]

        for ep in forbidden_endpoints:
            res = self.client.get(ep)
            self.assertIn(res.status_code, (403, 404), f"Endpoint {ep} returned {res.status_code} instead of 403/404")

    # =========================================================================
    # PART 4 TESTS — Teacher Portal Dashboard Endpoints
    # =========================================================================
    def test_teacher_dashboard_endpoint(self):
        """Teacher dashboard returns KPIs, assignment cards, coverage, and tasks."""
        teacher = User.objects.create_user(
            username='dashcheck@test.org', email='dashcheck@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        ClassTeacherAssignment.objects.create(
            school_class=self.class_7a, teacher=teacher, start_date=date(2026, 1, 1)
        )
        TeachingAssignment.objects.create(
            school=self.campus_a, teacher=teacher, school_class=self.class_8a,
            subject=self.math_a, start_date=date(2026, 1, 1)
        )

        self.client.force_authenticate(user=teacher)
        res = self.client.get('/api/v1/teacher/dashboard/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['has_assignments'])
        self.assertEqual(data['teacher_type'], 'both')
        self.assertEqual(len(data['assignments']), 2)
        self.assertIn('tasks', data)
        self.assertIn('kpis', data)

    def test_teacher_my_class_endpoint(self):
        """My Class endpoint shows full details for class teachers, denies subject-only teachers."""
        class_teacher = User.objects.create_user(
            username='myclass_ct@test.org', email='myclass_ct@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        ClassTeacherAssignment.objects.create(
            school_class=self.class_7a, teacher=class_teacher, start_date=date(2026, 1, 1)
        )

        self.client.force_authenticate(user=class_teacher)
        res = self.client.get('/api/v1/teacher/my-class/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['class_info']['id'], self.class_7a.id)
        self.assertEqual(len(data['students']), 1)
        self.assertEqual(data['students'][0]['father_name'], 'John Smith')

        # Subject only teacher -> 403
        subject_only = User.objects.create_user(
            username='subonly@test.org', email='subonly@test.org', password='Password123!',
            role='teacher', organisation=self.org, school=self.campus_a
        )
        TeachingAssignment.objects.create(
            school=self.campus_a, teacher=subject_only, school_class=self.class_8a,
            subject=self.math_a, start_date=date(2026, 1, 1)
        )
        self.client.force_authenticate(user=subject_only)
        res2 = self.client.get('/api/v1/teacher/my-class/')
        self.assertEqual(res2.status_code, 403)
