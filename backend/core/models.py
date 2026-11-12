from decimal import Decimal
from datetime import date
from django.utils import timezone
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator,MaxValueValidator
from django.core.exceptions import ValidationError

class Organisation(models.Model):
 name=models.CharField(max_length=160)
 code=models.SlugField(unique=True)
 allow_org_admin_student_access=models.BooleanField(default=False,help_text="Explicit policy to allow organisation-level administrators access to identifiable student records")
 allow_temporary_passwords=models.BooleanField(default=False,help_text="Allow administrators to set a temporary password during staff creation")
 class_teacher_can_edit_all_subject_marks=models.BooleanField(default=False,help_text="Allow class teachers to edit marks for all subjects in their class")
 teachers_keep_read_access_to_own_history=models.BooleanField(default=True,help_text="Allow teachers read-only access to records they created after assignment ends")
 max_classes_per_class_teacher=models.PositiveIntegerField(default=1,help_text="Maximum number of classes a single teacher can be class teacher of")
 teachers_can_export=models.BooleanField(default=True,help_text="Allow teachers to export marks and attendance within their scope")
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
 discussion_enabled=models.BooleanField(default=True)
 students_can_see_grade_level_average=models.BooleanField(default=False)
 parents_can_view_discussion=models.BooleanField(default=True)
 discussion_allow_attachments=models.BooleanField(default=False)
 notify_parents_on_risk=models.CharField(max_length=32,choices=[('manual','Manual'),('after_staff_confirmation','After Staff Confirmation')],default='manual')
 parent_risk_notification_mode = models.CharField(max_length=32, choices=[('auto', 'Auto'), ('after_staff_confirmation', 'After Staff Confirmation'), ('manual', 'Manual')], default='auto')
 show_teacher_contact_to_parents = models.BooleanField(default=False)
 parents_can_view_fees = models.BooleanField(default=True)
 aqi_min_group_size = models.PositiveIntegerField(default=5)
 blocked_words=models.TextField(blank=True,default='')
 class Meta:constraints=[models.UniqueConstraint(fields=['organisation','code'],name='unique_school_code_per_org')]
 def __str__(self):return self.name

class User(AbstractUser):
 ROLE_CHOICES=[('platform_admin','Platform Admin'),('organisation_admin','Organisation admin'),('school_admin','School admin'),('principal','Principal'),('teacher','Teacher'),('student','Student'),('parent','Parent')]
 role=models.CharField(max_length=32,choices=ROLE_CHOICES,default='teacher')
 organisation=models.ForeignKey(Organisation,null=True,blank=True,on_delete=models.PROTECT)
 school=models.ForeignKey(School,null=True,blank=True,on_delete=models.PROTECT)
 avatar_color=models.CharField(max_length=12,default='#8276da')
 avatar_image=models.TextField(blank=True,default='')
 must_change_password=models.BooleanField(default=False,help_text='Force password change on next login')
 def clean(self):
  super().clean()
  if self.school_id and self.school.organisation_id != self.organisation_id:raise ValidationError('School must belong to organisation')
  if not self.is_superuser and self.role != 'platform_admin' and (not self.organisation_id or (self.role not in ('organisation_admin','parent') and not self.school_id)):
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
 section=models.CharField(max_length=40,blank=True,default='',db_index=True)
 grade_level=models.CharField(max_length=40,blank=True)
 curriculum=models.CharField(max_length=120,blank=True,default='')
 teacher=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='classes_taught')
 class Meta:
  constraints=[models.UniqueConstraint(fields=['academic_year','name','section'],name='unique_class_in_year')]
  indexes=[models.Index(fields=['school','academic_year'],name='cls_sch_year_idx')]
 def clean(self):
  if self.academic_year_id and self.school_id and self.academic_year.school_id!=self.school_id:raise ValidationError('Invalid class academic year')
  if self.teacher_id and (self.teacher.role!='teacher' or self.teacher.school_id!=self.school_id):raise ValidationError('Assigned teacher must belong to class school')
 @property
 def display_name(self):
  return f"{self.name} – {self.section}" if self.section else self.name
 def __str__(self):return self.display_name

class Subject(models.Model):
 school=models.ForeignKey(School,on_delete=models.PROTECT)
 name=models.CharField(max_length=100)
 code=models.CharField(max_length=20)
 class Meta:constraints=[models.UniqueConstraint(fields=['school','code'],name='unique_subject_code')]
 def __str__(self):return self.name

class Section(models.Model):
    """Section within a class (e.g. A, B, Rose, Gold)."""
    school_class = models.ForeignKey('SchoolClass', on_delete=models.CASCADE, related_name='class_sections')
    name = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['school_class', 'name'], name='unique_section_per_class')
        ]

    def __str__(self):
        return f"{self.school_class.name} - {self.name}"

class ClassSubject(models.Model):
    """Class-subject assignment defining required/applicable subjects for a class."""
    school_class = models.ForeignKey('SchoolClass', on_delete=models.CASCADE, related_name='class_subjects')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='class_subjects')
    required = models.BooleanField(default=True, help_text='Whether this subject is required for overall student average')
    exempt_rules = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['subject__name']
        constraints = [
            models.UniqueConstraint(fields=['school_class', 'subject'], name='unique_class_subject_assignment')
        ]

    def __str__(self):
        return f"{self.school_class.display_name} - {self.subject.name} ({'Required' if self.required else 'Elective'})" 

class ClassTeacherAssignment(models.Model):
 school_class=models.ForeignKey(SchoolClass,on_delete=models.PROTECT,related_name='class_teacher_assignments')
 teacher=models.ForeignKey(User,on_delete=models.PROTECT,related_name='class_teacher_assignments')
 start_date=models.DateField()
 end_date=models.DateField(null=True,blank=True)
 created_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='+')
 created_at=models.DateTimeField(auto_now_add=True)
 class Meta:
  ordering=['-start_date','-id']
  constraints=[models.UniqueConstraint(fields=['school_class'],condition=models.Q(end_date__isnull=True),name='unique_active_class_teacher')]
 def clean(self):
  if self.school_class_id and self.teacher_id:
   if self.teacher.role!='teacher' or self.teacher.school_id!=self.school_class.school_id:
    raise ValidationError('Assigned teacher must belong to class school')
  if self.end_date and self.start_date and self.end_date<self.start_date:
   raise ValidationError('End date must not precede start date')
 def __str__(self):
  return f"{self.school_class}: {self.teacher.get_full_name() or self.teacher.username}"

class TeachingAssignment(models.Model):
 school=models.ForeignKey(School,on_delete=models.PROTECT,related_name='teaching_assignments')
 teacher=models.ForeignKey(User,on_delete=models.PROTECT,related_name='subject_assignments')
 school_class=models.ForeignKey(SchoolClass,on_delete=models.PROTECT,related_name='teaching_assignments')
 subject=models.ForeignKey(Subject,on_delete=models.PROTECT,related_name='teaching_assignments')
 start_date=models.DateField()
 end_date=models.DateField(null=True,blank=True)
 created_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='+')
 created_at=models.DateTimeField(auto_now_add=True)
 class Meta:
  ordering=['-start_date','-id']
  constraints=[models.UniqueConstraint(fields=['teacher','school_class','subject'],condition=models.Q(end_date__isnull=True),name='unique_active_teaching_assignment')]
 def clean(self):
  if self.school_class_id and self.subject_id:
   if self.school_class.school_id!=self.school_id or self.subject.school_id!=self.school_id:
    raise ValidationError('Class and subject must belong to the same campus')
  if self.teacher_id and self.teacher.school_id!=self.school_id:
   raise ValidationError('Teacher must belong to the assignment campus')
  if self.end_date and self.start_date and self.end_date<self.start_date:
   raise ValidationError('End date must not precede start date')
 def __str__(self):
  return f"{self.teacher.get_full_name() or self.teacher.username}: {self.subject} ({self.school_class})"

