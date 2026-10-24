from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator,MaxValueValidator
from django.core.exceptions import ValidationError

class Organisation(models.Model):
 name=models.CharField(max_length=160)
 code=models.SlugField(unique=True)
 allow_org_admin_student_access=models.BooleanField(default=False,help_text="Explicit policy to allow organisation-level administrators access to identifiable student records")
 def __str__(self):return self.name

class School(models.Model):
 organisation=models.ForeignKey(Organisation,on_delete=models.PROTECT,related_name='schools')
 name=models.CharField(max_length=160)
 code=models.CharField(max_length=32)
 city=models.CharField(max_length=120,blank=True)
 attendance_alert_threshold=models.DecimalField(max_digits=5,decimal_places=2,default=80,validators=[MinValueValidator(0),MaxValueValidator(100)])
 grade_alert_threshold=models.DecimalField(max_digits=5,decimal_places=2,default=60,validators=[MinValueValidator(0),MaxValueValidator(100)])
 class Meta:constraints=[models.UniqueConstraint(fields=['organisation','code'],name='unique_school_code_per_org')]
 def __str__(self):return self.name

class User(AbstractUser):
 ROLE_CHOICES=[('organisation_admin','Organisation admin'),('school_admin','School admin'),('principal','Principal'),('teacher','Teacher'),('student','Student'),('parent','Parent')]
 role=models.CharField(max_length=32,choices=ROLE_CHOICES,default='teacher')
 organisation=models.ForeignKey(Organisation,null=True,blank=True,on_delete=models.PROTECT)
 school=models.ForeignKey(School,null=True,blank=True,on_delete=models.PROTECT)
 avatar_color=models.CharField(max_length=12,default='#8276da')
 avatar_image=models.TextField(blank=True,default='')
 def clean(self):
  super().clean()
  if self.school_id and self.school.organisation_id != self.organisation_id:raise ValidationError('School must belong to organisation')
  if not self.is_superuser and (not self.organisation_id or (self.role not in ('organisation_admin','parent') and not self.school_id)):
   raise ValidationError('Account requires an organisation and assigned school for this role')

class AcademicYear(models.Model):
 school=models.ForeignKey(School,on_delete=models.PROTECT)
 name=models.CharField(max_length=40)
 start_date=models.DateField()
 end_date=models.DateField()
 active=models.BooleanField(default=True)
 class Meta:constraints=[models.UniqueConstraint(fields=['school','name'],name='unique_academic_year')]
 def clean(self):
  if self.end_date<=self.start_date:raise ValidationError('End date must follow start date')
 def __str__(self):return self.name

class SchoolClass(models.Model):
 school=models.ForeignKey(School,on_delete=models.PROTECT)
 academic_year=models.ForeignKey(AcademicYear,on_delete=models.PROTECT)
 name=models.CharField(max_length=100)
 grade_level=models.CharField(max_length=40,blank=True)
 teacher=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='classes_taught')
 class Meta:constraints=[models.UniqueConstraint(fields=['academic_year','name'],name='unique_class_in_year')]
 def clean(self):
  if self.academic_year_id and self.school_id and self.academic_year.school_id!=self.school_id:raise ValidationError('Invalid class academic year')
  if self.teacher_id and (self.teacher.role!='teacher' or self.teacher.school_id!=self.school_id):raise ValidationError('Assigned teacher must belong to class school')
 def __str__(self):return self.name

class Subject(models.Model):
 school=models.ForeignKey(School,on_delete=models.PROTECT)
 name=models.CharField(max_length=100)
 code=models.CharField(max_length=20)
 class Meta:constraints=[models.UniqueConstraint(fields=['school','code'],name='unique_subject_code')]
 def __str__(self):return self.name

class Student(models.Model):
 school=models.ForeignKey(School,on_delete=models.PROTECT)
 admission_number=models.CharField(max_length=35)
 first_name=models.CharField(max_length=100)
 last_name=models.CharField(max_length=100)
 date_of_birth=models.DateField(null=True,blank=True)
 GENDER=[('male','Boy'),('female','Girl')]
 gender=models.CharField(max_length=8,choices=GENDER,blank=True,default='')
 user=models.OneToOneField(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='student_record')
 guardians=models.ManyToManyField(User,related_name='wards',blank=True)
 enrolled_on=models.DateField()
 active=models.BooleanField(default=True)
 class Meta:constraints=[models.UniqueConstraint(fields=['school','admission_number'],name='unique_admission_per_school')]
 def clean(self):
  if self.user_id and (self.user.role!='student' or (self.user.organisation_id!=self.school.organisation_id)):
   raise ValidationError('Student account must have student role and matching organisation')
 @property
 def full_name(self):return f'{self.first_name} {self.last_name}'
 def __str__(self):return self.full_name

