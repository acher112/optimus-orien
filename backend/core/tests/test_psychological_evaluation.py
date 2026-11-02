"""Automated Acceptance Tests for Psychological Evaluation Module.

Verifies all 20 acceptance criteria from Developer Implementation Specification Version 1.0:
1. Administrator can access records across all authorized schools.
2. Principal cannot access another school's records (HTTP 403 / scoped).
3. Class teacher can evaluate only assigned students.
4. Subject teacher can evaluate only students in assigned classes and subjects.
5. Student can view only their own published profile.
6. Unobserved items are excluded from calculations (null never treated as zero).
7. A domain with fewer than two valid responses displays insufficient observations.
8. Domain score calculations match the documented formula ((Average - 1) / 4) * 100.
9. Separate teacher submissions remain independently accessible.
10. Combined profiles require at least two eligible teacher evaluations.
11. Radar-chart values match backend domain scores.
12. Historical comparisons use the correct questionnaire version.
13. Unpublished evaluations are not visible to students.
14. Internal notes are never exposed to students.
15. Gender analytics do not infer or merge missing gender records.
16. Unauthorized API requests are rejected (HTTP 403).
17. All submissions and amendments are recorded in audit logs.
18. Dashboard aggregates reconcile with underlying eligible records.
19. Submission payloads with draft and revise workflows work correctly.
20. No diagnosis or fixed personality label is generated from the scores.
"""
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Section, Subject,
    Student, Enrollment, ClassTeacherAssignment, TeachingAssignment,
    EvaluationTemplate, EvaluationDimension, EvaluationQuestion,
    WeeklyEvaluation, EvaluationResponse, EvaluationDomainScore,
    EvaluationPublication, EvaluationAuditLog, EvaluationSafeguardingReferral
)
from core.services.psychological_evaluation import (
    ensure_default_template, calculate_evaluation_scores,
    get_student_combined_profile, get_student_history_timeline,
    get_hierarchical_dashboard, save_evaluation
)


class PsychologicalEvaluationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()

        # Organisation & 2 Schools (to test isolation)
        self.org = Organisation.objects.create(name='Global Education Trust', code='get-org', allow_org_admin_student_access=True)
        self.school_a = School.objects.create(organisation=self.org, name='Campus Alpha', code='ALPHA')
        self.school_b = School.objects.create(organisation=self.org, name='Campus Beta', code='BETA')

        # Users
        self.admin = User.objects.create_user(
            username='sysadmin', password='Password123!', role='organisation_admin',
            organisation=self.org, school=self.school_a, is_staff=True
        )
        self.principal_a = User.objects.create_user(
            username='principal_a', password='Password123!', role='principal',
            organisation=self.org, school=self.school_a
        )
        self.principal_b = User.objects.create_user(
            username='principal_b', password='Password123!', role='principal',
            organisation=self.org, school=self.school_b
        )
        self.teacher_class = User.objects.create_user(
            username='class_teacher_john', password='Password123!', role='teacher',
            organisation=self.org, school=self.school_a
        )
        self.teacher_subject = User.objects.create_user(
            username='subject_teacher_mary', password='Password123!', role='teacher',
            organisation=self.org, school=self.school_a
        )
        self.teacher_unassigned = User.objects.create_user(
            username='unassigned_teacher', password='Password123!', role='teacher',
            organisation=self.org, school=self.school_a
        )

        # Academic structure for Campus Alpha
        self.year_a = AcademicYear.objects.create(
            school=self.school_a, name='2026-2027',
            start_date=self.today - timedelta(days=60), end_date=self.today + timedelta(days=300)
        )
        self.class_a1 = SchoolClass.objects.create(
            school=self.school_a, academic_year=self.year_a, name='Grade 7', section='A',
            grade_level='7', teacher=self.teacher_class
        )
        self.class_a2 = SchoolClass.objects.create(
            school=self.school_a, academic_year=self.year_a, name='Grade 8', section='B',
            grade_level='8'
        )

        # Subjects
        self.sub_math = Subject.objects.create(school=self.school_a, name='Mathematics', code='MTH')
        self.sub_sci = Subject.objects.create(school=self.school_a, name='Science', code='SCI')

        # Assignments
        ClassTeacherAssignment.objects.create(
            school_class=self.class_a1, teacher=self.teacher_class, start_date=self.today - timedelta(days=30)
        )
        TeachingAssignment.objects.create(
            school=self.school_a, teacher=self.teacher_subject, school_class=self.class_a1,
            subject=self.sub_math, start_date=self.today - timedelta(days=30)
        )

        # Students in Campus Alpha
        self.student_user1 = User.objects.create_user(
            username='student1', password='Password123!', role='student',
            organisation=self.org, school=self.school_a
        )
        self.student1 = Student.objects.create(
            school=self.school_a, admission_number='ALP-001', first_name='Alice', last_name='Smith',
            gender='female', user=self.student_user1, enrolled_on=self.today - timedelta(days=50)
        )
        Enrollment.objects.create(
            student=self.student1, school_class=self.class_a1, start_date=self.today - timedelta(days=50)
        )

        self.student_user2 = User.objects.create_user(
            username='student2', password='Password123!', role='student',
            organisation=self.org, school=self.school_a
        )
        self.student2 = Student.objects.create(
            school=self.school_a, admission_number='ALP-002', first_name='Bob', last_name='Jones',
            gender='male', user=self.student_user2, enrolled_on=self.today - timedelta(days=50)
        )
        Enrollment.objects.create(
            student=self.student2, school_class=self.class_a1, start_date=self.today - timedelta(days=50)
        )

        self.student_unrecorded = Student.objects.create(
            school=self.school_a, admission_number='ALP-003', first_name='Sam', last_name='Taylor',
            gender='not_recorded', enrolled_on=self.today - timedelta(days=50)
        )
        Enrollment.objects.create(
            student=self.student_unrecorded, school_class=self.class_a1, start_date=self.today - timedelta(days=50)
        )

        # Student in Campus Beta
        self.year_b = AcademicYear.objects.create(
            school=self.school_b, name='2026-2027',
            start_date=self.today - timedelta(days=60), end_date=self.today + timedelta(days=300)
        )
        self.class_b1 = SchoolClass.objects.create(
            school=self.school_b, academic_year=self.year_b, name='Grade 7-Beta', section='A', grade_level='7'
        )
        self.student_beta = Student.objects.create(
            school=self.school_b, admission_number='BET-001', first_name='Charlie', last_name='Brown',
            gender='male', enrolled_on=self.today - timedelta(days=50)
        )
        Enrollment.objects.create(
            student=self.student_beta, school_class=self.class_b1, start_date=self.today - timedelta(days=50)
        )

        # Template setup
        self.template = ensure_default_template()
        self.current_week = '2026-W44'

    # --------------------------------------------------------------------------
    # Test 1: Administrator can access records across all authorized schools
    # --------------------------------------------------------------------------
    def test_01_admin_access_all_schools(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/psychological-evaluations/overview/')
        self.assertEqual(res.status_code, 200)
        # Should see both schools
        school_ids = [sc['school_id'] for sc in res.data['campus_comparisons']]
        self.assertIn(self.school_a.id, school_ids)
        self.assertIn(self.school_b.id, school_ids)

    # --------------------------------------------------------------------------
    # Test 2: Principal cannot access another school's records
    # --------------------------------------------------------------------------
    def test_02_principal_isolation(self):
        self.client.force_authenticate(user=self.principal_a)
        # Accessing school_a is fine
        res_a = self.client.get(f'/api/v1/psychological-evaluations/overview/?school_id={self.school_a.id}')
        self.assertEqual(res_a.status_code, 200)

        # Attempting to access school_b must be rejected with 403 Forbidden
        res_b = self.client.get(f'/api/v1/psychological-evaluations/overview/?school_id={self.school_b.id}')
        self.assertEqual(res_b.status_code, 403)

    # --------------------------------------------------------------------------
    # Test 3: Class teacher can evaluate only assigned students
    # --------------------------------------------------------------------------
    def test_03_class_teacher_evaluates_only_assigned(self):
        self.client.force_authenticate(user=self.teacher_class)
        # Can evaluate student1 in class_a1
        payload = {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
        }
        res_ok = self.client.post('/api/v1/psychological-evaluations/evaluations/save/', payload, format='json')
        self.assertEqual(res_ok.status_code, 200)

        # Cannot evaluate student_beta in school_b / class_b1
        payload_bad = {
            'student_id': self.student_beta.id,
            'class_id': self.class_b1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
        }
        res_err = self.client.post('/api/v1/psychological-evaluations/evaluations/save/', payload_bad, format='json')
        self.assertEqual(res_err.status_code, 403)

    # --------------------------------------------------------------------------
    # Test 4: Subject teacher can evaluate only students in assigned classes and subjects
    # --------------------------------------------------------------------------
    def test_04_subject_teacher_evaluates_assigned_subjects(self):
        self.client.force_authenticate(user=self.teacher_subject)
        # Assigned to Math in class_a1
        payload_ok = {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'subject_id': self.sub_math.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 5, 2: 4, 3: 5},
        }
        res_ok = self.client.post('/api/v1/psychological-evaluations/evaluations/save/', payload_ok, format='json')
        self.assertEqual(res_ok.status_code, 200)

        # Not assigned to Science in class_a1
        payload_bad = {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'subject_id': self.sub_sci.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 5, 2: 4, 3: 5},
        }
        res_bad = self.client.post('/api/v1/psychological-evaluations/evaluations/save/', payload_bad, format='json')
        self.assertEqual(res_bad.status_code, 403)

    # --------------------------------------------------------------------------
    # Test 5 & 13: Student can view ONLY their own published profile; unpublished hidden
    # --------------------------------------------------------------------------
    def test_05_and_13_student_views_only_published_profile(self):
        # Teacher creates an evaluation for student1
        save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 5, 4: 3, 5: 3, 6: 4},
            'teacher_notes': 'Confidential internal note about family situation.',
            'student_visible_feedback': 'Great effort this week in math class!'
        })

        self.client.force_authenticate(user=self.student_user1)

        # Before publication: my-profile reports no published evaluations
        res_unpub = self.client.get('/api/v1/psychological-evaluations/my-profile/')
        self.assertEqual(res_unpub.status_code, 200)
        self.assertFalse(res_unpub.data.get('has_published_evaluations', False))

        # Student cannot access another student's profile via direct endpoint
        res_other = self.client.get(f'/api/v1/psychological-evaluations/student-profile/{self.student2.id}/')
        self.assertEqual(res_other.status_code, 403)

        # Now publish student1's profile
        EvaluationPublication.objects.create(
            student=self.student1,
            evaluation_week=self.current_week,
            published_by=self.principal_a,
            visibility_status='published'
        )

        # Student can now see their published profile
        res_pub = self.client.get(f'/api/v1/psychological-evaluations/my-profile/?week={self.current_week}')
        self.assertEqual(res_pub.status_code, 200)
        self.assertTrue(res_pub.data['has_published_evaluations'])
        self.assertEqual(res_pub.data['student_id'], self.student1.id)

    # --------------------------------------------------------------------------
    # Test 6: Unobserved items are excluded from calculations (null never treated as 0)
    # --------------------------------------------------------------------------
    def test_06_unobserved_items_excluded_never_zero(self):
        # Dimension A has questions 1, 2, 3.
        # Answer Q1=4, Q2=5, Q3=None (Not Observed / Insufficient Opportunity).
        # Average of valid items = (4 + 5) / 2 = 4.5.
        # Domain Score = ((4.5 - 1) / 4) * 100 = 87.5.
        # If Q3 were treated as 0, average would be 3.0 and score would be 50.0.
        ev = save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 5, 3: None},
        })
        scores = {ds.dimension.dimension_key: ds for ds in ev.domain_scores.all()}
        dim_a = scores['learning_engagement']
        self.assertEqual(dim_a.valid_response_count, 2)
        self.assertAlmostEqual(dim_a.average_response, 4.5, places=2)
        self.assertAlmostEqual(dim_a.normalized_score, 87.5, places=2)
        self.assertEqual(dim_a.score_status, 'valid')

    # --------------------------------------------------------------------------
    # Test 7: Domain with fewer than two valid responses displays insufficient observations
    # --------------------------------------------------------------------------
    def test_07_fewer_than_two_valid_responses_insufficient(self):
        # In Dimension B (questions 4, 5, 6): only answer Q4=4, Q5=None, Q6=None
        ev = save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4, 4: 4, 5: None, 6: None},
        })
        scores = {ds.dimension.dimension_key: ds for ds in ev.domain_scores.all()}
        dim_b = scores['self_regulation']
        self.assertEqual(dim_b.valid_response_count, 1)
        self.assertIsNone(dim_b.normalized_score)
        self.assertEqual(dim_b.score_status, 'insufficient')

    # --------------------------------------------------------------------------
    # Test 8: Domain score calculations match the documented formula: ((Average - 1) / 4) * 100
    # --------------------------------------------------------------------------
    def test_08_domain_score_formula_matches_specification(self):
        # Example from specification Section 5:
        # Responses: 4, 3, 5 -> Average = 4 -> Domain Score = ((4 - 1) / 4) * 100 = 75
        ev = save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 3, 3: 5},
        })
        dim_a = ev.domain_scores.filter(dimension__dimension_key='learning_engagement').first()
        self.assertAlmostEqual(dim_a.average_response, 4.0, places=2)
        self.assertAlmostEqual(dim_a.normalized_score, 75.0, places=2)

    # --------------------------------------------------------------------------
    # Test 9: Separate teacher submissions remain independently accessible
    # --------------------------------------------------------------------------
    def test_09_separate_teacher_submissions_independent(self):
        # Class teacher submits homeroom observation
        ev_ct = save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 5, 2: 5, 3: 5},
            'strengths_observed': 'Active in homeroom discussions',
        })

        # Subject teacher submits math observation
        ev_st = save_evaluation(self.teacher_subject, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'subject_id': self.sub_math.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 3, 2: 3, 3: 3},
            'strengths_observed': 'Focused on math problems',
        })

        # Both records exist independently
        self.assertEqual(WeeklyEvaluation.objects.filter(student=self.student1, evaluation_week=self.current_week).count(), 2)
        self.assertNotEqual(ev_ct.id, ev_st.id)

        # Fetch profile
        profile = get_student_combined_profile(self.student1, self.current_week)
        self.assertEqual(profile['total_contributing_evaluations'], 2)
        obs_teachers = [obs['teacher_id'] for obs in profile['teacher_observations']]
        self.assertIn(self.teacher_class.id, obs_teachers)
        self.assertIn(self.teacher_subject.id, obs_teachers)

    # --------------------------------------------------------------------------
    # Test 10: Combined profiles require at least two eligible teacher evaluations
    # --------------------------------------------------------------------------
    def test_10_combined_profiles_threshold(self):
        # Single evaluation: should be labeled 'Single-teacher observation'
        save_evaluation(self.teacher_class, {
            'student_id': self.student2.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
        })
        prof_single = get_student_combined_profile(self.student2, self.current_week)
        dim_a = prof_single['dimensions']['learning_engagement']
        self.assertEqual(dim_a['status'], 'single')
        self.assertEqual(dim_a['status_label'], 'Single-teacher observation')

        # Add second teacher evaluation: now combined
        save_evaluation(self.teacher_subject, {
            'student_id': self.student2.id,
            'class_id': self.class_a1.id,
            'subject_id': self.sub_math.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 5, 2: 5, 3: 5},
        })
        prof_multi = get_student_combined_profile(self.student2, self.current_week)
        dim_a_multi = prof_multi['dimensions']['learning_engagement']
        self.assertEqual(dim_a_multi['status'], 'combined')
        self.assertIn('Combined', dim_a_multi['status_label'])
        # (75 + 100) / 2 = 87.5
        self.assertAlmostEqual(dim_a_multi['score'], 87.5, places=1)

    # --------------------------------------------------------------------------
    # Test 11: Radar-chart values match backend domain scores
    # --------------------------------------------------------------------------
    def test_11_radar_chart_values_match_backend_scores(self):
        save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4}, # Dim A score = 75.0
        })
        prof = get_student_combined_profile(self.student1, self.current_week)
        radar_axis_a = next(ax for ax in prof['radar_axes'] if ax['dimension_key'] == 'learning_engagement')
        self.assertEqual(radar_axis_a['score'], 75.0)

    # --------------------------------------------------------------------------
    # Test 12: Historical comparisons use the correct questionnaire version
    # --------------------------------------------------------------------------
    def test_12_historical_template_version_tracking(self):
        ev = save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
        })
        self.assertEqual(ev.template_version, '1.0')
        timeline = get_student_history_timeline(self.student1, self.current_week)
        self.assertIn('timeline', timeline)

    # --------------------------------------------------------------------------
    # Test 14: Internal notes are NEVER exposed to students
    # --------------------------------------------------------------------------
    def test_14_internal_notes_never_exposed_to_students(self):
        save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
            'teacher_notes': 'SECRET_NOTE: Staff discussion regarding family matters.',
            'student_visible_feedback': 'PUBLIC_FEEDBACK: Keep up the awesome effort!'
        })
        EvaluationPublication.objects.create(
            student=self.student1,
            evaluation_week=self.current_week,
            published_by=self.principal_a,
            visibility_status='published'
        )

        self.client.force_authenticate(user=self.student_user1)
        res = self.client.get(f'/api/v1/psychological-evaluations/my-profile/?week={self.current_week}')
        self.assertEqual(res.status_code, 200)

        # Content check
        res_str = str(res.content)
        self.assertNotIn('SECRET_NOTE', res_str)
        self.assertNotIn('family matters', res_str)
        self.assertIn('PUBLIC_FEEDBACK', res_str)

    # --------------------------------------------------------------------------
    # Test 15: Gender analytics do not infer or merge missing gender records
    # --------------------------------------------------------------------------
    def test_15_gender_analytics_separate_unrecorded(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/v1/psychological-evaluations/gender-analytics/?week={self.current_week}')
        self.assertEqual(res.status_code, 200)
        ga = res.data['gender_analytics']
        self.assertIn('male', ga)
        self.assertIn('female', ga)
        self.assertIn('not_recorded', ga)
        # not_recorded is distinct from male or female
        self.assertNotEqual(ga['not_recorded']['total_students'], 0)

    # --------------------------------------------------------------------------
    # Test 16: Unauthorized API requests are rejected with 403
    # --------------------------------------------------------------------------
    def test_16_unauthorized_requests_rejected(self):
        # Unassigned teacher trying to evaluate student in class_a1
        self.client.force_authenticate(user=self.teacher_unassigned)
        payload = {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
        }
        res = self.client.post('/api/v1/psychological-evaluations/evaluations/save/', payload, format='json')
        self.assertEqual(res.status_code, 403)

    # --------------------------------------------------------------------------
    # Test 17: Submissions, revisions, publications recorded in audit logs
    # --------------------------------------------------------------------------
    def test_17_audit_logging(self):
        initial_log_count = EvaluationAuditLog.objects.count()
        save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
        })
        self.assertGreater(EvaluationAuditLog.objects.count(), initial_log_count)
        last_log = EvaluationAuditLog.objects.first()
        self.assertEqual(last_log.action, 'submit')
        self.assertEqual(last_log.actor, self.teacher_class)

    # --------------------------------------------------------------------------
    # Test 18: Dashboard aggregates reconcile with underlying eligible records
    # --------------------------------------------------------------------------
    def test_18_dashboard_aggregates_reconcile(self):
        save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
        })
        dash = get_hierarchical_dashboard(self.admin, school_id=self.school_a.id, evaluation_week=self.current_week)
        self.assertEqual(dash['evaluated_students_count'], 1)
        self.assertEqual(dash['total_students'], 3) # student1, student2, student_unrecorded
        self.assertAlmostEqual(dash['completion_rate'], 33.3, places=1)
        self.assertEqual(dash['insufficient_observations_count'], 2)

    # --------------------------------------------------------------------------
    # Test 19: Draft saving, duplicate submission prevention, and authorized revision
    # --------------------------------------------------------------------------
    def test_19_draft_save_and_revision(self):
        # 1. Save draft
        ev_draft = save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'draft',
            'responses': {1: 3, 2: 3, 3: 3},
        })
        self.assertEqual(ev_draft.status, 'draft')

        # 2. Submit draft
        ev_sub = save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 4, 2: 4, 3: 4},
        })
        self.assertEqual(ev_sub.status, 'submitted')

        # 3. Duplicate submission without is_revision flag should raise ValidationError
        with self.assertRaises(Exception):
            save_evaluation(self.teacher_class, {
                'student_id': self.student1.id,
                'class_id': self.class_a1.id,
                'evaluation_week': self.current_week,
                'status': 'submitted',
                'responses': {1: 5, 2: 5, 3: 5},
            })

        # 4. Authorized revision with is_revision=True succeeds
        ev_rev = save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'is_revision': True,
            'responses': {1: 5, 2: 5, 3: 5},
        })
        self.assertEqual(ev_rev.status, 'revised')

    # --------------------------------------------------------------------------
    # Test 20: Non-diagnostic disclaimer and no clinical labels generated
    # --------------------------------------------------------------------------
    def test_20_no_clinical_labels_and_disclaimer_present(self):
        save_evaluation(self.teacher_class, {
            'student_id': self.student1.id,
            'class_id': self.class_a1.id,
            'evaluation_week': self.current_week,
            'status': 'submitted',
            'responses': {1: 1, 2: 1, 3: 1}, # lowest score = 0.0
        })
        prof = get_student_combined_profile(self.student1, self.current_week)
        # Verify disclaimer
        self.assertIn("not a psychological diagnosis", prof['disclaimer'])
        self.assertIn("validation in progress", prof['validation_status'])

        # Verify no clinical or harmful labels exist in the profile keys or values
        dump = str(prof).lower()
        forbidden_labels = ['bad personality', 'weak student', 'aggressive', 'introvert', 'low intelligence', 'psychologically unstable', 'disorder', 'clinical']
        for bad_label in forbidden_labels:
            self.assertNotIn(bad_label, dump)
