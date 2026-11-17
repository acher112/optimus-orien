"""Automated test suite for Record and Teacher Performance modules.

Covers:
1. Permission Matrix & Policy Parity
2. Staff Lifecycle Transitions & State Machine
3. Student Lifecycle Transitions & State Machine
4. Server-Side Campus Scoping & Anti-Tampering Defenses
5. Salary Line Masking (Totals vs Line Details)
6. Terminated Notes Privacy Controls
7. Dual-Sheet Excel (.xlsx) Streaming Export & Formula-Injection Neutralization
8. Teacher Performance Evaluation & Fairness Thresholds (Insufficient Data)
9. Versioned Risk Criteria & Live Impact Preview
10. Supportive Alerts Lifecycle & Principal Human Confirmation
11. Teacher Self-View & Peer Isolation
12. Bilingual Banned-Word Scan (Developmental Language Verification)
"""
import io
import re
from datetime import date, timedelta
from decimal import Decimal
import openpyxl

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import (
    Organisation, School, User, AcademicYear, SchoolClass, Subject, Section,
    Student, Enrollment, StaffMember, TeachingAssignment,
    FeeHead, StudentFee, FeePayment, FinanceCategory, FinanceEntry, SalaryRecord,
    StaffLifecycleEvent, StudentLifecycleEvent, LifecycleReasonCategory,
    TeacherPerformanceCriteria, TeacherPerformanceAlert, TeacherPerformanceNote,
    CalculatedSubjectResult, ExamConfiguration, OrganisationRolePolicy, SchoolSubscription
)
from core.services.record_permissions import (
    RECORD_CAPABILITIES, resolve_record_school, can_view_salary_lines, can_view_terminated_notes
)
from core.services.record_exports import sanitize_formula_injection
from core.services.teacher_performance_service import (
    get_teacher_performance_overview, preview_criteria_impact
)


class RecordAndTeacherPerformanceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Beacon Education Network", code="ben")

        self.campus1 = School.objects.create(
            organisation=self.org, name="City Campus", code="CC1",
            teachers_can_view_own_performance=True
        )
        self.campus2 = School.objects.create(
            organisation=self.org, name="North Campus", code="NC2",
            teachers_can_view_own_performance=True
        )

        # Grant active premium subscription so tests are not blocked by billing tier
        from core.models import Plan, PlanFeature
        self.premium_plan, _ = Plan.objects.get_or_create(
            code='premium',
            defaults={'name': 'Premium', 'price_usd_per_student_month': Decimal('7.20')}
        )
        PlanFeature.objects.get_or_create(plan=self.premium_plan, feature_key='teacher_insights', defaults={'is_included': True})
        for c in (self.campus1, self.campus2):
            SchoolSubscription.objects.update_or_create(
                school=c,
                defaults={'status': 'active', 'plan': self.premium_plan}
            )

        # Users
        self.owner = User.objects.create_user(
            username="owner_user", email="owner@ben.edu", password="password123",
            role="organisation_admin", organisation=self.org
        )
        self.principal1 = User.objects.create_user(
            username="principal_cc1", email="p1@ben.edu", password="password123",
            role="principal", organisation=self.org, school=self.campus1
        )
        self.principal2 = User.objects.create_user(
            username="principal_nc2", email="p2@ben.edu", password="password123",
            role="principal", organisation=self.org, school=self.campus2
        )
        self.teacher1 = User.objects.create_user(
            username="teacher_t1", email="t1@ben.edu", password="password123",
            role="teacher", organisation=self.org, school=self.campus1
        )
        self.teacher2 = User.objects.create_user(
            username="teacher_t2", email="t2@ben.edu", password="password123",
            role="teacher", organisation=self.org, school=self.campus1
        )
        self.student_user = User.objects.create_user(
            username="student_s1", email="s1@ben.edu", password="password123",
            role="student", organisation=self.org, school=self.campus1
        )

        # Academic Structure
        self.year = AcademicYear.objects.create(
            school=self.campus1, name="2026-2027",
            start_date=date(2026, 8, 1), end_date=date(2027, 6, 30)
        )
        self.school_class = SchoolClass.objects.create(
            school=self.campus1, academic_year=self.year, name="Grade 8"
        )
        self.section = Section.objects.create(
            school_class=self.school_class, name="Section A"
        )
        self.subject = Subject.objects.create(
            school=self.campus1, name="General Science", code="SCI8"
        )

        # Staff Member
        self.staff_member = StaffMember.objects.create(
            school=self.campus1, user=self.teacher1, first_name="Tariq", last_name="Jameel",
            position="Science Teacher", role="teacher", hired_on=date(2024, 1, 15)
        )

        # Teaching Assignment
        self.teaching_assignment = TeachingAssignment.objects.create(
            school=self.campus1, teacher=self.teacher1, school_class=self.school_class,
            subject=self.subject, start_date=date(2026, 8, 1)
        )

        # Student & Enrollment
        self.student = Student.objects.create(
            school=self.campus1, user=self.student_user, admission_number="STD-001",
            first_name="Ahmed", last_name="Raza", enrolled_on=date(2025, 8, 1)
        )
        self.enrollment = Enrollment.objects.create(
            student=self.student, school_class=self.school_class, section=self.section,
            start_date=date(2026, 8, 1)
        )

        # Reason Category
        self.reason_staff = LifecycleReasonCategory.objects.create(
            school=self.campus1, target_type='staff', code='hired',
            name_en='New Appointment', name_ur='نئی تقرری'
        )
        self.reason_student = LifecycleReasonCategory.objects.create(
            school=self.campus1, target_type='student', code='new_admission',
            name_en='New Admission', name_ur='نیا داخلہ'
        )

    # -------------------------------------------------------------
    # 1. Permission Matrix & Parity Tests
    # -------------------------------------------------------------
    def test_permission_matrix_parity(self):
        """Verifies all defined capability keys exist in documentation and policy defaults."""
        with open("design/permission-matrix.md", "r", encoding="utf-8") as f:
            matrix_content = f.read()

        for cap in RECORD_CAPABILITIES:
            self.assertIn(f"`{cap}`", matrix_content, f"Capability {cap} missing from design/permission-matrix.md")

        policy_defaults = OrganisationRolePolicy.DEFAULT_PRINCIPAL_PERMISSIONS
        self.assertTrue(policy_defaults['records.view_staff'])
        self.assertTrue(policy_defaults['records.view_students'])
        self.assertTrue(policy_defaults['records.view_fees'])
        self.assertTrue(policy_defaults['records.view_finance'])
        self.assertTrue(policy_defaults['records.view_salaries'])
        self.assertFalse(policy_defaults['records.view_salary_lines'])
        self.assertFalse(policy_defaults['records.view_terminated_notes'])

    # -------------------------------------------------------------
    # 2. Staff Lifecycle Transitions & State Machine
    # -------------------------------------------------------------
    def test_staff_lifecycle_state_machine(self):
        """Tests valid staff transitions and verifies invalid state progressions fail."""
        # 1. Joined
        ev1 = StaffLifecycleEvent.objects.create(
            staff=self.staff_member, school=self.campus1, event_type='joined',
            effective_date=date(2024, 1, 15), reason_category=self.reason_staff
        )
        self.assertEqual(ev1.event_type, 'joined')

        # 2. Resigned
        ev2 = StaffLifecycleEvent.objects.create(
            staff=self.staff_member, school=self.campus1, event_type='resigned',
            effective_date=date(2025, 12, 31)
        )
        self.assertEqual(ev2.event_type, 'resigned')

        # 3. Invalid transition: cannot transfer while separated
        ev_invalid = StaffLifecycleEvent(
            staff=self.staff_member, school=self.campus1, event_type='transferred',
            to_campus=self.campus2, effective_date=date(2026, 1, 15)
        )
        with self.assertRaises(Exception):
            ev_invalid.full_clean()

        # 4. Valid rejoining
        ev3 = StaffLifecycleEvent.objects.create(
            staff=self.staff_member, school=self.campus1, event_type='rejoined',
            effective_date=date(2026, 2, 1)
        )
        self.assertEqual(ev3.event_type, 'rejoined')

    # -------------------------------------------------------------
    # 3. Student Lifecycle Transitions & State Machine
    # -------------------------------------------------------------
    def test_student_lifecycle_state_machine(self):
        """Tests valid student transitions and neutral labeling."""
        ev1 = StudentLifecycleEvent.objects.create(
            student=self.student, enrollment=self.enrollment, school=self.campus1,
            academic_year=self.year, school_class=self.school_class, section=self.section,
            event_type='admitted', effective_date=date(2025, 8, 1)
        )
        self.assertEqual(ev1.get_event_type_display(), 'Admitted / Enrolled')

        # Student leaves
        ev2 = StudentLifecycleEvent.objects.create(
            student=self.student, enrollment=self.enrollment, school=self.campus1,
            academic_year=self.year, school_class=self.school_class, section=self.section,
            event_type='left', leave_subtype='withdrawn', effective_date=date(2026, 1, 10)
        )

        # Invalid transition: left student cannot be promoted without readmission
        ev_invalid = StudentLifecycleEvent(
            student=self.student, enrollment=self.enrollment, school=self.campus1,
            academic_year=self.year, school_class=self.school_class, section=self.section,
            event_type='promoted', effective_date=date(2026, 6, 1)
        )
        with self.assertRaises(Exception):
            ev_invalid.full_clean()

    # -------------------------------------------------------------
    # 4. Campus Isolation & Anti-Tampering Defenses
    # -------------------------------------------------------------
    def test_principal_campus_isolation_tampering(self):
        """Verifies that a Principal attempting to access or query another campus is rejected server-side."""
        self.client.force_authenticate(user=self.principal1)

        # Accessing own campus -> 200 OK
        res_own = self.client.get(f'/api/v1/records/overview/?campus={self.campus1.id}')
        self.assertEqual(res_own.status_code, 200)

        # Tampering with another campus -> 403 Forbidden
        res_other = self.client.get(f'/api/v1/records/overview/?campus={self.campus2.id}')
        self.assertEqual(res_other.status_code, 403)

    # -------------------------------------------------------------
    # 5. Salary Line Masking (Totals vs Lines)
    # -------------------------------------------------------------
    def test_salary_lines_masking_for_principal(self):
        """Verifies Principal sees salary totals but individual lines are masked by default."""
        cat_exp = FinanceCategory.objects.create(school=self.campus1, kind='expense', name='Salaries')
        fe = FinanceEntry.objects.create(school=self.campus1, category=cat_exp, amount=Decimal('85000.00'), date=date(2026, 10, 31))
        SalaryRecord.objects.create(
            staff=self.staff_member, school=self.campus1, month='2026-10',
            basic=Decimal('70000.00'), gross=Decimal('85000.00'), net=Decimal('80000.00'),
            status='paid', finance_entry=fe
        )

        # Principal view
        self.client.force_authenticate(user=self.principal1)
        res_p = self.client.get('/api/v1/records/salaries/')
        self.assertEqual(res_p.status_code, 200)
        data_p = res_p.json()
        self.assertFalse(data_p['salary_lines_unlocked'])
        self.assertIsNone(data_p['rows'][0]['gross'])
        self.assertIsNone(data_p['rows'][0]['net'])

        # Owner view -> Unmasked lines
        self.client.force_authenticate(user=self.owner)
        res_o = self.client.get(f'/api/v1/records/salaries/?campus={self.campus1.id}')
        self.assertEqual(res_o.status_code, 200)
        data_o = res_o.json()
        self.assertTrue(data_o['salary_lines_unlocked'])
        self.assertEqual(float(data_o['rows'][0]['net']), 80000.00)

    # -------------------------------------------------------------
    # 6. Terminated Notes Privacy Controls
    # -------------------------------------------------------------
    def test_terminated_notes_privacy(self):
        """Verifies termination notes are strictly confidential to Owner/Org Admin."""
        ev = StaffLifecycleEvent.objects.create(
            staff=self.staff_member, school=self.campus1, event_type='terminated',
            effective_date=date(2026, 3, 1),
            restricted_notes='Confidential disciplinary separation details.'
        )

        # Principal view -> notes masked
        self.client.force_authenticate(user=self.principal1)
        res_p = self.client.get('/api/v1/records/staff/')
        self.assertEqual(res_p.status_code, 200)
        self.assertEqual(res_p.json()['rows'][0]['notes'], '[Confidential]')

        # Owner view -> notes visible
        self.client.force_authenticate(user=self.owner)
        res_o = self.client.get(f'/api/v1/records/staff/?campus={self.campus1.id}')
        self.assertEqual(res_o.status_code, 200)
        self.assertEqual(res_o.json()['rows'][0]['notes'], 'Confidential disciplinary separation details.')

    # -------------------------------------------------------------
    # 7. Dual-Sheet Excel (.xlsx) Streaming Export & Formula Injection
    # -------------------------------------------------------------
    def test_record_excel_export_and_formula_injection(self):
        """Verifies formula-injection prefixing and dual-sheet Excel generation."""
        # Test formula sanitizer directly
        self.assertEqual(sanitize_formula_injection("=cmd|'/C calc'!A0"), "'=cmd|'/C calc'!A0")
        self.assertEqual(sanitize_formula_injection("+12345"), "'+12345")
        self.assertEqual(sanitize_formula_injection("@SUM(1,2)"), "'@SUM(1,2)")
        self.assertEqual(sanitize_formula_injection("Normal Text"), "Normal Text")

        # Test streaming export endpoint
        self.client.force_authenticate(user=self.owner)
        res = self.client.get(f'/api/v1/records/export/?campus={self.campus1.id}&page_type=staff')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

        # Load streamed binary and verify sheets
        wb = openpyxl.load_workbook(io.BytesIO(res.content))
        self.assertEqual(wb.sheetnames, ['Summary', 'Data'])
        ws_summary = wb['Summary']
        self.assertIn("OPTIMUS ORIEN — STAFF LIFECYCLE RECORD", ws_summary['A1'].value)
        ws_data = wb['Data']
        self.assertEqual(ws_data.freeze_panes, 'A2')

    # -------------------------------------------------------------
    # 8. Teacher Performance Evaluation & Fairness Thresholds
    # -------------------------------------------------------------
    def test_teacher_performance_fairness_insufficient_data(self):
        """Verifies evaluations with < 10 students or < 2 assessments return Insufficient data."""
        self.client.force_authenticate(user=self.principal1)
        res = self.client.get('/api/v1/teacher-performance/overview/')
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # No published assessments yet -> insufficient data
        self.assertGreaterEqual(data['cards']['insufficient_data_count'], 1)
        self.assertEqual(data['cards']['needs_support_count'], 0)

    # -------------------------------------------------------------
    # 9. Versioned Risk Criteria & Live Impact Preview
    # -------------------------------------------------------------
    def test_teacher_performance_criteria_live_preview(self):
        """Tests live impact simulation before saving new criteria version."""
        self.client.force_authenticate(user=self.principal1)
        preview_payload = {
            'campus': self.campus1.id,
            'min_students': 5,
            'min_assessments': 1,
            'diff_campus_threshold': 5.0,
            'pass_rate_threshold': 50.0,
        }
        res = self.client.post('/api/v1/teacher-performance/criteria/preview/', preview_payload, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('counts_by_status', res.json())
        self.assertIn('flagged_teachers_count', res.json())

    # -------------------------------------------------------------
    # 10. Supportive Alerts Lifecycle & Human Confirmation
    # -------------------------------------------------------------
    def test_teacher_performance_alert_lifecycle(self):
        """Verifies alert lifecycle requiring Principal confirmation before becoming active."""
        crit = TeacherPerformanceCriteria.objects.create(school=self.campus1, version=1, active=True)
        alert = TeacherPerformanceAlert.objects.create(
            school=self.campus1, teacher=self.teacher1, school_class=self.school_class,
            subject=self.subject, academic_year=self.year, term_name='First Term 2026',
            criteria_version=1, trigger_reason='Subject pass rate below benchmark',
            status='suggested'
        )

        self.client.force_authenticate(user=self.principal1)

        # Confirm suggested alert
        res_conf = self.client.post(
            f'/api/v1/teacher-performance/alerts/{alert.id}/action/',
            {'action': 'confirm', 'campus': self.campus1.id}, format='json'
        )
        self.assertEqual(res_conf.status_code, 200)
        alert.refresh_from_db()
        self.assertEqual(alert.status, 'open')
        self.assertEqual(alert.confirmed_by, self.principal1)

        # Resolve alert with supportive action plan
        res_res = self.client.post(
            f'/api/v1/teacher-performance/alerts/{alert.id}/action/',
            {'action': 'resolve', 'action_plan': 'Provided mentoring with Senior Science Lead.', 'campus': self.campus1.id},
            format='json'
        )
        self.assertEqual(res_res.status_code, 200)
        alert.refresh_from_db()
        self.assertEqual(alert.status, 'resolved')

    # -------------------------------------------------------------
    # 11. Teacher Self-View & Peer Isolation
    # -------------------------------------------------------------
    def test_teacher_self_view_isolation(self):
        """Verifies teacher can access own reflection view but is forbidden from viewing peers."""
        self.client.force_authenticate(user=self.teacher1)

        # Own profile -> 200 OK
        res_self = self.client.get('/api/v1/teacher-performance/me/')
        self.assertEqual(res_self.status_code, 200)

        # Peer profile -> 403 Forbidden
        res_peer = self.client.get(f'/api/v1/teacher-performance/teachers/{self.teacher2.id}/')
        self.assertEqual(res_peer.status_code, 403)

    # -------------------------------------------------------------
    # 12. Bilingual Banned-Word Scan
    # -------------------------------------------------------------
    def test_banned_word_neutrality_scan(self):
        """Scans code and labels to ensure zero punitive wording (B3 fairness rules)."""
        forbidden_terms = [
            'bad teacher', 'incompetent', 'failing teacher', 'punish teacher',
            'نااہل', 'برا استاد', 'ناکام استاد'
        ]

        target_files = [
            'backend/core/services/teacher_performance_service.py',
            'backend/core/teacher_performance_views.py',
            'backend/core/services/record_service.py',
            'backend/core/record_views.py',
        ]

        for file_path in target_files:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read().lower()
                for bad_word in forbidden_terms:
                    self.assertNotIn(bad_word, content, f"Forbidden punitive word '{bad_word}' found in {file_path}")

    # -------------------------------------------------------------
    # 13. Admin Multi-Campus Consolidated Queries (campus=all)
    # -------------------------------------------------------------
    def test_admin_all_campuses_consolidated_queries(self):
        """Verifies owner and org admin can view consolidated records across all campuses."""
        self.client.force_authenticate(user=self.owner)

        # Seed sample lifecycle events across campuses
        StaffLifecycleEvent.objects.create(
            staff=self.staff_member, school=self.campus1, event_type='joined',
            effective_date=date(2024, 1, 15)
        )
        StudentLifecycleEvent.objects.create(
            student=self.student, school=self.campus1, academic_year=self.year,
            school_class=self.school_class, event_type='admitted',
            effective_date=date(2025, 8, 1)
        )

        # Overview with campus=all
        res_overview = self.client.get('/api/v1/records/overview/?campus=all')
        self.assertEqual(res_overview.status_code, 200)
        self.assertIn('cards', res_overview.data)
        self.assertIn('monthly_summary', res_overview.data)

        # Staff records with campus=all
        res_staff = self.client.get('/api/v1/records/staff/?campus=all')
        self.assertEqual(res_staff.status_code, 200)
        self.assertGreaterEqual(res_staff.data['total_count'], 1)
        # Check that campus information is returned
        first_staff = res_staff.data['rows'][0]
        self.assertIn('campus_name', first_staff)
        self.assertIn('campus_code', first_staff)

        # Student records with campus=all
        res_students = self.client.get('/api/v1/records/students/?campus=all')
        self.assertEqual(res_students.status_code, 200)
        self.assertGreaterEqual(res_students.data['total_count'], 1)
        first_student = res_students.data['rows'][0]
        self.assertIn('campus_name', first_student)

        # Teacher Performance Overview with campus=all
        res_tp = self.client.get('/api/v1/teacher-performance/overview/?campus=all')
        self.assertEqual(res_tp.status_code, 200)
        self.assertIn('teachers', res_tp.data)

    # -------------------------------------------------------------
    # 14. Principal Multi-Campus Tampering Denied (campus=all)
    # -------------------------------------------------------------
    def test_principal_all_campuses_tampering_denied(self):
        """Verifies Principal attempting to access consolidated campus=all is rejected with 403."""
        self.client.force_authenticate(user=self.principal1)

        # Attempting campus=all on Overview
        res_overview = self.client.get('/api/v1/records/overview/?campus=all')
        self.assertEqual(res_overview.status_code, 403)

        # Attempting campus=all on Students
        res_students = self.client.get('/api/v1/records/students/?campus=all')
        self.assertEqual(res_students.status_code, 403)

        # Attempting campus=all on Teacher Performance
        res_tp = self.client.get('/api/v1/teacher-performance/overview/?campus=all')
        self.assertEqual(res_tp.status_code, 403)

    # -------------------------------------------------------------
    # 15. Class-Level Record Scoping & Filtering
    # -------------------------------------------------------------
    def test_class_level_record_scoping(self):
        """Verifies filtering by specific class scopes student and fee records accurately."""
        self.client.force_authenticate(user=self.owner)

        StudentLifecycleEvent.objects.create(
            student=self.student, school=self.campus1, academic_year=self.year,
            school_class=self.school_class, event_type='admitted',
            effective_date=date(2025, 8, 1)
        )

        # Filter by school_class
        res_c1 = self.client.get(f'/api/v1/records/students/?campus=CC1&class={self.school_class.id}')
        self.assertEqual(res_c1.status_code, 200)
        for r in res_c1.data['rows']:
            self.assertEqual(r['class_name'], self.school_class.name)

        # Filter by fees with school_class
        res_fees = self.client.get(f'/api/v1/records/fees/?campus=CC1&class={self.school_class.id}')
        self.assertEqual(res_fees.status_code, 200)

    # -------------------------------------------------------------
    # 16. Comprehensive All-in-One Master Dossier Excel (.xlsx) Export
    # -------------------------------------------------------------
    def test_comprehensive_master_dossier_excel_export(self):
        """Verifies multi-sheet master dossier (.xlsx) export covering all sections at once."""
        self.client.force_authenticate(user=self.owner)

        StaffLifecycleEvent.objects.create(
            staff=self.staff_member, school=self.campus1, event_type='joined',
            effective_date=date(2024, 1, 15)
        )
        StudentLifecycleEvent.objects.create(
            student=self.student, school=self.campus1, academic_year=self.year,
            school_class=self.school_class, event_type='admitted',
            effective_date=date(2025, 8, 1)
        )

        res = self.client.get('/api/v1/records/export/?campus=all&page_type=comprehensive')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

        wb = openpyxl.load_workbook(io.BytesIO(res.content))
        # Verify master dossier sheets exist
        sheet_names = wb.sheetnames
        self.assertIn('Executive Summary', sheet_names)
        self.assertIn('Staff Records', sheet_names)
        self.assertIn('Student Records', sheet_names)

        # Verify summary sheet metadata mentions consolidated all campuses
        ws_summary = wb['Executive Summary']
        found_campus = False
        for row in ws_summary.iter_rows(values_only=True):
            for cell_val in row:
                if cell_val and 'All Campuses' in str(cell_val):
                    found_campus = True
                    break
        self.assertTrue(found_campus, "Master dossier summary sheet should reflect 'All Campuses (Consolidated)'.")
