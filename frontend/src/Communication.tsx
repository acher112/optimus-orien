import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  CornerDownRight,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { request, type User } from './api';
import './hr.css';

type R = Record<string, any>;

interface SubjectInfo {
  id: number;
  name: string;
  code: string;
  teacher_id: number | null;
  teacher_name: string;
  can_chat: boolean;
}

interface ClassInfo {
  id: number;
  name: string;
  grade_level: string;
  school_id: number;
  school_name: string;
  subjects: SubjectInfo[];
}

interface MessageItem {
  id: number;
  school_class: number;
  subject: number;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  sender_avatar_color: string;
  message: string;
  is_teacher_answer: boolean;
  reply_to: { id: number; sender_name: string; message: string } | null;
  created_at: string;
}

export default function Communication({ user, notify }: { user: User; notify: (m: string) => void }) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [msgSearch, setMsgSearch] = useState('');
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [error, setError] = useState('');

  const displayMessages = useMemo(() => {
    if (!msgSearch.trim()) return messages;
    const lower = msgSearch.toLowerCase();
    return messages.filter(m => m.message.toLowerCase().includes(lower) || m.sender_name.toLowerCase().includes(lower));
  }, [messages, msgSearch]);
  const [teachers, setTeachers] = useState<R[]>([]);
  const [assignModal, setAssignModal] = useState(false);
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const canManageTeachers = ['organisation_admin', 'school_admin', 'principal'].includes(user.role);

  // Load available channels
  const loadChannels = useCallback(async () => {
    setError('');
    try {
      const data = await request<{ classes: ClassInfo[] }>('communication/channels/');
      setClasses(data.classes);
      if (data.classes.length > 0) {
        const firstClass = data.classes[0];
        setSelectedClassId(prev => prev ?? firstClass.id);
        if (firstClass.subjects.length > 0) {
          setSelectedSubjectId(prev => prev ?? firstClass.subjects[0].id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load communication channels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Load teachers list for assignment (if admin/principal)
  useEffect(() => {
    if (canManageTeachers) {
      request<{ results: R[] }>('teachers/')
        .then(d => setTeachers(d.results || []))
        .catch(() => {});
    }
  }, [canManageTeachers]);

  const activeClass = classes.find(c => c.id === selectedClassId) || classes[0];
  const activeSubject = activeClass?.subjects.find(s => s.id === selectedSubjectId) || activeClass?.subjects[0];

  // Load messages for selected class and subject
  const loadMessages = useCallback(async () => {
    if (!activeClass || !activeSubject) return;
    setLoadingMsgs(true);
    try {
      const data = await request<{ results: MessageItem[] }>(
        `communication/messages/?school_class=${activeClass.id}&subject=${activeSubject.id}`
      );
      setMessages(data.results);
    } catch (e) {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, [activeClass, activeSubject]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeClass || !activeSubject || sending) return;

    setSending(true);
    try {
      await request<MessageItem>('communication/messages/', {
        method: 'POST',
        body: JSON.stringify({
          school_class: activeClass.id,
          subject: activeSubject.id,
          message: text.trim(),
          reply_to: replyTo ? replyTo.id : undefined,
        }),
      });
      setText('');
      setReplyTo(null);
      await loadMessages();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAssignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClass || !activeSubject || !assignTeacherId) return;
    setAssigning(true);
    try {
      await request('communication/assignments/', {
        method: 'POST',
        body: JSON.stringify({
          school_class: activeClass.id,
          subject: activeSubject.id,
          teacher: Number(assignTeacherId),
        }),
      });
      notify('Teacher assigned to subject successfully');
      setAssignModal(false);
      await loadChannels();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Failed to assign teacher');
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return <div className="rp-empty">Loading classroom communication...</div>;
  }

  if (!classes.length) {
    return (
      <div className="empty">
        <span><MessageSquare size={28} /></span>
        <strong>No active classes found</strong>
        <p>You currently do not have access to any class subject discussions.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">CLASSROOM / DISCUSSIONS</div>
          <h1>Subject communication</h1>
          <p>
            Communicate and ask questions within your class subjects. Subject teachers can answer and guide their students.
          </p>
        </div>
        <div className="toolbar-right">
          <button className="outline-btn" onClick={loadMessages}>
            <RefreshCw size={15} /> Refresh discussions
          </button>
        </div>
      </div>

      {error && (
        <div className="error-bar">
          <AlertCircle size={17} /> {error}
        </div>
      )}

      {/* Class Selector if multiple classes */}
      {classes.length > 1 && (
        <div className="fx-filters" style={{ marginBottom: 18 }}>
          <label>
            Select Class
            <select
              className="fx-select"
              value={activeClass?.id || ''}
              onChange={e => {
                const cid = Number(e.target.value);
                setSelectedClassId(cid);
                const cls = classes.find(c => c.id === cid);
                if (cls && cls.subjects.length > 0) {
                  setSelectedSubjectId(cls.subjects[0].id);
                }
              }}
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.school_name ? `(${c.school_name})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Main Discussion Layout */}
      <div className="comm-container">
        {/* Subject Navigation Tabs / Sidebar */}
        <aside className="comm-sidebar">
          <div className="comm-sidebar-header">
            <Users size={16} />
            <span>{activeClass?.name || 'Class'} Subjects</span>
          </div>

          <div className="comm-subject-list">
            {activeClass?.subjects.map(s => {
              const isSelected = activeSubject?.id === s.id;
              return (
                <button
                  key={s.id}
                  className={`comm-subject-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedSubjectId(s.id);
                    setReplyTo(null);
                  }}
                >
                  <div className="comm-subject-icon">
                    <BookOpen size={16} />
                  </div>
                  <div className="comm-subject-info">
                    <strong>{s.name}</strong>
                    <span className="comm-subject-meta">
                      {s.code} · {s.teacher_name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Discussion Stream */}
        <main className="comm-main">
          {activeSubject ? (
            <>
              {/* Channel Header */}
              <div className="comm-header">
                <div>
                  <h3>
                    {activeClass?.name} &rsaquo; {activeSubject.name} ({activeSubject.code})
                  </h3>
                  <p>
                    Lead Teacher: <strong>{activeSubject.teacher_name}</strong>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div className="searchbox" style={{ width: 220 }}>
                    <Search size={14} />
                    <input
                      placeholder="Search messages..."
                      value={msgSearch}
                      onChange={e => setMsgSearch(e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px 4px 28px' }}
                    />
                    {msgSearch && <button onClick={() => setMsgSearch('')}><X size={12} /></button>}
                  </div>
                  {canManageTeachers && (
                    <button
                      className="outline-btn"
                      style={{ fontSize: 11, padding: '7px 12px' }}
                      onClick={() => {
                        setAssignTeacherId(activeSubject.teacher_id ? String(activeSubject.teacher_id) : '');
                        setAssignModal(true);
                      }}
                    >
                      <UserCheck size={14} /> Assign Teacher
                    </button>
                  )}
                </div>
              </div>

              {/* Message Feed */}
              <div className="comm-messages">
                {loadingMsgs ? (
                  <div className="rp-empty">Loading messages...</div>
                ) : displayMessages.length === 0 ? (
                  <div className="comm-empty">
                    <MessageSquare size={32} />
                    <p>{msgSearch ? 'No messages matching your search.' : `No questions or messages posted for ${activeSubject.name} yet.`}</p>
                    <small>{msgSearch ? 'Try a different search term.' : 'Be the first to post a question or topic for your teacher and classmates!'}</small>
                  </div>
                ) : (
                  displayMessages.map(m => {
                    const isMe = m.sender_id === user.id;
                    const isTeacher = m.is_teacher_answer || m.sender_role === 'teacher';

                    return (
                      <div
                        key={m.id}
                        className={`comm-bubble ${isTeacher ? 'teacher-message' : ''} ${isMe ? 'mine' : ''}`}
                      >
                        <div className="comm-bubble-header">
                          <span
                            className="comm-avatar"
                            style={{
                              background: m.sender_avatar_color ? `${m.sender_avatar_color}22` : '#e9e1ff',
                              color: m.sender_avatar_color || '#7862d7',
                            }}
                          >
                            {m.sender_name.slice(0, 2).toUpperCase()}
                          </span>
                          <strong className="comm-sender-name">{m.sender_name}</strong>
                          <span
                            className={`comm-role-pill ${
                              isTeacher ? 'role-teacher-pill' : 'role-student-pill'
                            }`}
                          >
                            {isTeacher ? 'Teacher' : m.sender_role.toUpperCase()}
                          </span>
                          <span className="comm-time">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button
                            className="comm-reply-btn"
                            title="Reply to this message"
                            onClick={() => setReplyTo(m)}
                          >
                            <CornerDownRight size={13} /> Reply
                          </button>
                          {(isMe || canManageTeachers || user.is_superuser) && (
                            <button
                              className="comm-reply-btn"
                              style={{ color: '#ef4444', marginLeft: 4 }}
                              title="Delete this message"
                              onClick={async () => {
                                if (!window.confirm('Delete this message?')) return;
                                try {
                                  await request(`communication/messages/${m.id}/`, { method: 'DELETE' });
                                  loadMessages();
                                } catch (e) {
                                  notify(e instanceof Error ? e.message : 'Could not delete message');
                                }
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>

                        {m.reply_to && (
                          <div className="comm-reply-quote">
                            <strong>{m.reply_to.sender_name}:</strong> {m.reply_to.message}
                          </div>
                        )}

                        <div className="comm-bubble-body">{m.message}</div>
                        {isTeacher && (
                          <div className="comm-official-tag">
                            <CheckCircle2 size={13} /> Official Teacher Answer
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Preview */}
              {replyTo && (
                <div className="comm-replying-banner">
                  <div className="comm-replying-text">
                    <span>Replying to <strong>{replyTo.sender_name}</strong>:</span>
                    <small>"{replyTo.message.slice(0, 80)}"</small>
                  </div>
                  <button className="comm-close-reply" onClick={() => setReplyTo(null)}>
                    <X size={15} />
                  </button>
                </div>
              )}

              {/* Message Composer */}
              <form className="comm-composer" onSubmit={handleSend}>
                <input
                  type="text"
                  className="comm-input"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={
                    user.role === 'teacher'
                      ? `Answer student question or post in ${activeSubject.name}...`
                      : `Ask a question in ${activeSubject.name}...`
                  }
                  required
                />
                <button type="submit" className="primary-btn" disabled={sending || !text.trim()}>
                  <Send size={15} /> {sending ? 'Posting...' : 'Send'}
                </button>
              </form>
            </>
          ) : (
            <div className="rp-empty">Select a subject from the left panel to join the discussion.</div>
          )}
        </main>
      </div>

      {/* Assign Teacher Modal */}
      {assignModal && activeClass && activeSubject && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-head">
              <div className="modal-icon"><UserCheck size={20} /></div>
              <div>
                <h3>Assign Teacher to {activeSubject.name}</h3>
                <p>Assign an active teacher for {activeClass.name} - {activeSubject.name}</p>
              </div>
              <button onClick={() => setAssignModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAssignTeacher}>
              <div className="modal-fields" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label>
                  Select Teacher
                  <select
                    required
                    className="fx-select"
                    value={assignTeacherId}
                    onChange={e => setAssignTeacherId(e.target.value)}
                  >
                    <option value="">Choose teacher...</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.full_name} ({t.email || t.username})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="outline-btn" onClick={() => setAssignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={assigning || !assignTeacherId}>
                  <Plus size={15} /> {assigning ? 'Assigning...' : 'Assign Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
