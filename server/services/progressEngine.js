'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * Ensures a progress row exists (idempotent)
 */
async function ensureRow(studentId, subtopicId) {
  await sequelize.query(
    `
    INSERT INTO subtopic_progress (student_id, subtopic_id)
    VALUES (:studentId, :subtopicId)
    ON CONFLICT (student_id, subtopic_id)
    DO NOTHING
    `,
    {
      replacements: { studentId, subtopicId },
      type: QueryTypes.INSERT,
    }
  );
}

/**
 * Fetch current progress state
 */
async function getProgress(studentId, subtopicId) {
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

/**
 * Recompute completion state (single source of truth)
 */
function computeCompletion(row) {
  const resources = !!row.resources_completed;
  const practice = !!row.practice_completed;
  const quiz = !!row.quiz_completed;
  const notes = !!row.notes_viewed;
  const video = !!row.video_watched;

  return resources && practice && quiz && notes && video;
}

/**
 * Persist recomputed completion
 */
async function updateCompletion(studentId, subtopicId) {
  const row = await getProgress(studentId, subtopicId);
  if (!row) return null;

  const completed = computeCompletion(row);

  await sequelize.query(
    `
    UPDATE subtopic_progress
    SET completed_at = CASE
        WHEN :completed = true AND completed_at IS NULL
        THEN NOW()
        ELSE completed_at
    END
    WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
    `,
    {
      replacements: { studentId, subtopicId, completed },
      type: QueryTypes.UPDATE,
    }
  );

  return { completed };
}

/**
 * Generic field updater (safe + extensible)
 */
async function markField(studentId, subtopicId, field, value = true) {
  await ensureRow(studentId, subtopicId);

  await sequelize.query(
    `
    UPDATE subtopic_progress
    SET ${field} = :value,
        updated_at = NOW()
    WHERE student_id = :studentId
      AND subtopic_id = :subtopicId
    `,
    {
      replacements: { studentId, subtopicId, value },
      type: QueryTypes.UPDATE,
    }
  );

  return updateCompletion(studentId, subtopicId);
}

module.exports = {
  ensureRow,
  getProgress,
  computeCompletion,
  updateCompletion,
  markField,
};
