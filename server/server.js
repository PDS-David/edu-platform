'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { success, error } = require('./utils/response');

const { aiLimiter, globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');

// ENV
// In production, rely on platform-provided environment variables (Hetzner api.env).
// Only load a local `server/.env` file for local development, and never override
// existing environment variables.
if (process.env.NODE_ENV !== 'production') {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath, override: false });
  }
}

// SAFE REQUIRE
const safeRequire = (modulePath) => {
  try {
    return require(modulePath);
  } catch (err) {
    logger.warn(`Optional module missing: ${modulePath}`);
    return null;
  }
};

// APP
const app = express();
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────
// IMPORTANT: Do NOT allow credentials for every origin.
// Configure an allow-list via env vars.
const corsAllowList = new Set(
  [
    process.env.CLIENT_URL,
    process.env.PROD_CLIENT_URL,
    process.env.VITE_API_URL,
    // Hard-coded safety net — if env vars are missing the site still works
    'https://www.aischoolonair.ng',
    'https://aischoolonair.ng',
    'https://staging.aischoolonair.ng',
  ].filter(Boolean)
);

const corsOptions = {
  origin: (origin, cb) => {
    // Non-browser clients (no Origin header): allow.
    if (!origin) return cb(null, true);
    // Allow explicitly configured origins only.
    if (corsAllowList.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-confirm'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// STATIC FILES
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: The following directories are NEVER served as static files.
// All access to these must go through authenticated API endpoints.
//
//   /uploads/videos      → served via /api/videos/stream/* (HLS + auth)
//   /uploads/resources   → served via /api/resources/:id/download (entitlement check)
//   /uploads/past-papers → served via /api/past-papers/:id/download or R2 signed URL
//   /uploads/raw         → internal raw uploads, never served
//
// /uploads remains mounted for remaining public assets (e.g. thumbnails),
// but with explicit subdirectory blocks above it.
// ─────────────────────────────────────────────────────────────────────────────

// Block all direct access to video files (existing fix — kept)
app.use('/uploads/videos', (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Direct access to video files is not permitted. Use /api/videos/stream/*.',
  });
});

// Block direct access to resources — must go through authenticated download
app.use('/uploads/resources', (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Direct access to resource files is not permitted. Use /api/resources/:id/download.',
  });
});

// Block direct access to past-paper files
app.use('/uploads/past-papers', (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Direct access to past paper files is not permitted.',
  });
});

// /uploads static mount for remaining public assets (thumbnails, etc.)
// X-Content-Type-Options: nosniff prevents MIME-sniffing attacks on anything
// still served from here.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    // Prevent browser MIME sniffing — must honour Content-Type header only
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Allow embedding (PDF/office viewers) from the frontend domain only
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    const a = [process.env.CLIENT_URL, process.env.PROD_CLIENT_URL]
      .filter(Boolean)
      .map((u) => u.replace(/\/+$/, ''));
    const frameAncestors = a.length ? a.join(' ') : 'https://www.aischoolonair.ng https://aischoolonair.ng';
    res.setHeader('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);
  },
}));

// CLIENT BUILD
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// MIDDLEWARES
app.use(requestId);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'", 'data:'],
      objectSrc:   ["'none'"],
      // Google Docs Viewer needed for office file previews (R2-hosted docx/pptx)
      frameSrc:    ["'self'", 'https://docs.google.com'],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(globalLimiter);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(requestLogger);

// DB
require('./config/database');

// AUTH
const { protect } = require('./middleware/auth');

// ROUTES
const authRoutes = safeRequire('./routes/authRoutes');
const userRoutes = safeRequire('./routes/users');
const subjectRoutes = safeRequire('./routes/subjectsRoutes');
const topicsRoutes = safeRequire('./routes/topicsRoutes');
const subtopicRoutes = safeRequire('./routes/subtopicRoutes');
const weakTopicRoutes = safeRequire('./routes/weakTopicRoutes');
const recommendationRoutes = safeRequire('./routes/recommendationRoutes');
const sessionRoutes = safeRequire('./routes/sessionRoutes');
const analyticsRoutes = safeRequire('./routes/analyticsRoutes');
const questionsRoutes = safeRequire('./routes/questionsRoutes');
const resourceRoutes = safeRequire('./routes/resourceRoutes');
const adminRoutes = safeRequire('./routes/adminRoutes');
const auditRoutes = safeRequire('./routes/auditRoutes');
const studentRoutes = safeRequire('./routes/studentRoutes');
const teacherRoutes = safeRequire('./routes/teacherRoutes');
const catalogRoutes = safeRequire('./routes/catalogRoutes');
const quizRoutes = safeRequire('./routes/quizzes');
const quizGeneratorRoute = safeRequire('./routes/quizGeneratorRoute');
const paymentRoutes = safeRequire('./routes/paymentRoutes');
const notificationRoutes = safeRequire('./routes/notificationsRoutes');
const pastPaperRoutes = safeRequire('./routes/pastPaperRoutes');
const notesRoutes = safeRequire('./routes/notesRoutes');
const videosRoutes = safeRequire('./routes/videosRoutes');
const examBoardRoutes = safeRequire('./routes/examBoardRoutes');
const aiRoutes = safeRequire('./routes/aiRoutes');
const aiChatRoute = safeRequire('./routes/aiChatRoute');
const conceptRoutes = safeRequire('./routes/conceptRoutes');
const progressRoutes = safeRequire('./routes/progressRoutes');
const subtopicProgressRoutes = safeRequire('./routes/subtopicProgressRoutes');
const progressSummaryBulk = safeRequire('./routes/progressSummaryBulk');
const adaptiveRoutes = safeRequire('./routes/adaptiveRoutes');
const learningEventRoutes = safeRequire('./routes/learningEventRoutes');
const studyPlannerRoutes = safeRequire('./routes/studyPlannerRoute');
const enrollmentRoutes = safeRequire('./routes/enrollments');
const courseRoutes = safeRequire('./routes/courses');
const curriculumRoutes = safeRequire('./routes/curriculumRoutes');
const replayRoutes = safeRequire('./routes/eventReplayRoutes');
const englishMasterclassRoutes = safeRequire('./routes/englishMasterclassRoutes');
const dashboardRoutes = safeRequire('./routes/dashboardRoutes');
const aiQuestionGenRoutes = safeRequire('./routes/aiQuestionGenerationRoutes');
const engineValidationRoutes = safeRequire('./routes/engineValidationRoutes');
const examIntelligenceRoutes = safeRequire('./routes/examIntelligenceRoutes');
const explanationRoutes = safeRequire('./routes/explanationRoute');

// MOUNT ROUTES
if (authRoutes) app.use('/api/auth', authRoutes);
if (userRoutes) app.use('/api/users', protect, userRoutes);
if (subjectRoutes) app.use('/api/subjects', protect, subjectRoutes);
if (topicsRoutes) app.use('/api/topics', protect, topicsRoutes);
if (subtopicRoutes) app.use('/api/subtopics', protect, subtopicRoutes);
if (questionsRoutes) app.use('/api/questions', protect, questionsRoutes);
if (quizRoutes) app.use('/api/quizzes', protect, quizRoutes);
if (quizGeneratorRoute) app.use('/api/quiz-generator', protect, quizGeneratorRoute);
if (resourceRoutes) app.use('/api/resources', protect, resourceRoutes);
if (analyticsRoutes) app.use('/api/analytics', protect, analyticsRoutes);
if (progressRoutes) app.use('/api/progress', protect, progressRoutes);
if (progressSummaryBulk) app.use('/api/progress-summary', protect, progressSummaryBulk);
if (subtopicProgressRoutes) app.use('/api/subtopic-progress', protect, subtopicProgressRoutes);
if (notesRoutes) app.use('/api/notes', protect, notesRoutes);
if (notificationRoutes) app.use('/api/notifications', protect, notificationRoutes);
if (pastPaperRoutes) app.use('/api/past-papers', pastPaperRoutes);
if (videosRoutes) app.use('/api/videos', protect, videosRoutes);
if (conceptRoutes) app.use('/api/concepts', protect, conceptRoutes);
if (catalogRoutes) app.use('/api/catalog', catalogRoutes);
if (examBoardRoutes) app.use('/api/exam-boards', examBoardRoutes);
if (aiChatRoute) app.use('/api/ai', protect, aiChatRoute);
if (aiRoutes) app.use('/api/ai', protect, aiRoutes);
if (adaptiveRoutes) app.use('/api/adaptive', protect, adaptiveRoutes);
if (learningEventRoutes) app.use('/api/learning-events', protect, learningEventRoutes);
if (studyPlannerRoutes) app.use('/api/study-planner', protect, studyPlannerRoutes);
if (enrollmentRoutes) app.use('/api/enrollments', protect, enrollmentRoutes);
if (courseRoutes) app.use('/api/courses', courseRoutes);
if (curriculumRoutes) app.use('/api/curriculum', protect, curriculumRoutes);
if (studentRoutes) app.use('/api/students', protect, studentRoutes);
if (teacherRoutes) app.use('/api/teacher', protect, teacherRoutes);
if (adminRoutes) app.use('/api/admin', protect, adminRoutes);
if (auditRoutes) app.use('/api/audit', protect, auditRoutes);
if (paymentRoutes) app.use('/api/payments', protect, paymentRoutes);
if (weakTopicRoutes) app.use('/api/weak-topics', protect, weakTopicRoutes);
if (recommendationRoutes) app.use('/api/recommendations', protect, recommendationRoutes);
if (sessionRoutes) app.use('/api/sessions', protect, sessionRoutes);
if (dashboardRoutes) app.use('/api/dashboard', protect, dashboardRoutes);
if (replayRoutes) app.use('/api/replay', protect, replayRoutes);
if (englishMasterclassRoutes) app.use('/api/english-masterclass', protect, englishMasterclassRoutes);
if (aiQuestionGenRoutes) app.use('/api/ai-question-gen', protect, aiQuestionGenRoutes);
if (engineValidationRoutes) app.use('/api/engine', protect, engineValidationRoutes);
if (examIntelligenceRoutes) app.use('/api/exam-intelligence', protect, examIntelligenceRoutes);
if (explanationRoutes) app.use('/api/explanations', protect, explanationRoutes);

// HEALTH
app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'eac-api' });
});

app.get('/health', (_req, res) => {
  return success(res, {
    data: { status: 'ok', timestamp: new Date().toISOString() }
  });
});

// Alias so Caddy-proxied requests to /api/health (the public URL) resolve correctly.
// Caddy routes /api/* → api:5000, so the API receives the path as /api/health.
// Without this alias, Express finds no matching route and falls through to the
// SPA nginx container, which returns "Cannot GET /api/health".
app.get('/api/health', (_req, res) => {
  return success(res, {
    data: { status: 'ok', timestamp: new Date().toISOString() }
  });
});


// SPA fallback
if (fs.existsSync(clientDist)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// ERROR HANDLER
// R-03: Never expose raw database error messages (constraint names, column
// names, internal query text) to the client.  We log the full error server-
// side and return a sanitised message only.
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  // Postgres unique-violation (23505) — translate to clean 409
  const pgCode = err.parent?.code || err.original?.code;
  if (pgCode === '23505') {
    return res.status(409).json({ success: false, error: 'A record with that value already exists' });
  }

  // Other Postgres / Sequelize errors — suppress internal detail
  const isDbError = pgCode || err.name === 'SequelizeDatabaseError' || err.name === 'SequelizeUniqueConstraintError';
  if (isDbError) {
    return res.status(500).json({ success: false, error: 'A database error occurred' });
  }

  const statusCode = err.statusCode || err.status || 500;
  // Only expose the message for application-level errors (no DB detail)
  const safeMessage = statusCode < 500 ? (err.message || 'Request error') : 'Server error';
  return res.status(statusCode).json({
    success: false,
    error: safeMessage,
  });
});

// SERVER START
const server = http.createServer(app);

// REALTIME SAFE LOAD
// X2 FIX: realtimeEngine exports a singleton instance (module.exports = new RealtimeEngine())
// so the correct call is .init(server), not new RealtimeEngine(server).
try {
  const realtimeEngine = require('./services/realtimeEngine');
  realtimeEngine.init(server);
  logger.info('Realtime engine initialised (socket.io)');
} catch (e) {
  logger.warn('Realtime not initialized:', e.message);
}

/*
  🔥 CRITICAL FIX:
  NO fallback port.
  Must use platform-provided PORT only.
*/
const PORT = process.env.PORT;

if (!PORT) {
  console.error('❌ FATAL: PORT not provided by environment');
  process.exit(1);
}

// Auth maintenance — nightly cleanup of expired tokens and audit log
const authCleanup = safeRequire('./jobs/authCleanup');
if (authCleanup) authCleanup.register();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server bound to PORT = ${PORT}`);

  // X1: scheduled jobs were written but never started — wire them up here
  try {
    const scheduledJobs = require('./jobs/scheduledJobs');
    (scheduledJobs.startJobs || scheduledJobs.start || (() => {}))();
    console.log('✅ Scheduled jobs started');
  } catch (e) {
    console.warn('[startup] Scheduled jobs could not start:', e.message);
  }
});
