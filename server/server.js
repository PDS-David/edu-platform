// server/server.js
// ─────────────────────────────────────────────────────────────────────────────
// EAC Learning Platform — Express entry point
//
// Roles:  student | teacher | admin
//
// Supported exam boards:
//   Nigerian:      JAMB/UTME, WAEC/NECO (SSCE), Junior WAEC (BECE)
//   Cambridge:     A Level, O Level, Pre IGCSE, Primary
//   Edexcel:       A Level, International A Level
//   AQA:           A Level
//   International: IELTS, TOEFL, SAT
//   (and any future boards added via the catalog)
//
// FIXES v1.1:
//   1. Analytics deduplication — old `analytics.js` (which queries the legacy
//      `student_analytics` table, never written to by any current route) is no
//      longer double-mounted on /api/analytics. The new `analyticsRoutes.js`
//      (which queries `practice_attempts` — the live table) now handles ALL
//      analytics endpoints exclusively. The old file is still required so its
//      three unique endpoints (/student/:id, /learning-gaps/:id,
//      /weekly-accuracy/:id) are preserved, but mounted under the distinct
//      prefix /api/analytics/legacy to avoid shadowing.
//
//   2. Duplicate student test routes removed — testRoutes.js defined
//      GET /student/tests and GET /student/test/:testId which are already
//      handled by studentRoutes.js. testRoutes.js is now mounted only for
//      its teacher-facing POST /teacher/tests endpoint.
//
//   3. Subscription guard comment updated to reflect accurate daily limits:
//      free = 5 q/day, free_trial = 20 q/day, subscribed/teacher/admin = ∞.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const dotenv  = require('dotenv');
const path    = require('path');

// Load environment variables — explicit path so it works regardless of cwd
dotenv.config({ path: path.join(__dirname, '.env') });

// ── Rate limiter ──────────────────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');
const limiter   = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/health',
});

// ── Core route imports ────────────────────────────────────────────────────────
const authRoutes         = require('./routes/authRoutes');
const userRoutes         = require('./routes/users');
const courseRoutes       = require('./routes/courses');
const quizRoutes         = require('./routes/quizzes');
const enrollmentRoutes   = require('./routes/enrollments');
const subjectRoutes      = require('./routes/subjects');
const examBoardsRoutes   = require('./routes/examBoardsRoutes');
const catalogRoutes      = require('./routes/catalogRoutes');
const examTypeActivation = require('./routes/examTypeActivation');
const topicsRoutes       = require('./routes/topicsRoutes');
const aiRoutes           = require('./routes/aiRoutes');
const adminRoutes        = require('./routes/adminRoutes');
const pastPaperRoutes    = require('./routes/pastPaperRoutes');
const notesRoutes        = require('./routes/notesRoutes');
const teacherRoutes      = require('./routes/teacherRoutes');
const testRoutes         = require('./routes/testRoutes');
const studentRoutes      = require('./routes/studentRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');

// ── Analytics routes ──────────────────────────────────────────────────────────
// FIX: Previously both files were mounted on /api/analytics, causing the old
// file's endpoints (which query the unpopulated `student_analytics` table) to
// shadow the new file's endpoints (which query `practice_attempts`).
//
// Resolution:
//   /api/analytics        → analyticsRoutes.js (NEW — queries practice_attempts)
//                           Endpoints: /summary, /weak-topics, /score-trend,
//                           /subject-breakdown, /time-metrics, /leaderboard,
//                           /badges, /student/:id/topics, /student/:id/summary,
//                           /cohort/:subjectId/topics
//
//   /api/analytics/legacy → analytics.js (OLD — queries student_analytics)
//                           Endpoints: /student/:id, /learning-gaps/:id,
//                           /daily-study/:id, /weekly-accuracy/:id
//                           These still work but return from the legacy table.
//                           Migrate their callers to the new routes over time.
const newAnalyticsRoutes    = require('./routes/analyticsRoutes'); // live data
const legacyAnalyticsRoutes = require('./routes/analytics');       // legacy table

// ── Optional routes (safe require — server starts even if file is missing) ────
let videoRoutes = null;
try {
  videoRoutes = require('./routes/videosRoutes');
} catch {
  console.warn('⚠️  videosRoutes not found — /api/videos will return 404');
}

let aiChatRoute = null;
try {
  aiChatRoute = require('./routes/aiChatRoute');
} catch {
  console.warn('⚠️  aiChatRoute not found');
}

