
import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  HeartHandshake,
  LockKeyhole,
  Menu,
  School,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X
} from 'lucide-react';
import { request } from './api';
import './public.css';

type Indicator = {
  school_name: string;
  title: string;
  period: string;
  value: string;
  unit: string;
  methodology: string;
  eligible_population: number;
  completeness_note: string;
};

export default function PublicHome({
  authenticated
}: {
  authenticated: boolean;
}) {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    request<{ results: Indicator[] }>('public/indicators/')
      .then((r) => setIndicators(r.results))
      .catch(() => setLoadError(true));
  }, []);

  const workspace = authenticated ? '/app' : '/login';

  return (
    <div className="public-site" id="top">
      <div className="public-glow public-glow-a" />
      <div className="public-glow public-glow-b" />

      <div className="public-announcement">
        <Sparkles size={13} />
        A clearer understanding of school performance
        <span className="announce-separator">·</span>
        Built around care, not labels
      </div>

      <header className="public-nav public-container">
        <a className="public-logo" href="/">
          <span className="public-logo-mark">◈</span>
          <span>
            optimus<strong>orien</strong>
            <small>EDUCATION INTELLIGENCE</small>
          </span>
        </a>

        <nav
          className={open ? 'public-links is-open' : 'public-links'}
          aria-label="Public navigation"
        >
          <a onClick={() => setOpen(false)} href="#platform">
            Platform
          </a>
          <a onClick={() => setOpen(false)} href="#approach">
            Our approach
          </a>
          <a onClick={() => setOpen(false)} href="#school-information">
            School information
          </a>
          <a onClick={() => setOpen(false)} href="#setup">
            School setup
          </a>
        </nav>

        <div className="public-nav-actions">
          {!authenticated && (
            <a className="public-signup-link" href="/login?tab=register">
              Create account
            </a>
          )}
          <a className="public-signin" href={workspace}>
            {authenticated ? 'Open dashboard' : 'Sign in'}
            <ArrowUpRight size={16} />
          </a>

          <button
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            className="public-nav-toggle"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <main>
        <section className="public-hero public-container">
          <div className="public-hero-content">
            <div className="public-label">
              <span className="public-label-pulse" />
              A THOUGHTFUL WAY TO SEE THE BIGGER PICTURE
            </div>

            <h1>
              Better insight.
              <br />
              <em>Brighter futures.</em>
            </h1>

            <p>
              Bring learning outcomes, attendance, and student support into
              focus—so educators can act on evidence with clarity and care.
            </p>

            <div className="public-hero-actions">
              <a className="public-button-primary" href={workspace}>
                {authenticated
                  ? 'Enter your workspace'
                  : 'Access your workspace'}
                <ArrowRight size={19} />
              </a>

              {!authenticated ? (
                <a className="public-button-secondary" href="/login?tab=register">
                  Register school / account
                  <ArrowUpRight size={17} />
                </a>
              ) : (
                <a className="public-button-secondary" href="#platform">
                  Explore the platform
                  <ArrowUpRight size={17} />
                </a>
              )}
            </div>

            <div className="public-hero-trust">
              <span className="public-trust-shapes">
                <i>◈</i>
                <i>✦</i>
                <i>✧</i>
              </span>

              <span>
                <b>Built for responsible decisions.</b>
                <br />
                Clear measures. Human judgement. Protected student information.
              </span>
            </div>
          </div>

          <div
            className="public-hero-art"
            aria-label="Illustrative analytics dashboard with separate learning and attendance indicators"
          >
            <div className="public-ambient-circle one" />
            <div className="public-ambient-circle two" />
            <div className="public-star star1">✦</div>
            <div className="public-star star2">✳</div>

            <div className="public-dashboard-visual">
              <div className="public-dashboard-top">
                <span className="public-dash-logo">◈</span>
                <span className="dash-skeleton-line" />

                <div className="dash-top-pills">
                  <i />
                  <i />
                  <i />
                </div>
              </div>

              <div className="public-dashboard-body">
                <aside className="public-mock-sidebar">
                  <i className="active" />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </aside>

                <div className="public-mock-main">
                  <div className="mock-microtext">
                    ILLUSTRATIVE VIEW · NOT LIVE SCHOOL DATA
                  </div>

                  <h3>
                    Education at a glance
                    <span>✳</span>
                  </h3>

                  <div className="mock-summary">
                    <div>
                      <span className="mock-kpi-icon lilac">
                        <GraduationCap size={17} />
                      </span>
                      <b>Learning</b>
                      <small>Academic records</small>
                      <span className="mock-skeleton-long" />
                    </div>

                    <div>
                      <span className="mock-kpi-icon mint">
                        <CheckCircle2 size={17} />
                      </span>
                      <b>Attendance</b>
                      <small>Eligible sessions</small>
                      <span className="mock-skeleton-long" />
                    </div>
                  </div>

                  <div className="mock-chart">
                    <div className="mock-chart-heading">
                      <span>Progress over time</span>
                      <small>Illustration only</small>
                    </div>

                    <div className="mock-chart-grid">
                      <svg
                        viewBox="0 0 410 132"
                        preserveAspectRatio="none"
                        role="presentation"
                      >
                        <defs>
                          <linearGradient
                            id="publicArea"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#7d6ae6"
                              stopOpacity=".29"
                            />
                            <stop
                              offset="100%"
                              stopColor="#7d6ae6"
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>

                        <path
                          d="M0 90 C44 94 60 72 99 80 S155 34 208 55 S275 24 326 35 S380 14 410 19 L410 130 L0 130 Z"
                          fill="url(#publicArea)"
                        />
                        <path
                          d="M0 90 C44 94 60 72 99 80 S155 34 208 55 S275 24 326 35 S380 14 410 19"
                          fill="none"
                          stroke="#8271e7"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="public-floating public-floating-one">
              <span className="floating-symbol">
                <HeartHandshake size={19} />
              </span>
              <div>
                <b>Early support</b>
                <small>Evidence, then review</small>
              </div>
              <CheckCircle2 className="floating-check" size={18} />
            </div>

            <div className="public-floating public-floating-two">
              <span className="floating-trend">
                <TrendingUp size={19} />
              </span>
              <div>
                <b>Progress matters</b>
                <small>See changes in context</small>
              </div>
            </div>
          </div>
        </section>

        <div className="public-confidence public-container">
          <span>
            <ShieldCheck size={17} />
            Privacy by design
          </span>
          <span>
            <BarChart3 size={17} />
            Transparent indicators
          </span>
          <span>
            <HeartHandshake size={17} />
            Human-led intervention
          </span>
          <span>
            <School size={17} />
            School-specific policies
          </span>
        </div>

        <section className="public-section public-container" id="platform">
          <div className="public-section-title">
            <div>
              <span className="public-section-kicker">
                A CONNECTED VIEW
              </span>
              <h2>
                Every school story
                <br />
                <em>has more than one chapter.</em>
              </h2>
            </div>

            <p>
              Useful educational intelligence is more than a single score.
              Explore separate measures and understand their context before
              deciding what comes next.
            </p>
          </div>

          <div className="public-feature-grid">
            <article className="public-feature-card">
              <span className="feature-illustration violet">
                <BookOpenCheck size={28} />
              </span>
              <span className="feature-number">01 / LEARNING</span>
              <h3>Academic progress</h3>
              <p>
                Keep assessments, subject performance and changes across
                comparable periods in view.
              </p>
              <span className="feature-mini">
                <span />
                <span />
                <span />
              </span>
            </article>

            <article className="public-feature-card">
              <span className="feature-illustration green">
                <BarChart3 size={28} />
              </span>
              <span className="feature-number">02 / PARTICIPATION</span>
              <h3>Attendance & activity</h3>
              <p>
                Understand attendance, homework and classroom observations
                without confusing missing data with poor results.
              </p>
              <div className="feature-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </article>

            <article className="public-feature-card">
              <span className="feature-illustration peach">
                <HeartHandshake size={28} />
              </span>
              <span className="feature-number">03 / SUPPORT</span>
              <h3>Thoughtful intervention</h3>
              <p>
                Surface transparent review indicators and give authorised
                staff a workflow for follow-up.
              </p>
              <div className="feature-check">
                <CheckCircle2 size={16} />
                People make the decisions
              </div>
            </article>
          </div>
        </section>

        <section className="public-approach" id="approach">
          <div className="public-container public-approach-inner">
            <div className="public-approach-graphic">
              <div className="approach-ring r1" />
              <div className="approach-ring r2" />
              <div className="approach-center">◈</div>

              <div className="approach-tag t1">
                <BookOpenCheck size={17} />
                Evidence
              </div>
              <div className="approach-tag t2">
                <Users size={17} />
                Human review
              </div>
              <div className="approach-tag t3">
                <HeartHandshake size={17} />
                Follow-up
              </div>
            </div>

            <div>
              <span className="public-section-kicker">
                THE OPTIMUS APPROACH
              </span>
              <h2>
                Data should help us
                <br />
                <em>ask better questions.</em>
              </h2>

              <p>
                One lower mark or missed session never tells the whole story.
                The platform keeps different evidence in context, explains
                its measures and supports informed school decisions.
              </p>

              <div className="approach-checks">
                <span>
                  <CheckCircle2 size={18} />
                  No assumptions about students
                </span>
                <span>
                  <CheckCircle2 size={18} />
                  Missing data is identified, not invented
                </span>
                <span>
                  <CheckCircle2 size={18} />
                  Private records stay in protected portals
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          className="public-section public-container"
          id="school-information"
        >
          <div className="public-section-title">
            <div>
              <span className="public-section-kicker">
                PUBLIC SCHOOL INFORMATION
              </span>
              <h2>
                Published responsibly.
                <br />
                <em>Understood clearly.</em>
              </h2>
            </div>

            <p>
              Only approved school-level indicators may appear here, with
              their reporting period, methodology, and data-completeness
              notes. Private student details are never included.
            </p>
          </div>

          {indicators.length > 0 ? (
            <div className="public-indicator-grid">
              {indicators.map((item, i) => (
                <article className="public-indicator" key={i}>
                  <div className="public-indicator-head">
                    <School size={18} />
                    <span>{item.school_name}</span>
                  </div>

                  <strong>
                    {item.value}
                    {item.unit}
                  </strong>
                  <h3>{item.title}</h3>
                  <p>
                    {item.period} · Eligible population:{' '}
                    {item.eligible_population}
                  </p>

                  <details>
                    <summary>
                      View methodology
                      <ChevronDown size={15} />
                    </summary>
                    <p>{item.methodology}</p>
                    <p>
                      <b>Data completeness:</b> {item.completeness_note}
                    </p>
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <div className="public-empty-published">
              <div className="published-icon">
                <LockKeyhole size={28} />
              </div>
              <div>
                <h3>
                  Public reporting is currently private by default.
                </h3>
                <p>
                  {loadError
                    ? 'Public indicator information is temporarily unavailable. No unverified information is shown.'
                    : 'No indicators have been expressly approved for public publication yet. School-level data will appear only after review and authorisation.'}
                </p>
              </div>
              <span>
                <ShieldCheck size={18} />
                No fabricated rankings
              </span>
            </div>
          )}
        </section>

        <section
          className="public-container public-setup-cta"
          id="setup"
        >
          <div className="cta-text">
            <span className="public-section-kicker">
              FOR SCHOOL ADMINISTRATORS
            </span>
            <h2>
              Your school. Your structure.
              <br />
              <em>Thoughtfully configured.</em>
            </h2>
            <p>
              Authorised administrators can create a school record,
              save a configuration draft, review validation issues
              and activate a versioned setup for its academic context.
            </p>

            <a className="public-button-primary" href={workspace}>
              {authenticated
                ? 'Open school setup'
                : 'Sign in to manage setup'}
              <ArrowRight size={18} />
            </a>

            <small>
              Public self-registration and automatic school activation
              are not enabled.
            </small>
          </div>

          <div className="cta-steps">
            <div>
              <span>01</span>
              <b>School identity & location</b>
              <Check size={17} />
            </div>
            <div>
              <span>02</span>
              <b>Programmes & academic calendar</b>
              <Check size={17} />
            </div>
            <div>
              <span>03</span>
              <b>Grading & attendance policies</b>
              <Check size={17} />
            </div>
            <div>
              <span>04</span>
              <b>Review & authorised activation</b>
              <ShieldCheck size={17} />
            </div>
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-container public-footer-main">
          <div className="public-logo light">
            <span className="public-logo-mark">◈</span>
            <span>
              optimus<strong>orien</strong>
              <small>EDUCATION INTELLIGENCE</small>
            </span>
          </div>

          <span>
            School performance intelligence and early intervention.
          </span>

          <a href={workspace}>
            Workspace
            <ArrowUpRight size={16} />
          </a>
        </div>

        <div className="public-container public-footer-bottom">
          <span>
            © {new Date().getFullYear()} Optimus Orien.
            All rights reserved.
          </span>
          <span>
            Public information is subject to approval and
            documented methodology.
          </span>
        </div>
      </footer>
    </div>
  );
}
