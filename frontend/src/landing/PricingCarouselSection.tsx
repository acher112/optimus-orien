import React, { useState } from 'react';
import SingleVortexAnimation from './SingleVortexAnimation';

export interface PlanItem {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  price_usd_per_student: string;
  price_pkr_per_student: string;
  interval: string;
  trial_days: number;
  features: string[];
  is_featured: boolean;
  sort_order: number;
}

interface PricingCarouselSectionProps {
  plans: PlanItem[];
  locale: 'en' | 'ur';
  onSelectPlan: (planSlug: string) => void;
}

export default function PricingCarouselSection({
  plans,
  locale,
  onSelectPlan,
}: PricingCarouselSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [currency, setCurrency] = useState<'USD' | 'PKR'>('USD');
  const isUr = locale === 'ur';

  const defaultPlans: PlanItem[] = [
    {
      id: 1,
      name: isUr ? 'اسٹینڈرڈ پلان' : 'Standard Tier',
      slug: 'standard',
      tagline: isUr ? 'بنیادی کارکردگی کا انتظام' : 'Essential Performance Management',
      description: isUr
        ? 'بنیادی تجزیاتی ٹولز، تمام کرداروں کے پورٹل اور حاضری و کارکردگی کا مکمل انتظام۔'
        : 'Includes full access to the intelligence suite, core role portals, campus benchmarking, and early intervention tools.',
      price_usd_per_student: '3.60',
      price_pkr_per_student: '499.00',
      interval: 'monthly',
      trial_days: 30,
      features: isUr
        ? [
            'طلباء کے پروفائل',
            'نمبر اور جائزے',
            'حاضری کا نظام',
            'ٹیچر پورٹل',
            'سٹوڈنٹ پورٹل',
            'پرنسپل ڈیش بورڈ',
            'کلاس اور مضمون کی کارکردگی',
            'بنیادی رپورٹس',
            'ترقی کے رجحانات',
          ]
        : [
            'Student Profiles',
            'Marks & Assessments',
            'Attendance Tracking',
            'Teacher Portal',
            'Student Portal',
            'Principal Dashboard',
            'Class & Subject Performance',
            'Basic Reports',
            'Performance Trends',
          ],
      is_featured: false,
      sort_order: 1,
    },
    {
      id: 2,
      name: isUr ? 'پریمیم پلان' : 'Premium Tier',
      slug: 'premium',
      tagline: isUr ? 'جامع اور جدید تجزیاتی نظام' : 'Advanced Performance Intelligence',
      description: isUr
        ? 'اسٹینڈرڈ کی تمام خصوصیات کے ساتھ قبل از وقت رہنمائی، تعلیمی معیار انڈیکس (AQI) اور 5 سالہ ترقیاتی تجزیہ۔'
        : 'Everything in Standard, plus Early Intervention System, Academic Quality Index (AQI), 5-year longitudinal analysis, and multi-campus governance.',
      price_usd_per_student: '7.20',
      price_pkr_per_student: '999.00',
      interval: 'monthly',
      trial_days: 30,
      features: isUr
        ? [
            'اسٹینڈرڈ کی تمام خصوصیات',
            'قبل از وقت رہنمائی کا نظام',
            'توجہ طلب طلباء کے اشاریے',
            'خودکار الرٹس اور اطلاعات',
            'تعلیمی معیار انڈیکس (AQI)',
            'اعلیٰ سطحی تجزیات',
            '5 سالہ تقابلی جائزہ',
            'کلاس انٹیلی جنس',
            'اساتذہ کی کارکردگی کے مشاہدات',
            'برانچوں کا موازنہ',
            'مرکزی تنظیمی ڈیش بورڈ',
            'اقدامات کی نگرانی',
            'تفصیلی برآمدی رپورٹس',
          ]
        : [
            'Everything in Standard',
            'Early Intervention System',
            'Student Attention Indicators',
            'Automated Alerts & Notifications',
            'Academic Quality Index (AQI)',
            'Advanced Analytics',
            '5-Year Performance Analysis',
            'Advanced Class Intelligence',
            'Teacher Performance Insights',
            'School & Branch Comparison',
            'Organization-Wide Dashboard',
            'Intervention Tracking',
            'Advanced Reports',
          ],
      is_featured: true,
      sort_order: 2,
    },
  ];

  const displayPlans = plans && plans.length > 0 ? plans : defaultPlans;

  const getCardStyle = (index: number) => {
    const n = displayPlans.length;
    let diff = (index - activeIndex) % n;
    if (diff > Math.floor(n / 2)) diff -= n;
    if (diff < -Math.floor(n / 2)) diff += n;

    let translateX = 0;
    let scale = 1;
    let opacity = 1;
    let zIndex = 10;
    let pointerEvents: 'auto' | 'none' = 'auto';

    if (diff === 0) {
      translateX = 0;
      scale = 1;
      zIndex = 10;
      opacity = 1;
    } else if (diff === -1) {
      translateX = -15;
      scale = 0.92;
      zIndex = 5;
      opacity = 0.65;
    } else if (diff === 1) {
      translateX = 15;
      scale = 0.92;
      zIndex = 5;
      opacity = 0.65;
    } else {
      translateX = 0;
      scale = 0.8;
      zIndex = 1;
      opacity = 0;
      pointerEvents = 'none';
    }

    return {
      '--translate-x': `${translateX}%`,
      '--scale': scale,
      zIndex,
      opacity,
      pointerEvents,
      '--accent': '#9b51e0',
    } as React.CSSProperties;
  };

  return (
    <section id="pricing" className="stories-section">
      <div className="pricing-title-block">
        <SingleVortexAnimation color="#FFD400" scale={0.9} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="pricing-headline">
            {isUr ? 'طلباء کی تعداد کے لحاظ سے قیمتیں' : 'Student-Based Pricing'}
          </h2>
          <p className="pricing-subhead">
            {isUr
              ? '3 روزہ اعزازی رسائی حاصل کریں۔ بغیر کسی ادائیگی اور پیشگی فیس کے تمام پریمیم خصوصیات کا تجربہ کریں۔'
              : 'Experience full platform access with a 3-day complimentary trial. Explore all Premium features with 3 days of complimentary access. No upfront payment required to get started.'}
          </p>

          {/* Quick Currency Selector */}
          <div className="currency-toggle-wrapper" style={{ marginTop: '1.5rem' }}>
            <span
              className={`toggle-label ${currency === 'USD' ? 'active' : ''}`}
              onClick={() => setCurrency('USD')}
            >
              USD ($)
            </span>
            <button
              type="button"
              className={`ios-toggle ${currency === 'PKR' ? 'is-pkr' : ''}`}
              onClick={() => setCurrency(currency === 'USD' ? 'PKR' : 'USD')}
              aria-label="Toggle currency between USD and PKR"
            >
              <span className="ios-toggle-thumb" />
            </button>
            <span
              className={`toggle-label ${currency === 'PKR' ? 'active' : ''}`}
              onClick={() => setCurrency('PKR')}
            >
              PKR (Rs)
            </span>
          </div>
        </div>
      </div>

      <div className="stories-carousel-container">
        {displayPlans.map((plan, index) => {
          const isActive = index === activeIndex;
          const price =
            currency === 'USD'
              ? `$${parseFloat(plan.price_usd_per_student).toFixed(2)}`
              : `${Math.round(parseFloat(plan.price_pkr_per_student))} PKR`;

          return (
            <div
              key={plan.slug || index}
              className={`story-card ${isActive ? 'is-active' : ''}`}
              style={getCardStyle(index)}
              onClick={() => setActiveIndex(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveIndex(index);
                }
              }}
              aria-label={`View ${plan.name}`}
            >
              <div>
                <span className="pricing-badge">{plan.name}</span>
                <div className="pricing-price-row">
                  <span className="pricing-amount">{price}</span>
                  <span className="pricing-period">
                    {isUr ? '/ فی طالب علم / ماہانہ' : '/ student / month'}
                  </span>
                </div>
                <p style={{ fontWeight: 600, color: '#111', marginBottom: '0.5rem' }}>
                  {plan.tagline}
                </p>
                <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '1rem' }}>
                  {plan.description}
                </p>
              </div>

              <ul className="features-list-2col">
                {plan.features.slice(0, 10).map((feat, idx) => (
                  <li key={idx}>{feat}</li>
                ))}
              </ul>

              <button
                type="button"
                className="btn-select-plan"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPlan(plan.slug);
                }}
              >
                {isUr
                  ? `رجسٹریشن شروع کریں (${plan.name})`
                  : `Get Started with ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
