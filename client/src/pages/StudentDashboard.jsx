import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import TopNav from "../components/TopNav";
import api from "../services/apiClient";
import {
  FileText, Video, Music, File, Download,
  Zap, ClipboardList, BarChart2, BookOpen, TrendingUp,
  Flame, Target, ChevronDown, ChevronUp, GraduationCap,
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
  learning_material: { label: "📚 Learning Materials", badge: "bg-blue-100 text-blue-700" },
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

// ── URL resolver — rewrites old eacbuddy-api URLs to current API base ─────────
function resolveFileUrl(rawUrl) {
  // VITE_API_URL e.g. "https://aischoolonair-api.onrender.com/api" or "/api"
  // Strip /api suffix to get the server root where /uploads is served
  const apiBase = (import.meta.env.VITE_API_URL || "")
    .replace(/\/api$/, "")
    .replace(/\/$/, "") || window.location.origin;

  if (!rawUrl) return "";

  // Relative path (e.g. /uploads/resources/file.pdf) → prepend API base
  if (!rawUrl.startsWith("http")) return `${apiBase}${rawUrl}`;

  // Old dead server → rewrite to current API
  if (/eacbuddy-api\.onrender\.com/.test(rawUrl)) {
    return rawUrl.replace(/https?:\/\/eacbuddy-api\.onrender\.com/, apiBase);
  }

  return rawUrl;
}

// ── Inline file viewer ────────────────────────────────────────────────────────
function InlineViewer({ file }) {
  const url  = resolveFileUrl(file.file_url);
  const type = (file.type || file.resource_type || "").toLowerCase();
  const ext  = url.split("?")[0].split(".").pop().toLowerCase();
  const [broken, setBroken] = useState(false);

  // ── data: URI — plain text seeded content, decode and display directly ──
  if (url.startsWith("data:text/")) {
    let text = "";
    try {
      text = decodeURIComponent(url.replace(/^data:text\/[^;]+;charset=utf-8,/, ""));
    } catch {
      text = url.replace(/^data:text\/[^;]+,/, "");
    }
    return (
      <div className="mt-2 rounded-xl border border-blue-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border-b border-blue-100">
          <span className="text-xs font-semibold text-blue-700">{file.title}</span>
          <span className="text-[10px] text-blue-400">Learning Resource</span>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
        </div>
      </div>
    );
  }

  if (type === "video" || ["mp4","webm","mov"].includes(ext))
    return <div className="mt-2 rounded-xl overflow-hidden bg-black"><video src={url} controls className="w-full max-h-56 rounded-xl" /></div>;
  if (type === "audio" || ["mp3","wav","ogg","m4a"].includes(ext))
    return <audio src={url} controls className="w-full mt-2" />;
  if (type === "image" || ["jpg","jpeg","png","gif","webp"].includes(ext))
    return <img src={url} alt={file.title} className="mt-2 rounded-xl w-full max-h-48 object-contain bg-gray-100" onError={() => setBroken(true)} />;

  if (broken) return (
    <div className="mt-2 rounded-xl border border-red-100 bg-red-50 p-4 text-center">
      <p className="text-sm text-red-600 font-medium">File unavailable</p>
      <p className="text-xs text-red-400 mt-1">This file may have been uploaded to a server that no longer exists.</p>
    </div>
  );

  // Office formats → Microsoft Office Online viewer (handles docx/pptx/xlsx natively)
  const isOffice = ["docx","pptx","xlsx","doc","ppt","xls"].includes(ext);
  const viewerUrl = isOffice
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      <iframe
        src={viewerUrl}
        title={file.title}
        className="w-full"
        style={{ height: 420 }}
        allow="fullscreen"
        onError={() => setBroken(true)}
      />
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-200">
        <span className="text-[10px] text-gray-400">{isOffice ? "Powered by Microsoft Office Online" : "Powered by Google Docs Viewer"}</span>
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-medium">
          Open in new tab ↗
        </a>
      </div>
    </div>
  );
}

