"""Secured school setup, approval snapshots, and privacy-safe public metrics."""
from django.db import transaction
import json
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import PermissionDenied,ValidationError
from rest_framework.response import Response
from .models import School,SchoolConfiguration,SchoolConfigurationVersion,PublishedSchoolIndicator,AcademicYear
from .services.access import schools_scope
from .services.audit import record_event
from .services.school_setup import CONFIG_FIELDS,readiness,setup_snapshot

class ConfigurationSerializer(serializers.ModelSerializer):
 class Meta:
  model=SchoolConfiguration
  fields=['country','jurisdiction','timezone','language','locale','programmes',
          'academic_year_name','academic_start','academic_end','reporting_periods',
          'grading_policy','attendance_policy','school_settings',
          'status','active_version','activated_at','updated_at']
  read_only_fields=['status','active_version','activated_at','updated_at']
 def validate_programmes(self,value):
  if not isinstance(value,list) or len(value)>25 or any(not isinstance(s,str) or len(s)>120 for s in value):
   raise serializers.ValidationError('Provide up to 25 named programmes')
  return [s.strip() for s in value]
 def validate_reporting_periods(self,value):
  if not isinstance(value,list) or len(value)>24 or any(not isinstance(x,dict) for x in value):
   raise serializers.ValidationError('Provide a list of up to 24 reporting periods')
  return value
 def validate_grading_policy(self,value):
  if not isinstance(value,dict):raise serializers.ValidationError('Grading policy must be an object')
  return value
 def validate_attendance_policy(self,value):
  if not isinstance(value,dict):raise serializers.ValidationError('Attendance policy must be an object')
  return value


def visible_school(user,pk):
 return get_object_or_404(schools_scope(user),pk=pk)


def may_manage(user,school):
 if user.is_superuser:return
 if not user.is_active or user.role not in ('organisation_admin','school_admin'):
  raise PermissionDenied('School setup requires an authorised administrator')
 if user.role=='organisation_admin' and school.organisation_id!=user.organisation_id:
  raise PermissionDenied('School outside your organisation')
 if user.role=='school_admin' and school.pk!=user.school_id:
  raise PermissionDenied('School outside your assignment')


def payload(school,config):
 return {'school':{'id':school.pk,'name':school.name,'code':school.code,'organisation':school.organisation_id},
         'configuration':ConfigurationSerializer(config).data if config else None,
         'readiness':readiness(config),
         'versions':list(config.versions.values('version','activated_at')[:12]) if config else []}

@api_view(['GET','PATCH'])
@permission_classes([IsAuthenticated])
def school_configuration(request,school_id):
 school=visible_school(request.user,school_id)
 if request.method=='GET':
  return Response(payload(school,SchoolConfiguration.objects.filter(school=school).first()))
 may_manage(request.user,school)
 if not isinstance(request.data,dict) or set(request.data)-set(CONFIG_FIELDS):
  raise ValidationError({'detail':'Only approved school configuration fields may be updated'})
 if len(json.dumps(request.data))>65536:
  raise ValidationError({'detail':'Configuration payload is too large'})
 with transaction.atomic():
  # Lock school row so concurrent first draft updates cannot create duplicates.
  school=School.objects.select_for_update().get(pk=school.pk)
  config,_=SchoolConfiguration.objects.get_or_create(school=school)
  ser=ConfigurationSerializer(config,data=request.data,partial=True)
  ser.is_valid(raise_exception=True)
  changed=set(ser.validated_data)
  if not changed:raise ValidationError({'detail':'No configuration fields provided'})
  if 'country' in changed:
   ser.validated_data['country']=ser.validated_data['country'].upper()
  config=ser.save(status='draft')
  config.full_clean()
  config.save()
  record_event(actor=request.user,action='school_setup_draft',obj=school,changed_fields=sorted(changed))
 return Response(payload(school,config))

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def activate_school_configuration(request,school_id):
 school=visible_school(request.user,school_id)
 may_manage(request.user,school)
 with transaction.atomic():
  config=SchoolConfiguration.objects.select_for_update().filter(school=school).first()
  if not config:
   return Response({'readiness':readiness(None),'detail':'Start a draft before activation'},status=400)
  result=readiness(config)
  if not result['complete']:
   return Response({'readiness':result,'detail':'Correct the required settings before activation'},status=400)
  if config.status=='active':
   return Response({'detail':'Configuration is already active; edit a draft to propose a new version'},status=409)
  config.active_version+=1
  config.status='active'
  config.activated_by=request.user
  config.activated_at=timezone.now()
  config.full_clean()
  config.save()
  SchoolConfigurationVersion.objects.create(configuration=config,version=config.active_version,
                                            snapshot=setup_snapshot(config),activated_by=request.user)
  if config.academic_year_name and config.academic_start and config.academic_end:
   AcademicYear.objects.update_or_create(
       school=school,
       name=config.academic_year_name,
       defaults={
           'start_date': config.academic_start,
           'end_date': config.academic_end,
           'active': True,
       }
   )
  record_event(actor=request.user,action='school_setup_activated',obj=school,
               changed_fields=['status','active_version'],after={'status':'active','active_version':config.active_version})
 return Response(payload(school,config))

@api_view(['GET'])
@permission_classes([AllowAny])
def public_school_indicators(request):
 """No student-level data and no implied leaderboard/ranking."""
 results=PublishedSchoolIndicator.objects.filter(approved_for_publication=True,
      approved_by__is_superuser=True,published_at__isnull=False,
      eligible_population__gte=10).select_related('school').order_by('-published_at')[:12]
 return Response({'results':[{'school_name':o.school.name,'title':o.title,
   'period':o.period_label,'value':str(o.value),'unit':o.unit,
   'methodology':o.methodology,'eligible_population':o.eligible_population,
   'completeness_note':o.completeness_note} for o in results],
   'notice':'Only expressly approved aggregate indicators are displayed. No student-level records are public.'})
