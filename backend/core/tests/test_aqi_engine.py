"""Comprehensive Unit and Integration Tests for Academic Quality Index (AQI) & Examination Engine.

Verifies:
1. Authoritative calculation formulas (Spec & Appendix A):
   - Term normalization & subject final percentage
   - Student overall average (equal weighting)
   - Subject average across eligible students
   - Class performance metric (mean of included subject averages)
   - Campus class-weighted vs student-weighted averages
   - School-wide class-weighted vs student-weighted averages (computed directly, never campus averages)
   - Gender performance gap in percentage points ('pp')
   - Ongoing performance metrics
2. Golden Rule role visibility matrix:
   - Org admin: sees all 5 levels, campus filter on every page
   - Principal: own campus only (starts at Level 2). Level 1 or other campus -> 404
   - Class teacher: own class only (starts at Level 3). Other classes/campuses -> 404
   - Subject teacher: own assigned (class, subject) pair only (Level 4). Other subjects -> 404. Student profile restricted
   - Student & Parent: Level 5 only (own profile / child). Group size < 5 privacy masking
3. Exam structure configuration & publishing snapshots
4. Marks grid entry validation
5. Trace explanation drawer
6. Universal scoped exports
"""
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import NotFound

from core.models import (
    Organisation, School, SchoolClass, Subject, AcademicYear, Student, Enrollment, User,
    Assessment, Grade, TeachingAssignment, ClassTeacherAssignment,
    ExamStructure, ExamStructureVersion, ExamTerm, TermSubjectMax,
    AssessmentExemption, Section, ClassSubject
)
from core.services.aqi_scope import aqi_scope, AQIScope
from core.services.aqi_engine import (
    to_decimal, round_display, calculate_term_normalized_percentage,
    calculate_final_subject_percentage, calculate_student_overall_average,
    calculate_subject_average, calculate_class_average,
    calculate_campus_averages, calculate_school_wide_averages,
    calculate_gender_analytics, calculate_relative_performance,
    get_school_wide_aqi, get_campus_aqi, get_class_aqi, get_subject_aqi,
    get_student_aqi_profile, get_trace_explanation
)


