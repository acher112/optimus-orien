"""
Network Views: REST API Endpoints for Educational Professional Networking,
Verified Academic Leaderboards, Child Safety Enforcement, and Safety Tools.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.pagination import PageNumberPagination
from django.core.exceptions import ValidationError, PermissionDenied
from django.db.models import Q
from core.models import (
    User, School, SchoolNetworkSetting, NetworkProfile,
    NetworkConsent, BoardSnapshot, BadgeAward, ConnectionRequest,
    Connection, Block, Mute, Report
)
from core.services.network_service import (
    is_adult_professional, assert_adult_professional,
    get_or_create_network_profile, update_network_profile,
    serialize_public_network_profile, grant_network_consent,
    withdraw_network_consent, has_active_consent,
    get_or_create_school_network_setting, update_school_network_setting,
    send_connection_request, accept_connection_request,
    decline_connection_request, withdraw_connection_request,
    remove_connection, get_suggested_connections,
    block_user, unblock_user, mute_user, unmute_user,
    file_report, resolve_report,
    save_user_key_bundle, get_public_key_bundle,
    open_or_get_conversation, list_user_conversations,
    send_encrypted_message, get_conversation_messages
)


class StandardResultsPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 50


# =============================================================================
# 1. PROFILE & PRIVACY VIEWS
# =============================================================================

class MyNetworkProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Student and minor accounts do not have network profiles."},
                status=status.HTTP_403_FORBIDDEN
            )
        profile = get_or_create_network_profile(request.user)
        consents = NetworkConsent.objects.filter(
            user=request.user, granted=True, withdrawn_at__isnull=True
        ).values('consent_type', 'version', 'granted_at')

        badges = BadgeAward.objects.filter(user=request.user, revoked=False).order_by('-awarded_at')
        badge_list = [{
            'id': b.id,
            'badge_type': b.badge_type,
            'title': b.title,
            'period_identifier': b.period_identifier,
            'awarded_at': b.awarded_at.isoformat()
        } for b in badges]

        return Response({
            'id': request.user.id,
            'username': request.user.username,
            'first_name': request.user.first_name,
            'last_name': request.user.last_name,
            'full_name': f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username,
            'role': request.user.role,
            'headline': profile.headline,
            'bio': profile.bio,
            'experience_years': profile.experience_years,
            'qualifications': profile.qualifications,
            'subjects': profile.subjects,
            'interests': profile.interests,
            'school_id': request.user.school_id,
            'school_name': request.user.school.name if request.user.school else '',
            'city_display': profile.city_display,
            'country_display': profile.country_display,
            'rank_display_mode': profile.rank_display_mode,
            'allow_requests_from': profile.allow_requests_from,
            'show_school_name': profile.show_school_name,
            'show_city': profile.show_city,
            'show_online_status': profile.show_online_status,
            'read_receipts_enabled': profile.read_receipts_enabled,
            'is_platform_verified': profile.is_platform_verified,
            'is_suspended': profile.is_suspended,
            'consents': list(consents),
            'badges': badge_list
        })

    def patch(self, request):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Student and minor accounts cannot update network profiles."},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            profile = update_network_profile(request.user, request.data)
            return Response({"detail": "Profile updated successfully.", "id": profile.id})
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PublicNetworkProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, user_id):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Access denied to minors and students."},
                status=status.HTTP_403_FORBIDDEN
            )
        target = User.objects.filter(id=user_id, is_active=True).first()
        if not target or not is_adult_professional(target):
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            serialized = serialize_public_network_profile(target, viewer=request.user)
            return Response(serialized)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)


# =============================================================================
# 2. CONSENT & SCHOOL SETTINGS VIEWS
# =============================================================================

class NetworkConsentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        active_consents = NetworkConsent.objects.filter(
            user=request.user, granted=True, withdrawn_at__isnull=True
        ).values('consent_type', 'version', 'granted_at')
        return Response({'consents': list(active_consents)})

    def post(self, request):
        consent_type = request.data.get('consent_type')
        version = request.data.get('version', '2026.1')
        ip_addr = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT', '')

        try:
            grant_network_consent(
                user=request.user,
                consent_type=consent_type,
                version=version,
                ip_address=ip_addr,
                user_agent=user_agent
            )
            return Response({"detail": f"Consent granted for {consent_type}."})
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class NetworkConsentWithdrawView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        consent_type = request.data.get('consent_type')
        if not consent_type:
            return Response({"detail": "consent_type is required."}, status=status.HTTP_400_BAD_REQUEST)

        withdraw_network_consent(request.user, consent_type)
        return Response({"detail": f"Consent for {consent_type} successfully withdrawn. All listings purged."})


class SchoolNetworkSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not request.user.school:
            return Response({"detail": "User is not linked to a campus."}, status=status.HTTP_400_BAD_REQUEST)
        setting = get_or_create_school_network_setting(request.user.school)
        return Response({
            'school_id': setting.school_id,
            'school_name': setting.school.name,
            'network_enabled': setting.network_enabled,
            'staff_board_enabled': setting.staff_board_enabled,
            'student_board_enabled': setting.student_board_enabled,
            'updated_at': setting.updated_at.isoformat()
        })

    def patch(self, request):
        if not request.user.school:
            return Response({"detail": "User is not linked to a campus."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            setting = update_school_network_setting(
                school=request.user.school,
                actor=request.user,
                network_enabled=request.data.get('network_enabled'),
                staff_board_enabled=request.data.get('staff_board_enabled'),
                student_board_enabled=request.data.get('student_board_enabled')
            )
            return Response({
                'detail': "School network settings updated.",
                'network_enabled': setting.network_enabled,
                'staff_board_enabled': setting.staff_board_enabled,
                'student_board_enabled': setting.student_board_enabled
            })
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)


# =============================================================================
# 3. RANKED BOARDS & METADATA
# =============================================================================

class PrincipalsBoardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Access denied to students and minors."},
                status=status.HTTP_403_FORBIDDEN
            )

        qs = BoardSnapshot.objects.filter(board_type='principals', is_eligible=True)

        period = request.query_params.get('period')
        if period:
            qs = qs.filter(period_identifier=period)
        else:
            latest = qs.order_by('-generated_at').first()
            if latest:
                qs = qs.filter(period_identifier=latest.period_identifier)

        country = request.query_params.get('country')
        if country:
            qs = qs.filter(country__iexact=country)

        city = request.query_params.get('city')
        if city:
            qs = qs.filter(city__iexact=city)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(Q(display_name__icontains=search) | Q(school_name__icontains=search))

        qs = qs.order_by('rank', 'display_name')

        # Top 3 Podium
        top3_snaps = qs[:3]
        podium = [{
            'rank': s.rank,
            'entity_id': s.entity_id,
            'name': s.display_name,
            'school_name': s.school_name,
            'city': s.city,
            'country': s.country,
            'score': float(s.score),
            'positive_band': s.positive_band,
            'tier_label': s.tier_label,
            'score_delta': float(s.score_delta) if s.score_delta else None,
            'is_most_improved': s.is_most_improved
        } for s in top3_snaps]

        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request)

        results = [{
            'id': s.id,
            'rank': s.rank,
            'entity_id': s.entity_id,
            'name': s.display_name,
            'school_name': s.school_name,
            'city': s.city,
            'country': s.country,
            'score': float(s.score),
            'positive_band': s.positive_band,
            'tier_label': s.tier_label,
            'score_delta': float(s.score_delta) if s.score_delta else None,
            'is_most_improved': s.is_most_improved,
            'student_count': s.student_count,
            'assessment_count': s.assessment_count
        } for s in page]

        return paginator.get_paginated_response({
            'podium': podium,
            'items': results
        })


class TeachersBoardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Access denied to students and minors."},
                status=status.HTTP_403_FORBIDDEN
            )

        qs = BoardSnapshot.objects.filter(board_type='teachers', is_eligible=True)

        subject = request.query_params.get('subject')
        if subject:
            qs = qs.filter(subject_name__iexact=subject)

        grade_level = request.query_params.get('grade_level')
        if grade_level:
            qs = qs.filter(grade_level__iexact=grade_level)

        period = request.query_params.get('period')
        if period:
            qs = qs.filter(period_identifier=period)

        city = request.query_params.get('city')
        if city:
            qs = qs.filter(city__iexact=city)

        if request.query_params.get('most_improved') in ('true', '1'):
            qs = qs.filter(is_most_improved=True)

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(display_name__icontains=search)

        qs = qs.order_by('rank', 'display_name')

        top3 = qs[:3]
        podium = [{
            'rank': s.rank,
            'entity_id': s.entity_id,
            'name': s.display_name,
            'school_name': s.school_name,
            'subject_name': s.subject_name,
            'grade_level': s.grade_level,
            'city': s.city,
            'score': float(s.score),
            'positive_band': s.positive_band,
            'tier_label': s.tier_label,
            'is_most_improved': s.is_most_improved
        } for s in top3]

        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request)

        results = []
        for s in page:
            # Respect teacher's chosen rank_display_mode if set
            prof = NetworkProfile.objects.filter(user_id=s.entity_id).first()
            mode = prof.rank_display_mode if prof else 'exact'

            displayed_rank = s.rank if mode == 'exact' else None
            displayed_tier = s.tier_label if mode in ('exact', 'tier_only') else 'Recognized Educator'

            results.append({
                'id': s.id,
                'rank': displayed_rank,
                'display_mode': mode,
                'entity_id': s.entity_id,
                'name': s.display_name,
                'school_name': s.school_name,
                'subject_name': s.subject_name,
                'grade_level': s.grade_level,
                'city': s.city,
                'score': float(s.score),
                'positive_band': s.positive_band,
                'tier_label': displayed_tier,
                'score_delta': float(s.score_delta) if s.score_delta else None,
                'is_most_improved': s.is_most_improved,
                'student_count': s.student_count,
                'assessment_count': s.assessment_count
            })

        return paginator.get_paginated_response({
            'podium': podium,
            'items': results
        })


class StudentAchieversBoardView(APIView):
    """
    Student Achievers Recognition Board.
    Positive recognition honors only. ZERO contact paths.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = BoardSnapshot.objects.filter(board_type='students', is_eligible=True)

        # Ensure student snapshots exist for active students if not yet populated
        if request.user.school_id and not qs.filter(campus_id=request.user.school_id).exists():
            from core.services.network_ranking import ensure_student_snapshot
            school_students = Student.objects.filter(school_id=request.user.school_id, active=True)
            for st in school_students[:25]:
                ensure_student_snapshot(st, actor=request.user)
            qs = BoardSnapshot.objects.filter(board_type='students', is_eligible=True)

        if not qs.exists():
            from core.services.network_ranking import ensure_student_snapshot
            for st in Student.objects.filter(active=True)[:25]:
                ensure_student_snapshot(st, actor=request.user)
            qs = BoardSnapshot.objects.filter(board_type='students', is_eligible=True)

        # Scoping rule: Students and Parents can only view their own school's achievers
        if request.user.role in ('student', 'parent'):
            if not request.user.school_id:
                return Response(
                    {"detail": "User is not linked to a campus."},
                    status=status.HTTP_403_FORBIDDEN
                )
            qs = qs.filter(campus_id=request.user.school_id)

        subject = request.query_params.get('subject')
        if subject:
            qs = qs.filter(subject_name__iexact=subject)

        grade_level = request.query_params.get('grade_level')
        if grade_level:
            qs = qs.filter(grade_level__iexact=grade_level)

        period = request.query_params.get('period')
        if period and period.lower() != 'latest':
            qs = qs.filter(period_identifier=period)

        qs = qs.order_by('rank', 'display_name')

        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request)

        results = [{
            'id': s.id,
            'rank': s.rank,
            'display_alias': s.display_name,
            'subject_name': s.subject_name,
            'grade_level': s.grade_level,
            'honor_title': s.tier_label,
            'positive_band': s.positive_band,
            'school_name': s.school_name if (request.user.role not in ('student', 'parent') or s.campus_id == request.user.school_id) else ''
        } for s in page]

        return paginator.get_paginated_response(results)


