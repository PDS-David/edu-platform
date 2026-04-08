// server/services/memoryService.js
// ============================================================================
// AI Memory Service — EAC Learning Platform
//
// Manages three tables (created in database/memory_schema.sql):
//   user_learning_profile   — per-student aggregated performance snapshot
//   user_weak_topics        — AI-managed weak topic cache
//   ai_conversation_memory  — long-term distilled conversation facts
//
// READS FROM (never modifies):
//   practice_attempts       — primary performance source
//   quiz_attempts           — (quiz_id, student_id, score, percentage, status)
//   subtopic_quiz_attempts  — (student_id, subtopic_id, accuracy_pct, completed_at)
//   student_answers         — (attempt_id, question_id, is_correct, time_spent_seconds)
//   learning_gaps           — (student_id, subject_id, topic_name, gap_severity, is_resolved)
//   ai_chat_sessions / ai_chat_messages — owned by aiChatRoute.js (read-only here)
//
// DOES NOT MODIFY:
//   Any existing table or route. Zero breaking changes.
//
// Exports:
//   updateLearningProfile(userId, { subjectId? })  → Promise<ProfileRow>
//   getLearningProfile(userId)                      → Promise<ProfileRow|null>
//   storeConversation(userId, sessionId, { message, response, intentTags, topicNames, subjectId })
//   getMemoryForPrompt(userId, { subjectId? })      → Promise<MemoryContext>
//   markMemoryUsed(memoryId)                        → Promise<void>
// ============================================================================

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

