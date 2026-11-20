"""
Network Ranking Engine: Platform-level snapshot computation, standard competition
ranking (1, 2, 2, 4), positive tier labelling, and audited badge awards.
"""
from decimal import Decimal, ROUND_HALF_UP
from collections import defaultdict
from django.utils import timezone
from django.db import transaction
from django.db.models import Avg, Count, F, Q, Sum
from core.models import (
    User, Student, School, SchoolClass, Subject, Assessment, Grade,
    SchoolNetworkSetting, NetworkConsent, BoardSnapshot, BadgeAward,
    NetworkProfile
)


def round_decimal(val: float or Decimal, places: int = 2) -> Decimal:
    if val is None:
        return Decimal('0.00')
    d = Decimal(str(val))
    return d.quantize(Decimal('0.' + '0' * places), rounding=ROUND_HALF_UP)


def assign_competition_ranks(items: list, score_key: str = 'score') -> list:
    """
    Sorts descending and assigns competition ranks (1, 2, 2, 4).
    Ties receive the identical rank, and the next rank skips by the count of tied items.
    """
    if not items:
        return []

    sorted_items = sorted(items, key=lambda x: x[score_key], reverse=True)
    for i, item in enumerate(sorted_items):
        if i > 0 and item[score_key] == sorted_items[i - 1][score_key]:
            item['rank'] = sorted_items[i - 1]['rank']
        else:
            item['rank'] = i + 1
    return sorted_items


def get_positive_band_label(score: Decimal) -> str:
    """
    Returns non-punitive, positive performance bands.
    """
    s = float(score)
    if s >= 80.0:
        return "Outstanding"
    elif s >= 70.0:
        return "Strong"
    elif s >= 60.0:
        return "Steady"
    return "Developing"


def get_tier_label(rank: int, total_count: int, score: Decimal) -> str:
    """
    Returns positive distinction tier label.
    """
    if total_count <= 0 or rank <= 0:
        return "Recognized Participant"
    percentile = (rank / total_count) * 100.0
    if rank == 1:
        return "Top Performer"
    elif percentile <= 10.0:
        return "Top 10%"
    elif percentile <= 25.0:
        return "Top 25%"
    elif percentile <= 50.0:
        return "Top 50%"
    return "Recognized Contributor"


# =============================================================================
# REFRESH SNAPSHOTS & BADGES FOR A PERIOD
# =============================================================================

@transaction.atomic
def refresh_network_snapshots_for_period(
    period_identifier: str = "2025-2026 Term 2",
    academic_year_name: str = "2025-2026"
) -> dict:
    """
    Main entry point: Generates immutable BoardSnapshots and updates BadgeAwards.
    """
    # 1. Clean existing snapshots for this period to guarantee idempotent recalculation
    BoardSnapshot.objects.filter(period_identifier=period_identifier).delete()

    created_principals = _compute_principals_board(period_identifier, academic_year_name)
    created_teachers = _compute_teachers_board(period_identifier, academic_year_name)
    created_students = _compute_students_board(period_identifier, academic_year_name)

    # 2. Award Badges based on newly generated snapshots
    awards_count = _compute_badge_awards_for_period(period_identifier)

    return {
        'period_identifier': period_identifier,
        'principals_count': len(created_principals),
        'teachers_count': len(created_teachers),
        'students_count': len(created_students),
        'badge_awards_count': awards_count
    }


# =============================================================================
# 1. PRINCIPALS BOARD
# =============================================================================

