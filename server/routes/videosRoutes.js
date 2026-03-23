// server/routes/videosRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints:
//   POST   /api/videos/upload              — upload + encrypt MP4 (teacher/admin)
//   GET    /api/videos/course/:courseId    — list videos for a course
//   GET    /api/videos/key/:keyId          — serve AES-128 decryption key
//   GET    /api/videos/stream/:id/master.m3u8  — serve HLS playlist
//   GET    /api/videos/:id                 — get single video (access check)
//   POST   /api/videos/:id/progress        — save watch position
//   GET    /api/videos/:id/progress        — get saved position (resume)
//   DELETE /api/videos/:id                 — delete video (admin)
//
// FIXES APPLIED:
//   1. Route ordering: /key/:keyId and /stream/:id/... moved ABOVE /:id
//      (Express matches top-to-bottom; /:id was intercepting /key/abc as
//       parseInt('key') = NaN → 400 error before key endpoint was reached)
//   2. Auth import: changed from default require to named { protect }
//      (auth.js exports { protect, authorize, optionalAuth }, not a default)
//   3. Upload catch block: videoId declared with let before try so it is
//      accessible in the catch block for the failed-status UPDATE
// ─────────────────────────────────────────────────────────────────────────────

const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { encryptVideo, getEncryptionKey, deleteVideoFiles, getVideoDuration } = require('../utils/videoEncryption');
const { protect } = require('../middleware/auth'); // FIX 2: named import

const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://localhost:5000';

// ── UUID validation ───────────────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

// ── Multer config — store raw MP4 uploads temporarily ────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'videos', 'raw');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Only video files are allowed'));
  },
});

// ── Subscription tier check helper ───────────────────────────────────────────
// Tier hierarchy: free < student < premium < teacher < admin
const TIER_RANK = { free: 0, student: 1, premium: 2, teacher: 3, admin: 4 };

