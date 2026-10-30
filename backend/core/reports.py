"""Drill-down reporting: Organisation -> Campus -> Class -> Subject (-> students).

Calculation policy (Spec Part 13.2 / Part 15 section 8-10)
---------------------------------------------------------
* Only PUBLISHED assessments are used.
* A student's subject result is the WEIGHTED average (by assessment weight) of that
  student's percentages (marks / max_marks) in that class and subject.
* A subject / class / campus average is the simple average of those student results
  (never an average of raw marks and never an average of campus averages).
* A student's overall result is the simple mean of that student's subject results
  (no per-subject weighting is configured yet) and a class/campus overall average is
  the simple average of those student overall results.
* Missing results are NEVER counted as zero. They are counted and reported
  separately (an assessment's eligible students are those enrolled in the class on
  the assessment date).
* Attendance rate = (present + late) / all recorded sessions (excused sessions stay
  in the denominator, identical to the dashboard). Missing registers are not
  treated as absence.
* The reporting period comes from each school's SchoolConfiguration.reporting_periods.
  A school without a period of that name is reported as "period not configured" and is
  excluded from the numbers rather than silently using different dates.

Access: aggregates are available to organisation admins, school admins, principals
(own campus) and teachers (own classes). Identifiable student rows are only returned
to those who may see student records (organisation admins need the explicit
organisation policy). Every drill-down level re-checks scope server-side.
"""
from collections import defaultdict
from datetime import date

from django.db.models import Count
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from core.models import (Assessment, Attendance, Enrollment, Grade, School, SchoolClass,
                         SchoolConfiguration)
from core.services.access import classes_scope, schools_scope
from core.services.filters import sort_comparison_rows

MIN_GROUP = 3   # smallest boy/girl group whose average may be shown
REPORT_ROLES = ('organisation_admin', 'school_admin', 'principal', 'teacher')
BINS = [(0, 40, '0–39'), (40, 50, '40–49'), (50, 60, '50–59'), (60, 70, '60–69'),
        (70, 80, '70–79'), (80, 90, '80–89'), (90, 101, '90–100')]
METHOD = {
    'average_basis': 'Weighted average of each student\'s assessment percentages per subject; class, campus and organisation averages are simple averages of those student results.',
    'overall_basis': 'A student\'s overall result is the simple mean of their subject results (no subject weighting is configured yet).',
    'missing_policy': 'Missing results are excluded and reported separately; they are never counted as zero.',
    'attendance_basis': 'Attendance rate = (present + late) / all recorded sessions; excused sessions stay in the denominator; missing registers are not treated as absence.',
    'assessments': 'Published assessments only.',
    'population': 'Students enrolled in the class at any time during the selected period (whole academic record when no period is chosen).',
    'comparability': 'Same subject names or codes across campuses/classes do not guarantee identical curriculum or assessment difficulty.',
}


# ----------------------------------------------------------------------------- helpers
def _mean(values):
    values = list(values)
    return round(sum(values) / len(values), 1) if values else None


def _check_role(user):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Authentication required')
    if user.is_superuser:
        return
    if user.role not in REPORT_ROLES:
        raise PermissionDenied('Reports require staff access')


def can_see_students(user):
    if user.is_superuser:
        return True
    if user.role in ('school_admin', 'principal', 'teacher'):
        return True
    if user.role == 'organisation_admin':
        return bool(getattr(user.organisation, 'allow_org_admin_student_access', False))
    return False


def _school_or_404(user, school_id):
    school = schools_scope(user).filter(pk=school_id).first()
    if not school:
        raise NotFound('Campus not found')
    return school


def _class_or_404(user, class_id):
    klass = classes_scope(user).select_related('school', 'teacher', 'academic_year').filter(pk=class_id).first()
    if not klass:
        raise NotFound('Class not found')
    return klass


