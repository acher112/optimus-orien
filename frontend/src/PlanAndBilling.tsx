import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Check, Sparkles, FileText,
  ArrowRight, RefreshCw, Lock,
  Users, Zap, BookOpen, Crown,
  RotateCcw, Clock, AlertTriangle, Building2, X
} from 'lucide-react';
import { request, type User } from './api';
import { UpgradeCheckoutModal } from './UpgradeCheckoutModal';
import { ReceiptModal, type ReceiptData } from './ReceiptModal';

interface PlanAndBillingProps {
  user: User;
  activeCampusId?: number | null;
  notify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onPlanChanged?: () => void;
}

interface CurrentSubscriptionData {
  school_id: number | null;
  school_name: string;
  plan: {
    code: string;
    name: string;
    name_ur?: string;
    tagline?: string;
    price_usd_per_student: string;
    price_pkr_per_student: string;
  } | null;
  effective_tier: string;
  status: 'no_plan' | 'active' | 'past_due' | 'limited' | 'suspended';
  is_no_plan: boolean;
  is_limited: boolean;
  is_suspended: boolean;
  is_write_allowed: boolean;
  active_students: number;
  student_count_at_last_invoice?: number;
  has_student_growth?: boolean;
  current_period_start?: string | null;
  paid_until?: string | null;
  grace_until?: string | null;
  grace_days_remaining?: number | null;
  pending_downgrade_to_plan?: string | null;
}

interface OrderHistoryItem {
  id: number;
  order_number: string;
  plan_code?: string;
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
  is_within_48h?: boolean;
  can_request_refund?: boolean;
  refund_request?: {
    id: number;
    status: 'pending' | 'approved' | 'rejected';
    reason: string;
    intended_change: string;
    bank_name: string;
    account_title: string;
    account_number: string;
    admin_notes: string;
    refund_transaction_reference?: string;
    created_at: string;
  } | null;
}

