from decimal import Decimal
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator,MaxValueValidator
from django.core.exceptions import ValidationError

class Organisation(models.Model):
 name=models.CharField(max_length=160)
 code=models.SlugField(unique=True)
 allow_org_admin_student_access=models.BooleanField(default=False,help_text="Explicit policy to allow organisation-level administrators access to identifiable student records")
 def __str__(self):return self.name

CURRENCIES = ['PKR', 'USD', 'GBP', 'EUR', 'AED', 'SAR', 'INR', 'CAD', 'AUD']

class School(models.Model):
 organisation=models.ForeignKey(Organisation,on_delete=models.PROTECT,related_name='schools')
 name=models.CharField(max_length=160)
 code=models.CharField(max_length=32)
 city=models.CharField(max_length=120,blank=True)
 currency=models.CharField(max_length=8,default='PKR',help_text='ISO currency code, e.g. PKR, USD')
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
 RESULT_STATUS=[('recorded','Recorded'),('absent','Absent'),('exempt','Exempt'),('incomplete','Incomplete'),('withdrawn','Withdrawn')]
 assessment=models.ForeignKey(Assessment,on_delete=models.PROTECT,related_name='grades')
 student=models.ForeignKey(Student,on_delete=models.PROTECT,related_name='grades')
 marks=models.DecimalField(max_digits=8,decimal_places=2,validators=[MinValueValidator(0)])
 result_status=models.CharField(max_length=16,choices=RESULT_STATUS,default='recorded')
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


# ------------------------------------------------------------------ Fees (student billing)
class FeeHead(models.Model):
    """Institutional fee category (e.g. Tuition, Admission, Annual, Transport)."""
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='fee_heads')
    name = models.CharField(max_length=80)
    category = models.ForeignKey(FinanceCategory, on_delete=models.PROTECT, related_name='fee_heads')
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        constraints = [models.UniqueConstraint(fields=['school', 'name'], name='unique_fee_head_per_school')]

    def __str__(self):
        return f"{self.name} ({self.school.name})"


class FeeStructure(models.Model):
    """Standard fee rate per class or school-wide."""
    FREQUENCIES = [('one_time', 'One-time'), ('monthly', 'Monthly'), ('term', 'Term'), ('annual', 'Annual')]
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='fee_structures')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='fee_structures')
    school_class = models.ForeignKey(SchoolClass, null=True, blank=True, on_delete=models.PROTECT, related_name='fee_structures')
    head = models.ForeignKey(FeeHead, on_delete=models.PROTECT, related_name='structures')
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    frequency = models.CharField(max_length=16, choices=FREQUENCIES, default='monthly')
    due_day = models.PositiveSmallIntegerField(default=10, validators=[MinValueValidator(1), MaxValueValidator(31)])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['school', 'academic_year', 'school_class', 'head'], name='unique_fee_structure')]

    def __str__(self):
        cls_name = self.school_class.name if self.school_class else 'All classes'
        return f"{cls_name} - {self.head.name}: {self.amount}"


class Concession(models.Model):
    """Approved student fee discount (sibling, scholarship, staff ward)."""
    DISCOUNT_TYPES = [('percent', 'Percentage'), ('fixed', 'Fixed Amount')]
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name='concessions')
    head = models.ForeignKey(FeeHead, null=True, blank=True, on_delete=models.PROTECT, related_name='concessions')
    discount_type = models.CharField(max_length=12, choices=DISCOUNT_TYPES, default='percent')
    discount_value = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    reason = models.CharField(max_length=200)
    approved_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='approved_concessions')
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.full_name}: {self.discount_value}{'%' if self.discount_type == 'percent' else ' fixed'} ({self.reason})"


class StudentFee(models.Model):
    """Voucher line item for a student in a specific billing period."""
    STATUSES = [('unpaid', 'Unpaid'), ('partial', 'Partial'), ('paid', 'Paid'), ('waived', 'Waived'), ('void', 'Void')]
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name='fee_lines')
    head = models.ForeignKey(FeeHead, on_delete=models.PROTECT, related_name='student_fees')
    period = models.CharField(max_length=30, help_text='YYYY-MM or term code')
    amount_due = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))])
    discount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=16, choices=STATUSES, default='unpaid')
    due_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['due_date', 'id']
        constraints = [models.UniqueConstraint(fields=['student', 'head', 'period'], name='unique_student_fee_period')]

    @property
    def net_due(self):
        return max(Decimal('0.00'), self.amount_due - self.discount)

    def __str__(self):
        return f"{self.student.full_name} - {self.head.name} ({self.period}): {self.net_due} [{self.status}]"


