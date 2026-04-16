import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import branding from '../config/branding';
import { MessageSquare, ChevronDown, LogOut, Settings, Bell } from 'lucide-react';

export default function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [dropOpen, setDropOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const dropRef = useRef(null);
  const notifRef = useRef(null);

  const firstName = user?.firstName || user?.first_name || '';
  const lastName = user?.lastName || user?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || 'User';
  const initials = (firstName[0] || '') + (lastName[0] || '');
  const role = user?.role || 'student';

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const dashboardPath =
    role === 'admin'
      ? '/admin/dashboard'
      : role === 'teacher'
      ? '/teacher/dashboard'
      : '/student/dashboard';

  // ── Notifications fetch ─────────────────────────────
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const res = await api.get('/notifications');
        setNotifications(res.data || []);
      } catch {
        setNotifications([]);
      }
    })();
  }, [user]);

  // ── Outside click handler ───────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Notifications toggle (FIXED STATE BUG) ───────────
  const handleNotifOpen = async () => {
    setNotifOpen(prev => {
      const next = !prev;

      if (next && unreadCount > 0) {
        setNotifications(n => n.map(x => ({ ...x, is_read: true })));
        api.patch('/notifications/read-all').catch(() => {});
      }

      return next;
    });
  };

  const handleLogout = async () => {
    await logout?.();
    navigate('/login');
  };

  return (
    <nav className="w-full bg-white border-b border-gray-100 sticky top-0 z-50 h-14 flex items-center px-4 md:px-6">

      {/* LEFT */}
      <div className="flex items-center gap-3 shrink-0">
        <Link to="/" className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-blue-50">
          <div className="grid grid-cols-2 gap-0.5 w-5 h-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-2 h-2 rounded-sm bg-blue-600" />
            ))}
          </div>
        </Link>

        <span className="px-2 py-0.5 bg-blue-600 text-white text-sm font-bold rounded">
          AISchoolonair
        </span>

        <span className="hidden md:block h-6 w-px bg-gray-200" />

        <img src={branding.logo.main} className="hidden md:block h-7" />
      </div>

      {/* RIGHT */}
      <div className="ml-auto flex items-center gap-3">

        {user?.role === 'student' && user?.subscription_status === 'free' && (
          <Link to="/pricing" className="bg-amber-400 text-white text-xs px-3 py-1.5 rounded-md">
            Upgrade
          </Link>
        )}

        {/* Notifications */}
        <div ref={notifRef}>
          <button onClick={handleNotifOpen} className="relative p-1.5">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* User */}
        <div ref={dropRef}>
          <button onClick={() => setDropOpen(o => !o)} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
              {initials || fullName[0]}
            </div>
            <ChevronDown size={14} />
          </button>

          {dropOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white shadow rounded-xl border">
              <button onClick={() => navigate(dashboardPath)} className="w-full px-4 py-2 text-left">
                Dashboard
              </button>
              <button onClick={() => navigate('/settings')} className="w-full px-4 py-2 text-left">
                Settings
              </button>
              <button onClick={handleLogout} className="w-full px-4 py-2 text-left text-red-500">
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
