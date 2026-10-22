"""Landing privacy and SCH-004/SCH-005 tenant, validation and audit regressions."""
from datetime import date
import json
from django.test import TestCase
from django.utils import timezone
from core.models import (School,Organisation,User,SchoolConfiguration,SchoolConfigurationVersion,
                         PublishedSchoolIndicator,AuditEvent,Student,AcademicYear)

class SetupTests(TestCase):
 def setUp(self):
  self.org=Organisation.objects.create(name='Alpha Education',code='alpha')
  self.other_org=Organisation.objects.create(name='Beta Education',code='beta')
  self.school=School.objects.create(organisation=self.org,name='North School',code='N1')
  self.other=School.objects.create(organisation=self.other_org,name='Private School',code='P1')
  self.admin=User.objects.create_user(username='alphaadmin',password='secret-alpha',organisation=self.org,role='organisation_admin')
  self.school_admin=User.objects.create_user(username='schooladmin',password='secret-beta',organisation=self.org,school=self.school,role='school_admin')
  self.teacher=User.objects.create_user(username='teacher_on',password='secret-gamma',organisation=self.org,school=self.school,role='teacher')
  self.foreign_admin=User.objects.create_user(username='foreignadmin',password='secret-delta',organisation=self.other_org,role='organisation_admin')
  self.su=User.objects.create_superuser(username='su_admin',password='anothersecret')
  self.endpoint=f'/api/v1/schools/{self.school.pk}/setup/'
  self.valid={'country':'PK','jurisdiction':'Sindh','timezone':'Asia/Karachi','language':'en','locale':'en-PK',
   'programmes':['National curriculum','Cambridge IGCSE'],'academic_year_name':'2026-2027',
   'academic_start':'2026-08-01','academic_end':'2027-06-30',
   'reporting_periods':[{'name':'Term 1','start':'2026-08-01','end':'2026-12-20'},
    {'name':'Term 2','start':'2027-01-05','end':'2027-06-30'}],
   'grading_policy':{'approach':'custom','description':'Use the board-approved calculation method for each subject.'},
   'attendance_policy':{'recording_basis':'daily','description':'School days only; late is present; closed days excluded.'},
   'school_settings':{'campus_term':'Campus'}}
 def patch(self, data):return self.client.patch(self.endpoint,content_type='application/json',data=json.dumps(data))
 def activate(self):return self.client.post(self.endpoint+'activate/',data='{}',content_type='application/json')
 def test_public_home_api_is_anonymous_and_empty_by_default(self):
  r=self.client.get('/api/v1/public/indicators/')
  self.assertEqual(r.status_code,200)
  self.assertEqual(r.json()['results'],[])
 def test_anonymous_may_not_read_or_modify_school_config(self):
  self.assertIn(self.client.get(self.endpoint).status_code,(401,403))
  self.assertIn(self.patch(self.valid).status_code,(401,403))
 def test_teacher_and_out_of_scope_admin_denied(self):
  self.client.force_login(self.teacher)
  self.assertEqual(self.patch(self.valid).status_code,403)
  self.assertEqual(self.activate().status_code,403)
  self.client.force_login(self.foreign_admin)
  self.assertEqual(self.patch(self.valid).status_code,404)
 def test_school_admin_own_scope_only(self):
  self.client.force_login(self.school_admin)
  self.assertEqual(self.patch(self.valid).status_code,200)
  forbidden=f'/api/v1/schools/{self.other.pk}/setup/'
  self.assertEqual(self.client.patch(forbidden,content_type='application/json',data=json.dumps(self.valid)).status_code,404)
 def test_incomplete_draft_not_activated(self):
  self.client.force_login(self.admin)
  self.assertEqual(self.patch({'country':'PK'}).status_code,200)
  response=self.activate()
  self.assertEqual(response.status_code,400)
  self.assertIn('time',','.join(response.json()['readiness']['issues']).lower())
  self.assertEqual(SchoolConfigurationVersion.objects.count(),0)
 def test_complete_setup_creates_immutable_version_and_audit(self):
  self.client.force_login(self.admin)
  patched=self.patch(self.valid)
  self.assertEqual(patched.status_code,200,patched.content)
  self.assertTrue(patched.json()['readiness']['complete'])
  resp=self.activate()
  self.assertEqual(resp.status_code,200,resp.content)
  self.assertEqual(resp.json()['configuration']['status'],'active')
  first=SchoolConfigurationVersion.objects.get()
  self.assertEqual(first.version,1)
  self.assertEqual(first.snapshot['programmes'],self.valid['programmes'])
  self.assertTrue(AuditEvent.objects.filter(action='school_setup_activated',school=self.school).exists())
  self.assertTrue(AcademicYear.objects.filter(school=self.school,name='2026-2027',active=True).exists())
  self.assertEqual(self.activate().status_code,409)
  draft=self.patch({'language':'ur'})
  self.assertEqual(draft.status_code,200)
  self.assertEqual(draft.json()['configuration']['status'],'draft')
  self.assertEqual(first.snapshot['language'],'en')
  self.assertEqual(self.activate().status_code,200)
  self.assertEqual(SchoolConfigurationVersion.objects.count(),2)
  self.assertEqual(SchoolConfigurationVersion.objects.get(version=2).snapshot['language'],'ur')
 def test_period_overlap_blocks_activation(self):
  self.client.force_login(self.admin)
  invalid=dict(self.valid)
  invalid['reporting_periods']=[{'name':'First','start':'2026-08-01','end':'2027-02-01'},
                                {'name':'Second','start':'2027-01-01','end':'2027-06-30'}]
  self.assertEqual(self.patch(invalid).status_code,200)
  resp=self.activate()
  self.assertEqual(resp.status_code,400)
  self.assertIn('reporting_periods',resp.json()['readiness']['issues'])
 def test_no_magic_default_school_policy(self):
  self.client.force_login(self.admin)
  self.patch({'country':'PK','timezone':'Asia/Karachi'})
  config=SchoolConfiguration.objects.get(school=self.school)
  self.assertEqual(config.grading_policy,{})
  self.assertEqual(config.attendance_policy,{})
 def test_extra_mass_assignment_fields_rejected(self):
  self.client.force_login(self.admin)
  self.assertEqual(self.patch({'status':'active','active_version':998}).status_code,400)
  self.assertFalse(SchoolConfiguration.objects.filter(school=self.school).exists())
 def test_single_school_config_and_private_draft(self):
  self.client.force_login(self.admin)
  self.patch(self.valid)
  self.patch({'language':'ur'})
  self.assertEqual(SchoolConfiguration.objects.filter(school=self.school).count(),1)
  self.client.logout()
  self.assertEqual(self.client.get('/api/v1/public/indicators/').json()['results'],[])
 def test_public_only_explicit_aggregate_publications(self):
  private_student=Student.objects.create(school=self.school,admission_number='ST100',first_name='Private',last_name='Student',enrolled_on=date(2026,8,1))
  indicator=PublishedSchoolIndicator.objects.create(school=self.school,title='Attendance rate',period_label='Term 1',value='91.25',
    methodology='Recorded present days divided by eligible recorded days.',eligible_population=120,
    completeness_note='Sufficient data for approved publication')
  self.assertEqual(self.client.get('/api/v1/public/indicators/').json()['results'],[])
  indicator.approved_for_publication=True
  indicator.approved_by=self.su
  indicator.published_at=timezone.now()
  indicator.full_clean();indicator.save()
  result=self.client.get('/api/v1/public/indicators/').json()['results'][0]
  self.assertEqual(result['school_name'],self.school.name)
  self.assertEqual(result['value'],'91.25')
  self.assertNotIn(private_student.first_name,str(result))
  self.assertNotIn('student_id',str(result))
 def test_cannot_approve_small_groups(self):
  item=PublishedSchoolIndicator(school=self.school,title='Attendance',period_label='Term',value=87,
   methodology='Attendance calculation',eligible_population=3,completeness_note='Complete',
   approved_for_publication=True,approved_by=self.su,published_at=timezone.now())
  from django.core.exceptions import ValidationError
  with self.assertRaises(ValidationError):item.full_clean()
 def test_invalid_timezone_and_outside_period_are_rejected(self):
  self.client.force_login(self.admin)
  bad=dict(self.valid)
  bad['timezone']='Mars/Olympus_Mons'
  self.assertEqual(self.patch(bad).status_code,200)
  result=self.activate()
  self.assertEqual(result.status_code,400)
  self.assertIn('timezone',result.json()['readiness']['issues'])
  bad['timezone']='Asia/Karachi'
  bad['reporting_periods']=[{'name':'Invalid','start':'2020-01-01','end':'2020-02-01'}]
  self.assertEqual(self.patch(bad).status_code,200)
  self.assertIn('reporting_periods',self.activate().json()['readiness']['issues'])
 def test_not_approved_by_superuser_does_not_publish_even_if_row_exists(self):
  PublishedSchoolIndicator.objects.create(school=self.school,title='Attendance',period_label='Term 1',value='89.1',
   methodology='Sample method',eligible_population=100,completeness_note='Data complete',
   approved_for_publication=True,approved_by=self.admin,published_at=timezone.now())
  self.assertEqual(self.client.get('/api/v1/public/indicators/').json()['results'],[])
