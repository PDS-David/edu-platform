import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import TopNav from "../components/TopNav";
import api from "../services/api";

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const firstName = user?.firstName || "Student";

  const [subjects, setSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);

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
      const res = await api.get("/resources");
      setResources(res.data.data || []);
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

  // ✅ MEMOIZED GROUPING (major performance fix)
  const groupedResources = useMemo(() => {
    return resources.reduce((acc, r) => {
      const key = r.subject_name || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    }, {});
  }, [resources]);

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
                      onClick={() =>
                        navigate(`/student/subject/${subject.id}`)
                      }
                      className="border p-3 rounded-xl text-left hover:bg-gray-50"
                    >
                      <p className="font-semibold text-sm">
                        {subject.name}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* RESOURCES */}
            <div className="bg-white p-4 rounded-xl">
              <h2 className="font-semibold mb-3">My Files</h2>

              {loadingResources ? (
                <p className="text-sm text-gray-400">Loading files...</p>
              ) : Object.keys(groupedResources).length === 0 ? (
                <p className="text-sm text-gray-400">
                  No files assigned yet.
                </p>
              ) : (
                Object.entries(groupedResources).map(([subject, files]) => (
                  <div key={subject} className="mb-4">
                    <h3 className="font-semibold text-sm mb-2">
                      {subject}
                    </h3>

                    <div className="space-y-2">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="border p-3 rounded-lg flex justify-between items-center"
                        >
                          <span className="text-sm">{file.title}</span>

                          <div className="flex gap-2">
                            <a
                              href={file.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-500 text-sm"
                            >
                              View
                            </a>

                            <a
                              href={file.file_url}
                              download
                              className="text-green-500 text-sm"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
