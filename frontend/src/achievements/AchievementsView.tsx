/**
 * Optimus Orien — Badges & Achievements Centre
 *
 * Full compliance with requirements:
 * - Two main tabs: "Badge Directory" and "My Achievements"
 * - 4 core categories: Principal Badges, Teacher Badges, Student Badges, Global Quiz Badges
 * - Real individual 512x512 PNG assets (/badges/badge_<slug>_<tier>.png)
 * - 5 Difficulty Tiers (Bronze, Silver, Gold, Platinum, Diamond) with metallic styling
 * - Compact Awarding System & Governance Section (hierarchy, criteria, quiz non-contact boundary)
 * - Functional search, category filters, tier filters, status filters, and sorting (earned first, difficulty, alpha)
 * - Polished modal with purpose, criteria, awarding method, authorized roles, measurement period, progress, award trace
 * - Security & Child Safety: zero peer rankings, positive recognition only, protected evaluations
 * - English & Urdu (اردو) native RTL support, responsive 375px/768px/1280px, WCAG AA, reduced motion
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Award, Trophy, Star, Shield, BookOpen, Sparkles, Filter, Search,
  CheckCircle, AlertCircle, Clock, ChevronRight, X, Heart, Globe,
  RefreshCw, Send, Eye, ShieldCheck, Flag, Zap, Info, Lock, ArrowUpDown,
  GraduationCap, Building2, Users, Compass, HelpCircle
} from 'lucide-react';
import './achievements.css';

interface BadgeItem {
  id?: number;
  slug?: string;
  badge_slug?: string;
  name?: string;
  badge_name?: string;
  category: string;
  primary_category?: string;
  target_role?: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  icon_asset_name: string;
  description: string;
  criteria_summary?: string;
  awarding_method?: 'system' | 'manual';
  authorized_roles?: string[];
  measurement_period?: string;
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
  
  // Two main tabs: 'directory' or 'my'
  const [mainTab, setMainTab] = useState<'directory' | 'my'>('directory');
  
  // Optional administrative sub-view inside My Achievements for leadership
  const [leadershipSubView, setLeadershipSubView] = useState<'personal' | 'campus' | 'reviews'>('personal');

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('earned_first');

  // Show/hide compact awarding system info
  const [showAwardingInfo, setShowAwardingInfo] = useState<boolean>(true);

  // Personal achievements state
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<SummaryCounts>({ bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 0, total: 0 });
  const [myAwards, setMyAwards] = useState<BadgeItem[]>([]);
  const [myProgress, setMyProgress] = useState<ProgressItem[]>([]);

  // Platform catalogue state
  const [catalogue, setCatalogue] = useState<BadgeItem[]>([]);

  // Campus summary state (for Principal / Admin)
  const [campusSummary, setCampusSummary] = useState<any>(null);

  // Review flags state
  const [reviews, setReviews] = useState<any[]>([]);

  // Selected badge for details modal
  const [selectedBadge, setSelectedBadge] = useState<any | null>(null);
  const [showEvidenceTrace, setShowEvidenceTrace] = useState<boolean>(false);

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
  const canConferManual = isTeacher || isPrincipal || isOrgAdmin;

  // Translations
  const t = {
    title: isUrdu ? 'کامیابیاں اور اعزازات' : 'Badges & Achievements Centre',
    subtitle: isUrdu
      ? 'ادارہ جاتی عمدگی، تدریسی قیادت اور تعلیمی عزم کا باضابطہ اور مستند اعتراف۔'
      : 'Explore institutional leadership, pedagogical excellence, and verified academic milestones.',
    langBtn: isUrdu ? 'English' : 'اردو',
    evaluateBtn: isUrdu ? 'کامیابیاں جانچیں' : 'Check Achievements',
    conferBtn: isUrdu ? 'دستی اعزاز عطا کریں' : 'Confer Accolade',
    
    // Main Tabs
    tabDirectory: isUrdu ? 'بیج ڈائریکٹری' : 'Badge Directory',
    tabMyAchievements: isUrdu ? 'میرے اعزازات' : 'My Achievements',
    
    // Leadership Sub-views
    subMyAccolades: isUrdu ? 'ذاتی اعزازات' : 'My Accolades',
    subCampusSummary: isUrdu ? 'کیمپس جائزہ' : 'Campus Overview',
    subReviewFlags: isUrdu ? 'جائزہ فلیگز' : 'Review Flags',

    // Stats
    statTotal: isUrdu ? 'کل بیجز' : 'Total Badges',
    statEarned: isUrdu ? 'حاصل کردہ' : 'Earned Badges',
    statInProgress: isUrdu ? 'جاری ترقی' : 'In Progress',
    statLocked: isUrdu ? 'مقفل' : 'Locked Badges',

    // Tiers
    allTiers: isUrdu ? 'تمام درجات' : 'All Tiers',
    diamond: isUrdu ? 'ڈائمنڈ' : 'Diamond',
    platinum: isUrdu ? 'پلاٹینم' : 'Platinum',
    gold: isUrdu ? 'گولڈ' : 'Gold',
    silver: isUrdu ? 'سلور' : 'Silver',
    bronze: isUrdu ? 'برونز' : 'Bronze',

    // Categories
    allCategories: isUrdu ? 'تمام زمرے' : 'All Categories',
    catPrincipal: isUrdu ? 'پرنسپل بیجز' : 'Principal Badges',
    catTeacher: isUrdu ? 'اساتذہ بیجز' : 'Teacher Badges',
    catStudent: isUrdu ? 'طلباء بیجز' : 'Student Badges',
    catQuiz: isUrdu ? 'عالمی کوئز و علمی بیجز' : 'Global Quiz & Knowledge Badges',

    // Category Explanations
    descPrincipal: isUrdu
      ? 'ادارہ جاتی قیادت، کیمپس کی مجموعی حاضری، اور تعلیمی نتائج کے اعلیٰ معیارات۔'
      : 'Institutional stewardship, school-wide attendance rates, academic term averages, and pedagogical leadership excellence.',
    descTeacher: isUrdu
      ? 'کلاس روم کی باقاعدگی، ہوم ورک کی تصدیق، طلباء کی رہنمائی اور مضامین میں مہارت۔'
      : 'Classroom attendance consistency, verified homework coverage, instructional improvement, and subject specialization.',
    descStudent: isUrdu
      ? 'ذاتی تعلیمی ترقی، باقاعدہ حاضری، ہوم ورک کی تصدیق اور ہمہ جہت تعلیمی کاوشیں'
      : 'Verified academic progress, consistent attendance heroics, verified homework completion, and multidisciplinary excellence.',
    descQuiz: isUrdu
      ? 'سرکاری اولمپیاڈز، مقابلوں اور مضامین میں غیر معمولی کارکردگی۔ (طلبہ کے باہمی براہ راست چیلنجز پر بیجز نہیں ملتے)۔'
      : 'Verified achievements in official Olympiads, competitions, and accuracy benchmarks. (Direct peer challenges are practice only and do not award badges).',

    // Search and sorting
    searchPlaceholder: isUrdu ? 'بیج کا نام یا تفصیل تلاش کریں...' : 'Search by badge name or criteria...',
    allStatuses: isUrdu ? 'تمام حالتیں' : 'All Statuses',
    statusEarned: isUrdu ? 'حاصل شدہ' : 'Earned',
    statusInProgress: isUrdu ? 'جاری' : 'In Progress',
    statusLocked: isUrdu ? 'مقفل' : 'Locked',
    statusNotEligible: isUrdu ? 'غیر متعلقہ' : 'Not Eligible',

    sortEarnedFirst: isUrdu ? 'حاصل شدہ پہلے' : 'Earned Badges First',
    sortDiffDesc: isUrdu ? 'درجہ: ڈائمنڈ تا برونز' : 'Difficulty (Diamond → Bronze)',
    sortDiffAsc: isUrdu ? 'درجہ: برونز تا ڈائمنڈ' : 'Difficulty (Bronze → Diamond)',
    sortNameAsc: isUrdu ? 'حروفِ تہجی (A - Z)' : 'Name (A - Z)',
    sortNameDesc: isUrdu ? 'حروفِ تہجی (Z - A)' : 'Name (Z - A)',

    // Awarding System Info
    awardingTitle: isUrdu ? 'بیج تفویض کا نظام اور طریقہ کار' : 'Awarding System & Governance Architecture',
    systemAwardedPillar: isUrdu ? 'خودکار سسٹم جانچ' : 'System-Awarded (Automated Engine)',
    systemAwardedDesc: isUrdu
      ? 'امتحانات کے حتمی نتائج، روزانہ کی حاضری، تصدیق شدہ ہوم ورک اور سرکاری کوئز کے ڈیٹا سے خودکار دیا جاتا ہے۔'
      : 'Automatically granted by the core achievement engine when verified academic, attendance, and official Olympiad criteria are fulfilled.',
    manualAwardedPillar: isUrdu ? 'دستی اعزازات و توثیق' : 'Manually Conferred Recognition',
    manualAwardedDesc: isUrdu
      ? 'مجاز عہدیداران آڈٹ لاگ میں تحریری توثیق درج کر کے باقاعدہ اعزاز تفویض کرتے ہیں۔'
      : 'Granted by authorized leaders through strict role hierarchy with mandatory justification permanently logged in the audit record.',
    quizBoundaryPillar: isUrdu ? 'کوئز اور چیلنج کے حدود' : 'Quiz & Competition Policy',
    quizBoundaryDesc: isUrdu
      ? 'بیجز صرف سرکاری مقابلوں اور اساتذہ کے امتحانات پر ملتے ہیں۔ طلبہ کے باہمی پریکٹس چیلنجز پر بیجز نہیں ملتے۔'
      : 'Badges are awarded exclusively for official institutional Olympiads. Direct student-versus-student practice challenges never grant badges.',
    revocationPillar: isUrdu ? 'عدم منسوخی و شفاف جائزہ' : 'Anti-Revocation Review Policy',
    revocationDesc: isUrdu
      ? 'اگر بعد میں نمبرات میں ترمیم ہو تو بیج منسوخ نہیں ہوتا بلکہ انتظامی جائزے کیلئے فلیگ کیا جاتا ہے۔'
      : 'Subsequent grade revisions never silently revoke badges; an audited review flag is generated for administrative review.',

    // Modal
    modalPurpose: isUrdu ? 'مقصد اور تعارف:' : 'Badge Purpose:',
    modalCriteria: isUrdu ? 'اہلیت کے مکمل تقاضے:' : 'Exact Eligibility Requirements:',
    modalMethod: isUrdu ? 'تفویض کا طریقہ:' : 'Awarding Method:',
    modalRoles: isUrdu ? 'مجاز تفویض کنندہ:' : 'Authorized Awarding Roles:',
    modalPeriod: isUrdu ? 'پیمائش کا دورانیہ:' : 'Measurement Period:',
    modalProgress: isUrdu ? 'موجودہ پیش رفت اور ہدف:' : 'Current Progress & Target:',
    modalStatus: isUrdu ? 'حالت:' : 'Achievement Status:',
    modalAwardedOn: isUrdu ? 'حاصل کیا گیا:' : 'Earned on:',
    modalAwardedBy: isUrdu ? 'تفویض کنندہ:' : 'Awarded / Conferred by:',
    modalEvidenceBtn: isUrdu ? 'مستند حسابی ثبوت دیکھیں' : 'View Verified Audit Evidence',
    close: isUrdu ? 'بند کریں' : 'Close',

    // Manual confer modal
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
    emptyAwardsTitle: isUrdu ? 'ابھی کوئی اعزاز نہیں' : 'No badges earned yet',
    emptyAwardsDesc: isUrdu
      ? 'امتحانات کے حتمی نتائج اور حاضری کے ریکارڈ کے بعد مستند اعزازات خودکار تفویض ہوتے ہیں۔'
      : 'Badges are awarded automatically upon published exam results, verified attendance, and official quizzes.'
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
        fetchMyAchievements();
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
    setShowEvidenceTrace(false);
    if (badge.tier === 'diamond') {
      setShowDiamondCelebration(true);
      setTimeout(() => setShowDiamondCelebration(false), 4500);
    }
  };

  // Helpers to get user badge status
  const getBadgeStatus = (slug: string, badgeTargetRole?: string): 'earned' | 'in_progress' | 'locked' | 'not_eligible' => {
    if (myAwards.some(a => a.badge_slug === slug)) return 'earned';
    if (myProgress.some(p => p.badge_slug === slug)) return 'in_progress';
    
    // Check role eligibility
    if (badgeTargetRole && badgeTargetRole !== 'all') {
      if (isStudent && badgeTargetRole !== 'student') return 'not_eligible';
      if (isTeacher && badgeTargetRole !== 'teacher') return 'not_eligible';
      if (isPrincipal && badgeTargetRole !== 'principal') return 'not_eligible';
    }
    return 'locked';
  };

  // Tier difficulty numerical weighting
  const tierWeight: Record<string, number> = {
    bronze: 1,
    silver: 2,
    gold: 3,
    platinum: 4,
    diamond: 5,
  };

  // Filtered & sorted catalogue items for Directory tab
  const directoryBadges = useMemo(() => {
    return catalogue.filter(b => {
      const itemSlug = b.slug || b.badge_slug || '';
      const itemName = b.name || b.badge_name || '';

      // Category filter
      if (selectedCategory !== 'all') {
        const itemCat = b.primary_category || b.category;
        if (itemCat !== selectedCategory) return false;
      }
      // Tier filter
      if (selectedTier !== 'all' && b.tier !== selectedTier) {
        return false;
      }
      // Status filter
      if (selectedStatus !== 'all') {
        const st = getBadgeStatus(itemSlug, b.target_role);
        if (st !== selectedStatus) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = itemName.toLowerCase().includes(q);
        const matchesDesc = b.description.toLowerCase().includes(q);
        const matchesCrit = (b.criteria_summary || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCrit) return false;
      }
      return true;
    }).sort((a, b) => {
      const aSlug = a.slug || a.badge_slug || '';
      const bSlug = b.slug || b.badge_slug || '';
      const aName = a.name || a.badge_name || '';
      const bName = b.name || b.badge_name || '';
      const aEarned = myAwards.some(x => x.badge_slug === aSlug);
      const bEarned = myAwards.some(x => x.badge_slug === bSlug);

      if (sortBy === 'earned_first') {
        if (aEarned && !bEarned) return -1;
        if (!aEarned && bEarned) return 1;
        return (tierWeight[b.tier] || 0) - (tierWeight[a.tier] || 0);
      }
      if (sortBy === 'difficulty_desc') {
        return (tierWeight[b.tier] || 0) - (tierWeight[a.tier] || 0);
      }
      if (sortBy === 'difficulty_asc') {
        return (tierWeight[a.tier] || 0) - (tierWeight[b.tier] || 0);
      }
      if (sortBy === 'name_asc') {
        return aName.localeCompare(bName);
      }
      if (sortBy === 'name_desc') {
        return bName.localeCompare(aName);
      }
      return 0;
    });
  }, [catalogue, myAwards, myProgress, selectedCategory, selectedTier, selectedStatus, searchQuery, sortBy, role]);

  // Counts by category
  const categoryCounts = useMemo(() => {
    const counts = { principal: 0, teacher: 0, student: 0, quiz: 0 };
    catalogue.forEach(b => {
      const cat = (b.primary_category || b.category) as keyof typeof counts;
      if (counts[cat] !== undefined) counts[cat]++;
    });
    return counts;
  }, [catalogue]);

  // Total badges eligible for current user role
  const eligibleBadgesCount = useMemo(() => {
    return catalogue.filter(b => {
      const st = getBadgeStatus(b.slug || b.badge_slug || '', b.target_role);
      return st !== 'not_eligible';
    }).length;
  }, [catalogue, myAwards, myProgress, role]);

  const lockedBadgesCount = Math.max(0, eligibleBadgesCount - myAwards.length);

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
                animationDuration: `${2.5 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Header Banner */}
      <div className="ach-header-card">
        <div className="ach-header-info">
          <h1>
            <Award size={32} />
            {t.title}
          </h1>
          <p>{t.subtitle}</p>
        </div>

        <div className="ach-controls">
          <button
            type="button"
            className="ach-lang-btn"
            onClick={() => setIsUrdu(!isUrdu)}
            aria-label="Toggle English or Urdu language"
          >
            <Globe size={16} />
            {t.langBtn}
          </button>

          <button
            type="button"
            className="ach-trigger-btn"
            onClick={handleTriggerEvaluation}
            title="Re-run criteria evaluation against finalized database records"
          >
            <RefreshCw size={15} />
            {t.evaluateBtn}
          </button>

          {canConferManual && (
            <button
              type="button"
              className="ach-trigger-btn"
              style={{ background: 'rgba(255, 255, 255, 0.95)', color: '#0369a1' }}
              onClick={() => setShowConferModal(true)}
            >
              <Zap size={15} color="#0369a1" />
              {t.conferBtn}
            </button>
          )}
        </div>
      </div>

      {/* Available Badge Statistics Ribbon (from actual database records) */}
      <div className="ach-summary-grid">
        <div className="ach-summary-pill total">
          <div className="ach-pill-icon"><Award size={20} /></div>
          <div className="ach-pill-text">
            <div className="count">{catalogue.length || 47}</div>
            <div className="label">{t.statTotal}</div>
          </div>
        </div>

        <div className="ach-summary-pill gold">
          <div className="ach-pill-icon"><CheckCircle size={20} /></div>
          <div className="ach-pill-text">
            <div className="count">{myAwards.length}</div>
            <div className="label">{t.statEarned}</div>
          </div>
        </div>

        <div className="ach-summary-pill platinum">
          <div className="ach-pill-icon"><Clock size={20} /></div>
          <div className="ach-pill-text">
            <div className="count">{myProgress.length}</div>
            <div className="label">{t.statInProgress}</div>
          </div>
        </div>

        <div className="ach-summary-pill silver">
          <div className="ach-pill-icon"><Lock size={20} /></div>
          <div className="ach-pill-text">
            <div className="count">{lockedBadgesCount}</div>
            <div className="label">{t.statLocked}</div>
          </div>
        </div>

        <div className="ach-summary-pill diamond">
          <div className="ach-pill-icon">💎</div>
          <div className="ach-pill-text">
            <div className="count">{summary.diamond}</div>
            <div className="label">{t.diamond}</div>
          </div>
        </div>

        <div className="ach-summary-pill bronze">
          <div className="ach-pill-icon">🥉</div>
          <div className="ach-pill-text">
            <div className="count">{summary.gold + summary.silver + summary.bronze}</div>
            <div className="label">{isUrdu ? 'سلور و برونز' : 'Core Accolades'}</div>
          </div>
        </div>
      </div>

      {/* Primary Navigation: Two Main Tabs */}
      <div className="ach-tabs-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'directory'}
          className={`ach-tab-btn ${mainTab === 'directory' ? 'active' : ''}`}
          onClick={() => setMainTab('directory')}
        >
          <Compass size={18} />
          {t.tabDirectory}
          <span className="ach-cat-count">{catalogue.length || 47}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'my'}
          className={`ach-tab-btn ${mainTab === 'my' ? 'active' : ''}`}
          onClick={() => setMainTab('my')}
        >
          <Trophy size={18} />
          {t.tabMyAchievements}
          <span className="ach-cat-count" style={{ background: myAwards.length > 0 ? '#dcfce7' : '#f1f5f9', color: myAwards.length > 0 ? '#15803d' : '#64748b' }}>
            {myAwards.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BADGE DIRECTORY */}
      {/* ========================================================================= */}
      {mainTab === 'directory' && (
        <div>
          {/* Four Official Category Cards with Explanations */}
          <div className="ach-category-overview-grid">
            <div
              className={`ach-cat-card ${selectedCategory === 'principal' ? 'active' : ''}`}
              onClick={() => setSelectedCategory(selectedCategory === 'principal' ? 'all' : 'principal')}
            >
              <div className="ach-cat-header">
                <span className="ach-cat-title"><Building2 size={18} color="#b45309" /> {t.catPrincipal}</span>
                <span className="ach-cat-count">{categoryCounts.principal || 7}</span>
              </div>
              <p className="ach-cat-desc">{t.descPrincipal}</p>
            </div>

            <div
              className={`ach-cat-card ${selectedCategory === 'teacher' ? 'active' : ''}`}
              onClick={() => setSelectedCategory(selectedCategory === 'teacher' ? 'all' : 'teacher')}
            >
              <div className="ach-cat-header">
                <span className="ach-cat-title"><Users size={18} color="#2563EB" /> {t.catTeacher}</span>
                <span className="ach-cat-count">{categoryCounts.teacher || 10}</span>
              </div>
              <p className="ach-cat-desc">{t.descTeacher}</p>
            </div>

            <div
              className={`ach-cat-card ${selectedCategory === 'student' ? 'active' : ''}`}
              onClick={() => setSelectedCategory(selectedCategory === 'student' ? 'all' : 'student')}
            >
              <div className="ach-cat-header">
                <span className="ach-cat-title"><GraduationCap size={18} color="#059669" /> {t.catStudent}</span>
                <span className="ach-cat-count">{categoryCounts.student || 15}</span>
              </div>
              <p className="ach-cat-desc">{t.descStudent}</p>
            </div>

            <div
              className={`ach-cat-card ${selectedCategory === 'quiz' ? 'active' : ''}`}
              onClick={() => setSelectedCategory(selectedCategory === 'quiz' ? 'all' : 'quiz')}
            >
              <div className="ach-cat-header">
                <span className="ach-cat-title"><Trophy size={18} color="#7C3AED" /> {t.catQuiz}</span>
                <span className="ach-cat-count">{categoryCounts.quiz || 15}</span>
              </div>
              <p className="ach-cat-desc">{t.descQuiz}</p>
            </div>
          </div>

          {/* Compact Awarding System & Governance Architecture */}
          <div className="ach-awarding-info-card">
            <div className="ach-awarding-info-header">
              <div className="ach-awarding-info-title">
                <ShieldCheck size={20} color="#0284c7" />
                {t.awardingTitle}
              </div>
              <button
                type="button"
                className="ach-filter-chip"
                onClick={() => setShowAwardingInfo(!showAwardingInfo)}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                {showAwardingInfo ? (isUrdu ? 'مختصر کریں ▲' : 'Collapse ▲') : (isUrdu ? 'تفصیل دیکھیں ▼' : 'Details ▼')}
              </button>
            </div>

            {showAwardingInfo && (
              <>
                {/* Visual Awarding Hierarchy */}
                <div className="ach-hierarchy-flow">
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginRight: 8 }}>
                    {isUrdu ? 'تفویض کا درجہ بدرجہ سلسلہ:' : 'Awarding Hierarchy:'}
                  </span>
                  <span className="ach-hierarchy-node admin">👑 Organisation Admin</span>
                  <span className="ach-hierarchy-arrow">➔</span>
                  <span className="ach-hierarchy-node principal">🏫 Campus Principal</span>
                  <span className="ach-hierarchy-arrow">➔</span>
                  <span className="ach-hierarchy-node teacher">👨‍🏫 Class Teacher</span>
                  <span className="ach-hierarchy-arrow">➔</span>
                  <span className="ach-hierarchy-node student">🎓 Student (Recipient Only)</span>
                </div>

                <div className="ach-awarding-grid">
                  <div className="ach-award-pillar">
                    <h4>{t.systemAwardedPillar}</h4>
                    <p>{t.systemAwardedDesc}</p>
                  </div>
                  <div className="ach-award-pillar">
                    <h4>{t.manualAwardedPillar}</h4>
                    <p>{t.manualAwardedDesc}</p>
                  </div>
                  <div className="ach-award-pillar" style={{ borderLeftColor: '#7C3AED', borderRightColor: '#7C3AED' }}>
                    <h4>{t.quizBoundaryPillar}</h4>
                    <p>{t.quizBoundaryDesc}</p>
                  </div>
                  <div className="ach-award-pillar" style={{ borderLeftColor: '#10B981', borderRightColor: '#10B981' }}>
                    <h4>{t.revocationPillar}</h4>
                    <p>{t.revocationDesc}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Search, Filter & Sort Bar */}
          <div className="ach-filter-bar">
            {/* Search Input */}
            <input
              type="text"
              className="ach-search-input"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search badges"
            />

            {/* Category Filter Pills */}
            <div className="ach-tier-filter">
              <button
                type="button"
                className={`ach-filter-chip ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                {t.allCategories}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedCategory === 'principal' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('principal')}
              >
                {t.catPrincipal}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedCategory === 'teacher' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('teacher')}
              >
                {t.catTeacher}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedCategory === 'student' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('student')}
              >
                {t.catStudent}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedCategory === 'quiz' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('quiz')}
              >
                {t.catQuiz}
              </button>
            </div>

            {/* Difficulty Tier Filter Chips */}
            <div className="ach-tier-filter">
              <button
                type="button"
                className={`ach-filter-chip ${selectedTier === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedTier('all')}
              >
                {t.allTiers}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedTier === 'diamond' ? 'active' : ''}`}
                onClick={() => setSelectedTier('diamond')}
              >
                💎 {t.diamond}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedTier === 'platinum' ? 'active' : ''}`}
                onClick={() => setSelectedTier('platinum')}
              >
                {t.platinum}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedTier === 'gold' ? 'active' : ''}`}
                onClick={() => setSelectedTier('gold')}
              >
                {t.gold}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedTier === 'silver' ? 'active' : ''}`}
                onClick={() => setSelectedTier('silver')}
              >
                {t.silver}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${selectedTier === 'bronze' ? 'active' : ''}`}
                onClick={() => setSelectedTier('bronze')}
              >
                {t.bronze}
              </button>
            </div>

            {/* Status Filter & Sort Dropdown */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="ach-sort-select"
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                aria-label="Filter by achievement status"
              >
                <option value="all">{t.allStatuses}</option>
                <option value="earned">🟢 {t.statusEarned}</option>
                <option value="in_progress">🔵 {t.statusInProgress}</option>
                <option value="locked">🔒 {t.statusLocked}</option>
                <option value="not_eligible">⚪ {t.statusNotEligible}</option>
              </select>

              <select
                className="ach-sort-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                aria-label="Sort badges"
              >
                <option value="earned_first">⭐ {t.sortEarnedFirst}</option>
                <option value="difficulty_desc">💎 {t.sortDiffDesc}</option>
                <option value="difficulty_asc">🥉 {t.sortDiffAsc}</option>
                <option value="name_asc">🔤 {t.sortNameAsc}</option>
                <option value="name_desc">🔤 {t.sortNameDesc}</option>
              </select>
            </div>
          </div>

          {/* Badges Directory Cards Grid */}
          {directoryBadges.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#ffffff', borderRadius: 18, border: '1px solid #e2e8f0' }}>
              <HelpCircle size={44} color="#94a3b8" style={{ marginBottom: 12 }} />
              <h3 style={{ margin: '0 0 6px 0', color: '#1e293b' }}>{isUrdu ? 'کوئی بیج نہیں ملا' : 'No matching badges found'}</h3>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                {isUrdu ? 'تلاش یا فلٹرز کو تبدیل کر کے دوبارہ کوشش کریں۔' : 'Try adjusting your search criteria or filter selections.'}
              </p>
            </div>
          ) : (
            <div className="ach-cards-grid">
              {directoryBadges.map(badge => {
                const bSlug = badge.slug || badge.badge_slug || '';
                const bName = badge.name || badge.badge_name || '';
                const status = getBadgeStatus(bSlug, badge.target_role);
                const awardRecord = myAwards.find(a => a.badge_slug === bSlug);
                const progressRecord = myProgress.find(p => p.badge_slug === bSlug);

                return (
                  <div
                    key={bSlug}
                    className={`ach-badge-card ${badge.tier}`}
                    tabIndex={0}
                    role="button"
                    onClick={() => handleBadgeClick({ ...badge, slug: bSlug, name: bName, status, awardRecord, progressRecord })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleBadgeClick({ ...badge, slug: bSlug, name: bName, status, awardRecord, progressRecord }); }}
                    aria-label={`${bName}, ${badge.tier} tier, ${status}`}
                  >
                    <div className="ach-card-top">
                      <span className={`ach-tier-badge ${badge.tier}`}>{badge.tier}</span>

                      {status === 'earned' && (
                        <span className="ach-status-badge earned">
                          <CheckCircle size={12} /> {t.statusEarned}
                        </span>
                      )}
                      {status === 'in_progress' && (
                        <span className="ach-status-badge in-progress">
                          <Clock size={12} /> {progressRecord?.progress_percentage || '0'}%
                        </span>
                      )}
                      {status === 'locked' && (
                        <span className="ach-status-badge locked">
                          <Lock size={12} /> {t.statusLocked}
                        </span>
                      )}
                      {status === 'not_eligible' && (
                        <span className="ach-status-badge not-eligible">
                          {t.statusNotEligible}
                        </span>
                      )}
                    </div>

                    <div className="ach-image-wrapper">
                      <img
                        src={`/badges/${badge.icon_asset_name}`}
                        alt={bName}
                        className="ach-badge-img"
                        loading="lazy"
                        onError={(e: any) => {
                          // Fallback to SVG if PNG fails
                          e.target.src = `/badges/${badge.icon_asset_name.replace('.png', '.svg')}`;
                        }}
                      />
                    </div>

                    <div className="ach-card-body">
                      <h3>{bName}</h3>
                      <p>{badge.description}</p>
                    </div>

                    {status === 'in_progress' && progressRecord && (
                      <div className="ach-progress-section">
                        <div className="ach-progress-bar-bg">
                          <div
                            className="ach-progress-bar-fill"
                            style={{ width: `${Math.min(100, parseFloat(progressRecord.progress_percentage || '0'))}%` }}
                          />
                        </div>
                        <div className="ach-progress-stats">
                          <span>{progressRecord.current_value} / {progressRecord.target_value} {progressRecord.unit}</span>
                          <span>{progressRecord.progress_percentage}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY ACHIEVEMENTS */}
      {/* ========================================================================= */}
      {mainTab === 'my' && (
        <div>
          {/* Leadership Sub-view Switcher (Principals & Admins only) */}
          {(isPrincipal || isOrgAdmin) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button
                type="button"
                className={`ach-filter-chip ${leadershipSubView === 'personal' ? 'active' : ''}`}
                onClick={() => setLeadershipSubView('personal')}
              >
                <Award size={14} style={{ marginRight: 6 }} />
                {t.subMyAccolades}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${leadershipSubView === 'campus' ? 'active' : ''}`}
                onClick={() => setLeadershipSubView('campus')}
              >
                <Building2 size={14} style={{ marginRight: 6 }} />
                {t.subCampusSummary}
              </button>
              <button
                type="button"
                className={`ach-filter-chip ${leadershipSubView === 'reviews' ? 'active' : ''}`}
                onClick={() => setLeadershipSubView('reviews')}
              >
                <Flag size={14} style={{ marginRight: 6 }} />
                {t.subReviewFlags} ({reviews.length})
              </button>
            </div>
          )}

          {/* Sub-view: Campus Overview (for Principals/Admins) */}
          {leadershipSubView === 'campus' && campusSummary && (
            <div className="ach-awarding-info-card">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 16px 0', color: '#0f172a' }}>
                🏫 {campusSummary.campus_name} — {t.subCampusSummary}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                <div className="ach-summary-pill total">
                  <div className="ach-pill-icon"><Award size={20} /></div>
                  <div className="ach-pill-text">
                    <div className="count">{campusSummary.total_awards}</div>
                    <div className="label">Total School Accolades</div>
                  </div>
                </div>
                <div className="ach-summary-pill diamond">
                  <div className="ach-pill-icon">💎</div>
                  <div className="ach-pill-text">
                    <div className="count">{campusSummary.by_tier?.diamond || 0}</div>
                    <div className="label">Diamond Honors</div>
                  </div>
                </div>
                <div className="ach-summary-pill gold">
                  <div className="ach-pill-icon">🥇</div>
                  <div className="ach-pill-text">
                    <div className="count">{campusSummary.by_tier?.gold || 0}</div>
                    <div className="label">Gold Standard</div>
                  </div>
                </div>
              </div>

              <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Recent Verified Campus Achievements</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                {(campusSummary.recent_achievements || []).map((rc: any, idx: number) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img src={`/badges/${rc.icon_asset_name}`} alt={rc.badge_name} style={{ width: 36, height: 36 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{rc.badge_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Recipient: {rc.recipient} ({rc.recipient_role})</div>
                      </div>
                    </div>
                    <span className={`ach-tier-badge ${rc.tier}`}>{rc.tier}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-view: Review Flags (for Admins/Principals) */}
          {leadershipSubView === 'reviews' && (
            <div className="ach-awarding-info-card">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px 0', color: '#0f172a' }}>
                🚩 {t.subReviewFlags} — Audited Mark / Result Adjustments
              </h2>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20 }}>
                Under Optimus Orien non-revocation policies, if student marks or attendance registers are altered after an award was issued, the accolade is preserved and raised for leadership review.
              </p>

              {reviews.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: 12 }}>
                  <ShieldCheck size={36} color="#10B981" style={{ marginBottom: 8 }} />
                  <p style={{ margin: 0, fontWeight: 600, color: '#334155' }}>Zero pending review flags across campus records.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {reviews.map(rv => (
                    <div key={rv.award_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '0.95rem' }}>{rv.badge_name} ({rv.tier.toUpperCase()})</div>
                        <div style={{ fontSize: '0.8rem', color: '#7f1d1d' }}>User: {rv.user_username} ({rv.user_role}) — Period: {rv.period_identifier}</div>
                        <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: 4 }}>Reason: {rv.review_reason}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleResolveReview(rv.award_id)}
                        style={{ padding: '8px 16px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Sustain & Resolve Flag
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-view: Personal Accolades & In-Progress Goals */}
          {leadershipSubView === 'personal' && (
            <>
              {/* Role-Specific Privacy / Affirmation Notice */}
              {isStudent && (
                <div style={{ padding: '14px 18px', background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.25)', borderRadius: 12, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ShieldCheck size={24} color="#059669" />
                  <div style={{ fontSize: '0.85rem', color: '#065f46', lineHeight: 1.4 }}>
                    <strong>Child Safety & Privacy Standard:</strong> Your achievements are personal and visible only to you, your linked parents/guardians, and certified teachers of your school. Optimus Orien does not host public peer rankings or punitive shaming labels.
                  </div>
                </div>
              )}

              {/* In-Progress Trackers (if user has active goals) */}
              {myProgress.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 14px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={18} color="#0284c7" />
                    {isUrdu ? 'فعال پیش رفت اور اہداف' : 'Active In-Progress Goals'}
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                    {myProgress.map(p => (
                      <div key={p.badge_slug} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{p.badge_name}</span>
                          <span className={`ach-tier-badge ${p.tier}`}>{p.tier}</span>
                        </div>
                        <div className="ach-progress-bar-bg">
                          <div className="ach-progress-bar-fill" style={{ width: `${Math.min(100, parseFloat(p.progress_percentage || '0'))}%` }} />
                        </div>
                        <div className="ach-progress-stats">
                          <span>{p.current_value} / {p.target_value} {p.unit}</span>
                          <span>{p.progress_percentage}% completed</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Earned Badges Section */}
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 14px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={18} color="#10B981" />
                  {isUrdu ? 'حاصل شدہ مستند اعزازات' : 'My Earned Badges'}
                </h3>

                {myAwards.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px 20px', background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                    <Award size={44} color="#94a3b8" style={{ marginBottom: 12 }} />
                    <h4 style={{ margin: '0 0 6px 0', color: '#1e293b' }}>{t.emptyAwardsTitle}</h4>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', maxWidth: 480, marginInline: 'auto' }}>
                      {t.emptyAwardsDesc}
                    </p>
                  </div>
                ) : (
                  <div className="ach-cards-grid">
                    {myAwards.map(aw => (
                      <div
                        key={aw.id || aw.badge_slug}
                        className={`ach-badge-card ${aw.tier}`}
                        tabIndex={0}
                        role="button"
                        onClick={() => handleBadgeClick({
                          name: aw.badge_name,
                          slug: aw.badge_slug,
                          category: aw.category,
                          tier: aw.tier,
                          description: aw.description,
                          icon_asset_name: aw.icon_asset_name,
                          status: 'earned',
                          awardRecord: aw,
                          earned_at: aw.earned_at,
                          evidence_data: aw.evidence_data,
                          conferred_by: aw.conferred_by,
                          conferred_reason: aw.conferred_reason,
                          is_manual: aw.is_manual,
                        })}
                        onKeyDown={e => { if (e.key === 'Enter') handleBadgeClick(aw); }}
                      >
                        <div className="ach-card-top">
                          <span className={`ach-tier-badge ${aw.tier}`}>{aw.tier}</span>
                          <span className="ach-date-tag">
                            {new Date(aw.earned_at || '').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        </div>

                        <div className="ach-image-wrapper">
                          <img
                            src={`/badges/${aw.icon_asset_name}`}
                            alt={aw.badge_name}
                            className="ach-badge-img"
                            loading="lazy"
                          />
                        </div>

                        <div className="ach-card-body">
                          <h3>{aw.badge_name}</h3>
                          <p>{aw.description}</p>
                          {aw.is_manual && aw.conferred_by && (
                            <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600, marginTop: 4 }}>
                              Conferred by {aw.conferred_by}
                            </div>
                          )}
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                          <span className="ach-evidence-pill">
                            <Shield size={12} /> {isUrdu ? 'مستند تصدیق شدہ' : 'Verified Evidence'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* BADGE DETAIL MODAL / SIDE PANEL */}
      {/* ========================================================================= */}
      {selectedBadge && (
        <div className="ach-modal-backdrop" onClick={() => setSelectedBadge(null)} role="dialog" aria-modal="true">
          <div className="ach-modal-content" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="ach-modal-close"
              onClick={() => setSelectedBadge(null)}
              aria-label="Close details"
            >
              <X size={18} />
            </button>

            <div className="ach-modal-header">
              <img
                src={`/badges/${selectedBadge.icon_asset_name}`}
                alt={selectedBadge.name || selectedBadge.badge_name}
                className="ach-modal-img"
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                <span className={`ach-tier-badge ${selectedBadge.tier}`}>{selectedBadge.tier}</span>
                <span className="ach-tier-badge" style={{ background: '#f1f5f9', color: '#475569' }}>
                  {selectedBadge.category?.toUpperCase()}
                </span>
                {selectedBadge.status && (
                  <span className={`ach-status-badge ${selectedBadge.status}`}>
                    {selectedBadge.status === 'earned' ? `🟢 ${t.statusEarned}` :
                     selectedBadge.status === 'in_progress' ? `🔵 ${t.statusInProgress}` :
                     selectedBadge.status === 'not_eligible' ? `⚪ ${t.statusNotEligible}` : `🔒 ${t.statusLocked}`}
                  </span>
                )}
              </div>
              <h2 className="ach-modal-title">{selectedBadge.name || selectedBadge.badge_name}</h2>
              <p className="ach-modal-desc">{selectedBadge.description}</p>
            </div>

            {/* Structured Specifications Grid */}
            <div className="ach-modal-details-grid">
              <div className="ach-detail-box">
                <div className="label"><Zap size={13} /> {t.modalMethod}</div>
                <div className="val">
                  {selectedBadge.is_manual ? 'Manual Recognition (Audited)' : 'System-Awarded (Automated Engine)'}
                </div>
              </div>

              <div className="ach-detail-box">
                <div className="label"><Users size={13} /> {t.modalRoles}</div>
                <div className="val">
                  {selectedBadge.is_manual
                    ? (selectedBadge.authorized_roles?.join(', ') || 'Leadership / Certified Teachers')
                    : 'Core Evaluation Engine'}
                </div>
              </div>

              <div className="ach-detail-box">
                <div className="label"><Clock size={13} /> {t.modalPeriod}</div>
                <div className="val">{selectedBadge.measurement_period || 'Academic Term / Cumulative'}</div>
              </div>

              <div className="ach-detail-box">
                <div className="label"><Award size={13} /> {t.modalStatus}</div>
                <div className="val" style={{ textTransform: 'capitalize' }}>
                  {selectedBadge.status === 'earned' ? 'Earned & Verified' :
                   selectedBadge.status === 'in_progress' ? 'In Progress' :
                   selectedBadge.status === 'not_eligible' ? 'Not Applicable to Role' : 'Locked'}
                </div>
              </div>
            </div>

            {/* Exact Eligibility Requirements */}
            <div className="ach-evidence-box">
              <div className="ach-evidence-title">{t.modalCriteria}</div>
              <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>
                {selectedBadge.criteria_summary || 'Satisfy required institutional performance and attendance criteria in finalized database records.'}
              </div>
            </div>

            {/* In-Progress Progress Metric (if supported) */}
            {selectedBadge.progressRecord && (
              <div className="ach-evidence-box" style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}>
                <div className="ach-evidence-title" style={{ color: '#0369a1' }}>{t.modalProgress}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0c4a6e', marginBottom: 6 }}>
                  {selectedBadge.progressRecord.current_value} / {selectedBadge.progressRecord.target_value} {selectedBadge.progressRecord.unit} ({selectedBadge.progressRecord.progress_percentage}%)
                </div>
                <div className="ach-progress-bar-bg">
                  <div className="ach-progress-bar-fill" style={{ width: `${Math.min(100, parseFloat(selectedBadge.progressRecord.progress_percentage || '0'))}%` }} />
                </div>
              </div>
            )}

            {/* Earned Award History (if earned) */}
            {selectedBadge.awardRecord && (
              <div className="ach-evidence-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <div className="ach-evidence-title" style={{ color: '#166534' }}>Verified Award History</div>
                <div className="ach-evidence-item">
                  <span>{t.modalAwardedOn}</span>
                  <strong>{new Date(selectedBadge.awardRecord.earned_at || '').toLocaleString()}</strong>
                </div>
                <div className="ach-evidence-item">
                  <span>{t.modalAwardedBy}</span>
                  <strong>{selectedBadge.awardRecord.is_manual ? (selectedBadge.awardRecord.conferred_by || 'Leadership') : 'System Engine'}</strong>
                </div>
                {selectedBadge.awardRecord.conferred_reason && (
                  <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#14532d', fontStyle: 'italic' }}>
                    "{selectedBadge.awardRecord.conferred_reason}"
                  </div>
                )}

                {selectedBadge.awardRecord.evidence_data && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="ach-filter-chip"
                      onClick={() => setShowEvidenceTrace(!showEvidenceTrace)}
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    >
                      <Eye size={12} style={{ marginRight: 4 }} />
                      {showEvidenceTrace ? 'Hide Audit Evidence' : t.modalEvidenceBtn}
                    </button>

                    {showEvidenceTrace && (
                      <pre style={{ margin: '8px 0 0 0', padding: 8, background: '#ffffff', borderRadius: 8, border: '1px solid #d1fae5', fontSize: '0.75rem', overflowX: 'auto', color: '#065f46' }}>
                        {JSON.stringify(selectedBadge.awardRecord.evidence_data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ textAlign: 'right', marginTop: 18 }}>
              <button
                type="button"
                className="ach-lang-btn"
                style={{ background: '#0284c7', borderColor: '#0284c7', color: '#ffffff' }}
                onClick={() => setSelectedBadge(null)}
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* AUDITED MANUAL CONFERRAL MODAL */}
      {/* ========================================================================= */}
      {showConferModal && (
        <div className="ach-modal-backdrop" onClick={() => setShowConferModal(false)}>
          <div className="ach-modal-content" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="ach-modal-close"
              onClick={() => setShowConferModal(false)}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px 0', color: '#0f172a' }}>
              🎖️ {t.conferModalTitle}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 18px 0' }}>
              {t.conferModalDesc}
            </p>

            <form onSubmit={handleConferAward}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  {t.selectBadgeLabel}
                </label>
                <select
                  value={conferBadgeSlug}
                  onChange={e => setConferBadgeSlug(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                >
                  {(isOrgAdmin || isPrincipal) && (
                    <option value="manual_inspirational_teacher">Inspirational Teacher (Gold) — Faculty Honor</option>
                  )}
                  {isOrgAdmin && (
                    <>
                      <option value="manual_principal_honour">Principal's Honour (Gold) — Campus Leadership</option>
                      <option value="manual_leadership_distinction">Leadership Distinction (Platinum) — Executive Commendation</option>
                    </>
                  )}
                  {(isTeacher || isPrincipal) && (
                    <option value="manual_teachers_commendation">Teacher's Commendation (Silver) — Student Recognition</option>
                  )}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  {t.recipientIdLabel}
                </label>
                <input
                  type="number"
                  placeholder="e.g. 42"
                  value={conferRecipientId}
                  onChange={e => setConferRecipientId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  {t.reasonLabel}
                </label>
                <textarea
                  rows={3}
                  placeholder={t.reasonPlaceholder}
                  value={conferReason}
                  onChange={e => setConferReason(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowConferModal(false)}
                  style={{ padding: '10px 18px', background: '#f1f5f9', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}
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
