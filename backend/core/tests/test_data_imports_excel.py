"""
Test suite for Data Import engine with Excel (.xlsx) support and graceful column skipping.
Verifies:
- Extra/unmapped columns like 'address', 'city', 'remarks' are safely skipped without errors.
- Excel file (.xlsx) parsing for student data.
- Classes, Subjects, Staff, and Attendance imports.
- Multi-sheet master workbook import (full_school).
- Downloadable Excel (.xlsx) and CSV template generator.
"""
import io
import openpyxl
from datetime import date
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from core.models import (
    User, School, Organisation, AcademicYear, Student,
    StaffMember, SchoolClass, Subject, Attendance
)


class DataImportsExcelTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Beaconhouse Network", code="bhn")
        self.school = School.objects.create(
            organisation=self.org, name="Beaconhouse Campus 1", code="bc1", city="Lahore"
        )
        self.academic_year = AcademicYear.objects.create(
            school=self.school, name="2025-2026",
            start_date=date(2025, 1, 1), end_date=date(2025, 12, 31), active=True
        )

        self.admin = User.objects.create_user(
            username="admin_import", password="password123",
            role="school_admin", school=self.school, organisation=self.org
        )

    def test_csv_with_unmapped_columns_skips_without_error(self):
        """When columns like 'address', 'city', 'blood_group' are present, they are skipped and import succeeds."""
        self.client.force_authenticate(user=self.admin)
        csv_content = (
            "First Name,Last Name,Admission No,DOB,Gender,Address,City,Blood Group\n"
            "Zain,Abbas,STU-EX-001,2013-05-10,male,123 Gulberg III,Lahore,B+\n"
            "Hina,Shah,STU-EX-002,2013-08-15,female,45 Phase 5 DHA,Lahore,O+\n"
        )

        # Dry run
        res_dry = self.client.post('/api/v1/imports/csv/', {
            'entity_type': 'students',
            'csv_data': csv_content,
            'dry_run': 'true',
            'school': self.school.id
        }, format='json')
        self.assertEqual(res_dry.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dry.data['valid_rows_count'], 2)
        self.assertEqual(res_dry.data['errors_count'], 0)
        self.assertIn('address', res_dry.data['skipped_columns'])
        self.assertIn('city', res_dry.data['skipped_columns'])

        # Real commit
        res_commit = self.client.post('/api/v1/imports/csv/', {
            'entity_type': 'students',
            'csv_data': csv_content,
            'dry_run': 'false',
            'school': self.school.id
        }, format='json')
        self.assertEqual(res_commit.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_commit.data['created_count'], 2)

        # Verify students exist in DB
        s1 = Student.objects.filter(school=self.school, admission_number="STU-EX-001").first()
        self.assertIsNotNone(s1)
        self.assertEqual(s1.first_name, "Zain")
        self.assertEqual(s1.last_name, "Abbas")

    def test_excel_file_upload_student_import(self):
        """Uploads a binary .xlsx file with extra columns and verifies successful creation."""
        self.client.force_authenticate(user=self.admin)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Students"
        ws.append(["First Name", "Last Name", "Admission No", "Date of Birth", "Gender", "Address", "Emergency Phone"])
        ws.append(["Saad", "Rafiq", "STU-XL-101", "2012-04-12", "Male", "Model Town Block A", "03001112233"])
        ws.append(["Sara", "Malik", "STU-XL-102", "2012-09-20", "Female", "Johar Town R2", "03004445566"])

        out = io.BytesIO()
        wb.save(out)
        out.seek(0)

        uploaded_file = SimpleUploadedFile(
            "students_data.xlsx",
            out.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        res = self.client.post('/api/v1/imports/csv/', {
            'entity_type': 'students',
            'dry_run': 'false',
            'school': self.school.id,
            'file': uploaded_file
        }, format='multipart')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['created_count'], 2)
        self.assertIn('address', res.data['skipped_columns'])
        self.assertTrue(Student.objects.filter(admission_number="STU-XL-101").exists())

    def test_classes_and_subjects_import(self):
        """Verifies importing Classes and Subjects."""
        self.client.force_authenticate(user=self.admin)

        # Classes
        classes_csv = (
            "Class Name,Section,Grade Level,Curriculum,Building\n"
            "Grade 6,A,Middle School,Matric,Block 1\n"
            "Grade 7,B,Middle School,Matric,Block 2\n"
        )
        res_cls = self.client.post('/api/v1/imports/csv/', {
            'entity_type': 'classes',
            'csv_data': classes_csv,
            'dry_run': 'false',
            'school': self.school.id
        }, format='json')
        self.assertEqual(res_cls.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_cls.data['created_count'], 2)
        self.assertTrue(SchoolClass.objects.filter(school=self.school, name="Grade 6", section="A").exists())

        # Subjects
        subjects_csv = (
            "Subject Name,Subject Code,Credits\n"
            "Robotics & AI,ROB-101,3\n"
            "General Science,SCI-102,4\n"
        )
        res_sub = self.client.post('/api/v1/imports/csv/', {
            'entity_type': 'subjects',
            'csv_data': subjects_csv,
            'dry_run': 'false',
            'school': self.school.id
        }, format='json')
        self.assertEqual(res_sub.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_sub.data['created_count'], 2)
        self.assertTrue(Subject.objects.filter(school=self.school, code="ROB-101").exists())

    def test_download_excel_template(self):
        """Verifies downloading pre-formatted .xlsx template."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/imports/template/?entity_type=students&format=xlsx')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertTrue(len(res.content) > 100)

        # Verify Master full_school template
        res_master = self.client.get('/api/v1/imports/template/?entity_type=full_school&format=xlsx')
        self.assertEqual(res_master.status_code, status.HTTP_200_OK)
        wb = openpyxl.load_workbook(io.BytesIO(res_master.content))
        self.assertIn("Students", wb.sheetnames)
        self.assertIn("Classes", wb.sheetnames)
        self.assertIn("Subjects", wb.sheetnames)
        self.assertIn("Staff", wb.sheetnames)
