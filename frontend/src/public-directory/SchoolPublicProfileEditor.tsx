import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, Save, Send, CheckCircle2, 
  MapPin, Globe, Mail, Phone, Eye, Shield, Inbox, 
  Clock, XCircle, RefreshCw, Check, Sparkles, ExternalLink,
  Trophy, Star, Award
} from 'lucide-react';
import './publicDirectory.css';

interface SchoolPublicProfileEditorProps {
  user: any;
  activeCampuses?: Array<{ id: number; name: string; code?: string; city?: string }>;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onNavigate?: (path: string) => void;
}

const COMMON_BOARDS = [
  'Federal Board (FBISE)', 'Punjab Board (BISE)', 'Sindh Board (BIEK)', 
  'Khyber Pakhtunkhwa Board', 'Balochistan Board', 'Cambridge (CAIE)', 
  'International Baccalaureate (IB)', 'Edexcel'
];

const COMMON_LEVELS = [
  'Playgroup / Nursery', 'Kindergarten', 'Primary (Grade 1-5)', 
  'Middle (Grade 6-8)', 'Secondary / Matric (9-10)', 'Higher Secondary / FSc (11-12)', 
  'O-Levels', 'A-Levels'
];

const COMMON_FACILITIES = [
  'Science Laboratories', 'Computer & AI Lab', 'Central Library', 
  'Sports Grounds & Track', 'Swimming Pool', 'Robotics & STEM Studio', 
  'Auditorium', 'Cafeteria & Dining', 'School Transport Fleet', 
  'Medical & First Aid Infirmary', 'Arts & Music Studio', 'Smart Classrooms'
];

