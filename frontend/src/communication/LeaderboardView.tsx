import React, { useState, useEffect, useCallback } from 'react';
import {
  Trophy, Award, BookOpen, ShieldCheck, SlidersHorizontal,
  Search, Filter, ChevronRight, X, ExternalLink, Users,
  CheckCircle2, AlertCircle, Building2, TrendingUp, Star, Sparkles
} from 'lucide-react';
import {
  communicationApi,
  LeaderboardSchoolItem,
  LeaderboardPrincipalItem,
  LeaderboardTeacherItem,
  LeaderboardStudentItem,
  SchoolDetailModalData
} from './communicationApi';
import './communication.css';

interface LeaderboardViewProps {
  notify?: (msg: string, type?: string) => void;
  onOpenCommunity?: () => void;
  onOpenAssessments?: () => void;
}

export default function LeaderboardView({ notify }: LeaderboardViewProps) {
  const [activeTab, setActiveTab] = useState<'schools' | 'principals' | 'teachers' | 'students'>('schools');
  const [schoolsViewType, setSchoolsViewType] = useState<'campuses' | 'organisations'>('campuses');
  
  // Filters
  const [searchCity, setSearchCity] = useState('');
  const [curriculum, setCurriculum] = useState('All Curricula');
  const [country, setCountry] = useState('All Countries');
  const [tier, setTier] = useState('');

  // Data states
  const [schools, setSchools] = useState<LeaderboardSchoolItem[]>([]);
  const [organisations, setOrganisations] = useState<LeaderboardSchoolItem[]>([]);
  const [principals, setPrincipals] = useState<LeaderboardPrincipalItem[]>([]);
  const [teachers, setTeachers] = useState<LeaderboardTeacherItem[]>([]);
  const [students, setStudents] = useState<LeaderboardStudentItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [schoolDetail, setSchoolDetail] = useState<SchoolDetailModalData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Privacy form state
  const [visibilityTier, setVisibilityTier] = useState('open');
  const [showStudentNames, setShowStudentNames] = useState(true);
  const [publishScores, setPublishScores] = useState(true);

  // Fetch Leaderboard Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'schools') {
        const res = await communicationApi.getSchools({
          view_type: schoolsViewType,
          curriculum: curriculum !== 'All Curricula' ? curriculum : '',
          country: country !== 'All Countries' ? country : '',
          city: searchCity,
          tier: tier
        });
        if (schoolsViewType === 'campuses') {
          setSchools(res.results || []);
        } else {
          setOrganisations(res.results || []);
        }
      } else if (activeTab === 'principals') {
        const res = await communicationApi.getPrincipals();
        setPrincipals(res.results || []);
      } else if (activeTab === 'teachers') {
        const res = await communicationApi.getTeachers();
        setTeachers(res.results || []);
      } else if (activeTab === 'students') {
        const res = await communicationApi.getStudents();
        setStudents(res.results || []);
      }
    } catch (err: any) {
      console.error('Failed to load leaderboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, schoolsViewType, curriculum, country, searchCity, tier]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle open school detail modal
  const handleOpenSchoolDetail = async (id: number) => {
    setSelectedSchoolId(id);
    setDetailLoading(true);
    try {
      const data = await communicationApi.getSchoolDetail(id);
      setSchoolDetail(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="comm-page-wrapper">
      <div className="comm-suite-container">
        {/* Top Kicker */}
        <div className="comm-kicker comm-kicker-leaderboard">
          <Trophy size={13} /> Institutional &amp; Stratified Academic Leaderboards
        </div>

        {/* Signature Coral · Rose · Fuchsia Hero Banner */}
        <div className="comm-hero-banner comm-hero-leaderboard">
          <div className="comm-hero-content">
            <h1 className="comm-hero-title">
              <Trophy size={32} /> Institutional &amp; Stratified Academic Leaderboards
            </h1>
            <p className="comm-hero-desc">
              Normalized institutional performance, leadership rankings, faculty excellence, and student percentiles with cross-curriculum weighting.
            </p>
          </div>
          <div className="comm-hero-actions">
            <button className="comm-hero-btn-glass" onClick={() => setMethodologyOpen(true)}>
              <SlidersHorizontal size={14} /> Ranking &amp; Fairness Methodology
            </button>
            <button className="comm-hero-btn-glass" onClick={() => setPrivacyOpen(true)}>
              <ShieldCheck size={14} /> Privacy &amp; Visibility Settings
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="comm-tabs-bar">
          <button
            className={`comm-tab-pill ${activeTab === 'schools' ? 'active-leaderboard' : ''}`}
            onClick={() => setActiveTab('schools')}
          >
            <Building2 size={16} /> Best Performing Schools
          </button>
          <button
            className={`comm-tab-pill ${activeTab === 'principals' ? 'active-leaderboard' : ''}`}
            onClick={() => setActiveTab('principals')}
          >
            <Award size={16} /> Best Performing Principals
          </button>
          <button
            className={`comm-tab-pill ${activeTab === 'teachers' ? 'active-leaderboard' : ''}`}
            onClick={() => setActiveTab('teachers')}
          >
            <Users size={16} /> Best Performing Teachers
          </button>
          <button
            className={`comm-tab-pill ${activeTab === 'students' ? 'active-leaderboard' : ''}`}
            onClick={() => setActiveTab('students')}
          >
            <Star size={16} /> Best Performing Students
          </button>
        </div>

        {/* Filter Bar */}
        <div className="comm-filter-surface">
          <div className="comm-search-wrap">
            <Search className="comm-search-icon" size={15} />
            <input
              type="text"
              className="comm-input"
              placeholder="Search by city, campus, or region..."
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
            />
          </div>

          <select className="comm-select" value={curriculum} onChange={(e) => setCurriculum(e.target.value)}>
            <option>All Curricula</option>
            <option>Cambridge IGCSE</option>
            <option>British A-Level</option>
            <option>IB MYP / Diploma</option>
            <option>National STEM</option>
            <option>Federal Board</option>
          </select>

          <select className="comm-select" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option>All Countries</option>
            <option>Pakistan</option>
            <option>United Kingdom</option>
            <option>UAE</option>
            <option>Malaysia</option>
          </select>

          <select className="comm-select" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">All Tiers</option>
            <option value="90">90%+ (Distinction)</option>
            <option value="80">80% – 89.9% (Merit)</option>
            <option value="below80">Below 80%</option>
          </select>

          {activeTab === 'schools' && (
            <div className="comm-view-switch">
              <button
                className={`comm-view-switch-btn ${schoolsViewType === 'campuses' ? 'active' : ''}`}
                onClick={() => setSchoolsViewType('campuses')}
              >
                Individual Campuses
              </button>
              <button
                className={`comm-view-switch-btn ${schoolsViewType === 'organisations' ? 'active' : ''}`}
                onClick={() => setSchoolsViewType('organisations')}
              >
                Multi-Branch Organisations
              </button>
            </div>
          )}
        </div>

        {/* Podium Highlight Cards (Top 3 Campuses) */}
        {activeTab === 'schools' && schoolsViewType === 'campuses' && schools.length >= 3 && (
          <div className="comm-podium-grid">
            {/* 1st Place */}
            <div className="comm-podium-card comm-podium-1st" onClick={() => handleOpenSchoolDetail(schools[0].id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Rank #1 Distinction Leader
                  </span>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e1633', margin: '4px 0 2px 0' }}>{schools[0].name}</h3>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{schools[0].campus || `${schools[0].city} Campus`} • {schools[0].country}</div>
                </div>
                <div className="comm-podium-badge-1st">1</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid rgba(251, 191, 36, 0.4)' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Academic Average</div>
                  <div className="comm-mono" style={{ fontSize: 24, fontWeight: 800, color: '#b45309' }}>{schools[0].academic_average}%</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                    {schools[0].rank_delta} National
                  </span>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{schools[0].students_count?.toLocaleString()} Students</div>
                </div>
              </div>
            </div>

            {/* 2nd Place */}
            <div className="comm-podium-card comm-podium-2nd" onClick={() => handleOpenSchoolDetail(schools[1].id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Rank #2 Institutional Merit
                  </span>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e1633', margin: '4px 0 2px 0' }}>{schools[1].name}</h3>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{schools[1].campus || `${schools[1].city} Campus`} • {schools[1].country}</div>
                </div>
                <div className="comm-podium-badge-2nd">2</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Academic Average</div>
                  <div className="comm-mono" style={{ fontSize: 24, fontWeight: 800, color: '#334155' }}>{schools[1].academic_average}%</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#334155', fontWeight: 700 }}>
                    {schools[1].rank_delta}
                  </span>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{schools[1].students_count?.toLocaleString()} Students</div>
                </div>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="comm-podium-card comm-podium-3rd" onClick={() => handleOpenSchoolDetail(schools[2].id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Rank #3 Institutional Merit
                  </span>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#1e1633', margin: '4px 0 2px 0' }}>{schools[2].name}</h3>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{schools[2].campus || `${schools[2].city} Campus`} • {schools[2].country}</div>
                </div>
                <div className="comm-podium-badge-3rd">3</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid rgba(217, 119, 6, 0.2)' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Academic Average</div>
                  <div className="comm-mono" style={{ fontSize: 24, fontWeight: 800, color: '#78350f' }}>{schools[2].academic_average}%</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                    {schools[2].rank_delta}
                  </span>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{schools[2].students_count?.toLocaleString()} Students</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 16, border: '1px solid rgba(254, 230, 133, 0.8)' }}>
            Loading verified rankings from database...
          </div>
        ) : activeTab === 'schools' && schoolsViewType === 'campuses' ? (
          <div className="comm-table-card">
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>School &amp; Campus</th>
                    <th>Principal</th>
                    <th>Curriculum</th>
                    <th>Students</th>
                    <th>Academic Average</th>
                    <th>National Delta</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {schools.map((s, idx) => (
                    <tr key={s.id || idx} onClick={() => handleOpenSchoolDetail(s.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="comm-rank-pill">
                          {s.rank || idx + 1}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1e1633' }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{s.campus || `${s.city} Campus`} • {s.country}</div>
                      </td>
                      <td style={{ color: '#475569' }}>{s.principal_name || 'N/A'}</td>
                      <td>
                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                          {s.curriculum}
                        </span>
                      </td>
                      <td className="comm-tabular">{s.students_count?.toLocaleString()}</td>
                      <td>
                        <strong className="comm-mono" style={{ fontSize: 14, color: s.academic_average >= 90 ? '#c026d3' : '#1e1633' }}>
                          {s.academic_average}%
                        </strong>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: s.rank_delta.startsWith('+') ? '#ecfdf5' : '#fff1f2',
                          color: s.rank_delta.startsWith('+') ? '#047857' : '#e11d48'
                        }}>
                          {s.rank_delta}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#059669', fontWeight: 600, fontSize: 12.5 }}>{s.trend}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'schools' && schoolsViewType === 'organisations' ? (
          <div className="comm-table-card">
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>Organisation / Network Brand</th>
                    <th>Campuses</th>
                    <th>Total Enrollment</th>
                    <th>Curriculum Scope</th>
                    <th>Academic Average</th>
                    <th>Network Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {organisations.map((org, idx) => (
                    <tr key={org.id || idx}>
                      <td>
                        <span className="comm-rank-pill">
                          {org.rank || idx + 1}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1e1633' }}>{org.name}</div>
                      </td>
                      <td>{org.campuses_count} Campuses</td>
                      <td className="comm-tabular">{org.total_students?.toLocaleString()} Students</td>
                      <td>
                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                          {org.curriculum}
                        </span>
                      </td>
                      <td><strong className="comm-mono" style={{ color: '#c026d3' }}>{org.academic_average}%</strong></td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#ecfdf5', color: '#047857' }}>
                          {org.rank_delta}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'principals' ? (
          <div className="comm-table-card">
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>Principal Name</th>
                    <th>Institutional Campus</th>
                    <th>Curriculum</th>
                    <th>Tenure</th>
                    <th>Governance Index</th>
                    <th>Faculty Retention</th>
                  </tr>
                </thead>
                <tbody>
                  {principals.map((p, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="comm-rank-pill">{p.rank}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1e1633' }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{p.city}</div>
                      </td>
                      <td>{p.school}</td>
                      <td>
                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                          {p.curriculum}
                        </span>
                      </td>
                      <td>{p.tenure_years} Years</td>
                      <td><strong className="comm-mono" style={{ color: '#ff6b35', fontSize: 14 }}>{p.institutional_index}</strong> / 100</td>
                      <td><span style={{ color: '#059669', fontWeight: 600 }}>{p.retention_rate}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'teachers' ? (
          <div className="comm-table-card">
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>Teacher &amp; Subject</th>
                    <th>School Affiliation</th>
                    <th>Curriculum</th>
                    <th>Pass Rate</th>
                    <th>Class Average</th>
                    <th>Honors</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="comm-rank-pill">{t.rank}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1e1633' }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{t.subject}</div>
                      </td>
                      <td>{t.school}</td>
                      <td>
                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                          {t.curriculum}
                        </span>
                      </td>
                      <td><span style={{ color: '#059669', fontWeight: 600 }}>{t.pass_rate}</span></td>
                      <td><strong className="comm-mono" style={{ color: '#f43f5e', fontSize: 14 }}>{t.class_average}%</strong></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {t.badges.map((b, bi) => (
                            <span key={bi} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>
                              {b}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="comm-table-card">
            <div className="comm-table-wrap">
              <table className="comm-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Rank</th>
                    <th>Student</th>
                    <th>School &amp; Grade</th>
                    <th>Curriculum</th>
                    <th>Academic Average</th>
                    <th>Global Percentile</th>
                    <th>Olympiad Honors</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="comm-rank-pill">{st.rank}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1e1633' }}>{st.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{st.city}</div>
                      </td>
                      <td>{st.school} • {st.grade}</td>
                      <td>
                        <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                          {st.curriculum}
                        </span>
                      </td>
                      <td><strong className="comm-mono" style={{ color: '#c026d3', fontSize: 14 }}>{st.academic_average}%</strong></td>
                      <td>
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#ecfdf5', color: '#047857', fontWeight: 700 }}>
                          {st.percentile}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {st.badges.map((b, bi) => (
                            <span key={bi} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                              {b}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Methodology Modal */}
        {methodologyOpen && (
          <div className="comm-modal-backdrop" onClick={() => setMethodologyOpen(false)}>
            <div className="comm-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>Ranking &amp; Fairness Methodology</h2>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setMethodologyOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="comm-modal-body">
                <p style={{ color: '#475569', fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
                  The Optimus Orien algorithmic rank engine balances academic excellence, longitudinal improvement, and curriculum difficulty normalization to ensure fair benchmarking across disparate educational boards.
                </p>

                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#1e1633' }}>Weighting Formula</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 24 }}>
                  <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#1e1633' }}>Academic Examination Performance</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Standardized periodic examination marks across cohorts.</div>
                    </div>
                    <span className="comm-mono" style={{ fontSize: 16, fontWeight: 800, color: '#f43f5e' }}>35%</span>
                  </div>
                  <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#1e1633' }}>Academic Progress &amp; Growth</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Longitudinal improvement trajectory and value-add tracking.</div>
                    </div>
                    <span className="comm-mono" style={{ fontSize: 16, fontWeight: 800, color: '#f43f5e' }}>25%</span>
                  </div>
                  <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#1e1633' }}>Curriculum Difficulty Normalisation</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Equipercentile Z-score calibration across Cambridge, IB, and National syllabi.</div>
                    </div>
                    <span className="comm-mono" style={{ fontSize: 16, fontWeight: 800, color: '#f43f5e' }}>15%</span>
                  </div>
                  <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#1e1633' }}>Student Attendance &amp; Engagement</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Verified platform presence and compliance metrics.</div>
                    </div>
                    <span className="comm-mono" style={{ fontSize: 16, fontWeight: 800, color: '#f43f5e' }}>15%</span>
                  </div>
                  <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 13.5, color: '#1e1633' }}>Community &amp; Online Assessment Participation</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Verified participation in online Olympiads and academic drills.</div>
                    </div>
                    <span className="comm-mono" style={{ fontSize: 16, fontWeight: 800, color: '#f43f5e' }}>10%</span>
                  </div>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#1e1633' }}>Fairness Rules</h3>
                <ul style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, paddingLeft: 20 }}>
                  <li><strong>Cohort Size Dampening:</strong> Prevents low-enrollment campuses from skewing ranks artificially.</li>
                  <li><strong>Provisional Threshold:</strong> Campuses with fewer than 3 verified terms carry a Provisional tag.</li>
                  <li><strong>Opt-out Protection:</strong> Fully respects FERPA/GDPR student anonymity settings.</li>
                </ul>

                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <button
                    className="comm-hero-btn-glass"
                    style={{ background: '#f43f5e', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 10, fontWeight: 700 }}
                    onClick={() => setMethodologyOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Privacy Settings Modal */}
        {privacyOpen && (
          <div className="comm-modal-backdrop" onClick={() => setPrivacyOpen(false)}>
            <div className="comm-modal-dialog" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>Privacy &amp; Visibility Settings</h2>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setPrivacyOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="comm-modal-body">
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                  Configure institutional and minor student visibility across national and international boards.
                </p>

                <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#1e1633' }}>Institution Visibility Tier</label>
                <select
                  className="comm-select"
                  style={{ width: '100%', marginBottom: 20 }}
                  value={visibilityTier}
                  onChange={(e) => setVisibilityTier(e.target.value)}
                >
                  <option value="open">Open School (Publicly visible on all boards)</option>
                  <option value="anonymous">Anonymous to Public (Show aggregate stats only)</option>
                  <option value="unlisted">Unlisted (Visible only to direct campus network)</option>
                  <option value="hidden">Hidden (Completely opted out)</option>
                </select>

                <h4 style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 10px 0', color: '#1e1633' }}>Minor Student Safeguards</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showStudentNames}
                    onChange={(e) => setShowStudentNames(e.target.checked)}
                  />
                  <span>Display student full names on public achiever boards (pseudonymize if unchecked)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={publishScores}
                    onChange={(e) => setPublishScores(e.target.checked)}
                  />
                  <span>Publish assessment percentages alongside percentile badges</span>
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                  <button
                    className="comm-cat-pill"
                    onClick={() => setPrivacyOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="comm-btn-connect"
                    style={{ background: 'linear-gradient(105deg, #ff6b35 0%, #f43f5e 100%)', padding: '9px 20px', borderRadius: 10 }}
                    onClick={async () => {
                      await communicationApi.updatePrivacySettings({ visibility_tier: visibilityTier, show_student_names: showStudentNames });
                      notify?.('Privacy settings saved successfully.');
                      setPrivacyOpen(false);
                    }}
                  >
                    Save Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* School Detail Modal */}
        {selectedSchoolId && (
          <div className="comm-modal-backdrop" onClick={() => setSelectedSchoolId(null)}>
            <div className="comm-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="comm-modal-header">
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e1633' }}>{schoolDetail?.name || 'School Profile'}</h2>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{schoolDetail?.campus} • {schoolDetail?.country}</div>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} onClick={() => setSelectedSchoolId(null)}>
                  <X size={20} />
                </button>
              </div>
              <div className="comm-modal-body">
                {detailLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading school details...</div>
                ) : schoolDetail ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                      <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Principal</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#1e1633' }}>{schoolDetail.principal}</div>
                      </div>
                      <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Enrollment</div>
                        <div className="comm-tabular" style={{ fontWeight: 800, fontSize: 14, color: '#1e1633' }}>{schoolDetail.student_count} Students</div>
                      </div>
                      <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Academic Avg</div>
                        <div className="comm-mono" style={{ fontWeight: 800, fontSize: 15, color: '#f43f5e' }}>{schoolDetail.academic_average}%</div>
                      </div>
                      <div style={{ padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.8)', borderRadius: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Consistency</div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#059669' }}>{schoolDetail.consistency_rating}</div>
                      </div>
                    </div>

                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#1e1633' }}>Subject Department Performance</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
                      {Object.entries(schoolDetail.performance_breakdown || {}).map(([subj, score]) => (
                        <div key={subj} style={{ padding: 12, background: '#fff', border: '1px solid rgba(254, 230, 133, 0.75)', borderRadius: 10, textTransform: 'capitalize' }}>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{subj}</div>
                          <div className="comm-mono" style={{ fontWeight: 800, fontSize: 16, color: '#1e1633' }}>{score}%</div>
                        </div>
                      ))}
                    </div>

                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#1e1633' }}>Top Faculty Roster</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                      {schoolDetail.top_faculty?.map((f, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: '#fffdf9', border: '1px solid rgba(254, 230, 133, 0.7)', borderRadius: 10, fontSize: 13 }}>
                          <div><strong style={{ color: '#1e1633' }}>{f.name}</strong> • <span style={{ color: '#64748b' }}>{f.role}</span></div>
                          <span style={{ color: '#f43f5e', fontWeight: 700 }}>{f.distinction_rate} Distinction Rate</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 24, textAlign: 'right' }}>
                      <button
                        className="comm-hero-btn-glass"
                        style={{ background: '#f43f5e', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 10, fontWeight: 700 }}
                        onClick={() => setSelectedSchoolId(null)}
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
