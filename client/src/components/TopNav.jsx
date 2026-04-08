// client/src/components/TopNav.jsx
// Top navigation bar matching AI Buddy exactly.
// Changes (P9):
//   1. Upgrade button only for free students
//   2. Notifications bell with unread badge
//   3. Role-aware dashboard link in dropdown
//   4. Blue "EAC" box logo

import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import branding from '../config/branding';
import { MessageSquare, ChevronDown, LogOut, Settings, Bell } from 'lucide-react';

export default function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropOpen,   setDropOpen]   = useState(false);
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [notifications, setNotifications] = useState([]);
  const dropRef  = useRef(null);
  const notifRef = useRef(null);

  const firstName = user?.firstName || user?.first_name || '';
  const lastName  = user?.lastName  || user?.last_name  || '';
  const fullName  = `${firstName} ${lastName}`.trim() || 'User';
  const initials  = (firstName[0] || '') + (lastName[0] || '');
  const role      = user?.role || 'student';

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Dashboard link based on role
  const dashboardPath =
    role === 'admin'   ? '/admin/dashboard'   :
    role === 'teacher' ? '/teacher/dashboard' :
                         '/student/dashboard';

  // Fetch notifications on mount
  useEffect(() => {
    if (!user) return;
    api.get('/notifications')
      .then(r => setNotifications(r.data.data || []))
      .catch(() => {});
  }, [user]);

  // Mark all read when notification panel opens
  const handleNotifOpen = () => {
    setNotifOpen(o => !o);
    if (!notifOpen && unreadCount > 0) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      api.patch('/notifications/read-all').catch(() => {});
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current  && !dropRef.current.contains(e.target))  setDropOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="w-full bg-white border-b border-gray-100 sticky top-0 z-50 h-14 flex items-center px-4 md:px-6">

      {/* Left — home button (four dots) + product logo + org logo */}
      <div className="flex items-center gap-3 shrink-0">

        {/* Four-dot grid = Home button (goes to landing page `/`) */}
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

        {/* AISchoolonair — product logo (not a nav link) */}
        <span className="flex items-center gap-1">
          <span style={{ background: '#2563eb' }} className="px-1.5 py-0.5 rounded text-white font-bold text-sm">EAC</span>
          <span className="font-semibold text-gray-900">buddy</span>
          <span className="hidden sm:inline text-gray-300 mx-1 text-lg font-light">|</span>
          <span className="hidden sm:inline text-gray-500 text-sm font-medium">Learning Platform</span>
        </span>

        {/* Divider */}
        <span className="hidden md:block h-6 w-px bg-gray-200" />

        {/* EAC org logo — visual brand, not a nav link */}
        <img
          src={branding.logo.main}
          alt="Educational Advancement Centre"
          className="hidden md:block h-7 w-auto object-contain"
        />
      </div>

      {/* Right */}
      <div className="ml-auto flex items-center gap-2 md:gap-3">

        {/* CHANGE 1 — Upgrade button: only for free students */}
        {user?.role === 'student' && user?.subscription_status === 'free' && (
          <Link
            to="/pricing"
            className="bg-amber-400 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-colors shrink-0"
          >
            Upgrade
          </Link>
        )}

        {/* CHANGE 2 — Notifications bell */}
        <div className="relative" ref={notifRef} onClick={e => e.stopPropagation()}>
          <button
            onClick={handleNotifOpen}
            className="relative p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
              <div className="px-4 py-2 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-800">Notifications</p>
              </div>
              {notifications.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No notifications yet</p>
              ) : (
                notifications.slice(0, 5).map(n => (
                  <div key={n.id} className={`px-4 py-3 border-b border-gray-50 last:border-0 ${!n.is_read ? 'bg-blue-50/50' : ''}`}>
                    <p className="text-xs font-semibold text-gray-800">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Chat icon */}
        <button className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors hidden sm:block">
          <MessageSquare size={18} />
        </button>

        {/* User avatar + dropdown (CHANGE 3: role-aware dashboard link) */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setDropOpen(o => !o)}
            className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 uppercase">
              {initials || fullName[0]}
            </div>
            <div className="hidden md:flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold text-gray-800 truncate max-w-[120px]">{fullName}</span>
              <span className="text-xs text-gray-400 capitalize">{role}</span>
            </div>
            <ChevronDown size={14} className="text-gray-400 hidden md:block" />
          </button>

          {dropOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
              <div className="px-4 py-2 border-b border-gray-50">
                <p className="text-sm font-semibold text-gray-800">{fullName}</p>
                <p className="text-xs text-gray-400 capitalize">{role}</p>
              </div>
              <button
                onClick={() => { setDropOpen(false); navigate(dashboardPath); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="grid grid-cols-2 gap-0.5 w-4 h-4 shrink-0">
                  {[...Array(4)].map((_, i) => <div key={i} className="w-1.5 h-1.5 rounded-sm bg-blue-500" />)}
                </div>
                Dashboard
              </button>
              <button
                onClick={() => { setDropOpen(false); navigate('/settings'); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors text-left"
              >
                <Settings size={15} /> Settings
              </button>
              <div className="border-t border-gray-50 my-1" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

