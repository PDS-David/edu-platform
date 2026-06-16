// server/middleware/videoAccess.js
// ─────────────────────────────────────────────────────────────────────────────
// Unified access-control middleware for all video endpoints.
//
// Checks (in order):
//   1. Authentication   — req.user must be set (protect runs first)
//   2. Subscription tier — video.required_tier vs user role/tier
//   3. Course enrollment — student must be enrolled in the video's course
//      (teachers and admins skip the enrollment check)
//
// Usage:
//   router.get('/stream/:id/master.m3u8', protect, videoAccess, handler);
//
// After this middleware runs, req.video is populated with the DB row.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { QueryTypes } = require('sequelize');
const db             = require('../config/database');
const logger         = require('../config/logger');
const { ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');

// Tier rank — mirrors videosRoutes.js; kept here as the single source of truth
const TIER_RANK = { free: 0, student: 1, premium: 2, teacher: 3, admin: 4 };

function hasTierAccess(userRole, requiredTier, isFree) {
  if (isFree) return true;
  return (TIER_RANK[userRole] ?? 0) >= (TIER_RANK[requiredTier] ?? 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// videoAccess(req, res, next)
// req.params.id  OR  req.params.videoId must hold the video UUID.
// ─────────────────────────────────────────────────────────────────────────────
const videoAccess = async (req, res, next) => {
  const videoId = req.params.id || req.params.videoId;

  // Guard: protect must have run first
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    // ── 1. Load video ─────────────────────────────────────────────────────────
    const rows = await db.query(
      `SELECT id, course_id, required_tier, is_free, upload_status
       FROM videos
       WHERE id = :videoId`,
      { replacements: { videoId }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      logger.warn('[videoAccess] Video not found', { videoId, userId: req.user.id });
      return res.status(404).json({ success: false, error: 'Video not found' });
    }

    const video = rows[0];

    if (video.upload_status !== 'ready') {
      return res.status(409).json({ success: false, error: 'Video is not ready for streaming' });
    }

    // ── 2. Tier check ─────────────────────────────────────────────────────────
    if (!hasTierAccess(req.user.role, video.required_tier, video.is_free)) {
      logger.warn('[videoAccess] Tier denied', {
        videoId, userId: req.user.id,
        userRole: req.user.role, required: video.required_tier,
      });
      return res.status(403).json({
        success: false,
        error: 'Upgrade your subscription to access this video',
        required_tier: video.required_tier,
        code: 'TIER_REQUIRED',
      });
    }

    // ── 3. Enrollment check (students only) ───────────────────────────────────
    const role = req.user.role;
    if (role !== 'admin' && role !== 'teacher') {
      // Check the student is enrolled in the course this video belongs to
      const enrolled = await db.query(
        `SELECT ss.id
         FROM student_subjects ss
         JOIN subjects s ON s.id = ss.subject_id
         JOIN course_subjects cs ON cs.subject_id = s.id
         WHERE ss.student_id  = :userId
           AND cs.course_id   = :courseId
           AND ss.status      = :approved
           AND (ss.expires_at IS NULL OR ss.expires_at > NOW())
         LIMIT 1`,
        {
          replacements: {
            userId:   req.user.id,
            courseId: video.course_id,
            approved: ENROLLMENT_STATUS.APPROVED,
          },
          type: QueryTypes.SELECT,
        }
      );

      // Also accept direct course enrollment (enrollments table)
      let hasEnrollment = enrolled.length > 0;

      if (!hasEnrollment) {
        const directEnroll = await db.query(
          `SELECT id FROM enrollments
           WHERE user_id   = :userId
             AND course_id = :courseId
             AND status    = 'active'
           LIMIT 1`,
          {
            replacements: { userId: req.user.id, courseId: video.course_id },
            type: QueryTypes.SELECT,
          }
        );
        hasEnrollment = directEnroll.length > 0;
      }

      if (!hasEnrollment) {
        logger.warn('[videoAccess] Enrollment denied', {
          videoId,
          courseId: video.course_id,
          userId: req.user.id,
        });
        return res.status(403).json({
          success: false,
          error: 'You are not enrolled in this course',
          code: 'NOT_ENROLLED',
        });
      }
    }

    // ── Pass — attach video to request for downstream handlers ────────────────
    req.video = video;
    next();

  } catch (err) {
    logger.error('[videoAccess] Error', { err: err.message, videoId, userId: req.user?.id });
    return res.status(500).json({ success: false, error: 'Access check failed' });
  }
};

module.exports = { videoAccess, hasTierAccess };
