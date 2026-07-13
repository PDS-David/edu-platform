import { useState, useEffect, Component } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import api, { TIMEOUT_AI_GENERATE } from '../services/apiClient';
import {
  Users, School, BookOpen, Settings, LogOut,
  Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Loader2, X, Check, AlertTriangle, RefreshCw, GraduationCap,
  UserCheck, UserX, ChevronUp, Sparkles, Zap, Upload, CheckCircle, Shield, Mail,
  Layers, Search, FileText,
} from 'lucide-react';
import branding from '../config/branding';
import TopNav from '../components/TopNav';
import { useCatalog } from '../hooks/useCatalog';
import AdminBulkUploadPanel from '../components/AdminBulkUploadPanel';
import UploadPastPaperForm from '../components/UploadPastPaperForm';
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
          <p className="text-sm font-semibold text-gray-700">Something went wrong in this panel</p>
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
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = ({ message, type, onClose }) => (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border
    ${type === 'success' ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white border-red-200 text-red-600'}`}>
    {type === 'success' ? <Check size={15} className="text-emerald-500" /> : <AlertTriangle size={15} className="text-red-500" />}
    {message}
    <button onClick={onClose} className="text-gray-300 hover:text-gray-500 ml-1"><X size={13} /></button>
  </div>
);

// ─── Input style helper ───────────────────────────────────────────────────────
const inputCls = 'w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-400 focus:border-violet-400';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);   // { kind, id, name, action: 'deactivate'|'permanent' }
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(null); // { id, name }
  const [editingType, setEditingType]           = useState(null);
  const [editingSubject, setEditingSubject]     = useState(null);
  const [activeTypeId, setActiveTypeId]         = useState(null);
  const [toast, setToast]                       = useState(null);
  const [saving, setSaving]                     = useState(false);
  const [typeForm, setTypeForm] = useState({ code: '', name: '', full_name: '', description: '', country: 'Nigeria', icon_emoji: '', display_order: '' });
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '', description: '', icon_emoji: '', color: '#7c3aed', category: 'General', level: '' });

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  // BUG FIX (admin-catalog-full-reload-on-single-save): fetchTypes()/fetchSubjects()
  // were called after every single create/edit/delete/reactivate below, and since
  // this component does `if (loading) return <spinner>`, every one of those small
  // actions blanked the ENTIRE types+subjects list — including collapsing any
  // currently-expanded type's subject list (expandedType/typeSubjects state).
  // The `silent` flag lets these same functions still re-sync with the server
  // (safer than hand-building the updated object locally, since these responses'
  // exact shapes aren't guaranteed) without ever showing the blanking spinner —
  // only the very first mount-time load does that now.
  const fetchTypes = async (silent = false) => {
    if (!silent) setLoading(true);
    try { const res = await api.get('/catalog/types'); if (res?.success) setTypes(res.data || []); }
    catch (err) { showToast(err?.status === 401 ? 'Session expired — please log back in' : 'Failed to load examination types', 'error'); }
    finally { if (!silent) setLoading(false); }
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
      setShowTypeModal(false); fetchTypes(true);
    } catch (err) { showToast(err?.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const saveSubject = async () => {
    if (!subjectForm.name || !subjectForm.code) { showToast('Name and Code are required', 'error'); return; }
    setSaving(true);
    try {
      if (editingSubject) { await api.put(`/catalog/subjects/${editingSubject.id}`, subjectForm); showToast('Subject updated'); }
      else { await api.post(`/catalog/types/${activeTypeId}/subjects`, subjectForm); showToast('Subject added'); }
      setShowSubjectModal(false); fetchSubjects(activeTypeId); fetchTypes(true); bustSubjectCache(activeTypeId);
    } catch (err) { showToast(err?.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;
    try {
      if (showDeleteConfirm.kind === 'type') {
        if (showDeleteConfirm.action === 'permanent') {
          await api.delete(`/catalog/types/${showDeleteConfirm.id}/permanent`);
          showToast('Exam type permanently deleted');
        } else {
          await api.delete(`/catalog/types/${showDeleteConfirm.id}`);
          showToast('Exam type and all its subjects deactivated');
        }
        fetchTypes(true);
      } else {
        await api.delete(`/catalog/subjects/${showDeleteConfirm.id}`);
        showToast('Subject deactivated');
        fetchSubjects(activeTypeId); fetchTypes(true); bustSubjectCache(activeTypeId);
      }
    } catch (err) { showToast(err?.message || 'Failed', 'error'); }
    finally { setShowDeleteConfirm(null); }
  };

  const confirmReactivate = async () => {
    if (!showReactivateConfirm) return;
    try {
      await api.post(`/catalog/types/${showReactivateConfirm.id}/reactivate`);
      showToast('Exam type reactivated — re-activate individual subjects as needed');
      fetchTypes(true);
    } catch (err) { showToast(err?.message || 'Failed to reactivate', 'error'); }
    finally { setShowReactivateConfirm(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-violet-400 animate-spin mr-3" /><span className="text-gray-500">Loading catalog...</span></div>;

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
                {type.is_active ? (
                  <>
                    <button onClick={() => openAddSubject(type.id)} className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 border border-violet-200 hover:border-violet-400 px-2.5 py-1.5 rounded-lg font-semibold"><Plus size={12} /> Subject</button>
                    <button onClick={() => openEditType(type)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Pencil size={15} /></button>
                    <button
                      onClick={() => setShowDeleteConfirm({ kind: 'type', id: type.id, name: type.name, action: 'deactivate' })}
                      title="Deactivate (move to recycle bin)"
                      className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg"
                    ><Trash2 size={15} /></button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowReactivateConfirm({ id: type.id, name: type.name })}
                      className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-400 px-2.5 py-1.5 rounded-lg font-semibold"
                    >↩ Reactivate</button>
                    <button
                      onClick={() => setShowDeleteConfirm({ kind: 'type', id: type.id, name: type.name, action: 'permanent' })}
                      title="Permanently delete — cannot be undone"
                      className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-400 px-2.5 py-1.5 rounded-lg font-semibold"
                    ><Trash2 size={12} /> Delete Forever</button>
                  </>
                )}
              </div>
            </div>
            {expandedType === type.id && (
              <div className="bg-gray-50 border-t border-gray-100 px-4 pb-4 pt-3">
                {loadingSubjects[type.id] ? <div className="flex items-center gap-2 py-4 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Loading subjects...</div>
                  : (typeSubjects[type.id] || []).length === 0 ? <div className="text-center py-6"><p className="text-gray-400 text-sm mb-3">No subjects yet.</p><button onClick={() => openAddSubject(type.id)} className="inline-flex items-center gap-1.5 text-sm text-violet-600 font-semibold"><Plus size={14} /> Add first subject</button></div>
                  : (
                    <div className="space-y-2">
                      {(typeSubjects[type.id] || []).map((subject) => (
                        <div key={subject.id} className={`flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border ${subject.is_active ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
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
              <div><label className="block text-sm font-semibold text-gray-600 mb-1">Code *</label><input type="text" value={typeForm.code} onChange={(e) => setTypeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} disabled={!!editingType} placeholder="e.g. ALEVEL" className={inputCls + ' disabled:bg-white/[0.02] disabled:opacity-50'} /></div>
              <div><label className="block text-sm font-semibold text-gray-600 mb-1">Icon Emoji</label><input type="text" value={typeForm.icon_emoji} onChange={(e) => setTypeForm(f => ({ ...f, icon_emoji: e.target.value }))} className={inputCls} /></div>
            </div>
            <div><label className="block text-sm font-semibold text-gray-600 mb-1">Name *</label><input type="text" value={typeForm.name} onChange={(e) => setTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. A-Levels" className={inputCls} /></div>
            <div><label className="block text-sm font-semibold text-gray-600 mb-1">Full Name</label><input type="text" value={typeForm.full_name} onChange={(e) => setTypeForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} /></div>
            <div><label className="block text-sm font-semibold text-gray-600 mb-1">Description</label><textarea value={typeForm.description} onChange={(e) => setTypeForm(f => ({ ...f, description: e.target.value }))} rows={2} className={inputCls + ' resize-none'} /></div>
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
              <div><label className="block text-sm font-semibold text-gray-600 mb-1">Name *</label><input type="text" value={subjectForm.name} onChange={(e) => setSubjectForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></div>
              <div><label className="block text-sm font-semibold text-gray-600 mb-1">Code *</label><input type="text" value={subjectForm.code} onChange={(e) => setSubjectForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className={inputCls + ' font-mono'} /></div>
            </div>
            <div><label className="block text-sm font-semibold text-gray-600 mb-1">Description</label><textarea value={subjectForm.description} onChange={(e) => setSubjectForm(f => ({ ...f, description: e.target.value }))} rows={2} className={inputCls + ' resize-none'} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-sm font-semibold text-gray-600 mb-1">Emoji</label><input type="text" value={subjectForm.icon_emoji} onChange={(e) => setSubjectForm(f => ({ ...f, icon_emoji: e.target.value }))} className={inputCls} /></div>
              <div><label className="block text-sm font-semibold text-gray-600 mb-1">Color</label><div className="flex items-center gap-1.5"><input type="color" value={subjectForm.color} onChange={(e) => setSubjectForm(f => ({ ...f, color: e.target.value }))} className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5" /><input type="text" value={subjectForm.color} onChange={(e) => setSubjectForm(f => ({ ...f, color: e.target.value }))} className="flex-1 border border-gray-300 rounded-xl px-2 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-violet-300" /></div></div>
              <div><label className="block text-sm font-semibold text-gray-600 mb-1">Level</label><input type="text" value={subjectForm.level} onChange={(e) => setSubjectForm(f => ({ ...f, level: e.target.value }))} placeholder="e.g. SS3" className={inputCls} /></div>
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

      {/* Deactivate confirmation */}
      {showDeleteConfirm && showDeleteConfirm.action === 'deactivate' && (
        <Modal title="Deactivate Exam Type" onClose={() => setShowDeleteConfirm(null)}>
          <div className="text-center">
            <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="w-7 h-7 text-orange-500" /></div>
            <p className="text-gray-700 mb-1">Deactivate <span className="font-bold">"{showDeleteConfirm.name}"</span>?</p>
            <p className="text-sm text-gray-400 mb-2">All subjects under this exam type will also be deactivated automatically.</p>
            <p className="text-sm text-orange-600 bg-orange-50 rounded-xl px-4 py-2 mb-6">This works like a Recycle Bin — the exam type will be hidden from students but can be reactivated or permanently deleted afterwards.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl text-sm">Deactivate</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Subject deactivate confirmation */}
      {showDeleteConfirm && showDeleteConfirm.kind === 'subject' && (
        <Modal title="Deactivate Subject" onClose={() => setShowDeleteConfirm(null)}>
          <div className="text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-7 h-7 text-red-500" /></div>
            <p className="text-gray-700 mb-1">Deactivate <span className="font-bold">"{showDeleteConfirm.name}"</span>?</p>
            <p className="text-sm text-gray-400 mb-6">It will be hidden from students but not permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl text-sm">Deactivate</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Permanent delete confirmation */}
      {showDeleteConfirm && showDeleteConfirm.action === 'permanent' && (
        <Modal title="Permanently Delete" onClose={() => setShowDeleteConfirm(null)}>
          <div className="text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-7 h-7 text-red-600" /></div>
            <p className="text-gray-700 mb-1">Permanently delete <span className="font-bold">"{showDeleteConfirm.name}"</span>?</p>
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2 mb-6">⚠ This cannot be undone. The exam type and all its subjects will be removed from the database forever.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm">Yes, Delete Forever</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reactivate confirmation */}
      {showReactivateConfirm && (
        <Modal title="Reactivate Exam Type" onClose={() => setShowReactivateConfirm(null)}>
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-7 h-7 text-emerald-600" /></div>
            <p className="text-gray-700 mb-1">Reactivate <span className="font-bold">"{showReactivateConfirm.name}"</span>?</p>
            <p className="text-sm text-gray-400 mb-6">The exam type will become visible again. Individual subjects will need to be re-activated separately.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowReactivateConfirm(null)} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={confirmReactivate} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm">Reactivate</button>
            </div>
          </div>
        </Modal>
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ─── Topic / Subtopic Management Panel ────────────────────────────────────────
// Admin-only, independent of any teacher. Pick a subject, then create/rename/
// delete its topics and subtopics inline. Uses /api/teacher/topics and
// /api/teacher/subtopics — both endpoints already permit the admin role via
// the teacherOnly/teacherOrAdmin middleware in server/routes/teacherRoutes.js.
const TopicsPanel = () => {
  const [subjects,    setSubjects]    = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [selectedSub, setSelectedSub] = useState('');

  const [topics,      setTopics]      = useState([]);
  const [loadingTops, setLoadingTops] = useState(false);
  const [search,      setSearch]      = useState('');

  const [expandedId,  setExpandedId]  = useState(null);     // topic id currently expanded
  const [subtopics,   setSubtopics]   = useState({});       // topicId → array
  const [loadingSubt, setLoadingSubt] = useState({});       // topicId → bool

  const [newTopicName,  setNewTopicName]  = useState('');
  const [addingTopic,   setAddingTopic]   = useState(false);
  const [editTopic,     setEditTopic]     = useState(null); // { id, name }

  const [newSubName,    setNewSubName]    = useState({});   // topicId → string (draft)
  const [addingSubFor,  setAddingSubFor]  = useState(null); // topicId currently adding a subtopic
  const [editSub,       setEditSub]       = useState(null); // { topicId, id, name }

  const [busy,  setBusy]  = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  // Load every active subject once on mount
  useEffect(() => {
    api.get('/catalog/all-subjects')
      .then(r => setSubjects(r.data || []))
      .catch(() => showToast('Failed to load subjects', 'error'))
      .finally(() => setLoadingSubs(false));
  }, []);

  // Load topics whenever the selected subject changes
  useEffect(() => {
    setExpandedId(null);
    setSubtopics({});
    setSearch('');
    if (!selectedSub) { setTopics([]); return; }
    setLoadingTops(true);
    api.get(`/teacher/topics?subject_id=${selectedSub}`)
      .then(r => setTopics(r.data || []))
      .catch(() => showToast('Failed to load topics', 'error'))
      .finally(() => setLoadingTops(false));
  }, [selectedSub]);

  const loadSubtopics = (topicId) => {
    setLoadingSubt(p => ({ ...p, [topicId]: true }));
    api.get(`/teacher/subtopics?topic_id=${topicId}`)
      .then(r => setSubtopics(p => ({ ...p, [topicId]: r.data || [] })))
      .catch(() => showToast('Failed to load subtopics', 'error'))
      .finally(() => setLoadingSubt(p => ({ ...p, [topicId]: false })));
  };

  const toggleExpand = (topicId) => {
    const next = expandedId === topicId ? null : topicId;
    setExpandedId(next);
    if (next && !subtopics[next]) loadSubtopics(next);
  };

  // ── Topic CRUD ───────────────────────────────────────────────────────────────
  const createTopic = async () => {
    const name = newTopicName.trim();
    if (!name || !selectedSub) return;
    setBusy(true);
    try {
      const r = await api.post('/teacher/topics', { subject_id: selectedSub, name });
      setTopics(p => [...p, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTopicName(''); setAddingTopic(false);
      showToast('Topic created');
    } catch (err) { showToast(err?.message || 'Failed to create topic', 'error'); }
    finally { setBusy(false); }
  };

  const saveTopicEdit = async () => {
    if (!editTopic) return;
    const name = editTopic.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await api.put(`/teacher/topics/${editTopic.id}`, { name });
      setTopics(p => p.map(t => t.id === editTopic.id ? (r.data || { ...t, name }) : t));
      setEditTopic(null);
      showToast('Topic renamed');
    } catch (err) { showToast(err?.message || 'Failed to rename topic', 'error'); }
    finally { setBusy(false); }
  };

  const deleteTopic = async (topic) => {
    if (!window.confirm(`Delete topic "${topic.name}"? This will also remove its subtopics.`)) return;
    setBusy(true);
    try {
      await api.delete(`/teacher/topics/${topic.id}`);
      setTopics(p => p.filter(t => t.id !== topic.id));
      if (expandedId === topic.id) setExpandedId(null);
      showToast('Topic deleted');
    } catch (err) { showToast(err?.message || 'Failed to delete topic', 'error'); }
    finally { setBusy(false); }
  };

  // ── Subtopic CRUD ─────────────────────────────────────────────────────────────
  const createSubtopic = async (topicId) => {
    const name = (newSubName[topicId] || '').trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await api.post('/teacher/subtopics', { topic_id: topicId, subject_id: selectedSub, name });
      setSubtopics(p => ({ ...p, [topicId]: [...(p[topicId] || []), r.data].sort((a, b) => a.name.localeCompare(b.name)) }));
      setTopics(p => p.map(t => t.id === topicId ? { ...t, subtopic_count: (t.subtopic_count || 0) + 1 } : t));
      setNewSubName(p => ({ ...p, [topicId]: '' }));
      setAddingSubFor(null);
      showToast('Subtopic created');
    } catch (err) { showToast(err?.message || 'Failed to create subtopic', 'error'); }
    finally { setBusy(false); }
  };

  const saveSubEdit = async () => {
    if (!editSub) return;
    const name = editSub.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await api.put(`/teacher/subtopics/${editSub.id}`, { name });
      setSubtopics(p => ({
        ...p,
        [editSub.topicId]: (p[editSub.topicId] || []).map(s => s.id === editSub.id ? (r.data || { ...s, name }) : s),
      }));
      setEditSub(null);
      showToast('Subtopic renamed');
    } catch (err) { showToast(err?.message || 'Failed to rename subtopic', 'error'); }
    finally { setBusy(false); }
  };

  const deleteSubtopic = async (topicId, sub) => {
    if (!window.confirm(`Delete subtopic "${sub.name}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/teacher/subtopics/${sub.id}`);
      setSubtopics(p => ({ ...p, [topicId]: (p[topicId] || []).filter(s => s.id !== sub.id) }));
      setTopics(p => p.map(t => t.id === topicId ? { ...t, subtopic_count: Math.max(0, (t.subtopic_count || 1) - 1) } : t));
      showToast('Subtopic deleted');
    } catch (err) { showToast(err?.message || 'Failed to delete subtopic', 'error'); }
    finally { setBusy(false); }
  };

  const filteredTopics = search.trim()
    ? topics.filter(t => t.name.toLowerCase().includes(search.trim().toLowerCase()))
    : topics;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Topic &amp; Subtopic Management</h2>
        <p className="text-sm text-gray-400 mt-0.5">Create and manage curriculum structure for any subject, independent of teachers</p>
      </div>

      {/* Subject picker */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Subject</label>
        {loadingSubs ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={15} className="animate-spin" /> Loading subjects…</div>
        ) : (
          <select
            value={selectedSub}
            onChange={e => setSelectedSub(e.target.value)}
            className={inputCls}
          >
            <option value="">— Select a subject —</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.exam_board_code ? ` (${s.exam_board_code})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {!selectedSub ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
          <BookOpen size={28} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">Select a subject above to manage its topics and subtopics</p>
        </div>
      ) : loadingTops ? (
        <div className="flex items-center justify-center gap-2 py-14 text-gray-400 text-sm">
          <Loader2 size={18} className="animate-spin" /> Loading topics…
        </div>
      ) : (
        <>
          {/* Search + Add Topic */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search topics…"
                className={`${inputCls} pl-9`}
              />
            </div>
            <button
              onClick={() => { setAddingTopic(true); setNewTopicName(''); }}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl whitespace-nowrap transition-colors"
            >
              <Plus size={15} /> Add Topic
            </button>
          </div>

          {/* New topic form */}
          {addingTopic && (
            <div className="flex items-center gap-2 mb-3 p-3 bg-violet-50 border border-violet-200 rounded-xl">
              <input
                autoFocus
                value={newTopicName}
                onChange={e => setNewTopicName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createTopic();
                  if (e.key === 'Escape') setAddingTopic(false);
                }}
                placeholder="Topic name…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <button onClick={createTopic} disabled={busy || !newTopicName.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
              </button>
              <button onClick={() => setAddingTopic(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={15} />
              </button>
            </div>
          )}

          {filteredTopics.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <p className="text-sm text-gray-400">
                {search ? `No topics matching "${search}"` : 'No topics yet for this subject. Add one above.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTopics.map(topic => {
                const isOpen = expandedId === topic.id;
                const subs   = subtopics[topic.id] || [];
                const subBusy = !!loadingSubt[topic.id];

                return (
                  <div key={topic.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                    {/* Topic row */}
                    <div className="flex items-center gap-2 px-3 py-3">
                      <button onClick={() => toggleExpand(topic.id)} className="shrink-0 text-gray-300 hover:text-gray-500">
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>

                      {editTopic?.id === topic.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            autoFocus
                            value={editTopic.name}
                            onChange={e => setEditTopic({ ...editTopic, name: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') saveTopicEdit(); if (e.key === 'Escape') setEditTopic(null); }}
                            className="flex-1 border border-violet-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                          />
                          <button onClick={saveTopicEdit} disabled={busy} className="bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                            {busy ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
                          </button>
                          <button onClick={() => setEditTopic(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => toggleExpand(topic.id)} className="flex-1 text-left">
                            <span className="text-sm font-semibold text-gray-800">{topic.name}</span>
                            <span className="ml-2 text-xs text-gray-400">
                              {(topic.subtopic_count ?? subs.length)} subtopic{(topic.subtopic_count ?? subs.length) === 1 ? '' : 's'}
                            </span>
                          </button>
                          <button onClick={() => setEditTopic({ id: topic.id, name: topic.name })}
                            className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Rename topic">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => deleteTopic(topic)}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete topic">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Subtopics */}
                    {isOpen && (
                      <div className="border-t border-gray-100 bg-gray-50 px-4 pt-2 pb-3">
                        {subBusy ? (
                          <div className="flex items-center gap-1.5 py-2 text-gray-400 text-xs">
                            <Loader2 size={13} className="animate-spin" /> Loading subtopics…
                          </div>
                        ) : (
                          <div className="space-y-1.5 mb-2">
                            {subs.map(sub => (
                              <div key={sub.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-300 shrink-0" />
                                {editSub?.id === sub.id ? (
                                  <div className="flex items-center gap-1.5 flex-1">
                                    <input
                                      autoFocus
                                      value={editSub.name}
                                      onChange={e => setEditSub({ ...editSub, name: e.target.value })}
                                      onKeyDown={e => { if (e.key === 'Enter') saveSubEdit(); if (e.key === 'Escape') setEditSub(null); }}
                                      className="flex-1 border border-violet-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-violet-300"
                                    />
                                    <button onClick={saveSubEdit} disabled={busy} className="bg-violet-600 text-white px-2 py-1 rounded-md text-xs font-semibold disabled:opacity-50">
                                      {busy ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
                                    </button>
                                    <button onClick={() => setEditSub(null)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="flex-1 text-xs text-gray-700">{sub.name}</span>
                                    <button onClick={() => setEditSub({ topicId: topic.id, id: sub.id, name: sub.name })}
                                      className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors">
                                      <Pencil size={12} />
                                    </button>
                                    <button onClick={() => deleteSubtopic(topic.id, sub)}
                                      className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                      <Trash2 size={12} />
                                    </button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add subtopic */}
                        {addingSubFor === topic.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={newSubName[topic.id] || ''}
                              onChange={e => setNewSubName(p => ({ ...p, [topic.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') createSubtopic(topic.id); if (e.key === 'Escape') setAddingSubFor(null); }}
                              placeholder="Subtopic name…"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                            />
                            <button onClick={() => createSubtopic(topic.id)} disabled={busy || !(newSubName[topic.id] || '').trim()}
                              className="bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button onClick={() => setAddingSubFor(null)} className="text-gray-400 hover:text-gray-600 p-1">
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAddingSubFor(topic.id); if (!subtopics[topic.id]) loadSubtopics(topic.id); }}
                            className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 font-semibold"
                          >
                            <Plus size={13} /> Add subtopic
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
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
  const [showCreateTeacher, setShowCreateTeacher] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [creatingTeacher, setCreatingTeacher] = useState(false);
  const [toast,       setToast]       = useState(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);
  const [form, setForm] = useState({ teacher_id: '', exam_type_id: '' });
  const [teacherForm, setTeacherForm] = useState({ first_name: '', last_name: '', email: '', password: '' });
  // Issue 2: edit-assignment modal state
  const [editingAssignment, setEditingAssignment] = useState(null); // { id, teacher_id, subject_id, exam_board_code, ... }
  const [editExamTypeId,    setEditExamTypeId]    = useState('');
  const [editSubjectId,     setEditSubjectId]     = useState('');
  const [editSubjects,      setEditSubjects]      = useState([]);
  const [editLoadingSubjects, setEditLoadingSubjects] = useState(false);
  const [editSaving,        setEditSaving]        = useState(false);
  const { examTypes, loadingTypes, fetchSubjectsForType, invalidateCache } = useCatalog();

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  const fetchAll = async () => {
    setLoading(true);
    // Use allSettled so a failing assignments query never prevents teachers from loading
    const [aRes, tRes] = await Promise.allSettled([
      api.get('/admin/teacher-assignments'),
      api.get('/users?role=teacher'),
    ]);
    if (aRes.status === 'fulfilled' && aRes.value?.success) setAssignments(aRes.value.data || []);
    else if (aRes.status === 'rejected') console.warn('[TeacherAssignment] assignments load failed:', aRes.reason?.error || aRes.reason);
    if (tRes.status === 'fulfilled' && tRes.value?.data)    setTeachers(tRes.value.data || []);
    else if (tRes.status === 'rejected') console.warn('[TeacherAssignment] teachers load failed:', tRes.reason?.error || tRes.reason);
    setLoading(false);
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
    } catch (err) { showToast(err?.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this assignment?')) return;
    try { await api.delete(`/admin/teacher-assignments/${id}`); showToast('Assignment removed'); fetchAll(); }
    catch { showToast('Failed to remove', 'error'); }
  };

  // Issue 2: edit-assignment flow — swap which subject an existing
  // assignment row covers, without deleting and recreating it.
  const openEditAssignment = async (a) => {
    setEditingAssignment(a);
    setEditExamTypeId('');
    setEditSubjectId(String(a.subject_id));
    setEditSubjects([]);
    // Pre-select the exam type matching this assignment's current exam board,
    // then load that exam type's subjects so the dropdown is pre-populated.
    const matchingType = examTypes.find(et => et.code === a.exam_board_code);
    if (matchingType) {
      setEditExamTypeId(String(matchingType.id));
      setEditLoadingSubjects(true);
      try {
        const subjects = await fetchSubjectsForType(matchingType.id);
        setEditSubjects(subjects);
      } catch { showToast('Failed to load subjects', 'error'); }
      finally { setEditLoadingSubjects(false); }
    }
  };

  const handleEditExamTypeChange = async (typeId) => {
    setEditExamTypeId(typeId);
    setEditSubjectId('');
    setEditSubjects([]);
    if (!typeId) return;
    setEditLoadingSubjects(true);
    try { const subjects = await fetchSubjectsForType(typeId); setEditSubjects(subjects); }
    catch { showToast('Failed to load subjects', 'error'); }
    finally { setEditLoadingSubjects(false); }
  };

  const handleSaveEdit = async () => {
    if (!editingAssignment || !editSubjectId) { showToast('Please select a subject', 'error'); return; }
    if (String(editSubjectId) === String(editingAssignment.subject_id)) {
      // No actual change — just close
      setEditingAssignment(null);
      return;
    }
    setEditSaving(true);
    try {
      await api.put(`/admin/teacher-assignments/${editingAssignment.id}`, { subject_id: editSubjectId });
      showToast('Assignment updated');
      setEditingAssignment(null);
      fetchAll();
    } catch (err) { showToast(err?.message || 'Failed to update assignment', 'error'); }
    finally { setEditSaving(false); }
  };

  const handleCreateTeacher = async () => {
    const { first_name, last_name, email, password } = teacherForm;
    if (!first_name.trim() || !email.trim() || !password.trim()) { showToast('First name, email and password are required', 'error'); return; }
    setCreatingTeacher(true);
    try {
      await api.post('/admin/create-teacher', { first_name: first_name.trim(), last_name: last_name.trim(), email: email.trim(), password });
      showToast(`Teacher account created for ${email}`);
      setShowCreateTeacher(false);
      setTeacherForm({ first_name: '', last_name: '', email: '', password: '' });
      fetchAll();
    } catch (err) { showToast(err?.message || 'Failed to create teacher', 'error'); }
    finally { setCreatingTeacher(false); }
  };

  const handleToggleActive = async (teacher) => {
    const newState = !teacher.is_active;
    const action   = newState ? 'reactivate' : 'deactivate';
    if (!window.confirm(`${newState ? 'Reactivate' : 'Deactivate'} ${teacher.name || teacher.email}? ${newState ? 'They will be able to log in again.' : 'They will be unable to log in until reactivated.'}`)) return;
    try {
      await api.put(`/users/${teacher.id}/deactivate`, { is_active: newState });
      showToast(`${teacher.name || teacher.email} ${newState ? 'reactivated' : 'deactivated'}`);
      // Update local state immediately — no need to re-fetch everything
      setTeachers(prev => prev.map(t => t.id === teacher.id ? { ...t, is_active: newState } : t));
    } catch (err) { showToast(err?.message || `Failed to ${action} teacher`, 'error'); }
  };

  const handleDeleteTeacher = async (teacher) => {
    if (!window.confirm(`Permanently delete ${teacher.name || teacher.email}?\n\nThis cannot be undone. All their subject assignments will also be removed.`)) return;
    try {
      await api.delete(`/users/${teacher.id}`);
      showToast(`${teacher.name || teacher.email} deleted`);
      fetchAll();
    } catch (err) { showToast(err?.message || 'Failed to delete teacher', 'error'); }
  };

  // Merge ALL teachers with their assignments — shows unassigned teachers too
  const assignedTeacherIds = new Set(assignments.map(a => a.teacher_id));
  const byTeacher = assignments.reduce((acc, a) => {
    const key = a.teacher_id || a.teacher_name;
    if (!acc[key]) {
      // Find the matching teacher record to get is_active
      const teacherRecord = teachers.find(t => t.id === a.teacher_id);
      acc[key] = { id: a.teacher_id, name: a.teacher_name, email: a.email, rows: [], is_active: teacherRecord?.is_active ?? true };
    }
    acc[key].rows.push(a);
    return acc;
  }, {});
  // Add teachers with no assignments
  teachers.forEach(t => {
    if (!assignedTeacherIds.has(t.id)) {
      byTeacher[t.id] = { id: t.id, name: `${t.first_name || ''} ${t.last_name || ''}`.trim(), email: t.email, rows: [], is_active: t.is_active ?? true };
    }
  });

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-7 h-7 text-violet-400 animate-spin mr-3" /><span className="text-gray-500">Loading…</span></div>;

  return (
    <div>
      {toast && <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-violet-600'}`}>{toast.msg}</div>}
      <div className="flex items-center justify-between mb-5">
        <div><h2 className="text-xl font-bold text-gray-900">Teacher Management</h2><p className="text-sm text-gray-500 mt-0.5">Create teachers and assign them to subjects</p></div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl"><RefreshCw size={14} /> Refresh</button>
          <button onClick={() => setShowCreateTeacher(true)} className="flex items-center gap-1.5 text-sm border border-violet-300 text-violet-700 hover:bg-violet-50 px-4 py-2 rounded-xl font-semibold"><Plus size={14} /> Create Teacher</button>
          <button onClick={() => { setForm({ teacher_id: '', exam_type_id: '' }); setSelectedSubjectIds([]); setFilteredSubjects([]); setShowModal(true); }} className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl font-semibold"><Plus size={14} /> Add Assignment</button>
        </div>
      </div>

      {Object.keys(byTeacher).length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <UserCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">No teachers yet.</p>
          <p className="text-xs">Create a teacher account first, then assign them to subjects.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(byTeacher).map(teacher => (
            <div key={teacher.email} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
              {/* Teacher header row */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    teacher.is_active === false ? 'bg-gray-100 text-gray-400' : 'bg-violet-100 text-violet-700'
                  }`}>
                    {(teacher.name || teacher.email || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${teacher.is_active === false ? 'text-gray-400' : 'text-gray-900'}`}>{teacher.name || '—'}</p>
                      {teacher.is_active === false && (
                        <span className="text-[10px] font-bold bg-red-50 text-red-500 border border-red-100 px-1.5 py-0.5 rounded-full">Deactivated</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{teacher.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {teacher.rows.length === 0
                    ? <span className="text-xs text-amber-500 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">No subjects assigned</span>
                    : <span className="text-xs text-gray-400">{teacher.rows.length} assignment{teacher.rows.length !== 1 ? 's' : ''}</span>
                  }
                  {/* Deactivate / Reactivate */}
                  <button
                    onClick={() => handleToggleActive(teacher)}
                    title={teacher.is_active === false ? 'Reactivate this teacher' : 'Deactivate this teacher'}
                    className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                      teacher.is_active === false
                        ? 'border-green-200 text-green-600 hover:bg-green-50'
                        : 'border-amber-200 text-amber-600 hover:bg-amber-50'
                    }`}>
                    {teacher.is_active === false
                      ? <><UserCheck size={12} /> Reactivate</>
                      : <><UserX     size={12} /> Deactivate</>
                    }
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteTeacher(teacher)}
                    title="Permanently delete this teacher account"
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
              {/* Subject chips */}
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {teacher.rows.length === 0 && (
                  <p className="text-xs text-gray-400 italic">This teacher has no subject assignments yet. Use "Add Assignment" to assign them.</p>
                )}
                {teacher.rows.map(a => (
                  <span key={a.id}
                    className="inline-flex items-center gap-1.5 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-full">
                    {a.subject_name}
                    {a.exam_board_code && <span className="text-violet-400">· {a.exam_board_code}</span>}
                    {a.is_active && (
                      <>
                        <button onClick={() => openEditAssignment(a)}
                          className="ml-0.5 text-violet-300 hover:text-violet-600 transition-colors" title="Edit subject">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => handleRemove(a.id)}
                          className="text-violet-300 hover:text-red-500 transition-colors" title="Remove">
                          ×
                        </button>
                      </>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Assignment Modal — Issue 2 */}
      {editingAssignment && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Edit Assignment</h3>
              <button onClick={() => setEditingAssignment(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Changing the subject for <span className="font-semibold text-gray-700">{editingAssignment.teacher_name}</span>.
              Currently assigned to <span className="font-semibold text-violet-700">{editingAssignment.subject_name}</span>.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Type</label>
                <select value={editExamTypeId} onChange={e => handleEditExamTypeChange(e.target.value)} className={inputCls}>
                  <option value="">Select exam type…</option>
                  {loadingTypes
                    ? <option disabled>Loading…</option>
                    : examTypes.filter(et => et.is_active !== false).map(et =>
                        <option key={et.id} value={et.id}>{et.name} ({et.code})</option>
                      )
                  }
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">New Subject *</label>
                {!editExamTypeId ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">Select an exam type above</div>
                ) : (
                  <select value={editSubjectId} onChange={e => setEditSubjectId(e.target.value)} className={inputCls}>
                    <option value="">Select subject…</option>
                    {editLoadingSubjects
                      ? <option disabled>Loading subjects…</option>
                      : editSubjects.length === 0
                        ? <option disabled>No subjects found</option>
                        : editSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                    }
                  </select>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditingAssignment(null)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl border border-gray-200">Cancel</button>
              <button onClick={handleSaveEdit} disabled={editSaving || !editSubjectId}
                className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-semibold">
                {editSaving && <Loader2 size={14} className="animate-spin" />} Save Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Teacher Modal */}
      {showCreateTeacher && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Create Teacher Account</h3>
              <button onClick={() => setShowCreateTeacher(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
                  <input value={teacherForm.first_name} onChange={e => setTeacherForm(f => ({...f, first_name: e.target.value}))}
                    placeholder="Ada" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
                  <input value={teacherForm.last_name} onChange={e => setTeacherForm(f => ({...f, last_name: e.target.value}))}
                    placeholder="Obi" className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
                <input type="email" value={teacherForm.email} onChange={e => setTeacherForm(f => ({...f, email: e.target.value}))}
                  placeholder="teacher@school.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Password *</label>
                <input type="password" value={teacherForm.password} onChange={e => setTeacherForm(f => ({...f, password: e.target.value}))}
                  placeholder="Min 8 characters" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreateTeacher} disabled={creatingTeacher}
                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                {creatingTeacher ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Plus size={14} /> Create Teacher</>}
              </button>
              <button onClick={() => setShowCreateTeacher(false)}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold py-2.5 rounded-xl text-sm">
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-3 text-center">
              Teacher will be able to log in immediately. Share credentials with them.
            </p>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
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

const AIGeneratePanel = ({ setActivePanel }) => {
  const [subjects,   setSubjects]   = useState([]);
  const [topics,     setTopics]     = useState([]);
  const [subtopics,  setSubtopics]  = useState([]);
  const [subjectsLoad, setSubjectsLoad] = useState(false);
  const [topicsLoad,   setTopicsLoad]   = useState(false);
  const [subtopicsLoad,setSubtopicsLoad]= useState(false);
  const [pendingCount, setPendingCount] = useState(null);
  const [form, setForm] = useState({
    exam_type_id: '', subject_id: '', topic_id: '', topic: '',
    subtopic_id: '', exam_board: '', count: 10, difficulty: 'medium',
  });
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [previewQuestions, setPreviewQuestions] = useState([]);
  const [newSubtopicName, setNewSubtopicName] = useState('');
  const [creatingSubtopic, setCreatingSubtopic] = useState(false);
  const { examTypes, loadingTypes: examTypesLoad, fetchSubjectsForType } = useCatalog();
  const navigate = useNavigate();

  useEffect(() => { api.get('/admin/questions/pending-count').then(r => setPendingCount(r.count)).catch(() => {}); }, []);

  const handleExamTypeChange = async (typeId) => {
    const chosen = examTypes.find(et => String(et.id) === String(typeId));
    setForm(f => ({ ...f, exam_type_id: typeId, subject_id: '', topic_id: '', topic: '', subtopic_id: '', exam_board: chosen?.code || '' }));
    setSubjects([]); setTopics([]); setSubtopics([]);
    if (!typeId) return;
    setSubjectsLoad(true);
    try { const raw = await fetchSubjectsForType(typeId); setSubjects([...new Map(raw.map(s => [s.id, s])).values()]); }
    catch { setError('Failed to load subjects.'); }
    finally { setSubjectsLoad(false); }
  };

  const handleSubjectChange = async (subjectId) => {
    setForm(f => ({ ...f, subject_id: subjectId, topic_id: '', topic: '', subtopic_id: '' }));
    setTopics([]); setSubtopics([]);
    if (!subjectId) return;
    setTopicsLoad(true);
    try {
      const res = await api.get(`/teacher/topics?subject_id=${subjectId}`).catch(() => ({ data: [] }));
      setTopics(res?.data || []);
    } catch { setTopics([]); }
    finally { setTopicsLoad(false); }
  };

  const handleTopicChange = async (topicId) => {
    const chosen = topics.find(t => String(t.id) === String(topicId));
    setForm(f => ({ ...f, topic_id: topicId, topic: chosen?.name || '', subtopic_id: '' }));
    setSubtopics([]); setNewSubtopicName('');
    if (!topicId) return;
    setSubtopicsLoad(true);
    try {
      const res = await api.get(`/teacher/subtopics?topic_id=${topicId}`).catch(() => ({ data: [] }));
      setSubtopics(res?.data || []);
    } catch { setSubtopics([]); }
    finally { setSubtopicsLoad(false); }
  };

  const handleCreateSubtopic = async () => {
    if (!newSubtopicName.trim() || !form.topic_id) return;
    setCreatingSubtopic(true);
    try {
      const r = await api.post('/teacher/subtopics', {
        topic_id: form.topic_id,
        name: newSubtopicName.trim(),
      });
      const created = r?.data || r;
      if (created?.id) {
        const newSt = { id: created.id, name: newSubtopicName.trim() };
        setSubtopics([newSt]);
        setForm(f => ({ ...f, subtopic_id: String(created.id) }));
        setNewSubtopicName('');
      } else {
        setError('Subtopic created but response was unexpected. Refresh and try again.');
      }
    } catch (err) {
      setError(err?.message || 'Failed to create subtopic.');
    } finally {
      setCreatingSubtopic(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.exam_type_id) { setError('Please select an exam type first.'); return; }
    if (!form.subject_id)   { setError('Please select a subject.'); return; }
    if (!form.topic.trim()) { setError('Please select a topic.'); return; }
    setError(''); setResult(null); setPreviewQuestions([]); setGenerating(true);
    try {
      const res = await api.post('/admin/generate-questions', {
        subject_id:  form.subject_id,
        topic:       form.topic,
        subtopic_id: form.subtopic_id || undefined,
        exam_board:  form.exam_board,
        count:       form.count,
        difficulty:  form.difficulty,
      }, { timeout: TIMEOUT_AI_GENERATE });
      setResult(res);
      const qs = res?.data?.questions ?? res?.questions ?? [];
      if (Array.isArray(qs)) setPreviewQuestions(qs);
      const inserted = res?.data?.inserted ?? res?.inserted ?? 0;
      setPendingCount(c => (c || 0) + inserted);
    } catch (err) { setError(err?.message || 'Generation failed.'); }
    finally { setGenerating(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-violet-500" /><h3 className="font-bold text-gray-900">AI Question Generator</h3></div>
        {pendingCount !== null && <a href="/admin/questions/review" className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full hover:bg-amber-200"><Zap size={12} />{pendingCount} pending review</a>}
      </div>
      <form onSubmit={handleGenerate} className="space-y-4 max-w-lg">

        {/* Exam Type */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Exam Type *</label>
          <select value={form.exam_type_id} onChange={e => handleExamTypeChange(e.target.value)} className={inputCls} required>
            <option value="">Select exam type first…</option>
            {examTypesLoad ? <option disabled>Loading…</option> : examTypes.filter(et => et.is_active !== false).map(et => <option key={et.id} value={et.id}>{safeEmoji(et.icon_emoji) ? safeEmoji(et.icon_emoji) + ' ' : ''}{et.name} ({et.code})</option>)}
          </select>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Subject *</label>
          {!form.exam_type_id
            ? <div className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">Select an exam type above</div>
            : <select value={form.subject_id} onChange={e => handleSubjectChange(e.target.value)} className={inputCls} required>
                <option value="">Select subject…</option>
                {subjectsLoad ? <option disabled>Loading subjects…</option> : subjects.length === 0 ? <option disabled>No subjects found</option> : subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
          }
        </div>

        {/* Topic — dropdown, cascades from Subject */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Topic *</label>
          {!form.subject_id
            ? <div className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400">Select a subject above</div>
            : topicsLoad
              ? <div className={inputCls + ' text-gray-400'}>Loading topics…</div>
              : topics.length === 0
                ? <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                    ⚠ This subject has no topics yet. Create topics first in the <button type="button" onClick={() => setActivePanel('catalog')} className="underline font-semibold">Catalog panel</button>.
                  </div>
                : <select value={form.topic_id} onChange={e => handleTopicChange(e.target.value)} className={inputCls} required>
                    <option value="">Select topic…</option>
                    {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
          }
        </div>

        {/* Subtopic — dropdown, cascades from Topic */}
        {form.topic_id && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Subtopic <span className="text-red-500">*</span>
              <span className="ml-1 text-gray-400 font-normal">(required — without this, students will not see questions in their quiz)</span>
            </label>
            {subtopicsLoad
              ? <div className={inputCls + ' text-gray-400'}>Loading subtopics…</div>
              : subtopics.length === 0
                ? <div className="space-y-2">
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      No subtopics yet for this topic. Create one below — it will be saved and questions will link to it automatically.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSubtopicName}
                        onChange={e => setNewSubtopicName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateSubtopic(); } }}
                        placeholder="e.g. Acid"
                        className={inputCls + ' flex-1'}
                      />
                      <button
                        type="button"
                        onClick={handleCreateSubtopic}
                        disabled={creatingSubtopic || !newSubtopicName.trim()}
                        className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
                      >
                        {creatingSubtopic ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        {creatingSubtopic ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                  </div>
                : <select value={form.subtopic_id} onChange={e => setForm(f => ({ ...f, subtopic_id: e.target.value }))} className={inputCls} required>
                    <option value="">Select subtopic…</option>
                    {subtopics.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
            }
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Difficulty</label><select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))} className={inputCls}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Count</label><select value={form.count} onChange={e => setForm(f => ({ ...f, count: Number(e.target.value) }))} className={inputCls}><option value={5}>5</option><option value={10}>10</option><option value={15}>15</option></select></div>
        </div>

        {error && <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm"><AlertTriangle size={14} /> {error}</div>}
        {result && <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm"><Check size={14} /> {result.message || 'Questions generated successfully!'}</div>}

        <button type="submit" disabled={generating || !form.subtopic_id} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-xl text-sm">
          {generating ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate Questions</>}
        </button>
        {!form.subtopic_id && form.topic_id && subtopics.length > 0 && (
          <p className="text-xs text-amber-600">Please select a subtopic to enable generation.</p>
        )}
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
// ─── Audit Log Panel ──────────────────────────────────────────────────────────
const AuditLogPanel = () => {
  const LIMIT = 50;

  // ── All Logs tab state
  const [logs,       setLogs]       = useState([]);
  const [logsTotal,  setLogsTotal]  = useState(0);
  const [logsPage,   setLogsPage]   = useState(1);
  const [loadingL,   setLoadingL]   = useState(true);
  const [actionF,    setActionF]    = useState('');
  const [severityF,  setSeverityF]  = useState('');

  // ── Security Events tab state
  const [secLogs,    setSecLogs]    = useState([]);
  const [secTotal,   setSecTotal]   = useState(0);
  const [secPage,    setSecPage]    = useState(1);
  const [loadingS,   setLoadingS]   = useState(true);
  const [secHours,   setSecHours]   = useState(24);

  const [tab,        setTab]        = useState('logs'); // 'logs' | 'security'
  const [toast,      setToast]      = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Fetch all logs
  const fetchLogs = async (pg = logsPage) => {
    setLoadingL(true);
    try {
      const params = { page: pg, limit: LIMIT };
      if (actionF)   params.action   = actionF;
      if (severityF) params.severity = severityF;
      const r = await api.get('/audit/logs', { params });
      setLogs(r.data || []);
      setLogsTotal(r.meta?.total || 0);
    } catch {
      showToast('Failed to load audit logs', 'error');
    } finally {
      setLoadingL(false);
    }
  };

  // ── Fetch security events
  const fetchSecurity = async (pg = secPage) => {
    setLoadingS(true);
    try {
      const r = await api.get('/audit/security', { params: { page: pg, limit: LIMIT, hours: secHours } });
      setSecLogs(r.data || []);
      setSecTotal(r.meta?.total || 0);
    } catch {
      showToast('Failed to load security events', 'error');
    } finally {
      setLoadingS(false);
    }
  };

  useEffect(() => { fetchLogs(1); setLogsPage(1); }, [actionF, severityF]);   // eslint-disable-line
  useEffect(() => { if (tab === 'logs')     fetchLogs(logsPage);   }, [logsPage]);   // eslint-disable-line
  useEffect(() => { if (tab === 'security') fetchSecurity(secPage); }, [secPage]);   // eslint-disable-line
  useEffect(() => { if (tab === 'security') { fetchSecurity(1); setSecPage(1); } }, [tab, secHours]); // eslint-disable-line
  useEffect(() => { fetchLogs(); fetchSecurity(); }, []); // eslint-disable-line

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleString('en-NG', {
      day: '2-digit', month: 'short', year: '2-digit',
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }) : '—';

  const severityBadge = (s) => ({
    info:     'bg-gray-100 text-gray-600',
    warning:  'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  }[s] || 'bg-gray-100 text-gray-500');

  const ALL_ACTIONS = [
    'LOGIN','LOGIN_FAILED','LOGOUT','USER_CREATE','USER_UPDATE',
    'USER_DELETE','USER_RESTORE','ROLE_CHANGE','USER_DEACTIVATE',
    'USER_REACTIVATE','TEACHER_CREATE','COURSE_APPROVE','QUESTION_APPROVE',
    'QUESTION_REJECT','NOTIFICATION_SEND','SETTINGS_CHANGE','RESOURCE_PURGE',
    'IDOR_ATTEMPT','RATE_LIMIT_HIT','UNAUTHORIZED_ACCESS','SUSPICIOUS_ACTIVITY',
  ];

  const LogTable = ({ rows, loading, total, page, setPage }) => {
    const totalPages = Math.ceil(total / LIMIT);
    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>;
    if (rows.length === 0) return <div className="text-center py-12 text-gray-400 text-sm">No events found.</div>;
    return (
      <>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-400 font-medium">
              <tr>
                <th className="text-left px-3 py-2.5 whitespace-nowrap">Time</th>
                <th className="text-left px-3 py-2.5 whitespace-nowrap">Actor</th>
                <th className="text-left px-3 py-2.5 whitespace-nowrap">Action</th>
                <th className="text-left px-3 py-2.5 whitespace-nowrap hidden sm:table-cell">Target</th>
                <th className="text-left px-3 py-2.5 whitespace-nowrap">Severity</th>
                <th className="text-left px-3 py-2.5 whitespace-nowrap hidden md:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(log => (
                <tr key={log.id} className="bg-white hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{fmtDate(log.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-800 truncate max-w-[140px]">{log.actor_email || '—'}</p>
                    <p className="text-gray-400">{log.actor_role || ''}</p>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-gray-700 whitespace-nowrap">{log.action}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-gray-500 truncate max-w-[120px]">
                    {log.target_email || log.target_id || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${severityBadge(log.severity)}`}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-gray-400 font-mono">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-400">Page {page} of {totalPages} · {total} events</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="text-sm px-3 py-1.5 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50">← Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="text-sm px-3 py-1.5 border border-gray-200 rounded-xl disabled:opacity-40 hover:bg-gray-50">Next →</button>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={20} className="text-violet-500" /> Audit Log
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">All admin and security events — append-only, tamper-resistant</p>
        </div>
        <button
          onClick={() => { fetchLogs(1); fetchSecurity(1); }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 mb-5">
        {[
          { id: 'logs',     label: `All Events (${logsTotal})` },
          { id: 'security', label: `Security Events (${secTotal})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-violet-500 text-violet-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* All Logs Tab */}
      {tab === 'logs' && (
        <>
          <div className="flex gap-3 mb-4 flex-wrap">
            <select value={actionF} onChange={e => { setActionF(e.target.value); setLogsPage(1); }}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value="">All Actions</option>
              {ALL_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={severityF} onChange={e => { setSeverityF(e.target.value); setLogsPage(1); }}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value="">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            {(actionF || severityF) && (
              <button onClick={() => { setActionF(''); setSeverityF(''); setLogsPage(1); }}
                className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <X size={13} /> Clear filters
              </button>
            )}
          </div>
          <LogTable rows={logs} loading={loadingL} total={logsTotal} page={logsPage} setPage={setLogsPage} />
        </>
      )}

      {/* Security Events Tab */}
      {tab === 'security' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-gray-500">Show last</label>
            <select value={secHours} onChange={e => setSecHours(Number(e.target.value))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
              <option value={720}>30 days</option>
            </select>
            {secTotal === 0 && !loadingS && (
              <span className="text-sm text-emerald-600 font-medium">✓ No security events in this period</span>
            )}
          </div>
          <LogTable rows={secLogs} loading={loadingS} total={secTotal} page={secPage} setPage={setSecPage} />
        </>
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
  // Issue 3: edit user (name/email) modal state
  const [editingUser, setEditingUser]   = useState(null); // { id, email, first_name, last_name }
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName,  setEditLastName]  = useState('');
  const [editEmail,     setEditEmail]     = useState('');
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState('');

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => { api.get('/users/stats').then(r => { if (r.success) setUserStats(r.data); }).catch(() => {}); }, []);
  useEffect(() => { const timer = setTimeout(() => fetchUsers(), 300); return () => clearTimeout(timer); }, [search, roleFilter, page]);

  const fetchUsers = async () => {
    setLoading(true);
    try { const r = await api.get('/users', { params: { search, role: roleFilter, page, limit: LIMIT } }); setUsers(r.data || []); setTotal(r.meta?.total || r.total || 0); }
    catch { setUsers([]); }
    finally { setLoading(false); }
  };

  const changeRole    = async (userId, role)           => { try { await api.put(`/users/${userId}/role`, { role }); showToast(`Role updated to ${role}`); fetchUsers(); } catch { showToast('Failed to update role', 'error'); } };
  const toggleActive  = async (userId, currentActive)  => { try { await api.put(`/users/${userId}/deactivate`, { is_active: !currentActive }); showToast(!currentActive ? 'User activated' : 'User deactivated'); fetchUsers(); } catch { showToast('Failed to update user status', 'error'); } };
  const deleteUser    = async (userId, email)          => {
    if (!window.confirm(`Delete "${email}"? Cannot be undone.`)) return;
    try { await api.delete(`/users/${userId}`, { headers: { 'X-Admin-Action': '1' } }); showToast(`User ${email} deleted`); fetchUsers(); } catch (err) { showToast(err?.message || 'Failed to delete', 'error'); }
  };

  // Issue 3: edit name/email — fix a typo without deactivate/role/delete.
  const openEditUser = (u) => {
    setEditingUser(u);
    setEditFirstName(u.first_name || '');
    setEditLastName(u.last_name || '');
    setEditEmail(u.email || '');
    setEditError('');
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    setEditError('');
    if (!editFirstName.trim()) { setEditError('First name cannot be empty'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail.trim())) { setEditError('Invalid email format'); return; }

    setEditSaving(true);
    try {
      await api.put(`/users/${editingUser.id}/profile`, {
        first_name: editFirstName.trim(),
        last_name:  editLastName.trim(),
        email:      editEmail.trim(),
      });
      showToast('Profile updated');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setEditError(err?.message || 'Failed to update profile');
    } finally {
      setEditSaving(false);
    }
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
                        <button onClick={() => openEditUser(u)} title="Edit name/email" className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-violet-100 hover:text-violet-600"><Pencil size={12} /></button>
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

      {/* Edit User Modal — Issue 3: fix typo'd name/email */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name *</label>
                  <input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
                  <input value={editLastName} onChange={e => setEditLastName(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email *</label>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className={inputCls} />
              </div>
              {editError && <p className="text-xs text-red-500">{editError}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditingUser(null)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-xl border border-gray-200">Cancel</button>
              <button onClick={handleSaveEditUser} disabled={editSaving}
                className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-semibold">
                {editSaving && <Loader2 size={14} className="animate-spin" />} Save Changes
              </button>
            </div>
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
  const [digestSending, setDigestSending] = useState(false);

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  const sendNotification = async () => {
    if (!notifTitle.trim() || !notifMessage.trim()) { showToast('Title and message are required', 'error'); return; }
    setNotifSending(true);
    try { const res = await api.post('/admin/send-notification', { target: notifTarget, title: notifTitle.trim(), message: notifMessage.trim() }); const sent = res.sent ?? res.data?.sent ?? 0; const emailOk = res.email_enabled ?? res.data?.email_enabled ?? false; showToast(emailOk ? `Notification sent to ${sent} user(s).` : `Notification saved for ${sent} user(s). ⚠ Email delivery is not configured on this server.`); setNotifModal(false); setNotifTitle(''); setNotifMessage(''); setNotifTarget('all'); }
    catch (err) { showToast(err?.message || 'Failed to send notification', 'error'); }
    finally { setNotifSending(false); }
  };

  const sendDigestNow = async () => {
    if (digestSending) return;
    if (!window.confirm('Send this week\'s digest email to all eligible active students now?')) return;
    setDigestSending(true);
    try {
      const res = await api.post('/admin/send-weekly-digest');
      const message = res.message ?? res.data?.message ?? 'Weekly digest sent.';
      showToast(message);
    } catch (err) {
      showToast(err?.message || 'Failed to send weekly digest', 'error');
    } finally {
      setDigestSending(false);
    }
  };

  const fetchStats = async () => {
    setLoading(true); setError(null);
    try { const res = await api.get('/admin/platform-stats'); if (res?.success) setStats(res.data || null); }
    catch (err) { setError(err?.message || 'Failed to load analytics'); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchStats(); }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-violet-400 animate-spin mr-3" /><span className="text-gray-500">Loading analytics…</span></div>;
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
          <button onClick={sendDigestNow} disabled={digestSending} className="flex items-center gap-2 text-sm border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 font-semibold px-4 py-2 rounded-xl">{digestSending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} {digestSending ? 'Sending…' : 'Send Weekly Digest Now'}</button>
          <button onClick={() => navigate('/admin/questions/review')} className="flex items-center gap-2 text-sm border border-amber-300 text-amber-700 hover:bg-amber-50 font-semibold px-4 py-2 rounded-xl"><AlertTriangle size={14} /> View Pending ({questions.total_pending ?? 0})</button>
        </div>
      </div>
      {notifModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Send Notification</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-semibold text-gray-500 mb-1 block font-mono uppercase tracking-wider">Send To</label><select value={notifTarget} onChange={e => setNotifTarget(e.target.value)} className={inputCls}><option value="all">All Users</option><option value="students">Students Only</option><option value="teachers">Teachers Only</option></select></div>
              <div><label className="text-xs font-semibold text-gray-500 mb-1 block font-mono uppercase tracking-wider">Title</label><input type="text" value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="Notification title…" className={inputCls} /></div>
              <div><label className="text-xs font-semibold text-gray-500 mb-1 block font-mono uppercase tracking-wider">Message</label><textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} rows={4} className={inputCls + ' resize-none'} /></div>
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

// ─── Scrape-from-URL sub-panel ────────────────────────────────────────────────
// Lets an admin paste a past-papers source URL and import every PDF it links
// to. Re-runs are safe — duplicates are skipped server-side by source_url.
const ScrapePastPapersForm = ({ onImported, showToast }) => {
  const [form, setForm] = useState({
    source_url: '',
    exam_board: '',
    paper_type: '',
    year_hint:  '',
    follow_subpages: true,
  });
  const [busy, setBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const run = async () => {
    if (!/^https?:\/\//i.test(form.source_url.trim())) {
      showToast('Enter a full URL starting with http:// or https://', 'error');
      return;
    }
    setBusy(true);
    setLastSummary(null);
    try {
      const r = await api.post('/past-papers/scrape', {
        source_url: form.source_url.trim(),
        exam_board: form.exam_board || null,
        paper_type: form.paper_type || null,
        year_hint:  form.year_hint ? Number(form.year_hint) : null,
        follow_subpages: form.follow_subpages,
      });
      const s = r?.data || {};
      setLastSummary(s);
      showToast(
        `Imported ${s.pdfs_imported ?? 0} new paper${s.pdfs_imported === 1 ? '' : 's'} ` +
        `(found ${s.pdfs_found ?? 0}, skipped ${s.pdfs_skipped_duplicate ?? 0}).`
      );
      if ((s.pdfs_imported ?? 0) > 0) onImported?.();
    } catch (err) {
      showToast(err?.message || 'Scrape failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Scrape past papers from a URL</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Paste a page that links to past-paper PDFs. We'll download every PDF found and add them to the library.
            Re-runs are safe — duplicates are skipped automatically.
          </p>
        </div>
      </div>

      <input
        value={form.source_url}
        onChange={(e) => set('source_url', e.target.value)}
        placeholder="https://example.com/jamb-past-questions/biology"
        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={form.exam_board}
          onChange={(e) => set('exam_board', e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
        >
          <option value="">Exam type (optional)</option>
          {['JAMB','WAEC','NECO','GCE_OL','GCE_AL','IELTS','TOEFL','SAT','JUPEB'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          value={form.paper_type}
          onChange={(e) => set('paper_type', e.target.value)}
          placeholder="Paper type (e.g. Theory)"
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
        />
        <input
          type="number"
          min="1900"
          max="2099"
          value={form.year_hint}
          onChange={(e) => set('year_hint', e.target.value)}
          placeholder={new Date().getFullYear().toString()}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400"
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={form.follow_subpages}
            onChange={(e) => set('follow_subpages', e.target.checked)}
            className="rounded border-gray-300 text-violet-600 focus:ring-violet-400"
          />
          Also crawl one level of in-domain sub-pages
        </label>
        <button
          onClick={run}
          disabled={busy || !form.source_url.trim()}
          className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-40 flex items-center gap-1.5"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {busy ? 'Scraping…' : 'Start scrape'}
        </button>
      </div>

      {lastSummary && (
        <div className="text-[11px] font-mono text-gray-600 bg-white border border-gray-100 rounded-lg p-3 space-y-0.5">
          <div>Pages crawled: <b>{lastSummary.pages_crawled}</b></div>
          <div>PDFs found: <b>{lastSummary.pdfs_found}</b> · Imported: <b className="text-emerald-600">{lastSummary.pdfs_imported}</b> · Skipped (dupes): <b>{lastSummary.pdfs_skipped_duplicate}</b> · Failed: <b className={lastSummary.pdfs_failed ? 'text-red-600' : ''}>{lastSummary.pdfs_failed}</b></div>
          {lastSummary.failures?.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-red-600">Show {lastSummary.failures.length} failure(s)</summary>
              <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                {lastSummary.failures.slice(0, 20).map((f, i) => (
                  <li key={i} className="truncate">• {f.kind}: {f.url} — {f.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Past Papers Panel (Admin) ────────────────────────────────────────────────
const AdminPastPapersPanel = () => {
  const navigate = useNavigate();
  const [papers, setPapers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({ exam_board: '', year_from: '', year_to: '' });
  const [showScraper, setShowScraper] = useState(false);
  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500); };

  const fetchPapers = async () => {
    setLoading(true);
    try { const params = {}; if (filters.exam_board) params.exam_board = filters.exam_board; if (filters.year_from) params.year_from = filters.year_from; if (filters.year_to) params.year_to = filters.year_to; const r = await api.get('/past-papers', { params }); setPapers(r.data || []); }
    catch { }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchPapers(); }, []);
  useEffect(() => {
    api.get('/catalog/types').then(async r => {
      const types = r.data || [];
      const allSubjects = [];
      for (const t of types) {
        try {
          const sr = await api.get(`/catalog/types/${t.id}/subjects`);
          (sr.data || []).forEach(s => { if (!allSubjects.find(x => x.id === s.id)) allSubjects.push(s); });
        } catch { /* skip */ }
      }
      setSubjects(allSubjects);
    }).catch(() => {});
  }, []);

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
        <div><h2 className="text-xl font-bold text-gray-900">Past Papers</h2><p className="text-sm text-gray-400 mt-0.5">Upload past exam papers for students to download and practise with</p></div>
        <div className="flex gap-2">
          <button onClick={fetchPapers} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-xl"><RefreshCw size={14} /> Refresh</button>
          <button onClick={() => navigate('/past-papers')} className="flex items-center gap-2 text-sm border border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold px-4 py-2 rounded-xl"><BookOpen size={14} /> Student View</button>
        </div>
      </div>

      {/* Primary path: direct upload. Most sites block scraping, so this is
          the reliable way to get real papers into the library. */}
      <UploadPastPaperForm subjects={subjects} onUploaded={fetchPapers} showToast={showToast} />

      {/* Secondary, minor-convenience path: URL scraping. Kept exactly as it
          was — useful for the minority of sites that don't block it — but
          tucked behind a toggle so it doesn't compete with the reliable
          upload path above. */}
      <div className="mb-5">
        <button
          onClick={() => setShowScraper(s => !s)}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          {showScraper ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showScraper ? 'Hide' : 'Show'} advanced: import from a website URL (works only on sites that allow it)
        </button>
        {showScraper && (
          <div className="mt-3">
            <ScrapePastPapersForm onImported={fetchPapers} showToast={showToast} />
          </div>
        )}
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <select value={filters.exam_board} onChange={e => setFilters(f => ({ ...f, exam_board: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"><option value="">All Exam Types</option>{['JAMB','WAEC','NECO','GCE_OL','GCE_AL','IELTS','TOEFL','SAT','JUPEB'].map(c => <option key={c} value={c}>{c}</option>)}</select>
        <input type="number" min="1900" max="2099" placeholder="Year from" value={filters.year_from} onChange={e => setFilters(f => ({ ...f, year_from: e.target.value }))} className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <input type="number" min="1900" max="2099" placeholder="Year to" value={filters.year_to} onChange={e => setFilters(f => ({ ...f, year_to: e.target.value }))} className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <button onClick={fetchPapers} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl">Filter</button>
      </div>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-400 animate-spin" /></div>
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
        { label: 'Past Papers (public)', desc: 'See the public past papers page',              action: () => navigate('/past-papers')       },
        { label: 'My Account Settings', desc: 'Update your admin profile and preferences',      action: () => navigate('/admin/settings')          },
      ],
    },
  ];

  return (
    <div>
      <div className="mb-6"><h2 className="text-xl font-bold text-gray-900">Quick Links</h2><p className="text-sm text-gray-400 mt-0.5">Platform configuration and shortcuts</p></div>
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
    { label: 'Total Users',     value: stats?.total_users       ?? '—', icon: Users,         bg: 'bg-violet-50 border-violet-100',  val: 'text-violet-700' },
    { label: 'Exam Types',      value: stats?.total_exam_types  ?? '—', icon: GraduationCap, bg: 'bg-indigo-50 border-indigo-100',  val: 'text-indigo-700' },
    { label: 'Total Subjects',  value: stats?.total_subjects    ?? '—', icon: BookOpen,      bg: 'bg-teal-50 border-teal-100',      val: 'text-teal-700'   },
    { label: 'Active Students', value: stats?.active_students   ?? '—', icon: UserCheck,     bg: 'bg-amber-50 border-amber-100',    val: 'text-amber-700'  },
  ];

  const navItems = [
    { key: 'analytics',  icon: Zap,          label: 'Analytics'   },
    { key: 'auditlog',   icon: Shield,       label: 'Audit Log'   },
    { key: 'users',      icon: Users,         label: 'Users'       },
    { key: 'content',    icon: BookOpen,      label: 'Content'     },
    { key: 'catalog',    icon: GraduationCap, label: 'Catalog'     },
    { key: 'topics',     icon: Layers,        label: 'Topics'      },
    { key: 'teachers',   icon: UserCheck,     label: 'Teachers'    },
    { key: 'aigenerate',          icon: Sparkles,   label: 'AI Generate'        },
    { key: 'bulkupload',          icon: Upload,     label: 'Bulk Upload'        },
    { key: 'pastpapers',          icon: BookOpen,   label: 'Past Papers'        },
    { key: 'schools',             icon: School,     label: 'Schools', href: '/admin/schools' },
    { key: 'settings',            icon: Settings,   label: 'Quick Links'        },
  ];

  const Panel = ({ children }) => (
    <div className="bg-white border border-gray-100 rounded-2xl mt-4 overflow-hidden shadow-sm">
      <div className="p-6">{children}</div>
    </div>
  );

  const firstName = user?.first_name || user?.firstName || user?.email?.split('@')[0] || 'Admin';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <TopNav />

      <div className="flex">
        {/* ── SIDEBAR ── */}
        <aside className="w-52 shrink-0 min-h-[calc(100vh-48px)] bg-[#f0ede8] border-r border-[#e8e4dd] sticky top-12 self-start hidden md:block">
          <div className="px-3 py-5">
            <div className="px-3 py-2 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#b5a99a]">Admin</p>
              <p className="text-xs font-semibold text-gray-700 mt-0.5 truncate">{firstName}</p>
            </div>
            <nav className="space-y-0.5">
              {navItems.map(({ key, icon: Icon, label, href }) => {
                const active = activePanel === key;
                if (href) {
                  // Items with href navigate to a dedicated page instead of opening an inline panel
                  return (
                    <a key={key} href={href}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60">
                      {Icon && <Icon size={14} className="text-[#b5a99a]" />}
                      {label}
                    </a>
                  );
                }
                return (
                  <button key={key} onClick={() => setActivePanel(active ? null : key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                      active
                        ? 'bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e4dd]'
                        : 'text-[#6b6259] hover:text-[#1a1a1a] hover:bg-white/60'
                    }`}>
                    {Icon && <Icon size={14} className={active ? 'text-[#d97757]' : 'text-[#b5a99a]'} />}
                    {label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main className="flex-1 min-w-0">
          {/* Header */}
          <div className="border-b border-[#e8e4dd] px-6 md:px-8 py-5 bg-white">
            <p className="text-[#b5a99a] text-xs uppercase tracking-widest mb-0.5 font-medium">Admin Console</p>
            <h1 className="text-xl font-bold text-gray-900">Good {greeting}, {firstName}</h1>
          </div>

          <div className="px-6 md:px-8 py-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {statCards.map((s, i) => (
                <div key={i} className={`border rounded-2xl p-4 ${s.bg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 font-medium">{s.label}</span>
                    <s.icon size={14} className={s.val + ' opacity-60'} />
                  </div>
                  <p className={`text-2xl font-bold ${s.val}`}>
                    {statsLoading ? <Loader2 size={16} className="animate-spin text-gray-300" /> : s.value}
                  </p>
                </div>
              ))}
            </div>

            {/* No panel selected — show a clean welcome state */}
            {!activePanel && (
              <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm text-center">
                <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Settings size={24} className="text-violet-500" />
                </div>
                <h2 className="text-base font-bold text-gray-900 mb-1">Select a section from the sidebar</h2>
                <p className="text-sm text-gray-400 max-w-sm mx-auto">Use the left pane to manage users, catalog, teacher assignments, AI question generation, bulk uploads and more.</p>
              </div>
            )}

            {activePanel === 'analytics'  && <Panel><PanelErrorBoundary><PlatformAnalyticsPanel /></PanelErrorBoundary></Panel>}
            {activePanel === 'auditlog'   && <Panel><PanelErrorBoundary><AuditLogPanel /></PanelErrorBoundary></Panel>}
            {activePanel === 'users'      && <Panel><PanelErrorBoundary><UserManagementPanel /></PanelErrorBoundary></Panel>}
            {activePanel === 'content'    && (
              <Panel>
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Content Management</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Manage subjects, exam papers and questions</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Manage Subjects', desc: 'Add, edit or deactivate exam types and subjects', action: () => setActivePanel('catalog'),              color: 'hover:border-violet-300 hover:bg-violet-50' },
                    { label: 'Past Papers',     desc: 'View and manage past exam papers',               action: () => setActivePanel('pastpapers'),            color: 'hover:border-blue-300 hover:bg-blue-50'   },
                    { label: 'Question Review', desc: 'Review and approve submitted questions',          action: () => navigate('/admin/questions/review'),     color: 'hover:border-teal-300 hover:bg-teal-50'   },
                  ].map(c => (
                    <button key={c.label} onClick={c.action}
                      className={`p-4 bg-white border border-gray-100 ${c.color} rounded-xl text-left transition-colors group`}>
                      <p className="font-semibold text-gray-800 text-sm group-hover:text-gray-900">{c.label}</p>
                      <p className="text-xs text-gray-400 mt-1">{c.desc}</p>
                      <span className="text-xs text-violet-500 mt-2 inline-block font-semibold">Open →</span>
                    </button>
                  ))}
                </div>
              </Panel>
            )}
            {activePanel === 'catalog'    && <Panel><PanelErrorBoundary><CatalogPanel /></PanelErrorBoundary></Panel>}
            {activePanel === 'topics'     && <Panel><PanelErrorBoundary><TopicsPanel /></PanelErrorBoundary></Panel>}
            {activePanel === 'teachers'   && <Panel><PanelErrorBoundary><TeacherAssignmentPanel /></PanelErrorBoundary></Panel>}
            {activePanel === 'aigenerate' && <Panel><PanelErrorBoundary><AIGeneratePanel setActivePanel={setActivePanel} /></PanelErrorBoundary></Panel>}
            {activePanel === 'bulkupload' && <Panel><PanelErrorBoundary><AdminBulkUploadPanel /></PanelErrorBoundary></Panel>}
            {activePanel === 'pastpapers' && <Panel><PanelErrorBoundary><AdminPastPapersPanel /></PanelErrorBoundary></Panel>}
            {activePanel === 'settings'   && <Panel><PanelErrorBoundary><AdminSettingsPanel setActivePanel={setActivePanel} /></PanelErrorBoundary></Panel>}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;