export const SchoolPublicProfileEditor: React.FC<SchoolPublicProfileEditorProps> = ({
  user,
  activeCampuses = [],
  notify,
  onNavigate
}) => {
  const [selectedSchoolId, setSelectedSchoolId] = useState<number>(() => {
    return activeCampuses.length > 0 ? activeCampuses[0].id : (user.school_id || 1);
  });

  const [activeTab, setActiveTab] = useState<'editor' | 'enquiries'>('editor');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [unpublishing, setUnpublishing] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');

  // Profile Form State
  const [formData, setFormData] = useState({
    display_name: '',
    tagline: '',
    about: '',
    country: '',
    province: '',
    city: '',
    address: '',
    latitude: 31.5204 as number | null,
    longitude: 74.3587 as number | null,
    boards: [] as string[],
    levels: [] as string[],
    gender_type: 'co-ed' as 'co-ed' | 'boys' | 'girls',
    medium: 'english' as 'english' | 'urdu' | 'bilingual',
    established_year: 2010 as number | null,
    facilities: [] as string[],
    website: '',
    social_links: { facebook: '', instagram: '', linkedin: '', youtube: '' },
    admission_status: 'open' as 'open' | 'closed',
    contact_mode: 'enquiry_only' as 'enquiry_only' | 'official_contact' | 'principal_direct',
    official_phone: '',
    official_email: '',
    rank_display_mode: 'exact_rank' as 'exact_rank' | 'tier_only' | 'unranked_listing',
    consent_agreed: false
  });

  const [listingMeta, setListingMeta] = useState<{
    slug?: string;
    status?: string;
    rejection_reason?: string;
    approved_at?: string;
    principal_name?: string | null;
    has_principal_consent?: boolean;
    score?: number | null;
    band?: string;
    rank_overall?: number | null;
  }>({});

  // Enquiries State
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [loadingEnquiries, setLoadingEnquiries] = useState<boolean>(false);

  // Load Profile Draft
  const loadProfile = useCallback(async () => {
    if (!selectedSchoolId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/schools/${selectedSchoolId}/public-profile/`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        const data = json.draft || {};
        setFormData({
          display_name: data.display_name || '',
          tagline: data.tagline || '',
          about: data.about || '',
          country: data.country || '',
          province: data.province || '',
          city: data.city || '',
          address: data.address || '',
          latitude: data.latitude !== null && data.latitude !== undefined ? Number(data.latitude) : 31.5204,
          longitude: data.longitude !== null && data.longitude !== undefined ? Number(data.longitude) : 74.3587,
          boards: data.boards || [],
          levels: data.levels || [],
          gender_type: data.gender_type || 'co-ed',
          medium: data.medium || 'english',
          established_year: data.established_year || null,
          facilities: data.facilities || [],
          website: data.website || '',
          social_links: data.social_links || { facebook: '', instagram: '', linkedin: '', youtube: '' },
          admission_status: data.admission_status || 'open',
          contact_mode: data.contact_mode || 'enquiry_only',
          official_phone: data.official_phone || '',
          official_email: data.official_email || '',
          rank_display_mode: data.rank_display_mode || 'exact_rank',
          consent_agreed: false
        });

        setListingMeta({
          slug: json.slug,
          status: json.status,
          rejection_reason: json.rejection_reason,
          approved_at: json.approved_at,
          principal_name: json.principal_name,
          has_principal_consent: json.has_principal_consent,
          score: json.score,
          band: json.band,
          rank_overall: json.rank_overall
        });
      }
    } catch (err) {
      console.error(err);
      notify('Failed to load campus public profile.', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedSchoolId, notify]);

  // Load Enquiries
  const loadEnquiries = useCallback(async () => {
    if (!selectedSchoolId) return;
    setLoadingEnquiries(true);
    try {
      const res = await fetch(`/api/v1/schools/${selectedSchoolId}/public-enquiries/`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setEnquiries(json.results || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEnquiries(false);
    }
  }, [selectedSchoolId]);

  useEffect(() => {
    if (activeTab === 'editor') {
      loadProfile();
    } else {
      loadEnquiries();
    }
  }, [activeTab, loadProfile, loadEnquiries]);

  // Save Draft
  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/schools/${selectedSchoolId}/public-profile/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to save changes.');
      }
      notify('Public profile draft saved successfully.', 'success');
      loadProfile();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Submit for Approval
  const handleSubmitApproval = async () => {
    if (!formData.consent_agreed) {
      notify('Please tick the consent agreement before submitting for approval.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/schools/${selectedSchoolId}/public-profile/submit/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          consent_agreed: true,
          consent_text_version: 'v1.0'
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to submit profile.');
      }
      notify('Campus profile submitted to platform admin for review!', 'success');
      loadProfile();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Instant Unpublish
  const handleUnpublish = async () => {
    if (!window.confirm('Are you sure you want to unpublish your campus from the public directory? It will immediately disappear from the public leaderboard.')) {
      return;
    }
    setUnpublishing(true);
    try {
      const res = await fetch(`/api/v1/schools/${selectedSchoolId}/public-profile/unpublish/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: 'School administrator requested immediate unpublish.' })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || 'Failed to unpublish campus.');
      }
      notify('Campus listing unpublished immediately.', 'info');
      loadProfile();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setUnpublishing(false);
    }
  };

  // Handle Enquiry Status
  const handleMarkEnquiryHandled = async (enquiryId: number) => {
    try {
      const res = await fetch(`/api/v1/schools/${selectedSchoolId}/public-enquiries/${enquiryId}/handle/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_handled: true })
      });
      if (res.ok) {
        notify('Enquiry marked as handled.', 'success');
        loadEnquiries();
      }
    } catch (err) {
      notify('Failed to update enquiry status.', 'error');
    }
  };

  // Toggle helper for arrays
  const toggleArrayItem = (key: 'boards' | 'levels' | 'facilities', item: string) => {
    setFormData(prev => {
      const exists = prev[key].includes(item);
      const updated = exists ? prev[key].filter(x => x !== item) : [...prev[key], item];
      return { ...prev, [key]: updated };
    });
  };

  // Coordinate click simulation on interactive map picker
  const handleMapPickerClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Map bounding box: lat 24 to 37, lon 61 to 78 (Pakistan approximate)
    const lat = Number((37.0 - (y / rect.height) * (37.0 - 24.0)).toFixed(4));
    const lon = Number((61.0 + (x / rect.width) * (78.0 - 61.0)).toFixed(4));
    setFormData(prev => ({ ...prev, latitude: lat, longitude: lon }));
  };

  return (
    <div className="pdir-editor-page-container">
      {/* Header Row */}
      <div className="pdir-editor-header">
        <div>
          <h1 className="pdir-editor-header-title">
            Public Profile & Campus Directory
          </h1>
          <p className="pdir-editor-header-desc">
            Manage your school’s appearance on the public "Find a School" leaderboard, coordinate map, and parent enquiry portal.
          </p>
        </div>

        <div className="pdir-editor-header-controls">
          {activeCampuses.length > 1 && (
            <select
              value={selectedSchoolId}
              onChange={e => setSelectedSchoolId(Number(e.target.value))}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontWeight: 600,
                color: '#1e293b'
              }}
            >
              {activeCampuses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
          )}

          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
            <button
              onClick={() => setActiveTab('editor')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'editor' ? '#ffffff' : 'transparent',
                color: activeTab === 'editor' ? '#4f46e5' : '#64748b',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: activeTab === 'editor' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              Profile Editor
            </button>
            <button
              onClick={() => setActiveTab('enquiries')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === 'enquiries' ? '#ffffff' : 'transparent',
                color: activeTab === 'enquiries' ? '#4f46e5' : '#64748b',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeTab === 'enquiries' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <Inbox size={14} />
              <span>Parent Enquiries</span>
              {enquiries.filter(e => !e.is_handled).length > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.72rem', borderRadius: '100px', padding: '1px 6px' }}>
                  {enquiries.filter(e => !e.is_handled).length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <RefreshCw size={36} className="spin-anim" color="#4f46e5" />
          <p style={{ marginTop: '14px', color: '#64748b' }}>Loading campus public profile...</p>
        </div>
      ) : activeTab === 'enquiries' ? (
        /* ======================================================== */
        /* TAB 2: PARENT ENQUIRIES INBOX                            */
        /* ======================================================== */
        <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                Parent Direct Enquiries
              </h2>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.86rem' }}>
                Prospective parent admission leads received via your campus profile contact form.
              </p>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#6366f1', background: '#eef2ff', padding: '4px 10px', borderRadius: '8px', fontWeight: 600 }}>
              Auto-purged after 90 days for privacy compliance
            </span>
          </div>

          {loadingEnquiries ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <RefreshCw size={24} className="spin-anim" color="#4f46e5" />
            </div>
          ) : enquiries.length === 0 ? (
            <div style={{ padding: '50px', textAlign: 'center', color: '#94a3b8' }}>
              <Inbox size={48} style={{ opacity: 0.5, marginBottom: '12px' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#475569' }}>No Enquiries Received Yet</h3>
              <p style={{ fontSize: '0.88rem', margin: '6px 0 0' }}>When parents fill out the contact form on your public page, their requests will appear here.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px', color: '#64748b' }}>Date</th>
                    <th style={{ padding: '12px 16px', color: '#64748b' }}>Parent Name</th>
                    <th style={{ padding: '12px 16px', color: '#64748b' }}>Phone / Email</th>
                    <th style={{ padding: '12px 16px', color: '#64748b' }}>Child Grade</th>
                    <th style={{ padding: '12px 16px', color: '#64748b' }}>Message</th>
                    <th style={{ padding: '12px 16px', color: '#64748b' }}>Status</th>
                    <th style={{ padding: '12px 16px', color: '#64748b' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {enquiries.map((enq) => (
                    <tr key={enq.id} style={{ borderBottom: '1px solid #f1f5f9', background: enq.is_handled ? 'transparent' : '#f0fdf4' }}>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>
                        {new Date(enq.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0f172a' }}>
                        {enq.parent_name}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div><strong>{enq.phone}</strong></div>
                        {enq.email && <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{enq.email}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#334155' }}>
                        {enq.child_grade || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#475569', maxWidth: '300px' }}>
                        {enq.message}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: enq.is_handled ? '#e2e8f0' : '#dcfce7',
                          color: enq.is_handled ? '#64748b' : '#15803d'
                        }}>
                          {enq.is_handled ? 'Handled' : 'New'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {!enq.is_handled && (
                          <button
                            onClick={() => handleMarkEnquiryHandled(enq.id)}
                            style={{
                              background: '#16a34a',
                              color: '#fff',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Check size={12} />
                            <span>Mark Handled</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ======================================================== */
        /* TAB 1: PROFILE EDITOR & PREVIEW                          */
        /* ======================================================== */
        <>
          {/* Mobile View Toggle Bar (visible <= 960px) */}
          <div className="pdir-mobile-view-toggle">
            <button
              type="button"
              className={`pdir-mobile-view-btn ${mobileTab === 'form' ? 'active' : ''}`}
              onClick={() => setMobileTab('form')}
            >
              <Building2 size={15} />
              <span>Edit Campus Details</span>
            </button>
            <button
              type="button"
              className={`pdir-mobile-view-btn ${mobileTab === 'preview' ? 'active' : ''}`}
              onClick={() => setMobileTab('preview')}
            >
              <Eye size={15} />
              <span>Live Public Preview</span>
            </button>
          </div>

          <div className={`pdir-editor-layout mobile-mode-${mobileTab}`}>
            {/* LEFT COLUMN: FORM CONTROLS */}
            <div className="pdir-editor-form-col">
              {/* Status Banner */}
              <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '100px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: listingMeta.status === 'live' ? '#dcfce7' : listingMeta.status === 'pending_approval' ? '#fef3c7' : '#f1f5f9',
                      color: listingMeta.status === 'live' ? '#15803d' : listingMeta.status === 'pending_approval' ? '#b45309' : '#64748b'
                    }}>
                      {listingMeta.status || 'Draft'}
                    </span>
                    <strong style={{ fontSize: '1rem', color: '#0f172a' }}>
                      {listingMeta.status === 'live' ? 'Published & Live' : listingMeta.status === 'pending_approval' ? 'Awaiting Admin Approval' : 'Unpublished Draft'}
                    </strong>
                  </div>

                  {listingMeta.status === 'live' && listingMeta.slug && (
                    <div style={{ marginTop: '6px', fontSize: '0.82rem', color: '#4f46e5' }}>
                      <a href={`/schools/${listingMeta.slug}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'underline' }}>
                        <span>View Live Public Page</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}

                  {listingMeta.status === 'rejected' && listingMeta.rejection_reason && (
                    <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '0.84rem' }}>
                      <strong>Rejection reason:</strong> {listingMeta.rejection_reason}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {listingMeta.status === 'live' && (
                    <button
                      onClick={handleUnpublish}
                      disabled={unpublishing}
                      style={{
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        cursor: 'pointer'
                      }}
                    >
                      {unpublishing ? 'Unpublishing...' : 'Unpublish Instantly'}
                    </button>
                  )}
                </div>
              </div>

              {/* Section 1: Basic Information */}
              <div className="pdir-editor-card">
                <h3 className="pdir-editor-section-title">
                  1. Basic Campus Identity
                </h3>

                <div className="pdir-grid-2">
                  <div>
                    <label className="pdir-field-label">
                      Public Display Name *
                    </label>
                    <input
                      type="text"
                      className="pdir-input"
                      value={formData.display_name}
                      onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                      placeholder="e.g. Al-Razi Cambridge International Campus"
                    />
                  </div>

                  <div>
                    <label className="pdir-field-label">
                      Established Year
                    </label>
                    <input
                      type="number"
                      className="pdir-input"
                      value={formData.established_year || ''}
                      onChange={e => setFormData({ ...formData, established_year: e.target.value ? Number(e.target.value) : null })}
                      placeholder="e.g. 2008"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="pdir-field-label">
                    Tagline / Motto
                  </label>
                  <input
                    type="text"
                    className="pdir-input"
                    value={formData.tagline}
                    onChange={e => setFormData({ ...formData, tagline: e.target.value })}
                    placeholder="e.g. Fostering Academic Excellence and Global Leadership"
                  />
                </div>

                <div>
                  <label className="pdir-field-label">
                    About Campus & Pedagogical Vision
                  </label>
                  <textarea
                    className="pdir-textarea"
                    rows={4}
                    value={formData.about}
                    onChange={e => setFormData({ ...formData, about: e.target.value })}
                    placeholder="Share a concise summary of the institution's curriculum ethos, learning environment, and achievements..."
                  />
                </div>
              </div>

              {/* Section 2: Location & Interactive Map Coordinates */}
              <div className="pdir-editor-card">
                <h3 className="pdir-editor-section-title">
                  2. Location & Coordinate Point Picker
                </h3>

                <div className="pdir-grid-3">
                  <div>
                    <label className="pdir-field-label">City *</label>
                    <input
                      type="text"
                      className="pdir-input"
                      value={formData.city}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="pdir-field-label">Province / State</label>
                    <input
                      type="text"
                      className="pdir-input"
                      value={formData.province}
                      onChange={e => setFormData({ ...formData, province: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="pdir-field-label">Country</label>
                    <input
                      type="text"
                      className="pdir-input"
                      value={formData.country}
                      onChange={e => setFormData({ ...formData, country: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="pdir-field-label">Physical Campus Address</label>
                  <input
                    type="text"
                    className="pdir-input"
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Street, Sector/Block, Phase"
                  />
                </div>

                {/* Interactive SVG Coordinate Picker */}
                <div className="pdir-map-picker-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b' }}>
                      Click map to position campus pin (Lat: {formData.latitude?.toFixed(4)}, Lon: {formData.longitude?.toFixed(4)}):
                    </span>
                  </div>
                  <div className="pdir-map-svg-wrap">
                    <svg 
                      width="100%" 
                      height="100%" 
                      onClick={handleMapPickerClick}
                      style={{ cursor: 'crosshair', display: 'block' }}
                    >
                      <defs>
                        <pattern id="picker-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#bae6fd" strokeWidth="1" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#picker-grid)" />
                      {/* Visual representative land outline */}
                      <path d="M 40,120 Q 90,80 140,50 T 260,30 T 360,70 T 480,100" fill="none" stroke="#93c5fd" strokeWidth="2" strokeDasharray="4 4" />
                      {formData.latitude && formData.longitude && (
                        <circle 
                          cx={`${Math.min(95, Math.max(5, ((formData.longitude - 61.0) / (78.0 - 61.0)) * 100))}%`} 
                          cy={`${Math.min(95, Math.max(5, ((37.0 - formData.latitude) / (37.0 - 24.0)) * 100))}%`} 
                          r="6" 
                          fill="#ef4444" 
                          stroke="#ffffff" 
                          strokeWidth="2" 
                        />
                      )}
                    </svg>
                  </div>
                  <div className="pdir-latlon-grid">
                    <input
                      type="number"
                      step="0.0001"
                      className="pdir-input"
                      placeholder="Latitude"
                      value={formData.latitude ?? ''}
                      onChange={e => setFormData({ ...formData, latitude: e.target.value ? Number(e.target.value) : null })}
                    />
                    <input
                      type="number"
                      step="0.0001"
                      className="pdir-input"
                      placeholder="Longitude"
                      value={formData.longitude ?? ''}
                      onChange={e => setFormData({ ...formData, longitude: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Curricula, Levels & Attributes */}
              <div className="pdir-editor-card">
                <h3 className="pdir-editor-section-title">
                  3. Academics, Boards & Student Cohort
                </h3>

                <div style={{ marginBottom: '16px' }}>
                  <label className="pdir-field-label">
                    Curricula Offered (Configured from Campus Setup)
                  </label>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.82rem', color: '#64748b' }}>
                    Curricula are automatically collected and synchronized from your campus configuration settings.
                  </p>
                  {formData.boards && formData.boards.length > 0 ? (
                    <div className="pdir-chips-wrap">
                      {formData.boards.map(b => (
                        <span
                          key={b}
                          className="pdir-chip-btn active-primary"
                          style={{ cursor: 'default', userSelect: 'none' }}
                        >
                          ✓ {b}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '0.84rem', color: '#64748b' }}>
                      No curricula configured yet. Go to <strong>Campus Configuration &gt; Curriculum</strong> to set up curricula for this campus.
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="pdir-field-label">
                    Educational Levels Offered
                  </label>
                  <div className="pdir-chips-wrap">
                    {COMMON_LEVELS.map(l => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => toggleArrayItem('levels', l)}
                        className={`pdir-chip-btn ${formData.levels.includes(l) ? 'active-primary' : ''}`}
                      >
                        {formData.levels.includes(l) ? '✓ ' : '+ '}{l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pdir-grid-3">
                  <div>
                    <label className="pdir-field-label">Gender Type</label>
                    <select
                      className="pdir-input"
                      value={formData.gender_type}
                      onChange={e => setFormData({ ...formData, gender_type: e.target.value as any })}
                    >
                      <option value="co-ed">Co-Educational</option>
                      <option value="boys">Boys Only</option>
                      <option value="girls">Girls Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="pdir-field-label">Medium of Instruction</label>
                    <select
                      className="pdir-input"
                      value={formData.medium}
                      onChange={e => setFormData({ ...formData, medium: e.target.value as any })}
                    >
                      <option value="english">English Medium</option>
                      <option value="urdu">Urdu Medium</option>
                      <option value="bilingual">Bilingual</option>
                    </select>
                  </div>

                  <div>
                    <label className="pdir-field-label">Admission Status</label>
                    <select
                      className="pdir-input"
                      value={formData.admission_status}
                      onChange={e => setFormData({ ...formData, admission_status: e.target.value as any })}
                    >
                      <option value="open">Admissions Open</option>
                      <option value="closed">Admissions Closed</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 4: Facilities */}
              <div className="pdir-editor-card">
                <h3 className="pdir-editor-section-title">
                  4. Campus Facilities & Infrastructure
                </h3>
                <div className="pdir-chips-wrap">
                  {COMMON_FACILITIES.map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleArrayItem('facilities', f)}
                      className={`pdir-chip-btn ${formData.facilities.includes(f) ? 'active-success' : ''}`}
                    >
                      {formData.facilities.includes(f) ? '✓ ' : '+ '}{f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 5: Privacy & Contact Modes */}
              <div className="pdir-editor-card">
                <h3 className="pdir-editor-section-title">
                  5. Privacy, Leaderboard Display & Contact Modes
                </h3>

                <div style={{ marginBottom: '16px' }}>
                  <label className="pdir-field-label">
                    Leaderboard Standing Display Mode
                  </label>
                  <div className="pdir-radio-grid">
                    {[
                      { mode: 'exact_rank', title: 'Exact Numerical Rank', desc: 'Shows #1, #2 rank badge' },
                      { mode: 'tier_only', title: 'Percentile Tier Only', desc: 'Shows Top 10%, Top 25%' },
                      { mode: 'unranked_listing', title: 'Unranked Listed Campus', desc: 'Score & band without numerical rank' }
                    ].map(opt => (
                      <label
                        key={opt.mode}
                        className={`pdir-radio-card ${formData.rank_display_mode === opt.mode ? 'selected' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            name="rank_display_mode"
                            checked={formData.rank_display_mode === opt.mode}
                            onChange={() => setFormData({ ...formData, rank_display_mode: opt.mode as any })}
                          />
                          <strong>{opt.title}</strong>
                        </div>
                        <span>{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="pdir-field-label">
                    Public Contact Preference
                  </label>
                  <div className="pdir-radio-grid">
                    {[
                      { mode: 'enquiry_only', title: 'Enquiry Form Only', desc: 'Safest: Leads sent to your portal' },
                      { mode: 'official_contact', title: 'Official Campus Phone/Email', desc: 'Revealed on rate-limited click' },
                      { mode: 'principal_direct', title: 'Principal Direct Contact', desc: 'Requires principal’s explicit consent' }
                    ].map(opt => (
                      <label
                        key={opt.mode}
                        className={`pdir-radio-card ${formData.contact_mode === opt.mode ? 'selected' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="radio"
                            name="contact_mode"
                            checked={formData.contact_mode === opt.mode}
                            onChange={() => setFormData({ ...formData, contact_mode: opt.mode as any })}
                          />
                          <strong>{opt.title}</strong>
                        </div>
                        <span>{opt.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {formData.contact_mode !== 'enquiry_only' && (
                  <div className="pdir-grid-2" style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <label className="pdir-field-label">Official Campus Phone</label>
                      <input
                        type="text"
                        className="pdir-input"
                        value={formData.official_phone}
                        onChange={e => setFormData({ ...formData, official_phone: e.target.value })}
                        placeholder="+92-42-35550123"
                      />
                    </div>
                    <div>
                      <label className="pdir-field-label">Official Campus Email</label>
                      <input
                        type="email"
                        className="pdir-input"
                        value={formData.official_email}
                        onChange={e => setFormData({ ...formData, official_email: e.target.value })}
                        placeholder="admissions@campus.edu.pk"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 6: Terms & Submission Action Card */}
              <div className="pdir-editor-card" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '18px' }}>
                  <input
                    type="checkbox"
                    checked={formData.consent_agreed}
                    onChange={e => setFormData({ ...formData, consent_agreed: e.target.checked })}
                    style={{ width: '18px', height: '18px', marginTop: '2px', flexShrink: 0 }}
                  />
                  <div style={{ fontSize: '0.86rem', color: '#334155', lineHeight: 1.5 }}>
                    <strong>Opt-in Verification & Honesty Consent (Version 1.0):</strong> I confirm on behalf of this campus that all provided information is accurate. I authorize Optimus Orien to generate platform-level performance snapshots from published examination records and index this profile on the public leaderboard.
                  </div>
                </label>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="pdir-btn-secondary"
                  >
                    <Save size={16} />
                    <span>{saving ? 'Saving...' : 'Save Draft'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmitApproval}
                    disabled={submitting}
                    className="pdir-btn-primary"
                  >
                    <Send size={16} />
                    <span>{submitting ? 'Submitting...' : 'Submit for Admin Approval'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: LIVE PREVIEW OF CARD & PROFILE */}
            <div className="pdir-editor-preview-col">
              <div style={{ background: '#1e293b', color: '#fff', padding: '12px 18px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={16} color="#38bdf8" />
                  <span>Live Public Preview</span>
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Updates as you type</span>
              </div>

              {/* Design Sample Preview Card */}
              <div className="pdir-card" style={{ margin: 0, padding: 0, overflow: 'hidden', borderRadius: '20px', border: '1px solid #cbd5e1', boxShadow: '0 12px 36px rgba(15,23,42,0.12)' }}>
                {/* Masthead Header matching sample */}
                <div style={{
                  background: 'linear-gradient(135deg, #091e3a 0%, #0f2b48 50%, #172554 100%)',
                  padding: '20px',
                  color: '#ffffff',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, #0f766e, #047857)',
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 20,
                        fontWeight: 800,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                      }}>
                        {(formData.display_name || 'Campus').charAt(0)}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ffffff' }}>
                            {formData.display_name || 'Your Campus Display Name'}
                          </h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
                          <MapPin size={12} />
                          <span>{[formData.city, formData.province, formData.country].filter(Boolean).join(', ') || 'Campus Location'}</span>
                        </div>
                      </div>
                    </div>

                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: '#065f46',
                      color: '#6ee7b7',
                      border: '1px solid #047857',
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap'
                    }}>
                      <Star size={11} /> Top Rated
                    </span>
                  </div>

                  {formData.tagline && (
                    <p style={{ fontSize: '0.8rem', color: '#cbd5e1', margin: '10px 0 0', fontStyle: 'italic' }}>
                      "{formData.tagline}"
                    </p>
                  )}
                </div>

                <div style={{ padding: '20px', background: '#ffffff' }}>
                  {/* Performance Heading & Circular Gauges matching sample */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong style={{ fontSize: '0.85rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Trophy size={14} color="#d97706" />
                        <span>My School's Performance</span>
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} /> Verified
                      </span>
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-around',
                      alignItems: 'center',
                      background: '#f8fafc',
                      borderRadius: 14,
                      padding: '12px 8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 46,
                          height: 46,
                          borderRadius: '50%',
                          border: '3.5px solid #14b8a6',
                          background: 'rgba(20, 184, 166, 0.1)',
                          color: '#0f766e',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 800,
                          fontSize: 12
                        }}>
                          94%
                        </div>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Attendance</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 46,
                          height: 46,
                          borderRadius: '50%',
                          border: '3.5px solid #f59e0b',
                          background: 'rgba(245, 158, 11, 0.1)',
                          color: '#d97706',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 800,
                          fontSize: 12
                        }}>
                          {listingMeta.score ? Math.round(listingMeta.score) : 88}%
                        </div>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Performance</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 46,
                          height: 46,
                          borderRadius: '50%',
                          border: '3.5px solid #0ea5e9',
                          background: 'rgba(14, 165, 233, 0.1)',
                          color: '#0284c7',
                          display: 'grid',
                          placeItems: 'center',
                          fontWeight: 800,
                          fontSize: 12
                        }}>
                          {formData.levels.length || 6}+
                        </div>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Credits</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Row matching sample */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-around',
                    padding: '8px 0 12px',
                    borderBottom: '1px solid #f1f5f9',
                    fontSize: '0.8rem'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Connections</span>
                      <strong style={{ color: '#0f766e', fontSize: '0.95rem' }}>120</strong>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Subjects</span>
                      <strong style={{ color: '#0f766e', fontSize: '0.95rem' }}>{formData.boards.length || 8}</strong>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Rating</span>
                      <strong style={{ color: '#d97706', fontSize: '0.95rem' }}>⭐ 4.9</strong>
                    </div>
                  </div>

                  {/* 4 Colorful Badges & Achievements matching sample */}
                  <div style={{ marginTop: 14 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 8 }}>
                      Achievements & Badges
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, background: '#f8fafc', padding: '8px 4px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #fbbf24, #d97706)', display: 'grid', placeItems: 'center', fontSize: 14, color: '#fff' }}>🏆</div>
                        <strong style={{ fontSize: 9, color: '#0f172a' }}>Top Scorer</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, background: '#f8fafc', padding: '8px 4px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #a855f7, #7e22ce)', display: 'grid', placeItems: 'center', fontSize: 14, color: '#fff' }}>🛡️</div>
                        <strong style={{ fontSize: 9, color: '#0f172a' }}>Math Whiz</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, background: '#f8fafc', padding: '8px 4px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #14b8a6, #0f766e)', display: 'grid', placeItems: 'center', fontSize: 14, color: '#fff' }}>🛡️</div>
                        <strong style={{ fontSize: 9, color: '#0f172a' }}>Helpful Peer</strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, background: '#f8fafc', padding: '8px 4px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #22c55e, #15803d)', display: 'grid', placeItems: 'center', fontSize: 14, color: '#fff' }}>🎖️</div>
                        <strong style={{ fontSize: 9, color: '#0f172a' }}>Attendance</strong>
                      </div>
                    </div>
                  </div>

                  {/* Dark Teal Action Buttons matching sample */}
                  <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        fontSize: '0.82rem',
                        padding: '9px 12px',
                        borderRadius: 8,
                        background: '#ffffff',
                        border: '1px solid #0f766e',
                        color: '#0f766e',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Contact Campus
                    </button>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        fontSize: '0.82rem',
                        padding: '9px 12px',
                        borderRadius: 8,
                        background: '#0f766e',
                        border: '1px solid #0d9488',
                        color: '#ffffff',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(15, 118, 110, 0.25)'
                      }}
                    >
                      View Profile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
