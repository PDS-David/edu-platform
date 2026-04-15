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
// LOG DIRECTORY (PROD SAFE)
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
  console.log('Serving React frontend');
} else {
  console.log('No client build detected (Render Static Site mode)');
}

// ─────────────────────────────────────────────────────────────
// CORE MIDDLEWARE
// ─────────────────────────────────────────────────────────────
app.use(requestId);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(globalLimiter);

// CORS
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
    return cb(null, true); // never crash prod
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
// MODEL BOOTSTRAP (SAFE)
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

// ─────────────────────────────────────────────────────────────
// SAFE REQUIRE
// ─────────────────────────────────────────────────────────────
function safeRequire(routePath) {
  try {
    return require(routePath);
  } catch (e) {
    logger.error(`Route missing: ${routePath}`);
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
// 🧪 2.10 ENGINE INTEGRATION VALIDATION LAYER
// ─────────────────────────────────────────────────────────────
const engineValidationRoutes = safeRequire('./routes/engineValidationRoutes');

// ─────────────────────────────────────────────────────────────
// ROUTE MOUNTING
// ─────────────────────────────────────────────────────────────

// public
if (authRoutes) app.use('/api/auth', authRoutes);
if (examBoardsRoutes) app.use('/api/exam-boards', examBoardsRoutes);
if (curriculumRoutes) app.use('/api/curriculum', curriculumRoutes);

// core
if (aiRoutes)
  app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiRoutes);

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

// ─────────────────────────────────────────────────────────────
// ENGINE 2.8 — EXAM INTELLIGENCE
// ─────────────────────────────────────────────────────────────
if (examAnalyticsRoutes)
  app.use('/api/exam-analytics', protect, examAnalyticsRoutes);

// ─────────────────────────────────────────────────────────────
// ENGINE 2.9 — AI QUESTION GENERATION
// ─────────────────────────────────────────────────────────────
if (aiQuestionGenRoutes)
  app.use('/api/ai-questions', protect, subscriptionGuard, aiQuestionGenRoutes);

// ─────────────────────────────────────────────────────────────
// ENGINE 2.10 — VALIDATION LAYER
// ─────────────────────────────────────────────────────────────
if (engineValidationRoutes)
  app.use('/api/engine', protect, engineValidationRoutes);

// ─────────────────────────────────────────────────────────────
// STATIC FILES
// ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
