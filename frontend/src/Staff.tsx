import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, CalendarDays, History, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, UserCog, UserMinus, UserPlus, Users, X, BookOpen, KeyRound, Copy, Check, Eye, EyeOff, RefreshCw, GraduationCap } from 'lucide-react';
import AttendanceCalendarModal, { CalendarTarget } from './AttendanceCalendarModal';
import { list, request, type User } from './api';
import ExportMenu from './ExportMenu';
import { FilterBar } from './FilterBar';
import PasswordField from './PasswordField';
import StaffAttendanceRegister from './StaffAttendanceRegister';
import { UserProfileView, type UserProfileData } from './UserProfileView';
import './hr.css';

type R = Record<string, any>;
type Action = { kind: 'add' } | { kind: 'promote' | 'role' | 'terminate' | 'history' | 'edit' | 'assignments' | 'profile'; staff: R };
const nice = (s: string) => s.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const EVENT_TEXT: Record<string, string> = { hired: 'Hired', promoted: 'Promoted', role_changed: 'Role changed', terminated: 'Terminated', reinstated: 'Reinstated', updated: 'Updated' };

function formatDisplayDate(val?: string | null): string {
  if (!val) return '—';
  try {
    const d = new Date(val.includes('T') ? val : `${val}T00:00:00`);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  } catch {
    return val;
  }
  return String(val);
}

