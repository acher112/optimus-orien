import json
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from core.models import (
    Organisation, School, SchoolClass, Subject, ClassSubject,
    AcademicYear, Student, Enrollment, User, StaffMember,
    ClassTeacherAssignment, TeachingAssignment, Attendance,
    Assessment, Grade, Homework, HomeworkSubmission, Observation,
    GuardianProfile, GuardianRelationship, ParentNotificationPreference,
    ParentRiskAlert, ParentCallbackRequest, AuditEvent, Notification
)
from core.services.guardian_crypto import (
    encrypt_identity_number, decrypt_identity_number, compute_identity_hash,
    validate_cnic, normalize_mobile
)
from core.services.parent_risk_notifications import evaluate_student_risk_alerts


class ParentPortalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()

        # Organisation & Campuses
        self.org = Organisation.objects.create(name='Global Academy Trust')
        self.school1 = School.objects.create(
            organisation=self.org, name='North Campus', code='NC',
            parent_risk_notification_mode='auto',
            show_teacher_contact_to_parents=False,
            parents_can_view_fees=True,
            aqi_min_group_size=5
        )
        self.school2 = School.objects.create(
            organisation=self.org, name='South Campus', code='SC',
            parent_risk_notification_mode='auto',
            show_teacher_contact_to_parents=True
        )

        self.ay1 = AcademicYear.objects.create(
            school=self.school1, name='2026-2027',
            start_date=self.today - timedelta(days=60),
            end_date=self.today + timedelta(days=200),
            active=True
        )
        self.ay2 = AcademicYear.objects.create(
            school=self.school2, name='2026-2027',
            start_date=self.today - timedelta(days=60),
            end_date=self.today + timedelta(days=200),
            active=True
        )

        self.class1 = SchoolClass.objects.create(
            school=self.school1, academic_year=self.ay1, name='Grade 8', section='A'
        )
        self.class2 = SchoolClass.objects.create(
            school=self.school2, academic_year=self.ay2, name='Grade 7', section='B'
        )

        self.math = Subject.objects.create(school=self.school1, name='Mathematics', code='MATH')
        self.science = Subject.objects.create(school=self.school1, name='Science', code='SCI')

        ClassSubject.objects.create(school_class=self.class1, subject=self.math, required=True)
        ClassSubject.objects.create(school_class=self.class1, subject=self.science, required=True)

        # Users
        self.admin = User.objects.create_superuser(
            username='admin_boss', password='AdminPassword123!', email='admin@test.com',
            role='organisation_admin', organisation=self.org
        )
        self.principal1 = User.objects.create_user(
            username='principal_nc', password='PrincipalPassword123!', email='principal_nc@test.com',
            role='principal', organisation=self.org, school=self.school1
        )
        self.principal2 = User.objects.create_user(
            username='principal_sc', password='PrincipalPassword123!', email='principal_sc@test.com',
            role='principal', organisation=self.org, school=self.school2
        )
        self.teacher1 = User.objects.create_user(
            username='teacher_math', password='TeacherPassword123!', email='math_t@test.com',
            role='teacher', organisation=self.org, school=self.school1
        )
        self.student_user = User.objects.create_user(
            username='student_user', password='StudentPassword123!', email='student@test.com',
            role='student', organisation=self.org, school=self.school1
        )

        # Assignments
        ClassTeacherAssignment.objects.create(
            school_class=self.class1, teacher=self.teacher1, start_date=self.today - timedelta(days=30)
        )
        TeachingAssignment.objects.create(
            school=self.school1, school_class=self.class1, subject=self.math, teacher=self.teacher1,
            start_date=self.today - timedelta(days=30)
        )

        # Students
        # Campus 1 students: Child 1, Child 2, Classmate
        self.child1 = Student.objects.create(
            school=self.school1, first_name='Zaid', last_name='Khan',
            admission_number='NC-001', gender='male', enrolled_on=self.today
        )
        Enrollment.objects.create(student=self.child1, school_class=self.class1, start_date=self.today - timedelta(days=30))

        self.child2 = Student.objects.create(
            school=self.school1, first_name='Amina', last_name='Khan',
            admission_number='NC-002', gender='female', enrolled_on=self.today
        )
        Enrollment.objects.create(student=self.child2, school_class=self.class1, start_date=self.today - timedelta(days=30))

        self.classmate = Student.objects.create(
            school=self.school1, first_name='Bilal', last_name='Ahmed',
            admission_number='NC-003', gender='male', enrolled_on=self.today
        )
        Enrollment.objects.create(student=self.classmate, school_class=self.class1, start_date=self.today - timedelta(days=30))

        # Campus 2 student (other campus): Child 3
        self.other_campus_child = Student.objects.create(
            school=self.school2, first_name='Sara', last_name='Qureshi',
            admission_number='SC-001', gender='female', enrolled_on=self.today
        )
        Enrollment.objects.create(student=self.other_campus_child, school_class=self.class2, start_date=self.today - timedelta(days=30))

    def test_crypto_cnic_validation_and_masking(self):
        """Validates Pakistani CNIC 13 digits, encryption/decryption, and masking."""
        raw_cnic = "42101-1234567-1"
        clean = validate_cnic(raw_cnic)
        self.assertEqual(clean, "4210112345671")

        encrypted = encrypt_identity_number(clean)
        decrypted = decrypt_identity_number(encrypted)
        self.assertEqual(decrypted, "4210112345671")

        h1 = compute_identity_hash('cnic', clean)
        h2 = compute_identity_hash('cnic', raw_cnic)
        self.assertEqual(h1, h2)

    def test_principal_registers_parent_with_multiple_children(self):
        """Principal can register a parent linking multiple students in their own campus."""
        self.client.force_authenticate(user=self.principal1)

        payload = {
            'student_ids': [self.child1.id, self.child2.id],
            'first_name': 'Tariq',
            'last_name': 'Khan',
            'email': 'tariq.khan@test.com',
            'mobile': '+923001234567',
            'identity_type': 'cnic',
            'identity_number': '35201-1234567-3',
            'relationship_type': 'father',
            'is_primary': True,
            'is_verified': True,
            'issue_temporary_password': True,
            'permissions': {
                'can_view_academics': True,
                'can_view_attendance': True,
                'can_view_homework': True,
                'can_view_fees': True,
                'receive_notifications': True,
            }
        }

        resp = self.client.post('/api/v1/parents/register/', data=payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        data = resp.data
        self.assertTrue(data['ok'])
        self.assertEqual(data['children_linked'], 2)
        self.assertIn('credentials_receipt', data)
        self.assertIn('temporary_password', data['credentials_receipt'])

        # Verify GuardianProfile created
        guardian = GuardianProfile.objects.get(email='tariq.khan@test.com')
        self.assertEqual(guardian.identity_last4, '5673')
        self.assertTrue(guardian.masked_identity.endswith('3'))

        # Verify relationships created
        rels = GuardianRelationship.objects.filter(guardian=guardian)
        self.assertEqual(rels.count(), 2)
        self.assertEqual(set(rels.values_list('student_id', flat=True)), {self.child1.id, self.child2.id})

    def test_principal_cannot_register_student_from_another_campus(self):
        """Principal cannot register a student who belongs to another campus."""
        self.client.force_authenticate(user=self.principal1)

        payload = {
            'student_ids': [self.child1.id, self.other_campus_child.id],  # other_campus_child is in school2
            'first_name': 'Imran',
            'last_name': 'Ali',
            'email': 'imran.ali@test.com',
            'mobile': '+923009876543',
            'identity_type': 'cnic',
            'identity_number': '35201-9876543-1',
            'relationship_type': 'father',
            'is_verified': True
        }

        resp = self.client.post('/api/v1/parents/register/', data=payload, format='json')
        # Out-of-scope student raises 404 or 403
        self.assertIn(resp.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_teachers_and_students_cannot_register_parents(self):
        """Teachers and students receive 403 Forbidden when attempting parent registration."""
        self.client.force_authenticate(user=self.teacher1)
        resp = self.client.post('/api/v1/parents/register/', data={}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.student_user)
        resp = self.client.post('/api/v1/parents/register/', data={}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_duplicate_check_and_linking(self):
        """Duplicate check endpoint detects existing parent by CNIC or mobile and masks info."""
        self.client.force_authenticate(user=self.principal1)

        # Register parent 1
        reg_payload = {
            'student_ids': [self.child1.id],
            'first_name': 'Naveed',
            'last_name': 'Akram',
            'email': 'naveed@test.com',
            'mobile': '+923211234567',
            'identity_type': 'cnic',
            'identity_number': '35201-5555555-5',
            'is_verified': True
        }
        self.client.post('/api/v1/parents/register/', data=reg_payload, format='json')

        # Check duplicate with same CNIC
        check_resp = self.client.post('/api/v1/parents/check-duplicate/', data={
            'identity_type': 'cnic',
            'identity_number': '35201-5555555-5'
        }, format='json')

        self.assertEqual(check_resp.status_code, status.HTTP_200_OK)
        dup_data = check_resp.data
        self.assertTrue(dup_data['is_duplicate'])
        self.assertIn('match', dup_data)
        # Ensure masked output
        self.assertTrue('****' in dup_data['match']['masked_name'] or '*' in dup_data['match']['masked_identity'])

    def test_reveal_identity_audited(self):
        """Principal can reveal identity for own student's parent, strictly audited."""
        self.client.force_authenticate(user=self.principal1)

        reg_payload = {
            'student_ids': [self.child1.id],
            'first_name': 'Kashif',
            'last_name': 'Mehmood',
            'email': 'kashif@test.com',
            'mobile': '+923331112233',
            'identity_type': 'cnic',
            'identity_number': '35201-7777777-7',
            'is_verified': True
        }
        reg_resp = self.client.post('/api/v1/parents/register/', data=reg_payload, format='json')
        guardian_id = reg_resp.data['guardian_id']

        # Reveal
        rev_resp = self.client.post(f'/api/v1/parents/{guardian_id}/reveal-identity/', format='json')
        self.assertEqual(rev_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(rev_resp.data['identity_number'], '3520177777777')

        # Check audit event
        audit = AuditEvent.objects.filter(
            actor=self.principal1,
            action='reveal_parent_identity'
        ).first()
        self.assertIsNotNone(audit)

    def test_golden_rule_parent_sees_only_own_children(self):
        """Parent sees ONLY linked children. Access to classmate or other student returns 404."""
        self.client.force_authenticate(user=self.principal1)

        reg_payload = {
            'student_ids': [self.child1.id],
            'first_name': 'Usman',
            'last_name': 'Raza',
            'email': 'usman.raza@test.com',
            'mobile': '+923004445566',
            'identity_type': 'cnic',
            'identity_number': '35201-4445566-1',
            'is_verified': True,
            'issue_temporary_password': True
        }
        reg_resp = self.client.post('/api/v1/parents/register/', data=reg_payload, format='json')
        parent_user_id = reg_resp.data['user_id']
        parent_user = User.objects.get(id=parent_user_id)

        # Authenticate as parent
        self.client.force_authenticate(user=parent_user)

        # 1. Family Home: Should have exactly 1 child (child1)
        home_resp = self.client.get('/api/v1/parent/home/')
        self.assertEqual(home_resp.status_code, status.HTTP_200_OK)
        children = home_resp.data['children']
        self.assertEqual(len(children), 1)
        self.assertEqual(children[0]['id'], self.child1.id)

        # 2. Child 1 overview: 200 OK
        c1_resp = self.client.get(f'/api/v1/parent/children/{self.child1.id}/overview/')
        self.assertEqual(c1_resp.status_code, status.HTTP_200_OK)

        # 3. Classmate overview: MUST be 404 NotFound
        classmate_resp = self.client.get(f'/api/v1/parent/children/{self.classmate.id}/overview/')
        self.assertEqual(classmate_resp.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Other campus student overview: MUST be 404 NotFound
        other_resp = self.client.get(f'/api/v1/parent/children/{self.other_campus_child.id}/overview/')
        self.assertEqual(other_resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_revocation_immediately_cuts_access(self):
        """Revoking a parent relationship immediately causes 404 on child endpoints."""
        self.client.force_authenticate(user=self.principal1)

        reg_payload = {
            'student_ids': [self.child1.id],
            'first_name': 'Waqas',
            'last_name': 'Sheikh',
            'email': 'waqas@test.com',
            'mobile': '+923008889900',
            'identity_type': 'cnic',
            'identity_number': '35201-8889900-1',
            'is_verified': True
        }
        reg_resp = self.client.post('/api/v1/parents/register/', data=reg_payload, format='json')
        guardian_id = reg_resp.data['guardian_id']
        parent_user = User.objects.get(id=reg_resp.data['user_id'])

        rel = GuardianRelationship.objects.get(guardian_id=guardian_id, student=self.child1)

        # Verify access works initially
        self.client.force_authenticate(user=parent_user)
        resp1 = self.client.get(f'/api/v1/parent/children/{self.child1.id}/overview/')
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        # Principal revokes relationship
        self.client.force_authenticate(user=self.principal1)
        revoke_resp = self.client.post(
            f'/api/v1/parents/{guardian_id}/revoke-relationship/{rel.id}/',
            data={'reason': 'Custody order'},
            format='json'
        )
        self.assertEqual(revoke_resp.status_code, status.HTTP_200_OK)

        # Parent tries to access child again -> MUST be 404 NotFound
        self.client.force_authenticate(user=parent_user)
        resp2 = self.client.get(f'/api/v1/parent/children/{self.child1.id}/overview/')
        self.assertEqual(resp2.status_code, status.HTTP_404_NOT_FOUND)

    def test_parent_results_and_aqi_histogram(self):
        """Results tab returns Level 5 profile, aggregate-only benchmarks, and class histogram."""
        self.client.force_authenticate(user=self.principal1)

        # Create assessment and grades
        ass = Assessment.objects.create(
            school_class=self.class1, subject=self.math, title='Midterm Exam',
            date=self.today - timedelta(days=10), max_marks=100, published=True
        )
        Grade.objects.create(student=self.child1, assessment=ass, marks=85)
        Grade.objects.create(student=self.child2, assessment=ass, marks=75)
        Grade.objects.create(student=self.classmate, assessment=ass, marks=60)

        # Register parent
        reg_resp = self.client.post('/api/v1/parents/register/', data={
            'student_ids': [self.child1.id],
            'first_name': 'Rashid',
            'last_name': 'Latif',
            'email': 'rashid@test.com',
            'mobile': '+923007771122',
            'identity_type': 'cnic',
            'identity_number': '35201-7771122-3',
            'is_verified': True
        }, format='json')
        parent_user = User.objects.get(id=reg_resp.data['user_id'])

        self.client.force_authenticate(user=parent_user)
        res = self.client.get(f'/api/v1/parent/children/{self.child1.id}/results/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertIn('overall_percentage', data)
        self.assertIn('histogram', data)
        self.assertIn('color_palette', data)
        self.assertEqual(data['color_palette']['child'], '#6b7280')
        self.assertEqual(data['color_palette']['boys'], '#3b82f6')
        self.assertEqual(data['color_palette']['girls'], '#ec4899')

    def test_parent_risk_alert_generation_and_acknowledgment(self):
        """Attendance drop triggers risk alert; parent can acknowledge in portal."""
        # 1. Register parent for child1
        self.client.force_authenticate(user=self.principal1)
        reg_resp = self.client.post('/api/v1/parents/register/', data={
            'student_ids': [self.child1.id],
            'first_name': 'Hamza',
            'last_name': 'Farooq',
            'email': 'hamza@test.com',
            'mobile': '+923001119988',
            'identity_type': 'cnic',
            'identity_number': '35201-1119988-1',
            'is_verified': True
        }, format='json')
        parent_user = User.objects.get(id=reg_resp.data['user_id'])

        # 2. Add 5 absences out of 6 sessions (<80%)
        for i in range(6):
            Attendance.objects.create(
                student=self.child1, school_class=self.class1,
                date=self.today - timedelta(days=i + 1),
                status='absent' if i < 5 else 'present'
            )

        # Run risk evaluation
        alerts = evaluate_student_risk_alerts(self.child1)
        self.assertTrue(len(alerts) > 0)
        alert = alerts[0]
        self.assertEqual(alert.alert_type, 'attendance')
        self.assertEqual(alert.status, 'active')

        # 3. Parent views and acknowledges alert
        self.client.force_authenticate(user=parent_user)
        ack_resp = self.client.post(f'/api/v1/parent/alerts/{alert.id}/acknowledge/')
        self.assertEqual(ack_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ack_resp.data['status'], 'acknowledged')

        alert.refresh_from_db()
        self.assertEqual(alert.status, 'acknowledged')
        self.assertIsNotNone(alert.acknowledged_at)

    def test_parent_callback_request_notifies_teacher(self):
        """Parent requesting a call-back creates callback object and in-app teacher notification."""
        self.client.force_authenticate(user=self.principal1)
        reg_resp = self.client.post('/api/v1/parents/register/', data={
            'student_ids': [self.child1.id],
            'first_name': 'Salman',
            'last_name': 'Butt',
            'email': 'salman@test.com',
            'mobile': '+923002223344',
            'identity_type': 'cnic',
            'identity_number': '35201-2223344-5',
            'is_verified': True
        }, format='json')
        parent_user = User.objects.get(id=reg_resp.data['user_id'])

        self.client.force_authenticate(user=parent_user)
        cb_payload = {
            'teacher_id': self.teacher1.id,
            'topic': 'academic',
            'preferred_time': 'morning',
            'message': 'Would like to discuss Mathematics homework progress.'
        }
        cb_resp = self.client.post(f'/api/v1/parent/children/{self.child1.id}/callback-request/', data=cb_payload, format='json')
        self.assertEqual(cb_resp.status_code, status.HTTP_201_CREATED)

        # Check notification delivered to teacher
        notif = Notification.objects.filter(user=self.teacher1, title__icontains='Call-back Request').first()
        self.assertIsNotNone(notif)
        self.assertIn(self.child1.full_name, notif.title)
