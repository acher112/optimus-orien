import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight,
  Download, FileSpreadsheet, FileText, Filter, Plus, Printer, Receipt,
  RefreshCw, Search, ShieldAlert, Sparkles, UserCheck, Users, X, Edit2, Trash2
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { list, request, type User } from './api';
import './hr.css';

type R = Record<string, any>;
type Tab = 'overview' | 'collect' | 'vouchers' | 'structures' | 'concessions';

export default function Fees({ user, notify }: { user: User; notify: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [schools, setSchools] = useState<R[]>([]);
  const [school, setSchool] = useState('');
  const [summary, setSummary] = useState<R | null>(null);
  const [defaulters, setDefaulters] = useState<R[]>([]);
  const [heads, setHeads] = useState<R[]>([]);
  const [structures, setStructures] = useState<R[]>([]);
  const [concessions, setConcessions] = useState<R[]>([]);
  const [classes, setClasses] = useState<R[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bump, setBump] = useState(0);

  // Collect tab state
  const [studentSearch, setStudentSearch] = useState('');
  const [searchedStudents, setSearchedStudents] = useState<R[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<R | null>(null);
  const [studentLedger, setStudentLedger] = useState<R | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payRef, setPayRef] = useState('');
  const [recentReceipt, setRecentReceipt] = useState<R | null>(null);

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

  // Initial reference data
  useEffect(() => {
    list<R>('schools').then(setSchools).catch(() => {});
    list<R>('classes').then(setClasses).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    const qs = school ? `?school=${school}` : '';
    try {
      const [sumRes, defRes, headRes, structRes, concRes] = await Promise.all([
        request<R>(`fees/summary/${qs}`),
        request<R>(`fees/defaulters/${qs}`),
        request<R>(`fees/heads/${qs}`),
        request<R>(`fees/structures/${qs}`),
        request<R>(`fees/concessions/${qs}`)
      ]);
      setSummary(sumRes);
      setDefaulters(defRes.results || []);
      setHeads(headRes.results || []);
      setStructures(structRes.results || []);
      setConcessions(concRes.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load fee data');
    } finally {
      setLoading(false);
    }
  }, [school]);

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
    } catch (err) {
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
    } catch (err) {
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
          paid_on: new Date().toISOString().slice(0, 10)
        })
      });
      notify(`Fee collected! Receipt #${res.receipt_number}`);
      setRecentReceipt({ ...res, student_name: selectedStudent.name || `${selectedStudent.first_name} ${selectedStudent.last_name}` });
      setPayAmount('');
      setPayRef('');
      setBump(b => b + 1);
      // Reload ledger
      selectStudentForPay(selectedStudent);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Payment recording failed');
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
    if (!window.confirm('Are you sure you want to revoke/delete this concession?')) return;
    try {
      await request(`fees/concessions/${id}/`, { method: 'DELETE' });
      notify('Concession deleted successfully');
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

  const exportDefaultersCSV = () => {
    if (!defaulters.length) return;
    const headers = ['Student Name', 'Admission #', 'Class', 'Campus', 'Overdue Amount', 'Days Overdue', 'Oldest Due Date'];
    const rows = defaulters.map(d => [
      `"${d.student_name}"`,
      `"${d.admission_number}"`,
      `"${d.class_name}"`,
      `"${d.school_name}"`,
      d.total_overdue,
      d.days_overdue,
      d.oldest_due_date
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `fee_defaulters_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">FINANCE / STUDENT FEES</div>
          <h1>Student Fees</h1>
          <p>Institutional fee collection, heads, billing vouchers, and automated finance integration.</p>
        </div>
        <div className="fx-filters">
          {schools.length > 1 && (
            <label>Campus
              <select className="fx-select" value={school} onChange={e => setSchool(e.target.value)}>
                <option value="">All campuses</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <button className="outline-btn" onClick={() => setBump(b => b + 1)}><RefreshCw size={15} /> Refresh</button>
        </div>
      </div>

      <nav className="fx-tabs" aria-label="Fee sections">
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}><Receipt size={15} /> Overview</button>
        <button className={tab === 'collect' ? 'on' : ''} onClick={() => setTab('collect')}><UserCheck size={15} /> Collect Fee</button>
        <button className={tab === 'vouchers' ? 'on' : ''} onClick={() => setTab('vouchers')}><ShieldAlert size={15} /> Vouchers & Defaulters</button>
        <button className={tab === 'structures' ? 'on' : ''} onClick={() => setTab('structures')}><FileSpreadsheet size={15} /> Fee Structures</button>
        <button className={tab === 'concessions' ? 'on' : ''} onClick={() => setTab('concessions')}><Sparkles size={15} /> Concessions</button>
      </nav>

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {/* OVERVIEW TAB */}
      {tab === 'overview' && summary && (
        <div className="fx-body">
          <div className="fx-kpis">
            <div className="fx-kpi"><span>Total Expected</span><strong style={{ color: '#2563eb' }}>Rs {Number(summary.expected).toLocaleString()}</strong></div>
            <div className="fx-kpi"><span>Collected</span><strong style={{ color: '#16a34a' }}>Rs {Number(summary.collected).toLocaleString()}</strong></div>
            <div className="fx-kpi"><span>Outstanding</span><strong style={{ color: '#dc2626' }}>Rs {Number(summary.outstanding).toLocaleString()}</strong><small>{summary.collection_rate}% collection rate</small></div>
          </div>

          <div className="fx-grid">
            <section className="panel hr-panel fx-card">
              <div className="panel-head">
                <div><h3>Monthly Collections Trend</h3><p>Realized fee revenue by calendar month</p></div>
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
                <div><h3>Quick Actions</h3><p>Billing operations and ledger actions</p></div>
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
                <button className="outline-btn" onClick={() => setTab('vouchers')}>
                  <ShieldAlert size={16} /> View Defaulters ({defaulters.length} overdue)
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* COLLECT FEE TAB */}
      {tab === 'collect' && (
        <div className="fx-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
              <button className="primary-btn" onClick={handleStudentSearch}><Search size={16} /> Search</button>
            </div>
            {searchedStudents.length > 0 && (
              <div className="table-scroll" style={{ maxHeight: 300 }}>
                <table className="data-table">
                  <thead><tr><th>STUDENT</th><th>ADMISSION</th><th>CAMPUS</th><th>ACTION</th></tr></thead>
                  <tbody>
                    {searchedStudents.map(s => (
                      <tr key={s.id}>
                        <td><strong>{s.first_name} {s.last_name}</strong></td>
                        <td>{s.admission_number}</td>
                        <td>{s.school_name || s.school}</td>
                        <td>
                          <button className="sm-btn" onClick={() => selectStudentForPay(s)}>Select <ChevronRight size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selectedStudent && studentLedger && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                <h4>Active Ledger: {selectedStudent.first_name} {selectedStudent.last_name}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 0' }}>
                  <div className="fx-kpi" style={{ padding: '8px 12px' }}>
                    <span>Total Billed</span><strong>Rs {Number(studentLedger.summary?.total_billed || 0).toLocaleString()}</strong>
                  </div>
                  <div className="fx-kpi" style={{ padding: '8px 12px' }}>
                    <span>Outstanding Due</span><strong style={{ color: '#dc2626' }}>Rs {Number(studentLedger.summary?.outstanding_balance || 0).toLocaleString()}</strong>
                  </div>
                </div>
                <h5>Voucher Lines</h5>
                <div className="table-scroll" style={{ maxHeight: 180 }}>
                  <table className="data-table">
                    <thead><tr><th>HEAD</th><th>PERIOD</th><th>DUE</th><th>DISC</th><th>NET</th><th>STATUS</th></tr></thead>
                    <tbody>
                      {(studentLedger.fee_lines || []).map((l: R) => (
                        <tr key={l.id}>
                          <td>{l.head_name}</td>
                          <td>{l.period}</td>
                          <td>Rs {l.amount_due}</td>
                          <td>Rs {l.discount}</td>
                          <td><strong>Rs {l.net_due}</strong></td>
                          <td><span className={`pill ${l.status === 'paid' ? 'green' : l.status === 'partial' ? 'amber' : 'red'}`}>{l.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="panel hr-panel">
            <div className="panel-head">
              <div><h3>Record Fee Payment</h3><p>Auto-creates linked Income entry in Finance ledger</p></div>
            </div>
            {selectedStudent ? (
              <form onSubmit={handlePayFee} style={{ padding: '16px 20px' }}>
                <div className="modal-fields">
                  <label>Student
                    <input type="text" disabled value={`${selectedStudent.first_name} ${selectedStudent.last_name} (#${selectedStudent.admission_number})`} />
                  </label>
                  <label>Amount (Rs) *
                    <input type="number" step="0.01" min="1" required value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                  </label>
                  <label>Payment Method *
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="online">Online / Card</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </label>
                  <label>Reference / Cheque #
                    <input type="text" placeholder="e.g. Bank ref or receipt memo" value={payRef} onChange={e => setPayRef(e.target.value)} />
                  </label>
                </div>
                <div style={{ marginTop: 20 }}>
                  <button type="submit" className="primary-btn" style={{ width: '100%' }}>
                    <Receipt size={16} /> Collect Payment & Generate Receipt
                  </button>
                </div>
              </form>
            ) : (
              <div className="rp-empty">Search and select a student on the left to record a payment.</div>
            )}

            {recentReceipt && (
              <div style={{ margin: '16px 20px', padding: 16, background: 'rgba(22, 163, 74, 0.08)', borderRadius: 8, border: '1px solid rgba(22, 163, 74, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#16a34a' }}>Payment Confirmed</strong>
                  <button className="sm-btn" onClick={() => window.print()}><Printer size={13} /> Print</button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                  Receipt <b>#{recentReceipt.receipt_number}</b> issued to <b>{recentReceipt.student_name}</b> for <b>Rs {recentReceipt.amount}</b> ({recentReceipt.method}).
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* VOUCHERS & DEFAULTERS TAB */}
      {tab === 'vouchers' && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Fee Defaulters & Overdue Ledger</h3>
              <p>Students with outstanding balances past the due date</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="outline-btn" onClick={exportDefaultersCSV}><Download size={15} /> Export CSV</button>
              <button className="primary-btn" onClick={() => setVoucherModal(true)}><Receipt size={15} /> Generate Vouchers</button>
            </div>
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
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No fee defaulters found. All balances are settled!</td></tr>
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
            <button className="primary-btn" onClick={() => setConcessionModal(true)}><Plus size={15} /> Grant Concession</button>
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
    </>
  );
}
