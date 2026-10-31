import React, { useEffect, useState } from 'react';
import {
  ClipboardCheck,
  Calendar,
  AlertTriangle,
  Download,
  Info,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { request, API_BASE_URL } from './api';

interface Props {
  user: any;
  notify?: (msg: string) => void;
}

export const StudentAttendance: React.FC<Props> = ({ user, notify }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState('academic_year');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadAttendance();
  }, [range]);

  const loadAttendance = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = `range=${range}`;
      if (range === 'custom') {
        if (startDate) query += `&start_date=${startDate}`;
        if (endDate) query += `&end_date=${endDate}`;
      }
      const res: any = await request(`student/attendance/?${query}`);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Could not load attendance records.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomFilter = (e: React.FormEvent) => {
    e.preventDefault();
    loadAttendance();
  };

  const handleDownloadCsv = () => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const url = `${API_BASE_URL}student/attendance/?range=${range}&format=csv`;
    window.open(url, '_blank');
  };

  if (loading && !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Loading attendance records…</div>
      </div>
    );
  }

  const summary = data?.summary;
  const calendarDays = data?.calendar_days || [];
  const monthlyTrend = data?.monthly_trend || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* Page Header & Range Controls */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <ClipboardCheck size={20} color="#4f46e5" />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>My Attendance</h2>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Comprehensive overview of class sessions, attendance rates, and day-by-day logs.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
            {[
              { id: 'academic_year', label: 'Academic Year' },
              { id: 'term', label: 'This Term' },
              { id: 'last_30_days', label: 'Last 30 Days' },
              { id: 'custom', label: 'Custom' }
            ].map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                style={{
                  background: range === r.id ? '#ffffff' : 'transparent',
                  color: range === r.id ? '#0f172a' : '#64748b',
                  fontWeight: range === r.id ? 700 : 500,
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  boxShadow: range === r.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleDownloadCsv}
            style={{
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Download size={14} /> Download CSV
          </button>
        </div>
      </div>

      {/* Custom Date Filter Drawer */}
      {range === 'custom' && (
        <form onSubmit={handleCustomFilter} style={{
          background: '#f8fafc',
          borderRadius: 12,
          padding: '14px 20px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginRight: 6 }}>From:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginRight: 6 }}>To:</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
            />
          </div>
          <button
            type="submit"
            style={{
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Apply Range
          </button>
        </form>
      )}

      {/* Consecutive Absences Alert */}
      {summary?.consecutive_alert && (
        <div style={{
          background: '#fff1f2',
          border: '1px solid #fecdd3',
          padding: '14px 18px',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: '#9f1239'
        }}>
          <AlertTriangle size={20} color="#e11d48" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {summary.consecutive_alert}
          </div>
        </div>
      )}

      {/* Top 4 Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {/* Rate Card */}
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Attendance Rate
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 12,
                background: summary.status.color + '20',
                color: summary.status.color
              }}>
                {summary.status.label}
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', margin: '8px 0 4px' }}>
              {summary.rate}%
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              {summary.formula}
            </div>
          </div>

          {/* Present Card */}
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a' }}>
              <CheckCircle2 size={16} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Present Days</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#16a34a', margin: '8px 0 4px' }}>
              {summary.present_count}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {summary.late_count > 0 ? `Plus ${summary.late_count} marked late` : 'On-time attendance'}
            </div>
          </div>

          {/* Absent Card */}
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626' }}>
              <XCircle size={16} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Absent Days</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#dc2626', margin: '8px 0 4px' }}>
              {summary.absent_count}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {summary.consecutive_absences > 0 ? `Max ${summary.consecutive_absences} consecutive absences` : 'No long streaks'}
            </div>
          </div>

          {/* Leave Card */}
          <div style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb' }}>
              <Clock size={16} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Approved Leave</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#2563eb', margin: '8px 0 4px' }}>
              {summary.leave_count}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.2 }}>
              Excluded from rate denominator
            </div>
          </div>
        </div>
      )}

      {/* Calendar Heat-Map Section */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: 24,
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="#4f46e5" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Attendance Calendar Log</h3>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#22c55e' }} /> Present
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }} /> Late
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444' }} /> Absent
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#3b82f6' }} /> Leave
            </span>
          </div>
        </div>

        {calendarDays.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))',
            gap: 6
          }}>
            {calendarDays.map((day: any) => {
              let bg = '#22c55e';
              let text = 'Present';
              if (day.status === 'late') {
                bg = '#f59e0b';
                text = 'Late';
              } else if (day.status === 'absent') {
                bg = '#ef4444';
                text = 'Absent';
              } else if (day.status === 'leave' || day.status === 'excused') {
                bg = '#3b82f6';
                text = 'Leave';
              }
              const dNum = day.date.slice(8);
              return (
                <div
                  key={day.date}
                  title={`${day.date}: ${text}`}
                  style={{
                    aspectRatio: '1',
                    background: bg + '20',
                    border: `1.5px solid ${bg}`,
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 800, color: bg }}>{dNum}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 13 }}>
            No attendance records found for this period.
          </div>
        )}
      </div>

      {/* Monthly Trend Chart */}
      {monthlyTrend.length > 0 && (
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
            Monthly Attendance Trend (%)
          </h3>
          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(val: any) => [`${val}%`, 'Attendance Rate']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 12 }}
                />
                <Bar dataKey="rate" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
