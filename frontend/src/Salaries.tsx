import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Banknote, Building2, Calendar, Check,
  CheckCircle2, ChevronRight, Crown, Download, FileSpreadsheet, FileText, LayoutGrid,
  Lock, Plus, Printer, RefreshCw, Search, ShieldCheck, Sparkles, Table, User, Users, X
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { list, request, type User as ApiUser } from './api';
import ExportMenu from './ExportMenu';
import { FilterBar } from './FilterBar';
import './hr.css';

type R = Record<string, any>;
type Tab = 'overview' | 'sheet' | 'structures' | 'adjustments' | 'my_payslips';

interface SalariesProps {
  user: ApiUser;
  notify: (m: string) => void;
  plan?: string;
  isPremiumUnlocked?: boolean;
  onUpgrade?: () => void;
  activeCampusId?: number | null;
  campuses?: Array<any>;
  onSelectCampus?: (id: number | null) => void;
}

export default function Salaries({
  user,
  notify,
  plan,
  isPremiumUnlocked = true,
  onUpgrade,
  activeCampusId,
  campuses = [],
  onSelectCampus
}: SalariesProps) {
  const isTeacher = user.role === 'teacher';
  const [tab, setTab] = useState<Tab>(isTeacher ? 'my_payslips' : 'sheet');
  const [viewMode, setViewMode] = useState<'boxes' | 'table'>('boxes');
  const [schools, setSchools] = useState<R[]>(() => campuses || []);
  const [school, setSchool] = useState(() => (activeCampusId ? String(activeCampusId) : ''));

  useEffect(() => {
    if (activeCampusId) {
      setSchool(String(activeCampusId));
    } else {
      setSchool('');
    }
  }, [activeCampusId]);

  useEffect(() => {
    if (campuses.length > 0) {
      setSchools(campuses);
    }
  }, [campuses]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [staffList, setStaffList] = useState<R[]>([]);
  const [records, setRecords] = useState<R[]>([]);
  const [sheetFilters, setSheetFilters] = useState<Record<string, any>>({});
  const [structures, setStructures] = useState<R[]>([]);
  const [adjustments, setAdjustments] = useState<R[]>([]);
  const [myPayslips, setMyPayslips] = useState<R[]>([]);
  const [summary, setSummary] = useState<R | null>(null);
  const [overallSummary, setOverallSummary] = useState<R | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bump, setBump] = useState(0);

  // Selected records for bulk approve
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modals
  const [generateModal, setGenerateModal] = useState(false);
  const [genMonth, setGenMonth] = useState(month);
  const [genDueDate, setGenDueDate] = useState('');

  const [payModal, setPayModal] = useState(false);
  const [activePayRecord, setActivePayRecord] = useState<R | null>(null);
  const [payMethod, setPayMethod] = useState('bank');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState('');

  const [voidModal, setVoidModal] = useState(false);
  const [activeVoidRecord, setActiveVoidRecord] = useState<R | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [payslipModal, setPayslipModal] = useState(false);
  const [activePayslip, setActivePayslip] = useState<R | null>(null);

  const [structModal, setStructModal] = useState(false);
  const [structStaff, setStructStaff] = useState('');
  const [structBasic, setStructBasic] = useState('');
  const [structEffDate, setStructEffDate] = useState(new Date().toISOString().slice(0, 10));
  const [structAllowances, setStructAllowances] = useState<Array<{ name: string; amount: string }>>([]);
  const [structDeductions, setStructDeductions] = useState<Array<{ name: string; amount: string }>>([]);

  const [adjModal, setAdjModal] = useState(false);
  const [adjStaff, setAdjStaff] = useState('');
  const [adjMonth, setAdjMonth] = useState(month);
  const [adjKind, setAdjKind] = useState('bonus');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  useEffect(() => {
    list<R>('schools').then(setSchools).catch(() => {});
    request<R>('staff/').then(res => setStaffList(res.results || [])).catch(() => {});
  }, []);

  const sheetQs = useCallback(() => {
    const params = new URLSearchParams();
    params.set('month', month);
    if (school) params.set('school', school);
    Object.entries(sheetFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    return `?${params.toString()}`;
  }, [month, school, sheetFilters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    const qs = `?month=${month}${school ? `&school=${school}` : ''}`;
    try {
      if (isTeacher) {
        const myRes = await request<R>('salaries/my-payslips/');
        setMyPayslips(myRes.results || []);
      } else {
        const [sheetRes, sumRes, structRes, adjRes, orgSumRes] = await Promise.all([
          request<R>(`salaries/sheet/${sheetQs()}`).catch(err => {
            throw err;
          }),
          request<R>(`salaries/summary/${qs}`).catch(() => ({})),
          request<R>(`salaries/structures/${school ? `?school=${school}` : ''}`).catch(() => ({ results: [] })),
          request<R>(`salaries/adjustments/${qs}`).catch(() => ({ results: [] })),
          request<R>(`salaries/summary/?month=${month}`).catch(() => ({}))
        ]);
        setRecords(sheetRes.results || []);
        setSummary(sumRes);
        setStructures(structRes.results || []);
        setAdjustments(adjRes.results || []);
        setOverallSummary(orgSumRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load salary data');
    } finally {
      setLoading(false);
    }
  }, [month, school, isTeacher, sheetQs]);

  useEffect(() => { loadData(); }, [loadData, bump]);

  const currentCampus = schools.find(s => String(s.id) === String(school)) || null;

  const totalCalculations = {
    totalStaff: records.length,
    basic: records.reduce((sum, r) => sum + (parseFloat(r.basic) || 0), 0),
    allowances: records.reduce((sum, r) => sum + (parseFloat(r.allowances_total) || 0), 0),
    additions: records.reduce((sum, r) => sum + (parseFloat(r.additions_total) || 0), 0),
    deductions: records.reduce((sum, r) => sum + (parseFloat(r.deductions_total) || 0), 0),
    gross: records.reduce((sum, r) => sum + (parseFloat(r.gross) || 0), 0),
    net: records.reduce((sum, r) => sum + (parseFloat(r.net) || 0), 0),
    paidCount: records.filter(r => r.status === 'paid').length,
    pendingCount: records.filter(r => r.status !== 'paid' && r.status !== 'void' && r.status !== 'cancelled').length,
  };

  const overallTotalAllCampuses = (parseFloat(overallSummary?.total_paid) || 0) + (parseFloat(overallSummary?.total_pending) || 0);

  const handleGenerateSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await request<R>('salaries/generate/', {
        method: 'POST',
        body: JSON.stringify({
          month: genMonth,
          due_date: genDueDate || undefined,
          school: school || (schools[0]?.id ? String(schools[0].id) : undefined)
        })
      });
      notify(`Generated ${res.created_records} salary records (${res.skipped_records} existing skipped).`);
      setGenerateModal(false);
      setMonth(genMonth);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Generation failed');
    }
  };

  const handleBulkApprove = async () => {
    if (!selectedIds.length) return;
    try {
      const res = await request<R>('salaries/sheet/', {
        method: 'PATCH',
        body: JSON.stringify({ records: selectedIds, status: 'approved' })
      });
      notify(`Approved ${res.updated} salary records.`);
      setSelectedIds([]);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleStatusChange = async (recordId: number, newStatus: string) => {
    if (newStatus === 'paid') {
      const rec = records.find(r => r.id === recordId);
      if (rec) {
        setActivePayRecord(rec);
        setPayModal(true);
        return;
      }
    }
    try {
      await request<R>(`salaries/sheet/${recordId}/status/`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus })
      });
      notify(`Salary status updated to ${newStatus}.`);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to update salary status');
    }
  };

  const handlePaySalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePayRecord) return;
    try {
      const res = await request<R>(`salaries/sheet/${activePayRecord.id}/pay/`, {
        method: 'POST',
        body: JSON.stringify({
          paid_on: payDate,
          method: payMethod,
          reference: payRef
        })
      });
      notify(`Salary marked paid! Linked Expense entry #${res.finance_entry_id} created in Finance.`);
      setPayModal(false);
      setActivePayRecord(null);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Payout recording failed');
    }
  };

  const handleVoidSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVoidRecord || !voidReason.trim()) return;
    try {
      await request<R>(`salaries/sheet/${activeVoidRecord.id}/void/`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason.trim() })
      });
      notify('Salary record voided and linked Finance entry voided.');
      setVoidModal(false);
      setActiveVoidRecord(null);
      setVoidReason('');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Void operation failed');
    }
  };

  const openPayslip = async (recordId: number) => {
    try {
      const p = await request<R>(`salaries/sheet/${recordId}/payslip/`);
      setActivePayslip(p);
      setPayslipModal(true);
    } catch (err) {
      notify('Could not load payslip details');
    }
  };

  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await request<R>('salaries/structures/', {
        method: 'POST',
        body: JSON.stringify({
          staff: structStaff,
          effective_from: structEffDate,
          basic: structBasic,
          allowances: structAllowances,
          fixed_deductions: structDeductions
        })
      });
      notify('Salary structure saved.');
      setStructModal(false);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save salary structure');
    }
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await request<R>('salaries/adjustments/', {
        method: 'POST',
        body: JSON.stringify({
          staff: adjStaff,
          month: adjMonth,
          kind: adjKind,
          amount: adjAmount,
          reason: adjReason
        })
      });
      notify('Salary adjustment recorded.');
      setAdjModal(false);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save adjustment');
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">FINANCE / STAFF SALARIES & PAYROLL</div>
          <h1>Staff Salaries</h1>
          <p>Compensation structures, monthly payroll sheets, bulk approvals, and auto-linked finance expenses.</p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#eef2ff', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#4338ca', marginTop: 8 }}>
            <Building2 size={15} />
            <span>{currentCampus ? `${currentCampus.name}${currentCampus.principal_name ? ` • Principal: ${currentCampus.principal_name}` : ''}` : '🌐 All Campuses (Consolidated)'}</span>
          </div>
        </div>
        <div className="fx-filters">
          {!isTeacher && (
            <>
              <label>Month
                <input type="month" className="fx-select" value={month} onChange={e => setMonth(e.target.value)} />
              </label>
              {schools.length > 1 && (
                <label>Campus
                  <select
                    className="fx-select"
                    value={school}
                    onChange={e => {
                      const val = e.target.value;
                      setSchool(val);
                      if (onSelectCampus) onSelectCampus(val ? Number(val) : null);
                    }}
                  >
                    <option value="">🌐 All Campuses (Overall)</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              )}
            </>
          )}
          <button className="outline-btn" onClick={() => setBump(b => b + 1)}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      {!isTeacher && (
        <nav className="fx-tabs" aria-label="Salary sections">
          <button className={tab === 'sheet' ? 'on' : ''} onClick={() => setTab('sheet')}><FileSpreadsheet size={15} /> Monthly Salary Sheet</button>
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}><Banknote size={15} /> Payroll Summary</button>
          <button className={tab === 'structures' ? 'on' : ''} onClick={() => setTab('structures')}><Users size={15} /> Compensation Blueprints</button>
          <button className={tab === 'adjustments' ? 'on' : ''} onClick={() => setTab('adjustments')}><Sparkles size={15} /> Adjustments & Advances</button>
        </nav>
      )}

      {error && (
        <div className="error-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={17} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {error.toLowerCase().includes('plan') && onUpgrade && (
              <button
                type="button"
                className="primary-btn"
                style={{ padding: '5px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                onClick={onUpgrade}
              >
                <Crown size={13} style={{ marginRight: 4 }} /> Upgrade Plan
              </button>
            )}
            <button
              type="button"
              className="outline-btn"
              style={{ padding: '5px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              onClick={() => loadData()}
            >
              <RefreshCw size={13} style={{ marginRight: 4 }} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* MONTHLY SALARY SHEET */}
      {tab === 'sheet' && !isTeacher && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Payroll Sheet for {month}</h3>
              <p>Review draft salaries, prorations, bulk-approve, and mark paid</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Boxes vs Table Toggle */}
              <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid #cbd5e1', overflow: 'hidden' }}>
                <button
                  type="button"
                  style={{
                    padding: '5px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: viewMode === 'boxes' ? '#4f46e5' : '#fff',
                    color: viewMode === 'boxes' ? '#fff' : '#475569'
                  }}
                  onClick={() => setViewMode('boxes')}
                >
                  <LayoutGrid size={13} /> Boxes
                </button>
                <button
                  type="button"
                  style={{
                    padding: '5px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: viewMode === 'table' ? '#4f46e5' : '#fff',
                    color: viewMode === 'table' ? '#fff' : '#475569'
                  }}
                  onClick={() => setViewMode('table')}
                >
                  <Table size={13} /> Table
                </button>
              </div>

              {isPremiumUnlocked === false ? (
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => {
                    notify('Exporting payroll requires a Premium plan subscription.');
                    if (onUpgrade) onUpgrade();
                  }}
                  title="Export requires Premium plan. Click to view plans."
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.85 }}
                >
                  <Crown size={14} style={{ color: '#d97706', fill: '#f59e0b' }} />
                  <span>Export</span>
                  <span className="fx-locked-badge">
                    <Crown size={10} style={{ color: '#d97706', fill: '#f59e0b' }} />
                  </span>
                </button>
              ) : (
                <ExportMenu
                  title={`Payroll Sheet (${month})`}
                  filename={`payroll-sheet-${month}`}
                  endpoint={`salaries/sheet/${sheetQs()}`}
                  notify={notify}
                />
              )}
              {selectedIds.length > 0 && (
                <button className="outline-btn" onClick={handleBulkApprove}>
                  <CheckCircle2 size={15} /> Approve Selected ({selectedIds.length})
                </button>
              )}
              <button className="primary-btn" onClick={() => setGenerateModal(true)}>
                <Plus size={15} /> Generate Monthly Sheet
              </button>
            </div>
          </div>

          {/* KPI Boxes (As requested in SS 2: "Also show Overall total salaries of all campuses... Use boxes") */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, padding: '14px 20px 6px 20px' }}>
            {/* Box 1: Overall Total of All Campuses */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Overall Total Salaries (All Campuses)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#4338ca', margin: '6px 0 2px' }}>
                Rs {overallTotalAllCampuses.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Paid: Rs {Number(overallSummary?.total_paid || 0).toLocaleString()} • Pending: Rs {Number(overallSummary?.total_pending || 0).toLocaleString()}
              </div>
            </div>

            {/* Box 2: Current Campus / Scope Total */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderTop: '4px solid #0ea5e9', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                {currentCampus ? `${currentCampus.name} Total` : 'Filtered Payroll Total'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0369a1', margin: '6px 0 2px' }}>
                Rs {totalCalculations.net.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {totalCalculations.totalStaff} staff in view (Gross: Rs {totalCalculations.gross.toLocaleString()})
              </div>
            </div>

            {/* Box 3: Total Paid in View */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderTop: '4px solid #10b981', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Total Paid (This View)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#15803d', margin: '6px 0 2px' }}>
                {totalCalculations.paidCount} Staff
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Processed & auto-posted to expenses
              </div>
            </div>

            {/* Box 4: Pending / Draft */}
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderTop: '4px solid #f59e0b', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
                Pending / Draft
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#b45309', margin: '6px 0 2px' }}>
                {totalCalculations.pendingCount} Staff
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Awaiting approval or disbursement
              </div>
            </div>
          </div>

          <div style={{ padding: '8px 20px 14px 20px' }}>
            <FilterBar
              searchPlaceholder="Search staff name or position..."
              filters={[
                {
                  key: 'status',
                  label: 'Status',
                  options: [
                    { label: 'Draft', value: 'draft' },
                    { label: 'Approved', value: 'approved' },
                    { label: 'Paid', value: 'paid' },
                    { label: 'Cancelled', value: 'cancelled' },
                    { label: 'Void', value: 'void' },
                  ]
                }
              ]}
              values={sheetFilters}
              onChange={setSheetFilters}
              onClear={() => setSheetFilters({})}
            />
          </div>

          {/* View: Boxes Mode (SS 2: "Show salaries list... Use boxes") */}
          {viewMode === 'boxes' ? (
            <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {records.map(r => (
                <div
                  key={r.id}
                  style={{
                    background: '#fff',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    {/* Header: Checkbox + Staff + Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {r.status === 'draft' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(r.id)}
                            onChange={e => {
                              if (e.target.checked) setSelectedIds(ids => [...ids, r.id]);
                              else setSelectedIds(ids => ids.filter(id => id !== r.id));
                            }}
                          />
                        )}
                        <div>
                          <strong style={{ fontSize: 15, color: '#0f172a' }}>{r.staff_name}</strong>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            {r.position} {r.school_name ? `• ${r.school_name}` : ''}
                          </div>
                        </div>
                      </div>
                      <span className={`pill ${r.status === 'paid' ? 'green' : r.status === 'approved' ? 'blue' : r.status === 'cancelled' || r.status === 'void' ? 'red' : 'amber'}`}>
                        {r.status}
                      </span>
                    </div>

                    {/* Salary Metric Mini-Boxes */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 12 }}>
                      <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Basic Pay</span>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Rs {Number(r.basic).toLocaleString()}</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, textTransform: 'uppercase' }}>Allowances</span>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>+Rs {Number(r.allowances_total).toLocaleString()}</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 600, textTransform: 'uppercase' }}>Additions</span>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>+Rs {Number(r.additions_total).toLocaleString()}</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, textTransform: 'uppercase' }}>Deductions</span>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>-Rs {Number(r.deductions_total).toLocaleString()}</div>
                      </div>
                    </div>

                    {/* Net Pay Box */}
                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 12px', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46', textTransform: 'uppercase' }}>Net Pay</span>
                      <strong style={{ fontSize: 17, fontWeight: 800, color: '#047857' }}>Rs {Number(r.net).toLocaleString()}</strong>
                    </div>

                    {r.due_date && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                        Due Date: <strong>{r.due_date}</strong> {r.paid_on ? `• Paid on: ${r.paid_on}` : ''}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="sm-btn" onClick={() => openPayslip(r.id)} title="View Payslip">
                        <FileText size={13} style={{ marginRight: 4 }} /> Payslip
                      </button>
                      {r.status !== 'void' && (
                        <button className="sm-btn" onClick={() => { setActiveVoidRecord(r); setVoidModal(true); }} style={{ color: '#dc2626' }} title="Void Record">
                          Void
                        </button>
                      )}
                    </div>
                    {r.status !== 'void' && (
                      <select
                        className="fx-select"
                        style={{ fontSize: 11, padding: '2px 6px', height: 26, width: 'auto' }}
                        value={r.status}
                        onChange={e => handleStatusChange(r.id, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="cancelled">Cancelled</option>
                        {r.status === 'draft' && <option value="draft">Draft</option>}
                        {r.status === 'approved' && <option value="approved">Approved</option>}
                      </select>
                    )}
                  </div>
                </div>
              ))}
              {!records.length && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: '#64748b', background: '#f8fafc', borderRadius: 12 }}>
                  No salary records generated for {month}. Click 'Generate Monthly Sheet' to generate.
                </div>
              )}
            </div>
          ) : (
            /* View: Table Mode */
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 35 }}>
                      <input
                        type="checkbox"
                        checked={records.length > 0 && selectedIds.length === records.filter(r => r.status === 'draft').length}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedIds(records.filter(r => r.status === 'draft').map(r => r.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                      />
                    </th>
                    <th>STAFF MEMBER</th>
                    <th>POSITION</th>
                    <th>DUE DATE</th>
                    <th>BASIC</th>
                    <th>ALLOWANCES</th>
                    <th>ADDITIONS</th>
                    <th>DEDUCTIONS</th>
                    <th>GROSS</th>
                    <th>NET PAY</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td>
                        {r.status === 'draft' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(r.id)}
                            onChange={e => {
                              if (e.target.checked) setSelectedIds(ids => [...ids, r.id]);
                              else setSelectedIds(ids => ids.filter(id => id !== r.id));
                            }}
                          />
                        )}
                      </td>
                      <td><strong>{r.staff_name}</strong></td>
                      <td>{r.position}</td>
                      <td><span style={{ fontSize: 12, color: '#64748b' }}>{r.due_date || '—'}</span></td>
                      <td>Rs {r.basic}</td>
                      <td>Rs {r.allowances_total}</td>
                      <td><span style={{ color: '#16a34a' }}>+Rs {r.additions_total}</span></td>
                      <td><span style={{ color: '#dc2626' }}>-Rs {r.deductions_total}</span></td>
                      <td>Rs {r.gross}</td>
                      <td><strong style={{ fontSize: 14 }}>Rs {r.net}</strong></td>
                      <td>
                        <span className={`pill ${r.status === 'paid' ? 'green' : r.status === 'approved' ? 'blue' : r.status === 'cancelled' || r.status === 'void' ? 'red' : 'amber'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button className="sm-btn" onClick={() => openPayslip(r.id)} title="View Payslip">
                            <FileText size={13} />
                          </button>
                          {r.status !== 'void' && (
                            <select
                              className="fx-select"
                              style={{ fontSize: 11, padding: '2px 6px', height: 26, width: 'auto' }}
                              value={r.status}
                              onChange={e => handleStatusChange(r.id, e.target.value)}
                            >
                              <option value="pending">Pending</option>
                              <option value="paid">Paid</option>
                              <option value="cancelled">Cancelled</option>
                              {r.status === 'draft' && <option value="draft">Draft</option>}
                              {r.status === 'approved' && <option value="approved">Approved</option>}
                            </select>
                          )}
                          {r.status !== 'void' && (
                            <button className="sm-btn" onClick={() => { setActiveVoidRecord(r); setVoidModal(true); }} style={{ color: '#dc2626' }} title="Void Record">
                              Void
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!records.length && (
                    <tr>
                      <td colSpan={12} style={{ textAlign: 'center', padding: 30 }}>
                        No salary records generated for {month}. Click 'Generate Monthly Sheet' to generate.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* GRAND TOTAL SUM BOX (SS 2: "At the end show the total sum. Use boxes.") */}
          <div style={{
            margin: '20px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #ede9fe 100%)',
            border: '2px solid #c7d2fe',
            borderRadius: 12,
            padding: '18px 20px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e1b4b' }}>
                  Payroll Grand Total Sum ({currentCampus ? currentCampus.name : 'All Campuses'})
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                  Consolidated totals across all {totalCalculations.totalStaff} staff members for {month}
                </p>
              </div>
              <span className="pill purple" style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px' }}>
                Payroll Month: {month}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total Staff</span>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                  {totalCalculations.totalStaff}
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total Basic</span>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#334155', marginTop: 4 }}>
                  Rs {totalCalculations.basic.toLocaleString()}
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', textTransform: 'uppercase' }}>Total Allowances</span>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
                  +Rs {totalCalculations.allowances.toLocaleString()}
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', textTransform: 'uppercase' }}>Total Deductions</span>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', marginTop: 4 }}>
                  -Rs {totalCalculations.deductions.toLocaleString()}
                </div>
              </div>

              <div style={{ background: '#4338ca', borderRadius: 10, padding: '12px 14px', color: '#fff', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(67, 56, 202, 0.3)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grand Total Net Pay</span>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 4 }}>
                  Rs {totalCalculations.net.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* OVERVIEW / SUMMARY */}
      {tab === 'overview' && summary && !isTeacher && (
        <div className="fx-body">
          <div className="fx-kpis">
            <div className="fx-kpi"><span>Total Paid Out</span><strong style={{ color: '#16a34a' }}>Rs {Number(summary.total_paid).toLocaleString()}</strong></div>
            <div className="fx-kpi"><span>Pending / Approved</span><strong style={{ color: '#f59e0b' }}>Rs {Number(summary.total_pending).toLocaleString()}</strong></div>
          </div>
          <section className="panel hr-panel fx-card" style={{ marginTop: 20 }}>
            <div className="panel-head">
              <div><h3>Monthly Payroll Expense Trend</h3><p>Paid salaries by calendar month</p></div>
            </div>
            <div className="rp-chart" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.monthly || []} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => `Rs ${v.toLocaleString()}`} />
                  <Bar dataKey="paid" name="Paid Out" fill="#16a34a" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {summary.campuses && summary.campuses.length > 0 && (
            <section className="panel hr-panel fx-card" style={{ marginTop: 20 }}>
              <div className="panel-head">
                <div>
                  <h3>Campus Payroll Comparison (Highest Payout on Top)</h3>
                  <p>Campus breakdown sorted descending by total paid salaries</p>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>CAMPUS</th>
                      <th>TOTAL PAID OUT</th>
                      <th>PENDING / APPROVED</th>
                      <th>STAFF COUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.campuses.map((c: any) => (
                      <tr key={c.id}>
                        <td><strong>{c.name}</strong></td>
                        <td><strong style={{ color: '#16a34a' }}>Rs {Number(c.paid).toLocaleString()}</strong></td>
                        <td><span style={{ color: '#f59e0b' }}>Rs {Number(c.pending).toLocaleString()}</span></td>
                        <td>{c.staff_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* STRUCTURES */}
      {tab === 'structures' && !isTeacher && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>Staff Compensation Blueprints</h3><p>Salary structures with allowances and fixed deductions</p></div>
            <button className="primary-btn" onClick={() => setStructModal(true)}><Plus size={15} /> New Structure Revision</button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>STAFF MEMBER</th>
                  <th>CAMPUS</th>
                  <th>EFFECTIVE FROM</th>
                  <th>BASIC SALARY</th>
                  <th>ALLOWANCES</th>
                  <th>FIXED DEDUCTIONS</th>
                  <th>CURRENCY</th>
                </tr>
              </thead>
              <tbody>
                {structures.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.staff_name}</strong></td>
                    <td>{s.school_name}</td>
                    <td>{s.effective_from}</td>
                    <td><strong>Rs {s.basic}</strong></td>
                    <td>{s.allowances?.map((a: R) => `${a.name}: Rs ${a.amount}`).join(', ') || 'None'}</td>
                    <td>{s.fixed_deductions?.map((d: R) => `${d.name}: Rs ${d.amount}`).join(', ') || 'None'}</td>
                    <td>{s.currency}</td>
                  </tr>
                ))}
                {!structures.length && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>No salary structures defined. Click 'New Structure Revision' to assign compensation.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ADJUSTMENTS */}
      {tab === 'adjustments' && !isTeacher && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>One-off Adjustments & Advances</h3><p>Bonuses, fines/deductions, or salary advances for {month}</p></div>
            <button className="primary-btn" onClick={() => setAdjModal(true)}><Plus size={15} /> Add Adjustment</button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>STAFF MEMBER</th>
                  <th>CAMPUS</th>
                  <th>MONTH</th>
                  <th>KIND</th>
                  <th>AMOUNT</th>
                  <th>REASON</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.staff_name}</strong></td>
                    <td>{a.school_name}</td>
                    <td>{a.month}</td>
                    <td><span className={`pill ${a.kind === 'bonus' ? 'green' : 'amber'}`}>{a.kind_display}</span></td>
                    <td><strong>Rs {a.amount}</strong></td>
                    <td>{a.reason}</td>
                  </tr>
                ))}
                {!adjustments.length && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>No adjustments recorded for {month}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MY PAYSLIPS (TEACHER VIEW) */}
      {(tab === 'my_payslips' || isTeacher) && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>My Payslips</h3><p>Your official employment payslips and compensation history</p></div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th>GROSS PAY</th>
                  <th>NET SALARY</th>
                  <th>PAID ON</th>
                  <th>PAYMENT METHOD</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {myPayslips.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.month}</strong></td>
                    <td>Rs {p.gross}</td>
                    <td><strong style={{ color: '#16a34a' }}>Rs {p.net}</strong></td>
                    <td>{p.paid_on || 'Pending'}</td>
                    <td>{p.method}</td>
                    <td><span className="pill green">{p.status}</span></td>
                    <td>
                      <button className="sm-btn" onClick={() => openPayslip(p.id)}><Printer size={13} /> View / Print</button>
                    </td>
                  </tr>
                ))}
                {!myPayslips.length && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>No payslips on file yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL: Generate Sheet */}
      {generateModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Generate Monthly Salary Sheet</h3>
              <button onClick={() => setGenerateModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGenerateSheet}>
              <div className="modal-fields">
                <label>Billing Month (YYYY-MM) *
                  <input type="month" required value={genMonth} onChange={e => setGenMonth(e.target.value)} />
                </label>
                <label>Disbursement Due Date (Optional)
                  <input type="date" value={genDueDate} onChange={e => setGenDueDate(e.target.value)} />
                </label>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted, #64748b)', marginTop: 10 }}>
                This will automatically calculate basic salaries, active allowances, deductions, and adjustments for all active staff, accounting for mid-month hiring or proration.
              </p>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setGenerateModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Generate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Pay Salary */}
      {payModal && activePayRecord && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Disburse Salary: {activePayRecord.staff_name}</h3>
              <button onClick={() => setPayModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handlePaySalary}>
              <div className="modal-fields">
                <label>Net Payout Amount
                  <input type="text" disabled value={`Rs ${activePayRecord.net}`} />
                </label>
                <label>Payment Date *
                  <input type="date" required value={payDate} onChange={e => setPayDate(e.target.value)} />
                </label>
                <label>Payment Method *
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    <option value="bank">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </label>
                <label>Transaction / Reference #
                  <input type="text" placeholder="e.g. Bank transfer ref or cheque #" value={payRef} onChange={e => setPayRef(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setPayModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Confirm Payout & Post Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Void Salary */}
      {voidModal && activeVoidRecord && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Void Salary Record: {activeVoidRecord.staff_name}</h3>
              <button onClick={() => setVoidModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleVoidSalary}>
              <div className="modal-fields">
                <label>Void Justification Reason *
                  <input type="text" required placeholder="Reason for voiding this salary record" value={voidReason} onChange={e => setVoidReason(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setVoidModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn" style={{ background: '#dc2626' }}>Void Record</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Printable Payslip */}
      {payslipModal && activePayslip && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <h3>Employee Payslip</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="sm-btn" onClick={() => window.print()}><Printer size={15} /> Print</button>
                <button onClick={() => setPayslipModal(false)}><X size={18} /></button>
              </div>
            </div>
            <div style={{ padding: '20px 24px', border: '1px solid var(--border-color, #e2e8f0)', margin: '16px 20px', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #3b82f6', paddingBottom: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{activePayslip.school_name}</h2>
                  <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 13 }}>{activePayslip.school_city}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="pill green" style={{ fontSize: 12 }}>PAYSLIP: {activePayslip.month}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '16px 0', fontSize: 13 }}>
                <div><strong>Employee:</strong> {activePayslip.staff?.name}</div>
                <div><strong>Designation:</strong> {activePayslip.staff?.position}</div>
                <div><strong>Joined On:</strong> {activePayslip.staff?.hired_on}</div>
                <div><strong>Payment Status:</strong> {activePayslip.status.toUpperCase()}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, margin: '16px 0', borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                <div>
                  <h5 style={{ margin: '0 0 8px', color: '#16a34a' }}>EARNINGS</h5>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>Basic Salary:</span><strong>Rs {activePayslip.basic}</strong>
                  </div>
                  {activePayslip.details?.allowances?.map((a: R, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{a.name}:</span><strong>Rs {a.amount}</strong>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>Bonus Additions:</span><strong>Rs {activePayslip.additions_total}</strong>
                  </div>
                </div>

                <div>
                  <h5 style={{ margin: '0 0 8px', color: '#dc2626' }}>DEDUCTIONS</h5>
                  {activePayslip.details?.deductions?.map((d: R, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{d.name}:</span><strong>Rs {d.amount}</strong>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>Deductions / Fines:</span><strong>Rs {activePayslip.deductions_total}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>Advance Recovery:</span><strong>Rs {activePayslip.advance_recovered}</strong>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '2px dashed #94a3b8', marginTop: 16, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>NET PAYABLE</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>Rs {activePayslip.net}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: New Structure Revision */}
      {structModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Define Salary Structure</h3>
              <button onClick={() => setStructModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveStructure}>
              <div className="modal-fields">
                <label>Staff Member *
                  <select required value={structStaff} onChange={e => setStructStaff(e.target.value)}>
                    <option value="">Select staff member…</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.position})</option>)}
                  </select>
                </label>
                <label>Basic Salary (Rs) *
                  <input type="number" step="0.01" min="1" required value={structBasic} onChange={e => setStructBasic(e.target.value)} />
                </label>
                <label>Effective Date *
                  <input type="date" required value={structEffDate} onChange={e => setStructEffDate(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setStructModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Save Structure</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Adjustment */}
      {adjModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Record Salary Adjustment</h3>
              <button onClick={() => setAdjModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveAdjustment}>
              <div className="modal-fields">
                <label>Staff Member *
                  <select required value={adjStaff} onChange={e => setAdjStaff(e.target.value)}>
                    <option value="">Select staff member…</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.position})</option>)}
                  </select>
                </label>
                <label>Month (YYYY-MM) *
                  <input type="month" required value={adjMonth} onChange={e => setAdjMonth(e.target.value)} />
                </label>
                <label>Adjustment Kind *
                  <select value={adjKind} onChange={e => setAdjKind(e.target.value)}>
                    <option value="bonus">Bonus / Incentive (Add to pay)</option>
                    <option value="deduction">Deduction / Fine (Deduct from pay)</option>
                    <option value="advance">Salary Advance (Recovered from net)</option>
                  </select>
                </label>
                <label>Amount (Rs) *
                  <input type="number" step="0.01" min="1" required value={adjAmount} onChange={e => setAdjAmount(e.target.value)} />
                </label>
                <label>Reason *
                  <input type="text" required placeholder="Justification reason" value={adjReason} onChange={e => setAdjReason(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setAdjModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Save Adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
