"""Authoritative REST API Views for Public Directory & Campus Leaderboard.

Includes:
1. Public Read-Only Endpoints:
   - GET /api/v1/public/schools/ (search, filters, sorting, pagination, NO phone/email)
   - GET /api/v1/public/schools/<slug>/ (detailed profile & chronological history)
   - GET /api/v1/public/schools/compare/ (side-by-side comparison of 2-3 campuses)
   - POST /api/v1/public/schools/<slug>/reveal-contact/ (rate-limited, audited on-demand contact revelation)
   - POST /api/v1/public/schools/<slug>/enquiry/ (honeypot-protected parent enquiry submission)
   - GET /api/v1/public/schools/sitemap/ (live indexing sitemap)
   - GET /api/v1/public/schools/methodology/ (honesty statement and evaluation criteria)

2. School-Side Management Endpoints:
   - GET/PUT /api/v1/schools/<school_id>/public-profile/
   - POST /api/v1/schools/<school_id>/public-profile/submit/
   - POST /api/v1/schools/<school_id>/public-profile/unpublish/
   - GET /api/v1/schools/<school_id>/public-enquiries/
   - POST /api/v1/schools/<school_id>/public-enquiries/<id>/handle/
   - POST /api/v1/principal/public-directory-consent/

3. Platform Admin Moderation Endpoints:
   - GET /api/v1/admin/public-directory/listings/
   - POST /api/v1/admin/public-directory/listings/<id>/approve/
   - POST /api/v1/admin/public-directory/listings/<id>/reject/
   - POST /api/v1/admin/public-directory/listings/<id>/unpublish/
   - GET/PUT /api/v1/admin/public-directory/config/
   - POST /api/v1/admin/public-directory/trigger-snapshot/
"""
from decimal import Decimal
import logging
from typing import Dict, Any, List
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from django.core.paginator import Paginator, EmptyPage
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound

from core.models import (
    School, User, PublicCampusListing, PublicRankSnapshot,
    PublicEnquiry, PublicListingConsent, PublicListingEvent,
    SchoolPublicProfileDraft, PlatformPublicDirectoryConfig
)
from core.services.public_directory_service import (
    get_or_create_platform_config,
    refresh_public_snapshots,
    ensure_all_registered_campuses_synced,
    submit_listing_for_approval,
    moderate_listing,
    unpublish_listing,
    reveal_campus_contact,
    submit_public_enquiry,
    update_principal_consent,
    hash_ip
)


