import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Building2, Calendar, AlertCircle, RefreshCw, Layers, DollarSign,
  CheckCircle2, Clock, X, ArrowRight, ShieldCheck, Receipt, BarChart3,
  PieChart, Users, AlertTriangle
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
  const [selectedDetailCard, setSelectedDetailCard] = useState<'income' | 'collected' | 'remaining' | 'expense' | 'net' | null>(null);

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
  const totalCollected = data?.total_collected !== undefined ? data.total_collected : (data?.student_projection?.collected ?? totalIncome);
  const remainingToCollect = data?.remaining_to_collect !== undefined ? data.remaining_to_collect : Math.max(0, totalIncome - totalCollected);
  const totalExpense = data?.total_expense || 0;
  const netBalance = data?.net !== undefined ? data.net : (totalCollected - totalExpense);
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        padding: '16px 20px',
        borderBottom: '1px solid #f1f5f9'
      }}>
        {/* Total Income */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedDetailCard('income')}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedDetailCard('income')}
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            padding: '12px 16px',
            cursor: 'pointer',
            transition: 'all 0.18s ease-in-out',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            userSelect: 'none'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 14px rgba(37,99,235,0.14)';
            e.currentTarget.style.borderColor = '#60a5fa';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            e.currentTarget.style.borderColor = '#bfdbfe';
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><TrendingUp size={14} /> Total Income</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(37,99,235,0.08)', padding: '2px 6px', borderRadius: 6 }}>
              Details <ArrowUpRight size={11} />
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8', marginTop: 4 }}>
            +{currency} {Number(totalIncome).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#1e40af', marginTop: 2 }}>
            Total income across all branches
          </div>
        </div>

        {/* Total Collected */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedDetailCard('collected')}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedDetailCard('collected')}
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 10,
            padding: '12px 16px',
            cursor: 'pointer',
            transition: 'all 0.18s ease-in-out',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            userSelect: 'none'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 14px rgba(22,163,74,0.14)';
            e.currentTarget.style.borderColor = '#86efac';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            e.currentTarget.style.borderColor = '#bbf7d0';
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} /> Total Collected</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(22,163,74,0.08)', padding: '2px 6px', borderRadius: 6 }}>
              Details <ArrowUpRight size={11} />
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d', marginTop: 4 }}>
            +{currency} {Number(totalCollected).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>
            Total paid &amp; collected revenue
          </div>
        </div>

        {/* Left to Collect */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedDetailCard('remaining')}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedDetailCard('remaining')}
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 10,
            padding: '12px 16px',
            cursor: 'pointer',
            transition: 'all 0.18s ease-in-out',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            userSelect: 'none'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 14px rgba(217,119,6,0.14)';
            e.currentTarget.style.borderColor = '#fcd34d';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            e.currentTarget.style.borderColor = '#fde68a';
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={14} /> Left to Collect</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#d97706', display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(217,119,6,0.08)', padding: '2px 6px', borderRadius: 6 }}>
              Details <ArrowUpRight size={11} />
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#b45309', marginTop: 4 }}>
            {currency} {Number(remainingToCollect).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
            Remaining balance to collect
          </div>
        </div>

        {/* Total Expenses */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedDetailCard('expense')}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedDetailCard('expense')}
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 10,
            padding: '12px 16px',
            cursor: 'pointer',
            transition: 'all 0.18s ease-in-out',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            userSelect: 'none'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 14px rgba(220,38,38,0.14)';
            e.currentTarget.style.borderColor = '#fca5a5';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            e.currentTarget.style.borderColor = '#fecaca';
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ArrowDownRight size={14} /> Total Expenses</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(220,38,38,0.08)', padding: '2px 6px', borderRadius: 6 }}>
              Details <ArrowUpRight size={11} />
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#b91c1c', marginTop: 4 }}>
            -{currency} {Number(totalExpense).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#991b1b', marginTop: 2 }}>
            Operational disbursements &amp; costs
          </div>
        </div>

        {/* Net Operating Balance */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedDetailCard('net')}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedDetailCard('net')}
          style={{
            background: isSurplus ? '#f8fafc' : '#fff7ed',
            border: `1px solid ${isSurplus ? '#cbd5e1' : '#ffedd5'}`,
            borderRadius: 10,
            padding: '12px 16px',
            cursor: 'pointer',
            transition: 'all 0.18s ease-in-out',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            userSelect: 'none'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = isSurplus ? '0 6px 14px rgba(14,165,233,0.16)' : '0 6px 14px rgba(234,88,12,0.16)';
            e.currentTarget.style.borderColor = isSurplus ? '#94a3b8' : '#fdba74';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            e.currentTarget.style.borderColor = isSurplus ? '#cbd5e1' : '#ffedd5';
          }}
        >
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: isSurplus ? '#0f172a' : '#9a3412',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>Net Balance</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: isSurplus ? '#0ea5e9' : '#ea580c',
                color: '#ffffff'
              }}>
                {isSurplus ? 'Surplus' : 'Deficit'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: isSurplus ? '#0284c7' : '#c2410c', display: 'flex', alignItems: 'center', gap: 1 }}>
                <ArrowUpRight size={11} />
              </span>
            </div>
          </div>
          <div style={{
            fontSize: 20, fontWeight: 800,
            color: isSurplus ? '#0f172a' : '#c2410c',
            marginTop: 4
          }}>
            {isSurplus ? '+' : '-'}{currency} {Math.abs(Number(netBalance)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: isSurplus ? '#475569' : '#9a3412', marginTop: 2 }}>
            Operating balance (Collected - Expenses)
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

      {/* Interactive Detail Modal for Clicked KPI Card */}
      {selectedDetailCard && (
        <FinanceDetailModal
          cardType={selectedDetailCard}
          currency={currency}
          data={data}
          campuses={campuses}
          onClose={() => setSelectedDetailCard(null)}
          onNavigate={onNavigate}
          notify={notify}
        />
      )}
    </section>
  );
}

