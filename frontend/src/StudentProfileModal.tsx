import React, { useEffect, useState } from 'react';
import {
  X, User, Phone, Calendar, Award, BookOpen, Clock,
  GraduationCap, AlertCircle, RefreshCw, CheckCircle2,
  Printer, KeyRound, Building2, Users, HeartHandshake, ShieldCheck
} from 'lucide-react';
import { request } from './api';

interface StudentProfileData {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  father_name: string;
  mother_name: string;
  guardian_phone: string;
  gender: string;
  date_of_birth: string | null;
  enrolled_on: string | null;
  school_id: number;
  school_name: string;
  school_code: string;
  class_id: number | null;
  class_name: string;
  section: string;
  class_teacher_name: string;
  academic_year: string;
  active: boolean;
  guardians: Array<{ id: number; name: string; email: string }>;
  username: string | null;
  has_account: boolean;
  must_change_password: boolean;
  attendance_summary: {
    rate: number;
    attended_days: number;
    held_days: number;
    present_count: number;
    late_count: number;
    absent_count: number;
    leave_count: number;
    formula: string;
  };
  academic_summary: {
    overall_percentage: number | null;
    class_average: number | null;
    difference: number | null;
    difference_text: string | null;
    status: string;
    subjects: Array<{
      subject_id: number;
      subject_name: string;
      final_percentage: number | null;
      class_subject_average: number | null;
      difference: number | null;
      risk_level: string;
      risk_label: string;
      risk_color: string;
      guidance: string;
    }>;
    boys_class_average?: number | null;
    girls_class_average?: number | null;
  };
  recent_grades: Array<{
    assessment_title: string;
    subject_name: string;
    marks: number;
    max_marks: number;
    percentage: number | null;
    date: string | null;
  }>;
}

interface Props {
  studentId: number | null;
  onClose: () => void;
  notify?: (msg: string) => void;
}