class Enrollment(models.Model):
 student=models.ForeignKey(Student,on_delete=models.PROTECT,related_name='enrollments')
 school_class=models.ForeignKey(SchoolClass,on_delete=models.PROTECT,related_name='enrollments')
 start_date=models.DateField()
 end_date=models.DateField(null=True,blank=True)
 class Meta:constraints=[models.UniqueConstraint(fields=['student','school_class','start_date'],name='unique_enrolment_period'),models.UniqueConstraint(fields=['student'],condition=models.Q(end_date__isnull=True),name='one_active_enrollment_per_student')]
 def clean(self):
  if self.student_id and self.school_class_id:
   if not self.pk and self.student.school_id!=self.school_class.school_id:raise ValidationError('New enrollment must use current student school')
   if self.start_date < self.student.enrolled_on:raise ValidationError('Enrollment before student admission')
   intervals=Enrollment.objects.filter(student_id=self.student_id).exclude(pk=self.pk)
   for previous in intervals:
    if (previous.end_date is None or previous.end_date>=self.start_date) and (self.end_date is None or self.end_date>=previous.start_date):
     raise ValidationError('Enrollment periods cannot overlap')
  if self.end_date and self.end_date<self.start_date:raise ValidationError('Invalid enrollment dates')

class Assessment(models.Model):
 school_class=models.ForeignKey(SchoolClass,on_delete=models.PROTECT)
 subject=models.ForeignKey(Subject,on_delete=models.PROTECT)
 title=models.CharField(max_length=160)
 date=models.DateField()
 max_marks=models.DecimalField(max_digits=8,decimal_places=2,validators=[MinValueValidator(.01)])
 weight=models.DecimalField(max_digits=6,decimal_places=2,default=1,validators=[MinValueValidator(.01)])
 published=models.BooleanField(default=False)
 def clean(self):
  if self.subject_id and self.school_class_id and self.subject.school_id!=self.school_class.school_id:raise ValidationError('Subject does not belong to class school')
  if self.school_class_id and self.date and not self.school_class.academic_year.start_date<=self.date<=self.school_class.academic_year.end_date:
   raise ValidationError('Assessment date outside class academic year')

class Grade(models.Model):
 assessment=models.ForeignKey(Assessment,on_delete=models.PROTECT,related_name='grades')
 student=models.ForeignKey(Student,on_delete=models.PROTECT,related_name='grades')
 marks=models.DecimalField(max_digits=8,decimal_places=2,validators=[MinValueValidator(0)])
 feedback=models.TextField(blank=True)
 class Meta:constraints=[models.UniqueConstraint(fields=['assessment','student'],name='unique_assessment_grade')]
 def clean(self):
  if self.assessment_id and self.student_id:
   if self.marks>self.assessment.max_marks:raise ValidationError('Marks cannot exceed maximum')
   if not Enrollment.objects.filter(student=self.student,school_class=self.assessment.school_class,start_date__lte=self.assessment.date).filter(models.Q(end_date__isnull=True)|models.Q(end_date__gte=self.assessment.date)).exists():raise ValidationError('Student not enrolled in assessed class on assessment date')
 @property
 def percentage(self):return round(float(self.marks/self.assessment.max_marks*100),1)

class Attendance(models.Model):
 STATUS=[('present','Present'),('absent','Absent'),('late','Late'),('excused','Excused')]
 student=models.ForeignKey(Student,on_delete=models.PROTECT,related_name='attendance')
 school_class=models.ForeignKey(SchoolClass,on_delete=models.PROTECT)
 date=models.DateField()
 status=models.CharField(max_length=16,choices=STATUS)
 note=models.CharField(max_length=255,blank=True)
 class Meta:constraints=[models.UniqueConstraint(fields=['student','school_class','date'],name='unique_attendance_session')]
 def clean(self):
  if self.student_id and self.school_class_id:
   if not Enrollment.objects.filter(student=self.student,school_class=self.school_class,start_date__lte=self.date).filter(models.Q(end_date__isnull=True)|models.Q(end_date__gte=self.date)).exists():raise ValidationError('Student not enrolled on attendance date')

