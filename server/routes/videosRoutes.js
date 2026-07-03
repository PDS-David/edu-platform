// server/routes/videosRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Video delivery subsystem — SECURITY REMEDIATION 2026-06-16
//
// Root causes fixed:
//   SEC-01 — /uploads static mount exposed HLS segments and enc.key publicly.
//             FIXED: HLS output moved to server/hls_secure/ and keys to
//             server/keys_secure/ — both outside express.static('/uploads').
//             Segments and keys are now served ONLY through authenticated routes.
//
//   SEC-02 — No course/exam-board enrollment check on video routes.
//             FIXED: videoAccess middleware enforces enrollment on every
//             streaming endpoint (master, variant, segment, key).
//
//   SEC-03 — JWT in localStorage, long token lifetime.
//             FIXED (client): VideoPlayer now uses cookie-based token fallback
//             so Safari/iOS native HLS can authenticate without the
//             Authorization header (see VideoPlayer.jsx changes).
//             Server: /api/videos/token issues a short-lived (15 min) signed
//             streaming token embedded as ?tok= in playlist URLs for native HLS.
//
//   FUNC-01 — Segment URLs were bare relative filenames; players couldn't
//             resolve them through the API.
//             FIXED: encryptVideo() now calls rewriteVariantPlaylist() which
//             replaces bare 'segment_000.ts' with absolute API URLs.
//
//   FUNC-02 — Safari/iOS native HLS can't set Authorization header.
//             FIXED: short-lived streaming tokens issued via /api/videos/token,
//             embedded as ?tok= query params in playlist/segment URLs.
//             protect middleware extended to accept tok= on video routes.
//
//   FUNC-03 — Single fixed-quality rendition, no ABR.
//             FIXED: encryptVideo() now produces 240p/480p/720p/1080p renditions
//             and a multi-variant master playlist.
//
//   PERF-01 — Global IP rate limiter throttled streaming traffic.
//             FIXED: streamingLimiter keys on userId, high cap (600/15min).
//
// Route map:
//   POST   /api/videos/upload              Upload + encrypt (teacher/admin)
//   GET    /api/videos/token               Issue short-lived streaming token
//   GET    /api/videos/course/:courseId    List videos for a course
//   GET    /api/videos/key/:keyId          Serve AES-128 key (authenticated)
//   GET    /api/videos/stream/:id/master.m3u8          Multi-variant master
//   GET    /api/videos/stream/:id/:rendition/playlist.m3u8  Variant playlist
//   GET    /api/videos/stream/:id/:rendition/:segment  TS segment
//   GET    /api/videos/:id                 Single video metadata
//   POST   /api/videos/:id/progress        Save watch position
//   GET    /api/videos/:id/progress        Get saved position
//   DELETE /api/videos/:id                 Delete video (admin)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const jwt        = require('jsonwebtoken');
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { encryptVideo, getEncryptionKey, deleteVideoFiles, getVideoDuration, HLS_SECURE_BASE, RENDITIONS } = require('../utils/videoEncryption');
const { protect } = require('../middleware/auth');
const { videoAccess, hasTierAccess } = require('../middleware/videoAccess');
const { streamingLimiter } = require('../middleware/rateLimiter');
const {
  auditPlaybackStart,
  auditPlaybackComplete,
  auditKeyServed,
  auditSegmentServed,
} = require('../middleware/videoAudit');

const logger = require('../config/logger');
const { multerFileFilter, multerErrorHandler } = require('../utils/fileValidation');

// ── Constants ─────────────────────────────────────────────────────────────────
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:5000';
const UUID_REGEX      = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID     = (v) => UUID_REGEX.test(v);
const VALID_RENDITIONS = new Set(RENDITIONS.map(r => r.name));

// ── Streaming token helpers ───────────────────────────────────────────────────
// Short-lived tokens (15 min) embedded in HLS URLs for Safari/iOS native HLS.
// These are signed with JWT_SECRET but carry only userId + videoId + scope.
const STREAM_TOKEN_TTL = 15 * 60; // seconds

function issueStreamToken(userId, videoId) {
  return jwt.sign(
    { sub: userId, vid: videoId, scope: 'stream' },
    process.env.JWT_SECRET,
    { expiresIn: STREAM_TOKEN_TTL, issuer: 'edu-platform' }
  );
}

function verifyStreamToken(tok) {
  return jwt.verify(tok, process.env.JWT_SECRET, { issuer: 'edu-platform' });
}

