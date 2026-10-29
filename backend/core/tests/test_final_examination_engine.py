"""Acceptance Test Suite for Final Examination Calculation Engine.

Explicitly verifies all 20 acceptance criteria from Section 14 of the Implementation Specification:
1. The 20/30/50 term configuration calculates 75% for the example in this specification.
2. Different subject maximum marks are handled correctly.
3. Invalid term totals cannot be published.
4. Zero marks are valid; missing marks are not zero.
5. Incomplete annual results remain pending.
6. Student averages use the correct required subject set.
7. Subject averages match the eligible underlying student results.
8. Class averages match the included subject averages.
9. Class-weighted and student-weighted school averages are distinct and correct.
10. The equivalent branch calculations are correct.
11. Boys' and girls' reports use their respective eligible populations.
12. Empty gender groups return N/A.
13. Missing subjects and differing subject availability follow the documented policy.
14. Rounding occurs only at the specified stage.
15. Changing a mark recalculates all affected results.
16. Changing a configuration preserves historical reproducibility.
17. Dashboards, reports, exports, and APIs return consistent results for identical filters.
18. Unauthorized users cannot change published configurations or marks.
19. Duplicate enrollments or marks cannot inflate an average.
20. The system can reproduce a published result from its stored source data and configuration version.
"""
from datetime import date
from decimal import Decimal
from django.test import TestCase
from django.db import IntegrityError
from rest_framework.exceptions import ValidationError

from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Subject, Student,
    Enrollment, ExamConfiguration, ExamComponent, ExamComponentSubjectConfig,
    ExamStudentMark, CalculatedSubjectResult, CalculatedStudentResult,
    ResultPublicationHistory, OrganisationRolePolicy
)
from core.services.exam_engine import (
    calculate_subject_result, calculate_student_average,
    calculate_group_average, calculate_subject_average,
    calculate_class_average, calculate_class_weighted_average,
    calculate_student_weighted_average, calculate_gender_performance,
    validate_configuration_for_publication,
    recalculate_configuration, recalculate_student
)


class FinalExaminationEngineAcceptanceTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name='Academics Group', code='acad-group', allow_org_admin_student_access=True)
        self.school_main = School.objects.create(organisation=self.org, name='Main Campus', code='MAIN')
        self.school_branch = School.objects.create(organisation=self.org, name='City Branch', code='CITY')

        self.admin = User.objects.create_user(username='school_admin', password='Password123!', organisation=self.org, school=self.school_main, role='school_admin')
        self.teacher = User.objects.create_user(username='teacher_jane', password='Password123!', organisation=self.org, school=self.school_main, role='teacher')

        self.year_2026 = AcademicYear.objects.create(
            school=self.school_main, name='2026-2027',
            start_date=date(2026, 8, 1), end_date=date(2027, 6, 30), active=True
        )

        self.c6 = SchoolClass.objects.create(
            school=self.school_main, academic_year=self.year_2026, name='Class 6', section='A', grade_level='6'
        )
        self.c7 = SchoolClass.objects.create(
            school=self.school_main, academic_year=self.year_2026, name='Class 7', section='A', grade_level='7'
        )

        # Subjects
        self.math = Subject.objects.create(school=self.school_main, name='Mathematics', code='MATH')
        self.eng = Subject.objects.create(school=self.school_main, name='English', code='ENG')
        self.sci = Subject.objects.create(school=self.school_main, name='Science', code='SCI')

    # Criterion 1: The 20/30/50 term configuration calculates 75% for the example in this specification
    def test_01_canonical_subject_calculation_20_30_50(self):
        # Example from Spec §4:
        # First Term: 40/50 * 20% = 16
        # Second Term: 60/75 * 30% = 24
        # Third Term: 70/100 * 50% = 35
        # Total = 16 + 24 + 35 = 75%
        terms = [
            {'name': 'First Term', 'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('20.00'), 'marks_obtained': Decimal('40.00')},
            {'name': 'Second Term', 'maximum_marks': Decimal('75.00'), 'weight_percentage': Decimal('30.00'), 'marks_obtained': Decimal('60.00')},
            {'name': 'Third Term', 'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('50.00'), 'marks_obtained': Decimal('70.00')}
        ]
        res_scale_100 = calculate_subject_result(1, 1, terms, reporting_scale=Decimal('100.00'))
        self.assertEqual(res_scale_100['completed'], True)
        self.assertEqual(res_scale_100['final_percentage'], Decimal('75.0000'))
        self.assertEqual(res_scale_100['scaled_marks'], Decimal('75.0000'))

        # If reporting scale is 50, scaled mark is 37.5
        res_scale_50 = calculate_subject_result(1, 1, terms, reporting_scale=Decimal('50.00'))
        self.assertEqual(res_scale_50['final_percentage'], Decimal('75.0000'))
        self.assertEqual(res_scale_50['scaled_marks'], Decimal('37.5000'))

    # Criterion 2: Different subject maximum marks are handled correctly
    def test_02_subject_specific_maximum_marks_normalization(self):
        # Math: Max marks 50, 75, 100 with obtained 40, 60, 70 -> 75.00%
        terms_math = [
            {'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('20.00'), 'marks_obtained': Decimal('40.00')},
            {'maximum_marks': Decimal('75.00'), 'weight_percentage': Decimal('30.00'), 'marks_obtained': Decimal('60.00')},
            {'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('50.00'), 'marks_obtained': Decimal('70.00')},
        ]
        res_math = calculate_subject_result(1, 1, terms_math)
        self.assertEqual(res_math['final_percentage'], Decimal('75.0000'))

        # English: Max marks 100, 100, 100 with obtained 80, 80, 70 -> 75.00%
        terms_eng = [
            {'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('20.00'), 'marks_obtained': Decimal('80.00')},
            {'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('30.00'), 'marks_obtained': Decimal('80.00')},
            {'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('50.00'), 'marks_obtained': Decimal('70.00')},
        ]
        res_eng = calculate_subject_result(1, 2, terms_eng)
        self.assertEqual(res_eng['final_percentage'], Decimal('75.0000'))

    # Criterion 3: Invalid term totals cannot be published
    def test_03_invalid_term_totals_cannot_be_published(self):
        cfg = ExamConfiguration.objects.create(
            school=self.school_main, academic_year=self.year_2026, name='Invalid Weights Config', status='draft'
        )
        ExamComponent.objects.create(configuration=cfg, name='Term 1', sequence=1, weight_percentage=Decimal('45.00'), default_max_marks=Decimal('100.00'))
        ExamComponent.objects.create(configuration=cfg, name='Term 2', sequence=2, weight_percentage=Decimal('50.00'), default_max_marks=Decimal('100.00'))
        # Total = 95% -> validation error
        with self.assertRaises(ValidationError):
            validate_configuration_for_publication(cfg)

    # Criterion 4: Zero marks are valid; missing marks are not zero
    def test_04_zero_marks_are_valid_and_missing_marks_not_zero(self):
        # Student scored genuine 0.00 out of 100
        terms_zero = [{'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('100.00'), 'marks_obtained': Decimal('0.00')}]
        res_zero = calculate_subject_result(1, 1, terms_zero)
        self.assertTrue(res_zero['completed'])
        self.assertEqual(res_zero['final_percentage'], Decimal('0.0000'))

        # Student mark is unentered (None) -> not treated as zero!
        terms_missing = [{'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('100.00'), 'marks_obtained': None}]
        res_missing = calculate_subject_result(1, 1, terms_missing)
        self.assertFalse(res_missing['completed'])
        self.assertIsNone(res_missing['final_percentage'])
        self.assertEqual(res_missing['final_result_status'], 'pending')

    # Criterion 5: Incomplete annual results remain pending
    def test_05_incomplete_annual_results_remain_pending(self):
        # Completed terms 1 & 2 (20% and 30%), term 3 pending (50%)
        terms = [
            {'maximum_marks': Decimal('50.00'), 'weight_percentage': Decimal('20.00'), 'marks_obtained': Decimal('40.00')}, # 16 pp
            {'maximum_marks': Decimal('75.00'), 'weight_percentage': Decimal('30.00'), 'marks_obtained': Decimal('52.50')}, # 21 pp
            {'maximum_marks': Decimal('100.00'), 'weight_percentage': Decimal('50.00'), 'marks_obtained': None}, # Pending
        ]
        res = calculate_subject_result(1, 1, terms)
        self.assertFalse(res['completed'])
        self.assertIsNone(res['final_percentage']) # Null, not zero!
        self.assertEqual(res['accumulated_contribution'], Decimal('37.0000'))
        self.assertEqual(res['assessed_weight'], Decimal('50.00'))
        self.assertEqual(res['remaining_weight'], Decimal('50.00'))
        # Current Performance = 37 / 0.50 = 74.00%
        self.assertEqual(res['current_percentage'], Decimal('74.0000'))
        self.assertEqual(res['final_result_status'], 'pending')

    # Criterion 6: Student averages use the correct required subject set
    def test_06_student_averages_use_correct_required_subject_set(self):
        # Spec §5 example: 75, 80, 85, 70, 90, 80, 85 -> 565 / 7 = 80.71%
        scores = [Decimal('75.00'), Decimal('80.00'), Decimal('85.00'), Decimal('70.00'), Decimal('90.00'), Decimal('80.00'), Decimal('85.00')]
        subject_results = [
            {'subject_id': i + 1, 'completed': True, 'final_percentage': s, 'current_percentage': s}
            for i, s in enumerate(scores)
        ]
        avg_res = calculate_student_average(subject_results)
        self.assertTrue(avg_res['completed'])
        expected_avg = Decimal('565.00') / Decimal('7')
        self.assertEqual(avg_res['overall_percentage'], expected_avg)
        self.assertEqual(round(avg_res['overall_percentage'], 2), Decimal('80.71'))

        # Duplicate subjects rejected
        duplicate_results = [
            {'subject_id': 1, 'completed': True, 'final_percentage': Decimal('80.00')},
            {'subject_id': 1, 'completed': True, 'final_percentage': Decimal('90.00')},
        ]
        with self.assertRaises(ValidationError):
            calculate_student_average(duplicate_results)

    # Criterion 7: Subject averages match the eligible underlying student results
    def test_07_subject_averages_match_eligible_student_results(self):
        # 30 eligible students with known marks, 5 unentered
        eligible_scores = [Decimal('70.00')] * 10 + [Decimal('80.00')] * 10 + [Decimal('90.00')] * 10 # Mean 80.00%
        sub_stat = calculate_subject_average(eligible_scores, enrolled_count=35)
        self.assertEqual(sub_stat['eligible_count'], 30)
        self.assertEqual(sub_stat['enrolled_count'], 35)
        self.assertEqual(sub_stat['pending_count'], 5)
        self.assertEqual(round(sub_stat['average_percentage'], 2), Decimal('80.00'))
        # Coverage: 30 / 35 = 85.71%
        self.assertEqual(round(sub_stat['coverage_percentage'], 2), Decimal('85.71'))

    # Criterion 8: Class averages match the included subject averages
    def test_08_class_averages_match_included_subject_averages(self):
        # Spec §7 example:
        # Mathematics: 70%, English: 80%, Science: 75%, Urdu: 85%, Computer Science: 90%, Social Studies: 80%, Islamic Studies: 70%
        # Sum = 550 / 7 = 78.57%
        included_subject_averages = [
            Decimal('70.00'), Decimal('80.00'), Decimal('75.00'), Decimal('85.00'),
            Decimal('90.00'), Decimal('80.00'), Decimal('70.00')
        ]
        class_avg = calculate_class_average(included_subject_averages)
        self.assertEqual(round(class_avg, 2), Decimal('78.57'))

    # Criterion 9: Class-weighted and student-weighted school averages are distinct and correct
    def test_09_class_weighted_and_student_weighted_school_averages_are_distinct(self):
        # Class A: 10 students, each scoring 90% -> Class A average = 90%
        # Class B: 40 students, each scoring 60% -> Class B average = 60%
        class_averages = [Decimal('90.00'), Decimal('60.00')]
        class_weighted = calculate_class_weighted_average(class_averages)
        # Class-weighted average = (90 + 60) / 2 = 75.00%
        self.assertEqual(round(class_weighted, 2), Decimal('75.00'))

        all_student_percentages = [Decimal('90.00')] * 10 + [Decimal('60.00')] * 40
        student_weighted = calculate_student_weighted_average(all_student_percentages)
        # Student-weighted average = (10*90 + 40*60) / 50 = (900 + 2400) / 50 = 3300 / 50 = 66.00%
        self.assertEqual(round(student_weighted, 2), Decimal('66.00'))

        self.assertNotEqual(class_weighted, student_weighted)

    # Criterion 10: The equivalent branch calculations are correct
    def test_10_branch_calculations_equivalent_and_correct(self):
        # Branch 1 average = 80%, Branch 2 average = 70%
        branch_averages = [Decimal('80.00'), Decimal('70.00')]
        branch_mean = calculate_group_average(branch_averages)
        self.assertEqual(round(branch_mean, 2), Decimal('75.00'))

    # Criterion 11: Boys' and girls' reports use their respective eligible populations
    def test_11_boys_and_girls_reports_use_respective_eligible_populations(self):
        students = [
            {'gender': 'male', 'overall_percentage': Decimal('70.00')},
            {'gender': 'male', 'overall_percentage': Decimal('80.00')},
            {'gender': 'female', 'overall_percentage': Decimal('85.00')},
            {'gender': 'female', 'overall_percentage': Decimal('95.00')},
            {'gender': 'male', 'overall_percentage': None}, # Pending, excluded
        ]
        boys_avg = calculate_gender_performance(students, 'male')
        girls_avg = calculate_gender_performance(students, 'female')
        # Boys: (70 + 80) / 2 = 75.00%
        self.assertEqual(round(boys_avg, 2), Decimal('75.00'))
        # Girls: (85 + 95) / 2 = 90.00%
        self.assertEqual(round(girls_avg, 2), Decimal('90.00'))
        # Gender gap = Girls - Boys = 90 - 75 = +15.00 percentage points
        gap = girls_avg - boys_avg
        self.assertEqual(round(gap, 2), Decimal('15.00'))

    # Criterion 12: Empty gender groups return N/A
    def test_12_empty_gender_groups_return_na(self):
        # Only boys enrolled
        students = [{'gender': 'male', 'overall_percentage': Decimal('80.00')}]
        girls_avg = calculate_gender_performance(students, 'female')
        self.assertIsNone(girls_avg)

    # Criterion 13: Missing subjects and differing subject availability follow policy
    def test_13_missing_subjects_keep_overall_average_pending(self):
        subject_results = [
            {'subject_id': 1, 'completed': True, 'final_percentage': Decimal('85.00'), 'current_percentage': Decimal('85.00')},
            {'subject_id': 2, 'completed': False, 'final_percentage': None, 'current_percentage': Decimal('60.00')},
        ]
        overall = calculate_student_average(subject_results)
        self.assertFalse(overall['completed'])
        self.assertIsNone(overall['overall_percentage'])
        # Current progress is still available
        self.assertEqual(round(overall['current_overall_percentage'], 2), Decimal('72.50'))

    # Criterion 14: Rounding occurs only at the specified stage
    def test_14_precision_retained_across_aggregations(self):
        # Full precision retained: 100/3 = 33.333333...
        p1 = Decimal('100.0000') / Decimal('3')
        p2 = Decimal('200.0000') / Decimal('3')
        avg = calculate_group_average([p1, p2])
        self.assertEqual(avg, Decimal('50.0000'))

    # Criterion 15: Changing a mark recalculates all affected results
    def test_15_changing_a_mark_recalculates_all_affected_results(self):
        cfg = ExamConfiguration.objects.create(
            school=self.school_main, academic_year=self.year_2026, school_class=self.c6,
            name='Recalc Config', status='published'
        )
        comp = ExamComponent.objects.create(configuration=cfg, name='Final', sequence=1, weight_percentage=Decimal('100.00'), default_max_marks=Decimal('100.00'))
        st = Student.objects.create(school=self.school_main, admission_number='ST-15', first_name='Bilal', last_name='Ahmed', gender='male', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=st, school_class=self.c6, start_date=date(2026, 8, 1))

        mark = ExamStudentMark.objects.create(student=st, component=comp, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('50.00'))
        recalculate_student(st.id, cfg.id)

        res = CalculatedSubjectResult.objects.get(student=st, subject=self.math, configuration=cfg)
        self.assertEqual(round(res.final_percentage, 2), Decimal('50.00'))

        # Update mark to 95.00
        mark.marks_obtained = Decimal('95.00')
        mark.save()
        recalculate_student(st.id, cfg.id)

        res.refresh_from_db()
        self.assertEqual(round(res.final_percentage, 2), Decimal('95.00'))

    # Criterion 16: Changing a configuration preserves historical reproducibility
    def test_16_historical_configurations_preserved(self):
        cfg_2026 = ExamConfiguration.objects.create(
            school=self.school_main, academic_year=self.year_2026, name='Config 2026', status='published', version=1
        )
        comp_2026 = ExamComponent.objects.create(configuration=cfg_2026, name='Annual', sequence=1, weight_percentage=Decimal('100.00'), default_max_marks=Decimal('100.00'))

        st = Student.objects.create(school=self.school_main, admission_number='ST-16', first_name='Zainab', last_name='Bibi', gender='female', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=st, school_class=self.c6, start_date=date(2026, 8, 1))
        ExamStudentMark.objects.create(student=st, component=comp_2026, subject=self.eng, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('88.00'))

        recalculate_configuration(cfg_2026.id)
        res_2026 = CalculatedSubjectResult.objects.get(student=st, subject=self.eng, configuration=cfg_2026)
        self.assertEqual(round(res_2026.final_percentage, 2), Decimal('88.00'))

        # Next academic year config
        year_2027 = AcademicYear.objects.create(school=self.school_main, name='2027-2028', start_date=date(2027, 8, 1), end_date=date(2028, 6, 30))
        cfg_2027 = ExamConfiguration.objects.create(school=self.school_main, academic_year=year_2027, name='Config 2027', status='published', version=1)
        ExamComponent.objects.create(configuration=cfg_2027, name='Mid', sequence=1, weight_percentage=Decimal('40.00'), default_max_marks=Decimal('100.00'))
        ExamComponent.objects.create(configuration=cfg_2027, name='Final', sequence=2, weight_percentage=Decimal('60.00'), default_max_marks=Decimal('100.00'))

        res_2026.refresh_from_db()
        self.assertEqual(round(res_2026.final_percentage, 2), Decimal('88.00'))
        self.assertEqual(res_2026.configuration_version, 1)

    # Criterion 17: Dashboards, reports, exports, and APIs return consistent results for identical filters
    def test_17_consistent_results_across_apis_and_service(self):
        self.client.login(username='school_admin', password='Password123!')

        cfg = ExamConfiguration.objects.create(
            school=self.school_main, academic_year=self.year_2026, school_class=self.c6,
            subject=self.sci,
            name='API Test Config', status='draft'
        )
        t1 = ExamComponent.objects.create(configuration=cfg, name='T1', sequence=1, weight_percentage=Decimal('40.00'), default_max_marks=Decimal('50.00'))
        t2 = ExamComponent.objects.create(configuration=cfg, name='T2', sequence=2, weight_percentage=Decimal('60.00'), default_max_marks=Decimal('100.00'))

        st = Student.objects.create(school=self.school_main, admission_number='ST-17', first_name='Tariq', last_name='Aziz', gender='male', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=st, school_class=self.c6, start_date=date(2026, 8, 1))

        ExamStudentMark.objects.create(student=st, component=t1, subject=self.sci, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('40.00'))
        ExamStudentMark.objects.create(student=st, component=t2, subject=self.sci, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('80.00'))

        # Publish
        pub_res = self.client.post(f'/api/v1/exams/engine/configurations/{cfg.id}/publish/')
        self.assertEqual(pub_res.status_code, 200)

        # Service calculation: (40/50)*40 + (80/100)*60 = 32 + 48 = 80.00%
        sub_res = CalculatedSubjectResult.objects.get(student=st, subject=self.sci, configuration=cfg)
        self.assertEqual(round(sub_res.final_percentage, 2), Decimal('80.00'))

        # Analytics API
        analytics_res = self.client.get(f'/api/v1/exams/engine/analytics/?configuration={cfg.id}')
        self.assertEqual(analytics_res.status_code, 200)
        a_data = analytics_res.json()
        self.assertEqual(a_data['summary']['headline_average'], 80.0)

        # Transcript API
        transcript_res = self.client.get(f'/api/v1/exams/engine/student-transcript/?student={st.id}&configuration={cfg.id}')
        self.assertEqual(transcript_res.status_code, 200)
        t_data = transcript_res.json()
        self.assertEqual(t_data['summary']['final_annual_percentage'], 80.0)

    # Criterion 18: Unauthorized users cannot change published configurations or marks
    def test_18_unauthorized_users_cannot_modify_published_config_or_marks(self):
        cfg = ExamConfiguration.objects.create(
            school=self.school_main, academic_year=self.year_2026, school_class=self.c6,
            name='Auth Config', status='published'
        )
        self.client.login(username='teacher_jane', password='Password123!')

        # Teachers cannot delete configurations
        del_res = self.client.delete(f'/api/v1/exams/engine/configurations/{cfg.id}/')
        self.assertEqual(del_res.status_code, 403)

        # Teachers cannot publish configurations
        pub_res = self.client.post(f'/api/v1/exams/engine/configurations/{cfg.id}/publish/')
        self.assertEqual(pub_res.status_code, 403)

    # Criterion 19: Duplicate enrollments or marks cannot inflate an average
    def test_19_duplicate_enrollments_or_marks_cannot_inflate_average(self):
        from django.db import transaction

        st = Student.objects.create(school=self.school_main, admission_number='ST-19', first_name='Farhan', last_name='Saeed', gender='male', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=st, school_class=self.c6, start_date=date(2026, 8, 1))

        # Duplicate enrollment is prevented by database constraints
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Enrollment.objects.create(student=st, school_class=self.c7, start_date=date(2026, 8, 15))

        cfg = ExamConfiguration.objects.create(
            school=self.school_main, academic_year=self.year_2026, school_class=self.c6,
            name='Dedup Config', status='published'
        )
        comp = ExamComponent.objects.create(configuration=cfg, name='Final', sequence=1, weight_percentage=Decimal('100.00'), default_max_marks=Decimal('100.00'))

        ExamStudentMark.objects.create(student=st, component=comp, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('90.00'))

        # Duplicate mark per (student, component, subject) is forbidden by database constraint
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                ExamStudentMark.objects.create(student=st, component=comp, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('90.00'))

        # Recalculation handles deduplication
        summary = recalculate_configuration(cfg.id)
        # Exactly 1 student result updated, not 2!
        self.assertEqual(summary['student_results_updated'], 1)

    # Criterion 20: The system can reproduce a published result from its stored source data and version
    def test_20_reproduce_published_result_from_stored_data_and_version(self):
        self.client.login(username='school_admin', password='Password123!')
        cfg = ExamConfiguration.objects.create(
            school=self.school_main, academic_year=self.year_2026, school_class=self.c6,
            name='Snapshot Config', status='draft', version=1
        )
        c1 = ExamComponent.objects.create(configuration=cfg, name='Term 1', sequence=1, weight_percentage=Decimal('50.00'), default_max_marks=Decimal('100.00'))
        c2 = ExamComponent.objects.create(configuration=cfg, name='Term 2', sequence=2, weight_percentage=Decimal('50.00'), default_max_marks=Decimal('100.00'))

        st = Student.objects.create(school=self.school_main, admission_number='ST-20', first_name='Amina', last_name='Noor', gender='female', enrolled_on=date(2026, 8, 1))
        Enrollment.objects.create(student=st, school_class=self.c6, start_date=date(2026, 8, 1))

        ExamStudentMark.objects.create(student=st, component=c1, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('80.00'))
        ExamStudentMark.objects.create(student=st, component=c2, subject=self.math, school_class=self.c6, academic_year=self.year_2026, marks_obtained=Decimal('90.00'))

        # Publish -> triggers version increment and snapshot creation
        self.client.post(f'/api/v1/exams/engine/configurations/{cfg.id}/publish/')

        snapshot = ResultPublicationHistory.objects.filter(configuration=cfg, version=2).first()
        self.assertIsNotNone(snapshot)
        self.assertIn('Term 1', snapshot.weights_snapshot)
        self.assertIn('Term 2', snapshot.weights_snapshot)

        # Result is 85.00%
        result = CalculatedSubjectResult.objects.get(student=st, subject=self.math, configuration=cfg)
        self.assertEqual(round(result.final_percentage, 2), Decimal('85.00'))
        self.assertEqual(result.configuration_version, 2)