class Homework(models.Model):
 school_class=models.ForeignKey(SchoolClass,on_delete=models.PROTECT)
 subject=models.ForeignKey(Subject,on_delete=models.PROTECT)
 title=models.CharField(max_length=180)
 description=models.TextField(blank=True)
 due_date=models.DateField()
 created_by=models.ForeignKey(User,null=True,on_delete=models.SET_NULL)
 def clean(self):
  if self.school_class_id and self.subject_id and self.school_class.school_id!=self.subject.school_id:raise ValidationError('Subject mismatch')

class HomeworkSubmission(models.Model):
 STATUS=[('assigned','Assigned'),('submitted','Submitted'),('completed','Completed'),('incomplete','Incomplete')]
 homework=models.ForeignKey(Homework,on_delete=models.PROTECT,related_name='submissions')
 student=models.ForeignKey(Student,on_delete=models.PROTECT)
 status=models.CharField(max_length=16,choices=STATUS,default='assigned')
 submitted_at=models.DateTimeField(null=True,blank=True)
 confirmed_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL)
 class Meta:constraints=[models.UniqueConstraint(fields=['homework','student'],name='unique_homework_submission')]
 def clean(self):
  if self.student_id and self.homework_id:
   if not Enrollment.objects.filter(student=self.student,school_class=self.homework.school_class,start_date__lte=self.homework.due_date).filter(models.Q(end_date__isnull=True)|models.Q(end_date__gte=self.homework.due_date)).exists():raise ValidationError('Student not enrolled for this homework')
  if self.status=='completed' and not self.confirmed_by_id:raise ValidationError('Teacher confirmation required')
  if self.confirmed_by_id and self.confirmed_by.role not in ('teacher','principal','school_admin','organisation_admin'):raise ValidationError('Staff confirmation required')

class Observation(models.Model):
 KIND=[('participation','Participation'),('skill','Skill')]
 student=models.ForeignKey(Student,on_delete=models.PROTECT)
 subject=models.ForeignKey(Subject,on_delete=models.PROTECT)
 teacher=models.ForeignKey(User,on_delete=models.PROTECT)
 kind=models.CharField(max_length=20,choices=KIND)
 label=models.CharField(max_length=100)
 value=models.PositiveSmallIntegerField(validators=[MinValueValidator(1),MaxValueValidator(10)])
 date=models.DateField()
 def clean(self):
  if self.student_id and self.subject_id and self.student.school.organisation_id != self.subject.school.organisation_id:
   raise ValidationError('Observation school/subject mismatch')
  if self.teacher_id and (self.teacher.role!='teacher' or self.teacher.school_id!=self.subject.school_id):
   raise ValidationError('Observation teacher does not belong to school')
  if self.student_id and self.subject_id and self.date and not Enrollment.objects.filter(student=self.student,school_class__school=self.subject.school,start_date__lte=self.date).filter(models.Q(end_date__isnull=True)|models.Q(end_date__gte=self.date)).exists():
   raise ValidationError('Student not enrolled at subject school on date')

class ReviewCase(models.Model):
 school=models.ForeignKey(School,on_delete=models.PROTECT,related_name='review_cases',null=True,blank=True)
 STATUS=[('open','Open'),('in_progress','In progress'),('monitoring','Monitoring'),('resolved','Resolved')]
 PRIORITY=[('low','Low'),('medium','Medium'),('high','High')]
 student=models.ForeignKey(Student,on_delete=models.PROTECT,related_name='cases')
 title=models.CharField(max_length=180)
 reason=models.TextField()
 status=models.CharField(max_length=24,choices=STATUS,default='open')
 priority=models.CharField(max_length=10,choices=PRIORITY,default='medium')
 assignee=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL)
 created_at=models.DateTimeField(auto_now_add=True)
 updated_at=models.DateTimeField(auto_now=True)
 def clean(self):
  if self.school_id and self.student_id and self.school.organisation_id!=self.student.school.organisation_id:
   raise ValidationError('Case school and student organisation mismatch')
  if self.assignee_id and (self.assignee.role not in ('teacher','principal','school_admin','organisation_admin') or self.assignee.organisation_id!=(self.school.organisation_id if self.school_id else self.student.school.organisation_id) or (self.assignee.role!='organisation_admin' and self.assignee.school_id!=(self.school_id or self.student.school_id))):
   raise ValidationError('Assignee must be authorised organisation staff')
 def save(self,*args,**kwargs):
  if not self.school_id and self.student_id and not self.pk:self.school_id=self.student.school_id
  return super().save(*args,**kwargs)

