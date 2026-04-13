'use strict';
// server/routes/aiRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// AI endpoints consumed by the frontend:
//   POST /api/ai/chat          — general AI chat
//   POST /api/ai/explain       — explain why an answer is right/wrong
//   POST /api/ai/hint          — get a hint for a question
//   POST /api/ai/notes/generate — generate AI revision notes for a subtopic
//
// v4 AI COST CONTROL:
//   Removed inline getGeminiModel() helper.
//   All 4 generateContent calls now route through services/ai.js generate().
//   GEMINI_API_KEY guard preserved exactly — only the call site changes.
// ─────────────────────────────────────────────────────────────────────────────

const express  = require('express');
const router   = express.Router();
const { protect }            = require('../middleware/auth');
const { QueryTypes }         = require('sequelize');
const sequelize              = require('../config/database');
// v4: central AI hub replaces inline getGeminiModel() helper
const { generate }           = require('../services/ai');

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
      // Fallback: direct AI call via central hub
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ success: false, error: 'AI not configured' });
      }
      const system = `You are AISchoolonair, a friendly AI tutor for Nigerian secondary school students.
Subject: ${context.subject_name || 'General'}. Subtopic: ${context.subtopic_name || ''}.
Give concise, curriculum-aligned answers suited for WAEC/JAMB/NECO preparation.`;
      // v4: generate() replaces getGeminiModel() + model.generateContent()
      reply = await generate(`${system}\n\nStudent: ${message}\nAISchoolonair:`, 'chat');
    }

    return res.status(200).json({ success: true, reply });
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
       -- selected option resolved client-side
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
      return res.status(200).json({ success: true, explanation: q.explanation });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({
        success:     true,
        explanation: q?.explanation || 'No explanation available.',
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

    // v4: generate() replaces getGeminiModel() + model.generateContent()
    const explanation = await generate(prompt, 'explain');

    if (!typed_answer && explanation) {
      sequelize.query(
        `UPDATE questions SET explanation = :explanation WHERE id = :id AND (explanation IS NULL OR explanation = '')`,
        { replacements: { explanation, id: question_id }, type: QueryTypes.UPDATE }
      ).catch(() => {});
    }

    return res.status(200).json({ success: true, explanation });
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
        hint:    q.concept_hint,
        hints:   [q.concept_hint],
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      const fallback = 'Think carefully about the key concepts in this question. Re-read it slowly.';
      return res.status(200).json({ success: true, hint: fallback, hints: [fallback] });
    }

    const prompt = `You are a helpful tutor for Nigerian secondary school students.
A student is stuck on this question:
"${q?.question_text || 'Question not available'}"

Generate ${hint_level} helpful hint${hint_level > 1 ? 's' : ''} that guide the student toward the answer WITHOUT giving it away.
Each hint should be a single sentence. Focus on the concept being tested, not the answer itself.
Return ONLY the hints as a JSON array of strings, e.g.: ["Hint 1...", "Hint 2..."]
No preamble, no markdown.`;

    // v4: generate() replaces getGeminiModel() + model.generateContent()
    const raw = await generate(prompt, 'hint');
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

    // v4: generate() replaces getGeminiModel() + model.generateContent()
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

// ── POST /api/ai/mark-image ───────────────────────────────────────────────────
router.post('/mark-image', protect, async (req, res) => {
  const { image_base64, question_text, max_marks = 10 } = req.body;
  if (!image_base64) return res.status(400).json({ success: false, error: 'image_base64 is required' });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ success: false, error: 'AI marking not configured' });
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

    const prompt = `You are a Nigerian exam marker. Mark this student's handwritten answer.
Question: "${question_text || 'Not specified'}"
Maximum marks: ${max_marks}
Award marks fairly. Return ONLY valid JSON: {"marks_awarded": N, "feedback": "2-3 sentences", "strengths": "what was good", "improvements": "what to improve"}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: image_base64.replace(/^data:image\/\w+;base64,/, '') } }
    ]);

    const raw    = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return res.json({
      success:       true,
      marks_awarded: Math.min(parsed.marks_awarded || 0, max_marks),
      max_marks,
      feedback:      parsed.feedback || '',
      strengths:     parsed.strengths || '',
      improvements:  parsed.improvements || '',
    });
  } catch (err) {
    console.error('[POST /ai/mark-image]', err.message);
    return res.status(500).json({ success: false, error: 'Image marking failed: ' + err.message });
  }
});

module.exports = router;


