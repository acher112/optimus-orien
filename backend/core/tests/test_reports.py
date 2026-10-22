"""Drill-down report tests: scoping at every level, calculation policy and missing-data rules.

All names and data are fictional.
"""
from datetime import timedelta
from decimal import Decimal

from core.models import (Assessment, Attendance, Enrollment, Grade, Organisation, SchoolConfiguration,
                         Student)
from core.tests.test_phase1 import AccessFixture


class ReportFixture(AccessFixture):
    """Adds deterministic assessment data on top of the shared access fixture.

    Class 8 A (c1, Math): published A1 (weight 1) and A2 (weight 3), plus the
    fixture's unpublished 'Unit 1' (must be ignored).
      * student a : 80 on A1, 60 on A2 -> weighted 65.0
      * student a2: 50 on A1, nothing on A2 -> 50.0
      * student a3: no results at all (must not be treated as zero)
    Class 8 B (c2, Math): one published assessment, student b scores 90.
    """

    def setUp(self):
        super().setUp()
        t = self.today
        self.a2 = Student.objects.create(school=self.s1, admission_number='N-3', first_name='C', last_name='Student', enrolled_on=t - timedelta(days=80))
        self.a3 = Student.objects.create(school=self.s1, admission_number='N-4', first_name='D', last_name='Student', enrolled_on=t - timedelta(days=80))
        for s in (self.a2, self.a3):
            Enrollment.objects.create(student=s, school_class=self.c1, start_date=t - timedelta(days=80))
        self.A1 = Assessment.objects.create(school_class=self.c1, subject=self.math, title='A1', date=t - timedelta(days=10), max_marks=Decimal('100'), weight=Decimal('1'), published=True)
        self.A2 = Assessment.objects.create(school_class=self.c1, subject=self.math, title='A2', date=t - timedelta(days=30), max_marks=Decimal('100'), weight=Decimal('3'), published=True)
        self.B1 = Assessment.objects.create(school_class=self.c2, subject=self.math, title='B1', date=t - timedelta(days=10), max_marks=Decimal('100'), weight=Decimal('1'), published=True)
        Grade.objects.create(assessment=self.A1, student=self.a, marks=Decimal('80'))
        Grade.objects.create(assessment=self.A2, student=self.a, marks=Decimal('60'))
        Grade.objects.create(assessment=self.A1, student=self.a2, marks=Decimal('50'))
        Grade.objects.create(assessment=self.B1, student=self.b, marks=Decimal('90'))

    def get(self, path, user=None):
        if user:
            self.sign(user)
        return self.client.get('/api/v1/reports/' + path)


class ReportAccessTests(ReportFixture):
    def test_anonymous_blocked(self):
        self.assertIn(self.get('overview/').status_code, (401, 403))
        self.assertIn(self.get(f'class/{self.c1.id}/').status_code, (401, 403))

    def test_student_and_parent_have_no_aggregate_reports(self):
        for u in (self.student_user, self.parent):
            self.assertEqual(self.get('overview/', u).status_code, 403)
            self.assertEqual(self.get(f'campus/{self.s1.id}/').status_code, 403)

    def test_org_admin_sees_own_campuses_only(self):
        body = self.get('overview/', self.org_admin).json()
        self.assertEqual({c['name'] for c in body['campuses']}, {'North', 'South'})
        self.assertEqual(self.get(f'campus/{self.s3.id}/').status_code, 404)  # other organisation
        self.assertEqual(self.get(f'class/{self.c3.id}/').status_code, 404)
        self.assertEqual(self.get(f'campus/{self.s3.id}/subject/M/').status_code, 404)

    def test_principal_locked_to_own_campus(self):
        body = self.get('overview/', self.principal).json()
        self.assertEqual([c['name'] for c in body['campuses']], ['North'])
        self.assertEqual(self.get(f'campus/{self.s2.id}/').status_code, 404)
        self.assertEqual(self.get(f'class/{self.c4.id}/').status_code, 404)
        self.assertEqual(self.get(f'campus/{self.s2.id}/subject/M/').status_code, 404)

    def test_teacher_limited_to_own_classes(self):
        campus = self.get(f'campus/{self.s1.id}/', self.teacher).json()
        self.assertEqual([c['name'] for c in campus['classes']], ['8 A'])
        self.assertEqual(self.get(f'class/{self.c2.id}/').status_code, 404)
        self.assertEqual(self.get(f'campus/{self.s1.id}/subject/M/?class={self.c2.id}').status_code, 404)
        self.assertEqual(self.get(f'class/{self.c1.id}/').status_code, 200)

    def test_foreign_teacher_cannot_reach_other_org(self):
        self.assertEqual(self.get(f'campus/{self.s1.id}/', self.teacher3).status_code, 404)
        self.assertEqual(self.get(f'class/{self.c1.id}/').status_code, 404)

    def test_aggregates_do_not_need_student_privacy_flag_but_rows_do(self):
        self.org.allow_org_admin_student_access = False
        self.org.save()
        body = self.get(f'class/{self.c1.id}/', self.org_admin).json()
        self.assertEqual(body['overall']['academic_average'], 57.5)  # aggregate still available
        self.assertFalse(body['student_rows_allowed'])
        self.assertEqual(body['students'], [])
        subj = self.get(f'campus/{self.s1.id}/subject/M/').json()
        self.assertEqual(subj['students'], [])
        self.org.allow_org_admin_student_access = True
        self.org.save()
        body = self.get(f'class/{self.c1.id}/').json()
        self.assertTrue(body['student_rows_allowed'])
        self.assertEqual(len(body['students']), 3)

    def test_unknown_subject_is_404(self):
        self.assertEqual(self.get(f'campus/{self.s1.id}/subject/ZZZ/', self.principal).status_code, 404)


