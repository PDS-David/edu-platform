// client/src/pages/StudentPastPapersPage.jsx
// URL: /student/past-papers
//
// Dedicated past-papers experience for students, distinct from the general
// Resources page (StudentFilesPage.jsx / /student/resources). Pulls from
// the same past-papers bank teachers/admins upload into
// (server/routes/pastPaperRoutes.js), which already scopes GET / to only
// the exam board(s) and subject(s) the student is actually enrolled in —
// this page just needs to render that, plus a subject/year filter UI.

import { useState, useEffect, useMemo } from 'react';
import api from '../services/apiClient';
import {
  BookOpen, Loader2, Download, FileText, ChevronDown, X,
} from 'lucide-react';

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StudentPastPapersPage() {
  const [papers, setPapers]     = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [yearFilter, setYearFilter]       = useState('');

  const fetchPapers = async (params = {}) => {
    setLoading(true);
    try {
      const r = await api.get('/past-papers', { params });
      setPapers(r.data || []);
    } catch {
      setPapers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPapers(); }, []);

  // Subject filter options come from the student's own enrolled subjects —
  // same endpoint StudentSubjectsPage.jsx / StudentFilesPage.jsx already use
  // — not the full catalog, since a student can only ever see past papers
  // for subjects they're registered for anyway (server-enforced).
  useEffect(() => {
    api.get('/students/my-subjects')
      .then(r => setSubjects(r.data || []))
      .catch(() => setSubjects([]));
  }, []);

  const applyFilters = () => {
    const params = {};
    if (subjectFilter) params.subject_id = subjectFilter;
    if (yearFilter) { params.year_from = yearFilter; params.year_to = yearFilter; }
    fetchPapers(params);
  };

  const clearFilters = () => {
    setSubjectFilter('');
    setYearFilter('');
    fetchPapers();
  };

  const years = useMemo(() => {
    const s = new Set(papers.map(p => p.year).filter(Boolean));
    return Array.from(s).sort((a, b) => b - a);
  }, [papers]);

  const hasFilters = subjectFilter || yearFilter;

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText size={20} className="text-[#d97757]" /> Past Papers
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Past exam papers for the subjects you're enrolled in
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="appearance-none text-xs font-medium border border-gray-200 rounded-lg pl-3 pr-7 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#d97757]">
              <option value="">All subjects</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="appearance-none text-xs font-medium border border-gray-200 rounded-lg pl-3 pr-7 py-2 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#d97757]">
              <option value="">All years</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <button onClick={applyFilters}
            className="text-xs font-semibold bg-[#d97757] hover:bg-[#c56646] text-white px-3 py-2 rounded-lg transition-colors">
            Apply
          </button>

          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#d97757] animate-spin" />
          </div>
        ) : papers.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
            <BookOpen size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-600 mb-1">
              {hasFilters ? 'No past papers match those filters' : 'No past papers yet'}
            </p>
            <p className="text-xs text-gray-400">
              {hasFilters
                ? 'Try a different subject or year.'
                : 'Your teacher or school will add past papers here as they become available.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {papers.map(p => (
              <div key={p.id}
                className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl hover:border-[#d97757]/30 transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-[#fdf1ec] flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-[#d97757]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {p.subject_name || '—'}
                    {p.exam_board ? ` · ${p.exam_board}` : ''}
                    {p.year ? ` · ${p.year}` : ''}
                    {p.paper_type ? ` · ${p.paper_type}` : ''}
                    {p.file_size_bytes ? ` · ${fmtSize(p.file_size_bytes)}` : ''}
                  </p>
                </div>
                {p.file_url && (
                  <a href={p.file_url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-[#d97757] hover:text-[#c56646] px-3 py-1.5 rounded-lg border border-[#d97757]/30 hover:bg-[#fdf1ec] transition-colors">
                    <Download size={12} /> Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
