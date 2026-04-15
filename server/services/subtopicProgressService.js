'use strict';

/**
 * A1 + A4 FINAL PROGRESS SERVICE
 *
 * CHANGES FROM A3 → A4:
 * - Removed analyticsEngine dependency
 * - Replaced with eventEngine (hard event bus)
 * - Progress now emits events only (no direct analytics coupling)
 *
 * RESULT:
 * - Fully decoupled architecture
 * - Event-driven analytics pipeline
 */

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../config/logger');

// A4 Event Engine (replaces A3 analytics coupling)
const {
  emitProgressEvent,
} = require('./eventEngine');

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

function toBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

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
   UPSERT PROGRESS CORE
───────────────────────────────────────────────────────────── */

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
    // Check existing record
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

    const incoming = {
      resources_completed: toBool(resources_completed),
      practice_completed: toBool(practice_completed),
      quiz_completed: toBool(quiz_completed),
      notes_viewed: toBool(notes_viewed),
      video_watched: toBool(video_watched),
    };

    const now = new Date();

    /* ───────────────────────── INSERT ───────────────────────── */

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
            ...incoming,
            completedAt: computeCompletion(incoming) ? now : null,
          },
          type: QueryTypes.INSERT,
        }
      );

      const created = result?.[0]?.[0];

      // A4 EVENT EMISSION
      emitProgressEvent({
        studentId,
        subtopicId,
        ...incoming,
      });

      return created;
    }

    /* ───────────────────────── UPDATE ───────────────────────── */

    const merged = {
      resources_completed:
        incoming.resources_completed ?? record.resources_completed,
      practice_completed:
        incoming.practice_completed ?? record.practice_completed,
      quiz_completed:
        incoming.quiz_completed ?? record.quiz_completed,
      notes_viewed:
        incoming.notes_viewed ?? record.notes_viewed,
      video_watched:
        incoming.video_watched ?? record.video_watched,
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

    // A4 EVENT EMISSION
    emitProgressEvent({
      studentId,
      subtopicId,
      ...merged,
    });

    return updatedRow;
  } catch (err) {
    logger.error('[subtopicProgressService] error', {
      error: err.message,
    });
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
   FETCH USER PROGRESS
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