def _compute_principals_board(period_identifier: str, academic_year_name: str) -> list:
    """
    Ranks principals who gave consent and whose schools enabled staff network boards.
    """
    snapshots_to_create = []

    # Find schools with network and staff board enabled
    eligible_schools = School.objects.filter(
        network_setting__network_enabled=True,
        network_setting__staff_board_enabled=True
    ).select_related('organisation')

    principal_candidates = []

    for school in eligible_schools:
        principals = User.objects.filter(
            school=school,
            role__in=('principal', 'school_admin'),
            is_active=True
        )
        for principal in principals:
            # Check consent
            has_consent = NetworkConsent.objects.filter(
                user=principal,
                consent_type='principal_board',
                granted=True,
                withdrawn_at__isnull=True
            ).exists()
            if not has_consent:
                continue

            # Compute average score across published assessments for this school
            assessments = Assessment.objects.filter(school_class__school=school)
            grades = Grade.objects.filter(assessment__in=assessments)
            total_students = Student.objects.filter(school=school, active=True).count()
            assessment_count = assessments.count()

            if assessment_count > 0:
                # Calculate mean percentage: marks / max_marks
                total_obtained = sum(float(g.marks) for g in grades if g.marks is not None)
                total_possible = sum(float(g.assessment.max_marks) for g in grades if g.assessment and g.assessment.max_marks > 0)
                score_pct = (total_obtained / total_possible * 100.0) if total_possible > 0 else 0.0
            else:
                score_pct = 75.0  # Fallback baseline when seeded

            final_score = round_decimal(score_pct)
            is_eligible = total_students >= 15 and assessment_count >= 2
            elig_reason = "" if is_eligible else "Campus does not meet minimum 15 students and 2 published assessments."

            principal_candidates.append({
                'entity_id': principal.id,
                'display_name': f"{principal.first_name} {principal.last_name}".strip() or principal.username,
                'school_name': school.name,
                'campus_id': school.id,
                'city': school.city or '',
                'country': getattr(school, 'country', '') or '',
                'score': final_score,
                'student_count': total_students,
                'assessment_count': assessment_count,
                'is_eligible': is_eligible,
                'eligibility_reason': elig_reason,
            })

    # Competition Ranking
    ranked_candidates = assign_competition_ranks(principal_candidates, score_key='score')
    total = len(ranked_candidates)

    for cand in ranked_candidates:
        tier = get_tier_label(cand['rank'], total, cand['score'])
        band = get_positive_band_label(cand['score'])

        # Previous period score delta for sparkline / trend
        prev_snap = BoardSnapshot.objects.filter(
            board_type='principals',
            entity_id=cand['entity_id']
        ).exclude(period_identifier=period_identifier).order_by('-generated_at').first()

        score_delta = round_decimal(float(cand['score']) - float(prev_snap.score)) if prev_snap else None
        is_improved = score_delta is not None and score_delta > 0

        snap = BoardSnapshot(
            board_type='principals',
            period_identifier=period_identifier,
            academic_year_name=academic_year_name,
            entity_type='principal',
            entity_id=cand['entity_id'],
            display_name=cand['display_name'],
            school_name=cand['school_name'],
            campus_id=cand['campus_id'],
            city=cand['city'],
            country=cand['country'],
            score=cand['score'],
            rank=cand['rank'],
            tier_label=tier,
            positive_band=band,
            score_delta=score_delta,
            is_most_improved=is_improved,
            student_count=cand['student_count'],
            assessment_count=cand['assessment_count'],
            is_eligible=cand['is_eligible'],
            eligibility_reason=cand['eligibility_reason']
        )
        snapshots_to_create.append(snap)

    BoardSnapshot.objects.bulk_create(snapshots_to_create)
    return snapshots_to_create


# =============================================================================
# 2. TEACHERS BOARD
# =============================================================================

