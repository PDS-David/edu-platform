'use strict';
// server/routes/aiRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// AI endpoints consumed by the frontend:
//   POST /api/ai/chat          — general AI chat
//   POST /api/ai/explain       — explain why an answer is right/wrong
//   POST /api/ai/hint          — get a hint for a question
//   POST /api/ai/notes/generate — generate AI revision notes for a subtopic
//   POST /api/ai/mark-image    — multimodal image marking
//
// v4 — Removed inline getGeminiModel() helper. All generateContent calls
//       route through services/ai.js generate().
// v5 — Migrated mark-image from deprecated @google/generative-ai to
//       @google/genai SDK.
// ─────────────────────────────────────────────────────────────────────────────

const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const { protect }            = require('../middleware/auth');
const { QueryTypes }         = require('sequelize');
const sequelize              = require('../config/database');
const { generate }           = require('../services/ai');
const { GoogleGenAI }        = require('@google/genai');
const { markImage }          = require('../services/aiService');

// multer: memory storage for AI image uploads (no disk write needed)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WEBP or HEIC images are accepted'));
    }
    cb(null, true);
  },
});

// ── Grade calculator (WAEC A1–F9 scale) ──────────────────────────────────────
function calcGrade(pct) {
  if (pct >= 75) return 'A1';
  if (pct >= 70) return 'B2';
  if (pct >= 65) return 'B3';
  if (pct >= 60) return 'C4';
  if (pct >= 55) return 'C5';
  if (pct >= 50) return 'C6';
  if (pct >= 45) return 'D7';
  if (pct >= 40) return 'E8';
  return 'F9';
}

// ── Normalise Gemini string-or-array fields to arrays ────────────────────────
function toArray(val) {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string' && val.trim()) {
    // Split on newlines or semicolons so a multi-sentence string becomes bullet points
    return val.split(/[\n;]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
router.post('/chat', protect, async (req, res) => {
  try {
    const { message, context = {}, session_id } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    let reply = null;
    try {
      const { orchestrate } = require('../services/aiOrchestrator');
      const result = await orchestrate({ message, context, conversationHistory: [] });
      reply = result.reply;
    } catch {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ success: false, error: 'AI not configured' });
      }
      const system = `You are AISchoolonair, a friendly AI tutor for Nigerian secondary school students.
Subject: ${context.subject_name || 'General'}. Subtopic: ${context.subtopic_name || ''}.
Give concise, curriculum-aligned answers suited for WAEC/JAMB/NECO preparation.`;
      reply = await generate(`${system}\n\nStudent: ${message}\nAISchoolonair:`, 'chat');
    }

    return res.status(200).json({ success: true, data: { reply } });
  } catch (err) {
    console.error('[POST /ai/chat]', err.message);
    return res.status(500).json({ success: false, error: 'AI chat failed' });
  }
});

// ── POST /api/ai/explain ──────────────────────────────────────────────────────
router.post('/explain', protect, async (req, res) => {
  const { question_id, selected_option_id, typed_answer } = req.body;

  if (!question_id) {
    return res.status(400).json({ success: false, error: 'question_id is required' });
  }

  try {
    const questions = await sequelize.query(
      `SELECT q.question_text, q.explanation, q.correct_answer,
              ao.option_text AS selected_text,
              ao.is_correct  AS selected_is_correct,
              q.correct_answer AS correct_text
       FROM questions q
       LEFT JOIN answer_options ao ON ao.id = :selectedOptionId
       WHERE q.id = :questionId`,
      {
        replacements: {
          questionId:       question_id,
          selectedOptionId: selected_option_id || null,
        },
        type: QueryTypes.SELECT,
      }
    );

    const q = questions[0];

    if (q?.explanation && !typed_answer) {
      return res.status(200).json({ success: true, data: { explanation: q.explanation } });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({
        success: true,
        data: { explanation: q?.explanation || 'No explanation available.' },
      });
    }

    let prompt;
    if (typed_answer) {
      prompt = `You are an expert Nigerian exam marker (WAEC/JAMB/NECO standard).
A student answered this question:

Question: ${q?.question_text || 'See question'}
Correct Answer: ${q?.correct_answer || q?.correct_text || 'See marking scheme'}

Student's answer: "${typed_answer}"

Provide:
1. Whether the answer is correct, partially correct, or incorrect
2. What the student got right
3. What the student missed or got wrong
4. The model answer in 2-3 sentences
Keep your feedback constructive and under 150 words.`;
    } else {
      prompt = `You are an expert Nigerian exam tutor (WAEC/JAMB/NECO standard).
Question: ${q?.question_text || 'Question not found'}
Correct answer: ${q?.correct_answer || q?.correct_text || 'Not available'}
Student selected: ${q?.selected_text || 'Did not answer'}
Was student correct: ${q?.selected_is_correct ? 'YES' : 'NO'}

Explain in 2-3 sentences why the correct answer is right and briefly why the other options are wrong.
Be concise and curriculum-aligned.`;
    }

    const explanation = await generate(prompt, 'explain');

    if (!typed_answer && explanation) {
      sequelize.query(
        `UPDATE questions SET explanation = :explanation WHERE id = :id AND (explanation IS NULL OR explanation = '')`,
        { replacements: { explanation, id: question_id }, type: QueryTypes.UPDATE }
      ).catch(() => {});
    }

    return res.status(200).json({ success: true, data: { explanation } });
  } catch (err) {
    console.error('[POST /ai/explain]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate explanation' });
  }
});

