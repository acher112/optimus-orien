"""
Network Service: Business Logic for Educational Professional Networking,
Child Safety Enforcement, Privacy Controls, and Connections.
"""
import re
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.core.exceptions import ValidationError, PermissionDenied
from django.db import transaction
from django.db.models import Q
from core.models import (
    User, Student, School, SchoolNetworkSetting, NetworkProfile,
    NetworkConsent, BoardSnapshot, BadgeAward, ConnectionRequest,
    Connection, Block, Mute, Report, NetworkAuditEvent, Conversation,
    UserKeyBundle, EncryptedMessage
)


# =============================================================================
# CHILD SAFETY & ADULT IDENTITY CHECKS
# =============================================================================

ADULT_NETWORK_ROLES = {'platform_admin', 'organisation_admin', 'school_admin', 'principal', 'teacher'}

def is_adult_professional(user: User) -> bool:
    """
    Returns True only if user is an authenticated adult professional staff member.
    Students, minors, and unverified users return False.
    """
    if not user or not user.is_authenticated:
        return False
    if user.role not in ADULT_NETWORK_ROLES:
        return False
    # Extra safety: ensure user is not linked to a student record
    if hasattr(user, 'student_record') and user.student_record is not None:
        return False
    return True


def assert_adult_professional(user: User):
    """
    Strict server-side assertion: raises PermissionDenied if the user is a student or minor.
    Child safety non-negotiable rule.
    """
    if not is_adult_professional(user):
        raise PermissionDenied("Child Safety Restriction: Minors and students are barred from network connections and messaging.")


