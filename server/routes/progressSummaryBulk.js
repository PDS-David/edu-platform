'use strict';

const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

// GET /subtopics/progress-summary/bulk?student_id=1
router.get('/bulk', async (req, res) => {
  const { student_id } = req.query;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!student_id || isNaN(Number(student_id))) {
    return res.status(400).json({
      success: false,
      error: 'Valid student_id is required'
    });
  }

  // Ownership guard — students may only access their own data
  if (
    req.user.role === 'student' &&
    String(req.user.id) !== String(student_id)
  ) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    // ── IMPORTANT FIX:
    // Use DISTINCT to avoid overcounting due to joins
    // ──────────────────────────────────────────────
    const rows = await sequelize.query(`
      SELECT 
        s.id AS subject_id,

        COUNT(DISTINCT st.id) AS total_subtopics,

        COUNT(DISTINCT CASE 
          WHEN sp.completed = true THEN st.id 
        END) AS completed_subtopics

      FROM subjects s

      LEFT JOIN topics t 
        ON t.subject_id = s.id

      LEFT JOIN subtopics st 
        ON st.topic_id = t.id

      LEFT JOIN student_progress sp 
        ON sp.subtopic_id = st.id 
        AND sp.student_id = :student_id

      GROUP BY s.id
    `, {
      replacements: { student_id: Number(student_id) },
      type: QueryTypes.SELECT
    });

    // ── Transform to map (O(1) lookup on frontend) ───────────────────────────
    const result = {};

    rows.forEach(r => {
      const subjectId = r.subject_id;

      // Postgres returns counts as strings → convert safely
      const total = parseInt(r.total_subtopics, 10) || 0;
      const completed = parseInt(r.completed_subtopics, 10) || 0;

      result[subjectId] = {
        total_subtopics: total,
        completed_subtopics: completed,
        completion_pct:
          total > 0
            ? Math.round((completed / total) * 100)
            : 0
      };
    });

    return res.json({
      success: true,
      data: result
    });

  } catch (err) {
    console.error('Bulk progress error:', {
      message: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to load progress summary'
    });
  }
});

module.exports = router;