// ── POST /api/ai/hint ─────────────────────────────────────────────────────────
router.post('/hint', protect, async (req, res) => {
  const { question_id, selected_option_id, hint_level = 1 } = req.body;

  if (!question_id) {
    return res.status(400).json({ success: false, error: 'question_id is required' });
  }

  try {
    const questions = await sequelize.query(
      `SELECT question_text, correct_answer, concept_hint,
              q.correct_answer AS correct_text
       FROM questions q WHERE q.id = :questionId`,
      { replacements: { questionId: question_id }, type: QueryTypes.SELECT }
    );

    const q = questions[0];

    if (q?.concept_hint && hint_level === 1) {
      return res.status(200).json({
        success: true,
        data: { hint: q.concept_hint, hints: [q.concept_hint] },
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      const fallback = 'Think carefully about the key concepts in this question. Re-read it slowly.';
      return res.status(200).json({ success: true, data: { hint: fallback, hints: [fallback] } });
    }

    const prompt = `You are a helpful tutor for Nigerian secondary school students.
A student is stuck on this question:
"${q?.question_text || 'Question not available'}"

Generate ${hint_level} helpful hint${hint_level > 1 ? 's' : ''} that guide the student toward the answer WITHOUT giving it away.
Each hint should be a single sentence. Focus on the concept being tested, not the answer itself.
Return ONLY the hints as a JSON array of strings, e.g.: ["Hint 1...", "Hint 2..."]
No preamble, no markdown.`;

    const raw     = await generate(prompt, 'hint');
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let hints;
    try {
      hints = JSON.parse(cleaned);
      if (!Array.isArray(hints)) hints = [cleaned];
    } catch {
      hints = [cleaned];
    }

    return res.status(200).json({
      success: true,
      hint:    hints[0] || '',
      hints,
    });
  } catch (err) {
    console.error('[POST /ai/hint]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate hint' });
  }
});

// ── POST /api/ai/notes/generate ───────────────────────────────────────────────
router.post('/notes/generate', protect, async (req, res) => {
  const { subject_id, topic_name, subtopic_id } = req.body;

  if (!topic_name?.trim()) {
    return res.status(400).json({ success: false, error: 'topic_name is required' });
  }

  try {
    let subjectName = '';
    if (subject_id) {
      const subjects = await sequelize.query(
        `SELECT s.name, eb.code AS board_code
         FROM subjects s LEFT JOIN exam_boards eb ON s.exam_board_id = eb.id
         WHERE s.id = :subjectId`,
        { replacements: { subjectId: subject_id }, type: QueryTypes.SELECT }
      );
      if (subjects[0]) {
        subjectName = `${subjects[0].board_code || ''} ${subjects[0].name}`.trim();
      }
    }

    if (subtopic_id) {
      const existing = await sequelize.query(
        `SELECT content_html FROM notes WHERE subtopic_id = :subtopicId LIMIT 1`,
        { replacements: { subtopicId: subtopic_id }, type: QueryTypes.SELECT }
      );
      if (existing[0]?.content_html) {
        return res.status(200).json({ success: true, notes: existing[0].content_html });
      }
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ success: false, error: 'AI not configured' });
    }

    const prompt = `You are an expert Nigerian secondary school tutor writing revision notes.
Subject: ${subjectName || 'General'}
Topic: ${topic_name}

Write concise, exam-focused revision notes for this topic. Structure as:
1. Key Definitions (3-5 bullet points)
2. Core Concepts (3-4 bullet points)
3. Common Exam Tips (2-3 bullet points)

Keep each bullet point to 1-2 sentences. Use clear, simple English suitable for SS2/SS3 students.
Total length: under 300 words. Plain text only — no markdown, no headers with #.`;

    const notes = await generate(prompt, 'notes');

    if (subtopic_id && notes) {
      sequelize.query(
        `INSERT INTO notes (id, student_id, subtopic_id, content_html, created_at, updated_at)
         VALUES (:studentId, :subtopicId, :content, NOW(), NOW())
         ON CONFLICT (student_id, subtopic_id) DO UPDATE SET content_html = :content, updated_at = NOW()`,
        {
          replacements: { studentId: req.user.id, subtopicId: subtopic_id, content: notes },
          type: QueryTypes.INSERT,
        }
      ).catch(() => {});
    }

    return res.status(200).json({ success: true, notes });
  } catch (err) {
    console.error('[POST /ai/notes/generate]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to generate notes' });
  }
});

