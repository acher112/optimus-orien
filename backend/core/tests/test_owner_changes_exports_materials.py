"""Comprehensive tests for Owner Change Requests:
- Change 1: Student fees role scoping, ledger, defaulters, payments
- Change 2: Universal shared export service (CSV with BOM, XLSX openpyxl, PDF reportlab, formula injection neutralization, 50k row limit, audit logging)
- Change 3: Study materials (private storage, magic-bytes validation, teacher assignment scoping, versioned replacement, notifications, downloads)
"""
import io
import json
from datetime import date, timedelta
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from core.models import (
    School, SchoolClass, Subject, AcademicYear, Student, Enrollment,
    AuditEvent, Notification, StudyMaterial,
    FeeHead, FeeStructure, Concession, StudentFee, FeePayment, FinanceCategory, FinanceEntry
)
from core.tests.test_phase1 import AccessFixture
from core.services.exports import sanitize_cell_value, export_response


class OwnerChangesExportsMaterialsTests(AccessFixture):
    def setUp(self):
        super().setUp()
        self.sign(self.school_admin)
        # Create an income finance category
        self.income_cat = FinanceCategory.objects.create(
            school=self.s1, kind='income', name='Tuition fees'
        )

    def call(self, user, path, data=None, method='post'):
        self.sign(user)
        path = path.lstrip('/')
        if '?' in path:
            base, qs = path.split('?', 1)
            url = f"/api/v1/{base.rstrip('/')}/?{qs}"
        else:
            url = f"/api/v1/{path.rstrip('/')}/"
        if method == 'get':
            return self.client.get(url, data or {})
        if method == 'delete':
            return self.client.delete(url)
        payload = json.dumps(data or {})
        return getattr(self.client, method)(url, data=payload, content_type='application/json')

    # =========================================================================
    # CHANGE 1 — STUDENT FEES & ROLE GATING TESTS
    # =========================================================================
    def test_fee_role_gating_teachers_blocked(self):
        """Teachers must NOT have access to fees management endpoints (returns 403)."""
        endpoints = [
            'fees/summary',
            'fees/defaulters',
            'fees/heads',
            'fees/structures',
            'fees/concessions',
            'fees/payments',
        ]
        for ep in endpoints:
            res = self.call(self.teacher, ep, method='get')
            self.assertEqual(res.status_code, 403, f"Teacher should be forbidden from accessing {ep}")

    def test_fee_collection_creates_linked_finance_entry(self):
        """Fee payment creates a linked income FinanceEntry in Finance module."""
        # 1. Create a fee head and structure
        head_res = self.call(self.school_admin, 'fees/heads', {'name': 'Monthly Tuition', 'school': self.s1.id})
        self.assertEqual(head_res.status_code, 201)

        # 2. Collect fee for student
        pay_res = self.call(self.school_admin, 'fees/payments', {
            'student': self.a.id,
            'amount': '1500.00',
            'method': 'cash',
            'reference': 'CASH-REC-001'
        })
        self.assertEqual(pay_res.status_code, 201)
        receipt_no = pay_res.json()['receipt_number']

        # 3. Verify linked income FinanceEntry exists
        payment = FeePayment.objects.get(receipt_number=receipt_no)
        self.assertIsNotNone(payment.finance_entry)
        self.assertEqual(payment.finance_entry.amount, Decimal('1500.00'))
        self.assertEqual(payment.finance_entry.category.kind, 'income')

    def test_student_and_parent_own_ledger_access(self):
        """Students can view their own ledger, but are blocked from other students."""
        # Student views own ledger
        res = self.call(self.student_user, f'fees/ledger/{self.a.id}', method='get')
        self.assertEqual(res.status_code, 200)

        # Student views someone else's ledger -> 404
        other_st = Student.objects.create(
            first_name='Ali', last_name='Raza', admission_number='ADM-OTHER',
            school=self.s1, enrolled_on=date(2026, 1, 1)
        )
        res_other = self.call(self.student_user, f'fees/ledger/{other_st.id}', method='get')
        self.assertEqual(res_other.status_code, 404)

    # =========================================================================
    # CHANGE 2 — UNIVERSAL SHARED EXPORT SERVICE TESTS
    # =========================================================================
    def test_sanitize_cell_value_formula_injection(self):
        """Formula injection characters (=, +, -, @, \\t, \\r) must be prefixed with '."""
        self.assertEqual(sanitize_cell_value('=SUM(A1:A10)'), "'=SUM(A1:A10)")
        self.assertEqual(sanitize_cell_value('+12345'), "'+12345")
        self.assertEqual(sanitize_cell_value('-cmd|'), "'-cmd|")
        self.assertEqual(sanitize_cell_value('@calc'), "'@calc")
        self.assertEqual(sanitize_cell_value('\tTabbed'), "'\tTabbed")
        self.assertEqual(sanitize_cell_value('\rCarriage'), "'\rCarriage")
        # Normal values untouched
        self.assertEqual(sanitize_cell_value('John Doe'), 'John Doe')
        self.assertEqual(sanitize_cell_value(1234), 1234)
        self.assertEqual(sanitize_cell_value(Decimal('150.00')), Decimal('150.00'))

    def test_export_formats_csv_xlsx_pdf(self):
        """Universal export accepts ?format=csv|xlsx|pdf and returns valid file types."""
        # Test CSV export on students
        res_csv = self.call(self.school_admin, 'students/?format=csv', method='get')
        self.assertEqual(res_csv.status_code, 200)
        self.assertTrue(res_csv.has_header('Content-Disposition'))
        self.assertIn('text/csv', res_csv['Content-Type'])
        # Verify UTF-8 BOM
        self.assertTrue(res_csv.content.startswith(b'\xef\xbb\xbf'))

        # Test XLSX export on students
        res_xlsx = self.call(self.school_admin, 'students/?format=xlsx', method='get')
        self.assertEqual(res_xlsx.status_code, 200)
        self.assertIn('spreadsheetml', res_xlsx['Content-Type'])
        # Verify ZIP header for openpyxl
        self.assertTrue(res_xlsx.content.startswith(b'PK\x03\x04'))

        # Test PDF export on students
        res_pdf = self.call(self.school_admin, 'students/?format=pdf', method='get')
        self.assertEqual(res_pdf.status_code, 200)
        self.assertIn('application/pdf', res_pdf['Content-Type'])
        # Verify PDF header for reportlab
        self.assertTrue(res_pdf.content.startswith(b'%PDF-'))

    def test_universal_export_endpoint(self):
        """POST /api/v1/export/ produces valid formatted exports with client-side rows/cols."""
        payload = {
            'title': 'Test Report',
            'filename': 'test-report',
            'columns': [
                {'key': 'item', 'label': 'Item'},
                {'key': 'price', 'label': 'Price'}
            ],
            'rows': [
                {'item': 'Tuition', 'price': '1000.00'},
                {'item': '=DANGEROUS()', 'price': '500.00'}
            ],
            'format': 'csv'
        }
        res = self.call(self.school_admin, 'export', data=payload, method='post')
        self.assertEqual(res.status_code, 200)
        csv_text = res.content.decode('utf-8')
        # Check formula neutralization in CSV text
        self.assertIn("'=DANGEROUS()", csv_text)

    def test_export_row_cap_returns_413(self):
        """Exports exceeding 50,000 rows must return HTTP 413 Payload Too Large."""
        columns = [{'key': 'x', 'label': 'X'}]
        # Mock 50,001 rows
        rows = [{'x': i} for i in range(50001)]
        res = export_response(
            request=None,
            filename='massive',
            title='Massive',
            columns=columns,
            rows=rows,
            fmt='csv'
        )
        self.assertEqual(res.status_code, 413)

    # =========================================================================
    # CHANGE 3 — STUDY MATERIALS TESTS
    # =========================================================================
    def test_teacher_upload_assigned_class_vs_unassigned(self):
        """Teacher can upload for their assigned class, but blocked for an unassigned class."""
        self.sign(self.teacher)

        # 1. Assigned class upload succeeds
        pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        f1 = SimpleUploadedFile("physics_notes.pdf", pdf_content, content_type="application/pdf")

        res_ok = self.client.post('/api/v1/materials/', {
            'file': f1,
            'title': 'Mechanics Chapter 1',
            'description': 'Introductory mechanics notes',
            'school_class': self.c1.id,
            'subject': self.math.id,
            'status': 'published'
        })
        self.assertEqual(res_ok.status_code, 201)

        # 2. Unassigned class upload blocked
        c_unassigned = SchoolClass.objects.create(
            school=self.s1, academic_year=self.year1, name='Grade 10B'
        )
        f2 = SimpleUploadedFile("math_notes.pdf", pdf_content, content_type="application/pdf")
        res_blocked = self.client.post('/api/v1/materials/', {
            'file': f2,
            'title': 'Algebra Notes',
            'school_class': c_unassigned.id,
            'status': 'published'
        })
        self.assertEqual(res_blocked.status_code, 403)

    def test_student_upload_blocked(self):
        """Students cannot upload study materials (403)."""
        self.sign(self.student_user)
        pdf_content = b"%PDF-1.4\n%%EOF"
        f = SimpleUploadedFile("test.pdf", pdf_content, content_type="application/pdf")
        res = self.client.post('/api/v1/materials/', {
            'file': f,
            'title': 'Student Upload Attempt',
            'school_class': self.c1.id,
            'status': 'published'
        })
        self.assertEqual(res.status_code, 403)

    def test_file_magic_bytes_signature_validation(self):
        """Executable binaries and scripts disguised as pdf/doc must be rejected (400)."""
        self.sign(self.school_admin)

        # 1. Executable with MZ header
        fake_pdf = SimpleUploadedFile("trojan.pdf", b"MZ\x90\x00\x03\x00\x00\x00", content_type="application/pdf")
        res1 = self.client.post('/api/v1/materials/', {
            'file': fake_pdf,
            'title': 'Malicious File',
            'school_class': self.c1.id,
            'status': 'published'
        })
        self.assertEqual(res1.status_code, 400)

        # 2. HTML / Script content disguised as pdf
        fake_html = SimpleUploadedFile("hack.pdf", b"<script>alert(1)</script>", content_type="application/pdf")
        res2 = self.client.post('/api/v1/materials/', {
            'file': fake_html,
            'title': 'Script File',
            'school_class': self.c1.id,
            'status': 'published'
        })
        self.assertEqual(res2.status_code, 400)

    def test_authenticated_download_increments_counter(self):
        """Downloading material streams attachment and increments download_count."""
        self.sign(self.school_admin)
        pdf_content = b"%PDF-1.4\nTest PDF content\n%%EOF"
        f = SimpleUploadedFile("syllabus.pdf", pdf_content, content_type="application/pdf")

        res_create = self.client.post('/api/v1/materials/', {
            'file': f,
            'title': 'Course Syllabus',
            'school_class': self.c1.id,
            'status': 'published'
        })
        self.assertEqual(res_create.status_code, 201)
        mat_id = res_create.json()['id']

        # Enrolled student downloads
        self.sign(self.student_user)
        dl_res = self.client.get(f'/api/v1/materials/{mat_id}/download/')
        self.assertEqual(dl_res.status_code, 200)
        self.assertTrue(dl_res.has_header('Content-Disposition'))

        # Verify download count incremented
        m = StudyMaterial.objects.get(pk=mat_id)
        self.assertEqual(m.download_count, 1)

    def test_version_replacement_and_archive(self):
        """Replacing a file upgrades the version number, and archive marks status."""
        self.sign(self.school_admin)
        f1 = SimpleUploadedFile("v1.pdf", b"%PDF-1.4\nv1\n%%EOF", content_type="application/pdf")
        res1 = self.client.post('/api/v1/materials/', {
            'file': f1,
            'title': 'Lab Guide',
            'school_class': self.c1.id,
            'status': 'published'
        })
        mat_id = res1.json()['id']
        self.assertEqual(res1.json()['version'], 1)

        # Replace with v2
        f2 = SimpleUploadedFile("v2.pdf", b"%PDF-1.4\nv2\n%%EOF", content_type="application/pdf")
        res2 = self.client.post(f'/api/v1/materials/{mat_id}/replace/', {'file': f2})
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()['version'], 2)

        # Archive material
        res_arch = self.client.post(f'/api/v1/materials/{mat_id}/archive/')
        self.assertEqual(res_arch.status_code, 200)
        self.assertEqual(res_arch.json()['status'], 'archived')

    def test_student_notifications_on_publication(self):
        """Publishing a study material generates notification for enrolled students."""
        self.sign(self.school_admin)
        initial_notifs = Notification.objects.filter(user=self.student_user).count()

        f = SimpleUploadedFile("assignment.pdf", b"%PDF-1.4\nAssignment\n%%EOF", content_type="application/pdf")
        res = self.client.post('/api/v1/materials/', {
            'file': f,
            'title': 'Physics Problem Set 3',
            'school_class': self.c1.id,
            'status': 'published'
        })
        self.assertEqual(res.status_code, 201)

        # Verify notification created
        new_notifs = Notification.objects.filter(user=self.student_user).count()
        self.assertGreater(new_notifs, initial_notifs)
        latest_notif = Notification.objects.filter(user=self.student_user).order_by('-created_at').first()
        self.assertIn('Physics Problem Set 3', latest_notif.body)
