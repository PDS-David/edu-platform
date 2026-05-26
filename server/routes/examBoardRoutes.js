// server/routes/examBoardRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/exam-boards              — list all exam boards (for dropdowns)
// GET /api/exam-boards/:code/subjects — subjects for a given board code
// ─────────────────────────────────────────────────────────────────────────────

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

// ─── GET /api/exam-boards ────────────────────────────────────────────────────
// Returns all active exam boards ordered for display.
// Used to populate the "Exam Type" dropdown in the Assign Teacher dialog.
router.get('/', async (req, res) => {
  try {
    const boards = await sequelize.query(
      `SELECT
         id,
         code,
         name,
         full_name,
         country,
         icon_emoji,
         display_order
       FROM exam_boards
       WHERE is_active = true
       ORDER BY display_order NULLS LAST, name ASC`,
      { type: QueryTypes.SELECT }
    );
    return res.status(200).json(boards);
  } catch (err) {
    console.error('[GET /exam-boards] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch exam boards' });
  }
});

// ─── GET /api/exam-boards/:code/subjects ─────────────────────────────────────
// Returns all active subjects for the given exam board code (e.g. 'JAMB').
// Used to dynamically populate the "Subject" dropdown after an exam type is chosen.
router.get('/:code/subjects', async (req, res) => {
  const { code } = req.params;

  // Sanitise — only allow known characters
  if (!/^[A-Z0-9_]{1,20}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'Invalid exam board code' });
  }

  try {
    const subjects = await sequelize.query(
      `SELECT
         s.id,
         s.name,
         s.code,
         s.level,
         s.description
       FROM subjects s
       JOIN exam_boards eb ON s.exam_board_id = eb.id
       WHERE eb.code    = :code
         AND s.is_active = true
       ORDER BY s.name ASC`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );

    return res.status(200).json(subjects);
  } catch (err) {
    console.error(`[GET /exam-boards/${code}/subjects] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subjects' });
  }
});


// ─── GET /api/exam-boards/:code ──────────────────────────────────────────────
// Returns detail for a single exam board by code. Must be AFTER /:code/subjects.
router.get('/:code', async (req, res) => {
  const { code } = req.params;
  if (!/^[A-Z0-9_]{1,20}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'Invalid exam board code' });
  }
  try {
    const rows = await sequelize.query(
      `SELECT id, code, name, full_name, country, icon_emoji, display_order, is_active
       FROM exam_boards WHERE code = :code LIMIT 1`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Exam board not found' });
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(`[GET /exam-boards/${code}]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch exam board' });
  }
});

module.exports = router;
