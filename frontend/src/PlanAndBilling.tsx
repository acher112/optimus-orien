import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard, Check, Sparkles, ShieldCheck, FileText, CheckCircle2,
  AlertTriangle, Clock, ArrowRight, RefreshCw, Lock, Printer, Building2,
  Calendar, Layers, Users, Zap, AlertCircle, Sliders, ChevronRight
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

interface CatalogFeature {
  key: string;
  name: string;
  name_ur?: string;
  category: 'core' | 'academics' | 'analytics' | 'finance' | 'operations' | 'safeguarding';
  is_premium_only: boolean;
  rate_usd: number;
  rate_pkr: number;
}

const CUSTOM_CATALOG_FEATURES: CatalogFeature[] = [
  // Academics
  { key: 'attendance_daily', name: 'Daily Attendance Tracking', category: 'academics', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },
  { key: 'marks_grading', name: 'Marks Entry & Grading Criteria', category: 'academics', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },
  { key: 'exams_datesheets', name: 'Exam Datesheets & Timetables', category: 'academics', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },
  { key: 'result_cards', name: 'Result Cards & Term Slips', category: 'academics', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },
  { key: 'timetable', name: 'Class Timetable Scheduling', category: 'academics', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },
  { key: 'tasks_homework', name: 'Tasks & Homework Assignments', category: 'academics', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },
  { key: 'participation_skills_entry', name: 'Skills & Participation Entry', category: 'academics', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },

  // Analytics & Intelligence
  { key: 'aqi', name: 'Academic Quality Index (AQI)', category: 'analytics', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'aqi_history', name: 'Longitudinal AQI Trends', category: 'analytics', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'early_intervention', name: 'Early Intervention & Support Cases', category: 'analytics', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'attention_indicators', name: 'Student Attention Indicators', category: 'analytics', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'longitudinal_5y', name: '5-Year Longitudinal Student Progress', category: 'analytics', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'class_subject_performance', name: 'Class & Subject Academic Performance', category: 'analytics', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },
  { key: 'teacher_insights', name: 'Teacher Instructional Insights', category: 'analytics', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },

  // Finance
  { key: 'fees_offline', name: 'Offline Fees & Counter Receipts', category: 'finance', is_premium_only: false, rate_usd: 0.20, rate_pkr: 55 },
  { key: 'accounts_ledger', name: 'Double-Entry Financial Accounts Ledger', category: 'finance', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'finance_dashboard', name: 'Executive Finance & Cashflow Dashboard', category: 'finance', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'hr_payroll', name: 'HR Staff Payroll & Salary Management', category: 'finance', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },

  // Operations & Safeguarding
  { key: 'psych_eval', name: 'Psychological Evaluation Module', category: 'safeguarding', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'multi_campus', name: 'Multi-Campus Network Governance', category: 'operations', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'admissions_online', name: 'Online Admissions & Applicant Funnel', category: 'operations', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'id_cards', name: 'Bulk Student & Staff ID Card Printing', category: 'operations', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'audit_log_viewer', name: 'Security Audit Log Viewer & Export', category: 'operations', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'advanced_reports_export', name: 'Formatted PDF & Excel Export Suite', category: 'operations', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
  { key: 'priority_support', name: 'Priority SLA Technical Support', category: 'operations', is_premium_only: true, rate_usd: 0.40, rate_pkr: 110 },
];

const BILLING_PERIOD_OPTIONS = [
  { months: 1, label: '1 Month', discount: 0, tag: 'Standard' },
  { months: 4, label: '4 Months', discount: 5, tag: '5% OFF' },
  { months: 8, label: '8 Months', discount: 10, tag: '10% OFF' },
  { months: 12, label: '1 Year', discount: 15, tag: '15% OFF' },
  { months: 24, label: '2 Years', discount: 20, tag: '20% OFF' },
  { months: 36, label: '3 Years', discount: 25, tag: '25% OFF' },
  { months: 60, label: '5 Years', discount: 30, tag: '30% OFF' },
];

export const PlanAndBilling: React.FC<PlanAndBillingProps> = ({ user, activeCampusId, notify, onPlanChanged }) => {
  const [currentSub, setCurrentSub] = useState<CurrentSubscriptionData | null>(null);
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Active Tier Choice: 'standard', 'premium', or 'custom'
  const [selectedPlan, setSelectedPlan] = useState<'standard' | 'premium' | 'custom'>('premium');
  const [currency, setCurrency] = useState<'USD' | 'PKR'>('USD');
  const [billingMonths, setBillingMonths] = useState<number>(12);

  // Custom Package Builder State
  const [customStudents, setCustomStudents] = useState<number>(100);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([
    'attendance_daily', 'marks_grading', 'exams_datesheets', 'result_cards', 'timetable', 'fees_offline'
  ]);

  // Modals
  const [activeCheckoutOrder, setActiveCheckoutOrder] = useState<CheckoutOrderInfo | null>(null);
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
        if (subData.active_students > 0) {
          setCustomStudents(subData.active_students);
        }
      }
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

  // Handle Feature Toggle for Custom Package
  const toggleFeature = (key: string) => {
    setSelectedFeatures(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const selectCategory = (category: string, selectAll: boolean) => {
    const catKeys = CUSTOM_CATALOG_FEATURES.filter(f => f.category === category).map(f => f.key);
    setSelectedFeatures(prev => {
      if (selectAll) {
        return Array.from(new Set([...prev, ...catKeys]));
      } else {
        return prev.filter(k => !catKeys.includes(k));
      }
    });
  };

  // Pricing calculations
  const currentPeriod = useMemo(() => {
    return BILLING_PERIOD_OPTIONS.find(p => p.months === billingMonths) || BILLING_PERIOD_OPTIONS[0];
  }, [billingMonths]);

  const discountRate = currentPeriod.discount / 100.0;

  const pricing = useMemo(() => {
    const studentCount = selectedPlan === 'custom' ? Math.max(1, customStudents) : Math.max(1, currentSub?.active_students || 1);

    if (selectedPlan === 'standard') {
      const unit = currency === 'USD' ? 3.60 : 1000;
      const gross = studentCount * unit * billingMonths;
      const discount = gross * discountRate;
      const net = gross - discount;
      return { unitPrice: unit, gross, discount, net, studentCount };
    } else if (selectedPlan === 'premium') {
      const unit = currency === 'USD' ? 7.20 : 2000;
      const gross = studentCount * unit * billingMonths;
      const discount = gross * discountRate;
      const net = gross - discount;
      return { unitPrice: unit, gross, discount, net, studentCount };
    } else {
      // Custom Plan: Base $2.00 USD / Rs 550 PKR + add-ons
      const baseUnit = currency === 'USD' ? 2.00 : 550;
      let addonTotal = 0;
      selectedFeatures.forEach(k => {
        const feat = CUSTOM_CATALOG_FEATURES.find(f => f.key === k);
        if (feat) {
          addonTotal += currency === 'USD' ? feat.rate_usd : feat.rate_pkr;
        }
      });
      const unit = baseUnit + addonTotal;
      const gross = studentCount * unit * billingMonths;
      const discount = gross * discountRate;
      const net = gross - discount;
      return { unitPrice: unit, gross, discount, net, studentCount };
    }
  }, [selectedPlan, customStudents, currentSub?.active_students, currency, billingMonths, discountRate, selectedFeatures]);

  const handleStartCardPayment = async () => {
    try {
      setSubmittingOrder(true);
      const payload: any = {
        plan_code: selectedPlan,
        billing_months: billingMonths,
        payment_method: 'card',
        currency: currency,
        ...(activeCampusId ? { school_id: activeCampusId } : {})
      };

      if (selectedPlan === 'custom') {
        payload.features = selectedFeatures;
        payload.student_count = customStudents;
      }

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
        body: JSON.stringify(payload)
      });

      if (res && res.order) {
        let planDisplayName = 'Standard Plan';
        if (selectedPlan === 'premium') planDisplayName = 'Premium Plan';
        if (selectedPlan === 'custom') planDisplayName = 'Custom Package';

        setActiveCheckoutOrder({
          id: res.order.id,
          order_number: res.order.order_number,
          plan_name: planDisplayName,
          plan_code: selectedPlan,
          amount: res.order.amount,
          currency: res.order.currency,
          billing_months: res.order.billing_months,
          student_count: res.order.student_count,
          school_name: currentSub?.school_name
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
    let planDisplayName = 'Standard';
    if (selectedPlan === 'premium') planDisplayName = 'Premium';
    if (selectedPlan === 'custom') planDisplayName = 'Custom Package';

    if (notify) notify(`Payment verified! School upgraded to ${planDisplayName}. Modules unlocked.`, 'success');
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

  const isNoPlan = !currentSub || currentSub.status === 'no_plan' || currentSub.is_no_plan;
  const isActive = currentSub?.status === 'active';
  const isPastDue = currentSub?.status === 'past_due';

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 1. Header & Live Status */}
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-primary, #0f172a)' }}>
          Subscription & Billing
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
          Manage your school tier, customize packages by student headcount & term, and activate instantly via card payment.
        </p>
      </div>

      {/* Current Subscription Status Banner */}
      <div style={{
        backgroundColor: 'var(--card-bg, #ffffff)',
        borderRadius: 16,
        padding: '22px 28px',
        border: '1px solid var(--border-color, #e2e8f0)',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
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
            borderRadius: 14,
            backgroundColor: isActive ? '#ecfdf5' : isPastDue ? '#fef3c7' : '#f8fafc',
            color: isActive ? '#059669' : isPastDue ? '#d97706' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {isActive ? <ShieldCheck size={28} /> : isPastDue ? <Clock size={28} /> : <Lock size={28} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                {currentSub?.plan?.name || (isNoPlan ? 'Free Account (No Plan Active)' : 'Active Plan')}
              </h2>
              <span style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                padding: '3px 10px',
                borderRadius: 12,
                backgroundColor: isActive ? '#dcfce7' : isPastDue ? '#fef3c7' : '#fee2e2',
                color: isActive ? '#15803d' : isPastDue ? '#b45309' : '#b91c1c'
              }}>
                {isNoPlan ? 'FREE / UNPAID' : currentSub?.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginTop: 4 }}>
              Campus: <strong>{currentSub?.school_name || 'Main Campus'}</strong> •{' '}
              <strong>{currentSub?.active_students || 0}</strong> active enrolled students
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 13 }}>
          {currentSub?.paid_until && (
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: '#94a3b8' }}>Term Expires</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary, #0f172a)', marginTop: 2 }}>
                {formatDate(currentSub.paid_until)}
              </div>
            </div>
          )}
          {isNoPlan && (
            <div style={{
              backgroundColor: '#fff7ed',
              border: '1px solid #ffedd5',
              padding: '8px 14px',
              borderRadius: 8,
              color: '#c2410c',
              fontSize: 12,
              fontWeight: 600
            }}>
              🔒 Basic access only. Choose a package below to unlock features.
            </div>
          )}
          {isPastDue && currentSub?.grace_days_remaining !== null && (
            <div style={{
              backgroundColor: '#fef3c7',
              border: '1px solid #fde68a',
              padding: '8px 14px',
              borderRadius: 8,
              color: '#92400e',
              fontSize: 12,
              fontWeight: 600
            }}>
              ⚠️ Grace period active: {currentSub?.grace_days_remaining} days remaining.
            </div>
          )}
        </div>
      </div>

      {/* 2. Choose Subscription Package */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text-primary, #0f172a)' }}>
              Choose or Customize Your Package
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
              Select a standard tier or build a custom package for multi-year duration with volume discounts.
            </p>
          </div>

          {/* Controls: Currency & Duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Currency Selector */}
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
                  padding: '5px 12px',
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
                  padding: '5px 12px',
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

            {/* Duration Selector */}
            <div style={{
              display: 'flex',
              backgroundColor: 'var(--bg-secondary, #f1f5f9)',
              borderRadius: 8,
              padding: 3,
              border: '1px solid var(--border-color, #e2e8f0)',
              gap: 2
            }}>
              {BILLING_PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.months}
                  type="button"
                  onClick={() => setBillingMonths(p.months)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor: billingMonths === p.months ? '#ffffff' : 'transparent',
                    color: billingMonths === p.months ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    boxShadow: billingMonths === p.months ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {p.label}
                  {p.discount > 0 && <span style={{ marginLeft: 3, color: '#16a34a', fontSize: 10 }}>(-{p.discount}%)</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3 Tier Selection Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 20 }}>
          {/* 1. STANDARD PLAN CARD */}
          <div
            onClick={() => setSelectedPlan('standard')}
            style={{
              backgroundColor: 'var(--card-bg, #ffffff)',
              borderRadius: 16,
              padding: '26px 22px',
              border: `2px solid ${selectedPlan === 'standard' ? '#2563eb' : 'var(--border-color, #e2e8f0)'}`,
              cursor: 'pointer',
              position: 'relative',
              boxShadow: selectedPlan === 'standard' ? '0 8px 24px rgba(37, 99, 235, 0.12)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column'
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
              Essential core school operations: attendance, grading, exams, timetable, offline fee challans, and portals.
            </p>

            <div style={{ marginBottom: 18 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary, #0f172a)' }}>
                {currency === 'USD' ? '$3.60' : 'Rs 1,000'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}> / student / mo</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, flex: 1 }}>
              {[
                'Daily Class & Subject Attendance',
                'Exams, Grading Criteria & Result Cards',
                'Master Class Timetables & Schedules',
                'Offline Fees, Challans & Counter Receipts',
                'Homework Assignments & Circular Notices',
                'Student, Parent, Teacher & Principal Portals',
                'CSV Student Directory & Bulk Import'
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={15} color="#059669" />
                  <span style={{ color: 'var(--text-secondary, #334155)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 2. PREMIUM PLAN CARD */}
          <div
            onClick={() => setSelectedPlan('premium')}
            style={{
              backgroundColor: 'var(--card-bg, #ffffff)',
              borderRadius: 16,
              padding: '26px 22px',
              border: `2px solid ${selectedPlan === 'premium' ? '#2563eb' : 'var(--border-color, #e2e8f0)'}`,
              cursor: 'pointer',
              position: 'relative',
              boxShadow: selectedPlan === 'premium' ? '0 8px 24px rgba(37, 99, 235, 0.16)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              position: 'absolute',
              top: -12,
              right: 20,
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
              Full institutional intelligence: AQI, risk alerts, ledger, staff payroll, multi-campus, and psych profiles.
            </p>

            <div style={{ marginBottom: 18 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: '#2563eb' }}>
                {currency === 'USD' ? '$7.20' : 'Rs 2,000'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}> / student / mo</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, flex: 1 }}>
              {[
                'Everything in Standard Plan, plus:',
                'Academic Quality Index (AQI) 5-Level Engine',
                'Early Intervention & Student Attention Alerts',
                'Double-Entry Financial Accounts Ledger',
                'Executive Cashflow & Finance Dashboard',
                'HR Staff Salaries, Deductions & Payroll Runs',
                'Multi-Campus Governance & Comparisons',
                'Psychological Evaluation & Development Profiles'
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={15} color={idx === 0 ? '#2563eb' : '#059669'} />
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

          {/* 3. CUSTOM PACKAGE BUILDER CARD */}
          <div
            onClick={() => setSelectedPlan('custom')}
            style={{
              backgroundColor: 'var(--card-bg, #ffffff)',
              borderRadius: 16,
              padding: '26px 22px',
              border: `2px solid ${selectedPlan === 'custom' ? '#7c3aed' : 'var(--border-color, #e2e8f0)'}`,
              cursor: 'pointer',
              position: 'relative',
              boxShadow: selectedPlan === 'custom' ? '0 8px 24px rgba(124, 58, 237, 0.16)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              position: 'absolute',
              top: -12,
              right: 20,
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 800,
              padding: '3px 12px',
              borderRadius: 12,
              letterSpacing: '0.04em'
            }}>
              MODULAR
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={18} color="#7c3aed" />
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                  Custom Package
                </h3>
              </div>
              {selectedPlan === 'custom' && (
                <span style={{ backgroundColor: '#f5f3ff', color: '#7c3aed', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                  SELECTED
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', margin: '0 0 16px 0', minHeight: 38 }}>
              Build your own suite: pick exact modules, student headcount, and multi-year contracts with term savings.
            </p>

            <div style={{ marginBottom: 18 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: '#7c3aed' }}>
                {currency === 'USD' ? `$${pricing.unitPrice.toFixed(2)}` : `Rs ${pricing.unitPrice}`}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}> / student / mo</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={15} color="#7c3aed" />
                <span style={{ color: 'var(--text-secondary, #334155)' }}>
                  Base fee + {selectedFeatures.length} selected modules
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={15} color="#7c3aed" />
                <span style={{ color: 'var(--text-secondary, #334155)' }}>
                  Custom student headcount ({customStudents} students)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={15} color="#7c3aed" />
                <span style={{ color: 'var(--text-secondary, #334155)' }}>
                  Up to 5 years duration with up to 30% savings
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={15} color="#7c3aed" />
                <span style={{ color: 'var(--text-secondary, #334155)' }}>
                  Instant activation via Sandbox Card payment
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. CUSTOM PACKAGE CONFIGURATOR (Rendered when 'custom' is selected) */}
        {selectedPlan === 'custom' && (
          <div style={{
            marginTop: 24,
            backgroundColor: 'var(--card-bg, #ffffff)',
            borderRadius: 16,
            padding: '24px 28px',
            border: '2px solid #ddd6fe',
            boxShadow: '0 4px 16px rgba(124, 58, 237, 0.08)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0', color: '#5b21b6' }}>
                  Custom Package Builder
                </h3>
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                  Customize your student headcount and select the specific modules your school needs.
                </p>
              </div>

              {/* Headcount Input & Quick Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Students:</span>
                <input
                  type="number"
                  min={1}
                  max={25000}
                  value={customStudents}
                  onChange={(e) => setCustomStudents(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    width: 90,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    fontWeight: 700,
                    textAlign: 'center'
                  }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {[50, 100, 250, 500, 1000, 2500].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setCustomStudents(count)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        backgroundColor: customStudents === count ? '#7c3aed' : '#f8fafc',
                        color: customStudents === count ? '#ffffff' : '#64748b',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Categorized Modules Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {[
                { cat: 'academics', title: '📚 Academics & Grading' },
                { cat: 'analytics', title: '📈 Analytics & AQI' },
                { cat: 'finance', title: '💰 Finance & HR Payroll' },
                { cat: 'operations', title: '⚙️ Operations & Governance' },
              ].map(({ cat, title }) => {
                const catFeatures = CUSTOM_CATALOG_FEATURES.filter(f => f.category === cat || (cat === 'operations' && f.category === 'safeguarding'));
                const allSelected = catFeatures.every(f => selectedFeatures.includes(f.key));

                return (
                  <div
                    key={cat}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: '14px',
                      backgroundColor: '#f8fafc'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{title}</span>
                      <button
                        type="button"
                        onClick={() => selectCategory(cat, !allSelected)}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#7c3aed',
                          backgroundColor: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        {allSelected ? 'Clear' : 'Select All'}
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {catFeatures.map(feat => {
                        const isChecked = selectedFeatures.includes(feat.key);
                        return (
                          <label
                            key={feat.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                              fontSize: 12,
                              padding: '6px 8px',
                              borderRadius: 6,
                              backgroundColor: isChecked ? '#ede9fe' : '#ffffff',
                              border: `1px solid ${isChecked ? '#c4b5fd' : '#e2e8f0'}`,
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleFeature(feat.key)}
                                style={{ accentColor: '#7c3aed' }}
                              />
                              <span style={{ fontWeight: isChecked ? 700 : 400, color: isChecked ? '#4c1d95' : '#334155' }}>
                                {feat.name}
                              </span>
                            </div>
                            <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>
                              +{currency === 'USD' ? `$${feat.rate_usd.toFixed(2)}` : `Rs ${feat.rate_pkr}`}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Live Calculation & Instant Sandbox Payment Checkout */}
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
              <span>Transparent Order Breakdown</span>
              <span>•</span>
              <span style={{ color: '#38bdf8' }}>{pricing.studentCount} Students</span>
              <span>•</span>
              <span style={{ color: '#a78bfa' }}>{currentPeriod.label}</span>
            </div>
            <div style={{ fontSize: 14, marginTop: 6, color: '#cbd5e1' }}>
              {pricing.studentCount} students × {currency === 'USD' ? `$${pricing.unitPrice.toFixed(2)}` : `Rs ${pricing.unitPrice}`} / mo × {billingMonths} months
              {currentPeriod.discount > 0 && (
                <span style={{ color: '#4ade80', marginLeft: 6 }}>
                  ({currentPeriod.discount}% term discount applied: -{currency === 'USD' ? `$${pricing.discount.toFixed(2)}` : `Rs ${pricing.discount.toLocaleString()}`})
                </span>
              )}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>
              Total Payable: {currency === 'USD' ? `$${pricing.net.toFixed(2)}` : `Rs ${pricing.net.toLocaleString()}`} {currency}
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
                backgroundColor: selectedPlan === 'custom' ? '#7c3aed' : '#2563eb',
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
                  <span>Preparing Order...</span>
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

      {/* 5. Order & Invoice History */}
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
                  <th style={{ padding: '10px 12px' }}>Students</th>
                  <th style={{ padding: '10px 12px' }}>Amount</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
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
                        backgroundColor: o.status === 'paid' ? '#dcfce7' : o.status === 'failed' ? '#fee2e2' : '#fef3c7',
                        color: o.status === 'paid' ? '#15803d' : o.status === 'failed' ? '#b91c1c' : '#92400e'
                      }}>
                        {o.status}
                      </span>
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
