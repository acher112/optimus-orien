import React, { useEffect, useState } from 'react';
import { Search, Award, ArrowRight } from 'lucide-react';
import { request } from './api';
import { navigate } from './navigation';
import './landing/landing.css';

import LandingNavbar from './landing/LandingNavbar';
import HeroSection from './landing/HeroSection';
import FeaturesSection, { CoreFeatureItem } from './landing/FeaturesSection';
import RolesSection from './landing/RolesSection';
import StepsSection from './landing/StepsSection';
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
      {/* Floating Animated Orbs */}
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

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

        {/* Section 1.5: "Find a School" Leaderboard Teaser */}
        <section style={{
          maxWidth: '1200px',
          margin: '-40px auto 60px',
          padding: '0 20px',
          position: 'relative',
          zIndex: 10
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
            borderRadius: '24px',
            padding: '36px 32px',
            boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#ffffff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px', marginBottom: '24px' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.4)', color: '#a5b4fc', padding: '4px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px' }}>
                  <Award size={14} />
                  <span>PUBLIC CAMPUS LEADERBOARD</span>
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Find Top Performing Campuses on Optimus Orien
                </h2>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', maxWidth: '600px', lineHeight: 1.5 }}>
                  Parents and prospective families can discover registered institutions ranked by verified Academic Quality Index (AQI), curriculum boards, and facilities.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => navigate('/schools')}
                  style={{
                    background: '#4f46e5',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4)'
                  }}
                >
                  <span>Explore Full Leaderboard</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Quick Search Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/schools?search=${encodeURIComponent(searchQuery)}`);
              }}
              style={{
                display: 'flex',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '8px',
                borderRadius: '16px',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                marginBottom: '20px'
              }}
            >
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: '16px' }} />
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
                    color: '#ffffff',
                    padding: '12px 16px 12px 48px',
                    fontSize: '0.95rem'
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Search
              </button>
            </form>

            {/* Popular City Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.84rem' }}>
              <span style={{ color: '#94a3b8' }}>Popular locations:</span>
              {['Lahore', 'Islamabad', 'Karachi', 'Rawalpindi', 'Faisalabad'].map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => navigate(`/schools?city=${city}`)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    color: '#e2e8f0',
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
                style={{ marginLeft: 'auto', color: '#a5b4fc', textDecoration: 'underline', fontSize: '0.82rem' }}
              >
                How We Compute Rankings
              </a>
            </div>
          </div>
        </section>

        {/* Section 2: Core Features (6 features dark card) */}
        <FeaturesSection features={features} locale={locale} />

        {/* Section 4: Role-Based Experiences (CtaSection tabs) */}
        <RolesSection />

        {/* Section 5: Simple for Schools Steps with Interactive Text Particle Scatter */}
        <StepsSection />

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
        locale={locale}
        onClose={() => setContactModalOpen(false)}
      />
    </div>
  );
}
