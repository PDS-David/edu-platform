'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const SubtopicProgressService = require('./subtopicProgressService');

class AdaptiveEngine {

  // ─────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ─────────────────────────────────────────────
  static async generateLearningPath(studentId, subjectId) {

    const subtopics = await sequelize.query(
      `
      SELECT
        st.id,
        st.name,
        st.topic_id,
        st.order_index,

        COALESCE(sp.resources_completed, false) AS resources_completed,
        COALESCE(sp.practice_completed, false) AS practice_completed,
        COALESCE(sp.quiz_completed, false) AS quiz_completed,
        COALESCE(sp.notes_viewed, false) AS notes_viewed,
        COALESCE(sp.video_watched, false) AS video_watched

      FROM subtopics st
      LEFT JOIN subtopic_progress sp
        ON sp.subtopic_id = st.id
        AND sp.student_id = :studentId

      WHERE st.subject_id = :subjectId
      ORDER BY st.topic_id ASC, st.order_index ASC
      `,
      {
        replacements: { studentId, subjectId },
        type: QueryTypes.SELECT
      }
    );

    const analyzed = subtopics.map(st => {
      const progress = {
        resources_completed: st.resources_completed,
        practice_completed: st.practice_completed,
        quiz_completed: st.quiz_completed,
        notes_viewed: st.notes_viewed,
        video_watched: st.video_watched
      };

      const completion = SubtopicProgressService.getCompletionPercentage(progress);
      const completed = SubtopicProgressService.isCompleted(progress);

      return {
        subtopic_id: st.id,
        name: st.name,
        topic_id: st.topic_id,
        order_index: st.order_index,

        completion,
        completed,

        // ── intelligence signals ──
        priority_score: this.calculatePriority(completion, completed),
        weakness_flag: completion > 0 && completion < 80
      };
    });

    return this.rankLearningPath(analyzed);
  }

  // ─────────────────────────────────────────────
  // PRIORITY SCORING MODEL
  // ─────────────────────────────────────────────
  static calculatePriority(completion, completed) {

    if (completed) return 0;

    // core heuristic model (Phase 2 simple version)
    let score = 100 - completion;

    // boost partially completed items (danger zone)
    if (completion > 0 && completion < 70) {
      score += 20;
    }

    return score;
  }

  // ─────────────────────────────────────────────
  // SORTING ENGINE
  // ─────────────────────────────────────────────
  static rankLearningPath(items) {

    return items
      .sort((a, b) => b.priority_score - a.priority_score)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
        recommended: index === 0
      }));
  }

  // ─────────────────────────────────────────────
  // NEXT BEST SUBTOPIC (SINGLE RECOMMENDATION)
  // ─────────────────────────────────────────────
  static getNextBest(items) {
    return items.find(i => i.recommended) || null;
  }
}

module.exports = AdaptiveEngine;
