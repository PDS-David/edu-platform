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
// In production, rely on platform-provided environment variables (Render/Hetzner).
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
// SECURITY — upload directory access policy:
//
//  /uploads/videos/**     → always 403. HLS/keys served through /api/videos/*
//  /uploads/resources/**  → always 403. Files served through /api/resources/:id/download
//                           or /api/resources/r2/* (both require authentication +
//                           entitlement check). Direct URL access is permanently
//                           disabled to prevent stored XSS and auth bypass.
//  /uploads/past-papers/** → always 403. Served via authenticated past-paper routes.
//  /uploads/**            → any remaining path (thumbnails etc.) falls through to
//                           static with X-Content-Type-Options: nosniff.
// ─────────────────────────────────────────────────────────────────────────────

// Block direct access to video files
app.use('/uploads/videos', (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Direct access to video files is not permitted. Use /api/videos/stream/*.',
  });
});

// INVALID-01 FIX: Block direct access to uploaded resources.
// Previously, an attacker who uploaded payload.html with Content-Type: image/png
// could trigger stored XSS by visiting /uploads/resources/payload.html directly.
// Files must now be accessed through the authenticated download endpoint which
// enforces entitlement checks and sets Content-Disposition/X-Content-Type-Options.
app.use('/uploads/resources', (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Direct access to uploaded resources is not permitted. Use /api/resources/:id/download.',
  });
});

// Block direct access to past-paper uploads
app.use('/uploads/past-papers', (_req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Direct access to past-paper files is not permitted.',
  });
});

// Remaining /uploads paths (thumbnails, etc.) served statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    // Prevent MIME confusion: browser must honour the Content-Type we set.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Allow embedding in PDF/office viewers from the frontend domain.
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    const a = [process.env.CLIENT_URL, process.env.PROD_CLIENT_URL]
      .filter(Boolean)
      .map((u) => u.replace(/\/+$/, ''));
    const frameAncestors = a.length ? a.join(' ') : '*';
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
if (catalogRoutes) app.use('/api/catalog', protect, catalogRoutes);
if (examBoardRoutes) app.use('/api/exam-boards', examBoardRoutes);
if (aiRoutes) app.use('/api/ai', protect, aiRoutes);
if (aiChatRoute) app.use('/api/ai', protect, aiChatRoute);
if (adaptiveRoutes) app.use('/api/adaptive', protect, adaptiveRoutes);
if (learningEventRoutes) app.use('/api/learning-events', protect, learningEventRoutes);
if (studyPlannerRoutes) app.use('/api/study-planner', protect, studyPlannerRoutes);
if (enrollmentRoutes) app.use('/api/enrollments', protect, enrollmentRoutes);
if (courseRoutes) app.use('/api/courses', courseRoutes);
if (curriculumRoutes) app.use('/api/curriculum', protect, curriculumRoutes);
if (studentRoutes) app.use('/api/students', protect, studentRoutes);
if (teacherRoutes) app.use('/api/teacher', protect, teacherRoutes);
if (adminRoutes) app.use('/api/admin', protect, adminRoutes);
if (paymentRoutes) app.use('/api/payments', protect, paymentRoutes);
if (weakTopicRoutes) app.use('/api/weak-topics', protect, weakTopicRoutes);
if (recommendationRoutes) app.use('/api/recommendations', protect, recommendationRoutes);
if (sessionRoutes) app.use('/api/sessions', protect, sessionRoutes);
if (dashboardRoutes) app.use('/api/dashboard', protect, dashboardRoutes);
if (replayRoutes) app.use('/api/replay', protect, replayRoutes);
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
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message });
  // Pass string (not object) — error() sets response.error = message
  // Passing an object causes React error #31 when frontend renders err?.error
  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    success: false,
    error: err.message || 'Server error',
  });
});

// SERVER START
const server = http.createServer(app);

// REALTIME SAFE LOAD
try {
  const RealtimeEngine = require('./services/realtimeEngine');
  new RealtimeEngine(server);
} catch {
  logger.warn('Realtime not initialized');
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server bound to PORT = ${PORT}`);
});
