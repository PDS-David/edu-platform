// client/src/pages/EnglishMasterclass.jsx
// English Masterclass — standalone full-screen module.
// Progressive difficulty: Beginner always open, Intermediate/Advanced unlock
// after passing the prior tier with ≥60% accuracy.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import {
  Volume2, ChevronRight, RotateCcw, Trophy,
  Flame, BookOpen, CheckCircle2, XCircle,
  Loader2, AlertCircle, RefreshCw, Play, SkipForward,
  Info, Star, TrendingUp, Sparkles,
  ChevronLeft, ArrowLeft, Award,
} from 'lucide-react';

// ── Shared EM sub-components (extracted so EMDashboard can also use them) ────
import DiffBadge, { DIFF_STYLE } from './em/DiffBadge';
import LevelGate                  from './em/LevelGate';
import LevelSection               from './em/LevelSection';
// ProgressTab is the ProgressContent component from EMProgress — single source
// of truth used by both the /em/progress standalone page and this embedded tab.
import { ProgressContent as ProgressTab } from './em/EMProgress';

// ── Audio hook — tries Gemini first, falls back to browser TTS ────────────────
function useAudio() {
  const [playing, setPlaying] = useState(false);

  const play = useCallback(async (word) => {
    if (playing) return;
    setPlaying(true);

    try {
      const res = await api.post('/english-masterclass/audio', { word });
      if (res.data?.audio) {
        const audioData = `data:${res.data.mimeType || 'audio/wav'};base64,${res.data.audio}`;
        const audio = new Audio(audioData);
        audio.onended  = () => setPlaying(false);
        audio.onerror  = () => { setPlaying(false); fallbackTTS(word); };
        await audio.play();
        return;
      }
    } catch (_) { /* fall through */ }

    fallbackTTS(word);
  }, [playing]);

  function fallbackTTS(word) {
    if (!('speechSynthesis' in window)) { setPlaying(false); return; }
    window.speechSynthesis.cancel();
    const utt   = new SpeechSynthesisUtterance(word);
    utt.lang    = 'en-GB';
    utt.rate    = 0.8;
    utt.pitch   = 1.0;
    utt.volume  = 1.0;
    utt.onend   = () => setPlaying(false);
    utt.onerror = () => setPlaying(false);

    function speakWithVoice() {
      const voices  = window.speechSynthesis.getVoices();
      const british = voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en'));
      if (british) utt.voice = british;
      window.speechSynthesis.speak(utt);
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      speakWithVoice();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        speakWithVoice();
      };
    }
  }

  return { playing, play };
}

// LevelGate, LevelSection, DiffBadge are now imported above from ./em/

