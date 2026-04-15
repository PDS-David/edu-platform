'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

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
