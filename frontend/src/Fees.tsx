import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight,
  Download, FileSpreadsheet, FileText, Filter, Plus, Printer, Receipt,
  RefreshCw, Search, ShieldAlert, Sparkles, UserCheck, Users, X, Edit2, Trash2, Eye,
  Clock, CheckCheck
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { list, request, type User } from './api';
import ExportMenu, { type ExportColumn } from './ExportMenu';
import { FilterBar } from './FilterBar';
import './hr.css';

type R = Record<string, any>;
type Tab = 'overview' | 'structures' | 'collect' | 'vouchers' | 'defaulters' | 'concessions' | 'receipts';

interface FeesProps {
  user: User;
  notify: (m: string) => void;
  initialTab?: string;
}

export default function Fees({ user, notify, initialTab }: FeesProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [schools, setSchools] = useState<R[]>([]);
  const [school, setSchool] = useState('');
  const [summary, setSummary] = useState<R | null>(null);
  const [defaulters, setDefaulters] = useState<R[]>([]);
  const [heads, setHeads] = useState<R[]>([]);
  const [structures, setStructures] = useState<R[]>([]);
  const [concessions, setConcessions] = useState<R[]>([]);
  const [receiptsList, setReceiptsList] = useState<R[]>([]);
  const [classes, setClasses] = useState<R[]>([]);
  const [defaulterFilters, setDefaulterFilters] = useState<Record<string, any>>({});
  const [receiptFilters, setReceiptFilters] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bump, setBump] = useState(0);

  // Receipts approval filter
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'pending' | 'approved'>('all');

  // Collect tab state
  const [studentSearch, setStudentSearch] = useState('');
  const [searchedStudents, setSearchedStudents] = useState<R[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<R | null>(null);
  const [studentLedger, setStudentLedger] = useState<R | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payRef, setPayRef] = useState('');
  const [payAutoApprove, setPayAutoApprove] = useState(true);
  const [recentReceipt, setRecentReceipt] = useState<R | null>(null);
  const [receiptModal, setReceiptModal] = useState<R | null>(null);

  // Modals
  const [voucherModal, setVoucherModal] = useState(false);
  const [voucherPeriod, setVoucherPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [voucherClass, setVoucherClass] = useState('');

  const [headModal, setHeadModal] = useState(false);
  const [headName, setHeadName] = useState('');

  const [structureModal, setStructureModal] = useState(false);
  const [editingStructureId, setEditingStructureId] = useState<number | null>(null);
  const [structHead, setStructHead] = useState('');
  const [structClass, setStructClass] = useState('');
  const [structAmount, setStructAmount] = useState('');
  const [structFreq, setStructFreq] = useState('monthly');
  const [structDueDay, setStructDueDay] = useState('10');

  const [concessionModal, setConcessionModal] = useState(false);
  const [concStudentId, setConcStudentId] = useState('');
  const [concHeadId, setConcHeadId] = useState('');
  const [concType, setConcType] = useState('percent');
  const [concVal, setConcVal] = useState('');
  const [concReason, setConcReason] = useState('');

  // Handle deep-linked tab
  useEffect(() => {
    if (initialTab) {
      const lower = initialTab.toLowerCase().trim();
      if (['overview', 'fee overview'].includes(lower)) setTab('overview');
      else if (['structure', 'structures', 'fee structure'].includes(lower)) setTab('structures');
      else if (['collect', 'collect fee'].includes(lower)) setTab('collect');
      else if (['voucher', 'vouchers'].includes(lower)) setTab('vouchers');
      else if (['defaulter', 'defaulters'].includes(lower)) setTab('defaulters');
      else if (['concession', 'concessions'].includes(lower)) setTab('concessions');
      else if (['receipt', 'receipts'].includes(lower)) setTab('receipts');
    }
  }, [initialTab]);

  // Initial reference data
  useEffect(() => {
    list<R>('schools').then(setSchools).catch(() => {});
    list<R>('classes').then(setClasses).catch(() => {});
  }, []);

  const defaulterQs = useMemo(() => {
    const params = new URLSearchParams();
    if (school) params.set('school', school);
    Object.entries(defaulterFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    return params.toString() ? `?${params.toString()}` : '';
  }, [school, defaulterFilters]);

  const receiptQs = useMemo(() => {
    const params = new URLSearchParams();
    if (school) params.set('school', school);
    Object.entries(receiptFilters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
    return params.toString() ? `?${params.toString()}` : '';
  }, [school, receiptFilters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    const qs = school ? `?school=${school}` : '';
    try {
      const [sumRes, defRes, headRes, structRes, concRes, payRes] = await Promise.all([
        request<R>(`fees/summary/${qs}`),
        request<R>(`fees/defaulters/${defaulterQs}`),
        request<R>(`fees/heads/${qs}`),
        request<R>(`fees/structures/${qs}`),
        request<R>(`fees/concessions/${qs}`),
        request<R>(`fees/payments/${receiptQs}`).catch(() => ({ results: [] }))
      ]);
      setSummary(sumRes);
      setDefaulters(defRes.results || []);
      setHeads(headRes.results || []);
      setStructures(structRes.results || []);
      setConcessions(concRes.results || []);
      setReceiptsList(payRes.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load fee data');
    } finally {
      setLoading(false);
    }
  }, [school, defaulterQs, receiptQs]);

  useEffect(() => { loadData(); }, [loadData, bump]);

  // Search students for fee collection
  const handleStudentSearch = async () => {
    if (!studentSearch.trim()) return;
    try {
      const res = await list<R>('students');
      const filtered = res.filter((s: R) =>
        s.first_name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.last_name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.admission_number?.toLowerCase().includes(studentSearch.toLowerCase())
      );
      setSearchedStudents(filtered);
    } catch {
      notify('Search failed');
    }
  };

  const selectStudentForPay = async (s: R) => {
    setSelectedStudent(s);
    try {
      const led = await request<R>(`fees/ledger/${s.id}/`);
      setStudentLedger(led);
      if (led.summary?.outstanding_balance && Number(led.summary.outstanding_balance) > 0) {
        setPayAmount(led.summary.outstanding_balance);
      } else {
        setPayAmount('');
      }
    } catch {
      notify('Could not load student ledger');
    }
  };

  const handlePayFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !payAmount) return;
    try {
      const res = await request<R>('fees/payments/', {
        method: 'POST',
        body: JSON.stringify({
          student: selectedStudent.id,
          amount: payAmount,
          method: payMethod,
          reference: payRef,
          auto_approve: payAutoApprove,
          paid_on: new Date().toISOString().slice(0, 10)
        })
      });
      notify(payAutoApprove ? `Fee collected & approved! Receipt #${res.receipt_number}` : `Payment recorded as pending verification! Receipt #${res.receipt_number}`);
      const receiptData = { ...res, student_name: selectedStudent.name || `${selectedStudent.first_name} ${selectedStudent.last_name}` };
      setRecentReceipt(receiptData);
      setReceiptModal(receiptData);
      setPayAmount('');
      setPayRef('');
      setBump(b => b + 1);
      selectStudentForPay(selectedStudent);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Payment recording failed');
    }
  };

  const handleApproveReceipt = async (id: number) => {
    try {
      await request(`fees/payments/${id}/approve/`, { method: 'POST' });
      notify('Fee payment approved and posted to Income ledger');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not approve payment');
    }
  };

  const handleBulkApprove = async () => {
    const pending = receiptsList.filter(p => p.status === 'pending');
    if (!pending.length) {
      notify('No pending payments to approve');
      return;
    }
    try {
      const res = await request<{ approved_count: number }>('fees/payments/bulk-approve/', {
        method: 'POST',
        body: JSON.stringify({ ids: pending.map(p => p.id), school: school || undefined })
      });
      notify(`Successfully approved ${res.approved_count} fee receipts into Income ledger`);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Bulk approval failed');
    }
  };

  const handleGenerateVouchers = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await request<R>('fees/vouchers/generate/', {
        method: 'POST',
        body: JSON.stringify({
          period: voucherPeriod,
          school_class: voucherClass || undefined,
          school: school || (schools[0]?.id ? String(schools[0].id) : undefined)
        })
      });
      notify(`Generated ${res.vouchers_created} voucher items for ${voucherPeriod}`);
      setVoucherModal(false);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Generation failed');
    }
  };

  const handleCreateHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headName.trim()) return;
    try {
      await request<R>('fees/heads/', {
        method: 'POST',
        body: JSON.stringify({
          name: headName.trim(),
          school: school || (schools[0]?.id ? String(schools[0].id) : undefined)
        })
      });
      notify(`Fee category '${headName}' added`);
      setHeadName('');
      setHeadModal(false);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to add fee head');
    }
  };

  const openNewStructure = () => {
    setEditingStructureId(null);
    setStructHead(heads[0]?.id ? String(heads[0].id) : '');
    setStructClass('');
    setStructAmount('');
    setStructFreq('monthly');
    setStructDueDay('10');
    setStructureModal(true);
  };

  const openEditStructure = (s: R) => {
    setEditingStructureId(s.id);
    setStructHead(s.head ? String(s.head) : '');
    setStructClass(s.school_class ? String(s.school_class) : '');
    setStructAmount(String(s.amount || ''));
    setStructFreq(s.frequency || 'monthly');
    setStructDueDay(String(s.due_day || 10));
    setStructureModal(true);
  };

  const handleCreateStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStructureId) {
        await request<R>(`fees/structures/${editingStructureId}/`, {
          method: 'PATCH',
          body: JSON.stringify({
            amount: structAmount,
            due_day: structDueDay
          })
        });
        notify('Fee structure rate updated');
      } else {
        await request<R>('fees/structures/', {
          method: 'POST',
          body: JSON.stringify({
            head: structHead,
            school_class: structClass || undefined,
            amount: structAmount,
            frequency: structFreq,
            due_day: structDueDay,
            school: school || (schools[0]?.id ? String(schools[0].id) : undefined)
          })
        });
        notify('Fee structure saved');
      }
      setStructureModal(false);
      setEditingStructureId(null);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save fee structure');
    }
  };

  const handleDeleteStructure = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this fee structure?')) return;
    try {
      await request(`fees/structures/${id}/`, { method: 'DELETE' });
      notify('Fee structure deleted successfully');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete fee structure');
    }
  };

  const handleDeleteConcession = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this concession?')) return;
    try {
      await request(`fees/concessions/${id}/`, { method: 'DELETE' });
      notify('Concession revoked');
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to delete concession');
    }
  };

  const handleCreateConcession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await request<R>('fees/concessions/', {
        method: 'POST',
        body: JSON.stringify({
          student: concStudentId,
          head: concHeadId || undefined,
          discount_type: concType,
          discount_value: concVal,
          reason: concReason
        })
      });
      notify('Concession applied successfully');
      setConcessionModal(false);
      setBump(b => b + 1);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to apply concession');
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">STUDENTS & LEARNING / FEES</div>
          <h1>Student Fees</h1>
          <p>Institutional fee collection, heads, billing vouchers, and automated finance integration.</p>
        </div>
        <div className="fx-filters" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {schools.length > 1 && (
            <label>Campus
              <select className="fx-select" value={school} onChange={e => setSchool(e.target.value)}>
                <option value="">All campuses</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}

          {tab === 'defaulters' && (
            <ExportMenu
              title="Fee Defaulters Directory"
              filename="fee-defaulters"
              endpoint={`fees/defaulters/${school ? `?school=${school}` : ''}`}
              notify={notify}
            />
          )}

          {tab === 'structures' && (
            <ExportMenu
              title="Fee Structures Directory"
              filename="fee-structures"
              endpoint={`fees/structures/${school ? `?school=${school}` : ''}`}
              notify={notify}
            />
          )}

          {tab === 'receipts' && (
            <ExportMenu
              title="Fee Payment Receipts"
              filename="fee-receipts"
              endpoint={`fees/payments/${school ? `?school=${school}` : ''}`}
              notify={notify}
            />
          )}

          <button className="outline-btn" onClick={() => setBump(b => b + 1)}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      <nav className="fx-tabs" aria-label="Fee sections">
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}><Receipt size={15} /> Fee overview</button>
        <button className={tab === 'structures' ? 'on' : ''} onClick={() => setTab('structures')}><FileSpreadsheet size={15} /> Fee structure</button>
        <button className={tab === 'collect' ? 'on' : ''} onClick={() => setTab('collect')}><UserCheck size={15} /> Collect fee</button>
        <button className={tab === 'vouchers' ? 'on' : ''} onClick={() => setTab('vouchers')}><ShieldAlert size={15} /> Vouchers</button>
        <button className={tab === 'defaulters' ? 'on' : ''} onClick={() => setTab('defaulters')}><AlertCircle size={15} /> Defaulters ({defaulters.length})</button>
        <button className={tab === 'concessions' ? 'on' : ''} onClick={() => setTab('concessions')}><Sparkles size={15} /> Concessions</button>
        <button className={tab === 'receipts' ? 'on' : ''} onClick={() => setTab('receipts')}><Receipt size={15} /> Receipts</button>
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {/* OVERVIEW TAB */}
      {tab === 'overview' && summary && (
        <div className="fx-body">
          <div className="fx-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="fx-kpi">
              <span>Active Students</span>
              <strong style={{ color: '#7c3aed' }}>{summary.total_students ?? 0} Students</strong>
              <small>Enrolled learners in campus</small>
            </div>
            <div className="fx-kpi">
              <span>Estimated Total Income</span>
              <strong style={{ color: '#2563eb' }}>Rs {Number(summary.expected).toLocaleString()}</strong>
              <small>~Rs {Math.round(summary.avg_per_student || 0).toLocaleString()} / student</small>
            </div>
            <div className="fx-kpi">
              <span>Collected (Approved)</span>
              <strong style={{ color: '#16a34a' }}>Rs {Number(summary.collected).toLocaleString()}</strong>
              <small>{summary.collection_rate}% realized in Income</small>
            </div>
            <div className="fx-kpi">
              <span>Remaining to Collect</span>
              <strong style={{ color: '#dc2626' }}>Rs {Number(summary.outstanding).toLocaleString()}</strong>
              <small>Outstanding balance</small>
            </div>
            <div className="fx-kpi">
              <span>Pending Admin Approval</span>
              <strong style={{ color: '#d97706' }}>Rs {Number(summary.pending_approval || 0).toLocaleString()}</strong>
              <small>Challans submitted</small>
            </div>
          </div>

          <div className="fx-grid">
            <section className="panel hr-panel fx-card">
              <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><h3>Monthly Collections Trend</h3><p>Realized fee revenue by calendar month</p></div>
                <ExportMenu
                  title="Monthly Fee Collections Trend"
                  filename="monthly-fee-collections"
                  columns={[
                    { key: 'month', label: 'Month' },
                    { key: 'collected', label: 'Collected Amount (Rs)' }
                  ]}
                  rows={summary.monthly || []}
                  size="sm"
                  notify={notify}
                />
              </div>
              <div className="rp-chart" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.monthly || []} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="#edf0f6" strokeDasharray="4 6" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => `Rs ${v.toLocaleString()}`} />
                    <Bar dataKey="collected" name="Collected" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel hr-panel fx-card">
              <div className="panel-head">
                <div><h3>Quick Operations</h3><p>Direct shortcuts for institutional fee billing</p></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px' }}>
                <button className="primary-btn" onClick={() => setTab('collect')}>
                  <UserCheck size={16} /> Collect Student Fee
                </button>
                <button className="outline-btn" onClick={() => setVoucherModal(true)}>
                  <Receipt size={16} /> Generate Monthly Billing Vouchers
                </button>
                <button className="outline-btn" onClick={() => openNewStructure()}>
                  <Plus size={16} /> Define Fee Structure / Rates
                </button>
                <button className="outline-btn" onClick={() => setTab('defaulters')}>
                  <ShieldAlert size={16} /> Inspect Defaulters ({defaulters.length} overdue)
                </button>
                <button className="outline-btn" onClick={() => setTab('receipts')}>
                  <Receipt size={16} /> Review Payment Receipts
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* COLLECT FEE TAB */}
      {tab === 'collect' && (
        <div className="collect-fee-grid">
          <section className="panel hr-panel">
            <div className="panel-head">
              <div><h3>Student Search</h3><p>Locate student to inspect ledger or record payment</p></div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Search name or admission number…"
                className="fx-select"
                style={{ flex: 1 }}
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStudentSearch()}
              />
              <button className="primary-btn" onClick={handleStudentSearch}><Search size={15} /> Search</button>
            </div>

            {searchedStudents.length > 0 && (
              <div style={{ padding: '0 20px 20px', maxHeight: 300, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Admission #</th><th>Action</th></tr></thead>
                  <tbody>
                    {searchedStudents.map(s => (
                      <tr key={s.id}>
                        <td><strong>{s.name || `${s.first_name} ${s.last_name}`}</strong></td>
                        <td>{s.admission_number}</td>
                        <td>
                          <button className="sm-btn" onClick={() => selectStudentForPay(s)}>
                            Select <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedStudent && studentLedger && (
              <div style={{ padding: '0 20px 20px', borderTop: '1px solid #edf0f6', marginTop: 12 }}>
                <h4 style={{ margin: '14px 0 8px' }}>Ledger Summary for {selectedStudent.name || `${selectedStudent.first_name} ${selectedStudent.last_name}`}</h4>
                <div className="fx-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div className="fx-kpi"><small>Total Billed</small><strong>Rs {studentLedger.summary?.total_billed}</strong></div>
                  <div className="fx-kpi"><small>Total Paid</small><strong style={{ color: '#16a34a' }}>Rs {studentLedger.summary?.total_paid}</strong></div>
                  <div className="fx-kpi"><small>Outstanding</small><strong style={{ color: '#dc2626' }}>Rs {studentLedger.summary?.outstanding_balance}</strong></div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <b style={{ fontSize: 13 }}>Outstanding Vouchers:</b>
                  <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 6 }}>
                    <table className="data-table">
                      <thead><tr><th>Period</th><th>Head</th><th>Due</th><th>Status</th></tr></thead>
                      <tbody>
                        {(studentLedger.fee_lines || []).map((l: R) => (
                          <tr key={l.id}>
                            <td>{l.period}</td>
                            <td>{l.head_name}</td>
                            <td>Rs {l.net_due}</td>
                            <td><span className={`pill ${l.status === 'paid' ? 'green' : l.status === 'partial' ? 'orange' : 'red'}`}>{l.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="panel hr-panel">
            <div className="panel-head">
              <div><h3>Record Fee Payment</h3><p>Issues receipt & posts automated income entry to Finance</p></div>
            </div>
            <form onSubmit={handlePayFee} style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>Selected Student
                  <input
                    type="text"
                    disabled
                    value={selectedStudent ? `${selectedStudent.name || `${selectedStudent.first_name} ${selectedStudent.last_name}`} (${selectedStudent.admission_number || selectedStudent.id})` : 'Search and select a student on the left'}
                    className="fx-select"
                  />
                </label>
                <label>Payment Amount (Rs) *
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="Enter collected amount"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="fx-select"
                    disabled={!selectedStudent}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label>Payment Method
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="fx-select" disabled={!selectedStudent}>
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cheque">Cheque</option>
                      <option value="online">Online / POS</option>
                    </select>
                  </label>
                  <label>Reference # / Notes
                    <input
                      type="text"
                      placeholder="Bank slip #, cheque #, or receipt note"
                      value={payRef}
                      onChange={e => setPayRef(e.target.value)}
                      className="fx-select"
                      disabled={!selectedStudent}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={!selectedStudent || !payAmount}
                  style={{ alignSelf: 'flex-start', marginTop: 8 }}
                >
                  <Receipt size={16} /> Collect & Issue Official Receipt
                </button>
              </div>
            </form>

            {recentReceipt && (
              <div style={{ margin: '0 20px 20px', padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#16a34a' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} />
                    <b>Payment Successfully Recorded!</b>
                  </div>
                  <button className="outline-btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setReceiptModal(recentReceipt)}>
                    <Printer size={13} /> View Receipt
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: '#166534' }}>
                  Receipt <b>#{recentReceipt.receipt_number}</b> issued to <b>{recentReceipt.student_name}</b> for <b>Rs {recentReceipt.amount}</b> ({recentReceipt.method}).
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* VOUCHERS TAB */}
      {tab === 'vouchers' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Institutional Billing Vouchers</h3>
              <p>Batch generate monthly, quarterly, and annual billing vouchers for student cohorts</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary-btn" onClick={() => setVoucherModal(true)}><Receipt size={15} /> Batch Generate Vouchers</button>
            </div>
          </div>
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
            <Receipt size={40} strokeWidth={1.5} style={{ margin: '0 auto 12px', opacity: 0.6 }} />
            <h4 style={{ margin: '0 0 6px', fontSize: 16 }}>Automated Monthly Invoicing</h4>
            <p style={{ maxWidth: 500, margin: '0 auto 16px', fontSize: 13 }}>
              Generate fee vouchers for all enrolled students across an entire campus or target specific class cohorts. Generated vouchers feed directly into student ledgers and parent portals.
            </p>
            <button className="primary-btn" onClick={() => setVoucherModal(true)}>
              <Receipt size={16} /> Launch Voucher Generation Wizard
            </button>
          </div>
        </section>
      )}

      {/* DEFAULTERS TAB */}
      {tab === 'defaulters' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Fee Defaulters & Overdue Ledger</h3>
              <p>Students with outstanding balances past the institutional due date</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ExportMenu
                title="Fee Defaulters Directory"
                filename="fee-defaulters"
                endpoint={`fees/defaulters/${defaulterQs}`}
                notify={notify}
              />
              <button className="primary-btn" onClick={() => setVoucherModal(true)}><Receipt size={15} /> Generate Vouchers</button>
            </div>
          </div>
          <div style={{ padding: '0 20px 14px 20px' }}>
            <FilterBar
              searchPlaceholder="Search defaulters by student name, admission #, or father name..."
              filters={[
                {
                  key: 'section',
                  label: 'Section',
                  options: [
                    { label: 'Section A', value: 'A' },
                    { label: 'Section B', value: 'B' },
                    { label: 'Section C', value: 'C' },
                  ]
                }
              ]}
              values={defaulterFilters}
              onChange={setDefaulterFilters}
              onClear={() => setDefaulterFilters({})}
            />
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>ADMISSION #</th>
                  <th>CLASS</th>
                  <th>CAMPUS</th>
                  <th>OVERDUE AMOUNT</th>
                  <th>DAYS OVERDUE</th>
                  <th>OLDEST DUE DATE</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {defaulters.map(d => (
                  <tr key={d.student_id}>
                    <td><strong>{d.student_name}</strong></td>
                    <td>{d.admission_number}</td>
                    <td>{d.class_name}</td>
                    <td>{d.school_name}</td>
                    <td><strong style={{ color: '#dc2626' }}>Rs {d.total_overdue}</strong></td>
                    <td><span className="pill red">{d.days_overdue} days</span></td>
                    <td>{d.oldest_due_date}</td>
                    <td>
                      <button className="sm-btn" onClick={() => { setTab('collect'); setStudentSearch(d.admission_number); }}>
                        Collect <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!defaulters.length && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No fee defaulters found. All student balances are up to date!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* FEE STRUCTURES TAB */}
      {tab === 'structures' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>Fee Structures & Heads</h3><p>Active institutional fee rates and schedule</p></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ExportMenu
                title="Fee Structures Directory"
                filename="fee-structures"
                endpoint={`fees/structures/${school ? `?school=${school}` : ''}`}
                notify={notify}
              />
              <button className="outline-btn" onClick={() => setHeadModal(true)}><Plus size={15} /> Add Fee Head</button>
              <button className="primary-btn" onClick={() => openNewStructure()}><Plus size={15} /> Set Fee Rate</button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>FEE HEAD</th>
                  <th>CLASS</th>
                  <th>CAMPUS</th>
                  <th>AMOUNT</th>
                  <th>FREQUENCY</th>
                  <th>DUE DAY</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {structures.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.head_name}</strong></td>
                    <td>{s.school_class_name}</td>
                    <td>{s.school_name}</td>
                    <td><strong>Rs {s.amount}</strong></td>
                    <td><span className="pill purple">{s.frequency}</span></td>
                    <td>Day {s.due_day} of month</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="sm-btn" title="Edit rate" onClick={() => openEditStructure(s)}>
                          <Edit2 size={13} /> Edit
                        </button>
                        <button className="sm-btn danger" title="Delete structure" onClick={() => handleDeleteStructure(s.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!structures.length && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>No fee structures configured yet. Click 'Set Fee Rate' to define tuition rates.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CONCESSIONS TAB */}
      {tab === 'concessions' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div><h3>Student Fee Concessions & Scholarships</h3><p>Approved student fee discounts (sibling, staff-ward, merit)</p></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <ExportMenu
                title="Fee Concessions Directory"
                filename="fee-concessions"
                endpoint={`fees/concessions/${school ? `?school=${school}` : ''}`}
                notify={notify}
              />
              <button className="primary-btn" onClick={() => setConcessionModal(true)}><Plus size={15} /> Grant Concession</button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>APPLIES TO</th>
                  <th>DISCOUNT</th>
                  <th>REASON</th>
                  <th>APPROVED BY</th>
                  <th>VALIDITY</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {concessions.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.student_name}</strong></td>
                    <td>{c.head_name}</td>
                    <td><strong style={{ color: '#16a34a' }}>{c.discount_type === 'percent' ? `${c.discount_value}%` : `Rs ${c.discount_value}`}</strong></td>
                    <td>{c.reason}</td>
                    <td>{c.approved_by}</td>
                    <td>{c.valid_from} {c.valid_to ? `to ${c.valid_to}` : '(ongoing)'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="sm-btn danger" title="Revoke/Delete concession" onClick={() => handleDeleteConcession(c.id)}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!concessions.length && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30 }}>No concessions granted yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* RECEIPTS TAB */}
      {tab === 'receipts' && (
        <section className="panel hr-panel">
          <div className="panel-head" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3>Payment Receipts & Approval Ledger</h3>
              <p>Challans submitted by students remain Pending until verified and approved by School Admin into Income</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 3, borderRadius: 8, gap: 4 }}>
                <button
                  type="button"
                  className={`sm-btn ${receiptFilter === 'all' ? 'primary-btn' : ''}`}
                  style={{ border: 'none', background: receiptFilter === 'all' ? '#4f46e5' : 'transparent', color: receiptFilter === 'all' ? 'white' : '#64748b', fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setReceiptFilter('all')}
                >
                  All ({receiptsList.length})
                </button>
                <button
                  type="button"
                  className={`sm-btn ${receiptFilter === 'pending' ? 'primary-btn' : ''}`}
                  style={{ border: 'none', background: receiptFilter === 'pending' ? '#d97706' : 'transparent', color: receiptFilter === 'pending' ? 'white' : '#64748b', fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setReceiptFilter('pending')}
                >
                  Pending ({receiptsList.filter(p => p.status === 'pending').length})
                </button>
                <button
                  type="button"
                  className={`sm-btn ${receiptFilter === 'approved' ? 'primary-btn' : ''}`}
                  style={{ border: 'none', background: receiptFilter === 'approved' ? '#16a34a' : 'transparent', color: receiptFilter === 'approved' ? 'white' : '#64748b', fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setReceiptFilter('approved')}
                >
                  Approved ({receiptsList.filter(p => p.status === 'approved').length})
                </button>
              </div>

              {receiptsList.some(p => p.status === 'pending') && (
                <button
                  className="primary-btn"
                  style={{ background: '#16a34a', borderColor: '#15803d', fontSize: 12 }}
                  title="Approve all submitted pending challans into Income"
                  onClick={handleBulkApprove}
                >
                  <CheckCheck size={14} /> Approve All Pending ({receiptsList.filter(p => p.status === 'pending').length})
                </button>
              )}

              <ExportMenu
                title="Payment Receipts Log"
                filename="payment-receipts"
                endpoint={`fees/payments/${receiptQs}`}
                notify={notify}
              />
            </div>
          </div>
          <div style={{ padding: '0 20px 14px 20px' }}>
            <FilterBar
              searchPlaceholder="Search receipts by student, admission #, or transaction reference..."
              filters={[
                {
                  key: 'status',
                  label: 'Status',
                  options: [
                    { label: 'Pending', value: 'pending' },
                    { label: 'Approved', value: 'approved' },
                    { label: 'Rejected', value: 'rejected' },
                  ]
                },
                {
                  key: 'method',
                  label: 'Method',
                  options: [
                    { label: 'Cash', value: 'cash' },
                    { label: 'Bank Transfer', value: 'bank_transfer' },
                    { label: 'Online Gateway', value: 'online' },
                    { label: 'Cheque', value: 'cheque' },
                  ]
                }
              ]}
              values={receiptFilters}
              onChange={setReceiptFilters}
              onClear={() => setReceiptFilters({})}
            />
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>RECEIPT #</th>
                  <th>STUDENT</th>
                  <th>ADMISSION #</th>
                  <th>CAMPUS</th>
                  <th>AMOUNT</th>
                  <th>METHOD</th>
                  <th>STATUS</th>
                  <th>PAID ON</th>
                  <th>REFERENCE</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {receiptsList
                  .filter(p => {
                    if (receiptFilter === 'pending') return p.status === 'pending';
                    if (receiptFilter === 'approved') return p.status === 'approved';
                    return true;
                  })
                  .map(p => {
                    const isPending = p.status === 'pending';
                    const isVoided = p.voided || p.status === 'rejected';
                    return (
                      <tr key={p.id}>
                        <td><strong style={{ color: '#2563eb' }}>{p.receipt_number}</strong></td>
                        <td><strong>{p.student_name}</strong></td>
                        <td>{p.admission_number || '—'}</td>
                        <td>{p.school_name}</td>
                        <td><strong style={{ color: '#16a34a' }}>Rs {p.amount}</strong></td>
                        <td><span className="pill purple" style={{ textTransform: 'capitalize' }}>{p.method.replace('_', ' ')}</span></td>
                        <td>
                          {isPending ? (
                            <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Clock size={11} /> Pending Approval
                            </span>
                          ) : isVoided ? (
                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                              Voided
                            </span>
                          ) : (
                            <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={11} /> Approved
                            </span>
                          )}
                        </td>
                        <td>{p.paid_on}</td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{p.reference || '—'}</td>
                        <td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {isPending && (
                            <button
                              className="sm-btn"
                              style={{ background: '#16a34a', color: 'white', borderColor: '#15803d', fontWeight: 700 }}
                              title="Approve payment and link to Income ledger"
                              onClick={() => handleApproveReceipt(p.id)}
                            >
                              <CheckCircle2 size={12} /> Approve
                            </button>
                          )}
                          <button
                            className="sm-btn"
                            title="View & Print Official Receipt"
                            onClick={() => setReceiptModal(p)}
                          >
                            <Eye size={13} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                {!receiptsList.filter(p => receiptFilter === 'pending' ? p.status === 'pending' : receiptFilter === 'approved' ? p.status === 'approved' : true).length && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30 }}>No receipts found in this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MODAL: Generate Vouchers */}
      {voucherModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setVoucherModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>Generate Monthly Billing Vouchers</h3>
              <button onClick={() => setVoucherModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGenerateVouchers}>
              <div className="modal-fields">
                <label>Billing Period (YYYY-MM) *
                  <input type="month" required value={voucherPeriod} onChange={e => setVoucherPeriod(e.target.value)} />
                </label>
                <label>Target Class (optional - leave blank for all)
                  <select value={voucherClass} onChange={e => setVoucherClass(e.target.value)}>
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setVoucherModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Generate Vouchers</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Fee Head */}
      {headModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setHeadModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>Create Fee Head</h3>
              <button onClick={() => setHeadModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateHead}>
              <div className="modal-fields">
                <label>Fee Head Name *
                  <input type="text" placeholder="e.g. Tuition Fee, Admission Fee, Transport" required value={headName} onChange={e => setHeadName(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setHeadModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Save Head</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Structure */}
      {structureModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setStructureModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>{editingStructureId ? 'Edit Fee Structure Rate' : 'Set Fee Structure Rate'}</h3>
              <button onClick={() => setStructureModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateStructure}>
              <div className="modal-fields">
                <label>Fee Head *
                  <select required disabled={!!editingStructureId} value={structHead} onChange={e => setStructHead(e.target.value)}>
                    <option value="">Select fee head…</option>
                    {heads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </label>
                <label>Class (optional - leave blank for school-wide)
                  <select disabled={!!editingStructureId} value={structClass} onChange={e => setStructClass(e.target.value)}>
                    <option value="">All Classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>Amount (Rs) *
                  <input type="number" step="0.01" min="1" required value={structAmount} onChange={e => setStructAmount(e.target.value)} />
                </label>
                <label>Frequency
                  <select disabled={!!editingStructureId} value={structFreq} onChange={e => setStructFreq(e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="term">Per Term</option>
                    <option value="annual">Annual</option>
                    <option value="one_time">One-time / Admission</option>
                  </select>
                </label>
                <label>Due Day of Month (1-31)
                  <input type="number" min="1" max="31" value={structDueDay} onChange={e => setStructDueDay(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setStructureModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">{editingStructureId ? 'Update Rate' : 'Save Rate'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Concession */}
      {concessionModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setConcessionModal(false); }}>
          <div className="modal-card">
            <div className="modal-head">
              <h3>Grant Student Concession</h3>
              <button onClick={() => setConcessionModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateConcession}>
              <div className="modal-fields">
                <label>Student ID *
                  <input type="number" placeholder="Enter student ID" required value={concStudentId} onChange={e => setConcStudentId(e.target.value)} />
                </label>
                <label>Fee Head (optional - leave blank for all)
                  <select value={concHeadId} onChange={e => setConcHeadId(e.target.value)}>
                    <option value="">All Fee Heads</option>
                    {heads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </label>
                <label>Discount Type
                  <select value={concType} onChange={e => setConcType(e.target.value)}>
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (Rs)</option>
                  </select>
                </label>
                <label>Discount Value *
                  <input type="number" step="0.01" min="0.01" required value={concVal} onChange={e => setConcVal(e.target.value)} />
                </label>
                <label>Reason / Approval Justification *
                  <input type="text" placeholder="e.g. Sibling discount (Brother in Gr 7) or Staff child" required value={concReason} onChange={e => setConcReason(e.target.value)} />
                </label>
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="outline-btn" onClick={() => setConcessionModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Grant Concession</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Official Receipt Preview / Print */}
      {receiptModal && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setReceiptModal(null); }}>
          <div className="modal-card" style={{ maxWidth: 520 }}>
            <div className="modal-head">
              <div className="modal-icon"><Receipt size={20} /></div>
              <div>
                <h3>Official Fee Receipt</h3>
                <p>Optimus Orien Educational Platform • Verified Payment</p>
              </div>
              <button onClick={() => setReceiptModal(null)}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fafaf9', margin: '14px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Receipt Number</div>
                  <strong style={{ fontSize: 16, color: '#2563eb' }}>{receiptModal.receipt_number}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Date</div>
                  <strong>{receiptModal.paid_on || new Date().toISOString().slice(0, 10)}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: 11 }}>STUDENT NAME</small>
                  <strong>{receiptModal.student_name}</strong>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: 11 }}>ADMISSION ID</small>
                  <strong>{receiptModal.admission_number || '—'}</strong>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: 11 }}>PAYMENT METHOD</small>
                  <strong style={{ textTransform: 'capitalize' }}>{String(receiptModal.method || 'cash').replace('_', ' ')}</strong>
                </div>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: 11 }}>REFERENCE</small>
                  <strong>{receiptModal.reference || 'Institutional Tuition'}</strong>
                </div>
              </div>

              <div style={{ background: '#f1f5f9', padding: '12px 16px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Amount Received:</span>
                <strong style={{ fontSize: 18, color: '#16a34a' }}>Rs {receiptModal.amount}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="outline-btn" onClick={() => setReceiptModal(null)}>Close</button>
              <button type="button" className="primary-btn" onClick={handlePrintReceipt}>
                <Printer size={15} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
