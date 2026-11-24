import React, { useEffect, useState } from 'react';
import { Search, Award, ArrowRight } from 'lucide-react';
import { request } from './api';
import { navigate } from './navigation';
import './landing/landing.css';

import LandingNavbar from './landing/LandingNavbar';
import HeroSection from './landing/HeroSection';
import FeaturesSection, { CoreFeatureItem } from './landing/FeaturesSection';
import RolesSection from './landing/RolesSection';
import PricingCarouselSection, { PlanItem } from './landing/PricingCarouselSection';
import PricingCalculatorSection from './landing/PricingCalculatorSection';
import FaqSection, { FaqItem } from './landing/FaqSection';
import WordmarkSection from './landing/WordmarkSection';
import FooterSection from './landing/FooterSection';
import ContactModal from './landing/ContactModal';

interface PublicHomeProps {
  authenticated: boolean;
}

interface LandingApiResponse {
  locale?: string;
  is_rtl: boolean;
  hero_slides: Array<{
    id: number;
    title: string;
    subtitle: string;
    image_url: string;
    mobile_image_url: string;
    cta_text: string;
    cta_link: string;
    sort_order: number;
  }>;
  core_features: CoreFeatureItem[];
  faqs: FaqItem[];
  plans: PlanItem[];
  settings: Record<string, string>;
}

export default function PublicHome({ authenticated }: PublicHomeProps) {
  const locale = 'en';

  const [landingData, setLandingData] = useState<LandingApiResponse | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Sync document direction and title
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
    document.title = 'Optimus Orien - School Performance Intelligence & Early Intervention';

    localStorage.setItem('optimus_landing_locale', 'en');

    // Fetch dynamic content from platform API
    request<LandingApiResponse>('public/landing/?locale=en')
      .then((data) => {
        if (data) {
          setLandingData(data);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch landing CMS content, using fallbacks:', err);
      });
  }, []);

  const toggleLocale = () => {};

  const handleSelectPlan = (planSlug: string) => {
    try {
      localStorage.setItem('optimus_trial_plan', planSlug);
    } catch (e) {
      // ignore
    }
    navigate(`/login?tab=register&plan=${encodeURIComponent(planSlug)}`);
  };

  const heroSlide = landingData?.hero_slides?.[0];
  const features = landingData?.core_features || [];
  const faqs = landingData?.faqs || [];
  const plans = landingData?.plans || [];

  return (
    <div className="landing-root" dir="ltr">
      {/* Navigation Bar */}
      <LandingNavbar
        authenticated={authenticated}
        locale={locale}
        onToggleLocale={toggleLocale}
        onOpenContact={() => setContactModalOpen(true)}
      />

      <main>
        {/* Section 1: Hero Masthead */}
        <HeroSection
          authenticated={authenticated}
          locale={locale}
          headline={heroSlide?.title}
          subtitle={heroSlide?.subtitle}
        />

        {/* Section 2: Core Features (6 features dark card) */}
        <FeaturesSection features={features} locale={locale} />

        {/* Section 4: Role-Based Experiences (CtaSection tabs) */}
        <RolesSection />

        {/* Section 6: Student-Based Pricing Carousel */}
        <PricingCarouselSection
          plans={plans}
          locale={locale}
          onSelectPlan={handleSelectPlan}
        />

        {/* Section 5: Interactive Pricing Calculator */}
        <PricingCalculatorSection
          plans={plans}
          locale={locale}
          onSelectPlan={handleSelectPlan}
          onOpenContact={() => setContactModalOpen(true)}
        />

        {/* "Find a School" Leaderboard Teaser (Relocated right before FAQ, clean white card) */}
        <section
          id="find-school-teaser"
          style={{
            width: 'calc(100% - 32px)',
            maxWidth: '1200px',
            margin: '40px auto 20px auto',
            padding: 0,
            position: 'relative',
            zIndex: 10,
            boxSizing: 'border-box'
          }}
        >
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            padding: 'clamp(24px, 3.5vw, 36px) clamp(20px, 3vw, 36px)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
            border: '1px solid #e2e8f0',
            color: '#0f172a',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px', marginBottom: '22px' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', color: '#0891b2', padding: '4px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px' }}>
                  <Award size={15} />
                  <span>PUBLIC CAMPUS LEADERBOARD</span>
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(1.5rem, 2.8vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: '#0f172a' }}>
                  Find Top Performing Campuses on Optimus Orien
                </h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: 'clamp(0.9rem, 1.1vw, 1rem)', maxWidth: '750px', lineHeight: 1.5 }}>
                  Parents and prospective families can discover registered institutions ranked by verified Academic Quality Index (AQI), curriculum boards, and facilities.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => navigate('/schools')}
                  style={{
                    background: 'var(--brand-primary, #06b6d4)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(6, 182, 212, 0.35)'
                  }}
                >
                  <span>Explore Full Leaderboard</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Compact Search Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/schools?search=${encodeURIComponent(searchQuery)}`);
              }}
              style={{
                display: 'flex',
                gap: '8px',
                background: '#f8fafc',
                padding: '6px 8px',
                borderRadius: '12px',
                border: '1.5px solid #e2e8f0',
                marginBottom: '16px',
                alignItems: 'center'
              }}
            >
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <Search size={18} color="#64748b" style={{ position: 'absolute', left: '12px' }} />
                <input
                  type="text"
                  placeholder="Search by school name, city (e.g. Lahore, Islamabad), or curriculum board..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#0f172a',
                    padding: '6px 12px 6px 38px',
                    fontSize: '0.92rem',
                    height: '34px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  background: 'var(--brand-primary, #06b6d4)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0 20px',
                  height: '34px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Search
              </button>
            </form>

            {/* Popular City Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
              <span style={{ color: '#64748b', fontWeight: 500 }}>Popular locations:</span>
              {['Lahore', 'Islamabad', 'Karachi', 'Rawalpindi', 'Faisalabad'].map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => navigate(`/schools?city=${city}`)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    color: '#475569',
                    padding: '4px 12px',
                    borderRadius: '100px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 500
                  }}
                >
                  {city}
                </button>
              ))}
              <a
                href="/schools/methodology"
                onClick={(e) => { e.preventDefault(); navigate('/schools/methodology'); }}
                style={{ marginLeft: 'auto', color: 'var(--brand-primary, #06b6d4)', textDecoration: 'underline', fontSize: '0.84rem', fontWeight: 600 }}
              >
                How We Compute Rankings
              </a>
            </div>
          </div>
        </section>

        {/* Section 6: Frequently Asked Questions */}
        <FaqSection faqs={faqs} locale={locale} />

        {/* Section 7: Giant Wordmark */}
        <WordmarkSection />
      </main>

      {/* Section 8: Footer */}
      <FooterSection
        authenticated={authenticated}
        locale={locale}
        onOpenContact={() => setContactModalOpen(true)}
      />

      {/* Contact Modal */}
      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        locale={locale}
      />
    </div>
  );
}
