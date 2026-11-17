import React, { useState, useEffect, useCallback } from 'react';
import {
  Award, TrendingUp, Users, CheckCircle2, AlertTriangle, AlertCircle,
  Download, RefreshCw, SlidersHorizontal, ArrowLeft, Plus, X, MessageSquare,
  ShieldAlert, BookOpen, Clock, HeartHandshake
} from 'lucide-react';
import { type User } from './api';
import './record.css';

interface TeacherPerformanceProps {
  user: User;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  activeCampusId?: number | null;
  campuses?: any[];
}

export default function TeacherPerformance({
  user,
  notify,
  activeCampusId,
  campuses = [],
}: TeacherPerformanceProps) {
  const [selectedCampus, setSelectedCampus] = useState<string>(
    activeCampusId ? String(activeCampusId) : (campuses[0]?.id ? String(campuses[0].id) : '')
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [teacherDetail, setTeacherDetail] = useState<any>(null);

  // Filters
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [termFilter, setTermFilter] = useState<string>('');

  // Modals
  const [confirmExportModal, setConfirmExportModal] = useState<boolean>(false);
  const [criteriaModal, setCriteriaModal] = useState<boolean>(false);
  const [noteModal, setNoteModal] = useState<boolean>(false);
  const [noteContent, setNoteContent] = useState<string>('');
  const [noteKind, setNoteKind] = useState<'private_leadership' | 'self_reflection'>('private_leadership');

  // Criteria simulation state
  const [criteriaForm, setCriteriaForm] = useState({
    min_students: 10,
    min_assessments: 2,
    diff_campus_threshold: 10.0,
    pass_rate_threshold: 60.0,
    explanation_of_change: '',
  });
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  // Check if current user is teacher viewing self
  const isTeacherSelf = user.role === 'teacher';

  // Load Overview Data
  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      if (isTeacherSelf) {
        // Load teacher self profile directly
        const res = await fetch('/api/v1/teacher-performance/me/', { credentials: 'include' });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.detail || 'Failed to load performance profile.');
        }
        const json = await res.json();
        setTeacherDetail(json);
        setSelectedTeacherId(user.id);
      } else {
        const qParams = new URLSearchParams();
        if (selectedCampus) qParams.set('campus', selectedCampus);
        if (searchFilter) qParams.set('search', searchFilter);
        if (statusFilter !== 'all') qParams.set('status', statusFilter);
        if (termFilter) qParams.set('term', termFilter);

        const res = await fetch(`/api/v1/teacher-performance/overview/?${qParams.toString()}`, { credentials: 'include' });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.detail || 'Failed to load teacher performance.');
        }
        const json = await res.json();
        setOverviewData(json);
      }
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [isTeacherSelf, selectedCampus, searchFilter, statusFilter, termFilter, user.id, notify]);

  // Load Single Teacher Detail
  const loadTeacherDetail = async (tId: number) => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (selectedCampus) qParams.set('campus', selectedCampus);
      const res = await fetch(`/api/v1/teacher-performance/teachers/${tId}/?${qParams.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to load teacher detail.');
      }
      const json = await res.json();
      setTeacherDetail(json);
      setSelectedTeacherId(tId);
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Run live criteria preview
  const handleTestPreview = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/v1/teacher-performance/criteria/preview/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          campus: selectedCampus,
          ...criteriaForm
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Preview failed.');
      }
      const json = await res.json();
      setPreviewResult(json);
      notify('Live simulation complete.', 'info');
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setSimulating(false);
    }
  };

  // Save new criteria version
  const handleSaveCriteria = async () => {
    if (!criteriaForm.explanation_of_change.trim()) {
      notify('An explanation of change is required before publishing criteria.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/v1/teacher-performance/criteria/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          campus: selectedCampus,
          ...criteriaForm
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to save criteria.');
      }
      const json = await res.json();
      notify(`Criteria version ${json.version} published successfully!`, 'success');
      setCriteriaModal(false);
      loadOverview();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Alert Action (Confirm, Acknowledge, Resolve, Dismiss)
  const handleAlertAction = async (alertId: number, action: string) => {
    try {
      const res = await fetch(`/api/v1/teacher-performance/alerts/${alertId}/action/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          campus: selectedCampus,
          action,
          action_plan: action === 'resolve' ? 'Supportive mentoring session conducted.' : ''
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Action failed.');
      }
      notify(`Alert ${action}ed successfully.`, 'success');
      if (selectedTeacherId) loadTeacherDetail(selectedTeacherId);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Add Note
  const handleAddNote = async () => {
    if (!noteContent.trim()) {
      notify('Note content cannot be empty.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/v1/teacher-performance/notes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          campus: selectedCampus,
          teacher_id: selectedTeacherId,
          kind: isTeacherSelf ? 'self_reflection' : noteKind,
          content: noteContent
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to add note.');
      }
      notify('Note recorded successfully.', 'success');
      setNoteModal(false);
      setNoteContent('');
      if (selectedTeacherId) loadTeacherDetail(selectedTeacherId);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Export Excel
  const handleExport = async () => {
    setConfirmExportModal(false);
    try {
      const qParams = new URLSearchParams();
      if (selectedCampus) qParams.set('campus', selectedCampus);
      if (searchFilter) qParams.set('search', searchFilter);

      notify('Generating Teacher Performance Excel Dossier...', 'info');
      const res = await fetch(`/api/v1/teacher-performance/export/?${qParams.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Export failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `teacher_performance_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);

      notify('Teacher performance export downloaded.', 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="record-container">
      {/* Header */}
      <div className="record-header-card">
        <div className="record-title-row">
          <div className="record-title-group">
            <h1>
              <Award size={26} color="#6f42c1" />
              <span>Teacher Performance & Instructional Insights</span>
            </h1>
            <p className="record-subtitle">
              Fair, evidence-based academic progress tracking and supportive leadership workflows.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!isTeacherSelf && campuses.length > 1 && user.role !== 'principal' && (
              <select
                className="record-select"
                value={selectedCampus}
                onChange={e => setSelectedCampus(e.target.value)}
              >
                <option value="all">🌐 All Campuses (Consolidated)</option>
                {campuses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            )}

            {!isTeacherSelf && (
              <>
                <button
                  className="record-btn-secondary"
                  onClick={() => { setCriteriaModal(true); setPreviewResult(null); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <SlidersHorizontal size={15} />
                  <span>Criteria & Live Preview</span>
                </button>

                <button
                  className="record-download-btn"
                  onClick={() => setConfirmExportModal(true)}
                  disabled={loading || !overviewData?.teachers?.length}
                >
                  <Download size={16} />
                  <span>Download Excel (.xlsx)</span>
                  <span className="record-count-badge">{overviewData?.teachers?.length || 0} teachers</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filter Bar (Overview mode only) */}
        {!selectedTeacherId && !isTeacherSelf && (
          <div className="record-filter-bar">
            <div className="record-filter-inputs">
              <input
                type="text"
                placeholder="Search teacher by name or email..."
                className="record-input"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                style={{ width: '240px' }}
              />

              <select
                className="record-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="all">All Performance Levels</option>
                <option value="on_track">On Track</option>
                <option value="watch">Watch</option>
                <option value="needs_support">Needs Support</option>
                <option value="insufficient_data">Insufficient Data</option>
              </select>
            </div>

            <button
              className="record-btn-secondary"
              onClick={loadOverview}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loading ? 'spin-anim' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: OVERVIEW DASHBOARD */}
      {!selectedTeacherId && !isTeacherSelf && overviewData && (
        <>
          <div className="record-kpi-grid">
            <div className="record-kpi-card">
              <span className="record-kpi-title">Evaluated Teachers</span>
              <span className="record-kpi-value">{overviewData.cards.evaluated_teachers}</span>
              <span className="record-kpi-sub">Across published subjects</span>
            </div>
            <div className="record-kpi-card">
              <span className="record-kpi-title">On Track</span>
              <span className="record-kpi-value" style={{ color: '#059669' }}>
                {overviewData.cards.on_track_count}
              </span>
              <span className="record-kpi-sub">Meeting or exceeding benchmarks</span>
            </div>
            <div className="record-kpi-card">
              <span className="record-kpi-title">Watch</span>
              <span className="record-kpi-value" style={{ color: '#d97706' }}>
                {overviewData.cards.watch_count}
              </span>
              <span className="record-kpi-sub">Within developmental tolerance</span>
            </div>
            <div className="record-kpi-card">
              <span className="record-kpi-title">Needs Support</span>
              <span className="record-kpi-value" style={{ color: '#dc2626' }}>
                {overviewData.cards.needs_support_count}
              </span>
              <span className="record-kpi-sub">Recommended for mentoring review</span>
            </div>
            <div className="record-kpi-card">
              <span className="record-kpi-title">Insufficient Data</span>
              <span className="record-kpi-value" style={{ color: '#64748b' }}>
                {overviewData.cards.insufficient_data_count}
              </span>
              <span className="record-kpi-sub">Below cohort size or assessment threshold</span>
            </div>
          </div>

          {/* Teacher Roll Table */}
          <div className="record-table-wrap">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Teacher Name</th>
                  {selectedCampus === 'all' && <th>Campus</th>}
                  <th>Assigned Classes</th>
                  <th className="num-col">Evaluated Students</th>
                  <th className="num-col">Composite Average</th>
                  <th>Performance Status</th>
                  <th>Alert Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {overviewData.teachers.length === 0 ? (
                  <tr><td colSpan={selectedCampus === 'all' ? 8 : 7} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No teachers match current criteria.</td></tr>
                ) : (
                  overviewData.teachers.map((t: any) => (
                    <tr key={t.teacher_id}>
                      <td>
                        <strong>{t.name}</strong>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{t.email}</div>
                      </td>
                      {selectedCampus === 'all' && (
                        <td>
                          <span className="record-badge" style={{ background: '#f3e8ff', color: '#6f42c1', fontWeight: 600 }}>
                            {t.campus_name || t.campus_code || 'Main'}
                          </span>
                        </td>
                      )}
                      <td>{t.assigned_classes_count} Classes</td>
                      <td className="num-col">{t.total_students_evaluated}</td>
                      <td className="num-col" style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        {t.composite_average !== null ? `${t.composite_average}%` : '—'}
                      </td>
                      <td>
                        <span className={`record-status-pill status-${t.status.replace('_', '-')}`}>
                          {t.status_display}
                        </span>
                      </td>
                      <td>
                        {t.has_active_alert ? (
                          <span className="record-status-pill status-needs-support" style={{ fontSize: '0.74rem' }}>
                            <AlertTriangle size={12} /> Active Support
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.82rem' }}>None</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="record-btn-secondary"
                          style={{ padding: '4px 12px', fontSize: '0.82rem' }}
                          onClick={() => loadTeacherDetail(t.teacher_id)}
                        >
                          View Detail
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* VIEW 2: TEACHER DETAIL DOSSIER */}
      {selectedTeacherId && teacherDetail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!isTeacherSelf && (
            <div>
              <button
                className="record-btn-secondary"
                onClick={() => { setSelectedTeacherId(null); setTeacherDetail(null); loadOverview(); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowLeft size={16} />
                <span>Back to Overview</span>
              </button>
            </div>
          )}

          {/* Teacher Header Card */}
          <div className="record-header-card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>{teacherDetail.teacher.name}</h2>
              <div style={{ color: '#64748b', fontSize: '0.88rem' }}>{teacherDetail.teacher.email}</div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="record-btn-primary"
                onClick={() => { setNoteModal(true); setNoteContent(''); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} />
                <span>{isTeacherSelf ? 'Add Self-Reflection' : 'Add Leadership Observation'}</span>
              </button>
            </div>
          </div>

          {/* Class Teacher Overall Average (if assigned) */}
          {teacherDetail.class_teacher_summary && (
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '14px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: '#5b21b6', fontSize: '0.95rem' }}>
                  Class Teacher Responsibilities — {teacherDetail.class_teacher_summary.class_name}
                </strong>
                <div style={{ fontSize: '0.84rem', color: '#6d28d9' }}>
                  Overall cohort average across all subjects for this section.
                </div>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#5b21b6' }}>
                {teacherDetail.class_teacher_summary.overall_section_average}%
              </div>
            </div>
          )}

          {/* Assigned Classes & Subjects Performance Matrix */}
          <div className="record-table-wrap">
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Curriculum & Subject Performance Breakdown</h3>
            </div>
            <table className="record-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Subject</th>
                  <th className="num-col">Cohort Size</th>
                  <th className="num-col">Assessments</th>
                  <th className="num-col">Class Avg %</th>
                  <th className="num-col">Pass Rate %</th>
                  <th className="num-col">Campus Diff</th>
                  <th className="num-col">Value-Added Delta</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teacherDetail.classes.map((c: any, idx: number) => (
                  <tr key={idx}>
                    <td><strong>{c.class_name}</strong></td>
                    <td>{c.subject_name}</td>
                    <td className="num-col">{c.student_count}</td>
                    <td className="num-col">{c.assessments_count}</td>
                    <td className="num-col" style={{ fontWeight: 700 }}>
                      {c.class_average !== null ? `${c.class_average}%` : '—'}
                    </td>
                    <td className="num-col">
                      {c.pass_rate !== null ? `${c.pass_rate}%` : '—'}
                    </td>
                    <td className="num-col" style={{ color: c.campus_diff >= 0 ? '#16a34a' : '#dc2626' }}>
                      {c.campus_diff !== null ? `${c.campus_diff > 0 ? '+' : ''}${c.campus_diff} pts` : '—'}
                    </td>
                    <td className="num-col" style={{ color: '#2563eb' }}>
                      {c.value_added_delta !== null ? `+${c.value_added_delta}%` : '—'}
                    </td>
                    <td>
                      <span className={`record-status-pill status-${c.status.replace('_', '-')}`}>
                        {c.status_display}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Active & Past Support Alerts */}
          {!isTeacherSelf && (
            <div className="record-table-wrap">
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Supportive Intervention Alerts & Action Plans</h3>
              </div>
              <table className="record-table">
                <thead>
                  <tr>
                    <th>Term</th>
                    <th>Class / Subject</th>
                    <th>Identified Need</th>
                    <th>Status</th>
                    <th>Support Plan</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherDetail.alerts.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>No active or past support alerts.</td></tr>
                  ) : (
                    teacherDetail.alerts.map((al: any) => (
                      <tr key={al.id}>
                        <td>{al.term_name}</td>
                        <td>{al.class_name} ({al.subject_name})</td>
                        <td>{al.trigger_reason}</td>
                        <td>
                          <span className={`record-status-pill ${al.status === 'open' ? 'status-needs-support' : al.status === 'resolved' ? 'status-on-track' : 'status-watch'}`}>
                            {al.status_display}
                          </span>
                        </td>
                        <td>{al.action_plan || 'Mentoring in progress'}</td>
                        <td>
                          {al.status === 'suggested' && (
                            <button
                              className="record-btn-primary"
                              style={{ padding: '3px 10px', fontSize: '0.78rem' }}
                              onClick={() => handleAlertAction(al.id, 'confirm')}
                            >
                              Confirm Alert
                            </button>
                          )}
                          {al.status === 'open' && (
                            <button
                              className="record-btn-secondary"
                              style={{ padding: '3px 10px', fontSize: '0.78rem' }}
                              onClick={() => handleAlertAction(al.id, 'resolve')}
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes Section */}
          <div className="record-table-wrap" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '1rem', fontWeight: 700 }}>
              {isTeacherSelf ? 'My Self-Reflection History' : 'Leadership Observations & Notes'}
            </h3>
            {teacherDetail.notes.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.88rem' }}>No notes recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {teacherDetail.notes.map((n: any) => (
                  <div key={n.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.8rem', color: '#64748b' }}>
                      <span><strong>{n.author_name}</strong> ({n.kind === 'self_reflection' ? 'Self-Reflection' : 'Leadership Note'})</span>
                      <span>{n.created_at}</span>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#1e293b' }}>{n.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CRITERIA & LIVE PREVIEW MODAL */}
      {criteriaModal && (
        <div className="record-modal-overlay">
          <div className="record-modal" style={{ maxWidth: '640px' }}>
            <div className="record-modal-header">
              <h3>Versioned Criteria & Live Impact Simulation</h3>
              <button className="record-btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={() => setCriteriaModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="record-modal-body">
              <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b' }}>
                Adjust threshold values and preview how many teachers would match before saving a new criteria version.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                    Min Students per Class (N)
                  </label>
                  <input
                    type="number"
                    className="record-input"
                    value={criteriaForm.min_students}
                    onChange={e => setCriteriaForm({ ...criteriaForm, min_students: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                    Min Assessments (M)
                  </label>
                  <input
                    type="number"
                    className="record-input"
                    value={criteriaForm.min_assessments}
                    onChange={e => setCriteriaForm({ ...criteriaForm, min_assessments: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                    Campus Diff Threshold (pts below)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    className="record-input"
                    value={criteriaForm.diff_campus_threshold}
                    onChange={e => setCriteriaForm({ ...criteriaForm, diff_campus_threshold: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                    Pass Rate Benchmark (%)
                  </label>
                  <input
                    type="number"
                    className="record-input"
                    value={criteriaForm.pass_rate_threshold}
                    onChange={e => setCriteriaForm({ ...criteriaForm, pass_rate_threshold: Number(e.target.value) })}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <button
                  className="record-btn-secondary"
                  onClick={handleTestPreview}
                  disabled={simulating}
                  style={{ width: '100%', padding: '10px', display: 'flex', justifyContent: 'center', gap: '8px' }}
                >
                  <RefreshCw size={15} className={simulating ? 'spin-anim' : ''} />
                  <span>Test Live Simulation</span>
                </button>
              </div>

              {previewResult && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <strong style={{ fontSize: '0.88rem', display: 'block', marginBottom: '8px' }}>
                    Simulated Impact Across {previewResult.total_assignments_evaluated} Teaching Assignments:
                  </strong>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span className="record-status-pill status-on-track">On track: {previewResult.counts_by_status.on_track}</span>
                    <span className="record-status-pill status-watch">Watch: {previewResult.counts_by_status.watch}</span>
                    <span className="record-status-pill status-needs-support">Needs support: {previewResult.counts_by_status.needs_support}</span>
                    <span className="record-status-pill status-insufficient">Insufficient data: {previewResult.counts_by_status.insufficient_data}</span>
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                  Explanation of Change (Required for Audit):
                </label>
                <textarea
                  className="record-input"
                  style={{ width: '100%', height: '65px', boxSizing: 'border-box' }}
                  placeholder="Explain why criteria are being revised..."
                  value={criteriaForm.explanation_of_change}
                  onChange={e => setCriteriaForm({ ...criteriaForm, explanation_of_change: e.target.value })}
                />
              </div>
            </div>
            <div className="record-modal-footer">
              <button className="record-btn-secondary" onClick={() => setCriteriaModal(false)}>
                Cancel
              </button>
              <button className="record-btn-primary" onClick={handleSaveCriteria}>
                Publish Criteria Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD NOTE MODAL */}
      {noteModal && (
        <div className="record-modal-overlay">
          <div className="record-modal">
            <div className="record-modal-header">
              <h3>{isTeacherSelf ? 'Record Self-Reflection' : 'Add Leadership Observation'}</h3>
              <button className="record-btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={() => setNoteModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="record-modal-body">
              {!isTeacherSelf && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>Note Visibility:</label>
                  <select className="record-select" style={{ width: '100%' }} value={noteKind} onChange={e => setNoteKind(e.target.value as any)}>
                    <option value="private_leadership">Private Leadership Note (Hidden from teacher)</option>
                    <option value="self_reflection">Shared Developmental Note</option>
                  </select>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>Content:</label>
                <textarea
                  className="record-input"
                  style={{ width: '100%', height: '100px', boxSizing: 'border-box' }}
                  placeholder={isTeacherSelf ? 'Write your personal reflections and instructional goals...' : 'Document observation notes, strengths, and coaching plans...'}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                />
              </div>
            </div>
            <div className="record-modal-footer">
              <button className="record-btn-secondary" onClick={() => setNoteModal(false)}>Cancel</button>
              <button className="record-btn-primary" onClick={handleAddNote}>Save Note</button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT MODAL */}
      {confirmExportModal && (
        <div className="record-modal-overlay">
          <div className="record-modal">
            <div className="record-modal-header">
              <h3>Confirm Teacher Performance Export</h3>
              <button className="record-btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={() => setConfirmExportModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="record-modal-body">
              <p style={{ margin: 0, fontSize: '0.92rem', color: '#334155' }}>
                You are about to export performance analytics for <strong>{overviewData?.teachers?.length || 0} teachers</strong>.
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', fontSize: '0.84rem', color: '#64748b' }}>
                • Dual-sheet Excel format (.xlsx)<br />
                • Neutral and developmental status classifications.<br />
                • Formula-injection protection enabled.
              </div>
            </div>
            <div className="record-modal-footer">
              <button className="record-btn-secondary" onClick={() => setConfirmExportModal(false)}>Cancel</button>
              <button className="record-btn-primary" onClick={handleExport}>Proceed with Download</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