let resourceRoutes = null;
try {
  resourceRoutes = require('./routes/resourceRoutes');
} catch {
  console.warn('⚠️  resourceRoutes not found — /api/resources will return 404');
}

let subtopicRoutes = null;
try {
  subtopicRoutes = require('./routes/subtopicRoutes');
} catch {
  console.warn('⚠️  subtopicRoutes not found');
}

let paymentsRoutes = null;
try {
  paymentsRoutes = require('./routes/paymentRoutes');
} catch {
  try {
    paymentsRoutes = require('./routes/payments');
  } catch {
    console.warn('⚠️  Payment routes not found — /api/payments will return 404');
  }
}

let questionsRoutes = null;
try {
  questionsRoutes = require('./routes/questionsRoutes');
} catch {
  console.warn('⚠️  Questions routes not found');
}

// ── Subscription guard ────────────────────────────────────────────────────────
// Applied only to /api/questions and /api/ai routes.
// Daily limits by role/status:
//   student  (free)         →  5 questions / 24 hrs
//   student  (free_trial)   → 20 questions / 24 hrs
//   student  (active sub)   → unlimited
//   teacher                 → unlimited
//   admin                   → unlimited
let subscriptionGuard = (_req, _res, next) => next(); // safe no-op default
try {
  subscriptionGuard = require('./middleware/subscriptionGuard');
} catch {
  console.warn('⚠️  subscriptionGuard not found — all users have unlimited access');
}

// ── Database ──────────────────────────────────────────────────────────────────
const db = require('./config/database');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(limiter);

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];
if (process.env.PROD_CLIENT_URL) ALLOWED_ORIGINS.push(process.env.PROD_CLIENT_URL);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn(`CORS blocked: ${origin}`);
    callback(new Error(`CORS policy does not allow origin: ${origin}`));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count'],
}));

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Request logging (dev only) ────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Database connection ───────────────────────────────────────────────────────
db.authenticate()
  .then(() => {
    console.log('✅ Database connected successfully');
    try {
      const { startJobs } = require('./jobs/scheduledJobs');
      startJobs();
      console.log('✅ Scheduled jobs started (weekly digest + streak nudge)');
    } catch (e) {
      console.warn('⚠️  Scheduled jobs not started:', e.message);
    }
  })
  .catch(err => console.error('❌ Database connection error:', err.message));

// ═════════════════════════════════════════════════════════════════════════════
// ROUTE MOUNTING
// Order matters — more specific paths before wildcards,
// public routes before guarded routes.
// ═════════════════════════════════════════════════════════════════════════════

// ── Auth (public) ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── Catalog / reference data (public) ────────────────────────────────────────
// These endpoints are read by the landing page, register page, and subject
// catalog — all of which are accessible without a login.
app.use('/api/exam-boards', examBoardsRoutes);
app.use('/api/subjects',    subjectRoutes);
app.use('/api/topics',      topicsRoutes);
app.use('/api/catalog',     catalogRoutes);

// ── User management ───────────────────────────────────────────────────────────
app.use('/api/users',       userRoutes);
app.use('/api/courses',     courseRoutes);
app.use('/api/enrollments', enrollmentRoutes);

// ── Payments ──────────────────────────────────────────────────────────────────
// NOTE: Paystack webhook endpoint inside paymentsRoutes uses express.raw()
// and MUST be mounted before any global JSON body parser re-runs on it.
// examTypeActivation is a separate router also mounted at /api/payments.
if (paymentsRoutes) app.use('/api/payments', paymentsRoutes);
app.use('/api/payments', examTypeActivation);

// ── Content routes (authenticated, no subscription guard) ─────────────────────
// Subtopics, resources, videos are metadata — no daily limit applied.
if (subtopicRoutes) app.use('/api/subtopics', subtopicRoutes);
if (resourceRoutes) app.use('/api/resources', resourceRoutes);
if (videoRoutes)    app.use('/api/videos',    videoRoutes);

// ── Quizzes (authenticated, no subscription guard) ───────────────────────────
// Quiz attempt submission and history are not rate-limited — only
// /api/questions (practice attempts) and /api/ai are guarded.
app.use('/api/quizzes', quizRoutes);