export default function Staff({
  user,
  notify,
  activeCampusId,
  campuses = []
}: {
  user: User;
  notify: (m: string) => void;
  activeCampusId?: number | null;
  campuses?: Array<{ id: number; name: string }>;
}) {
  const [rows, setRows] = useState<R[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [summary, setSummary] = useState<R>({ total: 0, active: 0, terminated: 0 });
  const [schools, setSchools] = useState<R[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, any>>(() => (
    activeCampusId ? { status: 'active', school: String(activeCampusId) } : { status: 'active' }
  ));
  const [error, setError] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [feed, setFeed] = useState(false);
  const [viewTab, setViewTab] = useState<'directory' | 'attendance'>('directory');
  const [calendarTarget, setCalendarTarget] = useState<CalendarTarget | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (activeCampusId) {
      setFilterValues(prev => ({ ...prev, school: String(activeCampusId) }));
    } else {
      setFilterValues(prev => {
        const next = { ...prev };
        delete next.school;
        return next;
      });
    }
  }, [activeCampusId]);

  const load = useCallback(async () => {
    setError('');
    try {
      const p = new URLSearchParams();
      if (filterValues.status) p.set('status', filterValues.status);
      if (filterValues.q?.trim()) p.set('q', filterValues.q.trim());
      const sc = filterValues.school || (activeCampusId ? String(activeCampusId) : '');
      if (sc) p.set('school', sc);
      if (filterValues.role) p.set('role', filterValues.role);
      const d = await request<R>(`staff/?${p.toString()}`);
      setRows(d.results); setSummary(d.summary); setRoles(d.roles);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load staff'); }
  }, [filterValues, activeCampusId]);
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
    setDeletingId(s.id);
    const prevRows = rows;
    setRows(prev => prev.filter(r => r.id !== s.id));
    try {
      await request(`staff/${s.id}/`, { method: 'DELETE' });
      notify('Staff member deleted successfully');
      load();
    } catch (e) {
      setRows(prevRows);
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
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
        <StaffAttendanceRegister user={user} notify={notify} activeCampusId={activeCampusId} campuses={campuses} />
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
            },
            ...((campuses.length > 1 || schools.length > 1) ? [{
              key: 'school',
              label: 'Campus',
              options: (campuses.length ? campuses : schools).map(s => ({ label: s.name, value: String(s.id) }))
            }] : []),
            ...(roles.length > 0 ? [{
              key: 'role',
              label: 'Role',
              options: roles.map(r => ({ label: nice(r), value: r }))
            }] : [])
          ]}
          values={filterValues}
          onChange={setFilterValues}
          onClear={() => setFilterValues(activeCampusId ? { status: 'active', school: String(activeCampusId) } : { status: 'active' })}
          rightActions={
            <>
              <span className="result-count">{rows.length} staff members</span>
              <ExportMenu
                title="Staff Directory"
                filename="staff-directory"
                endpoint={`staff/?${new URLSearchParams({
                  ...(filterValues.status ? { status: filterValues.status } : {}),
                  ...(filterValues.q ? { q: filterValues.q } : {}),
                  ...(filterValues.school || activeCampusId ? { school: String(filterValues.school || activeCampusId) } : {}),
                  ...(filterValues.role ? { role: filterValues.role } : {})
                }).toString()}`}
                notify={notify}
              />
            </>
          }
        />
        <div className="table-scroll"><table className="data-table">
          <thead><tr><th>NAME</th><th>POSITION</th><th>ROLE</th><th>CAMPUS</th><th>HIRED</th><th>LOGIN</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>{rows.map(s => (
            <tr key={s.id}>
              <td>
                <b
                  className="hr-name"
                  style={{ cursor: 'pointer', color: 'var(--primary-color, #4338ca)' }}
                  title="Click to view 360° Profile"
                  onClick={() => setAction({ kind: 'profile', staff: s })}
                >
                  {s.full_name}
                </b>
              </td>
              <td>{s.position}</td><td>{nice(s.role)}</td><td>{s.school_name}</td><td>{s.hired_on}</td>
              <td>{s.has_login ? s.username : '—'}</td>
              <td><span className={'pill ' + (s.status === 'active' ? 'green' : 'red')}><i className="pill-dot" />{nice(s.status)}</span></td>
              <td className="hr-row-actions">
                <button className="hr-mini" title="View 360° Profile" onClick={() => setAction({ kind: 'profile', staff: s })}><GraduationCap size={13} /> Profile</button>
                <button className="hr-mini" title="Edit staff member" onClick={() => setAction({ kind: 'edit', staff: s })}><Pencil size={13} /> Edit</button>
                {s.status === 'active' ? <>
                  {leader && <button className="hr-mini" onClick={() => setAction({ kind: 'promote', staff: s })}><ArrowUpRight size={13} /> Promote</button>}
                  {leader && <button className="hr-mini" onClick={() => setAction({ kind: 'role', staff: s })}><UserCog size={13} /> Role</button>}
                  {leader && <button className="hr-mini danger" onClick={() => setAction({ kind: 'terminate', staff: s })}><UserMinus size={13} /> Fire</button>}
                </> : (leader ? <button className="hr-mini" onClick={() => reinstate(s)}><RotateCcw size={13} /> Reinstate</button> : null)}
                {s.role === 'teacher' && <button className="hr-mini" title="Teaching assignments" onClick={() => setAction({ kind: 'assignments', staff: s })}><BookOpen size={13} /> Assignments</button>}
                <button className="hr-mini" title="View attendance calendar" onClick={() => setCalendarTarget({ id: s.id, name: s.full_name, type: 'staff', roleOrClass: `${s.position || 'Staff'} (${nice(s.role)})`, emailOrRoll: s.email, campusName: s.school_name })}><CalendarDays size={13} /> Attendance</button>
                <button className="hr-mini" onClick={() => setAction({ kind: 'history', staff: s })}><History size={13} /> History</button>
                {leader && <button className="hr-mini danger" title="Permanently delete staff member" disabled={deletingId === s.id} onClick={() => deleteStaff(s)}><Trash2 size={13} /> {deletingId === s.id ? 'Deleting…' : 'Delete'}</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        {!rows.length && <div className="rp-empty">No staff match. Use “Add staff” to create the first record.</div>}
      </section>
      </>
      )}

      {action?.kind === 'add' && <AddStaff schools={campuses.length ? (campuses as any) : schools} roles={roles} leader={leader} user={user} defaultCampusId={activeCampusId} onClose={() => setAction(null)} onDone={() => done('Staff member added')} />}
      {action?.kind === 'promote' && <Promote s={action.staff} roles={roles} leader={leader} isOrgAdmin={user.role === 'organisation_admin' || !!user.is_superuser} onClose={() => setAction(null)} onDone={() => done('Promotion saved')} />}
      {action?.kind === 'role' && <AssignRole s={action.staff} roles={roles} leader={leader} isOrgAdmin={user.role === 'organisation_admin' || !!user.is_superuser} onClose={() => setAction(null)} onDone={() => done('Role updated')} />}
      {action?.kind === 'edit' && <EditStaff s={action.staff} roles={roles} leader={leader} isOrgAdmin={user.role === 'organisation_admin' || !!user.is_superuser} onClose={() => setAction(null)} onDone={() => done('Staff record updated')} />}
      {action?.kind === 'terminate' && <Terminate s={action.staff} onClose={() => setAction(null)} onDone={() => done('Employment ended. Any login was switched off.')} />}
      {action?.kind === 'history' && <Timeline s={action.staff} onClose={() => setAction(null)} />}
      {action?.kind === 'assignments' && <TeachingAssignmentsModal s={action.staff} user={user} onClose={() => setAction(null)} onDone={() => done('Assignments updated')} />}
      {action?.kind === 'profile' && <StaffProfileModal staff={action.staff} onClose={() => setAction(null)} onEdit={() => setAction({ kind: 'edit', staff: action.staff })} />}
      {calendarTarget && <AttendanceCalendarModal target={calendarTarget} onClose={() => setCalendarTarget(null)} />}
    </>
  );
}

