'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────
// GET /api/topics?subject_id=123&include_subtopics=true
// ─────────────────────────────────────────────────────────────

router.get('/', protect, async (req, res) => {
  const subjectId = parseInt(req.query.subject_id, 10);
  const includeSubtopics = req.query.include_subtopics !== 'false';

  if (!subjectId) {
    return res.status(400).json({
      success: false,
      error: 'subject_id (integer) is required',
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
        t.subject_id,
        COUNT(st.id)::INTEGER AS subtopic_count
      FROM topics t
      LEFT JOIN subtopics st ON st.topic_id = t.id
      WHERE t.subject_id = :subjectId
      GROUP BY t.id, t.name, t.title, t.description, t.order_index, t.subject_id
      ORDER BY COALESCE(t.order_index, 0), name ASC
      `,
      { replacements: { subjectId }, type: QueryTypes.SELECT }
    );

    if (!topics.length) {
      return res.status(200).json({ success: true, count: 0, topics: [] });
    }

    let subtopicsByTopic = {};

    if (includeSubtopics) {
      const topicIds = topics.map(t => t.id);

      const subtopics = await sequelize.query(
        `
        SELECT
          id,
          topic_id,
          name,
          description,
          COALESCE(order_index, 0) AS order_index
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
      completion_percentage: 0,
    }));

    return res.status(200).json({
      success: true,
      count: result.length,
      topics: result,
    });

  } catch (err) {
    console.error('[GET /topics] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch topics',
    });
  }
});

module.exports = router;
