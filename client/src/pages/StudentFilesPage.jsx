// client/src/pages/StudentFilesPage.jsx
// Route: /student/files
// Shows all files assigned to the student by teachers/admin.

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import { FileText, Video, Music, File, Download, ArrowLeft, BookOpen, Loader2, ExternalLink } from 'lucide-react';
import { openResourceAuth } from '../utils/authenticatedDownload';

// Resolve the file server base URL.
// On Hetzner Docker, VITE_API_URL="/api" (relative), so strip /api to get
// the origin (empty string = same origin). Caddy proxies /uploads/* to the API.
const _RAW = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '').replace(/\/api$/, '');
const BASE_URL = _RAW.startsWith('http') ? _RAW : '';

function resolveUrl(rawUrl) {
  if (!rawUrl) return '#';
  if (rawUrl.startsWith('http')) {
    // Rewrite any legacy onrender.com hostname stored in the DB to the current API base
    return rawUrl.replace(/https?:\/\/[^/]*onrender\.com/, BASE_URL);
  }
  return `${BASE_URL}${rawUrl}`;
}

function FileIcon({ type }) {
  if (type === 'video')    return <Video    size={18} className="text-blue-500 shrink-0" />;
  if (type === 'audio')    return <Music    size={18} className="text-purple-500 shrink-0" />;
  if (type === 'pdf')      return <FileText size={18} className="text-red-500 shrink-0" />;
  if (type === 'document') return <FileText size={18} className="text-amber-500 shrink-0" />;
  return <File size={18} className="text-gray-400 shrink-0" />;
}

// Detect whether the file URL is a public CDN URL that Google Docs Viewer can
// reach. Files served from /uploads/ or /api/ behind Caddy (on the Hetzner
// server) are NOT reachable by Google — only R2/S3 CDN links are.
function isPublicUrl(url) {
  try {
    if (!url.startsWith('http')) return false;
    const u = new URL(url);
    if (u.hostname.endsWith('.onrender.com')) return false; // legacy, dead
    if (u.pathname.startsWith('/uploads/')) return false;
    if (u.pathname.startsWith('/api/')) return false;
    return true;
  } catch {
    return false;
  }
}

// Detect Office document MIME types that Microsoft Office Online Viewer supports.
// Checks both mime_type (from upload metadata) and file extension as fallback.
function isOfficeMime(file) {
  const mime = (file.mime_type || '').toLowerCase();
  const url  = (file.file_url || '').toLowerCase();
  return (
    mime.includes('wordprocessingml')   || // .docx
    mime.includes('presentationml')     || // .pptx
    mime.includes('spreadsheetml')      || // .xlsx
    mime.includes('msword')             || // .doc (legacy)
    mime.includes('ms-powerpoint')      || // .ppt (legacy)
    mime.includes('ms-excel')           || // .xls (legacy)
    /\.(docx?|pptx?|xlsx?)(\?|$)/.test(url)
  );
}

// Microsoft Office Online Viewer works with any publicly reachable URL —
// but NOT with localhost, private-network addresses, /uploads/ paths behind
// Caddy (not reachable by Microsoft's servers), or /api/ proxy paths.
function isPubliclyReachable(url) {
  try {
    if (!url.startsWith('http')) return false;
    const u = new URL(url);
    if (u.hostname === 'localhost')                return false;
    if (u.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./)) return false;
    if (u.hostname.endsWith('.onrender.com'))       return false; // legacy, dead
    if (u.pathname.startsWith('/uploads/'))         return false;
    if (u.pathname.startsWith('/api/'))             return false;
    return true;
  } catch {
    return false;
  }
}

