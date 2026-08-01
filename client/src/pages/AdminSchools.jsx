// client/src/pages/AdminSchools.jsx
// Route: /admin/schools (App Admin only)
//
// App Admin creates each tenant school manually and hands the join_code to
// that school directly (per project decision — schools are not self-service).
// This is also where App Admin gets the "see all tenant schools" view that
// no other role has — a school_admin only ever sees their own school via
// GET /api/schools/me/roster.

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import {
  School, Plus, X, Copy, Check, Loader2, Users, UserCheck,
  ChevronDown, ChevronUp, AlertCircle, Trash2, Image as ImageIcon,
} from 'lucide-react';

function CreateSchoolModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    school_name: '', admin_email: '', admin_password: '',
    admin_first_name: '', admin_last_name: '',
    enable_aischoolonair: true, enable_em: false,
  });
  const [logoFile, setLogoFile]   = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoError, setLogoError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const toggle = (k) => () => setForm(f => ({ ...f, [k]: !f[k] }));

  const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_LOGO_MB = 5;

  const pickLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError('');
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoError('Logo must be a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      setLogoError(`Logo must be under ${MAX_LOGO_MB} MB.`);
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const clearLogo = () => {
    setLogoFile(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      if (logoFile) body.append('logo', logoFile);
      const res = await api.post('/schools/register', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onCreated(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not create school.');
    } finally {
      setLoading(false);
    }
  };

  const ready = form.school_name.trim() && form.admin_email.trim()
    && form.admin_password.trim().length >= 8
    && (form.enable_aischoolonair || form.enable_em);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Create a School</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Creates the school and its first admin account in one step. You'll get a join
          code afterward to hand to the school for their teachers and students to link
          their own accounts.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">School Logo (optional)</label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                {logoPreview
                  ? <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                  : <ImageIcon size={20} className="text-gray-300" />}
              </div>
              <div className="flex-1">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer transition-colors">
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickLogo} className="hidden" />
                  {logoFile ? 'Choose a different image' : 'Choose an image'}
                </label>
                {logoFile && (
                  <button type="button" onClick={clearLogo} className="ml-3 text-xs text-gray-400 hover:text-red-500">
                    Remove
                  </button>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">JPG, PNG, or WEBP · up to {MAX_LOGO_MB} MB</p>
                {logoError && <p className="text-[11px] text-red-500 mt-0.5">{logoError}</p>}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">School Name *</label>
            <input value={form.school_name} onChange={set('school_name')} required
              placeholder="e.g. Model College"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Admin First Name</label>
              <input value={form.admin_first_name} onChange={set('admin_first_name')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Admin Last Name</label>
              <input value={form.admin_last_name} onChange={set('admin_last_name')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Admin Email *</label>
            <input type="email" value={form.admin_email} onChange={set('admin_email')} required
              placeholder="admin@school.edu"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Admin Password *</label>
            <input type="text" value={form.admin_password} onChange={set('admin_password')} required minLength={8}
              placeholder="At least 8 characters — share this with the school admin"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>

          <div className="pt-1">
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              What is this school registering for? *
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 transition-colors">
                <input type="checkbox" checked={form.enable_aischoolonair} onChange={toggle('enable_aischoolonair')}
                  className="w-4 h-4 accent-indigo-600" />
                <span className="text-sm text-gray-700">AISchoolonair (exam prep, resources, analytics)</span>
              </label>
              <label className="flex items-center gap-2.5 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 transition-colors">
                <input type="checkbox" checked={form.enable_em} onChange={toggle('enable_em')}
                  className="w-4 h-4 accent-indigo-600" />
                <span className="text-sm text-gray-700">Language Masterclass (English)</span>
              </label>
            </div>
            {!form.enable_aischoolonair && !form.enable_em && (
              <p className="text-xs text-red-500 mt-1.5">Pick at least one.</p>
            )}
          </div>

          <button type="submit" disabled={!ready || loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {loading ? 'Creating…' : 'Create School'}
          </button>
        </form>
      </div>
    </div>
  );
}

function JoinCodeReveal({ school, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(school.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
        {school.logo_url
          ? <img src={school.logo_url} alt={`${school.name} logo`} className="w-14 h-14 rounded-xl object-cover mx-auto mb-3" />
          : <School className="w-10 h-10 text-indigo-500 mx-auto mb-3" />}
        <h2 className="text-lg font-bold text-gray-900 mb-1">{school.name} is set up</h2>
        <p className="text-xs text-gray-500 mb-5">
          Give this join code to the school. Their teachers and students each enter it
          once to link their own account — nothing else changes for them.
        </p>
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {school.enable_aischoolonair && (
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold">AISchoolonair</span>
          )}
          {school.enable_em && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold">Language Masterclass (English)</span>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 mb-5">
          <span className="text-xl font-mono font-bold tracking-widest text-gray-900">{school.join_code}</span>
          <button onClick={copy} className="text-gray-400 hover:text-indigo-600 transition-colors">
            {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          </button>
        </div>
        <button onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

function DeleteSchoolModal({ school, onClose, onDeleted }) {
  const [typedName, setTypedName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const matches = typedName === school.name;

  const submit = async () => {
    if (!matches) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.delete(`/schools/${school.id}`, { data: { confirm_name: typedName } });
      onDeleted(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Could not delete school.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-red-600 flex items-center gap-2">
            <Trash2 size={18} /> Delete {school.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm text-red-700 font-semibold mb-1">This cannot be undone.</p>
          <p className="text-xs text-red-700">
            This permanently deletes the school, every teacher/student/school-admin account
            linked to it ({school.admin_count} admin · {school.teacher_count} teachers ·{' '}
            {school.student_count} students), and every resource this school's own staff
            uploaded. Resources uploaded by App Admin are shared globally and are not affected.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Type <span className="font-mono text-red-600">{school.name}</span> to confirm
        </label>
        <input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={school.name}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 mb-4"
        />

        <button onClick={submit} disabled={!matches || loading}
          className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          {loading ? 'Deleting…' : 'Permanently Delete School'}
        </button>
      </div>
    </div>
  );
}

function SchoolRow({ school, onServicesUpdated, onDetailsUpdated, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [roster,   setRoster]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [editingServices, setEditingServices] = useState(false);
  const [svcForm, setSvcForm] = useState({ enable_aischoolonair: school.enable_aischoolonair, enable_em: school.enable_em });
  const [svcSaving, setSvcSaving] = useState(false);
  const [svcError, setSvcError] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    name: school.name || '',
    address: school.address || '',
    contact_email: school.contact_email || '',
  });
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoError, setLogoError] = useState('');

  const toggle = async () => {
    if (!expanded && !roster) {
      setLoading(true);
      try {
        const res = await api.get(`/schools/${school.id}/roster`);
        setRoster(res.data || []);
      } catch { setRoster([]); }
      setLoading(false);
    }
    setExpanded(e => !e);
  };

  const copyCode = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(school.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saveServices = async () => {
    setSvcError('');
    if (!svcForm.enable_aischoolonair && !svcForm.enable_em) {
      setSvcError('Pick at least one service.');
      return;
    }
    setSvcSaving(true);
    try {
      await api.patch(`/schools/${school.id}/services`, svcForm);
      setEditingServices(false);
      onServicesUpdated?.();
    } catch (err) {
      setSvcError(err?.response?.data?.error || err?.message || 'Could not update services.');
    } finally {
      setSvcSaving(false);
    }
  };

  const saveDetails = async () => {
    setDetailsError('');
    if (!detailsForm.name.trim()) {
      setDetailsError('School name cannot be empty.');
      return;
    }
    if (detailsForm.contact_email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(detailsForm.contact_email.trim())) {
        setDetailsError('Invalid contact email format.');
        return;
      }
    }
    setDetailsSaving(true);
    try {
      const res = await api.patch(`/schools/${school.id}`, {
        name: detailsForm.name.trim(),
        address: detailsForm.address.trim(),
        contact_email: detailsForm.contact_email.trim(),
      });
      setEditingDetails(false);
      // Deliberately NOT reusing onServicesUpdated (which reloads the whole
      // school list) — the PATCH response already returns the updated row,
      // so the parent can just patch this one school locally.
      onDetailsUpdated?.(res?.data);
    } catch (err) {
      setDetailsError(err?.response?.data?.error || err?.message || 'Could not update school details.');
    } finally {
      setDetailsSaving(false);
    }
  };

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    setLogoError('');
    setLogoSaving(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      await api.patch(`/schools/${school.id}/logo`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onServicesUpdated?.(); // reuses the same "refresh the list" callback
    } catch (err) {
      setLogoError(err?.response?.data?.error || err?.message || 'Could not update logo.');
    } finally {
      setLogoSaving(false);
    }
  };

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <label className="relative w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer group">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickLogo}
              onClick={(e) => e.stopPropagation()} className="hidden" />
            {school.logo_url
              ? <img src={school.logo_url} alt="" className="w-full h-full object-cover" />
              : <School size={16} className="text-indigo-500" />}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              {logoSaving
                ? <Loader2 size={12} className="text-white animate-spin" />
                : <ImageIcon size={12} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />}
            </span>
          </label>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{school.name}</p>
            <p className="text-xs text-gray-400">
              {school.admin_count} admin · {school.teacher_count} teachers · {school.student_count} students
            </p>
            <div className="flex items-center gap-1 mt-1">
              {school.enable_aischoolonair && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-semibold">AISchoolonair</span>
              )}
              {school.enable_em && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] font-semibold">EM</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button onClick={copyCode} className="flex items-center gap-1.5 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-indigo-300 transition-colors">
            {school.join_code}
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-gray-400" />}
          </button>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          {logoError && <p className="text-xs text-red-500 mb-2">{logoError}</p>}
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
            {!editingServices && !editingDetails ? (
              <div className="flex items-center gap-4">
                <button onClick={(e) => { e.stopPropagation(); setEditingDetails(true); }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                  Edit school details
                </button>
                <button onClick={(e) => { e.stopPropagation(); setEditingServices(true); }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                  Edit services this school is registered for
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowDelete(true); }}
                  className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 transition-colors">
                  <Trash2 size={12} /> Delete school
                </button>
              </div>
            ) : editingDetails ? (
              <div className="w-full">
                {detailsError && <p className="text-xs text-red-500 mb-2">{detailsError}</p>}
                <div className="grid grid-cols-1 gap-2 mb-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">School name</label>
                    <input type="text" value={detailsForm.name}
                      onChange={e => setDetailsForm(f => ({ ...f, name: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Address</label>
                    <input type="text" value={detailsForm.address}
                      onChange={e => setDetailsForm(f => ({ ...f, address: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Contact email</label>
                    <input type="email" value={detailsForm.contact_email}
                      onChange={e => setDetailsForm(f => ({ ...f, contact_email: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); saveDetails(); }} disabled={detailsSaving}
                    className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">
                    {detailsSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={(e) => {
                      e.stopPropagation();
                      setEditingDetails(false);
                      setDetailsForm({ name: school.name || '', address: school.address || '', contact_email: school.contact_email || '' });
                      setDetailsError('');
                    }}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-1.5">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full">
                {svcError && <p className="text-xs text-red-500 mb-2">{svcError}</p>}
                <div className="flex items-center gap-4 mb-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={svcForm.enable_aischoolonair}
                      onChange={() => setSvcForm(f => ({ ...f, enable_aischoolonair: !f.enable_aischoolonair }))}
                      className="w-3.5 h-3.5 accent-indigo-600" />
                    AISchoolonair
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={svcForm.enable_em}
                      onChange={() => setSvcForm(f => ({ ...f, enable_em: !f.enable_em }))}
                      className="w-3.5 h-3.5 accent-indigo-600" />
                    Language Masterclass (English)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={saveServices} disabled={svcSaving}
                    className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">
                    {svcSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingServices(false); setSvcForm({ enable_aischoolonair: school.enable_aischoolonair, enable_em: school.enable_em }); setSvcError(''); }}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-1.5">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {loading && <Loader2 size={16} className="animate-spin text-gray-400" />}
          {!loading && roster?.length === 0 && (
            <p className="text-xs text-gray-400 py-2">No one has joined this school yet.</p>
          )}
          {!loading && roster?.length > 0 && (
            <div className="space-y-1.5">
              {roster.map(u => (
                <div key={u.id} className="flex items-center justify-between text-xs py-1">
                  <span className="text-gray-700">{u.first_name} {u.last_name} <span className="text-gray-400">({u.email})</span></span>
                  <div className="flex items-center gap-1.5">
                    {u.uses_english_masterclass && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold" title="Also uses Language Masterclass (English)">
                        EM
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500 capitalize">
                      {u.role.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {showDelete && (
        <DeleteSchoolModal
          school={school}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); onDeleted?.(); }}
        />
      )}
    </div>
  );
}

export default function AdminSchools() {
  const { user } = useAuth();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/schools')
      .then(res => setSchools(res.data || []))
      .catch(() => setSchools([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="min-h-screen bg-[#f9f7f4] text-[#1a1a1a]">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Schools</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Every tenant school — you're the only role that sees across all of them.
            </p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Plus size={16} /> Create School
          </button>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          )}
          {!loading && schools.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No schools yet. Create the first one above.</p>
            </div>
          )}
          {!loading && schools.length > 0 && (
            <div className="space-y-2">
              {schools.map(s => (
                <SchoolRow
                  key={s.id}
                  school={s}
                  onServicesUpdated={load}
                  onDetailsUpdated={(updated) => {
                    if (!updated) return;
                    setSchools(prev => prev.map(row => row.id === s.id ? { ...row, ...updated } : row));
                  }}
                  onDeleted={load}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateSchoolModal
          onClose={() => setShowCreate(false)}
          onCreated={(data) => {
            setShowCreate(false);
            setJustCreated(data.school);
            load();
          }}
        />
      )}
      {justCreated && (
        <JoinCodeReveal school={justCreated} onClose={() => setJustCreated(null)} />
      )}
    </div>
  );
}
