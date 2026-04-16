'use strict';

const AnalyticsEngine = require('./analyticsEngine');

class RecommendationEngine {

  static async getRecommendations(studentId) {
    const weakTopics = await AnalyticsEngine.getWeakTopics(studentId);

    return weakTopics.map(t => ({
      title: `Revise ${t.name}`,
      reason: `Low performance score (${Math.round(t.score || 0)}%)`,
      type: 'weak_topic'
    }));
  }
}

module.exports = RecommendationEngine;
