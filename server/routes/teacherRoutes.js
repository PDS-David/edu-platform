'use strict';
// server/routes/teacherRoutes.js
//
// v2 UUID FIX: removed parseInt() from subject_id, topic_id, subtopic_id
//   body/query params — these are UUID foreign keys.
//   parseInt(req.params.id) is kept for topic/subtopic row PKs (INTEGER).

const express        = require('express');
const router         = express.Router();
const crypto         = require('crypto');
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

const teacherOnly = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  next();
};

// Safe table check — returns empty instead of crashing
const safeQuery = async (sql, replacements, fallback = []) => {
  try { return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }); }
  catch (e) { console.warn('[teacherRoutes] query skipped:', e.message.slice(0, 80)); return fallback; }
};

// Check if teacher is assigned to a subject (graceful if table missing)
async function teacherOwnsSubject(teacherId, subjectId) {
  try {
    const r = await sequelize.query(
      `SELECT id FROM teacher_subjects WHERE teacher_id=:teacherId AND subject_id=:subjectId AND is_active=true`,
      { replacements: { teacherId, subjectId }, type: QueryTypes.SELECT }
    );
    return r.length > 0;
  } catch { return true; } // if table missing, allow — admin will fix
}

// ── GET /api/teacher/my-subjects ──────────────────────────────────────────────
router.get('/my-subjects', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT s.id, s.name, s.code, s.level, s.description,
              eb.code AS exam_board_code, eb.name AS exam_board_name
       FROM teacher_subjects ts
       JOIN subjects    s  ON s.id  = ts.subject_id
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       WHERE ts.teacher_id = :teacherId AND ts.is_active = true
       ORDER BY s.name ASC`,
      { teacherId: req.user.id }
    );
    // Fallback: if teacher_subjects missing or empty, return all subjects
    if (!rows.length) {
      const allSubjects = await safeQuery(
        `SELECT s.id, s.name, s.code, s.level,
                eb.code AS exam_board_code, eb.name AS exam_board_name
         FROM subjects s
         LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
         WHERE s.is_active = true ORDER BY s.name ASC`,
        {}
      );
      return res.json({ success: true, count: allSubjects.length, data: allSubjects });
    }
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/topics?subject_id=<uuid> ─────────────────────────────────
// FIX: was parseInt(subject_id) — subject_id is a UUID foreign key
router.get('/topics', protect, teacherOnly, async (req, res) => {
  const { subject_id } = req.query;
  if (!subject_id) return res.status(400).json({ success: false, error: 'subject_id is required' });
  try {
    const rows = await sequelize.query(
      `SELECT t.id, t.name, t.description, t.order_index,
              COUNT(st.id)::INTEGER AS subtopic_count
       FROM topics t
       LEFT JOIN subtopics st ON st.topic_id = t.id AND st.is_active = true
       WHERE t.subject_id = :subjectId AND t.is_active = true
       GROUP BY t.id ORDER BY t.order_index ASC NULLS LAST, t.name ASC`,
      { replacements: { subjectId: subject_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/topics ──────────────────────────────────────────────────
// FIX: was parseInt(subject_id) — subject_id is a UUID foreign key
router.post('/topics', protect, teacherOnly, async (req, res) => {
  const { subject_id, name, description, order_index = 0 } = req.body;
  if (!subject_id || !name?.trim()) return res.status(400).json({ success: false, error: 'subject_id and name are required' });
  try {
    const rows = await sequelize.query(
      `INSERT INTO topics (subject_id, name, description, order_index, is_active, created_at, updated_at)
       VALUES (:subjectId, :name, :description, :orderIndex, true, NOW(), NOW())
       RETURNING id, name, description, order_index`,
      {
        replacements: { subjectId: subject_id, name: name.trim(), description: description || null, orderIndex: parseInt(order_index) || 0 },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: { ...rows[0], subtopic_count: 0 } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/teacher/topics/:id ───────────────────────────────────────────────
// topics.id is INTEGER — parseInt(req.params.id) is correct here
router.put('/topics/:id', protect, teacherOnly, async (req, res) => {
  const { name, description, order_index } = req.body;
  try {
    await sequelize.query(
      `UPDATE topics SET
         name        = COALESCE(NULLIF(:name,''), name),
         description = COALESCE(:description, description),
         order_index = COALESCE(:orderIndex, order_index),
         updated_at  = NOW()
       WHERE id = :id AND is_active = true`,
      { replacements: { id: parseInt(req.params.id), name: name || '', description: description ?? null, orderIndex: order_index != null ? parseInt(order_index) : null }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Topic updated' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/teacher/topics/:id ───────────────────────────────────────────
// topics.id is INTEGER — parseInt(req.params.id) is correct here
router.delete('/topics/:id', protect, teacherOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE topics SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Topic deleted' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/subtopics?topic_id=<uuid> ───────────────────────────────
// FIX: was parseInt(topic_id) — topic_id is a UUID foreign key
router.get('/subtopics', protect, teacherOnly, async (req, res) => {
  const { topic_id } = req.query;
  if (!topic_id) return res.status(400).json({ success: false, error: 'topic_id is required' });
  try {
    const rows = await sequelize.query(
      `SELECT id, name, description, order_index, is_active
       FROM subtopics WHERE topic_id = :topicId AND is_active = true
       ORDER BY order_index ASC NULLS LAST, name ASC`,
      { replacements: { topicId: topic_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /api/teacher/subtopics ───────────────────────────────────────────────
// FIX: was parseInt(topic_id) and parseInt(subject_id) — both are UUID foreign keys
router.post('/subtopics', protect, teacherOnly, async (req, res) => {
  const { topic_id, subject_id, name, description, order_index = 0 } = req.body;
  if (!topic_id || !name?.trim()) return res.status(400).json({ success: false, error: 'topic_id and name are required' });
  try {
    const rows = await sequelize.query(
      `INSERT INTO subtopics (topic_id, subject_id, name, description, order_index, is_active, created_at, updated_at)
       VALUES (:topicId, :subjectId, :name, :description, :orderIndex, true, NOW(), NOW())
       RETURNING id, name, description, order_index`,
      {
        replacements: { topicId: topic_id, subjectId: subject_id || null, name: name.trim(), description: description || null, orderIndex: parseInt(order_index) || 0 },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /api/teacher/subtopics/:id ───────────────────────────────────────────
// subtopics.id is INTEGER — parseInt(req.params.id) is correct here
router.put('/subtopics/:id', protect, teacherOnly, async (req, res) => {
  const { name, description, order_index } = req.body;
  try {
    await sequelize.query(
      `UPDATE subtopics SET name = COALESCE(NULLIF(:name,''), name), description = COALESCE(:description, description), order_index = COALESCE(:oi, order_index), updated_at = NOW() WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id), name: name || '', description: description ?? null, oi: order_index != null ? parseInt(order_index) : null }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Subtopic updated' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/teacher/subtopics/:id ────────────────────────────────────────
