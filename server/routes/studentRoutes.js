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
// Returns { conceptSets: [{ concept_name, mastery_score, questions: [...] }] }
router.post('/remediation', protect, async (req, res) => {
  try {
    const { generateRemediationSet } = require('../services/remediationService');
    const result = await generateRemediationSet(req.user.id);
    return res.status(200).json({ success: true, data: result });
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
        `INSERT INTO practice_attempts (student_id, question_id, is_correct, time_taken_seconds, attempted_at)
         VALUES (:studentId, :questionId, :isCorrect, :timeTaken, NOW())`,
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
         JOIN exam_boards eb ON eb.id::text = s.exam_board_id::text
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
         JOIN exam_boards      eb  ON eb.id::text = s.exam_board_id::text
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

    // If student has no subjects at all, auto-enroll them in all active seeded subjects
    // (subjects that have at least one topic) so they see content immediately
    if (result.length === 0) {
      try {
        // Table is guaranteed to exist via run_enrollment_approval_migration.js

        // Enroll in subjects that have topics
        await sequelize.query(
          `INSERT INTO student_subjects (student_id, subject_id, is_active, status, enrollment_source)
           SELECT :studentId, s.id, true, :approvedStatus, :autoEnrolledSource
           FROM subjects s
           WHERE s.is_active = true
             AND EXISTS (SELECT 1 FROM topics t WHERE t.subject_id = s.id)
           ON CONFLICT (student_id, subject_id) DO NOTHING`,
          { replacements: { studentId, approvedStatus: ENROLLMENT_STATUS.APPROVED, autoEnrolledSource: ENROLLMENT_SOURCE.AUTO_ENROLLED }, type: QueryTypes.INSERT }
        );

        // Re-fetch
        ownSubjects = await sequelize.query(
          `SELECT DISTINCT
             s.id, s.name, s.code, s.level, s.icon_emoji, s.is_active,
             eb.code  AS exam_board_code,
             eb.name  AS exam_board_name,
             eb.id    AS exam_board_id,
             'own'    AS source
           FROM student_subjects ss
           JOIN subjects   s  ON s.id  = ss.subject_id
           JOIN exam_boards eb ON eb.id::text = s.exam_board_id::text
           WHERE ss.student_id = :studentId AND ss.status = :approvedStatus AND s.is_active = true
           ORDER BY s.name`,
          { replacements: { studentId, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.SELECT }
        );
        result = ownSubjects;
      } catch (e) {
        // Non-fatal — return empty list
      }
    }

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
    // Table is guaranteed to exist via run_enrollment_approval_migration.js
    await sequelize.query(
      `INSERT INTO student_subjects (student_id, subject_id, is_active, status, enrollment_source)
       VALUES (:studentId, :subjectId, true, :approvedStatus, :enrollmentSource)
       ON CONFLICT (student_id, subject_id) DO UPDATE
         SET is_active         = true,
             status            = :approvedStatus,
             enrollment_source = COALESCE(student_subjects.enrollment_source, :enrollmentSource)`,
      { replacements: { studentId, subjectId: parseInt(subject_id), enrollmentSource: ENROLLMENT_SOURCE.EXPLICIT, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.INSERT }
    );

    // Also ensure the board is in student_exam_types.
    // Wrapped separately: if subjects.exam_board_id and
    // student_exam_types.exam_board_id are out of sync on type (see DEF-011 /
    // database/patch_subjects_exam_board_id_type.sql), this secondary sync
    // should not fail the primary subject-add operation above.
    try {
      const boardRows = await sequelize.query(
        `SELECT exam_board_id FROM subjects WHERE id = :subjectId AND is_active = true`,
        { replacements: { subjectId: parseInt(subject_id) }, type: QueryTypes.SELECT }
      );
      if (boardRows[0]?.exam_board_id) {
        await sequelize.query(
          `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
           VALUES (:studentId, :boardId, true, :approvedStatus)
           ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true, status = :approvedStatus`,
          { replacements: { studentId, boardId: boardRows[0].exam_board_id, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.INSERT }
        );
      }
    } catch (syncErr) {
      console.error('[POST /students/subjects] exam-type sync skipped:', syncErr.message);
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