function hasAccess(userRole, requiredTier, isFree) {
  if (isFree) return true;
  const userRank     = TIER_RANK[userRole]     ?? 0;
  const requiredRank = TIER_RANK[requiredTier] ?? 1;
  return userRank >= requiredRank;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/videos/upload
// Upload and encrypt a video. Teacher/Admin only.
// Form fields: title, description, course_id, topic_id, is_free, required_tier
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload', protect, upload.single('video'), async (req, res) => {
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

  // FIX 3: declare videoId BEFORE try so catch block can access it
  let videoId = null;

  try {
    // ── 1. Create DB record with status 'processing' ─────────────────────────
    const inserted = await sequelize.query(
      `INSERT INTO videos
         (course_id, topic_id, title, description, original_filename,
          encrypted_playlist_url, upload_status, is_free, required_tier,
          created_at, updated_at)
       VALUES
         (:course_id, :topic_id, :title, :description, :original_filename,
          '', 'processing', :is_free, :required_tier,
          NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          course_id,
          topic_id:          topic_id    || null,
          title,
          description:       description || null,
          original_filename: req.file.originalname,
          is_free:           is_free === 'true' || is_free === true,
          required_tier:     required_tier || 'student',
        },
        type: QueryTypes.INSERT,
      }
    );

    videoId = inserted[0][0].id; // FIX 3: assigned to outer let, not const

    // ── 2. Get duration via ffprobe ───────────────────────────────────────────
    let durationSeconds = 0;
    try {
      durationSeconds = await getVideoDuration(inputPath);
    } catch (e) {
      console.warn(`[Videos] Could not read duration: ${e.message}`);
    }

    // ── 3. Encrypt with FFmpeg → HLS ─────────────────────────────────────────
    const { playlistUrl, keyId } = await encryptVideo({
      inputPath,
      videoId,
      serverBaseUrl: SERVER_BASE_URL,
    });

    // ── 4. Update DB record with results ──────────────────────────────────────
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

    // ── 5. Delete raw MP4 (no longer needed) ──────────────────────────────────
    fs.unlink(inputPath, () => {});

    return res.status(201).json({
      success: true,
      message: 'Video uploaded and encrypted successfully',
      data: { id: videoId, playlistUrl, keyId, durationSeconds },
    });

  } catch (err) {
    // FIX 3: videoId is now in scope — mark row as failed if it was created
    if (videoId) {
      await sequelize.query(
        `UPDATE videos SET upload_status = 'failed', updated_at = NOW() WHERE id = :videoId`,
        { replacements: { videoId }, type: QueryTypes.UPDATE }
      ).catch(() => {});
    }

    // Clean up raw file
    fs.unlink(inputPath, () => {});

    console.error('[POST /api/videos/upload] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/videos/course/:courseId
// List all ready videos for a course (respects access control).
// ─────────────────────────────────────────────────────────────────────────────
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
         v.required_tier, v.view_count, v.upload_status,
         v.created_at,
         vp.current_position_seconds,
         vp.watch_percentage,
         vp.is_completed
       FROM videos v
       LEFT JOIN video_progress vp
         ON vp.video_id = v.id AND vp.student_id = :studentId
       WHERE v.course_id = :courseId
         AND v.upload_status = 'ready'
       ORDER BY v.id ASC`,
      {
        replacements: { courseId, studentId: req.user.id },
        type: QueryTypes.SELECT,
      }
    );

    const accessible = videos.map((v) => ({
      ...v,
      can_access: hasAccess(req.user.role, v.required_tier, v.is_free),
    }));

    return res.status(200).json({
      success: true,
      count: accessible.length,
      data: accessible,
    });
  } catch (err) {
    console.error('[GET /api/videos/course/:courseId] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch videos' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: /key/:keyId and /stream/:id/master.m3u8 are now ABOVE /:id
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/videos/key/:keyId
// Serve the AES-128 decryption key — CRITICAL security endpoint.
// The HLS player calls this automatically for each encrypted segment.
// We verify the user is authenticated and has access before serving the key.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/key/:keyId', protect, async (req, res) => {
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

    if (!hasAccess(req.user.role, video.required_tier, video.is_free)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const keyBuffer = getEncryptionKey(video.id);
    if (!keyBuffer) {
      return res.status(404).json({ success: false, error: 'Encryption key file not found' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', keyBuffer.length);
    res.setHeader('Cache-Control', 'no-store, no-cache');
    return res.send(keyBuffer);

  } catch (err) {
    console.error(`[GET /api/videos/key/${keyId}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to serve key' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/videos/stream/:id/master.m3u8
// Serve the HLS playlist file.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stream/:id/master.m3u8', protect, async (req, res) => {
  const videoId = parseInt(req.params.id);
  if (isNaN(videoId)) return res.status(400).json({ success: false, error: 'Invalid video ID' });

  try {
    const rows = await sequelize.query(
      `SELECT id, required_tier, is_free, upload_status FROM videos WHERE id = :videoId`,
      { replacements: { videoId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Video not found' });

    const video = rows[0];

    if (video.upload_status !== 'ready') {
      return res.status(409).json({ success: false, error: 'Video is not ready for streaming' });
    }

    if (!hasAccess(req.user.role, video.required_tier, video.is_free)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const playlistPath = path.join(
      __dirname, '..', 'uploads', 'videos', 'hls', String(videoId), 'master.m3u8'
    );

    if (!fs.existsSync(playlistPath)) {
      return res.status(404).json({ success: false, error: 'Playlist file not found' });
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(playlistPath);

  } catch (err) {
    console.error(`[GET /stream/${videoId}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to serve playlist' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/videos/:id
// Get single video details + increment view count.
// NOTE: This MUST stay below /key/:keyId and /stream/:id/... (FIX 1)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  const videoId = parseInt(req.params.id);
  if (isNaN(videoId)) {
    return res.status(400).json({ success: false, error: 'Invalid video ID' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         v.*,
         vp.current_position_seconds,
         vp.total_watched_seconds,
         vp.watch_percentage,
         vp.is_completed,
         vp.last_watched_at
       FROM videos v
       LEFT JOIN video_progress vp
         ON vp.video_id = v.id AND vp.student_id = :studentId
       WHERE v.id = :videoId`,
      {
        replacements: { videoId, studentId: req.user.id },
        type: QueryTypes.SELECT,
      }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    const video = rows[0];

    if (!hasAccess(req.user.role, video.required_tier, video.is_free)) {
      return res.status(403).json({
        success: false,
        error: 'Upgrade your subscription to access this video',
        required_tier: video.required_tier,
      });
    }

    await sequelize.query(
      `UPDATE videos SET view_count = view_count + 1 WHERE id = :videoId`,
      { replacements: { videoId }, type: QueryTypes.UPDATE }
    );

    // Strip sensitive fields from response
    const { encryption_key_id, encrypted_playlist_url, ...safeVideo } = video;

    return res.status(200).json({
      success: true,
      data: {
        ...safeVideo,
        stream_url: `/api/videos/stream/${videoId}/master.m3u8`,
      },
    });
  } catch (err) {
    console.error(`[GET /api/videos/${videoId}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch video' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/videos/:id/progress
// Save or update watch position for resume functionality.
// Body: { current_position_seconds, total_watched_seconds, watch_percentage }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/progress', protect, async (req, res) => {
  const videoId   = parseInt(req.params.id);
  const studentId = req.user.id;

  if (isNaN(videoId)) {
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
    console.error(`[POST /videos/${videoId}/progress] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to save progress' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/videos/:id/progress
// Get saved progress for resume.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/progress', protect, async (req, res) => {
  const videoId   = parseInt(req.params.id);
  const studentId = req.user.id;

  if (isNaN(videoId)) {
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
    console.error(`[GET /videos/${videoId}/progress] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch progress' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/videos/:id
// Delete video record and all HLS files. Admin only.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  const videoId = parseInt(req.params.id);

  if (isNaN(videoId)) {
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

    deleteVideoFiles(videoId);

    return res.status(200).json({ success: true, message: 'Video deleted successfully' });
  } catch (err) {
    console.error(`[DELETE /videos/${videoId}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete video' });
  }
});

module.exports = router;