function StaffProfileModal({ staff, onClose, onEdit }: { staff: R; onClose: () => void; onEdit?: () => void }) {
  const profileData: UserProfileData = {
    id: staff.id,
    name: staff.full_name || `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || 'Staff Member',
    role: staff.role || 'teacher',
    registryId: staff.role === 'teacher'
      ? `FACULTY-2024-${String(staff.id).padStart(4, '0')}`
      : staff.role === 'principal'
      ? `PRINCIPAL-2024-${String(staff.id).padStart(4, '0')}`
      : `STAFF-2024-${String(staff.id).padStart(4, '0')}`,
    email: staff.email || '',
    phone: staff.phone || '+1 (555) 019-2834',
    idNumber: staff.national_id || `SSM-${staff.id}-9942`,
    location: staff.school_name || 'Main Campus',
    avatarLetter: (staff.full_name || staff.first_name || 'S').charAt(0).toUpperCase(),
    avatarColor: staff.avatar_color,
    avatarImage: staff.avatar_image,
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-card"
        style={{ maxWidth: 960, width: '95vw', maxHeight: '92vh', overflowY: 'auto', padding: 28, borderRadius: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {nice(staff.role)} • 360° Institutional Profile
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0 0', color: '#0f172a' }}>{staff.full_name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <UserProfileView
          profile={profileData}
          onEdit={onEdit}
        />
      </div>
    </div>
  );
}

function Modal({ title, sub, icon, onClose, children }: { title: string; sub?: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head"><div className="modal-icon">{icon || <UserCog size={20} />}</div><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div><button onClick={onClose} aria-label="Close"><X size={18} /></button></div>
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

const roleOptions = (roles: string[], leader: boolean, isOrgAdmin?: boolean) => {
  const filtered = roles.filter(r => {
    if (r === 'organisation_admin') return !!isOrgAdmin;
    if (leader) return true;
    return r !== 'principal' && r !== 'school_admin';
  });
  if (isOrgAdmin && !filtered.includes('organisation_admin')) filtered.push('organisation_admin');
  if (!filtered.includes('additional')) filtered.push('additional');
  return filtered;
};

function AddStaff({
  schools,
  roles,
  leader,
  user,
  defaultCampusId,
  onClose,
  onDone
}: {
  schools: R[];
  roles: string[];
  leader: boolean;
  user: User;
  defaultCampusId?: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const isOrgAdmin = user.role === 'organisation_admin' || !!user.is_superuser;
  const [f, setF] = useState<R>({
    school: defaultCampusId || user.school || schools[0]?.id || '',
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
    temporary_password: '',
    create_portal_account: false
  });

  const [classes, setClasses] = useState<R[]>([]);
  const [subjects, setSubjects] = useState<R[]>([]);

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
      const payload: R = {
        school: f.school,
        role: f.role,
        first_name: f.first_name,
        last_name: f.last_name,
        position: f.position,
        hired_on: f.hired_on,
        phone: f.phone,
        salary: f.salary,
        salary_status: f.salary_status,
        create_portal_account: Boolean(f.create_portal_account)
      };
      if (f.create_portal_account) {
        payload.email = f.email;
        payload.password = f.password;
        payload.temporary_password = f.temporary_password;
        payload.set_temporary_password = f.set_temporary_password;
        if (f.role === 'teacher') {
          payload.teacher_type = f.teacher_type;
          if (['class_teacher', 'both'].includes(f.teacher_type)) {
            payload.class_teacher_class = f.class_teacher_class;
            payload.replace_existing = f.replace_existing;
            payload.effective_date = f.effective_date;
          }
          if (['subject_teacher', 'both'].includes(f.teacher_type)) {
            payload.assign_later = f.assign_later;
            if (!f.assign_later) {
              payload.subject_assignments = f.subject_assignments;
            }
          }
        }
      }
      await request('staff/', { method: 'POST', body: JSON.stringify(payload) });
      onDone();
    } catch (e: any) {
      setErr(e instanceof Error ? e.message : 'Failed to add staff member.');
    } finally {
      setBusy(false);
    }
  };



  return (
    <Modal title="Add staff member" sub="Creates an HR employment record, salary assignment, and optional portal login." onClose={onClose}>
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
              else if (val === 'school_admin') set('position', 'School Administrator');
              else if (val === 'accountant') set('position', 'Accountant');
              else if (val === 'librarian') set('position', 'Librarian');
              else if (val === 'counsellor') set('position', 'Counsellor');
              else if (val === 'support') set('position', 'Support Staff / Peon');
              else if (val === 'other') set('position', 'Staff Member');
            }}>
              {roleOptions(roles, leader, isOrgAdmin).map(r => <option key={r} value={r}>{r === 'organisation_admin' ? 'Organisation Administrator (Co-Admin)' : nice(r)}</option>)}
            </select>
          </label>
          <label>Position / Job title *<input required placeholder="e.g. Maths Teacher or Peon" value={f.position || ''} onChange={e => set('position', e.target.value)} /></label>
          <label>Campus *<select required value={f.school} onChange={e => set('school', e.target.value)}>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Hired on<input type="date" value={f.hired_on} onChange={e => set('hired_on', e.target.value)} /></label>
          <label>Phone<input value={f.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="e.g. +92 300 1234567" /></label>
          <label>Monthly base salary *<input required type="number" step="0.01" min="1" placeholder="e.g. 50000" value={f.salary || ''} onChange={e => set('salary', e.target.value)} /></label>

          {/* CREATE PORTAL ACCOUNT TOGGLE OPTION */}
          <div className="wide" style={{
            background: f.create_portal_account ? '#f0fdf4' : '#f8fafc',
            border: `1.5px solid ${f.create_portal_account ? '#86efac' : '#e2e8f0'}`,
            borderRadius: '12px',
            padding: '14px 16px',
            marginTop: '4px',
            transition: 'all 0.2s ease',
            boxShadow: f.create_portal_account ? '0 1px 3px rgba(22, 101, 52, 0.08)' : 'none'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '220px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: f.create_portal_account ? '#dcfce7' : '#e2e8f0',
                  color: f.create_portal_account ? '#16a34a' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <KeyRound size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                    Create Portal Account
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {f.create_portal_account
                      ? 'Portal sign-in enabled. Enter email and password below.'
                      : 'Disabled. Creates HR profile and salary only (e.g. peon, guard, driver). Click to enable portal login.'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={Boolean(f.create_portal_account)}
                onClick={() => set('create_portal_account', !f.create_portal_account)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 14px',
                  borderRadius: '20px',
                  border: `1.5px solid ${f.create_portal_account ? '#16a34a' : '#cbd5e1'}`,
                  background: f.create_portal_account ? '#16a34a' : '#ffffff',
                  color: f.create_portal_account ? '#ffffff' : '#475569',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: f.create_portal_account ? '#ffffff' : '#94a3b8'
                  }}
                />
                {f.create_portal_account ? 'Portal Account: Yes' : 'Portal Account: No'}
              </button>
            </div>
          </div>

          {/* Conditional Email & Password if Create Portal Account is enabled */}
          {f.create_portal_account && (
            <>
              <label>Email (portal login) *
                <input
                  required
                  type="email"
                  value={f.email || ''}
                  onChange={e => set('email', e.target.value)}
                  placeholder="portal-user@school.edu"
                />
              </label>
              <label>Password (portal login) *
                <PasswordField
                  required
                  minLength={8}
                  value={f.password || ''}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Min 8 chars"
                />
              </label>

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
            </>
          )}
        </div>

        {err && <div className="hr-error" style={{ margin: '14px 0 0' }}>{err}</div>}
        <div className="modal-footer"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}><Plus size={15} /> {busy ? 'Saving…' : 'Add staff'}</button></div>
      </form>
    </Modal>
  );
}
function Promote({ s, roles, leader, isOrgAdmin, onClose, onDone }: { s: R; roles: string[]; leader: boolean; isOrgAdmin?: boolean; onClose: () => void; onDone: () => void }) {
  const [pos, setPos] = useState(''); const [role, setRole] = useState(''); const [note, setNote] = useState('');
  const { err, busy, submit } = useSubmit(`staff/${s.id}/promote/`, onDone);
  return (
    <Modal title={`Promote ${s.full_name}`} sub={`Currently ${s.position} (${nice(s.role)})`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit({ new_position: pos, new_role: role, note }); }}>
        <div className="modal-fields hr-fields">
          <label className="wide">New position *<input required value={pos} onChange={e => setPos(e.target.value)} placeholder="e.g. Head of Maths" /></label>
          <label className="wide">New role (optional)<select value={role} onChange={e => setRole(e.target.value)}><option value="">Keep {nice(s.role)}</option>{roleOptions(roles, leader, isOrgAdmin).filter(r => r !== s.role).map(r => <option key={r} value={r}>{r === 'organisation_admin' ? 'Organisation Administrator (Co-Admin)' : nice(r)}</option>)}</select></label>
          <label className="wide">Note<input value={note} onChange={e => setNote(e.target.value)} /></label>
        </div>
        {err && <div className="hr-error">{err}</div>}
        <div className="modal-footer"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Promote'}</button></div>
      </form>
    </Modal>
  );
}

function AssignRole({ s, roles, leader, isOrgAdmin, onClose, onDone }: { s: R; roles: string[]; leader: boolean; isOrgAdmin?: boolean; onClose: () => void; onDone: () => void }) {
  const [role, setRole] = useState(''); const [note, setNote] = useState('');
  const { err, busy, submit } = useSubmit(`staff/${s.id}/assign-role/`, onDone);
  return (
    <Modal title={`Assign role to ${s.full_name}`} sub={`Current role: ${nice(s.role)}${s.has_login ? ' · their login role is updated too' : ''}`} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); submit({ role, note }); }}>
        <div className="modal-fields hr-fields">
          <label className="wide">Role *<select required value={role} onChange={e => setRole(e.target.value)}><option value="">Choose a role…</option>{roleOptions(roles, leader, isOrgAdmin).filter(r => r !== s.role).map(r => <option key={r} value={r}>{r === 'organisation_admin' ? 'Organisation Administrator (Co-Admin)' : nice(r)}</option>)}</select></label>
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

function EditStaff({ s, roles, leader, isOrgAdmin, onClose, onDone }: { s: R; roles: string[]; leader: boolean; isOrgAdmin?: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<R>({
    first_name: s.first_name || '',
    last_name: s.last_name || '',
    position: s.position || '',
    role: s.role || 'teacher',
    hired_on: s.hired_on || '',
    email: s.email || '',
    phone: s.phone || '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [copied, setCopied] = useState(false);

  const { err, busy, submit } = useSubmit(`staff/${s.id}/`, onDone);
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#@!$*&';
    let pwd = '';
    const array = new Uint8Array(12);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < 12; i++) {
      pwd += chars[array[i] % chars.length];
    }
    setNewPassword(pwd);
    setShowPassword(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, any> = { ...f };
    if (newPassword.trim()) {
      payload.password = newPassword.trim();
      payload.send_email = sendEmail;
    }
    submit(payload, 'PATCH');
  };

  return (
    <Modal title={`Edit ${s.full_name}`} sub="Update staff position, details or login credentials." onClose={onClose}>
      <form onSubmit={handleSave}>
        <div className="modal-fields hr-fields">
          <label>First name *<input required value={f.first_name} onChange={e => set('first_name', e.target.value)} /></label>
          <label>Last name *<input required value={f.last_name} onChange={e => set('last_name', e.target.value)} /></label>
          <label>Position *<input required placeholder="e.g. Lead Educator" value={f.position} onChange={e => set('position', e.target.value)} /></label>
          <label>Role<select value={f.role} onChange={e => set('role', e.target.value)}>{roleOptions(roles, leader, isOrgAdmin).map(r => <option key={r} value={r}>{r === 'organisation_admin' ? 'Organisation Administrator (Co-Admin)' : nice(r)}</option>)}</select></label>
          <label>Hired on<input type="date" value={f.hired_on} onChange={e => set('hired_on', e.target.value)} /></label>
          <label>Email<input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></label>
          <label>Phone<input value={f.phone} onChange={e => set('phone', e.target.value)} /></label>
        </div>

        {/* Portal Credentials Section */}
        <div style={{ marginTop: '16px', padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KeyRound size={16} color="#6366f1" />
              <strong style={{ fontSize: '13px', color: '#1e293b' }}>Portal Credentials &amp; Access</strong>
            </div>
            <span className={`pill ${s.has_login ? 'green' : 'amber'}`}>
              <i className="pill-dot" /> {s.has_login ? 'Active Login' : 'No Login Assigned'}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
            Sign-in Email / Username: <strong style={{ color: '#0f172a' }}>{s.login_email || s.username || s.email || f.email || 'None'}</strong>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>
              Reset Password (leave empty to keep current)
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 8 chars)"
                style={{ flex: 1, padding: '7px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
              />
              <button
                type="button"
                className="outline-btn"
                style={{ fontSize: '11px', padding: '6px 10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={generatePassword}
              >
                <RefreshCw size={12} /> Generate
              </button>
              <button
                type="button"
                className="outline-btn"
                style={{ fontSize: '11px', padding: '6px 8px' }}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {newPassword && (
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <label style={{ fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', margin: 0, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={e => setSendEmail(e.target.checked)}
                />
                Send new password to staff member's email
              </label>
              <button
                type="button"
                className="outline-btn"
                style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${s.login_email || s.username || s.email || f.email}\nPassword: ${newPassword}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
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
    <Modal
      title={`Teaching Assignments — ${s.full_name}`}
      sub={`Teacher type: ${nice(data?.teacher_type || s.teacher_type || 'unassigned')}`}
      icon={<GraduationCap size={20} color="#4f46e5" />}
      onClose={onClose}
    >
      <div style={{ padding: '6px 0' }}>
        {loading ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#64748b', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <RefreshCw size={15} className="spin" style={{ color: '#6366f1' }} />
            <span>Loading assignments…</span>
          </div>
        ) : (
          <div>
            {err && <div className="hr-error" style={{ marginBottom: '16px' }}>{err}</div>}

            {/* Active Class Teacher Assignments */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GraduationCap size={16} color="#4f46e5" />
                  <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                    Homeroom Class Teacher Assignment
                  </h4>
                </div>
                {(!data?.active_class_assignments || data.active_class_assignments.length === 0) && addMode === 'none' && (
                  <button
                    type="button"
                    onClick={() => { setAddMode('class_teacher'); setErr(''); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 12px',
                      borderRadius: 20,
                      border: '1px solid #c7d2fe',
                      background: '#eef2ff',
                      color: '#4338ca',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={13} /> Assign Homeroom
                  </button>
                )}
              </div>

              {(!data?.active_class_assignments || data.active_class_assignments.length === 0) ? (
                <div style={{
                  fontSize: '13px',
                  color: '#64748b',
                  background: '#f8fafc',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1.5px dashed #cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}>
                  <GraduationCap size={16} style={{ color: '#94a3b8' }} />
                  <span>No active homeroom class assignment.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.active_class_assignments.map((a: any) => (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#ffffff',
                        padding: '12px 16px',
                        borderRadius: '11px',
                        border: '1.5px solid #e0e7ff',
                        boxShadow: '0 2px 6px rgba(99, 102, 241, 0.05)',
                        gap: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: '#eff6ff',
                          color: '#2563eb',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0
                        }}>
                          <GraduationCap size={18} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                              {a.class_name}
                            </strong>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: '#dbeafe',
                              color: '#1e40af',
                              border: '1px solid #bfdbfe'
                            }}>
                              Class Teacher
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                            <CalendarDays size={12} color="#94a3b8" />
                            <span>Since {formatDisplayDate(a.start_date)}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnd(a.id, 'class_teacher')}
                        className="outline-btn"
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#dc2626',
                          borderColor: '#fca5a5',
                          background: '#fff',
                          borderRadius: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(220, 38, 38, 0.05)',
                          flexShrink: 0
                        }}
                      >
                        <UserMinus size={13} /> End Assignment
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Subject Assignments */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BookOpen size={16} color="#7c3aed" />
                  <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155', margin: 0 }}>
                    Subject Teaching Assignments
                  </h4>
                </div>
                {addMode === 'none' && (
                  <button
                    type="button"
                    onClick={() => { setAddMode('subject'); setErr(''); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 12px',
                      borderRadius: 20,
                      border: '1px solid #ddd6fe',
                      background: '#f5f3ff',
                      color: '#6d28d9',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={13} /> Add Subject Class
                  </button>
                )}
              </div>

              {(!data?.active_subject_assignments || data.active_subject_assignments.length === 0) ? (
                <div style={{
                  fontSize: '13px',
                  color: '#64748b',
                  background: '#f8fafc',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1.5px dashed #cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}>
                  <BookOpen size={16} style={{ color: '#94a3b8' }} />
                  <span>No active subject teaching assignments.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.active_subject_assignments.map((a: any) => (
                    <div
                      key={a.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#ffffff',
                        padding: '12px 16px',
                        borderRadius: '11px',
                        border: '1.5px solid #f1f5f9',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
                        gap: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: '#f0fdf4',
                          color: '#16a34a',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0
                        }}>
                          <BookOpen size={18} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                              {nice(a.subject_name || '')}
                            </strong>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: '#f1f5f9',
                              color: '#475569',
                              border: '1px solid #e2e8f0'
                            }}>
                              {a.class_name}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                            <CalendarDays size={12} color="#94a3b8" />
                            <span>Since {formatDisplayDate(a.start_date)}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEnd(a.id, 'subject')}
                        className="outline-btn"
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#dc2626',
                          borderColor: '#fca5a5',
                          background: '#fff',
                          borderRadius: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(220, 38, 38, 0.05)',
                          flexShrink: 0
                        }}
                      >
                        <UserMinus size={13} /> End Assignment
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Assignment Form */}
            {addMode !== 'none' && (
              <form
                onSubmit={handleAdd}
                style={{
                  background: '#faf5ff',
                  padding: '16px 18px',
                  borderRadius: '12px',
                  border: '1.5px solid #e9d5ff',
                  marginBottom: '20px',
                  boxShadow: '0 4px 12px rgba(147, 51, 234, 0.05)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '14px' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: '#ede9fe', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
                    <Plus size={14} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#4c1d95' }}>
                    {addMode === 'class_teacher' ? 'Assign New Homeroom Class Teacher Role' : 'Assign New Subject Class'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: addMode === 'subject' ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: 0, fontSize: '11.5px', fontWeight: 700, color: '#475569' }}>
                    Class *
                    <select
                      required
                      value={selectedClass}
                      onChange={e => setSelectedClass(e.target.value)}
                      className="hr-select"
                      style={{ width: '100%', height: 38 }}
                    >
                      <option value="">-- Choose Class --</option>
                      {(data?.available_classes || []).map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.current_teacher ? `(Current Teacher: ${c.current_teacher})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  {addMode === 'subject' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: 0, fontSize: '11.5px', fontWeight: 700, color: '#475569' }}>
                      Subject *
                      <select
                        required
                        value={selectedSubj}
                        onChange={e => setSelectedSubj(e.target.value)}
                        className="hr-select"
                        style={{ width: '100%', height: 38 }}
                      >
                        <option value="">-- Choose Subject --</option>
                        {(data?.available_subjects || []).map((sub: any) => (
                          <option key={sub.id} value={sub.id}>{sub.name} ({sub.code})</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                    <span>Effective Date:</span>
                    <input
                      type="date"
                      value={effectiveDate}
                      onChange={e => setEffectiveDate(e.target.value)}
                      style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '7px', border: '1px solid #cbd5e1' }}
                    />
                  </label>
                  {addMode === 'class_teacher' && (
                    <label style={{ margin: 0, fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#92400e', background: '#fef3c7', padding: '4px 10px', borderRadius: '6px' }}>
                      <input
                        type="checkbox"
                        checked={replaceExisting}
                        onChange={e => setReplaceExisting(e.target.checked)}
                      />
                      <span>Replace existing class teacher if assigned</span>
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #f3e8ff', paddingTop: '12px' }}>
                  <button
                    type="button"
                    className="outline-btn"
                    onClick={() => setAddMode('none')}
                    style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '8px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={saving}
                    style={{
                      padding: '6px 16px',
                      fontSize: '12px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                      boxShadow: '0 2px 8px rgba(109, 40, 217, 0.25)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5
                    }}
                  >
                    <Check size={14} /> {saving ? 'Saving...' : 'Confirm Assignment'}
                  </button>
                </div>
              </form>
            )}

            {/* Historical Assignments */}
            {((data?.historical_class_assignments && data.historical_class_assignments.length > 0) ||
              (data?.historical_subject_assignments && data.historical_subject_assignments.length > 0)) && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '10px' }}>
                  <History size={14} color="#64748b" />
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', margin: 0 }}>
                    Assignment History
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                  {(data.historical_class_assignments || []).map((h: any) => (
                    <div
                      key={h.id}
                      style={{
                        padding: '8px 12px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #edf0f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span><strong>Class Teacher</strong> — {h.class_name}</span>
                      <small style={{ color: '#94a3b8' }}>{formatDisplayDate(h.start_date)} to {formatDisplayDate(h.end_date)}</small>
                    </div>
                  ))}
                  {(data.historical_subject_assignments || []).map((h: any) => (
                    <div
                      key={h.id}
                      style={{
                        padding: '8px 12px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #edf0f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span><strong>{nice(h.subject_name || '')}</strong> ({h.class_name})</span>
                      <small style={{ color: '#94a3b8' }}>{formatDisplayDate(h.start_date)} to {formatDisplayDate(h.end_date)}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="primary-btn"
            onClick={onClose}
            style={{
              padding: '8px 22px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
              fontWeight: 600,
              fontSize: '13px'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
