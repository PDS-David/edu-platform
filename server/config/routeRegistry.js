'use strict';

/**
 * CENTRAL ROUTE REGISTRY — documentation only, not loaded at runtime.
 *
 * server.js mounts routes directly via safeRequire().  This file is a
 * single-source-of-truth map for quick reference; keep it in sync whenever
 * a route is added or removed.
 *
 * Format: { path: '/api/...', file: '../routes/<filename>' }
 *
 * If you ever switch to the loadRoutes() helper (server/config/loadRoutes.js),
 * this registry is the array to pass it.
 */

module.exports = [
  // ── Auth ─────────────────────────────────────────────────────────────────
  { path: '/api/auth',               file: '../routes/authRoutes' },

  // ── Users ─────────────────────────────────────────────────────────────────
  { path: '/api/users',              file: '../routes/users' },

  // ── Catalog / Exam boards ─────────────────────────────────────────────────
  { path: '/api/exam-boards',        file: '../routes/examBoardRoutes' },
  { path: '/api/catalog',            file: '../routes/catalogRoutes' },
  { path: '/api/curriculum',         file: '../routes/curriculumRoutes' },

  // ── Content ───────────────────────────────────────────────────────────────
  { path: '/api/subjects',           file: '../routes/subjectsRoutes' },
  { path: '/api/topics',             file: '../routes/topicsRoutes' },
  { path: '/api/subtopics',          file: '../routes/subtopicRoutes' },
  { path: '/api/concepts',           file: '../routes/conceptRoutes' },
  { path: '/api/resources',          file: '../routes/resourceRoutes' },
  { path: '/api/courses',            file: '../routes/courses' },
  { path: '/api/enrollments',        file: '../routes/enrollments' },
  { path: '/api/videos',             file: '../routes/videosRoutes' },
  { path: '/api/past-papers',        file: '../routes/pastPaperRoutes' },
  { path: '/api/notes',              file: '../routes/notesRoutes' },

  // ── Quiz / Questions ──────────────────────────────────────────────────────
  { path: '/api/quizzes',            file: '../routes/quizzes' },
  { path: '/api/quiz-generator',     file: '../routes/quizGeneratorRoute' },
  { path: '/api/questions',          file: '../routes/questionsRoutes' },

  // ── Progress / Learning ───────────────────────────────────────────────────
  { path: '/api/progress',           file: '../routes/progressRoutes' },
  { path: '/api/progress-summary',   file: '../routes/progressSummaryBulk' },
  { path: '/api/subtopic-progress',  file: '../routes/subtopicProgressRoutes' },
  { path: '/api/learning-events',    file: '../routes/learningEventRoutes' },
  { path: '/api/adaptive',           file: '../routes/adaptiveRoutes' },
  { path: '/api/study-planner',      file: '../routes/studyPlannerRoute' },
  { path: '/api/weak-topics',        file: '../routes/weakTopicRoutes' },

  // ── AI ────────────────────────────────────────────────────────────────────
  { path: '/api/ai',                 file: '../routes/aiRoutes' },
  { path: '/api/ai',                 file: '../routes/aiChatRoute' },         // co-mounted
  { path: '/api/ai-question-gen',    file: '../routes/aiQuestionGenerationRoutes' },
  { path: '/api/explanations',       file: '../routes/explanationRoute' },

  // ── Analytics / Intelligence ──────────────────────────────────────────────
  { path: '/api/analytics',          file: '../routes/analyticsRoutes' },
  { path: '/api/recommendations',    file: '../routes/recommendationRoutes' },
  { path: '/api/sessions',           file: '../routes/sessionRoutes' },
  { path: '/api/dashboard',          file: '../routes/dashboardRoutes' },
  { path: '/api/replay',             file: '../routes/eventReplayRoutes' },
  { path: '/api/engine',             file: '../routes/engineValidationRoutes' },
  { path: '/api/exam-intelligence',  file: '../routes/examIntelligenceRoutes' },

  // ── Roles ─────────────────────────────────────────────────────────────────
  { path: '/api/students',           file: '../routes/studentRoutes' },
  { path: '/api/teacher',            file: '../routes/teacherRoutes' },
  { path: '/api/admin',              file: '../routes/adminRoutes' },

  // ── Payments / Notifications ──────────────────────────────────────────────
  { path: '/api/payments',           file: '../routes/paymentRoutes' },
  { path: '/api/notifications',      file: '../routes/notificationsRoutes' },
];
