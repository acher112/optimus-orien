import React from 'react';
import VortexAnimation from './VortexAnimation';
import { navigate } from '../navigation';

interface HeroSectionProps {
  authenticated: boolean;
  locale?: string;
  headline?: string;
  subtitle?: string;
}

export default function HeroSection({
  authenticated,
  locale,
  headline,
  subtitle,
}: HeroSectionProps) {
  const defaultHeadline = 'OPTIMUS ORIEN';
  const defaultSubtitle = 'School Performance Intelligence & Early Intervention. One platform, multiple perspectives.';

  const t = {
    signIn: 'Sign in',
    register: 'Register your school',
    dashboard: 'Go to dashboard',
  };

  return (
    <section id="masthead" className="hero-section">
      <VortexAnimation />
      <div className="hero-center-content">
        <h1 className="brand-logo-text">{headline || defaultHeadline}</h1>

        <div className="hero-cta-group">
          {authenticated ? (
            <a
              href="/app"
              className="btn-hero-primary"
              onClick={(e) => {
                e.preventDefault();
                navigate('/app');
              }}
            >
              {t.dashboard}
            </a>
          ) : (
            <>
              <a
                href="/login?tab=register"
                className="btn-hero-primary"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/login?tab=register');
                }}
              >
                {t.register}
              </a>
              <a
                href="/login"
                className="btn-hero-secondary"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/login');
                }}
              >
                {t.signIn}
              </a>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
