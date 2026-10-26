from django.contrib.auth import authenticate,login,logout
from django.db import transaction
from datetime import date,timedelta
from copy import copy
from django.core.exceptions import ValidationError as ModelValidationError
import os
import csv
from django.views.decorators.csrf import csrf_protect
from core.services.access import (ensure_action, queryset_for, schools_scope, students_scope, classes_scope, require_visible, validate_related, IMMUTABLE_RELATIONS)
from core.services.audit import record_event
from django.db.models import Avg,Count,Q
from django.http import JsonResponse,HttpResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework import serializers,status,viewsets
from rest_framework.decorators import api_view,permission_classes,throttle_classes
from rest_framework.permissions import AllowAny,IsAuthenticated
from rest_framework.throttling import AnonRateThrottle
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError as APIValidationError
from .models import *
import csv

@require_GET
def health(request):return JsonResponse({'status':'ok','service':'optimus-orien'})

@api_view(['GET'])
@permission_classes([AllowAny])
def csrf(request):
 from django.middleware.csrf import get_token
 return Response({'csrfToken':get_token(request)})

class LoginThrottle(AnonRateThrottle):
 scope='login'

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def _signin_api(request):
 username=(request.data.get('username') or '').strip()
 password=request.data.get('password') or ''
 admin_env_user=(os.getenv('INITIAL_ADMIN_USERNAME') or '').strip()
 admin_env_pass=(os.getenv('INITIAL_ADMIN_PASSWORD') or '').strip()
 if admin_env_user and admin_env_pass and username.lower()==admin_env_user.lower() and password==admin_env_pass:
  try:
   from core.services.bootstrap import ensure_admin
   ensure_admin(username=admin_env_user,password=admin_env_pass)
  except Exception as exc:
   import logging
   logging.getLogger('core').error(f'Initial admin bootstrap during login failed: {exc}')
 user=authenticate(request,username=username,password=password)
 if not user or not user.is_active:return Response({'detail':'Invalid credentials'},status=400)
 login(request,user)
 from django.middleware.csrf import get_token
 payload=user_payload(user)
 payload['csrfToken']=get_token(request)
 return Response(payload)

# DRF's @api_view marks its view CSRF-exempt. Protect an independent Django
# wrapper instead so an anonymous login POST is checked even before a session
# exists. The DRF endpoint inside continues to apply its authentication throttle.
@csrf_protect
def signin(request):
 return _signin_api(request)

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def _register_api(request):
 """
 Public registration for educational institutions, campuses, and administrators.
 Aligned with OPTIMUS ORIEN Part 1, Part 2 (ORG-001/002), and Part 5 §18.
 Accepts:
 - first_name, last_name, email, username, password
 - organisation_name, school_name (optional), city (optional), country (optional)
 - role (defaults to 'organisation_admin', also allows 'school_admin' or 'teacher')
 Creates Organisation, Campus/School, draft SchoolConfiguration, User, and logs the user in.
 Returns user payload with rotated CSRF token.
 """
 from django.utils.text import slugify
 from django.utils.crypto import get_random_string
 from django.contrib.auth.password_validation import validate_password
 from django.core.exceptions import ValidationError as DjangoValidationError
 from django.middleware.csrf import get_token

 data=request.data or {}
 first_name=(data.get('first_name') or '').strip()
 last_name=(data.get('last_name') or '').strip()
 email=(data.get('email') or '').strip().lower()
 username=(data.get('username') or '').strip()
 password=data.get('password') or ''
 org_name=(data.get('organisation_name') or '').strip()
 school_name=(data.get('school_name') or '').strip()
 city=(data.get('city') or '').strip()
 country=(data.get('country') or 'PK').strip().upper()
 role=(data.get('role') or 'organisation_admin').strip()

 if not first_name or not last_name or not email or not username or not password or not org_name:
  return Response({'detail':'First name, last name, email, username, password, and organisation name are required.'},status=400)

 VALID_ROLES=['organisation_admin','school_admin','teacher']
 if role not in VALID_ROLES:
  return Response({'detail':f'Role must be one of: {", ".join(VALID_ROLES)}'},status=400)

 if User.objects.filter(username__iexact=username).exists():
  return Response({'detail':'This username is already taken. Please choose another.'},status=400)

 if email and User.objects.filter(email__iexact=email).exists():
  return Response({'detail':'An account with this email address is already registered. Please sign in.'},status=400)

 try:
  validate_password(password)
 except DjangoValidationError as err:
  return Response({'detail':' '.join(err.messages)},status=400)

 with transaction.atomic():
  base_slug=slugify(org_name)[:40] or 'edu-org'
  slug=base_slug
  counter=1
  while Organisation.objects.filter(code=slug).exists():
   slug=f"{base_slug}-{counter}"
   counter+=1

  org=Organisation.objects.create(
   name=org_name,
   code=slug,
   allow_org_admin_student_access=True
  )

  campus_display=school_name or f"{org_name} - Main Campus"
  campus_code=f"CAMPUS-{get_random_string(4).upper()}"
  school=School.objects.create(
   organisation=org,
   name=campus_display,
   code=campus_code,
   city=city,
   attendance_alert_threshold=80,
   grade_alert_threshold=60,
  )

  from .models import SchoolConfiguration
  config,_=SchoolConfiguration.objects.get_or_create(school=school)
  if country and len(country)==2:
   config.country=country
  config.status='draft'
  config.save()

  new_user=User(
   username=username,
   email=email,
   first_name=first_name,
   last_name=last_name,
   role=role,
   organisation=org,
   school=school,
   is_active=True,
  )
  new_user.set_password(password)
  new_user.full_clean()
  new_user.save()

  record_event(actor=new_user,action='create',obj=new_user,changed_fields=['username','role','organisation','school'])
  record_event(actor=new_user,action='create',obj=org,changed_fields=['name','code'])
  record_event(actor=new_user,action='create',obj=school,changed_fields=['name','code'])

 login(request,new_user)
 payload=user_payload(new_user)
 payload['csrfToken']=get_token(request)
 return Response(payload,status=201)

