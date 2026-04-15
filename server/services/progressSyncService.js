'use strict';

/**
 * progressSyncService.js
 *
 * A1.8 — STATE NORMALIZATION LAYER
 * Ensures consistent boolean + safe defaults
 */

function toBool(value) {
  return value === true || value === 1 || value === 'true';
}

function syncProgressState(input = {}) {
  return {
    resources_completed: toBool(input.resources_completed),
    practice_completed: toBool(input.practice_completed),
    quiz_completed: toBool(input.quiz_completed),
    notes_viewed: toBool(input.notes_viewed),
    video_watched: toBool(input.video_watched),
  };
}

module.exports = syncProgressState;
