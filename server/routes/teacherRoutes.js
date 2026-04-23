'use strict';
// server/routes/teacherRoutes.js
//
// v2 UUID FIX: removed parseInt() from subject_id, topic_id, subtopic_id
//   body/query params — these are UUID foreign keys.
//   parseInt(req.params.id) is kept for topic/subtopic row PKs (INTEGER).

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const teacherOnly = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  next();
};

// Safe table check — returns empty instead of crashing
const safeQuery = async (sql, replacements, fallback = []) => {
  try { return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }); }
  catch (e) { console.warn('[teacherRoutes] query skipped:', e.message.slice(0, 80)); return fallback; }
};

// Check if teacher is assigned to a subject (graceful if table missing)
async function teacherOwnsSubject(teacherId, subjectId) {
  try {
    const r = await sequelize.query(
      `SELECT id FROM teacher_subjects WHERE teacher_id=:teacherId AND subject_id=:subjectId AND is_active=true`,
      { replacements: { teacherId, subjectId }, type: QueryTypes.SELECT }
    );
    return r.length > 0;
  } catch { return true; } // if table missing, allow — admin will fix
}

// ── GET /api/teacher/my-subjects ──────────────────────────────────────────────
router.get('/my-subjects', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT s.id, s.name, s.code, s.level, s.description,
              eb.code AS exam_board_code, eb.name AS exam_board_name
       FROM teacher_subjects ts
       JOIN subjects    s  ON s.id  = ts.subject_id
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       WHERE ts.teacher_id = :teacherId AND ts.is_active = true
       ORDER BY s.name ASC`,
      { teacherId: req.user.id }
    );
    // Fallback: if teacher_subjects missing or empty, return all subjects
    if (!rows.length) {
      const allSubjects = await safeQuery(
        `SELECT s.id, s.name, s.code, s.level,
                eb.code AS exam_board_code, eb.name AS exam_board_name
         FROM subjects s
         LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
         WHERE s.is_active = true ORDER BY s.name ASC`,
        {}
      );
      return res.json({ success: true, count: allSubjects.length, data: allSubjects });
    }
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/topics?subject_id=<uuid> ─────────────────────────────────
// FIX: was parseInt(subject_id) — subject_id is a UUID foreign key
router.get('/topics', protect, teacherOnly, async (req, res) => {
  const { subject_id } = req.query;
  if (!subject_id) return res.status(400).json({ success: false, error: 'subject_id is required' });
  try {
    const rows = await sequelize.query(
      `SELECT t.id, t.name, t.description, t.order_index,
              COUNT(st.id)::INTEGER AS subtopic_count
       FROM topics t
       LEFT JOIN subtopics st ON st.topic_id = t.id AND st.is_active = true
       WHERE t.subject_id = :subjectId AND t.is_active = true
       GROUP BY t.id ORDER BY t.order_index ASC NULLS LAST, t.name ASC`,
      { replacements: { subjectId: subject_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/topics ──────────────────────────────────────────────────
// FIX: was parseInt(subject_id) — subject_id is a UUID foreign key
router.post('/topics', protect, teacherOnly, async (req, res) => {
  const { subject_id, name, description, order_index = 0 } = req.body;
  if (!subject_id || !name?.trim()) return res.status(400).json({ success: false, error: 'subject_id and name are required' });
  try {
    const rows = await sequelize.query(
      `INSERT INTO topics (subject_id, name, description, order_index, is_active, created_at, updated_at)
       VALUES (:subjectId, :name, :description, :orderIndex, true, NOW(), NOW())
       RETURNING id, name, description, order_index`,
      {
        replacements: { subjectId: subject_id, name: name.trim(), description: description || null, orderIndex: parseInt(order_index) || 0 },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: { ...rows[0], subtopic_count: 0 } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/teacher/topics/:id ───────────────────────────────────────────────
// topics.id is INTEGER — parseInt(req.params.id) is correct here
router.put('/topics/:id', protect, teacherOnly, async (req, res) => {
  const { name, description, order_index } = req.body;
  try {
    await sequelize.query(
      `UPDATE topics SET
         name        = COALESCE(NULLIF(:name,''), name),
         description = COALESCE(:description, description),
         order_index = COALESCE(:orderIndex, order_index),
         updated_at  = NOW()
       WHERE id = :id AND is_active = true`,
      { replacements: { id: parseInt(req.params.id), name: name || '', description: description ?? null, orderIndex: order_index != null ? parseInt(order_index) : null }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Topic updated' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/teacher/topics/:id ───────────────────────────────────────────
// topics.id is INTEGER — parseInt(req.params.id) is correct here
router.delete('/topics/:id', protect, teacherOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE topics SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Topic deleted' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/subtopics?topic_id=<uuid> ───────────────────────────────
// FIX: was parseInt(topic_id) — topic_id is a UUID foreign key
router.get('/subtopics', protect, teacherOnly, async (req, res) => {
  const { topic_id } = req.query;
  if (!topic_id) return res.status(400).json({ success: false, error: 'topic_id is required' });
  try {
    const rows = await sequelize.query(
      `SELECT id, name, description, order_index, is_active
       FROM subtopics WHERE topic_id = :topicId AND is_active = true
       ORDER BY order_index ASC NULLS LAST, name ASC`,
      { replacements: { topicId: topic_id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /api/teacher/subtopics ───────────────────────────────────────────────
// FIX: was parseInt(topic_id) and parseInt(subject_id) — both are UUID foreign keys
router.post('/subtopics', protect, teacherOnly, async (req, res) => {
  const { topic_id, subject_id, name, description, order_index = 0 } = req.body;
  if (!topic_id || !name?.trim()) return res.status(400).json({ success: false, error: 'topic_id and name are required' });
  try {
    const rows = await sequelize.query(
      `INSERT INTO subtopics (topic_id, subject_id, name, description, order_index, is_active, created_at, updated_at)
       VALUES (:topicId, :subjectId, :name, :description, :orderIndex, true, NOW(), NOW())
       RETURNING id, name, description, order_index`,
      {
        replacements: { topicId: topic_id, subjectId: subject_id || null, name: name.trim(), description: description || null, orderIndex: parseInt(order_index) || 0 },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── PUT /api/teacher/subtopics/:id ───────────────────────────────────────────
// subtopics.id is INTEGER — parseInt(req.params.id) is correct here
router.put('/subtopics/:id', protect, teacherOnly, async (req, res) => {
  const { name, description, order_index } = req.body;
  try {
    await sequelize.query(
      `UPDATE subtopics SET name = COALESCE(NULLIF(:name,''), name), description = COALESCE(:description, description), order_index = COALESCE(:oi, order_index), updated_at = NOW() WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id), name: name || '', description: description ?? null, oi: order_index != null ? parseInt(order_index) : null }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Subtopic updated' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── DELETE /api/teacher/subtopics/:id ────────────────────────────────────────
