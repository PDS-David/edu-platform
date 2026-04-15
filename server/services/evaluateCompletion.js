'use strict';

/**
 * evaluateCompletion.js
 *
 * A1.7 — COMPLETION DECISION ENGINE
 * Determines whether a subtopic is completed
 */

function evaluateCompletion(progress) {
  if (!progress) {
    return {
      changed: false,
      flags: {},
      meta: { reason: 'no_progress_found' },
    };
  }

  const {
    resources_completed,
    practice_completed,
    quiz_completed,
    notes_viewed,
    video_watched,
  } = progress;

  // CORE RULE:
  // A subtopic is "completed" only if all major learning signals are true
  const isCompleted =
    resources_completed &&
    practice_completed &&
    quiz_completed;

  const flags = {
    // derived state (NOT raw input)
    completed: isCompleted,
  };

  const meta = {
    evaluatedAt: new Date().toISOString(),
    breakdown: {
      resources_completed,
      practice_completed,
      quiz_completed,
      notes_viewed,
      video_watched,
    },
  };

  return {
    changed: true,
    flags,
    meta,
  };
}

module.exports = evaluateCompletion;
