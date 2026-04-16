'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const { aiLimiter, globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');

// ─────────────────────────────────────────────────────────────
// ENV LOADING (LOCAL ONLY)
// ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

// ─────────────────────────────────────────────────────────────
// LOG DIRECTORY (PROD SAFETY)
// ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────
// ENV VALIDATION
// ─────────────────────────────────────────────────────────────
(function validateEnv() {
  const required = ['JWT_SECRET', 'PORT'];

  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    required.push('DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD');
  }

  const missing = required.filter(k => !process.env[k]);

  if (missing.length) {
    console.error('Missing environment variables:', missing.join(', '));
    process.exit(1);
  }
})();

// ─────────────────────────────────────────────────────────────
// APP INIT
// ─────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────
// STATIC FRONTEND (OPTIONAL)
// ─────────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log('Serving React frontend from client/dist');
} else {
  console.log('No client build detected (Render Static Site expected)');
}

// ─────────────────────────────────────────────────────────────
// CORE MIDDLEWARE
// ─────────────────────────────────────────────────────────────
app.use(requestId);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(globalLimiter);

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://aischoolonair.onrender.com',
  process.env.CLIENT_URL,
  process.env.PROD_CLIENT_URL,
  process.env.NGROK_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

    logger.warn('CORS blocked', { origin });
    return cb(null, true);
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ─────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────
const db = require('./config/database');

// ─────────────────────────────────────────────────────────────
// MODEL BOOTSTRAP
// ─────────────────────────────────────────────────────────────
const modelPaths = [
  './models/User',
  './models/ExamBoard',
  './models/Subject',
  './models/Topic',
  './models/Subtopic',
  './models/Resource',
  './models/Course',
  './models/Enrollment',
  './models/Quiz',
  './models/Question',
  './models/Note',
  './models/Video',
  './models/PastPaper',
  './models/Payment',
  './models/Notification',
  './models/Concept',
  './models/StudentExamType',
  './models/SubtopicProgress',
  './models/PracticeAttempt',
  './models/AiChatSession',
  './models/AiChatMessage',
  './models/TeacherSubject',
];

for (const m of modelPaths) {
  try {
    const model = require(m);
    if (typeof model === 'function') {
      if (model.length === 1) model(db);
      else model();
    }
  } catch (e) {
    logger.warn(`Model skipped: ${m} — ${e.message}`);
  }
}

try {
  require('./models/associations');
} catch (e) {
  logger.warn('Associations not loaded');
}

// ─────────────────────────────────────────────────────────────
// DB CONNECTION
// ─────────────────────────────────────────────────────────────
async function initDB() {
  try {
    await db.authenticate();
    logger.info('DB connected');
  } catch (err) {
    logger.error('DB connection failed', { error: err.message });
    process.exit(1);
  }
}
initDB();

// ─────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────
const { protect } = require('./middleware/auth');

let subscriptionGuard = (_r, _s, n) => n();
try {
  subscriptionGuard = require('./middleware/subscriptionGuard');
} catch (e) {
  logger.warn('subscriptionGuard missing');
}

// ENGINE BOOTSTRAP
require('./services/eventEngine');
require('./services/analyticsEngine');


// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────
function safeRequire(routePath) {
  try {
    return require(routePath);
  } catch (e) {
    logger.error(`Route missing: ${routePath} — ${e.message}`);
    return null;
  }
}

// PUBLIC
const authRoutes = safeRequire('./routes/authRoutes');
const examBoardsRoutes = safeRequire('./routes/examBoardsRoutes');
const curriculumRoutes = safeRequire('./routes/curriculumRoutes');

// CORE
const aiRoutes = safeRequire('./routes/aiRoutes');
const adminRoutes = safeRequire('./routes/adminRoutes');
const teacherRoutes = safeRequire('./routes/teacherRoutes');
const userRoutes = safeRequire('./routes/users');

