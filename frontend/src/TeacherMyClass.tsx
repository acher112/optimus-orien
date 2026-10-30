import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, ClipboardCheck, Award, AlertCircle, RefreshCw,
  Search, ShieldAlert, ArrowUpRight, CheckCircle2, ChevronRight,
  Download, Filter, UserCheck, AlertTriangle, Eye, X, BookOpen,
  TrendingUp, TrendingDown, Clock, HelpCircle, Layers
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, Legend
} from 'recharts';
import { request, type User } from './api';

interface TeacherMyClassProps {
  user: User;
  onNavigate: (page: string) => void;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function TeacherMyClass({ user, onNavigate, notify }: TeacherMyClassProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  // Tabs: 'roster' | 'subjects' | 'risk' | 'attendance'
  const [activeTab, setActiveTab] = useState<'roster' | 'subjects' | 'risk' | 'attendance'>('roster');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [fatherFilter, setFatherFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | 'distinction' | 'merit' | 'pass' | 'at_risk'>('all');

  // Selected student for detail modal
  const [detailStudent, setDetailStudent] = useState<any | null>(null);

  const load = useCallback(async (classId?: number | null) => {
    setLoading(true);
    setError('');
    try {
      const url = classId ? `teacher/my-class/?class_id=${classId}` : 'teacher/my-class/';
      const res: any = await request(url);
      setData(res);
      if (!selectedClassId && res?.class_info?.id) {
        setSelectedClassId(res.class_info.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load class overview.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    load(selectedClassId);
  }, [selectedClassId, load]);

  const {
    class_info,
    my_classes = [],
    total_students = 0,
    class_academic_average = null,
    attendance_today = 'pending',
    attendance_rate = null,
    attendance_summary = {},
    performance_tiers = {},
    gender_stats = {},
    subjects = [],
    students = [],
    top_performers = [],
    at_risk_students = [],
    review_cases = []
  } = data || {};

  // Filter students roster
  const filteredStudents = useMemo(() => {
    return (students || []).filter((s: any) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = s.full_name?.toLowerCase().includes(q) || s.admission_number?.toLowerCase().includes(q);
        if (!matchName) return false;
      }
      if (fatherFilter) {
        const qf = fatherFilter.toLowerCase();
        if (!s.father_name?.toLowerCase().includes(qf)) return false;
      }
      if (genderFilter !== 'all') {
        if (s.gender !== genderFilter) return false;
      }
      if (tierFilter !== 'all') {
        if (tierFilter === 'at_risk' && !s.is_at_risk) return false;
        if (tierFilter === 'distinction' && (s.overall_average === null || s.overall_average < 80)) return false;
        if (tierFilter === 'merit' && (s.overall_average === null || s.overall_average < 70 || s.overall_average >= 80)) return false;
        if (tierFilter === 'pass' && (s.overall_average === null || s.overall_average < 50 || s.overall_average >= 70)) return false;
      }
      return true;
    });
  }, [students, searchQuery, fatherFilter, genderFilter, tierFilter]);

  // Export CSV
  const handleExportCSV = () => {
    if (!students || students.length === 0) {
      notify('No student records to export.', 'info');
      return;
    }
    const subjectHeaders = (subjects || []).map((s: any) => s.code || s.subject_name);
    const headers = [
      'Rank', 'Admission Number', 'Student Name', 'Father Name', 'Guardian Phone',
      'Gender', 'DOB', 'Attendance %', ...subjectHeaders, 'Overall Average %', 'Status'
    ];

    const rows = filteredStudents.map((s: any) => {
      const subCols = (subjects || []).map((sub: any) => {
        const val = s.subjects?.[sub.code];
        return val !== undefined && val !== null ? val : '—';
      });
      return [
        s.rank || '—',
        `"${s.admission_number || ''}"`,
        `"${s.full_name || ''}"`,
        `"${s.father_name || ''}"`,
        `"${s.guardian_phone || ''}"`,
        s.gender || '—',
        s.date_of_birth || '—',
        s.attendance_rate !== null ? `${s.attendance_rate}%` : '—',
        ...subCols,
        s.overall_average !== null ? `${s.overall_average}%` : '—',
        s.is_at_risk ? 'At Risk' : 'Normal'
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${class_info?.display_name || 'My_Class'}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Class report exported successfully.', 'success');
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <RefreshCw size={32} className="spin" style={{ margin: '0 auto 16px', color: '#7862d7' }} />
        <h3 style={{ fontSize: 18, fontWeight: 600, color: '#334155' }}>Loading Homeroom Class Intelligence...</h3>
        <p style={{ color: '#64748b', fontSize: 14 }}>Aggregating all subjects, attendance, and student progress for your class.</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ maxWidth: 650, margin: '60px auto', padding: 32, background: '#fff', borderRadius: 12, border: '1px solid #fee2e2', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertCircle size={28} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Unable to Load Class Information</h3>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>{error}</p>
        <button onClick={() => load(selectedClassId)} className="primary-btn" style={{ padding: '8px 20px' }}>
          <RefreshCw size={15} style={{ marginRight: 6 }} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* ------------------------------------------------------------------- */}
      {/* Page Header */}
      {/* ------------------------------------------------------------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              color: '#6d28d9', background: '#ede9fe', padding: '3px 8px', borderRadius: 4,
              textTransform: 'uppercase'
            }}>
              <Award size={13} /> Class Teacher Authority
            </span>
            <span style={{ color: '#94a3b8' }}>•</span>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              Academic Year: <b>{class_info?.academic_year || 'Current'}</b>
            </span>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>
            My Class: {class_info?.display_name}
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Complete 360° homeroom oversight: all subjects, examinations, marks, attendance, and student progress.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {my_classes && my_classes.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 8px' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Class:</span>
              <select
                value={selectedClassId || class_info?.id}
                onChange={(e) => setSelectedClassId(Number(e.target.value))}
                style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: '#1e293b', outline: 'none', cursor: 'pointer' }}
              >
                {my_classes.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => onNavigate('Attendance')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
              background: '#fff', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer'
            }}
          >
            <ClipboardCheck size={16} color="#0284c7" /> Mark Register
          </button>

          <button
            onClick={() => onNavigate('Examinations')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
              background: '#fff', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer'
            }}
          >
            <Award size={16} color="#7c3aed" /> Examinations
          </button>

          <button
            onClick={handleExportCSV}
            className="primary-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', fontSize: 13, fontWeight: 600
            }}
          >
            <Download size={15} /> Export Report
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Executive KPI Summary Strip */}
      {/* ------------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 24 }}>
        {/* Total Students */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Class Students</span>
            <Users size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '6px 0 2px' }}>
            {total_students}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Boys: <b>{gender_stats?.boys_count || 0}</b> • Girls: <b>{gender_stats?.girls_count || 0}</b>
          </div>
        </div>

        {/* Academic Average */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Class Academic Avg</span>
            <Award size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: class_academic_average !== null && class_academic_average >= 70 ? '#16a34a' : '#0f172a', margin: '6px 0 2px' }}>
            {class_academic_average !== null ? `${class_academic_average.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Across <b>{subjects.length}</b> subjects in this class
          </div>
        </div>

        {/* Attendance Rate */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Class Attendance</span>
            <ClipboardCheck size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: attendance_rate !== null && attendance_rate >= 85 ? '#0284c7' : '#d97706', margin: '6px 0 2px' }}>
            {attendance_rate !== null ? `${attendance_rate.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            <b>{attendance_summary?.regular_count || 0}</b> regular (≥90%) • <b>{attendance_summary?.chronic_absent_count || 0}</b> chronic
          </div>
        </div>

        {/* Today's Register */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Today's Register</span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div style={{ margin: '8px 0 4px' }}>
            {attendance_today === 'submitted' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '4px 10px', borderRadius: 6 }}>
                <CheckCircle2 size={16} /> Register Marked
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '4px 10px', borderRadius: 6 }}>
                <AlertCircle size={16} /> Register Pending
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {attendance_today === 'submitted' ? 'Marked for all learners today' : 'Class register needs submission'}
          </div>
        </div>

        {/* At-Risk / Support */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Learners Needing Care</span>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: at_risk_students.length > 0 ? '#dc2626' : '#16a34a', margin: '6px 0 2px' }}>
            {at_risk_students.length}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            <b>{review_cases.length}</b> open review case{review_cases.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Visual Analytics Strip (Subject Chart & Performance Tiers) */}
      {/* ------------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 2fr) minmax(280px, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* Subject Performance Bar Chart */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Class Subject Performance Comparison
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
                Average percentage across all subjects taught in {class_info?.display_name}
              </p>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', padding: '3px 8px', borderRadius: 4 }}>
              {subjects.length} Subjects
            </span>
          </div>

          {subjects && subjects.length > 0 ? (
            <div style={{ height: 230, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjects} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="subject_name"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div style={{ background: '#1e293b', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.subject_name} ({item.code})</div>
                            <div>Class Average: <b>{item.average !== null ? `${item.average}%` : 'No marks'}</b></div>
                            <div>Pass Rate: <b>{item.passing_rate !== null ? `${item.passing_rate}%` : '—'}</b></div>
                            <div>Teacher: <b>{item.assigned_teacher || 'Unassigned'}</b></div>
                            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>{item.coverage_text}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="average" radius={[4, 4, 0, 0]}>
                    {subjects.map((entry: any, index: number) => {
                      const avg = entry.average || 0;
                      let color = '#3b82f6';
                      if (avg >= 80) color = '#10b981';
                      else if (avg >= 70) color = '#6366f1';
                      else if (avg >= 50) color = '#f59e0b';
                      else if (avg > 0) color = '#ef4444';
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: 13 }}>
              No subject assessments recorded for this class yet.
            </div>
          )}
        </div>

        {/* Performance Tiers & Demographics */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#0f172a' }}>
              Grade Distribution Tiers
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Distinction */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  <span style={{ color: '#16a34a' }}>Distinction (≥80%)</span>
                  <span>{performance_tiers?.distinction?.count || 0} students ({performance_tiers?.distinction?.pct || 0}%)</span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${performance_tiers?.distinction?.pct || 0}%`, height: '100%', background: '#16a34a', borderRadius: 3 }} />
                </div>
              </div>

              {/* Merit */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  <span style={{ color: '#2563eb' }}>Merit / Good (70–79%)</span>
                  <span>{performance_tiers?.merit?.count || 0} students ({performance_tiers?.merit?.pct || 0}%)</span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${performance_tiers?.merit?.pct || 0}%`, height: '100%', background: '#2563eb', borderRadius: 3 }} />
                </div>
              </div>

              {/* Pass */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  <span style={{ color: '#d97706' }}>Passing / Average (50–69%)</span>
                  <span>{performance_tiers?.pass?.count || 0} students ({performance_tiers?.pass?.pct || 0}%)</span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${performance_tiers?.pass?.pct || 0}%`, height: '100%', background: '#d97706', borderRadius: 3 }} />
                </div>
              </div>

              {/* At Risk */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                  <span style={{ color: '#dc2626' }}>At-Risk (&lt;50% or Low Att)</span>
                  <span>{performance_tiers?.at_risk?.count || 0} students ({performance_tiers?.at_risk?.pct || 0}%)</span>
                </div>
                <div style={{ width: '100%', height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${performance_tiers?.at_risk?.pct || 0}%`, height: '100%', background: '#dc2626', borderRadius: 3 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Gender analytics box */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
              Gender Performance Balance:
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#1e40af' }}>
                Boys Avg: <b>{gender_stats?.boys_average !== null ? `${gender_stats.boys_average}%` : '—'}</b>
              </span>
              <span style={{ fontSize: 13, color: '#9d174d' }}>
                Girls Avg: <b>{gender_stats?.girls_average !== null ? `${gender_stats.girls_average}%` : '—'}</b>
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: '#f8fafc', border: '1px solid #e2e8f0',
                color: gender_stats?.gender_gap_pp !== null && Math.abs(gender_stats.gender_gap_pp) > 5 ? '#b45309' : '#475569'
              }}>
                Gap: {gender_stats?.gender_gap_pp !== null ? `${gender_stats.gender_gap_pp > 0 ? '+' : ''}${gender_stats.gender_gap_pp} pp` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Navigation Tabs */}
      {/* ------------------------------------------------------------------- */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('roster')}
          style={{
            padding: '10px 18px', border: 'none', background: 'transparent',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            borderBottom: activeTab === 'roster' ? '3px solid #7c3aed' : '3px solid transparent',
            color: activeTab === 'roster' ? '#7c3aed' : '#64748b',
            display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <Users size={16} /> Student Progress Roster ({students.length})
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          style={{
            padding: '10px 18px', border: 'none', background: 'transparent',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            borderBottom: activeTab === 'subjects' ? '3px solid #7c3aed' : '3px solid transparent',
            color: activeTab === 'subjects' ? '#7c3aed' : '#64748b',
            display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <BookOpen size={16} /> All Subjects Overview ({subjects.length})
        </button>

        <button
          onClick={() => setActiveTab('risk')}
          style={{
            padding: '10px 18px', border: 'none', background: 'transparent',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            borderBottom: activeTab === 'risk' ? '3px solid #7c3aed' : '3px solid transparent',
            color: activeTab === 'risk' ? '#7c3aed' : '#64748b',
            display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <AlertTriangle size={16} /> Learners Needing Support ({at_risk_students.length})
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            padding: '10px 18px', border: 'none', background: 'transparent',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            borderBottom: activeTab === 'attendance' ? '3px solid #7c3aed' : '3px solid transparent',
            color: activeTab === 'attendance' ? '#7c3aed' : '#64748b',
            display: 'flex', alignItems: 'center', gap: 8
          }}
        >
          <ClipboardCheck size={16} /> Attendance Health
        </button>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Tab 1: Student Progress Roster */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'roster' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
              {/* Search */}
              <div style={{ position: 'relative', minWidth: 200, flex: 1, maxWidth: 280 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search student or admission #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              {/* Father Name Filter */}
              <div style={{ minWidth: 160 }}>
                <input
                  type="text"
                  placeholder="Filter by Father Name..."
                  value={fatherFilter}
                  onChange={(e) => setFatherFilter(e.target.value)}
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>

              {/* Gender Filter */}
              <select
                value={genderFilter}
                onChange={(e: any) => setGenderFilter(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
              >
                <option value="all">All Genders</option>
                <option value="male">Boys only</option>
                <option value="female">Girls only</option>
              </select>

              {/* Tier Filter */}
              <select
                value={tierFilter}
                onChange={(e: any) => setTierFilter(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
              >
                <option value="all">All Tiers</option>
                <option value="distinction">Distinction (≥80%)</option>
                <option value="merit">Merit (70–79%)</option>
                <option value="pass">Pass (50–69%)</option>
                <option value="at_risk">At-Risk Learners</option>
              </select>
            </div>

            <div style={{ fontSize: 13, color: '#64748b' }}>
              Showing <b>{filteredStudents.length}</b> of <b>{total_students}</b> students
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '12px 10px', width: 50 }}>Rank</th>
                  <th style={{ padding: '12px 12px' }}>Student</th>
                  <th style={{ padding: '12px 12px' }}>Father Name</th>
                  <th style={{ padding: '12px 12px' }}>Guardian Contact</th>
                  <th style={{ padding: '12px 10px' }}>Gender</th>
                  <th style={{ padding: '12px 10px' }}>Attendance</th>
                  {subjects.map((sub: any) => (
                    <th key={sub.subject_id} style={{ padding: '12px 10px', textAlign: 'center' }}>
                      {sub.code || sub.subject_name}
                    </th>
                  ))}
                  <th style={{ padding: '12px 12px', textAlign: 'right' }}>Overall Avg</th>
                  <th style={{ padding: '12px 12px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={8 + subjects.length} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                      No students match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((st: any) => {
                    const avg = st.overall_average;
                    let avgBadgeColor = '#64748b';
                    let avgBadgeBg = '#f1f5f9';
                    if (avg !== null) {
                      if (avg >= 80) { avgBadgeColor = '#15803d'; avgBadgeBg = '#dcfce7'; }
                      else if (avg >= 70) { avgBadgeColor = '#1d4ed8'; avgBadgeBg = '#dbeafe'; }
                      else if (avg >= 50) { avgBadgeColor = '#b45309'; avgBadgeBg = '#fef3c7'; }
                      else { avgBadgeColor = '#b91c1c'; avgBadgeBg = '#fee2e2'; }
                    }

                    return (
                      <tr
                        key={st.id}
                        onClick={() => setDetailStudent(st)}
                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                        className="hover:bg-slate-50"
                      >
                        <td style={{ padding: '12px 10px', fontWeight: 700, color: '#64748b' }}>
                          {st.rank ? `#${st.rank}` : '—'}
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <div style={{ fontWeight: 600, color: '#2563eb' }}>{st.full_name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{st.admission_number}</div>
                        </td>
                        <td style={{ padding: '12px 12px', color: '#334155' }}>
                          {st.father_name || '—'}
                        </td>
                        <td style={{ padding: '12px 12px', color: '#64748b' }}>
                          {st.guardian_phone || '—'}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: st.gender === 'male' ? '#eff6ff' : st.gender === 'female' ? '#fdf2f8' : '#f8fafc',
                            color: st.gender === 'male' ? '#1d4ed8' : st.gender === 'female' ? '#be185d' : '#64748b'
                          }}>
                            {st.gender === 'male' ? 'Boy' : st.gender === 'female' ? 'Girl' : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          {st.attendance_rate !== null ? (
                            <span style={{
                              fontWeight: 600,
                              color: st.attendance_rate < 75 ? '#dc2626' : st.attendance_rate < 90 ? '#d97706' : '#16a34a'
                            }}>
                              {st.attendance_rate.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        {subjects.map((sub: any) => {
                          const mark = st.subjects?.[sub.code];
                          return (
                            <td key={sub.subject_id} style={{ padding: '12px 10px', textAlign: 'center', fontWeight: mark !== undefined ? 600 : 400 }}>
                              {mark !== undefined && mark !== null ? (
                                <span style={{ color: mark >= 50 ? '#0f172a' : '#dc2626' }}>
                                  {mark}%
                                </span>
                              ) : (
                                <span style={{ color: '#cbd5e1' }}>—</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: 4, fontWeight: 700,
                            background: avgBadgeBg, color: avgBadgeColor, fontSize: 12
                          }}>
                            {avg !== null ? `${avg.toFixed(1)}%` : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                          {st.is_at_risk ? (
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#b91c1c' }}>
                              At Risk
                            </span>
                          ) : (
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>
                              Normal
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Tab 2: All Subjects Overview */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'subjects' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
              Subject Performance Ledger for {class_info?.display_name}
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              As homeroom class teacher, you have full visibility into every subject taught to your class and its assigned educator.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '12px 14px' }}>Subject</th>
                  <th style={{ padding: '12px 14px' }}>Assigned Subject Teacher</th>
                  <th style={{ padding: '12px 14px' }}>Class Average</th>
                  <th style={{ padding: '12px 14px' }}>Highest / Lowest</th>
                  <th style={{ padding: '12px 14px' }}>Passing Rate</th>
                  <th style={{ padding: '12px 14px' }}>Assessed Learners</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {subjects.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
                      No subjects configured for this class yet.
                    </td>
                  </tr>
                ) : (
                  subjects.map((sub: any) => {
                    const avg = sub.average;
                    return (
                      <tr key={sub.subject_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{sub.subject_name}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Code: {sub.code || '—'}</div>
                        </td>
                        <td style={{ padding: '14px 14px', color: '#334155' }}>
                          <b>{sub.assigned_teacher || 'Unassigned'}</b>
                        </td>
                        <td style={{ padding: '14px 14px', fontWeight: 700, fontSize: 15, color: avg !== null && avg >= 70 ? '#16a34a' : avg !== null && avg >= 50 ? '#2563eb' : '#dc2626' }}>
                          {avg !== null ? `${avg.toFixed(1)}%` : 'No Marks'}
                        </td>
                        <td style={{ padding: '14px 14px', color: '#475569' }}>
                          {sub.highest_score !== null ? (
                            <span>High: <b>{sub.highest_score}%</b> • Low: <b>{sub.lowest_score}%</b></span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '14px 14px' }}>
                          {sub.passing_rate !== null ? (
                            <span style={{ fontWeight: 600, color: sub.passing_rate >= 75 ? '#16a34a' : '#d97706' }}>
                              {sub.passing_rate.toFixed(1)}% pass
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '14px 14px', color: '#64748b' }}>
                          {sub.coverage_text}
                        </td>
                        <td style={{ padding: '14px 14px', textAlign: 'right' }}>
                          {avg !== null ? (
                            <span style={{
                              padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: avg >= 70 ? '#dcfce7' : avg >= 50 ? '#dbeafe' : '#fee2e2',
                              color: avg >= 70 ? '#15803d' : avg >= 50 ? '#1d4ed8' : '#b91c1c'
                            }}>
                              {avg >= 70 ? 'STRONG' : avg >= 50 ? 'AVERAGE' : 'NEEDS FOCUS'}
                            </span>
                          ) : (
                            <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, color: '#94a3b8', background: '#f1f5f9' }}>
                              PENDING
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Tab 3: At-Risk & Interventions */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'risk' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 16 }}>
          {/* At-Risk Students Card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #fee2e2', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertTriangle size={20} color="#dc2626" />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#991b1b' }}>
                Students Requiring Academic Attention ({at_risk_students.length})
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
              Flagged due to overall percentage &lt; 50%, attendance &lt; 75%, or active pastoral review case.
            </p>

            {at_risk_students.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#16a34a', background: '#f0fdf4', borderRadius: 8 }}>
                <CheckCircle2 size={24} style={{ margin: '0 auto 8px' }} />
                <b>No students currently at risk in this class!</b>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {at_risk_students.map((st: any) => (
                  <div
                    key={st.id}
                    onClick={() => setDetailStudent(st)}
                    style={{
                      border: '1px solid #fecaca', borderRadius: 8, padding: 12, background: '#fff5f5',
                      cursor: 'pointer', transition: 'transform 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#991b1b' }}>{st.full_name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Admission #{st.admission_number} • Father: {st.father_name || '—'}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#b91c1c' }}>
                        AT RISK
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
                      <div>
                        Overall Avg: <b style={{ color: st.overall_average < 50 ? '#dc2626' : '#0f172a' }}>
                          {st.overall_average !== null ? `${st.overall_average.toFixed(1)}%` : 'No Marks'}
                        </b>
                      </div>
                      <div>
                        Attendance: <b style={{ color: st.attendance_rate < 75 ? '#dc2626' : '#0f172a' }}>
                          {st.attendance_rate !== null ? `${st.attendance_rate.toFixed(1)}%` : '—'}
                        </b>
                      </div>
                      <div>
                        Guardian: <b>{st.guardian_phone || 'None'}</b>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Review Cases Card */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldAlert size={20} color="#7c3aed" />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>
                Open Review Cases ({review_cases.length})
              </h3>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
              Pastoral, behavioural, or academic intervention cases logged for learners in your class.
            </p>

            {review_cases.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                No open review cases for this class.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {review_cases.map((rc: any) => (
                  <div key={rc.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{rc.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Student: <b>{rc.student_name}</b></div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: rc.priority === 'high' ? '#fee2e2' : '#fef3c7',
                        color: rc.priority === 'high' ? '#b91c1c' : '#b45309'
                      }}>
                        {rc.priority?.toUpperCase()} PRIORITY
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                      <span>Status: <b style={{ color: '#475569' }}>{rc.status?.replace('_', ' ').toUpperCase()}</b></span>
                      <span>Logged: {new Date(rc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Tab 4: Attendance Health */}
      {/* ------------------------------------------------------------------- */}
      {activeTab === 'attendance' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
              Attendance Health & Register Overview
            </h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Class teachers hold sole authority over the homeroom daily register. Monitor chronic absenteeism early.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
            <div style={{ padding: 16, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>OVERALL RATE</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0284c7', margin: '4px 0' }}>
                {attendance_rate !== null ? `${attendance_rate.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Cumulative attendance rate</div>
            </div>

            <div style={{ padding: 16, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>REGULAR ATTENDANCE (≥90%)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#15803d', margin: '4px 0' }}>
                {attendance_summary?.regular_count || 0}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Consistent learners</div>
            </div>

            <div style={{ padding: 16, borderRadius: 8, background: '#fefce8', border: '1px solid #fef08a' }}>
              <div style={{ fontSize: 12, color: '#ca8a04', fontWeight: 600 }}>WARNING (75–89.9%)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#a16207', margin: '4px 0' }}>
                {attendance_summary?.warning_count || 0}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Needs attendance reminder</div>
            </div>

            <div style={{ padding: 16, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>CHRONIC ABSENTEE (&lt;75%)</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#b91c1c', margin: '4px 0' }}>
                {attendance_summary?.chronic_absent_count || 0}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Urgent guardian follow-up required</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => onNavigate('Attendance')}
              className="primary-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px' }}
            >
              <ClipboardCheck size={16} /> Open Attendance Register Module
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Student Profile Detail Modal */}
      {/* ------------------------------------------------------------------- */}
      {detailStudent && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, maxWidth: 650, width: '100%',
            maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#7c3aed', textTransform: 'uppercase' }}>
                  HOMEROOM STUDENT PROFILE
                </span>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '2px 0 0' }}>
                  {detailStudent.full_name}
                </h2>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Admission ID: <b>{detailStudent.admission_number}</b> • Class Rank: <b>#{detailStudent.rank || '—'}</b>
                </div>
              </div>
              <button
                onClick={() => setDetailStudent(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Demographics Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, background: '#f8fafc', padding: 14, borderRadius: 8, marginBottom: 20, fontSize: 12 }}>
              <div>
                <span style={{ color: '#64748b' }}>Father Name:</span>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{detailStudent.father_name || '—'}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Guardian Phone:</span>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{detailStudent.guardian_phone || '—'}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Date of Birth:</span>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{detailStudent.date_of_birth || '—'}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Gender:</span>
                <div style={{ fontWeight: 600, color: '#0f172a', textTransform: 'capitalize' }}>{detailStudent.gender || '—'}</div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Attendance Rate:</span>
                <div style={{ fontWeight: 700, color: detailStudent.attendance_rate < 75 ? '#dc2626' : '#0284c7' }}>
                  {detailStudent.attendance_rate !== null ? `${detailStudent.attendance_rate.toFixed(1)}%` : '—'}
                </div>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Overall Academic Avg:</span>
                <div style={{ fontWeight: 700, color: detailStudent.overall_average < 50 ? '#dc2626' : '#16a34a' }}>
                  {detailStudent.overall_average !== null ? `${detailStudent.overall_average.toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>

            {/* Subject Marks Ledger */}
            <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: '#0f172a' }}>Subject Marks & Assessments</h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '8px 12px' }}>Subject</th>
                    <th style={{ padding: '8px 12px' }}>Code</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Score / %</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Performance</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((sub: any) => {
                    const mark = detailStudent.subjects?.[sub.code];
                    return (
                      <tr key={sub.subject_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{sub.subject_name}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{sub.code}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                          {mark !== undefined && mark !== null ? `${mark}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {mark !== undefined && mark !== null ? (
                            <span style={{
                              padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                              background: mark >= 80 ? '#dcfce7' : mark >= 50 ? '#dbeafe' : '#fee2e2',
                              color: mark >= 80 ? '#15803d' : mark >= 50 ? '#1d4ed8' : '#b91c1c'
                            }}>
                              {mark >= 80 ? 'DISTINCTION' : mark >= 50 ? 'PASS' : 'FAIL'}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: 11 }}>No entry</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setDetailStudent(null)}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
