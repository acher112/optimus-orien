import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Shield, School, UserCheck, BookOpen, HeartHandshake } from 'lucide-react';

interface RolesSectionProps {
  locale: 'en' | 'ur';
}

interface PortalSlide {
  id: string;
  roleName: string;
  badge: string;
  url: string;
  image: string;
  description: string;
  icon: React.ReactNode;
}

export default function RolesSection({ locale }: RolesSectionProps) {
  const isUr = locale === 'ur';
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const slides: PortalSlide[] = [
    {
      id: 'admin',
      roleName: isUr ? 'ایڈمن پورٹل' : 'Super Admin Portal',
      badge: isUr ? 'کثیر کیمپس تنظیمی نگرانی' : 'Multi-Campus Executive Governance',
      url: 'portal.optimus-orien.io/super_admin',
      image: '/images/dashboard-admin.png',
      description: isUr
        ? 'کثیر کیمپس تنظیمی نگرانی، فیس، عملے اور جامع رپورٹس کا مرکزی ڈیش بورڈ۔'
        : 'Comprehensive multi-campus oversight, institutional finances, staff directories, and systemic executive analytics in one unified cockpit.',
      icon: <Shield size={16} />,
    },
    {
      id: 'principal',
      roleName: isUr ? 'پرنسپل پورٹل' : 'Principal Portal',
      badge: isUr ? 'کیمپس قیادت اور رجحانات کا جائزہ' : 'Campus Leadership & Quality Oversight',
      url: 'portal.optimus-orien.io/principal',
      image: '/images/dashboard-principal.png',
      description: isUr
        ? 'کیمپس کی تعلیمی کارکردگی، اساتذہ کا جائزہ اور قبل از وقت انتباہی نظام۔'
        : 'Real-time campus diagnostics, teacher efficacy analytics, early intervention triggers, and longitudinal student trajectory trends.',
      icon: <School size={16} />,
    },
    {
      id: 'teacher',
      roleName: isUr ? 'استاد پورٹل' : 'Teacher Portal',
      badge: isUr ? 'کلاس روم تجزیات اور قبل از وقت الرٹس' : 'Classroom Analytics & Early Alerts',
      url: 'portal.optimus-orien.io/teacher',
      image: '/images/dashboard-teacher.png',
      description: isUr
        ? 'روزانہ حاضری، امتحانی نتائج کا اندراج اور طلباء کی انفرادی پیش رفت۔'
        : 'Streamlined daily attendance, frictionless gradebook entries, behavior observations, and proactive intervention notes.',
      icon: <UserCheck size={16} />,
    },
    {
      id: 'student',
      roleName: isUr ? 'طالب علم پورٹل' : 'Student Portal',
      badge: isUr ? 'ذاتی تعلیمی پیش رفت اور رہنمائی' : 'Personal Progress & Growth Profile',
      url: 'portal.optimus-orien.io/student',
      image: '/images/dashboard-student.png',
      description: isUr
        ? 'طالب علم کے نمبر، ہوم ورک، امتحانی شیڈول اور ذاتی تعلیمی ترقی۔'
        : 'Clear visibility into assignments, exam timetables, assessment feedback, and continuous academic growth metrics.',
      icon: <BookOpen size={16} />,
    },
    {
      id: 'parent',
      roleName: isUr ? 'والدین پورٹل' : 'Parent Portal',
      badge: isUr ? 'والدین کی رسائی اور کارکردگی کی نگرانی' : 'Parent Engagement & Real-Time Alerts',
      url: 'portal.optimus-orien.io/parent',
      image: '/images/dashboard-parent.png',
      description: isUr
        ? 'حاضری، فیس کے واؤچرز اور اسکول کے اعلانات کی فوری معلومات۔'
        : 'Instant attendance verification, automated fee receipts, direct teacher communication, and holistic academic progress tracking.',
      icon: <HeartHandshake size={16} />,
    },
  ];

  const total = slides.length;

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Auto-play timer (changes every 4.5 seconds, pauses when hovered or touched)
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      nextSlide();
    }, 4500);
    return () => clearInterval(interval);
  }, [isHovered, nextSlide]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') nextSlide();
    if (e.key === 'ArrowLeft') prevSlide();
  };

  // Touch swipe support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsHovered(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 45) {
      if (diff > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    touchStartX.current = null;
    setIsHovered(false);
  };

  const current = slides[currentIndex];

  return (
    <section id="platform" className="roles-section">
      <div className="roles-container">
        {/* Section Header */}
        <div className="roles-header">
          <div className="roles-badge">
            <span>{isUr ? 'کردار پر مبنی تجربہ' : 'Role-Based Experiences'}</span>
          </div>
          <h2 className="roles-title">
            {isUr ? 'ایک پلیٹ فارم۔ مختلف زاویے۔' : 'One Platform. Multiple Perspectives.'}
          </h2>
          <p className="roles-desc">
            {isUr
              ? 'ہر اسٹیک ہولڈر کو اپنی ضرورت کے مطابق جامع معلومات حاصل ہوتی ہیں، اعلیٰ انتظامی نگرانی سے لے کر طالب علم کی روزانہ کی ترقی تک۔'
              : 'Every stakeholder sees exactly the intelligence they need from systemic executive oversight to daily student growth.'}
          </p>
        </div>

        {/* Quick Role Selection Pills */}
        <div className="roles-pills-nav" role="tablist">
          {slides.map((s, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={s.id}
                type="button"
                className={`role-pill-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => setCurrentIndex(idx)}
                role="tab"
                aria-selected={isActive}
              >
                <span className="pill-icon">{s.icon}</span>
                <span className="pill-name">{s.roleName}</span>
              </button>
            );
          })}
        </div>

        {/* Big Image Carousel Slider */}
        <div
          className="portal-carousel-viewport"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          aria-label="Portal Screenshots Carousel"
        >
          {/* Left Arrow Button */}
          <button
            type="button"
            className="portal-nav-arrow portal-nav-arrow-left"
            onClick={prevSlide}
            aria-label={isUr ? 'پچھلی تصویر' : 'Previous portal slide'}
          >
            <ChevronLeft size={28} />
          </button>

          {/* Right Arrow Button */}
          <button
            type="button"
            className="portal-nav-arrow portal-nav-arrow-right"
            onClick={nextSlide}
            aria-label={isUr ? 'اگلی تصویر' : 'Next portal slide'}
          >
            <ChevronRight size={28} />
          </button>

          {/* Single Slide Card Container */}
          <div className="portal-slide-card">
            {/* Top Browser Chrome Bar */}
            <div className="portal-browser-bar">
              <div className="browser-dots">
                <span className="b-dot dot-red" />
                <span className="b-dot dot-yellow" />
                <span className="b-dot dot-green" />
                <span className="browser-url">{current.url}</span>
              </div>
              <span className="portal-badge-chip">{current.badge}</span>
            </div>

            {/* Big High-Res Portal Image */}
            <div className="portal-image-frame">
              <img
                key={current.id}
                src={current.image}
                alt={`${current.roleName} preview`}
                className="portal-hero-img"
                loading="eager"
              />
            </div>

            {/* Slide Caption and Details */}
            <div className="portal-caption-footer">
              <div className="portal-caption-info">
                <h3 className="portal-caption-title">{current.roleName}</h3>
                <p className="portal-caption-desc">{current.description}</p>
              </div>
              <div className="portal-counter">
                <span>0{currentIndex + 1}</span>
                <span className="counter-sep">/</span>
                <span>0{total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Pagination Dots */}
        <div className="portal-dots-wrapper">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={`portal-dot ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