class ReportCalculationTests(ReportFixture):
    def test_class_average_is_average_of_weighted_student_results(self):
        body = self.get(f'class/{self.c1.id}/', self.principal).json()
        math = next(s for s in body['subjects'] if s['code'] == 'M')
        # a = (80*1 + 60*3)/4 = 65 ; a2 = 50 ; mean = 57.5 (a raw-record mean would be 63.3)
        self.assertEqual(math['average'], 57.5)
        self.assertEqual((math['min'], math['max']), (50.0, 65.0))
        self.assertEqual(math['valid_students'], 2)

    def test_missing_results_are_reported_not_zeroed(self):
        body = self.get(f'class/{self.c1.id}/', self.principal).json()
        math = next(s for s in body['subjects'] if s['code'] == 'M')
        # A1 eligible a,a2,a3 / graded a,a2 -> 1 missing ; A2 graded a only -> 2 missing
        self.assertEqual(math['missing_results'], 3)
        self.assertEqual(math['valid_results'], 3)
        self.assertEqual(math['eligible_students'], 3)
        self.assertEqual(body['overall']['students_without_results'], 1)
        self.assertEqual(body['overall']['completeness'], 66.7)
        self.assertEqual(body['overall']['academic_average'], 57.5)  # a3 not pulled down as a zero

    def test_unpublished_assessments_ignored(self):
        body = self.get(f'class/{self.c1.id}/', self.principal).json()
        math = next(s for s in body['subjects'] if s['code'] == 'M')
        self.assertEqual(math['assessments'], 2)  # fixture's unpublished 'Unit 1' (grade 90) not counted
        self.assertNotIn(90.0, (math['max'],))

    def test_distribution_counts_valid_results_only(self):
        body = self.get(f'class/{self.c1.id}/', self.principal).json()
        dist = {d['band']: d['count'] for d in next(s for s in body['subjects'] if s['code'] == 'M')['distribution']}
        self.assertEqual(dist['50–59'], 1)
        self.assertEqual(dist['60–69'], 1)
        self.assertEqual(sum(dist.values()), 2)

    def test_campus_rolls_up_without_duplicating_subjects(self):
        body = self.get(f'campus/{self.s1.id}/', self.principal).json()
        self.assertEqual(len(body['subjects']), 1)
        math = body['subjects'][0]
        # student results: 65, 50 (8A) and 90 (8B) -> 68.3
        self.assertEqual(math['average'], 68.3)
        self.assertEqual({c['class_name'] for c in math['classes']}, {'8 A', '8 B'})

    def test_classes_with_different_assessment_structure_flagged_not_equivalent(self):
        math = self.get(f'campus/{self.s1.id}/', self.principal).json()['subjects'][0]
        self.assertFalse(math['comparable'])
        self.assertIn('not directly equivalent', math['comparability_note'])
        # make 8 B use the same structure as 8 A -> comparable
        Assessment.objects.create(school_class=self.c2, subject=self.math, title='B2', date=self.today - timedelta(days=30), max_marks=Decimal('100'), weight=Decimal('3'), published=True)
        math = self.get(f'campus/{self.s1.id}/').json()['subjects'][0]
        self.assertTrue(math['comparable'])

    def test_overview_groups_subjects_by_code_with_campus_breakdown(self):
        body = self.get('overview/', self.org_admin).json()
        codes = [s['code'] for s in body['subjects']]
        self.assertEqual(codes.count('M'), 1)  # one row even though the code exists at two campuses
        row = body['subjects'][0]
        self.assertEqual([c['school_name'] for c in row['by_campus']], ['North'])
        north = next(c for c in body['campuses'] if c['name'] == 'North')
        south = next(c for c in body['campuses'] if c['name'] == 'South')
        self.assertEqual(north['academic_average'], 68.3)
        self.assertIsNone(south['academic_average'])  # no data is None, not zero
        self.assertEqual(south['valid_results'], 0)

    def test_attendance_denominator(self):
        c = self.c1
        for i, st in enumerate(['present', 'late', 'absent', 'excused']):
            Attendance.objects.create(student=self.a, school_class=c, date=self.today - timedelta(days=i + 1), status=st)
        att = self.get(f'class/{c.id}/', self.principal).json()['overall']['attendance']
        self.assertEqual((att['recorded'], att['present'], att['late'], att['absent'], att['excused']), (4, 1, 1, 1, 1))
        self.assertEqual(att['rate'], 50.0)  # (present + late) / recorded

    def test_subject_report_assessment_detail(self):
        body = self.get(f'campus/{self.s1.id}/subject/M/?class={self.c1.id}', self.principal).json()
        self.assertEqual([a['title'] for a in body['assessments']], ['A2', 'A1'])
        a1 = next(a for a in body['assessments'] if a['title'] == 'A1')
        self.assertEqual((a1['graded'], a1['eligible'], a1['missing'], a1['average']), (2, 3, 1, 65.0))
        self.assertEqual(body['overall']['average'], 57.5)
        self.assertEqual(len(body['students']), 2)  # only students with a result

    def test_student_joining_later_is_not_counted_missing_for_earlier_assessments(self):
        late = Student.objects.create(school=self.s1, admission_number='N-9', first_name='E', last_name='Late', enrolled_on=self.today - timedelta(days=5))
        Enrollment.objects.create(student=late, school_class=self.c1, start_date=self.today - timedelta(days=5))
        body = self.get(f'class/{self.c1.id}/', self.principal).json()
        math = next(s for s in body['subjects'] if s['code'] == 'M')
        self.assertEqual(math['missing_results'], 3)  # unchanged: joined after both assessments
        self.assertEqual(body['overall']['students'], 4)