class Student(models.Model):
 school=models.ForeignKey(School,on_delete=models.PROTECT)
 admission_number=models.CharField(max_length=35,db_index=True)
 first_name=models.CharField(max_length=100,db_index=True)
 last_name=models.CharField(max_length=100,db_index=True)
 father_name=models.CharField(max_length=100,blank=True,default='',db_index=True)
 mother_name=models.CharField(max_length=100,blank=True,default='')
 guardian_phone=models.CharField(max_length=40,blank=True,default='')
 date_of_birth=models.DateField(null=True,blank=True)
 GENDER = [
     ('male', 'Male'),
     ('female', 'Female'),
     ('other', 'Other'),
     ('not_recorded', 'Not recorded'),
 ]
 gender = models.CharField(max_length=16, choices=GENDER, default='not_recorded', db_index=True)
 user=models.OneToOneField(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='student_record')
 guardians=models.ManyToManyField(User,related_name='wards',blank=True)
 enrolled_on=models.DateField(db_index=True)
 active=models.BooleanField(default=True,db_index=True)
 class Meta:
  constraints=[models.UniqueConstraint(fields=['school','admission_number'],name='unique_admission_per_school')]
  indexes=[
   models.Index(fields=['school','active'],name='student_school_act_idx'),
   models.Index(fields=['school','last_name','first_name'],name='student_school_name_idx'),
  ]
 def clean(self):
  if self.user_id and (self.user.role!='student' or (self.user.organisation_id!=self.school.organisation_id)):
   raise ValidationError('Student account must have student role and matching organisation')
 @property
 def full_name(self):return f'{self.first_name} {self.last_name}'
 def __str__(self):return self.full_name

class Enrollment(models.Model):
 student=models.ForeignKey(Student,on_delete=models.PROTECT,related_name='enrollments')
 school_class=models.ForeignKey(SchoolClass,on_delete=models.PROTECT,related_name='enrollments')
 section=models.ForeignKey('Section',null=True,blank=True,on_delete=models.SET_NULL,related_name='enrollments')
 start_date=models.DateField()
 end_date=models.DateField(null=True,blank=True)
 class Meta:
  constraints=[models.UniqueConstraint(fields=['student','school_class','start_date'],name='unique_enrolment_period'),models.UniqueConstraint(fields=['student'],condition=models.Q(end_date__isnull=True),name='one_active_enrollment_per_student')]
  indexes=[models.Index(fields=['school_class','end_date'],name='enr_class_end_idx')]
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
 created_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='created_assessments')
 teaching_assignment=models.ForeignKey(TeachingAssignment,null=True,blank=True,on_delete=models.SET_NULL,related_name='assessments')
 exam_term=models.ForeignKey('ExamTerm',null=True,blank=True,on_delete=models.SET_NULL,related_name='assessments')
 class Meta:
  indexes=[models.Index(fields=['school_class','subject','date'],name='asmt_cls_sb_dt_idx')]
 def clean(self):
  if self.subject_id and self.school_class_id and self.subject.school_id!=self.school_class.school_id:raise ValidationError('Subject does not belong to class school')
  if self.school_class_id and self.date and not self.school_class.academic_year.start_date<=self.date<=self.school_class.academic_year.end_date:
   raise ValidationError('Assessment date outside class academic year')

class Grade(models.Model):
 RESULT_STATUS = [
     ('recorded', 'Recorded'),
     ('missing', 'Missing'),
     ('pending', 'Pending'),
     ('exempt', 'Exempt'),
     ('absent', 'Absent'),
     ('incomplete', 'Incomplete'),
     ('withdrawn', 'Withdrawn')
 ]
 assessment=models.ForeignKey(Assessment,on_delete=models.PROTECT,related_name='grades')
 student=models.ForeignKey(Student,on_delete=models.PROTECT,related_name='grades')
 marks=models.DecimalField(max_digits=8,decimal_places=2,null=True,blank=True,validators=[MinValueValidator(0)])
 result_status=models.CharField(max_length=16,choices=RESULT_STATUS,default='recorded')
 feedback=models.TextField(blank=True)
 class Meta:
  constraints=[models.UniqueConstraint(fields=['assessment','student'],name='unique_assessment_grade')]
  indexes=[
   models.Index(fields=['student','result_status'],name='grade_std_stat_idx'),
   models.Index(fields=['assessment','result_status'],name='grade_asmt_stat_idx'),
  ]
 def clean(self):
  if self.assessment_id and self.student_id:
   if self.marks is not None and self.marks>self.assessment.max_marks:raise ValidationError('Marks cannot exceed maximum')
   if not Enrollment.objects.filter(student=self.student,school_class=self.assessment.school_class,start_date__lte=self.assessment.date).filter(models.Q(end_date__isnull=True)|models.Q(end_date__gte=self.assessment.date)).exists():raise ValidationError('Student not enrolled in assessed class on assessment date')
 @property
 def percentage(self):
  if self.marks is None:
   return None
  return round(float(self.marks/self.assessment.max_marks*100),1)

class Attendance(models.Model):
 STATUS=[('present','Present'),('absent','Absent'),('late','Late'),('leave','Leave'),('excused','Excused')]
 student=models.ForeignKey(Student,on_delete=models.PROTECT,related_name='attendance')
 school_class=models.ForeignKey(SchoolClass,on_delete=models.PROTECT)
 date=models.DateField()
 status=models.CharField(max_length=16,choices=STATUS)
 note=models.CharField(max_length=255,blank=True)
 recorded_by=models.ForeignKey(User,null=True,blank=True,on_delete=models.SET_NULL,related_name='+')
 created_at=models.DateTimeField(auto_now_add=True,null=True,blank=True)
 updated_at=models.DateTimeField(auto_now=True,null=True,blank=True)
 class Meta:
  constraints=[models.UniqueConstraint(fields=['student','school_class','date'],name='unique_attendance_session')]
  indexes=[
   models.Index(fields=['school_class','date'],name='att_class_date_idx'),
   models.Index(fields=['student','date','status'],name='att_std_date_st_idx'),
   models.Index(fields=['date','status'],name='att_date_status_idx'),
  ]
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

class RiskCriteria(models.Model):
    """Configurable and versioned criteria rules for identifying students requiring academic/attendance review."""
    COMBINE_MODES = [('any', 'Any rule matches'), ('all', 'All rules match'), ('at_least_n', 'At least N rules match')]
    PERIODS = [('current_term', 'Current Term'), ('last_30_days', 'Last 30 Days'), ('whole_year', 'Whole Academic Year')]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='risk_criteria')
    name = models.CharField(max_length=160, default='Standard Risk Criteria')
    active = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=1)
    combine_mode = models.CharField(max_length=24, choices=COMBINE_MODES, default='any')
    min_rules_match = models.PositiveIntegerField(default=1)
    min_data_results = models.PositiveIntegerField(default=3, help_text="Minimum recorded results required to evaluate (INT-003)")
    evaluation_period = models.CharField(max_length=32, choices=PERIODS, default='whole_year')
    rules = models.JSONField(default=list, help_text="Configured rule items: indicator, threshold, period")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-version']
        constraints = [
            models.UniqueConstraint(fields=['school', 'version'], name='unique_risk_criteria_version_per_school')
        ]

    def __str__(self):
        return f"{self.school.name} - {self.name} (v{self.version}){' [ACTIVE]' if self.active else ''}"

class RiskDismissal(models.Model):
    """Audit log of manually dismissed risk flags with required justification reason (INT-007)."""
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='risk_dismissals')
    school = models.ForeignKey(School, on_delete=models.CASCADE)
    dismissed_by = models.ForeignKey(User, on_delete=models.CASCADE)
    reason = models.TextField(help_text="Required rationale for dismissing the flag")
    until_date = models.DateField(null=True, blank=True, help_text="Optional temporary mute date")
    criteria_version = models.PositiveIntegerField(default=1)
    snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

class Notification(models.Model):
 user=models.ForeignKey(User,on_delete=models.CASCADE,related_name='notifications')
 title=models.CharField(max_length=180)
 body=models.CharField(max_length=400)
 read=models.BooleanField(default=False)
 created_at=models.DateTimeField(auto_now_add=True)
 class Meta:
  indexes=[
   models.Index(fields=['user','read','created_at'],name='notif_usr_rd_crt_idx'),
   models.Index(fields=['user','created_at'],name='notif_usr_crt_idx'),
  ]

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
    TEACHER_TYPES=[('class_teacher','Class Teacher'),('subject_teacher','Subject Teacher'),('both','Both')]
    teacher_type=models.CharField(max_length=32,blank=True,default='',choices=TEACHER_TYPES)
    status=models.CharField(max_length=16,choices=STATUS,default='active')
    hired_on=models.DateField()
    terminated_on=models.DateField(null=True,blank=True)
    created_at=models.DateTimeField(auto_now_add=True)
    class Meta:ordering=['last_name','first_name']
    @property
    def full_name(self):return f'{self.first_name} {self.last_name}'.strip()
    def compute_teacher_type(self):
        if not self.user_id:
            return self.teacher_type or ''
        has_class=ClassTeacherAssignment.objects.filter(teacher=self.user,end_date__isnull=True).exists()
        has_subject=TeachingAssignment.objects.filter(teacher=self.user,end_date__isnull=True).exists()
        if has_class and has_subject:return 'both'
        if has_class:return 'class_teacher'
        if has_subject:return 'subject_teacher'
        return self.teacher_type or ''
    def sync_teacher_type(self):
        computed=self.compute_teacher_type()
        if computed!=self.teacher_type:
            self.teacher_type=computed
            StaffMember.objects.filter(pk=self.pk).update(teacher_type=computed)
        return computed
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


