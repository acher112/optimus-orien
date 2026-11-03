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

  return (
    <footer className="site-footer">
      {/* Floating Vertical Nominee Badge */}
      <div className="nominee-badge">
        <span>Optimus Orien</span>
      </div>

      <div className="footer-container">
        <div className="footer-grid">
          {/* Brand Info & New Buttons */}
          <div>
            <h2 className="footer-brand">OPTIMUS ORIEN</h2>
            <p className="footer-desc">{t.brandTagline}</p>

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              {authenticated ? (
                <a href="/app" className="btn-nav-dashboard">
                  {t.dashboard}
                </a>
              ) : (
                <>
                  <a href="/login" className="btn-nav-signin">
                    {t.signIn}
                  </a>
                  <a href="/login?tab=register" className="btn-nav-register">
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
              <li><a href="#platform">Academic Performance</a></li>
              <li><a href="#platform">Attendance</a></li>
              <li><a href="#platform">Skills Assessment</a></li>
              <li><a href="#platform">Class Intelligence</a></li>
              <li><a href="#platform">Early Intervention</a></li>
              <li><a href="#platform">Performance Trends</a></li>
              <li><a href="#platform">AQI</a></li>
            </ul>
          </div>

          {/* Portals */}
          <div>
            <h3 className="col-title">{t.portals}</h3>
            <ul className="footer-links">
              <li><a href="#platform">Owner / Admin</a></li>
              <li><a href="#platform">Principal</a></li>
              <li><a href="#platform">Teacher</a></li>
              <li><a href="#platform">Student</a></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="col-title">{t.company}</h3>
            <ul className="footer-links">
              <li><a href="#masthead">{t.about}</a></li>
              <li><a href="#contact" onClick={(e) => { e.preventDefault(); onOpenContact(); }}>{t.contact}</a></li>
              <li><a href="#masthead">{t.privacy}</a></li>
              <li><a href="#masthead">{t.terms}</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="col-title">{t.contact}</h3>
            <ul className="footer-links">
              <li>
                <a href="#contact" onClick={(e) => { e.preventDefault(); onOpenContact(); }}>
                  {t.requestAccess}
                </a>
              </li>
              <li>
                <a href="#contact" onClick={(e) => { e.preventDefault(); onOpenContact(); }}>
                  {t.contactUs}
                </a>
              </li>
              <li style={{ marginTop: '0.5rem', color: '#71717a', fontSize: '0.85rem' }}>
                optimusorien@gmail.com
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
