// client/src/components/LanguageDropdown.jsx
// Conspicuous language selector on the main AISchoolonair student
// dashboard (StudentDashboard.jsx) — not buried inside a sub-portal.
// Lists all 8 Language Masterclass languages. A language is enabled/
// highlighted when either the student's school has turned it on
// (school.enabledLanguages, from school_enabled_languages) or the student
// has personally self-registered for it as a standalone user
// (user.registeredLanguages, from user_language_registrations). Locked
// languages still appear — greyed out with a short explanation — rather
// than being hidden entirely, matching LangLevelsView.jsx's existing
// pattern for locked Intermediate/Advanced tiers.
//
// For a standalone user (no school_id at all), there's no school gate to
// respect, so nothing is greyed out here — any language is one click away
// from its own registration screen.

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LANGUAGE_META } from '../pages/lang/constants';

const LANGUAGE_ORDER = ['english', 'french', 'german', 'mandarin', 'arabic', 'spanish', 'swahili', 'yoruba'];

function routeFor(code) {
  return code === 'english' ? '/language/english/dashboard' : `/language/${code}`;
}

export default function LanguageDropdown() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user || user.role !== 'student') return null;

  const isTenant = !!user.school;
  const available = new Set([
    ...(user.school?.enabledLanguages || []),
    ...(user.registeredLanguages || []),
  ]);
  const isLocked = (code) => isTenant && !available.has(code);

  const handleSelect = (code) => {
    if (isLocked(code)) return;
    setOpen(false);
    navigate(routeFor(code));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 transition-colors text-sm font-semibold text-gray-700"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-base leading-none">🌐</span>
        <span className="hidden sm:inline">Language Masterclass</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 sm:left-0 mt-2 w-64 bg-white rounded-2xl border border-gray-100 shadow-lg py-2 z-50 max-h-96 overflow-y-auto"
        >
          {LANGUAGE_ORDER.map((code) => {
            const meta = LANGUAGE_META[code];
            const locked = isLocked(code);
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected="false"
                disabled={locked}
                onClick={() => handleSelect(code)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  locked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <span className="text-xl leading-none shrink-0">{meta.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${locked ? 'text-gray-400' : 'text-gray-900'}`}>
                    {meta.short}
                  </p>
                  {locked && (
                    <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                      <Lock size={10} aria-hidden="true" />
                      Ask your school to enable this
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
