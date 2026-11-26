/**
 * Achievements & Accolades Dashboard View (Stage 2 UI).
 *
 * Fully compliant with:
 * - Design System & Mobile-first responsiveness (375px, 768px, 1280px)
 * - English & Urdu (اردو) bilingual support with native RTL layout
 * - Dark & Light mode compatibility
 * - WCAG AA accessible contrast & reduced-motion awareness
 * - Role-tailored workflows (Student, Teacher, Principal, Org Admin)
 * - Diamond celebratory particle overlay
 * - Audited manual accolade conferral & review resolution
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Award, Trophy, Star, Shield, BookOpen, Sparkles, Filter, Search,
  CheckCircle, AlertCircle, Clock, ChevronRight, X, Heart, Globe,
  RefreshCw, Send, Eye, ShieldCheck, Flag, Zap
} from 'lucide-react';
import './achievements.css';

interface BadgeItem {
  id?: number;
  badge_slug: string;
  badge_name: string;
  category: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  icon_asset_name: string;
  description: string;
  period_identifier?: string;
  earned_at?: string;
  evidence_data?: Record<string, any>;
  is_manual?: boolean;
  conferred_by?: string | null;
  conferred_reason?: string;
  review_flag?: boolean;
}

interface ProgressItem {
  badge_slug: string;
  badge_name: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  icon_asset_name: string;
  current_value: string;
  target_value: string;
  progress_percentage: string;
  unit: string;
  period_identifier: string;
}

interface SummaryCounts {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
  diamond: number;
  total: number;
}

interface AchievementsViewProps {
  currentUser?: any;
  notify?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AchievementsView: React.FC<AchievementsViewProps> = ({ currentUser, notify }) => {
  const [isUrdu, setIsUrdu] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('my');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTier, setSelectedTier] = useState<string>('all');

  // Personal achievements state
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<SummaryCounts>({ bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 0, total: 0 });
  const [myAwards, setMyAwards] = useState<BadgeItem[]>([]);
  const [myProgress, setMyProgress] = useState<ProgressItem[]>([]);

  // Platform catalogue state
  const [catalogue, setCatalogue] = useState<any[]>([]);

  // Campus summary state (for Principal / Admin)
  const [campusSummary, setCampusSummary] = useState<any>(null);

  // Review flags state
  const [reviews, setReviews] = useState<any[]>([]);

  // Selected badge for details modal
  const [selectedBadge, setSelectedBadge] = useState<any | null>(null);

  // Diamond celebration state
  const [showDiamondCelebration, setShowDiamondCelebration] = useState<boolean>(false);

  // Manual confer modal state
  const [showConferModal, setShowConferModal] = useState<boolean>(false);
  const [conferRecipientId, setConferRecipientId] = useState<string>('');
  const [conferBadgeSlug, setConferBadgeSlug] = useState<string>('manual_inspirational_teacher');
  const [conferReason, setConferReason] = useState<string>('');
  const [submittingConfer, setSubmittingConfer] = useState<boolean>(false);

  // User role helpers
  const role = currentUser?.role || 'student';
  const isStudent = role === 'student';
  const isTeacher = role === 'teacher';
  const isPrincipal = role === 'principal' || role === 'school_admin';
  const isOrgAdmin = role === 'organisation_admin' || role === 'platform_admin';

  // Translations
  const t = {
    title: isUrdu ? 'کامیابیاں اور اعزازات' : 'Achievements & Accolades',
    subtitle: isUrdu
      ? 'ادارہ جاتی عمدگی، تدریسی قیادت اور تعلیمی عزم کا باضابطہ اور مستند اعتراف۔'
      : 'Institutional excellence, pedagogical leadership, and verified academic milestones.',
    langBtn: isUrdu ? 'English' : 'اردو',
    evaluateBtn: isUrdu ? 'کامیابیاں جانچیں' : 'Check Achievements',
    total: isUrdu ? 'کل اعزازات' : 'Total Badges',
    diamond: isUrdu ? 'ڈائمنڈ' : 'Diamond',
    platinum: isUrdu ? 'پلاٹینم' : 'Platinum',
    gold: isUrdu ? 'گولڈ' : 'Gold',
    silver: isUrdu ? 'سلور' : 'Silver',
    bronze: isUrdu ? 'برونز' : 'Bronze',
    all: isUrdu ? 'تمام' : 'All',
    tabMy: isStudent
      ? (isUrdu ? 'میرے تعلیمی اعزازات' : 'My Academic Awards')
      : (isUrdu ? 'میرے اعزازات' : 'My Badges'),
    tabQuiz: isUrdu ? 'کوئز مقابلے' : 'Quiz Achievements',
    tabProgress: isUrdu ? 'جاری سنگ میل' : 'In-Progress Goals',
    tabCatalogue: isUrdu ? 'مکمل فہرست' : 'Badge Catalogue',
    tabCampus: isUrdu ? 'کیمپس جائزہ' : 'Campus Overview',
    tabReviews: isUrdu ? 'جائزہ فلیگز' : 'Review Flags',
    conferBtn: isUrdu ? 'اعزاز عطا کریں' : 'Confer Accolade',
    searchPlaceholder: isUrdu ? 'اعزاز یا تفصیل تلاش کریں...' : 'Search badge or criteria...',
    emptyAwardsTitle: isUrdu ? 'ابھی کوئی اعزاز نہیں' : 'No badges earned yet',
    emptyAwardsDesc: isUrdu
      ? 'امتحانات کے حتمی نتائج اور حاضری کے ریکارڈ کے بعد مستند اعزازات خودکار تفویض ہوتے ہیں۔'
      : 'Badges are awarded automatically upon published exam results, verified attendance, and official quizzes.',
    emptyProgressTitle: isUrdu ? 'کوئی فعال پیش رفت نہیں' : 'No in-progress goals tracked',
    evidenceTitle: isUrdu ? 'مستند ثبوت اور حسابی ریکارڈ' : 'Verified Evidence & Supporting Records',
    earnedOn: isUrdu ? 'حاصل کیا گیا:' : 'Earned on:',
    manualConferredBy: isUrdu ? 'عطا کنندہ:' : 'Conferred by:',
    conferModalTitle: isUrdu ? 'سرکاری تعریفی اعزاز عطا کریں' : 'Confer Formal Accolade',
    conferModalDesc: isUrdu
      ? 'ادارہ جاتی قواعد کے مطابق یہ دستی اعزاز مستقل آڈٹ لاگ میں محفوظ کیا جائے گا۔'
      : 'This manual accolade will be permanently recorded in the institutional audit log with your justification.',
    recipientIdLabel: isUrdu ? 'وصول کنندہ کا صارف آئی ڈی (User ID):' : 'Recipient User ID:',
    selectBadgeLabel: isUrdu ? 'اعزاز کا انتخاب:' : 'Select Accolade:',
    reasonLabel: isUrdu ? 'تفصیلی توثیقی وجہ (کم از کم 10 حروف):' : 'Detailed Justification (min 10 characters):',
    reasonPlaceholder: isUrdu ? 'اس اعزاز کی تفصیلی وجہ تحریر کریں...' : 'Provide clear justification for this institutional recognition...',
    cancel: isUrdu ? 'منسوخ کریں' : 'Cancel',
    submitConfer: isUrdu ? 'اعزاز جاری کریں' : 'Confirm Award',
    close: isUrdu ? 'بند کریں' : 'Close',
  };

  // Fetch personal achievements
  const fetchMyAchievements = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/badges/my/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary || { bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 0, total: 0 });
        setMyAwards(data.awards || []);
        setMyProgress(data.progress || []);
      }
    } catch (err) {
      console.error('Failed to load personal achievements:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch catalogue
  const fetchCatalogue = async () => {
    try {
      const res = await fetch('/api/v1/badges/catalogue/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCatalogue(data.badges || []);
      }
    } catch (err) {
      console.error('Failed to load catalogue:', err);
    }
  };

  // Fetch campus summary for leadership
  const fetchCampusSummary = async () => {
    if (!isPrincipal && !isOrgAdmin) return;
    try {
      const res = await fetch('/api/v1/badges/school-summary/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCampusSummary(data);
      }
    } catch (err) {
      console.error('Failed to load campus summary:', err);
    }
  };

  // Fetch review flags
  const fetchReviews = async () => {
    if (!isPrincipal && !isOrgAdmin) return;
    try {
      const res = await fetch('/api/v1/badges/reviews/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    }
  };

  useEffect(() => {
    fetchMyAchievements();
    fetchCatalogue();
    if (isPrincipal || isOrgAdmin) {
      fetchCampusSummary();
      fetchReviews();
    }
  }, [role]);

  // Handle on-demand evaluation trigger
  const handleTriggerEvaluation = async () => {
    try {
      const res = await fetch('/api/v1/badges/evaluate-trigger/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        const msg = isUrdu
          ? `جانچ مکمل! ${data.new_awards_count} نئے اعزازات جاری کیے گئے۔`
          : `Evaluation complete! ${data.new_awards_count} new accolades awarded.`;
        if (notify) notify(msg, 'success');
        fetchMyAchievements();
        if (isPrincipal || isOrgAdmin) fetchCampusSummary();
      }
    } catch (err) {
      if (notify) notify(isUrdu ? 'جانچ میں مسئلہ پیش آیا' : 'Failed to trigger evaluation', 'error');
    }
  };

  // Handle manual award conferral
  const handleConferAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conferRecipientId || !conferReason || conferReason.trim().length < 10) {
      if (notify) notify(isUrdu ? 'برائے مہربانی درست صارف اور کم از کم 10 حروف کی وجہ درج کریں' : 'Please provide recipient ID and justification of at least 10 chars', 'error');
      return;
    }

    try {
      setSubmittingConfer(true);
      const res = await fetch('/api/v1/badges/confer-manual/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_id: parseInt(conferRecipientId),
          badge_slug: conferBadgeSlug,
          reason: conferReason.trim()
        }),
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        if (notify) notify(data.message || 'Accolade successfully conferred!', 'success');
        setShowConferModal(false);
        setConferRecipientId('');
        setConferReason('');
        if (isPrincipal || isOrgAdmin) fetchCampusSummary();
      } else {
        const errData = await res.json();
        const errMsg = errData.reason || errData.error || errData.detail || 'Failed to confer accolade';
        if (notify) notify(errMsg, 'error');
      }
    } catch (err) {
      if (notify) notify('Network error while conferring accolade', 'error');
    } finally {
      setSubmittingConfer(false);
    }
  };

  // Handle review flag resolution
  const handleResolveReview = async (awardId: number) => {
    try {
      const res = await fetch('/api/v1/badges/resolve-review/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ award_id: awardId, notes: 'Sustained with administrative approval.' }),
        credentials: 'include'
      });
      if (res.ok) {
        if (notify) notify(isUrdu ? 'فلیگ حل کر دیا گیا' : 'Review flag resolved successfully', 'success');
        fetchReviews();
      }
    } catch (err) {
      if (notify) notify('Failed to resolve review', 'error');
    }
  };

  // Open details modal and trigger celebration if diamond
  const handleBadgeClick = (badge: any) => {
    setSelectedBadge(badge);
    if (badge.tier === 'diamond') {
      setShowDiamondCelebration(true);
      setTimeout(() => setShowDiamondCelebration(false), 4500);
    }
  };

  // Filtered awards
  const filteredAwards = useMemo(() => {
    let list = myAwards;
    if (activeTab === 'quiz') {
      list = list.filter(b => b.category === 'quiz');
    } else if (activeTab === 'my') {
      list = list.filter(b => b.category !== 'quiz');
    }
    if (selectedTier !== 'all') {
      list = list.filter(b => b.tier === selectedTier);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(b => b.badge_name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q));
    }
    return list;
  }, [myAwards, activeTab, selectedTier, searchQuery]);

  // Filtered catalogue
  const filteredCatalogue = useMemo(() => {
    let list = catalogue;
    if (selectedTier !== 'all') {
      list = list.filter(b => b.tier === selectedTier);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(b => b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q));
    }
    return list;
  }, [catalogue, selectedTier, searchQuery]);

  return (
    <div className="achievements-container" dir={isUrdu ? 'rtl' : 'ltr'}>
      {/* Diamond Celebratory Sparkles Overlay */}
      {showDiamondCelebration && (
        <div className="diamond-celebration-overlay" aria-hidden="true">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="sparkle-particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2.2 + Math.random() * 1.5}s`,
                backgroundColor: i % 2 === 0 ? '#38bdf8' : '#c084fc'
              }}
            />
          ))}
        </div>
      )}

      {/* Header Banner */}
      <header className="ach-header-card">
        <div className="ach-header-info">
          <h1>
            <Award size={32} />
            {t.title}
          </h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="ach-controls">
          <button
            className="ach-lang-btn"
            onClick={() => setIsUrdu(!isUrdu)}
            aria-label="Toggle Language English Urdu"
          >
            <Globe size={16} />
            {t.langBtn}
          </button>
          <button
            className="ach-trigger-btn"
            onClick={handleTriggerEvaluation}
            title={t.evaluateBtn}
          >
            <RefreshCw size={16} />
            {t.evaluateBtn}
          </button>
          {(isPrincipal || isTeacher || isOrgAdmin) && (
            <button
              className="ach-trigger-btn"
              onClick={() => setShowConferModal(true)}
              style={{ background: '#f59e0b', color: '#78350f', borderColor: '#fef3c7' }}
            >
              <Send size={16} />
              {t.conferBtn}
            </button>
          )}
        </div>
      </header>

      {/* Summary Stat Pills */}
      <section className="ach-summary-grid" aria-label="Achievement Counts by Tier">
        <div className="ach-summary-pill total">
          <div className="ach-pill-icon"><Trophy size={20} /></div>
          <div className="ach-pill-text">
            <div className="count">{summary.total}</div>
            <div className="label">{t.total}</div>
          </div>
        </div>
        <div className="ach-summary-pill diamond">
          <div className="ach-pill-icon">💎</div>
          <div className="ach-pill-text">
            <div className="count">{summary.diamond}</div>
            <div className="label">{t.diamond}</div>
          </div>
        </div>
        <div className="ach-summary-pill platinum">
          <div className="ach-pill-icon">✨</div>
          <div className="ach-pill-text">
            <div className="count">{summary.platinum}</div>
            <div className="label">{t.platinum}</div>
          </div>
        </div>
        <div className="ach-summary-pill gold">
          <div className="ach-pill-icon">🥇</div>
          <div className="ach-pill-text">
            <div className="count">{summary.gold}</div>
            <div className="label">{t.gold}</div>
          </div>
        </div>
        <div className="ach-summary-pill silver">
          <div className="ach-pill-icon">🥈</div>
          <div className="ach-pill-text">
            <div className="count">{summary.silver}</div>
            <div className="label">{t.silver}</div>
          </div>
        </div>
        <div className="ach-summary-pill bronze">
          <div className="ach-pill-icon">🥉</div>
          <div className="ach-pill-text">
            <div className="count">{summary.bronze}</div>
            <div className="label">{t.bronze}</div>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <nav className="ach-tabs-nav" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'my'}
          className={`ach-tab-btn ${activeTab === 'my' ? 'active' : ''}`}
          onClick={() => setActiveTab('my')}
        >
          <Award size={18} />
          {t.tabMy}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'quiz'}
          className={`ach-tab-btn ${activeTab === 'quiz' ? 'active' : ''}`}
          onClick={() => setActiveTab('quiz')}
        >
          <Zap size={18} />
          {t.tabQuiz}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'progress'}
          className={`ach-tab-btn ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
        >
          <Clock size={18} />
          {t.tabProgress}
          {myProgress.length > 0 && <span className="ach-counter">{myProgress.length}</span>}
        </button>
        {(isPrincipal || isOrgAdmin) && (
          <button
            role="tab"
            aria-selected={activeTab === 'campus'}
            className={`ach-tab-btn ${activeTab === 'campus' ? 'active' : ''}`}
            onClick={() => setActiveTab('campus')}
          >
            <ShieldCheck size={18} />
            {t.tabCampus}
          </button>
        )}
        {(isPrincipal || isOrgAdmin) && reviews.length > 0 && (
          <button
            role="tab"
            aria-selected={activeTab === 'reviews'}
            className={`ach-tab-btn ${activeTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveTab('reviews')}
            style={{ color: '#dc2626' }}
          >
            <Flag size={18} />
            {t.tabReviews} ({reviews.length})
          </button>
        )}
        <button
          role="tab"
          aria-selected={activeTab === 'catalogue'}
          className={`ach-tab-btn ${activeTab === 'catalogue' ? 'active' : ''}`}
          onClick={() => setActiveTab('catalogue')}
        >
          <BookOpen size={18} />
          {t.tabCatalogue}
        </button>
      </nav>

      {/* Search & Tier Filters Bar */}
      {activeTab !== 'campus' && activeTab !== 'reviews' && (
        <section className="ach-filter-bar">
          <input
            type="text"
            className="ach-search-input"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter achievements"
          />
          <div className="ach-tier-filter">
            {['all', 'diamond', 'platinum', 'gold', 'silver', 'bronze'].map(tier => (
              <button
                key={tier}
                className={`ach-filter-chip ${selectedTier === tier ? 'active' : ''}`}
                onClick={() => setSelectedTier(tier)}
              >
                {t[tier as keyof typeof t] || tier}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* TAB 1 & 2: EARNED AWARDS (ACADEMIC / QUIZ) */}
      {(activeTab === 'my' || activeTab === 'quiz') && (
        <>
          {filteredAwards.length === 0 ? (
            <div className="ach-empty-state" style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: 18, border: '1px solid #e2e8f0' }}>
              <Trophy size={48} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0', color: '#1e293b' }}>{t.emptyAwardsTitle}</h3>
              <p style={{ color: '#64748b', maxWidth: 480, margin: '0 auto' }}>{t.emptyAwardsDesc}</p>
            </div>
          ) : (
            <div className="ach-cards-grid">
              {filteredAwards.map((badge, idx) => (
                <article
                  key={badge.id || idx}
                  className={`ach-badge-card ${badge.tier}`}
                  onClick={() => handleBadgeClick(badge)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleBadgeClick(badge)}
                  aria-label={`${badge.badge_name} (${badge.tier} tier)`}
                >
                  <div className="ach-card-top">
                    <span className={`ach-tier-badge ${badge.tier}`}>{badge.tier}</span>
                    {badge.earned_at && (
                      <span className="ach-date-tag">
                        {new Date(badge.earned_at).toLocaleDateString(isUrdu ? 'ur-PK' : 'en-US', { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <div className="ach-image-wrapper">
                    <img
                      src={`/badges/${badge.icon_asset_name}`}
                      alt={badge.badge_name}
                      className="ach-badge-img"
                      loading="lazy"
                    />
                  </div>
                  <div className="ach-card-body">
                    <h3>{badge.badge_name}</h3>
                    <p>{badge.description}</p>
                  </div>
                  {badge.evidence_data && (
                    <div style={{ marginTop: 'auto' }}>
                      <span className="ach-evidence-pill">
                        <CheckCircle size={12} />
                        {isUrdu ? 'مستند اعزاز' : 'Verified Accolade'}
                      </span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 3: IN-PROGRESS GOALS & LOCKED BADGES */}
      {activeTab === 'progress' && (
        <>
          {myProgress.length === 0 ? (
            <div className="ach-empty-state" style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: 18, border: '1px solid #e2e8f0' }}>
              <Clock size={48} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0', color: '#1e293b' }}>{t.emptyProgressTitle}</h3>
              <p style={{ color: '#64748b' }}>Active attendance and assessment benchmarks will display live progress meters here.</p>
            </div>
          ) : (
            <div className="ach-cards-grid">
              {myProgress.map((pr, idx) => (
                <article key={idx} className={`ach-badge-card ${pr.tier}`} style={{ opacity: 0.95 }}>
                  <div className="ach-card-top">
                    <span className={`ach-tier-badge ${pr.tier}`}>{pr.tier}</span>
                    <span className="ach-date-tag">{pr.period_identifier}</span>
                  </div>
                  <div className="ach-image-wrapper">
                    <img
                      src={`/badges/${pr.icon_asset_name}`}
                      alt={pr.badge_name}
                      className="ach-badge-img"
                      style={{ filter: 'grayscale(60%) opacity(80%)' }}
                      loading="lazy"
                    />
                  </div>
                  <div className="ach-card-body">
                    <h3>{pr.badge_name}</h3>
                  </div>
                  <div className="ach-progress-section">
                    <div className="ach-progress-bar-bg">
                      <div
                        className="ach-progress-bar-fill"
                        style={{ width: `${Math.min(100, parseFloat(pr.progress_percentage))}%` }}
                      />
                    </div>
                    <div className="ach-progress-stats">
                      <span>{pr.current_value} / {pr.target_value} {pr.unit}</span>
                      <span>{pr.progress_percentage}%</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB 4: CAMPUS OVERVIEW (FOR LEADERSHIP) */}
      {activeTab === 'campus' && campusSummary && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#ffffff', borderRadius: 18, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 700 }}>
              {isUrdu ? `کیمپس کارکردگی خلاصہ: ${campusSummary.campus_name}` : `Campus Accolades Summary: ${campusSummary.campus_name}`}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{isUrdu ? 'کل ادارہ جاتی اعزازات' : 'Total Campus Accolades'}</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0284c7' }}>{campusSummary.total_awards}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{isUrdu ? 'طلبہ اعزازات' : 'Student Awards'}</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#059669' }}>{campusSummary.by_category?.student || 0}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{isUrdu ? 'اساتذہ اعزازات' : 'Faculty Awards'}</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2563eb' }}>{campusSummary.by_category?.teacher || 0}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{isUrdu ? 'کوئز چیمپئنز' : 'Quiz Competitors'}</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#7c3aed' }}>{campusSummary.by_category?.quiz || 0}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 5: REVIEW FLAGS (FOR AUDITED CORRECTIONS) */}
      {activeTab === 'reviews' && (
        <section style={{ background: '#ffffff', borderRadius: 18, padding: 24, border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 700, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={22} />
            {isUrdu ? 'نتائج کی تبدیلی کے بعد آڈٹ فلیگز' : 'Subsequent Result Correction Review Flags'}
          </h3>
          <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: 20 }}>
            {isUrdu
              ? 'کسی بھی طالب علم کا اعزاز ازخود منسوخ نہیں ہوتا۔ نتائج کی تبدیلی کے بعد سسٹم فلیگ تیار کرتا ہے تاکہ منتظم خود تصدیق کر سکے۔'
              : 'Earned accolades are NEVER revoked automatically. If published results or attendance are revised, the system flags the award for administrative inspection.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reviews.map((rev) => (
              <div key={rev.award_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 12, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#991b1b' }}>{rev.badge_name} ({rev.tier})</div>
                  <div style={{ fontSize: '0.85rem', color: '#475569' }}>User: {rev.user_username} ({rev.user_role}) • Period: {rev.period_identifier}</div>
                  <div style={{ fontSize: '0.825rem', color: '#b91c1c', marginTop: 4 }}>Reason: {rev.review_reason}</div>
                </div>
                <button
                  onClick={() => handleResolveReview(rev.award_id)}
                  style={{ background: '#0284c7', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                >
                  {isUrdu ? 'حل کریں اور برقرار رکھیں' : 'Resolve & Confirm'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 6: FULL PLATFORM CATALOGUE */}
      {activeTab === 'catalogue' && (
        <div className="ach-cards-grid">
          {filteredCatalogue.map((b) => (
            <article
              key={b.slug}
              className={`ach-badge-card ${b.tier}`}
              onClick={() => handleBadgeClick(b)}
              tabIndex={0}
            >
              <div className="ach-card-top">
                <span className={`ach-tier-badge ${b.tier}`}>{b.tier}</span>
                <span className="ach-date-tag">{b.category}</span>
              </div>
              <div className="ach-image-wrapper">
                <img
                  src={`/badges/${b.icon_asset_name}`}
                  alt={b.name}
                  className="ach-badge-img"
                  loading="lazy"
                />
              </div>
              <div className="ach-card-body">
                <h3>{b.name}</h3>
                <p>{b.criteria_summary || b.description}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* BADGE DETAILS MODAL */}
      {selectedBadge && (
        <div className="ach-modal-backdrop" onClick={() => setSelectedBadge(null)}>
          <div className="ach-modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="ach-modal-close" onClick={() => setSelectedBadge(null)} aria-label={t.close}>
              <X size={20} />
            </button>
            <div className="ach-modal-header">
              <img
                src={`/badges/${selectedBadge.icon_asset_name}`}
                alt={selectedBadge.badge_name || selectedBadge.name}
                className="ach-modal-img"
              />
              <span className={`ach-tier-badge ${selectedBadge.tier}`} style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
                {selectedBadge.tier}
              </span>
              <h2 className="ach-modal-title">{selectedBadge.badge_name || selectedBadge.name}</h2>
              <p className="ach-modal-desc">{selectedBadge.description}</p>
            </div>

            {selectedBadge.evidence_data && (
              <div className="ach-evidence-box">
                <div className="ach-evidence-title">{t.evidenceTitle}</div>
                {Object.entries(selectedBadge.evidence_data).map(([k, v]) => (
                  <div key={k} className="ach-evidence-item">
                    <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}:</span>
                    <strong style={{ direction: 'ltr' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</strong>
                  </div>
                ))}
              </div>
            )}

            {selectedBadge.is_manual && selectedBadge.conferred_by && (
              <div style={{ background: '#fef3c7', padding: 12, borderRadius: 10, fontSize: '0.85rem', color: '#92400e', marginBottom: 16 }}>
                <strong>{t.manualConferredBy}</strong> {selectedBadge.conferred_by}
                {selectedBadge.conferred_reason && <p style={{ margin: '4px 0 0 0' }}>"{selectedBadge.conferred_reason}"</p>}
              </div>
            )}

            <button
              onClick={() => setSelectedBadge(null)}
              style={{ width: '100%', padding: '12px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              {t.close}
            </button>
          </div>
        </div>
      )}

      {/* CONFER MANUAL ACCOLADE MODAL */}
      {showConferModal && (
        <div className="ach-modal-backdrop" onClick={() => setShowConferModal(false)}>
          <div className="ach-modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="ach-modal-close" onClick={() => setShowConferModal(false)} aria-label={t.close}>
              <X size={20} />
            </button>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>{t.conferModalTitle}</h2>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: 20 }}>{t.conferModalDesc}</p>

            <form onSubmit={handleConferAward}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6, color: '#334155' }}>
                  {t.recipientIdLabel}
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 42"
                  value={conferRecipientId}
                  onChange={(e) => setConferRecipientId(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6, color: '#334155' }}>
                  {t.selectBadgeLabel}
                </label>
                <select
                  value={conferBadgeSlug}
                  onChange={(e) => setConferBadgeSlug(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#ffffff' }}
                >
                  <option value="manual_inspirational_teacher">Inspirational Teacher (Gold)</option>
                  <option value="manual_principal_honour">Principal's Honour (Gold)</option>
                  <option value="manual_teachers_commendation">Teacher's Commendation (Silver)</option>
                  <option value="manual_leadership_distinction">Leadership Distinction (Platinum)</option>
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: 6, color: '#334155' }}>
                  {t.reasonLabel}
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  placeholder={t.reasonPlaceholder}
                  value={conferReason}
                  onChange={(e) => setConferReason(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowConferModal(false)}
                  style={{ padding: '10px 18px', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submittingConfer}
                  style={{ padding: '10px 20px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}
                >
                  {submittingConfer ? '...' : t.submitConfer}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AchievementsView;