class FeePayment(models.Model):
    """Fee collection receipt. Creates a linked FinanceEntry (Income) when approved."""
    STATUSES = [('pending', 'Pending Approval'), ('approved', 'Approved'), ('rejected', 'Rejected')]
    METHODS = [('cash', 'Cash'), ('bank', 'Bank Transfer'), ('online', 'Online / Card'), ('cheque', 'Cheque')]
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name='fee_payments')
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='fee_payments')
    receipt_number = models.CharField(max_length=60, unique=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    method = models.CharField(max_length=16, choices=METHODS, default='cash')
    paid_on = models.DateField()
    reference = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=16, choices=STATUSES, default='approved')
    approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_fee_payments')
    approved_at = models.DateTimeField(null=True, blank=True)
    received_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='received_fee_payments')
    voided = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=255, blank=True)
    finance_entry = models.OneToOneField(FinanceEntry, null=True, blank=True, on_delete=models.SET_NULL, related_name='linked_fee_payment')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-paid_on', '-id']

    def __str__(self):
        return f"Receipt #{self.receipt_number}: {self.student.full_name} ({self.amount})"


class FeePaymentAllocation(models.Model):
    """Allocates part or all of a payment receipt to a specific StudentFee voucher line."""
    payment = models.ForeignKey(FeePayment, on_delete=models.CASCADE, related_name='allocations')
    student_fee = models.ForeignKey(StudentFee, on_delete=models.PROTECT, related_name='allocations')
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])


# ------------------------------------------------------------------ Staff Salaries
class SalaryStructure(models.Model):
    """Staff compensation blueprint. New row per revision; history is never overwritten."""
    staff = models.ForeignKey(StaffMember, on_delete=models.PROTECT, related_name='salary_structures')
    effective_from = models.DateField()
    basic = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    allowances = models.JSONField(default=list, blank=True)
    fixed_deductions = models.JSONField(default=list, blank=True)
    currency = models.CharField(max_length=8, default='PKR')
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_from', '-id']

    def __str__(self):
        return f"{self.staff.full_name}: Basic {self.basic} (effective {self.effective_from})"


class SalaryRecord(models.Model):
    """Monthly salary sheet row. When marked paid, auto-creates linked FinanceEntry (Expense)."""
    STATUSES = [('draft', 'Draft'), ('pending', 'Pending'), ('approved', 'Approved'), ('paid', 'Paid'), ('cancelled', 'Cancelled'), ('void', 'Void')]
    METHODS = [('bank', 'Bank Transfer'), ('cash', 'Cash'), ('cheque', 'Cheque')]
    staff = models.ForeignKey(StaffMember, on_delete=models.PROTECT, related_name='salary_records')
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='salary_records')
    month = models.CharField(max_length=7, help_text='YYYY-MM')
    basic = models.DecimalField(max_digits=14, decimal_places=2)
    allowances_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    deductions_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    additions_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    advance_recovered = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    gross = models.DecimalField(max_digits=14, decimal_places=2)
    net = models.DecimalField(max_digits=14, decimal_places=2)
    status = models.CharField(max_length=16, choices=STATUSES, default='draft')
    due_date = models.DateField(null=True, blank=True)
    paid_on = models.DateField(null=True, blank=True)
    method = models.CharField(max_length=16, choices=METHODS, default='bank', blank=True)
    reference = models.CharField(max_length=100, blank=True)
    void_reason = models.CharField(max_length=255, blank=True)
    finance_entry = models.OneToOneField(FinanceEntry, null=True, blank=True, on_delete=models.SET_NULL, related_name='linked_salary_record')
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-month', 'staff__last_name']
        constraints = [models.UniqueConstraint(fields=['staff', 'month'], name='unique_staff_monthly_salary')]

    def __str__(self):
        return f"{self.staff.full_name} ({self.month}): Net {self.net} [{self.status}]"


class SalaryAdjustment(models.Model):
    """One-off bonus, penalty deduction, or advance payment."""
    KINDS = [('bonus', 'Bonus / Incentive'), ('deduction', 'Deduction / Fine'), ('advance', 'Salary Advance')]
    staff = models.ForeignKey(StaffMember, on_delete=models.PROTECT, related_name='adjustments')
    month = models.CharField(max_length=7, help_text='YYYY-MM')
    kind = models.CharField(max_length=16, choices=KINDS)
    amount = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    reason = models.CharField(max_length=255)
    approved_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.staff.full_name} [{self.kind}] {self.amount}: {self.reason}"


