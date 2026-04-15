'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const CacheService = require('./cacheService');

/**
 * SUBTOPIC PROGRESS SERVICE
 * -----------------------------------------
 * Source of truth for:
 * - student subtopic progress
 * - mastery computation
 * - cached learning state
 */

class SubtopicProgressService {

  // ─────────────────────────────────────────────
  // CACHE KEY
  // ─────────────────────────────────────────────
  static cacheKey(studentId) {
    return `progress:${studentId}`;
  }

  // ─────────────────────────────────────────────
  // 1. GET PROGRESS (CACHED + DB FALLBACK)
  // ─────────────────────────────────────────────
  static async getStudentProgress(studentId) {
    const key = this.cacheKey(studentId);

    // 1. Try cache first
    let cached = await CacheService.get(key);
    if (cached) {
      return {
        source: 'cache',
        data: cached
      };
    }

    // 2. Fallback to DB
    const rows = await sequelize.query(
      `
      SELECT
        st.id AS subtopic_id,
        st.name,
        COALESCE(sp.resources_completed, false) AS resources_completed,
        COALESCE(sp.practice_completed, false) AS practice_completed,
        COALESCE(sp.quiz_completed, false) AS quiz_completed,
        COALESCE(sp.notes_viewed, false) AS notes_viewed,
        COALESCE(sp.video_watched, false) AS video_watched,
        CASE
          WHEN (sp.resources_completed AND sp.practice_completed AND sp.quiz_completed)
          THEN true ELSE false
        END AS is_mastered
      FROM subtopics st
      LEFT JOIN subtopic_progress sp
        ON sp.subtopic_id = st.id
        AND sp.student_id = :studentId
      ORDER BY st.id ASC
      `,
      {
        replacements: { studentId },
        type: QueryTypes.SELECT
      }
    );

    // 3. Store in cache
    await CacheService.set(key, rows, 300);

    return {
      source: 'db',
      data: rows
    };
  }

  // ─────────────────────────────────────────────
  // 2. MASTERy CALCULATION
  // ─────────────────────────────────────────────
  static computeMastery(progressRow) {
    const base =
      progressRow.resources_completed &&
      progressRow.practice_completed &&
      progressRow.quiz_completed;

    const bonus =
      (progressRow.notes_viewed ? 0.1 : 0) +
      (progressRow.video_watched ? 0.1 : 0);

    return Math.min(base ? 1 : 0 + bonus, 1);
  }

  // ─────────────────────────────────────────────
  // 3. INVALIDATE CACHE
  // ─────────────────────────────────────────────
  static async invalidate(studentId) {
    const key = this.cacheKey(studentId);
    await CacheService.del(key);

    // Also invalidate dependent systems
    await CacheService.del(`analytics:${studentId}`);
  }

  // ─────────────────────────────────────────────
  // 4. UPDATE PROGRESS HOOK
  // ─────────────────────────────────────────────
  static async onProgressUpdate(studentId) {
    await this.invalidate(studentId);
  }

  // ─────────────────────────────────────────────
  // 5. GET MASTERED COUNT
  // ─────────────────────────────────────────────
  static async getMasterySummary(studentId) {
    const progress = await this.getStudentProgress(studentId);

    const total = progress.data.length;
    const mastered = progress.data.filter(p => p.is_mastered).length;

    return {
      total_subtopics: total,
      mastered_subtopics: mastered,
      mastery_rate: total ? mastered / total : 0
    };
  }
}

module.exports = SubtopicProgressService;
