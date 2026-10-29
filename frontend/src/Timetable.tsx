import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Clock, Plus, Trash2, Pencil, Printer, Users, BookOpen,
  MapPin, Search, ChevronRight, X, AlertCircle, CheckCircle2, Filter,
  Building2, GraduationCap, Sparkles
} from 'lucide-react';
import { request, type User } from './api';
import ExportMenu from './ExportMenu';
import './hr.css';

type School = { id: number; name: string };
type SchoolClass = { id: number; name: string; school: number };
type Subject = { id: number; name: string; code?: string; school: number };
type TeacherUser = { id: number; username: string; first_name?: string; last_name?: string; email?: string; role?: string };

export type TimetableEntry = {
  id: number;
  school_class_id: number;
  school_class_name: string;
  day_of_week: number;
  day_name: string;
  period_number: number;
  start_time: string;
  end_time: string;
  subject_id: number;
  subject_name: string;
  subject_code?: string;
  teacher_id?: number | null;
  teacher_name?: string | null;
  room?: string;
};

const DAYS = [
  { day: 0, name: 'Monday', short: 'Mon' },
  { day: 1, name: 'Tuesday', short: 'Tue' },
  { day: 2, name: 'Wednesday', short: 'Wed' },
  { day: 3, name: 'Thursday', short: 'Thu' },
  { day: 4, name: 'Friday', short: 'Fri' },
  { day: 5, name: 'Saturday', short: 'Sat' },
];

const DEFAULT_PERIODS = [
  { period: 1, start: '08:30', end: '09:15', label: 'Period 1' },
  { period: 2, start: '09:15', end: '10:00', label: 'Period 2' },
  { period: 3, start: '10:00', end: '10:45', label: 'Period 3' },
  { period: 4, start: '11:15', end: '12:00', label: 'Period 4' },
  { period: 5, start: '12:00', end: '12:45', label: 'Period 5' },
  { period: 6, start: '12:45', end: '13:30', label: 'Period 6' },
  { period: 7, start: '13:30', end: '14:15', label: 'Period 7' },
  { period: 8, start: '14:15', end: '15:00', label: 'Period 8' },
];

