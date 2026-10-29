import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Users, CalendarDays, CheckCircle2, Clock,
  AlertTriangle, XCircle, RefreshCw, Save, Check, Search,
  ChevronRight, ArrowRight, UserCheck, Filter, AlertCircle
} from 'lucide-react';
import { list, request, type User } from './api';
import StaffAttendanceRegister from './StaffAttendanceRegister';

type StudentStatusType = 'present' | 'absent' | 'late' | 'excused' | 'not_taken';

interface StudentAttendanceRecord {
  student_id: number;
  admission_number: string;
  student_name: string;
  gender: string;
  status: StudentStatusType;
  is_recorded: boolean;
  note: string;
}

interface ClassAttendancePayload {
  class_id: number;
  class_name: string;
  section: string;
  display_name: string;
  grade_level: string;
  teacher_name: string;
  date: string;
  is_conducted: boolean;
  conducted_by: string | null;
  conducted_at: string | null;
  records: StudentAttendanceRecord[];
  summary: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    not_taken: number;
    attendance_rate: number | null;
    recorded_count: number;
  };
}

interface SchoolClassOption {
  id: number;
  name: string;
  section?: string;
  grade_level?: string;
  display_name?: string;
  teacher?: number | null;
  teacher_name?: string;
  school?: number;
}

interface AttendanceModuleProps {
  user: User;
  notify: (msg: string) => void;
  campuses?: Array<{ id: number; name: string }>;
}

