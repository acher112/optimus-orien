import React, { useCallback, useEffect, useState } from 'react';
import {
  GraduationCap, ClipboardCheck, BookOpen, FileBarChart, AlertTriangle,
  CheckCircle2, ChevronRight, RefreshCw, AlertCircle, ArrowUpRight,
  ClipboardList, Clock, Users, ArrowRight, TrendingDown, Award
} from 'lucide-react';
import { request, type User } from './api';

interface TeacherHomeProps {
  user: User;
  onNavigate: (page: string) => void;
  notify: (msg: string) => void;
}

interface TeacherDashboardPayload {
  has_assignments: boolean;
  message?: string;
  teacher_type: string;
  homeroom_class?: {
    id: number;
    name: string;
    student_count: number;
    register_today: 'submitted' | 'pending';
    attendance_rate: number | null;
    open_review_cases: number;
  } | null;
  badges: Array<{
    type: string;
    label: string;
    class_id: number;
    class_name: string;
    subject_id?: number;
    subject_name?: string;
    school_id?: number;
    school_name?: string;
  }>;
  kpis: {
    classes: number;
    subjects: number;
    students: number;
    unsubmitted_registers: number;
    pending_marks: number;
    homework_to_review: number;
  };
  assignments: Array<{
    id: string;
    kind: 'class_teacher' | 'subject_teacher';
    role_label: string;
    class_id: number;
    class_name: string;
    school_name?: string;
    subject_id: number | null;
    subject_name: string;
    student_count: number;
    register_today?: 'submitted' | 'pending' | null;
  }>;
  tasks: {
    registers_to_submit: Array<{ class_id: number; class_name: string; date: string }>;
    marks_to_enter: Array<{
      assessment_id: number;
      title: string;
      class_id: number;
      class_name: string;
      subject_id: number;
      subject_name: string;
      date: string;
      missing_count: number;
      eligible_count: number;
      graded_count: number;
    }>;
    homework_to_review: Array<{
      submission_id: number;
      homework_id: number;
      title: string;
      class_name: string;
      subject_name: string;
      student_name: string;
      due_date: string;
    }>;
    awaiting_approval: Array<{
      assessment_id: number;
      title: string;
      class_name: string;
      subject_name: string;
      date: string;
      grades_count: number;
    }>;
  };
  subject_averages: Array<{
    class_id: number;
    class_name: string;
    subject_id: number;
    subject_name: string;
    average: number | null;
    valid_students: number;
    total_students: number;
    coverage_pct: number;
    coverage_text: string;
    is_class_teacher: boolean;
    teaches_subject: boolean;
  }>;
  students_with_decline: Array<{
    student_id: number;
    student_name: string;
    admission_number: string;
    gender: string;
    class_name: string;
    subject_name: string;
    latest_score: number;
    prior_average: number;
    decline_delta: number;
    assessment_title: string;
  }>;
  recent_activity: Array<{
    kind: string;
    title: string;
    date: string;
    target: string;
  }>;
}

