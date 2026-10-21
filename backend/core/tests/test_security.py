from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from core.models import *
class IsolationTests(TestCase):
 def setUp(self):
  self.o1=Organisation.objects.create(name='A',code='a');self.o2=Organisation.objects.create(name='B',code='b')
  self.s1=School.objects.create(name='A school',code='a',organisation=self.o1);self.s2=School.objects.create(name='B school',code='b',organisation=self.o2)
  self.u=User.objects.create_user(username='teacherA',password='StrongTest123!',role='teacher',organisation=self.o1,school=self.s1)
  self.manager=User.objects.create_user(username='managerA',password='StrongTest123!',role='school_admin',organisation=self.o1,school=self.s1)
  self.student=Student.objects.create(school=self.s2,admission_number='B-1',first_name='Private',last_name='Student',enrolled_on=timezone.localdate())
 def test_other_tenant_student_is_invisible(self):
  self.client.force_login(self.manager)
  self.assertEqual(self.client.get('/api/v1/students/').json()['count'],0)
  self.assertEqual(self.client.get(f'/api/v1/students/{self.student.pk}/').status_code,404)
 def test_teacher_cannot_delete_records(self):
  self.client.force_login(self.u)
  self.assertEqual(self.client.delete(f'/api/v1/students/{self.student.pk}/').status_code,403)  # no delete permission, before lookup
 def test_anonymous_dashboard_blocked(self):self.assertIn(self.client.get('/api/v1/dashboard/').status_code,[401,403])
 def test_homework_requires_confirmation(self):
  obj=HomeworkSubmission(status='completed');self.assertRaises(Exception,obj.full_clean)
 def test_marks_above_maximum_rejected(self):
  today=timezone.localdate()
  y=AcademicYear.objects.create(school=self.s1,name='Test',start_date=today-timedelta(days=5),end_date=today+timedelta(days=5))
  c=SchoolClass.objects.create(school=self.s1,academic_year=y,name='A')
  sub=Subject.objects.create(school=self.s1,name='Math',code='M')
  a=Assessment.objects.create(school_class=c,subject=sub,title='Test',date=today,max_marks=100)
  student=Student.objects.create(school=self.s1,admission_number='A1',first_name='Test',last_name='Kid',enrolled_on=today-timedelta(days=4))
  Enrollment.objects.create(student=student,school_class=c,start_date=today-timedelta(days=4))
  g=Grade(assessment=a,student=student,marks=110)
  self.assertRaises(Exception,g.full_clean)
