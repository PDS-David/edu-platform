// server/services/userMemory.js
// -------------------------------------------------------------------------
// User Memory Service — AISchoolonair
//
// Fetches three classes of contextual memory for a student so they can be
// injected into every AI prompt, making AISchoolonair feel like a tutor who
// actually knows the student.
//
// Memory sources:
//   1. CHAT HISTORY   — last 10 messages across ALL sessions for this user
//                       (not just the current session, so the AI can refer
//                        to things discussed in previous conversations)
//   2. ENROLLMENTS    — active courses the student is enrolled in, with
//                        subject name, course title, and progress %
//   3. RELEVANT TOPICS — subtopics the student has recently interacted with,
//                        derived from subtopic_progress and practice_attempts,
//                        scoped to the current subject when subject_id is known
//
// Exported:
//   fetchUserMemory({ studentId, subjectId? })  → Promise<UserMemory>
//   formatMemoryBlock(memory)                   → string  (ready to paste into a prompt)
//
// UserMemory shape:
// {
//   recent_messages:   [ { role, content, created_at } ],   // up to 10
//   enrolled_courses:  [ { course_title, subject_name, progress_pct, status } ],
//   relevant_topics:   [ { topic_name, subtopic_name, resources_done, practice_done, quiz_done } ],
// }
// -------------------------------------------------------------------------

'use strict';

const { QueryTypes } = require('sequelize');
const sequelize      = require('../config/database');

// =============================================================================
// PRIMARY ENTRY POINT
// =============================================================================

/**
 * fetchUserMemory({ studentId, subjectId })
 *
 * @param {string}  studentId   Required. UUID of the student (req.user.id).
 * @param {string}  [subjectId] Optional. Scopes relevant_topics to one subject.
 *
 * @returns {Promise<object>}  Memory object with three arrays.
 */
async function fetchUserMemory({ studentId, subjectId = null }) {
  if (!studentId) return emptyMemory();

  // Run all three queries in parallel — none depend on each other
  const [recent_messages, enrolled_courses, relevant_topics] = await Promise.all([
    fetchRecentMessages(studentId),
    fetchEnrolledCourses(studentId),
    fetchRelevantTopics(studentId, subjectId),
  ]);

  return { recent_messages, enrolled_courses, relevant_topics };
}

// =============================================================================
// QUERY 1 — Last 10 messages across all sessions for this student
// =============================================================================
async function fetchRecentMessages(studentId) {
  try {
    return await sequelize.query(
      `SELECT
         m.role,
         m.content,
         m.created_at
       FROM   ai_chat_messages  m
       JOIN   ai_chat_sessions  s ON s.id = m.session_id
       WHERE  s.student_id = :studentId
       ORDER  BY m.created_at DESC
       LIMIT  10`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );
  } catch {
    return [];
  }
}

// =============================================================================
// QUERY 2 — Active course enrollments with subject and progress
// =============================================================================
async function fetchEnrolledCourses(studentId) {
  try {
    return await sequelize.query(
      `SELECT
         c.title                    AS course_title,
         s.name                     AS subject_name,
         s.id                       AS subject_id,
         e.progress_percentage      AS progress_pct,
         e.status
       FROM   enrollments  e
       JOIN   courses       c ON c.id = e.course_id
       JOIN   subjects      s ON s.id = c.subject_id
       WHERE  e.student_id = :studentId
         AND  e.status     = 'active'
       ORDER  BY e.enrollment_date DESC
       LIMIT  10`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );
  } catch {
    return [];
  }
}