export default function TeacherHome({ user, onNavigate, notify }: TeacherHomeProps) {
  const [data, setData] = useState<TeacherDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'assignments' | 'subjects' | 'tasks'>('assignments');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<TeacherDashboardPayload>('teacher/dashboard/');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load teacher dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="principal-loading" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 16px', color: '#7862d7' }} />
        <p style={{ color: '#6b7280', fontSize: '15px' }}>Loading teacher portal dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-bar" style={{ margin: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <AlertCircle size={20} />
        <span>{error || 'Unable to load dashboard data.'}</span>
        <button onClick={load} className="primary-btn" style={{ marginLeft: 'auto', padding: '6px 12px' }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (!data.has_assignments) {
    return (
      <div style={{ maxWidth: '700px', margin: '60px auto', textAlign: 'center', padding: '40px', background: 'var(--surface, #ffffff)', borderRadius: '16px', border: '1px solid var(--border, #e5e7eb)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#6b7280' }}>
          <Users size={32} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '8px' }}>
          No Teaching Assignments Yet
        </h2>
        <p style={{ color: 'var(--text-secondary, #6b7280)', fontSize: '15px', lineHeight: '1.5', marginBottom: '24px' }}>
          {data.message || 'You have no active teaching assignments yet — contact your principal to get assigned to a class or subject.'}
        </p>
        <button onClick={load} className="primary-btn" style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={16} /> Check for assignments
        </button>
      </div>
    );
  }

  const { kpis, assignments, tasks, subject_averages, students_with_decline, badges } = data;

  return (
    <div className="teacher-home-container" style={{ padding: '0 0 40px' }}>
      {/* Top Banner with Teacher Badges */}
      <div className="teacher-header-strip" style={{
        background: 'linear-gradient(135deg, rgba(120, 98, 215, 0.08) 0%, rgba(99, 102, 241, 0.04) 100%)',
        borderBottom: '1px solid var(--border, #e5e7eb)',
        padding: '24px 32px',
        marginBottom: '28px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: '#7862d7', textTransform: 'uppercase' }}>
                TEACHER PORTAL
              </span>
              <span style={{ color: '#d1d5db' }}>•</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary, #6b7280)' }}>
                {user.school_name || 'My Campus'}
              </span>
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary, #111827)', margin: 0 }}>
              Welcome, {user.name}
            </h1>
            {/* Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
              {badges.map((b, idx) => (
                <span
                  key={idx}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: b.type === 'class_teacher' ? '#ede9fe' : '#e0e7ff',
                    color: b.type === 'class_teacher' ? '#6d28d9' : '#3730a3',
                    border: b.type === 'class_teacher' ? '1px solid #ddd6fe' : '1px solid #c7d2fe'
                  }}
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => onNavigate('Attendance')}
              className="primary-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px' }}
            >
              <ClipboardCheck size={16} /> Daily Attendance
            </button>
            <button
              onClick={() => onNavigate('Examinations')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px',
                borderRadius: '8px', border: '1px solid var(--border, #d1d5db)', background: 'var(--surface, #fff)',
                color: 'var(--text-primary, #374151)', cursor: 'pointer', fontWeight: 500
              }}
            >
              <Award size={16} /> Marks Entry
            </button>
          </div>
        </div>
      </div>

      {/* Homeroom Class Highlight Card (For Class Teachers) */}
      {data.homeroom_class && (
        <div style={{
          margin: '0 32px 24px',
          background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
          borderRadius: '16px',
          border: '1px solid #ddd6fe',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#6d28d9', background: '#fff', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                Homeroom Authority
              </span>
              <span style={{ fontSize: '13px', color: '#5b21b6', fontWeight: 500 }}>
                You are the assigned Class Teacher
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#3b0764', margin: '2px 0 6px' }}>
              {data.homeroom_class.name}
            </h2>
            <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: '#4c1d95', flexWrap: 'wrap' }}>
              <span>Learners: <b>{data.homeroom_class.student_count}</b></span>
              <span>
                Today's Register:{' '}
                {data.homeroom_class.register_today === 'submitted' ? (
                  <b style={{ color: '#15803d' }}>Marked ✓</b>
                ) : (
                  <b style={{ color: '#b45309' }}>Pending</b>
                )}
              </span>
              <span>Attendance: <b>{data.homeroom_class.attendance_rate !== null ? `${data.homeroom_class.attendance_rate}%` : '—'}</b></span>
              <span>Care / Review Cases: <b>{data.homeroom_class.open_review_cases}</b></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {data.homeroom_class.register_today !== 'submitted' && (
              <button
                onClick={() => onNavigate('Attendance')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '8px', background: '#7c3aed',
                  color: '#fff', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer'
                }}
              >
                <ClipboardCheck size={16} /> Mark Register Now
              </button>
            )}
            <button
              onClick={() => onNavigate('My Class')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px', background: '#fff',
                color: '#5b21b6', fontSize: '13px', fontWeight: 700, border: '1px solid #ddd6fe', cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              Open My Class Dashboard <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        padding: '0 32px',
        marginBottom: '28px'
      }}>
        <div style={{ background: 'var(--surface, #fff)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: '13px', fontWeight: 500 }}>
            <span>Classes</span>
            <Users size={16} style={{ color: '#7862d7' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary, #111827)', marginTop: '8px' }}>
            {kpis.classes}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>In your scope</div>
        </div>

        <div style={{ background: 'var(--surface, #fff)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: '13px', fontWeight: 500 }}>
            <span>Subjects</span>
            <BookOpen size={16} style={{ color: '#3b82f6' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary, #111827)', marginTop: '8px' }}>
            {kpis.subjects}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Teaching assignments</div>
        </div>

        <div style={{ background: 'var(--surface, #fff)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: '13px', fontWeight: 500 }}>
            <span>Students</span>
            <GraduationCap size={16} style={{ color: '#10b981' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary, #111827)', marginTop: '8px' }}>
            {kpis.students}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Enrolled learners</div>
        </div>

        <div style={{
          background: kpis.unsubmitted_registers > 0 ? '#fffbeb' : 'var(--surface, #fff)',
          padding: '18px',
          borderRadius: '12px',
          border: kpis.unsubmitted_registers > 0 ? '1px solid #fef3c7' : '1px solid var(--border, #e5e7eb)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: kpis.unsubmitted_registers > 0 ? '#92400e' : '#6b7280', fontSize: '13px', fontWeight: 500 }}>
            <span>Registers Pending</span>
            <ClipboardCheck size={16} style={{ color: kpis.unsubmitted_registers > 0 ? '#d97706' : '#6b7280' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: kpis.unsubmitted_registers > 0 ? '#b45309' : 'var(--text-primary, #111827)', marginTop: '8px' }}>
            {kpis.unsubmitted_registers}
          </div>
          <div style={{ fontSize: '12px', color: kpis.unsubmitted_registers > 0 ? '#92400e' : '#6b7280', marginTop: '4px' }}>
            {kpis.unsubmitted_registers > 0 ? 'Action needed today' : 'All up to date'}
          </div>
        </div>

        <div style={{
          background: kpis.pending_marks > 0 ? '#f0fdf4' : 'var(--surface, #fff)',
          padding: '18px',
          borderRadius: '12px',
          border: kpis.pending_marks > 0 ? '1px solid #dcfce7' : '1px solid var(--border, #e5e7eb)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: kpis.pending_marks > 0 ? '#166534' : '#6b7280', fontSize: '13px', fontWeight: 500 }}>
            <span>Marks Entry Tasks</span>
            <Award size={16} style={{ color: kpis.pending_marks > 0 ? '#16a34a' : '#6b7280' }} />
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: kpis.pending_marks > 0 ? '#15803d' : 'var(--text-primary, #111827)', marginTop: '8px' }}>
            {kpis.pending_marks}
          </div>
          <div style={{ fontSize: '12px', color: kpis.pending_marks > 0 ? '#166534' : '#6b7280', marginTop: '4px' }}>
            Assessments with missing marks
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: '0 32px' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border, #e5e7eb)', marginBottom: '24px', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('assignments')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'assignments' ? '2px solid #7862d7' : '2px solid transparent',
              color: activeTab === 'assignments' ? '#7862d7' : '#6b7280',
              fontWeight: activeTab === 'assignments' ? 600 : 500,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            My Assignments ({assignments.length})
          </button>
          <button
            onClick={() => setActiveTab('subjects')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'subjects' ? '2px solid #7862d7' : '2px solid transparent',
              color: activeTab === 'subjects' ? '#7862d7' : '#6b7280',
              fontWeight: activeTab === 'subjects' ? 600 : 500,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Subject Performance & Coverage ({subject_averages.length})
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'tasks' ? '2px solid #7862d7' : '2px solid transparent',
              color: activeTab === 'tasks' ? '#7862d7' : '#6b7280',
              fontWeight: activeTab === 'tasks' ? 600 : 500,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Tasks & Actions ({tasks.registers_to_submit.length + tasks.marks_to_enter.length + tasks.homework_to_review.length})
          </button>
        </div>

        {/* Tab 1: Assignments */}
        {activeTab === 'assignments' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              {assignments.map(card => (
                <div
                  key={card.id}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: card.kind === 'class_teacher' ? '#ede9fe' : '#e0e7ff',
                          color: card.kind === 'class_teacher' ? '#6d28d9' : '#3730a3'
                        }}
                      >
                        {card.kind === 'class_teacher' ? 'Class Teacher (Homeroom)' : 'Subject Teacher'}
                      </span>

                      {card.register_today && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: card.register_today === 'submitted' ? '#dcfce7' : '#fef3c7',
                            color: card.register_today === 'submitted' ? '#15803d' : '#b45309'
                          }}
                        >
                          {card.register_today === 'submitted' ? 'Register marked' : 'Register pending'}
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary, #111827)', margin: '0 0 4px' }}>
                      {card.class_name}
                    </h3>
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 16px' }}>
                      {card.subject_name}
                    </p>

                    <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>ENROLLED</div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#374151' }}>{card.student_count} students</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
                    {card.kind === 'class_teacher' && (
                      <button
                        onClick={() => onNavigate('Attendance')}
                        className="primary-btn"
                        style={{ flex: 1, padding: '7px 12px', fontSize: '13px' }}
                      >
                        Mark Register
                      </button>
                    )}
                    <button
                      onClick={() => onNavigate('Examinations')}
                      style={{
                        flex: 1, padding: '7px 12px', fontSize: '13px', borderRadius: '8px',
                        border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer'
                      }}
                    >
                      Enter Marks
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Students with Academic Decline Panel */}
            {students_with_decline.length > 0 && (
              <div style={{
                background: 'var(--surface, #fff)',
                borderRadius: '14px',
                border: '1px solid #fed7aa',
                padding: '24px',
                marginBottom: '32px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <TrendingDown size={20} style={{ color: '#ea580c' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#9a3412', margin: 0 }}>
                    Students with Academic Decline in Your Subjects
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: '#7c2d12', margin: '0 0 16px' }}>
                  Neutral evidence based on a decline of 10% or more compared to prior assessments.
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #fed7aa', color: '#9a3412', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>Student</th>
                        <th style={{ padding: '8px' }}>ID</th>
                        <th style={{ padding: '8px' }}>Class</th>
                        <th style={{ padding: '8px' }}>Subject</th>
                        <th style={{ padding: '8px' }}>Prior Average</th>
                        <th style={{ padding: '8px' }}>Latest Score</th>
                        <th style={{ padding: '8px' }}>Decline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students_with_decline.map(st => (
                        <tr key={st.student_id} style={{ borderBottom: '1px solid #ffedd5' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 500 }}>{st.student_name}</td>
                          <td style={{ padding: '10px 8px', color: '#6b7280' }}>{st.admission_number}</td>
                          <td style={{ padding: '10px 8px' }}>{st.class_name}</td>
                          <td style={{ padding: '10px 8px' }}>{st.subject_name}</td>
                          <td style={{ padding: '10px 8px' }}>{st.prior_average}%</td>
                          <td style={{ padding: '10px 8px', fontWeight: 600, color: '#c2410c' }}>{st.latest_score}%</td>
                          <td style={{ padding: '10px 8px', fontWeight: 700, color: '#dc2626' }}>-{st.decline_delta}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Subject Performance with Coverage */}
        {activeTab === 'subjects' && (
          <div style={{ background: 'var(--surface, #fff)', borderRadius: '14px', border: '1px solid var(--border, #e5e7eb)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary, #111827)', margin: '0 0 4px' }}>
                  Class Average with Coverage
                </h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                  Calculation policy: Missing results are not treated as zero; valid student coverage is shown explicitly.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                    <th style={{ padding: '10px 8px' }}>Class</th>
                    <th style={{ padding: '10px 8px' }}>Subject</th>
                    <th style={{ padding: '10px 8px' }}>Class Average</th>
                    <th style={{ padding: '10px 8px' }}>Assessment Coverage</th>
                    <th style={{ padding: '10px 8px' }}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {subject_averages.map((sa, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 600 }}>{sa.class_name}</td>
                      <td style={{ padding: '12px 8px' }}>{sa.subject_name}</td>
                      <td style={{ padding: '12px 8px' }}>
                        {sa.average !== null ? (
                          <span style={{ fontWeight: 700, color: sa.average >= 70 ? '#15803d' : sa.average >= 50 ? '#b45309' : '#dc2626' }}>
                            {sa.average}%
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>No results</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '100px', height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${sa.coverage_pct}%`, height: '100%', background: '#7862d7', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '13px', color: '#4b5563' }}>{sa.coverage_text}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: sa.is_class_teacher ? '#ede9fe' : '#e0e7ff',
                          color: sa.is_class_teacher ? '#6d28d9' : '#3730a3'
                        }}>
                          {sa.is_class_teacher ? 'Class Teacher' : 'Subject Teacher'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Tasks & Actions */}
        {activeTab === 'tasks' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Registers to submit */}
            <div style={{ background: 'var(--surface, #fff)', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <ClipboardCheck size={18} style={{ color: '#d97706' }} />
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Daily Registers to Submit</h4>
              </div>
              {tasks.registers_to_submit.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> All daily attendance registers submitted!
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {tasks.registers_to_submit.map(reg => (
                    <li key={reg.class_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ fontWeight: 500, fontSize: '14px' }}>{reg.class_name}</span>
                      <button
                        onClick={() => onNavigate('Attendance')}
                        className="primary-btn"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Submit register
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Marks to enter */}
            <div style={{ background: 'var(--surface, #fff)', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Award size={18} style={{ color: '#2563eb' }} />
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Assessments Pending Marks</h4>
              </div>
              {tasks.marks_to_enter.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> All assessments are fully graded!
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {tasks.marks_to_enter.map(m => (
                    <li key={m.assessment_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{m.title}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{m.class_name} • {m.missing_count} missing</div>
                      </div>
                      <button
                        onClick={() => onNavigate('Examinations')}
                        style={{
                          padding: '4px 10px', fontSize: '12px', borderRadius: '6px',
                          border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer'
                        }}
                      >
                        Enter marks
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Homework to review */}
            <div style={{ background: 'var(--surface, #fff)', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <ClipboardList size={18} style={{ color: '#7c3aed' }} />
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Homework to Review</h4>
              </div>
              {tasks.homework_to_review.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> No pending homework submissions!
                </div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {tasks.homework_to_review.map(hw => (
                    <li key={hw.submission_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{hw.title}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{hw.student_name} ({hw.class_name})</div>
                      </div>
                      <button
                        onClick={() => onNavigate('Homework')}
                        style={{
                          padding: '4px 10px', fontSize: '12px', borderRadius: '6px',
                          border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer'
                        }}
                      >
                        Review
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
