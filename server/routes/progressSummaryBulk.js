'use strict';

const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

// GET /subtopics/progress-summary/bulk?student_id=1
router.get('/bulk', async (req, res) => {
  const { student_id } = req.query;

  if (!student_id) {
    return res.status(400).json({ error: 'student_id required' });
  }

  try {
    const rows = await sequelize.query(`
      SELECT 
        s.id as subject_id,
        COUNT(st.id) as total_subtopics,
        COUNT(CASE WHEN sp.completed = true THEN 1 END) as completed_subtopics
      FROM subjects s
      LEFT JOIN topics t ON t.subject_id = s.id
      LEFT JOIN subtopics st ON st.topic_id = t.id
      LEFT JOIN student_progress sp 
        ON sp.subtopic_id = st.id 
        AND sp.student_id = :student_id
      GROUP BY s.id
    `, {
      replacements: { student_id },
      type: QueryTypes.SELECT
    });

    const result = {};

    rows.forEach(r => {
      const total = Number(r.total_subtopics) || 0;
      const completed = Number(r.completed_subtopics) || 0;

      result[r.subject_id] = {
        total_subtopics: total,
        completed_subtopics: completed,
        completion_pct: total > 0 ? Math.round((completed / total) * 100) : 0
      };
    });

    res.json(result);

  } catch (err) {
    console.error('Bulk progress error:', err);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

module.exports = router;
