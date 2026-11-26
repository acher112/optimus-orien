"""
Badges and Achievements Views & API Endpoints (Stage 1).

Complies with:
- Golden Rule & Tenant Isolation (Row-Level Security on school_id)
- Safety and Privacy (Rule 7): Student badges visible only to self, linked guardians,
  and authorized staff of their own school. No public student rankings or shaming labels.
- Teacher/Principal positive recognition only.
- Strict hierarchical manual recognition permissions.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
from django.db.models import Count, Q
from django.utils import timezone

from core.models import (
    School, User, Student, GuardianProfile,
    BadgeDefinition, BadgeCriteria, AchievementAward, BadgeProgress, BadgeAuditLog
)
from core.services.badge_engine import (
    evaluate_student_achievements,
    evaluate_teacher_achievements,
    evaluate_principal_achievements,
    evaluate_quiz_achievements,
    confer_manual_award,
    resolve_award_review,
)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def badge_catalogue_view(request):
    """
    Returns the complete platform badge catalogue, organized by category and tier.
    """
    category = request.query_params.get('category')
    qs = BadgeDefinition.objects.filter(is_active=True).prefetch_related('criteria_versions')
    if category:
        qs = qs.filter(category=category)

    catalogue = []
    for b in qs:
        active_crits = [c for c in b.criteria_versions.all() if c.active]
        active_crit = sorted(active_crits, key=lambda c: c.version, reverse=True)[0] if active_crits else None
        rules_dict = active_crit.rules if active_crit else {}

        # Primary grouping into the 4 official functional categories
        if b.category == 'principal' or b.slug in ['manual_principal_honour', 'manual_leadership_distinction']:
            primary_cat = 'principal'
            target_role = 'principal'
        elif b.category == 'teacher' or b.slug == 'manual_inspirational_teacher':
            primary_cat = 'teacher'
            target_role = 'teacher'
        elif b.category == 'student' or b.slug == 'manual_teachers_commendation':
            primary_cat = 'student'
            target_role = 'student'
        elif b.category == 'quiz':
            primary_cat = 'quiz'
            target_role = 'student'
        else:
            primary_cat = b.category
            target_role = 'all'

        # Measurement period calculation from rules and criteria summary
        if 'terms_count' in rules_dict:
            period = f"{rules_dict['terms_count']} Academic Terms"
        elif 'month' in b.criteria_summary.lower() or 'monthly' in b.criteria_summary.lower():
            period = "1 Calendar Month"
        elif 'two terms' in b.criteria_summary.lower():
            period = "2 Consecutive Terms"
        elif 'term' in b.criteria_summary.lower():
            period = "1 Academic Term"
        elif b.category == 'quiz':
            period = "Official Olympiads & Competitions"
        else:
            period = "Cumulative / Milestone"

        # Authorized awarder roles
        if b.is_manual:
            auth_roles = rules_dict.get('allowed_grantor_roles', ['organisation_admin', 'school_admin'])
        else:
            auth_roles = ['system']

        catalogue.append({
            'id': b.id,
            'slug': b.slug,
            'name': b.name,
            'category': b.category,
            'primary_category': primary_cat,
            'target_role': target_role,
            'tier': b.tier,
            'description': b.description,
            'criteria_summary': b.criteria_summary,
            'icon_asset_name': b.icon_asset_name,
            'is_manual': b.is_manual,
            'awarding_method': 'manual' if b.is_manual else 'system',
            'authorized_roles': auth_roles,
            'measurement_period': period,
            'criteria_version': active_crit.version if active_crit else 1,
            'rules': rules_dict,
        })

    return Response({
        'count': len(catalogue),
        'badges': catalogue
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_achievements_view(request):
    """
    Returns the authenticated user's earned achievements, locked badge progress,
    and tier breakdown summary.
    """
    user = request.user
    awards_qs = AchievementAward.objects.filter(user=user).select_related('badge', 'conferred_by').order_by('-earned_at')

    # Calculate tier summary counts
    tier_counts = {
        'bronze': 0,
        'silver': 0,
        'gold': 0,
        'platinum': 0,
        'diamond': 0,
        'total': awards_qs.count()
    }
    for aw in awards_qs:
        t = aw.tier.lower()
        if t in tier_counts:
            tier_counts[t] += 1

    awards_data = []
    for aw in awards_qs:
        awards_data.append({
            'id': aw.id,
            'badge_slug': aw.badge.slug,
            'badge_name': aw.badge.name,
            'category': aw.badge.category,
            'tier': aw.tier,
            'icon_asset_name': aw.badge.icon_asset_name,
            'description': aw.badge.description,
            'period_identifier': aw.period_identifier,
            'earned_at': aw.earned_at.isoformat(),
            'evidence_data': aw.evidence_data,
            'is_manual': aw.is_manual,
            'conferred_by': aw.conferred_by.username if aw.conferred_by else None,
            'conferred_reason': aw.conferred_reason if aw.is_manual else '',
            'review_flag': aw.review_flag,
        })

    # Real in-progress metrics for locked badges
    progress_qs = BadgeProgress.objects.filter(user=user).select_related('badge')
    progress_data = []
    for pr in progress_qs:
        progress_data.append({
            'badge_slug': pr.badge.slug,
            'badge_name': pr.badge.name,
            'tier': pr.badge.tier,
            'icon_asset_name': pr.badge.icon_asset_name,
            'current_value': str(pr.current_value),
            'target_value': str(pr.target_value),
            'progress_percentage': str(pr.progress_percentage),
            'unit': pr.unit,
            'period_identifier': pr.period_identifier,
        })

    return Response({
        'summary': tier_counts,
        'awards': awards_data,
        'progress': progress_data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def student_achievements_view(request, student_id):
    """
    Returns achievements for a specific student, strictly enforcing safety and privacy:
    - Student themselves
    - Linked guardian
    - Authorized school staff of their own school (principal, school_admin, teacher)
    All others are denied access (403). No public student leaderboards.
    """
    user = request.user
    try:
        student = Student.objects.select_related('school', 'user').get(id=student_id)
    except Student.DoesNotExist:
        raise NotFound("Student not found.")

    is_self = (getattr(user, 'student_record', None) and user.student_record.id == student.id)
    is_linked_guardian = False
    if hasattr(user, 'wards') and user.wards.filter(id=student.id).exists():
        is_linked_guardian = True
    elif hasattr(student, 'guardians') and student.guardians.filter(id=user.id).exists():
        is_linked_guardian = True

    is_school_staff = (
        user.school_id == student.school_id and
        user.role in ['principal', 'school_admin', 'teacher', 'platform_admin', 'organisation_admin']
    )

    if not (is_self or is_linked_guardian or is_school_staff):
        raise PermissionDenied("You are not authorized to view this student's achievements.")

    target_user = student.user
    if not target_user:
        return Response({'summary': {'total': 0}, 'awards': []})

    awards_qs = AchievementAward.objects.filter(user=target_user).select_related('badge', 'conferred_by').order_by('-earned_at')
    awards_data = []
    for aw in awards_qs:
        awards_data.append({
            'id': aw.id,
            'badge_slug': aw.badge.slug,
            'badge_name': aw.badge.name,
            'category': aw.badge.category,
            'tier': aw.tier,
            'icon_asset_name': aw.badge.icon_asset_name,
            'description': aw.badge.description,
            'period_identifier': aw.period_identifier,
            'earned_at': aw.earned_at.isoformat(),
            'evidence_data': aw.evidence_data,
            'is_manual': aw.is_manual,
            'conferred_by': aw.conferred_by.username if aw.conferred_by else None,
            'conferred_reason': aw.conferred_reason if aw.is_manual else '',
        })

    return Response({
        'student_id': student.id,
        'student_name': f"{student.first_name} {student.last_name}",
        'count': len(awards_data),
        'awards': awards_data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_summary_view(request):
    """
    Returns campus-level achievement statistics for authorized school leaders.
    Positive recognition aggregated counts by tier and recent highlights.
    """
    user = request.user
    if user.role not in ['principal', 'school_admin', 'organisation_admin', 'platform_admin']:
        raise PermissionDenied("Only school leaders and administrators can access campus summaries.")

    school = user.school
    if not school:
        raise ValidationError("User is not associated with a school.")

    awards_qs = AchievementAward.objects.filter(school=school)

    total_awards = awards_qs.count()
    by_tier = {
        'bronze': awards_qs.filter(tier='bronze').count(),
        'silver': awards_qs.filter(tier='silver').count(),
        'gold': awards_qs.filter(tier='gold').count(),
        'platinum': awards_qs.filter(tier='platinum').count(),
        'diamond': awards_qs.filter(tier='diamond').count(),
    }
    by_category = {
        'principal': awards_qs.filter(badge__category='principal').count(),
        'teacher': awards_qs.filter(badge__category='teacher').count(),
        'student': awards_qs.filter(badge__category='student').count(),
        'quiz': awards_qs.filter(badge__category='quiz').count(),
        'manual': awards_qs.filter(badge__category='manual').count(),
    }

    recent_awards = []
    for aw in awards_qs.select_related('badge', 'user')[:10]:
        recent_awards.append({
            'badge_name': aw.badge.name,
            'tier': aw.tier,
            'category': aw.badge.category,
            'icon_asset_name': aw.badge.icon_asset_name,
            'recipient': aw.user.username,
            'recipient_role': aw.user.role,
            'earned_at': aw.earned_at.isoformat(),
        })

    return Response({
        'campus_name': school.name,
        'total_awards': total_awards,
        'by_tier': by_tier,
        'by_category': by_category,
        'recent_achievements': recent_awards
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confer_manual_award_view(request):
    """
    Endpoint for conferring a manual recognition accolade with mandatory audit reason.
    """
    recipient_id = request.data.get('recipient_id')
    badge_slug = request.data.get('badge_slug')
    reason = request.data.get('reason', '')

    if not recipient_id or not badge_slug:
        raise ValidationError({'error': 'recipient_id and badge_slug are required.'})

    try:
        recipient = User.objects.get(id=recipient_id)
    except User.DoesNotExist:
        raise NotFound("Recipient user not found.")

    award = confer_manual_award(
        actor_user=request.user,
        recipient_user=recipient,
        badge_slug=badge_slug,
        reason=reason
    )

    return Response({
        'status': 'success',
        'message': f"Accolade '{award.badge.name}' successfully conferred to {recipient.username}.",
        'award_id': award.id,
        'tier': award.tier,
        'earned_at': award.earned_at.isoformat()
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def badge_reviews_view(request):
    """
    Lists awards flagged for review when source results were subsequently modified.
    """
    user = request.user
    if user.role not in ['principal', 'school_admin', 'organisation_admin', 'platform_admin']:
        raise PermissionDenied("Only administrators can view badge reviews.")

    qs = AchievementAward.objects.filter(review_flag=True)
    if user.school:
        qs = qs.filter(school=user.school)

    reviews = []
    for aw in qs.select_related('badge', 'user'):
        reviews.append({
            'award_id': aw.id,
            'badge_name': aw.badge.name,
            'tier': aw.tier,
            'user_username': aw.user.username,
            'user_role': aw.user.role,
            'period_identifier': aw.period_identifier,
            'review_reason': aw.review_reason,
            'earned_at': aw.earned_at.isoformat(),
            'evidence_data': aw.evidence_data,
        })

    return Response({
        'count': len(reviews),
        'reviews': reviews
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def resolve_badge_review_view(request):
    """
    Resolves an award review flag.
    """
    user = request.user
    if user.role not in ['principal', 'school_admin', 'organisation_admin', 'platform_admin']:
        raise PermissionDenied("Only administrators can resolve badge reviews.")

    award_id = request.data.get('award_id')
    notes = request.data.get('notes', 'Reviewed and resolved by administrator.')
    if not award_id:
        raise ValidationError({'award_id': 'award_id is required.'})

    award = resolve_award_review(award_id, actor=user, resolution_notes=notes)
    return Response({
        'status': 'success',
        'award_id': award.id,
        'review_flag': award.review_flag,
        'resolved_at': award.review_resolved_at.isoformat() if award.review_resolved_at else None
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def evaluate_trigger_view(request):
    """
    On-demand evaluation trigger for the authenticated user or their school.
    """
    user = request.user
    new_awards = []

    if user.role == 'student':
        student = getattr(user, 'student_record', None)
        if student:
            new_awards.extend(evaluate_student_achievements(student.id))
    elif user.role == 'teacher':
        new_awards.extend(evaluate_teacher_achievements(user.id))
    elif user.role in ['principal', 'school_admin']:
        new_awards.extend(evaluate_principal_achievements(user.id))

    # Always evaluate quizzes if any official attempts exist
    new_awards.extend(evaluate_quiz_achievements(user.id))

    return Response({
        'status': 'completed',
        'new_awards_count': len(new_awards),
        'awards': [{'id': a.id, 'badge_name': a.badge.name, 'tier': a.tier} for a in new_awards]
    })
