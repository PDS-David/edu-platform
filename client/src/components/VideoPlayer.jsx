// client/src/components/VideoPlayer.jsx

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import api from '../services/apiClient';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, Loader2, AlertTriangle, CheckCircle2, Lock
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

export default function VideoPlayer({ videoId, onComplete }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const intervalRef = useRef(null);

  // ─────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────
  const [videoData, setVideoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);

  const [watchPct, setWatchPct] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const [resumePos, setResumePos] = useState(0);
  const [showResume, setShowResume] = useState(false);

  // ─────────────────────────────────────────────
  // Load video + progress (SINGLE API LAYER)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoId) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [videoRes, progressRes] = await Promise.all([
          api.get(`/videos/${videoId}`),
          api.get(`/videos/${videoId}/progress`)
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

        if (status === 403) {
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
  // HLS INIT
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoData || !videoRef.current) return;

    const video = videoRef.current;

    const baseURL = (import.meta.env.VITE_API_URL || 'http://localhost:5000')
      .replace(/\/api$/, '');

    const streamUrl = `${baseURL}/videos/stream/${videoId}/master.m3u8`;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr) => {
          const token = localStorage.getItem('token');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError('Video stream error');
      });

      hlsRef.current = hls;
    } else {
      video.src = streamUrl;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [videoData, videoId]);

  // ─────────────────────────────────────────────
  // Save progress (deduplicated + stable)
  // ─────────────────────────────────────────────
  const saveProgress = useCallback(async (pos, dur) => {
    if (!videoId || !dur) return;

    const pct = Math.min((pos / dur) * 100, 100);

    try {
      await api.post(`/videos/${videoId}/progress`, {
        current_position_seconds: Math.round(pos),
        total_watched_seconds: Math.round(pos),
        watch_percentage: Number(pct.toFixed(2))
      });

      setWatchPct(pct);

      if (pct >= 90 && !isCompleted) {
        setIsCompleted(true);
        onComplete?.();
      }

    } catch {
      // silent fail (don’t break UX)
    }
  }, [videoId, isCompleted, onComplete]);

  // ─────────────────────────────────────────────
  // Video listeners
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

    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      saveProgress(video.currentTime, video.duration);
    };

    const onEnded = () => {
      setIsPlaying(false);
      saveProgress(video.duration, video.duration);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    // interval save
    intervalRef.current = setInterval(() => {
      if (!video.paused && video.duration) {
        saveProgress(video.currentTime, video.duration);
      }
    }, 10000);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);

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

  const handleSeek = (e) => {
    const v = videoRef.current;
    if (!v || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;

    v.currentTime = pct * duration;
  };

  const toggleFullscreen = () => {
    const el = videoRef.current?.parentElement;
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const skip = (s) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.currentTime + s, duration));
  };

  // ─────────────────────────────────────────────
  // UI STATES
  // ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="aspect-video bg-black flex items-center justify-center text-white">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="aspect-video bg-gray-900 flex items-center justify-center text-white">
        <Lock />
        <p>Upgrade required</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="aspect-video bg-gray-900 flex items-center justify-center text-white">
        <AlertTriangle />
        <p>{error}</p>
      </div>
    );
  }

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {videoData && (
        <div className="flex justify-between">
          <h2 className="font-bold">{videoData.title}</h2>
          {isCompleted && <CheckCircle2 className="text-green-600" />}
        </div>
      )}

      <div className="relative aspect-video bg-black rounded-xl overflow-hidden">

        <video
          ref={videoRef}
          className="w-full h-full"
          playsInline
          crossOrigin="use-credentials"
        />

        <div className="absolute inset-0" onClick={togglePlay} />

        <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/80 p-3">

          <div
            className="h-1 bg-white/30 rounded cursor-pointer relative"
            onClick={handleSeek}
          >
            <div className="absolute h-full bg-white/40" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute h-full bg-green-500" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="flex items-center gap-2 mt-2 text-white">

            <button onClick={togglePlay}>
              {isPlaying ? <Pause /> : <Play />}
            </button>

            <button onClick={() => skip(-10)}>
              <RotateCcw />
            </button>

            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>

            <div className="flex-1" />

            <button onClick={toggleMute}>
              {isMuted ? <VolumeX /> : <Volume2 />}
            </button>

            <button onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize /> : <Maximize />}
            </button>

          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500">
        {Math.round(watchPct)}% watched
      </div>
    </div>
  );
}
