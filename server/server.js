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
require('dotenv').config({
  path: path.join(__dirname, '.env'),
  override: true
});

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
// CORS (GLOBAL FIRST LAYER)
// ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-request-id');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','x-request-id'],
}));

app.options('*', cors());

// STATIC FILES
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// CLIENT BUILD
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// MIDDLEWARES
app.use(requestId);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(globalLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
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
if (subtopicProgressRoutes) app.use('/api/subtopics', protect, subtopicProgressRoutes);
if (notesRoutes) app.use('/api/notes', protect, notesRoutes);
if (notificationRoutes) app.use('/api/notifications', protect, notificationRoutes);
if (pastPaperRoutes) app.use('/api/past-papers', pastPaperRoutes);
if (videosRoutes) app.use('/api/videos', protect, videosRoutes);
if (conceptRoutes) app.use('/api/concepts', protect, conceptRoutes);
if (catalogRoutes) app.use('/api/catalog', protect, catalogRoutes);
if (examBoardRoutes) app.use('/api/exam-boards', examBoardRoutes);
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
if (paymentRoutes) app.use('/api/payments', protect, paymentRoutes);
if (weakTopicRoutes) app.use('/api/weak-topics', protect, weakTopicRoutes);
if (recommendationRoutes) app.use('/api/recommendations', protect, recommendationRoutes);
if (sessionRoutes) app.use('/api/sessions', protect, sessionRoutes);
if (dashboardRoutes) app.use('/api/dashboard', protect, dashboardRoutes);
if (replayRoutes) app.use('/api/replay', protect, replayRoutes);

// HEALTH
app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'eac-api' });
});

app.get('/health', (_req, res) => {
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
  return error(res, { message: err.message || 'Server error' });
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