function FinanceDetailModal({
  cardType,
  currency,
  data,
  campuses,
  onClose,
  onNavigate,
  notify,
}: {
  cardType: 'income' | 'collected' | 'remaining' | 'expense' | 'net';
  currency: string;
  data: Record<string, any> | null;
  campuses: Resource[];
  onClose: () => void;
  onNavigate?: (page: string) => void;
  notify: (msg: string) => void;
}) {
  const totalIncome = data?.total_income || 0;
  const totalCollected = data?.total_collected !== undefined ? data.total_collected : (data?.student_projection?.collected ?? totalIncome);
  const remainingToCollect = data?.remaining_to_collect !== undefined ? data.remaining_to_collect : Math.max(0, totalIncome - totalCollected);
  const totalExpense = data?.total_expense || 0;
  const netBalance = data?.net !== undefined ? data.net : (totalCollected - totalExpense);
  const isSurplus = netBalance >= 0;

  const incomeCategories: Array<{ name: string; amount: number; share: number }> = data?.income_by_category || [];
  const expenseCategories: Array<{ name: string; amount: number; share: number }> = data?.expense_by_category || [];
  const incomeByCampus: Array<any> = data?.income_by_campus || [];
  const expenseByCampus: Array<any> = data?.expense_by_campus || [];
  const monthly: Array<any> = data?.monthly || [];
  const projection = data?.student_projection || {};

  const realizationRate = totalIncome > 0 ? ((totalCollected / totalIncome) * 100).toFixed(1) : '100.0';
  const remainingRate = totalIncome > 0 ? ((remainingToCollect / totalIncome) * 100).toFixed(1) : '0.0';
  const costRatio = totalCollected > 0 ? ((totalExpense / totalCollected) * 100).toFixed(1) : '0.0';
  const operatingMargin = totalCollected > 0 ? (((totalCollected - totalExpense) / totalCollected) * 100).toFixed(1) : '0.0';

  const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const config = {
    income: {
      accent: '#2563eb',
      bgLight: '#eff6ff',
      border: '#bfdbfe',
      tag: 'REVENUE & BILLING AUDIT',
      title: 'Total Income Breakdown',
      subtitle: 'Consolidated view of all billed tuition, admissions, and institutional income across campuses.',
      icon: TrendingUp,
      mainAmount: `+${currency} ${fmt(totalIncome)}`,
      statusBadge: '100% Gross Billed',
      badgeColor: '#1d4ed8',
      badgeBg: '#dbeafe',
    },
    collected: {
      accent: '#16a34a',
      bgLight: '#f0fdf4',
      border: '#bbf7d0',
      tag: 'REALIZED CASH INFLOW',
      title: 'Total Collected Revenue',
      subtitle: 'Liquid funds collected and deposited into campus accounts from verified student fee payments.',
      icon: CheckCircle2,
      mainAmount: `+${currency} ${fmt(totalCollected)}`,
      statusBadge: `${realizationRate}% Collection Realization`,
      badgeColor: '#15803d',
      badgeBg: '#dcfce7',
    },
    remaining: {
      accent: '#d97706',
      bgLight: '#fffbeb',
      border: '#fde68a',
      tag: 'RECEIVABLES & DEFAULTERS AUDIT',
      title: 'Left to Collect / Outstanding Balance',
      subtitle: 'Detailed audit of unpaid tuition, overdue student balances, and pending payment verifications.',
      icon: Clock,
      mainAmount: `${currency} ${fmt(remainingToCollect)}`,
      statusBadge: `${remainingRate}% Outstanding Shortfall`,
      badgeColor: '#b45309',
      badgeBg: '#fef3c7',
    },
    expense: {
      accent: '#dc2626',
      bgLight: '#fef2f2',
      border: '#fecaca',
      tag: 'OPERATIONAL DISBURSEMENTS',
      title: 'Total Expenses Breakdown',
      subtitle: 'Operating expenditures including educator payroll, facilities maintenance, utilities, and branch overhead.',
      icon: ArrowDownRight,
      mainAmount: `-${currency} ${fmt(totalExpense)}`,
      statusBadge: `${costRatio}% Cost-to-Revenue Ratio`,
      badgeColor: '#b91c1c',
      badgeBg: '#fee2e2',
    },
    net: {
      accent: isSurplus ? '#0ea5e9' : '#ea580c',
      bgLight: isSurplus ? '#f0f9ff' : '#fff7ed',
      border: isSurplus ? '#bae6fd' : '#fed7aa',
      tag: isSurplus ? 'CONSOLIDATED OPERATING SURPLUS' : 'OPERATIONAL CASH DEFICIT',
      title: 'Net Operating Balance & Financial Health',
      subtitle: 'Consolidated net operating liquidity calculated as Total Collected Revenue minus Total Operational Disbursements.',
      icon: isSurplus ? TrendingUp : AlertTriangle,
      mainAmount: `${isSurplus ? '+' : '-'}${currency} ${fmt(Math.abs(netBalance))}`,
      statusBadge: isSurplus ? `${operatingMargin}% Net Operating Surplus` : 'Operating Deficit Risk',
      badgeColor: isSurplus ? '#0369a1' : '#c2410c',
      badgeBg: isSurplus ? '#e0f2fe' : '#ffedd5',
    },
  }[cardType];

  const IconComponent = config.icon;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        zIndex: 1250,
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 680,
          width: '95vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px 24px 28px',
          borderRadius: 20,
          background: '#ffffff',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: config.accent, textTransform: 'uppercase', letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconComponent size={13} /> {config.tag}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 2px 0', color: '#0f172a' }}>{config.title}</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{config.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748b',
              transition: 'all 0.15s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Primary Highlight Card */}
        <div
          style={{
            background: config.bgLight,
            border: `1px solid ${config.border}`,
            borderRadius: 14,
            padding: '18px 20px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
              {config.title}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: config.accent, marginTop: 4 }}>
              {config.mainAmount}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
              Currency Ledger: <strong>{currency}</strong> • Scope: All Governed Branches
            </div>
          </div>
          <span
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              background: config.badgeBg,
              color: config.badgeColor,
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {config.statusBadge}
          </span>
        </div>

        {/* 4-KPI Quick Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 10,
            marginBottom: 22,
          }}
        >
          {cardType === 'income' && (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Realized Cash</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#15803d', marginTop: 2 }}>+{currency} {fmt(totalCollected)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Receivables Left</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#b45309', marginTop: 2 }}>{currency} {fmt(remainingToCollect)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Active Students</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{projection.total_students ?? 0} enrolled</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Avg / Student</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{currency} {fmt(projection.avg_per_student ?? 0)}</div>
              </div>
            </>
          )}

          {cardType === 'collected' && (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Realization Rate</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#15803d', marginTop: 2 }}>{realizationRate}%</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Pending Approvals</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#d97706', marginTop: 2 }}>{currency} {fmt(projection.pending_approval ?? 0)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Verified Entries</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{data?.entries ?? 0} receipts</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Net Position</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isSurplus ? '#0284c7' : '#ea580c', marginTop: 2 }}>{isSurplus ? '+' : '-'}{currency} {fmt(Math.abs(netBalance))}</div>
              </div>
            </>
          )}

          {cardType === 'remaining' && (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Uncollected Rate</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#b45309', marginTop: 2 }}>{remainingRate}%</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Pending Approvals</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#d97706', marginTop: 2 }}>{currency} {fmt(projection.pending_approval ?? 0)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Total Billed Base</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{currency} {fmt(totalIncome)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Action Required</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginTop: 2 }}>Recovery Follow-up</div>
              </div>
            </>
          )}

          {cardType === 'expense' && (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Expense-to-Income</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c', marginTop: 2 }}>{costRatio}%</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Top Expense Driver</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginTop: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{expenseCategories[0]?.name || 'Salaries'}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Active Campuses</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{expenseByCampus.length || campuses.length} branches</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Fiscal Stability</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: isSurplus ? '#16a34a' : '#ea580c', marginTop: 2 }}>{isSurplus ? 'Sustainable' : 'High Overhead'}</div>
              </div>
            </>
          )}

          {cardType === 'net' && (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Operating Margin</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isSurplus ? '#0284c7' : '#ea580c', marginTop: 2 }}>{operatingMargin}%</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Gross Inflow</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#15803d', marginTop: 2 }}>+{currency} {fmt(totalCollected)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Gross Disbursements</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c', marginTop: 2 }}>-{currency} {fmt(totalExpense)}</div>
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Fiscal Assessment</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: isSurplus ? '#15803d' : '#ea580c', marginTop: 2 }}>{isSurplus ? 'Operating Surplus' : 'Operating Deficit'}</div>
              </div>
            </>
          )}
        </div>

        {/* Section 1: Detailed Distribution / Categories */}
        {(cardType === 'income' || cardType === 'collected') && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Income Distribution by Category
            </h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              {incomeCategories.length > 0 ? (
                incomeCategories.map((c, i) => (
                  <div key={c.name} style={{ padding: '10px 14px', borderBottom: i < incomeCategories.length - 1 ? '1px solid #f1f5f9' : 'none', background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>{currency} {fmt(c.amount)} ({c.share}%)</span>
                    </div>
                    <div style={{ height: 6, width: '100%', background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, c.share))}%`, background: '#2563eb', borderRadius: 3 }} />
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 14, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                  No categorical income entries logged yet. Primary revenue derives from student fee billing.
                </div>
              )}
            </div>
          </div>
        )}

        {cardType === 'remaining' && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Receivables Breakdown &amp; Outstanding Balances
            </h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#475569' }}>Total Gross Billed Fees</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{currency} {fmt(totalIncome)}</span>
              </div>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', background: '#f8fafc' }}>
                <span style={{ fontSize: 13, color: '#166534' }}>Verified Collected Revenue</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>-{currency} {fmt(totalCollected)}</span>
              </div>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#d97706' }}>Pending Approvals (In-Review)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>{currency} {fmt(projection.pending_approval ?? 0)}</span>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', background: '#fffbeb' }}>
                <strong style={{ fontSize: 13, color: '#b45309' }}>Net Uncollected Balance Owed</strong>
                <strong style={{ fontSize: 14, color: '#b45309' }}>{currency} {fmt(remainingToCollect)}</strong>
              </div>
            </div>
          </div>
        )}

        {cardType === 'expense' && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Disbursement by Operating Category
            </h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              {expenseCategories.length > 0 ? (
                expenseCategories.map((c, i) => (
                  <div key={c.name} style={{ padding: '10px 14px', borderBottom: i < expenseCategories.length - 1 ? '1px solid #f1f5f9' : 'none', background: i % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>{currency} {fmt(c.amount)} ({c.share}%)</span>
                    </div>
                    <div style={{ height: 6, width: '100%', background: '#fee2e2', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, c.share))}%`, background: '#dc2626', borderRadius: 3 }} />
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 14, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                  No operational disbursements recorded for this period.
                </div>
              )}
            </div>
          </div>
        )}

        {cardType === 'net' && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Operating Cash-Flow Statement Waterfall
            </h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', background: '#f0fdf4' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>(+) Total Realized Revenue</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>+{currency} {fmt(totalCollected)}</span>
              </div>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', background: '#fef2f2' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#991b1b' }}>(-) Total Operational Disbursements</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>-{currency} {fmt(totalExpense)}</span>
              </div>
              <div style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', background: isSurplus ? '#f0f9ff' : '#fff7ed' }}>
                <strong style={{ fontSize: 14, color: isSurplus ? '#0369a1' : '#c2410c' }}>(=) Net Operating Position ({isSurplus ? 'Surplus' : 'Deficit'})</strong>
                <strong style={{ fontSize: 15, color: isSurplus ? '#0284c7' : '#ea580c' }}>{isSurplus ? '+' : '-'}{currency} {fmt(Math.abs(netBalance))}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Section 2: Campus Breakdown Table */}
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Campus Breakdown ({incomeByCampus.length || campuses.length} Branches)
          </h4>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ fontSize: 11 }}>#</th>
                  <th style={{ fontSize: 11 }}>CAMPUS</th>
                  <th style={{ fontSize: 11, textAlign: 'right' }}>
                    {cardType === 'expense' ? 'EXPENSE' : cardType === 'net' ? 'NET SURPLUS' : 'INCOME'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(cardType === 'expense' ? expenseByCampus : incomeByCampus).map((c: any, idx: number) => {
                  const val = cardType === 'expense' ? c.expense : cardType === 'net' ? c.net : c.income;
                  return (
                    <tr key={c.id || idx}>
                      <td style={{ width: 30, fontSize: 11, color: '#64748b' }}>{idx + 1}</td>
                      <td><strong>{c.campus_name || c.name}</strong></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: cardType === 'expense' ? '#dc2626' : (c.net < 0 && cardType === 'net' ? '#ea580c' : '#15803d') }}>
                        {c.currency || currency} {fmt(val || 0)}
                      </td>
                    </tr>
                  );
                })}
                {!(cardType === 'expense' ? expenseByCampus : incomeByCampus).length && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: 14, color: '#64748b', fontSize: 12 }}>
                      No campus breakdown data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Monthly Trajectory Timeline */}
        {monthly.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Monthly Trajectory
            </h4>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ fontSize: 11 }}>MONTH</th>
                    <th style={{ fontSize: 11, textAlign: 'right' }}>INFLOW</th>
                    <th style={{ fontSize: 11, textAlign: 'right' }}>OUTFLOW</th>
                    <th style={{ fontSize: 11, textAlign: 'right' }}>NET</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m: any) => (
                    <tr key={m.month}>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{m.month}</td>
                      <td style={{ fontSize: 12, textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>+{currency} {fmt(m.income || 0)}</td>
                      <td style={{ fontSize: 12, textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{currency} {fmt(m.expense || 0)}</td>
                      <td style={{ fontSize: 12, textAlign: 'right', fontWeight: 700, color: m.net >= 0 ? '#0284c7' : '#ea580c' }}>
                        {m.net >= 0 ? '+' : ''}{currency} {fmt(m.net || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal Footer Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
          {(cardType === 'income' || cardType === 'collected') && onNavigate && (
            <button
              type="button"
              className="primary-btn"
              style={{ fontSize: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => { onNavigate('Fees'); onClose(); }}
            >
              <Receipt size={14} /> Open Fee Management <ArrowRight size={13} />
            </button>
          )}

          {cardType === 'remaining' && onNavigate && (
            <button
              type="button"
              className="primary-btn"
              style={{ fontSize: 12, padding: '8px 16px', background: '#d97706', borderColor: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => { onNavigate('Fees'); onClose(); }}
            >
              <Receipt size={14} /> Review Defaulters &amp; Collect <ArrowRight size={13} />
            </button>
          )}

          {cardType === 'remaining' && (
            <button
              type="button"
              className="outline-btn"
              style={{ fontSize: 12, padding: '8px 16px' }}
              onClick={() => { notify('Payment reminders sent to parents for overdue balances'); onClose(); }}
            >
              Send Parent Reminders
            </button>
          )}

          {cardType === 'expense' && onNavigate && (
            <button
              type="button"
              className="primary-btn"
              style={{ fontSize: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => { onNavigate('Finance'); onClose(); }}
            >
              <Wallet size={14} /> Open Expense Ledger <ArrowRight size={13} />
            </button>
          )}

          {cardType === 'net' && onNavigate && (
            <button
              type="button"
              className="primary-btn"
              style={{ fontSize: 12, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => { onNavigate('Finance'); onClose(); }}
            >
              <BarChart3 size={14} /> Full Financial Audit <ArrowRight size={13} />
            </button>
          )}

          <button
            type="button"
            className="outline-btn"
            style={{ fontSize: 12, padding: '8px 16px' }}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