export default function AttendanceModule({ user, notify, campuses = [] }: AttendanceModuleProps) {
  const isManager = ['organisation_admin', 'school_admin', 'principal'].includes(user.role);
  const [activeTab, setActiveTab] = useState<'student' | 'staff'>('student');

  // Multi-campus handling for Org Admin
  const [schoolId, setSchoolId] = useState<string>(() => (user.school ? String(user.school) : ''));
  const [schools, setSchools] = useState<Array<{ id: number; name: string }>>(campuses);

  // Student Attendance States
  const [classes, setClasses] = useState<SchoolClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [dateVal, setDateVal] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<StudentAttendanceRecord[]>([]);
  const [summary, setSummary] = useState({
    total: 0, present: 0, absent: 0, late: 0, excused: 0, not_taken: 0, attendance_rate: null as number | null
  });
  const [classInfo, setClassInfo] = useState<{
    name: string;
    section: string;
    teacher: string;
    grade: string;
  }>({ name: '', section: '', teacher: '', grade: '' });
  const [isConducted, setIsConducted] = useState<boolean>(false);
  const [conductedBy, setConductedBy] = useState<string | null>(null);
  const [conductedAt, setConductedAt] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [dirty, setDirty] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent' | 'late' | 'not_taken'>('all');

  // Load campus list if org admin
  useEffect(() => {
    if (campuses.length > 0) {
      setSchools(campuses);
      if (!schoolId) setSchoolId(String(user.school || campuses[0].id));
    } else {
      list<any>('schools').then(res => {
        setSchools(res);
        if (!schoolId && res.length > 0) {
          setSchoolId(String(user.school || res[0].id));
        }
      }).catch(() => {});
    }
  }, [user.school, campuses, schoolId]);

  // Load classrooms for campus
  useEffect(() => {
    list<any>('classes').then(res => {
      let filtered = res;
      if (schoolId) {
        filtered = res.filter((c: any) => String(c.school) === String(schoolId));
      }
      setClasses(filtered);
      if (filtered.length > 0) {
        // Prefer class taught by teacher if current user is teacher
        const myClass = user.role === 'teacher' ? filtered.find((c: any) => c.teacher === user.id) : null;
        const initial = myClass ? String(myClass.id) : String(filtered[0].id);
        setSelectedClassId(prev => (filtered.some((c: any) => String(c.id) === prev) ? prev : initial));
      } else {
        setSelectedClassId('');
      }
    }).catch(() => {});
  }, [schoolId, user.role, user.id]);

  // Load Student Attendance Register for selected class and date
  const loadClassAttendance = useCallback(async () => {
    if (!selectedClassId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const p = new URLSearchParams();
      p.set('school_class', selectedClassId);
      if (dateVal) p.set('date', dateVal);

      const res = await request<ClassAttendancePayload>(`attendance/class-register/?${p.toString()}`);
      setRecords(res.records || []);
      setSummary({
        total: res.summary.total,
        present: res.summary.present,
        absent: res.summary.absent,
        late: res.summary.late,
        excused: res.summary.excused,
        not_taken: res.summary.not_taken,
        attendance_rate: res.summary.attendance_rate,
      });
      setClassInfo({
        name: res.class_name,
        section: res.section,
        teacher: res.teacher_name,
        grade: res.grade_level,
      });
      setIsConducted(Boolean(res.is_conducted));
      setConductedBy(res.conducted_by);
      setConductedAt(res.conducted_at);
      setDirty(false);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Could not load student attendance register.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, dateVal]);

  useEffect(() => {
    loadClassAttendance();
  }, [loadClassAttendance]);

  // Status updates
  const updateStudentStatus = (studentId: number, status: StudentStatusType) => {
    setRecords(prev => prev.map(r => r.student_id === studentId ? { ...r, status } : r));
    setDirty(true);
  };

  const updateStudentNote = (studentId: number, note: string) => {
    setRecords(prev => prev.map(r => r.student_id === studentId ? { ...r, note } : r));
    setDirty(true);
  };

  const markAllPresent = () => {
    setRecords(prev => prev.map(r => ({ ...r, status: 'present' })));
    setDirty(true);
  };

  // Re-calculate live summary
  const liveSummary = useMemo(() => {
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const excused = records.filter(r => r.status === 'excused').length;
    const not_taken = records.filter(r => r.status === 'not_taken').length;
    const taken = total - not_taken;
    const rate = taken > 0 ? Math.round(((present + late) / taken) * 1000) / 10 : null;
    return { total, present, absent, late, excused, not_taken, rate };
  }, [records]);

  // Save student attendance (disabled if isConducted && !dirty, or if not conducted and nothing marked)
  const handleSaveStudentAttendance = async () => {
    if (!selectedClassId) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        school_class: Number(selectedClassId),
        date: dateVal,
        records: records.map(r => ({
          student_id: r.student_id,
          status: r.status,
          note: r.note,
        })),
      };

      const res = await request<any>('attendance/class-register/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      notify(res.message || 'Student attendance saved successfully.');
      setDirty(false);
      setIsConducted(true);
      if (res.conducted_by) setConductedBy(res.conducted_by);
      loadClassAttendance();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to save student attendance.');
    } finally {
      setSaving(false);
    }
  };

  // Filtered rows
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        r.student_name.toLowerCase().includes(term) ||
        r.admission_number.toLowerCase().includes(term) ||
        r.note.toLowerCase().includes(term)
      );
    });
  }, [records, statusFilter, searchTerm]);

  // Quick date jump
  const setQuickDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    setDateVal(d.toISOString().slice(0, 10));
  };

  // Submit button disabled rule:
  // - If saving or loading or 0 records: disabled
  // - If attendance was already conducted (isConducted) and NO alterations made (!dirty): disabled!
  // - When altered (dirty === true): undisabled!
  // - If not conducted yet: enabled if any student status is marked (dirty || any status !== 'not_taken')
  const isSubmitDisabled =
    saving ||
    loading ||
    records.length === 0 ||
    (isConducted && !dirty) ||
    (!isConducted && !dirty && records.every(r => r.status === 'not_taken'));

  return (
    <div className="attendance-portal-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header & Sub-Tabs Navigation */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--brand-primary, #715ee8)', fontWeight: 600 }}>
            <ClipboardCheck size={15} /> ATTENDANCE MANAGEMENT
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0.2rem 0' }}>Attendance Register</h1>
          <p style={{ color: 'var(--text-secondary, #64748b)', margin: 0, fontSize: '0.92rem' }}>
            Daily participation tracking for students and campus faculty.
          </p>
        </div>

        {/* Sub-tabs Switcher */}
        {isManager && (
          <div style={{
            display: 'inline-flex',
            background: 'var(--bg-subtle, #f1f5f9)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid var(--border-color, #e2e8f0)',
            gap: '4px'
          }}>
            <button
              type="button"
              className={`pill-btn ${activeTab === 'student' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'student' ? '#fff' : 'transparent',
                color: activeTab === 'student' ? 'var(--brand-primary, #715ee8)' : '#64748b',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'student' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
              onClick={() => setActiveTab('student')}
            >
              <ClipboardCheck size={16} /> Student Attendance
            </button>

            <button
              type="button"
              className={`pill-btn ${activeTab === 'staff' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'staff' ? '#fff' : 'transparent',
                color: activeTab === 'staff' ? '#7c3aed' : '#64748b',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'staff' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
              onClick={() => setActiveTab('staff')}
            >
              <Users size={16} /> Staff Attendance
            </button>
          </div>
        )}
      </div>

      {/* SUB-TAB 2: STAFF ATTENDANCE */}
      {activeTab === 'staff' && isManager && (
        <StaffAttendanceRegister user={user} notify={notify} />
      )}

      {/* SUB-TAB 1: STUDENT ATTENDANCE */}
      {activeTab === 'student' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Filter Bar Panel: Class selector + Date Picker */}
          <section className="panel" style={{
            background: 'var(--card-bg, #fff)',
            borderRadius: '10px',
            border: '1px solid var(--border-color, #e2e8f0)',
            padding: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Campus Filter (Org Admin) */}
                {schools.length > 1 && user.role === 'organisation_admin' && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                    CAMPUS:
                    <select
                      className="fx-select"
                      value={schoolId}
                      onChange={e => setSchoolId(e.target.value)}
                      style={{ height: 38, padding: '4px 10px', fontSize: '0.88rem', borderRadius: 8 }}
                    >
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}

                {/* Class Selector Filter (e.g. Class 9th, 10th, etc.) */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                  CLASSROOM:
                  <select
                    className="fx-select"
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    style={{ height: 38, padding: '4px 10px', fontSize: '0.88rem', borderRadius: 8, minWidth: 200, fontWeight: 700 }}
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.section ? `(${c.section})` : ''} {c.grade_level ? `· Gr. ${c.grade_level}` : ''}
                      </option>
                    ))}
                    {classes.length === 0 && <option value="">No classrooms configured</option>}
                  </select>
                </label>

                {/* Date Filter */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                  ATTENDANCE DATE:
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="date"
                      className="fx-select"
                      value={dateVal}
                      onChange={e => setDateVal(e.target.value)}
                      style={{ height: 38, padding: '4px 10px', fontSize: '0.88rem', borderRadius: 8 }}
                    />
                    <button
                      type="button"
                      className="outline-btn"
                      onClick={() => setQuickDate(0)}
                      style={{ height: 38, padding: '0 10px', fontSize: '0.8rem' }}
                      title="Today's attendance"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="outline-btn"
                      onClick={() => setQuickDate(1)}
                      style={{ height: 38, padding: '0 10px', fontSize: '0.8rem' }}
                      title="Yesterday's attendance"
                    >
                      Yesterday
                    </button>
                  </div>
                </label>
              </div>

              {/* Action Buttons: Mark All Present & Submit / Update Attendance */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="outline-btn"
                  onClick={markAllPresent}
                  disabled={loading || records.length === 0}
                  style={{ height: 38, fontSize: '0.85rem' }}
                >
                  <Check size={15} /> Mark All Present
                </button>

                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleSaveStudentAttendance}
                  disabled={isSubmitDisabled}
                  style={{
                    height: 38,
                    fontSize: '0.85rem',
                    padding: '0 18px',
                    opacity: isSubmitDisabled ? 0.6 : 1,
                    cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                    background: dirty ? '#16a34a' : undefined,
                    borderColor: dirty ? '#16a34a' : undefined,
                    transition: 'all 0.2s ease',
                  }}
                  title={
                    isConducted && !dirty
                      ? 'Attendance already conducted and saved. Change any student status to undisable submit.'
                      : 'Submit attendance updates to database'
                  }
                >
                  <Save size={15} />{' '}
                  {saving
                    ? 'Saving...'
                    : dirty
                    ? isConducted
                      ? 'Update Attendance *'
                      : 'Submit Attendance *'
                    : isConducted
                    ? 'Attendance Saved (No Changes)'
                    : 'Submit Attendance'}
                </button>
              </div>
            </div>

            {/* Quick Classroom Filter Chips */}
            {classes.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', alignSelf: 'center', marginRight: 4 }}>
                  Quick class jump:
                </span>
                {classes.map(c => {
                  const isSelected = String(c.id) === selectedClassId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedClassId(String(c.id))}
                      style={{
                        border: isSelected ? '1px solid #715ee8' : '1px solid #e2e8f0',
                        background: isSelected ? '#ede9fe' : '#f8fafc',
                        color: isSelected ? '#5b21b6' : '#475569',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {c.name} {c.section ? `(${c.section})` : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Conducted Status Banner */}
          <div style={{
            background: isConducted ? '#ecfdf5' : '#fffbeb',
            border: isConducted ? '1px solid #a7f3d0' : '1px solid #fde68a',
            borderRadius: '10px',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isConducted ? (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#d1fae5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={18} />
                </div>
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={18} />
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: isConducted ? '#065f46' : '#92400e' }}>
                  {isConducted
                    ? `Attendance Conducted on ${dateVal}`
                    : `Attendance Not Recorded Yet for ${dateVal}`}
                </div>
                <div style={{ fontSize: '0.8rem', color: isConducted ? '#047857' : '#b45309' }}>
                  {isConducted ? (
                    <>
                      Conducted by: <b>{conductedBy || classInfo.teacher || 'Assigned Instructor'}</b>
                      {conductedAt && ` · Recorded at ${new Date(conductedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      {isManager && ' · Principal & Admins can alter any student status below and click Update Attendance.'}
                    </>
                  ) : (
                    `No attendance session conducted for this classroom on ${dateVal}. Select status for students below and click Submit Attendance.`
                  )}
                </div>
              </div>
            </div>

            {dirty && (
              <span style={{
                background: '#fef3c7',
                color: '#b45309',
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #fde68a'
              }}>
                ✎ Unsaved modifications detected
              </span>
            )}
          </div>

          {/* Summary Strip (KPIs) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
            background: 'var(--card-bg, #fff)',
            borderRadius: '10px',
            border: '1px solid var(--border-color, #e2e8f0)',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={18} color="#64748b" />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>TOTAL ENROLLED</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{liveSummary.total}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={18} color="#16a34a" />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>PRESENT</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a' }}>{liveSummary.present}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <XCircle size={18} color="#dc2626" />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>ABSENT</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#dc2626' }}>{liveSummary.absent}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="#d97706" />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 600 }}>LATE</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#d97706' }}>{liveSummary.late}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="#8b5cf6" />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#8b5cf6', fontWeight: 600 }}>NOT TAKEN</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: liveSummary.not_taken > 0 ? '#b45309' : '#64748b' }}>
                  {liveSummary.not_taken}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardCheck size={18} color="#0ea5e9" />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#0ea5e9', fontWeight: 600 }}>ATTENDANCE RATE</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: (liveSummary.rate ?? 0) >= 85 ? '#16a34a' : '#d97706' }}>
                  {liveSummary.rate !== null ? `${liveSummary.rate}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Student Register Table */}
          <section className="panel" style={{
            background: 'var(--card-bg, #fff)',
            borderRadius: '10px',
            border: '1px solid var(--border-color, #e2e8f0)',
            padding: 0,
            overflow: 'hidden'
          }}>
            {/* Table Controls (Search & Status Filter) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 18px',
              borderBottom: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 260 }}>
                <Search size={15} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search students by name or admission ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Filter:</span>
                {(['all', 'present', 'absent', 'late', 'not_taken'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    style={{
                      border: statusFilter === st ? '1px solid #715ee8' : '1px solid #e2e8f0',
                      background: statusFilter === st ? '#ede9fe' : '#fff',
                      color: statusFilter === st ? '#5b21b6' : '#64748b',
                      fontSize: '0.78rem',
                      fontWeight: statusFilter === st ? 700 : 500,
                      padding: '4px 10px',
                      borderRadius: 6,
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
                  onClick={loadClassAttendance}
                  style={{ height: 30, padding: '0 8px', fontSize: '0.78rem' }}
                  title="Reload attendance register"
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>

            {error && (
              <div className="error-bar" style={{ margin: '14px 18px 0' }}>
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                <RefreshCw size={22} className="spinning" style={{ display: 'inline-block', marginBottom: 8 }} />
                <div>Loading classroom attendance register...</div>
              </div>
            ) : records.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                No active students enrolled in this classroom on {dateVal}.
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 45 }}>#</th>
                      <th style={{ minWidth: 220 }}>STUDENT</th>
                      <th style={{ minWidth: 260 }}>ATTENDANCE STATUS</th>
                      <th style={{ minWidth: 180 }}>NOTES / REMARKS</th>
                      <th style={{ width: 100, textAlign: 'center' }}>RECORDED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((r, idx) => {
                      const initials = r.student_name
                        .split(/\s+/)
                        .map(p => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();

                      return (
                        <tr key={r.student_id}>
                          <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: r.gender === 'female' ? '#fce7f3' : '#e0e7ff',
                                color: r.gender === 'female' ? '#db2777' : '#4338ca',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.8rem'
                              }}>
                                {initials}
                              </div>
                              <div>
                                <strong style={{ fontSize: '0.9rem' }}>{r.student_name}</strong>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  Roll: <code>{r.admission_number}</code> {r.gender ? `· ${r.gender}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Attendance Status Buttons: Present, Absent, Late */}
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 8 }}>
                              {(['present', 'absent', 'late', 'excused'] as const).map(st => {
                                const isActive = r.status === st;
                                let activeStyle: React.CSSProperties = {};
                                if (isActive) {
                                  if (st === 'present') activeStyle = { background: '#16a34a', color: '#fff', fontWeight: 700, boxShadow: '0 1px 3px rgba(22, 163, 74, 0.3)' };
                                  if (st === 'absent') activeStyle = { background: '#dc2626', color: '#fff', fontWeight: 700, boxShadow: '0 1px 3px rgba(220, 38, 38, 0.3)' };
                                  if (st === 'late') activeStyle = { background: '#d97706', color: '#fff', fontWeight: 700, boxShadow: '0 1px 3px rgba(217, 119, 6, 0.3)' };
                                  if (st === 'excused') activeStyle = { background: '#7c3aed', color: '#fff', fontWeight: 700, boxShadow: '0 1px 3px rgba(124, 58, 237, 0.3)' };
                                }

                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => updateStudentStatus(r.student_id, st)}
                                    style={{
                                      border: 'none',
                                      background: isActive ? undefined : 'transparent',
                                      color: isActive ? undefined : '#475569',
                                      padding: '5px 11px',
                                      borderRadius: 6,
                                      fontSize: '0.8rem',
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

                            {/* Clear indicator if status is not taken yet */}
                            {r.status === 'not_taken' && (
                              <span style={{
                                marginLeft: 8,
                                background: '#fef3c7',
                                color: '#b45309',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 10,
                                border: '1px solid #fde68a'
                              }}>
                                Not Taken
                              </span>
                            )}
                          </td>

                          {/* Notes field */}
                          <td>
                            <input
                              type="text"
                              placeholder="Reason / note..."
                              value={r.note || ''}
                              onChange={e => updateStudentNote(r.student_id, e.target.value)}
                              style={{
                                width: '100%',
                                maxWidth: 220,
                                padding: '5px 8px',
                                fontSize: '0.8rem',
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                              }}
                            />
                          </td>

                          {/* Database Saved Status */}
                          <td style={{ textAlign: 'center' }}>
                            {r.is_recorded ? (
                              <span className="pill green" title="Recorded in campus database">
                                <Check size={11} /> Saved
                              </span>
                            ) : (
                              <span className="pill" style={{ color: '#94a3b8' }}>
                                Unsaved
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
