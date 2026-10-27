"""Tests for descending comparisons and universal search/filters.

Validates:
1. Reusable numeric descending sorting helper (1200 > 900 > 15, ties A-Z, None at bottom)
2. Student father_name mandatory validation on creation, mother_name & guardian_phone
3. SchoolClass section field and unique constraint (academic_year, name, section)
4. Universal query filters: q search, field filters, unknown parameter 400 rejection
5. Permission scoping security and report descending ordering
"""
import json
from datetime import timedelta
from decimal import Decimal
from django.db.utils import IntegrityError

from core.models import Student, SchoolClass, AcademicYear, Assessment, Grade
from core.services.filters import sort_comparison_rows
from core.tests.test_phase1 import AccessFixture
from core.tests.test_reports import ReportFixture


class DescendingSortHelperTests(AccessFixture):
    def test_numeric_descending_ordering(self):
        """1200 must be higher than 900, which must be higher than 15."""
        rows = [
            {'name': 'Beta', 'metric': 15},
            {'name': 'Alpha', 'metric': 900},
            {'name': 'Delta', 'metric': '1200'},
            {'name': 'Gamma', 'metric': Decimal('300.50')},
        ]
        sorted_rows = sort_comparison_rows(rows, 'metric')
        names = [r['name'] for r in sorted_rows]
        self.assertEqual(names, ['Delta', 'Alpha', 'Gamma', 'Beta'])
        self.assertEqual([r['metric'] for r in sorted_rows], ['1200', 900, Decimal('300.50'), 15])

    def test_tie_breaking_alphabetical(self):
        """When values are identical, break ties alphabetically by name A -> Z."""
        rows = [
            {'name': 'Zulu', 'score': 85},
            {'name': 'Charlie', 'score': 85},
            {'name': 'Alpha', 'score': 85},
            {'name': 'Bravo', 'score': 85},
        ]
        sorted_rows = sort_comparison_rows(rows, 'score')
        self.assertEqual([r['name'] for r in sorted_rows], ['Alpha', 'Bravo', 'Charlie', 'Zulu'])

    def test_none_and_missing_values_at_bottom(self):
        """None or missing metrics must always be placed at the bottom."""
        rows = [
            {'name': 'NoMetric', 'score': None},
            {'name': 'ZeroScore', 'score': 0},
            {'name': 'HighScore', 'score': 95},
            {'name': 'EmptyString', 'score': ''},
            {'name': 'LowScore', 'score': 10},
        ]
        sorted_rows = sort_comparison_rows(rows, 'score')
        names = [r['name'] for r in sorted_rows]
        self.assertEqual(names[:3], ['HighScore', 'LowScore', 'ZeroScore'])
        self.assertEqual(set(names[3:]), {'EmptyString', 'NoMetric'})

    def test_ascending_ordering(self):
        """When reverse=False, lowest on top and highest at bottom."""
        rows = [
            {'name': 'Top', 'val': 100},
            {'name': 'Bottom', 'val': 10},
            {'name': 'Middle', 'val': 50},
        ]
        sorted_rows = sort_comparison_rows(rows, 'val', reverse=False)
        self.assertEqual([r['name'] for r in sorted_rows], ['Bottom', 'Middle', 'Top'])


