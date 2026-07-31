// client/src/pages/lang/constants.js
// Shared config for French/German Masterclass — the deliberately incomplete
// proof-of-concept sibling to English Masterclass. See languageMasterclassRoutes.js
// for the full "why incomplete" explanation; kept in sync with it here:
// QUESTIONS_PER_LEVEL and UNLOCK_ACCURACY must match the backend's
// QUESTIONS_PER_LEVEL / LEVEL_UNLOCK_ACCURACY exactly, or the progress bar
// shown here would lie about what's actually needed to unlock a level.

export const QUESTIONS_PER_LEVEL = 30;
export const UNLOCK_ACCURACY = 70;

export const LANGUAGE_META = {
  french: {
    label: 'French Masterclass',
    short: 'French',
    flag: '🇫🇷',
    // French flag blue — distinguishes this from English Masterclass's
    // crimson/sovereign theme and German's black/red/gold at a glance.
    accent: '#0055A4',
    accentSoft: '#E6F0FA',
  },
  german: {
    label: 'German Masterclass',
    short: 'German',
    flag: '🇩🇪',
    accent: '#DD0000',
    accentSoft: '#FCE8E8',
  },
};

export const DIFF_STYLE = {
  Beginner: { badge: 'bg-emerald-100 text-emerald-700', label: '🌱 Beginner' },
  Intermediate: { badge: 'bg-blue-100 text-blue-700', label: '🔥 Intermediate' },
  Advanced: { badge: 'bg-purple-100 text-purple-700', label: '⚡ Advanced' },
};