class StaffAttendance(models.Model):
    """Daily attendance register for campus staff members."""
    STATUS = [
        ('present', 'Present'),
        ('absent', 'Absent'),
        ('late', 'Late'),
        ('excused', 'Excused'),
    ]
    staff = models.ForeignKey(StaffMember, on_delete=models.CASCADE, related_name='attendance_records')
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='staff_attendance_records')
    date = models.DateField()
    status = models.CharField(max_length=16, choices=STATUS, default='present')
    note = models.CharField(max_length=255, blank=True)
    marked_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date', 'staff__last_name', 'staff__first_name']
        constraints = [
            models.UniqueConstraint(fields=['staff', 'date'], name='unique_staff_attendance_day')
        ]
        indexes = [
            models.Index(fields=['school', 'date'], name='staffatt_school_date_idx'),
            models.Index(fields=['staff', 'date'], name='staffatt_staff_date_idx'),
        ]

    def __str__(self):
        return f"{self.staff.full_name} - {self.date}: {self.status}"

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
        indexes = [
            models.Index(fields=['student', 'status', 'due_date'], name='fee_std_stat_due_idx'),
            models.Index(fields=['status', 'due_date'], name='fee_stat_due_idx'),
            models.Index(fields=['period', 'status'], name='fee_period_stat_idx'),
        ]

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
        indexes = [
            models.Index(fields=['school', 'paid_on'], name='feepay_sch_paid_idx'),
            models.Index(fields=['school', 'status', 'voided'], name='feepay_sch_stat_idx'),
            models.Index(fields=['student', 'paid_on'], name='feepay_std_paid_idx'),
        ]

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
    token = models.CharField(max_length=64, blank=True, default='')
    token_hash = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)
    email = models.EmailField()
    role = models.CharField(max_length=32)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='invitations')
    school = models.ForeignKey(School, null=True, blank=True, on_delete=models.CASCADE, related_name='invitations')
    staff_member = models.ForeignKey('StaffMember', null=True, blank=True, on_delete=models.SET_NULL, related_name='invitations')
    guardian_profile = models.ForeignKey('GuardianProfile', null=True, blank=True, on_delete=models.SET_NULL, related_name='invitations')
    invited_user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='invitations_received')
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
        ('admins', 'Administrators'),
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


# ------------------------------------------------------------------ Configurable Examination Engine
class ExamConfiguration(models.Model):
    """Configurable examination structure and weighting policy for a school, year, and optional class/subject."""
    STATUS_CHOICES = [('draft', 'Draft'), ('published', 'Published'), ('locked', 'Locked')]
    WEIGHTING_MODES = [('equal', 'Equal weighting'), ('custom', 'Custom weighting')]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='exam_configurations')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='exam_configurations')
    school_class = models.ForeignKey(SchoolClass, null=True, blank=True, on_delete=models.SET_NULL, related_name='exam_configurations')
    subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.SET_NULL, related_name='exam_configurations')
    name = models.CharField(max_length=120)
    reporting_scale = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('100.00'), validators=[MinValueValidator(Decimal('1.00'))])
    rounding_precision = models.PositiveSmallIntegerField(default=2, validators=[MaxValueValidator(4)])
    passing_threshold = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('40.00'), validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))])
    subject_weighting_mode = models.CharField(max_length=16, choices=WEIGHTING_MODES, default='equal')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    version = models.PositiveIntegerField(default=1)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-academic_year__start_date', 'name']

    def __str__(self):
        scope = self.school_class.name if self.school_class else self.school.name
        return f"{self.name} ({scope} v{self.version}) [{self.status}]"


class ExamComponent(models.Model):
    """An examination term or component (First Term, Second Term, Final) with configured weightage."""
    configuration = models.ForeignKey(ExamConfiguration, on_delete=models.CASCADE, related_name='components')
    name = models.CharField(max_length=80)
    sequence = models.PositiveSmallIntegerField(default=1)
    weight_percentage = models.DecimalField(max_digits=5, decimal_places=2, validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))])
    default_max_marks = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('100.00'), validators=[MinValueValidator(Decimal('0.01'))])
    exam_session = models.ForeignKey(ExamSession, null=True, blank=True, on_delete=models.SET_NULL, related_name='configurable_components')

    class Meta:
        ordering = ['sequence', 'id']
        constraints = [
            models.UniqueConstraint(fields=['configuration', 'name'], name='unique_component_name_per_config')
        ]

    def __str__(self):
        return f"{self.configuration.name} - {self.name} ({self.weight_percentage}%)"


class ExamComponentSubjectConfig(models.Model):
    """Subject-specific maximum marks and optional/exempt overrides for an examination component."""
    component = models.ForeignKey(ExamComponent, on_delete=models.CASCADE, related_name='subject_configs')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='component_configs')
    maximum_marks = models.DecimalField(max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    is_optional = models.BooleanField(default=False)
    is_exempt = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['component', 'subject'], name='unique_subject_per_exam_component')
        ]

    def __str__(self):
        return f"{self.component.name} - {self.subject.name}: Max {self.maximum_marks}"


class ExamSubjectWeight(models.Model):
    """Configured importance weight for a subject in overall student performance calculation."""
    configuration = models.ForeignKey(ExamConfiguration, on_delete=models.CASCADE, related_name='subject_weights')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='configured_weights')
    weight = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('1.00'), validators=[MinValueValidator(Decimal('0.01'))])

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['configuration', 'subject'], name='unique_subject_weight_per_config')
        ]

    def __str__(self):
        return f"{self.configuration.name} - {self.subject.name} (weight {self.weight})"


class ExamStudentMark(models.Model):
    """Marks obtained by a student for a subject in an examination component."""
    RESULT_STATUS = [
        ('recorded', 'Recorded'),
        ('absent', 'Absent'),
        ('exempt', 'Exempt'),
        ('incomplete', 'Incomplete'),
        ('withdrawn', 'Withdrawn')
    ]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='configurable_exam_marks')
    component = models.ForeignKey(ExamComponent, on_delete=models.CASCADE, related_name='student_marks')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='student_exam_marks')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='student_exam_marks')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='student_exam_marks')
    marks_obtained = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal('0.00'))])
    result_status = models.CharField(max_length=16, choices=RESULT_STATUS, default='recorded')
    is_exempt = models.BooleanField(default=False)
    feedback = models.CharField(max_length=255, blank=True, default='')
    entered_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['student__last_name', 'student__first_name']
        constraints = [
            models.UniqueConstraint(fields=['student', 'component', 'subject'], name='unique_student_mark_per_component_subject')
        ]
        indexes = [
            models.Index(fields=['school_class', 'component', 'subject'], name='mark_cls_comp_sb_idx'),
            models.Index(fields=['academic_year', 'school_class'], name='mark_yr_cls_idx'),
            models.Index(fields=['student', 'academic_year'], name='mark_std_yr_idx'),
        ]

    def clean(self):
        if self.marks_obtained is not None and self.marks_obtained < Decimal('0.00'):
            raise ValidationError('Marks obtained cannot be negative.')
        # Get maximum marks
        subj_cfg = ExamComponentSubjectConfig.objects.filter(component=self.component, subject=self.subject).first()
        max_marks = subj_cfg.maximum_marks if subj_cfg else self.component.default_max_marks
        if self.marks_obtained is not None and self.marks_obtained > max_marks:
            raise ValidationError(f'Marks obtained ({self.marks_obtained}) cannot exceed maximum ({max_marks}).')

    def __str__(self):
        return f"{self.student.full_name} - {self.subject.name} - {self.component.name}: {self.marks_obtained}"