export default function Timetable({ user, notify }: { user: User; notify: (msg: string) => void }) {
  const isManager = ['organisation_admin', 'school_admin', 'principal'].includes(user.role) || !!user.is_superuser;
  const isTeacher = user.role === 'teacher';

  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<number | null>(user.school || null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<TeacherUser[]>([]);
  const [timetables, setTimetables] = useState<TimetableEntry[]>([]);

  const [viewMode, setViewMode] = useState<'class' | 'teacher'>(isTeacher ? 'teacher' : 'class');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(isTeacher ? user.id : null);
  const [activeMobileDay, setActiveMobileDay] = useState<number>(() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 6 ? today - 1 : 0;
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [form, setForm] = useState({
    school_class: '',
    day_of_week: 0,
    period_number: 1,
    start_time: '08:30',
    end_time: '09:15',
    subject: '',
    teacher: '',
    room: ''
  });
  const [saving, setSaving] = useState(false);

  // Load reference metadata
  const loadReferenceData = useCallback(async () => {
    try {
      const [schRes, clsRes, subRes, tchRes] = await Promise.all([
        request('schools/').catch(() => ({ results: [] })),
        request('classes/').catch(() => ({ results: [] })),
        request('subjects/').catch(() => ({ results: [] })),
        request('teachers/').catch(() => ({ results: [] }))
      ]);

      const schData = schRes as { results?: School[] } | School[];
      const loadedSchools = (Array.isArray(schData) ? schData : schData?.results || []) as School[];
      setSchools(loadedSchools);
      if (!selectedSchool && loadedSchools.length > 0) {
        setSelectedSchool(user.school || loadedSchools[0].id);
      }

      const clsData = clsRes as { results?: SchoolClass[] } | SchoolClass[];
      setClasses((Array.isArray(clsData) ? clsData : clsData?.results || []) as SchoolClass[]);

      const subData = subRes as { results?: Subject[] } | Subject[];
      setSubjects((Array.isArray(subData) ? subData : subData?.results || []) as Subject[]);

      const tchData = tchRes as { results?: TeacherUser[] } | TeacherUser[];
      setTeachers((Array.isArray(tchData) ? tchData : tchData?.results || []) as TeacherUser[]);
    } catch (err) {
      console.error('Failed to load timetable metadata:', err);
    }
  }, [selectedSchool, user.school]);

  // Load Timetables
  const loadTimetables = useCallback(async () => {
    setLoading(true);
    try {
      let query = '';
      if (viewMode === 'class' && selectedClassId) {
        query = `?class=${selectedClassId}`;
      } else if (viewMode === 'teacher' && selectedTeacherId) {
        query = `?teacher=${selectedTeacherId}`;
      } else if (selectedSchool) {
        query = `?school=${selectedSchool}`;
      }

      const res = (await request(`timetables/${query}`)) as { results?: TimetableEntry[] };
      setTimetables(res?.results || []);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not fetch timetables');
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedClassId, selectedTeacherId, selectedSchool, notify]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) {
      const campusClasses = selectedSchool ? classes.filter(c => c.school === selectedSchool) : classes;
      if (campusClasses.length > 0) {
        setSelectedClassId(campusClasses[0].id);
      }
    }
  }, [classes, selectedSchool, selectedClassId]);

  useEffect(() => {
    loadTimetables();
  }, [loadTimetables]);

  const currentClasses = useMemo(() => {
    return selectedSchool ? classes.filter(c => !c.school || c.school === selectedSchool) : classes;
  }, [classes, selectedSchool]);

  const currentSubjects = useMemo(() => {
    return selectedSchool ? subjects.filter(s => !s.school || s.school === selectedSchool) : subjects;
  }, [subjects, selectedSchool]);

  const gridMap = useMemo(() => {
    const map = new Map<string, TimetableEntry>();
    for (const t of timetables) {
      if (viewMode === 'class' && selectedClassId && t.school_class_id !== selectedClassId) {
        continue;
      }
      if (viewMode === 'teacher' && selectedTeacherId && t.teacher_id !== selectedTeacherId) {
        continue;
      }
      map.set(`${t.day_of_week}-${t.period_number}`, t);
    }
    return map;
  }, [timetables, viewMode, selectedClassId, selectedTeacherId]);

  const handleOpenAdd = (day = 0, period = 1) => {
    const defaultPeriodInfo = DEFAULT_PERIODS.find(p => p.period === period) || DEFAULT_PERIODS[0];
    setEditingEntry(null);
    setForm({
      school_class: selectedClassId ? String(selectedClassId) : (currentClasses[0] ? String(currentClasses[0].id) : ''),
      day_of_week: day,
      period_number: period,
      start_time: defaultPeriodInfo.start,
      end_time: defaultPeriodInfo.end,
      subject: currentSubjects[0] ? String(currentSubjects[0].id) : '',
      teacher: selectedTeacherId ? String(selectedTeacherId) : (teachers[0] ? String(teachers[0].id) : ''),
      room: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (entry: TimetableEntry) => {
    setEditingEntry(entry);
    setForm({
      school_class: String(entry.school_class_id),
      day_of_week: entry.day_of_week,
      period_number: entry.period_number,
      start_time: entry.start_time,
      end_time: entry.end_time,
      subject: String(entry.subject_id),
      teacher: entry.teacher_id ? String(entry.teacher_id) : '',
      room: entry.room || ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.school_class || !form.subject) {
      notify('Class and Subject are required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        school_class: Number(form.school_class),
        day_of_week: Number(form.day_of_week),
        period_number: Number(form.period_number),
        start_time: form.start_time,
        end_time: form.end_time,
        subject: Number(form.subject),
        teacher: form.teacher ? Number(form.teacher) : null,
        room: form.room.trim()
      };

      if (editingEntry) {
        await request(`timetables/${editingEntry.id}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        notify('Timetable period updated successfully');
      } else {
        await request('timetables/', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        notify('Timetable period scheduled successfully');
      }

      setIsModalOpen(false);
      await loadTimetables();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save timetable entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request(`timetables/${id}/`, { method: 'DELETE' });
      notify('Period slot cleared');
      await loadTimetables();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete period');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedClassName = currentClasses.find(c => c.id === selectedClassId)?.name || 'All Classes';
  const selectedTeacherName = teachers.find(t => t.id === selectedTeacherId)?.username || 'All Teachers';

  return (
    <div className="timetable-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="eyebrow">STUDENTS & LEARNING / TIMETABLE</div>
          <h1>Class & Teacher Timetable</h1>
          <p>Weekly period scheduling, room allocations, and faculty timetables across academic cycles.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <ExportMenu
            title={`Weekly Timetable — ${viewMode === 'class' ? selectedClassName : selectedTeacherName}`}
            filename={`timetable-${(viewMode === 'class' ? selectedClassName : selectedTeacherName).toLowerCase().replace(/\s+/g, '-')}`}
            columns={[
              { key: 'day_name', label: 'Day' },
              { key: 'period_label', label: 'Period' },
              { key: 'time', label: 'Time' },
              { key: 'school_class_name', label: 'Class' },
              { key: 'subject_name', label: 'Subject' },
              { key: 'teacher_name', label: 'Teacher' },
              { key: 'room', label: 'Room' }
            ]}
            rows={() => timetables.map((e: TimetableEntry) => ({
              day_name: e.day_name,
              period_label: `Period ${e.period_number}`,
              time: `${e.start_time} - ${e.end_time}`,
              school_class_name: e.school_class_name,
              subject_name: e.subject_name,
              teacher_name: e.teacher_name || 'Unassigned',
              room: e.room || '—'
            }))}
            notify={notify}
          />
          <button type="button" className="outline-btn" onClick={handlePrint} title="Print Timetable">
            <Printer size={16} /> Print schedule
          </button>
          {isManager && (
            <button type="button" className="primary-btn" onClick={() => handleOpenAdd()}>
              <Plus size={16} /> Schedule period
            </button>
          )}
        </div>
      </div>

      {/* Control & Filter Toolbar */}
      <div className="panel" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            {/* View Mode Toggle */}
            <div style={{ display: 'flex', background: '#eef2f6', borderRadius: 8, padding: 3 }}>
              <button
                type="button"
                onClick={() => setViewMode('class')}
                style={{
                  border: 'none',
                  background: viewMode === 'class' ? '#ffffff' : 'transparent',
                  color: viewMode === 'class' ? '#0f172a' : '#64748b',
                  boxShadow: viewMode === 'class' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <GraduationCap size={15} /> Class View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('teacher')}
                style={{
                  border: 'none',
                  background: viewMode === 'teacher' ? '#ffffff' : 'transparent',
                  color: viewMode === 'teacher' ? '#0f172a' : '#64748b',
                  boxShadow: viewMode === 'teacher' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Users size={15} /> Teacher View
              </button>
            </div>

            {/* Campus Selector */}
            {schools.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Campus:</span>
                <select
                  value={selectedSchool || ''}
                  onChange={e => setSelectedSchool(Number(e.target.value) || null)}
                  style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Class Selector when in Class View */}
            {viewMode === 'class' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Class:</span>
                <select
                  value={selectedClassId || ''}
                  onChange={e => setSelectedClassId(Number(e.target.value) || null)}
                  style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, minWidth: 160 }}
                >
                  {currentClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {/* Teacher Selector when in Teacher View */}
            {viewMode === 'teacher' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Teacher:</span>
                <select
                  value={selectedTeacherId || ''}
                  onChange={e => setSelectedTeacherId(Number(e.target.value) || null)}
                  style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, minWidth: 180 }}
                >
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.first_name || t.last_name ? `${t.first_name || ''} ${t.last_name || ''}`.trim() : t.username}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarDays size={16} />
            <span>Schedule: <strong>{viewMode === 'class' ? selectedClassName : selectedTeacherName}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Weekly Timetable - Desktop Grid View */}
      <div className="panel desktop-timetable-panel" style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 860 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '14px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: 140 }}>
                Period & Time
              </th>
              {DAYS.map(d => (
                <th key={d.day} style={{ padding: '14px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                  {d.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEFAULT_PERIODS.map(p => {
              const isBreakPeriod = p.period === 4;
              return (
                <React.Fragment key={p.period}>
                  {isBreakPeriod && (
                    <tr style={{ background: '#f1f5f9', borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1' }}>
                      <td style={{ padding: '8px 16px', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        Break / Recess
                      </td>
                      <td colSpan={DAYS.length} style={{ padding: '8px 16px', fontSize: 12, color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>
                        10:45 AM – 11:15 AM • Recess & Refreshments
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderBottom: '1px solid #edf2f7' }}>
                    {/* Period Time Slot */}
                    <td style={{ padding: '14px 16px', background: '#fcfdfe', borderRight: '1px solid #f1f5f9' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13 }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Clock size={12} /> {p.start} – {p.end}
                      </div>
                    </td>

                    {/* Day Cells */}
                    {DAYS.map(d => {
                      const entry = gridMap.get(`${d.day}-${p.period}`);
                      return (
                        <td
                          key={d.day}
                          style={{
                            padding: '10px 12px',
                            borderRight: '1px solid #f8fafc',
                            verticalAlign: 'top',
                            height: 88,
                            position: 'relative'
                          }}
                        >
                          {entry ? (
                            <div
                              style={{
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: 8,
                                padding: '8px 10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                position: 'relative'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <span style={{ fontWeight: 700, color: '#166534', fontSize: 13 }}>
                                  {entry.subject_name}
                                </span>
                                {isManager && (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEdit(entry)}
                                      title="Edit period"
                                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#166534', padding: 2 }}
                                    >
                                      <Pencil size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(entry.id)}
                                      title="Clear period"
                                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {viewMode === 'teacher' ? (
                                <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>
                                  Class: {entry.school_class_name}
                                </div>
                              ) : (
                                <div style={{ fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Users size={11} /> {entry.teacher_name || 'Unassigned'}
                                </div>
                              )}

                              {entry.room && (
                                <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <MapPin size={11} /> {entry.room}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              style={{
                                height: '100%',
                                minHeight: 64,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 6,
                                border: '1px dashed #e2e8f0',
                                background: '#fafbfc'
                              }}
                            >
                              {isManager ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenAdd(d.day, p.period)}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#94a3b8',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  <Plus size={13} /> Assign
                                </button>
                              ) : (
                                <span style={{ fontSize: 11, color: '#cbd5e1' }}>Free</span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Timetable Day Selector & Timeline View */}
      <div className="mobile-timetable-section panel" style={{ padding: '16px', marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>
          Select Day
        </div>
        {/* Day Pills Bar */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
          {DAYS.map(d => {
            const active = activeMobileDay === d.day;
            return (
              <button
                key={d.day}
                type="button"
                onClick={() => setActiveMobileDay(d.day)}
                style={{
                  border: 'none',
                  background: active ? '#4f46e5' : '#f1f5f9',
                  color: active ? '#ffffff' : '#334155',
                  padding: '8px 16px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {d.name}
              </button>
            );
          })}
        </div>

        {/* Timeline list of periods for selected mobile day */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DEFAULT_PERIODS.map(p => {
            const entry = gridMap.get(`${activeMobileDay}-${p.period}`);
            return (
              <div
                key={p.period}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  background: entry ? '#ffffff' : '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '2px 8px', borderRadius: 4 }}>
                      {p.label}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {p.start} – {p.end}
                    </span>
                  </div>

                  {entry ? (
                    <>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginTop: 4 }}>
                        {entry.subject_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {viewMode === 'teacher' ? (
                          <span>Class: <strong>{entry.school_class_name}</strong></span>
                        ) : (
                          <span>Teacher: <strong>{entry.teacher_name || 'Unassigned'}</strong></span>
                        )}
                        {entry.room && <span>Room: <strong>{entry.room}</strong></span>}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>
                      No subject scheduled
                    </div>
                  )}
                </div>

                {isManager && (
                  <div>
                    {entry ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="outline-btn"
                          style={{ padding: '6px 10px' }}
                          onClick={() => handleOpenEdit(entry)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="outline-btn"
                          style={{ padding: '6px 10px', color: '#ef4444', borderColor: '#fca5a5' }}
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="outline-btn"
                        style={{ padding: '6px 10px' }}
                        onClick={() => handleOpenAdd(activeMobileDay, p.period)}
                      >
                        <Plus size={13} /> Assign
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Period Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div className="modal-card" style={{ maxWidth: 560, width: '95%' }}>
            <div className="modal-head">
              <div className="modal-icon">
                <CalendarDays size={20} />
              </div>
              <div>
                <h3>{editingEntry ? 'Edit Timetable Period' : 'Schedule Timetable Period'}</h3>
                <p>Assign class, subject, day, time and room location</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-fields hr-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', padding: '18px 24px' }}>
                {schools.length > 1 && user.role === 'organisation_admin' && (
                  <label className="wide">
                    School Campus *
                    <select
                      required
                      value={selectedSchool || ''}
                      onChange={e => setSelectedSchool(Number(e.target.value) || null)}
                    >
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                )}

                <label className="wide">
                  School Class *
                  <select
                    required
                    value={form.school_class}
                    onChange={e => setForm(f => ({ ...f, school_class: e.target.value }))}
                  >
                    <option value="">Select class…</option>
                    {currentClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>

                <label>
                  Day of Week *
                  <select
                    required
                    value={form.day_of_week}
                    onChange={e => setForm(f => ({ ...f, day_of_week: Number(e.target.value) }))}
                  >
                    {DAYS.map(d => <option key={d.day} value={d.day}>{d.name}</option>)}
                  </select>
                </label>

                <label>
                  Period Number *
                  <select
                    required
                    value={form.period_number}
                    onChange={e => {
                      const num = Number(e.target.value);
                      const def = DEFAULT_PERIODS.find(p => p.period === num);
                      setForm(f => ({
                        ...f,
                        period_number: num,
                        start_time: def ? def.start : f.start_time,
                        end_time: def ? def.end : f.end_time
                      }));
                    }}
                  >
                    {DEFAULT_PERIODS.map(p => (
                      <option key={p.period} value={p.period}>{p.label} ({p.start} - {p.end})</option>
                    ))}
                  </select>
                </label>

                <label>
                  Start Time *
                  <input
                    type="time"
                    required
                    value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  />
                </label>

                <label>
                  End Time *
                  <input
                    type="time"
                    required
                    value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  />
                </label>

                <label className="wide">
                  Subject *
                  <select
                    required
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  >
                    <option value="">Select subject…</option>
                    {currentSubjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>
                    ))}
                  </select>
                </label>

                <label className="wide">
                  Assigned Teacher (Optional)
                  <select
                    value={form.teacher}
                    onChange={e => setForm(f => ({ ...f, teacher: e.target.value }))}
                  >
                    <option value="">None / Unassigned</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.first_name || t.last_name ? `${t.first_name || ''} ${t.last_name || ''}`.trim() : t.username} ({t.email || t.username})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="wide">
                  Room / Location (Optional)
                  <input
                    type="text"
                    placeholder="e.g. Science Lab 2 or Room 104"
                    value={form.room}
                    onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
                  />
                </label>
              </div>

              <div className="modal-footer" style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="outline-btn" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={saving}>
                  {saving ? 'Saving…' : editingEntry ? 'Save Changes' : 'Schedule Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
