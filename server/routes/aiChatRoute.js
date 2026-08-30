'use strict';
// server/routes/aiChatRoute.js
// ============================================================================
// PRIMARY AI CHAT ENTRY POINT — AISchoolonair
//
// v2 — Migrated streaming endpoint from deprecated @google/generative-ai
//      to @google/genai SDK. Uses ai.models.generateContentStream().
//
// Response format:
//   { success, reply, structured, intent, db_results_found, session_id,
//     memory_updated, next_action? }
// ============================================================================

const express              = require('express');
const router               = express.Router();
const { protect }          = require('../middleware/auth');
const { aiLimiter }        = require('../middleware/rateLimiter');
const { QueryTypes }       = require('sequelize');
const sequelize            = require('../config/database');
const { orchestrate }      = require('../services/aiOrchestrator');
const { fetchUserMemory }  = require('../services/userMemory');
const { GoogleGenAI }      = require('@google/genai');
const {
  getMemoryForPrompt,
  storeConversation,
  updateLearningProfile,
} = require('../services/memoryService');

let subscriptionGuard = (_req, _res, next) => next();
try { subscriptionGuard = require('../middleware/subscriptionGuard'); } catch {}

const STREAMING_ENABLED = process.env.ENABLE_STREAMING === 'true';

// ── Guard: Gemini must be configured ─────────────────────────────────────────
function geminiAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

// ============================================================================
// GET /api/ai/chat/session
// ============================================================================
router.get('/chat/session', protect, async (req, res) => {
  const { subject_id, subtopic_id } = req.query;
  const studentId = req.user.id;

  try {
    const filters      = ['s.student_id = :studentId'];
    const replacements = { studentId };

    if (subject_id)  { filters.push('s.subject_id = :subject_id');   replacements.subject_id  = subject_id;  }
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
    const messages  = await sequelize.query(
      `SELECT role, content, created_at
       FROM ai_chat_messages
       WHERE session_id = :sessionId
       ORDER BY created_at DESC LIMIT 10`,
      { replacements: { sessionId }, type: QueryTypes.SELECT }
    );

    return res.json({
      success:    true,
      session_id: sessionId,
      messages:   messages.reverse(),
    });

  } catch (err) {
    console.error('[AI Chat Session]', err.message);
    return res.status(500).json({ success: false, error: 'Failed to restore session' });
  }
});