class CalculatedSubjectResult(models.Model):
    """Persisted full-precision normalized subject result across examination components."""
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='calculated_subject_results')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='calculated_results')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='calculated_subject_results')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='calculated_subject_results')
    configuration = models.ForeignKey(ExamConfiguration, on_delete=models.CASCADE, related_name='calculated_subject_results')
    configuration_version = models.PositiveIntegerField(default=1)
    calculation_version = models.PositiveIntegerField(default=1)
    completed = models.BooleanField(default=False)
    final_percentage = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    scaled_marks = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    current_percentage = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    accumulated_contribution = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal('0.0000'))
    assessed_weight = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    term_results = models.JSONField(default=list, blank=True)
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['student', 'subject']
        constraints = [
            models.UniqueConstraint(fields=['student', 'subject', 'configuration'], name='unique_calculated_subject_result')
        ]

    def __str__(self):
        status = f"{self.final_percentage}%" if self.completed else f"Incomplete ({self.current_percentage}%)"
        return f"{self.student.full_name} - {self.subject.name}: {status}"


class CalculatedStudentResult(models.Model):
    """Persisted overall student academic performance across configured subjects."""
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='calculated_student_results')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='calculated_student_results')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='calculated_student_results')
    configuration = models.ForeignKey(ExamConfiguration, on_delete=models.CASCADE, related_name='calculated_student_results')
    configuration_version = models.PositiveIntegerField(default=1)
    calculation_version = models.PositiveIntegerField(default=1)
    weighting_method = models.CharField(max_length=16, default='equal')
    completed = models.BooleanField(default=False)
    overall_percentage = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    current_overall_percentage = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    highest_subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    lowest_subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    missing_subjects_count = models.PositiveIntegerField(default=0)
    passed = models.BooleanField(null=True, blank=True)
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['student']
        constraints = [
            models.UniqueConstraint(fields=['student', 'configuration'], name='unique_calculated_student_result')
        ]

    def __str__(self):
        status = f"{self.overall_percentage}%" if self.completed else f"Pending ({self.current_overall_percentage}%)"
        return f"{self.student.full_name} overall: {status}"


class ResultPublicationHistory(models.Model):
    """Audit snapshot of configuration publications and recalculation events."""
    configuration = models.ForeignKey(ExamConfiguration, on_delete=models.CASCADE, related_name='publication_history')
    version = models.PositiveIntegerField()
    published_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    published_at = models.DateTimeField(auto_now_add=True)
    weights_snapshot = models.JSONField(default=dict)
    summary = models.JSONField(default=dict)

    class Meta:
        ordering = ['-published_at']

    def __str__(self):
        return f"{self.configuration.name} published v{self.version} on {self.published_at}"


class OrganisationRolePolicy(models.Model):
    """Configurable permission overrides and policy switches per role for an organisation.
    Spec Part 5 §4-§7, §11.1-11.2.
    """
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='role_policies')
    role = models.CharField(max_length=32, choices=User.ROLE_CHOICES)
    permissions = models.JSONField(default=dict, help_text="Mapping of permission keys to boolean overrides")
    version = models.PositiveIntegerField(default=1)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['organisation', 'role']
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'role'], name='unique_org_role_policy')
        ]

    DEFAULT_PRINCIPAL_PERMISSIONS = {
        'students.manage': True,
        'structure.manage_classes_subjects': True,
        'structure.manage_academic_years': False,
        'results.approve': True,
        'finance.view_campus': True,
        'fees.view_campus': False,
        'salaries.view_campus': False,
        'staff.promote_terminate': False,
    }

    @classmethod
    def get_effective_policy(cls, organisation, role):
        base = cls.DEFAULT_PRINCIPAL_PERMISSIONS.copy() if role == 'principal' else {}
        if not organisation:
            return base
        policy_obj = cls.objects.filter(organisation=organisation, role=role).first()
        if policy_obj and isinstance(policy_obj.permissions, dict):
            base.update(policy_obj.permissions)
        return base

    def __str__(self):
        return f"{self.organisation.name} - {self.role} (v{self.version})"


class RoleAssignment(models.Model):
    """Institutional role assignments with explicit effective date intervals for campus staffing/transfers.
    Spec Part 5 §17, SEC-018. Historical access terminates when effective_to has passed.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='role_assignments')
    role = models.CharField(max_length=32, choices=User.ROLE_CHOICES)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='role_assignments')
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_from', '-id']

    @property
    def is_currently_active(self):
        today = date.today()
        if self.effective_from > today:
            return False
        if self.effective_to and self.effective_to < today:
            return False
        return True

    def __str__(self):
        active_str = "Active" if self.is_currently_active else f"Ended ({self.effective_to})"
        return f"{self.user.username} as {self.role} @ {self.school.name} ({active_str})"







class ExamStructure(models.Model):
    """Configurable examination structure (terms, weightages, max marks) for an organisation or campus."""
    STATUS_CHOICES = [('draft', 'Draft'), ('published', 'Published'), ('locked', 'Locked')]

    name = models.CharField(max_length=120)
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='exam_structures')
    school = models.ForeignKey(School, null=True, blank=True, on_delete=models.CASCADE, related_name='exam_structures', help_text='Specific campus scope, or null for organisation-wide template')
    academic_year = models.ForeignKey(AcademicYear, null=True, blank=True, on_delete=models.CASCADE, related_name='exam_structures')
    classes = models.ManyToManyField(SchoolClass, blank=True, related_name='exam_structures')
    reporting_scale = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('100.00'), validators=[MinValueValidator(Decimal('1.00'))])
    pass_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('40.00'), validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))])
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    version = models.PositiveIntegerField(default=1)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-academic_year__start_date', 'name']

    def __str__(self):
        scope = self.school.name if self.school else (self.organisation.name if self.organisation else 'Global')
        return f"{self.name} ({scope} v{self.version}) [{self.status}]"


class ExamStructureVersion(models.Model):
    """Immutable JSON snapshot of a published examination structure."""
    structure = models.ForeignKey(ExamStructure, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveIntegerField()
    snapshot = models.JSONField(help_text='Immutable snapshot of terms, contributions, max marks, scale, pass %')
    snapshot_hash = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    published_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-version_number']
        constraints = [
            models.UniqueConstraint(fields=['structure', 'version_number'], name='unique_structure_version')
        ]

    def __str__(self):
        return f"{self.structure.name} v{self.version_number} ({self.snapshot_hash[:8]})"


class ExamTerm(models.Model):
    """Examination term contributing a percentage to final subject result."""
    structure = models.ForeignKey(ExamStructure, on_delete=models.CASCADE, related_name='terms')
    name = models.CharField(max_length=80)
    order = models.PositiveSmallIntegerField(default=1)
    contribution = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('0.0000'), validators=[MinValueValidator(Decimal('0.0000')), MaxValueValidator(Decimal('100.0000'))])
    reporting_period = models.CharField(max_length=80, blank=True, default='')

    class Meta:
        ordering = ['order', 'id']
        constraints = [
            models.UniqueConstraint(fields=['structure', 'name'], name='unique_term_name_per_structure')
        ]

    def __str__(self):
        return f"{self.structure.name} - {self.name} ({self.contribution}%)"


class TermSubjectMax(models.Model):
    """Subject-specific maximum marks for an examination term."""
    term = models.ForeignKey(ExamTerm, on_delete=models.CASCADE, related_name='subject_maxes')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='term_maxes')
    max_marks = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('100.00'), validators=[MinValueValidator(Decimal('0.01'))])

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['term', 'subject'], name='unique_subject_per_term')
        ]

    def __str__(self):
        return f"{self.term.name} - {self.subject.name}: Max {self.max_marks}"


class AssessmentExemption(models.Model):
    """Authorized exemption for an assessment, term, or whole subject."""
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='exemptions')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='assessment_exemptions')
    term = models.ForeignKey(ExamTerm, null=True, blank=True, on_delete=models.CASCADE, related_name='exemptions')
    reason = models.CharField(max_length=255)
    approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    approved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-approved_at']

    def __str__(self):
        t_name = self.term.name if self.term else 'Whole Subject'
        return f"Exemption: {self.enrollment.student.full_name} - {self.subject.name} ({t_name})"


class SubjectResult(models.Model):
    """Calculated and persisted subject result across examination terms."""
    STATUS_CHOICES = [('complete', 'Complete'), ('pending', 'Pending'), ('exempt', 'Exempt')]

    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='subject_results')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='subject_results')
    structure_version = models.ForeignKey(ExamStructureVersion, null=True, blank=True, on_delete=models.SET_NULL, related_name='subject_results')
    final_percentage = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    completed_weight = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('0.0000'))
    remaining_weight = models.DecimalField(max_digits=7, decimal_places=4, default=Decimal('0.0000'))
    accumulated_points = models.DecimalField(max_digits=20, decimal_places=10, default=Decimal('0.0000'))
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='pending')
    source_hash = models.CharField(max_length=64, blank=True, default='')
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['enrollment', 'subject', 'structure_version'], name='unique_enrollment_subject_result')
        ]

    def __str__(self):
        return f"{self.enrollment.student.full_name} - {self.subject.name}: {self.final_percentage}% ({self.status})"


class StudentOverallResult(models.Model):
    """Calculated and persisted overall academic result for a student."""
    STATUS_CHOICES = [('complete', 'Complete'), ('pending', 'Pending'), ('exempt', 'Exempt')]

    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name='overall_results')
    structure_version = models.ForeignKey(ExamStructureVersion, null=True, blank=True, on_delete=models.SET_NULL, related_name='overall_results')
    overall_percentage = models.DecimalField(max_digits=20, decimal_places=10, null=True, blank=True)
    required_subjects = models.PositiveSmallIntegerField(default=0)
    completed_subjects = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='pending')
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['enrollment', 'structure_version'], name='unique_enrollment_overall_result')
        ]

    def __str__(self):
        return f"{self.enrollment.student.full_name} Overall: {self.overall_percentage}% ({self.status})"


class PublishedResult(models.Model):
    """Immutable published result snapshot for verification and historical audit."""
    structure_version = models.ForeignKey(ExamStructureVersion, on_delete=models.PROTECT, related_name='published_results')
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name='published_aqi_results')
    values = models.JSONField(help_text='Immutable snapshot of averages, distributions, and aggregates')
    source_marks_hash = models.CharField(max_length=64)
    published_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    published_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-published_at']

    def __str__(self):
        return f"PublishedResult {self.school.name} - v{self.structure_version.version_number} ({self.published_at})"

# ------------------------------------------------------------------ Moderated Discussion Q&A
class DiscussionThread(models.Model):
    """Class-scoped, subject-based moderated question thread."""
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('answered', 'Answered'),
        ('closed', 'Closed'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='discussion_threads')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='discussion_threads')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='discussion_threads')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='discussion_threads')
    author_student = models.ForeignKey(Student, null=True, blank=True, on_delete=models.SET_NULL, related_name='discussion_threads')
    author_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='authored_discussion_threads')
    title = models.CharField(max_length=200)
    body = models.TextField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='open')
    accepted_post = models.ForeignKey('DiscussionPost', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    is_locked = models.BooleanField(default=False)
    hidden_at = models.DateTimeField(null=True, blank=True)
    hidden_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    hidden_reason = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['school_class', 'subject', 'created_at']),
            models.Index(fields=['school', 'status']),
        ]

    def __str__(self):
        return f"[{self.school_class.display_name} / {self.subject.name}] {self.title}"


class DiscussionPost(models.Model):
    """Threaded answer/reply in a class-scoped subject Q&A thread."""
    thread = models.ForeignKey(DiscussionThread, on_delete=models.CASCADE, related_name='posts')
    author_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='discussion_posts')
    author_student = models.ForeignKey(Student, null=True, blank=True, on_delete=models.SET_NULL, related_name='discussion_posts')
    author_role_label = models.CharField(max_length=64, blank=True, default='')
    body = models.TextField()
    parent_post = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='replies')
    hidden_at = models.DateTimeField(null=True, blank=True)
    hidden_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    hidden_reason = models.CharField(max_length=255, blank=True, default='')
    edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['thread', 'created_at']),
        ]

    def __str__(self):
        return f"Post on {self.thread_id} by {self.author_user.username}"


class DiscussionReport(models.Model):
    """Moderation report filed by a student or staff member."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    ]

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='discussion_reports')
    thread = models.ForeignKey(DiscussionThread, null=True, blank=True, on_delete=models.CASCADE, related_name='reports')
    post = models.ForeignKey(DiscussionPost, null=True, blank=True, on_delete=models.CASCADE, related_name='reports')
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='discussion_reports')
    reason = models.CharField(max_length=255)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='pending')
    handled_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    handled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class DiscussionMute(models.Model):
    """Temporary restriction muting a student from posting in discussions."""
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='discussion_mutes')
    until = models.DateTimeField()
    reason = models.CharField(max_length=255)
    by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


