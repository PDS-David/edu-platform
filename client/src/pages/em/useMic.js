// client/src/pages/em/useMic.js
// Microphone recording hook for the pronunciation-scoring exercise.
//
// Uses MediaRecorder (not the browser's built-in SpeechRecognition) on
// purpose: SpeechRecognition is Chrome-only in practice, routes audio
// through a single vendor's recognizer, and its accuracy varies a lot by
// accent. MediaRecorder is supported in all modern browsers (Chrome,
// Firefox, Safari 14.1+, Edge) and just captures raw audio — recognition
// and (accent-fair) scoring happen server-side via Gemini instead, which
// gives every learner the same evaluation path regardless of browser.

import { useState, useRef, useCallback } from 'react';

export default function useMic() {
  const [recording, setRecording] = useState(false);
  const [error, setError]         = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const streamRef        = useRef(null);

  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined';

  const start = useCallback(async () => {
    setError(null);
    if (!supported) {
      setError("Speaking practice isn't supported in this browser. Please try Chrome, Edge, Firefox, or Safari.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType =
        window.MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : window.MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : '';

      const mr = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      setError('Microphone access was denied. Please allow microphone access to practise speaking.');
    }
  }, [supported]);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') { setRecording(false); resolve(null); return; }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setRecording(false);
        resolve(blob);
      };
      mr.stop();
    });
  }, []);

  return { recording, error, supported, start, stop };
}
