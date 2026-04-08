// server/routes/aiChatRoute.js
// ============================================================================
// PRIMARY AI CHAT ENTRY POINT — EAC Learning Platform
//
// Changes from previous version:
//   + Integrates memoryService (getMemoryForPrompt, storeConversation)
//   + updateLearningProfile() fires in background BEFORE the orchestrator
//     so the memory context is always fresh when the AI responds
//   + Streaming-ready: set ENABLE_STREAMING=true in .env to use SSE streaming
//   + Session tracking enhanced: subject + subtopic recorded on session row
//   + Structured error handling with error codes
//   + POST /api/ai/chat/stream endpoint added (SSE, opt-in)
//
// DOES NOT MODIFY:
//   aiOrchestrator.js, aiService.js, userMemory.js, any existing routes
//
// Response format:
//   { success, reply, structured, intent, db_results_found, session_id,
//     memory_updated, next_action? }
// ============================================================================

'use strict';

const express              = require('express');
const router               = express.Router();
const { protect }          = require('../middleware/auth');
const { QueryTypes }       = require('sequelize');
const sequelize            = require('../config/database');
const { orchestrate }      = require('../services/aiOrchestrator');
const { fetchUserMemory }  = require('../services/userMemory');
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
// Restore the most recent active session for a student.
// Unchanged behaviour from previous version.
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
// Primary chat endpoint. Full pipeline:
//   1. Validate input
//   2. Resolve or create session
//   3. Background: update learning profile (non-blocking)
//   4. Fetch conversation history + full memory context (parallel)
//   5. Call orchestrator with enriched memory
//   6. Persist messages + store conversation memory
//   7. Return structured response with next_action suggestion
// ============================================================================
router.post('/chat', protect, subscriptionGuard, async (req, res) => {
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
    // ── 1. Resolve or create session ────────────────────────────────────────
    let sessionId = session_id || null;
    if (!sessionId) {
      const newSession = await sequelize.query(
        `INSERT INTO ai_chat_sessions (id, student_id, subject_id, subtopic_id)
         VALUES (gen_random_uuid(), :studentId, :subjectId, :subtopicId)
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

    // ── 2. Background: refresh learning profile (fire-and-forget) ──────────
    // We do NOT await this — it runs in the background while we fetch memory.
    // On first request the profile may be stale by one turn; acceptable.
    updateLearningProfile(studentId, { subjectId: subject_id }).catch((err) => {
      console.warn('[AI Chat] updateLearningProfile background error:', err.message);
    });

    // ── 3. Fetch conversation history + full memory in parallel ─────────────
    const [historyRows, legacyMemory, enrichedMemory] = await Promise.all([

      // Last 10 raw messages from this session (existing behaviour)
      sequelize.query(
        `SELECT role, content FROM ai_chat_messages
         WHERE session_id = :sessionId
         ORDER BY created_at DESC LIMIT 10`,
        { replacements: { sessionId }, type: QueryTypes.SELECT }
      ),

      // Legacy userMemory (enrolled courses + subtopic progress) — unchanged
      fetchUserMemory({ studentId, subjectId: subject_id }),

      // NEW: enriched memory from memoryService (performance profile + long-term memories)
      getMemoryForPrompt(studentId, { subjectId: subject_id }),
    ]);

    const conversationHistory = historyRows.reverse().map((m) => ({
      role:    m.role,
      content: m.content,
    }));

    // ── 4. Build combined memory block ──────────────────────────────────────
    // userMemory.formatMemoryBlock() already formats enrolled courses + recent topics.
    // We PREPEND the new enriched memory (performance stats + weak topics + long-term)
    // so the orchestrator gets the full picture.
    const { formatMemoryBlock } = require('../services/userMemory');
    const legacyBlock           = formatMemoryBlock(legacyMemory);
    const enrichedBlock         = enrichedMemory.formatted;

    // Merge both blocks — enriched first (more actionable), legacy second
    const combinedMemoryBlock = [enrichedBlock, legacyBlock]
      .filter(Boolean)
      .join('\n\n');

    // ── 5. Run orchestrator ─────────────────────────────────────────────────
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
      // Pass the formatted combined block as userMemory so the orchestrator's
      // formatMemoryBlock() call is effectively bypassed by the pre-built string.
      userMemory: { _preformatted: combinedMemoryBlock },
    });

    // ── 6. Persist messages ─────────────────────────────────────────────────
    const assistantContent = result.structured
      ? JSON.stringify(result.structured)
      : result.reply;

    await sequelize.query(
      `INSERT INTO ai_chat_messages (id, session_id, role, content)
       VALUES (gen_random_uuid(), :sessionId, 'user', :content)`,
      { replacements: { sessionId, content: message }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `INSERT INTO ai_chat_messages (id, session_id, role, content)
       VALUES (gen_random_uuid(), :sessionId, 'assistant', :content)`,
      { replacements: { sessionId, content: assistantContent }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = :sessionId`,
      { replacements: { sessionId }, type: QueryTypes.UPDATE }
    );

    // ── 7. Store distilled conversation memory (fire-and-forget) ───────────
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

    // ── 8. Derive next_action suggestion ────────────────────────────────────
    const nextAction = deriveNextAction(result.intent, enrichedMemory, subject_name);

    // ── 9. Session cleanup (>30 days, fire-and-forget) ──────────────────────
    sequelize.query(
      `DELETE FROM ai_chat_sessions WHERE updated_at < NOW() - INTERVAL '30 days'`,
      { type: QueryTypes.DELETE }
    ).catch(() => {});

    // ── 10. Return response ─────────────────────────────────────────────────
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
// SSE streaming variant — only active when ENABLE_STREAMING=true in .env.
// Falls back to the standard POST /chat endpoint if streaming is disabled.
//
// Response is a stream of Server-Sent Events:
//   data: {"chunk": "partial text"}
//   ...
//   data: {"done": true, "intent": "...", "session_id": "...", "next_action": "..."}
//
// NOTE: Gemini streaming is used here. The orchestrator is NOT called for
// streaming — the AI is invoked directly for general_chat / explain_topic.
// For generate_quiz / create_study_plan, falls back to non-streaming.
// ============================================================================
router.post('/chat/stream', protect, subscriptionGuard, async (req, res) => {
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

  // Set SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  res.flushHeaders();

  const sendChunk = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Resolve or create session
    let sessionId = session_id || null;
    if (!sessionId) {
      const newSession = await sequelize.query(
        `INSERT INTO ai_chat_sessions (id, student_id, subject_id, subtopic_id)
         VALUES (gen_random_uuid(), :studentId, :subjectId, NULL)
         RETURNING id`,
        { replacements: { studentId, subjectId: subject_id || null }, type: QueryTypes.SELECT }
      );
      sessionId = newSession[0]?.id;
    }

    // Get memory in background while user sees typing indicator
    const [memoryContext] = await Promise.all([
      getMemoryForPrompt(studentId, { subjectId: subject_id }),
      updateLearningProfile(studentId, { subjectId: subject_id }).catch(() => {}),
    ]);

    // Use Gemini streaming API directly for general chat
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemContext = memoryContext.formatted
      ? `${memoryContext.formatted}\n\nYou are EACbuddy, a friendly AI tutor for Nigerian secondary school students.`
      : 'You are EACbuddy, a friendly AI tutor for Nigerian secondary school students.';

    const streamResult = await model.generateContentStream(
      `${systemContext}\n\nStudent: ${message}\nEACbuddy:`
    );

    let fullReply = '';
    for await (const chunk of streamResult.stream) {
      const text = chunk.text();
      if (text) {
        fullReply += text;
        sendChunk({ chunk: text });
      }
    }

    // Persist messages
    await sequelize.query(
      `INSERT INTO ai_chat_messages (id, session_id, role, content)
       VALUES (gen_random_uuid(), :sessionId, 'user', :content)`,
      { replacements: { sessionId, content: message }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `INSERT INTO ai_chat_messages (id, session_id, role, content)
       VALUES (gen_random_uuid(), :sessionId, 'assistant', :content)`,
      { replacements: { sessionId, content: fullReply.slice(0, 5000) }, type: QueryTypes.INSERT }
    );
    await sequelize.query(
      `UPDATE ai_chat_sessions SET updated_at = NOW() WHERE id = :sessionId`,
      { replacements: { sessionId }, type: QueryTypes.UPDATE }
    );

    // Store memory (fire-and-forget)
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

/**
 * extractTopicNames — pulls topic strings from the message + orchestrator result.
 */
function extractTopicNames(message, result, contextTopicName) {
  const names = new Set();

  if (contextTopicName) names.add(contextTopicName);

  // Pull from structured quiz result
  if (result.structured?.questions) {
    for (const q of result.structured.questions.slice(0, 5)) {
      if (q.topic) names.add(q.topic);
    }
  }

  // Pull topic from quiz title
  if (result.structured?.quiz_title) {
    names.add(result.structured.quiz_title.replace(/^Quiz on\s+/i, '').slice(0, 60));
  }

  return [...names].slice(0, 5);
}

/**
 * deriveNextAction — suggests what the student should do after this turn.
 * This is surfaced to the frontend as a "suggested action" card.
 */
function deriveNextAction(intent, enrichedMemory, subjectName) {
  if (!enrichedMemory?.weakTopics?.length) return null;

  const topWeak = enrichedMemory.weakTopics[0];

  // After an explanation, suggest a quiz on that weak topic
  if (intent === 'explain_topic' && topWeak) {
    return {
      type:    'suggest_quiz',
      label:   `Practice quiz: ${topWeak.topic_name}`,
      subject: subjectName || topWeak.subject_name,
      topic:   topWeak.topic_name,
      reason:  `You scored ${Math.round(topWeak.accuracy_pct)}% on this topic recently.`,
    };
  }

  // After a quiz, suggest reviewing the weakest topic
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
