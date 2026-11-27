from django.test import TestCase
from django.contrib.auth import authenticate
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Organisation, School, User, Student, SchoolClass, Enrollment, AcademicYear
from datetime import date


class StudentAndUserCredentialsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Test Org")
        self.school = School.objects.create(name="Campus A", code="CMPA", organisation=self.org)
        self.year = AcademicYear.objects.create(school=self.school, name="2026-2027", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        self.school_class = SchoolClass.objects.create(school=self.school, academic_year=self.year, name="Grade 10", section="A")

        # Admin user
        self.admin_user = User.objects.create(
            username="admin_user",
            email="admin@school.com",
            role="school_admin",
            school=self.school,
            organisation=self.org
        )
        self.admin_user.set_password("AdminPass123!")
        self.admin_user.save()

        # Student without linked user initially
        self.student = Student.objects.create(
            school=self.school,
            admission_number="2026-001",
            first_name="Alice",
            last_name="Johnson",
            father_name="Bob Johnson",
            gender="female",
            enrolled_on=date(2026, 1, 1)
        )
        Enrollment.objects.create(
            student=self.student,
            school_class=self.school_class,
            start_date=date(2026, 1, 1)
        )

    def test_student_credentials_view_creates_and_returns_credentials(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f"/api/v1/students/{self.student.id}/credentials/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("full_name"), "Alice Johnson")
        self.assertTrue(bool(data.get("username")))
        self.assertTrue(bool(data.get("password")))
        self.assertTrue(bool(data.get("email")))
        self.assertEqual(data.get("role"), "student")

        # Refresh student and verify user was linked and raw_password matches
        self.student.refresh_from_db()
        self.assertIsNotNone(self.student.user)
        self.assertEqual(self.student.user.raw_password, data["password"])

        # Verify authentication works with the returned password
        auth_user = authenticate(username=data["username"], password=data["password"])
        self.assertIsNotNone(auth_user)

    def test_student_credentials_regenerate_password(self):
        self.client.force_authenticate(user=self.admin_user)
        # First GET creates credentials
        get_res = self.client.get(f"/api/v1/students/{self.student.id}/credentials/")
        first_pwd = get_res.json()["password"]

        # POST to regenerate
        post_res = self.client.post(
            f"/api/v1/students/{self.student.id}/credentials/",
            {"action": "regenerate"},
            format="json"
        )
        self.assertEqual(post_res.status_code, status.HTTP_200_OK)
        second_pwd = post_res.json()["password"]
        self.assertNotEqual(first_pwd, second_pwd)

        # Authenticate with new password
        self.student.refresh_from_db()
        auth_user = authenticate(username=self.student.user.username, password=second_pwd)
        self.assertIsNotNone(auth_user)

    def test_user_credentials_view_for_staff(self):
        teacher = User.objects.create(
            username="teacher_smith",
            email="smith@school.com",
            first_name="John",
            last_name="Smith",
            role="teacher",
            school=self.school,
            organisation=self.org
        )
        teacher.set_password("InitialTeacherPass123")
        teacher.save()

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(f"/api/v1/users/{teacher.id}/credentials/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["username"], "teacher_smith")
        self.assertEqual(data["email"], "smith@school.com")
        self.assertEqual(data["password"], "InitialTeacherPass123")
        self.assertEqual(data["role"], "teacher")

    def test_lookup_user_credentials(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get("/api/v1/users/lookup-credentials/?q=admin")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.json().get("results", [])
        self.assertTrue(any(r["username"] == "admin_user" for r in results))

    def test_student_cannot_view_credentials(self):
        # Student user trying to access credentials
        student_user = User.objects.create(
            username="student_user",
            email="student@school.com",
            role="student",
            school=self.school,
            organisation=self.org
        )
        student_user.set_password("StudentPwd123")
        student_user.save()

        self.client.force_authenticate(user=student_user)
        res = self.client.get(f"/api/v1/students/{self.student.id}/credentials/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
