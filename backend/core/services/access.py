"""Central, deny-by-default resource/relationship authorization for API v1.

A role grants an action; queryset + relationship guards grant its scope. Keep
these checks server-side even when the UI hides an unavailable operation.
"""
from rest_framework.exceptions import PermissionDenied
from core.models import (AcademicYear, Assessment, Attendance, AuditEvent, Enrollment,
    Grade, Homework, HomeworkSubmission, Intervention, Notification, Observation,
    Organisation, ReviewCase, School, SchoolClass, Student, Subject, User)

# Explicit MVP policy. Organisation admin individual student access is opt-in on
# Organisation; principal and teacher case access is narrower than general data.
READ = {
 'organisation_admin': {'School','SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Observation','ReviewCase','Intervention','Notification','AuditEvent'},
 'school_admin': {'School','SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Observation','ReviewCase','Intervention','Notification','AuditEvent'},
 'principal': {'School','SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Observation','ReviewCase','Intervention','Notification','AuditEvent'},
 'teacher': {'School','SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Observation','ReviewCase','Intervention','Notification'},
 'student': {'School','SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Notification'},
 'parent': {'School','SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Notification'},
}
CREATE = {
 'organisation_admin': {'School','SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Observation','ReviewCase','Intervention'},
 'school_admin': {'SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Observation','ReviewCase','Intervention'},
 'principal': {'SchoolClass','AcademicYear','Subject','Student','Enrollment','Assessment','Grade','Attendance','Homework','HomeworkSubmission','Observation','ReviewCase','Intervention'},
 'teacher': {'Assessment','Grade','Attendance','Homework','HomeworkSubmission','Observation','ReviewCase','Intervention'},
 'student': set(), 'parent': set(),
}
for role in ('organisation_admin','school_admin','principal'):
 CREATE[role].discard('Observation')  # teacher observation provenance is required
UPDATE = {role: names.copy() for role, names in CREATE.items()}
UPDATE['organisation_admin'].add('School')
UPDATE['school_admin'].add('School')
UPDATE['principal'].discard('School')
for role in UPDATE:UPDATE[role].add('Notification')
UPDATE['teacher'].discard('ReviewCase')  # case owner/approval controls are a later phase
UPDATE['teacher'].discard('Intervention')

# Hard deletion is disabled for historical/educational records until a dedicated
# retention, archival and deletion workflow is approved. Prevent API loss of history.
DELETE = {role: set() for role in READ}

# Editing these related entities would rewrite historical context. Transfer and
# assignment changes must use dedicated workflows or future governance controls.
IMMUTABLE_RELATIONS = {
 School: {'organisation'}, SchoolClass: {'school','academic_year'},
 AcademicYear: {'school'}, Subject: {'school'}, Student: {'school','user','guardians'},
 Enrollment: {'student','school_class','start_date'},
 Assessment: {'school_class','subject','date'}, Grade: {'student','assessment'},
 Attendance: {'student','school_class','date'}, Homework: {'school_class','subject'},
 HomeworkSubmission: {'homework','student'}, Observation: {'student','teacher','subject','date'},
 ReviewCase: {'student','school'}, Intervention: {'case'},
 Notification: {'user','title','body','created_at'},
}

SENSITIVE_MODELS = {Student, Enrollment, Grade, Attendance, HomeworkSubmission,
                    Observation, ReviewCase, Intervention}

def ensure_action(user, model, action):
 if not user.is_authenticated or not user.is_active:
  raise PermissionDenied('Active account required')
 if (action!='read' and user.role=='organisation_admin' and model in SENSITIVE_MODELS and
     not getattr(user.organisation,'allow_org_admin_student_access',False)):
  raise PermissionDenied('Identifiable student writes require explicit organisation policy')
 if user.is_superuser:
  if action == 'delete': raise PermissionDenied('Historical deletion is disabled')
  return
 policy = {'read':READ, 'create':CREATE, 'update':UPDATE, 'delete':DELETE}[action]
 if model.__name__ not in policy.get(user.role, set()):
  raise PermissionDenied('Action not permitted for this role')

def schools_scope(user):
 if not user.is_authenticated or not user.is_active: return School.objects.none()
 if user.is_superuser:return School.objects.all()
 if user.role == 'student':return School.objects.filter(student__user=user).distinct()
 if user.role == 'parent':return School.objects.filter(student__guardians=user).distinct()
 if not user.organisation_id:return School.objects.none()
 if user.role == 'organisation_admin':return School.objects.filter(organisation_id=user.organisation_id)
 return School.objects.filter(pk=user.school_id, organisation_id=user.organisation_id)

def students_scope(user):
 q=Student.objects.filter(school__in=schools_scope(user))
 if user.role == 'student' and not user.is_superuser:return q.filter(user=user)
 if user.role == 'parent' and not user.is_superuser:return q.filter(guardians=user)
 if user.role == 'teacher' and not user.is_superuser:return q.filter(enrollments__school_class__teacher=user, enrollments__end_date__isnull=True).distinct()
 if user.role == 'organisation_admin' and not user.is_superuser:
  if not getattr(user.organisation, 'allow_org_admin_student_access', False):return q.none()
 return q

def classes_scope(user):
 q=SchoolClass.objects.filter(school__in=schools_scope(user))
 if user.role == 'teacher' and not user.is_superuser:return q.filter(teacher=user)
 if user.role in ('student','parent') and not user.is_superuser:
  return q.filter(enrollments__student__in=students_scope(user)).distinct()
 return q

