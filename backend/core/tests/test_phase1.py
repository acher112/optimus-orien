"""Phase 1 negative and positive API tests; all names and data are fictional."""
from datetime import timedelta
from decimal import Decimal
import json
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase
from django.utils import timezone
from core.models import (AcademicYear, Assessment, Attendance, AuditEvent, Enrollment,
    Grade, Homework, HomeworkSubmission, Notification, Organisation, ReviewCase,
    School, SchoolClass, Student, Subject, User)

class AccessFixture(TestCase):
 def setUp(self):
  self.today=timezone.localdate()
  self.org=Organisation.objects.create(name='Orion Trust',code='orion',allow_org_admin_student_access=True)
  self.other_org=Organisation.objects.create(name='Foreign Trust',code='foreign')
  self.s1=School.objects.create(organisation=self.org,code='N',name='North')
  self.s2=School.objects.create(organisation=self.org,code='S',name='South')
  self.s3=School.objects.create(organisation=self.other_org,code='F',name='Foreign')
  self.year1=AcademicYear.objects.create(school=self.s1,name='2026',start_date=self.today-timedelta(days=100),end_date=self.today+timedelta(days=100))
  self.year2=AcademicYear.objects.create(school=self.s2,name='2026',start_date=self.today-timedelta(days=100),end_date=self.today+timedelta(days=100))
  self.year3=AcademicYear.objects.create(school=self.s3,name='2026',start_date=self.today-timedelta(days=100),end_date=self.today+timedelta(days=100))
  self.org_admin=self.user('org','organisation_admin',self.org,None)
  self.principal=self.user('principal','principal',self.org,self.s1)
  self.school_admin=self.user('manager','school_admin',self.org,self.s1)
  self.teacher=self.user('teacher1','teacher',self.org,self.s1)
  self.other_teacher=self.user('teacher2','teacher',self.org,self.s1)
  self.teacher3=self.user('teacher3','teacher',self.other_org,self.s3)
  self.parent=self.user('guardian','parent',self.org,self.s1)
  self.parent_other=self.user('stranger','parent',self.org,self.s1)
  self.student_user=self.user('pupil','student',self.org,self.s1)
  self.c1=SchoolClass.objects.create(school=self.s1,academic_year=self.year1,name='8 A',teacher=self.teacher)
  self.c2=SchoolClass.objects.create(school=self.s1,academic_year=self.year1,name='8 B',teacher=self.other_teacher)
  self.c3=SchoolClass.objects.create(school=self.s3,academic_year=self.year3,name='8 C',teacher=self.teacher3)
  self.c4=SchoolClass.objects.create(school=self.s2,academic_year=self.year2,name='9 A')
  self.math=Subject.objects.create(school=self.s1,code='M',name='Math')
  self.math3=Subject.objects.create(school=self.s3,code='M',name='Math')
  self.a=Student.objects.create(school=self.s1,admission_number='N-1',first_name='A',last_name='Student',enrolled_on=self.today-timedelta(days=80),user=self.student_user)
  self.b=Student.objects.create(school=self.s1,admission_number='N-2',first_name='B',last_name='Student',enrolled_on=self.today-timedelta(days=80))
  self.foreign_student=Student.objects.create(school=self.s3,admission_number='F-1',first_name='Private',last_name='Child',enrolled_on=self.today-timedelta(days=80))
  self.a.guardians.add(self.parent)
  self.e1=Enrollment.objects.create(student=self.a,school_class=self.c1,start_date=self.today-timedelta(days=80))
  self.e2=Enrollment.objects.create(student=self.b,school_class=self.c2,start_date=self.today-timedelta(days=80))
  self.e3=Enrollment.objects.create(student=self.foreign_student,school_class=self.c3,start_date=self.today-timedelta(days=80))
  self.exam=Assessment.objects.create(school_class=self.c1,subject=self.math,title='Unit 1',date=self.today-timedelta(days=10),max_marks=Decimal('100'))
  self.exam3=Assessment.objects.create(school_class=self.c3,subject=self.math3,title='Private',date=self.today-timedelta(days=10),max_marks=Decimal('100'))
  self.grade=Grade.objects.create(assessment=self.exam,student=self.a,marks=Decimal('90'))
  self.case=ReviewCase.objects.create(student=self.a,title='Review',reason='Example',assignee=self.teacher)
 def user(self,username,role,org,school):
  return User.objects.create_user(username=username,password='A-Strong-Test-Password-1!',role=role,organisation=org,school=school)
 def sign(self,user):self.client.force_login(user)
 def post(self,path,data):return self.client.post('/api/v1/'+path+'/',data=json.dumps(data),content_type='application/json')
 def patch(self,path,data):return self.client.patch('/api/v1/'+path+'/',data=json.dumps(data),content_type='application/json')

