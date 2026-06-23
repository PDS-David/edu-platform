import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ExamBoardSelector from "../components/ExamBoardSelector";
import SubjectCard from "../components/SubjectCard";
import PublicNav from "../components/PublicNav";
import api from "../services/apiClient";
import useAuth from "../hooks/useAuth";
import { BookOpen, Star } from "lucide-react";

const SubjectCatalog = () => {
  const { user } = useAuth();
  const [selectedBoard, setSelectedBoard] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enrolledLoading, setEnrolledLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load enrolled subjects for logged-in students
  useEffect(() => {
    if (!user) return;
    setEnrolledLoading(true);
    api.get('/students/my-subjects')
      .then(r => setEnrolledSubjects(r.data || []))
      .catch(() => setEnrolledSubjects([]))
      .finally(() => setEnrolledLoading(false));
  }, [user]);

  useEffect(() => {
    if (selectedBoard) fetchSubjects();
    else {
      setSubjects([]);
      setError(null);
    }
  }, [selectedBoard]);

  const fetchSubjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/exam-boards/${selectedBoard}/subjects`);
      setSubjects(res.data || []);
    } catch {
      setError("Unable to load subjects. Please try again.");
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSubjects = subjects.filter((subject) =>
    subject.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    subject.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <PublicNav />

      <main className="pt-6 pb-20 px-4 max-w-7xl mx-auto">

        {/* Back to dashboard for logged-in users */}
        {user && (
          <div className="mb-4">
            <Link
              to={user.role === 'teacher' ? '/teacher/dashboard' : user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard'}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 font-medium"
            >
              ← Dashboard
            </Link>
          </div>
        )}

        <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-10">
          Examinations
        </h1>

        {/* ── Enrolled subjects — shown prominently to logged-in students ── */}
        {user && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Star size={18} className="text-yellow-500 fill-yellow-400" />
              <h2 className="text-lg font-bold text-gray-800">My Enrolled Subjects</h2>
            </div>
            {enrolledLoading ? (
              <div className="flex gap-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-20 w-40 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : enrolledSubjects.length === 0 ? (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 text-sm text-blue-600">
                You have no enrolled subjects yet. Browse below and start learning!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {enrolledSubjects.map(s => (
                  <a
                    key={s.id}
                    href={`/subjects/${s.id}`}
                    className="flex items-center gap-3 bg-white border-2 border-blue-200 hover:border-blue-400 rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition-all group"
                  >
                    <BookOpen size={18} className="text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-700">{s.name}</p>
                      {s.exam_board_code && (
                        <p className="text-xs text-gray-400 font-mono">{s.exam_board_code}</p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Browse all subjects by exam board ── */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-10">
          <ExamBoardSelector
            selectedBoard={selectedBoard}
            onBoardChange={(v) => {
              setSelectedBoard(v);
              setSearchQuery("");
            }}
          />
        </div>

        {!loading && error && (
          <div className="text-center text-red-500">{error}</div>
        )}

        {!loading && filteredSubjects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredSubjects.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                examBoard={selectedBoard}
                isEnrolled={enrolledSubjects.some(e => String(e.id) === String(subject.id))}
                onEnrolled={(id) => setEnrolledSubjects(prev => [...prev, subject])}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SubjectCatalog;
