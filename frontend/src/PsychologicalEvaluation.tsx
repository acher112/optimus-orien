import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ShieldAlert, CheckCircle2, AlertCircle, Info, Lock, Unlock,
  Eye, EyeOff, Edit3, Save, Send, RefreshCw, Download, UserCheck, Users,
  Award, Sparkles, Clock, ArrowUpRight, ArrowDownRight, Minus, Search,
  Filter, Calendar, ChevronRight, ChevronDown, HeartHandshake, BookOpen,
  FileText, X, AlertTriangle, ShieldCheck
} from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis
} from 'recharts';
import { request, type User } from './api';
import './psychological-evaluation.css';

interface Props {
  user: User;
  notify: (msg: string) => void;
  activeCampusId?: number | null;
  initialMode?: 'dashboard' | 'class' | 'workspace' | 'student';
  onNavigate?: (page: string) => void;
}

type TabMode = 'dashboard' | 'class' | 'workspace' | 'student' | 'gender' | 'safeguarding' | 'audit';

export default function PsychologicalEvaluation({ user, notify, activeCampusId, initialMode }: Props) {
  const isStudent = user.role === 'student' || user.role === 'parent';
  const isTeacher = user.role === 'teacher';
  const isManager = ['organisation_admin', 'school_admin', 'principal'].includes(user.role) || user.is_superuser;

  const [mode, setMode] = useState<TabMode>(
    isStudent ? 'student' : (initialMode || (isTeacher ? 'workspace' : 'dashboard'))
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [template, setTemplate] = useState<any>(null);

  // Filters
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(activeCampusId ? String(activeCampusId) : '');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [availableSchools, setAvailableSchools] = useState<any[]>([]);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);

  // Overview data (Level 1 & 2)
  const [overviewData, setOverviewData] = useState<any>(null);

  // Class summary data (Level 3)
  const [classSummary, setClassSummary] = useState<any>(null);

  // Teacher workspace data
  const [workspaceData, setWorkspaceData] = useState<any>(null);
  const [wsSelectedSubjectId, setWsSelectedSubjectId] = useState<string>('');

  // Level 4 Student Profile Modal
  const [profileModalStudentId, setProfileModalStudentId] = useState<number | null>(null);
  const [studentProfileData, setStudentProfileData] = useState<any>(null);
  const [compareWeek, setCompareWeek] = useState<string>('');
  const [profileLoading, setProfileLoading] = useState(false);

  // Questionnaire Evaluation Modal (Teacher)
  const [evalModalStudent, setEvalModalStudent] = useState<any>(null);
  const [evalDetail, setEvalDetail] = useState<any>(null);
  const [evalFormResponses, setEvalFormResponses] = useState<Record<number, number | null>>({});
  const [evalStrengths, setEvalStrengths] = useState('');
  const [evalSupportAreas, setEvalSupportAreas] = useState('');
  const [evalSupportAction, setEvalSupportAction] = useState('');
  const [evalTeacherNotes, setEvalTeacherNotes] = useState('');
  const [evalStudentFeedback, setEvalStudentFeedback] = useState('');
  const [evalSaving, setEvalSaving] = useState(false);

  // Student Self-Service Profile
  const [myProfileData, setMyProfileData] = useState<any>(null);
  const [myProfileWeek, setMyProfileWeek] = useState<string>('');

  // Safeguarding Modal
  const [safeguardingModalStudent, setSafeguardingModalStudent] = useState<any>(null);
  const [sgUrgency, setSgUrgency] = useState('standard');
  const [sgDescription, setSgDescription] = useState('');
  const [sgSubmitting, setSgSubmitting] = useState(false);
  const [safeguardingList, setSafeguardingList] = useState<any[]>([]);

  // Gender Analytics
  const [genderData, setGenderData] = useState<any>(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // ---------------------------------------------------------------------------
  // Load Template
  // ---------------------------------------------------------------------------
  const fetchTemplate = useCallback(async () => {
    try {
      const res: any = await request('psychological-evaluations/template/');
      setTemplate(res);
      if (!selectedWeek && res.current_week) {
        setSelectedWeek(res.current_week);
      }
    } catch (err: any) {
      console.error('Failed to load template:', err);
    }
  }, [selectedWeek]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // ---------------------------------------------------------------------------
  // Fetch Level 1 & 2 Dashboard
  // ---------------------------------------------------------------------------
  const fetchOverview = useCallback(async () => {
    if (isStudent) return;
    setLoading(true);
    setError('');
    try {
      let q = `psychological-evaluations/overview/?week=${encodeURIComponent(selectedWeek)}`;
      if (selectedSchoolId) q += `&school_id=${selectedSchoolId}`;
      if (selectedClassId) q += `&class_id=${selectedClassId}`;

      const res: any = await request(q);
      setOverviewData(res);
      if (res.campus_comparisons) {
        setAvailableSchools(res.campus_comparisons.map((c: any) => ({ id: c.school_id, name: c.school_name })));
      }
      if (res.classes_summary) {
        setAvailableClasses(res.classes_summary.map((c: any) => ({ id: c.class_id, name: c.class_name })));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load evaluation overview.');
    } finally {
      setLoading(false);
    }
  }, [isStudent, selectedWeek, selectedSchoolId, selectedClassId]);

  // ---------------------------------------------------------------------------
  // Fetch Level 3 Class Summary
  // ---------------------------------------------------------------------------
  const fetchClassSummary = useCallback(async (classId: string) => {
    if (!classId) return;
    setLoading(true);
    setError('');
    try {
      const res: any = await request(`psychological-evaluations/class-summary/?class_id=${classId}&week=${encodeURIComponent(selectedWeek)}`);
      setClassSummary(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load class evaluation summary.');
    } finally {
      setLoading(false);
    }
  }, [selectedWeek]);

  // ---------------------------------------------------------------------------
  // Fetch Teacher Workspace
  // ---------------------------------------------------------------------------
  const fetchTeacherWorkspace = useCallback(async () => {
    if (!isTeacher && !user.is_superuser) return;
    setLoading(true);
    setError('');
    try {
      let q = `psychological-evaluations/workspace/?week=${encodeURIComponent(selectedWeek)}`;
      if (selectedClassId) q += `&class_id=${selectedClassId}`;
      if (wsSelectedSubjectId) q += `&subject_id=${wsSelectedSubjectId}`;

      const res: any = await request(q);
      setWorkspaceData(res);
      if (res.selected_class_id && !selectedClassId) {
        setSelectedClassId(String(res.selected_class_id));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load teacher evaluation workspace.');
    } finally {
      setLoading(false);
    }
  }, [isTeacher, user.is_superuser, selectedWeek, selectedClassId, wsSelectedSubjectId]);

  // ---------------------------------------------------------------------------
  // Fetch Student My Profile
  // ---------------------------------------------------------------------------
  const fetchMyProfile = useCallback(async (weekParam = '') => {
    setLoading(true);
    setError('');
    try {
      const q = weekParam ? `psychological-evaluations/my-profile/?week=${encodeURIComponent(weekParam)}` : 'psychological-evaluations/my-profile/';
      const res: any = await request(q);
      setMyProfileData(res);
      if (res.evaluation_week) {
        setMyProfileWeek(res.evaluation_week);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load your development profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch Student Profile (Level 4)
  // ---------------------------------------------------------------------------
  const fetchStudentProfile = useCallback(async (studentId: number, week: string, compWeek = '') => {
    setProfileLoading(true);
    try {
      let q = `psychological-evaluations/student-profile/${studentId}/?week=${encodeURIComponent(week)}`;
      if (compWeek) q += `&compare_week=${encodeURIComponent(compWeek)}`;
      const res: any = await request(q);
      setStudentProfileData(res);
    } catch (err: any) {
      notify(err.message || 'Failed to load student development profile.');
    } finally {
      setProfileLoading(false);
    }
  }, [notify]);

  // ---------------------------------------------------------------------------
  // Fetch Gender Analytics
  // ---------------------------------------------------------------------------
  const fetchGenderAnalytics = useCallback(async () => {
    try {
      let q = `psychological-evaluations/gender-analytics/?week=${encodeURIComponent(selectedWeek)}`;
      if (selectedSchoolId) q += `&school_id=${selectedSchoolId}`;
      const res: any = await request(q);
      setGenderData(res);
    } catch (err: any) {
      console.error(err);
    }
  }, [selectedWeek, selectedSchoolId]);

  // ---------------------------------------------------------------------------
  // Fetch Safeguarding Referrals
  // ---------------------------------------------------------------------------
  const fetchSafeguardingList = useCallback(async () => {
    if (!isManager) return;
    try {
      const res: any = await request('psychological-evaluations/safeguarding/list/');
      setSafeguardingList(res.referrals || []);
    } catch (err: any) {
      console.error(err);
    }
  }, [isManager]);

  // ---------------------------------------------------------------------------
  // Fetch Audit Logs
  // ---------------------------------------------------------------------------
  const fetchAuditLogs = useCallback(async () => {
    if (!isManager) return;
    try {
      const res: any = await request('psychological-evaluations/audit-logs/');
      setAuditLogs(res.audit_logs || []);
    } catch (err: any) {
      console.error(err);
    }
  }, [isManager]);

  // Tab change trigger
  useEffect(() => {
    if (mode === 'dashboard') {
      fetchOverview();
    } else if (mode === 'class') {
      if (selectedClassId) fetchClassSummary(selectedClassId);
      else fetchOverview();
    } else if (mode === 'workspace') {
      fetchTeacherWorkspace();
    } else if (mode === 'student') {
      fetchMyProfile(myProfileWeek);
    } else if (mode === 'gender') {
      fetchGenderAnalytics();
    } else if (mode === 'safeguarding') {
      fetchSafeguardingList();
    } else if (mode === 'audit') {
      fetchAuditLogs();
    }
  }, [mode, selectedWeek, selectedSchoolId, selectedClassId, fetchOverview, fetchClassSummary, fetchTeacherWorkspace, fetchMyProfile, fetchGenderAnalytics, fetchSafeguardingList, fetchAuditLogs, myProfileWeek]);

  // ---------------------------------------------------------------------------
  // Questionnaire Modal Open & Save
  // ---------------------------------------------------------------------------
  const openEvaluationModal = async (student: any, classId: string, subjectId?: string) => {
    setEvalModalStudent(student);
    setEvalSaving(false);
    try {
      let q = `psychological-evaluations/evaluations/find/?student_id=${student.student_id || student.id}&class_id=${classId}&week=${encodeURIComponent(selectedWeek)}`;
      if (subjectId) q += `&subject_id=${subjectId}`;
      const res: any = await request(q);
      setEvalDetail(res);
      setEvalFormResponses(res.responses || {});
      setEvalStrengths(res.strengths_observed || '');
      setEvalSupportAreas(res.support_areas || '');
      setEvalSupportAction(res.support_action || '');
      setEvalTeacherNotes(res.teacher_notes || '');
      setEvalStudentFeedback(res.student_visible_feedback || '');
    } catch (err: any) {
      notify(err.message || 'Could not load student evaluation draft.');
    }
  };

  const handleSaveEvaluation = async (submitStatus: 'draft' | 'submitted') => {
    if (!evalModalStudent || !evalDetail) return;
    setEvalSaving(true);
    try {
      const isRevision = evalDetail.status === 'submitted' || evalDetail.status === 'revised';
      const payload = {
        student_id: evalDetail.student_id,
        class_id: evalDetail.class_id,
        subject_id: evalDetail.subject_id,
        evaluation_week: evalDetail.evaluation_week,
        status: submitStatus,
        is_revision: isRevision,
        responses: evalFormResponses,
        strengths_observed: evalStrengths,
        support_areas: evalSupportAreas,
        support_action: evalSupportAction,
        teacher_notes: evalTeacherNotes,
        student_visible_feedback: evalStudentFeedback,
      };

      const res: any = await request('psychological-evaluations/evaluations/save/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      notify(res.message || `Evaluation saved as ${submitStatus}.`);
      setEvalModalStudent(null);

      // Refresh current view
      if (mode === 'workspace') fetchTeacherWorkspace();
      if (mode === 'class' && selectedClassId) fetchClassSummary(selectedClassId);
    } catch (err: any) {
      notify(err.message || 'Failed to save evaluation.');
    } finally {
      setEvalSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Publishing Toggle
  // ---------------------------------------------------------------------------
  const handleTogglePublication = async (studentId: number, week: string, currentStatus: boolean) => {
    const nextStatus = currentStatus ? 'unpublished' : 'published';
    try {
      const res: any = await request('psychological-evaluations/publications/publish/', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          evaluation_week: week,
          visibility_status: nextStatus,
        }),
      });
      notify(res.message);

      if (studentProfileData && studentProfileData.profile.student_id === studentId) {
        setStudentProfileData((prev: any) => ({
          ...prev,
          profile: {
            ...prev.profile,
            is_published: nextStatus === 'published',
          }
        }));
      }

      if (classSummary) {
        fetchClassSummary(String(classSummary.class_id));
      }
    } catch (err: any) {
      notify(err.message || 'Failed to update publication status.');
    }
  };

  // ---------------------------------------------------------------------------
  // Submit Safeguarding Referral
  // ---------------------------------------------------------------------------
  const handleSubmitSafeguarding = async () => {
    if (!safeguardingModalStudent || !sgDescription.trim()) {
      notify('Please provide a description of the safeguarding concern.');
      return;
    }
    setSgSubmitting(true);
    try {
      const res: any = await request('psychological-evaluations/safeguarding/refer/', {
        method: 'POST',
        body: JSON.stringify({
          student_id: safeguardingModalStudent.student_id || safeguardingModalStudent.id,
          concern_description: sgDescription.trim(),
          urgency_level: sgUrgency,
        }),
      });
      notify(res.message || 'Confidential safeguarding referral escalated.');
      setSafeguardingModalStudent(null);
      setSgDescription('');
      setSgUrgency('standard');
    } catch (err: any) {
      notify(err.message || 'Failed to submit safeguarding referral.');
    } finally {
      setSgSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Universal CSV Export
  // ---------------------------------------------------------------------------
  const handleExportCsv = () => {
    let url = `/api/v1/psychological-evaluations/export/?week=${encodeURIComponent(selectedWeek)}`;
    if (selectedSchoolId) url += `&school_id=${selectedSchoolId}`;
    window.open(url, '_blank');
  };

  // ---------------------------------------------------------------------------
  // Radar Chart Helper Data
  // ---------------------------------------------------------------------------
  const chartData = useMemo(() => {
    if (!studentProfileData) return [];
    const prof = studentProfileData.profile;
    const comp = studentProfileData.comparison;

    return (prof.radar_axes || []).map((axis: any) => {
      const compAxis = comp?.radar_axes?.find((ca: any) => ca.dimension_key === axis.dimension_key);
      return {
        dimension: axis.dimension_name,
        score: axis.score !== null ? axis.score : 0,
        rawScore: axis.score,
        status: axis.status,
        statusLabel: axis.status_label,
        compareScore: compAxis && compAxis.score !== null ? compAxis.score : undefined,
        compareRaw: compAxis?.score,
      };
    });
  }, [studentProfileData]);

  // Dimension score preview during questionnaire completion
  const formDomainScorePreviews = useMemo(() => {
    if (!template) return {};
    const previews: Record<string, { score: number | null; count: number; status: string }> = {};

    for (const dim of template.dimensions || []) {
      const validVals: number[] = [];
      for (const q of dim.questions || []) {
        const val = evalFormResponses[q.id];
        if (val !== null && val !== undefined && val >= 1 && val <= 5) {
          validVals.push(val);
        }
      }
      if (validVals.length >= 2) {
        const avg = validVals.reduce((a, b) => a + b, 0) / validVals.length;
        const norm = ((avg - 1.0) / 4.0) * 100.0;
        previews[dim.key] = { score: Math.round(norm * 10) / 10, count: validVals.length, status: 'valid' };
      } else {
        previews[dim.key] = { score: null, count: validVals.length, status: 'insufficient' };
      }
    }
    return previews;
  }, [template, evalFormResponses]);

  return (
    <div className="psych-eval-root">
      {/* ==================================================================== */}
      {/* 1. MODULE BANNER & NOTICE */}
      {/* ==================================================================== */}
      <div className="psych-banner">
        <div className="psych-banner-watermark">
          <Activity size={170} />
        </div>
        <div className="psych-banner-content">
          <div className="psych-banner-top">
            <div className="psych-banner-brand">
              <div className="psych-banner-icon">
                <Activity size={24} />
              </div>
              <div>
                <h1 className="psych-banner-title">
                  Psychological Evaluation
                  <span className="psych-status-pill">
                    Validation in progress
                  </span>
                </h1>
                <p className="psych-banner-sub">
                  School-based weekly teacher observations &amp; 6D developmental profiling.
                </p>
              </div>
            </div>

            <div className="psych-banner-actions">
              {!isStudent && (
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="psych-btn-glass"
                  title="Export weekly records as CSV"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (mode === 'dashboard') fetchOverview();
                  else if (mode === 'class' && selectedClassId) fetchClassSummary(selectedClassId);
                  else if (mode === 'workspace') fetchTeacherWorkspace();
                  else if (mode === 'student') fetchMyProfile(myProfileWeek);
                }}
                className="psych-btn-glass"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="psych-notice-box">
            <Info size={16} />
            <div>
              <strong>Important Notice: </strong>
              This module is a school-based behavioural observation and student development system. It is <strong>not</strong> a clinical psychological assessment, diagnostic instrument, or personality test.
              Scores reflect observed classroom interactions and must not be used to label students, assign clinical categories, or make high-stakes disciplinary decisions.
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. NAVIGATION TABS & FILTER BAR */}
      {/* ==================================================================== */}
      <div className="psych-nav-bar">
        {/* Navigation Tabs */}
        <div className="psych-tabs-strip">
          {!isStudent && (
            <>
              <button
                type="button"
                onClick={() => setMode('dashboard')}
                className={`psych-tab-btn ${mode === 'dashboard' ? 'active' : ''}`}
              >
                <Activity size={15} />
                <span>Institutional Overview</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('class')}
                className={`psych-tab-btn ${mode === 'class' ? 'active' : ''}`}
              >
                <Users size={15} />
                <span>Class Roster &amp; Scores</span>
              </button>
            </>
          )}

          {(isTeacher || user.is_superuser) && (
            <button
              type="button"
              onClick={() => setMode('workspace')}
              className={`psych-tab-btn ${mode === 'workspace' ? 'active' : ''}`}
            >
              <Edit3 size={15} />
              <span>Observation Workspace</span>
            </button>
          )}

          {!isStudent && (
            <button
              type="button"
              onClick={() => setMode('gender')}
              className={`psych-tab-btn ${mode === 'gender' ? 'active' : ''}`}
            >
              <BookOpen size={15} />
              <span>Gender Analytics</span>
            </button>
          )}

          {isManager && (
            <>
              <button
                type="button"
                onClick={() => setMode('safeguarding')}
                className={`psych-tab-btn ${mode === 'safeguarding' ? 'active' : ''}`}
              >
                <HeartHandshake size={15} />
                <span>Safeguarding Referrals</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('audit')}
                className={`psych-tab-btn ${mode === 'audit' ? 'active' : ''}`}
              >
                <ShieldCheck size={15} />
                <span>Audit Trail</span>
              </button>
            </>
          )}

          {isStudent && (
            <button
              type="button"
              onClick={() => setMode('student')}
              className={`psych-tab-btn ${mode === 'student' ? 'active' : ''}`}
            >
              <Sparkles size={15} />
              <span>My Development Profile</span>
            </button>
          )}
        </div>

        {/* Global Controls: Campus, Class, Week */}
        {!isStudent && (
          <div className="psych-filters-strip">
            {availableSchools.length > 1 && (
              <select
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                className="psych-select"
              >
                <option value="">All Campuses</option>
                {availableSchools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}

            {availableClasses.length > 0 && mode !== 'workspace' && (
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  if (e.target.value && mode === 'class') {
                    fetchClassSummary(e.target.value);
                  }
                }}
                className="psych-select"
              >
                <option value="">Select Class...</option>
                {availableClasses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}

            <div className="psych-week-input">
              <Calendar size={13} style={{ color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="2026-W44"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                title="Format: YYYY-Www, e.g. 2026-W44"
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. TAB CONTENT ROUTING */}
      {/* ==================================================================== */}

      {/* TAB: INSTITUTIONAL OVERVIEW (Level 1 & 2) */}
      {mode === 'dashboard' && overviewData && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Students in Scope</p>
                <h3 className="text-2xl font-bold mt-1">{overviewData.total_students}</h3>
                <span className="text-[11px] text-muted-foreground">Active enrolled</span>
              </div>
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Users size={22} />
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Evaluated This Week</p>
                <h3 className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                  {overviewData.evaluated_students_count}
                </h3>
                <span className="text-[11px] text-emerald-600 font-medium">
                  {overviewData.completion_rate}% completion rate
                </span>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={22} />
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Insufficient Observations</p>
                <h3 className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
                  {overviewData.insufficient_observations_count}
                </h3>
                <span className="text-[11px] text-muted-foreground">Require observations</span>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock size={22} />
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Current Evaluation Period</p>
                <h3 className="text-lg font-bold mt-1 text-indigo-600 dark:text-indigo-400">
                  {overviewData.evaluation_week}
                </h3>
                <span className="text-[11px] text-muted-foreground">5-day school window</span>
              </div>
              <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Calendar size={22} />
              </div>
            </div>
          </div>

          {/* Level 1: Campus Comparison Table */}
          {overviewData.campus_comparisons?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span>Campus Evaluation Coverage</span>
                    <span className="text-[11px] text-muted-foreground">({overviewData.evaluation_week})</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Observational completion rate across campuses in your authorised scope.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground font-medium">
                      <th className="pb-2.5">Campus Name</th>
                      <th className="pb-2.5">City</th>
                      <th className="pb-2.5 text-center">Total Students</th>
                      <th className="pb-2.5 text-center">Evaluated</th>
                      <th className="pb-2.5">Completion Rate</th>
                      <th className="pb-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {overviewData.campus_comparisons.map((sc: any) => (
                      <tr key={sc.school_id} className="hover:bg-accent/40 transition">
                        <td className="py-3 font-medium text-foreground">{sc.school_name}</td>
                        <td className="py-3 text-muted-foreground">{sc.city || '—'}</td>
                        <td className="py-3 text-center">{sc.total_students}</td>
                        <td className="py-3 text-center font-semibold text-emerald-600">{sc.evaluated_students}</td>
                        <td className="py-3 w-48">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span>{sc.completion_rate}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, sc.completion_rate)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSchoolId(String(sc.school_id));
                              notify(`Filtered to ${sc.school_name}`);
                            }}
                            className="px-2.5 py-1 text-[11px] font-medium rounded bg-secondary hover:bg-secondary/80 text-foreground transition"
                          >
                            Filter Campus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Level 2: Classes Breakdown Table */}
          {overviewData.classes_summary?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Class-Level Aggregates & Completion</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select a class to drill down into individual student observations and 6D radar charts.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground font-medium">
                      <th className="pb-2.5">Class / Section</th>
                      <th className="pb-2.5">Campus</th>
                      <th className="pb-2.5">Teacher</th>
                      <th className="pb-2.5 text-center">Students</th>
                      <th className="pb-2.5 text-center">Evaluated</th>
                      <th className="pb-2.5">Completion</th>
                      <th className="pb-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {overviewData.classes_summary.map((cls: any) => (
                      <tr key={cls.class_id} className="hover:bg-accent/40 transition">
                        <td className="py-3 font-semibold text-foreground">{cls.class_name}</td>
                        <td className="py-3 text-muted-foreground">{cls.school_name}</td>
                        <td className="py-3 text-muted-foreground">{cls.teacher_name}</td>
                        <td className="py-3 text-center">{cls.total_students}</td>
                        <td className="py-3 text-center font-medium text-emerald-600">{cls.evaluated_students}</td>
                        <td className="py-3 w-40">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{ width: `${cls.completion_rate}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-medium">{cls.completion_rate}%</span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClassId(String(cls.class_id));
                              setMode('class');
                              fetchClassSummary(String(cls.class_id));
                            }}
                            className="px-3 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition inline-flex items-center gap-1"
                          >
                            <span>Open Roster</span>
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Submission Trends Bar Chart */}
          {overviewData.recent_trends?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold">Weekly Submission Trends</h3>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overviewData.recent_trends}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Bar dataKey="evaluated_count" name="Evaluated Students" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: CLASS ROSTER & INDIVIDUAL SCORES (Level 3) */}
      {mode === 'class' && (
        <div className="space-y-6">
          {!selectedClassId ? (
            <div className="p-8 text-center bg-card border border-border rounded-xl space-y-3">
              <Users className="mx-auto h-10 w-10 text-muted-foreground opacity-50" />
              <h3 className="text-sm font-semibold">Please select a class</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Choose a class from the dropdown above to view student completion status and access 6D profiles.
              </p>
            </div>
          ) : classSummary ? (
            <div className="space-y-6">
              {/* Class Header & Domain Averages */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <span>{classSummary.class_name}</span>
                      <span className="text-xs font-normal text-muted-foreground">({classSummary.school_name})</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Weekly behavioural & developmental observations for period: <span className="font-semibold">{classSummary.evaluation_week}</span>
                    </p>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Total Students: <span className="font-semibold text-foreground">{classSummary.students?.length || 0}</span>
                  </div>
                </div>

                {/* Class Domain Averages Cards */}
                {classSummary.domain_averages && Object.keys(classSummary.domain_averages).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
                    {Object.entries(classSummary.domain_averages).map(([key, val]: any) => (
                      <div key={key} className="bg-secondary/40 border border-border rounded-lg p-2.5 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider truncate">
                          {key.replace('_', ' ')}
                        </div>
                        <div className="text-base font-bold text-foreground mt-1">
                          {val !== null ? `${val}` : '—'}
                        </div>
                        <div className="text-[9px] text-muted-foreground">class average</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Students Roster Table */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-semibold">Student Observation Roster</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground font-medium">
                        <th className="pb-2.5">Student Name</th>
                        <th className="pb-2.5">Admission ID</th>
                        <th className="pb-2.5">Gender</th>
                        <th className="pb-2.5 text-center">Status</th>
                        <th className="pb-2.5 text-center">Homeroom Obs</th>
                        <th className="pb-2.5 text-center">Subject Obs</th>
                        <th className="pb-2.5 text-center">Publication</th>
                        <th className="pb-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {classSummary.students?.map((st: any) => {
                        const statusColors: Record<string, string> = {
                          Submitted: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
                          Revised: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
                          Draft: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
                          'Not Started': 'bg-secondary text-muted-foreground border-border',
                        };

                        return (
                          <tr key={st.student_id} className="hover:bg-accent/40 transition">
                            <td className="py-3 font-semibold text-foreground">{st.full_name}</td>
                            <td className="py-3 text-muted-foreground">{st.admission_number}</td>
                            <td className="py-3 capitalize text-muted-foreground">{st.gender?.replace('_', ' ')}</td>
                            <td className="py-3 text-center">
                              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${statusColors[st.status] || statusColors['Not Started']}`}>
                                {st.status}
                              </span>
                            </td>
                            <td className="py-3 text-center">
                              {st.has_class_teacher_eval ? (
                                <CheckCircle2 size={15} className="text-emerald-500 mx-auto" />
                              ) : (
                                <Minus size={15} className="text-muted-foreground opacity-40 mx-auto" />
                              )}
                            </td>
                            <td className="py-3 text-center font-medium">
                              {st.subject_eval_count > 0 ? (
                                <span className="text-indigo-600 font-semibold">{st.subject_eval_count}</span>
                              ) : (
                                <span className="text-muted-foreground opacity-40">—</span>
                              )}
                            </td>
                            <td className="py-3 text-center">
                              <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                                st.is_published
                                  ? 'bg-indigo-500/15 text-indigo-600 border border-indigo-500/30'
                                  : 'bg-secondary text-muted-foreground'
                              }`}>
                                {st.is_published ? 'Published' : 'Hidden'}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {(isTeacher || user.is_superuser) && (
                                  <button
                                    type="button"
                                    onClick={() => openEvaluationModal(st, selectedClassId)}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-secondary hover:bg-secondary/80 text-foreground transition flex items-center gap-1"
                                    title="Evaluate student"
                                  >
                                    <Edit3 size={12} />
                                    <span>Evaluate</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setProfileModalStudentId(st.student_id);
                                    fetchStudentProfile(st.student_id, selectedWeek);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-medium rounded bg-primary/10 hover:bg-primary/20 text-primary transition flex items-center gap-1"
                                  title="View 6D profile"
                                >
                                  <Eye size={12} />
                                  <span>6D Profile</span>
                                </button>

                                {isManager && (
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePublication(st.student_id, selectedWeek, st.is_published)}
                                    className={`p-1 rounded transition ${
                                      st.is_published
                                        ? 'text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                                        : 'text-muted-foreground hover:bg-secondary'
                                    }`}
                                    title={st.is_published ? 'Unpublish from student view' : 'Publish to student view'}
                                  >
                                    {st.is_published ? <Unlock size={14} /> : <Lock size={14} />}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB: TEACHER WORKSPACE (Section 12) */}
      {mode === 'workspace' && (
        <div className="space-y-6">
          {workspaceData && (
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span>Teacher Weekly Workspace</span>
                    <span className="text-xs font-normal text-muted-foreground">({workspaceData.evaluation_week})</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select your assigned class and subject context to complete weekly observations.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {workspaceData.assigned_classes?.length > 0 && (
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="text-xs bg-secondary border border-border rounded-lg px-2.5 py-1.5 focus:outline-none"
                    >
                      {workspaceData.assigned_classes.map((cls: any) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} {cls.is_class_teacher ? '(Homeroom)' : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  {workspaceData.assigned_subjects?.length > 0 && (
                    <select
                      value={wsSelectedSubjectId}
                      onChange={(e) => setWsSelectedSubjectId(e.target.value)}
                      className="text-xs bg-secondary border border-border rounded-lg px-2.5 py-1.5 focus:outline-none"
                    >
                      <option value="">Homeroom / General Observation</option>
                      {workspaceData.assigned_subjects.map((sub: any) => (
                        <option key={sub.id} value={sub.id}>Subject: {sub.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Student Workspace Table */}
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground font-medium">
                      <th className="pb-2.5">Student</th>
                      <th className="pb-2.5">Admission Number</th>
                      <th className="pb-2.5 text-center">Your Status</th>
                      <th className="pb-2.5 text-center">Last Saved / Submitted</th>
                      <th className="pb-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {workspaceData.students?.map((st: any) => {
                      const statusMap: Record<string, { label: string; class: string }> = {
                        submitted: { label: 'Submitted', class: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
                        revised: { label: 'Revised', class: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
                        draft: { label: 'Draft', class: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
                        not_started: { label: 'Not Started', class: 'bg-secondary text-muted-foreground border-border' },
                      };
                      const curr = statusMap[st.status] || statusMap.not_started;

                      return (
                        <tr key={st.student_id} className="hover:bg-accent/40 transition">
                          <td className="py-3 font-semibold text-foreground">{st.full_name}</td>
                          <td className="py-3 text-muted-foreground">{st.admission_number}</td>
                          <td className="py-3 text-center">
                            <span className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-full border ${curr.class}`}>
                              {curr.label}
                            </span>
                          </td>
                          <td className="py-3 text-center text-muted-foreground">
                            {st.submitted_at ? new Date(st.submitted_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEvaluationModal(st, selectedClassId, wsSelectedSubjectId)}
                                className="px-3 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1.5"
                              >
                                <Edit3 size={13} />
                                <span>{st.status === 'not_started' ? 'Start' : 'Resume / Edit'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setProfileModalStudentId(st.student_id);
                                  fetchStudentProfile(st.student_id, selectedWeek);
                                }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                                title="View 6D profile"
                              >
                                <Eye size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: GENDER-BASED ANALYTICS (Section 10) */}
      {mode === 'gender' && genderData && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <BookOpen size={16} className="text-primary" />
              <span>Gender-Based Aggregate Analysis</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              Aggregate statistics calculated strictly from students' existing recorded gender fields. Unknown and unrecorded categories are kept separate.
              No individual student records are exposed. Statistics require at least 2 records to calculate, displaying N/A otherwise.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(genderData.gender_analytics || {}).map(([key, group]: any) => (
              <div key={key} className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-semibold text-sm capitalize">{group.gender_label}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                    n = {group.evaluated_students} / {group.total_students}
                  </span>
                </div>

                {group.has_sufficient_data ? (
                  <div className="space-y-2 pt-1">
                    {Object.entries(group.domain_averages || {}).map(([dKey, dVal]: any) => (
                      <div key={dKey} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground truncate max-w-[130px]">{dVal.dimension_name}</span>
                        <span className="font-semibold text-foreground">
                          {dVal.average_score !== 'N/A' ? `${dVal.average_score}` : 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Insufficient data (n &lt; 2)
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: SAFEGUARDING REFERRALS (Section 13) */}
      {mode === 'safeguarding' && isManager && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert size={16} className="text-rose-500" />
                <span>Restricted Safeguarding Referrals</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Strictly confidential escalation queue for designated school safeguarding leads and administrators.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground font-medium">
                  <th className="pb-2.5">Date</th>
                  <th className="pb-2.5">Student</th>
                  <th className="pb-2.5">Admission ID</th>
                  <th className="pb-2.5">Campus</th>
                  <th className="pb-2.5">Referred By</th>
                  <th className="pb-2.5">Urgency</th>
                  <th className="pb-2.5">Status</th>
                  <th className="pb-2.5">Concern Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {safeguardingList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      No active safeguarding referrals recorded.
                    </td>
                  </tr>
                ) : (
                  safeguardingList.map((ref: any) => (
                    <tr key={ref.id} className="hover:bg-accent/40 transition">
                      <td className="py-3 text-muted-foreground">{new Date(ref.created_at).toLocaleDateString()}</td>
                      <td className="py-3 font-semibold text-foreground">{ref.student_name}</td>
                      <td className="py-3 text-muted-foreground">{ref.admission_number}</td>
                      <td className="py-3 text-muted-foreground">{ref.school_name}</td>
                      <td className="py-3 text-muted-foreground">{ref.referred_by_name}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                          ref.urgency_level === 'immediate'
                            ? 'bg-rose-500/20 text-rose-600 border border-rose-500/30'
                            : ref.urgency_level === 'high'
                            ? 'bg-amber-500/20 text-amber-600 border border-amber-500/30'
                            : 'bg-secondary text-muted-foreground'
                        }`}>
                          {ref.urgency_level}
                        </span>
                      </td>
                      <td className="py-3 capitalize">{ref.status?.replace('_', ' ')}</td>
                      <td className="py-3 max-w-xs truncate text-muted-foreground">{ref.concern_description}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: AUDIT LOGS (Section 13) */}
      {mode === 'audit' && isManager && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" />
            <span>Psychological Evaluation Audit Trail</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground font-medium">
                  <th className="pb-2.5">Timestamp</th>
                  <th className="pb-2.5">Actor</th>
                  <th className="pb-2.5">Role</th>
                  <th className="pb-2.5">Action</th>
                  <th className="pb-2.5">Record Type</th>
                  <th className="pb-2.5">Record ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {auditLogs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-accent/40 transition">
                    <td className="py-2.5 text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="py-2.5 font-medium">{log.actor_name}</td>
                    <td className="py-2.5 capitalize text-muted-foreground">{log.actor_role?.replace('_', ' ')}</td>
                    <td className="py-2.5 font-semibold text-primary">{log.action}</td>
                    <td className="py-2.5 text-muted-foreground">{log.record_type}</td>
                    <td className="py-2.5 text-muted-foreground">#{log.record_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: STUDENT PORTAL: MY DEVELOPMENT PROFILE (Section 11) */}
      {mode === 'student' && (
        <div className="space-y-6">
          {myProfileData?.has_published_evaluations ? (
            <div className="space-y-6">
              {/* Encouraging Banner */}
              <div className="psych-banner" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)', borderColor: 'rgba(52, 211, 153, 0.3)' }}>
                <div className="psych-banner-watermark">
                  <Sparkles size={160} />
                </div>
                <div className="psych-banner-content">
                  <div className="psych-banner-top">
                    <div className="psych-banner-brand">
                      <div className="psych-banner-icon" style={{ background: 'rgba(255, 255, 255, 0.15)', borderColor: 'rgba(255, 255, 255, 0.25)' }}>
                        <Sparkles size={24} style={{ color: '#a7f3d0' }} />
                      </div>
                      <div>
                        <h2 className="psych-banner-title" style={{ fontSize: 20 }}>My Behavioural &amp; Developmental Profile</h2>
                        <p className="psych-banner-sub" style={{ color: '#d1fae5' }}>
                          {myProfileData.student_name} • ID: {myProfileData.admission_number}
                        </p>
                      </div>
                    </div>

                    {myProfileData.published_weeks?.length > 1 && (
                      <div className="psych-banner-actions">
                        <span style={{ fontSize: 12, color: '#d1fae5', fontWeight: 600 }}>Week:</span>
                        <select
                          value={myProfileWeek}
                          onChange={(e) => {
                            setMyProfileWeek(e.target.value);
                            fetchMyProfile(e.target.value);
                          }}
                          className="psych-select"
                          style={{ background: '#064e3b', borderColor: '#059669', color: '#ffffff' }}
                        >
                          {myProfileData.published_weeks.map((wk: string) => (
                            <option key={wk} value={wk}>{wk}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 6D Radar Chart & Dimension Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Radar Chart */}
                <div className="lg:col-span-6 bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-semibold">Development Dimensions Radar</h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={myProfileData.radar_axes?.map((ax: any) => ({
                        dimension: ax.dimension_name,
                        score: ax.score !== null ? ax.score : 0,
                      }))}>
                        <PolarGrid strokeDasharray="3 3" opacity={0.3} />
                        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar name="Development Score" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.4} />
                        <RechartsTooltip />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Dimension Cards with Encouraging Guidance */}
                <div className="lg:col-span-6 space-y-3">
                  <h3 className="text-sm font-semibold">Your Growth Across the 6 Dimensions</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {myProfileData.radar_axes?.map((ax: any) => (
                      <div key={ax.dimension_key} className="bg-card border border-border rounded-xl p-3.5 space-y-1.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground">{ax.dimension_name}</span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            {ax.score !== null ? `${ax.score}` : 'In progress'}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {myProfileData.encouraging_guidance?.[ax.dimension_key] || 'Keep actively developing this habit in class!'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Teacher Feedback Approved for Viewing */}
              {myProfileData.teacher_feedback?.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-500" />
                    <span>Positive Feedback from Your Teachers</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {myProfileData.teacher_feedback.map((fb: any, idx: number) => (
                      <div key={idx} className="p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-1">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          {fb.teacher_name} ({fb.subject_name})
                        </div>
                        <p className="text-xs text-foreground italic">"{fb.feedback}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Accessible Tabular Representation */}
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold">Accessible Scores Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2">Dimension</th>
                        <th className="pb-2 text-center">Score (0–100)</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {myProfileData.radar_axes?.map((ax: any) => (
                        <tr key={ax.dimension_key}>
                          <td className="py-2.5 font-medium">{ax.dimension_name}</td>
                          <td className="py-2.5 text-center font-bold">{ax.score !== null ? ax.score : 'Insufficient observations'}</td>
                          <td className="py-2.5 text-muted-foreground">{ax.status_label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="psych-empty">
              <div className="psych-empty-icon">
                <Sparkles size={28} />
              </div>
              <h3>No Published Profile Yet</h3>
              <p>
                {myProfileData?.message || 'Your weekly behavioural observation profile has not been published yet. Please check back after your teachers have completed their observations.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. LEVEL 4: STUDENT PROFILE MODAL (RADAR + HISTORY + REFLECTIONS) */}
      {/* ==================================================================== */}
      {profileModalStudentId && studentProfileData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Student Behavioural & Development Profile
                </span>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mt-0.5">
                  <span>{studentProfileData.profile.student_name}</span>
                  <span className="text-xs font-normal text-muted-foreground">({studentProfileData.profile.admission_number})</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                  {studentProfileData.profile.disclaimer}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setProfileModalStudentId(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Week & Comparison Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/30 p-3 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold">Evaluation Period:</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                  {studentProfileData.profile.evaluation_week}
                </span>

                {studentProfileData.history?.available_weeks?.length > 1 && (
                  <div className="flex items-center gap-1.5 ml-4">
                    <span className="text-xs text-muted-foreground">Compare with:</span>
                    <select
                      value={compareWeek}
                      onChange={(e) => {
                        setCompareWeek(e.target.value);
                        fetchStudentProfile(studentProfileData.profile.student_id, studentProfileData.profile.evaluation_week, e.target.value);
                      }}
                      className="text-xs bg-card border border-border rounded px-2 py-1"
                    >
                      <option value="">None (Single Period)</option>
                      {studentProfileData.history.available_weeks
                        .filter((w: string) => w !== studentProfileData.profile.evaluation_week)
                        .map((w: string) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  studentProfileData.profile.is_published
                    ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                    : 'bg-secondary text-muted-foreground'
                }`}>
                  {studentProfileData.profile.is_published ? 'Published to Student' : 'Unpublished (Staff Only)'}
                </span>

                {studentProfileData.can_publish && (
                  <button
                    type="button"
                    onClick={() => handleTogglePublication(
                      studentProfileData.profile.student_id,
                      studentProfileData.profile.evaluation_week,
                      studentProfileData.profile.is_published
                    )}
                    className="px-3 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition"
                  >
                    {studentProfileData.profile.is_published ? 'Unpublish' : 'Publish to Student'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSafeguardingModalStudent(studentProfileData.profile);
                  }}
                  className="px-3 py-1 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1"
                >
                  <ShieldAlert size={12} />
                  <span>Refer Safeguarding</span>
                </button>
              </div>
            </div>

            {/* Radar Chart + Tabular Alternative */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* 6D Radar Chart */}
              <div className="lg:col-span-6 bg-card border border-border rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  6-Dimensional Radar Chart (0–100)
                </h4>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={chartData}>
                      <PolarGrid strokeDasharray="3 3" opacity={0.3} />
                      <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                      <Radar
                        name={`Period (${studentProfileData.profile.evaluation_week})`}
                        dataKey="score"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.4}
                      />
                      {compareWeek && (
                        <Radar
                          name={`Compare (${compareWeek})`}
                          dataKey="compareScore"
                          stroke="#f59e0b"
                          fill="#f59e0b"
                          fillOpacity={0.3}
                        />
                      )}
                      <RechartsTooltip />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Accessible Tabular Representation */}
              <div className="lg:col-span-6 bg-card border border-border rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Accessible Domain Scores Table
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-1.5">Dimension</th>
                        <th className="pb-1.5 text-center">Score</th>
                        {compareWeek && <th className="pb-1.5 text-center">Prev ({compareWeek})</th>}
                        <th className="pb-1.5">Observation Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {chartData.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-2 font-medium">{item.dimension}</td>
                          <td className="py-2 text-center font-bold text-indigo-600">
                            {item.rawScore !== null ? item.rawScore : 'Insufficient'}
                          </td>
                          {compareWeek && (
                            <td className="py-2 text-center font-bold text-amber-600">
                              {item.compareRaw !== undefined ? item.compareRaw : '—'}
                            </td>
                          )}
                          <td className="py-2 text-muted-foreground text-[11px]">{item.statusLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Weekly Historical Timeline (Line Chart) */}
            {studentProfileData.history?.timeline?.length > 1 && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Historical Weekly Development Trends
                </h4>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={studentProfileData.history.timeline}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="evaluation_week" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Line type="monotone" dataKey="learning_engagement" name="Learning Engagement" stroke="#6366f1" strokeWidth={2} />
                      <Line type="monotone" dataKey="self_regulation" name="Self-Regulation" stroke="#10b981" strokeWidth={2} />
                      <Line type="monotone" dataKey="emotional_regulation" name="Emotional Regulation" stroke="#f59e0b" strokeWidth={2} />
                      <Line type="monotone" dataKey="social_interaction" name="Social Interaction" stroke="#ec4899" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Neutral Trajectory Descriptions */}
            {studentProfileData.history?.trajectory?.length > 0 && (
              <div className="bg-secondary/20 border border-border rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-semibold text-foreground">Recent Observed Pattern Changes</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {studentProfileData.history.trajectory.map((tr: any) => (
                    <div key={tr.dimension_key} className="p-2.5 bg-card border border-border rounded-lg flex items-center justify-between">
                      <span className="font-medium text-foreground">{tr.dimension_name}</span>
                      <span className={`text-[11px] font-semibold flex items-center gap-1 ${
                        tr.trend === 'increased'
                          ? 'text-emerald-600'
                          : tr.trend === 'decreased'
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                      }`}>
                        {tr.trend === 'increased' && <ArrowUpRight size={13} />}
                        {tr.trend === 'decreased' && <ArrowDownRight size={13} />}
                        {tr.trend === 'stable' && <Minus size={13} />}
                        <span>{tr.description}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contributing Teacher Observations */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Contributing Teacher Observations ({studentProfileData.profile.total_contributing_evaluations})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {studentProfileData.profile.teacher_observations?.map((obs: any) => (
                  <div key={obs.evaluation_id} className="bg-card border border-border rounded-xl p-4 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="font-semibold text-xs text-foreground">
                        {obs.teacher_name} ({obs.observation_context})
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {obs.submitted_at ? new Date(obs.submitted_at).toLocaleDateString() : 'Draft'}
                      </span>
                    </div>

                    {obs.strengths_observed && (
                      <div className="text-xs">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">Observed Strengths: </span>
                        <span className="text-muted-foreground">{obs.strengths_observed}</span>
                      </div>
                    )}

                    {obs.support_areas && (
                      <div className="text-xs">
                        <span className="font-semibold text-amber-600 dark:text-amber-400">Area for Support: </span>
                        <span className="text-muted-foreground">{obs.support_areas}</span>
                      </div>
                    )}

                    {obs.support_action && (
                      <div className="text-xs">
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">Classroom Action: </span>
                        <span className="text-muted-foreground">{obs.support_action}</span>
                      </div>
                    )}

                    {obs.teacher_notes && (
                      <div className="text-xs p-2 bg-rose-500/10 border border-rose-500/20 rounded text-rose-700 dark:text-rose-300">
                        <span className="font-semibold">Confidential Staff Note: </span>
                        <span>{obs.teacher_notes}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. QUESTIONNAIRE OBSERVATION MODAL (TEACHER FORM) */}
      {/* ==================================================================== */}
      {evalModalStudent && evalDetail && template && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Weekly Behavioural Observation Questionnaire
                </span>
                <h2 className="text-lg font-bold text-foreground mt-0.5">
                  Evaluating {evalDetail.student_name} ({evalDetail.observation_context})
                </h2>
                <p className="text-xs text-muted-foreground">
                  Week: <span className="font-semibold">{evalDetail.evaluation_week}</span> • Class: {evalDetail.class_name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEvalModalStudent(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Exact Administration Instructions (Section 3 of spec) */}
            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
              <span className="font-bold">Administration Instructions: </span>
              "{template.instructions}"
            </div>

            {/* Questions grouped by 6 Dimensions */}
            <div className="space-y-6">
              {template.dimensions?.map((dim: any) => {
                const preview = formDomainScorePreviews[dim.key];
                return (
                  <div key={dim.id} className="bg-secondary/20 border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-border/80 pb-2">
                      <div>
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">
                          {dim.name}
                        </h4>
                        <p className="text-[11px] text-muted-foreground">{dim.description}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          preview?.status === 'valid'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        }`}>
                          {preview?.status === 'valid' ? `Score: ${preview.score}` : 'Insufficient (min 2 items)'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4 pt-1">
                      {dim.questions?.map((q: any) => {
                        const currentVal = evalFormResponses[q.id];
                        return (
                          <div key={q.id} className="space-y-2">
                            <p className="text-xs font-medium text-foreground">
                              {q.display_order}. {q.question_text}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {[
                                { val: 1, label: '1 - Never' },
                                { val: 2, label: '2 - Rarely' },
                                { val: 3, label: '3 - Sometimes' },
                                { val: 4, label: '4 - Frequently' },
                                { val: 5, label: '5 - Consistently' },
                              ].map((opt) => (
                                <button
                                  key={opt.val}
                                  type="button"
                                  onClick={() => setEvalFormResponses(prev => ({ ...prev, [q.id]: opt.val }))}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition ${
                                    currentVal === opt.val
                                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                      : 'bg-card border-border hover:bg-secondary text-foreground'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}

                              <button
                                type="button"
                                onClick={() => setEvalFormResponses(prev => ({ ...prev, [q.id]: null }))}
                                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition ${
                                  currentVal === null || currentVal === undefined
                                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'
                                    : 'bg-card border-dashed border-border hover:bg-secondary text-muted-foreground'
                                }`}
                                title="Excluded from scoring calculations"
                              >
                                Not Observed / Insufficient Opportunity
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Optional Teacher Reflections (Section 4) */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Optional Teacher Reflections & Guidance
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Student strengths observed this week</label>
                  <textarea
                    rows={2}
                    value={evalStrengths}
                    onChange={(e) => setEvalStrengths(e.target.value)}
                    placeholder="e.g. Participated actively during science lab experiments..."
                    className="w-full text-xs p-2.5 bg-secondary border border-border rounded-lg focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Area where student may benefit from support</label>
                  <textarea
                    rows={2}
                    value={evalSupportAreas}
                    onChange={(e) => setEvalSupportAreas(e.target.value)}
                    placeholder="e.g. Taking time to review calculations before hand-in..."
                    className="w-full text-xs p-2.5 bg-secondary border border-border rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Suggested classroom support action</label>
                <input
                  type="text"
                  value={evalSupportAction}
                  onChange={(e) => setEvalSupportAction(e.target.value)}
                  placeholder="e.g. Paired problem solving in math sessions..."
                  className="w-full text-xs p-2 bg-secondary border border-border rounded-lg focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <Lock size={12} />
                    <span>Internal Teacher Notes (Strictly Confidential • Staff Only)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={evalTeacherNotes}
                    onChange={(e) => setEvalTeacherNotes(e.target.value)}
                    placeholder="Private staff notes. Never exposed to students or parents..."
                    className="w-full text-xs p-2.5 bg-rose-500/5 border border-rose-500/20 rounded-lg focus:outline-none text-foreground"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Sparkles size={12} />
                    <span>Student-Visible Feedback (Approved Upon Publication)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={evalStudentFeedback}
                    onChange={(e) => setEvalStudentFeedback(e.target.value)}
                    placeholder="Encouraging constructive feedback visible to the student upon publication..."
                    className="w-full text-xs p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg focus:outline-none text-foreground"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setSafeguardingModalStudent(evalModalStudent)}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
              >
                <ShieldAlert size={14} />
                <span>Safeguarding Concern? Escalate Directly</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEvalModalStudent(null)}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={evalSaving}
                  onClick={() => handleSaveEvaluation('draft')}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition flex items-center gap-1.5"
                >
                  <Save size={13} />
                  <span>Save Draft</span>
                </button>

                <button
                  type="button"
                  disabled={evalSaving}
                  onClick={() => handleSaveEvaluation('submitted')}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition flex items-center gap-1.5 shadow-sm"
                >
                  <Send size={13} />
                  <span>
                    {evalDetail.status === 'submitted' || evalDetail.status === 'revised'
                      ? 'Submit Authorized Revision'
                      : 'Submit Evaluation'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. SAFEGUARDING ESCALATION MODAL */}
      {/* ==================================================================== */}
      {safeguardingModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-rose-500/40 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <ShieldAlert size={20} />
                <h3 className="font-bold text-sm">Escalate Immediate Safeguarding Concern</h3>
              </div>
              <button
                type="button"
                onClick={() => setSafeguardingModalStudent(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              If you identify an immediate safeguarding or wellbeing concern for{' '}
              <strong className="text-foreground">{safeguardingModalStudent.student_name || safeguardingModalStudent.full_name}</strong>,
              use this restricted workflow to notify designated school safeguarding personnel directly.
              This referral is entirely separate from questionnaire calculations and is strictly confidential.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Urgency Level</label>
              <select
                value={sgUrgency}
                onChange={(e) => setSgUrgency(e.target.value)}
                className="w-full text-xs p-2 bg-secondary border border-border rounded-lg"
              >
                <option value="standard">Standard Referral (Review within 24 hours)</option>
                <option value="high">High Concern (Requires same-day check-in)</option>
                <option value="immediate">Immediate Safeguarding Concern (Urgent Attention)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Factual Concern Details</label>
              <textarea
                rows={4}
                value={sgDescription}
                onChange={(e) => setSgDescription(e.target.value)}
                placeholder="Factual, non-judgmental description of observed concern or student disclosure..."
                className="w-full text-xs p-2.5 bg-secondary border border-border rounded-lg focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSafeguardingModalStudent(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sgSubmitting}
                onClick={handleSubmitSafeguarding}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1.5 shadow-sm"
              >
                <ShieldAlert size={13} />
                <span>Submit Confidential Referral</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