# ------------------------------------------------------------------ Examinations
class ExamSession(models.Model):
    """Formal assessment term (Mid-term, Final, Monthly)."""
    STATUSES = [('draft', 'Draft'), ('scheduled', 'Scheduled'), ('marking', 'Marking'), ('published', 'Published'), ('closed', 'Closed')]
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='exam_sessions')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='exam_sessions')
    name = models.CharField(max_length=100)
    reporting_period = models.CharField(max_length=60, blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=16, choices=STATUSES, default='draft')
    ranking_enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_date']
        constraints = [models.UniqueConstraint(fields=['school', 'academic_year', 'name'], name='unique_exam_session_per_year')]

    def __str__(self):
        return f"{self.name} ({self.school.name})"


class AssessmentCategory(models.Model):
    """Assessment component (Quiz, Midterm, Final, Practical) with weight totaling 100 per subject."""
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='assessment_categories')
    subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.PROTECT, related_name='assessment_categories')
    name = models.CharField(max_length=80)
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('25.00'), validators=[MinValueValidator(Decimal('0.01')), MaxValueValidator(Decimal('100.00'))])

    class Meta:
        constraints = [models.UniqueConstraint(fields=['school', 'subject', 'name'], name='unique_assessment_category_subject')]

    def __str__(self):
        subj_name = self.subject.name if self.subject else 'All subjects'
        return f"{subj_name} - {self.name} ({self.weight}%)"


class GradingScale(models.Model):
    """Institutional grading scale (e.g. Letter Grade A-F, GPA 4.0)."""
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='grading_scales')
    name = models.CharField(max_length=80)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.school.name})"


class GradeBand(models.Model):
    """Letter and grade point band inside a grading scale."""
    grading_scale = models.ForeignKey(GradingScale, on_delete=models.CASCADE, related_name='bands')
    min_percent = models.DecimalField(max_digits=5, decimal_places=2)
    max_percent = models.DecimalField(max_digits=5, decimal_places=2)
    letter = models.CharField(max_length=8)
    grade_point = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal('0.00'))
    description = models.CharField(max_length=60, blank=True)

    class Meta:
        ordering = ['-min_percent']

    def __str__(self):
        return f"{self.letter} ({self.min_percent}% - {self.max_percent}%)"


class ExamPaper(models.Model):
    """Individual subject paper in an exam session (date sheet row)."""
    session = models.ForeignKey(ExamSession, on_delete=models.PROTECT, related_name='papers')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name='exam_papers')
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name='exam_papers')
    date = models.DateField()
    start_time = models.TimeField()
    duration_min = models.PositiveIntegerField(default=120)
    max_marks = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('100.00'), validators=[MinValueValidator(Decimal('1.00'))])
    room = models.CharField(max_length=60, blank=True)
    invigilator = models.ForeignKey(StaffMember, null=True, blank=True, on_delete=models.SET_NULL, related_name='invigilated_papers')
    assessment = models.OneToOneField(Assessment, null=True, blank=True, on_delete=models.SET_NULL, related_name='exam_paper')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'start_time']
        constraints = [models.UniqueConstraint(fields=['session', 'school_class', 'subject'], name='unique_paper_per_session_class_subject')]

    def __str__(self):
        return f"{self.session.name}: {self.school_class.name} - {self.subject.name} on {self.date}"


class ExamMarkCorrection(models.Model):
    """Audited mark correction for a published examination result."""
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name='corrections')
    old_marks = models.DecimalField(max_digits=8, decimal_places=2)
    new_marks = models.DecimalField(max_digits=8, decimal_places=2)
    old_status = models.CharField(max_length=16)
    new_status = models.CharField(max_length=16)
    reason = models.CharField(max_length=255)
    actor = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


# ------------------------------------------------------------------ Platform Owner & Security
class PlatformPlan(models.Model):
    """SaaS tier for institutional subscription."""
    BASIS_CHOICES = [('per_student', 'Per Student'), ('per_campus', 'Per Campus'), ('flat', 'Flat Subscription')]
    name = models.CharField(max_length=80)
    billing_basis = models.CharField(max_length=24, choices=BASIS_CHOICES, default='per_student')
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=8, default='USD')
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.price_per_unit} {self.currency} / {self.billing_basis})"


class OrganisationSubscription(models.Model):
    """Active subscription plan for an educational organisation."""
    STATUSES = [('active', 'Active'), ('trial', 'Trial'), ('past_due', 'Past Due'), ('cancelled', 'Cancelled')]
    organisation = models.OneToOneField(Organisation, on_delete=models.PROTECT, related_name='subscription')
    plan = models.ForeignKey(PlatformPlan, on_delete=models.PROTECT, related_name='subscriptions')
    status = models.CharField(max_length=20, choices=STATUSES, default='active')
    active_students_count = models.PositiveIntegerField(default=0)
    monthly_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    started_on = models.DateField(auto_now_add=True)
    renewal_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.organisation.name} - {self.plan.name} [{self.status}]"


