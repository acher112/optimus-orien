"""
Inbox and Direct Messaging REST API Views.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from django.core.exceptions import ValidationError, PermissionDenied

from core.models import User
from core.services.inbox_service import (
    get_or_create_inbox_conversation,
    list_inbox_conversations,
    send_inbox_message,
    get_inbox_messages,
    get_inbox_unread_count
)


class InboxConversationsView(APIView):
    """
    Lists active conversations and connected friends, or opens a new 1-to-1 conversation.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        conversations = list_inbox_conversations(request.user)
        return Response({
            'count': len(conversations),
            'conversations': conversations
        })

    def post(self, request):
        peer_id = request.data.get('peer_id')
        if not peer_id:
            return Response({'detail': 'peer_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        peer = User.objects.filter(id=peer_id).first()
        if not peer:
            return Response({'detail': 'Peer user not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            conv = get_or_create_inbox_conversation(request.user, peer)
            return Response({
                'detail': 'Conversation active.',
                'conversation_id': conv.id,
                'status': conv.status,
                'created_at': conv.created_at.isoformat()
            }, status=status.HTTP_200_OK)
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class InboxMessagesView(APIView):
    """
    Retrieves or sends encrypted messages within an active conversation.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        since = request.query_params.get('since')
        try:
            messages = get_inbox_messages(request.user, conversation_id, since=since)
            return Response({
                'count': len(messages),
                'messages': messages
            })
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def post(self, request, conversation_id):
        message = request.data.get('message') or request.data.get('text')
        ciphertext = request.data.get('ciphertext')
        nonce = request.data.get('nonce')
        sender_signature = request.data.get('sender_signature', '')

        try:
            msg = send_inbox_message(
                sender=request.user,
                conversation_id=conversation_id,
                ciphertext=ciphertext,
                nonce=nonce,
                message=message,
                sender_signature=sender_signature
            )
            return Response({
                'detail': 'Message dispatched.',
                'message_id': msg.id,
                'sent_at': msg.sent_at.isoformat()
            }, status=status.HTTP_201_CREATED)
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class InboxUnreadCountView(APIView):
    """
    Returns total unread messages count for navbar badges.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        count = get_inbox_unread_count(request.user)
        return Response({'unread_count': count})
