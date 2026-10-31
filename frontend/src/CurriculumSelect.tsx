import React, { useState, useMemo } from 'react';
import { Search, Check, X, Plus, BookOpen, Layers } from 'lucide-react';

export const ALL_CURRICULA = [
  'International Baccalaureate (IB)',
  'Cambridge International',
  'British Curriculum',
  'American Curriculum',
  'Pearson Edexcel',
  'Oxford AQA',
  'Advanced Placement (AP)',
  'International Primary Curriculum (IPC)',
  'International Middle Years Curriculum (IMYC)',
  'International General Certificate of Secondary Education (IGCSE)',
  'Pakistan National Curriculum',
  'Single National Curriculum (SNC), Pakistan',
  'CBSE (India)',
  'ICSE (India)',
  'National Curriculum Framework (India)',
  'Chinese National Curriculum',
  'Japanese National Curriculum',
  'Korean National Curriculum',
  'Singapore National Curriculum',
  'KSSR (Malaysia)',
  'KSSM (Malaysia)',
  'Kurikulum Merdeka (Indonesia)',
  'Bangladesh National Curriculum',
  'Sri Lankan National Curriculum',
  'K-12 Curriculum (Philippines)',
  'Basic Education Core Curriculum (Thailand)',
  'General Education Programme (Vietnam)',
  '12-Year Basic Education Curriculum (Taiwan)',
  'Nepal National Curriculum Framework',
  'Iranian National Curriculum',
  'Saudi National Curriculum',
  'UAE National Curriculum',
  'Qatar National Curriculum',
  'Omani National Curriculum',
  'Jordanian National Curriculum',
  'Turkish National Curriculum',
  'Hong Kong Curriculum Framework',
  'England National Curriculum',
  'Curriculum for Excellence (Scotland)',
  'Curriculum for Wales',
  'Irish National Curriculum',
  'French National Curriculum',
  'German State Curricula',
  'Finnish National Core Curriculum',
  'Swedish National Curriculum',
  'Norwegian National Curriculum',
  'Danish Folkeskole Curriculum',
  'Dutch National Curriculum',
  'Swiss Curriculum (Lehrplan 21)',
  'Italian National Curriculum',
  'Spanish National Curriculum',
  'Portuguese National Curriculum',
  'Polish Core Curriculum',
  'Austrian National Curriculum',
  'Belgian Education Curriculum',
  'Greek National Curriculum',
  'Russian Federal State Educational Standards',
  'US K-12 Curriculum',
  'Canadian Provincial Curricula',
  'Brazilian National Common Curricular Base (BNCC)',
  'Mexican Nueva Escuela Mexicana',
  'Argentine National Curriculum Framework',
  'Chilean National Curriculum',
  'Colombian National Curriculum',
  'Peruvian National Curriculum',
  'Uruguayan National Curriculum',
  'Costa Rican National Curriculum',
  'South African CAPS',
  'Nigerian National Curriculum',
  'Kenyan Competency-Based Curriculum (CBC)',
  'Ghana Standards-Based Curriculum',
  'Egyptian Education 2.0',
  'Rwandan Competence-Based Curriculum',
  'Ugandan National Curriculum',
  'Tanzanian National Curriculum',
  'Ethiopian National Curriculum',
  'Moroccan National Curriculum',
  'Australian Curriculum',
  'New Zealand Curriculum',
  'Montessori',
  'Waldorf / Steiner',
  'Reggio Emilia',
  'HighScope',
  'Finnish Phenomenon-Based Learning',
  'Project-Based Learning (PBL)',
  'Inquiry-Based Learning',
  'Competency-Based Education (CBE)',
  'Experiential Learning',
  'Classical Education',
  'Accelerated Christian Education (ACE)',
  'International Curriculum for Islamic Education'
];

interface CurriculumSelectProps {
  selected: string[];
  onChange: (curricula: string[]) => void;
}

export default function CurriculumSelect({ selected, onChange }: CurriculumSelectProps) {
  const [search, setSearch] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredCurricula = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return ALL_CURRICULA;
    return ALL_CURRICULA.filter(c => c.toLowerCase().includes(s));
  }, [search]);

  const toggleCurriculum = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter(c => c !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const val = customInput.trim();
    if (val && !selected.includes(val)) {
      onChange([...selected, val]);
      setCustomInput('');
    }
  };

  const handleRemove = (name: string) => {
    onChange(selected.filter(c => c !== name));
  };

  return (
    <div className="curriculum-select-container">
      {/* Selected Items Tags */}
      {selected.length > 0 && (
        <div className="curriculum-selected-box">
          <div className="curriculum-selected-header">
            <span>
              <Check size={14} className="check-icon" /> <strong>{selected.length}</strong> curriculum{selected.length > 1 ? 's' : ''} selected:
            </span>
            <button
              type="button"
              className="curriculum-clear-all"
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          </div>
          <div className="curriculum-chips-grid">
            {selected.map(item => (
              <span key={item} className="curriculum-chip">
                <BookOpen size={13} className="chip-icon" />
                <span className="chip-text">{item}</span>
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => handleRemove(item)}
                  className="chip-remove"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dropdown Toggle / Search Trigger */}
      <div className="curriculum-search-box">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Search and choose multiple curriculums (e.g. Cambridge, Pakistan, IB)..."
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <button
          type="button"
          className="curriculum-dropdown-toggle"
          onClick={() => setIsOpen(prev => !prev)}
        >
          {isOpen ? 'Close menu' : 'Browse all (91)'}
        </button>
      </div>

      {/* Options List */}
      {isOpen && (
        <div className="curriculum-dropdown-menu">
          <div className="curriculum-dropdown-header">
            <span>Select one or more curricula taught at this campus:</span>
            {search && <small>{filteredCurricula.length} match{filteredCurricula.length === 1 ? '' : 'es'}</small>}
          </div>

          <div className="curriculum-options-list">
            {filteredCurricula.map(curriculum => {
              const isChecked = selected.includes(curriculum);
              return (
                <label
                  key={curriculum}
                  className={`curriculum-option-item ${isChecked ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCurriculum(curriculum)}
                  />
                  <span className="curriculum-name">{curriculum}</span>
                  {isChecked && <Check size={15} className="item-checked-icon" />}
                </label>
              );
            })}
            {filteredCurricula.length === 0 && (
              <div className="curriculum-no-results">
                No matching standard curriculum found for "{search}". You can add it as a custom curriculum below.
              </div>
            )}
          </div>

          {/* Custom Curriculum Addition */}
          <div className="curriculum-custom-form">
            <span className="custom-label">Not in the list? Add custom curriculum:</span>
            <div className="custom-input-row">
              <input
                type="text"
                placeholder="e.g. Specialized Regional Curriculum..."
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom(e);
                  }
                }}
              />
              <button
                type="button"
                className="add-custom-btn"
                disabled={!customInput.trim()}
                onClick={handleAddCustom}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