# ==============================================================================
# PSYCHOLOGICAL EVALUATION MODULE (School-Based Behavioural & Developmental Profile)
# ==============================================================================

class EvaluationTemplate(models.Model):
    """Questionnaire template version and administration instructions."""
    version = models.CharField(max_length=20, unique=True, default='1.0')
    name = models.CharField(max_length=200, default='18-Item Student Behavioural & Developmental Framework')
    status = models.CharField(max_length=32, choices=[('active', 'Active'), ('archived', 'Archived')], default='active')
    effective_from = models.DateField(default=date.today)
    effective_to = models.DateField(null=True, blank=True)
    validation_status = models.CharField(max_length=200, default='Developmental observation framework — validation in progress.')
    instructions = models.TextField(
        default="Evaluate the student's observable behaviour during the previous five school days. "
                "Base your responses on actual interactions and classroom observations. "
                "Do not make assumptions about the student's personality, family circumstances, "
                "mental health, or behaviour outside the setting you observed."
    )
    disclaimer = models.TextField(
        default="Based on teacher observations during the selected period. This profile reflects observed behaviours, "
                "not a psychological diagnosis or fixed personality assessment."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'evaluation_templates'
        ordering = ['-version']

    def __str__(self):
        return f"{self.name} (v{self.version})"


class EvaluationDimension(models.Model):
    """The 6 core behavioural and developmental dimensions."""
    template = models.ForeignKey(EvaluationTemplate, on_delete=models.CASCADE, related_name='dimensions')
    dimension_key = models.CharField(max_length=50)
    dimension_name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    display_order = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = 'evaluation_dimensions'
        ordering = ['display_order']
        constraints = [
            models.UniqueConstraint(fields=['template', 'dimension_key'], name='unique_dim_key_per_template')
        ]

    def __str__(self):
        return f"{self.dimension_name} (v{self.template.version})"


class EvaluationQuestion(models.Model):
    """Positively framed observation item within a dimension."""
    dimension = models.ForeignKey(EvaluationDimension, on_delete=models.CASCADE, related_name='questions')
    question_text = models.TextField()
    display_order = models.PositiveIntegerField(default=1)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = 'evaluation_questions'
        ordering = ['display_order']

    def __str__(self):
        return f"Q{self.display_order}: {self.question_text[:60]}"


class WeeklyEvaluation(models.Model):
    """Weekly teacher-led behavioural observation record for a student."""
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('revised', 'Revised'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='weekly_evaluations')
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conducted_weekly_evaluations')
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='weekly_evaluations')
    campus = models.ForeignKey(School, null=True, blank=True, on_delete=models.SET_NULL, related_name='campus_weekly_evaluations')
    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name='weekly_evaluations')
    section = models.ForeignKey(Section, null=True, blank=True, on_delete=models.SET_NULL, related_name='weekly_evaluations')
    subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.SET_NULL, related_name='weekly_evaluations')
    observation_context = models.CharField(max_length=120, default='Homeroom / Classroom Observation')
    evaluation_week = models.CharField(max_length=32, db_index=True)
    template_version = models.CharField(max_length=20, default='1.0')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    # Optional teacher reflections
    strengths_observed = models.TextField(blank=True, default='')
    support_areas = models.TextField(blank=True, default='')
    support_action = models.TextField(blank=True, default='')

    # Strictly internal notes (confidential, never exposed to students)
    teacher_notes = models.TextField(blank=True, default='', help_text='Confidential internal notes')

    # Student-visible feedback (approved for viewing on publication)
    student_visible_feedback = models.TextField(blank=True, default='', help_text='Approved constructive feedback')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'weekly_evaluations'
        ordering = ['-evaluation_week', '-updated_at']
        indexes = [
            models.Index(fields=['student', 'evaluation_week']),
            models.Index(fields=['school', 'evaluation_week']),
            models.Index(fields=['school_class', 'evaluation_week']),
            models.Index(fields=['teacher', 'evaluation_week']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['teacher', 'student', 'evaluation_week', 'observation_context'],
                name='unique_teacher_eval_context_week'
            )
        ]

    def __str__(self):
        return f"WeeklyEvaluation {self.student.full_name} by {self.teacher.username} ({self.evaluation_week})"


