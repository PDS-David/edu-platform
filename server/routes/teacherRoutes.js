'use strict';

const express        = require('express');
const router         = express.Router();
const crypto         = require('crypto');
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(v); }

const teacherOnly = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  next();
};

// ============================================================================
// GET /api/teacher/my-subjects
// Returns all subjects + exam board info assigned to the logged-in teacher.
// Used by TeacherDashboard to determine whether to show the "Awaiting
// subject assignment" banner or the green "Subjects assigned" banner.
// ============================================================================
router.get('/my-subjects', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         s.id,
         s.name,
         s.code,
         s.level,
         s.description,
         eb.id   AS exam_board_id,
         eb.code AS exam_board_code,
         eb.name AS exam_board_name,
         eb.icon_emoji
       FROM teacher_subjects ts
       JOIN subjects    s  ON ts.subject_id    = s.id
       LEFT JOIN exam_boards eb ON ts.exam_board_id = eb.id
       WHERE ts.teacher_id = :teacherId
         AND ts.is_active  = true
         AND s.is_active   = true
       ORDER BY eb.display_order NULLS LAST, s.name ASC`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /teacher/my-subjects]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch assigned subjects' });
  }
});

// ============================================================================
// EXISTING ROUTES (unchanged)
// ============================================================================

// GET /api/teacher/classes
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

// POST /api/teacher/classes
router.post('/classes', protect, teacherOnly, async (req, res) => {
  const { name, subject_ids = [] } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  const joinCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  try {
    const result = await sequelize.query(
      `INSERT INTO classes (id, teacher_id, name, join_code, subject_ids, created_at)
       VALUES (gen_random_uuid(), :teacherId, :name, :joinCode, :subjectIds::jsonb, NOW())
       RETURNING id, name, join_code`,
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

// POST /api/teacher/class/:classId/invite
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

// GET /api/teacher/class/:classId/analytics
router.get('/class/:classId/analytics', protect, teacherOnly, async (req, res) => {
  const { classId } = req.params;
  try {
    const cls = await sequelize.query(
      `SELECT id FROM classes WHERE id = :classId AND teacher_id = :teacherId`,
      { replacements: { classId, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!cls.length) return res.status(403).json({ success: false, error: 'Class not found' });

    const [weakTopics, students, subBreakdown] = await Promise.all([
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
      sequelize.query(
        `SELECT u.id,
                u.first_name || ' ' || u.last_name AS name,
                u.email,
                COALESCE(u.study_streak_days, 0)   AS streak,
                COUNT(pa.id)::INTEGER               AS attempts,
                ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS accuracy_pct,
                MAX(pa.attempted_at)                AS last_active
         FROM users u
         JOIN class_memberships cm ON cm.student_id = u.id AND cm.class_id = :classId
         LEFT JOIN practice_attempts pa ON pa.student_id = u.id
         GROUP BY u.id
         ORDER BY accuracy_pct DESC NULLS LAST`,
        { replacements: { classId }, type: QueryTypes.SELECT }
      ),
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
        weak_topics:       weakTopics,
        students:          studentsTagged,
        inactive_students: studentsTagged.filter(s => s.days_since_active !== null && s.days_since_active > 7),
        subject_breakdown: subBreakdown,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teacher/tests
router.get('/tests', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT ct.id, ct.title, ct.duration_minutes, ct.total_marks,
              ct.is_published, ct.created_at,
              COUNT(tq.id)::INTEGER AS question_count,
              (SELECT COUNT(*)::INTEGER FROM test_assignments ta WHERE ta.test_id = ct.id) AS submissions
       FROM custom_tests ct
       LEFT JOIN test_questions tq ON tq.test_id = ct.id
       WHERE ct.teacher_id = :teacherId
       GROUP BY ct.id
       ORDER BY ct.created_at DESC`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/teacher/tests
router.post('/tests', protect, teacherOnly, async (req, res) => {
  const {
    title,
    class_id           = null,
    subject_id         = null,
    difficulty         = 'mixed',
    question_count     = 10,
    time_limit_minutes = 30,
    due_date           = null,
  } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  const qCount = Math.min(Math.max(parseInt(question_count) || 10, 5), 40);

  try {
    const diffFilter = difficulty !== 'mixed' ? 'AND q.difficulty = :difficulty' : '';
    const subjFilter = subject_id ? 'AND q.subject_id_uuid = :subject_id' : '';
    const questions  = await sequelize.query(
      `SELECT q.id
       FROM questions q
       WHERE q.status = 'approved'
         AND q.question_sub_type = 'mcq'
         ${diffFilter}
         ${subjFilter}
       ORDER BY RANDOM()
       LIMIT :qCount`,
      {
        replacements: {
          qCount,
          ...(difficulty !== 'mixed' ? { difficulty } : {}),
          ...(subject_id ? { subject_id } : {}),
        },
        type: QueryTypes.SELECT,
      }
    );

    if (questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No approved questions found matching these criteria. Try a different subject or difficulty.',
      });
    }

    const testResult = await sequelize.query(
      `INSERT INTO custom_tests
         (id, teacher_id, subject_id, title, duration_minutes, total_marks,
          passing_marks, is_published, created_at, updated_at)
       VALUES
         (gen_random_uuid(), :teacherId, :subjectId, :title, :timeLimitMinutes,
          :totalMarks, :passingMarks, true, NOW(), NOW())
       RETURNING id, title`,
      {
        replacements: {
          teacherId:         req.user.id,
          subjectId:         subject_id || null,
          title:             title.trim(),
          timeLimitMinutes:  parseInt(time_limit_minutes) || 30,
          totalMarks:        questions.length,
          passingMarks:      Math.round(questions.length * 0.5),
        },
        type: QueryTypes.INSERT,
      }
    );
    const test = testResult[0][0];

    for (let i = 0; i < questions.length; i++) {
      await sequelize.query(
        `INSERT INTO test_questions (id, test_id, question_id, question_order, marks_allocated)
         VALUES (gen_random_uuid(), :testId, :questionId, :order, 1)`,
        {
          replacements: { testId: test.id, questionId: questions[i].id, order: i + 1 },
          type: QueryTypes.INSERT,
        }
      );
    }

    if (class_id) {
      const members = await sequelize.query(
        `SELECT student_id FROM class_memberships WHERE class_id = :class_id`,
        { replacements: { class_id }, type: QueryTypes.SELECT }
      );
      for (const m of members) {
        await sequelize.query(
          `INSERT INTO test_assignments (id, test_id, student_id, due_date, assigned_at)
           VALUES (gen_random_uuid(), :testId, :studentId, :dueDate, NOW())
           ON CONFLICT (test_id, student_id) DO NOTHING`,
          {
            replacements: { testId: test.id, studentId: m.student_id, dueDate: due_date || null },
            type: QueryTypes.INSERT,
          }
        );
      }
    }

    return res.status(201).json({
      success: true,
      data: {
        id:                test.id,
        title:             test.title,
        question_count:    questions.length,
        time_limit_minutes: parseInt(time_limit_minutes) || 30,
        due_date,
      },
    });
  } catch (err) {
    console.error('[POST /teacher/tests]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/teacher/nudge/:userId
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

// ============================================================================
// CONCEPT MANAGEMENT (Task 5)
// ============================================================================

router.post('/concepts', protect, teacherOnly, async (req, res) => {
  const {
    subtopic_id,
    name,
    description       = null,
    difficulty_level  = 1,
    estimated_minutes = 10,
    order_index       = 0,
    prerequisite_ids  = [],
  } = req.body;

  if (!subtopic_id || !isValidUUID(subtopic_id))
    return res.status(400).json({ success: false, error: 'subtopic_id is required and must be a valid UUID' });
  if (!name || !name.trim())
    return res.status(400).json({ success: false, error: 'name is required' });

  const diffLevel = Math.min(Math.max(parseInt(difficulty_level) || 1, 1), 5);

  try {
    const subtopicRows = await sequelize.query(
      `SELECT id FROM subtopics WHERE id = :subtopicId`,
      { replacements: { subtopicId: subtopic_id }, type: QueryTypes.SELECT }
    );
    if (!subtopicRows.length)
      return res.status(404).json({ success: false, error: 'Subtopic not found' });

    const conceptRows = await sequelize.query(
      `INSERT INTO concepts
         (id, subtopic_id, name, description, difficulty_level,
          estimated_minutes, order_index, created_at, updated_at)
       VALUES
         (gen_random_uuid(), :subtopicId, :name, :description, :difficultyLevel,
          :estimatedMinutes, :orderIndex, NOW(), NOW())
       RETURNING id, subtopic_id, name, description, difficulty_level,
                 estimated_minutes, order_index, created_at`,
      {
        replacements: {
          subtopicId:       subtopic_id,
          name:             name.trim(),
          description,
          difficultyLevel:  diffLevel,
          estimatedMinutes: parseInt(estimated_minutes) || 10,
          orderIndex:       parseInt(order_index) || 0,
        },
        type: QueryTypes.SELECT,
      }
    );

    const concept      = conceptRows[0];
    const savedPrereqs = [];

    if (Array.isArray(prerequisite_ids) && prerequisite_ids.length > 0) {
      for (const parentId of prerequisite_ids) {
        if (!isValidUUID(parentId) || parentId === concept.id) continue;
        try {
          await sequelize.query(
            `INSERT INTO concept_dependencies
               (id, parent_concept_id, child_concept_id, dependency_type, created_at)
             VALUES (gen_random_uuid(), :parentId, :childId, 'prerequisite', NOW())
             ON CONFLICT (parent_concept_id, child_concept_id) DO NOTHING`,
            { replacements: { parentId, childId: concept.id }, type: QueryTypes.INSERT }
          );
          savedPrereqs.push(parentId);
        } catch (depErr) {
          console.warn(`[POST /teacher/concepts] Dependency insert failed (${parentId}):`, depErr.message);
        }
      }
    }

    return res.status(201).json({ success: true, data: { ...concept, prerequisite_ids: savedPrereqs } });
  } catch (err) {
    console.error('[POST /teacher/concepts]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/concepts/:subtopicId', protect, teacherOnly, async (req, res) => {
  const { subtopicId } = req.params;
  if (!isValidUUID(subtopicId))
    return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });

  try {
    const concepts = await sequelize.query(
      `SELECT id, name, description, difficulty_level, estimated_minutes, order_index, created_at, updated_at
       FROM concepts WHERE subtopic_id = :subtopicId
       ORDER BY order_index ASC, name ASC`,
      { replacements: { subtopicId }, type: QueryTypes.SELECT }
    );

    if (!concepts.length) return res.status(200).json({ success: true, count: 0, data: [] });

    const conceptIds = concepts.map(c => c.id);
    const depRows    = await sequelize.query(
      `SELECT parent_concept_id, child_concept_id FROM concept_dependencies
       WHERE child_concept_id = ANY(:conceptIds)`,
      { replacements: { conceptIds }, type: QueryTypes.SELECT }
    );

    const prereqMap = depRows.reduce((acc, row) => {
      if (!acc[row.child_concept_id]) acc[row.child_concept_id] = [];
      acc[row.child_concept_id].push(row.parent_concept_id);
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      count:   concepts.length,
      data:    concepts.map(c => ({ ...c, prerequisite_ids: prereqMap[c.id] || [] })),
    });
  } catch (err) {
    console.error('[GET /teacher/concepts/:subtopicId]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/concepts/:id', protect, teacherOnly, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid concept ID' });

  const { name, description, difficulty_level, estimated_minutes, order_index, prerequisite_ids } = req.body;

  try {
    const existing = await sequelize.query(
      `SELECT id FROM concepts WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!existing.length) return res.status(404).json({ success: false, error: 'Concept not found' });

    const setClauses   = ['updated_at = NOW()'];
    const replacements = { id };

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, error: 'name cannot be empty' });
      setClauses.push('name = :name');
      replacements.name = name.trim();
    }
    if (description !== undefined)      { setClauses.push('description = :description');           replacements.description      = description; }
    if (difficulty_level !== undefined) { setClauses.push('difficulty_level = :difficultyLevel'); replacements.difficultyLevel  = Math.min(Math.max(parseInt(difficulty_level) || 1, 1), 5); }
    if (estimated_minutes !== undefined){ setClauses.push('estimated_minutes = :estimatedMinutes');replacements.estimatedMinutes = parseInt(estimated_minutes) || 10; }
    if (order_index !== undefined)      { setClauses.push('order_index = :orderIndex');            replacements.orderIndex       = parseInt(order_index) || 0; }

    const updatedRows = await sequelize.query(
      `UPDATE concepts SET ${setClauses.join(', ')} WHERE id = :id
       RETURNING id, subtopic_id, name, description, difficulty_level, estimated_minutes, order_index, updated_at`,
      { replacements, type: QueryTypes.SELECT }
    );

    let finalPrereqs = null;
    if (Array.isArray(prerequisite_ids)) {
      await sequelize.query(
        `DELETE FROM concept_dependencies WHERE child_concept_id = :id`,
        { replacements: { id }, type: QueryTypes.DELETE }
      );
      finalPrereqs = [];
      for (const parentId of prerequisite_ids) {
        if (!isValidUUID(parentId) || parentId === id) continue;
        try {
          await sequelize.query(
            `INSERT INTO concept_dependencies
               (id, parent_concept_id, child_concept_id, dependency_type, created_at)
             VALUES (gen_random_uuid(), :parentId, :childId, 'prerequisite', NOW())
             ON CONFLICT (parent_concept_id, child_concept_id) DO NOTHING`,
            { replacements: { parentId, childId: id }, type: QueryTypes.INSERT }
          );
          finalPrereqs.push(parentId);
        } catch (depErr) {
          console.warn(`[PUT /teacher/concepts/:id] Dependency insert failed (${parentId}):`, depErr.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: { ...updatedRows[0], ...(finalPrereqs !== null ? { prerequisite_ids: finalPrereqs } : {}) },
    });
  } catch (err) {
    console.error('[PUT /teacher/concepts/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/concepts/:id', protect, teacherOnly, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid concept ID' });

  try {
    const rows = await sequelize.query(
      `SELECT id, name FROM concepts WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Concept not found' });

    await sequelize.query(
      `DELETE FROM concepts WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.DELETE }
    );
    return res.status(200).json({ success: true, message: `Concept "${rows[0].name}" deleted successfully` });
  } catch (err) {
    console.error('[DELETE /teacher/concepts/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
