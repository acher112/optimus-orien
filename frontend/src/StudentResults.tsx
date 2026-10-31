import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Award,
  BookOpen,
  HelpCircle,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { request } from './api';

interface Props {
  user: any;
  notify?: (msg: string) => void;
}

export const StudentResults: React.FC<Props> = ({ user, notify }) => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await request('student/results/');
      setProfile(res);
    } catch (err: any) {
      setError(err?.message || 'Could not load academic results.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Loading academic results and AQI profile…</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#ef4444', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          {error || 'Unable to load results.'}
        </div>
        <button
          onClick={loadResults}
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

  const subjects = profile.subjects || [];

  // Prepare chart data comparing Own % vs Class Average
  const chartData = subjects.map((s: any) => ({
    name: s.subject_name,
    'My Score (%)': s.final_percentage !== null ? s.final_percentage : 0,
    'Class Average (%)': s.class_subject_average !== null ? s.class_subject_average : 0
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* Overview Banner */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '24px 28px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 20
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Award size={22} color="#4f46e5" />
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
              My Academic Results & Quality Index
            </h2>
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Class: <b>{profile.class_name}</b> · Academic Year: <b>{profile.academic_year || 'Current'}</b>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              Overall Score
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>
              {profile.overall_percentage !== null ? `${profile.overall_percentage}%` : '—'}
            </div>
          </div>
          {profile.difference_text && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              color: '#334155'
            }}>
              {profile.difference_text}
            </div>
          )}
        </div>
      </div>

      {/* Cohort Averages Comparison Bar */}
      <div style={{
        background: '#f8fafc',
        borderRadius: 14,
        padding: '16px 20px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        {/* Own */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            My Overall
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#64748b', marginTop: 2 }}>
            {profile.overall_percentage !== null ? `${profile.overall_percentage}%` : '—'}
          </div>
        </div>

        {/* Class Average */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
            Class Average
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginTop: 2 }}>
            {profile.class_privacy_notice ? (
              <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{profile.class_privacy_notice}</span>
            ) : (
              profile.class_average !== null ? `${profile.class_average}%` : '—'
            )}
          </div>
        </div>

        {/* Boys Average (Blue) */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
            Boys Average
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb', marginTop: 2 }}>
            {profile.boys_privacy_notice ? (
              <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{profile.boys_privacy_notice}</span>
            ) : (
              profile.boys_class_average !== null ? `${profile.boys_class_average}%` : '—'
            )}
          </div>
        </div>

        {/* Girls Average (Pink) */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#db2777', textTransform: 'uppercase' }}>
            Girls Average
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#db2777', marginTop: 2 }}>
            {profile.girls_privacy_notice ? (
              <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{profile.girls_privacy_notice}</span>
            ) : (
              profile.girls_class_average !== null ? `${profile.girls_class_average}%` : '—'
            )}
          </div>
        </div>
      </div>

      {/* Subject Comparison Chart */}
      {chartData.length > 0 && (
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
            Subject Performance Comparison
          </h3>
          <div style={{ height: 280, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="My Score (%)" fill="#64748b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Class Average (%)" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detailed Subject Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
          Subject Breakdown & Guidance
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {subjects.map((s: any) => (
            <div
              key={s.subject_id}
              style={{
                background: '#ffffff',
                borderRadius: 14,
                padding: 20,
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 14
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                    {s.subject_name}
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 12,
                    background: (s.risk_color || '#64748b') + '20',
                    color: s.risk_color || '#64748b'
                  }}>
                    {s.risk_label || 'Status'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>
                    {s.final_percentage !== null ? `${s.final_percentage}%` : '—'}
                  </span>
                  {s.class_subject_average !== null && (
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Class: {s.class_subject_average}%
                    </span>
                  )}
                  {s.difference_pp !== null && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: s.difference_pp >= 0 ? '#16a34a' : '#dc2626'
                    }}>
                      {s.difference_pp >= 0 ? `+${s.difference_pp} pp` : `${s.difference_pp} pp`}
                    </span>
                  )}
                </div>

                <div style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: '#475569',
                  background: '#f8fafc',
                  padding: '8px 12px',
                  borderRadius: 8,
                  lineHeight: 1.4
                }}>
                  {s.guidance}
                </div>
              </div>

              {/* Term breakdown chips */}
              {s.terms_trace && s.terms_trace.length > 0 && (
                <div style={{
                  borderTop: '1px solid #f1f5f9',
                  paddingTop: 10,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap'
                }}>
                  {s.terms_trace.map((t: any) => (
                    <span
                      key={t.term_id}
                      style={{
                        fontSize: 11,
                        background: '#f1f5f9',
                        padding: '2px 8px',
                        borderRadius: 6,
                        color: '#475569'
                      }}
                    >
                      {t.term_name}: <b>{t.obtained_percentage !== null ? `${t.obtained_percentage}%` : '—'}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
