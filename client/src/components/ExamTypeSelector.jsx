// client/src/components/ExamTypeSelector.jsx
// Renamed from ExamBoardSelector — "Exam Type" is the canonical term everywhere.
// Fetches live from /api/exam-boards and falls back to the full static list of
// all 12 exam types if the API is unreachable.
//
// Props:
//   selectedType   — currently selected code (string) or ''
//   onTypeChange   — callback(code: string)
//   showLabel      — show "Exam Type" label above dropdown (default true)
//   className      — extra wrapper classes
//   size           — 'small' | 'medium' | 'large'
//   includeAll     — show "All Types" option at top (default true)

import React, { useState, useEffect } from 'react';

const ExamTypeSelector = ({
  selectedType,
  onTypeChange,
  showLabel   = true,
  className   = '',
  size        = 'medium',
  includeAll  = true,
}) => {
  const [types,   setTypes]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExamTypes();
  }, []);

  const fetchExamTypes = async () => {
    try {
      const _rawBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const apiBase = _rawBase.endsWith('/api') ? _rawBase : `${_rawBase}/api`;
      const response = await fetch(`${apiBase}/exam-boards`);
      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      const json = await response.json();
      const list = Array.isArray(json) ? json : (json.data || []);
      setTypes(list.length > 0 ? list : getStaticTypes());
    } catch {
      setTypes(getStaticTypes());
    } finally {
      setLoading(false);
    }
  };

  // Full static fallback — all 12 exam types
  const getStaticTypes = () => [
    { id: 1,  code: 'JAMB',    name: 'JAMB / UTME',             icon_emoji: '' },
    { id: 2,  code: 'WAEC',    name: 'WAEC',                    icon_emoji: '' },
    { id: 3,  code: 'GCE_OL',  name: 'GCE O-Levels',            icon_emoji: '' },
    { id: 4,  code: 'NECO',    name: 'NECO',                    icon_emoji: '' },
    { id: 5,  code: 'IELTS',   name: 'IELTS',                   icon_emoji: '' },
    { id: 6,  code: 'TOEFL',   name: 'TOEFL',                   icon_emoji: '' },
    { id: 7,  code: 'SAT',     name: 'SAT',                     icon_emoji: '' },
    { id: 8,  code: 'GCE_AL',  name: 'GCE A-Levels',            icon_emoji: '' },
    { id: 9,  code: 'JUPEB',   name: 'JUPEB',                   icon_emoji: '' },
    { id: 10, code: 'LANG_EN', name: 'Language Lab. – English', icon_emoji: '' },
    { id: 11, code: 'LANG_FR', name: 'Language Lab. – French',  icon_emoji: '' },
    { id: 12, code: 'LANG_YO', name: 'Language Lab. – Yoruba',  icon_emoji: '' },
  ];

  const sizeClasses = {
    small:  'px-3 py-2 text-sm',
    medium: 'px-4 py-3 text-base',
    large:  'px-6 py-4 text-lg',
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded-lg w-48" />
      </div>
    );
  }

  return (
    <div className={`exam-type-selector ${className}`}>
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Exam Type
        </label>
      )}

      <div className="relative">
        <select
          value={selectedType || ''}
          onChange={(e) => onTypeChange(e.target.value)}
          className={`
            w-full ${sizeClasses[size]}
            border border-gray-300 rounded-lg
            focus:ring-2 focus:ring-green-500 focus:border-green-500
            bg-white shadow-sm appearance-none cursor-pointer
            transition-all duration-200 hover:border-green-400
          `}
        >
          {includeAll && <option value=""> All Exam Types</option>}
          {types.map(t => {
            const emoji = t.icon_emoji?.trim();
            const safeIcon = (!emoji || emoji === '?' || emoji === '\uFFFD') ? '' : emoji;
            return (
              <option key={t.id} value={t.code}>
                {safeIcon ? safeIcon + ' ' : ''}{t.name}
              </option>
            );
          })}
        </select>

        {/* Dropdown arrow */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ExamTypeSelector;
