import React, { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { PlanItem } from './PricingCarouselSection';

interface PricingCalculatorSectionProps {
  plans: PlanItem[];
  locale: 'en' | 'ur';
  onSelectPlan: (planSlug: string) => void;
  onOpenContact: () => void;
}

export default function PricingCalculatorSection({
  plans,
  locale,
  onSelectPlan,
  onOpenContact,
}: PricingCalculatorSectionProps) {
  const [studentCountStandard, setStudentCountStandard] = useState(250);
  const [studentCountPremium, setStudentCountPremium] = useState(250);
  const [currencyStandard, setCurrencyStandard] = useState<'USD' | 'PKR'>('USD');
  const [currencyPremium, setCurrencyPremium] = useState<'USD' | 'PKR'>('USD');

  const isUr = locale === 'ur';

  // Standard plan pricing
  const standardPlan = plans.find((p) => p.slug === 'standard');
  const standardUsd = parseFloat(standardPlan?.price_usd_per_student || '3.60');
  const standardPkr = parseFloat(standardPlan?.price_pkr_per_student || '499.00');

  // Premium plan pricing
  const premiumPlan = plans.find((p) => p.slug === 'premium');
  const premiumUsd = parseFloat(premiumPlan?.price_usd_per_student || '7.20');
  const premiumPkr = parseFloat(premiumPlan?.price_pkr_per_student || '999.00');

  const calcStandardTotal = () => {
    if (currencyStandard === 'PKR') {
      const tot = studentCountStandard * standardPkr;
      return `PKR ${tot.toLocaleString()}`;
    }
    const tot = studentCountStandard * standardUsd;
    return `$${tot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const calcPremiumTotal = () => {
    if (currencyPremium === 'PKR') {
      const tot = studentCountPremium * premiumPkr;
      return `PKR ${tot.toLocaleString()}`;
    }
    const tot = studentCountPremium * premiumUsd;
    return `$${tot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <section className="pricing-section">
      <div className="pricing-container">
        <div className="pricing-calc-header">
          <h2>{isUr ? 'انٹرایکٹو لاگت کا تخمینہ' : 'Investment Calculator'}</h2>
          <p style={{ color: '#6b7280', fontSize: '1.05rem', margin: 0 }}>
            {isUr
              ? 'اپنے اسکول کی طلباء کی تعداد کے مطابق ماہانہ سرمایہ کاری کا حساب لگائیں۔'
              : 'Estimate your monthly or annual investment based on your active student population.'}
          </p>
        </div>

        <div className="pricing-grid">
          {/* Standard Tier Card */}
          <div className="pricing-card">
            <span className="plan-label">{isUr ? 'اسٹینڈرڈ پلان' : 'Standard Tier'}</span>

            <div className="currency-toggle-wrapper">
              <span
                className={`toggle-label ${currencyStandard === 'USD' ? 'active' : ''}`}
                onClick={() => setCurrencyStandard('USD')}
              >
                USD
              </span>
              <button
                type="button"
                className={`ios-toggle ${currencyStandard === 'PKR' ? 'is-pkr' : ''}`}
                onClick={() => setCurrencyStandard(currencyStandard === 'USD' ? 'PKR' : 'USD')}
                aria-label="Toggle Standard Currency"
              >
                <span className="ios-toggle-thumb" />
              </button>
              <span
                className={`toggle-label ${currencyStandard === 'PKR' ? 'active' : ''}`}
                onClick={() => setCurrencyStandard('PKR')}
              >
                PKR
              </span>
            </div>

            <div className="price-display">
              <span className="price-amount">
                {currencyStandard === 'USD' ? `$${standardUsd.toFixed(2)}` : `${Math.round(standardPkr)} PKR`}
              </span>
              <span className="price-period">{isUr ? '/ طالب علم / ماہانہ' : '/ student / month'}</span>
            </div>

            <p style={{ fontSize: '0.95rem', color: '#52525b', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {isUr
                ? 'تمام بنیادی کرداروں کے پورٹل، حاضری ٹریکنگ اور اسکول کی عمومی کارکردگی کا جائزہ۔'
                : 'Includes full access to the intelligence suite, all role portals, campus benchmarking, and early intervention tools.'}
            </p>

            <div className="calculator-box">
              <div className="calc-header">
                <span style={{ fontWeight: 600 }}>
                  {isUr ? 'اسکول کی طلباء کی آبادی:' : 'Institutional Student Population:'}
                </span>
                <span style={{ fontWeight: 700 }}>
                  {studentCountStandard} {isUr ? 'طلباء' : 'Students'}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="5000"
                step="50"
                value={studentCountStandard}
                onChange={(e) => setStudentCountStandard(Number(e.target.value))}
                className="range-slider"
              />
              <div className="calc-footer">
                <span style={{ color: '#71717a' }}>
                  {isUr ? 'تخمینی ماہانہ سرمایہ کاری:' : 'Estimated Term Investment:'}
                </span>
                <span className="calc-total">{calcStandardTotal()}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: 'auto' }}>
              <button
                type="button"
                className="btn-select-plan"
                onClick={() => onSelectPlan('standard')}
              >
                <span>{isUr ? 'اسٹینڈرڈ کا انتخاب کریں' : 'Choose Standard Tier'}</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="btn-hero-secondary"
                style={{ justifyContent: 'center', fontSize: '0.9rem', padding: '0.65rem' }}
                onClick={onOpenContact}
              >
                {isUr ? 'ڈیمو بک کریں' : 'Book Standard Demo'}
              </button>
            </div>
          </div>

          {/* Premium Tier Card */}
          <div className="pricing-card" style={{ borderColor: 'var(--brand-purple-dark)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="plan-label">{isUr ? 'پریمیم پلان' : 'Premium Tier'}</span>
              <span
                style={{
                  background: 'var(--brand-purple-subtle)',
                  color: 'var(--brand-purple-dark)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '100px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <Sparkles size={12} />
                {isUr ? 'سب سے مقبول' : 'Most Popular'}
              </span>
            </div>

            <div className="currency-toggle-wrapper">
              <span
                className={`toggle-label ${currencyPremium === 'USD' ? 'active' : ''}`}
                onClick={() => setCurrencyPremium('USD')}
              >
                USD
              </span>
              <button
                type="button"
                className={`ios-toggle ${currencyPremium === 'PKR' ? 'is-pkr' : ''}`}
                onClick={() => setCurrencyPremium(currencyPremium === 'USD' ? 'PKR' : 'USD')}
                aria-label="Toggle Premium Currency"
              >
                <span className="ios-toggle-thumb" />
              </button>
              <span
                className={`toggle-label ${currencyPremium === 'PKR' ? 'active' : ''}`}
                onClick={() => setCurrencyPremium('PKR')}
              >
                PKR
              </span>
            </div>

            <div className="price-display">
              <span className="price-amount" style={{ color: 'var(--brand-purple-dark)' }}>
                {currencyPremium === 'USD' ? `$${premiumUsd.toFixed(2)}` : `${Math.round(premiumPkr)} PKR`}
              </span>
              <span className="price-period">{isUr ? '/ طالب علم / ماہانہ' : '/ student / month'}</span>
            </div>

            <p style={{ fontSize: '0.95rem', color: '#52525b', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {isUr
                ? 'قبل از وقت رہنمائی کا نظام، 5 سالہ ترقیاتی تجزیہ، تعلیمی معیار انڈیکس (AQI) اور خودکار الرٹس۔'
                : 'Advanced Performance Intelligence, Early Intervention System, 5-Year Analysis, AQI, and organization-wide governance.'}
            </p>

            <div className="calculator-box">
              <div className="calc-header">
                <span style={{ fontWeight: 600 }}>
                  {isUr ? 'اسکول کی طلباء کی آبادی:' : 'Institutional Student Population:'}
                </span>
                <span style={{ fontWeight: 700 }}>
                  {studentCountPremium} {isUr ? 'طلباء' : 'Students'}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="5000"
                step="50"
                value={studentCountPremium}
                onChange={(e) => setStudentCountPremium(Number(e.target.value))}
                className="range-slider"
              />
              <div className="calc-footer">
                <span style={{ color: '#71717a' }}>
                  {isUr ? 'تخمینی ماہانہ سرمایہ کاری:' : 'Estimated Term Investment:'}
                </span>
                <span className="calc-total">{calcPremiumTotal()}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: 'auto' }}>
              <button
                type="button"
                className="btn-select-plan"
                onClick={() => onSelectPlan('premium')}
              >
                <span>{isUr ? 'پریمیم کا انتخاب کریں' : 'Choose Premium Tier'}</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="btn-hero-secondary"
                style={{ justifyContent: 'center', fontSize: '0.9rem', padding: '0.65rem' }}
                onClick={onOpenContact}
              >
                {isUr ? 'ڈیمو بک کریں' : 'Book Premium Demo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
