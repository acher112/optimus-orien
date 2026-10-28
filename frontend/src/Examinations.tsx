import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Award, BarChart3, Calculator, Calendar, Check, CheckCircle2, ChevronRight,
  Download, FileSpreadsheet, FileText, Filter, Layers, Plus, Printer, RefreshCw,
  Search, Settings2, ShieldAlert, ShieldCheck, Sparkles, Trash2, TrendingUp, User, Users, X
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { list, request, type User as ApiUser } from './api';
import ExportMenu from './ExportMenu';
import './hr.css';

type R = Record<string, any>;
type Tab = 'analytics' | 'configurations' | 'engine_marks' | 'transcripts' | 'sessions' | 'datesheet' | 'scales';

const BOY_COLOR = '#3b82f6';
const GIRL_COLOR = '#ec4899';
const OVERALL_COLOR = '#6366f1';

export default function Examinations({ user, notify }: { user: ApiUser; notify: (m: string) => void }) {
  const isTeacher = user.role === 'teacher';
  const isManager = ['organisation_admin', 'school_admin', 'principal'].includes(user.role) || user.is_superuser;

  const [tab, setTab] = useState<Tab>('analytics');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bump, setBump] = useState(0);

  // Common school/class data
  const [classes, setClasses] = useState<R[]>([]);
  const [subjects, setSubjects] = useState<R[]>([]);
  const [staffList, setStaffList] = useState<R[]>([]);
  const [years, setYears] = useState<R[]>([]);

  // ----------------------------------------------------
  // Configurable Engine State
  // ----------------------------------------------------
  const [engineConfigs, setEngineConfigs] = useState<R[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);

  // Create Configuration Modal
  const [configModal, setConfigModal] = useState(false);
  const [newCfgName, setNewCfgName] = useState('');
  const [newCfgYear, setNewCfgYear] = useState('');
  const [newCfgClass, setNewCfgClass] = useState('');
  const [newCfgScale, setNewCfgScale] = useState('100.00');
  const [newCfgPrecision, setNewCfgPrecision] = useState(2);
  const [newCfgPassThreshold, setNewCfgPassThreshold] = useState('40.00');
  const [newCfgWeightMode, setNewCfgWeightMode] = useState<'equal' | 'custom'>('equal');
  const [newCfgTerms, setNewCfgTerms] = useState<Array<{ name: string; weight: string; max_marks: string }>>([
    { name: 'First Term', weight: '20.00', max_marks: '50.00' },
    { name: 'Second Term', weight: '30.00', max_marks: '75.00' },
    { name: 'Third Term', weight: '50.00', max_marks: '100.00' },
  ]);

  // Subject Max Marks Overrides in Modal (e.g. English 100 across all terms)
  const [subjectOverrides, setSubjectOverrides] = useState<Array<{ subject_id: string; term_index: number; max_marks: string }>>([]);

  // Configurable Marks Grid State
  const [gridClassId, setGridClassId] = useState<number | null>(null);
  const [gridSubjectId, setGridSubjectId] = useState<number | null>(null);
  const [engineMarksData, setEngineMarksData] = useState<R | null>(null);
  const [savingEngineMarks, setSavingEngineMarks] = useState(false);

  // Analytics State
  const [analyticsData, setAnalyticsData] = useState<R | null>(null);
  const [analyticsAveragingMethod, setAnalyticsAveragingMethod] = useState<'student_weighted' | 'class_weighted' | 'branch_weighted'>('student_weighted');
  const [analyticsGenderFilter, setAnalyticsGenderFilter] = useState<string>('');
  const [analyticsClassFilter, setAnalyticsClassFilter] = useState<string>('');

  // Transcript State
  const [transcriptStudentId, setTranscriptStudentId] = useState<number | null>(null);
  const [transcriptData, setTranscriptData] = useState<R | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<R[]>([]);

  // ----------------------------------------------------
  // Legacy Sessions & Date Sheets State
  // ----------------------------------------------------
  const [sessions, setSessions] = useState<R[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [papers, setPapers] = useState<R[]>([]);
  const [scales, setScales] = useState<R[]>([]);
  const [sessionModal, setSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionStart, setNewSessionStart] = useState(new Date().toISOString().slice(0, 10));
  const [newSessionEnd, setNewSessionEnd] = useState(new Date().toISOString().slice(0, 10));
  const [newSessionPeriod, setNewSessionPeriod] = useState('Term 1');
  const [newSessionRanking, setNewSessionRanking] = useState(false);

  const [paperModal, setPaperModal] = useState(false);
  const [paperClass, setPaperClass] = useState('');
  const [paperSubject, setPaperSubject] = useState('');
  const [paperDate, setPaperDate] = useState(new Date().toISOString().slice(0, 10));
  const [paperTime, setPaperTime] = useState('09:00');
  const [paperDuration, setPaperDuration] = useState('120');
  const [paperMaxMarks, setPaperMaxMarks] = useState('100.00');
  const [paperRoom, setPaperRoom] = useState('');
  const [paperInvigilator, setPaperInvigilator] = useState('');
  const [clashError, setClashError] = useState('');

  // Initial Load
  useEffect(() => {
    list<R>('classes').then(cls => {
      setClasses(cls);
      if (cls.length > 0) {
        setGridClassId(cls[0].id);
      }
    }).catch(() => {});
    list<R>('subjects').then(sub => {
      setSubjects(sub);
      if (sub.length > 0) {
        setGridSubjectId(sub[0].id);
      }
    }).catch(() => {});
    list<R>('years').then(setYears).catch(() => {});
    request<R>('staff/').then(r => setStaffList(r.results || [])).catch(() => {});
    list<R>('students').then(setEnrolledStudents).catch(() => {});
  }, []);

  // Load Configurable Engine Configurations
  const loadEngineConfigs = useCallback(async () => {
    try {
      const res = await request<R>('exams/engine/configurations/');
      const list = res.results || [];
      setEngineConfigs(list);
      if (list.length > 0 && !selectedConfigId) {
        setSelectedConfigId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load exam configurations', err);
    }
  }, [selectedConfigId]);

  // Load Legacy Sessions & Scales
  const loadSessionsAndPapers = useCallback(async () => {
    try {
      const [sessRes, scaleRes] = await Promise.all([
        request<R>('exams/sessions/'),
        request<R>('exams/grading-scales/')
      ]);
      const sessList = sessRes.results || [];
      setSessions(sessList);
      setScales(scaleRes.results || []);
      if (sessList.length && !activeSessionId) {
        setActiveSessionId(sessList[0].id);
      }
      if (activeSessionId) {
        const pRes = await request<R>(`exams/papers/?session=${activeSessionId}`);
        setPapers(pRes.results || []);
      }
    } catch (err) {
      console.error('Failed to load exam sessions', err);
    }
  }, [activeSessionId]);

  // Load Analytics Data
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = `exams/engine/analytics/?averaging_method=${analyticsAveragingMethod}`;
      if (selectedConfigId) url += `&configuration=${selectedConfigId}`;
      if (analyticsGenderFilter) url += `&gender=${analyticsGenderFilter}`;
      if (analyticsClassFilter) url += `&class=${analyticsClassFilter}`;

      const res = await request<R>(url);
      setAnalyticsData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }, [selectedConfigId, analyticsAveragingMethod, analyticsGenderFilter, analyticsClassFilter]);

  // Load Marks Grid Data
  const loadMarksGridData = useCallback(async () => {
    if (!selectedConfigId || !gridClassId || !gridSubjectId) return;
    setLoading(true);
    try {
      const res = await request<R>(`exams/engine/configurations/${selectedConfigId}/marks-grid/?class=${gridClassId}&subject=${gridSubjectId}`);
      setEngineMarksData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load mark entry grid');
    } finally {
      setLoading(false);
    }
  }, [selectedConfigId, gridClassId, gridSubjectId]);

  // Load Student Transcript
  const loadTranscript = useCallback(async (stId: number) => {
    setLoading(true);
    try {
      let url = `exams/engine/student-transcript/?student=${stId}`;
      if (selectedConfigId) url += `&configuration=${selectedConfigId}`;
      const res = await request<R>(url);
      setTranscriptData(res);
      setTranscriptStudentId(stId);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load student transcript');
    } finally {
      setLoading(false);
    }
  }, [selectedConfigId, notify]);

  // Trigger loads on tab change or dependency bump
  useEffect(() => {
    loadEngineConfigs();
    loadSessionsAndPapers();
  }, [loadEngineConfigs, loadSessionsAndPapers, bump]);

  useEffect(() => {
    if (tab === 'analytics') loadAnalytics();
    if (tab === 'engine_marks') loadMarksGridData();
  }, [tab, loadAnalytics, loadMarksGridData, bump]);

  // ----------------------------------------------------
  // Configuration Handlers
  // ----------------------------------------------------
  const handleCreateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalW = newCfgTerms.reduce((sum, t) => sum + (parseFloat(t.weight) || 0), 0);
    if (Math.abs(totalW - 100) > 0.001) {
      alert(`Term weights must sum to exactly 100.00%. Current sum: ${totalW.toFixed(2)}%`);
      return;
    }

    try {
      const components = newCfgTerms.map((t, idx) => {
        // Collect subject max marks overrides for this term
        const termOverrides = subjectOverrides
          .filter(o => o.term_index === idx)
          .map(o => ({
            subject_id: Number(o.subject_id),
            maximum_marks: o.max_marks
          }));

        return {
          name: t.name,
          sequence: idx + 1,
          weight_percentage: t.weight,
          default_max_marks: t.max_marks,
          subject_configs: termOverrides
        };
      });

      const payload = {
        name: newCfgName,
        academic_year: newCfgYear || (years[0]?.id ?? undefined),
        school_class: newCfgClass || undefined,
        reporting_scale: newCfgScale,
        rounding_precision: newCfgPrecision,
        passing_threshold: newCfgPassThreshold,
        subject_weighting_mode: newCfgWeightMode,
        components
      };

      const res = await request<R>('exams/engine/configurations/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      notify(`Configuration '${res.name}' created in draft mode.`);
      setConfigModal(false);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to create configuration');
    }
  };

  const handlePublishConfig = async (cfgId: number) => {
    if (!window.confirm('Publishing will lock weights and recalculate all affected student and subject results automatically. Proceed?')) return;
    try {
      const res = await request<R>(`exams/engine/configurations/${cfgId}/publish/`, { method: 'POST' });
      notify(`Configuration published! Version ${res.version} is now live. All results recalculated.`);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const handleRecalculateConfig = async (cfgId: number) => {
    try {
      const res = await request<R>(`exams/engine/configurations/${cfgId}/recalculate/`, { method: 'POST' });
      notify(`Recalculated: ${res.summary.student_results_updated} student results and ${res.summary.subject_results_updated} subject results updated.`);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Recalculation failed');
    }
  };

  // ----------------------------------------------------
  // Mark Entry Handlers
  // ----------------------------------------------------
  const handleSaveEngineMarks = async () => {
    if (!selectedConfigId || !gridClassId || !gridSubjectId || !engineMarksData) return;
    setSavingEngineMarks(true);
    try {
      const payload = {
        class: gridClassId,
        subject: gridSubjectId,
        marks: engineMarksData.students.map((st: R) => ({
          student_id: st.student_id,
          terms: st.terms
        }))
      };
      const res = await request<R>(`exams/engine/configurations/${selectedConfigId}/marks-grid/`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      notify(`Saved ${res.updated_marks} marks records across terms. Recalculated ${res.affected_students} students.`);
      loadMarksGridData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save marks');
    } finally {
      setSavingEngineMarks(false);
    }
  };

  // ----------------------------------------------------
  // Legacy Session Handlers
  // ----------------------------------------------------
  const handlePublishSession = async (sessId: number) => {
    if (!confirm('Publishing will snapshot results and make grades visible. Proceed?')) return;
    try {
      await request<R>(`exams/sessions/${sessId}/publish/`, { method: 'POST' });
      notify('Exam session published!');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Publish failed');
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await request<R>('exams/sessions/', {
        method: 'POST',
        body: JSON.stringify({
          name: newSessionName,
          start_date: newSessionStart,
          end_date: newSessionEnd,
          reporting_period: newSessionPeriod,
          ranking_enabled: newSessionRanking
        })
      });
      notify(`Session '${res.name}' created.`);
      setSessionModal(false);
      setNewSessionName('');
      setActiveSessionId(res.id);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Creation failed');
    }
  };

  const handleCreatePaper = async (e: React.FormEvent) => {
    e.preventDefault();
    setClashError('');
    if (!activeSessionId) return;
    try {
      await request<R>('exams/papers/', {
        method: 'POST',
        body: JSON.stringify({
          session: activeSessionId,
          school_class: paperClass,
          subject: paperSubject,
          date: paperDate,
          start_time: paperTime,
          duration_min: paperDuration,
          max_marks: paperMaxMarks,
          room: paperRoom,
          invigilator: paperInvigilator || undefined
        })
      });
      notify('Exam paper scheduled in date sheet.');
      setPaperModal(false);
      setBump(b => b + 1);
    } catch (err: any) {
      if (err.clash) {
        setClashError(err.clash);
      } else {
        notify(err instanceof Error ? err.message : 'Scheduling failed');
      }
    }
  };

  const currentTermWeightsSum = newCfgTerms.reduce((sum, t) => sum + (parseFloat(t.weight) || 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">ACADEMICS & EXAMINATION ENGINE</div>
          <h1>Examination & Academic Performance</h1>
          <p>Configurable term weightages, independent subject maximum marks, and normalized performance analytics.</p>
        </div>
        <div className="fx-filters">
          <label>Configuration
            <select
              className="fx-select"
              value={selectedConfigId || ''}
              onChange={e => {
                setSelectedConfigId(Number(e.target.value));
                setBump(b => b + 1);
              }}
            >
              {engineConfigs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </select>
          </label>
          <button className="outline-btn" onClick={() => setBump(b => b + 1)} title="Refresh data">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <nav className="fx-tabs" aria-label="Exam sections" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 6 }}>
        <button className={tab === 'analytics' ? 'on' : ''} onClick={() => setTab('analytics')}>
          <BarChart3 size={15} /> Performance Analytics
        </button>
        <button className={tab === 'configurations' ? 'on' : ''} onClick={() => setTab('configurations')}>
          <Settings2 size={15} /> Exam Structures & Weightages
        </button>
        <button className={tab === 'engine_marks' ? 'on' : ''} onClick={() => setTab('engine_marks')}>
          <FileSpreadsheet size={15} /> Marks Entry Grid
        </button>
        <button className={tab === 'transcripts' ? 'on' : ''} onClick={() => setTab('transcripts')}>
          <FileText size={15} /> Student Transcripts
        </button>
        <button className={tab === 'datesheet' ? 'on' : ''} onClick={() => setTab('datesheet')}>
          <Calendar size={15} /> Date Sheet & Clash Detection
        </button>
        <button className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}>
          <Award size={15} /> Exam Sessions
        </button>
        <button className={tab === 'scales' ? 'on' : ''} onClick={() => setTab('scales')}>
          <ShieldCheck size={15} /> Grading Scales
        </button>
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {/* ------------------------------------------------------------- */}
      {/* 1. PERFORMANCE ANALYTICS TAB                                  */}
      {/* ------------------------------------------------------------- */}
      {tab === 'analytics' && analyticsData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Filter Bar */}
          <section className="panel" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Filter size={15} /> FILTERS:
                </span>
                <label style={{ fontSize: 13 }}>Averaging Method
                  <select
                    className="fx-select"
                    style={{ marginLeft: 6, fontSize: 13 }}
                    value={analyticsAveragingMethod}
                    onChange={e => setAnalyticsAveragingMethod(e.target.value as any)}
                  >
                    <option value="student_weighted">Student-weighted (Official Headline)</option>
                    <option value="class_weighted">Class-weighted</option>
                    <option value="branch_weighted">Branch-weighted</option>
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>Class
                  <select
                    className="fx-select"
                    style={{ marginLeft: 6, fontSize: 13 }}
                    value={analyticsClassFilter}
                    onChange={e => setAnalyticsClassFilter(e.target.value)}
                  >
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>Gender Group
                  <select
                    className="fx-select"
                    style={{ marginLeft: 6, fontSize: 13 }}
                    value={analyticsGenderFilter}
                    onChange={e => setAnalyticsGenderFilter(e.target.value)}
                  >
                    <option value="">All Students (Combined)</option>
                    <option value="male">Boys Only</option>
                    <option value="female">Girls Only</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="pill purple" style={{ fontSize: 12 }}>
                  Scale: {analyticsData.configuration.reporting_scale}
                </span>
                <span className="pill" style={{ fontSize: 12 }}>
                  Pass Threshold: {analyticsData.summary.passing_threshold}%
                </span>
              </div>
            </div>
          </section>

          {/* Metric KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
            {/* Headline Average */}
            <div className="panel" style={{ padding: '16px 20px', borderTop: `4px solid ${OVERALL_COLOR}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Overall Academic Average
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#1e293b', margin: '8px 0 4px' }}>
                {analyticsData.summary.headline_average !== null ? `${analyticsData.summary.headline_average}%` : 'N/A'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Method: <strong style={{ color: OVERALL_COLOR }}>{analyticsData.summary.averaging_method.replace('_', ' ')}</strong>
              </div>
            </div>

            {/* Boys Average */}
            <div className="panel" style={{ padding: '16px 20px', borderTop: `4px solid ${BOY_COLOR}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Boys' Average
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: BOY_COLOR, margin: '8px 0 4px' }}>
                {analyticsData.summary.boys_average !== null ? `${analyticsData.summary.boys_average}%` : 'N/A'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {analyticsData.summary.eligible_boys_count} eligible boys assessed
              </div>
            </div>

            {/* Girls Average */}
            <div className="panel" style={{ padding: '16px 20px', borderTop: `4px solid ${GIRL_COLOR}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Girls' Average
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: GIRL_COLOR, margin: '8px 0 4px' }}>
                {analyticsData.summary.girls_average !== null ? `${analyticsData.summary.girls_average}%` : 'N/A'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {analyticsData.summary.eligible_girls_count} eligible girls assessed
              </div>
            </div>

            {/* Gender Performance Gap */}
            <div className="panel" style={{ padding: '16px 20px', borderTop: '4px solid #10b981' }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Gender Performance Gap
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#10b981', margin: '8px 0 4px' }}>
                {analyticsData.summary.gender_gap !== null ? (
                  `${analyticsData.summary.gender_gap > 0 ? '+' : ''}${analyticsData.summary.gender_gap} pp`
                ) : 'N/A'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Difference in percentage points (Girls – Boys)
              </div>
            </div>

            {/* Assessment Completion Status */}
            <div className="panel" style={{ padding: '16px 20px', borderTop: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Eligible vs Pending
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', margin: '8px 0 4px' }}>
                {analyticsData.summary.eligible_students_count} <span style={{ fontSize: 14, fontWeight: 400, color: '#64748b' }}>Complete</span> / {analyticsData.summary.pending_students_count} <span style={{ fontSize: 14, fontWeight: 400, color: '#f59e0b' }}>Pending</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Pass Rate: <strong>{analyticsData.summary.pass_rate !== null ? `${analyticsData.summary.pass_rate}%` : 'N/A'}</strong>
              </div>
            </div>
          </div>

          {/* Charts Row: Score Distribution & Gender Split */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Score Distribution Chart */}
            <section className="panel" style={{ padding: '16px 20px' }}>
              <div className="panel-head" style={{ marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16 }}>Score Range Distribution</h3>
                  <p style={{ fontSize: 13, color: '#64748b' }}>Student performance grouped into standard deciles</p>
                </div>
              </div>
              <div style={{ height: 240, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.score_distribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: any) => [`${value} students`, 'Count']} />
                    <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Class Performance Comparison */}
            <section className="panel" style={{ padding: '16px 20px' }}>
              <div className="panel-head" style={{ marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16 }}>Class-Level Performance</h3>
                  <p style={{ fontSize: 13, color: '#64748b' }}>Class averages with boys vs girls comparison</p>
                </div>
              </div>
              <div className="table-scroll" style={{ maxHeight: 240 }}>
                <table className="data-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>CLASS</th>
                      <th>OVERALL AVG</th>
                      <th>BOYS</th>
                      <th>GIRLS</th>
                      <th>GAP</th>
                      <th>ELIGIBLE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsData.class_performance.map((c: R) => (
                      <tr key={c.class_id}>
                        <td><strong>{c.class_name}</strong></td>
                        <td><span className="pill purple">{c.average !== null ? `${c.average}%` : 'N/A'}</span></td>
                        <td style={{ color: BOY_COLOR }}>{c.boys_average !== null ? `${c.boys_average}%` : '–'}</td>
                        <td style={{ color: GIRL_COLOR }}>{c.girls_average !== null ? `${c.girls_average}%` : '–'}</td>
                        <td>
                          {c.gender_gap !== null ? (
                            <span style={{ color: c.gender_gap >= 0 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                              {c.gender_gap > 0 ? '+' : ''}{c.gender_gap} pp
                            </span>
                          ) : '–'}
                        </td>
                        <td>{c.eligible_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Subject Performance Breakdown Table */}
          <section className="panel" style={{ padding: '16px 20px' }}>
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16 }}>Subject Performance & Gender Analytics</h3>
                <p style={{ fontSize: 13, color: '#64748b' }}>Normalized subject averages, gender group averages, and range bounds</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SUBJECT</th>
                    <th>CODE</th>
                    <th>OVERALL AVERAGE</th>
                    <th>BOYS AVERAGE</th>
                    <th>GIRLS AVERAGE</th>
                    <th>GENDER GAP</th>
                    <th>HIGHEST</th>
                    <th>LOWEST</th>
                    <th>STUDENTS</th>
                  </tr>
                </thead>
                <tbody>
                  {analyticsData.subject_performance.map((s: R) => (
                    <tr key={s.subject_id}>
                      <td><strong>{s.subject_name}</strong></td>
                      <td><code>{s.subject_code}</code></td>
                      <td>
                        <strong style={{ color: OVERALL_COLOR, fontSize: 14 }}>
                          {s.overall_average !== null ? `${s.overall_average}%` : 'N/A'}
                        </strong>
                      </td>
                      <td style={{ color: BOY_COLOR, fontWeight: 600 }}>
                        {s.boys_average !== null ? `${s.boys_average}%` : '–'}
                      </td>
                      <td style={{ color: GIRL_COLOR, fontWeight: 600 }}>
                        {s.girls_average !== null ? `${s.girls_average}%` : '–'}
                      </td>
                      <td>
                        {s.gender_gap !== null ? (
                          <span style={{ fontWeight: 700, color: s.gender_gap >= 0 ? '#10b981' : '#f59e0b' }}>
                            {s.gender_gap > 0 ? '+' : ''}{s.gender_gap} pp
                          </span>
                        ) : '–'}
                      </td>
                      <td style={{ color: '#16a34a' }}>{s.highest !== null ? `${s.highest}%` : '–'}</td>
                      <td style={{ color: '#dc2626' }}>{s.lowest !== null ? `${s.lowest}%` : '–'}</td>
                      <td>{s.eligible_students}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Students Requiring Academic Support (INT / Policy check) */}
          {analyticsData.support_needed && analyticsData.support_needed.length > 0 && (
            <section className="panel" style={{ padding: '16px 20px', borderLeft: '4px solid #ef4444' }}>
              <div className="panel-head" style={{ marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: 16, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldAlert size={18} /> Students Requiring Academic Support
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748b' }}>
                    Identified based on scoring below the configured passing threshold of {analyticsData.summary.passing_threshold}%.
                  </p>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>STUDENT</th>
                      <th>CLASS</th>
                      <th>GENDER</th>
                      <th>OVERALL SCORE</th>
                      <th>LOWEST SUBJECT</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsData.support_needed.map((st: R) => (
                      <tr key={st.student_id}>
                        <td><strong>{st.name}</strong></td>
                        <td>{st.class_name}</td>
                        <td style={{ textTransform: 'capitalize' }}>{st.gender || 'Unknown'}</td>
                        <td><span className="pill" style={{ background: '#fee2e2', color: '#b91c1c' }}>{st.overall_percentage}%</span></td>
                        <td>{st.lowest_subject || '–'}</td>
                        <td>
                          <button
                            className="sm-btn"
                            onClick={() => {
                              setTab('transcripts');
                              loadTranscript(st.student_id);
                            }}
                          >
                            View Transcript <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. EXAM STRUCTURES & WEIGHTAGES TAB                          */}
      {/* ------------------------------------------------------------- */}
      {tab === 'configurations' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Examination Structures & Weightages</h3>
              <p>Configure terms, weights summing to 100%, independent subject maximum marks, and reporting scales.</p>
            </div>
            {isManager && (
              <button className="primary-btn" onClick={() => setConfigModal(true)}>
                <Plus size={15} /> New Examination Structure
              </button>
            )}
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>STRUCTURE NAME</th>
                  <th>ACADEMIC YEAR</th>
                  <th>APPLIES TO</th>
                  <th>TERMS & WEIGHTS</th>
                  <th>SCALE</th>
                  <th>STATUS</th>
                  <th>VERSION</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {engineConfigs.map(c => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Weighting: {c.subject_weighting_mode}</div>
                    </td>
                    <td>{c.academic_year_name}</td>
                    <td>{c.class_name}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {c.components.map((comp: R) => (
                          <span key={comp.id} className="pill" style={{ background: '#f1f5f9', color: '#334155', fontSize: 11 }}>
                            {comp.name}: {comp.weight_percentage}% (Max {comp.default_max_marks})
                          </span>
                        ))}
                      </div>
                      <small style={{ color: Math.abs(parseFloat(c.total_weight) - 100) < 0.01 ? '#16a34a' : '#ea580c', fontWeight: 600 }}>
                        Total: {c.total_weight}%
                      </small>
                    </td>
                    <td>Out of {c.reporting_scale}</td>
                    <td>
                      <span className={`pill ${c.status === 'published' ? 'green' : c.status === 'locked' ? 'purple' : 'amber'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>v{c.version}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {isManager && c.status !== 'published' && (
                          <button
                            className="sm-btn"
                            style={{ color: '#16a34a', fontWeight: 600 }}
                            onClick={() => handlePublishConfig(c.id)}
                            title="Publish configuration and recalculate results"
                          >
                            <CheckCircle2 size={13} /> Publish
                          </button>
                        )}
                        {isManager && c.status === 'published' && (
                          <button
                            className="sm-btn"
                            onClick={() => handleRecalculateConfig(c.id)}
                            title="Recalculate all results under this configuration"
                          >
                            <RefreshCw size={13} /> Recalculate
                          </button>
                        )}
                        <button
                          className="sm-btn"
                          onClick={() => {
                            setSelectedConfigId(c.id);
                            setTab('engine_marks');
                          }}
                        >
                          Marks Grid <ChevronRight size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. CONFIGURABLE MARKS ENTRY GRID TAB                         */}
      {/* ------------------------------------------------------------- */}
      {tab === 'engine_marks' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Configurable Marks Entry Grid</h3>
              <p>Enter marks across configured terms. Term percentages and contributions are normalized automatically.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="primary-btn"
                onClick={handleSaveEngineMarks}
                disabled={savingEngineMarks}
              >
                {savingEngineMarks ? 'Saving & Recalculating…' : 'Save Marks & Recalculate'}
              </button>
            </div>
          </div>

          {/* Grid Selectors */}
          <div style={{ display: 'flex', gap: 16, padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Class:
              <select
                className="fx-select"
                style={{ marginLeft: 6 }}
                value={gridClassId || ''}
                onChange={e => setGridClassId(Number(e.target.value))}
              >
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Subject:
              <select
                className="fx-select"
                style={{ marginLeft: 6 }}
                value={gridSubjectId || ''}
                onChange={e => setGridSubjectId(Number(e.target.value))}
              >
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </label>
          </div>

          {engineMarksData && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    <th>ROLL #</th>
                    {engineMarksData.columns.map((col: R) => (
                      <th key={col.id} style={{ minWidth: 140 }}>
                        <div>{col.name}</div>
                        <div style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>
                          Max: {col.max_marks} | Weight: {col.weight_percentage}%
                        </div>
                      </th>
                    ))}
                    <th>NORMALIZED %</th>
                    <th>SCALED MARKS</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {engineMarksData.students.map((st: R, sIdx: number) => (
                    <tr key={st.student_id}>
                      <td>
                        <strong>{st.name}</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{st.admission_number} ({st.gender})</div>
                      </td>
                      <td>{st.roll_number}</td>
                      {engineMarksData.columns.map((col: R) => {
                        const termEntry = st.terms[col.id] || { marks_obtained: '', result_status: 'recorded' };
                        return (
                          <td key={col.id}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max={col.max_marks}
                                placeholder="Marks"
                                style={{ width: 85, padding: '4px 6px', fontSize: 13 }}
                                value={termEntry.marks_obtained}
                                onChange={e => {
                                  const val = e.target.value;
                                  const updatedStudents = [...engineMarksData.students];
                                  updatedStudents[sIdx].terms[col.id] = {
                                    ...termEntry,
                                    marks_obtained: val
                                  };
                                  setEngineMarksData({ ...engineMarksData, students: updatedStudents });
                                }}
                              />
                              <select
                                style={{ fontSize: 10, padding: 2 }}
                                value={termEntry.result_status}
                                onChange={e => {
                                  const stVal = e.target.value;
                                  const updatedStudents = [...engineMarksData.students];
                                  updatedStudents[sIdx].terms[col.id] = {
                                    ...termEntry,
                                    result_status: stVal
                                  };
                                  setEngineMarksData({ ...engineMarksData, students: updatedStudents });
                                }}
                              >
                                <option value="recorded">Recorded</option>
                                <option value="absent">Absent</option>
                                <option value="exempt">Exempt</option>
                                <option value="incomplete">Incomplete</option>
                              </select>
                            </div>
                          </td>
                        );
                      })}
                      <td>
                        {st.final_percentage !== null ? (
                          <strong style={{ color: OVERALL_COLOR, fontSize: 14 }}>{st.final_percentage}%</strong>
                        ) : st.current_percentage !== null ? (
                          <span style={{ color: '#d97706', fontSize: 13 }} title={`Current progress across ${st.assessed_weight}% weight assessed`}>
                            {st.current_percentage}% <small>(cur)</small>
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>–</span>
                        )}
                      </td>
                      <td>
                        {st.scaled_marks !== null ? (
                          <span>{st.scaled_marks} / {engineMarksData.configuration.reporting_scale}</span>
                        ) : '–'}
                      </td>
                      <td>
                        {st.completed ? (
                          <span className="pill green">Complete</span>
                        ) : (
                          <span className="pill amber" title="Required terms pending">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. STUDENT ACADEMIC TRANSCRIPTS TAB                          */}
      {/* ------------------------------------------------------------- */}
      {tab === 'transcripts' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Student Academic Transcript & Multi-Term Matrix</h3>
              <p>Individual student examination breakdown showing term normalized percentages, contributions, and pending progress.</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                className="fx-select"
                value={transcriptStudentId || ''}
                onChange={e => loadTranscript(Number(e.target.value))}
              >
                <option value="">Select student…</option>
                {enrolledStudents.map(st => (
                  <option key={st.id} value={st.id}>{st.first_name} {st.last_name} ({st.admission_number})</option>
                ))}
              </select>
            </div>
          </div>

          {transcriptData && (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Student Header Card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '16px 20px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div>
                  <h2 style={{ fontSize: 20, margin: 0, fontWeight: 700 }}>{transcriptData.student.name}</h2>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                    Admission ID: <strong>{transcriptData.student.admission_number}</strong> | Class: <strong>{transcriptData.student.class_name}</strong> | Gender: <span style={{ textTransform: 'capitalize' }}>{transcriptData.student.gender}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Final Annual Result</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: transcriptData.summary.completed ? OVERALL_COLOR : '#d97706' }}>
                    {transcriptData.summary.final_annual_percentage !== null ? (
                      `${transcriptData.summary.final_annual_percentage}%`
                    ) : (
                      'Pending'
                    )}
                  </div>
                  {transcriptData.summary.current_performance_percentage !== null && !transcriptData.summary.completed && (
                    <div style={{ fontSize: 12, color: '#d97706' }}>
                      Current Progress: <strong>{transcriptData.summary.current_performance_percentage}%</strong>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Method: {transcriptData.summary.weighting_method_used}
                  </div>
                </div>
              </div>

              {/* Subject Breakdown Matrix */}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SUBJECT</th>
                      <th>TERM-BY-TERM NORMALIZED CONTRIBUTION</th>
                      <th>WEIGHT ASSESSED</th>
                      <th>CURRENT %</th>
                      <th>FINAL ANNUAL %</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transcriptData.subjects.map((sub: R) => (
                      <tr key={sub.subject_id}>
                        <td>
                          <strong>{sub.subject_name}</strong>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{sub.subject_code}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {sub.term_results.map((tr: R, idx: number) => (
                              <div key={idx} style={{ padding: '4px 8px', background: tr.completed ? '#f0fdf4' : '#fffbeb', border: `1px solid ${tr.completed ? '#bbf7d0' : '#fde68a'}`, borderRadius: 6, fontSize: 12 }}>
                                <div style={{ fontWeight: 600, color: '#334155' }}>{tr.component_name}</div>
                                {tr.completed ? (
                                  <div>
                                    <span>{tr.marks_obtained} / {tr.maximum_marks}</span>
                                    <span style={{ color: '#16a34a', marginLeft: 4 }}>({parseFloat(tr.term_percentage).toFixed(1)}%)</span>
                                    <div style={{ fontSize: 10, color: '#64748b' }}>Contr: {parseFloat(tr.contribution).toFixed(1)} pp</div>
                                  </div>
                                ) : (
                                  <span style={{ color: '#d97706', fontSize: 11 }}>Pending</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>{sub.assessed_weight}%</td>
                        <td>{sub.current_percentage !== null ? `${sub.current_percentage}%` : '–'}</td>
                        <td>
                          {sub.final_percentage !== null ? (
                            <strong style={{ color: OVERALL_COLOR, fontSize: 15 }}>{sub.final_percentage}%</strong>
                          ) : (
                            <span style={{ color: '#d97706' }}>Pending</span>
                          )}
                        </td>
                        <td>
                          {sub.completed ? (
                            <span className="pill green">Complete</span>
                          ) : (
                            <span className="pill amber">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. LEGACY DATE SHEETS & CLASH DETECTION TAB                  */}
      {/* ------------------------------------------------------------- */}
      {tab === 'datesheet' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Exam Date Sheet & Papers</h3>
              <p>Clash detection for rooms, classes, and invigilators during examination sessions</p>
            </div>
            {isManager && (
              <button className="primary-btn" onClick={() => setPaperModal(true)}>
                <Plus size={15} /> Schedule Paper
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>TIME</th>
                  <th>CLASS</th>
                  <th>SUBJECT</th>
                  <th>DURATION</th>
                  <th>MAX MARKS</th>
                  <th>ROOM</th>
                  <th>INVIGILATOR</th>
                </tr>
              </thead>
              <tbody>
                {papers.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.date}</strong></td>
                    <td>{p.start_time}</td>
                    <td>{p.class_name}</td>
                    <td>{p.subject_name}</td>
                    <td>{p.duration_min} min</td>
                    <td>{p.max_marks}</td>
                    <td>{p.room || '–'}</td>
                    <td>{p.invigilator_name || 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 6. LEGACY EXAM SESSIONS TAB                                  */}
      {/* ------------------------------------------------------------- */}
      {tab === 'sessions' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>Assessment Terms & Sessions</h3><p>Manage formal mid-terms, finals, and moderation status</p></div>
            {isManager && (
              <button className="primary-btn" onClick={() => setSessionModal(true)}><Plus size={15} /> New Exam Session</button>
            )}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SESSION NAME</th>
                  <th>ACADEMIC YEAR</th>
                  <th>DATES</th>
                  <th>PAPERS</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.academic_year_name}</td>
                    <td>{s.start_date} to {s.end_date}</td>
                    <td>{s.papers_count} papers</td>
                    <td>
                      <span className={`pill ${s.status === 'published' ? 'green' : s.status === 'marking' ? 'amber' : 'purple'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {isManager && s.status !== 'published' && (
                          <button className="sm-btn" onClick={() => handlePublishSession(s.id)} style={{ color: '#16a34a' }}>
                            <CheckCircle2 size={13} /> Publish
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 7. GRADING SCALES TAB                                        */}
      {/* ------------------------------------------------------------- */}
      {tab === 'scales' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>Institutional Grading Scales</h3><p>Configure percentage to letter and GPA band mapping</p></div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SCALE NAME</th>
                  <th>DEFAULT</th>
                  <th>BANDS</th>
                </tr>
              </thead>
              <tbody>
                {scales.map(sc => (
                  <tr key={sc.id}>
                    <td><strong>{sc.name}</strong></td>
                    <td>{sc.is_default ? <span className="pill green">Default</span> : <span className="pill">Optional</span>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {sc.bands.map((b: R) => (
                          <span key={b.id} className="pill purple" style={{ fontSize: 11 }}>
                            {b.letter} ({b.min_percent}%–{b.max_percent}%) : GPA {b.grade_point}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: Create Configurable Examination Structure             */}
      {/* ------------------------------------------------------------- */}
      {configModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setConfigModal(false); }}>
          <div className="modal-card" style={{ maxWidth: 650 }}>
            <div className="modal-head">
              <h3>Create Configurable Examination Structure</h3>
              <button onClick={() => setConfigModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateConfig}>
              <div className="modal-fields">
                <label>Structure Name *
                  <input
                    type="text"
                    required
                    placeholder="e.g. Class 6 Annual Examination Structure"
                    value={newCfgName}
                    onChange={e => setNewCfgName(e.target.value)}
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label>Academic Year *
                    <select value={newCfgYear} onChange={e => setNewCfgYear(e.target.value)}>
                      {years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                    </select>
                  </label>
                  <label>Class Scope (Optional Override)
                    <select value={newCfgClass} onChange={e => setNewCfgClass(e.target.value)}>
                      <option value="">All Classes (School Default)</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <label>Reporting Scale
                    <input
                      type="number"
                      step="1"
                      value={newCfgScale}
                      onChange={e => setNewCfgScale(e.target.value)}
                    />
                  </label>
                  <label>Passing Threshold (%)
                    <input
                      type="number"
                      step="1"
                      value={newCfgPassThreshold}
                      onChange={e => setNewCfgPassThreshold(e.target.value)}
                    />
                  </label>
                  <label>Subject Weighting
                    <select value={newCfgWeightMode} onChange={e => setNewCfgWeightMode(e.target.value as any)}>
                      <option value="equal">Equal Weighting</option>
                      <option value="custom">Custom Subject Weights</option>
                    </select>
                  </label>
                </div>

                {/* Terms / Examination Components Builder */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Examination Terms & Weightages</span>
                    <span className={`pill ${Math.abs(currentTermWeightsSum - 100) < 0.01 ? 'green' : 'amber'}`}>
                      Total: {currentTermWeightsSum.toFixed(1)}% {Math.abs(currentTermWeightsSum - 100) < 0.01 ? '✓ Valid' : '(Must be 100%)'}
                    </span>
                  </div>

                  {newCfgTerms.map((term, tIdx) => (
                    <div key={tIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <input
                        type="text"
                        required
                        placeholder="Term Name (e.g. First Term)"
                        value={term.name}
                        onChange={e => {
                          const updated = [...newCfgTerms];
                          updated[tIdx].name = e.target.value;
                          setNewCfgTerms(updated);
                        }}
                      />
                      <input
                        type="number"
                        step="0.5"
                        required
                        placeholder="Weight %"
                        value={term.weight}
                        onChange={e => {
                          const updated = [...newCfgTerms];
                          updated[tIdx].weight = e.target.value;
                          setNewCfgTerms(updated);
                        }}
                      />
                      <input
                        type="number"
                        step="1"
                        required
                        placeholder="Default Max Marks"
                        value={term.max_marks}
                        onChange={e => {
                          const updated = [...newCfgTerms];
                          updated[tIdx].max_marks = e.target.value;
                          setNewCfgTerms(updated);
                        }}
                      />
                      {newCfgTerms.length > 1 && (
                        <button
                          type="button"
                          className="hr-mini danger"
                          onClick={() => setNewCfgTerms(newCfgTerms.filter((_, i) => i !== tIdx))}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="outline-btn"
                    style={{ fontSize: 12, padding: '4px 10px', marginTop: 4 }}
                    onClick={() => setNewCfgTerms([...newCfgTerms, { name: `Term ${newCfgTerms.length + 1}`, weight: '0.00', max_marks: '100.00' }])}
                  >
                    <Plus size={13} /> Add Examination Term
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setConfigModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Create Examination Structure</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Legacy Session Modal */}
      {sessionModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSessionModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>Create Exam Session</h3>
              <button onClick={() => setSessionModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateSession}>
              <div className="modal-fields">
                <label>Session Name *
                  <input type="text" placeholder="e.g. Mid-Term Assessment 2026-2027" required value={newSessionName} onChange={e => setNewSessionName(e.target.value)} />
                </label>
                <label>Reporting Period Code
                  <input type="text" placeholder="e.g. Term 1" value={newSessionPeriod} onChange={e => setNewSessionPeriod(e.target.value)} />
                </label>
                <label>Start Date *
                  <input type="date" required value={newSessionStart} onChange={e => setNewSessionStart(e.target.value)} />
                </label>
                <label>End Date *
                  <input type="date" required value={newSessionEnd} onChange={e => setNewSessionEnd(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setSessionModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Create Session</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Legacy Paper Schedule Modal */}
      {paperModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPaperModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>Schedule Exam Paper</h3>
              <button onClick={() => setPaperModal(false)}><X size={18} /></button>
            </div>
            {clashError && (
              <div style={{ margin: '12px 16px 0', padding: 12, background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626', borderRadius: 6, fontSize: 13, display: 'flex', gap: 8 }}>
                <ShieldAlert size={18} /> <span>{clashError}</span>
              </div>
            )}
            <form onSubmit={handleCreatePaper}>
              <div className="modal-fields">
                <label>Class *
                  <select required value={paperClass} onChange={e => setPaperClass(e.target.value)}>
                    <option value="">Select class…</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>Subject *
                  <select required value={paperSubject} onChange={e => setPaperSubject(e.target.value)}>
                    <option value="">Select subject…</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </label>
                <label>Date *
                  <input type="date" required value={paperDate} onChange={e => setPaperDate(e.target.value)} />
                </label>
                <label>Start Time (HH:MM) *
                  <input type="time" required value={paperTime} onChange={e => setPaperTime(e.target.value)} />
                </label>
                <label>Duration (Minutes) *
                  <input type="number" min="15" max="480" required value={paperDuration} onChange={e => setPaperDuration(e.target.value)} />
                </label>
                <label>Maximum Marks *
                  <input type="number" step="0.5" min="1" required value={paperMaxMarks} onChange={e => setPaperMaxMarks(e.target.value)} />
                </label>
                <label>Room / Hall (optional)
                  <input type="text" placeholder="e.g. Main Hall" value={paperRoom} onChange={e => setPaperRoom(e.target.value)} />
                </label>
                <label>Invigilator (optional)
                  <select value={paperInvigilator} onChange={e => setPaperInvigilator(e.target.value)}>
                    <option value="">Unassigned</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setPaperModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Schedule Paper</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
