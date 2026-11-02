from datetime import date
from decimal import Decimal
from core.models import (
    School, SchoolClass, Subject, AcademicYear, Student, Enrollment,
    TeachingAssignment, FeeHead, StudentFee, FeePayment, FeePaymentAllocation, FinanceCategory
)
from core.tests.test_phase1 import AccessFixture


class DeletionCascadesTests(AccessFixture):
    def setUp(self):
        super().setUp()
        self.sign(self.school_admin)

    def test_delete_subject_with_teaching_assignment_succeeds(self):
        # Create a TeachingAssignment for self.math
        ta = TeachingAssignment.objects.create(
            school=self.s1,
            teacher=self.teacher,
            school_class=self.c1,
            subject=self.math,
            start_date=date.today()
        )
        self.assertTrue(TeachingAssignment.objects.filter(id=ta.id).exists())

        # Attempt to delete subject
        res = self.client.delete(f'/api/v1/subjects/{self.math.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Subject.objects.filter(id=self.math.id).exists())
        self.assertFalse(TeachingAssignment.objects.filter(id=ta.id).exists())

    def test_delete_student_with_student_fee_succeeds(self):
        # Create finance category, fee head, student fee
        cat = FinanceCategory.objects.create(school=self.s1, kind='income', name='Tuition')
        head = FeeHead.objects.create(school=self.s1, category=cat, name='Monthly Fee')
        sf = StudentFee.objects.create(
            student=self.a,
            head=head,
            period='2026-11',
            amount_due=Decimal('5000.00'),
            due_date=date.today()
        )
        self.assertTrue(StudentFee.objects.filter(id=sf.id).exists())

        # Attempt to delete student
        res = self.client.delete(f'/api/v1/students/{self.a.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Student.objects.filter(id=self.a.id).exists())
        self.assertFalse(StudentFee.objects.filter(id=sf.id).exists())
