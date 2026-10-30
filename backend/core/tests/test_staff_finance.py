"""Staff and Finance tests: scoping, role rules, immediate access removal, exact totals."""
from decimal import Decimal

from core.models import FinanceEntry, StaffMember, User
from core.tests.test_phase1 import AccessFixture


class StaffTests(AccessFixture):
    def setUp(self):
        super().setUp()
        self.sign(self.school_admin)
        r = self.post('staff', {'school': self.s1.id, 'first_name': 'Tariq', 'last_name': 'Ali', 'position': 'Maths Teacher',
                                'role': 'teacher', 'user': self.teacher.id})
        self.assertEqual(r.status_code, 201, r.content)
        self.t = StaffMember.objects.get(pk=r.json()['id'])

    def call(self, user, path, data=None, method='post'):
        self.sign(user)
        return getattr(self, method)(path, data or {}) if method != 'get' else self.client.get('/api/v1/' + path + '/')

    def test_add_logs_history(self):
        d = self.call(self.school_admin, f'staff/{self.t.id}', method='get').json()
        self.assertEqual([h['kind'] for h in d['history']], ['hired'])

    def test_teacher_and_student_blocked(self):
        for u in (self.teacher, self.student_user, self.parent):
            self.assertEqual(self.call(u, 'staff', method='get').status_code, 403)

    def test_scope_other_campus_and_org(self):
        other = StaffMember.objects.create(school=self.s2, first_name='S', last_name='South', position='Clerk', role='other', hired_on=self.today)
        foreign = StaffMember.objects.create(school=self.s3, first_name='F', last_name='Foreign', position='Clerk', role='other', hired_on=self.today)
        names = [x['last_name'] for x in self.call(self.principal, 'staff', method='get').json()['results']]
        self.assertEqual(names, ['Ali'])
        self.assertEqual(self.call(self.principal, f'staff/{other.id}/terminate').status_code, 404)
        self.assertEqual(self.call(self.org_admin, f'staff/{foreign.id}/terminate').status_code, 404)
        self.assertEqual(len(self.call(self.org_admin, 'staff', method='get').json()['results']), 2)
        self.assertIn(self.call(self.principal, 'staff', {'school': self.s2.id, 'first_name': 'x', 'last_name': 'y', 'position': 'p'}).status_code, (400, 404))

    def test_promote_and_assign_role_sync_login(self):
        self.assertEqual(self.call(self.school_admin, f'staff/{self.t.id}/promote', {'new_position': 'Head of Maths'}).status_code, 200)
        self.assertEqual(self.call(self.school_admin, f'staff/{self.t.id}/assign-role', {'role': 'principal'}).status_code, 200)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.role, 'principal')
        kinds = [h['kind'] for h in self.call(self.school_admin, f'staff/{self.t.id}', method='get').json()['history']]
        self.assertEqual(kinds[:2], ['role_changed', 'promoted'])

    def test_principal_cannot_grant_leadership(self):
        self.assertEqual(self.call(self.principal, f'staff/{self.t.id}/assign-role', {'role': 'school_admin'}).status_code, 403)
        self.assertEqual(self.call(self.principal, f'staff/{self.t.id}/assign-role', {'role': 'nonsense'}).status_code, 400)

    def test_terminate_removes_access_immediately_and_reinstate_restores(self):
        self.assertEqual(self.call(self.principal, f'staff/{self.t.id}/terminate', {'reason': 'Resigned'}).status_code, 200)
        self.teacher.refresh_from_db()
        self.assertFalse(self.teacher.is_active)
        self.client.logout()
        self.assertEqual(self.client.get('/api/v1/students/').status_code, 403)
        self.assertEqual(self.call(self.principal, f'staff/{self.t.id}/promote', {'new_position': 'x'}).status_code, 400)
        self.assertEqual(self.call(self.principal, f'staff/{self.t.id}/reinstate').status_code, 200)
        self.teacher.refresh_from_db()
        self.assertTrue(self.teacher.is_active)
        kinds = [h['kind'] for h in self.call(self.principal, f'staff/{self.t.id}', method='get').json()['history']]
        self.assertEqual(kinds, ['reinstated', 'terminated', 'hired'])

    def test_cannot_change_own_record(self):
        mine = StaffMember.objects.create(school=self.s1, user=self.principal, first_name='P', last_name='P', position='Principal', role='principal', hired_on=self.today)
        self.assertEqual(self.call(self.principal, f'staff/{mine.id}/terminate').status_code, 403)

    def test_history_feed_scoped_newest_first(self):
        self.call(self.school_admin, f'staff/{self.t.id}/promote', {'new_position': 'Head'})
        feed = self.call(self.principal, 'staff/history', method='get').json()['results']
        self.assertEqual(feed[0]['kind'], 'promoted')
        self.assertEqual(feed[0]['staff_name'], 'Tariq Ali')

    def test_create_staff_without_portal_account(self):
        r = self.call(self.principal, 'staff', {
            'school': self.s1.id,
            'first_name': 'Akram',
            'last_name': 'Khan',
            'position': 'Peon',
            'role': 'support',
            'salary': '25000.00',
            'create_portal_account': False
        })
        self.assertEqual(r.status_code, 201)
        data = r.json()
        self.assertFalse(data['has_login'])
        self.assertIsNone(data['username'])
        self.assertEqual(data['position'], 'Peon')
        staff_obj = StaffMember.objects.get(pk=data['id'])
        self.assertIsNone(staff_obj.user)
        self.assertTrue(staff_obj.salary_structures.filter(basic=Decimal('25000.00')).exists())
        self.assertTrue(staff_obj.salary_records.filter(basic=Decimal('25000.00')).exists())

    def test_create_staff_with_portal_account(self):
        r = self.call(self.principal, 'staff', {
            'school': self.s1.id,
            'first_name': 'Bilal',
            'last_name': 'Ahmed',
            'position': 'Office Boy',
            'role': 'support',
            'email': 'bilal.support@test.org',
            'password': 'SecurePassword123!',
            'salary': '30000.00',
            'create_portal_account': True
        })
        self.assertEqual(r.status_code, 201)
        data = r.json()
        self.assertTrue(data['has_login'])
        self.assertEqual(data['username'], 'bilal.support@test.org')
        staff_obj = StaffMember.objects.get(pk=data['id'])
        self.assertIsNotNone(staff_obj.user)
        self.assertEqual(staff_obj.user.email, 'bilal.support@test.org')

    def test_create_staff_with_portal_account_missing_email_fails(self):
        r = self.call(self.principal, 'staff', {
            'school': self.s1.id,
            'first_name': 'Bilal',
            'last_name': 'Ahmed',
            'position': 'Office Boy',
            'role': 'support',
            'salary': '30000.00',
            'create_portal_account': True
        })
        self.assertEqual(r.status_code, 400)
        self.assertIn('email', r.json())