// ═════════════════════════════════════════════════════════════════════════════
// PRACTICE SESSION VIEW
// ═════════════════════════════════════════════════════════════════════════════
function PracticeSession({ cat, words, onComplete, onBack }) {
  const [currentIdx, setCurrentIdx]         = useState(0);
  const [input, setInput]                   = useState('');
  const [attempts, setAttempts]             = useState([]);
  const [feedback, setFeedback]             = useState(null);
  const [explanation, setExplanation]       = useState(null);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [showExplain, setShowExplain]       = useState(false);
  const [sessionStart]                      = useState(Date.now());
  const { playing, play }                   = useAudio();
  const inputRef                            = useRef(null);

  const currentWord = words[currentIdx];
  const progress    = (currentIdx / words.length) * 100;

  const fetchExplanation = async (word) => {
    if (explanation?.word === word) { setShowExplain(true); return; }
    setLoadingExplain(true);
    setShowExplain(true);
    try {
      const r = await api.post('/english-masterclass/word-explain', {
        word,
        context: cat?.name,
        word_id: currentWord?.id || null,
      });
      setExplanation({ word, ...r.data });
    } catch {
      setExplanation({ word, error: true });
    } finally {
      setLoadingExplain(false);
    }
  };

  const advance = (newAttempts) => {
    setFeedback(null);
    setShowExplain(false);
    setExplanation(null);
    setInput('');
    if (currentIdx < words.length - 1) {
      setCurrentIdx(i => i + 1);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      onComplete(newAttempts, Math.round((Date.now() - sessionStart) / 1000));
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!currentWord) return;
    const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'wrong');
    const newAttempts = [...attempts, { word_id: currentWord.id, word: currentWord.word, correct: isCorrect, userAnswer: input.trim() }];
    setAttempts(newAttempts);
    setTimeout(() => advance(newAttempts), 900);
  };

  const handleSkip = () => {
    const newAttempts = [...attempts, { word_id: currentWord.id, word: currentWord.word, correct: false, userAnswer: '' }];
    setAttempts(newAttempts);
    setShowExplain(false);
    setExplanation(null);
    setInput('');
    advance(newAttempts);
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Back + category label */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ChevronLeft size={16} /> Levels
        </button>
        <span className="text-gray-300">|</span>
        <span className="text-sm font-medium text-gray-700">{cat?.name}</span>
        <DiffBadge level={cat?.difficulty} />
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between mb-1">
          <span className="text-xs text-gray-500">Word {currentIdx + 1} of {words.length}</span>
          <span className="text-xs font-semibold text-indigo-600">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Practice card */}
      <div className={`bg-white rounded-2xl border-2 shadow-sm p-6 transition-all duration-300 ${
        feedback === 'correct' ? 'border-green-400 bg-green-50'
        : feedback === 'wrong'   ? 'border-red-400 bg-red-50'
        : 'border-gray-100'
      }`}>
        <p className="text-center text-sm font-semibold text-gray-500 mb-6 uppercase tracking-wider">
          🇬🇧 Listen and type what you hear
        </p>

        <div className="flex justify-center mb-8">
          <button onClick={() => play(currentWord.word)} disabled={playing}
            className={`w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
              playing ? 'scale-95 opacity-80' : 'hover:scale-105 hover:shadow-xl'
            }`}>
            <Volume2 size={32} className={playing ? 'animate-pulse' : ''} />
            <span className="text-[10px] font-semibold opacity-80">{playing ? 'Playing…' : 'Listen'}</span>
          </button>
        </div>

        {currentWord.phonetic && (
          <p className="text-center text-sm text-gray-400 italic mb-4">{currentWord.phonetic}</p>
        )}

        {feedback && (
          <div className={`flex items-center justify-center gap-2 py-3 rounded-xl mb-4 ${
            feedback === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {feedback === 'correct'
              ? <><CheckCircle2 size={18} /> <span className="font-bold">Correct!</span></>
              : <><XCircle size={18} /> <span className="font-bold">The word was: {currentWord.word}</span></>}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type what you heard…"
            disabled={!!feedback}
            autoFocus
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-base focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all mb-4"
          />
          <div className="flex gap-3">
            <button type="submit" disabled={!input.trim() || !!feedback}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm">
              Submit
            </button>
            <button type="button" onClick={handleSkip} disabled={!!feedback}
              className="flex items-center gap-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all disabled:opacity-40">
              <SkipForward size={14} /> Skip
            </button>
          </div>
        </form>
      </div>

      {/* AI Explain */}
      <div className="mt-4 flex justify-center">
        <button onClick={() => fetchExplanation(currentWord.word)}
          className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition-colors">
          <Sparkles size={12} /> Ask AI to explain this word
        </button>
      </div>

      {showExplain && (
        <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          {loadingExplain ? (
            <div className="flex items-center gap-2 text-sm text-indigo-600">
              <Loader2 size={14} className="animate-spin" /> Asking AI…
            </div>
          ) : explanation?.error ? (
            <p className="text-sm text-red-500">Could not load explanation. Please try again.</p>
          ) : explanation ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-gray-700"><span className="font-semibold">Definition:</span> {explanation.definition}</p>
              </div>
              <div className="flex items-start gap-2">
                <BookOpen size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-gray-700"><span className="font-semibold">Example:</span> <em>{explanation.example_sentence}</em></p>
              </div>
              {explanation.usage_tip && (
                <div className="flex items-start gap-2">
                  <Star size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-gray-700"><span className="font-semibold">Tip:</span> {explanation.usage_tip}</p>
                </div>
              )}
              {explanation.british_vs_american && explanation.british_vs_american !== 'null' && (
                <div className="flex items-start gap-2">
                  <span className="text-sm shrink-0">🇬🇧🆚🇺🇸</span>
                  <p className="text-gray-600 text-xs">{explanation.british_vs_american}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Recent attempts mini log */}
      {attempts.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-gray-400 mb-2 font-medium">Recent attempts</p>
          <div className="space-y-1.5">
            {attempts.slice(-3).map((a, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                a.correct ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {a.correct ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                <span>{a.word}</span>
                {!a.correct && a.userAnswer && <span className="text-gray-400 ml-auto">you typed: {a.userAnswer}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SESSION SUMMARY VIEW
// ═════════════════════════════════════════════════════════════════════════════
function SessionSummary({ cat, attempts, onPracticeAgain, onBackToLevels }) {
  const correct  = attempts.filter(a => a.correct).length;
  const accuracy = Math.round((correct / attempts.length) * 100);

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">
            {accuracy >= 80 ? '🎉' : accuracy >= 60 ? '👍' : '💪'}
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Practice Complete!</h2>
          <p className="text-sm text-gray-500">
            {accuracy >= 80 ? 'Excellent British English!' : accuracy >= 60 ? 'Good effort — keep going!' : 'Every word practised is progress!'}
          </p>

          {/* Unlock hint */}
          {cat?.difficulty === 'Beginner' && accuracy >= 60 && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-semibold">
              <Award size={12} /> You may have unlocked Intermediate!
            </div>
          )}
          {cat?.difficulty === 'Intermediate' && accuracy >= 60 && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full font-semibold">
              <Award size={12} /> You may have unlocked Advanced!
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Words',    value: attempts.length, color: 'blue'   },
            { label: 'Correct',  value: correct,          color: 'green'  },
            { label: 'Accuracy', value: `${accuracy}%`,   color: 'purple' },
          ].map(s => (
            <div key={s.label} className={`bg-${s.color}-50 rounded-xl p-3 text-center`}>
              <div className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</div>
              <div className={`text-[11px] font-medium text-${s.color}-700 mt-0.5`}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2 mb-6">
          {attempts.map((a, i) => (
            <div key={i} className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 ${
              a.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                {a.correct ? <CheckCircle2 size={15} className="text-green-500" /> : <XCircle size={15} className="text-red-500" />}
                {a.word}
              </div>
              {!a.correct && (
                <span className="text-xs text-gray-500">{a.userAnswer ? `you: "${a.userAnswer}"` : 'skipped'}</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onPracticeAgain}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold text-sm hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm">
            Practice Again
          </button>
          <button onClick={onBackToLevels}
            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all">
            All Levels
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PROGRESS TAB
// ═════════════════════════════════════════════════════════════════════════════
// ProgressTab is imported from ./em/EMProgress above.

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// Props:
//   embedded   {boolean} — when true, renders without the standalone
//                         min-h-screen wrapper and sticky header.
//                         Used by /em/practice and /em/progress where
//                         EMLayout already provides the nav shell.
//   defaultTab {string}  — 'practice' | 'progress'  (default: 'practice')
// ═════════════════════════════════════════════════════════════════════════════
export default function EnglishMasterclass({ embedded = false, defaultTab = 'practice', initialCategory = null }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab]       = useState(defaultTab);
  // practice flow states
  const [view, setView]                 = useState('levels'); // levels | session | summary
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
        if (initialCategory) {
          startPractice(initialCategory);
        }
      })
      .catch(e => setInitError(e.message || 'Failed to load English Masterclass'))
      .finally(() => setLoadingInit(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh level progress after a session completes (may unlock new level)
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
    // Refresh level progress in background (a new unlock may have occurred)
    refreshLevelProgress();
    setView('summary');
  };

  const backToLevels = () => {
    setView('levels');
    setSelectedCat(null);
    setWords([]);
    setSessionAttempts([]);
  };

  // Group categories by difficulty
  const byDiff = { Beginner: [], Intermediate: [], Advanced: [] };
  categories.forEach(c => {
    if (byDiff[c.difficulty]) byDiff[c.difficulty].push(c);
  });

  const tabs = [
    { id: 'practice', label: 'Practice',    icon: Play       },
    { id: 'progress', label: 'My Progress', icon: TrendingUp },
  ];

  // Shared tab bar component
  const TabBar = () => (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {tabs.map(t => (
        <button key={t.id} onClick={() => { setActiveTab(t.id); if (t.id === 'practice') backToLevels(); }}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            activeTab === t.id
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <t.icon size={13} />
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );

  // ── Shared content block (used in both embedded and standalone) ───────────
  const Content = () => (
    <>
      {activeTab === 'progress' && <ProgressTab />}

      {activeTab === 'practice' && (
        <>
          {loadingInit && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={24} className="animate-spin text-indigo-500 mr-3" />
              <span className="text-gray-500 text-sm">Loading English Masterclass…</span>
            </div>
          )}
          {!loadingInit && initError && (
            <div className="flex flex-col items-center py-24 gap-3">
              <AlertCircle size={24} className="text-red-400" />
              <p className="text-red-600 text-sm">{initError}</p>
              <button onClick={() => window.location.reload()}
                className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline">
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}
          {!loadingInit && !initError && view === 'levels' && (
            <div>
              {levelProgress && !Object.values(levelProgress.category_progress || {}).length && (
                <div className="mb-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
                  <h2 className="text-xl font-bold mb-1">Welcome to English Masterclass 🇬🇧</h2>
                  <p className="text-sm text-indigo-100 leading-relaxed">
                    Master British English vocabulary step by step. Start with <span className="font-semibold">Beginner</span> categories below.
                    Score 60% or higher to unlock the next level!
                  </p>
                </div>
              )}
              {levelProgress && Object.values(levelProgress.category_progress || {}).length > 0 && (
                <div className="mb-8 grid grid-cols-3 gap-3">
                  {['Beginner', 'Intermediate', 'Advanced'].map(d => {
                    const unlocked = levelProgress.unlocked?.[d];
                    const s = DIFF_STYLE[d];
                    return (
                      <div key={d} className={`rounded-xl p-3 text-center border-2 ${unlocked ? `border-transparent bg-gradient-to-br ${s.glow} text-white shadow-sm` : 'border-dashed border-gray-200 bg-gray-50'}`}>
                        <div className="text-lg mb-0.5">{d === 'Beginner' ? '🌱' : d === 'Intermediate' ? '🔥' : '⚡'}</div>
                        <div className={`text-xs font-bold ${unlocked ? 'text-white' : 'text-gray-400'}`}>{d}</div>
                        <div className={`text-[10px] mt-0.5 ${unlocked ? 'text-white/80' : 'text-gray-400'}`}>{unlocked ? 'Unlocked' : 'Locked'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {['Beginner', 'Intermediate', 'Advanced'].map(diff => (
                <LevelSection
                  key={diff}
                  level={diff}
                  categories={byDiff[diff]}
                  unlocked={levelProgress?.unlocked?.[diff] ?? (diff === 'Beginner')}
                  categoryProgress={levelProgress?.category_progress}
                  onStart={startPractice}
                  loadingId={loadingCatId}
                />
              ))}
            </div>
          )}
          {!loadingInit && !initError && view === 'session' && selectedCat && words.length > 0 && (
            <PracticeSession
              cat={selectedCat}
              words={words}
              onComplete={handleSessionComplete}
              onBack={backToLevels}
            />
          )}
          {!loadingInit && !initError && view === 'summary' && (
            <SessionSummary
              cat={selectedCat}
              attempts={sessionAttempts}
              onPracticeAgain={() => startPractice(selectedCat)}
              onBackToLevels={backToLevels}
            />
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
            <TabBar />
          </div>
          <Content />
        </div>
      </div>
    );
  }

  // ── Standalone mode (existing student portal route) ───────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Standalone header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">

          {/* Left: back + branding */}
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/student/dashboard')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors font-medium">
              <ArrowLeft size={16} /> Dashboard
            </button>
            <span className="text-gray-200 text-lg font-thin hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-sm">
                <span className="text-sm">🇬🇧</span>
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900 leading-tight">English Masterclass</h1>
                <p className="text-[10px] text-gray-400">British English Vocabulary Training</p>
              </div>
            </div>
          </div>

          {/* Right: tab switcher */}
          <TabBar />
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 sm:px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <Content />
        </div>
      </div>
    </div>
  );
}