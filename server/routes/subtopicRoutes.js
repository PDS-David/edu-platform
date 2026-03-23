// server/routes/subtopicRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Endpoints:
//   GET  /api/subtopics                           — list subtopics by subject/topic
//   GET  /api/subtopics/:id                       — single subtopic with progress
//   GET  /api/subtopics/:id/adjacent              — prev/next subtopic for navigation
//   GET  /api/subtopics/:id/progress/:studentId   — completion status for the 3 tabs
//   POST /api/subtopics/:id/progress              — mark a tab as complete
//   GET  /api/subtopics/next                      — "What's Next" recommendation
//   GET  /api/subtopics/progress-summary          — "X of Y Complete" for subject page
// ─────────────────────────────────────────────────────────────────────────────

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(v); }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics/next
// Returns the recommended "What's Next" subtopic for a student.
// Finds the subtopic the student has started but not fully completed,
// or the first subtopic if none started.
// Query params: student_id, board (exam board UUID or code)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/next', protect, async (req, res) => {
  const studentId = req.query.student_id || req.user.id;
  const { board } = req.query;

  try {
    // Find a subtopic the student has started but not finished
    const started = await sequelize.query(
      `SELECT
         st.id, st.name AS subtopic_name,
         COALESCE(t.name, t.title) AS topic_name,
         s.name AS subject_name,
         s.icon_emoji, s.id AS subject_id,
         sp.resources_completed, sp.practice_completed, sp.quiz_completed,
         (
           CASE WHEN sp.resources_completed THEN 1 ELSE 0 END +
           CASE WHEN sp.practice_completed  THEN 1 ELSE 0 END +
           CASE WHEN sp.quiz_completed      THEN 1 ELSE 0 END
         ) AS tasks_done
       FROM subtopic_progress sp
       JOIN subtopics st ON sp.subtopic_id = st.id
       JOIN topics    t  ON st.topic_id    = t.id
       JOIN subjects  s  ON st.subject_id  = s.id
       WHERE sp.student_id = :studentId
         AND (sp.resources_completed = false OR sp.practice_completed = false OR sp.quiz_completed = false)
       ORDER BY sp.updated_at DESC
       LIMIT 1`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    if (started.length > 0) {
      const s = started[0];
      const completionPct = Math.round((s.tasks_done / 3) * 100);
      return res.status(200).json({
        success: true,
        data: {
          subtopic_id:   s.id,
          subtopic_name: s.subtopic_name,
          topic_name:    s.topic_name,
          subject_name:  s.subject_name,
          subject_id:    s.subject_id,
          icon_emoji:    s.icon_emoji,
          completion_pct: completionPct,
          resources_completed: s.resources_completed,
          practice_completed:  s.practice_completed,
          quiz_completed:      s.quiz_completed,
        },
      });
    }

    // Nothing started — return first not-yet-completed subtopic ordered by index
    const first = await sequelize.query(
      `SELECT
         st.id, st.name AS subtopic_name,
         COALESCE(t.name, t.title) AS topic_name,
         s.name AS subject_name,
         s.icon_emoji, s.id AS subject_id
       FROM subtopics st
       JOIN topics   t ON st.topic_id   = t.id
       JOIN subjects s ON st.subject_id = s.id
       WHERE st.id NOT IN (
         SELECT subtopic_id FROM subtopic_progress
         WHERE student_id = :studentId
           AND resources_completed = true
           AND practice_completed  = true
           AND quiz_completed      = true
       )
       ORDER BY s.name ASC, t.order_index ASC, st.order_index ASC
       LIMIT 1`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );

    if (!first.length) {
      return res.status(200).json({ success: true, data: null });
    }

    const f = first[0];
    return res.status(200).json({
      success: true,
      data: {
        subtopic_id:   f.id,
        subtopic_name: f.subtopic_name,
        topic_name:    f.topic_name,
        subject_name:  f.subject_name,
        subject_id:    f.subject_id,
        icon_emoji:    f.icon_emoji,
        completion_pct: 0,
        resources_completed: false,
        practice_completed:  false,
        quiz_completed:      false,
      },
    });
  } catch (err) {
    console.error('[GET /subtopics/next] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch next subtopic' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics/progress-summary
// Returns "X of Y Complete" for the subject page "Your Progress" dropdown.
// Query params: student_id, subject_id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/progress-summary', protect, async (req, res) => {
  const studentId = req.query.student_id || req.user.id;
  const { subject_id } = req.query;

  if (!subject_id || !isValidUUID(subject_id)) {
    return res.status(400).json({ success: false, error: 'subject_id is required' });
  }

  try {
    const total = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS total FROM subtopics WHERE subject_id = :subjectId`,
      { replacements: { subjectId: subject_id }, type: QueryTypes.SELECT }
    );

    const completed = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS completed
       FROM subtopic_progress sp
       JOIN subtopics st ON sp.subtopic_id = st.id
       WHERE sp.student_id = :studentId
         AND st.subject_id = :subjectId
         AND sp.resources_completed = true
         AND sp.practice_completed  = true
         AND sp.quiz_completed      = true`,
      { replacements: { studentId, subjectId: subject_id }, type: QueryTypes.SELECT }
    );

    const totalN    = total[0].total;
    const completedN = completed[0].completed;

    return res.status(200).json({
      success: true,
      data: {
        total_subtopics:     totalN,
        completed_subtopics: completedN,
        completion_pct:      totalN > 0 ? Math.round((completedN / totalN) * 100) : 0,
        label: `${completedN} of ${totalN} Complete`,
      },
    });
  } catch (err) {
    console.error('[GET /subtopics/progress-summary] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch progress summary' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics
// List subtopics, optionally filtered by subject_id or topic_id.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  const { subject_id, topic_id } = req.query;
  const filters      = [];
  const replacements = { studentId: req.user.id };

  if (subject_id && isValidUUID(subject_id)) { filters.push('st.subject_id = :subject_id'); replacements.subject_id = subject_id; }
  if (topic_id   && isValidUUID(topic_id))   { filters.push('st.topic_id   = :topic_id');   replacements.topic_id   = topic_id;   }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const subtopics = await sequelize.query(
      `SELECT
              st.id, st.name, st.description, st.order_index,
              st.topic_id, st.subject_id, st.exam_board_id,
              COALESCE(t.name, t.title) AS topic_name, s.name AS subject_name,
              COALESCE(sp.resources_completed, false) AS resources_completed,
              COALESCE(sp.practice_completed,  false) AS practice_completed,
              COALESCE(sp.quiz_completed,      false) AS quiz_completed,
              CASE WHEN (sp.resources_completed AND sp.practice_completed AND sp.quiz_completed)
                   THEN true ELSE false END            AS completed
       FROM subtopics st
       JOIN topics   t ON st.topic_id   = t.id
       JOIN subjects s ON st.subject_id = s.id
       LEFT JOIN subtopic_progress sp
         ON sp.subtopic_id = st.id AND sp.student_id = :studentId
       ${where}
       ORDER BY t.order_index ASC, st.order_index ASC`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, count: subtopics.length, data: subtopics });
  } catch (err) {
    console.error('[GET /subtopics] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subtopics' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics/:id
// Single subtopic with full details.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });

  try {
    const rows = await sequelize.query(
      `SELECT st.id, st.name, st.description, st.order_index,
              st.topic_id, st.subject_id, st.exam_board_id,
              COALESCE(t.name, t.title) AS topic_name,
              s.name AS subject_name,
              s.icon_emoji, eb.code AS exam_board_code, eb.name AS exam_board_name
       FROM subtopics st
       JOIN topics     t  ON st.topic_id     = t.id
       JOIN subjects   s  ON st.subject_id   = s.id
       LEFT JOIN exam_boards eb ON st.exam_board_id = eb.id
       WHERE st.id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Subtopic not found' });

    return res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error(`[GET /subtopics/${id}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subtopic' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics/:id/adjacent
// Returns the previous and next subtopic within the same topic.
// Used by the ← → navigation arrows on the sub-topic page.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/adjacent', protect, async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });

  try {
    const current = await sequelize.query(
      `SELECT id, topic_id, order_index FROM subtopics WHERE id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!current.length) return res.status(404).json({ success: false, error: 'Subtopic not found' });

    const { topic_id, order_index } = current[0];

    const prev = await sequelize.query(
      `SELECT id, name FROM subtopics
       WHERE topic_id = :topicId AND order_index < :orderIndex
       ORDER BY order_index DESC LIMIT 1`,
      { replacements: { topicId: topic_id, orderIndex: order_index }, type: QueryTypes.SELECT }
    );

    const next = await sequelize.query(
      `SELECT id, name FROM subtopics
       WHERE topic_id = :topicId AND order_index > :orderIndex
       ORDER BY order_index ASC LIMIT 1`,
      { replacements: { topicId: topic_id, orderIndex: order_index }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      data: {
        previous: prev.length ? { id: prev[0].id, name: prev[0].name } : null,
        next:     next.length ? { id: next[0].id, name: next[0].name } : null,
      },
    });
  } catch (err) {
    console.error(`[GET /subtopics/${id}/adjacent] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch adjacent subtopics' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics/:id/progress
// Returns the 3-tab completion status for the logged-in student (JWT).
// Students always get their own data — no IDOR possible.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/progress', protect, async (req, res) => {
  const { id } = req.params;
  const studentId = req.user.id; // always from JWT
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT resources_completed, practice_completed, quiz_completed, completed_at, updated_at
       FROM subtopic_progress
       WHERE subtopic_id = :id AND student_id = :studentId`,
      { replacements: { id, studentId }, type: QueryTypes.SELECT }
    );

    const progress = rows.length > 0 ? rows[0] : {
      resources_completed: false,
      practice_completed:  false,
      quiz_completed:      false,
      completed_at:        null,
    };

    const tasksDone = [progress.resources_completed, progress.practice_completed, progress.quiz_completed]
      .filter(Boolean).length;
    const tasksRemaining = 3 - tasksDone;
    const completionPct  = Math.round((tasksDone / 3) * 100);

    return res.status(200).json({
      success: true,
      data: {
        ...progress,
        tasks_done:       tasksDone,
        tasks_remaining:  tasksRemaining,
        completion_pct:   completionPct,
        completion_label: `${completionPct}% Complete`,
        tasks_label:      `${tasksRemaining} task${tasksRemaining !== 1 ? 's' : ''} remaining`,
      },
    });
  } catch (err) {
    console.error(`[GET /subtopics/${id}/progress/${studentId}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subtopic progress' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/subtopics/:id/progress/:studentId
// Teachers and admins only — query any student's progress by URL param.
// Students are blocked (403) — they must use GET /:id/progress without param.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/progress/:studentId', protect, async (req, res) => {
  if (!['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  const { id, studentId } = req.params;
  if (!isValidUUID(id) || !isValidUUID(studentId)) {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT resources_completed, practice_completed, quiz_completed, completed_at, updated_at
       FROM subtopic_progress
       WHERE subtopic_id = :id AND student_id = :studentId`,
      { replacements: { id, studentId }, type: QueryTypes.SELECT }
    );

    const progress = rows.length > 0 ? rows[0] : {
      resources_completed: false,
      practice_completed:  false,
      quiz_completed:      false,
      completed_at:        null,
    };

    const tasksDone = [progress.resources_completed, progress.practice_completed, progress.quiz_completed]
      .filter(Boolean).length;
    const tasksRemaining = 3 - tasksDone;
    const completionPct  = Math.round((tasksDone / 3) * 100);

    return res.status(200).json({
      success: true,
      data: {
        ...progress,
        tasks_done:       tasksDone,
        tasks_remaining:  tasksRemaining,
        completion_pct:   completionPct,
        completion_label: `${completionPct}% Complete`,
        tasks_label:      `${tasksRemaining} task${tasksRemaining !== 1 ? 's' : ''} remaining`,
      },
    });
  } catch (err) {
    console.error(`[GET /subtopics/${id}/progress/${studentId}] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch subtopic progress' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/subtopics/:id/progress
// Mark a tab as complete for the logged-in student.
// Body: { task: 'resources' | 'practice' | 'quiz' }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/progress', protect, async (req, res) => {
  const { id } = req.params;
  const { task } = req.body;
  const studentId = req.user.id;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid subtopic ID' });
  }

  const validTasks = ['resources', 'practice', 'quiz'];
  if (!validTasks.includes(task)) {
    return res.status(400).json({ success: false, error: `task must be one of: ${validTasks.join(', ')}` });
  }

  const columnMap = {
    resources: 'resources_completed',
    practice:  'practice_completed',
    quiz:      'quiz_completed',
  };

  const column = columnMap[task];

  try {
    // Upsert progress record
    await sequelize.query(
      `INSERT INTO subtopic_progress (student_id, subtopic_id, ${column}, created_at, updated_at)
       VALUES (:studentId, :subtopicId, true, NOW(), NOW())
       ON CONFLICT (student_id, subtopic_id)
       DO UPDATE SET ${column} = true, updated_at = NOW()`,
      { replacements: { studentId, subtopicId: id }, type: QueryTypes.INSERT }
    );

    // Check if all three tasks are now complete
    const progress = await sequelize.query(
      `SELECT resources_completed, practice_completed, quiz_completed
       FROM subtopic_progress WHERE student_id = :studentId AND subtopic_id = :subtopicId`,
      { replacements: { studentId, subtopicId: id }, type: QueryTypes.SELECT }
    );

    const p = progress[0];
    const allDone = p.resources_completed && p.practice_completed && p.quiz_completed;

    // Mark fully completed if all done
    if (allDone) {
      await sequelize.query(
        `UPDATE subtopic_progress SET completed_at = NOW()
         WHERE student_id = :studentId AND subtopic_id = :subtopicId AND completed_at IS NULL`,
        { replacements: { studentId, subtopicId: id }, type: QueryTypes.UPDATE }
      );
    }

    const tasksDone = [p.resources_completed, p.practice_completed, p.quiz_completed]
      .filter(Boolean).length;

    return res.status(200).json({
      success: true,
      message: `${task} marked as complete`,
      data: {
        resources_completed: p.resources_completed,
        practice_completed:  p.practice_completed,
        quiz_completed:      p.quiz_completed,
        tasks_done:          tasksDone,
        tasks_remaining:     3 - tasksDone,
        completion_pct:      Math.round((tasksDone / 3) * 100),
        subtopic_fully_complete: allDone,
      },
    });
  } catch (err) {
    console.error(`[POST /subtopics/${id}/progress] Error:`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to update subtopic progress' });
  }
});

module.exports = router;
