// client/src/pages/StudentFilesPage.jsx
// Route: /student/files
// Shows all files assigned to the student by teachers/admin.

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/apiClient';
import TopNav from '../components/TopNav';
import { FileText, Video, Music, File, Download, ArrowLeft, BookOpen, Loader2, ExternalLink } from 'lucide-react';

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '');

function resolveUrl(rawUrl) {
  if (!rawUrl) return '#';
  if (rawUrl.startsWith('http')) {
    return rawUrl.replace(/https?:\/\/eacbuddy-api\.onrender\.com/, BASE_URL);
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

function InlineViewer({ file }) {
  const url  = resolveUrl(file.file_url);
  const type = (file.resource_type || file.type || '').toLowerCase();
  if (type === 'video') return <video src={url} controls className="w-full rounded-xl mt-2 max-h-60 bg-black" />;
  if (type === 'audio') return <audio src={url} controls className="w-full mt-2" />;
  if (type === 'image') return <img src={url} alt={file.title} className="w-full rounded-xl mt-2 max-h-60 object-contain bg-gray-100" />;
  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-gray-200">
      <iframe
        src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
        title={file.title}
        className="w-full"
        style={{ height: 380 }}
      />
      <div className="py-2 text-center bg-gray-50 border-t border-gray-100">
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
          Open in new tab if preview doesn't load ↗
        </a>
      </div>
    </div>
  );
}

// A resource is treated as "Questions" if its push_type or resource_type
// looks question-y. Everything else is "Learning".
const isQuestionResource = (r) => {
  const p = String(r.push_type || '').toLowerCase();
  const t = String(r.resource_type || '').toLowerCase();
  return /(question|quiz|practice|exam|paper)/.test(p) || /(question|quiz)/.test(t);
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
      <TopNav />
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
                    const href   = resolveUrl(file.file_url);
                    return (
                      <div key={file.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:border-blue-200 transition-colors">
                        <div className="p-4 flex items-center gap-3">
                          <FileIcon type={ftype} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{file.title}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                              <span className="capitalize">{ftype || 'file'}</span>
                              {file.topic_name && <><span>·</span><span>{file.topic_name}</span></>}
                              {file.assigned_by_name && <><span>·</span><span>From: {file.assigned_by_name}</span></>}
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
                            <a href={href} download
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Download">
                              <Download size={14} />
                            </a>
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
