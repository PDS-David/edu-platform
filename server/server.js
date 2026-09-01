'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const http = require('http');
const compression = require('compression');

const { success, error } = require('./utils/response');

const { aiLimiter, globalLimiter, agentServiceLimiter } = require('./middleware/rateLimiter');
const agentServiceAuth = require('./middleware/agentServiceAuth');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');

// PROCESS-LEVEL SAFETY NET
// Express's app.use((err, req, res, next) => ...) error handler below only
// catches errors passed via next(err) or thrown synchronously in middleware.
// It does NOT catch a rejected promise from an async route handler that has
// no try/catch of its own — that becomes an "unhandled rejection" at the
// process level, and Node terminates the process on those by default.
// Previously that termination happened silently (no log line at all), so an
// outage looked like the app vanishing with no trace. These handlers make
// sure we always log what broke before exiting, and exit deliberately so
// Docker's `restart: unless-stopped` brings up a clean process rather than
// continuing to run with unknown state.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection — restarting for a clean process', {
    error: reason && reason.message ? reason.message : String(reason),
    stack: reason && reason.stack,
  });
  setTimeout(() => process.exit(1), 200);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — restarting for a clean process', {
    error: err.message,
    stack: err.stack,
  });
  setTimeout(() => process.exit(1), 200);
});

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
// COMPRESSION
// ─────────────────────────────────────────────
// Gzip all text responses — JS bundles, JSON API responses, HTML.
// Must be registered before static file serving and all route handlers.
// Typical savings: 1.74 MB JS bundle → ~430 KB over the wire (75% reduction).
// Browsers that don't support gzip receive the uncompressed response transparently.
app.use(compression({
  // Only compress responses above 1 KB — skip tiny JSON blobs where overhead > gain
  threshold: 1024,
  // Use level 6 (default) — good balance between CPU cost and compression ratio
  level: 6,
}));

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
  // Content-hashed assets (JS/CSS/fonts/images) can be cached forever —
  // Vite embeds a hash in every filename so a new build gets new filenames.
  // index.html is NOT content-hashed so it must never be cached; the browser
  // fetches it fresh every visit and then uses the hashed filenames it
  // references to decide whether to pull assets from cache or the network.
  //
  // NOTE: Clear-Site-Data was added here as a temporary workaround during
  // debugging of "React is not defined". It wiped the cache on every single
  // page load and prevented the browser from ever benefiting from caching.
  // Now that the root cause (missing React import in LandingPage.jsx) is
  // fixed, Clear-Site-Data is removed permanently.
  app.use(express.static(clientDist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        // HTML must always be fresh so new deployments are picked up instantly
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
      } else if (/\.(js|css|woff2?|ttf|otf|eot|svg|png|jpg|jpeg|webp|ico|gif)$/.test(filePath)) {
        // Hashed filenames — safe to cache for 1 year in the browser and CDN
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
}

// MIDDLEWARES
app.use(requestId);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrcElem:["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc:      ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc:  ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
                    'wss://www.aischoolonair.ng', 'wss://staging.aischoolonair.ng',
                    'https://api.paystack.co'],
      fontSrc:     ["'self'", 'data:', 'https://fonts.gstatic.com'],
      objectSrc:   ["'none'"],
      frameSrc:    ["'self'", 'https://docs.google.com', 'https://view.officeapps.live.com'],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(globalLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestLogger);

// DB
require('./config/database');

// AUTH
const { protect } = require('./middleware/auth');

// ROUTES
const authRoutes = safeRequire('./routes/authRoutes');
const schoolRoutes = safeRequire('./routes/schoolRoutes');
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
const ipWhitelist = safeRequire('./middleware/ipWhitelist');
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
const replayRoutes = safeRequire('./routes/eventReplayRoutes');
const englishMasterclassRoutes = safeRequire('./routes/englishMasterclassRoutes');
const languageMasterclassRoutes = safeRequire('./routes/languageMasterclassRoutes');
const dashboardRoutes = safeRequire('./routes/dashboardRoutes');
const aiQuestionGenRoutes = safeRequire('./routes/aiQuestionGenerationRoutes');
const engineValidationRoutes = safeRequire('./routes/engineValidationRoutes');
const examIntelligenceRoutes = safeRequire('./routes/examIntelligenceRoutes');
const explanationRoutes = safeRequire('./routes/explanationRoute');
const agentServiceRoutes = safeRequire('./routes/agentServiceRoutes');

// MOUNT ROUTES
if (authRoutes) app.use('/api/auth', authRoutes);
if (schoolRoutes) app.use('/api/schools', schoolRoutes);
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
// catalogRoutes and examBoardRoutes are intentionally mounted WITHOUT
// `protect` here — both are read-only-public-by-design (catalog browsing,
// and exam-board lookup needed by the unauthenticated registration flow).
// catalogRoutes gates its own write endpoints internally with
// `protect, authorize('admin')` per-route; examBoardRoutes has no write
// endpoints at all. See the file-level comment in examBoardRoutes.js
// (SEC-1) for the full verification.
if (catalogRoutes) app.use('/api/catalog', catalogRoutes);
if (examBoardRoutes) app.use('/api/exam-boards', examBoardRoutes);
if (aiChatRoute) app.use('/api/ai', protect, aiChatRoute);
if (aiRoutes) app.use('/api/ai', protect, aiRoutes);
if (adaptiveRoutes) app.use('/api/adaptive', protect, adaptiveRoutes);
if (learningEventRoutes) app.use('/api/learning-events', protect, learningEventRoutes);
if (studyPlannerRoutes) app.use('/api/study-planner', protect, studyPlannerRoutes);
if (enrollmentRoutes) app.use('/api/enrollments', protect, enrollmentRoutes);
if (courseRoutes) app.use('/api/courses', courseRoutes);
if (studentRoutes) app.use('/api/students', protect, studentRoutes);
if (teacherRoutes) app.use('/api/teacher', protect, teacherRoutes);
if (adminRoutes) app.use('/api/admin', protect, ...(ipWhitelist ? [ipWhitelist] : []), adminRoutes);
if (auditRoutes) app.use('/api/audit', protect, auditRoutes);
if (paymentRoutes) app.use('/api/payments', protect, paymentRoutes);
if (weakTopicRoutes) app.use('/api/weak-topics', protect, weakTopicRoutes);
if (recommendationRoutes) app.use('/api/recommendations', protect, recommendationRoutes);
if (sessionRoutes) app.use('/api/sessions', protect, sessionRoutes);
if (dashboardRoutes) app.use('/api/dashboard', protect, dashboardRoutes);
if (replayRoutes) app.use('/api/replay', protect, replayRoutes);
if (englishMasterclassRoutes) app.use('/api/english-masterclass', protect, englishMasterclassRoutes);
if (languageMasterclassRoutes) app.use('/api/language-masterclass', protect, languageMasterclassRoutes);
if (aiQuestionGenRoutes) app.use('/api/ai-question-gen', protect, aiQuestionGenRoutes);
if (engineValidationRoutes) app.use('/api/engine', protect, engineValidationRoutes);
if (examIntelligenceRoutes) app.use('/api/exam-intelligence', protect, examIntelligenceRoutes);
if (explanationRoutes) app.use('/api/explanations', protect, explanationRoutes);
// Mounted at /agent, NOT /api — this is a server-to-server trust boundary
// (other backends, e.g. sts-school-app), not a school-user-facing route, so
// it deliberately does not use `protect` (JWT). agentServiceAuth checks a
// shared X-Api-Key instead. See agentServiceRoutes.js for the full contract.
if (agentServiceRoutes) app.use('/agent', agentServiceAuth, agentServiceLimiter, agentServiceRoutes);

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


// SPA fallback — serve index.html for all non-API, non-asset routes
// so React Router can handle client-side navigation.
// index.html itself is no-store (set above in the static middleware), so
// the browser always fetches a fresh copy — but the hashed assets it
// references (JS/CSS) ARE cached and served instantly on repeat visits.
if (fs.existsSync(clientDist)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
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
