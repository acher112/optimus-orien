import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, ClipboardCheck, Award, AlertCircle, RefreshCw,
  Search, ShieldAlert, ArrowUpRight, CheckCircle2, ChevronRight
} from 'lucide-react';
import { request, type User } from './api';

interface TeacherMyClassProps {
  user: User;
  onNavigate: (page: string) => void;
  notify: (msg: string) => void;
}

export default function TeacherMyClass({ user, onNavigate, notify }: TeacherMyClassProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [fatherFilter, setFatherFilter] = useState('');

  const load = useCallback(async (classId?: number | null) => {
    setLoading(true);
    setError('');
    try {
      const url = classId ? `/api/v1/teacher/my-class/?class_id=${classId}` : '/api/v1/teacher/my-class/';
      const res: any = await request(url);
      setData(res);
      if (!selectedClassId && res?.class_info?.id) {
        setSelectedClassId(res.class_info.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load class overview.');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    load(selectedClassId);
  }, [selectedClassId, load]);

  if (loading && !data) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '0 auto 16px', color: '#7862d7' }} />
        <p style={{ color: '#6b7280' }}>Loading your homeroom class...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="error-bar" style={{ margin: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <AlertCircle size={20} />
        <span>{error}</span>
        <button onClick={() => load(selectedClassId)} className="primary-btn" style={{ marginLeft: 'auto', padding: '6px 12px' }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const { class_info, my_classes, total_students, attendance_today, attendance_rate, subjects, students, review_cases } = data;

  const filteredStudents = (students || []).filter((s: any) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = s.full_name?.toLowerCase().includes(q) || s.admission_number?.toLowerCase().includes(q);
      if (!matchName) return false;
    }
    if (fatherFilter) {
      const qf = fatherFilter.toLowerCase();
      if (!s.father_name?.toLowerCase().includes(qf)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: '#7862d7', textTransform: 'uppercase', marginBottom: '4px' }}>
            CLASS TEACHER PORTAL
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text-primary, #111827)' }}>
            My Class: {class_info?.display_name}
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0' }}>
            Academic year: {class_info?.academic_year || 'Current'} • Grade {class_info?.grade_level || '—'}
          </p>
        </div>

        {my_classes && my_classes.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Switch Class:</span>
            <select
              value={selectedClassId || class_info?.id}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px' }}
            >
              {my_classes.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: 'var(--surface, #fff)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Enrolled Students</div>
          <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px' }}>{total_students}</div>
        </div>

        <div style={{ background: 'var(--surface, #fff)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Today's Register</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginTop: '10px' }}>
            {attendance_today === 'submitted' ? (
              <span style={{ color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={18} /> Marked
              </span>
            ) : (
              <span style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={18} /> Pending
              </span>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--surface, #fff)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Class Attendance Rate</div>
          <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px', color: '#7862d7' }}>
            {attendance_rate !== null ? `${attendance_rate}%` : '—'}
          </div>
        </div>

        <div style={{ background: 'var(--surface, #fff)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border, #e5e7eb)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Open Review Cases</div>
          <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px', color: review_cases?.length > 0 ? '#b45309' : '#15803d' }}>
            {review_cases?.length || 0}
          </div>
        </div>
      </div>

      {/* Subjects Overview */}
      <div style={{ background: 'var(--surface, #fff)', borderRadius: '14px', border: '1px solid var(--border, #e5e7eb)', padding: '20px', marginBottom: '28px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>Subject Averages for Your Class</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {(subjects || []).map((sub: any) => (
            <div key={sub.subject_id} style={{ padding: '14px', borderRadius: '10px', background: '#f9fafb', border: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#374151' }}>{sub.subject_name}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: sub.average !== null && sub.average >= 70 ? '#15803d' : '#374151', margin: '4px 0' }}>
                {sub.average !== null ? `${sub.average}%` : 'No marks'}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{sub.coverage_text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Students Roster */}
      <div style={{ background: 'var(--surface, #fff)', borderRadius: '14px', border: '1px solid var(--border, #e5e7eb)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px' }}>
              Class Students ({filteredStudents.length} of {total_students})
            </h3>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
              Full student profile accessible to class teacher (including father name & guardian contact).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '9px', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Search student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ padding: '6px 10px 6px 32px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', width: '180px' }}
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Filter by Father Name..."
                value={fatherFilter}
                onChange={(e) => setFatherFilter(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', width: '180px' }}
              />
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                <th style={{ padding: '10px 8px' }}>Admission #</th>
                <th style={{ padding: '10px 8px' }}>Student</th>
                <th style={{ padding: '10px 8px' }}>Father Name</th>
                <th style={{ padding: '10px 8px' }}>Guardian Contact</th>
                <th style={{ padding: '10px 8px' }}>DOB</th>
                <th style={{ padding: '10px 8px' }}>Gender</th>
                <th style={{ padding: '10px 8px' }}>Attendance</th>
                <th style={{ padding: '10px 8px' }}>Overall Avg</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((st: any) => (
                <tr key={st.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 8px', color: '#6b7280', fontWeight: 500 }}>{st.admission_number}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>{st.full_name}</td>
                  <td style={{ padding: '10px 8px' }}>{st.father_name || '—'}</td>
                  <td style={{ padding: '10px 8px', color: '#4b5563' }}>{st.guardian_phone || '—'}</td>
                  <td style={{ padding: '10px 8px', color: '#6b7280' }}>{st.date_of_birth || '—'}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span style={{
                      padding: '2px 6px', borderRadius: '4px', fontSize: '11px',
                      background: st.gender === 'male' ? '#eff6ff' : '#fdf2f8',
                      color: st.gender === 'male' ? '#1d4ed8' : '#be185d'
                    }}>
                      {st.gender === 'male' ? 'Boy' : st.gender === 'female' ? 'Girl' : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px' }}>{st.attendance_rate !== null ? `${st.attendance_rate}%` : '—'}</td>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                    {st.overall_average !== null ? `${st.overall_average}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
