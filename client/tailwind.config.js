/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── English Masterclass design system ─────────────────────────────────
        // Sovereign: deep authoritative navy — nav, headers, primary buttons
        sovereign: {
          50:  '#F0F4FD',
          100: '#DDE5FA',
          200: '#B8C8F4',
          300: '#7A98E8',
          400: '#4D71D9',
          500: '#2952C8',
          600: '#2040A0',
          700: '#1D2F6F',
          800: '#162045',
          900: '#0F1629',
          950: '#0A0F1E',
        },
        // Crimson: British red — logo mark, identity accent, errors
        crimson: {
          50:  '#FFF0F2',
          100: '#FFD6DB',
          200: '#F8C2C9',
          400: '#E04356',
          500: '#CF142B',
          600: '#B30E21',
          700: '#8B0A1A',
        },
        // em-gold: achievements, streaks, mastery — never general UI chrome
        'em-gold': {
          50:  '#FFFBF0',
          200: '#FDDEA0',
          400: '#F0A000',
          500: '#C47D00',
          600: '#9A6000',
        },
        // ─────────────────────────────────────────────────────────────────────
        primary: {
          50:  '#edf3ff',
          100: '#d6e5ff',
          200: '#adc7ff',
          300: '#7aa3ff',
          400: '#4a79ff',
          500: '#1a4fff',
          600: '#0033e6',
          700: '#0027b8',
          800: '#001f91',
          900: '#001470',
          950: '#000b42',
        },
        accent: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        gold: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        ink: {
          50:  '#f8f9fe',
          100: '#eef0fb',
          200: '#d8ddf5',
          300: '#b4bdea',
          400: '#8995d8',
          500: '#6371c7',
          600: '#4b56b0',
          700: '#3d4690',
          800: '#1e2347',
          900: '#111629',
          950: '#080b1a',
        },
      },
      fontFamily: {
        sans:    ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'hero-mesh':     'radial-gradient(at 20% 30%, #001470 0%, transparent 60%), radial-gradient(at 80% 10%, #047857 0%, transparent 50%), radial-gradient(at 60% 80%, #0027b8 0%, transparent 60%)',
        'card-glow':     'radial-gradient(ellipse at top left, rgba(26,79,255,0.12) 0%, transparent 60%)',
        'emerald-glow':  'radial-gradient(ellipse at bottom right, rgba(16,185,129,0.15) 0%, transparent 60%)',
        'gold-radial':   'radial-gradient(ellipse at center, rgba(245,158,11,0.2) 0%, transparent 70%)',
      },
      boxShadow: {
        'glow-blue':    '0 0 40px rgba(26,79,255,0.25), 0 4px 24px rgba(0,0,0,0.12)',
        'glow-emerald': '0 0 30px rgba(16,185,129,0.2), 0 4px 16px rgba(0,0,0,0.1)',
        'glow-gold':    '0 0 30px rgba(245,158,11,0.2), 0 4px 16px rgba(0,0,0,0.1)',
        'card':         '0 2px 16px rgba(17,22,41,0.06), 0 1px 4px rgba(17,22,41,0.04)',
        'card-hover':   '0 8px 40px rgba(17,22,41,0.12), 0 2px 8px rgba(17,22,41,0.06)',
        'inner-top':    'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      animation: {
        'float':       'float 6s ease-in-out infinite',
        'pulse-glow':  'pulseGlow 3s ease-in-out infinite',
        'slide-up':    'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':     'fadeIn 0.4s ease-out both',
        'shimmer':     'shimmer 2s linear infinite',
        'count-up':    'countUp 0.6s ease-out both',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%':     { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 20px rgba(26,79,255,0.3)' },
          '50%':     { boxShadow: '0 0 40px rgba(26,79,255,0.6)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to:   { backgroundPosition: '200% 0' },
        },
      },
      borderRadius: {
        '2xl':  '1rem',
        '3xl':  '1.5rem',
        '4xl':  '2rem',
      },
    },
  },
  plugins: [],
}

