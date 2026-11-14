import React from 'react';
import {
  Mail,
  Phone,
  Hash,
  MapPin,
  Clock,
  History,
  CheckCircle2,
  Building2,
  GraduationCap,
  Award,
  Briefcase,
} from 'lucide-react';
import PerformanceTrajectoryChart, { TrajectoryPoint } from './PerformanceTrajectoryChart';

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
  trajectory?: TrajectoryPoint[];
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
  const isPrincipal = role === 'principal' || role === 'school_admin';
  const isStudent = role === 'student';

  const defaultRegistry = isStudent
    ? `REGISTRY ID: STUDENT-${profile.id}`
    : isTeacher
    ? `REGISTRY ID: FACULTY-${profile.id}`
    : `REGISTRY ID: ADMIN-${profile.id}`;

  const displayName = profile.name || (isStudent ? `Student-ID-${profile.id}` : `Staff-${profile.id}`);
  const initial = profile.avatarLetter || displayName.charAt(0).toUpperCase() || 'U';

  const defaultTrajectory: TrajectoryPoint[] = profile.trajectory || [
    { year: '2021', avgScore: 65.4 },
    { year: '2022', avgScore: 69.1 },
    { year: '2023', avgScore: 68.16 },
    { year: '2024', avgScore: 78.4 },
    { year: '2025', avgScore: 74.2 },
  ];

  const defaultHistory: HistoryItem[] = profile.historyItems || (
    isStudent
      ? [
          { index: '21', grade: 'Grade 5', year: 'ACADEMIC YEAR 2021', score: '77.2386382428107%', status: 'COMPLETED' },
          { index: '22', grade: 'Grade 6', year: 'ACADEMIC YEAR 2022', score: '77.13523726705296%', status: 'COMPLETED' },
          { index: '23', grade: 'Grade 7', year: 'ACADEMIC YEAR 2023', score: '81.26803746178314%', status: 'COMPLETED' },
          { index: '24', grade: 'Grade 8', year: 'ACADEMIC YEAR 2024', score: '74.23398979983742%', status: 'COMPLETED' },
        ]
      : isTeacher
      ? [
          { index: '21', grade: 'Senior Secondary Science', year: 'ACADEMIC YEAR 2021', score: '84.5% Class SPI', status: 'COMPLETED' },
          { index: '22', grade: 'Higher Secondary Physics', year: 'ACADEMIC YEAR 2022', score: '87.1% Class SPI', status: 'COMPLETED' },
          { index: '23', grade: 'STEM Lab Leadership', year: 'ACADEMIC YEAR 2023', score: '89.3% Class SPI', status: 'COMPLETED' },
          { index: '24', grade: 'Advanced Sciences Curriculum', year: 'ACADEMIC YEAR 2024', score: '88.0% Class SPI', status: 'COMPLETED' },
        ]
      : [
          { index: '21', grade: 'Campus Academic Session 2021', year: 'ACADEMIC YEAR 2021', score: '81.2% Overall SPI', status: 'COMPLETED' },
          { index: '22', grade: 'Campus Academic Session 2022', year: 'ACADEMIC YEAR 2022', score: '83.4% Overall SPI', status: 'COMPLETED' },
          { index: '23', grade: 'Campus Academic Session 2023', year: 'ACADEMIC YEAR 2023', score: '86.1% Overall SPI', status: 'COMPLETED' },
          { index: '24', grade: 'Campus Academic Session 2024', year: 'ACADEMIC YEAR 2024', score: '87.5% Overall SPI', status: 'COMPLETED' },
        ]
  );

  const transferRec: TransferRecord = profile.transferRecord || {
    current_enrollment: {
      school_name: profile.location || 'School-611',
      details: 'Joined March 2024 • Active Session',
    },
    previous_institution: {
      school_name: 'Global Academy Prep',
      details: 'Transfer Date: August 2023 • Reason: Academic Relocation',
    },
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 320px) minmax(450px, 1fr)',
        gap: 24,
        alignItems: 'start',
      }}
    >
      {/* Left Column: Identity Card (matching SS4) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 24,
          padding: '32px 24px',
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
            width: 100,
            height: 100,
            borderRadius: 28,
            background: profile.avatarColor || '#f1f5f9',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 36,
            fontWeight: 900,
            marginBottom: 20,
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
            fontSize: 20,
            fontWeight: 900,
            color: '#0f172a',
            letterSpacing: '-0.3px',
          }}
        >
          {displayName}
        </h2>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: '#64748b',
            marginBottom: 28,
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
            gap: 18,
            textAlign: 'left',
            borderTop: '1px solid #f1f5f9',
            paddingTop: 24,
          }}
        >
          {/* Email Address */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Mail size={16} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
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
                {profile.phone || '+1 (555) 000-0000'}
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
                {profile.idNumber || `ID-${776000 + Number(profile.id || 141)}`}
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
                {profile.location || 'Main Campus Sector'}
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

      {/* Right Column: Performance Trajectory + History + Transfer Record */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Top: 5-Year Performance Trajectory Chart */}
        <PerformanceTrajectoryChart
          data={defaultTrajectory}
          title={isPrincipal ? '5-YEAR CAMPUS SPI TRAJECTORY' : isTeacher ? '5-YEAR TEACHING EFFECTIVENESS TRAJECTORY' : '5-YEAR PERFORMANCE TRAJECTORY'}
          subtitle="LONGITUDINAL SCORE CONSISTENCY"
          height={240}
        />

        {/* Middle: Grade/Year Performance Breakdown List (matching SS4) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 24,
            padding: '24px 28px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {defaultHistory.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: idx === defaultHistory.length - 1 ? '#f8fafc' : '#ffffff',
                  border: idx === defaultHistory.length - 1 ? '1.5px solid #cbd5e1' : '1px solid #e2e8f0',
                  borderRadius: 18,
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: '#64748b',
                      minWidth: 24,
                    }}
                  >
                    {item.index}
                  </span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>
                      {item.grade}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.6px',
                        textTransform: 'uppercase',
                        color: '#64748b',
                        marginTop: 2,
                      }}
                    >
                      {item.year}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>
                    {item.score}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: '0.6px',
                      textTransform: 'uppercase',
                      color: '#059669',
                      marginTop: 2,
                    }}
                  >
                    {item.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: School Transfer Record / Institutional Service Record */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 24,
            padding: '24px 28px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <History size={18} color="#ef4444" />
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: '-0.2px',
                textTransform: 'uppercase',
                color: '#0f172a',
              }}
            >
              {isStudent ? 'SCHOOL TRANSFER RECORD' : 'INSTITUTIONAL SERVICE RECORD'}
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Current Enrollment / Posting */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#10b981',
                  marginTop: 6,
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#64748b' }}>
                  {isStudent ? 'CURRENT ENROLLMENT' : 'CURRENT ASSIGNMENT'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginTop: 1 }}>
                  {transferRec.current_enrollment.school_name}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {transferRec.current_enrollment.details}
                </div>
              </div>
            </div>

            {/* Previous Institution */}
            {transferRec.previous_institution && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#94a3b8',
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#64748b' }}>
                    PREVIOUS INSTITUTION
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginTop: 1 }}>
                    {transferRec.previous_institution.school_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {transferRec.previous_institution.details}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfileView;
