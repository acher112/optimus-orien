import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Trophy, Award, Clock, CheckCircle2,
  Plus, Users, Share2, Globe, Building2, MapPin,
  ChevronRight, ChevronLeft, Sparkles, X, RefreshCw, Zap, Lock, Calendar
} from 'lucide-react';
import {
  communicationApi,
  QuizCompetitionItem,
  QuizQuestionItem,
  QuizAttemptResult,
  CountryPerformanceStat
} from './communicationApi';
import './communication.css';

interface OnlineAssessmentsViewProps {
  notify?: (msg: string, type?: string) => void;
  user?: any;
  activeCampusId?: number | null;
  campuses?: Array<{ id: number; name: string; city?: string }>;
}

const PRESET_SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Computer Science',
  'English',
  'History',
  'Geography',
  'Economics',
  'General Knowledge',
];

const DIFFICULTY_LEVELS = [
  { value: 'Foundation', label: 'Foundation (Easy)', desc: 'Core concepts & basics' },
  { value: 'Intermediate', label: 'Intermediate (Medium)', desc: 'Analytical problem solving' },
  { value: 'Advanced', label: 'Advanced (Hard)', desc: 'Multi-step & deep reasoning' },
  { value: 'Olympiad', label: 'Olympiad (Expert)', desc: 'Competition-grade mastery' },
];