class TenantAndRoleTests(AccessFixture):
 def test_anonymous_blocked(self):
  self.assertIn(self.client.get('/api/v1/students/').status_code,(401,403))
  self.assertIn(self.client.get('/api/v1/reports/').status_code,(401,403))
 def test_school_admin_cannot_read_other_organisation_or_same_org_school(self):
  self.sign(self.school_admin)
  self.assertEqual(self.client.get(f'/api/v1/students/{self.foreign_student.id}/').status_code,404)
  self.assertEqual(self.client.get(f'/api/v1/classes/{self.c4.id}/').status_code,404)
  self.assertEqual(self.client.get('/api/v1/students/').json()['count'],2)
 def test_teacher_cannot_read_unassigned_child(self):
  self.sign(self.teacher)
  self.assertEqual(self.client.get('/api/v1/students/').json()['count'],1)
  self.assertEqual(self.client.get(f'/api/v1/students/{self.b.id}/').status_code,404)
 def test_teacher_cannot_create_students_or_change_class_teacher(self):
  self.sign(self.teacher)
  self.assertEqual(self.post('students',dict(school=self.s1.id,first_name='X',last_name='Y',admission_number='N-9',enrolled_on=str(self.today))).status_code,403)
  self.assertEqual(self.patch(f'classes/{self.c1.id}',{'teacher':self.other_teacher.id}).status_code,403)
 def test_teacher_cannot_create_grade_against_unassigned_class(self):
  self.sign(self.teacher)
  r=self.post('grades',{'assessment':self.exam3.id,'student':self.foreign_student.id,'marks':'50.00'})
  self.assertEqual(r.status_code,403)
  self.assertFalse(Grade.objects.filter(assessment=self.exam3).exists())
 def test_teacher_cannot_relink_grade_to_foreign_assessment(self):
  self.sign(self.teacher)
  r=self.patch(f'grades/{self.grade.id}',{'assessment':self.exam3.id})
  self.assertEqual(r.status_code,403)
  self.grade.refresh_from_db();self.assertEqual(self.grade.assessment,self.exam)
 def test_teacher_cannot_relink_attendance_indirectly(self):
  record=Attendance.objects.create(student=self.a,school_class=self.c1,date=self.today,status='present')
  self.sign(self.teacher)
  self.assertEqual(self.patch(f'attendance/{record.id}',{'school_class':self.c3.id}).status_code,403)
 def test_parent_only_reads_linked_child_and_cannot_read_cases(self):
  self.sign(self.parent)
  self.assertEqual(self.client.get('/api/v1/students/').json()['count'],1)
  self.assertEqual(self.client.get(f'/api/v1/students/{self.b.id}/').status_code,404)
  self.assertEqual(self.client.get('/api/v1/cases/').status_code,403)
  self.assertEqual(self.post('grades',{'student':self.a.id,'assessment':self.exam.id,'marks':'80'}).status_code,403)
 def test_student_and_guardian_cannot_view_unpublished_marks(self):
  self.sign(self.student_user)
  self.assertEqual(self.client.get('/api/v1/grades/').json()['count'],0)
  self.assertEqual(self.client.get('/api/v1/assessments/').json()['count'],0)
  self.exam.published=True;self.exam.save()
  self.assertEqual(self.client.get('/api/v1/grades/').json()['count'],1)
  self.sign(self.parent)
  self.assertEqual(self.client.get('/api/v1/grades/').json()['count'],1)
 def test_student_only_reads_own_profile(self):
  self.sign(self.student_user)
  self.assertEqual(self.client.get('/api/v1/students/').json()['count'],1)
  self.assertEqual(self.client.get('/api/v1/cases/').status_code,403)
 def test_teacher_case_visibility_only_when_assigned(self):
  self.sign(self.other_teacher)
  self.assertEqual(self.client.get(f'/api/v1/cases/{self.case.id}/').status_code,404)
  self.sign(self.teacher)
  self.assertEqual(self.client.get(f'/api/v1/cases/{self.case.id}/').status_code,200)
 def test_published_grade_locked_for_teacher(self):
  self.exam.published=True;self.exam.save()
  other=Assessment.objects.create(school_class=self.c1,subject=self.math,title='Second',date=self.today,max_marks=Decimal('100'),published=True)
  self.sign(self.teacher)
  self.assertEqual(self.patch(f'grades/{self.grade.id}',{'marks':'70.00'}).status_code,403)
  self.assertEqual(self.post('grades',{'student':self.a.pk,'assessment':other.pk,'marks':'70.00'}).status_code,403)
 def test_organisation_admin_student_detail_requires_explicit_policy(self):
  self.org.allow_org_admin_student_access=False;self.org.save()
  self.sign(self.org_admin)
  self.assertEqual(self.client.get(f'/api/v1/students/{self.a.id}/').status_code,404)
  self.assertEqual(self.client.get('/api/v1/exports/students.csv').status_code,403)
  self.assertEqual(self.client.get('/api/v1/schools/').json()['count'],2)
 def test_teacher_cannot_delete_a_grade(self):
  self.sign(self.teacher)
  self.assertEqual(self.client.delete(f'/api/v1/grades/{self.grade.id}/').status_code,403)
 def test_even_superuser_cannot_delete_through_api(self):
  su=User.objects.create_superuser(username='root',password='A-Strong-Test-Password-1!')
  self.sign(su)
  self.assertEqual(self.client.delete(f'/api/v1/grades/{self.grade.id}/').status_code,403)
 def test_guardian_linking_to_unrelated_role_denied(self):
  self.sign(self.school_admin)
  response=self.post('students',{'school':self.s1.id,'first_name':'New','last_name':'Kid','admission_number':'N-100','enrolled_on':str(self.today),'guardians':[self.teacher.id]})
  self.assertEqual(response.status_code,403)
 def test_notification_can_only_mark_own_as_read(self):
  n=Notification.objects.create(user=self.parent,title='Private',body='Limited')
  self.sign(self.parent)
  self.assertEqual(self.patch(f'notifications/{n.pk}',{'title':'Hijacked'}).status_code,400)
  self.assertEqual(self.patch(f'notifications/{n.pk}',{'read':True}).status_code,200)
  n.refresh_from_db();self.assertTrue(n.read)
  self.sign(self.parent_other)
  self.assertEqual(self.client.get(f'/api/v1/notifications/{n.pk}/').status_code,404)

