import { useState, useEffect } from 'react';
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


// ─── Reusable Modal ───────────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={20} />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ message, type, onClose }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium
    ${type === 'success' ? 'bg-green-600' : 'bg-red-500'}`}>
    {type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
    {message}
    <button onClick={onClose}><X size={14} /></button>
  </div>
);

// ─── Catalog Management Panel ─────────────────────────────────────────────────
const CatalogPanel = () => {
  // Bust the shared subject cache after saves/deletes so other panels see fresh data
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

  const [typeForm, setTypeForm] = useState({
    code: '', name: '', full_name: '', description: '',
    country: 'Nigeria', icon_emoji: '', display_order: '',
  });
  const [subjectForm, setSubjectForm] = useState({
    name: '', code: '', description: '', icon_emoji: '',
    color: '#16A34A', category: 'General', level: '',
  });

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const res = await api.get('/catalog/types');
      if (res?.success) setTypes(res.data || []);
    } catch (err) {
      const msg = err?.status === 401
        ? 'Session expired — please log out and log back in'
        : 'Failed to load examination types';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTypes(); }, []);

  const fetchSubjects = async (typeId) => {
    setLoadingSubjects(prev => ({ ...prev, [typeId]: true }));
    try {
      const res = await api.get(`/catalog/types/${typeId}/subjects`);
      if (res?.success) {
        setTypeSubjects(prev => ({ ...prev, [typeId]: res.data || [] }));
      }
    } catch {
      showToast('Failed to load subjects', 'error');
    } finally {
      setLoadingSubjects(prev => ({ ...prev, [typeId]: false }));
    }
  };

  const toggleExpand = (typeId) => {
    if (expandedType === typeId) {
      setExpandedType(null);
    } else {
      setExpandedType(typeId);
      if (!typeSubjects[typeId]) fetchSubjects(typeId);
    }
  };

  const openAddType = () => {
    setEditingType(null);
    setTypeForm({ code: '', name: '', full_name: '', description: '', country: 'Nigeria', icon_emoji: '', display_order: '' });
    setShowTypeModal(true);
  };

  const openEditType = (type) => {
    setEditingType(type);
    setTypeForm({
      code:          type.code,
      name:          type.name,
      full_name:     type.full_name     || '',
      description:   type.description   || '',
      country:       type.country       || 'Nigeria',
      icon_emoji:    type.icon_emoji    || '',
      display_order: type.display_order || '',
    });
    setShowTypeModal(true);
  };

  const openAddSubject = (typeId) => {
    setEditingSubject(null);
    setActiveTypeId(typeId);
    setSubjectForm({ name: '', code: '', description: '', icon_emoji: '', color: '#16A34A', category: 'General', level: '' });
    setShowSubjectModal(true);
  };

  const openEditSubject = (subject, typeId) => {
    setEditingSubject(subject);
    setActiveTypeId(typeId);
    setSubjectForm({
      name:        subject.name        || '',
      code:        subject.code        || '',
      description: subject.description || '',
      icon_emoji:  subject.icon_emoji  || '',
      color:       subject.color       || '#16A34A',
      category:    subject.category    || 'General',
      level:       subject.level       || '',
    });
    setShowSubjectModal(true);
  };

  const saveType = async () => {
    if (!typeForm.code || !typeForm.name) { showToast('Code and Name are required', 'error'); return; }
    setSaving(true);
    try {
      if (editingType) {
        await api.put(`/catalog/types/${editingType.id}`, typeForm);
        showToast('Examination type updated');
      } else {
        await api.post('/catalog/types', typeForm);
        showToast('Examination type created');
      }
      setShowTypeModal(false);
      fetchTypes();
    } catch (err) {
      showToast(err?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveSubject = async () => {
    if (!subjectForm.name || !subjectForm.code) { showToast('Name and Code are required', 'error'); return; }
    setSaving(true);
    try {
      if (editingSubject) {
        await api.put(`/catalog/subjects/${editingSubject.id}`, subjectForm);
        showToast('Subject updated');
      } else {
        await api.post(`/catalog/types/${activeTypeId}/subjects`, subjectForm);
        showToast('Subject added');
      }
      setShowSubjectModal(false);
      fetchSubjects(activeTypeId);
      fetchTypes();
      bustSubjectCache(activeTypeId); // clear shared cache so modal re-fetches fresh
    } catch (err) {
      showToast(err?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;
    try {
      const { kind, id } = showDeleteConfirm;
      if (kind === 'type') {
        await api.delete(`/catalog/types/${id}`);
        showToast('Examination type deactivated');
        fetchTypes();
      } else {
        await api.delete(`/catalog/subjects/${id}`);
        showToast('Subject deactivated');
        fetchSubjects(activeTypeId);
        fetchTypes();
        bustSubjectCache(activeTypeId); // clear shared cache
      }
    } catch (err) {
      showToast(err?.error || 'Failed to deactivate', 'error');
    } finally {
      setShowDeleteConfirm(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin mr-3" />
        <span className="text-gray-500 font-medium">Loading catalog...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Catalog Management</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {types.length} examination type{types.length !== 1 ? 's' : ''} · manage types and their subjects
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTypes}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={openAddType}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-xl transition-colors text-sm shadow-sm"
          >
            <Plus size={16} /> Add Type
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {types.map((type) => (
          <div
            key={type.id}
            className={`border-2 rounded-2xl overflow-hidden transition-all ${
              type.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
            }`}
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-white">
              <button
                onClick={() => toggleExpand(type.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                {expandedType === type.id
                  ? <ChevronDown size={18} className="text-gray-400 shrink-0" />
                  : <ChevronRight size={18} className="text-gray-400 shrink-0" />
                }
                <span className="text-2xl leading-none">{type.icon_emoji || ''}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{type.name}</span>
                    <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                      {type.code}
                    </span>
                    {!type.is_active && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{type.full_name}</p>
                </div>
              </button>

              <span className="text-xs text-gray-400 shrink-0 hidden sm:block">
                {type.subject_count} subject{type.subject_count !== 1 ? 's' : ''}
              </span>

              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openAddSubject(type.id)}
                  title="Add subject"
                  className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 border border-green-200 hover:border-green-400 px-2.5 py-1.5 rounded-lg transition-colors font-semibold"
                >
                  <Plus size={12} /> Subject
                </button>
                <button
                  onClick={() => openEditType(type)}
                  title="Edit type"
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm({ kind: 'type', id: type.id, name: type.name })}
                  title="Deactivate type"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {expandedType === type.id && (
              <div className="bg-gray-50 border-t border-gray-100 px-4 pb-4 pt-3">
                {loadingSubjects[type.id] ? (
                  <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
                    <Loader2 size={16} className="animate-spin" /> Loading subjects...
                  </div>
                ) : (typeSubjects[type.id] || []).length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-gray-400 text-sm mb-3">No subjects yet under this type.</p>
                    <button
                      onClick={() => openAddSubject(type.id)}
                      className="inline-flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-semibold"
                    >
                      <Plus size={14} /> Add first subject
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(typeSubjects[type.id] || []).map((subject) => (
                      <div
                        key={subject.id}
                        className={`flex items-center gap-3 bg-white rounded-xl px-4 py-3 border ${
                          subject.is_active ? 'border-gray-200' : 'border-gray-100 opacity-50'
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                          style={{ backgroundColor: (subject.color || '#16A34A') + '20' }}
                        >
                          {subject.icon_emoji || ''}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{subject.name}</span>
                            <span className="text-xs font-mono bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                              {subject.code}
                            </span>
                            {!subject.is_active && (
                              <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full">Inactive</span>
                            )}
                          </div>
                          {subject.category && (
                            <span className="text-xs text-gray-400">{subject.category}</span>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => { setActiveTypeId(type.id); openEditSubject(subject, type.id); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => { setActiveTypeId(type.id); setShowDeleteConfirm({ kind: 'subject', id: subject.id, name: subject.name }); }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Add/Edit Type Modal ── */}
      {showTypeModal && (
        <Modal
          title={editingType ? 'Edit Examination Type' : 'Add Examination Type'}
          onClose={() => setShowTypeModal(false)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={typeForm.code}
                  onChange={(e) => setTypeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  disabled={!!editingType}
                  placeholder="e.g. ALEVEL"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Icon Emoji</label>
                <input
                  type="text"
                  value={typeForm.icon_emoji}
                  onChange={(e) => setTypeForm(f => ({ ...f, icon_emoji: e.target.value }))}
                  placeholder=""
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={typeForm.name}
                onChange={(e) => setTypeForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. A-Levels"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={typeForm.full_name}
                onChange={(e) => setTypeForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="e.g. Cambridge International A-Levels"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
              <textarea
                value={typeForm.description}
                onChange={(e) => setTypeForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Brief description..."
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Country</label>
                <input
                  type="text"
                  value={typeForm.country}
                  onChange={(e) => setTypeForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="Nigeria"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Display Order</label>
                <input
                  type="number"
                  value={typeForm.display_order}
                  onChange={(e) => setTypeForm(f => ({ ...f, display_order: e.target.value }))}
                  placeholder="Auto"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowTypeModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveType}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {editingType ? 'Save Changes' : 'Create Type'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add/Edit Subject Modal ── */}
      {showSubjectModal && (
        <Modal
          title={editingSubject ? 'Edit Subject' : 'Add Subject'}
          onClose={() => setShowSubjectModal(false)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Comprehension"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subjectForm.code}
                  onChange={(e) => setSubjectForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. ENG-COMP"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
              <textarea
                value={subjectForm.description}
                onChange={(e) => setSubjectForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Brief description..."
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Emoji</label>
                <input
                  type="text"
                  value={subjectForm.icon_emoji}
                  onChange={(e) => setSubjectForm(f => ({ ...f, icon_emoji: e.target.value }))}
                  placeholder=""
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Color</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={subjectForm.color}
                    onChange={(e) => setSubjectForm(f => ({ ...f, color: e.target.value }))}
                    className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={subjectForm.color}
                    onChange={(e) => setSubjectForm(f => ({ ...f, color: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-xl px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Level</label>
                <input
                  type="text"
                  value={subjectForm.level}
                  onChange={(e) => setSubjectForm(f => ({ ...f, level: e.target.value }))}
                  placeholder="e.g. SS3"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
              <input
                type="text"
                value={subjectForm.category}
                onChange={(e) => setSubjectForm(f => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Language, Science, Mathematics"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSubjectModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveSubject}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                {editingSubject ? 'Save Changes' : 'Add Subject'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Confirm ── */}
      {showDeleteConfirm && (
        <Modal title="Confirm Deactivation" onClose={() => setShowDeleteConfirm(null)}>
          <div className="text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <p className="text-gray-700 mb-1">
              Deactivate <span className="font-bold">"{showDeleteConfirm.name}"</span>?
            </p>
            <p className="text-sm text-gray-400 mb-6">
              It will be hidden from students but not permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                Yes, Deactivate
              </button>
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
  const [assignments,        setAssignments]        = useState([]);
  const [teachers,           setTeachers]           = useState([]);
  const [filteredSubjects,   setFilteredSubjects]   = useState([]);
  const [loading,            setLoading]            = useState(true);
  const [loadingSubjects,    setLoadingSubjects]    = useState(false);
  const [showModal,          setShowModal]          = useState(false);
  const [saving,             setSaving]             = useState(false);
  const [toast,              setToast]              = useState(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);
  const [form, setForm] = useState({ teacher_id: '', exam_type_id: '' });

  // ── Shared catalog hook — exam types come from cache, no duplicate fetch ──
  const { examTypes, loadingTypes, fetchSubjectsForType, invalidateCache } = useCatalog();

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [aRes, tRes] = await Promise.all([
        api.get('/admin/teacher-assignments'),
        api.get('/users?role=teacher'),
      ]);
      if (aRes?.success) setAssignments(aRes.data || []);
      if (tRes?.data)    setTeachers(tRes.data    || []);
    } catch (err) { console.warn('[TeacherAssignment] load failed:', err?.error); }
    finally  { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  // When exam type changes, fetch subjects via shared hook (cached for non-empty)
  const handleExamTypeChange = async (typeId) => {
    setForm(f => ({ ...f, exam_type_id: typeId }));
    setSelectedSubjectIds([]);
    setFilteredSubjects([]);
    if (!typeId) return;
    setLoadingSubjects(true);
    try {
      const subjects = await fetchSubjectsForType(typeId);
      setFilteredSubjects(subjects);
    } catch {
      showToast('Failed to load subjects for this exam type', 'error');
    } finally {
      setLoadingSubjects(false);
    }
  };

  // Manual refresh — busts cache for current type and re-fetches
  const refreshSubjects = async () => {
    if (!form.exam_type_id) return;
    invalidateCache(form.exam_type_id); // clear stale cache entry
    setSelectedSubjectIds([]);
    setFilteredSubjects([]);
    setLoadingSubjects(true);
    try {
      const subjects = await fetchSubjectsForType(form.exam_type_id);
      setFilteredSubjects(subjects);
    } catch {
      showToast('Failed to refresh subjects', 'error');
    } finally {
      setLoadingSubjects(false);
    }
  };

  const toggleSubject = (id) =>
    setSelectedSubjectIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const openModal = () => {
    setForm({ teacher_id: '', exam_type_id: '' });
    setSelectedSubjectIds([]);
    setFilteredSubjects([]);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.teacher_id || !form.exam_type_id || selectedSubjectIds.length === 0) {
      showToast('Teacher, Exam Type and at least one Subject are required', 'error');
      return;
    }
    setSaving(true);
    try {
      // Post one assignment per selected subject
      await Promise.all(
        selectedSubjectIds.map(subject_id =>
          api.post('/admin/teacher-assignments', {
            teacher_id:   form.teacher_id,
            subject_id,
            exam_board_id: form.exam_type_id,
          })
        )
      );
      showToast(`${selectedSubjectIds.length} assignment${selectedSubjectIds.length > 1 ? 's' : ''} saved successfully`);
      setShowModal(false);
      setForm({ teacher_id: '', exam_type_id: '' });
      setSelectedSubjectIds([]);
      setFilteredSubjects([]);
      fetchAll();
    } catch (err) {
      showToast(err?.error || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this assignment?')) return;
    try {
      await api.delete(`/admin/teacher-assignments/${id}`);
      showToast('Assignment removed');
      fetchAll();
    } catch { showToast('Failed to remove', 'error'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-7 h-7 text-purple-500 animate-spin mr-3" />
      <span className="text-gray-500">Loading assignments…</span>
    </div>
  );

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Teacher Assignment</h2>
          <p className="text-sm text-gray-500 mt-0.5">Assign teachers to subjects and exam types</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={openModal} className="flex items-center gap-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-semibold">
            <Plus size={14} /> Add Assignment
          </button>
        </div>
      </div>

      {/* Assignments table */}
      {assignments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No assignments yet. Click "Add Assignment" to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="pb-3 font-semibold text-gray-600">Teacher</th>
                <th className="pb-3 font-semibold text-gray-600">Email</th>
                <th className="pb-3 font-semibold text-gray-600">Subject</th>
                <th className="pb-3 font-semibold text-gray-600">Exam Type</th>
                <th className="pb-3 font-semibold text-gray-600">Status</th>
                <th className="pb-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 font-medium text-gray-800">{a.teacher_name}</td>
                  <td className="py-3 text-gray-500 text-xs">{a.email}</td>
                  <td className="py-3 text-gray-700">{a.subject_name}</td>
                  <td className="py-3 text-gray-500">{a.exam_board_code || '—'}</td>
                  <td className="py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3">
                    {a.is_active && (
                      <button onClick={() => handleRemove(a.id)}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                        <Trash2 size={12} /> Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Assignment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Add Assignment</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">

              {/* Step 1: Teacher */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Teacher <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.teacher_id}
                  onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400"
                >
                  <option value="">Select a teacher…</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name} — {t.email}</option>
                  ))}
                </select>
              </div>

              {/* Step 2: Exam Type (required, drives subject list) */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Exam Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.exam_type_id}
                  onChange={e => handleExamTypeChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400"
                >
                  <option value="">Select an exam type…</option>
                  {loadingTypes
                    ? <option disabled>Loading…</option>
                    : examTypes.filter(et => et.is_active !== false).map(et => (
                        <option key={et.id} value={et.id}>
                          {et.icon_emoji || ''} {et.name} ({et.code})
                        </option>
                      ))
                  }
                </select>
              </div>

              {/* Step 3: Subjects — multi-select, loads after exam type chosen */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-600">
                    Subject(s) <span className="text-red-500">*</span>
                    {selectedSubjectIds.length > 0 && (
                      <span className="ml-2 text-purple-600 font-bold">{selectedSubjectIds.length} selected</span>
                    )}
                  </label>
                  {form.exam_type_id && (
                    <button
                      type="button"
                      onClick={refreshSubjects}
                      disabled={loadingSubjects}
                      title="Re-fetch subjects (use after adding subjects in Catalog Management)"
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={11} className={loadingSubjects ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  )}
                </div>

                {!form.exam_type_id ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-gray-400 text-sm">
                    Select an exam type first to see its subjects
                  </div>
                ) : loadingSubjects ? (
                  <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
                    <Loader2 size={15} className="animate-spin" /> Loading subjects…
                  </div>
                ) : filteredSubjects.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-gray-400 text-sm">
                    No subjects found for this exam type. Add subjects first via Catalog Management.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 border border-gray-200 rounded-xl p-2">
                    {filteredSubjects.map(s => {
                      const selected = selectedSubjectIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleSubject(s.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-left transition-all ${
                            selected
                              ? 'border-purple-500 bg-purple-50'
                              : 'border-transparent hover:border-purple-200 hover:bg-gray-50'
                          }`}
                        >
                          <span className="text-base">{s.icon_emoji || ''}</span>
                          <span className={`flex-1 text-sm font-medium ${selected ? 'text-purple-800' : 'text-gray-800'}`}>
                            {s.name}
                          </span>
                          {selected && <Check size={14} className="text-purple-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving || !form.teacher_id || !form.exam_type_id || selectedSubjectIds.length === 0}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  : <><Check size={14} /> Save {selectedSubjectIds.length > 0 ? `${selectedSubjectIds.length} Assignment${selectedSubjectIds.length > 1 ? 's' : ''}` : 'Assignment'}</>
                }
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── AI Generate Panel ────────────────────────────────────────────────────────
const AIGeneratePanel = () => {
  const [subjects,      setSubjects]      = useState([]);
  const [subjectsLoad,  setSubjectsLoad]  = useState(true);
  const [pendingCount,  setPendingCount]  = useState(null);
  const [form, setForm] = useState({
    subject_id: '', topic: '', exam_board: 'JAMB',
    count: 10, difficulty: 'medium',
  });
  const [generating,       setGenerating]       = useState(false);
  const [result,           setResult]           = useState(null);
  const [error,            setError]            = useState('');
  const [previewQuestions, setPreviewQuestions] = useState([]);

  // ── Use shared catalog hook for exam types ──────────────────────────────────
  const { examTypes, loadingTypes: examTypesLoad } = useCatalog();

  useEffect(() => {
    api.get('/admin/subjects')
      .then(r => setSubjects(r.data || r || []))
      .catch(() => {})
      .finally(() => setSubjectsLoad(false));

    api.get('/admin/questions/pending-count')
      .then(r => setPendingCount(r.count))
      .catch(() => {});
  }, []); // eslint-disable-line

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.subject_id || !form.topic.trim()) {
      setError('Subject and topic are required.'); return;
    }
    setError(''); setResult(null); setPreviewQuestions([]); setGenerating(true);
    try {
      const res = await api.post('/admin/generate-questions', form);
      setResult(res);
      if (Array.isArray(res.questions)) setPreviewQuestions(res.questions);
      setPendingCount(c => (c || 0) + (res.inserted || 0));
    } catch (err) {
      setError(err?.error || 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-300';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-teal-500" />
          <h3 className="font-bold text-gray-900">AI Question Generator</h3>
        </div>
        {pendingCount !== null && (
          <a href="/admin/questions/review"
             className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full hover:bg-amber-200 transition-colors">
            <Zap size={12} />
            {pendingCount} pending review
          </a>
        )}
      </div>

      <form onSubmit={handleGenerate} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
          <select
            value={form.subject_id}
            onChange={e => setForm(f => ({ ...f, subject_id: e.target.value }))}
            className={inputCls}
            required
          >
            <option value="">Select subject…</option>
            {subjectsLoad
              ? <option disabled>Loading…</option>
              : subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.exam_board_code})</option>
                ))
            }
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Topic</label>
          <input
            type="text"
            value={form.topic}
            onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
            placeholder="e.g. Cell Biology, Algebra, Macroeconomics"
            className={inputCls}
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Exam Type</label>
            <select
              value={form.exam_board}
              onChange={e => setForm(f => ({ ...f, exam_board: e.target.value }))}
              className={inputCls}
            >
              {examTypesLoad
                ? <option disabled>Loading…</option>
                : examTypes
                    .filter(et => et.is_active !== false)
                    .map(et => (
                      <option key={et.code} value={et.code}>
                        {et.icon_emoji || ''} {et.name}
                      </option>
                    ))
              }
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Difficulty</label>
            <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))} className={inputCls}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Count</label>
            <select value={form.count} onChange={e => setForm(f => ({ ...f, count: Number(e.target.value) }))} className={inputCls}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {result && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm">
            <Check size={14} /> {result.message}
          </div>
        )}

        <button
          type="submit"
          disabled={generating}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          {generating
            ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
            : <><Sparkles size={14} /> Generate Questions</>}
        </button>
      </form>

      {previewQuestions.length > 0 && (
        <div className="mt-6 max-w-lg">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-teal-500" />
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Generated Questions Preview ({previewQuestions.length})
            </p>
            <span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
               AI • Pending Review
            </span>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {previewQuestions.map((q, i) => (
              <div key={q.id || i} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-800 mb-2 leading-relaxed">
                  {i + 1}. {q.question_text}
                </p>
                {q.concept_hint && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    <Zap size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      <span className="font-semibold">Concept hint: </span>{q.concept_hint}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Go to <strong>Question Review</strong> to approve these before they appear in quizzes.
          </p>
        </div>
      )}
    </div>
  );
};

// ─── User Management Panel ────────────────────────────────────────────────────
const UserManagementPanel = () => {
  const [userStats,   setUserStats]   = useState(null);
  const [users,       setUsers]       = useState([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState('');
  const [roleFilter,  setRoleFilter]  = useState('');
  const [loading,     setLoading]     = useState(true);
  const [toast,       setToast]       = useState(null);
  const LIMIT = 20;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    api.get('/users/stats')
      .then(r => { if (r.success) setUserStats(r.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), 300);
    return () => clearTimeout(timer);
  }, [search, roleFilter, page]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const r = await api.get('/users', {
        params: { search, role: roleFilter, page, limit: LIMIT },
      });
      setUsers(r.data || []);
      setTotal(r.total || 0);
    } catch (err) {
      // Silent retry — don't show intrusive toast for background load failures
      console.warn('[UserManagement] fetch failed:', err?.error || err?.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (userId, role) => {
    try {
      await api.put(`/users/${userId}/role`, { role });
      showToast(`Role updated to ${role}`);
      fetchUsers();
    } catch {
      showToast('Failed to update role', 'error');
    }
  };

  const toggleActive = async (userId, currentActive) => {
    try {
      await api.put(`/users/${userId}/deactivate`, { is_active: !currentActive });
      showToast(!currentActive ? 'User activated' : 'User deactivated');
      fetchUsers();
    } catch {
      showToast('Failed to update user status', 'error');
    }
  };

  const deleteUser = async (userId, email) => {
    if (!window.confirm(`Permanently delete user "${email}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${userId}`);
      showToast(`User ${email} deleted`);
      fetchUsers();
    } catch (err) {
      showToast(err?.error || 'Failed to delete user', 'error');
    }
  };

  const roleBadge = (role) => {
    const map = {
      student: 'bg-blue-100 text-blue-700',
      teacher: 'bg-purple-100 text-purple-700',
      admin:   'bg-red-100 text-red-700',
    };
    return `text-xs font-semibold px-2.5 py-1 rounded-full ${map[role] || 'bg-gray-100 text-gray-600'}`;
  };

  const subBadge = (status) => {
    const map = {
      active:    'bg-green-100 text-green-700',
      free:      'bg-gray-100 text-gray-500',
      expired:   'bg-amber-100 text-amber-700',
      cancelled: 'bg-red-100 text-red-500',
    };
    return `text-xs px-2 py-0.5 rounded-full ${map[status] || 'bg-gray-100 text-gray-500'}`;
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-400 mt-0.5">{total} users total</p>
        </div>
        <button onClick={fetchUsers} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {userStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total',        value: userStats.total,                color: 'text-gray-900' },
            { label: 'Students',     value: userStats.students,             color: 'text-blue-600' },
            { label: 'Teachers',     value: userStats.teachers,             color: 'text-purple-600' },
            { label: 'Active Subs',  value: userStats.active_subscriptions, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">All Roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No users found.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-400 font-medium">
              <tr>
                <th className="text-left px-4 py-3">Name / Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Subscription</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Last Login</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className={`bg-white hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{u.first_name} {u.last_name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={roleBadge(u.role)}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={subBadge(u.subscription_status)}>{u.subscription_status || 'free'}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-400 text-xs">{u.last_login ? fmtDate(u.last_login) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={e => changeRole(u.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => toggleActive(u.id, u.is_active)}
                        title={u.is_active ? 'Deactivate' : 'Activate'}
                        className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                          u.is_active
                            ? 'bg-red-50 text-red-500 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => deleteUser(u.id, u.email)}
                        title="Permanently delete user"
                        className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-400">Page {page} of {totalPages} · {total} users</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              ← Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PlatformAnalyticsPanel
// ─────────────────────────────────────────────────────────────────────────────
const PlatformAnalyticsPanel = () => {
  const navigate              = useNavigate();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/admin/platform-stats');
      if (res?.success) setStats(res.data || null);
    } catch (err) {
      setError(err?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []); // eslint-disable-line

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-teal-500 animate-spin mr-3" />
      <span className="text-gray-500">Loading analytics…</span>
    </div>
  );

  if (error) return (
    <div className="text-center py-12 text-red-500">
      <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
      <p className="text-sm">{error}</p>
      <button onClick={fetchStats} className="mt-3 text-sm text-teal-600 hover:underline">Retry</button>
    </div>
  );

  if (!stats) return null;

  const { users = {}, questions = {}, revenue = {}, top_subjects = [], daily_activity = [] } = stats;

  const statCards = [
    { label: 'Total Students',       value: users.students           ?? '—', color: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700'   },
    { label: 'Answered Today',        value: questions.answered_today ?? '—', color: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700'   },
    { label: 'Active Subscriptions',  value: revenue.total_active_subs ?? '—', color: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
    { label: 'Pending Questions',     value: questions.total_pending  ?? '—', color: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700'  },
  ];

  const SUBJECT_COLORS = ['#14b8a6','#6366f1','#f59e0b','#ec4899','#8b5cf6'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Platform Analytics</h2>
          <p className="text-sm text-gray-500 mt-0.5">Live snapshot of platform activity</p>
        </div>
        <button onClick={fetchStats} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((c, i) => (
          <div key={i} className={`${c.color} border ${c.border} rounded-2xl p-4`}>
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-3xl font-black ${c.text}`}>{c.value.toLocaleString?.() ?? c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <p className="text-gray-400 text-xs">Active Today</p>
          <p className="font-bold text-gray-800 text-lg">{(users.active_today ?? '—').toLocaleString?.() ?? users.active_today}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <p className="text-gray-400 text-xs">New This Week</p>
          <p className="font-bold text-gray-800 text-lg">{(users.new_this_week ?? '—').toLocaleString?.() ?? users.new_this_week}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <p className="text-gray-400 text-xs">Answered This Week</p>
          <p className="font-bold text-gray-800 text-lg">{(questions.answered_this_week ?? '—').toLocaleString?.() ?? questions.answered_this_week}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
          <p className="text-gray-400 text-xs">New Subs (30d)</p>
          <p className="font-bold text-gray-800 text-lg">{(revenue.new_subs_this_month ?? '—').toLocaleString?.() ?? revenue.new_subs_this_month}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Daily Activity (Last 14 Days)</p>
          {daily_activity.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No activity data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={daily_activity} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} width={30} />
                <Tooltip formatter={(v) => [v, 'Attempts']} labelFormatter={(l) => `Date: ${l}`} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Line type="monotone" dataKey="attempt_count" stroke="#14b8a6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-700 mb-4">Top Subjects — Avg Accuracy (%)</p>
          {top_subjects.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No subject data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={top_subjects} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} />
                <Tooltip formatter={(v) => [`${v}%`, 'Avg Accuracy']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="avg_accuracy" radius={[4, 4, 0, 0]}>
                  {top_subjects.map((_, i) => (
                    <Cell key={i} fill={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              try {
                await api.post('/admin/send-weekly-digest');
                alert('Weekly digest queued successfully.');
              } catch {
                alert('Failed to queue digest. Check server logs.');
              }
            }}
            className="flex items-center gap-2 text-sm bg-teal-600 hover:bg-teal-700 text-white font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <Zap size={14} /> Run Weekly Digest Now
          </button>
          <button
            onClick={() => navigate('/admin/questions/review')}
            className="flex items-center gap-2 text-sm border border-amber-300 text-amber-700 hover:bg-amber-50 font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            <AlertTriangle size={14} /> View Pending Questions ({questions.total_pending ?? 0})
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState(null);
  const [stats, setStats]             = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await api.get('/catalog/stats');
        if (res?.success) setStats(res.data || null);
      } catch {
        setStats(null);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total Users',     value: statsLoading ? '…' : stats?.total_users      ?? '—', icon: Users,         color: 'bg-blue-500'   },
    { label: 'Exam Types',      value: statsLoading ? '…' : stats?.total_exam_types  ?? '—', icon: GraduationCap, color: 'bg-purple-500' },
    { label: 'Total Subjects',  value: statsLoading ? '…' : stats?.total_subjects    ?? '—', icon: BookOpen,      color: 'bg-green-500'  },
    { label: 'Active Students', value: statsLoading ? '…' : stats?.active_students   ?? '—', icon: Settings,      color: 'bg-amber-500'  },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow p-6">
              <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center mb-4`}>
                {statsLoading
                  ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                  : <stat.icon className="w-6 h-6 text-white" />
                }
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-600">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">System Management</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { key: 'analytics',    icon: Zap,         color: 'teal',   label: 'Analytics',          desc: 'Platform-wide stats and charts'       },
              { key: 'users',        icon: Users,        color: 'blue',   label: 'User Management',    desc: 'Manage users and permissions'          },
              { key: 'schools',      icon: School,       color: 'purple', label: 'School Management',  desc: 'Manage schools and institutions'       },
              { key: 'content',      icon: BookOpen,     color: 'green',  label: 'Content Management', desc: 'Manage courses and subjects'           },
              { key: 'catalog',      icon: GraduationCap,color: 'orange', label: 'Catalog Management', desc: 'Manage exam types & subjects'          },
              { key: 'teachers',     icon: UserCheck,    color: 'purple', label: 'Teacher Assignment', desc: 'Assign subjects to teachers'           },
              { key: 'aigenerate',   icon: Sparkles,     color: 'teal',   label: 'AI Generate',        desc: 'Generate questions with Gemini'        },
              { key: 'bulkupload',   icon: Upload,       color: 'blue',   label: 'Bulk Upload',        desc: 'Upload files in bulk, assign later'    },
            ].map(({ key, icon: Icon, color, label, desc }) => {
              const active = activePanel === key;
              const borderMap = { teal: 'border-teal-500', blue: 'border-blue-500', purple: 'border-purple-500', green: 'border-green-500', orange: 'border-green-500' };
              const bgMap =     { teal: 'bg-teal-50',      blue: 'bg-blue-50',      purple: 'bg-purple-50',      green: 'bg-green-50',      orange: 'bg-green-50'      };
              const textMap =   { teal: 'text-teal-600',   blue: 'text-blue-600',   purple: 'text-purple-600',   green: 'text-green-600',   orange: 'text-orange-500'  };
              return (
                <button
                  key={key}
                  onClick={() => setActivePanel(active ? null : key)}
                  className={`p-6 border-2 rounded-lg transition-colors text-left ${
                    active ? `${borderMap[color]} ${bgMap[color]}` : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`w-8 h-8 mb-2 ${active ? textMap[color] : textMap[color]}`} />
                  <h3 className="font-semibold mb-1">{label}</h3>
                  <p className="text-sm text-gray-600">{desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {activePanel === 'schools' && (
          <div className="bg-white rounded-xl shadow p-6 mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-5">School Management</h2>
            <div className="text-center py-16 text-gray-400">
              <School className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">School management coming soon.</p>
              <p className="text-xs mt-1">This section will allow you to register and manage schools, link students to institutions, and track school-level analytics.</p>
            </div>
          </div>
        )}

        {activePanel === 'content' && (
          <div className="bg-white rounded-xl shadow p-6 mt-6">
            <h2 className="text-xl font-bold text-gray-900 mb-5">Content Management</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <button onClick={() => setActivePanel('catalog')} className="border border-gray-200 rounded-xl p-4 hover:border-green-400 hover:bg-green-50 transition-colors text-left group">
                <BookOpen className="w-7 h-7 text-green-500 mb-2" />
                <p className="font-semibold text-gray-800 text-sm group-hover:text-green-700">Manage Subjects</p>
                <p className="text-xs text-gray-400 mt-1">Add, edit or deactivate exam types and subjects</p>
                <span className="text-xs text-green-600 font-semibold mt-2 inline-block">Open Catalog Management →</span>
              </button>
              <button onClick={() => navigate('/past-papers')} className="border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left group">
                <Settings className="w-7 h-7 text-blue-500 mb-2" />
                <p className="font-semibold text-gray-800 text-sm group-hover:text-blue-700">Past Papers</p>
                <p className="text-xs text-gray-400 mt-1">View and manage past exam papers available to students</p>
                <span className="text-xs text-blue-600 font-semibold mt-2 inline-block">Go to Past Papers →</span>
              </button>
              <button onClick={() => navigate('/admin/questions/review')} className="border border-gray-200 rounded-xl p-4 hover:border-amber-400 hover:bg-amber-50 transition-colors text-left group">
                <BookOpen className="w-7 h-7 text-amber-500 mb-2" />
                <p className="font-semibold text-gray-800 text-sm group-hover:text-amber-700">Question Review</p>
                <p className="text-xs text-gray-400 mt-1">Review and approve AI-generated and submitted questions</p>
                <span className="text-xs text-amber-600 font-semibold mt-2 inline-block">Review Queue →</span>
              </button>
            </div>
          </div>
        )}

        {activePanel === 'analytics' && (
          <div className="bg-white rounded-xl shadow p-6 mt-6">
            <PlatformAnalyticsPanel />
          </div>
        )}

        {activePanel === 'users' && (
          <div className="bg-white rounded-xl shadow p-6 mt-6">
            <UserManagementPanel />
          </div>
        )}

        {activePanel === 'catalog' && (
          <div className="bg-white rounded-xl shadow p-6">
            <CatalogPanel />
          </div>
        )}

        {activePanel === 'teachers' && (
          <div className="bg-white rounded-xl shadow p-6">
            <TeacherAssignmentPanel />
          </div>
        )}

        {activePanel === 'aigenerate' && (
          <div className="bg-white rounded-xl shadow p-6">
            <AIGeneratePanel />
          </div>
        )}

        {activePanel === 'bulkupload' && (
          <div className="bg-white rounded-xl shadow p-6">
            <AdminBulkUploadPanel />
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