class EvaluationResponse(models.Model):
    """Response to an observation item (1-5 or null for unobserved)."""
    evaluation = models.ForeignKey(WeeklyEvaluation, on_delete=models.CASCADE, related_name='responses')
    question = models.ForeignKey(EvaluationQuestion, on_delete=models.CASCADE, related_name='responses')
    response_value = models.PositiveSmallIntegerField(
        null=True, blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    observation_note = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'evaluation_responses'
        constraints = [
            models.UniqueConstraint(fields=['evaluation', 'question'], name='unique_response_per_question')
        ]

    def __str__(self):
        return f"Eval #{self.evaluation_id} Q#{self.question_id}: {self.response_value}"


class EvaluationDomainScore(models.Model):
    """Calculated 0-100 normalized score per dimension."""
    SCORE_STATUS_CHOICES = [
        ('valid', 'Valid'),
        ('insufficient', 'Insufficient observations'),
    ]

    evaluation = models.ForeignKey(WeeklyEvaluation, on_delete=models.CASCADE, related_name='domain_scores')
    dimension = models.ForeignKey(EvaluationDimension, on_delete=models.CASCADE, related_name='domain_scores')
    valid_response_count = models.PositiveSmallIntegerField(default=0)
    average_response = models.FloatField(null=True, blank=True)
    normalized_score = models.FloatField(null=True, blank=True)
    score_status = models.CharField(max_length=24, choices=SCORE_STATUS_CHOICES, default='insufficient')

    class Meta:
        db_table = 'evaluation_domain_scores'
        constraints = [
            models.UniqueConstraint(fields=['evaluation', 'dimension'], name='unique_domain_score_per_eval')
        ]

    def __str__(self):
        return f"Score {self.dimension.dimension_name}: {self.normalized_score} ({self.score_status})"


class EvaluationPublication(models.Model):
    """Publication approval status for releasing weekly profile to student view."""
    VISIBILITY_CHOICES = [
        ('published', 'Published'),
        ('unpublished', 'Unpublished'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='evaluation_publications')
    evaluation_week = models.CharField(max_length=32, db_index=True)
    published_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='published_evaluations')
    published_at = models.DateTimeField(auto_now_add=True)
    visibility_status = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='published')
    notes = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'evaluation_publications'
        constraints = [
            models.UniqueConstraint(fields=['student', 'evaluation_week'], name='unique_student_publication_week')
        ]

    def __str__(self):
        return f"Publication {self.student.full_name} ({self.evaluation_week}) - {self.visibility_status}"


class EvaluationAuditLog(models.Model):
    """Comprehensive audit trail for compliance, safeguarding, and revisions."""
    actor = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='evaluation_audit_logs')
    action = models.CharField(max_length=40, db_index=True)
    record_type = models.CharField(max_length=60)
    record_id = models.CharField(max_length=60)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    relevant_metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'evaluation_audit_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp}] {self.actor}: {self.action} on {self.record_type} #{self.record_id}"


class EvaluationSafeguardingReferral(models.Model):
    """Restricted safeguarding escalation workflow independent from evaluation scoring."""
    URGENCY_CHOICES = [
        ('standard', 'Standard Referral'),
        ('high', 'High Concern'),
        ('immediate', 'Immediate Safeguarding Concern'),
    ]
    STATUS_CHOICES = [
        ('submitted', 'Submitted'),
        ('under_review', 'Under Review'),
        ('action_taken', 'Action Taken'),
        ('closed', 'Closed'),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='safeguarding_referrals')
    evaluation = models.ForeignKey(WeeklyEvaluation, null=True, blank=True, on_delete=models.SET_NULL, related_name='safeguarding_referrals')
    referred_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='safeguarding_referrals_made')
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='safeguarding_referrals')
    concern_description = models.TextField()
    urgency_level = models.CharField(max_length=20, choices=URGENCY_CHOICES, default='standard')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='submitted')
    designated_lead_notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'evaluation_safeguarding_referrals'
        ordering = ['-created_at']

    def __str__(self):
        return f"Safeguarding Referral for {self.student.full_name} ({self.urgency_level})"


class GuardianProfile(models.Model):
    """Explicit parent/guardian identity record per organisation."""
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE, related_name='guardian_profiles')
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='guardian_profile')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(db_index=True)
    mobile = models.CharField(max_length=32, db_index=True)
    alternate_phone = models.CharField(max_length=32, blank=True, default='')
    address = models.TextField(blank=True, default='')
    preferred_language = models.CharField(max_length=8, choices=[('en', 'English'), ('ur', 'Urdu')], default='en')
    occupation = models.CharField(max_length=120, blank=True, default='')
    emergency_contact = models.CharField(max_length=120, blank=True, default='')

    identity_type = models.CharField(max_length=20, choices=[('cnic', 'CNIC'), ('passport', 'Passport'), ('other', 'Other')], default='cnic')
    identity_number_encrypted = models.TextField(help_text="Encrypted identity number at rest")
    identity_last4 = models.CharField(max_length=8)
    identity_hash = models.CharField(max_length=64, db_index=True, help_text="HMAC-SHA256 hash for duplicate detection")

    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'guardian_profiles'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['organisation', 'identity_hash'], name='unique_guardian_identity_per_org')
        ]

    def __str__(self):
        return f"{self.full_name} ({self.masked_identity})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def masked_identity(self):
        from core.services.guardian_crypto import mask_identity_number
        return mask_identity_number(self.identity_type, self.identity_last4)


class GuardianRelationship(models.Model):
    """M:N link between Guardian and Student with explicit permissions and audit."""
    guardian = models.ForeignKey(GuardianProfile, on_delete=models.CASCADE, related_name='relationships')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='guardian_relationships')
    relationship = models.CharField(max_length=20, choices=[('father', 'Father'), ('mother', 'Mother'), ('guardian', 'Guardian'), ('other', 'Other')], default='guardian')
    is_primary = models.BooleanField(default=True)

    can_view_academics = models.BooleanField(default=True)
    can_view_attendance = models.BooleanField(default=True)
    can_view_homework = models.BooleanField(default=True)
    can_view_fees = models.BooleanField(default=True)
    receive_notifications = models.BooleanField(default=True)

    status = models.CharField(max_length=20, choices=[('active', 'Active'), ('suspended', 'Suspended'), ('revoked', 'Revoked')], default='active', db_index=True)
    start_date = models.DateField(default=date.today)
    end_date = models.DateField(null=True, blank=True)
    verified_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_note = models.TextField(blank=True, default='')

    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'guardian_relationships'
        ordering = ['-is_primary', '-created_at']
        indexes = [
            models.Index(fields=['guardian', 'student']),
            models.Index(fields=['status', 'start_date', 'end_date']),
        ]

    def __str__(self):
        return f"{self.guardian.full_name} -> {self.student.full_name} ({self.relationship}) [{self.status}]"


class ParentNotificationPreference(models.Model):
    """Parent opt-in/opt-out preferences."""
    guardian = models.ForeignKey(GuardianProfile, on_delete=models.CASCADE, related_name='notification_preferences')
    notification_type = models.CharField(max_length=40, db_index=True)
    in_app = models.BooleanField(default=True)
    email = models.BooleanField(default=True)

    class Meta:
        db_table = 'parent_notification_preferences'
        constraints = [
            models.UniqueConstraint(fields=['guardian', 'notification_type'], name='unique_pref_per_guardian_type')
        ]


class ParentRiskAlert(models.Model):
    """Lifecycle tracking for student risk conditions alerted to parents."""
    STATUS_CHOICES = [
        ('active', 'Active Alert'),
        ('read', 'Read'),
        ('acknowledged', 'Acknowledged'),
        ('resolved', 'Resolved'),
    ]
    CONFIRMATION_CHOICES = [
        ('pending', 'Pending Confirmation'),
        ('confirmed', 'Confirmed'),
        ('cancelled', 'Cancelled'),
    ]

    guardian = models.ForeignKey(GuardianProfile, on_delete=models.CASCADE, related_name='risk_alerts')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='parent_risk_alerts')
    school = models.ForeignKey(School, on_delete=models.CASCADE)
    condition_type = models.CharField(max_length=32)
    subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.SET_NULL)
    condition_key = models.CharField(max_length=64, db_index=True)
    title = models.CharField(max_length=200)
    evidence_text = models.TextField()
    class_teacher_name = models.CharField(max_length=120)
    subject_teacher_name = models.CharField(max_length=120, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    read_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_note = models.CharField(max_length=255, blank=True, default='')
    staff_confirmation_status = models.CharField(max_length=20, choices=CONFIRMATION_CHOICES, default='confirmed')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'parent_risk_alerts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['guardian', 'student', 'status']),
            models.Index(fields=['student', 'condition_key', 'status']),
        ]

    @property
    def alert_type(self):
        return self.condition_type

    def __str__(self):
        return f"RiskAlert: {self.student.full_name} ({self.condition_key}) -> {self.guardian.full_name} [{self.status}]"


