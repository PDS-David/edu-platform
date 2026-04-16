// client/src/queries/admin/admin.queryKeys.js
// ─────────────────────────────────────────────────────────────
// CENTRALIZED QUERY KEYS (GLOBAL ADMIN CACHE CONTROL)
// ─────────────────────────────────────────────────────────────

export const adminQueryKeys = {
  // ─────────────────────────────
  // USERS
  // ─────────────────────────────
  users: {
    all: ['admin-users'],
    list: (params) => ['admin-users', 'list', params],
    stats: () => ['admin-user-stats'],
  },

  // ─────────────────────────────
  // ASSIGNMENTS (teacher-subjects)
  // ─────────────────────────────
  assignments: {
    all: ['admin-assignments'],
    list: () => ['admin-assignments', 'list'],
  },

  // ─────────────────────────────
  // QUESTIONS
  // ─────────────────────────────
  questions: {
    all: ['admin-questions'],
    pending: (params) => ['admin-questions', 'pending', params],
    pendingCount: () => ['admin-questions', 'pending-count'],
  },

  // ─────────────────────────────
  // PLATFORM STATS
  // ─────────────────────────────
  stats: {
    all: ['admin-platform-stats'],
  },
};
