'use strict';

const express        = require('express');
const router         = express.Router();
const crypto         = require('crypto');
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(v); }

const tableExists = async (tableName) => {
  try {
    await sequelize.query(`SELECT 1 FROM ${tableName} LIMIT 1`, { type: require('sequelize').QueryTypes.SELECT });
    return true;
  } catch { return false; }
};

const teacherOnly = (req, res, next) => {
  if (!['teacher', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Teacher access required' });
  next();
};

// ── ownership helpers ─────────────────────────────────────────────────────────
async function teacherOwnsSubject(teacherId, subjectId) {
  const r = await sequelize.query(
    `SELECT id FROM teacher_subjects WHERE teacher_id=:teacherId AND subject_id=:subjectId AND is_active=true`,
    { replacements: { teacherId, subjectId }, type: QueryTypes.SELECT }
  );
  return r.length > 0;
}
async function teacherOwnsTopic(teacherId, topicId) {
  const r = await sequelize.query(
    `SELECT id FROM topics WHERE id=:topicId AND created_by=:teacherId`,
    { replacements: { topicId, teacherId }, type: QueryTypes.SELECT }
  );
  return r.length > 0;
}
async function teacherOwnsSubtopic(teacherId, subtopicId) {
  const r = await sequelize.query(
    `SELECT id FROM subtopics WHERE id=:subtopicId AND created_by=:teacherId`,
    { replacements: { subtopicId, teacherId }, type: QueryTypes.SELECT }
  );
  return r.length > 0;
}

// ============================================================================
// GET /api/teacher/my-subjects
// ============================================================================
router.get('/my-subjects', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT s.id, s.name, s.code, s.level, s.description,
              eb.id AS exam_board_id, eb.code AS exam_board_code,
              eb.name AS exam_board_name, eb.icon_emoji
       FROM teacher_subjects ts
       JOIN subjects s ON ts.subject_id = s.id
       LEFT JOIN exam_boards eb ON ts.exam_board_id = eb.id
       WHERE ts.teacher_id=:teacherId AND ts.is_active=true AND s.is_active=true
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
// TOPIC MANAGEMENT
// ============================================================================

// GET /api/teacher/topics?subject_id=UUID
router.get('/topics', protect, teacherOnly, async (req, res) => {
  const { subject_id } = req.query;
  if (!subject_id || !isValidUUID(subject_id))
    return res.status(400).json({ success: false, error: 'subject_id is required' });
  try {
    const rows = await sequelize.query(
      `SELECT t.id,
              COALESCE(t.name, t.title) AS name,
              t.description, t.order_index, t.created_by,
              (t.created_by = :teacherId) AS created_by_me,
              COUNT(st.id)::INTEGER       AS subtopic_count
       FROM topics t
       LEFT JOIN subtopics st ON st.topic_id=t.id AND st.is_active=true
       WHERE t.subject_id=:subjectId
       GROUP BY t.id
       ORDER BY t.order_index ASC NULLS LAST, t.created_at ASC`,
      { replacements: { subjectId: subject_id, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /teacher/topics]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch topics' });
  }
});

// POST /api/teacher/topics
router.post('/topics', protect, teacherOnly, async (req, res) => {
  const { subject_id, name, description = null, order_index = 0 } = req.body;
  if (!subject_id || !isValidUUID(subject_id))
    return res.status(400).json({ success: false, error: 'subject_id is required' });
  if (!name?.trim())
    return res.status(400).json({ success: false, error: 'name is required' });
  try {
    if (!(await teacherOwnsSubject(req.user.id, subject_id)))
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });

    const rows = await sequelize.query(
      `INSERT INTO topics (id, subject_id, name, title, description, order_index, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), :subjectId, :name, :name, :description, :orderIndex, :createdBy, NOW(), NOW())
       RETURNING id, name, title, description, order_index, created_by, created_at`,
      {
        replacements: { subjectId: subject_id, name: name.trim(), description,
          orderIndex: parseInt(order_index) || 0, createdBy: req.user.id },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: { ...rows[0], subtopic_count: 0, created_by_me: true } });
  } catch (err) {
    console.error('[POST /teacher/topics]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/teacher/topics/:id
router.put('/topics/:id', protect, teacherOnly, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  const { name, description, order_index } = req.body;
  try {
    if (!(await teacherOwnsTopic(req.user.id, id)))
      return res.status(403).json({ success: false, error: 'You can only edit topics you created' });

    const set = ['updated_at = NOW()'];
    const rep = { id };
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, error: 'name cannot be empty' });
      set.push('name = :name', 'title = :name'); rep.name = name.trim();
    }
    if (description !== undefined) { set.push('description = :description'); rep.description = description; }
    if (order_index  !== undefined) { set.push('order_index  = :orderIndex'); rep.orderIndex  = parseInt(order_index) || 0; }

    const rows = await sequelize.query(
      `UPDATE topics SET ${set.join(', ')} WHERE id=:id
       RETURNING id, name, title, description, order_index, created_by, updated_at`,
      { replacements: rep, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: { ...rows[0], created_by_me: true } });
  } catch (err) {
    console.error('[PUT /teacher/topics/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/teacher/topics/:id
router.delete('/topics/:id', protect, teacherOnly, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  try {
    if (!(await teacherOwnsTopic(req.user.id, id)))
      return res.status(403).json({ success: false, error: 'You can only delete topics you created' });
    await sequelize.query(
      `UPDATE subtopics SET is_active=false, updated_at=NOW() WHERE topic_id=:id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    await sequelize.query(`DELETE FROM topics WHERE id=:id`, { replacements: { id }, type: QueryTypes.DELETE });
    return res.status(200).json({ success: true, message: 'Topic deleted' });
  } catch (err) {
    console.error('[DELETE /teacher/topics/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// SUBTOPIC MANAGEMENT
// ============================================================================

// GET /api/teacher/subtopics?topic_id=UUID
router.get('/subtopics', protect, teacherOnly, async (req, res) => {
  const { topic_id } = req.query;
  if (!topic_id || !isValidUUID(topic_id))
    return res.status(400).json({ success: false, error: 'topic_id is required' });
  try {
    const rows = await sequelize.query(
      `SELECT st.id, st.name, st.description, st.order_index,
              st.topic_id, st.subject_id, st.created_by,
              (st.created_by = :teacherId) AS created_by_me,
              COUNT(c.id)::INTEGER         AS concept_count
       FROM subtopics st
       LEFT JOIN concepts c ON c.subtopic_id=st.id
       WHERE st.topic_id=:topicId AND st.is_active=true
       GROUP BY st.id
       ORDER BY st.order_index ASC NULLS LAST, st.created_at ASC`,
      { replacements: { topicId: topic_id, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /teacher/subtopics]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subtopics' });
  }
});

// POST /api/teacher/subtopics
router.post('/subtopics', protect, teacherOnly, async (req, res) => {
  const { topic_id, subject_id, name, description = null, order_index = 0 } = req.body;
  if (!topic_id   || !isValidUUID(topic_id))   return res.status(400).json({ success: false, error: 'topic_id is required' });
  if (!subject_id || !isValidUUID(subject_id)) return res.status(400).json({ success: false, error: 'subject_id is required' });
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
  try {
    if (!(await teacherOwnsSubject(req.user.id, subject_id)))
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });

    const rows = await sequelize.query(
      `INSERT INTO subtopics (id, topic_id, subject_id, name, description, order_index, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), :topicId, :subjectId, :name, :description, :orderIndex, true, :createdBy, NOW(), NOW())
       RETURNING id, name, description, order_index, topic_id, subject_id, created_by, created_at`,
      {
        replacements: { topicId: topic_id, subjectId: subject_id, name: name.trim(),
          description, orderIndex: parseInt(order_index) || 0, createdBy: req.user.id },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, data: { ...rows[0], concept_count: 0, created_by_me: true } });
  } catch (err) {
    console.error('[POST /teacher/subtopics]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/teacher/subtopics/:id
router.put('/subtopics/:id', protect, teacherOnly, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
  const { name, description, order_index } = req.body;
  try {
    if (!(await teacherOwnsSubtopic(req.user.id, id)))
      return res.status(403).json({ success: false, error: 'You can only edit subtopics you created' });

    const set = ['updated_at = NOW()'];
    const rep = { id };
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, error: 'name cannot be empty' });
      set.push('name = :name'); rep.name = name.trim();
    }
    if (description !== undefined) { set.push('description = :description'); rep.description = description; }
    if (order_index  !== undefined) { set.push('order_index  = :orderIndex'); rep.orderIndex  = parseInt(order_index) || 0; }

    const rows = await sequelize.query(
      `UPDATE subtopics SET ${set.join(', ')} WHERE id=:id
       RETURNING id, name, description, order_index, topic_id, subject_id, created_by, updated_at`,
      { replacements: rep, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: { ...rows[0], created_by_me: true } });
  } catch (err) {
    console.error('[PUT /teacher/subtopics/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/teacher/subtopics/:id
router.delete('/subtopics/:id', protect, teacherOnly, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
  try {
    if (!(await teacherOwnsSubtopic(req.user.id, id)))
      return res.status(403).json({ success: false, error: 'You can only delete subtopics you created' });
    await sequelize.query(
      `UPDATE subtopics SET is_active=false, updated_at=NOW() WHERE id=:id`,
      { replacements: { id }, type: QueryTypes.UPDATE }
    );
    return res.status(200).json({ success: true, message: 'Subtopic deleted' });
  } catch (err) {
    console.error('[DELETE /teacher/subtopics/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// EXISTING ROUTES — unchanged
// ============================================================================

router.get('/classes', protect, teacherOnly, async (req, res) => {
  try {
    if (!(await tableExists('classes'))) return res.json({ success: true, data: [] });
    const rows = await sequelize.query(
      `SELECT c.id, c.name, c.join_code, c.subject_ids, c.created_at,
              COUNT(cm.student_id)::INTEGER AS student_count,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_accuracy
       FROM classes c
       LEFT JOIN class_memberships cm ON cm.class_id = c.id
       LEFT JOIN practice_attempts pa ON pa.student_id = cm.student_id
         AND pa.attempted_at > NOW() - INTERVAL '30 days'
       WHERE c.teacher_id = :teacherId
       GROUP BY c.id ORDER BY c.created_at DESC`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.post('/classes', protect, teacherOnly, async (req, res) => {
  const { name, subject_ids = [] } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });
  const joinCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  try {
    const result = await sequelize.query(
      `INSERT INTO classes (id, teacher_id, name, join_code, subject_ids, created_at)
       VALUES (gen_random_uuid(), :teacherId, :name, :joinCode, :subjectIds::jsonb, NOW())
       RETURNING id, name, join_code`,
      { replacements: { teacherId: req.user.id, name, joinCode, subjectIds: JSON.stringify(subject_ids) }, type: QueryTypes.INSERT }
    );
    return res.status(201).json({ success: true, data: result[0][0] });
  } catch (err) {
    if (err.message.includes('classes')) return res.json({ success: true, data: [] });
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/class/:classId/invite', protect, teacherOnly, async (req, res) => {
  const newCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  try {
    await sequelize.query(
      `UPDATE classes SET join_code=:code WHERE id=:id AND teacher_id=:teacherId`,
      { replacements: { code: newCode, id: req.params.classId, teacherId: req.user.id }, type: QueryTypes.UPDATE }
    );
    return res.json({ success: true, join_code: newCode });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/class/:classId/analytics', protect, teacherOnly, async (req, res) => {
  const { classId } = req.params;
  try {
    const cls = await sequelize.query(
      `SELECT id FROM classes WHERE id=:classId AND teacher_id=:teacherId`,
      { replacements: { classId, teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!cls.length) return res.status(403).json({ success: false, error: 'Class not found' });

    const [weakTopics, students, subBreakdown] = await Promise.all([
      sequelize.query(
        `SELECT q.topic,
                ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS avg_accuracy,
                COUNT(DISTINCT pa.student_id)::INTEGER AS student_count
         FROM practice_attempts pa
         JOIN questions q ON q.id=pa.question_id
         JOIN class_memberships cm ON cm.student_id=pa.student_id AND cm.class_id=:classId
         WHERE pa.attempted_at > NOW() - INTERVAL '30 days' AND q.topic IS NOT NULL
         GROUP BY q.topic ORDER BY avg_accuracy ASC LIMIT 10`,
        { replacements: { classId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT u.id, u.first_name||' '||u.last_name AS name, u.email,
                COALESCE(u.study_streak_days,0) AS streak,
                COUNT(pa.id)::INTEGER AS attempts,
                ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy_pct,
                MAX(pa.attempted_at) AS last_active
         FROM users u
         JOIN class_memberships cm ON cm.student_id=u.id AND cm.class_id=:classId
         LEFT JOIN practice_attempts pa ON pa.student_id=u.id
         GROUP BY u.id ORDER BY accuracy_pct DESC NULLS LAST`,
        { replacements: { classId }, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT s.name AS subject,
                ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS avg_accuracy,
                ROUND(AVG(pa.time_taken_ms)/1000.0,1) AS avg_time
         FROM practice_attempts pa
         JOIN questions q ON q.id=pa.question_id
         JOIN subjects s ON s.id=q.subject_id_uuid
         JOIN class_memberships cm ON cm.student_id=pa.student_id AND cm.class_id=:classId
         GROUP BY s.name`,
        { replacements: { classId }, type: QueryTypes.SELECT }
      ),
    ]);

    const now = Date.now();
    const studentsTagged = students.map(s => ({
      ...s,
      days_since_active: s.last_active ? Math.floor((now - new Date(s.last_active).getTime()) / 86400000) : null,
    }));
    return res.json({
      success: true,
      data: { weak_topics: weakTopics, students: studentsTagged,
              inactive_students: studentsTagged.filter(s => s.days_since_active > 7),
              subject_breakdown: subBreakdown },
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get('/tests', protect, teacherOnly, async (req, res) => {
  try {
    if (!(await tableExists('custom_tests'))) return res.json({ success: true, data: [] });
    const rows = await sequelize.query(
      `SELECT ct.id, ct.title, ct.duration_minutes, ct.total_marks, ct.is_published, ct.created_at,
              COUNT(tq.id)::INTEGER AS question_count,
              (SELECT COUNT(*)::INTEGER FROM test_assignments ta WHERE ta.test_id=ct.id) AS submissions
       FROM custom_tests ct
       LEFT JOIN test_questions tq ON tq.test_id=ct.id
       WHERE ct.teacher_id=:teacherId
       GROUP BY ct.id ORDER BY ct.created_at DESC`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.post('/tests', protect, teacherOnly, async (req, res) => {
  const { title, class_id=null, subject_id=null, difficulty='mixed',
          question_count=10, time_limit_minutes=30, due_date=null } = req.body;
  if (!title?.trim()) return res.status(400).json({ success: false, error: 'title is required' });
  const qCount = Math.min(Math.max(parseInt(question_count)||10, 5), 40);
  try {
    const diffFilter = difficulty !== 'mixed' ? 'AND q.difficulty=:difficulty' : '';
    const subjFilter = subject_id ? 'AND q.subject_id_uuid=:subject_id' : '';
    const questions  = await sequelize.query(
      `SELECT q.id FROM questions q WHERE q.status='approved' AND q.question_sub_type='mcq'
       ${diffFilter} ${subjFilter} ORDER BY RANDOM() LIMIT :qCount`,
      { replacements: { qCount, ...(difficulty!=='mixed'?{difficulty}:{}), ...(subject_id?{subject_id}:{}) }, type: QueryTypes.SELECT }
    );
    if (!questions.length)
      return res.status(400).json({ success: false, error: 'No approved questions found. Try different criteria.' });

    const testResult = await sequelize.query(
      `INSERT INTO custom_tests (id, teacher_id, subject_id, title, duration_minutes, total_marks, passing_marks, is_published, created_at, updated_at)
       VALUES (gen_random_uuid(),:teacherId,:subjectId,:title,:timeLimitMinutes,:totalMarks,:passingMarks,true,NOW(),NOW())
       RETURNING id, title`,
      { replacements: { teacherId: req.user.id, subjectId: subject_id||null, title: title.trim(),
          timeLimitMinutes: parseInt(time_limit_minutes)||30, totalMarks: questions.length,
          passingMarks: Math.round(questions.length*0.5) }, type: QueryTypes.INSERT }
    );
    const test = testResult[0][0];
    for (let i=0; i<questions.length; i++) {
      await sequelize.query(
        `INSERT INTO test_questions (id,test_id,question_id,question_order,marks_allocated) VALUES (gen_random_uuid(),:testId,:questionId,:order,1)`,
        { replacements: { testId: test.id, questionId: questions[i].id, order: i+1 }, type: QueryTypes.INSERT }
      );
    }
    if (class_id) {
      const members = await sequelize.query(
        `SELECT student_id FROM class_memberships WHERE class_id=:class_id`,
        { replacements: { class_id }, type: QueryTypes.SELECT }
      );
      for (const m of members) {
        await sequelize.query(
          `INSERT INTO test_assignments (id,test_id,student_id,due_date,assigned_at) VALUES (gen_random_uuid(),:testId,:studentId,:dueDate,NOW()) ON CONFLICT (test_id,student_id) DO NOTHING`,
          { replacements: { testId: test.id, studentId: m.student_id, dueDate: due_date||null }, type: QueryTypes.INSERT }
        );
      }
    }
    return res.status(201).json({ success: true, data: { id: test.id, title: test.title, question_count: questions.length, time_limit_minutes: parseInt(time_limit_minutes)||30, due_date } });
  } catch (err) {
    console.error('[POST /teacher/tests]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/nudge/:userId', protect, teacherOnly, async (req, res) => {
  try {
    const users = await sequelize.query(`SELECT first_name, email FROM users WHERE id=:id`, { replacements: { id: req.params.userId }, type: QueryTypes.SELECT });
    if (!users.length) return res.status(404).json({ success: false, error: 'User not found' });
    const { sendStreakNudge } = require('../services/emailService');
    await sendStreakNudge(users[0], 7);
    return res.json({ success: true, message: `Nudge sent to ${users[0].email}` });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

// ============================================================================
// CONCEPT MANAGEMENT
// ============================================================================

router.post('/concepts', protect, teacherOnly, async (req, res) => {
  const { subtopic_id, name, description=null, difficulty_level=1, estimated_minutes=10, order_index=0, prerequisite_ids=[] } = req.body;
  if (!subtopic_id||!isValidUUID(subtopic_id)) return res.status(400).json({ success:false, error:'subtopic_id required' });
  if (!name?.trim()) return res.status(400).json({ success:false, error:'name required' });
  const diffLevel = Math.min(Math.max(parseInt(difficulty_level)||1,1),5);
  try {
    const stRows = await sequelize.query(`SELECT id FROM subtopics WHERE id=:subtopicId`, { replacements:{subtopicId:subtopic_id}, type:QueryTypes.SELECT });
    if (!stRows.length) return res.status(404).json({ success:false, error:'Subtopic not found' });
    const conceptRows = await sequelize.query(
      `INSERT INTO concepts (id,subtopic_id,name,description,difficulty_level,estimated_minutes,order_index,created_at,updated_at)
       VALUES (gen_random_uuid(),:subtopicId,:name,:description,:difficultyLevel,:estimatedMinutes,:orderIndex,NOW(),NOW())
       RETURNING id,subtopic_id,name,description,difficulty_level,estimated_minutes,order_index,created_at`,
      { replacements:{subtopicId:subtopic_id,name:name.trim(),description,difficultyLevel:diffLevel,estimatedMinutes:parseInt(estimated_minutes)||10,orderIndex:parseInt(order_index)||0}, type:QueryTypes.SELECT }
    );
    const concept=conceptRows[0]; const savedPrereqs=[];
    for (const parentId of (Array.isArray(prerequisite_ids)?prerequisite_ids:[])) {
      if (!isValidUUID(parentId)||parentId===concept.id) continue;
      try { await sequelize.query(`INSERT INTO concept_dependencies (id,parent_concept_id,child_concept_id,dependency_type,created_at) VALUES (gen_random_uuid(),:parentId,:childId,'prerequisite',NOW()) ON CONFLICT (parent_concept_id,child_concept_id) DO NOTHING`,{replacements:{parentId,childId:concept.id},type:QueryTypes.INSERT}); savedPrereqs.push(parentId); } catch {}
    }
    return res.status(201).json({ success:true, data:{...concept,prerequisite_ids:savedPrereqs} });
  } catch (err) { console.error('[POST /teacher/concepts]',err.message); return res.status(500).json({success:false,error:err.message}); }
});

router.get('/concepts/:subtopicId', protect, teacherOnly, async (req, res) => {
  const {subtopicId}=req.params;
  if (!isValidUUID(subtopicId)) return res.status(400).json({success:false,error:'Invalid subtopic ID'});
  try {
    const concepts=await sequelize.query(`SELECT id,name,description,difficulty_level,estimated_minutes,order_index,created_at,updated_at FROM concepts WHERE subtopic_id=:subtopicId ORDER BY order_index ASC,name ASC`,{replacements:{subtopicId},type:QueryTypes.SELECT});
    if (!concepts.length) return res.status(200).json({success:true,count:0,data:[]});
    const depRows=await sequelize.query(`SELECT parent_concept_id,child_concept_id FROM concept_dependencies WHERE child_concept_id=ANY(:conceptIds)`,{replacements:{conceptIds:concepts.map(c=>c.id)},type:QueryTypes.SELECT});
    const prereqMap=depRows.reduce((acc,row)=>{if(!acc[row.child_concept_id])acc[row.child_concept_id]=[];acc[row.child_concept_id].push(row.parent_concept_id);return acc},{});
    return res.status(200).json({success:true,count:concepts.length,data:concepts.map(c=>({...c,prerequisite_ids:prereqMap[c.id]||[]}))});
  } catch (err) { return res.status(500).json({success:false,error:err.message}); }
});

router.put('/concepts/:id', protect, teacherOnly, async (req, res) => {
  const {id}=req.params;
  if (!isValidUUID(id)) return res.status(400).json({success:false,error:'Invalid concept ID'});
  const {name,description,difficulty_level,estimated_minutes,order_index,prerequisite_ids}=req.body;
  try {
    const existing=await sequelize.query(`SELECT id FROM concepts WHERE id=:id`,{replacements:{id},type:QueryTypes.SELECT});
    if (!existing.length) return res.status(404).json({success:false,error:'Concept not found'});
    const set=['updated_at=NOW()']; const rep={id};
    if (name!==undefined){if(!name.trim())return res.status(400).json({success:false,error:'name cannot be empty'});set.push('name=:name');rep.name=name.trim();}
    if (description!==undefined){set.push('description=:description');rep.description=description;}
    if (difficulty_level!==undefined){set.push('difficulty_level=:dl');rep.dl=Math.min(Math.max(parseInt(difficulty_level)||1,1),5);}
    if (estimated_minutes!==undefined){set.push('estimated_minutes=:em');rep.em=parseInt(estimated_minutes)||10;}
    if (order_index!==undefined){set.push('order_index=:oi');rep.oi=parseInt(order_index)||0;}
    const updatedRows=await sequelize.query(`UPDATE concepts SET ${set.join(',')} WHERE id=:id RETURNING id,subtopic_id,name,description,difficulty_level,estimated_minutes,order_index,updated_at`,{replacements:rep,type:QueryTypes.SELECT});
    let finalPrereqs=null;
    if (Array.isArray(prerequisite_ids)){
      await sequelize.query(`DELETE FROM concept_dependencies WHERE child_concept_id=:id`,{replacements:{id},type:QueryTypes.DELETE});
      finalPrereqs=[];
      for (const parentId of prerequisite_ids){if(!isValidUUID(parentId)||parentId===id)continue;try{await sequelize.query(`INSERT INTO concept_dependencies (id,parent_concept_id,child_concept_id,dependency_type,created_at) VALUES (gen_random_uuid(),:parentId,:childId,'prerequisite',NOW()) ON CONFLICT (parent_concept_id,child_concept_id) DO NOTHING`,{replacements:{parentId,childId:id},type:QueryTypes.INSERT});finalPrereqs.push(parentId);}catch{}}
    }
    return res.status(200).json({success:true,data:{...updatedRows[0],...(finalPrereqs!==null?{prerequisite_ids:finalPrereqs}:{})}});
  } catch (err) { return res.status(500).json({success:false,error:err.message}); }
});

router.delete('/concepts/:id', protect, teacherOnly, async (req, res) => {
  const {id}=req.params;
  if (!isValidUUID(id)) return res.status(400).json({success:false,error:'Invalid concept ID'});
  try {
    const rows=await sequelize.query(`SELECT id,name FROM concepts WHERE id=:id`,{replacements:{id},type:QueryTypes.SELECT});
    if (!rows.length) return res.status(404).json({success:false,error:'Concept not found'});
    await sequelize.query(`DELETE FROM concepts WHERE id=:id`,{replacements:{id},type:QueryTypes.DELETE});
    return res.status(200).json({success:true,message:`Concept "${rows[0].name}" deleted`});
  } catch (err) { return res.status(500).json({success:false,error:err.message}); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 14 ADDITION: GET /api/teacher/questions
// Returns this teacher's submitted questions with subject name and status,
// newest first. Added before module.exports = router.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/teacher/questions
// Returns this teacher's submitted questions with subject name and status.
router.get('/questions', protect, teacherOnly, async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT q.id, q.question_text, q.difficulty,
              q.explanation, q.options, q.correct_answer, q.created_at,
              s.name AS subject_name
       FROM questions q
       LEFT JOIN subtopics  st ON st.id = q.subtopic_id
       LEFT JOIN topics      t ON t.id  = st.topic_id
       LEFT JOIN subjects    s ON s.id  = t.subject_id
       WHERE q.submitted_by = :teacherId
       ORDER BY q.created_at DESC
       LIMIT 100`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/teacher/questions — submit a question (auto-approved)
router.post('/questions', protect, teacherOnly, async (req, res) => {
  const { question_text, subtopic_id, difficulty = 'medium', explanation, options } = req.body;
  if (!question_text?.trim()) return res.status(400).json({ success: false, error: 'question_text is required' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ success: false, error: 'At least 2 options required' });

  const correctOption = options.find(o => o.is_correct);
  if (!correctOption) return res.status(400).json({ success: false, error: 'One option must be marked correct' });

  try {
    const result = await sequelize.query(
      `INSERT INTO questions
         (question_text, subtopic_id, submitted_by, difficulty, explanation,
          options, correct_answer, type, is_active, created_at, updated_at)
       VALUES
         (:question_text, :subtopic_id, :submitted_by, :difficulty, :explanation,
          :options::jsonb, :correct_answer, 'mcq', true, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          question_text:  question_text.trim(),
          subtopic_id:    subtopic_id ? parseInt(subtopic_id) : null,
          submitted_by:   req.user.id,
          difficulty,
          explanation:    explanation?.trim() || null,
          options:        JSON.stringify(options.map(o => ({ option_text: o.option_text || o.text, is_correct: !!o.is_correct }))),
          correct_answer: correctOption.option_text || correctOption.text,
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

module.exports = router;
