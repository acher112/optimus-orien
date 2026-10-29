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
from core.services.filters import apply_query_filters, sort_comparison_rows
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
 identifier=(request.data.get('username') or request.data.get('email') or '').strip()
 password=request.data.get('password') or ''
 admin_env_user=(os.getenv('INITIAL_ADMIN_USERNAME') or '').strip()
 admin_env_pass=(os.getenv('INITIAL_ADMIN_PASSWORD') or '').strip()
 if admin_env_user and admin_env_pass and identifier.lower()==admin_env_user.lower() and password==admin_env_pass:
  try:
   from core.services.bootstrap import ensure_admin
   ensure_admin(username=admin_env_user,password=admin_env_pass)
  except Exception as exc:
   import logging
   logging.getLogger('core').error(f'Initial admin bootstrap during login failed: {exc}')

 user=authenticate(request,username=identifier,password=password)
 if not user and identifier:
  target=User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
  if target and target.check_password(password):
   user=target

 if not user or not user.is_active:
  return Response({'detail':'Invalid credentials'},status=400)
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
 Public registration is closed per spec 19 §3. Users are provisioned by administrative invitation only.
 """
 return Response({
  'detail': 'Public self-registration is closed. Accounts are provisioned via administrative invitation only.'
 }, status=410)

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
   new_pwd = str(data['password'])
   if len(new_pwd) < 8:
    raise APIValidationError({'password': 'New password must be at least 8 characters.'})
   from django.contrib.auth.password_validation import validate_password
   from django.core.exceptions import ValidationError as DjangoValidationError
   try:
    validate_password(new_pwd, user=u)
   except DjangoValidationError as e:
    raise APIValidationError({'password': ' '.join(e.messages)})
   u.set_password(new_pwd)
   from django.contrib.auth import update_session_auth_hash
   update_session_auth_hash(request, u)
   record_event(actor=u, action='update', obj=u, changed_fields=['password'])
  u.save()
 payload=user_payload(u)
 payload['csrfToken']=get_token(request)
 return Response(payload)

@api_view(['POST'])
def change_password(request):
 u = request.user
 if not u.is_authenticated:
  raise PermissionDenied('Authentication required')
 data = request.data
 current_password = str(data.get('current_password') or data.get('old_password') or '')
 new_password = str(data.get('password') or data.get('new_password') or '')
 if not current_password or not new_password:
  return Response({'detail': 'Current password and new password are required.'}, status=400)
 if not u.check_password(current_password):
  return Response({'detail': 'Current password does not match.'}, status=400)
 if len(new_password) < 8:
  return Response({'detail': 'New password must be at least 8 characters.'}, status=400)
 from django.contrib.auth.password_validation import validate_password
 from django.core.exceptions import ValidationError as DjangoValidationError
 try:
  validate_password(new_password, user=u)
 except DjangoValidationError as e:
  return Response({'detail': ' '.join(e.messages)}, status=400)
 u.set_password(new_password)
 u.save()
 from django.contrib.auth import update_session_auth_hash
 update_session_auth_hash(request, u)
 record_event(actor=u, action='update', obj=u, changed_fields=['password'])
 return Response({'ok': True, 'detail': 'Password changed successfully.'})

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def forgot_password(request):
 identifier = str(request.data.get('email') or request.data.get('username') or request.data.get('identifier') or '').strip()
 if not identifier:
  return Response({'detail': 'Email address or username is required.'}, status=400)
 target = User.objects.filter(Q(email__iexact=identifier) | Q(username__iexact=identifier), is_active=True).first()
 if not target:
  return Response({'detail': 'No active account found with that email or username.'}, status=404)
 
 from django.contrib.auth.tokens import default_token_generator
 from django.utils.http import urlsafe_base64_encode
 from django.utils.encoding import force_bytes
 from django.core.mail import send_mail
 from django.conf import settings
 
 uid = urlsafe_base64_encode(force_bytes(target.pk))
 token = default_token_generator.make_token(target)
 
 try:
  send_mail(
   subject="Optimus Orien - Password Reset Request",
   message=f"Hello {target.get_full_name() or target.username},\n\nA password reset request was received for your portal account.\nYour Reset Token: {token}\nUser ID: {uid}\n\nEnter this token in the portal to set a new password.",
   from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@optimus-orien.edu'),
   recipient_list=[target.email] if target.email else [],
   fail_silently=True
  )
 except Exception:
  pass

 record_event(actor=target, action='request_password_reset', obj=target)
 return Response({
  'ok': True,
  'detail': f'Password reset token generated for {target.email or target.username}.',
  'uid': uid,
  'token': token,
  'email': target.email
 })

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def reset_password_with_token(request):
 data = request.data
 uid_raw = str(data.get('uid') or '').strip()
 token = str(data.get('token') or '').strip()
 new_password = str(data.get('password') or data.get('new_password') or '')
 if not uid_raw or not token or not new_password:
  return Response({'detail': 'User ID (uid), reset token, and new password are required.'}, status=400)
 
 from django.utils.http import urlsafe_base64_decode
 from django.utils.encoding import force_str
 from django.contrib.auth.tokens import default_token_generator
 from django.contrib.auth.password_validation import validate_password
 from django.core.exceptions import ValidationError as DjangoValidationError
 
 try:
  pk = force_str(urlsafe_base64_decode(uid_raw))
  user = User.objects.get(pk=pk, is_active=True)
 except Exception:
  return Response({'detail': 'Invalid or expired password reset link/token.'}, status=400)
 
 if not default_token_generator.check_token(user, token):
  return Response({'detail': 'The password reset token is invalid or has expired.'}, status=400)
 
 if len(new_password) < 8:
  return Response({'detail': 'New password must be at least 8 characters long.'}, status=400)
 
 try:
  validate_password(new_password, user=user)
 except DjangoValidationError as e:
  return Response({'detail': ' '.join(e.messages)}, status=400)
 
 user.set_password(new_password)
 user.save()
 record_event(actor=user, action='reset_password', obj=user, changed_fields=['password'])
 return Response({'ok': True, 'detail': 'Password has been successfully reset. You can now sign in.'})

class DynamicSerializer(serializers.ModelSerializer):
 """Model-level validation is performed after explicit API permission checks."""
 pass

class SchoolSerializer(DynamicSerializer):
 class Meta:model=School;fields=['id','organisation','name','code','city','attendance_alert_threshold','grade_alert_threshold'];read_only_fields=['organisation']
class ClassSerializer(DynamicSerializer):
 school_name=serializers.CharField(source='school.name',read_only=True)
 academic_year_name=serializers.CharField(source='academic_year.name',read_only=True)
 teacher_name=serializers.SerializerMethodField()
 display_name=serializers.CharField(read_only=True)
 full_display_name=serializers.SerializerMethodField()
 def get_teacher_name(self,o):return o.teacher.get_full_name() if o.teacher else 'Unassigned'
 def get_full_display_name(self,o):
  base=o.display_name
  if o.school_id and getattr(o,'school',None):
   return f"{base} ({o.school.name})"
  return base
 class Meta:model=SchoolClass;fields='__all__'
class StudentSerializer(DynamicSerializer):
 full_name=serializers.CharField(read_only=True)
 school_name=serializers.CharField(source='school.name',read_only=True)
 class_name=serializers.SerializerMethodField()
 school_class_id=serializers.SerializerMethodField()
 section=serializers.SerializerMethodField()
 gender=serializers.ChoiceField(choices=[('male','Boy'),('female','Girl')],required=False)
 def validate(self,attrs):
  if 'guardians' in self.initial_data:
   for g_id in (self.initial_data.get('guardians') or []):
    g_user = User.objects.filter(pk=g_id if isinstance(g_id, int) else getattr(g_id, 'pk', None)).first()
    if g_user and (g_user.role != 'parent' or not g_user.is_active):
     raise PermissionDenied('Guardians must be verified active parents in this organisation')
  if not self.instance:
   fn = attrs.get('father_name') or self.initial_data.get('father_name')
   if not fn or not str(fn).strip():
    raise serializers.ValidationError({'father_name':'Father name is mandatory for new student registrations.'})
  if 'gender' in self.initial_data and not self.initial_data.get('gender'):
   raise serializers.ValidationError({'gender':'Gender is mandatory. Please select Boy or Girl.'})
  return super().validate(attrs)
 def get_class_name(self,o):
  e=o.enrollments.select_related('school_class__school').filter(end_date__isnull=True).first()
  if not e or not e.school_class:
   return 'Unassigned'
  sc = e.school_class
  base = f"{sc.name} – {sc.section}" if sc.section else sc.name
  if sc.school:
   return f"{base} ({sc.school.name})"
  return base
 def get_school_class_id(self,o):
  e=o.enrollments.filter(end_date__isnull=True).first()
  return e.school_class_id if e else None
 def get_section(self,o):
  e=o.enrollments.select_related('school_class').filter(end_date__isnull=True).first()
  return e.school_class.section if (e and e.school_class) else ''
 class Meta:
  model=Student
  fields=[
   'id','school','school_name','admission_number','first_name','last_name','full_name',
   'father_name','mother_name','guardian_phone',
   'date_of_birth','gender','enrolled_on','active','user','guardians',
   'class_name','school_class_id','section'
  ]
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

def _filter_student_class(qs, val):
 if isinstance(val, (list, tuple)):
  return qs.filter(enrollments__school_class_id__in=val, enrollments__end_date__isnull=True)
 return qs.filter(enrollments__school_class_id=val, enrollments__end_date__isnull=True)

def _filter_student_section(qs, val):
 if isinstance(val, (list, tuple)):
  return qs.filter(enrollments__school_class__section__in=val, enrollments__end_date__isnull=True)
 return qs.filter(enrollments__school_class__section__iexact=str(val).strip(), enrollments__end_date__isnull=True)

MODEL_FILTER_SPECS = {
 Student: {
  'search_fields': ['first_name', 'last_name', 'admission_number', 'father_name', 'mother_name', 'guardian_phone'],
  'filter_map': {
   'admission_number': 'admission_number',
   'name': 'first_name',
   'first_name': 'first_name',
   'last_name': 'last_name',
   'father_name': 'father_name',
   'mother_name': 'mother_name',
   'guardian_phone': 'guardian_phone',
   'gender': 'gender',
   'active': 'active',
   'status': 'active',
   'class': _filter_student_class,
   'school_class': _filter_student_class,
   'section': _filter_student_section,
   'enrolled_from': 'enrolled_on__gte',
   'enrolled_to': 'enrolled_on__lte',
   'dob_from': 'date_of_birth__gte',
   'dob_to': 'date_of_birth__lte',
  },
  'allowed_orderings': ['admission_number', 'first_name', 'last_name', 'enrolled_on', 'active', 'father_name', 'gender'],
  'default_ordering': ['first_name', 'last_name']
 },
 SchoolClass: {
  'search_fields': ['name', 'section'],
  'filter_map': {
   'name': 'name',
   'section': 'section',
   'academic_year': 'academic_year_id',
   'teacher': 'teacher_id',
  },
  'allowed_orderings': ['name', 'section'],
  'default_ordering': ['name', 'section']
 },
 Subject: {
  'search_fields': ['name', 'code'],
  'filter_map': {
   'name': 'name',
   'code': 'code',
  },
  'allowed_orderings': ['name', 'code'],
  'default_ordering': ['name']
 },
 School: {
  'search_fields': ['name', 'code', 'city'],
  'filter_map': {
   'name': 'name',
   'code': 'code',
   'city': 'city',
  },
  'allowed_orderings': ['name', 'code', 'city'],
  'default_ordering': ['name']
 },
 AcademicYear: {
  'search_fields': ['name'],
  'filter_map': {
   'name': 'name',
   'start_date_from': 'start_date__gte',
   'start_date_to': 'start_date__lte',
   'end_date_from': 'end_date__gte',
   'end_date_to': 'end_date__lte',
  },
  'allowed_orderings': ['name', 'start_date', 'end_date'],
  'default_ordering': ['-start_date']
 },
 Attendance: {
  'search_fields': ['student__first_name', 'student__last_name', 'student__admission_number'],
  'filter_map': {
   'student': 'student_id',
   'school_class': 'school_class_id',
   'class': 'school_class_id',
   'status': 'status',
   'date': 'date',
   'date_from': 'date__gte',
   'date_to': 'date__lte',
  },
  'allowed_orderings': ['date', 'status'],
  'default_ordering': ['-date']
 },
 Homework: {
  'search_fields': ['title', 'description', 'subject__name'],
  'filter_map': {
   'school_class': 'school_class_id',
   'class': 'school_class_id',
   'subject': 'subject_id',
   'due_date_from': 'due_date__gte',
   'due_date_to': 'due_date__lte',
  },
  'allowed_orderings': ['due_date', 'title'],
  'default_ordering': ['-due_date']
 },
 HomeworkSubmission: {
  'search_fields': ['student__first_name', 'student__last_name', 'homework__title'],
  'filter_map': {
   'homework': 'homework_id',
   'student': 'student_id',
   'status': 'status',
   'submitted_from': 'submitted_at__gte',
   'submitted_to': 'submitted_at__lte',
  },
  'allowed_orderings': ['submitted_at', 'status'],
  'default_ordering': ['-submitted_at']
 },
 Assessment: {
  'search_fields': ['name', 'subject__name'],
  'filter_map': {
   'name': 'name',
   'kind': 'kind',
   'subject': 'subject_id',
   'school_class': 'school_class_id',
   'class': 'school_class_id',
   'date_from': 'date__gte',
   'date_to': 'date__lte',
  },
  'allowed_orderings': ['date', 'name', 'weightage', 'total_marks'],
  'default_ordering': ['-date']
 },
 Grade: {
  'search_fields': ['student__first_name', 'student__last_name', 'assessment__name'],
  'filter_map': {
   'assessment': 'assessment_id',
   'student': 'student_id',
   'class': 'assessment__school_class_id',
   'school_class': 'assessment__school_class_id',
  },
  'allowed_orderings': ['marks'],
  'default_ordering': ['-marks']
 },
 ReviewCase: {
  'search_fields': ['title', 'description', 'student__first_name', 'student__last_name'],
  'filter_map': {
   'student': 'student_id',
   'status': 'status',
   'priority': 'priority',
  },
  'allowed_orderings': ['created_at', 'priority', 'status'],
  'default_ordering': ['-created_at']
 },
 Intervention: {
  'search_fields': ['action', 'notes', 'case__student__first_name', 'case__student__last_name'],
  'filter_map': {
   'case': 'case_id',
   'status': 'status',
   'kind': 'kind',
  },
  'allowed_orderings': ['created_at', 'status'],
  'default_ordering': ['-created_at']
 },
 Notification: {
  'search_fields': ['title', 'body'],
  'filter_map': {
   'read': 'read',
   'user': 'user_id',
  },
  'allowed_orderings': ['created_at'],
  'default_ordering': ['-created_at']
 },
 AuditEvent: {
  'search_fields': ['action', 'resource', 'actor__username', 'actor__first_name', 'actor__last_name'],
  'filter_map': {
   'action': 'action',
   'resource': 'resource',
   'date_from': 'created_at__gte',
   'date_to': 'created_at__lte',
  },
  'allowed_orderings': ['created_at', 'action', 'resource'],
  'default_ordering': ['-created_at']
 }
}

class ScopedViewSet(viewsets.ModelViewSet):
 """One secured CRUD boundary, resource matrix + all FK checks + atomic audit."""
 permission_classes=[IsAuthenticated]
 def perform_content_negotiation(self, request, force=False):
  fmt = request.query_params.get('format')
  if fmt in ('csv', 'xlsx', 'pdf'):
   renderers = self.get_renderers()
   return (renderers[0], renderers[0].media_type)
  return super().perform_content_negotiation(request, force=force)
 def filter_queryset(self, queryset):
  model=getattr(queryset, 'model', None) or getattr(self.queryset, 'model', None)
  spec=MODEL_FILTER_SPECS.get(model)
  if spec:
   qs, _ = apply_query_filters(
    self.request,
    queryset,
    search_fields=spec.get('search_fields'),
    filter_map=spec.get('filter_map'),
    allowed_orderings=spec.get('allowed_orderings'),
    default_ordering=spec.get('default_ordering'),
   )
   return qs
  return queryset
 def get_queryset(self):
  model=self.queryset.model
  ensure_action(self.request.user,model,'read')
  qs=queryset_for(self.request.user,model)
  from core.services.campus_filter import resolve_campus
  school_ids=resolve_campus(self.request)
  if model is School:qs=qs.filter(pk__in=school_ids)
  elif hasattr(model,'school'):qs=qs.filter(school_id__in=school_ids)
  elif hasattr(model,'school_class'):qs=qs.filter(school_class__school_id__in=school_ids)
  elif model is Enrollment:qs=qs.filter(student__school_id__in=school_ids)
  elif model is Grade:qs=qs.filter(student__school_id__in=school_ids)
  elif model is ReviewCase:qs=qs.filter(school_id__in=school_ids)
  elif model is Intervention:qs=qs.filter(case__school_id__in=school_ids)
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
 def list(self,request,*args,**kwargs):
  fmt=request.query_params.get('format')
  if fmt in ('csv','xlsx','pdf'):
   from core.services.exports import export_response
   qs=self.filter_queryset(self.get_queryset())
   serializer=self.get_serializer(qs,many=True)
   data=serializer.data
   model=self.queryset.model
   model_name=getattr(model._meta,'verbose_name_plural',None) or model.__name__
   columns=[]
   if data and isinstance(data[0],dict):
    for k in data[0].keys():
     if k in ('password','tokens','secret','hash','csrfToken'):continue
     columns.append({'key':k,'label':k.replace('_',' ').title()})
   else:
    for f in model._meta.fields:
     if f.name in ('password','tokens','secret','hash'):continue
     columns.append({'key':f.name,'label':f.verbose_name.title()})
   rows=[]
   for item in data:
    row={}
    for col in columns:
     k=col['key'];v=item.get(k)
     if isinstance(v,dict):v=v.get('name') or v.get('username') or v.get('title') or str(v)
     row[k]=v
    rows.append(row)
   campus_name=getattr(getattr(request.user,'school',None),'name','')
   return export_response(
    request,
    filename=f"{model.__name__.lower()}-list",
    title=f"{str(model_name).title()} Directory",
    columns=columns,
    rows=rows,
    fmt=fmt,
    meta={'school_name':campus_name,'filters':f"Campus: {campus_name or 'All'}"}
   )
  return super().list(request,*args,**kwargs)
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
   from core.services.campus_filter import get_campus_for_write
   target_sch = get_campus_for_write(self.request, self.request.data)
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
class Students(ScopedViewSet):
 queryset=Student.objects.all();serializer_class=StudentSerializer
 @transaction.atomic
 def create(self, request, *args, **kwargs):
  ensure_action(request.user, Student, 'create')
  class_id = request.data.get('school_class') or request.data.get('class_id') or request.data.get('class')
  if not class_id:
   raise serializers.ValidationError({'school_class': 'Class is required for student admission.'})

  from core.services.campus_filter import get_campus_for_write
  school = get_campus_for_write(request, request.data)

  try:
   cid = int(str(class_id).strip())
  except (ValueError, TypeError):
   raise serializers.ValidationError({'school_class': 'Invalid class ID.'})

  school_class = SchoolClass.objects.filter(pk=cid, school=school).first()
  if not school_class:
   raise serializers.ValidationError({'school_class': 'Selected class does not exist or does not belong to the selected campus.'})

  serializer = self.get_serializer(data=request.data)
  serializer.is_valid(raise_exception=True)
  student = serializer.save(school=school)

  enrolled_on = student.enrolled_on or timezone.localdate()
  Enrollment.objects.create(
   student=student,
   school_class=school_class,
   start_date=enrolled_on
  )

  record_event(actor=request.user, action='create', obj=student)

  out_serializer = self.get_serializer(student)
  headers = self.get_success_headers(out_serializer.data)
  return Response(out_serializer.data, status=status.HTTP_201_CREATED, headers=headers)
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
 def perform_content_negotiation(self, request, force=False):
  fmt = request.query_params.get('format')
  if fmt in ('csv', 'xlsx', 'pdf'):
   renderers = self.get_renderers()
   return (renderers[0], renderers[0].media_type)
  return super().perform_content_negotiation(request, force=force)
 def list(self, request, *args, **kwargs):
  fmt = request.query_params.get('format')
  if fmt in ('csv', 'xlsx', 'pdf'):
   from core.services.exports import export_response
   qs = self.filter_queryset(self.get_queryset())
   data = self.get_serializer(qs, many=True).data
   columns = [
    {'key': 'id', 'label': 'ID'},
    {'key': 'actor', 'label': 'Actor'},
    {'key': 'action', 'label': 'Action'},
    {'key': 'resource', 'label': 'Resource'},
    {'key': 'resource_id', 'label': 'Resource ID'},
    {'key': 'changes', 'label': 'Changes'},
    {'key': 'created_at', 'label': 'Timestamp'}
   ]
   return export_response(
    request,
    filename="audit-log",
    title="Audit Log",
    columns=columns,
    rows=data,
    fmt=fmt
   )
  return super().list(request, *args, **kwargs)
 def filter_queryset(self, queryset):
  spec=MODEL_FILTER_SPECS.get(AuditEvent)
  if spec:
   qs, _ = apply_query_filters(
    self.request,
    queryset,
    search_fields=spec.get('search_fields'),
    filter_map=spec.get('filter_map'),
    allowed_orderings=spec.get('allowed_orderings'),
    default_ordering=spec.get('default_ordering'),
   )
   return qs
  return queryset
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
 fmt=request.query_params.get('format') or 'csv'
 from core.services.exports import export_response
 qs=students_scope(request.user).select_related('school')
 spec=MODEL_FILTER_SPECS.get(Student)
 if spec:
  qs, _ = apply_query_filters(
   request,
   qs,
   search_fields=spec.get('search_fields'),
   filter_map=spec.get('filter_map'),
   allowed_orderings=spec.get('allowed_orderings'),
   default_ordering=spec.get('default_ordering'),
  )
 columns=[
  {'key':'admission_number','label':'Admission #'},
  {'key':'first_name','label':'First Name'},
  {'key':'last_name','label':'Last Name'},
  {'key':'father_name','label':'Father Name'},
  {'key':'gender','label':'Gender'},
  {'key':'school_name','label':'Campus'},
  {'key':'enrolled_on','label':'Enrolled On'},
  {'key':'active','label':'Active Status'},
 ]
 rows=[{
  'admission_number':s.admission_number,
  'first_name':s.first_name,
  'last_name':s.last_name,
  'father_name':s.father_name,
  'gender':s.gender or '',
  'school_name':s.school.name,
  'enrolled_on':str(s.enrolled_on),
  'active':'Yes' if s.active else 'No'
 } for s in qs]
 campus_name=getattr(getattr(request.user,'school',None),'name','')
 return export_response(request,filename='students',title='Student Directory',columns=columns,rows=rows,fmt=fmt,meta={'school_name':campus_name})

@api_view(['POST','GET'])
def universal_export(request):
 """Shared export endpoint for client-side tables and charts."""
 user=request.user
 if not user.is_authenticated:
  raise PermissionDenied('Authentication required')
 data=request.data if request.method=='POST' else request.query_params
 title=data.get('title') or 'Data Export'
 filename=data.get('filename') or 'export'
 columns=data.get('columns') or []
 rows=data.get('rows') or []
 fmt=data.get('format') or 'csv'
 meta=data.get('meta') or {}
 from core.services.exports import export_response
 return export_response(request,filename=filename,title=title,columns=columns,rows=rows,fmt=fmt,meta=meta)

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
 if not username and email:
  base_user = email.split('@')[0]
  username = base_user
  idx = 1
  while User.objects.filter(username=username).exists():
   username = f"{base_user}{idx}"
   idx += 1
 if not all([first_name,last_name,username,password,role]):
  return Response({'detail':'first_name, last_name, username, password and role are required'},status=400)
 if role not in VALID_ROLES:
  return Response({'detail':f'Role must be one of: {", ".join(VALID_ROLES)}'},status=400)
 
 if user.role == 'principal':
  if role not in ('teacher','student','parent'):
   raise PermissionDenied('Principals may only provision teachers, students, and parents')
  school=user.school
  if not school:
   raise PermissionDenied('Your account has no assigned school campus')
 elif user.role == 'school_admin':
  if role not in ('principal','teacher','student','parent'):
   raise PermissionDenied('Campus administrators may only provision principals, teachers, students, and parents')
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
   organisation=user.organisation or (school.organisation if school else None),
   is_active=True
  )
  new_user.set_password(password)
  new_user.full_clean()
  new_user.save()
  
  linked_info={}
  if role=='principal' and school:
   from django.utils import timezone
   today = timezone.localdate()
   ra, _ = RoleAssignment.objects.get_or_create(
    user=new_user,
    role='principal',
    school=school,
    defaults={'effective_from': today}
   )
   staff = StaffMember.objects.filter(user=new_user).first()
   if not staff:
    staff = StaffMember.objects.create(
     school=school,
     user=new_user,
     first_name=first_name,
     last_name=last_name,
     email=email,
     position='Campus Principal',
     role='principal',
     hired_on=today,
     status='active'
    )
   linked_info['staff_id']=staff.id
   linked_info['role_assignment']='principal'
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
