// client/src/utils/gradePrediction.js
// Extracted from MockExamPage.jsx (Phase 5, Examinations feature) before
// that file's removal — QuizResultsPage.jsx imports this function
// (`import { predictGrade } from './MockExamPage'`) for its own,
// unrelated, still-active isMock display path. A small, pure, fully
// self-contained function with zero dependency on the rest of
// MockExamPage.jsx's internals, so it was safe to lift out verbatim
// rather than duplicate or reimplement.

export function predictGrade(pct) {
  if (pct >= 90) return { grade: 'A*', color: 'text-blue-500',  bg: 'bg-blue-50'  };
  if (pct >= 80) return { grade: 'A',  color: 'text-green-600', bg: 'bg-green-50' };
  if (pct >= 70) return { grade: 'B',  color: 'text-blue-600',  bg: 'bg-blue-50'  };
  if (pct >= 60) return { grade: 'C',  color: 'text-amber-600', bg: 'bg-amber-50' };
  if (pct >= 50) return { grade: 'D',  color: 'text-orange-600',bg: 'bg-orange-50'};
  return              { grade: 'E',  color: 'text-red-600',   bg: 'bg-red-50'   };
}