export function StudentProfileModal({ studentId, onClose, notify }: Props) {
  const [profile, setProfile] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'bio' | 'academics' | 'attendance'>('bio');

  useEffect(() => {
    if (!studentId) return;
    loadProfile(studentId);
  }, [studentId]);

  const loadProfile = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await request<StudentProfileData>(`student/profile/?student_id=${id}`);
      setProfile(res);
    } catch (err: any) {
      setError(err?.message || 'Could not load student profile.');
    } finally {
      setLoading(false);
    }
  };

  if (!studentId) return null;

  const initials = (name: string) => {
    if (!name) return 'ST';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const handlePrint = () => {
    window.print();
  };

  const genderLabel = (g?: string) => {
    if (g === 'male') return { label: 'Boy', color: '#2563eb', bg: '#dbeafe', border: '#bfdbfe' };
    if (g === 'female') return { label: 'Girl', color: '#db2777', bg: '#fce7f3', border: '#fbcfe8' };
    return { label: g ? g.charAt(0).toUpperCase() + g.slice(1) : 'Not recorded', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  };

  const gInfo = profile ? genderLabel(profile.gender) : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 820,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          animation: 'fadeIn 0.18s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
          color: '#ffffff',
          padding: '22px 24px',
          position: 'relative'
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '50%',
              width: 34,
              height: 34,
              color: '#ffffff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <RefreshCw size={24} className="spin" />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Loading comprehensive student profile…</span>
            </div>
          ) : profile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: profile.gender === 'female' ? '#fdf2f8' : profile.gender === 'male' ? '#eff6ff' : '#ffffff',
                color: profile.gender === 'female' ? '#db2777' : profile.gender === 'male' ? '#2563eb' : '#4f46e5',
                border: `2px solid ${profile.gender === 'female' ? '#fbcfe8' : profile.gender === 'male' ? '#bfdbfe' : '#e2e8f0'}`,
                fontSize: 22,
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                flexShrink: 0
              }}>
                {initials(profile.full_name)}
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
                    {profile.full_name}
                  </h2>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 800,
                    background: gInfo?.bg,
                    color: gInfo?.color,
                    border: `1px solid ${gInfo?.border || 'transparent'}`,
                    padding: '2px 8px',
                    borderRadius: 12
                  }}>
                    {gInfo?.label}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: profile.active ? '#dcfce7' : '#fee2e2',
                    color: profile.active ? '#15803d' : '#b91c1c',
                    padding: '2px 8px',
                    borderRadius: 12
                  }}>
                    {profile.active ? 'Active Learner' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12, opacity: 0.9 }}>
                  <span>Admission ID: <b>{profile.admission_number}</b></span>
                  <span>Campus: <b>{profile.school_name}</b></span>
                  <span>Class: <b>{profile.class_name}</b></span>
                  {profile.class_teacher_name && profile.class_teacher_name !== 'Not assigned yet' && (
                    <span>Teacher: <b>{profile.class_teacher_name}</b></span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Navigation Tabs */}
        {profile && (
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            padding: '0 20px'
          }}>
            <button
              onClick={() => setActiveTab('bio')}
              style={{
                background: 'none',
                border: 'none',
                padding: '14px 16px',
                fontSize: 13,
                fontWeight: 700,
                color: activeTab === 'bio' ? '#4f46e5' : '#64748b',
                borderBottom: activeTab === 'bio' ? '3px solid #4f46e5' : '3px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <User size={15} /> Personal & Family Details
            </button>
            <button
              onClick={() => setActiveTab('academics')}
              style={{
                background: 'none',
                border: 'none',
                padding: '14px 16px',
                fontSize: 13,
                fontWeight: 700,
                color: activeTab === 'academics' ? '#4f46e5' : '#64748b',
                borderBottom: activeTab === 'academics' ? '3px solid #4f46e5' : '3px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Award size={15} /> Academic & Subject Performance
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              style={{
                background: 'none',
                border: 'none',
                padding: '14px 16px',
                fontSize: 13,
                fontWeight: 700,
                color: activeTab === 'attendance' ? '#4f46e5' : '#64748b',
                borderBottom: activeTab === 'attendance' ? '3px solid #4f46e5' : '3px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Clock size={15} /> Attendance Overview
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
              <RefreshCw size={32} className="spin" style={{ margin: '0 auto 12px', display: 'block', color: '#6366f1' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>Assembling student record and historical performance…</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <AlertCircle size={36} color="#ef4444" style={{ margin: '0 auto 12px', display: 'block' }} />
              <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{error}</div>
              <button
                onClick={() => loadProfile(studentId)}
                style={{
                  background: '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 18px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Retry
              </button>
            </div>
          ) : profile ? (
            <>
              {/* TAB 1: BIO & FAMILY */}
              {activeTab === 'bio' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Basic Personal Info */}
                  <div style={{
                    background: '#f8fafc',
                    borderRadius: 14,
                    padding: 20,
                    border: '1px solid #e2e8f0'
                  }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Learner Information
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>First Name</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{profile.first_name || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Last Name</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{profile.last_name || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Gender</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: gInfo?.color }}>
                          {gInfo?.label}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Date of Birth</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{profile.date_of_birth || 'Not recorded'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Admission Date</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{profile.enrolled_on || '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Academic Year</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{profile.academic_year || 'Current'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Parents and Family Details */}
                  <div style={{
                    background: '#f8fafc',
                    borderRadius: 14,
                    padding: 20,
                    border: '1px solid #e2e8f0'
                  }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Parents & Guardian Details
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Father's Name</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{profile.father_name || 'Not provided'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Mother's Name</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{profile.mother_name || 'Not provided'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Primary Contact Phone</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: profile.guardian_phone ? '#2563eb' : '#0f172a' }}>
                          {profile.guardian_phone ? (
                            <a href={`tel:${profile.guardian_phone}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                              {profile.guardian_phone}
                            </a>
                          ) : 'Not provided'}
                        </div>
                      </div>
                    </div>

                    {profile.guardians && profile.guardians.length > 0 && (
                      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                          Linked Parent Portal Accounts:
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {profile.guardians.map(g => (
                            <div key={g.id} style={{
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              padding: '6px 12px',
                              borderRadius: 8,
                              fontSize: 12,
                              color: '#334155'
                            }}>
                              <b>{g.name}</b> ({g.email})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Portal Login Credentials */}
                  <div style={{
                    background: '#f8fafc',
                    borderRadius: 14,
                    padding: 20,
                    border: '1px solid #e2e8f0'
                  }}>
                    <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Student Portal Credentials
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Portal Username</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#4f46e5' }}>
                          {profile.username || 'No portal user account'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Account Status</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: profile.has_account ? '#16a34a' : '#94a3b8' }}>
                          {profile.has_account ? 'Active Portal Account' : 'Not Provisioned'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Temporary Password</div>
                        <div style={{ fontSize: 13, color: '#64748b' }}>
                          {profile.must_change_password ? 'Password change required on login' : 'Configured / Custom password'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ACADEMIC & SUBJECTS */}
              {activeTab === 'academics' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Academic Score Header */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
                    borderRadius: 16,
                    padding: '20px 24px',
                    border: '1px solid #c7d2fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 16
                  }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Cumulative Academic Performance
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: '#1e1b4b', marginTop: 4 }}>
                        {profile.academic_summary?.overall_percentage !== null ? `${profile.academic_summary.overall_percentage}%` : 'Pending Grades'}
                      </div>
                      {profile.academic_summary?.difference_text && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#4338ca', marginTop: 2 }}>
                          {profile.academic_summary.difference_text}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 20 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Class Average</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#334155' }}>
                          {profile.academic_summary?.class_average !== null ? `${profile.academic_summary.class_average}%` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subject Breakdown Cards */}
                  <div>
                    <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                      Subjects Breakdown & Guidance
                    </h3>
                    {(profile.academic_summary?.subjects || []).length === 0 ? (
                      <div style={{
                        background: '#f8fafc',
                        borderRadius: 12,
                        padding: 24,
                        textAlign: 'center',
                        color: '#64748b',
                        border: '1px solid #e2e8f0'
                      }}>
                        <BookOpen size={28} color="#94a3b8" style={{ marginBottom: 6, display: 'inline-block' }} />
                        <div style={{ fontWeight: 700, color: '#334155' }}>No published subject grades yet</div>
                        <div style={{ fontSize: 12 }}>Assessments for this class have not been finalized or published yet.</div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                        {profile.academic_summary.subjects.map(s => (
                          <div key={s.subject_id} style={{
                            background: '#ffffff',
                            borderRadius: 12,
                            padding: 16,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <strong style={{ fontSize: 14, color: '#0f172a' }}>{s.subject_name}</strong>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 800,
                                background: `${s.risk_color}18`,
                                color: s.risk_color,
                                padding: '2px 8px',
                                borderRadius: 10
                              }}>
                                {s.risk_label}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                              <span>Score: <b style={{ color: '#0f172a' }}>{s.final_percentage !== null ? `${s.final_percentage}%` : '—'}</b></span>
                              <span>Class Avg: <b>{s.class_subject_average !== null ? `${s.class_subject_average}%` : '—'}</b></span>
                            </div>
                            {s.guidance && (
                              <div style={{ fontSize: 11, color: '#475569', background: '#f8fafc', padding: '6px 10px', borderRadius: 6, marginTop: 6, lineHeight: 1.4 }}>
                                {s.guidance}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Assessment Grades */}
                  {profile.recent_grades && profile.recent_grades.length > 0 && (
                    <div>
                      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                        Recent Assessment Marks
                      </h3>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                              <th style={{ padding: '10px 14px' }}>Assessment</th>
                              <th style={{ padding: '10px 14px' }}>Subject</th>
                              <th style={{ padding: '10px 14px' }}>Score</th>
                              <th style={{ padding: '10px 14px' }}>Percentage</th>
                              <th style={{ padding: '10px 14px' }}>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {profile.recent_grades.map((g, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>{g.assessment_title}</td>
                                <td style={{ padding: '10px 14px', color: '#475569' }}>{g.subject_name}</td>
                                <td style={{ padding: '10px 14px', fontWeight: 700 }}>{g.marks} / {g.max_marks}</td>
                                <td style={{ padding: '10px 14px' }}>
                                  <span style={{ fontWeight: 800, color: (g.percentage || 0) >= 60 ? '#16a34a' : '#dc2626' }}>
                                    {g.percentage !== null ? `${g.percentage}%` : '—'}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 14px', color: '#64748b' }}>{g.date || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: ATTENDANCE */}
              {activeTab === 'attendance' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    borderRadius: 16,
                    padding: '20px 24px',
                    border: '1px solid #bbf7d0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 16
                  }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Attendance Standing
                      </div>
                      <div style={{ fontSize: 32, fontWeight: 900, color: '#14532d', marginTop: 4 }}>
                        {profile.attendance_summary.rate}%
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginTop: 2 }}>
                        {profile.attendance_summary.formula}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ background: '#ffffff', padding: '10px 16px', borderRadius: 10, textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 800 }}>PRESENT</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a' }}>{profile.attendance_summary.present_count}</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '10px 16px', borderRadius: 10, textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 11, color: '#d97706', fontWeight: 800 }}>LATE</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#d97706' }}>{profile.attendance_summary.late_count}</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '10px 16px', borderRadius: 10, textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 800 }}>ABSENT</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626' }}>{profile.attendance_summary.absent_count}</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '10px 16px', borderRadius: 10, textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 800 }}>LEAVES</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#2563eb' }}>{profile.attendance_summary.leave_count}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    background: '#f8fafc',
                    borderRadius: 14,
                    padding: 16,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    color: '#64748b',
                    lineHeight: 1.5
                  }}>
                    💡 <b>Policy Note:</b> Approved excused leaves are excluded from the attendance denominator per institution policy. Students with attendance rate below 75% are automatically flagged for attendance reviews.
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e2e8f0',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={handlePrint}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            <Printer size={15} /> Print Record
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
export default StudentProfileModal;
