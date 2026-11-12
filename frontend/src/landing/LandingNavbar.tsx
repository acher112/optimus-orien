import React, { useState, useEffect } from 'react';
import { navigate } from '../navigation';

interface LandingNavbarProps {
  authenticated: boolean;
  locale: 'en' | 'ur';
  onToggleLocale: () => void;
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
    home: locale === 'ur' ? 'ہوم' : 'Home',
    platform: locale === 'ur' ? 'پلیٹ فارم' : 'Platform',
    pricing: locale === 'ur' ? 'قیمتیں' : 'Pricing',
    faq: locale === 'ur' ? 'سوالات' : 'FAQ',
    contact: locale === 'ur' ? 'رابطہ' : 'Contact',
    signIn: locale === 'ur' ? 'لاگ ان' : 'Sign in',
    register: locale === 'ur' ? 'اپنا اسکول رجسٹر کریں' : 'Register your school',
    dashboard: locale === 'ur' ? 'ڈیش بورڈ پر جائیں' : 'Go to dashboard',
    langToggle: locale === 'ur' ? 'English' : 'اردو',
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
        <a href="#masthead" className="nav-brand" onClick={() => handleNavClick('masthead')}>
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
