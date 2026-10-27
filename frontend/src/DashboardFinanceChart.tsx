import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Building2, Calendar, AlertCircle, RefreshCw, Layers, DollarSign
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from 'recharts';
import { request, type User, type Resource } from './api';
import ExportMenu from './ExportMenu';

interface DashboardFinanceChartProps {
  user: User;
  notify: (m: string) => void;
  campuses: Resource[];
  onNavigate?: (page: string) => void;
}

export default function DashboardFinanceChart({ user, notify, campuses, onNavigate }: DashboardFinanceChartProps) {
  const [period, setPeriod] = useState<string>('academic_year');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bump, setBump] = useState(0);

  const isOrgAdmin = user.role === 'organisation_admin' || user.is_superuser;

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (period !== 'custom') {
      params.set('period', period);
    } else {
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
    }
    if (selectedCampus) {
      params.set('school', selectedCampus);
    }
    if (selectedCurrency) {
      params.set('currency', selectedCurrency);
    }
    return params.toString() ? `?${params.toString()}` : '';
  }, [period, startDate, endDate, selectedCampus, selectedCurrency]);

  const loadFinanceSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request<Record<string, any>>(`finance/summary/${queryParams}`);
      setData(res);
      if (!selectedCurrency && res.currency) {
        setSelectedCurrency(res.currency);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load finance summary');
    } finally {
      setLoading(false);
    }
  }, [queryParams, selectedCurrency]);

  useEffect(() => {
    loadFinanceSummary();
  }, [loadFinanceSummary, bump]);

  const currency = data?.active_currency || data?.currency || 'PKR';
  const totalIncome = data?.total_income || 0;
  const totalExpense = data?.total_expense || 0;
  const netBalance = data?.net || 0;
  const isSurplus = netBalance >= 0;

  const chartData = useMemo(() => {
    return (data?.monthly || []).map((m: any) => ({
      name: m.month,
      Income: m.income || 0,
      Expense: m.expense || 0,
      Net: m.net || 0
    }));
  }, [data?.monthly]);

  const incomeByCampus = data?.income_by_campus || [];
  const expenseByCampus = data?.expense_by_campus || [];

  return (
    <section className="panel chart-panel" style={{ gridColumn: '1 / -1', marginBottom: 20 }}>
      {/* Panel Header */}
      <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Operating Income vs Expense</h3>
            <span className="live-tag" style={{ margin: 0 }}>
              <span /> {currency} Ledger
            </span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
            Cash-flow comparison with multi-currency isolation and descending campus rankings
          </p>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Campus Selector (Org Admin Only) */}
          {isOrgAdmin && campuses.length > 1 && (
            <select
              className="fx-select"
              value={selectedCampus}
              onChange={e => setSelectedCampus(e.target.value)}
              style={{ fontSize: 12, height: 34, minWidth: 150 }}
            >
              <option value="">All Campuses</option>
              {campuses.map(c => <option key={c.id} value={c.id}>{String(c.name || `Campus #${c.id}`)}</option>)}
            </select>
          )}

          {/* Period Presets */}
          <select
            className="fx-select"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            style={{ fontSize: 12, height: 34, minWidth: 140 }}
          >
            <option value="academic_year">Academic Year</option>
            <option value="this_month">This Month</option>
            <option value="last_3_months">Last 3 Months</option>
            <option value="this_year">This Calendar Year</option>
            <option value="custom">Custom Date Range</option>
          </select>

          {/* Custom Date Pickers */}
          {period === 'custom' && (
            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="date"
                className="fx-select"
                style={{ fontSize: 11, height: 34, width: 125 }}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
              <span style={{ fontSize: 11, color: '#64748b' }}>to</span>
              <input
                type="date"
                className="fx-select"
                style={{ fontSize: 11, height: 34, width: 125 }}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          )}

          {/* Export Menu */}
          <ExportMenu
            title="Dashboard Income vs Expense Report"
            filename="dashboard-income-vs-expense"
            endpoint={`finance/summary/${queryParams}`}
            notify={notify}
          />

          <button
            className="outline-btn"
            style={{ height: 34, padding: '0 10px', fontSize: 12 }}
            onClick={() => setBump(b => b + 1)}
            title="Refresh financial data"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Multi-Currency Isolation Tabs (When multiple currencies exist) */}
      {data?.multi_currency && (
        <div style={{
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
            <Layers size={14} color="#6366f1" />
            <span><strong>Multi-Currency Environment:</strong> Campuses operate in different currencies. Select active ledger:</span>
          </div>

          <div style={{ display: 'inline-flex', gap: 6 }}>
            {(data.currencies_present || []).map((curr: string) => (
              <button
                key={curr}
                type="button"
                className={`sm-btn ${selectedCurrency === curr ? 'primary-btn' : ''}`}
                style={{
                  height: 28,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '0 12px',
                  background: selectedCurrency === curr ? '#4f46e5' : '#ffffff',
                  color: selectedCurrency === curr ? '#ffffff' : '#334155',
                  border: `1px solid ${selectedCurrency === curr ? '#4338ca' : '#cbd5e1'}`
                }}
                onClick={() => setSelectedCurrency(curr)}
              >
                {curr} Ledger
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 20px', color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* KPI Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        padding: '16px 20px',
        borderBottom: '1px solid #f1f5f9'
      }}>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowUpRight size={14} /> Total Income
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d', marginTop: 4 }}>
            +{currency} {Number(totalIncome).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>
            Across {data?.entries || 0} recorded transactions
          </div>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowDownRight size={14} /> Total Expenses
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c', marginTop: 4 }}>
            -{currency} {Number(totalExpense).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#991b1b', marginTop: 2 }}>
            Operational disbursements & costs
          </div>
        </div>

        <div style={{
          background: isSurplus ? '#eff6ff' : '#fff7ed',
          border: `1px solid ${isSurplus ? '#bfdbfe' : '#ffedd5'}`,
          borderRadius: 10,
          padding: '12px 16px'
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: isSurplus ? '#1e40af' : '#9a3412',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>Net Operating Balance</span>
            <span style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: isSurplus ? '#2563eb' : '#ea580c',
              color: '#ffffff'
            }}>
              {isSurplus ? 'Operating Surplus' : 'Operating Deficit'}
            </span>
          </div>
          <div style={{
            fontSize: 20, fontWeight: 800,
            color: isSurplus ? '#1d4ed8' : '#c2410c',
            marginTop: 4
          }}>
            {isSurplus ? '+' : '-'}{currency} {Math.abs(Number(netBalance)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: isSurplus ? '#1e40af' : '#9a3412', marginTop: 2 }}>
            Net cash generation after all heads
          </div>
        </div>
      </div>

      {/* Grouped Bar Chart */}
      <div style={{ padding: '16px 20px 8px 10px', height: 260 }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={val => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                formatter={(val: any, name: any) => [`${currency} ${Number(val).toLocaleString()}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
              <Bar dataKey="Income" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
            No financial transactions recorded for this period.
          </div>
        )}
      </div>

      {/* Descending Comparison Lists (Campuses ranked by highest Income & Expense) */}
      {isOrgAdmin && campuses.length > 1 && (
        <div style={{
          padding: '16px 20px 20px',
          borderTop: '1px solid #f1f5f9',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18
        }}>
          {/* Top Income Campuses (Descending) */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: 12, fontWeight: 700, color: '#166534', display: 'flex', justifyContent: 'space-between' }}>
              <span>Top Campuses by Income (Highest First)</span>
              <span>Total: {incomeByCampus.length}</span>
            </div>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ fontSize: 11 }}>#</th>
                  <th style={{ fontSize: 11 }}>CAMPUS</th>
                  <th style={{ fontSize: 11, textAlign: 'right' }}>INCOME</th>
                </tr>
              </thead>
              <tbody>
                {incomeByCampus.map((c: any, idx: number) => (
                  <tr key={c.id}>
                    <td style={{ width: 28, fontSize: 11, color: '#64748b' }}>{idx + 1}</td>
                    <td><strong>{c.campus_name || c.name}</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#15803d' }}>
                      {c.currency} {Number(c.income).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!incomeByCampus.length && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 12 }}>No campus records</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Top Expense Campuses (Descending) */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 12, fontWeight: 700, color: '#991b1b', display: 'flex', justifyContent: 'space-between' }}>
              <span>Top Campuses by Expense (Highest First)</span>
              <span>Total: {expenseByCampus.length}</span>
            </div>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={{ fontSize: 11 }}>#</th>
                  <th style={{ fontSize: 11 }}>CAMPUS</th>
                  <th style={{ fontSize: 11, textAlign: 'right' }}>EXPENSE</th>
                </tr>
              </thead>
              <tbody>
                {expenseByCampus.map((c: any, idx: number) => (
                  <tr key={c.id}>
                    <td style={{ width: 28, fontSize: 11, color: '#64748b' }}>{idx + 1}</td>
                    <td><strong>{c.campus_name || c.name}</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>
                      {c.currency} {Number(c.expense).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!expenseByCampus.length && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16, color: '#64748b', fontSize: 12 }}>No campus records</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