const subjectRoutes = safeRequire('./routes/subjectsRoutes');
const topicsRoutes = safeRequire('./routes/topicsRoutes');
const subtopicRoutes = safeRequire('./routes/subtopicRoutes');

// 🔥 A1 PROGRESS ENGINE ROUTE (NEW)
const subtopicProgressRoutes = safeRequire('./routes/subtopicProgressRoutes');

// LEARNING
const resourceRoutes = safeRequire('./routes/resourceRoutes');
const coursesRoutes = safeRequire('./routes/courses');
const enrollmentsRoutes = safeRequire('./routes/enrollments');
const quizzesRoutes = safeRequire('./routes/quizzes');
const questionsRoutes = safeRequire('./routes/questionsRoutes');
const analyticsRoutes = safeRequire('./routes/analyticsRoutes');
const notesRoutes = safeRequire('./routes/notesRoutes');
const videosRoutes = safeRequire('./routes/videosRoutes');
const pastPaperRoutes = safeRequire('./routes/pastPaperRoutes');
const paymentRoutes = safeRequire('./routes/paymentRoutes');
const catalogRoutes = safeRequire('./routes/catalogRoutes');
const notificationsRoutes = safeRequire('./routes/notificationsRoutes');
const studentRoutes = safeRequire('./routes/studentRoutes');
const conceptRoutes = safeRequire('./routes/conceptRoutes');

// OPTIONAL
let aiChatRoute = safeRequire('./routes/aiChatRoute');

// ─────────────────────────────────────────────────────────────
// STATIC
// ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─────────────────────────────────────────────────────────────
// ROUTE MOUNTING
// ─────────────────────────────────────────────────────────────

// PUBLIC
if (authRoutes) app.use('/api/auth', authRoutes);
if (examBoardsRoutes) app.use('/api/exam-boards', examBoardsRoutes);
if (curriculumRoutes) app.use('/api/curriculum', curriculumRoutes);

// AI
if (aiRoutes) app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiRoutes);
if (aiChatRoute) app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiChatRoute);

// CORE
if (adminRoutes) app.use('/api/admin', protect, adminRoutes);
if (teacherRoutes) app.use('/api/teacher', protect, teacherRoutes);
if (userRoutes) app.use('/api/users', protect, userRoutes);

if (subjectRoutes) app.use('/api/subjects', protect, subjectRoutes);
if (topicsRoutes) app.use('/api/topics', protect, topicsRoutes);
if (subtopicRoutes) app.use('/api/subtopics', protect, subtopicRoutes);

// 🔥 A1 PROGRESS ENGINE MOUNT (NEW)
if (subtopicProgressRoutes) {
  app.use('/api/subtopic-progress', protect, subtopicProgressRoutes);
}

// LEARNING
if (resourceRoutes) app.use('/api/resources', protect, resourceRoutes);
if (coursesRoutes) app.use('/api/courses', protect, coursesRoutes);
if (enrollmentsRoutes) app.use('/api/enrollments', protect, enrollmentsRoutes);
if (quizzesRoutes) app.use('/api/quizzes', protect, quizzesRoutes);
if (questionsRoutes) app.use('/api/questions', protect, questionsRoutes);

if (analyticsRoutes) app.use('/api/analytics', protect, analyticsRoutes);
if (notesRoutes) app.use('/api/notes', protect, notesRoutes);
if (videosRoutes) app.use('/api/videos', protect, videosRoutes);
if (pastPaperRoutes) app.use('/api/past-papers', protect, pastPaperRoutes);
if (paymentRoutes) app.use('/api/payments', protect, paymentRoutes);
if (catalogRoutes) app.use('/api/catalog', protect, catalogRoutes);
if (notificationsRoutes) app.use('/api/notifications', protect, notificationsRoutes);
if (studentRoutes) app.use('/api/students', protect, studentRoutes);
if (conceptRoutes) app.use('/api/concepts', protect, conceptRoutes);

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
