'use strict';
// server/routes/questionsRoutes.js
// GET  /api/questions/random  — fetch questions (JSONB options, correct subtopic join)
// POST /api/questions/:id/answer — validate answer, record practice_attempt
//
// v2 — Essay AI marking now routes through services/ai.js central hub
//      instead of calling Gemini directly.

const express        = require('express');
const router         = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');
const { protect }    = require('../middleware/auth');
// v2: route essay marking through central AI hub
const { generate }   = require('../services/ai');

let awardXP = () => Promise.resolve();
try { awardXP = require('../middleware/xpMiddleware').awardXP; } catch {}

// ── GET /api/questions/random ─────────────────────────────────────────────────
router.get('/random', protect, async (req, res) => {
  const { count = '10', subject_id, subtopic_id, board, difficulty } = req.query;
  const limit = Math.min(Math.max(parseInt(count) || 10, 1), 50);

  // Enrollment check: a student requesting questions for a specific subject
  // must actually be enrolled in that subject. This was previously absent
  // entirely — any authenticated student could pull questions for any
  // subject_id regardless of their own student_subjects rows. Scoped to
  // students only (teachers/admins previewing content are unaffected) and
  // only when subject_id is actually provided (the no-subject_id fallback
  // path used elsewhere, e.g. test-builder flows, is unaffected).
  if (req.user.role === 'student' && subject_id) {
    const enrolled = await sequelize.query(
      `SELECT 1 FROM student_subjects
        WHERE student_id = :studentId AND subject_id = :subjectId AND is_active = true
        LIMIT 1`,
      { replacements: { studentId: req.user.id, subjectId: subject_id }, type: QueryTypes.SELECT }
    ).catch(() => []); // if student_subjects doesn't exist yet in this environment, fail open rather than 500

    if (!enrolled.length) {
      return res.status(403).json({
        success: false,
        error: 'You are not enrolled in this subject. Add it from your Subjects page first.',
        code: 'NOT_ENROLLED',
      });
    }
  }

  // SECURITY: status default changed from 'approved' to 'pending'. Every
  // current insert path now sets status explicitly (teacher questions →
  // 'approved' immediately; all AI-generated questions → 'pending' pending
  // admin review). If a future insert path forgets to set status, this
  // COALESCE must fail SAFE (excluded from students) rather than fail OPEN
  // (silently treated as approved and served to students unreviewed).
  const filters      = ["q.is_active = true", "COALESCE(q.status, 'pending') IN ('approved', 'active')"];
  const replacements = { limit };

  if (subtopic_id) {
    filters.push('q.subtopic_id = :subtopic_id');
    replacements.subtopic_id = subtopic_id;
  }
  if (subject_id) {
    // With LEFT JOINs, t.subject_id is NULL for questions that have no subtopic_id.
    // Use a subquery so subject-filtered quizzes still include those questions
    // (they are linked via the subtopic chain when it exists, or orphaned otherwise).
    // We match either the joined path OR a direct subject_id column on questions if it exists.
    filters.push(`(
      t.subject_id = :subject_id
      OR (t.subject_id IS NULL AND q.subtopic_id IS NULL AND EXISTS (
        SELECT 1 FROM subjects sub WHERE sub.id = :subject_id
      ))
    )`);
    replacements.subject_id = subject_id;
  }
  if (difficulty && ['easy','medium','hard'].includes(difficulty)) {
    filters.push('q.difficulty = :difficulty');
    replacements.difficulty = difficulty;
  }

  let boardJoin = '';
  if (board) {
    boardJoin = `JOIN subjects s_b ON s_b.id = t.subject_id
                 JOIN exam_boards eb_b ON eb_b.id = s_b.exam_board_id
                   AND UPPER(eb_b.code) = UPPER(:board)`;
    replacements.board = board;
  }

  const where = `WHERE ${filters.join(' AND ')}`;

  // Helper: does a parsed options value contain at least 2 entries with real text?
  function hasUsableOptions(rawOptions) {
    let opts = rawOptions;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { return false; }
    }
    if (!Array.isArray(opts)) return false;
    const withText = opts.filter(o => {
      const text = typeof o === 'string' ? o : o?.option_text ?? o?.text;
      return text && String(text).trim();
    });
    return withText.length >= 2;
  }

  // BUG FIX: hasUsableOptions() above correctly treats a plain string ("NaCl")
  // as usable text, but the client (QuizTab.jsx) renders `opt.text ||
  // opt.option_text` — a bare string has neither property, so it renders
  // nothing. This insert path is not hypothetical: resourceQuestionExtractor.js
  // explicitly prompts Gemini for `"options": ["A","B","C","D"]` (plain
  // strings, by design) and stores that array as-is with no normalization.
  // Any question created that way passed validation here but reached
  // students as four blank, unanswerable option pills — exactly the
  // four-empty-pill symptom reported live (subtopic 5, "Acid"). Rather than
  // touch every insert path or the renderer, normalize the shape once here,
  // at the single point every quiz/practice question already passes through.
  function normalizeOptions(rawOptions) {
    let opts = rawOptions;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { return rawOptions; }
    }
    if (!Array.isArray(opts)) return rawOptions;
    return opts.map(o => {
      if (typeof o === 'string') return { option_text: o, is_correct: false };
      if (o && typeof o === 'object') {
        // Already an object — make sure option_text is populated even if the
        // row only ever had `.text` (some older inserts used that key alone).
        if (!o.option_text && o.text) return { ...o, option_text: o.text };
        return o;
      }
      return o;
    });
  }

  try {
    const questions = await sequelize.query(
      `SELECT
         q.id, q.question_text, q.marks, q.difficulty, q.explanation,
         q.type, q.topic, q.options, q.correct_answer,
         q.subtopic_id,
         t.subject_id,
         s.name AS subject_name,
         eb.code AS exam_board_code
       FROM questions q
       LEFT JOIN subtopics  st ON st.id = q.subtopic_id
       LEFT JOIN topics     t  ON t.id  = st.topic_id
       LEFT JOIN subjects   s  ON s.id  = t.subject_id
       LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
       ${boardJoin}
       ${where}
       ORDER BY RANDOM()
       LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );

    // BUG FIX: some insert paths (e.g. remediationService.js) write answer
    // options ONLY to the separate `answer_options` table and leave the
    // `questions.options` JSONB column null/empty. This route only ever
    // read that JSONB column, so any question created that way reached
    // students with zero usable answer choices — four empty option pills,
    // unanswerable. This also covers Gemini occasionally returning
    // malformed option text (objects with an empty option_text field),
    // which passes a naive "array exists" check but renders as blanks.
    //
    // Fix: for any question whose JSONB options aren't usable, fall back to
    // the answer_options table. If neither source has usable options,
    // exclude the question entirely rather than show an unanswerable one —
    // consistent with the rest of the platform's "return fewer questions
    // rather than a broken one" approach (see quizGenerator.js).
    const needsFallback = questions.filter(q => !hasUsableOptions(q.options));

    if (needsFallback.length > 0) {
      const fallbackRows = await sequelize.query(
        `SELECT question_id, option_text, is_correct, order_index
           FROM answer_options
          WHERE question_id = ANY(:ids)
          ORDER BY question_id, order_index ASC NULLS LAST`,
        { replacements: { ids: needsFallback.map(q => q.id) }, type: QueryTypes.SELECT }
      ).catch(() => []); // table may not exist in some environments — degrade gracefully

      const byQuestionId = {};
      for (const row of fallbackRows) {
        if (!byQuestionId[row.question_id]) byQuestionId[row.question_id] = [];
        byQuestionId[row.question_id].push({
          option_text: row.option_text,
          is_correct:  row.is_correct,
        });
      }

      for (const q of needsFallback) {
        const fromTable = byQuestionId[q.id] || [];
        if (fromTable.length >= 2) {
          q.options = fromTable;
          // correct_answer may also be unset on questions inserted this way —
          // backfill it from the table so POST /:id/answer keeps working.
          if (!q.correct_answer) {
            const correct = fromTable.find(o => o.is_correct);
            if (correct) q.correct_answer = correct.option_text;
          }
        }
      }
    }

    // Final pass: drop anything still unusable from either source rather
    // than send a student a question they cannot answer.
    const usable = questions.filter(q => hasUsableOptions(q.options));

    // BUG FIX: normalize option shape (see normalizeOptions above) so plain
    // string arrays — the documented output format for AI-extracted
    // questions via resourceQuestionExtractor.js — render correctly on the
    // client instead of as blank, unanswerable option pills. correct_answer
    // is untouched: it's already a separate plain-text column compared
    // directly in POST /:id/answer and POST /quizzes/attempt, independent
    // of options' internal shape, so normalizing options here cannot affect
    // answer-checking correctness.
    for (const q of usable) {
      let parsed = q.options;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { /* leave as-is, already filtered usable */ }
      }
      q.options = normalizeOptions(parsed);
    }

    return res.json({ success: true, count: usable.length, data: usable });
  } catch (err) {
    console.error('[GET /questions/random]', err.message);
    return res.json({ success: true, count: 0, data: [] });
  }
});

// ── POST /api/questions/:id/answer ───────────────────────────────────────────
router.post('/:id/answer', protect, async (req, res) => {
  const { id } = req.params;
  // Accept selected_answer (option text) OR selected_option_id (same — option text in JSONB schema)
  const raw_answer = req.body.selected_answer ?? req.body.selected_option_id;
  const { essay_response, time_taken_seconds = 0 } = req.body;
  const selected_answer = raw_answer !== undefined ? String(raw_answer) : undefined;

  try {
    const questions = await sequelize.query(
      `SELECT q.id, q.question_text, q.marks, q.explanation, q.correct_answer, q.options, q.type
       FROM questions q WHERE q.id = :id AND q.is_active = true`,
      { replacements: { id }, type: QueryTypes.SELECT }
    );

    if (!questions.length) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const question = questions[0];
    const isEssay  = question.type === 'essay' || !!essay_response;

    let isCorrect    = false;
    let marksAwarded = 0;
    let feedback     = null;

    if (!isEssay) {
      // MCQ — compare against correct_answer
      const correctAnswer = question.correct_answer;
      if (selected_answer !== undefined && selected_answer !== null) {
        isCorrect = String(selected_answer).trim().toLowerCase() ===
                    String(correctAnswer || '').trim().toLowerCase();
      }
      marksAwarded = isCorrect ? (question.marks || 1) : 0;
    } else {
      // Essay — AI marking via central hub (services/ai.js)
      if (process.env.GEMINI_API_KEY && essay_response?.trim()) {
        try {
          const prompt = `You are a Nigerian exam marker. Question: "${question.question_text}". Max marks: ${question.marks || 3}. Model answer: "${question.correct_answer || 'Not specified'}". Student answer: "${essay_response.trim()}". Return ONLY JSON: {"marks_awarded": N, "feedback": "...", "is_correct": true/false}`;
          // v2: routes through ai.js instead of calling Gemini directly
          const raw    = await generate(prompt, 'essay-mark');
          const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
          marksAwarded = Math.min(parsed.marks_awarded || 0, question.marks || 3);
          isCorrect    = parsed.is_correct || marksAwarded >= (question.marks || 3) * 0.5;
          feedback     = parsed.feedback;
        } catch {
          feedback = question.explanation || 'Submitted for review.';
        }
      }
    }

    // Record practice attempt (non-blocking)
    sequelize.query(
      `INSERT INTO practice_attempts
         (student_id, question_id, is_correct, time_taken_seconds, attempted_at)
       VALUES (:studentId, :questionId, :isCorrect, :timeTaken, NOW())`,
      {
        replacements: {
          studentId:  req.user.id,
          questionId: id,
          isCorrect,
          timeTaken:  parseInt(time_taken_seconds) || 0,
        },
        type: QueryTypes.INSERT,
      }
    ).catch(() => {});

    awardXP(req.user.id, 'answer', { is_correct: isCorrect }).catch(() => {});

    return res.json({
      success:        true,
      is_correct:     isCorrect,
      correct_answer: question.correct_answer,
      explanation:    question.explanation || null,
      marks_awarded:  marksAwarded,
      max_marks:      question.marks || 1,
      feedback,
    });
  } catch (err) {
    console.error(`[POST /questions/${id}/answer]`, err.message);
    return res.status(500).json({ success: false, error: 'Failed to validate answer' });
  }
});

// ── POST /api/questions/submit — ContributeQuestion page ─────────────────────
// Open to any authenticated role (community contribution flow, distinct from
// the teacher's dedicated POST /teacher/questions route). The frontend
// already promises the submitter an "Under review" success state, but the
// insert never actually set status — it relied on COALESCE(status,'approved')
// elsewhere to silently make it live. Now set explicitly: status='pending',
// is_ai_generated=false (human-written, just not yet reviewed). Goes through
// the same Question Review Queue as AI-generated content.
router.post('/submit', protect, async (req, res) => {
  const { question_text, subtopic_id, difficulty = 'medium', explanation, options, correct_answer } = req.body;
  if (!question_text?.trim()) return res.status(400).json({ success: false, error: 'question_text is required' });
  if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ success: false, error: 'At least 2 options required' });

  const correctOpt = options.find(o => o.is_correct);
  const correctAns = correct_answer || correctOpt?.option_text || correctOpt?.text || '';

  try {
    const result = await sequelize.query(
      `INSERT INTO questions (question_text, subtopic_id, submitted_by, difficulty, explanation, options, correct_answer, type, is_active, is_ai_generated, status, created_at, updated_at)
       VALUES (:question_text, :subtopic_id, :submitted_by, :difficulty, :explanation, :options::jsonb, :correct_answer, 'mcq', true, false, 'pending', NOW(), NOW())
       RETURNING id`,
      {
        replacements: {
          question_text:  question_text.trim(),
          subtopic_id:    subtopic_id || null,
          submitted_by:   req.user.id,
          difficulty,
          explanation:    explanation?.trim() || null,
          options:        JSON.stringify(options.map(o => ({ option_text: o.option_text || o.text || '', is_correct: !!o.is_correct }))),
          correct_answer: correctAns,
        },
        type: QueryTypes.SELECT,
      }
    );
    return res.status(201).json({ success: true, message: 'Question submitted — thank you!', data: { id: result[0].id } });
  } catch (err) {
    console.error('[POST /questions/submit]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
