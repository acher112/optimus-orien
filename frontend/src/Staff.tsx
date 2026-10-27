import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, History, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, UserCog, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { list, request, type User } from './api';
import ExportMenu from './ExportMenu';
import { FilterBar } from './FilterBar';
import './hr.css';

type R = Record<string, any>;
type Action = { kind: 'add' } | { kind: 'promote' | 'role' | 'terminate' | 'history' | 'edit'; staff: R };
const nice = (s: string) => s.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const EVENT_TEXT: Record<string, string> = { hired: 'Hired', promoted: 'Promoted', role_changed: 'Role changed', terminated: 'Terminated', reinstated: 'Reinstated', updated: 'Updated' };

export default function Staff({ user, notify }: { user: User; notify: (m: string) => void }) {
  const [rows, setRows] = useState<R[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [summary, setSummary] = useState<R>({ total: 0, active: 0, terminated: 0 });
  const [schools, setSchools] = useState<R[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({ status: 'active' });
  const [error, setError] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [feed, setFeed] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const p = new URLSearchParams();
      if (filterValues.status) p.set('status', filterValues.status);
      if (filterValues.q?.trim()) p.set('q', filterValues.q.trim());
      const d = await request<R>(`staff/?${p.toString()}`);
      setRows(d.results); setSummary(d.summary); setRoles(d.roles);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load staff'); }
  }, [filterValues]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { list<R>('schools').then(setSchools).catch(() => {}); }, []);

  const leader = user.role === 'organisation_admin' || user.role === 'school_admin' || !!user.is_superuser;
  const done = (msg: string) => { setAction(null); notify(msg); load(); };
  const reinstate = async (s: R) => {
    try { await request(`staff/${s.id}/reinstate/`, { method: 'POST', body: '{}' }); notify(`${s.full_name} reinstated`); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };
  const deleteStaff = async (s: R) => {
    if (!window.confirm(`Permanently delete staff member "${s.full_name}"? This removes their record and history.`)) return;
    try {
      await request(`staff/${s.id}/`, { method: 'DELETE' });
      notify('Staff member deleted successfully');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">PEOPLE / STAFF</div>
          <h1>Staff directory</h1>
          <p>Add staff, promote them, assign roles or end employment. Every change is kept in the history.</p>
        </div>
        <div className="hr-actions">
          <button className="outline-btn" onClick={() => setFeed(f => !f)}><History size={16} /> {feed ? 'Hide' : 'Recent'} history</button>
          <button className="primary-btn" onClick={() => setAction({ kind: 'add' })}><UserPlus size={16} /> Add staff</button>
        </div>
      </div>

      <div className="hr-kpis">
        <div className="hr-kpi"><Users size={20} /><strong>{summary.total}</strong><span>Shown</span></div>
        <div className="hr-kpi"><ShieldCheck size={20} /><strong>{summary.active}</strong><span>Active</span></div>
        <div className="hr-kpi"><UserMinus size={20} /><strong>{summary.terminated}</strong><span>Terminated</span></div>
      </div>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}
      {feed && <HistoryFeed />}

      <section className="panel hr-panel">
        <div style={{ padding: '16px 20px 0 20px' }}>
          <FilterBar
            searchPlaceholder="Search staff name or position..."
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { label: 'Active', value: 'active' },
                  { label: 'Terminated', value: 'terminated' },
                ]
              }
            ]}
            values={filterValues}
            onChange={setFilterValues}
            onClear={() => setFilterValues({})}
          />
        </div>
        <div className="toolbar" style={{ paddingTop: 6 }}>
          <span className="result-count">{rows.length} staff members</span>
          <div className="toolbar-right">
            <ExportMenu
              title="Staff Directory"
              filename="staff-directory"
              endpoint={`staff/?${new URLSearchParams({ ...(filterValues.status ? { status: filterValues.status } : {}), ...(filterValues.q ? { q: filterValues.q } : {}) }).toString()}`}
              notify={notify}
            />
          </div>
        </div>
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>NAME</th><th>POSITION</th><th>ROLE</th><th>CAMPUS</th><th>HIRED</th><th>LOGIN</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>{rows.map(s => (
            <tr key={s.id}>
              <td><b className="hr-name">{s.full_name}</b></td><td>{s.position}</td><td>{nice(s.role)}</td><td>{s.school_name}</td><td>{s.hired_on}</td>
              <td>{s.has_login ? s.username : '—'}</td>
              <td><span className={'pill ' + (s.status === 'active' ? 'green' : 'red')}><i className="pill-dot" />{nice(s.status)}</span></td>
              <td className="hr-row-actions">
                <button className="hr-mini" title="Edit staff member" onClick={() => setAction({ kind: 'edit', staff: s })}><Pencil size={13} /> Edit</button>
                {s.status === 'active' ? <>
                  <button className="hr-mini" onClick={() => setAction({ kind: 'promote', staff: s })}><ArrowUpRight size={13} /> Promote</button>
                  <button className="hr-mini" onClick={() => setAction({ kind: 'role', staff: s })}><UserCog size={13} /> Role</button>
                  <button className="hr-mini danger" onClick={() => setAction({ kind: 'terminate', staff: s })}><UserMinus size={13} /> Fire</button>
                </> : <button className="hr-mini" onClick={() => reinstate(s)}><RotateCcw size={13} /> Reinstate</button>}
                <button className="hr-mini" onClick={() => setAction({ kind: 'history', staff: s })}><History size={13} /> History</button>
                <button className="hr-mini danger" title="Permanently delete staff member" onClick={() => deleteStaff(s)}><Trash2 size={13} /> Delete</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        {!rows.length && <div className="rp-empty">No staff match. Use “Add staff” to create the first record.</div>}
      </section>

      {action?.kind === 'add' && <AddStaff schools={schools} roles={roles} leader={leader} user={user} onClose={() => setAction(null)} onDone={() => done('Staff member added')} />}
      {action?.kind === 'promote' && <Promote s={action.staff} roles={roles} leader={leader} onClose={() => setAction(null)} onDone={() => done('Promotion saved')} />}
      {action?.kind === 'role' && <AssignRole s={action.staff} roles={roles} leader={leader} onClose={() => setAction(null)} onDone={() => done('Role updated')} />}
      {action?.kind === 'edit' && <EditStaff s={action.staff} roles={roles} leader={leader} onClose={() => setAction(null)} onDone={() => done('Staff record updated')} />}
      {action?.kind === 'terminate' && <Terminate s={action.staff} onClose={() => setAction(null)} onDone={() => done('Employment ended. Any login was switched off.')} />}
      {action?.kind === 'history' && <Timeline s={action.staff} onClose={() => setAction(null)} />}
    </>
  );
}

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><div className="modal-icon"><UserCog size={20} /></div><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div><button onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function useSubmit(path: string, onDone: () => void) {
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (body: R, method = 'POST') => {
    setBusy(true); setErr('');
    try { await request(path, { method, body: JSON.stringify(body) }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };
  return { err, busy, submit };
}

const roleOptions = (roles: string[], leader: boolean) => roles.filter(r => leader || (r !== 'principal' && r !== 'school_admin'));

function AddStaff({ schools, roles, leader, user, onClose, onDone }: { schools: R[]; roles: string[]; leader: boolean; user: User; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<R>({ school: user.school || schools[0]?.id || '', role: 'teacher', hired_on: new Date().toISOString().slice(0, 10) });
  const [logins, setLogins] = useState<R[]>([]);
  const { err, busy, submit } = useSubmit('staff/', onDone);
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!f.school) return;
    request<R>(`schools/${f.school}/users/`).then(d => setLogins((d.results || []).filter((u: R) => ['teacher', 'principal', 'school_admin'].includes(u.role)))).catch(() => setLogins([]));
  }, [f.school]);
  return (
    <Modal title="Add staff member" sub="Creates an employment record. A login can be linked now or later." onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit({ ...f, user: f.user || null }); }}>
        <div className="modal-fields hr-fields">
          <label>First name *<input required value={f.first_name || ''} onChange={e => set('first_name', e.target.value)} /></label>
          <label>Last name *<input required value={f.last_name || ''} onChange={e => set('last_name', e.target.value)} /></label>
          <label>Position *<input required placeholder="e.g. Maths Teacher" value={f.position || ''} onChange={e => set('position', e.target.value)} /></label>
          <label>Role<select value={f.role} onChange={e => set('role', e.target.value)}>{roleOptions(roles, leader).map(r => <option key={r} value={r}>{nice(r)}</option>)}</select></label>
          <label>Campus<select required value={f.school} onChange={e => set('school', e.target.value)}>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Hired on<input type="date" value={f.hired_on} onChange={e => set('hired_on', e.target.value)} /></label>
          <label>Email<input type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} /></label>
          <label>Phone<input value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></label>
          <label>Monthly base salary<input type="number" step="0.01" min="0" placeholder="e.g. 75000" value={f.salary || ''} onChange={e => set('salary', e.target.value)} /></label>
          <label className="wide">Link existing login (optional)<select value={f.user || ''} onChange={e => set('user', e.target.value)}><option value="">No login</option>{logins.map(u => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}</select></label>
          {Boolean(f.salary && Number(f.salary) > 0) && (
            <div className="wide" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 4 }}>
              <label style={{ margin: 0 }}>
                Initial Salary Status
                <select
                  value={f.salary_status || 'pending'}
                  onChange={e => set('salary_status', e.target.value)}
                >
                  <option value="pending">Pending (Unpaid)</option>
                  <option value="paid">Paid (Disburse Now)</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label style={{ margin: 0 }}>
                Disbursement Due Date
                <input
                  type="date"
                  value={f.salary_due_date || f.hired_on}
                  onChange={e => set('salary_due_date', e.target.value)}
                />
              </label>
              {f.salary_status === 'paid' && (
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#166534', background: '#dcfce7', padding: '6px 10px', borderRadius: 6 }}>
                  Marking as Paid will post an expense directly to Finance categorized by role (Teacher Salary, Principal Salary, etc.).
                </div>
              )}
            </div>
          )}
        </div>
        {err && <div className="hr-error">{err}</div>}
        <div className="modal-footer"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}><Plus size={15} /> {busy ? 'Saving…' : 'Add staff'}</button></div>
      </form>
    </Modal>
  );
}

