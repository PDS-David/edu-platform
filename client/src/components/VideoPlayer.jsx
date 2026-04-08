// client/src/components/VideoPlayer.jsx
// ─────────────────────────────────────────────────────────────────────────────
// HLS video player with:
//   - AES-128 decryption via hls.js
//   - Resume from last position
//   - Auto-save progress every 10 seconds + on pause/unmount
//   - Completion detection at 90% watched
//   - Subscription access error handling
//   - Mobile responsive
//
// npm install: cd client && npm install hls.js
//
// Usage:
//   <VideoPlayer videoId={42} courseId="uuid-here" />
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import api from '../services/api';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, Loader2, AlertTriangle, CheckCircle2, Lock
} from 'lucide-react';

// ── Format seconds → MM:SS or HH:MM:SS ───────────────────────────────────────
const formatTime = (secs) => {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function VideoPlayer({ videoId, onComplete }) {
  const videoRef    = useRef(null);
  const hlsRef      = useRef(null);
  const progressRef = useRef(null);       // interval timer
  const saveTimerRef = useRef(null);      // debounce save

  // ── State ──────────────────────────────────────────────────────────────────
  const [videoData, setVideoData]         = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [accessDenied, setAccessDenied]   = useState(false);

  // Player controls
  const [isPlaying, setIsPlaying]         = useState(false);
  const [isMuted, setIsMuted]             = useState(false);
  const [isFullscreen, setIsFullscreen]   = useState(false);
  const [volume, setVolume]               = useState(1);
  const [currentTime, setCurrentTime]     = useState(0);
  const [duration, setDuration]           = useState(0);
  const [buffered, setBuffered]           = useState(0);
  const [showControls, setShowControls]   = useState(true);
  const [isCompleted, setIsCompleted]     = useState(false);
  const [watchPct, setWatchPct]           = useState(0);
  const [resumePos, setResumePos]         = useState(0);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // ── 1. Fetch video metadata + saved progress ────────────────────────────────
  useEffect(() => {
    if (!videoId) return;

    const fetchVideo = async () => {
      setLoading(true);
      setError(null);
      try {
        const [videoRes, progressRes] = await Promise.all([
          api.get(`/videos/${videoId}`),
          api.get(`/videos/${videoId}/progress`),
        ]);

        setVideoData(videoRes.data);
        const prog = progressRes.data;
        if (prog.current_position_seconds > 10) {
          setResumePos(prog.current_position_seconds);
          setShowResumeBanner(true);
        }
        setIsCompleted(prog.is_completed || false);
        setWatchPct(prog.watch_percentage || 0);

      } catch (err) {
        if (err?.status === 403 || err?.statusCode === 403) {
          setAccessDenied(true);
        } else {
          setError(err?.error || 'Failed to load video');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId]);

  // ── 2. Initialize HLS.js after videoData loads ─────────────────────────────
  useEffect(() => {
    if (!videoData || !videoRef.current) return;

    const video    = videoRef.current;
    const streamUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/videos/stream/${videoId}/master.m3u8`;

    const initHls = () => {
      // Destroy previous instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          // Pass auth token in key requests so our /key/:keyId endpoint
          // can verify the user before serving the decryption key
          xhrSetup: (xhr, url) => {
            const token = localStorage.getItem('token');
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          },
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        });

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('[VideoPlayer] HLS manifest parsed, ready to play');
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.error('[VideoPlayer] Fatal HLS error:', data);
            setError('Video stream error. Please try again.');
          }
        });

        hlsRef.current = hls;

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari / iOS)
        video.src = streamUrl;
      } else {
        setError('Your browser does not support HLS video playback.');
      }
    };

    initHls();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoData, videoId]);

  // ── 3. Save progress to API ────────────────────────────────────────────────
  const saveProgress = useCallback(async (pos, dur) => {
    if (!videoId || !dur || dur === 0) return;
    const pct = Math.min((pos / dur) * 100, 100);

    try {
      await api.post(`/videos/${videoId}/progress`, {
        current_position_seconds: Math.round(pos),
        total_watched_seconds:    Math.round(pos),
        watch_percentage:         parseFloat(pct.toFixed(2)),
      });

      setWatchPct(pct);
      if (pct >= 90 && !isCompleted) {
        setIsCompleted(true);
        onComplete?.();
      }
    } catch (err) {
      console.warn('[VideoPlayer] Progress save failed:', err.message);
    }
  }, [videoId, isCompleted, onComplete]);

  // ── 4. Video event listeners ───────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Update buffered
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    const onDurationChange = () => setDuration(video.duration || 0);
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      saveProgress(video.currentTime, video.duration); // save on pause
    };
    const onEnded = () => {
      setIsPlaying(false);
      saveProgress(video.duration, video.duration);
    };

    video.addEventListener('timeupdate',     onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play',           onPlay);
    video.addEventListener('pause',          onPause);
    video.addEventListener('ended',          onEnded);

    // Auto-save every 10 seconds while playing
    progressRef.current = setInterval(() => {
      if (!video.paused && video.duration > 0) {
        saveProgress(video.currentTime, video.duration);
      }
    }, 10000);

    return () => {
      video.removeEventListener('timeupdate',     onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play',           onPlay);
      video.removeEventListener('pause',          onPause);
      video.removeEventListener('ended',          onEnded);
      clearInterval(progressRef.current);
      // Save on unmount
      if (video.currentTime > 0) {
        saveProgress(video.currentTime, video.duration);
      }
    };
  }, [saveProgress]);

  // ── 5. Hide controls after 3s of inactivity ───────────────────────────────
  useEffect(() => {
    let timer;
    const resetTimer = () => {
      setShowControls(true);
      clearTimeout(timer);
      if (isPlaying) {
        timer = setTimeout(() => setShowControls(false), 3000);
      }
    };
    const container = videoRef.current?.parentElement;
    container?.addEventListener('mousemove', resetTimer);
    container?.addEventListener('touchstart', resetTimer);
    return () => {
      container?.removeEventListener('mousemove', resetTimer);
      container?.removeEventListener('touchstart', resetTimer);
      clearTimeout(timer);
    };
  }, [isPlaying]);

  // ── Control handlers ───────────────────────────────────────────────────────
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    const video = videoRef.current;
    if (!video) return;
    video.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const handleSeek = (e) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const pct  = x / rect.width;
    video.currentTime = pct * duration;
  };

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const handleResume = () => {
    const video = videoRef.current;
    if (video && resumePos > 0) {
      video.currentTime = resumePos;
    }
    setShowResumeBanner(false);
  };

  const handleRestart = () => {
    const video = videoRef.current;
    if (video) video.currentTime = 0;
    setShowResumeBanner(false);
  };

  const skip = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
  };

  // ── Render: Loading ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-black rounded-2xl flex items-center justify-center aspect-video">
        <div className="text-center text-white">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-green-400" />
          <p className="text-sm text-gray-300">Loading video...</p>
        </div>
      </div>
    );
  }

  // ── Render: Access Denied ──────────────────────────────────────────────────
  if (accessDenied) {
    return (
      <div className="bg-gray-900 rounded-2xl flex items-center justify-center aspect-video">
        <div className="text-center text-white px-6">
          <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-orange-400" />
          </div>
          <h3 className="text-xl font-bold mb-2">Premium Content</h3>
          <p className="text-gray-400 text-sm mb-4">
            Upgrade your subscription to watch this video.
          </p>
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            Upgrade Now
          </a>
        </div>
      </div>
    );
  }

  // ── Render: Error ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-gray-900 rounded-2xl flex items-center justify-center aspect-video">
        <div className="text-center text-white px-6">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-300 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered    / duration) * 100 : 0;

  // ── Render: Player ─────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-3">

      {/* Video Title + Completion Badge */}
      {videoData && (
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-lg">{videoData.title}</h3>
          {isCompleted && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">
              <CheckCircle2 size={13} /> Completed
            </span>
          )}
        </div>
      )}

      {/* ── Player Container ── */}
      <div
        className="relative bg-black rounded-2xl overflow-hidden aspect-video group select-none"
        onDoubleClick={toggleFullscreen}
      >
        {/* Actual video element */}
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          preload="metadata"
          crossOrigin="use-credentials"
        />

        {/* Resume Banner */}
        {showResumeBanner && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur text-white rounded-xl px-4 py-3 text-sm flex items-center gap-3 z-20">
            <span>Resume from {formatTime(resumePos)}?</span>
            <button
              onClick={handleResume}
              className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded-lg font-semibold text-xs transition-colors"
            >
              Resume
            </button>
            <button
              onClick={handleRestart}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg font-semibold text-xs transition-colors"
            >
              Restart
            </button>
          </div>
        )}

        {/* Click overlay to toggle play */}
        <div
          className="absolute inset-0 z-10 cursor-pointer"
          onClick={togglePlay}
          style={{ background: 'transparent' }}
        />

        {/* Big play/pause overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
              <Play className="w-8 h-8 text-white ml-1" fill="white" />
            </div>
          </div>
        )}

        {/* ── Controls Bar ── */}
        <div
          className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress Bar */}
          <div
            className="mx-3 mb-2 h-1.5 bg-white/30 rounded-full cursor-pointer relative"
            onClick={handleSeek}
          >
            {/* Buffered */}
            <div
              className="absolute top-0 left-0 h-full bg-white/40 rounded-full"
              style={{ width: `${bufferedPct}%` }}
            />
            {/* Watched */}
            <div
              className="absolute top-0 left-0 h-full bg-green-500 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow -translate-x-1/2"
              style={{ left: `${progressPct}%` }}
            />
          </div>

          {/* Buttons Row */}
          <div className="flex items-center gap-2 px-3 pb-3">

            {/* Play/Pause */}
            <button onClick={togglePlay} className="text-white hover:text-green-400 transition-colors">
              {isPlaying
                ? <Pause size={20} fill="currentColor" />
                : <Play  size={20} fill="currentColor" />
              }
            </button>

            {/* Skip back 10s */}
            <button onClick={() => skip(-10)} className="text-white hover:text-green-400 transition-colors">
              <RotateCcw size={17} />
            </button>

            {/* Time */}
            <span className="text-white text-xs font-medium tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume */}
            <div className="flex items-center gap-1.5">
              <button onClick={toggleMute} className="text-white hover:text-green-400 transition-colors">
                {isMuted || volume === 0
                  ? <VolumeX size={18} />
                  : <Volume2 size={18} />
                }
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-green-500 cursor-pointer hidden sm:block"
              />
            </div>

            {/* Watch % */}
            <span className="text-xs text-gray-300 hidden sm:block">
              {Math.round(watchPct)}% watched
            </span>

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white hover:text-green-400 transition-colors">
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Watch Progress Bar (below player) ── */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500 font-medium">Watch Progress</span>
          <span className="text-xs font-semibold text-green-600">{Math.round(watchPct)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${Math.min(watchPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Video Description */}
      {videoData?.description && (
        <p className="text-sm text-gray-500 leading-relaxed">{videoData.description}</p>
      )}
    </div>
  );
}
