'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

// ── GET /api/topics?subject_id=X ─────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const rawId = req.query.subject_id;
  const subjectId = rawId && !isNaN(Number(rawId)) ? Number(rawId) : rawId;
  const includeSubtopics = req.query.include_subtopics !== 'false';

  if (!subjectId) {
    return res.status(400).json({ success: false, error: 'subject_id is required' });
  }

  try {
    const topics = await sequelize.query(
      `SELECT t.id, COALESCE(t.name, t.title, 'Untitled Topic') AS name,
              t.description, COALESCE(t.order_index, 0) AS order_index,
              COUNT(st.id)::int AS subtopic_count
       FROM topics t
       LEFT JOIN subtopics st ON st.topic_id = t.id
       WHERE t.subject_id = :subjectId
       GROUP BY t.id
       ORDER BY order_index ASC, name ASC`,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    if (!topics.length) return res.json({ success: true, count: 0, topics: [] });

    let subtopicsByTopic = {};
    if (includeSubtopics) {
      const topicIds = topics.map(t => t.id);
      const subtopics = await sequelize.query(
        `SELECT id, topic_id, name, description, order_index
         FROM subtopics WHERE topic_id IN (:topicIds)
         ORDER BY order_index ASC, name ASC`,
        { replacements: { topicIds }, type: QueryTypes.SELECT }
      );
      for (const st of subtopics) {
        if (!subtopicsByTopic[st.topic_id]) subtopicsByTopic[st.topic_id] = [];
        subtopicsByTopic[st.topic_id].push({ id: st.id, name: st.name, description: st.description, order_index: st.order_index, is_complete: false });
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

// ── POST /api/topics ──────────────────────────────────────────────────────────
router.post('/', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { subject_id, name, description, order_index } = req.body;
  if (!subject_id || !name?.trim()) {
    return res.status(400).json({ success: false, error: 'subject_id and name are required' });
  }
  try {
    const rows = await sequelize.query(
      `INSERT INTO topics (subject_id, name, title, description, order_index, created_at, updated_at)
       VALUES (:subject_id, :name, :name, :description, :order_index, NOW(), NOW())
       RETURNING id, name, description, order_index`,
      { replacements: { subject_id, name: name.trim(), description: description || null, order_index: order_index ?? 0 }, type: QueryTypes.SELECT }
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[topics POST]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/topics/:id ───────────────────────────────────────────────────────
router.put('/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { name, description, order_index } = req.body;
  try {
    await sequelize.query(
      `UPDATE topics SET name = COALESCE(:name, name), title = COALESCE(:name, title),
       description = COALESCE(:description, description),
       order_index = COALESCE(:order_index, order_index), updated_at = NOW()
       WHERE id = :id`,
      { replacements: { id: req.params.id, name: name || null, description: description ?? null, order_index: order_index ?? null }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Topic updated' });
  } catch (err) {
    console.error('[topics PUT]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/topics/:id ────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    await sequelize.query(`DELETE FROM subtopics WHERE topic_id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.DELETE });
    await sequelize.query(`DELETE FROM topics WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.DELETE });
    return res.json({ success: true, message: 'Topic and its subtopics deleted' });
  } catch (err) {
    console.error('[topics DELETE]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/topics/:topicId/subtopics ───────────────────────────────────────
router.post('/:topicId/subtopics', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { name, description, order_index } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
  try {
    const rows = await sequelize.query(
      `INSERT INTO subtopics (topic_id, name, description, order_index, created_at, updated_at)
       VALUES (:topic_id, :name, :description, :order_index, NOW(), NOW())
       RETURNING id, name, description, order_index`,
      { replacements: { topic_id: req.params.topicId, name: name.trim(), description: description || null, order_index: order_index ?? 0 }, type: QueryTypes.SELECT }
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[subtopics POST]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/topics/subtopics/:id ─────────────────────────────────────────────
router.put('/subtopics/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  const { name, description, order_index } = req.body;
  try {
    await sequelize.query(
      `UPDATE subtopics SET name = COALESCE(:name, name),
       description = COALESCE(:description, description),
       order_index = COALESCE(:order_index, order_index), updated_at = NOW()
       WHERE id = :id`,
      { replacements: { id: req.params.id, name: name || null, description: description ?? null, order_index: order_index ?? null }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Subtopic updated' });
  } catch (err) {
    console.error('[subtopics PUT]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/topics/subtopics/:id ─────────────────────────────────────────
router.delete('/subtopics/:id', protect, authorize('admin', 'teacher'), async (req, res) => {
  try {
    await sequelize.query(`DELETE FROM subtopics WHERE id = :id`, { replacements: { id: req.params.id }, type: QueryTypes.DELETE });
    return res.json({ success: true, message: 'Subtopic deleted' });
  } catch (err) {
    console.error('[subtopics DELETE]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;


router.get('/', protect, async (req, res) => {
  const subjectId = Number(req.query.subject_id);
  const includeSubtopics = req.query.include_subtopics !== 'false';

  if (!subjectId || Number.isNaN(subjectId)) {
    return res.status(400).json({
      success: false,
      error: 'subject_id must be a valid integer',
    });
  }

  try {
    const topics = await sequelize.query(
      `
      SELECT
        t.id,
        COALESCE(t.name, t.title, 'Untitled Topic') AS name,
        t.description,
        COALESCE(t.order_index, 0) AS order_index,
        COUNT(st.id)::int AS subtopic_count
      FROM topics t
      LEFT JOIN subtopics st ON st.topic_id = t.id
      WHERE t.subject_id = :subjectId
      GROUP BY t.id
      ORDER BY order_index ASC, name ASC
      `,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    if (!topics.length) {
      return res.json({ success: true, count: 0, topics: [] });
    }

    let subtopicsByTopic = {};

    if (includeSubtopics) {
      const topicIds = topics.map(t => t.id);

      const subtopics = await sequelize.query(
        `
        SELECT id, topic_id, name, description, order_index
        FROM subtopics
        WHERE topic_id IN (:topicIds)
        ORDER BY order_index ASC, name ASC
        `,
        { replacements: { topicIds }, type: QueryTypes.SELECT }
      );

      for (const st of subtopics) {
        if (!subtopicsByTopic[st.topic_id]) {
          subtopicsByTopic[st.topic_id] = [];
        }

        subtopicsByTopic[st.topic_id].push({
          id: st.id,
          name: st.name,
          description: st.description,
          order_index: st.order_index,
          is_complete: false,
        });
      }
    }

    const result = topics.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      order_index: t.order_index,
      subtopic_count: t.subtopic_count,
      subtopics: subtopicsByTopic[t.id] || [],
    }));

    return res.json({
      success: true,
      count: result.length,
      topics: result,
    });

  } catch (err) {
    console.error('[topics] error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch topics',
    });
  }
});

module.exports = router;
