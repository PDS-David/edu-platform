import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import TopNav from "../components/TopNav";
import PortalSidebar from "../components/PortalSidebar";
import {
  Zap, Shield, Users, BookOpen, GraduationCap, Layers, UserCheck,
  Sparkles, Upload, School, Settings,
} from "lucide-react";

// Real shared shell for the whole /admin/* tree. Previously this was just
// `<Outlet />` with nothing else -- the sidebar only ever existed hand-copied
// into AdminDashboard.jsx itself, so every other admin page (Schools,
// Students, Question Review, English/Language Masterclass, Settings) had no
// sidebar at all. Now every child route gets TopNav + the sidebar for free.
const ADMIN_DASHBOARD_PATH = "/admin/dashboard";

const ADMIN_NAV_ITEMS = [
  { id: "analytics",  kind: "tab",  icon: Zap,           label: "Analytics"   },
  { id: "auditlog",   kind: "tab",  icon: Shield,        label: "Audit Log"   },
  { id: "users",      kind: "tab",  icon: Users,         label: "Users"       },
  { id: "content",    kind: "tab",  icon: BookOpen,      label: "Content"     },
  { id: "catalog",    kind: "tab",  icon: GraduationCap, label: "Catalog"     },
  { id: "topics",     kind: "tab",  icon: Layers,        label: "Topics"      },
  { id: "teachers",   kind: "tab",  icon: UserCheck,     label: "Teachers"    },
  { id: "aigenerate", kind: "tab",  icon: Sparkles,      label: "AI Generate" },
  { id: "bulkupload", kind: "tab",  icon: Upload,        label: "Bulk Upload" },
  { id: "pastpapers", kind: "tab",  icon: BookOpen,      label: "Past Papers" },
  { id: "schools",    kind: "link", icon: School,        label: "Schools",    link: "/admin/schools"  },
  { id: "students",   kind: "link", icon: GraduationCap, label: "Students",   link: "/admin/students" },
  { id: "settings",   kind: "tab",  icon: Settings,      label: "Quick Links" },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const firstName = user?.first_name || user?.firstName || user?.email?.split("@")[0] || "Admin";

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <TopNav />
      <div className="flex">
        <PortalSidebar
          roleLabel="Admin"
          displayName={firstName}
          items={ADMIN_NAV_ITEMS}
          dashboardPath={ADMIN_DASHBOARD_PATH}
          tabParam="panel"
        />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
