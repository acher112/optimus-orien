import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CheckCircle2, Clock, AlertTriangle, XCircle,
  RefreshCw, Save, Users, AlertCircle, Check, Eye, Edit3, Search
} from 'lucide-react';
import { list, request, type User } from './api';
import AttendanceCalendarModal, { CalendarTarget } from './AttendanceCalendarModal';

type StatusType = 'present' | 'absent' | 'late' | 'excused' | 'not_taken';

interface StaffAttendanceRecord {
  staff_id: number;
  staff_name: string;
  position: string;
  role: string;
  email: string;
  status: StatusType;
  is_recorded: boolean;
  note: string;
}

interface AttendancePayload {
  date: string;
  school: number;
  school_name: string;
  is_conducted?: boolean;
  conducted_by?: string | null;
  conducted_at?: string | null;
  records: StaffAttendanceRecord[];
  summary: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    not_taken?: number;
    recorded_count: number;
  };
}

export default function StaffAttendanceRegister({
  user,
  notify,
  embedded = false,
  activeCampusId,
  campuses = [],
}: {
  user: User;
  notify: (msg: string) => void;
  embedded?: boolean;
  activeCampusId?: number | null;
  campuses?: Array<{ id: number; name: string }>;
}) {
  const [dateVal, setDateVal] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [schools, setSchools] = useState<Array<{ id: number; name: string }>>([]);
  const [schoolId, setSchoolId] = useState<string>(() => (activeCampusId ? String(activeCampusId) : (user.school ? String(user.school) : '')));
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [summary, setSummary] = useState({
    total: 0, present: 0, absent: 0, late: 0, excused: 0, not_taken: 0, recorded_count: 0
  });
  const [isConducted, setIsConducted] = useState<boolean>(false);
  const [conductedBy, setConductedBy] = useState<string | null>(null);
  const [conductedAt, setConductedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [dirty, setDirty] = useState<boolean>(false);
  const [calendarTarget, setCalendarTarget] = useState<CalendarTarget | null>(null);
  const [attendanceMode, setAttendanceMode] = useState<'view' | 'mark'>('view');
  const [statusFilter, setStatusFilter] = useState<StatusType | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = (r.staff_name || '').toLowerCase().includes(q);
        const matchEmail = (r.email || '').toLowerCase().includes(q);
        const matchPos = (r.position || '').toLowerCase().includes(q);
        const matchRole = (r.role || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchPos && !matchRole) return false;
      }
      return true;
    });
  }, [records, statusFilter, searchTerm]);

  useEffect(() => {
    if (activeCampusId) {
      setSchoolId(String(activeCampusId));
    }
  }, [activeCampusId]);

  useEffect(() => {
    if (campuses.length > 0) {
      setSchools(campuses);
    }
    list<any>('schools').then(res => {
      setSchools(res);
      if (!schoolId && res.length > 0) {
        setSchoolId(String(activeCampusId || user.school || res[0].id));
      }
    }).catch(() => {});
  }, [user.school, schoolId, activeCampusId, campuses]);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams();
      if (dateVal) p.set('date', dateVal);
      if (schoolId) p.set('school', schoolId);
      const res = await request<AttendancePayload>(`staff/attendance/?${p.toString()}`);
      setRecords(res.records || []);
      setSummary({
        total: res.summary?.total || 0,
        present: res.summary?.present || 0,
        absent: res.summary?.absent || 0,
        late: res.summary?.late || 0,
        excused: res.summary?.excused || 0,
        not_taken: res.summary?.not_taken || 0,
        recorded_count: res.summary?.recorded_count || 0,
      });
      setIsConducted(Boolean(res.is_conducted));
      setConductedBy(res.conducted_by || null);
      setConductedAt(res.conducted_at || null);
      setDirty(false);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not load staff attendance');
    } finally {
      setLoading(false);
    }
  }, [dateVal, schoolId]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const markAllPresent = () => {
    setRecords(prev => prev.map(r => ({ ...r, status: 'present' })));
    setDirty(true);
  };

  const updateStatus = (staffId: number, status: StatusType) => {
    setRecords(prev => prev.map(r => r.staff_id === staffId ? { ...r, status } : r));
    setDirty(true);
  };

  const updateNote = (staffId: number, note: string) => {
    setRecords(prev => prev.map(r => r.staff_id === staffId ? { ...r, note } : r));
    setDirty(true);
  };

  const currentSummary = useMemo(() => {
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const excused = records.filter(r => r.status === 'excused').length;
    const not_taken = records.filter(r => r.status === 'not_taken').length;
    return { total, present, absent, late, excused, not_taken };
  }, [records]);

  const isSubmitDisabled =
    saving ||
    loading ||
    records.length === 0 ||
    (isConducted && !dirty) ||
    (!isConducted && !dirty && records.every(r => r.status === 'not_taken'));

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        date: dateVal,
        school: schoolId ? Number(schoolId) : undefined,
        records: records.map(r => ({
          staff_id: r.staff_id,
          status: r.status,
          note: r.note,
        })),
      };
      const res = await request<any>('staff/attendance/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      notify(res.message || 'Staff attendance saved successfully.');
      setDirty(false);
      setIsConducted(true);
      if (res.conducted_by) setConductedBy(res.conducted_by);
      loadAttendance();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to save staff attendance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`panel hr-panel ${embedded ? 'embedded-attendance' : ''}`} style={{ marginTop: embedded ? 0 : 20 }}>
      {/* Mode Switcher: View Attendance vs Mark Or Edit Attendance */}
      <div style={{
        display: 'flex',
        gap: 10,
        padding: '12px 20px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Register Mode:
        </span>
        <button
          type="button"
          onClick={() => setAttendanceMode('view')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: attendanceMode === 'view' ? 700 : 500,
            background: attendanceMode === 'view' ? '#6366f1' : '#fff',
            color: attendanceMode === 'view' ? '#fff' : '#475569',
            border: attendanceMode === 'view' ? '1px solid #6366f1' : '1px solid #cbd5e1',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: attendanceMode === 'view' ? '0 2px 4px rgba(99, 102, 241, 0.25)' : 'none'
          }}
        >
          <Eye size={14} /> View Attendance
        </button>
        <button
          type="button"
          onClick={() => setAttendanceMode('mark')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: attendanceMode === 'mark' ? 700 : 500,
            background: attendanceMode === 'mark' ? '#6366f1' : '#fff',
            color: attendanceMode === 'mark' ? '#fff' : '#475569',
            border: attendanceMode === 'mark' ? '1px solid #6366f1' : '1px solid #cbd5e1',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: attendanceMode === 'mark' ? '0 2px 4px rgba(99, 102, 241, 0.25)' : 'none'
          }}
        >
          <Edit3 size={14} /> Mark Or Edit Attendance
        </button>
      </div>

      {/* Header with Title and Filters */}
      <div className="panel-head" style={{ flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: '#ede9fe',
            color: '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <CalendarDays size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>Staff Attendance Register</h3>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              Responsible for tracking daily attendance of all campus staff and faculty
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {schools.length > 1 && user.role === 'organisation_admin' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
              Campus:
              <select
                className="fx-select"
                value={schoolId}
                onChange={e => setSchoolId(e.target.value)}
                style={{ height: 36, padding: '4px 10px' }}
              >
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            Date:
            <input
              type="date"
              className="fx-select"
              value={dateVal}
              onChange={e => setDateVal(e.target.value)}
              style={{ height: 36, padding: '4px 10px' }}
            />
          </label>

          {attendanceMode === 'mark' ? (
            <>
              <button
                type="button"
                className="outline-btn"
                onClick={markAllPresent}
                disabled={loading || records.length === 0}
                style={{ height: 36, fontSize: 12 }}
              >
                <Check size={14} /> Mark All Present
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={() => handleSave()}
                disabled={isSubmitDisabled}
                style={{
                  height: 36,
                  fontSize: 12,
                  opacity: isSubmitDisabled ? 0.6 : 1,
                  cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                  background: dirty ? '#16a34a' : undefined,
                  borderColor: dirty ? '#16a34a' : undefined,
                }}
                title={
                  isConducted && !dirty
                    ? 'Attendance already conducted and saved. Change any staff status to undisable submit.'
                    : 'Submit staff attendance to database'
                }
              >
                <Save size={14} />{' '}
                {saving
                  ? 'Saving...'
                  : dirty
                  ? isConducted
                    ? 'Update Attendance *'
                    : 'Submit Attendance *'
                  : isConducted
                  ? 'Attendance Saved'
                  : 'Submit Attendance'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="outline-btn"
              onClick={() => setAttendanceMode('mark')}
              style={{ height: 36, fontSize: 12, borderColor: '#6366f1', color: '#6366f1' }}
            >
              <Edit3 size={14} /> Switch to Mark / Edit
            </button>
          )}
        </div>
      </div>

      {/* Conducted Status Banner */}
      <div style={{
        background: isConducted ? '#ecfdf5' : '#fffbeb',
        borderBottom: isConducted ? '1px solid #a7f3d0' : '1px solid #fde68a',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          {isConducted ? (
            <CheckCircle2 size={16} color="#059669" />
          ) : (
            <Clock size={16} color="#d97706" />
          )}
          <span style={{ fontWeight: 600, color: isConducted ? '#065f46' : '#92400e' }}>
            {isConducted ? (
              <>
                Staff Attendance Conducted on {dateVal} · Conducted by: <b>{conductedBy || 'Administrator'}</b>
                {conductedAt && ` at ${new Date(conductedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </>
            ) : (
              <>Staff Attendance not recorded yet for {dateVal}. Mark status below and click Submit.</>
            )}
          </span>
        </div>

        {dirty && (
          <span style={{
            background: '#fef3c7',
            color: '#b45309',
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 4,
            border: '1px solid #fde68a'
          }}>
            ✎ Unsaved alterations
          </span>
        )}
      </div>

      {/* KPI Stats - Clickable to filter staff */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 10,
        padding: '12px 20px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div
          onClick={() => setStatusFilter('all')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8,
            background: statusFilter === 'all' ? '#e2e8f0' : 'transparent',
            border: statusFilter === 'all' ? '1.5px solid #64748b' : '1.5px solid transparent',
            transition: 'all 0.15s ease'
          }}
          title="Click to view all staff"
        >
          <Users size={16} color="#64748b" />
          <span style={{ fontSize: 12, color: '#64748b' }}>Total Staff:</span>
          <strong style={{ fontSize: 14 }}>{currentSummary.total}</strong>
        </div>
        <div
          onClick={() => setStatusFilter('present')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8,
            background: statusFilter === 'present' ? '#dcfce7' : 'transparent',
            border: statusFilter === 'present' ? '1.5px solid #16a34a' : '1.5px solid transparent',
            transition: 'all 0.15s ease'
          }}
          title="Click to filter by Present staff"
        >
          <CheckCircle2 size={16} color="#16a34a" />
          <span style={{ fontSize: 12, color: '#16a34a' }}>Present:</span>
          <strong style={{ fontSize: 14, color: '#16a34a' }}>{currentSummary.present}</strong>
        </div>
        <div
          onClick={() => setStatusFilter('absent')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8,
            background: statusFilter === 'absent' ? '#fee2e2' : 'transparent',
            border: statusFilter === 'absent' ? '1.5px solid #dc2626' : '1.5px solid transparent',
            transition: 'all 0.15s ease'
          }}
          title="Click to filter by Absent staff"
        >
          <XCircle size={16} color="#dc2626" />
          <span style={{ fontSize: 12, color: '#dc2626' }}>Absent:</span>
          <strong style={{ fontSize: 14, color: '#dc2626' }}>{currentSummary.absent}</strong>
        </div>
        <div
          onClick={() => setStatusFilter('late')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8,
            background: statusFilter === 'late' ? '#fef3c7' : 'transparent',
            border: statusFilter === 'late' ? '1.5px solid #d97706' : '1.5px solid transparent',
            transition: 'all 0.15s ease'
          }}
          title="Click to filter by Late staff"
        >
          <Clock size={16} color="#d97706" />
          <span style={{ fontSize: 12, color: '#d97706' }}>Late:</span>
          <strong style={{ fontSize: 14, color: '#d97706' }}>{currentSummary.late}</strong>
        </div>
        <div
          onClick={() => setStatusFilter('excused')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8,
            background: statusFilter === 'excused' ? '#f3e8ff' : 'transparent',
            border: statusFilter === 'excused' ? '1.5px solid #7c3aed' : '1.5px solid transparent',
            transition: 'all 0.15s ease'
          }}
          title="Click to filter by Excused staff"
        >
          <AlertTriangle size={16} color="#7c3aed" />
          <span style={{ fontSize: 12, color: '#7c3aed' }}>Excused:</span>
          <strong style={{ fontSize: 14, color: '#7c3aed' }}>{currentSummary.excused}</strong>
        </div>
        <div
          onClick={() => setStatusFilter('not_taken')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8,
            background: statusFilter === 'not_taken' ? '#fef3c7' : 'transparent',
            border: statusFilter === 'not_taken' ? '1.5px solid #b45309' : '1.5px solid transparent',
            transition: 'all 0.15s ease'
          }}
          title="Click to filter by Not Taken staff"
        >
          <AlertCircle size={16} color="#b45309" />
          <span style={{ fontSize: 12, color: '#b45309' }}>Not Taken:</span>
          <strong style={{ fontSize: 14, color: '#b45309' }}>{currentSummary.not_taken}</strong>
        </div>
      </div>

      {/* Table Controls (Search & Status Filter) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 20px',
        borderBottom: '1px solid #e2e8f0',
        flexWrap: 'wrap',
        gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', padding: '5px 12px', borderRadius: 6, border: '1px solid #cbd5e1', minWidth: 240 }}>
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search staff by name, email, role..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Filter:</span>
          {(['all', 'present', 'absent', 'late', 'excused', 'not_taken'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              style={{
                border: statusFilter === st ? '1px solid #6366f1' : '1px solid #cbd5e1',
                background: statusFilter === st ? '#ede9fe' : '#fff',
                color: statusFilter === st ? '#4f46e5' : '#64748b',
                fontSize: 11,
                fontWeight: statusFilter === st ? 700 : 500,
                padding: '3px 9px',
                borderRadius: 5,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {st === 'all' ? 'All' : st.replace('_', ' ')}
            </button>
          ))}
          <button
            type="button"
            className="outline-btn"
            onClick={loadAttendance}
            style={{ height: 28, padding: '0 8px', fontSize: 11 }}
            title="Reload staff attendance"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {error && (
        <div className="error-bar" style={{ margin: '14px 20px 0' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          <RefreshCw size={20} className="spinning" style={{ marginBottom: 8, display: 'inline-block' }} />
          <div>Loading staff register...</div>
        </div>
      ) : records.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          No active staff members registered on this campus.
        </div>
      ) : filteredRecords.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          No staff members match the selected filter or search query.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>STAFF MEMBER</th>
                <th>ROLE &amp; POSITION</th>
                <th style={{ minWidth: 280 }}>ATTENDANCE STATUS</th>
                <th>NOTES</th>
                <th style={{ width: 90, textAlign: 'center' }}>RECORDED</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r, idx) => {
                const initials = r.staff_name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <tr key={r.staff_id}>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{idx + 1}</td>
                    <td>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                        onClick={() => setCalendarTarget({
                          id: r.staff_id,
                          name: r.staff_name,
                          type: 'staff',
                          roleOrClass: `${r.position || 'Staff'} (${r.role})`,
                          emailOrRoll: r.email,
                        })}
                        title="Click to view full attendance calendar"
                      >
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: '#e0e7ff',
                          color: '#4338ca',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 12,
                        }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ color: '#1e293b' }}>{r.staff_name}</strong>
                            <CalendarDays size={13} color="#6366f1" />
                          </div>
                          {r.email && <div style={{ fontSize: 11, color: '#64748b' }}>{r.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{r.position || 'Staff'}</div>
                      <span className="pill" style={{ fontSize: 10, textTransform: 'capitalize', marginTop: 2 }}>
                        {r.role}
                      </span>
                    </td>
                    <td>
                      {attendanceMode === 'mark' ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
                          {(['present', 'absent', 'late', 'excused'] as const).map(st => {
                            const isActive = r.status === st;
                            let activeStyle: React.CSSProperties = {};
                            if (isActive) {
                              if (st === 'present') activeStyle = { background: '#16a34a', color: '#fff', fontWeight: 700 };
                              if (st === 'absent') activeStyle = { background: '#dc2626', color: '#fff', fontWeight: 700 };
                              if (st === 'late') activeStyle = { background: '#d97706', color: '#fff', fontWeight: 700 };
                              if (st === 'excused') activeStyle = { background: '#7c3aed', color: '#fff', fontWeight: 700 };
                            }
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => updateStatus(r.staff_id, st)}
                                style={{
                                  border: 'none',
                                  background: isActive ? undefined : 'transparent',
                                  color: isActive ? undefined : '#475569',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  textTransform: 'capitalize',
                                  transition: 'all 0.15s ease',
                                  ...activeStyle,
                                }}
                              >
                                {st}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        /* Read-only status pills in 'view' mode */
                        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {r.status === 'present' && (
                            <span className="pill green" style={{ fontSize: 11, padding: '4px 10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={12} /> Present
                            </span>
                          )}
                          {r.status === 'absent' && (
                            <span className="pill red" style={{ fontSize: 11, padding: '4px 10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <XCircle size={12} /> Absent
                            </span>
                          )}
                          {r.status === 'late' && (
                            <span className="pill amber" style={{ fontSize: 11, padding: '4px 10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={12} /> Late
                            </span>
                          )}
                          {r.status === 'excused' && (
                            <span className="pill purple" style={{ fontSize: 11, padding: '4px 10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={12} /> Excused
                            </span>
                          )}
                          {r.status === 'not_taken' && (
                            <span style={{
                              background: '#fef3c7',
                              color: '#b45309',
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 8,
                              border: '1px solid #fde68a'
                            }}>
                              Not Recorded
                            </span>
                          )}
                        </div>
                      )}

                      {attendanceMode === 'mark' && r.status === 'not_taken' && (
                        <span style={{
                          marginLeft: 8,
                          background: '#fef3c7',
                          color: '#b45309',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          border: '1px solid #fde68a'
                        }}>
                          Not Taken
                        </span>
                      )}
                    </td>
                    <td>
                      {attendanceMode === 'mark' ? (
                        <input
                          type="text"
                          placeholder="Add note..."
                          value={r.note || ''}
                          onChange={e => updateNote(r.staff_id, e.target.value)}
                          style={{
                            width: '100%',
                            maxWidth: 220,
                            padding: '4px 8px',
                            fontSize: 12,
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 12, color: r.note ? '#334155' : '#94a3b8', fontStyle: r.note ? 'normal' : 'italic' }}>
                          {r.note || '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.is_recorded ? (
                        <span className="pill green" title="Saved in database">
                          <Check size={11} /> Saved
                        </span>
                      ) : (
                        <span className="pill" style={{ color: '#94a3b8' }}>Unsaved</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {calendarTarget && (
        <AttendanceCalendarModal
          target={calendarTarget}
          onClose={() => setCalendarTarget(null)}
        />
      )}
    </section>
  );
}
