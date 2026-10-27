import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Banknote, Calendar, Check,
  CheckCircle2, ChevronRight, Download, FileSpreadsheet, FileText, Plus,
  Printer, RefreshCw, Search, ShieldCheck, Sparkles, User, Users, X
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { list, request, type User as ApiUser } from './api';
import ExportMenu from './ExportMenu';
import { FilterBar } from './FilterBar';
import './hr.css';

type R = Record<string, any>;
type Tab = 'overview' | 'sheet' | 'structures' | 'adjustments' | 'my_payslips';

export default function Salaries({ user, notify }: { user: ApiUser; notify: (m: string) => void }) {
  const isTeacher = user.role === 'teacher';
  const [tab, setTab] = useState<Tab>(isTeacher ? 'my_payslips' : 'sheet');
  const [schools, setSchools] = useState<R[]>([]);
  const [school, setSchool] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [staffList, setStaffList] = useState<R[]>([]);
  const [records, setRecords] = useState<R[]>([]);
  const [sheetFilters, setSheetFilters] = useState<Record<string, any>>({});
  const [structures, setStructures] = useState<R[]>([]);
  const [adjustments, setAdjustments] = useState<R[]>([]);
  const [myPayslips, setMyPayslips] = useState<R[]>([]);
  const [summary, setSummary] = useState<R | null>(null);
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
        const [sheetRes, sumRes, structRes, adjRes] = await Promise.all([
          request<R>(`salaries/sheet/${sheetQs()}`),
          request<R>(`salaries/summary/${qs}`),
          request<R>(`salaries/structures/${school ? `?school=${school}` : ''}`),
          request<R>(`salaries/adjustments/${qs}`)
        ]);
        setRecords(sheetRes.results || []);
        setSummary(sumRes);
        setStructures(structRes.results || []);
        setAdjustments(adjRes.results || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load salary data');
    } finally {
      setLoading(false);
    }
  }, [month, school, isTeacher, sheetQs]);

  useEffect(() => { loadData(); }, [loadData, bump]);

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
        </div>
        <div className="fx-filters">
          {!isTeacher && (
            <>
              <label>Month
                <input type="month" className="fx-select" value={month} onChange={e => setMonth(e.target.value)} />
              </label>
              {schools.length > 1 && (
                <label>Campus
                  <select className="fx-select" value={school} onChange={e => setSchool(e.target.value)}>
                    <option value="">All campuses</option>
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

      {error && <div className="error-bar"><AlertCircle size={17} /> {error}</div>}

      {/* MONTHLY SALARY SHEET */}
      {tab === 'sheet' && !isTeacher && (
        <section className="panel hr-panel">
          <div className="panel-head">
            <div>
              <h3>Payroll Sheet for {month}</h3>
              <p>Review draft salaries, prorations, bulk-approve, and mark paid</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ExportMenu
                title={`Payroll Sheet (${month})`}
                filename={`payroll-sheet-${month}`}
                endpoint={`salaries/sheet/${sheetQs()}`}
                notify={notify}
              />
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
          <div style={{ padding: '0 20px 14px 20px' }}>
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
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setGenerateModal(false); }}>
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
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPayModal(false); }}>
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
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setVoidModal(false); }}>
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
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPayslipModal(false); }}>
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
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setStructModal(false); }}>
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
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setAdjModal(false); }}>
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
