import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard, Check, Sparkles, ShieldCheck, FileText, CheckCircle2,
  Clock, ArrowRight, RefreshCw, Lock, Building2,
  Calendar, Layers, Users, Zap, AlertCircle, Sliders, ChevronRight,
  ChevronDown, ChevronUp, CheckCircle, BookOpen, TrendingUp, DollarSign,
  Minus, Plus, Shield, Award
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
  category: 'core' | 'academics' | 'analytics' | 'finance' | 'operations';
  is_premium_only: boolean;
  rate_usd: number;
  rate_pkr: number;
}

const CUSTOM_CATALOG_FEATURES: CatalogFeature[] = [
  // Academics & Portals
  { key: 'attendance_daily', name: 'Daily Attendance Tracking', category: 'academics', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },
  { key: 'marks_grading', name: 'Marks Entry & Grading Criteria', category: 'academics', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },
  { key: 'exams_datesheets', name: 'Exam Datesheets & Timetables', category: 'academics', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },
  { key: 'result_cards', name: 'Result Cards & Term Slips', category: 'academics', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },
  { key: 'timetable', name: 'Class Timetable Scheduling', category: 'academics', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },
  { key: 'tasks_homework', name: 'Tasks & Homework Assignments', category: 'academics', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },
  { key: 'participation_skills_entry', name: 'Skills & Participation Entry', category: 'academics', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },

  // Analytics & Intelligence
  { key: 'aqi', name: 'Academic Quality Index (AQI)', category: 'analytics', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'aqi_history', name: 'Longitudinal AQI Trends', category: 'analytics', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'early_intervention', name: 'Early Intervention & Support Cases', category: 'analytics', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'attention_indicators', name: 'Student Attention Indicators', category: 'analytics', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'longitudinal_5y', name: '5-Year Longitudinal Student Progress', category: 'analytics', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'class_subject_performance', name: 'Class & Subject Academic Performance', category: 'analytics', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },
  { key: 'teacher_insights', name: 'Teacher Instructional Insights', category: 'analytics', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },

  // Finance & HR
  { key: 'fees_offline', name: 'Offline Fees & Counter Receipts', category: 'finance', is_premium_only: false, rate_usd: 0.02, rate_pkr: 5 },
  { key: 'accounts_ledger', name: 'Double-Entry Financial Accounts Ledger', category: 'finance', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'finance_dashboard', name: 'Executive Finance & Cashflow Dashboard', category: 'finance', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'hr_payroll', name: 'HR Staff Payroll & Salary Management', category: 'finance', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },

  // Operations & Governance
  { key: 'psych_eval', name: 'Psychological Evaluation Module', category: 'operations', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'multi_campus', name: 'Multi-Campus Network Governance', category: 'operations', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'admissions_online', name: 'Online Admissions & Applicant Funnel', category: 'operations', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'id_cards', name: 'Bulk Student & Staff ID Card Printing', category: 'operations', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'audit_log_viewer', name: 'Security Audit Log Viewer & Export', category: 'operations', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'advanced_reports_export', name: 'Formatted PDF & Excel Export Suite', category: 'operations', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
  { key: 'priority_support', name: 'Priority SLA Technical Support', category: 'operations', is_premium_only: true, rate_usd: 0.05, rate_pkr: 15 },
];

const BILLING_PERIOD_OPTIONS = [
  { months: 1, label: '1 Month', discount: 0, tag: 'Standard' },
  { months: 4, label: '4 Months', discount: 5, tag: '5% OFF' },
  { months: 8, label: '8 Months', discount: 10, tag: '10% OFF' },
  { months: 12, label: '12 Months (1 Year)', discount: 15, tag: '15% OFF - Best Value' },
  { months: 24, label: '24 Months (2 Years)', discount: 20, tag: '20% OFF' },
  { months: 36, label: '36 Months (3 Years)', discount: 25, tag: '25% OFF' },
  { months: 60, label: '60 Months (5 Years)', discount: 30, tag: '30% OFF' },
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

  // Card details expandable states
  const [expandedCard, setExpandedCard] = useState<'standard' | 'premium' | 'custom' | null>(null);

  // Custom Package Builder State (Base rate 0.70$ / 195 PKR per student)
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

  const applyPresetBundle = (bundle: 'all' | 'academics' | 'finance_academic' | 'clear') => {
    if (bundle === 'all') {
      setSelectedFeatures(CUSTOM_CATALOG_FEATURES.map(f => f.key));
    } else if (bundle === 'academics') {
      setSelectedFeatures(CUSTOM_CATALOG_FEATURES.filter(f => f.category === 'academics').map(f => f.key));
    } else if (bundle === 'finance_academic') {
      setSelectedFeatures(CUSTOM_CATALOG_FEATURES.filter(f => f.category === 'academics' || f.category === 'finance').map(f => f.key));
    } else {
      setSelectedFeatures([]);
    }
  };

  // Pricing calculations
  const currentPeriod = useMemo(() => {
    return BILLING_PERIOD_OPTIONS.find(p => p.months === billingMonths) || BILLING_PERIOD_OPTIONS[3];
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
      // Custom Plan: Base $0.70 USD / Rs 195 PKR + selected micro-addons
      const baseUnit = currency === 'USD' ? 0.70 : 195;
      let addonTotal = 0;
      selectedFeatures.forEach(k => {
        const feat = CUSTOM_CATALOG_FEATURES.find(f => f.key === k);
        if (feat) {
          addonTotal += currency === 'USD' ? feat.rate_usd : feat.rate_pkr;
        }
      });
      const unit = Number((baseUnit + addonTotal).toFixed(2));
      const gross = studentCount * unit * billingMonths;
      const discount = gross * discountRate;
      const net = gross - discount;
      return { unitPrice: unit, gross, discount, net, studentCount };
    }
  }, [selectedPlan, customStudents, currentSub?.active_students, currency, billingMonths, discountRate, selectedFeatures]);

  // Per-card calculations for instant visual clarity
  const calculateCardEstimate = (planKey: 'standard' | 'premium' | 'custom') => {
    const count = planKey === 'custom' ? Math.max(1, customStudents) : Math.max(1, currentSub?.active_students || 1);
    let unit = 0;
    if (planKey === 'standard') unit = currency === 'USD' ? 3.60 : 1000;
    else if (planKey === 'premium') unit = currency === 'USD' ? 7.20 : 2000;
    else {
      const base = currency === 'USD' ? 0.70 : 195;
      let add = 0;
      selectedFeatures.forEach(k => {
        const feat = CUSTOM_CATALOG_FEATURES.find(f => f.key === k);
        if (feat) add += currency === 'USD' ? feat.rate_usd : feat.rate_pkr;
      });
      unit = Number((base + add).toFixed(2));
    }
    const gross = count * unit * billingMonths;
    const disc = gross * discountRate;
    const net = gross - disc;
    return { unit, gross, disc, net, count };
  };

  // Direct Institutional Plan Activation (Applies plan for real in the database)
  const handleDirectActivation = async () => {
    try {
      setSubmittingOrder(true);
      const payload: any = {
        plan_code: selectedPlan,
        billing_months: billingMonths,
        payment_method: 'direct',
        currency: currency,
        ...(activeCampusId ? { school_id: activeCampusId } : {})
      };

      if (selectedPlan === 'custom') {
        payload.features = selectedFeatures;
        payload.student_count = customStudents;
      }

      const res = await request<{
        message: string;
        activated?: boolean;
        order: {
          id: number;
          order_number: string;
          status: string;
          amount: string;
          currency: string;
          billing_months: number;
          student_count: number;
          provider: string;
        };
      }>('subscription/orders/', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.order) {
        let planDisplayName = 'Standard Plan';
        if (selectedPlan === 'premium') planDisplayName = 'Premium Plan';
        if (selectedPlan === 'custom') planDisplayName = 'Custom Package';

        if (notify) {
          notify(`🎉 Success! ${planDisplayName} is now officially active for ${currentSub?.school_name || 'your institution'}. All features unlocked!`, 'success');
        }

        await loadData();
        if (onPlanChanged) onPlanChanged();

        // Load and present receipt modal
        try {
          const receipt = await request<ReceiptData>(`subscription/orders/${res.order.id}/receipt/`);
          if (receipt) setSelectedReceipt(receipt);
        } catch {}
      }
    } catch (err: any) {
      if (notify) notify(err.message || 'Failed to activate plan.', 'error');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Start Card Checkout (Secure checkout modal)
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
    let planDisplayName = 'Standard Plan';
    if (selectedPlan === 'premium') planDisplayName = 'Premium Plan';
    if (selectedPlan === 'custom') planDisplayName = 'Custom Package';

    if (notify) notify(`🎉 Payment Verified! ${planDisplayName} activated successfully. All institutional modules are unlocked.`, 'success');
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
        <span style={{ color: '#64748b', fontSize: '0.95rem' }}>Loading subscription status & pricing...</span>
      </div>
    );
  }

  const isNoPlan = !currentSub || currentSub.status === 'no_plan' || currentSub.is_no_plan;
  const isActive = currentSub?.status === 'active';
  const isPastDue = currentSub?.status === 'past_due';

  return (
    <div style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* 1. Header & Live Subscription Status Banner */}
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text-primary, #0f172a)', letterSpacing: '-0.02em' }}>
          Subscription & Billing
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
          Manage your institution's tier, choose custom term lengths with volume discounts, and activate instantly.
        </p>
      </div>

      {/* Modern Executive Status Card */}
      <div style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 18
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: isActive ? '#ecfdf5' : isPastDue ? '#fef3c7' : '#f1f5f9',
            color: isActive ? '#059669' : isPastDue ? '#d97706' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {isActive ? <ShieldCheck size={26} /> : isPastDue ? <Clock size={26} /> : <Lock size={26} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                {currentSub?.plan?.name || (isNoPlan ? 'Basic Account (No Active Plan)' : 'Active Plan')}
              </h2>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: 10,
                backgroundColor: isActive ? '#dcfce7' : isPastDue ? '#fef3c7' : '#fee2e2',
                color: isActive ? '#15803d' : isPastDue ? '#b45309' : '#b91c1c'
              }}>
                {isNoPlan ? 'UNPAID / FREE' : currentSub?.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
              Campus: <strong style={{ color: '#334155' }}>{currentSub?.school_name || 'Main Campus'}</strong>
            </div>
          </div>
        </div>

        {/* Quick Metrics Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{
            padding: '8px 14px',
            borderRadius: 10,
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12
          }}>
            <Users size={16} color="#64748b" />
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Students</div>
              <strong style={{ color: '#0f172a' }}>{currentSub?.active_students || 0} Enrolled</strong>
            </div>
          </div>

          <div style={{
            padding: '8px 14px',
            borderRadius: 10,
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12
          }}>
            <Calendar size={16} color="#64748b" />
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Paid Term</div>
              <strong style={{ color: '#0f172a' }}>
                {currentSub?.paid_until ? formatDate(currentSub.paid_until) : 'No active term'}
              </strong>
            </div>
          </div>

          <div style={{
            padding: '8px 14px',
            borderRadius: 10,
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12
          }}>
            <Zap size={16} color="#64748b" />
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Access Tier</div>
              <strong style={{ color: '#0f172a', textTransform: 'uppercase' }}>{currentSub?.effective_tier || 'None'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Choose Subscription Package Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 3px 0', color: '#0f172a' }}>
              Choose or Customize Your Plan
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Select duration directly on each plan card below. Extended terms qualify for up to 30% savings.
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

        {/* 3 Tier Selection Cards (Clean, Scannable & Dropdown directly on each card) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          
          {/* 1. STANDARD PLAN CARD */}
          {(() => {
            const isSelected = selectedPlan === 'standard';
            const cardCalc = calculateCardEstimate('standard');
            const isExpanded = expandedCard === 'standard';

            return (
              <div
                onClick={() => setSelectedPlan('standard')}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  padding: '24px 20px',
                  border: `2px solid ${isSelected ? '#2563eb' : '#e2e8f0'}`,
                  cursor: 'pointer',
                  position: 'relative',
                  boxShadow: isSelected ? '0 10px 28px -4px rgba(37, 99, 235, 0.16)' : '0 2px 8px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>Standard Plan</h3>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Core academic operations</div>
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                      SELECTED
                    </span>
                  )}
                </div>

                {/* Price Display */}
                <div style={{ margin: '10px 0 14px 0' }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>
                    {currency === 'USD' ? '$3.60' : 'Rs 1,000'}
                  </span>
                  <span style={{ fontSize: 13, color: '#64748b' }}> / student / mo</span>
                </div>

                {/* MONTH SELECTOR DROPDOWN ON CARD */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: isSelected ? '#f8fafc' : '#f8fafc',
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: '1px solid #e2e8f0',
                    marginBottom: 16
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Select Months
                    </span>
                    {currentPeriod.discount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', backgroundColor: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>
                        Save {currentPeriod.discount}%
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={billingMonths}
                      onChange={(e) => {
                        setBillingMonths(Number(e.target.value));
                        setSelectedPlan('standard');
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 28px 8px 10px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        appearance: 'none',
                        outline: 'none'
                      }}
                    >
                      {BILLING_PERIOD_OPTIONS.map((p) => (
                        <option key={p.months} value={p.months}>
                          {p.label} {p.discount > 0 ? `(-${p.discount}%)` : '(Standard)'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }} />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569' }}>
                    <span>Estimated For {cardCalc.count} Students:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {currency === 'USD' ? `$${cardCalc.net.toFixed(2)}` : `Rs ${Math.round(cardCalc.net).toLocaleString()}`}
                    </strong>
                  </div>
                </div>

                {/* Key Highlights (Decluttered - top 4 items) */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, flex: 1 }}>
                  {[
                    'Daily Class & Subject Attendance Tracking',
                    'Examinations, Grading Criteria & Result Cards',
                    'Master Timetables & Homework Assignments',
                    'Offline Fee Challans & Counter Receipts'
                  ].map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Check size={16} color="#059669" />
                      <span style={{ color: '#334155' }}>{item}</span>
                    </div>
                  ))}

                  {/* Expandable full list */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                      {[
                        'Student, Parent, Teacher & Principal Portals',
                        'CSV Directory Bulk Data Import',
                        'Standard Notice Circulars & Alerts'
                      ].map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Check size={15} color="#059669" />
                          <span style={{ color: '#64748b', fontSize: 12 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCard(isExpanded ? null : 'standard');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '4px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {isExpanded ? 'Hide additional features' : 'View all 7 included features'}
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {/* Selection Action Button */}
                <button
                  type="button"
                  onClick={() => setSelectedPlan('standard')}
                  style={{
                    marginTop: 16,
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: isSelected ? '#2563eb' : '#f1f5f9',
                    color: isSelected ? '#ffffff' : '#475569',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  {isSelected ? <CheckCircle size={15} /> : null}
                  {isSelected ? 'Standard Plan Selected' : 'Choose Standard'}
                </button>
              </div>
            );
          })()}

          {/* 2. PREMIUM PLAN CARD */}
          {(() => {
            const isSelected = selectedPlan === 'premium';
            const cardCalc = calculateCardEstimate('premium');
            const isExpanded = expandedCard === 'premium';

            return (
              <div
                onClick={() => setSelectedPlan('premium')}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  padding: '24px 20px',
                  border: `2px solid ${isSelected ? '#2563eb' : '#bfdbfe'}`,
                  cursor: 'pointer',
                  position: 'relative',
                  boxShadow: isSelected ? '0 12px 30px -4px rgba(37, 99, 235, 0.2)' : '0 4px 12px rgba(37, 99, 235, 0.06)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Most Popular Badge */}
                <div style={{
                  position: 'absolute',
                  top: -11,
                  right: 20,
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 12px',
                  borderRadius: 12,
                  letterSpacing: '0.04em'
                }}>
                  MOST POPULAR
                </div>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>Premium Plan</h3>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Full intelligence & governance</div>
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                      SELECTED
                    </span>
                  )}
                </div>

                {/* Price Display */}
                <div style={{ margin: '10px 0 14px 0' }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: '#2563eb', letterSpacing: '-0.03em' }}>
                    {currency === 'USD' ? '$7.20' : 'Rs 2,000'}
                  </span>
                  <span style={{ fontSize: 13, color: '#64748b' }}> / student / mo</span>
                </div>

                {/* MONTH SELECTOR DROPDOWN ON CARD */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: '#eff6ff',
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: '1px solid #bfdbfe',
                    marginBottom: 16
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Select Months
                    </span>
                    {currentPeriod.discount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#15803d', backgroundColor: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>
                        Save {currentPeriod.discount}%
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={billingMonths}
                      onChange={(e) => {
                        setBillingMonths(Number(e.target.value));
                        setSelectedPlan('premium');
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 28px 8px 10px',
                        borderRadius: 8,
                        border: '1px solid #93c5fd',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        appearance: 'none',
                        outline: 'none'
                      }}
                    >
                      {BILLING_PERIOD_OPTIONS.map((p) => (
                        <option key={p.months} value={p.months}>
                          {p.label} {p.discount > 0 ? `(-${p.discount}%)` : '(Standard)'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#2563eb' }} />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#1e3a8a' }}>
                    <span>Estimated For {cardCalc.count} Students:</span>
                    <strong style={{ color: '#1e40af' }}>
                      {currency === 'USD' ? `$${cardCalc.net.toFixed(2)}` : `Rs ${Math.round(cardCalc.net).toLocaleString()}`}
                    </strong>
                  </div>
                </div>

                {/* Key Highlights (Decluttered - top 4 items) */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, flex: 1 }}>
                  {[
                    'Everything in Standard Plan, plus:',
                    'Academic Quality Index (AQI) 5-Level Engine',
                    'Early Risk Detection & Student Attention Alerts',
                    'Double-Entry Financial Accounts Ledger & HR Payroll'
                  ].map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Check size={16} color={idx === 0 ? '#2563eb' : '#059669'} />
                      <span style={{ color: idx === 0 ? '#1d4ed8' : '#334155', fontWeight: idx === 0 ? 700 : 400 }}>
                        {item}
                      </span>
                    </div>
                  ))}

                  {/* Expandable full list */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                      {[
                        'Multi-Campus Governance & Benchmark Rankings',
                        'Psychological Evaluation & Development Profiles',
                        'Executive Cashflow & Financial Reporting Dashboard',
                        'Priority SLA Technical Support & Advanced PDF Exports'
                      ].map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Check size={15} color="#059669" />
                          <span style={{ color: '#64748b', fontSize: 12 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCard(isExpanded ? null : 'premium');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '4px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {isExpanded ? 'Hide additional features' : 'View all 8 included features'}
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {/* Selection Action Button */}
                <button
                  type="button"
                  onClick={() => setSelectedPlan('premium')}
                  style={{
                    marginTop: 16,
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: isSelected ? '#2563eb' : '#eff6ff',
                    color: isSelected ? '#ffffff' : '#2563eb',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  {isSelected ? <CheckCircle size={15} /> : null}
                  {isSelected ? 'Premium Plan Selected' : 'Choose Premium'}
                </button>
              </div>
            );
          })()}

          {/* 3. CUSTOM PACKAGE BUILDER CARD (Per student price: 0.7$) */}
          {(() => {
            const isSelected = selectedPlan === 'custom';
            const cardCalc = calculateCardEstimate('custom');
            const isExpanded = expandedCard === 'custom';

            return (
              <div
                onClick={() => setSelectedPlan('custom')}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  padding: '24px 20px',
                  border: `2px solid ${isSelected ? '#7c3aed' : '#e2e8f0'}`,
                  cursor: 'pointer',
                  position: 'relative',
                  boxShadow: isSelected ? '0 12px 30px -4px rgba(124, 58, 237, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Modular Badge */}
                <div style={{
                  position: 'absolute',
                  top: -11,
                  right: 20,
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 12px',
                  borderRadius: 12,
                  letterSpacing: '0.04em'
                }}>
                  FLEXIBLE
                </div>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sliders size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>Custom Package</h3>
                      <div style={{ fontSize: 11, color: '#64748b' }}>Tailored modular suite</div>
                    </div>
                  </div>
                  {isSelected && (
                    <span style={{ backgroundColor: '#f5f3ff', color: '#7c3aed', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                      SELECTED
                    </span>
                  )}
                </div>

                {/* Price Display (0.7$ / student / mo) */}
                <div style={{ margin: '10px 0 14px 0' }}>
                  <span style={{ fontSize: 32, fontWeight: 900, color: '#7c3aed', letterSpacing: '-0.03em' }}>
                    {currency === 'USD' ? `$${cardCalc.unit.toFixed(2)}` : `Rs ${cardCalc.unit}`}
                  </span>
                  <span style={{ fontSize: 13, color: '#64748b' }}> / student / mo</span>
                </div>

                {/* MONTH SELECTOR DROPDOWN ON CARD */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: '#f5f3ff',
                    borderRadius: 12,
                    padding: '12px 14px',
                    border: '1px solid #ddd6fe',
                    marginBottom: 16
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Select Months
                    </span>
                    {currentPeriod.discount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#15803d', backgroundColor: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>
                        Save {currentPeriod.discount}%
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={billingMonths}
                      onChange={(e) => {
                        setBillingMonths(Number(e.target.value));
                        setSelectedPlan('custom');
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 28px 8px 10px',
                        borderRadius: 8,
                        border: '1px solid #c4b5fd',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        appearance: 'none',
                        outline: 'none'
                      }}
                    >
                      {BILLING_PERIOD_OPTIONS.map((p) => (
                        <option key={p.months} value={p.months}>
                          {p.label} {p.discount > 0 ? `(-${p.discount}%)` : '(Standard)'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#7c3aed' }} />
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5b21b6' }}>
                    <span>Estimated For {customStudents} Students:</span>
                    <strong style={{ color: '#6d28d9' }}>
                      {currency === 'USD' ? `$${cardCalc.net.toFixed(2)}` : `Rs ${Math.round(cardCalc.net).toLocaleString()}`}
                    </strong>
                  </div>
                </div>

                {/* Key Highlights (Decluttered - top 4 items) */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, flex: 1 }}>
                  {[
                    `Base student price starting at ${currency === 'USD' ? '$0.70' : 'Rs 195'}/mo`,
                    `Custom headcount (${customStudents} students configured)`,
                    `${selectedFeatures.length} specific operational modules selected`,
                    `Volume savings up to 30% on multi-year terms`
                  ].map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Check size={16} color="#7c3aed" />
                      <span style={{ color: '#334155' }}>{item}</span>
                    </div>
                  ))}

                  {/* Expandable info */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                      {[
                        'Fine-grained module access governance',
                        'Real-time immediate DB activation',
                        'Official printable payment receipt'
                      ].map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Check size={15} color="#7c3aed" />
                          <span style={{ color: '#64748b', fontSize: 12 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCard(isExpanded ? null : 'custom');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#7c3aed',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '4px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    {isExpanded ? 'Hide configuration info' : 'View custom package details'}
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                {/* Selection Action Button */}
                <button
                  type="button"
                  onClick={() => setSelectedPlan('custom')}
                  style={{
                    marginTop: 16,
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: isSelected ? '#7c3aed' : '#f5f3ff',
                    color: isSelected ? '#ffffff' : '#7c3aed',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  {isSelected ? <CheckCircle size={15} /> : null}
                  {isSelected ? 'Configure Below' : 'Choose Custom'}
                </button>
              </div>
            );
          })()}

        </div>

        {/* 3. CUSTOM PACKAGE CONFIGURATOR (Rendered sleekly when 'custom' is selected) */}
        {selectedPlan === 'custom' && (
          <div style={{
            marginTop: 22,
            backgroundColor: '#ffffff',
            borderRadius: 16,
            padding: '24px 24px',
            border: '2px solid #ddd6fe',
            boxShadow: '0 4px 18px rgba(124, 58, 237, 0.08)'
          }}>
            {/* Configurator Header & Headcount Stepper */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px 0', color: '#5b21b6' }}>
                  Custom Package Builder
                </h3>
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                  Base price is <strong>{currency === 'USD' ? '$0.70' : 'Rs 195'}</strong> per student. Adjust headcount and pick modules.
                </p>
              </div>

              {/* Headcount Stepper & Presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Students:</span>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setCustomStudents(Math.max(10, customStudents - 25))}
                    style={{ padding: '6px 10px', background: '#f8fafc', border: 'none', cursor: 'pointer', color: '#475569' }}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={25000}
                    value={customStudents}
                    onChange={(e) => setCustomStudents(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{
                      width: 75,
                      padding: '6px 4px',
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 700,
                      textAlign: 'center',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setCustomStudents(customStudents + 25)}
                    style={{ padding: '6px 10px', background: '#f8fafc', border: 'none', cursor: 'pointer', color: '#475569' }}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Preset Headcount Chips */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {[50, 100, 250, 500, 1000].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setCustomStudents(count)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: `1px solid ${customStudents === count ? '#7c3aed' : '#e2e8f0'}`,
                        backgroundColor: customStudents === count ? '#7c3aed' : '#ffffff',
                        color: customStudents === count ? '#ffffff' : '#475569',
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

            {/* Quick Bundle Selection Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                Included Modules ({selectedFeatures.length} selected):
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => applyPresetBundle('all')}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd6fe', backgroundColor: '#f5f3ff', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetBundle('academics')}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Core Academics Only
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetBundle('finance_academic')}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Academics + Finance
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetBundle('clear')}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* 4 Categorized Module Selection Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
              {[
                { cat: 'academics', title: '📚 Academics & Portals' },
                { cat: 'analytics', title: '📈 Analytics & AQI' },
                { cat: 'finance', title: '💰 Finance & HR Payroll' },
                { cat: 'operations', title: '⚙️ Operations & Governance' },
              ].map(({ cat, title }) => {
                const catFeatures = CUSTOM_CATALOG_FEATURES.filter(f => f.category === cat);
                const allSelected = catFeatures.length > 0 && catFeatures.every(f => selectedFeatures.includes(f.key));
                const countSelected = catFeatures.filter(f => selectedFeatures.includes(f.key)).length;

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
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{title}</span>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{countSelected} of {catFeatures.length} active</div>
                      </div>
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                              cursor: 'pointer',
                              transition: 'all 0.1s ease'
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
                            <span style={{ fontSize: 10, color: isChecked ? '#7c3aed' : '#94a3b8', fontWeight: 600 }}>
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

        {/* 4. Live Calculation & Instant Real Activation / Checkout Bar */}
        <div style={{
          backgroundColor: '#0f172a',
          color: '#ffffff',
          borderRadius: 16,
          padding: '22px 26px',
          marginTop: 22,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 20,
          boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.25)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span style={{ color: '#38bdf8' }}>
                {selectedPlan === 'standard' ? 'Standard Plan' : selectedPlan === 'premium' ? 'Premium Plan' : 'Custom Package'}
              </span>
              <span>•</span>
              <span style={{ color: '#ffffff' }}>{pricing.studentCount} Students</span>
              <span>•</span>
              <span style={{ color: '#a78bfa' }}>{currentPeriod.label}</span>
            </div>

            <div style={{ fontSize: 13, marginTop: 4, color: '#cbd5e1' }}>
              {pricing.studentCount} students × {currency === 'USD' ? `$${pricing.unitPrice.toFixed(2)}` : `Rs ${pricing.unitPrice}`} / mo × {billingMonths} months
              {currentPeriod.discount > 0 && (
                <span style={{ color: '#4ade80', marginLeft: 6, fontWeight: 600 }}>
                  ({currentPeriod.discount}% term discount: -{currency === 'USD' ? `$${pricing.discount.toFixed(2)}` : `Rs ${pricing.discount.toLocaleString()}`})
                </span>
              )}
            </div>

            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4, color: '#ffffff' }}>
              Total Payable: {currency === 'USD' ? `$${pricing.net.toFixed(2)}` : `Rs ${pricing.net.toLocaleString()}`} {currency}
            </div>
          </div>

          {/* Action Buttons: Apply Real Activation + Card Checkout */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Real Instant Institutional Activation */}
            <button
              type="button"
              disabled={submittingOrder}
              onClick={handleDirectActivation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#059669',
                color: '#ffffff',
                padding: '13px 22px',
                borderRadius: 10,
                border: 'none',
                fontSize: 14,
                fontWeight: 800,
                cursor: submittingOrder ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)',
                transition: 'all 0.15s ease'
              }}
            >
              {submittingOrder ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Activating...</span>
                </>
              ) : (
                <>
                  <Zap size={16} />
                  <span>Apply & Activate Plan Now</span>
                </>
              )}
            </button>

            {/* Pay via Paddle Sandbox Checkout */}
            <button
              type="button"
              disabled={submittingOrder}
              onClick={handleStartCardPayment}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: selectedPlan === 'custom' ? '#7c3aed' : '#0f172a',
                color: '#ffffff',
                padding: '13px 22px',
                borderRadius: 10,
                border: 'none',
                fontSize: 14,
                fontWeight: 800,
                cursor: submittingOrder ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              <CreditCard size={16} />
              <span>Pay via Paddle Sandbox</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Order & Invoice History */}
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

        {orders.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No previous payment orders recorded.
          </div>
        ) : (
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
        )}
      </div>

      {/* Interactive Card Payment Modal */}
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
