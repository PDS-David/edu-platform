// client/src/components/PortalMobileNav.jsx
//
// Mobile navigation gap fix: the desktop sidebar (PortalSidebar.jsx) is
// `hidden md:block`, so on mobile it was providing nothing at all on any
// page in the Admin/Teacher portals — the mobile drawer + bottom nav bar
// only ever existed hand-built inside StudentDashboard.jsx (its "DEF-009"
// fix), never shared. This component ports that exact same proven pattern
// (overlay, slide-out drawer, bottom bar) so it works on every /admin/* and
// /teacher/* page, not just each portal's dashboard.
//
// Deliberately a separate component from PortalSidebar.jsx rather than
// merged into it: everything here uses `fixed` positioning, so it can be
// dropped in anywhere in the shell without needing to restructure the
// existing (working, unchanged) flex row PortalSidebar's desktop <aside>
// already sits in.

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export default function PortalMobileNav({ roleLabel, displayName, items, dashboardPath, tabParam, bottomItems }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    setDrawerOpen(false);
    if (item.kind === 'tab') {
      navigate(`${dashboardPath}?${tabParam}=${item.id}`);
    } else {
      navigate(item.link);
    }
  };

  // Bottom bar shows a short, curated subset (first 5 items by default) —
  // same "quick access, not everything" approach as StudentDashboard's
  // bottom nav, which only lists 5 of its ~7 sidebar items too.
  const bottomBarItems = bottomItems || items.slice(0, 5);

  return (
    <>
      {/* Slim hamburger bar — always visible on mobile, on every page,
          since it isn't tied to any one page's own header markup. */}
      <div className="md:hidden sticky top-12 z-30 bg-[#f9f7f4] border-b border-[#e8e4dd] px-4 py-2">
        <button onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2 text-xs font-semibold text-[#6b6259]">
          <Menu size={16} /> Menu
        </button>
      </div>

      {/* Overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Slide-out drawer */}
      <aside className={`fixed top-0 left-0 h-full w-64 z-50 bg-[#f0ede8] border-r border-[#e8e4dd] transform transition-transform duration-200 md:hidden flex flex-col ${
        drawerOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e4dd] shrink-0">
          <span className="text-sm font-bold text-gray-700">Navigation</span>
          <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-500">
            <X size={16} />
          </button>
        </div>
        <div className="px-3 py-4 overflow-y-auto flex-1">
          <div className="px-3 py-2 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">{roleLabel}</p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5 truncate">{displayName}</p>
          </div>
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

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex md:hidden">
        {bottomBarItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <button key={item.id} onClick={() => handleClick(item)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-[#d97757]' : 'text-gray-400 hover:text-gray-700'
              }`}>
              {Icon && <Icon size={17} />}
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
