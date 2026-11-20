export type RankDisplayMode = 'exact' | 'tier_only' | 'none';
export type AllowRequestsFrom = 'anyone_verified' | 'my_city_country' | 'nobody';

export interface NetworkBadge {
  id: number;
  badge_type: 'gold' | 'silver' | 'bronze' | 'most_improved' | 'consistent_performer' | 'school_verified' | 'platform_verified';
  title: string;
  period_identifier?: string;
  awarded_at: string;
}

export interface MyNetworkProfile {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  headline: string;
  bio: string;
  experience_years: number;
  qualifications: string[];
  subjects: string[];
  interests: string[];
  school_id: number | null;
  school_name: string;
  city_display: string;
  country_display: string;
  rank_display_mode: RankDisplayMode;
  allow_requests_from: AllowRequestsFrom;
  show_school_name: boolean;
  show_city: boolean;
  show_online_status: boolean;
  read_receipts_enabled: boolean;
  is_platform_verified: boolean;
  is_suspended: boolean;
  consents: Array<{
    consent_type: string;
    version: string;
    granted_at: string;
  }>;
  badges: NetworkBadge[];
}

export interface PublicNetworkProfile {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  headline: string;
  bio: string;
  experience_years: number;
  qualifications: string[];
  subjects: string[];
  interests: string[];
  school_name: string;
  city: string;
  country: string;
  rank_display_mode: RankDisplayMode;
  is_platform_verified: boolean;
  connection_status: 'none' | 'pending_sent' | 'pending_received' | 'connected' | 'self';
  badges: NetworkBadge[];
  allow_requests: boolean;
  suggestion_reason?: string;
}

export interface PodiumItem {
  rank: number;
  entity_id: number;
  name: string;
  school_name: string;
  city: string;
  country?: string;
  subject_name?: string;
  grade_level?: string;
  score: number;
  positive_band: string;
  tier_label: string;
  score_delta?: number | null;
  is_most_improved?: boolean;
}

export interface BoardCardItem {
  id: number;
  rank: number | null;
  display_mode?: RankDisplayMode;
  entity_id: number;
  name: string;
  school_name: string;
  city: string;
  country?: string;
  subject_name?: string;
  grade_level?: string;
  score: number;
  positive_band: string;
  tier_label: string;
  score_delta?: number | null;
  is_most_improved?: boolean;
  student_count?: number;
  assessment_count?: number;
}

export interface StudentAchieverItem {
  id: number;
  rank: number;
  display_alias: string;
  subject_name: string;
  grade_level: string;
  honor_title: string;
  positive_band: string;
  school_name?: string;
}

export interface BoardResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: {
    podium?: PodiumItem[];
    items?: T[];
  } | T[];
}

export interface ConnectionRequestItem {
  id: number;
  from_user_id?: number;
  from_user_name?: string;
  to_user_id?: number;
  to_user_name?: string;
  school_name: string;
  role: string;
  note: string;
  created_at: string;
}

export interface ActiveConnectionItem {
  id: number;
  peer_id: number;
  peer_name: string;
  role: string;
  school_name: string;
  city: string;
  connected_at: string;
}

export interface BoardMetadata {
  periods: string[];
  subjects: string[];
  grade_levels: string[];
  cities: string[];
}

export interface SchoolNetworkSetting {
  school_id: number;
  school_name: string;
  network_enabled: boolean;
  staff_board_enabled: boolean;
  student_board_enabled: boolean;
  updated_at: string;
}

export interface ChatConversationItem {
  conversation_id: number;
  peer_id: number;
  peer_name: string;
  peer_role: string;
  peer_school: string;
  last_activity_at: string;
  unread_count: number;
  last_message_at: string | null;
}

export interface EncryptedMessageItem {
  id: number;
  conversation_id: number;
  sender_id: number;
  ciphertext: string;
  nonce: string;
  sender_signature: string;
  sent_at: string;
  delivered_at: string | null;
  decrypted_plaintext?: string;
}

export interface PeerPublicKeyBundle {
  user_id: number;
  identity_key: string;
  signed_prekey: string;
  prekey_signature: string;
  one_time_key: string | null;
  device_id: string;
}

