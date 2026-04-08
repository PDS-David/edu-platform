'use strict';

// Unified Question Routes
// Combines:
// - Your production-grade content system
// - AI generation pipeline (concept-driven)

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

const { protect, authorize } = require('../middleware/auth');
const { parseJSON, parseCSV, batchInsert } = require('../utils/questionImporter');

// ✅ AI Integration
const { generateQuestions } = require('../services/questionService');

// XP middleware (optional)
let awardXP = () => {};
try { awardXP = require('../middleware/xpMiddleware').awardXP; } catch {}

// Multer setup
const upload = multer({
  dest: '/tmp/eac_imports/',
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.json' || ext === '.csv') cb(null, true);
    else cb(new Error('Only .json and .csv files are accepted'));
  },
});

// UUID validation
const UUID_REGEX = /^[0-9a-f-]{36}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

// ─────────────────────────────────────────────
// ✅ NEW: AI GENERATION ENDPOINT
// ─────────────────────────────────────────────
router.post('/generate', protect, async (req, res) => {
  const { subtopic_id, count = 5 } = req.body;

  if (!isValidUUID(subtopic_id)) {
    return res.status(400).json({ success: false, error: 'Invalid subtopic_id' });
  }

  try {
    const questions = await generateQuestions({
      subtopic_id,
      student_id: req.user.id,
      count
    });

    return res.json({ success: true, data: questions });

  } catch (err) {
    console.error('[AI GENERATE] Error:', err);
    return res.status(500).json({ success: false, error: 'AI generation failed' });
  }
});

// ─────────────────────────────────────────────
// IMPORT (unchanged)
// ─────────────────────────────────────────────
router.post('/import', protect, authorize('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const filePath = req.file.path;
  const ext = path.extname(req.file.originalname).toLowerCase();

  try {
    const parseResult = ext === '.json' ? parseJSON(filePath) : parseCSV(filePath);

    const result = await batchInsert(parseResult.questions, req.user.id);

    return res.json({ success: true, ...result });

  } finally {
    fs.unlink(filePath, () => {});
  }
});

// ─────────────────────────────────────────────
// RANDOM (UPGRADED WITH AI FALLBACK)
// ─────────────────────────────────────────────
router.get('/random', protect, async (req, res) => {
  const { subtopic_id } = req.query;
  const count = Math.min(parseInt(req.query.count || '10', 10), 50);

  if (subtopic_id && !isValidUUID(subtopic_id)) {
    return res.status(400).json({ success: false, error: 'Invalid subtopic_id' });
  }

  try {
    let questions = await sequelize.query(
      `SELECT * FROM questions WHERE subtopic_id = :subtopic_id AND status='approved' ORDER BY RANDOM() LIMIT :count`,
      {
        replacements: { subtopic_id, count },
        type: QueryTypes.SELECT
      }
    );

    // ✅ AI FALLBACK
    if (questions.length < count && subtopic_id) {
      const needed = count - questions.length;

      await generateQuestions({
        subtopic_id,
        student_id: req.user.id,
        count: needed
      });

      questions = await sequelize.query(
        `SELECT * FROM questions WHERE subtopic_id = :subtopic_id ORDER BY RANDOM() LIMIT :count`,
        {
          replacements: { subtopic_id, count },
          type: QueryTypes.SELECT
        }
      );
    }

    return res.json({ success: true, count: questions.length, data: questions });

  } catch (err) {
    console.error('[RANDOM] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch questions' });
  }
});

// ─────────────────────────────────────────────
// ANSWER VALIDATION (kept from your system)
// ─────────────────────────────────────────────
router.post('/:id/answer', protect, async (req, res) => {
  const questionId = req.params.id;
  const { selected_option_id } = req.body;

  if (!isValidUUID(questionId)) {
    return res.status(400).json({ success: false, error: 'Invalid question ID' });
  }

  try {
    const option = await sequelize.query(
      `SELECT option_text, is_correct FROM answer_options WHERE id=:id`,
      {
        replacements: { id: selected_option_id },
        type: QueryTypes.SELECT
      }
    );

    if (!option.length) {
      return res.status(400).json({ success: false, error: 'Invalid option' });
    }

    const is_correct = option[0].is_correct;

    setImmediate(() => awardXP(req.user.id, 'answer', { is_correct }).catch(() => {}));

    return res.json({ success: true, is_correct });

  } catch (err) {
    console.error('[ANSWER] Error:', err);
    return res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

module.exports = router;