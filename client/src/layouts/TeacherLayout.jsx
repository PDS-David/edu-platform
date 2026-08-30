import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/apiClient";
import TopNav from "../components/TopNav";
import PortalSidebar from "../components/PortalSidebar";
import {
  Users, BarChart2, PenTool, BookOpen, Upload, Plus, FileText, AlertCircle,
} from "lucide-react";

// Real shared shell for the whole /teacher/* tree -- same fix as
// AdminLayout.jsx. Previously this was just `<Outlet />`, so every teacher
// page except the dashboard itself (Content, Resources, Add Question, Past
// Papers, Settings) had no sidebar at all.
const TEACHER_DASHBOARD_PATH = "/teacher/dashboard";

const TEACHER_NAV_ITEMS = [
  { id: "classes",     kind: "tab",  icon: Users,     label: "My Classes"      },
  { id: "analytics",   kind: "tab",  icon: BarChart2, label: "Analytics"       },
  { id: "testbuilder", kind: "tab",  icon: PenTool,   label: "Test Builder"    },
  { id: "content",     kind: "link", icon: BookOpen,  label: "Content Manager", link: "/teacher/content"       },
  { id: "resources",   kind: "link", icon: Upload,    label: "Resources",      link: "/teacher/resources"     },
  { id: "addq",        kind: "link", icon: Plus,      label: "Add Question",   link: "/teacher/questions/add" },
  { id: "pastpapers",  kind: "link", icon: FileText,  label: "Past Papers",    link: "/teacher/past-papers"   },
];

function getDisplayName(user) {
  return user?.first_name || user?.firstName || user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "Teacher";
}

export default function TeacherLayout() {
  const { user } = useAuth();
  const [assignedSubjects, setAssignedSubjects] = useState(null);

  useEffect(() => {
    api.get("/teacher/my-subjects")
      .then(r => setAssignedSubjects(r.data ?? []))
      .catch(() => setAssignedSubjects([]));
  }, []);

  const subjectsLoading = assignedSubjects === null;
  const hasSubjects = (assignedSubjects?.length ?? 0) > 0;

  const subjectPills = (
    <>
      {!subjectsLoading && hasSubjects && (
        <div className="mx-3 mb-3 space-y-1">
          {(assignedSubjects || []).slice(0, 3).map(s => (
            <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 bg-white/60 border border-[#e8e4dd] rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-[#d97757] shrink-0" />
              <span className="text-[10px] font-medium text-[#6b6259] truncate">{s.name}</span>
            </div>
          ))}
        </div>
      )}
      {!subjectsLoading && !hasSubjects && (
        <div className="mx-3 mb-3 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-[10px] text-amber-700 flex items-center gap-1">
            <AlertCircle size={11} className="shrink-0" /> No subjects assigned
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <TopNav />
      <div className="flex">
        <PortalSidebar
          roleLabel="Teacher"
          displayName={getDisplayName(user)}
          items={TEACHER_NAV_ITEMS}
          dashboardPath={TEACHER_DASHBOARD_PATH}
          tabParam="tab"
          extra={subjectPills}
        />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