@csrf_protect
def register_account(request):
 return _register_api(request)

@api_view(['POST'])
def signout(request):logout(request);return Response({'ok':True})

def user_payload(u):
 return {
  'id': u.id,
  'name': u.get_full_name() or u.username,
  'username': u.username,
  'first_name': u.first_name,
  'last_name': u.last_name,
  'email': u.email,
  'avatar_color': getattr(u, 'avatar_color', '#8276da'),
  'avatar_image': getattr(u, 'avatar_image', ''),
  'role': u.role,
  'organisation': u.organisation_id,
  'organisation_name': u.organisation.name if u.organisation else None,
  'allow_org_admin_student_access': getattr(u.organisation, 'allow_org_admin_student_access', False) if u.organisation else False,
  'school': u.school_id,
  'school_name': u.school.name if u.school else None,
  'is_staff': u.is_staff,
 }
@api_view(['GET', 'PATCH'])
def me(request):
 from django.middleware.csrf import get_token
 u = request.user
 if not u.is_authenticated:
  raise PermissionDenied('Authentication required')
 if request.method == 'PATCH':
  data = request.data
  if 'first_name' in data:
   u.first_name = str(data['first_name']).strip()[:150]
  if 'last_name' in data:
   u.last_name = str(data['last_name']).strip()[:150]
  if 'email' in data:
   u.email = str(data['email']).strip()[:254]
  if 'avatar_color' in data:
   col = str(data['avatar_color']).strip()
   if len(col) <= 12:
    u.avatar_color = col
  if 'avatar_image' in data:
   u.avatar_image = str(data['avatar_image'])
  if data.get('password') and data.get('current_password'):
   if not u.check_password(str(data['current_password'])):
    raise APIValidationError({'current_password': 'Current password does not match.'})
   if len(str(data['password'])) < 8:
    raise APIValidationError({'password': 'New password must be at least 8 characters.'})
   u.set_password(str(data['password']))
  u.save()
 payload=user_payload(u)
 payload['csrfToken']=get_token(request)
 return Response(payload)

class DynamicSerializer(serializers.ModelSerializer):
 """Model-level validation is performed after explicit API permission checks."""
 pass

class SchoolSerializer(DynamicSerializer):
 class Meta:model=School;fields=['id','organisation','name','code','city','attendance_alert_threshold','grade_alert_threshold'];read_only_fields=['organisation']
class ClassSerializer(DynamicSerializer):
 school_name=serializers.CharField(source='school.name',read_only=True)
 academic_year_name=serializers.CharField(source='academic_year.name',read_only=True)
 teacher_name=serializers.SerializerMethodField()
 def get_teacher_name(self,o):return o.teacher.get_full_name() if o.teacher else 'Unassigned'
 class Meta:model=SchoolClass;fields='__all__'
class StudentSerializer(DynamicSerializer):
 full_name=serializers.CharField(read_only=True)
 class_name=serializers.SerializerMethodField()
 gender=serializers.ChoiceField(choices=[('male','Boy'),('female','Girl')],required=True)
 def get_class_name(self,o):
  e=o.enrollments.select_related('school_class').filter(end_date__isnull=True).first()
  return e.school_class.name if e else 'Unassigned'
 class Meta:model=Student;fields=['id','school','admission_number','first_name','last_name','full_name','date_of_birth','gender','enrolled_on','active','user','guardians','class_name']
class SubjectSerializer(DynamicSerializer):
 school_name=serializers.CharField(source='school.name',read_only=True)
 class Meta:model=Subject;fields='__all__'
class AssessmentSerializer(DynamicSerializer):
 subject_name=serializers.CharField(source='subject.name',read_only=True)
 class_name=serializers.CharField(source='school_class.name',read_only=True)
 class Meta:model=Assessment;fields='__all__'
class GradeSerializer(DynamicSerializer):
 student_name=serializers.CharField(source='student.full_name',read_only=True)
 percentage=serializers.FloatField(read_only=True)
 class Meta:model=Grade;fields='__all__'
class AttendanceSerializer(DynamicSerializer):
 student_name=serializers.CharField(source='student.full_name',read_only=True)
 class Meta:model=Attendance;fields='__all__'
