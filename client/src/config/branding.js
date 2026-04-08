// EAC Platform Branding Configuration
export const branding = {
  platformName: 'AISchoolonair',
  tagline: 'Transform Your Learning Experience',
  description: 'The ultimate learning management system for modern education',

  colors: {
    primary: '#3B82F6',
    secondary: '#8B5CF6',
    accent: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
  },

  logo: {
    main: '/school-logo.png',
    alt: '/EAC logo.png',
  },

  // Correct EAC contact details
  contact: {
    email: 'info@eac.edu.ng',
    phones: ['+234 809 012 3412', '+234 809 912 3412', '+234 803 123 1234'],
    address: 'Ibadan, Nigeria'
  },

  social: {
    twitter: 'https://twitter.com/eacibadan',
    facebook: 'https://facebook.com/eacibadan',
    linkedin: 'https://linkedin.com/company/eacibadan',
    instagram: 'https://instagram.com/eacibadan'
  },

  features: {
    showPricing: true,
    showTestimonials: true,
    showStats: true,
    showPartners: false,
    enableChat: false,
    enableNotifications: true
  },

  stats: {
    students: '50,000+',
    teachers: '2,000+',
    courses: '500+',
    schools: '100+'
  }
};

export default branding;
