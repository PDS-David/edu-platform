'use strict';

/**
 * Progress Engine
 * ----------------
 * Single source of truth for computing subtopic completion state.
 *
 * This replaces SQL CASE logic and ensures:
 * - deterministic completion rules
 * - future extensibility (XP, mastery, weighting)
 * - consistent API + analytics outputs
 */

function computeSubtopicCompletion(progress) {
  if (!progress) {
    return {
      resources_completed: false,
      practice_completed: false,
      quiz_completed: false,
      notes_viewed: false,
      video_watched: false,
      completed: false,
      completion_score: 0,
    };
  }

  const {
    resources_completed = false,
    practice_completed = false,
    quiz_completed = false,
    notes_viewed = false,
    video_watched = false,
  } = progress;

  // Core completion rules (STRICT)
  const coreCompleted =
    resources_completed &&
    practice_completed &&
    quiz_completed;

  // Lightweight engagement score (future AI + analytics use)
  let score = 0;

  if (resources_completed) score += 35;
  if (practice_completed) score += 35;
  if (quiz_completed) score += 30;

  // Engagement bonuses (non-blocking)
  if (notes_viewed) score += 5;
  if (video_watched) score += 5;

  if (score > 100) score = 100;

  return {
    resources_completed,
    practice_completed,
    quiz_completed,
    notes_viewed,
    video_watched,

    completed: coreCompleted,
    completion_score: score,
  };
}

module.exports = {
  computeSubtopicCompletion,
};
