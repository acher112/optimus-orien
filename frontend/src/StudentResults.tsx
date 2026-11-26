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
import { getScoreColorStyle, getRiskBadgeStyle, getDifferenceStyle } from './performanceColors';

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
          className="primary-btn"
          style={{
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
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              {profile.overall_percentage !== null ? (
                <span className="score-pill" style={{ ...getScoreColorStyle(profile.overall_percentage), fontSize: 22, padding: '3px 10px' }}>
                  {profile.overall_percentage}%
                </span>
              ) : '—'}
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

        {subjects.length === 0 ? (
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: 32,
            border: '1px solid #e2e8f0',
            textAlign: 'center',
            color: '#64748b'
          }}>
            <BookOpen size={32} color="#94a3b8" style={{ marginBottom: 10, display: 'inline-block' }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
              No assessment results yet
            </div>
            <div style={{ fontSize: 13 }}>
              Your teacher has not published results for any subjects yet. Once assessments are graded and published, your subject-wise grades, class comparisons, and progress guidance will appear here.
            </div>
          </div>
        ) : (
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
                  {(() => {
                    const rLevel = (s.risk_level || s.risk_label || '').toLowerCase();
                    const badge = getRiskBadgeStyle(rLevel.includes('support') || rLevel.includes('high') ? 'high' : rLevel.includes('watch') || rLevel.includes('med') ? 'medium' : 'low');
                    return (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 12,
                        background: badge.background,
                        color: badge.color,
                        border: `1px solid ${badge.borderColor}`
                      }}>
                        {s.risk_label || 'Status'}
                      </span>
                    );
                  })()}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                  {s.final_percentage !== null ? (
                    <span className="score-pill" style={{ ...getScoreColorStyle(s.final_percentage), fontSize: 20, padding: '3px 10px' }}>
                      {s.final_percentage}%
                    </span>
                  ) : (
                    <span style={{ fontSize: 28, fontWeight: 900, color: '#94a3b8' }}>—</span>
                  )}
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
      )}
      </div>

      {/* Online Quiz & Competition Performance Record */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: 24,
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Award size={18} color="#7c3aed" /> Online Quiz &amp; Assessment Record
            </h3>
            <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
              Automatically recorded upon completing any campus or worldwide online quiz.
            </div>
          </div>
          {profile.quiz_summary && (
            <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: '#334155', flexWrap: 'wrap' }}>
              <span>Attempted: <b>{profile.quiz_summary.total_attempted || 0}</b></span>
              {profile.quiz_summary.average_score !== null && (
                <span>Average: <b style={{ color: '#7c3aed' }}>{profile.quiz_summary.average_score}%</b></span>
              )}
              {profile.quiz_summary.best_score !== null && (
                <span>Best: <b style={{ color: '#059669' }}>{profile.quiz_summary.best_score}%</b></span>
              )}
            </div>
          )}
        </div>

        {!profile.quiz_performance || profile.quiz_performance.length === 0 ? (
          <div style={{ padding: 20, borderRadius: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', textAlign: 'center', fontSize: 13, color: '#64748b' }}>
            No online quizzes attempted yet. Visit <strong>Online Assessments</strong> to attempt a quiz and record your score!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '10px 12px' }}>Quiz</th>
                  <th style={{ padding: '10px 12px' }}>Subject &amp; Difficulty</th>
                  <th style={{ padding: '10px 12px' }}>Scope</th>
                  <th style={{ padding: '10px 12px' }}>Score</th>
                  <th style={{ padding: '10px 12px' }}>Accuracy</th>
                  <th style={{ padding: '10px 12px' }}>Speed</th>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {profile.quiz_performance.map((qp: any) => (
                  <tr key={qp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>{qp.title}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{qp.subject} • {qp.difficulty}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 12 }}>{qp.scope_label}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: '#7c3aed' }}>{qp.score_percentage}%</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#059669' }}>{qp.accuracy_percentage}%</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{qp.time_display}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{qp.submitted_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
