// client/src/pages/EnglishMasterclass.jsx
// English Masterclass — orchestrator. Progressive difficulty: Beginner always
// open, Intermediate/Advanced unlock after ≥60% accuracy on the prior tier.
//
// Task 7 refactor: thin data/state orchestrator only — presentational pieces
// live in ./em/ and are shared with /em/practice + /em/progress (embedded
// mode, via EMPractice/EMProgress). No routing, business logic, API calls,
// or auth were changed — only extraction and imports.
//
// Props: embedded (bool, no standalone chrome — used by /em/practice) |
// defaultTab ('practice'|'progress') | initialCategory (pre-selected, from
// EMDashboard card click — starts a session immediately).

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

// ── Shared EM sub-components (see client/src/pages/em/) ────────────────────
import TabBar          from './em/TabBar';
import LevelsView       from './em/LevelsView';
import PracticeSession   from './em/PracticeSession';
import SessionSummary    from './em/SessionSummary';
import { ProgressContent as ProgressTab } from './em/EMProgress';

export default function EnglishMasterclass({ embedded = false, defaultTab = 'practice', initialCategory = null }) {
  const navigate = useNavigate();
  const { user } = useAuth(); // eslint-disable-line no-unused-vars

  const [activeTab, setActiveTab]       = useState(defaultTab);
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
      .catch(e => setInitError(e.message || 'Failed to load English Masterclass'))
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
      await api.post('/english-masterclass/sessions', {
        category_id:   selectedCat?.id,
        category_name: selectedCat?.name || 'Unknown',
        total_words:   attempts.length,
        correct_words: correct,
        duration_secs: durationSecs,
        answers:       attempts,
      });
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

  const handleTabSelect = (id) => {
    setActiveTab(id);
    if (id === 'practice') backToLevels();
  };

  const Content = () => (
    <>
      {activeTab === 'progress' && <ProgressTab />}

      {activeTab === 'practice' && (
        <>
          {loadingInit && (
            <div className="flex items-center justify-center py-24" role="status">
              <Loader2 size={24} className="animate-spin text-indigo-500 mr-3" aria-hidden="true" />
              <span className="text-gray-500 text-sm">Loading English Masterclass…</span>
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
            <PracticeSession cat={selectedCat} words={words} onComplete={handleSessionComplete} />
          )}
          {!loadingInit && !initError && view === 'summary' && (
            <SessionSummary cat={selectedCat} attempts={sessionAttempts}
              onPracticeAgain={() => startPractice(selectedCat)} onBackToLevels={backToLevels} />
          )}
        </>
      )}
    </>
  );

  // ── Embedded mode — fits inside EMLayout (no standalone chrome) ───────────
  if (embedded) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-end mb-6">
            <TabBar activeTab={activeTab} onSelect={handleTabSelect} />
          </div>
          <Content />
        </div>
      </div>
    );
  }

  // ── Standalone mode (existing /student/english-masterclass route) ─────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/student/dashboard')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors font-medium">
              <ArrowLeft size={16} aria-hidden="true" /> Dashboard
            </button>
            <span className="text-gray-200 text-lg font-thin hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-sm">
                <span className="text-sm" aria-hidden="true">🇬🇧</span>
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900 leading-tight">English Masterclass</h1>
                <p className="text-[10px] text-gray-400">British English Vocabulary Training</p>
              </div>
            </div>
          </div>
          <TabBar activeTab={activeTab} onSelect={handleTabSelect} />
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <Content />
        </div>
      </div>
    </div>
  );
}
