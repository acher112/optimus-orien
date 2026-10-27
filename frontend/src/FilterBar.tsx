import React, { useEffect, useState, useRef, useTransition } from 'react';
import { Search, ChevronDown, X, RotateCcw, Calendar } from 'lucide-react';
import './filterbar.css';

export interface FilterOption {
  label: string;
  value: string | number;
}

export interface FilterConfig {
  key: string;
  label: string;
  type?: 'select' | 'date';
  options?: FilterOption[];
  placeholder?: string;
}

export interface FilterBarProps {
  searchPlaceholder?: string;
  searchField?: string;
  filters?: FilterConfig[];
  values: Record<string, any>;
  onChange: (newValues: Record<string, any>) => void;
  onClear?: () => void;
  syncWithUrl?: boolean;
  className?: string;
  rightActions?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchPlaceholder = 'Search records...',
  searchField = 'q',
  filters = [],
  values,
  onChange,
  onClear,
  syncWithUrl = false,
  className = '',
  rightActions
}) => {
  const [searchTerm, setSearchTerm] = useState<string>(values[searchField] || '');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [, startTransition] = useTransition();

  // Sync internal search state when values prop changes from outside
  useEffect(() => {
    setSearchTerm(values[searchField] || '');
  }, [values[searchField]]);

  // Debounce search input by 300ms
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      startTransition(() => {
        const next = { ...values, [searchField]: val.trim() || undefined };
        if (!val.trim()) delete next[searchField];
        onChange(next);
        if (syncWithUrl && typeof window !== 'undefined') {
          syncToUrl(next);
        }
      });
    }, 300);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const next = { ...values };
    delete next[searchField];
    onChange(next);
    if (syncWithUrl && typeof window !== 'undefined') {
      syncToUrl(next);
    }
  };

  const handleFilterChange = (key: string, val: any) => {
    const next = { ...values };
    if (val === '' || val === undefined || val === null || val === 'all') {
      delete next[key];
    } else {
      next[key] = val;
    }
    onChange(next);
    if (syncWithUrl && typeof window !== 'undefined') {
      syncToUrl(next);
    }
  };

  const handleClearAll = () => {
    setSearchTerm('');
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (onClear) {
      onClear();
    } else {
      onChange({});
    }
    if (syncWithUrl && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    }
  };

  const syncToUrl = (params: Record<string, any>) => {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      } else {
        url.searchParams.delete(k);
      }
    }
    window.history.replaceState({}, '', url.toString());
  };

  // Determine active filters
  const activeEntries = Object.entries(values).filter(([k, v]) => {
    return v !== undefined && v !== null && v !== '' && v !== 'all';
  });

  return (
    <div className={`filter-bar-wrap ${className}`}>
      <div className="filter-bar-main">
        {/* Controls: Search + Dynamic Filters + Reset */}
        <div className="filter-bar-controls">
          {/* Search Input Box */}
          <div className="filter-search-box">
            <span className="filter-search-icon">
              <Search size={15} />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder={searchPlaceholder}
              className="filter-search-input"
              aria-label={searchPlaceholder}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="filter-search-clear"
                title="Clear search"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Dynamic Filter Dropdowns */}
          {filters.map(filter => {
            const currentVal = values[filter.key] ?? '';
            if (filter.type === 'date') {
              return (
                <div key={filter.key} className="filter-date-wrap">
                  <span className="filter-date-icon">
                    <Calendar size={13} />
                  </span>
                  <input
                    type="date"
                    value={currentVal}
                    onChange={e => handleFilterChange(filter.key, e.target.value)}
                    className="filter-date-input"
                    aria-label={filter.label}
                  />
                </div>
              );
            }

            return (
              <div key={filter.key} className="filter-select-wrap">
                <select
                  value={currentVal}
                  onChange={e => handleFilterChange(filter.key, e.target.value)}
                  className="filter-select"
                  aria-label={filter.label}
                >
                  <option value="">{filter.placeholder || `All ${filter.label}`}</option>
                  {filter.options?.map(opt => (
                    <option key={String(opt.value)} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="filter-select-arrow">
                  <ChevronDown size={14} />
                </div>
              </div>
            );
          })}

          {/* Reset Filters Button */}
          {activeEntries.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="filter-reset-btn"
              title="Reset all filters"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Optional Right Actions (e.g. Refresh, Export, Count) */}
        {rightActions && (
          <div className="filter-bar-actions">
            {rightActions}
          </div>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeEntries.length > 0 && (
        <div className="filter-chips-row">
          <span className="filter-chips-label">Active:</span>
          {activeEntries.map(([k, v]) => {
            const filterDef = filters.find(f => f.key === k);
            let displayVal = String(v);
            if (filterDef && filterDef.options) {
              const opt = filterDef.options.find(o => String(o.value) === String(v));
              if (opt) displayVal = opt.label;
            }
            const label = k === searchField ? 'Search' : (filterDef?.label || k);
            return (
              <span key={k} className="filter-chip">
                <span>{label}: <strong>{displayVal}</strong></span>
                <button
                  type="button"
                  onClick={() => handleFilterChange(k, '')}
                  className="filter-chip-remove"
                  title={`Remove ${label} filter`}
                  aria-label={`Remove ${label} filter`}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FilterBar;
