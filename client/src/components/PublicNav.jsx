// client/src/components/PublicNav.jsx
import { Link } from 'react-router-dom';
import branding from '../config/branding';

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
      {/* ── Left: home button + AISchoolonair brand ── */}
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

        {/* AISchoolonair — product identity label */}
        <span className="flex items-center gap-1">
          <span
            style={{ background: '#2563eb' }}
            className="px-1.5 py-0.5 rounded text-white font-bold text-sm"
          >
            AISchoolonair
          </span>
        </span>

        {/* Divider */}
        <span className="hidden md:block h-6 w-px bg-gray-200" />

        {/* Org logo */}
        <img
          src={branding.logo.main}
          alt="AISchoolonair"
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
