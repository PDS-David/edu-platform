// client/src/pages/EnglishMasterclass.jsx
// Language Masterclass practice orchestrator (English instance). Progressive difficulty:
// Beginner always open, Intermediate/Advanced unlock after answering 30+
// questions cumulatively in the prior tier at ≥70% accuracy.
//
// Renders inside EMLayout via /em/practice (see EMPractice.jsx) — EMLayout's
// top nav (Dashboard / Practice / Progress) is the ONLY navigation between
// EM's top-level sections; this component no longer duplicates that with
// its own internal Practice/Progress tab switcher. (That switcher used to
// show the exact same progress content as /em/progress without changing the
// URL — two paths to the same place, one of which didn't match the address
// bar or work with back/forward or bookmarking. Removed rather than fixed,
// since EMLayout's nav already does this job correctly.)
//
// Prop: initialCategory (pre-selected, from EMDashboard card click — starts
// a session immediately).

import { useState, useEffect } from 'react';
import api from '../services/apiClient';
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

// ── Shared EM sub-components (see client/src/pages/em/) ────────────────────
import LevelsView       from './em/LevelsView';
import PracticeSession   from './em/PracticeSession';
import SessionSummary    from './em/SessionSummary';
import LevelUpCelebration from './em/LevelUpCelebration';

export default function EnglishMasterclass({ initialCategory = null }) {
  // levels | starting | session | summary
  // 'starting' is used only when EMDashboard pre-selected a category
  // (initialCategory) — it prevents the full category grid (LevelsView)
  // from flashing on screen while the words for that category are still
  // being fetched. See handleStartCategory in EMDashboard.jsx.
  const [view, setView]                 = useState(initialCategory ? 'starting' : 'levels');
  const [categories, setCategories]     = useState([]);
  const [levelProgress, setLevelProgress] = useState(null);
  const [loadingInit, setLoadingInit]   = useState(true);
  const [initError, setInitError]       = useState(null);
  const [selectedCat, setSelectedCat]   = useState(null);
  const [words, setWords]               = useState([]);
  const [loadingCatId, setLoadingCatId] = useState(null);
  const [newlyUnlockedLevel, setNewlyUnlockedLevel] = useState(null);
  const [sessionAttempts, setSessionAttempts] = useState([]);

  // Load categories + level progress together on mount
  useEffect(() => {
    Promise.all([
      api.get('/english-masterclass/categories'),
      api.get('/english-masterclass/level-progress'),
    ])
      .then(([catRes, lpRes]) => {
        setCategories(catRes.data || []);
        setLevelProgress(lpRes.data || null);
        // If EMDashboard navigated here with a pre-selected category, start immediately
        if (initialCategory) startPractice(initialCategory);
      })
      .catch(e => setInitError(e.message || 'Failed to load Language Masterclass'))
      .finally(() => setLoadingInit(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshLevelProgress = async () => {
    try {
      const r = await api.get('/english-masterclass/level-progress');
      setLevelProgress(r.data || null);
    } catch (_) {}
  };

  const startPractice = async (cat) => {
    setLoadingCatId(cat.id);
    try {
      const r = await api.get(`/english-masterclass/categories/${cat.id}/words`);
      setSelectedCat(cat);
      setWords(r.data || []);
      setView('session');
    } catch (e) {
      alert(e.message || 'Could not load words. Please try another category.');
      setView('levels'); // don't get stuck on the 'starting' spinner if this was the auto-start call
    } finally {
      setLoadingCatId(null);
    }
  };

  const handleSessionComplete = async (attempts, durationSecs) => {
    setSessionAttempts(attempts);
    const correct = attempts.filter(a => a.correct).length;
    try {
      const { data } = await api.post('/english-masterclass/sessions', {
        category_id:   selectedCat?.id,
        category_name: selectedCat?.name || 'Unknown',
        total_words:   attempts.length,
        correct_words: correct,
        duration_secs: durationSecs,
        answers:       attempts,
      });
      if (data?.newly_unlocked_level) setNewlyUnlockedLevel(data.newly_unlocked_level);
    } catch (e) {
      console.warn('[EM] Session save failed:', e.message);
    }
    refreshLevelProgress(); // may unlock a new level
    setView('summary');
  };

  const backToLevels = () => {
    setView('levels');
    setSelectedCat(null);
    setWords([]);
    setSessionAttempts([]);
  };

  const byDiff = { Beginner: [], Intermediate: [], Advanced: [] };
  categories.forEach(c => { if (byDiff[c.difficulty]) byDiff[c.difficulty].push(c); });

  return (
    <div className="px-4 sm:px-6 py-6">
      <LevelUpCelebration level={newlyUnlockedLevel} onDismiss={() => setNewlyUnlockedLevel(null)} />
      <div className="max-w-4xl mx-auto">

        {loadingInit && (
          <div className="flex items-center justify-center py-24" role="status">
            <Loader2 size={24} className="animate-spin text-indigo-500 mr-3" aria-hidden="true" />
            <span className="text-gray-500 text-sm">Loading Language Masterclass…</span>
          </div>
        )}

        {!loadingInit && initError && (
          <div className="flex flex-col items-center py-24 gap-3" role="alert">
            <AlertCircle size={24} className="text-red-400" aria-hidden="true" />
            <p className="text-red-600 text-sm">{initError}</p>
            <button onClick={() => window.location.reload()}
              className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline">
              <RefreshCw size={12} aria-hidden="true" /> Retry
            </button>
          </div>
        )}

        {!loadingInit && !initError && view === 'starting' && (
          <div className="flex items-center justify-center py-24" role="status">
            <Loader2 size={24} className="animate-spin text-indigo-500 mr-3" aria-hidden="true" />
            <span className="text-gray-500 text-sm">Starting your practice session…</span>
          </div>
        )}

        {!loadingInit && !initError && view === 'levels' && (
          <LevelsView levelProgress={levelProgress} byDiff={byDiff} onStart={startPractice} loadingCatId={loadingCatId} />
        )}

        {!loadingInit && !initError && view === 'session' && selectedCat && words.length > 0 && (
          <>
            {/* Explicit, clearly-labeled exit — a user mid-session should
                never have to guess that some other control (like clicking
                an already-active tab) is actually how you leave. */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={backToLevels}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors font-medium">
                <ArrowLeft size={16} aria-hidden="true" /> Back to Levels
              </button>
              <span className="text-sm font-semibold text-gray-700">{selectedCat.name}</span>
            </div>
            <PracticeSession cat={selectedCat} words={words} onComplete={handleSessionComplete} />
          </>
        )}

        {!loadingInit && !initError && view === 'summary' && (
          <SessionSummary cat={selectedCat} attempts={sessionAttempts}
            onPracticeAgain={() => startPractice(selectedCat)} onBackToLevels={backToLevels} />
        )}

      </div>
    </div>
  );
}

