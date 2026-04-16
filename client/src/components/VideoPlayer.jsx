import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import api from '../services/api';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, Loader2, AlertTriangle, CheckCircle2, Lock
} from 'lucide-react';

// ─────────────────────────────────────────────
// Format time helper
// ─────────────────────────────────────────────
const formatTime = (secs) => {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function VideoPlayer({ videoId, onComplete }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const progressIntervalRef = useRef(null);

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

  const [showControls, setShowControls] = useState(true);

  const [isCompleted, setIsCompleted] = useState(false);
  const [watchPct, setWatchPct] = useState(0);

  const [resumePos, setResumePos] = useState(0);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // ─────────────────────────────────────────────
  // Fetch video + progress
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoId) return;

    const fetchVideo = async () => {
      setLoading(true);
      setError(null);

      try {
        const [videoRes, progressRes] = await Promise.all([
          api.get(`/videos/${videoId}`),
          api.get(`/videos/${videoId}/progress`)
        ]);

        setVideoData(videoRes.data);

        const prog = progressRes.data;

        if (prog?.current_position_seconds > 10) {
          setResumePos(prog.current_position_seconds);
          setShowResumeBanner(true);
        }

        setIsCompleted(prog?.is_completed || false);
        setWatchPct(prog?.watch_percentage || 0);

      } catch (err) {
        const status = err?.status;

        if (status === 403) {
          setAccessDenied(true);
        } else {
          setError(err?.message || 'Failed to load video');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId]);

  // ─────────────────────────────────────────────
  // Initialize HLS
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoData || !videoRef.current) return;

    const video = videoRef.current;

    const baseUrl =
      (import.meta.env.VITE_API_URL || 'http://localhost:5000')
        .replace(/\/api\/?$/, '');

    const streamUrl = `${baseUrl}/videos/stream/${videoId}/master.m3u8`;

    const initHls = () => {
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

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          // Auto-resume AFTER manifest is ready
          if (resumePos > 0) {
            video.currentTime = resumePos;
            setShowResumeBanner(false);
          }
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setError('Video stream error');
          }
        });

        hlsRef.current = hls;

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;

        video.addEventListener('loadedmetadata', () => {
          if (resumePos > 0) {
            video.currentTime = resumePos;
            setShowResumeBanner(false);
          }
        });
      } else {
        setError('HLS not supported in this browser');
      }
    };

    initHls();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoData, videoId, resumePos]);

  // ─────────────────────────────────────────────
  // Save progress
  // ─────────────────────────────────────────────
  const saveProgress = useCallback(async (pos, dur) => {
    if (!videoId || !dur) return;

    const pct = Math.min((pos / dur) * 100, 100);

    try {
      await api.post(`/videos/${videoId}/progress`, {
        current_position_seconds: Math.round(pos),
        total_watched_seconds: Math.round(pos),
        watch_percentage: parseFloat(pct.toFixed(2))
      });

      setWatchPct(pct);

      if (pct >= 90 && !isCompleted) {
        setIsCompleted(true);
        onComplete?.();
      }

    } catch {
      // silent fail (intentional)
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

    progressIntervalRef.current = setInterval(() => {
      if (!video.paused && video.duration) {
        saveProgress(video.currentTime, video.duration);
      }
    }, 10000);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      if (video.currentTime > 0) {
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

  const skip = (sec) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.currentTime + sec, duration));
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

  const handleResume = () => {
    const v = videoRef.current;
    if (v && resumePos) v.currentTime = resumePos;
    setShowResumeBanner(false);
  };

  const handleRestart = () => {
    const v = videoRef.current;
    if (v) v.currentTime = 0;
    setShowResumeBanner(false);
  };

  // ─────────────────────────────────────────────
  // UI states
  // ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="aspect-video bg-black flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="aspect-video bg-gray-900 flex items-center justify-center text-white">
        <Lock className="mr-2" />
        Upgrade required
      </div>
    );
  }

  if (error) {
    return (
      <div className="aspect-video bg-black flex items-center justify-center text-white">
        <AlertTriangle className="mr-2 text-red-400" />
        {error}
      </div>
    );
  }

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* Title */}
      {videoData && (
        <div className="flex justify-between">
          <h3 className="font-bold">{videoData.title}</h3>
          {isCompleted && (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle2 size={14} /> Completed
            </span>
          )}
        </div>
      )}

      {/* Player */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">

        <video
          ref={videoRef}
          className="w-full h-full"
          playsInline
          crossOrigin="use-credentials"
        />

        {/* Resume */}
        {showResumeBanner && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-3 py-2 rounded">
            Resume from {formatTime(resumePos)}?
            <button onClick={handleResume} className="ml-2 text-green-400">Resume</button>
            <button onClick={handleRestart} className="ml-2 text-gray-300">Restart</button>
          </div>
        )}

        {/* Overlay click */}
        <div className="absolute inset-0 z-10" onClick={togglePlay} />

        {/* Controls */}
        <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/80 p-3 z-20">

          {/* Progress */}
          <div className="h-1 bg-white/30 rounded cursor-pointer" onClick={handleSeek}>
            <div className="h-full bg-green-500" style={{ width: `${progressPct}%` }} />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 mt-2 text-white">

            <button onClick={togglePlay}>
              {isPlaying ? <Pause /> : <Play />}
            </button>

            <button onClick={() => skip(-10)}>
              <RotateCcw />
            </button>

            <span className="text-xs">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

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

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs">
          <span>Progress</span>
          <span>{Math.round(watchPct)}%</span>
        </div>

        <div className="h-2 bg-gray-200 rounded">
          <div className="h-full bg-green-500" style={{ width: `${watchPct}%` }} />
        </div>
      </div>
    </div>
  );
}
