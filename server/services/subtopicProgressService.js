'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const eventBus = require('./eventBus');

/**
 * SubtopicProgressService
 * -----------------------
 * Single source of truth for learning progress updates.
 *
 * FIX (2026-06-21): ON CONFLICT DO UPDATE now uses GREATEST() to only ever
 * advance progress forward — a { task: 'quiz' } call no longer resets
 * resources_completed/practice_completed back to false.
 *
 * FIX (2026-06-21): Added resources_completed and practice_completed to the
 * INSERT column list (these columns were added in migration_006).
 */

class SubtopicProgressService {

  // ─────────────────────────────────────────────
  // MARK SUBTOPIC AS COMPLETED / UPDATED
  // ─────────────────────────────────────────────
  static async updateProgress({
    studentId,
    subtopicId,
    resources_completed = false,
    practice_completed  = false,
    quiz_completed      = false,
    notes_viewed        = false,
    video_watched       = false,
  }) {
    const result = await sequelize.query(
      `INSERT INTO subtopic_progress (
        student_id,
        subtopic_id,
        resources_completed,
        practice_completed,
        quiz_completed,
        notes_viewed,
        video_watched,
        completion_pct,
        updated_at,
        created_at
      )
      VALUES (
        :studentId,
        :subtopicId,
        :resources_completed,
        :practice_completed,
        :quiz_completed,
        :notes_viewed,
        :video_watched,
        (
          (CASE WHEN :resources_completed THEN 33 ELSE 0 END) +
          (CASE WHEN :practice_completed  THEN 33 ELSE 0 END) +
          (CASE WHEN :quiz_completed      THEN 34 ELSE 0 END)
        ),
        NOW(),
        NOW()
      )
      ON CONFLICT (student_id, subtopic_id)
      DO UPDATE SET
        -- Use GREATEST so progress only ever moves forward.
        -- A quiz submission cannot wipe out resources/practice already done.
        resources_completed = GREATEST(subtopic_progress.resources_completed, EXCLUDED.resources_completed),
        practice_completed  = GREATEST(subtopic_progress.practice_completed,  EXCLUDED.practice_completed),
        quiz_completed      = GREATEST(subtopic_progress.quiz_completed,      EXCLUDED.quiz_completed),
        notes_viewed        = GREATEST(subtopic_progress.notes_viewed,        EXCLUDED.notes_viewed),
        video_watched       = GREATEST(subtopic_progress.video_watched,       EXCLUDED.video_watched),
        completion_pct      = (
          (CASE WHEN GREATEST(subtopic_progress.resources_completed, EXCLUDED.resources_completed) THEN 33 ELSE 0 END) +
          (CASE WHEN GREATEST(subtopic_progress.practice_completed,  EXCLUDED.practice_completed)  THEN 33 ELSE 0 END) +
          (CASE WHEN GREATEST(subtopic_progress.quiz_completed,      EXCLUDED.quiz_completed)      THEN 34 ELSE 0 END)
        ),
        updated_at = NOW()
      RETURNING *
      `,
      {
        replacements: {
          studentId,
          subtopicId,
          resources_completed,
          practice_completed,
          quiz_completed,
          notes_viewed,
          video_watched,
        },
        type: QueryTypes.INSERT,
      }
    );

    const progress = result?.[0]?.[0] || null;

    eventBus.emitEvent('progress.updated', {
      studentId,
      subtopicId,
      resources_completed,
      practice_completed,
      quiz_completed,
      notes_viewed,
      video_watched,
      timestamp: new Date().toISOString(),
    });

    return progress;
  }

  // ─────────────────────────────────────────────
  // GET PROGRESS
  // ─────────────────────────────────────────────
  static async getStudentProgress(studentId) {
    return sequelize.query(
      `SELECT * FROM subtopic_progress WHERE student_id = :studentId`,
      { replacements: { studentId }, type: QueryTypes.SELECT }
    );
  }
}

module.exports = SubtopicProgressService;
