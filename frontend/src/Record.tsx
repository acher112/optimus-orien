import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Users, GraduationCap, Receipt, Wallet, Banknote, Download,
  Filter, Plus, RefreshCw, AlertCircle, CheckCircle2, ChevronRight, X,
  TrendingUp, Calendar, AlertTriangle
} from 'lucide-react';
import { type User } from './api';
import './record.css';

interface RecordProps {
  page?: string;
  user: User;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  activeCampusId?: number | null;
  campuses?: any[];
  onNavigate?: (page: string) => void;
}

type RecordTab = 'overview' | 'staff' | 'students' | 'fees' | 'finance' | 'salaries';

export default function Record({
  page = 'Record',
  user,
  notify,
  activeCampusId,
  campuses = [],
  onNavigate
}: RecordProps) {
  // Map page prop to active tab
  const getInitialTab = (): RecordTab => {
    const p = page.toLowerCase();
    if (p.includes('staff')) return 'staff';
    if (p.includes('student')) return 'students';
    if (p.includes('fee')) return 'fees';
    if (p.includes('income') || p.includes('finance')) return 'finance';
    if (p.includes('salar')) return 'salaries';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<RecordTab>(getInitialTab());
  const [selectedCampus, setSelectedCampus] = useState<string>(
    activeCampusId ? String(activeCampusId) : (campuses[0]?.id ? String(campuses[0].id) : '')
  );

  // Filters
  const [periodPreset, setPeriodPreset] = useState<'all_time' | 'month' | 'range'>('all_time');
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('');
  const [classesList, setClassesList] = useState<{ id: number; name: string }[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const [defaultersOnly, setDefaultersOnly] = useState<boolean>(false);
  const [financeKind, setFinanceKind] = useState<string>('all');

  // Data states
  const [loading, setLoading] = useState<boolean>(false);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [salaryLinesUnlocked, setSalaryLinesUnlocked] = useState<boolean>(false);

  // Modals & Export Mode
  const [confirmExportModal, setConfirmExportModal] = useState<boolean>(false);
  const [exportMode, setExportMode] = useState<'section' | 'comprehensive'>('section');
  const [createEventModal, setCreateEventModal] = useState<boolean>(false);
  const [createTargetType, setCreateTargetType] = useState<'staff' | 'student'>('staff');
  const [voidModal, setVoidModal] = useState<{ open: boolean; eventId: number | null; type: 'staff' | 'student' }>({
    open: false, eventId: null, type: 'staff'
  });
  const [voidReason, setVoidReason] = useState<string>('');

  // Form states
  const [formData, setFormData] = useState({
    staff_id: '',
    student_id: '',
    school_class_id: '',
    event_type: 'joined',
    effective_date: new Date().toISOString().split('T')[0],
    reason_text: '',
    notes: '',
    restricted_notes: '',
  });

  // Sync tab with page prop change
  useEffect(() => {
    setActiveTab(getInitialTab());
  }, [page]);

  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch {}
  }, [activeTab]);

  // Fetch classes for active campus or all campuses
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const url = selectedCampus && selectedCampus !== 'all'
          ? `/api/v1/classes/?school=${selectedCampus}`
          : '/api/v1/classes/';
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json) ? json : (json.results || []);
          setClassesList(items);
        }
      } catch (e) {
        console.error('Failed to load classes for record filter', e);
      }
    };
    fetchClasses();
  }, [selectedCampus]);

  // Fetch data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (selectedCampus) qParams.set('campus', selectedCampus);
      if (searchFilter) qParams.set('search', searchFilter);
      if (classFilter) qParams.set('class', classFilter);

      if (periodPreset === 'month' && monthFilter) {
        qParams.set('month', monthFilter);
      } else if (periodPreset === 'range') {
        if (startDate) qParams.set('start_date', startDate);
        if (endDate) qParams.set('end_date', endDate);
      }

      if (activeTab === 'overview') {
        const res = await fetch(`/api/v1/records/overview/?${qParams.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setOverviewData(json);
        }
      } else if (activeTab === 'staff') {
        if (eventTypeFilter !== 'all') qParams.set('event_type', eventTypeFilter);
        const res = await fetch(`/api/v1/records/staff/?${qParams.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setTableRows(json.rows || []);
        }
      } else if (activeTab === 'students') {
        if (eventTypeFilter !== 'all') qParams.set('event_type', eventTypeFilter);
        const res = await fetch(`/api/v1/records/students/?${qParams.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setTableRows(json.rows || []);
        }
      } else if (activeTab === 'fees') {
        if (defaultersOnly) qParams.set('defaulters_only', 'true');
        const res = await fetch(`/api/v1/records/fees/?${qParams.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setTableRows(json.rows || []);
        }
      } else if (activeTab === 'finance') {
        if (financeKind !== 'all') qParams.set('kind', financeKind);
        const res = await fetch(`/api/v1/records/finance/?${qParams.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setTableRows(json.rows || []);
        }
      } else if (activeTab === 'salaries') {
        const res = await fetch(`/api/v1/records/salaries/?${qParams.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setTableRows(json.rows || []);
          setSalaryLinesUnlocked(json.salary_lines_unlocked || false);
        }
      }
    } catch (err: any) {
      notify('Failed to load record data: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, selectedCampus, periodPreset, monthFilter, startDate, endDate, searchFilter, classFilter, eventTypeFilter, defaultersOnly, financeKind, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Export Download
  const handleExport = async (overrideMode?: 'section' | 'comprehensive') => {
    const mode = overrideMode || exportMode;
    setConfirmExportModal(false);
    try {
      const qParams = new URLSearchParams();
      if (selectedCampus) qParams.set('campus', selectedCampus);
      if (searchFilter) qParams.set('search', searchFilter);
      if (classFilter) qParams.set('class', classFilter);

      if (periodPreset === 'month' && monthFilter) {
        qParams.set('month', monthFilter);
        qParams.set('period_label', `Month_${monthFilter}`);
      } else if (periodPreset === 'range') {
        if (startDate) qParams.set('start_date', startDate);
        if (endDate) qParams.set('end_date', endDate);
        qParams.set('period_label', `${startDate}_to_${endDate}`);
      } else {
        qParams.set('period_label', 'lifetime_complete_archive');
      }

      if (mode === 'comprehensive') {
        qParams.set('page_type', 'comprehensive');
      } else {
        qParams.set('page_type', activeTab);
      }

      notify(`Preparing ${mode === 'comprehensive' ? 'All-in-One Comprehensive Master Dossier (.xlsx)' : 'section export'}...`, 'info');
      const res = await fetch(`/api/v1/records/export/?${qParams.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('content-disposition');
      let filename = mode === 'comprehensive' ? 'record_master_dossier.xlsx' : `record_${activeTab}_export.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) filename = match[1].replace(/['"]/g, '').trim();
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);

      notify(`Exported ${filename} successfully.`, 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Handle Void
  const handleConfirmVoid = async () => {
    if (!voidReason.trim()) {
      notify('Mandatory reason required to void record.', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/v1/records/events/${voidModal.type}/${voidModal.eventId}/void/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ void_reason: voidReason, campus: selectedCampus })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Void failed');
      }
      notify('Record voided successfully with audit log.', 'success');
      setVoidModal({ open: false, eventId: null, type: 'staff' });
      setVoidReason('');
      loadData();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const getRowCount = () => {
    if (activeTab === 'overview') return overviewData?.monthly_summary?.length || 0;
    return tableRows.length;
  };

  return (
    <div className="record-container">
      {/* Header & Tabs */}
      <div className="record-header-card">
        <div className="record-title-row">
          <div className="record-title-group">
            <h1>
              <FileText size={26} color="#6f42c1" />
              <span>Record & Archive</span>
            </h1>
            <p className="record-subtitle">
              Permanent, filterable operational archive and longitudinal reporting across campuses.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {campuses.length > 1 && user.role !== 'principal' && (
              <select
                className="record-select"
                value={selectedCampus}
                onChange={e => setSelectedCampus(e.target.value)}
                style={{ fontWeight: 600 }}
              >
                <option value="all">🌐 All Campuses (Consolidated)</option>
                {campuses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            )}
            <button
              className="record-btn-secondary"
              onClick={() => { setExportMode('comprehensive'); setConfirmExportModal(true); }}
              title="Download full multi-year archive covering Staff, Students, Fees, Finance & Salaries in a single multi-sheet Excel dossier"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px' }}
            >
              <Download size={15} color="#6f42c1" />
              <span style={{ fontWeight: 600, color: '#6f42c1' }}>Master Dossier (.xlsx)</span>
            </button>
            <button
              className="record-download-btn"
              disabled={getRowCount() === 0 || loading}
              onClick={() => { setExportMode('section'); setConfirmExportModal(true); }}
              title={getRowCount() === 0 ? 'No rows match current filters' : 'Export all filtered rows for current tab to Excel'}
            >
              <Download size={16} />
              <span>Download Tab (.xlsx)</span>
              <span className="record-count-badge">{getRowCount()} rows</span>
            </button>
          </div>
        </div>

        {/* Subnavigation Pills */}
        <div className="record-subnav-pills">
          <button
            className={`record-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <TrendingUp size={16} />
            <span>Overview</span>
          </button>
          <button
            className={`record-nav-btn ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            <Users size={16} />
            <span>Staff</span>
          </button>
          <button
            className={`record-nav-btn ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => setActiveTab('students')}
          >
            <GraduationCap size={16} />
            <span>Students</span>
          </button>
          <button
            className={`record-nav-btn ${activeTab === 'fees' ? 'active' : ''}`}
            onClick={() => setActiveTab('fees')}
          >
            <Receipt size={16} />
            <span>Fees</span>
          </button>
          <button
            className={`record-nav-btn ${activeTab === 'finance' ? 'active' : ''}`}
            onClick={() => setActiveTab('finance')}
          >
            <Wallet size={16} />
            <span>Income & Expenses</span>
          </button>
          <button
            className={`record-nav-btn ${activeTab === 'salaries' ? 'active' : ''}`}
            onClick={() => setActiveTab('salaries')}
          >
            <Banknote size={16} />
            <span>Salaries</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="record-filter-bar">
          <div className="record-filter-inputs">
            <input
              type="text"
              placeholder="Search by name, role, receipt..."
              className="record-input"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              style={{ width: '200px' }}
            />

            {/* Longitudinal Archive Period Preset */}
            <select
              className="record-select"
              value={periodPreset}
              onChange={e => setPeriodPreset(e.target.value as any)}
              title="Select reporting timeframe (All Time for complete lifetime archive)"
              style={{ fontWeight: 600, color: '#334155' }}
            >
              <option value="all_time">📅 All Time (Lifetime Archive)</option>
              <option value="month">🗓️ Specific Month</option>
              <option value="range">📆 Custom Date Range</option>
            </select>

            {periodPreset === 'month' && (
              <input
                type="month"
                className="record-input"
                value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                title="Filter by month (YYYY-MM)"
              />
            )}

            {periodPreset === 'range' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="date"
                  className="record-input"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  title="Archive Start Date"
                  style={{ width: '135px' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>to</span>
                <input
                  type="date"
                  className="record-input"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  title="Archive End Date"
                  style={{ width: '135px' }}
                />
              </div>
            )}

            {/* Class Filter */}
            {(activeTab === 'students' || activeTab === 'fees' || activeTab === 'overview') && (
              <select
                className="record-select"
                value={classFilter}
                onChange={e => setClassFilter(e.target.value)}
                title="Filter by Class"
                style={{ minWidth: '130px' }}
              >
                <option value="">All Classes</option>
                {classesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}

            {(activeTab === 'staff' || activeTab === 'students') && (
              <select
                className="record-select"
                value={eventTypeFilter}
                onChange={e => setEventTypeFilter(e.target.value)}
              >
                <option value="all">All Events</option>
                {activeTab === 'staff' ? (
                  <>
                    <option value="joined">Joined</option>
                    <option value="resigned">Resigned</option>
                    <option value="terminated">Terminated</option>
                    <option value="transferred">Transferred</option>
                    <option value="rejoined">Rejoined</option>
                  </>
                ) : (
                  <>
                    <option value="admitted">Admitted / Enrolled</option>
                    <option value="promoted">Promoted</option>
                    <option value="not_promoted">Not promoted (repeating)</option>
                    <option value="passed_out">Passed out (Graduated)</option>
                    <option value="left">Left</option>
                  </>
                )}
              </select>
            )}

            {activeTab === 'fees' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={defaultersOnly}
                  onChange={e => setDefaultersOnly(e.target.checked)}
                />
                <span>Defaulters List Only</span>
              </label>
            )}

            {activeTab === 'finance' && (
              <select
                className="record-select"
                value={financeKind}
                onChange={e => setFinanceKind(e.target.value)}
              >
                <option value="all">All Transactions</option>
                <option value="income">Income Only</option>
                <option value="expense">Expenses Only</option>
              </select>
            )}
          </div>

          <button
            className="record-btn-secondary"
            onClick={loadData}
            title="Refresh record dataset"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin-anim' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && overviewData && (
        <>
          <div className="record-kpi-grid">
            <div className="record-kpi-card">
              <span className="record-kpi-title">Staff Transitions</span>
              <span className="record-kpi-value">{overviewData.cards.staff.active_current}</span>
              <span className="record-kpi-sub">
                +{overviewData.cards.staff.joined} joined / -{overviewData.cards.staff.resigned + overviewData.cards.staff.terminated} separated
              </span>
            </div>
            <div className="record-kpi-card">
              <span className="record-kpi-title">Student Enrollment</span>
              <span className="record-kpi-value">{overviewData.cards.students.active_current}</span>
              <span className="record-kpi-sub">
                +{overviewData.cards.students.admitted} admitted / -{overviewData.cards.students.left} left
              </span>
            </div>
            <div className="record-kpi-card">
              <span className="record-kpi-title">Fees Collection Rate</span>
              <span className="record-kpi-value" style={{ color: '#059669' }}>
                {overviewData.cards.fees.collection_rate}%
              </span>
              <span className="record-kpi-sub">
                PKR {Number(overviewData.cards.fees.collected).toLocaleString()} collected
              </span>
            </div>
            <div className="record-kpi-card">
              <span className="record-kpi-title">Finance Net Position</span>
              <span className="record-kpi-value" style={{ color: Number(overviewData.cards.finance.net) >= 0 ? '#059669' : '#dc2626' }}>
                PKR {Number(overviewData.cards.finance.net).toLocaleString()}
              </span>
              <span className="record-kpi-sub">
                PKR {Number(overviewData.cards.finance.income).toLocaleString()} in / PKR {Number(overviewData.cards.finance.expense).toLocaleString()} out
              </span>
            </div>
            <div className="record-kpi-card">
              <span className="record-kpi-title">Salaries Paid</span>
              <span className="record-kpi-value">
                PKR {Number(overviewData.cards.salaries.total_paid).toLocaleString()}
              </span>
              <span className="record-kpi-sub">{overviewData.cards.salaries.staff_count} staff disbursements</span>
            </div>
          </div>

          {/* Monthly Summary Table */}
          <div className="record-table-wrap">
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Monthly Operational Rollup</h3>
              {overviewData.yoy_comparison?.admissions_growth_pct !== undefined && (
                <span style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 600 }}>
                  YoY Admissions Growth: +{overviewData.yoy_comparison.admissions_growth_pct}%
                </span>
              )}
            </div>
            <table className="record-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num-col">Admitted</th>
                  <th className="num-col">Left</th>
                  <th className="num-col">Fees Collected</th>
                  <th className="num-col">Total Income</th>
                  <th className="num-col">Total Expense</th>
                  <th className="num-col">Net Balance</th>
                  <th className="num-col">Salaries Paid</th>
                </tr>
              </thead>
              <tbody>
                {overviewData.monthly_summary.map((m: any, idx: number) => (
                  <tr key={idx}>
                    <td><strong>{m.month}</strong></td>
                    <td className="num-col">+{m.admitted}</td>
                    <td className="num-col">-{m.left}</td>
                    <td className="num-col">PKR {Number(m.collected).toLocaleString()}</td>
                    <td className="num-col">PKR {Number(m.income).toLocaleString()}</td>
                    <td className="num-col">PKR {Number(m.expense).toLocaleString()}</td>
                    <td className="num-col" style={{ color: Number(m.net) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                      PKR {Number(m.net).toLocaleString()}
                    </td>
                    <td className="num-col">PKR {Number(m.salaries).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB 2: STAFF RECORD */}
      {activeTab === 'staff' && (
        <div className="record-table-wrap">
          <table className="record-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                {selectedCampus === 'all' && <th>Campus</th>}
                <th>Position</th>
                <th>Event Type</th>
                <th>Effective Date</th>
                <th>Reason</th>
                <th>Campus Scope</th>
                <th>Notes / Remarks</th>
                <th>Recorded By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr><td colSpan={selectedCampus === 'all' ? 10 : 9} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No staff lifecycle events found.</td></tr>
              ) : (
                tableRows.map((r: any) => (
                  <tr key={r.id}>
                    <td><strong>{r.staff_name}</strong></td>
                    {selectedCampus === 'all' && (
                      <td>
                        <span className="record-badge" style={{ background: '#f3e8ff', color: '#6f42c1', fontWeight: 600 }}>
                          {r.campus_name || r.campus_code || 'Main'}
                        </span>
                      </td>
                    )}
                    <td>{r.position}</td>
                    <td>
                      <span className={`record-status-pill ${r.event_type === 'joined' ? 'status-on-track' : r.event_type === 'terminated' ? 'status-needs-support' : 'status-watch'}`}>
                        {r.event_type_display}
                      </span>
                    </td>
                    <td>{r.effective_date}</td>
                    <td>{r.reason_category || '—'}</td>
                    <td>{r.to_campus ? `Transfer to ${r.to_campus}` : r.from_campus ? `Transfer from ${r.from_campus}` : 'Main'}</td>
                    <td>{r.notes || '—'}</td>
                    <td>{r.recorded_by || 'System'}</td>
                    <td>
                      <button
                        className="record-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        onClick={() => { setVoidModal({ open: true, eventId: r.id, type: 'staff' }); setVoidReason(''); }}
                      >
                        Void
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: STUDENTS RECORD */}
      {activeTab === 'students' && (
        <div className="record-table-wrap">
          <table className="record-table">
            <thead>
              <tr>
                <th>Admission #</th>
                <th>Student Name</th>
                {selectedCampus === 'all' && <th>Campus</th>}
                <th>Class & Section</th>
                <th>Session</th>
                <th>Event Status</th>
                <th>Departure Type</th>
                <th>Effective Date</th>
                <th>Reason / Notes</th>
                <th>Recorded By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr><td colSpan={selectedCampus === 'all' ? 11 : 10} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No student academic lifecycle records found.</td></tr>
              ) : (
                tableRows.map((r: any) => (
                  <tr key={r.id}>
                    <td><code>{r.admission_number}</code></td>
                    <td><strong>{r.student_name}</strong></td>
                    {selectedCampus === 'all' && (
                      <td>
                        <span className="record-badge" style={{ background: '#f3e8ff', color: '#6f42c1', fontWeight: 600 }}>
                          {r.campus_name || r.campus_code || 'Main'}
                        </span>
                      </td>
                    )}
                    <td>{r.class_name} {r.section_name && `(${r.section_name})`}</td>
                    <td>{r.session_name}</td>
                    <td>
                      <span className={`record-status-pill ${r.event_type === 'admitted' ? 'status-on-track' : r.event_type === 'not_promoted' ? 'status-watch' : 'status-insufficient'}`}>
                        {r.event_type_display}
                      </span>
                    </td>
                    <td>{r.leave_subtype || '—'}</td>
                    <td>{r.effective_date}</td>
                    <td>{r.reason || r.notes || '—'}</td>
                    <td>{r.recorded_by || 'System'}</td>
                    <td>
                      <button
                        className="record-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        onClick={() => { setVoidModal({ open: true, eventId: r.id, type: 'student' }); setVoidReason(''); }}
                      >
                        Void
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: FEES RECORD */}
      {activeTab === 'fees' && (
        <div className="record-table-wrap">
          <table className="record-table">
            <thead>
              {defaultersOnly ? (
                <tr>
                  <th>Admission #</th>
                  <th>Student Name</th>
                  {selectedCampus === 'all' && <th>Campus</th>}
                  <th>Fee Head</th>
                  <th>Period</th>
                  <th className="num-col">Due Date</th>
                  <th className="num-col">Amount Due</th>
                  <th className="num-col">Discount</th>
                  <th className="num-col">Net Outstanding</th>
                  <th>Status</th>
                </tr>
              ) : (
                <tr>
                  <th>Receipt #</th>
                  <th>Admission #</th>
                  <th>Student Name</th>
                  {selectedCampus === 'all' && <th>Campus</th>}
                  <th className="num-col">Amount Paid</th>
                  <th>Payment Mode</th>
                  <th>Date Collected</th>
                  <th>Reference #</th>
                  <th>Received By</th>
                </tr>
              )}
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr><td colSpan={selectedCampus === 'all' ? 10 : 9} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No fee payment or defaulter records found.</td></tr>
              ) : (
                tableRows.map((r: any) => (
                  <tr key={r.id}>
                    {defaultersOnly ? (
                      <>
                        <td><code>{r.admission_number}</code></td>
                        <td><strong>{r.student_name}</strong></td>
                        {selectedCampus === 'all' && (
                          <td>
                            <span className="record-badge" style={{ background: '#f3e8ff', color: '#6f42c1', fontWeight: 600 }}>
                              {r.campus_name || r.campus_code || 'Main'}
                            </span>
                          </td>
                        )}
                        <td>{r.fee_head}</td>
                        <td>{r.period}</td>
                        <td className="num-col">{r.due_date}</td>
                        <td className="num-col">PKR {Number(r.amount_due).toLocaleString()}</td>
                        <td className="num-col">PKR {Number(r.discount).toLocaleString()}</td>
                        <td className="num-col" style={{ color: '#dc2626', fontWeight: 700 }}>
                          PKR {Number(r.net_due).toLocaleString()}
                        </td>
                        <td>
                          <span className="record-status-pill status-needs-support">{r.status}</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td><code>{r.receipt_number}</code></td>
                        <td>{r.admission_number}</td>
                        <td><strong>{r.student_name}</strong></td>
                        {selectedCampus === 'all' && (
                          <td>
                            <span className="record-badge" style={{ background: '#f3e8ff', color: '#6f42c1', fontWeight: 600 }}>
                              {r.campus_name || r.campus_code || 'Main'}
                            </span>
                          </td>
                        )}
                        <td className="num-col" style={{ color: '#059669', fontWeight: 700 }}>
                          PKR {Number(r.amount).toLocaleString()}
                        </td>
                        <td>{r.method}</td>
                        <td>{r.paid_on}</td>
                        <td>{r.reference || '—'}</td>
                        <td>{r.received_by || 'Cashier'}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: FINANCE (INCOME & EXPENSES) */}
      {activeTab === 'finance' && (
        <div className="record-table-wrap">
          <table className="record-table">
            <thead>
              <tr>
                <th>Transaction Date</th>
                {selectedCampus === 'all' && <th>Campus</th>}
                <th>Type</th>
                <th>Accounting Category</th>
                <th className="num-col">Amount (PKR)</th>
                <th>Description</th>
                <th>Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr><td colSpan={selectedCampus === 'all' ? 7 : 6} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No finance transactions found.</td></tr>
              ) : (
                tableRows.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    {selectedCampus === 'all' && (
                      <td>
                        <span className="record-badge" style={{ background: '#f3e8ff', color: '#6f42c1', fontWeight: 600 }}>
                          {r.campus_name || r.campus_code || 'Main'}
                        </span>
                      </td>
                    )}
                    <td>
                      <span className={`record-status-pill ${r.kind === 'Income' ? 'status-on-track' : 'status-needs-support'}`}>
                        {r.kind}
                      </span>
                    </td>
                    <td><strong>{r.category_name}</strong></td>
                    <td className="num-col" style={{ fontWeight: 700, color: r.kind === 'Income' ? '#059669' : '#dc2626' }}>
                      PKR {Number(r.amount).toLocaleString()}
                    </td>
                    <td>{r.description || '—'}</td>
                    <td>{r.created_by || 'Accountant'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: SALARIES */}
      {activeTab === 'salaries' && (
        <div>
          {!salaryLinesUnlocked && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', color: '#92400e' }}>
              <AlertTriangle size={18} />
              <span>
                Individual staff salary line items are restricted to the school owner. Displaying campus aggregate disbursement register.
              </span>
            </div>
          )}
          <div className="record-table-wrap">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  {selectedCampus === 'all' && <th>Campus</th>}
                  <th>Position</th>
                  <th>Month</th>
                  <th className="num-col">Basic Salary</th>
                  <th className="num-col">Gross Pay</th>
                  <th className="num-col">Net Disbursed</th>
                  <th>Paid Date</th>
                  <th>Disbursement Mode</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr><td colSpan={selectedCampus === 'all' ? 9 : 8} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No salary records found for this period.</td></tr>
                ) : (
                  tableRows.map((r: any) => (
                    <tr key={r.id}>
                      <td><strong>{r.staff_name}</strong></td>
                      {selectedCampus === 'all' && (
                        <td>
                          <span className="record-badge" style={{ background: '#f3e8ff', color: '#6f42c1', fontWeight: 600 }}>
                            {r.campus_name || r.campus_code || 'Main'}
                          </span>
                        </td>
                      )}
                      <td>{r.position}</td>
                      <td>{r.month}</td>
                      <td className="num-col">{r.basic !== null ? `PKR ${Number(r.basic).toLocaleString()}` : '***'}</td>
                      <td className="num-col">{r.gross !== null ? `PKR ${Number(r.gross).toLocaleString()}` : '***'}</td>
                      <td className="num-col" style={{ fontWeight: 700, color: '#059669' }}>
                        {r.net !== null ? `PKR ${Number(r.net).toLocaleString()}` : '***'}
                      </td>
                      <td>{r.paid_on || '—'}</td>
                      <td>{r.method}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXPORT CONFIRMATION MODAL */}
      {confirmExportModal && (
        <div className="record-modal-overlay">
          <div className="record-modal" style={{ maxWidth: '520px' }}>
            <div className="record-modal-header">
              <h3>Confirm Secure Data Export</h3>
              <button className="record-btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={() => setConfirmExportModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="record-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                  Choose Export Package:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', border: exportMode === 'section' ? '2px solid #6f42c1' : '1px solid #e2e8f0', borderRadius: '10px', background: exportMode === 'section' ? '#f5f3ff' : '#ffffff', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="export_package"
                      checked={exportMode === 'section'}
                      onChange={() => setExportMode('section')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                        Current Section Only ({activeTab.toUpperCase()})
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Exports {getRowCount()} filtered rows with Summary and Data worksheets.
                      </div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', border: exportMode === 'comprehensive' ? '2px solid #6f42c1' : '1px solid #e2e8f0', borderRadius: '10px', background: exportMode === 'comprehensive' ? '#f5f3ff' : '#ffffff', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="export_package"
                      checked={exportMode === 'comprehensive'}
                      onChange={() => setExportMode('comprehensive')}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                        ⭐ All-in-One Comprehensive Master Dossier (.xlsx)
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        Complete multi-year archive: Summary, Trends, Staff, Students, Fees, Finance & Salaries in one workbook.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Scope Breakdown */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', fontSize: '0.82rem', color: '#334155' }}>
                <div style={{ marginBottom: '4px' }}>
                  <strong>Campus Scope:</strong> {selectedCampus === 'all' ? 'All Campuses (Consolidated Multi-Branch)' : (campuses.find(c => String(c.id) === selectedCampus)?.name || `Campus ${selectedCampus}`)}
                </div>
                {classFilter && (
                  <div style={{ marginBottom: '4px' }}>
                    <strong>Target Class:</strong> {classesList.find(c => String(c.id) === classFilter)?.name || `Class #${classFilter}`}
                  </div>
                )}
                <div style={{ marginBottom: '4px' }}>
                  <strong>Archive Period:</strong> {periodPreset === 'all_time' ? 'All Recorded History (Lifetime Archive — 3+ Years)' : periodPreset === 'month' ? `Month: ${monthFilter || 'Current'}` : `Date Range: ${startDate || 'Start'} to ${endDate || 'Present'}`}
                </div>
                <div style={{ color: '#059669', fontWeight: 600, marginTop: '6px' }}>
                  ✓ Formula-injection protection enabled &bull; Streamed securely &bull; Audited
                </div>
              </div>
            </div>
            <div className="record-modal-footer">
              <button className="record-btn-secondary" onClick={() => setConfirmExportModal(false)}>
                Cancel
              </button>
              <button className="record-btn-primary" onClick={() => handleExport()}>
                {exportMode === 'comprehensive' ? 'Download Master Dossier (.xlsx)' : 'Download Section (.xlsx)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VOID CONFIRMATION MODAL */}
      {voidModal.open && (
        <div className="record-modal-overlay">
          <div className="record-modal">
            <div className="record-modal-header">
              <h3>Void Historical Record</h3>
              <button className="record-btn-secondary" style={{ padding: '4px', border: 'none' }} onClick={() => setVoidModal({ open: false, eventId: null, type: 'staff' })}>
                <X size={18} />
              </button>
            </div>
            <div className="record-modal-body">
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#dc2626' }}>
                Records cannot be deleted. Voiding will permanently flag this entry as void in the audit trail.
              </p>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px' }}>
                  Mandatory Reason for Voiding:
                </label>
                <textarea
                  className="record-input"
                  style={{ width: '100%', height: '80px', boxSizing: 'border-box' }}
                  placeholder="Explain why this record is being voided..."
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                />
              </div>
            </div>
            <div className="record-modal-footer">
              <button className="record-btn-secondary" onClick={() => setVoidModal({ open: false, eventId: null, type: 'staff' })}>
                Cancel
              </button>
              <button className="record-btn-primary" style={{ background: '#dc2626' }} onClick={handleConfirmVoid}>
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
