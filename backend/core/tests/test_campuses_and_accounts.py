from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from core.models import Organisation, School, User, Student, SchoolClass, AcademicYear, AuditEvent, SchoolConfiguration

class CampusesAndAccountsTests(TestCase):
 def setUp(self):
  self.client = APIClient()
  self.org = Organisation.objects.create(name='Global Education Trust', code='get-trust')
  self.other_org = Organisation.objects.create(name='Other Org', code='other-org')
  
  self.school = School.objects.create(
   organisation=self.org,
   name='Trust Main Campus',
   code='GET-MAIN',
   city='Karachi',
   attendance_alert_threshold=82.0,
   grade_alert_threshold=65.0
  )
  
  self.org_admin = User.objects.create_user(
   username='trust_org_admin',
   password='ValidPassword123!',
   email='orgadmin@trust.edu',
   role='organisation_admin',
   organisation=self.org
  )
  
  self.school_admin = User.objects.create_user(
   username='trust_school_admin',
   password='ValidPassword123!',
   email='schooladmin@trust.edu',
   role='school_admin',
   organisation=self.org,
   school=self.school
  )

  self.principal = User.objects.create_user(
   username='trust_principal',
   password='ValidPassword123!',
   email='principal@trust.edu',
   role='principal',
   organisation=self.org,
   school=self.school
  )
  
  self.teacher = User.objects.create_user(
   username='trust_teacher',
   password='ValidPassword123!',
   email='teacher@trust.edu',
   role='teacher',
   organisation=self.org,
   school=self.school
  )
  
  self.acad_year = AcademicYear.objects.create(
   school=self.school,
   name='2026-2027',
   start_date=timezone.now().date(),
   end_date=timezone.now().date() + timezone.timedelta(days=300),
   active=True
  )
  self.school_class = SchoolClass.objects.create(
   school=self.school,
   academic_year=self.acad_year,
   name='Grade 8 Alpha'
  )

 def test_register_campus_by_org_admin(self):
  self.client.force_authenticate(user=self.org_admin)
  payload = {
   'name': 'North Campus',
   'code': 'GET-NORTH',
   'city': 'Lahore',
   'jurisdiction': 'Punjab',
   'country': 'PK',
   'address': 'Plot 10, Gulberg III',
   'timezone': 'Asia/Karachi',
   'campus_type': 'Branch Campus',
   'contact_email': 'north@trust.edu',
   'contact_phone': '+92 42 35789000',
   'programmes': ['Cambridge O Level', 'Matriculation'],
   'attendance_alert_threshold': 85.0,
   'grade_alert_threshold': 62.0
  }
  res = self.client.post('/api/v1/campuses/register/', payload, format='json')
  self.assertEqual(res.status_code, 201)
  self.assertEqual(res.data['name'], 'North Campus')
  self.assertEqual(res.data['code'], 'GET-NORTH')
  self.assertEqual(res.data['country'], 'PK')
  self.assertEqual(res.data['timezone'], 'Asia/Karachi')
  
  # Verify database state and initialized SchoolConfiguration
  school = School.objects.get(code='GET-NORTH', organisation=self.org)
  self.assertEqual(school.city, 'Lahore')
  config = SchoolConfiguration.objects.get(school=school)
  self.assertEqual(config.country, 'PK')
  self.assertEqual(config.timezone, 'Asia/Karachi')
  self.assertIn('Cambridge O Level', config.programmes)
  self.assertEqual(config.school_settings.get('campus_type'), 'Branch Campus')
  self.assertEqual(config.school_settings.get('contact_email'), 'north@trust.edu')

  # Verify AuditEvent
  self.assertTrue(AuditEvent.objects.filter(resource='School', resource_id=school.id).exists())

 def test_register_campus_permission_denied_for_school_admin_and_teacher(self):
  self.client.force_authenticate(user=self.school_admin)
  res = self.client.post('/api/v1/campuses/register/', {'name': 'Unauthorized', 'code': 'UNAUTH'}, format='json')
  self.assertEqual(res.status_code, 403)

  self.client.force_authenticate(user=self.teacher)
  res = self.client.post('/api/v1/campuses/register/', {'name': 'Unauthorized', 'code': 'UNAUTH2'}, format='json')
  self.assertEqual(res.status_code, 403)

 def test_register_campus_duplicate_code_rejected(self):
  self.client.force_authenticate(user=self.org_admin)
  res = self.client.post('/api/v1/campuses/register/', {'name': 'Duplicate Code', 'code': 'GET-MAIN'}, format='json')
  self.assertEqual(res.status_code, 400)
  self.assertIn('already exists', res.data['detail'])

 def test_create_account_by_org_admin(self):
  self.client.force_authenticate(user=self.org_admin)
  payload = {
   'first_name': 'Zainab',
   'last_name': 'Khan',
   'username': 'zkhan',
   'email': 'zkhan@trust.edu',
   'password': 'StrongPassword2026!',
   'role': 'teacher',
   'school': self.school.id,
   'class_id': self.school_class.id
  }
  res = self.client.post('/api/v1/accounts/', payload, format='json')
  self.assertEqual(res.status_code, 201)
  self.assertEqual(res.data['username'], 'zkhan')
  self.assertEqual(res.data['email'], 'zkhan@trust.edu')
  self.assertEqual(res.data['assigned_class'], 'Grade 8 Alpha')

  u = User.objects.get(username='zkhan')
  self.assertEqual(u.role, 'teacher')
  self.assertEqual(u.school, self.school)
  self.school_class.refresh_from_db()
  self.assertEqual(self.school_class.teacher, u)

 def test_create_student_account_creates_linked_student_record(self):
  self.client.force_authenticate(user=self.school_admin)
  payload = {
   'first_name': 'Bilal',
   'last_name': 'Ahmed',
   'username': 'bahmed',
   'email': 'bahmed@trust.edu',
   'password': 'StrongPassword2026!',
   'role': 'student',
   'school': self.school.id,
   'admission_number': 'ADM-2026-0099',
   'class_id': self.school_class.id
  }
  res = self.client.post('/api/v1/accounts/', payload, format='json')
  self.assertEqual(res.status_code, 201)
  self.assertEqual(res.data['admission_number'], 'ADM-2026-0099')
  self.assertEqual(res.data['class_name'], 'Grade 8 Alpha')

  # Verify student record created in Student table
  st = Student.objects.get(admission_number='ADM-2026-0099', school=self.school)
  self.assertEqual(st.first_name, 'Bilal')
  self.assertEqual(st.last_name, 'Ahmed')
  self.assertEqual(st.user.username, 'bahmed')
  self.assertTrue(st.enrollments.filter(school_class=self.school_class).exists())

 def test_create_parent_account_links_to_student_ward(self):
  st = Student.objects.create(
   school=self.school,
   admission_number='ADM-ST-01',
   first_name='Amina',
   last_name='Tariq',
   enrolled_on=timezone.now().date()
  )
  self.client.force_authenticate(user=self.principal)
  payload = {
   'first_name': 'Tariq',
   'last_name': 'Mahmood',
   'username': 'tmahmood',
   'email': 'tariq@parent.edu',
   'password': 'StrongPassword2026!',
   'role': 'parent',
   'school': self.school.id,
   'student_id': st.id
  }
  res = self.client.post('/api/v1/accounts/', payload, format='json')
  self.assertEqual(res.status_code, 201)
  self.assertEqual(res.data['ward_name'], 'Amina Tariq')

  parent_user = User.objects.get(username='tmahmood')
  self.assertTrue(st.guardians.filter(id=parent_user.id).exists())

 def test_school_users_list_endpoint(self):
  self.client.force_authenticate(user=self.school_admin)
  res = self.client.get(f'/api/v1/schools/{self.school.id}/users/')
  self.assertEqual(res.status_code, 200)
  self.assertIn('results', res.data)
  usernames = [u['username'] for u in res.data['results']]
  self.assertIn('trust_school_admin', usernames)
  self.assertIn('trust_teacher', usernames)