// ── Assigned files section ────────────────────────────────────────────────────
function AssignedFilesSection({ resources, loading, totalResources, navigate }) {
  const [openFile, setOpenFile] = useState(null);

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
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
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
                      // Always use resolveFileUrl so old eacbuddy URLs are rewritten
                      const resolvedUrl = resolveFileUrl(file.file_url);
                      return (
                        <div key={`${file.id}-${pt}`} className="border border-gray-100 rounded-xl overflow-hidden bg-white hover:border-blue-200 transition-colors">
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
                                    ? "bg-blue-500 text-white border-blue-600"
                                    : "border-blue-200 text-blue-600 hover:bg-blue-50"
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
                              <a href={resolvedUrl} target="_blank" rel="noreferrer" download
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-colors">
                                <Download size={13} />
                              </a>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="px-3 pb-3 border-t border-gray-100">
                              <InlineViewer file={file} />
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
  if (pct >= 90) return { grade: "A*", color: "text-blue-700 bg-blue-100" };
  if (pct >= 80) return { grade: "A",  color: "text-green-700 bg-green-100"  };
  if (pct >= 70) return { grade: "B",  color: "text-blue-700 bg-blue-100"    };
  if (pct >= 60) return { grade: "C",  color: "text-blue-700 bg-blue-100"    };
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
      api.get("/analytics/summary").then(r => { setSummary(r.data || {}); setLoadingSummary(false); }).catch(() => setLoadingSummary(false)),
      api.get("/students/my-subjects").then(r => { setSubjects(r.data || []); setLoadingSubjects(false); }).catch(() => setLoadingSubjects(false)),
      api.get("/analytics/subject-breakdown").then(r => {
        const map = {};
        (r.data || []).forEach(row => { map[row.subject_id] = parseFloat(row.accuracy_pct) || 0; });
        setSubjectProgress(map);
      }).catch(() => {}),
      api.get("/analytics/weak-topics?limit=3").then(r => setWeakTopics(r.data || [])).catch(() => {}),
      api.get("/resources/my-assignments").then(r => { setResources(r.data || []); setLoadingResources(false); }).catch(() => { setResources([]); setLoadingResources(false); }),
      api.get("/quizzes/history").then(r => { setRecentScores(r.data || []); setLoadingScores(false); }).catch(() => { setRecentScores([]); setLoadingScores(false); }),
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
    { label: "Dashboard",   icon: BarChart2,    path: "/student/dashboard"  },
    { label: "Resources",   icon: BookOpen,     path: "/student/subjects"   },
    { label: "Practice",    icon: Zap,          path: "/student/practice"   },
    { label: "Past Papers", icon: FileText,     path: "/past-papers"        },
    { label: "Mock Exam",   icon: ClipboardList,path: null, onClick: () => setShowMockPicker(true) },
    { label: "Analytics",   icon: TrendingUp,   path: "/student/analytics"  },
    { label: "Files",       icon: Download,     path: "/student/files"      },
    { label: "Exam Types",  icon: GraduationCap, path: "/student/exam-types"  },
  ];

  const isActive = (item) => {
    if (!item.path) return false;
    if (item.label === "Dashboard") return location.pathname === item.path || location.pathname === "/student" || location.pathname === "/student/";
    if (item.label === "Resources") return location.pathname.startsWith("/student/subjects") || location.pathname.startsWith("/student/subject");
    return location.pathname.startsWith(item.path);
  };

  const handleSidebarClick = (item) => {
    if (item.onClick) { item.onClick(); return; }
    navigate(item.path);
  };

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <TopNav />

      <div className="flex">
        {/* ── SIDEBAR ─────────────────────────────────────────────── */}
        <aside className="w-52 shrink-0 min-h-[calc(100vh-48px)] bg-[#f0ede8] border-r border-[#e8e4dd] sticky top-12 self-start hidden md:block">
          <div className="px-3 py-5">
            <div className="px-3 py-2 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">Student</p>
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left ${
                      active
                        ? "bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]"
                        : "text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60"
                    }`}
                  >
                    <Icon size={14} className={active ? "text-[#d97757]" : "text-[#b5a99a]"} />
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
                <p className="text-blue-500 text-xs uppercase tracking-widest mb-0.5 font-medium">
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold">
                  <ClipboardList size={13} /> Mock
                </button>
              </div>
            </div>
          </div>

          <Outlet />

          {isRootDashboard && (
            <div className="px-4 md:px-6 py-5 space-y-6 max-w-2xl">

              {/* ── METRIC STRIP ── keep cards for analytics numbers */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {loadingSummary
                  ? [0,1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)
                  : [
                      { label: "Questions Done", value: (summary.total_attempts ?? 0).toLocaleString(), sub: "all time",         color: "text-blue-600"    },
                      { label: "Accuracy",        value: `${summary.accuracy_pct ?? 0}%`,               sub: "overall",          color: "text-emerald-600" },
                      { label: "Day Streak",      value: summary.study_streak_days ?? 0,                sub: "consecutive days", color: "text-amber-600"   },
                      { label: "Today's Goal",    value: `${todayAttempts}/${dailyTarget}`,              sub: `${dailyPct}% done`, color: dailyPct >= 100 ? "text-emerald-600" : "text-blue-600" },
                    ].map(m => (
                      <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                        <p className="text-gray-400 text-[11px] mb-1">{m.label}</p>
                        <p className={`font-mono text-2xl font-bold leading-none ${m.color}`}>{m.value}</p>
                        <p className="text-gray-300 text-[10px] mt-1">{m.sub}</p>
                      </div>
                    ))
                }
              </div>

              {/* ── DAILY PROGRESS BAR ── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Daily Target</span>
                  <span className={`text-xs font-mono font-bold ${dailyPct >= 100 ? "text-emerald-600" : "text-gray-500"}`}>
                    {todayAttempts} / {dailyTarget} questions
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${dailyPct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${dailyPct}%` }} />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {dailyPct >= 100 ? "✓ Daily goal complete — great work!" : `${dailyTarget - todayAttempts} more questions to hit today's goal`}
                </p>
              </div>

              {/* ── MY SUBJECTS: list rows, not cards ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">My Subjects</h2>
                  <button onClick={() => navigate("/student/subjects")}
                    className="text-xs text-blue-600 hover:underline font-medium">
                    View all →
                  </button>
                </div>
                {loadingSubjects ? (
                  <div className="space-y-2">
                    {[0,1,2].map(i => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
                  </div>
                ) : subjects.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
                    <BookOpen size={22} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No subjects enrolled yet</p>
                    <button onClick={() => navigate("/subjects")} className="mt-2 text-xs text-blue-600 hover:underline font-medium">Browse subjects →</button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-white">
                    {subjects.slice(0, 6).map(subject => {
                      const pct = subjectProgress[subject.id] ?? null;
                      return (
                        <button key={subject.id}
                          onClick={() => navigate(`/student/subject/${subject.id}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left group">
                          <span className="text-lg shrink-0 w-7 text-center">{subject.icon_emoji || "📚"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-700">{subject.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct ?? 0}%` }} />
                              </div>
                              <span className="text-[10px] text-gray-400 font-mono">{pct !== null ? `${pct}%` : "Not started"}</span>
                            </div>
                          </div>
                          <span className="text-[10px] text-gray-300 group-hover:text-blue-400 font-semibold shrink-0">›</span>
                        </button>
                      );
                    })}
                    {subjects.length > 6 && (
                      <button onClick={() => navigate("/student/subjects")}
                        className="w-full text-center text-xs text-blue-500 hover:text-blue-700 py-2.5 font-medium hover:bg-blue-50 transition-colors">
                        +{subjects.length - 6} more subjects →
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* ── FOCUS AREAS: only after student has quiz history ── */}
              {weakTopics.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Target size={13} className="text-rose-500" /> Focus Areas
                  </h2>
                  <div className="divide-y divide-gray-100 border border-rose-100 rounded-xl overflow-hidden bg-white">
                    {weakTopics.slice(0, 3).map((t, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-rose-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{t.topic || t.subject_name}</p>
                          <p className="text-[11px] text-gray-400">{t.subject_name} · {t.attempt_count} attempts</p>
                        </div>
                        <span className={`text-sm font-mono font-bold shrink-0 ${t.accuracy_pct < 40 ? "text-red-500" : "text-amber-500"}`}>
                          {t.accuracy_pct}%
                        </span>
                        <button onClick={() => navigate("/student/practice")}
                          className="text-xs text-rose-600 hover:text-rose-800 font-semibold shrink-0 px-2 py-1 rounded-lg hover:bg-rose-100 transition-colors">
                          Practice
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── RECENT ACTIVITY: list rows ── */}
              <section>
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingUp size={13} className="text-gray-400" /> Recent Activity
                </h2>
                {loadingScores ? (
                  <div className="space-y-2">
                    {[0,1].map(i => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}
                  </div>
                ) : recentScores.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-gray-200 rounded-xl text-gray-400">
                    <p className="text-sm">No quiz activity yet.</p>
                    <button onClick={() => navigate("/student/practice")} className="mt-1 text-xs text-blue-600 hover:underline font-medium">
                      Start practising →
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-white">
                    {recentScores.slice(0, 5).map((row, i) => {
                      const pct = parseFloat(row.accuracy_pct) || 0;
                      const col = pct >= 75 ? "text-emerald-600 bg-emerald-50" : pct >= 50 ? "text-amber-600 bg-amber-50" : "text-red-500 bg-red-50";
                      return (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="text-[11px] text-gray-400 font-mono w-14 shrink-0">
                            {new Date(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 75 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${col}`}>
                            {pct}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

            </div>
          )}
        </main>
      </div>

      {/* Mock exam picker modal */}
      {showMockPicker && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-500 to-blue-600">
              <p className="text-white font-bold">Start Mock Exam</p>
              <p className="text-white/70 text-xs mt-0.5">Choose a subject — 45-minute timed exam</p>
            </div>
            <div className="p-2 max-h-64 overflow-y-auto">
              {subjects.length === 0
                ? <p className="text-sm text-gray-400 text-center py-4">No subjects enrolled yet.</p>
                : subjects.map(s => (
                  <button key={s.id}
                    onClick={() => { setShowMockPicker(false); navigate(`/student/mock/${s.id}`); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 transition-colors text-left">
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
