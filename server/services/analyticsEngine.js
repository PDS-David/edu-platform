'use strict';

const eventBus = require('./eventBus');

/**
 * AnalyticsEngine
 * Listens to system events and aggregates metrics
 */
class AnalyticsEngine {
  constructor() {
    this.registerListeners();
  }

  registerListeners() {
    eventBus.registerListener('progress.updated', this.onProgressUpdated.bind(this));
    eventBus.registerListener('quiz.completed', this.onQuizCompleted.bind(this));
    eventBus.registerListener('resource.viewed', this.onResourceViewed.bind(this));
  }

  async onProgressUpdated(payload) {
    // Example: update learning completion stats
    // Keep logic lightweight (NO heavy DB operations here ideally)
  }

  async onQuizCompleted(payload) {
    // Example: store quiz analytics, difficulty performance
  }

  async onResourceViewed(payload) {
    // Example: track engagement
  }
}

module.exports = new AnalyticsEngine();