// =============================================================================
// QUERY 3 — Recently touched subtopics with completion state
//
// Strategy:
//   a) subtopic_progress rows (student has explicitly started a subtopic)
//   b) practice_attempts in the last 14 days (questions answered, even without
//      a progress row — covers students who haven't formally started a subtopic
//      but have been practising questions from it)
//
// Both are unioned, deduplicated, and capped at 10 rows.
// If subjectId is given, results are filtered to that subject only.
// =============================================================================
async function fetchRelevantTopics(studentId, subjectId) {
  try {
    const subjectFilter  = subjectId ? 'AND st.subject_id = :subjectId' : '';
    const replacements   = { studentId, subjectId: subjectId || null };

    return await sequelize.query(
      `SELECT DISTINCT ON (st.id)
         COALESCE(t.name, t.title, 'Unknown Topic')  AS topic_name,
         st.name                                      AS subtopic_name,
         st.id                                        AS subtopic_id,
         COALESCE(sp.resources_completed, false)      AS resources_done,
         COALESCE(sp.practice_completed,  false)      AS practice_done,
         COALESCE(sp.quiz_completed,      false)      AS quiz_done,
         COALESCE(sp.updated_at, pa_latest.last_seen) AS last_activity
       FROM subtopics st
       LEFT JOIN topics    t  ON t.id  = st.topic_id
       LEFT JOIN subjects  s  ON s.id  = st.subject_id

       -- explicit progress rows
       LEFT JOIN subtopic_progress sp
              ON sp.subtopic_id = st.id
             AND sp.student_id  = :studentId

       -- recent practice attempts (last 14 days), aggregated to one row per subtopic
       LEFT JOIN (
         SELECT q.subtopic_id, MAX(pa.attempted_at) AS last_seen
         FROM   practice_attempts pa
         JOIN   questions          q  ON q.id = pa.question_id
         WHERE  pa.student_id   = :studentId
           AND  pa.attempted_at > NOW() - INTERVAL '14 days'
           AND  q.subtopic_id   IS NOT NULL
         GROUP  BY q.subtopic_id
       ) pa_latest ON pa_latest.subtopic_id = st.id

       WHERE (
         sp.student_id   = :studentId          -- has a progress row
         OR pa_latest.subtopic_id IS NOT NULL  -- OR practised recently
       )
       ${subjectFilter}
       ORDER  BY st.id, last_activity DESC NULLS LAST
       LIMIT  10`,
      { replacements, type: QueryTypes.SELECT }
    );
  } catch {
    return [];
  }
}

// =============================================================================
// FORMAT HELPER — converts memory object into a prompt-ready text block
// =============================================================================

/**
 * formatMemoryBlock(memory)
 *
 * Produces a compact plain-text block for injection into any prompt.
 * Returns an empty string if memory is entirely empty (avoids wasting tokens).
 *
 * @param {object} memory  Result of fetchUserMemory()
 * @returns {string}
 */
function formatMemoryBlock(memory) {
  if (!memory) return '';

  const sections = [];

  // ── Enrolled courses ──────────────────────────────────────────────────────
  if (memory.enrolled_courses?.length) {
    const lines = memory.enrolled_courses.map((c) =>
      `  - ${c.course_title} (${c.subject_name}) — ${Math.round(c.progress_pct || 0)}% complete`
    );
    sections.push(`ENROLLED COURSES:\n${lines.join('\n')}`);
  }

  // ── Relevant topics ───────────────────────────────────────────────────────
  if (memory.relevant_topics?.length) {
    const lines = memory.relevant_topics.map((t) => {
      const done  = [];
      if (t.resources_done) done.push('resources');
      if (t.practice_done)  done.push('practice');
      if (t.quiz_done)      done.push('quiz');
      const status = done.length
        ? `completed: ${done.join(', ')}`
        : 'in progress';
      return `  - ${t.topic_name} > ${t.subtopic_name} (${status})`;
    });
    sections.push(`TOPICS RECENTLY STUDIED:\n${lines.join('\n')}`);
  }

  // ── Recent chat messages ──────────────────────────────────────────────────
  if (memory.recent_messages?.length) {
    // Reverse so oldest first (chronological reading order)
    const ordered = [...memory.recent_messages].reverse();
    const lines   = ordered.map((m) =>
      `  ${m.role === 'assistant' ? 'AISchoolonair' : 'Student'}: ${
        // Truncate very long messages so the memory block stays compact
        m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content
      }`
    );
    sections.push(`RECENT CONVERSATION HISTORY:\n${lines.join('\n')}`);
  }

  if (!sections.length) return '';

  return (
    '--- STUDENT MEMORY CONTEXT (use this to personalise your response) ---\n' +
    sections.join('\n\n') +
    '\n--- END MEMORY CONTEXT ---'
  );
}

// =============================================================================
// HELPERS
// =============================================================================
function emptyMemory() {
  return { recent_messages: [], enrolled_courses: [], relevant_topics: [] };
}

// =============================================================================
// EXPORTS
// =============================================================================
module.exports = { fetchUserMemory, formatMemoryBlock };
