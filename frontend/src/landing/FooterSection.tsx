import React from 'react';

interface FooterSectionProps {
  authenticated: boolean;
  locale: 'en' | 'ur';
  onOpenContact: () => void;
}

export default function FooterSection({
  authenticated,
  locale,
  onOpenContact,
}: FooterSectionProps) {
  const isUr = locale === 'ur';

  const t = {
    brandTagline: isUr
      ? 'سکول کارکردگی انٹیلی جنس اور قبل از وقت رہنمائی کا جدید نظام۔'
      : 'School Performance Intelligence & Early Intervention',
    platform: isUr ? 'پلیٹ فارم' : 'Platform',
    portals: isUr ? 'پورٹلز' : 'Portals',
    company: isUr ? 'کمپنی' : 'Company',
    contact: isUr ? 'رابطہ' : 'Contact',
    signIn: isUr ? 'لاگ ان' : 'Sign in',
    register: isUr ? 'اسکول رجسٹر کریں' : 'Register your school',
    dashboard: isUr ? 'ڈیش بورڈ پر جائیں' : 'Go to dashboard',
    requestAccess: isUr ? 'رسائی کی درخواست' : 'Request Access',
    contactUs: isUr ? 'ہم سے رابطہ کریں' : 'Contact Us',
    about: isUr ? 'ہمارے بارے میں' : 'About',
    privacy: isUr ? 'پرائیویسی پالیسی' : 'Privacy Policy',
    terms: isUr ? 'استعمال کی شرائط' : 'Terms of Service',
    copyright: isUr
      ? '© 2026 آپٹیمس اورین۔ جملہ حقوق محفوظ ہیں۔'
      : '© 2026 Optimus Orien. All rights reserved.',
  };

  const handleLinkClick = (path: string, e: React.MouseEvent) => {
    e.preventDefault();
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="site-footer">
      {/* Floating Vertical Nominee Badge */}
      <div className="nominee-badge">
        <span>Optimus Orien</span>
      </div>

      <div className="footer-container">
        <div className="footer-grid">
          {/* Brand Info & Buttons */}
          <div>
            <h2 className="footer-brand">OPTIMUS ORIEN</h2>
            <p className="footer-desc">{t.brandTagline}</p>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              {authenticated ? (
                <a
                  href="/app"
                  className="btn-nav-dashboard"
                  onClick={(e) => handleLinkClick('/app', e)}
                >
                  {t.dashboard}
                </a>
              ) : (
                <>
                  <a
                    href="/login"
                    className="btn-nav-signin"
                    onClick={(e) => handleLinkClick('/login', e)}
                  >
                    {t.signIn}
                  </a>
                  <a
                    href="/login?tab=register"
                    className="btn-nav-register"
                    onClick={(e) => handleLinkClick('/login?tab=register', e)}
                  >
                    {t.register}
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Platform Capabilities */}
          <div>
            <h3 className="col-title">{t.platform}</h3>
            <ul className="footer-links">
              <li>
                <a href="/platform/academic-performance" onClick={(e) => handleLinkClick('/platform/academic-performance', e)}>
                  Academic Performance
                </a>
              </li>
              <li>
                <a href="/platform/attendance" onClick={(e) => handleLinkClick('/platform/attendance', e)}>
                  Attendance
                </a>
              </li>
              <li>
                <a href="/platform/skills-assessment" onClick={(e) => handleLinkClick('/platform/skills-assessment', e)}>
                  Skills Assessment
                </a>
              </li>
              <li>
                <a href="/platform/class-intelligence" onClick={(e) => handleLinkClick('/platform/class-intelligence', e)}>
                  Class Intelligence
                </a>
              </li>
              <li>
                <a href="/platform/early-intervention" onClick={(e) => handleLinkClick('/platform/early-intervention', e)}>
                  Early Intervention
                </a>
              </li>
              <li>
                <a href="/platform/performance-trends" onClick={(e) => handleLinkClick('/platform/performance-trends', e)}>
                  Performance Trends
                </a>
              </li>
              <li>
                <a href="/platform/aqi" onClick={(e) => handleLinkClick('/platform/aqi', e)}>
                  AQI
                </a>
              </li>
            </ul>
          </div>

          {/* Portals */}
          <div>
            <h3 className="col-title">{t.portals}</h3>
            <ul className="footer-links">
              <li>
                <a href="/portals/admin" onClick={(e) => handleLinkClick('/portals/admin', e)}>
                  Owner / Admin
                </a>
              </li>
              <li>
                <a href="/portals/principal" onClick={(e) => handleLinkClick('/portals/principal', e)}>
                  Principal
                </a>
              </li>
              <li>
                <a href="/portals/teacher" onClick={(e) => handleLinkClick('/portals/teacher', e)}>
                  Teacher
                </a>
              </li>
              <li>
                <a href="/portals/student" onClick={(e) => handleLinkClick('/portals/student', e)}>
                  Student
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="col-title">{t.company}</h3>
            <ul className="footer-links">
              <li>
                <a href="/about" onClick={(e) => handleLinkClick('/about', e)}>
                  {t.about}
                </a>
              </li>
              <li>
                <a href="/contact" onClick={(e) => handleLinkClick('/contact', e)}>
                  {t.contact}
                </a>
              </li>
              <li>
                <a href="/privacy" onClick={(e) => handleLinkClick('/privacy', e)}>
                  {t.privacy}
                </a>
              </li>
              <li>
                <a href="/terms" onClick={(e) => handleLinkClick('/terms', e)}>
                  {t.terms}
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="col-title">{t.contact}</h3>
            <ul className="footer-links">
              <li>
                <a href="/contact" onClick={(e) => handleLinkClick('/contact', e)}>
                  {t.requestAccess}
                </a>
              </li>
              <li>
                <a href="/contact" onClick={(e) => handleLinkClick('/contact', e)}>
                  {t.contactUs}
                </a>
              </li>
              <li style={{ marginTop: '0.5rem', color: '#71717a', fontSize: '0.85rem' }}>
                <a href="mailto:optimusorien@gmail.com" style={{ color: '#71717a', textDecoration: 'none' }}>
                  optimusorien@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>{t.copyright}</span>
          <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
            Built around care, not labels.
          </span>
        </div>
      </div>
    </footer>
  );
}