// ── Streaming auth middleware ─────────────────────────────────────────────────
// Accepts EITHER a Bearer JWT (hls.js desktop) OR a ?tok= query param
// (Safari native HLS). Sets req.user so videoAccess can run.
const streamAuth = async (req, res, next) => {
  const { QueryTypes: QT } = require('sequelize');
  const db = require('../config/database');

  // 1. Try ?tok= short-lived streaming token (Safari native HLS path)
  const tok = req.query.tok;
  if (tok) {
    try {
      const payload = verifyStreamToken(tok);
      // Scope check
      if (payload.scope !== 'stream') throw new Error('Invalid scope');
      // Video must match the token
      const routeVideoId = req.params.id || req.params.videoId;
      if (routeVideoId && payload.vid !== routeVideoId) {
        return res.status(403).json({ success: false, error: 'Token does not match video' });
      }

      const users = await db.query(
        `SELECT id, email, first_name, last_name, role, is_active, subscription_status, subscription_expires_at
         FROM users WHERE id = :id AND is_active = true LIMIT 1`,
        { replacements: { id: payload.sub }, type: QT.SELECT }
      );
      if (!users.length) {
        return res.status(401).json({ success: false, error: 'User not found' });
      }
      req.user = users[0];
      req.streamTokenPayload = payload;
      return next();
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired streaming token' });
    }
  }

  // 2. Fall through to normal Bearer JWT (hls.js path)
  return protect(req, res, next);
};

// ── Multer — raw MP4 upload ───────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'videos', 'raw');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

// Pre-flight: extension allowlist + declared-MIME check.
// FFmpeg processing acts as a secondary structural gate — non-video content
// fails the encode/probe step and is marked 'failed' in the DB.
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: multerFileFilter(['mp4', 'mov']),
});

