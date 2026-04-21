import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import TopNav from "../components/TopNav";
import api from "../services/apiClient";
import {
  FileText, Video, Music, File, Download,
  Zap, ClipboardList, BarChart2, BookOpen, TrendingUp,
  Flame, Target, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Push type constants ───────────────────────────────────────────────────────
const PUSH_TYPE_ALIAS = {
  quiz:              "quiz",
  practice_test:     "practice_test",
  learning_material: "learning_material",
  lecture_material:  "learning_material",
  question_material: "practice_test",
  lecture:           "learning_material",
  material:          "learning_material",
  resource:          "learning_material",
  test:              "practice_test",
  exam:              "practice_test",
};

const PUSH_TYPE_META = {
  quiz:              { label: "⚡ Quizzes",            badge: "bg-amber-100 text-amber-700"  },
  practice_test:     { label: "📝 Practice Tests",     badge: "bg-blue-100 text-blue-700"    },
  learning_material: { label: "📚 Learning Materials", badge: "bg-violet-100 text-violet-700" },
  unknown:           { label: "📁 Other Files",         badge: "bg-gray-100 text-gray-600"    },
};

const resolvePushType = (raw) =>
  PUSH_TYPE_ALIAS[raw?.toLowerCase?.() ?? ""] ?? "unknown";

const PUSH_ORDER = ["quiz", "practice_test", "learning_material", "unknown"];

// ── File icon ─────────────────────────────────────────────────────────────────
function FileIcon({ type, size = 16 }) {
  if (type === "video") return <Video  size={size} className="text-blue-500"   />;
  if (type === "audio") return <Music  size={size} className="text-purple-500" />;
  if (type === "pdf")   return <FileText size={size} className="text-red-500"  />;
  return <File size={size} className="text-gray-400" />;
}

// ── Inline file viewer ────────────────────────────────────────────────────────
function InlineViewer({ file, base }) {
  const rawUrl = file.file_url?.startsWith("http") ? file.file_url : `${base}${file.file_url}`;
  const currentBase = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/api$/, "");
  const url = rawUrl.replace(/https?:\/\/eacbuddy-api\.onrender\.com/, currentBase);
  const type = (file.type || file.resource_type || "").toLowerCase();
  const ext  = url.split("?")[0].split(".").pop().toLowerCase();

  if (type === "video" || ["mp4","webm","mov"].includes(ext))
    return <div className="mt-2 rounded-xl overflow-hidden bg-black"><video src={url} controls className="w-full max-h-56 rounded-xl" /></div>;
  if (type === "audio" || ["mp3","wav","ogg","m4a"].includes(ext))
    return <audio src={url} controls className="w-full mt-2" />;
  if (type === "image" || ["jpg","jpeg","png","gif","webp"].includes(ext))
    return <img src={url} alt={file.title} className="mt-2 rounded-xl w-full max-h-48 object-contain bg-gray-100" />;

  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-purple-100 bg-purple-50">
      <iframe src={viewerUrl} title={file.title} className="w-full" style={{ height: 380 }} allow="fullscreen" />
      <div className="flex items-center justify-center py-1.5 bg-purple-50 border-t border-purple-100">
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-violet-600 hover:underline">
          Open in new tab if preview doesn't load
        </a>
      </div>
    </div>
  );
}

