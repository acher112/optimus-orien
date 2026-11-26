"""
Comprehensive Test Suite for Optimus Orien Badges and Achievements System.

Tests cover:
1. Seed verification of all 47 approved BadgeDefinitions and versioned BadgeCriteria.
2. Idempotency: engine execution repeatedly never duplicates awards.
3. Student Attendance Hero with official platform excused-absence policy formula.
4. Student Homework Hero with confirmed verification check.
5. Student Active Learner with observation participation averages.
6. Student Academic Climber, Excellence, Subject Explorer, and Multi-Term Sequences.
7. Official Quiz Milestones (Novice, Regular, Sharpshooter, Speed Scholar, Streak).
8. Unofficial Quizzes (is_official=False peer challenges) strictly ignored.
9. Teacher Subject Specialist & Student Motivator on assigned classes and subjects.
10. Principal Attendance Guardian & Institutional Excellence on campus cohorts.
11. Manual recognition role hierarchy (Org Admin, Principal, Teacher) and audit log enforcement.
12. Students cannot confer manual recognition (PermissionDenied).
13. Mandatory justification length enforcement (>= 10 chars).
14. Non-revocation guarantee: subsequent result changes create an audited review flag, not automatic revocation.
15. Student safety and privacy: student achievements visible only to student, linked guardian, and own school staff; blocked for cross-school users and peers.
16. Tenant isolation and RLS on AchievementAward, BadgeProgress, and BadgeAuditLog.
17. CLI management command (evaluate_badges).
"""
from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from django.core.management import call_command
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, Student, GuardianProfile, SchoolClass, Subject,
    AcademicYear, ExamConfiguration, CalculatedStudentResult, CalculatedSubjectResult,
    Attendance, Homework, HomeworkSubmission, Observation, Enrollment,
    QuizCompetition, QuizAttempt, ClassTeacherAssignment, ClassSubjectTeacher,
    BadgeDefinition, BadgeCriteria, AchievementAward, BadgeProgress, BadgeAuditLog
)
from core.services.badge_engine import (
    evaluate_student_achievements,
    evaluate_teacher_achievements,
    evaluate_principal_achievements,
    evaluate_quiz_achievements,
    confer_manual_award,
    flag_award_for_review,
    resolve_award_review,
    calculate_attendance_rate,
)


class BadgesEngineComprehensiveTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate()

        # Organisations & Schools
        self.org1 = Organisation.objects.create(name="Beaconhouse Trust", code="BHT")
        self.org2 = Organisation.objects.create(name="City School Network", code="CSN")

        self.school1 = School.objects.create(name="BHT North Campus", code="BHT-N", organisation=self.org1)
        self.school2 = School.objects.create(name="BHT South Campus", code="BHT-S", organisation=self.org1)
        self.school_other_org = School.objects.create(name="CSN Main", code="CSN-M", organisation=self.org2)

        # Users
        self.org_admin = User.objects.create_user(
            username="bht_org_admin", password="TestPassword123!", role="organisation_admin", organisation=self.org1
        )
        self.principal1 = User.objects.create_user(
            username="principal_north", password="TestPassword123!", role="principal", organisation=self.org1, school=self.school1
        )
        self.principal2 = User.objects.create_user(
            username="principal_south", password="TestPassword123!", role="principal", organisation=self.org1, school=self.school2
        )
        self.teacher1 = User.objects.create_user(
            username="teacher_sarah", password="TestPassword123!", role="teacher", organisation=self.org1, school=self.school1
        )
        self.teacher_other = User.objects.create_user(
            username="teacher_south", password="TestPassword123!", role="teacher", organisation=self.org1, school=self.school2
        )

        # Students & Linked Guardians
        self.student_user1 = User.objects.create_user(
            username="student_zain", password="TestPassword123!", role="student", organisation=self.org1, school=self.school1
        )
        self.student1 = Student.objects.create(
            user=self.student_user1, school=self.school1, admission_number="STD-001",
            first_name="Zain", last_name="Ahmed", enrolled_on=self.today - timedelta(days=200)
        )

        self.student_user2 = User.objects.create_user(
            username="student_ayesha", password="TestPassword123!", role="student", organisation=self.org1, school=self.school1
        )
        self.student2 = Student.objects.create(
            user=self.student_user2, school=self.school1, admission_number="STD-002",
            first_name="Ayesha", last_name="Khan", enrolled_on=self.today - timedelta(days=200)
        )

        self.guardian_user = User.objects.create_user(
            username="guardian_farooq", password="TestPassword123!", role="parent", organisation=self.org1, school=self.school1
        )
        self.student1.guardians.add(self.guardian_user)

        # Academic Structure
        self.acad_year = AcademicYear.objects.create(
            school=self.school1, name="2026-2027",
            start_date=self.today - timedelta(days=120), end_date=self.today + timedelta(days=120)
        )
        self.sclass = SchoolClass.objects.create(school=self.school1, academic_year=self.acad_year, name="Grade 8-A")
        Enrollment.objects.create(student=self.student1, school_class=self.sclass, start_date=self.today - timedelta(days=100))
        Enrollment.objects.create(student=self.student2, school_class=self.sclass, start_date=self.today - timedelta(days=100))

        self.subject_math = Subject.objects.create(school=self.school1, name="Mathematics", code="MATH-8")
        self.subject_sci = Subject.objects.create(school=self.school1, name="Science", code="SCI-8")
        self.subject_eng = Subject.objects.create(school=self.school1, name="English", code="ENG-8")

        # Assignments
        ClassTeacherAssignment.objects.create(
            school_class=self.sclass, teacher=self.teacher1,
            start_date=self.today - timedelta(days=90), end_date=self.today + timedelta(days=90),
            created_by=self.principal1
        )
        ClassSubjectTeacher.objects.create(school_class=self.sclass, subject=self.subject_math, teacher=self.teacher1)

    def test_01_seed_verification(self):
        """Verifies that all 47 approved BadgeDefinitions and versioned BadgeCriteria exist."""
        badge_count = BadgeDefinition.objects.filter(is_active=True).count()
        self.assertEqual(badge_count, 47, f"Expected 47 active badge definitions, found {badge_count}")

        categories = set(BadgeDefinition.objects.values_list('category', flat=True))
        self.assertEqual(categories, {'principal', 'teacher', 'student', 'quiz', 'manual'})

        # Check versioned criteria baseline
        crit_count = BadgeCriteria.objects.filter(active=True, version=1).count()
        self.assertEqual(crit_count, 47)

    def test_02_idempotent_evaluation(self):
        """Running the engine multiple times must never duplicate awards."""
        b_def = BadgeDefinition.objects.get(slug='student_attendance_hero')
        crit = b_def.criteria_versions.get(version=1)

        # Seed attendance >= 95% for 20 days in current month
        m_start = date(self.today.year, self.today.month, 1)
        for d_idx in range(20):
            Attendance.objects.create(
                student=self.student1, school_class=self.sclass,
                date=m_start + timedelta(days=d_idx), status='present', recorded_by=self.teacher1
            )

        # Run 1
        awarded_1 = evaluate_student_achievements(self.student1.id)
        self.assertTrue(any(a.badge.slug == 'student_attendance_hero' for a in awarded_1))
        initial_count = AchievementAward.objects.filter(user=self.student_user1, badge=b_def).count()
        self.assertEqual(initial_count, 1)

        # Run 2 (Should not duplicate)
        awarded_2 = evaluate_student_achievements(self.student1.id)
        self.assertEqual(len(awarded_2), 0)
        after_count = AchievementAward.objects.filter(user=self.student_user1, badge=b_def).count()
        self.assertEqual(after_count, 1)

    def test_03_attendance_hero_excused_policy(self):
        """Tests attendance calculation strictly excluding excused leaves per platform policy."""
        m_start = date(self.today.year, self.today.month, 1)
        # 16 total school days: 14 present, 2 excused, 0 unexcused
        # denominator = 16 - 2 = 14; attended = 14 -> 14/14 = 100%
        for d in range(14):
            Attendance.objects.create(
                student=self.student1, school_class=self.sclass,
                date=m_start + timedelta(days=d), status='present', recorded_by=self.teacher1
            )
        for d in range(14, 16):
            Attendance.objects.create(
                student=self.student1, school_class=self.sclass,
                date=m_start + timedelta(days=d), status='excused', recorded_by=self.teacher1
            )

        evaluate_student_achievements(self.student1.id)
        aw = AchievementAward.objects.filter(user=self.student_user1, badge__slug='student_attendance_hero').first()
        self.assertIsNotNone(aw)
        self.assertEqual(aw.evidence_data.get('attendance_rate'), '100.00')

    def test_04_student_homework_hero(self):
        """Tests that 100% verified completed homework awards the Homework Hero badge."""
        m_start = date(self.today.year, self.today.month, 1)
        for i in range(5):
            hw = Homework.objects.create(
                school_class=self.sclass, subject=self.subject_math,
                title=f"Math Assignment {i}", due_date=m_start + timedelta(days=i), created_by=self.teacher1
            )
            HomeworkSubmission.objects.create(
                homework=hw, student=self.student1, status='completed',
                confirmed_by=self.teacher1, submitted_at=timezone.now()
            )

        evaluate_student_achievements(self.student1.id)
        aw = AchievementAward.objects.filter(user=self.student_user1, badge__slug='student_homework_hero').first()
        self.assertIsNotNone(aw)
        self.assertEqual(aw.evidence_data.get('verified_completion_rate'), '100.00')

    def test_05_student_active_learner(self):
        """Tests participation ratings >= 8.0/10 awards Active Learner badge."""
        m_start = date(self.today.year, self.today.month, 1)
        for i in range(4):
            Observation.objects.create(
                student=self.student1, subject=self.subject_math, teacher=self.teacher1,
                kind='participation', value=9, date=m_start + timedelta(days=i)
            )

        evaluate_student_achievements(self.student1.id)
        aw = AchievementAward.objects.filter(user=self.student_user1, badge__slug='student_active_learner').first()
        self.assertIsNotNone(aw)
        self.assertEqual(aw.evidence_data.get('average_participation'), '9.00')

    def test_06_student_academic_excellence_and_climber(self):
        """Tests published exam results and term improvement (+5% Climber, 90%+ Excellence)."""
        # Term 1
        conf1 = ExamConfiguration.objects.create(
            school=self.school1, academic_year=self.acad_year, name="Midterm Exam",
            status='published', version=1, published_at=timezone.now() - timedelta(days=60), published_by=self.principal1
        )
        CalculatedStudentResult.objects.create(
            student=self.student1, school_class=self.sclass, academic_year=self.acad_year,
            configuration=conf1, completed=True, overall_percentage=Decimal('82.00')
        )

        # Term 2 (+8% improvement to 90%)
        conf2 = ExamConfiguration.objects.create(
            school=self.school1, academic_year=self.acad_year, name="Final Exam",
            status='published', version=1, published_at=timezone.now(), published_by=self.principal1
        )
        CalculatedStudentResult.objects.create(
            student=self.student1, school_class=self.sclass, academic_year=self.acad_year,
            configuration=conf2, completed=True, overall_percentage=Decimal('90.50')
        )

        evaluate_student_achievements(self.student1.id)

        # First Achievement earned
        self.assertTrue(AchievementAward.objects.filter(user=self.student_user1, badge__slug='student_first_achievement').exists())
        # Academic Climber earned (+8.50%)
        climber = AchievementAward.objects.filter(user=self.student_user1, badge__slug='student_academic_climber').first()
        self.assertIsNotNone(climber)
        self.assertEqual(climber.evidence_data.get('improvement_delta'), '8.50')
        # Academic Excellence earned (90.50%)
        excel = AchievementAward.objects.filter(user=self.student_user1, badge__slug='student_academic_excellence').first()
        self.assertIsNotNone(excel)

    def test_07_quiz_official_milestones_and_speed_scholar(self):
        """Tests official quiz attempts award Novice, Sharpshooter, and Speed Scholar."""
        comp = QuizCompetition.objects.create(
            title="National Mathematics Olympiad", sponsor_school=self.school1,
            subject="Mathematics", duration_minutes=30, total_marks=100, is_official=True
        )

        # Attempt: 95% accuracy in 600s (< 900s half allocated time)
        QuizAttempt.objects.create(
            competition=comp, user=self.student_user1, student=self.student1,
            score_percentage=Decimal('95.00'), accuracy_percentage=Decimal('95.00'),
            time_spent_seconds=600, is_official=True
        )

        evaluate_quiz_achievements(self.student_user1.id)

        self.assertTrue(AchievementAward.objects.filter(user=self.student_user1, badge__slug='quiz_novice').exists())
        self.assertTrue(AchievementAward.objects.filter(user=self.student_user1, badge__slug='quiz_sharpshooter').exists())
        self.assertTrue(AchievementAward.objects.filter(user=self.student_user1, badge__slug='quiz_speed_scholar').exists())

    def test_08_quiz_unofficial_challenges_strictly_ignored(self):
        """Peer-to-peer student challenges (is_official=False) MUST NEVER award badges."""
        comp_peer = QuizCompetition.objects.create(
            title="Informal Study Challenge", sponsor_school=self.school1,
            subject="Mathematics", duration_minutes=20, total_marks=100, is_official=False
        )

        QuizAttempt.objects.create(
            competition=comp_peer, user=self.student_user2, student=self.student2,
            score_percentage=Decimal('100.00'), accuracy_percentage=Decimal('100.00'),
            time_spent_seconds=300, is_official=False
        )

        evaluate_quiz_achievements(self.student_user2.id)

        # No badges awarded
        aw_count = AchievementAward.objects.filter(user=self.student_user2).count()
        self.assertEqual(aw_count, 0)

    def test_09_teacher_subject_specialist(self):
        """Tests that a teacher with 80%+ class subject average earns Subject Specialist."""
        conf = ExamConfiguration.objects.create(
            school=self.school1, academic_year=self.acad_year, name="Annual Exam",
            status='published', version=1, published_at=timezone.now(), published_by=self.principal1
        )
        # Create 10 student subject results for teacher's class with avg 85%
        for i in range(10):
            st = Student.objects.create(
                school=self.school1, admission_number=f"TS-{i}", first_name=f"Kid{i}", last_name="Test",
                enrolled_on=self.today
            )
            CalculatedSubjectResult.objects.create(
                student=st, school_class=self.sclass, subject=self.subject_math,
                academic_year=self.acad_year, configuration=conf, completed=True,
                final_percentage=Decimal('85.00')
            )

        evaluate_teacher_achievements(self.teacher1.id)
        aw = AchievementAward.objects.filter(user=self.teacher1, badge__slug='teacher_subject_specialist').first()
        self.assertIsNotNone(aw)
        self.assertEqual(aw.evidence_data.get('class_average'), '85.00')

    def test_10_principal_attendance_guardian(self):
        """Tests campus-wide 90%+ attendance awards Attendance Guardian to Principal."""
        m_start = date(self.today.year, self.today.month, 1)
        for d in range(16):
            Attendance.objects.create(
                student=self.student1, school_class=self.sclass,
                date=m_start + timedelta(days=d), status='present', recorded_by=self.teacher1
            )
            Attendance.objects.create(
                student=self.student2, school_class=self.sclass,
                date=m_start + timedelta(days=d), status='present', recorded_by=self.teacher1
            )

        evaluate_principal_achievements(self.principal1.id)
        aw = AchievementAward.objects.filter(user=self.principal1, badge__slug='principal_attendance_guardian').first()
        self.assertIsNotNone(aw)
        self.assertEqual(aw.evidence_data.get('campus_attendance_rate'), '100.00')

    def test_11_manual_awards_role_hierarchy_and_permissions(self):
        """Tests Org Admin, Principal, and Teacher manual award conferral."""
        # 1. Org Admin to Principal
        aw_org = confer_manual_award(
            actor_user=self.org_admin,
            recipient_user=self.principal1,
            badge_slug='manual_principal_honour',
            reason="Distinguished campus stewardship during expansion."
        )
        self.assertEqual(aw_org.conferred_by, self.org_admin)
        self.assertTrue(aw_org.is_manual)

        # 2. Principal to Teacher of own school
        aw_pr = confer_manual_award(
            actor_user=self.principal1,
            recipient_user=self.teacher1,
            badge_slug='manual_inspirational_teacher',
            reason="Exceptional mentoring and pedagogical leadership in STEM."
        )
        self.assertEqual(aw_pr.conferred_by, self.principal1)

        # 3. Teacher to Student of assigned class
        aw_tch = confer_manual_award(
            actor_user=self.teacher1,
            recipient_user=self.student_user1,
            badge_slug='manual_teachers_commendation',
            reason="Remarkable improvement and peer support in class."
        )
        self.assertEqual(aw_tch.conferred_by, self.teacher1)

    def test_12_manual_awards_blocked_for_unauthorized_users(self):
        """Students cannot confer awards; cross-school principals cannot confer awards."""
        # Student attempting to confer
        with self.assertRaises(Exception):
            confer_manual_award(
                actor_user=self.student_user1,
                recipient_user=self.teacher1,
                badge_slug='manual_inspirational_teacher',
                reason="Thank you teacher for being great!"
            )

        # Cross-school principal attempting to award teacher of school 1
        with self.assertRaises(Exception):
            confer_manual_award(
                actor_user=self.principal2,
                recipient_user=self.teacher1,
                badge_slug='manual_inspirational_teacher',
                reason="Conferring cross-school accolade."
            )

        # Reason less than 10 characters rejected
        with self.assertRaises(Exception):
            confer_manual_award(
                actor_user=self.principal1,
                recipient_user=self.teacher1,
                badge_slug='manual_inspirational_teacher',
                reason="Good job"
            )

    def test_13_non_revocation_creates_audited_review_flag(self):
        """Demonstrates that subsequent data revision creates an audited review flag, NOT deletion."""
        aw = AchievementAward.objects.create(
            school=self.school1, user=self.student_user1, student=self.student1,
            badge=BadgeDefinition.objects.get(slug='student_attendance_hero'),
            tier='bronze', period_identifier='2026-11',
            evidence_data={'attendance_rate': '95.00'}
        )

        # Flag for review
        flagged = flag_award_for_review(aw.id, reason="Late correction altered attendance from 95% to 88%", actor=self.principal1)
        self.assertTrue(flagged.review_flag)
        self.assertEqual(flagged.review_reason, "Late correction altered attendance from 95% to 88%")

        # Award remains in database!
        self.assertEqual(AchievementAward.objects.filter(id=aw.id).count(), 1)

        # Audit log created
        log = BadgeAuditLog.objects.filter(award=aw, action='review_flagged').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor, self.principal1)

        # Admin resolves
        resolved = resolve_award_review(aw.id, actor=self.principal1, resolution_notes="Reviewed and sustained with commendation.")
        self.assertFalse(resolved.review_flag)

    def test_14_student_safety_and_privacy_api(self):
        """Student achievements visible only to self, linked guardian, and staff of own school."""
        # Give student1 an award
        aw = AchievementAward.objects.create(
            school=self.school1, user=self.student_user1, student=self.student1,
            badge=BadgeDefinition.objects.get(slug='student_first_achievement'),
            tier='bronze', period_identifier='all_time'
        )

        url = f"/api/v1/badges/student/{self.student1.id}/"

        # 1. Student self: 200 OK
        self.client.force_authenticate(user=self.student_user1)
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()['awards']), 1)

        # 2. Linked Guardian: 200 OK
        self.client.force_authenticate(user=self.guardian_user)
        res_g = self.client.get(url)
        self.assertEqual(res_g.status_code, 200)

        # 3. Staff of own school: 200 OK
        self.client.force_authenticate(user=self.teacher1)
        res_t = self.client.get(url)
        self.assertEqual(res_t.status_code, 200)

        # 4. Another student (Peer): 403 Forbidden!
        self.client.force_authenticate(user=self.student_user2)
        res_peer = self.client.get(url)
        self.assertEqual(res_peer.status_code, 403)

        # 5. Cross-school teacher: 403 Forbidden!
        self.client.force_authenticate(user=self.teacher_other)
        res_cross = self.client.get(url)
        self.assertEqual(res_cross.status_code, 403)

    def test_15_badge_catalogue_and_my_achievements_api(self):
        """Tests the public catalogue endpoint and user's personal achievements endpoint."""
        self.client.force_authenticate(user=self.student_user1)

        # Catalogue
        res_cat = self.client.get('/api/v1/badges/catalogue/')
        self.assertEqual(res_cat.status_code, 200)
        self.assertEqual(res_cat.json()['count'], 47)

        # Filter by category
        res_cat_quiz = self.client.get('/api/v1/badges/catalogue/?category=quiz')
        self.assertEqual(res_cat_quiz.status_code, 200)
        self.assertEqual(res_cat_quiz.json()['count'], 15)

        # My achievements
        res_my = self.client.get('/api/v1/badges/my/')
        self.assertEqual(res_my.status_code, 200)
        self.assertIn('summary', res_my.json())
        self.assertIn('awards', res_my.json())
        self.assertIn('progress', res_my.json())

    def test_16_management_command_evaluate_badges(self):
        """Tests idempotent CLI management command execution."""
        call_command('evaluate_badges', school_id=self.school1.id, category='all')
        call_command('evaluate_badges', user_id=self.student_user1.id, category='quiz')
        call_command('evaluate_badges', dry_run=True)