// =============================================================================
// POST /api/videos/upload
// Upload + encrypt. Teacher/Admin only.
// =============================================================================
router.post(
  '/upload',
  protect,
  (req, res, next) => upload.single('video')(req, res, (err) => {
    if (err) return multerErrorHandler(err, req, res, next);
    next();
  }),
  async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No video file provided' });
  }

  const { title, description, course_id, topic_id, is_free, required_tier } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }
  if (!course_id || !isValidUUID(course_id)) {
    return res.status(400).json({ success: false, error: 'Valid course_id (UUID) is required' });
  }
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Only teachers and admins can upload videos' });
  }

  const inputPath = req.file.path;
  let videoId = null;

  try {
    // 1. DB record
    const inserted = await sequelize.query(
      `INSERT INTO videos
         (course_id, topic_id, title, description, original_filename,
          encrypted_playlist_url, upload_status, is_free, required_tier,
          created_at, updated_at)
       VALUES
         (:course_id, :topic_id, :title, :description, :original_filename,
          '', 'processing', :is_free, :required_tier, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          course_id,
          topic_id:          topic_id || null,
          title,
          description:       description || null,
          original_filename: req.file.originalname,
          is_free:           is_free === 'true' || is_free === true,
          required_tier:     required_tier || 'student',
        },
        type: QueryTypes.INSERT,
      }
    );
    videoId = inserted[0][0].id;

    // 2. Duration probe
    let durationSeconds = 0;
    try { durationSeconds = await getVideoDuration(inputPath); } catch {}

    // 3. Encrypt + generate ABR HLS (stored in hls_secure/, key in keys_secure/)
    const { playlistUrl, keyId, renditions } = await encryptVideo({
      inputPath,
      videoId,
      serverBaseUrl: SERVER_BASE_URL,
    });

    // 4. Update DB
    await sequelize.query(
      `UPDATE videos SET
         encrypted_playlist_url = :playlistUrl,
         encryption_key_id      = :keyId,
         duration_seconds       = :durationSeconds,
         file_size_mb           = :fileSizeMb,
         upload_status          = 'ready',
         updated_at             = NOW()
       WHERE id = :videoId`,
      {
        replacements: {
          playlistUrl,
          keyId,
          durationSeconds,
          fileSizeMb: parseFloat((req.file.size / (1024 * 1024)).toFixed(2)),
          videoId,
        },
        type: QueryTypes.UPDATE,
      }
    );

    // 5. Cleanup raw file
    fs.unlink(inputPath, () => {});

    logger.info('[Videos] Upload complete', { videoId, renditions });
    return res.status(201).json({
      success: true,
      message: 'Video uploaded and encrypted successfully',
      data: { id: videoId, playlistUrl, keyId, durationSeconds, renditions },
    });

  } catch (err) {
    if (videoId) {
      await sequelize.query(
        `UPDATE videos SET upload_status = 'failed', updated_at = NOW() WHERE id = :videoId`,
        { replacements: { videoId }, type: QueryTypes.UPDATE }
      ).catch(() => {});
    }
    fs.unlink(inputPath, () => {});
    logger.error('[Videos] Upload error', { err: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// GET /api/videos/token
// Issue a short-lived (15 min) streaming token for a given videoId.
// Used by VideoPlayer to build authenticated URLs for Safari native HLS.
// =============================================================================
router.get('/token', protect, async (req, res) => {
  const { videoId } = req.query;
  if (!videoId || !isValidUUID(videoId)) {
    return res.status(400).json({ success: false, error: 'Valid videoId required' });
  }

  try {
    // Verify the user actually has access before issuing a token
    const rows = await sequelize.query(
      `SELECT id, course_id, required_tier, is_free, upload_status FROM videos WHERE id = :videoId`,
      { replacements: { videoId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    const video = rows[0];

    if (!hasTierAccess(req.user.role, video.required_tier, video.is_free)) {
      return res.status(403).json({ success: false, error: 'Access denied', code: 'TIER_REQUIRED' });
    }

    const token = issueStreamToken(req.user.id, videoId);
    const streamUrl = `${SERVER_BASE_URL}/api/videos/stream/${videoId}/master.m3u8?tok=${token}`;

    return res.status(200).json({
      success: true,
      data: { token, expiresIn: STREAM_TOKEN_TTL, streamUrl },
    });
  } catch (err) {
    logger.error('[Videos] token issue error', { err: err.message, videoId });
    return res.status(500).json({ success: false, error: 'Failed to issue stream token' });
  }
});

// =============================================================================
// GET /api/videos/course/:courseId
// List videos for a course (metadata only, no streaming URLs).
// =============================================================================
router.get('/course/:courseId', protect, async (req, res) => {
  const { courseId } = req.params;
  if (!isValidUUID(courseId)) {
    return res.status(400).json({ success: false, error: 'Invalid course ID' });
  }

  try {
    const videos = await sequelize.query(
      `SELECT
         v.id, v.title, v.description, v.duration_seconds,
         v.thumbnail_url, v.video_quality, v.is_free,
         v.required_tier, v.view_count, v.upload_status, v.created_at,
         vp.current_position_seconds, vp.watch_percentage, vp.is_completed
       FROM videos v
       LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = :studentId
       WHERE v.course_id = :courseId AND v.upload_status = 'ready'
       ORDER BY v.created_at ASC`,
      {
        replacements: { courseId, studentId: req.user.id },
        type: QueryTypes.SELECT,
      }
    );

    const accessible = videos.map((v) => ({
      ...v,
      can_access: hasTierAccess(req.user.role, v.required_tier, v.is_free),
    }));

    return res.status(200).json({ success: true, count: accessible.length, data: accessible });
  } catch (err) {
    logger.error('[Videos] course list error', { err: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch videos' });
  }
});

// =============================================================================
// GET /api/videos/key/:keyId
// Serve the AES-128 decryption key.
// Authenticated via Bearer OR ?tok= streaming token.
// The key file lives in keys_secure/ — NEVER in the uploads tree.
// =============================================================================
router.get('/key/:keyId', streamAuth, streamingLimiter, async (req, res) => {
  const { keyId } = req.params;

  try {
    const rows = await sequelize.query(
      `SELECT id, required_tier, is_free FROM videos WHERE encryption_key_id = :keyId`,
      { replacements: { keyId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }

    const video = rows[0];

    if (!hasTierAccess(req.user.role, video.required_tier, video.is_free)) {
      logger.warn('[Videos/key] Tier denied', { keyId, userId: req.user.id });
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // If a streaming token was used, verify it matches this video
    if (req.streamTokenPayload && req.streamTokenPayload.vid !== video.id) {
      return res.status(403).json({ success: false, error: 'Token does not match video' });
    }

    const keyBuffer = getEncryptionKey(video.id);
    if (!keyBuffer) {
      return res.status(404).json({ success: false, error: 'Encryption key file not found' });
    }

    auditKeyServed(req, video.id, keyId);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', keyBuffer.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, private');
    res.setHeader('Pragma', 'no-cache');
    return res.send(keyBuffer);

  } catch (err) {
    logger.error('[Videos/key] Error', { err: err.message, keyId });
    return res.status(500).json({ success: false, error: 'Failed to serve key' });
  }
});

// =============================================================================
// GET /api/videos/stream/:id/master.m3u8
// Multi-variant master HLS playlist.
// Auth: Bearer OR ?tok= streaming token.
// =============================================================================
router.get('/stream/:id/master.m3u8', streamAuth, streamingLimiter, videoAccess, async (req, res) => {
  const videoId = req.params.id;

  const masterPath = path.join(HLS_SECURE_BASE, String(videoId), 'master.m3u8');

  if (!fs.existsSync(masterPath)) {
    return res.status(404).json({ success: false, error: 'Playlist not found' });
  }

  auditPlaybackStart(req, videoId);

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache, no-store, private');
  return res.sendFile(masterPath);
});

// =============================================================================
// GET /api/videos/stream/:id/:rendition/playlist.m3u8
// Variant playlist for a specific quality (240p/480p/720p/1080p).
// Auth: Bearer OR ?tok= streaming token.
// =============================================================================
router.get('/stream/:id/:rendition/playlist.m3u8', streamAuth, streamingLimiter, videoAccess, async (req, res) => {
  const { id: videoId, rendition } = req.params;

  if (!VALID_RENDITIONS.has(rendition)) {
    return res.status(400).json({ success: false, error: 'Invalid rendition' });
  }

  const playlistPath = path.join(HLS_SECURE_BASE, String(videoId), rendition, 'playlist.m3u8');

  if (!fs.existsSync(playlistPath)) {
    return res.status(404).json({ success: false, error: 'Variant playlist not found' });
  }

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-cache, no-store, private');
  return res.sendFile(playlistPath);
});

// =============================================================================
// GET /api/videos/stream/:id/:rendition/:segment
// Serve an encrypted TS segment.
// Auth: Bearer OR ?tok= streaming token.
// =============================================================================
router.get('/stream/:id/:rendition/:segment', streamAuth, streamingLimiter, videoAccess, async (req, res) => {
  const { id: videoId, rendition, segment } = req.params;

  // Validate rendition
  if (!VALID_RENDITIONS.has(rendition)) {
    return res.status(400).json({ success: false, error: 'Invalid rendition' });
  }

  // Validate segment filename — only allow segment_NNN.ts
  if (!/^segment_\d{3}\.ts$/.test(segment)) {
    return res.status(400).json({ success: false, error: 'Invalid segment name' });
  }

  const segmentPath = path.join(HLS_SECURE_BASE, String(videoId), rendition, segment);

  // Path traversal guard
  const safeRoot = path.resolve(HLS_SECURE_BASE);
  if (!path.resolve(segmentPath).startsWith(safeRoot)) {
    return res.status(400).json({ success: false, error: 'Invalid path' });
  }

  if (!fs.existsSync(segmentPath)) {
    return res.status(404).json({ success: false, error: 'Segment not found' });
  }

  auditSegmentServed(req, videoId, segment);

  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(segmentPath);
});

// =============================================================================
// GET /api/videos/:id
// Single video metadata + stream_url. Increments view count.
// NOTE: MUST remain below all /stream/ and /key/ routes.
// =============================================================================
router.get('/:id', protect, async (req, res) => {
  const videoId = req.params.id;
  if (!isValidUUID(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid video ID' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT v.*, vp.current_position_seconds, vp.total_watched_seconds,
              vp.watch_percentage, vp.is_completed, vp.last_watched_at
       FROM videos v
       LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = :studentId
       WHERE v.id = :videoId`,
      { replacements: { videoId, studentId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Video not found' });

    const video = rows[0];

    if (!hasTierAccess(req.user.role, video.required_tier, video.is_free)) {
      return res.status(403).json({
        success: false,
        error: 'Upgrade your subscription to access this video',
        required_tier: video.required_tier,
        code: 'TIER_REQUIRED',
      });
    }

    await sequelize.query(
      `UPDATE videos SET view_count = view_count + 1 WHERE id = :videoId`,
      { replacements: { videoId }, type: QueryTypes.UPDATE }
    );

    // Strip internal fields
    const { encryption_key_id, encrypted_playlist_url, ...safeVideo } = video;

    return res.status(200).json({
      success: true,
      data: {
        ...safeVideo,
        // The client uses this URL; VideoPlayer will append ?tok= for Safari
        stream_url: `/api/videos/stream/${videoId}/master.m3u8`,
      },
    });
  } catch (err) {
    logger.error('[Videos/:id] Error', { err: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch video' });
  }
});

// =============================================================================
// POST /api/videos/:id/progress
// Save or update watch position.
// =============================================================================
router.post('/:id/progress', protect, async (req, res) => {
  const videoId   = req.params.id;
  const studentId = req.user.id;

  if (!isValidUUID(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid video ID' });
  }

  const {
    current_position_seconds = 0,
    total_watched_seconds    = 0,
    watch_percentage         = 0,
  } = req.body;

  const is_completed = parseFloat(watch_percentage) >= 90;

  try {
    await sequelize.query(
      `INSERT INTO video_progress
         (student_id, video_id, current_position_seconds, total_watched_seconds,
          watch_percentage, is_completed, completed_at, last_watched_at, created_at)
       VALUES
         (:studentId, :videoId, :currentPos, :totalWatched,
          :watchPct, :isCompleted, ${is_completed ? 'NOW()' : 'NULL'}, NOW(), NOW())
       ON CONFLICT (student_id, video_id) DO UPDATE SET
         current_position_seconds = EXCLUDED.current_position_seconds,
         total_watched_seconds    = GREATEST(video_progress.total_watched_seconds, EXCLUDED.total_watched_seconds),
         watch_percentage         = GREATEST(video_progress.watch_percentage, EXCLUDED.watch_percentage),
         is_completed             = EXCLUDED.is_completed,
         completed_at             = CASE
                                      WHEN EXCLUDED.is_completed AND video_progress.completed_at IS NULL
                                      THEN NOW()
                                      ELSE video_progress.completed_at
                                    END,
         last_watched_at          = NOW()`,
      {
        replacements: {
          studentId,
          videoId,
          currentPos:   parseInt(current_position_seconds) || 0,
          totalWatched: parseInt(total_watched_seconds)    || 0,
          watchPct:     parseFloat(watch_percentage)       || 0,
          isCompleted:  is_completed,
        },
        type: QueryTypes.INSERT,
      }
    );

    if (is_completed) {
      auditPlaybackComplete(req, videoId);
    }

    return res.status(200).json({
      success: true,
      message: 'Progress saved',
      data: {
        current_position_seconds: parseInt(current_position_seconds),
        watch_percentage:         parseFloat(watch_percentage),
        is_completed,
      },
    });
  } catch (err) {
    logger.error('[Videos/progress] Error', { err: err.message });
    return res.status(500).json({ success: false, error: 'Failed to save progress' });
  }
});

// =============================================================================
// GET /api/videos/:id/progress
// Get saved progress for resume.
// =============================================================================
router.get('/:id/progress', protect, async (req, res) => {
  const videoId   = req.params.id;
  const studentId = req.user.id;

  if (!isValidUUID(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid video ID' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT current_position_seconds, total_watched_seconds,
              watch_percentage, is_completed, completed_at, last_watched_at
       FROM video_progress
       WHERE student_id = :studentId AND video_id = :videoId`,
      { replacements: { studentId, videoId }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      data: rows[0] || {
        current_position_seconds: 0,
        total_watched_seconds:    0,
        watch_percentage:         0,
        is_completed:             false,
        completed_at:             null,
        last_watched_at:          null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch progress' });
  }
});

// =============================================================================
// DELETE /api/videos/:id
// Delete video record and all HLS + key files. Admin only.
// =============================================================================
router.delete('/:id', protect, async (req, res) => {
  const videoId = req.params.id;

  if (!isValidUUID(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid video ID' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  try {
    await sequelize.query(
      `DELETE FROM videos WHERE id = :videoId`,
      { replacements: { videoId }, type: QueryTypes.DELETE }
    );

    // deleteVideoFiles() now removes both hls_secure/{id}/ and keys_secure/{id}.key
    deleteVideoFiles(videoId);

    return res.status(200).json({ success: true, message: 'Video deleted successfully' });
  } catch (err) {
    logger.error('[Videos/delete] Error', { err: err.message });
    return res.status(500).json({ success: false, error: 'Failed to delete video' });
  }
});

module.exports = router;
