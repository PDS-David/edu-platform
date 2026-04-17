'use strict';

const express = require('express');
const router = express.Router();

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const { protect } = require('../middleware/auth');
const { generate } = require('../services/ai');
const { success, error } = require('../utils/response');

// ─────────────────────────────────────────────
// ADMIN GUARD
// ─────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return error(res, 'Admin access required', 403);
  }
  next();
};

// ─────────────────────────────────────────────
// AI QUESTION GENERATION
// ─────────────────────────────────────────────
router.post('/generate-questions', protect, adminOnly, async (req, res) => {
  const { subject_id, topic, count = 10, difficulty = 'medium' } = req.body;

  if (!subject_id || !topic) {
    return error(res, 'subject_id and topic are required', 400);
  }

  try {
    const subjectRows = await sequelize.query(
      `SELECT name FROM subjects WHERE id = :id`,
      {
        replacements: { id: subject_id },
        type: QueryTypes.SELECT,
      }
    );

    if (!subjectRows.length) {
      return error(res, 'Subject not found', 404);
    }

    const prompt = `Generate ${count} ${difficulty} MCQs on ${topic} for ${subjectRows[0].name}. Return ONLY JSON array.`;

    const raw = await generate(prompt);
    const cleaned = raw.replace(/```json|```/g, '').trim();

    const questions = JSON.parse(cleaned);

    let inserted = 0;

    for (const q of questions) {
      if (!q.question_text) continue;

      await sequelize.query(
        `INSERT INTO questions
         (question_text, options, correct_answer, difficulty, is_ai_generated, created_at, updated_at)
         VALUES (:q, :o::jsonb, :c, :d, true, NOW(), NOW())`,
        {
          replacements: {
            q: q.question_text,
            o: JSON.stringify(q.options || []),
            c: q.correct_answer,
            d: difficulty,
          },
          type: QueryTypes.INSERT,
        }
      );

      inserted++;
    }

    return success(res, {
      generated: questions.length,
      inserted,
    });

  } catch (err) {
    console.error('[admin.generate]', err.message);
    return error(res, 'AI generation failed');
  }
});

// ─────────────────────────────────────────────
// TEACHER ASSIGNMENTS
// ─────────────────────────────────────────────
router.get('/teacher-assignments', protect, adminOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ts.id, u.email, s.name AS subject
       FROM teacher_subjects ts
       JOIN users u ON u.id = ts.teacher_id
       JOIN subjects s ON s.id = ts.subject_id
       WHERE ts.is_active = true`,
      { type: QueryTypes.SELECT }
    );

    return success(res, rows);

  } catch (err) {
    return error(res, 'Failed to fetch assignments');
  }
});

router.post('/teacher-assignments', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id } = req.body;

  try {
    await sequelize.query(
      `INSERT INTO teacher_subjects (teacher_id, subject_id, is_active)
       VALUES (:t, :s, true)
       ON CONFLICT (teacher_id, subject_id)
       DO UPDATE SET is_active=true`,
      {
        replacements: { t: teacher_id, s: subject_id },
        type: QueryTypes.INSERT,
      }
    );

    return success(res, { message: 'Assignment saved' });

  } catch (err) {
    return error(res, 'Failed to save assignment');
  }
});

router.delete('/teacher-assignments/:id', protect, adminOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE teacher_subjects SET is_active=false WHERE id=:id`,
      {
        replacements: { id: req.params.id },
        type: QueryTypes.UPDATE,
      }
    );

    return success(res, { message: 'Assignment removed' });

  } catch (err) {
    return error(res, 'Failed to delete assignment');
  }
});

module.exports = router;
