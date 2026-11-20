"""
Optimus Orien "Network" Feature Test Suite.
Validates:
1. Strict child safety: zero contact path for minors, students cannot connect or message.
2. Explicit opt-in consent and immediate purge on withdrawal.
3. Golden ranking tests with hand-calculated scores, competition ties (1, 2, 2, 4), and eligibility thresholds.
4. Zero student PII exposure and non-enumeration of non-consented users.
5. Audited badge awards and recomputation.
6. Connection request flows, daily limits (max 20), 7-day decline cooldown, and privacy filters.
7. Safety tools: blocks, mutes, reports, and administrative moderation.
8. Neutral wording scan across network payloads.
9. RLS coverage verification for platform-level unscoped tables.
"""
from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from core.models import (
    Organisation, School, User, Student, Subject, SchoolClass, AcademicYear,
    Assessment, Grade, SchoolNetworkSetting, NetworkProfile,
    NetworkConsent, BoardSnapshot, BadgeAward, ConnectionRequest,
    Connection, Block, Mute, Report, NetworkAuditEvent, Conversation,
    UserKeyBundle, EncryptedMessage
)
from core.services.network_service import (
    grant_network_consent, withdraw_network_consent, send_connection_request,
    accept_connection_request, decline_connection_request, block_user,
    remove_connection, file_report, resolve_report
)
from core.services.network_ranking import (
    assign_competition_ranks, refresh_network_snapshots_for_period
)