def sanitize_plain_text(text: str, max_length: int = 1000) -> str:
    """
    Strips dangerous HTML/script tags and contents, and normalizes whitespace.
    """
    if not text:
        return ''
    cleaned = re.sub(r'<script.*?>.*?</script>', '', str(text), flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<[^>]*>', '', cleaned)
    cleaned = cleaned.replace('\x00', '')
    return cleaned.strip()[:max_length]


# =============================================================================
# PROFILE & SETTINGS SERVICE
# =============================================================================

def get_or_create_network_profile(user: User) -> NetworkProfile:
    """
    Retrieves or initializes a NetworkProfile for an adult user.
    """
    assert_adult_professional(user)
    profile, _ = NetworkProfile.objects.get_or_create(
        user=user,
        defaults={
            'headline': f"{user.role.replace('_', ' ').capitalize()} at {user.school.name if user.school else 'Optimus Orien'}",
            'city_display': user.school.city if user.school and user.school.city else '',
            'country_display': getattr(user.school, 'country', '') if user.school else '',
        }
    )
    return profile


def update_network_profile(user: User, data: dict) -> NetworkProfile:
    """
    Updates profile fields and privacy preferences.
    """
    profile = get_or_create_network_profile(user)

    if 'headline' in data:
        profile.headline = sanitize_plain_text(data['headline'], 140)
    if 'bio' in data:
        profile.bio = sanitize_plain_text(data['bio'], 1000)
    if 'experience_years' in data:
        try:
            profile.experience_years = max(0, min(60, int(data['experience_years'])))
        except (ValueError, TypeError):
            pass
    if 'qualifications' in data and isinstance(data['qualifications'], list):
        profile.qualifications = [sanitize_plain_text(str(q), 100) for q in data['qualifications']][:20]
    if 'subjects' in data and isinstance(data['subjects'], list):
        profile.subjects = [sanitize_plain_text(str(s), 60) for s in data['subjects']][:20]
    if 'interests' in data and isinstance(data['interests'], list):
        profile.interests = [sanitize_plain_text(str(i), 60) for i in data['interests']][:20]
    if 'rank_display_mode' in data and data['rank_display_mode'] in ('exact', 'tier_only', 'none'):
        profile.rank_display_mode = data['rank_display_mode']
    if 'allow_requests_from' in data and data['allow_requests_from'] in ('anyone_verified', 'my_city_country', 'nobody'):
        profile.allow_requests_from = data['allow_requests_from']
    if 'show_school_name' in data:
        profile.show_school_name = bool(data['show_school_name'])
    if 'show_city' in data:
        profile.show_city = bool(data['show_city'])
    if 'show_online_status' in data:
        profile.show_online_status = bool(data['show_online_status'])
    if 'read_receipts_enabled' in data:
        profile.read_receipts_enabled = bool(data['read_receipts_enabled'])

    profile.save()

    NetworkAuditEvent.objects.create(
        event_type='profile_updated',
        actor=user,
        target_type='NetworkProfile',
        target_id=profile.id,
        metadata={'headline': profile.headline, 'rank_display_mode': profile.rank_display_mode}
    )
    return profile


def serialize_public_network_profile(target_user: User, viewer: User = None) -> dict:
    """
    Serializes a profile for viewing by another verified adult, respecting target user's privacy settings.
    """
    assert_adult_professional(target_user)
    profile = get_or_create_network_profile(target_user)

    # Check block relationship
    if viewer:
        if Block.objects.filter(Q(blocker=viewer, blocked=target_user) | Q(blocker=target_user, blocked=viewer)).exists():
            raise PermissionDenied("User is not accessible.")

    # Mutual connection state
    connection_status = 'none'
    if viewer and viewer.id == target_user.id:
        connection_status = 'self'
    elif viewer:
        min_id, max_id = min(viewer.id, target_user.id), max(viewer.id, target_user.id)
        if Connection.objects.filter(user_a_id=min_id, user_b_id=max_id, status='active').exists():
            connection_status = 'connected'
        elif ConnectionRequest.objects.filter(from_user=viewer, to_user=target_user, status='pending').exists():
            connection_status = 'pending_sent'
        elif ConnectionRequest.objects.filter(from_user=target_user, to_user=viewer, status='pending').exists():
            connection_status = 'pending_received'

    badges = BadgeAward.objects.filter(user=target_user, revoked=False).order_by('-awarded_at')[:10]
    badge_list = [{
        'id': b.id,
        'badge_type': b.badge_type,
        'title': b.title,
        'period_identifier': b.period_identifier,
        'awarded_at': b.awarded_at.isoformat()
    } for b in badges]

    # Privacy filtering
    school_name = target_user.school.name if (target_user.school and profile.show_school_name) else ''
    city = profile.city_display if profile.show_city else ''

    return {
        'id': target_user.id,
        'username': target_user.username,
        'first_name': target_user.first_name,
        'last_name': target_user.last_name,
        'full_name': f"{target_user.first_name} {target_user.last_name}".strip() or target_user.username,
        'role': target_user.role,
        'headline': profile.headline,
        'bio': profile.bio,
        'experience_years': profile.experience_years,
        'qualifications': profile.qualifications,
        'subjects': profile.subjects,
        'interests': profile.interests,
        'school_name': school_name,
        'city': city,
        'country': profile.country_display,
        'rank_display_mode': profile.rank_display_mode,
        'is_platform_verified': profile.is_platform_verified,
        'connection_status': connection_status,
        'badges': badge_list,
        'allow_requests': profile.allow_requests_from != 'nobody' and not profile.is_suspended
    }


# =============================================================================
# CONSENT MANAGEMENT
# =============================================================================

def grant_network_consent(
    user: User,
    consent_type: str,
    version: str = "2026.1",
    ip_address: str = None,
    user_agent: str = '',
    guardian_user: User = None,
    written_consent_ref: str = ''
) -> NetworkConsent:
    """
    Records explicit opt-in consent for a user.
    """
    valid_types = {'principal_board', 'teacher_board', 'student_recognition', 'e2ee_chat'}
    if consent_type not in valid_types:
        raise ValidationError(f"Invalid consent type '{consent_type}'.")

    # If student recognition, guardian or written consent must be supplied
    if consent_type == 'student_recognition':
        if not guardian_user and not written_consent_ref:
            raise ValidationError("Student recognition requires verified guardian consent or written reference.")

    with transaction.atomic():
        # Deactivate any previous consent records for this type
        NetworkConsent.objects.filter(
            user=user, consent_type=consent_type, granted=True, withdrawn_at__isnull=True
        ).update(withdrawn_at=timezone.now(), granted=False)

        consent = NetworkConsent.objects.create(
            user=user,
            consent_type=consent_type,
            version=version,
            granted=True,
            ip_address=ip_address,
            user_agent=user_agent[:500],
            guardian_user=guardian_user,
            written_consent_reference=written_consent_ref
        )

        NetworkAuditEvent.objects.create(
            event_type='consent_granted',
            actor=guardian_user if guardian_user else user,
            target_type='User',
            target_id=user.id,
            metadata={'consent_type': consent_type, 'version': version},
            ip_address=ip_address
        )
    return consent


def withdraw_network_consent(user: User, consent_type: str, actor: User = None) -> bool:
    """
    Instantly withdraws consent. Immediately purges snapshots and cached listings.
    """
    actor_user = actor or user
    now = timezone.now()
    with transaction.atomic():
        updated = NetworkConsent.objects.filter(
            user=user, consent_type=consent_type, granted=True, withdrawn_at__isnull=True
        ).update(withdrawn_at=now, granted=False)

        # Immediate removal from all active board snapshots
        if consent_type in ('principal_board', 'teacher_board'):
            BoardSnapshot.objects.filter(entity_id=user.id).delete()
        elif consent_type == 'student_recognition':
            if hasattr(user, 'student_record') and user.student_record:
                BoardSnapshot.objects.filter(entity_id=user.student_record.id, board_type='students').delete()

        NetworkAuditEvent.objects.create(
            event_type='consent_withdrawn',
            actor=actor_user,
            target_type='User',
            target_id=user.id,
            metadata={'consent_type': consent_type}
        )
    return updated > 0


def has_active_consent(user: User, consent_type: str) -> bool:
    """
    Checks if a user has active, unwithdrawn consent for a feature.
    """
    if not user:
        return False
    return NetworkConsent.objects.filter(
        user=user, consent_type=consent_type, granted=True, withdrawn_at__isnull=True
    ).exists()


# =============================================================================
# SCHOOL NETWORK SETTINGS
# =============================================================================

def get_or_create_school_network_setting(school: School) -> SchoolNetworkSetting:
    setting, _ = SchoolNetworkSetting.objects.get_or_create(school=school)
    return setting


def update_school_network_setting(
    school: School,
    actor: User,
    network_enabled: bool = None,
    staff_board_enabled: bool = None,
    student_board_enabled: bool = None
) -> SchoolNetworkSetting:
    """
    School Owner / Org Admin updates institution network permissions.
    """
    if actor.role not in ('platform_admin', 'organisation_admin', 'school_admin', 'principal'):
        raise PermissionDenied("Only institutional leadership can update school network settings.")

    setting = get_or_create_school_network_setting(school)
    if network_enabled is not None:
        setting.network_enabled = bool(network_enabled)
    if staff_board_enabled is not None:
        setting.staff_board_enabled = bool(staff_board_enabled)
    if student_board_enabled is not None:
        setting.student_board_enabled = bool(student_board_enabled)

    setting.updated_by = actor
    setting.save()

    NetworkAuditEvent.objects.create(
        event_type='school_network_setting_updated',
        actor=actor,
        target_type='School',
        target_id=school.id,
        metadata={
            'network_enabled': setting.network_enabled,
            'staff_board_enabled': setting.staff_board_enabled,
            'student_board_enabled': setting.student_board_enabled,
        }
    )
    return setting


# =============================================================================
# CONNECTION REQUESTS & CONNECTIONS
# =============================================================================

def send_connection_request(from_user: User, to_user: User, note: str = "") -> ConnectionRequest:
    """
    Initiates a connection request from one adult professional to another.
    """
    assert_adult_professional(from_user)
    assert_adult_professional(to_user)

    if from_user.id == to_user.id:
        raise ValidationError("You cannot send a connection request to yourself.")

    # Check institutional network enablement
    if from_user.school:
        from_setting = get_or_create_school_network_setting(from_user.school)
        if not from_setting.network_enabled:
            raise PermissionDenied("Network participation is disabled for your institution.")
    if to_user.school:
        to_setting = get_or_create_school_network_setting(to_user.school)
        if not to_setting.network_enabled:
            raise PermissionDenied("Network participation is disabled for the recipient institution.")

    # Check block status
    if Block.objects.filter(Q(blocker=from_user, blocked=to_user) | Q(blocker=to_user, blocked=from_user)).exists():
        raise PermissionDenied("Unable to connect with this user.")

    # Check if already connected
    min_id, max_id = min(from_user.id, to_user.id), max(from_user.id, to_user.id)
    if Connection.objects.filter(user_a_id=min_id, user_b_id=max_id, status='active').exists():
        raise ValidationError("You are already connected with this user.")

    # Check recipient privacy setting
    to_profile = get_or_create_network_profile(to_user)
    if to_profile.allow_requests_from == 'nobody':
        raise PermissionDenied("This user is not accepting connection requests.")
    elif to_profile.allow_requests_from == 'my_city_country':
        from_profile = get_or_create_network_profile(from_user)
        same_city = from_profile.city_display and (from_profile.city_display.lower() == to_profile.city_display.lower())
        same_country = from_profile.country_display and (from_profile.country_display.lower() == to_profile.country_display.lower())
        if not (same_city or same_country):
            raise PermissionDenied("This user only accepts requests from colleagues in their city or country.")

    # Check 7-day cooldown after decline
    cooldown_cutoff = timezone.now() - timedelta(days=7)
    recent_decline = ConnectionRequest.objects.filter(
        from_user=from_user, to_user=to_user, status='declined', responded_at__gte=cooldown_cutoff
    ).first()
    if recent_decline:
        raise ValidationError("A recent request was declined. Please wait 7 days before connecting again.")

    # Check daily limit: max 20 requests in last 24h
    day_ago = timezone.now() - timedelta(hours=24)
    sent_count = ConnectionRequest.objects.filter(from_user=from_user, created_at__gte=day_ago).count()
    if sent_count >= 20:
        raise ValidationError("Daily connection request limit reached (maximum 20 requests per day).")

    # Check if a pending request already exists
    existing_pending = ConnectionRequest.objects.filter(
        from_user=from_user, to_user=to_user, status='pending'
    ).first()
    if existing_pending:
        raise ValidationError("A pending connection request already exists.")

    # Reciprocal check: if to_user already sent a pending request to from_user, auto-accept it!
    reciprocal = ConnectionRequest.objects.filter(
        from_user=to_user, to_user=from_user, status='pending'
    ).first()
    if reciprocal:
        return accept_connection_request(reciprocal.id, from_user)

    # Sanitize note
    clean_note = sanitize_plain_text(note, 200)

    # Anti-spam heuristic: reject excessive repetition or links
    if re.search(r'https?://|www\.', clean_note, re.IGNORECASE):
        clean_note = re.sub(r'https?://\S+|www\.\S+', '[link removed]', clean_note)

    req = ConnectionRequest.objects.create(
        from_user=from_user,
        to_user=to_user,
        note=clean_note,
        status='pending'
    )

    NetworkAuditEvent.objects.create(
        event_type='connection_request_sent',
        actor=from_user,
        target_type='User',
        target_id=to_user.id,
        metadata={'request_id': req.id}
    )
    return req


def accept_connection_request(request_id: int, responder: User) -> ConnectionRequest:
    """
    Accepts a pending connection request and establishes a mutual Connection.
    """
    assert_adult_professional(responder)
    with transaction.atomic():
        req = ConnectionRequest.objects.select_for_update().filter(
            id=request_id, to_user=responder, status='pending'
        ).first()
        if not req:
            raise ValidationError("Connection request not found or no longer pending.")

        req.status = 'accepted'
        req.responded_at = timezone.now()
        req.save()

        # Establish deterministic Connection (user_a_id < user_b_id)
        user_a_id, user_b_id = min(req.from_user_id, req.to_user_id), max(req.from_user_id, req.to_user_id)
        conn, created = Connection.objects.get_or_create(
            user_a_id=user_a_id,
            user_b_id=user_b_id,
            defaults={'status': 'active'}
        )
        if not created and conn.status != 'active':
            conn.status = 'active'
            conn.removed_at = None
            conn.save()

        NetworkAuditEvent.objects.create(
            event_type='connection_accepted',
            actor=responder,
            target_type='User',
            target_id=req.from_user_id,
            metadata={'connection_id': conn.id}
        )
    return req


def decline_connection_request(request_id: int, responder: User) -> ConnectionRequest:
    """
    Declines a pending connection request.
    """
    assert_adult_professional(responder)
    req = ConnectionRequest.objects.filter(
        id=request_id, to_user=responder, status='pending'
    ).first()
    if not req:
        raise ValidationError("Connection request not found or no longer pending.")

    req.status = 'declined'
    req.responded_at = timezone.now()
    req.save()

    NetworkAuditEvent.objects.create(
        event_type='connection_declined',
        actor=responder,
        target_type='User',
        target_id=req.from_user_id,
        metadata={'request_id': req.id}
    )
    return req


def withdraw_connection_request(request_id: int, requester: User) -> ConnectionRequest:
    """
    Withdraws a pending connection request previously sent by the requester.
    """
    assert_adult_professional(requester)
    req = ConnectionRequest.objects.filter(
        id=request_id, from_user=requester, status='pending'
    ).first()
    if not req:
        raise ValidationError("Connection request not found or no longer pending.")

    req.status = 'withdrawn'
    req.responded_at = timezone.now()
    req.save()

    NetworkAuditEvent.objects.create(
        event_type='connection_withdrawn',
        actor=requester,
        target_type='User',
        target_id=req.to_user_id,
        metadata={'request_id': req.id}
    )
    return req


def remove_connection(user_1: User, user_2: User) -> bool:
    """
    Terminates an active connection between two adult professionals.
    """
    assert_adult_professional(user_1)
    min_id, max_id = min(user_1.id, user_2.id), max(user_1.id, user_2.id)
    with transaction.atomic():
        conn = Connection.objects.filter(user_a_id=min_id, user_b_id=max_id, status='active').first()
        if not conn:
            return False
        conn.status = 'removed'
        conn.removed_at = timezone.now()
        conn.save()

        # Close any open conversation
        Conversation.objects.filter(
            participant_a_id=min_id, participant_b_id=max_id, status='active'
        ).update(status='closed')

        NetworkAuditEvent.objects.create(
            event_type='connection_removed',
            actor=user_1,
            target_type='User',
            target_id=user_2.id,
            metadata={'connection_id': conn.id}
        )
    return True


def get_suggested_connections(user: User, limit: int = 10) -> list:
    """
    Provides heuristic connection suggestions based on matching subjects, location, and mutual contacts.
    Zero machine learning, purely deterministic rules.
    """
    assert_adult_professional(user)
    profile = get_or_create_network_profile(user)

    # Excluded users: self, existing connections, blocked users, pending requests
    blocked_ids = set(Block.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list('blocked_id', flat=True))
    blocked_ids.update(Block.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list('blocker_id', flat=True))

    connected_ids = set()
    for conn in Connection.objects.filter(Q(user_a=user) | Q(user_b=user), status='active'):
        connected_ids.add(conn.user_b_id if conn.user_a_id == user.id else conn.user_a_id)

    pending_ids = set(ConnectionRequest.objects.filter(
        Q(from_user=user) | Q(to_user=user), status='pending'
    ).values_list('to_user_id', flat=True))
    pending_ids.update(ConnectionRequest.objects.filter(
        Q(from_user=user) | Q(to_user=user), status='pending'
    ).values_list('from_user_id', flat=True))

    excluded = blocked_ids | connected_ids | pending_ids | {user.id}

    # Query active adult professionals who permit requests
    candidates = User.objects.filter(
        role__in=ADULT_NETWORK_ROLES,
        is_active=True
    ).exclude(id__in=excluded).select_related('school', 'network_profile')

    suggestions = []
    user_subjects = set(profile.subjects or [])
    user_city = (profile.city_display or '').lower()

    for candidate in candidates:
        if candidate.school:
            setting = get_or_create_school_network_setting(candidate.school)
            if not setting.network_enabled:
                continue

        cand_profile = getattr(candidate, 'network_profile', None)
        if cand_profile:
            if cand_profile.allow_requests_from == 'nobody' or cand_profile.is_suspended:
                continue
            cand_subjects = set(cand_profile.subjects or [])
            cand_city = (cand_profile.city_display or '').lower()

            # Score relevance
            common_subjects = user_subjects.intersection(cand_subjects)
            is_same_city = user_city and cand_city and (user_city == cand_city)

            reason = "Educator in Optimus Orien Network"
            if common_subjects:
                reason = f"Teaches {', '.join(list(common_subjects)[:2])}"
            elif is_same_city:
                reason = f"Based in {cand_profile.city_display}"
            elif candidate.school and user.school and candidate.school.id == user.school.id:
                reason = "Colleague at your campus"

            serialized = serialize_public_network_profile(candidate, viewer=user)
            serialized['suggestion_reason'] = reason
            suggestions.append(serialized)
            if len(suggestions) >= limit:
                break

    return suggestions


# =============================================================================
# SAFETY TOOLS: BLOCK, MUTE, REPORT, MODERATION
# =============================================================================

def block_user(blocker: User, blocked: User, reason: str = "") -> Block:
    """
    Blocks a user. Immediately severs connections, closes conversations, and audits action.
    """
    assert_adult_professional(blocker)
    if blocker.id == blocked.id:
        raise ValidationError("You cannot block yourself.")

    with transaction.atomic():
        block, _ = Block.objects.get_or_create(
            blocker=blocker,
            blocked=blocked,
            defaults={'reason': sanitize_plain_text(reason, 100)}
        )

        # Sever connection if any
        remove_connection(blocker, blocked)

        # Cancel pending requests
        ConnectionRequest.objects.filter(
            Q(from_user=blocker, to_user=blocked) | Q(from_user=blocked, to_user=blocker),
            status='pending'
        ).update(status='declined', responded_at=timezone.now())

        # Close any conversation
        min_id, max_id = min(blocker.id, blocked.id), max(blocker.id, blocked.id)
        Conversation.objects.filter(
            participant_a_id=min_id, participant_b_id=max_id
        ).update(status='blocked')

        NetworkAuditEvent.objects.create(
            event_type='user_blocked',
            actor=blocker,
            target_type='User',
            target_id=blocked.id,
            metadata={'reason': block.reason}
        )
    return block


def unblock_user(blocker: User, blocked: User) -> bool:
    """
    Removes block.
    """
    deleted, _ = Block.objects.filter(blocker=blocker, blocked=blocked).delete()
    if deleted:
        NetworkAuditEvent.objects.create(
            event_type='user_unblocked',
            actor=blocker,
            target_type='User',
            target_id=blocked.id
        )
    return deleted > 0


def mute_user(muter: User, muted: User) -> Mute:
    assert_adult_professional(muter)
    mute, _ = Mute.objects.get_or_create(muter=muter, muted=muted)
    return mute


def unmute_user(muter: User, muted: User) -> bool:
    deleted, _ = Mute.objects.filter(muter=muter, muted=muted).delete()
    return deleted > 0


def file_report(
    reporter: User,
    reported_user: User,
    category: str,
    details: str,
    decrypted_evidence: list = None
) -> Report:
    """
    Files a misconduct report for platform admin review.
    """
    assert_adult_professional(reporter)
    valid_categories = {'harassment', 'spam', 'inappropriate_content', 'impersonation', 'other'}
    if category not in valid_categories:
        raise ValidationError(f"Invalid report category '{category}'.")

    clean_details = sanitize_plain_text(details, 1000)
    evidence = decrypted_evidence if isinstance(decrypted_evidence, list) else []

    report = Report.objects.create(
        reporter=reporter,
        reported_user=reported_user,
        category=category,
        details=clean_details,
        decrypted_evidence=evidence[:20],
        status='pending'
    )

    NetworkAuditEvent.objects.create(
        event_type='report_filed',
        actor=reporter,
        target_type='User',
        target_id=reported_user.id,
        metadata={'report_id': report.id, 'category': category}
    )
    return report


def resolve_report(
    report_id: int,
    admin_user: User,
    action: str,
    moderator_notes: str = "",
    suspend_user: bool = False
) -> Report:
    """
    Platform admin resolves a filed misconduct report.
    """
    if admin_user.role != 'platform_admin' and not admin_user.is_superuser:
        raise PermissionDenied("Only platform administrators can resolve misconduct reports.")

    report = Report.objects.filter(id=report_id).first()
    if not report:
        raise ValidationError("Report not found.")

    report.status = action
    report.moderator_notes = sanitize_plain_text(moderator_notes, 1000)
    report.resolved_by = admin_user
    report.resolved_at = timezone.now()
    report.save()

    if suspend_user and report.reported_user:
        profile = get_or_create_network_profile(report.reported_user)
        profile.is_suspended = True
        profile.save()

        # Remove from boards
        BoardSnapshot.objects.filter(entity_id=report.reported_user.id).delete()

    NetworkAuditEvent.objects.create(
        event_type='report_resolved',
        actor=admin_user,
        target_type='Report',
        target_id=report.id,
        metadata={'action': action, 'suspended': suspend_user}
    )
    return report


# =============================================================================
# END-TO-END ENCRYPTED (E2EE) CHAT SERVICES
# =============================================================================

def save_user_key_bundle(
    user: User,
    identity_key: str,
    signed_prekey: str = '',
    prekey_signature: str = '',
    one_time_keys: list = None,
    device_id: str = 'primary'
) -> UserKeyBundle:
    """
    Registers or refreshes the public key bundle for an adult professional.
    Private keys are NEVER accepted, transmitted, or stored on the server.
    """
    assert_adult_professional(user)
    if not identity_key or not isinstance(identity_key, str):
        raise ValidationError("Valid identity_key is required.")

    clean_id_key = identity_key.strip()
    clean_spk = (signed_prekey or '').strip()
    clean_sig = (prekey_signature or '').strip()
    clean_otk = one_time_keys if isinstance(one_time_keys, list) else []

    bundle, _ = UserKeyBundle.objects.update_or_create(
        user=user,
        defaults={
            'identity_key': clean_id_key,
            'signed_prekey': clean_spk,
            'prekey_signature': clean_sig,
            'one_time_keys': clean_otk[:100],
            'device_id': device_id[:64],
        }
    )

    NetworkAuditEvent.objects.create(
        event_type='key_bundle_registered',
        actor=user,
        target_type='UserKeyBundle',
        target_id=bundle.id,
        metadata={'device_id': device_id, 'otk_count': len(clean_otk)}
    )
    return bundle


def get_public_key_bundle(requesting_user: User, target_user: User) -> dict:
    """
    Retrieves public key bundle for target_user so requesting_user can initiate or resume E2EE session.
    Consumes 1 one-time prekey from target_user's bundle if available.
    """
    assert_adult_professional(requesting_user)
    assert_adult_professional(target_user)

    if requesting_user.id == target_user.id:
        raise ValidationError("Cannot fetch key bundle for oneself.")

    # Mutual connection & unblocked check
    if not Connection.objects.filter(
        Q(user_a=requesting_user, user_b=target_user) | Q(user_a=target_user, user_b=requesting_user)
    ).exists():
        raise PermissionDenied("You can only exchange cryptographic keys with accepted connections.")

    if Block.objects.filter(
        Q(blocker=requesting_user, blocked=target_user) | Q(blocker=target_user, blocked=requesting_user)
    ).exists():
        raise PermissionDenied("Communication is blocked between these accounts.")

    bundle = UserKeyBundle.objects.filter(user=target_user).first()
    if not bundle or not bundle.identity_key:
        raise ValidationError("Recipient has not generated an encryption key bundle yet.")

    consumed_otk = None
    if bundle.one_time_keys and len(bundle.one_time_keys) > 0:
        otks = list(bundle.one_time_keys)
        consumed_otk = otks.pop(0)
        bundle.one_time_keys = otks
        bundle.save(update_fields=['one_time_keys', 'updated_at'])

    return {
        'user_id': target_user.id,
        'identity_key': bundle.identity_key,
        'signed_prekey': bundle.signed_prekey,
        'prekey_signature': bundle.prekey_signature,
        'one_time_key': consumed_otk,
        'device_id': bundle.device_id,
    }


def open_or_get_conversation(user_1: User, user_2: User) -> Conversation:
    """
    Opens or retrieves a 1-to-1 conversation between two connected adult professionals.
    Strictly verifies age, mutual connection, school settings, and block status.
    """
    assert_adult_professional(user_1)
    assert_adult_professional(user_2)

    if user_1.id == user_2.id:
        raise ValidationError("Cannot open a conversation with yourself.")

    for u in (user_1, user_2):
        if u.school_id:
            s_set = SchoolNetworkSetting.objects.filter(school_id=u.school_id).first()
            if s_set and not s_set.network_enabled:
                raise PermissionDenied(f"Network is disabled by administration at {u.school.name}.")

    has_conn = Connection.objects.filter(
        Q(user_a=user_1, user_b=user_2) | Q(user_a=user_2, user_b=user_1)
    ).exists()
    if not has_conn:
        raise PermissionDenied("You can only open conversations with accepted connections.")

    if Block.objects.filter(
        Q(blocker=user_1, blocked=user_2) | Q(blocker=user_2, blocked=user_1)
    ).exists():
        raise PermissionDenied("Cannot open conversation: an active block exists.")

    p1, p2 = (user_1, user_2) if user_1.id < user_2.id else (user_2, user_1)
    conv, created = Conversation.objects.get_or_create(
        participant_a=p1,
        participant_b=p2,
        defaults={'status': 'active'}
    )
    if not created and conv.status != 'active':
        conv.status = 'active'
        conv.save(update_fields=['status', 'last_activity_at'])

    return conv


def list_user_conversations(user: User) -> list:
    """
    Lists active conversations for the authenticated adult user.
    """
    assert_adult_professional(user)
    convs = Conversation.objects.filter(
        Q(participant_a=user) | Q(participant_b=user),
        status='active'
    ).select_related('participant_a', 'participant_b', 'participant_a__school', 'participant_b__school').order_by('-last_activity_at')

    blocked_pairs = set(Block.objects.filter(
        Q(blocker=user) | Q(blocked=user)
    ).values_list('blocked_id', 'blocker_id'))
    flat_blocked = {uid for pair in blocked_pairs for uid in pair if uid != user.id}

    results = []
    for c in convs:
        peer = c.participant_b if c.participant_a_id == user.id else c.participant_a
        if peer.id in flat_blocked:
            continue

        last_msg = c.messages.order_by('-sent_at').first()
        unread_count = c.messages.filter(sender=peer, delivered_at__isnull=True).count()

        results.append({
            'conversation_id': c.id,
            'peer_id': peer.id,
            'peer_name': peer.get_full_name() or peer.username,
            'peer_role': peer.role,
            'peer_school': peer.school.name if peer.school else '',
            'last_activity_at': c.last_activity_at.isoformat(),
            'unread_count': unread_count,
            'last_message_at': last_msg.sent_at.isoformat() if last_msg else None,
        })
    return results


def send_encrypted_message(
    sender: User,
    conversation_id: int,
    ciphertext: str,
    nonce: str,
    sender_signature: str = ""
) -> EncryptedMessage:
    """
    Dispatches an end-to-end encrypted message envelope to the conversation.
    The server NEVER handles, inspects, or logs plaintext.
    """
    assert_adult_professional(sender)

    if not ciphertext or not isinstance(ciphertext, str):
        raise ValidationError("Ciphertext is required.")
    if len(ciphertext) > 10000:
        raise ValidationError("Message payload exceeds maximum allowed size (10,000 characters).")
    if not nonce:
        raise ValidationError("Nonce / Initialization Vector is required.")

    conv = Conversation.objects.filter(id=conversation_id).select_related('participant_a', 'participant_b').first()
    if not conv:
        raise ValidationError("Conversation not found.")

    if sender.id not in (conv.participant_a_id, conv.participant_b_id):
        raise PermissionDenied("You are not a participant in this conversation.")

    recipient = conv.participant_b if conv.participant_a_id == sender.id else conv.participant_a

    if not Connection.objects.filter(
        Q(user_a=sender, user_b=recipient) | Q(user_a=recipient, user_b=sender)
    ).exists():
        raise PermissionDenied("Cannot send message: mutual connection has been severed.")

    if Block.objects.filter(
        Q(blocker=sender, blocked=recipient) | Q(blocker=recipient, blocked=sender)
    ).exists():
        raise PermissionDenied("Cannot send message: communication is blocked.")

    one_minute_ago = timezone.now() - timedelta(minutes=1)
    recent_count = EncryptedMessage.objects.filter(sender=sender, sent_at__gte=one_minute_ago).count()
    if recent_count >= 60:
        raise PermissionDenied("Rate limit exceeded: maximum 60 messages per minute.")

    msg = EncryptedMessage.objects.create(
        conversation=conv,
        sender=sender,
        ciphertext=ciphertext.strip(),
        nonce=nonce.strip()[:128],
        sender_signature=(sender_signature or '').strip(),
        size_bytes=len(ciphertext)
    )
    conv.last_activity_at = timezone.now()
    conv.save(update_fields=['last_activity_at'])
    return msg


def get_conversation_messages(user: User, conversation_id: int, since=None, limit: int = 50) -> list:
    """
    Retrieves encrypted message envelopes for the conversation.
    Marks newly fetched messages from peer as delivered.
    """
    assert_adult_professional(user)
    conv = Conversation.objects.filter(id=conversation_id).first()
    if not conv:
        raise ValidationError("Conversation not found.")

    if user.id not in (conv.participant_a_id, conv.participant_b_id):
        raise PermissionDenied("You are not a participant in this conversation.")

    qs = EncryptedMessage.objects.filter(conversation=conv)
    if since:
        qs = qs.filter(sent_at__gt=since)

    messages = list(qs.order_by('sent_at')[:limit])

    peer_msg_ids = [m.id for m in messages if m.sender_id != user.id and not m.delivered_at]
    if peer_msg_ids:
        EncryptedMessage.objects.filter(id__in=peer_msg_ids).update(delivered_at=timezone.now())

    return [{
        'id': m.id,
        'conversation_id': m.conversation_id,
        'sender_id': m.sender_id,
        'ciphertext': m.ciphertext,
        'nonce': m.nonce,
        'sender_signature': m.sender_signature,
        'sent_at': m.sent_at.isoformat(),
        'delivered_at': m.delivered_at.isoformat() if m.delivered_at else None,
    } for m in messages]

