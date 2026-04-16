'use strict';

const eventBus = require('./eventBus');

/**
 * EventEngine
 * Single responsibility: emit domain events
 */
class EventEngine {
  emitProgressUpdated(payload) {
    eventBus.emitEvent('progress.updated', payload);
  }

  emitQuizCompleted(payload) {
    eventBus.emitEvent('quiz.completed', payload);
  }

  emitResourceViewed(payload) {
    eventBus.emitEvent('resource.viewed', payload);
  }
}

module.exports = new EventEngine();
