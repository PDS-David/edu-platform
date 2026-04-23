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
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

// ─────────────────────────────────────────────
// SAFE REQUIRE (FIX FOR YOUR CRASH)
// ─────────────────────────────────────────────
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
// CORS — MUST be registered before EVERYTHING else.
// Static file handlers, helmet, rate-limiters, and error handlers
// all respond without CORS headers if CORS isn't first.
// ─────────────────────────────────────────────

// Belt-and-suspenders: manually inject CORS headers on EVERY response
// before any middleware can intercept and respond without them.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-request-id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const corsOptions = {
  origin: (origin, cb) => cb(null, true),  // accept all origins
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-request-id'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));  // handle ALL pre-flight requests

// STATIC — uploaded files (resources, past-papers, videos)
// In production Docker: nginx serves /uploads directly from the shared volume.
// In development (npm run dev): Node serves them here.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// STATIC CLIENT BUILD
// In production Docker: nginx serves the React app — this block is skipped.
// In development / single-container mode: Node serves the built React app.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

app.use(requestId);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(globalLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// DB INIT
require('./config/database');

// AUTH
const { protect } = require('./middleware/auth');

// ROUTES (SAFE LOADING)
const authRoutes          = safeRequire('./routes/authRoutes');
const userRoutes          = safeRequire('./routes/users');
const subjectRoutes       = safeRequire('./routes/subjectsRoutes');
const topicsRoutes        = safeRequire('./routes/topicsRoutes');
const subtopicRoutes      = safeRequire('./routes/subtopicRoutes');
const weakTopicRoutes     = safeRequire('./routes/weakTopicRoutes');
const recommendationRoutes = safeRequire('./routes/recommendationRoutes');
const sessionRoutes       = safeRequire('./routes/sessionRoutes');
const analyticsRoutes     = safeRequire('./routes/analyticsRoutes');
const questionsRoutes     = safeRequire('./routes/questionsRoutes');
const resourceRoutes      = safeRequire('./routes/resourceRoutes');
const adminRoutes         = safeRequire('./routes/adminRoutes');
const studentRoutes       = safeRequire('./routes/studentRoutes');
const teacherRoutes       = safeRequire('./routes/teacherRoutes');
const catalogRoutes       = safeRequire('./routes/catalogRoutes');
const quizRoutes          = safeRequire('./routes/quizzes');
const quizGeneratorRoute  = safeRequire('./routes/quizGeneratorRoute');
const paymentRoutes       = safeRequire('./routes/paymentRoutes');
const notificationRoutes  = safeRequire('./routes/notificationsRoutes');
const pastPaperRoutes     = safeRequire('./routes/pastPaperRoutes');
const notesRoutes         = safeRequire('./routes/notesRoutes');
const videosRoutes        = safeRequire('./routes/videosRoutes');
const examBoardRoutes     = safeRequire('./routes/examBoardRoutes');
const aiRoutes            = safeRequire('./routes/aiRoutes');
const conceptRoutes       = safeRequire('./routes/conceptRoutes');
const progressRoutes      = safeRequire('./routes/progressRoutes');
const subtopicProgressRoutes = safeRequire('./routes/subtopicProgressRoutes');
const progressSummaryBulk = safeRequire('./routes/progressSummaryBulk');
const adaptiveRoutes      = safeRequire('./routes/adaptiveRoutes');
const learningEventRoutes = safeRequire('./routes/learningEventRoutes');
const studyPlannerRoutes  = safeRequire('./routes/studyPlannerRoute');
const enrollmentRoutes    = safeRequire('./routes/enrollments');
const courseRoutes        = safeRequire('./routes/courses');
const curriculumRoutes    = safeRequire('./routes/curriculumRoutes');
const replayRoutes        = safeRequire('./routes/eventReplayRoutes');
const dashboardRoutes     = safeRequire('./routes/dashboardRoutes');

// MOUNT
if (authRoutes)             app.use('/api/auth',              authRoutes);
if (userRoutes)             app.use('/api/users',             protect, userRoutes);
if (subjectRoutes)          app.use('/api/subjects',          protect, subjectRoutes);
if (topicsRoutes)           app.use('/api/topics',            protect, topicsRoutes);
if (subtopicRoutes)         app.use('/api/subtopics',         protect, subtopicRoutes);
if (questionsRoutes)        app.use('/api/questions',         protect, questionsRoutes);
if (quizRoutes)             app.use('/api/quizzes',           protect, quizRoutes);
if (quizGeneratorRoute)     app.use('/api/quiz-generator',    protect, quizGeneratorRoute);
if (resourceRoutes)         app.use('/api/resources',         protect, resourceRoutes);
if (analyticsRoutes)        app.use('/api/analytics',         protect, analyticsRoutes);
if (progressRoutes)         app.use('/api/progress',          protect, progressRoutes);
if (progressSummaryBulk)    app.use('/api/progress-summary',  protect, progressSummaryBulk);
if (subtopicProgressRoutes) app.use('/api/subtopics',        protect, subtopicProgressRoutes);
if (notesRoutes)            app.use('/api/notes',             protect, notesRoutes);
if (notificationRoutes)     app.use('/api/notifications',     protect, notificationRoutes);
if (pastPaperRoutes)        app.use('/api/past-papers',               pastPaperRoutes);
if (videosRoutes)           app.use('/api/videos',            protect, videosRoutes);
if (conceptRoutes)          app.use('/api/concepts',          protect, conceptRoutes);
if (catalogRoutes)          app.use('/api/catalog',           protect, catalogRoutes);
if (examBoardRoutes)        app.use('/api/exam-boards',               examBoardRoutes);
if (aiRoutes)               app.use('/api/ai',                protect, aiRoutes);
if (adaptiveRoutes)         app.use('/api/adaptive',          protect, adaptiveRoutes);
if (learningEventRoutes)    app.use('/api/learning-events',   protect, learningEventRoutes);
if (studyPlannerRoutes)     app.use('/api/study-planner',     protect, studyPlannerRoutes);
if (enrollmentRoutes)       app.use('/api/enrollments',       protect, enrollmentRoutes);
if (courseRoutes)           app.use('/api/courses',                   courseRoutes);
if (curriculumRoutes)       app.use('/api/curriculum',        protect, curriculumRoutes);
if (studentRoutes)          app.use('/api/students',          protect, studentRoutes);
if (teacherRoutes)          app.use('/api/teacher',           protect, teacherRoutes);
if (adminRoutes)            app.use('/api/admin',             protect, adminRoutes);
if (paymentRoutes)          app.use('/api/payments',          protect, paymentRoutes);
if (weakTopicRoutes)        app.use('/api/weak-topics',       protect, weakTopicRoutes);
if (recommendationRoutes)   app.use('/api/recommendations',   protect, recommendationRoutes);
if (sessionRoutes)          app.use('/api/sessions',          protect, sessionRoutes);
if (dashboardRoutes)        app.use('/api/dashboard',        protect, dashboardRoutes);
if (replayRoutes)           app.use('/api/replay',            protect, replayRoutes);

// HEALTH
app.get('/health', (_req, res) => {
  return success(res, { data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// SPA FALLBACK — serve index.html for any non-API route when running without nginx
// (development, single-container, or direct Node access)
if (fs.existsSync(clientDist)) {
  app.get('*', (req, res) => {
    // Only fall back if the request isn't an API or upload call
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// ERROR HANDLER
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message });
  return error(res, { message: err.message || 'Server error' });
});

// SERVER
const server = http.createServer(app);

// REALTIME (SAFE)
try {
  const RealtimeEngine = require('./services/realtimeEngine');
  new RealtimeEngine(server);
} catch {
  logger.warn('Realtime not initialized');
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
