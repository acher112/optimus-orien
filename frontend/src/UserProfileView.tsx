import React from 'react';
import {
  Mail,
  Phone,
  Hash,
  MapPin,
  Award,
  CheckCircle2,
  Clock,
} from 'lucide-react';

export interface QuizPerformanceRecord {
  id: number;
  competition_id?: number;
  title: string;
  subject: string;
  difficulty: string;
  scope_label?: string;
  score_percentage: number;
  raw_score?: number;
  total_marks?: number;
  accuracy_percentage: number;
  time_display: string;
  country?: string;
  submitted_date: string;
}

export interface QuizPerformanceSummary {
  total_attempted: number;
  average_score: number | null;
  average_accuracy: number | null;
  best_score: number | null;
}

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
  quizSummary?: QuizPerformanceSummary;
  quizPerformance?: QuizPerformanceRecord[];
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

      {/* Student Quiz & Online Assessment Performance Record */}
      {(isStudent || (profile.quizPerformance && profile.quizPerformance.length > 0)) && (
        <div
          style={{
            marginTop: 20,
            background: '#ffffff',
            borderRadius: 24,
            padding: '24px 24px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Award size={20} color="#7c3aed" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                Quiz &amp; Assessment Performance Record
              </h3>
            </div>
            {profile.quizSummary && (
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#475569', flexWrap: 'wrap' }}>
                <span>Attempted: <strong style={{ color: '#0f172a' }}>{profile.quizSummary.total_attempted}</strong></span>
                {profile.quizSummary.average_score !== null && (
                  <span>Avg: <strong style={{ color: '#7c3aed' }}>{profile.quizSummary.average_score}%</strong></span>
                )}
                {profile.quizSummary.best_score !== null && (
                  <span>Best: <strong style={{ color: '#059669' }}>{profile.quizSummary.best_score}%</strong></span>
                )}
              </div>
            )}
          </div>

          {!profile.quizPerformance || profile.quizPerformance.length === 0 ? (
            <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 18, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
              No online quizzes attempted yet. Attempted quiz scores and speed metrics will be saved here automatically.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {profile.quizPerformance.map((qp) => (
                <div
                  key={qp.id}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={14} color="#059669" /> {qp.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                      {qp.subject} • {qp.difficulty} {qp.scope_label ? `• ${qp.scope_label}` : ''} • {qp.submitted_date}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    <span style={{ fontWeight: 800, color: '#7c3aed', background: '#ede9fe', padding: '3px 9px', borderRadius: 8 }}>
                      {qp.score_percentage}%
                    </span>
                    <span style={{ color: '#059669', fontWeight: 700 }}>{qp.accuracy_percentage}% Acc</span>
                    <span style={{ color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {qp.time_display}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserProfileView;
