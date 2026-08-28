'use strict';
/**
 * server/routes/topicsRoutes.js
 * GET  /api/topics?subject_id=X
 *   — Returns topics + subtopics for a subject.
 *   — If subject_id returns zero results, falls back to matching by subject NAME
 *     so seeded topics appear even when the student enrolled under a different
 *     subject row that shares the same name (e.g. subject_id=18 "Biology" gets
 *     topics seeded under the new "Biology" subject_id=22).
 */

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

// ── GET /api/topics ──────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const rawId = req.query.subject_id;
  if (!rawId) return res.status(400).json({ success: false, error: 'subject_id is required' });

  const includeSubtopics = req.query.include_subtopics !== 'false';

  try {
    // Scoping: a student may only browse topics for a subject they're
    // actually registered for (own selection OR class-assigned — same
    // check used by resourceRoutes.js / pastPaperRoutes.js). A teacher is
    // limited to their assigned subject(s) via teacher_subjects, but only
    // once they actually have an assignment on record — a teacher with
    // zero rows there is unaffected (matches the TEACHER-01 rollout
    // pattern already used in pastPaperRoutes.js, so nobody teaching
    // before assignments were introduced gets locked out mid-rollout).
    if (req.user.role === 'student') {
      const registered = await sequelize.query(
        `SELECT 1 FROM student_subjects ss
          WHERE ss.student_id = :studentId AND ss.subject_id = :subjectId AND ss.status = 'approved'
         UNION
         SELECT 1 FROM class_memberships cm
           JOIN class_subjects cs ON cs.class_id = cm.class_id
          WHERE cm.student_id = :studentId AND cs.subject_id = :subjectId
         LIMIT 1`,
        { replacements: { studentId: req.user.id, subjectId: rawId }, type: QueryTypes.SELECT }
      ).catch(() => []); // fail open if class_memberships/class_subjects don't exist yet in this environment
      if (!registered.length) {
        return res.status(403).json({ success: false, error: 'You are not registered for this subject' });
      }
    } else if (req.user.role === 'teacher') {
      const assigned = await sequelize.query(
        `SELECT subject_id FROM teacher_subjects WHERE teacher_id = :teacherId AND is_active = true`,
        { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
      );
      const assignedIds = assigned.map(r => String(r.subject_id));
      if (assignedIds.length && !assignedIds.includes(String(rawId))) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
      }
    }

    // ── Primary lookup: exact subject_id ──────────────────────────────────────
    let topics = await sequelize.query(
      `SELECT t.id, COALESCE(t.name, t.title, 'Untitled Topic') AS name,
              t.description, COALESCE(t.order_index, 0) AS order_index,
              COUNT(st.id)::int AS subtopic_count
       FROM topics t
       LEFT JOIN subtopics st ON st.topic_id = t.id
       WHERE t.subject_id = :subjectId
       GROUP BY t.id
       ORDER BY order_index ASC, name ASC`,
      { replacements: { subjectId: rawId }, type: QueryTypes.SELECT }
    );

    // ── Fallback: look up subject name, find all siblings, merge their topics ─
    if (!topics.length) {
      const subjRow = await sequelize.query(
        `SELECT name FROM subjects WHERE id = :id LIMIT 1`,
        { replacements: { id: rawId }, type: QueryTypes.SELECT }
      );
      if (subjRow.length) {
        const subjectName = subjRow[0].name;
        topics = await sequelize.query(
          `SELECT t.id, COALESCE(t.name, t.title, 'Untitled Topic') AS name,
                  t.description, COALESCE(t.order_index, 0) AS order_index,
                  COUNT(st.id)::int AS subtopic_count
           FROM topics t
           LEFT JOIN subtopics st ON st.topic_id = t.id
           JOIN subjects s ON s.id = t.subject_id
           WHERE LOWER(s.name) = LOWER(:subjectName)
           GROUP BY t.id
           ORDER BY order_index ASC, name ASC`,
          { replacements: { subjectName }, type: QueryTypes.SELECT }
        );
      }
    }

    if (!topics.length) return res.json({ success: true, count: 0, topics: [] });

    let subtopicsByTopic = {};
    if (includeSubtopics && topics.length) {
      const topicIds = topics.map(t => t.id);
      const subtopics = await sequelize.query(
        `SELECT id, topic_id, name, description, order_index
         FROM subtopics WHERE topic_id IN (:topicIds)
         ORDER BY order_index ASC, name ASC`,
        { replacements: { topicIds }, type: QueryTypes.SELECT }
      );
      for (const st of subtopics) {
        if (!subtopicsByTopic[st.topic_id]) subtopicsByTopic[st.topic_id] = [];
        subtopicsByTopic[st.topic_id].push({
          id: st.id, name: st.name, description: st.description,
          order_index: st.order_index, is_complete: false,
        });
      }
    }

    const result = topics.map(t => ({
      id: t.id, name: t.name, description: t.description,
      order_index: t.order_index, subtopic_count: t.subtopic_count,
      subtopics: subtopicsByTopic[t.id] || [],
    }));

    return res.json({ success: true, count: result.length, topics: result });
  } catch (err) {
    console.error('[topics GET]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch topics' });
  }
});