class HomeworkSerializer(DynamicSerializer):
 class Meta:model=Homework;fields='__all__';read_only_fields=['created_by']
class SubmissionSerializer(DynamicSerializer):
 class Meta:model=HomeworkSubmission;fields='__all__';read_only_fields=['confirmed_by']
class ObservationSerializer(DynamicSerializer):
 class Meta:model=Observation;fields='__all__';read_only_fields=['teacher']
class CaseSerializer(DynamicSerializer):
 student_name=serializers.CharField(source='student.full_name',read_only=True)
 class Meta:model=ReviewCase;fields='__all__';read_only_fields=['school']
class InterventionSerializer(DynamicSerializer):
 class Meta:model=Intervention;fields='__all__'
class NotificationSerializer(DynamicSerializer):
 class Meta:model=Notification;fields='__all__';read_only_fields=['user','title','body','created_at']
class YearSerializer(DynamicSerializer):
 school_name=serializers.CharField(source='school.name',read_only=True)
 class Meta:model=AcademicYear;fields='__all__'
class EnrollmentSerializer(DynamicSerializer):
 class Meta:model=Enrollment;fields='__all__'

def validate_model(model,attrs,instance=None,server_attrs=None):
 data={k:v for k,v in attrs.items() if k not in ('guardians',)}
 obj=copy(instance) if instance else model()
 for k,v in {**data,**(server_attrs or {})}.items():setattr(obj,k,v)
 try:obj.full_clean()
 except ModelValidationError as exc:
  raise APIValidationError(getattr(exc,'message_dict',None) or getattr(exc,'messages',None) or str(exc))
 return obj

