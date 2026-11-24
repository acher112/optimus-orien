import React from 'react';
import VortexAnimation from './VortexAnimation';

interface HeroSectionProps {
  authenticated: boolean;
  locale?: string;
  headline?: string;
  subtitle?: string;
}

export default function HeroSection({
  headline,
}: HeroSectionProps) {
  const defaultHeadline = 'OPTIMUS ORIEN';

  return (
    <section id="masthead" className="hero-section">
      <VortexAnimation />
      <div className="hero-center-content">
        <h1 className="brand-logo-text">{headline || defaultHeadline}</h1>
      </div>
    </section>
  );
}
