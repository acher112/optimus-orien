import React, { useState } from 'react';
import {
  Check,
  X,
  Lock,
  Crown,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Building2,
  Zap,
  Users
} from 'lucide-react';
import { type User } from './api';
import { UpgradeCheckoutModal } from './UpgradeCheckoutModal';

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
  const [upgradeModal, setUpgradeModal] = useState<{
    isOpen: boolean;
    planCode: 'standard' | 'premium';
  }>({
    isOpen: false,
    planCode: 'standard'
  });

  // Rates per student per month
  const standardRate = currency === 'USD' ? '$3.60' : '₨ 1,000';
  const premiumRate = currency === 'USD' ? '$7.20' : '₨ 2,000';

  const handleOpenUpgrade = (planCode: 'standard' | 'premium') => {
    setUpgradeModal({
      isOpen: true,
      planCode
    });
  };

  const handleCheckoutSuccess = (orderNumber: string, planCode: 'standard' | 'premium') => {
    setUpgradeModal(prev => ({ ...prev, isOpen: false }));
    if (notify) {
      notify(`🎉 Payment verified for order #${orderNumber}! ${planCode === 'premium' ? 'Premium' : 'Standard'} plan activated successfully.`);
    }
    onPlanUpgraded(planCode);
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
            Choose your subscription tier below. You can start directly with the <strong>30-Day Free Trial</strong> to
            enroll unlimited students and configure your institution, or upgrade now to unlock Standard or Premium modules.
          </p>

          {/* Currency Controls */}
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
          </div>
        </div>

        {/* 3 Plans Grid: 30-Day Free Trial, Standard, Premium */}
        <div className="plan-selection-cards-grid">
          {/* 1. 30-DAY FREE TRIAL CARD */}
          <div className="plan-card plan-card-trial">
            <div className="plan-card-badge-row">
              <span className="plan-pill trial-pill">30-Day Free Trial</span>
            </div>

            <div className="plan-card-header">
              <h2>30-Day Trial</h2>
              <p className="plan-card-tagline">
                Enroll unlimited students for 30 days. No credit card required.
              </p>
              <div className="plan-card-price-box">
                <span className="price-val">{currency === 'USD' ? '$0' : '₨ 0'}</span>
                <span className="price-unit">/ 30-day free access</span>
              </div>
            </div>

            <div className="plan-card-cta">
              <button
                type="button"
                className="plan-cta-btn plan-btn-trial"
                onClick={onContinueTrial}
              >
                <span>Start 30-Day Free Trial</span>
                <ArrowRight size={17} />
              </button>
              <span className="plan-cta-subtext">
                Direct access • Add unlimited students during trial
              </span>
            </div>

            <div className="plan-card-divider" />

            <div className="plan-features-list">
              <div className="features-group-title">
                <CheckCircle2 size={14} className="group-icon-included" />
                <span>Included in 30-Day Trial</span>
              </div>
              <ul className="features-ul included-ul">
                <li><Check size={14} /> <strong>Unlimited Student Enrollment (30 Days)</strong></li>
                <li><Check size={14} /> Multi-Campus & Campus Setup</li>
                <li><Check size={14} /> Academic Years & Session Calendars</li>
                <li><Check size={14} /> Classroom Cohorts & Sections</li>
                <li><Check size={14} /> Subjects & Teacher Master</li>
                <li><Check size={14} /> Student Profiles & Directories</li>
                <li><Check size={14} /> Daily Classroom Attendance</li>
                <li><Check size={14} /> Campus Notices & Announcements</li>
                <li><Check size={14} /> Staff & Teacher Directory</li>
                <li><Check size={14} /> System Settings & Preferences</li>
              </ul>

              <div className="features-group-title group-disabled">
                <Lock size={14} className="group-icon-disabled" />
                <span>Disabled in Free Trial (Requires Upgrade)</span>
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
                  {standardRate}
                </span>
                <span className="price-unit">/ student / mo</span>
              </div>
            </div>

            <div className="plan-card-cta">
              <button
                type="button"
                className="plan-cta-btn plan-btn-standard"
                onClick={() => handleOpenUpgrade('standard')}
              >
                <Zap size={16} />
                <span>Upgrade to Standard</span>
              </button>
              <span className="plan-cta-subtext">
                Term discounts: 6 mo (5% OFF) · 1 yr (10% OFF)
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
                  {premiumRate}
                </span>
                <span className="price-unit">/ student / mo</span>
              </div>
            </div>

            <div className="plan-card-cta">
              <button
                type="button"
                className="plan-cta-btn plan-btn-premium"
                onClick={() => handleOpenUpgrade('premium')}
              >
                <Crown size={16} />
                <span>Upgrade to Premium</span>
              </button>
              <span className="plan-cta-subtext">
                Term discounts: 6 mo (5% OFF) · 1 yr (10% OFF)
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
        </div>
      </main>

      {/* Upgrade Checkout Modal */}
      <UpgradeCheckoutModal
        isOpen={upgradeModal.isOpen}
        planCode={upgradeModal.planCode}
        initialStudents={200}
        initialCurrency={currency}
        schoolId={activeCampusId}
        schoolName={user?.school_name || user?.organisation_name || 'Main Campus'}
        onSuccess={handleCheckoutSuccess}
        onClose={() => setUpgradeModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default RegistrationPlanSelection;
