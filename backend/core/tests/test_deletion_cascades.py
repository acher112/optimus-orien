from datetime import date, timedelta, time
from decimal import Decimal
from core.models import (
    School, SchoolClass, Subject, AcademicYear, Student, Enrollment,
    TeachingAssignment, FeeHead, StudentFee, FeePayment, FeePaymentAllocation, FinanceCategory,
    ExamSession, ExamPaper, FeeStructure, HolidayCalendar, Section, StaffMember, Announcement,
    Organisation, User
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

    def test_delete_academic_year_succeeds_without_unbound_local_error(self):
        # Create a separate academic year with sessions, exam papers, fee structures, classes
        ay = AcademicYear.objects.create(
            school=self.s1,
            name='2027-2028',
            start_date=self.today + timedelta(days=365),
            end_date=self.today + timedelta(days=730)
        )
        cls = SchoolClass.objects.create(school=self.s1, academic_year=ay, name='Grade 10')
        sec = Section.objects.create(school_class=cls, name='A')
        session = ExamSession.objects.create(
            school=self.s1,
            academic_year=ay,
            name='Midterms',
            start_date=self.today,
            end_date=self.today + timedelta(days=10)
        )
        paper = ExamPaper.objects.create(
            session=session,
            school_class=cls,
            subject=self.math,
            date=self.today,
            start_time=time(9, 0),
            duration_min=60,
            max_marks=100
        )
        cat = FinanceCategory.objects.create(school=self.s1, kind='income', name='Year Fee')
        head = FeeHead.objects.create(school=self.s1, category=cat, name='Tuition 2027')
        fs = FeeStructure.objects.create(school=self.s1, academic_year=ay, head=head, amount=Decimal('1000'))
        hc = HolidayCalendar.objects.create(school=self.s1, academic_year=ay, name='Spring Break', start_date=self.today, end_date=self.today + timedelta(days=7))

        self.assertTrue(AcademicYear.objects.filter(id=ay.id).exists())

        # Perform DELETE via API endpoint
        res = self.client.delete(f'/api/v1/years/{ay.id}/')
        self.assertEqual(res.status_code, 200, res.data if hasattr(res, 'data') else res.content)
        self.assertFalse(AcademicYear.objects.filter(id=ay.id).exists())
        self.assertFalse(SchoolClass.objects.filter(id=cls.id).exists())
        self.assertFalse(ExamPaper.objects.filter(id=paper.id).exists())
        self.assertFalse(ExamSession.objects.filter(id=session.id).exists())
        self.assertFalse(FeeStructure.objects.filter(id=fs.id).exists())
        self.assertFalse(HolidayCalendar.objects.filter(id=hc.id).exists())

    def test_employee_count_zero_when_no_staff_members(self):
        # A newly registered school has 0 staff members
        StaffMember.objects.filter(school=self.s1).delete()
        res = self.client.get('/api/v1/dashboard/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['counts']['employees'], 0)

        # School serializer also reports total_employees as 0
        s_res = self.client.get(f'/api/v1/schools/{self.s1.id}/')
        self.assertEqual(s_res.status_code, 200)
        self.assertEqual(s_res.data['total_employees'], 0)

        # Adding an active staff member increments count to 1
        sm = StaffMember.objects.create(
            school=self.s1,
            first_name='John',
            last_name='Doe',
            role='teacher',
            status='active',
            hired_on=self.today
        )
        s_res2 = self.client.get(f'/api/v1/schools/{self.s1.id}/')
        self.assertEqual(s_res2.data['total_employees'], 1)

    def test_announcements_tenant_isolation(self):
        # Org B creates an org-wide announcement with school=None
        ann_b = Announcement.objects.create(
            school=None,
            title='Org B Only Announcement',
            content='This must not leak to Org A',
            target_role='all',
            priority='urgent',
            created_by=self.teacher3
        )

        # Org A school admin requests announcements
        self.sign(self.school_admin)
        res = self.client.get('/api/v1/announcements/')
        self.assertEqual(res.status_code, 200)
        titles = [r['title'] for r in res.data['results']]
        self.assertNotIn('Org B Only Announcement', titles)
