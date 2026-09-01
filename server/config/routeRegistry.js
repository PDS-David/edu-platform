'use strict';

/**
 * CENTRAL ROUTE REGISTRY
 * Every API route MUST be declared here.
 * This prevents silent deployment breakage.
 */

module.exports = [
  { path: '/api/auth', file: '../routes/authRoutes' },
  { path: '/api/exam-boards', file: '../routes/examBoardsRoutes' },

  { path: '/api/ai', file: '../routes/aiRoutes' },

  { path: '/api/admin', file: '../routes/adminRoutes' },
  { path: '/api/teacher', file: '../routes/teacherRoutes' },

  { path: '/api/users', file: '../routes/users' },
  { path: '/api/subjects', file: '../routes/subjects' },
  { path: '/api/topics', file: '../routes/topicsRoutes' },
  { path: '/api/subtopics', file: '../routes/subtopicRoutes' },

  { path: '/api/resources', file: '../routes/resourceRoutes' },
  { path: '/api/courses', file: '../routes/courses' },
  { path: '/api/enrollments', file: '../routes/enrollments' },

  { path: '/api/quizzes', file: '../routes/quizzes' },
  { path: '/api/questions', file: '../routes/questionsRoutes' },

  { path: '/api/analytics', file: '../routes/analyticsRoutes' },
  { path: '/api/notes', file: '../routes/notesRoutes' },
  { path: '/api/videos', file: '../routes/videosRoutes' },
  { path: '/api/past-papers', file: '../routes/pastPaperRoutes' },

  { path: '/api/payments', file: '../routes/paymentRoutes' },
  { path: '/api/catalog', file: '../routes/catalogRoutes' },

  { path: '/api/notifications', file: '../routes/notificationsRoutes' },

  { path: '/api/students', file: '../routes/studentRoutes' },
  { path: '/api/concepts', file: '../routes/conceptRoutes' },
];
