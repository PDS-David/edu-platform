// client/src/components/PublicNav.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared navigation header for all public and auth pages:
//   LandingPage, SubjectCatalog, PastPapersPage, LoginPage, RegisterPage,
//   ForgotPassword, ResetPassword, VerifyEmailPage, TermsOfService, PrivacyPolicy
//
// Layout (left side — mirrors TopNav exactly):
//   [four-dot home button] [EACbuddy | Learning Platform] [divider] [EAC org logo]
//
// The right slot is flexible via the `right` prop so each page can inject
// its own nav links / buttons (e.g. Login + Start Free on LandingPage).
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import branding from '../config/branding';

/**
 * @param {React.ReactNode} right   - Optional right-side content (nav links, buttons, etc.)
 * @param {string}          className - Extra classes for the <header> element
 * @param {boolean}         sticky  - Whether to sticky-position the bar (default true)
 * @param {string}          bg      - Tailwind bg class (default 'bg-white')
 * @param {boolean}         border  - Show bottom border (default true)
 */
export default function PublicNav({
  right     = null,
  className = '',
  sticky    = true,
  bg        = 'bg-white',
  border    = true,
}) {
  return (
    <header
      className={[
        'w-full z-50 h-14 flex items-center px-4 md:px-6',
        sticky ? 'sticky top-0' : '',
        bg,
        border ? 'border-b border-gray-100' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* ── Left: four-dot home button + EACbuddy product name + EAC org logo ── */}
      <div className="flex items-center gap-3 shrink-0">

        {/* Four-dot grid = Home button */}
        <Link
          to="/"
          title="Go to Home"
          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-blue-50 transition-colors"
        >
          <div className="grid grid-cols-2 gap-0.5 w-5 h-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-sm bg-blue-600" />
            ))}
          </div>
        </Link>

        {/* EACbuddy — product identity label (not a nav link) */}
        <span className="flex items-center gap-1">
          <span
            style={{ background: '#2563eb' }}
            className="px-1.5 py-0.5 rounded text-white font-bold text-sm"
          >
            EAC
          </span>
          <span className="font-semibold text-gray-900">buddy</span>
          <span className="hidden sm:inline text-gray-300 mx-1 text-lg font-light">|</span>
          <span className="hidden sm:inline text-gray-500 text-sm font-medium">
            Learning Platform
          </span>
        </span>

        {/* Divider */}
        <span className="hidden md:block h-6 w-px bg-gray-200" />

        {/* EAC org logo — visual brand element, not a nav link */}
        <img
          src={branding.logo.main}
          alt="Educational Advancement Centre"
          className="hidden md:block h-7 w-auto object-contain"
        />
      </div>

      {/* ── Right: page-specific content ── */}
      {right && (
        <div className="ml-auto flex items-center gap-3">
          {right}
        </div>
      )}
    </header>
  );
}
