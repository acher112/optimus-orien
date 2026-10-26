import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Award, Calendar, Check, CheckCircle2, ChevronRight,
  Download, FileSpreadsheet, FileText, Filter, Plus, Printer, RefreshCw,
  Search, ShieldAlert, ShieldCheck, Sparkles, Trash2, User, Users, X
} from 'lucide-react';
import { list, request, type User as ApiUser } from './api';
import './hr.css';

type R = Record<string, any>;
type Tab = 'sessions' | 'datesheet' | 'marks' | 'results' | 'report_card' | 'scales';

export default function Examinations({ user, notify }: { user: ApiUser; notify: (m: string) => void }) {
  const isTeacher = user.role === 'teacher';
  const isManager = ['organisation_admin', 'school_admin', 'principal'].includes(user.role) || user.is_superuser;

  const [tab, setTab] = useState<Tab>('sessions');
  const [sessions, setSessions] = useState<R[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [classes, setClasses] = useState<R[]>([]);
  const [activeClassId, setActiveClassId] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<R[]>([]);
  const [staffList, setStaffList] = useState<R[]>([]);
  const [papers, setPapers] = useState<R[]>([]);
  const [scales, setScales] = useState<R[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bump, setBump] = useState(0);

  // Mark entry grid state
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [marksGridData, setMarksGridData] = useState<{ paper: R; students: R[] } | null>(null);
  const [savingMarks, setSavingMarks] = useState(false);

  // Results sheet state
  const [resultsSheet, setResultsSheet] = useState<R | null>(null);

  // Report card state
  const [reportCardData, setReportCardData] = useState<R | null>(null);
  const [targetStudentId, setTargetStudentId] = useState<number | null>(null);

  // Modals
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

  const [correctionModal, setCorrectionModal] = useState(false);
  const [corrGradeId, setCorrGradeId] = useState<number | null>(null);
  const [corrMarks, setCorrMarks] = useState('');
  const [corrStatus, setCorrStatus] = useState('recorded');
  const [corrReason, setCorrReason] = useState('');

  // Initial load
  useEffect(() => {
    list<R>('classes').then(setClasses).catch(() => {});
    list<R>('subjects').then(setSubjects).catch(() => {});
    request<R>('staff/').then(r => setStaffList(r.results || [])).catch(() => {});
  }, []);

  const loadSessionsAndPapers = useCallback(async () => {
    setLoading(true);
    setError('');
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
      setError(err instanceof Error ? err.message : 'Could not load exams');
    } finally {
      setLoading(false);
    }
  }, [activeSessionId]);

  useEffect(() => { loadSessionsAndPapers(); }, [loadSessionsAndPapers, bump]);

  // Load marks grid when paper selected
  const loadMarksGrid = async (paperId: number) => {
    setSelectedPaperId(paperId);
    setLoading(true);
    try {
      const data = await request<R>(`exams/papers/${paperId}/marks/`);
      setMarksGridData(data as any);
      setTab('marks');
    } catch (err) {
      notify('Failed to load mark entry grid');
    } finally {
      setLoading(false);
    }
  };

  // Load results sheet
  const loadResultsSheet = async () => {
    if (!activeSessionId || !activeClassId) return;
    setLoading(true);
    try {
      const data = await request<R>(`exams/results-sheet/?session=${activeSessionId}&class=${activeClassId}`);
      setResultsSheet(data);
    } catch (err) {
      notify('Failed to load results matrix');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'results' && activeSessionId && activeClassId) {
      loadResultsSheet();
    }
  }, [tab, activeSessionId, activeClassId]);

  // Load single student report card
  const loadReportCard = async (studentId: number) => {
    if (!activeSessionId) return;
    setTargetStudentId(studentId);
    setLoading(true);
    try {
      const data = await request<R>(`exams/report-card/?student=${studentId}&session=${activeSessionId}`);
      setReportCardData(data);
      setTab('report_card');
    } catch (err) {
      notify('Failed to load report card');
    } finally {
      setLoading(false);
    }
  };

  // Actions
  const handlePublishSession = async (sessId: number) => {
    if (!confirm('Publishing will snapshot results and make grades visible to students and parents. Proceed?')) return;
    try {
      await request<R>(`exams/sessions/${sessId}/publish/`, { method: 'POST' });
      notify('Exam session published! Grades are now live for learners.');
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

  const handleSaveMarksGrid = async () => {
    if (!selectedPaperId || !marksGridData) return;
    setSavingMarks(true);
    try {
      const payload = marksGridData.students.map(s => ({
        student_id: s.student_id,
        marks: s.marks,
        result_status: s.result_status,
        feedback: s.feedback
      }));
      const res = await request<R>(`exams/papers/${selectedPaperId}/marks/`, {
        method: 'PUT',
        body: JSON.stringify({ marks: payload })
      });
      notify(`Saved marks for ${res.updated} students.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save marks');
    } finally {
      setSavingMarks(false);
    }
  };

  const handleDeleteSession = async (sid: number, sname: string) => {
    if (!window.confirm(`Delete exam session "${sname}" and all scheduled papers?`)) return;
    try {
      await request(`exams/sessions/${sid}/`, { method: 'DELETE' });
      notify('Exam session deleted');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete exam session');
    }
  };

  const handleDeletePaper = async (pid: number, pname: string) => {
    if (!window.confirm(`Delete paper "${pname}" from date sheet?`)) return;
    try {
      await request(`exams/papers/${pid}/`, { method: 'DELETE' });
      notify('Paper deleted from date sheet');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete paper');
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">ACADEMICS / EXAMINATIONS & ASSESSMENTS</div>
          <h1>Examinations</h1>
          <p>Exam sessions, clash-checked date sheets, bulk mark entry grid, and transcripts.</p>
        </div>
        <div className="fx-filters">
          <label>Session
            <select
              className="fx-select"
              value={activeSessionId || ''}
              onChange={e => {
                const id = Number(e.target.value);
                setActiveSessionId(id);
                setBump(b => b + 1);
              }}
            >
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
            </select>
          </label>
          <button className="outline-btn" onClick={() => setBump(b => b + 1)}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      <nav className="fx-tabs" aria-label="Exam sections" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 6 }}>
        <button className={tab === 'sessions' ? 'on' : ''} onClick={() => setTab('sessions')}><Award size={15} /> Exam Sessions</button>
        <button className={tab === 'datesheet' ? 'on' : ''} onClick={() => setTab('datesheet')}><Calendar size={15} /> Date Sheet</button>
        <button className={tab === 'marks' ? 'on' : ''} onClick={() => setTab('marks')}><FileSpreadsheet size={15} /> Enter Marks Grid</button>
        <button className={tab === 'results' ? 'on' : ''} onClick={() => setTab('results')}><Users size={15} /> Results Matrix</button>
        {reportCardData && (
          <button className={tab === 'report_card' ? 'on' : ''} onClick={() => setTab('report_card')}><Printer size={15} /> Report Card</button>
        )}
        <button className={tab === 'scales' ? 'on' : ''} onClick={() => setTab('scales')}><ShieldCheck size={15} /> Grading Scales</button>
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {/* SESSIONS TAB */}
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
                  <th>RANKING</th>
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
                    <td>{s.ranking_enabled ? <span className="pill green">Ranked</span> : <span className="pill amber">No ranks</span>}</td>
                    <td>
                      <span className={`pill ${s.status === 'published' ? 'green' : s.status === 'marking' ? 'amber' : 'purple'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="sm-btn" onClick={() => { setActiveSessionId(s.id); setTab('datesheet'); }}>
                          Date Sheet <ChevronRight size={13} />
                        </button>
                        {isManager && s.status !== 'published' && (
                          <button className="sm-btn" onClick={() => handlePublishSession(s.id)} style={{ color: '#16a34a' }}>
                            <CheckCircle2 size={13} /> Publish
                          </button>
                        )}
                        {isManager && (
                          <button className="hr-mini danger" title="Delete exam session" onClick={() => handleDeleteSession(s.id, s.name)}>
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!sessions.length && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>No exam sessions created yet. Click 'New Exam Session'.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* DATE SHEET TAB */}
      {tab === 'datesheet' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Exam Date Sheet & Schedule</h3>
              <p>Clash-checked schedule of papers per class and room</p>
            </div>
            {isManager && (
              <button className="primary-btn" onClick={() => { setClashError(''); setPaperModal(true); }}>
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
                  <th>MAX MARKS</th>
                  <th>ROOM</th>
                  <th>INVIGILATOR</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {papers.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.date}</strong></td>
                    <td>{p.start_time} ({p.duration_min} min)</td>
                    <td>{p.class_name}</td>
                    <td><strong>{p.subject_name}</strong></td>
                    <td>{p.max_marks}</td>
                    <td>{p.room || '—'}</td>
                    <td>{p.invigilator_name || 'Unassigned'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="sm-btn" onClick={() => loadMarksGrid(p.id)}>
                          <FileSpreadsheet size={13} /> Enter Marks
                        </button>
                        {isManager && (
                          <button className="hr-mini danger" title="Delete paper" onClick={() => handleDeletePaper(p.id, p.subject_name)}>
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!papers.length && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No papers scheduled in this session yet. Click 'Schedule Paper' to add papers.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ENTER MARKS GRID TAB */}
      {tab === 'marks' && marksGridData && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Mark Entry Grid: {marksGridData.paper.class_name} — {marksGridData.paper.subject_name}</h3>
              <p>Max Marks: <b>{marksGridData.paper.max_marks}</b> · Session: <b>{marksGridData.paper.session_name}</b></p>
            </div>
            <button className="primary-btn" onClick={handleSaveMarksGrid} disabled={savingMarks}>
              <Check size={15} /> {savingMarks ? 'Saving…' : 'Save Marks Grid'}
            </button>
          </div>
          <div className="table-scroll" style={{ maxHeight: 500 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ROLL #</th>
                  <th>STUDENT NAME</th>
                  <th>ADMISSION #</th>
                  <th style={{ width: 120 }}>MARKS (/{marksGridData.paper.max_marks})</th>
                  <th style={{ width: 90 }}>%</th>
                  <th style={{ width: 140 }}>STATUS</th>
                  <th>FEEDBACK / NOTES</th>
                </tr>
              </thead>
              <tbody>
                {marksGridData.students.map((st, idx) => {
                  const maxM = Number(marksGridData.paper.max_marks);
                  const currM = Number(st.marks);
                  const pct = !isNaN(currM) && maxM > 0 ? Math.round((currM / maxM) * 100) : null;
                  return (
                    <tr key={st.student_id}>
                      <td><strong>{st.roll_number || idx + 1}</strong></td>
                      <td><strong>{st.name}</strong></td>
                      <td>{st.admission_number}</td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={marksGridData.paper.max_marks}
                          value={st.marks}
                          disabled={st.result_status !== 'recorded'}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                          onChange={e => {
                            const val = e.target.value;
                            setMarksGridData(prev => {
                              if (!prev) return null;
                              const updated = [...prev.students];
                              updated[idx] = { ...updated[idx], marks: val };
                              return { ...prev, students: updated };
                            });
                          }}
                        />
                      </td>
                      <td>{pct !== null ? <strong style={{ color: pct >= 50 ? '#16a34a' : '#dc2626' }}>{pct}%</strong> : '—'}</td>
                      <td>
                        <select
                          value={st.result_status}
                          style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                          onChange={e => {
                            const val = e.target.value;
                            setMarksGridData(prev => {
                              if (!prev) return null;
                              const updated = [...prev.students];
                              updated[idx] = {
                                ...updated[idx],
                                result_status: val,
                                marks: val !== 'recorded' ? '0.00' : updated[idx].marks
                              };
                              return { ...prev, students: updated };
                            });
                          }}
                        >
                          <option value="recorded">Present</option>
                          <option value="absent">Absent</option>
                          <option value="exempt">Exempt</option>
                          <option value="incomplete">Incomplete</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="Teacher feedback…"
                          value={st.feedback || ''}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                          onChange={e => {
                            const val = e.target.value;
                            setMarksGridData(prev => {
                              if (!prev) return null;
                              const updated = [...prev.students];
                              updated[idx] = { ...updated[idx], feedback: val };
                              return { ...prev, students: updated };
                            });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* RESULTS MATRIX TAB */}
      {tab === 'results' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Class Results Matrix</h3>
              <p>Student × Subject results sheet with total score and grade points</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                className="fx-select"
                value={activeClassId || ''}
                onChange={e => setActiveClassId(Number(e.target.value))}
              >
                <option value="">Select a class…</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {resultsSheet ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ROLL</th>
                    <th>STUDENT</th>
                    {resultsSheet.subjects.map((sub: R) => (
                      <th key={sub.id} style={{ textAlign: 'center' }}>
                        {sub.name}<br /><small style={{ color: '#64748b' }}>({sub.max_marks}m)</small>
                      </th>
                    ))}
                    <th>TOTAL</th>
                    <th>%</th>
                    <th>GRADE</th>
                    {resultsSheet.session.ranking_enabled && <th>RANK</th>}
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {resultsSheet.students.map((st: R) => (
                    <tr key={st.student_id}>
                      <td><strong>{st.roll_number || '—'}</strong></td>
                      <td><strong>{st.name}</strong></td>
                      {resultsSheet.subjects.map((sub: R) => {
                        const score = st.subject_scores[sub.id];
                        return (
                          <td key={sub.id} style={{ textAlign: 'center' }}>
                            {score ? (score.status === 'recorded' ? score.marks : <span className="pill amber">{score.status}</span>) : '—'}
                          </td>
                        );
                      })}
                      <td><strong>{st.total_obtained} / {st.total_max}</strong></td>
                      <td><strong style={{ color: st.percentage >= 50 ? '#16a34a' : '#dc2626' }}>{st.percentage}%</strong></td>
                      <td><span className="pill purple">{st.grade_letter} ({st.grade_point})</span></td>
                      {resultsSheet.session.ranking_enabled && <td><strong>#{st.rank || '—'}</strong></td>}
                      <td>
                        <button className="sm-btn" onClick={() => loadReportCard(st.student_id)}>
                          <FileText size={13} /> Transcript
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rp-empty">Select a class from the dropdown above to view the results sheet.</div>
          )}
        </section>
      )}

      {/* REPORT CARD TAB */}
      {tab === 'report_card' && reportCardData && (
        <section className="panel hr-panel" style={{ maxWidth: 760, margin: '0 auto' }}>
          <div className="panel-head">
            <div><h3>Student Academic Transcript</h3><p>Official report card print format</p></div>
            <button className="primary-btn" onClick={() => window.print()}><Printer size={15} /> Print Report Card</button>
          </div>
          <div style={{ padding: '24px 28px', border: '1px solid var(--border-color, #e2e8f0)', margin: '16px 20px', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #3b82f6', paddingBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>{reportCardData.session.school_name}</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b' }}>Academic Progress Report · {reportCardData.session.academic_year}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="pill green" style={{ fontSize: 13 }}>{reportCardData.session.name}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '20px 0', fontSize: 14 }}>
              <div><strong>Student Name:</strong> {reportCardData.student.name}</div>
              <div><strong>Class:</strong> {reportCardData.student.class_name}</div>
              <div><strong>Admission #:</strong> {reportCardData.student.admission_number}</div>
              <div><strong>Roll Number:</strong> {reportCardData.student.roll_number || '—'}</div>
            </div>

            <table className="data-table" style={{ margin: '20px 0' }}>
              <thead>
                <tr>
                  <th>SUBJECT</th>
                  <th>MAX MARKS</th>
                  <th>OBTAINED</th>
                  <th>%</th>
                  <th>GRADE</th>
                  <th>GPA</th>
                  <th>TEACHER REMARKS</th>
                </tr>
              </thead>
              <tbody>
                {reportCardData.results.map((r: R, i: number) => (
                  <tr key={i}>
                    <td><strong>{r.subject}</strong></td>
                    <td>{r.max_marks}</td>
                    <td><strong>{r.obtained_marks}</strong></td>
                    <td>{r.percentage !== null ? `${r.percentage}%` : '—'}</td>
                    <td><span className="pill purple">{r.letter}</span></td>
                    <td>{r.grade_point}</td>
                    <td><small>{r.feedback || '—'}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, borderTop: '2px dashed #cbd5e1', paddingTop: 16 }}>
              <div style={{ padding: 12, background: 'rgba(59, 130, 246, 0.05)', borderRadius: 6 }}>
                <h4 style={{ margin: '0 0 6px' }}>Academic Summary</h4>
                <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total Marks:</span><strong>{reportCardData.summary.total_obtained} / {reportCardData.summary.total_max}</strong>
                </div>
                <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Overall Percentage:</span><strong>{reportCardData.summary.overall_percentage}%</strong>
                </div>
                <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Final Grade / GPA:</span><strong style={{ color: '#16a34a' }}>{reportCardData.summary.overall_letter} ({reportCardData.summary.overall_gpa})</strong>
                </div>
              </div>

              <div style={{ padding: 12, background: 'rgba(16, 185, 129, 0.05)', borderRadius: 6 }}>
                <h4 style={{ margin: '0 0 6px' }}>Attendance Record</h4>
                <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total School Days:</span><strong>{reportCardData.summary.total_school_days}</strong>
                </div>
                <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Days Present:</span><strong>{reportCardData.summary.days_present}</strong>
                </div>
                <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Attendance Rate:</span><strong style={{ color: '#2563eb' }}>{reportCardData.summary.attendance_rate}%</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 50, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <div style={{ textAlign: 'center', width: 160 }}>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 4, fontSize: 12 }}>Class Teacher</div>
              </div>
              <div style={{ textAlign: 'center', width: 160 }}>
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 4, fontSize: 12 }}>Principal / Head of School</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* GRADING SCALES TAB */}
      {tab === 'scales' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>Institutional Grading Scales</h3><p>Percentage bands, letter grades, and GPA conversions</p></div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SCALE NAME</th>
                  <th>CAMPUS</th>
                  <th>DEFAULT</th>
                  <th>GRADE BANDS</th>
                </tr>
              </thead>
              <tbody>
                {scales.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.school_name}</td>
                    <td>{s.is_default ? <span className="pill green">Default</span> : 'No'}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {s.bands.map((b: R) => (
                          <span key={b.id} className="pill purple" style={{ fontSize: 12 }}>
                            <b>{b.letter}</b>: {b.min_percent}%-{b.max_percent}% ({b.grade_point} pts)
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!scales.length && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 30 }}>
                      Using default system scale: A+ (90-100%), A (80-89%), B (70-79%), C (60-69%), D (50-59%), F (&lt;50%).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL: New Session */}
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
                  <input type="text" placeholder="e.g. Term 1 or Mid-term" value={newSessionPeriod} onChange={e => setNewSessionPeriod(e.target.value)} />
                </label>
                <label>Start Date *
                  <input type="date" required value={newSessionStart} onChange={e => setNewSessionStart(e.target.value)} />
                </label>
                <label>End Date *
                  <input type="date" required value={newSessionEnd} onChange={e => setNewSessionEnd(e.target.value)} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <input type="checkbox" checked={newSessionRanking} onChange={e => setNewSessionRanking(e.target.checked)} />
                  <span>Enable Class Ranking (1st, 2nd, 3rd) on Results Sheet</span>
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

      {/* MODAL: Schedule Paper */}
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
                  <input type="text" placeholder="e.g. Main Hall or Room 102" value={paperRoom} onChange={e => setPaperRoom(e.target.value)} />
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
