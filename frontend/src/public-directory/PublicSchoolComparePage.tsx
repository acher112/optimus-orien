import React, { useState, useEffect } from 'react';
import { 
  Building2, ArrowLeft, Plus, X, Award, CheckCircle2, 
  MapPin, Shield, Check, Minus, ExternalLink, RefreshCw 
} from 'lucide-react';
import { PublicCampusDetailData } from './publicDirectoryTypes';
import './publicDirectory.css';

interface ComparePageProps {
  onNavigate?: (path: string) => void;
  lang?: 'en' | 'ur';
}

export const PublicSchoolComparePage: React.FC<ComparePageProps> = ({ 
  onNavigate, 
  lang = 'en' 
}) => {
  const isUrdu = lang === 'ur';
  const [schools, setSchools] = useState<PublicCampusDetailData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Read slugs from URL query param e.g. /schools/compare?slugs=school-a,school-b
  const getSlugsFromUrl = (): string[] => {
    try {
      const params = new URLSearchParams(window.location.search);
      const slugsParam = params.get('slugs');
      if (slugsParam) {
        return slugsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
      }
    } catch {}
    return [];
  };

  const [activeSlugs, setActiveSlugs] = useState<string[]>(getSlugsFromUrl());

  useEffect(() => {
    const fetchComparison = async () => {
      if (activeSlugs.length === 0) {
        setSchools([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/public/schools/compare/?slugs=${encodeURIComponent(activeSlugs.join(','))}`);
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.detail || (isUrdu ? 'اسکولوں کا موازنہ لانے میں ناکامی' : 'Failed to load school comparison data'));
        }
        const data = await res.json();
        setSchools(data.results || []);
      } catch (err: any) {
        setError(err.message || 'An error occurred while loading comparison data.');
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [activeSlugs, isUrdu]);

  const handleRemove = (slugToRemove: string) => {
    const next = activeSlugs.filter(s => s !== slugToRemove);
    setActiveSlugs(next);
    // update URL
    const params = new URLSearchParams(window.location.search);
    if (next.length > 0) {
      params.set('slugs', next.join(','));
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    } else {
      params.delete('slugs');
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
  };

  const getBandClass = (band: string) => {
    switch (band?.toLowerCase()) {
      case 'outstanding': return 'badge-band-outstanding';
      case 'strong': return 'badge-band-strong';
      case 'steady': return 'badge-band-steady';
      default: return 'badge-band-developing';
    }
  };

  // Compile all unique facilities across selected schools
  const allFacilities = Array.from(new Set(schools.flatMap(s => s.facilities || [])));

  return (
    <div className={`pdir-page-container ${isUrdu ? 'rtl' : 'ltr'}`} style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '32px 20px' }}>
        {/* Navigation & Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <button 
              onClick={() => navigateTo('/schools')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'none',
                border: 'none',
                color: '#4f46e5',
                fontWeight: 600,
                fontSize: '0.92rem',
                cursor: 'pointer',
                marginBottom: '8px'
              }}
            >
              <ArrowLeft size={16} />
              <span>{isUrdu ? 'اسکولوں کی فہرست پر واپس' : 'Back to Campus Leaderboard'}</span>
            </button>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#0f172a' }}>
              {isUrdu ? 'اسکولوں کا موازنہ' : 'Compare Campuses'}
            </h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.92rem' }}>
              {isUrdu 
                ? 'تعلیمی کارکردگی، سہولیات، اور الحاق کا غیر جانبدارانہ موازنہ (زیادہ سے زیادہ 3 اسکول)' 
                : 'Neutral side-by-side comparison of academic performance, curriculum boards, and campus facilities (up to 3 campuses).'}
            </p>
          </div>

          <button
            onClick={() => navigateTo('/schools')}
            className="pdir-btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>{isUrdu ? 'مزید اسکول شامل کریں' : 'Add Another School'}</span>
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="pdir-empty-state">
            <RefreshCw size={36} className="spin-anim" color="#4f46e5" />
            <h3 style={{ marginTop: '16px' }}>{isUrdu ? 'موازنہ لوڈ ہو رہا ہے...' : 'Loading Comparison Data...'}</h3>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="pdir-empty-state" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
            <h3 style={{ color: '#b91c1c' }}>{error}</h3>
            <button 
              className="pdir-btn-secondary" 
              onClick={() => navigateTo('/schools')}
              style={{ marginTop: '12px' }}
            >
              {isUrdu ? 'اسکول تلاش کریں' : 'Browse Campuses'}
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && schools.length === 0 && (
          <div className="pdir-empty-state">
            <Building2 size={48} color="#94a3b8" />
            <h3 style={{ marginTop: '16px' }}>{isUrdu ? 'کوئی اسکول منتخب نہیں کیا گیا' : 'No Campuses Selected for Comparison'}</h3>
            <p style={{ color: '#64748b', maxWidth: '420px', margin: '8px auto 20px' }}>
              {isUrdu 
                ? 'اسکول لیڈر بورڈ سے 2 یا 3 اسکول منتخب کریں تاکہ ان کا تفصیلی موازنہ دیکھ سکیں۔' 
                : 'Select 2 or 3 campuses from the directory leaderboard to view their comparative breakdown.'}
            </p>
            <button className="pdir-btn-primary" onClick={() => navigateTo('/schools')}>
              {isUrdu ? 'اسکول منتخب کریں' : 'Find Schools to Compare'}
            </button>
          </div>
        )}

        {/* Comparison Grid Table */}
        {!loading && !error && schools.length > 0 && (
          <div style={{ 
            background: '#ffffff', 
            borderRadius: '20px', 
            border: '1px solid #e2e8f0', 
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: isUrdu ? 'right' : 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '24px 20px', width: '220px', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {isUrdu ? 'پیمانہ' : 'Metric / Feature'}
                    </th>
                    {schools.map(school => (
                      <th key={school.slug} style={{ padding: '24px 20px', minWidth: '260px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ 
                              width: '46px', 
                              height: '46px', 
                              borderRadius: '12px', 
                              background: '#e0e7ff', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              fontWeight: 800,
                              color: '#4338ca',
                              fontSize: '1.2rem',
                              flexShrink: 0
                            }}>
                              {school.display_name.charAt(0)}
                            </div>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                                {school.display_name}
                              </h3>
                              <span style={{ fontSize: '0.82rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                <MapPin size={13} /> {school.city}, {school.province}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemove(school.slug)}
                            title={isUrdu ? 'ہٹائیں' : 'Remove from comparison'}
                            style={{
                              background: '#f1f5f9',
                              border: 'none',
                              borderRadius: '50%',
                              width: '28px',
                              height: '28px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              color: '#64748b'
                            }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                        <div style={{ marginTop: '16px' }}>
                          <button
                            onClick={() => navigateTo(`/schools/${school.slug}`)}
                            className="pdir-btn-secondary"
                            style={{ width: '100%', fontSize: '0.85rem', padding: '8px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                          >
                            <span>{isUrdu ? 'مکمل پروفائل دیکھیں' : 'View Full Profile'}</span>
                            <ExternalLink size={13} />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {/* Row: Optimus Orien AQI Score & Band */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#334155', background: '#fcfcfd' }}>
                      {isUrdu ? 'تعلیمی اسکور (AQI)' : 'Academic Quality Index (AQI)'}
                    </td>
                    {schools.map(school => (
                      <td key={school.slug} style={{ padding: '16px 20px' }}>
                        {school.score !== null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ 
                              width: '42px', 
                              height: '42px', 
                              borderRadius: '50%', 
                              background: '#4f46e5', 
                              color: '#fff', 
                              fontWeight: 800, 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              fontSize: '0.95rem'
                            }}>
                              {Math.round(school.score)}
                            </div>
                            <div>
                              <span className={`pdir-badge ${getBandClass(school.band)}`}>
                                {school.band}
                              </span>
                              {school.score_delta !== null && (
                                <div style={{ 
                                  fontSize: '0.78rem', 
                                  color: school.score_delta >= 0 ? '#16a34a' : '#64748b',
                                  fontWeight: 600,
                                  marginTop: '3px'
                                }}>
                                  {school.score_delta >= 0 ? `+${school.score_delta.toFixed(1)}` : school.score_delta.toFixed(1)} {isUrdu ? 'گزشتہ ٹرم سے' : 'vs last period'}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.88rem' }}>
                            {isUrdu ? 'فی الحال غیر درجہ بند' : 'Not ranked yet'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Leaderboard Standing */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#334155', background: '#fcfcfd' }}>
                      {isUrdu ? 'رینکنگ / پوزیشن' : 'Directory Standing'}
                    </td>
                    {schools.map(school => (
                      <td key={school.slug} style={{ padding: '16px 20px' }}>
                        {school.rank_display_mode === 'exact_rank' && school.rank_overall ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Award size={18} color="#f59e0b" />
                            <strong style={{ fontSize: '1rem', color: '#0f172a' }}>
                              #{school.rank_overall} {isUrdu ? 'مجموعی' : 'Overall'}
                            </strong>
                            {school.rank_city && (
                              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                (#{school.rank_city} in {school.city})
                              </span>
                            )}
                          </div>
                        ) : school.rank_display_mode === 'tier_only' && school.rank_tier ? (
                          <span className="pdir-badge badge-tier" style={{ background: '#fef3c7', color: '#92400e' }}>
                            {school.rank_tier}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.88rem' }}>
                            {isUrdu ? 'درجہ بندی میں شامل' : 'Listed Campus'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Admission Status */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#334155', background: '#fcfcfd' }}>
                      {isUrdu ? 'داخلہ کی صورتحال' : 'Admission Status'}
                    </td>
                    {schools.map(school => (
                      <td key={school.slug} style={{ padding: '16px 20px' }}>
                        <span className={`pdir-badge ${school.admission_status === 'open' ? 'badge-admission-open' : 'badge-admission-closed'}`}>
                          {school.admission_status === 'open' ? (isUrdu ? 'داخلے جاری ہیں' : 'Admissions Open') : (isUrdu ? 'داخلے بند ہیں' : 'Admissions Closed')}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Row: Curricula & Boards */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#334155', background: '#fcfcfd' }}>
                      {isUrdu ? 'تعلیمی بورڈز' : 'Educational Boards'}
                    </td>
                    {schools.map(school => (
                      <td key={school.slug} style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {school.boards && school.boards.length > 0 ? (
                            school.boards.map(b => (
                              <span key={b} className="pdir-tag" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                                {b}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Row: Grade Levels */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#334155', background: '#fcfcfd' }}>
                      {isUrdu ? 'تعلیمی درجات' : 'Offered Levels'}
                    </td>
                    {schools.map(school => (
                      <td key={school.slug} style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {school.levels && school.levels.length > 0 ? (
                            school.levels.map(l => (
                              <span key={l} className="pdir-tag">
                                {l}
                              </span>
                            ))
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Row: Gender & Medium */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#334155', background: '#fcfcfd' }}>
                      {isUrdu ? 'صنف اور ذریعہ تعلیم' : 'Gender & Medium'}
                    </td>
                    {schools.map(school => (
                      <td key={school.slug} style={{ padding: '16px 20px' }}>
                        <div style={{ fontSize: '0.9rem', color: '#1e293b' }}>
                          <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{school.gender_type}</span>
                          <span style={{ color: '#94a3b8', margin: '0 6px' }}>•</span>
                          <span style={{ textTransform: 'capitalize' }}>{school.medium}</span>
                        </div>
                      </td>
                    ))}
                  </tr>

                  {/* Row: Verification Badge */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#334155', background: '#fcfcfd' }}>
                      {isUrdu ? 'پلیٹ فارم تصدیق' : 'Optimus Orien Verification'}
                    </td>
                    {schools.map(school => (
                      <td key={school.slug} style={{ padding: '16px 20px' }}>
                        <span className="pdir-verified-badge" style={{ fontSize: '0.82rem' }}>
                          <CheckCircle2 size={14} color="#16a34a" />
                          <span>{isUrdu ? 'تصدیق شدہ کیمپس' : 'Verified Campus'}</span>
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Facility Rows */}
                  {allFacilities.map(facility => (
                    <tr key={facility} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 20px', fontWeight: 600, color: '#475569', background: '#fcfcfd', fontSize: '0.88rem' }}>
                        {facility}
                      </td>
                      {schools.map(school => {
                        const hasFac = (school.facilities || []).includes(facility);
                        return (
                          <td key={school.slug} style={{ padding: '12px 20px' }}>
                            {hasFac ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 600, fontSize: '0.85rem' }}>
                                <Check size={16} />
                                <span>{isUrdu ? 'دستیاب' : 'Available'}</span>
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>
                                <Minus size={16} />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom Honesty Note */}
            <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={18} color="#6366f1" />
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b' }}>
                {isUrdu
                  ? 'موازنہ کا ڈیٹا ہر اسکول کے خود شائع کردہ نتائج پر مبنی ہے۔ درجہ بندی کی تفصیلی پالیسی کے لیے ہمارا میتھوڈولوجی صفحہ دیکھیں۔'
                  : 'Comparison metrics are derived from each campus’s published assessment records. Read our '}
                <a href="/schools/methodology" style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'underline' }}>
                  {isUrdu ? 'طریقہ کار' : 'Methodology & Transparency Guide'}
                </a>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
