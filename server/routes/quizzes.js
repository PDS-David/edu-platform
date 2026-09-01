'use strict';
// server/routes/quizzes.js
// Uses actual schema: questions.options (JSONB), questions.correct_answer (TEXT),
// practice_attempts (student_id, question_id, is_correct, time_taken_seconds)
// Quiz history stored in practice_attempts (no separate quiz_attempts table needed)

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');
const { generate, buildEssayFeedbackPrompt } = require('../services/ai');

let awardXP = () => {};
try { awardXP = require('../middleware/xpMiddleware').awardXP; } catch {}

// ── buildExaminerFeedback ─────────────────────────────────────────────────
// BUG FIX: examiner_recommendation used to be one of three hardcoded
// sentences picked purely by accuracy_pct bucket (>=70 / >=50 / below) —
// not personalized to the student, not aware of which questions they
// actually missed, and not AI-generated despite the field name implying it
// was. Now generates real, personalized feedback via the same central
// Gemini hub used elsewhere (services/ai.js), addressed to the student by
// name, in flowing prose paragraphs — same register as the working
// personalized-feedback prompt in routes/aiRoutes.js's POST /ai/explain.
// Falls back to the original bucketed sentence if Gemini isn't configured
// or the call fails, so results never fail to return.
async function buildExaminerFeedback({ studentName, accuracyPct, topicName, missedQuestions, totalQuestions }) {
  const fallback = accuracyPct >= 70
    ? 'Excellent performance! You are well prepared for this topic.'
    : accuracyPct >= 50
    ? 'Good effort. Review the questions you missed and try again.'
    : 'Keep practising. Focus on the explanations for incorrect answers.';

  if (!process.env.GEMINI_API_KEY) return fallback;

  try {
    const missedList = (missedQuestions || []).slice(0, 5)
      .map(q => `- ${q}`)
      .join('\n');

    const prompt = `You are a warm, encouraging Nigerian exam tutor (WAEC/JAMB/NECO standard), giving a student their overall result on a quiz they just completed${studentName ? ` — their name is ${studentName}` : ''}.

Topic: ${topicName || 'this topic'}
Score: ${accuracyPct}% (${totalQuestions ? `out of ${totalQuestions} questions` : ''})
Questions they got wrong:
${missedList || '(none — they got everything right)'}

Write feedback as natural, flowing prose addressed directly to the student — use "you"${studentName ? ` and open with their name (${studentName})` : ''}, never "the student". Structure it as two to three short paragraphs, each separated by a blank line:
1. Open by acknowledging their overall performance honestly and specifically — mention the score.
2. If they missed questions, name the general concepts they should revisit based on the questions listed above (don't just say "review your mistakes" — be specific about what to study). Skip this paragraph if they got everything right.
3. End with one encouraging, concrete next step.

Do not use markdown formatting of any kind — no asterisks, no numbered lists, no headers. Write in plain, complete sentences only. Keep the whole response under 120 words and keep a warm, encouraging tutor tone throughout.`;

    const feedback = await generate(prompt, 'remediation');
    return feedback?.trim() || fallback;
  } catch (err) {
    console.error('[buildExaminerFeedback]', err.message);
    return fallback;
  }
}

// ── GET /api/quizzes/attempt-count ───────────────────────────────────────────
router.get('/attempt-count', protect, async (req, res) => {
  const { subtopic_id } = req.query;
  if (!subtopic_id) return res.status(400).json({ success: false, error: 'subtopic_id required' });
  try {
    const rows = await sequelize.query(
      `SELECT COUNT(DISTINCT pa.student_id)::INTEGER AS total
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE q.subtopic_id = :subtopicId`,
      { replacements: { subtopicId: subtopic_id }, type: QueryTypes.SELECT }
    );
    const total = rows[0]?.total || 0;
    return res.json({ success: true, data: { total, label: total >= 1000 ? `${Math.floor(total/100)*100}+` : `${total}` } });
  } catch (err) {
    // BEFORE: any failure here (bad column, DB blip) silently returned
    // {success:true, data:{total:0}} with zero logging — indistinguishable
    // from "nobody has attempted this yet", and invisible in server logs.
    console.error('[GET /quizzes/attempt-count]', err.message);
    return res.status(500).json({ success: false, error: 'Could not load attempt count' });
  }
});

