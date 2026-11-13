from datetime import date
from django.test import TestCase
from rest_framework.test import APIClient
from core.models import Organisation, School, User, SchoolClass, Subject, Assessment, Announcement, ClassTeacherAssignment, AcademicYear
from core.announcements import can_manage_announcement


class IssueFixesTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name='Test Org', allow_org_admin_student_access=True)
        self.school = School.objects.create(name='Main Campus', organisation=self.org)
        self.year = AcademicYear.objects.create(
            name='2026-2027', school=self.school,
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31)
        )
        
        self.admin = User.objects.create_user(
            username='org_admin', password='password123',
            role='organisation_admin', organisation=self.org, is_active=True
        )
        self.principal = User.objects.create_user(
            username='school_principal', password='password123',
            role='principal', school=self.school, organisation=self.org, is_active=True
        )
        self.teacher1 = User.objects.create_user(
            username='teacher_one', password='password123',
            role='teacher', school=self.school, organisation=self.org, is_active=True
        )
        self.teacher2 = User.objects.create_user(
            username='teacher_two', password='password123',
            role='teacher', school=self.school, organisation=self.org, is_active=True
        )
        self.klass = SchoolClass.objects.create(
            name='Class 8', section='A', school=self.school, academic_year=self.year
        )
        self.subject = Subject.objects.create(
            name='Mathematics', code='MTH-8', school=self.school
        )

    def test_assessment_date_editing(self):
        """Issue 1: Editing assessment date must not raise 'date is historical/immutable'."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/assessments/', {
            'title': 'Term 1 Exam',
            'school': self.school.id,
            'school_class': self.klass.id,
            'subject': self.subject.id,
            'date': '2026-05-15',
            'max_marks': 100
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        assessment_id = res.data['id']

        # Now edit the assessment and change the date
        res2 = self.client.patch(f'/api/v1/assessments/{assessment_id}/', {
            'date': '2026-05-20',
            'title': 'Term 1 Exam (Rescheduled)'
        }, format='json')
        self.assertEqual(res2.status_code, 200, res2.data)
        self.assertEqual(str(res2.data['date']), '2026-05-20')

    def test_announcements_role_hierarchy(self):
        """Issue 3: Strict role hierarchy on announcements.
        - Principal CANNOT edit/delete Admin announcement.
        - Principal CAN edit/delete Teacher announcement.
        - Teacher can ONLY edit/delete own announcement.
        """
        # Admin creates announcement
        admin_ann = Announcement.objects.create(
            school=self.school, title='Admin Announcement',
            content='Institutional Notice', target_role='all',
            created_by=self.admin
        )
        # Teacher creates announcement
        teacher_ann = Announcement.objects.create(
            school=self.school, title='Teacher Announcement',
            content='Homework update', target_role='students',
            created_by=self.teacher1
        )

        # 1. Admin can manage both
        self.assertTrue(can_manage_announcement(self.admin, admin_ann))
        self.assertTrue(can_manage_announcement(self.admin, teacher_ann))

        # 2. Principal CANNOT manage admin's announcement
        self.assertFalse(can_manage_announcement(self.principal, admin_ann))

        # 3. Principal CAN manage teacher's announcement
        self.assertTrue(can_manage_announcement(self.principal, teacher_ann))

        # 4. Teacher1 can manage their own announcement
        self.assertTrue(can_manage_announcement(self.teacher1, teacher_ann))

        # 5. Teacher2 CANNOT manage Teacher1's announcement
        self.assertFalse(can_manage_announcement(self.teacher2, teacher_ann))

        # 6. API call: Principal attempts to delete Admin announcement -> 403 Forbidden
        self.client.force_authenticate(user=self.principal)
        del_res = self.client.delete(f'/api/v1/announcements/{admin_ann.id}/')
        self.assertEqual(del_res.status_code, 403)

        # 7. API call: Principal deletes Teacher announcement -> 200 OK
        del_res2 = self.client.delete(f'/api/v1/announcements/{teacher_ann.id}/')
        self.assertEqual(del_res2.status_code, 200)

    def test_class_teacher_sync_and_dropdown(self):
        """Issue 4: Class teacher assignment and CTA bidirectional synchronization."""
        # Check teachers list query
        self.client.force_authenticate(user=self.admin)
        t_res = self.client.get(f'/api/v1/teachers/?school={self.school.id}')
        self.assertEqual(t_res.status_code, 200)
        self.assertGreaterEqual(len(t_res.data['results']), 2)

        # Initial class has no teacher
        c_res = self.client.get(f'/api/v1/classes/{self.klass.id}/')
        self.assertEqual(c_res.data['teacher_name'], 'Unassigned')

        # Edit class to assign teacher1
        patch_res = self.client.patch(f'/api/v1/classes/{self.klass.id}/', {
            'teacher': self.teacher1.id
        }, format='json')
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data['teacher_name'], self.teacher1.get_full_name() or self.teacher1.username)

        # Verify ClassTeacherAssignment was automatically created in sync
        cta = ClassTeacherAssignment.objects.filter(school_class=self.klass, end_date__isnull=True).first()
        self.assertIsNotNone(cta)
        self.assertEqual(cta.teacher_id, self.teacher1.id)

        # Edit class to unassign teacher (set teacher to null)
        patch_res2 = self.client.patch(f'/api/v1/classes/{self.klass.id}/', {
            'teacher': None
        }, format='json')
        self.assertEqual(patch_res2.status_code, 200)
        self.assertEqual(patch_res2.data['teacher_name'], 'Unassigned')

        # Verify previous CTA was closed
        active_cta = ClassTeacherAssignment.objects.filter(school_class=self.klass, end_date__isnull=True).first()
        self.assertIsNone(active_cta)

    def test_finance_summary_metrics_and_dashboard_cases(self):
        """Test finance summary provides total_collected & remaining_to_collect, and dashboard cases include school_name."""
        from core.models import Student, ReviewCase
        student = Student.objects.create(
            school=self.school, first_name='Aarav', last_name='Khan',
            admission_number='AK-101', enrolled_on=date(2026, 1, 15)
        )
        case = ReviewCase.objects.create(
            school=self.school, student=student, title='Math Support Intervention',
            reason='Needs extra tutoring in Math', status='open', priority='high'
        )

        self.client.force_authenticate(user=self.admin)

        # 1. Dashboard API returns school_name on recent_cases
        dash_res = self.client.get('/api/v1/dashboard/')
        self.assertEqual(dash_res.status_code, 200)
        cases = dash_res.data.get('recent_cases', [])
        found_case = next((c for c in cases if c['id'] == case.id), None)
        self.assertIsNotNone(found_case)
        self.assertEqual(found_case.get('school_name'), self.school.name)

        # 2. Finance summary returns total_collected, remaining_to_collect, and total_billed
        fin_res = self.client.get('/api/v1/finance/summary/')
        self.assertEqual(fin_res.status_code, 200)
        self.assertIn('total_collected', fin_res.data)
        self.assertIn('remaining_to_collect', fin_res.data)
        self.assertIn('total_billed', fin_res.data)

