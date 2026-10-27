import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronRight,
  GraduationCap,
  Info,
  RefreshCw,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { list, request, type User } from './api';
import ExportMenu from './ExportMenu';
import { GenderPanel } from './GenderCharts';
import { getStoredTheme } from './theme';
import './reports.css';
import './hr.css';

type R = Record<string, any>;
type Domain = 'academic' | 'income' | 'expense' | 'finance';
type View =
  | { level: 'org' }
  | { level: 'campus'; id: number; name: string }
  | { level: 'class'; id: number; name: string; campusId: number; campusName: string }
  | { level: 'subject'; campusId: number; campusName: string; code: string; name: string; classId?: number; className?: string };

const COLOR = ['#715ee8', '#23b7a0', '#f29d50', '#6c9eff', '#e477a1', '#b4a0e9'];
const PIE_INCOME = ['#10b981', '#06b6d4', '#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6', '#6366f1', '#22c55e', '#eab308', '#0284c7'];
const PIE_COLORS = ['#e11d48', '#f97316', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#b91c1c', '#d97706'];
const CUR = 'Rs';
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(n));
const money = (n: number) => `${CUR} ${Math.round(n).toLocaleString()}`;
const tick = { fontSize: 12, fill: '#8c96a7' };

function periodToDates(p: string): { from?: string; to?: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(start), to: iso(today) };
  }
  if (p === 'last_30_days') {
    const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: iso(start), to: iso(today) };
  }
  if (p === 'last_3_months') {
    const start = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { from: iso(start), to: iso(today) };
  }
  if (p === 'last_6_months') {
    const start = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
    return { from: iso(start), to: iso(today) };
  }
  if (p === 'this_year') {
    const start = new Date(today.getFullYear(), 0, 1);
    return { from: iso(start), to: iso(today) };
  }
  return {};
}

function Kpi({ label, value, foot, color }: { label: string; value: string; foot: string; color?: string }) {
  return (
    <div className="rp-kpi">
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
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
  const data = rows
    .map(r => ({ name: r.name as string, average: r[field] as number | null }))
    .filter(r => r.average !== null)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));
  if (!data.length) return <div className="rp-empty">No published results to chart for this selection.</div>;
  const themeHex = getStoredTheme().colorHex;
  return (
    <div className="rp-chart" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 24, bottom: 3, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8c96a7' }} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8c96a7' }} />
          <Tooltip formatter={v => `${v}%`} />
          <Bar dataKey="average" radius={[9, 9, 0, 0]} maxBarSize={54} fill={themeHex} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CatTable({ rows, title = 'CATEGORY' }: { rows: R[]; title?: string }) {
  return (
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>{title}</th><th>AMOUNT</th><th>SHARE</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.name}><td>{r.name}</td><td>{money(r.amount)}</td><td>{r.share}%</td></tr>)}</tbody>
    </table></div>
  );
}

