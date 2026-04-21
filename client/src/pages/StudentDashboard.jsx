import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import TopNav from "../components/TopNav";
import api from "../services/apiClient";
import {
  FileText, Video, Music, File, ExternalLink, Download,
  Zap, ClipboardList, BarChart2, BookOpen, TrendingUp,
  Flame, Target, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
// Canonical push_type definitions — covers all values past, present, and future.
// Aliases map legacy / alternate strings onto a canonical bucket.
const PUSH_TYPE_ALIAS = {
  // canonical → canonical (identity)
  quiz:              "quiz",
  practice_test:     "practice_test",
  learning_material: "learning_material",
  // admin panel new values → canonical
  lecture_material:  "learning_material",
  question_material: "practice_test",
  // extra synonyms for safety
  lecture:           "learning_material",
  material:          "learning_material",
  resource:          "learning_material",
  test:              "practice_test",
  exam:              "practice_test",
};

const PUSH_TYPE_META = {
  quiz:              { label: "⚡ Quizzes",             color: "bg-amber-50 border-amber-200",  badge: "bg-amber-100 text-amber-700"  },
  practice_test:     { label: "📝 Practice Tests",      color: "bg-blue-50 border-blue-200",    badge: "bg-blue-100 text-blue-700"    },
  learning_material: { label: "📚 Learning Materials",  color: "bg-teal-50 border-teal-200",    badge: "bg-teal-100 text-teal-700"    },
  unknown:           { label: "📁 Other Files",          color: "bg-gray-50 border-gray-200",    badge: "bg-gray-100 text-gray-600"    },
};

// Resolve any push_type string to a canonical key
const resolvePushType = (raw) =>
  PUSH_TYPE_ALIAS[raw?.toLowerCase?.() ?? ""] ?? "unknown";

const PUSH_ORDER = ["quiz", "practice_test", "learning_material", "unknown"];

// ── Sub-components ────────────────────────────────────────────────────────────
function FileIcon({ type, size = 16 }) {
  if (type === "video") return <Video    size={size} className="text-blue-500"   />;
  if (type === "audio") return <Music    size={size} className="text-purple-500" />;
  if (type === "pdf")   return <FileText size={size} className="text-red-500"    />;
  return <File size={size} className="text-gray-400" />;
}

function ProgressBar({ pct, color = "bg-indigo-500" }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
      <div
        className={`h-full ${color} rounded-full transition-all duration-700`}
        style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%` }}
      />
    </div>
  );
}

// A — Stats strip
function StatsStrip({ summary, loading }) {
  if (loading) return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[0,1,2].map(i => (
        <div key={i} className="bg-white rounded-xl p-3 animate-pulse h-16" />
      ))}
    </div>
  );
  const { total_attempts = 0, accuracy_pct = 0, study_streak_days = 0 } = summary;
  const stats = [
    { label: "Questions Done", value: total_attempts.toLocaleString(), icon: "📝" },
    { label: "Accuracy",       value: `${accuracy_pct}%`,             icon: "🎯" },
    { label: "Day Streak",     value: study_streak_days,               icon: "🔥" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 mb-4">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-lg">{s.icon}</p>
          <p className="text-base font-bold text-gray-800 leading-tight">{s.value}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// D — Streak banner
function StreakBanner({ days }) {
  if (!days || days < 2) return null;
  const msg =
    days >= 30 ? `🏆 ${days}-day streak — legendary!`
    : days >= 14 ? `🔥 ${days}-day streak — on fire!`
    : days >= 7  ? `⚡ ${days}-day streak — keep going!`
    :              `🔥 ${days}-day streak — nice work!`;
  return (
    <div className="flex items-center gap-2 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl px-4 py-2.5 mb-4 shadow-sm">
      <Flame size={18} className="text-orange-500 shrink-0" />
      <p className="text-sm font-semibold text-orange-700">{msg}</p>
    </div>
  );
}

// C — Learning gap callout
function FocusAreaCard({ topics, loading, onPractice }) {
  if (loading) return null;
  if (!topics.length) return null;
  const top = topics.slice(0, 3);
  return (
    <div className="bg-white rounded-xl p-4 mb-4 shadow-sm border-l-4 border-rose-400">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} className="text-rose-500" />
        <h2 className="font-semibold text-gray-800 text-sm">Focus Areas</h2>
        <span className="ml-auto text-[10px] text-gray-400">Last 30 days</span>
      </div>
      <div className="space-y-2">
        {top.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{t.topic || t.subject_name}</p>
              <p className="text-[10px] text-gray-400">{t.subject_name} · {t.attempt_count} attempts</p>
            </div>
            <span className={`text-xs font-bold shrink-0 ${
              t.accuracy_pct < 40 ? "text-red-500" : "text-amber-500"
            }`}>{t.accuracy_pct}%</span>
            <button
              onClick={() => onPractice()}
              className="text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold px-2 py-1 rounded-lg shrink-0 transition-colors"
            >
              Practice
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// B — Predicted grade helper
function predictGrade(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct >= 90) return { grade: "A*", color: "text-purple-600 bg-purple-50" };
  if (pct >= 80) return { grade: "A",  color: "text-green-600 bg-green-50"  };
  if (pct >= 70) return { grade: "B",  color: "text-blue-600 bg-blue-50"    };
  if (pct >= 60) return { grade: "C",  color: "text-teal-600 bg-teal-50"    };
  if (pct >= 50) return { grade: "D",  color: "text-amber-600 bg-amber-50"  };
  return { grade: "E", color: "text-red-500 bg-red-50" };
}

// H — Subject card with topic chips on expand
function SubjectCard({ subject, pct, onClick }) {
  const [expanded, setExpanded] = useState(false);
  const [topics, setTopics]     = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  const barColor =
    pct === null  ? "bg-gray-200"
    : pct >= 75   ? "bg-green-500"
    : pct >= 50   ? "bg-amber-400"
    :               "bg-red-400";

  const predicted = predictGrade(pct);

  const toggleExpand = async (e) => {
    e.stopPropagation();
    if (!expanded && topics.length === 0) {
      setLoadingTopics(true);
      try {
        const res = await api.get("/topics", { params: { subject_id: subject.id } });
        const topicList = res.data?.topics || res.data || [];
        // Flatten all subtopics as chips
        const chips = topicList.flatMap(t =>
          (t.subtopics || []).map(st => st.name)
        ).filter(Boolean).slice(0, 10);
        setTopics(chips.length ? chips : topicList.map(t => t.name).slice(0, 10));
      } catch { setTopics([]); }
      finally { setLoadingTopics(false); }
    }
    setExpanded(v => !v);
  };

  return (
    <div className="border rounded-xl text-left hover:bg-gray-50 transition-colors overflow-hidden">
      {/* Main card row */}
      <button
        onClick={onClick}
        className="w-full p-3 text-left"
      >
        <div className="flex items-start justify-between gap-1">
          <p className="font-semibold text-sm text-gray-800 truncate leading-tight">
            {subject.icon_emoji && <span className="mr-1">{subject.icon_emoji}</span>}
            {subject.name}
          </p>
          {/* B — predicted grade badge */}
          {predicted && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${predicted.color}`}>
              ~{predicted.grade}
            </span>
          )}
        </div>
        {(subject.exam_board_code || subject.level) && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            {subject.exam_board_code}{subject.level ? ` · ${subject.level}` : ""}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">
            {pct === null ? "No activity yet" : `${pct}% accuracy`}
          </span>
        </div>
        <ProgressBar pct={pct ?? 0} color={barColor} />
      </button>

      {/* H — Expand toggle for topic chips */}
      <button
        onClick={toggleExpand}
        className="w-full flex items-center justify-center gap-1 py-1.5 border-t text-[10px] text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
      >
        {expanded ? <><ChevronUp size={10} /> Hide topics</> : <><ChevronDown size={10} /> Topics</>}
      </button>

      {expanded && (
        <div className="px-3 pb-3 bg-gray-50">
          {loadingTopics ? (
            <p className="text-[10px] text-gray-400 py-2">Loading…</p>
          ) : topics.length === 0 ? (
            <p className="text-[10px] text-gray-400 py-2">No topics listed yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1 pt-2">
              {topics.map((chip, i) => (
                <span key={i} className="text-[10px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── InlineViewer ──────────────────────────────────────────────────────────────
// Renders files inline. Uses Google Docs viewer for office docs/PDFs to avoid
// X-Frame-Options and cross-origin iframe blocks.
function InlineViewer({ file, base }) {
  const rawUrl = file.file_url?.startsWith("http") ? file.file_url : `${base}${file.file_url}`;
  // Normalise legacy eacbuddy-api.onrender.com URLs to current API base
  const currentBase = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/api$/, "");
  const url = rawUrl.replace(/https?:\/\/eacbuddy-api\.onrender\.com/, currentBase);

  const type = (file.type || file.resource_type || "").toLowerCase();
  const ext  = url.split("?")[0].split(".").pop().toLowerCase();

  if (type === "video" || ["mp4","webm","mov"].includes(ext)) {
    return (
      <div className="mt-2 rounded-xl overflow-hidden bg-black">
        <video src={url} controls className="w-full max-h-56 rounded-xl" />
      </div>
    );
  }
  if (type === "audio" || ["mp3","wav","ogg","m4a"].includes(ext)) {
    return <audio src={url} controls className="w-full mt-2" />;
  }
  if (type === "image" || ["jpg","jpeg","png","gif","webp"].includes(ext)) {
    return <img src={url} alt={file.title} className="mt-2 rounded-xl w-full max-h-48 object-contain bg-gray-100" />;
  }
  // PDF, docx, pptx, xlsx — use Google Docs viewer (bypasses X-Frame-Options)
  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      <iframe
        src={viewerUrl}
        title={file.title}
        className="w-full"
        style={{ height: 380 }}
        allow="fullscreen"
      />
      <div className="flex items-center justify-center py-1.5 bg-gray-50 border-t border-gray-100">
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-teal-600 hover:underline">
          Open in new tab if preview doesn't load
        </a>
      </div>
    </div>
  );
}

// ── AssignedFilesSection ──────────────────────────────────────────────────────
// Groups resources by subject, then by push_type. Shows inline viewer per file.
function AssignedFilesSection({ resources, loading, groupedByType, totalResources, navigate }) {
  const [openFile, setOpenFile] = useState(null); // id of file with viewer open
  const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/api$/, "");

  // Group by subject_name for contextual display
  const bySubject = useMemo(() => {
    const map = {};
    for (const r of resources) {
      const subj = r.subject_name || "Other";
      if (!map[subj]) map[subj] = [];
      map[subj].push(r);
    }
    return map;
  }, [resources]);

  const subjects = Object.keys(bySubject).sort();

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-800">Assigned Files</h2>
        {totalResources > 0 && (
          <span className="text-xs text-gray-400">{totalResources} file{totalResources !== 1 ? "s" : ""}</span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : totalResources === 0 ? (
        <div className="text-center py-6 text-gray-400">
          <File size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No files assigned yet.</p>
          <p className="text-xs mt-1">Files sent by your teacher will appear here.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {subjects.map(subject => {
            const files = bySubject[subject];
            // Within each subject, group by resolved push_type
            const byType = {};
            for (const f of files) {
              const pt = resolvePushType(f.push_type);
              if (!byType[pt]) byType[pt] = [];
              byType[pt].push(f);
            }

            return (
              <div key={subject}>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <BookOpen size={11} /> {subject}
                </p>
                {PUSH_ORDER.filter(pt => byType[pt]?.length > 0).map(pt => {
                  const meta = PUSH_TYPE_META[pt];
                  return (
                    <div key={pt} className="mb-3">
                      <p className="text-[10px] font-semibold text-gray-400 mb-1.5 ml-0.5">{meta.label}</p>
                      <div className="space-y-2">
                        {byType[pt].map(file => {
                          const fileType = (file.type || file.resource_type || "").toLowerCase();
                          const isOpen   = openFile === `${file.id}-${pt}`;
                          const isPractice = pt === "practice_test" || pt === "quiz";

                          return (
                            <div key={`${file.id}-${pt}`} className={`border rounded-xl overflow-hidden ${meta.color}`}>
                              <div className="p-3 flex items-center gap-3">
                                <FileIcon type={fileType} size={16} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">{file.title}</p>
                                  {file.assigned_by_name && (
                                    <p className="text-[10px] text-gray-400">From: {file.assigned_by_name}</p>
                                  )}
                                </div>
                                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                                  {/* Open inline button */}
                                  <button
                                    onClick={() => setOpenFile(isOpen ? null : `${file.id}-${pt}`)}
                                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                                      isOpen
                                        ? "bg-gray-700 text-white border-gray-700"
                                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                                    }`}
                                  >
                                    {isOpen ? "Close" : "Open"}
                                  </button>
                                  {/* Practice button for question materials */}
                                  {isPractice && file.subtopic_id && (
                                    <button
                                      onClick={() => navigate(`/student/subtopic/${file.subtopic_id}?tab=practice`)}
                                      className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
                                    >
                                      Practice
                                    </button>
                                  )}
                                  <a href={(() => { const raw = file.file_url?.startsWith("http") ? file.file_url : `${BASE}${file.file_url}`; return raw.replace(/https?:\/\/eacbuddy-api\.onrender\.com/, BASE); })()}
                                    download title="Download"
                                    className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors border border-green-200">
                                    <Download size={13} />
                                  </a>
                                </div>
                              </div>
                              {/* Inline viewer */}
                              {isOpen && (
                                <div className="px-3 pb-3">
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
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const firstName =
    user?.first_name || user?.firstName ||
    user?.name?.split(" ")[0] ||
    user?.email?.split("@")[0] || "there";

  // ── State ─────────────────────────────────────────────────────────────────
  const [summary,          setSummary]          = useState({});
  const [loadingSummary,   setLoadingSummary]   = useState(true);

  const [subjects,         setSubjects]         = useState([]);
  const [loadingSubjects,  setLoadingSubjects]  = useState(true);
  const [subjectProgress,  setSubjectProgress]  = useState({});

  const [weakTopics,       setWeakTopics]       = useState([]);
  const [loadingWeak,      setLoadingWeak]      = useState(true);

  const [resources,        setResources]        = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);

  const [recentScores,     setRecentScores]     = useState([]);
  const [loadingScores,    setLoadingScores]    = useState(true);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    // Fire all in parallel
    await Promise.allSettled([
      api.get("/analytics/summary").then(r => {
        setSummary(r.data || {});
        setLoadingSummary(false);
      }),
      api.get("/students/my-subjects").then(r => {
        setSubjects(r.data || []);
        setLoadingSubjects(false);
      }),
      api.get("/analytics/subject-breakdown").then(r => {
        const map = {};
        (r.data || []).forEach(row => { map[row.subject_id] = parseFloat(row.accuracy_pct) || 0; });
        setSubjectProgress(map);
      }),
      api.get("/analytics/weak-topics?limit=3").then(r => {
        setWeakTopics(r.data || []);
        setLoadingWeak(false);
      }),
      api.get("/resources/my-assignments").then(r => {
        setResources(r.data || []);
        setLoadingResources(false);
      }),
      api.get("/quizzes/history").then(r => {
        setRecentScores(r.data || []);
        setLoadingScores(false);
      }),
    ]);
    // Ensure loading flags always clear even on error
    setLoadingSummary(false);
    setLoadingSubjects(false);
    setLoadingWeak(false);
    setLoadingResources(false);
    setLoadingScores(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const groupedByType = useMemo(() => {
    const groups = {};
    for (const r of resources) {
      const pt = resolvePushType(r.push_type);   // normalise ALL push_type values
      if (!groups[pt]) groups[pt] = [];
      groups[pt].push(r);
    }
    return groups;
  }, [resources]);

  const totalResources = resources.length;
  const firstSubjectId = subjects[0]?.id;

  // #6 — Mock exam subject picker state
  const [showMockPicker, setShowMockPicker] = useState(false);

  // #8 — Daily target: aim for 20 questions/day; show progress toward it
  const dailyTarget = 20;
  const todayAttempts = summary.today_attempts ?? 0;
  const dailyPct = Math.min(100, Math.round((todayAttempts / dailyTarget) * 100));

  const isRootDashboard =
    location.pathname === "/student" ||
    location.pathname === "/student/" ||
    location.pathname === "/student/dashboard";

  const quickLinks = [
    { label: "Past Papers",   icon: <FileText size={18} className="text-blue-500" />,      path: "/past-papers",          bg: "bg-blue-50 border-blue-100"   },
    { label: "Practice",      icon: <Zap size={18} className="text-amber-500" />,           path: "/student/practice",     bg: "bg-amber-50 border-amber-100" },
    { label: "Mock Exam",     icon: <ClipboardList size={18} className="text-rose-500" />,  path: null,                    bg: "bg-rose-50 border-rose-100",  onClick: () => setShowMockPicker(true) },
    { label: "Analytics",     icon: <BarChart2 size={18} className="text-green-500" />,     path: "/student/analytics",    bg: "bg-green-50 border-green-100" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-xl font-bold mb-4 text-gray-800">Hi, {firstName} 👋</h1>

        <Outlet />

        {isRootDashboard && (
          <>
            {/* A — Stats strip */}
            <StatsStrip summary={summary} loading={loadingSummary} />

            {/* D — Streak banner */}
            <StreakBanner days={summary.study_streak_days} />

            {/* C — Focus areas (weak topics) */}
            <FocusAreaCard
              topics={weakTopics}
              loading={loadingWeak}
              onPractice={() => navigate("/student/practice")}
            />

            {/* MY SUBJECTS — with B (grade badge) + H (topic chips) */}
            <div className="bg-white p-4 rounded-xl mb-4 shadow-sm">
              <h2 className="font-semibold mb-3 text-gray-800">My Subjects</h2>
              {loadingSubjects ? (
                <div className="grid grid-cols-2 gap-3">
                  {[0,1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : subjects.length === 0 ? (
                <div className="text-center py-6">
                  <BookOpen size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No subjects enrolled yet.</p>
                  <button onClick={() => navigate("/subjects")} className="mt-2 text-sm text-indigo-600 font-medium hover:underline">
                    Browse subjects →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {subjects.map(subject => (
                    <SubjectCard
                      key={subject.id}
                      subject={subject}
                      pct={subjectProgress[subject.id] ?? null}
                      onClick={() => navigate(`/student/subject/${subject.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* QUICK LINKS */}
            <div className="mb-4">
              <h2 className="font-semibold mb-3 text-gray-800">Quick Links</h2>
              <div className="grid grid-cols-4 gap-2">
                {quickLinks.map(({ label, icon, path, bg, onClick: qlClick }) => (
                  <button
                    key={label}
                    onClick={() => qlClick ? qlClick() : navigate(path)}
                    className={`border ${bg} p-3 rounded-xl flex flex-col items-center gap-1.5 hover:opacity-80 transition-opacity shadow-sm`}
                  >
                    {icon}
                    <span className="text-[10px] font-semibold text-gray-700 text-center leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* #6 — Mock Exam Subject Picker Modal */}
            {showMockPicker && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                  <div className="bg-rose-500 px-5 py-4">
                    <p className="text-white font-bold text-base">Start Mock Exam</p>
                    <p className="text-white/70 text-xs mt-0.5">Choose a subject to begin your 45-minute timed exam</p>
                  </div>
                  <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                    {subjects.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">No subjects enrolled yet.</p>
                    ) : subjects.map(s => (
                      <button key={s.id}
                        onClick={() => { setShowMockPicker(false); navigate(`/student/mock/${s.id}`); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:bg-rose-50 hover:border-rose-200 transition-colors text-left">
                        <span className="text-xl">{s.icon_emoji || "📚"}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                          {s.exam_board_code && <p className="text-xs text-gray-400">{s.exam_board_code}</p>}
                        </div>
                        <ClipboardList size={14} className="text-rose-300 ml-auto shrink-0" />
                      </button>
                    ))}
                  </div>
                  <div className="px-4 pb-4">
                    <button onClick={() => setShowMockPicker(false)}
                      className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* #8 — Daily Target */}
            <div className="bg-white rounded-xl p-4 mb-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target size={15} className="text-indigo-500" />
                  <span className="text-sm font-semibold text-gray-800">Today's Target</span>
                </div>
                <span className={`text-xs font-bold ${dailyPct >= 100 ? "text-green-600" : "text-indigo-600"}`}>
                  {todayAttempts} / {dailyTarget} questions
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${dailyPct >= 100 ? "bg-green-500" : "bg-indigo-500"}`}
                  style={{ width: `${dailyPct}%` }}
                />
              </div>
              {dailyPct >= 100
                ? <p className="text-xs text-green-600 font-medium mt-1.5">✅ Daily goal complete — great work!</p>
                : <p className="text-xs text-gray-400 mt-1.5">
                    {dailyTarget - todayAttempts} more to hit your daily goal
                    {weakTopics.length > 0 && ` · try ${weakTopics[0]?.topic || weakTopics[0]?.subject_name || "your weak topics"}`}
                  </p>
              }
            </div>

            {/* RECENT QUIZ ACTIVITY */}
            <div className="bg-white p-4 rounded-xl mb-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Recent Activity</h2>
                <TrendingUp size={14} className="text-gray-300" />
              </div>
              {loadingScores ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : recentScores.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400">No quiz activity yet.</p>
                  <button onClick={() => navigate("/student/practice")} className="mt-1 text-sm text-indigo-600 font-medium hover:underline">
                    Start practising →
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recentScores.slice(0, 5).map((row, i) => {
                    const pct = parseFloat(row.accuracy_pct) || 0;
                    const barColor = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-14 shrink-0">
                          {new Date(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-600 w-9 text-right shrink-0">{pct}%</span>
                        <span className="text-[10px] text-gray-400 shrink-0">({row.attempts}Q)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* #3 — ASSIGNED FILES: grouped by subject, then push type, with inline viewer */}
            <AssignedFilesSection
              resources={resources}
              loading={loadingResources}
              groupedByType={groupedByType}
              totalResources={totalResources}
              navigate={navigate}
            />
          </>
        )}
      </div>
    </div>
  );
}
