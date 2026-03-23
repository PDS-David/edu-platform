// server/routes/aiChatRoute.js
// POST /api/ai/chat        — send a message, persist history
// GET  /api/ai/chat/session — restore last session for a subject

const express      = require('express');
const router       = express.Router();
const { protect }  = require('../middleware/auth');
const { QueryTypes } = require('sequelize');
const sequelize    = require('../config/database');

let subscriptionGuard;
try {
  subscriptionGuard = require('../middleware/subscriptionGuard');
} catch {
  subscriptionGuard = (_req, _res, next) => next();
}

// ── Gemini singleton ──────────────────────────────────────────────────────────
let _geminiModel = null;
const getGeminiModel = () => {
  if (_geminiModel) return _geminiModel;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  _geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  return _geminiModel;
};

// ── GET /api/ai/chat/session — restore last session for subject ───────────────
router.get('/chat/session', protect, async (req, res) => {
  const { subject_id, subtopic_id } = req.query;
  const studentId = req.user.id;

  try {
    // Find most recent session for this student + subject/subtopic
    const filters = ['s.student_id = :studentId'];
    const replacements = { studentId };
    if (subject_id)  { filters.push('s.subject_id  = :subject_id');  replacements.subject_id  = subject_id;  }
    if (subtopic_id) { filters.push('s.subtopic_id = :subtopic_id'); replacements.subtopic_id = subtopic_id; }

    const sessions = await sequelize.query(
      `SELECT s.id FROM ai_chat_sessions s
       WHERE ${filters.join(' AND ')}
       ORDER BY s.updated_at DESC LIMIT 1`,
      { replacements, type: QueryTypes.SELECT }
    );

    if (!sessions.length) {
      return res.json({ success: true, session_id: null, messages: [] });
    }

    const sessionId = sessions[0].id;

    // Fetch last 5 messages
    const messages = await sequelize.query(
      `SELECT role, content, created_at
       FROM ai_chat_messages
       WHERE session_id = :sessionId
       ORDER BY created_at DESC LIMIT 5`,
      { replacements: { sessionId }, type: QueryTypes.SELECT }
    );

    return res.json({
      success: true,
      session_id: sessionId,
      messages: messages.reverse(), // oldest first
    });
  } catch (err) {
    console.error('[AI Chat Session] Error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to restore session' });
  }
});

// ── POST /api/ai/chat — send message with history ─────────────────────────────
router.post('/chat', protect, subscriptionGuard, async (req, res) => {
  const { message, context = {}, session_id } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  const studentId = req.user.id;
  const { subject_name = '', subtopic_name = '', weak_topics = [],
          subject_id = null, subtopic_id = null } = context;

  try {
    // ── 1. Resolve or create session ─────────────────────────────────────────
    let sessionId = session_id || null;

    if (!sessionId) {
      const newSession = await sequelize.query(
        `INSERT INTO ai_chat_sessions (student_id, subject_id, subtopic_id)
         VALUES (:studentId, :subjectId, :subtopicId)
         RETURNING id`,
        {
          replacements: {
            studentId,
            subjectId:  subject_id  || null,
            subtopicId: subtopic_id || null,
          },
          type: QueryTypes.INSERT,
        }
      );
      sessionId = newSession[0][0]?.id;
    }

    // ── 2. Load last 10 messages for history ──────────────────────────────────
    const history = await sequelize.query(
      `SELECT role, content FROM ai_chat_messages
       WHERE session_id = :sessionId
       ORDER BY created_at DESC LIMIT 10`,
      { replacements: { sessionId }, type: QueryTypes.SELECT }
    );
    // Reverse to chronological order and map to Gemini format
    const geminiHistory = history.reverse().map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // ── 3. Build system prompt ────────────────────────────────────────────────
    const weakStr = weak_topics.length > 0
      ? weak_topics.slice(0, 3).join(', ')
      : 'not yet determined';

    const systemPrompt = `You are EACbuddy, a friendly and encouraging AI study assistant for Nigerian secondary school students preparing for JAMB and WAEC exams.
${subject_name    ? `The student is currently studying: ${subject_name}${subtopic_name ? ' — ' + subtopic_name : ''}.` : ''}
${weak_topics.length > 0 ? `Their recently weak topics are: ${weakStr}.` : ''}

Rules:
- Answer concisely — maximum 3 sentences unless a step-by-step explanation is genuinely needed
- Use simple, clear language appropriate for Nigerian SS2/SS3 students
- Focus on exam technique and what the examiner expects
- When helpful, end with a short follow-up question to check understanding
- Never give essay-length answers — be sharp and targeted
- If a student asks something outside academic subjects, gently redirect them back to studying`;

    // ── 4. Call Gemini with history ───────────────────────────────────────────
    const model = getGeminiModel();
    const chat  = model.startChat({
      history: geminiHistory,
      generationConfig: { maxOutputTokens: 512 },
    });

    const result = await chat.sendMessage(`${systemPrompt}\n\nStudent: ${message}`);
    const reply  = result.response.text().trim();

    // ── 5. Persist both messages ──────────────────────────────────────────────
    await sequelize.query(
      `INSERT INTO ai_chat_messages (session_id, role, content)
       VALUES (:sessionId, 'user', :content)`,
      { replacements: { sessionId, content: message }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `INSERT INTO ai_chat_messages (session_id, role, content)
       VALUES (:sessionId, 'assistant', :content)`,
      { replacements: { sessionId, content: reply }, type: QueryTypes.INSERT }
    );

    // Update session timestamp
    await sequelize.query(
      `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = :sessionId`,
      { replacements: { sessionId }, type: QueryTypes.UPDATE }
    );

    return res.json({ success: true, reply, session_id: sessionId });

  } catch (err) {
    console.error('[AI Chat] Error:', err.message);
    return res.status(500).json({ success: false, error: 'AI chat unavailable. Please try again.' });
  }
});

module.exports = router;
