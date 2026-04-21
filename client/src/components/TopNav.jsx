import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import branding from '../config/branding';
import { Bell, ChevronDown, Settings, LogOut, LayoutDashboard } from 'lucide-react';

export default function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [dropOpen,       setDropOpen]       = useState(false);
  const [notifOpen,      setNotifOpen]      = useState(false);
  const [notifications,  setNotifications]  = useState([]);

  const dropRef  = useRef(null);
  const notifRef = useRef(null);

  const firstName   = user?.first_name  || user?.firstName  || '';
  const lastName    = user?.last_name   || user?.lastName   || '';
  const fullName    = `${firstName} ${lastName}`.trim() || user?.email?.split('@')[0] || 'User';
  const initials    = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || fullName[0]?.toUpperCase();
  const role        = user?.role || 'student';
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const dashboardPath =
    role === 'admin'   ? '/admin/dashboard'   :
    role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard';

  const roleColor = {
    admin:   'bg-violet-600',
    teacher: 'bg-emerald-600',
    student: 'bg-blue-600',
  }[role] || 'bg-gray-600';

  const roleBadge = {
    admin:   { label: 'Admin',   cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    teacher: { label: 'Teacher', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    student: { label: 'Student', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  }[role] || { label: role, cls: 'bg-gray-50 text-gray-600 border-gray-200' };

  useEffect(() => {
    if (!user) return;
    api.get('/notifications').then(r => setNotifications(r.data || [])).catch(() => {});
  }, [user]);

  useEffect(() => {
    const h = (e) => {
      if (dropRef.current  && !dropRef.current.contains(e.target))  setDropOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleNotifOpen = () => {
    setNotifOpen(p => {
      const next = !p;
      if (next && unreadCount > 0) {
        setNotifications(n => n.map(x => ({ ...x, is_read: true })));
        api.patch('/notifications/read-all').catch(() => {});
      }
      return next;
    });
  };

  const handleLogout = async () => { await logout?.(); navigate('/login'); };

  return (
    <nav className="w-full bg-[#0f0f10] border-b border-white/[0.08] sticky top-0 z-50 h-12 flex items-center px-4 md:px-5">
      {/* LEFT */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to={dashboardPath} className="flex items-center gap-2 group">
          <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center">
            <span className="text-white text-xs font-black">A</span>
          </div>
          <span className="text-white text-sm font-semibold tracking-tight hidden sm:block">AISchoolonair</span>
        </Link>
        <span className="text-white/20 hidden sm:block">/</span>
        <span className={`hidden sm:inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${roleBadge.cls}`}>
          {roleBadge.label}
        </span>
      </div>

      {/* RIGHT */}
      <div className="ml-auto flex items-center gap-1">
        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button onClick={handleNotifOpen}
            className="relative p-2 rounded-md text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors">
            <Bell size={15} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-400 rounded-full" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-[#1a1a1b] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/[0.06]">
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Notifications</p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-white/30 text-center">No notifications</p>
                ) : notifications.slice(0, 10).map(n => (
                  <div key={n.id} className={`px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] ${!n.is_read ? 'border-l-2 border-l-blue-500' : ''}`}>
                    <p className="text-xs font-medium text-white/80">{n.title}</p>
                    <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={dropRef} className="relative">
          <button onClick={() => setDropOpen(o => !o)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.06] transition-colors">
            <div className={`w-6 h-6 rounded-full ${roleColor} flex items-center justify-center text-[10px] font-bold text-white`}>
              {initials}
            </div>
            <span className="text-white/70 text-xs hidden sm:block max-w-[120px] truncate">{fullName}</span>
            <ChevronDown size={12} className="text-white/30" />
          </button>
          {dropOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-[#1a1a1b] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-white/[0.06]">
                <p className="text-xs font-semibold text-white/80 truncate">{fullName}</p>
                <p className="text-xs text-white/30 truncate mt-0.5">{user?.email}</p>
              </div>
              <button onClick={() => { navigate(dashboardPath); setDropOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
                <LayoutDashboard size={13} /> Dashboard
              </button>
              <button onClick={() => { navigate(`/${role}/settings`); setDropOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors">
                <Settings size={13} /> Settings
              </button>
              <div className="border-t border-white/[0.06]" />
              <button onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-white/[0.06] transition-colors">
                <LogOut size={13} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