export const PlanAndBilling: React.FC<PlanAndBillingProps> = ({
  user,
  activeCampusId,
  notify,
  onPlanChanged
}) => {
  const [currentSub, setCurrentSub] = useState<CurrentSubscriptionData | null>(null);
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'USD' | 'PKR'>('USD');

  // Upgrade Checkout Modal State
  const [upgradeModal, setUpgradeModal] = useState<{
    isOpen: boolean;
    planCode: 'standard' | 'premium';
    students?: number;
  }>({
    isOpen: false,
    planCode: 'standard'
  });

  // Printable Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);

  // 2-Day Refund / Plan Change Modal State
  const [refundModalOrder, setRefundModalOrder] = useState<OrderHistoryItem | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundIntendedChange, setRefundIntendedChange] = useState('');
  const [refundBankName, setRefundBankName] = useState('');
  const [refundAccountTitle, setRefundAccountTitle] = useState('');
  const [refundAccountNumber, setRefundAccountNumber] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const campusQs = activeCampusId ? `?school=${activeCampusId}` : '';
      const [subData, ordersData] = await Promise.all([
        request<CurrentSubscriptionData>(`subscription/current/${campusQs}`).catch(() => null),
        request<{ results: OrderHistoryItem[] }>(`subscription/orders/${campusQs}`).catch(() => ({ results: [] }))
      ]);

      if (subData) {
        setCurrentSub(subData);
      }
      setOrders(ordersData?.results || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load subscription details.';
      setLoadError(msg);
      if (notify) notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeCampusId, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenUpgrade = (planCode: 'standard' | 'premium', customCount?: number) => {
    const studentCount = customCount || Math.max(1, currentSub?.active_students || 200);
    setUpgradeModal({
      isOpen: true,
      planCode,
      students: studentCount
    });
  };

  const handleUpgradeSuccess = async (orderNumber: string, planCode: 'standard' | 'premium') => {
    setUpgradeModal(prev => ({ ...prev, isOpen: false }));
    const planDisplayName = planCode === 'premium' ? 'Premium Plan' : 'Standard Plan';

    if (notify) {
      notify(`🎉 Payment verified! Order #${orderNumber} approved. ${planDisplayName} is now active and all modules are unlocked!`, 'success');
    }

    await loadData();
    if (onPlanChanged) {
      onPlanChanged();
    }

    // Try to auto-open receipt
    try {
      const res = await request<{ results: OrderHistoryItem[] }>('subscription/orders/');
      const match = res?.results?.find(o => o.order_number === orderNumber);
      if (match) {
        const receipt = await request<ReceiptData>(`subscription/orders/${match.id}/receipt/`);
        if (receipt) setSelectedReceipt(receipt);
      }
    } catch {
      // Non-blocking
    }
  };

  const handleViewReceipt = async (orderId: number) => {
    try {
      const receipt = await request<ReceiptData>(`subscription/orders/${orderId}/receipt/`);
      setSelectedReceipt(receipt);
    } catch {
      if (notify) notify('Failed to load invoice receipt.', 'error');
    }
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundModalOrder) return;
    if (!refundReason.trim()) {
      if (notify) notify('Please describe the reason for your refund / plan change request.', 'error');
      return;
    }
    if (!refundAccountTitle.trim() || !refundAccountNumber.trim()) {
      if (notify) notify('Please provide complete account title and account/wallet number for receiving your refund.', 'error');
      return;
    }
    try {
      setSubmittingRefund(true);
      const res = await request<{ message: string }>('subscription/refund-requests/', {
        method: 'POST',
        body: JSON.stringify({
          order_id: refundModalOrder.id,
          reason: refundReason.trim(),
          intended_change: refundIntendedChange.trim(),
          bank_name: refundBankName.trim(),
          account_title: refundAccountTitle.trim(),
          account_number: refundAccountNumber.trim(),
        }),
      });
      if (notify) notify(res?.message || 'Refund & plan change request submitted successfully.', 'success');
      setRefundModalOrder(null);
      await loadData();
    } catch (err: any) {
      if (notify) notify(err?.message || 'Could not submit refund request.', 'error');
    } finally {
      setSubmittingRefund(false);
    }
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return 'N/A';
    try {
      return new Date(isoStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return isoStr;
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 14 }}>
        <RefreshCw size={28} className="animate-spin" color="#2563eb" />
        <span style={{ color: '#64748b', fontSize: '0.95rem' }}>Loading subscription plans & pricing...</span>
      </div>
    );
  }

  const enrolledStudents = currentSub?.active_students || 0;

  // Standard: $3.60 USD / PKR 1,000 per student per month
  // Premium: $7.20 USD / PKR 2,000 per student per month
  const standardUnitUSD = 3.60;
  const standardUnitPKR = 1000;
  const premiumUnitUSD = 7.20;
  const premiumUnitPKR = 2000;

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* 1. Header with Currency Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text-primary, #0f172a)', letterSpacing: '-0.02em' }}>
            Subscription & Plans
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
            Choose or upgrade your plan anytime with instant card activation.
          </p>
        </div>

        {/* Currency Toggle */}
        <div style={{
          display: 'flex',
          backgroundColor: '#f1f5f9',
          borderRadius: 10,
          padding: 3,
          border: '1px solid #e2e8f0'
        }}>
          <button
            type="button"
            onClick={() => setCurrency('USD')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: currency === 'USD' ? '#ffffff' : 'transparent',
              color: currency === 'USD' ? '#2563eb' : '#64748b',
              cursor: 'pointer',
              boxShadow: currency === 'USD' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            USD ($)
          </button>
          <button
            type="button"
            onClick={() => setCurrency('PKR')}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: currency === 'PKR' ? '#ffffff' : 'transparent',
              color: currency === 'PKR' ? '#2563eb' : '#64748b',
              cursor: 'pointer',
              boxShadow: currency === 'PKR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            PKR (Rs)
          </button>
        </div>
      </div>

      {loadError && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: 12, color: '#991b1b', fontSize: 13 }}>
          {loadError}
        </div>
      )}

      {/* 2. ONLY 2 PLANS DETAILS (Standard & Premium) as Requested */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>

        {/* 1. STANDARD PLAN CARD */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 18,
            padding: '28px 24px',
            border: currentSub?.plan?.code === 'standard' ? '2px solid #2563eb' : '1px solid #e2e8f0',
            boxShadow: currentSub?.plan?.code === 'standard' ? '0 12px 30px -4px rgba(37, 99, 235, 0.15)' : '0 2px 10px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: '#0f172a' }}>Standard Plan</h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>Core teaching & operational automation</div>
              </div>
            </div>
            {currentSub?.plan?.code === 'standard' && (
              <span style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>
                CURRENT PLAN
              </span>
            )}
          </div>

          {/* Price Display */}
          <div style={{ margin: '14px 0' }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>
              {currency === 'USD' ? `$${standardUnitUSD.toFixed(2)}` : `Rs ${standardUnitPKR.toLocaleString()}`}
            </span>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}> / student / month</span>
          </div>

          {/* Term Discounts Callout */}
          <div style={{
            backgroundColor: '#f8fafc',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 11,
            color: '#475569',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 18,
            border: '1px solid #f1f5f9'
          }}>
            <span>Duration terms:</span>
            <strong style={{ color: '#0f172a' }}>1 Mo (0%) · 6 Mo (5% OFF) · 1 Yr (10% OFF)</strong>
          </div>

          {/* Upgrade Button on Card (Opens dedicated checkout modal) */}
          <button
            type="button"
            onClick={() => handleOpenUpgrade('standard')}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 12,
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
              marginBottom: 22,
              transition: 'all 0.15s ease'
            }}
          >
            <Zap size={16} />
            <span>Upgrade to Standard</span>
            <ArrowRight size={15} />
          </button>

          {/* Features Checklist */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Included in Standard:
            </div>
            {[
              'Daily Class & Subject Attendance Tracking',
              'Examinations, Datesheets & Term Result Cards',
              'Master Timetables & Homework Assignments',
              'Study Materials & Student / Parent Portals',
              'Offline Fee Challans, Collection & Receipts',
              'Staff Payroll & Monthly Salary Management',
              'Double-Entry Financial Accounts Ledger',
              'Bulk CSV Data Import & Broadcast Announcements',
              'Standard Formatted PDF & CSV Reports'
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Check size={16} color="#059669" />
                <span style={{ color: '#334155' }}>{item}</span>
              </div>
            ))}

            {/* Locked Features Notice */}
            <div style={{ borderTop: '1px dashed #e2e8f0', marginTop: 10, paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                Disabled in Standard (Requires Premium):
              </div>
              {[
                'Academic Quality Index (AQI) Engine',
                'Psychological Evaluation & Wellbeing Profiles',
                'Students at Risk AI & Early Warning Indicators',
                'Security Audit Log Viewer & Compliance Trails'
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>
                  <Lock size={12} color="#94a3b8" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 2. PREMIUM PLAN CARD */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 18,
            padding: '28px 24px',
            border: currentSub?.plan?.code === 'premium' ? '2px solid #7c3aed' : '2px solid #ddd6fe',
            boxShadow: currentSub?.plan?.code === 'premium' ? '0 12px 30px -4px rgba(124, 58, 237, 0.2)' : '0 4px 18px rgba(124, 58, 237, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
          }}
        >
          {/* Recommended Badge */}
          <div style={{
            position: 'absolute',
            top: -12,
            right: 24,
            backgroundColor: '#7c3aed',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 800,
            padding: '3px 12px',
            borderRadius: 12,
            letterSpacing: '0.04em',
            boxShadow: '0 2px 8px rgba(124, 58, 237, 0.35)'
          }}>
            RECOMMENDED • ALL FEATURES
          </div>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Crown size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: '#0f172a' }}>Premium Plan</h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>Full intelligence, AQI analytics & governance</div>
              </div>
            </div>
            {currentSub?.plan?.code === 'premium' && (
              <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>
                CURRENT PLAN
              </span>
            )}
          </div>

          {/* Price Display */}
          <div style={{ margin: '14px 0' }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: '#7c3aed', letterSpacing: '-0.03em' }}>
              {currency === 'USD' ? `$${premiumUnitUSD.toFixed(2)}` : `Rs ${premiumUnitPKR.toLocaleString()}`}
            </span>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}> / student / month</span>
          </div>

          {/* Term Discounts Callout */}
          <div style={{
            backgroundColor: '#faf5ff',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 11,
            color: '#6d28d9',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 18,
            border: '1px solid #ede9fe'
          }}>
            <span>Duration terms:</span>
            <strong style={{ color: '#5b21b6' }}>1 Mo (0%) · 6 Mo (5% OFF) · 1 Yr (10% OFF)</strong>
          </div>

          {/* Upgrade Button on Card (Opens dedicated checkout modal) */}
          <button
            type="button"
            onClick={() => handleOpenUpgrade('premium')}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 12,
              border: 'none',
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
              marginBottom: 22,
              transition: 'all 0.15s ease'
            }}
          >
            <Sparkles size={16} />
            <span>Upgrade to Premium</span>
            <ArrowRight size={15} />
          </button>

          {/* Features Checklist */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Everything in Standard, plus:
            </div>
            {[
              'Academic Quality Index (AQI) 5-Level Engine',
              'Psychological Evaluation & Wellbeing Profiles',
              'Students at Risk AI & Early Warning Indicators',
              'Case Review Workflows & Intervention Tracking',
              'Longitudinal 5-Year Academic Progress',
              'Multi-Campus Governance & Cross-Branch Comparisons',
              'Instructional Insights & Teacher Evaluations',
              'Security Audit Log Viewer & Compliance Trails',
              'Interactive Cashflow Analytics & Salary Exports',
              'Custom Role Permissions & Security Policies',
              'Priority 24/7 SLA Technical Support'
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Check size={16} color="#7c3aed" />
                <span style={{ color: '#1e1b4b', fontWeight: 600 }}>{item}</span>
              </div>
            ))}

            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 10,
              backgroundColor: '#fef3c7',
              color: '#92400e',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <Sparkles size={16} />
              <span>Zero Locked Features • 100% Unlocked</span>
            </div>
          </div>
        </div>

      </div>

      {/* 3. Order & Payment History Table */}
      {orders.length > 0 && (
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: 16,
          padding: '24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16
          }}>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Order & Payment History
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Track active orders, invoices, and receipts. Plan adjustments or refunds can be requested within <strong>2 days (48 hours)</strong> of purchase.
              </p>
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600
            }}>
              <Clock size={14} /> 2-Day Package Adjustment Policy Active
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '10px 12px' }}>Order #</th>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Plan</th>
                  <th style={{ padding: '10px 12px' }}>Duration</th>
                  <th style={{ padding: '10px 12px' }}>Students</th>
                  <th style={{ padding: '10px 12px' }}>Amount</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Plan Change / Refund</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{o.order_number}</td>
                    <td style={{ padding: '12px', color: '#64748b' }}>{formatDate(o.paid_on || o.created_at)}</td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{o.plan_name}</td>
                    <td style={{ padding: '12px' }}>{o.billing_months} mo</td>
                    <td style={{ padding: '12px' }}>{o.student_count}</td>
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
                        backgroundColor: o.status === 'refunded' ? '#f1f5f9' : (o.status === 'paid' || o.status === 'approved') ? '#dcfce7' : o.status === 'failed' ? '#fee2e2' : '#fef3c7',
                        color: o.status === 'refunded' ? '#475569' : (o.status === 'paid' || o.status === 'approved') ? '#15803d' : o.status === 'failed' ? '#b91c1c' : '#92400e',
                        border: `1px solid ${o.status === 'refunded' ? '#cbd5e1' : (o.status === 'paid' || o.status === 'approved') ? '#a7f3d0' : '#fde68a'}`
                      }}>
                        {o.status === 'approved' ? 'PAID' : o.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {o.refund_request ? (
                        o.refund_request.status === 'pending' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#fef3c7',
                            color: '#b45309',
                            border: '1px solid #fde68a',
                            fontSize: 11,
                            fontWeight: 700
                          }}>
                            <Clock size={11} /> Refund Under Review
                          </span>
                        ) : o.refund_request.status === 'approved' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#ecfdf5',
                            color: '#047857',
                            border: '1px solid #a7f3d0',
                            fontSize: 11,
                            fontWeight: 700
                          }}>
                            <Check size={11} /> Refund Approved
                          </span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: '#fef2f2',
                              color: '#b91c1c',
                              border: '1px solid #fecaca',
                              fontSize: 11,
                              fontWeight: 700
                            }}>
                              <X size={11} /> Request Rejected
                            </span>
                            {o.can_request_refund && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRefundModalOrder(o);
                                  setRefundReason('');
                                  setRefundIntendedChange('');
                                  setRefundBankName('');
                                  setRefundAccountTitle('');
                                  setRefundAccountNumber('');
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 5,
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Re-apply
                              </button>
                            )}
                          </div>
                        )
                      ) : o.can_request_refund ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRefundModalOrder(o);
                            setRefundReason('');
                            setRefundIntendedChange('');
                            setRefundBankName('');
                            setRefundAccountTitle('');
                            setRefundAccountNumber('');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 10px',
                            borderRadius: 6,
                            border: '1px solid #c7d2fe',
                            backgroundColor: '#eef2ff',
                            color: '#4338ca',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          title="Eligible for plan change or refund (under 48 hours)"
                        >
                          <RotateCcw size={12} />
                          Change Plan / Refund
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {(o.status === 'paid' || o.status === 'approved' || o.status === 'refunded') && (
                        <button
                          type="button"
                          onClick={() => handleViewReceipt(o.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 12px',
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
        </div>
      )}

      {/* 4. Upgrade Checkout Modal (Card input, duration 1/6/12 mo discounts, dummy test card) */}
      <UpgradeCheckoutModal
        isOpen={upgradeModal.isOpen}
        planCode={upgradeModal.planCode}
        initialStudents={upgradeModal.students || Math.max(1, enrolledStudents || 200)}
        initialCurrency={currency}
        schoolId={currentSub?.school_id || activeCampusId}
        schoolName={currentSub?.school_name}
        onSuccess={handleUpgradeSuccess}
        onClose={() => setUpgradeModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Printable Receipt Modal */}
      {selectedReceipt && (
        <ReceiptModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}

      {/* 2-Day Plan Change & Refund Request Modal */}
      {refundModalOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            maxWidth: 540,
            width: '100%',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#fafafa',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#eef2ff',
                  color: '#4f46e5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <RotateCcw size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    Request Plan Change & Refund
                  </h3>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Order #{refundModalOrder.order_number} • {refundModalOrder.plan_name} ({refundModalOrder.amount} {refundModalOrder.currency})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRefundModalOrder(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRefundSubmit} style={{ padding: '20px 24px' }}>
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 16,
                fontSize: 12,
                color: '#1e40af',
                lineHeight: 1.5,
              }}>
                <strong>2-Day Policy:</strong> You may change or refund your package within 48 hours of purchase. Once approved by our platform billing administrators, your prior payment is refunded directly to your bank account, and your institution is unlocked to select your new package cleanly at standard pricing.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                    Reason for Plan Change / Refund *
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={refundReason}
                    onChange={e => setRefundReason(e.target.value)}
                    placeholder="e.g. Bought Standard but decided to upgrade to Premium 500 students..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                    Intended New Package / Goal (Optional)
                  </label>
                  <input
                    type="text"
                    value={refundIntendedChange}
                    onChange={e => setRefundIntendedChange(e.target.value)}
                    placeholder="e.g. Premium Plan with 500 students, or Standard 1000 students"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={14} color="#6366f1" /> Bank / Mobile Wallet Details for Receiving Refund
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                        Bank / Provider Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={refundBankName}
                        onChange={e => setRefundBankName(e.target.value)}
                        placeholder="e.g. Meezan Bank / JazzCash / HBL"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 7,
                          border: '1px solid #cbd5e1',
                          fontSize: 12,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                        Account Title *
                      </label>
                      <input
                        type="text"
                        required
                        value={refundAccountTitle}
                        onChange={e => setRefundAccountTitle(e.target.value)}
                        placeholder="e.g. Muhammad Ali"
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 7,
                          border: '1px solid #cbd5e1',
                          fontSize: 12,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                      Account / IBAN / Mobile Wallet Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={refundAccountNumber}
                      onChange={e => setRefundAccountNumber(e.target.value)}
                      placeholder="e.g. PK36MEZN000... or 03001234567"
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 7,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{
                marginTop: 20,
                borderTop: '1px solid #f1f5f9',
                paddingTop: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 10,
              }}>
                <button
                  type="button"
                  onClick={() => setRefundModalOrder(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRefund}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: submittingRefund ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <RotateCcw size={14} />
                  {submittingRefund ? 'Submitting Request...' : 'Submit Refund Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanAndBilling;