function Promote({ s, roles, leader, onClose, onDone }: { s: R; roles: string[]; leader: boolean; onClose: () => void; onDone: () => void }) {
  const [pos, setPos] = useState(''); const [role, setRole] = useState(''); const [note, setNote] = useState('');
  const { err, busy, submit } = useSubmit(`staff/${s.id}/promote/`, onDone);
  return (
    <Modal title={`Promote ${s.full_name}`} sub={`Currently ${s.position} (${nice(s.role)})`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit({ new_position: pos, new_role: role, note }); }}>
        <div className="modal-fields hr-fields">
          <label className="wide">New position *<input required value={pos} onChange={e => setPos(e.target.value)} placeholder="e.g. Head of Maths" /></label>
          <label className="wide">New role (optional)<select value={role} onChange={e => setRole(e.target.value)}><option value="">Keep {nice(s.role)}</option>{roleOptions(roles, leader).filter(r => r !== s.role).map(r => <option key={r} value={r}>{nice(r)}</option>)}</select></label>
          <label className="wide">Note<input value={note} onChange={e => setNote(e.target.value)} /></label>
        </div>
        {err && <div className="hr-error">{err}</div>}
        <div className="modal-footer"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Promote'}</button></div>
      </form>
    </Modal>
  );
}

function AssignRole({ s, roles, leader, onClose, onDone }: { s: R; roles: string[]; leader: boolean; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState(''); const [note, setNote] = useState('');
  const { err, busy, submit } = useSubmit(`staff/${s.id}/assign-role/`, onDone);
  return (
    <Modal title={`Assign role to ${s.full_name}`} sub={`Current role: ${nice(s.role)}${s.has_login ? ' · their login role is updated too' : ''}`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit({ role, note }); }}>
        <div className="modal-fields hr-fields">
          <label className="wide">Role *<select required value={role} onChange={e => setRole(e.target.value)}><option value="">Choose a role…</option>{roleOptions(roles, leader).filter(r => r !== s.role).map(r => <option key={r} value={r}>{nice(r)}</option>)}</select></label>
          <label className="wide">Note<input value={note} onChange={e => setNote(e.target.value)} /></label>
        </div>
        {!leader && <div className="hr-hint">Only organisation or school administrators can grant principal or school admin.</div>}
        {err && <div className="hr-error">{err}</div>}
        <div className="modal-footer"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy || !role}>{busy ? 'Saving…' : 'Assign role'}</button></div>
      </form>
    </Modal>
  );
}

