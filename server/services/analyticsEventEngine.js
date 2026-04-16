'use strict';

const eventBus = require('./eventBus');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

class AnalyticsEventEngine {
  constructor() {
    this.registerListeners();
  }

  registerListeners() {
    eventBus.registerListener('progress.updated', this.onProgressUpdated.bind(this));
    eventBus.registerListener('quiz.completed', this.onQuizCompleted.bind(this));
    eventBus.registerListener('resource.viewed', this.onResourceViewed.bind(this));
  }

  async onProgressUpdated(payload) {
    await sequelize.query(
      `
      INSERT INTO event_store (event_type, payload, created_at)
      VALUES ('progress.updated', :payload, NOW())
      `,
      {
        replacements: {
          payload: JSON.stringify(payload),
        },
        type: QueryTypes.INSERT,
      }
    );
  }

  async onQuizCompleted(payload) {
    await sequelize.query(
      `
      INSERT INTO event_store (event_type, payload, created_at)
      VALUES ('quiz.completed', :payload, NOW())
      `,
      {
        replacements: {
          payload: JSON.stringify(payload),
        },
        type: QueryTypes.INSERT,
      }
    );
  }

  async onResourceViewed(payload) {
    await sequelize.query(
      `
      INSERT INTO event_store (event_type, payload, created_at)
      VALUES ('resource.viewed', :payload, NOW())
      `,
      {
        replacements: {
          payload: JSON.stringify(payload),
        },
        type: QueryTypes.INSERT,
      }
    );
  }
}

module.exports = new AnalyticsEventEngine();