// ── Helper: is this teacher allowed to write to this subject_id? ────────────
// Same fail-open-if-unassigned rollout pattern as the GET / read scoping
// above and pastPaperRoutes.js's TEACHER-01 fix — a teacher with zero
// teacher_subjects rows on record is unaffected, so this doesn't lock
// anyone out before school admins have assigned subjects.
async function teacherCanWriteSubject(teacherId, subjectId) {
  const assigned = await sequelize.query(
    `SELECT subject_id FROM teacher_subjects WHERE teacher_id = :teacherId AND is_active = true`,
    { replacements: { teacherId }, type: QueryTypes.SELECT }
  );
  if (!assigned.length) return true; // no assignments on record — unrestricted
  return assigned.some(r => String(r.subject_id) === String(subjectId));
}

// ── POST /api/topics ─────────────────────────────────────────────────────────
router.post('/', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { subject_id, name, description, order_index } = req.body;
  if (!subject_id || !name?.trim()) return res.status(400).json({ success: false, error: 'subject_id and name are required' });
  try {
    if (req.user.role === 'teacher' && !(await teacherCanWriteSubject(req.user.id, subject_id))) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
    }
    const rows = await sequelize.query(
      `INSERT INTO topics (subject_id, name, title, description, order_index, created_at, updated_at)
       VALUES (:subject_id, :name, :name, :description, :order_index, NOW(), NOW())
       RETURNING id, name, description, order_index`,
      { replacements: { subject_id, name: name.trim(), description: description || null, order_index: order_index ?? 0 }, type: QueryTypes.SELECT }
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/topics/:id ──────────────────────────────────────────────────────
router.put('/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { name, description, order_index } = req.body;
  try {
    if (req.user.role === 'teacher') {
      const topicRow = await sequelize.query(
        `SELECT subject_id FROM topics WHERE id = :id LIMIT 1`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (topicRow.length && !(await teacherCanWriteSubject(req.user.id, topicRow[0].subject_id))) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
      }
    }
    await sequelize.query(
      `UPDATE topics SET name=COALESCE(:name,name), title=COALESCE(:name,title),
       description=COALESCE(:desc,description), order_index=COALESCE(:ord,order_index), updated_at=NOW()
       WHERE id=:id`,
      { replacements: { id: req.params.id, name: name||null, desc: description??null, ord: order_index??null }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Topic updated' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/topics/:id ───────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      const topicRow = await sequelize.query(
        `SELECT subject_id FROM topics WHERE id = :id LIMIT 1`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (topicRow.length && !(await teacherCanWriteSubject(req.user.id, topicRow[0].subject_id))) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
      }
    }
    await sequelize.query(`DELETE FROM subtopics WHERE topic_id=:id`, { replacements: { id: req.params.id }, type: QueryTypes.DELETE });
    await sequelize.query(`DELETE FROM topics WHERE id=:id`, { replacements: { id: req.params.id }, type: QueryTypes.DELETE });
    return res.json({ success: true, message: 'Topic deleted' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /api/topics/:topicId/subtopics ─────────────────────────────────────
router.post('/:topicId/subtopics', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { name, description, order_index } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
  try {
    // Get subject_id from the topic
    const topicRow = await sequelize.query(
      `SELECT subject_id FROM topics WHERE id=:id LIMIT 1`,
      { replacements: { id: req.params.topicId }, type: QueryTypes.SELECT }
    );
    const subjectId = topicRow[0]?.subject_id || null;
    if (req.user.role === 'teacher' && subjectId && !(await teacherCanWriteSubject(req.user.id, subjectId))) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
    }
    const rows = await sequelize.query(
      `INSERT INTO subtopics (topic_id, subject_id, name, description, order_index, is_active, created_at, updated_at)
       VALUES (:topic_id, :subject_id, :name, :description, :order_index, true, NOW(), NOW())
       RETURNING id, name, description, order_index`,
      { replacements: { topic_id: req.params.topicId, subject_id: subjectId, name: name.trim(), description: description||null, order_index: order_index??0 }, type: QueryTypes.SELECT }
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /api/topics/subtopics/:id ────────────────────────────────────────────
router.put('/subtopics/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { name, description, order_index } = req.body;
  try {
    if (req.user.role === 'teacher') {
      const stRow = await sequelize.query(
        `SELECT subject_id FROM subtopics WHERE id = :id LIMIT 1`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (stRow.length && stRow[0].subject_id && !(await teacherCanWriteSubject(req.user.id, stRow[0].subject_id))) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
      }
    }
    await sequelize.query(
      `UPDATE subtopics SET name=COALESCE(:name,name), description=COALESCE(:desc,description),
       order_index=COALESCE(:ord,order_index), updated_at=NOW() WHERE id=:id`,
      { replacements: { id: req.params.id, name: name||null, desc: description??null, ord: order_index??null }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Subtopic updated' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/topics/subtopics/:id ────────────────────────────────────────
router.delete('/subtopics/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      const stRow = await sequelize.query(
        `SELECT subject_id FROM subtopics WHERE id = :id LIMIT 1`,
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
      );
      if (stRow.length && stRow[0].subject_id && !(await teacherCanWriteSubject(req.user.id, stRow[0].subject_id))) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
      }
    }
    await sequelize.query(`DELETE FROM subtopics WHERE id=:id`, { replacements: { id: req.params.id }, type: QueryTypes.DELETE });
    return res.json({ success: true, message: 'Subtopic deleted' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
