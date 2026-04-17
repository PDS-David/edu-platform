// client/src/components/PublicNav.jsx
import { Link } from 'react-router-dom';
import branding from '../config/branding';

export default function PublicNav({
  right     = null,
  className = '',
  sticky    = true,
  bg        = null,
  border    = true,
}) {
  return (
    <header
      className={[
        'w-full z-50 h-16 flex items-center px-4 md:px-8',
        sticky ? 'sticky top-0' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{
        background: bg || 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: border ? '1px solid rgba(17,22,41,0.08)' : 'none',
        boxShadow: '0 1px 24px rgba(17,22,41,0.06)',
      }}
    >
      {/* Left: brand */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/" title="Home" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #1a4fff 0%, #10b981 100%)' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L15 6V12L9 16L3 12V6L9 2Z" fill="white" fillOpacity="0.25"/>
              <path d="M9 4L13.5 7V11L9 14L4.5 11V7L9 4Z" fill="white" fillOpacity="0.45"/>
              <circle cx="9" cy="9" r="3" fill="white"/>
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-[15px] tracking-tight" style={{color:'#111629'}}>
              AISchoolonair
            </span>
            <span className="text-[10px] font-medium" style={{color:'#8995d8',letterSpacing:'0.04em'}}>
              by EAC
            </span>
          </div>
        </Link>

        <span className="hidden md:block h-7 w-px" style={{background:'rgba(17,22,41,0.10)'}} />
        <img src={branding.logo.main} alt="EAC" className="hidden md:block h-7 w-auto object-contain opacity-75" />
      </div>

      {right && (
        <div className="ml-auto flex items-center gap-3">{right}</div>
      )}
    </header>
  );
}
