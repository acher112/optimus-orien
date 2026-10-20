"""School onboarding policy from Part 19 SCH-001 through SCH-006.

Editable drafts never become authoritative until an authorised activation. This
phase captures setup records; specialist assessment/attendance engines are NOT
wired to these values yet (see REMAINING_REQUIREMENTS.md).
"""
from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from django.core.exceptions import ValidationError as DjangoValidationError

CONFIG_FIELDS = ('country','jurisdiction','timezone','language','locale','programmes',
                 'academic_year_name','academic_start','academic_end','reporting_periods',
                 'grading_policy','attendance_policy','school_settings')


def setup_snapshot(config):
 result={}
 for field in CONFIG_FIELDS:
  value=getattr(config,field)
  result[field]=value.isoformat() if isinstance(value,date) else value
 result['school_id']=config.school_id
 result['school_name']=config.school.name
 result['organisation_id']=config.school.organisation_id
 return result


def readiness(config):
 """Return field-specific reasons, with no guessed default grading policy."""
 issues={}
 if not config: return {'complete':False,'issues':{'setup':'School setup has not started'}}
 if not config.school.name.strip() or not config.school.code.strip():
  issues['school']='School identity is required'
 if not isinstance(config.country,str) or len(config.country)!=2 or not config.country.isalpha() or not config.country.isupper():
  issues['country']='Provide an uppercase two-letter country code (ISO 3166-1)'
 if not config.timezone:
  issues['timezone']='A school time zone is required'
 else:
  try:ZoneInfo(config.timezone)
  except (ZoneInfoNotFoundError,ValueError,TypeError):issues['timezone']='Choose a valid IANA time zone'
 if not config.language.strip():issues['language']='Preferred language is required'
 if not config.locale.strip():issues['locale']='Locale is required'
 programmes=config.programmes
 if not isinstance(programmes,list) or not programmes or any(not isinstance(p,str) or not p.strip() for p in programmes):
  issues['programmes']='Provide one or more named educational programmes'
 elif len(set(p.strip().casefold() for p in programmes))!=len(programmes):
  issues['programmes']='Duplicate programme names are not allowed'
 if not config.academic_year_name.strip():issues['academic_year_name']='Academic year label is required'
 if not config.academic_start or not config.academic_end:
  issues['academic_dates']='Academic year start and end dates are required'
 elif config.academic_end <= config.academic_start:
  issues['academic_dates']='Academic year must end after it starts'
 periods=config.reporting_periods
 if not isinstance(periods,list) or not periods:
  issues['reporting_periods']='Provide at least one named reporting period'
 elif config.academic_start and config.academic_end and config.academic_start < config.academic_end:
  found=[]
  for idx,p in enumerate(periods):
   try:
    if not isinstance(p,dict):raise ValueError('Bad period')
    name=p.get('name')
    start=date.fromisoformat(p.get('start',''))
    end=date.fromisoformat(p.get('end',''))
    if not isinstance(name,str) or not name.strip():raise ValueError('Missing period name')
    if not config.academic_start<=start<=end<=config.academic_end:raise ValueError('Period must be within the academic year')
    for other_start,other_end in found:
     if start<=other_end and end>=other_start:raise ValueError('Reporting periods must not overlap')
    found.append((start,end))
   except (ValueError,TypeError) as exc:
    issues['reporting_periods']=f'Reporting period {idx+1}: {exc}'
    break
 if not isinstance(config.grading_policy,dict) or not config.grading_policy.get('approach') or not config.grading_policy.get('description'):
  issues['grading_policy']='Describe the approved grading approach and its calculation basis'
 if not isinstance(config.attendance_policy,dict) or not config.attendance_policy.get('recording_basis') or not config.attendance_policy.get('description'):
  issues['attendance_policy']='Describe eligible attendance opportunities and status handling'
 if not isinstance(config.school_settings,dict):issues['school_settings']='School-specific settings must be an object'
 return {'complete':not bool(issues),'issues':issues}
