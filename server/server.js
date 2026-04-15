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
// ENV
// ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

// ─────────────────────────────────────────────────────────────
// LOGGING DIR
// ─────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
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
// STATIC CLIENT
// ─────────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log('Serving React frontend');
} else {
  console.log('No client build detected');
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
  process.env.CLIENT_URL,
  process.env.PROD_CLIENT_URL,
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
  './models/SubtopicProgress',
  './models/Question',
];

for (const m of modelPaths) {
  try {
    const model = require(m);
    if (typeof model === 'function') model(db);
  } catch (e) {
    logger.warn(`Model skipped: ${m} — ${e.message}`);
  }
}

try {
  require('./models/associations');
} catch {}

// ─────────────────────────────────────────────────────────────
// DB CONNECT
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
} catch {}

// ─────────────────────────────────────────────────────────────
// SAFE REQUIRE
// ─────────────────────────────────────────────────────────────
function safeRequire(path) {
  try {
    return require(path);
  } catch (e) {
    logger.error(`Route missing: ${path}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────

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
const topicRoutes = safeRequire('./routes/topicsRoutes');
const subtopicRoutes = safeRequire('./routes/subtopicRoutes');

// LEARNING
const resourceRoutes = safeRequire('./routes/resourceRoutes');
const quizRoutes = safeRequire('./routes/quizzes');
const questionRoutes = safeRequire('./routes/questionsRoutes');

// ─────────────────────────────────────────────────────────────
// 🧠 2.8 EXAM INTELLIGENCE ENGINE
// ─────────────────────────────────────────────────────────────
const examAnalyticsRoutes = safeRequire('./routes/examAnalyticsRoutes');

// ─────────────────────────────────────────────────────────────
// 🤖 2.9 AI QUESTION GENERATION ENGINE
// ─────────────────────────────────────────────────────────────
const aiQuestionGenRoutes = safeRequire('./routes/aiQuestionGenerationRoutes');

// ─────────────────────────────────────────────────────────────
// ROUTE MOUNTING
// ─────────────────────────────────────────────────────────────

// public
if (authRoutes) app.use('/api/auth', authRoutes);
if (examBoardsRoutes) app.use('/api/exam-boards', examBoardsRoutes);
if (curriculumRoutes) app.use('/api/curriculum', curriculumRoutes);

// core
if (aiRoutes) app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiRoutes);
if (adminRoutes) app.use('/api/admin', protect, adminRoutes);
if (teacherRoutes) app.use('/api/teacher', protect, teacherRoutes);
if (userRoutes) app.use('/api/users', protect, userRoutes);

if (subjectRoutes) app.use('/api/subjects', protect, subjectRoutes);
if (topicRoutes) app.use('/api/topics', protect, topicRoutes);
if (subtopicRoutes) app.use('/api/subtopics', protect, subtopicRoutes);

// learning
if (resourceRoutes) app.use('/api/resources', protect, resourceRoutes);
if (quizRoutes) app.use('/api/quizzes', protect, quizRoutes);
if (questionRoutes) app.use('/api/questions', protect, questionRoutes);

// ENGINE 2.8
if (examAnalyticsRoutes)
  app.use('/api/exam-analytics', protect, examAnalyticsRoutes);

// ENGINE 2.9
if (aiQuestionGenRoutes)
  app.use('/api/ai-questions', protect, subscriptionGuard, aiQuestionGenRoutes);

// ─────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ success: true }));

// ─────────────────────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
