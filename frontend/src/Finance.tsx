import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ArrowDownCircle, ArrowRight, ArrowUpCircle, Ban, Crown, Download, Lock, Plus, Scale, Sparkles, Tags, Trash2, Users } from 'lucide-react';
import { list, request, type User } from './api';
import ExportMenu from './ExportMenu';
import FilterBar from './FilterBar';
import { getStoredTheme } from './theme';
import './hr.css';

type R = Record<string, any>;
type Tab = 'overview' | 'income' | 'expense' | 'categories';
const CUR = 'Rs';
const INCOME = '#22a06b';
const EXPENSE = '#e5484d';
const PIE_INCOME = ['#10b981', '#06b6d4', '#3b82f6', '#14b8a6', '#f59e0b', '#8b5cf6', '#6366f1', '#22c55e', '#eab308', '#0284c7'];
const PIE_EXPENSE = ['#e11d48', '#f97316', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#b91c1c', '#d97706', '#be123c'];
const PIE = PIE_EXPENSE;
const money = (n: number) => `${CUR} ${Math.round(n).toLocaleString()}`;
const tick = { fontSize: 12, fill: '#8c96a7' };

function LockedChartCard({
  title,
  subtitle,
  onUpgrade
}: {
  title: string;
  subtitle: string;
  onUpgrade?: () => void;
}) {
  return (
    <div className="fx-locked-chart-card">
      <div style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: '#fef3c7',
        color: '#d97706',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.2)'
      }}>
        <Crown size={22} style={{ fill: '#f59e0b' }} />
      </div>

      <div className="fx-locked-badge">
        <Crown size={11} style={{ fill: '#f59e0b' }} /> Premium Plan Feature
      </div>

      <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #1e293b)' }}>
        {title} Locked
      </h4>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-secondary, #64748b)', maxWidth: 320, lineHeight: 1.5 }}>
        {subtitle}
      </p>

      {onUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="primary-btn"
          style={{
            fontSize: 12,
            padding: '7px 16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span>Upgrade to Plan & Billing</span>
          <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

interface FinanceProps {
  user: User;
  notify: (m: string) => void;
  plan?: string;
  isPremiumUnlocked?: boolean;
  onUpgrade?: () => void;
}

export default function Finance({ user, notify, plan, isPremiumUnlocked, onUpgrade }: FinanceProps) {
  const isPrincipal = user.role === 'principal';
  const hasPremium = isPremiumUnlocked !== undefined ? isPremiumUnlocked : (plan === 'premium' || plan === 'custom');
  const [tab, setTab] = useState<Tab>('overview');
  const [schools, setSchools] = useState<R[]>([]);
  const [school, setSchool] = useState(isPrincipal && user.school ? String(user.school) : '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sum, setSum] = useState<R | null>(null);
  const [error, setError] = useState('');
  const [bump, setBump] = useState(0);

  useEffect(() => {
    list<R>('schools').then(res => {
      setSchools(res);
      if (isPrincipal && user.school) {
        setSchool(String(user.school));
      }
    }).catch(() => {});
  }, [isPrincipal, user.school]);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    const effectiveSchool = isPrincipal && user.school ? String(user.school) : school;
    if (effectiveSchool) p.set('school', effectiveSchool);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }, [isPrincipal, user.school, school, from, to]);

  const loadSummary = useCallback(async () => {
    setError('');
    try {
      setSum(await request<R>(`finance/summary/?${qs}`));
    } catch (e: any) {
      // If summary is locked on standard tier, calculate totals and categories directly from entries
      try {
        const [incRes, expRes] = await Promise.all([
          request<R>(`finance/entries/?kind=income&${qs}`).catch(() => ({ results: [] })),
          request<R>(`finance/entries/?kind=expense&${qs}`).catch(() => ({ results: [] }))
        ]);
        const incRows = (incRes?.results || []).filter((r: R) => !r.voided);
        const expRows = (expRes?.results || []).filter((r: R) => !r.voided);
        const total_income = incRows.reduce((a: number, r: R) => a + Number(r.amount || 0), 0);
        const total_expense = expRows.reduce((a: number, r: R) => a + Number(r.amount || 0), 0);
        const net = total_income - total_expense;

        const incByCat: Record<string, number> = {};
        for (const r of incRows) {
          const cname = r.category_name || 'General';
          incByCat[cname] = (incByCat[cname] || 0) + Number(r.amount || 0);
        }
        const expByCat: Record<string, number> = {};
        for (const r of expRows) {
          const cname = r.category_name || 'General';
          expByCat[cname] = (expByCat[cname] || 0) + Number(r.amount || 0);
        }

        const income_by_category = Object.entries(incByCat).map(([name, amount]) => ({
          name,
          amount,
          share: total_income > 0 ? Math.round((amount / total_income) * 1000) / 10 : 0
        }));
        const expense_by_category = Object.entries(expByCat).map(([name, amount]) => ({
          name,
          amount,
          share: total_expense > 0 ? Math.round((amount / total_expense) * 1000) / 10 : 0
        }));

        setSum({
          total_income,
          total_expense,
          net,
          entries: incRows.length + expRows.length,
          income_by_category,
          expense_by_category,
          monthly: [],
          campuses: [],
          note: 'Standard plan: Operational ledger totals and categories active.'
        });
      } catch {
        setSum(null);
        setError(e instanceof Error ? e.message : 'Could not load finance');
      }
    }
  }, [qs]);
  useEffect(() => { loadSummary(); }, [loadSummary, bump]);
  const changed = (msg: string) => { notify(msg); setBump(b => b + 1); };

  const tabs: [Tab, string, typeof Scale][] = [['overview', 'Overview', Scale], ['income', 'Income', ArrowUpCircle], ['expense', 'Expenses', ArrowDownCircle], ['categories', 'Categories', Tags]];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">FINANCE / LEDGER</div>
          <h1>Finance</h1>
          <p>Track income and expenses by category. Charts and totals update as you add entries.</p>
        </div>
        <div className="fx-filters">
          {!isPrincipal && schools.length > 1 && <label>Campus<select className="fx-select" value={school} onChange={e => setSchool(e.target.value)}><option value="">All campuses</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
          <label>From<input type="date" className="fx-select" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label>To<input type="date" className="fx-select" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
      </div>

      {!isPrincipal && schools.length > 1 && (
        <div className="campus-switcher-bar">
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginRight: 4 }}>Campus:</span>
          <button
            type="button"
            className={`campus-pill overall ${!school ? 'active' : ''}`}
            onClick={() => setSchool('')}
          >
            Overall (All Campuses Combined)
          </button>
          {schools.map(s => (
            <button
              key={s.id}
              type="button"
              className={`campus-pill ${school === String(s.id) ? 'active' : ''}`}
              onClick={() => setSchool(String(s.id))}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <nav className="fx-tabs" aria-label="Finance sections">
        {tabs.map(([k, label, Icon]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={15} /> {label}</button>)}
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {tab === 'overview' && sum && <Overview sum={sum} isPrincipal={isPrincipal} hasPremium={hasPremium} onUpgrade={onUpgrade} />}
      {(tab === 'income' || tab === 'expense') && <Entries kind={tab} school={school} schools={schools} user={user} qs={qs} bump={bump} onChanged={changed} hasPremium={hasPremium} onUpgrade={onUpgrade} />}
      {tab === 'categories' && <Categories school={school} schools={schools} user={user} onChanged={changed} />}
    </>
  );
}

function Overview({ sum, isPrincipal, hasPremium, onUpgrade }: { sum: R; isPrincipal?: boolean; hasPremium?: boolean; onUpgrade?: () => void }) {
  const exp: R[] = sum.expense_by_category, inc: R[] = sum.income_by_category, months: R[] = sum.monthly;
  const [campusSortCol, setCampusSortCol] = useState<'income' | 'expense' | 'net' | 'name'>('income');
  const [campusSortDir, setCampusSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (col: 'income' | 'expense' | 'net' | 'name') => {
    if (campusSortCol === col) {
      setCampusSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setCampusSortCol(col);
      setCampusSortDir('desc');
    }
  };

  const sortedCampuses = useMemo(() => {
    return [...(sum.campuses || [])].sort((a, b) => {
      if (campusSortCol === 'name') {
        const cmp = a.name.localeCompare(b.name);
        return campusSortDir === 'desc' ? -cmp : cmp;
      }
      const valA = Number(a[campusSortCol] ?? 0);
      const valB = Number(b[campusSortCol] ?? 0);
      if (valA === valB) return a.name.localeCompare(b.name);
      return campusSortDir === 'desc' ? valB - valA : valA - valB;
    });
  }, [sum.campuses, campusSortCol, campusSortDir]);
  return (
    <>
      <div className="fx-kpis">
        <div className="fx-kpi"><span>Total income</span><strong style={{ color: INCOME }}>{money(sum.total_income)}</strong></div>
        <div className="fx-kpi"><span>Total expense</span><strong style={{ color: EXPENSE }}>{money(sum.total_expense)}</strong></div>
        <div className="fx-kpi"><span>Net</span><strong style={{ color: sum.net >= 0 ? INCOME : EXPENSE }}>{money(sum.net)}</strong><small>{sum.entries} entries</small></div>
      </div>

      {sum.student_projection && (
        <section className="panel hr-panel" style={{ padding: '16px 20px', marginBottom: 20, background: 'linear-gradient(135deg, #f8faff 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b' }}>
                <Users size={18} color="#6366f1" /> Student Fee Revenue Projection (Estimated via Student Cohorts)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                Estimated revenue receivable from enrolled student body vs approved realized collections and pending dues
              </p>
            </div>
            <span style={{ background: '#ede9fe', color: '#6366f1', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {sum.student_projection.total_students} Enrolled Students
            </span>
          </div>

          <div className="fx-kpis" style={{ margin: 0, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="fx-kpi" style={{ background: 'white', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11 }}>Estimated Total Income</span>
              <strong style={{ fontSize: 17, color: '#2563eb' }}>{money(sum.student_projection.expected)}</strong>
              <small>~{money(sum.student_projection.avg_per_student)} / student</small>
            </div>
            <div className="fx-kpi" style={{ background: 'white', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11 }}>Collected & Approved</span>
              <strong style={{ fontSize: 17, color: '#16a34a' }}>{money(sum.student_projection.collected)}</strong>
              <small>Realized in Income ledger</small>
            </div>
            <div className="fx-kpi" style={{ background: 'white', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11 }}>Remaining to Collect</span>
              <strong style={{ fontSize: 17, color: '#dc2626' }}>{money(sum.student_projection.remaining)}</strong>
              <small>Outstanding receivable</small>
            </div>
            <div className="fx-kpi" style={{ background: 'white', borderRadius: 10, padding: 12 }}>
              <span style={{ fontSize: 11 }}>Challans Pending Approval</span>
              <strong style={{ fontSize: 17, color: '#d97706' }}>{money(sum.student_projection.pending_approval || 0)}</strong>
              <small>Awaiting admin verification</small>
            </div>
          </div>
        </section>
      )}

      <div className="fx-grid">
        <section className="panel hr-panel fx-card">
          <div className="panel-head"><div><h3>Expenses by category</h3><p>Share of total operational expenses</p></div></div>
          {hasPremium ? (
            exp.filter((r: R) => Number(r.amount) > 0).length ? (
              <>
                <div className="rp-chart"><ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={exp.filter((r: R) => Number(r.amount) > 0)}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {exp.map((_, i) => <Cell key={i} fill={PIE_EXPENSE[i % PIE_EXPENSE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer></div>
                <CatTable rows={exp} />
              </>
            ) : <div className="rp-empty">No expenses recorded for this selection.</div>
          ) : (
            <>
              <LockedChartCard
                title="Expenses Distribution Chart"
                subtitle="Visual category distribution charts and expense analytics require the Premium plan."
                onUpgrade={onUpgrade}
              />
              {exp.length > 0 && <CatTable rows={exp} />}
            </>
          )}
        </section>

        <section className="panel hr-panel fx-card">
          <div className="panel-head"><div><h3>Income by category</h3><p>Share of total revenue stream across categories</p></div></div>
          {hasPremium ? (
            inc.filter((r: R) => Number(r.amount) > 0).length ? (
              <>
                <div className="rp-chart"><ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inc.filter((r: R) => Number(r.amount) > 0)}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {inc.map((_, i) => <Cell key={i} fill={PIE_INCOME[i % PIE_INCOME.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer></div>
                <CatTable rows={inc} />
              </>
            ) : <div className="rp-empty">No income recorded for this selection.</div>
          ) : (
            <>
              <LockedChartCard
                title="Income Distribution Chart"
                subtitle="Visual revenue stream charts and category analytics require the Premium plan."
                onUpgrade={onUpgrade}
              />
              {inc.length > 0 && <CatTable rows={inc} />}
            </>
          )}
        </section>
      </div>

      <section className="panel hr-panel fx-card">
        <div className="panel-head"><div><h3>Income vs expense by month</h3><p>Voided entries are excluded</p></div></div>
        {hasPremium ? (
          months.length ? (
            <div className="rp-chart"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 12, right: 24, bottom: 3, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} />
                <YAxis tickLine={false} axisLine={false} tick={tick} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip formatter={(v: number) => money(v)} /><Legend />
                <Bar dataKey="income" name="Income" fill={INCOME} radius={[7, 7, 0, 0]} maxBarSize={34} />
                <Bar dataKey="expense" name="Expense" fill={EXPENSE} radius={[7, 7, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer></div>
          ) : <div className="rp-empty">No entries yet.</div>
        ) : (
          <LockedChartCard
            title="Monthly Cashflow Bar Chart"
            subtitle="Interactive monthly cash-flow trend bars and comparative visualizations require the Premium plan."
            onUpgrade={onUpgrade}
          />
        )}
        {!isPrincipal && sum.campuses.length > 1 && (
          <div className="table-scroll"><table className="data-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                  CAMPUS {campusSortCol === 'name' && (campusSortDir === 'desc' ? '▼' : '▲')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('income')}>
                  INCOME {campusSortCol === 'income' && (campusSortDir === 'desc' ? '▼' : '▲')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('expense')}>
                  EXPENSE {campusSortCol === 'expense' && (campusSortDir === 'desc' ? '▼' : '▲')}
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('net')}>
                  NET {campusSortCol === 'net' && (campusSortDir === 'desc' ? '▼' : '▲')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedCampuses.map((c: R) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td style={{ color: INCOME, fontWeight: 600 }}>{money(c.income)}</td>
                  <td style={{ color: EXPENSE, fontWeight: 600 }}>{money(c.expense)}</td>
                  <td style={{ color: c.net >= 0 ? INCOME : EXPENSE, fontWeight: 700 }}>{money(c.net)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
      <small className="rp-sub">{sum.note}</small>
    </>
  );
}

function CatTable({ rows }: { rows: R[] }) {
  return (
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>CATEGORY</th><th>AMOUNT</th><th>SHARE</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.name}><td>{r.name}</td><td>{money(r.amount)}</td><td>{r.share}%</td></tr>)}</tbody>
    </table></div>
  );
}

function Entries({ kind, school, schools, user, qs, bump, onChanged, hasPremium, onUpgrade }: { kind: 'income' | 'expense'; school: string; schools: R[]; user: User; qs: string; bump: number; onChanged: (m: string) => void; hasPremium?: boolean; onUpgrade?: () => void }) {
  const [rows, setRows] = useState<R[]>([]);
  const [cats, setCats] = useState<R[]>([]);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [f, setF] = useState<R>({ date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const target = school || f.school || (user.role !== 'organisation_admin' ? String(user.school || '') : '') || String(schools[0]?.id || '');

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    p.set('kind', kind);
    if (school) p.set('school', school);
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
    }
    try { setRows((await request<R>(`finance/entries/?${p.toString()}`)).results); } catch { setRows([]); }
  }, [kind, school, filters]);
  useEffect(() => { load(); }, [load, bump]);
  useEffect(() => {
    if (!target) return;
    request<R>(`finance/categories/?school=${target}&kind=${kind}`).then(d => setCats(d.results.filter((c: R) => c.active))).catch(() => setCats([]));
  }, [target, kind, bump]);

  const label = kind === 'income' ? 'income' : 'expense';
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await request('finance/entries/', { method: 'POST', body: JSON.stringify({ school: target, category: f.category, amount: f.amount, date: f.date, description: f.description || '' }) });
      setF(s => ({ ...s, amount: '', description: '' })); onChanged(`${label[0].toUpperCase() + label.slice(1)} added`);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); } finally { setBusy(false); }
  };
  const voidIt = async (r: R) => {
    if (!window.confirm(`Void this ${label} of ${money(Number(r.amount))}? It will be excluded from totals.`)) return;
    try { await request(`finance/entries/${r.id}/void/`, { method: 'POST', body: '{}' }); onChanged('Entry voided'); } catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); }
  };
  const deleteIt = async (r: R) => {
    if (!window.confirm(`Permanently delete this ${label} of ${money(Number(r.amount))}?`)) return;
    try {
      await request(`finance/entries/${r.id}/`, { method: 'DELETE' });
      onChanged('Entry deleted');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    }
  };
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <>
      <section className="panel hr-panel fx-card">
        <div className="panel-head"><div><h3>Add {label}</h3><p>Choose a category, amount and date</p></div></div>
        <form className="fx-form" onSubmit={add}>
          {!school && schools.length > 1 && <label>Campus<select className="fx-select" required value={target} onChange={e => setF(s => ({ ...s, school: e.target.value, category: '' }))}>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
          <label>Category<select className="fx-select" required value={f.category || ''} onChange={e => setF(s => ({ ...s, category: e.target.value }))}><option value="">Select…</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Amount ({CUR})<input className="fx-select" required type="number" min="0.01" step="0.01" value={f.amount || ''} onChange={e => setF(s => ({ ...s, amount: e.target.value }))} /></label>
          <label>Date<input className="fx-select" type="date" required value={f.date} onChange={e => setF(s => ({ ...s, date: e.target.value }))} /></label>
          <label className="grow">Description<input className="fx-select" value={f.description || ''} onChange={e => setF(s => ({ ...s, description: e.target.value }))} /></label>
          <button className="primary-btn" disabled={busy}><Plus size={15} /> {busy ? 'Saving…' : `Add ${label}`}</button>
        </form>
        {err && <div className="hr-error" style={{ margin: '12px 0 0' }}>{err}</div>}
      </section>

      <section className="panel hr-panel">
        <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{kind === 'income' ? 'Income' : 'Expense'} entries</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="result-count">{rows.length} shown · {money(total)}</span>
            {hasPremium ? (
              <ExportMenu
                title={`${kind === 'income' ? 'Income' : 'Expense'} Ledger Entries`}
                filename={`finance-${kind}-entries`}
                columns={[
                  { key: 'date', label: 'Date' },
                  { key: 'category_name', label: 'Category' },
                  { key: 'description', label: 'Description' },
                  { key: 'school_name', label: 'Campus' },
                  { key: 'amount', label: 'Amount (Rs)' },
                  { key: 'voided', label: 'Status' }
                ]}
                rows={() => rows.map(r => ({
                  date: r.date,
                  category_name: r.category_name,
                  description: r.description || '—',
                  school_name: r.school_name,
                  amount: r.amount,
                  voided: r.voided ? 'Voided' : 'Valid'
                }))}
                notify={onChanged}
              />
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={onUpgrade}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    opacity: 0.95
                  }}
                  title="Exports require Premium plan"
                >
                  <Download size={14} />
                  <span>Export</span>
                  <span style={{
                    background: '#fef3c7',
                    color: '#92400e',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3
                  }}>
                    <Crown size={10} style={{ color: '#d97706', fill: '#f59e0b' }} />
                  </span>
                </button>
                {onUpgrade && (
                  <button
                    type="button"
                    onClick={onUpgrade}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#7c69e8',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0
                    }}
                  >
                    Upgrade to Plan & Billing
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <FilterBar
            searchPlaceholder={`Search ${kind} entries by description, category...`}
            filters={[
              {
                key: 'category',
                label: 'Category',
                options: cats.map(c => ({ label: c.name, value: c.id }))
              },
              {
                key: 'from',
                label: 'From Date',
                type: 'date'
              },
              {
                key: 'to',
                label: 'To Date',
                type: 'date'
              },
              {
                key: 'voided',
                label: 'Status',
                options: [
                  { label: 'Valid Only', value: '0' },
                  { label: 'Include Voided', value: '1' }
                ]
              }
            ]}
            values={filters}
            onChange={setFilters}
            onClear={() => setFilters({})}
          />
        </div>
        <div className="table-scroll"><table className="data-table">
          <thead>
            <tr><th>DATE</th><th>CATEGORY</th><th>DESCRIPTION</th><th>CAMPUS</th><th>AMOUNT</th><th>ACTION</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ opacity: r.voided ? 0.45 : 1 }}>
                <td>{r.date}</td>
                <td><span className="pill">{r.category_name}</span></td>
                <td>{r.description || '—'}</td>
                <td>{r.school_name}</td>
                <td><strong style={{ color: kind === 'income' ? INCOME : EXPENSE }}>{money(Number(r.amount))}</strong> {r.voided && <em style={{ fontSize: 11, color: '#e5484d', fontWeight: 600 }}>(Voided)</em>}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {!r.voided && (
                    <button type="button" className="sm-btn danger-soft" onClick={() => voidIt(r)} title="Void this entry">
                      <Ban size={13} /> Void
                    </button>
                  )}
                  <button type="button" className="sm-btn danger-soft" onClick={() => deleteIt(r)} title="Delete entry permanently">
                    <Trash2 size={13} /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#8c96a7' }}>No {kind} entries recorded yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}

function Categories({ school, schools, user, onChanged }: { school: string; schools: R[]; user: User; onChanged: (m: string) => void }) {
  const [rows, setRows] = useState<R[]>([]);
  const [name, setName] = useState(''); const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [target, setTarget] = useState(school || (user.role !== 'organisation_admin' ? String(user.school || '') : '') || String(schools[0]?.id || ''));
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (school) p.set('school', school);
    try { setRows((await request<R>(`finance/categories/?${p.toString()}`)).results); } catch { setRows([]); }
  }, [school]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (school) setTarget(school); }, [school]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await request('finance/categories/', { method: 'POST', body: JSON.stringify({ school: target, kind, name }) });
      setName(''); onChanged('Category added'); load();
    } catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); } finally { setBusy(false); }
  };
  const toggle = async (c: R) => {
    try { await request(`finance/categories/${c.id}/`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) }); onChanged('Category updated'); load(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); }
  };
  const startEdit = (c: R) => {
    setEditingId(c.id);
    setEditName(c.name);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };
  const saveEdit = async (c: R) => {
    if (!editName.trim()) return;
    try {
      await request(`finance/categories/${c.id}/`, { method: 'PATCH', body: JSON.stringify({ name: editName.trim() }) });
      onChanged('Category renamed');
      setEditingId(null);
      load();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Rename failed');
    }
  };
  const remove = async (c: R) => {
    if (!window.confirm(`Delete category "${c.name}"? If it has entries, they will also be permanently deleted.`)) return;
    try { await request(`finance/categories/${c.id}/`, { method: 'DELETE' }); onChanged('Category deleted'); load(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); }
  };

  return (
    <>
      <section className="panel hr-panel fx-card">
        <div className="panel-head"><div><h3>Add category</h3><p>Organise income and expenses</p></div></div>
        <form className="fx-form" onSubmit={add}>
          {!school && schools.length > 1 && <label>Campus<select className="fx-select" required value={target} onChange={e => setTarget(e.target.value)}>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
          <label>Kind<select className="fx-select" value={kind} onChange={e => setKind(e.target.value as any)}><option value="income">Income</option><option value="expense">Expense</option></select></label>
          <label className="grow">Name<input className="fx-select" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lab equipment" /></label>
          <button className="primary-btn" disabled={busy}><Plus size={15} /> {busy ? 'Saving…' : 'Add category'}</button>
        </form>
        {err && <div className="hr-error" style={{ margin: '12px 0 0' }}>{err}</div>}
      </section>

      <section className="panel hr-panel">
        <div className="toolbar"><strong>Categories</strong><span className="result-count">{rows.length} total</span></div>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>NAME</th><th>KIND</th><th>CAMPUS</th><th>ENTRIES</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td>
                  {editingId === c.id ? (
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        className="fx-select"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        style={{ height: 30, fontSize: 12, padding: '2px 8px' }}
                      />
                      <button type="button" className="sm-btn primary-btn" onClick={() => saveEdit(c)} style={{ height: 30, padding: '0 8px', fontSize: 11 }}>Save</button>
                      <button type="button" className="sm-btn" onClick={cancelEdit} style={{ height: 30, padding: '0 8px', fontSize: 11 }}>Cancel</button>
                    </div>
                  ) : (
                    <strong>{c.name}</strong>
                  )}
                </td>
                <td><span className="pill" style={{ color: c.kind === 'income' ? INCOME : EXPENSE }}>{c.kind}</span></td>
                <td>{c.school_name}</td>
                <td>{c.entries_count}</td>
                <td><button type="button" className={`pill ${c.active ? 'green' : 'amber'}`} onClick={() => toggle(c)}>{c.active ? 'Active' : 'Archived'}</button></td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {editingId !== c.id && (
                      <button type="button" className="sm-btn outline-btn" onClick={() => startEdit(c)} style={{ fontSize: 11, padding: '3px 8px' }}>
                        Edit
                      </button>
                    )}
                    <button type="button" className="sm-btn danger-soft" onClick={() => remove(c)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#8c96a7' }}>No categories yet. Default categories will be generated automatically.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
