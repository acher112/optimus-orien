import React, { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ChevronRight, Info, RefreshCw, ShieldCheck } from 'lucide-react';
import { request, type User } from './api';
import './reports.css';

type R = Record<string, any>;
type View =
  | { level: 'org' }
  | { level: 'campus'; id: number; name: string }
  | { level: 'class'; id: number; name: string; campusId: number; campusName: string }
  | { level: 'subject'; campusId: number; campusName: string; code: string; name: string; classId?: number; className?: string };

const COLOR = ['#715ee8', '#23b7a0', '#f29d50', '#6c9eff', '#e477a1', '#b4a0e9'];
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(n));

function Kpi({ label, value, foot }: { label: string; value: string; foot: string }) {
  return (
    <div className="rp-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{foot}</small>
    </div>
  );
}

function Dist({ bands }: { bands: { band: string; count: number }[] }) {
  const max = Math.max(1, ...bands.map(b => b.count));
  return (
    <div className="rp-dist" role="img" aria-label={bands.map(b => `${b.band}: ${b.count}`).join(', ')}>
      {bands.map(b => (
        <i key={b.band} title={`${b.band}: ${b.count} student(s)`} style={{ height: `${Math.max(b.count ? 12 : 3, (b.count / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function AvgChart({ rows, label, field = 'average' }: { rows: R[]; label: string; field?: string }) {
  const data = rows.map(r => ({ name: r.name as string, average: r[field] as number | null })).filter(r => r.average !== null);
  if (!data.length) return <div className="rp-empty">No published results to chart for this selection.</div>;
  return (
    <div className="rp-chart" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 24, bottom: 3, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8c96a7' }} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8c96a7' }} />
          <Tooltip formatter={v => `${v}%`} />
          <Bar dataKey="average" radius={[9, 9, 0, 0]} maxBarSize={54}>
            {data.map((_, i) => <Cell key={i} fill={COLOR[i % COLOR.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Link({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="rp-link" onClick={onClick}>{children}<ChevronRight size={14} /></button>;
}

export default function Reports({ user }: { user: User }) {
  const [view, setView] = useState<View>({ level: 'org' });
  const [period, setPeriod] = useState('');
  const [data, setData] = useState<R | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [singleCampus, setSingleCampus] = useState(false);

  const path = useCallback((v: View) => {
    const q = period ? `period=${encodeURIComponent(period)}` : '';
    if (v.level === 'org') return `reports/overview/?${q}`;
    if (v.level === 'campus') return `reports/campus/${v.id}/?${q}`;
    if (v.level === 'class') return `reports/class/${v.id}/?${q}`;
    const cls = v.classId ? `&class=${v.classId}` : '';
    return `reports/campus/${v.campusId}/subject/${encodeURIComponent(v.code)}/?${q}${cls}`;
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const body = await request<R>(path(view));
      setData(body);
      // A principal / school admin only has one campus: start at that campus instead of a one-row list.
      if (view.level === 'org' && body.campuses?.length === 1 && user.role !== 'organisation_admin') {
        setSingleCampus(true);
        setView({ level: 'campus', id: body.campuses[0].id, name: body.campuses[0].name });
      }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Could not load report');
    } finally {
      setLoading(false);
    }
  }, [view, path, user.role]);

  useEffect(() => { load(); }, [load]);

  const goOrg = () => { setSingleCampus(false); setView({ level: 'org' }); };
  const crumbs: { label: string; go?: () => void }[] = [];
  if (!singleCampus) crumbs.push({ label: 'All campuses', go: view.level === 'org' ? undefined : goOrg });
  if (view.level !== 'org') {
    const cid = view.level === 'campus' ? view.id : view.campusId;
    const cname = view.level === 'campus' ? view.name : view.campusName;
    crumbs.push({ label: cname, go: view.level === 'campus' ? undefined : () => setView({ level: 'campus', id: cid, name: cname }) });
  }
  if (view.level === 'class') crumbs.push({ label: view.name });
  if (view.level === 'subject') {
    if (view.classId) {
      crumbs.push({ label: view.className || 'Class', go: () => setView({ level: 'class', id: view.classId!, name: view.className || 'Class', campusId: view.campusId, campusName: view.campusName }) });
    }
    crumbs.push({ label: view.name });
  }

  const overall: R = data?.overall || {};
  const att = overall.attendance ?? { rate: overall.attendance_rate, recorded: undefined };
  const toCampus = (c: R) => setView({ level: 'campus', id: c.id, name: c.name });
  const toClass = (id: number, name: string, campusId: number, campusName: string) => setView({ level: 'class', id, name, campusId, campusName });

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">INSIGHTS / ANALYTICS</div>
          <h1>Reports &amp; analytics</h1>
          <p>Drill down from campuses to classes and subjects. The reporting period and calculation method stay the same at every level.</p>
        </div>
        <div className="rp-controls">
          <label className="rp-period">
            <span>Reporting period</span>
            <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Reporting period">
              <option value="">Whole academic record</option>
              {(data?.period?.options || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <button className="outline-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      <nav className="rp-crumbs" aria-label="Report level">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={14} />}
            {c.go ? <button onClick={c.go}>{c.label}</button> : <strong>{c.label}</strong>}
          </React.Fragment>
        ))}
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}
      {loading && !data && <div className="rp-empty">Loading report…</div>}

      {data && (
        <div className={loading ? 'rp-body rp-loading' : 'rp-body'}>
          {data.period?.unavailable_campuses?.length > 0 && (
            <div className="rp-warn"><Info size={17} /><span>Period “{data.period.name}” is not configured for: {data.period.unavailable_campuses.join(', ')}. Those campuses are excluded from these numbers rather than shown with different dates.</span></div>
          )}

          <div className="rp-kpis">
            <Kpi label="Academic average" value={pct(overall.academic_average)} foot={`Students with results: ${num(overall.students_with_results)}`} />
            <Kpi label="Attendance" value={pct(att.rate)} foot={att.recorded !== undefined ? `${att.recorded} recorded sessions` : 'Recorded sessions only'} />
            <Kpi label="Valid results" value={num(overall.valid_results)} foot="Included in calculation" />
            <Kpi label="Missing results" value={num(overall.missing_results)} foot={`Completeness ${pct(overall.completeness)} · never counted as zero`} />
          </div>

          {data.level === 'organisation' && (
            <>
              <section className="panel rp-panel">
                <div className="panel-head"><div><h3>Campus comparison</h3><p>{data.period.label} · select a campus to see its classes</p></div><span className="head-chip">{data.campuses.length} campus(es)</span></div>
                <AvgChart rows={data.campuses} field="academic_average" label="Academic average by campus" />
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>CAMPUS</th><th>STUDENTS</th><th>CLASSES</th><th>ACADEMIC AVG</th><th>ATTENDANCE</th><th>VALID</th><th>MISSING</th><th>COMPLETENESS</th></tr></thead>
                  <tbody>{data.campuses.map((c: R) => (
                    <tr key={c.id}><td><Link onClick={() => toCampus(c)}>{c.name}</Link>{c.city && <small className="rp-sub"> {c.city}</small>}</td><td>{c.students}</td><td>{c.classes}</td><td>{pct(c.academic_average)}</td><td>{pct(c.attendance_rate)}</td><td>{c.valid_results}</td><td>{c.missing_results}</td><td>{c.period_available ? pct(c.completeness) : 'Period not configured'}</td></tr>
                  ))}</tbody>
                </table></div>
                <div className="report-note"><ShieldCheck size={19} /><span>{data.comparability_note}</span></div>
              </section>
              <section className="panel rp-panel">
                <div className="panel-head"><div><h3>Subjects across campuses</h3><p>Grouped by subject code. Matching codes do not guarantee identical curriculum or assessment difficulty.</p></div></div>
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>SUBJECT</th><th>AVERAGE</th><th>STUDENTS</th><th>MISSING</th><th>BY CAMPUS</th></tr></thead>
                  <tbody>{data.subjects.map((s: R) => (
                    <tr key={s.code}><td>{s.name} <small className="rp-sub">({s.code})</small></td><td>{pct(s.average)}</td><td>{s.valid_students}</td><td>{s.missing_results}</td>
                      <td>{s.by_campus.map((b: R) => <button key={b.school_id} className="rp-chip" onClick={() => setView({ level: 'subject', campusId: b.school_id, campusName: b.school_name, code: s.code, name: s.name })}>{b.school_name}: {pct(b.average)}</button>)}</td></tr>
                  ))}</tbody>
                </table></div>
                {!data.subjects.length && <div className="rp-empty">No published assessment results in scope yet.</div>}
              </section>
            </>
          )}

          {data.level === 'campus' && (
            <>
              <section className="panel rp-panel">
                <div className="panel-head"><div><h3>Classes in {data.campus.name}</h3><p>{data.period.label} · overall = mean of each student’s subject results</p></div><span className="head-chip">{data.classes.length} class(es)</span></div>
                <AvgChart rows={data.classes} field="academic_average" label="Academic average by class" />
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>CLASS</th><th>TEACHER</th><th>STUDENTS</th><th>ACADEMIC AVG</th><th>ATTENDANCE</th><th>VALID</th><th>MISSING</th><th>COMPLETENESS</th></tr></thead>
                  <tbody>{data.classes.map((c: R) => (
                    <tr key={c.id}><td><Link onClick={() => toClass(c.id, c.name, data.campus.id, data.campus.name)}>{c.name}</Link></td><td>{c.teacher}</td><td>{c.students}</td><td>{pct(c.academic_average)}</td><td>{pct(c.attendance_rate)}</td><td>{c.valid_results}</td><td>{c.missing_results}</td><td>{pct(c.completeness)}</td></tr>
                  ))}</tbody>
                </table></div>
              </section>
              <section className="panel rp-panel">
                <div className="panel-head"><div><h3>Subjects across all classes</h3><p>Select a subject for assessment-level detail</p></div></div>
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>SUBJECT</th><th>AVERAGE</th><th>STUDENTS</th><th>MISSING</th><th>BY CLASS</th></tr></thead>
                  <tbody>{data.subjects.map((s: R) => (
                    <tr key={s.code}>
                      <td><Link onClick={() => setView({ level: 'subject', campusId: data.campus.id, campusName: data.campus.name, code: s.code, name: s.name })}>{s.name}</Link> <small className="rp-sub">({s.code})</small>
                        {!s.comparable && <div className="rp-flag" title={s.comparability_note}>Not directly comparable</div>}</td>
                      <td>{pct(s.average)}</td><td>{s.valid_students}</td><td>{s.missing_results}</td>
                      <td>{s.classes.map((c: R) => <button key={c.class_id} className="rp-chip" onClick={() => setView({ level: 'subject', campusId: data.campus.id, campusName: data.campus.name, code: s.code, name: s.name, classId: c.class_id, className: c.class_name })}>{c.class_name}: {pct(c.average)}</button>)}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
                {data.subjects.some((s: R) => !s.comparable) && <div className="rp-warn"><Info size={17} /><span>Some subjects use different assessment structures (number, weights or maximum marks) in different classes. Their averages are shown but are not directly equivalent.</span></div>}
                {!data.subjects.length && <div className="rp-empty">No published assessment results in scope yet.</div>}
              </section>
            </>
          )}

          {data.level === 'class' && (
            <>
              <section className="panel rp-panel">
                <div className="panel-head"><div><h3>{data.klass.name} · all subjects</h3><p>{data.klass.teacher} · {data.period.label}{data.klass.grade_level ? ` · Grade ${data.klass.grade_level}` : ''}</p></div><span className="head-chip">{overall.students} student(s)</span></div>
                <AvgChart rows={data.subjects} label="Average by subject" />
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>SUBJECT</th><th>AVERAGE</th><th>MIN–MAX</th><th>VALID / ELIGIBLE</th><th>MISSING</th><th>ASSESSMENTS</th><th>DISTRIBUTION</th></tr></thead>
                  <tbody>{data.subjects.map((s: R) => (
                    <tr key={s.code}><td><Link onClick={() => setView({ level: 'subject', campusId: data.campus.id, campusName: data.campus.name, code: s.code, name: s.name, classId: data.klass.id, className: data.klass.name })}>{s.name}</Link></td><td>{pct(s.average)}</td><td>{s.min === null ? '—' : `${s.min}–${s.max}%`}</td><td>{s.valid_students} / {s.eligible_students}</td><td>{s.missing_results}</td><td>{s.assessments}</td><td><Dist bands={s.distribution} /></td></tr>
                  ))}</tbody>
                </table></div>
                {!data.subjects.length && <div className="rp-empty">No published assessment results for this class and period.</div>}
              </section>
              <section className="panel rp-panel">
                <div className="panel-head"><div><h3>Attendance</h3><p>(present + late) ÷ recorded sessions</p></div></div>
                <div className="rp-att">
                  {(['present', 'late', 'absent', 'excused'] as const).map(k => <div key={k}><strong>{overall.attendance[k]}</strong><span>{k}</span></div>)}
                  <div><strong>{pct(overall.attendance.rate)}</strong><span>rate</span></div>
                </div>
              </section>
              {data.student_rows_allowed && (
                <section className="panel rp-panel">
                  <div className="panel-head"><div><h3>Students</h3><p>Students with no recorded result show “—”, not zero</p></div></div>
                  <div className="table-scroll"><table className="data-table">
                    <thead><tr><th>STUDENT</th><th>ADMISSION #</th><th>OVERALL</th>{data.subjects.map((s: R) => <th key={s.code}>{s.code}</th>)}</tr></thead>
                    <tbody>{data.students.map((s: R) => (
                      <tr key={s.id}><td>{s.name}</td><td>{s.admission_number}</td><td>{pct(s.overall)}</td>{data.subjects.map((x: R) => <td key={x.code}>{pct(s.subjects[x.code])}</td>)}</tr>
                    ))}</tbody>
                  </table></div>
                </section>
              )}
            </>
          )}

          {data.level === 'subject' && (
            <>
              <section className="panel rp-panel">
                <div className="panel-head"><div><h3>{data.subject.name} ({data.subject.code}) · {data.campus.name}</h3><p>{data.period.label}</p></div><span className="head-chip">Average {pct(overall.average)}</span></div>
                {!data.comparable && <div className="rp-warn"><Info size={17} /><span>Classes use different assessment structures for this subject, so their averages are not directly equivalent.</span></div>}
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>CLASS</th><th>AVERAGE</th><th>MIN–MAX</th><th>VALID / ELIGIBLE</th><th>MISSING</th><th>ASSESSMENTS</th><th>DISTRIBUTION</th></tr></thead>
                  <tbody>{data.classes.filter((c: R) => c.assessments > 0 || c.valid_students > 0).map((c: R) => (
                    <tr key={c.class_id}><td><Link onClick={() => setView({ level: 'subject', campusId: data.campus.id, campusName: data.campus.name, code: data.subject.code, name: data.subject.name, classId: c.class_id, className: c.class_name })}>{c.class_name}</Link></td><td>{pct(c.average)}</td><td>{c.min === null ? '—' : `${c.min}–${c.max}%`}</td><td>{c.valid_students} / {c.eligible_students}</td><td>{c.missing_results}</td><td>{c.assessments}</td><td><Dist bands={c.distribution} /></td></tr>
                  ))}</tbody>
                </table></div>
              </section>
              <section className="panel rp-panel">
                <div className="panel-head"><div><h3>Assessments</h3><p>Published assessments in the selected period</p></div></div>
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>ASSESSMENT</th><th>CLASS</th><th>DATE</th><th>MAX</th><th>WEIGHT</th><th>GRADED / ELIGIBLE</th><th>MISSING</th><th>AVERAGE</th></tr></thead>
                  <tbody>{data.assessments.map((a: R) => (
                    <tr key={a.id}><td>{a.title}</td><td>{a.class_name}</td><td>{a.date}</td><td>{a.max_marks}</td><td>{a.weight}</td><td>{a.graded} / {a.eligible}</td><td>{a.missing}</td><td>{pct(a.average)}</td></tr>
                  ))}</tbody>
                </table></div>
                {!data.assessments.length && <div className="rp-empty">No published assessments for this selection.</div>}
              </section>
              {data.student_rows_allowed && data.students.length > 0 && (
                <section className="panel rp-panel">
                  <div className="panel-head"><div><h3>Student results</h3><p>Weighted result across the assessments each student completed</p></div></div>
                  <div className="table-scroll"><table className="data-table">
                    <thead><tr><th>STUDENT</th><th>ADMISSION #</th><th>CLASS</th><th>RESULT</th></tr></thead>
                    <tbody>{data.students.map((s: R, i: number) => <tr key={`${s.id}-${i}`}><td>{s.name}</td><td>{s.admission_number}</td><td>{s.class_name}</td><td>{pct(s.result)}</td></tr>)}</tbody>
                  </table></div>
                </section>
              )}
            </>
          )}

          <section className="panel rp-panel rp-method">
            <h3>Calculation transparency</h3>
            <ul>
              <li><b>Averages:</b> {data.method.average_basis}</li>
              <li><b>Overall:</b> {data.method.overall_basis}</li>
              <li><b>Missing data:</b> {data.method.missing_policy}</li>
              <li><b>Attendance:</b> {data.method.attendance_basis}</li>
              <li><b>Population:</b> {data.method.population}</li>
              <li><b>Comparability:</b> {data.method.comparability}</li>
            </ul>
            <small>Generated {new Date(data.generated_at).toLocaleString()}</small>
          </section>
        </div>
      )}
    </>
  );
}
