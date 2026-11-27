import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  Search,
  ArrowLeft,
  Shield,
  Lock,
  Check,
  CheckCheck,
  Users,
  RefreshCw,
  Sparkles,
  UserPlus
} from 'lucide-react';
import {
  communicationApi,
  type InboxConversation,
  type InboxMessage
} from './communicationApi';
import './inbox.css';

interface InboxViewProps {
  currentUser?: {
    id?: number;
    username?: string;
    first_name?: string;
    last_name?: string;
    role?: string;
  } | null;
  notify?: (msg: string, type?: 'info' | 'error' | 'success') => void;
  initialPeerId?: number;
}

export const InboxView: React.FC<InboxViewProps> = ({
  currentUser,
  notify,
  initialPeerId
}) => {
  const currentUserId = currentUser?.id || 0;

  // Conversations & Selection
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState<boolean>(true);
  const [selectedConvo, setSelectedConvo] = useState<InboxConversation | null>(null);

  // Messages in active conversation
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'friends'>('all');

  // Mobile layout state
  const [mobileChatActive, setMobileChatActive] = useState<boolean>(false);

  // Container ref to control messages scroll without scrolling window/viewport
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<any>(null);
  const convoPollRef = useRef<any>(null);

  // Dedicated container-only scroll to prevent window jumping
  const scrollToBottom = useCallback((smooth = true) => {
    const el = messagesContainerRef.current;
    if (el) {
      if (smooth) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, []);

  // Ensure window stays pinned at top on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      } catch {}
    }
  }, []);

  // 1. Fetch Conversations List
  const fetchConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingConvos(true);
    try {
      const res = await communicationApi.getInboxConversations();
      const list = res.conversations || [];
      setConversations(list);
    } catch (err: any) {
      if (!quiet) {
        console.error('[Inbox] Error fetching conversations:', err);
      }
    } finally {
      if (!quiet) setLoadingConvos(false);
    }
  }, []);

  // Initial load & search query params (?peer=...)
  useEffect(() => {
    fetchConversations().then(() => {
      let peerToOpen = initialPeerId;
      if (!peerToOpen && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const p = urlParams.get('peer');
        if (p) peerToOpen = Number(p);
      }

      if (peerToOpen) {
        handleOpenPeerConversation(peerToOpen);
      }
    });

    // Poll conversations list in background every 8 seconds
    convoPollRef.current = setInterval(() => {
      fetchConversations(true);
    }, 8000);

    return () => {
      if (convoPollRef.current) clearInterval(convoPollRef.current);
    };
  }, [initialPeerId, fetchConversations]);

  // Total unread count across all conversations
  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  }, [conversations]);

  // 2. Open or Create Conversation with Peer
  const handleOpenPeerConversation = async (peerId: number) => {
    try {
      setLoadingMessages(true);
      const res = await communicationApi.openInboxConversation(peerId);
      const freshListRes = await communicationApi.getInboxConversations();
      const freshList = freshListRes.conversations || [];
      setConversations(freshList);

      const targetConvo = freshList.find(
        (c) => c.conversation_id === res.conversation_id || c.peer.id === peerId
      );
      if (targetConvo) {
        selectConversation(targetConvo);
      }
    } catch (err: any) {
      if (notify) notify(err?.message || 'Could not open conversation with peer.');
    } finally {
      setLoadingMessages(false);
    }
  };

  // 3. Select active conversation
  const selectConversation = async (convo: InboxConversation) => {
    setSelectedConvo(convo);
    setMobileChatActive(true);
    setMessages([]);
    setLoadingMessages(true);

    if (!convo.conversation_id) {
      // Connected but no messages yet
      setLoadingMessages(false);
      return;
    }

    try {
      const res = await communicationApi.getInboxMessages(convo.conversation_id);
      const rawMsgs = res.messages || [];
      setMessages(rawMsgs);

      // Clear unread count locally for responsive UX
      setConversations((prev) =>
        prev.map((c) =>
          c.conversation_id === convo.conversation_id ? { ...c, unread_count: 0 } : c
        )
      );

      setTimeout(() => scrollToBottom(false), 30);
    } catch (err: any) {
      console.error('[Inbox] Error loading messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // 4. Poll active conversation for rapid incoming messages (every 2.5s)
  useEffect(() => {
    if (!selectedConvo?.conversation_id) return;
    const cid = selectedConvo.conversation_id;

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await communicationApi.getInboxMessages(cid);
        const freshMsgs = res.messages || [];

        setMessages((prev) => {
          if (freshMsgs.length > prev.length) {
            setTimeout(() => scrollToBottom(true), 40);
            return freshMsgs;
          }
          return prev;
        });
      } catch {
        // quiet poll fail
      }
    }, 2500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [selectedConvo?.conversation_id, scrollToBottom]);

  // 5. Send message (Backend handles AES-256-GCM encryption at rest)
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || sending || !selectedConvo) return;

    setSending(true);
    setInputText('');

    try {
      let targetConvId = selectedConvo.conversation_id;

      // If conversation hasn't been instantiated in DB yet, instantiate now
      if (!targetConvId) {
        const openRes = await communicationApi.openInboxConversation(selectedConvo.peer.id);
        targetConvId = openRes.conversation_id;
        selectedConvo.conversation_id = targetConvId;
      }

      // Optimistic message placeholder
      const tempId = Date.now();
      const optimisticMsg: InboxMessage = {
        id: tempId,
        conversation_id: targetConvId,
        sender_id: currentUserId,
        sender_name: currentUser?.first_name || currentUser?.username || 'You',
        is_mine: true,
        text,
        ciphertext: text,
        nonce: 'backend-e2ee',
        sent_at: new Date().toISOString(),
        delivered_at: null
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(() => scrollToBottom(true), 20);

      // Dispatch to API
      const sentRes = await communicationApi.sendInboxMessage(
        targetConvId,
        text
      );

      // Update real message ID & delivered status
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: sentRes.message_id, sent_at: sentRes.sent_at }
            : m
        )
      );

      // Update conversation snippet and total count in sidebar
      setConversations((prev) =>
        prev.map((c) => {
          if (c.conversation_id === targetConvId || c.peer.id === selectedConvo.peer.id) {
            return {
              ...c,
              conversation_id: targetConvId,
              total_messages: (c.total_messages || 0) + 1,
              who_msg_first: c.who_msg_first === 'none' ? 'you' : c.who_msg_first,
              who_msg_first_label:
                c.who_msg_first === 'none' ? 'You initiated this chat' : c.who_msg_first_label,
              last_message: {
                text,
                ciphertext: text,
                sender_name: 'You',
                sent_at: sentRes.sent_at,
                is_mine: true,
                delivered: false
              },
              last_activity_at: sentRes.sent_at
            };
          }
          return c;
        })
      );
    } catch (err: any) {
      if (notify) notify(err?.message || 'Failed to send encrypted message.');
      console.error('[Inbox] Send error:', err);
    } finally {
      setSending(false);
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Filtered conversations list
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Tab filter
      if (activeTab === 'unread' && (!c.unread_count || c.unread_count <= 0)) {
        return false;
      }
      if (activeTab === 'friends' && c.total_messages <= 0) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = c.peer.name?.toLowerCase().includes(q);
        const schoolMatch = c.peer.school?.toLowerCase().includes(q);
        const roleMatch = c.peer.role_label?.toLowerCase().includes(q);
        return nameMatch || schoolMatch || roleMatch;
      }
      return true;
    });
  }, [conversations, activeTab, searchQuery]);

  // Format timestamp helper
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="inbox-wrapper">
      <div className="inbox-card-container">
        {/* =================================================================== */}
        {/* LEFT COLUMN: CONVERSATIONS SIDEBAR                                  */}
        {/* =================================================================== */}
        <aside
          className={`inbox-sidebar ${mobileChatActive ? 'hidden-mobile' : ''}`}
          aria-label="Conversations"
        >
          <div className="inbox-sidebar-header">
            <div className="inbox-sidebar-title-row">
              <h2 className="inbox-sidebar-title">
                <MessageSquare size={20} color="#0284c7" />
                <span>Messages & Chat</span>
              </h2>
              {totalUnreadCount > 0 && (
                <span className="inbox-total-unread-badge" title="Total unread messages">
                  {totalUnreadCount} new
                </span>
              )}
            </div>

            {/* Search Input */}
            <div className="inbox-search-box">
              <Search size={15} className="inbox-search-icon" />
              <input
                type="text"
                className="inbox-search-input"
                placeholder="Search connected peers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Quick Filter Tabs */}
            <div className="inbox-filter-tabs">
              <button
                type="button"
                className={`inbox-filter-tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All ({conversations.length})
              </button>
              <button
                type="button"
                className={`inbox-filter-tab ${activeTab === 'unread' ? 'active' : ''}`}
                onClick={() => setActiveTab('unread')}
              >
                Unread {totalUnreadCount > 0 ? `(${totalUnreadCount})` : ''}
              </button>
              <button
                type="button"
                className={`inbox-filter-tab ${activeTab === 'friends' ? 'active' : ''}`}
                onClick={() => setActiveTab('friends')}
              >
                Active Chats
              </button>
            </div>
          </div>

          {/* Conversations Scrollable List */}
          <div className="inbox-convos-scroll">
            {loadingConvos ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                <RefreshCw
                  size={20}
                  className="inbox-spin"
                  style={{ margin: '0 auto 10px auto', display: 'block', animation: 'spin 1s linear infinite' }}
                />
                Loading secure inbox...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                <Users size={32} color="#cbd5e1" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                <p style={{ fontWeight: 700, margin: '0 0 4px 0', color: '#1e293b' }}>
                  {searchQuery ? 'No matching peers' : 'No conversations yet'}
                </p>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px 0' }}>
                  Connect with students, teachers, or principals in Community to start messaging.
                </p>
                <button
                  type="button"
                  className="comm-btn-connect"
                  style={{ margin: '0 auto', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => {
                    window.history.pushState(null, '', '/app/community');
                    window.dispatchEvent(new CustomEvent('optimus_navigate', { detail: { page: 'Community' } }));
                  }}
                >
                  <UserPlus size={14} /> Explore Community
                </button>
              </div>
            ) : (
              filteredConversations.map((convo) => {
                const isSelected = selectedConvo?.peer.id === convo.peer.id;

                // Format clean snippet: shows sender or receiver name + readable message text
                const lastMsg = convo.last_message;
                let snippet = 'Connected — start the conversation!';
                if (lastMsg) {
                  const author = lastMsg.is_mine
                    ? 'You'
                    : (lastMsg.sender_name || convo.peer.name.split(' ')[0]);
                  const content = lastMsg.text || lastMsg.ciphertext || 'New message';
                  snippet = `${author}: ${content}`;
                }

                return (
                  <div
                    key={convo.peer.id}
                    className={`inbox-convo-item ${isSelected ? 'active' : ''}`}
                    onClick={() => selectConversation(convo)}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Peer Avatar */}
                    <div className="inbox-avatar-wrap">
                      <div
                        className="inbox-avatar-circle"
                        style={{ background: convo.peer.avatar_color || '#0284c7' }}
                      >
                        {convo.peer.name.charAt(0)}
                      </div>
                      <span className="inbox-online-indicator" title="Connected Peer" />
                    </div>

                    {/* Convo Info */}
                    <div className="inbox-convo-content">
                      <div className="inbox-convo-top">
                        <span className="inbox-peer-name" title={convo.peer.name}>
                          {convo.peer.name}
                        </span>
                        <span className="inbox-timestamp">
                          {formatTime(convo.last_activity_at || convo.last_message?.sent_at)}
                        </span>
                      </div>

                      {/* Snippet: shows sender or receiver name + last message cleanly */}
                      <div className="inbox-convo-sub">
                        <span
                          className={`inbox-snippet ${convo.unread_count > 0 ? 'unread' : ''}`}
                          title={snippet}
                        >
                          {snippet}
                        </span>
                        {convo.unread_count > 0 && (
                          <span className="inbox-unread-pill">{convo.unread_count}</span>
                        )}
                      </div>

                      {/* Who Messaged First & Message Count Indicators */}
                      <div className="inbox-meta-tags-row">
                        {convo.who_msg_first === 'you' && (
                          <span className="inbox-first-sender-tag you">
                            You initiated
                          </span>
                        )}
                        {convo.who_msg_first === 'peer' && (
                          <span className="inbox-first-sender-tag peer">
                            {convo.peer.name.split(' ')[0]} started
                          </span>
                        )}
                        {convo.who_msg_first === 'none' && (
                          <span className="inbox-first-sender-tag you" style={{ color: '#059669', background: '#ecfdf5' }}>
                            New Connection
                          </span>
                        )}
                        <span className="inbox-msg-count-tag">
                          {convo.total_messages} {convo.total_messages === 1 ? 'msg' : 'msgs'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* =================================================================== */}
        {/* RIGHT COLUMN: ACTIVE CHAT PANE                                      */}
        {/* =================================================================== */}
        <main
          className={`inbox-chat-area ${mobileChatActive ? 'active-mobile' : ''}`}
          aria-label="Active Chat"
        >
          {selectedConvo ? (
            <>
              {/* Chat Header */}
              <div className="inbox-chat-header">
                <div className="inbox-header-left">
                  <button
                    type="button"
                    className="inbox-back-btn"
                    onClick={() => setMobileChatActive(false)}
                    aria-label="Back to messages list"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div
                    className="inbox-avatar-circle"
                    style={{
                      width: 40,
                      height: 40,
                      fontSize: '0.95rem',
                      background: selectedConvo.peer.avatar_color || '#0284c7'
                    }}
                  >
                    {selectedConvo.peer.name.charAt(0)}
                  </div>
                  <div className="inbox-header-info">
                    <h3>{selectedConvo.peer.name}</h3>
                    <div className="inbox-header-sub">
                      <span>{selectedConvo.peer.role_label}</span>
                      {selectedConvo.peer.school && <span>• {selectedConvo.peer.school}</span>}
                      {selectedConvo.total_messages > 0 && (
                        <span>
                          • {selectedConvo.who_msg_first_label} ({selectedConvo.total_messages} msgs)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* E2EE Verification Shield */}
                <div
                  className="inbox-e2ee-badge"
                  title="Messages are protected by AES-256-GCM backend authenticated encryption. Zero plaintext is stored in the database."
                >
                  <Lock size={13} />
                  <span>End-to-End Encrypted</span>
                </div>
              </div>

              {/* Messages History Scroller (Uses container-only scroll to avoid window scroll) */}
              <div className="inbox-messages-scroll" ref={messagesContainerRef}>
                {/* Privacy Banner */}
                <div className="inbox-e2ee-notice">
                  <Shield size={14} style={{ display: 'inline', verticalAlign: 'text-top', marginRight: 4 }} />
                  <strong>Zero-Knowledge Encryption Active.</strong> Messages between you and{' '}
                  <strong>{selectedConvo.peer.name}</strong> are encrypted at rest with AES-256-GCM.
                </div>

                {loadingMessages ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    <RefreshCw
                      size={20}
                      className="inbox-spin"
                      style={{ margin: '0 auto 10px auto', display: 'block', animation: 'spin 1s linear infinite' }}
                    />
                    Loading message history...
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        background: '#e0f2fe',
                        color: '#0284c7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 14px auto'
                      }}
                    >
                      <Sparkles size={26} />
                    </div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: '#0f172a' }}>
                      Say hello to {selectedConvo.peer.name}!
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                      You are securely connected. Type your first encrypted message below.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const messageText = msg.text || msg.ciphertext;
                    const isMine = msg.is_mine;

                    return (
                      <div
                        key={msg.id}
                        className={`inbox-message-row ${isMine ? 'mine' : 'theirs'}`}
                      >
                        <div className={`inbox-msg-bubble ${isMine ? 'mine' : 'theirs'}`}>
                          <div className="inbox-msg-text">{messageText}</div>
                          <div className="inbox-msg-footer">
                            <span>{formatTime(msg.sent_at)}</span>
                            {isMine && (
                              <span title={msg.delivered_at ? 'Delivered' : 'Sent'}>
                                {msg.delivered_at ? (
                                  <CheckCheck size={13} className="inbox-check-delivered" />
                                ) : (
                                  <Check size={13} />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat Input Bar */}
              <form className="inbox-input-bar" onSubmit={handleSendMessage}>
                <textarea
                  className="inbox-input-field"
                  rows={1}
                  placeholder={`Message ${selectedConvo.peer.name.split(' ')[0]}... (Press Enter to send)`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="inbox-send-btn"
                  disabled={!inputText.trim() || sending}
                  title="Send encrypted message"
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          ) : (
            /* Empty State (No chat selected) */
            <div className="inbox-empty-pane">
              <div className="inbox-empty-icon">
                <MessageSquare size={36} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                Your Direct Messages
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#64748b', maxWidth: 360, margin: '0 0 20px 0', lineHeight: 1.5 }}>
                Chat privately with connected classmates, teachers, and principals with hardware-accelerated end-to-end encryption.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="comm-btn-connect"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                  onClick={() => {
                    window.history.pushState(null, '', '/app/community');
                    window.dispatchEvent(new CustomEvent('optimus_navigate', { detail: { page: 'Community' } }));
                  }}
                >
                  <UserPlus size={15} /> Find Friends in Community
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default InboxView;
