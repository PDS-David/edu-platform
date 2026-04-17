import { useState, useEffect } from "react";
import api from "../services/apiClient";
import { Plus, Trash2, X } from "lucide-react";
import TopNav from "../components/TopNav";

const FALLBACK_EXAM_TYPES = [
  { id: null, code: "JAMB", name: "JAMB / UTME" },
  { id: null, code: "WAEC", name: "WAEC" },
  { id: null, code: "NECO", name: "NECO" },
];

function Toast({ msg, type, onClose }) {
  return (
    <div className={`fixed bottom-6 right-4 px-4 py-3 rounded-xl text-white ${
      type === "error" ? "bg-red-600" : "bg-gray-900"
    }`}>
      {msg}
      <button onClick={onClose} className="ml-3">
        <X size={14} />
      </button>
    </div>
  );
}

function AddAssignmentDialog({ teachers, onClose, onSaved }) {
  const [examTypes, setExamTypes] = useState(FALLBACK_EXAM_TYPES);
  const [subjects, setSubjects] = useState([]);

  const [teacherId, setTeacherId] = useState("");
  const [examTypeCode, setExamTypeCode] = useState("");
  const [examTypeId, setExamTypeId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/exam-boards")
      .then((res) => setExamTypes(res.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!examTypeCode) return;

    const found = examTypes.find((e) => e.code === examTypeCode);
    setExamTypeId(found?.id || "");

    api.get(`/exam-boards/${examTypeCode}/subjects`)
      .then((res) => setSubjects(res.data || []))
      .catch(() => setSubjects([]));
  }, [examTypeCode]);

  const handleSave = async () => {
    if (!teacherId || !examTypeCode || !subjectId) {
      setError("All fields are required.");
      return;
    }

    setSaving(true);

    try {
      await api.post("/admin/teacher-subjects", {
        teacher_id: teacherId,
        subject_id: subjectId,
        exam_board_id: examTypeId || null,
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save assignment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-6 rounded-2xl">
        <h2 className="font-semibold mb-4">Assign Subject</h2>

        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">Select Teacher</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.first_name} {t.last_name}
            </option>
          ))}
        </select>

        <select value={examTypeCode} onChange={(e) => setExamTypeCode(e.target.value)}>
          <option value="">Select Exam Type</option>
          {examTypes.map((e) => (
            <option key={e.code} value={e.code}>
              {e.name}
            </option>
          ))}
        </select>

        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">Select Subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {error && <p className="text-red-600 text-xs">{error}</p>}

        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Assign"}
        </button>
      </div>
    </div>
  );
}

export default function TeacherAssignmentPage() {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => {
    Promise.all([
      api.get("/admin/teacher-subjects").catch(() => ({ data: [] })),
      api.get("/admin/users?role=teacher").catch(() => ({ data: [] })),
    ]).then(([a, t]) => {
      setAssignments(a.data || []);
      setTeachers(t.data || []);
    });
  };

  useEffect(load, []);

  const remove = async (id) => {
    try {
      await api.delete(`/admin/teacher-subjects/${id}`);
      setAssignments((p) => p.filter((x) => x.id !== id));
      setToast({ msg: "Deleted", type: "success" });
    } catch {
      setToast({ msg: "Failed to delete", type: "error" });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <button onClick={() => setShowDialog(true)}>
        <Plus size={14} /> Add Assignment
      </button>

      {assignments.map((a) => (
        <div key={a.id}>
          <p>{a.teacher_name}</p>
          <p>{a.subject_name}</p>
          <button onClick={() => remove(a.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {showDialog && (
        <AddAssignmentDialog
          teachers={teachers}
          onClose={() => setShowDialog(false)}
          onSaved={load}
        />
      )}

      {toast && (
        <Toast {...toast} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
