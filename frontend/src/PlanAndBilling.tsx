import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Check, Sparkles, ShieldCheck, FileText, CheckCircle2,
  AlertTriangle, Clock, ArrowRight, RefreshCw, Lock, Printer, Building2,
  Calendar, Layers, Users, Zap, AlertCircle
} from 'lucide-react';
import { request, type User } from './api';
import { SandboxCheckoutModal, type CheckoutOrderInfo } from './SandboxCheckoutModal';
import { ReceiptModal, type ReceiptData } from './ReceiptModal';

interface PlanAndBillingProps {
  user: User;
  activeCampusId?: number | null;
  notify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onPlanChanged?: () => void;
}

interface CurrentSubscriptionData {
  school: { id: number; name: string; code: string };
  plan: { code: string; name: string; price_usd: string; price_pkr: string } | null;
  status: 'trial' | 'pending_approval' | 'active' | 'past_due' | 'limited' | 'suspended';
  active_enrolled_students: number;
  student_count_at_last_invoice?: number;
  current_period_start?: string | null;
  paid_until?: string | null;
  grace_until?: string | null;
  entitlements?: {
    plan: string;
    status: string;
    is_limited_mode: boolean;
    features: Record<string, boolean>;
  };
}

interface OrderHistoryItem {
  id: number;
  order_number: string;
  plan_name: string;
  billing_months: number;
  student_count: number;
  amount: string;
  currency: string;
  status: string;
  provider: string;
  created_at: string;
  paid_on?: string | null;
  payment_reference?: string;
}

