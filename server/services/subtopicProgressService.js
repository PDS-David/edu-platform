'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const { computeSubtopicCompletion } = require('./progressEngine');

/**
 * Upsert subtopic progress safely (idempotent + concurrency-safe)
 *
 * RULES:
 * - one row per (student_id, subtopic_id)
 * - safe to call multiple times (no duplicates)
 * - partial updates allowed
 */
async function upsertSubtopicProgress({
  studentId,
  subtopicId,
  updates = {},
}) {
  if (!studentId || !subtopicId) {
    throw new Error('studentId and subtopicId are required');
  }

  const fields = {
    resources_completed: false,
    practice_completed: false,
    quiz_completed: false,
    notes_viewed: false,
    video_watched: false,
    ...updates,
  };

  // Compute completion state BEFORE writing
  const computed = computeSubtopicCompletion(fields);

  const result = await sequelize.query(
    `
    INSERT INTO subtopic_progress (
      student_id,
      subtopic_id,
      resources_completed,
      practice_completed,
      quiz_completed,
      notes_viewed,
      video_watched,
      created_at,
      updated_at,
      completed_at
    )
    VALUES (
      :studentId,
      :subtopicId,
      :resources_completed,
      :practice_completed,
      :quiz_completed,
      :notes_viewed,
      :video_watched,
      NOW(),
      NOW(),
      CASE WHEN :completed THEN NOW() ELSE NULL END
    )
    ON CONFLICT (student_id, subtopic_id)
    DO UPDATE SET
      resources_completed = EXCLUDED.resources_completed,
      practice_completed  = EXCLUDED.practice_completed,
      quiz_completed      = EXCLUDED.quiz_completed,
      notes_viewed        = EXCLUDED.notes_viewed,
      video_watched       = EXCLUDED.video_watched,
      updated_at          = NOW(),
      completed_at        = CASE
                              WHEN EXCLUDED.resources_completed
                               AND EXCLUDED.practice_completed
                               AND EXCLUDED.quiz_completed
                              THEN NOW()
                              ELSE subtopic_progress.completed_at
                            END
    RETURNING *;
    `,
    {
      replacements: {
        studentId,
        subtopicId,
        ...fields,
        completed: computed.completed,
      },
      type: QueryTypes.INSERT,
    }
  );

  return result?.[0]?.[0] || null;
}

/**
 * Fetch single progress row (safe helper)
 */
async function getSubtopicProgress(studentId, subtopicId) {
  const rows = await sequelize.query(
    `
    SELECT *
    FROM subtopic_progress
    WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
    `,
    {
      replacements: { studentId, subtopicId },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] || null;
}

module.exports = {
  upsertSubtopicProgress,
  getSubtopicProgress,
};