class ScopedViewSet(viewsets.ModelViewSet):
 """One secured CRUD boundary, resource matrix + all FK checks + atomic audit."""
 permission_classes=[IsAuthenticated]
 def get_queryset(self):
  model=self.queryset.model
  ensure_action(self.request.user,model,'read')
  qs=queryset_for(self.request.user,model)
  school_param=self.request.query_params.get('school') or self.request.query_params.get('campus')
  if school_param:
   try:
    sid=int(school_param)
    if model is School:qs=qs.filter(pk=sid)
    elif hasattr(model,'school'):qs=qs.filter(school_id=sid)
    elif hasattr(model,'school_class'):qs=qs.filter(school_class__school_id=sid)
    elif model is Enrollment:qs=qs.filter(student__school_id=sid)
    elif model is Grade:qs=qs.filter(student__school_id=sid)
    elif model is ReviewCase:qs=qs.filter(school_id=sid)
    elif model is Intervention:qs=qs.filter(case__school_id=sid)
   except (ValueError,TypeError):pass
  return qs
 def get_serializer(self,*args,**kwargs):
  if 'data' in kwargs and hasattr(self.queryset.model,'school'):
   data=kwargs['data']
   if isinstance(data,dict):data=data.copy()
   elif hasattr(data,'dict'):data=data.dict()
   if isinstance(data,dict) and not data.get('school'):
    target_sch=None
    school_override=data.get('campus') or self.request.query_params.get('school') or self.request.query_params.get('campus')
    if school_override:
     try:target_sch=School.objects.filter(pk=int(school_override)).first()
     except (ValueError,TypeError):pass
    if not target_sch:
     user=self.request.user
     target_sch=getattr(user,'school',None) or (user.organisation.schools.first() if getattr(user,'organisation',None) else None)
    if target_sch:
     data['school']=target_sch.pk
     kwargs['data']=data
  return super().get_serializer(*args,**kwargs)
 def create(self,request,*args,**kwargs):
  ensure_action(request.user,self.queryset.model,'create')
  return super().create(request,*args,**kwargs)
 def update(self,request,*args,**kwargs):
  ensure_action(request.user,self.queryset.model,'update')
  return super().update(request,*args,**kwargs)
 def partial_update(self,request,*args,**kwargs):
  ensure_action(request.user,self.queryset.model,'update')
  return super().partial_update(request,*args,**kwargs)
 def destroy(self,request,*args,**kwargs):
  ensure_action(request.user,self.queryset.model,'delete')
  instance=self.get_object()
  self.perform_destroy(instance)
  return Response({'success':True,'detail':'Record deleted successfully'},status=status.HTTP_200_OK)
 @transaction.atomic
 def perform_create(self,serializer):
  user=self.request.user;model=self.queryset.model;data=serializer.validated_data
  extras={}
  if hasattr(model, 'school') and 'school' not in data:
   school_override = self.request.data.get('school') or self.request.query_params.get('school')
   target_sch = None
   if school_override:
    try:target_sch = School.objects.filter(pk=int(school_override)).first()
    except (ValueError, TypeError):pass
   if not target_sch:
    target_sch = user.school or (user.organisation.schools.first() if user.organisation else None)
   if target_sch:
    extras['school'] = target_sch
    data['school'] = target_sch
  validate_related(user,model,data)
  if model is School:
   if not user.organisation_id:raise PermissionDenied('Organisation membership required')
   extras['organisation']=user.organisation
  if model is Homework:extras['created_by']=user
  if model is ReviewCase:extras['school']=data['student'].school
  if model is ReviewCase and user.role=='teacher' and not user.is_superuser:
   if data.get('assignee') and data['assignee'].pk != user.pk:
    raise PermissionDenied('Teachers may only assign a new case to themselves')
   extras['assignee']=user
  if model is Observation:extras['teacher']=user
  if model is HomeworkSubmission:
   extras['confirmed_by']=user if data.get('status')=='completed' else None
  if model is Assessment and user.role=='teacher' and data.get('published'):
   raise PermissionDenied('Publishing results requires school leadership')
  if model is Grade and data['assessment'].published and user.role=='teacher':
   raise PermissionDenied('Published grades are locked for teacher entries')
  if model is Notification:raise PermissionDenied('Notifications are generated by system services')
  validate_model(model,data,server_attrs=extras)
  saved=serializer.save(**extras)
  record_event(actor=user,action='create',obj=saved,changed_fields=list(data))
 @transaction.atomic
 def perform_update(self,serializer):
  user=self.request.user;model=self.queryset.model;old=self.get_object();data=serializer.validated_data
  if model is Notification:
   if set(self.request.data) - {'read'} or 'read' not in data:
    raise APIValidationError({'detail':'Only the read state may be updated'})
  if model is Assessment:
   if user.role=='teacher' and 'published' in data:
    raise PermissionDenied('Publishing results requires school leadership')
   if any(k in data and data[k]!=getattr(old,k) for k in ('max_marks','weight')) and Grade.objects.filter(assessment=old).exists():
    raise PermissionDenied('Graded assessment configuration cannot be rewritten; use a versioned correction workflow')
  if model is Homework and 'due_date' in data and data['due_date']!=old.due_date and HomeworkSubmission.objects.filter(homework=old).exists():
   raise PermissionDenied('Cannot change a submitted homework deadline without versioned workflow')
  if model is Student and 'enrolled_on' in data and data['enrolled_on']!=old.enrolled_on and Enrollment.objects.filter(student=old).exists():
   raise PermissionDenied('Admission date cannot be rewritten while enrolment history exists')
  if model is Grade and old.assessment.published and user.role=='teacher':
   raise PermissionDenied('Published grades are locked for teacher edits')
  validate_related(user,model,data,old)
  if model is Student and 'guardians' in data:raise PermissionDenied('Guardian relationship change requires verified workflow')
  if model is SchoolClass and 'teacher' in data and user.role=='teacher' and not user.is_superuser:
   raise PermissionDenied('Teachers cannot reassign classes')
  if model is HomeworkSubmission:
   # Teacher-controlled verification: do not trust a client-provided confirmed_by.
   extras={'confirmed_by':user if data.get('status',old.status)=='completed' else None}
  else:extras={}
  if model is Enrollment and 'end_date' in data:
   cutoff=data['end_date']
   if cutoff:
    if Grade.objects.filter(student=old.student,assessment__school_class=old.school_class,assessment__date__gt=cutoff).exists() or Attendance.objects.filter(student=old.student,school_class=old.school_class,date__gt=cutoff).exists() or HomeworkSubmission.objects.filter(student=old.student,homework__school_class=old.school_class,homework__due_date__gt=cutoff).exists():
     raise APIValidationError({'end_date':'Cannot shorten enrollment before recorded grades or attendance'})
  validate_model(model,data,instance=old,server_attrs=extras)
  before={k:getattr(old,k) for k in data}
  saved=serializer.save(**extras)
  record_event(actor=user,action='update',obj=saved,changed_fields=list(data),before=before,after=data)
 @transaction.atomic
 def perform_destroy(self,instance):
  user=self.request.user
  model=self.queryset.model
  ensure_action(user,model,'delete')
  if model is Student:
   Grade.objects.filter(student=instance).delete()
   Attendance.objects.filter(student=instance).delete()
   HomeworkSubmission.objects.filter(student=instance).delete()
   Observation.objects.filter(student=instance).delete()
   Intervention.objects.filter(case__student=instance).delete()
   ReviewCase.objects.filter(student=instance).delete()
   Enrollment.objects.filter(student=instance).delete()
  elif model is SchoolClass:
   Enrollment.objects.filter(school_class=instance).delete()
   Grade.objects.filter(assessment__school_class=instance).delete()
   Assessment.objects.filter(school_class=instance).delete()
   Attendance.objects.filter(school_class=instance).delete()
   HomeworkSubmission.objects.filter(homework__school_class=instance).delete()
   Homework.objects.filter(school_class=instance).delete()
   ClassSubjectTeacher.objects.filter(school_class=instance).delete()
   SubjectMessage.objects.filter(school_class=instance).delete()
  elif model is AcademicYear:
   classes=SchoolClass.objects.filter(academic_year=instance)
   for c in classes:
    Enrollment.objects.filter(school_class=c).delete()
    Grade.objects.filter(assessment__school_class=c).delete()
    Assessment.objects.filter(school_class=c).delete()
    Attendance.objects.filter(school_class=c).delete()
    HomeworkSubmission.objects.filter(homework__school_class=c).delete()
    Homework.objects.filter(school_class=c).delete()
    ClassSubjectTeacher.objects.filter(school_class=c).delete()
    SubjectMessage.objects.filter(school_class=c).delete()
   classes.delete()
  elif model is Subject:
   Grade.objects.filter(assessment__subject=instance).delete()
   Assessment.objects.filter(subject=instance).delete()
   HomeworkSubmission.objects.filter(homework__subject=instance).delete()
   Homework.objects.filter(subject=instance).delete()
   Observation.objects.filter(subject=instance).delete()
   ClassSubjectTeacher.objects.filter(subject=instance).delete()
   SubjectMessage.objects.filter(subject=instance).delete()
  elif model is Assessment:
   Grade.objects.filter(assessment=instance).delete()
  elif model is Homework:
   HomeworkSubmission.objects.filter(homework=instance).delete()
  elif model is ReviewCase:
   Intervention.objects.filter(case=instance).delete()
  elif model is School:
   if user.organisation and School.objects.filter(organisation=user.organisation).count() <= 1:
    raise APIValidationError({'detail':'Cannot delete the only campus in your organisation.'})
   Student.objects.filter(school=instance).delete()
   SchoolClass.objects.filter(school=instance).delete()
   AcademicYear.objects.filter(school=instance).delete()
   Subject.objects.filter(school=instance).delete()
   StaffMember.objects.filter(school=instance).delete()
   FinanceCategory.objects.filter(school=instance).delete()
   FinanceEntry.objects.filter(school=instance).delete()
   SchoolConfiguration.objects.filter(school=instance).delete()
   ReviewCase.objects.filter(school=instance).delete()
  record_event(actor=user,action='delete',obj=instance)
  instance.delete()

