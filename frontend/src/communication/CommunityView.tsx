import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, UserCheck, Search, Filter, MessageSquare,
  ShieldCheck, X, ExternalLink, Trophy, Star, Award, Building2,
  Clock, CheckCircle2, UserX, Sparkles, Check
} from 'lucide-react';
import {
  communicationApi,
  CommunityDirectoryItem,
  StudentProfileData
} from './communicationApi';
import './communication.css';

interface CommunityViewProps {
  notify?: (msg: string, type?: string) => void;
}

export default function CommunityView({ notify }: CommunityViewProps) {
  const [activeTab, setActiveTab] = useState<'discover' | 'connections'>('discover');
  const [category, setCategory] = useState<'students' | 'teachers' | 'principals' | 'schools'>('students');
  const [categoryCounts, setCategoryCounts] = useState({
    students: 0,
    teachers: 0,
    principals: 0,
    schools: 0
  });
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CommunityDirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Connections Data
  const [connections, setConnections] = useState<{
    received: any[];
    connected: any[];
    sent: any[];
    received_count: number;
    connected_count: number;
  }>({ received: [], connected: [], sent: [], received_count: 0, connected_count: 0 });

  // Member Profile Modal
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedProfileType, setSelectedProfileType] = useState<'student' | 'teacher' | 'principal'>('student');
  const [profileData, setProfileData] = useState<StudentProfileData | any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [actionPendingKey, setActionPendingKey] = useState<string | null>(null);

  // Fetch Directory Items
  const loadDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await communicationApi.getDirectory(category, search);
      setItems(res.results || []);
      if (res.category_counts) {
        setCategoryCounts(res.category_counts);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  // Fetch Connections
  const loadConnections = useCallback(async () => {
    try {
      const res = await communicationApi.getConnections();
      setConnections(res);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (activeTab === 'discover') {
      loadDirectory();
    } else {
      loadConnections();
    }
  }, [activeTab, loadDirectory, loadConnections]);

  // Open profile modal
  const handleOpenProfile = async (id: number, type: 'student' | 'teacher' | 'principal') => {
    setSelectedProfileId(id);
    setSelectedProfileType(type);
    setProfileData(null);
    setProfileLoading(true);
    try {
      const res = await communicationApi.getMemberProfile(type, id);
      setProfileData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  // Handle connection action
  const handleAction = async (
    action: string,
    targetId: number,
    extra?: { target_user_id?: number | null; target_type?: string; request_id?: number | null }
  ) => {
    const key = `${action}-${targetId}-${extra?.target_user_id || ''}`;
    setActionPendingKey(key);
    try {
      const res = await communicationApi.handleConnectionAction(action, targetId, extra);
      notify?.(res?.detail || `Connection action '${action}' completed.`, 'success');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('optimus:refresh-notifications'));
      }
      await Promise.all([loadDirectory(), loadConnections()]);
    } catch (err: any) {
      console.error(err);
      notify?.(err?.message || 'Could not process connection request.', 'error');
    } finally {
      setActionPendingKey(null);
    }
  };

  return (
    <div className="comm-page-wrapper">
      <div className="comm-suite-container">
        {/* Signature Teal · Emerald · Lime Hero Banner */}
        <div className="comm-hero-banner comm-hero-community">
          <div className="comm-hero-content">
            <h1 className="comm-hero-title">
              <Users size={32} /> Educational Community &amp; Networking
            </h1>
            <p className="comm-hero-desc">
              Connect with verified students, teachers, principals, and member schools across national and international curricula.
            </p>
          </div>
          <div className="comm-hero-actions">
            <button className="comm-hero-btn-glass" onClick={() => setActiveTab('connections')}>
              <UserCheck size={14} /> Active Network ({connections.connected_count || 0})
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="comm-tabs-bar">
          <button
            className={`comm-tab-pill ${activeTab === 'discover' ? 'active-community' : ''}`}
            onClick={() => setActiveTab('discover')}
          >
            <Search size={16} /> Discover &amp; Search Directory
          </button>
          <button
            className={`comm-tab-pill ${activeTab === 'connections' ? 'active-community' : ''}`}
            onClick={() => setActiveTab('connections')}
          >
            <UserCheck size={16} /> Connections &amp; Requests
            {connections.received_count > 0 && (
              <span className="comm-tab-badge">{connections.received_count}</span>
            )}
          </button>
        </div>

        {activeTab === 'discover' ? (
          <>
            {/* Category Selector Pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button
                className={`comm-cat-pill ${category === 'students' ? 'active' : ''}`}
                onClick={() => setCategory('students')}
              >
                Students {categoryCounts.students > 0 ? `(${categoryCounts.students})` : ''}
              </button>
              <button
                className={`comm-cat-pill ${category === 'teachers' ? 'active' : ''}`}
                onClick={() => setCategory('teachers')}
              >
                Teachers {categoryCounts.teachers > 0 ? `(${categoryCounts.teachers})` : ''}
              </button>
              <button
                className={`comm-cat-pill ${category === 'principals' ? 'active' : ''}`}
                onClick={() => setCategory('principals')}
              >
                Principals {categoryCounts.principals > 0 ? `(${categoryCounts.principals})` : ''}
              </button>
              <button
                className={`comm-cat-pill ${category === 'schools' ? 'active' : ''}`}
                onClick={() => setCategory('schools')}
              >
                Schools {categoryCounts.schools > 0 ? `(${categoryCounts.schools})` : ''}
              </button>
            </div>

            {/* Filter Surface */}
            <div className="comm-filter-surface">
              <div className="comm-search-wrap">
                <Search className="comm-search-icon" size={15} />
                <input
                  type="text"
                  className="comm-input"
                  style={{ paddingLeft: 42 }}
                  placeholder={`Search ${category} by name, subject, or campus...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Safeguarding active: Public fields strictly follow GDPR/FERPA guidelines.
              </div>
            </div>

            {/* Cards Grid */}
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 16, border: '1px solid rgba(254, 230, 133, 0.8)' }}>
                Loading community directory from database...
              </div>
            ) : (
              <div className="comm-cards-grid">
                {items.map((it) => (
                  <div key={it.id} className="comm-card">
                    <div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: it.avatar_color || '#0d9488',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                          }}
                        >
                          {it.name.charAt(0)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e1633', margin: '0 0 2px 0' }}>{it.name}</h3>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {it.handle ? `${it.handle} • ` : ''}
                            {it.grade || it.subject || it.curriculum || it.city}
                          </div>
                          {it.school && (
                            <div style={{ fontSize: 12, color: '#1e1633', marginTop: 3, fontWeight: 600 }}>
                              {it.school}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Badges / Metrics */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {it.curriculum && (
                          <span style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                            {it.curriculum}
                          </span>
                        )}
                        {it.badges?.map((b, bi) => (
                          <span key={bi} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                            ★ {b}
                          </span>
                        ))}
                        {it.experience && (
                          <span style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                            {it.experience} Exp
                          </span>
                        )}
                        {Boolean(it.average && it.average > 0) && (
                          <span className="comm-mono" style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, background: '#ecfdf5', color: '#047857', fontWeight: 800 }}>
                            {it.average}% Avg
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid rgba(241, 245, 249, 0.9)', gap: 8, flexWrap: 'wrap' }}>
                      {category !== 'schools' ? (
                        <button
                          className="comm-cat-pill"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => handleOpenProfile(it.id, category === 'teachers' ? 'teacher' : category === 'principals' ? 'principal' : 'student')}
                        >
                          View Profile
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                          {it.students || 0} Enrolled Learners
                        </span>
                      )}

                      {category === 'schools' ? (
                        <span style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 8, background: it.status === 'verified' ? '#ecfdf5' : '#f1f5f9', color: it.status === 'verified' ? '#047857' : '#64748b', fontWeight: 700 }}>
                          {it.status === 'verified' ? 'Verified School' : 'Registered Campus'}
                        </span>
                      ) : it.status === 'no_account' ? (
                        <span
                          title="This student has not activated a portal login account yet."
                          style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 8, background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', fontWeight: 600 }}
                        >
                          No Portal Account
                        </span>
                      ) : it.status === 'connected' ? (
                        <span className="comm-badge-connected">
                          <CheckCircle2 size={13} /> Connected
                        </span>
                      ) : it.status === 'received_request' ? (
                        <button
                          className="comm-btn-connect"
                          disabled={actionPendingKey !== null}
                          onClick={() => handleAction('accept', it.request_id || it.id, {
                            target_user_id: it.user_id,
                            target_type: it.target_type,
                            request_id: it.request_id
                          })}
                        >
                          Accept Request
                        </button>
                      ) : it.status === 'sent_request' ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: '#0d9488', fontWeight: 700 }}>Request Sent</span>
                          <button
                            className="comm-cat-pill"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                            disabled={actionPendingKey !== null}
                            onClick={() => handleAction('withdraw', it.request_id || it.id, {
                              target_user_id: it.user_id,
                              target_type: it.target_type,
                              request_id: it.request_id
                            })}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : it.status === 'active_user' ? (
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: '#ede9fe', color: '#7c3aed', fontWeight: 700 }}>You</span>
                      ) : (
                        <button
                          className="comm-btn-connect"
                          disabled={actionPendingKey !== null}
                          onClick={() => handleAction('connect', it.id, {
                            target_user_id: it.user_id,
                            target_type: it.target_type || (category === 'teachers' ? 'teacher' : category === 'principals' ? 'principal' : 'student')
                          })}
                        >
                          <UserPlus size={13} /> Connect
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Connections & Requests View */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {/* Received Requests */}
            <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, color: '#1e1633' }}>
                Received Invitations ({connections.received?.length || 0})
              </h3>
              {connections.received?.length === 0 ? (
                <div style={{ padding: 24, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 14, color: '#64748b', fontSize: 13 }}>
                  No pending connection requests.
                </div>
              ) : (
                <div className="comm-invitations-grid">
                  {connections.received?.map((req) => (
                    <div key={req.request_id} className="comm-card comm-invitation-card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: req.avatar_color || '#10b981', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {req.name.charAt(0)}
                        </div>
                        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1e1633', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.school} • {req.grade}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
                        <button
                          className="comm-cat-pill"
                          style={{ padding: '6px 14px', fontSize: 12 }}
                          disabled={actionPendingKey !== null}
                          onClick={() => handleAction('decline', req.request_id, { target_user_id: req.user_id, request_id: req.request_id })}
                        >
                          Ignore
                        </button>
                        <button
                          className="comm-btn-connect"
                          style={{ padding: '6px 16px', fontSize: 12 }}
                          disabled={actionPendingKey !== null}
                          onClick={() => handleAction('accept', req.request_id, { target_user_id: req.user_id, request_id: req.request_id })}
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sent Invitations */}
            <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, color: '#1e1633' }}>
                Sent Requests ({connections.sent?.length || 0})
              </h3>
              {!connections.sent || connections.sent.length === 0 ? (
                <div style={{ padding: 20, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 14, color: '#64748b', fontSize: 13 }}>
                  No pending outgoing requests.
                </div>
              ) : (
                <div className="comm-invitations-grid">
                  {connections.sent.map((req) => (
                    <div key={req.request_id} className="comm-card comm-invitation-card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {req.name.charAt(0)}
                        </div>
                        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1e1633', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.school} {req.grade ? `• ${req.grade}` : ''} • Sent {req.sent_at}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <button
                          className="comm-cat-pill"
                          style={{ padding: '5px 12px', fontSize: 11.5 }}
                          disabled={actionPendingKey !== null}
                          onClick={() => handleAction('withdraw', req.request_id, { target_user_id: req.user_id, request_id: req.request_id })}
                        >
                          Withdraw Request
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Connected Network */}
            <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, color: '#1e1633' }}>
                Active Network ({connections.connected?.length || 0})
              </h3>
              {!connections.connected || connections.connected.length === 0 ? (
                <div style={{ padding: 20, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 14, color: '#64748b', fontSize: 13 }}>
                  You have no active connections yet. Discover students, educators, and schools to connect!
                </div>
              ) : (
                <div className="comm-invitations-grid">
                  {connections.connected.map((peer) => (
                    <div key={peer.peer_id} className="comm-card comm-invitation-card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: peer.avatar_color || '#0ea5e9', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {peer.name.charAt(0)}
                        </div>
                        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1e1633', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{peer.school} • {peer.grade}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                        <button
                          className="comm-cat-pill"
                          style={{ padding: '5px 12px', fontSize: 11.5 }}
                          disabled={actionPendingKey !== null}
                          onClick={() => handleAction('remove', peer.peer_id, { target_user_id: peer.peer_id })}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Member Profile Modal */}
        {selectedProfileId && (
          <div className="comm-modal-backdrop" onClick={() => setSelectedProfileId(null)}>
            <div className="comm-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #0d9488, #10b981)', color: '#fff', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {profileData?.name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {profileData?.name}
                      <ShieldCheck size={18} color="#0d9488" />
                    </h2>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {profileData?.school} • {profileData?.grade || profileData?.curriculum}
                    </div>
                  </div>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setSelectedProfileId(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="comm-modal-body">
                {profileLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading member profile...</div>
                ) : profileData ? (
                  <div>
                    {/* Bio Profile Hero Banner */}
                    <div className="comm-profile-hero">
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {selectedProfileType === 'student' ? 'Verified Institutional Learner' : selectedProfileType === 'teacher' ? 'Verified Faculty Educator' : 'Verified Institutional Leader'}
                        </span>
                        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e1633', margin: '4px 0 6px 0' }}>{profileData.name}</h3>
                        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.55, margin: 0 }}>
                          {profileData.bio}
                        </p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: '#fff', border: '1px solid #fdba74', color: '#c2410c', fontWeight: 700 }}>
                          FERPA/GDPR Verified
                        </span>
                      </div>
                    </div>

                    {/* KPIs */}
                    {profileData.kpis && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 24 }}>
                        <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Academic Avg</div>
                          <div className="comm-mono" style={{ fontSize: 17, fontWeight: 800, color: '#0d9488' }}>
                            {profileData.kpis.academic_average > 0 ? `${profileData.kpis.academic_average}%` : '—'}
                          </div>
                        </div>
                        <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Global Rank</div>
                          <div className="comm-mono" style={{ fontSize: 17, fontWeight: 800, color: '#1e1633' }}>
                            {profileData.kpis.global_rank > 0 ? `#${profileData.kpis.global_rank}` : '—'}
                          </div>
                        </div>
                        <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Assessments</div>
                          <div className="comm-tabular" style={{ fontSize: 17, fontWeight: 800, color: '#1e1633' }}>{profileData.kpis.assessments_taken}</div>
                        </div>
                        <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Competitions</div>
                          <div className="comm-tabular" style={{ fontSize: 17, fontWeight: 800, color: '#1e1633' }}>{profileData.kpis.competitions_entered}</div>
                        </div>
                        <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>Badges</div>
                          <div className="comm-tabular" style={{ fontSize: 17, fontWeight: 800, color: '#d97706' }}>{profileData.kpis.badges_earned}</div>
                        </div>
                      </div>
                    )}

                    {/* Badges Shelf */}
                    {profileData.badges && (
                      <div style={{ marginBottom: 24 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#1e1633' }}>Badges &amp; Distinctions</h3>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {profileData.badges.map((b: any, bi: number) => (
                            <div key={bi} style={{ padding: '8px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#92400e' }}>
                              <Trophy size={14} />
                              <span>{b.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Verified Competition Records */}
                    {profileData.verified_records && (
                      <div style={{ marginBottom: 16 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#1e1633' }}>Verified Official Competition Records</h3>
                        {profileData.verified_records.length > 0 ? (
                          <div className="comm-table-card">
                            <div className="comm-table-wrap">
                              <table className="comm-table">
                                <thead>
                                  <tr>
                                    <th>Competition Name</th>
                                    <th>Score Achieved</th>
                                    <th>Completion Time</th>
                                    <th>Verification</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {profileData.verified_records.map((r: any, ri: number) => (
                                    <tr key={ri}>
                                      <td style={{ fontWeight: 700, color: '#1e1633' }}>
                                        {r.competition}
                                        {r.subject && <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{r.subject}{r.difficulty ? ` • ${r.difficulty}` : ''}</div>}
                                      </td>
                                      <td><strong className="comm-mono" style={{ color: '#0d9488' }}>{r.score}%</strong></td>
                                      <td className="comm-tabular" style={{ color: '#475569' }}>{r.time}</td>
                                      <td>
                                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#ecfdf5', color: '#047857', fontWeight: 700 }}>
                                          ✓ {r.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '16px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 12.5, textAlign: 'center' }}>
                            No official competition or diagnostic assessment records recorded yet.
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 24, textAlign: 'right' }}>
                      <button
                        className="comm-btn-connect"
                        style={{ padding: '9px 20px', borderRadius: 10, fontWeight: 700 }}
                        onClick={() => setSelectedProfileId(null)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
