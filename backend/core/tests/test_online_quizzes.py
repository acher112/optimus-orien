from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, Student, PublicCampusListing,
    QuizCompetition, QuizQuestion, QuizAttempt
)


class OnlineQuizzesEnhancementsTests(TestCase):
    def setUp(self):
        self.org1 = Organisation.objects.create(name='Org Alpha', code='org-alpha')
        self.org2 = Organisation.objects.create(name='Org Beta', code='org-beta')

        self.school_pk = School.objects.create(organisation=self.org1, name='Alpha Lahore', code='AL-LHR', city='Lahore')
        self.school_uk = School.objects.create(organisation=self.org1, name='Alpha London', code='AL-LDN', city='London')
        self.school_uae = School.objects.create(organisation=self.org2, name='Beta Dubai', code='BT-DXB', city='Dubai')

        PublicCampusListing.objects.create(
            school=self.school_pk, slug='alpha-lahore', display_name='Alpha Lahore',
            country='Pakistan', city='Lahore', status='live'
        )
        PublicCampusListing.objects.create(
            school=self.school_uk, slug='alpha-london', display_name='Alpha London',
            country='United Kingdom', city='London', status='live'
        )
        PublicCampusListing.objects.create(
            school=self.school_uae, slug='beta-dubai', display_name='Beta Dubai',
            country='UAE', city='Dubai', status='live'
        )

        self.teacher_pk = User.objects.create_user(
            username='teacher_pk', password='Password123!', role='teacher',
            first_name='Sara', last_name='Malik',
            organisation=self.org1, school=self.school_pk
        )
        self.principal_pk = User.objects.create_user(
            username='principal_pk', password='Password123!', role='principal',
            first_name='Dr. Tariq', last_name='Khan',
            organisation=self.org1, school=self.school_pk
        )
        self.student_user_pk = User.objects.create_user(
            username='student_pk', password='Password123!', role='student',
            first_name='Zain', last_name='Ahmed',
            organisation=self.org1, school=self.school_pk
        )
        self.student_pk = Student.objects.create(
            school=self.school_pk, admission_number='PK-001',
            first_name='Zain', last_name='Ahmed',
            enrolled_on=date(2025, 1, 1), user=self.student_user_pk
        )

        self.student_user_uk = User.objects.create_user(
            username='student_uk', password='Password123!', role='student',
            first_name='Oliver', last_name='Grant',
            organisation=self.org1, school=self.school_uk
        )
        self.student_uk = Student.objects.create(
            school=self.school_uk, admission_number='UK-001',
            first_name='Oliver', last_name='Grant',
            enrolled_on=date(2025, 1, 1), user=self.student_user_uk
        )

        self.student_user_uae = User.objects.create_user(
            username='student_uae', password='Password123!', role='student',
            first_name='Layla', last_name='Hassan',
            organisation=self.org2, school=self.school_uae
        )
        self.student_uae = Student.objects.create(
            school=self.school_uae, admission_number='UAE-001',
            first_name='Layla', last_name='Hassan',
            enrolled_on=date(2025, 1, 1), user=self.student_user_uae
        )

        self.client = APIClient()

    def test_custom_subject_ai_generation_and_randomness(self):
        self.client.force_authenticate(user=self.teacher_pk)
        resp1 = self.client.post('/api/v1/communication/assessments/generate-questions/', {
            'subject': 'Quantum Robotics',
            'topic': 'Autonomous Sensors',
            'difficulty': 'Advanced',
            'num_questions': 5,
        }, format='json')
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(resp1.data['source'], 'dummy_ai')
        self.assertEqual(len(resp1.data['questions']), 5)
        prompts1 = [q['prompt'] for q in resp1.data['questions']]

        resp2 = self.client.post('/api/v1/communication/assessments/generate-questions/', {
            'subject': 'Quantum Robotics',
            'topic': 'Autonomous Sensors',
            'difficulty': 'Advanced',
            'num_questions': 5,
        }, format='json')
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(len(resp2.data['questions']), 5)
        self.assertTrue(all('Quantum Robotics' in p for p in prompts1))

    def test_scope_visibility_our_campus_org_campuses_and_worldwide(self):
        self.client.force_authenticate(user=self.teacher_pk)
        now = timezone.now()
        end = now + timedelta(days=2)

        # 1. Only Our Campus
        r_campus = self.client.post('/api/v1/communication/assessments/create-quiz/', {
            'title': 'Lahore Only Robotics Quiz',
            'subject': 'Robotics',
            'difficulty': 'Intermediate',
            'num_questions': 5,
            'scope': 'our_campus',
            'start_time': now.isoformat(),
            'end_time': end.isoformat(),
        }, format='json')
        self.assertEqual(r_campus.status_code, 201)
        campus_qid = r_campus.data['competition_id']

        # 2. All Our Campuses (Org Alpha)
        r_org = self.client.post('/api/v1/communication/assessments/create-quiz/', {
            'title': 'Org Alpha Olympiad',
            'subject': 'Astrophysics',
            'difficulty': 'Olympiad',
            'num_questions': 5,
            'scope': 'org_campuses',
        }, format='json')
        self.assertEqual(r_org.status_code, 201)
        org_qid = r_org.data['competition_id']

        # 3. Worldwide
        r_world = self.client.post('/api/v1/communication/assessments/create-quiz/', {
            'title': 'Worldwide AI Cup',
            'subject': 'Artificial Intelligence',
            'difficulty': 'Advanced',
            'num_questions': 5,
            'scope': 'worldwide',
        }, format='json')
        self.assertEqual(r_world.status_code, 201)
        world_qid = r_world.data['competition_id']

        # Student in Alpha Lahore sees ALL 3
        self.client.force_authenticate(user=self.student_user_pk)
        pk_ids = {q['id'] for q in self.client.get('/api/v1/communication/assessments/competitions/').data['available_quizzes']}
        self.assertIn(campus_qid, pk_ids)
        self.assertIn(org_qid, pk_ids)
        self.assertIn(world_qid, pk_ids)

        # Student in Alpha London sees org_qid and world_qid, NOT campus_qid
        self.client.force_authenticate(user=self.student_user_uk)
        uk_ids = {q['id'] for q in self.client.get('/api/v1/communication/assessments/competitions/').data['available_quizzes']}
        self.assertNotIn(campus_qid, uk_ids)
        self.assertIn(org_qid, uk_ids)
        self.assertIn(world_qid, uk_ids)

        # Student in Beta Dubai sees ONLY world_qid
        self.client.force_authenticate(user=self.student_user_uae)
        uae_ids = {q['id'] for q in self.client.get('/api/v1/communication/assessments/competitions/').data['available_quizzes']}
        self.assertNotIn(campus_qid, uae_ids)
        self.assertNotIn(org_qid, uae_ids)
        self.assertIn(world_qid, uae_ids)

    def test_single_attempt_lock_rapid_result_country_analytics_and_student_profile_save(self):
        self.client.force_authenticate(user=self.teacher_pk)
        now = timezone.now()
        create_resp = self.client.post('/api/v1/communication/assessments/create-quiz/', {
            'title': 'Global STEM Challenge',
            'subject': 'Space Engineering',
            'difficulty': 'Intermediate',
            'num_questions': 5,
            'duration_minutes': 15,
            'scope': 'worldwide',
            'start_time': (now - timedelta(hours=1)).isoformat(),
            'end_time': (now + timedelta(hours=5)).isoformat(),
        }, format='json')
        self.assertEqual(create_resp.status_code, 201)
        qid = create_resp.data['competition_id']
        comp = QuizCompetition.objects.get(pk=qid)
        questions = list(comp.questions.all().order_by('order'))

        def build_correct_answers():
            ans = {}
            for q in questions:
                if q.question_type == 'numerical':
                    ans[str(q.id)] = q.correct_answer.get('value', 0)
                else:
                    ans[str(q.id)] = q.correct_answer.get('id', 'A')
            return ans

        # Student PK attempts and gets 100% in 45s
        self.client.force_authenticate(user=self.student_user_pk)
        sub_pk = self.client.post(f'/api/v1/communication/assessments/competitions/{qid}/attempt/', {
            'answers': build_correct_answers(),
            'time_spent_seconds': 45,
        }, format='json')
        self.assertEqual(sub_pk.status_code, 201)
        self.assertEqual(sub_pk.data['score_percentage'], 100.0)
        self.assertEqual(sub_pk.data['country'], 'Pakistan')
        self.assertTrue(sub_pk.data['saved_to_profile'])
        self.assertEqual(len(sub_pk.data['graded_breakdown']), 5)

        # Single-Attempt Lock: 2nd attempt by Student PK MUST fail
        sub_pk_2 = self.client.post(f'/api/v1/communication/assessments/competitions/{qid}/attempt/', {
            'answers': build_correct_answers(),
            'time_spent_seconds': 30,
        }, format='json')
        self.assertEqual(sub_pk_2.status_code, 400)

        # Student UK attempts and gets 0% in 60s
        self.client.force_authenticate(user=self.student_user_uk)
        sub_uk = self.client.post(f'/api/v1/communication/assessments/competitions/{qid}/attempt/', {
            'answers': {},
            'time_spent_seconds': 60,
        }, format='json')
        self.assertEqual(sub_uk.status_code, 201)
        self.assertEqual(sub_uk.data['score_percentage'], 0.0)
        self.assertEqual(sub_uk.data['country'], 'United Kingdom')

        # Check Attempted / Leaderboard endpoint & Country Performance Analytics
        lb = self.client.get(f'/api/v1/communication/assessments/leaderboard/?quiz_id={qid}')
        self.assertEqual(lb.status_code, 200)
        self.assertEqual(len(lb.data['results']), 2)
        self.assertEqual(lb.data['country_analytics'][0]['country'], 'Pakistan')
        self.assertEqual(lb.data['country_analytics'][0]['avg_score'], 100.0)
        self.assertEqual(lb.data['country_analytics'][1]['country'], 'United Kingdom')

        # Verify saved in Student PK's Profile, Results, Dashboard, and Community Profile
        self.client.force_authenticate(user=self.student_user_pk)

        prof = self.client.get('/api/v1/student/profile/')
        self.assertEqual(prof.status_code, 200)
        self.assertEqual(prof.data['quiz_summary']['total_attempted'], 1)
        self.assertEqual(prof.data['quiz_performance'][0]['title'], 'Global STEM Challenge')
        self.assertEqual(prof.data['quiz_performance'][0]['score_percentage'], 100.0)

        res = self.client.get('/api/v1/student/results/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['quiz_summary']['total_attempted'], 1)

        dash = self.client.get('/api/v1/student/dashboard/')
        self.assertEqual(dash.status_code, 200)
        self.assertEqual(dash.data['quiz_summary']['total_attempted'], 1)

        comm_prof = self.client.get(f'/api/v1/communication/community/profile/student/{self.student_pk.id}/')
        self.assertEqual(comm_prof.status_code, 200)
        self.assertEqual(len(comm_prof.data['verified_records']), 1)
        self.assertEqual(comm_prof.data['verified_records'][0]['score'], 100.0)

    def test_scheduled_and_ended_quiz_windows(self):
        self.client.force_authenticate(user=self.teacher_pk)
        now = timezone.now()
        sched_resp = self.client.post('/api/v1/communication/assessments/create-quiz/', {
            'title': 'Future Scheduled Quiz',
            'subject': 'Physics',
            'difficulty': 'Foundation',
            'scope': 'worldwide',
            'start_time': (now + timedelta(days=1)).isoformat(),
            'end_time': (now + timedelta(days=2)).isoformat(),
        }, format='json')
        self.assertEqual(sched_resp.status_code, 201)
        sched_id = sched_resp.data['competition_id']

        self.client.force_authenticate(user=self.student_user_pk)
        attempt_early = self.client.post(f'/api/v1/communication/assessments/competitions/{sched_id}/attempt/', {
            'answers': {},
            'time_spent_seconds': 20,
        }, format='json')
        self.assertEqual(attempt_early.status_code, 400)

    def test_assessments_analytics_and_badges_charts(self):
        # 1. Create a quiz
        self.client.force_authenticate(user=self.teacher_pk)
        resp = self.client.post('/api/v1/communication/assessments/create-quiz/', {
            'title': 'Global STEM Olympiad',
            'subject': 'Mathematics',
            'difficulty': 'Olympiad',
            'scope': 'worldwide',
            'duration_minutes': 10,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        comp_id = resp.data['competition_id']

        # Get questions
        comp = QuizCompetition.objects.get(id=comp_id)
        def build_correct():
            ans = {}
            for q in comp.questions.all():
                if q.question_type == 'numerical':
                    ans[str(q.id)] = q.correct_answer.get('value', 0)
                elif q.question_type == 'true_false':
                    ans[str(q.id)] = q.correct_answer.get('id', 'true')
                else:
                    ans[str(q.id)] = q.correct_answer.get('id', 'A')
            return ans

        # 2. Student Zain (Pakistan) attempts
        self.client.force_authenticate(user=self.student_user_pk)
        att1 = self.client.post(f'/api/v1/communication/assessments/competitions/{comp_id}/attempt/', {
            'answers': build_correct(),
            'time_spent_seconds': 180,
            'country': 'Pakistan',
        }, format='json')
        self.assertEqual(att1.status_code, 201)

        # 3. Student Oliver (UK) attempts
        self.client.force_authenticate(user=self.student_user_uk)
        att2 = self.client.post(f'/api/v1/communication/assessments/competitions/{comp_id}/attempt/', {
            'answers': build_correct(),
            'time_spent_seconds': 240,
            'country': 'United Kingdom',
        }, format='json')
        self.assertEqual(att2.status_code, 201)

        # 4. Fetch Analytics & Badges
        analytics_resp = self.client.get('/api/v1/communication/assessments/analytics-badges/')
        self.assertEqual(analytics_resp.status_code, 200)

        data = analytics_resp.data
        self.assertIn('summary', data)
        self.assertIn('quiz_attempts_chart', data)
        self.assertIn('country_distribution_chart', data)
        self.assertIn('badges', data)

        # Check summary metrics
        self.assertGreaterEqual(data['summary']['total_quizzes'], 1)
        self.assertGreaterEqual(data['summary']['total_attempts'], 2)
        self.assertGreaterEqual(data['summary']['total_students_participated'], 2)

        # Check quiz attempts chart
        q_entry = next((item for item in data['quiz_attempts_chart'] if item['id'] == comp_id), None)
        self.assertIsNotNone(q_entry)
        self.assertEqual(q_entry['attempts_count'], 2)
        self.assertEqual(q_entry['difficulty'], 'Olympiad')

        # Check country distribution chart
        pk_country = next((c for c in data['country_distribution_chart'] if c['country'] == 'Pakistan'), None)
        self.assertIsNotNone(pk_country)
        self.assertGreaterEqual(pk_country['student_count'], 1)

        uk_country = next((c for c in data['country_distribution_chart'] if c['country'] == 'United Kingdom'), None)
        self.assertIsNotNone(uk_country)
        self.assertGreaterEqual(uk_country['student_count'], 1)

        # Check Badges for Top Students
        top_students = data['badges']['students']
        self.assertTrue(len(top_students) >= 2)
        zain_honor = next((s for s in top_students if 'Zain' in s['name']), None)
        self.assertIsNotNone(zain_honor)
        self.assertGreaterEqual(len(zain_honor['badges']), 1)
        # Check that high score awarded Grandmaster Scholar
        self.assertTrue(any(b['id'] == 'gold_grandmaster' for b in zain_honor['badges']))

        # Check Badges for Top Teachers
        top_teachers = data['badges']['teachers']
        self.assertTrue(len(top_teachers) >= 1)
        sara_honor = next((t for t in top_teachers if 'Sara' in t['name']), None)
        self.assertIsNotNone(sara_honor)
        self.assertGreaterEqual(len(sara_honor['badges']), 1)

        # Check Badges for Top Principals
        top_principals = data['badges']['principals']
        self.assertTrue(len(top_principals) >= 1)

    def test_assign_honorary_badge_post(self):
        self.client.force_authenticate(user=self.teacher_pk)
        resp = self.client.post('/api/v1/communication/assessments/analytics-badges/', {
            'target_role': 'student',
            'target_id': self.student_pk.id,
            'badge_title': 'Grandmaster Scholar',
            'badge_tier': 'gold',
            'badge_description': 'Awarded for exceptional math competition performance.',
        }, format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])
        self.assertEqual(resp.data['badge']['title'], 'Grandmaster Scholar')
        self.assertEqual(resp.data['badge']['tier'], 'gold')
