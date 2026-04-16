'use strict';

/**
 * Recommendation Engine
 *
 * Generates:
 * - Next best subtopics
 * - Weak areas to revisit
 * - Smart learning path
 *
 * Inputs:
 *   - subtopic_progress
 *   - event_store (optional behavioral signals)
 */

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

// ─────────────────────────────────────────────
// CORE ENGINE
// ─────────────────────────────────────────────

async function getRecommendations(studentId, limit = 5) {
  if (!studentId) {
    throw new Error('studentId is required');
  }

  // 1️⃣ Weak subtopics (NOT completed OR low engagement)
  const weakSubtopics = await sequelize.query(
    `
    SELECT
      st.id,
      st.name,
      st.topic_id,
      st.subject_id,

      COALESCE(sp.resources_completed, false) AS resources_completed,
      COALESCE(sp.practice_completed, false) AS practice_completed,
      COALESCE(sp.quiz_completed, false) AS quiz_completed,

      (
        (CASE WHEN sp.resources_completed THEN 1 ELSE 0 END) +
        (CASE WHEN sp.practice_completed THEN 1 ELSE 0 END) +
        (CASE WHEN sp.quiz_completed THEN 1 ELSE 0 END)
      ) AS completion_score

    FROM subtopics st

    LEFT JOIN subtopic_progress sp
      ON sp.subtopic_id = st.id
      AND sp.student_id = :studentId

    WHERE
      (
        sp.subtopic_id IS NULL
        OR
        (sp.resources_completed = false
         OR sp.practice_completed = false
         OR sp.quiz_completed = false)
      )

    ORDER BY completion_score ASC, st.order_index ASC
    LIMIT :limit
    `,
    {
      replacements: { studentId, limit },
      type: QueryTypes.SELECT,
    }
  );

  // 2️⃣ Recently active subtopics (behavior-based signal)
  const recentActivity = await sequelize.query(
    `
    SELECT
      payload->>'subtopicId' AS subtopic_id,
      COUNT(*) AS activity_count
    FROM event_store
    WHERE event_type = 'SUBTOPIC_ACTIVITY'
      AND payload->>'studentId' = :studentId
    GROUP BY payload->>'subtopicId'
    ORDER BY activity_count DESC
    LIMIT 5
    `,
    {
      replacements: { studentId: String(studentId) },
      type: QueryTypes.SELECT,
    }
  );

  // 3️⃣ Merge intelligence
  const prioritized = mergeRecommendations(weakSubtopics, recentActivity);

  return {
    weak: weakSubtopics,
    recent: recentActivity,
    recommended: prioritized,
  };
}

// ─────────────────────────────────────────────
// MERGE LOGIC (SMART PRIORITIZATION)
// ─────────────────────────────────────────────

function mergeRecommendations(weak, recent) {
  const recentMap = new Map();

  for (const r of recent) {
    recentMap.set(Number(r.subtopic_id), Number(r.activity_count));
  }

  return weak
    .map((item) => {
      const activityBoost = recentMap.get(item.id) || 0;

      return {
        ...item,
        priority_score: (3 - item.completion_score) + activityBoost,
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 5);
}

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  getRecommendations,
};
