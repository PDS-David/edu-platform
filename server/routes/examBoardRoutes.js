// server/routes/examBoardRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin / Catalog is the single source of truth for exam types.
// This router is a thin read-only layer over exam_boards — all writes go
// through /api/catalog/types so admin changes are immediately reflected here.
//
// GET /api/exam-boards              — list active exam boards (same data as /catalog/types)
// GET /api/exam-boards/:code        — single board by code
// GET /api/exam-boards/:code/subjects — active subjects for a board
//
// SEC-1 — RESOLVED (confirmed + documented, not a code change):
// This entire router intentionally has no `protect` middleware applied,
// neither here nor in server.js's app.use('/api/exam-boards', examBoardRoutes)
// mount. Verified this is correct, not an oversight:
//
//   1. RegisterPage.jsx calls GET /exam-boards (line ~287) during account
//      registration, before any user has an account or access token. If
//      this route required `protect`, registration would be unable to
//      populate the curriculum/exam-board dropdown at all — a logged-out
//      visitor cannot authenticate against an endpoint they need in order
//      to register in the first place.
//   2. All three endpoints here are GET-only, read-only, and scoped to
//      `WHERE is_active = true` — they return exam board metadata
//      (name/code/description/icon) and active subject lists. No student
//      data, no PII, no write capability exists in this file.
//   3. This matches the established, consistent pattern already used
//      throughout catalogRoutes.js (the other half of the same catalog
//      data, per the comment above): every read-only GET there
//      (/types, /stats, /all-subjects, /types/:id/subjects) is also
//      deliberately public, while every write (POST/PUT/DELETE) is gated
//      with `protect, authorize('admin')`. examBoardRoutes.js, being
//      GET-only end to end, correctly has no write surface to protect.
//
// If a write endpoint is ever added to this file, it MUST use
// `protect, authorize('admin')` — see catalogRoutes.js's /types POST/PUT/
// DELETE handlers for the exact pattern to follow. Do not add an
// unauthenticated write here under any circumstance.
// ─────────────────────────────────────────────────────────────────────────────

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

// ─── GET /api/exam-boards ────────────────────────────────────────────────────
// Source of truth: exam_boards WHERE is_active = true, admin-controlled.
// No static fallback — if the DB is unreachable the response is a 500, not
// stale hardcoded data. Clients should show a retry, not silently use a
// list that may have diverged from what admin has configured.
router.get('/', async (req, res) => {
  try {
    const boards = await sequelize.query(
      `SELECT
         id, code, name, full_name, description,
         country, icon_emoji, display_order, is_active,
         created_at, updated_at
       FROM exam_boards
       WHERE is_active = true
       ORDER BY display_order ASC NULLS LAST, name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, count: boards.length, data: boards });
  } catch (err) {
    console.error('[GET /exam-boards]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch exam boards' });
  }
});

// ─── GET /api/exam-boards/:code/subjects ─────────────────────────────────────
router.get('/:code/subjects', async (req, res) => {
  const { code } = req.params;
  if (!/^[A-Z0-9_-]{1,30}$/.test(code.toUpperCase())) {
    return res.status(400).json({ success: false, error: 'Invalid exam board code' });
  }
  try {
    const subjects = await sequelize.query(
      `SELECT s.id, s.name, s.code, s.level, s.description, s.icon_emoji
       FROM subjects s
       JOIN exam_boards eb ON s.exam_board_id = eb.id
       WHERE UPPER(eb.code) = UPPER(:code)
         AND s.is_active  = true
         AND eb.is_active = true
       ORDER BY s.name ASC`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, count: subjects.length, data: subjects });
  } catch (err) {
    console.error(`[GET /exam-boards/${code}/subjects]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subjects' });
  }
});

// ─── GET /api/exam-boards/:code ──────────────────────────────────────────────
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  if (!/^[A-Z0-9_-]{1,30}$/.test(code.toUpperCase())) {
    return res.status(400).json({ success: false, error: 'Invalid exam board code' });
  }
  try {
    const rows = await sequelize.query(
      `SELECT id, code, name, full_name, description, country, icon_emoji, display_order, is_active
       FROM exam_boards
       WHERE UPPER(code) = UPPER(:code) AND is_active = true
       LIMIT 1`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Exam board not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(`[GET /exam-boards/${code}]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch exam board' });
  }
});

module.exports = router;
