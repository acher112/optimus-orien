import React, { useEffect, useState, useRef, useTransition } from 'react';
import { Search, SlidersHorizontal, X, RotateCcw, Calendar } from 'lucide-react';

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
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchPlaceholder = 'Search records...',
  searchField = 'q',
  filters = [],
  values,
  onChange,
  onClear,
  syncWithUrl = false,
  className = ''
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
    // Preserve existing non-filter query parameters if needed
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
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-2.5 bg-white dark:bg-slate-900/90 p-2.5 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-sm transition-all">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5 rounded-md transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dynamic Filter Dropdowns */}
        {filters.map(filter => {
          const currentVal = values[filter.key] ?? '';
          if (filter.type === 'date') {
            return (
              <div key={filter.key} className="relative min-w-[140px]">
                <Calendar className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={currentVal}
                  onChange={e => handleFilterChange(filter.key, e.target.value)}
                  className="w-full pl-8 pr-2 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            );
          }

          return (
            <div key={filter.key} className="relative min-w-[130px]">
              <select
                value={currentVal}
                onChange={e => handleFilterChange(filter.key, e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium cursor-pointer"
              >
                <option value="">{filter.placeholder || `All ${filter.label}`}</option>
                {filter.options?.map(opt => (
                  <option key={String(opt.value)} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <SlidersHorizontal className="w-3 h-3" />
              </div>
            </div>
          );
        })}

        {/* Clear Filters Button */}
        {activeEntries.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg transition-colors border border-rose-200/80 dark:border-rose-900/60 ml-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset filters</span>
          </button>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mr-1">Active:</span>
          {activeEntries.map(([k, v]) => {
            const filterDef = filters.find(f => f.key === k);
            let displayVal = String(v);
            if (filterDef && filterDef.options) {
              const opt = filterDef.options.find(o => String(o.value) === String(v));
              if (opt) displayVal = opt.label;
            }
            const label = k === searchField ? 'Search' : (filterDef?.label || k);
            return (
              <span
                key={k}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 animate-fadeIn"
              >
                <span>{label}: <strong>{displayVal}</strong></span>
                <button
                  type="button"
                  onClick={() => handleFilterChange(k, '')}
                  className="hover:text-indigo-900 dark:hover:text-indigo-100 p-0.5 rounded-sm hover:bg-indigo-200/50 dark:hover:bg-indigo-800/50 transition-colors"
                >
                  <X className="w-3 h-3" />
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
