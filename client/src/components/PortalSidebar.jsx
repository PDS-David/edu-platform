// client/src/components/PortalSidebar.jsx
//
// Shared left-nav sidebar for the Admin and Teacher portals. Previously each
// portal's sidebar was hand-copied into ONLY its dashboard page
// (AdminDashboard.jsx / TeacherDashboard.jsx), so every other page in each
// portal (Schools, Students, Question Review, Content, Past Papers, Add
// Question, Resources, English/Language Masterclass...) rendered with no
// sidebar at all — real per-page-patch drift, not a shared shell. This
// component now lives in AdminLayout.jsx / TeacherLayout.jsx instead, so
// every child route under /admin/* and /teacher/* gets it for free.
//
// Items come in two kinds:
//   - kind: 'link'  -> a real route. Highlighted active via location.pathname.
//   - kind: 'tab'   -> an in-page tab that only exists on the dashboard
//                      (AdminDashboard's activePanel / TeacherDashboard's
//                      activeTab). Clicking one always navigates to
//                      `${dashboardPath}?{tabParam}={id}` — TeacherDashboard
//                      already reads `?tab=` on mount (pre-existing N2 fix);
//                      AdminDashboard now reads `?panel=` the same way.
//                      This works correctly from ANY page in the portal, not
//                      just from the dashboard itself.

import { useNavigate, useLocation } from 'react-router-dom';

export default function PortalSidebar({ roleLabel, displayName, items, dashboardPath, tabParam, extra }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (item) => {
    if (item.kind === 'tab') {
      return location.pathname === dashboardPath &&
        new URLSearchParams(location.search).get(tabParam) === item.id;
    }
    return location.pathname === item.link || location.pathname.startsWith(item.link + '/');
  };

  const handleClick = (item) => {
    if (item.kind === 'tab') {
      navigate(`${dashboardPath}?${tabParam}=${item.id}`);
    } else {
      navigate(item.link);
    }
  };

  return (
    <aside className="w-52 shrink-0 min-h-[calc(100vh-48px)] bg-[#f0ede8] border-r border-[#e8e4dd] sticky top-12 self-start hidden md:block">
      <div className="px-3 py-5">
        <div className="px-3 py-2 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">{roleLabel}</p>
          <p className="text-xs font-semibold text-gray-700 mt-0.5 truncate">{displayName}</p>
        </div>

        {extra}

        <nav className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => handleClick(item)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                  active
                    ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]'
                    : 'text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60'
                }`}>
                {Icon && <Icon size={14} className={active ? 'text-[#d97757]' : 'text-[#b5a99a]'} />}
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
