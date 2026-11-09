import React from 'react';
import { Crown, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

interface FeatureLockedScreenProps {
  featureName: string;
  description: string;
  requiredPlan?: string;
  onUpgrade: () => void;
  featuresIncluded?: string[];
}

export const FeatureLockedScreen: React.FC<FeatureLockedScreenProps> = ({
  featureName,
  description,
  requiredPlan = 'Premium',
  onUpgrade,
  featuresIncluded = [
    'Academic Quality Index (AQI) 5-level hierarchy',
    'Student Risk Indicators & Early Warning Interventions',
    'Staff Salaries, Adjustments & Automated Payroll Generation',
    'Multi-Campus Benchmarking & Aggregations',
    'Comprehensive Accounts Ledger & Finance Dashboard',
    'Audit Trail Viewer & Compliance Activity Logs'
  ]
}) => {
  const isStandard = requiredPlan?.toLowerCase() === 'standard';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '65vh',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: 640,
        width: '100%',
        backgroundColor: 'var(--card-bg, #ffffff)',
        borderRadius: 16,
        padding: '36px 32px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
        border: '1px solid var(--border-color, #e2e8f0)',
        textAlign: 'center'
      }}>
        {/* Crown Icon Badge */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          backgroundColor: isStandard ? '#eff6ff' : '#fef3c7',
          color: isStandard ? '#2563eb' : '#d97706',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px auto',
          boxShadow: isStandard ? '0 4px 14px rgba(37,99,235,0.12)' : '0 4px 14px rgba(217,119,6,0.18)'
        }}>
          <Crown size={36} style={{ fill: isStandard ? '#93c5fd' : '#f59e0b' }} />
        </div>

        {/* Plan Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: isStandard ? '#eff6ff' : '#fef3c7',
          color: isStandard ? '#2563eb' : '#92400e',
          border: isStandard ? '1px solid #bfdbfe' : '1px solid #fde68a',
          padding: '4px 14px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 16
        }}>
          <Crown size={14} style={{ color: isStandard ? '#2563eb' : '#d97706', fill: isStandard ? '#93c5fd' : '#f59e0b' }} />
          {requiredPlan} Plan Feature
        </div>

        {/* Title */}
        <h2 style={{
          fontSize: 24,
          fontWeight: 800,
          margin: '0 0 10px 0',
          color: 'var(--text-primary, #0f172a)'
        }}>
          {featureName} is Locked
        </h2>

        {/* Description */}
        <p style={{
          fontSize: 15,
          color: 'var(--text-secondary, #64748b)',
          lineHeight: 1.6,
          margin: '0 0 28px 0'
        }}>
          {description}
        </p>

        {/* Feature List Preview */}
        <div style={{
          backgroundColor: 'var(--bg-secondary, #f8fafc)',
          borderRadius: 12,
          padding: '18px 20px',
          textAlign: 'left',
          marginBottom: 28,
          border: '1px solid var(--border-color, #e2e8f0)'
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #1e293b)', marginBottom: 12 }}>
            Unlocks with the {requiredPlan} Plan:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {featuresIncluded.slice(0, 4).map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary, #475569)' }}>
                <ShieldCheck size={16} color="#10b981" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onUpgrade}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            backgroundColor: '#2563eb',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 15,
            padding: '12px 28px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
        >
          <span>Upgrade to {requiredPlan} Plan</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default FeatureLockedScreen;