// ============================================================================
// A. updateLearningProfile(userId, options)
//
// Refreshes user_learning_profile + user_weak_topics for one student.
// Designed to be called:
//   - After a quiz is submitted (fire-and-forget)
//   - From the AI chat route before building the memory context
//   - On a schedule (scheduledJobs.js) — not mandatory
//
// @param {string}  userId
// @param {object}  [options]
//   subjectId {string}  When given, also refreshes weak topics for that subject
//
// @returns {Promise<object>}  The updated profile row
// ============================================================================
async function updateLearningProfile(userId, { subjectId = null } = {}) {
  if (!userId) throw new Error('[memoryService] updateLearningProfile: userId required');

  // ── 1. Gather raw stats from existing tables in parallel ─────────────────
  const [
    practiceStats,
    recentStats,
    userRow,
    quizStats,
    subtopicQuizStats,
    gapStats,
    weakTopicRows,
  ] = await Promise.all([

    // Overall practice_attempts accuracy
    sequelize.query(
      `SELECT
         COUNT(*)::INTEGER                                                           AS total_attempts,
         COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 2), 0)   AS overall_accuracy
       FROM practice_attempts
       WHERE student_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),

    // Last-7-day accuracy (for trend)
    sequelize.query(
      `SELECT
         COALESCE(ROUND(AVG(CASE WHEN is_correct THEN 100.0 ELSE 0 END), 2), 0) AS accuracy_7d
       FROM practice_attempts
       WHERE student_id = :userId
         AND attempted_at > NOW() - INTERVAL '7 days'`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),

    // XP + streak from users table
    sequelize.query(
      `SELECT
         COALESCE(xp_points, 0)        AS xp_points,
         COALESCE(study_streak_days, 0) AS study_streak_days,
         last_login_at
       FROM users WHERE id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),

    // quiz_attempts (course-level quizzes)
    sequelize.query(
      `SELECT COUNT(*)::INTEGER AS total_quiz_attempts
       FROM quiz_attempts
       WHERE student_id = :userId AND status = 'completed'`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),

    // subtopic_quiz_attempts (AI buddy quizzes)
    sequelize.query(
      `SELECT COUNT(*)::INTEGER AS total_subtopic_quizzes
       FROM subtopic_quiz_attempts
       WHERE student_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),

    // learning_gaps aggregation (existing table — read-only)
    sequelize.query(
      `SELECT
         COUNT(*)::INTEGER                                              AS active_gap_count,
         COUNT(*) FILTER (WHERE gap_severity = 'critical')::INTEGER    AS critical_gap_count
       FROM learning_gaps
       WHERE student_id = :userId AND is_resolved = false`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),

    // Top weak topics from practice_attempts (last 30 days, min 3 attempts, <70% accuracy)
    sequelize.query(
      `SELECT
         q.topic                                                                    AS topic_name,
         q.subject_id_uuid                                                          AS subject_id,
         q.subtopic_id,
         COUNT(*)::INTEGER                                                          AS attempts_count,
         ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 2)             AS accuracy_pct,
         MAX(pa.attempted_at)                                                       AS last_attempted_at,
         lg.id                                                                      AS learning_gap_id,
         lg.gap_severity
       FROM practice_attempts pa
       JOIN questions q ON q.id = pa.question_id
       LEFT JOIN learning_gaps lg
              ON lg.student_id = pa.student_id
             AND lg.subject_id = q.subject_id_uuid
             AND LOWER(lg.topic_name) = LOWER(q.topic)
             AND lg.is_resolved = false
       WHERE pa.student_id = :userId
         AND pa.attempted_at > NOW() - INTERVAL '30 days'
         AND q.topic IS NOT NULL
         ${subjectId ? 'AND q.subject_id_uuid = :subjectId' : ''}
       GROUP BY q.topic, q.subject_id_uuid, q.subtopic_id, lg.id, lg.gap_severity
       HAVING COUNT(*) >= 3
         AND ROUND(AVG(CASE WHEN pa.is_correct THEN 100.0 ELSE 0 END), 2) < 70
       ORDER BY accuracy_pct ASC
       LIMIT 10`,
      {
        replacements: { userId, ...(subjectId ? { subjectId } : {}) },
        type: QueryTypes.SELECT,
      }
    ),
  ]);

  const p   = practiceStats[0]      || {};
  const r   = recentStats[0]        || {};
  const u   = userRow[0]            || {};
  const q   = quizStats[0]          || {};
  const sq  = subtopicQuizStats[0]  || {};
  const g   = gapStats[0]           || {};

  // ── 2. Compute accuracy trend ─────────────────────────────────────────────
  const overall7d  = parseFloat(r.accuracy_7d)     || 0;
  const overallAll = parseFloat(p.overall_accuracy) || 0;
  let accuracyTrend = 'stable';
  if (overall7d - overallAll > 5)  accuracyTrend = 'improving';
  if (overallAll - overall7d > 5)  accuracyTrend = 'declining';

  // ── 3. UPSERT user_learning_profile ──────────────────────────────────────
  const profileRows = await sequelize.query(
    `INSERT INTO user_learning_profile
       (id, student_id, overall_accuracy_pct, total_questions_done,
        total_quiz_attempts, total_subtopic_quizzes,
        study_streak_days, xp_points, accuracy_trend,
        active_gap_count, critical_gap_count,
        last_activity_at, profile_updated_at)
     VALUES
       (uuid_generate_v4(), :userId, :overallAccuracy, :totalAttempts,
        :totalQuizAttempts, :totalSubtopicQuizzes,
        :streakDays, :xpPoints, :accuracyTrend,
        :activeGapCount, :criticalGapCount,
        :lastActivity, NOW())
     ON CONFLICT (student_id) DO UPDATE SET
       overall_accuracy_pct   = EXCLUDED.overall_accuracy_pct,
       total_questions_done   = EXCLUDED.total_questions_done,
       total_quiz_attempts    = EXCLUDED.total_quiz_attempts,
       total_subtopic_quizzes = EXCLUDED.total_subtopic_quizzes,
       study_streak_days      = EXCLUDED.study_streak_days,
       xp_points              = EXCLUDED.xp_points,
       accuracy_trend         = EXCLUDED.accuracy_trend,
       active_gap_count       = EXCLUDED.active_gap_count,
       critical_gap_count     = EXCLUDED.critical_gap_count,
       last_activity_at       = EXCLUDED.last_activity_at,
       profile_updated_at     = NOW()
     RETURNING *`,
    {
      replacements: {
        userId,
        overallAccuracy:      overallAll,
        totalAttempts:        parseInt(p.total_attempts)         || 0,
        totalQuizAttempts:    parseInt(q.total_quiz_attempts)    || 0,
        totalSubtopicQuizzes: parseInt(sq.total_subtopic_quizzes)|| 0,
        streakDays:           parseInt(u.study_streak_days)      || 0,
        xpPoints:             parseInt(u.xp_points)              || 0,
        accuracyTrend,
        activeGapCount:       parseInt(g.active_gap_count)       || 0,
        criticalGapCount:     parseInt(g.critical_gap_count)     || 0,
        lastActivity:         u.last_login_at || new Date().toISOString(),
      },
      type: QueryTypes.SELECT,
    }
  );

  // ── 4. UPSERT user_weak_topics (batch) ───────────────────────────────────
  for (const row of weakTopicRows) {
    const severity = classifySeverity(parseFloat(row.accuracy_pct));
    await sequelize.query(
      `INSERT INTO user_weak_topics
         (id, student_id, subject_id, topic_name, subtopic_id,
          accuracy_pct, attempts_count, last_attempted_at,
          severity, learning_gap_id, refreshed_at)
       VALUES
         (uuid_generate_v4(), :studentId, :subjectId, :topicName, :subtopicId,
          :accuracyPct, :attemptsCount, :lastAttemptedAt,
          :severity, :learningGapId, NOW())
       ON CONFLICT (student_id, subject_id, topic_name) DO UPDATE SET
         accuracy_pct      = EXCLUDED.accuracy_pct,
         attempts_count    = EXCLUDED.attempts_count,
         last_attempted_at = EXCLUDED.last_attempted_at,
         severity          = EXCLUDED.severity,
         learning_gap_id   = EXCLUDED.learning_gap_id,
         refreshed_at      = NOW()`,
      {
        replacements: {
          studentId:      userId,
          subjectId:      row.subject_id,
          topicName:      row.topic_name,
          subtopicId:     row.subtopic_id || null,
          accuracyPct:    parseFloat(row.accuracy_pct)  || 0,
          attemptsCount:  parseInt(row.attempts_count)  || 0,
          lastAttemptedAt:row.last_attempted_at         || null,
          severity,
          learningGapId:  row.learning_gap_id           || null,
        },
        type: QueryTypes.INSERT,
      }
    );
  }

  return profileRows[0] || null;
}

// ============================================================================
// B. getLearningProfile(userId)
//
// Returns the cached profile + weak topics for the AI to use.
// Does NOT run updateLearningProfile() — call that separately when needed.
//
// @returns {Promise<{profile, weakTopics}|null>}
// ============================================================================
async function getLearningProfile(userId) {
  if (!userId) return null;

  const [profile, weakTopics] = await Promise.all([
    sequelize.query(
      `SELECT ulp.*,
              u.first_name, u.last_name, u.role,
              s.name AS suggested_subject_name
       FROM user_learning_profile ulp
       JOIN users u ON u.id = ulp.student_id
       LEFT JOIN subjects s ON s.id = ulp.last_suggested_subject
       WHERE ulp.student_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT uwt.*, s.name AS subject_name
       FROM user_weak_topics uwt
       JOIN subjects s ON s.id = uwt.subject_id
       WHERE uwt.student_id = :userId
       ORDER BY uwt.severity DESC, uwt.accuracy_pct ASC
       LIMIT 10`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),
  ]);

  if (!profile.length) return null;
  return { profile: profile[0], weakTopics };
}

// ============================================================================
// C. storeConversation(userId, sessionId, payload)
//
// Distils a single conversation exchange into ai_conversation_memory.
// Called AFTER aiChatRoute.js has already persisted the raw messages to
// ai_chat_messages — this adds the AI's extracted "memory fact" on top.
//
// @param {string}  userId
// @param {string}  sessionId   ai_chat_sessions.id
// @param {object}  payload
//   message     {string}   The student's message
//   response    {string}   The AI's reply
//   intentTags  {string[]} e.g. ['explain_topic']
//   topicNames  {string[]} Topics discussed
//   subjectId   {string}   Optional subject UUID
//
// @returns {Promise<string>}  The new memory row's id
// ============================================================================
async function storeConversation(userId, sessionId, {
  message,
  response,
  intentTags  = [],
  topicNames  = [],
  subjectId   = null,
} = {}) {
  if (!userId || !message) return null;

  // Build a compact memory text — just the key fact, not the full exchange
  const memoryText = buildMemoryText(message, response, intentTags, topicNames);

  const rows = await sequelize.query(
    `INSERT INTO ai_conversation_memory
       (id, student_id, session_id, memory_text,
        subject_id, topic_names, intent_tags, created_at)
     VALUES
       (uuid_generate_v4(), :userId, :sessionId, :memoryText,
        :subjectId, :topicNames, :intentTags, NOW())
     RETURNING id`,
    {
      replacements: {
        userId,
        sessionId:  sessionId || null,
        memoryText,
        subjectId:  subjectId || null,
        topicNames: topicNames.length ? topicNames : [],
        intentTags: intentTags.length ? intentTags : [],
      },
      type: QueryTypes.SELECT,
    }
  );

  // Also update faq_topics in user_learning_profile if topic names are known
  if (topicNames.length) {
    await sequelize.query(
      `UPDATE user_learning_profile
       SET faq_topics = (
         SELECT ARRAY(
           SELECT DISTINCT unnest(faq_topics || :newTopics::TEXT[])
           LIMIT 10
         )
       ),
       profile_updated_at = NOW()
       WHERE student_id = :userId`,
      {
        replacements: { userId, newTopics: topicNames },
        type: QueryTypes.UPDATE,
      }
    );
  }

  return rows[0]?.id || null;
}

// ============================================================================
// D. getMemoryForPrompt(userId, options)
//
// Returns a structured memory context object ready to be formatted and
// injected into an AI prompt. Combines:
//   - user_learning_profile (profile snapshot)
//   - user_weak_topics      (top 5 weak topics)
//   - ai_conversation_memory (last 5 relevant memories)
//
// This is the PRIMARY function the orchestrator calls.
//
// @returns {Promise<MemoryContext>}
// {
//   profile:    {...},
//   weakTopics: [...],
//   memories:   [...],
//   formatted:  string   (ready to paste into a prompt)
// }
// ============================================================================
async function getMemoryForPrompt(userId, { subjectId = null } = {}) {
  if (!userId) return emptyContext();

  const [profileRows, weakTopics, memories] = await Promise.all([

    sequelize.query(
      `SELECT ulp.overall_accuracy_pct, ulp.total_questions_done,
              ulp.study_streak_days, ulp.xp_points,
              ulp.accuracy_trend, ulp.active_gap_count, ulp.critical_gap_count,
              ulp.faq_topics, ulp.last_suggested_action,
              u.first_name
       FROM user_learning_profile ulp
       JOIN users u ON u.id = ulp.student_id
       WHERE ulp.student_id = :userId`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    ),

    sequelize.query(
      `SELECT uwt.topic_name, uwt.accuracy_pct, uwt.severity,
              uwt.ai_recommendation, s.name AS subject_name
       FROM user_weak_topics uwt
       JOIN subjects s ON s.id = uwt.subject_id
       WHERE uwt.student_id = :userId
         ${subjectId ? 'AND uwt.subject_id = :subjectId' : ''}
       ORDER BY
         CASE uwt.severity
           WHEN 'critical' THEN 1 WHEN 'high' THEN 2
           WHEN 'medium'   THEN 3 ELSE 4
         END, uwt.accuracy_pct ASC
       LIMIT 5`,
      {
        replacements: { userId, ...(subjectId ? { subjectId } : {}) },
        type: QueryTypes.SELECT,
      }
    ),

    sequelize.query(
      `SELECT id, memory_text, topic_names, intent_tags, created_at
       FROM ai_conversation_memory
       WHERE student_id = :userId
         ${subjectId ? 'AND (subject_id = :subjectId OR subject_id IS NULL)' : ''}
       ORDER BY created_at DESC
       LIMIT 5`,
      {
        replacements: { userId, ...(subjectId ? { subjectId } : {}) },
        type: QueryTypes.SELECT,
      }
    ),
  ]);

  const profile = profileRows[0] || null;

  // Mark fetched memories as used (fire-and-forget)
  if (memories.length) {
    const ids = memories.map((m) => m.id);
    sequelize.query(
      `UPDATE ai_conversation_memory
       SET times_used = times_used + 1, last_used_at = NOW()
       WHERE id = ANY(:ids)`,
      { replacements: { ids }, type: QueryTypes.UPDATE }
    ).catch(() => {});
  }

  return {
    profile,
    weakTopics,
    memories,
    formatted: formatMemoryContext({ profile, weakTopics, memories }),
  };
}

// ============================================================================
// E. markMemoryUsed(memoryId)
// ============================================================================
async function markMemoryUsed(memoryId) {
  if (!memoryId) return;
  await sequelize.query(
    `UPDATE ai_conversation_memory
     SET times_used = times_used + 1, last_used_at = NOW()
     WHERE id = :memoryId`,
    { replacements: { memoryId }, type: QueryTypes.UPDATE }
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function classifySeverity(accuracyPct) {
  if (accuracyPct < 30) return 'critical';
  if (accuracyPct < 50) return 'high';
  if (accuracyPct < 70) return 'medium';
  return 'low';
}

function buildMemoryText(message, response, intentTags, topicNames) {
  const intent = intentTags[0] || 'general_chat';
  const topics = topicNames.length ? topicNames.join(', ') : 'general';

  // Compact one-line summary — keeps the memory block small
  const summary = response
    ? (response.length > 150 ? response.slice(0, 150) + '…' : response)
    : '';

  return `[${intent}] Topics: ${topics} | Student asked: "${
    message.slice(0, 100)
  }" | AI replied: "${summary}"`.trim();
}

/**
 * formatMemoryContext — builds the prompt-injection block from memory data.
 * Extends (does NOT replace) the block built by userMemory.formatMemoryBlock().
 */
function formatMemoryContext({ profile, weakTopics, memories }) {
  const sections = [];

  if (profile) {
    sections.push(
      `STUDENT PERFORMANCE SNAPSHOT:` +
      `\n  Overall accuracy: ${Math.round(profile.overall_accuracy_pct || 0)}%` +
      `\n  Questions done: ${profile.total_questions_done || 0}` +
      `\n  Study streak: ${profile.study_streak_days || 0} days` +
      `\n  XP: ${profile.xp_points || 0}` +
      `\n  Trend: ${profile.accuracy_trend || 'stable'}` +
      (profile.active_gap_count > 0
        ? `\n  ⚠️  Active learning gaps: ${profile.active_gap_count} (${profile.critical_gap_count} critical)`
        : '')
    );

    if (profile.faq_topics?.length) {
      sections.push(`FREQUENTLY ASKED TOPICS:\n  ${profile.faq_topics.slice(0, 5).join(', ')}`);
    }
  }

  if (weakTopics?.length) {
    const lines = weakTopics.map((t) =>
      `  - [${t.severity?.toUpperCase()}] ${t.topic_name} (${t.subject_name}): ${Math.round(t.accuracy_pct)}% accuracy`
    );
    sections.push(`CURRENT WEAK TOPICS:\n${lines.join('\n')}`);
  }

  if (memories?.length) {
    const lines = memories.map((m) => `  ${m.memory_text}`);
    sections.push(`LONG-TERM MEMORY (past sessions):\n${lines.join('\n')}`);
  }

  if (!sections.length) return '';

  return (
    '--- AI MEMORY CONTEXT ---\n' +
    sections.join('\n\n') +
    '\n--- END MEMORY CONTEXT ---'
  );
}

function emptyContext() {
  return { profile: null, weakTopics: [], memories: [], formatted: '' };
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  updateLearningProfile,
  getLearningProfile,
  storeConversation,
  getMemoryForPrompt,
  markMemoryUsed,
};