class ParentCallbackRequest(models.Model):
    """Parent meeting / call-back request sent to the child's class teacher."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('declined', 'Declined'),
    ]

    guardian = models.ForeignKey(GuardianProfile, on_delete=models.CASCADE, related_name='callback_requests')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='callback_requests')
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='callback_requests_received')
    topic = models.CharField(max_length=120)
    message = models.TextField(blank=True, default='')
    preferred_time = models.CharField(max_length=80, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    response_notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'parent_callback_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f"CallbackRequest: {self.guardian.full_name} -> {self.teacher.username} regarding {self.student.full_name}"


# =============================================================================
# PLATFORM-LEVEL LANDING PAGE & CMS CONTENT MODELS (UNSCOPED)
# =============================================================================

class LandingHeroSlide(models.Model):
    """
    Platform-level hero slides for public landing page.
    Unscoped (no school_id). Managed exclusively by Platform Owner / Admin.
    """
    title = models.CharField(max_length=255, blank=True, default='')
    title_ur = models.CharField(max_length=255, blank=True, default='')
    subtitle = models.TextField(blank=True, default='')
    subtitle_ur = models.TextField(blank=True, default='')
    image_url = models.CharField(max_length=500, blank=True, default='')
    mobile_image_url = models.CharField(max_length=500, blank=True, default='')
    cta_text = models.CharField(max_length=100, blank=True, default='')
    cta_text_ur = models.CharField(max_length=100, blank=True, default='')
    cta_link = models.CharField(max_length=500, blank=True, default='')
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'landing_hero_slides'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.title or f"Slide #{self.id}"


class LandingCoreFeature(models.Model):
    """
    Platform-level 6 core features.
    Unscoped. Managed exclusively by Platform Owner.
    """
    title = models.CharField(max_length=255)
    title_ur = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    description_ur = models.TextField(blank=True, default='')
    icon_key = models.CharField(max_length=100, default='academic')
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'landing_core_features'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.title


class LandingFAQ(models.Model):
    """
    Platform-level FAQs.
    Unscoped. Managed exclusively by Platform Owner.
    """
    question = models.CharField(max_length=500)
    question_ur = models.CharField(max_length=500, blank=True, default='')
    answer = models.TextField()
    answer_ur = models.TextField(blank=True, default='')
    category = models.CharField(max_length=100, blank=True, default='general')
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'landing_faqs'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return self.question


class LandingPlan(models.Model):
    """
    Platform-level subscription packages/plans (maps old packages table).
    Unscoped. Managed exclusively by Platform Owner.
    """
    name = models.CharField(max_length=100)
    name_ur = models.CharField(max_length=100, blank=True, default='')
    slug = models.SlugField(max_length=100, unique=True)
    tagline = models.CharField(max_length=255, blank=True, default='')
    tagline_ur = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    description_ur = models.TextField(blank=True, default='')
    price_usd_per_student = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('3.60'))
    price_pkr_per_student = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('499.00'))
    student_limit = models.PositiveIntegerField(default=0)
    campus_limit = models.PositiveIntegerField(default=1)
    interval = models.CharField(max_length=20, default='monthly')
    trial_days = models.PositiveSmallIntegerField(default=30)
    features = models.JSONField(default=list, blank=True)
    features_ur = models.JSONField(default=list, blank=True)
    is_featured = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'landing_plans'
        ordering = ['sort_order', 'id']

    def __str__(self):
        return f"{self.name} (${self.price_usd_per_student}/student)"


class LandingSiteSetting(models.Model):
    """
    Platform-level global site settings for landing page.
    Unscoped. Managed exclusively by Platform Owner.
    """
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(blank=True, default='')
    value_ur = models.TextField(blank=True, default='')
    description = models.CharField(max_length=255, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'landing_site_settings'
        ordering = ['key']

    def __str__(self):
        return self.key


class LandingContactMessage(models.Model):
    """
    Inquiries submitted from the public landing page contact form / modal.
    Unscoped. Visible to Platform Admin only.
    No personal data logged in application logs.
    """
    STATUS_CHOICES = [
        ('new', 'New'),
        ('reviewed', 'Reviewed'),
        ('archived', 'Archived'),
    ]

    name = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=50, blank=True, default='')
    company = models.CharField(max_length=255, blank=True, default='')
    subject = models.CharField(max_length=255, blank=True, default='')
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'landing_contact_messages'
        ordering = ['-created_at']

    def __str__(self):
        return f"Contact: {self.name} <{self.email}> - {self.subject or 'General Inquiry'}"


class BackgroundJob(models.Model):
    """Asynchronous task queue for heavy operations (PDFs, challans, imports, AQI)."""
    JOB_TYPES = [
        ('bulk_challan', 'Bulk Fee Challan Generation'),
        ('report_card_pdf', 'Report Card PDFs'),
        ('csv_import', 'CSV Data Import'),
        ('aqi_recalculation', 'AQI Campus Recalculation'),
        ('bulk_notifications', 'Bulk Notification Dispatch'),
    ]
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]

    organisation = models.ForeignKey('Organisation', on_delete=models.CASCADE, null=True, blank=True, related_name='background_jobs')
    school = models.ForeignKey('School', on_delete=models.CASCADE, null=True, blank=True, related_name='background_jobs')
    job_type = models.CharField(max_length=40, choices=JOB_TYPES, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued', db_index=True)
    payload = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=3)
    error_message = models.TextField(blank=True, default='')
    scheduled_at = models.DateTimeField(default=timezone.now, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['scheduled_at', 'id']
        indexes = [
            models.Index(fields=['status', 'scheduled_at'], name='job_status_sched_idx'),
            models.Index(fields=['school', 'status'], name='job_school_status_idx'),
            models.Index(fields=['organisation', 'status'], name='job_org_status_idx'),
        ]

    def __str__(self):
        return f"Job #{self.id} [{self.job_type}] - {self.status}"


# ------------------------------------------------------------------ Subscriptions, Plans & Entitlements

class Plan(models.Model):
    """
    Platform-level subscription tier definition (Unscoped).
    Managed exclusively by Platform Admin. Prices and details are data, not hardcoded.
    """
    code = models.CharField(max_length=50, unique=True, db_index=True)  # 'standard', 'premium'
    name = models.CharField(max_length=100)
    name_ur = models.CharField(max_length=100, blank=True, default='')
    tagline = models.CharField(max_length=255, blank=True, default='')
    tagline_ur = models.CharField(max_length=255, blank=True, default='')
    description = models.TextField(blank=True, default='')
    description_ur = models.TextField(blank=True, default='')
    price_usd_per_student = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    price_pkr_per_student = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'id']

    def __str__(self):
        return f"{self.name} (${self.price_usd_per_student}/Rs {self.price_pkr_per_student})"


class FeatureCatalog(models.Model):
    """
    Master catalog of system capabilities and feature keys (Unscoped).
    Defines tier availability, categorization, and readiness status.
    """
    STATUS_CHOICES = [
        ('available', 'Available'),
        ('beta', 'Beta'),
        ('coming_soon', 'Coming Soon'),
    ]
    CATEGORY_CHOICES = [
        ('core', 'Core Administration'),
        ('academics', 'Academics & Examination'),
        ('analytics', 'Analytics & Early Intervention'),
        ('finance', 'Fees & Finance'),
        ('operations', 'Operations & Logistics'),
        ('safeguarding', 'Wellbeing & Safeguarding'),
    ]
    key = models.CharField(max_length=80, primary_key=True)
    name = models.CharField(max_length=150)
    name_ur = models.CharField(max_length=150, blank=True, default='')
    description = models.TextField(blank=True, default='')
    description_ur = models.TextField(blank=True, default='')
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='core')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    is_premium_only = models.BooleanField(default=False)
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'key']

    def __str__(self):
        return f"{self.name} [{self.key}] ({self.status})"


class PlanFeature(models.Model):
    """
    Binding between a Plan and a FeatureKey with optional limits (Unscoped).
    """
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name='plan_features')
    feature_key = models.CharField(max_length=80, db_index=True)
    is_included = models.BooleanField(default=True)
    limits = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('plan', 'feature_key')]
        ordering = ['plan', 'feature_key']

    def __str__(self):
        return f"{self.plan.code} -> {self.feature_key} ({'included' if self.is_included else 'excluded'})"


class BillingPeriod(models.Model):
    """
    Configurable billing period and term discount tier (DATA, editable by platform admin).
    Placeholder defaults:
    - 1 month: 0.00% discount
    - 4 months: 5.00% discount
    - 8 months: 10.00% discount
    - 12 months: 15.00% discount
    """
    months = models.PositiveSmallIntegerField(unique=True, db_index=True)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['months']
        verbose_name = 'Billing Period'
        verbose_name_plural = 'Billing Periods'

    def __str__(self):
        return f"{self.months} Month(s) - {self.discount_percentage}% discount"

    @classmethod
    def get_active_periods(cls):
        """Returns active billing periods or seeds defaults if none exist."""
        periods = list(cls.objects.filter(is_active=True).order_by('months'))
        if not periods:
            defaults = [
                (1, Decimal('0.00'), 1),
                (6, Decimal('5.00'), 2),
                (12, Decimal('10.00'), 3),
            ]
            for m, disc, order in defaults:
                p, _ = cls.objects.get_or_create(
                    months=m,
                    defaults={'discount_percentage': disc, 'is_active': True, 'display_order': order}
                )
                periods.append(p)
            periods.sort(key=lambda x: x.months)
        return periods


class PlatformBillingSettings(models.Model):
    """
    Global platform-level billing parameters and offline bank deposit details (Unscoped).
    Bank account details are entered exclusively by platform admin (never hardcoded).
    """
    DEFAULT_BASIC_ACCESS_FEATURES = [
        'school_setup',
        'people_accounts',
        'authentication',
        'password_change',
        'profile_view',
        'subscription_management',
        'order_submission',
        'support_contact',
        'compliance_export',
        'basic_reports_csv',
        'english_urdu',
    ]

    bank_name = models.CharField(max_length=150, blank=True, default='')
    account_title = models.CharField(max_length=150, blank=True, default='')
    account_number = models.CharField(max_length=80, blank=True, default='')
    iban = models.CharField(max_length=80, blank=True, default='')
    branch_code = models.CharField(max_length=40, blank=True, default='')
    swift_bic = models.CharField(max_length=40, blank=True, default='')
    payment_instructions_en = models.TextField(blank=True, default='')
    payment_instructions_ur = models.TextField(blank=True, default='')
    pending_grace_days = models.PositiveSmallIntegerField(default=3)
    past_due_grace_days = models.PositiveSmallIntegerField(default=7)
    basic_access_features = models.JSONField(default=list, blank=True)
    exchange_rate_note_en = models.CharField(
        max_length=255,
        default='PKR amounts are approximate and based on standard currency conversion estimates.'
    )
    exchange_rate_note_ur = models.CharField(
        max_length=255,
        default='روپے کی رقم تخمینی ہے اور معیاری شرح تبادلہ کے تخمینے پر مبنی ہے۔'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        verbose_name = 'Platform Billing Settings'
        verbose_name_plural = 'Platform Billing Settings'

    @classmethod
    def get_settings(cls):
        obj, created = cls.objects.get_or_create(
            id=1,
            defaults={'basic_access_features': list(cls.DEFAULT_BASIC_ACCESS_FEATURES)}
        )
        if not obj.basic_access_features:
            obj.basic_access_features = list(cls.DEFAULT_BASIC_ACCESS_FEATURES)
            obj.save(update_fields=['basic_access_features'])
        return obj

    @classmethod
    def get_solo(cls):
        return cls.get_settings()

    def __str__(self):
        return f"Platform Billing Settings (Grace: {self.past_due_grace_days}d)"


class SchoolSubscription(models.Model):
    """
    Tenant-scoped active subscription record for an individual school.
    PostgreSQL Row Level Security (RLS) enabled.
    """
    STATUS_CHOICES = [
        ('no_plan', 'No Plan'),
        ('active', 'Active'),
        ('past_due', 'Past Due'),
        ('suspended', 'Suspended'),
    ]
    school = models.OneToOneField('School', on_delete=models.CASCADE, related_name='subscription')
    plan = models.ForeignKey(Plan, null=True, blank=True, on_delete=models.PROTECT, related_name='school_subscriptions')
    status = models.CharField(max_length=25, choices=STATUS_CHOICES, default='no_plan', db_index=True)
    current_period_start = models.DateTimeField(null=True, blank=True)
    paid_until = models.DateTimeField(null=True, blank=True)
    grace_until = models.DateTimeField(null=True, blank=True)
    student_count_at_last_invoice = models.PositiveIntegerField(default=0)
    pending_downgrade_to_plan = models.ForeignKey(Plan, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['school', 'status'], name='sub_school_status_idx'),
            models.Index(fields=['status', 'paid_until'], name='sub_status_paid_idx'),
        ]

    def __str__(self):
        plan_name = self.plan.name if self.plan else 'No Plan'
        return f"{self.school.name} - {plan_name} [{self.status}]"


class SubscriptionOrder(models.Model):
    """
    Tenant-scoped subscription order for card payments (Paddle/Provider)
    or offline manual bank deposits.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]
    order_number = models.CharField(max_length=40, unique=True, db_index=True)
    school = models.ForeignKey('School', on_delete=models.CASCADE, related_name='subscription_orders')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='orders')
    billing_months = models.PositiveSmallIntegerField()
    student_count = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    upgrade_credit_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0.00'))
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=5, choices=[('USD', 'USD'), ('PKR', 'PKR')], default='USD')
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    card_brand = models.CharField(max_length=30, blank=True, default='')
    card_last4 = models.CharField(max_length=4, blank=True, default='')
    provider = models.CharField(max_length=40, default='fake', db_index=True)
    provider_reference = models.CharField(max_length=150, blank=True, default='', db_index=True)
    provider_event_id = models.CharField(max_length=150, blank=True, default='', db_index=True)
    checkout_url = models.TextField(blank=True, default='')
    payment_reference = models.CharField(max_length=100, blank=True, default='')
    paid_on = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True, default='')
    payment_notes = models.TextField(blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    submitted_by = models.ForeignKey('User', null=True, blank=True, on_delete=models.SET_NULL, related_name='submitted_subscription_orders')
    reviewed_by = models.ForeignKey('User', null=True, blank=True, on_delete=models.SET_NULL, related_name='reviewed_subscription_orders')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['school', 'status'], name='order_school_status_idx'),
            models.Index(fields=['status', 'created_at'], name='order_status_created_idx'),
            models.Index(fields=['provider', 'provider_reference'], name='order_provider_ref_idx'),
        ]

    def __str__(self):
        return f"{self.order_number} ({self.school.name}) - {self.amount} {self.currency} [{self.status}]"


