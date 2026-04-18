import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link, Outlet, useLocation } from "react-router-dom";
import api from "../services/apiClient";
import {
  Users, Plus, CheckCircle, Loader2, AlertTriangle,
  BarChart2, X, PenTool, Copy, BookOpen,
  ChevronRight, UserCheck,
} from "lucide-react";
import TopNav from "../components/TopNav";
import { useAuth } from "../context/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDisplayName(user) {
  if (!user) return "Teacher";
  const first = user.firstName || user.first_name;
  if (first?.trim()) return first.trim();
  const full = user.lastName || user.last_name || user.name || "";
  if (full.trim()) return full.trim().split(" ")[0];
  if (user.email) return user.email.split("@")[0];
  return "Teacher";
}

function Toast({ msg, type, onClose }) {
  return (
    <div
      className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white
        ${type === "success" ? "bg-gray-900" : "bg-red-600"}`}
    >
      {type === "success"
        ? <CheckCircle size={14} className="text-teal-400" />
        : <AlertTriangle size={14} />}
      {msg}
      <button onClick={onClose}><X size={13} className="opacity-60" /></button>
    </div>
  );
}

// ── Class Analytics Panel ─────────────────────────────────────────────────────

function ClassAnalyticsPanel({ cls, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/teacher/class/${cls.id}/analytics`)
      .then(r => setData(r.data))
      .catch(() => setData({ students: [] }))
      .finally(() => setLoading(false));
  }, [cls.id]);

  return (
    <div className="bg-white rounded-2xl border p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">{cls.name} — Student Analytics</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={22} className="animate-spin text-teal-400" />
        </div>
      ) : !data?.students?.length ? (
        <p className="text-sm text-gray-400 text-center py-6">
          No students in this class yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b">
                <th className="pb-2 font-medium">Student</th>
                <th className="pb-2 font-medium text-right">Attempts</th>
                <th className="pb-2 font-medium text-right">Accuracy</th>
                <th className="pb-2 font-medium text-right">Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.students.map(s => {
                const pct = parseFloat(s.accuracy_pct) || 0;
                const color =
                  pct >= 70 ? "text-green-600"
                  : pct >= 40 ? "text-amber-600"
                  : "text-red-500";
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="py-2">
                      <p className="font-medium text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.email}</p>
                    </td>
                    <td className="py-2 text-right text-gray-600">{s.attempts}</td>
                    <td className={`py-2 text-right font-semibold ${color}`}>
                      {s.attempts > 0 ? `${pct}%` : "—"}
                    </td>
                    <td className="py-2 text-right text-gray-500">
                      {s.streak > 0 ? `🔥 ${s.streak}d` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Classes Tab ───────────────────────────────────────────────────────────────

function ClassesTab() {
  const [classes,    setClasses]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName,    setNewName]    = useState("");
  const [creating,   setCreating]   = useState(false);
  const [copied,     setCopied]     = useState(null);
  const [toast,      setToast]      = useState(null);
  const [expanded,   setExpanded]   = useState(null); // class id with analytics open

  const load = useCallback(() => {
    setLoading(true);
    api.get("/teacher/classes")
      .then(r => setClasses(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createClass = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post("/teacher/classes", { name: newName.trim() });
      setNewName("");
      setShowCreate(false);
      setToast({ type: "success", msg: "Class created!" });
      load();
    } catch {
      setToast({ type: "error", msg: "Failed to create class." });
    } finally {
      setCreating(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {classes.length} class{classes.length !== 1 ? "es" : ""}
        </p>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={14} /> New Class
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex gap-3 items-center">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && createClass()}
            placeholder="Class name (e.g. Year 12 Biology)"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            autoFocus
          />
          <button
            onClick={createClass}
            disabled={creating || !newName.trim()}
            className="bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : "Create"}
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewName(""); }}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Empty state */}
      {classes.length === 0 && !showCreate && (
        <div className="text-center py-16 bg-white rounded-2xl border">
          <Users size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No classes yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Create a class and share the join code with your students.
          </p>
        </div>
      )}

      {/* Class cards */}
      {classes.map(cls => (
        <div key={cls.id} className="bg-white rounded-2xl border p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-800">{cls.name}</p>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <UserCheck size={11} />
                {cls.student_count ?? 0} student{cls.student_count !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Join code badge */}
            <button
              onClick={() => copyCode(cls.join_code)}
              className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-mono font-semibold px-3 py-1.5 rounded-lg transition-colors"
              title="Copy join code"
            >
              {copied === cls.join_code
                ? <><CheckCircle size={12} className="text-green-500" /> Copied!</>
                : <><Copy size={12} /> {cls.join_code}</>}
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setExpanded(expanded === cls.id ? null : cls.id)}
              className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800 font-medium border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors"
            >
              <BarChart2 size={13} />
              {expanded === cls.id ? "Hide Analytics" : "View Analytics"}
            </button>
          </div>

          {/* Inline analytics */}
          {expanded === cls.id && (
            <ClassAnalyticsPanel
              cls={cls}
              onClose={() => setExpanded(null)}
            />
          )}
        </div>
      ))}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Test Builder Tab ──────────────────────────────────────────────────────────

function TestBuilderTab({ subjects }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border p-6 text-center">
        <PenTool size={36} className="text-teal-300 mx-auto mb-3" />
        <p className="font-semibold text-gray-800 mb-1">Add Questions to Your Bank</p>
        <p className="text-sm text-gray-400 mb-4">
          Questions you add are immediately available for practice and tests.
        </p>
        <button
          onClick={() => navigate("/teacher/questions/add")}
          className="bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
        >
          + Add Question
        </button>
      </div>

      {subjects.length > 0 && (
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Your Subjects</p>
          <div className="space-y-2">
            {subjects.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm text-gray-600">
                <BookOpen size={14} className="text-teal-400 shrink-0" />
                <span>{s.name}</span>
                {(s.exam_board_name || s.exam_board_code) && (
                  <span className="text-gray-400 text-xs">
                    · {s.exam_board_name || s.exam_board_code}
                    {s.level ? ` (${s.level})` : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function TeacherDashboard() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  const [activeTab,        setActiveTab]        = useState("classes");
  const [assignedSubjects, setAssignedSubjects] = useState(null);

  useEffect(() => {
    api.get("/teacher/my-subjects")
      .then(r => {
        const raw = r.data ?? [];
        // Deduplicate by subject id
        const seen   = new Set();
        const unique = raw.filter(s => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
        setAssignedSubjects(unique);
      })
      .catch(() => setAssignedSubjects([]));
  }, []);

  const subjectsLoading = assignedSubjects === null;
  const hasSubjects     = (assignedSubjects?.length ?? 0) > 0;
  const displayName     = getDisplayName(user);

  // Only show tab content on the exact dashboard route,
  // not when a sub-route outlet is active (e.g. /teacher/questions/add)
  const isDashboard =
    location.pathname === "/teacher" ||
    location.pathname === "/teacher/" ||
    location.pathname === "/teacher/dashboard";

  const tabs = [
    { id: "classes",     label: "My Classes",   icon: Users    },
    { id: "analytics",   label: "Analytics",    icon: BarChart2 },
    { id: "testbuilder", label: "Test Builder",  icon: PenTool  },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {/* HEADER */}
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-white/50 text-xs">Teacher Dashboard</p>
            <h1 className="text-white text-xl font-bold">
              Welcome back, {displayName} 👋
            </h1>
          </div>
          {hasSubjects && (
            <Link
              to="/teacher/resources"
              className="bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              Upload Resources
            </Link>
          )}
        </div>
      </div>

      {/* SUBJECT PILLS */}
      {!subjectsLoading && (
        <div className="px-4 py-3 border-b bg-white">
          {hasSubjects ? (
            <div className="max-w-4xl mx-auto flex flex-wrap gap-2">
              {assignedSubjects.map(s => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 text-sm bg-teal-50 border border-teal-200 text-teal-700 rounded-full px-3 py-1"
                >
                  <span className="font-medium">{s.name}</span>
                  {(s.exam_board_name || s.exam_board_code || s.level) && (
                    <span className="text-teal-500 text-xs">
                      · {s.exam_board_name || s.exam_board_code}
                      {s.level ? ` (${s.level})` : ""}
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-700 max-w-4xl mx-auto">
              ⚠️ No subjects assigned yet — contact your admin.
            </p>
          )}
        </div>
      )}

      {/* TABS — only show on the dashboard itself */}
      {isDashboard && (
        <div className="bg-white border-b sticky top-14 z-10">
          <div className="max-w-4xl mx-auto flex px-4">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? "text-teal-600 border-teal-500"
                    : "text-gray-400 border-transparent hover:text-gray-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {isDashboard ? (
          <>
            {activeTab === "classes"     && <ClassesTab />}
            {activeTab === "analytics"   && (
              <div className="bg-white rounded-2xl border p-8 text-center">
                <BarChart2 size={36} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Full analytics coming soon</p>
                <p className="text-sm text-gray-400 mt-1">
                  View per-student performance in the My Classes tab.
                </p>
              </div>
            )}
            {activeTab === "testbuilder" && (
              <TestBuilderTab subjects={assignedSubjects ?? []} />
            )}
          </>
        ) : (
          /* Sub-route (e.g. /teacher/questions/add) renders here */
          <Outlet />
        )}
      </div>
    </div>
  );
}
