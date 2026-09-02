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
const { generate, buildEssayFeedbackPrompt } = require('../services/ai');
const { ENROLLMENT_SOURCE, ENROLLMENT_STATUS } = require('../constants/enrollmentConstants');

const UUID_REGEX  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (v) => UUID_REGEX.test(v);

// Every route below previously had only `protect` (valid JWT, any role) —
// no role check at all. Confirmed live: a school_admin's own token got a
// real 200 from GET /my-subjects, and every other route here would have
// behaved identically for teacher, school_admin, or App Admin tokens alike.
// That's the exact "closed door" gap this file needs: a tenant school_admin
// (or a teacher) must never be able to act as a student via these
// endpoints, even against their own account. `admin` (platform App Admin)
// is intentionally still allowed, mirroring teacherRoutes.js's teacherOnly
// pattern, for support/debugging parity across both role-restricted files.
//
// NOTE: this is purely a role check. Tenant-school service-scope gating
// (enable_aischoolonair/enable_em) is handled globally by protect() in
// middleware/auth.js as of 2e8f923 — not duplicated here.
const studentOnly = (req, res, next) => {
  if (!['student', 'admin'].includes(req.user?.role))
    return res.status(403).json({ success: false, error: 'Student access required' });
  next();
};

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
router.get('/performance', protect, studentOnly, async (req, res) => {
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
router.post('/remediation', protect, studentOnly, async (req, res) => {
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
router.get('/remediation/status', protect, studentOnly, async (req, res) => {
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
router.get('/my-tests', protect, studentOnly, async (req, res) => {
  const studentId = req.user.id;
  try {
    const rows = await sequelize.query(
      `SELECT
          ta.id                                                          AS assignment_id,
          ct.id                                                          AS test_id,
          ct.title,
          ct.duration_minutes                                            AS time_limit_minutes,
          ct.created_at,
          ta.assigned_at,
          ta.due_date,
          ta.completed_at,
          ta.score,
          COALESCE(u.first_name || ' ' || u.last_name, 'Your Teacher') AS teacher_name,
          s.name                                                         AS subject_name
       FROM test_assignments ta
       JOIN custom_tests ct ON ct.id = ta.test_id
       LEFT JOIN users u ON u.id = ct.teacher_id  -- fix: column is teacher_id not created_by
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
    // BUG FIX (assigned-tests-not-appearing): this query used to select
    // ct.description and ct.time_limit_minutes — neither column exists on
    // custom_tests (it's ct.duration_minutes, and there is no description
    // column at all). That meant this query threw a real SQL error on
    // EVERY call, which this catch block silently converted into an empty
    // { data: [] } response — a student whose teacher had genuinely
    // assigned them a test just saw "No tests assigned yet" with no error
    // anywhere to reveal what was actually wrong. Logging is kept here as a
    // safety net for any other future schema drift, but the actual fix is
    // the corrected column list above.
    console.error('[GET /student/my-tests]', err.message);
    return res.status(500).json({ success: false, error: 'Could not load your assigned tests.' });
  }
});

// ── GET /api/students/test/:testId ───────────────────────────────────────────
// Returns test details + questions for StudentTestPage.jsx
router.get('/test/:testId', protect, studentOnly, async (req, res) => {
  const { testId } = req.params;
  if (!isValidUUID(testId)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID' });
  }
  try {
    // Security fix: verify the requesting student is actually assigned this
    // test (directly or via class) before returning any content.
    const assigned = await sequelize.query(
      `SELECT 1 FROM test_assignments ta
       WHERE ta.test_id = :testId
         AND (
           ta.student_id = :studentId
           OR ta.class_id IN (
             SELECT class_id FROM class_memberships
             WHERE student_id = :studentId
           )
         )
       LIMIT 1`,
      { replacements: { testId, studentId: req.user.id }, type: QueryTypes.SELECT }
    );
    if (!assigned.length) {
      return res.status(403).json({ success: false, error: 'This test has not been assigned to you.' });
    }

    const tests = await sequelize.query(
      `SELECT ct.id, ct.title, ct.duration_minutes AS time_limit_minutes, ct.total_marks,
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

    // BUG FIX: this SELECT never returned q.type, so the frontend
    // (StudentTestPage.jsx) had no way to know a question was 'structured'
    // or 'essay' rather than 'mcq' — it always rendered q.options?.map(...)
    // as clickable buttons, which is empty for free-text question types, so
    // a student assigned a test containing one had no way to answer it at
    // all. Also switched the `marks` field to tq.marks_allocated (the
    // per-test weight a teacher actually set via POST
    // /teacher/tests/:id/questions) instead of the question bank's default
    // q.marks, so the "N marks available" hint students see matches what
    // they're actually scored out of.
    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.type, q.difficulty,
              tq.question_order,
              tq.marks_allocated AS marks,
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
// Body: { answers: [{ question_id, selected_answer | selected_option_id | essay_response }], total_time_ms }
//
// BUG FIX (marking overhaul): this handler previously graded every question —
// regardless of type — by comparing the submitted value as a raw string
// against the questions.correct_answer column, and scored the test as a flat
// "N correct out of N questions" count.
//
// That had three real, user-facing effects:
//   1. MCQ drift: correct_answer and options[].option_text are stored
//      independently and can differ in wording/punctuation (especially for
//      AI-generated questions). When they drift, every option — including
//      the one flagged is_correct: true — compares false against
//      correct_answer, so the student is marked wrong no matter what they
//      picked. quizzes.js and questionsRoutes.js both already fix this by
//      grading against options[].is_correct; this endpoint never got the
//      same fix.
//   2. No marks weighting: teachers can set marks_allocated per question via
//      POST /teacher/tests/:id/questions, and custom_tests has its own
//      total_marks/passing_marks — none of that was used. Every question
//      counted as exactly 1 mark regardless of what the teacher configured.
//   3. structured/essay questions: teachers can attach any question type
//      (including 'structured' and 'essay') from the bank to a test via
//      POST /teacher/tests/:id/questions — nothing filters by type there.
//      But this handler only ever read selected_answer/selected_option_id,
//      never essay_response, and had no branch for free-text types at all —
//      so any structured/essay question on an assigned test silently scored
//      0 with no feedback, regardless of what the student wrote.
//
// Fix: fetch each question's type/options/marks_allocated via test_questions,
// grade mcq/true_false/short_answer against options[].is_correct (falling
// back to correct_answer text only when no usable options exist — same
// precedence as questionsRoutes.js), route essay AND structured answers
// through the same AI marking used for essay elsewhere (services/ai.js,
// task 'essay-mark') since an assigned test needs an actual mark rather than
// the self-assessment treatment structured gets in ad-hoc practice mode, and
// weight the total by marks_allocated instead of a flat per-question count.
router.post('/test/:testId/submit', protect, studentOnly, async (req, res) => {
  const { testId } = req.params;
  if (!isValidUUID(testId)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID' });
  }

  const { answers = [], total_time_ms = 0 } = req.body;
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ success: false, error: 'answers array is required' });
  }

  const normalize = (s) =>
    String(s ?? '')
      .replace(/[\u2018\u2019\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201F]/g, '"')
      .replace(/[\u00A0\u2007\u202F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  try {
    const questionIds = answers.map(a => a.question_id).filter(Boolean);

    // Pull type/options/marks_allocated together — marks_allocated lives on
    // test_questions (per-test weighting), everything else on questions.
    const questionRows = await sequelize.query(
      `SELECT q.id, q.question_text, q.correct_answer, q.options, q.type, q.explanation,
              tq.marks_allocated
       FROM test_questions tq
       JOIN questions q ON q.id = tq.question_id
       WHERE tq.test_id = :testId AND q.id::text = ANY(ARRAY[:questionIds]::text[])`,
      { replacements: { testId, questionIds }, type: QueryTypes.SELECT }
    );
    const questionMap = {};
    for (const r of questionRows) questionMap[String(r.id)] = r;

    let totalScore = 0;
    let maxScore   = 0;
    const results  = [];

    for (const answer of answers) {
      const question = questionMap[String(answer.question_id)];
      if (!question) continue; // question not actually on this test — skip

      const markValue = question.marks_allocated || 1;
      maxScore += markValue;

      const submittedAnswer = answer.selected_answer ?? answer.selected_option_id ?? '';
      const essayText       = (answer.essay_response ?? (question.type !== 'mcq' && question.type !== 'true_false' ? submittedAnswer : '')) || '';

      let isCorrect    = false;
      let marksAwarded = 0;
      let feedback     = null;

      if (question.type === 'essay' || question.type === 'structured' || question.type === 'short_answer') {
        // Assigned tests need an actual mark (unlike ad-hoc practice mode,
        // where 'structured'/'short_answer' were previously left as
        // self-assessment or plain text-match) — route all three through
        // the same AI marking essay questions already use elsewhere,
        // scaled to this test's marks_allocated. short_answer in
        // particular benefits from this: a short factual answer phrased
        // differently from the stored correct_answer text (e.g. "Because
        // wants exceed resources" vs "resources are limited") would fail a
        // literal text-match despite being substantively correct — AI
        // marking judges the content, not the exact wording.
        if (process.env.GEMINI_API_KEY && essayText.trim()) {
          try {
            // Shared prompt (services/ai.js) — personalized, paragraph-style
            // feedback instead of an unstructured one-line generic response.
            const prompt = buildEssayFeedbackPrompt({
              studentName:   req.user?.first_name || null,
              questionText:  question.question_text,
              maxMarks:      markValue,
              modelAnswer:   question.correct_answer,
              studentAnswer: essayText.trim(),
            });
            const raw    = await generate(prompt, 'essay-mark');
            const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
            marksAwarded = Math.min(Math.max(parsed.marks_awarded || 0, 0), markValue);
            isCorrect    = parsed.is_correct ?? (marksAwarded >= markValue * 0.5);
            feedback     = parsed.feedback || null;
          } catch (aiErr) {
            console.error(`[POST /students/test/${testId}/submit] AI marking failed:`, aiErr.message);
            feedback = 'Submitted for manual review — automated marking was unavailable.';
          }
        } else if (!essayText.trim()) {
          feedback = 'No answer submitted.';
        } else {
          feedback = 'Submitted for manual review.';
        }
      } else {
        // mcq / true_false / short_answer — grade against options[].is_correct
        // first (authoritative, set at question creation/review time); only
        // fall back to a raw correct_answer text comparison when there's no
        // usable options array to grade against.
        let opts = question.options;
        if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = null; } }
        const usableOpts = Array.isArray(opts)
          ? opts.filter(o => o && typeof o === 'object' && o.option_text)
          : [];

        if (usableOpts.length > 0) {
          const matchedOpt = usableOpts.find(o => normalize(o.option_text) === normalize(submittedAnswer));
          if (matchedOpt && typeof matchedOpt.is_correct === 'boolean') {
            isCorrect = matchedOpt.is_correct;
          } else {
            isCorrect = normalize(submittedAnswer) === normalize(question.correct_answer);
          }
        } else {
          isCorrect = normalize(submittedAnswer) === normalize(question.correct_answer);
        }
        marksAwarded = isCorrect ? markValue : 0;
      }

      totalScore += marksAwarded;

      results.push({
        question_id:    answer.question_id,
        is_correct:     isCorrect,
        marks_awarded:  marksAwarded,
        max_marks:      markValue,
        feedback,
      });

      // Record practice attempt (non-blocking)
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
            isCorrect:  !!isCorrect,
            timeTaken:  Math.round((answer.time_taken_ms || 0) / 1000),
          },
          type: QueryTypes.INSERT,
        }
      ).catch(() => {});
    }

    const accuracyPct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    // Mark test assignment as completed — score now holds weighted marks
    // (out of maxScore/total_marks), not a flat correct-question count.
    sequelize.query(
      `UPDATE test_assignments SET completed_at = NOW(), score = :score
       WHERE test_id = :testId AND student_id = :studentId`,
      { replacements: { score: totalScore, testId, studentId: req.user.id }, type: QueryTypes.UPDATE }
    ).catch(() => {});

    return res.status(200).json({
      success:      true,
      correct:      results.filter(r => r.is_correct).length,
      total:        results.length,
      total_score:  totalScore,
      max_score:    maxScore,
      accuracy_pct: accuracyPct,
      answers:      results,
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

// ── POST /api/students/exam-types/:examTypeId/join ───────────────────────────
// O1: explicit "Join this exam board" action, separate from subject
// enrolment. POST /subjects already upserts student_exam_types as a side
// effect of picking a subject, but there was no way to formally join a
// board (e.g. Cambridge) without first picking a specific subject under it.
// Reuses the exact same student_exam_types upsert as POST /subjects so both
// paths produce identical board-membership state.
router.post('/exam-types/:examTypeId/join', protect, studentOnly, async (req, res) => {
  // Phase 3 follow-up: this route upserts student_exam_types directly and was
  // missed by the original self-service lockdown (only POST /subjects and its
  // frontend caller were closed). Same guard/message as those routes.
  if (req.user?.role === 'student') {
    return res.status(403).json({
      success: false,
      error: 'Your exam type and subjects are managed by your school or app administrator',
    });
  }
  const studentId  = req.user.id;
  const examTypeId = parseInt(req.params.examTypeId);
  if (!examTypeId) {
    return res.status(400).json({ success: false, error: 'Invalid exam type id' });
  }
  try {
    await ensureEnrollmentColumns();

    const boardRows = await sequelize.query(
      `SELECT id, name FROM exam_boards WHERE id = :examTypeId AND is_active = true`,
      { replacements: { examTypeId }, type: QueryTypes.SELECT }
    );
    if (boardRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Exam type not found' });
    }

    await sequelize.query(
      // exam_board_id in student_exam_types is INTEGER (exam_boards.id is INTEGER).
      // Do NOT cast to ::uuid — that crashes with "invalid input syntax for type uuid".
      `INSERT INTO student_exam_types (student_id, exam_board_id, is_active, status)
       VALUES (:studentId, :boardId, true, :approvedStatus)
       ON CONFLICT (student_id, exam_board_id) DO UPDATE SET is_active = true, status = :approvedStatus`,
      { replacements: { studentId, boardId: examTypeId, approvedStatus: ENROLLMENT_STATUS.APPROVED }, type: QueryTypes.INSERT }
    );

    return res.status(200).json({ success: true, message: `Joined ${boardRows[0].name}` });
  } catch (err) {
    console.error('[POST /students/exam-types/:examTypeId/join]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/students/my-boards ───────────────────────────────────────────────
// Returns the exam boards the student selected during registration/onboarding.
// Used by StudentDashboard to show only relevant boards in the dropdown.
router.get('/my-boards', protect, studentOnly, async (req, res) => {
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
router.get('/my-subjects', protect, studentOnly, async (req, res) => {
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
router.post('/subjects', protect, studentOnly, async (req, res) => {
  // Phase 3 Step 4: self-service lockdown. Exam type / subject enrollment is
  // now managed by the student's school or App Admin (see
  // POST /api/schools/students/:studentId/assign-exam-type). Route handler
  // is left in place (not deleted) so rollback is a one-line revert.
  if (req.user?.role === 'student') {
    return res.status(403).json({
      success: false,
      error: 'Your exam type and subjects are managed by your school or app administrator',
    });
  }
  const studentId = req.user.id;
  const { subject_id } = req.body;
  if (!subject_id) {
    return res.status(400).json({ success: false, error: 'subject_id is required' });
  }
  try {
    // Self-heal status/enrollment_source columns if they're missing on this
    // environment's student_subjects/student_exam_types tables (Bug 1).
    await ensureEnrollmentColumns();

    // ── S1 / Phase 3 Step 2: Subject limit enforcement ───────────────────────
    // Limit now lives on exam_boards.max_subjects / requires_all_subjects
    // (migration_008_exam_board_limits.sql) instead of a hardcoded object
    // here — this is a genuine replacement, not a parallel path, so the two
    // can never drift apart again. Changing max_subjects in the database
    // takes effect immediately, no deploy required.
    const boardInfo = await sequelize.query(
      `SELECT eb.code, eb.name, eb.max_subjects, eb.requires_all_subjects, s.id AS subject_id
       FROM subjects s
       JOIN exam_boards eb ON eb.id::text = s.exam_board_id::text
       WHERE s.id = :subjectId AND s.is_active = true`,
      { replacements: { subjectId: parseInt(subject_id) }, type: QueryTypes.SELECT }
    );

    if (boardInfo.length > 0) {
      const boardCode = (boardInfo[0].code || '').toUpperCase();
      // requires_all_subjects boards (IELTS/TOEFL/SAT) have no per-subject
      // cap here — the client pre-selects every subject for those boards
      // (see OnboardingPage.jsx), so this endpoint's per-add limit doesn't
      // apply to them.
      const limit = boardInfo[0].requires_all_subjects ? null : boardInfo[0].max_subjects;

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
router.delete('/subjects/:subjectId', protect, studentOnly, async (req, res) => {
  // Phase 3 Step 4: same self-service lockdown as POST /subjects above.
  if (req.user?.role === 'student') {
    return res.status(403).json({
      success: false,
      error: 'Your exam type and subjects are managed by your school or app administrator',
    });
  }
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
