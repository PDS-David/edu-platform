'use strict';

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Event Store (Persistent)
 * Stores all domain events for analytics, replay, AI, auditing
 */
class EventStore {
  async append(eventType, payload) {
    try {
      await sequelize.query(
        `
        INSERT INTO event_store (event_type, payload, created_at)
        VALUES (:eventType, :payload, NOW())
        `,
        {
          replacements: {
            eventType,
            payload: JSON.stringify(payload),
          },
          type: QueryTypes.INSERT,
        }
      );
    } catch (err) {
      console.error('[EventStore] Failed to persist event:', err.message);
    }
  }

  async getRecentEvents(limit = 50) {
    return sequelize.query(
      `
      SELECT * FROM event_store
      ORDER BY created_at DESC
      LIMIT :limit
      `,
      {
        replacements: { limit },
        type: QueryTypes.SELECT,
      }
    );
  }
}

module.exports = new EventStore();