// ── POST /api/quizzes/attempt ─────────────────────────────────────────────────
// Body: { subtopic_id, answers: [...] } for a single-subtopic quiz, OR
//       { subject_id,  answers: [...] } for a subject-wide mock exam.
// Exactly one of subtopic_id / subject_id must be supplied.
router.post('/attempt', protect, async (req, res) => {
  const { subtopic_id, subject_id, paper_type, total_time_ms, answers = [] } = req.body;

  // BUG FIX: this previously required subtopic_id unconditionally, but
  // MockExamPage.jsx legitimately has no single subtopic to report — a mock
  // exam spans an entire subject — and was always sending subtopic_id: null
  // with subject_id set instead. Every mock exam submission failed with
  // 400 "subtopic_id and answers required". Now accepts either.
  if ((!subtopic_id && !subject_id) || !answers.length) {
    return res.status(400).json({
      success: false,
      error: 'Either subtopic_id or subject_id, plus answers, are required',
    });
  }

  // Enrollment check: resolve to the real subject_id server-side (never
  // trust a client-supplied subject_id paired with a subtopic_id — a
  // mismatched pair could otherwise be used to bypass the check) and
  // verify the student is actually enrolled in that subject before any
  // question is scored or any attempt is recorded.
  if (req.user.role === 'student') {
    let resolvedSubjectId = null;

    if (subtopic_id) {
      // Single-subtopic quiz: resolve subtopic_id -> subject_id ourselves.
      const subjectRows = await sequelize.query(
        `SELECT t.subject_id
           FROM subtopics st
           JOIN topics t ON t.id = st.topic_id
          WHERE st.id = :subtopicId
          LIMIT 1`,
        { replacements: { subtopicId: subtopic_id }, type: QueryTypes.SELECT }
      ).catch(() => []);
      resolvedSubjectId = subjectRows[0]?.subject_id;
    } else {
      // Mock exam: no subtopic to resolve through — subject_id IS the
      // entitlement scope. Still verify it's a real, active subject rather
      // than trusting an arbitrary client-supplied value outright.
      const subjectRows = await sequelize.query(
        `SELECT id FROM subjects WHERE id = :subjectId AND is_active = true LIMIT 1`,
        { replacements: { subjectId: subject_id }, type: QueryTypes.SELECT }
      ).catch(() => []);
      resolvedSubjectId = subjectRows[0]?.id;
    }

    if (resolvedSubjectId) {
      const enrolled = await sequelize.query(
        `SELECT 1 FROM student_subjects
          WHERE student_id = :studentId AND subject_id = :subjectId AND is_active = true
          LIMIT 1`,
        { replacements: { studentId: req.user.id, subjectId: resolvedSubjectId }, type: QueryTypes.SELECT }
      ).catch(() => []);

      if (!enrolled.length) {
        return res.status(403).json({
          success: false,
          error: 'You are not enrolled in this subject. Add it from your Subjects page first.',
          code: 'NOT_ENROLLED',
        });
      }
    }
    // If neither path resolves to a real subject (orphaned/malformed catalog
    // data, or a genuinely invalid subject_id), fail open here rather than
    // block an attempt for a data-integrity issue unrelated to enrollment —
    // that's a separate problem the catalog data itself should surface, not
    // something this entitlement check should mask as "not enrolled."
  }

  try {
    const questionIds = answers.map(a => a.question_id).filter(Boolean);
    if (!questionIds.length) return res.status(400).json({ success: false, error: 'No valid question IDs' });

    // Fetch questions — questions.id is UUID, use TEXT cast for ANY()
    // SECURITY: default changed 'approved' → 'pending' (fail safe, not fail
    // open) — same rationale as GET /questions/random. A question with no
    // status set must never be silently treated as gradeable/approved.
    const questionRows = await sequelize.query(
      `SELECT id, question_text, marks, explanation, correct_answer, options, type
       FROM questions WHERE id::text = ANY(ARRAY[:ids]::text[]) AND is_active = true
         AND COALESCE(status, 'pending') IN ('approved', 'active')`,
      { replacements: { ids: questionIds.map(String) }, type: QueryTypes.SELECT }
    );
    const questionMap = Object.fromEntries(questionRows.map(q => [String(q.id), q]));

    // BUG FIX: if every submitted question fails this lookup (e.g. the
    // questions became unapproved/inactive between being served and being
    // submitted — a narrow but real race, or stale client-side question data),
    // the loop below silently scores nothing, no practice_attempts row is
    // written, attempt_id resolves to null, and the student lands on a
    // generic "Could not load results" screen with no indication why. Fail
    // loudly here instead so the real cause is visible in server logs and
    // the student gets an explanation rather than a dead end.
    if (questionRows.length === 0) {
      console.error(
        `[POST /quizzes/attempt] All ${questionIds.length} submitted question(s) ` +
        `were not found/approved/active. subtopic_id=${subtopic_id} student=${req.user.id}`
      );
      return res.status(409).json({
        success: false,
        error: 'These questions are no longer available. Please refresh and start a new quiz.',
        code: 'QUESTIONS_UNAVAILABLE',
      });
    }

    let totalScore = 0;
    let maxScore   = 0;
    const results  = [];

    // Session ID groups all practice_attempts from this one submission
    // so history queries can reconstruct per-session totals.
    const { randomUUID } = require('crypto');
    const sessionId = randomUUID();

    for (const answer of answers) {
      const question = questionMap[String(answer.question_id)];
      if (!question) continue;

      const markValue  = question.marks || 1;

      // Accept selected_answer (option text) OR selected_option_id (also option text in JSONB schema)
      const submittedAnswer = answer.selected_answer ?? answer.selected_option_id ?? '';
      const normalizeAnswer = (s) =>
        String(s ?? '')
          .replace(/[\u2018\u2019\u201B]/g, "'")
          .replace(/[\u201C\u201D\u201F]/g, '"')
          .replace(/[\u00A0\u2007\u202F]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      // FIX (reverses the design note below): structured questions used to
      // intentionally skip grading — is_correct stayed null, no AI call was
      // made, and the question was excluded from maxScore/totalScore so it
      // couldn't affect accuracy_pct. That design is now reversed: they're
      // graded through the exact same AI-marking path essay-type questions
      // use elsewhere in this app (buildEssayFeedbackPrompt + generate(),
      // both in services/ai.js — see questionsRoutes.js's POST /:id/answer
      // and studentRoutes.js's POST /test/:testId/submit for the same
      // pattern), and now DO count toward the quiz's score like every other
      // graded question type.
      if (question.type === 'structured') {
        const answerText = (answer.essay_response ?? submittedAnswer ?? '').toString();

        maxScore += markValue;

        let isCorrect    = false;
        let marksAwarded = 0;
        let feedback     = null;

        if (process.env.GEMINI_API_KEY && answerText.trim()) {
          try {
            const prompt = buildEssayFeedbackPrompt({
              studentName:   req.user?.first_name || null,
              questionText:  question.question_text,
              maxMarks:      markValue,
              modelAnswer:   question.correct_answer,
              studentAnswer: answerText.trim(),
            });
            const raw    = await generate(prompt, 'essay-mark');
            const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
            marksAwarded = Math.min(Math.max(parsed.marks_awarded || 0, 0), markValue);
            isCorrect    = parsed.is_correct ?? (marksAwarded >= markValue * 0.5);
            feedback     = parsed.feedback || null;
          } catch (err) {
            console.error('[POST /quizzes/attempt] structured AI marking failed:', err.message);
            feedback = question.explanation || 'Submitted for review — automated marking was unavailable.';
          }
        } else if (!answerText.trim()) {
          feedback = 'No answer submitted.';
        } else {
          feedback = question.explanation || 'Submitted for review.';
        }

        totalScore += marksAwarded;

        results.push({
          question_id:          answer.question_id,
          question_text:        question.question_text,
          selected_option_text: answerText || null,
          correct_answer:       question.correct_answer,
          correct_options:      [],
          is_correct:           isCorrect,
          marks_awarded:        marksAwarded,
          max_marks:            markValue,
          model_answer:         question.correct_answer || null,
          explanation:          feedback || question.explanation || 'Compare your answer with the model answer above.',
          ai_explanation:       feedback || question.explanation || '',
          ai_marking_scheme:    feedback ? { status: isCorrect ? 'correct' : 'incorrect', whyExplanation: feedback, markingPoints: [] } : {},
          options:              question.options,
        });

        await sequelize.query(
          `INSERT INTO practice_attempts
             (student_id, question_id, is_correct, time_taken_seconds, attempted_at, created_at, updated_at, selected_option_text, paper_type, subject_id, session_id)
           VALUES (:studentId, :questionId, :isCorrect, :timeTaken, NOW(), NOW(), NOW(), :selectedText, :paperType, :subjectId, :sessionId)`,
          {
            replacements: {
              studentId:    req.user.id,
              questionId:   answer.question_id,
              isCorrect,
              timeTaken:    parseInt(answer.time_taken_seconds ?? (answer.time_taken_ms / 1000)) || 0,
              selectedText: answerText || null,
              paperType:    paper_type || 'quiz',
              subjectId:    subject_id || null,
              sessionId:    sessionId,
            },
            type: QueryTypes.INSERT,
          }
        ).catch((err) => {
          console.error('[POST /quizzes/attempt] practice_attempts insert failed:', err.message);
        });

        continue;
      }

      maxScore += markValue;

      // Resolve options array up front so grading can use it
      let qOpts = question.options;
      if (typeof qOpts === 'string') { try { qOpts = JSON.parse(qOpts); } catch { qOpts = []; } }
      qOpts = Array.isArray(qOpts) ? qOpts.filter(o => o && typeof o === 'object' && o.option_text) : [];

      // BUG FIX (grading-always-wrong): grade against options[].is_correct,
      // the flag set deliberately at question creation/review time, instead
      // of re-deriving correctness from a separately-stored correct_answer
      // text field. correct_answer and option_text are stored independently
      // and can drift (different wording/punctuation, especially for
      // AI-generated questions) — when they do, every option compares false
      // against correct_answer, including the one already flagged correct,
      // so the student is marked wrong regardless of selection. Falls back
      // to the original text comparison only when no usable options exist
      // on this question.
      let isCorrect;
      const matchedOpt = qOpts.find(o => normalizeAnswer(o.option_text) === normalizeAnswer(submittedAnswer));
      if (matchedOpt) {
        isCorrect = !!matchedOpt.is_correct;
      } else {
        isCorrect = normalizeAnswer(submittedAnswer) === normalizeAnswer(question.correct_answer);
      }
      const marks     = isCorrect ? markValue : 0;
      totalScore     += marks;

      // Resolve correct option for correct_options array (matches GET /attempt/:id shape)
      const correctOpt = qOpts.find(o => o.is_correct);

      results.push({
        question_id:          answer.question_id,
        question_text:        question.question_text,
        selected_option_text: submittedAnswer || null,
        correct_answer:       question.correct_answer,
        correct_options: question.correct_answer
          ? [{ option_text: question.correct_answer }]
          : [],
        is_correct:           isCorrect,
        marks_awarded:        marks,
        max_marks:            markValue,
        explanation:          question.explanation,
        ai_explanation:       question.explanation || '',
        ai_marking_scheme: question.explanation ? {
          status:          isCorrect ? 'correct' : 'incorrect',
          whyExplanation:  question.explanation,
          markingPoints:   [],
        } : {},
        options: question.options,
      });

      // Record attempt — AWAITED (was previously fire-and-forget, which
      // raced against the attemptId lookup that immediately follows this
      // loop — see fix note below).
      //
      // BUG FIX (confirmed via live production logs, not assumption):
      // practice_attempts.created_at and .updated_at are NOT NULL columns.
      // This INSERT supplied attempted_at explicitly but relied on the
      // table's DEFAULT NOW() to populate created_at/updated_at — and on
      // the live database that default is evidently not firing for this
      // INSERT path (live error: 'null value in column "created_at" ...
      // violates not-null constraint', firing on every single question in
      // every quiz submission). This was the actual root cause of "Could
      // not load your results" the whole time: every practice_attempts
      // row failed to insert, so the attemptId lookup right after this
      // loop always found nothing, regardless of the earlier type-cast fix
      // (which was a real, separate bug, but never the one actually
      // blocking this). Rather than rely on the column default at all,
      // both timestamps are now supplied explicitly, same as attempted_at.
      await sequelize.query(
        `INSERT INTO practice_attempts
           (student_id, question_id, is_correct, time_taken_seconds, attempted_at, created_at, updated_at, selected_option_text, paper_type, subject_id, session_id)
         VALUES (:studentId, :questionId, :isCorrect, :timeTaken, NOW(), NOW(), NOW(), :selectedText, :paperType, :subjectId, :sessionId)`,
        {
          replacements: {
            studentId:    req.user.id,
            questionId:   answer.question_id,
            isCorrect,
            timeTaken:    parseInt(answer.time_taken_seconds ?? (answer.time_taken_ms / 1000)) || 0,
            selectedText: submittedAnswer || null,
            paperType:    paper_type || 'quiz',
            subjectId:    subject_id || null,
            sessionId:    sessionId,
          },
          type: QueryTypes.INSERT,
        }
      ).catch((err) => {
        console.error('[POST /quizzes/attempt] practice_attempts insert failed:', err.message);
      });
    }

    // Update subtopic_progress — ONLY for the single-subtopic quiz path.
    // subtopic_progress.subtopic_id is NOT NULL; a mock exam has no single
    // subtopic to report against (subtopic_id is null in that case), so
    // this insert is skipped entirely for mock exams rather than attempted
    // and silently swallowed by the .catch() below.
    const accuracyPct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    if (subtopic_id && accuracyPct >= 60) {
      sequelize.query(
        `INSERT INTO subtopic_progress (student_id, subtopic_id, quiz_completed, updated_at)
         VALUES (:studentId, :subtopicId, true, NOW())
         ON CONFLICT (student_id, subtopic_id) DO UPDATE SET quiz_completed = true, updated_at = NOW()`,
        { replacements: { studentId: req.user.id, subtopicId: subtopic_id }, type: QueryTypes.INSERT }
      ).catch(() => {});
    }

    awardXP(req.user.id, 'quiz', { score: totalScore, max: maxScore }).catch(() => {});

    // Generate a stable attempt_id from the first practice_attempt row
    // so the frontend can navigate to /quiz-results/:attemptId
    //
    // BUG FIX (1 of 2, race condition): this SELECT used to race against the
    // practice_attempts INSERT above, which was fire-and-forget (no await).
    // The INSERT above is now awaited, so that race is closed.
    //
    // BUG FIX (2 of 2, type mismatch — the one actually still breaking this):
    // question_id = ANY(ARRAY[:ids]::text[]) casts the ARRAY to text[] but
    // never casts the `question_id` COLUMN itself — and question_id is
    // INTEGER (see practice_attempts schema), not text. Comparing an
    // integer column against a text[] via = ANY() is a type mismatch
    // Postgres rejects, and that error was silently swallowed by the
    // try/catch below, so attemptId stayed null with literally nothing
    // surfaced anywhere — the request still returned success:true. This is
    // the exact same class of bug already fixed one block above (line ~94,
    // questions.id) by casting the COLUMN to text, not just the array; that
    // fix was applied there but missed here. Same fix, applied here too.
    let attemptId = null;
    try {
      const paRow = await sequelize.query(
        `SELECT id FROM practice_attempts
         WHERE student_id = :studentId AND question_id::text = ANY(ARRAY[:ids]::text[])
         ORDER BY attempted_at DESC LIMIT 1`,
        { replacements: { studentId: req.user.id, ids: questionIds.map(String) }, type: QueryTypes.SELECT }
      );
      attemptId = paRow[0]?.id || null;
    } catch (err) {
      // Previously silent — this single catch block was the entire reason
      // the type-mismatch bug above was invisible. Now logged so any future
      // failure here is diagnosable instead of a silent null.
      console.error('[POST /quizzes/attempt] attemptId resolution failed:', err.message);
    }

    // ── Competitive Benchmark ────────────────────────────────────────────────
    // Aggregate across ALL students' attempts for questions in this subtopic,
    // giving the "class average" to compare this student's result against.
    // Only computed when subtopic_id is present (mock exams span a whole
    // subject, so a single-subtopic benchmark doesn't apply).
    let benchmark = null;
    if (subtopic_id) {
      try {
        const bRows = await sequelize.query(
          `SELECT
             ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_score,
             AVG(NULLIF(pa.time_taken_seconds, 0))                          AS avg_time_s
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           WHERE q.subtopic_id = :subtopicId::integer`,
          { replacements: { subtopicId: parseInt(subtopic_id, 10) }, type: QueryTypes.SELECT }
        );
        const row = bRows[0];
        if (row && row.avg_score != null) {
          benchmark = {
            accuracy_pct: Math.round(Number(row.avg_score)),
            avg_time_ms:  row.avg_time_s != null
              ? Math.round(Number(row.avg_time_s) * 1000)
              : null,
          };
        }
      } catch (benchErr) {
        console.error('[POST /quizzes/attempt] benchmark query failed:', benchErr.message);
        // Non-fatal — quiz result still returns; benchmark stays null
      }
    }

    // Resolve a display name for the topic (subtopic, or subject for a
    // mock exam) to give the AI feedback something concrete to reference.
    let topicName = null;
    try {
      if (subtopic_id) {
        const stRows = await sequelize.query(
          `SELECT st.name FROM subtopics st WHERE st.id = :id`,
          { replacements: { id: subtopic_id }, type: QueryTypes.SELECT }
        );
        topicName = stRows[0]?.name || null;
      } else if (subject_id) {
        const sRows = await sequelize.query(
          `SELECT name FROM subjects WHERE id = :id`,
          { replacements: { id: subject_id }, type: QueryTypes.SELECT }
        );
        topicName = sRows[0]?.name || null;
      }
    } catch { /* non-fatal — feedback just falls back to "this topic" */ }

    const examinerRecommendation = await buildExaminerFeedback({
      studentName:     req.user?.first_name || null,
      accuracyPct,
      topicName,
      missedQuestions: results.filter(r => r.is_correct === false).map(r => r.question_text),
      totalQuestions:  results.length,
    });

    return res.json({
      success:      true,
      attempt_id:   attemptId,
      data: {
        attempt_id:   attemptId,
        subtopic_id,
        total_score:   totalScore,
        max_score:     maxScore,
        accuracy_pct:  accuracyPct,
        total_time_ms: total_time_ms || 0,
        passed:        accuracyPct >= 60,
        answers:       results,
        examiner_recommendation: examinerRecommendation,
        benchmark,
      },
    });
  } catch (err) {
    console.error('[POST /quizzes/attempt]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/quizzes/attempt/:attemptId ──────────────────────────────────────
// Returns quiz results in the envelope QuizResultsPage expects:
// { attempt: {...}, answers: [...], benchmark: {...}, examiner_recommendation: '' }
//
// attemptId is a practice_attempts.id (UUID).
// We look up all attempts from the same session (same student, within 5 minutes of this attempt).
router.get('/attempt/:attemptId', protect, async (req, res) => {
  try {
    // Anchor row — find the reference attempt
    const anchor = await sequelize.query(
      `SELECT pa.id, pa.student_id, pa.attempted_at, pa.question_id, pa.session_id,
              q.subtopic_id
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.id::text = :id AND pa.student_id = :studentId`,
      { replacements: { id: req.params.attemptId, studentId: req.user.id }, type: QueryTypes.SELECT }
    );

    if (!anchor.length) {
      return res.status(404).json({ success: false, error: 'Attempt not found' });
    }

    const { attempted_at, subtopic_id, session_id } = anchor[0];

    // BUG FIX (mock-exam-0-of-0): this used to reconstruct "the same session"
    // from a time window alone (anchor ±5min/+30s). That's a guess, and a bad
    // one for anything slower than a quick single-subtopic quiz — a 40-question
    // mock exam, or just a slow request, can land rows outside that window, or
    // pull in unrelated rows from a genuinely different session that happens to
    // fall inside it. practice_attempts already has a session_id, written once
    // per submission specifically to identify "these rows belong together" —
    // use it directly instead of re-deriving the grouping from timestamps.
    // Falls back to the old time-window approach only for rows recorded before
    // the session_id column existed (it's nullable, added via a later
    // migration — see run_complete_migration.js), so historical results still
    // resolve.
    const sessionRows = session_id
      ? await sequelize.query(
          `SELECT pa.id, pa.question_id, pa.is_correct,
                  pa.time_taken_seconds, pa.attempted_at,
                  pa.selected_option_text,
                  q.question_text, q.correct_answer, q.explanation, q.marks, q.options
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           WHERE pa.student_id = :studentId
             AND pa.session_id = :sessionId
           ORDER BY pa.attempted_at ASC`,
          { replacements: { studentId: req.user.id, sessionId: session_id }, type: QueryTypes.SELECT }
        )
      : await sequelize.query(
          `SELECT pa.id, pa.question_id, pa.is_correct,
                  pa.time_taken_seconds, pa.attempted_at,
                  pa.selected_option_text,
                  q.question_text, q.correct_answer, q.explanation, q.marks, q.options
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           WHERE pa.student_id = :studentId
             AND pa.session_id IS NULL
             AND pa.attempted_at BETWEEN (:anchor::timestamptz - INTERVAL '5 minutes')
                                     AND (:anchor::timestamptz + INTERVAL '30 seconds')
           ORDER BY pa.attempted_at ASC`,
          { replacements: { studentId: req.user.id, anchor: attempted_at }, type: QueryTypes.SELECT }
        );

    const answers = sessionRows.map(row => {
      // Find which option text was selected — stored in options JSONB
      const opts = Array.isArray(row.options) ? row.options : [];
      const correctOpt = opts.find(o => o.is_correct);
      return {
        question_id:         row.question_id,
        question_text:       row.question_text,
        is_correct:          row.is_correct,
        marks_awarded:       row.is_correct ? (row.marks || 1) : 0,
        max_marks:           row.marks || 1,
        correct_answer:      row.correct_answer,
        explanation:         row.explanation,
        selected_option_text: row.selected_option_text ?? null,
        correct_options: correctOpt
          ? [{ id: correctOpt.option_text, option_text: correctOpt.option_text }]
          : [],
        ai_marking_scheme: row.explanation ? {
          status:         row.is_correct ? 'correct' : 'incorrect',
          whyExplanation: row.explanation,
        } : {},
        ai_explanation: row.explanation || '',
      };
    });

    const totalScore  = answers.reduce((s, a) => s + a.marks_awarded, 0);
    const maxScore    = answers.reduce((s, a) => s + a.max_marks, 0);
    const accuracyPct = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const totalTimeMs = sessionRows.reduce((s, r) => s + (r.time_taken_seconds || 0) * 1000, 0);

    // Subtopic name
    let subtopicName = '';
    if (subtopic_id) {
      const stRows = await sequelize.query(
        `SELECT st.name, s.name AS subject_name FROM subtopics st LEFT JOIN topics t ON t.id=st.topic_id LEFT JOIN subjects s ON s.id=t.subject_id WHERE st.id=:id`,
        { replacements: { id: subtopic_id }, type: QueryTypes.SELECT }
      ).catch(() => []);
      subtopicName = stRows[0]?.name || '';
    }

    // ── Competitive Benchmark ────────────────────────────────────────────────
    let benchmark = null;
    if (subtopic_id) {
      try {
        const bRows = await sequelize.query(
          `SELECT
             ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 1) AS avg_score,
             AVG(NULLIF(pa.time_taken_seconds, 0))                          AS avg_time_s
           FROM practice_attempts pa
           JOIN questions q ON q.id = pa.question_id
           WHERE q.subtopic_id = :subtopicId::integer`,
          { replacements: { subtopicId: parseInt(subtopic_id, 10) }, type: QueryTypes.SELECT }
        );
        const row = bRows[0];
        if (row && row.avg_score != null) {
          benchmark = {
            accuracy_pct: Math.round(Number(row.avg_score)),
            avg_time_ms:  row.avg_time_s != null
              ? Math.round(Number(row.avg_time_s) * 1000)
              : null,
          };
        }
      } catch (benchErr) {
        console.error('[GET /quizzes/attempt/:id] benchmark query failed:', benchErr.message);
      }
    }

    const examinerRecommendation = await buildExaminerFeedback({
      studentName:     req.user?.first_name || null,
      accuracyPct,
      topicName:       subtopicName || null,
      missedQuestions: answers.filter(a => a.is_correct === false).map(a => a.question_text),
      totalQuestions:  answers.length,
    });

    return res.json({
      success: true,
      data: {
        attempt: {
          id:            req.params.attemptId,
          subtopic_id,
          subtopic_name: subtopicName,
          total_score:   totalScore,
          max_score:     maxScore,
          accuracy_pct:  accuracyPct,
          total_time_ms: totalTimeMs,
        },
        answers,
        benchmark,
        examiner_recommendation: examinerRecommendation,
      },
    });
  } catch (err) {
    console.error('[GET /quizzes/attempt/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/quizzes/all-history — global quiz history across ALL subjects ────
// Returns one row per quiz session (grouped by attempted_at minute + subtopic)
// so the student can see every quiz they have ever taken in one list.
router.get('/all-history', protect, async (req, res) => {
  const studentId = req.user.id;
  const limit  = Math.min(parseInt(req.query.limit  || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);
  try {
    const rows = await sequelize.query(
      `SELECT
         MIN(pa.id)                                                            AS attempt_id,
         q.subtopic_id,
         st.name                                                               AS subtopic_name,
         s.name                                                                AS subject_name,
         eb.code                                                               AS exam_board_code,
         DATE_TRUNC('minute', pa.attempted_at)                                AS session_start,
         COUNT(*)::INTEGER                                                     AS questions_total,
         SUM(CASE WHEN pa.is_correct THEN 1 ELSE 0 END)::INTEGER              AS questions_correct,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 0)::INTEGER AS accuracy_pct,
         SUM(pa.time_taken_seconds)::INTEGER                                  AS total_time_secs,
         MIN(pa.attempted_at)                                                  AS attempted_at
       FROM practice_attempts pa
       JOIN questions    q  ON q.id  = pa.question_id
       LEFT JOIN subtopics  st ON st.id = q.subtopic_id
       LEFT JOIN topics     t  ON t.id  = st.topic_id
       LEFT JOIN subjects   s  ON s.id  = t.subject_id
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       WHERE pa.student_id = :studentId
       GROUP BY q.subtopic_id, st.name, s.name, eb.code, DATE_TRUNC('minute', pa.attempted_at)
       ORDER BY session_start DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { studentId, limit, offset }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    // BEFORE: logged the error but still returned {success:true, data:[]} —
    // the client had no way to distinguish "genuinely no history yet" from
    // "the query just failed".
    console.error('[GET /quizzes/all-history]', err.message);
    return res.status(500).json({ success: false, error: 'Could not load quiz history' });
  }
});

// ── GET /api/quizzes/history/:studentId/:subtopicId ──────────────────────────
router.get('/history/:studentId/:subtopicId', protect, async (req, res) => {
  const { studentId, subtopicId } = req.params;
  if (String(req.user.id) !== String(studentId) && !['teacher','admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  try {
    const rows = await sequelize.query(
      `SELECT DATE(pa.attempted_at) AS date,
              COUNT(*)::INTEGER AS attempts,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.student_id = :studentId AND q.subtopic_id = :subtopicId
       GROUP BY DATE(pa.attempted_at)
       ORDER BY date DESC LIMIT 10`,
      { replacements: { studentId, subtopicId }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    // BEFORE: no logging at all, and faked a 200 success with an empty
    // list on any failure — a genuine query error was completely invisible,
    // both to the client and to anyone reading server logs.
    console.error('[GET /quizzes/history/:studentId/:subtopicId]', err.message);
    return res.status(500).json({ success: false, error: 'Could not load quiz history' });
  }
});

// ── GET /api/quizzes/history ─────────────────────────────────────────────────
router.get('/history', protect, async (req, res) => {
  const { subtopic_id } = req.query;
  const studentId = req.user.id;
  try {
    const rows = await sequelize.query(
      `SELECT DATE(pa.attempted_at) AS date,
              COUNT(*)::INTEGER AS attempts,
              ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy_pct
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       WHERE pa.student_id = :studentId ${subtopic_id ? 'AND q.subtopic_id = :subtopicId' : ''}
       GROUP BY DATE(pa.attempted_at)
       ORDER BY date DESC LIMIT 20`,
      { replacements: { studentId, ...(subtopic_id ? { subtopicId: subtopic_id } : {}) }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    // BEFORE: no logging, faked a 200 success with an empty list on any
    // failure.
    console.error('[GET /quizzes/history]', err.message);
    return res.status(500).json({ success: false, error: 'Could not load quiz history' });
  }
});

// ── GET /api/quizzes ──────────────────────────────────────────────────────────
router.get('/', protect, async (_req, res) => {
  return res.json({ success: true, data: [], message: 'Use /quizzes/attempt to submit a quiz' });
});

// ── GET /api/quizzes/mock-history ────────────────────────────────────────────
// Returns all mock exam sessions for the current student, grouped by session_id.
// Each row: subject_name, date, score, total, accuracy_pct, time_taken_seconds.
router.get('/mock-history', protect, async (req, res) => {
  const studentId = req.user.id;
  try {
    const rows = await sequelize.query(
      `SELECT
          pa.session_id,
          MIN(pa.attempted_at)                                        AS attempted_at,
          COALESCE(s.name, 'Mock Exam')                               AS subject_name,
          COUNT(*)::INTEGER                                            AS total,
          SUM(CASE WHEN pa.is_correct THEN 1 ELSE 0 END)::INTEGER     AS correct,
          ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END),1) AS accuracy_pct,
          SUM(pa.time_taken_seconds)::INTEGER                          AS time_taken_seconds,
          pa.paper_type
       FROM practice_attempts pa
       LEFT JOIN subjects s ON s.id::text = pa.subject_id::text
       WHERE pa.student_id = :studentId
         AND pa.paper_type = 'mock'
         AND pa.session_id IS NOT NULL
       GROUP BY pa.session_id, s.name, pa.paper_type
       ORDER BY MIN(pa.attempted_at) DESC
       LIMIT 50`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    // BEFORE: logged the error but still returned {success:true, data:[]} —
    // same masking problem as the other history endpoints in this file.
    console.error('[GET /quizzes/mock-history]', err.message);
    return res.status(500).json({ success: false, error: 'Could not load mock exam history' });
  }
});

module.exports = router;
