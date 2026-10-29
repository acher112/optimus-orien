import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight,
  Download, FileSpreadsheet, FileText, Filter, Plus, Printer, RefreshCw, Search,
  ShieldAlert, Sparkles, UserCheck, Users, X, Edit2, Trash2, Eye, Clock,
  CheckCheck, Info, SlidersHorizontal, BookOpen, HeartHandshake, TrendingUp, TrendingDown,
  Minus, ShieldCheck
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { list, request, type User } from './api';
import ExportMenu from './ExportMenu';
import { FilterBar } from './FilterBar';
import './hr.css';

type R = Record<string, any>;
type RiskTab = 'list' | 'insufficient' | 'criteria' | 'cases';

interface StudentsAtRiskProps {
  user: User;
  notify: (m: string) => void;
  initialTab?: string;
  onNavigate?: (page: string) => void;
}

export default function StudentsAtRisk({ user, notify, initialTab, onNavigate }: StudentsAtRiskProps) {
  const [tab, setTab] = useState<RiskTab>('list');
  const [schools, setSchools] = useState<R[]>([]);
  const [school, setSchool] = useState('');
  const [classes, setClasses] = useState<R[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bump, setBump] = useState(0);

  // Main evaluation response
  const [criteriaActive, setCriteriaActive] = useState(false);
  const [activeCriteria, setActiveCriteria] = useState<R | null>(null);
  const [flaggedStudents, setFlaggedStudents] = useState<R[]>([]);
  const [insufficientStudents, setInsufficientStudents] = useState<R[]>([]);
  const [summary, setSummary] = useState<R>({
    total_at_risk: 0,
    high_risk: 0,
    medium_risk: 0,
    low_risk: 0,
    insufficient_data_count: 0,
    by_class: [],
    by_rule_type: {}
  });

  // Filters
  const [filters, setFilters] = useState<Record<string, any>>({});

  // Slide-out Evidence Drawer
  const [drawerStudent, setDrawerStudent] = useState<R | null>(null);

  // Case creation modal
  const [caseModal, setCaseModal] = useState<R | null>(null);
  const [caseTitle, setCaseTitle] = useState('');
  const [casePriority, setCasePriority] = useState('medium');
  const [caseReason, setCaseReason] = useState('');
  const [caseSubmitting, setCaseSubmitting] = useState(false);

  // Dismiss modal
  const [dismissModal, setDismissModal] = useState<R | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [dismissUntil, setDismissUntil] = useState('');
  const [dismissSubmitting, setDismissSubmitting] = useState(false);

  // Criteria tab state
  const [criteriaData, setCriteriaData] = useState<{
    active_criteria: R | null;
    all_versions: R[];
    starter_template: R;
  } | null>(null);
  const [editingCriteria, setEditingCriteria] = useState<R | null>(null);
  const [savingCriteria, setSavingCriteria] = useState(false);

  const isManager = ['organisation_admin', 'school_admin', 'principal'].includes(user.role) || user.is_superuser;

  // Handle initial tab routing
  useEffect(() => {
    if (initialTab) {
      const lower = initialTab.toLowerCase().trim();
      if (['criteria', 'risk criteria', 'rules'].includes(lower)) setTab('criteria');
      else if (['cases', 'review cases', 'review'].includes(lower)) setTab('cases');
      else if (['insufficient', 'not enough data'].includes(lower)) setTab('insufficient');
      else setTab('list');
    }
  }, [initialTab]);

  // Load reference schools and classes
  useEffect(() => {
    list<R>('schools').then(s => {
      setSchools(s);
      if (s.length === 1 && !school) {
        setSchool(String(s[0].id));
      }
    }).catch(() => {});
    list<R>('classes').then(setClasses).catch(() => {});
  }, []);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (school) params.set('school', school);
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'all') {
        params.set(k, String(v));
      }
    });
    return params.toString() ? `?${params.toString()}` : '';
  }, [school, filters]);

  // Load evaluation data
  const loadRiskData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<R>(`students/at-risk/${queryParams}`);
      setCriteriaActive(res.criteria_active);
      setActiveCriteria(res.criteria);
      setFlaggedStudents(res.flagged_students || []);
      setInsufficientStudents(res.insufficient_data_students || []);
      setSummary(res.summary || {
        total_at_risk: 0,
        high_risk: 0,
        medium_risk: 0,
        low_risk: 0,
        insufficient_data_count: 0,
        by_class: [],
        by_rule_type: {}
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not evaluate at-risk records.');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  // Load criteria versions
  const loadCriteriaData = useCallback(async () => {
    const qs = school ? `?school=${school}` : '';
    try {
      const data = await request<any>(`students/at-risk/criteria/${qs}`);
      setCriteriaData(data);
      if (!editingCriteria) {
        setEditingCriteria(data.active_criteria || data.starter_template);
      }
    } catch {}
  }, [school]);

  useEffect(() => {
    loadRiskData();
  }, [loadRiskData, bump]);

  useEffect(() => {
    if (tab === 'criteria') {
      loadCriteriaData();
    }
  }, [tab, loadCriteriaData, bump]);

  // Handle case submission
  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseModal) return;
    setCaseSubmitting(true);
    try {
      await request(`students/at-risk/${caseModal.student_id}/case/`, {
        method: 'POST',
        body: JSON.stringify({
          title: caseTitle,
          reason: caseReason,
          priority: casePriority
        })
      });
      notify(`Review case created for ${caseModal.student_name}`);
      setCaseModal(null);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create review case.');
    } finally {
      setCaseSubmitting(false);
    }
  };

  // Handle flag dismissal
  const handleDismissFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissModal) return;
    if (!dismissReason.trim() || dismissReason.trim().length < 5) {
      notify('A substantive justification reason (at least 5 characters) is required.');
      return;
    }
    setDismissSubmitting(true);
    try {
      await request(`students/at-risk/${dismissModal.student_id}/dismiss/`, {
        method: 'POST',
        body: JSON.stringify({
          reason: dismissReason,
          until_date: dismissUntil || undefined,
          snapshot: {
            overall_average: dismissModal.evidence?.overall_average,
            attendance_rate: dismissModal.evidence?.attendance_rate,
            failing_subjects: dismissModal.evidence?.failing_subjects?.length || 0
          }
        })
      });
      notify(`At-risk flag dismissed for ${dismissModal.student_name}`);
      setDismissModal(null);
      setDrawerStudent(null);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not dismiss flag.');
    } finally {
      setDismissSubmitting(false);
    }
  };

  // Handle save criteria
  const handleSaveCriteria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCriteria) return;
    setSavingCriteria(true);
    try {
      await request('students/at-risk/criteria/', {
        method: 'POST',
        body: JSON.stringify({
          school_id: school || (schools[0]?.id ? String(schools[0].id) : undefined),
          name: editingCriteria.name,
          combine_mode: editingCriteria.combine_mode,
          min_rules_match: Number(editingCriteria.min_rules_match || 1),
          min_data_results: Number(editingCriteria.min_data_results || 3),
          evaluation_period: editingCriteria.evaluation_period,
          rules: editingCriteria.rules,
          activate: true
        })
      });
      notify('New criteria policy version saved and activated!');
      setBump(b => b + 1);
      loadCriteriaData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save criteria.');
    } finally {
      setSavingCriteria(false);
    }
  };

  // Handle activate older version
  const handleActivateVersion = async (criteriaId: number, versionNum: number) => {
    try {
      await request('students/at-risk/criteria/activate/', {
        method: 'POST',
        body: JSON.stringify({ criteria_id: criteriaId })
      });
      notify(`Criteria version ${versionNum} activated successfully.`);
      setBump(b => b + 1);
      loadCriteriaData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not activate version.');
    }
  };

  // Chart data for class breakdown
  const chartData = useMemo(() => {
    return (summary.by_class || []).map((c: R) => ({
      name: c.class_name,
      Boys: c.boys || 0,
      Girls: c.girls || 0,
      Total: c.count || 0
    }));
  }, [summary.by_class]);

  return (
    <div className="fx-page" style={{ paddingBottom: 60 }}>
      {/* Top Header */}
      <div className="fx-top" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <div className="fx-breadcrumb">STUDENT SUPPORT / ACADEMIC & ATTENDANCE RISK</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '4px 0 2px' }}>Students at Risk</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Early academic and attendance indicators to support student performance.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {schools.length > 1 && (
            <select
              className="fx-select"
              value={school}
              onChange={e => setSchool(e.target.value)}
              style={{ minWidth: 180 }}
            >
              <option value="">All Permitted Campuses</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <ExportMenu
            title="Students at Risk Directory"
            filename="students-at-risk"
            endpoint={`students/at-risk/${queryParams}`}
            notify={notify}
          />

          <button className="outline-btn" onClick={() => setBump(b => b + 1)}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <nav className="fx-tabs" aria-label="Risk sections">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>
          <AlertCircle size={15} /> At-risk list ({summary.total_at_risk})
        </button>
        <button className={tab === 'insufficient' ? 'on' : ''} onClick={() => setTab('insufficient')}>
          <Clock size={15} /> Insufficient data ({summary.insufficient_data_count})
        </button>
        <button className={tab === 'criteria' ? 'on' : ''} onClick={() => setTab('criteria')}>
          <SlidersHorizontal size={15} /> Risk Criteria
        </button>
        <button className={tab === 'cases' ? 'on' : ''} onClick={() => setTab('cases')}>
          <HeartHandshake size={15} /> Review cases
        </button>
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 1: AT-RISK LIST */}
      {/* ------------------------------------------------------------------- */}
      {tab === 'list' && (
        <div className="fx-body">
          {/* KPI Strip */}
          <div className="fx-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div className="fx-kpi">
              <span>Total Flagged</span>
              <strong style={{ color: '#dc2626' }}>{summary.total_at_risk} Students</strong>
              <small>Objective criteria match</small>
            </div>
            <div className="fx-kpi">
              <span>High Risk Level</span>
              <strong style={{ color: '#ef4444' }}>{summary.high_risk}</strong>
              <small>3+ rules or severe deficit</small>
            </div>
            <div className="fx-kpi">
              <span>Medium Risk</span>
              <strong style={{ color: '#f59e0b' }}>{summary.medium_risk}</strong>
              <small>2 rules or moderate deficit</small>
            </div>
            <div className="fx-kpi">
              <span>Low Risk</span>
              <strong style={{ color: '#84cc16' }}>{summary.low_risk}</strong>
              <small>1 rule triggered</small>
            </div>
            <div className="fx-kpi">
              <span>Not Enough Data</span>
              <strong style={{ color: '#64748b' }}>{summary.insufficient_data_count}</strong>
              <small>&lt; 3 results recorded</small>
            </div>
          </div>

          {/* Class Breakdown Bar Chart with Gender Split */}
          {chartData.length > 0 && (
            <section className="panel hr-panel" style={{ marginBottom: 18 }}>
              <div className="panel-head">
                <div>
                  <h3 style={{ fontSize: 15 }}>At-Risk Distribution by Class & Gender</h3>
                  <p style={{ fontSize: 12 }}>Boys vs Girls comparison across affected classes</p>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#3b82f6' }} /> Boys
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ec4899' }} /> Girls
                  </span>
                </div>
              </div>
              <div style={{ height: 220, padding: '12px 16px 0 0' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                      formatter={(val, name) => [`${val} students`, name === 'Boys' ? 'Boys' : 'Girls']}
                    />
                    <Bar dataKey="Boys" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="Girls" fill="#ec4899" radius={[4, 4, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Filter Bar */}
          <section className="panel hr-panel">
            <div className="panel-head">
              <div>
                <h3>Identified Students</h3>
                <p>Sorted by risk severity descending (High &gt; Medium &gt; Low)</p>
              </div>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Showing <strong>{flaggedStudents.length}</strong> students
              </span>
            </div>

            <div style={{ padding: '0 20px 14px 20px' }}>
              <FilterBar
                searchPlaceholder="Search by student name, admission #, or father name..."
                filters={[
                  {
                    key: 'class',
                    label: 'Class',
                    options: classes.map(c => ({ label: c.name, value: String(c.id) }))
                  },
                  {
                    key: 'risk_level',
                    label: 'Risk Level',
                    options: [
                      { label: 'High Risk', value: 'high' },
                      { label: 'Medium Risk', value: 'medium' },
                      { label: 'Low Risk', value: 'low' },
                    ]
                  },
                  {
                    key: 'indicator',
                    label: 'Triggered Indicator',
                    options: [
                      { label: 'Overall academic average', value: 'overall_average' },
                      { label: 'Failing subjects', value: 'failing_subjects' },
                      { label: 'Attendance rate', value: 'attendance_rate' },
                      { label: 'Consecutive absences', value: 'consecutive_absences' },
                      { label: 'Homework completion', value: 'homework_completion' },
                    ]
                  },
                  {
                    key: 'trend',
                    label: 'Trend',
                    options: [
                      { label: 'Declining', value: 'declining' },
                      { label: 'Steady', value: 'steady' },
                      { label: 'Improving', value: 'improving' },
                    ]
                  },
                  {
                    key: 'gender',
                    label: 'Gender',
                    options: [
                      { label: 'Boy', value: 'male' },
                      { label: 'Girl', value: 'female' },
                    ]
                  },
                  {
                    key: 'has_case',
                    label: 'Review Case',
                    options: [
                      { label: 'Has Active Case', value: 'true' },
                      { label: 'No Active Case', value: 'false' },
                    ]
                  }
                ]}
                values={filters}
                onChange={setFilters}
                onClear={() => setFilters({})}
              />
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>ADMISSION #</th>
                    <th>CLASS & SECTION</th>
                    <th>GENDER</th>
                    <th>RISK LEVEL</th>
                    <th>TRIGGERED INDICATORS</th>
                    <th>AVG / ATTENDANCE</th>
                    <th>TREND</th>
                    <th>CASE STATUS</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {flaggedStudents.map(s => {
                    const isHigh = s.risk_level === 'high';
                    const isMed = s.risk_level === 'medium';
                    return (
                      <tr key={s.student_id}>
                        <td>
                          <div>
                            <strong>{s.student_name}</strong>
                            <div style={{ fontSize: 11, color: '#64748b' }}>Father: {s.father_name}</div>
                          </div>
                        </td>
                        <td>{s.admission_number || '—'}</td>
                        <td><strong>{s.full_class_name}</strong></td>
                        <td>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                            background: s.gender === 'male' ? '#eff6ff' : '#fdf2f8',
                            color: s.gender === 'male' ? '#1d4ed8' : '#be185d'
                          }}>
                            {s.gender_label}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: isHigh ? '#fee2e2' : isMed ? '#fef3c7' : '#fef9c3',
                            color: isHigh ? '#b91c1c' : isMed ? '#b45309' : '#854d0e'
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#eab308'
                            }} />
                            {s.risk_level.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {s.triggered_rules.map((r: R) => (
                              <span
                                key={r.rule_id}
                                title={r.explanation}
                                style={{
                                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                  background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0',
                                  cursor: 'help'
                                }}
                              >
                                {r.label}: <b>{r.actual_value}</b>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12 }}>
                            <div>Avg: <b>{s.evidence?.overall_average ?? '—'}%</b></div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>Att: {s.evidence?.attendance_rate ?? '—'}%</div>
                          </div>
                        </td>
                        <td>
                          {s.trend === 'improving' ? (
                            <span style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600 }}>
                              <TrendingUp size={13} /> Improving
                            </span>
                          ) : s.trend === 'declining' ? (
                            <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600 }}>
                              <TrendingDown size={13} /> Declining
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
                              <Minus size={13} /> Steady
                            </span>
                          )}
                        </td>
                        <td>
                          {s.case_info ? (
                            <span style={{
                              background: '#dbeafe', color: '#1e40af', padding: '2px 7px',
                              borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4
                            }}>
                              <HeartHandshake size={11} /> Case #{s.case_info.case_id} ({s.case_info.status})
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>None</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="sm-btn"
                            title="Inspect complete evidence breakdown"
                            onClick={() => setDrawerStudent(s)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Eye size={12} /> Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!flaggedStudents.length && !loading && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b' }}>
                        <CheckCircle2 size={36} color="#16a34a" style={{ margin: '0 auto 8px', opacity: 0.8 }} />
                        <h4 style={{ margin: '0 0 4px', fontSize: 15, color: '#1e293b' }}>No Students Currently Flagged</h4>
                        <p style={{ margin: 0, fontSize: 13 }}>
                          All students meet the active criteria policy thresholds, or have fewer than the required minimum recorded results.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* ------------------------------------------------------------- */}
      {/* TAB 2: INSUFFICIENT DATA                                      */}
      {/* ------------------------------------------------------------- */}
      {tab === 'insufficient' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Insufficient Recorded Data</h3>
              <p>Students with fewer assessments than the required threshold are excluded from risk calculations.</p>
            </div>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              <strong>{insufficientStudents.length}</strong> students excluded
            </span>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>STUDENT NAME</th>
                  <th>ADMISSION #</th>
                  <th>CLASS</th>
                  <th>RECORDED GRADES</th>
                  <th>REQUIRED RESULTS</th>
                  <th>EVALUATION STATUS</th>
                </tr>
              </thead>
              <tbody>
                {insufficientStudents.map(s => (
                  <tr key={s.student_id}>
                    <td><strong>{s.student_name}</strong></td>
                    <td>{s.admission_number || '—'}</td>
                    <td>{s.full_class_name}</td>
                    <td><span className="pill orange">{s.recorded_grades_count} recorded</span></td>
                    <td>{s.required_results} minimum required</td>
                    <td>
                      <span style={{ color: '#64748b', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={12} /> {s.note}
                      </span>
                    </td>
                  </tr>
                ))}
                {!insufficientStudents.length && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                      All active learners currently have sufficient recorded assessments for full evaluation.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 3: CRITERIA POLICY (RULES) */}
      {/* ------------------------------------------------------------------- */}
      {tab === 'criteria' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          <section className="panel hr-panel">
            <div className="panel-head">
              <div>
                <h3>Configured Criteria & Thresholds</h3>
                <p>Evaluation thresholds applied to student academic and attendance records</p>
              </div>
              {criteriaData?.active_criteria && (
                <span className="pill green" style={{ fontWeight: 700 }}>
                  Active Version {criteriaData.active_criteria.version}
                </span>
              )}
            </div>

            {editingCriteria ? (
              <form onSubmit={handleSaveCriteria} style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                    Policy Name *
                    <input
                      type="text"
                      required
                      value={editingCriteria.name || ''}
                      onChange={e => setEditingCriteria({ ...editingCriteria, name: e.target.value })}
                      disabled={!isManager}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                    />
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                      Evaluation Period
                      <select
                        value={editingCriteria.evaluation_period || 'whole_year'}
                        onChange={e => setEditingCriteria({ ...editingCriteria, evaluation_period: e.target.value })}
                        disabled={!isManager}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
                      >
                        <option value="whole_year">Whole Academic Year</option>
                        <option value="current_term">Current Term (~90 days)</option>
                        <option value="last_30_days">Recent Records (Last 30 Days)</option>
                      </select>
                    </label>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                      Combine Mode
                      <select
                        value={editingCriteria.combine_mode || 'any'}
                        onChange={e => setEditingCriteria({ ...editingCriteria, combine_mode: e.target.value })}
                        disabled={!isManager}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
                      >
                        <option value="any">Any rule matches</option>
                        <option value="all">All rules must match</option>
                        <option value="at_least_n">At least N rules match</option>
                      </select>
                    </label>

                    {editingCriteria.combine_mode === 'at_least_n' && (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                        Min Rules Match (N)
                        <input
                          type="number"
                          min="1"
                          max={editingCriteria.rules?.length || 5}
                          value={editingCriteria.min_rules_match || 1}
                          onChange={e => setEditingCriteria({ ...editingCriteria, min_rules_match: e.target.value })}
                          disabled={!isManager}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                        />
                      </label>
                    )}

                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                      Minimum Assessments Required
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={editingCriteria.min_data_results || 3}
                        onChange={e => setEditingCriteria({ ...editingCriteria, min_data_results: e.target.value })}
                        disabled={!isManager}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                      />
                    </label>
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Evaluation Rules</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(editingCriteria.rules || []).map((r: R, idx: number) => (
                        <div
                          key={r.id || idx}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: '12px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <strong style={{ fontSize: 13, color: '#1e293b' }}>{r.label}</strong>
                              <span style={{ fontSize: 11, background: '#e2e8f0', color: '#475569', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                                Operator: {r.operator}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Threshold:</span>
                              <input
                                type="number"
                                step="any"
                                value={r.threshold}
                                onChange={e => {
                                  const newRules = [...editingCriteria.rules];
                                  newRules[idx] = { ...newRules[idx], threshold: Number(e.target.value) };
                                  setEditingCriteria({ ...editingCriteria, rules: newRules });
                                }}
                                disabled={!isManager}
                                style={{ width: 72, padding: '5px 8px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1', textAlign: 'right', background: '#fff' }}
                              />
                              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{r.unit}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                            {r.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {isManager && (
                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button
                        type="button"
                        className="outline-btn"
                        onClick={() => {
                          if (criteriaData?.starter_template) {
                            setEditingCriteria(criteriaData.starter_template);
                          }
                        }}
                      >
                        Reset to Defaults
                      </button>
                      <button type="submit" className="primary-btn" disabled={savingCriteria}>
                        {savingCriteria ? 'Saving & Activating…' : 'Save as New Version & Activate'}
                      </button>
                    </div>
                  )}
                </div>
              </form>
            ) : (
              <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>Loading criteria policy…</div>
            )}
          </section>

          {/* Version History */}
          <section className="panel hr-panel">
            <div className="panel-head">
              <div>
                <h3>Criteria Version History</h3>
                <p>Audited versions of the school's risk evaluation criteria</p>
              </div>
            </div>

            <div style={{ padding: '0 16px 16px' }}>
              {(criteriaData?.all_versions || []).map((v: R) => (
                <div
                  key={v.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 10,
                    background: v.active ? '#f0fdf4' : '#ffffff',
                    borderLeft: v.active ? '4px solid #16a34a' : '1px solid #e2e8f0'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>Version {v.version}: {v.name}</strong>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        Created by {v.created_by} on {new Date(v.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    {v.active ? (
                      <span className="pill green" style={{ fontWeight: 700 }}>Active</span>
                    ) : (
                      isManager && (
                        <button
                          className="sm-btn"
                          onClick={() => handleActivateVersion(v.id, v.version)}
                          title="Rollback/Activate this version"
                        >
                          Activate
                        </button>
                      )
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 8, display: 'flex', gap: 14 }}>
                    <span>Combine: <b>{v.combine_mode}</b></span>
                    <span>Min results: <b>{v.min_data_results}</b></span>
                    <span>Rules: <b>{v.rules_count} configured</b></span>
                  </div>
                </div>
              ))}

              {!criteriaData?.all_versions?.length && (
                <div style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                  No historical criteria versions found.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* TAB 4: REVIEW CASES */}
      {/* ------------------------------------------------------------------- */}
      {tab === 'cases' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Student Support & Review Cases</h3>
              <p>Active intervention and review cases linked to at-risk student academic support</p>
            </div>
            {onNavigate && (
              <button className="primary-btn" onClick={() => onNavigate('Interventions')}>
                <HeartHandshake size={15} /> Open Interventions Center
              </button>
            )}
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>CLASS</th>
                  <th>RISK LEVEL</th>
                  <th>CASE STATUS</th>
                  <th>CASE TITLE & REASON</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {flaggedStudents.filter(s => s.case_info).map(s => (
                  <tr key={s.student_id}>
                    <td><strong>{s.student_name}</strong></td>
                    <td>{s.full_class_name}</td>
                    <td><span className={`pill ${s.risk_level === 'high' ? 'red' : s.risk_level === 'medium' ? 'orange' : 'yellow'}`}>{s.risk_level.toUpperCase()}</span></td>
                    <td><span className="pill blue">{s.case_info.status}</span></td>
                    <td>
                      <div>
                        <strong>{s.case_info.title}</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Assigned to: {s.case_info.assignee || 'Unassigned'}</div>
                      </div>
                    </td>
                    <td>
                      <button className="sm-btn" onClick={() => setDrawerStudent(s)}>
                        View Evidence <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!flaggedStudents.filter(s => s.case_info).length && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                      No active review cases opened for currently flagged students. Inspect a student in the at-risk list to open a case.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* EVIDENCE DRAWER (SLIDE-OUT) */}
      {/* ------------------------------------------------------------------- */}
      {drawerStudent && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDrawerStudent(null); }}>
          <div
            className="modal-card"
            style={{
              maxWidth: 580,
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div className="modal-head" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Objective Evidence Dossier</h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  {drawerStudent.student_name} ({drawerStudent.admission_number || 'No ID'}) — {drawerStudent.full_class_name}
                </p>
              </div>
              <button onClick={() => setDrawerStudent(null)}><X size={18} /></button>
            </div>

            <div style={{ padding: '16px 0' }}>
              {/* Risk Level Badge */}
              <div style={{
                background: drawerStudent.risk_level === 'high' ? '#fef2f2' : drawerStudent.risk_level === 'medium' ? '#fffbeb' : '#fefce8',
                border: `1px solid ${drawerStudent.risk_level === 'high' ? '#fecaca' : drawerStudent.risk_level === 'medium' ? '#fde68a' : '#fef08a'}`,
                padding: '12px 14px',
                borderRadius: 8,
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontWeight: 700, fontSize: 13,
                    color: drawerStudent.risk_level === 'high' ? '#b91c1c' : drawerStudent.risk_level === 'medium' ? '#b45309' : '#854d0e'
                  }}>
                    Assigned Level: {drawerStudent.risk_level.toUpperCase()} RISK
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {drawerStudent.triggered_rules_count} criteria indicator(s) triggered
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                  Student trend over evaluated timeframe is <b>{drawerStudent.trend.toUpperCase()}</b>.
                </div>
              </div>

              {/* Triggered Rules Breakdown */}
              <h4 style={{ margin: '14px 0 8px', fontSize: 14 }}>Triggered Criteria Indicators</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {drawerStudent.triggered_rules.map((r: R) => (
                  <div
                    key={r.rule_id}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: '10px 12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <strong>{r.label}</strong>
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>{r.actual_value} (threshold {r.threshold})</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      {r.explanation}
                    </div>
                  </div>
                ))}
              </div>

              {/* Subject Breakdown */}
              {drawerStudent.evidence?.subject_averages && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Subject Averages & Failing Subjects</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                    {Object.entries(drawerStudent.evidence.subject_averages).map(([subj, score]) => {
                      const isFailing = Number(score) < 50;
                      return (
                        <div
                          key={subj}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: isFailing ? '#fee2e2' : '#f1f5f9',
                            border: `1px solid ${isFailing ? '#fca5a5' : '#e2e8f0'}`
                          }}
                        >
                          <div style={{ fontSize: 11, color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {subj}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: isFailing ? '#dc2626' : '#1e293b' }}>
                            {Number(score)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button
                  type="button"
                  className="sm-btn danger"
                  onClick={() => {
                    setDismissModal(drawerStudent);
                    setDismissReason('');
                  }}
                  title="Dismiss flag with mandatory rationale"
                >
                  Dismiss Flag
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="outline-btn"
                    onClick={() => {
                      setCaseModal(drawerStudent);
                      setCaseTitle(`Academic Review: ${drawerStudent.student_name}`);
                      setCasePriority(drawerStudent.risk_level === 'high' ? 'high' : 'medium');
                      setCaseReason(`Triggered indicators: ${drawerStudent.triggered_rules.map((r: R) => r.label).join(', ')}. Overall Average: ${drawerStudent.evidence?.overall_average}%, Attendance: ${drawerStudent.evidence?.attendance_rate}%.`);
                    }}
                  >
                    <HeartHandshake size={14} /> Open Review Case
                  </button>
                  <button type="button" className="primary-btn" onClick={() => setDrawerStudent(null)}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL: OPEN REVIEW CASE */}
      {/* ------------------------------------------------------------------- */}
      {caseModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setCaseModal(null); }}>
          <div className="modal-card" style={{ maxWidth: 540, width: 'min(540px, 95vw)' }}>
            <div className="modal-head">
              <h3 style={{ margin: 0, fontSize: 16 }}>Open Support / Review Case</h3>
              <button type="button" onClick={() => setCaseModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateCase}>
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                  Case Title *
                  <input
                    type="text"
                    required
                    value={caseTitle}
                    onChange={e => setCaseTitle(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                  Priority
                  <select
                    value={casePriority}
                    onChange={e => setCasePriority(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                  Notes & Details *
                  <textarea
                    rows={4}
                    required
                    value={caseReason}
                    onChange={e => setCaseReason(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </label>
              </div>
              <div style={{ padding: '14px 22px', background: '#fafbfc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }}>
                <button type="button" className="outline-btn" onClick={() => setCaseModal(null)}>Cancel</button>
                <button type="submit" className="primary-btn" disabled={caseSubmitting}>
                  {caseSubmitting ? 'Creating Case…' : 'Create Review Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL: DISMISS AT-RISK FLAG */}
      {/* ------------------------------------------------------------------- */}
      {dismissModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDismissModal(null); }}>
          <div className="modal-card" style={{ maxWidth: 520, width: 'min(520px, 95vw)' }}>
            <div className="modal-head">
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Dismiss At-Risk Flag</h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  For {dismissModal.student_name} ({dismissModal.full_class_name})
                </p>
              </div>
              <button type="button" onClick={() => setDismissModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleDismissFlag}>
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, fontSize: 12, color: '#475569', border: '1px solid #e2e8f0' }}>
                  Please provide a reason for dismissing this flag. If the student's metrics decline in future assessments, the indicator will re-emerge.
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                  Reason for Dismissal *
                  <textarea
                    rows={3}
                    required
                    placeholder="e.g. Tutoring plan initiated; performance affected by temporary absence."
                    value={dismissReason}
                    onChange={e => setDismissReason(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #334155)' }}>
                  Temporary Mute Until Date (Optional)
                  <input
                    type="date"
                    value={dismissUntil}
                    onChange={e => setDismissUntil(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                  />
                </label>
              </div>
              <div style={{ padding: '14px 22px', background: '#fafbfc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }}>
                <button type="button" className="outline-btn" onClick={() => setDismissModal(null)}>Cancel</button>
                <button type="submit" className="primary-btn" style={{ background: '#dc2626', borderColor: '#b91c1c' }} disabled={dismissSubmitting}>
                  {dismissSubmitting ? 'Dismissing Flag…' : 'Confirm Dismissal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
