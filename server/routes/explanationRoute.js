// server/routes/explanationRoute.js
// -------------------------------------------------------------------------
// REST endpoint for AI-enhanced explanations.
//
// Endpoints:
//   GET  /api/explanations/enhance
//   POST /api/explanations/invalidate   (admin only — bust the cache for a row)
//
// ── GET /api/explanations/enhance ─────────────────────────────────────────
//
// Query parameters:
//   topic_id       (string, UUID) — enhance explanation for an entire topic
//   subtopic_id    (string, UUID) — enhance explanation for a specific subtopic
//   force_refresh  (boolean, default false) — bypass cache and regenerate
//
// Exactly ONE of topic_id / subtopic_id must be provided.
//
// Success 200:
// {
//   "success": true,
//   "data": {
//     "topic_id":               "uuid | null",
//     "subtopic_id":            "uuid | null",
//     "topic_name":             "Cell Biology",
//     "subtopic_name":          "Mitosis" | null,
//     "subject_name":           "Biology",
//     "exam_board":             "JAMB/UTME",
//     "exam_board_code":        "JAMB",
//     "source_question_count":  7,
//     "from_cache":             true,
//     "cached_at":              "2026-03-29T12:00:00.000Z",
//     "original_explanation":   "Mitochondria carry out cellular respiration...",
//     "simplified_explanation": "Think of mitochondria as tiny power stations...",
//     "key_points": [
//       "Mitochondria produce ATP through cellular respiration.",
//       "They have a double membrane — outer and inner (cristae).",
//       "They contain their own DNA, suggesting ancient bacterial origin.",
//       "JAMB often asks: which organelle is the 'powerhouse of the cell'?"
//     ]
//   }
// }
//
// Error responses:
//   400 — missing or invalid parameters
//   404 — topic / subtopic not found
//   503 — Gemini AI not configured
//   500 — unexpected server error
//
// ── POST /api/explanations/invalidate ─────────────────────────────────────
//
// Body (JSON):
//   { "topic_id": "uuid" }
//   OR
//   { "subtopic_id": "uuid" }
//
// Deletes the cache row so the next GET regenerates it.
// Requires admin role.
//
// Success 200:
// { "success": true, "message": "Cache invalidated for topic <uuid>" }
// -------------------------------------------------------------------------

'use strict';

const express = require('express');
const router  = express.Router();

const { protect, authorize } = require('../middleware/auth');
const { enhanceExplanation } = require('../services/explanationEnhancer');

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

// subscriptionGuard is optional — falls through if file is missing
let subscriptionGuard = (_req, _res, next) => next();
try { subscriptionGuard = require('../middleware/subscriptionGuard'); } catch {}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Helpers ────────────────────────────────────────────────────────────────────
function isValidUUID(v) { return UUID_REGEX.test(String(v || '')); }

// =============================================================================
// GET /api/explanations/enhance
// =============================================================================
router.get('/enhance', protect, subscriptionGuard, async (req, res) => {
  const {
    topic_id,
    subtopic_id,
    force_refresh = 'false',
  } = req.query;

  // ── Validate ──────────────────────────────────────────────────────────────
  const hasTopic    = topic_id    && isValidUUID(topic_id);
  const hasSubtopic = subtopic_id && isValidUUID(subtopic_id);

  if (!hasTopic && !hasSubtopic) {
    return res.status(400).json({
      success: false,
      error:   'Provide topic_id or subtopic_id as a valid UUID query parameter.',
    });
  }

  if (hasTopic && hasSubtopic) {
    return res.status(400).json({
      success: false,
      error:   'Provide topic_id OR subtopic_id — not both.',
    });
  }

  if (topic_id && !isValidUUID(topic_id)) {
    return res.status(400).json({ success: false, error: 'topic_id must be a valid UUID.' });
  }
  if (subtopic_id && !isValidUUID(subtopic_id)) {
    return res.status(400).json({ success: false, error: 'subtopic_id must be a valid UUID.' });
  }

  // ── Call service ───────────────────────────────────────────────────────────
  try {
    const data = await enhanceExplanation({
      topic_id:      hasTopic    ? topic_id    : undefined,
      subtopic_id:   hasSubtopic ? subtopic_id : undefined,
      force_refresh: force_refresh === 'true',
    });

    return res.status(200).json({ success: true, data });

  } catch (err) {
    const status = err.statusCode || 500;

    if (status < 500) {
      return res.status(status).json({ success: false, error: err.message });
    }

    console.error('[GET /api/explanations/enhance]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to enhance explanation. Please try again.',
      ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
    });
  }
});

// =============================================================================
// POST /api/explanations/invalidate  (admin only)
// =============================================================================
router.post('/invalidate', protect, authorize('admin'), async (req, res) => {
  const { topic_id, subtopic_id } = req.body;

  const hasTopic    = topic_id    && isValidUUID(topic_id);
  const hasSubtopic = subtopic_id && isValidUUID(subtopic_id);

  if (!hasTopic && !hasSubtopic) {
    return res.status(400).json({
      success: false,
      error:   'Provide topic_id or subtopic_id (UUID) in the request body.',
    });
  }

  try {
    if (hasTopic) {
      await sequelize.query(
        `DELETE FROM ai_explanation_cache WHERE topic_id = :id`,
        { replacements: { id: topic_id }, type: QueryTypes.DELETE }
      );
      return res.status(200).json({
        success: true,
        message: `Cache invalidated for topic ${topic_id}`,
      });
    } else {
      await sequelize.query(
        `DELETE FROM ai_explanation_cache WHERE subtopic_id = :id`,
        { replacements: { id: subtopic_id }, type: QueryTypes.DELETE }
      );
      return res.status(200).json({
        success: true,
        message: `Cache invalidated for subtopic ${subtopic_id}`,
      });
    }
  } catch (err) {
    console.error('[POST /api/explanations/invalidate]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to invalidate cache.',
      ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
    });
  }
});

module.exports = router;
