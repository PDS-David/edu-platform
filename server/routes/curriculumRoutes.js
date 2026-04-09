'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

// ─────────────────────────────────────────────────────────────
// GET /api/curriculum
// Aggregated curriculum:
// exam_boards → subjects → topics → subtopics
// PUBLIC endpoint (no auth required)
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // 1. Get all active exam boards
    const examBoards = await sequelize.query(
      `SELECT id, code, name, full_name, icon_emoji
       FROM exam_boards
       WHERE is_active = true
       ORDER BY display_order ASC, name ASC`,
      { type: QueryTypes.SELECT }
    );

    const curriculum = [];

    // 2. Loop through boards
    for (const board of examBoards) {
      // Get subjects
      const subjects = await sequelize.query(
        `SELECT id, name, code, subject_code
         FROM subjects
         WHERE exam_board_id = :board_id
           AND is_active = true
         ORDER BY name ASC`,
        {
          replacements: { board_id: board.id },
          type: QueryTypes.SELECT,
        }
      );

      const subjectsWithTopics = [];

      // 3. Loop through subjects
      for (const subject of subjects) {
        const topics = await sequelize.query(
          `SELECT id, name
           FROM topics
           WHERE subject_id = :subject_id
           ORDER BY name ASC`,
          {
            replacements: { subject_id: subject.id },
            type: QueryTypes.SELECT,
          }
        );

        const topicsWithSubtopics = [];

        // 4. Loop through topics
        for (const topic of topics) {
          const subtopics = await sequelize.query(
            `SELECT id, name
             FROM subtopics
             WHERE topic_id = :topic_id
             ORDER BY name ASC`,
            {
              replacements: { topic_id: topic.id },
              type: QueryTypes.SELECT,
            }
          );

          topicsWithSubtopics.push({
            ...topic,
            subtopics,
          });
        }

        subjectsWithTopics.push({
          ...subject,
          topics: topicsWithSubtopics,
        });
      }

      curriculum.push({
        ...board,
        subjects: subjectsWithTopics,
      });
    }

    return res.status(200).json({
      success: true,
      count: curriculum.length,
      data: curriculum,
    });
  } catch (error) {
    console.error('[GET /api/curriculum] Error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Failed to load curriculum',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.message,
      }),
    });
  }
});

module.exports = router;