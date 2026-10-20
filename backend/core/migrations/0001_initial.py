"""Initial controlled schema for Phase 1, including historical constraints."""
import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models
from django.contrib.auth.validators import UnicodeUsernameValidator


def F(name, field):return (name,field)
def pk():return F('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID'))
def foreign(name,to,related=None,null=False,blank=False,delete=models.PROTECT):
 return F(name,models.ForeignKey(to,on_delete=delete,related_name=related,null=null,blank=blank))
def val(low):return django.core.validators.MinValueValidator(low)
def maxi(high):return django.core.validators.MaxValueValidator(high)

class Migration(migrations.Migration):
 initial=True
 dependencies=[('auth','0012_alter_user_first_name_max_length')]
 operations=[
  migrations.CreateModel(name='Organisation',fields=[pk(),F('name',models.CharField(max_length=160)),F('code',models.SlugField(unique=True)),F('allow_org_admin_student_access',models.BooleanField(default=False,help_text='Explicit policy to allow organisation-level administrators access to identifiable student records'))]),
  migrations.CreateModel(name='School',fields=[pk(),F('name',models.CharField(max_length=160)),F('code',models.CharField(max_length=32)),F('city',models.CharField(max_length=120,blank=True)),F('attendance_alert_threshold',models.DecimalField(max_digits=5,decimal_places=2,default=80,validators=[val(0),maxi(100)])),F('grade_alert_threshold',models.DecimalField(max_digits=5,decimal_places=2,default=60,validators=[val(0),maxi(100)])),foreign('organisation','core.organisation',related='schools')]),
  migrations.CreateModel(name='User',fields=[
   pk(),F('password',models.CharField(max_length=128,verbose_name='password')),
   F('last_login',models.DateTimeField(null=True,blank=True,verbose_name='last login')),
   F('is_superuser',models.BooleanField(default=False,help_text='Designates that this user has all permissions without explicitly assigning them.',verbose_name='superuser status')),
   F('username',models.CharField(max_length=150,unique=True,validators=[UnicodeUsernameValidator()],error_messages={'unique':'A user with that username already exists.'},help_text='Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.',verbose_name='username')),
   F('first_name',models.CharField(max_length=150,blank=True,verbose_name='first name')),
   F('last_name',models.CharField(max_length=150,blank=True,verbose_name='last name')),
   F('email',models.EmailField(max_length=254,blank=True,verbose_name='email address')),
   F('is_staff',models.BooleanField(default=False,help_text='Designates whether the user can log into this admin site.',verbose_name='staff status')),
   F('is_active',models.BooleanField(default=True,help_text='Designates whether this user should be treated as active. Unselect this instead of deleting accounts.',verbose_name='active')),
   F('date_joined',models.DateTimeField(default=django.utils.timezone.now,verbose_name='date joined')),
   F('role',models.CharField(max_length=32,choices=[('organisation_admin','Organisation admin'),('school_admin','School admin'),('principal','Principal'),('teacher','Teacher'),('student','Student'),('parent','Parent')],default='teacher')),
   F('avatar_color',models.CharField(max_length=12,default='#8276da')),
   foreign('organisation','core.organisation',null=True,blank=True),foreign('school','core.school',null=True,blank=True),
   F('groups',models.ManyToManyField('auth.Group',blank=True,related_name='user_set',related_query_name='user',help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.',verbose_name='groups')),
   F('user_permissions',models.ManyToManyField('auth.Permission',blank=True,related_name='user_set',related_query_name='user',help_text='Specific permissions for this user.',verbose_name='user permissions')),
  ],options={'abstract':False}),
  migrations.CreateModel(name='AcademicYear',fields=[pk(),F('name',models.CharField(max_length=40)),F('start_date',models.DateField()),F('end_date',models.DateField()),F('active',models.BooleanField(default=True)),foreign('school','core.school')]),
  migrations.CreateModel(name='SchoolClass',fields=[pk(),F('name',models.CharField(max_length=100)),F('grade_level',models.CharField(max_length=40,blank=True)),foreign('school','core.school'),foreign('academic_year','core.academicyear'),foreign('teacher',settings.AUTH_USER_MODEL,related='classes_taught',null=True,blank=True,delete=models.SET_NULL)]),
  migrations.CreateModel(name='Subject',fields=[pk(),F('name',models.CharField(max_length=100)),F('code',models.CharField(max_length=20)),foreign('school','core.school')]),
  migrations.CreateModel(name='Student',fields=[pk(),F('admission_number',models.CharField(max_length=35)),F('first_name',models.CharField(max_length=100)),F('last_name',models.CharField(max_length=100)),F('date_of_birth',models.DateField(null=True,blank=True)),F('enrolled_on',models.DateField()),F('active',models.BooleanField(default=True)),foreign('school','core.school'),F('user',models.OneToOneField(settings.AUTH_USER_MODEL,on_delete=models.SET_NULL,related_name='student_record',null=True,blank=True)),F('guardians',models.ManyToManyField(settings.AUTH_USER_MODEL,related_name='wards',blank=True))]),
  migrations.CreateModel(name='Enrollment',fields=[pk(),F('start_date',models.DateField()),F('end_date',models.DateField(null=True,blank=True)),foreign('student','core.student',related='enrollments'),foreign('school_class','core.schoolclass',related='enrollments')]),
  migrations.CreateModel(name='Assessment',fields=[pk(),F('title',models.CharField(max_length=160)),F('date',models.DateField()),F('max_marks',models.DecimalField(max_digits=8,decimal_places=2,validators=[val(.01)])),F('weight',models.DecimalField(max_digits=6,decimal_places=2,default=1,validators=[val(.01)])),F('published',models.BooleanField(default=False)),foreign('school_class','core.schoolclass'),foreign('subject','core.subject')]),
  migrations.CreateModel(name='Grade',fields=[pk(),F('marks',models.DecimalField(max_digits=8,decimal_places=2,validators=[val(0)])),F('feedback',models.TextField(blank=True)),foreign('assessment','core.assessment',related='grades'),foreign('student','core.student',related='grades')]),
  migrations.CreateModel(name='Attendance',fields=[pk(),F('date',models.DateField()),F('status',models.CharField(max_length=16,choices=[('present','Present'),('absent','Absent'),('late','Late'),('excused','Excused')])),F('note',models.CharField(max_length=255,blank=True)),foreign('student','core.student',related='attendance'),foreign('school_class','core.schoolclass')]),
  migrations.CreateModel(name='Homework',fields=[pk(),F('title',models.CharField(max_length=180)),F('description',models.TextField(blank=True)),F('due_date',models.DateField()),foreign('school_class','core.schoolclass'),foreign('subject','core.subject'),foreign('created_by',settings.AUTH_USER_MODEL,null=True,delete=models.SET_NULL)]),
  migrations.CreateModel(name='HomeworkSubmission',fields=[pk(),F('status',models.CharField(max_length=16,choices=[('assigned','Assigned'),('submitted','Submitted'),('completed','Completed'),('incomplete','Incomplete')],default='assigned')),F('submitted_at',models.DateTimeField(null=True,blank=True)),foreign('homework','core.homework',related='submissions'),foreign('student','core.student'),foreign('confirmed_by',settings.AUTH_USER_MODEL,null=True,blank=True,delete=models.SET_NULL)]),
  migrations.CreateModel(name='Observation',fields=[pk(),F('kind',models.CharField(max_length=20,choices=[('participation','Participation'),('skill','Skill')])),F('label',models.CharField(max_length=100)),F('value',models.PositiveSmallIntegerField(validators=[val(1),maxi(10)])),F('date',models.DateField()),foreign('student','core.student'),foreign('subject','core.subject'),foreign('teacher',settings.AUTH_USER_MODEL)]),
  migrations.CreateModel(name='ReviewCase',fields=[pk(),F('title',models.CharField(max_length=180)),F('reason',models.TextField()),F('status',models.CharField(max_length=24,choices=[('open','Open'),('in_progress','In progress'),('monitoring','Monitoring'),('resolved','Resolved')],default='open')),F('priority',models.CharField(max_length=10,choices=[('low','Low'),('medium','Medium'),('high','High')],default='medium')),F('created_at',models.DateTimeField(auto_now_add=True)),F('updated_at',models.DateTimeField(auto_now=True)),foreign('student','core.student',related='cases'),foreign('school','core.school',related='review_cases',null=True,blank=True),foreign('assignee',settings.AUTH_USER_MODEL,null=True,blank=True,delete=models.SET_NULL)]),
  migrations.CreateModel(name='Intervention',fields=[pk(),F('description',models.TextField()),F('due_date',models.DateField(null=True,blank=True)),F('completed',models.BooleanField(default=False)),F('outcome',models.TextField(blank=True)),F('created_at',models.DateTimeField(auto_now_add=True)),foreign('case','core.reviewcase',related='actions'),foreign('owner',settings.AUTH_USER_MODEL,null=True,delete=models.SET_NULL)]),
  migrations.CreateModel(name='Notification',fields=[pk(),F('title',models.CharField(max_length=180)),F('body',models.CharField(max_length=400)),F('read',models.BooleanField(default=False)),F('created_at',models.DateTimeField(auto_now_add=True)),foreign('user',settings.AUTH_USER_MODEL,related='notifications',delete=models.CASCADE)]),
  migrations.CreateModel(name='AuditEvent',fields=[pk(),F('action',models.CharField(max_length=80)),F('resource',models.CharField(max_length=90)),F('resource_id',models.PositiveIntegerField()),F('changes',models.JSONField(default=dict,blank=True)),F('description',models.CharField(max_length=255,blank=True)),F('created_at',models.DateTimeField(auto_now_add=True)),foreign('actor',settings.AUTH_USER_MODEL,null=True,delete=models.SET_NULL),foreign('organisation','core.organisation',null=True),foreign('school','core.school',null=True)],options={'ordering':['-created_at'],'indexes':[models.Index(fields=['organisation','created_at'],name='audit_org_created_idx'),models.Index(fields=['school','created_at'],name='audit_school_created_idx')]}),
  migrations.AddConstraint(model_name='school',constraint=models.UniqueConstraint(fields=('organisation','code'),name='unique_school_code_per_org')),
  migrations.AddConstraint(model_name='academicyear',constraint=models.UniqueConstraint(fields=('school','name'),name='unique_academic_year')),
  migrations.AddConstraint(model_name='schoolclass',constraint=models.UniqueConstraint(fields=('academic_year','name'),name='unique_class_in_year')),
  migrations.AddConstraint(model_name='subject',constraint=models.UniqueConstraint(fields=('school','code'),name='unique_subject_code')),
  migrations.AddConstraint(model_name='student',constraint=models.UniqueConstraint(fields=('school','admission_number'),name='unique_admission_per_school')),
  migrations.AddConstraint(model_name='enrollment',constraint=models.UniqueConstraint(fields=('student','school_class','start_date'),name='unique_enrolment_period')),
  migrations.AddConstraint(model_name='enrollment',constraint=models.UniqueConstraint(fields=('student',),condition=models.Q(end_date__isnull=True),name='one_active_enrollment_per_student')),
  migrations.AddConstraint(model_name='grade',constraint=models.UniqueConstraint(fields=('assessment','student'),name='unique_assessment_grade')),
  migrations.AddConstraint(model_name='attendance',constraint=models.UniqueConstraint(fields=('student','school_class','date'),name='unique_attendance_session')),
  migrations.AddConstraint(model_name='homeworksubmission',constraint=models.UniqueConstraint(fields=('homework','student'),name='unique_homework_submission')),
 ]
