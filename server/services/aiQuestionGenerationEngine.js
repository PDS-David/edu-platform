'use strict';

const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const ExamIntelligenceEngine = require('./examIntelligenceEngine');
const AdaptiveEngine = require('./adaptiveEngine');

class AIQuestionGenerationEngine {

  // ─────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ─────────────────────────────────────────────
  static async generateQuestions({ studentId, subjectId, limit = 10 }) {

    // 1. Get exam intelligence snapshot
    const examData = await ExamIntelligenceEngine.analyzeStudentPerformance(
      studentId,
      subjectId
    );

    // 2. Get adaptive learning path
    const adaptive = await AdaptiveEngine.generateLearningPath(
      studentId,
      subjectId
    );

    const weakAreas = examData.weak_areas || [];
    const prioritySubtopics = adaptive.slice(0, 5);

    // 3. Pull subtopics metadata for question context
    const subtopics = await sequelize.query(
      `
      SELECT id, name, topic_id
      FROM subtopics
      WHERE subject_id = :subjectId
      `,
      {
        replacements: { subjectId },
        type: QueryTypes.SELECT
      }
    );

    // 4. Build generation blueprint
    const blueprint = this.buildBlueprint({
      weakAreas,
      prioritySubtopics,
      subtopics
    });

    // 5. Generate structured questions
    const questions = this.generateQuestionSet(blueprint, limit);

    return {
      subject_id: subjectId,
      blueprint,
      questions
    };
  }

  // ─────────────────────────────────────────────
  // BLUEPRINT ENGINE
  // ─────────────────────────────────────────────
  static buildBlueprint({ weakAreas, prioritySubtopics, subtopics }) {

    const weakMap = new Set(weakAreas.map(w => w.subtopic_id));

    return subtopics.map(s => {

      const isWeak = weakMap.has(s.id);

      const priority = prioritySubtopics.find(p => p.subtopic_id === s.id);

      return {
        subtopic_id: s.id,
        name: s.name,

        difficulty: isWeak ? 'medium-hard' : 'standard',
        weight: isWeak ? 3 : 1,
        priority: priority?.priority_score || 0
      };
    });
  }

  // ─────────────────────────────────────────────
  // QUESTION GENERATION CORE
  // ─────────────────────────────────────────────
  static generateQuestionSet(blueprint, limit) {

    const questions = [];

    const sorted = blueprint.sort((a, b) =>
      (b.weight + b.priority) - (a.weight + a.priority)
    );

    for (let i = 0; i < Math.min(limit, sorted.length); i++) {

      const b = sorted[i];

      questions.push({
        id: i + 1,
        subtopic_id: b.subtopic_id,
        question: this.buildQuestionText(b),
        options: this.generateOptions(),
        answer: null, // hidden until evaluation engine
        difficulty: b.difficulty
      });
    }

    return questions;
  }

  // ─────────────────────────────────────────────
  // QUESTION TEMPLATE ENGINE
  // ─────────────────────────────────────────────
  static buildQuestionText(blueprint) {

    return `A question on "${blueprint.name}" based on ${blueprint.difficulty} level understanding.`;
  }

  // ─────────────────────────────────────────────
  // OPTION GENERATOR (PLACEHOLDER LOGIC)
  // ─────────────────────────────────────────────
  static generateOptions() {

    return [
      'Option A',
      'Option B',
      'Option C',
      'Option D'
    ];
  }
}

module.exports = AIQuestionGenerationEngine;
