from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from core.models import *
class Command(BaseCommand):
 help='Seed a fictional demonstration organisation (never run against production data)'
 @transaction.atomic
 def handle(self,*args,**kwargs):
  org,_=Organisation.objects.get_or_create(code='northstar',defaults={'name':'Northstar Education Group'})
  if not org.allow_org_admin_student_access:
   org.allow_org_admin_student_access=True;org.save(update_fields=['allow_org_admin_student_access']) # fiction/demo only
  school,_=School.objects.get_or_create(organisation=org,code='NORTH',defaults={'name':'Northstar Academy','city':'Cambridge'})
  sister,_=School.objects.get_or_create(organisation=org,code='WEST',defaults={'name':'Westbridge School','city':'Oxford'})
  admin,_=User.objects.get_or_create(username='admin',defaults={'first_name':'Olivia','last_name':'Bennett','role':'organisation_admin','organisation':org,'school':school,'is_staff':True})
  admin.set_password('DemoPass123!');admin.save()
  teacher,_=User.objects.get_or_create(username='teacher',defaults={'first_name':'Ethan','last_name':'Cole','role':'teacher','organisation':org,'school':school});teacher.set_password('DemoPass123!');teacher.save()
  principal,_=User.objects.get_or_create(username='principal',defaults={'first_name':'Grace','last_name':'Morgan','role':'principal','organisation':org,'school':school});principal.set_password('DemoPass123!');principal.save()
  today=timezone.localdate();year,_=AcademicYear.objects.get_or_create(school=school,name='2026–2027',defaults={'start_date':today-timedelta(days=90),'end_date':today+timedelta(days=270)})
  klass,_=SchoolClass.objects.get_or_create(school=school,academic_year=year,name='Grade 8 · A',defaults={'grade_level':'8','teacher':teacher})
  klass2,_=SchoolClass.objects.get_or_create(school=school,academic_year=year,name='Grade 9 · B',defaults={'grade_level':'9','teacher':teacher})
  names=[('Sophia','Anderson'),('Noah','Williams'),('Emma','Johnson'),('Liam','Brown'),('Ava','Davis'),('Oliver','Miller'),('Isabella','Wilson'),('Elijah','Moore'),('Mia','Taylor'),('James','Thomas'),('Charlotte','Jackson'),('Lucas','White'),('Amelia','Harris'),('Henry','Martin'),('Harper','Thompson'),('Benjamin','Garcia'),('Evelyn','Martinez'),('Alexander','Robinson'),('Abigail','Clark'),('Daniel','Rodriguez'),('Ella','Lewis'),('Mason','Lee'),('Scarlett','Walker'),('Logan','Hall')]
  students=[]
  for i,(first,last) in enumerate(names):
   s,_=Student.objects.get_or_create(school=school,admission_number=f'NS-{1001+i}',defaults={'first_name':first,'last_name':last,'enrolled_on':today-timedelta(days=80+i%8)})
   c=klass if i<12 else klass2
   Enrollment.objects.get_or_create(student=s,school_class=c,start_date=today-timedelta(days=80))
   students.append(s)
  for code,name in [('MAT','Mathematics'),('ENG','English Language'),('SCI','Science'),('HIS','History'),('GEO','Geography')]:
   subject,_=Subject.objects.get_or_create(school=school,code=code,defaults={'name':name})
   for c in [klass,klass2]:
    for k in range(3):
     assessment,_=Assessment.objects.get_or_create(school_class=c,subject=subject,title=f'{name} • Checkpoint {k+1}',defaults={'date':today-timedelta(days=52-k*16),'max_marks':100,'published':True,'weight':1})
     for i,s in enumerate(students):
      if (i<12)!=(c==klass):continue
      marks=max(38,min(98,65+(i*13+k*9+len(code)*3)%35-(18 if i in (2,7,14,20) else 0)))
      Grade.objects.get_or_create(student=s,assessment=assessment,defaults={'marks':Decimal(marks)})
  for i,s in enumerate(students):
   c=klass if i<12 else klass2
   for d in range(1,32):
    day=today-timedelta(days=d)
    if day.weekday()>4:continue
    status='absent' if (i*7+d)%17==0 or (i in (2,7) and d%5==0) else ('late' if (i+d)%13==0 else 'present')
    Attendance.objects.get_or_create(student=s,school_class=c,date=day,defaults={'status':status})
  for i,s in enumerate(students[:7]):
   ReviewCase.objects.get_or_create(student=s,title=['Attendance requires review','Declining mathematics results','Homework confirmation pending','Follow-up attendance check','Subject support review','Learning support check','Data completeness review'][i],defaults={'reason':'This is a fictional demonstration case. Review underlying records before drawing conclusions.','priority':'high' if i<2 else 'medium','status':'in_progress' if i%2 else 'open','assignee':teacher})
  for idx,title in enumerate(['Complete attendance register','New academic term overview','Review cases assigned']):Notification.objects.get_or_create(user=admin,title=title,defaults={'body':'Your school workspace has an item ready for review.'})
  self.stdout.write(self.style.SUCCESS('Demo ready: admin / teacher / principal — password DemoPass123!'))
