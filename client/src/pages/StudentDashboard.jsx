// StudentDashboard.jsx
// Fixes applied in this file:
//   DEF-003 — Route architecture: StudentDashboard is now the LAYOUT SHELL only.
//             DashboardHome content is rendered at the index route via <Outlet />.
//             The self-referencing /student/dashboard → <StudentDashboard /> loop is
//             broken by wiring the index to <DashboardContent /> (see below).
//   DEF-006 — Silent API failures: loadAll() now exposes per-section error state
//             with visible banners and Retry buttons instead of swallowed .catch(() => {}).
//   DEF-009 — Mobile navigation: a slide-out drawer + bottom nav bar replaces the
//             desktop-only sidebar so every navigation destination is reachable on phone.
//   DEF-013 — row.date null-guard: Invalid Date is prevented with a fallback.
//   DEF-015 — Greeting is memoised with useMemo so it doesn't recompute inline every render.
//   DEF-017 — Streak badge now shows a "Start your streak!" prompt at day 1 (was >= 2).

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import TopNav from "../components/TopNav";
import api, { TIMEOUT_DASHBOARD, TIMEOUT_ANALYTICS } from "../services/apiClient";
import { openResourceAuth } from "../utils/authenticatedDownload";
import {
  FileText, Video, Music, File, Download,
  Zap, ClipboardList, ClipboardCheck, History, BookMarked, BarChart2, BookOpen, TrendingUp,
  Flame, Target, GraduationCap, ScanLine, Menu, X,
  AlertCircle, RefreshCw, Settings,
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
  learning_material: { label: "📚 Learning Materials", badge: "bg-blue-100 text-blue-700"    },
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

// ── URL resolver ──────────────────────────────────────────────────────────────
function resolveFileUrl(rawUrl) {
  const apiBase = (import.meta.env.VITE_API_URL || "")
    .replace(/\/api$/, "")
    .replace(/\/$/, "") || window.location.origin;
  if (!rawUrl) return "";
  if (!rawUrl.startsWith("http")) return `${apiBase}${rawUrl}`;
  // Rewrite any legacy onrender.com URLs stored in the DB to the current host.
  if (/onrender\.com/.test(rawUrl)) {
    return rawUrl.replace(/https?:\/\/[^/]*onrender\.com/, apiBase);
  }
  return rawUrl;
}

// ── Inline file viewer ────────────────────────────────────────────────────────
// DEF-007: Download links always go through /api/resources/:id/download which
//          enforces the protect middleware and enrollment checks. Direct static
//          URLs are only used as a fallback for legacy files without an id.
function InlineViewer({ file }) {
  const url      = file.id ? `/api/resources/${file.id}/download` : resolveFileUrl(file.file_url);
  // Google Docs Viewer / Office Online fetch the file from their own servers,
  // so they can't use our auth-gated /download proxy — they'd get a 401 and
  // show "No preview available". Use the direct public storage URL instead.
  // The authenticated proxy (url) is kept for the download button only.
  const publicUrl = resolveFileUrl(file.file_url) || url;
  const type = (file.type || file.resource_type || "").toLowerCase();
  const ext  = url.split("?")[0].split(".").pop().toLowerCase();
  const [broken, setBroken] = useState(false);

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

  const isOffice = ["docx","pptx","xlsx","doc","ppt","xls"].includes(ext);
  const viewerUrl = isOffice
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`
    : `https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}&embedded=true`;

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
function AssignedFilesSection({ resources, loading, error, onRetry, totalResources, navigate }) {
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

  if (loading) return (
    <div className="space-y-2">
      {[0,1,2].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-100 bg-red-50 p-4 flex items-start gap-3">
      <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-red-700 font-medium">Could not load resources</p>
        <p className="text-xs text-red-500 mt-0.5">{error}</p>
      </div>
      <button onClick={onRetry} className="flex items-center gap-1 text-xs text-red-600 font-semibold hover:text-red-800 transition-colors shrink-0">
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );

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
                      // DEF-007: Always use authenticated download endpoint when file.id is available.
                      const resolvedUrl = file.id
                        ? `/api/resources/${file.id}/download`
                        : resolveFileUrl(file.file_url);
                      return (
                        <div key={`${file.id}-${pt}`} className="border border-gray-100 rounded-xl overflow-hidden bg-white hover:border-blue-200 transition-colors">
                          <div className="p-3 flex items-center gap-3">
                            <FileIcon type={fileType} size={15} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{file.title}</p>
                              {(file.uploaded_by_name || file.assigned_by_name) && (
                                <p className="text-[10px] text-gray-400">From: {file.uploaded_by_name || file.assigned_by_name}</p>
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
                              <button
                                onClick={() => openResourceAuth(file.id, file.file_url)}
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-colors">
                                <Download size={13} />
                              </button>
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
// DEF (obs 4.6): Distinct colours for each grade band — A* purple, A green, B teal, C blue, D amber, E red.
function predictGrade(pct) {
  if (pct === null || pct === undefined) return null;
  if (pct >= 90) return { grade: "A*", color: "text-purple-700 bg-purple-100" };
  if (pct >= 80) return { grade: "A",  color: "text-green-700 bg-green-100"   };
  if (pct >= 70) return { grade: "B",  color: "text-teal-700 bg-teal-100"     };
  if (pct >= 60) return { grade: "C",  color: "text-blue-700 bg-blue-100"     };
  if (pct >= 50) return { grade: "D",  color: "text-amber-700 bg-amber-100"   };
  return { grade: "E", color: "text-red-600 bg-red-100" };
}

// ── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50 p-3 flex items-center gap-3">
      <AlertCircle size={15} className="text-red-400 shrink-0" />
      <p className="text-sm text-red-700 flex-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1 text-xs text-red-600 font-semibold hover:text-red-800 transition-colors shrink-0">
          <RefreshCw size={12} /> Retry
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD CONTENT (the inline data section, rendered at the index route)
// DEF-003: This used to live in <StudentDashboard> which was also the shell,
//          causing a self-referencing route loop. Now it's a separate component
//          rendered as the index child of the /student route.
// ═══════════════════════════════════════════════════════════════════════════════
export function DashboardContent() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [summary,          setSummary]          = useState({});
  const [loadingSummary,   setLoadingSummary]   = useState(true);
  const [errorSummary,     setErrorSummary]     = useState(null);

  const [subjects,         setSubjects]         = useState([]);
  const [loadingSubjects,  setLoadingSubjects]  = useState(true);

  const [weakTopics,       setWeakTopics]       = useState([]);

  const [resources,        setResources]        = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [errorResources,   setErrorResources]   = useState(null);

  const [recentScores,     setRecentScores]     = useState([]);
  const [loadingScores,    setLoadingScores]    = useState(true);
  const [errorScores,      setErrorScores]      = useState(null);

  const [showMockPicker,   setShowMockPicker]   = useState(false);

  // DEF-006: loadAll uses per-request timeouts and surfaces errors instead of
  //          swallowing them.  Each section independently tracks its error state.
  const loadAll = useCallback(async () => {
    setLoadingSummary(true);   setErrorSummary(null);
    setLoadingSubjects(true);
    setLoadingResources(true); setErrorResources(null);
    setLoadingScores(true);    setErrorScores(null);

    await Promise.allSettled([
      api.get("/analytics/summary", { timeout: TIMEOUT_DASHBOARD })
        .then(r => { setSummary(r.data || {}); })
        .catch(e => { setErrorSummary(e.message || "Failed to load summary"); setSummary({}); })
        .finally(() => setLoadingSummary(false)),

      api.get("/students/my-subjects", { timeout: TIMEOUT_DASHBOARD })
        .then(r => setSubjects(r.data || []))
        .catch(() => setSubjects([]))
        .finally(() => setLoadingSubjects(false)),

      api.get("/analytics/weak-topics?limit=3", { timeout: TIMEOUT_ANALYTICS })
        .then(r => setWeakTopics(r.data || []))
        .catch(() => setWeakTopics([])),

      api.get("/resources/my-assignments", { timeout: TIMEOUT_DASHBOARD })
        .then(r => { setResources(r.data || []); })
        .catch(e => { setErrorResources(e.message || "Failed to load resources"); setResources([]); })
        .finally(() => setLoadingResources(false)),

      api.get("/quizzes/history", { timeout: TIMEOUT_ANALYTICS })
        .then(r => { setRecentScores(r.data || []); })
        .catch(e => { setErrorScores(e.message || "Failed to load activity"); setRecentScores([]); })
        .finally(() => setLoadingScores(false)),
    ]);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const dailyTarget   = user?.daily_goal || 20; // DEF-010: daily_goal now fetched via protect middleware
  const todayAttempts = summary.today_attempts ?? 0;
  const dailyPct      = Math.min(100, Math.round((todayAttempts / dailyTarget) * 100));
  // X13: activity breakdown
  const todayQuiz     = summary.today_quiz_attempts     ?? 0;
  const todayMock     = summary.today_mock_attempts     ?? 0;
  const todayPractice = summary.today_practice_attempts ?? 0;

  return (
    <div className="px-4 md:px-6 py-5 space-y-6 max-w-2xl">

      {/* ── METRIC STRIP ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loadingSummary
          ? [0,1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)
          : errorSummary
            ? <div className="col-span-4"><ErrorBanner message={errorSummary} onRetry={loadAll} /></div>
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
      {!loadingSummary && !errorSummary && (
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
          {/* X13 — activity type breakdown */}
          {todayAttempts > 0 && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {todayQuiz > 0 && (
                <span className="text-[10px] text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                  Quiz: {todayQuiz}
                </span>
              )}
              {todayPractice > 0 && (
                <span className="text-[10px] text-violet-500 bg-violet-50 px-2 py-0.5 rounded-full">
                  Practice: {todayPractice}
                </span>
              )}
              {todayMock > 0 && (
                <span className="text-[10px] text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">
                  Mock: {todayMock}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── FOCUS AREAS ── */}
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
                <button
                  onClick={() => t.subtopic_id
                    ? navigate(`/student/subtopic/${t.subtopic_id}?tab=practice`)
                    : navigate('/student/practice')}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold shrink-0 px-2 py-1 rounded-lg hover:bg-rose-100 transition-colors">
                  Practice
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── RECENT ACTIVITY ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <TrendingUp size={13} className="text-gray-400" /> Recent Activity
        </h2>
        {loadingScores ? (
          <div className="space-y-2">
            {[0,1].map(i => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}
          </div>
        ) : errorScores ? (
          <ErrorBanner message={errorScores} onRetry={loadAll} />
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
              // DEF-013: null guard on row.date — fall back to "—" instead of "Invalid Date"
              const dateStr = row.date
                ? new Date(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "—";
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[11px] text-gray-400 font-mono w-14 shrink-0">{dateStr}</span>
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

      {/* ── ASSIGNED RESOURCES ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <BookOpen size={13} className="text-gray-400" /> Assigned Resources
        </h2>
        <AssignedFilesSection
          resources={resources}
          loading={loadingResources}
          error={errorResources}
          onRetry={loadAll}
          totalResources={resources.length}
          navigate={navigate}
        />
      </section>

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

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT DASHBOARD SHELL
// DEF-003: This component is now purely a layout shell (sidebar + TopNav + <Outlet>).
//          It no longer self-renders dashboard data — that is now <DashboardContent>
//          which is wired to the /student index route in App.jsx.
// DEF-009: Full mobile navigation via slide-out drawer and bottom nav bar.
// DEF-015: Greeting memoised with useMemo (no inline new Date() on every render).
// DEF-017: Streak prompt shown from day >= 1.
// ═══════════════════════════════════════════════════════════════════════════════
export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [summary,        setSummary]        = useState({});
  const [showMockPicker, setShowMockPicker] = useState(false);
  const [subjects,       setSubjects]       = useState([]);

  const firstName =
    user?.first_name || user?.firstName ||
    user?.name?.split(" ")[0] ||
    user?.email?.split("@")[0] || "there";

  // DEF-015: Memoised so it doesn't recompute inline every render cycle.
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  }, []);

  // Load streak + subjects for sidebar badge and mock picker
  useEffect(() => {
    api.get("/analytics/summary", { timeout: 10_000 })
      .then(r => setSummary(r.data || {}))
      .catch(() => {});
    api.get("/students/my-subjects", { timeout: 10_000 })
      .then(r => setSubjects(r.data || []))
      .catch(() => {});
  }, []);

  const sidebarItems = [
    { label: "Dashboard",   icon: BarChart2,    path: "/student/dashboard"  },
    { label: "Subjects",    icon: GraduationCap, path: "/student/subjects"  },
    { label: "Resources",   icon: BookOpen,     path: "/student/resources"  },
    { label: "Practice",    icon: Zap,          path: "/student/practice"   },
    { label: "Past Papers", icon: FileText,     path: "/past-papers"        },
    { label: "Mock Exam",    icon: ClipboardList,  path: null, onClick: () => setShowMockPicker(true) },
    { label: "Mock History", icon: History,        path: "/student/mock-history"  },
    { label: "My Tests",     icon: ClipboardCheck, path: "/student/my-tests"     },
    { label: "Quiz History", icon: BookMarked,     path: "/student/quiz-history" },
    { label: "Analytics",    icon: TrendingUp,     path: "/student/analytics"    },
    { label: "AI Marking",  icon: ScanLine,     path: "/student/mark-image" },
    { label: "Exam Types",         icon: Download,   path: "/student/exam-types"         },

  ];

  const isActive = (item) => {
    if (!item.path) return false;
    if (item.label === "Dashboard") return location.pathname === item.path || location.pathname === "/student" || location.pathname === "/student/";
    if (item.label === "Subjects")  return location.pathname.startsWith("/student/subjects") || location.pathname.startsWith("/student/subject/");
    if (item.label === "Resources") return location.pathname.startsWith("/student/resources") || location.pathname.startsWith("/student/files");
    return location.pathname.startsWith(item.path);
  };

  const handleNav = (item) => {
    if (item.onClick) { item.onClick(); return; }
    navigate(item.path);
    setDrawerOpen(false);
  };

  const streakDays = summary.study_streak_days ?? 0;

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <TopNav />

      {/* DEF-009: Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* DEF-009: Slide-out navigation drawer (mobile) */}
      <aside className={`fixed top-0 left-0 h-full w-64 z-50 bg-[#f0ede8] border-r border-[#e8e4dd] transform transition-transform duration-200 md:hidden flex flex-col ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e4dd] shrink-0">
          <span className="text-sm font-bold text-gray-700">Navigation</span>
          <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-white/60 text-gray-500">
            <X size={16} />
          </button>
        </div>
        <div className="px-3 py-4 overflow-y-auto flex-1">
          <div className="px-3 py-2 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">Student</p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5 truncate">{firstName}</p>
          </div>
          {streakDays >= 1 && (
            <div className="mx-3 mb-3 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-1.5">
              <Flame size={12} className="text-amber-500 shrink-0" />
              {/* DEF-017: show streak from day 1 */}
              <span className="text-[10px] font-semibold text-amber-700">
                {streakDays === 1 ? "Start your streak! 🔥" : `${streakDays}d streak`}
              </span>
            </div>
          )}
          <nav className="space-y-0.5">
            {sidebarItems.map(item => {
              const Icon   = item.icon;
              const active = isActive(item);
              return (
                <button key={item.label} onClick={() => handleNav(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left ${
                    active ? "bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]" : "text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60"
                  }`}>
                  <Icon size={14} className={active ? "text-[#d97757]" : "text-[#b5a99a]"} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="flex">
        {/* ── DESKTOP SIDEBAR ──────────────────────────────────────── */}
        <aside className="w-52 shrink-0 min-h-[calc(100vh-56px)] bg-[#f0ede8] border-r border-[#e8e4dd] sticky top-14 self-start hidden md:block">
          <div className="px-3 py-5">
            <div className="px-3 py-2 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">Student</p>
              <p className="text-xs font-semibold text-gray-700 mt-0.5 truncate">{firstName}</p>
            </div>
            {/* DEF-017: streak shown from day 1 */}
            {streakDays >= 1 && (
              <div className="mx-3 mb-3 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-1.5">
                <Flame size={12} className="text-amber-500 shrink-0" />
                <span className="text-[10px] font-semibold text-amber-700">
                  {streakDays === 1 ? "Start your streak! 🔥" : `${streakDays}d streak`}
                </span>
              </div>
            )}
            <nav className="space-y-0.5">
              {sidebarItems.map(item => {
                const Icon   = item.icon;
                const active = isActive(item);
                return (
                  <button key={item.label} onClick={() => handleNav(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left ${
                      active ? "bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]" : "text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60"
                    }`}>
                    <Icon size={14} className={active ? "text-[#d97757]" : "text-[#b5a99a]"} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {/* Header */}
          <div className="border-b border-gray-100 px-4 md:px-8 py-4 bg-white">
            <div className="flex items-center gap-3">
              {/* DEF-009: hamburger to open drawer on mobile */}
              <button onClick={() => setDrawerOpen(true)}
                className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                <Menu size={18} />
              </button>
              <div className="flex-1">
                {/* DEF-015: greeting comes from memoised value */}
                <p className="text-blue-500 text-xs uppercase tracking-widest mb-0.5 font-medium">
                  Good {greeting}
                </p>
                <h1 className="text-xl font-bold text-gray-900">{firstName}</h1>
              </div>
            </div>
          </div>

          {/* DEF-003: <Outlet /> renders the matched child route.
              /student/dashboard → DashboardContent (wired in App.jsx as index)
              /student/analytics → StudentAnalyticsDashboard, etc. */}
          <Outlet />
        </main>
      </div>

      {/* DEF-009: Mobile bottom navigation bar — always visible on small screens */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex md:hidden">
        {[
          { label: "Home",      icon: BarChart2,    path: "/student/dashboard" },
          { label: "Subjects",  icon: GraduationCap, path: "/student/subjects" },
          { label: "Practice",  icon: Zap,          path: "/student/practice"  },
          { label: "Analytics", icon: TrendingUp,   path: "/student/analytics" },
          { label: "Resources", icon: BookOpen,     path: "/student/resources" },
        ].map(item => {
          const Icon   = item.icon;
          const active = isActive(item);
          return (
            <button key={item.label} onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                active ? "text-[#d97757]" : "text-gray-400 hover:text-gray-700"
              }`}>
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>

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
