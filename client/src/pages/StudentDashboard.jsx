import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import TopNav from "../components/TopNav";
import api from "../services/apiClient";
import { FileText, Video, Music, File, ExternalLink, Download } from "lucide-react";

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

  useEffect(() => {
    loadSubjects();
    loadResources();
  }, [loadSubjects, loadResources]);

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
  const isRootDashboard = location.pathname === "/student";

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
                    </button>
                  ))}
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
