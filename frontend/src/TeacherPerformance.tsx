import React, { useState, useEffect, useCallback } from 'react';
import {
  Award, TrendingUp, Users, CheckCircle2, AlertTriangle, AlertCircle,
  Download, RefreshCw, SlidersHorizontal, ArrowLeft, Plus, X, MessageSquare,
  ShieldAlert, BookOpen, Clock, HeartHandshake, Globe, Check,
  BarChart3, Layers, FileText
} from 'lucide-react';
import { type User } from './api';
import { getScoreColorStyle, getRiskBadgeStyle, getDifferenceStyle } from './performanceColors';
import './record.css';

interface TeacherPerformanceProps {
  user: User;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  activeCampusId?: number | null;
  campuses?: any[];
  page?: string;
  initialTab?: 'evaluation' | 'criteria';
  onNavigateTab?: (tab: 'evaluation' | 'criteria') => void;
}

export default function TeacherPerformance({
  user,
  notify,
  activeCampusId,
  campuses = [],
  page,
  initialTab = 'evaluation',
  onNavigateTab,
}: TeacherPerformanceProps) {
  // Navigation tab state ('evaluation' | 'criteria')
  const [activeTab, setActiveTab] = useState<'evaluation' | 'criteria'>(
    initialTab || (['Set Criteria', 'Teacher Criteria'].includes(page || '') ? 'criteria' : 'evaluation')
  );

  const [selectedCampus, setSelectedCampus] = useState<string>(
    activeCampusId ? String(activeCampusId) : (campuses[0]?.id ? String(campuses[0].id) : '')
  );

  // Sync tab with page / initialTab changes
  useEffect(() => {
    if (page) {
      if (['Set Criteria', 'Teacher Criteria'].includes(page)) {
        setActiveTab('criteria');
      } else if (['Evaluation', 'Teacher Evaluation', 'Teacher Performance'].includes(page)) {
        setActiveTab('evaluation');
      }
    }
  }, [page]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabSwitch = (tab: 'evaluation' | 'criteria') => {
    setActiveTab(tab);
    if (onNavigateTab) {
      onNavigateTab(tab);
    }
  };

  const isTeacherSelf = user.role === 'teacher';

  // ==========================================
  // EVALUATION STATE
  // ==========================================
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
  const [noteModal, setNoteModal] = useState<boolean>(false);
  const [noteContent, setNoteContent] = useState<string>('');
  const [noteKind, setNoteKind] = useState<'private_leadership' | 'self_reflection'>('private_leadership');

  // ==========================================
  // CRITERIA STATE
  // ==========================================
  const [criteriaLoading, setCriteriaLoading] = useState<boolean>(false);
  const [activeCriteriaData, setActiveCriteriaData] = useState<any>(null);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);
  const [criteriaCampuses, setCriteriaCampuses] = useState<any[]>([]);
  const [criteriaForm, setCriteriaForm] = useState({
    min_students: 10,
    min_assessments: 2,
    diff_campus_threshold: 10.0,
    drop_term_threshold: 8.0,
    pass_rate_threshold: 60.0,
    class_avg_threshold: 50.0,
    include_class_teacher: true,
    class_teacher_weight: 15,
    show_all_classes: true,
    aggregation_mode: 'weighted_by_students',
    weights: {
      class_average: 40,
      pass_rate: 30,
      campus_diff: 20,
      class_teacher: 10,
    },
    grade_levels: ['all'],
    explanation_of_change: '',
    apply_to_all_campuses: false,
  });

  const [previewResult, setPreviewResult] = useState<any>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  // Load Overview Data
  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      if (isTeacherSelf) {
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

  // Load Criteria Data
  const loadCriteria = useCallback(async () => {
    if (isTeacherSelf) return;
    setCriteriaLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (selectedCampus) qParams.set('campus', selectedCampus);
      const res = await fetch(`/api/v1/teacher-performance/criteria/?${qParams.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to load criteria settings.');
      }
      const json = await res.json();
      setActiveCriteriaData(json.active_criteria);
      setVersionHistory(json.version_history || []);
      if (json.campuses && json.campuses.length) {
        setCriteriaCampuses(json.campuses);
      }

      if (json.active_criteria) {
        const ac = json.active_criteria;
        setCriteriaForm(prev => ({
          ...prev,
          min_students: ac.min_students ?? 10,
          min_assessments: ac.min_assessments ?? 2,
          diff_campus_threshold: ac.diff_campus_threshold ?? 10.0,
          drop_term_threshold: ac.drop_term_threshold ?? 8.0,
          pass_rate_threshold: ac.pass_rate_threshold ?? 60.0,
          class_avg_threshold: ac.class_avg_threshold ?? 50.0,
          include_class_teacher: ac.include_class_teacher ?? true,
          class_teacher_weight: ac.class_teacher_weight ?? 15,
          show_all_classes: ac.show_all_classes ?? true,
          aggregation_mode: ac.aggregation_mode ?? 'weighted_by_students',
          weights: ac.weights || prev.weights,
          grade_levels: ac.grade_levels || ['all'],
          explanation_of_change: '',
          apply_to_all_campuses: json.is_all_campuses ?? false,
        }));
      }
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setCriteriaLoading(false);
    }
  }, [isTeacherSelf, selectedCampus, notify]);

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
    if (activeTab === 'evaluation') {
      loadOverview();
    } else if (activeTab === 'criteria') {
      loadCriteria();
    }
  }, [activeTab, loadOverview, loadCriteria]);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch {}
  }, [selectedTeacherId, activeTab]);

  // Run live criteria preview simulation
  const handleTestPreview = async () => {
    setSimulating(true);
    try {
      const res = await fetch('/api/v1/teacher-performance/criteria/preview/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          campus: selectedCampus,
          ...criteriaForm,
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Simulation preview failed.');
      }
      const json = await res.json();
      setPreviewResult(json);
      notify('Live simulation complete across published class assessments.', 'info');
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setSimulating(false);
    }
  };

  // Save new criteria version
  const handleSaveCriteria = async () => {
    if (!criteriaForm.explanation_of_change.trim()) {
      notify('An explanation of change is required for governance and audit tracking before publishing criteria.', 'error');
      return;
    }
    try {
      const res = await fetch('/api/v1/teacher-performance/criteria/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          campus: selectedCampus,
          ...criteriaForm,
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to publish criteria.');
      }
      const json = await res.json();
      notify(`Criteria version ${json.version} published successfully! Applied to ${json.applied_campuses_count || 1} campus(es).`, 'success');
      loadCriteria();
      setPreviewResult(null);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Alert Action (Confirm, Resolve, etc.)
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
      notify('Observation note recorded successfully.', 'success');
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

  const activeCampusList = criteriaCampuses.length ? criteriaCampuses : campuses;
  const isMultiCampusUser = !isTeacherSelf && (activeCampusList.length > 1 || user.role === 'organisation_admin' || user.is_superuser);

  return (
    <div className="record-container">
      {/* Top Header Card */}
      <div className="record-header-card">
        <div className="record-title-row">
          <div className="record-title-group">
            <h1>
              <Award size={24} color="#6f42c1" />
              <span>
                {activeTab === 'criteria' ? 'Teacher Criteria' : 'Teacher Performance'}
              </span>
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {!isTeacherSelf && isMultiCampusUser && user.role !== 'principal' && (
              <select
                className="record-select"
                value={selectedCampus}
                onChange={e => setSelectedCampus(e.target.value)}
              >
                <option value="all">🌐 All Campuses (Consolidated)</option>
                {activeCampusList.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            )}

            {activeTab === 'evaluation' && !isTeacherSelf && (
              <button
                className="record-download-btn"
                onClick={() => setConfirmExportModal(true)}
                disabled={loading || !overviewData?.teachers?.length}
              >
                <Download size={16} />
                <span>Download Excel (.xlsx)</span>
                <span className="record-count-badge">{overviewData?.teachers?.length || 0} teachers</span>
              </button>
            )}
          </div>
        </div>

        {/* Subnavigation Tabs */}
        {!isTeacherSelf && (
          <div className="record-subnav-pills">
            <button
              type="button"
              className={`record-nav-btn ${activeTab === 'evaluation' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('evaluation')}
            >
              <Award size={16} />
              <span>Evaluation</span>
              {overviewData?.cards?.evaluated_teachers !== undefined && (
                <span
                  className="record-count-badge"
                  style={{
                    background: activeTab === 'evaluation' ? 'rgba(111, 66, 193, 0.25)' : '#e2e8f0',
                    color: activeTab === 'evaluation' ? '#6f42c1' : '#64748b'
                  }}
                >
                  {overviewData.cards.evaluated_teachers}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`record-nav-btn ${activeTab === 'criteria' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('criteria')}
            >
              <SlidersHorizontal size={16} />
              <span>Set Criteria</span>
              {activeCriteriaData?.version && (
                <span
                  className="record-count-badge"
                  style={{
                    background: activeTab === 'criteria' ? 'rgba(111, 66, 193, 0.25)' : '#e2e8f0',
                    color: activeTab === 'criteria' ? '#6f42c1' : '#64748b'
                  }}
                >
                  v{activeCriteriaData.version}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Filter Bar (Evaluation mode only) */}
        {activeTab === 'evaluation' && !selectedTeacherId && !isTeacherSelf && (
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

      {/* ========================================================== */}
      {/* TAB 1: TEACHER EVALUATION VIEW                             */}
      {/* ========================================================== */}
      {activeTab === 'evaluation' && (
        <>
          {/* VIEW 1A: OVERVIEW ROLL TABLE & KPIS */}
          {!selectedTeacherId && !isTeacherSelf && overviewData && (
            <>
              <div className="record-kpi-grid">
                <div className="record-kpi-card">
                  <span className="record-kpi-title">Evaluated Teachers</span>
                  <span className="record-kpi-value">{overviewData.cards.evaluated_teachers}</span>
                </div>
                <div className="record-kpi-card kpi-best">
                  <span className="record-kpi-title">On Track</span>
                  <span className="record-kpi-value" style={{ color: '#059669' }}>
                    {overviewData.cards.on_track_count}
                  </span>
                </div>
                <div className="record-kpi-card kpi-watch">
                  <span className="record-kpi-title">Watch</span>
                  <span className="record-kpi-value" style={{ color: '#d97706' }}>
                    {overviewData.cards.watch_count}
                  </span>
                </div>
                <div className="record-kpi-card kpi-risk">
                  <span className="record-kpi-title">Needs Support</span>
                  <span className="record-kpi-value" style={{ color: '#dc2626' }}>
                    {overviewData.cards.needs_support_count}
                  </span>
                </div>
                <div className="record-kpi-card kpi-insufficient">
                  <span className="record-kpi-title">Insufficient Data</span>
                  <span className="record-kpi-value" style={{ color: '#64748b' }}>
                    {overviewData.cards.insufficient_data_count}
                  </span>
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
                      <tr>
                        <td colSpan={selectedCampus === 'all' ? 8 : 7} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                          No teachers match current criteria.
                        </td>
                      </tr>
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
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span>{t.assigned_classes_count} Classes</span>
                              {t.is_class_teacher && (
                                <span
                                  className="record-badge"
                                  style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.74rem', fontWeight: 600 }}
                                  title={`Assigned Class Teacher for ${t.class_teacher_for}`}
                                >
                                  Class Teacher ({t.class_teacher_for})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="num-col">{t.total_students_evaluated}</td>
                          <td className="num-col">
                            {t.composite_average !== null ? (
                              <span className="score-pill" style={getScoreColorStyle(t.composite_average)}>
                                {t.composite_average}%
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
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

          {/* VIEW 1B: TEACHER DETAIL DOSSIER */}
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

              {/* Class Teacher Overall Section Average (if assigned) */}
              {teacherDetail.class_teacher_summary && (
                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#5b21b6', fontSize: '1rem', display: 'block', marginBottom: '4px' }}>
                      Class Teacher Responsibilities — {teacherDetail.class_teacher_summary.class_name}
                    </strong>
                    <div style={{ fontSize: '0.85rem', color: '#6d28d9' }}>
                      Overall cohort average across all subjects for this section ({teacherDetail.class_teacher_summary.total_students} students enrolled).
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#5b21b6' }}>
                      {teacherDetail.class_teacher_summary.overall_section_average}%
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600 }}>Section Overall Benchmark</span>
                  </div>
                </div>
              )}

              {/* Assigned Classes & Subjects Performance Breakdown Table */}
              <div className="record-table-wrap">
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                    Assigned Classes & Subjects Breakdown ({teacherDetail.classes?.length || 0} Classes)
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Performance calculated against active criteria version {teacherDetail.criteria_version || 1}
                  </span>
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
                    {teacherDetail.classes.length === 0 ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>No class assignments found.</td></tr>
                    ) : (
                      teacherDetail.classes.map((c: any, idx: number) => (
                        <tr key={idx}>
                          <td>
                            <strong>{c.class_name}</strong>
                            {c.grade_level && <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'block' }}>{c.grade_level}</span>}
                          </td>
                          <td>{c.subject_name}</td>
                          <td className="num-col">{c.student_count}</td>
                          <td className="num-col">{c.assessments_count}</td>
                          <td className="num-col">
                            {c.class_average !== null ? (
                              <span className="score-pill" style={getScoreColorStyle(c.class_average)}>
                                {c.class_average}%
                              </span>
                            ) : '—'}
                          </td>
                          <td className="num-col">
                            {c.pass_rate !== null ? (
                              <span className="score-pill" style={getScoreColorStyle(c.pass_rate, 60)}>
                                {c.pass_rate}%
                              </span>
                            ) : '—'}
                          </td>
                          <td className="num-col">
                            {c.campus_diff !== null ? (
                              <span style={getDifferenceStyle(c.campus_diff)}>
                                {c.campus_diff > 0 ? '+' : ''}{c.campus_diff} pts
                              </span>
                            ) : '—'}
                          </td>
                          <td className="num-col">
                            {c.value_added_delta !== null ? (
                              <span style={getDifferenceStyle(c.value_added_delta)}>
                                {c.value_added_delta > 0 ? '+' : ''}{c.value_added_delta}%
                              </span>
                            ) : '—'}
                          </td>
                          <td>
                            <span className={`record-status-pill status-${c.status.replace('_', '-')}`}>
                              {c.status_display}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
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
        </>
      )}

      {/* ========================================================== */}
      {/* TAB 2: SET CRITERIA VIEW                                   */}
      {/* ========================================================== */}
      {activeTab === 'criteria' && !isTeacherSelf && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Active Criteria Banner */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="record-badge" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.82rem' }}>
                ACTIVE VERSION {activeCriteriaData?.version || 1}
              </span>
              <strong style={{ fontSize: '1rem', color: '#0f172a' }}>
                {activeCriteriaData?.name || 'Standard Supportive Criteria'}
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                className="record-btn-secondary"
                onClick={loadCriteria}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} className={criteriaLoading ? 'spin-anim' : ''} />
                <span>Reset to Active</span>
              </button>
            </div>
          </div>

          {/* Section 1: Campus Scope & Multi-Campus Options */}
          {isMultiCampusUser && (
            <div className="record-table-wrap" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Globe size={18} color="#6f42c1" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Campus Scope</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <input
                    type="checkbox"
                    checked={criteriaForm.apply_to_all_campuses}
                    onChange={e => setCriteriaForm({ ...criteriaForm, apply_to_all_campuses: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                    Apply across all campuses
                  </strong>
                </label>
              </div>
            </div>
          )}

          {/* Section 2: Class Scope & Multi-Class Rules */}
          <div className="record-table-wrap" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <Layers size={18} color="#6f42c1" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Class Scope & Evaluation Rules
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              {/* Multi-Class Aggregation Method */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Multi-Class Aggregation
                </label>
                <select
                  className="record-select"
                  style={{ width: '100%' }}
                  value={criteriaForm.aggregation_mode}
                  onChange={e => setCriteriaForm({ ...criteriaForm, aggregation_mode: e.target.value })}
                >
                  <option value="weighted_by_students">Student-Weighted Average</option>
                  <option value="equal_average">Equal Class Average</option>
                </select>
              </div>

              {/* Class Teacher Duties */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: criteriaForm.include_class_teacher ? '8px' : '0' }}>
                  <input
                    type="checkbox"
                    checked={criteriaForm.include_class_teacher}
                    onChange={e => setCriteriaForm({ ...criteriaForm, include_class_teacher: e.target.checked })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <strong style={{ fontSize: '0.82rem' }}>
                    Include Class Teacher Section
                  </strong>
                </label>
                {criteriaForm.include_class_teacher && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.78rem', color: '#475569' }}>Weight:</span>
                    <input
                      type="number"
                      className="record-input"
                      style={{ width: '60px', padding: '4px 6px' }}
                      value={criteriaForm.class_teacher_weight}
                      onChange={e => setCriteriaForm({ ...criteriaForm, class_teacher_weight: Number(e.target.value) })}
                    />
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>%</span>
                  </div>
                )}
              </div>

              {/* Min Students Threshold */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Min Students per Class (N)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="record-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={criteriaForm.min_students}
                  onChange={e => setCriteriaForm({ ...criteriaForm, min_students: Number(e.target.value) })}
                />
              </div>

              {/* Min Assessments Threshold */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Min Published Assessments (M)
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="record-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={criteriaForm.min_assessments}
                  onChange={e => setCriteriaForm({ ...criteriaForm, min_assessments: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Class Visibility Toggle */}
            <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={criteriaForm.show_all_classes}
                  onChange={e => setCriteriaForm({ ...criteriaForm, show_all_classes: e.target.checked })}
                  style={{ width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                  Show all assigned classes in teacher evaluation
                </span>
              </label>
            </div>
          </div>

          {/* Section 3: Performance Measurement Benchmarks */}
          <div className="record-table-wrap" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <BarChart3 size={18} color="#6f42c1" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Performance Benchmarks
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Student Pass Rate Benchmark (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  className="record-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={criteriaForm.pass_rate_threshold}
                  onChange={e => setCriteriaForm({ ...criteriaForm, pass_rate_threshold: Number(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Class Average Benchmark (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  className="record-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={criteriaForm.class_avg_threshold}
                  onChange={e => setCriteriaForm({ ...criteriaForm, class_avg_threshold: Number(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Campus Difference Tolerance (pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="50"
                  className="record-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={criteriaForm.diff_campus_threshold}
                  onChange={e => setCriteriaForm({ ...criteriaForm, diff_campus_threshold: Number(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  Term-over-Term Drop Tolerance (pts)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="50"
                  className="record-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={criteriaForm.drop_term_threshold}
                  onChange={e => setCriteriaForm({ ...criteriaForm, drop_term_threshold: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Developmental Classification Guide Card */}
            <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
                Classification Tiers:
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="record-status-pill status-on-track">On track (≥{criteriaForm.pass_rate_threshold}%)</span>
                <span className="record-status-pill status-watch">Watch (±{criteriaForm.diff_campus_threshold / 2} pts)</span>
                <span className="record-status-pill status-needs-support">Needs support (&gt;{criteriaForm.diff_campus_threshold} pts diff)</span>
                <span className="record-status-pill status-insufficient">Insufficient data (&lt;{criteriaForm.min_students} students)</span>
              </div>
            </div>
          </div>

          {/* Section 4: Live Impact Simulation Tool */}
          <div className="record-table-wrap" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: previewResult ? '14px' : '0', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Live Impact Simulation
              </h3>

              <button
                className="record-btn-secondary"
                onClick={handleTestPreview}
                disabled={simulating}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontWeight: 600 }}
              >
                <RefreshCw size={15} className={simulating ? 'spin-anim' : ''} />
                <span>Test Live Simulation</span>
              </button>
            </div>

            {previewResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '14px', padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <strong style={{ fontSize: '0.92rem', color: '#5b21b6' }}>
                      Simulation Result: {previewResult.total_assignments_evaluated} Teaching Assignments across {previewResult.total_teachers_evaluated} Teachers
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#7c3aed', fontWeight: 600 }}>
                      Flagged for mentoring: {previewResult.flagged_teachers_count} teachers
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span className="record-status-pill status-on-track">
                      On track: {previewResult.counts_by_status.on_track}
                    </span>
                    <span className="record-status-pill status-watch">
                      Watch: {previewResult.counts_by_status.watch}
                    </span>
                    <span className="record-status-pill status-needs-support">
                      Needs support: {previewResult.counts_by_status.needs_support}
                    </span>
                    <span className="record-status-pill status-insufficient">
                      Insufficient data: {previewResult.counts_by_status.insufficient_data}
                    </span>
                  </div>
                </div>

                {/* Sample Teacher Multi-Class Preview */}
                {previewResult.sample_preview && (
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <strong style={{ fontSize: '0.88rem', color: '#1e293b' }}>
                        Sample Multi-Class Preview: {previewResult.sample_preview.teacher_name} ({previewResult.sample_preview.classes_count} Classes)
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        Aggregated with {criteriaForm.aggregation_mode === 'weighted_by_students' ? 'Student-Weighted' : 'Equal'} Average
                      </span>
                    </div>

                    <table className="record-table" style={{ fontSize: '0.82rem' }}>
                      <thead>
                        <tr>
                          <th>Class</th>
                          <th>Subject</th>
                          <th className="num-col">Cohort</th>
                          <th className="num-col">Class Avg %</th>
                          <th className="num-col">Pass Rate %</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewResult.sample_preview.classes.map((sc: any, sIdx: number) => (
                          <tr key={sIdx}>
                            <td><strong>{sc.class_name}</strong></td>
                            <td>{sc.subject_name}</td>
                            <td className="num-col">{sc.student_count}</td>
                            <td className="num-col">{sc.class_average !== null ? `${sc.class_average}%` : '—'}</td>
                            <td className="num-col">{sc.pass_rate !== null ? `${sc.pass_rate}%` : '—'}</td>
                            <td>
                              <span className={`record-status-pill status-${sc.status.replace('_', '-')}`}>
                                {sc.status_display}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 5: Governance & Publish Version */}
          <div className="record-table-wrap" style={{ padding: '18px 20px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700 }}>
              Publish Criteria Version
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, marginBottom: '6px' }}>
                  Reason for change:
                </label>
                <textarea
                  className="record-input"
                  style={{ width: '100%', height: '70px', boxSizing: 'border-box' }}
                  placeholder="e.g. Updated term benchmarks or class weights"
                  value={criteriaForm.explanation_of_change}
                  onChange={e => setCriteriaForm({ ...criteriaForm, explanation_of_change: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="record-btn-secondary"
                  onClick={loadCriteria}
                >
                  Cancel & Reset
                </button>
                <button
                  type="button"
                  className="record-btn-primary"
                  onClick={handleSaveCriteria}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 22px' }}
                >
                  <Check size={16} />
                  <span>Publish Criteria Version</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 6: Version History Table */}
          <div className="record-table-wrap">
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Criteria Version History</h3>
            </div>
            <table className="record-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Published Date</th>
                  <th>Author</th>
                  <th className="num-col">Min Students</th>
                  <th className="num-col">Pass Rate</th>
                  <th className="num-col">Class Avg</th>
                  <th>Aggregation</th>
                  <th>Explanation of Change</th>
                </tr>
              </thead>
              <tbody>
                {versionHistory.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>No version history recorded yet.</td></tr>
                ) : (
                  versionHistory.map((vh: any) => (
                    <tr key={vh.version}>
                      <td><strong>v{vh.version}</strong></td>
                      <td>
                        {vh.active ? (
                          <span className="record-badge" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                            Active
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Archived</span>
                        )}
                      </td>
                      <td>{vh.created_at}</td>
                      <td>{vh.created_by || 'Leadership'}</td>
                      <td className="num-col">{vh.min_students}</td>
                      <td className="num-col">{vh.pass_rate_threshold}%</td>
                      <td className="num-col">{vh.class_avg_threshold}%</td>
                      <td>
                        <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                          {vh.aggregation_mode === 'weighted_by_students' ? 'Student-Weighted' : 'Equal Class Avg'}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px', fontSize: '0.82rem', color: '#475569' }}>
                        {vh.explanation_of_change || 'Initial baseline version'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* MODALS                                                     */}
      {/* ========================================================== */}
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

      {/* EXPORT CONFIRMATION MODAL */}
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