function Terminate({ s, onClose, onDone }: { s: R; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const { err, busy, submit } = useSubmit(`staff/${s.id}/terminate/`, onDone);
  return (
    <Modal title={`End employment: ${s.full_name}`} sub="The record is kept. Any linked login stops working immediately." onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit({ reason }); }}>
        <div className="modal-fields hr-fields"><label className="wide">Reason (optional)<input value={reason} onChange={e => setReason(e.target.value)} /></label></div>
        {err && <div className="hr-error">{err}</div>}
        <div className="modal-footer"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn hr-danger" disabled={busy}>{busy ? 'Saving…' : 'End employment'}</button></div>
      </form>
    </Modal>
  );
}

function EventList({ events }: { events: R[] }) {
  if (!events.length) return <div className="rp-empty">No history yet.</div>;
  return (
    <ul className="hr-timeline">{events.map(e => (
      <li key={e.id}>
        <b>{EVENT_TEXT[e.kind] || e.kind}</b>
        {(e.from_value || e.to_value) && <span> {e.from_value ? `${e.from_value} → ` : ''}{e.to_value}</span>}
        {e.staff_name && <span className="hr-who"> · {e.staff_name}</span>}
        {e.note && <em> — {e.note}</em>}
        <small>{new Date(e.created_at).toLocaleString()}{e.actor ? ` · by ${e.actor}` : ''}</small>
      </li>
    ))}</ul>
  );
}

