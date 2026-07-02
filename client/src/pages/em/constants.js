// client/src/pages/em/constants.js
// ─────────────────────────────────────────────────────────────────────────────
// English Masterclass — Design System Constants
// Single source of truth for colours, difficulty styles, and unlock rules.
// Imported by EMLayout, EMLoginPage, EMDashboard, EnglishMasterclass, and
// AdminEnglishMasterclass so every file uses the same values.
//
// DO NOT add business logic here — only design tokens and display metadata.
// ─────────────────────────────────────────────────────────────────────────────

// ── Sovereign palette (deep authoritative navy) ───────────────────────────────
// Used for: nav backgrounds, primary buttons, active states, page backgrounds.
export const SOVEREIGN = {
  950: '#0A0F1E', // near-black depth — footer backgrounds
  900: '#0F1629', // very dark navy — deep backgrounds
  800: '#162045', // header / nav background ← primary shell colour
  700: '#1D2F6F', // primary interactive (buttons)
  600: '#2040A0', // hover on primary buttons
  500: '#2952C8', // active state underline, focused elements
  400: '#4D71D9', // mid-weight accent
  300: '#7A98E8', // light accent, secondary text on dark bg
  200: '#B8C8F4', // inactive nav text on dark bg
  100: '#DDE5FA', // subtle tint surfaces
  50:  '#F0F4FD', // authenticated page background
};

// ── Crimson palette (British accent red) ─────────────────────────────────────
// Used for: logo icon background, the "EM" monogram accent, destructive actions.
// Never used for interactive primary elements — that is Sovereign.
export const CRIMSON = {
  700: '#8B0A1A', // deep crimson — error states
  600: '#B30E21', // hover on crimson
  500: '#CF142B', // primary accent — logo, British identity marker
  400: '#E04356', // lighter accent
  200: '#F8C2C9', // light backgrounds
  50:  '#FFF0F2', // tint surfaces
};

// ── EM Gold palette (achievements and rewards ONLY) ───────────────────────────
// Used for: streaks, mastery badges, "words mastered" count, achievement moments.
// NOT used for buttons, nav items, or general UI chrome.
export const EM_GOLD = {
  600: '#9A6000', // deep achievement
  500: '#C47D00', // streak flame, mastery badges
  400: '#F0A000', // active achievement glow
  200: '#FDDEA0', // achievement backgrounds
  50:  '#FFFBF0', // achievement wash
};

// ── Semantic colours ──────────────────────────────────────────────────────────
export const SEMANTIC = {
  success500: '#0F9B5A',
  success100: '#CCFCE8',
  warning500: '#D97706',
  warning100: '#FEF3C7',
  error500:   '#DC2626',
  error100:   '#FEE2E2',
  info500:    '#2563EB',
  info100:    '#DBEAFE',
};

// ── Difficulty level display data ─────────────────────────────────────────────
// Used everywhere a difficulty label, badge, or colour is needed.
// IMPORTANT: All Tailwind classes here must be complete strings (not interpolated)
// so the Tailwind purge step keeps them in the production bundle.
export const DIFFICULTY_STYLES = {
  Beginner: {
    emoji:      '🌱',
    label:      '🌱 Beginner',
    // Tailwind classes — complete strings, safe from purge
    badgeBg:    'bg-emerald-100',
    badgeText:  'text-emerald-700',
    glowFrom:   'from-emerald-500',
    glowTo:     'to-teal-500',
    // Inline style hex for contexts where Tailwind can't be used
    hex:        '#059669',
  },
  Intermediate: {
    emoji:      '🔥',
    label:      '🔥 Intermediate',
    badgeBg:    'bg-blue-100',
    badgeText:  'text-blue-700',
    glowFrom:   'from-blue-500',
    glowTo:     'to-indigo-500',
    hex:        '#2563EB',
  },
  Advanced: {
    emoji:      '⚡',
    label:      '⚡ Advanced',
    badgeBg:    'bg-purple-100',
    badgeText:  'text-purple-700',
    glowFrom:   'from-purple-500',
    glowTo:     'to-fuchsia-500',
    hex:        '#7C3AED',
  },
};

export const DIFFICULTY_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// ── Level unlock rules ────────────────────────────────────────────────────────
// Which difficulty must be passed to unlock the next tier.
export const UNLOCK_REQUIREMENTS = {
  Intermediate: 'Beginner',
  Advanced:     'Intermediate',
};

// Minimum accuracy (%) required in a session to count as "passing" for unlock.
export const UNLOCK_THRESHOLD = 60;

// ── Elevation shadows (Tier 1–3) ──────────────────────────────────────────────
// Used via inline style when Tailwind shadow utilities aren't precise enough.
export const SHADOW = {
  tier1: '0 1px 3px rgba(10,15,30,0.06), 0 1px 2px rgba(10,15,30,0.04)',
  tier2: '0 4px 16px rgba(10,15,30,0.08), 0 2px 6px rgba(10,15,30,0.05)',
  tier3: '0 16px 48px rgba(10,15,30,0.14), 0 6px 20px rgba(10,15,30,0.08)',
};

// ── Stat card colour map (static — avoids Tailwind purge of dynamic classes) ──
// Keys match the `colour` prop passed to StatCard in EMDashboard.
export const STAT_COLOURS = {
  blue:   { bg: 'bg-sovereign-100', icon: 'text-sovereign-500' },
  amber:  { bg: 'bg-amber-50',      icon: 'text-amber-500'     },
  orange: { bg: 'bg-orange-50',     icon: 'text-orange-500'    },
  green:  { bg: 'bg-emerald-50',    icon: 'text-emerald-500'   },
  purple: { bg: 'bg-purple-50',     icon: 'text-purple-500'    },
};
