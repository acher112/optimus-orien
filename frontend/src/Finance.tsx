import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Ban, Plus, Scale, Tags, Trash2 } from 'lucide-react';
import { list, request, type User } from './api';
import ExportMenu from './ExportMenu';
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

export default function Finance({ user, notify }: { user: User; notify: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [schools, setSchools] = useState<R[]>([]);
  const [school, setSchool] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sum, setSum] = useState<R | null>(null);
  const [error, setError] = useState('');
  const [bump, setBump] = useState(0);

  useEffect(() => { list<R>('schools').then(setSchools).catch(() => {}); }, []);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (school) p.set('school', school);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }, [school, from, to]);

  const loadSummary = useCallback(async () => {
    setError('');
    try { setSum(await request<R>(`finance/summary/?${qs}`)); }
    catch (e) { setSum(null); setError(e instanceof Error ? e.message : 'Could not load finance'); }
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
          {schools.length > 1 && <label>Campus<select className="fx-select" value={school} onChange={e => setSchool(e.target.value)}><option value="">All campuses</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
          <label>From<input type="date" className="fx-select" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label>To<input type="date" className="fx-select" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>
      </div>

      <nav className="fx-tabs" aria-label="Finance sections">
        {tabs.map(([k, label, Icon]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={15} /> {label}</button>)}
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {tab === 'overview' && sum && <Overview sum={sum} />}
      {(tab === 'income' || tab === 'expense') && <Entries kind={tab} school={school} schools={schools} user={user} qs={qs} bump={bump} onChanged={changed} />}
      {tab === 'categories' && <Categories school={school} schools={schools} user={user} onChanged={changed} />}
    </>
  );
}

function Overview({ sum }: { sum: R }) {
  const exp: R[] = sum.expense_by_category, inc: R[] = sum.income_by_category, months: R[] = sum.monthly;
  return (
    <>
      <div className="fx-kpis">
        <div className="fx-kpi"><span>Total income</span><strong style={{ color: INCOME }}>{money(sum.total_income)}</strong></div>
        <div className="fx-kpi"><span>Total expense</span><strong style={{ color: EXPENSE }}>{money(sum.total_expense)}</strong></div>
        <div className="fx-kpi"><span>Net</span><strong style={{ color: sum.net >= 0 ? INCOME : EXPENSE }}>{money(sum.net)}</strong><small>{sum.entries} entries</small></div>
      </div>

      <div className="fx-grid">
        <section className="panel hr-panel fx-card">
          <div className="panel-head"><div><h3>Expenses by category</h3><p>Share of total operational expenses</p></div></div>
          {exp.filter((r: R) => Number(r.amount) > 0).length ? (
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
          ) : <div className="rp-empty">No expenses recorded for this selection.</div>}
        </section>

        <section className="panel hr-panel fx-card">
          <div className="panel-head"><div><h3>Income by category</h3><p>Share of total revenue stream across categories</p></div></div>
          {inc.filter((r: R) => Number(r.amount) > 0).length ? (
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
          ) : <div className="rp-empty">No income recorded for this selection.</div>}
        </section>
      </div>

      <section className="panel hr-panel fx-card">
        <div className="panel-head"><div><h3>Income vs expense by month</h3><p>Voided entries are excluded</p></div></div>
        {months.length ? (
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
        ) : <div className="rp-empty">No entries yet.</div>}
        {sum.campuses.length > 1 && (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>CAMPUS</th><th>INCOME</th><th>EXPENSE</th><th>NET</th></tr></thead>
            <tbody>{sum.campuses.map((c: R) => <tr key={c.id}><td>{c.name}</td><td>{money(c.income)}</td><td>{money(c.expense)}</td><td style={{ color: c.net >= 0 ? INCOME : EXPENSE, fontWeight: 700 }}>{money(c.net)}</td></tr>)}</tbody>
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

function Entries({ kind, school, schools, user, qs, bump, onChanged }: { kind: 'income' | 'expense'; school: string; schools: R[]; user: User; qs: string; bump: number; onChanged: (m: string) => void }) {
  const [rows, setRows] = useState<R[]>([]);
  const [cats, setCats] = useState<R[]>([]);
  const [f, setF] = useState<R>({ date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const target = school || f.school || (user.role !== 'organisation_admin' ? String(user.school || '') : '') || String(schools[0]?.id || '');

  const load = useCallback(async () => {
    try { setRows((await request<R>(`finance/entries/?kind=${kind}&${qs}`)).results); } catch { setRows([]); }
  }, [kind, qs]);
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
          </div>
        </div>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>DATE</th><th>CATEGORY</th><th>DESCRIPTION</th><th>CAMPUS</th><th>AMOUNT</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}><td>{r.date}</td><td>{r.category_name}</td><td>{r.description || '—'}</td><td>{r.school_name}</td><td style={{ color: kind === 'income' ? INCOME : EXPENSE, fontWeight: 700 }}>{money(Number(r.amount))}</td>
              <td>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button className="hr-mini danger" title="Delete entry" onClick={() => deleteIt(r)}><Trash2 size={13} /> Delete</button>
                  <button className="hr-mini" title="Void entry" onClick={() => voidIt(r)}><Ban size={13} /> Void</button>
                </div>
              </td></tr>
          ))}</tbody>
        </table></div>
        {!rows.length && <div className="rp-empty">Nothing recorded yet.</div>}
      </section>
    </>
  );
}

function Categories({ school, schools, user, onChanged }: { school: string; schools: R[]; user: User; onChanged: (m: string) => void }) {
  const [cats, setCats] = useState<R[]>([]);
  const [kind, setKind] = useState('expense'); const [name, setName] = useState(''); const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  const target = school || pick || (user.role !== 'organisation_admin' ? String(user.school || '') : '') || String(schools[0]?.id || '');
  const load = useCallback(async () => {
    try { setCats((await request<R>(`finance/categories/?school=${target}`)).results); } catch { setCats([]); }
  }, [target]);
  useEffect(() => { if (target) load(); }, [load, target]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    try { await request('finance/categories/', { method: 'POST', body: JSON.stringify({ school: target, kind, name }) }); setName(''); onChanged('Category added'); load(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); }
  };
  const patch = async (c: R, body: R, msg: string) => {
    try { await request(`finance/categories/${c.id}/`, { method: 'PATCH', body: JSON.stringify(body) }); onChanged(msg); load(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); }
  };
  const deleteCat = async (c: R) => {
    if (!window.confirm(`Permanently delete category "${c.name}"?`)) return;
    try {
      await request(`finance/categories/${c.id}/`, { method: 'DELETE' });
      onChanged('Category deleted');
      load();
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Failed to delete category');
    }
  };

  return (
    <>
      <section className="panel hr-panel fx-card">
        <div className="panel-head"><div><h3>Add a category</h3><p>Examples: Annual fees, Transport, Events</p></div></div>
        <form className="fx-form" onSubmit={add}>
          {!school && schools.length > 1 && <label>Campus<select className="fx-select" value={target} onChange={e => setPick(e.target.value)}>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
          <label>Type<select className="fx-select" value={kind} onChange={e => setKind(e.target.value)}><option value="income">Income</option><option value="expense">Expense</option></select></label>
          <label className="grow">Name<input className="fx-select" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
          <button className="primary-btn"><Plus size={15} /> Add category</button>
        </form>
        {err && <div className="hr-error" style={{ margin: '12px 0 0' }}>{err}</div>}
      </section>
      <div className="fx-grid">
        {(['income', 'expense'] as const).map(k => (
          <section key={k} className="panel hr-panel fx-card">
            <div className="panel-head"><div><h3>{k === 'income' ? 'Income categories' : 'Expense categories'}</h3><p>Hidden categories keep their history</p></div></div>
            <ul className="fx-cats">{cats.filter(c => c.kind === k).map(c => (
              <li key={c.id} className={c.active ? '' : 'off'}><span>{c.name}</span>
                <button className="hr-mini" onClick={() => { const n = window.prompt('Rename category', c.name); if (n && n.trim()) patch(c, { name: n.trim() }, 'Category renamed'); }}>Rename</button>
                <button className="hr-mini" onClick={() => patch(c, { active: !c.active }, c.active ? 'Category hidden' : 'Category restored')}>{c.active ? 'Hide' : 'Restore'}</button>
                <button className="hr-mini danger" title="Delete category" onClick={() => deleteCat(c)}><Trash2 size={13} /> Delete</button></li>
            ))}</ul>
          </section>
        ))}
      </div>
    </>
  );
}
