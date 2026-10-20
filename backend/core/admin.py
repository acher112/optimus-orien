from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import *

@admin.register(AuditEvent)
class AuditAdmin(admin.ModelAdmin):
 list_display=('created_at','actor','action','resource','resource_id','school')
 list_filter=('action','resource','school')
 readonly_fields=[f.name for f in AuditEvent._meta.fields]
 def has_add_permission(self,request):return False
 def has_change_permission(self,request,obj=None):return False
 def has_delete_permission(self,request,obj=None):return False
 def has_view_permission(self,request,obj=None):return request.user.is_superuser

@admin.register(User)
class OrienUserAdmin(UserAdmin):
 fieldsets=UserAdmin.fieldsets+(('Optimus Orien access',{'fields':('role','organisation','school','avatar_color')}),)
 add_fieldsets=UserAdmin.add_fieldsets+(('Optimus Orien access',{'fields':('role','organisation','school')}),)
 def has_module_permission(self,request):return request.user.is_superuser
 def has_view_permission(self,request,obj=None):return request.user.is_superuser
 def has_add_permission(self,request):return request.user.is_superuser
 def has_change_permission(self,request,obj=None):return request.user.is_superuser
 def has_delete_permission(self,request,obj=None):return False

def register_model(model):
 @admin.register(model)
 class GuardedAdmin(admin.ModelAdmin):
  def has_module_permission(self,request):return request.user.is_superuser
  def has_view_permission(self,request,obj=None):return request.user.is_superuser
  def has_add_permission(self,request):return request.user.is_superuser
  def has_change_permission(self,request,obj=None):return request.user.is_superuser
  def has_delete_permission(self,request,obj=None):return False # archival policy required
 return GuardedAdmin

@admin.register(SchoolConfiguration)
class ReadonlySchoolConfiguration(admin.ModelAdmin):
 list_display=('school','status','active_version','updated_at')
 readonly_fields=[f.name for f in SchoolConfiguration._meta.fields]
 def has_module_permission(self,request):return request.user.is_superuser
 def has_view_permission(self,request,obj=None):return request.user.is_superuser
 def has_add_permission(self,request):return False
 def has_change_permission(self,request,obj=None):return False
 def has_delete_permission(self,request,obj=None):return False

@admin.register(SchoolConfigurationVersion)
class ReadonlySchoolConfigurationVersion(ReadonlySchoolConfiguration):
 list_display=('configuration','version','activated_at','activated_by')
 readonly_fields=[f.name for f in SchoolConfigurationVersion._meta.fields]

@admin.register(PublishedSchoolIndicator)
class PublishedSchoolIndicatorAdmin(admin.ModelAdmin):
 list_display=('school','title','period_label','approved_for_publication','published_at')
 list_filter=('approved_for_publication','school')
 def has_module_permission(self,request):return request.user.is_superuser
 def has_view_permission(self,request,obj=None):return request.user.is_superuser
 def has_add_permission(self,request):return request.user.is_superuser
 def has_change_permission(self,request,obj=None):return request.user.is_superuser
 def has_delete_permission(self,request,obj=None):return False
 def get_changeform_initial_data(self,request):
  from django.utils import timezone
  return {'approved_by':request.user.pk,'published_at':timezone.now()}
 def save_model(self,request,obj,form,change):
  from .services.audit import record_event
  if obj.approved_for_publication:
   if not obj.approved_by_id or not obj.approved_by.is_superuser:
    raise ValueError('Publication must be approved by a platform administrator')
  else:
   obj.approved_by=None
   obj.published_at=None
  obj.full_clean()
  super().save_model(request,obj,form,change)
  record_event(actor=request.user,action='public_indicator_publication' if obj.approved_for_publication else 'public_indicator_unpublished',obj=obj.school,changed_fields=['approved_for_publication'])

for model in [Organisation,School,AcademicYear,SchoolClass,Subject,Student,Enrollment,Assessment,Grade,Attendance,Homework,HomeworkSubmission,Observation,ReviewCase,Intervention,Notification]:
 register_model(model)
