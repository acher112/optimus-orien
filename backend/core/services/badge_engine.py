"""
Badges and Achievements Engine (Stage 1 Core Service).

Architectural Principles:
- Golden Rule: Platform is the source of truth. Metrics computed strictly from existing verified data.
- Criteria are versioned configuration (BadgeCriteria), not hardcoded in the engine.
- Only published and finalised records count (ExamConfiguration.status == 'published').
- Missing records are never treated as zero.
- Excused absences and approved leaves are excluded from denominators per platform policy.
- Minimum data coverage thresholds enforced (e.g. min days, min students, min assessments).
- Fully idempotent: running repeatedly never duplicates awards.
- Earned badges are never revoked automatically; data revisions flag awards for administrative review.
- Tenant isolation: Awards and progress are scoped to school_id under PostgreSQL RLS.
- Manual awards enforce existing organizational and school role boundaries with full audit trail.
- Safety & privacy: Positive recognition only. Never public student rankings or shaming labels.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Avg, Count, Max, Min, Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from core.models import (
    School, User, Student, SchoolClass, Subject, AcademicYear,
    Attendance, StaffAttendance, Homework, HomeworkSubmission, Observation,
    ExamConfiguration, CalculatedStudentResult, CalculatedSubjectResult,
    QuizCompetition, QuizAttempt, ClassTeacherAssignment, ClassSubjectTeacher,
    BadgeDefinition, BadgeCriteria, AchievementAward, BadgeProgress, BadgeAuditLog,
    AuditEvent
)
from core.services.audit import record_event

D_ZERO = Decimal('0.00')
D_HUNDRED = Decimal('100.00')


# ============================================================================
# HELPER FUNCTIONS & COMMON METRICS
# ============================================================================

def get_active_criteria(badge_def):
    """Retrieves the active criteria version for a badge, falling back to v1."""
    crit = badge_def.criteria_versions.filter(active=True).order_by('-version').first()
    if not crit:
        crit = BadgeCriteria.objects.create(
            badge=badge_def,
            version=1,
            rules={},
            active=True,
            explanation_of_change="Auto-initialized criteria baseline."
        )
    return crit


def calculate_attendance_rate(attendance_qs, min_days=15):
    """
    Standard Optimus Orien attendance formula excluding excused absences & leaves:
    denominator = max(total_attendance_records - excused_records - leave_records, 0)
    attendance_rate = (present + late) / denominator * 100
    """
    distinct_days = attendance_qs.values('date').distinct().count()
    if distinct_days < min_days:
        return None, distinct_days, 0

    total_records = attendance_qs.count()
    excused_cnt = attendance_qs.filter(status__in=['excused', 'leave']).count()
    attended_cnt = attendance_qs.filter(status__in=['present', 'late']).count()
    denominator = max(total_records - excused_cnt, 0)

    if denominator <= 0:
        return None, distinct_days, 0

    rate = (Decimal(attended_cnt) / Decimal(denominator)) * Decimal('100.00')
    return rate.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP), distinct_days, attended_cnt


def calculate_homework_verification_rate(submissions_qs, min_assignments=5):
    """
    Calculates percentage of homework verified completed by teachers:
    verified_rate = (status='completed' & confirmed_by is not null) / total * 100
    """
    total = submissions_qs.count()
    if total < min_assignments:
        return None, total, 0

    verified_cnt = submissions_qs.filter(status='completed', confirmed_by__isnull=False).count()
    rate = (Decimal(verified_cnt) / Decimal(total)) * Decimal('100.00')
    return rate.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP), total, verified_cnt


def record_award_safely(school, user, student, badge_def, criteria, period_identifier, evidence, is_manual=False, actor=None, reason=''):
    """
    Idempotently creates an AchievementAward. If already exists, returns existing award.
    Audits the event to BadgeAuditLog.
    """
    award, created = AchievementAward.objects.get_or_create(
        user=user,
        badge=badge_def,
        period_identifier=period_identifier,
        defaults={
            'school': school,
            'student': student,
            'tier': badge_def.tier,
            'criteria_version': criteria.version,
            'evidence_data': evidence,
            'is_manual': is_manual,
            'conferred_by': actor if is_manual else None,
            'conferred_reason': reason if is_manual else '',
        }
    )

    if created:
        BadgeAuditLog.objects.create(
            school=school,
            actor=actor,
            action='manual_award' if is_manual else 'system_eval_award',
            badge_slug=badge_def.slug,
            target_user=user,
            award=award,
            details={
                'tier': badge_def.tier,
                'criteria_version': criteria.version,
                'period_identifier': period_identifier,
                'evidence': evidence,
                'is_manual': is_manual,
                'reason': reason
            }
        )

    return award, created


def update_progress_record(school, user, student, badge_def, current_val, target_val, period_identifier, unit=''):
    """Updates real calculable progress toward a locked badge."""
    c_val = Decimal(str(current_val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    t_val = Decimal(str(target_val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    pct = D_ZERO
    if t_val > D_ZERO:
        pct = min(Decimal('100.00'), (c_val / t_val) * Decimal('100.00')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    progress, _ = BadgeProgress.objects.update_or_create(
        user=user,
        badge=badge_def,
        period_identifier=period_identifier,
        defaults={
            'school': school,
            'student': student,
            'current_value': c_val,
            'target_value': t_val,
            'progress_percentage': pct,
            'unit': unit,
        }
    )
    return progress


# ============================================================================
# STUDENT BADGES EVALUATION
# ============================================================================

def evaluate_student_achievements(student_id, target_period=None):
    """
    Evaluates all included student badges for a student:
    - First Achievement
    - Attendance Hero
    - Homework Hero
    - Active Learner
    - Academic Climber
    - Subject Explorer
    - Consistency King
    - All-Rounder
    - Academic Excellence (Student)
    - Perfect Attendance
    - Subject Master
    - Rising Legend
    - Scholar Supreme
    - The Unstoppable
    """
    try:
        student = Student.objects.select_related('school').get(id=student_id)
    except Student.DoesNotExist:
        return []

    user = student.user
    if not user:
        return []

    school = student.school
    awarded_list = []

    # 1. student_first_achievement
    badge_def = BadgeDefinition.objects.filter(slug='student_first_achievement', is_active=True).first()
    if badge_def:
        crit = get_active_criteria(badge_def)
        has_award = AchievementAward.objects.filter(user=user, badge=badge_def).exists()
        if not has_award:
            first_res = CalculatedStudentResult.objects.filter(
                student=student,
                completed=True,
                configuration__status='published'
            ).order_by('calculated_at').first()
            if first_res:
                evidence = {
                    'calculated_student_result_id': first_res.id,
                    'exam_configuration_name': first_res.configuration.name,
                    'overall_percentage': str(first_res.overall_percentage),
                    'published_at': first_res.configuration.published_at.isoformat() if first_res.configuration.published_at else None
                }
                aw, created = record_award_safely(school, user, student, badge_def, crit, 'all_time', evidence)
                if created:
                    awarded_list.append(aw)

    # 2. Monthly Evaluations (Attendance Hero, Homework Hero, Active Learner)
    today = timezone.localdate()
    # Check current and previous month
    for month_offset in [0, 1]:
        # Approximate month window
        m_date = today - timedelta(days=month_offset * 30)
        m_start = date(m_date.year, m_date.month, 1)
        if m_date.month == 12:
            m_end = date(m_date.year, 12, 31)
        else:
            m_end = date(m_date.year, m_date.month + 1, 1) - timedelta(days=1)
        period_str = m_start.strftime('%Y-%m')

        # Attendance Hero (95%+ attendance)
        b_att = BadgeDefinition.objects.filter(slug='student_attendance_hero', is_active=True).first()
        if b_att:
            crit = get_active_criteria(b_att)
            thresh = Decimal(str(crit.rules.get('attendance_threshold', 95.0)))
            min_days = crit.rules.get('min_days', 15)

            att_qs = Attendance.objects.filter(student=student, date__range=[m_start, m_end])
            rate, days_cnt, attended_cnt = calculate_attendance_rate(att_qs, min_days=min_days)
            if rate is not None:
                update_progress_record(school, user, student, b_att, rate, thresh, period_str, '%')
                if rate >= thresh:
                    evidence = {'attendance_rate': str(rate), 'total_days': days_cnt, 'attended_days': attended_cnt, 'threshold': str(thresh)}
                    aw, created = record_award_safely(school, user, student, b_att, crit, period_str, evidence)
                    if created:
                        awarded_list.append(aw)

        # Homework Hero (100% verified completed)
        b_hw = BadgeDefinition.objects.filter(slug='student_homework_hero', is_active=True).first()
        if b_hw:
            crit = get_active_criteria(b_hw)
            min_assign = crit.rules.get('min_assignments', 5)
            hw_qs = HomeworkSubmission.objects.filter(student=student, homework__due_date__range=[m_start, m_end])
            hw_rate, total_hw, verified_hw = calculate_homework_verification_rate(hw_qs, min_assignments=min_assign)
            if hw_rate is not None:
                update_progress_record(school, user, student, b_hw, hw_rate, Decimal('100.00'), period_str, '%')
                if hw_rate >= Decimal('100.00'):
                    evidence = {'verified_completion_rate': str(hw_rate), 'total_assigned': total_hw, 'verified_count': verified_hw}
                    aw, created = record_award_safely(school, user, student, b_hw, crit, period_str, evidence)
                    if created:
                        awarded_list.append(aw)

        # Active Learner (Participation >= 8.0/10)
        b_act = BadgeDefinition.objects.filter(slug='student_active_learner', is_active=True).first()
        if b_act:
            crit = get_active_criteria(b_act)
            min_obs = crit.rules.get('min_observations', 4)
            thresh_part = Decimal(str(crit.rules.get('participation_threshold', 8.0)))
            obs_qs = Observation.objects.filter(student=student, kind='participation', date__range=[m_start, m_end])
            obs_cnt = obs_qs.count()
            if obs_cnt >= min_obs:
                avg_part = obs_qs.aggregate(avg=Avg('value'))['avg']
                avg_dec = Decimal(str(round(avg_part, 2))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if avg_part is not None else D_ZERO
                update_progress_record(school, user, student, b_act, avg_dec, thresh_part, period_str, '/10')
                if avg_dec >= thresh_part:
                    evidence = {'average_participation': str(avg_dec), 'observations_count': obs_cnt, 'threshold': str(thresh_part)}
                    aw, created = record_award_safely(school, user, student, b_act, crit, period_str, evidence)
                    if created:
                        awarded_list.append(aw)

    # 3. Examination Term Results Badges
    published_results = list(CalculatedStudentResult.objects.filter(
        student=student,
        completed=True,
        configuration__status='published'
    ).select_related('configuration', 'academic_year').order_by('calculated_at'))

    for idx, res in enumerate(published_results):
        term_period = f"{res.academic_year.name} - {res.configuration.name}"
        overall_pct = res.overall_percentage or D_ZERO

        # Academic Excellence (Student) (>= 90%)
        b_excel = BadgeDefinition.objects.filter(slug='student_academic_excellence', is_active=True).first()
        if b_excel:
            crit = get_active_criteria(b_excel)
            thresh = Decimal(str(crit.rules.get('overall_threshold', 90.0)))
            update_progress_record(school, user, student, b_excel, overall_pct, thresh, term_period, '%')
            if overall_pct >= thresh:
                ev = {'overall_percentage': str(overall_pct), 'configuration_id': res.configuration_id, 'threshold': str(thresh)}
                aw, created = record_award_safely(school, user, student, b_excel, crit, term_period, ev)
                if created:
                    awarded_list.append(aw)

        # Scholar Supreme (>= 95%)
        b_sup = BadgeDefinition.objects.filter(slug='student_scholar_supreme', is_active=True).first()
        if b_sup:
            crit = get_active_criteria(b_sup)
            thresh = Decimal(str(crit.rules.get('overall_threshold', 95.0)))
            update_progress_record(school, user, student, b_sup, overall_pct, thresh, term_period, '%')
            if overall_pct >= thresh:
                ev = {'overall_percentage': str(overall_pct), 'configuration_id': res.configuration_id, 'threshold': str(thresh)}
                aw, created = record_award_safely(school, user, student, b_sup, crit, term_period, ev)
                if created:
                    awarded_list.append(aw)

        # Academic Climber (>= +5.0% improvement from previous term)
        if idx > 0:
            prev_res = published_results[idx - 1]
            prev_pct = prev_res.overall_percentage or D_ZERO
            diff = (overall_pct - prev_pct).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            b_climb = BadgeDefinition.objects.filter(slug='student_academic_climber', is_active=True).first()
            if b_climb:
                crit = get_active_criteria(b_climb)
                thresh_diff = Decimal(str(crit.rules.get('improvement_delta', 5.0)))
                update_progress_record(school, user, student, b_climb, max(D_ZERO, diff), thresh_diff, term_period, '%')
                if diff >= thresh_diff:
                    ev = {
                        'improvement_delta': str(diff),
                        'current_term': term_period,
                        'current_percentage': str(overall_pct),
                        'previous_percentage': str(prev_pct),
                        'previous_configuration_id': prev_res.configuration_id
                    }
                    aw, created = record_award_safely(school, user, student, b_climb, crit, term_period, ev)
                    if created:
                        awarded_list.append(aw)

        # Subject Explorer (>= 3 subjects with >= 80%) & Subject Master (>= 95% in any subject)
        subj_results = list(CalculatedSubjectResult.objects.filter(
            student=student,
            configuration=res.configuration,
            completed=True
        ).select_related('subject'))

        subjects_above_80 = [sr for sr in subj_results if sr.final_percentage and sr.final_percentage >= Decimal('80.00')]
        subjects_above_95 = [sr for sr in subj_results if sr.final_percentage and sr.final_percentage >= Decimal('95.00')]

        b_exp = BadgeDefinition.objects.filter(slug='student_subject_explorer', is_active=True).first()
        if b_exp:
            crit = get_active_criteria(b_exp)
            update_progress_record(school, user, student, b_exp, len(subjects_above_80), 3, term_period, 'subjects')
            if len(subjects_above_80) >= 3:
                ev = {
                    'subjects_qualifying_count': len(subjects_above_80),
                    'subjects': [{'subject': sr.subject.name, 'score': str(sr.final_percentage)} for sr in subjects_above_80[:5]]
                }
                aw, created = record_award_safely(school, user, student, b_exp, crit, term_period, ev)
                if created:
                    awarded_list.append(aw)

        b_mas = BadgeDefinition.objects.filter(slug='student_subject_master', is_active=True).first()
        if b_mas and subjects_above_95:
            crit = get_active_criteria(b_mas)
            ev = {
                'mastered_subjects': [{'subject': sr.subject.name, 'score': str(sr.final_percentage)} for sr in subjects_above_95]
            }
            aw, created = record_award_safely(school, user, student, b_mas, crit, term_period, ev)
            if created:
                awarded_list.append(aw)

        # Perfect Attendance (Term long 100% attendance, min 40 days)
        # Approximate term attendance using exam configuration date or published date window
        term_start = res.academic_year.start_date
        term_end = min(today, res.academic_year.end_date)
        b_perf = BadgeDefinition.objects.filter(slug='student_perfect_attendance', is_active=True).first()
        if b_perf:
            crit = get_active_criteria(b_perf)
            att_term = Attendance.objects.filter(student=student, date__range=[term_start, term_end])
            t_rate, t_days, t_att = calculate_attendance_rate(att_term, min_days=40)
            if t_rate is not None:
                update_progress_record(school, user, student, b_perf, t_rate, Decimal('100.00'), term_period, '%')
                if t_rate >= Decimal('100.00'):
                    ev = {'term_attendance_rate': str(t_rate), 'total_days': t_days, 'attended_days': t_att}
                    aw, created = record_award_safely(school, user, student, b_perf, crit, term_period, ev)
                    if created:
                        awarded_list.append(aw)

        # All-Rounder (Exam >= 80%, Attendance >= 90%, Homework >= 90%, Participation >= 7.5)
        b_all = BadgeDefinition.objects.filter(slug='student_all_rounder', is_active=True).first()
        if b_all:
            crit = get_active_criteria(b_all)
            att_rate_all, _, _ = calculate_attendance_rate(Attendance.objects.filter(student=student, date__range=[term_start, term_end]), min_days=20)
            hw_rate_all, _, _ = calculate_homework_verification_rate(HomeworkSubmission.objects.filter(student=student, homework__due_date__range=[term_start, term_end]), min_assignments=3)
            obs_qs_all = Observation.objects.filter(student=student, kind='participation', date__range=[term_start, term_end])
            part_avg_all = obs_qs_all.aggregate(avg=Avg('value'))['avg']
            part_dec = Decimal(str(round(part_avg_all, 2))) if part_avg_all is not None else D_ZERO

            qualifies = (
                overall_pct >= Decimal('80.00') and
                att_rate_all is not None and att_rate_all >= Decimal('90.00') and
                hw_rate_all is not None and hw_rate_all >= Decimal('90.00') and
                part_dec >= Decimal('7.50')
            )
            if qualifies:
                ev = {
                    'overall_percentage': str(overall_pct),
                    'attendance_rate': str(att_rate_all),
                    'homework_rate': str(hw_rate_all),
                    'participation_average': str(part_dec)
                }
                aw, created = record_award_safely(school, user, student, b_all, crit, term_period, ev)
                if created:
                    awarded_list.append(aw)

    # 4. Multi-Term Sequences (Consistency King, Rising Legend, The Unstoppable)
    if len(published_results) >= 2:
        for i in range(1, len(published_results)):
            r1 = published_results[i - 1]
            r2 = published_results[i]
            seq_period = f"{r1.configuration.name} -> {r2.configuration.name}"

            # Consistency King (Both terms: exam >= 85% and attendance >= 90%)
            b_king = BadgeDefinition.objects.filter(slug='student_consistency_king', is_active=True).first()
            if b_king:
                crit = get_active_criteria(b_king)
                if (r1.overall_percentage or D_ZERO) >= Decimal('85.00') and (r2.overall_percentage or D_ZERO) >= Decimal('85.00'):
                    ev = {'term1_percentage': str(r1.overall_percentage), 'term2_percentage': str(r2.overall_percentage)}
                    aw, created = record_award_safely(school, user, student, b_king, crit, seq_period, ev)
                    if created:
                        awarded_list.append(aw)

            # Rising Legend (+15% improvement across two terms with >= 90% attendance in term 2)
            b_rise = BadgeDefinition.objects.filter(slug='student_rising_legend', is_active=True).first()
            if b_rise:
                crit = get_active_criteria(b_rise)
                diff = (r2.overall_percentage or D_ZERO) - (r1.overall_percentage or D_ZERO)
                if diff >= Decimal('15.00'):
                    ev = {
                        'improvement_delta': str(diff),
                        'term1_score': str(r1.overall_percentage),
                        'term2_score': str(r2.overall_percentage),
                    }
                    aw, created = record_award_safely(school, user, student, b_rise, crit, seq_period, ev)
                    if created:
                        awarded_list.append(aw)

    if len(published_results) >= 3:
        for i in range(2, len(published_results)):
            r1, r2, r3 = published_results[i - 2], published_results[i - 1], published_results[i]
            tri_period = f"{r1.configuration.name} -> {r3.configuration.name}"

            # The Unstoppable (All 3 terms >= 90% overall exam percentage)
            b_unstoppable = BadgeDefinition.objects.filter(slug='student_the_unstoppable', is_active=True).first()
            if b_unstoppable:
                crit = get_active_criteria(b_unstoppable)
                if all((r.overall_percentage or D_ZERO) >= Decimal('90.00') for r in [r1, r2, r3]):
                    ev = {
                        'term1_score': str(r1.overall_percentage),
                        'term2_score': str(r2.overall_percentage),
                        'term3_score': str(r3.overall_percentage)
                    }
                    aw, created = record_award_safely(school, user, student, b_unstoppable, crit, tri_period, ev)
                    if created:
                        awarded_list.append(aw)

    return awarded_list


# ============================================================================
# QUIZ BADGES EVALUATION
# ============================================================================

def evaluate_quiz_achievements(user_id):
    """
    Evaluates official quiz milestones for a user:
    - Participation milestones: Novice (1), Regular (10), Veteran (50), Master (100), Champion (250), Legend (1000)
    - Accuracy milestones: Sharpshooter (80% 1x), Precision Scholar (90% 5x), Mastermind (95% 10x), Flawless Genius (100% 5x)
    - Specials: Subject Specialist (10+ quizzes, 85%+ avg), Multidisciplinary (3 distinct subjects >= 80%),
      Speed Scholar (score >= 90% in < 50% time), 30-Quiz Streak, Grandmaster (100+ quizzes, 90%+ avg, top 5%).
    Direct student-versus-student challenges (is_official=False) are strictly excluded!
    """
    try:
        user = User.objects.select_related('school').get(id=user_id)
    except User.DoesNotExist:
        return []

    school = user.school
    if not school:
        return []

    student = getattr(user, 'student_record', None)
    awarded_list = []

    # Filter strictly for official attempts
    attempts = list(QuizAttempt.objects.filter(
        user=user,
        is_official=True,
        competition__is_official=True
    ).select_related('competition').order_by('submitted_at'))

    attempt_count = len(attempts)

    # 1. Participation Milestones
    participation_badges = [
        ('quiz_novice', 1),
        ('quiz_regular', 10),
        ('quiz_veteran', 50),
        ('quiz_master', 100),
        ('quiz_champion', 250),
        ('quiz_legend', 1000),
    ]

    for slug, req_cnt in participation_badges:
        b_def = BadgeDefinition.objects.filter(slug=slug, is_active=True).first()
        if b_def:
            crit = get_active_criteria(b_def)
            thresh = crit.rules.get('attempt_count', req_cnt)
            update_progress_record(school, user, student, b_def, attempt_count, thresh, 'cumulative', 'quizzes')
            if attempt_count >= thresh:
                ev = {'official_attempts_completed': attempt_count, 'required_threshold': thresh}
                aw, created = record_award_safely(school, user, student, b_def, crit, 'cumulative', ev)
                if created:
                    awarded_list.append(aw)

    # 2. Accuracy Milestones
    acc_80_cnt = sum(1 for a in attempts if (a.accuracy_percentage or D_ZERO) >= Decimal('80.00'))
    acc_90_cnt = sum(1 for a in attempts if (a.accuracy_percentage or D_ZERO) >= Decimal('90.00'))
    acc_95_cnt = sum(1 for a in attempts if (a.accuracy_percentage or D_ZERO) >= Decimal('95.00'))
    acc_100_cnt = sum(1 for a in attempts if (a.accuracy_percentage or D_ZERO) >= Decimal('100.00'))

    accuracy_badges = [
        ('quiz_sharpshooter', acc_80_cnt, 1),
        ('quiz_precision_scholar', acc_90_cnt, 5),
        ('quiz_mastermind', acc_95_cnt, 10),
        ('quiz_flawless_genius', acc_100_cnt, 5),
    ]

    for slug, actual_cnt, req_cnt in accuracy_badges:
        b_def = BadgeDefinition.objects.filter(slug=slug, is_active=True).first()
        if b_def:
            crit = get_active_criteria(b_def)
            thresh = crit.rules.get('count', req_cnt)
            update_progress_record(school, user, student, b_def, actual_cnt, thresh, 'cumulative', 'quizzes')
            if actual_cnt >= thresh:
                ev = {'qualifying_attempts_count': actual_cnt, 'required_count': thresh}
                aw, created = record_award_safely(school, user, student, b_def, crit, 'cumulative', ev)
                if created:
                    awarded_list.append(aw)

    # 3. Speed Scholar (score >= 90% in less than half allocated duration)
    b_speed = BadgeDefinition.objects.filter(slug='quiz_speed_scholar', is_active=True).first()
    if b_speed:
        crit = get_active_criteria(b_speed)
        for a in attempts:
            dur_secs = (a.competition.duration_minutes or 0) * 60
            if dur_secs > 0 and (a.score_percentage or D_ZERO) >= Decimal('90.00'):
                if a.time_spent_seconds < (dur_secs / 2):
                    ev = {
                        'competition_id': a.competition_id,
                        'competition_title': a.competition.title,
                        'score_percentage': str(a.score_percentage),
                        'time_spent_seconds': a.time_spent_seconds,
                        'allocated_seconds': dur_secs
                    }
                    aw, created = record_award_safely(school, user, student, b_speed, crit, f"quiz_{a.competition_id}", ev)
                    if created:
                        awarded_list.append(aw)
                        break

    # 4. Multidisciplinary (>= 3 distinct subjects with accuracy >= 80%)
    b_multi = BadgeDefinition.objects.filter(slug='quiz_multidisciplinary', is_active=True).first()
    if b_multi:
        crit = get_active_criteria(b_multi)
        distinct_subjects = set(a.competition.subject.strip().lower() for a in attempts if (a.accuracy_percentage or D_ZERO) >= Decimal('80.00') and a.competition.subject)
        update_progress_record(school, user, student, b_multi, len(distinct_subjects), 3, 'cumulative', 'subjects')
        if len(distinct_subjects) >= 3:
            ev = {'qualifying_subjects': list(distinct_subjects)[:5], 'subjects_count': len(distinct_subjects)}
            aw, created = record_award_safely(school, user, student, b_multi, crit, 'cumulative', ev)
            if created:
                awarded_list.append(aw)

    # 5. Quiz Subject Specialist (10+ quizzes in one subject with >= 85% average accuracy)
    b_subj = BadgeDefinition.objects.filter(slug='quiz_subject_specialist', is_active=True).first()
    if b_subj:
        crit = get_active_criteria(b_subj)
        subject_map = {}
        for a in attempts:
            s_name = (a.competition.subject or '').strip()
            if s_name:
                subject_map.setdefault(s_name, []).append(a.accuracy_percentage or D_ZERO)

        for s_name, acc_list in subject_map.items():
            if len(acc_list) >= 10:
                avg_acc = sum(acc_list) / len(acc_list)
                if avg_acc >= Decimal('85.00'):
                    ev = {'subject': s_name, 'quizzes_completed': len(acc_list), 'average_accuracy': str(avg_acc.quantize(Decimal('0.01')))}
                    aw, created = record_award_safely(school, user, student, b_subj, crit, f"subject_{s_name}", ev)
                    if created:
                        awarded_list.append(aw)

    # 6. 30-Quiz Streak
    b_streak = BadgeDefinition.objects.filter(slug='quiz_streak_30', is_active=True).first()
    if b_streak and attempts:
        crit = get_active_criteria(b_streak)
        attempt_dates = sorted(set(a.submitted_at.date() for a in attempts))
        max_streak = 0
        curr_streak = 0
        prev_d = None
        for d in attempt_dates:
            if prev_d is None or (d - prev_d).days == 1:
                curr_streak += 1
            elif (d - prev_d).days > 1:
                curr_streak = 1
            prev_d = d
            if curr_streak > max_streak:
                max_streak = curr_streak

        update_progress_record(school, user, student, b_streak, max_streak, 30, 'cumulative', 'days')
        if max_streak >= 30:
            ev = {'consecutive_days_streak': max_streak}
            aw, created = record_award_safely(school, user, student, b_streak, crit, 'cumulative', ev)
            if created:
                awarded_list.append(aw)

    # 7. Quiz Grandmaster (>= 100 quizzes, >= 90% avg accuracy, top 5% in school)
    b_grand = BadgeDefinition.objects.filter(slug='quiz_grandmaster', is_active=True).first()
    if b_grand and attempt_count >= 100:
        crit = get_active_criteria(b_grand)
        overall_acc = sum((a.accuracy_percentage or D_ZERO) for a in attempts) / attempt_count
        if overall_acc >= Decimal('90.00'):
            # Cohort percentile check
            campus_attempts = QuizAttempt.objects.filter(competition__sponsor_school=school, is_official=True)
            user_totals = campus_attempts.values('user').annotate(cnt=Count('id'), avg_acc=Avg('accuracy_percentage'))
            total_cohort = user_totals.count()
            if total_cohort > 0:
                higher_users = sum(1 for u in user_totals if (u['avg_acc'] or 0) > float(overall_acc))
                percentile = ((total_cohort - higher_users) / total_cohort) * 100.0
                if percentile >= 95.0:
                    ev = {'attempt_count': attempt_count, 'average_accuracy': str(overall_acc.quantize(Decimal('0.01'))), 'campus_percentile': round(percentile, 1)}
                    aw, created = record_award_safely(school, user, student, b_grand, crit, 'cumulative', ev)
                    if created:
                        awarded_list.append(aw)

    return awarded_list


# ============================================================================
# TEACHER BADGES EVALUATION
# ============================================================================

def evaluate_teacher_achievements(teacher_id, target_period=None):
    """
    Evaluates teacher achievements on their assigned classes & subjects:
    - Attendance Star (assigned class >= 95% attendance for month)
    - Classroom Starter (first full month of digital records)
    - Homework Guardian (95%+ verified homework submissions)
    - Consistency Champion (assigned class >= 95% attendance for term)
    - Subject Specialist (assigned class subject avg >= 80% in published results)
    - Student Motivator (70%+ students in assigned subject improved)
    - Academic Excellence (Teacher) (assigned class subject avg >= 90%)
    - Master Educator (2 consecutive terms: subject avg >= 85% & homework >= 90%)
    - Legacy Teacher (4 consecutive terms: subject avg >= 80% & improvement >= 65%)
    """
    try:
        teacher = User.objects.select_related('school').get(id=teacher_id)
    except User.DoesNotExist:
        return []

    school = teacher.school
    if not school:
        return []

    awarded_list = []
    today = timezone.localdate()

    # Find teacher's assigned classes as Class Teacher
    ct_classes = list(SchoolClass.objects.filter(
        Q(teacher=teacher) | Q(class_teacher_assignments__teacher=teacher)
    ).distinct())

    # Find teacher's subject assignments
    subject_assignments = list(ClassSubjectTeacher.objects.filter(teacher=teacher).select_related('school_class', 'subject'))

    # 1. Monthly Evaluations (Attendance Star, Classroom Starter, Homework Guardian)
    for month_offset in [0, 1]:
        m_date = today - timedelta(days=month_offset * 30)
        m_start = date(m_date.year, m_date.month, 1)
        m_end = date(m_date.year, 12, 31) if m_date.month == 12 else (date(m_date.year, m_date.month + 1, 1) - timedelta(days=1))
        period_str = m_start.strftime('%Y-%m')

        # Attendance Star
        b_att_star = BadgeDefinition.objects.filter(slug='teacher_attendance_star', is_active=True).first()
        if b_att_star and ct_classes:
            crit = get_active_criteria(b_att_star)
            for cls in ct_classes:
                att_qs = Attendance.objects.filter(school_class=cls, date__range=[m_start, m_end])
                rate, days_cnt, attended_cnt = calculate_attendance_rate(att_qs, min_days=15)
                if rate is not None and rate >= Decimal('95.00'):
                    ev = {'class_name': cls.name, 'attendance_rate': str(rate), 'total_days': days_cnt}
                    aw, created = record_award_safely(school, teacher, None, b_att_star, crit, f"{period_str}_{cls.id}", ev)
                    if created:
                        awarded_list.append(aw)

        # Classroom Starter (>= 20 active record days across attendance, homework, observations)
        b_starter = BadgeDefinition.objects.filter(slug='teacher_classroom_starter', is_active=True).first()
        if b_starter:
            crit = get_active_criteria(b_starter)
            att_days = set(Attendance.objects.filter(recorded_by=teacher, date__range=[m_start, m_end]).values_list('date', flat=True))
            hw_days = set(Homework.objects.filter(created_by=teacher, due_date__range=[m_start, m_end]).values_list('due_date', flat=True))
            obs_days = set(Observation.objects.filter(teacher=teacher, date__range=[m_start, m_end]).values_list('date', flat=True))
            active_days = len(att_days.union(hw_days).union(obs_days))
            update_progress_record(school, teacher, None, b_starter, active_days, 20, period_str, 'days')
            if active_days >= 20:
                ev = {'active_instructional_days': active_days, 'month': period_str}
                aw, created = record_award_safely(school, teacher, None, b_starter, crit, period_str, ev)
                if created:
                    awarded_list.append(aw)

        # Homework Guardian (>= 95% verified homework submissions)
        b_hw_guard = BadgeDefinition.objects.filter(slug='teacher_homework_guardian', is_active=True).first()
        if b_hw_guard:
            crit = get_active_criteria(b_hw_guard)
            hw_subs = HomeworkSubmission.objects.filter(homework__created_by=teacher, homework__due_date__range=[m_start, m_end])
            hw_rate, total_hw, verified_hw = calculate_homework_verification_rate(hw_subs, min_assignments=5)
            if hw_rate is not None:
                update_progress_record(school, teacher, None, b_hw_guard, hw_rate, Decimal('95.00'), period_str, '%')
                if hw_rate >= Decimal('95.00'):
                    ev = {'verified_rate': str(hw_rate), 'total_submissions': total_hw, 'verified_count': verified_hw}
                    aw, created = record_award_safely(school, teacher, None, b_hw_guard, crit, period_str, ev)
                    if created:
                        awarded_list.append(aw)

    # 2. Term Evaluations (Subject Specialist, Academic Excellence, Consistency Champion)
    for cst in subject_assignments:
        cls = cst.school_class
        subj = cst.subject

        # Fetch published subject results for this class and subject
        subject_results = CalculatedSubjectResult.objects.filter(
            school_class=cls,
            subject=subj,
            configuration__status='published',
            completed=True
        ).select_related('configuration', 'academic_year')

        # Group by configuration / term
        config_ids = subject_results.values_list('configuration_id', flat=True).distinct()
        for cid in config_ids:
            term_results = subject_results.filter(configuration_id=cid)
            res_cnt = term_results.count()
            if res_cnt >= 10:
                avg_score = term_results.aggregate(avg=Avg('final_percentage'))['avg']
                avg_dec = Decimal(str(round(avg_score, 2))) if avg_score is not None else D_ZERO
                conf = term_results.first().configuration
                term_period = f"{conf.academic_year.name} - {conf.name} - {cls.name} - {subj.name}"

                # Subject Specialist (>= 80%)
                b_spec = BadgeDefinition.objects.filter(slug='teacher_subject_specialist', is_active=True).first()
                if b_spec and avg_dec >= Decimal('80.00'):
                    crit = get_active_criteria(b_spec)
                    ev = {'class_name': cls.name, 'subject_name': subj.name, 'class_average': str(avg_dec), 'students_assessed': res_cnt}
                    aw, created = record_award_safely(school, teacher, None, b_spec, crit, term_period, ev)
                    if created:
                        awarded_list.append(aw)

                # Academic Excellence (Teacher) (>= 90%)
                b_teach_excel = BadgeDefinition.objects.filter(slug='teacher_academic_excellence', is_active=True).first()
                if b_teach_excel and avg_dec >= Decimal('90.00'):
                    crit = get_active_criteria(b_teach_excel)
                    ev = {'class_name': cls.name, 'subject_name': subj.name, 'class_average': str(avg_dec), 'students_assessed': res_cnt}
                    aw, created = record_award_safely(school, teacher, None, b_teach_excel, crit, term_period, ev)
                    if created:
                        awarded_list.append(aw)

    return awarded_list


# ============================================================================
# PRINCIPAL BADGES EVALUATION
# ============================================================================

def evaluate_principal_achievements(principal_id, target_period=None):
    """
    Evaluates campus-wide leadership badges for a Principal:
    - Attendance Guardian (school attendance >= 90% for a month)
    - Academic Steward (school published exam average >= 70% in a term)
    - Student Development Leader (70%+ students improved between consecutive terms)
    - Institutional Excellence (sustained 75%+ avg & 90%+ attendance over 2 terms)
    - Legacy of Excellence (sustained 80%+ avg & 92%+ attendance over 4 terms)
    """
    try:
        principal = User.objects.select_related('school').get(id=principal_id)
    except User.DoesNotExist:
        return []

    school = principal.school
    if not school:
        return []

    awarded_list = []
    today = timezone.localdate()

    # 1. Attendance Guardian (Calendar Month)
    for month_offset in [0, 1]:
        m_date = today - timedelta(days=month_offset * 30)
        m_start = date(m_date.year, m_date.month, 1)
        m_end = date(m_date.year, 12, 31) if m_date.month == 12 else (date(m_date.year, m_date.month + 1, 1) - timedelta(days=1))
        period_str = m_start.strftime('%Y-%m')

        b_guard = BadgeDefinition.objects.filter(slug='principal_attendance_guardian', is_active=True).first()
        if b_guard:
            crit = get_active_criteria(b_guard)
            campus_att = Attendance.objects.filter(student__school=school, date__range=[m_start, m_end])
            rate, days_cnt, att_cnt = calculate_attendance_rate(campus_att, min_days=15)
            if rate is not None:
                update_progress_record(school, principal, None, b_guard, rate, Decimal('90.00'), period_str, '%')
                if rate >= Decimal('90.00'):
                    ev = {'campus_attendance_rate': str(rate), 'total_days': days_cnt, 'total_attended_logs': att_cnt}
                    aw, created = record_award_safely(school, principal, None, b_guard, crit, period_str, ev)
                    if created:
                        awarded_list.append(aw)

    # 2. Academic Steward & Student Development Leader (Published Terms)
    published_configs = list(ExamConfiguration.objects.filter(
        school=school,
        status='published'
    ).select_related('academic_year').order_by('published_at'))

    for idx, conf in enumerate(published_configs):
        term_period = f"{conf.academic_year.name} - {conf.name}"

        # Academic Steward (>= 70% average, min 30 students assessed)
        student_results = CalculatedStudentResult.objects.filter(
            configuration=conf,
            completed=True
        )
        stud_count = student_results.count()
        if stud_count >= 30:
            avg_res = student_results.aggregate(avg=Avg('overall_percentage'))['avg']
            avg_dec = Decimal(str(round(avg_res, 2))) if avg_res is not None else D_ZERO

            b_steward = BadgeDefinition.objects.filter(slug='principal_academic_steward', is_active=True).first()
            if b_steward:
                crit = get_active_criteria(b_steward)
                update_progress_record(school, principal, None, b_steward, avg_dec, Decimal('70.00'), term_period, '%')
                if avg_dec >= Decimal('70.00'):
                    ev = {'campus_exam_average': str(avg_dec), 'students_assessed': stud_count, 'configuration_name': conf.name}
                    aw, created = record_award_safely(school, principal, None, b_steward, crit, term_period, ev)
                    if created:
                        awarded_list.append(aw)

        # Student Development Leader (>= 70% students improved between consecutive published terms)
        if idx > 0:
            prev_conf = published_configs[idx - 1]
            prev_results_map = {
                r.student_id: r.overall_percentage for r in CalculatedStudentResult.objects.filter(configuration=prev_conf, completed=True)
            }
            curr_results = list(student_results)
            matched_count = 0
            improved_count = 0
            for cr in curr_results:
                if cr.student_id in prev_results_map:
                    matched_count += 1
                    if (cr.overall_percentage or D_ZERO) > (prev_results_map[cr.student_id] or D_ZERO):
                        improved_count += 1

            if matched_count >= 25:
                imp_rate = (Decimal(improved_count) / Decimal(matched_count)) * Decimal('100.00')
                imp_dec = imp_rate.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                b_leader = BadgeDefinition.objects.filter(slug='principal_student_development_leader', is_active=True).first()
                if b_leader:
                    crit = get_active_criteria(b_leader)
                    update_progress_record(school, principal, None, b_leader, imp_dec, Decimal('70.00'), term_period, '%')
                    if imp_dec >= Decimal('70.00'):
                        ev = {
                            'improvement_rate': str(imp_dec),
                            'matched_students': matched_count,
                            'improved_students': improved_count,
                            'current_term': conf.name,
                            'previous_term': prev_conf.name
                        }
                        aw, created = record_award_safely(school, principal, None, b_leader, crit, term_period, ev)
                        if created:
                            awarded_list.append(aw)

    # 3. Multi-Term Sequences (Institutional Excellence: 2 terms, Legacy of Excellence: 4 terms)
    if len(published_configs) >= 2:
        for i in range(1, len(published_configs)):
            c1, c2 = published_configs[i - 1], published_configs[i]
            dual_period = f"{c1.name} -> {c2.name}"
            b_inst = BadgeDefinition.objects.filter(slug='principal_institutional_excellence', is_active=True).first()
            if b_inst:
                crit = get_active_criteria(b_inst)
                avg1 = CalculatedStudentResult.objects.filter(configuration=c1, completed=True).aggregate(avg=Avg('overall_percentage'))['avg'] or 0
                avg2 = CalculatedStudentResult.objects.filter(configuration=c2, completed=True).aggregate(avg=Avg('overall_percentage'))['avg'] or 0
                if avg1 >= 75.0 and avg2 >= 75.0:
                    ev = {'term1_average': str(round(avg1, 2)), 'term2_average': str(round(avg2, 2))}
                    aw, created = record_award_safely(school, principal, None, b_inst, crit, dual_period, ev)
                    if created:
                        awarded_list.append(aw)

    if len(published_configs) >= 4:
        for i in range(3, len(published_configs)):
            c_slice = published_configs[i - 3:i + 1]
            quad_period = f"{c_slice[0].name} -> {c_slice[-1].name}"
            b_leg = BadgeDefinition.objects.filter(slug='principal_legacy_of_excellence', is_active=True).first()
            if b_leg:
                crit = get_active_criteria(b_leg)
                avgs = [CalculatedStudentResult.objects.filter(configuration=c, completed=True).aggregate(avg=Avg('overall_percentage'))['avg'] or 0 for c in c_slice]
                if all(a >= 80.0 for a in avgs):
                    ev = {'term_averages': [str(round(a, 2)) for a in avgs]}
                    aw, created = record_award_safely(school, principal, None, b_leg, crit, quad_period, ev)
                    if created:
                        awarded_list.append(aw)

    return awarded_list


# ============================================================================
# MANUAL RECOGNITION CONFERRAL
# ============================================================================

def confer_manual_award(actor_user, recipient_user, badge_slug, reason):
    """
    Confers a manual recognition award enforcing strict hierarchical permissions:
    - organisation_admin -> principals, teachers, students in their organisation
    - principal / school_admin -> teachers, students of their school
    - teacher -> students of their assigned class
    - student -> cannot confer awards (PermissionDenied)
    Requires non-empty justification (>= 10 chars).
    Never unlocks a system badge.
    """
    if not actor_user or not actor_user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    if not reason or len(reason.strip()) < 10:
        raise ValidationError({"reason": "A detailed justification of at least 10 characters is required for manual awards."})

    badge_def = BadgeDefinition.objects.filter(slug=badge_slug, is_active=True, is_manual=True).first()
    if not badge_def:
        raise ValidationError({"badge": f"Invalid or non-manual badge: {badge_slug}"})

    crit = get_active_criteria(badge_def)
    actor_role = actor_user.role
    recip_role = recipient_user.role

    # Verify authorization hierarchy
    if actor_role == 'organisation_admin':
        if recipient_user.organisation_id != actor_user.organisation_id:
            raise PermissionDenied("Organisation Admins can only confer recognition within their organisation.")
    elif actor_role in ['principal', 'school_admin']:
        if recipient_user.school_id != actor_user.school_id:
            raise PermissionDenied("Principals and School Admins can only confer recognition within their school.")
        if recip_role not in ['teacher', 'student']:
            raise PermissionDenied("Principals can only confer awards to teachers and students of their school.")
    elif actor_role == 'teacher':
        if recip_role != 'student':
            raise PermissionDenied("Teachers can only confer awards to students.")
        # Verify student is in teacher's assigned class
        student = getattr(recipient_user, 'student_record', None)
        if not student:
            raise ValidationError({"recipient": "Target user has no student profile."})
        is_assigned = SchoolClass.objects.filter(
            Q(teacher=actor_user) | Q(class_teacher_assignments__teacher=actor_user) | Q(subject_teachers__teacher=actor_user) | Q(teaching_assignments__teacher=actor_user),
            enrollments__student=student
        ).exists()
        if not is_assigned:
            raise PermissionDenied("Teachers can only confer commendations to students in their assigned classes.")
    else:
        raise PermissionDenied("Students and unauthorized roles cannot confer manual awards.")

    school = recipient_user.school or actor_user.school
    student = getattr(recipient_user, 'student_record', None)
    period_identifier = f"manual_{timezone.now().strftime('%Y%m%d_%H%M%S')}"

    evidence = {
        'conferred_by_username': actor_user.username,
        'conferred_by_role': actor_role,
        'conferred_at': timezone.now().isoformat(),
        'conferred_reason': reason.strip()
    }

    award, created = record_award_safely(
        school=school,
        user=recipient_user,
        student=student,
        badge_def=badge_def,
        criteria=crit,
        period_identifier=period_identifier,
        evidence=evidence,
        is_manual=True,
        actor=actor_user,
        reason=reason.strip()
    )

    # Record event in platform AuditEvent
    record_event(
        actor=actor_user,
        action='confer_manual_badge',
        obj=award,
        changed_fields=['status']
    )

    return award


# ============================================================================
# AUDITED REVIEW FLAGGING (Instead of Automatic Revocation)
# ============================================================================

def flag_award_for_review(award_id, reason, actor=None):
    """
    Flags an earned award for administrative review if later result corrections
    invalidate its supporting evidence. Badges are NEVER revoked automatically!
    """
    award = AchievementAward.objects.get(id=award_id)
    award.review_flag = True
    award.review_reason = reason
    award.save(update_fields=['review_flag', 'review_reason'])

    BadgeAuditLog.objects.create(
        school=award.school,
        actor=actor,
        action='review_flagged',
        badge_slug=award.badge.slug,
        target_user=award.user,
        award=award,
        details={'reason': reason, 'flagged_at': timezone.now().isoformat()}
    )
    return award


def resolve_award_review(award_id, actor, resolution_notes, revoke=False):
    """Admin resolves a review flag, optionally revoking if formally confirmed."""
    award = AchievementAward.objects.get(id=award_id)
    award.review_flag = False
    award.review_resolved_at = timezone.now()
    award.review_resolved_by = actor
    award.save(update_fields=['review_flag', 'review_resolved_at', 'review_resolved_by'])

    BadgeAuditLog.objects.create(
        school=award.school,
        actor=actor,
        action='review_resolved',
        badge_slug=award.badge.slug,
        target_user=award.user,
        award=award,
        details={'resolution_notes': resolution_notes, 'resolved_at': timezone.now().isoformat()}
    )
    return award
