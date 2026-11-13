import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, X, Clock, CheckCircle2,
  XCircle, AlertCircle, FileText, User as UserIcon
} from 'lucide-react';
import { request } from './api';

export interface CalendarTarget {
  id: number;
  name: string;
  type: 'student' | 'staff';
  roleOrClass?: string;
  emailOrRoll?: string;
  campusName?: string;
  gender?: string;
}

interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  status: 'present' | 'absent' | 'late' | 'excused' | 'leave';
  note?: string;
}

interface HistoryData {
  user_info: {
    id: number;
    name: string;
    type: string;
    admission_number?: string;
    email?: string;
    role_or_class?: string;
    gender?: string;
    school_name?: string;
  };
  year: number;
  month: number;
  records: AttendanceRecord[];
  summary: {
    total_days: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    attendance_rate: number;
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AttendanceCalendarModal({
  target,
  onClose
}: {
  target: CalendarTarget;
  onClose: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const loadHistory = useCallback(async (yr: number, mo: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await request<HistoryData>(
        `attendance/history/?type=${target.type}&id=${target.id}&year=${yr}&month=${mo}`
      );
      setData(res);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to load attendance history.');
    } finally {
      setLoading(false);
    }
  }, [target.id, target.type]);

  useEffect(() => {
    loadHistory(currentYear, currentMonth);
  }, [loadHistory, currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const handleToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
  };

  // Map dates to status for quick O(1) lookup
  const recordsMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    if (data?.records) {
      for (const r of data.records) {
        map.set(r.date, r);
      }
    }
    return map;
  }, [data]);

  // Calendar grid calculation for currentYear & currentMonth
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const days: Array<{ dayNumber: number | null; dateStr: string | null }> = [];

    // Leading empty slots
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dayNumber: null, dateStr: null });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(currentMonth).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      days.push({
        dayNumber: d,
        dateStr: `${currentYear}-${monthStr}-${dayStr}`
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const initials = useMemo(() => {
    return (target.name || 'User')
      .split(/\s+/)
      .map(p => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [target.name]);

  const summary = data?.summary || {
    total_days: 0,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    attendance_rate: 0
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="modal-card"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #f8fafc, #ffffff)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: target.type === 'student'
                  ? (target.gender === 'female' ? '#fce7f3' : '#dbeafe')
                  : '#dbeafe',
                color: target.type === 'student'
                  ? (target.gender === 'female' ? '#db2777' : '#2563eb')
                  : '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '17px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
              }}
            >
              {initials}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  {target.name}
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: target.type === 'student' ? '#e0e7ff' : '#fef3c7',
                    color: target.type === 'student' ? '#3730a3' : '#92400e',
                    letterSpacing: '0.04em'
                  }}
                >
                  {target.type === 'student' ? 'Student' : 'Staff / Employee'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {target.roleOrClass && <span>{target.roleOrClass}</span>}
                {target.emailOrRoll && <span>• {target.emailOrRoll}</span>}
                {data?.user_info?.school_name && <span>• {data.user_info.school_name}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {target.type === 'student' && (
              <button
                type="button"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#eef2ff',
                  border: '1px solid #c7d2fe',
                  color: '#4f46e5',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('optimus_view_student_profile', { detail: { studentId: target.id } }));
                }}
                title="View full 360° student profile"
              >
                <UserIcon size={14} /> View 360° Profile
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                border: 'none',
                background: '#f1f5f9',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Month Navigation & Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Previous Month"
                >
                  <ChevronLeft size={18} />
                </button>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', minWidth: '150px', textAlign: 'center' }}>
                  {MONTH_NAMES[currentMonth - 1]} {currentYear}
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Next Month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <button
                type="button"
                onClick={handleToday}
                className="outline-btn"
                style={{ fontSize: '12px', padding: '6px 12px', borderRadius: '8px' }}
              >
                Today
              </button>
            </div>

            {/* Attendance Rate Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Attendance Rate:</span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: '20px',
                  background: summary.attendance_rate >= 85 ? '#dcfce7' : (summary.attendance_rate >= 70 ? '#fef3c7' : '#fee2e2'),
                  color: summary.attendance_rate >= 85 ? '#15803d' : (summary.attendance_rate >= 70 ? '#b45309' : '#b91c1c')
                }}
              >
                {summary.attendance_rate}%
              </span>
            </div>
          </div>

          {/* Monthly KPI Stats Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: '10px',
              marginBottom: '20px'
            }}
          >
            {/* Present */}
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '10px 14px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#166534', textTransform: 'uppercase', marginBottom: '4px' }}>
                Present
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803d' }}>
                {summary.present}
              </div>
              <div style={{ fontSize: '10px', color: '#166534', marginTop: '2px' }}>Hazir</div>
            </div>

            {/* Late */}
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '10px',
                padding: '10px 14px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', textTransform: 'uppercase', marginBottom: '4px' }}>
                Late
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#b45309' }}>
                {summary.late}
              </div>
              <div style={{ fontSize: '10px', color: '#92400e', marginTop: '2px' }}>Dair</div>
            </div>

            {/* Absent */}
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '10px 14px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase', marginBottom: '4px' }}>
                Absent
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#b91c1c' }}>
                {summary.absent}
              </div>
              <div style={{ fontSize: '10px', color: '#991b1b', marginTop: '2px' }}>Ghair Hazir</div>
            </div>

            {/* Leave / Excused */}
            <div
              style={{
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                borderRadius: '10px',
                padding: '10px 14px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b21a8', textTransform: 'uppercase', marginBottom: '4px' }}>
                Leave / Chutti
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#7e22ce' }}>
                {summary.excused}
              </div>
              <div style={{ fontSize: '10px', color: '#6b21a8', marginTop: '2px' }}>Excused</div>
            </div>

            {/* Total Recorded */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '10px 14px',
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                Recorded Days
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                {summary.total_days}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Total</div>
            </div>
          </div>

          {/* Loading / Error States */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: '14px' }}>
              Loading attendance calendar…
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {/* Calendar Grid */}
          {!loading && (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#fff'
              }}
            >
              {/* Day Headers (Sun - Sat) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  textAlign: 'center'
                }}
              >
                {WEEKDAYS.map((wd, i) => (
                  <div
                    key={wd}
                    style={{
                      padding: '10px 4px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: i === 0 || i === 6 ? '#94a3b8' : '#475569',
                      letterSpacing: '0.03em'
                    }}
                  >
                    {wd}
                  </div>
                ))}
              </div>

              {/* Day Cells Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  background: '#e2e8f0',
                  gap: '1px' // Creates clean grid lines
                }}
              >
                {calendarDays.map((cell, idx) => {
                  if (!cell.dayNumber || !cell.dateStr) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        style={{
                          background: '#f8fafc',
                          minHeight: '74px',
                          padding: '6px'
                        }}
                      />
                    );
                  }

                  const rec = recordsMap.get(cell.dateStr);
                  const isToday = cell.dateStr === todayStr;

                  let cellBg = '#ffffff';
                  let borderColor = 'transparent';
                  let badgeBg = '#f1f5f9';
                  let badgeColor = '#64748b';
                  let statusLabel = '';

                  if (rec) {
                    if (rec.status === 'present') {
                      cellBg = '#f0fdf4';
                      borderColor = '#86efac';
                      badgeBg = '#16a34a';
                      badgeColor = '#ffffff';
                      statusLabel = 'Present';
                    } else if (rec.status === 'late') {
                      cellBg = '#fffbeb';
                      borderColor = '#fde68a';
                      badgeBg = '#d97706';
                      badgeColor = '#ffffff';
                      statusLabel = 'Late';
                    } else if (rec.status === 'absent') {
                      cellBg = '#fef2f2';
                      borderColor = '#fca5a5';
                      badgeBg = '#dc2626';
                      badgeColor = '#ffffff';
                      statusLabel = 'Absent';
                    } else if (rec.status === 'excused' || rec.status === 'leave') {
                      cellBg = '#faf5ff';
                      borderColor = '#ddd6fe';
                      badgeBg = '#7c3aed';
                      badgeColor = '#ffffff';
                      statusLabel = 'Leave';
                    }
                  }

                  return (
                    <div
                      key={cell.dateStr}
                      style={{
                        background: cellBg,
                        minHeight: '74px',
                        padding: '6px 8px',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isToday ? 'inset 0 0 0 2px #6366f1' : (borderColor !== 'transparent' ? `inset 0 0 0 1px ${borderColor}` : undefined),
                        transition: 'background-color 0.15s'
                      }}
                    >
                      {/* Day Number and Today Indicator */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: isToday ? 800 : 600,
                            color: isToday ? '#4338ca' : (rec ? '#0f172a' : '#64748b'),
                            width: '20px',
                            height: '20px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            background: isToday ? '#e0e7ff' : 'transparent'
                          }}
                        >
                          {cell.dayNumber}
                        </span>
                        {rec?.note && (
                          <span title={rec.note} style={{ cursor: 'help', color: '#94a3b8' }}>
                            <FileText size={12} />
                          </span>
                        )}
                      </div>

                      {/* Status Badge */}
                      {rec ? (
                        <div style={{ marginTop: '4px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: badgeBg,
                              color: badgeColor,
                              fontSize: '10px',
                              fontWeight: 700,
                              letterSpacing: '0.02em',
                              textAlign: 'center',
                              width: '100%',
                              boxSizing: 'border-box'
                            }}
                          >
                            {statusLabel}
                          </span>
                          {rec.note && (
                            <div
                              style={{
                                fontSize: '9px',
                                color: '#475569',
                                marginTop: '2px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={rec.note}
                            >
                              {rec.note}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ height: '18px' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Color Legend */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: '#f8fafc',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              flexWrap: 'wrap',
              gap: '12px',
              border: '1px solid #f1f5f9'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#16a34a' }} />
              <strong>Present</strong> <span style={{ color: '#64748b' }}>(Aya / Hazir)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#d97706' }} />
              <strong>Late</strong> <span style={{ color: '#64748b' }}>(Dair say aya)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#dc2626' }} />
              <strong>Absent</strong> <span style={{ color: '#64748b' }}>(Ghair Hazir)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#334155' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#7c3aed' }} />
              <strong>Leave / Chutti</strong> <span style={{ color: '#64748b' }}>(Excused)</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#ffffff'
          }}
        >
          <button type="button" className="primary-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
