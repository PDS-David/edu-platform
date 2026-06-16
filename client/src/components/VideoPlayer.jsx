// client/src/components/VideoPlayer.jsx
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY + PLAYBACK REMEDIATION (2026-06-16)
//
// Changes from original:
//
//   FUNC-02 / Safari fix:
//     hls.js is used on browsers that support MSE (Chrome, Firefox, Edge).
//     On Safari/iOS where Hls.isSupported() === false, the native <video> tag
//     is used with a short-lived streaming token (?tok=) embedded in the URL
//     so no Authorization header is needed. The token is fetched from
//     GET /api/videos/token?videoId=:id and is valid for 15 minutes.
//
//   SEC-03 partial:
//     localStorage.getItem('token') is still used for hls.js xhrSetup because
//     that path requires a custom header.  The Safari native path avoids
//     localStorage entirely by using server-issued per-session tokens.
//     Migrating away from localStorage fully requires switching to HttpOnly
//     cookies for the main JWT (separate auth-layer change).
//
//   FUNC-03 / ABR:
//     The master.m3u8 now contains 4 renditions (240p/480p/720p/1080p).
//     hls.js handles quality switching automatically. A quality indicator
//     is shown in the player UI.
//
//   Fullscreen:
//     Added webkit prefixed fallback for older Safari.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import api from '../services/apiClient';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, Loader2, AlertTriangle, CheckCircle2, Lock, Wifi
} from 'lucide-react';

