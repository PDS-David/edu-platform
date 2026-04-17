import { useState, useEffect } from 'react';
import { useNavigate, Link, Outlet } from 'react-router-dom';
import api from '../services/apiClient';
import {
  Users, Plus, Copy, CheckCircle, Loader2, AlertTriangle,
  BarChart2, Zap, X, ChevronRight, Send, PenTool,
  BookOpen, Upload, AlertCircle,
} from 'lucide-react';
import TopNav from '../components/TopNav';
import { useAuth } from '../context/AuthContext';

/* ================= HELPERS ================= */

const accColor = (pct) => {
  if (!pct && pct !== 0) return 'text-gray-400';
  if (pct >= 70) return 'text-green-600';
  if (pct >= 40) return 'text-amber-600';
  return 'text-red-500';
};

function getDisplayName(user) {
  if (!user) return 'Teacher';
  const first = user.firstName || user.first_name;
  if (first && first.trim()) return first.trim();
  const full = user.lastName || user.last_name || user.name || '';
  if (full.trim()) return full.trim().split(' ')[0];
  if (user.email) return user.email.split('@')[0];
  return 'Teacher';
}

function Toast({ msg, type, onClose }) {
  return (
    <div className={`fixed bottom-6 right-4 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white
      ${type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
      {type === 'success'
        ? <CheckCircle size={14} className="text-teal-400" />
        : <AlertTriangle size={14} />}
      {msg}
      <button onClick={onClose}>
        <X size={13} className="opacity-60" />
      </button>
    </div>
  );
}

/* ================= CLASSES TAB ================= */

function ClassesTab({ onViewAnalytics }) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/teacher/classes')
      .then(r => setClasses(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createClass = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/teacher/classes', { name: newName });
      setNewName('');
      setShowCreate(false);
      setToast({ type: 'success', msg: 'Class created!' });
      load();
    } catch {
      setToast({ type: 'error', msg: 'Failed to create class.' });
    } finally {
      setCreating(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="text-teal-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {classes.length} class{classes.length !== 1 ? 'es' : ''}
        </p>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl"
        >
          <Plus size={14} /> New Class
        </button>
      </div>

      {showCreate && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex gap-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Class name"
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />

          <button onClick={createClass} disabled={creating}>
            {creating ? <Loader2 size={14} /> : 'Create'}
          </button>

          <button onClick={() => setShowCreate(false)}>
            <X size={16} />
          </button>
        </div>
      )}

      {classes.map(cls => (
        <div key={cls.id} className="bg-white rounded-2xl border p-5">
          <p className="font-semibold">{cls.name}</p>

          <button onClick={() => onViewAnalytics(cls)}>
            View Analytics
          </button>

          <button onClick={() => copyCode(cls.join_code)}>
            {copied === cls.join_code ? 'Copied!' : 'Copy Code'}
          </button>
        </div>
      ))}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ================= MAIN DASHBOARD ================= */

export default function TeacherDashboard() {

  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('classes');
  const [selectedClass, setSelectedClass] = useState(null);

  const [assignedSubjects, setAssignedSubjects] = useState(null);

  useEffect(() => {
    api.get('/teacher/my-subjects')
      .then(r => setAssignedSubjects(r.data ?? []))
      .catch(() => setAssignedSubjects([]));
  }, []);

  const subjectsLoading = assignedSubjects === null;
  const hasSubjects = assignedSubjects?.length > 0;

  const displayName = getDisplayName(user);

  const tabs = [
    { id: 'classes', label: 'My Classes', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'testbuilder', label: 'Test Builder', icon: PenTool },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      <TopNav />

      {/* HEADER */}
      <div className="bg-[#0a4a3f] px-4 py-5">
        <div className="max-w-4xl mx-auto flex justify-between">
          <div>
            <p className="text-white/50 text-xs">Teacher Dashboard</p>
            <h1 className="text-white text-xl font-bold">
              Welcome back, {displayName} 👋
            </h1>
          </div>

          {hasSubjects && (
            <Link to="/teacher/resources" className="bg-teal-500 text-white px-4 py-2 rounded-xl">
              Upload Resources
            </Link>
          )}
        </div>
      </div>

      {/* SUBJECT BANNER */}
      {!subjectsLoading && (
        <div className="px-4 py-3 border-b">
          {hasSubjects ? (
            <p className="text-sm text-teal-700">
              Subjects assigned: {assignedSubjects.map(s => s.name).join(', ')}
            </p>
          ) : (
            <p className="text-sm text-amber-700">
              Awaiting subject assignment
            </p>
          )}
        </div>
      )}

      {/* TABS */}
      <div className="bg-white border-b sticky top-14">
        <div className="max-w-4xl mx-auto flex gap-2 px-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-sm ${
                activeTab === t.id ? 'text-teal-600' : 'text-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* ✅ NEW: ROUTER OUTLET */}
        <Outlet />

        {/* ✅ FALLBACK: EXISTING UI */}
        {!window.location.pathname.startsWith('/teacher/') && (
          <>
            {activeTab === 'classes' && (
              <ClassesTab onViewAnalytics={setSelectedClass} />
            )}
          </>
        )}

      </div>
    </div>
  );
}
