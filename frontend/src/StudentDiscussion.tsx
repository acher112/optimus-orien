import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Plus,
  CheckCircle2,
  Lock,
  EyeOff,
  Flag,
  AlertTriangle,
  Send,
  X,
  Search,
  BookOpen,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { request } from './api';

interface Props {
  user: any;
  notify?: (msg: string) => void;
}

export const StudentDiscussion: React.FC<Props> = ({ user, notify }) => {
  const [threads, setThreads] = useState<any[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [disabledMessage, setDisabledMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<any | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  // New Question Modal
  const [showAskModal, setShowAskModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newClass, setNewClass] = useState('');
  const [subjectsList, setSubjectsList] = useState<any[]>([]);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Reply Input
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Report Modal
  const [reportItem, setReportItem] = useState<{ type: 'thread' | 'post'; id: number } | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    loadThreads();
    loadCurriculum();
  }, []);

  const loadThreads = async () => {
    setLoading(true);
    try {
      const res: any = await request('discussion/threads/');
      setEnabled(res.enabled !== false);
      if (res.enabled === false) {
        setDisabledMessage(res.message || 'Class discussion is disabled by school administration.');
        setThreads([]);
      } else {
        setThreads(res.threads || []);
      }
    } catch (err: any) {
      if (notify) notify(err?.message || 'Could not load discussions.');
    } finally {
      setLoading(false);
    }
  };

  const loadCurriculum = async () => {
    try {
      const subRes: any = await request('subjects/');
      const clsRes: any = await request('classes/');
      const subs = Array.isArray(subRes) ? subRes : subRes?.results || [];
      const cls = Array.isArray(clsRes) ? clsRes : clsRes?.results || [];
      setSubjectsList(subs);
      setClassesList(cls);
      if (cls.length > 0) setNewClass(String(cls[0].id));
      if (subs.length > 0) setNewSubject(String(subs[0].id));
    } catch (err) {
      // ignore
    }
  };

  const openThread = async (id: number) => {
    setLoadingThread(true);
    setReplyError(null);
    try {
      const res: any = await request(`discussion/threads/${id}/`);
      setActiveThread(res);
    } catch (err: any) {
      if (notify) notify(err?.message || 'Could not open thread.');
    } finally {
      setLoadingThread(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setAskError(null);
    setSubmitting(true);
    try {
      await request('discussion/threads/', {
        method: 'POST',
        body: JSON.stringify({
          class_id: newClass,
          subject_id: newSubject,
          title: newTitle,
          body: newBody
        })
      });

      if (notify) notify('Your question has been posted to the class.');
      setShowAskModal(false);
      setNewTitle('');
      setNewBody('');
      loadThreads();
    } catch (err: any) {
      setAskError(err?.message || 'Could not post question.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread) return;
    setReplyError(null);
    setReplying(true);
    try {
      await request(`discussion/threads/${activeThread.id}/reply/`, {
        method: 'POST',
        body: JSON.stringify({ body: replyBody })
      });

      setReplyBody('');
      if (notify) notify('Reply submitted.');
      openThread(activeThread.id);
    } catch (err: any) {
      setReplyError(err?.message || 'Could not submit reply.');
    } finally {
      setReplying(false);
    }
  };

  const handleAcceptAnswer = async (postId: number) => {
    if (!activeThread) return;
    try {
      await request(`discussion/threads/${activeThread.id}/accept/`, {
        method: 'POST',
        body: JSON.stringify({ post_id: postId })
      });
      if (notify) notify('Answer accepted!');
      openThread(activeThread.id);
    } catch (err: any) {
      if (notify) notify(err?.message || 'Could not accept answer.');
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportItem) return;
    setReporting(true);
    try {
      await request('discussion/reports/', {
        method: 'POST',
        body: JSON.stringify({
          [reportItem.type === 'thread' ? 'thread_id' : 'post_id']: reportItem.id,
          reason: reportReason
        })
      });
      if (notify) notify('Thank you. The report has been sent to school moderators.');
      setReportItem(null);
      setReportReason('');
    } catch (err: any) {
      if (notify) notify(err?.message || 'Could not submit report.');
    } finally {
      setReporting(false);
    }
  };

  if (!enabled) {
    return (
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: 40,
        textAlign: 'center',
        border: '1px solid #e2e8f0',
        maxWidth: 540,
        margin: '40px auto'
      }}>
        <Lock size={36} color="#94a3b8" style={{ marginBottom: 12 }} />
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
          Class Discussion Disabled
        </h3>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#64748b' }}>
          {disabledMessage}
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* Header */}
      <div style={{
        background: '#ffffff',
        borderRadius: 16,
        padding: '20px 24px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <MessageSquare size={20} color="#0891b2" />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
              Class Discussion & Subject Q&A
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Moderated academic questions with your classmates and assigned teachers.
          </p>
        </div>

        {user.role !== 'parent' && (
          <button
            onClick={() => setShowAskModal(true)}
            style={{
              background: '#0891b2',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Plus size={16} /> Ask a Question
          </button>
        )}
      </div>

      {/* Main Discussion Layout: Threads List or Thread Detail */}
      {activeThread ? (
        <div style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}>
          {/* Back button */}
          <button
            onClick={() => { setActiveThread(null); loadThreads(); }}
            style={{
              alignSelf: 'flex-start',
              background: '#f1f5f9',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 700,
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            ← Back to All Discussions
          </button>

          {/* Question Box */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: '#e0f2fe',
                    color: '#0369a1'
                  }}>
                    {activeThread.subject.name}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Posted by <b>{activeThread.author.name}</b>
                  </span>
                </div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  {activeThread.title}
                </h2>
              </div>

              <button
                onClick={() => setReportItem({ type: 'thread', id: activeThread.id })}
                title="Report inappropriate content"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <Flag size={16} />
              </button>
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 14, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {activeThread.body}
            </p>
          </div>

          {/* Replies Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              Replies ({activeThread.posts?.length || 0})
            </h3>

            {activeThread.posts && activeThread.posts.length > 0 ? (
              activeThread.posts.map((post: any) => (
                <div
                  key={post.id}
                  style={{
                    background: post.is_accepted ? '#f0fdf4' : '#ffffff',
                    border: post.is_accepted ? '2px solid #86efac' : '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {post.author.name}
                      </span>
                      {post.is_accepted && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#15803d',
                          background: '#dcfce7',
                          padding: '2px 8px',
                          borderRadius: 4
                        }}>
                          <CheckCircle2 size={13} /> Accepted Answer
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {activeThread.can_accept && !post.is_accepted && (
                        <button
                          onClick={() => handleAcceptAnswer(post.id)}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#334155',
                            cursor: 'pointer'
                          }}
                        >
                          Mark as Accepted
                        </button>
                      )}
                      <button
                        onClick={() => setReportItem({ type: 'post', id: post.id })}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                      >
                        <Flag size={14} />
                      </button>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {post.body}
                  </p>
                </div>
              ))
            ) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No replies yet. Be the first to share an answer or explanation!
              </div>
            )}
          </div>

          {/* Reply Input Box */}
          {activeThread.can_reply ? (
            <form onSubmit={handleReply} style={{
              borderTop: '1px solid #f1f5f9',
              paddingTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              {replyError && (
                <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                  {replyError}
                </div>
              )}
              <textarea
                rows={3}
                required
                placeholder="Write a helpful, academic response…"
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Keep answers respectful. Contact details and external links are prohibited.
                </span>
                <button
                  type="submit"
                  disabled={replying}
                  style={{
                    background: '#0891b2',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: replying ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Send size={14} /> {replying ? 'Posting…' : 'Post Reply'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{
              background: '#f8fafc',
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              color: '#64748b',
              textAlign: 'center'
            }}>
              This thread is locked from further replies.
            </div>
          )}
        </div>
      ) : (
        /* Threads List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {threads.length > 0 ? (
            threads.map((t: any) => (
              <div
                key={t.id}
                onClick={() => openThread(t.id)}
                style={{
                  background: '#ffffff',
                  borderRadius: 14,
                  padding: '18px 22px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: '#e0f2fe',
                      color: '#0369a1'
                    }}>
                      {t.subject.name}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Asked by <b>{t.author.name}</b>
                    </span>
                    {t.has_accepted_answer && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#15803d',
                        background: '#dcfce7',
                        padding: '2px 6px',
                        borderRadius: 4
                      }}>
                        Answered
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    {t.title}
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {t.body.length > 90 ? `${t.body.slice(0, 90)}…` : t.body}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#64748b',
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  <MessageSquare size={16} />
                  <span>{t.posts_count} replies</span>
                </div>
              </div>
            ))
          ) : (
            <div style={{
              background: '#ffffff',
              borderRadius: 16,
              padding: 40,
              textAlign: 'center',
              border: '1px solid #e2e8f0',
              color: '#64748b'
            }}>
              <MessageSquare size={36} color="#94a3b8" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>No class questions yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Ask a question about homework, class concepts, or exam prep to get help.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ask Question Modal */}
      {showAskModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 540,
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{
              background: '#f8fafc',
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Ask a Class Question</h3>
              <button onClick={() => setShowAskModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAskQuestion} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {askError && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#b91c1c'
                }}>
                  {askError}
                </div>
              )}

              {/* Safety notice banner */}
              <div style={{
                background: '#f0fdfa',
                border: '1px solid #ccfbf1',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                color: '#0f766e',
                lineHeight: 1.4
              }}>
                <ShieldCheck size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                <span>Keep questions academic and respectful. Phone numbers, email addresses, and external links are prohibited.</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Subject <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  required
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                >
                  {subjectsList.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Question Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Help understanding quadratic formula step 3"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Details / Explanation <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Provide context so classmates and teachers can give clear explanations…"
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setShowAskModal(false)}
                  style={{ background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ background: '#0891b2', color: '#ffffff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}
                >
                  {submitting ? 'Posting…' : 'Submit Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            width: '100%',
            maxWidth: 420,
            overflow: 'hidden',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              background: '#f8fafc',
              padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Report Content</h3>
              <button onClick={() => setReportItem(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleReport} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, color: '#475569' }}>
                Please specify why this question or reply should be reviewed by moderators:
              </div>
              <textarea
                rows={3}
                required
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
                placeholder="e.g. Inappropriate language, off-topic, or privacy concern"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setReportItem(null)}
                  style={{ background: '#e2e8f0', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reporting}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  {reporting ? 'Sending…' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