export const PlanAndBilling: React.FC<PlanAndBillingProps> = ({ user, activeCampusId, notify, onPlanChanged }) => {
  const [currentSub, setCurrentSub] = useState<CurrentSubscriptionData | null>(null);
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Order Configuration State
  const [selectedPlan, setSelectedPlan] = useState<'standard' | 'premium'>('premium');
  const [billingMonths, setBillingMonths] = useState<1 | 3 | 6 | 12>(12);
  const [currency, setCurrency] = useState<'USD' | 'PKR'>('USD');

  // Modals
  const [activeCheckoutOrder, setActiveCheckoutOrder] = useState<CheckoutOrderInfo | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const campusQs = activeCampusId ? `?school=${activeCampusId}` : '';
      const [subData, ordersData] = await Promise.all([
        request<CurrentSubscriptionData>(`subscription/current/${campusQs}`),
        request<{ results: OrderHistoryItem[] }>(`subscription/orders/${campusQs}`).catch(() => ({ results: [] }))
      ]);
      setCurrentSub(subData);
      setOrders(ordersData?.results || []);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load subscription details.');
      if (notify) notify(err?.message || 'Failed to load subscription details.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCampusId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pricing constants (matches Plan model database values)
  const rateUSD = selectedPlan === 'standard' ? 3.60 : 7.20;
  const ratePKR = selectedPlan === 'standard' ? 1000 : 2000;
  const activeStudents = currentSub?.active_enrolled_students || 1;
  const unitPrice = currency === 'USD' ? rateUSD : ratePKR;

  const grossTotal = activeStudents * unitPrice * billingMonths;
  const discountRate = billingMonths === 12 ? 0.10 : 0.00;
  const discountAmount = grossTotal * discountRate;
  const netTotal = grossTotal - discountAmount;

  const handleStartCardPayment = async () => {
    try {
      setSubmittingOrder(true);
      const res = await request<{
        message: string;
        order: {
          id: number;
          order_number: string;
          status: string;
          amount: string;
          currency: string;
          billing_months: number;
          student_count: number;
          provider: string;
          checkout_url: string;
        };
      }>('subscription/orders/', {
        method: 'POST',
        body: JSON.stringify({
          plan_code: selectedPlan,
          billing_months: billingMonths,
          payment_method: 'card',
          currency: currency,
          ...(activeCampusId ? { school_id: activeCampusId } : {})
        })
      });

      if (res && res.order) {
        setActiveCheckoutOrder({
          id: res.order.id,
          order_number: res.order.order_number,
          plan_name: selectedPlan === 'standard' ? 'Standard Plan' : 'Premium Plan',
          plan_code: selectedPlan,
          amount: res.order.amount,
          currency: res.order.currency,
          billing_months: res.order.billing_months,
          student_count: res.order.student_count,
          school_name: currentSub?.school?.name
        });
      }
    } catch (err: any) {
      if (notify) notify(err.message || 'Failed to initiate card checkout.', 'error');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleCheckoutSuccess = async (orderNumber: string) => {
    setActiveCheckoutOrder(null);
    if (notify) notify(`Payment verified! School upgraded to ${selectedPlan === 'premium' ? 'Premium' : 'Standard'}.`, 'success');
    await loadData();
    if (onPlanChanged) onPlanChanged();

    // Fetch and show receipt
    try {
      const matchOrder = orders.find(o => o.order_number === orderNumber) || (await request<{ results: OrderHistoryItem[] }>('subscription/orders/')).results.find(o => o.order_number === orderNumber);
      if (matchOrder) {
        const receipt = await request<ReceiptData>(`subscription/orders/${matchOrder.id}/receipt/`);
        setSelectedReceipt(receipt);
      }
    } catch {}
  };

  const handleViewReceipt = async (orderId: number) => {
    try {
      const receipt = await request<ReceiptData>(`subscription/orders/${orderId}/receipt/`);
      setSelectedReceipt(receipt);
    } catch (err: any) {
      if (notify) notify('Failed to load invoice receipt.', 'error');
    }
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return 'N/A';
    try {
      return new Date(isoStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch {
      return isoStr;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 14 }}>
        <RefreshCw size={28} className="animate-spin" color="#2563eb" />
        <span style={{ color: '#64748b', fontSize: '0.95rem' }}>Loading subscription status & plans...</span>
      </div>
    );
  }

  if (loadError && !currentSub) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: '36px 32px', textAlign: 'center', backgroundColor: 'var(--card-bg, #ffffff)', borderRadius: 16, border: '1px solid #fee2e2', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
          <AlertCircle size={32} />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#991b1b', margin: '0 0 8px 0' }}>Unable to Load Subscription</h2>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 24px 0' }}>{loadError}</p>
        <button
          onClick={() => loadData()}
          style={{ padding: '10px 24px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const isLimited = currentSub?.status === 'limited';
  const isActive = currentSub?.status === 'active';
  const planCode = currentSub?.plan?.code || 'none';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 1. Header & Current Status */}
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary, #0f172a)' }}>
          Subscription & Billing
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
          Manage your school's plan, upgrade features with instant card payment, and view official invoices.
        </p>
      </div>

      {/* Current Subscription Card */}
      <div style={{
        backgroundColor: 'var(--card-bg, #ffffff)',
        borderRadius: 16,
        padding: '24px 28px',
        border: '1px solid var(--border-color, #e2e8f0)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            backgroundColor: isActive ? '#ecfdf5' : isLimited ? '#fef2f2' : '#eff6ff',
            color: isActive ? '#059669' : isLimited ? '#dc2626' : '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {isActive ? <ShieldCheck size={28} /> : isLimited ? <Lock size={28} /> : <Sparkles size={28} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                {currentSub?.plan?.name || (isLimited ? 'Free / Unpaid Account' : 'Standard Plan')}
              </h2>
              <span style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                padding: '3px 10px',
                borderRadius: 12,
                backgroundColor: isActive ? '#dcfce7' : isLimited ? '#fee2e2' : '#fef3c7',
                color: isActive ? '#15803d' : isLimited ? '#b91c1c' : '#92400e'
              }}>
                {currentSub?.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginTop: 4 }}>
              Campus: <strong>{currentSub?.school?.name}</strong> •{' '}
              <strong>{activeStudents}</strong> active enrolled students
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>
          {currentSub?.paid_until && (
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: '#94a3b8' }}>Paid Until</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginTop: 2 }}>
                {formatDate(currentSub.paid_until)}
              </div>
            </div>
          )}
          {isLimited && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              padding: '8px 14px',
              borderRadius: 8,
              color: '#991b1b',
              fontSize: 12,
              fontWeight: 600
            }}>
              ⚠️ Premium features locked. Select a package below to activate.
            </div>
          )}
        </div>
      </div>

      {/* 2. Choose Package & Pay */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text-primary, #0f172a)' }}>
              Choose a Subscription Package
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
              Pricing is based on active enrolled students. Unlimited teachers, staff, and parents are included free.
            </p>
          </div>

          {/* Period and Currency Selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Currency Toggle */}
            <div style={{
              display: 'flex',
              backgroundColor: 'var(--bg-secondary, #f1f5f9)',
              borderRadius: 8,
              padding: 3,
              border: '1px solid var(--border-color, #e2e8f0)'
            }}>
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  backgroundColor: currency === 'USD' ? '#ffffff' : 'transparent',
                  color: currency === 'USD' ? '#2563eb' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: currency === 'USD' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setCurrency('PKR')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  backgroundColor: currency === 'PKR' ? '#ffffff' : 'transparent',
                  color: currency === 'PKR' ? '#2563eb' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: currency === 'PKR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                PKR (Rs)
              </button>
            </div>

            {/* Billing Period Selector */}
            <div style={{
              display: 'flex',
              backgroundColor: 'var(--bg-secondary, #f1f5f9)',
              borderRadius: 8,
              padding: 3,
              border: '1px solid var(--border-color, #e2e8f0)'
            }}>
              {([1, 3, 6, 12] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBillingMonths(m)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor: billingMonths === m ? '#ffffff' : 'transparent',
                    color: billingMonths === m ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: billingMonths === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {m} mo{m === 12 ? ' (10% off)' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Plan Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* STANDARD PLAN */}
          <div
            onClick={() => setSelectedPlan('standard')}
            style={{
              backgroundColor: 'var(--card-bg, #ffffff)',
              borderRadius: 16,
              padding: '28px 24px',
              border: `2px solid ${selectedPlan === 'standard' ? '#2563eb' : 'var(--border-color, #e2e8f0)'}`,
              cursor: 'pointer',
              position: 'relative',
              boxShadow: selectedPlan === 'standard' ? '0 8px 24px rgba(37, 99, 235, 0.12)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                Standard Plan
              </h3>
              {selectedPlan === 'standard' && (
                <span style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                  SELECTED
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', margin: '0 0 16px 0', minHeight: 38 }}>
              Essential core school management for daily attendance, grading, fee collection, and parent communication.
            </p>

            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary, #0f172a)' }}>
                {currency === 'USD' ? '$3.60' : 'Rs 1,000'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}> / student / month</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              {[
                'Student Accounts & CSV Enrollment Import',
                'Daily Class & Subject Attendance Registers',
                'Examination Grading & Printable Result Cards',
                'Master Timetable & Teacher Schedule Allocations',
                'Fee Challans, Receipts, Defaulters & Counter Collection',
                'Notices, Homework Tasks & Communication',
                'Portals: Principal, Teacher, Student & Parent'
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={16} color="#059669" />
                  <span style={{ color: 'var(--text-secondary, #334155)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PREMIUM PLAN */}
          <div
            onClick={() => setSelectedPlan('premium')}
            style={{
              backgroundColor: 'var(--card-bg, #ffffff)',
              borderRadius: 16,
              padding: '28px 24px',
              border: `2px solid ${selectedPlan === 'premium' ? '#2563eb' : 'var(--border-color, #e2e8f0)'}`,
              cursor: 'pointer',
              position: 'relative',
              boxShadow: selectedPlan === 'premium' ? '0 8px 24px rgba(37, 99, 235, 0.16)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{
              position: 'absolute',
              top: -12,
              right: 24,
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 12px',
              borderRadius: 12,
              letterSpacing: '0.04em'
            }}>
              RECOMMENDED
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={18} color="#2563eb" />
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                  Premium Plan
                </h3>
              </div>
              {selectedPlan === 'premium' && (
                <span style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                  SELECTED
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', margin: '0 0 16px 0', minHeight: 38 }}>
              Full performance intelligence with AQI, student risk warning indicators, staff salaries, multi-campus, and accounts ledger.
            </p>

            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: '#2563eb' }}>
                {currency === 'USD' ? '$7.20' : 'Rs 2,000'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}> / student / month</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              {[
                'Everything in Standard Plan, plus:',
                'Academic Quality Index (AQI) 5-Level Hierarchy',
                'Student Early Warning Indicators & Risk Alerts',
                'Staff Salaries, Adjustments & Automated Payroll Generation',
                'Multi-Campus Dashboards & Cross-Campus Comparisons',
                'Accounts Ledger & Financial Income/Expense Dashboard',
                'Psychological Evaluation & Development Profiles',
                'Audit Log Activity Viewer & Priority Excel/PDF Exports'
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={16} color={idx === 0 ? '#2563eb' : '#059669'} />
                  <span style={{
                    color: idx === 0 ? '#2563eb' : 'var(--text-secondary, #334155)',
                    fontWeight: idx === 0 ? 700 : 400
                  }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Order Summary & Sandbox Payment Action */}
        <div style={{
          backgroundColor: '#0f172a',
          color: '#ffffff',
          borderRadius: 16,
          padding: '24px 28px',
          marginTop: 20,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 20
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
              <span>Transparent Billing Summary</span>
              <span>•</span>
              <span style={{ color: '#38bdf8' }}>{activeStudents} Enrolled Students</span>
            </div>
            <div style={{ fontSize: 14, marginTop: 6, color: '#cbd5e1' }}>
              {activeStudents} students × {currency === 'USD' ? `$${unitPrice.toFixed(2)}` : `Rs ${unitPrice}`} × {billingMonths} month{billingMonths > 1 ? 's' : ''}
              {billingMonths === 12 && <span style={{ color: '#4ade80' }}> (10% yearly discount applied)</span>}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>
              Total Payable: {currency === 'USD' ? `$${netTotal.toFixed(2)}` : `Rs ${netTotal.toLocaleString()}`} {currency}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              disabled={submittingOrder}
              onClick={handleStartCardPayment}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                backgroundColor: '#2563eb',
                color: '#ffffff',
                padding: '14px 28px',
                borderRadius: 10,
                border: 'none',
                fontSize: 15,
                fontWeight: 700,
                cursor: submittingOrder ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
              }}
            >
              {submittingOrder ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Preparing Checkout...</span>
                </>
              ) : (
                <>
                  <CreditCard size={18} />
                  <span>Pay with Card (Sandbox Test Mode)</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 4. Past Orders & Receipts */}
      <div style={{
        backgroundColor: 'var(--card-bg, #ffffff)',
        borderRadius: 16,
        padding: '24px',
        border: '1px solid var(--border-color, #e2e8f0)'
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 16px 0', color: 'var(--text-primary, #0f172a)' }}>
          Order & Invoice History
        </h3>

        {orders.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No previous payment orders recorded.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '10px 12px' }}>Order #</th>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Plan</th>
                  <th style={{ padding: '10px 12px' }}>Duration</th>
                  <th style={{ padding: '10px 12px' }}>Amount</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Provider</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border-color, #f1f5f9)' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{o.order_number}</td>
                    <td style={{ padding: '12px', color: '#64748b' }}>{formatDate(o.paid_on || o.created_at)}</td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{o.plan_name}</td>
                    <td style={{ padding: '12px' }}>{o.billing_months} mo</td>
                    <td style={{ padding: '12px', fontWeight: 700 }}>
                      {o.amount} {o.currency}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        backgroundColor: o.status === 'paid' ? '#dcfce7' : o.status === 'failed' ? '#fee2e2' : '#fef3c7',
                        color: o.status === 'paid' ? '#15803d' : o.status === 'failed' ? '#b91c1c' : '#92400e'
                      }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', color: '#64748b', textTransform: 'uppercase', fontSize: 11 }}>
                      {o.provider}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {o.status === 'paid' && (
                        <button
                          type="button"
                          onClick={() => handleViewReceipt(o.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#334155',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <FileText size={13} />
                          Receipt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Hosted Sandbox Checkout Modal */}
      {activeCheckoutOrder && (
        <SandboxCheckoutModal
          order={activeCheckoutOrder}
          onSuccess={handleCheckoutSuccess}
          onClose={() => setActiveCheckoutOrder(null)}
        />
      )}

      {/* Printable Invoice & Receipt Modal */}
      {selectedReceipt && (
        <ReceiptModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
};

export default PlanAndBilling;
