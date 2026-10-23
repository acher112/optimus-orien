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
   if not Enrollment.objects.filter(student=s,end_date__isnull=True).exists():
    Enrollment.objects.create(student=s,school_class=c,start_date=today-timedelta(days=80))
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
  # ---- Second campus (Westbridge) so multi-campus drill-down reports can be demonstrated ----
  west_teacher,_=User.objects.get_or_create(username='teacher_west',defaults={'first_name':'Priya','last_name':'Nair','role':'teacher','organisation':org,'school':sister});west_teacher.set_password('DemoPass123!');west_teacher.save()
  west_principal,_=User.objects.get_or_create(username='principal_west',defaults={'first_name':'Daniel','last_name':'Hughes','role':'principal','organisation':org,'school':sister});west_principal.set_password('DemoPass123!');west_principal.save()
  wyear,_=AcademicYear.objects.get_or_create(school=sister,name='2026–2027',defaults={'start_date':today-timedelta(days=90),'end_date':today+timedelta(days=270)})
  wk1,_=SchoolClass.objects.get_or_create(school=sister,academic_year=wyear,name='Grade 8 · W1',defaults={'grade_level':'8','teacher':west_teacher})
  wk2,_=SchoolClass.objects.get_or_create(school=sister,academic_year=wyear,name='Grade 9 · W2',defaults={'grade_level':'9','teacher':west_teacher})
  west_names=[('Zara','Khan'),('Omar','Farouk'),('Lina','Haddad'),('Yusuf','Ali'),('Maya','Singh'),('Ethan','Park'),('Nora','Silva'),('Leo','Costa'),('Aisha','Rahman'),('Felix','Novak'),('Ines','Duarte'),('Hugo','Meyer'),('Sana','Iqbal'),('Tomas','Ruiz'),('Elif','Demir'),('Jonas','Berg')]
  west_students=[]
  for i,(first,last) in enumerate(west_names):
   s2,_=Student.objects.get_or_create(school=sister,admission_number=f'WS-{2001+i}',defaults={'first_name':first,'last_name':last,'enrolled_on':today-timedelta(days=80)})
   if not Enrollment.objects.filter(student=s2,end_date__isnull=True).exists():
    Enrollment.objects.create(student=s2,school_class=wk1 if i<8 else wk2,start_date=today-timedelta(days=80))
   west_students.append(s2)
  for code,name in [('MAT','Mathematics'),('ENG','English Language'),('SCI','Science')]:
   subject,_=Subject.objects.get_or_create(school=sister,code=code,defaults={'name':name})
   for c in [wk1,wk2]:
    for k in range(3):
     # Grade 9 Mathematics deliberately weights its last checkpoint x2 so the report flags it as not directly comparable
     weight=2 if (c==wk2 and code=='MAT' and k==2) else 1
     assessment,_=Assessment.objects.get_or_create(school_class=c,subject=subject,title=f'{name} • Checkpoint {k+1}',defaults={'date':today-timedelta(days=52-k*16),'max_marks':100,'published':True,'weight':weight})
     for i,s2 in enumerate(west_students):
      if (i<8)!=(c==wk1):continue
      if i==5 and k==2:continue # one genuinely missing result, never treated as zero
      marks=max(35,min(97,58+(i*11+k*7+len(code)*5)%38))
      Grade.objects.get_or_create(student=s2,assessment=assessment,defaults={'marks':Decimal(marks)})
  for i,s2 in enumerate(west_students):
   c=wk1 if i<8 else wk2
   for d in range(1,32):
    day=today-timedelta(days=d)
    if day.weekday()>4:continue
    status='absent' if (i*5+d)%11==0 else ('late' if (i+d)%9==0 else 'present')
    Attendance.objects.get_or_create(student=s2,school_class=c,date=day,defaults={'status':status})
  # Reporting periods (per school) used by the report period selector
  for sch in (school,sister):
   SchoolConfiguration.objects.get_or_create(school=sch,defaults={'country':'GB','timezone':'Europe/London','language':'en','reporting_periods':[
    {'name':'Term 1','start':(today-timedelta(days=90)).isoformat(),'end':(today-timedelta(days=30)).isoformat()},
    {'name':'Term 2','start':(today-timedelta(days=29)).isoformat(),'end':(today+timedelta(days=60)).isoformat()}]})
  # Gender (drives the pink / blue / gray charts) - fictional first names only
  girls={'Sophia','Emma','Ava','Isabella','Mia','Charlotte','Amelia','Zara','Lina','Maya','Nora','Aisha','Ines','Sana'}
  for st in Student.objects.filter(school__in=[school,sister],gender=''):
   st.gender='female' if (st.first_name in girls) else 'male';st.save(update_fields=['gender'])
  # Student and parent demo logins for the "My performance" page
  first=Student.objects.filter(school=school,admission_number='NS-1001').first()
  if first:
   pupil,_=User.objects.get_or_create(username='student_demo',defaults={'first_name':first.first_name,'last_name':first.last_name,'role':'student','organisation':org,'school':school});pupil.set_password('DemoPass123!');pupil.save()
   if not first.user_id:first.user=pupil;first.save(update_fields=['user'])
   guardian,_=User.objects.get_or_create(username='parent_demo',defaults={'first_name':'Hannah','last_name':first.last_name,'role':'parent','organisation':org});guardian.set_password('DemoPass123!');guardian.save()
   first.guardians.add(guardian)
  # Staff directory and finance ledger demo data
  for sch,people in ((school,[('Ethan','Cole','Maths Teacher','teacher',teacher),('Grace','Morgan','Principal','principal',principal),('Maria','Lopez','Accountant','accountant',None),('Samir','Patel','Librarian','librarian',None)]),
                     (sister,[('Priya','Nair','Science Teacher','teacher',west_teacher),('Daniel','Hughes','Principal','principal',west_principal),('Chloe','Evans','Front Office','support',None)])):
   for fn,ln,pos,role,acct in people:
    sm,created=StaffMember.objects.get_or_create(school=sch,first_name=fn,last_name=ln,defaults={'position':pos,'role':role,'user':acct,'hired_on':today-timedelta(days=400)})
    if created:StaffEvent.objects.create(staff=sm,kind='hired',to_value=f'{pos} ({role})',actor=admin)
  for sch in (school,sister):
   if FinanceCategory.objects.filter(school=sch).exists():continue
   cats={}
   for kind,names in (('income',['Tuition fees','Admission fees','Annual fees','Other income']),('expense',['Salaries','Utilities','Maintenance','Stationery','Other expenses'])):
    for n in names:cats[n]=FinanceCategory.objects.create(school=sch,kind=kind,name=n)
   base=1 if sch==school else 0.8
   for m in range(3):
    d=today.replace(day=1)-timedelta(days=30*m)
    for n,amt in (('Tuition fees',480000),('Admission fees',60000),('Annual fees',90000 if m==2 else 20000),('Salaries',350000),('Utilities',42000),('Maintenance',27000+m*4000),('Stationery',11000)):
     FinanceEntry.objects.create(school=sch,category=cats[n],amount=Decimal(int(amt*base)),date=d,description='Demo entry',created_by=admin)
  # Subject teacher assignments & classroom communication demo
  math_subj=Subject.objects.filter(school=school,code='MAT').first()
  sci_subj=Subject.objects.filter(school=school,code='SCI').first()
  if math_subj and klass:
   ClassSubjectTeacher.objects.get_or_create(school_class=klass,subject=math_subj,defaults={'teacher':teacher})
  if sci_subj and klass:
   ClassSubjectTeacher.objects.get_or_create(school_class=klass,subject=sci_subj,defaults={'teacher':teacher})
  if math_subj and klass and pupil:
   if not SubjectMessage.objects.filter(school_class=klass,subject=math_subj).exists():
    q1=SubjectMessage.objects.create(school_class=klass,subject=math_subj,sender=pupil,message='Hello Mr. Cole! For question 4 on page 52, should we use the quadratic formula or factorisation?')
    SubjectMessage.objects.create(school_class=klass,subject=math_subj,sender=teacher,message='Hi Sophia, either method is completely valid. Factorisation is quicker for this problem, but the quadratic formula will yield the exact same answer.',is_teacher_answer=True,reply_to=q1)
  self.stdout.write(self.style.SUCCESS('Demo ready: admin / teacher / principal / teacher_west / principal_west / student_demo / parent_demo — password DemoPass123!'))