class Intervention(models.Model):
 case=models.ForeignKey(ReviewCase,on_delete=models.PROTECT,related_name='actions')
 description=models.TextField()
 owner=models.ForeignKey(User,null=True,on_delete=models.SET_NULL)
 due_date=models.DateField(null=True,blank=True)
 completed=models.BooleanField(default=False)
 outcome=models.TextField(blank=True)
 created_at=models.DateTimeField(auto_now_add=True)
 def clean(self):
  if self.owner_id and (self.owner.organisation_id!=self.case.school.organisation_id or (self.owner.role!='organisation_admin' and self.owner.school_id!=self.case.school_id)):
   raise ValidationError('Intervention owner organisation mismatch')

class Notification(models.Model):
 user=models.ForeignKey(User,on_delete=models.CASCADE,related_name='notifications')
 title=models.CharField(max_length=180)
 body=models.CharField(max_length=400)
 read=models.BooleanField(default=False)
 created_at=models.DateTimeField(auto_now_add=True)

class AuditEvent(models.Model):
 actor=models.ForeignKey(User,null=True,on_delete=models.SET_NULL)
 organisation=models.ForeignKey(Organisation,null=True,on_delete=models.PROTECT)
 school=models.ForeignKey(School,null=True,on_delete=models.PROTECT)
 action=models.CharField(max_length=80)
 resource=models.CharField(max_length=90)
 resource_id=models.PositiveIntegerField()
 changes=models.JSONField(default=dict,blank=True)
 description=models.CharField(max_length=255,blank=True)
 created_at=models.DateTimeField(auto_now_add=True)
 class Meta:ordering=['-created_at'];indexes=[models.Index(fields=['organisation','created_at'],name='audit_org_created_idx'),models.Index(fields=['school','created_at'],name='audit_school_created_idx')]



class SchoolConfiguration(models.Model):
 """Draftable school setup; activation captures an immutable version.

 This is administrative readiness, NOT a replacement for module-specific
 grading/attendance rules until those engines are integrated.
 """
 STATUS=[('draft','Draft'),('active','Active')]
 school=models.OneToOneField(School,on_delete=models.PROTECT,related_name='configuration')
 country=models.CharField(max_length=2,blank=True,help_text='ISO 3166-1 alpha-2 country code')
 jurisdiction=models.CharField(max_length=120,blank=True)
 timezone=models.CharField(max_length=80,blank=True)
 language=models.CharField(max_length=32,blank=True)
 locale=models.CharField(max_length=32,blank=True)
 programmes=models.JSONField(default=list,blank=True)
 academic_year_name=models.CharField(max_length=80,blank=True)
 academic_start=models.DateField(null=True,blank=True)
 academic_end=models.DateField(null=True,blank=True)
 reporting_periods=models.JSONField(default=list,blank=True)
 grading_policy=models.JSONField(default=dict,blank=True)
 attendance_policy=models.JSONField(default=dict,blank=True)
 school_settings=models.JSONField(default=dict,blank=True)
 status=models.CharField(max_length=12,choices=STATUS,default='draft')
 active_version=models.PositiveIntegerField(default=0)
 activated_at=models.DateTimeField(null=True,blank=True)
 activated_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='activated_school_configurations')
 updated_at=models.DateTimeField(auto_now=True)
 class Meta:ordering=['school__name']

class SchoolConfigurationVersion(models.Model):
 """Immutable history of approved setup snapshots."""
 configuration=models.ForeignKey(SchoolConfiguration,on_delete=models.PROTECT,related_name='versions')
 version=models.PositiveIntegerField()
 snapshot=models.JSONField()
 activated_by=models.ForeignKey(User,null=True,on_delete=models.SET_NULL)
 activated_at=models.DateTimeField(auto_now_add=True)
 class Meta:
  constraints=[models.UniqueConstraint(fields=['configuration','version'],name='unique_school_config_version')]
  ordering=['-version']

class PublishedSchoolIndicator(models.Model):
 """Deliberately approved, aggregate-only public content.

 Not connected to individual student records or generated automatically.
 """
 school=models.ForeignKey(School,on_delete=models.PROTECT,related_name='public_indicators')
 title=models.CharField(max_length=100)
 period_label=models.CharField(max_length=80)
 value=models.DecimalField(max_digits=7,decimal_places=2)
 unit=models.CharField(max_length=24,default='%')
 methodology=models.CharField(max_length=500)
 eligible_population=models.PositiveIntegerField()
 completeness_note=models.CharField(max_length=300)
 approved_for_publication=models.BooleanField(default=False)
 approved_by=models.ForeignKey(User,on_delete=models.PROTECT,null=True,blank=True,related_name='approved_indicators')
 published_at=models.DateTimeField(null=True,blank=True)
 class Meta:ordering=['-published_at','school__name']
 def clean(self):
  super().clean()
  if self.approved_for_publication:
   if not self.approved_by_id or not self.approved_by.is_superuser:
    raise ValidationError('Public publication requires explicit platform administrator approval')
   if not self.published_at:
    raise ValidationError('Publication date is required')
   if self.eligible_population<10:
    raise ValidationError('Aggregate below 10 participants is withheld by the current privacy release policy')
   if not self.methodology.strip() or not self.completeness_note.strip():
    raise ValidationError('Methodology and data completeness must be documented')


