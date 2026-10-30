import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, CalendarDays, History, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, UserCog, UserMinus, UserPlus, Users, X, BookOpen, KeyRound, Copy, Check } from 'lucide-react';
import { list, request, type User } from './api';
import ExportMenu from './ExportMenu';
import { FilterBar } from './FilterBar';
import PasswordField from './PasswordField';
import StaffAttendanceRegister from './StaffAttendanceRegister';
import './hr.css';

type R = Record<string, any>;
type Action = { kind: 'add' } | { kind: 'promote' | 'role' | 'terminate' | 'history' | 'edit' | 'assignments'; staff: R };
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
  const [viewTab, setViewTab] = useState<'directory' | 'attendance'>('directory');

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
          <button className={`outline-btn ${viewTab === 'attendance' ? 'active' : ''}`} onClick={() => setViewTab(t => t === 'attendance' ? 'directory' : 'attendance')}>
            <CalendarDays size={16} /> {viewTab === 'attendance' ? 'Directory list' : 'Staff attendance'}
          </button>
          <button className="outline-btn" onClick={() => setFeed(f => !f)}><History size={16} /> {feed ? 'Hide' : 'Recent'} history</button>
          <button className="primary-btn" onClick={() => setAction({ kind: 'add' })}><UserPlus size={16} /> Add staff</button>
        </div>
      </div>

      {viewTab === 'attendance' ? (
        <StaffAttendanceRegister user={user} notify={notify} />
      ) : (
        <>
          <div className="hr-kpis">
            <div className="hr-kpi"><Users size={20} /><strong>{summary.total}</strong><span>Shown</span></div>
            <div className="hr-kpi"><ShieldCheck size={20} /><strong>{summary.active}</strong><span>Active</span></div>
            <div className="hr-kpi"><UserMinus size={20} /><strong>{summary.terminated}</strong><span>Terminated</span></div>
          </div>

          {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}
          {feed && <HistoryFeed />}

          <section className="panel hr-panel">
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
          rightActions={
            <>
              <span className="result-count">{rows.length} staff members</span>
              <ExportMenu
                title="Staff Directory"
                filename="staff-directory"
                endpoint={`staff/?${new URLSearchParams({ ...(filterValues.status ? { status: filterValues.status } : {}), ...(filterValues.q ? { q: filterValues.q } : {}) }).toString()}`}
                notify={notify}
              />
            </>
          }
        />
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
                  {leader && <button className="hr-mini" onClick={() => setAction({ kind: 'promote', staff: s })}><ArrowUpRight size={13} /> Promote</button>}
                  {leader && <button className="hr-mini" onClick={() => setAction({ kind: 'role', staff: s })}><UserCog size={13} /> Role</button>}
                  {leader && <button className="hr-mini danger" onClick={() => setAction({ kind: 'terminate', staff: s })}><UserMinus size={13} /> Fire</button>}
                </> : (leader ? <button className="hr-mini" onClick={() => reinstate(s)}><RotateCcw size={13} /> Reinstate</button> : null)}
                {s.role === 'teacher' && <button className="hr-mini" title="Teaching assignments" onClick={() => setAction({ kind: 'assignments', staff: s })}><BookOpen size={13} /> Assignments</button>}
                <button className="hr-mini" onClick={() => setAction({ kind: 'history', staff: s })}><History size={13} /> History</button>
                {leader && <button className="hr-mini danger" title="Permanently delete staff member" onClick={() => deleteStaff(s)}><Trash2 size={13} /> Delete</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        {!rows.length && <div className="rp-empty">No staff match. Use “Add staff” to create the first record.</div>}
      </section>
      </>
      )}

      {action?.kind === 'add' && <AddStaff schools={schools} roles={roles} leader={leader} user={user} onClose={() => setAction(null)} onDone={() => done('Staff member added')} />}
      {action?.kind === 'promote' && <Promote s={action.staff} roles={roles} leader={leader} onClose={() => setAction(null)} onDone={() => done('Promotion saved')} />}
      {action?.kind === 'role' && <AssignRole s={action.staff} roles={roles} leader={leader} onClose={() => setAction(null)} onDone={() => done('Role updated')} />}
      {action?.kind === 'edit' && <EditStaff s={action.staff} roles={roles} leader={leader} onClose={() => setAction(null)} onDone={() => done('Staff record updated')} />}
      {action?.kind === 'terminate' && <Terminate s={action.staff} onClose={() => setAction(null)} onDone={() => done('Employment ended. Any login was switched off.')} />}
      {action?.kind === 'history' && <Timeline s={action.staff} onClose={() => setAction(null)} />}
      {action?.kind === 'assignments' && <TeachingAssignmentsModal s={action.staff} user={user} onClose={() => setAction(null)} onDone={() => done('Assignments updated')} />}
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

