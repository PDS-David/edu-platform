import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ExamBoardSelector from "../components/ExamBoardSelector";
import SubjectCard from "../components/SubjectCard";
import PublicNav from "../components/PublicNav";
import api from "../services/apiClient";

const SubjectCatalog = () => {
  const [selectedBoard, setSelectedBoard] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!selectedBoard) {
      setSubjects([]);
      setError(null);
      return;
    }

    fetchSubjects();
  }, [selectedBoard]);

  const fetchSubjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get(`/exam-boards/${selectedBoard}/subjects`);
      setSubjects(res?.data || []);
    } catch (err) {
      setError(err?.message || "Unable to load subjects");
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = subjects.filter((s) =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <PublicNav />

      <main className="pt-6 pb-20 px-4 max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Examinations</h1>

        <ExamBoardSelector
          selectedBoard={selectedBoard}
          onBoardChange={(v) => {
            setSelectedBoard(v);
            setSearchQuery("");
          }}
        />

        {loading && <p>Loading...</p>}
        {error && <p className="text-red-500">{error}</p>}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {filtered.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                examBoard={selectedBoard}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SubjectCatalog;
