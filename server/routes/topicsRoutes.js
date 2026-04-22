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

// ── POST /api/topics ─────────────────────────────────────────────────────────
router.post('/', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { subject_id, name, description, order_index } = req.body;
  if (!subject_id || !name?.trim()) return res.status(400).json({ success: false, error: 'subject_id and name are required' });
  try {
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
    await sequelize.query(`DELETE FROM subtopics WHERE id=:id`, { replacements: { id: req.params.id }, type: QueryTypes.DELETE });
    return res.json({ success: true, message: 'Subtopic deleted' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
