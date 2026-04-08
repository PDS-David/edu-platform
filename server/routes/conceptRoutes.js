// server/routes/conceptRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Concepts are fine-grained knowledge units that live inside subtopics.
// Hierarchy: subjects → topics → subtopics → concepts
//
// Endpoints:
//   GET    /api/concepts                  — list concepts (filter by subtopic_id)
//   GET    /api/concepts/:id              — single concept
//   POST   /api/concepts                  — create concept  [teacher / admin]
//   PUT    /api/concepts/:id              — update concept  [teacher / admin]
//   DELETE /api/concepts/:id              — delete concept  [admin only]
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(v); }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/concepts
// List all concepts, optionally filtered by subtopic_id.
// Query params: subtopic_id (UUID, optional)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const { subtopic_id } = req.query;

  const filters      = [];
  const replacements = {};

  if (subtopic_id) {
    if (!isValidUUID(subtopic_id)) {
      return res.status(400).json({ success: false, error: 'Invalid subtopic_id format' });
    }
    filters.push('c.subtopic_id = :subtopic_id');
    replacements.subtopic_id = subtopic_id;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const concepts = await sequelize.query(
      `SELECT
         c.id,
         c.subtopic_id,
         c.name,
         c.description,
         c.difficulty_level,
         c.estimated_minutes,
         c.order_index,
         c.created_at,
         c.updated_at,
         st.name  AS subtopic_name,
         t.id     AS topic_id,
         COALESCE(t.name, t.title) AS topic_name,
         s.id     AS subject_id,
         s.name   AS subject_name
       FROM concepts c
       JOIN subtopics st ON c.subtopic_id = st.id
       JOIN topics    t  ON st.topic_id   = t.id
       JOIN subjects  s  ON st.subject_id = s.id
       ${where}
       ORDER BY c.order_index ASC, c.created_at ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, count: concepts.length, data: concepts });
  } catch (err) {
    console.error('[GET /concepts] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch concepts' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/concepts/:id
// Single concept with full context (subtopic → topic → subject).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid concept ID' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         c.id,
         c.subtopic_id,
         c.name,
         c.description,
         c.difficulty_level,
         c.estimated_minutes,
         c.order_index,
         c.created_at,
         c.updated_at,
         st.name  AS subtopic_name,
         t.id     AS topic_id,
         COALESCE(t.name, t.title) AS topic_name,
         s.id     AS subject_id,
         s.name   AS subject_name,
         s.icon_emoji
       FROM concepts c
       JOIN subtopics st ON c.subtopic_id = st.id
       JOIN topics    t  ON st.topic_id   = t.id
       JOIN subjects  s  ON st.subject_id = s.id
       WHERE c.id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Concept not found' });
    }

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(`[GET /concepts/${id}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch concept' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/concepts
// Create a new concept inside a subtopic.
// Access: teacher | admin
// Body: { subtopic_id, name, description?, difficulty_level?, estimated_minutes?, order_index? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied: teacher or admin required' });
  }

  const {
    subtopic_id,
    name,
    description      = null,
    difficulty_level = 1,
    estimated_minutes = 10,
    order_index      = 0,
  } = req.body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!subtopic_id || !isValidUUID(subtopic_id)) {
    return res.status(400).json({ success: false, error: 'subtopic_id is required and must be a valid UUID' });
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'name is required' });
  }
  const level = parseInt(difficulty_level, 10);
  if (isNaN(level) || level < 1 || level > 5) {
    return res.status(400).json({ success: false, error: 'difficulty_level must be an integer between 1 and 5' });
  }

  try {
    // Confirm the parent subtopic exists
    const subtopicCheck = await sequelize.query(
      `SELECT id FROM subtopics WHERE id = :subtopic_id`,
      { replacements: { subtopic_id }, type: QueryTypes.SELECT }
    );
    if (!subtopicCheck.length) {
      return res.status(404).json({ success: false, error: 'Subtopic not found' });
    }

    const result = await sequelize.query(
      `INSERT INTO concepts
         (subtopic_id, name, description, difficulty_level, estimated_minutes, order_index, created_at, updated_at)
       VALUES
         (:subtopic_id, :name, :description, :difficulty_level, :estimated_minutes, :order_index, NOW(), NOW())
       RETURNING *`,
      {
        replacements: {
          subtopic_id,
          name:              name.trim(),
          description:       description || null,
          difficulty_level:  level,
          estimated_minutes: parseInt(estimated_minutes, 10) || 10,
          order_index:       parseInt(order_index, 10) || 0,
        },
        type: QueryTypes.INSERT,
      }
    );

    const created = result[0][0];
    return res.status(201).json({ success: true, message: 'Concept created', data: created });
  } catch (err) {
    console.error('[POST /concepts] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to create concept' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/concepts/:id
// Update an existing concept.
// Access: teacher | admin
// Body: any subset of { name, description, difficulty_level, estimated_minutes, order_index }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied: teacher or admin required' });
  }

  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid concept ID' });
  }

  const { name, description, difficulty_level, estimated_minutes, order_index } = req.body;

  // Build SET clause dynamically — only update fields that were sent
  const setClauses   = ['updated_at = NOW()'];
  const replacements = { id };

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ success: false, error: 'name cannot be empty' });
    setClauses.push('name = :name');
    replacements.name = name.trim();
  }
  if (description !== undefined) {
    setClauses.push('description = :description');
    replacements.description = description || null;
  }
  if (difficulty_level !== undefined) {
    const level = parseInt(difficulty_level, 10);
    if (isNaN(level) || level < 1 || level > 5) {
      return res.status(400).json({ success: false, error: 'difficulty_level must be between 1 and 5' });
    }
    setClauses.push('difficulty_level = :difficulty_level');
    replacements.difficulty_level = level;
  }
  if (estimated_minutes !== undefined) {
    setClauses.push('estimated_minutes = :estimated_minutes');
    replacements.estimated_minutes = parseInt(estimated_minutes, 10) || 10;
  }
  if (order_index !== undefined) {
    setClauses.push('order_index = :order_index');
    replacements.order_index = parseInt(order_index, 10) || 0;
  }

  if (setClauses.length === 1) {
    return res.status(400).json({ success: false, error: 'No fields provided to update' });
  }

  try {
    const result = await sequelize.query(
      `UPDATE concepts
       SET ${setClauses.join(', ')}
       WHERE id = :id
       RETURNING *`,
      { replacements, type: QueryTypes.UPDATE }
    );

    const updated = result[0][0];
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Concept not found' });
    }

    return res.status(200).json({ success: true, message: 'Concept updated', data: updated });
  } catch (err) {
    console.error(`[PUT /concepts/${id}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to update concept' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/concepts/:id
// Hard-delete a concept (cascades from subtopic already handled at DB level).
// Access: admin only
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Access denied: admin required' });
  }

  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid concept ID' });
  }

  try {
    const result = await sequelize.query(
      `DELETE FROM concepts WHERE id = :id RETURNING id, name`,
      { replacements: { id }, type: QueryTypes.DELETE }
    );

    const deleted = result[0][0];
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Concept not found' });
    }

    return res.status(200).json({
      success: true,
      message: `Concept "${deleted.name}" deleted`,
      data: { id: deleted.id },
    });
  } catch (err) {
    console.error(`[DELETE /concepts/${id}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to delete concept' });
  }
});

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/concepts/:id/questions
// List all questions linked to a concept (via question_concepts).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/questions', protect, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid concept ID' });
  }

  try {
    const questions = await sequelize.query(
      `SELECT
         q.id,
         q.question_text,
         q.question_type,
         q.question_sub_type,
         q.difficulty,
         q.marks,
         q.topic,
         q.status,
         q.subtopic_id,
         qc.weight,
         qc.id AS mapping_id
       FROM question_concepts qc
       JOIN questions q ON qc.question_id = q.id
       WHERE qc.concept_id = :conceptId
       ORDER BY qc.weight ASC, q.created_at ASC`,
      { replacements: { conceptId: id }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, count: questions.length, data: questions });
  } catch (err) {
    console.error(`[GET /concepts/${id}/questions] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch questions for concept' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/concepts/:id/questions
// Link a question to a concept.
// Access: teacher | admin
// Body: { question_id, weight? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/questions', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied: teacher or admin required' });
  }

  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid concept ID' });
  }

  const { question_id, weight = 1 } = req.body;

  if (!question_id || !isValidUUID(question_id)) {
    return res.status(400).json({ success: false, error: 'question_id is required and must be a valid UUID' });
  }

  const w = parseInt(weight, 10);
  if (isNaN(w) || w < 1) {
    return res.status(400).json({ success: false, error: 'weight must be a positive integer' });
  }

  try {
    // Confirm concept exists
    const conceptCheck = await sequelize.query(
      `SELECT id FROM concepts WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!conceptCheck.length) {
      return res.status(404).json({ success: false, error: 'Concept not found' });
    }

    // Confirm question exists
    const questionCheck = await sequelize.query(
      `SELECT id FROM questions WHERE id = :question_id`,
      { replacements: { question_id }, type: QueryTypes.SELECT }
    );
    if (!questionCheck.length) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    // Upsert — if already linked, update weight
    const result = await sequelize.query(
      `INSERT INTO question_concepts (question_id, concept_id, weight, created_at)
       VALUES (:question_id, :concept_id, :weight, NOW())
       ON CONFLICT (question_id, concept_id)
       DO UPDATE SET weight = EXCLUDED.weight
       RETURNING *`,
      {
        replacements: { question_id, concept_id: id, weight: w },
        type: QueryTypes.INSERT,
      }
    );

    const mapping = result[0][0];
    return res.status(201).json({ success: true, message: 'Question linked to concept', data: mapping });
  } catch (err) {
    console.error(`[POST /concepts/${id}/questions] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to link question to concept' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/concepts/:id/questions/:questionId
// Unlink a question from a concept.
// Access: teacher | admin
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id/questions/:questionId', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied: teacher or admin required' });
  }

  const { id, questionId } = req.params;
  if (!isValidUUID(id) || !isValidUUID(questionId)) {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }

  try {
    const result = await sequelize.query(
      `DELETE FROM question_concepts
       WHERE concept_id = :concept_id AND question_id = :question_id
       RETURNING id`,
      {
        replacements: { concept_id: id, question_id: questionId },
        type: QueryTypes.DELETE,
      }
    );

    const deleted = result[0][0];
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Link not found' });
    }

    return res.status(200).json({ success: true, message: 'Question unlinked from concept' });
  } catch (err) {
    console.error(`[DELETE /concepts/${id}/questions/${questionId}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to unlink question from concept' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// MASTERY ENDPOINTS  (student_concept_mastery table)
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/concepts/mastery/me
// Returns the logged-in student's mastery scores across all concepts they have
// practised, enriched with concept + subtopic context.
// Query params: subtopic_id (optional filter)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mastery/me', protect, async (req, res) => {
  const studentId    = req.user.id;
  const { subtopic_id } = req.query;

  const filters      = ['scm.student_id = :studentId'];
  const replacements = { studentId };

  if (subtopic_id) {
    if (!isValidUUID(subtopic_id)) {
      return res.status(400).json({ success: false, error: 'Invalid subtopic_id format' });
    }
    filters.push('c.subtopic_id = :subtopic_id');
    replacements.subtopic_id = subtopic_id;
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         scm.id,
         scm.concept_id,
         c.name             AS concept_name,
         c.difficulty_level,
         c.subtopic_id,
         st.name            AS subtopic_name,
         scm.mastery_score,
         scm.attempts,
         scm.correct,
         CASE WHEN scm.attempts > 0
              THEN ROUND((scm.correct::NUMERIC / scm.attempts) * 100, 1)
              ELSE 0
         END                AS accuracy_pct,
         scm.last_practiced,
         scm.updated_at
       FROM student_concept_mastery scm
       JOIN concepts  c  ON scm.concept_id  = c.id
       JOIN subtopics st ON c.subtopic_id   = st.id
       WHERE ${filters.join(' AND ')}
       ORDER BY scm.mastery_score DESC, scm.last_practiced DESC`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('[GET /concepts/mastery/me] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch mastery data' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/concepts/:id/mastery
// Returns the logged-in student's mastery record for a single concept.
// Teachers and admins may pass ?student_id=<uuid> to query any student.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/mastery', protect, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid concept ID' });
  }

  // Determine whose mastery to return
  let studentId = req.user.id;
  if (req.query.student_id) {
    if (!['teacher', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (!isValidUUID(req.query.student_id)) {
      return res.status(400).json({ success: false, error: 'Invalid student_id format' });
    }
    studentId = req.query.student_id;
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         scm.id,
         scm.mastery_score,
         scm.attempts,
         scm.correct,
         CASE WHEN scm.attempts > 0
              THEN ROUND((scm.correct::NUMERIC / scm.attempts) * 100, 1)
              ELSE 0
         END AS accuracy_pct,
         scm.last_practiced,
         scm.updated_at
       FROM student_concept_mastery scm
       WHERE scm.student_id = :studentId AND scm.concept_id = :conceptId`,
      { replacements: { studentId, conceptId: id }, type: QueryTypes.SELECT }
    );

    // Return zeroed record if student has never practised this concept
    const data = rows.length > 0 ? rows[0] : {
      mastery_score:  0,
      attempts:       0,
      correct:        0,
      accuracy_pct:   0,
      last_practiced: null,
    };

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error(`[GET /concepts/${id}/mastery] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch mastery record' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/concepts/:id/mastery
// Record a practice attempt and recalculate mastery score.
// Called after a student answers a question linked to this concept.
// Body: { correct: true | false }
// Mastery formula: exponential moving average with α = 0.3
//   new_score = (0.7 × old_score) + (0.3 × outcome)   where outcome = 1 or 0
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/mastery', protect, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid concept ID' });
  }

  if (req.user.role !== 'student') {
    return res.status(403).json({ success: false, error: 'Only students can record mastery attempts' });
  }

  const { correct } = req.body;
  if (typeof correct !== 'boolean') {
    return res.status(400).json({ success: false, error: 'correct must be a boolean (true or false)' });
  }

  const studentId = req.user.id;
  const outcome   = correct ? 1 : 0;
  const ALPHA     = 0.3; // EMA smoothing factor

  try {
    // Confirm concept exists
    const conceptCheck = await sequelize.query(
      `SELECT id FROM concepts WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!conceptCheck.length) {
      return res.status(404).json({ success: false, error: 'Concept not found' });
    }

    // Upsert mastery record, recalculating score with EMA
    const result = await sequelize.query(
      `INSERT INTO student_concept_mastery
         (student_id, concept_id, mastery_score, attempts, correct, last_practiced, created_at, updated_at)
       VALUES
         (:studentId, :conceptId,
          ROUND((:alpha * :outcome)::NUMERIC, 4),
          1, :outcome, NOW(), NOW(), NOW())
       ON CONFLICT (student_id, concept_id)
       DO UPDATE SET
         mastery_score  = ROUND(((1 - :alpha) * student_concept_mastery.mastery_score + :alpha * :outcome)::NUMERIC, 4),
         attempts       = student_concept_mastery.attempts + 1,
         correct        = student_concept_mastery.correct  + :outcome,
         last_practiced = NOW(),
         updated_at     = NOW()
       RETURNING *`,
      {
        replacements: { studentId, conceptId: id, alpha: ALPHA, outcome },
        type: QueryTypes.INSERT,
      }
    );

    const record = result[0][0];
    const accuracyPct = record.attempts > 0
      ? Math.round((record.correct / record.attempts) * 1000) / 10
      : 0;

    return res.status(200).json({
      success: true,
      message: `Mastery updated — ${correct ? 'correct' : 'incorrect'} answer recorded`,
      data: {
        ...record,
        accuracy_pct:    accuracyPct,
        mastery_label:   masteryLabel(record.mastery_score),
      },
    });
  } catch (err) {
    console.error(`[POST /concepts/${id}/mastery] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to update mastery' });
  }
});

// ── Helper: human-readable mastery label ─────────────────────────────────────
function masteryLabel(score) {
  if (score >= 0.85) return 'Mastered';
  if (score >= 0.65) return 'Proficient';
  if (score >= 0.40) return 'Developing';
  return 'Beginner';
}


// ═════════════════════════════════════════════════════════════════════════════
// AI QUESTION GENERATION ENDPOINT
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/concepts/:id/generate-question
// Generates one AI question for this concept, saves it, and returns it
// ready for immediate use in a quiz.
//
// Access: any authenticated user (student / teacher / admin)
// No body required.
//
// Response:
//   { success, message, data: { question, options } }
// ─────────────────────────────────────────────────────────────────────────────
let _aiQuestionGenerator = null;
function getAIGenerator() {
  if (!_aiQuestionGenerator) {
    try {
      _aiQuestionGenerator = require('../services/aiQuestionGenerator');
    } catch (err) {
      throw Object.assign(
        new Error('AI question generator service is not available'),
        { statusCode: 503 }
      );
    }
  }
  return _aiQuestionGenerator;
}

router.post('/:id/generate-question', protect, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid concept ID' });
  }

  try {
    const { generateAIQuestion } = getAIGenerator();
    const { question, options }  = await generateAIQuestion(id, req.user.id);

    return res.status(201).json({
      success: true,
      message: 'AI question generated and saved',
      data: {
        question,
        options,
      },
    });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error(`[POST /concepts/${id}/generate-question] Error:`, err.message);
    return res.status(status).json({
      success: false,
      error: err.message || 'Failed to generate AI question',
    });
  }
});
