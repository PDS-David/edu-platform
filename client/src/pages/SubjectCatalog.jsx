import { useState, useEffect } from "react";
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

        <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-10">
          Examinations
        </h1>

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
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SubjectCatalog;
