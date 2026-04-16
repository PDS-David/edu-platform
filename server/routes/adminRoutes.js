'use strict';

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');
const { generate } = require('../services/ai');

// ─────────────────────────────────────────────────────────────
// ADMIN GUARD
// ─────────────────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseIntSafe(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function parseSubjectId(raw) {
  const s = String(raw || '').trim();
  if (UUID_RE.test(s)) return null;
  return parseIntSafe(s);
}

// ─────────────────────────────────────────────────────────────
// AI QUESTION GENERATION (UNCHANGED CORE LOGIC)
// ─────────────────────────────────────────────────────────────
router.post('/generate-questions', protect, adminOnly, async (req, res) => {
  const { subject_id, topic, exam_board = 'JAMB', count = 10, difficulty = 'medium' } = req.body;

  if (!subject_id || !topic) {
    return res.status(400).json({ success: false, error: 'subject_id and topic are required' });
  }

  const safeSubjectId = parseSubjectId(subject_id);
  if (!safeSubjectId) {
    return res.status(400).json({ success: false, error: 'Invalid subject_id' });
  }

  const subjectRows = await sequelize.query(
    `SELECT name FROM subjects WHERE id = :id`,
    { replacements: { id: safeSubjectId }, type: QueryTypes.SELECT }
  );

  if (!subjectRows.length) {
    return res.status(404).json({ success: false, error: 'Subject not found' });
  }

  const subjectName = subjectRows[0].name;

  const prompt = `Generate ${count} ${difficulty} ${exam_board} MCQs on ${topic} for ${subjectName}.
Return ONLY JSON array.`;

  try {
    const raw = await generate(prompt, 'generate-questions');
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();

    const questions = JSON.parse(cleaned);

    if (!Array.isArray(questions)) {
      return res.status(502).json({ success: false, error: 'Invalid AI output' });
    }

    let inserted = 0;

    for (const q of questions) {
      if (!q.question_text) continue;

      await sequelize.query(
        `INSERT INTO questions
         (question_text, marks, explanation, options, correct_answer,
          difficulty, is_ai_generated, ai_generation_source, status, source,
          is_active, created_at, updated_at)
         VALUES
         (:question_text, :marks, :explanation, :options::jsonb, :correct_answer,
          :difficulty, true, 'ai', 'approved', 'ai_generated',
          true, NOW(), NOW())`,
        {
          replacements: {
            question_text: q.question_text,
            marks: q.marks || 1,
            explanation: q.explanation || '',
            options: JSON.stringify(q.options || []),
            correct_answer: q.correct_answer || '',
            difficulty
          },
          type: QueryTypes.INSERT
        }
      );

      inserted++;
    }

    return res.json({
      success: true,
      data: {
        generated: questions.length,
        inserted
      }
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// USER MANAGEMENT (CLEAN CONTRACT)
// ─────────────────────────────────────────────────────────────

router.get('/users/stats', protect, adminOnly, async (req, res) => {
  const rows = await sequelize.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE role='student')::int AS students,
      COUNT(*) FILTER (WHERE role='teacher')::int AS teachers,
      COUNT(*) FILTER (WHERE is_active=true)::int AS active
     FROM users`,
    { type: QueryTypes.SELECT }
  );

  return res.json({ success: true, data: rows[0] });
});

router.get('/users', protect, adminOnly, async (req, res) => {
  const { search = '', role, page = 1, limit = 20 } = req.query;

  const filters = [`is_active = true`];
  const replacements = {
    search: `%${search}%`,
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit)
  };

  if (role) {
    filters.push(`role = :role`);
    replacements.role = role;
  }

  if (search) {
    filters.push(`(first_name ILIKE :search OR last_name ILIKE :search OR email ILIKE :search)`);
  }

  const where = `WHERE ${filters.join(' AND ')}`;

  const [count, data] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(*)::int AS total FROM users ${where}`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT id, first_name, last_name, email, role, is_active, created_at
       FROM users
       ${where}
       ORDER BY created_at DESC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    )
  ]);

  return res.json({
    success: true,
    data,
    total: count[0].total
  });
});

router.put('/users/:id/role', protect, adminOnly, async (req, res) => {
  const { role } = req.body;

  if (!['student', 'teacher', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  await sequelize.query(
    `UPDATE users SET role=:role WHERE id=:id`,
    { replacements: { role, id: req.params.id }, type: QueryTypes.UPDATE }
  );

  return res.json({ success: true, message: 'Role updated' });
});

router.put('/users/:id/active', protect, adminOnly, async (req, res) => {
  const { is_active } = req.body;

  await sequelize.query(
    `UPDATE users SET is_active=:is_active WHERE id=:id`,
    { replacements: { is_active, id: req.params.id }, type: QueryTypes.UPDATE }
  );

  return res.json({ success: true });
});

router.delete('/users/:id', protect, adminOnly, async (req, res) => {
  await sequelize.query(
    `UPDATE users SET is_active=false WHERE id=:id`,
    { replacements: { id: req.params.id }, type: QueryTypes.UPDATE }
  );

  return res.json({ success: true, message: 'User deleted' });
});

// ─────────────────────────────────────────────────────────────
// TEACHER ASSIGNMENTS (SINGLE SOURCE OF TRUTH)
// ─────────────────────────────────────────────────────────────

router.get('/teacher-assignments', protect, adminOnly, async (req, res) => {
  const rows = await sequelize.query(
    `SELECT ts.id,
            ts.teacher_id,
            ts.subject_id,
            ts.exam_board_id,
            ts.is_active,
            u.first_name || ' ' || u.last_name AS teacher_name,
            u.email,
            s.name AS subject_name
     FROM teacher_subjects ts
     JOIN users u ON u.id = ts.teacher_id
     JOIN subjects s ON s.id = ts.subject_id
     WHERE ts.is_active = true
     ORDER BY ts.id DESC`,
    { type: QueryTypes.SELECT }
  );

  return res.json({ success: true, data: rows, total: rows.length });
});

router.post('/teacher-assignments', protect, adminOnly, async (req, res) => {
  const { teacher_id, subject_id } = req.body;

  const safeSubjectId = parseSubjectId(subject_id);
  if (!safeSubjectId) {
    return res.status(400).json({ success: false, error: 'Invalid subject_id' });
  }

  await sequelize.query(
    `INSERT INTO teacher_subjects (teacher_id, subject_id, is_active)
     VALUES (:teacher_id, :subject_id, true)
     ON CONFLICT (teacher_id, subject_id)
     DO UPDATE SET is_active=true`,
    { replacements: { teacher_id, subject_id: safeSubjectId }, type: QueryTypes.INSERT }
  );

  return res.json({ success: true, message: 'Assignment saved' });
});

router.delete('/teacher-assignments/:id', protect, adminOnly, async (req, res) => {
  await sequelize.query(
    `UPDATE teacher_subjects SET is_active=false WHERE id=:id`,
    { replacements: { id: req.params.id }, type: QueryTypes.UPDATE }
  );

  return res.json({ success: true });
});

module.exports = router;
