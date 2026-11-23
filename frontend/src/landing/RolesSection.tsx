import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  School,
  UserCheck,
  BookOpen,
  BarChart3,
  Users,
  CreditCard,
  GraduationCap,
  Sparkles,
  Layers,
  Calendar,
  Award,
  FileText,
  Activity,
} from 'lucide-react';

interface RolesSectionProps {
  locale?: string;
}

interface PortalFunction {
  title: string;
  desc: string;
  icon: React.ReactNode;
}

interface PortalSlide {
  id: string;
  roleName: string;
  badge: string;
  url: string;
  summary: string;
  description: string;
  icon: React.ReactNode;
  functions: PortalFunction[];
}

export default function RolesSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const slides: PortalSlide[] = [
    {
      id: 'admin',
      roleName: 'Super Admin Portal',
      badge: 'Multi-Campus Executive Governance',
      url: 'portal.optimus-orien.io/super_admin',
      summary: 'Executive command center for multi-campus governance, institutional finance reconciliation, cross-campus rankings, and systemic HR oversight.',
      description: 'Comprehensive multi-campus oversight, institutional finances, staff directories, and systemic executive analytics in one unified cockpit.',
      icon: <Shield size={16} />,
      functions: [
        {
          title: 'Campus Network Topology & Governance',
          desc: 'Provision new campuses, configure school codes, manage jurisdiction profiles, and assign regional campus principals with enterprise role-based access.',
          icon: <Layers size={18} />,
        },
        {
          title: 'Institutional Financial Cockpit',
          desc: 'Synchronized fee collection audits, voucher generation, fee structures, concession approvals, and automated financial accounting in default USD currency.',
          icon: <CreditCard size={18} />,
        },
        {
          title: 'Cross-Campus Academic Quality Index',
          desc: 'Systemic benchmarking of campus SPI, curriculum pass rates, normalized grade distributions, and executive inspection-ready compliance audits.',
          icon: <BarChart3 size={18} />,
        },
        {
          title: 'Enterprise Staff Directory & Payroll',
          desc: 'Centralized faculty records, designation hierarchies, automated salary tier management, and systemic educator onboarding across all branches.',
          icon: <Users size={18} />,
        },
      ],
    },
    {
      id: 'principal',
      roleName: 'Principal Portal',
      badge: 'Campus Leadership & Quality Oversight',
      url: 'portal.optimus-orien.io/principal',
      summary: 'Campus leadership cockpit engineered for operational excellence, teacher efficacy, longitudinal student risk prevention, and academic logistics.',
      description: 'Real-time campus diagnostics, teacher efficacy analytics, early intervention triggers, and longitudinal student trajectory trends.',
      icon: <School size={16} />,
      functions: [
        {
          title: 'Campus Performance Pulse & Health Index',
          desc: 'Live campus dashboard tracking daily student and faculty attendance rates, syllabus completion percentage, and department-level academic benchmarks.',
          icon: <Activity size={18} />,
        },
        {
          title: 'Early Warning & At-Risk Intervention Engine',
          desc: 'Automated multi-factor detection identifying learners facing academic dip or attendance declines, complete with collaborative intervention plans.',
          icon: <Sparkles size={18} />,
        },
        {
          title: 'Faculty Efficacy & Classroom Audits',
          desc: 'Track teacher attendance regularity, classroom lesson plan coverage, grade submission punctuality, and peer review outcomes.',
          icon: <UserCheck size={18} />,
        },
        {
          title: 'Examination Logistics & Master Timetable',
          desc: 'Schedule term examinations, publish seating blueprints, manage custom grading scales, and review provisional grade transcripts.',
          icon: <Calendar size={18} />,
        },
      ],
    },
    {
      id: 'teacher',
      roleName: 'Teacher Portal',
      badge: 'Classroom Analytics & Early Alerts',
      url: 'portal.optimus-orien.io/teacher',
      summary: 'Daily educator workstation built for swift single-click attendance, continuous assessment scoring, formative observation logs, and study materials.',
      description: 'Streamlined daily attendance, frictionless gradebook entries, behavior observations, and proactive intervention notes.',
      icon: <UserCheck size={16} />,
      functions: [
        {
          title: 'Frictionless 1-Click Attendance',
          desc: 'Mark whole-classroom attendance in seconds with intelligent defaults, multi-period tracking, and immediate absence notifications to administration.',
          icon: <UserCheck size={18} />,
        },
        {
          title: 'Continuous Assessment Gradebook',
          desc: 'Score homework, term quizzes, assignments, and periodic exams with instant weighted calculations, letter grade mapping, and GPA aggregation.',
          icon: <GraduationCap size={18} />,
        },
        {
          title: 'Formative Observations & Risk Notes',
          desc: 'Record classroom behavior remarks, academic intervention notes, and student psychological evaluation observations for leadership review.',
          icon: <FileText size={18} />,
        },
        {
          title: 'Curriculum & Study Materials Distribution',
          desc: 'Upload class handouts, reference documents, video links, and reading materials directly linked to subject syllabi and classroom cohorts.',
          icon: <BookOpen size={18} />,
        },
      ],
    },
    {
      id: 'student',
      roleName: 'Student Portal',
      badge: 'Personal Progress & Growth Profile',
      url: 'portal.optimus-orien.io/student',
      summary: 'Interactive learner dashboard offering continuous progress transcripts, class schedules, interactive quiz competitions, and community networking.',
      description: 'Clear visibility into assignments, exam timetables, assessment feedback, and continuous academic growth metrics.',
      icon: <BookOpen size={16} />,
      functions: [
        {
          title: 'Verified Academic Growth & Report Cards',
          desc: 'Live breakdown of subject scores, teacher feedback comments, historical grade trends, and verifiable official terminal transcripts.',
          icon: <Award size={18} />,
        },
        {
          title: 'Daily Class Schedule & Lecture Blueprint',
          desc: 'Up-to-the-minute timetable showing periods, classroom locations, assigned educators, and upcoming assignment submission deadlines.',
          icon: <Calendar size={18} />,
        },
        {
          title: 'Online Assessments & Quiz Olympiads',
          desc: 'Take official timed competitions and practice challenge quizzes across science, mathematics, and humanities with instant scoring and badges.',
          icon: <Sparkles size={18} />,
        },
        {
          title: 'Educational Community & Peer Networking',
          desc: 'Explore institutional leaderboards, follow peer achievement highlights, and interact in verified subject interest learning groups.',
          icon: <Users size={18} />,
        },
      ],
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

  const current = slides[currentIndex] || slides[0];

  return (
    <section id="platform" className="roles-section">
      <div className="roles-container">
        {/* Section Header */}
        <div className="roles-header">
          <div className="roles-badge">
            <span>Role-Based Experiences</span>
          </div>
          <h2 className="roles-title">One Platform. Multiple Perspectives.</h2>
          <p className="roles-desc">
            Every stakeholder sees exactly the intelligence they need from systemic executive oversight to daily student growth.
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
            aria-label="Previous portal slide"
          >
            <ChevronLeft size={28} />
          </button>

          {/* Right Arrow Button */}
          <button
            type="button"
            className="portal-nav-arrow portal-nav-arrow-right"
            onClick={nextSlide}
            aria-label="Next portal slide"
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

            {/* Rich Portal Description & Operational Capabilities Showcase */}
            <div className="portal-image-frame portal-showcase-frame">
              <div className="portal-content-showcase">
                <div className="portal-showcase-hero">
                  <div className="portal-showcase-meta">
                    <span className="portal-showcase-chip">{current.badge}</span>
                    <span className="portal-showcase-endpoint">{current.url}</span>
                  </div>
                  <h3 className="portal-showcase-title">{current.roleName} Capabilities & Operations</h3>
                  <p className="portal-showcase-summary">{current.summary}</p>
                </div>

                <div className="portal-functions-grid">
                  {current.functions.map((fn, idx) => (
                    <div key={idx} className="portal-function-card">
                      <div className="portal-function-icon-wrap">
                        {fn.icon}
                      </div>
                      <div className="portal-function-text">
                        <h4 className="portal-function-title">{fn.title}</h4>
                        <p className="portal-function-desc">{fn.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