def _get_client_ip(request) -> str:
    """Helper to safely extract the client IP address."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')


def _parse_bool(val: Any) -> bool:
    """Safely converts string or boolean representations to bool."""
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ('true', '1', 't', 'yes')
    return bool(val)


def _check_platform_admin(request) -> bool:
    """Validates if user is platform owner or superuser."""
    if not request.user or not request.user.is_authenticated:
        return False
    return request.user.role in ('owner', 'platform_admin') or request.user.is_superuser



def _serialize_card(listing: PublicCampusListing, snapshot: PublicRankSnapshot) -> Dict[str, Any]:
    """
    Serializes campus listing for public search and leaderboard cards.
    STRICT SECURITY RULE: Never includes official_phone, official_email,
    principal_direct_phone, or principal_direct_email.
    """
    rank_mode = listing.rank_display_mode or 'exact_rank'

    # Score & Average display logic
    score_display = None
    if snapshot and snapshot.aqi_score is not None:
        if rank_mode != 'unranked_listing' or not snapshot.is_eligible:
            try:
                score_display = float(snapshot.aqi_score)
            except Exception:
                score_display = None

    # Rank display logic
    rank_overall_display = None
    rank_city_display = None
    if snapshot and snapshot.is_eligible and snapshot.rank_overall is not None:
        if rank_mode == 'exact_rank':
            rank_overall_display = snapshot.rank_overall
            rank_city_display = snapshot.rank_city

    tier_display = snapshot.rank_tier if (snapshot and snapshot.is_eligible and rank_mode in ('exact_rank', 'tier_only')) else ''

    # Principal resolution: identify assigned principal or note unavailable
    principal_val = (listing.principal_name or "").strip()
    if not principal_val and listing.school_id:
        try:
            from core.views import resolve_school_principal_name
            principal_val = resolve_school_principal_name(listing.school)
        except Exception:
            principal_val = ""

    # Principal consent rule: principal_name is publicly revealed only if consented
    has_principal_consent = bool(listing.show_principal_name and principal_val)
    principal_public_name = principal_val if has_principal_consent else None
    principal_display = principal_val if has_principal_consent else "Not available yet"

    band_str = snapshot.band if snapshot else 'Not ranked yet (not enough published data)'
    average_display = f"{score_display:.1f}%" if score_display is not None else "Not available yet"
    performance_display = f"{score_display:.1f}% • {band_str}" if score_display is not None else band_str
    location_parts = [p for p in [listing.city, listing.province, listing.country] if p]
    location_display = ", ".join(location_parts) if location_parts else "Registered Campus"

    return {
        'slug': listing.slug,
        'display_name': listing.display_name or (listing.school.name if listing.school else 'Campus'),
        'tagline': listing.tagline or '',
        'logo_url': listing.logo_url or '',
        'country': listing.country or '',
        'province': listing.province or '',
        'city': listing.city or '',
        'address': listing.address or '',
        'location_display': location_display,
        'latitude': float(listing.latitude) if listing.latitude is not None else None,
        'longitude': float(listing.longitude) if listing.longitude is not None else None,
        'boards': listing.boards or [],
        'levels': listing.levels or [],
        'gender_type': listing.gender_type or 'co-ed',
        'medium': listing.medium or 'english',
        'established_year': listing.established_year,
        'admission_status': listing.admission_status or 'open',
        'principal_name': principal_public_name,
        'principal_display': principal_display,
        'principal_title': listing.principal_title or 'Principal',
        'contact_mode': listing.contact_mode or 'enquiry_only',
        'rank_display_mode': rank_mode,
        'score': score_display,
        'average_display': average_display,
        'performance_display': performance_display,
        'band': band_str,
        'rank_overall': rank_overall_display,
        'rank_city': rank_city_display,
        'rank_tier': tier_display,
        'score_delta': float(snapshot.score_delta) if (snapshot and snapshot.score_delta is not None) else None,
        'is_eligible': snapshot.is_eligible if snapshot else False,
        'updated_at': listing.updated_at.isoformat() if listing.updated_at else timezone.now().isoformat(),
    }


# =============================================================================
# 1. PUBLIC DIRECTORY READ-ONLY ENDPOINTS
# =============================================================================

@api_view(['GET'])
@permission_classes([AllowAny])
def public_schools_list_view(request):
    """
    Public directory search and leaderboard endpoint.
    Filters: q, country, province, city, board, level, gender, medium, admission_open
    Sorting: rank, name, score, improved
    Pagination: page, page_size (default 12, max 36)
    """
    import sys
    logger = logging.getLogger(__name__)

    try:
        is_testing = 'test' in sys.argv or getattr(settings, 'TESTING', False)
        if not is_testing:
            # Sync registered campuses if any are missing or if no live listings exist
            school_count = School.objects.count()
            live_count = PublicCampusListing.objects.filter(status='live').count()
            if school_count > 0 and live_count < school_count:
                try:
                    ensure_all_registered_campuses_synced()
                except Exception as sync_err:
                    logger.exception("Error syncing registered campuses into public directory: %s", sync_err)

        # Public queries read live PublicCampusListing records representing registered campuses
        qs = PublicCampusListing.objects.filter(status='live')

        # Search query
        q = request.GET.get('q', '').strip()
        if q:
            qs = qs.filter(
                Q(display_name__icontains=q) |
                Q(city__icontains=q) |
                Q(tagline__icontains=q)
            )

        # Geographic filters
        country = request.GET.get('country', '').strip()
        if country and country.lower() != 'all':
            qs = qs.filter(country__iexact=country)

        province = request.GET.get('province', '').strip()
        if province and province.lower() != 'all':
            qs = qs.filter(province__iexact=province)

        city = request.GET.get('city', '').strip()
        if city and city.lower() != 'all':
            qs = qs.filter(city__iexact=city)

        # Academic metadata filters
        board = request.GET.get('board', '').strip()
        if board and board.lower() != 'all':
            qs = qs.filter(boards__contains=board)

        level = request.GET.get('level', '').strip()
        if level and level.lower() != 'all':
            qs = qs.filter(levels__contains=level)

        gender = request.GET.get('gender', '').strip()
        if gender and gender.lower() != 'all':
            qs = qs.filter(gender_type=gender)

        medium = request.GET.get('medium', '').strip()
        if medium and medium.lower() != 'all':
            qs = qs.filter(medium=medium)

        admission_open = request.GET.get('admission_open')
        if admission_open in ('true', '1', 'True'):
            qs = qs.filter(admission_status='open')

        # Attach latest snapshot
        listings = list(qs)
        listing_ids = [l.id for l in listings]
        latest_snapshots = {}
        if listing_ids:
            snapshots_qs = PublicRankSnapshot.objects.filter(listing_id__in=listing_ids).order_by('listing_id', '-generated_at')
            for snap in snapshots_qs:
                if snap.listing_id not in latest_snapshots:
                    latest_snapshots[snap.listing_id] = snap

        # Pair listings with snapshot
        items = []
        for l in listings:
            snap = latest_snapshots.get(l.id)
            if not snap:
                # Fallback placeholder snapshot
                snap = PublicRankSnapshot(
                    listing=l,
                    period_name='Current',
                    band='Not ranked yet (not enough published data)',
                    is_eligible=False
                )
            items.append((l, snap))

        # Sorting
        sort_by = request.GET.get('sort', 'rank')
        if sort_by == 'name':
            items.sort(key=lambda x: (x[0].display_name or '').lower())
        elif sort_by == 'score':
            items.sort(key=lambda x: (x[1].aqi_score is not None, x[1].aqi_score or Decimal('-999.00')), reverse=True)
        elif sort_by == 'improved':
            items.sort(key=lambda x: (x[1].score_delta is not None, x[1].score_delta or Decimal('-999.00')), reverse=True)
        else:  # default 'rank'
            items.sort(
                key=lambda x: (
                    x[1].is_eligible and x[1].rank_overall is not None,
                    -(x[1].rank_overall or 999999)
                ),
                reverse=True
            )

        # Pagination
        try:
            page_size = min(int(request.GET.get('page_size', 12)), 36)
        except (ValueError, TypeError):
            page_size = 12

        try:
            page_num = int(request.GET.get('page', 1))
        except (ValueError, TypeError):
            page_num = 1

        paginator = Paginator(items, page_size)
        try:
            page_obj = paginator.page(page_num)
        except EmptyPage:
            page_obj = []

        results = [_serialize_card(listing, snap) for listing, snap in page_obj]

        # Available filter values for frontend dropdowns
        available_cities = list(PublicCampusListing.objects.filter(status='live').exclude(city='').values_list('city', flat=True).distinct().order_by('city'))
        available_countries = list(PublicCampusListing.objects.filter(status='live').exclude(country='').values_list('country', flat=True).distinct().order_by('country'))

        return Response({
            'count': paginator.count,
            'num_pages': paginator.num_pages,
            'current_page': page_num,
            'page_size': page_size,
            'available_cities': available_cities,
            'available_countries': available_countries,
            'results': results,
        }, status=status.HTTP_200_OK)

    except Exception as exc:
        logger.exception("Unexpected error in public_schools_list_view: %s", exc)
        return Response({
            'count': 0,
            'num_pages': 1,
            'current_page': 1,
            'page_size': 12,
            'available_cities': [],
            'available_countries': [],
            'results': [],
        }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_school_detail_view(request, slug):
    """
    Public campus profile detail endpoint.
    Excludes direct contact details (must be revealed on demand via reveal-contact gate).
    """
    import sys
    try:
        listing = PublicCampusListing.objects.get(slug=slug, status='live')
    except PublicCampusListing.DoesNotExist:
        if not ('test' in sys.argv or getattr(settings, 'TESTING', False)):
            try:
                ensure_all_registered_campuses_synced()
                listing = PublicCampusListing.objects.get(slug=slug, status='live')
            except Exception:
                raise NotFound("Campus not found or listing is not publicly live.")
        else:
            raise NotFound("Campus not found or listing is not publicly live.")

    # Retrieve all historical snapshots for trend sparklines
    snapshots = list(listing.snapshots.order_by('generated_at'))
    latest_snapshot = snapshots[-1] if snapshots else PublicRankSnapshot(
        listing=listing,
        period_name='Current',
        band='Not ranked yet (not enough published data)',
        is_eligible=False
    )

    history = [
        {
            'period_name': s.period_name,
            'academic_year': s.academic_year,
            'aqi_score': float(s.aqi_score) if (s.is_eligible and s.aqi_score is not None and listing.rank_display_mode != 'unranked_listing') else None,
            'band': s.band,
            'rank_overall': s.rank_overall if (s.is_eligible and listing.rank_display_mode == 'exact_rank') else None,
            'score_delta': float(s.score_delta) if s.score_delta is not None else None,
            'generated_at': s.generated_at.isoformat(),
        }
        for s in snapshots
    ]

    card_data = _serialize_card(listing, latest_snapshot)

    # Detailed fields
    data = {
        **card_data,
        'about': listing.about,
        'facilities': listing.facilities,
        'website': listing.website,
        'social_links': listing.social_links,
        'history': history,
        'honesty_statement_url': '/schools/methodology',
        'methodology_url': '/schools/methodology',
    }

    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_schools_compare_view(request):
    """
    Public comparison endpoint: side-by-side comparison of 2 or 3 campuses.
    Query param: ?slugs=slug1,slug2,slug3
    """
    slugs_raw = request.GET.get('slugs', '').strip()
    if not slugs_raw:
        return Response({'detail': 'Please provide school slugs to compare (e.g. ?slugs=school-a,school-b).'}, status=status.HTTP_400_BAD_REQUEST)

    slugs = [s.strip() for s in slugs_raw.split(',') if s.strip()]
    if len(slugs) < 2 or len(slugs) > 3:
        return Response({'detail': 'Comparison requires between 2 and 3 campuses.'}, status=status.HTTP_400_BAD_REQUEST)

    listings = list(PublicCampusListing.objects.filter(slug__in=slugs, status='live'))
    if len(listings) != len(slugs):
        found_slugs = {l.slug for l in listings}
        missing = set(slugs) - found_slugs
        return Response({'detail': f"Campuses not found or unlisted: {', '.join(missing)}"}, status=status.HTTP_404_NOT_FOUND)

    # Build comparison cards
    comparison = []
    for l in listings:
        latest = l.snapshots.order_by('-generated_at').first() or PublicRankSnapshot(
            listing=l, period_name='Current', band='Not ranked yet', is_eligible=False
        )
        card = _serialize_card(l, latest)
        card['facilities'] = l.facilities
        card['about'] = l.about
        comparison.append(card)

    return Response({'campuses': comparison}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def public_reveal_contact_view(request, slug):
    """
    Rate-limited, audited gateway to reveal official campus contact info.
    Protects against automated contact scraping.
    """
    try:
        listing = PublicCampusListing.objects.get(slug=slug, status='live')
    except PublicCampusListing.DoesNotExist:
        raise NotFound("Campus not found.")

    ip_address = _get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    contact_info = reveal_campus_contact(
        listing=listing,
        ip_address=ip_address,
        user_agent=user_agent
    )

    return Response(contact_info, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def public_submit_enquiry_view(request, slug):
    """
    Parent enquiry submission endpoint.
    Protected by honeypot bot trap and rate limits.
    """
    try:
        listing = PublicCampusListing.objects.get(slug=slug, status='live')
    except PublicCampusListing.DoesNotExist:
        raise NotFound("Campus not found.")

    ip_address = _get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    submit_public_enquiry(
        listing=listing,
        data=request.data,
        ip_address=ip_address,
        user_agent=user_agent
    )

    return Response({
        'success': True,
        'message': 'Your enquiry has been securely forwarded to the campus administration.'
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_schools_sitemap_view(request):
    """
    Sitemap endpoint for search engine indexing.
    Lists live, indexable campus URLs with lastmod dates.
    """
    listings = PublicCampusListing.objects.filter(status='live', noindex=False).values('slug', 'updated_at')
    urls = [
        {
            'loc': f"/schools/{l['slug']}",
            'lastmod': l['updated_at'].strftime('%Y-%m-%d'),
        }
        for l in listings
    ]
    return Response({'urls': urls}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_methodology_view(request):
    """
    Returns platform honesty statement, AQI formulas, and eligibility thresholds.
    """
    config = get_or_create_platform_config()
    return Response({
        'title': 'Optimus Orien Academic Quality Index (AQI) Methodology',
        'honesty_statement': (
            "The Optimus Orien Academic Quality Index (AQI) is an objective, mathematical metric "
            "derived directly from participating schools' verified and published internal examination results. "
            "Grading scales, intake selectivity, curriculum frameworks, and socioeconomic factors vary across institutions. "
            "Rankings published on this platform represent comparative academic metrics within participating Optimus Orien campuses "
            "and do not constitute an external inspection, accreditation, or endorsement of overall educational quality."
        ),
        'eligibility_criteria': {
            'min_active_students': config.min_active_students,
            'min_published_assessments': config.min_published_assessments,
            'min_subjects_covered': config.min_subjects_covered,
            'data_freshness_months': config.data_freshness_months,
            'enquiry_retention_days': config.enquiry_retention_days,
        },
        'bands': [
            {'label': 'Outstanding', 'range': 'AQI ≥ 80.00%'},
            {'label': 'Strong', 'range': '70.00% ≤ AQI < 80.00%'},
            {'label': 'Steady', 'range': '60.00% ≤ AQI < 70.00%'},
            {'label': 'Developing', 'range': '50.00% ≤ AQI < 60.00%'},
            {'label': 'Not ranked yet (not enough published data)', 'range': 'Insufficient published evidence to rank'},
        ],
        'tie_breaking_policy': 'Competition standard (1, 2, 2, 4) where tied institutions share the same rank.',
    }, status=status.HTTP_200_OK)


# =============================================================================
# 2. SCHOOL-SIDE MANAGEMENT ENDPOINTS
# =============================================================================

def _check_school_authority(request, school_id: int) -> School:
    """Verifies that the user has authority over the campus."""
    if not request.user or not request.user.is_authenticated:
        raise PermissionDenied("Authentication required.")
    try:
        school = School.objects.get(id=school_id)
    except School.DoesNotExist:
        raise NotFound("Campus not found.")

    if request.user.role in ('platform_admin', 'owner') or request.user.is_superuser:
        return school
    if request.user.school_id == school.id and request.user.role in ('school_admin', 'principal'):
        return school
    if request.user.role == 'organisation_admin' and getattr(request.user, 'organisation_id', None) == school.organisation_id:
        return school

    raise PermissionDenied("You do not have permission to manage this campus.")


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def school_public_profile_view(request, school_id):
    """
    School portal profile editor: GET current draft & status, PUT update draft.
    """
    school = _check_school_authority(request, school_id)
    draft, _ = SchoolPublicProfileDraft.objects.get_or_create(school=school)
    listing = PublicCampusListing.objects.filter(school=school).first()

    if request.method == 'GET':
        return Response({
            'school_id': school.id,
            'school_name': school.name,
            'status': listing.status if listing else 'draft',
            'rejection_reason': listing.rejection_reason if listing else '',
            'approved_at': listing.approved_at.isoformat() if (listing and listing.approved_at) else None,
            'draft': {
                'display_name': draft.display_name or school.name,
                'tagline': draft.tagline,
                'about': draft.about,
                'logo_url': draft.logo_url,
                'country': draft.country,
                'province': draft.province,
                'city': draft.city,
                'address': draft.address,
                'latitude': float(draft.latitude) if draft.latitude else None,
                'longitude': float(draft.longitude) if draft.longitude else None,
                'boards': draft.boards,
                'levels': draft.levels,
                'gender_type': draft.gender_type,
                'medium': draft.medium,
                'established_year': draft.established_year,
                'facilities': draft.facilities,
                'website': draft.website,
                'social_links': draft.social_links,
                'admission_status': draft.admission_status,
                'contact_mode': draft.contact_mode,
                'official_phone': draft.official_phone,
                'official_email': draft.official_email,
                'rank_display_mode': draft.rank_display_mode,
                'is_opted_in': draft.is_opted_in,
            },
            'show_principal_name': listing.show_principal_name if listing else False,
            'principal_name': listing.principal_name if listing else '',
        }, status=status.HTTP_200_OK)

    # PUT: Save draft
    data = request.data
    draft.display_name = str(data.get('display_name', draft.display_name))[:180]
    draft.tagline = str(data.get('tagline', draft.tagline))[:250]
    draft.about = str(data.get('about', draft.about))[:2500]
    draft.logo_url = str(data.get('logo_url', draft.logo_url))[:500]
    draft.country = str(data.get('country', draft.country))[:80]
    draft.province = str(data.get('province', draft.province))[:80]
    draft.city = str(data.get('city', draft.city))[:80]
    draft.address = str(data.get('address', draft.address))[:255]

    if 'latitude' in data:
        draft.latitude = Decimal(str(data['latitude'])) if data['latitude'] is not None else None
    if 'longitude' in data:
        draft.longitude = Decimal(str(data['longitude'])) if data['longitude'] is not None else None

    if 'boards' in data and isinstance(data['boards'], list):
        draft.boards = data['boards']
    if 'levels' in data and isinstance(data['levels'], list):
        draft.levels = data['levels']
    if 'facilities' in data and isinstance(data['facilities'], list):
        draft.facilities = data['facilities']
    if 'social_links' in data and isinstance(data['social_links'], dict):
        draft.social_links = data['social_links']

    draft.gender_type = data.get('gender_type', draft.gender_type)
    draft.medium = data.get('medium', draft.medium)
    draft.admission_status = data.get('admission_status', draft.admission_status)
    draft.contact_mode = data.get('contact_mode', draft.contact_mode)
    draft.official_phone = str(data.get('official_phone', draft.official_phone))[:40]
    draft.official_email = str(data.get('official_email', draft.official_email))[:100]
    draft.rank_display_mode = data.get('rank_display_mode', draft.rank_display_mode)
    draft.save()

    return Response({'success': True, 'message': 'Profile draft updated successfully.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def school_public_profile_submit_view(request, school_id):
    """
    Submits draft profile for platform administrator moderation.
    Records legal opt-in consent and transitions state to pending_approval.
    """
    school = _check_school_authority(request, school_id)
    ip_address = _get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    listing = submit_listing_for_approval(
        school=school,
        user=request.user,
        ip_address=ip_address,
        user_agent=user_agent
    )

    return Response({
        'success': True,
        'status': listing.status,
        'message': 'Listing submitted for platform moderation review.'
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def school_public_profile_unpublish_view(request, school_id):
    """
    Instantly unpublishes the campus listing.
    """
    school = _check_school_authority(request, school_id)
    reason = request.data.get('reason', 'Unpublished by campus authority.')

    listing = unpublish_listing(
        school_or_listing=school,
        actor=request.user,
        reason=reason
    )

    return Response({
        'success': True,
        'status': listing.status,
        'message': 'Campus listing unpublished immediately.'
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def school_public_enquiries_view(request, school_id):
    """
    Campus parent enquiry inbox.
    STRICT TENANT ISOLATION: Campus can only access its own parent enquiries.
    """
    school = _check_school_authority(request, school_id)
    listing = PublicCampusListing.objects.filter(school=school).first()
    if not listing:
        return Response({'enquiries': []}, status=status.HTTP_200_OK)

    enquiries = listing.enquiries.all()
    results = [
        {
            'id': e.id,
            'parent_name': e.parent_name,
            'phone': e.phone,
            'email': e.email,
            'child_grade': e.child_grade,
            'message': e.message,
            'status': e.status,
            'is_handled': e.is_handled,
            'created_at': e.created_at.isoformat(),
        }
        for e in enquiries
    ]

    return Response({'enquiries': results}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def school_public_enquiry_handle_view(request, school_id, enquiry_id):
    """
    Marks an enquiry as handled/contacted.
    """
    school = _check_school_authority(request, school_id)
    try:
        enquiry = PublicEnquiry.objects.get(id=enquiry_id, listing__school=school)
    except PublicEnquiry.DoesNotExist:
        raise NotFound("Enquiry not found.")

    enquiry.is_handled = True
    enquiry.status = 'contacted'
    enquiry.save(update_fields=['is_handled', 'status'])

    return Response({'success': True, 'message': 'Enquiry marked as contacted.'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def principal_public_consent_view(request):
    """
    Principal account consent toggle for principal name and direct contact disclosure.
    Requires that the authenticated user is the principal of a campus.
    """
    user = request.user
    if user.role != 'principal' and not user.is_superuser:
        raise PermissionDenied("Only an authenticated principal can grant personal directory consent.")

    school = getattr(user, 'school', None)
    if not school:
        raise ValidationError({'detail': 'User has no campus association.'})

    show_name = _parse_bool(request.data.get('show_principal_name', False))
    show_contact = _parse_bool(request.data.get('show_principal_direct_contact', False))
    ip_address = _get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    listing = update_principal_consent(
        school=school,
        principal_user=user,
        show_name=show_name,
        show_direct_contact=show_contact,
        ip_address=ip_address,
        user_agent=user_agent
    )

    return Response({
        'success': True,
        'show_principal_name': listing.show_principal_name,
        'message': 'Principal directory privacy preferences saved.'
    }, status=status.HTTP_200_OK)


# =============================================================================
# 3. PLATFORM ADMIN MODERATION ENDPOINTS
# =============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_public_directory_listings_view(request):
    """
    Platform admin moderation queue.
    Filter by ?status=pending_approval | live | rejected | unpublished
    """
    if not _check_platform_admin(request):
        raise PermissionDenied("Platform admin access required.")

    status_filter = request.GET.get('status')
    qs = PublicCampusListing.objects.select_related('school').all()
    if status_filter:
        qs = qs.filter(status=status_filter)

    results = []
    for l in qs:
        snap = l.snapshots.order_by('-generated_at').first()
        results.append({
            'id': l.id,
            'school_id': l.school_id,
            'slug': l.slug,
            'display_name': l.display_name,
            'city': l.city,
            'country': l.country,
            'status': l.status,
            'score': float(snap.aqi_score) if (snap and snap.aqi_score is not None) else None,
            'band': snap.band if snap else 'Not ranked yet',
            'is_eligible': snap.is_eligible if snap else False,
            'approved_at': l.approved_at.isoformat() if l.approved_at else None,
            'rejection_reason': l.rejection_reason,
            'created_at': l.created_at.isoformat(),
        })

    return Response({'listings': results}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_public_directory_approve_view(request, listing_id):
    """Platform admin approves a pending listing."""
    if not _check_platform_admin(request):
        raise PermissionDenied("Platform admin access required.")

    reason = request.data.get('reason', 'Approved by platform administrator.')
    listing = moderate_listing(listing_id=listing_id, action='approve', actor=request.user, reason=reason)

    return Response({
        'success': True,
        'status': listing.status,
        'message': f"Listing '{listing.display_name}' is now live on the public directory."
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_public_directory_reject_view(request, listing_id):
    """Platform admin rejects a listing with required reason."""
    if not _check_platform_admin(request):
        raise PermissionDenied("Platform admin access required.")

    reason = request.data.get('reason', '').strip()
    listing = moderate_listing(listing_id=listing_id, action='reject', actor=request.user, reason=reason)

    return Response({
        'success': True,
        'status': listing.status,
        'message': f"Listing '{listing.display_name}' has been rejected."
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_public_directory_unpublish_view(request, listing_id):
    """Platform admin unpublishes a live listing."""
    if not _check_platform_admin(request):
        raise PermissionDenied("Platform admin access required.")

    reason = request.data.get('reason', 'Administratively unpublished.').strip()
    try:
        listing = PublicCampusListing.objects.get(id=listing_id)
    except PublicCampusListing.DoesNotExist:
        raise NotFound("Listing not found.")

    listing = unpublish_listing(school_or_listing=listing, actor=request.user, reason=reason)

    return Response({
        'success': True,
        'status': listing.status,
        'message': f"Listing '{listing.display_name}' has been unpublished."
    }, status=status.HTTP_200_OK)


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def admin_public_directory_config_view(request):
    """Platform admin views or updates eligibility thresholds & retention schedule."""
    if not _check_platform_admin(request):
        raise PermissionDenied("Platform admin access required.")

    config = get_or_create_platform_config()

    if request.method == 'GET':
        return Response({
            'min_active_students': config.min_active_students,
            'min_published_assessments': config.min_published_assessments,
            'min_subjects_covered': config.min_subjects_covered,
            'data_freshness_months': config.data_freshness_months,
            'enquiry_retention_days': config.enquiry_retention_days,
            'updated_at': config.updated_at.isoformat(),
        }, status=status.HTTP_200_OK)

    # PUT: Update config
    data = request.data
    if 'min_active_students' in data:
        config.min_active_students = int(data['min_active_students'])
    if 'min_published_assessments' in data:
        config.min_published_assessments = int(data['min_published_assessments'])
    if 'min_subjects_covered' in data:
        config.min_subjects_covered = int(data['min_subjects_covered'])
    if 'data_freshness_months' in data:
        config.data_freshness_months = int(data['data_freshness_months'])
    if 'enquiry_retention_days' in data:
        config.enquiry_retention_days = int(data['enquiry_retention_days'])
    config.save()

    return Response({
        'success': True,
        'message': 'Public directory platform configuration updated.',
        'config': {
            'min_active_students': config.min_active_students,
            'min_published_assessments': config.min_published_assessments,
            'min_subjects_covered': config.min_subjects_covered,
            'data_freshness_months': config.data_freshness_months,
            'enquiry_retention_days': config.enquiry_retention_days,
        }
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_public_directory_trigger_snapshot_view(request):
    """Platform admin triggers immediate snapshot & ranking refresh."""
    if not _check_platform_admin(request):
        raise PermissionDenied("Platform admin access required.")

    period = request.data.get('period', '2025-2026 Term 2')
    summary = refresh_public_snapshots(period_name=period)

    return Response({
        'success': True,
        'summary': summary,
        'message': f"Snapshot refresh completed for period '{period}'."
    }, status=status.HTTP_200_OK)