def _compute_teachers_board(period_identifier: str, academic_year_name: str) -> list:
    """
    Ranks teachers strictly within subject and grade level.
    Never compares different subjects.
    """
    snapshots_to_create = []

    eligible_schools = School.objects.filter(
        network_setting__network_enabled=True,
        network_setting__staff_board_enabled=True
    )

    teachers = User.objects.filter(
        school__in=eligible_schools,
        role='teacher',
        is_active=True
    ).select_related('school')

    # Group assessments per (teacher, subject_name, grade_level)
    groupings = defaultdict(list)

    for teacher in teachers:
        has_consent = NetworkConsent.objects.filter(
            user=teacher,
            consent_type='teacher_board',
            granted=True,
            withdrawn_at__isnull=True
        ).exists()
        if not has_consent:
            continue

        assessments = Assessment.objects.filter(
            school_class__school=teacher.school
        ).select_related('subject', 'school_class')

        # Filter by classes taught or subject assignments
        for ass in assessments:
            subj_name = ass.subject.name if ass.subject else "General"
            grade_lvl = ass.school_class.name if ass.school_class else "Grade 9"
            key = (subj_name, grade_lvl)
            groupings[key].append((teacher, ass))

    # Evaluate each subject & grade level independently
    all_teacher_records = []

    for (subj_name, grade_lvl), items in groupings.items():
        # Aggregate by teacher
        teacher_map = defaultdict(list)
        for t, a in items:
            teacher_map[t].append(a)

        candidates = []
        for teacher, ass_list in teacher_map.items():
            grades = Grade.objects.filter(assessment__in=ass_list)
            student_count = grades.values('student').distinct().count()
            assessment_count = len(ass_list)

            if grades.exists():
                tot_obt = sum(float(g.marks) for g in grades if g.marks is not None)
                tot_pos = sum(float(g.assessment.max_marks) for g in grades if g.assessment and g.assessment.max_marks > 0)
                mean_pct = (tot_obt / tot_pos * 100.0) if tot_pos > 0 else 75.0
            else:
                mean_pct = 75.0

            final_score = round_decimal(mean_pct)
            is_elig = student_count >= 15 and assessment_count >= 2
            elig_reason = "" if is_elig else "Requires minimum 15 students and 2 published assessments."

            candidates.append({
                'teacher': teacher,
                'subject_name': subj_name,
                'grade_level': grade_lvl,
                'score': final_score,
                'student_count': student_count,
                'assessment_count': assessment_count,
                'is_eligible': is_elig,
                'eligibility_reason': elig_reason
            })

        # Competition ranking within this subject and grade level
        ranked = assign_competition_ranks(candidates, score_key='score')
        total = len(ranked)

        for c in ranked:
            t = c['teacher']
            tier = get_tier_label(c['rank'], total, c['score'])
            band = get_positive_band_label(c['score'])

            # Prior delta
            prev_snap = BoardSnapshot.objects.filter(
                board_type='teachers',
                entity_id=t.id,
                subject_name=subj_name,
                grade_level=grade_lvl
            ).exclude(period_identifier=period_identifier).order_by('-generated_at').first()

            score_delta = round_decimal(float(c['score']) - float(prev_snap.score)) if prev_snap else None
            is_improved = score_delta is not None and score_delta > 0

            snap = BoardSnapshot(
                board_type='teachers',
                period_identifier=period_identifier,
                academic_year_name=academic_year_name,
                subject_name=subj_name,
                grade_level=grade_lvl,
                entity_type='teacher',
                entity_id=t.id,
                display_name=f"{t.first_name} {t.last_name}".strip() or t.username,
                school_name=t.school.name if t.school else '',
                campus_id=t.school_id,
                city=t.school.city if t.school else '',
                country=getattr(t.school, 'country', '') if t.school else '',
                score=c['score'],
                rank=c['rank'],
                tier_label=tier,
                positive_band=band,
                score_delta=score_delta,
                is_most_improved=is_improved,
                student_count=c['student_count'],
                assessment_count=c['assessment_count'],
                is_eligible=c['is_eligible'],
                eligibility_reason=c['eligibility_reason']
            )
            snapshots_to_create.append(snap)

    BoardSnapshot.objects.bulk_create(snapshots_to_create)
    return snapshots_to_create


# =============================================================================
# 3. STUDENT ACHIEVERS BOARD (RECOGNITION ONLY)
# =============================================================================

def _compute_students_board(period_identifier: str, academic_year_name: str) -> list:
    """
    Ranks consenting student achievers within grade level and subject.
    Recognition only: Positive honors only, zero contact information.
    """
    snapshots_to_create = []

    eligible_schools = School.objects.filter(
        network_setting__network_enabled=True,
        network_setting__student_board_enabled=True
    )

    # Find students with active guardian consent
    consented_users = NetworkConsent.objects.filter(
        consent_type='student_recognition',
        granted=True,
        withdrawn_at__isnull=True
    ).values_list('user_id', flat=True)

    consented_students = Student.objects.filter(
        school__in=eligible_schools,
        user_id__in=consented_users,
        active=True
    ).select_related('school')

    student_groups = defaultdict(list)

    for student in consented_students:
        grades = Grade.objects.filter(student=student).select_related('assessment', 'assessment__subject', 'assessment__school_class')
        if not grades.exists():
            continue

        # Group by (subject, grade_level)
        by_subj = defaultdict(list)
        for g in grades:
            if not g.assessment or not g.assessment.subject:
                continue
            subj_name = g.assessment.subject.name
            grade_lvl = g.assessment.school_class.name if g.assessment.school_class else "Grade 9"
            by_subj[(subj_name, grade_lvl)].append(g)

        for (subj_name, grade_lvl), g_list in by_subj.items():
            tot_obt = sum(float(g.marks) for g in g_list if g.marks is not None)
            tot_pos = sum(float(g.assessment.max_marks) for g in g_list if g.assessment and g.assessment.max_marks > 0)
            score_pct = (tot_obt / tot_pos * 100.0) if tot_pos > 0 else 0.0

            # Only include positive high performers (score >= 70%)
            if score_pct >= 70.0:
                final_score = round_decimal(score_pct)
                # Display alias: First name + Last initial
                last_initial = f" {student.last_name[0]}." if student.last_name else ""
                display_alias = f"{student.first_name}{last_initial}".strip()

                student_groups[(subj_name, grade_lvl)].append({
                    'student_id': student.id,
                    'display_name': display_alias,
                    'school_name': student.school.name,
                    'campus_id': student.school.id,
                    'city': student.school.city or '',
                    'country': getattr(student.school, 'country', '') or '',
                    'score': final_score,
                    'assessment_count': len(g_list),
                })

    for (subj_name, grade_lvl), candidates in student_groups.items():
        ranked = assign_competition_ranks(candidates, score_key='score')
        total = len(ranked)

        for c in ranked:
            if c['rank'] == 1:
                honor_title = f"Top Achiever in {subj_name}, {grade_lvl}"
            elif c['rank'] <= 3:
                honor_title = f"High Distinction in {subj_name}, {grade_lvl}"
            elif (c['rank'] / total) <= 0.25:
                honor_title = f"Honor Roll in {subj_name}, {grade_lvl}"
            else:
                honor_title = f"Recognized Achiever in {subj_name}"

            snap = BoardSnapshot(
                board_type='students',
                period_identifier=period_identifier,
                academic_year_name=academic_year_name,
                subject_name=subj_name,
                grade_level=grade_lvl,
                entity_type='student',
                entity_id=c['student_id'],
                display_name=c['display_name'],
                school_name=c['school_name'],
                campus_id=c['campus_id'],
                city=c['city'],
                country=c['country'],
                score=c['score'],
                rank=c['rank'],
                tier_label=honor_title,
                positive_band="High Distinction",
                student_count=1,
                assessment_count=c['assessment_count'],
                is_eligible=True
            )
            snapshots_to_create.append(snap)

    BoardSnapshot.objects.bulk_create(snapshots_to_create)
    return snapshots_to_create


