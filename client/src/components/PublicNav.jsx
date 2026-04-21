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
      {/* Left: brand logos — AISchoolonair | EAC | LessonTeacher */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/" title="Home" className="flex items-center gap-2 group">
          <img src="/logo.svg" alt="AISchoolonair" className="w-8 h-8 shrink-0" />
          <span className="font-bold text-[15px] tracking-tight hidden sm:block" style={{color:'#111629'}}>
            AISchoolonair
          </span>
        </Link>

        <span className="h-7 w-px shrink-0" style={{background:'rgba(17,22,41,0.10)'}} />

        {/* EAC logo */}
        <img src="/eac_logo.png" alt="EAC" className="h-8 w-auto object-contain shrink-0" style={{maxWidth:'68px'}} />

        <span className="hidden md:block h-7 w-px shrink-0" style={{background:'rgba(17,22,41,0.10)'}} />

        {/* LessonTeacher logo */}
        <img src="/lessonteacher_logo.jpg" alt="LessonTeacher" className="hidden md:block h-6 w-auto object-contain shrink-0" style={{maxWidth:'96px'}} />
      </div>

      {right && (
        <div className="ml-auto flex items-center gap-3">{right}</div>
      )}
    </header>
  );
}