def _parse_iso(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def _windows(schools, period):
    """school_id -> (start, end, available). No period => unbounded and available."""
    period = (period or '').strip()
    if not period:
        return {s.id: (None, None, True) for s in schools}
    periods = {c.school_id: c.reporting_periods or []
               for c in SchoolConfiguration.objects.filter(school__in=[s.id for s in schools])}
    out = {}
    for s in schools:
        match = next((p for p in periods.get(s.id, []) if isinstance(p, dict) and p.get('name') == period), None)
        start = _parse_iso(match.get('start')) if match else None
        end = _parse_iso(match.get('end')) if match else None
        out[s.id] = (start, end, bool(match and start and end))
    return out


def available_periods(schools):
    names = []
    for c in SchoolConfiguration.objects.filter(school__in=[s.id for s in schools]).select_related('school'):
        for p in c.reporting_periods or []:
            if isinstance(p, dict) and p.get('name') and p['name'] not in names:
                names.append(p['name'])
    return names


def _in_window(window, day):
    start, end, ok = window
    return ok and (start is None or day >= start) and (end is None or day <= end)


def _overlaps(window, e_start, e_end):
    start, end, ok = window
    if not ok:
        return False
    if end is not None and e_start > end:
        return False
    if start is not None and e_end is not None and e_end < start:
        return False
    return True


class Data:
    """All grade / enrolment facts for a set of classes inside the school windows."""

    def __init__(self, classes, windows, subject_filter=None):
        self.classes = list(classes)
        self.windows = windows
        self.cmap = {c.id: c for c in self.classes}
        cids = [c.id for c in self.classes if windows[c.school_id][2]]
        self.active_class_ids = set(cids)
        # population: students enrolled in a class during the window
        self.population = defaultdict(set)
        enrol = list(Enrollment.objects.filter(school_class_id__in=cids).values(
            'student_id', 'school_class_id', 'start_date', 'end_date'))
        self.enrol = defaultdict(list)
        for e in enrol:
            self.enrol[e['school_class_id']].append(e)
            if _overlaps(windows[self.cmap[e['school_class_id']].school_id], e['start_date'], e['end_date']):
                self.population[e['school_class_id']].add(e['student_id'])
        qs = Assessment.objects.filter(school_class_id__in=cids, published=True).select_related('subject')
        if subject_filter:
            qs = qs.filter(subject__code=subject_filter)
        self.assessments = [a for a in qs
                            if _in_window(windows[self.cmap[a.school_class_id].school_id], a.date)]
        self.amap = {a.id: a for a in self.assessments}
        self.grades = defaultdict(list)  # assessment_id -> [(student_id, pct)]
        for aid, sid, marks in Grade.objects.filter(assessment_id__in=list(self.amap)).values_list(
                'assessment_id', 'student_id', 'marks'):
            a = self.amap[aid]
            if a.max_marks:
                self.grades[aid].append((sid, float(marks) / float(a.max_marks) * 100))
        # (class_id, subject_id) -> facts
        self.cs = {}
        for a in self.assessments:
            key = (a.school_class_id, a.subject_id)
            f = self.cs.setdefault(key, {'class_id': a.school_class_id, 'subject': a.subject, 'assessments': [],
                                          'eligible': set(), 'missing_results': 0, 'records': 0, 'parts': defaultdict(list)})
            elig = {e['student_id'] for e in self.enrol[a.school_class_id]
                    if e['start_date'] <= a.date and (e['end_date'] is None or e['end_date'] >= a.date)}
            graded = {sid for sid, _ in self.grades[a.id]}
            f['assessments'].append(a)
            f['eligible'] |= elig
            f['missing_results'] += len(elig - graded)
            for sid, pct in self.grades[a.id]:
                f['parts'][sid].append((pct, float(a.weight)))
                f['records'] += 1
        for f in self.cs.values():
            f['results'] = {sid: sum(p * w for p, w in parts) / sum(w for _, w in parts)
                            for sid, parts in f['parts'].items()}

    # -- roll-ups ---------------------------------------------------------------
    def keys(self, class_ids=None, subject_code=None):
        return [k for k, f in self.cs.items()
                if (class_ids is None or f['class_id'] in class_ids)
                and (subject_code is None or f['subject'].code == subject_code)]

    def rollup(self, keys, class_ids=None):
        per_student = defaultdict(list)  # (student, class) -> subject results
        records = missing = 0
        eligible = set()
        for k in keys:
            f = self.cs[k]
            records += f['records']
            missing += f['missing_results']
            eligible |= {(sid, f['class_id']) for sid in f['eligible']}
            for sid, val in f['results'].items():
                per_student[(sid, f['class_id'])].append(val)
        overall = [sum(v) / len(v) for v in per_student.values()]
        eligible_n = len(eligible)
        with_results = len(per_student)
        return {
            'academic_average': _mean(overall),
            'valid_results': records,
            'missing_results': missing,
            'students_with_results': with_results,
            'students_without_results': max(eligible_n - with_results, 0),
            'completeness': round(with_results / eligible_n * 100, 1) if eligible_n else None,
        }

    def subject_stats(self, keys):
        values = [v for k in keys for v in self.cs[k]['results'].values()]
        records = sum(self.cs[k]['records'] for k in keys)
        missing = sum(self.cs[k]['missing_results'] for k in keys)
        eligible = set()
        for k in keys:
            eligible |= {(s, self.cs[k]['class_id']) for s in self.cs[k]['eligible']}
        return {
            'average': _mean(values),
            'min': round(min(values), 1) if values else None,
            'max': round(max(values), 1) if values else None,
            'valid_students': len(values),
            'eligible_students': len(eligible),
            'valid_results': records,
            'missing_results': missing,
            'assessments': sum(len(self.cs[k]['assessments']) for k in keys),
            'distribution': [{'band': label, 'count': sum(1 for v in values if lo <= v < hi)} for lo, hi, label in BINS],
        }

    def gender_split(self, keys):
        """Boys / girls average over the same student results as rollup().

        Privacy: if any non-empty group is smaller than MIN_GROUP, BOTH averages are hidden
        (otherwise a hidden small group could be back-calculated from the total)."""
        per_student = defaultdict(list)
        for k in keys:
            f = self.cs[k]
            for sid, val in f['results'].items():
                per_student[(sid, f['class_id'])].append(val)
        if not hasattr(self, '_gender'):
            from core.models import Student
            ids = {sid for f in self.cs.values() for sid in f['results']}
            self._gender = dict(Student.objects.filter(pk__in=ids).values_list('id', 'gender'))
        groups = {'male': [], 'female': []}
        unspecified = 0
        for (sid, _), vals in per_student.items():
            g = self._gender.get(sid, '')
            if g in groups:
                groups[g].append(sum(vals) / len(vals))
            else:
                unspecified += 1
        hidden = any(0 < len(v) < MIN_GROUP for v in groups.values())
        def pack(v):
            return {'students': len(v), 'average': None if hidden or not v else _mean(v)}
        return {'boys': pack(groups['male']), 'girls': pack(groups['female']),
                'unspecified': unspecified, 'hidden': hidden, 'min_group': MIN_GROUP}

    def basis(self, class_id):
        """Assessment structure signature used to decide whether classes are comparable."""
        sig = sorted((f['subject'].code, len(f['assessments']),
                      tuple(sorted((float(a.max_marks), float(a.weight)) for a in f['assessments'])))
                     for k, f in self.cs.items() if f['class_id'] == class_id)
        return sig



def _attendance(data):
    by_class = defaultdict(lambda: defaultdict(int))
    by_school = defaultdict(list)
    for c in data.classes:
        if c.id in data.active_class_ids:
            by_school[c.school_id].append(c.id)
    for sid, cids in by_school.items():
        start, end, _ = data.windows[sid]
        qs = Attendance.objects.filter(school_class_id__in=cids)
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        for row in qs.values('school_class_id', 'status').annotate(n=Count('id')):
            by_class[row['school_class_id']][row['status']] += row['n']
    return by_class


def _att_summary(counts_list):
    total = defaultdict(int)
    for counts in counts_list:
        for k, v in counts.items():
            total[k] += v
    recorded = sum(total.values())
    present_eq = total['present'] + total['late']
    return {'rate': round(present_eq / recorded * 100, 1) if recorded else None,
            'recorded': recorded, 'present': total['present'], 'late': total['late'],
            'absent': total['absent'], 'excused': total['excused']}


def _basis_text(sig):
    if not sig:
        return 'No published assessments'
    return '; '.join(f"{code}: {n} assessments (max/weight {', '.join(f'{m:g}/{w:g}' for m, w in parts)})" for code, n, parts in sig)


def _period_payload(period, windows, schools):
    return {
        'name': (period or '').strip() or None,
        'label': (period or '').strip() or 'Whole academic record',
        'options': available_periods(schools),
        'unavailable_campuses': [s.name for s in schools if not windows[s.id][2]],
    }


def _envelope(user, **extra):
    return {'method': METHOD, 'generated_at': timezone.now().isoformat(),
            'student_rows_allowed': can_see_students(user), **extra}


# ----------------------------------------------------------------------------- endpoints
@api_view(['GET'])
def overview(request):
    user = request.user
    _check_role(user)
    if user.role == 'teacher' and not user.is_superuser:
        raise PermissionDenied('Teachers may not access organisation-wide reports.')
    period = request.query_params.get('period', '')
    schools = list(schools_scope(user).order_by('name'))
    windows = _windows(schools, period)
    classes = list(classes_scope(user).select_related('school'))
    data = Data(classes, windows)
    att = _attendance(data)
    campuses = []
    for s in schools:
        cids = {c.id for c in classes if c.school_id == s.id}
        roll = data.rollup(data.keys(cids))
        students = set()
        for cid in cids:
            students |= data.population[cid]
        campuses.append({
            'id': s.id, 'name': s.name, 'city': s.city, 'classes': len(cids), 'students': len(students),
            **roll, 'average': roll.get('academic_average'), 'gender': data.gender_split(data.keys(cids)),
            'attendance_rate': _att_summary([att[c] for c in cids])['rate'],
            'period_available': windows[s.id][2],
        })
    subjects = {}
    for k, f in data.cs.items():
        subjects.setdefault(f['subject'].code, {'code': f['subject'].code, 'names': set(), 'keys': []})
        subjects[f['subject'].code]['names'].add(f['subject'].name)
        subjects[f['subject'].code]['keys'].append(k)
    subject_rows = []
    for code, info in sorted(subjects.items()):
        by_campus = []
        for s in schools:
            keys = [k for k in info['keys'] if data.cmap[k[0]].school_id == s.id]
            if keys:
                st = data.subject_stats(keys)
                by_campus.append({'school_id': s.id, 'school_name': s.name, 'average': st['average'],
                                  'valid_students': st['valid_students'], 'missing_results': st['missing_results']})
        st = data.subject_stats(info['keys'])
        subject_rows.append({'code': code, 'name': ' / '.join(sorted(info['names'])), 'average': st['average'],
                             'valid_students': st['valid_students'], 'valid_results': st['valid_results'],
                             'missing_results': st['missing_results'], 'by_campus': by_campus,
                             'gender': data.gender_split(info['keys'])})
    students_all = set()
    for cid in data.population:
        students_all |= data.population[cid]
    overall = {**data.rollup(data.keys()), 'attendance_rate': _att_summary(att.values())['rate'],
               'students': len(students_all), 'campuses': len(schools), 'classes': len(classes),
               'gender': data.gender_split(data.keys())}

    sort_by = request.query_params.get('sort_by') or 'average'
    order = request.query_params.get('order') or 'desc'
    campuses = sort_comparison_rows(campuses, metric_key=sort_by, name_key='name', reverse=(order != 'asc'))
    for sub in subject_rows:
        sub['by_campus'] = sort_comparison_rows(sub['by_campus'], metric_key='average', name_key='school_name', reverse=True)
    subject_rows = sort_comparison_rows(subject_rows, metric_key='average', name_key='name', reverse=True)

    return Response(_envelope(
        user, level='organisation', period=_period_payload(period, windows, schools), overall=overall,
        campuses=campuses, subjects=subject_rows,
        comparability_note='Campus figures use each campus\'s own assessments; they are shown side by side but are not a ranking.'))


@api_view(['GET'])
def campus(request, school_id):
    user = request.user
    _check_role(user)
    school = _school_or_404(user, school_id)
    period = request.query_params.get('period', '')
    windows = _windows([school], period)
    classes = list(classes_scope(user).filter(school=school).select_related('school', 'teacher').order_by('grade_level', 'name'))
    data = Data(classes, windows)
    att = _attendance(data)
    class_rows, bases = [], {}
    for c in classes:
        roll = data.rollup(data.keys({c.id}))
        sig = data.basis(c.id)
        bases[c.id] = sig
        class_rows.append({
            'id': c.id, 'name': c.name, 'grade_level': c.grade_level,
            'teacher': (c.teacher.get_full_name() or c.teacher.username) if c.teacher else 'Unassigned',
            'students': len(data.population[c.id]), **roll, 'gender': data.gender_split(data.keys({c.id})),
            'attendance_rate': _att_summary([att[c.id]])['rate'], 'assessment_basis': _basis_text(sig)})
    subject_rows = {}
    for k, f in data.cs.items():
        subject_rows.setdefault(f['subject'].code, []).append(k)
    subjects = []
    for code, keys in sorted(subject_rows.items()):
        st = data.subject_stats(keys)
        per_class, sigs = [], set()
        for k in keys:
            f = data.cs[k]
            cstat = data.subject_stats([k])
            sig = tuple(sorted((float(a.max_marks), float(a.weight)) for a in f['assessments']))
            sigs.add(sig)
            per_class.append({'class_id': f['class_id'], 'class_name': data.cmap[f['class_id']].name,
                              'average': cstat['average'], 'valid_students': cstat['valid_students'],
                              'missing_results': cstat['missing_results'], 'assessments': cstat['assessments']})
        comparable = len(sigs) <= 1
        per_class = sort_comparison_rows(per_class, metric_key='average', name_key='class_name', reverse=True)
        subjects.append({'code': code, 'name': data.cs[keys[0]]['subject'].name, **{k: st[k] for k in (
            'average', 'valid_students', 'eligible_students', 'valid_results', 'missing_results', 'assessments')},
            'classes': per_class, 'comparable': comparable, 'gender': data.gender_split(keys),
            'comparability_note': None if comparable else
            'Classes use different assessment structures (number, weights or maximum marks) for this subject, so their averages are not directly equivalent.'})
    students_all = set()
    for cid in data.population:
        students_all |= data.population[cid]
    overall = {**data.rollup(data.keys()), 'attendance_rate': _att_summary(att.values())['rate'],
               'students': len(students_all), 'classes': len(classes), 'gender': data.gender_split(data.keys())}

    sort_by = request.query_params.get('sort_by') or 'average'
    order = request.query_params.get('order') or 'desc'
    class_rows = sort_comparison_rows(class_rows, metric_key=sort_by, name_key='name', reverse=(order != 'asc'))
    subjects = sort_comparison_rows(subjects, metric_key='average', name_key='name', reverse=True)

    return Response(_envelope(
        user, level='campus', period=_period_payload(period, windows, [school]),
        campus={'id': school.id, 'name': school.name, 'city': school.city},
        overall=overall, classes=class_rows, subjects=subjects))


@api_view(['GET'])
def class_report(request, class_id):
    user = request.user
    _check_role(user)
    klass = _class_or_404(user, class_id)
    period = request.query_params.get('period', '')
    windows = _windows([klass.school], period)
    data = Data([klass], windows)
    att = _attendance(data)
    subjects = []
    for k in sorted(data.keys({klass.id}), key=lambda k: data.cs[k]['subject'].name):
        f = data.cs[k]
        subjects.append({'code': f['subject'].code, 'name': f['subject'].name, **data.subject_stats([k]),
                         'gender': data.gender_split([k])})
    students = []
    if can_see_students(user):
        from core.models import Student
        names = {s.id: s for s in Student.objects.filter(pk__in=data.population[klass.id])}
        per_student = defaultdict(dict)
        for k in data.keys({klass.id}):
            f = data.cs[k]
            for sid, val in f['results'].items():
                per_student[sid][f['subject'].code] = round(val, 1)
        for sid in sorted(data.population[klass.id], key=lambda i: (names[i].last_name, names[i].first_name) if i in names else ('', '')):
            vals = per_student.get(sid, {})
            students.append({'id': sid, 'name': names[sid].full_name if sid in names else f'Student {sid}',
                             'admission_number': names[sid].admission_number if sid in names else '',
                             'overall': _mean(vals.values()), 'subjects': vals,
                             'has_results': bool(vals)})
        students = sort_comparison_rows(students, metric_key='overall', name_key='name', reverse=True)
    if user.role == 'teacher' and not user.is_superuser:
        from core.services.teacher_scope import get_teacher_scope
        t_scope = get_teacher_scope(user, request)
        if not t_scope.is_class_teacher(klass.id):
            allowed_codes = {data.cs[k]['subject'].code for k in data.keys({klass.id}) if t_scope.teaches_subject(klass.id, data.cs[k]['subject'].id)}
            subjects = [s for s in subjects if s['code'] in allowed_codes]
            for st in students:
                st['subjects'] = {k: v for k, v in st.get('subjects', {}).items() if k in allowed_codes}
                st['overall'] = _mean(st['subjects'].values())
                st['has_results'] = bool(st['subjects'])
    subjects = sort_comparison_rows(subjects, metric_key='average', name_key='name', reverse=True)
    return Response(_envelope(
        user, level='class', period=_period_payload(period, windows, [klass.school]),
        campus={'id': klass.school_id, 'name': klass.school.name},
        klass={'id': klass.id, 'name': klass.name, 'grade_level': klass.grade_level,
               'teacher': (klass.teacher.get_full_name() or klass.teacher.username) if klass.teacher else 'Unassigned'},
        overall={**data.rollup(data.keys()), 'gender': data.gender_split(data.keys()), 'students': len(data.population[klass.id]),
                 'attendance': _att_summary([att[klass.id]])},
        subjects=subjects, students=students))


@api_view(['GET'])
def subject_report(request, school_id, code):
    user = request.user
    _check_role(user)
    school = _school_or_404(user, school_id)
    period = request.query_params.get('period', '')
    windows = _windows([school], period)
    qs = classes_scope(user).filter(school=school).select_related('school', 'teacher')
    only_class = request.query_params.get('class')
    if only_class:
        try:
            qs = qs.filter(pk=int(only_class))
        except ValueError:
            raise NotFound('Class not found')
        if not qs.exists():
            raise NotFound('Class not found')
    classes = list(qs)
    data = Data(classes, windows, subject_filter=code)
    keys = data.keys(subject_code=code)
    if not keys and not school.subject_set.filter(code=code).exists():
        raise NotFound('Subject not found')
    if user.role == 'teacher' and not user.is_superuser:
        from core.services.teacher_scope import get_teacher_scope
        t_scope = get_teacher_scope(user, request)
        valid_classes = [c for c in classes if any(t_scope.can_view_subject(c.id, data.cs[k]['subject'].id) for k in data.keys({c.id}, code))]
        if not valid_classes:
            raise NotFound('Subject not found or outside authorized scope')
        classes = valid_classes
        data = Data(classes, windows, subject_filter=code)
        keys = data.keys(subject_code=code)
    name = data.cs[keys[0]]['subject'].name if keys else school.subject_set.get(code=code).name
    per_class = []
    for c in classes:
        ck = data.keys({c.id}, code)
        st = data.subject_stats(ck)
        per_class.append({'class_id': c.id, 'class_name': c.name, 'grade_level': c.grade_level, **st,
                          'gender': data.gender_split(ck)})
    per_class = sort_comparison_rows(per_class, metric_key='average', name_key='class_name', reverse=True)
    assessments = []
    for a in sorted(data.assessments, key=lambda a: (a.date, a.id)):
        graded = data.grades[a.id]
        elig = {e['student_id'] for e in data.enrol[a.school_class_id]
                if e['start_date'] <= a.date and (e['end_date'] is None or e['end_date'] >= a.date)}
        assessments.append({'id': a.id, 'title': a.title, 'date': a.date.isoformat(), 'class_id': a.school_class_id,
                            'class_name': data.cmap[a.school_class_id].name, 'max_marks': float(a.max_marks),
                            'weight': float(a.weight), 'graded': len(graded),
                            'eligible': len(elig), 'missing': len(elig - {s for s, _ in graded}),
                            'average': _mean(p for _, p in graded)})
    students = []
    if can_see_students(user):
        from core.models import Student
        rows = {}
        for k in keys:
            for sid, val in data.cs[k]['results'].items():
                rows[(sid, data.cs[k]['class_id'])] = round(val, 1)
        names = {s.id: s for s in Student.objects.filter(pk__in={sid for sid, _ in rows})}
        for (sid, cid), val in sorted(rows.items(), key=lambda kv: (data.cmap[kv[0][1]].name, -kv[1])):
            students.append({'id': sid, 'name': names[sid].full_name, 'admission_number': names[sid].admission_number,
                             'class_name': data.cmap[cid].name, 'result': val})
        students = sort_comparison_rows(students, metric_key='result', name_key='name', reverse=True)
    comparable = len({tuple(sorted((float(a.max_marks), float(a.weight)) for a in data.cs[k]['assessments'])) for k in keys}) <= 1
    return Response(_envelope(
        user, level='subject', period=_period_payload(period, windows, [school]),
        campus={'id': school.id, 'name': school.name}, subject={'code': code, 'name': name},
        overall={**data.subject_stats(keys), 'gender': data.gender_split(keys)}, classes=per_class, assessments=assessments, students=students,
        comparable=comparable))


# ----------------------------------------------------------------------------- student "My performance"
@api_view(['GET'])
def my_performance(request):
    """A student (or parent, for one ward) sees own subject results next to the boys and girls
    averages of the same class. Cohort averages are hidden when a group is too small."""
    from core.models import Student
    user = request.user
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied('Active account required')
    if user.role == 'student':
        students = Student.objects.filter(user=user)
    elif user.role == 'parent':
        students = Student.objects.filter(guardians=user)
    else:
        raise PermissionDenied('This page is for students and parents')
    wards = list(students.select_related('school'))
    if not wards:
        raise NotFound('No student record is linked to this account')
    pick = request.query_params.get('student')
    student = next((w for w in wards if str(w.id) == pick), wards[0])
    enrol = Enrollment.objects.filter(student=student, end_date__isnull=True).select_related('school_class').first() \
        or Enrollment.objects.filter(student=student).select_related('school_class').order_by('-start_date').first()
    base = {'student': {'id': student.id, 'name': student.full_name, 'gender': student.gender},
            'wards': [{'id': w.id, 'name': w.full_name} for w in wards], 'min_group': MIN_GROUP,
            'method': {'basis': METHOD['average_basis'], 'missing': METHOD['missing_policy'], 'assessments': METHOD['assessments']}}
    if not enrol:
        return Response({**base, 'class': None, 'subjects': [], 'overall': None})
    klass = enrol.school_class
    period = request.query_params.get('period', '')
    windows = _windows([klass.school], period)
    data = Data([klass], windows)
    rows = []
    for k in sorted(data.keys({klass.id}), key=lambda k: data.cs[k]['subject'].name):
        f = data.cs[k]
        split = data.gender_split([k])
        own = f['results'].get(student.id)
        rows.append({'code': f['subject'].code, 'name': f['subject'].name,
                     'mine': None if own is None else round(own, 1),
                     'boys': split['boys']['average'], 'girls': split['girls']['average'],
                     'hidden': split['hidden'], 'class_average': data.subject_stats([k])['average']})
    mine_vals = [r['mine'] for r in rows if r['mine'] is not None]
    overall_split = data.gender_split(data.keys())
    return Response({**base, 'class': {'id': klass.id, 'name': klass.name, 'school': klass.school.name},
                     'period': _period_payload(period, windows, [klass.school]),
                     'overall': {'mine': _mean(mine_vals), 'boys': overall_split['boys']['average'],
                                 'girls': overall_split['girls']['average'], 'hidden': overall_split['hidden']},
                     'subjects': rows})
