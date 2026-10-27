from decimal import Decimal
from django.test import TestCase
from core.models import Organisation, School, User, RolePermission, AuditEvent
from core.services.permissions import (
    has_role_permission,
    get_effective_permissions,
    get_default_permissions_for_role,
    update_role_permissions,
    reset_role_permissions,
)


class RolePermissionsTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name='Federal Trust', code='fed-trust')
        self.s1 = School.objects.create(organisation=self.org, name='Main Campus', code='MC')
        self.s2 = School.objects.create(organisation=self.org, name='North Campus', code='NC')

        self.superuser = User.objects.create_superuser('super', 's@inst.org', 'Pass1234!')
        self.org_admin = User.objects.create_user('org_admin', 'oa@inst.org', 'Pass1234!', role='organisation_admin', organisation=self.org)
        self.school_admin = User.objects.create_user('sch_admin', 'sa@inst.org', 'Pass1234!', role='school_admin', organisation=self.org, school=self.s1)
        self.teacher = User.objects.create_user('teacher1', 't@inst.org', 'Pass1234!', role='teacher', organisation=self.org, school=self.s1)
        self.student = User.objects.create_user('student1', 'st@inst.org', 'Pass1234!', role='student', organisation=self.org, school=self.s1)
        self.parent = User.objects.create_user('parent1', 'p@inst.org', 'Pass1234!', role='parent', organisation=self.org)

    def _call(self, user, path, method='get', data=None):
        self.client.force_login(user)
        func = getattr(self.client, method.lower())
        url = f'/api/v1/{path.lstrip("/")}'
        if method.lower() in ('post', 'patch', 'put'):
            return func(url, data=data or {}, content_type='application/json')
        return func(url, data or {})

    def test_default_permissions_match_documented_roles(self):
        """Verify standard baseline permissions for core roles."""
        teacher_defaults = get_default_permissions_for_role('teacher')
        self.assertTrue(teacher_defaults['attendance.record'])
        self.assertTrue(teacher_defaults['assessments.create'])
        self.assertTrue(teacher_defaults['grades.enter'])
        self.assertTrue(teacher_defaults['materials.upload'])
        # Teachers should not have financial approval or student deletion by default
        self.assertFalse(teacher_defaults['fees.approve'])
        self.assertFalse(teacher_defaults['students.delete'])
        self.assertFalse(teacher_defaults['finance.expense_create'])

        student_defaults = get_default_permissions_for_role('student')
        self.assertTrue(student_defaults['students.view'])
        self.assertTrue(student_defaults['homework.submit'])
        self.assertTrue(student_defaults['materials.view'])
        self.assertFalse(student_defaults['grades.enter'])
        self.assertFalse(student_defaults['fees.approve'])

        admin_defaults = get_default_permissions_for_role('school_admin')
        self.assertTrue(admin_defaults['students.create'])
        self.assertTrue(admin_defaults['fees.approve'])
        self.assertTrue(admin_defaults['finance.view'])
        self.assertTrue(admin_defaults['permissions.manage'])

    def test_permissions_catalog_endpoint_access_control(self):
        """Admins can retrieve the catalog; teachers and students receive 403 Forbidden."""
        # 1. School Admin succeeds
        res_admin = self._call(self.school_admin, 'permissions/')
        self.assertEqual(res_admin.status_code, 200)
        data = res_admin.json()
        self.assertTrue(data['success'])
        self.assertIn('roles', data)
        self.assertIn('modules', data)
        self.assertIn('effective_by_role', data)
        self.assertEqual(len(data['roles']), 6)

        # 2. Org Admin succeeds
        res_org = self._call(self.org_admin, 'permissions/')
        self.assertEqual(res_org.status_code, 200)

        # 3. Superuser succeeds
        res_super = self._call(self.superuser, 'permissions/')
        self.assertEqual(res_super.status_code, 200)

        # 4. Teacher blocked (403)
        res_teacher = self._call(self.teacher, 'permissions/')
        self.assertEqual(res_teacher.status_code, 403)

        # 5. Student blocked (403)
        res_student = self._call(self.student, 'permissions/')
        self.assertEqual(res_student.status_code, 403)

    def test_custom_permission_override_and_persistence(self):
        """Admin can grant or revoke specific permissions for a role, persisting overrides."""
        # Baseline check
        self.assertFalse(has_role_permission(self.teacher, 'fees.collect'))

        # Grant fees.collect to teacher for school s1
        res = self._call(self.school_admin, 'permissions/', method='post', data={
            'role': 'teacher',
            'permissions': {
                'fees.collect': True,
                'students.delete': True,
            },
            'school': self.s1.id
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['role'], 'teacher')

        # Verify RolePermission records created in DB
        rp = RolePermission.objects.filter(school=self.s1, role='teacher', permission_key='fees.collect').first()
        self.assertIsNotNone(rp)
        self.assertTrue(rp.granted)

        # Helper now reports True for teacher in school s1
        self.assertTrue(has_role_permission(self.teacher, 'fees.collect'))
        self.assertTrue(has_role_permission(self.teacher, 'students.delete'))

        # Check effective permissions via GET endpoint
        res_get = self._call(self.school_admin, f'permissions/?school={self.s1.id}')
        teacher_effective = res_get.json()['effective_by_role']['teacher']
        self.assertTrue(teacher_effective['fees.collect'])
        self.assertTrue(teacher_effective['students.delete'])
        self.assertGreater(res_get.json()['override_counts']['teacher'], 0)

        # Check audit event was recorded
        audit = AuditEvent.objects.filter(action='update_role_permissions').order_by('-created_at').first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.school_admin)

    def test_reset_permissions_to_defaults(self):
        """Admin can reset a role's permissions back to standard defaults."""
        # 1. First add an override
        RolePermission.objects.create(school=self.s1, role='teacher', permission_key='fees.approve', granted=True)
        self.assertTrue(has_role_permission(self.teacher, 'fees.approve'))

        # 2. Call reset endpoint
        res = self._call(self.school_admin, 'permissions/reset/', method='post', data={
            'role': 'teacher',
            'school': self.s1.id
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['overrides_cleared'], 1)

        # 3. Verify override deleted and permission reverted to default False
        self.assertFalse(RolePermission.objects.filter(school=self.s1, role='teacher', permission_key='fees.approve').exists())
        self.assertFalse(has_role_permission(self.teacher, 'fees.approve'))
