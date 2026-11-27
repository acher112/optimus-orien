from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Subject, Student,
    Enrollment, GradingScale, GradeBand, AssessmentCategory, Assessment, Grade
)


class CustomWeightageAndPresetsTests(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name='Test Org', code='test-custom-wt')
        self.school = School.objects.create(organisation=self.org, name='Weightage Campus', code='WC1')
        self.admin = User.objects.create_user(
            username='admin_wt', password='password123',
            organisation=self.org, school=self.school, role='school_admin'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

        self.year = AcademicYear.objects.create(
            school=self.school, name='2026-2027',
            start_date='2026-08-01', end_date='2027-06-30'
        )
        self.cls = SchoolClass.objects.create(
            school=self.school, academic_year=self.year, name='Grade 10', section='A'
        )
        self.student = Student.objects.create(
            school=self.school, first_name='Zain', last_name='Ahmed',
            admission_number='STU-1001', enrolled_on='2026-08-01'
        )
        Enrollment.objects.create(
            student=self.student, school_class=self.cls, start_date='2026-08-01'
        )

    def test_model_clean_valid_custom_components(self):
        """GradingScale accepts custom components when total weight sums to 100%."""
        scale = GradingScale(
            school=self.school,
            name='Science Stream Criteria',
            exam_weight=Decimal('50.00'),
            homework_weight=Decimal('15.00'),
            classwork_weight=Decimal('15.00'),
            attendance_weight=Decimal('5.00'),
            custom_components=[
                {'id': 'c1', 'name': 'Lab & Practical', 'weight': 15.0}
            ]
        )
        # 50 + 15 + 15 + 5 + 15 = 100.00%
        scale.clean()
        scale.save()
        self.assertEqual(len(scale.custom_components), 1)
        self.assertEqual(scale.custom_components[0]['name'], 'Lab & Practical')

    def test_model_clean_invalid_total_weight_raises(self):
        """GradingScale rejects configurations where sum != 100%."""
        scale = GradingScale(
            school=self.school,
            name='Invalid Scale',
            exam_weight=Decimal('50.00'),
            homework_weight=Decimal('20.00'),
            classwork_weight=Decimal('15.00'),
            attendance_weight=Decimal('5.00'),
            custom_components=[
                {'id': 'c1', 'name': 'Lab & Practical', 'weight': 20.0}
            ]
        )
        # Sum is 110% -> should raise ValidationError
        with self.assertRaises(ValidationError):
            scale.clean()

    def test_api_create_and_update_scale_with_custom_components_and_presets(self):
        """API endpoints create and update custom components and presets accurately."""
        payload = {
            'name': 'Robotics & STEM Scale',
            'school': self.school.id,
            'exam_weight': '40.00',
            'homework_weight': '20.00',
            'classwork_weight': '15.00',
            'attendance_weight': '5.00',
            'custom_components': [
                {'id': 'c_lab', 'name': 'Lab Practical', 'weight': 10.0, 'description': 'Practical lab evaluation'},
                {'id': 'c_proj', 'name': 'Project Work', 'weight': 10.0, 'description': 'Capstone project'}
            ],
            'custom_presets': [
                {
                    'id': 'pre_stem',
                    'name': 'STEM Intensive (40/20/15/5/20)',
                    'exam_weight': 40, 'homework_weight': 20, 'classwork_weight': 15, 'attendance_weight': 5,
                    'custom_components': [
                        {'id': 'c_lab', 'name': 'Lab Practical', 'weight': 10.0},
                        {'id': 'c_proj', 'name': 'Project Work', 'weight': 10.0}
                    ]
                }
            ],
            'passing_percentage': '40.00',
            'bands': [
                {'letter': 'A', 'min_percent': 80, 'max_percent': 100, 'grade_point': 4.0},
                {'letter': 'B', 'min_percent': 50, 'max_percent': 79.99, 'grade_point': 3.0},
                {'letter': 'F', 'min_percent': 0, 'max_percent': 49.99, 'grade_point': 0.0}
            ]
        }
        res = self.client.post('/api/v1/exams/grading-scales/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        scale_id = res.data['id']
        self.assertEqual(len(res.data['custom_components']), 2)
        self.assertEqual(len(res.data['custom_presets']), 1)

        # Retrieve detail
        get_res = self.client.get(f'/api/v1/exams/grading-scales/{scale_id}/')
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(len(get_res.data['custom_components']), 2)
        self.assertEqual(get_res.data['custom_presets'][0]['name'], 'STEM Intensive (40/20/15/5/20)')

        # PUT update with updated weights
        put_payload = {
            'name': 'Robotics & STEM Scale V2',
            'exam_weight': '45.00',
            'homework_weight': '15.00',
            'classwork_weight': '15.00',
            'attendance_weight': '5.00',
            'custom_components': [
                {'id': 'c_lab', 'name': 'Lab Practical', 'weight': 20.0, 'description': 'Updated lab weight'}
            ],
            'custom_presets': get_res.data['custom_presets']
        }
        put_res = self.client.put(f'/api/v1/exams/grading-scales/{scale_id}/', put_payload, format='json')
        self.assertEqual(put_res.status_code, 200)
        self.assertEqual(len(put_res.data['custom_components']), 1)
        self.assertEqual(put_res.data['custom_components'][0]['weight'], 20.0)

    def test_composite_evaluation_math_with_custom_components(self):
        """Composite evaluation calculation incorporates custom component weights and scores with exact math."""
        scale = GradingScale.objects.create(
            school=self.school,
            name='Composite Math Scale',
            is_default=True,
            exam_weight=Decimal('50.00'),
            homework_weight=Decimal('20.00'),
            classwork_weight=Decimal('10.00'),
            attendance_weight=Decimal('5.00'),
            custom_components=[
                {'id': 'c_lab', 'name': 'Lab Practical', 'weight': 15.0, 'description': 'Laboratory performance'}
            ],
            passing_percentage=Decimal('50.00')
        )
        GradeBand.objects.create(
            grading_scale=scale, min_percent=Decimal('80.00'), max_percent=Decimal('100.00'),
            letter='A', grade_point=Decimal('4.00'), description='Distinction'
        )
        GradeBand.objects.create(
            grading_scale=scale, min_percent=Decimal('50.00'), max_percent=Decimal('79.99'),
            letter='B', grade_point=Decimal('3.00'), description='Pass'
        )
        GradeBand.objects.create(
            grading_scale=scale, min_percent=Decimal('0.00'), max_percent=Decimal('49.99'),
            letter='F', grade_point=Decimal('0.00'), description='Fail'
        )

        # Create assessment and grade for student for Lab Practical
        subj = Subject.objects.create(school=self.school, name='Physics', code='PHY')
        ass = Assessment.objects.create(
            school_class=self.cls, subject=subj,
            title='Physics Lab Practical Exam', max_marks=Decimal('50.00'),
            date='2026-09-15', published=True
        )
        Grade.objects.create(
            assessment=ass, student=self.student, marks=Decimal('45.00')
        )

        res = self.client.get(f'/api/v1/exams/grading-scales/composite-evaluation/?student={self.student.id}')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(len(res.data['results']) > 0)
        first_res = res.data['results'][0]
        comp_names = [c['component'] for c in first_res['components']]
        self.assertIn('Lab Practical', comp_names)

        lab_comp = next(c for c in first_res['components'] if c['component'] == 'Lab Practical')
        self.assertEqual(lab_comp['weight'], 15.0)
        self.assertEqual(lab_comp['score'], 90.0)
        # Contribution = 90.0 * 15.0 / 100.0 = 13.5
        self.assertAlmostEqual(lab_comp['contribution'], 13.5, places=2)