class FinanceTests(AccessFixture):
    def cat(self, school, kind, name):
        self.sign(self.principal)
        return self.post('finance/categories', {'school': school.id, 'kind': kind, 'name': name})

    def test_roles(self):
        for u in (self.teacher, self.student_user, self.parent):
            self.sign(u)
            self.assertEqual(self.client.get('/api/v1/finance/summary/').status_code, 403)

    def test_defaults_and_custom_categories(self):
        self.sign(self.principal)
        names = [c['name'] for c in self.client.get(f'/api/v1/finance/categories/?school={self.s1.id}&kind=income').json()['results']]
        self.assertIn('Annual fees', names)
        self.assertEqual(self.cat(self.s1, 'expense', 'Transport').status_code, 201)
        self.assertEqual(self.cat(self.s1, 'expense', 'transport').status_code, 400)
        self.assertEqual(self.cat(self.s2, 'expense', 'Other').status_code, 400)   # other campus

    def test_exact_totals_and_void(self):
        self.sign(self.principal)
        self.client.get('/api/v1/finance/categories/')
        from core.models import FinanceCategory
        fee = FinanceCategory.objects.get(school=self.s1, name='Tuition fees')
        sal = FinanceCategory.objects.get(school=self.s1, name='Salaries')
        ut = FinanceCategory.objects.get(school=self.s1, name='Utilities')
        ids = []
        for cat, amt in ((fee, '1000.10'), (fee, '500.20'), (sal, '700.00'), (ut, '100.05')):
            r = self.post('finance/entries', {'category': cat.id, 'amount': amt, 'date': self.today.isoformat()})
            self.assertEqual(r.status_code, 201, r.content)
            ids.append(r.json()['id'])
        s = self.client.get('/api/v1/finance/summary/').json()
        self.assertEqual((s['total_income'], s['total_expense'], s['net']), (1500.3, 800.05, 700.25))
        self.assertEqual([x['name'] for x in s['expense_by_category']], ['Salaries', 'Utilities'])
        self.assertEqual(sum(x['share'] for x in s['expense_by_category']), 100.0)
        self.post(f'finance/entries/{ids[2]}/void', {})
        s = self.client.get('/api/v1/finance/summary/').json()
        self.assertEqual(s['total_expense'], 100.05)

    def test_validation_and_scope(self):
        self.sign(self.principal)
        self.client.get('/api/v1/finance/categories/')
        from core.models import FinanceCategory
        fee = FinanceCategory.objects.get(school=self.s1, name='Tuition fees')
        for bad in ('0', '-5', 'abc', ''):
            self.assertEqual(self.post('finance/entries', {'category': fee.id, 'amount': bad}).status_code, 400)
        self.post('finance/entries', {'category': fee.id, 'amount': '10'})
        self.sign(self.org_admin)
        self.client.get('/api/v1/finance/categories/')
        south = FinanceCategory.objects.get(school=self.s2, name='Tuition fees')
        self.assertEqual(self.post('finance/entries', {'school': self.s2.id, 'category': south.id, 'amount': '5'}).status_code, 201)
        self.assertEqual(self.post('finance/entries', {'school': self.s2.id, 'category': fee.id, 'amount': '5'}).status_code, 400)  # category from wrong campus
        self.assertEqual(self.client.get('/api/v1/finance/summary/').json()['total_income'], 15.0)
        self.sign(self.principal)   # principal never sees South
        self.assertEqual(self.client.get('/api/v1/finance/summary/').json()['total_income'], 10.0)
        self.assertEqual(self.client.get(f'/api/v1/finance/summary/?school={self.s2.id}').json()['total_income'], 0)
