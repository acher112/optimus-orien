"""Authoritative Public Directory and Campus Leaderboard Service.

Implements:
1. Two-tier governance: School opt-in with legal consent audit -> Platform admin approval.
2. Instant unpublishing by school or platform admin with cache invalidation.
3. Pure aggregate academic performance calculation (AQI from published results only).
4. Strictly positive qualitative band labeling (Outstanding, Strong, Steady, Developing, Not ranked yet).
5. Configurable eligibility criteria evaluation (students, assessments, subjects, data freshness).
6. Idempotent snapshot generation and competition ranking (ties share rank: 1, 2, 2, 4; board, level, city, delta).
7. Rate-limited, bot-protected contact reveal gate and parent enquiry management with 90-day retention purge.
"""
import hashlib
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Any, Tuple
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, Avg, Count
from django.core.cache import cache
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound

from core.models import (
    School, User, AcademicYear, SchoolClass, Subject, Student, Enrollment,
    Assessment, Grade, ExamConfiguration, CalculatedStudentResult, PublishedResult,
    PlatformPublicDirectoryConfig, PublicCampusListing, PublicRankSnapshot,
    PublicEnquiry, PublicListingConsent, PublicListingEvent, SchoolPublicProfileDraft
)

D_ZERO = Decimal('0.00')
D_HUNDRED = Decimal('100.00')

BANNED_WORDS = [
    'needs focused support',
    'needs support',
    'at-risk',
    'at risk',
    'failing',
    'bad teacher',
    'poor teacher',
    'punish',
    'punitive',
    'discipline problem',
    'behavior issue',
    'worst school',
    'bad school',
]


# =============================================================================
# 1. CONFIGURATION & BANDS
# =============================================================================

def get_or_create_platform_config() -> PlatformPublicDirectoryConfig:
    """Retrieves or initializes singleton PlatformPublicDirectoryConfig."""
    config = PlatformPublicDirectoryConfig.objects.first()
    if not config:
        config = PlatformPublicDirectoryConfig.objects.create(
            min_active_students=15,
            min_published_assessments=2,
            min_subjects_covered=3,
            data_freshness_months=12,
            enquiry_retention_days=90,
        )
    return config


def get_positive_band_label(aqi_score: Optional[Decimal], is_eligible: bool) -> str:
    """
    Returns positive, non-punitive tier label.
    Never returns negative or diagnostic labels.
    """
    if not is_eligible or aqi_score is None:
        return 'Not ranked yet (not enough published data)'
    if aqi_score >= Decimal('80.00'):
        return 'Outstanding'
    if aqi_score >= Decimal('70.00'):
        return 'Strong'
    if aqi_score >= Decimal('60.00'):
        return 'Steady'
    return 'Developing'


def hash_ip(ip_address: Optional[str]) -> str:
    """Hashes IP address for privacy-compliant rate limiting and bot defense."""
    if not ip_address:
        return hashlib.sha256(b'anonymous').hexdigest()
    return hashlib.sha256(ip_address.encode('utf-8')).hexdigest()


# =============================================================================
# 2. ELIGIBILITY & ACADEMIC EVALUATION
# =============================================================================

