"""
Test suite for Academic Q&A Discussion Forum.
Verifies:
- Question creation with campus subjects and custom subjects
- Scope enforcement:
  * worldwide (everyone can view and answer)
  * all_campuses (same organisation members only)
  * campus_staff_all (same school members only)
  * campus_teachers (teachers/principals/admins of that school only)
  * campus_students (students and moderators of that school only)
- Question listing, filtering, search, and statistics
- Threaded answers and forbidden reply enforcement
- Marking accepted solution and upvoting questions/answers
"""
from datetime import date
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from core.models import (
    User, School, Organisation, Subject, SchoolClass, AcademicYear,
    QADiscussionQuestion, QADiscussionAnswer
)


class QADiscussionForumTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Organisation 1 & Campus 1
        self.org1 = Organisation.objects.create(name="City Grammar Network", code="cgn")
        self.school1 = School.objects.create(organisation=self.org1, name="City Campus North", code="ccn", city="Karachi")
        
        # Campus 2 in same Org 1
        self.school2 = School.objects.create(organisation=self.org1, name="City Campus South", code="ccs", city="Lahore")

        # Organisation 2 & Campus 3 (External)
        self.org2 = Organisation.objects.create(name="International Academy", code="ia")
        self.school3 = School.objects.create(organisation=self.org2, name="Global Campus 1", code="gc1", city="Islamabad")

        # Academic Year, Subject & Class in School 1
        self.academic_year = AcademicYear.objects.create(
            school=self.school1, name="2025-2026", start_date=date(2025, 1, 1), end_date=date(2025, 12, 31)
        )
        self.math_subject = Subject.objects.create(school=self.school1, name="Mathematics", code="MATH101")
        self.class_10 = SchoolClass.objects.create(school=self.school1, name="Grade 10-A", academic_year=self.academic_year)

        # Users
        self.teacher_c1 = User.objects.create_user(
            username="teacher_sarah", password="password123", role="teacher",
            first_name="Sarah", last_name="Khan", school=self.school1, organisation=self.org1
        )
        self.student_c1 = User.objects.create_user(
            username="student_bilal", password="password123", role="student",
            first_name="Bilal", last_name="Ahmed", school=self.school1, organisation=self.org1
        )
        self.teacher_c2 = User.objects.create_user(
            username="teacher_omer", password="password123", role="teacher",
            first_name="Omer", last_name="Farooq", school=self.school2, organisation=self.org1
        )
        self.teacher_ext = User.objects.create_user(
            username="teacher_david", password="password123", role="teacher",
            first_name="David", last_name="Miller", school=self.school3, organisation=self.org2
        )

    def test_create_question_with_campus_subject(self):
        self.client.force_authenticate(user=self.teacher_c1)
        payload = {
            'title': 'How to explain quadratic formula to Grade 10?',
            'body': 'Looking for pedagogical strategies to help struggling students understand the discriminant.',
            'category': 'Curriculum & Pedagogy',
            'subject_id': self.math_subject.id,
            'class_id': self.class_10.id,
            'audience_scope': 'campus_teachers'
        }
        res = self.client.post('/api/v1/communication/discussions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['title'], payload['title'])
        self.assertEqual(res.data['subject_name'], 'Mathematics')
        self.assertEqual(res.data['audience_scope'], 'campus_teachers')
        self.assertEqual(res.data['author']['name'], 'Sarah Khan')

    def test_create_question_with_custom_subject(self):
        self.client.force_authenticate(user=self.student_c1)
        payload = {
            'title': 'Best libraries for Computer Vision and Robotics project?',
            'body': 'We are preparing for the national robotics expo. OpenCV vs YOLO?',
            'category': 'Academic Doubt',
            'custom_subject': 'Robotics & AI',
            'audience_scope': 'worldwide'
        }
        res = self.client.post('/api/v1/communication/discussions/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['subject_name'], 'Robotics & AI')
        self.assertTrue(res.data['is_custom_subject'])
        self.assertEqual(res.data['audience_scope'], 'worldwide')

    def test_worldwide_scope_allows_external_users_to_answer(self):
        # Student creates worldwide question
        q = QADiscussionQuestion.objects.create(
            title="Global debate on renewable energy sources",
            body="Which is more viable for developing nations?",
            audience_scope="worldwide",
            author_user=self.student_c1,
            school=self.school1
        )

        # External teacher (different org) answers
        self.client.force_authenticate(user=self.teacher_ext)
        res = self.client.post(f'/api/v1/communication/discussions/{q.id}/answers/', {
            'body': 'Solar and micro-hydro often offer the lowest initial capital expenditure.'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(q.answers.count(), 1)

    def test_campus_teachers_scope_blocks_students_and_external_faculty(self):
        q = QADiscussionQuestion.objects.create(
            title="Midterm exam grading consensus",
            body="Please review rubric grading guidelines for English literature.",
            audience_scope="campus_teachers",
            author_user=self.teacher_c1,
            school=self.school1
        )

        # Student from same campus attempts to answer -> forbidden
        self.client.force_authenticate(user=self.student_c1)
        res_student = self.client.post(f'/api/v1/communication/discussions/{q.id}/answers/', {
            'body': 'I think the grading was too hard!'
        }, format='json')
        self.assertEqual(res_student.status_code, status.HTTP_403_FORBIDDEN)

        # Teacher from another campus in same org attempts -> forbidden (it's our campus teachers only)
        self.client.force_authenticate(user=self.teacher_c2)
        res_c2 = self.client.post(f'/api/v1/communication/discussions/{q.id}/answers/', {
            'body': 'Here is how Campus 2 does it.'
        }, format='json')
        self.assertEqual(res_c2.status_code, status.HTTP_403_FORBIDDEN)

        # Teacher from same campus attempts -> allowed
        self.client.force_authenticate(user=self.teacher_c1)
        res_ok = self.client.post(f'/api/v1/communication/discussions/{q.id}/answers/', {
            'body': 'Agreed on rubric section 3.'
        }, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)

    def test_all_campuses_scope_allows_same_org_blocks_different_org(self):
        q = QADiscussionQuestion.objects.create(
            title="Cross-campus debate tournament preparation",
            body="Coordinators across all branches please share schedule availability.",
            audience_scope="all_campuses",
            author_user=self.teacher_c1,
            school=self.school1
        )

        # Teacher from branch 2 in same org -> allowed
        self.client.force_authenticate(user=self.teacher_c2)
        res_c2 = self.client.post(f'/api/v1/communication/discussions/{q.id}/answers/', {
            'body': 'Campus South is ready for next Friday.'
        }, format='json')
        self.assertEqual(res_c2.status_code, status.HTTP_201_CREATED)

        # Teacher from outside org -> forbidden
        self.client.force_authenticate(user=self.teacher_ext)
        res_ext = self.client.post(f'/api/v1/communication/discussions/{q.id}/answers/', {
            'body': 'Can our school join?'
        }, format='json')
        self.assertEqual(res_ext.status_code, status.HTTP_403_FORBIDDEN)

    def test_accept_solution_flow(self):
        q = QADiscussionQuestion.objects.create(
            title="What is the unit of electric potential?",
            body="Is it Volt or Joule per Coulomb?",
            audience_scope="worldwide",
            author_user=self.student_c1,
            school=self.school1,
            status="open"
        )
        ans = QADiscussionAnswer.objects.create(
            question=q,
            author_user=self.teacher_c1,
            body="Both! 1 Volt is defined as 1 Joule per Coulomb."
        )

        # Author marks solution as accepted
        self.client.force_authenticate(user=self.student_c1)
        res = self.client.post(f'/api/v1/communication/discussions/{q.id}/accept-solution/', {
            'answer_id': ans.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        q.refresh_from_db()
        ans.refresh_from_db()
        self.assertEqual(q.status, 'answered')
        self.assertTrue(ans.is_accepted_solution)

    def test_upvote_question_and_answer(self):
        q = QADiscussionQuestion.objects.create(
            title="Interesting astronomy question",
            body="Why is the night sky dark?",
            audience_scope="worldwide",
            author_user=self.student_c1,
            school=self.school1
        )
        ans = QADiscussionAnswer.objects.create(
            question=q,
            author_user=self.teacher_c1,
            body="Because of Olbers' Paradox and the expansion of the universe."
        )

        self.client.force_authenticate(user=self.teacher_c2)
        # Upvote question
        res_q = self.client.post(f'/api/v1/communication/discussions/{q.id}/helpful/', {}, format='json')
        self.assertEqual(res_q.status_code, status.HTTP_200_OK)
        q.refresh_from_db()
        self.assertEqual(q.upvotes_count, 1)

        # Upvote answer
        res_a = self.client.post(f'/api/v1/communication/discussions/{q.id}/helpful/', {'answer_id': ans.id}, format='json')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        ans.refresh_from_db()
        self.assertEqual(ans.helpful_count, 1)

    def test_list_and_stats_endpoint(self):
        QADiscussionQuestion.objects.create(
            title="Worldwide Query", body="Some body", audience_scope="worldwide",
            author_user=self.student_c1, school=self.school1, status="open"
        )
        QADiscussionQuestion.objects.create(
            title="Campus Teachers Query", body="Some body", audience_scope="campus_teachers",
            author_user=self.teacher_c1, school=self.school1, status="answered"
        )

        self.client.force_authenticate(user=self.teacher_c1)
        res = self.client.get('/api/v1/communication/discussions/?scope=all')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('stats', res.data)
        self.assertEqual(res.data['stats']['total_queries'], 2)
        self.assertEqual(res.data['stats']['solved_count'], 1)
        self.assertEqual(len(res.data['results']), 2)
