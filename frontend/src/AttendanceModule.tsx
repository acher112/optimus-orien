import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Users, CalendarDays, CheckCircle2, Clock,
  AlertTriangle, XCircle, RefreshCw, Save, Check, Search,
  ChevronRight, ArrowRight, UserCheck, Filter, AlertCircle, User as UserIcon,
  Eye, Edit3
} from 'lucide-react';
import { list, request, type User } from './api';
import StaffAttendanceRegister from './StaffAttendanceRegister';
import AttendanceCalendarModal, { CalendarTarget } from './AttendanceCalendarModal';

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
  activeCampusId?: number | null;
}

export default function AttendanceModule({ user, notify, campuses = [], activeCampusId }: AttendanceModuleProps) {
  const isManager = Boolean(user.is_superuser || !['student', 'parent'].includes(user.role));
  const [activeTab, setActiveTab] = useState<'student' | 'staff'>('student');

  // Multi-campus handling for Org Admin
  const [schoolId, setSchoolId] = useState<string>(() => (activeCampusId ? String(activeCampusId) : (user.school ? String(user.school) : '')));
  const [schools, setSchools] = useState<Array<{ id: number; name: string }>>(campuses);

  useEffect(() => {
    if (activeCampusId) {
      setSchoolId(String(activeCampusId));
    }
  }, [activeCampusId]);

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
  const [calendarTarget, setCalendarTarget] = useState<CalendarTarget | null>(null);
  const [attendanceMode, setAttendanceMode] = useState<'view' | 'mark'>('view');

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
      <div className="page-header" style={{ marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.02em' }}>Attendance Register</h1>
        </div>

        {/* Sub-tabs Switcher */}
        {isManager && (
          <div style={{
            display: 'inline-flex',
            background: '#ffffff',
            padding: '4px',
            borderRadius: '10px',
            border: '1.5px solid #e2e8f0',
            gap: '4px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <button
              type="button"
              className={`pill-btn ${activeTab === 'student' ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'student' ? 'var(--brand-primary, #06b6d4)' : 'transparent',
                color: activeTab === 'student' ? '#ffffff' : '#64748b',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'student' ? '0 2px 8px rgba(6, 182, 212, 0.35)' : 'none',
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
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'staff' ? 'var(--brand-primary, #06b6d4)' : 'transparent',
                color: activeTab === 'staff' ? '#ffffff' : '#7c3aed',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'staff' ? '0 2px 8px rgba(6, 182, 212, 0.35)' : 'none',
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
        <StaffAttendanceRegister user={user} notify={notify} activeCampusId={activeCampusId} campuses={campuses} />
      )}

      {/* SUB-TAB 1: STUDENT ATTENDANCE */}
      {activeTab === 'student' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Filter Bar Panel: Class selector + Date Picker */}
          <section className="panel" style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1.5px solid #e2e8f0',
            padding: '1.25rem 1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Mode Switcher: View Attendance vs Mark Or Edit Attendance */}
            <div style={{
              display: 'flex',
              gap: 10,
              marginBottom: 16,
              paddingBottom: 16,
              borderBottom: '1px solid #f1f5f9',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                REGISTER MODE:
              </span>
              <button
                type="button"
                onClick={() => setAttendanceMode('view')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontSize: '0.86rem',
                  fontWeight: attendanceMode === 'view' ? 750 : 600,
                  background: attendanceMode === 'view' ? '#4f46e5' : '#ffffff',
                  color: attendanceMode === 'view' ? '#ffffff' : '#4f46e5',
                  border: attendanceMode === 'view' ? '1px solid #4f46e5' : '1.5px solid #6366f1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: attendanceMode === 'view' ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none'
                }}
              >
                <Eye size={15} /> View Attendance
              </button>
              <button
                type="button"
                onClick={() => setAttendanceMode('mark')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontSize: '0.86rem',
                  fontWeight: attendanceMode === 'mark' ? 750 : 600,
                  background: attendanceMode === 'mark' ? '#4f46e5' : '#ffffff',
                  color: attendanceMode === 'mark' ? '#ffffff' : '#4f46e5',
                  border: attendanceMode === 'mark' ? '1px solid #4f46e5' : '1.5px solid #6366f1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: attendanceMode === 'mark' ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'none'
                }}
              >
                <Edit3 size={15} /> Mark Or Edit Attendance
              </button>
            </div>

            {/* Form Controls Row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* Campus Filter (Org Admin) */}
                {schools.length > 1 && (user.role === 'organisation_admin' || user.is_superuser) && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.78rem', fontWeight: 750, color: '#475569', letterSpacing: '0.04em' }}>
                    CAMPUS:
                    <select
                      className="fx-select"
                      value={schoolId}
                      onChange={e => setSchoolId(e.target.value)}
                      style={{ height: 42, padding: '0 14px', fontSize: '0.88rem', fontWeight: 700, borderRadius: 8, border: '1.5px solid #cbd5e1', background: '#ffffff', minWidth: 200 }}
                    >
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}

                {/* Class Selector Filter */}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.78rem', fontWeight: 750, color: '#475569', letterSpacing: '0.04em' }}>
                  CLASSROOM:
                  <select
                    className="fx-select"
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    style={{ height: 42, padding: '0 14px', fontSize: '0.88rem', borderRadius: 8, minWidth: 220, fontWeight: 700, color: '#1e293b', border: '1.5px solid #cbd5e1', background: '#ffffff' }}
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
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.78rem', fontWeight: 750, color: '#475569', letterSpacing: '0.04em' }}>
                  ATTENDANCE DATE:
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      className="fx-select"
                      value={dateVal}
                      onChange={e => setDateVal(e.target.value)}
                      style={{ height: 42, padding: '0 12px', fontSize: '0.88rem', fontWeight: 700, borderRadius: 8, border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#1e293b', width: 140 }}
                    />
                    <button
                      type="button"
                      onClick={() => setQuickDate(0)}
                      style={{
                        height: 42,
                        padding: '0 18px',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        borderRadius: 8,
                        border: 'none',
                        background: '#06b6d4',
                        color: '#ffffff',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(6, 182, 212, 0.25)',
                        transition: 'all 0.15s ease'
                      }}
                      title="Today's attendance"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDate(1)}
                      style={{
                        height: 42,
                        padding: '0 18px',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        borderRadius: 8,
                        border: 'none',
                        background: '#0284c7',
                        color: '#ffffff',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                        transition: 'all 0.15s ease'
                      }}
                      title="Yesterday's attendance"
                    >
                      Yesterday
                    </button>
                  </div>
                </label>
              </div>

              {/* Mode switch or action row */}
              <div style={{ marginTop: 2 }}>
                {attendanceMode === 'view' ? (
                  <button
                    type="button"
                    onClick={() => setAttendanceMode('mark')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 38,
                      padding: '0 16px',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      borderRadius: 8,
                      border: '1.5px solid #6366f1',
                      background: '#ffffff',
                      color: '#4f46e5',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Edit3 size={14} /> Switch to Mark / Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="outline-btn"
                      onClick={markAllPresent}
                      disabled={loading || records.length === 0}
                      style={{ height: 38, fontSize: '0.85rem', fontWeight: 700 }}
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
                        fontWeight: 700,
                        padding: '0 20px',
                        opacity: isSubmitDisabled ? 0.6 : 1,
                        cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                        background: dirty ? '#16a34a' : 'var(--brand-primary, #06b6d4)',
                        borderColor: dirty ? '#16a34a' : 'var(--brand-primary, #06b6d4)',
                        boxShadow: '0 2px 8px rgba(6, 182, 212, 0.3)',
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
                )}
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
                        border: isSelected ? '1.5px solid #06b6d4' : '1px solid #e2e8f0',
                        background: isSelected ? '#ecfeff' : '#f8fafc',
                        color: isSelected ? '#0891b2' : '#475569',
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
            background: isConducted ? '#ecfdf5' : '#ffedd5',
            border: isConducted ? '1.5px solid #a7f3d0' : '1.5px solid #fed7aa',
            borderRadius: '12px',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {isConducted ? (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#d1fae5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle2 size={20} />
                </div>
              ) : (
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fed7aa', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={20} />
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.94rem', fontWeight: 800, color: isConducted ? '#065f46' : '#9a3412', marginBottom: 2 }}>
                  {isConducted
                    ? `Attendance Conducted on ${dateVal}`
                    : `Attendance Not Recorded Yet for ${dateVal}`}
                </div>
                <div style={{ fontSize: '0.82rem', color: isConducted ? '#047857' : '#c2410c', fontWeight: 500 }}>
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
                fontWeight: 750,
                padding: '4px 12px',
                borderRadius: '8px',
                border: '1px solid #fde68a'
              }}>
                ✎ Unsaved modifications detected
              </span>
            )}
          </div>

          {/* Summary Strip: 6 Individual Vibrant Cards (Exact Single-Row 6-Column Layout) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            gap: '12px',
            width: '100%'
          }}>
            {/* Card 1: TOTAL ENROLLED */}
            <div
              onClick={() => setStatusFilter('all')}
              style={{
                background: '#eef2ff',
                border: '1.5px solid #c7d2fe',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(99, 102, 241, 0.08)',
                transition: 'all 0.2s ease',
                minWidth: 0
              }}
              title="Click to show all students"
            >
              <Users size={22} color="#4f46e5" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.68rem', color: '#4338ca', fontWeight: 750, letterSpacing: '0.03em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>TOTAL ENROLLED</div>
                <div style={{ fontSize: '1.55rem', fontWeight: 850, color: '#1e1b4b', lineHeight: 1.1, marginTop: 2 }}>{liveSummary.total}</div>
              </div>
            </div>

            {/* Card 2: PRESENT */}
            <div
              onClick={() => setStatusFilter('present')}
              style={{
                background: '#dcfce7',
                border: '1.5px solid #86efac',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.08)',
                transition: 'all 0.2s ease',
                minWidth: 0
              }}
              title="Click to filter by Present students"
            >
              <CheckCircle2 size={22} color="#16a34a" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.68rem', color: '#15803d', fontWeight: 750, letterSpacing: '0.03em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>PRESENT</div>
                <div style={{ fontSize: '1.55rem', fontWeight: 850, color: '#14532d', lineHeight: 1.1, marginTop: 2 }}>{liveSummary.present}</div>
              </div>
            </div>

            {/* Card 3: ABSENT */}
            <div
              onClick={() => setStatusFilter('absent')}
              style={{
                background: '#ffe4e6',
                border: '1.5px solid #fecdd3',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(225, 29, 72, 0.08)',
                transition: 'all 0.2s ease',
                minWidth: 0
              }}
              title="Click to filter by Absent students"
            >
              <XCircle size={22} color="#e11d48" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.68rem', color: '#be123c', fontWeight: 750, letterSpacing: '0.03em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>ABSENT</div>
                <div style={{ fontSize: '1.55rem', fontWeight: 850, color: '#881337', lineHeight: 1.1, marginTop: 2 }}>{liveSummary.absent}</div>
              </div>
            </div>

            {/* Card 4: LATE */}
            <div
              onClick={() => setStatusFilter('late')}
              style={{
                background: '#fef3c7',
                border: '1.5px solid #fde68a',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(217, 119, 6, 0.08)',
                transition: 'all 0.2s ease',
                minWidth: 0
              }}
              title="Click to filter by Late students"
            >
              <Clock size={22} color="#d97706" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.68rem', color: '#b45309', fontWeight: 750, letterSpacing: '0.03em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>LATE</div>
                <div style={{ fontSize: '1.55rem', fontWeight: 850, color: '#78350f', lineHeight: 1.1, marginTop: 2 }}>{liveSummary.late}</div>
              </div>
            </div>

            {/* Card 5: NOT TAKEN */}
            <div
              onClick={() => setStatusFilter('not_taken')}
              style={{
                background: '#ede9fe',
                border: '1.5px solid #ddd6fe',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(124, 58, 237, 0.08)',
                transition: 'all 0.2s ease',
                minWidth: 0
              }}
              title="Click to filter by Not Taken students"
            >
              <AlertTriangle size={22} color="#7c3aed" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.68rem', color: '#6d28d9', fontWeight: 750, letterSpacing: '0.03em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>NOT TAKEN</div>
                <div style={{ fontSize: '1.55rem', fontWeight: 850, color: '#4c1d95', lineHeight: 1.1, marginTop: 2 }}>{liveSummary.not_taken}</div>
              </div>
            </div>

            {/* Card 6: ATTENDANCE RATE with Progress Bar */}
            <div
              onClick={() => setStatusFilter('all')}
              style={{
                background: '#cffafe',
                border: '1.5px solid #a5f3fc',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(6, 182, 212, 0.08)',
                transition: 'all 0.2s ease',
                minWidth: 0
              }}
              title="Attendance rate across enrolled students"
            >
              <ClipboardCheck size={22} color="#0891b2" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.68rem', color: '#0e7490', fontWeight: 750, letterSpacing: '0.03em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>ATTENDANCE RATE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: '1.55rem', fontWeight: 850, color: '#155e75', lineHeight: 1.1 }}>
                    {liveSummary.rate !== null ? `${Math.round(liveSummary.rate)}%` : '—'}
                  </span>
                  <div style={{ flex: 1, minWidth: 24, height: 6, background: 'rgba(8, 145, 178, 0.2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${liveSummary.rate !== null ? Math.min(100, Math.max(0, liveSummary.rate)) : 0}%`, height: '100%', background: '#06b6d4', borderRadius: 999 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Student Register Table */}
          <section className="panel" style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1.5px solid #e2e8f0',
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            {/* Table Controls (Search & Status Filter) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 20px',
              borderBottom: '1px solid #e2e8f0',
              background: '#ffffff',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', minWidth: 280 }}>
                <Search size={16} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search students by name or adm..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.86rem', fontWeight: 500, color: '#1e293b', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Filter:</span>
                {(['all', 'present', 'absent', 'late', 'not_taken'] as const).map(st => {
                  const isSel = statusFilter === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      style={{
                        border: isSel ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
                        background: isSel ? '#ede9fe' : '#ffffff',
                        color: isSel ? '#4f46e5' : '#64748b',
                        fontSize: '0.82rem',
                        fontWeight: isSel ? 750 : 600,
                        padding: '6px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {st === 'all' ? 'All' : st.replace('_', ' ')}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={loadClassAttendance}
                  style={{
                    height: 34,
                    width: 34,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Reload attendance register"
                >
                  <RefreshCw size={14} />
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
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                              onClick={() => setCalendarTarget({
                                id: r.student_id,
                                name: r.student_name,
                                type: 'student',
                                roleOrClass: classInfo.name ? `${classInfo.name} ${classInfo.section || ''}`.trim() : undefined,
                                emailOrRoll: `Roll: ${r.admission_number}`,
                                gender: r.gender
                              })}
                              title="Click to view full attendance calendar"
                            >
                              <div style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: r.gender === 'female' ? '#fce7f3' : '#dbeafe',
                                color: r.gender === 'female' ? '#db2777' : '#2563eb',
                                border: `1.5px solid ${r.gender === 'female' ? '#fbcfe8' : '#bfdbfe'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.8rem'
                              }}>
                                {initials}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>{r.student_name}</strong>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.dispatchEvent(new CustomEvent('optimus_view_student_profile', { detail: { studentId: r.student_id } }));
                                    }}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      background: '#eef2ff',
                                      border: '1px solid #c7d2fe',
                                      color: '#4f46e5',
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                    title="View 360° Profile"
                                  >
                                    <UserIcon size={10} /> Profile
                                  </button>
                                  <span title="Attendance calendar"><CalendarDays size={13} color="#6366f1" /></span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  Roll: <code>{r.admission_number}</code> {r.gender ? (
                                    <span style={{
                                      marginLeft: 6,
                                      padding: '1px 6px',
                                      borderRadius: 8,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: r.gender === 'female' ? '#fce7f3' : '#dbeafe',
                                      color: r.gender === 'female' ? '#db2777' : '#2563eb',
                                      border: `1px solid ${r.gender === 'female' ? '#fbcfe8' : '#bfdbfe'}`
                                    }}>
                                      {r.gender === 'female' ? 'Girl' : 'Boy'}
                                    </span>
                                  ) : ''}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Attendance Status */}
                          <td>
                            {attendanceMode === 'mark' ? (
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
                            ) : (
                              /* Clean Read-Only Status Badges in 'view' mode */
                              <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                                {r.status === 'present' && (
                                  <span className="pill green" style={{ fontSize: '0.82rem', padding: '5px 12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <CheckCircle2 size={13} /> Present
                                  </span>
                                )}
                                {r.status === 'absent' && (
                                  <span className="pill red" style={{ fontSize: '0.82rem', padding: '5px 12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <XCircle size={13} /> Absent
                                  </span>
                                )}
                                {r.status === 'late' && (
                                  <span className="pill amber" style={{ fontSize: '0.82rem', padding: '5px 12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <Clock size={13} /> Late
                                  </span>
                                )}
                                {r.status === 'excused' && (
                                  <span className="pill purple" style={{ fontSize: '0.82rem', padding: '5px 12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <AlertTriangle size={13} /> Excused
                                  </span>
                                )}
                                {r.status === 'not_taken' && (
                                  <span style={{
                                    background: '#fef3c7',
                                    color: '#b45309',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    borderRadius: 10,
                                    border: '1px solid #fde68a'
                                  }}>
                                    Not Recorded
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Clear indicator if status is not taken yet in mark mode */}
                            {attendanceMode === 'mark' && r.status === 'not_taken' && (
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
                            {attendanceMode === 'mark' ? (
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
                            ) : (
                              <span style={{ fontSize: '0.82rem', color: r.note ? '#334155' : '#94a3b8', fontStyle: r.note ? 'normal' : 'italic' }}>
                                {r.note || '—'}
                              </span>
                            )}
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
      {calendarTarget && (
        <AttendanceCalendarModal
          target={calendarTarget}
          onClose={() => setCalendarTarget(null)}
        />
      )}
    </div>
  );
}