// ── Analytics ─────────────────────────────────────────────────────────────────
// FIX: Mount the NEW analytics file first so its endpoints win.
// The LEGACY file is mounted under /legacy for backward compatibility only.
// New endpoints (queries practice_attempts — live, populated):
//   /api/analytics/summary
//   /api/analytics/weak-topics
//   /api/analytics/score-trend
//   /api/analytics/subject-breakdown
//   /api/analytics/time-metrics
//   /api/analytics/leaderboard
//   /api/analytics/badges
//   /api/analytics/student/:id/topics
//   /api/analytics/student/:id/summary
//   /api/analytics/cohort/:subjectId/topics
app.use('/api/analytics', newAnalyticsRoutes);
// Legacy endpoints (queries student_analytics — may be empty for new users):
//   /api/analytics/legacy/student/:id
//   /api/analytics/legacy/learning-gaps/:id
//   /api/analytics/legacy/daily-study/:id
//   /api/analytics/legacy/weekly-accuracy/:id
app.use('/api/analytics/legacy', legacyAnalyticsRoutes);

// ── Guarded routes — subscription limits enforced ────────────────────────────
// student  free       →  5 q/day
// student  free_trial → 20 q/day
// student  subscribed → unlimited
// teacher / admin     → unlimited (always bypasses guard)
if (questionsRoutes) {
  app.use('/api/questions', subscriptionGuard, questionsRoutes);
}
app.use('/api/ai', subscriptionGuard, aiRoutes);
if (aiChatRoute) app.use('/api/ai', subscriptionGuard, aiChatRoute);

// ── Admin routes ──────────────────────────────────────────────────────────────
// All endpoints inside adminRoutes.js are protected by the adminOnly guard.
app.use('/api/admin', adminRoutes);

// ── Content management ────────────────────────────────────────────────────────
app.use('/api/past-papers', pastPaperRoutes);
app.use('/api/notes',       notesRoutes);

// ── Teacher routes ────────────────────────────────────────────────────────────
// /api/teacher → teacher dashboard: classes, class analytics, nudge emails
app.use('/api/teacher', teacherRoutes);

// ── Student routes ────────────────────────────────────────────────────────────
// /api/student → student-facing: join-class, assigned tests, test submission
// FIX: testRoutes.js also defined GET /student/tests and GET /student/test/:id
// which conflicted with studentRoutes.js. testRoutes is now mounted only at
// /api (for POST /teacher/tests) — its duplicate student routes are ignored
// because studentRoutes takes precedence here.
app.use('/api/student', studentRoutes);

// ── Notifications ─────────────────────────────────────────────────────────────
app.use('/api/notifications', notificationsRoutes);

// ── Test builder (teacher-facing only) ───────────────────────────────────────
// testRoutes defines POST /teacher/tests — mounted at /api so the full path
// becomes POST /api/teacher/tests.
// The duplicate student test endpoints inside testRoutes are now unreachable
// (studentRoutes above handles /api/student/*) which is the correct behaviour.
app.use('/api', testRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  success:   true,
  message:   'EAC Learning Platform API is running',
  timestamp: new Date().toISOString(),
  env:       process.env.NODE_ENV,
  ai:        process.env.GEMINI_API_KEY
    ? '✅ Gemini configured'
    : '❌ NOT CONFIGURED — add GEMINI_API_KEY to .env',
  payments:  process.env.PAYSTACK_SECRET_KEY
    ? '✅ Paystack configured'
    : '❌ NOT CONFIGURED — add PAYSTACK_SECRET_KEY to .env',
}));

// ── Root ──────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({
  success: true,
  message: 'EAC Learning Platform API v1.1',
  endpoints: {
    health:      '/health',
    auth:        '/api/auth',
    users:       '/api/users',
    subjects:    '/api/subjects',
    examBoards:  '/api/exam-boards',
    catalog:     '/api/catalog',
    analytics:   '/api/analytics',
    payments:    '/api/payments',
    questions:   '/api/questions',
    quizzes:     '/api/quizzes',
    ai:          '/api/ai',
    resources:   '/api/resources',
    subtopics:   '/api/subtopics',
    videos:      '/api/videos',
    pastPapers:  '/api/past-papers',
    notes:       '/api/notes',
    teacher:     '/api/teacher',
    student:     '/api/student',
    admin:       '/api/admin',
    notifications: '/api/notifications',
  },
}));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({
    success: false,
    error:   err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n🚀 EAC Server running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`📍 API:    http://localhost:${PORT}/api`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`🤖 AI:     ${process.env.GEMINI_API_KEY    ? '✅ Gemini configured'   : '❌ GEMINI_API_KEY missing'}`);
  console.log(`💳 Pay:    ${process.env.PAYSTACK_SECRET_KEY ? '✅ Paystack configured' : '❌ PAYSTACK_SECRET_KEY missing'}\n`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.message);
  server.close(() => process.exit(1));
});

module.exports = app;
