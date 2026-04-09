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


// ── DOTENV FOR LOCAL DEV ONLY ────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '.env') });
}

// ── CREATE LOGS DIR IF PRODUCTION ─────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

// ── ENV VALIDATION ────────────────────────────────────────────────────────────
(function validateEnv() {
  // Always required
  const required = ['JWT_SECRET', 'PORT'];

  // In production, we need either DATABASE_URL (Render linked PG)
  // or all individual DB_* vars (manual setup)
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && !process.env.DATABASE_URL) {
    required.push('DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER');
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
})();

// ── EXPRESS APP ───────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// ── SERVE REACT STATIC FILES (LOCAL/NGROK ONLY) ─────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  console.log('✅ Serving React frontend from client/dist');
} else {
  console.log('ℹ️  client/dist not found — expecting separate frontend service (Render Static Site)');
}

// ── CORE MIDDLEWARE ───────────────────────────────────────────────────────────
app.use(requestId);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(globalLimiter);

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  // Production frontend — always allowed regardless of env vars
  'https://aischoolonair.onrender.com',
  process.env.CLIENT_URL,
  process.env.PROD_CLIENT_URL,
  process.env.NGROK_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      logger.warn('CORS rejected origin', { origin });
      cb(new Error('CORS blocked'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ── DATABASE ──────────────────────────────────────────────────────────────────
const db = require('./config/database');

// Import all models so Sequelize registers them before sync runs.
// Add any additional models your project has to this list.
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

for (const modelPath of modelPaths) {
  try {
    const modelExport = require(modelPath);
    // Some models export a factory function (sequelize) => Model
    // Others (like User) self-register by importing the db instance directly.
    // Call factory functions so they register with Sequelize.
    if (typeof modelExport === 'function' && modelExport.length === 1) {
      modelExport(db);
    }
  } catch (e) {
    logger.warn(`Model not found or failed to load, skipping: ${modelPath} — ${e.message}`);
  }
}

// Load associations if you have a central associations file
try {
  require('./models/associations');
} catch (e) {
  // No associations file — that's fine
}

async function initDatabase() {
  try {
    await db.authenticate();
    logger.info('✅ DB connected');

    // ── One-time migration: fix teacher_id column type mismatch ──────────────
    // The TeacherSubject model defines teacher_id as INTEGER, but the column
    // may have been created earlier as TEXT/VARCHAR. Postgres won't cast it
    // automatically, so we do it explicitly here before alter-sync runs.
    //
    // This is a no-op after the first successful run:
    //   • If the column is already INTEGER  → ALTER throws, caught silently.
    //   • If the table doesn't exist yet    → ALTER throws, caught silently.
    //   • If the data cannot be cast        → ALTER throws; fix bad rows first.
    try {
      await db.query(`
        ALTER TABLE teacher_subjects
        ALTER COLUMN teacher_id TYPE INTEGER
        USING teacher_id::INTEGER;
      `);
      logger.info('✅ teacher_subjects.teacher_id cast to INTEGER');
    } catch (migrationErr) {
      // Already INTEGER, table absent, or no rows to cast — all safe to ignore.
      logger.info('ℹ️  teacher_id migration skipped: ' + migrationErr.message);
    }

    // alter: true — safely creates missing tables and adds missing columns
    // without dropping existing data.
    // Never use force: true in production — it wipes all tables.
    await db.sync({ alter: true });
    logger.info('✅ DB tables synced');
  } catch (err) {
    logger.error('❌ DB initialisation failed', { error: err.message });
    // Exit so Render auto-restarts the service and retries the connection.
    process.exit(1);
  }
}

initDatabase();

// ── AUTH & SUBSCRIPTION MIDDLEWARE ───────────────────────────────────────────
const { protect } = require('./middleware/auth');
let subscriptionGuard = (_req, _res, next) => next();
try {
  subscriptionGuard = require('./middleware/subscriptionGuard');
} catch {}

// ── ROUTES ───────────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/authRoutes');
const aiRoutes          = require('./routes/aiRoutes');
const adminRoutes       = require('./routes/adminRoutes');
const teacherRoutes     = require('./routes/teacherRoutes');
const userRoutes        = require('./routes/users');
const examBoardsRoutes  = require('./routes/examBoardsRoutes');
const subjectRoutes     = require('./routes/subjects');
const topicsRoutes      = require('./routes/topicsRoutes');
const subtopicRoutes    = require('./routes/subtopicRoutes');
const resourceRoutes    = require('./routes/resourceRoutes');
const coursesRoutes     = require('./routes/courses');
const enrollmentsRoutes = require('./routes/enrollments');
const quizzesRoutes     = require('./routes/quizzes');
const questionsRoutes   = require('./routes/questionsRoutes');
const analyticsRoutes   = require('./routes/analyticsRoutes');
const notesRoutes       = require('./routes/notesRoutes');
const videosRoutes      = require('./routes/videosRoutes');
const pastPaperRoutes   = require('./routes/pastPaperRoutes');
const paymentRoutes     = require('./routes/paymentRoutes');
const catalogRoutes     = require('./routes/catalogRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');
const studentRoutes     = require('./routes/studentRoutes');
const conceptRoutes     = require('./routes/conceptRoutes');
const curriculumRoutes = require('./routes/curriculumRoutes');

// Optional routes — skip if file missing
let aiChatRoute         = null;
let quizGeneratorRoute  = null;
let studyPlannerRoute   = null;
let explanationRoute    = null;
let examTypeActivation  = null;
let analyticsLegacy     = null;

try { aiChatRoute        = require('./routes/aiChatRoute');        } catch {}
try { quizGeneratorRoute = require('./routes/quizGeneratorRoute'); } catch {}
try { studyPlannerRoute  = require('./routes/studyPlannerRoute');  } catch {}
try { explanationRoute   = require('./routes/explanationRoute');   } catch {}
try { examTypeActivation = require('./routes/examTypeActivation'); } catch {}
try { analyticsLegacy    = require('./routes/analytics');          } catch {}

// ── Serve uploaded files (resources, videos) ─────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Public routes ─────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/exam-boards', examBoardsRoutes);
app.use('/api/curriculum', curriculumRoutes);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/ai', protect, subscriptionGuard, aiLimiter, aiRoutes);
if (aiChatRoute)        app.use('/api/ai',             protect, subscriptionGuard, aiLimiter, aiChatRoute);
if (quizGeneratorRoute) app.use('/api/quiz-generator',  protect, quizGeneratorRoute);
if (studyPlannerRoute)  app.use('/api/study-planner',   protect, studyPlannerRoute);
if (explanationRoute)   app.use('/api/explanations',    protect, explanationRoute);
if (examTypeActivation) app.use('/api/exam-types',      protect, examTypeActivation);
if (analyticsLegacy)    app.use('/api/analytics',       protect, analyticsLegacy);

app.use('/api/admin',         protect, adminRoutes);
app.use('/api/teacher',       protect, teacherRoutes);
app.use('/api/users',         protect, userRoutes);
app.use('/api/subjects',      protect, subjectRoutes);
app.use('/api/topics',        protect, topicsRoutes);
app.use('/api/subtopics',     protect, subtopicRoutes);
app.use('/api/resources',     protect, resourceRoutes);
app.use('/api/courses',       protect, coursesRoutes);
app.use('/api/enrollments',   protect, enrollmentsRoutes);
app.use('/api/quizzes',       protect, quizzesRoutes);
app.use('/api/questions',     protect, questionsRoutes);
app.use('/api/analytics',     protect, analyticsRoutes);
app.use('/api/notes',         protect, notesRoutes);
app.use('/api/videos',        protect, videosRoutes);
app.use('/api/past-papers',   protect, pastPaperRoutes);
app.use('/api/payments',      protect, paymentRoutes);
app.use('/api/catalog',       protect, catalogRoutes);
app.use('/api/notifications', protect, notificationsRoutes);
app.use('/api/students',      protect, studentRoutes);
app.use('/api/concepts',      protect, conceptRoutes);

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'Server running' });
});

// ── SPA CATCH-ALL (local/ngrok only) ─────────────────────────────────────────
if (fs.existsSync(clientDist)) {
  app.get('*', (_req, res) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Local:  http://localhost:${PORT}`);
});
