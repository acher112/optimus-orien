import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  HelpCircle,
  Send,
  Plus,
  Search,
  CheckCircle2,
  ThumbsUp,
  Eye,
  Globe,
  Building2,
  GraduationCap,
  Users,
  School as SchoolIcon,
  ArrowLeft,
  Check,
  Sparkles,
  BookOpen,
  Tag,
  X,
  AlertCircle,
  Award,
  Clock,
  Layers,
  ChevronRight
} from 'lucide-react';
import {
  communicationApi,
  type QADiscussionItem,
  type QADiscussionDetail,
  type QADiscussionStats
} from './communicationApi';
import { list } from '../api';
import './discussion.css';

interface QADiscussionViewProps {
  currentUser?: any;
  notify?: (msg: string, type?: 'info' | 'error' | 'success') => void;
  campuses?: Array<{ id: number; name: string }>;
  activeCampusId?: number | null;
}

const CATEGORIES = [
  'All',
  'Academic Doubt',
  'Exam Prep',
  'Concept Clarification',
  'Curriculum & Pedagogy',
  'General School Query'
];

export const QADiscussionView: React.FC<QADiscussionViewProps> = ({
  currentUser,
  notify,
  campuses = [],
  activeCampusId
}) => {
  // Questions list & stats
  const [questions, setQuestions] = useState<QADiscussionItem[]>([]);
  const [stats, setStats] = useState<QADiscussionStats>({
    total_queries: 0,
    worldwide_count: 0,
    campus_queries: 0,
    solved_count: 0,
    my_queries: 0
  });
  const [loadingList, setLoadingList] = useState<boolean>(true);

  // Filters
  const [selectedScope, setSelectedScope] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');

  // Active Discussion Thread (Detail View)
  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<QADiscussionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [newAnswerText, setNewAnswerText] = useState<string>('');
  const [submittingAnswer, setSubmittingAnswer] = useState<boolean>(false);

  // Ask Question Modal State
  const [showAskModal, setShowAskModal] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalBody, setModalBody] = useState<string>('');
  const [modalCategory, setModalCategory] = useState<string>('Academic Doubt');
  const [isCustomSubject, setIsCustomSubject] = useState<boolean>(false);
  const [modalSubjectId, setModalSubjectId] = useState<string>('');
  const [modalCustomSubject, setModalCustomSubject] = useState<string>('');
  const [modalClassId, setModalClassId] = useState<string>('');
  const [modalAudienceScope, setModalAudienceScope] = useState<string>('worldwide');
  const [submittingQuestion, setSubmittingQuestion] = useState<boolean>(false);

  // Reference data for dropdowns (Campus subjects and classes)
  const [campusSubjects, setCampusSubjects] = useState<Array<{ id: number; name: string }>>([]);
  const [campusClasses, setCampusClasses] = useState<Array<{ id: number; name: string }>>([]);

  // Load Reference collections
  useEffect(() => {
    let mounted = true;
    Promise.all([
      list<{ id: number; name: string }>('subjects').catch(() => []),
      list<{ id: number; name: string }>('classes').catch(() => [])
    ]).then(([subjects, classes]) => {
      if (!mounted) return;
      if (Array.isArray(subjects)) setCampusSubjects(subjects);
      if (Array.isArray(classes)) setCampusClasses(classes);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch discussions list
  const loadDiscussions = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await communicationApi.getDiscussions({
        scope: selectedScope !== 'all' ? selectedScope : undefined,
        category: selectedCategory !== 'All' ? selectedCategory : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        search: searchQuery.trim() || undefined,
        subject: selectedSubjectFilter !== 'all' ? selectedSubjectFilter : undefined,
        campus_id: activeCampusId || undefined
      });
      setQuestions(res.results || []);
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (err: any) {
      notify?.(err?.message || 'Failed to load discussions.', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [selectedScope, selectedCategory, selectedStatus, searchQuery, selectedSubjectFilter, activeCampusId, notify]);

  useEffect(() => {
    loadDiscussions();
  }, [loadDiscussions]);

  // Load single question detail
  const loadQuestionDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    try {
      const detail = await communicationApi.getDiscussionDetail(id);
      setActiveQuestion(detail);
      setActiveQuestionId(id);
    } catch (err: any) {
      notify?.(err?.message || 'Failed to load discussion details.', 'error');
      setActiveQuestionId(null);
      setActiveQuestion(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [notify]);

  // Handle Ask Question submission
  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle.trim()) {
      notify?.('Please provide a question title.', 'error');
      return;
    }
    if (!modalBody.trim()) {
      notify?.('Please describe your question or inquiry in detail.', 'error');
      return;
    }

    setSubmittingQuestion(true);
    try {
      const created = await communicationApi.createDiscussion({
        title: modalTitle.trim(),
        body: modalBody.trim(),
        category: modalCategory,
        subject_id: (!isCustomSubject && modalSubjectId) ? Number(modalSubjectId) : null,
        custom_subject: (isCustomSubject && modalCustomSubject.trim()) ? modalCustomSubject.trim() : undefined,
        class_id: modalClassId ? Number(modalClassId) : null,
        audience_scope: modalAudienceScope,
        school_id: activeCampusId || currentUser?.school_id || null
      });

      notify?.('Your discussion question has been posted successfully!', 'success');
      setShowAskModal(false);
      // Reset form
      setModalTitle('');
      setModalBody('');
      setModalCustomSubject('');
      setModalSubjectId('');
      setModalClassId('');
      setModalAudienceScope('worldwide');
      // Reload list and open the new question
      loadDiscussions();
      if (created?.id) {
        loadQuestionDetail(created.id);
      }
    } catch (err: any) {
      notify?.(err?.message || 'Could not post question. Check permissions.', 'error');
    } finally {
      setSubmittingQuestion(false);
    }
  };

  // Handle answer submission
  const handlePostAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuestionId || !newAnswerText.trim()) return;

    setSubmittingAnswer(true);
    try {
      await communicationApi.postDiscussionAnswer(activeQuestionId, newAnswerText.trim());
      notify?.('Your answer has been posted.', 'success');
      setNewAnswerText('');
      loadQuestionDetail(activeQuestionId);
      loadDiscussions();
    } catch (err: any) {
      notify?.(err?.message || 'Failed to post answer.', 'error');
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // Upvote Question
  const handleUpvoteQuestion = async (id: number) => {
    try {
      await communicationApi.upvoteDiscussion(id);
      if (activeQuestion && activeQuestion.id === id) {
        setActiveQuestion({
          ...activeQuestion,
          upvotes_count: activeQuestion.upvotes_count + 1
        });
      }
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, upvotes_count: q.upvotes_count + 1 } : q))
      );
    } catch (err: any) {
      notify?.('Unable to record upvote.', 'error');
    }
  };

  // Upvote Answer
  const handleUpvoteAnswer = async (questionId: number, answerId: number) => {
    try {
      await communicationApi.upvoteDiscussion(questionId, answerId);
      if (activeQuestion) {
        setActiveQuestion({
          ...activeQuestion,
          answers: activeQuestion.answers.map((a) =>
            a.id === answerId ? { ...a, helpful_count: a.helpful_count + 1 } : a
          )
        });
      }
    } catch (err: any) {
      notify?.('Unable to record helpful vote.', 'error');
    }
  };

  // Mark Solution Accepted
  const handleAcceptSolution = async (questionId: number, answerId: number) => {
    try {
      await communicationApi.acceptDiscussionSolution(questionId, answerId);
      notify?.('Marked as accepted solution!', 'success');
      loadQuestionDetail(questionId);
      loadDiscussions();
    } catch (err: any) {
      notify?.(err?.message || 'Failed to mark accepted solution.', 'error');
    }
  };

  // Scope formatting helpers
  const getScopeMeta = (scope: string) => {
    switch (scope) {
      case 'worldwide':
        return {
          label: 'Worldwide / Global',
          className: 'qa-scope-worldwide',
          icon: <Globe size={13} />,
          desc: 'Everyone across all campuses and regions can contribute.'
        };
      case 'all_campuses':
        return {
          label: 'All Campus Branches',
          className: 'qa-scope-all_campuses',
          icon: <Building2 size={13} />,
          desc: 'Open to all staff, teachers & admins across school branches.'
        };
      case 'campus_staff_all':
        return {
          label: 'Our Campus (All Staff & Students)',
          className: 'qa-scope-campus_staff_all',
          icon: <SchoolIcon size={13} />,
          desc: 'All students, teachers, principals and staff of this campus.'
        };
      case 'campus_teachers':
        return {
          label: 'Campus Teachers Only',
          className: 'qa-scope-campus_teachers',
          icon: <GraduationCap size={13} />,
          desc: 'Restricted discussion for faculty and teachers of this campus.'
        };
      case 'campus_students':
        return {
          label: 'Campus Students Only',
          className: 'qa-scope-campus_students',
          icon: <Users size={13} />,
          desc: 'Student peer discussion and academic doubts for this campus.'
        };
      default:
        return {
          label: scope,
          className: 'qa-scope-worldwide',
          icon: <Globe size={13} />,
          desc: 'Community inquiry'
        };
    }
  };

  const timeAgo = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const diffMs = Date.now() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="qa-discussion-container">
      {/* =================================================================== */}
      {/* 1. HERO BANNER                                                      */}
      {/* =================================================================== */}
      <div className="qa-hero">
        <div className="qa-hero-content">
          <div className="qa-hero-badge">
            <Sparkles size={14} /> Academic Q&A & Knowledge Exchange
          </div>
          <h1 className="qa-hero-title">Academic Discussion & Query Forum</h1>
          <p className="qa-hero-subtitle">
            Ask academic doubts, debate complex concepts, and share pedagogy solutions. Target questions
            to your campus teachers, fellow students, all branches, or open discussions worldwide!
          </p>
        </div>
        <div>
          <button
            type="button"
            className="qa-hero-action-btn"
            onClick={() => setShowAskModal(true)}
          >
            <Plus size={18} /> Ask a Question / Start Discussion
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. STATS OVERVIEW CARDS                                             */}
      {/* =================================================================== */}
      <div className="qa-stats-grid">
        <div className="qa-stat-card">
          <div className="qa-stat-icon-wrapper" style={{ background: '#f0f9ff', color: '#0284c7' }}>
            <MessageSquare size={22} />
          </div>
          <div>
            <div className="qa-stat-val">{stats.total_queries}</div>
            <div className="qa-stat-lbl">Total Inquiries</div>
          </div>
        </div>

        <div className="qa-stat-card">
          <div className="qa-stat-icon-wrapper" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            <Globe size={22} />
          </div>
          <div>
            <div className="qa-stat-val">{stats.worldwide_count}</div>
            <div className="qa-stat-lbl">Worldwide Debates</div>
          </div>
        </div>

        <div className="qa-stat-card">
          <div className="qa-stat-icon-wrapper" style={{ background: '#ecfdf5', color: '#059669' }}>
            <SchoolIcon size={22} />
          </div>
          <div>
            <div className="qa-stat-val">{stats.campus_queries}</div>
            <div className="qa-stat-lbl">Campus Queries</div>
          </div>
        </div>

        <div className="qa-stat-card">
          <div className="qa-stat-icon-wrapper" style={{ background: '#fef3c7', color: '#d97706' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="qa-stat-val">{stats.solved_count}</div>
            <div className="qa-stat-lbl">Solved / Answered</div>
          </div>
        </div>

        <div className="qa-stat-card">
          <div className="qa-stat-icon-wrapper" style={{ background: '#f3e8ff', color: '#7e22ce' }}>
            <HelpCircle size={22} />
          </div>
          <div>
            <div className="qa-stat-val">{stats.my_queries}</div>
            <div className="qa-stat-lbl">My Posted Queries</div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* DETAIL VIEW (THREAD & REPLIES)                                      */}
      {/* =================================================================== */}
      {activeQuestionId && activeQuestion ? (
        <div className="qa-detail-view-container">
          <div className="qa-thread-header-bar">
            <button
              type="button"
              className="qa-back-btn"
              onClick={() => {
                setActiveQuestionId(null);
                setActiveQuestion(null);
              }}
            >
              <ArrowLeft size={16} /> Back to Discussions
            </button>
            <div className="qa-metrics-group">
              <span className={`qa-status-pill ${activeQuestion.status === 'answered' ? 'qa-status-answered' : 'qa-status-open'}`}>
                {activeQuestion.status === 'answered' ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                {activeQuestion.status_label}
              </span>
            </div>
          </div>

          <div className="qa-thread-main-card">
            <div className="qa-card-header">
              <div className="qa-card-tags">
                <span className={`qa-tag-scope ${getScopeMeta(activeQuestion.audience_scope).className}`}>
                  {getScopeMeta(activeQuestion.audience_scope).icon}
                  {activeQuestion.audience_scope_label}
                </span>
                <span className={activeQuestion.is_custom_subject ? 'qa-tag-custom-subject' : 'qa-tag-subject'}>
                  <BookOpen size={12} style={{ display: 'inline', marginRight: 4 }} />
                  {activeQuestion.subject_name}
                </span>
                {activeQuestion.class_name && (
                  <span className="qa-tag-class">
                    <Tag size={11} style={{ display: 'inline', marginRight: 4 }} />
                    {activeQuestion.class_name}
                  </span>
                )}
                <span className="qa-tag-subject">{activeQuestion.category}</span>
              </div>
            </div>

            <h2 className="qa-card-title" style={{ fontSize: '1.45rem', marginTop: 12 }}>
              {activeQuestion.title}
            </h2>

            {/* Scope explanatory banner */}
            <div className="qa-scope-banner-box">
              {getScopeMeta(activeQuestion.audience_scope).icon}
              <div>
                <strong>Audience Scope: {activeQuestion.audience_scope_label}</strong>
                <div>{getScopeMeta(activeQuestion.audience_scope).desc}</div>
              </div>
            </div>

            <div className="qa-thread-body-text">{activeQuestion.body}</div>

            <div className="qa-card-footer">
              <div className="qa-author-info">
                <div
                  className="qa-author-avatar"
                  style={{ background: activeQuestion.author.avatar_color || '#0284c7' }}
                >
                  {activeQuestion.author.name.charAt(0).toUpperCase()}
                </div>
                <div className="qa-author-details">
                  <div className="qa-author-name">
                    {activeQuestion.author.name}
                    <span className="qa-role-badge">{activeQuestion.author.role}</span>
                  </div>
                  <span className="qa-card-meta-text">
                    {activeQuestion.school_name} • Posted {timeAgo(activeQuestion.created_at)}
                  </span>
                </div>
              </div>

              <div className="qa-metrics-group">
                <button
                  type="button"
                  className="qa-action-btn-small qa-btn-helpful"
                  onClick={() => handleUpvoteQuestion(activeQuestion.id)}
                  title="Upvote this question"
                >
                  <ThumbsUp size={14} /> Helpful ({activeQuestion.upvotes_count})
                </button>
                <div className="qa-metric-item">
                  <Eye size={15} /> {activeQuestion.views_count} views
                </div>
                <div className="qa-metric-item answers-highlight">
                  <MessageSquare size={15} /> {activeQuestion.answers?.length || 0} Answers
                </div>
              </div>
            </div>
          </div>

          {/* Answers list */}
          <div className="qa-answers-section-title">
            <MessageSquare size={20} />
            Answers & Opinions ({activeQuestion.answers?.length || 0})
          </div>

          {activeQuestion.answers && activeQuestion.answers.length > 0 ? (
            <div className="qa-answers-list">
              {activeQuestion.answers.map((ans) => (
                <div
                  key={ans.id}
                  className={`qa-answer-card ${ans.is_accepted_solution ? 'accepted-solution' : ''}`}
                >
                  {ans.is_accepted_solution && (
                    <div className="qa-accepted-badge">
                      <Award size={13} /> Accepted Solution
                    </div>
                  )}

                  <div className="qa-author-info" style={{ marginBottom: 12 }}>
                    <div
                      className="qa-author-avatar"
                      style={{ background: ans.author.avatar_color || '#64748b', width: 32, height: 32 }}
                    >
                      {ans.author.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="qa-author-details">
                      <div className="qa-author-name">
                        {ans.author.name}
                        <span className="qa-role-badge">{ans.author.role}</span>
                      </div>
                      <span className="qa-card-meta-text">
                        Replied {timeAgo(ans.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="qa-answer-body">{ans.body}</div>

                  <div className="qa-answer-footer">
                    <button
                      type="button"
                      className="qa-action-btn-small qa-btn-helpful"
                      onClick={() => handleUpvoteAnswer(activeQuestion.id, ans.id)}
                    >
                      <ThumbsUp size={13} /> Helpful ({ans.helpful_count})
                    </button>

                    {activeQuestion.can_mark_solution && !ans.is_accepted_solution && (
                      <button
                        type="button"
                        className="qa-action-btn-small qa-btn-mark-solution"
                        onClick={() => handleAcceptSolution(activeQuestion.id, ans.id)}
                      >
                        <Check size={14} /> Mark as Accepted Solution
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="qa-empty-state">
              <MessageSquare className="qa-empty-icon" />
              <div className="qa-empty-title">No answers yet</div>
              <div className="qa-empty-desc">
                Be the first to share your academic explanation or opinion on this discussion!
              </div>
            </div>
          )}

          {/* Reply Form / Permission Notice */}
          <div className="qa-reply-box">
            <h3 className="qa-reply-box-title">Write Your Answer or Opinion</h3>
            {activeQuestion.can_reply ? (
              <form onSubmit={handlePostAnswer}>
                <textarea
                  className="qa-form-textarea"
                  style={{ width: '100%', marginBottom: 14 }}
                  placeholder="Share a thoughtful academic explanation, step-by-step formula derivation, or professional insight..."
                  value={newAnswerText}
                  onChange={(e) => setNewAnswerText(e.target.value)}
                  rows={4}
                  required
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="qa-btn-primary"
                    disabled={submittingAnswer || !newAnswerText.trim()}
                  >
                    <Send size={15} /> {submittingAnswer ? 'Posting...' : 'Post Answer'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="qa-reply-restricted-banner">
                <AlertCircle size={20} />
                <div>
                  <strong>Discussion Restricted: </strong>
                  {activeQuestion.reply_permission_reason ||
                    `This question was scoped to "${activeQuestion.audience_scope_label}". Only eligible members can post answers.`}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =================================================================== */
        /* QUESTIONS LIST & FILTERS                                            */
        /* =================================================================== */
        <div>
          <div className="qa-filter-panel">
            {/* Scope tabs */}
            <div className="qa-scope-tabs">
              <button
                type="button"
                className={`qa-scope-tab ${selectedScope === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedScope('all')}
              >
                <Layers size={14} /> All Inquiries
              </button>
              <button
                type="button"
                className={`qa-scope-tab ${selectedScope === 'worldwide' ? 'active' : ''}`}
                onClick={() => setSelectedScope('worldwide')}
              >
                <Globe size={14} /> Worldwide
              </button>
              <button
                type="button"
                className={`qa-scope-tab ${selectedScope === 'my_campus' ? 'active' : ''}`}
                onClick={() => setSelectedScope('my_campus')}
              >
                <SchoolIcon size={14} /> My Campus
              </button>
              <button
                type="button"
                className={`qa-scope-tab ${selectedScope === 'campus_teachers' ? 'active' : ''}`}
                onClick={() => setSelectedScope('campus_teachers')}
              >
                <GraduationCap size={14} /> Teachers Only
              </button>
              <button
                type="button"
                className={`qa-scope-tab ${selectedScope === 'campus_students' ? 'active' : ''}`}
                onClick={() => setSelectedScope('campus_students')}
              >
                <Users size={14} /> Students Only
              </button>
              <button
                type="button"
                className={`qa-scope-tab ${selectedScope === 'all_campuses' ? 'active' : ''}`}
                onClick={() => setSelectedScope('all_campuses')}
              >
                <Building2 size={14} /> All Branches
              </button>
            </div>

            {/* Secondary filter controls */}
            <div className="qa-secondary-filters">
              <div className="qa-search-box">
                <Search size={16} className="qa-search-icon" />
                <input
                  type="text"
                  placeholder="Search questions by topic, keyword, or concept..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="qa-filter-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    Category: {cat}
                  </option>
                ))}
              </select>

              <select
                className="qa-filter-select"
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              >
                <option value="all">All Subjects</option>
                {campusSubjects.map((sub) => (
                  <option key={sub.id} value={String(sub.id)}>
                    Subject: {sub.name}
                  </option>
                ))}
              </select>

              <select
                className="qa-filter-select"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">Status: All</option>
                <option value="open">Status: Open</option>
                <option value="answered">Status: Solved / Answered</option>
              </select>
            </div>
          </div>

          {/* Feed List */}
          {loadingList ? (
            <div className="qa-empty-state">
              <div className="qa-empty-title">Loading discussions...</div>
            </div>
          ) : questions.length === 0 ? (
            <div className="qa-empty-state">
              <MessageSquare className="qa-empty-icon" />
              <div className="qa-empty-title">No questions found</div>
              <div className="qa-empty-desc">
                There are no discussion queries matching your filter criteria. Be the first to start a conversation!
              </div>
              <button
                type="button"
                className="qa-btn-primary"
                onClick={() => setShowAskModal(true)}
              >
                <Plus size={16} /> Ask a Question
              </button>
            </div>
          ) : (
            <div className="qa-feed-list">
              {questions.map((q) => {
                const scopeMeta = getScopeMeta(q.audience_scope);
                return (
                  <div
                    key={q.id}
                    className="qa-question-card"
                    onClick={() => loadQuestionDetail(q.id)}
                  >
                    <div className="qa-card-header">
                      <div className="qa-card-tags">
                        <span className={`qa-tag-scope ${scopeMeta.className}`}>
                          {scopeMeta.icon}
                          {q.audience_scope_label}
                        </span>
                        <span className={q.is_custom_subject ? 'qa-tag-custom-subject' : 'qa-tag-subject'}>
                          <BookOpen size={12} style={{ display: 'inline', marginRight: 4 }} />
                          {q.subject_name}
                        </span>
                        {q.class_name && (
                          <span className="qa-tag-class">
                            <Tag size={11} style={{ display: 'inline', marginRight: 4 }} />
                            {q.class_name}
                          </span>
                        )}
                        <span className="qa-tag-subject">{q.category}</span>
                      </div>

                      <span className={`qa-status-pill ${q.status === 'answered' ? 'qa-status-answered' : 'qa-status-open'}`}>
                        {q.status === 'answered' ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                        {q.status_label}
                      </span>
                    </div>

                    <h3 className="qa-card-title">{q.title}</h3>
                    <p className="qa-card-body">{q.body_preview}</p>

                    <div className="qa-card-footer">
                      <div className="qa-author-info">
                        <div
                          className="qa-author-avatar"
                          style={{ background: q.author.avatar_color || '#0284c7' }}
                        >
                          {q.author.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="qa-author-details">
                          <div className="qa-author-name">
                            {q.author.name}
                            <span className="qa-role-badge">{q.author.role}</span>
                          </div>
                          <span className="qa-card-meta-text">
                            {q.school_name} • {timeAgo(q.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="qa-metrics-group">
                        <div className="qa-metric-item">
                          <ThumbsUp size={14} /> {q.upvotes_count}
                        </div>
                        <div className="qa-metric-item">
                          <Eye size={14} /> {q.views_count}
                        </div>
                        <div className="qa-metric-item answers-highlight">
                          <MessageSquare size={14} /> {q.answers_count} Answers
                        </div>
                        <ChevronRight size={16} color="#94a3b8" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. MODAL: ASK QUESTION / START DISCUSSION                           */}
      {/* =================================================================== */}
      {showAskModal && (
        <div className="qa-modal-backdrop" onClick={() => setShowAskModal(false)}>
          <div className="qa-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="qa-modal-header">
              <h2 className="qa-modal-title">
                <HelpCircle size={22} color="#0284c7" /> Ask a Question / Start Discussion
              </h2>
              <button
                type="button"
                className="qa-close-btn"
                onClick={() => setShowAskModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateQuestion}>
              <div className="qa-modal-body">
                {/* Title */}
                <div className="qa-form-group">
                  <label className="qa-form-label">
                    Question Title / Subject Heading <span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    className="qa-form-input"
                    placeholder="e.g. How does photosynthesis work during dark phase?"
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    required
                  />
                </div>

                {/* Body */}
                <div className="qa-form-group">
                  <label className="qa-form-label">
                    Detailed Query Description <span className="req">*</span>
                  </label>
                  <textarea
                    className="qa-form-textarea"
                    placeholder="Provide full context, problem formulation, textbook chapter, or specific doubt..."
                    value={modalBody}
                    onChange={(e) => setModalBody(e.target.value)}
                    required
                  />
                </div>

                {/* Category */}
                <div className="qa-form-group">
                  <label className="qa-form-label">Category</label>
                  <select
                    className="qa-form-select"
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value)}
                  >
                    {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject Selection (Campus vs Custom) */}
                <div className="qa-form-group">
                  <label className="qa-form-label">Academic Subject</label>
                  <div className="qa-subject-toggle-row">
                    <button
                      type="button"
                      className={`qa-toggle-btn ${!isCustomSubject ? 'active' : ''}`}
                      onClick={() => setIsCustomSubject(false)}
                    >
                      <BookOpen size={14} style={{ display: 'inline', marginRight: 6 }} />
                      Available Campus Subject
                    </button>
                    <button
                      type="button"
                      className={`qa-toggle-btn ${isCustomSubject ? 'active' : ''}`}
                      onClick={() => setIsCustomSubject(true)}
                    >
                      <Tag size={14} style={{ display: 'inline', marginRight: 6 }} />
                      Custom / Interdisciplinary Subject
                    </button>
                  </div>

                  {!isCustomSubject ? (
                    <select
                      className="qa-form-select"
                      value={modalSubjectId}
                      onChange={(e) => setModalSubjectId(e.target.value)}
                    >
                      <option value="">-- Choose Campus Subject (Optional) --</option>
                      {campusSubjects.map((sub) => (
                        <option key={sub.id} value={String(sub.id)}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="qa-form-input"
                      placeholder="e.g. Robotics & Automation, AI Ethics, Olympiad Physics, Business Studies"
                      value={modalCustomSubject}
                      onChange={(e) => setModalCustomSubject(e.target.value)}
                    />
                  )}
                </div>

                {/* Class / Grade Targeting */}
                <div className="qa-form-group">
                  <label className="qa-form-label">Target Class / Grade Level (Optional)</label>
                  <select
                    className="qa-form-select"
                    value={modalClassId}
                    onChange={(e) => setModalClassId(e.target.value)}
                  >
                    <option value="">-- All Grade Levels / General --</option>
                    {campusClasses.map((cls) => (
                      <option key={cls.id} value={String(cls.id)}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Audience Scope ("Who Can Discuss?") */}
                <div className="qa-form-group">
                  <label className="qa-form-label">
                    Audience Scope & Who Can Discuss <span className="req">*</span>
                  </label>
                  <div className="qa-scope-picker-grid">
                    {/* Worldwide */}
                    <div
                      className={`qa-scope-choice-card ${modalAudienceScope === 'worldwide' ? 'selected' : ''}`}
                      onClick={() => setModalAudienceScope('worldwide')}
                    >
                      <input
                        type="radio"
                        className="qa-scope-choice-radio"
                        name="audience_scope"
                        checked={modalAudienceScope === 'worldwide'}
                        onChange={() => setModalAudienceScope('worldwide')}
                      />
                      <div className="qa-scope-choice-info">
                        <div className="qa-scope-choice-title">
                          <Globe size={16} color="#0284c7" /> Worldwide / Global Network
                        </div>
                        <div className="qa-scope-choice-desc">
                          Everyone everywhere across schools, teachers, and students worldwide can view, discuss, and share their answers and opinions.
                        </div>
                      </div>
                    </div>

                    {/* All Campuses */}
                    <div
                      className={`qa-scope-choice-card ${modalAudienceScope === 'all_campuses' ? 'selected' : ''}`}
                      onClick={() => setModalAudienceScope('all_campuses')}
                    >
                      <input
                        type="radio"
                        className="qa-scope-choice-radio"
                        name="audience_scope"
                        checked={modalAudienceScope === 'all_campuses'}
                        onChange={() => setModalAudienceScope('all_campuses')}
                      />
                      <div className="qa-scope-choice-info">
                        <div className="qa-scope-choice-title">
                          <Building2 size={16} color="#7e22ce" /> All Branches / Campuses (All Staff & Admins)
                        </div>
                        <div className="qa-scope-choice-desc">
                          Cross-campus exchange open to administrators, principals, and teachers across all organisation branches.
                        </div>
                      </div>
                    </div>

                    {/* Our Campus Staff All */}
                    <div
                      className={`qa-scope-choice-card ${modalAudienceScope === 'campus_staff_all' ? 'selected' : ''}`}
                      onClick={() => setModalAudienceScope('campus_staff_all')}
                    >
                      <input
                        type="radio"
                        className="qa-scope-choice-radio"
                        name="audience_scope"
                        checked={modalAudienceScope === 'campus_staff_all'}
                        onChange={() => setModalAudienceScope('campus_staff_all')}
                      />
                      <div className="qa-scope-choice-info">
                        <div className="qa-scope-choice-title">
                          <SchoolIcon size={16} color="#059669" /> Our Campus Staff & Students (All)
                        </div>
                        <div className="qa-scope-choice-desc">
                          Campus-wide forum for teachers, principals, administrators, and students of our specific campus.
                        </div>
                      </div>
                    </div>

                    {/* Our Campus Teachers Only */}
                    <div
                      className={`qa-scope-choice-card ${modalAudienceScope === 'campus_teachers' ? 'selected' : ''}`}
                      onClick={() => setModalAudienceScope('campus_teachers')}
                    >
                      <input
                        type="radio"
                        className="qa-scope-choice-radio"
                        name="audience_scope"
                        checked={modalAudienceScope === 'campus_teachers'}
                        onChange={() => setModalAudienceScope('campus_teachers')}
                      />
                      <div className="qa-scope-choice-info">
                        <div className="qa-scope-choice-title">
                          <GraduationCap size={16} color="#d97706" /> Our Campus Teachers Only
                        </div>
                        <div className="qa-scope-choice-desc">
                          Private faculty-only discussion. Only verified teachers and campus leadership can view and contribute answers.
                        </div>
                      </div>
                    </div>

                    {/* Our Campus Students Only */}
                    <div
                      className={`qa-scope-choice-card ${modalAudienceScope === 'campus_students' ? 'selected' : ''}`}
                      onClick={() => setModalAudienceScope('campus_students')}
                    >
                      <input
                        type="radio"
                        className="qa-scope-choice-radio"
                        name="audience_scope"
                        checked={modalAudienceScope === 'campus_students'}
                        onChange={() => setModalAudienceScope('campus_students')}
                      />
                      <div className="qa-scope-choice-info">
                        <div className="qa-scope-choice-title">
                          <Users size={16} color="#2563eb" /> Our Campus Students Only
                        </div>
                        <div className="qa-scope-choice-desc">
                          Peer learning forum where students of our campus ask questions and help each other with academic challenges.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="qa-modal-footer">
                <button
                  type="button"
                  className="qa-btn-secondary"
                  onClick={() => setShowAskModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="qa-btn-primary"
                  disabled={submittingQuestion}
                >
                  <Send size={15} /> {submittingQuestion ? 'Publishing...' : 'Publish Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