class Schools(ScopedViewSet):queryset=School.objects.all();serializer_class=SchoolSerializer
class Classes(ScopedViewSet):queryset=SchoolClass.objects.all();serializer_class=ClassSerializer
class Students(ScopedViewSet):queryset=Student.objects.all();serializer_class=StudentSerializer
class Subjects(ScopedViewSet):queryset=Subject.objects.all();serializer_class=SubjectSerializer
class Years(ScopedViewSet):queryset=AcademicYear.objects.all();serializer_class=YearSerializer
class Enrollments(ScopedViewSet):queryset=Enrollment.objects.all();serializer_class=EnrollmentSerializer
class Assessments(ScopedViewSet):queryset=Assessment.objects.all();serializer_class=AssessmentSerializer
class Grades(ScopedViewSet):
 queryset=Grade.objects.all();serializer_class=GradeSerializer
 def destroy(self,request,*args,**kwargs):raise PermissionDenied('Grades cannot be deleted through API.')
class AttendanceRecords(ScopedViewSet):queryset=Attendance.objects.all();serializer_class=AttendanceSerializer
class HomeworkItems(ScopedViewSet):queryset=Homework.objects.all();serializer_class=HomeworkSerializer
class Submissions(ScopedViewSet):queryset=HomeworkSubmission.objects.all();serializer_class=SubmissionSerializer
class Observations(ScopedViewSet):queryset=Observation.objects.all();serializer_class=ObservationSerializer
class Cases(ScopedViewSet):queryset=ReviewCase.objects.all();serializer_class=CaseSerializer
class Interventions(ScopedViewSet):queryset=Intervention.objects.all();serializer_class=InterventionSerializer
class Notifications(ScopedViewSet):queryset=Notification.objects.all();serializer_class=NotificationSerializer
class AuditSerializer(serializers.ModelSerializer):
 class Meta:
  model=AuditEvent
  fields=['id','actor','organisation','school','action','resource','resource_id','changes','created_at']
class AuditLog(viewsets.ReadOnlyModelViewSet):
 permission_classes=[IsAuthenticated]
 serializer_class=AuditSerializer
 queryset=AuditEvent.objects.all()
 def get_queryset(self):
  ensure_action(self.request.user,AuditEvent,'read')
  return queryset_for(self.request.user,AuditEvent)

