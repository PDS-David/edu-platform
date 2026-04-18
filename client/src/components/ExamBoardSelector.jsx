/**
 * ExamBoardSelector.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dropdown to filter content by exam type.
 * Now powered by useCatalog() — same data source as TeacherAssignmentPanel
 * and AIGeneratePanel, with module-level caching (no duplicate API calls).
 *
 * Props
 * ──────
 * selectedBoard   string | ''     – currently selected exam type code
 * onBoardChange   fn(code)        – called when selection changes
 * showLabel       bool (true)     – show "Select Type" label above dropdown
 * showAll         bool (true)     – show the " All Types" blank option
 * className       string ('')     – extra classes on wrapper
 * size            'small' | 'medium' | 'large'  (default 'medium')
 * filterActive    bool (true)     – when true, only show active types
 */

import React from 'react';
import { useCatalog } from '../hooks/useCatalog';

const ExamBoardSelector = ({
  selectedBoard,
  onBoardChange,
  showLabel    = true,
  showAll      = true,
  className    = '',
  size         = 'medium',
  filterActive = true,
}) => {
  const { examTypes, loadingTypes } = useCatalog();

  const sizeClasses = {
    small:  'px-3 py-2 text-sm',
    medium: 'px-4 py-3 text-base',
    large:  'px-6 py-4 text-lg',
  };

  const visibleTypes = filterActive
    ? examTypes.filter(b => b.is_active !== false)
    : examTypes;

  if (loadingTypes) {
    return (
      <div className={`exam-board-selector animate-pulse ${className}`}>
        {showLabel && <div className="h-4 bg-gray-200 rounded w-20 mb-2" />}
        <div className="h-10 bg-gray-200 rounded-lg w-48" />
      </div>
    );
  }

  return (
    <div className={`exam-board-selector ${className}`}>
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Type
        </label>
      )}

      <div className="relative">
        <select
          value={selectedBoard || ''}
          onChange={(e) => onBoardChange(e.target.value)}
          className={`
            w-full ${sizeClasses[size]}
            border border-gray-300 rounded-lg
            focus:ring-2 focus:ring-green-500 focus:border-green-500
            bg-white shadow-sm
            appearance-none cursor-pointer
            transition-all duration-200
            hover:border-green-400
          `}
        >
          {showAll && <option value=""> All Types</option>}

          {visibleTypes.map(board => {
            const emoji = board.icon_emoji?.trim();
            const safeIcon = (!emoji || emoji === '?' || emoji === '\uFFFD') ? '' : emoji;
            return (
              <option key={board.id} value={board.code}>
                {safeIcon ? safeIcon + ' ' : ''}{board.name}
              </option>
            );
          })}
        </select>

        {/* Custom dropdown arrow */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default ExamBoardSelector;
