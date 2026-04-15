'use strict';

/**
 * A1 + A3 INTEGRATED PROGRESS SERVICE
 *
 * Responsibilities:
 * - Update subtopic progress safely (idempotent writes)
 * - Maintain consistency across progress flags
 * - Trigger analytics events (A3 Analytics Engine)
 * - Compute completion state centrally
 */

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../config/logger');

// A3 Analytics Engine integration
const {
  emitProgressUpdate,
} = require('./analyticsEngine');

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

/**
 * Normalize boolean inputs safely
 */
function toBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/**
 * Determine completion state
 */
function computeCompletion(flags) {
  return (
    flags.resources_completed &&
    flags.practice_completed &&
    flags.quiz_completed &&
    flags.notes_viewed &&
    flags.video_watched
  );
}

/* ─────────────────────────────────────────────────────────────
   CORE UPSERT LOGIC
───────────────────────────────────────────────────────────── */

/**
 * Create or update subtopic progress row (UPSERT logic)
 */
async function upsertProgress({
  studentId,
  subtopicId,
  resources_completed,
  practice_completed,
  quiz_completed,
  notes_viewed,
  video_watched,
}) {
  try {
    // 1. Check existing record
    const existing = await sequelize.query(
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

    const record = existing[0];

    const payload = {
      resources_completed: toBool(resources_completed),
      practice_completed: toBool(practice_completed),
      quiz_completed: toBool(quiz_completed),
      notes_viewed: toBool(notes_viewed),
      video_watched: toBool(video_watched),
    };

    const isCompleted = computeCompletion(payload);
    const now = new Date();

    // 2. INSERT
    if (!record) {
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
          completed_at,
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
          :completedAt,
          NOW(),
          NOW()
        )
        RETURNING *
        `,
        {
          replacements: {
            studentId,
            subtopicId,
            ...payload,
            completedAt: isCompleted ? now : null,
          },
          type: QueryTypes.INSERT,
        }
      );

      const created = result?.[0]?.[0];

      emitProgressUpdate({
        studentId,
        subtopicId,
        ...payload,
      });

      return created;
    }

    // 3. UPDATE (merge existing + new values)
    const merged = {
      resources_completed: payload.resources_completed ?? record.resources_completed,
      practice_completed: payload.practice_completed ?? record.practice_completed,
      quiz_completed: payload.quiz_completed ?? record.quiz_completed,
      notes_viewed: payload.notes_viewed ?? record.notes_viewed,
      video_watched: payload.video_watched ?? record.video_watched,
    };

    const completed = computeCompletion(merged);

    const updated = await sequelize.query(
      `
      UPDATE subtopic_progress
      SET
        resources_completed = :resources_completed,
        practice_completed = :practice_completed,
        quiz_completed = :quiz_completed,
        notes_viewed = :notes_viewed,
        video_watched = :video_watched,
        completed_at = CASE
          WHEN :completed THEN NOW()
          ELSE completed_at
        END,
        updated_at = NOW()
      WHERE student_id = :studentId
        AND subtopic_id = :subtopicId
      RETURNING *
      `,
      {
        replacements: {
          studentId,
          subtopicId,
          ...merged,
          completed,
        },
        type: QueryTypes.UPDATE,
      }
    );

    const updatedRow = updated?.[0]?.[0];

    emitProgressUpdate({
      studentId,
      subtopicId,
      ...merged,
    });

    return updatedRow;
  } catch (err) {
    logger.error('[subtopicProgressService] upsert failed', {
      error: err.message,
    });
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
   FETCH USER PROGRESS (FOR UI)
───────────────────────────────────────────────────────────── */

async function getUserProgress(studentId) {
  return sequelize.query(
    `
    SELECT *
    FROM subtopic_progress
    WHERE student_id = :studentId
    ORDER BY updated_at DESC
    `,
    {
      replacements: { studentId },
      type: QueryTypes.SELECT,
    }
  );
}

/* ─────────────────────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────────────────────── */

module.exports = {
  upsertProgress,
  getUserProgress,
};
