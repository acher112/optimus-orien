from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
 dependencies=[('core','0001_initial')]
 operations=[
  migrations.CreateModel(name='SchoolConfiguration',fields=[
   ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
   ('country',models.CharField(blank=True,max_length=2,help_text='ISO 3166-1 alpha-2 country code')),
   ('jurisdiction',models.CharField(blank=True,max_length=120)),
   ('timezone',models.CharField(blank=True,max_length=80)),
   ('language',models.CharField(blank=True,max_length=32)),
   ('locale',models.CharField(blank=True,max_length=32)),
   ('programmes',models.JSONField(blank=True,default=list)),
   ('academic_year_name',models.CharField(blank=True,max_length=80)),
   ('academic_start',models.DateField(blank=True,null=True)),
   ('academic_end',models.DateField(blank=True,null=True)),
   ('reporting_periods',models.JSONField(blank=True,default=list)),
   ('grading_policy',models.JSONField(blank=True,default=dict)),
   ('attendance_policy',models.JSONField(blank=True,default=dict)),
   ('school_settings',models.JSONField(blank=True,default=dict)),
   ('status',models.CharField(choices=[('draft','Draft'),('active','Active')],default='draft',max_length=12)),
   ('active_version',models.PositiveIntegerField(default=0)),
   ('activated_at',models.DateTimeField(blank=True,null=True)),
   ('updated_at',models.DateTimeField(auto_now=True)),
   ('activated_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name='activated_school_configurations',to=settings.AUTH_USER_MODEL)),
   ('school',models.OneToOneField(on_delete=django.db.models.deletion.PROTECT,related_name='configuration',to='core.school'))
  ],options={'ordering':['school__name']}),
  migrations.CreateModel(name='SchoolConfigurationVersion',fields=[
   ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
   ('version',models.PositiveIntegerField()),
   ('snapshot',models.JSONField()),
   ('activated_at',models.DateTimeField(auto_now_add=True)),
   ('activated_by',models.ForeignKey(null=True,on_delete=django.db.models.deletion.SET_NULL,to=settings.AUTH_USER_MODEL)),
   ('configuration',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='versions',to='core.schoolconfiguration'))
  ],options={'ordering':['-version']}),
  migrations.CreateModel(name='PublishedSchoolIndicator',fields=[
   ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
   ('title',models.CharField(max_length=100)),
   ('period_label',models.CharField(max_length=80)),
   ('value',models.DecimalField(decimal_places=2,max_digits=7)),
   ('unit',models.CharField(default='%',max_length=24)),
   ('methodology',models.CharField(max_length=500)),
   ('eligible_population',models.PositiveIntegerField()),
   ('completeness_note',models.CharField(max_length=300)),
   ('approved_for_publication',models.BooleanField(default=False)),
   ('published_at',models.DateTimeField(blank=True,null=True)),
   ('approved_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='approved_indicators',to=settings.AUTH_USER_MODEL)),
   ('school',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='public_indicators',to='core.school'))
  ],options={'ordering':['-published_at','school__name']}),
  migrations.AddConstraint(model_name='schoolconfigurationversion',constraint=models.UniqueConstraint(fields=['configuration','version'],name='unique_school_config_version')),
 ]
