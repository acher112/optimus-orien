import React from 'react';
import {
  Mail,
  Phone,
  Hash,
  MapPin,
} from 'lucide-react';

export interface HistoryItem {
  index: string;
  grade: string;
  year: string;
  score: string;
  status: string;
}

export interface TransferRecord {
  current_enrollment: {
    school_name: string;
    details: string;
  };
  previous_institution?: {
    school_name: string;
    details: string;
  };
}

export interface UserProfileData {
  id: number | string;
  name: string;
  role: 'student' | 'teacher' | 'principal' | 'organisation_admin' | 'school_admin' | string;
  registryId?: string;
  email?: string;
  phone?: string;
  idNumber?: string;
  location?: string;
  avatarLetter?: string;
  avatarColor?: string;
  avatarImage?: string;
  trajectory?: any[];
  historyItems?: HistoryItem[];
  transferRecord?: TransferRecord;
}

interface UserProfileViewProps {
  profile: UserProfileData;
  onEdit?: () => void;
  extraActions?: React.ReactNode;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  profile,
  onEdit,
  extraActions,
}) => {
  const role = profile.role || 'student';
  const isTeacher = role === 'teacher';
  const isStudent = role === 'student';

  const defaultRegistry = isStudent
    ? `REGISTRY ID: STUDENT-${profile.id}`
    : isTeacher
    ? `REGISTRY ID: FACULTY-${profile.id}`
    : `REGISTRY ID: ADMIN-${profile.id}`;

  const displayName = profile.name || (isStudent ? `Student-ID-${profile.id}` : `Staff-${profile.id}`);
  const initial = profile.avatarLetter || displayName.charAt(0).toUpperCase() || 'U';

  return (
    <div
      className="user-profile-layout-container"
      style={{
        maxWidth: 640,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Identity Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 24,
          padding: '32px 28px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Avatar Container */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            background: profile.avatarColor || '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            fontWeight: 900,
            marginBottom: 18,
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.1)',
            overflow: 'hidden',
          }}
        >
          {profile.avatarImage ? (
            <img
              src={profile.avatarImage}
              alt={displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>

        {/* Name & Registry ID */}
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: 22,
            fontWeight: 900,
            color: '#0f172a',
            letterSpacing: '-0.3px',
          }}
        >
          {displayName}
        </h2>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: '#64748b',
            marginBottom: 24,
          }}
        >
          {profile.registryId || defaultRegistry}
        </div>

        {/* Identity Meta List */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            textAlign: 'left',
            borderTop: '1px solid #f1f5f9',
            paddingTop: 22,
          }}
        >
          {/* Email Address */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Mail size={16} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#94a3b8' }}>
                EMAIL ADDRESS
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 1, wordBreak: 'break-all' }}>
                {profile.email || `${displayName.toLowerCase().replace(/\s+/g, '-')}@edu.us`}
              </div>
            </div>
          </div>

          {/* Contact Number */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Phone size={16} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#94a3b8' }}>
                CONTACT NUMBER
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 1 }}>
                {profile.phone || '—'}
              </div>
            </div>
          </div>

          {/* ID Number / SSM */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Hash size={16} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#94a3b8' }}>
                ID NUMBER / SSM
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 1 }}>
                {profile.idNumber || `ID-${profile.id}`}
              </div>
            </div>
          </div>

          {/* Location */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <MapPin size={16} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#94a3b8' }}>
                LOCATION
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 1 }}>
                {profile.location || 'Main Campus'}
              </div>
            </div>
          </div>
        </div>

        {extraActions && (
          <div style={{ width: '100%', marginTop: 24, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
            {extraActions}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfileView;
