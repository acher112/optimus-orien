"""
Test suite for Inbox & Direct Messaging system (WhatsApp/Instagram messenger style).
Verifies:
- Connection prerequisite enforcement
- Conversation initiation and listing
- Message sending, size limits, and nonces
- Read/delivery receipts (delivered_at)
- Accurate message counting & 'who messaged first' tracking
- Unread count badge API
- Active block denial
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone

from core.models import User, School, Organisation, Connection, ConnectionRequest, Block, Conversation, EncryptedMessage


class InboxMessagingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Beaconhouse System")
        self.school = School.objects.create(organisation=self.org, name="Beaconhouse Model School", city="Lahore")

        self.user_a = User.objects.create_user(
            username="teacher_ali",
            password="password123",
            role="teacher",
            first_name="Ali",
            last_name="Raza",
            school=self.school
        )

        self.user_b = User.objects.create_user(
            username="student_hamza",
            password="password123",
            role="student",
            first_name="Hamza",
            last_name="Tariq",
            school=self.school
        )

        self.user_c = User.objects.create_user(
            username="stranger_zain",
            password="password123",
            role="student",
            first_name="Zain",
            last_name="Malik",
            school=self.school
        )

    def test_unconnected_users_cannot_start_conversation(self):
        """Unconnected stranger cannot open a conversation or message."""
        self.client.force_authenticate(user=self.user_a)
        res = self.client.post('/api/v1/communication/inbox/conversations/', {
            'peer_id': self.user_c.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("accepted connections", res.data['detail'])

    def test_cannot_message_yourself(self):
        """User cannot open a conversation with themselves."""
        self.client.force_authenticate(user=self.user_a)
        res = self.client.post('/api/v1/communication/inbox/conversations/', {
            'peer_id': self.user_a.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_connected_users_can_open_conversation_and_chat(self):
        """Accepted connection enables conversation and E2EE message exchange."""
        # Establish mutual connection
        u_a, u_b = (self.user_a, self.user_b) if self.user_a.id < self.user_b.id else (self.user_b, self.user_a)
        Connection.objects.create(user_a=u_a, user_b=u_b, status='active')

        self.client.force_authenticate(user=self.user_a)

        # 1. Open conversation
        res = self.client.post('/api/v1/communication/inbox/conversations/', {
            'peer_id': self.user_b.id
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        conv_id = res.data['conversation_id']
        self.assertIsNotNone(conv_id)

        # 2. Send message from User A
        res = self.client.post(f'/api/v1/communication/inbox/conversations/{conv_id}/messages/', {
            'ciphertext': 'enc_payload_hello_hamza',
            'nonce': 'random_nonce_12345'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('message_id', res.data)

        # 3. Check conversations list for User B
        self.client.force_authenticate(user=self.user_b)
        res = self.client.get('/api/v1/communication/inbox/conversations/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        convs = res.data['conversations']
        self.assertTrue(len(convs) >= 1)

        conv_entry = next(c for c in convs if c['conversation_id'] == conv_id)
        self.assertEqual(conv_entry['total_messages'], 1)
        self.assertEqual(conv_entry['unread_count'], 1)
        self.assertEqual(conv_entry['who_msg_first'], 'peer')
        self.assertIn('Ali', conv_entry['who_msg_first_label'])

        # 4. Check unread count endpoint
        res = self.client.get('/api/v1/communication/inbox/unread-count/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['unread_count'], 1)

        # 5. Fetch messages as User B (marks message as delivered)
        res = self.client.get(f'/api/v1/communication/inbox/conversations/{conv_id}/messages/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        msgs = res.data['messages']
        self.assertEqual(len(msgs), 1)
        self.assertFalse(msgs[0]['is_mine'])
        self.assertIsNotNone(msgs[0]['delivered_at'])

        # 6. Unread count is now 0
        res = self.client.get('/api/v1/communication/inbox/unread-count/')
        self.assertEqual(res.data['unread_count'], 0)

        # 7. Reply from User B
        res = self.client.post(f'/api/v1/communication/inbox/conversations/{conv_id}/messages/', {
            'ciphertext': 'enc_payload_hi_sir',
            'nonce': 'random_nonce_67890'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 8. User A checks conversation: who_msg_first should say 'you'
        self.client.force_authenticate(user=self.user_a)
        res = self.client.get('/api/v1/communication/inbox/conversations/')
        conv_entry = next(c for c in res.data['conversations'] if c['conversation_id'] == conv_id)
        self.assertEqual(conv_entry['total_messages'], 2)
        self.assertEqual(conv_entry['who_msg_first'], 'you')
        self.assertEqual(conv_entry['who_msg_first_label'], 'You initiated this chat')

    def test_active_block_denies_messaging(self):
        """If a user blocks another, messaging is denied."""
        u_a, u_b = (self.user_a, self.user_b) if self.user_a.id < self.user_b.id else (self.user_b, self.user_a)
        Connection.objects.create(user_a=u_a, user_b=u_b, status='active')
        conv = Conversation.objects.create(participant_a=u_a, participant_b=u_b, status='active')

        # User B blocks User A
        Block.objects.create(blocker=self.user_b, blocked=self.user_a, reason="Harassment")

        self.client.force_authenticate(user=self.user_a)
        res = self.client.post(f'/api/v1/communication/inbox/conversations/{conv.id}/messages/', {
            'ciphertext': 'hello',
            'nonce': 'nonce123'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("active block", res.data['detail'])

    def test_backend_side_e2ee_and_last_message_sender_recipient_preview(self):
        """Plaintext message sent is encrypted at rest in DB and decrypted with sender_name in preview."""
        u_a, u_b = (self.user_a, self.user_b) if self.user_a.id < self.user_b.id else (self.user_b, self.user_a)
        Connection.objects.create(user_a=u_a, user_b=u_b, status='active')

        self.client.force_authenticate(user=self.user_a)
        res = self.client.post('/api/v1/communication/inbox/conversations/', {'peer_id': self.user_b.id}, format='json')
        conv_id = res.data['conversation_id']

        # User A sends plain text "kese ho"
        res = self.client.post(f'/api/v1/communication/inbox/conversations/{conv_id}/messages/', {
            'message': 'kese ho'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Verify DB does NOT store "kese ho" in plaintext!
        msg_db = EncryptedMessage.objects.get(id=res.data['message_id'])
        self.assertNotEqual(msg_db.ciphertext, 'kese ho')
        self.assertNotIn('kese ho', msg_db.ciphertext)

        # Verify conversation list returns decrypted last_message with sender_name
        res = self.client.get('/api/v1/communication/inbox/conversations/')
        conv_entry = next(c for c in res.data['conversations'] if c['conversation_id'] == conv_id)
        self.assertEqual(conv_entry['last_message']['text'], 'kese ho')
        self.assertEqual(conv_entry['last_message']['sender_name'], 'You')
        self.assertTrue(conv_entry['last_message']['is_mine'])

        # User B reads: should see sender_name as Ali and text as 'kese ho'
        self.client.force_authenticate(user=self.user_b)
        res = self.client.get('/api/v1/communication/inbox/conversations/')
        conv_entry = next(c for c in res.data['conversations'] if c['conversation_id'] == conv_id)
        self.assertEqual(conv_entry['last_message']['text'], 'kese ho')
        self.assertEqual(conv_entry['last_message']['sender_name'], 'Ali')
        self.assertFalse(conv_entry['last_message']['is_mine'])
