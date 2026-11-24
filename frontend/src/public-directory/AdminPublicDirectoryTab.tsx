import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, 
  RefreshCw, Search, Eye, Filter, Check, X, Sliders, Trash2, 
  ExternalLink, Calendar, Users, Award 
} from 'lucide-react';
import { csrfFetch } from '../api';
import './publicDirectory.css';

interface AdminPublicDirectoryTabProps {
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const AdminPublicDirectoryTab: React.FC<AdminPublicDirectoryTabProps> = ({ notify }) => {
  const [activeQueueTab, setActiveQueueTab] = useState<'pending' | 'live' | 'rejected' | 'unpublished' | 'all'>('pending');
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Modals
  const [inspectListing, setInspectListing] = useState<any | null>(null);
  const [rejectModal, setRejectModal] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [unpublishModal, setUnpublishModal] = useState<any | null>(null);
  const [unpublishReason, setUnpublishReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Platform Config State
  const [config, setConfig] = useState({
    min_active_students: 15,
    min_published_assessments: 2,
    min_subjects_covered: 3,
    data_freshness_months: 12,
    enquiry_retention_days: 90
  });
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // Snapshot Trigger State
  const [snapshotYear, setSnapshotYear] = useState<string>('2025-2026');
  const [snapshotPeriod, setSnapshotPeriod] = useState<string>('Annual Final');
  const [triggeringSnapshot, setTriggeringSnapshot] = useState<boolean>(false);

  // Load Listings
  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (activeQueueTab !== 'all') {
        const statusMap: Record<string, string> = {
          pending: 'pending_approval',
          live: 'live',
          rejected: 'rejected',
          unpublished: 'unpublished'
        };
        qParams.set('status', statusMap[activeQueueTab]);
      }
      if (searchFilter) qParams.set('search', searchFilter);

      const res = await fetch(`/api/v1/admin/public-directory/listings/?${qParams.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setListings(json.results || []);
      }
    } catch (err) {
      console.error(err);
      notify('Failed to load listings moderation queue.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeQueueTab, searchFilter, notify]);

  // Load Config
  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/public-directory/config/', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setConfig(json);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadListings();
    loadConfig();
  }, [loadListings, loadConfig]);

  // Approve Listing
  const handleApprove = async (slug: string) => {
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/v1/admin/public-directory/listings/${slug}/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Approval failed.');
      }
      notify(`Campus listing ${slug} approved and published live!`, 'success');
      setInspectListing(null);
      loadListings();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Listing
  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) {
      notify('Please provide a constructive rejection reason.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/v1/admin/public-directory/listings/${rejectModal.slug}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: rejectReason.trim() })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Rejection failed.');
      }
      notify(`Campus listing ${rejectModal.slug} rejected. Reason logged for school admin.`, 'info');
      setRejectModal(null);
      setRejectReason('');
      setInspectListing(null);
      loadListings();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Unpublish Listing
  const handleUnpublish = async () => {
    if (!unpublishModal || !unpublishReason.trim()) {
      notify('Please provide a reason for unpublishing this campus.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const res = await csrfFetch(`/api/v1/admin/public-directory/listings/${unpublishModal.slug}/unpublish/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: unpublishReason.trim() })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Unpublish failed.');
      }
      notify(`Campus listing ${unpublishModal.slug} unpublished. Public cache cleared.`, 'info');
      setUnpublishModal(null);
      setUnpublishReason('');
      setInspectListing(null);
      loadListings();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Save Platform Config
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await csrfFetch('/api/v1/admin/public-directory/config/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to update configuration.');
      }
      notify('Public directory eligibility configuration updated.', 'success');
      loadConfig();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Trigger Snapshot Recalculation
  const handleTriggerSnapshot = async () => {
    setTriggeringSnapshot(true);
    try {
      const res = await csrfFetch('/api/v1/admin/public-directory/trigger-snapshot/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          academic_year: snapshotYear,
          period_name: snapshotPeriod
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Snapshot generation failed.');
      }
      const data = await res.json();
      notify(`Snapshot generated: ${data.snapshots_created || 0} listings updated with new AQI ranks.`, 'success');
      loadListings();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setTriggeringSnapshot(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Platform Governance Header Banner */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#4338ca', padding: '4px 10px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '8px' }}>
            <ShieldCheck size={14} />
            <span>Platform Governance & Trust</span>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
            Public Directory & Leaderboard Management
          </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Review school submissions, manage live directory status, configure ranking eligibility thresholds, and refresh immutable AQI snapshots.
          </p>
        </div>

        <button
          onClick={loadListings}
          className="pdir-btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={15} className={loading ? 'spin-anim' : ''} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Grid: Left Main Queue (2.2fr) vs Right Config / Operations (1fr) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)', gap: '24px', alignItems: 'start' }}>
        {/* LEFT COLUMN: MODERATION QUEUE */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
          {/* Queue Tab Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
              {[
                { id: 'pending', label: 'Pending Approval' },
                { id: 'live', label: 'Live' },
                { id: 'rejected', label: 'Rejected' },
                { id: 'unpublished', label: 'Unpublished' },
                { id: 'all', label: 'All' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveQueueTab(t.id as any)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeQueueTab === t.id ? '#ffffff' : 'transparent',
                    color: activeQueueTab === t.id ? '#4f46e5' : '#64748b',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    boxShadow: activeQueueTab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '220px' }}>
              <input
                type="text"
                placeholder="Search campus or city..."
                className="pdir-input"
                style={{ paddingLeft: '32px', fontSize: '0.82rem' }}
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
            </div>
          </div>

          {/* Listings Table */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <RefreshCw size={28} className="spin-anim" color="#4f46e5" />
            </div>
          ) : listings.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              <Building2 size={40} style={{ opacity: 0.5, marginBottom: '10px' }} />
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#475569' }}>No Listings Found in this Queue</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>When schools submit their profiles, they appear here for verification.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 14px', color: '#64748b' }}>Campus Name</th>
                    <th style={{ padding: '10px 14px', color: '#64748b' }}>Location</th>
                    <th style={{ padding: '10px 14px', color: '#64748b' }}>Status</th>
                    <th style={{ padding: '10px 14px', color: '#64748b' }}>Contact Mode</th>
                    <th style={{ padding: '10px 14px', color: '#64748b' }}>Submitted</th>
                    <th style={{ padding: '10px 14px', color: '#64748b' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map(item => (
                    <tr key={item.slug} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <strong style={{ color: '#0f172a', display: 'block' }}>{item.display_name}</strong>
                        <span style={{ fontSize: '0.74rem', color: '#64748b' }}>Org: {item.school_name || item.slug}</span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        {item.city}, {item.province}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '100px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: item.status === 'live' ? '#dcfce7' : item.status === 'pending_approval' ? '#fef3c7' : item.status === 'rejected' ? '#fee2e2' : '#f1f5f9',
                          color: item.status === 'live' ? '#15803d' : item.status === 'pending_approval' ? '#b45309' : item.status === 'rejected' ? '#b91c1c' : '#64748b'
                        }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569', fontSize: '0.8rem' }}>
                        {item.contact_mode === 'enquiry_only' ? 'Enquiry Form' : item.contact_mode === 'official_contact' ? 'Official Phone/Email' : 'Principal Direct'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '0.8rem' }}>
                        {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            onClick={() => setInspectListing(item)}
                            title="Inspect Details"
                            style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#475569' }}
                          >
                            <Eye size={14} />
                          </button>

                          {item.status === 'pending_approval' && (
                            <>
                              <button
                                onClick={() => handleApprove(item.slug)}
                                disabled={actionLoading}
                                title="Approve & Publish"
                                style={{ background: '#dcfce7', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#15803d' }}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setRejectModal(item)}
                                disabled={actionLoading}
                                title="Reject"
                                style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#b91c1c' }}
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}

                          {item.status === 'live' && (
                            <button
                              onClick={() => setUnpublishModal(item)}
                              disabled={actionLoading}
                              title="Unpublish"
                              style={{ background: '#fee2e2', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#b91c1c' }}
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CONFIGURATION & SNAPSHOT RECALCULATION */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Eligibility Rules Panel */}
          <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Sliders size={18} color="#4f46e5" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Platform Eligibility Rules
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Min Active Students (Cohort Size)
                </label>
                <input
                  type="number"
                  className="pdir-input"
                  value={config.min_active_students}
                  onChange={e => setConfig({ ...config, min_active_students: Number(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Min Published Assessments
                </label>
                <input
                  type="number"
                  className="pdir-input"
                  value={config.min_published_assessments}
                  onChange={e => setConfig({ ...config, min_published_assessments: Number(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Min Subjects Covered
                </label>
                <input
                  type="number"
                  className="pdir-input"
                  value={config.min_subjects_covered}
                  onChange={e => setConfig({ ...config, min_subjects_covered: Number(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Data Freshness (Max Months)
                </label>
                <input
                  type="number"
                  className="pdir-input"
                  value={config.data_freshness_months}
                  onChange={e => setConfig({ ...config, data_freshness_months: Number(e.target.value) })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Parent Enquiry Retention (Days)
                </label>
                <input
                  type="number"
                  className="pdir-input"
                  value={config.enquiry_retention_days}
                  onChange={e => setConfig({ ...config, enquiry_retention_days: Number(e.target.value) })}
                />
              </div>

              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="pdir-btn-primary"
                style={{ width: '100%', marginTop: '8px', fontSize: '0.84rem' }}
              >
                {savingConfig ? 'Saving...' : 'Update Eligibility Rules'}
              </button>
            </div>
          </div>

          {/* Snapshot Trigger Operations */}
          <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Award size={18} color="#f59e0b" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Immutable Snapshot Refresh
              </h3>
            </div>

            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
              Generates reproducible platform snapshots and updates ranks (with ties sharing rank 1, 2, 2, 4) from published assessment data.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Academic Year
                </label>
                <input
                  type="text"
                  className="pdir-input"
                  value={snapshotYear}
                  onChange={e => setSnapshotYear(e.target.value)}
                  placeholder="2025-2026"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Period / Term Name
                </label>
                <input
                  type="text"
                  className="pdir-input"
                  value={snapshotPeriod}
                  onChange={e => setSnapshotPeriod(e.target.value)}
                  placeholder="Annual Final"
                />
              </div>

              <button
                onClick={handleTriggerSnapshot}
                disabled={triggeringSnapshot}
                className="pdir-btn-secondary"
                style={{ width: '100%', marginTop: '6px', fontSize: '0.84rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} className={triggeringSnapshot ? 'spin-anim' : ''} />
                <span>{triggeringSnapshot ? 'Generating...' : 'Trigger Snapshot Refresh'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* INSPECT MODAL */}
      {inspectListing && (
        <div className="pdir-modal-backdrop" onClick={() => setInspectListing(null)}>
          <div className="pdir-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Campus Submission Review</h3>
              <button onClick={() => setInspectListing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.88rem' }}>
              <div><strong>Display Name:</strong> {inspectListing.display_name}</div>
              <div><strong>Tagline:</strong> {inspectListing.tagline || '—'}</div>
              <div><strong>About:</strong> {inspectListing.about || '—'}</div>
              <div><strong>Address:</strong> {inspectListing.address}, {inspectListing.city}, {inspectListing.province}, {inspectListing.country}</div>
              <div><strong>Coordinates:</strong> Lat: {inspectListing.latitude}, Lon: {inspectListing.longitude}</div>
              <div><strong>Curriculum Boards:</strong> {(inspectListing.boards || []).join(', ') || '—'}</div>
              <div><strong>Levels:</strong> {(inspectListing.levels || []).join(', ') || '—'}</div>
              <div><strong>Facilities:</strong> {(inspectListing.facilities || []).join(', ') || '—'}</div>
              <div><strong>Gender & Medium:</strong> {inspectListing.gender_type} • {inspectListing.medium}</div>
              <div><strong>Contact Preference:</strong> {inspectListing.contact_mode}</div>
              {inspectListing.official_phone && <div><strong>Official Phone:</strong> {inspectListing.official_phone}</div>}
              {inspectListing.official_email && <div><strong>Official Email:</strong> {inspectListing.official_email}</div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              {inspectListing.status === 'pending_approval' && (
                <>
                  <button
                    onClick={() => { setRejectModal(inspectListing); setInspectListing(null); }}
                    className="pdir-btn-secondary"
                    style={{ color: '#b91c1c' }}
                  >
                    Reject Submission
                  </button>
                  <button
                    onClick={() => handleApprove(inspectListing.slug)}
                    disabled={actionLoading}
                    className="pdir-btn-primary"
                  >
                    Approve & Make Live
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModal && (
        <div className="pdir-modal-backdrop" onClick={() => setRejectModal(null)}>
          <div className="pdir-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800 }}>Reject Campus Listing</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: '#64748b' }}>
              Please provide a constructive explanation so the school administrator can adjust their profile and re-submit.
            </p>
            <textarea
              className="pdir-textarea"
              rows={4}
              placeholder="e.g. Please verify your address and specify at least one curriculum board..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => setRejectModal(null)} className="pdir-btn-secondary">Cancel</button>
              <button onClick={handleReject} disabled={actionLoading || !rejectReason.trim()} className="pdir-btn-primary" style={{ background: '#b91c1c' }}>
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNPUBLISH MODAL */}
      {unpublishModal && (
        <div className="pdir-modal-backdrop" onClick={() => setUnpublishModal(null)}>
          <div className="pdir-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800 }}>Unpublish Campus Listing</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: '#64748b' }}>
              The campus will be removed immediately from public listings and sitemaps.
            </p>
            <textarea
              className="pdir-textarea"
              rows={3}
              placeholder="Reason for administrative unpublish..."
              value={unpublishReason}
              onChange={e => setUnpublishReason(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button onClick={() => setUnpublishModal(null)} className="pdir-btn-secondary">Cancel</button>
              <button onClick={handleUnpublish} disabled={actionLoading || !unpublishReason.trim()} className="pdir-btn-primary" style={{ background: '#b91c1c' }}>
                Unpublish Immediately
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