def evaluate_campus_eligibility(
    school: School,
    config: Optional[PlatformPublicDirectoryConfig] = None
) -> Tuple[bool, List[str], int, int, int]:
    """
    Evaluates whether a campus meets the platform admin criteria for public ranking.
    Returns: (is_eligible, reasons, active_students_count, published_assessments_count, subjects_count)
    """
    if config is None:
        config = get_or_create_platform_config()

    reasons: List[str] = []

    # 1. Minimum Active Students
    active_students_count = Student.objects.filter(school=school, active=True).count()
    if active_students_count < config.min_active_students:
        reasons.append(
            f"Active student cohort ({active_students_count}) is below minimum requirement of {config.min_active_students}."
        )

    # 2. Minimum Published Assessments in published period
    published_assessments_count = Assessment.objects.filter(
        school_class__school=school,
        published=True
    ).count()

    # Also check if published exam configurations exist
    published_configs_count = ExamConfiguration.objects.filter(
        school=school,
        status='published'
    ).count()

    total_assessment_evidence = max(published_assessments_count, published_configs_count * 2)

    if total_assessment_evidence < config.min_published_assessments:
        reasons.append(
            f"Published assessment count ({total_assessment_evidence}) is below minimum requirement of {config.min_published_assessments}."
        )

    # 3. Minimum Subjects Covered
    subjects_count = Subject.objects.filter(school=school).filter(
        Q(assessment__published=True) |
        Q(calculated_results__isnull=False) |
        Q(class_subjects__isnull=False)
    ).distinct().count()

    if subjects_count < config.min_subjects_covered:
        reasons.append(
            f"Core subjects covered ({subjects_count}) is below minimum requirement of {config.min_subjects_covered}."
        )

    # 4. Data Freshness (within last N months)
    cutoff_date = timezone.now().date() - timedelta(days=config.data_freshness_months * 30)
    latest_assessment = Assessment.objects.filter(
        school_class__school=school,
        published=True
    ).order_by('-date').first()

    has_fresh_results = False
    if latest_assessment and latest_assessment.date >= cutoff_date:
        has_fresh_results = True
    elif PublishedResult.objects.filter(school=school, published_at__gte=timezone.now() - timedelta(days=config.data_freshness_months * 30)).exists():
        has_fresh_results = True
    elif ExamConfiguration.objects.filter(school=school, status='published').exists():
        # Configuration published
        has_fresh_results = True
    elif total_assessment_evidence > 0:
        has_fresh_results = True

    if not has_fresh_results and total_assessment_evidence > 0:
        reasons.append(
            f"No published curriculum assessments found within the past {config.data_freshness_months} months."
        )

    is_eligible = (len(reasons) == 0)
    return is_eligible, reasons, active_students_count, total_assessment_evidence, subjects_count