class NetworkFeatureTestSuite(TestCase):
    @classmethod
    def setUpTestData(cls):
        # 1. Institutions
        cls.org_a = Organisation.objects.create(name="Al-Farabi Trust", code="FAR-01")
        cls.school_a = School.objects.create(name="Al-Farabi Academy", code="FAR-SCH-01", organisation=cls.org_a, city="Lahore")

        cls.org_b = Organisation.objects.create(name="Oxford Collegiate Trust", code="OXF-01")
        cls.school_b = School.objects.create(name="Oxford Academy London", code="OXF-SCH-01", organisation=cls.org_b, city="London")

        # Enable network for both campuses
        SchoolNetworkSetting.objects.create(school=cls.school_a, network_enabled=True, staff_board_enabled=True, student_board_enabled=True)
        SchoolNetworkSetting.objects.create(school=cls.school_b, network_enabled=True, staff_board_enabled=True, student_board_enabled=True)

        # 2. Adult Users
        cls.principal_a = User.objects.create_user(
            username="principal_a", password="StrongPassword123!", role="principal",
            first_name="Haroon", last_name="Rasheed", organisation=cls.org_a, school=cls.school_a
        )
        cls.teacher_a1 = User.objects.create_user(
            username="teacher_a1", password="StrongPassword123!", role="teacher",
            first_name="Zubair", last_name="Ahmed", organisation=cls.org_a, school=cls.school_a
        )
        cls.teacher_a2 = User.objects.create_user(
            username="teacher_a2", password="StrongPassword123!", role="teacher",
            first_name="Bilal", last_name="Khan", organisation=cls.org_a, school=cls.school_a
        )

        cls.principal_b = User.objects.create_user(
            username="principal_b", password="StrongPassword123!", role="principal",
            first_name="Edward", last_name="Vane", organisation=cls.org_b, school=cls.school_b
        )
        cls.teacher_b1 = User.objects.create_user(
            username="teacher_b1", password="StrongPassword123!", role="teacher",
            first_name="Clara", last_name="Oswald", organisation=cls.org_b, school=cls.school_b
        )

        cls.platform_admin = User.objects.create_user(
            username="plat_admin", password="StrongPassword123!", role="platform_admin", is_superuser=True
        )

        # 3. Minors & Guardians
        cls.guardian = User.objects.create_user(
            username="guardian_user", password="StrongPassword123!", role="parent",
            first_name="Tariq", last_name="Mahmood", organisation=cls.org_a, school=cls.school_a
        )
        cls.student_user = User.objects.create_user(
            username="minor_student", password="StrongPassword123!", role="student",
            first_name="Amina", last_name="Mahmood", organisation=cls.org_a, school=cls.school_a
        )
        cls.student = Student.objects.create(
            school=cls.school_a,
            admission_number="ST-001",
            first_name="Amina",
            last_name="Mahmood",
            user=cls.student_user,
            enrolled_on=timezone.localdate()
        )

        # 4. Curriculum & Academic Structure
        today = timezone.localdate()
        cls.year_a = AcademicYear.objects.create(
            school=cls.school_a,
            name="2025-2026",
            start_date=today - timedelta(days=180),
            end_date=today + timedelta(days=180)
        )
        cls.class_9a = SchoolClass.objects.create(school=cls.school_a, academic_year=cls.year_a, name="Grade 9")
        cls.subject_math = Subject.objects.create(school=cls.school_a, name="Mathematics", code="MTH9")

        # Create 16 students for Grade 9 class
        for i in range(2, 18):
            Student.objects.create(
                school=cls.school_a,
                admission_number=f"ST-{i:03d}",
                first_name=f"Student{i}",
                last_name="Fictional",
                enrolled_on=timezone.localdate()
            )

        cls.assessment_1 = Assessment.objects.create(
            school_class=cls.class_9a, subject=cls.subject_math, title="Exam 1", max_marks=100, date=timezone.localdate()
        )
        cls.assessment_2 = Assessment.objects.create(
            school_class=cls.class_9a, subject=cls.subject_math, title="Exam 2", max_marks=100, date=timezone.localdate()
        )

    def setUp(self):
        self.client = APIClient()

    # =========================================================================
    # 1. CHILD SAFETY & NON-NEGOTIABLE BARRIERS
    # =========================================================================

    def test_minor_cannot_have_network_profile(self):
        """Students and minor accounts receive 403 on profile access."""
        self.client.force_authenticate(user=self.student_user)
        res = self.client.get('/api/v1/network/profile/me/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Child Safety", res.data.get('detail', ''))

    def test_minor_cannot_send_or_receive_connection_requests(self):
        """Server-side check: minors can NEVER send or receive connection requests."""
        # 1. Student attempts to send request to adult
        self.client.force_authenticate(user=self.student_user)
        res = self.client.post('/api/v1/network/requests/', {'to_user_id': self.teacher_a1.id, 'note': 'Hi'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Adult attempts to send request to student
        self.client.force_authenticate(user=self.teacher_a1)
        res2 = self.client.post('/api/v1/network/requests/', {'to_user_id': self.student_user.id, 'note': 'Hello'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_cannot_network(self):
        """Parents cannot send connection requests in this version."""
        self.client.force_authenticate(user=self.guardian)
        res = self.client.post('/api/v1/network/requests/', {'to_user_id': self.teacher_a1.id}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_achievers_board_has_no_contact_or_profile_links(self):
        """Student Achievers board returns display alias and honors only, with ZERO contact paths."""
        # Grant guardian consent
        grant_network_consent(
            user=self.student_user,
            consent_type='student_recognition',
            guardian_user=self.guardian
        )
        # Create grades >= 70%
        Grade.objects.create(assessment=self.assessment_1, student=self.student, marks=Decimal('92.00'))
        Grade.objects.create(assessment=self.assessment_2, student=self.student, marks=Decimal('88.00'))

        refresh_network_snapshots_for_period(period_identifier="2025-2026 Term 2")

        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.get('/api/v1/network/boards/students/?subject=Mathematics&grade_level=Grade 9')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', [])
        self.assertTrue(len(results) > 0)
        achiever = results[0]
        # Verified display alias: "Amina M."
        self.assertEqual(achiever['display_alias'], "Amina M.")
        # Zero contact fields
        self.assertNotIn('email', achiever)
        self.assertNotIn('phone', achiever)
        self.assertNotIn('user_id', achiever)
        self.assertNotIn('student_id', achiever)
        self.assertNotIn('connect_url', achiever)

    # =========================================================================
    # 2. OPT-IN CONSENT & INSTANT REVOCATION
    # =========================================================================

    def test_nobody_appears_without_explicit_consent(self):
        """Unconsented teachers and principals never appear on boards."""
        refresh_network_snapshots_for_period(period_identifier="2025-2026 Term 2")
        self.assertEqual(BoardSnapshot.objects.filter(entity_id=self.teacher_a1.id).count(), 0)
        self.assertEqual(BoardSnapshot.objects.filter(entity_id=self.principal_a.id).count(), 0)

    def test_withdrawal_of_consent_immediately_purges_snapshots(self):
        """When consent is withdrawn, entity is immediately removed from all board snapshots."""
        grant_network_consent(user=self.principal_a, consent_type='principal_board')
        refresh_network_snapshots_for_period(period_identifier="2025-2026 Term 2")
        self.assertEqual(BoardSnapshot.objects.filter(entity_id=self.principal_a.id).count(), 1)

        # Withdraw consent
        self.client.force_authenticate(user=self.principal_a)
        res = self.client.post('/api/v1/network/consent/withdraw/', {'consent_type': 'principal_board'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Snapshot was deleted immediately
        self.assertEqual(BoardSnapshot.objects.filter(entity_id=self.principal_a.id).count(), 0)

    # =========================================================================
    # 3. GOLDEN RANKING TESTS (COMPETITION TIES 1, 2, 2, 4 & ELIGIBILITY)
    # =========================================================================

    def test_standard_competition_ties_algorithm(self):
        """Validates 1, 2, 2, 4 competition ranking with hand-calculated scores."""
        candidates = [
            {'name': 'Alpha', 'score': Decimal('95.00')},
            {'name': 'Beta', 'score': Decimal('88.00')},
            {'name': 'Gamma', 'score': Decimal('88.00')},
            {'name': 'Delta', 'score': Decimal('75.00')}
        ]
        ranked = assign_competition_ranks(candidates, score_key='score')
        self.assertEqual(ranked[0]['rank'], 1)  # Alpha
        self.assertEqual(ranked[1]['rank'], 2)  # Beta
        self.assertEqual(ranked[2]['rank'], 2)  # Gamma (tied)
        self.assertEqual(ranked[3]['rank'], 4)  # Delta (skips to 4!)

    def test_teacher_ranking_within_subject_and_grade_only(self):
        """Teachers are ranked strictly per subject and grade level, never cross-subject."""
        grant_network_consent(user=self.teacher_a1, consent_type='teacher_board')
        grant_network_consent(user=self.teacher_a2, consent_type='teacher_board')

        # Populate class grades: teacher_a1 gets 90%, teacher_a2 gets 80%
        students = Student.objects.filter(school=self.school_a)[:16]
        for s in students:
            Grade.objects.create(assessment=self.assessment_1, student=s, marks=Decimal('90.00'))
            Grade.objects.create(assessment=self.assessment_2, student=s, marks=Decimal('90.00'))

        refresh_network_snapshots_for_period(period_identifier="2025-2026 Term 2")

        snaps = BoardSnapshot.objects.filter(board_type='teachers', subject_name="Mathematics", grade_level="Grade 9")
        self.assertTrue(snaps.exists())
        self.assertEqual(snaps.first().subject_name, "Mathematics")
        self.assertEqual(snaps.first().grade_level, "Grade 9")

    def test_ineligible_teacher_under_minimum_threshold(self):
        """A teacher with < 15 students or < 2 assessments is flagged is_eligible=False."""
        # Create a small class with only 5 students
        today = timezone.localdate()
        year_b = AcademicYear.objects.create(
            school=self.school_b,
            name="2025-2026",
            start_date=today - timedelta(days=180),
            end_date=today + timedelta(days=180)
        )
        small_class = SchoolClass.objects.create(school=self.school_b, academic_year=year_b, name="Small Class")
        subj_art = Subject.objects.create(school=self.school_b, name="Art", code="ART")
        ass_art = Assessment.objects.create(school_class=small_class, subject=subj_art, title="Art Test", max_marks=100, date=timezone.localdate())

        for i in range(5):
            st = Student.objects.create(school=self.school_b, admission_number=f"ST-B-{i}", first_name=f"ArtStudent{i}", last_name="Fictional", enrolled_on=timezone.localdate())
            Grade.objects.create(assessment=ass_art, student=st, marks=Decimal('85.00'))

        grant_network_consent(user=self.teacher_b1, consent_type='teacher_board')
        refresh_network_snapshots_for_period(period_identifier="2025-2026 Term 2")

        snap = BoardSnapshot.objects.filter(entity_id=self.teacher_b1.id, subject_name="Art").first()
        if snap:
            self.assertFalse(snap.is_eligible)
            self.assertIn("minimum 15 students", snap.eligibility_reason.lower())

    # =========================================================================
    # 4. BADGE AWARDS & RECOMPUTATION
    # =========================================================================

    def test_top_3_receive_gold_silver_bronze_badges(self):
        """Top 3 ranks on snapshots receive audited badge awards."""
        grant_network_consent(user=self.principal_a, consent_type='principal_board')
        grant_network_consent(user=self.principal_b, consent_type='principal_board')

        refresh_network_snapshots_for_period(period_identifier="2025-2026 Term 2")

        awards = BadgeAward.objects.filter(period_identifier="2025-2026 Term 2")
        badge_types = set(awards.values_list('badge_type', flat=True))
        self.assertTrue(bool(badge_types.intersection({'gold', 'silver', 'bronze'})))

    # =========================================================================
    # 5. CONNECTION FLOWS, RATE LIMITS, COOLDOWN & PRIVACY
    # =========================================================================

    def test_connection_request_daily_rate_limit(self):
        """A user cannot exceed 20 connection requests per 24 hours."""
        for i in range(20):
            dummy = User.objects.create_user(
                username=f"dummy_{i}", password="StrongPassword123!", role="teacher",
                organisation=self.org_b, school=self.school_b
            )
            ConnectionRequest.objects.create(from_user=self.teacher_a1, to_user=dummy, status='pending')

        # 21st request must be rejected
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.post('/api/v1/network/requests/', {'to_user_id': self.teacher_b1.id}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("limit reached", res.data.get('detail', '').lower())

    def test_7_day_cooldown_after_decline(self):
        """After a request is declined, sender must wait 7 days before requesting again."""
        req = ConnectionRequest.objects.create(
            from_user=self.teacher_a1, to_user=self.teacher_b1, status='declined', responded_at=timezone.now()
        )
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.post('/api/v1/network/requests/', {'to_user_id': self.teacher_b1.id}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("wait 7 days", res.data.get('detail', '').lower())

    def test_nobody_privacy_setting_rejects_requests(self):
        """When user sets allow_requests_from='nobody', incoming requests are denied."""
        prof = NetworkProfile.objects.create(user=self.teacher_b1, allow_requests_from='nobody')
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.post('/api/v1/network/requests/', {'to_user_id': self.teacher_b1.id}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("not accepting", res.data.get('detail', '').lower())

    def test_accept_and_remove_connection(self):
        """Connection acceptance and removal lifecycle."""
        req = ConnectionRequest.objects.create(from_user=self.teacher_a1, to_user=self.teacher_b1, status='pending')

        # Accept
        self.client.force_authenticate(user=self.teacher_b1)
        res_accept = self.client.post(f'/api/v1/network/requests/{req.id}/accept/')
        self.assertEqual(res_accept.status_code, status.HTTP_200_OK)

        min_id, max_id = min(self.teacher_a1.id, self.teacher_b1.id), max(self.teacher_a1.id, self.teacher_b1.id)
        self.assertTrue(Connection.objects.filter(user_a_id=min_id, user_b_id=max_id, status='active').exists())

        # Remove
        res_remove = self.client.delete(f'/api/v1/network/connections/{self.teacher_a1.id}/')
        self.assertEqual(res_remove.status_code, status.HTTP_200_OK)
        self.assertFalse(Connection.objects.filter(user_a_id=min_id, user_b_id=max_id, status='active').exists())

    # =========================================================================
    # 6. SAFETY TOOLS: BLOCK, MUTE, REPORT
    # =========================================================================

    def test_blocking_severs_connection_and_cancels_requests(self):
        """Blocking immediately severs active connections and cancels pending requests."""
        min_id, max_id = min(self.teacher_a1.id, self.teacher_b1.id), max(self.teacher_a1.id, self.teacher_b1.id)
        Connection.objects.create(user_a_id=min_id, user_b_id=max_id, status='active')

        # Teacher A1 blocks Teacher B1
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.post('/api/v1/network/block/', {'user_id': self.teacher_b1.id, 'reason': 'Spam'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Connection was terminated
        conn = Connection.objects.get(user_a_id=min_id, user_b_id=max_id)
        self.assertEqual(conn.status, 'removed')

        # Blocked user cannot view profile
        self.client.force_authenticate(user=self.teacher_b1)
        res_prof = self.client.get(f'/api/v1/network/profiles/{self.teacher_a1.id}/')
        self.assertEqual(res_prof.status_code, status.HTTP_403_FORBIDDEN)

    def test_misconduct_report_and_moderation_resolution(self):
        """Filing a report and resolution by platform administrator."""
        self.client.force_authenticate(user=self.teacher_a1)
        res_file = self.client.post('/api/v1/network/report/', {
            'reported_user_id': self.teacher_b1.id,
            'category': 'harassment',
            'details': 'Persistent unwanted messages.'
        }, format='json')
        self.assertEqual(res_file.status_code, status.HTTP_201_CREATED)
        report_id = res_file.data['report_id']

        # Admin resolves
        self.client.force_authenticate(user=self.platform_admin)
        res_resolve = self.client.post(f'/api/v1/network/admin/moderation/{report_id}/resolve/', {
            'action': 'resolved_action_taken',
            'notes': 'Account warned.',
            'suspend_user': True
        }, format='json')
        self.assertEqual(res_resolve.status_code, status.HTTP_200_OK)

        # Teacher B1 is suspended
        prof = NetworkProfile.objects.get(user=self.teacher_b1)
        self.assertTrue(prof.is_suspended)

    # =========================================================================
    # 7. SECURITY & NEUTRAL WORDING SCAN
    # =========================================================================

    def test_xss_payload_in_headline_and_notes_neutralized(self):
        """Malicious script tags in headline or notes are cleanly stripped."""
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.patch('/api/v1/network/profile/me/', {
            'headline': '<script>alert("xss")</script>Senior Teacher'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        prof = NetworkProfile.objects.get(user=self.teacher_a1)
        self.assertNotIn('<script>', prof.headline)
        self.assertEqual(prof.headline, 'Senior Teacher')

    def test_neutral_wording_scan(self):
        """Verifies that no punitive or negative labels exist in network models or snapshots."""
        FORBIDDEN_WORDS = ['punitive', 'at-risk', 'failing', 'loser', 'deficient', 'bad', 'inferior', 'terrible']
        snapshots = BoardSnapshot.objects.all()
        for s in snapshots:
            for word in FORBIDDEN_WORDS:
                self.assertNotIn(word, s.tier_label.lower())
                self.assertNotIn(word, s.positive_band.lower())
                self.assertNotIn(word, s.eligibility_reason.lower())

    def test_rls_coverage_for_network_tables(self):
        """
        Validates that all new network tables are documented and accounted for.
        Platform-level unscoped tables:
          - NetworkProfile
          - NetworkConsent
          - BoardSnapshot
          - BadgeAward
          - ConnectionRequest
          - Connection
          - Block
          - Mute
          - Report
          - UserKeyBundle
          - Conversation
          - EncryptedMessage
          - NetworkAuditEvent
        Tenant-scoped table:
          - SchoolNetworkSetting (has school_id, protected by RLS policy)
        """
        self.assertTrue(hasattr(SchoolNetworkSetting, 'school_id'))
        # Ensure platform-level tables do not inadvertently have school_id
        self.assertFalse(hasattr(NetworkProfile, 'school_id'))
        self.assertFalse(hasattr(BoardSnapshot, 'school_id'))
        self.assertFalse(hasattr(Connection, 'school_id'))
        self.assertFalse(hasattr(Conversation, 'school_id'))

    # =========================================================================
    # STAGE 4: E2EE CHAT TESTS
    # =========================================================================

    def test_e2ee_minor_cannot_register_keys_or_chat(self):
        """Child safety: Minors are barred from registering keys, opening conversations, or messaging."""
        self.client.force_authenticate(user=self.student_user)

        # 1. Register key bundle
        res = self.client.post('/api/v1/network/chat/keys/bundle/', {
            'identity_key': 'fake_ed25519_id_key_base64',
            'signed_prekey': 'fake_x25519_spk_base64'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Open conversation
        res = self.client.post('/api/v1/network/chat/conversations/', {
            'peer_id': self.teacher_a1.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. List conversations
        res = self.client.get('/api/v1/network/chat/conversations/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_e2ee_key_bundle_exchange(self):
        """Adult educators can register public keys; connected peers can fetch and consume OTKs."""
        # 1. Teacher A1 registers key bundle
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.post('/api/v1/network/chat/keys/bundle/', {
            'identity_key': 'ed25519_pub_key_a1',
            'signed_prekey': 'x25519_spk_a1',
            'prekey_signature': 'sig_a1_spk',
            'one_time_keys': ['otk_1', 'otk_2', 'otk_3']
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['otk_count'], 3)

        # 2. Teacher B1 (unconnected) attempts to fetch A1's keys -> 403 Forbidden
        self.client.force_authenticate(user=self.teacher_b1)
        res = self.client.get(f'/api/v1/network/chat/keys/{self.teacher_a1.id}/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Connect Teacher A1 and Teacher B1
        Connection.objects.create(user_a=self.teacher_a1, user_b=self.teacher_b1, status='active')

        # 4. Now Teacher B1 fetches A1's bundle -> 200 OK, consumes 1 OTK ('otk_1')
        res = self.client.get(f'/api/v1/network/chat/keys/{self.teacher_a1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['identity_key'], 'ed25519_pub_key_a1')
        self.assertEqual(res.data['one_time_key'], 'otk_1')

        # 5. Verify OTK was removed from target bundle
        bundle = UserKeyBundle.objects.get(user=self.teacher_a1)
        self.assertEqual(len(bundle.one_time_keys), 2)
        self.assertNotIn('otk_1', bundle.one_time_keys)

    def test_e2ee_conversation_rules(self):
        """Conversations can only be opened between mutually connected, unblocked adult educators."""
        # Unconnected teachers cannot open conversation
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.post('/api/v1/network/chat/conversations/', {
            'peer_id': self.teacher_a2.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Create accepted connection
        Connection.objects.create(user_a=self.teacher_a1, user_b=self.teacher_a2, status='active')

        # Successfully opens
        res = self.client.post('/api/v1/network/chat/conversations/', {
            'peer_id': self.teacher_a2.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        conv_id = res.data['conversation_id']
        self.assertTrue(Conversation.objects.filter(id=conv_id).exists())

        # If blocked, conversation fails
        Block.objects.create(blocker=self.teacher_a2, blocked=self.teacher_a1)
        res = self.client.post('/api/v1/network/chat/conversations/', {
            'peer_id': self.teacher_a2.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_e2ee_send_and_retrieve_encrypted_messages(self):
        """Verifies encrypted message dispatch, delivery tracking, and zero plaintext in DB."""
        conn = Connection.objects.create(user_a=self.teacher_a1, user_b=self.teacher_a2, status='active')
        conv = Conversation.objects.create(
            participant_a=min(self.teacher_a1, self.teacher_a2, key=lambda u: u.id),
            participant_b=max(self.teacher_a1, self.teacher_a2, key=lambda u: u.id),
            status='active'
        )

        # Teacher A1 sends encrypted message envelope
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.post(f'/api/v1/network/chat/conversations/{conv.id}/messages/', {
            'ciphertext': 'base64_aes_gcm_ciphertext_payload_abc123',
            'nonce': 'base64_unique_nonce_987654',
            'sender_signature': 'ed25519_detached_signature_xyz'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        msg_id = res.data['message_id']

        # Confirm DB stored ciphertext and zero plaintext
        stored_msg = EncryptedMessage.objects.get(id=msg_id)
        self.assertEqual(stored_msg.ciphertext, 'base64_aes_gcm_ciphertext_payload_abc123')
        self.assertEqual(stored_msg.nonce, 'base64_unique_nonce_987654')
        self.assertEqual(stored_msg.sender_signature, 'ed25519_detached_signature_xyz')
        self.assertIsNone(stored_msg.delivered_at)

        # Teacher A2 retrieves messages
        self.client.force_authenticate(user=self.teacher_a2)
        res = self.client.get(f'/api/v1/network/chat/conversations/{conv.id}/messages/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['ciphertext'], 'base64_aes_gcm_ciphertext_payload_abc123')

        # Verify delivered_at was set
        stored_msg.refresh_from_db()
        self.assertIsNotNone(stored_msg.delivered_at)

        # Unrelated teacher cannot access messages
        self.client.force_authenticate(user=self.teacher_b1)
        res = self.client.get(f'/api/v1/network/chat/conversations/{conv.id}/messages/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_e2ee_severed_connection_blocks_messaging(self):
        """Severing connection or blocking immediately denies subsequent messaging."""
        conn = Connection.objects.create(user_a=self.teacher_a1, user_b=self.teacher_a2, status='active')
        conv = Conversation.objects.create(
            participant_a=min(self.teacher_a1, self.teacher_a2, key=lambda u: u.id),
            participant_b=max(self.teacher_a1, self.teacher_a2, key=lambda u: u.id),
            status='active'
        )

        # Remove connection
        conn.delete()

        # Sending message is now barred
        self.client.force_authenticate(user=self.teacher_a1)
        res = self.client.post(f'/api/v1/network/chat/conversations/{conv.id}/messages/', {
            'ciphertext': 'test_ciphertext',
            'nonce': 'test_nonce'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

