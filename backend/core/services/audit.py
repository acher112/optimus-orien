"""Transactional, minimised audit events: no free-text student details in change log."""
from core.models import (AuditEvent, Organisation, School, SchoolClass, AcademicYear, ReviewCase,
                         Student, Subject, Enrollment, Assessment)

# Business-sensitive fields deliberately absent: name, DOB, marks, feedback,
# attendance notes, intervention rationale, guardian names, credentials etc.
VALUE_FIELDS={'status','priority','published','active','read','completed','assignee',
              'teacher','owner','school','end_date','attendance_alert_threshold',
              'grade_alert_threshold'}

def scope_for(instance):
 if isinstance(instance,Organisation):return instance,None
 if isinstance(instance,School):return instance.organisation,instance
 if isinstance(instance,Student):return instance.school.organisation,instance.school
 if isinstance(instance,ReviewCase):return instance.school.organisation,instance.school
 if isinstance(instance,(SchoolClass,AcademicYear,Subject)):return instance.school.organisation,instance.school
 if isinstance(instance,Enrollment):return scope_for(instance.school_class)
 if isinstance(instance,Assessment):return scope_for(instance.school_class)
 for path in ('assessment','school_class','homework','student','case','user'):
  next_obj=getattr(instance,path,None)
  if next_obj is not None:
   if path=='user':
    return getattr(next_obj,'organisation',None),getattr(next_obj,'school',None)
   return scope_for(next_obj)
 return None,None

def _safe(value):
 if hasattr(value,'pk'):return value.pk
 if hasattr(value,'isoformat'):return value.isoformat()
 if isinstance(value,(int,float,bool,str)) and len(str(value))<80:return str(value)
 return '[changed]'

def record_event(*,actor,action,obj,changed_fields=None,before=None,after=None):
 org,school=scope_for(obj)
 changes={}
 for field in (changed_fields or []):
  if field in VALUE_FIELDS:
   changes[field]={'from':_safe((before or {}).get(field)),'to':_safe((after or {}).get(field))}
 changes['fields_changed']=sorted(set(changed_fields or []))
 return AuditEvent.objects.create(actor=actor,organisation=org,school=school,
   action=action,resource=type(obj).__name__,resource_id=obj.pk,changes=changes)
