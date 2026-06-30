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
const { requireTeacherClassOwnership } = require('../middleware/teacherScope');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const teacherOnly = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  next();
};

// Alias — same permissions as teacherOnly but used on routes where
// admin bypass of ownership checks is explicitly documented.
const teacherOrAdmin = teacherOnly;

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
    // No fallback to all-subjects — a teacher with no assignments
    // sees an empty list. The UI already handles this with a "No subjects assigned"
    // message and prompts the teacher to contact admin.
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/topics?subject_id=<uuid> ─────────────────────────────────
// FIX: was parseInt(subject_id) — subject_id is a UUID foreign key
router.get('/topics', protect, teacherOrAdmin, async (req, res) => {
  const { subject_id } = req.query;
  if (!subject_id) return res.status(400).json({ success: false, error: 'subject_id is required' });
  try {
    // Teachers: confirm assigned to this subject. Admins: skip ownership check.
    if (req.user.role === 'teacher') {
      const owned = await teacherOwnsSubject(req.user.id, subject_id);
      if (!owned) return res.status(403).json({ success: false, error: 'Not assigned to this subject' });
    }

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
    // Return the updated row so the frontend can update state without a refetch
    const updated = await sequelize.query(
      `SELECT id, name, description, order_index FROM topics WHERE id = :id LIMIT 1`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, message: 'Topic updated', data: updated[0] || null });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/topics/:id/delete-impact ────────────────────────────────
// C2 fix: read-only impact check so the UI can show a specific, accurate
// warning before a topic delete proceeds — "this topic has 4 subtopics and
// 12 students have recorded progress on them" instead of a generic static
// sentence that says the same thing regardless of what's actually at stake.
// Purely additive — no writes, no schema change.
router.get('/topics/:id/delete-impact', protect, teacherOnly, async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    const subtopics = await sequelize.query(
      `SELECT id, name FROM subtopics WHERE topic_id = :id AND is_active = true`,
      { replacements: { id: topicId }, type: QueryTypes.SELECT }
    );

    let studentsAffected = 0;
    if (subtopics.length > 0) {
      const subtopicIds = subtopics.map(s => s.id);
      const countRow = await sequelize.query(
        `SELECT COUNT(DISTINCT student_id)::INTEGER AS count
           FROM subtopic_progress
          WHERE subtopic_id = ANY(:ids)`,
        { replacements: { ids: subtopicIds }, type: QueryTypes.SELECT }
      ).catch(() => [{ count: 0 }]); // table/column drift shouldn't block the warning UI
      studentsAffected = countRow[0]?.count || 0;
    }

    return res.json({
      success: true,
      data: {
        subtopic_count:    subtopics.length,
        subtopic_names:    subtopics.map(s => s.name),
        students_affected: studentsAffected,
      },
    });
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
router.get('/subtopics', protect, teacherOrAdmin, async (req, res) => {
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
router.post('/subtopics', protect, teacherOrAdmin, async (req, res) => {
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
    // Return the updated row so the frontend can update state without a refetch
    const updated = await sequelize.query(
      `SELECT id, name, description, order_index FROM subtopics WHERE id = :id LIMIT 1`,
      { replacements: { id: parseInt(req.params.id) }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, message: 'Subtopic updated', data: updated[0] || null });
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


// NOTE: GET /students defined below after ensureClassTables — see secure implementation.



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
// Returns students for the class-creation picker, scoped to the requesting
// teacher's own subject coverage. Supports an optional ?q= search across
// name + email so large rosters stay manageable.
//
// SECURITY FIX (R2): this previously had no teacher scope at all --
// `WHERE role = 'student' AND is_active = true` with no teacher_id filter --
// returning up to 500 students from across the ENTIRE platform to any
// teacher with a valid JWT, regardless of any connection to those students.
// Confirmed directly against the live route before fixing, not assumed from
// a prior description.
//
// Cannot scope this to "students already in one of my classes" (the pattern
// used by GET /teacher/students below) -- this endpoint specifically backs
// the class-CREATION search-to-add picker, where finding students who are
// NOT YET in any of the teacher's classes is the entire point. That scope
// would break the feature outright.
//
// Scoped instead to "students enrolled in any subject this teacher is
// assigned to" via teacher_subjects -- a real, bounded boundary (every
// other teacher's unrelated students are still excluded) that preserves the
// legitimate "search my subject's students to add to a new class" workflow.
// Matches the existing teacher_subjects + student_subjects join pattern
// already established in GET /teacher/students (T4 fix) in this same file.
router.get('/students-directory', protect, teacherOnly, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const replacements = { teacherId: req.user.id };
  let searchClause = '';
  if (q) {
    searchClause = `AND (
      LOWER(u.first_name) LIKE :q OR
      LOWER(u.last_name)  LIKE :q OR
      LOWER(u.email)      LIKE :q OR
      LOWER(u.first_name || ' ' || u.last_name) LIKE :q
    )`;
    replacements.q = `%${q.toLowerCase()}%`;
  }
  try {
    const rows = await safeQuery(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
         FROM teacher_subjects ts
         JOIN student_subjects ss ON ss.subject_id = ts.subject_id
         JOIN users u ON u.id = ss.student_id
        WHERE ts.teacher_id = :teacherId
          AND ts.is_active  = true
          AND ss.is_active  = true
          AND u.is_active   = true
          AND u.role        = 'student'
          ${searchClause}
        ORDER BY u.first_name, u.last_name
        LIMIT 500`,
      replacements
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
router.get('/class/:classId/members', protect, teacherOnly, requireTeacherClassOwnership, async (req, res) => {
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

// ── PATCH /api/teacher/classes/:id ───────────────────────────────────────────
// Rename a class. Only the owning teacher can rename it.
router.patch('/classes/:id', protect, teacherOnly, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Class name is required' });
  }
  try {
    const rows = await sequelize.query(
      `UPDATE classes SET name = :name WHERE id = :id AND teacher_id = :teacherId RETURNING id, name`,
      { replacements: { name: name.trim(), id, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Class not found' });
    return res.json({ success: true, class: rows[0] });
  } catch (err) {
    console.error('[PATCH /teacher/classes/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/teacher/classes/:id ──────────────────────────────────────────
// Delete a class. Memberships cascade automatically (ON DELETE CASCADE).
// test_assignments rows referencing this class also cascade.
// Only the owning teacher can delete their class.
router.delete('/classes/:id', protect, teacherOnly, async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await sequelize.query(
      `DELETE FROM classes WHERE id = :id AND teacher_id = :teacherId RETURNING id`,
      { replacements: { id, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Class not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /teacher/classes/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/class/:classId/analytics ────────────────────────────────
router.get('/class/:classId/analytics', protect, teacherOnly, requireTeacherClassOwnership, async (req, res) => {
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
       WHERE u.role = 'student'
       GROUP BY u.id ORDER BY accuracy_pct DESC NULLS LAST`,
      { classId: req.params.classId }
    );
    return res.json({ success: true, data: { students, weak_topics: [], subject_breakdown: [] } });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ── GET /api/teacher/students ─────────────────────────────────────────────────
// Returns students the teacher can push resources to:
// (insecure duplicate removed — see secure /students definition below)




// ── GET /api/teacher/students ─────────────────────────────────────────────────
// Returns students visible to this teacher via their assigned classes.
// SECURITY: No fallback to all-students. A teacher with no classes sees an
// empty list — not the full user roster. Admins manage class assignments.
router.get('/students', protect, teacherOnly, async (req, res) => {
  await ensureClassTables();
  try {
    // Path 1: students in classes this teacher owns
    const classStudents = await safeQuery(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
              c.id AS class_id, c.name AS class_name, 'class' AS source
       FROM class_memberships cm
       JOIN users   u ON u.id = cm.student_id
       JOIN classes c ON c.id = cm.class_id
       WHERE c.teacher_id = :teacherId
         AND u.is_active  = true
         AND u.role       = 'student'`,
      { teacherId: req.user.id }
    );

    // T4: Path 2: students enrolled in subjects this teacher is assigned to
    // (teachers with direct subject assignments but no formal class still see their students)
    // BUG FIX: this query had no role filter on `u` — any non-student account
    // (admin, teacher, or any user) with a stray row in student_subjects
    // (test data, a role change after enrolling, manual DB edits, etc.)
    // would show up in a teacher's class list as if they were a student.
    // Confirmed live: "Platform Admin" appeared as a student here. The
    // student_subjects table itself has no role constraint — it's keyed
    // purely by user id — so this must be enforced at every read site,
    // not assumed from how the row was created.
    const subjectStudents = await safeQuery(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email,
              NULL AS class_id, NULL AS class_name, 'subject' AS source
       FROM teacher_subjects ts
       JOIN student_subjects ss ON ss.subject_id = ts.subject_id
       JOIN users u ON u.id = ss.student_id
       WHERE ts.teacher_id = :teacherId
         AND ss.is_active  = true
         AND u.is_active   = true
         AND u.role        = 'student'`,
      { teacherId: req.user.id }
    );

    // Merge and deduplicate by id — class entry wins if same student appears in both
    const seen = new Map();
    for (const s of [...classStudents, ...subjectStudents]) {
      if (!seen.has(s.id)) seen.set(s.id, s);
    }
    const combined = [...seen.values()].sort((a, b) =>
      (a.last_name || '').localeCompare(b.last_name || '') ||
      (a.first_name || '').localeCompare(b.first_name || '')
    );

    return res.json({ success: true, data: combined, source: 'merged' });
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

// ── PATCH /api/teacher/tests/:id — edit title / duration / total_marks ────────
// D3: teachers can edit a test after creation.
// Both draft and published tests can be renamed; marks/duration can only be
// changed while the test is still a draft (once live, changing marks would
// invalidate student attempts already stored against the old value).
router.patch('/tests/:id', protect, teacherOnly, async (req, res) => {
  const { title, duration_minutes, total_marks } = req.body;

  if (title !== undefined && !String(title).trim()) {
    return res.status(400).json({ success: false, error: 'Title cannot be blank' });
  }

  try {
    // Confirm the teacher owns this test and get current published state
    const rows = await safeQuery(
      `SELECT id, is_published FROM custom_tests WHERE id = :id AND teacher_id = :teacherId`,
      { id: req.params.id, teacherId: req.user.id }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Test not found' });

    const isPublished = rows[0].is_published;

    // Build SET clause from whichever fields were supplied
    const sets = [];
    const replacements = { id: req.params.id, teacherId: req.user.id };

    if (title !== undefined) {
      sets.push('title = :title');
      replacements.title = String(title).trim();
    }
    if (duration_minutes !== undefined) {
      if (isPublished) return res.status(400).json({ success: false, error: 'Duration cannot be changed after publishing' });
      sets.push('duration_minutes = :duration_minutes');
      replacements.duration_minutes = Math.max(1, parseInt(duration_minutes) || 60);
    }
    if (total_marks !== undefined) {
      if (isPublished) return res.status(400).json({ success: false, error: 'Total marks cannot be changed after publishing' });
      sets.push('total_marks = :total_marks');
      replacements.total_marks = Math.max(1, parseInt(total_marks) || 100);
    }

    if (sets.length === 0) return res.status(400).json({ success: false, error: 'Nothing to update' });
    sets.push('updated_at = NOW()');

    await sequelize.query(
      `UPDATE custom_tests SET ${sets.join(', ')} WHERE id = :id AND teacher_id = :teacherId`,
      { replacements, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, message: 'Test updated.' });
  } catch (err) {
    console.error('[PATCH /teacher/tests/:id]', err.message);
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
// Assigns a test to a class OR individual students (D4: individual support added).
// Body: { class_id: UUID } — assigns all members of a class
//    OR { student_ids: UUID[] } — assigns specific individual students
router.post('/tests/:id/assign', protect, teacherOnly, async (req, res) => {
  const { class_id, student_ids } = req.body;
  if (!class_id && (!Array.isArray(student_ids) || student_ids.length === 0)) {
    return res.status(400).json({ success: false, error: 'class_id or student_ids is required' });
  }
  try {
    const test = await safeQuery(
      `SELECT id FROM custom_tests WHERE id = :id AND teacher_id = :teacherId`,
      { id: req.params.id, teacherId: req.user.id }
    );
    if (!test.length) return res.status(404).json({ success: false, error: 'Test not found' });

    let targets = [];
    if (class_id) {
      const members = await safeQuery(
        `SELECT student_id FROM class_memberships WHERE class_id = :classId`,
        { classId: class_id }
      );
      targets = members.map(m => ({ studentId: m.student_id, classId: class_id }));
    } else {
      const cleanIds = student_ids.filter(id => typeof id === 'string' && id.length > 10);
      targets = cleanIds.map(id => ({ studentId: id, classId: null }));
    }

    let count = 0;
    for (const { studentId, classId } of targets) {
      await sequelize.query(
        `INSERT INTO test_assignments (test_id, student_id, class_id, assigned_at)
         VALUES (:testId, :studentId, :classId, NOW())
         ON CONFLICT (test_id, student_id) DO NOTHING`,
        {
          replacements: { testId: req.params.id, studentId, classId: classId || null },
          type: QueryTypes.INSERT,
        }
      ).catch(() => {});
      count++;
    }
    return res.json({ success: true, message: `Test assigned to ${count} student${count !== 1 ? 's' : ''}.`, count });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/tests/:id/questions ─────────────────────────────────────
// Attaches one or more existing questions (from the teacher's own question
// bank, server/routes -> GET /api/teacher/questions) to a custom test by
// inserting rows into test_questions. This is the missing link that left
// students unable to see any questions on a pushed/assigned test — tests
// could be created, published, and assigned to a class, but no endpoint
// ever wrote to test_questions, so GET /api/students/test/:testId always
// returned an empty questions array.
// Body: { question_ids: [1,2,3] }  — order in the array becomes question_order
router.post('/tests/:id/questions', protect, teacherOnly, async (req, res) => {
  const { id: testId } = req.params;
  const { question_ids } = req.body;

  if (!Array.isArray(question_ids) || question_ids.length === 0) {
    return res.status(400).json({ success: false, error: 'question_ids array is required' });
  }

  try {
    // Verify the teacher owns this test (admins can attach to any test)
    const test = await safeQuery(
      `SELECT id FROM custom_tests WHERE id = :id AND (teacher_id = :teacherId OR :isAdmin)`,
      { id: testId, teacherId: req.user.id, isAdmin: req.user.role === 'admin' }
    );
    if (!test.length) return res.status(404).json({ success: false, error: 'Test not found' });

    // Only allow attaching questions the teacher actually owns/submitted
    // (or any question, for admins)
    const validQuestions = await safeQuery(
      `SELECT id, marks FROM questions
        WHERE id = ANY(:ids) AND is_active = true AND (submitted_by = :teacherId OR :isAdmin)`,
      { ids: question_ids, teacherId: req.user.id, isAdmin: req.user.role === 'admin' }
    );
    if (!validQuestions.length) {
      return res.status(404).json({ success: false, error: 'No matching questions found for this teacher' });
    }

    // Find current max question_order so newly attached questions append at the end
    const orderRows = await safeQuery(
      `SELECT COALESCE(MAX(question_order), -1) AS max_order FROM test_questions WHERE test_id = :testId`,
      { testId }
    );
    let nextOrder = (orderRows[0]?.max_order ?? -1) + 1;

    let attached = 0;
    const skipped = [];
    for (const q of validQuestions) {
      try {
        await sequelize.query(
          `INSERT INTO test_questions (test_id, question_id, question_order, marks_allocated)
           VALUES (:testId, :questionId, :order, :marks)
           ON CONFLICT (test_id, question_id) DO NOTHING`,
          {
            replacements: {
              testId,
              questionId: q.id,
              order: nextOrder,
              marks: q.marks || 1,
            },
            type: QueryTypes.INSERT,
          }
        );
        nextOrder++;
        attached++;
      } catch (e) {
        skipped.push({ question_id: q.id, error: e.message });
      }
    }

    // Keep total_marks on the test in sync with what's actually attached
    await sequelize.query(
      `UPDATE custom_tests
          SET total_marks = (SELECT COALESCE(SUM(marks_allocated), 0) FROM test_questions WHERE test_id = :testId),
              updated_at = NOW()
        WHERE id = :testId`,
      { replacements: { testId }, type: QueryTypes.UPDATE }
    );

    return res.status(201).json({
      success: true,
      message: `${attached} question(s) attached to test.`,
      attached,
      skipped,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/teacher/tests/:id/questions/:questionId ───────────────────────
// Removes a single question from a test.
router.delete('/tests/:id/questions/:questionId', protect, teacherOnly, async (req, res) => {
  const { id: testId, questionId } = req.params;
  try {
    const test = await safeQuery(
      `SELECT id FROM custom_tests WHERE id = :id AND (teacher_id = :teacherId OR :isAdmin)`,
      { id: testId, teacherId: req.user.id, isAdmin: req.user.role === 'admin' }
    );
    if (!test.length) return res.status(404).json({ success: false, error: 'Test not found' });

    await sequelize.query(
      `DELETE FROM test_questions WHERE test_id = :testId AND question_id = :questionId`,
      { replacements: { testId, questionId }, type: QueryTypes.DELETE }
    );

    await sequelize.query(
      `UPDATE custom_tests
          SET total_marks = (SELECT COALESCE(SUM(marks_allocated), 0) FROM test_questions WHERE test_id = :testId),
              updated_at = NOW()
        WHERE id = :testId`,
      { replacements: { testId }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true, message: 'Question removed from test.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/teacher/tests/:id/questions ───────────────────────────────────────
// Returns the questions currently attached to a test, in order — used to
// populate the Test Builder UI so a teacher can see/edit what a student
// will actually receive.
router.get('/tests/:id/questions', protect, teacherOnly, async (req, res) => {
  const { id: testId } = req.params;
  try {
    const test = await safeQuery(
      `SELECT id FROM custom_tests WHERE id = :id AND (teacher_id = :teacherId OR :isAdmin)`,
      { id: testId, teacherId: req.user.id, isAdmin: req.user.role === 'admin' }
    );
    if (!test.length) return res.status(404).json({ success: false, error: 'Test not found' });

    const rows = await safeQuery(
      `SELECT q.id, q.question_text, q.difficulty, q.options,
              tq.question_order, tq.marks_allocated
         FROM test_questions tq
         JOIN questions q ON q.id = tq.question_id
        WHERE tq.test_id = :testId
        ORDER BY tq.question_order ASC`,
      { testId }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/teacher/tests/:id ────────────────────────────────────────────
// Deletes a draft test owned by this teacher.
// SAFETY: published tests are blocked — deleting a live test would break
//         any student currently taking it and orphan their submissions.
router.delete('/tests/:id', protect, teacherOnly, async (req, res) => {
  const { id: testId } = req.params;
  try {
    // Ownership + publish-state check in one query
    const [test] = await sequelize.query(
      `SELECT id, is_published FROM custom_tests
       WHERE id = :testId AND teacher_id = :teacherId
       LIMIT 1`,
      { replacements: { testId, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!test)           return res.status(404).json({ success: false, error: 'Test not found' });
    if (test.is_published) return res.status(400).json({ success: false, error: 'Cannot delete a published test. Unpublish it first.' });

    // Cascade: remove attached questions and assignments, then the test itself
    await sequelize.query(`DELETE FROM test_questions   WHERE test_id = :testId`, { replacements: { testId }, type: QueryTypes.DELETE });
    await sequelize.query(`DELETE FROM test_assignments WHERE test_id = :testId`, { replacements: { testId }, type: QueryTypes.DELETE });
    await sequelize.query(`DELETE FROM custom_tests     WHERE id = :testId`,      { replacements: { testId }, type: QueryTypes.DELETE });

    return res.json({ success: true, message: 'Test deleted.' });
  } catch (err) {
    console.error('[DELETE /teacher/tests/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/teacher/nudge/:userId ──────────────────────────────────────────
router.post('/nudge/:userId', protect, teacherOnly, async (req, res) => {
  try {
    const users = await sequelize.query(
      `SELECT id, first_name, email FROM users WHERE id=:id AND is_active = true AND role = 'student'`,
      { replacements: { id: req.params.userId }, type: QueryTypes.SELECT }
    );
    if (!users.length) return res.status(404).json({ success: false, error: 'User not found' });
    const student = users[0];

    // A7 fix: verify this student is actually scoped to the requesting
    // teacher before sending anything — previously absent, meaning any
    // teacher could nudge any student by ID. Checks both class membership
    // and direct subject assignment, since GET /teacher/students above is
    // class-only and would otherwise miss teachers scoped via
    // teacher_subjects (the same gap T4/X4 describe for the student list).
    const entitled = await sequelize.query(
      `SELECT 1
         FROM class_memberships cm
         JOIN classes c ON c.id = cm.class_id
        WHERE c.teacher_id = :teacherId AND cm.student_id = :studentId
        UNION
       SELECT 1
         FROM student_subjects ss
         JOIN teacher_subjects ts ON ts.subject_id = ss.subject_id
        WHERE ts.teacher_id = :teacherId AND ss.student_id = :studentId AND ss.is_active = true
        LIMIT 1`,
      { replacements: { teacherId: req.user.id, studentId: student.id }, type: QueryTypes.SELECT }
    ).catch(() => []);

    if (!entitled.length) {
      return res.status(403).json({ success: false, error: 'This student is not in one of your classes or subjects' });
    }

    // A7 fix: actually create the nudge instead of only returning a string
    // claiming one was "queued". In-app notification row + best-effort email.
    await sequelize.query(
      `INSERT INTO notifications (user_id, title, message, type, created_at)
       VALUES (:uid, 'Study Reminder', 'Your teacher wants you to keep up your study streak — jump back in!', 'nudge', NOW())`,
      { replacements: { uid: student.id }, type: QueryTypes.INSERT }
    );

    let emailSent = false;
    if (student.email) {
      try {
        const { send: sendEmail } = require('../services/emailService');
        // Not reusing sendStreakNudge(): its template hard-codes "You
        // haven't practised in {daysSince} days", which only makes sense
        // for the automatic inactivity-based nudge it was built for. A
        // manual teacher-initiated nudge has no actual day count behind
        // it — forcing one through that template would literally render
        // "null days" (or a made-up number) in a real email. Using the
        // underlying send() directly with honest, generic copy instead.
        const name = student.first_name || 'there';
        await sendEmail(
          student.email,
          'A study reminder from your teacher',
          `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;text-align:center">
             <h1 style="color:#0a4a3f;font-size:20px">Hi ${name}, your teacher sent you a reminder!</h1>
             <p style="color:#555;line-height:1.6">
               Your teacher wanted to nudge you to keep up your study streak on AISchoolOnair. Jump back in when you get a chance!
             </p>
           </div>`
        );
        emailSent = true;
      } catch (emailErr) {
        // Email is best-effort — the in-app notification above already
        // succeeded, so a missing/misconfigured email service shouldn't
        // make this endpoint report failure. send() also already swallows
        // its own errors when email isn't configured, so this catch mainly
        // covers an unexpected throw elsewhere.
        console.warn('[nudge] email send failed:', emailErr.message);
      }
    }

    return res.json({ success: true, delivered: true, email_sent: emailSent, message: `Study reminder sent to ${student.email}` });
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
//
// BUG FIX: subtopic_id is now REQUIRED, not optional. The `questions` table
// has no direct subject_id column — the only path from a question to a
// subject/exam-board is question -> subtopic -> topic -> subject. A question
// inserted with subtopic_id = null is a true orphan: GET /questions/random
// (questionsRoutes.js) scopes by board/subject via that exact join chain, so
// an orphaned question silently never reaches any student, with no error
// anywhere — it just vanishes. TeacherAddQuestionPage.jsx already enforces
// "select a subtopic" client-side; TeacherResourcesPage.jsx's QuestionsTab
// did not (its subtopic field was explicitly labeled "optional"), and that
// form also sends subject_id directly in the POST body, which this route
// has never read at all — there is no subject-level fallback linkage,
// subtopic_id is the only link that exists. Enforcing it here, in the one
// route both forms call, fixes both UIs and any future caller at once,
// instead of patching each form's client-side validation separately and
// hoping nothing else ever skips it.
router.post('/questions', protect, teacherOnly, async (req, res) => {
  const { question_text, subtopic_id, difficulty = 'medium', explanation, options } = req.body;
  if (!question_text?.trim()) return res.status(400).json({ success: false, error: 'question_text is required' });
  // Matches the minimum-length standard already enforced on POST /api/questions/submit
  // (the ContributeQuestion route) — previously this route only checked for a
  // non-empty string, so a single-character question_text (or anything under
  // a genuinely usable length) passed straight through to an immediate
  // status='approved' insert with no review step at all.
  if (question_text.trim().length < 10) return res.status(400).json({ success: false, error: 'Question text must be at least 10 characters' });
  if (!subtopic_id) return res.status(400).json({ success: false, error: 'Please select a subtopic — questions without one never reach students.' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ success: false, error: 'At least 2 options required' });
  const correctOption = options.find(o => o.is_correct);
  if (!correctOption) return res.status(400).json({ success: false, error: 'One option must be marked correct' });
  try {
    // Manually authored by a teacher — does NOT go through the AI Question
    // Review Queue. Per platform policy, teacher-written questions are
    // available to enrolled students immediately. status is set explicitly
    // here (rather than left NULL) so availability is a deliberate, visible
    // decision in the data rather than an artifact of a COALESCE default
    // elsewhere in the codebase.
    const result = await sequelize.query(
      `INSERT INTO questions (question_text, subtopic_id, submitted_by, difficulty, explanation, options, correct_answer, type, is_active, is_ai_generated, status, created_at, updated_at)
       VALUES (:question_text, :subtopic_id, :submitted_by, :difficulty, :explanation, :options::jsonb, :correct_answer, 'mcq', true, false, 'approved', NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          question_text:  question_text.trim(),
          subtopic_id,
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
module.exports = router;
