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
 return Response(user_payload(user))

# DRF's @api_view marks its view CSRF-exempt. Protect an independent Django
# wrapper instead so an anonymous login POST is checked even before a session
# exists. The DRF endpoint inside continues to apply its authentication throttle.
@csrf_protect
def signin(request):
 return _signin_api(request)

@api_view(['POST'])
def signout(request):logout(request);return Response({'ok':True})

def user_payload(u):
 return {
  'id': u.id,
  'name': u.get_full_name() or u.username,
  'username': u.username,
  'role': u.role,
  'organisation': u.organisation_id,
  'organisation_name': u.organisation.name if u.organisation else None,
  'allow_org_admin_student_access': getattr(u.organisation, 'allow_org_admin_student_access', False) if u.organisation else False,
  'school': u.school_id,
  'school_name': u.school.name if u.school else None,
  'is_staff': u.is_staff,
 }
@api_view(['GET'])
def me(request):return Response(user_payload(request.user))

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
 def get_class_name(self,o):
  e=o.enrollments.select_related('school_class').filter(end_date__isnull=True).first()
  return e.school_class.name if e else 'Unassigned'
 class Meta:model=Student;fields=['id','school','admission_number','first_name','last_name','full_name','date_of_birth','enrolled_on','active','user','guardians','class_name']
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
  return queryset_for(self.request.user,model)
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
  return super().destroy(request,*args,**kwargs)
 @transaction.atomic
 def perform_create(self,serializer):
  user=self.request.user;model=self.queryset.model;data=serializer.validated_data
  validate_related(user,model,data)
  extras={}
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
  # Future-approved retention policy only; never hard-delete academic history here.
  raise PermissionDenied('Deletion is disabled pending approved archival/retention policy')

class Schools(ScopedViewSet):queryset=School.objects.all();serializer_class=SchoolSerializer
class Classes(ScopedViewSet):queryset=SchoolClass.objects.all();serializer_class=ClassSerializer
class Students(ScopedViewSet):queryset=Student.objects.all();serializer_class=StudentSerializer
class Subjects(ScopedViewSet):queryset=Subject.objects.all();serializer_class=SubjectSerializer
class Years(ScopedViewSet):queryset=AcademicYear.objects.all();serializer_class=YearSerializer
class Enrollments(ScopedViewSet):queryset=Enrollment.objects.all();serializer_class=EnrollmentSerializer
class Assessments(ScopedViewSet):queryset=Assessment.objects.all();serializer_class=AssessmentSerializer
class Grades(ScopedViewSet):queryset=Grade.objects.all();serializer_class=GradeSerializer
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