@api_view(['POST'])
def transfer_student(request, pk):
 """Atomic transfer: close enrollment, change current school, open new period."""
 user=request.user
 ensure_action(user,Student,'update')
 if user.role not in ('organisation_admin','school_admin','principal') and not user.is_superuser:
  raise PermissionDenied('School leadership required')
 try:
  target_id=int(request.data.get('school_class'))
  on=date.fromisoformat(request.data.get('effective_date',''))
 except (TypeError,ValueError):raise APIValidationError({'detail':'school_class and YYYY-MM-DD effective_date required'})
 with transaction.atomic():
  student=Student.objects.select_for_update().filter(pk=pk).first()
  if not student:raise PermissionDenied('Student not accessible')
  require_visible(user,Student,student.pk)
  target=SchoolClass.objects.select_related('school','academic_year').filter(pk=target_id).first()
  if not target:raise APIValidationError({'school_class':'Not found'})
  require_visible(user,SchoolClass,target.pk)
  if target.school.organisation_id!=student.school.organisation_id:
   raise PermissionDenied('Cross-organisation transfers are not supported')
  if target.school_id!=student.school_id and not (user.role=='organisation_admin' or user.is_superuser):
   raise PermissionDenied('Cross-school transfer requires organisation administration')
  if not target.academic_year.start_date<=on<=target.academic_year.end_date:
   raise APIValidationError({'effective_date':'Outside target academic year'})
  current=list(Enrollment.objects.select_for_update().filter(student=student,end_date__isnull=True))
  if len(current)>1:raise APIValidationError({'detail':'Multiple active enrollments: contact administrator'})
  if current:
   if on<=current[0].start_date:raise APIValidationError({'effective_date':'Must follow existing enrollment start'})
   cutoff=on-timedelta(days=1)
   if (Grade.objects.filter(student=student,assessment__school_class=current[0].school_class,assessment__date__gt=cutoff).exists() or
       Attendance.objects.filter(student=student,school_class=current[0].school_class,date__gt=cutoff).exists() or
       HomeworkSubmission.objects.filter(student=student,homework__school_class=current[0].school_class,homework__due_date__gt=cutoff).exists()):
    raise APIValidationError({'effective_date':'Transfer would invalidate existing historical learning records'})
   current[0].end_date=cutoff
   validate_model(Enrollment,{},current[0]);current[0].save(update_fields=['end_date'])
   record_event(actor=user,action='close_enrollment',obj=current[0],changed_fields=['end_date'],before={'end_date':None},after={'end_date':cutoff})
  previous_school=student.school_id
  student.school=target.school
  validate_model(Student,{},student);student.save(update_fields=['school'])
  if student.user_id:
   student.user.school=target.school
   validate_model(User,{},student.user)
   student.user.save(update_fields=['school'])
  enrollment=Enrollment(student=student,school_class=target,start_date=on)
  validate_model(Enrollment,{},enrollment);enrollment.save()
  record_event(actor=user,action='transfer',obj=student,changed_fields=['school'],before={'school':previous_school},after={'school':target.school_id})
  record_event(actor=user,action='create',obj=enrollment,changed_fields=['student','school_class','start_date'])
 return Response({'student':student.pk,'school':target.school_id,'school_class':target.pk,'effective_date':on.isoformat()},status=201)


def student_stats(students,classes=None):
 ids=students.values_list('id',flat=True)
 grades=Grade.objects.filter(student_id__in=ids,assessment__published=True)
 if classes is not None:grades=grades.filter(assessment__school_class__in=classes)
 grades=grades.select_related('assessment')
 percents=[float(g.marks/g.assessment.max_marks*100) for g in grades if g.assessment.max_marks]
 attendance=Attendance.objects.filter(student_id__in=ids)
 if classes is not None:attendance=attendance.filter(school_class__in=classes)
 recorded=attendance.count();present=attendance.filter(status__in=['present','late']).count()
 return {'academic_average':round(sum(percents)/len(percents),1) if percents else None,'grade_records':len(percents),'attendance_rate':round(present/recorded*100,1) if recorded else None,'attendance_records':recorded}

@api_view(['GET'])
def dashboard(request):
 u=request.user;students=students_scope(u);schools=schools_scope(u);classes=classes_scope(u)
 school_param=request.query_params.get('school') or request.query_params.get('campus')
 if school_param:
  try:
   sid=int(school_param)
   schools=schools.filter(pk=sid)
   students=students.filter(school_id=sid)
   classes=classes.filter(school_id=sid)
  except (ValueError,TypeError):pass
 stats=student_stats(students,classes)
 cases=queryset_for(u,ReviewCase) if u.role not in ('parent','student') else ReviewCase.objects.none()
 school_items=[]
 for school in schools[:20]:
  scoped_students=students.filter(school=school)
  school_items.append({'id':school.id,'name':school.name,'students':scoped_students.count(),**student_stats(scoped_students,classes.filter(school=school))})
 recent=list(cases.order_by('-updated_at')[:6].values('id','title','status','priority','student_id','student__first_name','student__last_name'))
 recent=[{**x,'student_name':f"{x.pop('student__first_name')} {x.pop('student__last_name')}"} for x in recent]
 recent_students=list(students.order_by('-id')[:7].values('id','first_name','last_name','admission_number','school__name'))
 return Response({'counts':{'students':students.count(),'schools':schools.count(),'classes':classes.count(),'open_cases':cases.exclude(status='resolved').count(),'teachers':User.objects.filter(school__in=schools,role='teacher').count()},'stats':stats,'schools':school_items,'recent_cases':recent,'recent_students':recent_students,'attention':cases.filter(priority='high').exclude(status='resolved').count(),'recent_notifications':list(Notification.objects.filter(user=u,read=False).order_by('-created_at')[:5].values('id','title','body'))})

@api_view(['GET'])
def export_students(request):
 ensure_action(request.user,Student,'read')
 if not request.user.is_superuser and request.user.role not in ('organisation_admin','school_admin','principal'):
  raise PermissionDenied('Student export requires school leadership')
 if request.user.role=='organisation_admin' and not request.user.organisation.allow_org_admin_student_access:
  raise PermissionDenied('Individual student export requires explicit organisation policy')
 response=HttpResponse(content_type='text/csv');response['Content-Disposition']='attachment; filename="students.csv"'
 writer=csv.writer(response);writer.writerow(['Admission #','First name','Last name','School','Enrolled','Active'])
 for s in students_scope(request.user).select_related('school'):writer.writerow([s.admission_number,s.first_name,s.last_name,s.school.name,s.enrolled_on,s.active])
 return response