def queryset_for(user, model):
 # Read scopes apply to all list and detail APIs, and to related-entity checks.
 schools=schools_scope(user)
 classes=classes_scope(user)
 students=students_scope(user)
 if model is School:return schools
 if model is SchoolClass:return classes
 if model is AcademicYear:return AcademicYear.objects.filter(school__in=schools)
 if model is Subject:return Subject.objects.filter(school__in=schools)
 if model is Student:return students
 if model is Enrollment:return Enrollment.objects.filter(student__in=students,school_class__in=classes)
 if model is Assessment:
  q=Assessment.objects.filter(school_class__in=classes)
  return q.filter(published=True) if user.role in ('student','parent') and not user.is_superuser else q
 if model is Grade:
  q=Grade.objects.filter(student__in=students,assessment__school_class__in=classes)
  return q.filter(assessment__published=True) if user.role in ('student','parent') and not user.is_superuser else q
 if model is Attendance:return Attendance.objects.filter(student__in=students,school_class__in=classes)
 if model is Homework:return Homework.objects.filter(school_class__in=classes)
 if model is HomeworkSubmission:return HomeworkSubmission.objects.filter(student__in=students,homework__school_class__in=classes)
 if model is Observation:return Observation.objects.filter(student__in=students,subject__school__in=schools)
 if model is ReviewCase:
  q=ReviewCase.objects.filter(school__in=schools)
  if user.role=='organisation_admin' and not user.is_superuser and not user.organisation.allow_org_admin_student_access:return q.none()
  return q.filter(assignee=user) if user.role=='teacher' and not user.is_superuser else q
 if model is Intervention:
  q=Intervention.objects.filter(case__school__in=schools)
  if user.role=='organisation_admin' and not user.is_superuser and not user.organisation.allow_org_admin_student_access:return q.none()
  return q.filter(case__assignee=user) if user.role=='teacher' and not user.is_superuser else q
 if model is Notification:return Notification.objects.filter(user=user)
 if model is AuditEvent:
  if user.is_superuser:return AuditEvent.objects.all()
  if user.role == 'organisation_admin':
   audits=AuditEvent.objects.filter(organisation_id=user.organisation_id)
   if not getattr(user.organisation,'allow_org_admin_student_access',False):
    audits=audits.exclude(resource__in=[m.__name__ for m in SENSITIVE_MODELS])
   return audits
  return AuditEvent.objects.filter(school_id=user.school_id)
 return model.objects.none()

def require_visible(user, model, pk):
 ensure_action(user,model,'read')
 if not queryset_for(user,model).filter(pk=pk).exists():
  raise PermissionDenied('Related record outside authorised scope')

def validate_related(user, model, attrs, instance=None):
 """Check every foreign key and M2M key against its own scoped collection.

 Cross-relational model.clean() runs separately after these checks, and sees the
 combined existing+updated values. We never trust a client-supplied actor ID.
 """
 if instance is not None:
  restricted=IMMUTABLE_RELATIONS.get(model,set())
  for field in restricted:
   if field in attrs:
    if field == 'guardians':raise PermissionDenied('Guardian changes require a verified workflow')
    old_id=getattr(instance,f'{field}_id',None)
    incoming=getattr(attrs[field],'pk',attrs[field])
    if incoming != old_id:raise PermissionDenied(f'{field} is historical/immutable')
 # Defensive whitelist for all incoming relations including less obvious links:
 for field, value in attrs.items():
  if field == 'guardians':
   if model is not Student:raise PermissionDenied('Invalid relation')
   for guardian in value:
    if guardian.role!='parent' or not guardian.is_active or guardian.organisation_id != (attrs.get('school') or instance.school).organisation_id:
     raise PermissionDenied('Guardians must be verified active parents in this organisation')
   continue
  if not hasattr(model,field):continue
  try:descriptor=model._meta.get_field(field)
  except Exception:continue
  if not descriptor.is_relation or not descriptor.many_to_one or value is None:continue
  ref=descriptor.related_model
  if ref is User:
   if ((model is Homework and field=='created_by') or (model is HomeworkSubmission and field=='confirmed_by') or (model is Observation and field=='teacher')):
    raise PermissionDenied('Actor is set by the server')
   if not user.is_superuser and (value.organisation_id != user.organisation_id or (value.school_id and value.school_id not in schools_scope(user).values_list('id',flat=True))):
    raise PermissionDenied('User not in permitted organisation/school')
   if field=='teacher' and value.role!='teacher':raise PermissionDenied('Teacher role required')
   if field=='user' and model is Student and attrs.get('school') and value.school_id!=attrs['school'].pk:
    raise PermissionDenied('Student account must be assigned to the same school')
   if field in ('assignee','owner') and value.role not in ('teacher','principal','school_admin','organisation_admin'):raise PermissionDenied('Staff account required')
   if field=='user' and model is Student and value.role!='student':raise PermissionDenied('Student role required')
  elif ref is Organisation:
   if not user.is_superuser and value.pk!=user.organisation_id:raise PermissionDenied('Organisation mismatch')
  elif ref is School:
   require_visible(user,School,value.pk)
  elif ref is AuditEvent:
   raise PermissionDenied('Audit records cannot be linked')
  else:
   require_visible(user,ref,value.pk)
 # Class/submission/grade/course cross-links are enforced by model.full_clean().
