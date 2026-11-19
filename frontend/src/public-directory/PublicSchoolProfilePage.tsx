import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, MapPin, Building2, CheckCircle2, Share2, AlertTriangle,
  Sparkles, Award, TrendingUp, Phone, Mail, Calendar, ExternalLink,
  ChevronLeft, ArrowLeft, Send, Check, UserRound
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PublicCampusDetailData, RevealedContactInfo } from './publicDirectoryTypes';
import './publicDirectory.css';

interface PublicSchoolProfilePageProps {
  slug: string;
  onNavigate: (path: string) => void;
  authenticated: boolean;
}

export default function PublicSchoolProfilePage({ slug, onNavigate }: PublicSchoolProfilePageProps) {
  const [profile, setProfile] = useState<PublicCampusDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Enquiry form state
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [childGrade, setChildGrade] = useState('');
  const [message, setMessage] = useState('');
  const [hpCode, setHpCode] = useState(''); // Honeypot field
  const [submittingEnquiry, setSubmittingEnquiry] = useState(false);
  const [enquirySuccess, setEnquirySuccess] = useState(false);
  const [enquiryError, setEnquiryError] = useState<string | null>(null);

  // Contact reveal state
  const [contactRevealed, setContactRevealed] = useState(false);
  const [contactInfo, setContactInfo] = useState<RevealedContactInfo | null>(null);
  const [revealing, setRevealing] = useState(false);

  // Share feedback state
  const [copiedShare, setCopiedShare] = useState(false);

  // Report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/v1/public/schools/${slug}/`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Campus not found or listing is not currently live.');
        }
        return res.json();
      })
      .then((data: PublicCampusDetailData) => {
        setProfile(data);
        document.title = `${data.display_name} - Academic Quality Profile | Optimus Orien`;
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Unable to load campus profile.');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleRevealContact = async () => {
    if (contactRevealed) return;
    setRevealing(true);
    try {
      const res = await fetch(`/api/v1/public/schools/${slug}/reveal-contact/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.status === 429) {
        alert('Rate limit exceeded. Please wait a minute before requesting contact details.');
        return;
      }
      if (!res.ok) throw new Error('Could not retrieve contact details.');
      const data: RevealedContactInfo = await res.json();
      setContactInfo(data);
      setContactRevealed(true);
    } catch (err) {
      console.error(err);
      alert('Unable to reveal contact information at this time.');
    } finally {
      setRevealing(false);
    }
  };

  const handleSubmitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingEnquiry(true);
    setEnquiryError(null);

    try {
      const res = await fetch(`/api/v1/public/schools/${slug}/enquiry/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_name: parentName,
          phone,
          email,
          child_grade: childGrade,
          message,
          hp_code: hpCode, // Honeypot
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || Object.values(data.errors || {})[0] || 'Submission failed.');
      }

      setEnquirySuccess(true);
      setParentName('');
      setPhone('');
      setEmail('');
      setChildGrade('');
      setMessage('');
    } catch (err: any) {
      setEnquiryError(err.message || 'Failed to submit enquiry.');
    } finally {
      setSubmittingEnquiry(false);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="public-directory-container" style={{ textAlign: 'center', padding: '120px 20px' }}>
        <div style={{ fontSize: '1.2rem', color: '#64748b' }}>Loading campus academic profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="public-directory-container" style={{ textAlign: 'center', padding: '100px 20px' }}>
        <h2 style={{ fontSize: '1.8rem', color: '#0f172a' }}>Campus Not Available</h2>
        <p style={{ color: '#64748b', maxWidth: 480, margin: '12px auto 24px auto' }}>
          {error || 'This campus listing is either in draft, pending moderation, or has been unpublished.'}
        </p>
        <button onClick={() => onNavigate('/schools')} className="compare-tray-btn">
          Return to Schools Directory
        </button>
      </div>
    );
  }

  // Format historical score data for recharts area graph
  const chartData = (profile.history || []).map((h) => ({
    period: h.period_name,
    score: h.aqi_score,
  }));

  return (
    <div className="public-directory-container">
      {/* Top Breadcrumb Nav */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid var(--dir-border)', padding: '10px 24px' }}>
        <button
          onClick={() => onNavigate('/schools')}
          style={{
            background: 'none',
            border: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--dir-text-muted)',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to All Schools</span>
        </button>
      </div>

      {/* Profile Header Hero */}
      <section className="profile-hero">
        <div className="profile-hero-inner">
          <div className="profile-main-info">
            <img
              src={profile.logo_url || 'https://placehold.co/80x80/1e293b/ffffff?text=OO'}
              alt={`${profile.display_name} logo`}
              className="profile-logo-large"
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                {profile.rank_overall !== null && (
                  <span className="campus-rank-tag" style={{ background: '#eef2ff', color: 'var(--dir-primary)' }}>
                    Rank #{profile.rank_overall} in Country
                  </span>
                )}
                {profile.rank_city !== null && (
                  <span className="campus-rank-tag">
                    #{profile.rank_city} in {profile.city}
                  </span>
                )}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: '0.78rem',
                    color: '#059669',
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle2 size={13} />
                  Verified on Optimus Orien
                </span>
              </div>

              <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: '2px 0 6px 0', color: '#0f172a' }}>
                {profile.display_name}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: '#64748b' }}>
                <MapPin size={14} />
                <span>
                  {profile.address ? `${profile.address}, ` : ''}
                  {[profile.city, profile.province, profile.country].filter(Boolean).join(', ') || profile.location_display || 'Registered Campus'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleShare}
              style={{
                background: '#ffffff',
                border: '1px solid var(--dir-border)',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              {copiedShare ? <Check size={14} color="#059669" /> : <Share2 size={14} />}
              <span>{copiedShare ? 'Link Copied!' : 'Share'}</span>
            </button>

            {profile.admission_status === 'open' && (
              <span className="admission-badge open" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                Admissions Open
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Main Grid: Left Details & Right Contact Box */}
      <div className="profile-content-grid">
        {/* Left Column: Academic Performance, About, Facilities */}
        <div>
          {/* Performance Overview Card */}
          <div className="profile-section-card">
            <h2 className="profile-section-title">
              <Sparkles size={18} color="var(--dir-primary)" />
              <span>Academic Quality Index (AQI)</span>
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                  {profile.score !== null ? `${profile.score}%` : (profile.average_display || 'Not available yet')}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                  Academic Average • Verified Curriculum Assessment Metric
                </div>
              </div>

              <div className={`aqi-pill ${profile.band ? profile.band.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'developing'}`} style={{ fontSize: '1rem', padding: '8px 16px' }}>
                <Award size={18} />
                <span>{profile.band}</span>
              </div>
            </div>

            {/* Historical Score Sparkline / Area Chart */}
            {chartData.length > 1 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: 12 }}>
                  Historical Performance Trajectory (Chronological)
                </div>
                <div style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4338ca" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#4338ca" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis domain={[50, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="score" stroke="#4338ca" strokeWidth={2.5} fillOpacity={1} fill="url(#scoreGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div style={{ fontSize: '0.8rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 16 }}>
              AQI metrics are computed from verified published examination results across curriculum subjects. Attendance, disciplinary, or diagnostic notes are never factored into rankings.{' '}
              <a href="/schools/methodology" onClick={(e) => { e.preventDefault(); onNavigate('/schools/methodology'); }} style={{ color: 'var(--dir-primary)', fontWeight: 600 }}>
                Read complete methodology
              </a>.
            </div>
          </div>

          {/* About Campus */}
          {profile.about && (
            <div className="profile-section-card">
              <h2 className="profile-section-title">
                <Building2 size={18} color="var(--dir-primary)" />
                <span>About the Institution</span>
              </h2>
              <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#334155', margin: 0 }}>
                {profile.about}
              </p>
            </div>
          )}

          {/* Institutional Structure & Curriculum */}
          <div className="profile-section-card">
            <h2 className="profile-section-title">
              <ShieldCheck size={18} color="var(--dir-primary)" />
              <span>Curriculum & Academic Structure</span>
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Affiliated Boards</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {profile.boards.map((b) => (
                    <span key={b} className="tag-badge">
                      {b}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Instructional Levels</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {profile.levels.map((lvl) => (
                    <span key={lvl} className="tag-badge">
                      {lvl}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Medium of Instruction</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginTop: 4, textTransform: 'capitalize' }}>
                  {profile.medium}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Gender Format</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginTop: 4, textTransform: 'capitalize' }}>
                  {profile.gender_type}
                </div>
              </div>
            </div>
          </div>

          {/* Facilities Checklist */}
          {profile.facilities && profile.facilities.length > 0 && (
            <div className="profile-section-card">
              <h2 className="profile-section-title">
                <CheckCircle2 size={18} color="var(--dir-primary)" />
                <span>Campus Facilities</span>
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {profile.facilities.map((fac) => (
                  <div key={fac} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', color: '#334155' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--dir-primary)' }} />
                    <span>{fac}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Contact & Enquiry Form */}
        <div>
          {/* Principal & Direct Contact Card */}
          <div className="profile-section-card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 12px 0', color: '#0f172a' }}>
              Campus Administration & Contact
            </h3>

            <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserRound size={18} color="#4338ca" />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Campus Principal</div>
                <div style={{ fontWeight: 700, color: (profile.principal_name || (profile.principal_display && profile.principal_display !== 'Not available yet')) ? '#0f172a' : '#94a3b8', fontSize: '0.95rem' }}>
                  {profile.principal_name || profile.principal_display || 'Not available yet'}
                </div>
              </div>
            </div>

            {contactRevealed && contactInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {contactInfo.official_phone && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Official Phone</div>
                    <a href={`tel:${contactInfo.official_phone}`} style={{ fontWeight: 700, color: 'var(--dir-primary)' }}>
                      {contactInfo.official_phone}
                    </a>
                  </div>
                )}
                {contactInfo.official_email && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Official Email</div>
                    <a href={`mailto:${contactInfo.official_email}`} style={{ fontWeight: 700, color: 'var(--dir-primary)' }}>
                      {contactInfo.official_email}
                    </a>
                  </div>
                )}
                {contactInfo.principal_direct_phone && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>Principal Direct Phone (Consented)</div>
                    <a href={`tel:${contactInfo.principal_direct_phone}`} style={{ fontWeight: 700, color: '#059669' }}>
                      {contactInfo.principal_direct_phone}
                    </a>
                  </div>
                )}
                {contactInfo.principal_direct_email && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>Principal Direct Email (Consented)</div>
                    <a href={`mailto:${contactInfo.principal_direct_email}`} style={{ fontWeight: 700, color: '#059669' }}>
                      {contactInfo.principal_direct_email}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleRevealContact}
                disabled={revealing}
                className="compare-tray-btn"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
              >
                <Phone size={14} />
                <span>{revealing ? 'Verifying...' : 'Reveal Campus Contact'}</span>
              </button>
            )}
          </div>

          {/* Online Parent Enquiry Form */}
          <div className="profile-section-card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 12px 0', color: '#0f172a' }}>
              Submit an Admission Enquiry
            </h3>

            {enquirySuccess ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <CheckCircle2 size={36} color="#059669" style={{ margin: '0 auto 10px auto' }} />
                <h4 style={{ margin: '0 0 6px 0', color: '#059669' }}>Enquiry Received!</h4>
                <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0 }}>
                  Your enquiry has been delivered directly to the campus administration desk.
                </p>
                <button
                  onClick={() => setEnquirySuccess(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--dir-primary)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    marginTop: 14,
                    cursor: 'pointer',
                  }}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitEnquiry}>
                {enquiryError && (
                  <div style={{ background: '#fef2f2', color: '#b91c1c', padding: 10, borderRadius: 8, fontSize: '0.82rem', marginBottom: 12 }}>
                    {enquiryError}
                  </div>
                )}

                {/* Honeypot hidden input */}
                <input
                  type="text"
                  name="hp_code"
                  value={hpCode}
                  onChange={(e) => setHpCode(e.target.value)}
                  style={{ display: 'none' }}
                  tabIndex={-1}
                  autoComplete="off"
                />

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                    Parent / Guardian Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="public-select"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="e.g. Asad Siddiqui"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="public-select"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="e.g. +92 300 1234567"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="public-select"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="e.g. parent@example.com"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                    Child's Target Grade *
                  </label>
                  <input
                    type="text"
                    required
                    value={childGrade}
                    onChange={(e) => setChildGrade(e.target.value)}
                    className="public-select"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="e.g. Grade 7, O-Levels, Matric"
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: '#334155' }}>
                    Message / Questions *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="public-select"
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                    placeholder="Inquire about fee structure, curriculum, admissions tests..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingEnquiry}
                  className="compare-tray-btn"
                  style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                >
                  <Send size={14} />
                  <span>{submittingEnquiry ? 'Sending...' : 'Send Enquiry'}</span>
                </button>
              </form>
            )}

            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 12, textAlign: 'center' }}>
              Enquiries are retained securely for 90 days and forwarded directly to this campus's inbox.
            </div>
          </div>

          {/* Report Problem Link */}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              onClick={() => setReportModalOpen(true)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Report a discrepancy with this listing
            </button>
          </div>
        </div>
      </div>

      {/* Report Discrepancy Modal */}
      {reportModalOpen && (
        <div className="public-modal-backdrop" onClick={() => setReportModalOpen(false)}>
          <div className="public-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 700 }}>Report Listing Discrepancy</h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>
              Submit factual corrections or concerns regarding {profile.display_name}. Reports are audited by platform administrators.
            </p>

            {reportSuccess ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#059669', fontWeight: 600 }}>
                Thank you. Your report has been logged for administrative verification.
              </div>
            ) : (
              <div>
                <textarea
                  rows={4}
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  className="public-select"
                  style={{ width: '100%', boxSizing: 'border-box', marginBottom: 16 }}
                  placeholder="Describe the discrepancy..."
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button onClick={() => setReportModalOpen(false)} style={{ background: 'none', border: '1px solid var(--dir-border)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setReportSuccess(true);
                      setTimeout(() => {
                        setReportModalOpen(false);
                        setReportSuccess(false);
                        setReportText('');
                      }, 2000);
                    }}
                    className="compare-tray-btn"
                  >
                    Submit Report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
