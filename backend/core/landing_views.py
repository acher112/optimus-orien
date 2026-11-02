from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.core.exceptions import ValidationError
from core.models import (
    LandingHeroSlide,
    LandingCoreFeature,
    LandingFAQ,
    LandingPlan,
    LandingSiteSetting,
    LandingContactMessage,
)
from core.services.landing_cms import (
    get_public_landing_data,
    submit_contact_form,
    seed_default_landing_content,
)


def _check_platform_admin(request):
    """Platform-level CMS write access is strictly reserved for platform owner / superadmin."""
    if not request.user or not request.user.is_authenticated:
        return False
    # Platform admin is role 'owner' (organisation/platform landlord) or superuser
    return request.user.role == 'owner' or request.user.is_superuser


# =============================================================================
# PUBLIC ENDPOINTS
# =============================================================================

@api_view(['GET'])
@permission_classes([AllowAny])
def public_landing_view(request):
    """
    Public landing page data endpoint.
    Returns active hero slides, core features, FAQs, plans, and site settings.
    Accepts ?locale=en or ?locale=ur.
    """
    # Seed default content on first request if empty
    if not LandingCoreFeature.objects.exists():
        seed_default_landing_content()

    locale = request.GET.get('locale', 'en')
    data = get_public_landing_data(locale=locale)
    return Response(data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def public_contact_view(request):
    """
    Public contact inquiry endpoint.
    Validates name, email, phone (as text), message.
    Protects against bots via honeypot and rate limits per IP.
    """
    ip_address = request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR'))
    if ip_address and ',' in ip_address:
        ip_address = ip_address.split(',')[0].strip()

    try:
        result = submit_contact_form(request.data, ip_address=ip_address)
        return Response(result, status=status.HTTP_201_CREATED)
    except ValidationError as e:
        if hasattr(e, 'message_dict'):
            return Response({'errors': e.message_dict}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': e.messages[0] if hasattr(e, 'messages') else str(e)}, status=status.HTTP_400_BAD_REQUEST)


# =============================================================================
# PLATFORM ADMIN WRITE ENDPOINTS (UNSCOPED, OWNER-ONLY)
# =============================================================================

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def admin_landing_features_view(request):
    """Platform owner manage core features."""
    if not _check_platform_admin(request):
        return Response({'detail': 'Only platform administrators can manage landing content.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        features = list(LandingCoreFeature.objects.all().values())
        return Response({'features': features})

    # POST create
    title = request.data.get('title')
    if not title:
        return Response({'detail': 'Title is required.'}, status=status.HTTP_400_BAD_REQUEST)

    feature = LandingCoreFeature.objects.create(
        title=title,
        title_ur=request.data.get('title_ur', ''),
        description=request.data.get('description', ''),
        description_ur=request.data.get('description_ur', ''),
        icon_key=request.data.get('icon_key', 'academic'),
        sort_order=request.data.get('sort_order', 0),
        is_active=request.data.get('is_active', True),
    )
    return Response({'id': feature.id, 'title': feature.title}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def admin_landing_faqs_view(request):
    """Platform owner manage FAQs."""
    if not _check_platform_admin(request):
        return Response({'detail': 'Only platform administrators can manage landing content.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        faqs = list(LandingFAQ.objects.all().values())
        return Response({'faqs': faqs})

    question = request.data.get('question')
    answer = request.data.get('answer')
    if not question or not answer:
        return Response({'detail': 'Question and answer are required.'}, status=status.HTTP_400_BAD_REQUEST)

    faq = LandingFAQ.objects.create(
        question=question,
        question_ur=request.data.get('question_ur', ''),
        answer=answer,
        answer_ur=request.data.get('answer_ur', ''),
        sort_order=request.data.get('sort_order', 0),
        is_active=request.data.get('is_active', True),
    )
    return Response({'id': faq.id, 'question': faq.question}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def admin_landing_plans_view(request):
    """Platform owner manage plans."""
    if not _check_platform_admin(request):
        return Response({'detail': 'Only platform administrators can manage landing content.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        plans = list(LandingPlan.objects.all().values())
        return Response({'plans': plans})

    name = request.data.get('name')
    slug = request.data.get('slug')
    if not name or not slug:
        return Response({'detail': 'Name and slug are required.'}, status=status.HTTP_400_BAD_REQUEST)

    plan = LandingPlan.objects.create(
        name=name,
        name_ur=request.data.get('name_ur', ''),
        slug=slug,
        tagline=request.data.get('tagline', ''),
        tagline_ur=request.data.get('tagline_ur', ''),
        description=request.data.get('description', ''),
        description_ur=request.data.get('description_ur', ''),
        price_usd_per_student=request.data.get('price_usd_per_student', '3.60'),
        price_pkr_per_student=request.data.get('price_pkr_per_student', '499.00'),
        student_limit=request.data.get('student_limit', 0),
        campus_limit=request.data.get('campus_limit', 1),
        interval=request.data.get('interval', 'monthly'),
        trial_days=request.data.get('trial_days', 30),
        features=request.data.get('features', []),
        features_ur=request.data.get('features_ur', []),
        is_featured=request.data.get('is_featured', False),
        sort_order=request.data.get('sort_order', 0),
        is_active=request.data.get('is_active', True),
    )
    return Response({'id': plan.id, 'name': plan.name, 'slug': plan.slug}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_landing_contacts_view(request):
    """Platform owner view submitted contact messages."""
    if not _check_platform_admin(request):
        return Response({'detail': 'Only platform administrators can view contact messages.'}, status=status.HTTP_403_FORBIDDEN)

    contacts = list(LandingContactMessage.objects.all().values(
        'id', 'name', 'email', 'phone', 'company', 'subject', 'message', 'status', 'created_at'
    ))
    return Response({'contacts': contacts})
