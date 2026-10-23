"""Boys / girls report split and the student 'My performance' endpoint."""
from datetime import timedelta
from decimal import Decimal

from core.models import Enrollment, Grade, Student
from core.tests.test_reports import ReportFixture


class GenderReportTests(ReportFixture):
    def setUp(self):
        super().setUp()
        t = self.today
        for s, g in ((self.a, 'female'), (self.a2, 'female')):
            s.gender = g
            s.save()
        self.extra = {}
        # one more girl (70) and three boys (60, 70, 80) in class 8 A, all on the same weight-1 assessment A1
        for key, gender, marks in (('g3', 'female', 70), ('b1', 'male', 60), ('b2', 'male', 70), ('b3', 'male', 80)):
            st = Student.objects.create(school=self.s1, admission_number='X-' + key, first_name=key, last_name='X', gender=gender, enrolled_on=t - timedelta(days=80))
            Enrollment.objects.create(student=st, school_class=self.c1, start_date=t - timedelta(days=80))
            Grade.objects.create(assessment=self.A1, student=st, marks=Decimal(marks))
            self.extra[key] = st

    def klass(self):
        self.sign(self.teacher)
        return self.client.get(f'/api/v1/reports/class/{self.c1.id}/').json()

    def test_class_split_values(self):
        g = self.klass()['overall']['gender']
        # girls: a=65.0, a2=50.0, g3=70.0 -> 61.7 ; boys 60,70,80 -> 70.0
        self.assertEqual((g['girls']['students'], g['girls']['average']), (3, 61.7))
        self.assertEqual((g['boys']['students'], g['boys']['average']), (3, 70.0))
        self.assertFalse(g['hidden'])

    def test_small_group_hides_both_averages(self):
        self.extra['b3'].gender = ''
        self.extra['b3'].save()
        g = self.klass()['overall']['gender']
        self.assertTrue(g['hidden'])
        self.assertIsNone(g['girls']['average'])
        self.assertIsNone(g['boys']['average'])
        self.assertEqual(g['unspecified'], 1)

    def test_split_present_at_every_level(self):
        self.sign(self.org_admin)
        ov = self.client.get('/api/v1/reports/').json()
        self.assertIn('gender', ov['overall'])
        self.assertIn('gender', ov['campuses'][0])
        self.assertIn('gender', ov['subjects'][0])
        cp = self.client.get(f'/api/v1/reports/campus/{self.s1.id}/').json()
        self.assertIn('gender', cp['classes'][0])
        sj = self.client.get(f'/api/v1/reports/campus/{self.s1.id}/subject/M/').json()
        self.assertIn('gender', sj['overall'])
        self.assertIn('gender', sj['classes'][0])

    def test_my_performance_student(self):
        self.sign(self.student_user)                       # student 'a' (65.0, girl)
        d = self.client.get('/api/v1/reports/me/').json()
        self.assertEqual(d['student']['name'], 'A Student')
        self.assertEqual(d['subjects'][0]['mine'], 65.0)
        self.assertEqual(d['subjects'][0]['girls'], 61.7)
        self.assertEqual(d['subjects'][0]['boys'], 70.0)
        self.assertEqual(d['overall']['mine'], 65.0)
        self.assertNotIn('students', d)                    # no other student rows

    def test_my_performance_parent_and_roles(self):
        self.sign(self.parent)
        self.assertEqual(self.client.get('/api/v1/reports/me/').json()['student']['id'], self.a.id)
        self.sign(self.parent_other)                       # parent with no ward
        self.assertEqual(self.client.get('/api/v1/reports/me/').status_code, 404)
        for u in (self.teacher, self.principal, self.org_admin):
            self.sign(u)
            self.assertEqual(self.client.get('/api/v1/reports/me/').status_code, 403)
        self.client.logout()
        self.assertIn(self.client.get('/api/v1/reports/me/').status_code, (401, 403))

    def test_students_still_blocked_from_aggregates(self):
        self.sign(self.student_user)
        self.assertEqual(self.client.get('/api/v1/reports/').status_code, 403)
        self.assertEqual(self.client.get(f'/api/v1/reports/class/{self.c1.id}/').status_code, 403)

    def test_my_performance_hides_cohort_when_small(self):
        self.extra['b3'].delete() if False else None
        for k in ('b2', 'b3'):
            self.extra[k].gender = ''
            self.extra[k].save()
        self.sign(self.student_user)
        d = self.client.get('/api/v1/reports/me/').json()
        self.assertTrue(d['subjects'][0]['hidden'])
        self.assertIsNone(d['subjects'][0]['boys'])
        self.assertEqual(d['subjects'][0]['mine'], 65.0)
