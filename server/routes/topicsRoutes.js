// server/routes/topicsRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints:
//   GET /api/topics?subject_id=<uuid>   — topics + nested subtopics
//                                         Used by TopicsModal in SubjectPage
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const router     = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize  = require('../config/database');
const { protect } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/topics
// Query params:
//   subject_id (required) — UUID of the subject
//   include_subtopics     — default true, set to 'false' to skip subtopics
//
// Returns topics with nested subtopics array.
// Topics table: id (UUID), subject_id (UUID), name (VARCHAR, added by Wave 1A),
//   title (VARCHAR, legacy fallback), order_index (INTEGER).
// Subtopics table: id (UUID), topic_id (UUID), name (VARCHAR), order_index.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const { subject_id, include_subtopics = 'true' } = req.query;

  if (!subject_id) {
    return res.status(400).json({
      success: false,
      error: 'subject_id query parameter is required',
    });
  }

  try {
    // ── 1. Fetch topics for this subject ─────────────────────────────────────
    const topics = await sequelize.query(
      `SELECT
         t.id,
         COALESCE(t.name, t.title, 'Untitled Topic') AS name,
         t.description,
         COALESCE(t.order_index, 0)                  AS order_index,
         t.subject_id,
         COUNT(st.id)::INTEGER                        AS subtopic_count
       FROM topics t
       LEFT JOIN subtopics st ON st.topic_id = t.id
       WHERE t.subject_id = :subjectId
       GROUP BY t.id, t.name, t.title, t.description, t.order_index, t.subject_id
       ORDER BY COALESCE(t.order_index, 0) ASC, COALESCE(t.name, t.title) ASC`,
      { replacements: { subjectId: subject_id }, type: QueryTypes.SELECT }
    );

    if (topics.length === 0) {
      return res.status(200).json({ success: true, count: 0, topics: [] });
    }

    // ── 2. Optionally fetch subtopics ─────────────────────────────────────────
    let subtopicsByTopic = {};

    if (include_subtopics !== 'false') {
      const topicIds = topics.map(t => t.id);

      const subtopics = await sequelize.query(
        `SELECT
           st.id,
           st.topic_id,
           st.name,
           st.description,
           COALESCE(st.order_index, 0) AS order_index
         FROM subtopics st
         WHERE st.topic_id IN (:topicIds)
         ORDER BY COALESCE(st.order_index, 0) ASC, st.name ASC`,
        { replacements: { topicIds }, type: QueryTypes.SELECT }
      );

      subtopics.forEach(st => {
        if (!subtopicsByTopic[st.topic_id]) subtopicsByTopic[st.topic_id] = [];
        subtopicsByTopic[st.topic_id].push({
          id:          st.id,
          name:        st.name,
          description: st.description,
          order_index: st.order_index,
          is_complete: false, // resolved from subtopic_progress on client
        });
      });
    }

    // ── 3. Merge and return ───────────────────────────────────────────────────
    const result = topics.map(t => ({
      id:                    t.id,
      name:                  t.name,
      description:           t.description,
      order_index:           t.order_index,
      subtopic_count:        t.subtopic_count,
      subtopics:             subtopicsByTopic[t.id] || [],
      completion_percentage: 0, // client resolves from subtopic_progress
    }));

    return res.status(200).json({ success: true, count: result.length, topics: result });

  } catch (err) {
    console.error('[GET /api/topics] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch topics',
      ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
    });
  }
});

module.exports = router;
