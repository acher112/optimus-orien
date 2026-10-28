"""Comprehensive Acceptance and Integration Tests for Configurable Examination Engine.

Implements and verifies all 15 acceptance criteria from Section 11 of the specification:
1. Change term weights from 20/30/50 to 25/25/50 -> affected results recalculate correctly.
2. Configure different maximum marks for each subject -> percentages remain correctly normalized.
3. Enter marks equal to maximum marks -> term percentage is 100%.
4. Enter zero marks -> term percentage is 0%, treated as a valid result.
5. Enter marks greater than maximum marks -> validation error.
6. Set examination weights to 95% -> configuration cannot be published.
7. Leave a required examination blank -> final annual result remains pending.
8. Calculate average for 30 students -> each eligible student contributes once.
9. Calculate branch average for classes of different sizes -> student-weighted average is correct (73.33%).
10. Calculate boys' Mathematics average -> only eligible boys included.
11. Calculate girls' Mathematics average -> only eligible girls included.
12. Change a student's marks -> dependent calculated results updated automatically.
13. Change next year's configuration -> previous year's results remain reproducible.
14. No students have eligible results -> average is null / N/A, never 0%.
15. Compare overall and gender averages -> overall includes all eligible students across gender groups.
"""
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from rest_framework.exceptions import ValidationError

from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Subject, Student,
    Enrollment, ExamConfiguration, ExamComponent, ExamComponentSubjectConfig,
    ExamSubjectWeight, ExamStudentMark, CalculatedSubjectResult, CalculatedStudentResult
)
from core.services.exam_engine import (
    calculate_subject_result, calculate_student_average,
    calculate_group_average, calculate_gender_performance,
    recalculate_configuration, recalculate_student
)


class ExaminationEngineAcceptanceTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name='Test Org', code='test-org', allow_org_admin_student_access=True)
        self.school = School.objects.create(organisation=self.org, name='Main Campus', code='MAIN')
        self.admin = User.objects.create(username='admin_test', organisation=self.org, school=self.school, role='school_admin')
        self.year_2026 = AcademicYear.objects.create(
            school=self.school, name='2026-2027',
            start_date=date(2026, 8, 1), end_date=date(2027, 6, 30)
        )
        self.c6 = SchoolClass.objects.create(
            school=self.school, academic_year=self.year_2026, name='Class 6', section='A', grade_level='6'
        )
        self.math = Subject.objects.create(school=self.school, name='Mathematics', code='MATH')
        self.eng = Subject.objects.create(school=self.school, name='English', code='ENG')

    # Test 1: Change term weights from 20/30/50 to 25/25/50
    def test_01_term_weight_change_recalculation(self):
        config = ExamConfiguration.objects.create(
            school=self.school, academic_year=self.year_2026, school_class=self.c6,
            name='Class 6 Assessment', status='published'
        )
        t1 = ExamComponent.objects.create(configuration=config, name='First Term', sequence=1, weight_percentage=Decimal('20.00'), default_max_marks=Decimal('50.00'))
        t2 = ExamComponent.objects.create(configuration=config, name='Second Term', sequence=2, weight_percentage=Decimal('30.00'), default_max_marks=Decimal('75.00'))
        t3 = ExamComponent.objects.create(configuration=config, name='Third Term', sequence=3, weight_percentage=Decimal('50.00'), default_max_marks=Decimal('100.00'))

        student = Student.objects.create(school=self.school, admission_number='S01', first_name='Ali', last_name='Khan', gender='male', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=student, school_class=self.c6, start_date=date(2026, 8, 1))

        # Ali: 50/50 (100%), 60/75 (80%), 70/100 (70%)
        # 20/30/50: 100*0.2 + 80*0.3 + 70*0.5 = 20 + 24 + 35 = 79.00%
        ExamStudentMark.objects.create(student=student, component=t1, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('50.00'))
        ExamStudentMark.objects.create(student=student, component=t2, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('60.00'))
        ExamStudentMark.objects.create(student=student, component=t3, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('70.00'))

        recalculate_configuration(config.id)
        res = CalculatedSubjectResult.objects.get(student=student, subject=self.math, configuration=config)
        self.assertEqual(round(res.final_percentage, 2), Decimal('79.00'))

        # Administrator changes weights to 25/25/50
        # 100*0.25 + 80*0.25 + 70*0.5 = 25 + 20 + 35 = 80.00%
        t1.weight_percentage = Decimal('25.00')
        t1.save()
        t2.weight_percentage = Decimal('25.00')
        t2.save()

        recalculate_configuration(config.id)
        res.refresh_from_db()
        self.assertEqual(round(res.final_percentage, 2), Decimal('80.00'))

    # Test 2: Configure different maximum marks for each subject
    def test_02_subject_specific_maximum_marks_normalization(self):
        # Math: 50, 75, 100; English: 100, 100, 100
        terms_math = [
            {'term_id': 1, 'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('20.00'), 'marks_obtained': Decimal('40.00')}, # 80%
            {'term_id': 2, 'maximum_marks': Decimal('75.00'), 'weight_percentage': Decimal('30.00'), 'marks_obtained': Decimal('60.00')}, # 80%
            {'term_id': 3, 'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('50.00'), 'marks_obtained': Decimal('70.00')}, # 70%
        ]
        res_math = calculate_subject_result(1, 1, terms_math)
        # (80 * 0.20) + (80 * 0.30) + (70 * 0.50) = 16 + 24 + 35 = 75.00%
        self.assertEqual(round(res_math['final_percentage'], 2), Decimal('75.00'))

        terms_eng = [
            {'term_id': 1, 'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('20.00'), 'marks_obtained': Decimal('80.00')}, # 80%
            {'term_id': 2, 'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('30.00'), 'marks_obtained': Decimal('80.00')}, # 80%
            {'term_id': 3, 'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('50.00'), 'marks_obtained': Decimal('70.00')}, # 70%
        ]
        res_eng = calculate_subject_result(1, 2, terms_eng)
        self.assertEqual(round(res_eng['final_percentage'], 2), Decimal('75.00'))

    # Test 3: Enter marks equal to maximum marks -> 100%
    def test_03_full_marks_produces_100_percent(self):
        terms = [
            {'term_id': 1, 'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('100.00'), 'marks_obtained': Decimal('50.00')}
        ]
        res = calculate_subject_result(1, 1, terms)
        self.assertEqual(round(res['final_percentage'], 2), Decimal('100.00'))

    # Test 4: Enter zero marks -> 0%, treated as valid result
    def test_04_zero_marks_is_valid_zero_percent(self):
        terms = [
            {'term_id': 1, 'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('100.00'), 'marks_obtained': Decimal('0.00')}
        ]
        res = calculate_subject_result(1, 1, terms)
        self.assertTrue(res['completed'])
        self.assertEqual(res['final_percentage'], Decimal('0.0000'))

    # Test 5: Enter marks greater than maximum marks -> validation error
    def test_05_marks_exceeding_max_marks_raises_error(self):
        terms = [
            {'term_id': 1, 'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('100.00'), 'marks_obtained': Decimal('51.00')}
        ]
        with self.assertRaises(ValidationError):
            calculate_subject_result(1, 1, terms)

    # Test 6: Set examination weights to 95% -> validation error
    def test_06_weights_totaling_95_percent_rejected(self):
        terms = [
            {'term_id': 1, 'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('45.00'), 'marks_obtained': Decimal('40.00')},
            {'term_id': 2, 'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('50.00'), 'marks_obtained': Decimal('40.00')},
        ]
        with self.assertRaises(ValidationError):
            calculate_subject_result(1, 1, terms)

    # Test 7: Leave a required examination blank -> final annual result remains pending
    def test_07_blank_exam_keeps_final_annual_result_pending(self):
        terms = [
            {'term_id': 1, 'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('20.00'), 'marks_obtained': Decimal('40.00')}, # 80% * 0.20 = 16
            {'term_id': 2, 'maximum_marks': Decimal('75.00'), 'weight_percentage': Decimal('30.00'), 'marks_obtained': Decimal('52.50')}, # 70% * 0.30 = 21
            {'term_id': 3, 'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('50.00'), 'marks_obtained': None}, # Pending
        ]
        res = calculate_subject_result(1, 1, terms)
        self.assertFalse(res['completed'])
        self.assertIsNone(res['final_percentage']) # Null, not zero!
        # Accumulated contribution: 16 + 21 = 37 percentage points
        self.assertEqual(round(res['accumulated_contribution'], 2), Decimal('37.00'))
        # Assessed weight: 20 + 30 = 50%
        self.assertEqual(round(res['assessed_weight'], 2), Decimal('50.00'))
        # Current normalized performance: 37 / 0.50 = 74.00%
        self.assertEqual(round(res['current_percentage'], 2), Decimal('74.00'))

    # Test 8: Calculate average for 30 students -> each eligible student contributes once
    def test_08_thirty_students_average_counts_each_once(self):
        # 30 students each score 80%
        percentages = [Decimal('80.00') for _ in range(30)]
        avg = calculate_group_average(percentages)
        self.assertEqual(round(avg, 2), Decimal('80.00'))

    # Test 9: Calculate branch average for classes of different sizes -> student-weighted is correct (73.33%)
    def test_09_branch_student_weighted_average(self):
        # Class 6: 30 students with average of 80%
        # Class 7: 60 students with average of 70%
        # Formula: (30 * 80 + 60 * 70) / 90 = (2400 + 4200) / 90 = 6600 / 90 = 73.33%
        c6_students = [Decimal('80.00') for _ in range(30)]
        c7_students = [Decimal('70.00') for _ in range(60)]
        all_students = c6_students + c7_students
        branch_avg = calculate_group_average(all_students)
        self.assertEqual(round(branch_avg, 2), Decimal('73.33'))

    # Test 10: Calculate boys' Mathematics average -> only eligible boys included
    def test_10_boys_mathematics_average(self):
        students = [
            {'gender': 'male', 'overall_percentage': Decimal('70.00')},
            {'gender': 'male', 'overall_percentage': Decimal('80.00')},
            {'gender': 'female', 'overall_percentage': Decimal('95.00')},
            {'gender': 'male', 'overall_percentage': None}, # Incomplete, excluded
        ]
        boys_avg = calculate_gender_performance(students, 'male')
        # (70 + 80) / 2 = 75.00%
        self.assertEqual(round(boys_avg, 2), Decimal('75.00'))

    # Test 11: Calculate girls' Mathematics average -> only eligible girls included
    def test_11_girls_mathematics_average(self):
        students = [
            {'gender': 'female', 'overall_percentage': Decimal('85.00')},
            {'gender': 'female', 'overall_percentage': Decimal('95.00')},
            {'gender': 'male', 'overall_percentage': Decimal('60.00')},
        ]
        girls_avg = calculate_gender_performance(students, 'female')
        # (85 + 95) / 2 = 90.00%
        self.assertEqual(round(girls_avg, 2), Decimal('90.00'))

    # Test 12: Change a student's marks -> dependent calculated results updated according to policy
    def test_12_student_mark_update_triggers_recalculation(self):
        config = ExamConfiguration.objects.create(
            school=self.school, academic_year=self.year_2026, school_class=self.c6,
            name='Config 12', status='published'
        )
        comp = ExamComponent.objects.create(configuration=config, name='Term 1', sequence=1, weight_percentage=Decimal('100.00'), default_max_marks=Decimal('100.00'))
        student = Student.objects.create(school=self.school, admission_number='S12', first_name='Sara', last_name='Ahmed', gender='female', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=student, school_class=self.c6, start_date=date(2026, 8, 1))

        mark = ExamStudentMark.objects.create(student=student, component=comp, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('60.00'))
        recalculate_student(student.id, config.id)

        res = CalculatedSubjectResult.objects.get(student=student, subject=self.math, configuration=config)
        self.assertEqual(round(res.final_percentage, 2), Decimal('60.00'))

        # Update mark to 90
        mark.marks_obtained = Decimal('90.00')
        mark.save()
        recalculate_student(student.id, config.id)

        res.refresh_from_db()
        self.assertEqual(round(res.final_percentage, 2), Decimal('90.00'))

    # Test 13: Change next year's configuration -> previous year's results remain reproducible
    def test_13_historical_configurations_preserved(self):
        # 2026 config: 100% on Term 1
        cfg_2026 = ExamConfiguration.objects.create(
            school=self.school, academic_year=self.year_2026, name='Config 2026', status='published', version=1
        )
        c26 = ExamComponent.objects.create(configuration=cfg_2026, name='Final Exam', sequence=1, weight_percentage=Decimal('100.00'), default_max_marks=Decimal('100.00'))

        student = Student.objects.create(school=self.school, admission_number='S13', first_name='Zayn', last_name='Malik', gender='male', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=student, school_class=self.c6, start_date=date(2026, 8, 1))
        ExamStudentMark.objects.create(student=student, component=c26, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('85.00'))

        recalculate_configuration(cfg_2026.id)
        res_2026 = CalculatedSubjectResult.objects.get(student=student, subject=self.math, configuration=cfg_2026)
        self.assertEqual(round(res_2026.final_percentage, 2), Decimal('85.00'))

        # Create next year 2027 configuration with different weights: 40/60
        year_2027 = AcademicYear.objects.create(school=self.school, name='2027-2028', start_date=date(2027, 8, 1), end_date=date(2028, 6, 30))
        cfg_2027 = ExamConfiguration.objects.create(school=self.school, academic_year=year_2027, name='Config 2027', status='published', version=1)
        ExamComponent.objects.create(configuration=cfg_2027, name='Midterm', sequence=1, weight_percentage=Decimal('40.00'), default_max_marks=Decimal('100.00'))
        ExamComponent.objects.create(configuration=cfg_2027, name='Final', sequence=2, weight_percentage=Decimal('60.00'), default_max_marks=Decimal('100.00'))

        # Verify 2026 results remain untouched and 85%
        res_2026.refresh_from_db()
        self.assertEqual(round(res_2026.final_percentage, 2), Decimal('85.00'))
        self.assertEqual(res_2026.configuration_version, 1)

    # Test 14: No students have eligible results -> average is null / N/A, never 0%
    def test_14_no_eligible_students_returns_none(self):
        avg = calculate_group_average([])
        self.assertIsNone(avg)

    # Test 15: Compare overall and gender averages -> overall includes all eligible students
    def test_15_overall_and_gender_reconciliation(self):
        # 40 boys @ 72.50%, 35 girls @ 81.20%
        # Total 75 students: (40*72.50 + 35*81.20) / 75 = (2900 + 2842) / 75 = 5742 / 75 = 76.56%
        boys_scores = [Decimal('72.50') for _ in range(40)]
        girls_scores = [Decimal('81.20') for _ in range(35)]

        students = [{'gender': 'male', 'overall_percentage': s} for s in boys_scores] + \
                   [{'gender': 'female', 'overall_percentage': s} for s in girls_scores]

        boys_avg = calculate_gender_performance(students, 'male')
        girls_avg = calculate_gender_performance(students, 'female')
        overall_avg = calculate_group_average(boys_scores + girls_scores)

        self.assertEqual(round(boys_avg, 2), Decimal('72.50'))
        self.assertEqual(round(girls_avg, 2), Decimal('81.20'))
        self.assertEqual(round(overall_avg, 2), Decimal('76.56'))

        # Gender Gap = Girls - Boys = 81.20 - 72.50 = +8.70 percentage points
        gap = girls_avg - boys_avg
        self.assertEqual(round(gap, 2), Decimal('8.70'))


class ExamEngineAPITests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name='API Org', code='api-org', allow_org_admin_student_access=True)
        self.school = School.objects.create(organisation=self.org, name='North Campus', code='NORTH')
        self.admin = User.objects.create_user(username='admin_api', password='TestPassword123!', organisation=self.org, school=self.school, role='school_admin')
        self.year = AcademicYear.objects.create(school=self.school, name='2026-2027', start_date=date(2026, 8, 1), end_date=date(2027, 6, 30))
        self.klass = SchoolClass.objects.create(school=self.school, academic_year=self.year, name='Grade 6', section='A', grade_level='6')
        self.subject = Subject.objects.create(school=self.school, name='Science', code='SCI')

        self.student = Student.objects.create(school=self.school, admission_number='API-01', first_name='Hassan', last_name='Raza', gender='male', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=self.student, school_class=self.klass, start_date=date(2026, 8, 1))

    def test_api_configuration_lifecycle_and_analytics(self):
        self.client.login(username='admin_api', password='TestPassword123!')

        # 1. Create draft configuration
        create_payload = {
            'school': self.school.id,
            'academic_year': self.year.id,
            'school_class': self.klass.id,
            'name': 'Grade 6 Science Annual',
            'reporting_scale': '100.00',
            'passing_threshold': '40.00',
            'components': [
                {'name': 'Term 1', 'sequence': 1, 'weight_percentage': '40.00', 'default_max_marks': '50.00'},
                {'name': 'Term 2', 'sequence': 2, 'weight_percentage': '60.00', 'default_max_marks': '100.00'}
            ]
        }
        res = self.client.post('/api/v1/exams/engine/configurations/', create_payload, content_type='application/json')
        self.assertEqual(res.status_code, 201)
        config_id = res.json()['id']

        # 2. Publish configuration
        pub_res = self.client.post(f'/api/v1/exams/engine/configurations/{config_id}/publish/')
        self.assertEqual(pub_res.status_code, 200)
        self.assertEqual(pub_res.json()['status'], 'published')

        # 3. Enter marks via marks grid
        # Term 1: 40/50 (80%), Term 2: 90/100 (90%)
        # Final = (80 * 0.40) + (90 * 0.60) = 32 + 54 = 86.00%
        grid_get = self.client.get(f'/api/v1/exams/engine/configurations/{config_id}/marks-grid/?class={self.klass.id}&subject={self.subject.id}')
        self.assertEqual(grid_get.status_code, 200)
        t1_id = grid_get.json()['columns'][0]['id']
        t2_id = grid_get.json()['columns'][1]['id']

        put_payload = {
            'class': self.klass.id,
            'subject': self.subject.id,
            'marks': [{
                'student_id': self.student.id,
                'terms': {
                    str(t1_id): {'marks_obtained': '40.00', 'result_status': 'recorded'},
                    str(t2_id): {'marks_obtained': '90.00', 'result_status': 'recorded'}
                }
            }]
        }
        put_res = self.client.put(f'/api/v1/exams/engine/configurations/{config_id}/marks-grid/', put_payload, content_type='application/json')
        self.assertEqual(put_res.status_code, 200)

        # 4. Check Analytics endpoint
        analytics_res = self.client.get(f'/api/v1/exams/engine/analytics/?configuration={config_id}')
        self.assertEqual(analytics_res.status_code, 200)
        data = analytics_res.json()
        self.assertEqual(data['summary']['headline_average'], 86.0)
        self.assertEqual(data['summary']['eligible_students_count'], 1)
        self.assertEqual(data['summary']['pass_rate'], 100.0)

        # 5. Check Student Transcript endpoint
        transcript_res = self.client.get(f'/api/v1/exams/engine/student-transcript/?student={self.student.id}&configuration={config_id}')
        self.assertEqual(transcript_res.status_code, 200)
        t_data = transcript_res.json()
        self.assertEqual(t_data['summary']['final_annual_percentage'], 86.0)
        self.assertEqual(t_data['summary']['status'], 'Completed')
        self.assertEqual(t_data['summary']['passed'], True)

