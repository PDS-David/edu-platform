'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

router.get('/', async (req, res) => {
  try {
    //  FIXED: removed "full_name"
    const examBoards = await sequelize.query(
      `SELECT id, code, name, icon_emoji
       FROM exam_boards
       WHERE is_active = true
       ORDER BY display_order ASC, name ASC`,
      { type: QueryTypes.SELECT }
    );

    const curriculum = [];

    for (const board of examBoards) {
      let subjects = [];

      try {
        subjects = await sequelize.query(
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
      } catch (err) {
        console.error(' Subjects query failed:', err.message);
      }

      const subjectsWithTopics = [];

      for (const subject of subjects) {
        let topics = [];

        try {
          topics = await sequelize.query(
            `SELECT id, name
             FROM topics
             WHERE subject_id = :subject_id
             ORDER BY name ASC`,
            {
              replacements: { subject_id: subject.id },
              type: QueryTypes.SELECT,
            }
          );
        } catch (err) {
          console.error(' Topics query failed:', err.message);
        }

        const topicsWithSubtopics = [];

        for (const topic of topics) {
          let subtopics = [];

          try {
            subtopics = await sequelize.query(
              `SELECT id, name
               FROM subtopics
               WHERE topic_id = :topic_id
               ORDER BY name ASC`,
              {
                replacements: { topic_id: topic.id },
                type: QueryTypes.SELECT,
              }
            );
          } catch (err) {
            console.error(' Subtopics query failed:', err.message);
          }

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
    console.error(' FULL ERROR in /api/curriculum:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to load curriculum',
    });
  }
});

module.exports = router;
