// client/src/pages/TeacherAssignmentPage.jsx

import { useState, useEffect } from "react";
import api from "../services/api";
import {
  Plus,
  Trash2,
  Loader2,
  X,
} from "lucide-react";

import TopNav from "../components/TopNav";

// ─────────────────────────────────────────────────────────────
// Fallback exam types
// ─────────────────────────────────────────────────────────────
const FALLBACK_EXAM_TYPES = [
  { id: null, code: "JAMB", name: "JAMB / UTME", icon_emoji: "" },
  { id: null, code: "WAEC", name: "WAEC", icon_emoji: "" },
  { id: null, code: "GCE_OL", name: "GCE O-Levels", icon_emoji: "" },
  { id: null, code: "NECO", name: "NECO", icon_emoji: "" },
  { id: null, code: "IELTS", name: "IELTS", icon_emoji: "" },
  { id: null, code: "TOEFL", name: "TOEFL", icon_emoji: "" },
  { id: null, code: "SAT", name: "SAT", icon_emoji: "" },
  { id: null, code: "GCE_AL", name: "GCE A-Levels", icon_emoji: "" },
  { id: null, code: "JUPEB", name: "JUPEB", icon_emoji: "" },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const getBaseUrl = () =>
  (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

// ─────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  return (
    <div
      className={`fixed bottom-6 right-4 z-50 px-4 py-3 rounded-xl text-white text-sm shadow-lg ${
        type === "error" ? "bg-red-600" : "bg-gray-900"
      }`}
    >
      {msg}
      <button onClick={onClose} className="ml-3">
        <X size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dialog
// ─────────────────────────────────────────────────────────────
function AddAssignmentDialog({ teachers, onClose, onSaved }) {
  const [examTypes, setExamTypes] = useState(FALLBACK_EXAM_TYPES);
  const [subjects, setSubjects] = useState([]);

  const [teacherId, setTeacherId] = useState("");
  const [examTypeCode, setExamTypeCode] = useState("");
  const [examTypeId, setExamTypeId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load exam types
  useEffect(() => {
    fetch(`${getBaseUrl()}/api/exam-boards`)
      .then((r) => r.json())
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        if (list.length) setExamTypes(list);
      })
      .catch(() => {});
  }, []);

  // Load subjects when exam changes
  useEffect(() => {
    setSubjects([]);
    setSubjectId("");

    if (!examTypeCode) return;

    const found = examTypes.find((e) => e.code === examTypeCode);
    setExamTypeId(found?.id || "");

    setLoadingSubjects(true);

    fetch(`${getBaseUrl()}/api/exam-boards/${examTypeCode}/subjects`)
      .then((r) => r.json())
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        setSubjects(list);
      })
      .catch(() => setSubjects([]))
      .finally(() => setLoadingSubjects(false));
  }, [examTypeCode]);

  const handleSave = async () => {
    if (!teacherId || !examTypeCode || !subjectId) {
      setError("All fields are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await api.post("/admin/teacher-subjects", {
        teacher_id: teacherId,
        subject_id: subjectId,
        exam_board_id: examTypeId || null,
      });

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save assignment"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl p-6">
        <h2 className="font-semibold mb-4">Assign Subject</h2>

        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className="w-full border p-2 rounded mb-2"
        >
          <option value="">Select Teacher</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.first_name} {t.last_name}
            </option>
          ))}
        </select>

        <select
          value={examTypeCode}
          onChange={(e) => setExamTypeCode(e.target.value)}
          className="w-full border p-2 rounded mb-2"
        >
          <option value="">Select Exam Type</option>
          {examTypes.map((e) => (
            <option key={e.code} value={e.code}>
              {e.name}
            </option>
          ))}
        </select>

        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="w-full border p-2 rounded mb-2"
          disabled={!examTypeCode}
        >
          <option value="">Select Subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {error && <p className="text-red-600 text-xs">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 border p-2 rounded">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-teal-500 text-white p-2 rounded"
          >
            {saving ? "Saving..." : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function TeacherAssignmentPage() {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);

    Promise.all([
      api.get("/admin/teacher-subjects").catch(() => ({ data: [] })),
      api.get("/admin/users?role=teacher").catch(() => ({ data: [] })),
    ])
      .then(([a, t]) => {
        setAssignments(a?.data || []);
        setTeachers(t?.data || []);
      })
      .finally(() => setLoading(false));
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

      <div className="p-6">
        <button
          onClick={() => setShowDialog(true)}
          className="bg-teal-500 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <Plus size={14} />
          Add Assignment
        </button>

        <div className="mt-4 space-y-2">
          {assignments.map((a) => (
            <div
              key={a.id}
              className="bg-white p-3 rounded flex justify-between"
            >
              <div>
                <p className="font-medium">{a.teacher_name}</p>
                <p className="text-xs text-gray-500">{a.subject_name}</p>
              </div>

              <button onClick={() => remove(a.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {showDialog && (
        <AddAssignmentDialog
          teachers={teachers}
          onClose={() => setShowDialog(false)}
          onSaved={load}
        />
      )}

      {toast && (
        <Toast
          msg={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
