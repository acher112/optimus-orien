import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, Check, Sparkles, FileText,
  ArrowRight, RefreshCw, Lock,
  Users, Zap, BookOpen, Crown
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
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 16px 0', color: '#0f172a' }}>
            Order & Payment History
          </h3>

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
                        backgroundColor: (o.status === 'paid' || o.status === 'approved') ? '#dcfce7' : o.status === 'failed' ? '#fee2e2' : '#fef3c7',
                        color: (o.status === 'paid' || o.status === 'approved') ? '#15803d' : o.status === 'failed' ? '#b91c1c' : '#92400e'
                      }}>
                        {o.status === 'approved' ? 'PAID' : o.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {(o.status === 'paid' || o.status === 'approved') && (
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
    </div>
  );
};

export default PlanAndBilling;