class AQICalculationEngineTests(TestCase):
    """Verifies pure math formulas and Decimal precision without intermediate rounding."""

    def test_term_normalization_and_genuine_zero(self):
        # Genuine 0 is valid
        zero_pct = calculate_term_normalized_percentage(Decimal('0.00'), Decimal('50.00'))
        self.assertEqual(zero_pct, Decimal('0.0000'))

        # Missing is None
        none_pct = calculate_term_normalized_percentage(None, Decimal('50.00'))
        self.assertIsNone(none_pct)

        # Standard calculation: 40/50 = 80%
        std_pct = calculate_term_normalized_percentage(Decimal('40.00'), Decimal('50.00'))
        self.assertEqual(std_pct, Decimal('80.0000'))

    def test_final_subject_percentage_three_terms(self):
        # Spec Appendix A Part 2 Example:
        # Term 1: 40/50 (80%) * 20% = 16.00%
        # Term 2: 75/100 (75%) * 30% = 22.50%
        # Term 3: 45/50 (90%) * 50% = 45.00%
        # Expected Final % = 16.00 + 22.50 + 45.00 = 83.50%
        terms = [
            {'term_name': 'Term 1', 'obtained_marks': Decimal('40.00'), 'max_marks': Decimal('50.00'), 'contribution_percentage': Decimal('20.00')},
            {'term_name': 'Term 2', 'obtained_marks': Decimal('75.00'), 'max_marks': Decimal('100.00'), 'contribution_percentage': Decimal('30.00')},
            {'term_name': 'Term 3', 'obtained_marks': Decimal('45.00'), 'max_marks': Decimal('50.00'), 'contribution_percentage': Decimal('50.00')},
        ]
        res = calculate_final_subject_percentage(terms, reporting_scale=Decimal('100.00'))
        self.assertEqual(res['status'], 'complete')
        self.assertEqual(res['final_percentage'], Decimal('83.5000'))
        self.assertEqual(res['scaled_marks'], Decimal('83.5000'))

    def test_missing_term_leaves_status_pending(self):
        terms = [
            {'term_name': 'Term 1', 'obtained_marks': Decimal('40.00'), 'max_marks': Decimal('50.00'), 'contribution_percentage': Decimal('20.00')},
            {'term_name': 'Term 2', 'obtained_marks': None, 'max_marks': Decimal('100.00'), 'contribution_percentage': Decimal('30.00')},
            {'term_name': 'Term 3', 'obtained_marks': Decimal('45.00'), 'max_marks': Decimal('50.00'), 'contribution_percentage': Decimal('50.00')},
        ]
        res = calculate_final_subject_percentage(terms)
        self.assertEqual(res['status'], 'pending')
        self.assertIsNone(res['final_percentage'])
        # Ongoing performance still tracks completed assessments
        self.assertEqual(res['assessed_weight'], Decimal('70.00'))
        self.assertEqual(res['accumulated_points'], Decimal('61.00'))

    def test_student_overall_average(self):
        # 4 required subjects: 80%, 90%, 70%, 100% -> Mean = 85.00%
        subjects = [
            {'subject_name': 'Math', 'final_percentage': Decimal('80.00'), 'status': 'complete', 'required': True},
            {'subject_name': 'Science', 'final_percentage': Decimal('90.00'), 'status': 'complete', 'required': True},
            {'subject_name': 'English', 'final_percentage': Decimal('70.00'), 'status': 'complete', 'required': True},
            {'subject_name': 'History', 'final_percentage': Decimal('100.00'), 'status': 'complete', 'required': True},
        ]
        res = calculate_student_overall_average(subjects, required_subject_count=4)
        self.assertEqual(res['status'], 'complete')
        self.assertEqual(res['overall_percentage'], Decimal('85.0000'))

    def test_student_overall_with_missing_subject_is_pending(self):
        subjects = [
            {'subject_name': 'Math', 'final_percentage': Decimal('80.00'), 'status': 'complete', 'required': True},
            {'subject_name': 'Science', 'final_percentage': None, 'status': 'pending', 'required': True},
        ]
        res = calculate_student_overall_average(subjects, required_subject_count=2)
        self.assertEqual(res['status'], 'pending')
        self.assertIsNone(res['overall_percentage'])

    def test_class_average_of_included_subject_averages(self):
        # 3 subjects: Subj A (80%), Subj B (70%), Subj C (90%) -> Class avg = 80.00%
        inc_avgs = [Decimal('80.00'), Decimal('70.00'), Decimal('90.00')]
        res = calculate_class_average(inc_avgs, total_subject_count=3)
        self.assertEqual(res['class_average'], Decimal('80.0000'))
        self.assertEqual(res['coverage'], Decimal('100.0000'))

    def test_gender_analytics_and_percentage_points_gap(self):
        # Boys avg: 70%, Girls avg: 75% -> Gap = Girls - Boys = +5.00 pp
        boys = [Decimal('60.00'), Decimal('80.00')]  # mean 70%
        girls = [Decimal('70.00'), Decimal('80.00')]  # mean 75%
        res = calculate_gender_analytics(boys, girls)
        self.assertEqual(res['boys_average'], Decimal('70.0000'))
        self.assertEqual(res['girls_average'], Decimal('75.0000'))
        self.assertEqual(res['gender_gap_pp'], Decimal('5.0000'))

    def test_school_wide_averages_never_average_of_campus_averages(self):
        # Direct calculation across all classes:
        # Campus 1 has 1 class with avg 90%
        # Campus 2 has 3 classes with avgs 50%, 60%, 70% (mean 60%)
        # Campus average of averages would give (90 + 60) / 2 = 75% (WRONG)
        # Direct class-weighted school-wide: (90 + 50 + 60 + 70) / 4 = 270 / 4 = 67.5% (CORRECT)
        classes = [Decimal('90.00'), Decimal('50.00'), Decimal('60.00'), Decimal('70.00')]
        res = calculate_school_wide_averages(classes, [])
        self.assertEqual(res['class_weighted_average'], Decimal('67.5000'))


