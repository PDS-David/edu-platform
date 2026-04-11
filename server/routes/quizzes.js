// server/routes/quizzes.js
// AI Buddy-style quiz endpoints for the AISchoolonair.
// Endpoints:
//   GET  /api/quizzes/attempt-count         → total attempts for a subtopic (public stat)
//   POST /api/quizzes/attempt               → submit a completed quiz attempt
//   GET  /api/quizzes/attempt/:attemptId    → get attempt results with AI marking
//   GET  /api/quizzes/history/:studentId/:subtopicId → past attempts list
//   GET  /api/quizzes/history               → logged-in student's past attempts (query param)
//   GET  /api/quizzes                       → placeholder (kept for compatibility)
//
// ADDED (Task 4):
//   After each answer is processed, the related concepts are looked up via
//   question_concepts and student_concept_mastery is updated dynamically:
//     Correct → mastery_score += 0.1   (clamped to 1.0)
//     Wrong   → mastery_score -= 0.05  (clamped to 0.0)
//   Attempts counter is incremented on every answer.
//
// ADDED (Task 10):
//   GET /api/quizzes/history (query-param version) — consumed by QuizHistoryPage.
//   BUG 4 FIX: COALESCE(qa.percentage, qa.accuracy_pct, 0) handles both column name variants.

'use strict';

const express   = require('express');
const router    = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect } = require('../middleware/auth');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(v) { return UUID_REGEX.test(v); }

// XP middleware (fire-and-forget)
let awardXP = () => {};
try { awardXP = require('../middleware/xpMiddleware').awardXP; } catch { /* not yet installed */ }

// Lazy-load AI service so server starts even if GEMINI_API_KEY is not yet set
function getAI() {
  return require('../services/aiService');
}