class ReportPeriodTests(ReportFixture):
    def setUp(self):
        super().setUp()
        SchoolConfiguration.objects.create(school=self.s1, reporting_periods=[
            {'name': 'Term 1', 'start': (self.today - timedelta(days=15)).isoformat(), 'end': self.today.isoformat()}])

    def test_period_filters_assessments(self):
        body = self.get(f'class/{self.c1.id}/?period=Term 1', self.principal).json()
        math = next(s for s in body['subjects'] if s['code'] == 'M')
        self.assertEqual(math['assessments'], 1)  # A2 is 30 days ago, outside the window
        self.assertEqual(math['average'], 65.0)  # a=80, a2=50
        self.assertEqual(body['period']['name'], 'Term 1')

    def test_unconfigured_campus_is_excluded_and_named(self):
        body = self.get('overview/?period=Term 1', self.org_admin).json()
        self.assertEqual(body['period']['unavailable_campuses'], ['South'])
        south = next(c for c in body['campuses'] if c['name'] == 'South')
        self.assertFalse(south['period_available'])
        self.assertEqual(body['period']['options'], ['Term 1'])

    def test_unknown_period_for_school_returns_no_numbers_not_other_dates(self):
        body = self.get(f'class/{self.c1.id}/?period=Term 9', self.principal).json()
        self.assertEqual(body['subjects'], [])
        self.assertIsNone(body['overall']['academic_average'])