const COUNTRY_OPTIONS = [
  'Pakistan',
  'United Kingdom',
  'UAE',
  'Saudi Arabia',
  'Malaysia',
  'Sri Lanka',
  'India',
  'Singapore',
  'United States',
  'Canada',
  'Australia',
];

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTimeDisplay(iso?: string | null): string {
  if (!iso) return 'Open Anytime';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) + ', ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export default function OnlineAssessmentsView({
  notify,
  user,
  activeCampusId,
  campuses = [],
}: OnlineAssessmentsViewProps) {
  // Two Tabs ONLY: 'available' (Quiz Available) & 'attempted' (Attempted)
  const [activeTab, setActiveTab] = useState<'available' | 'attempted'>('available');

  // Available Quizzes State
  const [availableQuizzes, setAvailableQuizzes] = useState<QuizCompetitionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [availScopeFilter, setAvailScopeFilter] = useState<'all' | 'worldwide' | 'org_campuses' | 'our_campus'>('all');
  const [availSearch, setAvailSearch] = useState('');
  const [detectedCountry, setDetectedCountry] = useState('Pakistan');
  const [detectedRegion, setDetectedRegion] = useState('Pakistan');

  // Invite code join state
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  // Live Exam Taker State
  const [activeExamComp, setActiveExamComp] = useState<QuizCompetitionItem | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuizQuestionItem[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState<number>(600);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [submittingExam, setSubmittingExam] = useState<boolean>(false);
  const [participantCountry, setParticipantCountry] = useState<string>('Pakistan');
  const timerRef = useRef<any>(null);
  const answersRef = useRef<Record<string, any>>({});
  const timeRemRef = useRef<number>(600);

  // Graded Results Modal (Rapid Result & Breakdown Review)
  const [gradedResult, setGradedResult] = useState<QuizAttemptResult | null>(null);

  // Rules & Standings Modal
  const [rulesModalComp, setRulesModalComp] = useState<QuizCompetitionItem | null>(null);
  const [rulesStandings, setRulesStandings] = useState<any[]>([]);

  // Attempted Tab State
  const [attemptedRows, setAttemptedRows] = useState<any[]>([]);
  const [countryAnalytics, setCountryAnalytics] = useState<CountryPerformanceStat[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [quizFilterOptions, setQuizFilterOptions] = useState<any[]>([]);
  const [myAttemptSummary, setMyAttemptSummary] = useState<any>(null);
  const [attemptedScope, setAttemptedScope] = useState<string>('all');
  const [attemptedCountryFilter, setAttemptedCountryFilter] = useState<string>('all');
  const [attemptedQuizFilter, setAttemptedQuizFilter] = useState<string>('');
  const [mineOnly, setMineOnly] = useState<boolean>(false);
  const [standingsLoading, setStandingsLoading] = useState(false);

  // Create AI Quiz Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [selectedSubjectOption, setSelectedSubjectOption] = useState('Mathematics');
  const [customSubjectInput, setCustomSubjectInput] = useState('');
  const [newQuizTopic, setNewQuizTopic] = useState('');
  const [newQuizGrade, setNewQuizGrade] = useState('All Grades');
  const [newQuizDifficulty, setNewQuizDifficulty] = useState('Intermediate');
  const [newQuizNumQuestions, setNewQuizNumQuestions] = useState(5);
  const [newQuizDuration, setNewQuizDuration] = useState(10);
  const [newQuizScope, setNewQuizScope] = useState<'our_campus' | 'org_campuses' | 'worldwide'>('worldwide');
  const [targetSchoolId, setTargetSchoolId] = useState<string>(() =>
    activeCampusId ? String(activeCampusId) : (user?.school ? String(user.school) : (campuses[0]?.id ? String(campuses[0].id) : ''))
  );
  const [newQuizStartTime, setNewQuizStartTime] = useState<string>(() => toLocalDateTimeInput(new Date()));
  const [newQuizEndTime, setNewQuizEndTime] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return toLocalDateTimeInput(d);
  });
  const [generatedPreview, setGeneratedPreview] = useState<any[]>([]);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [creatingQuiz, setCreatingQuiz] = useState(false);

  useEffect(() => {
    if (activeCampusId) {
      setTargetSchoolId(String(activeCampusId));
    } else if (user?.school) {
      setTargetSchoolId(String(user.school));
    } else if (campuses.length > 0 && !targetSchoolId) {
      setTargetSchoolId(String(campuses[0].id));
    }
  }, [activeCampusId, user?.school, campuses, targetSchoolId]);

  const effectiveSubject =
    selectedSubjectOption === '__custom__' ? customSubjectInput.trim() : selectedSubjectOption;

  // Fetch Available Quizzes
  const loadQuizzes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await communicationApi.getCompetitions();
      const all = res.available_quizzes || [...(res.official_competitions || []), ...(res.student_challenges || [])];
      setAvailableQuizzes(all);
      if (res.participant_country) {
        setDetectedCountry(res.participant_country);
        setParticipantCountry(res.participant_country);
      }
      if (res.participant_region) {
        setDetectedRegion(res.participant_region);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Attempted Records & Country Performance Analytics
  const loadAttempted = useCallback(async () => {
    setStandingsLoading(true);
    try {
      const res = await communicationApi.getQuizLeaderboard({
        quiz_id: attemptedQuizFilter || undefined,
        scope: attemptedScope,
        country: attemptedCountryFilter,
        mine_only: mineOnly,
      });
      setAttemptedRows(res.results || []);
      setCountryAnalytics(res.country_analytics || []);
      setAvailableCountries(res.available_countries || []);
      setQuizFilterOptions(res.quiz_options || []);
      setMyAttemptSummary(res.my_summary || null);
    } catch (err) {
      console.error(err);
    } finally {
      setStandingsLoading(false);
    }
  }, [attemptedQuizFilter, attemptedScope, attemptedCountryFilter, mineOnly]);

  useEffect(() => {
    if (activeTab === 'attempted') {
      loadAttempted();
    } else {
      loadQuizzes();
    }
  }, [activeTab, loadQuizzes, loadAttempted]);

  // Keep refs synced for auto-submit
  useEffect(() => {
    answersRef.current = userAnswers;
  }, [userAnswers]);

  useEffect(() => {
    timeRemRef.current = timeRemaining;
  }, [timeRemaining]);

  const submitExamInternal = useCallback(async (comp: QuizCompetitionItem) => {
    setSubmittingExam(true);
    setTimerActive(false);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const totalSeconds = (comp.duration_minutes || 10) * 60;
      const timeSpent = Math.max(1, totalSeconds - timeRemRef.current);
      const res = await communicationApi.submitAttempt(
        comp.id,
        answersRef.current,
        timeSpent,
        {
          country: participantCountry || detectedCountry,
          region: participantCountry && participantCountry !== detectedCountry ? participantCountry : detectedRegion,
        }
      );
      setActiveExamComp(null);
      setGradedResult(res);
      notify?.(`Rapid Result: ${res.score_percentage}% (${res.accuracy_percentage}% accuracy) — Saved to profile!`);
      loadQuizzes();
      loadAttempted();
    } catch (err: any) {
      notify?.(err.message || 'Submission failed', 'error');
    } finally {
      setSubmittingExam(false);
    }
  }, [participantCountry, detectedCountry, detectedRegion, notify, loadQuizzes, loadAttempted]);

  // Live Exam Countdown Timer
  useEffect(() => {
    if (!timerActive || !activeExamComp) return;
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          submitExamInternal(activeExamComp);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive, activeExamComp, submitExamInternal]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Start Quiz Session (checks single attempt & window)
  const handleStartExam = async (comp: QuizCompetitionItem) => {
    if (comp.user_attempt?.attempted) {
      notify?.('You have already attempted this quiz. Only 1 attempt is permitted.', 'error');
      return;
    }
    setExamLoading(true);
    try {
      const details = await communicationApi.getCompetitionDetails(comp.id);
      if (details.has_attempted && details.existing_attempt) {
        notify?.('Single-Attempt Lock: Showing your recorded result.');
        setGradedResult({
          message: 'Recorded Single-Attempt Result',
          attempt_id: details.existing_attempt.attempt_id || 0,
          competition_id: comp.id,
          title: comp.title,
          subject: comp.subject,
          difficulty: comp.difficulty,
          scope_label: comp.scope_label,
          score_percentage: details.existing_attempt.score_percentage,
          raw_score: details.existing_attempt.raw_score || 0,
          total_marks: details.existing_attempt.total_marks || comp.total_marks,
          accuracy_percentage: details.existing_attempt.accuracy_percentage,
          time_spent_seconds: details.existing_attempt.time_spent_seconds,
          country: details.existing_attempt.country,
          region: details.existing_attempt.region,
          is_official: comp.is_official,
          graded_breakdown: details.existing_attempt.graded_breakdown || [],
        });
        loadQuizzes();
        return;
      }

      if (details.window_status === 'scheduled') {
        notify?.('This quiz has not started yet.', 'error');
        return;
      }
      if (details.window_status === 'ended') {
        notify?.('This quiz window has already ended.', 'error');
        return;
      }

      if (details.participant_country) setParticipantCountry(details.participant_country);
      const durSecs = (comp.duration_minutes || 10) * 60;
      setActiveExamComp(comp);
      setExamQuestions(details.questions || []);
      setCurrentQIndex(0);
      setUserAnswers({});
      answersRef.current = {};
      setTimeRemaining(durSecs);
      timeRemRef.current = durSecs;
      setTimerActive(true);
    } catch (err: any) {
      notify?.(err.message || 'Error opening assessment', 'error');
    } finally {
      setExamLoading(false);
    }
  };

  // View Already-Attempted Result Breakdown
  const handleViewRecordedAttempt = async (comp: QuizCompetitionItem) => {
    try {
      const details = await communicationApi.getCompetitionDetails(comp.id);
      if (details.existing_attempt) {
        setGradedResult({
          message: 'Saved Single-Attempt Performance Record',
          attempt_id: details.existing_attempt.attempt_id || 0,
          competition_id: comp.id,
          title: comp.title,
          subject: comp.subject,
          difficulty: comp.difficulty,
          scope_label: comp.scope_label,
          score_percentage: details.existing_attempt.score_percentage,
          raw_score: details.existing_attempt.raw_score || 0,
          total_marks: details.existing_attempt.total_marks || comp.total_marks,
          accuracy_percentage: details.existing_attempt.accuracy_percentage,
          time_spent_seconds: details.existing_attempt.time_spent_seconds,
          country: details.existing_attempt.country,
          region: details.existing_attempt.region,
          saved_to_profile: true,
          is_official: comp.is_official,
          graded_breakdown: details.existing_attempt.graded_breakdown || [],
        });
      } else {
        setActiveTab('attempted');
      }
    } catch (err: any) {
      notify?.(err.message || 'Could not load recorded attempt', 'error');
    }
  };

  // Join via Invite Code
  const handleJoinByCode = async () => {
    if (!inviteCodeInput.trim()) return;
    setJoinLoading(true);
    try {
      const res = await communicationApi.joinQuizByCode(inviteCodeInput.trim());
      notify?.(`Joined: ${res.title}! Starting quiz...`);
      await handleStartExam(res);
      setInviteCodeInput('');
    } catch (err: any) {
      notify?.(err.message || 'Invalid or restricted invitation code', 'error');
    } finally {
      setJoinLoading(false);
    }
  };

  // Rules & Standings modal
  const handleOpenRules = async (comp: QuizCompetitionItem) => {
    setRulesModalComp(comp);
    setRulesStandings([]);
    try {
      const res = await communicationApi.getCompetitionStandings(comp.id);
      setRulesStandings(res.standings || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAnswerChange = (qId: number, val: any) => {
    setUserAnswers((prev) => ({ ...prev, [String(qId)]: val }));
  };

  // Preview / Regenerate AI Questions from saved dummy bank
  const handleGeneratePreview = async () => {
    if (!effectiveSubject) {
      notify?.('Please select a subject or type your custom subject first.', 'error');
      return;
    }
    setGeneratingPreview(true);
    try {
      const res = await communicationApi.generateQuizQuestions({
        subject: effectiveSubject,
        topic: newQuizTopic,
        difficulty: newQuizDifficulty,
        grade_level: newQuizGrade,
        num_questions: newQuizNumQuestions,
      });
      setGeneratedPreview(res.questions || []);
      notify?.(`Generated ${res.questions?.length || 0} random ${newQuizDifficulty} questions for ${effectiveSubject}!`);
    } catch (err: any) {
      notify?.(err.message || 'Failed to generate preview questions', 'error');
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleCreateQuizSubmit = async () => {
    if (!effectiveSubject) {
      notify?.('Please select a subject or enter a custom subject.', 'error');
      return;
    }
    if (newQuizStartTime && newQuizEndTime && new Date(newQuizEndTime) <= new Date(newQuizStartTime)) {
      notify?.('End time must be after start time.', 'error');
      return;
    }
    if (newQuizScope === 'our_campus' && !targetSchoolId && !user?.school) {
      notify?.('Please select a campus for a campus-only quiz.', 'error');
      return;
    }

    setCreatingQuiz(true);
    try {
      const res = await communicationApi.createQuiz({
        title: newQuizTitle.trim() || `${effectiveSubject} (${newQuizDifficulty}) AI Quiz`,
        subject: effectiveSubject,
        topic: newQuizTopic.trim(),
        grade_level: newQuizGrade,
        difficulty: newQuizDifficulty,
        duration_minutes: newQuizDuration,
        num_questions: newQuizNumQuestions,
        scope: newQuizScope,
        target_school_id: newQuizScope === 'our_campus' ? targetSchoolId : undefined,
        start_time: newQuizStartTime ? new Date(newQuizStartTime).toISOString() : null,
        end_time: newQuizEndTime ? new Date(newQuizEndTime).toISOString() : null,
        questions: generatedPreview.length > 0 ? generatedPreview : undefined,
      });
      notify?.(`Quiz published to Quiz Available! Invite Code: ${res.invite_code}`);
      setCreateModalOpen(false);
      setNewQuizTitle('');
      setNewQuizTopic('');
      setCustomSubjectInput('');
      setGeneratedPreview([]);
      // Ensure newly created quiz immediately shows in Tab 1 (Quiz Available)
      setActiveTab('available');
      setAvailScopeFilter('all');
      await loadQuizzes();
    } catch (err: any) {
      notify?.(err.message || 'Error creating quiz', 'error');
    } finally {
      setCreatingQuiz(false);
    }
  };

  // Filtered available quizzes
  const filteredQuizzes = availableQuizzes.filter((q) => {
    if (availScopeFilter !== 'all' && q.scope !== availScopeFilter) return false;
    if (availSearch.trim()) {
      const needle = availSearch.trim().toLowerCase();
      const hay = `${q.title} ${q.subject} ${q.topic || ''} ${q.created_by_name || ''} ${q.invite_code}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const bestCountry = countryAnalytics.length > 0 ? countryAnalytics[0] : null;

  return (
    <div className="comm-page-wrapper">
      <div className="comm-suite-container">
        {/* Hero Banner */}
        <div className="comm-hero-banner comm-hero-assessments">
          <div className="comm-hero-content">
            <h1 className="comm-hero-title">
              <Award size={32} /> Online Assessments &amp; Quiz Competitions
            </h1>
            <p className="comm-hero-desc">
              AI-ready randomized quizzes with custom subjects, campus or worldwide audiences, rapid instant grading, country performance rankings, and single-attempt profile tracking.
            </p>
          </div>
          <div className="comm-hero-actions">
            <button
              className="comm-hero-btn-solid"
              onClick={() => {
                setGeneratedPreview([]);
                setNewQuizStartTime(toLocalDateTimeInput(new Date()));
                const d = new Date();
                d.setDate(d.getDate() + 3);
                setNewQuizEndTime(toLocalDateTimeInput(d));
                setCreateModalOpen(true);
              }}
            >
              <Plus size={16} /> Create AI Quiz &amp; Invite
            </button>
          </div>
        </div>

        {/* Two Tabs Bar ONLY (per Screenshot: Quiz Available & Attempted) */}
        <div className="comm-tabs-bar">
          <button
            className={`comm-tab-pill ${activeTab === 'available' ? 'active-assessments' : ''}`}
            onClick={() => setActiveTab('available')}
          >
            <Trophy size={16} /> Quiz Available
            {availableQuizzes.length > 0 && (
              <span
                style={{
                  marginLeft: 4,
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: activeTab === 'available' ? 'rgba(255,255,255,0.25)' : '#ede9fe',
                  color: activeTab === 'available' ? '#ffffff' : '#6d28d9',
                }}
              >
                {availableQuizzes.length}
              </span>
            )}
          </button>
          <button
            className={`comm-tab-pill ${activeTab === 'attempted' ? 'active-assessments' : ''}`}
            onClick={() => setActiveTab('attempted')}
          >
            <Award size={16} /> Attempted
          </button>
        </div>

        {/* =================================================================
            TAB 1: QUIZ AVAILABLE
           ================================================================= */}
        {activeTab === 'available' && (
          <>
            {/* Join Via Code + Scope & Search Filter */}
            <div className="comm-filter-surface" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: '1 1 260px' }}>
                  <strong style={{ fontSize: 14, display: 'block', marginBottom: 2, color: '#1e1633' }}>
                    Join via Invitation Code
                  </strong>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Every student can attempt each quiz <strong>1 time only</strong>. Results are graded rapidly and saved to your student performance profile.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Enter Code (e.g. MATH-433)"
                    className="comm-input comm-mono"
                    style={{ width: 195, textTransform: 'uppercase', fontWeight: 800, paddingLeft: 14 }}
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  />
                  <button
                    className="comm-btn-attempt"
                    style={{ padding: '8px 18px', borderRadius: 10 }}
                    onClick={handleJoinByCode}
                    disabled={joinLoading}
                  >
                    {joinLoading ? 'Checking...' : 'Join & Start'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 12, borderTop: '1px solid rgba(226, 232, 240, 0.8)' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { key: 'all', label: 'All Available' },
                    { key: 'worldwide', label: 'Worldwide (All Campuses)' },
                    { key: 'org_campuses', label: 'All Our Campuses' },
                    { key: 'our_campus', label: 'Only Our Campus' },
                  ].map((s) => (
                    <button
                      key={s.key}
                      className={`comm-cat-pill ${availScopeFilter === s.key ? 'active' : ''}`}
                      style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => setAvailScopeFilter(s.key as any)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="comm-input"
                  style={{ width: 240, paddingLeft: 12, fontSize: 12.5 }}
                  placeholder="Filter by title, subject, or creator..."
                  value={availSearch}
                  onChange={(e) => setAvailSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Available Quizzes Grid */}
            {loading ? (
              <div style={{ padding: 50, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                Loading available quizzes...
              </div>
            ) : filteredQuizzes.length === 0 ? (
              <div style={{ padding: 50, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                No quizzes match this filter yet. Click <strong>Create AI Quiz &amp; Invite</strong> to generate one!
              </div>
            ) : (
              <div className="comm-cards-grid">
                {filteredQuizzes.map((comp) => {
                  const hasAttempted = Boolean(comp.user_attempt?.attempted);
                  const wStatus = comp.window_status || 'live';
                  const scopeBadgeColor =
                    comp.scope === 'our_campus'
                      ? { bg: '#ecfeff', color: '#0e7490' }
                      : comp.scope === 'org_campuses'
                      ? { bg: '#eef2ff', color: '#4338ca' }
                      : { bg: '#f0fdf4', color: '#15803d' };

                  return (
                    <div key={comp.id} className="comm-card comm-card-assessment">
                      <div>
                        {/* Badges Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#ede9fe', color: '#6d28d9' }}>
                              {comp.subject}
                            </span>
                            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
                              {comp.difficulty}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: scopeBadgeColor.bg, color: scopeBadgeColor.color }}>
                              {comp.scope === 'worldwide' ? 'Worldwide' : comp.scope === 'org_campuses' ? 'All Our Campuses' : 'Only Our Campus'}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: wStatus === 'live' ? '#dcfce7' : wStatus === 'scheduled' ? '#fef9c3' : '#f1f5f9',
                                color: wStatus === 'live' ? '#166534' : wStatus === 'scheduled' ? '#854d0e' : '#64748b',
                              }}
                            >
                              {wStatus === 'live' ? 'Live' : wStatus === 'scheduled' ? 'Scheduled' : 'Ended'}
                            </span>
                          </div>
                        </div>

                        <h3 style={{ fontSize: 16, fontWeight: 800, margin: '6px 0 4px', color: '#1e1633' }}>
                          {comp.title}
                        </h3>
                        {comp.topic && (
                          <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, marginBottom: 6 }}>
                            Topic: {comp.topic}
                          </div>
                        )}

                        {/* Creator Details */}
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                          Created by:{' '}
                          <strong style={{ color: '#1e1633' }}>
                            {comp.created_by_name || comp.sponsor_name}
                          </strong>
                          {comp.created_by_role && (
                            <span style={{ marginLeft: 5, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 700 }}>
                              {comp.created_by_role}
                            </span>
                          )}
                          {comp.created_by_campus && (
                            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                              Campus: {comp.target_school_name || comp.created_by_campus}
                            </div>
                          )}
                        </div>

                        {/* Start Time & End Time Schedule */}
                        <div
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            padding: '8px 10px',
                            fontSize: 11.5,
                            color: '#475569',
                            marginBottom: 12,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span><Calendar size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />Start:</span>
                            <strong style={{ color: '#1e1633' }}>{formatDateTimeDisplay(comp.start_time)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span><Clock size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />End:</span>
                            <strong style={{ color: '#1e1633' }}>{formatDateTimeDisplay(comp.end_time)}</strong>
                          </div>
                        </div>

                        {/* Quiz Parameters Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#475569', marginBottom: 14 }}>
                          <div>Timer: <strong style={{ color: '#1e1633' }}>{comp.duration_minutes} Mins</strong></div>
                          <div>Questions: <strong style={{ color: '#1e1633' }}>{comp.questions_count} ({comp.total_marks} Pts)</strong></div>
                          <div>Participants: <strong className="comm-tabular" style={{ color: '#1e1633' }}>{comp.attempts_count ?? comp.registered_count}</strong></div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>Code:</span>
                            <strong className="comm-mono" style={{ color: '#7c3aed' }}>{comp.invite_code}</strong>
                            {comp.invite_code && (
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', padding: 2 }}
                                title="Copy Invite Code"
                                onClick={() => {
                                  navigator.clipboard?.writeText(comp.invite_code);
                                  notify?.(`Invite code ${comp.invite_code} copied!`);
                                }}
                              >
                                <Share2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 14, borderTop: '1px solid rgba(241, 245, 249, 0.9)', flexWrap: 'wrap' }}>
                        <button
                          className="comm-btn-rules"
                          onClick={() => handleOpenRules(comp)}
                        >
                          Rules &amp; Standings
                        </button>

                        {hasAttempted ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="comm-badge-recorded">
                              <CheckCircle2 size={14} /> Attempted ({comp.user_attempt?.score}%)
                            </span>
                            <button
                              className="comm-cat-pill"
                              style={{ padding: '6px 10px', fontSize: 11.5 }}
                              onClick={() => handleViewRecordedAttempt(comp)}
                            >
                              View Result
                            </button>
                          </div>
                        ) : wStatus === 'scheduled' ? (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, background: '#fef9c3', color: '#854d0e' }}>
                            Starts Soon
                          </span>
                        ) : wStatus === 'ended' ? (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, background: '#f1f5f9', color: '#64748b' }}>
                            Window Ended
                          </span>
                        ) : (
                          <button
                            className="comm-btn-attempt"
                            disabled={examLoading}
                            onClick={() => handleStartExam(comp)}
                          >
                            {examLoading ? 'Opening...' : 'Attempt Quiz (1 Try)'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* =================================================================
            TAB 2: ATTEMPTED (Details, Region/Country Performance & Rapid Standings)
           ================================================================= */}
        {activeTab === 'attempted' && (
          <div>
            {/* Best Performing Country Highlight Banner */}
            {bestCountry && (
              <div
                style={{
                  background: 'linear-gradient(120deg, #4c1d95 0%, #6d28d9 55%, #0284c7 100%)',
                  color: '#ffffff',
                  borderRadius: 16,
                  padding: '20px 24px',
                  marginBottom: 18,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16,
                  boxShadow: '0 8px 20px rgba(109, 40, 217, 0.2)',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fde68a', marginBottom: 4 }}>
                    #1 Best Performing Country / Region
                  </div>
                  <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Trophy size={22} color="#fbbf24" /> {bestCountry.country}
                  </h3>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>
                    Top Performer: <strong>{bestCountry.top_performer || '—'}</strong> (Best Score: {bestCountry.best_score}%) • {bestCountry.participants} Participant{bestCountry.participants === 1 ? '' : 's'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: '10px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#e0e7ff' }}>Avg Score</div>
                    <div className="comm-mono" style={{ fontSize: 20, fontWeight: 900 }}>{bestCountry.avg_score}%</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: '10px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#e0e7ff' }}>Accuracy</div>
                    <div className="comm-mono" style={{ fontSize: 20, fontWeight: 900 }}>{bestCountry.avg_accuracy}%</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: '10px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#e0e7ff' }}>Avg Speed</div>
                    <div className="comm-tabular" style={{ fontSize: 20, fontWeight: 900 }}>{bestCountry.avg_time_display}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Country / Region Performance Comparison Cards */}
            {countryAnalytics.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1e1633', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Globe size={17} color="#7c3aed" /> Country &amp; Region Performance Comparison
                  </h3>
                  {attemptedCountryFilter !== 'all' && (
                    <button
                      className="comm-cat-pill"
                      style={{ padding: '4px 10px', fontSize: 11.5 }}
                      onClick={() => setAttemptedCountryFilter('all')}
                    >
                      Show All Countries
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {countryAnalytics.map((c) => {
                    const isSelected = attemptedCountryFilter.toLowerCase() === c.country.toLowerCase();
                    return (
                      <div
                        key={c.country}
                        onClick={() => setAttemptedCountryFilter(isSelected ? 'all' : c.country)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? '#f5f3ff' : '#ffffff',
                          border: isSelected ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                          borderRadius: 14,
                          padding: '14px 16px',
                          transition: 'all 0.15s',
                          boxShadow: '0 2px 6px rgba(15,23,42,0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: '#1e1633', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MapPin size={14} color="#7c3aed" /> {c.country}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: c.rank === 1 ? '#fef3c7' : '#f1f5f9',
                              color: c.rank === 1 ? '#92400e' : '#475569',
                            }}
                          >
                            #{c.rank}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                          <div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>Avg Score</div>
                            <strong className="comm-mono" style={{ color: '#7c3aed', fontSize: 15 }}>{c.avg_score}%</strong>
                          </div>
                          <div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>Accuracy</div>
                            <strong className="comm-mono" style={{ color: '#059669', fontSize: 15 }}>{c.avg_accuracy}%</strong>
                          </div>
                          <div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>Students</div>
                            <strong className="comm-tabular" style={{ color: '#1e1633' }}>{c.participants}</strong>
                          </div>
                          <div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>Avg Time</div>
                            <strong className="comm-tabular" style={{ color: '#1e1633' }}>{c.avg_time_display}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Personal Attempt Summary Banner (if user has attempted quizzes) */}
            {myAttemptSummary && myAttemptSummary.total_attempted > 0 && (
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: 14,
                  padding: '12px 18px',
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={17} /> Your Recorded Profile Performance:
                  <span>{myAttemptSummary.total_attempted} Quiz{myAttemptSummary.total_attempted === 1 ? '' : 'zes'} Attempted</span>
                </div>
                <div style={{ display: 'flex', gap: 18, fontSize: 13, color: '#047857' }}>
                  <span>Avg Score: <strong>{myAttemptSummary.average_score}%</strong></span>
                  <span>Best Score: <strong>{myAttemptSummary.best_score}%</strong></span>
                  <span>Avg Accuracy: <strong>{myAttemptSummary.average_accuracy}%</strong></span>
                </div>
              </div>
            )}

            {/* Controls / Filters Bar */}
            <div className="comm-filter-surface" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="comm-view-switch">
                  <button
                    className={`comm-view-switch-btn ${!mineOnly ? 'active' : ''}`}
                    onClick={() => setMineOnly(false)}
                  >
                    All Participants
                  </button>
                  <button
                    className={`comm-view-switch-btn ${mineOnly ? 'active' : ''}`}
                    onClick={() => setMineOnly(true)}
                  >
                    My Attempts
                  </button>
                </div>

                <select
                  className="comm-select"
                  value={attemptedQuizFilter}
                  onChange={(e) => setAttemptedQuizFilter(e.target.value)}
                >
                  <option value="">All Quizzes</option>
                  {quizFilterOptions.map((qo) => (
                    <option key={qo.id} value={String(qo.id)}>
                      {qo.title} ({qo.attempts_count})
                    </option>
                  ))}
                </select>

                <select
                  className="comm-select"
                  value={attemptedCountryFilter}
                  onChange={(e) => setAttemptedCountryFilter(e.target.value)}
                >
                  <option value="all">All Regions / Countries</option>
                  {availableCountries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'All Scopes' },
                  { key: 'worldwide', label: 'Worldwide' },
                  { key: 'org_campuses', label: 'All Our Campuses' },
                  { key: 'our_campus', label: 'Only Our Campus' },
                ].map((sc) => (
                  <button
                    key={sc.key}
                    className={`comm-cat-pill ${attemptedScope === sc.key ? 'active' : ''}`}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    onClick={() => setAttemptedScope(sc.key)}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Detailed Participant Attempted Standings Table */}
            <div className="comm-table-card">
              <div className="comm-table-wrap">
                <table className="comm-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Rank</th>
                      <th>Student / Participant</th>
                      <th>Region / Country</th>
                      <th>Quiz &amp; Subject</th>
                      <th>Score</th>
                      <th>Accuracy</th>
                      <th>Rapid Time</th>
                      <th>Attempted At</th>
                      <th style={{ textAlign: 'right' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsLoading ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                          Loading attempted quiz details...
                        </td>
                      </tr>
                    ) : attemptedRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
                          No quiz attempts recorded for these filters yet. Attempt a quiz from <strong>Quiz Available</strong> to see rapid results here!
                        </td>
                      </tr>
                    ) : (
                      attemptedRows.map((st, idx) => (
                        <tr key={st.attempt_id || idx} style={{ background: st.is_current_user ? 'rgba(237, 233, 254, 0.4)' : 'transparent' }}>
                          <td>
                            <span className="comm-rank-pill">{st.rank}</span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#1e1633' }}>
                              {st.name}
                              {st.is_current_user && (
                                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: '#ede9fe', color: '#7c3aed', marginLeft: 6, fontWeight: 700 }}>
                                  You
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                              {st.school} • {st.role}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#1e1633', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <MapPin size={13} color="#7c3aed" /> {st.country}
                            </div>
                            {st.region && st.region !== st.country && (
                              <div style={{ fontSize: 11.5, color: '#64748b' }}>{st.region}</div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#1e1633' }}>{st.assessment}</div>
                            <div style={{ fontSize: 11.5, color: '#64748b' }}>
                              {st.subject} • {st.difficulty} • {st.scope_label}
                            </div>
                          </td>
                          <td>
                            <strong className="comm-mono" style={{ color: '#7c3aed', fontSize: 14 }}>{st.score}%</strong>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{st.raw_score} / {st.total_marks} pts</div>
                          </td>
                          <td>
                            <span style={{ color: '#059669', fontWeight: 700 }}>{st.accuracy}%</span>
                          </td>
                          <td>
                            <div className="comm-tabular" style={{ fontWeight: 700, color: '#1e1633' }}>{st.time}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{st.speed_seconds_per_question}s / Q</div>
                          </td>
                          <td style={{ fontSize: 12, color: '#64748b' }}>
                            {formatDateTimeDisplay(st.submitted_at)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {st.can_view_breakdown && st.graded_breakdown?.length > 0 ? (
                              <button
                                className="comm-cat-pill"
                                style={{ padding: '5px 10px', fontSize: 11.5 }}
                                onClick={() =>
                                  setGradedResult({
                                    message: 'Saved Quiz Attempt Breakdown',
                                    attempt_id: st.attempt_id,
                                    competition_id: st.competition_id,
                                    title: st.assessment,
                                    subject: st.subject,
                                    difficulty: st.difficulty,
                                    scope_label: st.scope_label,
                                    score_percentage: st.score,
                                    raw_score: st.raw_score,
                                    total_marks: st.total_marks,
                                    accuracy_percentage: st.accuracy,
                                    time_spent_seconds: st.time_spent_seconds,
                                    speed_seconds_per_question: st.speed_seconds_per_question,
                                    country: st.country,
                                    region: st.region,
                                    rank: st.rank,
                                    saved_to_profile: true,
                                    is_official: false,
                                    graded_breakdown: st.graded_breakdown,
                                  })
                                }
                              >
                                View Review
                              </button>
                            ) : (
                              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Recorded</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            LIVE EXAM TAKER MODAL
           ================================================================= */}
        {activeExamComp && examQuestions.length > 0 && (
          <div className="comm-modal-backdrop">
            <div className="comm-modal-dialog" style={{ maxWidth: 860 }}>
              <div className="comm-modal-header">
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>{activeExamComp.title}</h2>
                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <span>{activeExamComp.subject} • {activeExamComp.difficulty} • Single Attempt</span>
                    <span>• Region:</span>
                    <select
                      value={participantCountry}
                      onChange={(e) => setParticipantCountry(e.target.value)}
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#1e1633',
                      }}
                    >
                      {!COUNTRY_OPTIONS.includes(participantCountry) && (
                        <option value={participantCountry}>{participantCountry}</option>
                      )}
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="comm-timer-pill">
                  <Clock size={16} />
                  <span>{formatTimer(timeRemaining)}</span>
                </div>
              </div>

              <div className="comm-modal-body">
                {/* Question Numbers Strip */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                  {examQuestions.map((q, idx) => {
                    const isAns = userAnswers[String(q.id)] !== undefined && userAnswers[String(q.id)] !== '';
                    const isCurrent = currentQIndex === idx;
                    return (
                      <button
                        key={q.id}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                          border: isCurrent ? '2px solid #7c3aed' : '1px solid rgba(254, 230, 133, 0.8)',
                          background: isCurrent ? 'linear-gradient(105deg, #7c3aed, #c026d3)' : isAns ? '#ecfdf5' : '#fffdf9',
                          color: isCurrent ? '#ffffff' : isAns ? '#047857' : '#475569',
                          transition: 'all 0.15s',
                        }}
                        onClick={() => setCurrentQIndex(idx)}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Current Question */}
                {examQuestions[currentQIndex] && (
                  <div style={{ background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 14, padding: 22 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, color: '#64748b' }}>
                      <span style={{ fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                        Question {currentQIndex + 1} of {examQuestions.length}
                      </span>
                      <span className="comm-mono" style={{ fontWeight: 700 }}>{examQuestions[currentQIndex].marks} Marks</span>
                    </div>

                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e1633', lineHeight: 1.5, marginBottom: 18 }}>
                      {examQuestions[currentQIndex].prompt}
                    </div>

                    {/* Numerical */}
                    {examQuestions[currentQIndex].question_type === 'numerical' && (
                      <div style={{ marginTop: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>
                          Enter Numerical Answer:
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input
                            type="number"
                            step="any"
                            className="comm-input comm-mono"
                            style={{ width: 180, fontSize: 16, fontWeight: 700, paddingLeft: 14 }}
                            value={userAnswers[String(examQuestions[currentQIndex].id)] ?? ''}
                            onChange={(e) => handleAnswerChange(examQuestions[currentQIndex].id, e.target.value)}
                          />
                          {examQuestions[currentQIndex].unit && (
                            <span style={{ fontWeight: 700, color: '#64748b' }}>{examQuestions[currentQIndex].unit}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Multiple Choice */}
                    {examQuestions[currentQIndex].question_type === 'multiple_choice' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                        {examQuestions[currentQIndex].options?.map((opt: any) => {
                          const isSel = userAnswers[String(examQuestions[currentQIndex].id)] === opt.id;
                          return (
                            <div
                              key={opt.id}
                              className={`comm-quiz-option ${isSel ? 'selected' : ''}`}
                              onClick={() => handleAnswerChange(examQuestions[currentQIndex].id, opt.id)}
                            >
                              <span style={{ fontWeight: 800, width: 22, color: isSel ? '#7c3aed' : '#64748b' }}>{opt.id}.</span>
                              <span>{opt.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* True / False */}
                    {examQuestions[currentQIndex].question_type === 'true_false' && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                        {['true', 'false'].map((tf) => {
                          const isSel = userAnswers[String(examQuestions[currentQIndex].id)] === tf;
                          return (
                            <button
                              key={tf}
                              type="button"
                              className={`comm-quiz-option ${isSel ? 'selected' : ''}`}
                              style={{ flex: 1, justifyContent: 'center', padding: 16, fontSize: 15, textTransform: 'capitalize' }}
                              onClick={() => handleAnswerChange(examQuestions[currentQIndex].id, tf)}
                            >
                              {tf === 'true' ? 'True' : 'False'}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Matching Pairs */}
                    {examQuestions[currentQIndex].question_type === 'matching' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                        {examQuestions[currentQIndex].options?.map((pair: any, pidx: number) => {
                          const curAnswers = userAnswers[String(examQuestions[currentQIndex].id)] || {};
                          return (
                            <div
                              key={pidx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                padding: 12,
                                background: '#fff',
                                border: '1px solid rgba(254, 230, 133, 0.7)',
                                borderRadius: 10,
                              }}
                            >
                              <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1e1633' }}>{pair.left}</span>
                              <select
                                className="comm-select"
                                style={{ flex: 1, maxWidth: 260 }}
                                value={curAnswers[pair.left] || ''}
                                onChange={(e) => {
                                  const updated = { ...curAnswers, [pair.left]: e.target.value };
                                  handleAnswerChange(examQuestions[currentQIndex].id, updated);
                                }}
                              >
                                <option value="">Select match...</option>
                                {pair.right_options?.map((ro: string, ri: number) => (
                                  <option key={ri} value={ro}>{ro}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="comm-modal-header" style={{ borderTop: '1px solid rgba(254, 230, 133, 0.75)', borderBottom: 'none' }}>
                <button
                  className="comm-cat-pill"
                  disabled={currentQIndex === 0}
                  onClick={() => setCurrentQIndex((p) => p - 1)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: currentQIndex === 0 ? 0.5 : 1 }}
                >
                  <ChevronLeft size={16} /> Previous
                </button>

                <div style={{ display: 'flex', gap: 10 }}>
                  {currentQIndex < examQuestions.length - 1 ? (
                    <button className="comm-btn-attempt" onClick={() => setCurrentQIndex((p) => p + 1)}>
                      Next Question <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      className="comm-btn-attempt"
                      style={{ background: 'linear-gradient(105deg, #0d9488, #10b981)' }}
                      onClick={() => submitExamInternal(activeExamComp)}
                      disabled={submittingExam}
                    >
                      {submittingExam ? 'Grading Rapid Result...' : 'Submit & Get Rapid Result'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            RAPID GRADED RESULTS MODAL
           ================================================================= */}
        {gradedResult && (
          <div className="comm-modal-backdrop" onClick={() => setGradedResult(null)}>
            <div className="comm-modal-dialog" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={18} color="#7c3aed" /> Rapid Result &amp; Performance Record
                  </h2>
                  {gradedResult.title && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {gradedResult.title} {gradedResult.subject ? `• ${gradedResult.subject}` : ''} {gradedResult.difficulty ? `• ${gradedResult.difficulty}` : ''}
                    </div>
                  )}
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setGradedResult(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="comm-modal-body">
                <div style={{ padding: 14, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, color: '#047857', fontWeight: 700, fontSize: 13, marginBottom: 18 }}>
                  <CheckCircle2 size={20} />
                  <span>
                    Saved to your Student Profile Performance Record (1-Attempt Lock active).
                    {gradedResult.country && ` Recorded Region: ${gradedResult.region || gradedResult.country}.`}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 22 }}>
                  <div style={{ padding: 14, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                    <div className="comm-mono" style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed' }}>
                      {gradedResult.score_percentage}%
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>
                      Score ({gradedResult.raw_score} / {gradedResult.total_marks} Pts)
                    </div>
                  </div>
                  <div style={{ padding: 14, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                    <div className="comm-mono" style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>
                      {gradedResult.accuracy_percentage}%
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>Accuracy</div>
                  </div>
                  <div style={{ padding: 14, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                    <div className="comm-tabular" style={{ fontSize: 22, fontWeight: 800, color: '#1e1633' }}>
                      {Math.floor(gradedResult.time_spent_seconds / 60)}m {gradedResult.time_spent_seconds % 60}s
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>
                      Rapid Speed {gradedResult.speed_seconds_per_question ? `(${gradedResult.speed_seconds_per_question}s/Q)` : ''}
                    </div>
                  </div>
                  <div style={{ padding: 14, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                    <div className="comm-mono" style={{ fontSize: 20, fontWeight: 800, color: '#0284c7' }}>
                      {gradedResult.rank ? `#${gradedResult.rank}` : 'Recorded'}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>
                      {gradedResult.country || 'Region Logged'}
                    </div>
                  </div>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, color: '#1e1633' }}>Rapid Answer Breakdown &amp; Explanations</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {gradedResult.graded_breakdown?.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background: item.is_correct ? '#f0fdf4' : '#fff1f2',
                        border: `1px solid ${item.is_correct ? '#bbf7d0' : '#fecdd3'}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontWeight: 700, fontSize: 13.5, gap: 10 }}>
                        <span style={{ color: '#1e1633' }}>Q{item.order}: {item.prompt}</span>
                        <span style={{ color: item.is_correct ? '#059669' : '#e11d48', whiteSpace: 'nowrap' }}>
                          {item.is_correct ? `+${item.marks_earned} Marks` : '0 Marks'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 4, color: '#475569' }}>
                        Your Answer: <strong style={{ color: '#1e1633' }}>{item.user_answer}</strong>
                      </div>
                      {!item.is_correct && (
                        <div style={{ fontSize: 13, color: '#059669', marginBottom: 4 }}>
                          Correct Answer: <strong>{item.correct_answer}</strong>
                        </div>
                      )}
                      {item.explanation && (
                        <div style={{ fontSize: 12, color: '#64748b', background: 'rgba(255,255,255,0.75)', padding: 8, borderRadius: 6, marginTop: 6 }}>
                          <strong>Explanation: </strong>{item.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="comm-cat-pill" onClick={() => setGradedResult(null)}>Close</button>
                  <button
                    className="comm-btn-attempt"
                    onClick={() => {
                      setGradedResult(null);
                      setActiveTab('attempted');
                    }}
                  >
                    Open Attempted &amp; Country Standings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            RULES & STANDINGS MODAL
           ================================================================= */}
        {rulesModalComp && (
          <div className="comm-modal-backdrop" onClick={() => setRulesModalComp(null)}>
            <div className="comm-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>{rulesModalComp.title} — Rules &amp; Standings</h2>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setRulesModalComp(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="comm-modal-body">
                <ul style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, paddingLeft: 20, marginBottom: 18 }}>
                  <li><strong>Strict 1-Attempt Lock:</strong> Every student may attempt this quiz only once.</li>
                  <li><strong>Rapid Instant Grading:</strong> Scores, accuracy, speed, and region are recorded immediately upon submission into your student performance profile.</li>
                  <li><strong>Tie-Breaker Order:</strong> <code>Score % → Fastest Completion Time → Accuracy %</code>.</li>
                </ul>

                <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10, color: '#1e1633' }}>Current Standings</h4>
                <div className="comm-table-card">
                  <div className="comm-table-wrap">
                    <table className="comm-table">
                      <thead>
                        <tr>
                          <th style={{ width: 60 }}>Rank</th>
                          <th>Student &amp; Campus</th>
                          <th>Country</th>
                          <th>Score</th>
                          <th>Accuracy</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rulesStandings.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                              No attempts recorded yet for this quiz.
                            </td>
                          </tr>
                        ) : (
                          rulesStandings.map((st, idx) => (
                            <tr key={idx}>
                              <td><span className="comm-rank-pill">{st.rank}</span></td>
                              <td>
                                <strong>{st.name}</strong>
                                <div style={{ fontSize: 12, color: '#64748b' }}>{st.school}</div>
                              </td>
                              <td>{st.country}</td>
                              <td><strong className="comm-mono" style={{ color: '#7c3aed' }}>{st.score}%</strong></td>
                              <td><span style={{ color: '#059669', fontWeight: 600 }}>{st.accuracy}%</span></td>
                              <td className="comm-tabular">{st.time}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 20, textAlign: 'right' }}>
                  <button className="comm-btn-attempt" onClick={() => setRulesModalComp(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================
            CREATE AI-GENERATED QUIZ MODAL
           ================================================================= */}
        {createModalOpen && (
          <div className="comm-modal-backdrop" onClick={() => setCreateModalOpen(false)}>
            <div className="comm-modal-dialog" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={18} color="#7c3aed" /> Create AI Quiz &amp; Publish
                  </h2>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Questions auto-generate randomly from saved question bank (ready for Groq / GPT LLM later).
                  </div>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setCreateModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="comm-modal-body">
                {/* Quiz Title & Subject (with Custom Subject!) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>
                      Quiz Title <span style={{ fontWeight: 400, color: '#64748b' }}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="comm-input"
                      placeholder={effectiveSubject ? `${effectiveSubject} (${newQuizDifficulty}) AI Quiz` : 'e.g. Global Robotics Sprint'}
                      value={newQuizTitle}
                      onChange={(e) => setNewQuizTitle(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>
                      Subject <span style={{ color: '#7c3aed' }}>*</span>
                    </label>
                    <select
                      className="comm-select"
                      style={{ width: '100%' }}
                      value={selectedSubjectOption}
                      onChange={(e) => {
                        setSelectedSubjectOption(e.target.value);
                        setGeneratedPreview([]);
                      }}
                    >
                      {PRESET_SUBJECTS.map((subj) => (
                        <option key={subj} value={subj}>{subj}</option>
                      ))}
                      <option value="__custom__">+ Custom Subject (Type Any Subject...)</option>
                    </select>
                  </div>
                </div>

                {/* Custom Subject Text Input when Custom Subject selected */}
                {selectedSubjectOption === '__custom__' && (
                  <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, marginBottom: 4, color: '#5b21b6' }}>
                      Enter Custom Subject Name (No Limit)
                    </label>
                    <input
                      type="text"
                      className="comm-input"
                      placeholder="e.g. Artificial Intelligence, Robotics, Astrophysics, Urdu, Islamic Studies, Data Science..."
                      value={customSubjectInput}
                      onChange={(e) => {
                        setCustomSubjectInput(e.target.value);
                        setGeneratedPreview([]);
                      }}
                    />
                  </div>
                )}

                {/* Topic / Focus & Grade / Question Count / Duration */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 16 }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>
                      Topic / AI Focus Prompt <span style={{ fontWeight: 400, color: '#64748b' }}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="comm-input"
                      placeholder="e.g. Quadratic Equations, Newton's Laws, Python Recursion, Macroeconomics..."
                      value={newQuizTopic}
                      onChange={(e) => {
                        setNewQuizTopic(e.target.value);
                        setGeneratedPreview([]);
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>Questions</label>
                    <select
                      className="comm-select"
                      style={{ width: '100%' }}
                      value={newQuizNumQuestions}
                      onChange={(e) => {
                        setNewQuizNumQuestions(Number(e.target.value));
                        setGeneratedPreview([]);
                      }}
                    >
                      {[5, 8, 10, 12, 15].map((n) => (
                        <option key={n} value={n}>{n} Random Questions</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>Timer (Minutes)</label>
                    <input
                      type="number"
                      className="comm-input comm-tabular"
                      min="1"
                      max="180"
                      value={newQuizDuration}
                      onChange={(e) => setNewQuizDuration(Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* Difficulty Selector */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#1e1633' }}>
                    Difficulty Level
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                    {DIFFICULTY_LEVELS.map((dl) => {
                      const active = newQuizDifficulty === dl.value;
                      return (
                        <button
                          key={dl.value}
                          type="button"
                          onClick={() => {
                            setNewQuizDifficulty(dl.value);
                            setGeneratedPreview([]);
                          }}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 10,
                            cursor: 'pointer',
                            border: active ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                            background: active ? '#f5f3ff' : '#ffffff',
                          }}
                        >
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: active ? '#6d28d9' : '#1e1633' }}>{dl.label}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{dl.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Target Audience Scope: Only Our Campus / All Our Campuses / Worldwide */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#1e1633' }}>
                    Audience &amp; Campus Access
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    {[
                      {
                        value: 'our_campus',
                        title: 'Only Our Campus',
                        desc: 'Restricted to students in this campus',
                        icon: <Building2 size={15} />,
                      },
                      {
                        value: 'org_campuses',
                        title: 'All Our Campuses',
                        desc: 'All campuses in our organisation',
                        icon: <Users size={15} />,
                      },
                      {
                        value: 'worldwide',
                        title: 'Worldwide (All Campuses)',
                        desc: 'Open globally to all schools & students',
                        icon: <Globe size={15} />,
                      },
                    ].map((opt) => {
                      const active = newQuizScope === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setNewQuizScope(opt.value as any)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderRadius: 10,
                            cursor: 'pointer',
                            border: active ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                            background: active ? '#f5f3ff' : '#ffffff',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: active ? '#6d28d9' : '#1e1633' }}>
                            {opt.icon} {opt.title}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>

                  {newQuizScope === 'our_campus' && campuses.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#475569' }}>
                        Select Target Campus
                      </label>
                      <select
                        className="comm-select"
                        style={{ width: '100%' }}
                        value={targetSchoolId}
                        onChange={(e) => setTargetSchoolId(e.target.value)}
                      >
                        {campuses.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name} {c.city ? `(${c.city})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Start Time & End Time */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>
                      Start Time
                    </label>
                    <input
                      type="datetime-local"
                      className="comm-input"
                      value={newQuizStartTime}
                      onChange={(e) => setNewQuizStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>
                      End Time
                    </label>
                    <input
                      type="datetime-local"
                      className="comm-input"
                      value={newQuizEndTime}
                      onChange={(e) => setNewQuizEndTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* AI Question Preview Box */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#1e1633', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Sparkles size={15} color="#7c3aed" /> AI Random Question Generator
                      </strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Currently powered by Saved Dummy Question Bank (Groq / GPT model ready).
                      </div>
                    </div>
                    <button
                      type="button"
                      className="comm-cat-pill"
                      style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700 }}
                      onClick={handleGeneratePreview}
                      disabled={generatingPreview}
                    >
                      <RefreshCw size={13} /> {generatingPreview ? 'Generating...' : generatedPreview.length > 0 ? 'Regenerate Random Set' : 'Preview Random Questions'}
                    </button>
                  </div>

                  {generatedPreview.length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                      {generatedPreview.map((q, idx) => (
                        <div key={idx} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#7c3aed', marginBottom: 3 }}>
                            <span>Q{idx + 1} • {String(q.question_type || '').replace('_', ' ').toUpperCase()}</span>
                            <span>{q.marks} Marks</span>
                          </div>
                          <div style={{ color: '#1e1633', fontWeight: 600 }}>{q.prompt}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Lock size={13} /> Single-attempt lock &amp; rapid grading enabled automatically.
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="comm-cat-pill" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                    <button
                      className="comm-btn-attempt"
                      disabled={creatingQuiz}
                      onClick={handleCreateQuizSubmit}
                    >
                      {creatingQuiz ? 'Generating & Publishing...' : 'Generate & Publish Quiz'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