class SupportAccessGrant(models.Model):
    """Explicit, time-limited permission for platform support to access institution data."""
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='support_grants')
    school = models.ForeignKey(School, null=True, blank=True, on_delete=models.CASCADE, related_name='support_grants')
    granted_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='created_support_grants')
    granted_to = models.ForeignKey(User, on_delete=models.PROTECT, related_name='received_support_grants')
    reason = models.CharField(max_length=255)
    starts_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-starts_at']

    def __str__(self):
        return f"Support grant: {self.organisation.name} -> {self.granted_to.username} ({self.reason})"


class UserInvitation(models.Model):
    """Admin-issued invitation token replacing open self-registration."""
    token = models.CharField(max_length=64, unique=True)
    email = models.EmailField()
    role = models.CharField(max_length=32)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='invitations')
    school = models.ForeignKey(School, null=True, blank=True, on_delete=models.CASCADE, related_name='invitations')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='issued_invitations')
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Invite: {self.email} as {self.role} ({'Used' if self.used_at else 'Pending'})"


class HolidayCalendar(models.Model):
    """Holiday schedule excluded from the attendance calculation denominator."""
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='holidays')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='holidays')
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['start_date']

    def __str__(self):
        return f"{self.name} ({self.start_date} - {self.end_date})"


class ClassTimetable(models.Model):
    """Weekly class timetable period schedule."""
    DAYS = [(0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday')]
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='timetable_entries')
    day_of_week = models.PositiveSmallIntegerField(choices=DAYS)
    period_number = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    teacher = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    room = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ['day_of_week', 'period_number']
        constraints = [models.UniqueConstraint(fields=['school_class', 'day_of_week', 'period_number'], name='unique_class_period')]


class Announcement(models.Model):
    """Institutional or campus broadcast announcement targeted by role."""
    TARGET_ROLES = [
        ('all', 'All Roles'),
        ('students', 'Students'),
        ('staff', 'Staff'),
        ('teachers', 'Teachers'),
        ('principals', 'Principals'),
        ('parents', 'Parents'),
    ]
    PRIORITIES = [
        ('normal', 'Normal'),
        ('important', 'Important'),
        ('urgent', 'Urgent'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='announcements', null=True, blank=True)
    title = models.CharField(max_length=200)
    content = models.TextField()
    target_role = models.CharField(max_length=32, choices=TARGET_ROLES, default='all')
    priority = models.CharField(max_length=20, choices=PRIORITIES, default='normal')
    pinned = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='announcements_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-pinned', '-created_at']

    def __str__(self):
        return f"[{self.priority.upper()}] {self.title} ({self.target_role})"


class StudyMaterial(models.Model):
    """Educational materials uploaded for students by teachers, principals, or administrators."""
    STATUSES = [
        ('draft', 'Draft'),
        ('published', 'Published'),
        ('archived', 'Archived'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='study_materials')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='study_materials')
    subject = models.ForeignKey(Subject, on_delete=models.SET_NULL, null=True, blank=True, related_name='study_materials')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    file_path = models.CharField(max_length=300, help_text='Relative path within private_storage directory')
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size_bytes = models.BigIntegerField()
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='materials_uploaded')
    visible_from = models.DateTimeField(null=True, blank=True, help_text='Optional scheduled publication datetime')
    status = models.CharField(max_length=20, choices=STATUSES, default='published')
    download_count = models.PositiveIntegerField(default=0)
    version = models.PositiveSmallIntegerField(default=1)
    previous_version = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='next_versions')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.school_class.name}) [{self.status}]"


class RolePermission(models.Model):
    """Custom granular permission overrides for institutional roles per campus or organization."""
    school = models.ForeignKey(School, null=True, blank=True, on_delete=models.CASCADE, related_name='role_permissions')
    role = models.CharField(max_length=40, choices=User.ROLE_CHOICES)
    permission_key = models.CharField(max_length=80)
    granted = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['role', 'permission_key']
        constraints = [
            models.UniqueConstraint(fields=['school', 'role', 'permission_key'], name='unique_school_role_permission')
        ]

    def __str__(self):
        campus = self.school.name if self.school else 'Global'
        state = 'Granted' if self.granted else 'Revoked'
        return f"[{campus}] {self.role} -> {self.permission_key}: {state}"



