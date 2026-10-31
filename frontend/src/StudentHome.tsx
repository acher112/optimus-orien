import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  ClipboardCheck,
  ClipboardList,
  MessageSquare,
  BookOpen,
  ArrowRight,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';
import { request } from './api';

interface Props {
  user: any;
  onNavigate: (page: string) => void;
  notify?: (msg: string) => void;
}

export const StudentHome: React.FC<Props> = ({ user, onNavigate, notify }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await request('student/dashboard/');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Could not load student dashboard.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Loading your learning dashboard…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#ef4444', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          {error || 'Unable to load dashboard data.'}
        </div>
        <button
          onClick={loadDashboard}
          style={{
            background: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  const { student, attendance, academic, homework, unread_notifications_count } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* Welcome Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)',
        borderRadius: 20,
        padding: '28px 32px',
        color: '#ffffff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 20,
        boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.2)'
      }}>
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255, 255, 255, 0.12)',
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            marginBottom: 10
          }}>
            <Sparkles size={14} color="#a5b4fc" />
            <span>STUDENT LEARNING WORKSPACE</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#ffffff' }}>
            Welcome back, {student.first_name}!
          </h1>
          <div style={{ fontSize: 14, color: '#c7d2fe', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Class: <b>{student.class_name}</b></span>
            <span>·</span>
            <span>Admission ID: <b>{student.admission_number}</b></span>
            <span>·</span>
            <span>Campus: <b>{student.campus_name}</b></span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => onNavigate('Results & Progress')}
            style={{
              background: '#ffffff',
              color: '#312e81',
              border: 'none',
              borderRadius: 10,
              padding: '12px 20px',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
            }}
          >
            <TrendingUp size={16} /> My Results <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {/* Top 2 Core Indicator Cards (Attendance & Academic) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Attendance Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 16
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Attendance Rate
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 20,
                background: attendance.status.color + '20',
                color: attendance.status.color
              }}>
                {attendance.status.label}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: '#0f172a' }}>
                {attendance.rate !== null ? `${attendance.rate}%` : '—'}
              </span>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                {attendance.formula}
              </span>
            </div>

            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
              {attendance.status.message}
            </p>
          </div>

          <div style={{
            borderTop: '1px solid #f1f5f9',
            paddingTop: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Present: <b>{attendance.attended_days}</b> · Absent: <b>{attendance.absent_days}</b>
            </div>
            <button
              onClick={() => onNavigate('Attendance')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#4f46e5',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              View Attendance <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Academic Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 16
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Academic Progress (AQI)
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 20,
                background: academic.status_color + '20',
                color: academic.status_color
              }}>
                {academic.status}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 900, color: '#0f172a' }}>
                {academic.overall_percentage !== null ? `${academic.overall_percentage}%` : '—'}
              </span>
              {academic.class_average !== null && (
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  Class Avg: {academic.class_average}%
                </span>
              )}
            </div>

            <p style={{ margin: '12px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
              {academic.difference_text ? (
                <span>Performance: <b>{academic.difference_text}</b></span>
              ) : (
                'Review your published grades, term traces, and subject performance.'
              )}
            </p>
          </div>

          <div style={{
            borderTop: '1px solid #f1f5f9',
            paddingTop: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Enrolled Subjects: <b>{academic.subjects_count}</b>
            </div>
            <button
              onClick={() => onNavigate('Results & Progress')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#4f46e5',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              View Report Card <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Middle Grid: Homework & Class Discussion */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Homework Panel */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList size={20} color="#4f46e5" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Homework & Tasks</h3>
            </div>
            <button
              onClick={() => onNavigate('Homework')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#4f46e5',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              View All
            </button>
          </div>

          {homework && homework.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {homework.map((hw: any) => (
                <div
                  key={hw.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{hw.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{hw.subject}</div>
                  </div>
                  {hw.due_date && (
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      background: '#ffffff',
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0'
                    }}>
                      <Clock size={12} /> Due: {hw.due_date}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
              No pending homework assigned. You are all caught up!
            </div>
          )}
        </div>

        {/* Discussion Panel */}
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={20} color="#0891b2" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Class Discussion</h3>
            </div>
            <button
              onClick={() => onNavigate('Discussion')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0891b2',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Open Forum
            </button>
          </div>

          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
            Have a question on mathematics, science, or literature? Post in your moderated class discussion to get answers from classmates and assigned teachers.
          </p>

          <button
            onClick={() => onNavigate('Discussion')}
            style={{
              width: '100%',
              background: '#f0fdfa',
              color: '#0f766e',
              border: '1px solid #ccfbf1',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <MessageSquare size={16} /> Ask or View Class Questions
          </button>
        </div>
      </div>
    </div>
  );
};