const roleOptions = (roles: string[], leader: boolean) => {
  const filtered = roles.filter(r => leader || (r !== 'principal' && r !== 'school_admin'));
  if (!filtered.includes('additional')) filtered.push('additional');
  return filtered;
};

function AddStaff({ schools, roles, leader, user, onClose, onDone }: { schools: R[]; roles: string[]; leader: boolean; user: User; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<R>({
    school: user.school || schools[0]?.id || '',
    role: 'teacher',
    teacher_type: 'class_teacher',
    hired_on: new Date().toISOString().slice(0, 10),
    email: '',
    first_name: '',
    last_name: '',
    position: 'Teacher',
    salary: '50000',
    salary_status: 'pending',
    class_teacher_class: '',
    replace_existing: false,
    effective_date: new Date().toISOString().slice(0, 10),
    assign_later: false,
    subject_assignments: [{ class_id: '', subject_id: '' }],
    password: '',
    set_temporary_password: false,
    temporary_password: ''
  });

  const [classes, setClasses] = useState<R[]>([]);
  const [subjects, setSubjects] = useState<R[]>([]);
  const [createdCreds, setCreatedCreds] = useState<{ temp_pwd?: string; invite_url?: string } | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (f.school) {
      list<R>('classes', { school: f.school }).then(setClasses).catch(() => {});
      list<R>('subjects', { school: f.school }).then(setSubjects).catch(() => {});
    }
  }, [f.school]);

  useEffect(() => {
    if (f.role === 'teacher' && ['class_teacher', 'both'].includes(f.teacher_type) && f.class_teacher_class) {
      const tc = classes.find(c => String(c.id) === String(f.class_teacher_class));
      if (tc?.teacher_name && tc.teacher_name !== 'Unassigned') {
        setConflictWarning(`Class already has an active class teacher: ${tc.teacher_name}.`);
      } else {
        setConflictWarning(null);
      }
    } else {
      setConflictWarning(null);
    }
  }, [f.class_teacher_class, f.teacher_type, f.role, classes]);

  const set = (k: string, v: any) => setF(prev => ({ ...prev, [k]: v }));

  const addSubjectRow = () => {
    setF(prev => ({
      ...prev,
      subject_assignments: [...(prev.subject_assignments || []), { class_id: '', subject_id: '' }]
    }));
  };

  const removeSubjectRow = (idx: number) => {
    setF(prev => ({
      ...prev,
      subject_assignments: prev.subject_assignments.filter((_: any, i: number) => i !== idx)
    }));
  };

  const updateSubjectRow = (idx: number, key: string, val: string) => {
    setF(prev => {
      const rows = [...(prev.subject_assignments || [])];
      rows[idx] = { ...rows[idx], [key]: val };
      return { ...prev, subject_assignments: rows };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const payload: R = { ...f };
      if (f.role === 'teacher') {
        if (f.teacher_type === 'class_teacher') {
          delete payload.subject_assignments;
        } else if (f.teacher_type === 'subject_teacher') {
          delete payload.class_teacher_class;
        }
        if (f.assign_later) {
          payload.subject_assignments = [];
        }
      }
      const res: any = await request('staff/', { method: 'POST', body: JSON.stringify(payload) });
      if (res?.temporary_password || res?.invitation_token || res?.invite_url) {
        setCreatedCreds({
          temp_pwd: res.temporary_password,
          invite_url: res.invite_url || (res.invitation_token ? `/invitation/accept?token=${res.invitation_token}` : undefined)
        });
      } else {
        onDone();
      }
    } catch (e: any) {
      setErr(e instanceof Error ? e.message : 'Failed to add staff member.');
    } finally {
      setBusy(false);
    }
  };

  if (createdCreds) {
    return (
      <Modal title="Staff Login Credentials Generated" sub="Share these credentials securely with the staff member." onClose={onDone}>
        <div style={{ padding: '16px 0' }}>
          {createdCreds.temp_pwd ? (
            <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '10px', border: '1px solid #fde68a', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                Portal Credentials Configured:
              </div>
              <div style={{ fontSize: '12px', color: '#78350f', marginBottom: '8px' }}>
                Sign-in Email: <strong>{f.email}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <code style={{ fontSize: '16px', fontWeight: 700, background: '#fff', padding: '6px 12px', borderRadius: '6px', border: '1px solid #fcd34d', color: '#b45309' }}>
                  {createdCreds.temp_pwd}
                </code>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(`Email: ${f.email}\nPassword: ${createdCreds.temp_pwd}`); setCopied(true); }}
                  className="outline-btn"
                  style={{ padding: '6px 10px' }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p style={{ fontSize: '12px', color: '#b45309', margin: '8px 0 0' }}>
                The staff member can now sign in immediately to their portal with this email and password, and change their password anytime via profile settings or email reset.
              </p>
            </div>
          ) : (
            <div style={{ background: '#ede9fe', padding: '16px', borderRadius: '10px', border: '1px solid #ddd6fe', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#5b21b6', marginBottom: '6px' }}>
                Secure Invitation Link (Single-use, 72h expiry):
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  readOnly
                  value={window.location.origin + (createdCreds.invite_url || '')}
                  style={{ flex: 1, padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #c4b5fd', background: '#fff' }}
                />
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(window.location.origin + (createdCreds.invite_url || '')); setCopied(true); }}
                  className="outline-btn"
                  style={{ padding: '6px 10px' }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          <div className="modal-footer" style={{ marginTop: '20px' }}>
            <button type="button" className="primary-btn" onClick={onDone}>Done</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add staff member" sub="Creates an HR employment record, portal login, and academic assignments." onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-fields hr-fields">
          <label>First name *<input required value={f.first_name || ''} onChange={e => set('first_name', e.target.value)} placeholder="e.g. Ayesha" /></label>
          <label>Last name *<input required value={f.last_name || ''} onChange={e => set('last_name', e.target.value)} placeholder="e.g. Khan" /></label>
          <label>Role *
            <select value={f.role} onChange={e => {
              const val = e.target.value;
              set('role', val);
              if (val === 'teacher') set('position', 'Teacher');
              else if (val === 'principal') set('position', 'Campus Principal');
            }}>
              {roleOptions(roles, leader).map(r => <option key={r} value={r}>{nice(r)}</option>)}
            </select>
          </label>
          <label>Position / Job title *<input required placeholder="e.g. Maths Teacher" value={f.position || ''} onChange={e => set('position', e.target.value)} /></label>
          <label>Campus *<select required value={f.school} onChange={e => set('school', e.target.value)}>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Hired on<input type="date" value={f.hired_on} onChange={e => set('hired_on', e.target.value)} /></label>
          <label>Email (portal login) *<input required type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} placeholder="portal-user@school.edu" /></label>
          <label>Password (portal login) *
            <PasswordField
              required
              minLength={8}
              value={f.password || ''}
              onChange={e => set('password', e.target.value)}
              placeholder="Min 8 chars"
            />
          </label>
          <label>Phone<input value={f.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="e.g. +92 300 1234567" /></label>

          {/* TEACHER SPECIFIC ASSIGNMENTS */}
          {f.role === 'teacher' && (
            <div className="wide" style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginTop: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                Teacher Type & Assignments *
              </div>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '14px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 500, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="radio"
                    name="teacher_type"
                    value="class_teacher"
                    checked={f.teacher_type === 'class_teacher'}
                    onChange={() => set('teacher_type', 'class_teacher')}
                  />
                  Class Teacher
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 500, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="radio"
                    name="teacher_type"
                    value="subject_teacher"
                    checked={f.teacher_type === 'subject_teacher'}
                    onChange={() => set('teacher_type', 'subject_teacher')}
                  />
                  Subject Teacher
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 500, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="radio"
                    name="teacher_type"
                    value="both"
                    checked={f.teacher_type === 'both'}
                    onChange={() => set('teacher_type', 'both')}
                  />
                  Both (Class + Subjects)
                </label>
              </div>

              {/* Class teacher class selection */}
              {['class_teacher', 'both'].includes(f.teacher_type) && (
                <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Assigned Homeroom Class *
                    <select
                      required
                      value={f.class_teacher_class || ''}
                      onChange={e => set('class_teacher_class', e.target.value)}
                      style={{ marginTop: '4px' }}
                    >
                      <option value="">-- Choose Homeroom Class --</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.display_name} {c.teacher_name && c.teacher_name !== 'Unassigned' ? `(Current: ${c.teacher_name})` : '(No lead)'}
                        </option>
                      ))}
                    </select>
                  </label>

                  {conflictWarning && (
                    <div style={{ background: '#fffbeb', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fef3c7', marginTop: '8px' }}>
                      <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 500 }}>
                        {conflictWarning}
                      </div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#92400e', marginTop: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={f.replace_existing || false}
                          onChange={e => set('replace_existing', e.target.checked)}
                        />
                        Replace existing class teacher
                      </label>
                      {f.replace_existing && (
                        <div style={{ marginTop: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#6b7280' }}>Effective Date: </span>
                          <input
                            type="date"
                            value={f.effective_date || f.hired_on}
                            onChange={e => set('effective_date', e.target.value)}
                            style={{ fontSize: '12px', padding: '3px 8px' }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Subject teacher assignments */}
              {['subject_teacher', 'both'].includes(f.teacher_type) && (
                <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                      Subject Teaching Assignments
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={f.assign_later || false}
                        onChange={e => set('assign_later', e.target.checked)}
                      />
                      Assign later
                    </label>
                  </div>

                  {!f.assign_later && (
                    <div>
                      {(f.subject_assignments || []).map((row: any, idx: number) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                          <select
                            required={!f.assign_later}
                            value={row.class_id || ''}
                            onChange={e => updateSubjectRow(idx, 'class_id', e.target.value)}
                            style={{ fontSize: '12px' }}
                          >
                            <option value="">-- Class --</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                          </select>

                          <select
                            required={!f.assign_later}
                            value={row.subject_id || ''}
                            onChange={e => updateSubjectRow(idx, 'subject_id', e.target.value)}
                            style={{ fontSize: '12px' }}
                          >
                            <option value="">-- Subject --</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                          </select>

                          <button
                            type="button"
                            onClick={() => removeSubjectRow(idx)}
                            disabled={(f.subject_assignments || []).length <= 1}
                            style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addSubjectRow}
                        style={{ border: 'none', background: 'none', color: '#7862d7', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                      >
                        + Add another class & subject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PORTAL ACCESS NOTICE */}
          <div className="wide" style={{ background: '#f0fdf4', padding: '12px 14px', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '12px', color: '#166534', display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '6px' }}>
            <KeyRound size={16} style={{ marginTop: '2px', flexShrink: 0, color: '#16a34a' }} />
            <div>
              <strong>Portal Sign-in Setup:</strong> These credentials allow the {f.role ? nice(f.role) : 'staff member'} to log directly into their portal immediately upon creation. They can change their password at any time via Profile Settings or reset it using their registered email.
            </div>
          </div>

          <label>Monthly base salary *<input required type="number" step="0.01" min="1" placeholder="e.g. 50000" value={f.salary || ''} onChange={e => set('salary', e.target.value)} /></label>
        </div>

        {err && <div className="hr-error" style={{ margin: '14px 0 0' }}>{err}</div>}
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


function TeachingAssignmentsModal({ s, user, onClose, onDone }: { s: R; user: User; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<R | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [addMode, setAddMode] = useState<'none' | 'class_teacher' | 'subject'>('none');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubj, setSelectedSubj] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request<R>(`staff/${s.id}/assignments/`);
      setData(res);
    } catch (e: any) {
      setErr(e.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [s.id]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await request(`staff/${s.id}/assignments/`, {
        method: 'POST',
        body: JSON.stringify({
          kind: addMode,
          class_id: selectedClass,
          subject_id: selectedSubj,
          start_date: effectiveDate,
          replace_existing: replaceExisting
        })
      });
      setAddMode('none');
      setSelectedClass('');
      setSelectedSubj('');
      setReplaceExisting(false);
      loadAssignments();
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Failed to add assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async (assignmentId: number, kind: 'class_teacher' | 'subject') => {
    const end_date = prompt('Enter effective end date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!end_date) return;
    try {
      await request(`staff/${s.id}/assignments/${assignmentId}/end/`, {
        method: 'POST',
        body: JSON.stringify({ kind, end_date })
      });
      loadAssignments();
      onDone();
    } catch (e: any) {
      alert(e.message || 'Failed to end assignment');
    }
  };

  return (
    <Modal title={`Teaching Assignments — ${s.full_name}`} sub={`Teacher type: ${nice(data?.teacher_type || s.teacher_type || 'unassigned')}`} onClose={onClose}>
      <div style={{ padding: '4px 0' }}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Loading assignments...</div>
        ) : (
          <div>
            {err && <div className="hr-error" style={{ marginBottom: '14px' }}>{err}</div>}

            {/* Active Class Teacher Assignments */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>
                  Homeroom Class Teacher Assignment
                </h4>
                {(!data?.active_class_assignments || data.active_class_assignments.length === 0) && addMode === 'none' && (
                  <button
                    type="button"
                    onClick={() => { setAddMode('class_teacher'); setErr(''); }}
                    style={{ border: 'none', background: 'none', color: '#7862d7', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Assign Homeroom Class
                  </button>
                )}
              </div>

              {(!data?.active_class_assignments || data.active_class_assignments.length === 0) ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px' }}>
                  No active homeroom class assignment.
                </div>
              ) : (
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  {data.active_class_assignments.map((a: any) => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{a.class_name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Since {a.start_date}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnd(a.id, 'class_teacher')}
                        className="outline-btn"
                        style={{ padding: '4px 10px', fontSize: '12px', color: '#dc2626' }}
                      >
                        End assignment
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Subject Assignments */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', margin: 0 }}>
                  Subject Teaching Assignments
                </h4>
                {addMode === 'none' && (
                  <button
                    type="button"
                    onClick={() => { setAddMode('subject'); setErr(''); }}
                    style={{ border: 'none', background: 'none', color: '#7862d7', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Add Subject Class
                  </button>
                )}
              </div>

              {(!data?.active_subject_assignments || data.active_subject_assignments.length === 0) ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px' }}>
                  No active subject assignments.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.active_subject_assignments.map((a: any) => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>{a.subject_name}</span>
                        <span style={{ color: '#64748b', fontSize: '13px', marginLeft: '6px' }}>— {a.class_name}</span>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Since {a.start_date}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnd(a.id, 'subject')}
                        className="outline-btn"
                        style={{ padding: '4px 10px', fontSize: '12px', color: '#dc2626' }}
                      >
                        End
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Assignment Form */}
            {addMode !== 'none' && (
              <form onSubmit={handleAdd} style={{ background: '#f1f5f9', padding: '14px', borderRadius: '10px', border: '1px solid #cbd5e1', marginBottom: '20px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b', marginBottom: '8px' }}>
                  {addMode === 'class_teacher' ? 'Assign New Class Teacher Role' : 'Assign New Subject Class'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: addMode === 'subject' ? '1fr 1fr' : '1fr', gap: '8px', marginBottom: '8px' }}>
                  <label style={{ margin: 0, fontSize: '12px' }}>
                    Class *
                    <select required value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                      <option value="">-- Choose Class --</option>
                      {(data?.available_classes || []).map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.current_teacher ? `(Lead: ${c.current_teacher})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  {addMode === 'subject' && (
                    <label style={{ margin: 0, fontSize: '12px' }}>
                      Subject *
                      <select required value={selectedSubj} onChange={e => setSelectedSubj(e.target.value)}>
                        <option value="">-- Choose Subject --</option>
                        {(data?.available_subjects || []).map((sub: any) => (
                          <option key={sub.id} value={sub.id}>{sub.name} ({sub.code})</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ margin: 0, fontSize: '12px' }}>
                    Effective Date:
                    <input
                      type="date"
                      value={effectiveDate}
                      onChange={e => setEffectiveDate(e.target.value)}
                      style={{ marginLeft: '6px', fontSize: '12px', padding: '4px 8px' }}
                    />
                  </label>
                  {addMode === 'class_teacher' && (
                    <label style={{ margin: 0, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={replaceExisting}
                        onChange={e => setReplaceExisting(e.target.checked)}
                      />
                      Replace existing lead teacher
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" className="outline-btn" onClick={() => setAddMode('none')} style={{ padding: '5px 12px', fontSize: '12px' }}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={saving} style={{ padding: '5px 12px', fontSize: '12px' }}>
                    {saving ? 'Saving...' : 'Confirm Assignment'}
                  </button>
                </div>
              </form>
            )}

            {/* Historical Assignments */}
            {((data?.historical_class_assignments && data.historical_class_assignments.length > 0) ||
              (data?.historical_subject_assignments && data.historical_subject_assignments.length > 0)) && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                  Historical Assignments
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                  {(data.historical_class_assignments || []).map((h: any) => (
                    <div key={h.id}>
                      Class Teacher — {h.class_name} ({h.start_date} to {h.end_date})
                    </div>
                  ))}
                  {(data.historical_subject_assignments || []).map((h: any) => (
                    <div key={h.id}>
                      Subject Teacher — {h.subject_name}, {h.class_name} ({h.start_date} to {h.end_date})
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: '20px' }}>
          <button type="button" className="primary-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