class BoardMetadataView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        periods = BoardSnapshot.objects.values_list('period_identifier', flat=True).distinct().order_by('-period_identifier')
        subjects = BoardSnapshot.objects.filter(board_type__in=['teachers', 'students']).values_list('subject_name', flat=True).distinct().order_by('subject_name')
        grades = BoardSnapshot.objects.filter(board_type__in=['teachers', 'students']).values_list('grade_level', flat=True).distinct().order_by('grade_level')
        cities = BoardSnapshot.objects.values_list('city', flat=True).distinct().order_by('city')

        return Response({
            'periods': [p for p in periods if p],
            'subjects': [s for s in subjects if s],
            'grade_levels': [g for g in grades if g],
            'cities': [c for c in cities if c]
        })


# =============================================================================
# 4. CONNECTION REQUESTS & CONNECTIONS
# =============================================================================

class ConnectionRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        to_user_id = request.data.get('to_user_id')
        note = request.data.get('note', '')

        if not to_user_id:
            return Response({"detail": "to_user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        to_user = User.objects.filter(id=to_user_id, is_active=True).first()
        if not to_user:
            return Response({"detail": "Recipient user not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            req = send_connection_request(from_user=request.user, to_user=to_user, note=note)
            return Response({
                'detail': "Connection request sent successfully.",
                'request_id': req.id,
                'status': req.status
            }, status=status.HTTP_201_CREATED)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ReceivedRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Access denied to students and minors."},
                status=status.HTTP_403_FORBIDDEN
            )
        reqs = ConnectionRequest.objects.filter(
            to_user=request.user, status='pending'
        ).select_related('from_user', 'from_user__school').order_by('-created_at')

        results = [{
            'id': r.id,
            'from_user_id': r.from_user_id,
            'from_user_name': f"{r.from_user.first_name} {r.from_user.last_name}".strip() or r.from_user.username,
            'school_name': r.from_user.school.name if r.from_user.school else '',
            'role': r.from_user.role,
            'note': r.note,
            'created_at': r.created_at.isoformat()
        } for r in reqs]
        return Response(results)


class SentRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Access denied to students and minors."},
                status=status.HTTP_403_FORBIDDEN
            )
        reqs = ConnectionRequest.objects.filter(
            from_user=request.user, status='pending'
        ).select_related('to_user', 'to_user__school').order_by('-created_at')

        results = [{
            'id': r.id,
            'to_user_id': r.to_user_id,
            'to_user_name': f"{r.to_user.first_name} {r.to_user.last_name}".strip() or r.to_user.username,
            'school_name': r.to_user.school.name if r.to_user.school else '',
            'role': r.to_user.role,
            'note': r.note,
            'created_at': r.created_at.isoformat()
        } for r in reqs]
        return Response(results)


class AcceptRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            req = accept_connection_request(pk, responder=request.user)
            return Response({"detail": "Connection accepted.", "request_id": req.id, "status": req.status})
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)


class DeclineRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            req = decline_connection_request(pk, responder=request.user)
            return Response({"detail": "Connection declined.", "request_id": req.id, "status": req.status})
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)


class WithdrawRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            req = withdraw_connection_request(pk, requester=request.user)
            return Response({"detail": "Connection request withdrawn.", "request_id": req.id, "status": req.status})
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)


class ConnectionsListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Access denied to students and minors."},
                status=status.HTTP_403_FORBIDDEN
            )
        connections = Connection.objects.filter(
            Q(user_a=request.user) | Q(user_b=request.user),
            status='active'
        ).select_related('user_a', 'user_b', 'user_a__school', 'user_b__school')

        results = []
        for conn in connections:
            peer = conn.user_b if conn.user_a_id == request.user.id else conn.user_a
            results.append({
                'id': conn.id,
                'peer_id': peer.id,
                'peer_name': f"{peer.first_name} {peer.last_name}".strip() or peer.username,
                'role': peer.role,
                'school_name': peer.school.name if peer.school else '',
                'city': peer.school.city if peer.school else '',
                'connected_at': conn.created_at.isoformat()
            })
        return Response(results)

    def delete(self, request, peer_id):
        peer = User.objects.filter(id=peer_id).first()
        if not peer:
            return Response({"detail": "Peer not found."}, status=status.HTTP_404_NOT_FOUND)
        removed = remove_connection(request.user, peer)
        if removed:
            return Response({"detail": "Connection removed."})
        return Response({"detail": "Connection not found or already removed."}, status=status.HTTP_400_BAD_REQUEST)


class SuggestedConnectionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_adult_professional(request.user):
            return Response(
                {"detail": "Child Safety Restriction: Access denied to students and minors."},
                status=status.HTTP_403_FORBIDDEN
            )
        suggestions = get_suggested_connections(request.user, limit=12)
        return Response(suggestions)


# =============================================================================
# 5. SAFETY TOOLS: BLOCK, MUTE, REPORT
# =============================================================================

class BlockUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        target_id = request.data.get('user_id')
        reason = request.data.get('reason', '')
        if not target_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        target = User.objects.filter(id=target_id).first()
        if not target:
            return Response({"detail": "Target user not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            block = block_user(request.user, target, reason)
            return Response({"detail": "User blocked.", "block_id": block.id})
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, user_id):
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({"detail": "Target user not found."}, status=status.HTTP_404_NOT_FOUND)
        unblocked = unblock_user(request.user, target)
        if unblocked:
            return Response({"detail": "User unblocked."})
        return Response({"detail": "Block not found."}, status=status.HTTP_400_BAD_REQUEST)


class MuteUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        target_id = request.data.get('user_id')
        if not target_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        target = User.objects.filter(id=target_id).first()
        if not target:
            return Response({"detail": "Target user not found."}, status=status.HTTP_404_NOT_FOUND)
        mute = mute_user(request.user, target)
        return Response({"detail": "User muted.", "mute_id": mute.id})

    def delete(self, request, user_id):
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({"detail": "Target user not found."}, status=status.HTTP_404_NOT_FOUND)
        unmuted = unmute_user(request.user, target)
        if unmuted:
            return Response({"detail": "User unmuted."})
        return Response({"detail": "Mute not found."}, status=status.HTTP_400_BAD_REQUEST)


class FileReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        reported_user_id = request.data.get('reported_user_id')
        category = request.data.get('category')
        details = request.data.get('details', '')
        evidence = request.data.get('decrypted_evidence', [])

        if not reported_user_id or not category:
            return Response({"detail": "reported_user_id and category are required."}, status=status.HTTP_400_BAD_REQUEST)

        target = User.objects.filter(id=reported_user_id).first()
        if not target:
            return Response({"detail": "Reported user not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            report = file_report(
                reporter=request.user,
                reported_user=target,
                category=category,
                details=details,
                decrypted_evidence=evidence
            )
            return Response({"detail": "Report filed successfully for moderator review.", "report_id": report.id}, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminModerationQueueView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'platform_admin' and not request.user.is_superuser:
            return Response({"detail": "Platform administrator access required."}, status=status.HTTP_403_FORBIDDEN)

        status_filter = request.query_params.get('status', 'pending')
        reports = Report.objects.filter(status=status_filter).select_related('reporter', 'reported_user').order_by('-created_at')

        results = [{
            'id': r.id,
            'reporter_id': r.reporter_id,
            'reporter_name': r.reporter.username,
            'reported_user_id': r.reported_user_id,
            'reported_user_name': r.reported_user.username,
            'category': r.category,
            'details': r.details,
            'status': r.status,
            'created_at': r.created_at.isoformat()
        } for r in reports]
        return Response(results)


class AdminResolveReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        action = request.data.get('action')  # 'resolved_action_taken' or 'dismissed'
        notes = request.data.get('notes', '')
        suspend = bool(request.data.get('suspend_user', False))

        if not action:
            return Response({"detail": "action is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            report = resolve_report(
                report_id=pk,
                admin_user=request.user,
                action=action,
                moderator_notes=notes,
                suspend_user=suspend
            )
            return Response({"detail": "Report resolved.", "report_id": report.id, "status": report.status})
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# =============================================================================
# 7. E2EE CHAT VIEWS
# =============================================================================

class UserKeyBundleView(APIView):
    """
    Registers or refreshes the public key bundle for the authenticated adult user.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        identity_key = request.data.get('identity_key')
        signed_prekey = request.data.get('signed_prekey', '')
        prekey_signature = request.data.get('prekey_signature', '')
        one_time_keys = request.data.get('one_time_keys', [])
        device_id = request.data.get('device_id', 'primary')

        try:
            bundle = save_user_key_bundle(
                user=request.user,
                identity_key=identity_key,
                signed_prekey=signed_prekey,
                prekey_signature=prekey_signature,
                one_time_keys=one_time_keys,
                device_id=device_id
            )
            return Response({
                "detail": "Key bundle registered successfully.",
                "bundle_id": bundle.id,
                "otk_count": len(bundle.one_time_keys)
            }, status=status.HTTP_201_CREATED)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PublicUserKeyBundleView(APIView):
    """
    Fetches the public key bundle for a connected peer to establish E2EE session.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, user_id):
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            bundle_data = get_public_key_bundle(request.user, target)
            return Response(bundle_data)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ConversationsView(APIView):
    """
    Lists or initiates 1-to-1 conversations between connected adult professionals.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            convs = list_user_conversations(request.user)
            return Response(convs)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)

    def post(self, request):
        peer_id = request.data.get('peer_id')
        if not peer_id:
            return Response({"detail": "peer_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        peer = User.objects.filter(id=peer_id).first()
        if not peer:
            return Response({"detail": "Peer user not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            conv = open_or_get_conversation(request.user, peer)
            return Response({
                "detail": "Conversation active.",
                "conversation_id": conv.id,
                "status": conv.status,
                "created_at": conv.created_at.isoformat()
            }, status=status.HTTP_200_OK)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ConversationMessagesView(APIView):
    """
    Message dispatch and short-polling endpoint for an active conversation.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        since = request.query_params.get('since')
        try:
            messages = get_conversation_messages(request.user, conversation_id, since=since)
            return Response(messages)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request, conversation_id):
        ciphertext = request.data.get('ciphertext')
        nonce = request.data.get('nonce')
        sender_signature = request.data.get('sender_signature', '')

        try:
            msg = send_encrypted_message(
                sender=request.user,
                conversation_id=conversation_id,
                ciphertext=ciphertext,
                nonce=nonce,
                sender_signature=sender_signature
            )
            return Response({
                "detail": "Message dispatched.",
                "message_id": msg.id,
                "sent_at": msg.sent_at.isoformat()
            }, status=status.HTTP_201_CREATED)
        except PermissionDenied as e:
            return Response({"detail": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