router.post('/mark-image', protect, (req, res) => {
  imageUpload(req, res, async (uploadErr) => {
    // ── Multer error (wrong type, too large, etc.)
    if (uploadErr) {
      console.error('[POST /ai/mark-image] Multer error:', uploadErr.message);
      return res.status(400).json({
        success: false,
        error: uploadErr.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be under 10 MB.'
          : 'Invalid image file. Please upload a JPEG, PNG, WEBP or HEIC image.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded. Send as multipart/form-data with field name "image".' });
    }

    const questionText = (req.body.question_text || '').trim();
    const subject      = (req.body.subject       || 'General').trim();
    const examBoard    = (req.body.exam_board     || 'WAEC').trim();
    const totalMarks   = Math.min(Math.max(parseInt(req.body.total_marks) || 10, 1), 100);
    const markScheme   = (req.body.mark_scheme    || '').trim() || null;

    if (!questionText) {
      return res.status(400).json({ success: false, error: 'question_text is required.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error('[POST /ai/mark-image] GEMINI_API_KEY not set');
      return res.status(503).json({ success: false, error: 'AI marking is not configured.' });
    }

    // Convert binary buffer → base64 (strip any existing data-URI prefix)
    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType    = req.file.mimetype || 'image/jpeg';

    console.log(`[POST /ai/mark-image] user=${req.user?.id} subject=${subject} board=${examBoard} marks=${totalMarks} size=${req.file.size}B mime=${mimeType}`);

    try {
      const marking = await markImage({
        imageBase64,
        mimeType,
        questionText,
        markScheme,
        subject,
        examBoard,
        totalMarks,
      });

      // Normalise to the shape the frontend expects
      const marksAwarded = Math.min(Math.max(Number(marking.marks_awarded) || 0, 0), totalMarks);
      const percentage   = marking.percentage != null
        ? Math.round(marking.percentage)
        : Math.round((marksAwarded / totalMarks) * 100);
      const grade        = marking.grade || calcGrade(percentage);

      // strengths/improvements must be arrays
      const toArray = (v) => Array.isArray(v) ? v : (v ? String(v).split(/[.;\n]+/).map(s => s.trim()).filter(Boolean) : []);

      const payload = {
        marksAwarded,
        totalMarks,
        percentage,
        grade,
        feedback:     marking.feedback     || '',
        strengths:    toArray(marking.strengths),
        improvements: toArray(marking.improvements),
        modelAnswer:  marking.model_answer || marking.modelAnswer || null,
        readabilityNote: marking.readability_note || marking.readabilityNote || null,
      };

      console.log(`[POST /ai/mark-image] done: ${marksAwarded}/${totalMarks} (${percentage}%) grade=${grade}`);

      return res.json({ success: true, data: payload });

    } catch (err) {
      console.error('[POST /ai/mark-image] Gemini error:', err.message);
      const status = err.statusCode === 503 ? 503 : 500;
      return res.status(status).json({
        success: false,
        error: err.statusCode === 503
          ? 'AI is temporarily busy. Please try again in a moment.'
          : 'Image marking failed. Please try again.',
      });
    }
  });
});

// ── GET /api/ai/predict-grade/:userId/:subjectId ──────────────────────────────
// Analyses practice_attempts for the subject and returns an AI-predicted grade
// in WAEC A1–F9 format with confidence level and personalised study advice.
router.get('/predict-grade/:userId/:subjectId', protect, async (req, res) => {
  const { userId, subjectId } = req.params;

  // Ownership guard — students may only access their own data
  if (
    req.user.role === 'student' &&
    String(req.user.id) !== String(userId)
  ) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    // Pull accuracy + topic coverage for this student × subject
    const [statsRow] = await sequelize.query(`
      SELECT
        COUNT(pa.id)::INTEGER                                                         AS total_attempts,
        ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END))::INTEGER            AS accuracy_pct,
        COUNT(DISTINCT st.topic_id)::INTEGER                                          AS topics_attempted,
        COUNT(DISTINCT CASE WHEN pa.is_correct THEN st.id END)::INTEGER               AS subtopics_passed
      FROM practice_attempts pa
      JOIN questions  q  ON q.id  = pa.question_id
      JOIN subtopics  st ON st.id = q.subtopic_id
      JOIN topics     t  ON t.id  = st.topic_id
      WHERE pa.student_id = :userId
        AND t.subject_id  = :subjectId
    `, { replacements: { userId, subjectId }, type: QueryTypes.SELECT });

    const weakTopicsRows = await sequelize.query(`
      SELECT st.name AS subtopic_name,
             ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END))::INTEGER AS accuracy_pct
      FROM practice_attempts pa
      JOIN questions  q  ON q.id  = pa.question_id
      JOIN subtopics  st ON st.id = q.subtopic_id
      JOIN topics     t  ON t.id  = st.topic_id
      WHERE pa.student_id = :userId
        AND t.subject_id  = :subjectId
      GROUP BY st.name
      HAVING COUNT(pa.id) >= 2
      ORDER BY accuracy_pct ASC
      LIMIT 5
    `, { replacements: { userId, subjectId }, type: QueryTypes.SELECT });

    const stats    = statsRow || {};
    const accuracy = parseInt(stats.accuracy_pct) || 0;
    const attempts = parseInt(stats.total_attempts) || 0;
    const weakTopics = weakTopicsRows.map(r => r.subtopic_name);

    // Rule-based grade (used as fallback and as AI context)
    const ruleGrade = accuracy >= 75 ? 'A1'
      : accuracy >= 70 ? 'B2'
      : accuracy >= 65 ? 'B3'
      : accuracy >= 60 ? 'C4'
      : accuracy >= 55 ? 'C5'
      : accuracy >= 50 ? 'C6'
      : accuracy >= 45 ? 'D7'
      : accuracy >= 40 ? 'E8' : 'F9';

    const confidence = attempts >= 50 ? 'High'
      : attempts >= 20 ? 'Medium' : 'Low';

    if (!process.env.GEMINI_API_KEY || attempts < 5) {
      return res.json({
        success: true,
        data: {
          predictedGrade: ruleGrade,
          confidence,
          accuracy_pct:   accuracy,
          total_attempts: attempts,
          weakestTopics:  weakTopics,
          studyAdvice:    attempts < 5
            ? 'Complete at least 5 practice questions in this subject to unlock your predicted grade.'
            : `Your current accuracy is ${accuracy}%. Focus on your weak areas to improve your grade.`,
        },
      });
    }

    const prompt = `You are an expert Nigerian WAEC exam grade predictor.

A student's performance data for a subject:
- Accuracy rate: ${accuracy}%
- Total practice questions attempted: ${attempts}
- Topics attempted: ${stats.topics_attempted || 0}
- Subtopics passed (≥50% accuracy): ${stats.subtopics_passed || 0}
- Weakest subtopics: ${weakTopics.slice(0, 3).join(', ') || 'none identified yet'}
- Rule-based predicted grade: ${ruleGrade}

Predict their final WAEC exam grade on the A1-F9 scale and provide targeted advice.
Return ONLY valid JSON (no markdown):
{
  "predictedGrade": "B2",
  "confidence": "Medium",
  "gradeRationale": "one sentence explanation",
  "studyAdvice": "2-3 concrete sentences of personalised advice based on weak areas",
  "weeklyTarget": "specific achievable weekly goal e.g. '30 questions per day on Organic Chemistry'"
}`;

    const raw = await generate(prompt, 'predict');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let aiResult;
    try { aiResult = JSON.parse(cleaned); } catch { aiResult = null; }

    return res.json({
      success: true,
      data: {
        predictedGrade: aiResult?.predictedGrade || ruleGrade,
        confidence:     aiResult?.confidence     || confidence,
        gradeRationale: aiResult?.gradeRationale || '',
        studyAdvice:    aiResult?.studyAdvice    || `Focus on: ${weakTopics.slice(0, 2).join(', ')}.`,
        weeklyTarget:   aiResult?.weeklyTarget   || '',
        accuracy_pct:   accuracy,
        total_attempts: attempts,
        weakestTopics:  weakTopics,
      },
    });
  } catch (err) {
    console.error('[GET /ai/predict-grade]', err.message);
    return res.status(500).json({ success: false, error: 'Grade prediction failed: ' + err.message });
  }
});

// ── GET /api/ai/learning-path/:userId ─────────────────────────────────────────
// Analyses weak topics, unstarted subtopics, and recent activity to generate
// a prioritised 5-step AI study plan with reasons, actions, and subtopic links.
router.get('/learning-path/:userId', protect, async (req, res) => {
  const { userId } = req.params;

  // Ownership guard — students may only access their own data
  if (
    req.user.role === 'student' &&
    String(req.user.id) !== String(userId)
  ) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    // Weak subtopics (low accuracy, attempted)
    const weakSubtopics = await sequelize.query(`
      SELECT st.id AS subtopic_id, st.name AS subtopic_name,
             t.name  AS topic_name, s.name AS subject_name,
             ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END))::INTEGER AS accuracy_pct,
             COUNT(pa.id)::INTEGER AS attempts
      FROM practice_attempts pa
      JOIN questions  q  ON q.id  = pa.question_id
      JOIN subtopics  st ON st.id = q.subtopic_id
      JOIN topics     t  ON t.id  = st.topic_id
      JOIN subjects   s  ON s.id  = t.subject_id
      WHERE pa.student_id = :userId
      GROUP BY st.id, st.name, t.name, s.name
      HAVING COUNT(pa.id) >= 2 AND AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END) < 60
      ORDER BY AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END) ASC
      LIMIT 5
    `, { replacements: { userId }, type: QueryTypes.SELECT });

    // Untouched subtopics (enrolled but never practiced)
    const unstartedSubtopics = await sequelize.query(`
      SELECT st.id AS subtopic_id, st.name AS subtopic_name,
             t.name AS topic_name, s.name AS subject_name
      FROM subtopic_progress sp
      JOIN subtopics st ON st.id = sp.subtopic_id
      JOIN topics    t  ON t.id  = st.topic_id
      JOIN subjects  s  ON s.id  = t.subject_id
      WHERE sp.student_id = :userId
        AND sp.practice_completed = false
        AND sp.resources_completed = false
        AND st.id NOT IN (
          SELECT DISTINCT q.subtopic_id
          FROM practice_attempts pa
          JOIN questions q ON q.id = pa.question_id
          WHERE pa.student_id = :userId AND q.subtopic_id IS NOT NULL
        )
      LIMIT 5
    `, { replacements: { userId }, type: QueryTypes.SELECT }).catch(() => []);

    // Recent subjects studied (for context)
    const recentSubjects = await sequelize.query(`
      SELECT DISTINCT s.name AS subject_name
      FROM practice_attempts pa
      JOIN questions q ON q.id = pa.question_id
      JOIN subtopics st ON st.id = q.subtopic_id
      JOIN topics    t  ON t.id  = st.topic_id
      JOIN subjects  s  ON s.id  = t.subject_id
      WHERE pa.student_id = :userId
        AND pa.attempted_at > NOW() - INTERVAL '7 days'
      LIMIT 3
    `, { replacements: { userId }, type: QueryTypes.SELECT }).catch(() => []);

    // Build fallback plan from data
    const buildFallbackPlan = () => {
      const steps = [];
      for (const w of weakSubtopics.slice(0, 3)) {
        steps.push({
          step:        steps.length + 1,
          type:        'remediation',
          subject:     w.subject_name,
          topic:       w.topic_name,
          subtopic:    w.subtopic_name,
          subtopic_id: w.subtopic_id,
          reason:      `Your accuracy on this topic is only ${w.accuracy_pct}% — below the 60% pass threshold.`,
          action:      `Practice at least 10 more questions on ${w.subtopic_name} and review the explanations carefully.`,
          priority:    'High',
        });
      }
      for (const u of unstartedSubtopics.slice(0, 2)) {
        steps.push({
          step:        steps.length + 1,
          type:        'new_topic',
          subject:     u.subject_name,
          topic:       u.topic_name,
          subtopic:    u.subtopic_name,
          subtopic_id: u.subtopic_id,
          reason:      `You haven't started this subtopic yet — covering it increases your exam readiness.`,
          action:      `Read the learning resources for ${u.subtopic_name}, then attempt 5 practice questions.`,
          priority:    'Medium',
        });
      }
      return steps.length > 0 ? steps : [{
        step: 1, type: 'start', subject: 'All subjects', topic: 'General',
        subtopic: 'Get started', subtopic_id: null,
        reason: 'You haven\'t started practicing yet.',
        action: 'Pick any subject and complete at least 10 practice questions to unlock your personalised learning path.',
        priority: 'High',
      }];
    };

    if (!process.env.GEMINI_API_KEY) {
      return res.json({ success: true, data: { steps: buildFallbackPlan(), ai_generated: false } });
    }

    const prompt = `You are an expert Nigerian exam coach building a personalised study plan.

Student's weak subtopics (low accuracy):
${weakSubtopics.map(w => `- ${w.subject_name} > ${w.topic_name} > ${w.subtopic_name}: ${w.accuracy_pct}% accuracy (${w.attempts} attempts)`).join('\n') || '- None yet'}

Unstarted subtopics (never practiced):
${unstartedSubtopics.map(u => `- ${u.subject_name} > ${u.topic_name} > ${u.subtopic_name}`).join('\n') || '- None'}

Recently active subjects: ${recentSubjects.map(r => r.subject_name).join(', ') || 'None'}

Create a prioritised 5-step study plan. For weak topics, focus on remediation. For unstarted topics, focus on starting.
Return ONLY valid JSON (no markdown):
{
  "steps": [
    {
      "step": 1,
      "type": "remediation|new_topic|review",
      "subject": "subject name",
      "topic": "topic name",
      "subtopic": "subtopic name",
      "reason": "why this step is important (1 sentence)",
      "action": "specific thing to do this week (1-2 sentences)",
      "priority": "High|Medium|Low"
    }
  ]
}`;

    const raw = await generate(prompt, 'learning-path');
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let aiPlan;
    try { aiPlan = JSON.parse(cleaned); } catch { aiPlan = null; }

    // Merge AI step subtopic_ids from our DB data
    const mergedSteps = (aiPlan?.steps || buildFallbackPlan()).map((step, i) => {
      const matchWeak = weakSubtopics.find(w =>
        w.subtopic_name?.toLowerCase() === step.subtopic?.toLowerCase()
      );
      const matchUnstarted = unstartedSubtopics.find(u =>
        u.subtopic_name?.toLowerCase() === step.subtopic?.toLowerCase()
      );
      return {
        ...step,
        step:        i + 1,
        subtopic_id: matchWeak?.subtopic_id || matchUnstarted?.subtopic_id || null,
      };
    });

    return res.json({ success: true, data: { steps: mergedSteps, ai_generated: !!aiPlan } });
  } catch (err) {
    console.error('[GET /ai/learning-path]', err.message);
    return res.status(500).json({ success: false, error: 'Learning path generation failed: ' + err.message });
  }
});

module.exports = router;
