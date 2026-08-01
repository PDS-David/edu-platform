// client/src/components/LanguageDropdown.jsx
// Conspicuous language selector for the Language Masterclass experience.
// Lives inside EMLayout.jsx's header (not the AISchoolonair exam-prep
// dashboard — Da was explicit that this belongs on the Language
// Masterclass side, not buried in nor attached to the exam-focused
// product). Lists all 8 Language Masterclass languages.
//
// ACCESS MODEL (single gate, not per-language — see middleware/auth.js /
// controllers/auth.js for the backend side of this): a tenant student's
// access is all-or-nothing, driven by user.school.hasLanguageMasterclass
// (true the moment the school is enabled for Language Masterclass at all —
// no per-language toggle, no per-student registration). A standalone
// (non-tenant) user's access is driven by user.hasLanguageMasterclass,
// which the backend now sets silently on their first content request to
// any language — there is no registration step visible anywhere in this
// UI. Independent of both: a language can be withheld entirely
// (LANGUAGE_META[code].enabled === false — the code-only "introduce this
// language" switch, see constants.js), in which case it shows "Will soon
// be available" regardless of school/user access. Locked and withheld
// languages both still appear in the list — greyed out with a short
// explanation — rather than being hidden entirely, matching
// LangLevelsView.jsx's existing pattern for locked Intermediate/Advanced
// tiers.

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
  // Single gate, not per-language: a tenant student either has Language
  // Masterclass entirely (all 8 unlocked) or not at all (all 8 locked). A
  // standalone user is symmetric: any one registration unlocks all 8.
  const hasAccess = isTenant ? !!user.school?.hasLanguageMasterclass : !!user.hasLanguageMasterclass;
  const isAccessLocked = () => isTenant && !hasAccess;

  const handleSelect = (code) => {
    const meta = LANGUAGE_META[code];
    if (!meta.enabled || isAccessLocked()) return;
    setOpen(false);
    navigate(routeFor(code));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-white/20 bg-white/10 hover:border-white/30 transition-colors text-sm font-semibold text-white"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-base leading-none">🌐</span>
        <span className="hidden sm:inline">Language Masterclass</span>
        <ChevronDown size={14} className={`text-white/70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 sm:left-0 mt-2 w-64 bg-white rounded-2xl border border-gray-100 shadow-lg py-2 z-50 max-h-96 overflow-y-auto"
        >
          {LANGUAGE_ORDER.map((code) => {
            const meta = LANGUAGE_META[code];
            // Two independent, non-overlapping reasons a row can be
            // unselectable — kept as separate checks (not merged into one
            // "locked" flag) so the message shown always matches the real
            // reason: a withheld language isn't waiting on the school/user,
            // and a school without access isn't waiting on a code change.
            const notYetEnabled = !meta.enabled;
            const accessLocked = !notYetEnabled && isAccessLocked();
            const disabled = notYetEnabled || accessLocked;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected="false"
                disabled={disabled}
                onClick={() => handleSelect(code)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <span className="text-xl leading-none shrink-0">{meta.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>
                    {meta.short}
                  </p>
                  {notYetEnabled && (
                    <p className="text-[11px] text-gray-400 mt-0.5">Will soon be available</p>
                  )}
                  {accessLocked && (
                    <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                      <Lock size={10} aria-hidden="true" />
                      Ask your school to enable Language Masterclass
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
