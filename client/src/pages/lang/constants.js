// client/src/pages/lang/constants.js
// Shared config for Language Masterclass across all 8 languages. See
// languageMasterclassRoutes.js's file header for what's real vs
// placeholder per language (languages.supports_pronunciation/listening/
// writing is the source of truth — this file is presentation only).
// QUESTIONS_PER_LEVEL and UNLOCK_ACCURACY must match the backend's
// QUESTIONS_PER_LEVEL / LEVEL_UNLOCK_ACCURACY exactly, or the progress bar
// shown here would lie about what's actually needed to unlock a level.

export const QUESTIONS_PER_LEVEL = 30;
export const UNLOCK_ACCURACY = 70;

// `enabled` is the single "introduce this language" switch on the
// frontend — must match ENABLED_LANGUAGES in
// server/routes/languageMasterclassRoutes.js exactly. A language flipped
// to enabled here without also being added there (or vice versa) means a
// mismatch, not a security hole either way: the backend's own gate is
// what actually withholds content regardless of what this file says.
export const LANGUAGE_META = {
  english: {
    label: 'English Masterclass',
    short: 'English',
    flag: '🇬🇧',
    accent: '#8B0000',
    accentSoft: '#FBEAEA',
    enabled: true,
  },
  french: {
    label: 'French Masterclass',
    short: 'French',
    flag: '🇫🇷',
    // French flag blue — distinguishes this from English Masterclass's
    // crimson/sovereign theme and German's black/red/gold at a glance.
    accent: '#0055A4',
    accentSoft: '#E6F0FA',
    enabled: true,
  },
  german: {
    label: 'German Masterclass',
    short: 'German',
    flag: '🇩🇪',
    accent: '#DD0000',
    accentSoft: '#FCE8E8',
    enabled: true,
  },
  mandarin: {
    label: 'Mandarin Masterclass',
    short: 'Mandarin',
    flag: '🇨🇳',
    accent: '#DE2910',
    accentSoft: '#FBEAE8',
    enabled: false,
  },
  arabic: {
    label: 'Arabic Masterclass',
    short: 'Arabic',
    flag: '🇸🇦',
    accent: '#006C35',
    accentSoft: '#E5F2EB',
    isRtl: true,
    enabled: false,
  },
  spanish: {
    label: 'Spanish Masterclass',
    short: 'Spanish',
    flag: '🇪🇸',
    accent: '#AA151B',
    accentSoft: '#FBEAEA',
    enabled: false,
  },
  swahili: {
    label: 'Swahili Masterclass',
    short: 'Swahili',
    flag: '🇰🇪',
    accent: '#006600',
    accentSoft: '#E6F2E6',
    enabled: false,
  },
  yoruba: {
    label: 'Yoruba Masterclass',
    short: 'Yoruba',
    flag: '🇳🇬',
    accent: '#008751',
    accentSoft: '#E6F5EE',
    enabled: false,
  },
};

export const DIFF_STYLE = {
  Beginner: { badge: 'bg-emerald-100 text-emerald-700', label: '🌱 Beginner' },
  Intermediate: { badge: 'bg-blue-100 text-blue-700', label: '🔥 Intermediate' },
  Advanced: { badge: 'bg-purple-100 text-purple-700', label: '⚡ Advanced' },
};