@api_view(['GET'])
def teachers_list(request):
 schools=schools_scope(request.user)
 teachers=User.objects.filter(school__in=schools,role='teacher',is_active=True).select_related('school')
 return Response({'results':[{'id':t.id,'name':t.get_full_name() or t.username,'username':t.username,'school_id':t.school_id,'school_name':t.school.name if t.school else ''} for t in teachers]})

@api_view(['POST'])
def create_account(request):
 """
 Multi-role account provisioning matching OPTIMUS ORIEN Part 5 §18, SEC-018, AUTH-014/015.
 - organisation_admin can provision any institutional or community role.
 - school_admin and principal can provision teachers, students, and parents for their assigned campus.
 - Enforces username uniqueness, password complexity, school scoping, and optional automatic
   student directory or guardian linkage.
 """
 user=request.user
 if not user.is_authenticated:
  return Response({'detail':'Authentication required'},status=401)
 if user.role not in ('organisation_admin','school_admin','principal') and not user.is_superuser:
  raise PermissionDenied('Account creation requires administrator or principal role')
 data=request.data
 first_name=(data.get('first_name') or '').strip()
 last_name=(data.get('last_name') or '').strip()
 username=(data.get('username') or '').strip()
 email=(data.get('email') or '').strip().lower()
 password=data.get('password') or ''
 role=(data.get('role') or '').strip()
 school_id=data.get('school')
 admission_number=(data.get('admission_number') or '').strip()
 gender=(data.get('gender') or '').strip().lower()
 if gender not in ('','male','female'):
  return Response({'detail':'Gender must be male or female'},status=400)
 student_id=data.get('student_id')
 class_id=data.get('class_id')
 
 VALID_ROLES=['organisation_admin','school_admin','principal','teacher','student','parent']
 if not all([first_name,last_name,username,password,role]):
  return Response({'detail':'first_name, last_name, username, password and role are required'},status=400)
 if role not in VALID_ROLES:
  return Response({'detail':f'Role must be one of: {", ".join(VALID_ROLES)}'},status=400)
 
 if user.role in ('school_admin','principal'):
  if role not in ('teacher','student','parent'):
   raise PermissionDenied('Campus leaders may only provision teachers, students, and parents')
  school=user.school
  if not school:
   raise PermissionDenied('Your account has no assigned school campus')
 elif user.role=='organisation_admin' or user.is_superuser:
  if role=='organisation_admin' and not school_id:
   school=None
  elif school_id:
   school=schools_scope(user).filter(pk=school_id).first()
   if not school:
    return Response({'detail':'School campus not found or not in your scope'},status=400)
  else:
   if role!='organisation_admin':
    return Response({'detail':'A school campus must be selected for this role'},status=400)
   school=None
 else:
  raise PermissionDenied('Permission denied')

 if User.objects.filter(username=username).exists():
  return Response({'detail':'Username is already taken. Please choose another.'},status=400)
 
 if email and User.objects.filter(email=email).exists():
  return Response({'detail':'An account with this email address already exists.'},status=400)

 from django.contrib.auth.password_validation import validate_password
 from django.core.exceptions import ValidationError as DjangoValidationError
 try:
  validate_password(password)
 except DjangoValidationError as e:
  return Response({'detail':' '.join(e.messages)},status=400)

 with transaction.atomic():
  new_user=User(
   username=username,
   email=email,
   first_name=first_name,
   last_name=last_name,
   role=role,
   school=school,
   organisation=user.organisation,
   is_active=True
  )
  new_user.set_password(password)
  new_user.full_clean()
  new_user.save()
  
  linked_info={}
  if role=='student' and school:
   from django.utils import timezone
   adm=admission_number or f"ADM-{timezone.now().year}-{new_user.id:04d}"
   st=Student.objects.filter(school=school,admission_number=adm).first()
   if not st:
    st=Student(
     school=school,
     admission_number=adm,
     first_name=first_name,
     last_name=last_name,
     user=new_user,
     gender=gender,
     enrolled_on=timezone.now().date(),
     active=True
    )
    st.full_clean()
    st.save()
   else:
    if not st.user:
     st.user=new_user
     st.save(update_fields=['user'])
   linked_info['student_id']=st.id
   linked_info['admission_number']=st.admission_number
   
   if class_id:
    sc_class=SchoolClass.objects.filter(pk=class_id,school=school).first()
    if sc_class:
     enrollment=Enrollment(student=st,school_class=sc_class,start_date=timezone.now().date())
     enrollment.full_clean()
     enrollment.save()
     linked_info['class_name']=sc_class.name
  
  if role=='parent' and student_id:
   st=Student.objects.filter(pk=student_id,school__organisation=user.organisation).first()
   if st:
    st.guardians.add(new_user)
    linked_info['ward_name']=st.full_name
  
  if role=='teacher' and class_id and school:
   sc_class=SchoolClass.objects.filter(pk=class_id,school=school).first()
   if sc_class and not sc_class.teacher:
    sc_class.teacher=new_user
    sc_class.save(update_fields=['teacher'])
    linked_info['assigned_class']=sc_class.name
  
  record_event(
   actor=user,
   action='create',
   obj=new_user,
   changed_fields=['username','email','role','school']
  )

 return Response({
  'id':new_user.id,
  'username':new_user.username,
  'email':new_user.email,
  'name':new_user.get_full_name(),
  'role':new_user.role,
  'school':new_user.school_id,
  'school_name':new_user.school.name if new_user.school else None,
  **linked_info
 },status=201)