function InlineViewer({ file }) {
  const resourceId = file.id || null;
  const rawUrl = file.id ? `/api/resources/${file.id}/download` : resolveUrl(file.file_url);
  const type = (file.resource_type || file.type || '').toLowerCase();

  const handleDownload = (e) => {
    e.preventDefault();
    openResourceAuth(resourceId, file.file_url);
  };

  // ── Video / Audio / Image — these need a blob URL with auth too
  if (type === 'video') return <video src={rawUrl} controls className="w-full rounded-xl mt-2 max-h-60 bg-black" />;
  if (type === 'audio') return <audio src={rawUrl} controls className="w-full mt-2" />;
  if (type === 'image') return <img src={rawUrl} alt={file.title} className="w-full rounded-xl mt-2 max-h-60 object-contain bg-gray-100" />;

  // ── PDF ───────────────────────────────────────────────────────────────────
  const isPdf = type === 'pdf' || /\.pdf(\?|$)/i.test(rawUrl);
  if (isPdf) {
    return (
      <div className="mt-2 rounded-xl overflow-hidden border border-gray-200">
        <div className="py-4 px-4 bg-gray-50 text-center space-y-2">
          <p className="text-sm text-gray-500">PDF preview requires downloading the file first.</p>
          <button onClick={handleDownload}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 mx-auto">
            <Download size={12} /> Open PDF ↓
          </button>
        </div>
      </div>
    );
  }

  // ── Office Documents — use MS viewer if publicly reachable, else download ─
  if (isOfficeMime(file)) {
    if (isPubliclyReachable(rawUrl)) {
      const viewerSrc = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(rawUrl)}`;
      const mimeLabel = (file.mime_type || '').includes('presentationml') ? 'presentation'
                      : (file.mime_type || '').includes('spreadsheetml')  ? 'spreadsheet'
                      : 'document';
      return (
        <div className="mt-2 rounded-xl overflow-hidden border border-gray-200">
          <iframe
            src={viewerSrc}
            title={file.title}
            className="w-full"
            style={{ height: 520 }}
            frameBorder="0"
            allowFullScreen
          />
          <div className="py-2 px-3 flex items-center justify-between bg-gray-50 border-t border-gray-100">
            <span className="text-xs text-gray-400 capitalize">
              Microsoft Office Online — {mimeLabel} preview
            </span>
            <button onClick={handleDownload}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Download size={11} /> Download
            </button>
          </div>
        </div>
      );
    }

    // Office file on same server — not publicly reachable for MS viewer
    return (
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
        <FileText size={28} className="text-amber-400 mx-auto mb-2" />
        <p className="text-sm font-semibold text-gray-700 mb-1">Office document</p>
        <p className="text-xs text-gray-500 mb-4">
          Online preview requires a public file URL. Download to open in Microsoft Office or Google Docs.
        </p>
        <div className="flex justify-center gap-3">
          <button onClick={handleDownload}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5">
            <Download size={12} /> Download ↓
          </button>
        </div>
      </div>
    );
  }

  // ── Unsupported type — generic download UI ────────────────────────────────
  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-5 text-center">
      <p className="text-sm text-gray-500 mb-3">
        In-browser preview is not available for this file type.
      </p>
      <div className="flex justify-center gap-3">
        <button onClick={handleDownload}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5">
          <Download size={12} /> Download ↓
        </button>
      </div>
    </div>
  );
}

// Canonical push_type vocabulary (shared by teacher + admin upload UIs):
//   'learning_material' → Learning Resources tab
//   'practice_test'     → Questions tab
//   'quiz'              → Questions tab
// Legacy values from older records still map correctly via the fallback regex.
const QUESTION_PUSH_TYPES = new Set(['practice_test', 'quiz', 'question_material']);
const isQuestionResource = (r) => {
  const p = String(r.push_type || '').toLowerCase();
  if (QUESTION_PUSH_TYPES.has(p)) return true;
  // Backwards-compat for any pre-standardization values still in the DB.
  return /(question|quiz|practice|exam|paper)/.test(p);
};

export default function StudentFilesPage() {
  const navigate              = useNavigate();
  const [resources, setResources] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [openId,    setOpenId]     = useState(null);
  const [tab,       setTab]       = useState('learning'); // 'learning' | 'questions'

  useEffect(() => {
    api.get('/resources/my-assignments')
      .then(r => setResources(r.data || []))
      .catch(() => setResources([]))
      .finally(() => setLoading(false));
  }, []);

  const learning  = resources.filter(r => !isQuestionResource(r));
  const questions = resources.filter(r =>  isQuestionResource(r));
  const visible   = tab === 'questions' ? questions : learning;

  // Group visible by subject
  const bySubject = {};
  for (const r of visible) {
    const key = r.subject_name || 'General';
    if (!bySubject[key]) bySubject[key] = [];
    bySubject[key].push(r);
  }

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link to="/student/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>

        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Resources</h1>
          <p className="text-sm text-gray-400 mt-0.5">Materials assigned by your teachers and admin</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
          <button
            onClick={() => setTab('learning')}
            className={`px-4 py-2 text-sm font-semibold transition-colors -mb-px border-b-2 ${
              tab === 'learning'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Learning Resources
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{learning.length}</span>
          </button>
          <button
            onClick={() => setTab('questions')}
            className={`px-4 py-2 text-sm font-semibold transition-colors -mb-px border-b-2 ${
              tab === 'questions'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Questions
            <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{questions.length}</span>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-blue-400" />
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
            <BookOpen size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-700 mb-1">
              {tab === 'questions' ? 'No question sets assigned yet' : 'No learning resources assigned yet'}
            </p>
            <p className="text-xs text-gray-400">
              {resources.length === 0
                ? 'Files sent by your teacher or admin will appear here.'
                : `Try the "${tab === 'questions' ? 'Learning Resources' : 'Questions'}" tab — there are items there.`}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(bySubject).sort().map(([subject, files]) => (
              <div key={subject}>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={12} className="text-blue-500" />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{subject}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-300">{files.length}</span>
                </div>
                <div className="space-y-2">
                  {files.map(file => {
                    const ftype = (file.resource_type || file.type || '').toLowerCase();
                    const isOpen = openId === file.id;
                    return (
                      <div key={file.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:border-blue-200 transition-colors">
                        <div className="p-4 flex items-center gap-3">
                          <FileIcon type={ftype} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{file.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                              <span className="capitalize">{ftype || 'file'}</span>
                              {file.topic_name && <><span>·</span><span>{file.topic_name}</span></>}
                              {(file.uploader_name || file.assigned_by_name) && <><span>·</span><span>From: {file.uploader_name || file.assigned_by_name}</span></>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setOpenId(isOpen ? null : file.id)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                                isOpen ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                              }`}
                            >
                              {isOpen ? 'Close' : 'Open'}
                            </button>
                            {file.subtopic_id && (
                              <button
                                onClick={() => navigate(`/student/subtopic/${file.subtopic_id}?tab=practice`)}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                              >
                                Practice
                              </button>
                            )}
                            <button
                              onClick={() => openResourceAuth(file.id, file.file_url)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Download">
                              <Download size={14} />
                            </button>
                          </div>
                        </div>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-gray-100">
                            <InlineViewer file={file} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
