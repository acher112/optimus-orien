import React, { useEffect, useState } from 'react';
import { request } from './api';
import './landing/landing.css';

import LandingNavbar from './landing/LandingNavbar';
import HeroSection from './landing/HeroSection';
import FeaturesSection, { CoreFeatureItem } from './landing/FeaturesSection';
import RolesSection from './landing/RolesSection';
import StepsSection from './landing/StepsSection';
import ClientsSection from './landing/ClientsSection';
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
  locale: 'en' | 'ur';
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
  const [locale, setLocale] = useState<'en' | 'ur'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('optimus_landing_locale');
      if (saved === 'ur' || saved === 'en') return saved;
    }
    return 'en';
  });

  const [landingData, setLandingData] = useState<LandingApiResponse | null>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);

  useEffect(() => {
    // Sync document direction and title
    document.documentElement.dir = locale === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    document.title =
      locale === 'ur'
        ? 'آپٹیمس اورین - اسکول کارکردگی انٹیلی جنس اور قبل از وقت رہنمائی'
        : 'Optimus Orien - School Performance Intelligence & Early Intervention';

    localStorage.setItem('optimus_landing_locale', locale);

    // Fetch dynamic content from platform API
    request<LandingApiResponse>(`public/landing/?locale=${locale}`)
      .then((data) => {
        if (data) {
          setLandingData(data);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch landing CMS content, using fallbacks:', err);
      });
  }, [locale]);

  const toggleLocale = () => {
    setLocale((prev) => (prev === 'en' ? 'ur' : 'en'));
  };

  const handleSelectPlan = (planSlug: string) => {
    try {
      localStorage.setItem('optimus_trial_plan', planSlug);
    } catch (e) {
      // ignore
    }
    window.location.href = `/login?tab=register&plan=${encodeURIComponent(planSlug)}`;
  };

  const heroSlide = landingData?.hero_slides?.[0];
  const features = landingData?.core_features || [];
  const faqs = landingData?.faqs || [];
  const plans = landingData?.plans || [];

  return (
    <div className="landing-root" dir={locale === 'ur' ? 'rtl' : 'ltr'}>
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

        {/* Section 2: Clients Logo Infinite Loop */}
        <ClientsSection />

        {/* Section 3: Core Features (6 features dark card) */}
        <FeaturesSection features={features} locale={locale} />

        {/* Section 4: Role-Based Experiences (CtaSection tabs) */}
        <RolesSection locale={locale} />

        {/* Section 5: Simple for Schools Steps with Interactive Text Particle Scatter */}
        <StepsSection locale={locale} />

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
