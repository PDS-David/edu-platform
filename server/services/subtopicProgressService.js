'use strict';

/**
 * subtopicProgressService.js
 *
 * CORE PROGRESS ENGINE (A1.6)
 * - Orchestrates progress updates
 * - Delegates evaluation logic
 * - Ensures DB consistency
 */

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

const evaluateCompletion = require('./evaluateCompletion');
const syncProgressState = require('./progressSyncService');

/**
 * Fetch current progress row (if exists)
 */
async function getProgress(studentId, subtopicId) {
  const rows = await sequelize.query(
    `
    SELECT *
    FROM subtopic_progress
    WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
    LIMIT 1
    `,
    {
      replacements: { studentId, subtopicId },
      type: QueryTypes.SELECT,
    }
  );

  return rows[0] || null;
}

/**
 * UPSERT progress row safely
 */
async function upsertProgress(studentId, subtopicId, updates) {
  const existing = await getProgress(studentId, subtopicId);

  if (!existing) {
    return sequelize.query(
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
        updated_at
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
        NOW()
      )
      RETURNING *
      `,
      {
        replacements: {
          studentId,
          subtopicId,
          resources_completed: updates.resources_completed || false,
          practice_completed: updates.practice_completed || false,
          quiz_completed: updates.quiz_completed || false,
          notes_viewed: updates.notes_viewed || false,
          video_watched: updates.video_watched || false,
        },
        type: QueryTypes.INSERT,
      }
    );
  }

  return sequelize.query(
    `
    UPDATE subtopic_progress
    SET
      resources_completed = COALESCE(:resources_completed, resources_completed),
      practice_completed  = COALESCE(:practice_completed, practice_completed),
      quiz_completed      = COALESCE(:quiz_completed, quiz_completed),
      notes_viewed        = COALESCE(:notes_viewed, notes_viewed),
      video_watched       = COALESCE(:video_watched, video_watched),
      updated_at          = NOW()
    WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
    RETURNING *
    `,
    {
      replacements: {
        studentId,
        subtopicId,
        ...updates,
      },
      type: QueryTypes.UPDATE,
    }
  );
}

/**
 * MAIN ENTRY POINT
 * Called from routes when user interacts with learning content
 */
async function updateProgress(studentId, subtopicId, input = {}) {
  // 1. sync raw input state
  const normalizedInput = syncProgressState(input);

  // 2. write/update DB
  await upsertProgress(studentId, subtopicId, normalizedInput);

  // 3. re-fetch latest state
  const latest = await getProgress(studentId, subtopicId);

  // 4. evaluate completion state (A1.7)
  const evaluation = await evaluateCompletion(latest);

  // 5. persist evaluated state if needed
  if (evaluation.changed) {
    await upsertProgress(studentId, subtopicId, evaluation.flags);
  }

  // 6. final fetch
  const finalState = await getProgress(studentId, subtopicId);

  return {
    success: true,
    data: finalState,
    meta: evaluation.meta,
  };
}

module.exports = {
  updateProgress,
  getProgress,
  upsertProgress,
};
