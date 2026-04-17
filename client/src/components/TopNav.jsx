// client/src/components/TopNav.jsx
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import branding from '../config/branding';
import { MessageSquare, ChevronDown, LogOut, Settings, Bell, Zap } from 'lucide-react';

export default function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropOpen,  setDropOpen]  = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const dropRef  = useRef(null);
  const notifRef = useRef(null);

  const firstName = user?.firstName || user?.first_name || '';
  const lastName  = user?.lastName  || user?.last_name  || '';
  const fullName  = `${firstName} ${lastName}`.trim() || 'User';
  const initials  = (firstName[0] || '') + (lastName[0] || '');
  const role      = user?.role || 'student';
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const dashboardPath =
    role === 'admin'   ? '/admin/dashboard'   :
    role === 'teacher' ? '/teacher/dashboard' :
                         '/student/dashboard';

  useEffect(() => {
    if (!user) return;
    api.get('/notifications').then(r => setNotifications(r.data.data || [])).catch(() => {});
  }, [user]);

  const handleNotifOpen = () => {
    setNotifOpen(o => !o);
    if (!notifOpen && unreadCount > 0) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      api.patch('/notifications/read-all').catch(() => {});
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current  && !dropRef.current.contains(e.target))  setDropOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  /* avatar colour based on name */
  const avatarColors = [
    'linear-gradient(135deg,#1a4fff,#4a79ff)',
    'linear-gradient(135deg,#059669,#10b981)',
    'linear-gradient(135deg,#d97706,#f59e0b)',
    'linear-gradient(135deg,#7c3aed,#a78bfa)',
    'linear-gradient(135deg,#db2777,#f472b6)',
  ];
  const avatarBg = avatarColors[(fullName.charCodeAt(0) || 0) % avatarColors.length];

  return (
    <nav
      className="w-full sticky top-0 z-50 h-16 flex items-center px-4 md:px-6"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(17,22,41,0.08)',
        boxShadow: '0 1px 20px rgba(17,22,41,0.06)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/" title="Home" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
            style={{ background: 'linear-gradient(135deg,#1a4fff 0%,#10b981 100%)' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L15 6V12L9 16L3 12V6L9 2Z" fill="white" fillOpacity="0.25"/>
              <path d="M9 4L13.5 7V11L9 14L4.5 11V7L9 4Z" fill="white" fillOpacity="0.45"/>
              <circle cx="9" cy="9" r="3" fill="white"/>
            </svg>
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="font-bold text-[14px] tracking-tight text-[#111629]">AISchoolonair</span>
            <span className="text-[9px] font-medium text-[#8995d8] tracking-wide uppercase">by EAC</span>
          </div>
        </Link>

        <span className="hidden md:block h-7 w-px bg-[rgba(17,22,41,0.10)]" />
        <img src={branding.logo.main} alt="EAC" className="hidden md:block h-7 w-auto object-contain opacity-75" />
      </div>

      {/* Right */}
      <div className="ml-auto flex items-center gap-1 md:gap-2">

        {/* Upgrade CTA */}
        {user?.role === 'student' && user?.subscription_status === 'free' && (
          <Link
            to="/pricing"
            className="hidden sm:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg,#d97706,#f59e0b)',
              color: 'white',
              boxShadow: '0 2px 8px rgba(217,119,6,0.35)',
            }}
          >
            <Zap size={12} />
            Upgrade
          </Link>
        )}

        {/* Bell */}
        <div className="relative" ref={notifRef} onClick={e => e.stopPropagation()}>
          <button
            onClick={handleNotifOpen}
            className="relative p-2 rounded-lg transition-colors duration-150 hover:bg-[#eef0fb] text-[#6371c7]"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1 right-1 w-4 h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
                style={{ background: '#ef4444', fontSize: '9px' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-80 rounded-2xl py-1 z-50"
              style={{
                background: 'white',
                border: '1px solid rgba(17,22,41,0.10)',
                boxShadow: '0 8px 40px rgba(17,22,41,0.14)',
              }}
            >
              <div className="px-4 py-3 border-b border-[rgba(17,22,41,0.06)]">
                <p className="text-sm font-bold text-[#111629]">Notifications</p>
              </div>
              {notifications.length === 0 ? (
                <p className="text-xs text-[#8995d8] text-center py-8">You're all caught up!</p>
              ) : (
                notifications.slice(0, 5).map(n => (
                  <div
                    key={n.id}
                    className="px-4 py-3 border-b border-[rgba(17,22,41,0.05)] last:border-0 transition-colors hover:bg-[#f8f9fe]"
                    style={{ background: !n.is_read ? 'rgba(26,79,255,0.03)' : undefined }}
                  >
                    <div className="flex gap-2 items-start">
                      {!n.is_read && <div className="w-1.5 h-1.5 rounded-full bg-[#1a4fff] mt-1.5 shrink-0" />}
                      <div className={!n.is_read ? '' : 'pl-3.5'}>
                        <p className="text-xs font-semibold text-[#111629]">{n.title}</p>
                        <p className="text-xs text-[#6371c7] mt-0.5 leading-relaxed">{n.message}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Avatar + dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setDropOpen(o => !o)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors duration-150 hover:bg-[#eef0fb]"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 uppercase"
              style={{ background: avatarBg }}
            >
              {initials || fullName[0]}
            </div>
            <div className="hidden md:flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold text-[#111629] truncate max-w-[110px]">{fullName}</span>
              <span className="text-[10px] text-[#8995d8] capitalize">{role}</span>
            </div>
            <ChevronDown size={13} className="text-[#8995d8] hidden md:block" />
          </button>

          {dropOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-52 rounded-2xl py-1.5 z-50"
              style={{
                background: 'white',
                border: '1px solid rgba(17,22,41,0.10)',
                boxShadow: '0 8px 40px rgba(17,22,41,0.14)',
              }}
            >
              <div className="px-4 py-3 border-b border-[rgba(17,22,41,0.06)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold uppercase" style={{background: avatarBg}}>
                    {initials || fullName[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#111629]">{fullName}</p>
                    <p className="text-xs text-[#8995d8] capitalize">{role}</p>
                  </div>
                </div>
              </div>

              {[
                { label: 'Dashboard', icon: '⊞', action: () => { setDropOpen(false); navigate(dashboardPath); } },
                { label: 'Settings',  icon: '⚙', action: () => { setDropOpen(false); navigate('/settings'); } },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#3d4690] hover:bg-[#f8f9fe] transition-colors text-left"
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  {item.label}
                </button>
              ))}

              <div className="mx-4 my-1.5 h-px bg-[rgba(17,22,41,0.06)]" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
