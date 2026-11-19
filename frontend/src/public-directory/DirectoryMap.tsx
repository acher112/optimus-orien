import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MapPin, Navigation, Plus, Minus, X, ExternalLink, Award, Sparkles, UserRound } from 'lucide-react';
import { PublicCampusCardData } from './publicDirectoryTypes';

interface DirectoryMapProps {
  campuses: PublicCampusCardData[];
  onSelectCampus: (slug: string) => void;
}

export default function DirectoryMap({ campuses, onSelectCampus }: DirectoryMapProps) {
  const [selectedCampus, setSelectedCampus] = useState<PublicCampusCardData | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter campuses that have valid latitude and longitude
  const geoCampuses = useMemo(() => {
    return campuses.filter(
      (c) => c.latitude !== null && c.longitude !== null && !isNaN(c.latitude) && !isNaN(c.longitude)
    );
  }, [campuses]);

  // Compute bounding box for projection
  const bounds = useMemo(() => {
    if (!geoCampuses.length) {
      return { minLat: 20, maxLat: 55, minLng: -5, maxLng: 80 };
    }
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    geoCampuses.forEach((c) => {
      const lat = c.latitude!;
      const lng = c.longitude!;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });
    // Add margin
    const latSpan = Math.max(maxLat - minLat, 5);
    const lngSpan = Math.max(maxLng - minLng, 5);
    return {
      minLat: minLat - latSpan * 0.15,
      maxLat: maxLat + latSpan * 0.15,
      minLng: minLng - lngSpan * 0.15,
      maxLng: maxLng + lngSpan * 0.15,
    };
  }, [geoCampuses]);

  // Coordinate projection from (lat, lng) to canvas percentage (x, y)
  const projectCoords = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
    return { x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) };
  };

  const getPinColor = (band: string) => {
    switch (band) {
      case 'Outstanding':
        return '#059669'; // Emerald
      case 'Strong':
        return '#2563eb'; // Blue
      case 'Steady':
        return '#d97706'; // Amber
      case 'Developing':
        return '#7c3aed'; // Purple
      default:
        return '#64748b'; // Slate
    }
  };

  // Dragging handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.map-pin-btn') || (e.target as HTMLElement).closest('.map-popup')) {
      return;
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedCampus(null);
  };

  return (
    <div className="directory-map-container" style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        className="directory-map-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          backgroundColor: '#f1f5f9',
          backgroundImage:
            'radial-gradient(#cbd5e1 1px, transparent 1px), radial-gradient(#e2e8f0 1px, #f8fafc 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0, 12px 12px',
        }}
      >
        {/* Transform layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          {geoCampuses.map((campus) => {
            const { x, y } = projectCoords(campus.latitude!, campus.longitude!);
            const pinColor = getPinColor(campus.band);
            const isSelected = selectedCampus?.slug === campus.slug;

            return (
              <div
                key={campus.slug}
                className="map-pin-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCampus(campus);
                }}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: 'translate(-50%, -100%)',
                  cursor: 'pointer',
                  zIndex: isSelected ? 30 : 10,
                  transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    transform: isSelected ? 'scale(1.25)' : 'scale(1)',
                    filter: isSelected
                      ? 'drop-shadow(0 6px 12px rgba(0,0,0,0.3))'
                      : 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
                  }}
                >
                  {/* Pin Head */}
                  <div
                    style={{
                      background: pinColor,
                      color: '#ffffff',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                      border: '2px solid #ffffff',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <MapPin size={12} />
                    {campus.score !== null ? `${campus.score}%` : campus.display_name.slice(0, 14)}
                  </div>
                  {/* Pin Tail */}
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: `6px solid ${pinColor}`,
                      marginTop: -1,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Campus Popup Card */}
        {selectedCampus && (
          <div
            className="map-popup"
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              width: 320,
              maxWidth: 'calc(100% - 40px)',
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid var(--dir-border)',
              boxShadow: '0 16px 36px -6px rgba(15, 23, 42, 0.2)',
              padding: 16,
              zIndex: 40,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <img
                  src={selectedCampus.logo_url || 'https://placehold.co/44x44/1e293b/ffffff?text=OO'}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }}
                />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                    {selectedCampus.display_name}
                  </h4>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    {[selectedCampus.city, selectedCampus.province, selectedCampus.country].filter(Boolean).join(', ') || selectedCampus.location_display || 'Registered Campus'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedCampus(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                aria-label="Close popup"
              >
                <X size={16} />
              </button>
            </div>

            {/* Principal Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#64748b', margin: '6px 0 10px 0' }}>
              <UserRound size={13} color="#6366f1" />
              <span>Principal:</span>
              <strong style={{ color: (selectedCampus.principal_name || (selectedCampus.principal_display && selectedCampus.principal_display !== 'Not available yet')) ? '#334155' : '#94a3b8' }}>
                {selectedCampus.principal_name || selectedCampus.principal_display || 'Not available yet'}
              </strong>
            </div>

            {/* Academic Average and Performance */}
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', margin: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Academic Average</span>
                <strong style={{ fontSize: '1rem', color: selectedCampus.score !== null ? '#0f172a' : '#64748b' }}>
                  {selectedCampus.score !== null ? `${selectedCampus.score}%` : (selectedCampus.average_display || 'Not available yet')}
                </strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Performance</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: getPinColor(selectedCampus.band) }}>
                  {selectedCampus.band}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {selectedCampus.boards.slice(0, 2).map((b) => (
                <span key={b} className="tag-badge">
                  {b}
                </span>
              ))}
              {selectedCampus.admission_status === 'open' && (
                <span className="admission-badge open">Admissions Open</span>
              )}
            </div>

            <button
              onClick={() => onSelectCampus(selectedCampus.slug)}
              className="compare-tray-btn"
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
            >
              <span>View Full Campus Profile</span>
              <ExternalLink size={14} />
            </button>
          </div>
        )}

        {/* Zoom & Navigation Controls */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            zIndex: 20,
          }}
        >
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.3))}
            style={{
              background: '#ffffff',
              border: '1px solid var(--dir-border)',
              borderRadius: 8,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
            }}
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.7, z - 0.3))}
            style={{
              background: '#ffffff',
              border: '1px solid var(--dir-border)',
              borderRadius: 8,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
            }}
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={handleReset}
            style={{
              background: '#ffffff',
              border: '1px solid var(--dir-border)',
              borderRadius: 8,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
            }}
            title="Reset Map View"
            aria-label="Reset map"
          >
            <Navigation size={15} />
          </button>
        </div>

        {/* Legend */}
        <div className="map-legend">
          <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 2 }}>Academic Quality Index Bands</div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#059669' }} />
            <span>Outstanding (≥ 80.00%)</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#2563eb' }} />
            <span>Strong (70.00% – 79.99%)</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#d97706' }} />
            <span>Steady (60.00% – 69.99%)</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#7c3aed' }} />
            <span>Developing (50.00% – 59.99%)</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#64748b' }} />
            <span>Not ranked yet (insufficient data)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
