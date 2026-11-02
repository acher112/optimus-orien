import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Check, Plus } from 'lucide-react';
import { ALL_CURRICULA } from './CurriculumSelect';

interface CurriculumSingleSelectProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function CurriculumSingleSelect({
  value,
  onChange,
  placeholder = 'Select curriculum or type to search…',
  required = false
}: CurriculumSingleSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize searchTerm with value when closed
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm(value || '');
    }
  }, [value, isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter curricula based on search query
  const filteredCurricula = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return ALL_CURRICULA;
    return ALL_CURRICULA.filter(c => c.toLowerCase().includes(q));
  }, [searchTerm]);

  const handleSelect = (curriculum: string) => {
    onChange(curriculum);
    setSearchTerm(curriculum);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
    if (inputRef.current) inputRef.current.focus();
  };

  const handleCustomSelect = () => {
    const custom = searchTerm.trim();
    if (custom) {
      onChange(custom);
      setIsOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCurricula.length > 0 && searchTerm.trim().toLowerCase() === filteredCurricula[0].toLowerCase()) {
        handleSelect(filteredCurricula[0]);
      } else if (searchTerm.trim()) {
        handleCustomSelect();
      }
    } else if (e.key === 'ArrowDown') {
      if (!isOpen) setIsOpen(true);
    }
  };

  const isExactMatch = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return ALL_CURRICULA.some(c => c.toLowerCase() === q);
  }, [searchTerm]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        marginTop: 9
      }}
    >
      {/* Input container */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%'
        }}
      >
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: 12,
            color: '#94a3b8',
            pointerEvents: 'none'
          }}
        />

        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          placeholder={placeholder}
          required={required && !value}
          onFocus={() => setIsOpen(true)}
          onChange={e => {
            setSearchTerm(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '11px 64px 11px 36px',
            fontSize: 13,
            borderRadius: 9,
            border: isOpen ? '1px solid #7d69e4' : '1px solid #e4e7f0',
            boxShadow: isOpen ? '0 0 0 3px rgba(125, 105, 228, 0.15)' : 'none',
            outline: 'none',
            background: '#ffffff',
            color: '#2a3148',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s, box-shadow 0.2s'
          }}
        />

        {/* Clear & Toggle Icons */}
        <div
          style={{
            position: 'absolute',
            right: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}
        >
          {searchTerm && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear selection"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                borderRadius: '50%'
              }}
            >
              <X size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            title="Toggle list"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8'
            }}
          >
            <ChevronDown
              size={16}
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s'
              }}
            />
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            maxHeight: 250,
            overflowY: 'auto',
            padding: '4px 0'
          }}
        >
          {/* Custom typed option if not exact match */}
          {searchTerm.trim() && !isExactMatch && (
            <div
              onClick={handleCustomSelect}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: '#6366f1',
                background: '#f5f3ff',
                borderBottom: '1px solid #ede9fe'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#ede9fe')}
              onMouseLeave={e => (e.currentTarget.style.background = '#f5f3ff')}
            >
              <Plus size={15} />
              <span>Use custom: <strong>"{searchTerm.trim()}"</strong></span>
            </div>
          )}

          {/* Filtered list of curricula */}
          {filteredCurricula.length > 0 ? (
            filteredCurricula.map(curriculum => {
              const isSelected = value === curriculum;
              return (
                <div
                  key={curriculum}
                  onClick={() => handleSelect(curriculum)}
                  style={{
                    padding: '8px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected ? '#f0fdf4' : 'transparent',
                    color: isSelected ? '#15803d' : '#334155',
                    fontWeight: isSelected ? 700 : 500,
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>{curriculum}</span>
                  {isSelected && <Check size={15} color="#16a34a" />}
                </div>
              );
            })
          ) : (
            <div
              style={{
                padding: '14px',
                fontSize: 12,
                color: '#64748b',
                textAlign: 'center'
              }}
            >
              No standard curriculum matching "{searchTerm}". Press Enter or click above to use custom curriculum.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
