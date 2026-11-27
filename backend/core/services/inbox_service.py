"""
Inbox and Direct Messaging Service.

Provides real-time, mutual-connection-enforced, end-to-end encrypted inbox messaging
between connected peers (students, teachers, principals, administrators).
Includes conversation initiation, unread tracking, message metrics, and notification dispatch.
"""
from django.utils import timezone
from django.db.models import Q
from django.core.exceptions import ValidationError, PermissionDenied

from core.models import User, Connection, Block, Conversation, EncryptedMessage, Notification


def _user_institution_label(u: User) -> str:
    if not u:
        return ""
    if u.school:
        return u.school.name
    if u.organisation:
        return u.organisation.name
    return "Optimus Network"


def _user_role_label(u: User) -> str:
    if not u:
        return ""
    role_map = {
        'student': 'Student',
        'teacher': 'Faculty / Teacher',
        'principal': 'Principal / Head',
        'school_admin': 'School Administrator',
        'organisation_admin': 'Organisation Leader',
        'platform_admin': 'System Official',
        'owner': 'Institution Director',
        'parent': 'Guardian'
    }
    return role_map.get(u.role, u.role.title())


def get_or_create_inbox_conversation(user_1: User, user_2: User) -> Conversation:
    """
    Opens or retrieves an active 1-to-1 conversation between two accepted connections.
    Enforces active connection and unblocked status.
    """
    if not user_1 or not user_2 or not user_1.is_authenticated or not user_2.is_authenticated:
        raise PermissionDenied("Authentication required.")

    if user_1.id == user_2.id:
        raise ValidationError("Cannot start a conversation with yourself.")

    # 1. Verify mutual active connection
    has_conn = Connection.objects.filter(
        Q(user_a=user_1, user_b=user_2) | Q(user_a=user_2, user_b=user_1),
        status='active'
    ).exists()
    if not has_conn:
        raise PermissionDenied("You can only message accepted connections. Send a connection request first.")

    # 2. Check blocks
    if Block.objects.filter(
        Q(blocker=user_1, blocked=user_2) | Q(blocker=user_2, blocked=user_1)
    ).exists():
        raise PermissionDenied("Messaging is unavailable due to an active block.")

    # 3. Canonical ordering (participant_a_id < participant_b_id per model constraint)
    p_a, p_b = (user_1, user_2) if user_1.id < user_2.id else (user_2, user_1)

    conv, _ = Conversation.objects.get_or_create(
        participant_a=p_a,
        participant_b=p_b,
        defaults={'status': 'active'}
    )

    if conv.status != 'active':
        conv.status = 'active'
        conv.save(update_fields=['status'])

    return conv


def list_inbox_conversations(user: User) -> list:
    """
    Lists all inbox conversations and active connected contacts for the user.
    Returns:
    - Peer info (name, role, school, avatar)
    - Total message count
    - Unread message count
    - Who messaged first ('you' vs 'peer')
    - Last message snippet and timestamp
    """
    if not user or not user.is_authenticated:
        return []

    # Get active conversations
    convs = Conversation.objects.filter(
        Q(participant_a=user) | Q(participant_b=user),
        status='active'
    ).select_related(
        'participant_a', 'participant_b',
        'participant_a__school', 'participant_b__school'
    ).order_by('-last_activity_at')

    # Get active blocks
    blocked_ids = set(Block.objects.filter(
        Q(blocker=user) | Q(blocked=user)
    ).values_list('blocked_id', 'blocker_id'))
    flat_blocked = {uid for pair in blocked_ids for uid in pair if uid != user.id}

    results = []
    seen_peer_ids = set()

    for c in convs:
        peer = c.participant_b if c.participant_a_id == user.id else c.participant_a
        if peer.id in flat_blocked:
            continue

        seen_peer_ids.add(peer.id)

        # Message stats
        all_msgs = c.messages.all()
        total_count = all_msgs.count()
        unread_count = all_msgs.filter(sender=peer, delivered_at__isnull=True).count()
        first_msg = all_msgs.order_by('sent_at').first()
        last_msg = all_msgs.order_by('-sent_at').first()

        who_msg_first = 'none'
        who_msg_first_label = 'No messages yet'
        if first_msg:
            if first_msg.sender_id == user.id:
                who_msg_first = 'you'
                who_msg_first_label = 'You initiated this chat'
            else:
                who_msg_first = 'peer'
                peer_first_name = peer.first_name or peer.username
                who_msg_first_label = f"{peer_first_name} messaged first"

        results.append({
            'conversation_id': c.id,
            'peer': {
                'id': peer.id,
                'name': peer.get_full_name() or peer.username,
                'username': peer.username,
                'role': peer.role,
                'role_label': _user_role_label(peer),
                'school': _user_institution_label(peer),
                'city': peer.school.city if peer.school else '',
                'avatar_color': '#0ea5e9' if peer.role in ['teacher', 'principal'] else '#10b981'
            },
            'total_messages': total_count,
            'unread_count': unread_count,
            'who_msg_first': who_msg_first,
            'who_msg_first_label': who_msg_first_label,
            'last_message': {
                'ciphertext': last_msg.ciphertext[:120] if last_msg else '',
                'sent_at': last_msg.sent_at.isoformat() if last_msg else '',
                'is_mine': (last_msg.sender_id == user.id) if last_msg else False,
                'delivered': (last_msg.delivered_at is not None) if last_msg else False,
            } if last_msg else None,
            'last_activity_at': c.last_activity_at.isoformat()
        })

    # Also include connected friends who don't have a Conversation record yet (WhatsApp contacts style)
    active_conns = Connection.objects.filter(
        Q(user_a=user) | Q(user_b=user),
        status='active'
    ).select_related(
        'user_a', 'user_b',
        'user_a__school', 'user_b__school'
    ).order_by('-created_at')

    for conn in active_conns:
        peer = conn.user_b if conn.user_a_id == user.id else conn.user_a
        if peer.id in flat_blocked or peer.id in seen_peer_ids:
            continue

        seen_peer_ids.add(peer.id)
        results.append({
            'conversation_id': None,
            'peer': {
                'id': peer.id,
                'name': peer.get_full_name() or peer.username,
                'username': peer.username,
                'role': peer.role,
                'role_label': _user_role_label(peer),
                'school': _user_institution_label(peer),
                'city': peer.school.city if peer.school else '',
                'avatar_color': '#0ea5e9' if peer.role in ['teacher', 'principal'] else '#10b981'
            },
            'total_messages': 0,
            'unread_count': 0,
            'who_msg_first': 'none',
            'who_msg_first_label': 'Start a new conversation',
            'last_message': None,
            'last_activity_at': conn.created_at.isoformat()
        })

    return results