// ---------------------------------------------------------------------------
// updateConceptMastery (Task 4 helper)
// Finds all concepts tagged to a question and updates mastery scores.
// Runs fire-and-forget style from within the attempt loop — errors are
// swallowed so they never break the quiz submission response.
// ---------------------------------------------------------------------------
async function updateConceptMastery(questionId, isCorrect, studentId) {
  try {
    // 1. Find all concepts linked to this question
    const conceptRows = await sequelize.query(
      `SELECT concept_id FROM question_concepts WHERE question_id = :questionId`,
      { replacements: { questionId }, type: QueryTypes.SELECT }
    );

    if (!conceptRows.length) return; // question has no concept tags — skip

    const delta = isCorrect ? 0.1 : -0.05;

    for (const { concept_id } of conceptRows) {
      // Upsert mastery record, then clamp to [0, 1] and increment attempts.
      // PostgreSQL LEAST/GREATEST handle the clamping atomically.
      await sequelize.query(
        `INSERT INTO student_concept_mastery
           (id, student_id, concept_id, mastery_score, attempts, correct,
            last_practiced, created_at, updated_at)
         VALUES
           (gen_random_uuid(), :studentId, :conceptId,
            GREATEST(0, LEAST(1, 0.5 + :delta)),  -- start at 0.5 on first insert
            1,
            CASE WHEN :isCorrect THEN 1 ELSE 0 END,
            NOW(), NOW(), NOW())
         ON CONFLICT (student_id, concept_id) DO UPDATE
           SET mastery_score  = GREATEST(0, LEAST(1, student_concept_mastery.mastery_score + :delta)),
               attempts       = student_concept_mastery.attempts + 1,
               correct        = student_concept_mastery.correct
                                + CASE WHEN :isCorrect THEN 1 ELSE 0 END,
               last_practiced = NOW(),
               updated_at     = NOW()`,
        {
          replacements: {
            studentId,
            conceptId:  concept_id,
            delta,
            isCorrect: isCorrect === true, // boolean
          },
          type: QueryTypes.INSERT,
        }
      );
    }
  } catch (err) {
    // Non-fatal — log and continue
    console.warn(`[quizzes] updateConceptMastery failed for question ${questionId}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// GET /api/quizzes/attempt-count
// Returns total quiz attempts for a subtopic — shown as "Total Attempts: 1800+"
// Query param: subtopic_id
// ---------------------------------------------------------------------------
router.get('/attempt-count', protect, async (req, res) => {
  const { subtopic_id } = req.query;
  if (!subtopic_id || !isValidUUID(subtopic_id)) {
    return res.status(400).json({ success: false, error: 'subtopic_id is required' });
  }
  try {
    const rows = await sequelize.query(
      `SELECT COUNT(*)::INTEGER AS total FROM subtopic_quiz_attempts WHERE subtopic_id = :subtopicId`,
      { replacements: { subtopicId: subtopic_id }, type: QueryTypes.SELECT }
    );
    const total = rows[0].total;
    const label = total >= 1000
      ? `${Math.floor(total / 100) * 100}+`
      : `${total}`;
    return res.status(200).json({ success: true, data: { total, label } });
  } catch (err) {
    console.error('[GET /quizzes/attempt-count] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch attempt count' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/quizzes/attempt
// Submit a completed quiz. Server validates MCQ answers, calculates score,
// saves attempt + per-question answers, updates concept mastery, returns results.
// Body:
// {
//   subtopic_id: UUID,
//   subject_id:  UUID,
//   paper_type:  'all' | 'paper1' | 'structured',
//   total_time_ms: INTEGER,
//   answers: [
//     {
//       question_id:        UUID,
//       selected_option_id: UUID | null,   // for MCQ
//       typed_answer:       string | null, // for structured/smart_answers
//       time_taken_ms:      INTEGER
//     }
//   ]
// }
// ---------------------------------------------------------------------------
router.post('/attempt', protect, async (req, res) => {
  const { subtopic_id, subject_id, paper_type = 'all', total_time_ms, answers } = req.body;
  const studentId = req.user.id;

  // subtopic_id is required for regular quizzes but null/absent for mock exams
  if (subtopic_id && !isValidUUID(subtopic_id)) {
    return res.status(400).json({ success: false, error: 'subtopic_id must be a valid UUID' });
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ success: false, error: 'answers array is required' });
  }

  try {
    let totalScore = 0;
    let maxScore   = 0;
    const answersWithResults = [];

    // ── Batch-fetch all questions and options (eliminates N+1 queries) ──────
    const validAnswers = answers.filter(a => a.question_id && isValidUUID(a.question_id));
    const questionIds  = validAnswers.map(a => a.question_id);

    // ONE query for all questions
    const questionRows = await sequelize.query(
      `SELECT id, question_text, question_type, question_sub_type, marks, explanation, topic, difficulty
       FROM questions WHERE id = ANY(:ids) AND status = 'approved'`,
      { replacements: { ids: questionIds }, type: QueryTypes.SELECT }
    );

    // ONE query for all answer options
    const optionRows = await sequelize.query(
      `SELECT id, question_id, option_text, is_correct FROM answer_options
       WHERE question_id = ANY(:ids)`,
      { replacements: { ids: questionIds }, type: QueryTypes.SELECT }
    );

    // Build in-memory maps keyed by ID
    const questionMap = Object.fromEntries(questionRows.map(q => [q.id, q]));
    const optionsMap  = optionRows.reduce((acc, o) => {
      if (!acc[o.question_id]) acc[o.question_id] = [];
      acc[o.question_id].push(o);
      return acc;
    }, {});

    // ── Process each answer using in-memory maps (zero DB calls in loop) ───
    const masteryUpdates = []; // collect [{ questionId, isCorrect }] for batch after insert

    for (const answer of validAnswers) {
      const { question_id, selected_option_id, typed_answer, time_taken_ms } = answer;
      const question = questionMap[question_id];
      if (!question) continue;

      const markValue = question.marks || 1;
      maxScore += markValue;

      let isCorrect    = null;
      let marksAwarded = 0;

      if (selected_option_id && isValidUUID(selected_option_id)) {
        // MCQ — validate against in-memory options map
        const opts       = optionsMap[question_id] || [];
        const matchedOpt = opts.find(o => o.id === selected_option_id);
        if (matchedOpt) {
          isCorrect    = matchedOpt.is_correct;
          marksAwarded = isCorrect ? markValue : 0;
          if (isCorrect) totalScore += markValue;
        }
      }
      // Structured/typed answers: isCorrect = null (AI will mark later)

      answersWithResults.push({
        question_id,
        question_text:     question.question_text,
        question_sub_type: question.question_sub_type,
        topic:             question.topic,
        difficulty:        question.difficulty,
        marks:             markValue,
        selected_option_id: selected_option_id || null,
        typed_answer:      typed_answer || null,
        is_correct:        isCorrect,
        marks_awarded:     marksAwarded,
        time_taken_ms:     time_taken_ms || null,
        explanation:       question.explanation || null,
      });

      // Queue concept mastery updates for MCQ answers only (isCorrect is boolean)
      if (isCorrect !== null) {
        masteryUpdates.push({ questionId: question_id, isCorrect });
      }
    }

    // ── Calculate accuracy ─────────────────────────────────────────────────
    const accuracyPct = maxScore > 0
      ? parseFloat(((totalScore / maxScore) * 100).toFixed(2))
      : 0;

    // ── Get exam_board_id from subtopic (skip for mock exams) ─────────────
    let examBoardId = null;
    if (subtopic_id) {
      const subtopicRows = await sequelize.query(
        `SELECT exam_board_id FROM subtopics WHERE id = :subtopicId`,
        { replacements: { subtopicId: subtopic_id }, type: QueryTypes.SELECT }
      );
      examBoardId = subtopicRows[0]?.exam_board_id || null;
    }

    // ── Insert quiz attempt ────────────────────────────────────────────────
    const attemptResult = await sequelize.query(
      `INSERT INTO subtopic_quiz_attempts
         (student_id, subtopic_id, subject_id, exam_board_id, paper_type,
          total_score, max_score, accuracy_pct, time_taken_ms, completed_at, created_at)
       VALUES (:studentId, :subtopicId, :subjectId, :examBoardId, :paperType,
               :totalScore, :maxScore, :accuracyPct, :timeTakenMs, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          studentId,
          subtopicId:  subtopic_id,
          subjectId:   subject_id || null,
          examBoardId,
          paperType:   paper_type,
          totalScore,
          maxScore,
          accuracyPct,
          timeTakenMs: total_time_ms || null,
        },
        type: QueryTypes.SELECT,
      }
    );
    const attemptId = attemptResult[0].id;

    // ── Insert per-question answers ────────────────────────────────────────
    for (const a of answersWithResults) {
      await sequelize.query(
        `INSERT INTO subtopic_quiz_answers
           (attempt_id, question_id, selected_option_id, typed_answer,
            is_correct, marks_awarded, max_marks, time_taken_ms, created_at)
         VALUES (:attemptId, :questionId, :selectedOptionId, :typedAnswer,
                 :isCorrect, :marksAwarded, :maxMarks, :timeTakenMs, NOW())`,
        {
          replacements: {
            attemptId,
            questionId:       a.question_id,
            selectedOptionId: a.selected_option_id,
            typedAnswer:      a.typed_answer,
            isCorrect:        a.is_correct,
            marksAwarded:     a.marks_awarded,
            maxMarks:         a.marks,
            timeTakenMs:      a.time_taken_ms,
          },
          type: QueryTypes.INSERT,
        }
      );
    }

    // ── (Task 4) Update concept mastery for each MCQ answer — non-blocking ─
    // Fire-and-forget: mastery updates run after the response is sent.
    // Errors inside updateConceptMastery are caught internally.
    setImmediate(async () => {
      for (const { questionId, isCorrect } of masteryUpdates) {
        await updateConceptMastery(questionId, isCorrect, studentId);
      }
    });

    // ── Attach correct options from in-memory map (no extra DB calls) ──────
    for (const a of answersWithResults) {
      const opts = optionsMap[a.question_id] || [];
      a.correct_options = opts
        .filter(o => o.is_correct)
        .map(o => ({ id: o.id, option_text: o.option_text }));
    }

    // Award XP for completing quiz (non-blocking)
    setImmediate(() => awardXP(studentId, 'quiz_completed').catch(() => {}));

    // ── Mark quiz tab complete in subtopic_progress ────────────────────────
    if (subtopic_id) {
      try {
        await sequelize.query(
          `INSERT INTO subtopic_progress (student_id, subtopic_id, quiz_completed, updated_at)
           VALUES (:studentId, :subtopicId, true, NOW())
           ON CONFLICT (student_id, subtopic_id)
           DO UPDATE SET quiz_completed = true, updated_at = NOW()`,
          { replacements: { studentId, subtopicId: subtopic_id }, type: QueryTypes.INSERT }
        );
        // Check if all three tasks complete → set completed_at
        const prog = await sequelize.query(
          `SELECT resources_completed, practice_completed, quiz_completed
           FROM subtopic_progress WHERE student_id = :studentId AND subtopic_id = :subtopicId`,
          { replacements: { studentId, subtopicId: subtopic_id }, type: QueryTypes.SELECT }
        );
        const p = prog[0];
        if (p && p.resources_completed && p.practice_completed && p.quiz_completed) {
          await sequelize.query(
            `UPDATE subtopic_progress SET completed_at = NOW()
             WHERE student_id = :studentId AND subtopic_id = :subtopicId AND completed_at IS NULL`,
            { replacements: { studentId, subtopicId: subtopic_id }, type: QueryTypes.UPDATE }
          );
        }
      } catch (progErr) {
        console.warn('[quiz attempt] subtopic_progress update failed:', progErr.message);
        // Non-fatal — don't block the response
      }
    }

    return res.status(201).json({
      success:      true,
      attempt_id:   attemptId,
      total_score:  totalScore,
      max_score:    maxScore,
      accuracy_pct: accuracyPct,
      time_taken_ms: total_time_ms || null,
      answers_with_results: answersWithResults,
    });
  } catch (err) {
    console.error('[POST /quizzes/attempt] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save quiz attempt' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/quizzes/attempt/:attemptId
// Returns full attempt results with AI-generated Detailed Marking Scheme.
// This is the heavy endpoint — calls Gemini for each question.
// ---------------------------------------------------------------------------
router.get('/attempt/:attemptId', protect, async (req, res) => {
  const { attemptId } = req.params;
  if (!isValidUUID(attemptId)) {
    return res.status(400).json({ success: false, error: 'Invalid attempt ID' });
  }
  try {
    // Fetch attempt header
    const attempts = await sequelize.query(
      `SELECT sqa.*, st.name AS subtopic_name, s.name AS subject_name, eb.name AS exam_board_name
       FROM subtopic_quiz_attempts sqa
       LEFT JOIN subtopics   st ON sqa.subtopic_id   = st.id
       LEFT JOIN subjects    s  ON sqa.subject_id    = s.id
       LEFT JOIN exam_boards eb ON sqa.exam_board_id = eb.id
       WHERE sqa.id = :attemptId`,
      { replacements: { attemptId }, type: QueryTypes.SELECT }
    );
    if (!attempts.length) {
      return res.status(404).json({ success: false, error: 'Attempt not found' });
    }
    const attempt = attempts[0];

    // Students can only view their own attempts
    if (req.user.role === 'student' && attempt.student_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Fetch per-question answers
    const answers = await sequelize.query(
      `SELECT
         sqa.*,
         q.question_text,
         q.topic,
         q.difficulty,
         q.explanation,
         ao_selected.option_text  AS selected_option_text,
         eb.name                  AS exam_board_name,
         s.name                   AS subject_name,
         st.name                  AS subtopic_name
       FROM subtopic_quiz_answers sqa
       JOIN questions q                ON q.id  = sqa.question_id
       LEFT JOIN answer_options ao_selected ON ao_selected.id = sqa.selected_option_id
       LEFT JOIN subtopic_quiz_attempts att ON att.id = sqa.attempt_id
       LEFT JOIN exam_boards eb        ON eb.id = att.exam_board_id
       LEFT JOIN subjects s            ON s.id  = att.subject_id
       LEFT JOIN subtopics st          ON st.id = att.subtopic_id
       WHERE sqa.attempt_id = :attemptId
       ORDER BY sqa.created_at ASC`,
      { replacements: { attemptId }, type: QueryTypes.SELECT }
    );

    // ── Generate AI Detailed Marking Scheme for each answer ────────────────
    const ai = getAI();

    function withTimeout(promise, ms = 8000) {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), ms)),
      ]);
    }

    const enrichedSettled = await Promise.allSettled(
      answers.map(async (ans) => {
        let markingScheme = ans.ai_marking_scheme;
        let aiExplanation = ans.ai_explanation;

        // Only generate if not already stored
        if (!markingScheme && ans.selected_option_id) {
          try {
            const correctOpts = await sequelize.query(
              `SELECT option_text FROM answer_options WHERE question_id = :qId AND is_correct = true LIMIT 1`,
              { replacements: { qId: ans.question_id }, type: QueryTypes.SELECT }
            );
            const allOpts = await sequelize.query(
              `SELECT id, option_text, is_correct FROM answer_options WHERE question_id = :qId ORDER BY id`,
              { replacements: { qId: ans.question_id }, type: QueryTypes.SELECT }
            );

            markingScheme = await withTimeout(ai.generateMarkingScheme({
              questionText:       ans.question_text,
              correctOptionText:  correctOpts[0]?.option_text || '',
              selectedOptionText: ans.selected_option_text || '',
              wasCorrect:         ans.is_correct,
              marksAwarded:       ans.marks_awarded,
              maxMarks:           ans.max_marks,
              topic:              ans.topic,
              examBoard:          attempt.exam_board_name,
            }));

            aiExplanation = await withTimeout(ai.generateExplanation({
              questionText:       ans.question_text,
              options:            allOpts,
              correctOptionText:  correctOpts[0]?.option_text || '',
              selectedOptionText: ans.selected_option_text || '',
              wasCorrect:         ans.is_correct,
              existingExplanation: ans.explanation,
              topic:              ans.topic,
              examBoard:          attempt.exam_board_name,
            }));

            // Store back to DB so next request is instant
            await sequelize.query(
              `UPDATE subtopic_quiz_answers
               SET ai_explanation = :aiExplanation, ai_marking_scheme = :markingScheme::jsonb
               WHERE id = :id`,
              {
                replacements: {
                  aiExplanation,
                  markingScheme: JSON.stringify(markingScheme),
                  id: ans.id,
                },
                type: QueryTypes.UPDATE,
              }
            );
          } catch (aiErr) {
            console.warn(`[AI Marking] Failed for answer ${ans.id}:`, aiErr.message);
            // Continue without AI — show static explanation
          }
        }

        // Fetch correct options for display
        const correctOptions = await sequelize.query(
          `SELECT id, option_text FROM answer_options WHERE question_id = :qId AND is_correct = true`,
          { replacements: { qId: ans.question_id }, type: QueryTypes.SELECT }
        );

        return {
          ...ans,
          correct_options:   correctOptions,
          ai_explanation:    aiExplanation || ans.explanation || null,
          ai_marking_scheme: markingScheme || null,
        };
      })
    );

    // Flatten — use fulfilled value, fallback gracefully on rejection
    const enrichedAnswers = enrichedSettled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { ...answers[i], ai_marking_scheme: null, ai_explanation: answers[i].explanation || null }
    );

    return res.status(200).json({
      success: true,
      data: {
        attempt,
        answers: enrichedAnswers,
      },
    });
  } catch (err) {
    console.error('[GET /quizzes/attempt/:attemptId] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch attempt results' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/quizzes/history/:studentId/:subtopicId
// Returns past quiz attempts for a student on a specific subtopic.
// NOTE: this path-param route must be registered BEFORE the query-param /history
// ---------------------------------------------------------------------------
router.get('/history/:studentId/:subtopicId', protect, async (req, res) => {
  const { studentId, subtopicId } = req.params;

  // Students can only view their own history
  if (req.user.role === 'student' && req.user.id !== studentId) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  if (!isValidUUID(studentId) || !isValidUUID(subtopicId)) {
    return res.status(400).json({ success: false, error: 'Invalid ID format' });
  }

  try {
    const rows = await sequelize.query(
      `SELECT
         id, total_score, max_score, accuracy_pct,
         time_taken_ms, paper_type, completed_at, created_at
       FROM subtopic_quiz_attempts
       WHERE student_id  = :studentId
         AND subtopic_id = :subtopicId
       ORDER BY completed_at DESC
       LIMIT 20`,
      { replacements: { studentId, subtopicId }, type: QueryTypes.SELECT }
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('[GET /quizzes/history] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch quiz history' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/quizzes/history?subtopic_id=UUID   (Task 10 — consumed by QuizHistoryPage)
// Returns the logged-in student's past quiz attempts, optionally filtered by subtopic.
// BUG 4 FIX: COALESCE handles both `percentage` and `accuracy_pct` column name variants
//            depending on which migration was run on the target DB.
// ---------------------------------------------------------------------------
router.get('/history', protect, async (req, res) => {
  const { subtopic_id } = req.query;
  const studentId = req.user.id;

  const filters      = ['qa.student_id = :studentId'];
  const replacements = { studentId };

  if (subtopic_id) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(subtopic_id)) {
      return res.status(400).json({ success: false, error: 'Invalid subtopic_id' });
    }
    filters.push('qa.subtopic_id = :subtopicId');
    replacements.subtopicId = subtopic_id;
  }

  try {
    const attempts = await sequelize.query(
      `SELECT
         qa.id,
         qa.score,
         qa.total_marks,
         COALESCE(qa.percentage, qa.accuracy_pct, 0) AS accuracy_pct,
         qa.total_time_ms,
         qa.created_at,
         qa.subtopic_id,
         st.name AS subtopic_name
       FROM quiz_attempts qa
       LEFT JOIN subtopics st ON st.id = qa.subtopic_id
       WHERE ${filters.join(' AND ')}
       ORDER BY qa.created_at DESC
       LIMIT 30`,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.status(200).json({ success: true, data: attempts });
  } catch (err) {
    console.error('[GET /quizzes/history]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch quiz history' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/quizzes   (placeholder — kept for compatibility)
// ---------------------------------------------------------------------------
router.get('/', protect, async (_req, res) => {
  return res.status(200).json({
    success: true,
    data: [],
    message: 'Use /api/quizzes/attempt-count or /api/quizzes/attempt',
  });
});

module.exports = router;
