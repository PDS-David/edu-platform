// client/src/pages/lang/LangSessionSummary.jsx
import { Check, RotateCcw, LayoutGrid } from 'lucide-react';
import { LANGUAGE_META } from './constants';

export default function LangSessionSummary({ language, result, onPracticeAgain, onBackToLevels }) {
  const meta = LANGUAGE_META[language];
  const { totalWords, correctWords } = result;
  const pct = totalWords > 0 ? Math.round((correctWords / totalWords) * 100) : 0;

  return (
    <div className="max-w-md mx-auto text-center bg-white rounded-2xl border border-gray-100 p-8">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: meta.accentSoft }}
      >
        <Check size={28} style={{ color: meta.accent }} aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Session complete!</h2>
      <p className="text-sm text-gray-500 mb-6">
        You scored 70+ on {correctWords} of {totalWords} words ({pct}%).
      </p>

      <div className="flex gap-3 justify-center">
        <button
          type="button"
          onClick={onPracticeAgain}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl text-white transition-opacity hover:opacity-90"
          style={{ background: meta.accent }}
        >
          <RotateCcw size={14} /> Practice again
        </button>
        <button
          type="button"
          onClick={onBackToLevels}
          className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <LayoutGrid size={14} /> Back to levels
        </button>
      </div>
    </div>
  );
}