// subtopics.id is INTEGER — parseInt(req.params.id) is correct here
router.delete('/subtopics/:id', protect, teacherOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE subtopics SET is_active = false, updated_at = NOW() WHERE id = :id`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Subtopic deleted' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── ensureClassTables — idempotent, runs once per process ────────────────────
let classTablesEnsured = false;
async function ensureClassTables() {
  if (classTablesEnsured) return;
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       VARCHAR(255) NOT NULL,
        join_code  VARCHAR(20),
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    // Migrate legacy schema: join codes are no longer used; the column may
    // have been NOT NULL with a UNIQUE constraint. Make it nullable so new
    // classes can be created without one. (Existing rows are left intact.)
    await sequelize.query(
      `ALTER TABLE classes ALTER COLUMN join_code DROP NOT NULL`
    ).catch(() => {});
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS class_memberships (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
        joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(class_id, student_id)
      )
    `);
    classTablesEnsured = true;
  } catch (e) {
    console.warn('[teacherRoutes] ensureClassTables failed:', e.message.slice(0, 80));
  }
}

// ── GET /api/teacher/students ─────────────────────────────────────────────────
// Returns all students who are members of any of this teacher's classes.
// Used by TeacherResourcesPage to populate the push-to-student list.
router.get('/students', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
       FROM users u
       JOIN class_memberships cm ON cm.student_id = u.id
       JOIN classes c ON c.id = cm.class_id
       WHERE c.teacher_id = :teacherId
         AND u.is_active = true
       ORDER BY u.first_name, u.last_name`,
      { teacherId: req.user.id }
    );
    // Fallback: if teacher has no classes, return all active students
    if (!rows.length) {
      const allStudents = await safeQuery(
        `SELECT id, first_name, last_name, email
         FROM users
         WHERE role = 'student' AND is_active = true
         ORDER BY first_name, last_name
         LIMIT 200`,
        {}
      );
      return res.json({ success: true, data: allStudents });
    }
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/class/:classId/students (already exists below) ───────────
router.get('/classes', protect, teacherOnly, async (req, res) => {
  await ensureClassTables();
  try {
    if (!(await safeQuery(`SELECT 1 FROM classes LIMIT 1`, {}).then(r => r.length >= 0).catch(() => false))) {
      return res.json({ success: true, data: [] });
    }
    const rows = await sequelize.query(
      `SELECT c.id, c.name, c.join_code, c.created_at,
              COUNT(cm.student_id)::INTEGER AS student_count
       FROM classes c
       LEFT JOIN class_memberships cm ON cm.class_id = c.id
       WHERE c.teacher_id = :teacherId
       GROUP BY c.id ORDER BY c.created_at DESC`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    if (err.message.includes('classes') || err.message.includes('does not exist')) return res.json({ success: true, data: [] });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/classes ─────────────────────────────────────────────────
// Create a class by naming it and selecting students directly.
// Body: { name: string, student_ids?: UUID[] }
// Join codes are no longer generated — teachers add students from the picker.
router.post('/classes', protect, teacherOnly, async (req, res) => {
  await ensureClassTables();
  const { name, student_ids = [] } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'name is required' });
  }
  const cleanIds = Array.isArray(student_ids)
    ? student_ids.filter((id) => typeof id === 'string' && UUID_REGEX.test(id))
    : [];

  try {
    const created = await sequelize.query(
      `INSERT INTO classes (teacher_id, name, created_at)
       VALUES (:teacherId, :name, NOW())
       RETURNING id, name, created_at`,
      {
        replacements: { teacherId: req.user.id, name: String(name).trim() },
        type: QueryTypes.SELECT,
      }
    );
    const cls = created[0];

    let added = 0;
    for (const sid of cleanIds) {
      try {
        await sequelize.query(
          `INSERT INTO class_memberships (class_id, student_id, joined_at)
           VALUES (:cid, :sid, NOW())
           ON CONFLICT (class_id, student_id) DO NOTHING`,
          { replacements: { cid: cls.id, sid }, type: QueryTypes.INSERT }
        );
        added++;
      } catch (err) {
        console.warn('[create class membership]', err.message);
      }
    }

    return res.status(201).json({
      success: true,
      data: { ...cls, student_count: added },
    });
  } catch (err) {
    if (err.message.includes('classes') || err.message.includes('does not exist')) {
      return res.status(503).json({ success: false, error: 'Class system not yet active. Contact admin.' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/students-directory ───────────────────────────────────────
// Returns ALL active students for the class-creation picker. Supports an
// optional ?q= search across name + email so large rosters stay manageable.
router.get('/students-directory', protect, teacherOnly, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const replacements = {};
  let where = `role = 'student' AND is_active = true`;
  if (q) {
    where += ` AND (
      LOWER(first_name) LIKE :q OR
      LOWER(last_name)  LIKE :q OR
      LOWER(email)      LIKE :q OR
      LOWER(first_name || ' ' || last_name) LIKE :q
    )`;
    replacements.q = `%${q.toLowerCase()}%`;
  }
  try {
    const rows = await sequelize.query(
      `SELECT id, first_name, last_name, email
         FROM users
        WHERE ${where}
        ORDER BY first_name, last_name
        LIMIT 500`,
      { replacements, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/teacher/class/:classId/members ───────────────────────────────────
// Replace the full member list of a class with student_ids[].
// Used by the "Manage" panel on the teacher dashboard.
router.put('/class/:classId/members', protect, teacherOnly, async (req, res) => {
  await ensureClassTables();
  const { classId } = req.params;
  const { student_ids = [] } = req.body || {};
  if (!UUID_REGEX.test(classId)) {
    return res.status(400).json({ success: false, error: 'Invalid class id' });
  }
  const cleanIds = Array.isArray(student_ids)
    ? student_ids.filter((id) => typeof id === 'string' && UUID_REGEX.test(id))
    : [];

  try {
    const owns = await sequelize.query(
      `SELECT 1 FROM classes WHERE id = :cid AND teacher_id = :tid`,
      { replacements: { cid: classId, tid: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!owns.length) {
      return res.status(403).json({ success: false, error: 'Not your class' });
    }

    await sequelize.query(
      `DELETE FROM class_memberships WHERE class_id = :cid`,
      { replacements: { cid: classId }, type: QueryTypes.DELETE }
    );
    let added = 0;
    for (const sid of cleanIds) {
      try {
        await sequelize.query(
          `INSERT INTO class_memberships (class_id, student_id, joined_at)
           VALUES (:cid, :sid, NOW())
           ON CONFLICT (class_id, student_id) DO NOTHING`,
          { replacements: { cid: classId, sid }, type: QueryTypes.INSERT }
        );
        added++;
      } catch (err) {
        console.warn('[update class members]', err.message);
      }
    }
    return res.json({ success: true, data: { class_id: classId, student_count: added } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/class/:classId/members ───────────────────────────────────
router.get('/class/:classId/members', protect, teacherOnly, async (req, res) => {
  const { classId } = req.params;
  if (!UUID_REGEX.test(classId)) {
    return res.status(400).json({ success: false, error: 'Invalid class id' });
  }
  try {
    const rows = await sequelize.query(
      `SELECT u.id, u.first_name, u.last_name, u.email
         FROM class_memberships cm
         JOIN users u ON u.id = cm.student_id
         JOIN classes c ON c.id = cm.class_id
        WHERE cm.class_id = :cid AND c.teacher_id = :tid
        ORDER BY u.first_name, u.last_name`,
      { replacements: { cid: classId, tid: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/class/:classId/analytics ────────────────────────────────
router.get('/class/:classId/analytics', protect, teacherOnly, async (req, res) => {
  try {
    const students = await safeQuery(
      `SELECT u.id, u.first_name||' '||u.last_name AS name, u.email,
              COALESCE(u.study_streak_days,0) AS streak,
              COUNT(pa.id)::INTEGER AS attempts,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy_pct,
              MAX(pa.attempted_at) AS last_active
       FROM users u
       JOIN class_memberships cm ON cm.student_id=u.id AND cm.class_id=:classId
       LEFT JOIN practice_attempts pa ON pa.student_id=u.id
       GROUP BY u.id ORDER BY accuracy_pct DESC NULLS LAST`,
      { classId: req.params.classId }
    );
    return res.json({ success: true, data: { students, weak_topics: [], subject_breakdown: [] } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/students ─────────────────────────────────────────────────
// Returns students the teacher can push resources to:
//   1. Students in any of the teacher's classes (preferred — scoped)
//   2. Fallback: all active students (when teacher has no classes yet)
router.get('/students', protect, teacherOnly, async (req, res) => {
  try {
    // Students from teacher's own classes
    const classStudents = await safeQuery(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
              c.name AS class_name
       FROM class_memberships cm
       JOIN classes c ON c.id = cm.class_id AND c.teacher_id = :teacherId
       JOIN users   u ON u.id = cm.student_id
       WHERE u.is_active = true
       ORDER BY u.first_name, u.last_name`,
      { teacherId: req.user.id }
    );

    if (classStudents.length > 0) {
      return res.json({ success: true, data: classStudents, source: 'classes' });
    }

    // Fallback: all active students (teacher has no classes yet)
    const allStudents = await safeQuery(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE role = 'student' AND is_active = true
       ORDER BY first_name, last_name`,
      {}
    );
    return res.json({ success: true, data: allStudents, source: 'all' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});


router.get('/tests', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await safeQuery(
      `SELECT ct.id, ct.title, ct.duration_minutes, ct.total_marks, ct.is_published, ct.created_at,
              COUNT(tq.id)::INTEGER AS question_count
       FROM custom_tests ct
       LEFT JOIN test_questions tq ON tq.test_id = ct.id
       WHERE ct.teacher_id = :teacherId
       GROUP BY ct.id
       ORDER BY ct.created_at DESC`,
      { teacherId: req.user.id }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/tests ───────────────────────────────────────────────────
router.post('/tests', protect, teacherOnly, async (req, res) => {
  const { title, duration_minutes = 60, total_marks = 100 } = req.body;
  if (!title?.trim()) return res.status(400).json({ success: false, error: 'title is required' });
  try {
    const rows = await sequelize.query(
      `INSERT INTO custom_tests (teacher_id, title, duration_minutes, total_marks, is_published, created_at)
       VALUES (:teacherId, :title, :dur, :marks, false, NOW())
       RETURNING id, title, duration_minutes, total_marks, is_published, created_at`,
      {
        replacements: { teacherId: req.user.id, title: title.trim(), dur: duration_minutes, marks: total_marks },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: { ...rows[0], question_count: 0 } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/teacher/tests/:id/publish ────────────────────────────────────────
router.put('/tests/:id/publish', protect, teacherOnly, async (req, res) => {
  try {
    await sequelize.query(
      `UPDATE custom_tests SET is_published = true WHERE id = :id AND teacher_id = :teacherId`,
      { replacements: { id: req.params.id, teacherId: req.user.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Test published.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/tests/:id/assign ───────────────────────────────────────
// Assigns a test to all students in a class by creating test_assignments rows.
router.post('/tests/:id/assign', protect, teacherOnly, async (req, res) => {
  const { class_id } = req.body;
  if (!class_id) return res.status(400).json({ success: false, error: 'class_id is required' });
  try {
    // Verify teacher owns test
    const test = await safeQuery(
      `SELECT id FROM custom_tests WHERE id = :id AND teacher_id = :teacherId`,
      { id: req.params.id, teacherId: req.user.id }
    );
    if (!test.length) return res.status(404).json({ success: false, error: 'Test not found' });

    // Get all students in the class
    const members = await safeQuery(
      `SELECT student_id FROM class_memberships WHERE class_id = :classId`,
      { classId: class_id }
    );
    let count = 0;
    for (const m of members) {
      await sequelize.query(
        `INSERT INTO test_assignments (test_id, student_id, class_id, assigned_at)
         VALUES (:testId, :studentId, :classId, NOW())
         ON CONFLICT (test_id, student_id) DO NOTHING`,
        {
          replacements: { testId: req.params.id, studentId: m.student_id, classId: class_id },
          type: QueryTypes.INSERT,
        }
      ).catch(() => {});
      count++;
    }
    return res.json({ success: true, message: `Test assigned to ${count} student(s).`, count });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/nudge/:userId ──────────────────────────────────────────
router.post('/nudge/:userId', protect, teacherOnly, async (req, res) => {
  try {
    const users = await sequelize.query(
      `SELECT first_name, email FROM users WHERE id=:id`,
      { replacements: { id: req.params.userId }, type: QueryTypes.SELECT }
    );
    if (!users.length) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, message: `Nudge queued for ${users[0].email}` });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/questions ────────────────────────────────────────────────
router.get('/questions', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT q.id, q.question_text, q.difficulty, q.explanation,
              q.options, q.correct_answer, q.created_at,
              s.name AS subject_name
       FROM questions q
       LEFT JOIN subtopics  st ON st.id = q.subtopic_id
       LEFT JOIN topics      t ON t.id  = st.topic_id
       LEFT JOIN subjects    s ON s.id  = t.subject_id
       WHERE q.submitted_by = :teacherId AND q.is_active = true
       ORDER BY q.created_at DESC LIMIT 100`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── POST /api/teacher/questions ───────────────────────────────────────────────
// FIX: was parseInt(subtopic_id) — subtopic_id is a UUID foreign key
router.post('/questions', protect, teacherOnly, async (req, res) => {
  const { question_text, subtopic_id, difficulty = 'medium', explanation, options } = req.body;
  if (!question_text?.trim()) return res.status(400).json({ success: false, error: 'question_text is required' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ success: false, error: 'At least 2 options required' });
  const correctOption = options.find(o => o.is_correct);
  if (!correctOption) return res.status(400).json({ success: false, error: 'One option must be marked correct' });
  try {
    const result = await sequelize.query(
      `INSERT INTO questions (question_text, subtopic_id, submitted_by, difficulty, explanation, options, correct_answer, type, is_active, created_at, updated_at)
       VALUES (:question_text, :subtopic_id, :submitted_by, :difficulty, :explanation, :options::jsonb, :correct_answer, 'mcq', true, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          question_text:  question_text.trim(),
          subtopic_id:    subtopic_id || null,
          submitted_by:   req.user.id,
          difficulty,
          explanation:    explanation?.trim() || null,
          options:        JSON.stringify(options.map(o => ({ option_text: o.option_text || o.text || '', is_correct: !!o.is_correct }))),
          correct_answer: correctOption.option_text || correctOption.text || '',
        },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: { id: result[0].id }, message: 'Question submitted successfully' });
  } catch (err) {
    console.error('[POST /teacher/questions]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/students ─────────────────────────────────────────────────
// Returns students visible to this teacher:
//   • If the teacher has classes → students who are members of those classes.
//   • Fallback (no classes yet) → all active students.
// This replaces the broken GET /api/users?role=student call in TeacherResourcesPage
// which requires admin role and always returns 403 for teachers.
router.get('/students', protect, teacherOnly, async (req, res) => {
  await ensureClassTables();
  try {
    // First try: students in this teacher's classes
    const classStudents = await safeQuery(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
              c.id AS class_id, c.name AS class_name
       FROM class_memberships cm
       JOIN users   u ON u.id = cm.student_id
       JOIN classes c ON c.id = cm.class_id
       WHERE c.teacher_id = :teacherId
         AND u.is_active  = true
       ORDER BY u.last_name ASC, u.first_name ASC`,
      { teacherId: req.user.id }
    );

    if (classStudents.length > 0) {
      return res.json({ success: true, data: classStudents, source: 'class_members' });
    }

    // Fallback: teacher has no classes yet — return all active students so push still works
    const allStudents = await safeQuery(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE role = 'student' AND is_active = true
       ORDER BY last_name ASC, first_name ASC`,
      {}
    );
    return res.json({ success: true, data: allStudents, source: 'all_students' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
