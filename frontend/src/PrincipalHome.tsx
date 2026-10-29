import React, { useCallback, useEffect, useState } from 'react';
import {
  GraduationCap, ClipboardCheck, Users, Award, AlertTriangle,
  Building2, CheckCircle2, ChevronRight, RefreshCw, AlertCircle, KeyRound,
  FileBarChart, ArrowUpRight, BookOpen, ShieldAlert, Clock, UserCheck
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { request, type User } from './api';
import StaffAttendanceRegister from './StaffAttendanceRegister';

interface PrincipalHomeProps {
  user: User;
  onNavigate: (page: string) => void;
  notify: (msg: string) => void;
}

interface DashboardPayload {
  campus: {
    id: number;
    name: string;
    code: string;
    city: string;
    currency: string;
  };
  kpi: {
    total_students: number;
    today_attendance_rate: number | null;
    total_teachers: number;
    total_staff: number;
    total_classes: number;
    academic_average: number | null;
  };
  needs_attention: {
    unsubmitted_registers_count: number;
    unsubmitted_registers: Array<{
      class_id: number;
      class_name: string;
      grade_level: string;
      teacher: string;
    }>;
    results_awaiting_approval_count: number;
    results_awaiting_approval: Array<{
      type: string;
      id: number | null;
      title: string;
      detail: string;
    }>;
    open_review_cases_count: number;
    open_review_cases: Array<{
      id: number;
      student_name: string;
      reason: string;
      status: string;
      priority: string;
      assignee: string;
      created_at: string;
    }>;
  };
  class_comparison: Array<{
    id: number;
    name: string;
    grade_level: string;
    teacher: string;
    students: number;
    attendance_rate: number | null;
    academic_average: number | null;
  }>;
  subject_averages: Array<{
    code: string;
    name: string;
    average: number | null;
    students_assessed: number;
  }>;
  gender_performance: {
    boys_average: number | null;
    boys_count: number;
    girls_average: number | null;
    girls_count: number;
    difference: number | null;
    note: string;
  };
}

export default function PrincipalHome({ user, onNavigate, notify }: PrincipalHomeProps) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'classes' | 'subjects' | 'gender'>('classes');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<DashboardPayload>('principal/dashboard/');
      setData(res);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not load principal dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading && !data) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
        <RefreshCw size={28} className="spin" style={{ color: 'var(--brand-primary, #715ee8)' }} />
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary, #666)' }}>
          Loading your campus dashboard…
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="error-bar" style={{ margin: '2rem 0' }}>
        <AlertCircle size={20} />
        <span>{error}</span>
        <button onClick={loadDashboard} className="outline-btn" style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const kpi = data?.kpi;
  const attention = data?.needs_attention;
  const classes = data?.class_comparison || [];
  const subjects = data?.subject_averages || [];
  const gender = data?.gender_performance;

  const totalAttentionItems =
    (attention?.unsubmitted_registers_count || 0) +
    (attention?.results_awaiting_approval_count || 0) +
    (attention?.open_review_cases_count || 0);

  return (
    <div className="principal-portal-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Welcome & Campus Lock Header */}
      <div className="welcome-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--brand-primary, #715ee8)', fontWeight: 600 }}>
            <Building2 size={15} />
            <span>CAMPUS HEADMASTER PORTAL</span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(113, 94, 232, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              Isolated Campus Scope
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.25rem 0' }}>
            {data?.campus.name || 'Campus Overview'}
          </h1>
          <p style={{ color: 'var(--text-secondary, #64748b)', margin: 0, fontSize: '0.92rem' }}>
            {data?.campus.city ? `${data.campus.city} · ` : ''}Monitoring daily campus operations, instructional delivery, and student progress.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="outline-btn" onClick={() => onNavigate('Settings')} title="Security and password settings">
            <KeyRound size={15} /> Security & Password
          </button>
          <button className="outline-btn" onClick={loadDashboard} title="Refresh dashboard data">
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="primary-btn" onClick={() => onNavigate('Examinations')}>
            <Award size={16} /> Examination Engine
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="stat-card" style={{ background: 'var(--card-bg, #fff)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#6366f1' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>STUDENTS</span>
            <GraduationCap size={20} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.5rem' }}>
            {kpi?.total_students ?? 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.25rem' }}>
            Enrolled in active cohorts
          </div>
        </div>

        <div className="stat-card" style={{ background: 'var(--card-bg, #fff)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#0ea5e9' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>TODAY'S ATTENDANCE</span>
            <ClipboardCheck size={20} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.5rem', color: (kpi?.today_attendance_rate ?? 0) >= 85 ? '#10b981' : (kpi?.today_attendance_rate === null ? 'var(--text-muted, #94a3b8)' : '#f59e0b') }}>
            {kpi?.today_attendance_rate !== null ? `${kpi?.today_attendance_rate}%` : 'Pending'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.25rem' }}>
            {attention?.unsubmitted_registers_count ? `${attention.unsubmitted_registers_count} registers pending` : 'All registers recorded'}
          </div>
        </div>

        <div className="stat-card" style={{ background: 'var(--card-bg, #fff)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#10b981' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>FACULTY & STAFF</span>
            <Users size={20} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.5rem' }}>
            {kpi?.total_teachers ?? 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.25rem' }}>
            {kpi?.total_staff ?? 0} total active staff
          </div>
        </div>

        <div className="stat-card" style={{ background: 'var(--card-bg, #fff)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#8b5cf6' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>CLASSES</span>
            <BookOpen size={20} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.5rem' }}>
            {kpi?.total_classes ?? 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.25rem' }}>
            Active instructional classrooms
          </div>
        </div>

        <div className="stat-card" style={{ background: 'var(--card-bg, #fff)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#f59e0b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>ACADEMIC AVERAGE</span>
            <Award size={20} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, marginTop: '0.5rem' }}>
            {kpi?.academic_average !== null ? `${kpi?.academic_average}%` : '—'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #64748b)', marginTop: '0.25rem' }}>
            Campus-wide student results
          </div>
        </div>
      </div>

      {/* Needs Attention Panel */}
      <div className="panel" style={{ background: 'var(--card-bg, #fff)', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} style={{ color: totalAttentionItems > 0 ? '#f59e0b' : '#10b981' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Operational Attention Items</h2>
            {totalAttentionItems > 0 ? (
              <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '10px' }}>
                {totalAttentionItems} item{totalAttentionItems === 1 ? '' : 's'}
              </span>
            ) : (
              <span style={{ background: '#d1fae5', color: '#065f46', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '10px' }}>
                All clear
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
            Routine academic and operational checks
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {/* 1. Attendance Registers */}
          <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '1rem', background: 'var(--bg-subtle, #f8fafc)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={15} color="#6366f1" /> Daily Attendance Registers
              </strong>
              <button
                className="outline-btn"
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                onClick={() => onNavigate('Attendance')}
              >
                Go to Attendance
              </button>
            </div>
            {attention?.unsubmitted_registers && attention.unsubmitted_registers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.82rem', color: '#b45309', margin: '0 0 0.5rem 0' }}>
                  {attention.unsubmitted_registers.length} classroom register{attention.unsubmitted_registers.length === 1 ? '' : 's'} not recorded today:
                </p>
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {attention.unsubmitted_registers.map(r => (
                    <div key={r.class_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                      <span><b>{r.class_name}</b> <small style={{ color: '#64748b' }}>({r.grade_level})</small></span>
                      <span style={{ color: '#475569', fontSize: '0.78rem' }}>Teacher: {r.teacher}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#059669', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                <CheckCircle2 size={16} /> All daily classroom registers recorded.
              </div>
            )}
          </div>

          {/* 2. Examination & Results Moderation */}
          <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '1rem', background: 'var(--bg-subtle, #f8fafc)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Award size={15} color="#f59e0b" /> Results & Exam Configurations
              </strong>
              <button
                className="outline-btn"
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                onClick={() => onNavigate('Examinations')}
              >
                Go to Exams
              </button>
            </div>
            {attention?.results_awaiting_approval && attention.results_awaiting_approval.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.82rem', color: '#b45309', margin: '0 0 0.5rem 0' }}>
                  Pending moderation or publication:
                </p>
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {attention.results_awaiting_approval.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                      <div>
                        <b>{item.title}</b>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{item.detail}</div>
                      </div>
                      <button className="outline-btn" style={{ fontSize: '0.72rem', padding: '2px 6px' }} onClick={() => onNavigate('Examinations')}>
                        Review
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#059669', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                <CheckCircle2 size={16} /> All examination configurations and results are up to date.
              </div>
            )}
          </div>

          {/* 3. Open Student Cases */}
          <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '1rem', background: 'var(--bg-subtle, #f8fafc)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ShieldAlert size={15} color="#ef4444" /> Student Support Cases
              </strong>
              <button
                className="outline-btn"
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                onClick={() => onNavigate('Review cases')}
              >
                Review Cases
              </button>
            </div>
            {attention?.open_review_cases && attention.open_review_cases.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.82rem', color: '#b45309', margin: '0 0 0.5rem 0' }}>
                  {attention.open_review_cases.length} student intervention case{attention.open_review_cases.length === 1 ? '' : 's'} in progress:
                </p>
                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {attention.open_review_cases.map(c => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                      <div>
                        <b>{c.student_name}</b>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{c.reason}</div>
                      </div>
                      <span className={`pill ${c.priority === 'high' ? 'red' : 'yellow'}`} style={{ fontSize: '0.7rem' }}>
                        {c.priority}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#059669', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                <CheckCircle2 size={16} /> No pending review or escalation cases.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Staff Attendance Register (Daily Staff Register) */}
      <StaffAttendanceRegister user={user} notify={notify} />

      {/* Academic Performance & Analytics Section */}
      <div className="panel" style={{ background: 'var(--card-bg, #fff)', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Campus Academic Performance</h2>
            <p style={{ color: 'var(--text-secondary, #64748b)', margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
              Comparative insights across cohorts, instructional subjects, and learner demographics.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-subtle, #f1f5f9)', padding: '3px', borderRadius: '8px' }}>
            <button
              className={`pill-btn ${activeTab === 'classes' ? 'active' : ''}`}
              style={{
                background: activeTab === 'classes' ? '#fff' : 'transparent',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeTab === 'classes' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
              onClick={() => setActiveTab('classes')}
            >
              Class Comparison ({classes.length})
            </button>
            <button
              className={`pill-btn ${activeTab === 'subjects' ? 'active' : ''}`}
              style={{
                background: activeTab === 'subjects' ? '#fff' : 'transparent',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeTab === 'subjects' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
              onClick={() => setActiveTab('subjects')}
            >
              Subject Averages ({subjects.length})
            </button>
            <button
              className={`pill-btn ${activeTab === 'gender' ? 'active' : ''}`}
              style={{
                background: activeTab === 'gender' ? '#fff' : 'transparent',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeTab === 'gender' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
              onClick={() => setActiveTab('gender')}
            >
              Cohort Distribution
            </button>
          </div>
        </div>

        {/* Tab 1: Class Comparison */}
        {activeTab === 'classes' && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>CLASS</th>
                  <th>GRADE LEVEL</th>
                  <th>LEAD TEACHER</th>
                  <th>STUDENTS</th>
                  <th>ATTENDANCE RATE</th>
                  <th>ACADEMIC AVERAGE</th>
                </tr>
              </thead>
              <tbody>
                {classes.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td>{c.grade_level || '—'}</td>
                    <td>{c.teacher}</td>
                    <td>{c.students}</td>
                    <td>
                      {c.attendance_rate !== null ? (
                        <span className={`pill ${c.attendance_rate >= 85 ? 'green' : c.attendance_rate >= 75 ? 'yellow' : 'red'}`}>
                          {c.attendance_rate}%
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      {c.academic_average !== null ? (
                        <strong style={{ color: c.academic_average >= 60 ? 'inherit' : '#ef4444' }}>
                          {c.academic_average}%
                        </strong>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Pending marks</span>
                      )}
                    </td>
                  </tr>
                ))}
                {classes.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                      No classrooms configured for this campus.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Subject Averages */}
        {activeTab === 'subjects' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {subjects.length > 0 && (
              <div style={{ height: 260, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjects} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color, #e2e8f0)" />
                    <XAxis dataKey="code" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: any) => [`${val}%`, 'Campus Average']}
                      labelFormatter={(code) => {
                        const s = subjects.find(sub => sub.code === code);
                        return s ? `${s.name} (${s.code})` : String(code);
                      }}
                    />
                    <Bar dataKey="average" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SUBJECT CODE</th>
                    <th>SUBJECT NAME</th>
                    <th>STUDENTS ASSESSED</th>
                    <th>CAMPUS AVERAGE</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(s => (
                    <tr key={s.code}>
                      <td><code>{s.code}</code></td>
                      <td><b>{s.name}</b></td>
                      <td>{s.students_assessed}</td>
                      <td>
                        {s.average !== null ? (
                          <strong>{s.average}%</strong>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>No recorded marks</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {subjects.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                        No subject assessments recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Gender Performance Analysis (Objective and Non-blaming) */}
        {activeTab === 'gender' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '1.25rem', background: 'var(--bg-subtle, #f8fafc)' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>BOYS COHORT</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.5rem 0', color: '#0284c7' }}>
                  {gender?.boys_average !== null ? `${gender?.boys_average}%` : '—'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {gender?.boys_count ?? 0} students evaluated
                </div>
              </div>

              <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '1.25rem', background: 'var(--bg-subtle, #f8fafc)' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>GIRLS COHORT</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.5rem 0', color: '#ec4899' }}>
                  {gender?.girls_average !== null ? `${gender?.girls_average}%` : '—'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {gender?.girls_count ?? 0} students evaluated
                </div>
              </div>

              <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', padding: '1.25rem', background: 'var(--bg-subtle, #f8fafc)' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>COHORT VARIANCE</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.5rem 0', color: '#475569' }}>
                  {gender?.difference !== null ? `${gender?.difference}%` : '—'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {gender && gender.difference !== null && gender.difference <= 2.0 ? 'Even cohort parity' : 'Cohort variance'}
                </div>
              </div>
            </div>

            <div style={{ background: '#f8fafc', borderLeft: '4px solid #6366f1', padding: '1rem', borderRadius: '0 8px 8px 0', fontSize: '0.88rem', color: '#334155' }}>
              <strong>Instructional Guidance:</strong>
              <p style={{ margin: '0.35rem 0 0' }}>
                {gender?.note}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Navigation Shortcuts */}
      <div className="panel" style={{ background: 'var(--card-bg, #fff)', borderRadius: '10px', border: '1px solid var(--border-color, #e2e8f0)', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 1rem 0' }}>Principal Navigation Shortcuts</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <button
            className="outline-btn"
            style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', textAlign: 'left' }}
            onClick={() => onNavigate('Examinations')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={16} color="#6366f1" /> Examinations
            </span>
            <ChevronRight size={15} />
          </button>

          <button
            className="outline-btn"
            style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', textAlign: 'left' }}
            onClick={() => onNavigate('Attendance')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClipboardCheck size={16} color="#0ea5e9" /> Daily Attendance
            </span>
            <ChevronRight size={15} />
          </button>

          <button
            className="outline-btn"
            style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', textAlign: 'left' }}
            onClick={() => onNavigate('Students at Risk')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} color="#f59e0b" /> Students at Risk
            </span>
            <ChevronRight size={15} />
          </button>

          <button
            className="outline-btn"
            style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', textAlign: 'left' }}
            onClick={() => onNavigate('Classes')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={16} color="#10b981" /> Classes & Cohorts
            </span>
            <ChevronRight size={15} />
          </button>

          <button
            className="outline-btn"
            style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', textAlign: 'left' }}
            onClick={() => onNavigate('Staff')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={16} color="#8b5cf6" /> Staff Directory
            </span>
            <ChevronRight size={15} />
          </button>

          <button
            className="outline-btn"
            style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', textAlign: 'left' }}
            onClick={() => onNavigate('Reports')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileBarChart size={16} color="#ec4899" /> Campus Reports
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
