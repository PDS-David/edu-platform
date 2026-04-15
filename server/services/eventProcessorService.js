'use strict';

/**
 * eventProcessorService.js
 *
 * A2 CORE ENGINE:
 * Converts raw learning events → A1 Progress Engine updates
 */

const subtopicProgressService = require('./subtopicProgressService');

/**
 * MAP EVENTS → PROGRESS FLAGS
 */
function mapEventToProgress(eventType, payload = {}) {
  switch (eventType) {
    case 'RESOURCE_VIEWED':
      return { resources_completed: true };

    case 'PRACTICE_COMPLETED':
      return { practice_completed: true };

    case 'QUIZ_PASSED':
      return { quiz_completed: true };

    case 'NOTES_VIEWED':
      return { notes_viewed: true };

    case 'VIDEO_WATCHED':
      return { video_watched: true };

    default:
      return {};
  }
}

/**
 * PROCESS SINGLE EVENT
 */
async function processEvent(event) {
  const {
    student_id,
    subtopic_id,
    event_type,
    payload,
  } = event;

  const progressUpdate = mapEventToProgress(event_type, payload);

  if (!Object.keys(progressUpdate).length) {
    return { skipped: true };
  }

  const result = await subtopicProgressService.updateProgress(
    student_id,
    subtopic_id,
    progressUpdate
  );

  return {
    processed: true,
    result,
  };
}

module.exports = {
  processEvent,
  mapEventToProgress,
};
