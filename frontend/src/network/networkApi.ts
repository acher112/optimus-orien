import { request } from '../api';
import {
  MyNetworkProfile,
  PublicNetworkProfile,
  BoardResponse,
  BoardCardItem,
  StudentAchieverItem,
  ConnectionRequestItem,
  ActiveConnectionItem,
  BoardMetadata,
  SchoolNetworkSetting,
  ChatConversationItem,
  EncryptedMessageItem,
  PeerPublicKeyBundle
} from './networkTypes';

export const networkApi = {
  // Profiles
  getMyProfile: () => request<MyNetworkProfile>('/api/v1/network/profile/me/'),
  updateMyProfile: (data: Partial<MyNetworkProfile>) =>
    request<{ detail: string; id: number }>('/api/v1/network/profile/me/', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
  getPublicProfile: (userId: number) =>
    request<PublicNetworkProfile>(`/api/v1/network/profiles/${userId}/`),

  // Consents & School Settings
  getConsents: () =>
    request<{ consents: Array<{ consent_type: string; version: string; granted_at: string }> }>('/api/v1/network/consent/'),
  grantConsent: (consentType: string, version = '2026.1') =>
    request<{ detail: string }>('/api/v1/network/consent/', {
      method: 'POST',
      body: JSON.stringify({ consent_type: consentType, version })
    }),
  withdrawConsent: (consentType: string) =>
    request<{ detail: string }>('/api/v1/network/consent/withdraw/', {
      method: 'POST',
      body: JSON.stringify({ consent_type: consentType })
    }),
  getSchoolSettings: () => request<SchoolNetworkSetting>('/api/v1/network/school-settings/'),
  updateSchoolSettings: (data: Partial<SchoolNetworkSetting>) =>
    request<{ detail: string }>('/api/v1/network/school-settings/', {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  // Boards
  getPrincipalsBoard: (params: Record<string, string | number | boolean> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    return request<BoardResponse<BoardCardItem>>(`/api/v1/network/boards/principals/?${query.toString()}`);
  },
  getTeachersBoard: (params: Record<string, string | number | boolean> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    return request<BoardResponse<BoardCardItem>>(`/api/v1/network/boards/teachers/?${query.toString()}`);
  },
  getStudentAchieversBoard: (params: Record<string, string | number | boolean> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
    });
    return request<{ count: number; next: string | null; previous: string | null; results: StudentAchieverItem[] }>(
      `/api/v1/network/boards/students/?${query.toString()}`
    );
  },
  getBoardMetadata: () => request<BoardMetadata>('/api/v1/network/boards/meta/'),

  // Requests
  sendConnectionRequest: (toUserId: number, note = '') =>
    request<{ detail: string; request_id: number; status: string }>('/api/v1/network/requests/', {
      method: 'POST',
      body: JSON.stringify({ to_user_id: toUserId, note })
    }),
  getReceivedRequests: () => request<ConnectionRequestItem[]>('/api/v1/network/requests/received/'),
  getSentRequests: () => request<ConnectionRequestItem[]>('/api/v1/network/requests/sent/'),
  acceptRequest: (requestId: number) =>
    request<{ detail: string; status: string }>(`/api/v1/network/requests/${requestId}/accept/`, {
      method: 'POST'
    }),
  declineRequest: (requestId: number) =>
    request<{ detail: string; status: string }>(`/api/v1/network/requests/${requestId}/decline/`, {
      method: 'POST'
    }),
  withdrawRequest: (requestId: number) =>
    request<{ detail: string; status: string }>(`/api/v1/network/requests/${requestId}/withdraw/`, {
      method: 'POST'
    }),

  // Connections
  getConnections: () => request<ActiveConnectionItem[]>('/api/v1/network/connections/'),
  removeConnection: (peerId: number) =>
    request<{ detail: string }>(`/api/v1/network/connections/${peerId}/`, {
      method: 'DELETE'
    }),
  getSuggestedConnections: () => request<PublicNetworkProfile[]>('/api/v1/network/connections/suggested/'),

  // Safety
  blockUser: (userId: number, reason = '') =>
    request<{ detail: string; block_id: number }>('/api/v1/network/block/', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, reason })
    }),
  unblockUser: (userId: number) =>
    request<{ detail: string }>(`/api/v1/network/block/${userId}/`, {
      method: 'DELETE'
    }),
  muteUser: (userId: number) =>
    request<{ detail: string; mute_id: number }>('/api/v1/network/mute/', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    }),
  unmuteUser: (userId: number) =>
    request<{ detail: string }>(`/api/v1/network/mute/${userId}/`, {
      method: 'DELETE'
    }),
  fileReport: (reportedUserId: number, category: string, details: string) =>
    request<{ detail: string; report_id: number }>('/api/v1/network/report/', {
      method: 'POST',
      body: JSON.stringify({
        reported_user_id: reportedUserId,
        category,
        details
      })
    }),

  // E2EE Chat (Stage 4)
  uploadKeyBundle: (data: {
    identity_key: string;
    signed_prekey: string;
    prekey_signature: string;
    one_time_keys: string[];
    device_id?: string;
  }) =>
    request<{ detail: string; bundle_id: number; otk_count: number }>('/api/v1/network/chat/keys/bundle/', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getPeerKeyBundle: (userId: number) =>
    request<PeerPublicKeyBundle>(`/api/v1/network/chat/keys/${userId}/`),
  listConversations: () =>
    request<ChatConversationItem[]>('/api/v1/network/chat/conversations/'),
  openConversation: (peerId: number) =>
    request<{ detail: string; conversation_id: number; status: string; created_at: string }>(
      '/api/v1/network/chat/conversations/',
      {
        method: 'POST',
        body: JSON.stringify({ peer_id: peerId })
      }
    ),
  getConversationMessages: (conversationId: number, since?: string) => {
    const q = since ? `?since=${encodeURIComponent(since)}` : '';
    return request<EncryptedMessageItem[]>(`/api/v1/network/chat/conversations/${conversationId}/messages/${q}`);
  },
  sendEncryptedMessage: (
    conversationId: number,
    data: { ciphertext: string; nonce: string; sender_signature?: string }
  ) =>
    request<{ detail: string; message_id: number; sent_at: string }>(
      `/api/v1/network/chat/conversations/${conversationId}/messages/`,
      {
        method: 'POST',
        body: JSON.stringify(data)
      }
    )
};
