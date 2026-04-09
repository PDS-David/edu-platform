import React, { useState, useEffect } from 'react';

/**
 * ExamBoardSelector Component
 * Displays dropdown to filter content by exam board
 * Used in navigation, subject catalog, and course pages
 */

const ExamBoardSelector = ({ 
  selectedBoard, 
  onBoardChange, 
  showLabel = true,
  className = '',
  size = 'medium' // 'small', 'medium', 'large'
}) => {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExamBoards();
  }, []);

  const fetchExamBoards = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBase}/exam-boards`);

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const json = await response.json();

      // API returns { success: true, count: N, data: [...] }
      // but guard against plain arrays too, just in case
      const list = Array.isArray(json) ? json : (json.data || []);

      if (list.length > 0) {
        setBoards(list);
      } else {
        // API succeeded but returned empty — fall back to static list
        setBoards(getStaticBoards());
      }
    } catch (error) {
      console.error('Error fetching exam boards:', error);
      // Network/server error — fall back to static list so UI still works
      setBoards(getStaticBoards());
    } finally {
      setLoading(false);
    }
  };

  const getStaticBoards = () => [
    { id: 1, code: 'JAMB',   name: 'JAMB/UTME', icon_emoji: '🎓' },
    { id: 2, code: 'WAEC',   name: 'WAEC',      icon_emoji: '📘' },
    { id: 3, code: 'OLEVEL', name: 'O-Levels',  icon_emoji: '📗' },
    { id: 4, code: 'NECO',   name: 'NECO',      icon_emoji: '📙' },
    { id: 5, code: 'IELTS',  name: 'IELTS',     icon_emoji: '🌍' },
    { id: 6, code: 'TOEFL',  name: 'TOEFL',     icon_emoji: '🇺🇸' },
    { id: 7, code: 'SAT',      name: 'SAT',                  icon_emoji: '🎯' },
    { id: 8, code: 'GCE_AL',  name: 'GCE A'Levels',          icon_emoji: '🎓' },
    { id: 9, code: 'JUPEB',   name: 'JUPEB',                 icon_emoji: '📚' },
    { id: 10, code: 'LANG_EN', name: 'Language Lab – English', icon_emoji: '🇬🇧' },
    { id: 11, code: 'LANG_FR', name: 'Language Lab – French',  icon_emoji: '🇫🇷' },
    { id: 12, code: 'LANG_YO', name: 'Language Lab – Yoruba',  icon_emoji: '🌍' }
  ];

  const sizeClasses = {
    small: 'px-3 py-2 text-sm',
    medium: 'px-4 py-3 text-base',
    large: 'px-6 py-4 text-lg'
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded-lg w-48"></div>
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
          <option value="">🌟 All Types</option>
          {boards.map(board => (
            <option key={board.id} value={board.code}>
              {board.icon_emoji || board.icon || ''} {board.name}
            </option>
          ))}
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