// ─────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────
const formatTime = (secs) => {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Build absolute API base (strips /api suffix if present)
const getApiBase = () =>
  (import.meta.env.VITE_API_URL || '').replace(/\/$/, '').replace(/\/api$/, '');

export default function VideoPlayer({ videoId, onComplete }) {
  const videoRef    = useRef(null);
  const hlsRef      = useRef(null);
  const intervalRef = useRef(null);

  // ─────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────
  const [videoData,    setVideoData]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notEnrolled,  setNotEnrolled]  = useState(false);

  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isMuted,      setIsMuted]      = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [volume,      setVolume]      = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [buffered,    setBuffered]    = useState(0);

  const [watchPct,     setWatchPct]     = useState(0);
  const [isCompleted,  setIsCompleted]  = useState(false);
  const [resumePos,    setResumePos]    = useState(0);
  const [showResume,   setShowResume]   = useState(false);

  const [qualityLabel, setQualityLabel] = useState('');

  // ─────────────────────────────────────────────
  // Load video metadata + saved progress
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      setAccessDenied(false);
      setNotEnrolled(false);

      try {
        const [videoRes, progressRes] = await Promise.all([
          api.get(`/videos/${videoId}`),
          api.get(`/videos/${videoId}/progress`),
        ]);

        setVideoData(videoRes.data);

        const p = progressRes.data;
        if (p?.current_position_seconds > 10) {
          setResumePos(p.current_position_seconds);
          setShowResume(true);
        }
        setWatchPct(p?.watch_percentage ?? 0);
        setIsCompleted(p?.is_completed ?? false);

      } catch (err) {
        const status = err?.response?.status;
        const code   = err?.response?.data?.code;

        if (status === 403 && code === 'NOT_ENROLLED') {
          setNotEnrolled(true);
        } else if (status === 403) {
          setAccessDenied(true);
        } else {
          setError(err?.response?.data?.error || 'Failed to load video');
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [videoId]);

  // ─────────────────────────────────────────────
  // HLS init — handles both hls.js and Safari native
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoData || !videoRef.current) return;

    const video   = videoRef.current;
    const apiBase = getApiBase();

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const initHlsJs = (streamUrl) => {
      const hls = new Hls({
        // Inject Authorization header on every XHR (manifest, segment, key)
        xhrSetup: (xhr, url) => {
          const token = localStorage.getItem('token');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        },
        // Start with lowest quality and adapt up — good for Nigerian connections
        startLevel: 0,
        capLevelToPlayerSize: true,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        // Show active quality label
        const level = hls.levels[data.level];
        if (level) {
          const h = level.height;
          setQualityLabel(h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : '240p');
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad(); // retry on network error
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError('Video stream error. Please refresh.');
          }
        }
      });

      hlsRef.current = hls;
    };

    const initNativeHls = async (videoId) => {
      // Safari / iOS native HLS: fetch a short-lived streaming token,
      // embed it as ?tok= so no Authorization header is needed.
      try {
        const tokenRes = await api.get(`/videos/token?videoId=${videoId}`);
        const { streamUrl } = tokenRes.data;
        video.src = `${apiBase}${streamUrl}`;
        setQualityLabel('Auto');
      } catch (err) {
        setError('Failed to initialize video playback on this browser.');
      }
    };

    const streamPath = `/api/videos/stream/${videoId}/master.m3u8`;
    const streamUrl  = `${apiBase}${streamPath}`;

    if (Hls.isSupported()) {
      initHlsJs(streamUrl);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS
      initNativeHls(videoId);
    } else {
      setError('Your browser does not support HLS video playback.');
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [videoData, videoId]);

  // ─────────────────────────────────────────────
  // Save progress
  // ─────────────────────────────────────────────
  const saveProgress = useCallback(async (pos, dur) => {
    if (!videoId || !dur) return;
    const pct = Math.min((pos / dur) * 100, 100);

    try {
      await api.post(`/videos/${videoId}/progress`, {
        current_position_seconds: Math.round(pos),
        total_watched_seconds:    Math.round(pos),
        watch_percentage:         Number(pct.toFixed(2)),
      });

      setWatchPct(pct);

      if (pct >= 90 && !isCompleted) {
        setIsCompleted(true);
        onComplete?.();
      }
    } catch {
      // silent — don't break UX on progress save failures
    }
  }, [videoId, isCompleted, onComplete]);

  // ─────────────────────────────────────────────
  // Video event listeners
  // ─────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    const onLoadedMetadata = () => setDuration(video.duration);
    const onPlay           = () => setIsPlaying(true);
    const onPause          = () => {
      setIsPlaying(false);
      saveProgress(video.currentTime, video.duration);
    };
    const onEnded = () => {
      setIsPlaying(false);
      saveProgress(video.duration, video.duration);
    };
    const onFullscreenChange = () => {
      setIsFullscreen(
        !!(document.fullscreenElement || document.webkitFullscreenElement)
      );
    };

    video.addEventListener('timeupdate',      onTimeUpdate);
    video.addEventListener('loadedmetadata',  onLoadedMetadata);
    video.addEventListener('play',            onPlay);
    video.addEventListener('pause',           onPause);
    video.addEventListener('ended',           onEnded);
    document.addEventListener('fullscreenchange',       onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    // Periodic autosave every 10 seconds
    intervalRef.current = setInterval(() => {
      if (!video.paused && video.duration) {
        saveProgress(video.currentTime, video.duration);
      }
    }, 10000);

    return () => {
      video.removeEventListener('timeupdate',      onTimeUpdate);
      video.removeEventListener('loadedmetadata',  onLoadedMetadata);
      video.removeEventListener('play',            onPlay);
      video.removeEventListener('pause',           onPause);
      video.removeEventListener('ended',           onEnded);
      document.removeEventListener('fullscreenchange',       onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      clearInterval(intervalRef.current);
      if (video.currentTime && video.duration) {
        saveProgress(video.currentTime, video.duration);
      }
    };
  }, [saveProgress]);

  // ─────────────────────────────────────────────
  // Controls
  // ─────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleVolumeChange = (e) => {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const handleSeek = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * duration;
  };

  const toggleFullscreen = () => {
    const el = videoRef.current?.parentElement;
    if (!el) return;

    const fsElement = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fsElement) {
      // Enter fullscreen — try standard API first, then webkit prefix for Safari
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  };

  const skip = (s) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.currentTime + s, duration));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': skip(10); break;
        case 'ArrowLeft':  skip(-10); break;
        case 'ArrowUp':    { const v = videoRef.current; if (v) v.volume = Math.min(1, v.volume + 0.1); break; }
        case 'ArrowDown':  { const v = videoRef.current; if (v) v.volume = Math.max(0, v.volume - 0.1); break; }
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': toggleMute(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration]);

  // ─────────────────────────────────────────────
  // UI States
  // ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="aspect-video bg-black flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2" />
        <span>Loading video…</span>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="aspect-video bg-gray-900 flex flex-col items-center justify-center text-white gap-2">
        <Lock size={32} />
        <p className="font-semibold">Subscription upgrade required</p>
        <p className="text-sm text-gray-400">Upgrade your plan to watch this video.</p>
      </div>
    );
  }

  if (notEnrolled) {
    return (
      <div className="aspect-video bg-gray-900 flex flex-col items-center justify-center text-white gap-2">
        <Lock size={32} />
        <p className="font-semibold">Course enrollment required</p>
        <p className="text-sm text-gray-400">Enroll in this course to watch its videos.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aspect-video bg-gray-900 flex flex-col items-center justify-center text-white gap-2">
        <AlertTriangle size={32} />
        <p>{error}</p>
      </div>
    );
  }

  const progressPct  = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct  = duration ? (buffered   / duration) * 100 : 0;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {videoData && (
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">{videoData.title}</h2>
          {isCompleted && <CheckCircle2 className="text-green-600" size={20} />}
        </div>
      )}

      <div className="relative aspect-video bg-black rounded-xl overflow-hidden group">

        <video
          ref={videoRef}
          className="w-full h-full"
          playsInline
          crossOrigin="use-credentials"
        />

        {/* Resume banner */}
        {showResume && (
          <div className="absolute top-4 left-4 right-4 bg-black/80 rounded-lg p-3 flex items-center justify-between text-white text-sm">
            <span>Resume from {formatTime(resumePos)}?</span>
            <div className="flex gap-2">
              <button
                className="bg-green-600 px-3 py-1 rounded"
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime = resumePos;
                  setShowResume(false);
                }}
              >Resume</button>
              <button
                className="bg-gray-600 px-3 py-1 rounded"
                onClick={() => setShowResume(false)}
              >Start over</button>
            </div>
          </div>
        )}

        {/* Click overlay */}
        <div className="absolute inset-0" onClick={togglePlay} />

        {/* Controls */}
        <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/90 p-3 opacity-0 group-hover:opacity-100 transition-opacity">

          {/* Progress bar */}
          <div
            className="h-1.5 bg-white/30 rounded-full cursor-pointer relative mb-2"
            onClick={handleSeek}
          >
            <div className="absolute h-full bg-white/40 rounded-full" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute h-full bg-green-500 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="flex items-center gap-2 text-white text-sm">

            <button onClick={togglePlay} className="hover:text-green-400 transition-colors">
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>

            <button onClick={() => skip(-10)} className="hover:text-green-400 transition-colors" title="Back 10s">
              <RotateCcw size={16} />
            </button>

            <button onClick={() => skip(10)} className="hover:text-green-400 transition-colors" title="Forward 10s">
              <RotateCcw size={16} className="scale-x-[-1]" />
            </button>

            <span className="text-xs tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>

            <div className="flex-1" />

            {qualityLabel && (
              <span className="flex items-center gap-1 text-xs bg-white/20 px-1.5 py-0.5 rounded">
                <Wifi size={12} />{qualityLabel}
              </span>
            )}

            <button onClick={toggleMute} className="hover:text-green-400 transition-colors">
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            <input
              type="range" min="0" max="1" step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-16 accent-green-500"
            />

            <button onClick={toggleFullscreen} className="hover:text-green-400 transition-colors">
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>

          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500">{Math.round(watchPct)}% watched</div>
    </div>
  );
}
