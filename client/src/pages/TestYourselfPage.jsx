// client/src/pages/TestYourselfPage.jsx
// Route: /student/practice (landing page — the sidebar's "Test-Yourself"
// link from Phase 1 points here; the actual question-answering view moved
// to /student/practice/session as of Phase 5).
//
// Four tiles split Test-Yourself into question types. Each links into
// PracticeMode via /student/practice/session?type=<value>, where <value>
// matches questions.type in the DB (see migration_009_structured_question_type.sql).
// The Essay tile also carries a secondary link to the photo-upload AI
// Marking tool (/student/mark-image), which no longer has its own
// top-level sidebar entry as of this phase.

import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ListChecks, PenLine, LayoutList, Edit3, ScanLine, ChevronRight,
} from 'lucide-react';

const TILES = [
  {
    type: 'mcq',
    label: 'MCQ Questions',
    icon: ListChecks,
    color: 'bg-indigo-600',
    description: 'Multiple-choice questions with instant grading.',
  },
  {
    type: 'short_answer',
    label: 'Short Questions',
    icon: PenLine,
    color: 'bg-emerald-600',
    description: 'Brief, direct-answer questions.',
  },
  {
    type: 'structured',
    label: 'Structured Questions',
    icon: LayoutList,
    color: 'bg-amber-600',
    description: 'Theory-style questions with longer, written answers.',
  },
  {
    type: 'essay',
    label: 'Essay Questions',
    icon: Edit3,
    color: 'bg-rose-600',
    description: 'Your answers are marked instantly by AI.',
  },
];

export default function TestYourselfPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f9f7f4]">
      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Back */}
        <Link to="/student/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors">
          <ArrowLeft size={13} /> Dashboard
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold text-gray-900">Test-Yourself</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Pick a question type to practise
          </p>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TILES.map(tile => {
            const Icon = tile.icon;
            return (
              <div
                key={tile.type}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/student/practice/session?type=${tile.type}`)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate(`/student/practice/session?type=${tile.type}`)}
                className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3 hover:border-gray-200 hover:shadow-md transition-all cursor-pointer"
              >
                <div className={`w-11 h-11 rounded-xl ${tile.color} flex items-center justify-center text-white shrink-0`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
                    {tile.label}
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{tile.description}</p>
                </div>

                {/* Essay tile: secondary link to the photo-upload AI Marking
                    tool. Removed from the top-level "Subjects" sidebar group
                    in this phase — it now only lives here. A real <Link>
                    (not nested inside the tile's own click target) so it
                    navigates independently without triggering the tile's
                    onClick or producing invalid nested-anchor markup. */}
                {tile.type === 'essay' && (
                  <Link
                    to="/student/mark-image"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 mt-1 pt-3 border-t border-gray-50"
                  >
                    <ScanLine size={13} />
                    Or upload a photo of handwritten work instead
                  </Link>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
