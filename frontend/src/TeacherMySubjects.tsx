import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Award, Users, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { request, type User } from './api';

interface TeacherMySubjectsProps {
  user: User;
  onNavigate: (page: string) => void;
  notify: (msg: string) => void;
}

export default function TeacherMySubjects({ user, onNavigate, notify }: TeacherMySubjectsProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res: any = await request('teacher/my-subjects/');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load subject assignments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 16px', color: '#7862d7' }} />
        <p style={{ color: '#6b7280' }}>Loading your subject teaching classes...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-bar" style={{ margin: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <AlertCircle size={20} />
        <span>{error || 'Unable to load subjects.'}</span>
        <button onClick={load} className="primary-btn" style={{ marginLeft: 'auto', padding: '6px 12px' }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const { cards } = data;

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '4px' }}>
          SUBJECT TEACHER PORTAL
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text-primary, #111827)' }}>
          My Subjects & Teaching Classes
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0' }}>
          View performance, enter marks, and track student coverage for your assigned subjects.
        </p>
      </div>

      {(!cards || cards.length === 0) ? (
        <div style={{ padding: '40px', textAlign: 'center', background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <BookOpen size={32} style={{ color: '#9ca3af', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280' }}>You have no active subject teaching assignments.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {cards.map((c: any) => (
            <div
              key={`${c.class_id}-${c.subject_id}`}
              style={{
                background: 'var(--surface, #fff)',
                borderRadius: '14px',
                border: '1px solid var(--border, #e5e7eb)',
                padding: '20px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: '#dbeafe', color: '#1e40af' }}>
                    {c.code}
                  </span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {c.student_count} learners
                  </span>
                </div>

                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary, #111827)', margin: '0 0 2px' }}>
                  {c.subject_name}
                </h3>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#4b5563', margin: '0 0 16px' }}>
                  {c.class_name}
                </p>

                <div style={{ display: 'flex', gap: '20px', padding: '12px 0', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>CLASS AVERAGE</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: c.average !== null && c.average >= 70 ? '#15803d' : '#374151' }}>
                      {c.average !== null ? `${c.average}%` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>PENDING MARKS</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: c.pending_marks > 0 ? '#b45309' : '#15803d' }}>
                      {c.pending_marks}
                    </div>
                  </div>
                </div>

                {/* Coverage bar */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                    <span>Coverage</span>
                    <span>{c.coverage_pct}%</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${c.coverage_pct}%`, height: '100%', background: '#3b82f6', borderRadius: '3px' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{c.coverage_text}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onNavigate('Examinations')}
                  className="primary-btn"
                  style={{ flex: 1, padding: '7px 12px', fontSize: '13px' }}
                >
                  <Award size={14} style={{ marginRight: '4px' }} /> Enter Marks
                </button>
                <button
                  onClick={() => onNavigate('Homework')}
                  style={{
                    flex: 1, padding: '7px 12px', fontSize: '13px', borderRadius: '8px',
                    border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer'
                  }}
                >
                  Homework
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
