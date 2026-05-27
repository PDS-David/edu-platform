/**
 * FILE: client/src/queries/admin/admin.queryKeys.js
 * Centralized query key factory for all admin React Query hooks.
 */

export const adminKeys = {
  all: ['admin'],

  // ── USERS ─────────────────────────────────────────
  users: (params = {}) => ['admin', 'users', params],
  userStats: () => ['admin', 'user-stats'],

  // ── ASSIGNMENTS ───────────────────────────────────
  assignments: () => ['admin', 'assignments'],
  subjects: () => ['admin', 'subjects'],

  // ── QUESTIONS (future-safe) ───────────────────────
  questions: (params = {}) => ['admin', 'questions', params],
  pendingQuestions: (params = {}) => ['admin', 'questions', 'pending', params],
};
