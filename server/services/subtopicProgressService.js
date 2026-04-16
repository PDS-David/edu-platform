'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const eventBus = require('./eventBus');

/**
 * SubtopicProgressService
 * -----------------------
 * Single source of truth for learning progress updates
 */

class SubtopicProgressService {

  // ─────────────────────────────────────────────
  // MARK SUBTOPIC AS COMPLETED / UPDATED
  // ─────────────────────────────────────────────
  static async updateProgress({
    studentId,
    subtopicId,
    resources_completed,
    practice_completed,
    quiz_completed,
    notes_viewed,
    video_watched,
  }) {
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
        NOW(),
        NOW()
      )
      ON CONFLICT (student_id, subtopic_id)
      DO UPDATE SET
        resources_completed = EXCLUDED.resources_completed,
        practice_completed  = EXCLUDED.practice_completed,
        quiz_completed      = EXCLUDED.quiz_completed,
        notes_viewed        = EXCLUDED.notes_viewed,
        video_watched       = EXCLUDED.video_watched,
        updated_at          = NOW()
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

    // ─────────────────────────────────────────────
    // 🔥 EVENT EMISSION (NEW CORE WIRING)
    // ─────────────────────────────────────────────
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
      `
      SELECT *
      FROM subtopic_progress
      WHERE student_id = :studentId
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT,
      }
    );
  }
}

module.exports = SubtopicProgressService;