@api_view(['POST'])
def register_campus(request):
 """
 Comprehensive Campus Registration matching OPTIMUS ORIEN Parts 1, 2, 4 & 19 (SCH-001/004, ORG-001/002).
 Registers a campus entity with identity, location, jurisdiction, timezone, educational pathways,
 alert thresholds, and official contact metadata. Automatically initializes the SchoolConfiguration draft.
 """
 user=request.user
 if not user.is_authenticated:
  return Response({'detail':'Authentication required'},status=401)
 if user.role!='organisation_admin' and not user.is_superuser:
  raise PermissionDenied('Registering a new campus requires organisation administration')
 if not user.organisation_id:
  raise PermissionDenied('Organisation membership required')
 
 data=request.data
 name=(data.get('name') or '').strip()
 code=(data.get('code') or '').strip().upper()
 city=(data.get('city') or '').strip()
 jurisdiction=(data.get('jurisdiction') or '').strip()
 country=(data.get('country') or '').strip().upper()
 address=(data.get('address') or '').strip()
 timezone_val=(data.get('timezone') or '').strip()
 contact_email=(data.get('contact_email') or '').strip()
 contact_phone=(data.get('contact_phone') or '').strip()
 campus_type=(data.get('campus_type') or 'Branch Campus').strip()
 programmes=data.get('programmes') or []
 if isinstance(programmes,str):
  programmes=[p.strip() for p in programmes.split(',') if p.strip()]
 
 attendance_alert=data.get('attendance_alert_threshold')
 if attendance_alert is not None and attendance_alert!='':
  try:attendance_alert=float(attendance_alert)
  except:attendance_alert=80.0
 else:attendance_alert=80.0

 grade_alert=data.get('grade_alert_threshold')
 if grade_alert is not None and grade_alert!='':
  try:grade_alert=float(grade_alert)
  except:grade_alert=60.0
 else:grade_alert=60.0

 if not name or not code:
  return Response({'detail':'Campus name and unique code are required'},status=400)
 
 if School.objects.filter(organisation=user.organisation,code=code).exists():
  return Response({'detail':f'A campus with code "{code}" already exists in your organisation'},status=400)

 with transaction.atomic():
  school=School(
   organisation=user.organisation,
   name=name,
   code=code,
   city=city,
   attendance_alert_threshold=attendance_alert,
   grade_alert_threshold=grade_alert
  )
  school.full_clean()
  school.save()

  from .models import SchoolConfiguration
  config,_=SchoolConfiguration.objects.get_or_create(school=school)
  if country and len(country)==2:
   config.country=country
  if jurisdiction:
   config.jurisdiction=jurisdiction
  if timezone_val:
   config.timezone=timezone_val
  if programmes and isinstance(programmes,list):
   config.programmes=[p[:120] for p in programmes if isinstance(p,str)]
  
  settings_dict=config.school_settings or {}
  if address:settings_dict['address']=address
  if contact_email:settings_dict['contact_email']=contact_email
  if contact_phone:settings_dict['contact_phone']=contact_phone
  if campus_type:settings_dict['campus_type']=campus_type
  config.school_settings=settings_dict
  config.full_clean()
  config.save()

  record_event(
   actor=user,
   action='create',
   obj=school,
   changed_fields=['name','code','city','attendance_alert_threshold','grade_alert_threshold']
  )

 return Response({
  'id':school.id,
  'organisation':school.organisation_id,
  'name':school.name,
  'code':school.code,
  'city':school.city,
  'jurisdiction':config.jurisdiction,
  'country':config.country,
  'timezone':config.timezone,
  'programmes':config.programmes,
  'attendance_alert_threshold':float(school.attendance_alert_threshold),
  'grade_alert_threshold':float(school.grade_alert_threshold),
  'school_settings':config.school_settings
 },status=201)

@api_view(['GET'])
def school_users(request,school_id):
 """List users assigned to a specific school with role and contact metadata."""
 school=schools_scope(request.user).filter(pk=school_id).first()
 if not school:
  return Response({'detail':'Not found'},status=404)
 users=User.objects.filter(school=school,is_active=True).order_by('role','first_name')
 res=[]
 for u in users:
  item={
   'id':u.id,
   'name':u.get_full_name() or u.username,
   'username':u.username,
   'email':u.email or '',
   'role':u.role,
   'date_joined':u.date_joined.strftime('%Y-%m-%d') if u.date_joined else ''
  }
  if u.role=='student':
   st=Student.objects.filter(user=u).first()
   if st:
    item['admission_number']=st.admission_number
  res.append(item)
 return Response({'results':res})
