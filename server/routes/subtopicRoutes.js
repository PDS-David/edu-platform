'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');
function computeSubtopicCompletion(st) {
  const flags = {
    resources_completed: !!st.resources_completed,
    practice_completed:  !!st.practice_completed,
    quiz_completed:      !!st.quiz_completed,
    notes_viewed:        !!st.notes_viewed,
    video_watched:       !!st.video_watched,
  };
  const total = Object.keys(flags).length;
  const done  = Object.values(flags).filter(Boolean).length;
  return {
    ...flags,
    completed: done === total,
    completion_score: total ? Math.round((done / total) * 100) : 0,
  };
}

function isValidInt(v) {
  return Number.isInteger(Number(v));
}

// ─────────────────────────────────────────────────────────────
// GET /api/subtopics
// ─────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const subjectId = req.query.subject_id ? Number(req.query.subject_id) : null;
  const topicId = req.query.topic_id ? Number(req.query.topic_id) : null;

  // Scoping: same registered-subject / assigned-subject checks as
  // topicsRoutes.js's GET / — only applies when a subject_id was actually
  // passed (matches this endpoint's existing "filters are optional" shape;
  // an unfiltered call still returns everything, same as before, since
  // there's no single subject_id here to check against).
  if (subjectId && req.user.role === 'student') {
    const registered = await sequelize.query(
      `SELECT 1 FROM student_subjects ss
        WHERE ss.student_id = :studentId AND ss.subject_id = :subjectId AND ss.status = 'approved'
       UNION
       SELECT 1 FROM class_memberships cm
         JOIN class_subjects cs ON cs.class_id = cm.class_id
        WHERE cm.student_id = :studentId AND cs.subject_id = :subjectId
       LIMIT 1`,
      { replacements: { studentId: req.user.id, subjectId }, type: QueryTypes.SELECT }
    ).catch(() => []);
    if (!registered.length) {
      return res.status(403).json({ success: false, error: 'You are not registered for this subject' });
    }
  } else if (subjectId && req.user.role === 'teacher') {
    const assigned = await sequelize.query(
      `SELECT subject_id FROM teacher_subjects WHERE teacher_id = :teacherId AND is_active = true`,
      { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
    );
    const assignedIds = assigned.map(r => String(r.subject_id));
    // Fail-closed: zero assignments on record means zero access, not
    // unrestricted access.
    if (!assignedIds.includes(String(subjectId))) {
      return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
    }
  }

  const filters = [];
  const replacements = { studentId: req.user.id };

  if (subjectId) {
    filters.push('st.subject_id = :subjectId');
    replacements.subjectId = subjectId;
  }

  if (topicId) {
    filters.push('st.topic_id = :topicId');
    replacements.topicId = topicId;
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const rows = await sequelize.query(
      `
      SELECT
        st.id,
        st.name,
        st.description,
        st.order_index,
        st.topic_id,
        st.subject_id,

        COALESCE(sp.resources_completed, false) AS resources_completed,
        COALESCE(sp.practice_completed, false) AS practice_completed,
        COALESCE(sp.quiz_completed, false) AS quiz_completed,
        COALESCE(sp.notes_viewed, false) AS notes_viewed,
        COALESCE(sp.video_watched, false) AS video_watched

      FROM subtopics st
      JOIN topics t ON st.topic_id = t.id
      JOIN subjects s ON st.subject_id = s.id
      LEFT JOIN subtopic_progress sp
        ON sp.subtopic_id = st.id
       AND sp.student_id = :studentId

      ${where}
      ORDER BY t.order_index ASC, st.order_index ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const data = rows.map((st) => {
      const computed = computeSubtopicCompletion(st);

      return {
        id: st.id,
        name: st.name,
        description: st.description,
        order_index: st.order_index,
        topic_id: st.topic_id,
        subject_id: st.subject_id,

        resources_completed: computed.resources_completed,
        practice_completed: computed.practice_completed,
        quiz_completed: computed.quiz_completed,
        notes_viewed: computed.notes_viewed,
        video_watched: computed.video_watched,

        completed: computed.completed,
        completion_score: computed.completion_score,
      };
    });

    return res.json({
      success: true,
      count: data.length,
      data,
    });

  } catch (err) {
    console.error('[GET /subtopics] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch subtopics',
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/subtopics/progress-summary
// Called by SubjectPage — returns aggregated progress for a subject.
// MUST be registered before /:id to avoid 'progress-summary' being treated as an id.
// Response shape (flat — no .data wrapper so apiClient passes .success through):
//   { success, completed_subtopics, total_subtopics, completion_pct }
// ─────────────────────────────────────────────────────────────
router.get('/progress-summary', protect, async (req, res) => {
  const { subject_id } = req.query;
  const studentId = req.user.id;

  if (!subject_id) {
    return res.status(400).json({ success: false, error: 'subject_id is required' });
  }

  try {
    const rows = await sequelize.query(`
      SELECT
        st.id,
        COALESCE(sp.resources_completed, false) AS resources_completed,
        COALESCE(sp.practice_completed,  false) AS practice_completed,
        COALESCE(sp.quiz_completed,      false) AS quiz_completed
      FROM subtopics st
      JOIN topics t ON t.id = st.topic_id
      LEFT JOIN subtopic_progress sp
        ON sp.subtopic_id = st.id AND sp.student_id = :studentId
      WHERE t.subject_id = :subjectId
        AND COALESCE(st.is_active, true) = true
    `, { replacements: { studentId, subjectId: subject_id }, type: QueryTypes.SELECT });

    const total     = rows.length;
    const completed = rows.filter(r =>
      r.resources_completed && r.practice_completed && r.quiz_completed
    ).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Flat response so apiClient exposes .success on the normalized object
    return res.json({
      success:             true,
      completed_subtopics: completed,
      total_subtopics:     total,
      completion_pct:      pct,
    });
  } catch (err) {
    console.error('[GET /subtopics/progress-summary]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/subtopics/:id/progress
// Called by SubtopicPage on mount to restore progress state.
// Returns flat object so apiClient exposes .success correctly.
// ─────────────────────────────────────────────────────────────
router.get('/:id/progress', protect, async (req, res) => {
  const subtopicId = Number(req.params.id);
  const studentId  = req.user.id;

  if (!Number.isInteger(subtopicId) || subtopicId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
  }

  try {
    const [row] = await sequelize.query(`
      SELECT resources_completed, practice_completed, quiz_completed
      FROM subtopic_progress
      WHERE subtopic_id = :subtopicId AND student_id = :studentId
    `, { replacements: { subtopicId, studentId }, type: QueryTypes.SELECT });

    // Flat response — apiClient: r = { data: { success, resources_completed, ... }, status }
    // SubtopicPage: if (r.success) setProgress(r.data) → r.data has all fields needed
    return res.json({
      success:             true,
      resources_completed: row?.resources_completed ?? false,
      practice_completed:  row?.practice_completed  ?? false,
      quiz_completed:      row?.quiz_completed       ?? false,
    });
  } catch (err) {
    console.error('[GET /subtopics/:id/progress]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/subtopics/:id/progress
// Called by SubtopicPage when a tab is completed.
// Body: { task: 'resources' | 'practice' | 'quiz' }
// Maps task name → boolean column and upserts subtopic_progress row.
// ─────────────────────────────────────────────────────────────
router.post('/:id/progress', protect, async (req, res) => {
  const subtopicId = Number(req.params.id);
  const studentId  = req.user.id;
  const { task }   = req.body;

  if (!Number.isInteger(subtopicId) || subtopicId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
  }

  const TASK_MAP = {
    resources: 'resources_completed',
    practice:  'practice_completed',
    quiz:      'quiz_completed',
  };

  const column = TASK_MAP[task];
  if (!column) {
    return res.status(400).json({ success: false, error: `Invalid task: must be one of ${Object.keys(TASK_MAP).join(', ')}` });
  }

  try {
    // Try with last_accessed column first; fall back without it if the column
    // doesn't exist yet in this environment (migration not yet applied).
    try {
      await sequelize.query(`
        INSERT INTO subtopic_progress
          (student_id, subtopic_id, ${column}, last_accessed)
        VALUES
          (:studentId, :subtopicId, true, NOW())
        ON CONFLICT (student_id, subtopic_id) DO UPDATE SET
          ${column}    = true,
          last_accessed = NOW()
      `, { replacements: { studentId, subtopicId }, type: QueryTypes.INSERT });
    } catch (innerErr) {
      // last_accessed column may not exist — retry without it
      if (innerErr.message?.includes('last_accessed') || innerErr.original?.code === '42703') {
        await sequelize.query(`
          INSERT INTO subtopic_progress
            (student_id, subtopic_id, ${column})
          VALUES
            (:studentId, :subtopicId, true)
          ON CONFLICT (student_id, subtopic_id) DO UPDATE SET
            ${column} = true
        `, { replacements: { studentId, subtopicId }, type: QueryTypes.INSERT });
      } else {
        throw innerErr;
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[POST /subtopics/:id/progress]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});


router.get('/:id', protect, async (req, res) => {
  const id = Number(req.params.id);

  if (!isValidInt(id)) {
    return res.status(400).json({ success: false, error: 'Invalid ID' });
  }

  try {
    const rows = await sequelize.query(
      `
      SELECT
        st.*,
        t.name AS topic_name,
        s.name AS subject_name
      FROM subtopics st
      JOIN topics t ON st.topic_id = t.id
      JOIN subjects s ON st.subject_id = s.id
      WHERE st.id = :id
      `,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    // Scoping: same registered-subject / assigned-subject check as GET /
    // above, applied to the subject this subtopic actually belongs to.
    const subjectId = rows[0].subject_id;
    if (req.user.role === 'student') {
      const registered = await sequelize.query(
        `SELECT 1 FROM student_subjects ss
          WHERE ss.student_id = :studentId AND ss.subject_id = :subjectId AND ss.status = 'approved'
         UNION
         SELECT 1 FROM class_memberships cm
           JOIN class_subjects cs ON cs.class_id = cm.class_id
          WHERE cm.student_id = :studentId AND cs.subject_id = :subjectId
         LIMIT 1`,
        { replacements: { studentId: req.user.id, subjectId }, type: QueryTypes.SELECT }
      ).catch(() => []);
      if (!registered.length) {
        return res.status(403).json({ success: false, error: 'You are not registered for this subject' });
      }
    } else if (req.user.role === 'teacher') {
      const assigned = await sequelize.query(
        `SELECT subject_id FROM teacher_subjects WHERE teacher_id = :teacherId AND is_active = true`,
        { replacements: { teacherId: req.user.id }, type: QueryTypes.SELECT }
      );
      const assignedIds = assigned.map(r => String(r.subject_id));
      // Fail-closed: zero assignments on record means zero access.
      if (!assignedIds.includes(String(subjectId))) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this subject' });
      }
    }

    return res.json({
      success: true,
      data: rows[0],
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch',
    });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/subtopics/:id/adjacent
// ─────────────────────────────────────────────────────────────
router.get('/:id/adjacent', protect, async (req, res) => {
  const id = Number(req.params.id);

  if (!isValidInt(id)) {
    return res.status(400).json({ success: false, error: 'Invalid ID' });
  }

  try {
    const current = await sequelize.query(
      `
      SELECT id, topic_id, order_index
      FROM subtopics
      WHERE id = :id
      `,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!current.length) {
      return res.status(404).json({ success: false });
    }

    const { topic_id, order_index } = current[0];

    const prev = await sequelize.query(
      `
      SELECT id, name
      FROM subtopics
      WHERE topic_id = :topicId
        AND order_index < :orderIndex
      ORDER BY order_index DESC
      LIMIT 1
      `,
      {
        replacements: {
          topicId: topic_id,
          orderIndex: order_index,
        },
        type: QueryTypes.SELECT,
      }
    );

    const next = await sequelize.query(
      `
      SELECT id, name
      FROM subtopics
      WHERE topic_id = :topicId
        AND order_index > :orderIndex
      ORDER BY order_index ASC
      LIMIT 1
      `,
      {
        replacements: {
          topicId: topic_id,
          orderIndex: order_index,
        },
        type: QueryTypes.SELECT,
      }
    );

    return res.json({
      success: true,
      data: {
        previous: prev[0] || null,
        next: next[0] || null,
      },
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed adjacent lookup',
    });
  }
});

module.exports = router;
