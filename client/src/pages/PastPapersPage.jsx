// client/src/pages/PastPapersPage.jsx
// Route: /past-papers  (public — no auth required, good for SEO)
// Filterable grid of past papers: exam board, subject, year range.
//
// FIX v1.1 — BUG 1:
//   Replaced undefined `API` variable with `BASE_URL` derived from VITE_API_URL.
//   Line was: href={`${API.replace('/api', '')}${p.file_url}`}
//   Now:      href={`${BASE_URL}${p.file_url}`}

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/apiClient';
import useAuth from '../hooks/useAuth';
import { FileText, Download, Filter, Loader2, BookOpen, ArrowLeft } from 'lucide-react';
import PublicNav from '../components/PublicNav';

// ── BUG 1 FIX: derive base URL from env var (strip /api suffix) ────────────────
const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '').replace(/\/api$/, '');

const EXAM_BOARDS = [
  { code: 'JAMB',    name: ' JAMB/UTME' },
  { code: 'WAEC',    name: ' WAEC' },
  { code: 'OLEVEL',  name: ' O-Levels' },
  { code: 'NECO',    name: ' NECO' },
  { code: 'IELTS',   name: ' IELTS' },
  { code: 'TOEFL',   name: ' TOEFL' },
  { code: 'SAT',     name: ' SAT' },
  { code: 'GCE_AL',  name: " GCE A'Levels" },
  { code: 'JUPEB',   name: ' JUPEB' },
  { code: 'LANG_EN', name: ' Language Lab – English' },
  { code: 'LANG_FR', name: ' Language Lab – French' },
  { code: 'LANG_YO', name: ' Language Lab – Yoruba' },
];
const YEAR_MIN = 2015;
const YEAR_MAX = new Date().getFullYear();

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function PastPapersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [papers,   setPapers]   = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [board,     setBoard]     = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [yearFrom,  setYearFrom]  = useState(YEAR_MIN);
  const [yearTo,    setYearTo]    = useState(YEAR_MAX);

  const [examTypes, setExamTypes] = useState([]); // full catalog/types list for id lookup

  // Load exam board catalog once (for id→code mapping)
  useEffect(() => {
    api.get('/catalog/types')
      .then(r => setExamTypes(r.data || []))
      .catch(() => {});
  }, []);

  // Cascade: when board changes, reload subjects for that board only (#4)
  useEffect(() => {
    setSubjectId('');          // reset subject when board changes
    if (!board) {
      // No board selected → load all subjects flat
      api.get('/subjects?for_test_builder=true')
        .then(r => setSubjects(r.data || []))
        .catch(() => setSubjects([]));
      return;
    }
    // Find the UUID id for this board code
    const found = examTypes.find(t => t.code === board);
    if (!found) { setSubjects([]); return; }
    api.get(`/catalog/types/${found.id}/subjects`)
      .then(r => setSubjects(r.data || []))
      .catch(() => setSubjects([]));
  }, [board, examTypes]); // eslint-disable-line

  // Load papers whenever filters change
  useEffect(() => {
    setLoading(true);
    const params = {};
    if (board)     params.exam_board  = board;
    if (subjectId) params.subject_id  = subjectId;
    params.year_from = yearFrom;
    params.year_to   = yearTo;

    api.get('/past-papers', { params })
      .then(r => setPapers(r.data || []))
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [board, subjectId, yearFrom, yearTo]);

  const selectCls = 'border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';

  return (
    <div className="min-h-screen bg-gray-50">

      <PublicNav
        right={
          !user ? (
            <>
              <Link to="/login"    className="text-sm text-gray-500 hover:text-gray-800">Sign in</Link>
              <Link to="/register" className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl transition-colors">
                Start Free
              </Link>
            </>
          ) : (
            <Link
              to={user.role === 'teacher' ? '/teacher/dashboard' : user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard'}
              className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1.5 font-medium"
            >
              <ArrowLeft size={14} /> Dashboard
            </Link>
          )
        }
      />

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Past Papers</h1>
          <p className="text-sm text-gray-500">JAMB, WAEC and NECO past papers — free to download</p>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-6 flex flex-wrap items-end gap-3">
          <Filter size={16} className="text-gray-400 mt-1 shrink-0" />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Exam type</label>
            <select value={board} onChange={e => setBoard(e.target.value)} className={selectCls}>
              <option value="">All types</option>
              {EXAM_BOARDS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Subject</label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className={selectCls}>
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Year from</label>
            <select value={yearFrom} onChange={e => setYearFrom(Number(e.target.value))} className={selectCls}>
              {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map(y =>
                <option key={y} value={y}>{y}</option>
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Year to</label>
            <select value={yearTo} onChange={e => setYearTo(Number(e.target.value))} className={selectCls}>
              {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).reverse().map(y =>
                <option key={y} value={y}>{y}</option>
              )}
            </select>
          </div>
        </div>

        {/* ── Papers grid ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="text-blue-400 animate-spin" />
          </div>
        ) : papers.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={40} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-semibold text-gray-600 mb-1">No past papers found</p>
            <p className="text-xs text-gray-400 mb-4">
              {board || subjectId
                ? 'Try a different filter combination, or clear all filters.'
                : 'No past papers have been uploaded yet.'}
            </p>
            {user?.role && ['admin','teacher'].includes(user.role) && (
              <p className="text-xs text-blue-600">
                Upload past papers from your dashboard under Past Papers management.
              </p>
            )}
            {(board || subjectId) && (
              <button
                onClick={() => { setBoard(''); setSubjectId(''); setYearFrom(YEAR_MIN); setYearTo(YEAR_MAX); }}
                className="mt-3 text-xs text-blue-600 hover:underline font-semibold"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {papers.map(p => (
              <div key={p.id} className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-blue-200 transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{p.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{p.subject_name}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {p.exam_board && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{p.exam_board}</span>
                  )}
                  {p.year && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.year}</span>
                  )}
                  {p.paper_type && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">{p.paper_type}</span>
                  )}
                  {p.file_size_bytes && (
                    <span className="text-[10px] text-gray-400">{formatSize(p.file_size_bytes)}</span>
                  )}
                </div>

                {/* BUG 1 FIX: was `${API.replace('/api', '')}${p.file_url}` — API was undefined */}
                <a
                  href={`${BASE_URL}${p.file_url}`}
                  download
                  className="flex items-center justify-center gap-2 w-full bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
                >
                  <Download size={13} /> Download PDF
                </a>
              </div>
            ))}
          </div>
        )}

        {/* ── CTA for non-registered users only ── */}
        {!user && (
          <div className="mt-12 bg-[#0a4a3f] rounded-2xl p-6 text-center">
            <p className="text-white font-bold text-lg mb-2">Practice with AI-powered feedback</p>
            <p className="text-white/60 text-sm mb-4">Attempt past paper questions and get instant AI marking — free for 5 questions/day</p>
            <Link to="/register" className="inline-block bg-blue-600 hover:bg-blue-700 text-gray-900 font-bold text-sm px-6 py-2.5 rounded-xl transition-colors">
              Create Free Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