// ============================================================================
// POST /api/ai/chat
// ============================================================================
router.post('/chat', protect, subscriptionGuard, aiLimiter, async (req, res) => {
  const { message, context = {}, session_id } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({
      success:    false,
      error:      'message is required',
      error_code: 'MISSING_MESSAGE',
    });
  }

  if (!geminiAvailable()) {
    return res.status(503).json({
      success:    false,
      error:      'AI chat is not configured. Please set GEMINI_API_KEY in server/.env',
      error_code: 'AI_NOT_CONFIGURED',
    });
  }

  const studentId = req.user.id;

  const {
    subject_name  = '',
    subtopic_name = '',
    weak_topics   = [],
    subject_id    = null,
    subtopic_id   = null,
    exam_board    = '',
    exam_date     = null,
    topic_name    = null,
    topic_id      = null,
    difficulty    = null,
    quiz_size     = 5,
  } = context;

  try {
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
          type: QueryTypes.SELECT,
        }
      );
      sessionId = newSession[0]?.id;
    }

    updateLearningProfile(studentId, { subjectId: subject_id }).catch((err) => {
      console.warn('[AI Chat] updateLearningProfile background error:', err.message);
    });

    const [historyRows, legacyMemory, enrichedMemory] = await Promise.all([
      sequelize.query(
        `SELECT role, content FROM ai_chat_messages
         WHERE session_id = :sessionId
         ORDER BY created_at DESC LIMIT 10`,
        { replacements: { sessionId }, type: QueryTypes.SELECT }
      ),
      fetchUserMemory({ studentId, subjectId: subject_id }),
      getMemoryForPrompt(studentId, { subjectId: subject_id }),
    ]);

    const conversationHistory = historyRows.reverse().map((m) => ({
      role:    m.role,
      content: m.content,
    }));

    const { formatMemoryBlock } = require('../services/userMemory');
    const legacyBlock           = formatMemoryBlock(legacyMemory);
    const enrichedBlock         = enrichedMemory.formatted;

    const combinedMemoryBlock = [enrichedBlock, legacyBlock]
      .filter(Boolean)
      .join('\n\n');

    const orchestratorContext = {
      subject_id,
      subject_name,
      subtopic_id,
      subtopic_name,
      topic_id,
      exam_board,
      exam_date,
      topic_name,
      difficulty,
      quiz_size,
    };

    const result = await orchestrate({
      message,
      context:             orchestratorContext,
      conversationHistory,
      userMemory: { _preformatted: combinedMemoryBlock },
    });

    const assistantContent = result.structured
      ? JSON.stringify(result.structured)
      : result.reply;

    await sequelize.query(
      `INSERT INTO ai_chat_messages (session_id, role, content)
       VALUES (:sessionId, 'user', :content)`,
      { replacements: { sessionId, content: message }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `INSERT INTO ai_chat_messages (session_id, role, content)
       VALUES (:sessionId, 'assistant', :content)`,
      { replacements: { sessionId, content: assistantContent }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = :sessionId`,
      { replacements: { sessionId }, type: QueryTypes.UPDATE }
    );

    const topicNames = extractTopicNames(message, result, topic_name);
    storeConversation(studentId, sessionId, {
      message,
      response:   result.reply?.slice(0, 500) || '',
      intentTags: [result.intent].filter(Boolean),
      topicNames,
      subjectId:  subject_id || null,
    }).catch((err) => {
      console.warn('[AI Chat] storeConversation error:', err.message);
    });

    const nextAction = deriveNextAction(result.intent, enrichedMemory, subject_name);

    sequelize.query(
      `DELETE FROM ai_chat_sessions WHERE updated_at < NOW() - INTERVAL '30 days'`,
      { type: QueryTypes.DELETE }
    ).catch(() => {});

    return res.json({
      success:          true,
      reply:            result.reply,
      structured:       result.structured,
      intent:           result.intent,
      db_results_found: result.db_results_found,
      session_id:       sessionId,
      memory_updated:   true,
      next_action:      nextAction,
    });

  } catch (err) {
    console.error('[AI Chat]', err.message);
    return res.status(500).json({
      success:    false,
      error:      'AI chat unavailable. Please try again.',
      error_code: 'ORCHESTRATOR_ERROR',
    });
  }
});

// ============================================================================
// POST /api/ai/chat/stream
// v2: Updated to use @google/genai SDK for streaming.
// ============================================================================
router.post('/chat/stream', protect, subscriptionGuard, aiLimiter, async (req, res) => {
  if (!STREAMING_ENABLED) {
    return res.status(404).json({
      success:    false,
      error:      'Streaming is not enabled. Set ENABLE_STREAMING=true in server/.env',
      error_code: 'STREAMING_DISABLED',
    });
  }

  if (!geminiAvailable()) {
    return res.status(503).json({
      success: false, error: 'GEMINI_API_KEY not configured', error_code: 'AI_NOT_CONFIGURED',
    });
  }

  const { message, context = {}, session_id } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  const studentId = req.user.id;
  const { subject_id = null } = context;

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendChunk = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let sessionId = session_id || null;
    if (!sessionId) {
      const newSession = await sequelize.query(
        `INSERT INTO ai_chat_sessions (student_id, subject_id, subtopic_id)
         VALUES (:studentId, :subjectId, NULL)
         RETURNING id`,
        { replacements: { studentId, subjectId: subject_id || null }, type: QueryTypes.SELECT }
      );
      sessionId = newSession[0]?.id;
    }

    const [memoryContext] = await Promise.all([
      getMemoryForPrompt(studentId, { subjectId: subject_id }),
      updateLearningProfile(studentId, { subjectId: subject_id }).catch(() => {}),
    ]);

    // v2: new @google/genai SDK streaming
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const systemContext = memoryContext.formatted
      ? `${memoryContext.formatted}\n\nYou are AISchoolonair, a friendly AI tutor for Nigerian secondary school students.`
      : 'You are AISchoolonair, a friendly AI tutor for Nigerian secondary school students.';

    const streamResult = await ai.models.generateContentStream({
      model:    'gemini-2.0-flash',
      contents: `${systemContext}\n\nStudent: ${message}\nAISchoolonair:`,
    });

    let fullReply = '';
    for await (const chunk of streamResult) {
      const text = chunk.text;
      if (text) {
        fullReply += text;
        sendChunk({ chunk: text });
      }
    }

    await sequelize.query(
      `INSERT INTO ai_chat_messages (session_id, role, content)
       VALUES (:sessionId, 'user', :content)`,
      { replacements: { sessionId, content: message }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `INSERT INTO ai_chat_messages (session_id, role, content)
       VALUES (:sessionId, 'assistant', :content)`,
      { replacements: { sessionId, content: fullReply.slice(0, 5000) }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = :sessionId`,
      { replacements: { sessionId }, type: QueryTypes.UPDATE }
    );

    storeConversation(studentId, sessionId, {
      message,
      response:   fullReply.slice(0, 500),
      intentTags: ['general_chat'],
      subjectId:  subject_id || null,
    }).catch(() => {});

    sendChunk({ done: true, session_id: sessionId, intent: 'general_chat' });
    res.end();

  } catch (err) {
    console.error('[AI Chat Stream]', err.message);
    sendChunk({ error: 'Stream failed. Please try again.', done: true });
    res.end();
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function extractTopicNames(message, result, contextTopicName) {
  const names = new Set();
  if (contextTopicName) names.add(contextTopicName);
  if (result.structured?.questions) {
    for (const q of result.structured.questions.slice(0, 5)) {
      if (q.topic) names.add(q.topic);
    }
  }
  if (result.structured?.quiz_title) {
    names.add(result.structured.quiz_title.replace(/^Quiz on\s+/i, '').slice(0, 60));
  }
  return [...names].slice(0, 5);
}

function deriveNextAction(intent, enrichedMemory, subjectName) {
  if (!enrichedMemory?.weakTopics?.length) return null;
  const topWeak = enrichedMemory.weakTopics[0];
  if (intent === 'explain_topic' && topWeak) {
    return {
      type:    'suggest_quiz',
      label:   `Practice quiz: ${topWeak.topic_name}`,
      subject: subjectName || topWeak.subject_name,
      topic:   topWeak.topic_name,
      reason:  `You scored ${Math.round(topWeak.accuracy_pct)}% on this topic recently.`,
    };
  }
  if (intent === 'generate_quiz' && topWeak) {
    return {
      type:    'suggest_review',
      label:   `Review notes: ${topWeak.topic_name}`,
      subject: subjectName || topWeak.subject_name,
      topic:   topWeak.topic_name,
      reason:  `This is your weakest topic (${Math.round(topWeak.accuracy_pct)}% accuracy).`,
    };
  }
  return null;
}

module.exports = router;
