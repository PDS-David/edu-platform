// server/routes/teacherRoutes.js
// GET  /api/teacher/classes
// POST /api/teacher/classes
// POST /api/teacher/class/:classId/invite       — generate/refresh join code
// GET  /api/teacher/class/:classId/analytics
// POST /api/teacher/nudge/:userId               — send re-engagement email
// POST /api/student/join-class                  — student joins by code

const express   = require('express');
const router    = express.Router();
const crypto    = require('crypto');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

const teacherOnly = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  next();
};

// ── GET /api/teacher/classes ──────────────────────────────────────────────────
router.get('/classes', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT c.id, c.name, c.join_code, c.subject_ids, c.created_at,
              COUNT(cm.student_id)::INTEGER AS student_count,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy
       FROM classes c
       LEFT JOIN class_memberships cm ON cm.class_id = c.id
       LEFT JOIN practice_attempts pa ON pa.student_id = cm.student_id
         AND pa.attempted_at > NOW() - INTERVAL '30 days'
       WHERE c.teacher_id = :teacherId
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/classes ─────────────────────────────────────────────────
router.post('/classes', protect, teacherOnly, async (req, res) => {
  const { name, subject_ids = [] } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });

  const joinCode = crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. A3F9B2
  try {
    const result = await sequelize.query(
      `INSERT INTO classes (id, teacher_id, name, join_code, subject_ids, created_at)
       VALUES (gen_random_uuid(), :teacherId, :name, :joinCode, :subjectIds::jsonb, NOW())
       RETURNING id, join_code`,
      {
        replacements: {
          teacherId:  req.user.id,
          name,
          joinCode,
          subjectIds: JSON.stringify(subject_ids),
        },
        type: QueryTypes.INSERT,
      }
    );
    return res.status(201).json({ success: true, data: result[0][0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/class/:classId/invite ───────────────────────────────────
router.post('/class/:classId/invite', protect, teacherOnly, async (req, res) => {
  const newCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  try {
    await sequelize.query(
      `UPDATE classes SET join_code = :code WHERE id = :id AND teacher_id = :teacherId`,
      { replacements: { code: newCode, id: req.params.classId, teacherId: req.user.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, join_code: newCode });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/class/:classId/analytics ─────────────────────────────────
router.get('/class/:classId/analytics', protect, teacherOnly, async (req, res) => {
  const { classId } = req.params;
  try {
    // Verify ownership
    const cls = await sequelize.query(
      `SELECT id FROM classes WHERE id = :classId AND teacher_id = :teacherId`,
      { replacements: { classId, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!cls.length) return res.status(403).json({ success: false, error: 'Class not found' });

    const [weakTopics, students, subBreakdown] = await Promise.all([
      // Weak topics across class
      sequelize.query(
        `SELECT q.topic,
                ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
                COUNT(DISTINCT pa.student_id)::INTEGER AS student_count
         FROM practice_attempts pa
         JOIN questions q ON q.id = pa.question_id
         JOIN class_memberships cm ON cm.student_id = pa.student_id AND cm.class_id = :classId
         WHERE pa.attempted_at > NOW() - INTERVAL '30 days'
           AND q.topic IS NOT NULL
         GROUP BY q.topic
         ORDER BY avg_accuracy ASC
         LIMIT 10`,
        { replacements: { classId }, type: QueryTypes.SELECT }
      ),
      // Per-student stats
      sequelize.query(
        `SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email,
                COALESCE(u.study_streak_days, 0) AS streak,
                COUNT(pa.id)::INTEGER AS attempts,
                ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
                MAX(pa.attempted_at) AS last_active
         FROM users u
         JOIN class_memberships cm ON cm.student_id = u.id AND cm.class_id = :classId
         LEFT JOIN practice_attempts pa ON pa.student_id = u.id
         GROUP BY u.id
         ORDER BY accuracy_pct DESC NULLS LAST`,
        { replacements: { classId }, type: QueryTypes.SELECT }
      ),
      // Subject breakdown
      sequelize.query(
        `SELECT s.name AS subject,
                ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy,
                ROUND(AVG(pa.time_taken_ms) / 1000.0, 1) AS avg_time
         FROM practice_attempts pa
         JOIN questions q ON q.id = pa.question_id
         JOIN subjects  s ON s.id = q.subject_id_uuid
         JOIN class_memberships cm ON cm.student_id = pa.student_id AND cm.class_id = :classId
         GROUP BY s.name`,
        { replacements: { classId }, type: QueryTypes.SELECT }
      ),
    ]);

    // Tag inactive students (>7 days)
    const now = Date.now();
    const studentsTagged = students.map(s => ({
      ...s,
      days_since_active: s.last_active
        ? Math.floor((now - new Date(s.last_active).getTime()) / 86400000)
        : null,
    }));

    return res.json({
      success: true,
      data: {
        weak_topics:          weakTopics,
        students:             studentsTagged,
        inactive_students:    studentsTagged.filter(s => s.days_since_active > 7),
        subject_breakdown:    subBreakdown,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/nudge/:userId ───────────────────────────────────────────
router.post('/nudge/:userId', protect, teacherOnly, async (req, res) => {
  try {
    const users = await sequelize.query(
      `SELECT first_name, email FROM users WHERE id = :id`,
      { replacements: { id: req.params.userId }, type: QueryTypes.SELECT }
    );
    if (!users.length) return res.status(404).json({ success: false, error: 'User not found' });

    const { sendStreakNudge } = require('../services/emailService');
    await sendStreakNudge(users[0], 7);
    return res.json({ success: true, message: `Nudge sent to ${users[0].email}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/student/join-class ──────────────────────────────────────────────
router.post('/join-class', protect, async (req, res) => {
  const { join_code } = req.body;
  if (!join_code) return res.status(400).json({ success: false, error: 'join_code is required' });

  try {
    const classes = await sequelize.query(
      `SELECT id, name FROM classes WHERE UPPER(join_code) = UPPER(:code)`,
      { replacements: { code: join_code.trim() }, type: QueryTypes.SELECT }
    );
    if (!classes.length) return res.status(404).json({ success: false, error: 'Invalid join code' });

    const cls = classes[0];
    await sequelize.query(
      `INSERT INTO class_memberships (id, class_id, student_id, joined_at)
       VALUES (gen_random_uuid(), :classId, :studentId, NOW())
       ON CONFLICT DO NOTHING`,
      { replacements: { classId: cls.id, studentId: req.user.id }, type: QueryTypes.INSERT }
    );
    return res.json({ success: true, data: { class_name: cls.name } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
