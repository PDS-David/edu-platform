import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import TopNav from "../components/TopNav";
import api from "../services/apiClient";
import {
  FileText, Video, Music, File, ExternalLink, Download,
  Zap, ClipboardList, BarChart2, BookOpen, TrendingUp,
} from "lucide-react";

// ── Push type config ──────────────────────────────────────────────────────────
const PUSH_TYPE_META = {
  quiz:              { label: "⚡ Quizzes",             color: "bg-amber-50 border-amber-200"  },
  practice_test:     { label: "📝 Practice Tests",     color: "bg-blue-50 border-blue-200"    },
  learning_material: { label: "📚 Learning Materials", color: "bg-teal-50 border-teal-200"    },
};
const PUSH_ORDER = ["quiz", "practice_test", "learning_material"];

function FileIcon({ type, size = 16 }) {
  if (type === "video") return <Video    size={size} className="text-blue-500"   />;
  if (type === "audio") return <Music    size={size} className="text-purple-500" />;
  if (type === "pdf")   return <FileText size={size} className="text-red-500"    />;
  return <File size={size} className="text-gray-400" />;
}

function ProgressBar({ pct, color = "bg-indigo-500" }) {
  const clamped = Math.min(100, Math.max(0, pct || 0));
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
      <div
        className={`h-full ${color} rounded-full transition-all duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const firstName =
    user?.first_name || user?.firstName ||
    user?.name?.split(" ")[0] ||
    user?.email?.split("@")[0] || "there";

  // ── State ─────────────────────────────────────────────────────────────────
  const [subjects,         setSubjects]         = useState([]);
  const [loadingSubjects,  setLoadingSubjects]  = useState(true);
  const [subjectProgress,  setSubjectProgress]  = useState({});

  const [resources,        setResources]        = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);

  const [recentScores,     setRecentScores]     = useState([]);
  const [loadingScores,    setLoadingScores]    = useState(true);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadSubjects = useCallback(async () => {
    try {
      const res = await api.get("/students/my-subjects");
      setSubjects(res.data || []);
    } catch (err) {
      console.error("Subjects load failed:", err);
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  const loadSubjectProgress = useCallback(async () => {
    try {
      const res = await api.get("/analytics/subject-breakdown");
      const map = {};
      (res.data || []).forEach(row => {
        map[row.subject_id] = parseFloat(row.accuracy_pct) || 0;
      });
      setSubjectProgress(map);
    } catch {
      // non-critical — progress bars stay empty
    }
  }, []);

  const loadResources = useCallback(async () => {
    try {
      const res = await api.get("/resources/my-assignments");
      setResources(res.data || []);
    } catch (err) {
      console.error("Resources load failed:", err);
    } finally {
      setLoadingResources(false);
    }
  }, []);

  const loadRecentScores = useCallback(async () => {
    try {
      const res = await api.get("/quizzes/history");
      setRecentScores(res.data || []);
    } catch (err) {
      console.error("Scores load failed:", err);
    } finally {
      setLoadingScores(false);
    }
  }, []);

  useEffect(() => {
    loadSubjects();
    loadSubjectProgress();
    loadResources();
    loadRecentScores();
  }, [loadSubjects, loadSubjectProgress, loadResources, loadRecentScores]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const groupedByType = useMemo(() => {
    const groups = {};
    for (const r of resources) {
      const pt = r.push_type || "learning_material";
      if (!groups[pt]) groups[pt] = [];
      groups[pt].push(r);
    }
    return groups;
  }, [resources]);

  const totalResources = resources.length;

  const isRootDashboard =
    location.pathname === "/student" ||
    location.pathname === "/student/" ||
    location.pathname === "/student/dashboard";

  const firstSubjectId = subjects[0]?.id;

  const quickLinks = [
    {
      label: "Past Papers",
      icon:  <FileText size={20} className="text-blue-500" />,
      path:  "/past-papers",
      bg:    "bg-blue-50 border-blue-100",
    },
    {
      label: "Practice Mode",
      icon:  <Zap size={20} className="text-amber-500" />,
      path:  "/student/practice",
      bg:    "bg-amber-50 border-amber-100",
    },
    {
      label: "Mock Exam",
      icon:  <ClipboardList size={20} className="text-rose-500" />,
      path:  firstSubjectId ? `/student/mock/${firstSubjectId}` : "/student/practice",
      bg:    "bg-rose-50 border-rose-100",
    },
    {
      label: "Analytics",
      icon:  <BarChart2 size={20} className="text-green-500" />,
      path:  "/student/analytics",
      bg:    "bg-green-50 border-green-100",
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">Hi, {firstName} 👋</h1>

        <Outlet />

        {isRootDashboard && (
          <>
            {/* MY SUBJECTS */}
            <div className="bg-white p-4 rounded-xl mb-4 shadow-sm">
              <h2 className="font-semibold mb-3 text-gray-800">My Subjects</h2>

              {loadingSubjects ? (
                <p className="text-sm text-gray-400">Loading subjects…</p>
              ) : subjects.length === 0 ? (
                <div className="text-center py-6">
                  <BookOpen size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No subjects enrolled yet.</p>
                  <button
                    onClick={() => navigate("/subjects")}
                    className="mt-2 text-sm text-indigo-600 font-medium hover:underline"
                  >
                    Browse subjects →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {subjects.map((subject) => {
                    const pct = subjectProgress[subject.id] ?? null;
                    const barColor =
                      pct === null  ? "bg-gray-200"
                      : pct >= 75   ? "bg-green-500"
                      : pct >= 50   ? "bg-amber-400"
                      :               "bg-red-400";
                    return (
                      <button
                        key={subject.id}
                        onClick={() => navigate(`/student/subject/${subject.id}`)}
                        className="border p-3 rounded-xl text-left hover:bg-gray-50 transition-colors"
                      >
                        <p className="font-semibold text-sm text-gray-800 truncate">
                          {subject.icon_emoji && (
                            <span className="mr-1">{subject.icon_emoji}</span>
                          )}
                          {subject.name}
                        </p>
                        {(subject.exam_board_code || subject.level) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {subject.exam_board_code}
                            {subject.level ? ` · ${subject.level}` : ""}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {pct === null ? "No activity yet" : `${pct}% accuracy`}
                          </span>
                        </div>
                        <ProgressBar pct={pct ?? 0} color={barColor} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* QUICK LINKS */}
            <div className="mb-4">
              <h2 className="font-semibold mb-3 text-gray-800">Quick Links</h2>
              <div className="grid grid-cols-2 gap-3">
                {quickLinks.map(({ label, icon, path, bg }) => (
                  <button
                    key={label}
                    onClick={() => navigate(path)}
                    className={`border ${bg} p-4 rounded-xl text-left flex items-center gap-3 hover:opacity-80 transition-opacity shadow-sm`}
                  >
                    {icon}
                    <span className="text-sm font-semibold text-gray-700">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* RECENT QUIZ ACTIVITY */}
            <div className="bg-white p-4 rounded-xl mb-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Recent Quiz Activity</h2>
                <TrendingUp size={16} className="text-gray-300" />
              </div>

              {loadingScores ? (
                <p className="text-sm text-gray-400">Loading scores…</p>
              ) : recentScores.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400">No quiz activity yet.</p>
                  <button
                    onClick={() => navigate("/student/practice")}
                    className="mt-1 text-sm text-indigo-600 font-medium hover:underline"
                  >
                    Start practising →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentScores.slice(0, 5).map((row, i) => {
                    const pct = parseFloat(row.accuracy_pct) || 0;
                    const barColor =
                      pct >= 75  ? "bg-green-500"
                      : pct >= 50 ? "bg-amber-400"
                      :             "bg-red-400";
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-16 shrink-0">
                          {new Date(row.date).toLocaleDateString(undefined, {
                            month: "short", day: "numeric",
                          })}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColor} rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-600 w-9 text-right shrink-0">
                          {pct}%
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">({row.attempts}Q)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ASSIGNED FILES */}
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">My Assigned Files</h2>
                {totalResources > 0 && (
                  <span className="text-xs text-gray-400">
                    {totalResources} file{totalResources !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {loadingResources ? (
                <p className="text-sm text-gray-400">Loading files…</p>
              ) : totalResources === 0 ? (
                <p className="text-sm text-gray-400">No files assigned yet.</p>
              ) : (
                <div className="space-y-5">
                  {PUSH_ORDER.filter(pt => groupedByType[pt]?.length > 0).map(pt => {
                    const meta  = PUSH_TYPE_META[pt];
                    const files = groupedByType[pt];
                    return (
                      <div key={pt}>
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">
                          {meta.label}
                        </h3>
                        <div className="space-y-2">
                          {files.map((file) => (
                            <div
                              key={`${file.id}-${file.push_type}`}
                              className={`border rounded-xl p-3 flex items-center gap-3 ${meta.color}`}
                            >
                              <FileIcon type={file.type || file.resource_type} size={18} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {file.title}
                                </p>
                                {file.subject_name && (
                                  <p className="text-xs text-gray-500">{file.subject_name}</p>
                                )}
                                {file.assigned_by_name && (
                                  <p className="text-xs text-gray-400">
                                    From: {file.assigned_by_name}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <a
                                  href={file.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-500 hover:text-blue-700"
                                  title="View"
                                >
                                  <ExternalLink size={15} />
                                </a>
                                <a
                                  href={file.file_url}
                                  download
                                  className="text-green-500 hover:text-green-700"
                                  title="Download"
                                >
                                  <Download size={15} />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