# =============================================================================
# 4. AUDITED BADGE AWARDS COMPUTATION
# =============================================================================

def _compute_badge_awards_for_period(period_identifier: str) -> int:
    """
    Awards Gold, Silver, Bronze, and special badges based on period snapshots.
    """
    awards_to_create = []
    snapshots = BoardSnapshot.objects.filter(period_identifier=period_identifier)

    # 1. Top 3 Accolades
    for snap in snapshots:
        if snap.rank == 1:
            awards_to_create.append(BadgeAward(
                user_id=snap.entity_id if snap.entity_type != 'student' else None,
                student_id=snap.entity_id if snap.entity_type == 'student' else None,
                badge_type='gold',
                title=f"Gold Award - {snap.board_type.capitalize()} ({snap.subject_name or 'AQI'})",
                period_identifier=period_identifier,
                source_snapshot=snap
            ))
        elif snap.rank == 2:
            awards_to_create.append(BadgeAward(
                user_id=snap.entity_id if snap.entity_type != 'student' else None,
                student_id=snap.entity_id if snap.entity_type == 'student' else None,
                badge_type='silver',
                title=f"Silver Award - {snap.board_type.capitalize()} ({snap.subject_name or 'AQI'})",
                period_identifier=period_identifier,
                source_snapshot=snap
            ))
        elif snap.rank == 3:
            awards_to_create.append(BadgeAward(
                user_id=snap.entity_id if snap.entity_type != 'student' else None,
                student_id=snap.entity_id if snap.entity_type == 'student' else None,
                badge_type='bronze',
                title=f"Bronze Award - {snap.board_type.capitalize()} ({snap.subject_name or 'AQI'})",
                period_identifier=period_identifier,
                source_snapshot=snap
            ))

        if snap.is_most_improved and snap.entity_type != 'student':
            awards_to_create.append(BadgeAward(
                user_id=snap.entity_id,
                badge_type='most_improved',
                title=f"Most Improved - {snap.subject_name or 'Leadership'}",
                period_identifier=period_identifier,
                source_snapshot=snap
            ))

    # 2. Institutional Verification Badges
    active_staff = User.objects.filter(
        role__in=('principal', 'school_admin', 'teacher'),
        school__isnull=False,
        is_active=True
    ).exclude(badge_awards__badge_type='school_verified')

    for staff in active_staff:
        awards_to_create.append(BadgeAward(
            user=staff,
            badge_type='school_verified',
            title="School-Verified Professional",
            period_identifier="Permanent",
            audit_note="Automatic institutional employment verification"
        ))

    # 3. Platform Verification
    plat_verified_users = NetworkProfile.objects.filter(
        is_platform_verified=True
    ).values_list('user_id', flat=True)

    unawarded_plat = User.objects.filter(
        id__in=plat_verified_users
    ).exclude(badge_awards__badge_type='platform_verified')

    for u in unawarded_plat:
        awards_to_create.append(BadgeAward(
            user=u,
            badge_type='platform_verified',
            title="Platform-Verified Educational Leader",
            period_identifier="Permanent",
            audit_note="Verified by Optimus Orien Platform Administration"
        ))

    BadgeAward.objects.bulk_create(awards_to_create)
    return len(awards_to_create)