function Timeline({ s, onClose }: { s: R; onClose: () => void }) {
  const [events, setEvents] = useState<R[]>([]);
  useEffect(() => { request<R>(`staff/${s.id}/`).then(d => setEvents(d.history)).catch(() => {}); }, [s.id]);
  return <Modal title={`${s.full_name} · history`} sub="Newest first" onClose={onClose}><div className="hr-scroll"><EventList events={events} /></div></Modal>;
}

function HistoryFeed() {
  const [events, setEvents] = useState<R[]>([]);
  useEffect(() => { request<R>('staff/history/').then(d => setEvents(d.results)).catch(() => {}); }, []);
  const top = useMemo(() => events.slice(0, 12), [events]);
  return <section className="panel hr-panel hr-feed"><div className="panel-head"><div><h3>Recent staff changes</h3><p>Hires, promotions, role changes and terminations</p></div></div><EventList events={top} /></section>;
}

function EditStaff({ s, roles, leader, onClose, onDone }: { s: R; roles: string[]; leader: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<R>({
    first_name: s.first_name || '',
    last_name: s.last_name || '',
    position: s.position || '',
    role: s.role || 'teacher',
    hired_on: s.hired_on || '',
    email: s.email || '',
    phone: s.phone || '',
  });
  const { err, busy, submit } = useSubmit(`staff/${s.id}/`, onDone);
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));

  return (
    <Modal title={`Edit ${s.full_name}`} sub="Update staff position, details or contact information." onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit(f, 'PATCH'); }}>
        <div className="modal-fields hr-fields">
          <label>First name *<input required value={f.first_name} onChange={e => set('first_name', e.target.value)} /></label>
          <label>Last name *<input required value={f.last_name} onChange={e => set('last_name', e.target.value)} /></label>
          <label>Position *<input required placeholder="e.g. Lead Educator" value={f.position} onChange={e => set('position', e.target.value)} /></label>
          <label>Role<select value={f.role} onChange={e => set('role', e.target.value)}>{roleOptions(roles, leader).map(r => <option key={r} value={r}>{nice(r)}</option>)}</select></label>
          <label>Hired on<input type="date" value={f.hired_on} onChange={e => set('hired_on', e.target.value)} /></label>
          <label>Email<input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></label>
          <label>Phone<input value={f.phone} onChange={e => set('phone', e.target.value)} /></label>
        </div>
        {err && <div className="hr-error" style={{ margin: '14px 0 0' }}>{err}</div>}
        <div className="modal-footer hr-modal-foot">
          <button type="button" className="outline-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}
