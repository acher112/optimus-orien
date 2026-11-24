import React, { useState, useEffect } from 'react';
import { navigate } from '../navigation';

interface LandingNavbarProps {
  authenticated: boolean;
  locale?: string;
  onToggleLocale?: () => void;
  onOpenContact: () => void;
}

export default function LandingNavbar({
  authenticated,
  locale,
  onToggleLocale,
  onOpenContact,
}: LandingNavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrolled = window.scrollY > 20;
          setIsScrolled((prev) => (prev !== scrolled ? scrolled : prev));
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const t = {
    home: 'Home',
    platform: 'Platform',
    pricing: 'Pricing',
    faq: 'FAQ',
    contact: 'Contact',
    signIn: 'Sign in',
    register: 'Register your school',
    dashboard: 'Go to dashboard',
  };

  const handleNavClick = (id: string) => {
    closeMenu();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className={`landing-navbar ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="nav-container">
        <a href="#masthead" className="nav-brand" onClick={() => handleNavClick('masthead')} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <img src="/brand-logo.png" alt="Optimus Orien" className="brand-logo-img" style={{ width: 34, height: 34 }} />
          <span className="nav-brand-title">OPTIMUS <span>ORIEN</span></span>
        </a>

        {/* Mobile Hamburger Button */}
        <button
          className="hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-label="Toggle navigation menu"
        >
          <span className={menuOpen ? 'open' : ''} />
          <span className={menuOpen ? 'open' : ''} />
          <span className={menuOpen ? 'open' : ''} />
        </button>

        {/* Navigation Links and Auth Actions */}
        <div className={`nav-right ${menuOpen ? 'mobile-open' : ''}`}>
          <nav className="nav-links" aria-label="Main Navigation">
            <a href="#masthead" onClick={(e) => { e.preventDefault(); handleNavClick('masthead'); }}>
              {t.home}
            </a>
            <a href="#platform" onClick={(e) => { e.preventDefault(); handleNavClick('platform'); }}>
              {t.platform}
            </a>
            <a href="#pricing" onClick={(e) => { e.preventDefault(); handleNavClick('pricing'); }}>
              {t.pricing}
            </a>
            <a href="#faq" onClick={(e) => { e.preventDefault(); handleNavClick('faq'); }}>
              {t.faq}
            </a>
            <a
              href="/schools"
              onClick={(e) => {
                e.preventDefault();
                closeMenu();
                navigate('/schools');
              }}
            >
              Find a School
            </a>
            <a
              href="#contact"
              onClick={(e) => {
                e.preventDefault();
                closeMenu();
                onOpenContact();
              }}
            >
              {t.contact}
            </a>
          </nav>

          <div className="nav-auth-actions">
            {authenticated ? (
              <a
                href="/app"
                className="btn-nav-dashboard"
                onClick={(e) => {
                  e.preventDefault();
                  closeMenu();
                  navigate('/app');
                }}
              >
                {t.dashboard}
              </a>
            ) : (
              <>
                <a
                  href="/login"
                  className="btn-nav-signin"
                  onClick={(e) => {
                    e.preventDefault();
                    closeMenu();
                    navigate('/login');
                  }}
                >
                  {t.signIn}
                </a>
                <a
                  href="/login?tab=register"
                  className="btn-nav-register"
                  onClick={(e) => {
                    e.preventDefault();
                    closeMenu();
                    navigate('/login?tab=register');
                  }}
                >
                  {t.register}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
