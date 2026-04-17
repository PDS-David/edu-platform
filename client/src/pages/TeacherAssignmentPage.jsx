import { useState, useEffect } from "react";
import api from "../services/apiClient";
import { Plus, Trash2, X } from "lucide-react";
import TopNav from "../components/TopNav";

const FALLBACK_EXAM_TYPES = [
  { id: null, code: "JAMB", name: "JAMB / UTME" },
  { id: null, code: "WAEC", name: "WAEC" },
  { id: null, code: "NECO", name: "NECO" },
  { id: null, code: "SAT", name: "SAT" },
];

function Toast({ msg, type, onClose }) {
  return (
    <div className={`fixed bottom-4 right-4 p-3 text-white rounded ${type === "error" ? "bg-red-600" : "bg-black"}`}>
      {msg}
      <button onClick={onClose} className="ml-2">
        <X size={14} />
      </button>
    </div>
  );
}

function AddAssignmentDialog({ teachers, onClose, onSaved }) {
  const [examTypes, setExamTypes] = useState(FALLBACK_EXAM_TYPES);
  const [subjects, setSubjects] = useState([]);

  const [teacherId, setTeacherId] = useState("");
  const [examCode, setExamCode] = useState("");
  const [subjectId, setSubjectId] = useState("");

  useEffect(() => {
    api.get("/exam-boards")
      .then(res => setExamTypes(res?.data || FALLBACK_EXAM_TYPES))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!examCode) return;

    setSubjects([]);
    setSubjectId("");

    api.get(`/exam-boards/${examCode}/subjects`)
      .then(res => setSubjects(res?.data || []))
      .catch(() => setSubjects([]));
  }, [examCode]);

  const save = async () => {
    await api.post("/admin/teacher-subjects", {
      teacher_id: teacherId,
      subject_id: subjectId,
      exam_board_code: examCode,
    });

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-4 rounded w-96">
        <h2 className="font-bold mb-3">Assign Subject</h2>

        <select onChange={(e) => setTeacherId(e.target.value)}>
          <option>Select Teacher</option>
          {teachers.map(t => (
            <option key={t.id} value={t.id}>
              {t.first_name} {t.last_name}
            </option>
          ))}
        </select>

        <select onChange={(e) => setExamCode(e.target.value)}>
          <option>Select Exam</option>
          {examTypes.map(e => (
            <option key={e.code} value={e.code}>
              {e.name}
            </option>
          ))}
        </select>

        <select onChange={(e) => setSubjectId(e.target.value)}>
          <option>Select Subject</option>
          {subjects.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button onClick={save} className="bg-blue-600 text-white px-3 py-2 mt-3">
          Save
        </button>
      </div>
    </div>
  );
}

export default function TeacherAssignmentPage() {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [show, setShow] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => {
    Promise.all([
      api.get("/admin/teacher-subjects"),
      api.get("/admin/users?role=teacher"),
    ])
      .then(([a, t]) => {
        setAssignments(a?.data || []);
        setTeachers(t?.data || []);
      });
  };

  useEffect(load, []);

  const remove = async (id) => {
    try {
      await api.delete(`/admin/teacher-subjects/${id}`);
      setAssignments(p => p.filter(x => x.id !== id));
    } catch {
      setToast({ msg: "Delete failed", type: "error" });
    }
  };

  return (
    <div className="p-4">
      <TopNav />

      <button onClick={() => setShow(true)} className="bg-green-600 text-white px-3 py-2">
        <Plus size={14} /> Add
      </button>

      {assignments.map(a => (
        <div key={a.id} className="flex justify-between p-2 bg-white mt-2">
          <div>
            <p>{a.teacher_name}</p>
            <p className="text-sm">{a.subject_name}</p>
          </div>
          <button onClick={() => remove(a.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {show && (
        <AddAssignmentDialog
          teachers={teachers}
          onClose={() => setShow(false)}
          onSaved={load}
        />
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