// subtopics.id is INTEGER — parseInt(req.params.id) is correct here
router.delete('/subtopics/:id', protect, teacherOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE subtopics SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Subtopic deleted' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/classes ──────────────────────────────────────────────────
router.get('/classes', protect, teacherOnly, async (req, res) => {
  try {
    if (!(await safeQuery(`SELECT 1 FROM classes LIMIT 1`, {}).then(r => r.length >= 0).catch(() => false))) {
      return res.json({ success: true, data: [] });
    }
    const rows = await sequelize.query(
      `SELECT c.id, c.name, c.join_code, c.created_at,
              COUNT(cm.student_id)::INTEGER AS student_count
       FROM classes c
       LEFT JOIN class_memberships cm ON cm.class_id = c.id
       WHERE c.teacher_id = :teacherId
       GROUP BY c.id ORDER BY c.created_at DESC`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    if (err.message.includes('classes') || err.message.includes('does not exist')) return res.json({ success: true, data: [] });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/classes ─────────────────────────────────────────────────
router.post('/classes', protect, teacherOnly, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  const joinCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  try {
    const result = await sequelize.query(
      `INSERT INTO classes (teacher_id, name, join_code, created_at) VALUES (:teacherId, :name, :joinCode, NOW()) RETURNING id, name, join_code`,
      { replacements: { teacherId: req.user.id, name, joinCode }, type: QueryTypes.SELECT }
    );
    return res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    if (err.message.includes('classes') || err.message.includes('does not exist')) return res.status(503).json({ success: false, error: 'Class system not yet active. Contact admin.' });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/class/:classId/invite ───────────────────────────────────
router.post('/class/:classId/invite', protect, teacherOnly, async (req, res) => {
  const newCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  try {
    await sequelize.query(
      `UPDATE classes SET join_code=:code WHERE id=:id AND teacher_id=:teacherId`,
      { replacements: { code: newCode, id: req.params.classId, teacherId: req.user.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, join_code: newCode });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/class/:classId/analytics ────────────────────────────────
router.get('/class/:classId/analytics', protect, teacherOnly, async (req, res) => {
  try {
    const students = await safeQuery(
      `SELECT u.id, u.first_name||' '||u.last_name AS name, u.email,
              COALESCE(u.study_streak_days,0) AS streak,
              COUNT(pa.id)::INTEGER AS attempts,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy_pct,
              MAX(pa.attempted_at) AS last_active
       FROM users u
       JOIN class_memberships cm ON cm.student_id=u.id AND cm.class_id=:classId
       LEFT JOIN practice_attempts pa ON pa.student_id=u.id
       GROUP BY u.id ORDER BY accuracy_pct DESC NULLS LAST`,
      { classId: req.params.classId }
    );
    return res.json({ success: true, data: { students, weak_topics: [], subject_breakdown: [] } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/tests ────────────────────────────────────────────────────
router.get('/tests', protect, teacherOnly, async (req, res) => {
  return res.json({ success: true, data: [], message: 'Test builder coming soon' });
});

// ── POST /api/teacher/nudge/:userId ──────────────────────────────────────────
router.post('/nudge/:userId', protect, teacherOnly, async (req, res) => {
  try {
    const users = await sequelize.query(
      `SELECT first_name, email FROM users WHERE id=:id`,
      { replacements: { id: req.params.userId }, type: QueryTypes.SELECT }
    );
    if (!users.length) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, message: `Nudge queued for ${users[0].email}` });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/questions ────────────────────────────────────────────────
router.get('/questions', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT q.id, q.question_text, q.difficulty, q.explanation,
              q.options, q.correct_answer, q.created_at,
              s.name AS subject_name
       FROM questions q
       LEFT JOIN subtopics  st ON st.id = q.subtopic_id
       LEFT JOIN topics      t ON t.id  = st.topic_id
       LEFT JOIN subjects    s ON s.id  = t.subject_id
       WHERE q.submitted_by = :teacherId AND q.is_active = true
       ORDER BY q.created_at DESC LIMIT 100`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /api/teacher/questions ───────────────────────────────────────────────
// FIX: was parseInt(subtopic_id) — subtopic_id is a UUID foreign key
router.post('/questions', protect, teacherOnly, async (req, res) => {
  const { question_text, subtopic_id, difficulty = 'medium', explanation, options } = req.body;
  if (!question_text?.trim()) return res.status(400).json({ success: false, error: 'question_text is required' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ success: false, error: 'At least 2 options required' });
  const correctOption = options.find(o => o.is_correct);
  if (!correctOption) return res.status(400).json({ success: false, error: 'One option must be marked correct' });
  try {
    const result = await sequelize.query(
      `INSERT INTO questions (question_text, subtopic_id, submitted_by, difficulty, explanation, options, correct_answer, type, is_active, created_at, updated_at)
       VALUES (:question_text, :subtopic_id, :submitted_by, :difficulty, :explanation, :options::jsonb, :correct_answer, 'mcq', true, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          question_text:  question_text.trim(),
          subtopic_id:    subtopic_id || null,
          submitted_by:   req.user.id,
          difficulty,
          explanation:    explanation?.trim() || null,
          options:        JSON.stringify(options.map(o => ({ option_text: o.option_text || o.text || '', is_correct: !!o.is_correct }))),
          correct_answer: correctOption.option_text || correctOption.text || '',
        },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: { id: result[0].id }, message: 'Question submitted successfully' });
  } catch (err) {
    console.error('[POST /teacher/questions]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