class AQIVisibilityAndEndpointsTests(TestCase):
    """Verifies strict Golden Rule role-based scoping at all 5 levels."""

    def setUp(self):
        self.client = APIClient()

        # Organisation & 2 Campuses
        self.org = Organisation.objects.create(name="Beacon Education Network")
        self.campus1 = School.objects.create(name="Campus North", code="CN1", organisation=self.org)
        self.campus2 = School.objects.create(name="Campus South", code="CS2", organisation=self.org)

        self.ay = AcademicYear.objects.create(
            name="2025-2026", school=self.campus1, start_date="2025-08-01", end_date="2026-06-30"
        )

        # Classes
        self.class1 = SchoolClass.objects.create(name="Class 7", section="A", school=self.campus1, academic_year=self.ay)
        self.class2 = SchoolClass.objects.create(name="Class 8", section="B", school=self.campus1, academic_year=self.ay)
        self.class_other = SchoolClass.objects.create(name="Class 9", section="A", school=self.campus2, academic_year=self.ay)

        # Subjects
        self.sub_math = Subject.objects.create(name="Mathematics", code="MATH1", school=self.campus1)
        self.sub_sci = Subject.objects.create(name="Science", code="SCI1", school=self.campus1)
        self.sub_other = Subject.objects.create(name="English", code="ENG2", school=self.campus2)

        # Students in Class 1
        self.student_boy = Student.objects.create(
            first_name="Ali", last_name="Khan", admission_number="ST-001",
            school=self.campus1, gender='male', enrolled_on="2025-08-01"
        )
        self.student_girl = Student.objects.create(
            first_name="Sara", last_name="Ahmed", admission_number="ST-002",
            school=self.campus1, gender='female', enrolled_on="2025-08-01"
        )
        self.enr_boy = Enrollment.objects.create(student=self.student_boy, school_class=self.class1, start_date="2025-08-01")
        self.enr_girl = Enrollment.objects.create(student=self.student_girl, school_class=self.class1, start_date="2025-08-01")

        # Students in Campus 2
        self.student_other = Student.objects.create(
            first_name="Zain", last_name="Malik", admission_number="ST-003",
            school=self.campus2, gender='male', enrolled_on="2025-08-01"
        )
        self.enr_other = Enrollment.objects.create(student=self.student_other, school_class=self.class_other, start_date="2025-08-01")

        # Users for each role
        self.org_admin = User.objects.create_user(
            username="org_admin", email="admin@beacon.org", password="pass",
            role="organisation_admin", organisation=self.org
        )
        self.principal_c1 = User.objects.create_user(
            username="principal_c1", email="principal@c1.org", password="pass",
            role="principal", school=self.campus1, organisation=self.org
        )
        self.teacher_class1 = User.objects.create_user(
            username="teacher_c1", email="teacher_c1@c1.org", password="pass",
            role="teacher", school=self.campus1, organisation=self.org
        )
        self.teacher_math_only = User.objects.create_user(
            username="teacher_math", email="math@c1.org", password="pass",
            role="teacher", school=self.campus1, organisation=self.org
        )
        self.user_student = User.objects.create_user(
            username="user_student", email="ali@c1.org", password="pass",
            role="student", school=self.campus1, organisation=self.org
        )
        self.student_boy.user = self.user_student
        self.student_boy.save()

        self.user_parent = User.objects.create_user(
            username="user_parent", email="parent@c1.org", password="pass",
            role="parent", school=self.campus1, organisation=self.org
        )
        self.user_parent.wards.add(self.student_boy)

        # Assignments
        # teacher_class1 is Class Teacher of class1
        ClassTeacherAssignment.objects.create(
            teacher=self.teacher_class1, school_class=self.class1, start_date="2025-08-01"
        )
        # teacher_math_only teaches MATH in class1 (subject teacher only)
        TeachingAssignment.objects.create(
            teacher=self.teacher_math_only, school=self.campus1,
            school_class=self.class1, subject=self.sub_math, start_date="2025-08-01"
        )

        # Exam Structure & Assessments
        self.struct = ExamStructure.objects.create(
            name="Annual Exam 2025-26", organisation=self.org, school=self.campus1, academic_year=self.ay,
            reporting_scale=Decimal('100.00'), pass_percentage=Decimal('40.00'), status='published'
        )
        self.struct.classes.add(self.class1)
        self.term1 = ExamTerm.objects.create(structure=self.struct, name="Midterm", order=1, contribution=Decimal('40.00'))
        self.term2 = ExamTerm.objects.create(structure=self.struct, name="Final", order=2, contribution=Decimal('60.00'))

        # Grades for Math
        self.ass_math_t1 = Assessment.objects.create(
            title="Midterm Math", school_class=self.class1, subject=self.sub_math, date="2025-10-15",
            exam_term=self.term1, max_marks=Decimal('50.00'), weight=Decimal('40.00'), published=True
        )
        self.ass_math_t2 = Assessment.objects.create(
            title="Final Math", school_class=self.class1, subject=self.sub_math, date="2025-12-15",
            exam_term=self.term2, max_marks=Decimal('100.00'), weight=Decimal('60.00'), published=True
        )
        Grade.objects.create(assessment=self.ass_math_t1, student=self.student_boy, marks=Decimal('40.00'), result_status='recorded')
        Grade.objects.create(assessment=self.ass_math_t2, student=self.student_boy, marks=Decimal('80.00'), result_status='recorded')

        Grade.objects.create(assessment=self.ass_math_t1, student=self.student_girl, marks=Decimal('45.00'), result_status='recorded')
        Grade.objects.create(assessment=self.ass_math_t2, student=self.student_girl, marks=Decimal('90.00'), result_status='recorded')

    def test_golden_rule_org_admin_sees_all_levels(self):
        self.client.force_authenticate(user=self.org_admin)

        # Level 1 Overview
        res = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('campuses', res.data)

        # Level 2 Campus
        res = self.client.get(f'/api/v1/aqi/campus/{self.campus1.id}/')
        self.assertEqual(res.status_code, 200)

        # Level 3 Class
        res = self.client.get(f'/api/v1/aqi/class/{self.class1.id}/')
        self.assertEqual(res.status_code, 200)

        # Level 4 Subject
        res = self.client.get(f'/api/v1/aqi/class/{self.class1.id}/subject/{self.sub_math.id}/')
        self.assertEqual(res.status_code, 200)

        # Level 5 Student
        res = self.client.get(f'/api/v1/aqi/student/{self.student_boy.id}/')
        self.assertEqual(res.status_code, 200)

    def test_golden_rule_principal_isolated_to_own_campus(self):
        self.client.force_authenticate(user=self.principal_c1)

        # Level 1 Overview -> Strictly 404
        res = self.client.get('/api/v1/aqi/overview/')
        self.assertEqual(res.status_code, 404)

        # Other Campus (Campus 2) -> Strictly 404
        res = self.client.get(f'/api/v1/aqi/campus/{self.campus2.id}/')
        self.assertEqual(res.status_code, 404)

        # Own Campus (Campus 1) -> 200
        res = self.client.get(f'/api/v1/aqi/campus/{self.campus1.id}/')
        self.assertEqual(res.status_code, 200)
        # Verify no organisation-wide numbers appear in principal's payload
        self.assertNotIn('total_campuses', res.data)
        self.assertNotIn('school_wide', res.data)

        # Class in other campus -> 404
        res = self.client.get(f'/api/v1/aqi/class/{self.class_other.id}/')
        self.assertEqual(res.status_code, 404)

    def test_golden_rule_class_teacher_isolated_to_own_class(self):
        self.client.force_authenticate(user=self.teacher_class1)

        # Level 1 and Level 2 -> 404
        self.assertEqual(self.client.get('/api/v1/aqi/overview/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/aqi/campus/{self.campus1.id}/').status_code, 404)

        # Own Class -> 200
        res = self.client.get(f'/api/v1/aqi/class/{self.class1.id}/')
        self.assertEqual(res.status_code, 200)

        # Other Class in same campus -> 404
        self.assertEqual(self.client.get(f'/api/v1/aqi/class/{self.class2.id}/').status_code, 404)

    def test_golden_rule_subject_teacher_isolated_to_assigned_subject(self):
        self.client.force_authenticate(user=self.teacher_math_only)

        # Level 1, 2, 3 -> 404
        self.assertEqual(self.client.get('/api/v1/aqi/overview/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/aqi/campus/{self.campus1.id}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/aqi/class/{self.class1.id}/').status_code, 404)

        # Assigned Subject (Class 1, Math) -> 200
        res = self.client.get(f'/api/v1/aqi/class/{self.class1.id}/subject/{self.sub_math.id}/')
        self.assertEqual(res.status_code, 200)

        # Unassigned Subject (Class 1, Science) -> 404
        self.assertEqual(
            self.client.get(f'/api/v1/aqi/class/{self.class1.id}/subject/{self.sub_sci.id}/').status_code,
            404
        )

        # Student Profile: Shows only their subject; overall percentage is suppressed
        res = self.client.get(f'/api/v1/aqi/student/{self.student_boy.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertIsNone(res.data.get('overall_percentage'))
        # Only Math is in the subjects list
        subject_names = [s['subject_name'] for s in res.data.get('subjects', [])]
        self.assertEqual(subject_names, ['Mathematics'])

    def test_golden_rule_student_and_parent_privacy(self):
        # Student sees only own profile
        self.client.force_authenticate(user=self.user_student)
        self.assertEqual(self.client.get('/api/v1/aqi/overview/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/aqi/campus/{self.campus1.id}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/aqi/class/{self.class1.id}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/v1/aqi/student/{self.student_girl.id}/').status_code, 404)

        # My profile works
        res = self.client.get('/api/v1/aqi/my-profile/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['student_id'], self.student_boy.id)

        # Privacy rule: Group size < 5 -> group averages are hidden
        # Only 1 boy and 1 girl in class1 -> both counts < 5
        self.assertIsNone(res.data.get('boys_class_average'))
        self.assertEqual(res.data.get('boys_privacy_notice'), "Not enough students to show")
        self.assertIsNone(res.data.get('girls_class_average'))
        self.assertEqual(res.data.get('girls_privacy_notice'), "Not enough students to show")

        # Parent sees linked child only
        self.client.force_authenticate(user=self.user_parent)
        res = self.client.get(f'/api/v1/aqi/student/{self.student_boy.id}/')
        self.assertEqual(res.status_code, 200)
        # Parent cannot see other student
        self.assertEqual(self.client.get(f'/api/v1/aqi/student/{self.student_girl.id}/').status_code, 404)

    def test_marks_grid_get_and_post_validation(self):
        self.client.force_authenticate(user=self.teacher_math_only)

        # GET marks grid
        res = self.client.get(
            f"/api/v1/aqi/marks-grid/?class_id={self.class1.id}&subject_id={self.sub_math.id}&term_id={self.term1.id}"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['students']), 2)

        # POST valid marks
        post_data = {
            'class_id': self.class1.id,
            'subject_id': self.sub_math.id,
            'term_id': self.term1.id,
            'entries': [
                {'student_id': self.student_boy.id, 'marks': '42.50', 'result_status': 'recorded'}
            ]
        }
        res = self.client.post('/api/v1/aqi/marks-grid/', post_data, format='json')
        self.assertEqual(res.status_code, 200)

        # POST marks exceeding max -> 400
        invalid_data = {
            'class_id': self.class1.id,
            'subject_id': self.sub_math.id,
            'term_id': self.term1.id,
            'entries': [
                {'student_id': self.student_boy.id, 'marks': '999.00', 'result_status': 'recorded'}
            ]
        }
        res = self.client.post('/api/v1/aqi/marks-grid/', invalid_data, format='json')
        self.assertEqual(res.status_code, 400)

    def test_explain_drawer_trace(self):
        self.client.force_authenticate(user=self.org_admin)
        res = self.client.get(
            f"/api/v1/aqi/explain/?type=student_subject&student_id={self.student_boy.id}&subject_id={self.sub_math.id}"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn('formula', res.data)
        self.assertIn('steps', res.data)
        self.assertTrue(len(res.data['steps']) >= 2)

    def test_exam_structure_publishing_validation(self):
        self.client.force_authenticate(user=self.org_admin)

        # Create new draft structure with invalid term contribution (does not sum to 100%)
        draft = ExamStructure.objects.create(
            name="Draft Structure", organisation=self.org, school=self.campus1, reporting_scale=Decimal('100.00'),
            pass_percentage=Decimal('40.00'), status='draft'
        )
        ExamTerm.objects.create(structure=draft, name="T1", order=1, contribution=Decimal('30.00'))
        ExamTerm.objects.create(structure=draft, name="T2", order=2, contribution=Decimal('50.00'))  # sums to 80%

        # Attempt to publish -> 400
        res = self.client.post(f'/api/v1/aqi/structures/{draft.id}/publish/')
        self.assertEqual(res.status_code, 400)

        # Fix contribution to 70% (total 100%)
        ExamTerm.objects.filter(structure=draft, name="T2").update(contribution=Decimal('70.00'))
        res = self.client.post(f'/api/v1/aqi/structures/{draft.id}/publish/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('snapshot_hash', res.data)
        draft.refresh_from_db()
        self.assertEqual(draft.status, 'published')
        self.assertEqual(draft.versions.count(), 1)

    def test_aqi_export_formats(self):
        self.client.force_authenticate(user=self.org_admin)
        for fmt in ('csv', 'xlsx'):
            res = self.client.get(f'/api/v1/aqi/export/?level=1&format={fmt}')
            self.assertEqual(res.status_code, 200)
            self.assertTrue(len(res.content) > 0)

