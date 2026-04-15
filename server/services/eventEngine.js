'use strict';

/**
 * A4 — EVENT HARDENING ENGINE
 *
 * PURPOSE:
 * - Replace fragile in-memory events with durable event pipeline
 * - Introduce retry-safe event dispatching
 * - Prepare Redis pub/sub integration (future upgrade)
 * - Decouple analytics, progress, AI, exam systems
 *
 * DESIGN PRINCIPLE:
 * - NEVER lose an event silently
 * - NEVER block request lifecycle on analytics
 */

const EventEmitter = require('events');
const logger = require('../config/logger');

/* ─────────────────────────────────────────────────────────────
   CORE EVENT BUS (LOCAL FALLBACK LAYER)
───────────────────────────────────────────────────────────── */

class HardEventBus extends EventEmitter {
  constructor() {
    super();

    // buffer for failed events (in-memory fallback queue)
    this.deadLetterQueue = [];
  }

  /**
   * Safe emit with retry protection
   */
  safeEmit(eventType, payload = {}) {
    try {
      this.emit(eventType, payload);
    } catch (err) {
      logger.error('[EventEngine] Emit failed', {
        eventType,
        error: err.message,
      });

      this.deadLetterQueue.push({
        eventType,
        payload,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Replay failed events (manual recovery or cron job later)
   */
  replayFailedEvents() {
    const queue = [...this.deadLetterQueue];
    this.deadLetterQueue = [];

    for (const event of queue) {
      try {
        this.emit(event.eventType, event.payload);
      } catch (err) {
        logger.error('[EventEngine] Replay failed', {
          eventType: event.eventType,
          error: err.message,
        });

        // re-queue if still failing
        this.deadLetterQueue.push(event);
      }
    }
  }

  /**
   * Inspect queue (debug/admin use)
   */
  getDeadLetterQueue() {
    return this.deadLetterQueue;
  }
}

const eventBus = new HardEventBus();

/* ─────────────────────────────────────────────────────────────
   EVENT DEFINITIONS (GLOBAL CONTRACT)
───────────────────────────────────────────────────────────── */

const EVENTS = {
  // Progress engine
  PROGRESS_UPDATED: 'progress.updated',
  SUBTOPIC_COMPLETED: 'subtopic.completed',

  // Analytics
  ANALYTICS_CAPTURED: 'analytics.captured',

  // AI engine (future)
  AI_QUESTION_GENERATED: 'ai.question.generated',

  // Exam engine (future)
  EXAM_ANALYSIS_COMPLETED: 'exam.analysis.completed',
};

/* ─────────────────────────────────────────────────────────────
   HIGH-LEVEL DISPATCH API
───────────────────────────────────────────────────────────── */

/**
 * Central event dispatcher (USE THIS EVERYWHERE)
 */
function dispatch(eventType, payload = {}) {
  if (!eventType) {
    logger.warn('[EventEngine] Missing event type');
    return;
  }

  eventBus.safeEmit(eventType, payload);
}

/**
 * Register listener safely
 */
function on(eventType, handler) {
  eventBus.on(eventType, async (payload) => {
    try {
      await handler(payload);
    } catch (err) {
      logger.error('[EventEngine] Listener crashed', {
        eventType,
        error: err.message,
      });
    }
  });
}

/* ─────────────────────────────────────────────────────────────
   INTEGRATION HELPERS (PROGRESS ENGINE → EVENT ENGINE)
───────────────────────────────────────────────────────────── */

/**
 * Called by subtopicProgressService
 */
function emitProgressEvent(data) {
  dispatch(EVENTS.PROGRESS_UPDATED, data);

  const isCompleted =
    data.resources_completed &&
    data.practice_completed &&
    data.quiz_completed &&
    data.notes_viewed &&
    data.video_watched;

  if (isCompleted) {
    dispatch(EVENTS.SUBTOPIC_COMPLETED, data);
  }
}

/* ─────────────────────────────────────────────────────────────
   PRE-WIRED LISTENERS (SYSTEM DEFAULTS)
───────────────────────────────────────────────────────────── */

on(EVENTS.PROGRESS_UPDATED, (payload) => {
  logger.info('[EventEngine] Progress updated', {
    studentId: payload.studentId,
    subtopicId: payload.subtopicId,
  });
});

on(EVENTS.SUBTOPIC_COMPLETED, (payload) => {
  logger.info('[EventEngine] Subtopic completed', payload);
});

/* ─────────────────────────────────────────────────────────────
   EXPORTS
───────────────────────────────────────────────────────────── */

module.exports = {
  eventBus,
  EVENTS,

  dispatch,
  on,

  emitProgressEvent,
};