class IntegrityAuditTransferTests(AccessFixture):
 def test_cannot_change_immutable_grade_relationship(self):
  self.sign(self.school_admin)
  self.assertEqual(self.patch(f'grades/{self.grade.id}',{'student':self.b.id}).status_code,403)
 def test_cross_school_class_teacher_rejected(self):
  c=SchoolClass(school=self.s1,academic_year=self.year1,name='Wrong Teacher',teacher=self.teacher3)
  with self.assertRaises(ValidationError):c.full_clean()
 def test_grade_above_max_returns_400(self):
  self.sign(self.teacher)
  response=self.patch(f'grades/{self.grade.id}',{'marks':'110.00'})
  self.assertEqual(response.status_code,400)
  self.grade.refresh_from_db();self.assertEqual(self.grade.marks,Decimal('90'))
 def test_duplicate_active_enrolment_database_constraint(self):
  with self.assertRaises(IntegrityError):
   with transaction.atomic():Enrollment.objects.create(student=self.a,school_class=self.c2,start_date=self.today)
 def test_enrolment_overlap_validation(self):
  e=Enrollment(student=self.a,school_class=self.c2,start_date=self.today-timedelta(days=2),end_date=self.today)
  with self.assertRaises(ValidationError):e.full_clean()
 def test_create_grade_audit_no_marks_in_change_json(self):
  self.sign(self.teacher)
  # Existing grade update should be logged without raw student marks.
  r=self.patch(f'grades/{self.grade.id}',{'marks':'75.00'})
  self.assertEqual(r.status_code,200,r.content)
  event=AuditEvent.objects.get(resource='Grade',resource_id=self.grade.id,action='update')
  self.assertEqual(event.school,self.s1)
  self.assertEqual(event.actor,self.teacher)
  self.assertIn('marks',event.changes['fields_changed'])
  self.assertNotIn('75.00',json.dumps(event.changes))
 def test_audit_api_is_school_scoped_and_readonly(self):
  self.sign(self.school_admin)
  self.patch(f'grades/{self.grade.id}',{'marks':'75.00'})
  self.sign(self.principal)
  self.assertEqual(self.client.get('/api/v1/audit/').json()['count'],1)
  self.sign(self.teacher)
  self.assertEqual(self.client.get('/api/v1/audit/').status_code,403)
  self.assertEqual(self.post('audit',{'resource':'Grade'}).status_code,405)
 def test_atomic_school_transfer_keeps_grade_and_enrollment_history(self):
  self.sign(self.org_admin)
  result=self.post(f'students/{self.a.id}/transfer',{'school_class':self.c4.pk,'effective_date':self.today.isoformat()})
  self.assertEqual(result.status_code,201,result.content)
  self.a.refresh_from_db();self.e1.refresh_from_db();self.grade.refresh_from_db();self.student_user.refresh_from_db()
  self.assertEqual(self.a.school,self.s2)
  self.assertEqual(self.student_user.school,self.s2)
  self.assertEqual(self.e1.end_date,self.today-timedelta(days=1))
  self.assertEqual(self.grade.assessment.school_class,self.c1)
  self.assertEqual(Enrollment.objects.filter(student=self.a).count(),2)
  self.assertTrue(AuditEvent.objects.filter(action='transfer',resource_id=self.a.pk).exists())
 def test_failed_transfer_rolls_back_all_changes(self):
  self.sign(self.org_admin)
  result=self.post(f'students/{self.a.id}/transfer',{'school_class':self.c4.pk,'effective_date':(self.today-timedelta(days=90)).isoformat()})
  self.assertEqual(result.status_code,400)
  self.e1.refresh_from_db();self.a.refresh_from_db()
  self.assertIsNone(self.e1.end_date);self.assertEqual(self.a.school,self.s1)
 def test_case_history_stays_at_original_school_after_transfer(self):
  self.sign(self.org_admin)
  result=self.post(f'students/{self.a.pk}/transfer',{'school_class':self.c4.pk,'effective_date':str(self.today)})
  self.assertEqual(result.status_code,201)
  self.case.refresh_from_db();self.assertEqual(self.case.school,self.s1)
  self.sign(self.school_admin)
  self.assertEqual(self.client.get(f'/api/v1/cases/{self.case.pk}/').status_code,200)
  principal_south=self.user('southprincipal','principal',self.org,self.s2)
  self.sign(principal_south)
  self.assertEqual(self.client.get(f'/api/v1/cases/{self.case.pk}/').status_code,404)
 def test_transfer_cannot_invalidate_later_grade(self):
  self.sign(self.org_admin)
  before=self.today-timedelta(days=30)
  r=self.post(f'students/{self.a.pk}/transfer',{'school_class':self.c4.pk,'effective_date':str(before)})
  self.assertEqual(r.status_code,400)
  self.a.refresh_from_db();self.e1.refresh_from_db()
  self.assertEqual(self.a.school,self.s1);self.assertIsNone(self.e1.end_date)
 def test_assessment_grading_configuration_is_immutable_after_marks(self):
  self.sign(self.school_admin)
  r=self.patch(f'assessments/{self.exam.pk}',{'max_marks':'60.00'})
  self.assertEqual(r.status_code,403)
 def test_principal_may_not_transfer_student_to_another_school(self):
  self.sign(self.principal)
  r=self.post(f'students/{self.a.id}/transfer',{'school_class':self.c4.pk,'effective_date':str(self.today)})
  self.assertEqual(r.status_code,403)
 def test_school_admin_cannot_shorten_enrollment_before_marks(self):
  self.sign(self.school_admin)
  r=self.patch(f'enrollments/{self.e1.pk}',{'end_date':str(self.today-timedelta(days=20))})
  self.assertEqual(r.status_code,400)
 def test_csrf_required_for_public_login(self):
  client=Client(enforce_csrf_checks=True)
  self.assertEqual(client.post('/api/v1/auth/login/',{'username':'teacher1','password':'anything'}).status_code,403)
  token=client.get('/api/v1/auth/csrf/').json()['csrfToken']
  self.assertEqual(client.post('/api/v1/auth/login/',{'username':'teacher1','password':'A-Strong-Test-Password-1!'},HTTP_X_CSRFTOKEN=token).status_code,200)

 def test_invalid_credentials_return_400_not_html(self):
  """Invalid credentials must return JSON 400, never an HTML page or 500."""
  client=Client(enforce_csrf_checks=True)
  token=client.get('/api/v1/auth/csrf/').json()['csrfToken']
  r=client.post('/api/v1/auth/login/',data='{"username":"nobody","password":"wrong"}',content_type='application/json',HTTP_X_CSRFTOKEN=token)
  self.assertEqual(r.status_code,400)
  self.assertIn('application/json',r.headers.get('Content-Type',''))
  self.assertIn('detail',r.json())

 def test_csrf_endpoint_returns_json_token(self):
  """CSRF endpoint must return JSON with csrfToken and set the csrftoken cookie."""
  r=self.client.get('/api/v1/auth/csrf/')
  self.assertEqual(r.status_code,200)
  self.assertIn('application/json',r.headers.get('Content-Type',''))
  data=r.json()
  self.assertIn('csrfToken',data)
  self.assertGreater(len(data['csrfToken']),10)
  self.assertIn('csrftoken',r.cookies)

 def test_authenticated_me_returns_user_payload(self):
  """After login the /auth/me/ endpoint returns the authenticated user's profile."""
  client=Client(enforce_csrf_checks=True)
  token=client.get('/api/v1/auth/csrf/').json()['csrfToken']
  r=client.post('/api/v1/auth/login/',data='{"username":"teacher1","password":"A-Strong-Test-Password-1!"}',content_type='application/json',HTTP_X_CSRFTOKEN=token)
  self.assertEqual(r.status_code,200)
  payload=r.json()
  self.assertEqual(payload['username'],'teacher1')
  self.assertIn('role',payload)
  # Session cookie must be present so subsequent requests are authenticated
  self.assertIn('sessionid',client.cookies)
  # /auth/me/ must succeed in the same session
  me=client.get('/api/v1/auth/me/')
  self.assertEqual(me.status_code,200)
  self.assertEqual(me.json()['username'],'teacher1')

 def test_logout_invalidates_session(self):
  """Logout must clear the session; a subsequent me/ call must fail."""
  client=Client(enforce_csrf_checks=True)
  token=client.get('/api/v1/auth/csrf/').json()['csrfToken']
  client.post('/api/v1/auth/login/',data='{"username":"teacher1","password":"A-Strong-Test-Password-1!"}',content_type='application/json',HTTP_X_CSRFTOKEN=token)
  token2=client.get('/api/v1/auth/csrf/').json()['csrfToken']
  logout_r=client.post('/api/v1/auth/logout/',data='{}',content_type='application/json',HTTP_X_CSRFTOKEN=token2)
  self.assertEqual(logout_r.status_code,200)
  me=client.get('/api/v1/auth/me/')
  self.assertIn(me.status_code,(401,403))

 def test_unauthenticated_dashboard_is_protected(self):
  """Dashboard must reject unauthenticated requests."""
  r=self.client.get('/api/v1/dashboard/')
  self.assertIn(r.status_code,(401,403))

 def test_trusted_origin_enforcement(self):
  """CSRF verification must reject requests from untrusted origins even with a valid token."""
  client=Client(enforce_csrf_checks=True)
  token=client.get('/api/v1/auth/csrf/').json()['csrfToken']
  r=client.post(
   '/api/v1/auth/login/',
   data='{"username":"teacher1","password":"A-Strong-Test-Password-1!"}',
   content_type='application/json',
   HTTP_X_CSRFTOKEN=token,
   HTTP_ORIGIN='https://evil-site.example.com',
   SERVER_NAME='testserver',
  )
  # Django's CSRF middleware rejects requests whose Origin is not in CSRF_TRUSTED_ORIGINS
  # when the origin differs from the server's own host.
  self.assertEqual(r.status_code,403)

 def test_ensure_admin_bootstrap_creates_valid_admin(self):
  """ensure_admin must create an organisation_admin superuser with valid tenant scoping."""
  from core.services.bootstrap import ensure_admin
  admin=ensure_admin('auto_admin','SuperPass123!','admin@example.com')
  self.assertIsNotNone(admin)
  self.assertEqual(admin.username,'auto_admin')
  self.assertTrue(admin.is_superuser)
  self.assertEqual(admin.role,'organisation_admin')
  self.assertIsNotNone(admin.organisation)
  self.assertIsNotNone(admin.school)
  # Subsequent call is idempotent
  again=ensure_admin('auto_admin','DifferentPass!')
  self.assertEqual(again.pk,admin.pk)
