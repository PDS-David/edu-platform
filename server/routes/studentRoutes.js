'use strict';
// server/routes/studentRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Student-specific endpoints:
//   POST /api/students/join-class          — join a class with join code
//   GET  /api/students/performance         — performance data for dashboard
//   POST /api/students/remediation         — generate targeted AI questions
//   GET  /api/students/remediation/status  — check if student has weak concepts
//   POST /api/students/test/:testId/submit — submit a teacher-assigned test
//   GET  /api/students/test/:testId        — get test details for StudentTestPage
// ─────────────────────────────────────────────────────────────────────────────

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');
const { ENROLLMENT_SOURCE, ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');

const UUID_REGEX  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

// Bug 1 fix: run_complete_migration.js's CREATE TABLE IF NOT EXISTS for
// student_subjects never defines status/enrollment_source (see
// database/patch_enrollment_status_columns.sql, which documents this gap
// but is not auto-applied anywhere). On any environment where that patch
// was never manually run against the live DB, every INSERT below 500s with
// "column status does not exist". Self-heal once per process, lazily, on
// first use — same pattern as ensureExtraColumns() in resourceRoutes.js.
// SUPABASE NOTE: Supabase transaction pooler (port 6543) does not support
// multi-statement queries. Each DDL statement must be a separate .query() call.
let _enrollmentColumnsEnsured = false;
const ensureEnrollmentColumns = async () => {
  if (_enrollmentColumnsEnsured) return;
  try {
    await sequelize.query(
      `ALTER TABLE student_subjects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved'`,
      { type: QueryTypes.RAW }
    );
    await sequelize.query(
      `ALTER TABLE student_subjects ADD COLUMN IF NOT EXISTS enrollment_source TEXT DEFAULT 'explicit'`,
      { type: QueryTypes.RAW }
    );
    await sequelize.query(
      `UPDATE student_subjects SET status = 'approved' WHERE status IS NULL`,
      { type: QueryTypes.RAW }
    );
    await sequelize.query(
      `UPDATE student_subjects SET enrollment_source = 'explicit' WHERE enrollment_source IS NULL`,
      { type: QueryTypes.RAW }
    );
    await sequelize.query(
      `ALTER TABLE student_exam_types ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved'`,
      { type: QueryTypes.RAW }
    );
    await sequelize.query(
      `UPDATE student_exam_types SET status = 'approved' WHERE status IS NULL`,
      { type: QueryTypes.RAW }
    );
    _enrollmentColumnsEnsured = true;
  } catch (err) {
    console.error('[ensureEnrollmentColumns]', err.message);
    // Don't set the flag — retry on the next call rather than caching a failure.
  }
};

// ── (removed) POST /api/students/join-class ───────────────────────────────────
// Join codes are no longer used. Teachers add students directly from the
// student picker in the Teacher Dashboard.

// ── GET /api/students/performance ─────────────────────────────────────────────
// Returns performance data for a student's subject (for My Performance tab)
router.get('/performance', protect, async (req, res) => {
  const { subject_id } = req.query;
  const studentId = req.user.id;

  try {
    const filters      = ['sp.student_id = :studentId'];
    const replacements = { studentId };

    if (subject_id && isValidUUID(subject_id)) {
      filters.push('st.subject_id = :subjectId');
      replacements.subjectId = subject_id;
    }

    const [subtopicPerf, studyTime] = await Promise.all([
      sequelize.query(
        `SELECT
           st.id, st.name,
           CASE WHEN sp.resources_completed AND sp.practice_completed AND sp.quiz_completed
                THEN 'complete' ELSE 'in_progress' END AS completion,
           COUNT(pa.id)::INTEGER  AS attempts,
           ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS score_avg,
           MAX(pa.attempted_at) AS last_attempt,
           CASE WHEN COUNT(pa.id) >= 2 AND
                     (SELECT ROUND(AVG(CASE WHEN pa2.is_correct THEN 100.0 ELSE 0 END),1)
                      FROM practice_attempts pa2
                      JOIN questions q2 ON q2.id = pa2.question_id
                      WHERE pa2.student_id = sp.student_id AND q2.subtopic_id = st.id
                      ORDER BY pa2.attempted_at DESC LIMIT 3) >
                     (SELECT ROUND(AVG(CASE WHEN pa3.is_correct THEN 100.0 ELSE 0 END),1)
                      FROM practice_attempts pa3
                      JOIN questions q3 ON q3.id = pa3.question_id
                      WHERE pa3.student_id = sp.student_id AND q3.subtopic_id = st.id
                      ORDER BY pa3.attempted_at ASC LIMIT 3)
                THEN 'up'
                ELSE 'down' END AS trend
         FROM subtopic_progress sp
         JOIN subtopics st ON sp.subtopic_id = st.id
         LEFT JOIN practice_attempts pa ON pa.student_id = sp.student_id
           AND pa.question_id IN (SELECT id FROM questions WHERE subtopic_id = st.id)
         WHERE ${filters.join(' AND ')}
         GROUP BY st.id, st.name, sp.resources_completed, sp.practice_completed, sp.quiz_completed, sp.student_id
         ORDER BY score_avg ASC NULLS LAST`,
        { replacements, type: QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT COALESCE(SUM(time_taken_seconds), 0)::BIGINT AS total_ms
         FROM practice_attempts
         WHERE student_id = :studentId
           AND attempted_at > NOW() - INTERVAL '30 days'`,
        { replacements: { studentId }, type: QueryTypes.SELECT }
      ),
    ]);

    const totalSecs  = parseInt(studyTime[0]?.total_ms || 0);
    const perfMins   = Math.floor(totalSecs / 60);
    const perfSecs   = totalSecs % 60;

    const strengthRows = subtopicPerf.filter(r => (r.score_avg || 0) >= 60).slice(0, 5);
    const weaknessRows = subtopicPerf.filter(r => (r.score_avg || 100) < 60).slice(0, 5);

    return res.status(200).json({
      success: true,
      data: {
        strength_rows: strengthRows,
        weakness_rows: weaknessRows,
        perf_mins:     perfMins,
        perf_secs:     perfSecs,
        study_dates:   [], // Placeholder — expand if needed
      },
    });
  } catch (err) {
    console.error('[GET /students/performance]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/students/remediation ───────────────────────────────────────────
// Generates targeted AI practice questions for the student's weak concepts.
// POLICY: AI-generated questions must be approved in the Question Review
// Queue before a student can see them (quiz or practice). This route queues
// new questions for review and returns only counts/metadata — it must NOT
// return question_text/options/explanation, since that would hand the
// student unreviewed AI content directly in the response body regardless of
// what status was written to the DB.
router.post('/remediation', protect, async (req, res) => {
  try {
    const { generateRemediationSet } = require('../services/remediationService');
    const result = await generateRemediationSet(req.user.id);

    const conceptSets = (result.conceptSets || []).map(set => ({
      concept_id:      set.concept_id,
      concept_name:    set.concept_name,
      mastery_score:   set.mastery_score,
      difficulty:      set.difficulty,
      questions_count: set.questions_count,
      // question_text/options/explanation intentionally omitted — those
      // questions are status = 'pending' and await admin approval.
    }));

    const totalQueued = conceptSets.reduce((sum, s) => sum + (s.questions_count || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        studentId:          result.studentId,
        weak_concept_count: result.weak_concept_count ?? conceptSets.length,
        message: result.message
          || (totalQueued > 0
                ? `${totalQueued} practice question(s) generated and queued for admin review. They'll appear in your practice sessions once approved.`
                : 'No new questions were generated.'),
        conceptSets,
        total_questions_queued: totalQueued,
      },
    });
  } catch (err) {
    console.error('[POST /students/remediation]', err.message);
    return res.status(500).json({
      success: false,
      error:   'Failed to generate remediation set: ' + err.message,
    });
  }
});

// ── GET /api/students/remediation/status ─────────────────────────────────────
// Returns whether student has weak concepts without generating questions.
router.get('/remediation/status', protect, async (req, res) => {
  try {
    const { getWeakConcepts } = require('../services/weakConceptService');
    const weakConcepts = await getWeakConcepts(req.user.id);
    return res.status(200).json({
      success:            true,
      has_weak_concepts:  weakConcepts.length > 0,
      weak_concept_count: weakConcepts.length,
      concepts:           weakConcepts.map(c => ({
        id:            c.id,
        name:          c.name,
        mastery_score: c.mastery_score,
      })),
    });
  } catch (err) {
    console.error('[GET /students/remediation/status]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/students/my-tests ───────────────────────────────────────────────
// Lists all tests assigned to the current student (direct or via class).
router.get('/my-tests', protect, async (req, res) => {
  const studentId = req.user.id;
  try {
    const rows = await sequelize.query(
      `SELECT
          ta.id                                                          AS assignment_id,
          ct.id                                                          AS test_id,
          ct.title,
          ct.description,
          ct.time_limit_minutes,
          ct.created_at,
          ta.assigned_at,
          ta.due_date,
          ta.completed_at,
          ta.score,
          COALESCE(u.first_name || ' ' || u.last_name, 'Your Teacher') AS teacher_name,
          s.name                                                         AS subject_name
       FROM test_assignments ta
       JOIN custom_tests ct ON ct.id = ta.test_id
       LEFT JOIN users u ON u.id = ct.created_by
       LEFT JOIN subjects s ON s.id = ct.subject_id
       WHERE ta.student_id = :studentId
          OR ta.class_id IN (
               SELECT class_id FROM class_memberships WHERE student_id = :studentId
             )
       ORDER BY ta.assigned_at DESC LIMIT 50`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /student/my-tests]', err.message);
    return res.json({ success: true, data: [] });
  }
});

// ── GET /api/students/test/:testId ───────────────────────────────────────────
// Returns test details + questions for StudentTestPage.jsx
router.get('/test/:testId', protect, async (req, res) => {
  const { testId } = req.params;
  if (!isValidUUID(testId)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID' });
  }
  try {
    const tests = await sequelize.query(
      `SELECT ct.id, ct.title, ct.duration_minutes, ct.total_marks,
              u.first_name || ' ' || u.last_name AS teacher_name
       FROM custom_tests ct
       JOIN users u ON u.id = ct.teacher_id
       WHERE ct.id = :testId AND ct.is_published = true`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );
    if (!tests.length) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }
    const test = tests[0];

    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.marks, q.difficulty,
              tq.question_order,
              q.options
       FROM test_questions tq
       JOIN questions q ON q.id = tq.question_id
       WHERE tq.test_id = :testId
       ORDER BY tq.question_order ASC`,
      { replacements: { testId }, type: QueryTypes.SELECT }
    );

    return res.status(200).json({
      success: true,
      data: { ...test, questions },
    });
  } catch (err) {
    console.error(`[GET /students/test/${testId}]`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/students/test/:testId/submit ───────────────────────────────────
// Submits a student's test answers.
// Body: { answers: [{ question_id, selected_option_id }], total_time_ms }
router.post('/test/:testId/submit', protect, async (req, res) => {
  const { testId } = req.params;
  if (!isValidUUID(testId)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID' });
  }

  const { answers = [], total_time_ms = 0 } = req.body;
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ success: false, error: 'answers array is required' });
  }

  try {
    // Resolve correct options for all questions
    const questionIds = answers.map(a => a.question_id).filter(Boolean);
    // Use correct_answer from questions table (JSONB options approach)
    const questionRows = await sequelize.query(
      `SELECT id, correct_answer FROM questions WHERE id::text = ANY(ARRAY[:questionIds]::text[])`,
      { replacements: { questionIds }, type: QueryTypes.SELECT }
    );
    const correctMap = {};
    for (const r of questionRows) {
      correctMap[r.id] = String(r.correct_answer || '');
    }

    let correct = 0;
    const total  = answers.length;

    for (const answer of answers) {
      const isCorrect = answer.selected_answer !== undefined
        ? String(answer.selected_answer).trim().toLowerCase() === (correctMap[answer.question_id] || '').trim().toLowerCase()
        : answer.selected_option_id
        ? String(answer.selected_option_id) === correctMap[answer.question_id]
        : false;
      if (isCorrect) correct++;

      // Record practice attempt
      sequelize.query(
        // BUG FIX: created_at/updated_at are NOT NULL with no value
        // supplied here — same root cause confirmed via live production
        // logs in quizzes.js's POST /attempt. Identical insert shape, was
        // almost certainly failing silently the same way.
        `INSERT INTO practice_attempts (student_id, question_id, is_correct, time_taken_seconds, attempted_at, created_at, updated_at)
         VALUES (:studentId, :questionId, :isCorrect, :timeTaken, NOW(), NOW(), NOW())`,
        {
          replacements: {
            studentId:  req.user.id,
            questionId: answer.question_id,
            isCorrect:  isCorrect,
            timeTaken:  Math.round((answer.time_taken_ms || 0) / 1000),
          },
          type: QueryTypes.INSERT,
        }
      ).catch(() => {});
    }

    const accuracyPct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Mark test assignment as completed
    sequelize.query(
      `UPDATE test_assignments SET completed_at = NOW(), score = :score
       WHERE test_id = :testId AND student_id = :studentId`,
      { replacements: { score: correct, testId, studentId: req.user.id }, type: QueryTypes.UPDATE }
    ).catch(() => {});

    return res.status(200).json({
      success:      true,
      correct,
      total,
      accuracy_pct: accuracyPct,
    });
  } catch (err) {
    console.error(`[POST /students/test/${testId}/submit]`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.ensureEnrollmentColumns = ensureEnrollmentColumns;

// =============================================================================
// STUDENT SUBJECT MANAGEMENT
// Tracks which subjects a student has individually selected/enrolled in.
// Separate from student_exam_types (which tracks exam board access).
// =============================================================================

// ── GET /api/students/my-boards ───────────────────────────────────────────────
// Returns the exam boards the student selected during registration/onboarding.
// Used by StudentDashboard to show only relevant boards in the dropdown.
router.get('/my-boards', protect, async (req, res) => {
  try {
    // First try student_exam_types (set during onboarding/payment)
    let boards = await sequelize.query(
      `SELECT eb.id, eb.code, eb.name, eb.icon_emoji
       FROM student_exam_types set2
       JOIN exam_boards eb ON eb.id = set2.exam_board_id
       WHERE set2.student_id = :studentId AND set2.status = :approvedStatus
       ORDER BY eb.name`,
      { replacements: { studentId: req.user.id, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.SELECT }
    );

    // Fallback: use pending_exam_board_ids if student hasn't completed onboarding yet
    if (boards.length === 0) {
      boards = await sequelize.query(
        `SELECT eb.id, eb.code, eb.name, eb.icon_emoji
         FROM users u
         JOIN exam_boards eb ON eb.id = ANY(u.pending_exam_board_ids)
         WHERE u.id = :studentId`,
        { replacements: { studentId: req.user.id }, type: QueryTypes.SELECT }
      ).catch(() => []);
    }

    return res.status(200).json({ success: true, data: boards });
  } catch (err) {
    console.error('[GET /students/my-boards]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/students/my-subjects ─────────────────────────────────────────────
// Returns all subjects the student has selected (own selections + class-assigned).
router.get('/my-subjects', protect, async (req, res) => {
  const studentId = req.user.id;
  try {
    // 1. Student's own selected subjects
    let ownSubjects = [];
    try {
      ownSubjects = await sequelize.query(
        `SELECT DISTINCT
           s.id, s.name, s.code, s.level, s.icon_emoji, s.is_active,
           eb.code  AS exam_board_code,
           eb.name  AS exam_board_name,
           eb.id    AS exam_board_id,
           'own'    AS source
         FROM student_subjects ss
         JOIN subjects  s  ON s.id  = ss.subject_id
         JOIN exam_boards eb ON eb.id = s.exam_board_id
         WHERE ss.student_id = :studentId AND ss.status = :approvedStatus AND s.is_active = true
         ORDER BY s.name`,
        { replacements: { studentId, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.SELECT }
      );
    } catch (e) {
      // student_subjects table may not exist yet — handled by migration below
      ownSubjects = [];
    }

    // 2. Subjects assigned to the student's class(es)
    let classSubjects = [];
    try {
      classSubjects = await sequelize.query(
        `SELECT DISTINCT
           s.id, s.name, s.code, s.level, s.icon_emoji, s.is_active,
           eb.code    AS exam_board_code,
           eb.name    AS exam_board_name,
           eb.id      AS exam_board_id,
           'class'    AS source,
           c.name     AS class_name
         FROM class_memberships cm
         JOIN classes          c   ON c.id   = cm.class_id
         JOIN class_subjects   cs  ON cs.class_id = c.id
         JOIN subjects         s   ON s.id   = cs.subject_id
         JOIN exam_boards      eb  ON eb.id  = s.exam_board_id
         WHERE cm.student_id = :studentId AND s.is_active = true
         ORDER BY s.name`,
        { replacements: { studentId }, type: QueryTypes.SELECT }
      );
    } catch (e) {
      // class_subjects table may not exist — graceful fallback
      classSubjects = [];
    }

    // Merge, deduplicating by subject ID (own selection wins over class)
    const merged = new Map();
    [...ownSubjects, ...classSubjects].forEach(s => {
      if (!merged.has(s.id)) merged.set(s.id, s);
    });

    let result = [...merged.values()];

    // REMOVED: auto-enroll-all fallback that was enrolling students in every
    // subject on the platform when their student_subjects rows were missing or
    // had the wrong status. This caused any student with enrollment issues to
    // see the entire subject catalog as "their" subjects.
    // Correct behaviour: return empty array — onboarding handles initial enrollment.

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error('[GET /students/my-subjects]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/students/subjects ───────────────────────────────────────────────
// Add a subject to the student's selected subjects.
// Body: { subject_id: <integer> }
router.post('/subjects', protect, async (req, res) => {
  const studentId = req.user.id;
  const { subject_id } = req.body;
  if (!subject_id) {
    return res.status(400).json({ success: false, error: 'subject_id is required' });
  }
  try {
    // Self-heal status/enrollment_source columns if they're missing on this
    // environment's student_subjects/student_exam_types tables (Bug 1).
    await ensureEnrollmentColumns();

    // ── S1: Subject limit enforcement ──────────────────────────────────────
    // WAEC / NECO   → max 9 subjects
    // JAMB / UTME   → max 4 subjects
    // JUPEB         → max 4 subjects
    // All others    → no limit (null)
    const SUBJECT_LIMITS = {
      JAMB:  4,
      WAEC:  9,
      NECO:  9,
      JUPEB: 4,
    };

    // Get the exam board code for this subject
    const boardInfo = await sequelize.query(
      `SELECT eb.code, eb.name, s.id AS subject_id
       FROM subjects s
       JOIN exam_boards eb ON eb.id::text = s.exam_board_id::text
       WHERE s.id = :subjectId AND s.is_active = true`,
      { replacements: { subjectId: parseInt(subject_id) }, type: QueryTypes.SELECT }
    );

    if (boardInfo.length > 0) {
      const boardCode = (boardInfo[0].code || '').toUpperCase();
      const limit = SUBJECT_LIMITS[boardCode] ?? null;

      if (limit !== null) {
        // Count how many active subjects this student already has in this board
        const countRows = await sequelize.query(
          `SELECT COUNT(*) AS cnt
           FROM student_subjects ss
           JOIN subjects s ON s.id = ss.subject_id
           JOIN exam_boards eb ON eb.id::text = s.exam_board_id::text
           WHERE ss.student_id = :studentId
             AND ss.status     = :approvedStatus
             AND ss.is_active  = true
             AND UPPER(eb.code) = :boardCode`,
          {
            replacements: {
              studentId,
              approvedStatus: ENROLLMENT_STATUS.APPROVED,
              boardCode,
            },
            type: QueryTypes.SELECT,
          }
        );

        const current = parseInt(countRows[0]?.cnt ?? 0);
        if (current >= limit) {
          return res.status(400).json({
            success: false,
            error: `You can only enrol in ${limit} subjects for ${boardInfo[0].name}. You have reached your limit.`,
            code: 'SUBJECT_LIMIT_REACHED',
            limit,
            current,
          });
        }
      }
    }
    // ── end S1 ──────────────────────────────────────────────────────────────

    await sequelize.query(
      `INSERT INTO student_subjects (student_id, subject_id, is_active, status, enrollment_source)
       VALUES (:studentId, :subjectId, true, :approvedStatus, :enrollmentSource)
       ON CONFLICT (student_id, subject_id) DO UPDATE
         SET is_active         = true,
             status            = :approvedStatus,
             enrollment_source = COALESCE(student_subjects.enrollment_source, :enrollmentSource)`,
      { replacements: { studentId, subjectId: parseInt(subject_id), enrollmentSource: ENROLLMENT_SOURCE.EXPLICIT, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.INSERT }
    );

    // Also ensure the board is in student_exam_types
    const boardRows = await sequelize.query(
      `SELECT exam_board_id FROM subjects WHERE id = :subjectId AND is_active = true`,
      { replacements: { subjectId: parseInt(subject_id) }, type: QueryTypes.SELECT }
    );
    if (boardRows[0]?.exam_board_id) {
      await sequelize.query(
        // exam_board_id in student_exam_types is INTEGER (exam_boards.id is INTEGER).
        // Do NOT cast to ::uuid — that crashes with "invalid input syntax for type uuid".
        `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
         VALUES (:studentId, :boardId, true, :approvedStatus)
         ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true, status = :approvedStatus`,
        { replacements: { studentId, boardId: parseInt(boardRows[0].exam_board_id), approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.INSERT }
      );
    }

    return res.status(200).json({ success: true, message: 'Subject added' });
  } catch (err) {
    console.error('[POST /students/subjects]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/students/subjects/:subjectId ──────────────────────────────────
// Remove a subject from the student's selected subjects.
router.delete('/subjects/:subjectId', protect, async (req, res) => {
  const studentId = req.user.id;
  const subjectId = parseInt(req.params.subjectId);
  if (!subjectId) {
    return res.status(400).json({ success: false, error: 'Invalid subject ID' });
  }
  try {
    await sequelize.query(
      `UPDATE student_subjects SET is_active = false, status = :deactivatedStatus
       WHERE student_id = :studentId AND subject_id = :subjectId`,
      { replacements: { studentId, subjectId, deactivatedStatus: ENROLLMENT_STATUS.DEACTIVATED }, type: QueryTypes.UPDATE }
    );
    return res.status(200).json({ success: true, message: 'Subject removed' });
  } catch (err) {
    console.error('[DELETE /students/subjects/:subjectId]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});
