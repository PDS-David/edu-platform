// client/src/pages/em/useAudio.js
// Audio hook — tries Gemini TTS first, falls back to browser SpeechSynthesis.
// Extracted verbatim from EnglishMasterclass.jsx (Task 7/8). No logic changes.
//
// Used by: PracticeSession.jsx

import { useState, useCallback } from 'react';
import api from '../../services/apiClient';

export default function useAudio() {
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