// ── Assigned files section ────────────────────────────────────────────────────
function AssignedFilesSection({ resources, loading, totalResources, navigate }) {
  const [openFile, setOpenFile] = useState(null);
  const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/api$/, "");

  const bySubject = useMemo(() => {
    const map = {};
    for (const r of resources) {
      const subj = r.subject_name || "General";
      if (!map[subj]) map[subj] = [];
      map[subj].push(r);
    }
    return map;
  }, [resources]);

  if (loading) return <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>;

  if (totalResources === 0) return (
    <div className="text-center py-8 text-gray-400">
      <File size={24} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm">No files assigned yet.</p>
      <p className="text-xs mt-1">Files sent by your teacher will appear here.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {Object.keys(bySubject).sort().map(subject => {
        const files = bySubject[subject];
        const byType = {};
        for (const f of files) {
          const pt = resolvePushType(f.push_type);
          if (!byType[pt]) byType[pt] = [];
          byType[pt].push(f);
        }
        return (
          <div key={subject}>
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <BookOpen size={10} /> {subject}
            </p>
            {PUSH_ORDER.filter(pt => byType[pt]?.length > 0).map(pt => {
              const meta = PUSH_TYPE_META[pt];
              return (
                <div key={pt} className="mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">{meta.label}</p>
                  <div className="space-y-1.5">
                    {byType[pt].map(file => {
                      const fileType = (file.type || file.resource_type || "").toLowerCase();
                      const isOpen   = openFile === `${file.id}-${pt}`;
                      const isPractice = pt === "practice_test" || pt === "quiz";
                      const rawUrl = file.file_url?.startsWith("http") ? file.file_url : `${BASE}${file.file_url}`;
                      return (
                        <div key={`${file.id}-${pt}`} className="border border-gray-100 rounded-xl overflow-hidden bg-white hover:border-violet-200 transition-colors">
                          <div className="p-3 flex items-center gap-3">
                            <FileIcon type={fileType} size={15} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{file.title}</p>
                              {file.assigned_by_name && (
                                <p className="text-[10px] text-gray-400">From: {file.assigned_by_name}</p>
                              )}
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => setOpenFile(isOpen ? null : `${file.id}-${pt}`)}
                                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                                  isOpen
                                    ? "bg-violet-600 text-white border-violet-600"
                                    : "border-violet-200 text-violet-600 hover:bg-violet-50"
                                }`}
                              >
                                {isOpen ? "Close" : "Open"}
                              </button>
                              {isPractice && file.subtopic_id && (
                                <button
                                  onClick={() => navigate(`/student/subtopic/${file.subtopic_id}?tab=practice`)}
                                  className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                                >
                                  Practice
                                </button>
                              )}
                              <a href={rawUrl} download
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-violet-600 hover:border-violet-200 transition-colors">
                                <Download size={13} />
                              </a>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="px-3 pb-3 border-t border-gray-100">
                              <InlineViewer file={file} base={BASE} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Grade prediction ──────────────────────────────────────────────────────────
function predictGrade(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct >= 90) return { grade: "A*", color: "text-violet-700 bg-violet-100" };
  if (pct >= 80) return { grade: "A",  color: "text-green-700 bg-green-100"  };
  if (pct >= 70) return { grade: "B",  color: "text-blue-700 bg-blue-100"    };
  if (pct >= 60) return { grade: "C",  color: "text-teal-700 bg-teal-100"    };
  if (pct >= 50) return { grade: "D",  color: "text-amber-700 bg-amber-100"  };
  return { grade: "E", color: "text-red-600 bg-red-100" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const firstName =
    user?.first_name || user?.firstName ||
    user?.name?.split(" ")[0] ||
    user?.email?.split("@")[0] || "there";

  const [summary,          setSummary]          = useState({});
  const [loadingSummary,   setLoadingSummary]   = useState(true);
  const [subjects,         setSubjects]         = useState([]);
  const [loadingSubjects,  setLoadingSubjects]  = useState(true);
  const [subjectProgress,  setSubjectProgress]  = useState({});
  const [weakTopics,       setWeakTopics]       = useState([]);
  const [resources,        setResources]        = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [recentScores,     setRecentScores]     = useState([]);
  const [loadingScores,    setLoadingScores]    = useState(true);
  const [showMockPicker,   setShowMockPicker]   = useState(false);

  const loadAll = useCallback(async () => {
    await Promise.allSettled([
      api.get("/analytics/summary").then(r => { setSummary(r.data || {}); setLoadingSummary(false); }),
      api.get("/students/my-subjects").then(r => { setSubjects(r.data || []); setLoadingSubjects(false); }),
      api.get("/analytics/subject-breakdown").then(r => {
        const map = {};
        (r.data || []).forEach(row => { map[row.subject_id] = parseFloat(row.accuracy_pct) || 0; });
        setSubjectProgress(map);
      }),
      api.get("/analytics/weak-topics?limit=3").then(r => setWeakTopics(r.data || [])),
      api.get("/resources/my-assignments").then(r => { setResources(r.data || []); setLoadingResources(false); }),
      api.get("/quizzes/history").then(r => { setRecentScores(r.data || []); setLoadingScores(false); }),
    ]);
    setLoadingSummary(false); setLoadingSubjects(false);
    setLoadingResources(false); setLoadingScores(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const totalResources = resources.length;
  const dailyTarget    = 20;
  const todayAttempts  = summary.today_attempts ?? 0;
  const dailyPct       = Math.min(100, Math.round((todayAttempts / dailyTarget) * 100));

  const isRootDashboard =
    location.pathname === "/student" ||
    location.pathname === "/student/" ||
    location.pathname === "/student/dashboard";

  // ── Sidebar items — all wired ─────────────────────────────────────────────
  const sidebarItems = [
    { label: "Dashboard",   icon: BarChart2,    path: "/student/dashboard" },
    { label: "Subjects",    icon: BookOpen,     path: "/subjects"          },
    { label: "Practice",    icon: Zap,          path: "/student/practice"  },
    { label: "Past Papers", icon: FileText,     path: "/past-papers"       },
    { label: "Mock Exam",   icon: ClipboardList,path: null, onClick: () => setShowMockPicker(true) },
    { label: "Analytics",   icon: TrendingUp,   path: "/student/analytics" },
    { label: "Files",       icon: Download,     path: "/student/dashboard", scrollTo: "assigned-files" },
  ];

  const isActive = (item) => {
    if (!item.path) return false;
    if (item.label === "Dashboard") return location.pathname === item.path || location.pathname === "/student" || location.pathname === "/student/";
    return location.pathname.startsWith(item.path);
  };

  const handleSidebarClick = (item) => {
    if (item.onClick) { item.onClick(); return; }
    if (item.scrollTo && location.pathname.includes("/student/dashboard")) {
      document.getElementById(item.scrollTo)?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    navigate(item.path);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <TopNav />

      <div className="flex">
        {/* ── SIDEBAR ─────────────────────────────────────────────── */}
        <aside className="w-52 shrink-0 min-h-[calc(100vh-48px)] bg-white border-r border-gray-100 sticky top-12 self-start hidden md:block shadow-sm">
          <div className="px-3 py-5">
            <div className="px-3 py-2 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Student</p>
              <p className="text-xs font-semibold text-gray-700 mt-0.5 truncate">{firstName}</p>
            </div>

            {(summary.study_streak_days ?? 0) >= 2 && (
              <div className="mx-3 mb-3 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-1.5">
                <Flame size={12} className="text-amber-500 shrink-0" />
                <span className="text-[10px] font-semibold text-amber-700">{summary.study_streak_days}d streak</span>
              </div>
            )}

            <nav className="space-y-0.5">
              {sidebarItems.map((item) => {
                const Icon  = item.icon;
                const active = isActive(item);
                return (
                  <button
                    key={item.label}
                    onClick={() => handleSidebarClick(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                      active
                        ? "bg-violet-600 text-white font-semibold shadow-sm shadow-violet-200"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    <Icon size={14} className={active ? "text-white" : "text-gray-400"} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          {/* Header */}
          <div className="border-b border-gray-100 px-4 md:px-8 py-5 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-violet-500 text-xs uppercase tracking-widest mb-0.5 font-medium">
                  Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}
                </p>
                <h1 className="text-xl font-bold text-gray-900">{firstName}</h1>
              </div>
              <div className="flex gap-2 md:hidden">
                <button onClick={() => navigate("/student/practice")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
                  <Zap size={13} /> Practice
                </button>
                <button onClick={() => setShowMockPicker(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold">
                  <ClipboardList size={13} /> Mock
                </button>
              </div>
            </div>
          </div>

          <Outlet />

          {isRootDashboard && (
            <div className="px-4 md:px-8 py-6 space-y-5">

              {/* Metric cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {loadingSummary
                  ? [0,1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)
                  : [
                      { label: "Questions Done", value: (summary.total_attempts ?? 0).toLocaleString(), sub: "all time",       color: "text-violet-600" },
                      { label: "Accuracy",        value: `${summary.accuracy_pct ?? 0}%`,               sub: "overall",        color: "text-emerald-600" },
                      { label: "Day Streak",      value: summary.study_streak_days ?? 0,                sub: "consecutive",    color: "text-amber-600"  },
                      { label: "Today's Goal",    value: `${todayAttempts}/${dailyTarget}`,              sub: `${dailyPct}% done`, color: dailyPct >= 100 ? "text-emerald-600" : "text-violet-600" },
                    ].map(m => (
                      <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-400 text-xs mb-2">{m.label}</p>
                        <p className={`font-mono text-2xl font-bold ${m.color}`}>{m.value}</p>
                        <p className="text-gray-400 text-xs mt-1">{m.sub}</p>
                      </div>
                    ))
                }
              </div>

              {/* Daily progress */}
              <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Daily Target</span>
                  <span className={`text-xs font-mono font-bold ${dailyPct >= 100 ? "text-emerald-600" : "text-gray-600"}`}>
                    {todayAttempts} / {dailyTarget} questions
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${dailyPct >= 100 ? "bg-emerald-500" : "bg-violet-600"}`}
                    style={{ width: `${dailyPct}%` }} />
                </div>
                {dailyPct >= 100
                  ? <p className="text-xs text-emerald-600 mt-1.5 font-medium">✓ Goal complete!</p>
                  : <p className="text-xs text-gray-400 mt-1.5">{dailyTarget - todayAttempts} more to reach daily goal</p>}
              </div>

              {/* Two-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* My Subjects */}
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">My Subjects</p>
                    <span className="text-xs text-gray-400">{subjects.length} enrolled</span>
                  </div>
                  <div className="p-3 space-y-1">
                    {loadingSubjects
                      ? [0,1,2].map(i => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)
                      : subjects.length === 0
                        ? (
                          <div className="py-8 text-center">
                            <BookOpen size={24} className="text-gray-200 mx-auto mb-2" />
                            <p className="text-xs text-gray-400">No subjects enrolled yet</p>
                            <button onClick={() => navigate("/subjects")} className="mt-2 text-xs text-violet-600 hover:underline font-medium">Browse subjects →</button>
                          </div>
                        )
                        : subjects.map(subject => {
                          const pct   = subjectProgress[subject.id] ?? null;
                          const grade = predictGrade(pct);
                          return (
                            <button key={subject.id} onClick={() => navigate(`/student/subject/${subject.id}`)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-violet-50 border border-transparent hover:border-violet-100 transition-all text-left group">
                              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-sm shrink-0">
                                {subject.icon_emoji || "📚"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{subject.name}</p>
                                {pct !== null && (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-mono">{pct}%</span>
                                  </div>
                                )}
                              </div>
                              {grade && (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono shrink-0 ${grade.color}`}>{grade.grade}</span>
                              )}
                            </button>
                          );
                        })
                    }
                  </div>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  {/* Focus areas */}
                  {weakTopics.length > 0 && (
                    <div className="bg-white border border-rose-100 rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                          <Target size={11} /> Focus Areas
                        </p>
                        <span className="text-xs text-gray-400">Last 30 days</span>
                      </div>
                      <div className="p-3 space-y-1">
                        {weakTopics.slice(0, 3).map((t, i) => (
                          <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-rose-50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{t.topic || t.subject_name}</p>
                              <p className="text-[10px] text-gray-400">{t.subject_name} · {t.attempt_count} attempts</p>
                            </div>
                            <span className={`text-xs font-mono font-bold shrink-0 ${t.accuracy_pct < 40 ? "text-red-500" : "text-amber-600"}`}>{t.accuracy_pct}%</span>
                            <button onClick={() => navigate("/student/practice")}
                              className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold px-2 py-1 rounded shrink-0 transition-colors border border-rose-100">
                              Practice
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent activity */}
                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Activity</p>
                      <TrendingUp size={12} className="text-gray-300" />
                    </div>
                    <div className="p-3">
                      {loadingScores
                        ? <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>
                        : recentScores.length === 0
                          ? (
                            <div className="py-6 text-center">
                              <p className="text-xs text-gray-400">No quiz activity yet</p>
                              <button onClick={() => navigate("/student/practice")} className="mt-1 text-xs text-violet-600 hover:underline font-medium">Start practising →</button>
                            </div>
                          )
                          : (
                            <div className="space-y-2.5">
                              {recentScores.slice(0, 5).map((row, i) => {
                                const pct = parseFloat(row.accuracy_pct) || 0;
                                return (
                                  <div key={i} className="flex items-center gap-3">
                                    <span className="text-[10px] text-gray-400 font-mono w-12 shrink-0">
                                      {new Date(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                                        style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs font-mono font-bold text-gray-600 w-9 text-right shrink-0">{pct}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          )
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* Assigned Files */}
              <div id="assigned-files" className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned Files</p>
                  {totalResources > 0 && <span className="text-xs text-gray-400">{totalResources} file{totalResources !== 1 ? "s" : ""}</span>}
                </div>
                <div className="p-3">
                  <AssignedFilesSection
                    resources={resources}
                    loading={loadingResources}
                    totalResources={totalResources}
                    navigate={navigate}
                  />
                </div>
              </div>

            </div>
          )}
        </main>
      </div>

      {/* Mock exam picker modal */}
      {showMockPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-600 to-purple-600">
              <p className="text-white font-bold">Start Mock Exam</p>
              <p className="text-white/70 text-xs mt-0.5">Choose a subject — 45-minute timed exam</p>
            </div>
            <div className="p-2 max-h-64 overflow-y-auto">
              {subjects.length === 0
                ? <p className="text-sm text-gray-400 text-center py-4">No subjects enrolled yet.</p>
                : subjects.map(s => (
                  <button key={s.id}
                    onClick={() => { setShowMockPicker(false); navigate(`/student/mock/${s.id}`); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-violet-50 transition-colors text-left">
                    <span className="text-lg">{s.icon_emoji || "📚"}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.name}</p>
                      {s.exam_board_code && <p className="text-xs text-gray-400">{s.exam_board_code}</p>}
                    </div>
                  </button>
                ))
              }
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <button onClick={() => setShowMockPicker(false)}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
