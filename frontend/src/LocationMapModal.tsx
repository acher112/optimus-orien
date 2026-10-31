import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Navigation, Check, X, Loader2, Globe } from 'lucide-react';

interface LocationMapModalProps {
  currentLocation: string;
  onClose: () => void;
  onSelect: (location: string, coords?: { lat: number; lng: number }) => void;
}

const PRESET_CITIES = [
  { name: 'Karachi', lat: 24.8607, lng: 67.0011, label: 'Karachi, Sindh, Pakistan' },
  { name: 'Lahore', lat: 31.5204, lng: 74.3587, label: 'Lahore, Punjab, Pakistan' },
  { name: 'Islamabad', lat: 33.6844, lng: 73.0479, label: 'Islamabad, ICT, Pakistan' },
  { name: 'Rawalpindi', lat: 33.5651, lng: 73.0169, label: 'Rawalpindi, Punjab, Pakistan' },
  { name: 'Faisalabad', lat: 31.4504, lng: 73.1350, label: 'Faisalabad, Punjab, Pakistan' },
  { name: 'Peshawar', lat: 34.0151, lng: 71.5249, label: 'Peshawar, KP, Pakistan' },
  { name: 'Quetta', lat: 30.1798, lng: 66.9750, label: 'Quetta, Balochistan, Pakistan' },
  { name: 'Multan', lat: 30.1575, lng: 71.5249, label: 'Multan, Punjab, Pakistan' },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708, label: 'Dubai, UAE' },
  { name: 'London', lat: 51.5074, lng: -0.1278, label: 'London, UK' },
];

export default function LocationMapModal({ currentLocation, onClose, onSelect }: LocationMapModalProps) {
  const [query, setQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(currentLocation || 'Karachi, Sindh, Pakistan');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 24.8607, lng: 67.0011 });
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [locating, setLocating] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Reverse geocode lat, lng into human readable location name
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) throw new Error('Geocode failed');
      const data = await res.json();
      if (data && data.display_name) {
        const parts = data.display_name.split(', ');
        // Extract 3-4 most concise parts (suburb/area, city/town, state, country)
        const cleanName = parts.slice(0, 4).join(', ');
        setSelectedLocation(cleanName || data.display_name);
      } else {
        setSelectedLocation(`Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      }
    } catch {
      setSelectedLocation(`Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    }
  };

  // Search forward geocoding
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (item: { display_name: string; lat: string; lon: string }) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setCoords({ lat, lng });
    const parts = item.display_name.split(', ');
    const cleanName = parts.slice(0, 4).join(', ');
    setSelectedLocation(cleanName || item.display_name);
    setSearchResults([]);
    setQuery('');

    if (leafletMapRef.current && markerRef.current) {
      leafletMapRef.current.setView([lat, lng], 14);
      markerRef.current.setLatLng([lat, lng]);
    }
  };

  const handleSelectPreset = (city: typeof PRESET_CITIES[0]) => {
    setCoords({ lat: city.lat, lng: city.lng });
    setSelectedLocation(city.label);
    setSearchResults([]);
    if (leafletMapRef.current && markerRef.current) {
      leafletMapRef.current.setView([city.lat, city.lng], 14);
      markerRef.current.setLatLng([city.lat, city.lng]);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        reverseGeocode(latitude, longitude);
        if (leafletMapRef.current && markerRef.current) {
          leafletMapRef.current.setView([latitude, longitude], 15);
          markerRef.current.setLatLng([latitude, longitude]);
        }
      },
      (err) => {
        setLocating(false);
        alert('Could not obtain your location. You can search or click on the map directly.');
      },
      { timeout: 10000 }
    );
  };

  // Initialize Leaflet Map
  useEffect(() => {
    let isMounted = true;

    const setupMap = () => {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current || !isMounted) return;

      if (!leafletMapRef.current) {
        const map = L.map(mapContainerRef.current).setView([coords.lat, coords.lng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        // Custom icon for clarity
        const marker = L.marker([coords.lat, coords.lng], {
          draggable: true
        }).addTo(map);

        marker.on('dragend', (e: any) => {
          const pos = e.target.getLatLng();
          setCoords({ lat: pos.lat, lng: pos.lng });
          reverseGeocode(pos.lat, pos.lng);
        });

        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
          setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
          reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        leafletMapRef.current = map;
        markerRef.current = marker;

        setTimeout(() => {
          if (leafletMapRef.current) leafletMapRef.current.invalidateSize();
        }, 250);
      }
    };

    if (!(window as any).L) {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        if (isMounted) setupMap();
      };
      document.body.appendChild(script);
    } else {
      setupMap();
    }

    return () => {
      isMounted = false;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  const handleConfirm = () => {
    onSelect(selectedLocation, coords);
    onClose();
  };

  return (
    <div className="map-modal-backdrop" onClick={onClose}>
      <div className="map-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="map-modal-header">
          <div>
            <h3>
              <MapPin size={20} className="map-title-icon" /> Select Campus Location
            </h3>
            <p>Click on the map, drag the pin, or search below to pick your school location.</p>
          </div>
          <button type="button" className="map-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="map-search-bar-wrap">
          <form className="map-search-form" onSubmit={handleSearch}>
            <div className="map-input-with-icon">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search city, area, street (e.g. Clifton Karachi, F-7 Islamabad)..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <button type="submit" className="map-search-btn" disabled={searching || !query.trim()}>
              {searching ? <Loader2 size={15} className="spin" /> : 'Search'}
            </button>
          </form>

          <button
            type="button"
            className="map-locate-btn"
            onClick={handleUseCurrentLocation}
            disabled={locating}
            title="Locate my device position"
          >
            {locating ? <Loader2 size={15} className="spin" /> : <Navigation size={15} />}
            <span>My current location</span>
          </button>
        </div>

        {/* Search suggestions dropdown */}
        {searchResults.length > 0 && (
          <div className="map-search-results">
            {searchResults.map((r, i) => (
              <button
                key={i}
                type="button"
                className="map-search-result-item"
                onClick={() => handleSelectSearchResult(r)}
              >
                <MapPin size={14} />
                <span>{r.display_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick city presets */}
        <div className="map-city-presets">
          <span className="presets-label">Quick select:</span>
          <div className="presets-chips">
            {PRESET_CITIES.map(c => (
              <button
                key={c.name}
                type="button"
                className="preset-chip"
                onClick={() => handleSelectPreset(c)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Map View Canvas */}
        <div className="map-render-wrapper">
          <div ref={mapContainerRef} className="map-leaflet-box" />
        </div>

        {/* Selected Location Summary & Confirm */}
        <div className="map-modal-footer">
          <div className="selected-location-summary">
            <span className="summary-label">Selected Location:</span>
            <strong className="summary-val">{selectedLocation || 'No location selected yet'}</strong>
            <small className="summary-coords">
              Lat: {coords.lat.toFixed(5)}, Lng: {coords.lng.toFixed(5)}
            </small>
          </div>

          <div className="map-footer-actions">
            <button type="button" className="map-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="map-btn-confirm"
              onClick={handleConfirm}
              disabled={!selectedLocation.trim()}
            >
              <Check size={16} /> Okay, Select Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
