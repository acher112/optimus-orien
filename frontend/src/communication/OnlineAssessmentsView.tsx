import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Trophy, Award, BookOpen, Clock, CheckCircle2, AlertCircle,
  Plus, Users, Share2, Eye, SlidersHorizontal, Search, X, Check,
  ChevronRight, ChevronLeft, ShieldCheck, HelpCircle, FileText, Sparkles
} from 'lucide-react';
import {
  communicationApi,
  QuizCompetitionItem,
  QuizQuestionItem,
  QuizAttemptResult
} from './communicationApi';
import './communication.css';

interface OnlineAssessmentsViewProps {
  notify?: (msg: string, type?: string) => void;
}

export default function OnlineAssessmentsView({ notify }: OnlineAssessmentsViewProps) {
  const [activeTab, setActiveTab] = useState<'official' | 'student' | 'leaderboards'>('official');

  // Competitions data
  const [officialComps, setOfficialComps] = useState<QuizCompetitionItem[]>([]);
  const [studentChallenges, setStudentChallenges] = useState<QuizCompetitionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Invite code join state
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  // Live Exam Taker State
  const [activeExamComp, setActiveExamComp] = useState<QuizCompetitionItem | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuizQuestionItem[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [timeRemaining, setTimeRemaining] = useState<number>(900); // 15 mins default
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [submittingExam, setSubmittingExam] = useState<boolean>(false);
  const timerRef = useRef<any>(null);

  // Graded Results Modal
  const [gradedResult, setGradedResult] = useState<QuizAttemptResult | null>(null);

  // Rules & Standings Modal
  const [rulesModalComp, setRulesModalComp] = useState<QuizCompetitionItem | null>(null);

  // Peer Scores Comparison Modal
  const [peerScoresModalData, setPeerScoresModalData] = useState<any | null>(null);

  // Quiz Leaderboards State
  const [leaderboardCategory, setLeaderboardCategory] = useState<'official' | 'student'>('official');
  const [leaderboardScope, setLeaderboardScope] = useState<string>('global');
  const [quizStandings, setQuizStandings] = useState<any[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);

  // Create Quiz Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [newQuizSubject, setNewQuizSubject] = useState('Mathematics');
  const [newQuizGrade, setNewQuizGrade] = useState('Grade 8');
  const [newQuizTopic, setNewQuizTopic] = useState('Algebraic Equations');
  const [newQuizDuration, setNewQuizDuration] = useState(10);
  const [newQuizDifficulty, setNewQuizDifficulty] = useState('Intermediate');
  const [newQuizScope, setNewQuizScope] = useState('public');
  const [createdQuestions, setCreatedQuestions] = useState<any[]>([
    {
      prompt: 'Solve for x: 3x + 5 = 20',
      question_type: 'numerical',
      correct_answer: { value: 5.0 },
      unit: '',
      marks: 10,
      explanation: '3x = 15 => x = 5.'
    }
  ]);
  const [creatingQuiz, setCreatingQuiz] = useState(false);

  // Fetch Competitions
  const loadCompetitions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await communicationApi.getCompetitions();
      setOfficialComps(res.official_competitions || []);
      setStudentChallenges(res.student_challenges || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Standings for Leaderboards tab
  const loadLeaderboard = useCallback(async () => {
    setStandingsLoading(true);
    try {
      const res = await communicationApi.getQuizLeaderboard(leaderboardCategory, leaderboardScope);
      setQuizStandings(res.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setStandingsLoading(false);
    }
  }, [leaderboardCategory, leaderboardScope]);

  useEffect(() => {
    if (activeTab === 'leaderboards') {
      loadLeaderboard();
    } else {
      loadCompetitions();
    }
  }, [activeTab, loadCompetitions, loadLeaderboard]);

  // Live Exam Countdown Timer
  useEffect(() => {
    if (timerActive && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleSubmitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive, timeRemaining]);

  // Format Timer mm:ss
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Launch Live Exam Session
  const handleStartExam = async (comp: QuizCompetitionItem) => {
    setExamLoading(true);
    try {
      const details = await communicationApi.getCompetitionDetails(comp.id);
      setActiveExamComp(comp);
      setExamQuestions(details.questions || []);
      setCurrentQIndex(0);
      setUserAnswers({});
      setTimeRemaining((comp.duration_minutes || 15) * 60);
      setTimerActive(true);
    } catch (err: any) {
      notify?.(err.message || 'Error opening assessment', 'error');
    } finally {
      setExamLoading(false);
    }
  };

  // Submit Exam
  const handleSubmitExam = async () => {
    if (!activeExamComp) return;
    setSubmittingExam(true);
    setTimerActive(false);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const timeSpent = (activeExamComp.duration_minutes * 60) - timeRemaining;
      const res = await communicationApi.submitAttempt(
        activeExamComp.id,
        userAnswers,
        Math.max(10, timeSpent)
      );
      setActiveExamComp(null);
      setGradedResult(res);
      notify?.(`Exam submitted! Score: ${res.score_percentage}%`);
      loadCompetitions();
    } catch (err: any) {
      notify?.(err.message || 'Submission failed', 'error');
    } finally {
      setSubmittingExam(false);
    }
  };

  // Join via Invite Code
  const handleJoinByCode = async () => {
    if (!inviteCodeInput.trim()) return;
    setJoinLoading(true);
    try {
      const res = await communicationApi.joinQuizByCode(inviteCodeInput.trim());
      notify?.(`Joined: ${res.competition.title}! Starting session...`);
      handleStartExam(res.competition);
      setInviteCodeInput('');
    } catch (err: any) {
      notify?.(err.message || 'Invalid or expired invite code', 'error');
    } finally {
      setJoinLoading(false);
    }
  };

  // Open Peer Scores modal
  const handleOpenPeerScores = async (comp: QuizCompetitionItem) => {
    try {
      const data = await communicationApi.getPeerScores(comp.id);
      setPeerScoresModalData({
        title: comp.title,
        author: comp.sponsor_name,
        standings: data.standings || []
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Question Answer Change
  const handleAnswerChange = (qId: number, val: any) => {
    setUserAnswers((prev) => ({ ...prev, [String(qId)]: val }));
  };

  return (
    <div className="comm-page-wrapper">
      <div className="comm-container">
        {/* Top Kicker */}
        <div className="comm-kicker comm-kicker-assessments">
          <Award size={13} /> Online Assessments &amp; Quiz Competitions
        </div>

        {/* Signature Violet · Purple · Cyan Hero Banner */}
        <div className="comm-hero-banner comm-hero-assessments">
          <div className="comm-hero-content">
            <h1 className="comm-hero-title">
              <Award size={32} /> Online Assessments &amp; Quiz Competitions
            </h1>
            <p className="comm-hero-desc">
              Official institutional Olympiads with verified certification alongside informal student practice challenges.
            </p>
          </div>
          <div className="comm-hero-actions">
            <button className="comm-hero-btn-solid" onClick={() => setCreateModalOpen(true)}>
              <Plus size={16} /> Create Practice Quiz &amp; Invite
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="comm-tabs-bar">
          <button
            className={`comm-tab-pill ${activeTab === 'official' ? 'active-assessments' : ''}`}
            onClick={() => setActiveTab('official')}
          >
            <Trophy size={16} /> Official Worldwide Competitions
          </button>
          <button
            className={`comm-tab-pill ${activeTab === 'student' ? 'active-assessments' : ''}`}
            onClick={() => setActiveTab('student')}
          >
            <Users size={16} /> Student Challenges &amp; Practice
          </button>
          <button
            className={`comm-tab-pill ${activeTab === 'leaderboards' ? 'active-assessments' : ''}`}
            onClick={() => setActiveTab('leaderboards')}
          >
            <Award size={16} /> Quiz &amp; Assessment Leaderboards
          </button>
        </div>

        {/* TAB 1: Official Competitions */}
        {activeTab === 'official' && (
          <>
            <div style={{ marginBottom: 18, fontSize: 13, color: '#64748b' }}>
              Official assessments enforce strict Single-Attempt verification. Scores directly update verified academic transcripts and Quiz Badges.
            </div>

            <div className="comm-cards-grid">
              {officialComps.map((comp) => {
                const hasAttempted = comp.user_attempt?.attempted;
                return (
                  <div key={comp.id} className="comm-card comm-card-assessment">
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#ede9fe', color: '#6d28d9' }}>
                          {comp.subject}
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e' }}>
                          {comp.difficulty}
                        </span>
                      </div>

                      <h3 style={{ fontSize: 16, fontWeight: 800, margin: '6px 0', color: '#1e1633' }}>
                        {comp.title}
                      </h3>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                        Organised by: <strong style={{ color: '#1e1633' }}>{comp.sponsor_name}</strong>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#475569', marginBottom: 14 }}>
                        <div>Duration: <strong style={{ color: '#1e1633' }}>{comp.duration_minutes} Minutes</strong></div>
                        <div>Total Marks: <strong style={{ color: '#1e1633' }}>{comp.total_marks} Pts</strong></div>
                        <div>Eligibility: <strong style={{ color: '#1e1633' }}>{comp.grade_level}</strong></div>
                        <div>Format: <strong style={{ color: '#1e1633' }}>{comp.question_format_desc.split(',')[0]}</strong></div>
                        <div style={{ gridColumn: 'span 2' }}>
                          Registered: <strong className="comm-tabular" style={{ color: '#1e1633' }}>{comp.registered_count} / {comp.max_participants}</strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(241, 245, 249, 0.9)' }}>
                      <button
                        className="comm-btn-rules"
                        onClick={() => setRulesModalComp(comp)}
                      >
                        Rules, Schedule &amp; Standings
                      </button>

                      {hasAttempted ? (
                        <span className="comm-badge-recorded">
                          <CheckCircle2 size={14} /> Attempt Recorded ({comp.user_attempt?.score}%)
                        </span>
                      ) : (
                        <button
                          className="comm-btn-attempt"
                          onClick={() => handleStartExam(comp)}
                        >
                          Join &amp; Attempt Exam
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* TAB 2: Student Challenges & Practice */}
        {activeTab === 'student' && (
          <>
            {/* Join Via Code Box */}
            <div className="comm-filter-surface" style={{ padding: 18 }}>
              <div style={{ flex: '1 1 280px' }}>
                <strong style={{ fontSize: 14, display: 'block', marginBottom: 2, color: '#1e1633' }}>Join a Friend’s Quiz via Invitation Code</strong>
                <div style={{ fontSize: 12, color: '#64748b' }}>Enter alphanumeric code (e.g., MATH-433, BIO-9042) to begin instant peer practice.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Enter Code (e.g. MATH-433)"
                  className="comm-input comm-mono"
                  style={{ width: 190, textTransform: 'uppercase', fontWeight: 800, paddingLeft: 14 }}
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                />
                <button
                  className="comm-btn-attempt"
                  style={{ padding: '8px 18px', borderRadius: 10 }}
                  onClick={handleJoinByCode}
                  disabled={joinLoading}
                >
                  {joinLoading ? 'Checking...' : 'Join Quiz'}
                </button>
              </div>
            </div>

            {/* Student Challenge Cards */}
            <div className="comm-cards-grid">
              {studentChallenges.map((comp) => (
                <div key={comp.id} className="comm-card comm-card-assessment">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569' }}>
                        {comp.subject}
                      </span>
                      <span className="comm-mono" style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#ede9fe', color: '#7c3aed' }}>
                        Code: {comp.invite_code}
                      </span>
                    </div>

                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: '6px 0 4px 0', color: '#1e1633' }}>{comp.title}</h3>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                      Author: <strong style={{ color: '#1e1633' }}>{comp.sponsor_name}</strong>
                    </div>

                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#475569', marginBottom: 14 }}>
                      <div>Time: <strong>{comp.duration_minutes}m</strong></div>
                      <div>Difficulty: <strong>{comp.difficulty}</strong></div>
                      <div>Participants: <strong className="comm-tabular">{comp.registered_count}</strong></div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(241, 245, 249, 0.9)' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="comm-cat-pill"
                        style={{ padding: '6px 10px', fontSize: 12 }}
                        onClick={() => {
                          navigator.clipboard?.writeText(comp.invite_code);
                          notify?.(`Code ${comp.invite_code} copied to clipboard!`);
                        }}
                        title="Copy Invite Code"
                      >
                        <Share2 size={13} />
                      </button>
                      <button
                        className="comm-cat-pill"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => handleOpenPeerScores(comp)}
                      >
                        Compare Scores
                      </button>
                    </div>
                    <button
                      className="comm-btn-attempt"
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      onClick={() => handleStartExam(comp)}
                    >
                      Start Practice
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* TAB 3: Quiz & Assessment Leaderboards */}
        {activeTab === 'leaderboards' && (
          <div>
            {/* Controls Bar */}
            <div className="comm-filter-surface">
              <div className="comm-view-switch">
                <button
                  className={`comm-view-switch-btn ${leaderboardCategory === 'official' ? 'active' : ''}`}
                  onClick={() => setLeaderboardCategory('official')}
                >
                  Official Competitions
                </button>
                <button
                  className={`comm-view-switch-btn ${leaderboardCategory === 'student' ? 'active' : ''}`}
                  onClick={() => setLeaderboardCategory('student')}
                >
                  Student Challenges
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['global', 'pakistan', 'school', 'friends'].map((scope) => (
                  <button
                    key={scope}
                    className={`comm-cat-pill ${leaderboardScope === scope ? 'active' : ''}`}
                    style={{ padding: '6px 14px', fontSize: 12 }}
                    onClick={() => setLeaderboardScope(scope)}
                  >
                    {scope === 'global' ? 'Global' : scope === 'pakistan' ? 'Pakistan' : scope === 'school' ? 'My School' : 'Friends'}
                  </button>
                ))}
              </div>
            </div>

            {/* Standings Table */}
            <div className="comm-table-card">
              <div className="comm-table-wrap">
                <table className="comm-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Rank</th>
                      <th>Student &amp; School</th>
                      <th>Country</th>
                      <th>Assessment Name</th>
                      <th>Score (%)</th>
                      <th>Accuracy</th>
                      <th>Time Taken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizStandings.map((st, idx) => (
                      <tr key={idx} style={{ background: st.is_current_user ? 'rgba(237, 233, 254, 0.4)' : 'transparent' }}>
                        <td>
                          <span className="comm-rank-pill">{st.rank}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#1e1633' }}>
                            {st.name} {st.is_current_user && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: '#ede9fe', color: '#7c3aed', marginLeft: 6, fontWeight: 700 }}>You</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{st.school}</div>
                        </td>
                        <td>{st.country}</td>
                        <td style={{ fontWeight: 600, color: '#1e1633' }}>{st.assessment}</td>
                        <td><strong className="comm-mono" style={{ color: '#7c3aed', fontSize: 14 }}>{st.score}%</strong></td>
                        <td><span style={{ color: '#059669', fontWeight: 600 }}>{st.accuracy}%</span></td>
                        <td className="comm-tabular" style={{ color: '#64748b' }}>{st.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* LIVE EXAM TAKER MODAL */}
        {activeExamComp && examQuestions.length > 0 && (
          <div className="comm-modal-backdrop">
            <div className="comm-modal-dialog" style={{ maxWidth: 860 }}>
              {/* Exam Header */}
              <div className="comm-modal-header">
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>{activeExamComp.title}</h2>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Verified Candidate • {activeExamComp.subject} • {activeExamComp.difficulty}</div>
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
                          transition: 'all 0.15s'
                        }}
                        onClick={() => setCurrentQIndex(idx)}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Current Question View */}
                {examQuestions[currentQIndex] && (
                  <div style={{ background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 14, padding: 22 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, color: '#64748b' }}>
                      <span style={{ fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Question {currentQIndex + 1} of {examQuestions.length}</span>
                      <span className="comm-mono" style={{ fontWeight: 700 }}>{examQuestions[currentQIndex].marks} Marks</span>
                    </div>

                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e1633', lineHeight: 1.5, marginBottom: 18 }}>
                      {examQuestions[currentQIndex].prompt}
                    </div>

                    {/* Format: Numerical */}
                    {examQuestions[currentQIndex].question_type === 'numerical' && (
                      <div style={{ marginTop: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 6, fontWeight: 600 }}>Enter Numerical Answer:</label>
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

                    {/* Format: Multiple Choice */}
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

                    {/* Format: True / False */}
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

                    {/* Format: Matching Pairs */}
                    {examQuestions[currentQIndex].question_type === 'matching' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                        {examQuestions[currentQIndex].options?.map((pair: any, pidx: number) => {
                          const curAnswers = userAnswers[String(examQuestions[currentQIndex].id)] || {};
                          return (
                            <div key={pidx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, background: '#fff', border: '1px solid rgba(254, 230, 133, 0.7)', borderRadius: 10 }}>
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

              {/* Exam Footer Navigation */}
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
                    <button
                      className="comm-btn-attempt"
                      onClick={() => setCurrentQIndex((p) => p + 1)}
                    >
                      Next Question <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      className="comm-btn-attempt"
                      style={{ background: 'linear-gradient(105deg, #0d9488, #10b981)' }}
                      onClick={handleSubmitExam}
                      disabled={submittingExam}
                    >
                      {submittingExam ? 'Submitting...' : 'Submit Assessment'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GRADED RESULTS MODAL */}
        {gradedResult && (
          <div className="comm-modal-backdrop" onClick={() => setGradedResult(null)}>
            <div className="comm-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>Assessment Submission &amp; Instant Grading</h2>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setGradedResult(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="comm-modal-body">
                <div style={{ padding: 14, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, color: '#047857', fontWeight: 700, fontSize: 13.5, marginBottom: 20 }}>
                  <CheckCircle2 size={20} />
                  <span>Official Assessment Record Saved — Verified score added to your academic transcript.</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                  <div style={{ padding: 16, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                    <div className="comm-mono" style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed' }}>
                      {gradedResult.score_percentage}%
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Final Score ({gradedResult.raw_score} / {gradedResult.total_marks} Pts)</div>
                  </div>
                  <div style={{ padding: 16, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                    <div className="comm-mono" style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>
                      {gradedResult.accuracy_percentage}%
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Question Accuracy</div>
                  </div>
                  <div style={{ padding: 16, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                    <div className="comm-tabular" style={{ fontSize: 24, fontWeight: 800, color: '#1e1633' }}>
                      {Math.floor(gradedResult.time_spent_seconds / 60)}m {gradedResult.time_spent_seconds % 60}s
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Time Taken</div>
                  </div>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, color: '#1e1633' }}>Question Review &amp; Explanations</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {gradedResult.graded_breakdown?.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background: item.is_correct ? '#f0fdf4' : '#fff1f2',
                        border: `1px solid ${item.is_correct ? '#bbf7d0' : '#fecdd3'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontWeight: 700, fontSize: 13.5 }}>
                        <span style={{ color: '#1e1633' }}>Q{item.order}: {item.prompt}</span>
                        <span style={{ color: item.is_correct ? '#059669' : '#e11d48' }}>
                          {item.is_correct ? `+${item.marks_earned} Marks` : '0 Marks'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 4, color: '#475569' }}>
                        Your Answer: <strong style={{ color: '#1e1633' }}>{item.user_answer}</strong>
                      </div>
                      {!item.is_correct && (
                        <div style={{ fontSize: 13, color: '#059669', marginBottom: 4 }}>
                          Correct Solution: <strong>{item.correct_answer}</strong>
                        </div>
                      )}
                      {item.explanation && (
                        <div style={{ fontSize: 12, color: '#64748b', background: 'rgba(255,255,255,0.7)', padding: 8, borderRadius: 6, marginTop: 6 }}>
                          <strong>Explanation: </strong>{item.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <button
                    className="comm-btn-attempt"
                    onClick={() => {
                      setGradedResult(null);
                      setActiveTab('leaderboards');
                    }}
                  >
                    View on Live Leaderboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* RULES & STANDINGS MODAL */}
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
                <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 8, color: '#1e1633' }}>Competition Rules &amp; Governance</h4>
                <ul style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, paddingLeft: 20, marginBottom: 20 }}>
                  <li><strong>Single-Attempt Lock:</strong> Only the first verified submission is recorded and eligible for honors.</li>
                  <li><strong>Strict Tie-Breakers:</strong> Ranking order: <code>Final Score % → Completion Time → Accuracy %</code>.</li>
                  <li><strong>Calculators &amp; References:</strong> Standard scientific calculator permitted for numerical questions.</li>
                </ul>

                <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10, color: '#1e1633' }}>Current Standings</h4>
                <div className="comm-table-card">
                  <div className="comm-table-wrap">
                    <table className="comm-table">
                      <thead>
                        <tr>
                          <th style={{ width: 60 }}>Rank</th>
                          <th>Candidate &amp; School</th>
                          <th>Score</th>
                          <th>Accuracy</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="comm-rank-pill" style={{ background: '#fef3c7', color: '#92400e' }}>1</span></td>
                          <td><strong>Ayesha Khan</strong><div style={{ fontSize: 12, color: '#64748b' }}>Beaconhouse Gulberg Campus</div></td>
                          <td><strong className="comm-mono" style={{ color: '#7c3aed' }}>97.5%</strong></td>
                          <td>100.0%</td>
                          <td className="comm-tabular">14m 20s</td>
                        </tr>
                        <tr>
                          <td><span className="comm-rank-pill" style={{ background: '#f1f5f9', color: '#334155' }}>2</span></td>
                          <td><strong>Liam Vance-Sterling</strong><div style={{ fontSize: 12, color: '#64748b' }}>Albion Collegiate Academy</div></td>
                          <td><strong className="comm-mono" style={{ color: '#7c3aed' }}>95.0%</strong></td>
                          <td>95.0%</td>
                          <td className="comm-tabular">15m 12s</td>
                        </tr>
                        <tr>
                          <td><span className="comm-rank-pill" style={{ background: '#fef3c7', color: '#92400e' }}>3</span></td>
                          <td><strong>Zara Al-Hashimi</strong><div style={{ fontSize: 12, color: '#64748b' }}>Al-Noor Horizon School</div></td>
                          <td><strong className="comm-mono" style={{ color: '#7c3aed' }}>92.5%</strong></td>
                          <td>90.0%</td>
                          <td className="comm-tabular">16m 05s</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <button className="comm-btn-attempt" onClick={() => setRulesModalComp(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PEER SCORES COMPARISON MODAL */}
        {peerScoresModalData && (
          <div className="comm-modal-backdrop" onClick={() => setPeerScoresModalData(null)}>
            <div className="comm-modal-dialog" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>Peer Challenge Scoreboard</h2>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setPeerScoresModalData(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="comm-modal-body">
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                  {peerScoresModalData.title} • Created by <strong style={{ color: '#1e1633' }}>{peerScoresModalData.author}</strong>
                </div>

                <div className="comm-table-card">
                  <div className="comm-table-wrap">
                    <table className="comm-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Friend / Peer</th>
                          <th>Score</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {peerScoresModalData.standings?.map((p: any) => (
                          <tr key={p.rank}>
                            <td><span className="comm-rank-pill">{p.rank}</span></td>
                            <td><strong style={{ color: '#1e1633' }}>{p.name}</strong></td>
                            <td><strong className="comm-mono" style={{ color: '#7c3aed' }}>{p.score}%</strong></td>
                            <td className="comm-tabular" style={{ color: '#64748b' }}>{p.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 20, textAlign: 'right' }}>
                  <button className="comm-btn-attempt" onClick={() => setPeerScoresModalData(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CREATE PRACTICE QUIZ MODAL */}
        {createModalOpen && (
          <div className="comm-modal-backdrop" onClick={() => setCreateModalOpen(false)}>
            <div className="comm-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>Create Practice Quiz &amp; Generate Invite Code</h2>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setCreateModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="comm-modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>Quiz Title</label>
                    <input
                      type="text"
                      className="comm-input"
                      placeholder="e.g. Speed Algebra Practice"
                      value={newQuizTitle}
                      onChange={(e) => setNewQuizTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>Subject</label>
                    <select
                      className="comm-select"
                      style={{ width: '100%' }}
                      value={newQuizSubject}
                      onChange={(e) => setNewQuizSubject(e.target.value)}
                    >
                      <option>Mathematics</option>
                      <option>Physics</option>
                      <option>Biology</option>
                      <option>Chemistry</option>
                      <option>Computer Science</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>Difficulty</label>
                    <select
                      className="comm-select"
                      style={{ width: '100%' }}
                      value={newQuizDifficulty}
                      onChange={(e) => setNewQuizDifficulty(e.target.value)}
                    >
                      <option>Foundation</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                      <option>Olympiad</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1e1633' }}>Duration (Minutes)</label>
                    <input
                      type="number"
                      className="comm-input comm-tabular"
                      min="5"
                      max="60"
                      value={newQuizDuration}
                      onChange={(e) => setNewQuizDuration(Number(e.target.value))}
                    />
                  </div>
                </div>

                <h4 style={{ fontSize: 14, fontWeight: 800, margin: '20px 0 10px 0', color: '#1e1633' }}>Questions Builder ({createdQuestions.length})</h4>
                {createdQuestions.map((q, qi) => (
                  <div key={qi} style={{ padding: 14, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <strong style={{ color: '#1e1633' }}>Question {qi + 1}</strong>
                      {createdQuestions.length > 1 && (
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                          onClick={() => setCreatedQuestions((prev) => prev.filter((_, i) => i !== qi))}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      className="comm-input"
                      style={{ marginBottom: 10 }}
                      placeholder="Enter question prompt..."
                      value={q.prompt}
                      onChange={(e) => {
                        const updated = [...createdQuestions];
                        updated[qi].prompt = e.target.value;
                        setCreatedQuestions(updated);
                      }}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <select
                        className="comm-select"
                        value={q.question_type}
                        onChange={(e) => {
                          const updated = [...createdQuestions];
                          updated[qi].question_type = e.target.value;
                          setCreatedQuestions(updated);
                        }}
                      >
                        <option value="numerical">Numerical Value</option>
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                      </select>
                      <input
                        type="text"
                        className="comm-input"
                        placeholder="Correct answer (e.g. 5 or A)"
                        value={q.correct_answer?.value ?? q.correct_answer?.id ?? ''}
                        onChange={(e) => {
                          const updated = [...createdQuestions];
                          updated[qi].correct_answer = { value: e.target.value, id: e.target.value };
                          setCreatedQuestions(updated);
                        }}
                      />
                    </div>
                  </div>
                ))}

                <button
                  className="comm-cat-pill"
                  style={{ marginTop: 4 }}
                  onClick={() =>
                    setCreatedQuestions((prev) => [
                      ...prev,
                      {
                        prompt: 'New Question Prompt',
                        question_type: 'numerical',
                        correct_answer: { value: 10 },
                        unit: '',
                        marks: 10,
                        explanation: ''
                      }
                    ])
                  }
                >
                  + Add Another Question
                </button>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                  <button className="comm-cat-pill" onClick={() => setCreateModalOpen(false)}>Cancel</button>
                  <button
                    className="comm-btn-attempt"
                    disabled={creatingQuiz}
                    onClick={async () => {
                      setCreatingQuiz(true);
                      try {
                        const res = await communicationApi.createQuiz({
                          title: newQuizTitle || 'Custom Peer Quiz',
                          subject: newQuizSubject,
                          grade_level: newQuizGrade,
                          difficulty: newQuizDifficulty,
                          duration_minutes: newQuizDuration,
                          scope: newQuizScope,
                          questions: createdQuestions
                        });
                        notify?.(`Quiz created! Invite Code: ${res.invite_code}`);
                        setCreateModalOpen(false);
                        loadCompetitions();
                      } catch (err: any) {
                        notify?.(err.message || 'Error creating quiz', 'error');
                      } finally {
                        setCreatingQuiz(false);
                      }
                    }}
                  >
                    {creatingQuiz ? 'Creating...' : 'Generate Quiz & Create Invite Code'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