# ------------------------------------------------------------------ Staff (HR records)
class StaffMember(models.Model):
    """Employment record. Deliberately separate from the sign-in User: a person can be on
    the staff list without a login, and terminating them switches any linked login off."""
    STATUS=[('active','Active'),('terminated','Terminated')]
    school=models.ForeignKey(School,on_delete=models.PROTECT,related_name='staff')
    user=models.OneToOneField(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='staff_record')
    first_name=models.CharField(max_length=100)
    last_name=models.CharField(max_length=100)
    email=models.EmailField(blank=True)
    phone=models.CharField(max_length=40,blank=True)
    position=models.CharField(max_length=120,help_text='Job title, e.g. Maths Teacher')
    role=models.CharField(max_length=32,default='teacher',help_text='Assigned role: teacher, principal, school_admin or any non-login role such as accountant')
    status=models.CharField(max_length=16,choices=STATUS,default='active')
    hired_on=models.DateField()
    terminated_on=models.DateField(null=True,blank=True)
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:ordering=['last_name','first_name']
    @property
    def full_name(self):return f'{self.first_name} {self.last_name}'.strip()
    def __str__(self):return self.full_name

class StaffEvent(models.Model):
    KINDS=[('hired','Hired'),('promoted','Promoted'),('role_changed','Role changed'),('terminated','Terminated'),('reinstated','Reinstated'),('updated','Updated')]
    staff=models.ForeignKey(StaffMember,on_delete=models.CASCADE,related_name='events')
    kind=models.CharField(max_length=16,choices=KINDS)
    from_value=models.CharField(max_length=160,blank=True)
    to_value=models.CharField(max_length=160,blank=True)
    note=models.CharField(max_length=255,blank=True)
    actor=models.ForeignKey(User,null=True,on_delete=models.SET_NULL,related_name='+')
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:ordering=['-created_at','-id']

# ------------------------------------------------------------------ Finance (simple ledger)
class FinanceCategory(models.Model):
    KINDS=[('income','Income'),('expense','Expense')]
    school=models.ForeignKey(School,on_delete=models.PROTECT,related_name='finance_categories')
    kind=models.CharField(max_length=8,choices=KINDS)
    name=models.CharField(max_length=80)
    active=models.BooleanField(default=True)
    class Meta:
        ordering=['kind','name']
        constraints=[models.UniqueConstraint(fields=['school','kind','name'],name='unique_finance_category')]
    def __str__(self):return f'{self.name} ({self.kind})'

class FinanceEntry(models.Model):
    """One income or expense line. Never deleted; mistakes are voided so history stays intact."""
    school=models.ForeignKey(School,on_delete=models.PROTECT,related_name='finance_entries')
    category=models.ForeignKey(FinanceCategory,on_delete=models.PROTECT,related_name='entries')
    amount=models.DecimalField(max_digits=12,decimal_places=2,validators=[MinValueValidator(0.01)])
    date=models.DateField()
    description=models.CharField(max_length=255,blank=True)
    voided=models.BooleanField(default=False)
    created_by=models.ForeignKey(User,null=True,on_delete=models.SET_NULL,related_name='+')
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering=['-date','-id']
        indexes=[models.Index(fields=['school','date'],name='finance_school_date_idx')]
    @property
    def kind(self):return self.category.kind


class ClassSubjectTeacher(models.Model):
    """Assigns a teacher to a specific subject within a specific school class."""
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='subject_teachers')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='class_teachers')
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='subject_teaching_assignments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['school_class', 'subject'], name='unique_class_subject_teacher')
        ]

    def __str__(self):
        return f"{self.school_class.name} - {self.subject.name}: {self.teacher.get_full_name() or self.teacher.username}"


class SubjectMessage(models.Model):
    """Communication message for a particular subject in a particular class.
    Class students and the assigned subject teacher can exchange questions and answers."""
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='subject_messages')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='class_messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_subject_messages')
    message = models.TextField()
    is_teacher_answer = models.BooleanField(default=False)
    reply_to = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='replies')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.school_class.name} / {self.subject.name}] {self.sender.username}: {self.message[:30]}"

