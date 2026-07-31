// client/src/pages/lang/useLangAudio.js
// Same shape as em/useAudio.js, parameterized by language. Unlike English
// Masterclass (which deliberately avoids pinning to any one English accent —
// see the British-English-neutralization work elsewhere in this app),
// French and German are different languages, not accent variants of one —
// so specifying fr-FR/de-DE for the browser TTS fallback is simply correct,
// not a repeat of that earlier mistake.

import { useState, useRef, useCallback } from 'react';
import api from '../../services/apiClient';

const LOCALE = { french: 'fr-FR', german: 'de-DE' };

export function useLangAudio(language) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  const play = useCallback(async (word) => {
    if (!word || playing) return;
    setPlaying(true);

    try {
      const res = await api.post(`/language-masterclass/${language}/audio`, { word });
      if (res?.data?.success && res.data.audio) {
        const audio = new Audio(`data:${res.data.mimeType || 'audio/wav'};base64,${res.data.audio}`);
        audioRef.current = audio;
        audio.onended = () => setPlaying(false);
        audio.onerror = () => { setPlaying(false); speakWithBrowser(word); };
        await audio.play();
        return;
      }
    } catch {
      // fall through to browser TTS
    }
    speakWithBrowser(word);

    function speakWithBrowser(text) {
      if (!('speechSynthesis' in window)) { setPlaying(false); return; }
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = LOCALE[language] || 'en';
      utt.rate = 0.85;
      utt.onend = () => setPlaying(false);
      utt.onerror = () => setPlaying(false);

      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.lang === LOCALE[language]) || voices.find(v => v.lang?.startsWith(LOCALE[language]?.slice(0, 2)));
      if (match) utt.voice = match;
      window.speechSynthesis.speak(utt);
    }
  }, [language, playing]);

  return { playing, play };
}
