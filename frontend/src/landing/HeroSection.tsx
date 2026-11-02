import React from 'react';
import VortexAnimation from './VortexAnimation';

interface HeroSectionProps {
  authenticated: boolean;
  locale: 'en' | 'ur';
  headline?: string;
  subtitle?: string;
}

export default function HeroSection({
  authenticated,
  locale,
  headline,
  subtitle,
}: HeroSectionProps) {
  const isUr = locale === 'ur';

  const defaultHeadline = isUr ? 'آپٹیمس اورین' : 'OPTIMUS ORIEN';
  const defaultSubtitle = isUr
    ? 'سکول کارکردگی انٹیلی جنس اور قبل از وقت رہنمائی۔ ایک پلیٹ فارم، مختلف زاویے۔'
    : 'School Performance Intelligence & Early Intervention. One platform, multiple perspectives.';

  const t = {
    signIn: isUr ? 'لاگ ان' : 'Sign in',
    register: isUr ? 'اپنا اسکول رجسٹر کریں' : 'Register your school',
    dashboard: isUr ? 'ڈیش بورڈ پر جائیں' : 'Go to dashboard',
  };

  return (
    <section id="masthead" className="hero-section">
      <VortexAnimation />
      <div className="hero-center-content">
        <h1 className="brand-logo-text">{headline || defaultHeadline}</h1>
        <p className="hero-subtitle">{subtitle || defaultSubtitle}</p>

        <div className="hero-cta-group">
          {authenticated ? (
            <a href="/app" className="btn-hero-primary">
              {t.dashboard}
            </a>
          ) : (
            <>
              <a href="/login?tab=register" className="btn-hero-primary">
                {t.register}
              </a>
              <a href="/login" className="btn-hero-secondary">
                {t.signIn}
              </a>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
