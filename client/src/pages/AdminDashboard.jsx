import { useState, useEffect, Component } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import {
  Users, School, BookOpen, Settings, LogOut,
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Loader2, X, Check, AlertTriangle, RefreshCw, GraduationCap,
  UserCheck, ChevronUp, Sparkles, Zap, Upload
} from 'lucide-react';
import branding from '../config/branding';
import TopNav from '../components/TopNav';
import { useCatalog } from '../hooks/useCatalog';
import AdminBulkUploadPanel from '../components/AdminBulkUploadPanel';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ─── Panel Error Boundary ─────────────────────────────────────────────────────
class PanelErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, message: '' }; }
  static getDerivedStateFromError(err) { return { hasError: true, message: err?.message || 'Unknown error' }; }
  componentDidCatch(err, info) { console.error('[PanelErrorBoundary]', err, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-sm font-semibold text-gray-800">Something went wrong in this panel</p>
          <p className="text-xs text-gray-400 mt-1 mb-4 max-w-xs">{this.state.message}</p>
          <button onClick={() => this.setState({ hasError: false, message: '' })}
            className="text-sm text-violet-600 hover:underline">Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const safeEmoji = (raw) => {
  if (!raw) return '';
  const s = String(raw).trim();
  if (s === '?' || s === '\uFFFD') return '';
  return s;
};

// ─── Reusable Modal ───────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
    <div className="bg-white border border-gray-100 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ message, type, onClose }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border
    ${type === 'success' ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white border-red-200 text-red-600'}`}>
    {type === 'success' ? <Check size={15} className="text-emerald-500" /> : <AlertTriangle size={15} className="text-red-500" />}
    {message}
    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1"><X size={13} /></button>
  </div>
);

// ─── Input style helper ───────────────────────────────────────────────────────
const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300';

// ─── Catalog Management Panel ─────────────────────────────────────────────────
const CatalogPanel = () => {
  const { invalidateCache: bustSubjectCache } = useCatalog();
  const [types, setTypes]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [expandedType, setExpandedType] = useState(null);
  const [typeSubjects, setTypeSubjects] = useState({});
  const [loadingSubjects, setLoadingSubjects] = useState({});
  const [showTypeModal, setShowTypeModal]       = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [editingType, setEditingType]           = useState(null);
  const [editingSubject, setEditingSubject]     = useState(null);
  const [activeTypeId, setActiveTypeId]         = useState(null);
  const [toast, setToast]                       = useState(null);
  const [saving, setSaving]                     = useState(false);
  const [typeForm, setTypeForm] = useState({ code: '', name: '', full_name: '', description: '', country: 'Nigeria', icon_emoji: '', display_order: '' });
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '', description: '', icon_emoji: '', color: '#7c3aed', category: 'General', level: '' });

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  const fetchTypes = async () => {
    setLoading(true);
    try { const res = await api.get('/catalog/types'); if (res?.success) setTypes(res.data || []); }
    catch (err) { showToast(err?.status === 401 ? 'Session expired — please log back in' : 'Failed to load examination types', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchTypes(); }, []);

  const fetchSubjects = async (typeId) => {
    setLoadingSubjects(prev => ({ ...prev, [typeId]: true }));
    try { const res = await api.get(`/catalog/types/${typeId}/subjects`); if (res?.success) setTypeSubjects(prev => ({ ...prev, [typeId]: res.data || [] })); }
    catch { showToast('Failed to load subjects', 'error'); }
    finally { setLoadingSubjects(prev => ({ ...prev, [typeId]: false })); }
  };

  const toggleExpand = (typeId) => {
    if (expandedType === typeId) { setExpandedType(null); } else {
      setExpandedType(typeId);
      if (!typeSubjects[typeId]) fetchSubjects(typeId);
    }
  };

  const openAddType    = () => { setEditingType(null); setTypeForm({ code: '', name: '', full_name: '', description: '', country: 'Nigeria', icon_emoji: '', display_order: '' }); setShowTypeModal(true); };
  const openEditType   = (type) => { setEditingType(type); setTypeForm({ code: type.code, name: type.name, full_name: type.full_name || '', description: type.description || '', country: type.country || 'Nigeria', icon_emoji: type.icon_emoji || '', display_order: type.display_order || '' }); setShowTypeModal(true); };
  const openAddSubject = (typeId) => { setEditingSubject(null); setActiveTypeId(typeId); setSubjectForm({ name: '', code: '', description: '', icon_emoji: '', color: '#7c3aed', category: 'General', level: '' }); setShowSubjectModal(true); };
  const openEditSubject= (subject, typeId) => { setEditingSubject(subject); setActiveTypeId(typeId); setSubjectForm({ name: subject.name || '', code: subject.code || '', description: subject.description || '', icon_emoji: subject.icon_emoji || '', color: subject.color || '#7c3aed', category: subject.category || 'General', level: subject.level || '' }); setShowSubjectModal(true); };

  const saveType = async () => {
    if (!typeForm.code || !typeForm.name) { showToast('Code and Name are required', 'error'); return; }
    setSaving(true);
    try {
      if (editingType) { await api.put(`/catalog/types/${editingType.id}`, typeForm); showToast('Examination type updated'); }
      else { await api.post('/catalog/types', typeForm); showToast('Examination type created'); }
      setShowTypeModal(false); fetchTypes();
    } catch (err) { showToast(err?.error || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const saveSubject = async () => {
    if (!subjectForm.name || !subjectForm.code) { showToast('Name and Code are required', 'error'); return; }
    setSaving(true);
    try {
      if (editingSubject) { await api.put(`/catalog/subjects/${editingSubject.id}`, subjectForm); showToast('Subject updated'); }
      else { await api.post(`/catalog/types/${activeTypeId}/subjects`, subjectForm); showToast('Subject added'); }
      setShowSubjectModal(false); fetchSubjects(activeTypeId); fetchTypes(); bustSubjectCache(activeTypeId);
    } catch (err) { showToast(err?.error || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;
    try {
      if (showDeleteConfirm.kind === 'type') { await api.delete(`/catalog/types/${showDeleteConfirm.id}`); showToast('Examination type deactivated'); fetchTypes(); }
      else { await api.delete(`/catalog/subjects/${showDeleteConfirm.id}`); showToast('Subject deactivated'); fetchSubjects(activeTypeId); fetchTypes(); bustSubjectCache(activeTypeId); }
    } catch (err) { showToast(err?.error || 'Failed to deactivate', 'error'); }
    finally { setShowDeleteConfirm(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-violet-500 animate-spin mr-3" /><span className="text-gray-500">Loading catalog...</span></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Catalog Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">{types.length} examination type{types.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchTypes} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl"><RefreshCw size={14} /> Refresh</button>
          <button onClick={openAddType} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-sm"><Plus size={16} /> Add Type</button>
        </div>
      </div>

      <div className="space-y-2">
        {types.map((type) => (
          <div key={type.id} className={`border-2 rounded-2xl overflow-hidden transition-all ${type.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
            <div className="flex items-center gap-3 px-4 py-3 bg-white">
              <button onClick={() => toggleExpand(type.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                {expandedType === type.id ? <ChevronDown size={18} className="text-gray-400 shrink-0" /> : <ChevronRight size={18} className="text-gray-400 shrink-0" />}
                <span className="text-2xl leading-none">{type.icon_emoji || ''}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{type.name}</span>
                    <span className="text-xs font-mono bg-violet-50 text-violet-600 px-2 py-0.5 rounded">{type.code}</span>
                    {!type.is_active && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">Inactive</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{type.full_name}</p>
                </div>
              </button>
              <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{type.subject_count} subject{type.subject_count !== 1 ? 's' : ''}</span>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openAddSubject(type.id)} className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 border border-violet-200 hover:border-violet-400 px-2.5 py-1.5 rounded-lg font-semibold"><Plus size={12} /> Subject</button>
                <button onClick={() => openEditType(type)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={15} /></button>
                <button onClick={() => setShowDeleteConfirm({ kind: 'type', id: type.id, name: type.name })} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={15} /></button>
              </div>
            </div>
            {expandedType === type.id && (
              <div className="bg-gray-50 border-t border-gray-100 px-4 pb-4 pt-3">
                {loadingSubjects[type.id] ? <div className="flex items-center gap-2 py-4 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Loading subjects...</div>
                  : (typeSubjects[type.id] || []).length === 0 ? <div className="text-center py-6"><p className="text-gray-400 text-sm mb-3">No subjects yet.</p><button onClick={() => openAddSubject(type.id)} className="inline-flex items-center gap-1.5 text-sm text-violet-600 font-semibold"><Plus size={14} /> Add first subject</button></div>
                  : (
                    <div className="space-y-2">
                      {(typeSubjects[type.id] || []).map((subject) => (
                        <div key={subject.id} className={`flex items-center gap-3 bg-white rounded-xl px-4 py-3 border ${subject.is_active ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0" style={{ backgroundColor: (subject.color || '#7c3aed') + '20' }}>
                            {subject.icon_emoji || ''}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{subject.name}</span>
                              <span className="text-xs font-mono bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">{subject.code}</span>
                              {!subject.is_active && <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full">Inactive</span>}
                            </div>
                            {subject.category && <span className="text-xs text-gray-400">{subject.category}</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => { setActiveTypeId(type.id); openEditSubject(subject, type.id); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={14} /></button>
                            <button onClick={() => { setActiveTypeId(type.id); setShowDeleteConfirm({ kind: 'subject', id: subject.id, name: subject.name }); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
            )}
          </div>
        ))}
      </div>

      {showTypeModal && (
        <Modal title={editingType ? 'Edit Examination Type' : 'Add Examination Type'} onClose={() => setShowTypeModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Code *</label><input type="text" value={typeForm.code} onChange={(e) => setTypeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} disabled={!!editingType} placeholder="e.g. ALEVEL" className={inputCls + ' disabled:bg-gray-100'} /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Icon Emoji</label><input type="text" value={typeForm.icon_emoji} onChange={(e) => setTypeForm(f => ({ ...f, icon_emoji: e.target.value }))} className={inputCls} /></div>
            </div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label><input type="text" value={typeForm.name} onChange={(e) => setTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. A-Levels" className={inputCls} /></div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label><input type="text" value={typeForm.full_name} onChange={(e) => setTypeForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} /></div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-1">Description</label><textarea value={typeForm.description} onChange={(e) => setTypeForm(f => ({ ...f, description: e.target.value }))} rows={2} className={inputCls + ' resize-none'} /></div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowTypeModal(false)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={saveType} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {editingType ? 'Save Changes' : 'Create Type'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showSubjectModal && (
        <Modal title={editingSubject ? 'Edit Subject' : 'Add Subject'} onClose={() => setShowSubjectModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label><input type="text" value={subjectForm.name} onChange={(e) => setSubjectForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Code *</label><input type="text" value={subjectForm.code} onChange={(e) => setSubjectForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className={inputCls + ' font-mono'} /></div>
            </div>
            <div><label className="block text-sm font-semibold text-gray-700 mb-1">Description</label><textarea value={subjectForm.description} onChange={(e) => setSubjectForm(f => ({ ...f, description: e.target.value }))} rows={2} className={inputCls + ' resize-none'} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Emoji</label><input type="text" value={subjectForm.icon_emoji} onChange={(e) => setSubjectForm(f => ({ ...f, icon_emoji: e.target.value }))} className={inputCls} /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Color</label><div className="flex items-center gap-1.5"><input type="color" value={subjectForm.color} onChange={(e) => setSubjectForm(f => ({ ...f, color: e.target.value }))} className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5" /><input type="text" value={subjectForm.color} onChange={(e) => setSubjectForm(f => ({ ...f, color: e.target.value }))} className="flex-1 border border-gray-300 rounded-xl px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-300" /></div></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1">Level</label><input type="text" value={subjectForm.level} onChange={(e) => setSubjectForm(f => ({ ...f, level: e.target.value }))} placeholder="e.g. SS3" className={inputCls} /></div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowSubjectModal(false)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={saveSubject} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {editingSubject ? 'Save Changes' : 'Add Subject'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showDeleteConfirm && (
        <Modal title="Confirm Deactivation" onClose={() => setShowDeleteConfirm(null)}>
          <div className="text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-7 h-7 text-red-500" /></div>
            <p className="text-gray-700 mb-1">Deactivate <span className="font-bold">"{showDeleteConfirm.name}"</span>?</p>
            <p className="text-sm text-gray-400 mb-6">It will be hidden from students but not permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm">Yes, Deactivate</button>
            </div>
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ─── Teacher Assignment Panel ─────────────────────────────────────────────────
const TeacherAssignmentPanel = () => {
  const [assignments, setAssignments] = useState([]);
  const [teachers,    setTeachers]    = useState([]);
  const [filteredSubjects, setFilteredSubjects] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [toast,       setToast]       = useState(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);
  const [form, setForm] = useState({ teacher_id: '', exam_type_id: '' });
  const { examTypes, loadingTypes, fetchSubjectsForType, invalidateCache } = useCatalog();

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [aRes, tRes] = await Promise.all([api.get('/admin/teacher-assignments'), api.get('/users?role=teacher')]);
      if (aRes?.success) setAssignments(aRes.data || []);
      if (tRes?.data)    setTeachers(tRes.data    || []);
    } catch (err) { console.warn('[TeacherAssignment] load failed:', err?.error); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const handleExamTypeChange = async (typeId) => {
    setForm(f => ({ ...f, exam_type_id: typeId }));
    setSelectedSubjectIds([]); setFilteredSubjects([]);
    if (!typeId) return;
    setLoadingSubjects(true);
    try { const subjects = await fetchSubjectsForType(typeId); setFilteredSubjects(subjects); }
    catch { showToast('Failed to load subjects', 'error'); }
    finally { setLoadingSubjects(false); }
  };

  const refreshSubjects = async () => {
    if (!form.exam_type_id) return;
    invalidateCache(form.exam_type_id); setSelectedSubjectIds([]); setFilteredSubjects([]); setLoadingSubjects(true);
    try { const subjects = await fetchSubjectsForType(form.exam_type_id); setFilteredSubjects(subjects); }
    catch { showToast('Failed to refresh subjects', 'error'); }
    finally { setLoadingSubjects(false); }
  };

  const toggleSubject = (id) => setSelectedSubjectIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const handleSave = async () => {
    if (!form.teacher_id || !form.exam_type_id || selectedSubjectIds.length === 0) { showToast('Teacher, Exam Type and at least one Subject are required', 'error'); return; }
    setSaving(true);
    try {
      await Promise.all(selectedSubjectIds.map(subject_id => api.post('/admin/teacher-assignments', { teacher_id: form.teacher_id, subject_id, exam_board_id: form.exam_type_id })));
      showToast(`${selectedSubjectIds.length} assignment${selectedSubjectIds.length > 1 ? 's' : ''} saved`);
      setShowModal(false); setForm({ teacher_id: '', exam_type_id: '' }); setSelectedSubjectIds([]); setFilteredSubjects([]); fetchAll();
    } catch (err) { showToast(err?.error || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this assignment?')) return;
    try { await api.delete(`/admin/teacher-assignments/${id}`); showToast('Assignment removed'); fetchAll(); }
    catch { showToast('Failed to remove', 'error'); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-7 h-7 text-violet-500 animate-spin mr-3" /><span className="text-gray-500">Loading…</span></div>;

  return (
    <div>
      {toast && <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-violet-600'}`}>{toast.msg}</div>}
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-xl font-bold text-gray-900">Teacher Assignment</h2><p className="text-sm text-gray-500 mt-0.5">Assign teachers to subjects and exam types</p></div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl"><RefreshCw size={14} /> Refresh</button>
          <button onClick={() => { setForm({ teacher_id: '', exam_type_id: '' }); setSelectedSubjectIds([]); setFilteredSubjects([]); setShowModal(true); }} className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl font-semibold"><Plus size={14} /> Add Assignment</button>
        </div>
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">No assignments yet.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left"><th className="pb-3 font-semibold text-gray-600">Teacher</th><th className="pb-3 font-semibold text-gray-600">Email</th><th className="pb-3 font-semibold text-gray-600">Subject</th><th className="pb-3 font-semibold text-gray-600">Exam Type</th><th className="pb-3 font-semibold text-gray-600">Status</th><th className="pb-3 font-semibold text-gray-600">Actions</th></tr></thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 font-medium text-gray-800">{a.teacher_name}</td>
                  <td className="py-3 text-gray-500 text-xs">{a.email}</td>
                  <td className="py-3 text-gray-700">{a.subject_name}</td>
                  <td className="py-3 text-gray-500">{a.exam_board_code || '—'}</td>
                  <td className="py-3"><span className={`text-xs font-semibold px-2 py-1 rounded-full ${a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td className="py-3">{a.is_active && <button onClick={() => handleRemove(a.id)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"><Trash2 size={12} /> Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-bold text-gray-900">Add Assignment</h3><button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button></div>
            <div className="space-y-4">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Teacher *</label><select value={form.teacher_id} onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))} className={inputCls}><option value="">Select a teacher…</option>{[...new Map(teachers.map(t => [t.id, t])).values()].map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name} — {t.email}</option>)}</select></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1.5">Exam Type *</label><select value={form.exam_type_id} onChange={e => handleExamTypeChange(e.target.value)} className={inputCls}><option value="">Select an exam type…</option>{loadingTypes ? <option disabled>Loading…</option> : examTypes.filter(et => et.is_active !== false).map(et => <option key={et.id} value={et.id}>{safeEmoji(et.icon_emoji) ? safeEmoji(et.icon_emoji) + ' ' : ''}{et.name} ({et.code})</option>)}</select></div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-600">Subject(s) *{selectedSubjectIds.length > 0 && <span className="ml-2 text-violet-600 font-bold">{selectedSubjectIds.length} selected</span>}</label>
                  {form.exam_type_id && <button type="button" onClick={refreshSubjects} disabled={loadingSubjects} className="flex items-center gap-1 text-xs text-gray-400 hover:text-violet-600 disabled:opacity-40"><RefreshCw size={11} className={loadingSubjects ? 'animate-spin' : ''} /> Refresh</button>}
                </div>
                {!form.exam_type_id ? <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-gray-400 text-sm">Select an exam type first</div>
                  : loadingSubjects ? <div className="flex items-center gap-2 py-4 text-gray-400 text-sm"><Loader2 size={15} className="animate-spin" /> Loading subjects…</div>
                  : filteredSubjects.length === 0 ? <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-gray-400 text-sm">No subjects found. Add subjects in Catalog Management.</div>
                  : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 border border-gray-200 rounded-xl p-2">
                      {filteredSubjects.map(s => {
                        const selected = selectedSubjectIds.includes(s.id);
                        return (
                          <button key={s.id} type="button" onClick={() => toggleSubject(s.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-all ${selected ? 'border-violet-500 bg-violet-50' : 'border-transparent hover:border-violet-200 hover:bg-gray-50'}`}>
                            <span className="text-base">{s.icon_emoji || ''}</span>
                            <span className={`flex-1 text-sm font-medium ${selected ? 'text-violet-800' : 'text-gray-800'}`}>{s.name}</span>
                            {selected && <Check size={14} className="text-violet-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )
                }
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSave} disabled={saving || !form.teacher_id || !form.exam_type_id || selectedSubjectIds.length === 0}
                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save {selectedSubjectIds.length > 0 ? `${selectedSubjectIds.length} Assignment${selectedSubjectIds.length > 1 ? 's' : ''}` : 'Assignment'}</>}
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── AI Generate Panel ────────────────────────────────────────────────────────
const AIGeneratePanel = () => {
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoad, setSubjectsLoad] = useState(false);
  const [pendingCount, setPendingCount] = useState(null);
  const [form, setForm] = useState({ exam_type_id: '', subject_id: '', topic: '', exam_board: '', count: 10, difficulty: 'medium' });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [previewQuestions, setPreviewQuestions] = useState([]);
  const { examTypes, loadingTypes: examTypesLoad, fetchSubjectsForType } = useCatalog();
  const navigate = useNavigate();

  useEffect(() => { api.get('/admin/questions/pending-count').then(r => setPendingCount(r.count)).catch(() => {}); }, []);

  const handleExamTypeChange = async (typeId) => {
    const chosen = examTypes.find(et => String(et.id) === String(typeId));
    setForm(f => ({ ...f, exam_type_id: typeId, subject_id: '', exam_board: chosen?.code || '' }));
    setSubjects([]);
    if (!typeId) return;
    setSubjectsLoad(true);
    try { const raw = await fetchSubjectsForType(typeId); setSubjects([...new Map(raw.map(s => [s.id, s])).values()]); }
    catch { setError('Failed to load subjects.'); }
    finally { setSubjectsLoad(false); }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.exam_type_id) { setError('Please select an exam type first.'); return; }
    if (!form.subject_id)   { setError('Please select a subject.'); return; }
    if (!form.topic.trim()) { setError('Please enter a topic.'); return; }
    setError(''); setResult(null); setPreviewQuestions([]); setGenerating(true);
    try {
      const res = await api.post('/admin/generate-questions', { subject_id: form.subject_id, topic: form.topic, exam_board: form.exam_board, count: form.count, difficulty: form.difficulty });
      setResult(res);
      const qs = res?.data?.questions ?? res?.questions ?? [];
      if (Array.isArray(qs)) setPreviewQuestions(qs);
      const inserted = res?.data?.inserted ?? res?.inserted ?? 0;
      setPendingCount(c => (c || 0) + inserted);
    } catch (err) { setError(err?.message || err?.error || 'Generation failed.'); }
    finally { setGenerating(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-violet-500" /><h3 className="font-bold text-gray-900">AI Question Generator</h3></div>
        {pendingCount !== null && <a href="/admin/questions/review" className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full hover:bg-amber-200"><Zap size={12} />{pendingCount} pending review</a>}
      </div>
      <form onSubmit={handleGenerate} className="space-y-4 max-w-lg">
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Exam Type *</label><select value={form.exam_type_id} onChange={e => handleExamTypeChange(e.target.value)} className={inputCls} required><option value="">Select exam type first…</option>{examTypesLoad ? <option disabled>Loading…</option> : examTypes.filter(et => et.is_active !== false).map(et => <option key={et.id} value={et.id}>{safeEmoji(et.icon_emoji) ? safeEmoji(et.icon_emoji) + ' ' : ''}{et.name} ({et.code})</option>)}</select></div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Subject *</label>{!form.exam_type_id ? <div className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">Select an exam type above</div> : <select value={form.subject_id} onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))} className={inputCls} required><option value="">Select subject…</option>{subjectsLoad ? <option disabled>Loading subjects…</option> : subjects.length === 0 ? <option disabled>No subjects found</option> : subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Topic *</label><input type="text" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="e.g. Cell Biology, Algebra" className={inputCls} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Difficulty</label><select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))} className={inputCls}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Count</label><select value={form.count} onChange={e => setForm(f => ({ ...f, count: Number(e.target.value) }))} className={inputCls}><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option></select></div>
        </div>
        {error && <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm"><AlertTriangle size={14} /> {error}</div>}
        {result && <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm"><Check size={14} /> {result.message || 'Questions generated successfully!'}</div>}
        <button type="submit" disabled={generating} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">
          {generating ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate Questions</>}
        </button>
      </form>
      {previewQuestions.length > 0 && (
        <div className="mt-6 max-w-lg">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Generated Preview ({previewQuestions.length})<span className="ml-2 text-[10px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Pending Review</span></p>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {previewQuestions.map((q, i) => <div key={q.id || i} className="bg-gray-50 border border-gray-200 rounded-xl p-4"><p className="text-sm font-medium text-gray-800 leading-relaxed">{i + 1}. {q.question_text}</p></div>)}
          </div>
          <p className="text-xs text-gray-400 mt-3">Go to <button onClick={() => navigate('/admin/questions/review')} className="text-violet-600 hover:underline font-semibold">Question Review</button> to approve.</p>
        </div>
      )}
    </div>
  );
};

// ─── User Management Panel ────────────────────────────────────────────────────
const UserManagementPanel = () => {
  const [userStats,  setUserStats]  = useState(null);
  const [users,      setUsers]      = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState(null);
  const LIMIT = 20;

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => { api.get('/users/stats').then(r => { if (r.success) setUserStats(r.data); }).catch(() => {}); }, []);
  useEffect(() => { const timer = setTimeout(() => fetchUsers(), 300); return () => clearTimeout(timer); }, [search, roleFilter, page]);

  const fetchUsers = async () => {
    setLoading(true);
    try { const r = await api.get('/users', { params: { search, role: roleFilter, page, limit: LIMIT } }); setUsers(r.data || []); setTotal(r.total || 0); }
    catch { setUsers([]); }
    finally { setLoading(false); }
  };

  const changeRole    = async (userId, role)           => { try { await api.put(`/users/${userId}/role`, { role }); showToast(`Role updated to ${role}`); fetchUsers(); } catch { showToast('Failed to update role', 'error'); } };
  const toggleActive  = async (userId, currentActive)  => { try { await api.put(`/users/${userId}/deactivate`, { is_active: !currentActive }); showToast(!currentActive ? 'User activated' : 'User deactivated'); fetchUsers(); } catch { showToast('Failed to update user status', 'error'); } };
  const deleteUser    = async (userId, email)          => {
    if (!window.confirm(`Delete "${email}"? Cannot be undone.`)) return;
    try { await api.delete(`/users/${userId}`); showToast(`User ${email} deleted`); fetchUsers(); } catch (err) { showToast(err?.error || 'Failed to delete', 'error'); }
  };

  const roleBadge = (role) => ({ student: 'bg-blue-100 text-blue-700', teacher: 'bg-violet-100 text-violet-700', admin: 'bg-red-100 text-red-700' }[role] || 'bg-gray-100 text-gray-600');
  const fmtDate   = (d)    => d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—';
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-xl font-bold text-gray-900">User Management</h2><p className="text-sm text-gray-400 mt-0.5">{total} users total</p></div>
        <button onClick={fetchUsers} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl"><RefreshCw size={14} /> Refresh</button>
      </div>
      {userStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[{ label: 'Total', value: userStats.total, color: 'text-gray-900' }, { label: 'Students', value: userStats.students, color: 'text-blue-600' }, { label: 'Teachers', value: userStats.teachers, color: 'text-violet-600' }, { label: 'Active Subs', value: userStats.active_subscriptions, color: 'text-emerald-600' }].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center"><p className={`text-2xl font-bold ${s.color}`}>{s.value}</p><p className="text-xs text-gray-400 mt-0.5">{s.label}</p></div>
          ))}
        </div>
      )}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <input type="text" placeholder="Search by name or email…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>}
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"><option value="">All Roles</option><option value="student">Students</option><option value="teacher">Teachers</option><option value="admin">Admins</option></select>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
        : users.length === 0 ? <div className="text-center py-12 text-gray-400 text-sm">No users found.</div>
        : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-400 font-medium"><tr><th className="text-left px-4 py-3">Name / Email</th><th className="text-left px-4 py-3">Role</th><th className="text-left px-4 py-3">Subscription</th><th className="text-left px-4 py-3 hidden sm:table-cell">Last Login</th><th className="text-left px-4 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className={`bg-white hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3"><p className="font-semibold text-gray-800">{u.first_name} {u.last_name}</p><p className="text-xs text-gray-400">{u.email}</p></td>
                    <td className="px-4 py-3"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleBadge(u.role)}`}>{u.role}</span></td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{u.subscription_status || 'free'}</span></td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-400 text-xs">{fmtDate(u.last_login)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select value={u.role} onChange={e => changeRole(u.id, e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"><option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Admin</option></select>
                        <button onClick={() => toggleActive(u.id, u.is_active)} className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${u.is_active ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => deleteUser(u.id, u.email)} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-400">Page {page} of {totalPages} · {total} users</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-sm px-3 py-1.5 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50">← Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="text-sm px-3 py-1.5 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Platform Analytics Panel ─────────────────────────────────────────────────
const PlatformAnalyticsPanel = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [notifModal, setNotifModal] = useState(false);
  const [notifTarget, setNotifTarget] = useState('all');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifSending, setNotifSending] = useState(false);

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  const sendNotification = async () => {
    if (!notifTitle.trim() || !notifMessage.trim()) { showToast('Title and message are required', 'error'); return; }
    setNotifSending(true);
    try { const res = await api.post('/admin/send-notification', { target: notifTarget, title: notifTitle.trim(), message: notifMessage.trim() }); showToast(`Notification sent to ${res.sent ?? 0} user(s)`); setNotifModal(false); setNotifTitle(''); setNotifMessage(''); setNotifTarget('all'); }
    catch (err) { showToast(err?.error || 'Failed to send notification', 'error'); }
    finally { setNotifSending(false); }
  };

  const fetchStats = async () => {
    setLoading(true); setError(null);
    try { const res = await api.get('/admin/platform-stats'); if (res?.success) setStats(res.data || null); }
    catch (err) { setError(err?.error || 'Failed to load analytics'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchStats(); }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-violet-500 animate-spin mr-3" /><span className="text-gray-500">Loading analytics…</span></div>;
  if (error)   return <div className="text-center py-12 text-red-500"><AlertTriangle className="w-8 h-8 mx-auto mb-2" /><p className="text-sm">{error}</p><button onClick={fetchStats} className="mt-3 text-sm text-violet-600 hover:underline">Retry</button></div>;
  if (!stats)  return null;

  const { users = {}, questions = {}, revenue = {}, top_subjects = [], daily_activity = [] } = stats;
  const SUBJECT_COLORS = ['#7c3aed','#6366f1','#f59e0b','#ec4899','#10b981'];

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-gray-900">Platform Analytics</h2><p className="text-sm text-gray-500 mt-0.5">Live snapshot of platform activity</p></div>
        <button onClick={fetchStats} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl"><RefreshCw size={14} /> Refresh</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Students',      value: users.students           ?? '—', color: 'bg-blue-50 border-blue-200 text-blue-700'       },
          { label: 'Answered Today',       value: questions.answered_today ?? '—', color: 'bg-violet-50 border-violet-200 text-violet-700' },
          { label: 'Active Subscriptions', value: revenue.total_active_subs ?? '—', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { label: 'Pending Questions',    value: questions.total_pending  ?? '—', color: 'bg-amber-50 border-amber-200 text-amber-700'   },
        ].map((c, i) => <div key={i} className={`border rounded-2xl p-4 ${c.color.split(' ').slice(0,2).join(' ')}`}><p className="text-xs text-gray-500 mb-1">{c.label}</p><p className={`text-3xl font-black ${c.color.split(' ')[2]}`}>{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</p></div>)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Daily Activity (Last 14 Days)</p>
          {daily_activity.length === 0 ? <p className="text-xs text-gray-400 text-center py-8">No activity data yet</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={daily_activity} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} width={30} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Line type="monotone" dataKey="attempt_count" stroke="#7c3aed" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Top Subjects — Avg Accuracy (%)</p>
          {top_subjects.length === 0 ? <p className="text-xs text-gray-400 text-center py-8">No subject data yet</p> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={top_subjects} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="avg_accuracy" radius={[4, 4, 0, 0]}>{top_subjects.map((_, i) => <Cell key={i} fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setNotifModal(true)} className="flex items-center gap-2 text-sm bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2 rounded-xl"><Zap size={14} /> Send Notification</button>
          <button onClick={() => navigate('/admin/questions/review')} className="flex items-center gap-2 text-sm border border-amber-300 text-amber-700 hover:bg-amber-50 font-semibold px-4 py-2 rounded-xl"><AlertTriangle size={14} /> View Pending ({questions.total_pending ?? 0})</button>
        </div>
      </div>
      {notifModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Send Notification</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Send To</label><select value={notifTarget} onChange={e => setNotifTarget(e.target.value)} className={inputCls}><option value="all">All Users</option><option value="students">Students Only</option><option value="teachers">Teachers Only</option></select></div>
              <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Title</label><input type="text" value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="Notification title…" className={inputCls} /></div>
              <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Message</label><textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} rows={4} className={inputCls + ' resize-none'} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setNotifModal(false); setNotifTitle(''); setNotifMessage(''); }} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={sendNotification} disabled={notifSending} className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60">{notifSending ? 'Sending…' : 'Send'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Past Papers Panel (Admin) ────────────────────────────────────────────────
const AdminPastPapersPanel = () => {
  const navigate = useNavigate();
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({ exam_board: '', year_from: '', year_to: '' });
  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  const fetchPapers = async () => {
    setLoading(true);
    try { const params = {}; if (filters.exam_board) params.exam_board = filters.exam_board; if (filters.year_from) params.year_from = filters.year_from; if (filters.year_to) params.year_to = filters.year_to; const r = await api.get('/past-papers', { params }); setPapers(r.data || []); }
    catch { }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchPapers(); }, []);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try { await api.delete(`/past-papers/${id}`); showToast('Paper deleted'); setPapers(p => p.filter(x => x.id !== id)); }
    catch (err) { showToast(err?.message || 'Failed to delete', 'error'); }
  };

  const fmtSize = (b) => !b ? '' : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-xl font-bold text-gray-900">Past Papers</h2><p className="text-sm text-gray-400 mt-0.5">Manage past exam papers for students</p></div>
        <div className="flex gap-2">
          <button onClick={fetchPapers} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl"><RefreshCw size={14} /> Refresh</button>
          <button onClick={() => navigate('/past-papers')} className="flex items-center gap-2 text-sm border border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold px-4 py-2 rounded-xl"><BookOpen size={14} /> Student View</button>
        </div>
      </div>
      <div className="flex gap-3 mb-5 flex-wrap">
        <select value={filters.exam_board} onChange={e => setFilters(f => ({ ...f, exam_board: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"><option value="">All Exam Types</option>{['JAMB','WAEC','NECO','GCE_OL','GCE_AL','IELTS','TOEFL','SAT','JUPEB'].map(c => <option key={c} value={c}>{c}</option>)}</select>
        <input type="number" placeholder="Year from" value={filters.year_from} onChange={e => setFilters(f => ({ ...f, year_from: e.target.value }))} className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <input type="number" placeholder="Year to" value={filters.year_to} onChange={e => setFilters(f => ({ ...f, year_to: e.target.value }))} className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <button onClick={fetchPapers} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl">Filter</button>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
        : papers.length === 0 ? <div className="text-center py-16 text-gray-400"><BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" /><p className="text-sm">No past papers found.</p></div>
        : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-400 font-medium"><tr><th className="text-left px-4 py-3">Title</th><th className="text-left px-4 py-3">Subject</th><th className="text-left px-4 py-3">Exam Type</th><th className="text-left px-4 py-3">Year</th><th className="text-left px-4 py-3">Size</th><th className="text-left px-4 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {papers.map(p => (
                  <tr key={p.id} className="bg-white hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-xs truncate">{p.title}</td>
                    <td className="px-4 py-3 text-gray-500">{p.subject_name || '—'}</td>
                    <td className="px-4 py-3"><span className="text-xs font-mono bg-violet-50 text-violet-600 px-2 py-0.5 rounded">{p.exam_board}</span></td>
                    <td className="px-4 py-3 text-gray-500">{p.year || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtSize(p.file_size_bytes)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.file_url && <a href={p.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:text-violet-800 font-semibold">View</a>}
                        <button onClick={() => handleDelete(p.id, p.title)} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
};

// ─── Admin Settings Panel ─────────────────────────────────────────────────────
const AdminSettingsPanel = ({ setActivePanel }) => {
  const navigate = useNavigate();
  const sections = [
    {
      title: 'Account & Access',
      items: [
        { label: 'User Management',     desc: 'Manage roles, deactivate or delete users',      action: () => setActivePanel('users')    },
        { label: 'Teacher Assignments', desc: 'Assign teachers to subjects and exam types',     action: () => setActivePanel('teachers') },
      ],
    },
    {
      title: 'Content',
      items: [
        { label: 'Catalog Management',  desc: 'Add or edit exam types and subjects',            action: () => setActivePanel('catalog')    },
        { label: 'Past Papers',         desc: 'Manage past exam papers for students',           action: () => setActivePanel('pastpapers') },
        { label: 'Question Review',     desc: 'Approve or reject AI-generated questions',       action: () => navigate('/admin/questions/review') },
      ],
    },
    {
      title: 'Platform Links',
      items: [
        { label: 'Student Dashboard',   desc: 'View the platform as a student would see it',   action: () => navigate('/student/dashboard') },
        { label: 'Past Papers (public)', desc: 'See the public past papers page',              action: () => navigate('/past-papers')       },
        { label: 'My Account Settings', desc: 'Update your admin profile and preferences',      action: () => navigate('/settings')          },
      ],
    },
  ];

  return (
    <div>
      <div className="mb-6"><h2 className="text-xl font-bold text-gray-900">Settings</h2><p className="text-sm text-gray-400 mt-0.5">Platform configuration and quick links</p></div>
      <div className="space-y-6">
        {sections.map(sec => (
          <div key={sec.title}>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{sec.title}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sec.items.map(item => (
                <button key={item.label} onClick={item.action} className="text-left border border-gray-200 rounded-xl p-4 hover:border-violet-300 hover:bg-violet-50 transition-colors group">
                  <p className="font-semibold text-gray-800 text-sm group-hover:text-violet-700">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── MAIN Admin Dashboard ─────────────────────────────────────────────────────
const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState(null);
  const [stats, setStats]             = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    api.get('/catalog/stats')
      .then(res => { if (res?.success) setStats(res.data || null); })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const statCards = [
    { label: 'Total Users',     value: stats?.total_users      ?? '—', icon: Users,         accent: '#7c3aed' },
    { label: 'Exam Types',      value: stats?.total_exam_types  ?? '—', icon: GraduationCap, accent: '#6366f1' },
    { label: 'Total Subjects',  value: stats?.total_subjects    ?? '—', icon: BookOpen,      accent: '#10b981' },
    { label: 'Active Students', value: stats?.active_students   ?? '—', icon: UserCheck,     accent: '#f59e0b' },
  ];

  const navItems = [
    { key: 'analytics',  icon: Zap,          label: 'Analytics'   },
    { key: 'users',      icon: Users,         label: 'Users'       },
    { key: 'schools',    icon: School,        label: 'Schools'     },
    { key: 'content',    icon: BookOpen,      label: 'Content'     },
    { key: 'catalog',    icon: GraduationCap, label: 'Catalog'     },
    { key: 'teachers',   icon: UserCheck,     label: 'Teachers'    },
    { key: 'aigenerate', icon: Sparkles,      label: 'AI Generate' },
    { key: 'bulkupload', icon: Upload,        label: 'Bulk Upload' },
    { key: 'pastpapers', icon: BookOpen,      label: 'Past Papers' },
    { key: 'settings',   icon: Settings,      label: 'Settings'    },
  ];

  const Panel = ({ children }) => (
    <div className="bg-white border border-gray-100 rounded-2xl mt-4 overflow-hidden shadow-sm">
      <div className="p-6">{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <TopNav />

      <div className="flex">
        {/* ── SIDEBAR ── */}
        <aside className="w-52 shrink-0 min-h-[calc(100vh-48px)] bg-white border-r border-gray-100 sticky top-12 self-start shadow-sm">
          <div className="px-3 py-5">
            <div className="px-3 py-2 mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Admin Console</span>
            </div>
            <nav className="space-y-0.5">
              {navItems.map(({ key, icon: Icon, label }) => {
                const active = activePanel === key;
                return (
                  <button key={key} onClick={() => setActivePanel(active ? null : key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                      active
                        ? 'bg-violet-600 text-white font-semibold shadow-sm shadow-violet-200'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}>
                    <Icon size={14} className={active ? 'text-white' : 'text-gray-400'} />
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="flex-1 min-w-0 px-6 py-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">Platform management console</p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {statCards.map((s, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-400 font-medium">{s.label}</span>
                  <s.icon size={14} style={{ color: s.accent }} className="opacity-80" />
                </div>
                <p className="text-2xl font-mono font-bold text-gray-900">
                  {statsLoading ? <Loader2 size={18} className="animate-spin text-gray-300" /> : s.value}
                </p>
              </div>
            ))}
          </div>

          {!activePanel && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
                <Settings size={22} className="text-violet-500" />
              </div>
              <p className="text-sm font-medium text-gray-600">Select a service from the left panel</p>
              <p className="text-xs text-gray-400 mt-1">Click any item in the sidebar to get started</p>
            </div>
          )}

          {activePanel === 'analytics'  && <Panel><PanelErrorBoundary><PlatformAnalyticsPanel /></PanelErrorBoundary></Panel>}
          {activePanel === 'users'      && <Panel><PanelErrorBoundary><UserManagementPanel /></PanelErrorBoundary></Panel>}
          {activePanel === 'schools'    && (
            <Panel>
              <div className="text-center py-16"><School className="w-10 h-10 mx-auto mb-3 text-gray-200" /><p className="text-sm font-medium text-gray-500">School management coming soon.</p></div>
            </Panel>
          )}
          {activePanel === 'content'    && (
            <Panel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Manage Subjects', desc: 'Add, edit or deactivate exam types and subjects', action: () => setActivePanel('catalog') },
                  { label: 'Past Papers',     desc: 'View and manage past exam papers',               action: () => setActivePanel('pastpapers') },
                  { label: 'Question Review', desc: 'Review and approve submitted questions',          action: () => navigate('/admin/questions/review') },
                ].map(c => (
                  <button key={c.label} onClick={c.action} className="p-4 border border-gray-100 hover:border-violet-200 hover:bg-violet-50 rounded-xl text-left transition-colors group">
                    <p className="font-semibold text-gray-800 text-sm group-hover:text-violet-700">{c.label}</p>
                    <p className="text-xs text-gray-400 mt-1">{c.desc}</p>
                    <span className="text-xs text-violet-600 mt-2 inline-block">Open →</span>
                  </button>
                ))}
              </div>
            </Panel>
          )}
          {activePanel === 'catalog'    && <Panel><PanelErrorBoundary><CatalogPanel /></PanelErrorBoundary></Panel>}
          {activePanel === 'teachers'   && <Panel><PanelErrorBoundary><TeacherAssignmentPanel /></PanelErrorBoundary></Panel>}
          {activePanel === 'aigenerate' && <Panel><PanelErrorBoundary><AIGeneratePanel /></PanelErrorBoundary></Panel>}
          {activePanel === 'bulkupload' && <Panel><PanelErrorBoundary><AdminBulkUploadPanel /></PanelErrorBoundary></Panel>}
          {activePanel === 'pastpapers' && <Panel><PanelErrorBoundary><AdminPastPapersPanel /></PanelErrorBoundary></Panel>}
          {activePanel === 'settings'   && <Panel><PanelErrorBoundary><AdminSettingsPanel setActivePanel={setActivePanel} /></PanelErrorBoundary></Panel>}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
