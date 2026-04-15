'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const SubtopicProgressService = require('./subtopicProgressService');

class ExamIntelligenceEngine {

  // ─────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ─────────────────────────────────────────────
  static async analyzeStudentPerformance(studentId, subjectId) {

    const data = await sequelize.query(
      `
      SELECT
        st.id AS subtopic_id,
        st.topic_id,

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
      `,
      {
        replacements: { studentId, subjectId },
        type: QueryTypes.SELECT
      }
    );

    const scored = this.calculateScores(data);

    return {
      subject_id: subjectId,
      student_id: studentId,

      topic_analysis: this.aggregateByTopic(scored),
      predicted_score: this.predictExamScore(scored),
      weak_areas: this.extractWeakAreas(scored),
      revision_priority: this.rankRevision(scored)
    };
  }

  // ─────────────────────────────────────────────
  // SUBTOPIC SCORING MODEL
  // ─────────────────────────────────────────────
  static calculateScores(rows) {

    return rows.map(r => {

      const weights = {
        resources_completed: 0.2,
        notes_viewed: 0.15,
        video_watched: 0.2,
        practice_completed: 0.2,
        quiz_completed: 0.25
      };

      const score =
        (r.resources_completed * weights.resources_completed) +
        (r.notes_viewed * weights.notes_viewed) +
        (r.video_watched * weights.video_watched) +
        (r.practice_completed * weights.practice_completed) +
        (r.quiz_completed * weights.quiz_completed);

      return {
        subtopic_id: r.subtopic_id,
        topic_id: r.topic_id,
        score: Math.round(score * 100)
      };
    });
  }

  // ─────────────────────────────────────────────
  // TOPIC AGGREGATION
  // ─────────────────────────────────────────────
  static aggregateByTopic(scored) {

    const map = {};

    for (const s of scored) {
      if (!map[s.topic_id]) {
        map[s.topic_id] = {
          total: 0,
          count: 0
        };
      }

      map[s.topic_id].total += s.score;
      map[s.topic_id].count += 1;
    }

    return Object.entries(map).map(([topic_id, v]) => {
      const avg = v.total / v.count;

      return {
        topic_id: Number(topic_id),
        average_score: Math.round(avg),
        risk_level: this.getRiskLevel(avg)
      };
    });
  }

  // ─────────────────────────────────────────────
  // EXAM SCORE PREDICTION
  // ─────────────────────────────────────────────
  static predictExamScore(scored) {

    if (!scored.length) return 0;

    const avg =
      scored.reduce((sum, s) => sum + s.score, 0) /
      scored.length;

    // realistic exam variance model
    const adjusted = avg * 0.9;

    return Math.min(100, Math.round(adjusted));
  }

  // ─────────────────────────────────────────────
  // WEAK AREA DETECTION
  // ─────────────────────────────────────────────
  static extractWeakAreas(scored) {

    return scored
      .filter(s => s.score < 60)
      .sort((a, b) => a.score - b.score)
      .slice(0, 10);
  }

  // ─────────────────────────────────────────────
  // REVISION PRIORITY
  // ─────────────────────────────────────────────
  static rankRevision(scored) {

    return scored
      .sort((a, b) => a.score - b.score)
      .map((s, i) => ({
        ...s,
        priority_rank: i + 1,
        revise: s.score < 70
      }));
  }

  // ─────────────────────────────────────────────
  // RISK MODEL
  // ─────────────────────────────────────────────
  static getRiskLevel(avg) {

    if (avg >= 80) return 'low';
    if (avg >= 60) return 'medium';
    return 'high';
  }
}

module.exports = ExamIntelligenceEngine;
