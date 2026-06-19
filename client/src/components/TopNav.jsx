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
    // The notifications endpoint returns { success, count, data: [...] }
    // but apiClient normalises it so r.data is already the array (via data?.data ?? data)
    api.get('/notifications')
      .then(r => setNotifications(Array.isArray(r.data) ? r.data : []))
      .catch(() => setNotifications([]));
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
        // DEF-008: Do NOT mark notifications read client-side until the server
        // confirms success. Previously, state was mutated before the API call,
        // permanently silencing the badge even when the route was missing (DEF-002).
        const prevNotifications = notifications;
        api.patch('/notifications/read-all')
          .then(() => {
            // Server confirmed — now update local state
            setNotifications(n => n.map(x => ({ ...x, is_read: true })));
          })
          .catch(() => {
            // Server failed — leave state unchanged (unread badge remains)
            setNotifications(prevNotifications);
          });
      }
      return next;
    });
  };

  const handleLogout = async () => { await logout?.(); navigate('/login'); };

  return (
    <nav className="w-full bg-white border-b border-gray-200 sticky top-0 z-50 h-14 flex items-center px-4 md:px-6 shadow-sm">
      {/* LEFT — logos: AISchoolonair | LessonTeacher */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to={dashboardPath} className="flex items-center gap-2 group">
          <img src="/logo.svg" alt="AISchoolonair" className="w-7 h-7 shrink-0" />
          <span className="hidden sm:block text-gray-900 text-sm font-bold tracking-tight">AISchoolonair</span>
        </Link>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 shrink-0" />

        {/* LessonTeacher logo — hidden on very small screens */}
        <img src="/lessonteacher_logo.jpg" alt="LessonTeacher" className="hidden sm:block h-6 w-auto object-contain shrink-0" style={{maxWidth:'88px'}} />

        <div className="hidden md:block h-6 w-px bg-gray-200 mx-0.5" />
        <span className={`hidden md:inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${roleBadge.cls}`}>
          {roleBadge.label}
        </span>
      </div>

      {/* RIGHT */}
      <div className="ml-auto flex items-center gap-1">
        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button onClick={handleNotifOpen}
            className="relative p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notifications</p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-gray-400 text-center">No notifications yet</p>
                ) : notifications.slice(0, 10).map(n => (
                  <div key={n.id} className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${!n.is_read ? 'border-l-2 border-l-blue-500' : ''}`}>
                    <p className="text-xs font-semibold text-gray-800">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={dropRef} className="relative">
          <button onClick={() => setDropOpen(o => !o)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <div className={`w-7 h-7 rounded-full ${roleColor} flex items-center justify-center text-[11px] font-bold text-white`}>
              {initials}
            </div>
            <span className="text-gray-700 text-sm hidden sm:block max-w-[140px] truncate font-medium">{fullName}</span>
            <ChevronDown size={13} className="text-gray-400" />
          </button>
          {dropOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{user?.email}</p>
              </div>
              <button onClick={() => { navigate(dashboardPath); setDropOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                <LayoutDashboard size={14} /> Dashboard
              </button>
              <button onClick={() => { navigate(`/${role}/settings`); setDropOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                <Settings size={14} /> Settings
              </button>
              <div className="border-t border-gray-100" />
              <button onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
