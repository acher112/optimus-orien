import React, { useState } from 'react';
import {
  Check,
  X,
  Lock,
  Crown,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Building2,
  Zap,
  SlidersHorizontal
} from 'lucide-react';
import { request, type User } from './api';
import { SandboxCheckoutModal, type CheckoutOrderInfo } from './SandboxCheckoutModal';

interface RegistrationPlanSelectionProps {
  user: User;
  activeCampusId: number | null;
  onContinueTrial: () => void;
  onPlanUpgraded: (planCode: 'standard' | 'premium' | 'custom') => void;
  notify?: (msg: string) => void;
}

export const RegistrationPlanSelection: React.FC<RegistrationPlanSelectionProps> = ({
  user,
  activeCampusId,
  onContinueTrial,
  onPlanUpgraded,
  notify
}) => {
  const [currency, setCurrency] = useState<'USD' | 'PKR'>('USD');
  const [billingMonths, setBillingMonths] = useState<1 | 12>(1);
  const [submittingPlan, setSubmittingPlan] = useState<'standard' | 'premium' | 'custom' | null>(null);
  const [activeCheckoutOrder, setActiveCheckoutOrder] = useState<CheckoutOrderInfo | null>(null);
  const [error, setError] = useState<string>('');

  const discountRate = billingMonths === 12 ? 0.15 : 0;

  // Prices per student per month
  const standardMonthlyPrice = currency === 'USD' ? 3.6 : 1000;
  const premiumMonthlyPrice = currency === 'USD' ? 7.2 : 2000;
  const customMonthlyPrice = currency === 'USD' ? 0.70 : 195;

  const standardDisplayPrice = (
    standardMonthlyPrice * (1 - discountRate)
  ).toFixed(currency === 'USD' ? 2 : 0);

  const premiumDisplayPrice = (
    premiumMonthlyPrice * (1 - discountRate)
  ).toFixed(currency === 'USD' ? 2 : 0);

  const customDisplayPrice = (
    customMonthlyPrice * (1 - discountRate)
  ).toFixed(currency === 'USD' ? 2 : 0);

  const handleUpgrade = async (planCode: 'standard' | 'premium' | 'custom') => {
    try {
      setSubmittingPlan(planCode);
      setError('');

      const payload: Record<string, unknown> = {
        plan_code: planCode,
        billing_months: billingMonths,
        payment_method: 'card',
        currency: currency,
        custom_student_count: 50,
        student_count: 50,
      };

      if (planCode === 'custom') {
        payload.selected_features = [
          'attendance_daily',
          'marks_grading',
          'exams_datesheets',
          'result_cards',
          'timetable',
          'fees_offline',
          'accounts_ledger',
          'hr_payroll',
          'aqi',
          'students_at_risk'
        ];
      }

      if (activeCampusId) {
        payload.school_id = activeCampusId;
      }

      const res = await request<{
        message?: string;
        order?: {
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
        setActiveCheckoutOrder({
          id: res.order.id,
          order_number: res.order.order_number,
          plan_name: planCode === 'custom' ? 'Custom Package' : planCode === 'premium' ? 'Premium Plan' : 'Standard Plan',
          plan_code: planCode,
          amount: res.order.amount,
          currency: res.order.currency,
          billing_months: res.order.billing_months,
          student_count: res.order.student_count,
          school_name: user?.school_name || user?.organisation_name || 'Main Campus'
        });
      } else {
        throw new Error('Order creation did not return checkout details.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not initialize upgrade order';
      setError(msg);
      if (notify) notify(msg);
    } finally {
      setSubmittingPlan(null);
    }
  };

  const handleCheckoutSuccess = (orderNumber: string) => {
    const plan = (activeCheckoutOrder?.plan_code as 'standard' | 'premium' | 'custom') || 'standard';
    setActiveCheckoutOrder(null);
    if (notify) {
      notify(`🎉 Payment verified for order #${orderNumber}! Plan upgraded successfully.`);
    }
    onPlanUpgraded(plan);
  };

  return (
    <div className="plan-selection-page-wrap">
      {/* Top Navigation Banner */}
      <header className="plan-selection-top-bar">
        <div className="plan-selection-brand">
          <span className="brand-symbol">◈</span>
          <strong>optimus<span>orien</span></strong>
          <span className="plan-selection-step-tag">Step 2: Choose Plan</span>
        </div>
        <div className="plan-selection-top-user">
          <Building2 size={16} />
          <span>{user?.organisation_name || user?.school_name || 'New Institution'}</span>
        </div>
      </header>

      <main className="plan-selection-container">
        {/* Header & Subtitle */}
        <div className="plan-selection-header">
          <div className="plan-selection-kicker">
            <Sparkles size={16} /> INSTITUTION SETUP COMPLETE
          </div>
          <h1>Welcome to Optimus Orien, {user.first_name || 'Administrator'}!</h1>
          <p className="plan-selection-desc">
            Choose your subscription tier below. You can start directly with the <strong>Free Trial</strong> to
            test the portal with core features, or upgrade now to unlock Standard or Premium intelligence.
          </p>

          {/* Currency and Billing Period Controls */}
          <div className="plan-selection-controls">
            <div className="plan-toggle-group" role="group" aria-label="Currency Selection">
              <button
                type="button"
                className={`plan-toggle-btn ${currency === 'USD' ? 'active' : ''}`}
                onClick={() => setCurrency('USD')}
              >
                USD ($)
              </button>
              <button
                type="button"
                className={`plan-toggle-btn ${currency === 'PKR' ? 'active' : ''}`}
                onClick={() => setCurrency('PKR')}
              >
                PKR (₨)
              </button>
            </div>

            <div className="plan-toggle-group" role="group" aria-label="Billing Interval">
              <button
                type="button"
                className={`plan-toggle-btn ${billingMonths === 1 ? 'active' : ''}`}
                onClick={() => setBillingMonths(1)}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`plan-toggle-btn ${billingMonths === 12 ? 'active' : ''}`}
                onClick={() => setBillingMonths(12)}
              >
                Annual <span className="discount-pill">Save 15%</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="plan-selection-error-banner">
              {error}
            </div>
          )}
        </div>

        {/* 3 Plans Grid */}
        <div className="plan-selection-cards-grid">
          {/* 1. FREE TRIAL CARD */}
          <div className="plan-card plan-card-trial">
            <div className="plan-card-badge-row">
              <span className="plan-pill trial-pill">Free Trial</span>
            </div>

            <div className="plan-card-header">
              <h2>Free Trial</h2>
              <p className="plan-card-tagline">
                Direct access to portal. Standard & Premium features are marked with lock icons.
              </p>
              <div className="plan-card-price-box">
                <span className="price-val">{currency === 'USD' ? '$0' : '₨ 0'}</span>
                <span className="price-unit">/ free access</span>
              </div>
            </div>

            <div className="plan-card-cta">
              <button
                type="button"
                className="plan-cta-btn plan-btn-trial"
                onClick={onContinueTrial}
              >
                <span>Continue with Free Trial</span>
                <ArrowRight size={17} />
              </button>
              <span className="plan-cta-subtext">
                Direct access to portal • No credit card required
              </span>
            </div>

            <div className="plan-card-divider" />

            <div className="plan-features-list">
              <div className="features-group-title">
                <CheckCircle2 size={14} className="group-icon-included" />
                <span>Included in Free Trial</span>
              </div>
              <ul className="features-ul included-ul">
                <li><Check size={14} /> Multi-Campus & Campus Setup</li>
                <li><Check size={14} /> Academic Years & Session Calendars</li>
                <li><Check size={14} /> Classroom Cohorts & Sections</li>
                <li><Check size={14} /> Subjects & Teacher Master</li>
                <li><Check size={14} /> Student Directory & Profiles</li>
                <li><Check size={14} /> Daily Classroom Attendance</li>
                <li><Check size={14} /> Campus Notices & Announcements</li>
                <li><Check size={14} /> Staff & Teacher Directory</li>
                <li><Check size={14} /> System Settings & Preferences</li>
              </ul>

              <div className="features-group-title group-disabled">
                <Lock size={14} className="group-icon-disabled" />
                <span>Disabled in Free Trial (Locked)</span>
              </div>
              <ul className="features-ul disabled-ul">
                <li>
                  <X size={14} />
                  <span>Homework & Tasks</span>
                  <span className="nav-plan-badge standard" title="Requires Standard Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Examinations & Term Slips</span>
                  <span className="nav-plan-badge standard" title="Requires Standard Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Study Materials & Syllabus</span>
                  <span className="nav-plan-badge standard" title="Requires Standard Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Class Timetable Scheduling</span>
                  <span className="nav-plan-badge standard" title="Requires Standard Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Fee Challans & Collection</span>
                  <span className="nav-plan-badge standard" title="Requires Standard Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Staff Payroll & Salaries</span>
                  <span className="nav-plan-badge standard" title="Requires Standard Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Financial Accounts Ledger</span>
                  <span className="nav-plan-badge standard" title="Requires Standard Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Academic Quality Index (AQI)</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Psychological Evaluations</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Students at Risk & Interventions</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Security Audit Logs</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* 2. STANDARD PLAN CARD */}
          <div className="plan-card plan-card-standard">
            <div className="plan-card-badge-row">
              <span className="plan-pill standard-pill">
                <Crown size={12} className="crown-icon" /> Standard Plan
              </span>
            </div>

            <div className="plan-card-header">
              <h2>Standard</h2>
              <p className="plan-card-tagline">
                Core operational automation for teaching, fees, exams, and HR payroll.
              </p>
              <div className="plan-card-price-box">
                <span className="price-val">
                  {currency === 'USD' ? `$${standardDisplayPrice}` : `₨ ${standardDisplayPrice}`}
                </span>
                <span className="price-unit">/ student / mo</span>
              </div>
            </div>

            <div className="plan-card-cta">
              <button
                type="button"
                className="plan-cta-btn plan-btn-standard"
                disabled={submittingPlan === 'standard'}
                onClick={() => handleUpgrade('standard')}
              >
                {submittingPlan === 'standard' ? (
                  <span>Preparing order…</span>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>Upgrade to Standard</span>
                  </>
                )}
              </button>
              <span className="plan-cta-subtext">
                Instant activation via secure card checkout
              </span>
            </div>

            <div className="plan-card-divider" />

            <div className="plan-features-list">
              <div className="features-group-title">
                <CheckCircle2 size={14} className="group-icon-included" />
                <span>Everything in Free Trial, plus:</span>
              </div>
              <ul className="features-ul included-ul">
                <li><Check size={14} /> Homework & Assignment Tracking</li>
                <li><Check size={14} /> Examinations, Datesheets & Term Slips</li>
                <li><Check size={14} /> Study Materials Repository</li>
                <li><Check size={14} /> Class Timetable Scheduling</li>
                <li><Check size={14} /> Fee Vouchers, Challans & Receipts</li>
                <li><Check size={14} /> Staff Payroll & Salary Management</li>
                <li><Check size={14} /> Accounts Ledger & Expense Tracking</li>
                <li><Check size={14} /> Bulk Excel/CSV Data Import</li>
                <li><Check size={14} /> Campus Broadcast Messaging</li>
                <li><Check size={14} /> Standard Formatted PDF & CSV Reports</li>
              </ul>

              <div className="features-group-title group-disabled">
                <Lock size={14} className="group-icon-disabled" />
                <span>Disabled in Standard (Requires Premium)</span>
              </div>
              <ul className="features-ul disabled-ul">
                <li>
                  <X size={14} />
                  <span>Academic Quality Index (AQI)</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Psychological Evaluation & Wellbeing</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Students at Risk & Early Intervention</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Case Review Workflows & Tracking</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
                <li>
                  <X size={14} />
                  <span>Security Audit Log Viewer</span>
                  <span className="nav-plan-badge premium" title="Requires Premium Plan">
                    <Crown size={10} className="crown-icon" />
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* 3. PREMIUM PLAN CARD */}
          <div className="plan-card plan-card-premium featured-card">
            <div className="plan-card-badge-row">
              <span className="plan-pill premium-pill">
                <Sparkles size={12} /> Recommended • All Features Unlocked
              </span>
            </div>

            <div className="plan-card-header">
              <h2>Premium</h2>
              <p className="plan-card-tagline">
                Comprehensive AI intelligence, predictive risk alerts & psychological analytics.
              </p>
              <div className="plan-card-price-box">
                <span className="price-val">
                  {currency === 'USD' ? `$${premiumDisplayPrice}` : `₨ ${premiumDisplayPrice}`}
                </span>
                <span className="price-unit">/ student / mo</span>
              </div>
            </div>

            <div className="plan-card-cta">
              <button
                type="button"
                className="plan-cta-btn plan-btn-premium"
                disabled={submittingPlan === 'premium'}
                onClick={() => handleUpgrade('premium')}
              >
                {submittingPlan === 'premium' ? (
                  <span>Preparing order…</span>
                ) : (
                  <>
                    <Crown size={16} />
                    <span>Upgrade to Premium</span>
                  </>
                )}
              </button>
              <span className="plan-cta-subtext">
                Full access to every AI and administrative module
              </span>
            </div>

            <div className="plan-card-divider" />

            <div className="plan-features-list">
              <div className="features-group-title">
                <CheckCircle2 size={14} className="group-icon-included" />
                <span>Everything in Standard, plus:</span>
              </div>
              <ul className="features-ul included-ul premium-highlight-ul">
                <li><Check size={14} /> <strong>Academic Quality Index (AQI) Engine</strong></li>
                <li><Check size={14} /> <strong>Psychological Evaluation & Wellbeing Profiles</strong></li>
                <li><Check size={14} /> <strong>Students at Risk AI & Early Warning Indicators</strong></li>
                <li><Check size={14} /> <strong>Case Review Workflows & Intervention Management</strong></li>
                <li><Check size={14} /> <strong>Longitudinal 5-Year Academic Progress</strong></li>
                <li><Check size={14} /> <strong>Multi-Campus Governance & Cross-Branch Comparisons</strong></li>
                <li><Check size={14} /> <strong>Instructional Insights & Teacher Evaluations</strong></li>
                <li><Check size={14} /> <strong>Security Audit Log Viewer & Compliance Trails</strong></li>
                <li><Check size={14} /> <strong>Interactive Cashflow Analytics & Salary Exports</strong></li>
                <li><Check size={14} /> <strong>Custom Role Permissions & Security Policies</strong></li>
                <li><Check size={14} /> <strong>Priority 24/7 SLA Technical Support</strong></li>
              </ul>

              <div className="features-group-title group-all-unlocked">
                <Sparkles size={14} color="#f59e0b" />
                <span>Zero Locked Features (100% Unlocked)</span>
              </div>
            </div>
          </div>

          {/* 4. CUSTOM PLAN CARD */}
          <div className="plan-card plan-card-custom">
            <div className="plan-card-badge-row">
              <span className="plan-pill custom-pill">
                <SlidersHorizontal size={12} /> Custom / Modular
              </span>
            </div>

            <div className="plan-card-header">
              <h2>Custom</h2>
              <p className="plan-card-tagline">
                Tailor exact modules, multi-campus volume & institutional terms.
              </p>
              <div className="plan-card-price-box">
                <span className="price-val">
                  {currency === 'USD' ? `$${customDisplayPrice}` : `₨ ${customDisplayPrice}`}
                </span>
                <span className="price-unit">/ student / mo</span>
              </div>
            </div>

            <div className="plan-card-cta">
              <button
                type="button"
                className="plan-cta-btn plan-btn-custom"
                disabled={submittingPlan === 'custom'}
                onClick={() => handleUpgrade('custom')}
              >
                {submittingPlan === 'custom' ? (
                  <span>Preparing order…</span>
                ) : (
                  <>
                    <SlidersHorizontal size={16} />
                    <span>Choose Custom Plan</span>
                  </>
                )}
              </button>
              <span className="plan-cta-subtext">
                Modular package with flexible student seat allocation
              </span>
            </div>

            <div className="plan-card-divider" />

            <div className="plan-features-list">
              <div className="features-group-title">
                <CheckCircle2 size={14} className="group-icon-included" />
                <span>Tailored Modular Inclusions:</span>
              </div>
              <ul className="features-ul included-ul custom-highlight-ul">
                <li><Check size={14} /> <strong>Pick &amp; Mix Any Modules</strong> (Academics, Finance, AI)</li>
                <li><Check size={14} /> <strong>Multi-Campus Volume Scaling</strong> &amp; Branch Pooling</li>
                <li><Check size={14} /> <strong>Flexible Headcount</strong> (Add/remove student seats)</li>
                <li><Check size={14} /> <strong>Double-Entry Ledger &amp; HR Payroll</strong> Add-ons</li>
                <li><Check size={14} /> <strong>Academic Quality Index (AQI)</strong> Add-on</li>
                <li><Check size={14} /> <strong>Custom Billing Terms</strong> (Monthly, Annual, Multi-year)</li>
                <li><Check size={14} /> <strong>Institution Onboarding &amp; Dedicated Support</strong></li>
              </ul>

              <div className="features-group-title group-all-unlocked custom-unlocked-title">
                <SlidersHorizontal size={14} color="#7c3aed" />
                <span>100% Modular &amp; Customizable</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sandbox Checkout Modal for Instant Upgrade */}
      {activeCheckoutOrder && (
        <SandboxCheckoutModal
          order={activeCheckoutOrder}
          onSuccess={handleCheckoutSuccess}
          onClose={() => setActiveCheckoutOrder(null)}
        />
      )}
    </div>
  );
};

export default RegistrationPlanSelection;
