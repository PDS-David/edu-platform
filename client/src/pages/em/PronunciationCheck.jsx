// client/src/pages/em/PronunciationCheck.jsx
// Inline mic-based "Say it" exercise — the missing speaking-practice piece.
// Lives INSIDE the existing practice card (see PracticeSession.jsx). Deliberately
// not a separate card/page/route: one card per word, same as Listen + Type.
//
// Flow: tap "Say it" → record → tap "Stop" → uploads to
// POST /english-masterclass/pronunciation-score → Gemini transcribes + scores.
// Scoring is accent-fair by design (see the route's prompt): a Nigerian or
// Indian accent is not marked down, only genuine mispronunciation is.
//
// Cost control: each scored recording is a Gemini call, so the parent
// (PracticeSession) tracks a SOFT, SESSION-WIDE budget across all 10 words
// and passes it down as `attemptsUsed` / `budget` / `onAttempt`. "Soft"
// means: once the budget is used up, the mic exercise politely stops
// offering new scored attempts for the rest of the session, but typing
// answers and everything else keeps working normally — nothing is blocked,
// nobody is locked out, it just stops spending API calls.

import { useState, useRef, useEffect } from 'react';
import api from '../../services/apiClient';
import { Mic, Square, Loader2, Volume2, RotateCcw } from 'lucide-react';
import useMic from './useMic';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const scoreStyle = (s) =>
  s >= 80 ? 'text-green-700 bg-green-50 border-green-200'
  : s >= 55 ? 'text-amber-700 bg-amber-50 border-amber-200'
  : 'text-red-700 bg-red-50 border-red-200';

export default function PronunciationCheck({ word, wordId, onResult, attemptsUsed = 0, budget = Infinity, onAttempt }) {
  const { recording, error: micError, supported, start, stop } = useMic();
  const [status, setStatus]           = useState('idle'); // idle | scoring | done | error
  const [result, setResult]           = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const urlRef = useRef(null);

  const budgetLeft   = Math.max(0, budget - attemptsUsed);
  const budgetExhausted = budgetLeft <= 0;

  // Reset the widget whenever the word changes (new card).
  useEffect(() => {
    setStatus('idle');
    setResult(null);
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    setPlaybackUrl(null);
  }, [word]);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  if (!supported) {
    return (
      <p className="text-center text-xs text-gray-400 mt-3">
        Speaking practice needs microphone access, which this browser doesn't support.
      </p>
    );
  }

  const handleToggle = async () => {
    if (recording) {
      const blob = await stop();
      if (!blob || blob.size < 800) {
        setStatus('error');
        setResult({ error: 'That recording was too short — hold the button a little longer and say the word clearly.' });
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPlaybackUrl(url);
      setStatus('scoring');
      onAttempt?.(); // counts against the session budget — only for recordings we actually send for scoring
      try {
        const base64 = await blobToBase64(blob);
        const r = await api.post('/english-masterclass/pronunciation-score', {
          word,
          word_id: wordId || null,
          audio: base64,
          mime_type: blob.type || 'audio/webm',
        });
        if (r.data?.success) {
          setResult(r.data);
          setStatus('done');
          onResult?.(r.data.score);
        } else {
          setStatus('error');
          setResult({ error: r.data?.error || 'Could not check that recording. Please try again.' });
        }
      } catch (e) {
        setStatus('error');
        setResult({ error: 'Could not check that recording. Please try again.' });
      }
    } else {
      if (budgetExhausted) return; // soft cap — button is disabled in this state anyway
      setResult(null);
      start();
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleToggle}
          disabled={status === 'scoring' || (budgetExhausted && !recording)}
          aria-pressed={recording}
          aria-label={recording ? 'Stop recording' : 'Say the word'}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm ${
            recording
              ? 'bg-red-500 text-white'
              : status === 'scoring' || budgetExhausted
              ? 'bg-gray-100 text-gray-400'
              : 'bg-white border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          {status === 'scoring'
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : recording
            ? <Square size={16} aria-hidden="true" />
            : <Mic size={16} aria-hidden="true" />}
          {status === 'scoring' ? 'Checking…' : recording ? 'Stop' : 'Say it'}
        </button>

        {playbackUrl && status !== 'scoring' && (
          <button
            type="button"
            onClick={() => new Audio(playbackUrl).play()}
            aria-label="Play back your recording"
            className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all"
          >
            <Volume2 size={14} aria-hidden="true" /> Play mine
          </button>
        )}

        {(status === 'done' || status === 'error') && !budgetExhausted && (
          <button
            type="button"
            onClick={() => { setStatus('idle'); setResult(null); }}
            aria-label="Try again"
            className="flex items-center gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all"
          >
            <RotateCcw size={14} aria-hidden="true" /> Try again
          </button>
        )}
      </div>

      {micError && <p className="text-center text-xs text-red-500 mt-2">{micError}</p>}

      {status === 'done' && result && (
        <div className={`mt-3 mx-auto max-w-xs text-center border rounded-xl py-2 px-3 ${scoreStyle(result.score)}`}>
          <p className="text-sm font-bold">{result.score}/100</p>
          {result.feedback && <p className="text-xs mt-0.5">{result.feedback}</p>}
        </div>
      )}

      {status === 'error' && result?.error && !budgetExhausted && (
        <p className="text-center text-xs text-red-500 mt-2">{result.error}</p>
      )}

      {/* Soft session cap: friendly, not a dead end — typing still works fine. */}
      {budgetExhausted ? (
        <p className="text-center text-[11px] text-gray-400 mt-2">
          You've used up your speaking checks for this session — nice practice! Typing still counts as usual.
        </p>
      ) : Number.isFinite(budget) && budgetLeft <= 3 && status !== 'scoring' && (
        <p className="text-center text-[11px] text-gray-300 mt-2">
          {budgetLeft} speaking {budgetLeft === 1 ? 'check' : 'checks'} left this session
        </p>
      )}
    </div>
  );
}
