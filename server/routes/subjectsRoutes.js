const express = require('express');
const router = express.Router();
const { getSubjects, getSubject, createSubject } = require('../controllers/subjects');
const { protect, authorize } = require('../middleware/auth');

router.get('/', getSubjects);
router.get('/:id', getSubject);
router.post('/', protect, authorize('admin', 'teacher'), createSubject);

// ── GET /api/subjects/search?q=... ──────────────────────────────────────────
// Global search across subjects, topics, subtopics scoped to the student's
// enrollments. Returns up to 20 results ranked by match quality.
// X17 fix.
const { QueryTypes } = require('sequelize');
const db = require('../config/database');

router.get('/search', protect, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ success: true, data: [] });

  const pattern = `%${q.toLowerCase()}%`;
  const userId  = req.user.id;

  try {
    const rows = await db.query(
      `SELECT
         'subject'  AS type,
         s.id::text AS id,
         s.name     AS title,
         NULL       AS subtitle,
         eb.name    AS context,
         s.id::text AS subject_id,
         NULL       AS topic_id,
         NULL       AS subtopic_id
       FROM subjects s
       JOIN exam_boards eb ON eb.id = s.exam_board_id
       JOIN student_subjects ss ON ss.subject_id = s.id
         AND ss.student_id = :userId AND ss.is_active = true
       WHERE s.is_active = true
         AND LOWER(s.name) LIKE :pattern

       UNION ALL

       SELECT
         'topic'    AS type,
         t.id::text AS id,
         t.name     AS title,
         s.name     AS subtitle,
         eb.name    AS context,
         s.id::text AS subject_id,
         t.id::text AS topic_id,
         NULL       AS subtopic_id
       FROM topics t
       JOIN subjects s  ON s.id  = t.subject_id
       JOIN exam_boards eb ON eb.id = s.exam_board_id
       JOIN student_subjects ss ON ss.subject_id = s.id
         AND ss.student_id = :userId AND ss.is_active = true
       WHERE t.is_active = true AND s.is_active = true
         AND LOWER(t.name) LIKE :pattern

       UNION ALL

       SELECT
         'subtopic' AS type,
         st.id::text AS id,
         st.name    AS title,
         t.name     AS subtitle,
         s.name     AS context,
         s.id::text AS subject_id,
         t.id::text AS topic_id,
         st.id::text AS subtopic_id
       FROM subtopics st
       JOIN topics   t  ON t.id  = st.topic_id
       JOIN subjects s  ON s.id  = t.subject_id
       JOIN student_subjects ss ON ss.subject_id = s.id
         AND ss.student_id = :userId AND ss.is_active = true
       WHERE COALESCE(st.is_active, true) = true AND t.is_active = true AND s.is_active = true
         AND LOWER(st.name) LIKE :pattern

       ORDER BY
         CASE type WHEN 'subtopic' THEN 1 WHEN 'topic' THEN 2 ELSE 3 END,
         title
       LIMIT 20`,
      { replacements: { userId, pattern }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /subjects/search]', err.message);
    return res.json({ success: true, data: [] });
  }
});

module.exports = router;