class StudentDataModelTests(AccessFixture):
    def test_student_father_name_mandatory_on_creation_via_api(self):
        """Father name is mandatory when creating a new student via API."""
        self.sign(self.school_admin)
        res = self.post('students', {
            'school': self.s1.id,
            'admission_number': 'NEW-ADM-001',
            'first_name': 'Ali',
            'last_name': 'Khan',
            'gender': 'male',
            'enrolled_on': str(self.today),
            # father_name intentionally missing
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('father_name', res.json())

    def test_student_creation_succeeds_with_father_name(self):
        """Creating student with father_name succeeds."""
        self.sign(self.school_admin)
        res = self.post('students', {
            'school': self.s1.id,
            'admission_number': 'NEW-ADM-002',
            'first_name': 'Ali',
            'last_name': 'Khan',
            'father_name': 'Tariq Khan',
            'mother_name': 'Fatima Khan',
            'guardian_phone': '03001234567',
            'gender': 'male',
            'enrolled_on': str(self.today),
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data['father_name'], 'Tariq Khan')
        self.assertEqual(data['mother_name'], 'Fatima Khan')
        self.assertEqual(data['guardian_phone'], '03001234567')

    def test_student_update_without_father_name_succeeds(self):
        """Legacy students or partial updates do not fail if father_name is unchanged."""
        self.sign(self.school_admin)
        res = self.patch(f'students/{self.a.id}', {
            'first_name': 'UpdatedName',
        })
        self.assertEqual(res.status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(self.a.first_name, 'UpdatedName')


class SchoolClassSectionTests(AccessFixture):
    def test_section_display_name_and_str(self):
        """Class with section displays 'Class 5 – A'."""
        self.c1.name = 'Class 5'
        self.c1.section = 'A'
        self.c1.save()
        self.assertEqual(self.c1.display_name, 'Class 5 – A')
        self.assertIn('Class 5 – A', str(self.c1))

    def test_unique_class_name_with_different_sections(self):
        """Classes with the same name can coexist in the same year with different sections."""
        c_a = SchoolClass.objects.create(
            school=self.s1,
            academic_year=self.year1,
            name='Class 9',
            section='A'
        )
        c_b = SchoolClass.objects.create(
            school=self.s1,
            academic_year=self.year1,
            name='Class 9',
            section='B'
        )
        self.assertNotEqual(c_a.id, c_b.id)

    def test_duplicate_class_section_rejected(self):
        """Duplicate (academic_year, name, section) raises IntegrityError."""
        SchoolClass.objects.create(
            school=self.s1,
            academic_year=self.year1,
            name='Class 10',
            section='Gold'
        )
        with self.assertRaises(IntegrityError):
            SchoolClass.objects.create(
                school=self.s1,
                academic_year=self.year1,
                name='Class 10',
                section='Gold'
            )


class UniversalFilterTests(AccessFixture):
    def setUp(self):
        super().setUp()
        self.s_test = Student.objects.create(
            school=self.s1,
            admission_number='SRCH-99',
            first_name='Zainab',
            last_name='Bibi',
            father_name='Muhammad Asif',
            gender='female',
            enrolled_on=self.today,
            active=True
        )

    def _rows(self, res):
        body = res.json()
        return body.get('results', body) if isinstance(body, dict) else body

    def test_text_search_q_across_name_and_father(self):
        """q searches student first_name, last_name, admission_number, and father_name."""
        self.sign(self.school_admin)
        res = self.client.get('/api/v1/students/?q=Asif')
        self.assertEqual(res.status_code, 200)
        rows = self._rows(res)
        ids = [s['id'] for s in rows]
        self.assertIn(self.s_test.id, ids)

        res2 = self.client.get('/api/v1/students/?q=SRCH-99')
        self.assertEqual(res2.status_code, 200)
        rows2 = self._rows(res2)
        self.assertEqual([s['id'] for s in rows2], [self.s_test.id])

    def test_field_filter_gender_and_active(self):
        """Exact field filtering with gender and active boolean conversion."""
        self.sign(self.school_admin)
        res = self.client.get('/api/v1/students/?gender=female&active=true')
        self.assertEqual(res.status_code, 200)
        rows = self._rows(res)
        self.assertTrue(len(rows) >= 1)
        for s in rows:
            self.assertEqual(s['gender'], 'female')
            self.assertTrue(s['active'])

    def test_unknown_query_param_rejected_with_400(self):
        """Passing an unknown query param must be rejected with 400 Bad Request."""
        self.sign(self.school_admin)
        res = self.client.get('/api/v1/students/?invalid_parameter_foo=123')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Unknown filter parameter', str(res.json()))

    def test_security_scoping_preserved_with_filters(self):
        """A user cannot access another school's students by passing filters."""
        self.sign(self.school_admin)  # s1 admin
        # Filter for other school (s2) where s1 admin has no students
        res = self.client.get(f'/api/v1/students/?school={self.s2.id}')
        self.assertEqual(res.status_code, 200)
        rows = self._rows(res)
        self.assertEqual(len(rows), 0)


class DescendingComparisonEndpointsTests(ReportFixture):
    def test_reports_overview_campuses_descending(self):
        """reports/overview/ campuses breakdown must be in descending order of average."""
        body = self.get('overview/', self.org_admin).json()
        campuses = body.get('campuses', [])
        self.assertTrue(len(campuses) >= 2)
        averages = [c['academic_average'] for c in campuses if c.get('academic_average') is not None]
        for i in range(len(averages) - 1):
            self.assertGreaterEqual(averages[i], averages[i + 1])
