// client/src/pages/EnglishMasterclass.jsx
// English Masterclass module — British English vocabulary training.
// Integrated into AISchoolOnAir as a standalone student module.
// Uses the same JWT auth and Gemini AI service as the rest of the platform.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/apiClient';
import {
  Volume2, ChevronRight, RotateCcw, Trophy, Target,
  Flame, BookOpen, Clock, CheckCircle2, XCircle,
  Loader2, AlertCircle, RefreshCw, Play, SkipForward,
  Info, Star, TrendingUp, Users, Sparkles, Plus,
  ChevronLeft,
} from 'lucide-react';

// ── Difficulty badge ──────────────────────────────────────────────────────────
function DiffBadge({ level }) {
  const map = {
    Beginner:     'bg-green-100 text-green-700',
    Intermediate: 'bg-blue-100 text-blue-700',
    Advanced:     'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${map[level] || 'bg-gray-100 text-gray-600'}`}>
      {level}
    </span>
  );
}

// ── Audio player — tries Gemini first, falls back to browser TTS ─────────────
function useAudio() {
  const [playing, setPlaying] = useState(false);

  const play = useCallback(async (word) => {
    if (playing) return;
    setPlaying(true);

    try {
      // Try Gemini audio first
      const res = await api.post('/english-masterclass/audio', { word });
      if (res.data?.audio) {
        const audioData = `data:${res.data.mimeType || 'audio/wav'};base64,${res.data.audio}`;
        const audio = new Audio(audioData);
        audio.onended  = () => setPlaying(false);
        audio.onerror  = () => { setPlaying(false); fallbackTTS(word); };
        await audio.play();
        return;
      }
    } catch (_) { /* fall through to browser TTS */ }

    fallbackTTS(word);
  }, [playing]);

  function fallbackTTS(word) {
    if (!('speechSynthesis' in window)) { setPlaying(false); return; }
    window.speechSynthesis.cancel();
    const utt   = new SpeechSynthesisUtterance(word);
    utt.lang    = 'en-GB'; // British English
    utt.rate    = 0.8;
    utt.pitch   = 1.0;
    utt.volume  = 1.0;

    // Prefer a British voice if available
    const voices = window.speechSynthesis.getVoices();
    const british = voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang.startsWith('en'));
    if (british) utt.voice = british;

    utt.onend   = () => setPlaying(false);
    utt.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utt);
  }

  return { playing, play };
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: PRACTICE
// ═════════════════════════════════════════════════════════════════════════════
function PracticeTab() {
  const [view, setView]                   = useState('categories'); // categories | practice | summary
  const [categories, setCategories]       = useState([]);
  const [loadingCats, setLoadingCats]     = useState(true);
  const [catError, setCatError]           = useState(null);
  const [selectedCat, setSelectedCat]     = useState(null);
  const [words, setWords]                 = useState([]);
  const [currentIdx, setCurrentIdx]       = useState(0);
  const [input, setInput]                 = useState('');
  const [attempts, setAttempts]           = useState([]);
  const [loadingWords, setLoadingWords]   = useState(false);
  const [explanation, setExplanation]     = useState(null);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [showExplain, setShowExplain]     = useState(false);
  const [feedback, setFeedback]           = useState(null); // null | 'correct' | 'wrong'
  const [sessionStart]                    = useState(Date.now());
  const { playing, play }                 = useAudio();
  const inputRef                          = useRef(null);

  useEffect(() => {
    setLoadingCats(true);
    api.get('/english-masterclass/categories')
      .then(r => setCategories(r.data || []))
      .catch(e => setCatError(e.message || 'Failed to load categories'))
      .finally(() => setLoadingCats(false));
  }, []);

  const startPractice = async (cat) => {
    setSelectedCat(cat);
    setLoadingWords(true);
    setAttempts([]);
    setCurrentIdx(0);
    setInput('');
    setFeedback(null);
    setShowExplain(false);
    setExplanation(null);
    try {
      const r = await api.get(`/english-masterclass/categories/${cat.id}/words`);
      setWords(r.data || []);
      setView('practice');
    } catch (e) {
      alert(e.message || 'Could not load words. Please try another category.');
    } finally {
      setLoadingWords(false);
    }
  };

  const fetchExplanation = async (word) => {
    if (explanation?.word === word) { setShowExplain(true); return; }
    setLoadingExplain(true);
    setShowExplain(true);
    try {
      const r = await api.post('/english-masterclass/word-explain', {
        word,
        context: selectedCat?.name,
      });
      setExplanation({ word, ...r.data });
    } catch {
      setExplanation({ word, error: true });
    } finally {
      setLoadingExplain(false);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    const currentWord = words[currentIdx];
    if (!currentWord) return;

    const isCorrect = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'wrong');

    setTimeout(() => {
      const newAttempts = [...attempts, {
        word_id:    currentWord.id,
        word:       currentWord.word,
        correct:    isCorrect,
        userAnswer: input.trim(),
      }];
      setAttempts(newAttempts);
      setFeedback(null);
      setShowExplain(false);
      setExplanation(null);
      setInput('');

      if (currentIdx < words.length - 1) {
        setCurrentIdx(i => i + 1);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        saveSession(newAttempts);
        setView('summary');
      }
    }, 900);
  };

  const handleSkip = () => {
    const currentWord = words[currentIdx];
    const newAttempts = [...attempts, {
      word_id:    currentWord.id,
      word:       currentWord.word,
      correct:    false,
      userAnswer: '',
    }];
    setAttempts(newAttempts);
    setShowExplain(false);
    setExplanation(null);
    setInput('');

    if (currentIdx < words.length - 1) {
      setCurrentIdx(i => i + 1);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      saveSession(newAttempts);
      setView('summary');
    }
  };

  const saveSession = async (finalAttempts) => {
    const correct       = finalAttempts.filter(a => a.correct).length;
    const duration_secs = Math.round((Date.now() - sessionStart) / 1000);
    try {
      await api.post('/english-masterclass/sessions', {
        category_id:   selectedCat?.id,
        category_name: selectedCat?.name || 'Unknown',
        total_words:   finalAttempts.length,
        correct_words: correct,
        duration_secs,
        answers:       finalAttempts,
      });
    } catch (e) {
      console.warn('[EM] Session save failed:', e.message);
    }
  };

  const reset = () => {
    setView('categories');
    setSelectedCat(null);
    setWords([]);
    setCurrentIdx(0);
    setInput('');
    setAttempts([]);
    setFeedback(null);
    setShowExplain(false);
    setExplanation(null);
  };

  // ── Category picker ─────────────────────────────────────────────────────
  if (view === 'categories') {
    if (loadingCats) return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-indigo-500 mr-2" />
        <span className="text-gray-500 text-sm">Loading categories…</span>
      </div>
    );

    if (catError) return (
      <div className="flex flex-col items-center py-20 gap-3">
        <AlertCircle size={24} className="text-red-400" />
        <p className="text-red-600 text-sm">{catError}</p>
        <button onClick={() => window.location.reload()}
          className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:underline">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );

    return (
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Choose a Category</h2>
          <p className="text-sm text-gray-500">Select a category to begin your British English practice session.</p>
        </div>

        {loadingWords && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 flex items-center gap-3 shadow-xl">
              <Loader2 size={20} className="animate-spin text-indigo-500" />
              <span className="text-sm font-medium text-gray-700">Loading words…</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => startPractice(cat)}
              className="group text-left bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl">{cat.icon_emoji || '📚'}</span>
                <DiffBadge level={cat.difficulty} />
              </div>
              <h3 className="font-bold text-gray-900 text-base mb-1">{cat.name}</h3>
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">{cat.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{cat.word_count} words</span>
                <span className="text-xs font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                  Start <ChevronRight size={12} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Practice session ────────────────────────────────────────────────────
  if (view === 'practice') {
    const currentWord = words[currentIdx];
    const progress    = (currentIdx / words.length) * 100;

    return (
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={reset}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ChevronLeft size={16} /> Categories
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-700">{selectedCat?.name}</span>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-500">Word {currentIdx + 1} of {words.length}</span>
            <span className="text-xs font-semibold text-indigo-600">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }} />
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

          {/* Play button */}
          <div className="flex justify-center mb-8">
            <button onClick={() => play(currentWord.word)} disabled={playing}
              className={`w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                playing ? 'scale-95 opacity-80' : 'hover:scale-105 hover:shadow-xl'
              }`}>
              <Volume2 size={32} className={playing ? 'animate-pulse' : ''} />
              <span className="text-[10px] font-semibold opacity-80">{playing ? 'Playing…' : 'Listen'}</span>
            </button>
          </div>

          {/* Phonetic hint */}
          {currentWord.phonetic && (
            <p className="text-center text-sm text-gray-400 italic mb-4">
              {currentWord.phonetic}
            </p>
          )}

          {/* Feedback overlay */}
          {feedback && (
            <div className={`flex items-center justify-center gap-2 py-3 rounded-xl mb-4 ${
              feedback === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {feedback === 'correct'
                ? <><CheckCircle2 size={18} /> <span className="font-bold">Correct!</span></>
                : <><XCircle      size={18} /> <span className="font-bold">The word was: {currentWord.word}</span></>
              }
            </div>
          )}

          {/* Input */}
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

        {/* AI Explain button */}
        <div className="mt-4 flex justify-center">
          <button onClick={() => fetchExplanation(currentWord.word)}
            className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition-colors">
            <Sparkles size={12} /> Ask AI to explain this word
          </button>
        </div>

        {/* AI Explanation panel */}
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

        {/* Recent attempts */}
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
                  {!a.correct && a.userAnswer && <span className="text-gray-400 ml-auto">you typed: {a.userAnswer || 'skipped'}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  if (view === 'summary') {
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
            <button onClick={() => startPractice(selectedCat)}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold text-sm hover:from-indigo-700 hover:to-purple-700 transition-all shadow-sm">
              Practice Again
            </button>
            <button onClick={reset}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all">
              New Category
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB: MY PROGRESS
// ═════════════════════════════════════════════════════════════════════════════
function ProgressTab() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    api.get('/english-masterclass/progress')
      .then(r => setData(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={22} className="animate-spin text-indigo-500 mr-2" />
      <span className="text-gray-400 text-sm">Loading progress…</span>
    </div>
  );

  if (error) return (
    <div className="text-center py-20 text-red-500 text-sm">{error}</div>
  );

  const { stats, recent_sessions = [], mastered_count = 0 } = data || {};

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900 mb-5">My Progress</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: BookOpen,  label: 'Words Learned',  value: stats?.words_learned || 0,        color: 'blue'   },
          { icon: Star,      label: 'Mastered',        value: mastered_count,                   color: 'amber'  },
          { icon: Flame,     label: 'Day Streak',      value: `${stats?.practice_streak || 0}d`, color: 'orange' },
          { icon: Target,    label: 'Accuracy',        value: `${Math.round(stats?.overall_accuracy || 0)}%`, color: 'green' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
            <s.icon size={18} className={`text-${s.color}-500 mx-auto mb-1`} />
            <div className={`text-2xl font-bold text-${s.color}-600 font-mono`}>{s.value}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Additional stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <Clock size={18} className="text-purple-500 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Total Practice Time</p>
            <p className="font-bold text-gray-900">{Math.round((stats?.total_practice_secs || 0) / 60)} minutes</p>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <TrendingUp size={18} className="text-indigo-500 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Total Sessions</p>
            <p className="font-bold text-gray-900">{stats?.total_sessions || 0}</p>
          </div>
        </div>
      </div>

      {/* Recent sessions */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Recent Sessions</h3>
        {recent_sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <BookOpen size={24} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No practice sessions yet.</p>
            <p className="text-xs mt-1">Head to the Practice tab to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recent_sessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{s.icon_emoji || '📚'}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.category_name}</p>
                    <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${s.accuracy >= 80 ? 'text-green-600' : s.accuracy >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                    {Math.round(s.accuracy)}%
                  </p>
                  <p className="text-xs text-gray-400">{s.correct_words}/{s.total_words} words</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function EnglishMasterclass() {
  const [activeTab, setActiveTab] = useState('practice');
  const { user } = useAuth();

  const tabs = [
    { id: 'practice', label: 'Practice',    icon: Play      },
    { id: 'progress', label: 'My Progress', icon: TrendingUp },
  ];

  return (
    <div className="flex-1 min-h-screen bg-gray-50">
      {/* Module header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-sm">
            <span className="text-lg">🇬🇧</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">English Masterclass</h1>
            <p className="text-xs text-gray-500">British English Vocabulary Training</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === t.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'practice' && <PracticeTab />}
        {activeTab === 'progress' && <ProgressTab />}
      </div>
    </div>
  );
}