function Link({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="rp-link" onClick={onClick}>{children}<ChevronRight size={14} /></button>;
}

export default function Reports({ user }: { user: User }) {
  const [domain, setDomain] = useState<Domain>('academic');
  const [view, setView] = useState<View>({ level: 'org' });
  const [period, setPeriod] = useState('');
  const [data, setData] = useState<R | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [singleCampus, setSingleCampus] = useState(false);

  // Financial Analytics State
  const [schools, setSchools] = useState<R[]>([]);
  const [financeSchool, setFinanceSchool] = useState('');
  const [financeSum, setFinanceSum] = useState<R | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState('');

  useEffect(() => {
    list<R>('schools').then(setSchools).catch(() => {});
  }, []);

  const path = useCallback((v: View) => {
    const q = period && !['this_month', 'last_30_days', 'last_3_months', 'last_6_months', 'this_year'].includes(period)
      ? `period=${encodeURIComponent(period)}`
      : '';
    if (v.level === 'org') return `reports/overview/?${q}`;
    if (v.level === 'campus') return `reports/campus/${v.id}/?${q}`;
    if (v.level === 'class') return `reports/class/${v.id}/?${q}`;
    const cls = v.classId ? `&class=${v.classId}` : '';
    return `reports/campus/${v.campusId}/subject/${encodeURIComponent(v.code)}/?${q}${cls}`;
  }, [period]);

  const loadAcademic = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const body = await request<R>(path(view));
      setData(body);
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

  const loadFinance = useCallback(async () => {
    setFinanceLoading(true);
    setFinanceError('');
    try {
      const { from, to } = periodToDates(period);
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      if (financeSchool) p.set('school', financeSchool);
      const res = await request<R>(`finance/summary/?${p.toString()}`);
      setFinanceSum(res);
    } catch (e) {
      setFinanceSum(null);
      setFinanceError(e instanceof Error ? e.message : 'Financial analytics require administrator or principal privileges.');
    } finally {
      setFinanceLoading(false);
    }
  }, [period, financeSchool]);

  useEffect(() => {
    if (domain === 'academic') {
      loadAcademic();
    } else {
      loadFinance();
    }
  }, [domain, loadAcademic, loadFinance]);

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
          <p>Multi-dimensional intelligence across academic progress, income streams, and expense allocations.</p>
        </div>
        <div className="rp-controls">
          <label className="rp-period">
            <span>Reporting period</span>
            <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Reporting period">
              <optgroup label="Academic record">
                <option value="">Whole academic record</option>
                {(data?.period?.options || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
              </optgroup>
              <optgroup label="Calendar &amp; Financial periods">
                <option value="this_month">Current month</option>
                <option value="last_30_days">Last 30 days</option>
                <option value="last_3_months">Last 3 months</option>
                <option value="last_6_months">Last 6 months</option>
                <option value="this_year">Current fiscal year</option>
              </optgroup>
            </select>
          </label>
          <ExportMenu
            title={`Institutional Analytics Report — ${domain === 'academic' ? (view.level === 'org' ? 'Organisation Wide' : (view as any).name || 'Academic') : 'Financial Overview'}`}
            filename={`report-${domain}-${view.level}`}
            columns={domain === 'academic' ? (
              view.level === 'org' ? [
                { key: 'name', label: 'Campus' },
                { key: 'students', label: 'Students' },
                { key: 'classes', label: 'Classes' },
                { key: 'academic_average', label: 'Academic Avg (%)' },
                { key: 'attendance_rate', label: 'Attendance (%)' },
                { key: 'valid_results', label: 'Valid Results' },
                { key: 'missing_results', label: 'Missing Results' },
                { key: 'completeness', label: 'Completeness (%)' }
              ] : [
                { key: 'name', label: 'Name' },
                { key: 'academic_average', label: 'Average (%)' },
                { key: 'attendance_rate', label: 'Attendance (%)' }
              ]
            ) : [
              { key: 'month', label: 'Month' },
              { key: 'income', label: 'Income (Rs)' },
              { key: 'expense', label: 'Expense (Rs)' },
              { key: 'net', label: 'Net Surplus / Deficit (Rs)' }
            ]}
            rows={() => {
              if (domain === 'academic') {
                if (view.level === 'org') {
                  return (data?.campuses || []).map((c: R) => ({
                    name: c.name,
                    students: c.students,
                    classes: c.classes,
                    academic_average: c.academic_average,
                    attendance_rate: c.attendance_rate,
                    valid_results: c.valid_results,
                    missing_results: c.missing_results,
                    completeness: c.completeness
                  }));
                }
                const items = (data?.classes || data?.subjects || []);
                return items.map((x: R) => ({
                  name: x.name,
                  academic_average: x.academic_average || x.average,
                  attendance_rate: x.attendance_rate
                }));
              } else {
                return (financeSum?.monthly || []).map((m: R) => ({
                  month: m.month,
                  income: m.income,
                  expense: m.expense,
                  net: m.net
                }));
              }
            }}
          />
          <button className="outline-btn" onClick={() => domain === 'academic' ? loadAcademic() : loadFinance()}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Domain Switcher */}
      <div className="fx-tabs" style={{ marginBottom: 18 }}>
        <button className={domain === 'academic' ? 'on' : ''} onClick={() => setDomain('academic')}>
          <GraduationCap size={15} /> Academic performance
        </button>
        <button className={domain === 'income' ? 'on' : ''} onClick={() => setDomain('income')}>
          <ArrowUpCircle size={15} /> Income analytics
        </button>
        <button className={domain === 'expense' ? 'on' : ''} onClick={() => setDomain('expense')}>
          <ArrowDownCircle size={15} /> Expense analytics
        </button>
        <button className={domain === 'finance' ? 'on' : ''} onClick={() => setDomain('finance')}>
          <Scale size={15} /> Financial overview
        </button>
      </div>

      {/* Financial Domain Campus Switcher */}
      {domain !== 'academic' && schools.length > 1 && (
        <div className="campus-switcher-bar">
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginRight: 4 }}>Campus:</span>
          <button
            type="button"
            className={`campus-pill overall ${!financeSchool ? 'active' : ''}`}
            onClick={() => setFinanceSchool('')}
          >
            Overall (All Campuses Combined)
          </button>
          {schools.map(s => (
            <button
              key={s.id}
              type="button"
              className={`campus-pill ${financeSchool === String(s.id) ? 'active' : ''}`}
              onClick={() => setFinanceSchool(String(s.id))}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Academic Domain View */}
      {domain === 'academic' && (
        <>
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

              {data.level === 'organisation' && <GenderPanel title="Boys vs girls" subtitle="Academic average across all campuses, then by campus" split={overall.gender} rows={data.campuses} />}
              {data.level === 'campus' && <GenderPanel title="Boys vs girls" subtitle="Academic average for this campus, then by class" split={overall.gender} rows={data.classes} />}
              {data.level === 'class' && <GenderPanel title="Boys vs girls" subtitle="Academic average for this class, then by subject" split={overall.gender} rows={data.subjects} />}
              {data.level === 'subject' && <GenderPanel title="Boys vs girls" subtitle="This subject, then by class" split={overall.gender} rows={data.classes.filter((c: R) => c.assessments > 0 || c.valid_students > 0).map((c: R) => ({ name: c.class_name, gender: c.gender }))} />}

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
                    {data.subjects.some((s: R) => !s.comparable) && <div className="rp-warn"><Info size={17} /><span>Some subjects use different assessment structures in different classes.</span></div>}
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
                  </section>
                </>
              )}

              {data.level === 'subject' && (
                <>
                  <section className="panel rp-panel">
                    <div className="panel-head"><div><h3>{data.subject.name} ({data.subject.code}) · {data.campus.name}</h3><p>{data.period.label}</p></div><span className="head-chip">Average {pct(overall.average)}</span></div>
                    <div className="table-scroll"><table className="data-table">
                      <thead><tr><th>CLASS</th><th>AVERAGE</th><th>MIN–MAX</th><th>VALID / ELIGIBLE</th><th>MISSING</th><th>ASSESSMENTS</th><th>DISTRIBUTION</th></tr></thead>
                      <tbody>{data.classes.filter((c: R) => c.assessments > 0 || c.valid_students > 0).map((c: R) => (
                        <tr key={c.class_id}><td><Link onClick={() => setView({ level: 'subject', campusId: data.campus.id, campusName: data.campus.name, code: data.subject.code, name: data.subject.name, classId: c.class_id, className: c.class_name })}>{c.class_name}</Link></td><td>{pct(c.average)}</td><td>{c.min === null ? '—' : `${c.min}–${c.max}%`}</td><td>{c.valid_students} / {c.eligible_students}</td><td>{c.missing_results}</td><td>{c.assessments}</td><td><Dist bands={c.distribution} /></td></tr>
                      ))}</tbody>
                    </table></div>
                  </section>
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
      )}

      {/* Financial Domains (Income / Expense / Financial Overview) */}
      {domain !== 'academic' && (
        <div>
          {financeError && (
            <div className="error-bar">
              <AlertCircle size={17} /> {financeError}
            </div>
          )}

          {financeLoading && <div className="rp-empty">Calculating financial analytics…</div>}

          {financeSum && (
            <>
              {/* KPIs */}
              <div className="rp-kpis">
                {domain === 'income' && (
                  <>
                    <Kpi label="Total Income" value={money(financeSum.total_income)} foot="Audited cash received" color="#10b981" />
                    <Kpi label="Recorded Entries" value={String(financeSum.entries)} foot="Excluding voided entries" />
                    <Kpi label="Top Category" value={financeSum.income_by_category?.[0]?.name || '—'} foot={financeSum.income_by_category?.[0] ? money(financeSum.income_by_category[0].amount) : 'None'} />
                    <Kpi label="Campuses" value={String(financeSum.campuses?.length || 1)} foot="Reporting locations" />
                  </>
                )}
                {domain === 'expense' && (
                  <>
                    <Kpi label="Total Expense" value={money(financeSum.total_expense)} foot="Audited expenditure" color="#e11d48" />
                    <Kpi label="Recorded Entries" value={String(financeSum.entries)} foot="Excluding voided entries" />
                    <Kpi label="Largest Category" value={financeSum.expense_by_category?.[0]?.name || '—'} foot={financeSum.expense_by_category?.[0] ? money(financeSum.expense_by_category[0].amount) : 'None'} />
                    <Kpi label="Campuses" value={String(financeSum.campuses?.length || 1)} foot="Reporting locations" />
                  </>
                )}
                {domain === 'finance' && (
                  <>
                    <Kpi label="Total Income" value={money(financeSum.total_income)} foot="Gross receipts" color="#10b981" />
                    <Kpi label="Total Expense" value={money(financeSum.total_expense)} foot="Gross expenses" color="#e11d48" />
                    <Kpi label="Net Operating Surplus" value={money(financeSum.net)} foot="Net financial balance" color={financeSum.net >= 0 ? '#10b981' : '#e11d48'} />
                    <Kpi label="Transactions" value={String(financeSum.entries)} foot="Active ledger lines" />
                  </>
                )}
              </div>

              {/* Income Domain */}
              {domain === 'income' && (
                <div className="fx-grid">
                  <section className="panel hr-panel fx-card">
                    <div className="panel-head">
                      <div><h3>Income by category</h3><p>Share of total revenue stream across categories</p></div>
                    </div>
                    {financeSum.income_by_category?.filter((r: R) => Number(r.amount) > 0).length ? (
                      <>
                        <div className="rp-chart"><ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={financeSum.income_by_category.filter((r: R) => Number(r.amount) > 0)}
                              dataKey="amount"
                              nameKey="name"
                              innerRadius={48}
                              outerRadius={95}
                              paddingAngle={2}
                            >
                              {financeSum.income_by_category.map((_: any, i: number) => (
                                <Cell key={i} fill={PIE_INCOME[i % PIE_INCOME.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => money(v)} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer></div>
                        <CatTable rows={financeSum.income_by_category} title="INCOME STREAM" />
                      </>
                    ) : <div className="rp-empty">No income recorded for this selection.</div>}
                  </section>

                  <section className="panel hr-panel fx-card">
                    <div className="panel-head">
                      <div><h3>Monthly income trend</h3><p>Month-over-month revenue stream</p></div>
                    </div>
                    {financeSum.monthly?.length ? (
                      <div className="rp-chart"><ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financeSum.monthly} margin={{ top: 12, right: 24, bottom: 3, left: 0 }}>
                          <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
                          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} />
                          <YAxis tickLine={false} axisLine={false} tick={tick} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                          <Tooltip formatter={(v: number) => money(v)} />
                          <Bar dataKey="income" name="Income" fill="#10b981" radius={[7, 7, 0, 0]} maxBarSize={38} />
                        </BarChart>
                      </ResponsiveContainer></div>
                    ) : <div className="rp-empty">No monthly data available.</div>}
                  </section>
                </div>
              )}

              {/* Expense Domain - Pie Chart of All Categories */}
              {domain === 'expense' && (
                <div className="fx-grid">
                  <section className="panel hr-panel fx-card">
                    <div className="panel-head">
                      <div><h3>Expenses of all categories</h3><p>Share of total operational expenses</p></div>
                    </div>
                    {financeSum.expense_by_category?.length ? (
                      <>
                        <div className="rp-chart"><ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={financeSum.expense_by_category.filter((r: R) => Number(r.amount) > 0)}
                              dataKey="amount"
                              nameKey="name"
                              innerRadius={48}
                              outerRadius={95}
                              paddingAngle={2}
                            >
                              {financeSum.expense_by_category.map((_: any, i: number) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v: number) => money(v)} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer></div>
                        <CatTable rows={financeSum.expense_by_category} title="EXPENSE CATEGORY" />
                      </>
                    ) : <div className="rp-empty">No expenses recorded for this selection.</div>}
                  </section>

                  <section className="panel hr-panel fx-card">
                    <div className="panel-head">
                      <div><h3>Monthly expense trend</h3><p>Expenditure pattern over time</p></div>
                    </div>
                    {financeSum.monthly?.length ? (
                      <div className="rp-chart"><ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financeSum.monthly} margin={{ top: 12, right: 24, bottom: 3, left: 0 }}>
                          <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
                          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} />
                          <YAxis tickLine={false} axisLine={false} tick={tick} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                          <Tooltip formatter={(v: number) => money(v)} />
                          <Bar dataKey="expense" name="Expense" fill="#e11d48" radius={[7, 7, 0, 0]} maxBarSize={38} />
                        </BarChart>
                      </ResponsiveContainer></div>
                    ) : <div className="rp-empty">No monthly data available.</div>}
                  </section>
                </div>
              )}

              {/* Financial Overview Domain */}
              {domain === 'finance' && (
                <>
                  <section className="panel hr-panel fx-card" style={{ marginBottom: 20 }}>
                    <div className="panel-head">
                      <div><h3>Income vs Expense Comparative Analysis</h3><p>Monthly financial balance</p></div>
                    </div>
                    {financeSum.monthly?.length ? (
                      <div className="rp-chart"><ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financeSum.monthly} margin={{ top: 12, right: 24, bottom: 3, left: 0 }}>
                          <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
                          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} />
                          <YAxis tickLine={false} axisLine={false} tick={tick} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                          <Tooltip formatter={(v: number) => money(v)} /><Legend />
                          <Bar dataKey="income" name="Income" fill="#10b981" radius={[7, 7, 0, 0]} maxBarSize={34} />
                          <Bar dataKey="expense" name="Expense" fill="#e11d48" radius={[7, 7, 0, 0]} maxBarSize={34} />
                        </BarChart>
                      </ResponsiveContainer></div>
                    ) : <div className="rp-empty">No entries recorded yet.</div>}
                  </section>

                  {financeSum.campuses?.length > 0 && (
                    <section className="panel hr-panel">
                      <div className="panel-head">
                        <div><h3>Campus Financial Performance</h3><p>Surplus and expenditure by educational campus</p></div>
                        <span className="head-chip">{financeSum.campuses.length} Campus(es)</span>
                      </div>
                      <div className="table-scroll"><table className="data-table">
                        <thead><tr><th>CAMPUS</th><th>INCOME</th><th>EXPENSE</th><th>NET SURPLUS / DEFICIT</th></tr></thead>
                        <tbody>{financeSum.campuses.map((c: R) => (
                          <tr key={c.id}>
                            <td><strong>{c.name}</strong></td>
                            <td style={{ color: '#10b981', fontWeight: 700 }}>{money(c.income)}</td>
                            <td style={{ color: '#e11d48', fontWeight: 700 }}>{money(c.expense)}</td>
                            <td style={{ color: c.net >= 0 ? '#10b981' : '#e11d48', fontWeight: 800 }}>{money(c.net)}</td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