class SchoolFeatureOverride(models.Model):
    """
    Tenant-scoped per-school feature toggle granted or revoked by Platform Admin.
    Used for live demonstrations, prospective customer trials, or enterprise pilots.
    """
    school = models.ForeignKey('School', on_delete=models.CASCADE, related_name='feature_overrides')
    feature_key = models.CharField(max_length=80, db_index=True)
    is_granted = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=255)
    granted_by = models.ForeignKey('User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('school', 'feature_key')]
        ordering = ['school', 'feature_key']

    def __str__(self):
        action = "GRANT" if self.is_granted else "REVOKE"
        return f"{self.school.name}: {action} {self.feature_key} ({self.reason})"


class SubscriptionEvent(models.Model):
    """
    Tenant-scoped immutable audit log of all subscription status transitions,
    order approvals, and platform admin overrides.
    """
    EVENT_CHOICES = [
        ('order_submitted', 'Order Submitted'),
        ('order_approved', 'Order Approved'),
        ('order_rejected', 'Order Rejected'),
        ('status_changed', 'Status Changed'),
        ('upgraded', 'Upgraded Plan'),
        ('downgraded', 'Downgraded Plan'),
        ('downgrade_scheduled', 'Downgrade Scheduled'),
        ('past_due', 'Past Due'),
        ('expired_to_no_plan', 'Expired to No Plan'),
        ('suspended', 'Suspended'),
        ('reinstated', 'Reinstated'),
        ('override_applied', 'Override Applied'),
    ]
    school = models.ForeignKey('School', on_delete=models.CASCADE, related_name='subscription_events')
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES, db_index=True)
    from_status = models.CharField(max_length=30, blank=True, default='')
    to_status = models.CharField(max_length=30, blank=True, default='')
    from_plan = models.CharField(max_length=50, blank=True, default='')
    to_plan = models.CharField(max_length=50, blank=True, default='')
    actor = models.ForeignKey('User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    metadata = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['school', 'created_at'], name='sub_evt_school_created_idx'),
            models.Index(fields=['event_type', 'created_at'], name='sub_evt_type_created_idx'),
        ]

    def __str__(self):
        return f"[{self.event_type}] {self.school.name} ({self.from_status} -> {self.to_status}) at {self.created_at}"
