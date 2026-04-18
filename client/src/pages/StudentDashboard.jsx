import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import TopNav from "../components/TopNav";
import api from "../services/apiClient";
import { FileText, Video, Music, File, ExternalLink, Download, BookOpen, Zap, ClipboardList, BarChart2 } from "lucide-react";

// ── Push type config ──────────────────────────────────────────────────────────
const PUSH_TYPE_META = {
  quiz:              { label: '⚡ Quizzes',            color: 'bg-amber-50 border-amber-200',  badge: 'bg-amber-100 text-amber-700'  },
  practice_test:     { label: '📝 Practice Tests',    color: 'bg-blue-50 border-blue-200',    badge: 'bg-blue-100 text-blue-700'    },
  learning_material: { label: '📚 Learning Materials', color: 'bg-teal-50 border-teal-200',   badge: 'bg-teal-100 text-teal-700'    },
};
const PUSH_ORDER = ['quiz', 'practice_test', 'learning_material'];

function FileIcon({ type, size = 16 }) {
  if (type === 'video') return <Video   size={size} className="text-blue-500"   />;
  if (type === 'audio') return <Music   size={size} className="text-purple-500" />;
  if (type === 'pdf')   return <FileText size={size} className="text-red-500"   />;
  return <File size={size} className="text-gray-400" />;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const firstName = user?.first_name || user?.firstName || user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const [subjects,          setSubjects]          = useState([]);
  const [loadingSubjects,   setLoadingSubjects]   = useState(true);
  const [resources,         setResources]         = useState([]);
  const [loadingResources,  setLoadingResources]  = useState(true);
  const [recentScores,      setRecentScores]      = useState([]);
  const [loadingScores,     setLoadingScores]     = useState(true);

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

  const loadResources = useCallback(async () => {
    try {
      // Use my-assignments endpoint for pushed/assigned resources
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
    loadResources();
    loadRecentScores();
  }, [loadSubjects, loadResources, loadRecentScores]);

  // Group resources by push_type, then by subject
  const groupedByType = useMemo(() => {
    const groups = {};
    for (const r of resources) {
      const pt = r.push_type || 'learning_material';
      if (!groups[pt]) groups[pt] = [];
      groups[pt].push(r);
    }
    return groups;
  }, [resources]);

  const totalResources = resources.length;
  const isRootDashboard = location.pathname === "/student" || location.pathname === "/student/dashboard";

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">Hi, {firstName}</h1>

        <Outlet />

        {isRootDashboard && (
          <>
            {/* SUBJECTS */}
            <div className="bg-white p-4 rounded-xl mb-4">
              <h2 className="font-semibold mb-3">My Subjects</h2>

              {loadingSubjects ? (
                <p className="text-sm text-gray-400">Loading subjects...</p>
              ) : subjects.length === 0 ? (
                <p className="text-sm text-gray-400">No subjects available.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {subjects.map((subject) => (
                    <button
                      key={subject.id}
                      onClick={() => navigate(`/student/subject/${subject.id}`)}
                      className="border p-3 rounded-xl text-left hover:bg-gray-50"
                    >
                      <p className="font-semibold text-sm">{subject.name}</p>
                      {/* Progress bar per subject */}
                      {subject.progress_pct !== undefined ? (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-400">Progress</span>
                            <span className="text-xs text-gray-500 font-medium">{subject.progress_pct ?? 0}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all"
                              style={{ width: `${subject.progress_pct ?? 0}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-200 rounded-full w-0" />
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* QUICK-LINK CARDS */}
            <div className="mb-4">
              <h2 className="font-semibold mb-3">Quick Links</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Past Papers",   icon: <FileText size={20} className="text-blue-500" />,   path: "/past-papers",       bg: "bg-blue-50 border-blue-100"   },
                  { label: "Practice Mode", icon: <Zap size={20} className="text-amber-500" />,       path: "/practice",          bg: "bg-amber-50 border-amber-100" },
                  { label: "Mock Exam",     icon: <ClipboardList size={20} className="text-rose-500" />, path: "/mock-exam",       bg: "bg-rose-50 border-rose-100"   },
                  { label: "Analytics",     icon: <BarChart2 size={20} className="text-green-500" />, path: "/student/analytics", bg: "bg-green-50 border-green-100" },
                ].map(({ label, icon, path, bg }) => (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
                    className={`border ${bg} p-4 rounded-xl text-left flex items-center gap-3 hover:opacity-80 transition-opacity`}
                  >
                    {icon}
                    <span className="text-sm font-semibold text-gray-700">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* RECENT QUIZ SCORES */}
            <div className="bg-white p-4 rounded-xl mb-4">
              <h2 className="font-semibold mb-3">Recent Quiz Activity</h2>
              {loadingScores ? (
                <p className="text-sm text-gray-400">Loading scores...</p>
              ) : recentScores.length === 0 ? (
                <p className="text-sm text-gray-400">No quiz activity yet. Try Practice Mode!</p>
              ) : (
                <div className="space-y-2">
                  {recentScores.slice(0, 5).map((row, i) => {
                    const pct = parseFloat(row.accuracy_pct) || 0;
                    const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-20 shrink-0">
                          {new Date(row.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-600 w-10 text-right shrink-0">{pct}%</span>
                        <span className="text-xs text-gray-400 shrink-0">({row.attempts} Q)</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ASSIGNED RESOURCES — grouped by push_type */}
            <div className="bg-white p-4 rounded-xl space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">My Assigned Files</h2>
                {totalResources > 0 && (
                  <span className="text-xs text-gray-400">{totalResources} file{totalResources !== 1 ? 's' : ''}</span>
                )}
              </div>

              {loadingResources ? (
                <p className="text-sm text-gray-400">Loading files...</p>
              ) : totalResources === 0 ? (
                <p className="text-sm text-gray-400">No files assigned yet.</p>
              ) : (
                PUSH_ORDER.filter(pt => groupedByType[pt]?.length > 0).map(pt => {
                  const meta  = PUSH_TYPE_META[pt];
                  const files = groupedByType[pt];
                  return (
                    <div key={pt}>
                      <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">{meta.label}</h3>
                      <div className="space-y-2">
                        {files.map((file) => (
                          <div
                            key={`${file.id}-${file.push_type}`}
                            className={`border rounded-xl p-3 flex items-center gap-3 ${meta.color}`}
                          >
                            <FileIcon type={file.type || file.resource_type} size={18} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{file.title}</p>
                              {file.subject_name && (
                                <p className="text-xs text-gray-500">{file.subject_name}</p>
                              )}
                              {file.assigned_by_name && (
                                <p className="text-xs text-gray-400">From: {file.assigned_by_name}</p>
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
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
