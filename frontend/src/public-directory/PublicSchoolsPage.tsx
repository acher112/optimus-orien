import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, SlidersHorizontal, Map, List, Award, TrendingUp, Sparkles,
  CheckCircle2, ArrowRight, X, Phone, Mail, Building2, MapPin,
  ChevronRight, ArrowUpRight, ShieldCheck, Scale, ExternalLink, RefreshCw, UserRound, Home
} from 'lucide-react';
import { PublicCampusCardData, RevealedContactInfo } from './publicDirectoryTypes';
import DirectoryMap from './DirectoryMap';
import './publicDirectory.css';

interface PublicSchoolsPageProps {
  onNavigate: (path: string) => void;
  authenticated: boolean;
}

export default function PublicSchoolsPage({ onNavigate, authenticated }: PublicSchoolsPageProps) {
  const [campuses, setCampuses] = useState<PublicCampusCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedBoard, setSelectedBoard] = useState('all');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedGender, setSelectedGender] = useState('all');
  const [selectedMedium, setSelectedMedium] = useState('all');
  const [admissionOnly, setAdmissionOnly] = useState(false);
  const [sortBy, setSortBy] = useState('rank');

  // View state: 'list' | 'map'
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Comparison Tray (up to 3 campuses)
  const [comparedCampuses, setComparedCampuses] = useState<PublicCampusCardData[]>([]);

  // Contact Reveal Modal
  const [activeRevealSlug, setActiveRevealSlug] = useState<string | null>(null);
  const [revealedContacts, setRevealedContacts] = useState<Record<string, RevealedContactInfo>>({});
  const [revealing, setRevealing] = useState(false);

  // Available Filter Options from API
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [availableBoards, setAvailableBoards] = useState<string[]>([]);

  // Mobile Filter Sheet Open State
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Fetch directory list from API
  const fetchSchools = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (selectedCountry !== 'all') params.append('country', selectedCountry);
      if (selectedCity !== 'all') params.append('city', selectedCity);
      if (selectedBoard !== 'all') params.append('board', selectedBoard);
      if (selectedLevel !== 'all') params.append('level', selectedLevel);
      if (selectedGender !== 'all') params.append('gender', selectedGender);
      if (selectedMedium !== 'all') params.append('medium', selectedMedium);
      if (admissionOnly) params.append('admission_open', 'true');
      if (sortBy) params.append('sort', sortBy);
      params.append('page_size', '36');

      const res = await fetch(`/api/v1/public/schools/?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load schools directory (${res.status})`);
      }
      const data = await res.json();
      setCampuses(data.results || []);
      if (data.available_cities) setAvailableCities(data.available_cities);
      if (data.available_countries) setAvailableCountries(data.available_countries);
      if (data.available_boards) setAvailableBoards(data.available_boards);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Unable to load school leaderboard at this time.');
    } finally {
      setLoading(false);
    }
  };

  // Sync initial filters from URL query parameters (e.g. from homepage search or city pills)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const q = urlParams.get('q') || urlParams.get('search');
      if (q) setSearchQuery(q);
      const c = urlParams.get('city');
      if (c) setSelectedCity(c);
      const country = urlParams.get('country');
      if (country) setSelectedCountry(country);
    } catch {}
  }, []);

  useEffect(() => {
    fetchSchools();
  }, [selectedCountry, selectedCity, selectedBoard, selectedLevel, selectedGender, selectedMedium, admissionOnly, sortBy]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSchools();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Top 3 for Podium
  const podiumCampuses = useMemo(() => {
    const eligible = campuses.filter((c) => c.is_eligible && c.rank_overall !== null && c.score !== null);
    const sorted = [...eligible].sort((a, b) => (a.rank_overall || 999) - (b.rank_overall || 999));
    if (sorted.length >= 3) return sorted.slice(0, 3);
    const topScored = [...campuses].filter((c) => c.score !== null).sort((a, b) => (b.score || 0) - (a.score || 0));
    if (topScored.length >= 3) return topScored.slice(0, 3);
    if (campuses.length >= 3) return campuses.slice(0, 3);
    return [];
  }, [campuses]);

  // Comparison toggle
  const toggleCompare = (campus: PublicCampusCardData) => {
    setComparedCampuses((prev) => {
      const exists = prev.some((c) => c.slug === campus.slug);
      if (exists) {
        return prev.filter((c) => c.slug !== campus.slug);
      }
      if (prev.length >= 3) {
        alert('You can compare a maximum of 3 campuses simultaneously.');
        return prev;
      }
      return [...prev, campus];
    });
  };

  // Reveal Contact Handler
  const handleRevealContact = async (slug: string) => {
    setActiveRevealSlug(slug);
    if (revealedContacts[slug]) return;

    setRevealing(true);
    try {
      const res = await fetch(`/api/v1/public/schools/${slug}/reveal-contact/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.status === 429) {
        alert('Rate limit exceeded. Please wait a minute before requesting contact details again.');
        return;
      }
      if (!res.ok) throw new Error('Could not retrieve contact details.');
      const data: RevealedContactInfo = await res.json();
      setRevealedContacts((prev) => ({ ...prev, [slug]: data }));
    } catch (err) {
      console.error(err);
    } finally {
      setRevealing(false);
    }
  };

  const getBandClass = (band: string) => {
    switch (band) {
      case 'Outstanding':
        return 'outstanding';
      case 'Strong':
        return 'strong';
      case 'Steady':
        return 'steady';
      case 'Developing':
        return 'developing';
      default:
        return 'unranked';
    }
  };

  return (
    <div className="public-directory-container">
      {/* Top Navbar */}
      <header className="public-dir-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="public-dir-brand"
          >
            <img src="/brand-logo.png" alt="Optimus Orien" className="brand-logo-img" style={{ width: 30, height: 30 }} />
            <span>OPTIMUS <span>ORIEN</span></span>
          </a>
          <nav className="public-dir-nav-links">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="public-dir-nav-link"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Home size={14} />
              <span>Home</span>
            </a>
            <a
              href="/schools"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/schools');
              }}
              className="public-dir-nav-link active"
            >
              Find a School
            </a>
            <a
              href="/schools/methodology"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/schools/methodology');
              }}
              className="public-dir-nav-link"
            >
              Methodology
            </a>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {authenticated ? (
            <button onClick={() => onNavigate('/app')} className="compare-tray-btn">
              Go to Dashboard
            </button>
          ) : (
            <>
              <button
                onClick={() => onNavigate('/login')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--dir-text)',
                  cursor: 'pointer',
                }}
              >
                Sign In
              </button>
              <button onClick={() => onNavigate('/register')} className="compare-tray-btn">
                Register School
              </button>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="public-dir-hero">
        <div className="public-dir-hero-inner">
          <div className="public-dir-hero-eyebrow">
            <ShieldCheck size={14} />
            <span>Verified Academic Performance Directory</span>
          </div>
          <h1 className="public-dir-hero-title">Top Performing Campuses on Optimus Orien</h1>
          <p className="public-dir-hero-subtitle">
            Explore transparent academic rankings calculated directly from participating schools' verified internal
            examination results. Objective, reproducible, and standardized.
          </p>

          {/* Search Box */}
          <div className="public-dir-search-wrap">
            <Search size={20} color="#64748b" />
            <input
              type="text"
              className="public-dir-search-input"
              placeholder="Search by school name, city, or curriculum board..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="public-dir-search-clear">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Animated Top 3 Podium (Shown on default sort when no restrictive search) */}
      {!searchQuery && podiumCampuses.length === 3 && (
        <section className="public-podium-section">
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--dir-primary)', textTransform: 'uppercase' }}>
              Academic Leaders Podium
            </span>
          </div>

          <div className="public-podium-grid">
            {/* Rank 2 (Silver - Left) */}
            <div
              className="podium-card"
              onClick={() => onNavigate(`/schools/${podiumCampuses[1].slug}`)}
            >
              <div className="podium-badge silver">#2</div>
              <h3 style={{ fontSize: '1.1rem', margin: '4px 0', fontWeight: 700 }}>
                {podiumCampuses[1].display_name}
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <MapPin size={12} />
                <span>{[podiumCampuses[1].city, podiumCampuses[1].province, podiumCampuses[1].country].filter(Boolean).join(', ') || 'Registered Campus'}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <UserRound size={12} color="#6366f1" />
                <span>Principal:</span>
                <strong style={{ color: (podiumCampuses[1].principal_name || (podiumCampuses[1].principal_display && podiumCampuses[1].principal_display !== 'Not available yet')) ? '#334155' : '#94a3b8' }}>
                  {podiumCampuses[1].principal_name || podiumCampuses[1].principal_display || 'Not available yet'}
                </strong>
              </div>
              <div className="aqi-pill outstanding" style={{ justifyContent: 'center' }}>
                <Sparkles size={14} />
                <span>Average: {podiumCampuses[1].score !== null ? `${podiumCampuses[1].score}%` : (podiumCampuses[1].average_display || 'Not available yet')}</span>
                <span>• {podiumCampuses[1].band}</span>
              </div>
            </div>

            {/* Rank 1 (Gold - Center, Elevated) */}
            <div
              className="podium-card rank-1"
              onClick={() => onNavigate(`/schools/${podiumCampuses[0].slug}`)}
              style={{ transform: 'translateY(-10px)' }}
            >
              <div className="podium-badge gold">#1</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#d97706', marginBottom: 4 }}>
                ★ HIGHEST PERFORMANCE ★
              </div>
              <h3 style={{ fontSize: '1.25rem', margin: '4px 0', fontWeight: 800 }}>
                {podiumCampuses[0].display_name}
              </h3>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <MapPin size={13} />
                <span>{[podiumCampuses[0].city, podiumCampuses[0].province, podiumCampuses[0].country].filter(Boolean).join(', ') || 'Registered Campus'}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <UserRound size={13} color="#6366f1" />
                <span>Principal:</span>
                <strong style={{ color: (podiumCampuses[0].principal_name || (podiumCampuses[0].principal_display && podiumCampuses[0].principal_display !== 'Not available yet')) ? '#334155' : '#94a3b8' }}>
                  {podiumCampuses[0].principal_name || podiumCampuses[0].principal_display || 'Not available yet'}
                </strong>
              </div>
              <div className="aqi-pill outstanding" style={{ justifyContent: 'center', fontSize: '0.95rem' }}>
                <Award size={16} />
                <span>Average: {podiumCampuses[0].score !== null ? `${podiumCampuses[0].score}%` : (podiumCampuses[0].average_display || 'Not available yet')}</span>
                <span>• {podiumCampuses[0].band}</span>
              </div>
            </div>

            {/* Rank 3 (Bronze - Right) */}
            <div
              className="podium-card"
              onClick={() => onNavigate(`/schools/${podiumCampuses[2].slug}`)}
            >
              <div className="podium-badge bronze">#3</div>
              <h3 style={{ fontSize: '1.1rem', margin: '4px 0', fontWeight: 700 }}>
                {podiumCampuses[2].display_name}
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <MapPin size={12} />
                <span>{[podiumCampuses[2].city, podiumCampuses[2].province, podiumCampuses[2].country].filter(Boolean).join(', ') || 'Registered Campus'}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <UserRound size={12} color="#6366f1" />
                <span>Principal:</span>
                <strong style={{ color: (podiumCampuses[2].principal_name || (podiumCampuses[2].principal_display && podiumCampuses[2].principal_display !== 'Not available yet')) ? '#334155' : '#94a3b8' }}>
                  {podiumCampuses[2].principal_name || podiumCampuses[2].principal_display || 'Not available yet'}
                </strong>
              </div>
              <div className="aqi-pill outstanding" style={{ justifyContent: 'center' }}>
                <Sparkles size={14} />
                <span>Average: {podiumCampuses[2].score !== null ? `${podiumCampuses[2].score}%` : (podiumCampuses[2].average_display || 'Not available yet')}</span>
                <span>• {podiumCampuses[2].band}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Control Bar: Filters, Sorting, and View Mode Toggle */}
      <section className="public-controls-bar">
        <div className="public-filters-row">
          {/* Country Filter */}
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="public-select"
            aria-label="Filter by country"
          >
            <option value="all">All Countries</option>
            {availableCountries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* City Filter */}
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="public-select"
            aria-label="Filter by city"
          >
            <option value="all">All Cities</option>
            {availableCities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Board Filter */}
          <select
            value={selectedBoard}
            onChange={(e) => setSelectedBoard(e.target.value)}
            className="public-select"
            aria-label="Filter by examination board"
          >
            <option value="all">All Boards & Curricula</option>
            {availableBoards.length > 0 ? (
              availableBoards.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))
            ) : (
              <>
                <option value="Cambridge">Cambridge</option>
                <option value="Federal Board">Federal Board</option>
                <option value="Punjab Board">Punjab Board</option>
                <option value="Sindh Board">Sindh Board</option>
                <option value="Edexcel">Edexcel</option>
              </>
            )}
          </select>

          {/* Level Filter */}
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="public-select"
            aria-label="Filter by level"
          >
            <option value="all">All Levels</option>
            <option value="Primary">Primary</option>
            <option value="Middle">Middle</option>
            <option value="Secondary">Secondary</option>
            <option value="Higher Secondary">Higher Secondary</option>
          </select>

          {/* Admission Open Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={admissionOnly}
              onChange={(e) => setAdmissionOnly(e.target.checked)}
            />
            <span>Admission Open</span>
          </label>
        </div>

        {/* Right Controls: Sort & View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="public-select"
            aria-label="Sort campuses"
          >
            <option value="rank">Sort by: Performance Rank</option>
            <option value="improved">Sort by: Most Improved (Delta)</option>
            <option value="score">Sort by: AQI Score</option>
            <option value="name">Sort by: School Name (A-Z)</option>
          </select>

          <div className="view-toggle-group">
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="List view"
            >
              <List size={16} />
              <span>List</span>
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')}
              aria-label="Map view"
            >
              <Map size={16} />
              <span>Map</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area: List vs Map */}
      <main style={{ paddingBottom: 100 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
            <div>Loading verified campus performance data...</div>
          </div>
        ) : error ? (
          <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, textAlign: 'center', background: '#fef2f2', borderRadius: 12, border: '1px solid #fee2e2' }}>
            <h3 style={{ color: '#b91c1c', margin: '0 0 8px 0' }}>Unable to load directory</h3>
            <p style={{ color: '#7f1d1d', fontSize: '0.9rem' }}>{error}</p>
            <button onClick={fetchSchools} className="compare-tray-btn" style={{ marginTop: 12 }}>
              Try Again
            </button>
          </div>
        ) : campuses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', maxWidth: 500, margin: '0 auto' }}>
            <Building2 size={48} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 700 }}>No campuses listed yet in this area</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 20 }}>
              Try clearing your search query or selecting a different country or board filter.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCountry('all');
                setSelectedCity('all');
                setSelectedBoard('all');
                setSelectedLevel('all');
                setAdmissionOnly(false);
              }}
              className="compare-tray-btn"
            >
              Reset Filters
            </button>
          </div>
        ) : viewMode === 'map' ? (
          <DirectoryMap
            campuses={campuses}
            onSelectCampus={(slug) => onNavigate(`/schools/${slug}`)}
          />
        ) : (
          <div className="public-cards-grid">
            {campuses.map((campus) => {
              const isCompared = comparedCampuses.some((c) => c.slug === campus.slug);

              return (
                <article key={campus.slug} className="campus-card">
                  <div className="campus-card-header">
                    <img
                      src={campus.logo_url || 'https://placehold.co/52x52/1e293b/ffffff?text=OO'}
                      alt={`${campus.display_name} logo`}
                      className="campus-logo"
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {campus.rank_overall !== null ? (
                          <span className="campus-rank-tag">
                            Rank #{campus.rank_overall}
                          </span>
                        ) : campus.rank_tier ? (
                          <span className="campus-rank-tag">{campus.rank_tier}</span>
                        ) : null}

                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: '0.72rem',
                            color: '#059669',
                            fontWeight: 600,
                          }}
                        >
                          <CheckCircle2 size={12} />
                          Verified
                        </span>
                      </div>

                      <h3 className="campus-name" title={campus.display_name}>
                        {campus.display_name}
                      </h3>

                      <div className="campus-location" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <MapPin size={12} />
                        <span>
                          {[campus.city, campus.province, campus.country].filter(Boolean).join(', ') || campus.location_display || 'Registered Campus'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Campus Principal (always displayed with explicit fallback) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#64748b', marginTop: 8, marginBottom: 6 }}>
                    <UserRound size={13} color="#6366f1" />
                    <span>Principal:</span>
                    <strong style={{ color: (campus.principal_name || (campus.principal_display && campus.principal_display !== 'Not available yet')) ? '#334155' : '#94a3b8' }}>
                      {campus.principal_name || campus.principal_display || 'Not available yet'}
                    </strong>
                  </div>

                  {campus.tagline && (
                    <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                      "{campus.tagline}"
                    </p>
                  )}

                  {/* Academic Average & Performance Band Metric Block */}
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', margin: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.02em' }}>
                        Academic Average
                      </span>
                      <strong style={{ fontSize: '1.05rem', color: campus.score !== null ? '#0f172a' : '#64748b' }}>
                        {campus.score !== null ? `${campus.score}%` : (campus.average_display || 'Not available yet')}
                      </strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.02em' }}>
                        Performance Band
                      </span>
                      <span className={`aqi-pill ${getBandClass(campus.band)}`} style={{ padding: '3px 8px', fontSize: '0.76rem', display: 'inline-flex', marginTop: 2 }}>
                        <Sparkles size={11} style={{ marginRight: 3 }} />
                        {campus.band}
                      </span>
                    </div>
                  </div>

                  {campus.score_delta !== null && campus.score_delta !== undefined && (
                    <div
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: campus.score_delta >= 0 ? '#059669' : '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        marginBottom: 6,
                      }}
                      title="Change compared to previous academic term"
                    >
                      <TrendingUp size={13} />
                      <span>{campus.score_delta >= 0 ? `+${campus.score_delta}` : campus.score_delta} pp vs previous term</span>
                    </div>
                  )}

                  {/* Boards & Admission Status */}
                  <div className="tag-list">
                    {campus.boards.slice(0, 3).map((b) => (
                      <span key={b} className="tag-badge">
                        {b}
                      </span>
                    ))}
                    {campus.levels.slice(0, 2).map((lvl) => (
                      <span key={lvl} className="tag-badge" style={{ background: '#f8fafc' }}>
                        {lvl}
                      </span>
                    ))}
                    {campus.admission_status === 'open' && (
                      <span className="admission-badge open">Admissions Open</span>
                    )}
                  </div>

                  {/* Card Action Buttons */}
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: 16,
                      borderTop: '1px solid var(--dir-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <button
                      onClick={() => toggleCompare(campus)}
                      style={{
                        background: isCompared ? '#eef2ff' : 'none',
                        border: isCompared ? '1px solid #c7d2fe' : '1px solid var(--dir-border)',
                        color: isCompared ? 'var(--dir-primary)' : 'var(--dir-text-muted)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Scale size={13} />
                      <span>{isCompared ? 'Compared' : 'Compare'}</span>
                    </button>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => handleRevealContact(campus.slug)}
                        style={{
                          background: 'none',
                          border: '1px solid var(--dir-border)',
                          borderRadius: 6,
                          padding: '6px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: 'var(--dir-text)',
                          cursor: 'pointer',
                        }}
                      >
                        Contact
                      </button>

                      <button
                        onClick={() => onNavigate(`/schools/${campus.slug}`)}
                        className="compare-tray-btn"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        <span>Profile</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Compare Tray (when campuses selected) */}
      {comparedCampuses.length > 0 && (
        <div className="compare-tray">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scale size={18} color="#818cf8" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
              Compare ({comparedCampuses.length}/3)
            </span>
          </div>

          <div className="compare-tray-items">
            {comparedCampuses.map((c) => (
              <div key={c.slug} className="compare-tray-chip">
                <span>{c.display_name.slice(0, 16)}...</span>
                <button
                  onClick={() => toggleCompare(c)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                  aria-label={`Remove ${c.display_name} from compare`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {comparedCampuses.length >= 2 ? (
            <button
              onClick={() => {
                const slugs = comparedCampuses.map((c) => c.slug).join(',');
                onNavigate(`/schools/compare?slugs=${slugs}`);
              }}
              className="compare-tray-btn"
            >
              Compare Now
            </button>
          ) : (
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Select at least 1 more
            </span>
          )}
        </div>
      )}

      {/* Contact Reveal Modal */}
      {activeRevealSlug && (
        <div className="public-modal-backdrop" onClick={() => setActiveRevealSlug(null)}>
          <div className="public-modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Campus Contact Information</h3>
              <button
                onClick={() => setActiveRevealSlug(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {revealing ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                <div style={{ fontSize: '0.88rem', color: '#64748b' }}>Securely revealing verified contacts...</div>
              </div>
            ) : revealedContacts[activeRevealSlug] ? (
              <div>
                {revealedContacts[activeRevealSlug].official_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dir-primary)' }}>
                      <Phone size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Official Phone</div>
                      <a href={`tel:${revealedContacts[activeRevealSlug].official_phone}`} style={{ fontWeight: 700, color: 'var(--dir-text)' }}>
                        {revealedContacts[activeRevealSlug].official_phone}
                      </a>
                    </div>
                  </div>
                )}

                {revealedContacts[activeRevealSlug].official_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dir-primary)' }}>
                      <Mail size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Official Email</div>
                      <a href={`mailto:${revealedContacts[activeRevealSlug].official_email}`} style={{ fontWeight: 700, color: 'var(--dir-text)' }}>
                        {revealedContacts[activeRevealSlug].official_email}
                      </a>
                    </div>
                  </div>
                )}

                {revealedContacts[activeRevealSlug].principal_direct_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                      <Phone size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>Principal Direct Phone (Consented)</div>
                      <a href={`tel:${revealedContacts[activeRevealSlug].principal_direct_phone}`} style={{ fontWeight: 700, color: 'var(--dir-text)' }}>
                        {revealedContacts[activeRevealSlug].principal_direct_phone}
                      </a>
                    </div>
                  </div>
                )}

                {revealedContacts[activeRevealSlug].principal_direct_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                      <Mail size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>Principal Direct Email (Consented)</div>
                      <a href={`mailto:${revealedContacts[activeRevealSlug].principal_direct_email}`} style={{ fontWeight: 700, color: 'var(--dir-text)' }}>
                        {revealedContacts[activeRevealSlug].principal_direct_email}
                      </a>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 20, textAlign: 'center' }}>
                  <button
                    onClick={() => {
                      const slug = activeRevealSlug;
                      setActiveRevealSlug(null);
                      onNavigate(`/schools/${slug}`);
                    }}
                    className="compare-tray-btn"
                    style={{ width: '100%' }}
                  >
                    Open Full Profile & Enquiry Form
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
                This campus prefers communication through their official parent enquiry form.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
