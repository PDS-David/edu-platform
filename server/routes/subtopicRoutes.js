'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

function isValidInt(v) {
  return Number.isInteger(Number(v));
}

// ─────────────────────────────────────────────────────────────
// GET /api/subtopics
// ─────────────────────────────────────────────────────────────

router.get('/', protect, async (req, res) => {
  const subjectId = req.query.subject_id ? Number(req.query.subject_id) : null;
  const topicId = req.query.topic_id ? Number(req.query.topic_id) : null;

  const filters = [];
  const replacements = { studentId: req.user.id };

  if (subjectId) {
    filters.push('st.subject_id = :subjectId');
    replacements.subjectId = subjectId;
  }

  if (topicId) {
    filters.push('st.topic_id = :topicId');
    replacements.topicId = topicId;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const subtopics = await sequelize.query(
      `
      SELECT
        st.id,
        st.name,
        st.description,
        st.order_index,
        st.topic_id,
        st.subject_id,
        COALESCE(sp.resources_completed, false) AS resources_completed,
        COALESCE(sp.practice_completed, false) AS practice_completed,
        COALESCE(sp.quiz_completed, false) AS quiz_completed,
        const subtopics = await sequelize.query(
  `
  SELECT
    st.id,
    st.name,
    st.description,
    st.order_index,
    st.topic_id,
    st.subject_id,

    COALESCE(sp.resources_completed, false) AS resources_completed,
    COALESCE(sp.practice_completed, false) AS practice_completed,
    COALESCE(sp.quiz_completed, false) AS quiz_completed,
    COALESCE(sp.notes_viewed, false) AS notes_viewed,
    COALESCE(sp.video_watched, false) AS video_watched

  FROM subtopics st
  JOIN topics t ON st.topic_id = t.id
  JOIN subjects s ON st.subject_id = s.id
  LEFT JOIN subtopic_progress sp
    ON sp.subtopic_id = st.id AND sp.student_id = :studentId

  ${where}
  ORDER BY t.order_index ASC, st.order_index ASC
  `,
  { replacements, type: QueryTypes.SELECT }
);
      FROM subtopics st
      JOIN topics t ON st.topic_id = t.id
      JOIN subjects s ON st.subject_id = s.id
      LEFT JOIN subtopic_progress sp
        ON sp.subtopic_id = st.id AND sp.student_id = :studentId
      ${where}
      ORDER BY t.order_index ASC, st.order_index ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.json({ success: true, count: subtopics.length, data: subtopics });

  } catch (err) {
    console.error('[GET /subtopics] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch subtopics',
    });
  }
});

// ─────────────────────────────────────────────
// GET /api/subtopics/:id
// ─────────────────────────────────────────────

router.get('/:id', protect, async (req, res) => {
  const id = Number(req.params.id);

  if (!isValidInt(id)) {
    return res.status(400).json({ success: false, error: 'Invalid ID' });
  }

  try {
    const rows = await sequelize.query(
      `
      SELECT st.*, t.name AS topic_name, s.name AS subject_name
      FROM subtopics st
      JOIN topics t ON st.topic_id = t.id
      JOIN subjects s ON st.subject_id = s.id
      WHERE st.id = :id
      `,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    return res.json({ success: true, data: rows[0] });

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch' });
  }
});

// ─────────────────────────────────────────────
// GET /:id/adjacent
// ─────────────────────────────────────────────

router.get('/:id/adjacent', protect, async (req, res) => {
  const id = Number(req.params.id);
  if (!isValidInt(id)) {
    return res.status(400).json({ success: false, error: 'Invalid ID' });
  }

  try {
    const current = await sequelize.query(
      `SELECT id, topic_id, order_index FROM subtopics WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!current.length) {
      return res.status(404).json({ success: false });
    }

    const { topic_id, order_index } = current[0];

    const prev = await sequelize.query(
      `
      SELECT id, name FROM subtopics
      WHERE topic_id = :topicId AND order_index < :orderIndex
      ORDER BY order_index DESC LIMIT 1
      `,
      { replacements: { topicId: topic_id, orderIndex: order_index }, type: QueryTypes.SELECT }
    );

    const next = await sequelize.query(
      `
      SELECT id, name FROM subtopics
      WHERE topic_id = :topicId AND order_index > :orderIndex
      ORDER BY order_index ASC LIMIT 1
      `,
      { replacements: { topicId: topic_id, orderIndex: order_index }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      data: {
        previous: prev[0] || null,
        next: next[0] || null,
      },
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed adjacent lookup' });
  }
});

module.exports = router;
