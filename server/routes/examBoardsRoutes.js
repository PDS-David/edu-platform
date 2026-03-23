// server/routes/examBoardsRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Uses Sequelize for raw SQL queries (sequelize.query with QueryTypes)
// This matches your existing database.js which exports a Sequelize instance.
//
// Endpoints:
//   GET /api/exam-boards                     — list all active exam boards
//   GET /api/exam-boards/:code               — single board + subject count
//   GET /api/exam-boards/:code/subjects      — all subjects for a board
//
// Schema facts:
//   exam_boards.id         → INTEGER (SERIAL) — NOT uuid
//   subjects.exam_board_id → INTEGER FK → exam_boards.id (direct, no join table)
//   subjects.id            → UUID
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

// ─────────────────────────────────────────────────────────────
// GET /api/exam-boards
// List all active exam boards ordered by display_order
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const boards = await sequelize.query(
      `SELECT
        id,
        code,
        name,
        full_name,
        description,
        country,
        icon_emoji,
        display_order,
        is_active,
        created_at,
        updated_at
       FROM exam_boards
       WHERE is_active = true
       ORDER BY display_order ASC, name ASC`,
      { type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      count: boards.length,
      data: boards,
    });
  } catch (error) {
    console.error('[GET /api/exam-boards] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch exam boards',
      ...(process.env.NODE_ENV === 'development' && { stack: error.message }),
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/exam-boards/:code/subjects
// All active subjects for a given exam board code (e.g. JAMB, WAEC)
//
// Optional query params:
//   ?category=science    filter by subjects.category
//   ?level=ss3           filter by subjects.level
//   ?search=math         search subjects.name / description
//
// IMPORTANT: This route MUST be declared before /:code
// to avoid Express matching 'subjects' as the :code param.
// ─────────────────────────────────────────────────────────────
router.get('/:code/subjects', async (req, res) => {
  const { code } = req.params;
  const { category, level, search } = req.query;

  try {
    // 1. Resolve board by code (case-insensitive)
    const boards = await sequelize.query(
      `SELECT id, code, name, full_name, icon_emoji
       FROM exam_boards
       WHERE UPPER(code) = UPPER(:code) AND is_active = true`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );

    if (boards.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Exam board '${code.toUpperCase()}' not found or is inactive`,
      });
    }

    const board = boards[0]; // board.id is INTEGER

    // 2. Build subjects query with optional filters
    // We use a WHERE clause string + replacements object (Sequelize named style)
    const replacements = { board_id: board.id };
    let filters = `WHERE s.exam_board_id = :board_id AND s.is_active = true`;

    if (category) {
      filters += ` AND LOWER(s.category) = LOWER(:category)`;
      replacements.category = category;
    }

    if (level) {
      filters += ` AND LOWER(s.level) = LOWER(:level)`;
      replacements.level = level;
    }

    if (search) {
      filters += ` AND (s.name ILIKE :search OR s.description ILIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const subjects = await sequelize.query(
      `SELECT
        s.id,
        s.name,
        s.code,
        s.subject_code,
        s.description,
        s.icon,
        s.icon_emoji,
        s.color,
        s.category,
        s.level,
        s.question_count,
        s.video_count,
        s.notes_count,
        s.past_papers_count,
        s.is_active,
        s.created_at
       FROM subjects s
       ${filters}
       ORDER BY s.name ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      exam_board: board,
      count: subjects.length,
      data: subjects,
    });
  } catch (error) {
    console.error(
      `[GET /api/exam-boards/${code}/subjects] Error:`,
      error.message
    );
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch subjects for exam board',
      ...(process.env.NODE_ENV === 'development' && { stack: error.message }),
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/exam-boards/:code
// Single exam board detail + total subject count
// Declared AFTER /:code/subjects to avoid route conflict
// ─────────────────────────────────────────────────────────────
router.get('/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const boards = await sequelize.query(
      `SELECT
        eb.id,
        eb.code,
        eb.name,
        eb.full_name,
        eb.description,
        eb.country,
        eb.icon_emoji,
        eb.display_order,
        eb.is_active,
        eb.created_at,
        eb.updated_at,
        COUNT(s.id)::INTEGER AS total_subjects
       FROM exam_boards eb
       LEFT JOIN subjects s
         ON eb.id = s.exam_board_id AND s.is_active = true
       WHERE UPPER(eb.code) = UPPER(:code)
       GROUP BY eb.id`,
      { replacements: { code }, type: QueryTypes.SELECT }
    );

    if (boards.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Exam board '${code.toUpperCase()}' not found`,
      });
    }

    return res.status(200).json({
      success: true,
      data: boards[0],
    });
  } catch (error) {
    console.error(`[GET /api/exam-boards/${code}] Error:`, error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch exam board',
      ...(process.env.NODE_ENV === 'development' && { stack: error.message }),
    });
  }
});

module.exports = router;