def send_inbox_message(
    sender: User,
    conversation_id: int,
    ciphertext: str,
    nonce: str,
    sender_signature: str = ""
) -> EncryptedMessage:
    """
    Sends an end-to-end encrypted message in an active conversation between connected peers.
    Dispatches a real-time notification to the recipient.
    """
    if not sender or not sender.is_authenticated:
        raise PermissionDenied("Authentication required.")

    if not ciphertext or not isinstance(ciphertext, str):
        raise ValidationError("Message payload (ciphertext) is required.")

    if len(ciphertext) > 10000:
        raise ValidationError("Message exceeds maximum allowed size (10,000 characters).")

    if not nonce:
        raise ValidationError("Initialization vector / nonce is required.")

    conv = Conversation.objects.filter(id=conversation_id).select_related('participant_a', 'participant_b').first()
    if not conv:
        raise ValidationError("Conversation not found.")

    if sender.id not in (conv.participant_a_id, conv.participant_b_id):
        raise PermissionDenied("You are not a participant in this conversation.")

    peer = conv.participant_b if conv.participant_a_id == sender.id else conv.participant_a

    # Check connection still active
    has_conn = Connection.objects.filter(
        Q(user_a=sender, user_b=peer) | Q(user_a=peer, user_b=sender),
        status='active'
    ).exists()
    if not has_conn:
        raise PermissionDenied("Conversation is locked because mutual connection is no longer active.")

    # Check blocks
    if Block.objects.filter(
        Q(blocker=sender, blocked=peer) | Q(blocker=peer, blocked=sender)
    ).exists():
        raise PermissionDenied("Message cannot be sent due to an active block.")

    msg = EncryptedMessage.objects.create(
        conversation=conv,
        sender=sender,
        ciphertext=ciphertext,
        nonce=nonce,
        sender_signature=sender_signature or "",
        size_bytes=len(ciphertext.encode('utf-8'))
    )

    # Touch conversation timestamp
    conv.last_activity_at = timezone.now()
    conv.save(update_fields=['last_activity_at'])

    # Send in-app notification to peer
    sender_display = sender.get_full_name() or sender.username
    Notification.objects.create(
        user=peer,
        title=f"New Message from {sender_display}"[:180],
        body=f"{sender_display} sent you an encrypted message in your Inbox."[:400]
    )

    return msg


def get_inbox_messages(user: User, conversation_id: int, since=None, limit: int = 100) -> list:
    """
    Retrieves encrypted messages for a conversation, auto-marking newly retrieved
    incoming messages as delivered.
    """
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    conv = Conversation.objects.filter(id=conversation_id).first()
    if not conv:
        raise ValidationError("Conversation not found.")

    if user.id not in (conv.participant_a_id, conv.participant_b_id):
        raise PermissionDenied("You are not a participant in this conversation.")

    qs = EncryptedMessage.objects.filter(conversation=conv)
    if since:
        qs = qs.filter(sent_at__gt=since)

    messages = list(qs.select_related('sender').order_by('sent_at')[:limit])

    # Mark peer messages as delivered
    peer_msg_ids = [m.id for m in messages if m.sender_id != user.id and not m.delivered_at]
    if peer_msg_ids:
        now = timezone.now()
        EncryptedMessage.objects.filter(id__in=peer_msg_ids).update(delivered_at=now)
        for m in messages:
            if m.id in peer_msg_ids:
                m.delivered_at = now

    return [{
        'id': m.id,
        'conversation_id': m.conversation_id,
        'sender_id': m.sender_id,
        'sender_name': m.sender.get_full_name() or m.sender.username,
        'is_mine': (m.sender_id == user.id),
        'ciphertext': m.ciphertext,
        'nonce': m.nonce,
        'sender_signature': m.sender_signature,
        'sent_at': m.sent_at.isoformat(),
        'delivered_at': m.delivered_at.isoformat() if m.delivered_at else None
    } for m in messages]


def get_inbox_unread_count(user: User) -> int:
    """
    Returns total unread messages across all active conversations for the user.
    """
    if not user or not user.is_authenticated:
        return 0

    return EncryptedMessage.objects.filter(
        conversation__in=Conversation.objects.filter(
            Q(participant_a=user) | Q(participant_b=user),
            status='active'
        ),
        delivered_at__isnull=True
    ).exclude(sender=user).count()
