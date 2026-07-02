// AISchoolonair Platform Branding Configuration
export const branding = {
  platformName: 'AISchoolonair',
  tagline: 'Transform Your Learning Experience',
  // Single source of truth for the "Powered by" attribution shown across
  // the app. Use poweredByShort ("EAC") wherever space is tight (badges,
  // small footer lines); use poweredByFull for room to spell it out.
  poweredByFull:  'Educational Advancement Centre',
  poweredByShort: 'EAC',
  description: 'The ultimate learning management system for modern education',

  colors: {
    primary: '#3B82F6',
    secondary: '#8B5CF6',
    accent: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
  },

  logo: {
    main: '/logo.svg',
    alt:  '/logo.svg',
  },

  contact: {
    email: 'info@eac.edu.ng',
    phones: ['+234 809 012 3412', '+234 809 912 3412', '+234 803 123 1234'],
    address: 'Ibadan, Nigeria'
  },

  // X4 fix: these were unverified, guessed URLs (e.g. https://twitter.com/
  // aischoolonair) with no confirmation a matching real account exists —
  // checked via web search, found no verified AISchoolonair social presence.
  // Set to null until a real, confirmed account exists for each platform.
  // The footer (LandingPage.jsx) only renders an icon when the value here
  // is a real URL, so this safely hides all four until populated, rather
  // than linking to addresses that may 404 or belong to someone else.
  //
  // NOTE: a later commit (90e45be) attempted to change twitter -> x.com
  // under the same unverified handle, asserting "platform rebranded; old
  // URL still works" with no actual evidence. Re-checked via a second,
  // targeted web search specifically for that handle on x.com — found no
  // matching account. Reverted back to null pending real confirmation.
  social: {
    twitter:   null,
    facebook:  null,
    linkedin:  null,
    instagram: null,
  },

  features: {
    showPricing:         true,
    showTestimonials:    true,
    showStats:           true,
    showPartners:        false,
    enableChat:          false,
    enableNotifications: true
  },

  stats: {
    students: '50,000+',
    teachers: '2,000+',
    courses:  '500+',
    schools:  '100+'
  }
};

export default branding;