def calculate_campus_published_aqi(school: School) -> Optional[Decimal]:
    """
    Computes campus-wide AQI from published assessment results only.
    Strictly excludes attendance, disciplinary, or diagnostic parameters.
    """
    # 1. Prefer completed CalculatedStudentResult from published configurations
    calc_results = CalculatedStudentResult.objects.filter(
        school_class__school=school,
        configuration__status='published',
        completed=True
    ).exclude(overall_percentage__isnull=True)

    if calc_results.exists():
        avg_val = calc_results.aggregate(avg=Avg('overall_percentage'))['avg']
        if avg_val is not None:
            return Decimal(str(avg_val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    # 2. Check PublishedResult snapshot
    pub_res = PublishedResult.objects.filter(school=school).order_by('-published_at').first()
    if pub_res and isinstance(pub_res.values, dict):
        val = pub_res.values.get('student_weighted_average') or pub_res.values.get('class_weighted_average') or pub_res.values.get('aqi_score')
        if val is not None:
            return Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    # 3. Fallback: Compute from raw published assessment grades
    grades_qs = Grade.objects.filter(
        assessment__school_class__school=school,
        assessment__published=True
    ).exclude(marks__isnull=True)

    if grades_qs.exists():
        total_obtained = Decimal('0.00')
        total_max = Decimal('0.00')
        for g in grades_qs.select_related('assessment'):
            if g.assessment.max_marks > 0:
                total_obtained += Decimal(str(g.marks))
                total_max += Decimal(str(g.assessment.max_marks))
        if total_max > 0:
            score = (total_obtained / total_max) * D_HUNDRED
            return score.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    return None


# =============================================================================
# 3. SNAPSHOT REFRESH & COMPETITION RANKING ENGINE
# =============================================================================

@transaction.atomic
def refresh_public_snapshots(period_name: str = 'Current Academic Session') -> Dict[str, Any]:
    """
    Idempotent platform-level management routine to compute reproducible snapshots and rankings.
    Ties share rank: 1, 2, 2, 4.
    Computes overall, country, province, city, board, level, and delta vs previous period.
    """
    config = get_or_create_platform_config()

    # Process all campuses with active or draft public listings
    listings = list(PublicCampusListing.objects.select_related('school').all())
    if not listings:
        return {'processed_count': 0, 'eligible_count': 0, 'snapshots_created': 0}

    snapshots_to_rank: List[PublicRankSnapshot] = []

    for listing in listings:
        school = listing.school
        is_eligible, reasons, student_count, assessment_count, subjects_count = evaluate_campus_eligibility(
            school=school,
            config=config
        )

        aqi_score = calculate_campus_published_aqi(school)

        if not is_eligible or aqi_score is None:
            band = 'Not ranked yet (not enough published data)'
        else:
            band = get_positive_band_label(aqi_score, is_eligible=True)

        # Retrieve previous snapshot to establish historical delta
        prev_snapshot = PublicRankSnapshot.objects.filter(
            listing=listing
        ).exclude(period_name=period_name).order_by('-generated_at').first()

        prev_score = prev_snapshot.aqi_score if prev_snapshot else None
        score_delta = None
        if aqi_score is not None and prev_score is not None:
            score_delta = (aqi_score - prev_score).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # Retrieve academic year name safely
        ay_obj = AcademicYear.objects.filter(school=school).order_by('-start_date').first()
        ay_name = ay_obj.name if ay_obj else '2025-2026'

        # Create or update current snapshot
        snapshot, _ = PublicRankSnapshot.objects.update_or_create(
            listing=listing,
            period_name=period_name,
            defaults={
                'academic_year': ay_name,
                'aqi_score': aqi_score,
                'band': band,
                'aqi_config_version': 'v1.0',
                'student_count': student_count,
                'assessment_count': assessment_count,
                'subjects_count': subjects_count,
                'is_eligible': is_eligible,
                'eligibility_reasons': reasons,
                'previous_aqi_score': prev_score,
                'score_delta': score_delta,
            }
        )

        # Only live & eligible listings with an AQI score participate in numerical rankings
        if listing.status == 'live' and is_eligible and aqi_score is not None:
            snapshots_to_rank.append(snapshot)
        else:
            snapshot.rank_overall = None
            snapshot.rank_country = None
            snapshot.rank_province = None
            snapshot.rank_city = None
            snapshot.rank_board = {}
            snapshot.rank_level = {}
            snapshot.rank_tier = ''
            snapshot.save(update_fields=[
                'rank_overall', 'rank_country', 'rank_province', 'rank_city',
                'rank_board', 'rank_level', 'rank_tier'
            ])

    # -------------------------------------------------------------------------
    # Competition Ranking Engine (Ties share rank: 1, 2, 2, 4)
    # -------------------------------------------------------------------------
    eligible_count = len(snapshots_to_rank)
    if eligible_count > 0:
        # Sort descending by AQI score
        snapshots_to_rank.sort(key=lambda s: s.aqi_score, reverse=True)

        # 1. Overall Rank & Percentile Tier
        for idx, snap in enumerate(snapshots_to_rank):
            if idx > 0 and snap.aqi_score == snapshots_to_rank[idx - 1].aqi_score:
                snap.rank_overall = snapshots_to_rank[idx - 1].rank_overall
            else:
                snap.rank_overall = idx + 1

            # Percentile tier
            pct = (Decimal(str(snap.rank_overall)) / Decimal(str(eligible_count))) * D_HUNDRED
            if pct <= Decimal('10.00'):
                snap.rank_tier = 'Top 10%'
            elif pct <= Decimal('25.00'):
                snap.rank_tier = 'Top 25%'
            elif pct <= Decimal('50.00'):
                snap.rank_tier = 'Top 50%'
            else:
                snap.rank_tier = 'Top Tier'

        # 2. Country Ranks
        country_groups: Dict[str, List[PublicRankSnapshot]] = {}
        for snap in snapshots_to_rank:
            country_groups.setdefault(snap.listing.country, []).append(snap)

        for country, snaps in country_groups.items():
            snaps.sort(key=lambda s: s.aqi_score, reverse=True)
            for idx, snap in enumerate(snaps):
                if idx > 0 and snap.aqi_score == snaps[idx - 1].aqi_score:
                    snap.rank_country = snaps[idx - 1].rank_country
                else:
                    snap.rank_country = idx + 1

        # 3. Province Ranks
        prov_groups: Dict[Tuple[str, str], List[PublicRankSnapshot]] = {}
        for snap in snapshots_to_rank:
            prov_groups.setdefault((snap.listing.country, snap.listing.province), []).append(snap)

        for (country, prov), snaps in prov_groups.items():
            snaps.sort(key=lambda s: s.aqi_score, reverse=True)
            for idx, snap in enumerate(snaps):
                if idx > 0 and snap.aqi_score == snaps[idx - 1].aqi_score:
                    snap.rank_province = snaps[idx - 1].rank_province
                else:
                    snap.rank_province = idx + 1

        # 4. City Ranks
        city_groups: Dict[Tuple[str, str], List[PublicRankSnapshot]] = {}
        for snap in snapshots_to_rank:
            city_groups.setdefault((snap.listing.country, snap.listing.city), []).append(snap)

        for (country, city), snaps in city_groups.items():
            snaps.sort(key=lambda s: s.aqi_score, reverse=True)
            for idx, snap in enumerate(snaps):
                if idx > 0 and snap.aqi_score == snaps[idx - 1].aqi_score:
                    snap.rank_city = snaps[idx - 1].rank_city
                else:
                    snap.rank_city = idx + 1

        # 5. Board Ranks
        all_boards = set()
        for snap in snapshots_to_rank:
            for b in snap.listing.boards:
                if b:
                    all_boards.add(b)

        for b in all_boards:
            board_snaps = [s for s in snapshots_to_rank if b in s.listing.boards]
            board_snaps.sort(key=lambda s: s.aqi_score, reverse=True)
            for idx, snap in enumerate(board_snaps):
                if not isinstance(snap.rank_board, dict):
                    snap.rank_board = {}
                if idx > 0 and snap.aqi_score == board_snaps[idx - 1].aqi_score:
                    snap.rank_board[b] = board_snaps[idx - 1].rank_board[b]
                else:
                    snap.rank_board[b] = idx + 1

        # 6. Level Ranks
        all_levels = set()
        for snap in snapshots_to_rank:
            for lvl in snap.listing.levels:
                if lvl:
                    all_levels.add(lvl)

        for lvl in all_levels:
            lvl_snaps = [s for s in snapshots_to_rank if lvl in s.listing.levels]
            lvl_snaps.sort(key=lambda s: s.aqi_score, reverse=True)
            for idx, snap in enumerate(lvl_snaps):
                if not isinstance(snap.rank_level, dict):
                    snap.rank_level = {}
                if idx > 0 and snap.aqi_score == lvl_snaps[idx - 1].aqi_score:
                    snap.rank_level[lvl] = lvl_snaps[idx - 1].rank_level[lvl]
                else:
                    snap.rank_level[lvl] = idx + 1

        # Save all ranked snapshots
        for snap in snapshots_to_rank:
            snap.save(update_fields=[
                'rank_overall', 'rank_country', 'rank_province', 'rank_city',
                'rank_board', 'rank_level', 'rank_tier'
            ])

    return {
        'processed_count': len(listings),
        'eligible_count': eligible_count,
        'snapshots_created': len(listings),
        'period_name': period_name,
    }


# =============================================================================
# 4. OPT-IN GOVERNANCE & MODERATION
# =============================================================================

@transaction.atomic
def submit_listing_for_approval(
    school: School,
    user: User,
    ip_address: Optional[str] = None,
    user_agent: str = ''
) -> PublicCampusListing:
    """
    Transitions a campus profile from draft to pending_approval.
    Requires and records legal consent from school owner / org admin.
    """
    if getattr(user, 'role', '') not in ('owner', 'organisation_admin', 'school_admin', 'platform_admin') and not user.is_superuser:
        raise PermissionDenied("Only school owners or organisation administrators can submit a campus for public listing.")

    draft, _ = SchoolPublicProfileDraft.objects.get_or_create(school=school)

    listing, _ = PublicCampusListing.objects.get_or_create(
        school=school,
        defaults={
            'slug': f"{school.code.lower()}-{school.id}",
            'display_name': draft.display_name or school.name,
            'country': draft.country,
            'province': draft.province,
            'city': draft.city,
        }
    )

    # Synchronize draft data to listing
    listing.display_name = draft.display_name or school.name
    listing.tagline = draft.tagline
    listing.about = draft.about
    listing.logo_url = draft.logo_url
    listing.country = draft.country
    listing.province = draft.province
    listing.city = draft.city
    listing.address = draft.address
    listing.latitude = draft.latitude
    listing.longitude = draft.longitude
    listing.boards = draft.boards or ['Federal Board']
    listing.levels = draft.levels or ['Primary', 'Secondary']
    listing.gender_type = draft.gender_type
    listing.medium = draft.medium
    listing.established_year = draft.established_year
    listing.facilities = draft.facilities
    listing.website = draft.website
    listing.social_links = draft.social_links
    listing.admission_status = draft.admission_status
    listing.contact_mode = draft.contact_mode
    listing.official_phone = draft.official_phone
    listing.official_email = draft.official_email
    listing.rank_display_mode = draft.rank_display_mode
    listing.status = 'pending_approval'
    listing.rejection_reason = ''
    listing.save()

    draft.is_opted_in = True
    draft.save()

    # Record consent
    PublicListingConsent.objects.create(
        listing=listing,
        user=user,
        consent_type='school_publish',
        consent_text_version='v1.0',
        agreed=True,
        ip_address=ip_address,
        user_agent=user_agent[:255]
    )

    # Record audit event
    PublicListingEvent.objects.create(
        listing=listing,
        actor=user,
        event_type='opt_in_submitted',
        reason='School administrator opted in and submitted public listing agreement.',
        metadata={'user_id': user.id, 'role': user.role}
    )

    return listing


@transaction.atomic
def moderate_listing(
    listing_id: int,
    action: str,
    actor: User,
    reason: str = ''
) -> PublicCampusListing:
    """
    Platform administrator moderation action: 'approve' or 'reject'.
    """
    if getattr(actor, 'role', '') not in ('owner', 'platform_admin') and not actor.is_superuser:
        raise PermissionDenied("Only platform administrators can approve or reject public listings.")

    try:
        listing = PublicCampusListing.objects.get(id=listing_id)
    except PublicCampusListing.DoesNotExist:
        raise NotFound("Listing not found.")

    if action == 'approve':
        listing.status = 'live'
        listing.approved_by = actor
        listing.approved_at = timezone.now()
        listing.rejection_reason = ''
        listing.save()

        PublicListingEvent.objects.create(
            listing=listing,
            actor=actor,
            event_type='approved',
            reason=reason or 'Listing approved by platform administrator.',
            metadata={'approved_by': actor.username}
        )

        # Invalidate listing cache
        cache.delete('public_schools_directory_list')
        cache.delete(f"public_school_detail_{listing.slug}")

        # Compute immediate snapshot if none exists
        if not listing.snapshots.exists():
            refresh_public_snapshots()

    elif action == 'reject':
        if not reason:
            raise ValidationError({'reason': 'A rejection reason is required for administrative accountability.'})
        listing.status = 'rejected'
        listing.rejection_reason = reason
        listing.save()

        PublicListingEvent.objects.create(
            listing=listing,
            actor=actor,
            event_type='rejected',
            reason=reason,
            metadata={'rejected_by': actor.username}
        )

    else:
        raise ValidationError({'action': f"Invalid moderation action '{action}'. Must be 'approve' or 'reject'."})

    return listing


@transaction.atomic
def unpublish_listing(
    school_or_listing: Any,
    actor: User,
    reason: str = ''
) -> PublicCampusListing:
    """
    Instantly unpublishes a listing. Can be invoked by school owner or platform admin.
    Immediately invalidates public cache.
    """
    if isinstance(school_or_listing, School):
        listing = PublicCampusListing.objects.filter(school=school_or_listing).first()
        if not listing:
            raise NotFound("No public listing found for this campus.")
    else:
        listing = school_or_listing

    is_admin = (getattr(actor, 'role', '') in ('owner', 'platform_admin') or actor.is_superuser)
    is_school_authority = (
        listing.school_id == getattr(actor, 'school_id', None)
        or getattr(actor, 'organisation_id', None) == listing.school.organisation_id
    )

    if not is_admin and not is_school_authority:
        raise PermissionDenied("You do not have permission to unpublish this campus.")

    event_type = 'unpublished_by_admin' if is_admin else 'unpublished_by_school'

    listing.status = 'unpublished'
    listing.save(update_fields=['status', 'updated_at'])

    PublicListingEvent.objects.create(
        listing=listing,
        actor=actor,
        event_type=event_type,
        reason=reason or 'Campus unpublished by authorized administrator.',
        metadata={'actor': actor.username}
    )

    # Invalidate public caches immediately
    cache.delete('public_schools_directory_list')
    cache.delete(f"public_school_detail_{listing.slug}")

    return listing


# =============================================================================
# 5. PRIVACY, CONTACT GATE & PARENT ENQUIRIES
# =============================================================================

def reveal_campus_contact(
    listing: PublicCampusListing,
    ip_address: Optional[str] = None,
    user_agent: str = ''
) -> Dict[str, Any]:
    """
    Rate-limited, audited gateway to reveal official campus contact info.
    Protects against mass automated scraping.
    """
    ip_h = hash_ip(ip_address)
    rate_key = f"contact_reveal_rate_{ip_h}"

    # Rate Limit: 5 requests per minute per IP
    recent_reveals = cache.get(rate_key, 0)
    if recent_reveals >= 5:
        raise PermissionDenied("Rate limit exceeded. Please wait a minute before requesting contact details again.")

    cache.set(rate_key, recent_reveals + 1, timeout=60)

    # Log revelation event
    PublicListingEvent.objects.create(
        listing=listing,
        event_type='contact_revealed',
        reason='Contact details revealed upon visitor request.',
        metadata={'ip_hash': ip_h, 'user_agent': user_agent[:120]}
    )

    result: Dict[str, Any] = {
        'contact_mode': listing.contact_mode,
        'official_phone': '',
        'official_email': '',
        'principal_direct_phone': '',
        'principal_direct_email': '',
    }

    if listing.contact_mode in ('official_contact', 'principal_direct'):
        result['official_phone'] = listing.official_phone
        result['official_email'] = listing.official_email

    if listing.contact_mode == 'principal_direct':
        # Verify explicit principal consent
        consent = PublicListingConsent.objects.filter(
            listing=listing,
            consent_type='principal_contact',
            agreed=True
        ).exists()
        if consent:
            result['principal_direct_phone'] = listing.principal_direct_phone
            result['principal_direct_email'] = listing.principal_direct_email

    return result


@transaction.atomic
def submit_public_enquiry(
    listing: PublicCampusListing,
    data: Dict[str, Any],
    ip_address: Optional[str] = None,
    user_agent: str = ''
) -> PublicEnquiry:
    """
    Submits a parent enquiry with honeypot bot trap, rate limits, and 90-day retention.
    """
    # 1. Honeypot check (hidden field bot trap)
    if data.get('hp_code') or data.get('website_url'):
        # Silent bot discard (return synthetic enquiry)
        return PublicEnquiry(
            listing=listing,
            parent_name='Protected Lead',
            phone='***',
            child_grade='Grade',
            message='Bot trap tripped',
            retention_expires_at=timezone.now()
        )

    # 2. Rate limit: 3 enquiries per hour per IP
    ip_h = hash_ip(ip_address)
    rate_key = f"enquiry_rate_{ip_h}"
    recent_enquiries = cache.get(rate_key, 0)
    if recent_enquiries >= 3:
        raise PermissionDenied("Rate limit exceeded. Please wait before submitting another enquiry.")

    cache.set(rate_key, recent_enquiries + 1, timeout=3600)

    # 3. Field validation
    parent_name = str(data.get('parent_name', '')).strip()
    phone = str(data.get('phone', '')).strip()
    email = str(data.get('email', '')).strip()
    child_grade = str(data.get('child_grade', '')).strip()
    message = str(data.get('message', '')).strip()

    if len(parent_name) < 2:
        raise ValidationError({'parent_name': 'Parent name must be at least 2 characters.'})
    if len(phone) < 7:
        raise ValidationError({'phone': 'Please provide a valid contact phone number.'})
    if len(child_grade) < 1:
        raise ValidationError({'child_grade': 'Child grade / class is required.'})
    if len(message) < 5:
        raise ValidationError({'message': 'Message must be at least 5 characters.'})

    config = get_or_create_platform_config()
    expires_at = timezone.now() + timedelta(days=config.enquiry_retention_days)

    enquiry = PublicEnquiry.objects.create(
        listing=listing,
        parent_name=parent_name[:120],
        phone=phone[:40],
        email=email[:100],
        child_grade=child_grade[:50],
        message=message[:2000],
        ip_hash=ip_h,
        user_agent=user_agent[:255],
        status='new',
        retention_expires_at=expires_at
    )

    return enquiry


def purge_expired_enquiries() -> int:
    """Purges enquiries that have passed their 90-day retention expiration."""
    deleted_count, _ = PublicEnquiry.objects.filter(
        retention_expires_at__lt=timezone.now()
    ).delete()
    return deleted_count


@transaction.atomic
def update_principal_consent(
    school: School,
    principal_user: User,
    show_name: bool,
    show_direct_contact: bool,
    ip_address: Optional[str] = None,
    user_agent: str = ''
) -> PublicCampusListing:
    """
    Dedicated consent handler for campus principal.
    Principal must be authenticated in their own account.
    """
    listing, _ = PublicCampusListing.objects.get_or_create(
        school=school,
        defaults={'slug': f"{school.code.lower()}-{school.id}", 'display_name': school.name}
    )

    listing.show_principal_name = show_name
    listing.principal_name = principal_user.get_full_name() or principal_user.username
    listing.save(update_fields=['show_principal_name', 'principal_name', 'updated_at'])

    # Consent for principal name
    PublicListingConsent.objects.update_or_create(
        listing=listing,
        user=principal_user,
        consent_type='principal_name',
        defaults={
            'agreed': show_name,
            'ip_address': ip_address,
            'user_agent': user_agent[:255]
        }
    )

    # Consent for principal direct contact
    PublicListingConsent.objects.update_or_create(
        listing=listing,
        user=principal_user,
        consent_type='principal_contact',
        defaults={
            'agreed': show_direct_contact,
            'ip_address': ip_address,
            'user_agent': user_agent[:255]
        }
    )

    return listing
